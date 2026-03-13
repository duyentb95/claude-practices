"""Signal generator -- entry, stop-loss, and take-profit for momentum breakouts.

Combines regime classification with swing-point levels to produce actionable
trade signals with risk/reward validation.
"""

from __future__ import annotations

import time
from typing import Literal

from .models import Candle, OrderType, Signal, SignalDirection
from .regime import RegimeResult, classify_regime
from .swing_points import (
    find_major_swing_high,
    find_major_swing_low,
    find_relevant_swing_high,
    find_relevant_swing_low,
)


# ---------------------------------------------------------------------------
# Configuration constants
# ---------------------------------------------------------------------------

_MIN_RR = 1.0  # minimum reward:risk ratio
_MIN_SL_PCT = 0.005  # 0.5%
_MAX_SL_PCT = 0.05  # 5%
_LIMIT_SL_PCT_THRESHOLD = 0.03  # use LIMIT if SL distance < 3%


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _sl_distance_pct(entry: float, sl: float) -> float:
    """Absolute percentage distance between entry and stop-loss."""
    if entry == 0:
        return 0.0
    return abs(entry - sl) / entry


def _calculate_tp(
    entry: float,
    sl: float,
    direction: Literal["LONG", "SHORT"],
    regime_score: int,
) -> float:
    """Calculate take-profit level based on regime strength.

    - 3/3 (STRONG_MOMENTUM): target 1.5R (next S/R zone approximation)
    - 2/3 (MOMENTUM): target 1.0R (conservative)
    """
    sl_dist = abs(entry - sl)
    multiplier = 1.5 if regime_score >= 3 else 1.0

    if direction == "LONG":
        return entry + sl_dist * multiplier
    else:
        return entry - sl_dist * multiplier


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate_signal(
    coin: str,
    candles_1m: list[Candle],
    baseline_candles: list[Candle] | None = None,
) -> Signal | None:
    """Generate a momentum breakout signal for *coin*.

    Pipeline:
      1. Classify regime -- skip if score < 2 or not tradeable.
      2. Determine direction from staircase.
      3. Find entry level (major swing high for longs, low for shorts).
      4. Check breakout: latest candle close must breach the level.
      5. Calculate SL at relevant opposite swing point.
      6. Determine order type: LIMIT if SL < 3%, else MARKET.
      7. Calculate TP: 3/3 -> 1.5R, 2/3 -> 1.0R.
      8. Validate R:R >= 1.0 and SL distance within 0.5%-5%.

    Returns ``None`` if any validation step fails.
    """
    if len(candles_1m) < 20:
        return None

    # 1. Classify regime
    regime = classify_regime(candles_1m, baseline_candles=baseline_candles)

    if not regime.tradeable or regime.score < 2:
        return None

    staircase_dir = regime.staircase.direction
    if staircase_dir == "NONE":
        return None

    direction: Literal["LONG", "SHORT"] = "LONG" if staircase_dir == "BULLISH" else "SHORT"
    last_candle = candles_1m[-1]
    entry_index = len(candles_1m) - 1

    # 2. Find entry level (major swing breakout level)
    if direction == "LONG":
        major = find_major_swing_high(candles_1m[:-1])  # exclude current bar
        if major is None:
            return None

        entry_level = major.price

        # 3. Check breakout: close must be above the major swing high
        if last_candle.close <= entry_level:
            return None

        entry_price = last_candle.close

        # 4. SL at relevant swing low below entry
        sl_swing = find_relevant_swing_low(candles_1m, entry_index)
        if sl_swing is None:
            return None
        sl_price = sl_swing.price

    else:  # SHORT
        major = find_major_swing_low(candles_1m[:-1])
        if major is None:
            return None

        entry_level = major.price

        # 3. Check breakout: close must be below the major swing low
        if last_candle.close >= entry_level:
            return None

        entry_price = last_candle.close

        # 4. SL at relevant swing high above entry
        sl_swing = find_relevant_swing_high(candles_1m, entry_index)
        if sl_swing is None:
            return None
        sl_price = sl_swing.price

    # 5. Validate SL distance
    sl_pct = _sl_distance_pct(entry_price, sl_price)
    if sl_pct < _MIN_SL_PCT or sl_pct > _MAX_SL_PCT:
        return None

    # 6. Calculate TP
    tp_price = _calculate_tp(entry_price, sl_price, direction, regime.score)

    # 7. Validate R:R
    sl_dist = abs(entry_price - sl_price)
    tp_dist = abs(tp_price - entry_price)
    r_multiple = tp_dist / sl_dist if sl_dist > 0 else 0.0

    if r_multiple < _MIN_RR:
        return None

    signal_direction = SignalDirection.LONG if direction == "LONG" else SignalDirection.SHORT

    # 8. Determine order type: LIMIT if SL distance < 3%, else MARKET
    order_type = OrderType.LIMIT if sl_pct < _LIMIT_SL_PCT_THRESHOLD else OrderType.MARKET

    return Signal(
        coin=coin,
        direction=signal_direction,
        entry_price=round(entry_price, 6),
        stop_loss=round(sl_price, 6),
        take_profit=round(tp_price, 6),
        regime_score=regime.score,
        timestamp=int(time.time() * 1000),
        staircase_score=regime.staircase.score,
        volume_score=regime.volume.score,
        confidence=regime.staircase.score * 0.5 + regime.volume.score * 0.3 + (100.0 if regime.volatility_is_valid else 0.0) * 0.2,
        order_type=order_type,
    )
