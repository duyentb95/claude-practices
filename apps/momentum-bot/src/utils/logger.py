"""Structured logging setup using structlog.

Provides colourful dev-friendly console output by default, and JSON-lines
output when ``json_format=True`` for production log aggregation.
"""

from __future__ import annotations

import logging
import sys
from typing import Any

import structlog


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
