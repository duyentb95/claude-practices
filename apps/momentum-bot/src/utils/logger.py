"""Structured logging setup using structlog.

Provides colourful dev-friendly console output by default, and JSON-lines
output when ``json_format=True`` for production log aggregation.

Includes a ring-buffer collector so logs can be served via the dashboard API.
"""

from __future__ import annotations

import collections
import logging
import sys
import time
from typing import Any

import structlog


# ---------------------------------------------------------------------------
# Ring-buffer log collector
# ---------------------------------------------------------------------------

MAX_LOG_ENTRIES = 500


class LogCollector:
    """Thread-safe ring buffer that stores recent log entries as dicts."""

    def __init__(self, maxlen: int = MAX_LOG_ENTRIES) -> None:
        self._buffer: collections.deque[dict[str, Any]] = collections.deque(maxlen=maxlen)

    def append(self, entry: dict[str, Any]) -> None:
        self._buffer.append(entry)

    def get_entries(self, limit: int = 200) -> list[dict[str, Any]]:
        """Return the most recent *limit* entries, newest first."""
        items = list(self._buffer)
        return list(reversed(items[-limit:]))

    def __len__(self) -> int:
        return len(self._buffer)


# Global singleton — imported by server.py to expose via API.
log_collector = LogCollector()


def _collect_log_processor(
    logger: Any, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """structlog processor that copies each event into the ring buffer."""
    entry = {
        "timestamp": event_dict.get("timestamp", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())),
        "level": event_dict.get("log_level", method_name).upper(),
        "event": event_dict.get("event", ""),
        "module": event_dict.get("module", ""),
        "func": event_dict.get("func_name", ""),
    }
    # Capture exception info if present (from log.exception() calls)
    exc_info = event_dict.get("exc_info")
    if exc_info:
        import traceback as tb_mod
        if isinstance(exc_info, BaseException):
            entry["error"] = f"{type(exc_info).__name__}: {exc_info}"
            entry["traceback"] = "".join(tb_mod.format_exception(type(exc_info), exc_info, exc_info.__traceback__))
        elif isinstance(exc_info, tuple) and len(exc_info) == 3:
            entry["error"] = f"{exc_info[0].__name__}: {exc_info[1]}" if exc_info[0] else str(exc_info[1])
            entry["traceback"] = "".join(tb_mod.format_exception(*exc_info))
        elif exc_info is True:
            import sys
            ei = sys.exc_info()
            if ei[0] is not None:
                entry["error"] = f"{ei[0].__name__}: {ei[1]}"
                entry["traceback"] = "".join(tb_mod.format_exception(*ei))
    # Capture extra kwargs (coin, pnl, error, etc.)
    skip = {"timestamp", "log_level", "event", "module", "func_name", "lineno",
            "_record", "_from_stdlib", "exc_info", "stack_info"}
    extras = {k: v for k, v in event_dict.items() if k not in skip}
    if extras:
        entry["extra"] = extras
    log_collector.append(entry)
    return event_dict


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------


def setup_logging(log_level: str = "INFO", json_format: bool = False) -> None:
    """Configure structlog with console + optional JSON output.

    Args:
        log_level: Standard Python log level name (DEBUG, INFO, WARNING, etc.).
        json_format: When ``True``, emit JSON-lines output suitable for
            log aggregation systems.  When ``False`` (default), use a
            colourful, developer-friendly console renderer.
    """
    level = getattr(logging, log_level.upper(), logging.INFO)

    # Shared processors applied before the final renderer.
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.CallsiteParameterAdder(
            parameters=[
                structlog.processors.CallsiteParameter.MODULE,
                structlog.processors.CallsiteParameter.FUNC_NAME,
                structlog.processors.CallsiteParameter.LINENO,
            ],
        ),
    ]

    if json_format:
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=sys.stderr.isatty())

    structlog.configure(
        processors=[
            *shared_processors,
            _collect_log_processor,
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stderr),
        cache_logger_on_first_use=True,
    )

    # Also configure stdlib logging so third-party libraries respect the level.
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stderr,
        level=level,
        force=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Get a bound logger with the given module name.

    Args:
        name: Typically ``__name__`` of the calling module.

    Returns:
        A structlog bound logger instance.
    """
    logger: Any = structlog.get_logger(name)
    return logger  # type: ignore[return-value]
