"""Momentum Breakout Trading Bot for Hyperliquid.

Usage:
    python -m src.main                    # Run with default config (dry-run)
    python -m src.main --dry-run          # Dry-run mode (log signals, no orders)
    python -m src.main --no-dry-run       # Live trading
    python -m src.main --config config/production.yaml
"""

from __future__ import annotations

import argparse
import asyncio
import collections
import signal
import time
from pathlib import Path
from typing import Any

from src.alerts.lark import LarkAlerter
from src.alerts.telegram import TelegramAlerter
from src.config import AppConfig, load_config
from src.data.candle_store import CandleStore
from src.data.hl_info import HyperliquidInfoPoller
from src.data.market_scanner import MarketScanner
from src.execution.executor import HyperliquidExecutor
from src.execution.risk_mgr import RiskManager
from src.strategy.models import (
    ManagedPosition,
    PositionStatus,
    Signal,
    SignalDirection,
)
from src.utils.logger import get_logger, setup_logging
from src.web.server import BotState, DashboardServer

log = get_logger(__name__)


class MomentumBot:
    """Main bot orchestrator.

    Coordinates the data feeder, candle store, screener, strategy engine,
    position manager, risk manager, and alert channels.
    """

    def __init__(self, config: AppConfig, dry_run: bool = False) -> None:
        self.config = config
        self.dry_run = dry_run
        self._running = False

        # Core components.
        self.candle_store = CandleStore(max_candles=1500)

        # Alert channels.
        self.lark = LarkAlerter(webhook_url=config.lark_webhook_url or None)
        self.telegram = TelegramAlerter(
            bot_token=config.telegram_bot_token or None,
            chat_id=config.telegram_chat_id or None,
        )

        # Active positions tracked by the bot.
        self._positions: dict[str, ManagedPosition] = {}

        # Closed position history + recent signals (for dashboard).
        self._closed_positions: list[ManagedPosition] = []
        self._signals: list[Signal] = []

        # Subscribed coins for candle data.
        self._subscribed_coins: set[str] = set()

        # Scanner terminal events (shared ring buffer).
        self._scanner_events: collections.deque = collections.deque(maxlen=300)

        # Market scanner.
        self._market_scanner = MarketScanner(
            scanner_events=self._scanner_events,
            min_24h_volume_usd=float(config.scanner.min_24h_volume_usd),
            top_n=config.scanner.top_n_candidates,
        )

        # Shared containers for Hyperliquid live data.
        self._account_summary: dict[str, Any] = {}
        self._hl_positions: list[dict[str, Any]] = []
        self._open_orders: list[dict[str, Any]] = []
        self._recent_fills: list[dict[str, Any]] = []
        self._historical_orders: list[dict[str, Any]] = []

        # Hyperliquid info poller.
        self._hl_poller = HyperliquidInfoPoller(
            account_address=config.hl_account_address,
            account_summary=self._account_summary,
            hl_positions=self._hl_positions,
            open_orders=self._open_orders,
            recent_fills=self._recent_fills,
            historical_orders=self._historical_orders,
        )

        # Execution layer (only when credentials available and not dry-run).
        self._executor: HyperliquidExecutor | None = None
        self._risk_mgr: RiskManager | None = None
        if config.hl_private_key and config.hl_account_address:
            try:
                self._executor = HyperliquidExecutor(
                    private_key=config.hl_private_key,
                    account_address=config.hl_account_address,
                    testnet=config.hl_testnet,
                )
                self._risk_mgr = RiskManager(
                    executor=self._executor,
                    config=config.risk,
                )
                log.info("executor_ready", testnet=config.hl_testnet)
            except Exception:
                log.exception("executor_init_failed")
                self._executor = None
                self._risk_mgr = None
        else:
            log.warning("no_credentials", msg="HL_PRIVATE_KEY or HL_ACCOUNT_ADDRESS not set — dry-run only")

        # Dashboard web server.
        self._dashboard: DashboardServer | None = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Start the bot: connect WS, begin scanning and position loops.

        Runs until a SIGINT / SIGTERM is received or ``stop()`` is called.
        """
        self._running = True

        log.info(
            "bot_starting",
            dry_run=self.dry_run,
            testnet=self.config.hl_testnet,
            scan_interval=self.config.scanner.scan_interval_seconds,
            max_positions=self.config.risk.max_concurrent_positions,
            executor="ready" if self._executor else "none",
        )

        # Initialize risk manager (fetch initial equity).
        if self._risk_mgr and not self.dry_run:
            try:
                await self._risk_mgr.initialise()
                log.info("risk_mgr_ready", equity=self._risk_mgr.initial_equity)
            except Exception:
                log.exception("risk_mgr_init_failed")

        # Install signal handlers for graceful shutdown.
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, lambda: asyncio.ensure_future(self.stop()))

        # Start the dashboard web server.
        bot_state = BotState(
            config=self.config,
            dry_run=self.dry_run,
            started_at=time.time(),
            positions=self._positions,
            closed_positions=self._closed_positions,
            signals=self._signals,
            subscribed_coins=self._subscribed_coins,
            candle_store=self.candle_store,
            account_summary=self._account_summary,
            hl_positions=self._hl_positions,
            open_orders=self._open_orders,
            recent_fills=self._recent_fills,
            historical_orders=self._historical_orders,
            scanner_events=self._scanner_events,
            update_config=self._apply_config_update,
            emergency_close=self._emergency_close_all,
        )
        self._dashboard = DashboardServer(bot_state)
        await self._dashboard.start()

        # Run the scanning, position management, and data poller loops concurrently.
        try:
            async with asyncio.TaskGroup() as tg:
                tg.create_task(self._hl_poller.run(), name="hl_info_poller")
                tg.create_task(self.scan_loop(), name="scan_loop")
                tg.create_task(self.position_loop(), name="position_loop")
        except* asyncio.CancelledError:
            log.info("bot_loops_cancelled")
        finally:
            if self._dashboard:
                await self._dashboard.stop()
            self._running = False
            log.info("bot_stopped")

    async def stop(self) -> None:
        """Signal the bot to stop gracefully."""
        log.info("bot_stop_requested")
        self._running = False

        # Cancel all running tasks in the current task group.
        current = asyncio.current_task()
        for task in asyncio.all_tasks():
            if task is not current and not task.done():
                task.cancel()

    # ------------------------------------------------------------------
    # Main loops
    # ------------------------------------------------------------------

    async def scan_loop(self) -> None:
        """Periodic coin scanning and signal generation.

        Runs every ``config.scanner.scan_interval_seconds`` seconds.
        """
        interval = self.config.scanner.scan_interval_seconds

        while self._running:
            try:
                await self._run_scan_cycle()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("scan_loop_error")

            await asyncio.sleep(interval)

    async def position_loop(self) -> None:
        """Monitor open positions: trailing stop-loss updates, timeouts.

        Runs every 1 second.
        """
        while self._running:
            try:
                await self._update_positions()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("position_loop_error")

            await asyncio.sleep(1)

    # ------------------------------------------------------------------
    # Scan cycle
    # ------------------------------------------------------------------

    async def _run_scan_cycle(self) -> None:
        """Execute a single scan cycle.

        Steps:
        1. Fetch market data via MarketScanner (metaAndAssetCtxs).
        2. Screen and rank coins by momentum, volume, OI.
        3. Convert SIGNAL candidates into Signal objects.
        4. Feed signals through on_signal() for risk checks and execution.
        """
        try:
            signal_candidates = await self._market_scanner.run_scan()
            log.info(
                "scan_cycle",
                signals=len(signal_candidates),
                open_positions=len(self._positions),
            )

            # Convert scanner candidates into trading signals
            for c in signal_candidates:
                # Skip coins we already have positions in
                if c["coin"] in self._positions:
                    log.info("skip_existing_position", coin=c["coin"])
                    continue

                # Calculate SL/TP from price-based percentage approach
                price = c["price"]
                if price <= 0:
                    continue

                direction = SignalDirection.LONG if c["direction"] == "LONG" else SignalDirection.SHORT
                # SL distance: 2% of entry price (configurable via risk config)
                sl_pct = self.config.risk.max_risk_per_trade_pct  # default 2%
                sl_distance = price * sl_pct

                if direction == SignalDirection.LONG:
                    sl_price = price - sl_distance
                    tp_price = price + sl_distance * self.config.strategy.targets.default_rr
                else:
                    sl_price = price + sl_distance
                    tp_price = price - sl_distance * self.config.strategy.targets.default_rr

                signal_obj = Signal(
                    coin=c["coin"],
                    direction=direction,
                    entry_price=round(price, 6),
                    stop_loss=round(sl_price, 6),
                    take_profit=round(tp_price, 6),
                    regime_score=max(2, int(c.get("score", 0) / 20)),  # map 0-100 to 0-5
                    timestamp=int(time.time() * 1000),
                    staircase_score=c.get("score", 0),
                    volume_score=c.get("score", 0),
                    confidence=c.get("score", 0),
                )

                await self.on_signal(signal_obj)

        except Exception:
            log.exception("market_scanner_error")

    # ------------------------------------------------------------------
    # Signal handling
    # ------------------------------------------------------------------

    async def _apply_config_update(self, updates: dict) -> None:
        """Apply partial config update from the dashboard.

        Supports nested updates like:
            {"risk": {"max_leverage": 5}, "strategy": {"staircase": {"min_lookback_candles": 60}}}
        """
        def _apply(target: Any, values: dict) -> None:
            for key, val in values.items():
                if isinstance(val, dict):
                    # Recurse into nested sub-section
                    sub = getattr(target, key, None)
                    if sub is not None:
                        _apply(sub, val)
                elif hasattr(target, key):
                    setattr(target, key, val)

        for section, values in updates.items():
            target = getattr(self.config, section, None)
            if target is None:
                continue
            if isinstance(values, dict):
                _apply(target, values)
        log.info("config_updated_via_dashboard", sections=list(updates.keys()))

    async def _emergency_close_all(self) -> None:
        """Emergency close all positions (called from dashboard)."""
        log.warning("emergency_close_triggered")
        coins = list(self._positions.keys())
        for coin in coins:
            pos = self._positions[coin]
            latest = self.candle_store.get_latest(coin)
            price = latest.close if latest else pos.entry_price
            await self._close_position(pos, price, "MANUAL")
        for coin in coins:
            self._positions.pop(coin, None)

    async def on_signal(self, signal_obj: Signal) -> None:
        """Handle a new trading signal.

        In dry-run mode the signal is logged but no orders are placed.
        In live mode, size the position, place orders, and set SL/TP.
        """
        # Track signal for dashboard (cap at 100).
        self._signals.append(signal_obj)
        if len(self._signals) > 100:
            self._signals.pop(0)

        log.info(
            "signal_generated",
            coin=signal_obj.coin,
            direction=signal_obj.direction.value,
            entry=signal_obj.entry_price,
            sl=signal_obj.stop_loss,
            tp=signal_obj.take_profit,
            rr=round(signal_obj.rr_ratio, 2),
            confidence=round(signal_obj.confidence, 1),
        )

        # Risk checks.
        if len(self._positions) >= self.config.risk.max_concurrent_positions:
            log.warning("max_positions_reached", current=len(self._positions))
            return

        if signal_obj.rr_ratio < self.config.risk.min_rr_ratio:
            log.info(
                "signal_rejected_low_rr",
                rr=signal_obj.rr_ratio,
                min_rr=self.config.risk.min_rr_ratio,
            )
            return

        if self.dry_run:
            log.info(
                "dry_run_signal",
                coin=signal_obj.coin,
                direction=signal_obj.direction.value,
                entry=signal_obj.entry_price,
                sl=signal_obj.stop_loss,
                tp=signal_obj.take_profit,
            )
            # Track as virtual position for dashboard visibility
            position = ManagedPosition(
                coin=signal_obj.coin,
                direction=signal_obj.direction,
                entry_price=signal_obj.entry_price,
                size=0.0,
                notional_usd=0.0,
                stop_loss=signal_obj.stop_loss,
                take_profit=signal_obj.take_profit,
                entry_time=signal_obj.timestamp,
                signal=signal_obj,
                leverage=self.config.risk.max_leverage,
            )
            self._positions[signal_obj.coin] = position
            return

        # --- Live execution ---
        if self._executor is None:
            log.error("no_executor", msg="Cannot place orders — no credentials configured")
            return

        # Risk manager pre-trade check
        if self._risk_mgr:
            can_trade, reason = self._risk_mgr.can_open_trade(len(self._positions))
            if not can_trade:
                log.warning("risk_rejected", reason=reason)
                return

        # Calculate position size
        equity = float(self._account_summary.get("account_value", 0))
        if equity <= 0:
            try:
                equity = await self._executor.get_equity()
            except Exception:
                log.exception("get_equity_failed")
                return

        if equity < self.config.risk.min_account_balance:
            log.warning("low_balance", equity=equity, min=self.config.risk.min_account_balance)
            return

        if self._risk_mgr:
            size = self._risk_mgr.calculate_position_size(
                equity=equity,
                entry_price=signal_obj.entry_price,
                sl_price=signal_obj.stop_loss,
            )
        else:
            # Fallback: 2% risk sizing
            sl_dist_pct = abs(signal_obj.entry_price - signal_obj.stop_loss) / signal_obj.entry_price
            risk_amount = equity * self.config.risk.max_risk_per_trade_pct
            notional = risk_amount / sl_dist_pct if sl_dist_pct > 0 else 0
            size = notional / signal_obj.entry_price if signal_obj.entry_price > 0 else 0

        if size <= 0:
            log.warning("zero_size", coin=signal_obj.coin)
            return

        notional_usd = size * signal_obj.entry_price
        is_buy = signal_obj.direction == SignalDirection.LONG

        log.info(
            "placing_order",
            coin=signal_obj.coin,
            direction=signal_obj.direction.value,
            size=round(size, 6),
            notional=round(notional_usd, 2),
            entry=signal_obj.entry_price,
            sl=signal_obj.stop_loss,
            tp=signal_obj.take_profit,
        )

        try:
            # 1. Entry order (market)
            entry_result = await self._executor.place_market_order(
                coin=signal_obj.coin,
                is_buy=is_buy,
                size=size,
            )
            log.info("entry_order_placed", coin=signal_obj.coin, result=entry_result)

            # 2. Stop-loss (reduce-only trigger)
            close_is_buy = not is_buy
            sl_result = await self._executor.set_stop_loss(
                coin=signal_obj.coin,
                is_buy=close_is_buy,
                trigger_price=signal_obj.stop_loss,
                size=size,
            )
            log.info("sl_order_placed", coin=signal_obj.coin, result=sl_result)

            # 3. Take-profit (reduce-only trigger)
            tp_result = await self._executor.set_take_profit(
                coin=signal_obj.coin,
                is_buy=close_is_buy,
                trigger_price=signal_obj.take_profit,
                size=size,
            )
            log.info("tp_order_placed", coin=signal_obj.coin, result=tp_result)

        except Exception:
            log.exception("order_placement_failed", coin=signal_obj.coin)
            return

        # Track position
        position = ManagedPosition(
            coin=signal_obj.coin,
            direction=signal_obj.direction,
            entry_price=signal_obj.entry_price,
            size=size,
            notional_usd=notional_usd,
            stop_loss=signal_obj.stop_loss,
            take_profit=signal_obj.take_profit,
            entry_time=signal_obj.timestamp,
            signal=signal_obj,
            leverage=self.config.risk.max_leverage,
        )
        self._positions[signal_obj.coin] = position

        # Send alerts.
        await asyncio.gather(
            self.lark.send_entry_alert(signal_obj, position),
            self.telegram.send_entry_alert(signal_obj, position),
            return_exceptions=True,
        )

    # ------------------------------------------------------------------
    # Position management
    # ------------------------------------------------------------------

    async def _update_positions(self) -> None:
        """Update all managed positions: check stop-loss, trailing, timeout."""
        now_ms = int(time.time() * 1000)
        timeout_ms = self.config.strategy.stale_position_timeout_minutes * 60_000
        closed: list[str] = []

        for coin, pos in self._positions.items():
            if pos.status != PositionStatus.OPEN:
                continue

            latest = self.candle_store.get_latest(coin)
            if latest is None:
                continue

            current_price = latest.close

            # Track high-water / low-water marks for trailing stop.
            if pos.is_long:
                pos.highest_price = max(pos.highest_price, current_price)
            else:
                pos.lowest_price = min(pos.lowest_price, current_price)

            # Check timeout.
            if (now_ms - pos.entry_time) > timeout_ms > 0:
                await self._close_position(pos, current_price, "TIMEOUT")
                closed.append(coin)
                continue

            # Check stop-loss.
            if pos.is_long and current_price <= pos.stop_loss:
                await self._close_position(pos, current_price, "STOP_LOSS")
                closed.append(coin)
                continue
            if not pos.is_long and current_price >= pos.stop_loss:
                await self._close_position(pos, current_price, "STOP_LOSS")
                closed.append(coin)
                continue

            # Check take-profit.
            if pos.is_long and current_price >= pos.take_profit:
                await self._close_position(pos, current_price, "TAKE_PROFIT")
                closed.append(coin)
                continue
            if not pos.is_long and current_price <= pos.take_profit:
                await self._close_position(pos, current_price, "TAKE_PROFIT")
                closed.append(coin)
                continue

            # Update trailing stop if configured.
            self._update_trailing_stop(pos, current_price)

        for coin in closed:
            del self._positions[coin]

    def _update_trailing_stop(self, pos: ManagedPosition, current_price: float) -> None:
        """Advance the trailing stop-loss when price moves favourably."""
        targets = self.config.strategy.targets
        risk = abs(pos.entry_price - (pos.signal.stop_loss if pos.signal else pos.stop_loss))

        if risk <= 0:
            return

        trigger_price_delta = targets.trailing_trigger_r * risk
        lock_delta = targets.trailing_lock_r * risk

        if pos.is_long:
            if pos.highest_price >= pos.entry_price + trigger_price_delta:
                new_sl = pos.highest_price - lock_delta
                if new_sl > pos.stop_loss:
                    pos.stop_loss = new_sl
                    pos.trailing_stop = new_sl
        else:
            if pos.lowest_price <= pos.entry_price - trigger_price_delta:
                new_sl = pos.lowest_price + lock_delta
                if new_sl < pos.stop_loss:
                    pos.stop_loss = new_sl
                    pos.trailing_stop = new_sl

    async def _close_position(
        self,
        pos: ManagedPosition,
        exit_price: float,
        reason: str,
    ) -> None:
        """Mark a position as closed and send exit alerts."""
        if pos.is_long:
            pnl = (exit_price - pos.entry_price) * pos.size
        else:
            pnl = (pos.entry_price - exit_price) * pos.size

        pos.status = PositionStatus.CLOSED
        pos.exit_price = exit_price
        pos.exit_time = int(time.time() * 1000)
        pos.pnl = pnl
        if pos.notional_usd > 0:
            pos.pnl_pct = pnl / pos.notional_usd * 100

        # Track in closed history for dashboard.
        self._closed_positions.append(pos)

        log.info(
            "position_closed",
            coin=pos.coin,
            reason=reason,
            pnl=pnl,
            pnl_pct=pos.pnl_pct,
            entry=pos.entry_price,
            exit=exit_price,
        )

        if not self.dry_run:
            await asyncio.gather(
                self.lark.send_exit_alert(pos, exit_price, reason, pnl),
                self.telegram.send_exit_alert(pos, exit_price, reason, pnl),
                return_exceptions=True,
            )

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    def get_stats(self) -> dict[str, Any]:
        """Return a snapshot of bot statistics for the daily summary."""
        closed_today = [
            p for p in self._positions.values() if p.status == PositionStatus.CLOSED
        ]
        wins = [p for p in closed_today if p.pnl >= 0]

        return {
            "total_pnl": sum(p.pnl for p in closed_today),
            "win_rate": (len(wins) / len(closed_today) * 100) if closed_today else 0.0,
            "trades_taken": len(closed_today),
            "open_positions": sum(
                1 for p in self._positions.values() if p.status == PositionStatus.OPEN
            ),
            "account_balance": 0.0,  # Populated by execution layer.
        }


# ----------------------------------------------------------------------
# Entry point
# ----------------------------------------------------------------------


def main() -> None:
    """Parse CLI arguments and run the bot."""
    parser = argparse.ArgumentParser(
        description="Momentum Breakout Trading Bot for Hyperliquid",
    )
    parser.add_argument(
        "--dry-run",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Dry-run mode: log signals without placing orders (default: True)",
    )
    parser.add_argument(
        "--config",
        type=str,
        default="config/default.yaml",
        help="Path to YAML config file (default: config/default.yaml)",
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Log level (default: INFO)",
    )
    parser.add_argument(
        "--json-logs",
        action="store_true",
        default=False,
        help="Emit JSON-lines log output for production",
    )
    args = parser.parse_args()

    # Env var override for Docker: DRY_RUN=false enables live trading.
    import os
    dry_run_env = os.getenv("DRY_RUN")
    dry_run = args.dry_run if dry_run_env is None else dry_run_env.lower() != "false"

    # Set up structured logging before anything else.
    setup_logging(log_level=args.log_level, json_format=args.json_logs)

    config_path = Path(args.config)
    config = load_config(config_path if config_path.exists() else None)

    bot = MomentumBot(config, dry_run=dry_run)

    log.info(
        "starting_momentum_bot",
        dry_run=args.dry_run,
        config_path=str(config_path),
        testnet=config.hl_testnet,
    )

    asyncio.run(bot.start())


if __name__ == "__main__":
    main()
