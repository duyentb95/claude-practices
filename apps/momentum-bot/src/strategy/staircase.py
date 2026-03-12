"""Grindy staircase pattern detector.

A "staircase" is a steady, grinding trend defined by sequential
higher-highs + higher-lows (bullish) or lower-lows + lower-highs
(bearish).  The detector also measures pullback-to-impulse asymmetry
and grindiness to confirm the pattern is not a single spike.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from .models import Candle
from .swing_points import SwingPoint, find_swing_points


@dataclass
class StaircaseResult:
    """Output of the staircase detector."""

    direction: Literal["BULLISH", "BEARISH", "NONE"]
    score: float  # 0-100 composite
    slope: float  # price change per minute (signed)
    asymmetry: float  # avg impulse / avg pullback; > 1.2 good
    grindiness: float  # 0-1; > 0.7 = grindy (good)
    duration_minutes: int
    is_valid: bool  # score >= 60
    swing_highs: list[SwingPoint] = field(default_factory=list)
    swing_lows: list[SwingPoint] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _check_sequential(prices: list[float], ascending: bool) -> tuple[int, int]:
    """Count sequential pairs and total pairs.

    Returns (sequential_count, total_pairs).
    """
    if len(prices) < 2:
        return 0, 0

    seq = 0
    total = len(prices) - 1
    for i in range(1, len(prices)):
        if ascending and prices[i] > prices[i - 1]:
            seq += 1
        elif not ascending and prices[i] < prices[i - 1]:
            seq += 1
    return seq, total


def _measure_moves(candles: list[Candle], swing_lows: list[SwingPoint], swing_highs: list[SwingPoint]) -> tuple[list[float], list[float]]:
    """Measure impulse and pullback magnitudes between alternating swings.

    Returns (impulse_sizes, pullback_sizes) as absolute price differences.
    """
    # Merge and sort all swings chronologically
    all_swings = sorted(swing_lows + swing_highs, key=lambda s: s.index)
    if len(all_swings) < 3:
        return [], []

    impulses: list[float] = []
    pullbacks: list[float] = []

    for i in range(1, len(all_swings)):
        prev = all_swings[i - 1]
        curr = all_swings[i]
        diff = abs(curr.price - prev.price)

        # Impulse: low->high move; pullback: high->low move
        if prev.type == "low" and curr.type == "high":
            impulses.append(diff)
        elif prev.type == "high" and curr.type == "low":
            pullbacks.append(diff)

    return impulses, pullbacks


def _measure_grindiness(candles: list[Candle]) -> float:
    """Grindiness = 1 minus (max single candle range / total range).

    Returns 0-1 where higher means more evenly distributed movement (good).
    A value > 0.7 indicates a grindy, healthy staircase.
    """
    if len(candles) < 2:
        return 0.0

    total_high = max(c.high for c in candles)
    total_low = min(c.low for c in candles)
    total_range = total_high - total_low

    if total_range <= 0:
        return 0.0

    max_single_range = max(c.high - c.low for c in candles)
    ratio = max_single_range / total_range

    # If a single candle covers > 30% of total range, penalise heavily
    grindiness = max(0.0, 1.0 - ratio)
    return grindiness


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_staircase(
    candles_1m: list[Candle],
    lookback: int = 120,
) -> StaircaseResult:
    """Detect a grindy staircase pattern over the last *lookback* candles.

    Scoring breakdown (0-100):
      - trend_score  * 0.4  (sequential HH/HL or LL/LH ratio)
      - pullback_score * 0.3  (asymmetry of impulse vs pullback)
      - consistency_score * 0.3  (grindiness)

    ``is_valid`` when composite score >= 60.
    """
    empty = StaircaseResult(
        direction="NONE",
        score=0.0,
        slope=0.0,
        asymmetry=0.0,
        grindiness=0.0,
        duration_minutes=0,
        is_valid=False,
    )

    window = candles_1m[-lookback:] if len(candles_1m) >= lookback else candles_1m
    if len(window) < 10:
        return empty

    duration_minutes = max(
        1,
        (window[-1].timestamp - window[0].timestamp) // 60_000,
    )

    # 1. Find swing points
    swings = find_swing_points(window, min_bars=3)
    highs = [s for s in swings if s.type == "high"]
    lows = [s for s in swings if s.type == "low"]

    if len(highs) < 2 and len(lows) < 2:
        return StaircaseResult(
            direction="NONE",
            score=0.0,
            slope=0.0,
            asymmetry=0.0,
            grindiness=_measure_grindiness(window),
            duration_minutes=duration_minutes,
            is_valid=False,
            swing_highs=highs,
            swing_lows=lows,
        )

    high_prices = [s.price for s in highs]
    low_prices = [s.price for s in lows]

    # 2. Check sequential HH+HL or LL+LH
    hh_seq, hh_total = _check_sequential(high_prices, ascending=True)
    hl_seq, hl_total = _check_sequential(low_prices, ascending=True)
    ll_seq, ll_total = _check_sequential(low_prices, ascending=False)
    lh_seq, lh_total = _check_sequential(high_prices, ascending=False)

    bullish_pairs = (hh_total + hl_total) or 1
    bearish_pairs = (ll_total + lh_total) or 1
    bullish_ratio = (hh_seq + hl_seq) / bullish_pairs
    bearish_ratio = (ll_seq + lh_seq) / bearish_pairs

    if bullish_ratio >= bearish_ratio and bullish_ratio > 0.4:
        direction: Literal["BULLISH", "BEARISH", "NONE"] = "BULLISH"
        trend_ratio = bullish_ratio
    elif bearish_ratio > bullish_ratio and bearish_ratio > 0.4:
        direction = "BEARISH"
        trend_ratio = bearish_ratio
    else:
        direction = "NONE"
        trend_ratio = max(bullish_ratio, bearish_ratio)

    trend_score = min(100.0, trend_ratio * 100.0)

    # 3. Measure pullback-to-impulse asymmetry
    impulses, pullbacks = _measure_moves(window, lows, highs)

    avg_impulse = sum(impulses) / len(impulses) if impulses else 0.0
    avg_pullback = sum(pullbacks) / len(pullbacks) if pullbacks else 0.0

    if avg_pullback > 0:
        asymmetry = avg_impulse / avg_pullback
    elif avg_impulse > 0:
        asymmetry = 3.0  # pullbacks negligible -> great
    else:
        asymmetry = 1.0

    # Pullback score: asymmetry >= 1.2 is baseline good, 2.0+ is excellent
    if asymmetry >= 2.0:
        pullback_score = 100.0
    elif asymmetry >= 1.2:
        pullback_score = 50.0 + (asymmetry - 1.2) / 0.8 * 50.0
    elif asymmetry >= 1.0:
        pullback_score = 30.0 + (asymmetry - 1.0) / 0.2 * 20.0
    else:
        pullback_score = max(0.0, asymmetry * 30.0)

    # 4. Grindiness
    grindiness = _measure_grindiness(window)
    consistency_score = min(100.0, grindiness * 100.0 / 0.7)  # 0.7 -> 100

    # 5. Composite score
    composite = (
        trend_score * 0.4
        + pullback_score * 0.3
        + consistency_score * 0.3
    )

    # Slope (price per minute, signed)
    price_change = window[-1].close - window[0].close
    slope = price_change / duration_minutes if duration_minutes > 0 else 0.0

    # Override direction to NONE if score too low
    if composite < 30 or direction == "NONE":
        direction = "NONE"

    return StaircaseResult(
        direction=direction,
        score=round(composite, 2),
        slope=round(slope, 6),
        asymmetry=round(asymmetry, 3),
        grindiness=round(grindiness, 3),
        duration_minutes=duration_minutes,
        is_valid=composite >= 60,
        swing_highs=highs,
        swing_lows=lows,
    )
