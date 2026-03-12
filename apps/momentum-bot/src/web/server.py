"""Web server providing REST API + dashboard for the momentum bot."""

from __future__ import annotations

import json
import os
import time
from dataclasses import asdict, dataclass, field
from typing import TYPE_CHECKING, Any, Awaitable, Callable

from aiohttp import web

if TYPE_CHECKING:
    from src.config import AppConfig
    from src.data.candle_store import CandleStore
    from src.strategy.models import ManagedPosition, Signal

import structlog

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# BotState — single object the server reads to expose bot internals
# ---------------------------------------------------------------------------

_SECRETS = frozenset({"hl_private_key"})

DEFAULT_PORT = 8080


@dataclass
class BotState:
    """Shared state object passed from the bot to the dashboard server.

    All fields are read by the web handlers.  Mutation goes through the
    provided async callbacks only.
    """

    config: AppConfig
    dry_run: bool
    started_at: float  # time.time() epoch seconds
    positions: dict[str, ManagedPosition]  # coin -> active position
    closed_positions: list[ManagedPosition]  # history of closed trades
    signals: list[Signal]  # recent signals, capped by caller
    subscribed_coins: set[str]
    candle_store: CandleStore
    open_orders: list[dict[str, Any]] = field(default_factory=list)
    recent_fills: list[dict[str, Any]] = field(default_factory=list)

    # Async callbacks for mutating state ----------------------------------
    update_config: Callable[[dict[str, Any]], Awaitable[None]] | None = None
    emergency_close: Callable[[], Awaitable[None]] | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _json_response(data: Any, status: int = 200) -> web.Response:
    """Return a JSON response with CORS headers."""
    body = json.dumps(data, default=str)
    return web.Response(
        text=body,
        status=status,
        content_type="application/json",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    )


def _error_response(message: str, status: int = 500) -> web.Response:
    return _json_response({"error": message}, status=status)


def _position_to_dict(pos: ManagedPosition) -> dict[str, Any]:
    """Serialise a ManagedPosition to a JSON-friendly dict."""
    now_ms = int(time.time() * 1000)
    duration = (
        (pos.exit_time - pos.entry_time) / 1000
        if pos.exit_time
        else (now_ms - pos.entry_time) / 1000
    )

    risk = abs(pos.entry_price - (pos.signal.stop_loss if pos.signal else pos.stop_loss))
    r_multiple = 0.0
    if risk > 0 and pos.entry_price > 0:
        if pos.is_long:
            current_move = (pos.highest_price - pos.entry_price)
        else:
            current_move = (pos.entry_price - pos.lowest_price)
        r_multiple = round(current_move / risk, 2)

    return {
        "coin": pos.coin,
        "direction": pos.direction.value,
        "entry_price": pos.entry_price,
        "size": pos.size,
        "notional_usd": pos.notional_usd,
        "stop_loss": pos.stop_loss,
        "take_profit": pos.take_profit,
        "trailing_stop": pos.trailing_stop,
        "entry_time": pos.entry_time,
        "exit_time": pos.exit_time or None,
        "exit_price": pos.exit_price or None,
        "exit_reason": pos.exit_reason.value if pos.exit_reason else None,
        "pnl": round(pos.pnl, 4),
        "pnl_pct": round(pos.pnl_pct, 2),
        "leverage": pos.leverage,
        "regime_score": pos.signal.regime_score if pos.signal else 0,
        "status": pos.status.value,
        "duration_seconds": round(duration, 1),
        "r_multiple": r_multiple,
    }


def _signal_to_dict(sig: Signal) -> dict[str, Any]:
    """Serialise a Signal to a JSON-friendly dict."""
    return {
        "coin": sig.coin,
        "direction": sig.direction.value,
        "entry_price": sig.entry_price,
        "stop_loss": sig.stop_loss,
        "take_profit": sig.take_profit,
        "rr_ratio": round(sig.rr_ratio, 2),
        "regime_score": sig.regime_score,
        "staircase_score": round(sig.staircase_score, 2),
        "volume_score": round(sig.volume_score, 2),
        "confidence": round(sig.confidence, 1),
        "timestamp": sig.timestamp,
    }


def _safe_config_dict(config: AppConfig) -> dict[str, Any]:
    """Dump config to dict, stripping secret fields."""
    data = config.model_dump()
    for key in _SECRETS:
        data.pop(key, None)
    return data


# ---------------------------------------------------------------------------
# DashboardServer
# ---------------------------------------------------------------------------


class DashboardServer:
    """aiohttp-based REST API and dashboard server for the momentum bot.

    Usage::

        server = DashboardServer(bot_state)
        await server.start()   # non-blocking, runs in background
        ...
        await server.stop()
    """

    def __init__(self, state: BotState, port: int | None = None) -> None:
        self._state = state
        self._port = port or int(
            os.getenv("DASHBOARD_PORT") or os.getenv("PORT") or str(DEFAULT_PORT)
        )
        self._app = web.Application(middlewares=[self._error_middleware])
        self._runner: web.AppRunner | None = None
        self._setup_routes()

    # ------------------------------------------------------------------
    # Middleware
    # ------------------------------------------------------------------

    @web.middleware
    async def _error_middleware(
        self,
        request: web.Request,
        handler: Callable[[web.Request], Awaitable[web.StreamResponse]],
    ) -> web.StreamResponse:
        """Catch unhandled exceptions and return structured JSON errors."""
        if request.method == "OPTIONS":
            return _json_response({})
        try:
            return await handler(request)
        except web.HTTPException:
            raise
        except Exception as exc:
            logger.exception("unhandled_request_error", path=request.path)
            return _error_response(str(exc), status=500)

    # ------------------------------------------------------------------
    # Route setup
    # ------------------------------------------------------------------

    def _setup_routes(self) -> None:
        self._app.router.add_get("/", self._handle_dashboard)
        self._app.router.add_get("/api/status", self._handle_status)
        self._app.router.add_get("/api/positions", self._handle_positions)
        self._app.router.add_get("/api/orders", self._handle_orders)
        self._app.router.add_get("/api/fills", self._handle_fills)
        self._app.router.add_get("/api/history", self._handle_history)
        self._app.router.add_get("/api/signals", self._handle_signals)
        self._app.router.add_get("/api/logs", self._handle_logs)
        self._app.router.add_get("/api/config", self._handle_get_config)
        self._app.router.add_post("/api/config", self._handle_update_config)
        self._app.router.add_post("/api/emergency-close", self._handle_emergency_close)
        # CORS preflight for POST endpoints
        self._app.router.add_route("OPTIONS", "/api/config", self._handle_options)
        self._app.router.add_route("OPTIONS", "/api/emergency-close", self._handle_options)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Start the web server as a background task (non-blocking)."""
        self._runner = web.AppRunner(self._app)
        await self._runner.setup()
        site = web.TCPSite(self._runner, "0.0.0.0", self._port)
        await site.start()
        logger.info("dashboard_server_started", port=self._port)

    async def stop(self) -> None:
        """Gracefully shut down the web server."""
        if self._runner is not None:
            await self._runner.cleanup()
            self._runner = None
            logger.info("dashboard_server_stopped")

    # ------------------------------------------------------------------
    # Handlers
    # ------------------------------------------------------------------

    async def _handle_options(self, _request: web.Request) -> web.Response:
        """Handle CORS preflight requests."""
        return _json_response({})

    async def _handle_dashboard(self, _request: web.Request) -> web.Response:
        """Serve full Copin-styled HTML dashboard at GET /."""
        from src.web.dashboard import DASHBOARD_HTML

        return web.Response(text=DASHBOARD_HTML, content_type="text/html")

    async def _handle_status(self, _request: web.Request) -> web.Response:
        """GET /api/status -- bot runtime status."""
        state = self._state
        uptime = time.time() - state.started_at

        return _json_response(
            {
                "running": True,
                "dry_run": state.dry_run,
                "testnet": state.config.hl_testnet,
                "uptime_seconds": round(uptime, 1),
                "account_address": state.config.hl_account_address,
                "scan_interval": state.config.scanner.scan_interval_seconds,
                "subscribed_coins": sorted(state.subscribed_coins),
                "candle_store_depths": state.candle_store.snapshot_depths(),
            }
        )

    async def _handle_positions(self, _request: web.Request) -> web.Response:
        """GET /api/positions -- open positions with unrealized PnL."""
        from src.strategy.models import PositionStatus

        open_positions = [
            pos
            for pos in self._state.positions.values()
            if pos.status == PositionStatus.OPEN
        ]
        serialized = [_position_to_dict(p) for p in open_positions]
        total_pnl = sum(p.unrealized_pnl for p in open_positions)

        return _json_response(
            {
                "positions": serialized,
                "total_unrealized_pnl": round(total_pnl, 4),
            }
        )

    async def _handle_orders(self, _request: web.Request) -> web.Response:
        """GET /api/orders -- open orders from executor."""
        return _json_response({"orders": list(self._state.open_orders)})

    async def _handle_fills(self, _request: web.Request) -> web.Response:
        """GET /api/fills -- recent order fills."""
        return _json_response({"fills": list(self._state.recent_fills)})

    async def _handle_history(self, _request: web.Request) -> web.Response:
        """GET /api/history -- closed position history with aggregate stats."""
        closed = self._state.closed_positions
        serialized = [_position_to_dict(p) for p in closed]
        total_pnl = sum(p.pnl for p in closed)
        wins = sum(1 for p in closed if p.pnl >= 0)
        total = len(closed)
        win_rate = round((wins / total * 100), 1) if total > 0 else 0.0

        return _json_response(
            {
                "history": serialized,
                "total_realized_pnl": round(total_pnl, 4),
                "win_rate": win_rate,
                "total_trades": total,
            }
        )

    async def _handle_signals(self, _request: web.Request) -> web.Response:
        """GET /api/signals -- last 50 signals generated."""
        recent = self._state.signals[-50:]
        return _json_response(
            {"signals": [_signal_to_dict(s) for s in reversed(recent)]}
        )

    async def _handle_logs(self, request: web.Request) -> web.Response:
        """GET /api/logs -- recent activity logs from the ring buffer."""
        from src.utils.logger import log_collector

        limit = int(request.query.get("limit", "200"))
        level = request.query.get("level", "").upper()
        entries = log_collector.get_entries(limit=min(limit, 500))
        if level:
            entries = [e for e in entries if e.get("level") == level]
        return _json_response({"logs": entries, "total": len(log_collector)})

    async def _handle_get_config(self, _request: web.Request) -> web.Response:
        """GET /api/config -- current config without secrets."""
        return _json_response(_safe_config_dict(self._state.config))

    async def _handle_update_config(self, request: web.Request) -> web.Response:
        """POST /api/config -- partial config update.

        Accepts a JSON body with one or more config section keys
        (``risk``, ``strategy``, ``scanner``, ``alerts``).  Secret fields
        are rejected.
        """
        if self._state.update_config is None:
            return _error_response("Config updates not supported", status=501)

        try:
            body = await request.json()
        except Exception:
            return _error_response("Invalid JSON body", status=400)

        if not isinstance(body, dict):
            return _error_response("Request body must be a JSON object", status=400)

        # Reject any attempt to set secret fields.
        for key in _SECRETS:
            if key in body:
                return _error_response(
                    f"Cannot set secret field '{key}' via API", status=400
                )

        allowed_sections = {"risk", "strategy", "scanner", "alerts", "account"}
        unknown = set(body.keys()) - allowed_sections
        if unknown:
            return _error_response(
                f"Unknown config sections: {sorted(unknown)}", status=400
            )

        try:
            await self._state.update_config(body)
        except Exception as exc:
            logger.exception("config_update_failed")
            return _error_response(f"Config update failed: {exc}", status=422)

        logger.info("config_updated_via_api", sections=list(body.keys()))
        return _json_response(
            {
                "ok": True,
                "updated_sections": list(body.keys()),
                "config": _safe_config_dict(self._state.config),
            }
        )

    async def _handle_emergency_close(self, _request: web.Request) -> web.Response:
        """POST /api/emergency-close -- close all open positions at market."""
        if self._state.emergency_close is None:
            return _error_response("Emergency close not available", status=501)

        try:
            await self._state.emergency_close()
        except Exception as exc:
            logger.exception("emergency_close_failed")
            return _error_response(f"Emergency close failed: {exc}", status=500)

        logger.warning("emergency_close_triggered_via_api")
        return _json_response(
            {
                "ok": True,
                "message": "Emergency close triggered. All positions will be closed at market.",
            }
        )
