"""Position tracking and lifecycle management."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Literal

import structlog

from src.execution.executor import HyperliquidExecutor

if TYPE_CHECKING:
    from src.config import StrategyConfig, TargetConfig

logger = structlog.get_logger(__name__)

# How long (ms) before a stale position is checked for timeout closure.
_DEFAULT_TIMEOUT_MS = 2 * 60 * 60 * 1000  # 2 hours
# Minimum profit in R to keep a stale position open.
_STALE_MIN_R = 0.5


@dataclass
class ManagedPosition:
    """State for a single actively managed position."""

    coin: str
    direction: Literal["LONG", "SHORT"]
    entry_price: float
    size: float  # token qty (always positive)
    sl_price: float
    tp_price: float
    sl_order_id: int | None = None
    tp_order_id: int | None = None
    entry_time: int = field(default_factory=lambda: int(time.time() * 1000))
    regime_score: int = 0
    r_amount: float = 0.0  # |entry - sl| in price units
    trailing_activated: bool = False

    # ------------------------------------------------------------------
    # Derived helpers
    # ------------------------------------------------------------------

    @property
    def is_long(self) -> bool:
        return self.direction == "LONG"

    def unrealized_r(self, current_price: float) -> float:
        """Return unrealized PnL expressed in multiples of R.

        Positive means the trade is in favour.
        """
        if self.r_amount <= 0:
            return 0.0
        if self.is_long:
            return (current_price - self.entry_price) / self.r_amount
        return (self.entry_price - current_price) / self.r_amount

    def unrealized_pnl(self, current_price: float) -> float:
        """Return unrealized PnL in USD."""
        if self.is_long:
            return (current_price - self.entry_price) * self.size
        return (self.entry_price - current_price) * self.size


class PositionManager:
    """Open, track, and close positions with SL/TP lifecycle management.

    Each coin can have at most one ``ManagedPosition`` at a time.  The
    manager is responsible for:

    - Placing entry + SL + TP orders atomically.
    - Trailing stop-loss evolution (move SL to breakeven + 0.1R after 0.9R).
    - Timeout closure (>2h open and <0.5R in favour).
    - Clean cancellation of SL/TP orders on close.
    """

    def __init__(
        self,
        executor: HyperliquidExecutor,
        strategy_config: StrategyConfig,
    ) -> None:
        self._executor = executor
        self._config = strategy_config
        self.positions: dict[str, ManagedPosition] = {}

    # ------------------------------------------------------------------
    # Open
    # ------------------------------------------------------------------

    async def open_position(
        self,
        coin: str,
        direction: Literal["LONG", "SHORT"],
        size: float,
        entry_price: float,
        sl_price: float,
        tp_price: float,
        regime_score: int = 0,
        use_limit: bool = False,
    ) -> ManagedPosition:
        """Place entry, SL, and TP orders and begin tracking the position.

        Args:
            coin: The perpetual coin symbol (e.g. ``"BTC"``).
            direction: ``"LONG"`` or ``"SHORT"``.
            size: Position size in tokens (always positive).
            entry_price: Desired entry price (used for limit; ignored for market).
            sl_price: Stop-loss trigger price.
            tp_price: Take-profit trigger price.
            regime_score: Strategy regime score at signal time.
            use_limit: If ``True``, place a limit entry; otherwise market.

        Returns:
            The newly created ``ManagedPosition``.
        """
        is_buy = direction == "LONG"
        r_amount = abs(entry_price - sl_price)

        logger.info(
            "opening_position",
            coin=coin,
            direction=direction,
            size=size,
            entry=entry_price,
            sl=sl_price,
            tp=tp_price,
            r_amount=r_amount,
        )

        # 1. Entry order
        if use_limit:
            entry_result = await self._executor.place_limit_order(
                coin, is_buy, size, entry_price
            )
        else:
            entry_result = await self._executor.place_market_order(
                coin, is_buy, size
            )

        # Extract filled price from response if available, else use target.
        filled_price = _extract_avg_price(entry_result, fallback=entry_price)

        # Recalculate R with the actual fill price.
        r_amount = abs(filled_price - sl_price)

        # 2. Stop-loss (closing side is opposite of entry)
        close_is_buy = not is_buy
        sl_result = await self._executor.set_stop_loss(
            coin, close_is_buy, sl_price, size
        )
        sl_oid = _extract_order_id(sl_result)

        # 3. Take-profit
        tp_result = await self._executor.set_take_profit(
            coin, close_is_buy, tp_price, size
        )
        tp_oid = _extract_order_id(tp_result)

        pos = ManagedPosition(
            coin=coin,
            direction=direction,
            entry_price=filled_price,
            size=size,
            sl_price=sl_price,
            tp_price=tp_price,
            sl_order_id=sl_oid,
            tp_order_id=tp_oid,
            regime_score=regime_score,
            r_amount=r_amount,
        )
        self.positions[coin] = pos
        logger.info("position_opened", coin=coin, pos=pos)
        return pos

    # ------------------------------------------------------------------
    # Trailing stop-loss
    # ------------------------------------------------------------------

    async def check_trailing_sl(self, coin: str, current_price: float) -> None:
        """Evolving R rule: if unrealized >= 0.9R, move SL to entry + 0.1R.

        This locks in a small profit once the trade reaches near the
        target.  The trailing stop is only activated once.
        """
        pos = self.positions.get(coin)
        if pos is None or pos.trailing_activated:
            return

        trigger_r = self._config.targets.trailing_trigger_r  # default 0.9
        lock_r = self._config.targets.trailing_lock_r  # default 0.1

        unrealized = pos.unrealized_r(current_price)
        if unrealized < trigger_r:
            return

        # New SL: entry + 0.1R in the direction of the trade.
        if pos.is_long:
            new_sl = pos.entry_price + lock_r * pos.r_amount
        else:
            new_sl = pos.entry_price - lock_r * pos.r_amount

        logger.info(
            "trailing_sl_activated",
            coin=coin,
            old_sl=pos.sl_price,
            new_sl=new_sl,
            unrealized_r=unrealized,
        )

        # Cancel existing SL and place the new one.
        if pos.sl_order_id is not None:
            try:
                await self._executor.cancel_order(coin, pos.sl_order_id)
            except Exception as exc:
                logger.warning("cancel_old_sl_failed", coin=coin, error=str(exc))

        close_is_buy = not pos.is_long
        sl_result = await self._executor.set_stop_loss(
            coin, close_is_buy, new_sl, pos.size
        )
        pos.sl_price = new_sl
        pos.sl_order_id = _extract_order_id(sl_result)
        pos.trailing_activated = True

    # ------------------------------------------------------------------
    # Timeout check
    # ------------------------------------------------------------------

    async def check_timeout(self, coin: str, current_price: float) -> None:
        """Close the position at market if it is stale and under-performing.

        A position is considered stale when it has been open for longer than
        ``stale_position_timeout_minutes`` and the unrealized profit is less
        than 0.5R.
        """
        pos = self.positions.get(coin)
        if pos is None:
            return

        timeout_ms = self._config.stale_position_timeout_minutes * 60 * 1000
        now_ms = int(time.time() * 1000)
        if (now_ms - pos.entry_time) < timeout_ms:
            return

        unrealized = pos.unrealized_r(current_price)
        if unrealized >= _STALE_MIN_R:
            return

        logger.info(
            "position_timeout",
            coin=coin,
            age_min=(now_ms - pos.entry_time) / 60_000,
            unrealized_r=unrealized,
        )
        await self.close_position(coin, reason="timeout")

    # ------------------------------------------------------------------
    # Close
    # ------------------------------------------------------------------

    async def close_position(self, coin: str, reason: str) -> float:
        """Close the position at market and cancel outstanding SL/TP orders.

        Returns the estimated realized PnL in USD (based on mid price at
        close time).
        """
        pos = self.positions.get(coin)
        if pos is None:
            logger.warning("close_no_position", coin=coin)
            return 0.0

        logger.info("closing_position", coin=coin, reason=reason)

        # Cancel SL and TP orders (best-effort).
        for label, oid in [("sl", pos.sl_order_id), ("tp", pos.tp_order_id)]:
            if oid is not None:
                try:
                    await self._executor.cancel_order(coin, oid)
                except Exception as exc:
                    logger.warning(
                        "cancel_order_failed",
                        coin=coin,
                        label=label,
                        oid=oid,
                        error=str(exc),
                    )

        # Close at market.
        close_is_buy = not pos.is_long
        try:
            await self._executor.place_market_order(coin, close_is_buy, pos.size)
        except Exception as exc:
            logger.error("market_close_failed", coin=coin, error=str(exc))
            raise

        # Estimate PnL from current mid.
        mids = await self._executor.get_all_mids()
        close_price = mids.get(coin, pos.entry_price)
        pnl = pos.unrealized_pnl(close_price)

        del self.positions[coin]
        logger.info(
            "position_closed",
            coin=coin,
            reason=reason,
            pnl=pnl,
            close_price=close_price,
        )
        return pnl

    # ------------------------------------------------------------------
    # Bulk update
    # ------------------------------------------------------------------

    async def update_all(self, prices: dict[str, float]) -> None:
        """Check trailing SL and timeout for every open position.

        Call this periodically (e.g. every candle) with the latest mid
        prices.
        """
        # Iterate over a snapshot because close_position mutates the dict.
        for coin in list(self.positions):
            price = prices.get(coin)
            if price is None:
                continue
            await self.check_trailing_sl(coin, price)
            await self.check_timeout(coin, price)


# ------------------------------------------------------------------
# SDK response helpers
# ------------------------------------------------------------------


def _extract_order_id(result: dict[str, Any]) -> int | None:
    """Pull the first order id from an SDK order response."""
    statuses = result.get("response", {}).get("data", {}).get("statuses", [])
    for status in statuses:
        if isinstance(status, dict):
            # Resting order: {"resting": {"oid": 12345}}
            resting = status.get("resting")
            if isinstance(resting, dict):
                return int(resting["oid"])
            # Filled immediately: {"filled": {"oid": 12345, ...}}
            filled = status.get("filled")
            if isinstance(filled, dict):
                return int(filled["oid"])
    return None


def _extract_avg_price(result: dict[str, Any], fallback: float) -> float:
    """Pull the average fill price from an SDK order response.

    Returns *fallback* if the price cannot be determined (e.g. limit order
    that hasn't filled yet).
    """
    statuses = result.get("response", {}).get("data", {}).get("statuses", [])
    for status in statuses:
        if isinstance(status, dict):
            filled = status.get("filled")
            if isinstance(filled, dict):
                avg = filled.get("avgPx")
                if avg is not None:
                    return float(avg)
    return fallback
