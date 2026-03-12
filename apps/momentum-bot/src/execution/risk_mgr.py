"""Risk management enforcer.

Enforces per-trade sizing, daily/weekly loss limits, drawdown circuit
breakers, and emergency close-all functionality.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any

import structlog

from src.execution.executor import HyperliquidExecutor

if TYPE_CHECKING:
    from src.config import RiskConfig

logger = structlog.get_logger(__name__)

# Internal constants
_MS_PER_DAY = 86_400_000
_MS_PER_WEEK = 7 * _MS_PER_DAY


class RiskManager:
    """Centralised risk gate that every trade must pass through.

    Responsibilities:
    - Position sizing based on risk-per-trade and distance to stop-loss.
    - Enforcing maximum leverage and concurrent position limits.
    - Tracking daily and weekly realized PnL against loss limits.
    - Peak-equity drawdown circuit breaker.
    - Emergency close-all when a risk limit is breached.
    """

    def __init__(
        self,
        executor: HyperliquidExecutor,
        config: RiskConfig,
    ) -> None:
        self._executor = executor
        self._config = config

        # PnL tracking
        self.daily_pnl: float = 0.0
        self.weekly_pnl: float = 0.0
        self._daily_reset_ts: int = _start_of_day_ms()
        self._weekly_reset_ts: int = _start_of_week_ms()

        # Drawdown tracking
        self.peak_equity: float = 0.0
        self.initial_equity: float = 0.0

        # Halt state
        self.halted: bool = False
        self.halt_reason: str = ""

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------

    async def initialise(self) -> None:
        """Fetch current equity and set the peak/initial marks.

        Call once at startup before the first trading cycle.
        """
        equity = await self._executor.get_equity()
        self.initial_equity = equity
        self.peak_equity = equity
        logger.info("risk_mgr_init", equity=equity)

    # ------------------------------------------------------------------
    # Position sizing
    # ------------------------------------------------------------------

    def calculate_position_size(
        self,
        equity: float,
        entry_price: float,
        sl_price: float,
    ) -> float:
        """Compute the position size in tokens.

        ``risk_amount = equity * risk_per_trade_pct``
        ``distance_pct = |entry - sl| / entry``
        ``notional = risk_amount / distance_pct``
        ``size = notional / entry_price``

        The notional is capped at ``max_leverage * equity`` to respect the
        configured leverage ceiling.

        Returns 0.0 if the inputs are degenerate (zero distance, etc.).
        """
        if entry_price <= 0 or sl_price <= 0:
            logger.warning("invalid_prices", entry=entry_price, sl=sl_price)
            return 0.0

        distance = abs(entry_price - sl_price)
        distance_pct = distance / entry_price
        if distance_pct <= 0:
            logger.warning("zero_sl_distance", entry=entry_price, sl=sl_price)
            return 0.0

        risk_amount = equity * self._config.max_risk_per_trade_pct
        notional = risk_amount / distance_pct

        # Leverage cap
        max_notional = equity * self._config.max_leverage
        if notional > max_notional:
            notional = max_notional
            logger.info(
                "size_capped_by_leverage",
                notional=notional,
                max_leverage=self._config.max_leverage,
            )

        size = notional / entry_price
        logger.info(
            "position_sized",
            equity=equity,
            risk_amount=risk_amount,
            distance_pct=round(distance_pct, 6),
            notional=round(notional, 2),
            size=round(size, 6),
        )
        return size

    # ------------------------------------------------------------------
    # Pre-trade gate
    # ------------------------------------------------------------------

    def can_open_trade(self, current_positions: int) -> tuple[bool, str]:
        """Check whether a new trade is allowed.

        Returns ``(True, "")`` when the trade may proceed, or
        ``(False, reason)`` when it must be rejected.
        """
        self._maybe_reset_periods()

        if self.halted:
            return False, f"halted: {self.halt_reason}"

        if current_positions >= self._config.max_concurrent_positions:
            return False, (
                f"max positions reached ({current_positions}"
                f"/{self._config.max_concurrent_positions})"
            )

        # Daily loss limit
        if self.initial_equity > 0:
            daily_limit = self.initial_equity * self._config.daily_loss_limit_pct
            if self.daily_pnl <= -daily_limit:
                self._halt(f"daily loss limit hit ({self.daily_pnl:.2f})")
                return False, self.halt_reason

            # Weekly loss limit
            weekly_limit = self.initial_equity * self._config.weekly_loss_limit_pct
            if self.weekly_pnl <= -weekly_limit:
                self._halt(f"weekly loss limit hit ({self.weekly_pnl:.2f})")
                return False, self.halt_reason

        return True, ""

    # ------------------------------------------------------------------
    # PnL tracking
    # ------------------------------------------------------------------

    def update_pnl(self, realized_pnl: float) -> None:
        """Record a realized PnL event and check circuit breakers."""
        self._maybe_reset_periods()
        self.daily_pnl += realized_pnl
        self.weekly_pnl += realized_pnl
        logger.info(
            "pnl_updated",
            realized=realized_pnl,
            daily=round(self.daily_pnl, 2),
            weekly=round(self.weekly_pnl, 2),
        )

    # ------------------------------------------------------------------
    # Drawdown
    # ------------------------------------------------------------------

    def check_drawdown(self, current_equity: float) -> bool:
        """Return ``True`` if the drawdown from peak exceeds the limit.

        Also updates ``peak_equity`` when a new high is reached.  If the
        drawdown limit is breached, the manager enters halt state.
        """
        if current_equity > self.peak_equity:
            self.peak_equity = current_equity

        if self.peak_equity <= 0:
            return False

        drawdown_pct = (self.peak_equity - current_equity) / self.peak_equity
        if drawdown_pct >= self._config.max_drawdown_pct:
            self._halt(
                f"max drawdown {drawdown_pct:.2%} >= "
                f"{self._config.max_drawdown_pct:.2%}"
            )
            return True
        return False

    # ------------------------------------------------------------------
    # Emergency close-all
    # ------------------------------------------------------------------

    async def emergency_close_all(
        self,
        executor: HyperliquidExecutor,
        position_manager: Any,
        reason: str,
    ) -> None:
        """Close every open position at market and halt trading.

        Args:
            executor: The executor instance (may differ from self._executor
                      in testing).
            position_manager: A ``PositionManager`` whose ``.positions``
                              dict will be drained.
            reason: Human-readable reason for the emergency close.
        """
        self._halt(f"emergency: {reason}")
        logger.critical("emergency_close_all", reason=reason)

        coins = list(position_manager.positions.keys())
        for coin in coins:
            try:
                await position_manager.close_position(coin, reason=f"emergency: {reason}")
            except Exception as exc:
                logger.error(
                    "emergency_close_failed",
                    coin=coin,
                    error=str(exc),
                )

        # Double-check: fetch positions from exchange and close any
        # that the position manager didn't know about.
        try:
            exchange_positions = await executor.get_positions()
            for pos_data in exchange_positions:
                pos_info = pos_data.get("position", {})
                coin = pos_info.get("coin", "")
                size_str = pos_info.get("szi", "0")
                size = float(size_str)
                if coin and size != 0:
                    is_buy = size < 0  # Close by trading the opposite side.
                    abs_size = abs(size)
                    logger.warning(
                        "emergency_closing_orphan",
                        coin=coin,
                        size=abs_size,
                    )
                    await executor.place_market_order(coin, is_buy, abs_size)
        except Exception as exc:
            logger.error("emergency_orphan_check_failed", error=str(exc))

    # ------------------------------------------------------------------
    # Reset
    # ------------------------------------------------------------------

    def reset_halt(self) -> None:
        """Manually clear the halt state (e.g. after operator review)."""
        logger.info("halt_reset", previous_reason=self.halt_reason)
        self.halted = False
        self.halt_reason = ""

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _halt(self, reason: str) -> None:
        """Enter halt state."""
        if not self.halted:
            logger.critical("risk_halt", reason=reason)
        self.halted = True
        self.halt_reason = reason

    def _maybe_reset_periods(self) -> None:
        """Reset daily/weekly PnL counters when the period rolls over."""
        now = _now_ms()

        new_day_start = _start_of_day_ms()
        if new_day_start > self._daily_reset_ts:
            logger.info("daily_pnl_reset", previous=round(self.daily_pnl, 2))
            self.daily_pnl = 0.0
            self._daily_reset_ts = new_day_start

        new_week_start = _start_of_week_ms()
        if new_week_start > self._weekly_reset_ts:
            logger.info("weekly_pnl_reset", previous=round(self.weekly_pnl, 2))
            self.weekly_pnl = 0.0
            self._weekly_reset_ts = new_week_start

    def snapshot(self) -> dict[str, float | bool | str]:
        """Return a summary dict for monitoring / dashboard."""
        return {
            "daily_pnl": round(self.daily_pnl, 2),
            "weekly_pnl": round(self.weekly_pnl, 2),
            "peak_equity": round(self.peak_equity, 2),
            "initial_equity": round(self.initial_equity, 2),
            "halted": self.halted,
            "halt_reason": self.halt_reason,
        }


# ------------------------------------------------------------------
# Time helpers
# ------------------------------------------------------------------


def _now_ms() -> int:
    return int(time.time() * 1000)


def _start_of_day_ms() -> int:
    """Return epoch ms for the start of the current UTC day."""
    now = time.time()
    day_start = int(now) - int(now) % 86400
    return day_start * 1000


def _start_of_week_ms() -> int:
    """Return epoch ms for the start of the current UTC week (Monday)."""
    import datetime

    today = datetime.datetime.now(tz=datetime.timezone.utc).date()
    monday = today - datetime.timedelta(days=today.weekday())
    return int(
        datetime.datetime(
            monday.year, monday.month, monday.day, tzinfo=datetime.timezone.utc
        ).timestamp()
        * 1000
    )
