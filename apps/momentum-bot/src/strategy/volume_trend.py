"""Volume trend analyzer.

Groups 1-minute candles into time buckets, measures whether volume is
increasing over the observation window, and produces a composite score.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

import numpy as np

from .models import Candle


class VolumeTrend(str, Enum):
    INCREASING = "INCREASING"
    FLAT = "FLAT"
    DECREASING = "DECREASING"


@dataclass
class VolumeTrendResult:
    """Output of the volume trend detector."""

    trend: VolumeTrend
    score: float  # 0-100
    is_valid: bool  # score >= 60
    quarter_volumes: list[float]  # 4 quarters
    slope_normalized: float  # slope / mean volume


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_BUCKET_MINUTES = 15  # 15-min buckets -> 8 buckets over 120 min window
_GROWTH_THRESHOLD = 1.05  # each successive bucket must beat prev by 5%
_NUM_QUARTERS = 4  # number of quarters for the summary


def _bucket_volumes(candles: list[Candle], bucket_minutes: int) -> list[float]:
    """Sum candle volumes into fixed-duration buckets.

    Buckets are aligned to the first candle timestamp.  Partial trailing
    buckets are included.
    """
    if not candles:
        return []

    bucket_ms = bucket_minutes * 60_000
    start = candles[0].timestamp
    buckets: list[float] = []
    current_sum = 0.0
    bucket_end = start + bucket_ms

    for c in candles:
        while c.timestamp >= bucket_end:
            buckets.append(current_sum)
            current_sum = 0.0
            bucket_end += bucket_ms
        current_sum += c.volume

    # Flush last bucket
    buckets.append(current_sum)
    return buckets


def _quarter_volumes(buckets: list[float], num_quarters: int = _NUM_QUARTERS) -> list[float]:
    """Aggregate buckets into *num_quarters* equal groups.

    If the bucket count is not evenly divisible, earlier quarters absorb
    the remainder.
    """
    if not buckets:
        return [0.0] * num_quarters

    if len(buckets) <= num_quarters:
        # Pad with zeros at the front
        padded = [0.0] * (num_quarters - len(buckets)) + buckets
        return padded

    base_size = len(buckets) // num_quarters
    remainder = len(buckets) % num_quarters
    quarters: list[float] = []
    idx = 0
    for q in range(num_quarters):
        size = base_size + (1 if q < remainder else 0)
        quarters.append(sum(buckets[idx : idx + size]))
        idx += size

    return quarters


def _linear_regression_slope(values: list[float]) -> float:
    """Ordinary least-squares slope via numpy."""
    n = len(values)
    if n < 2:
        return 0.0

    x = np.arange(n, dtype=np.float64)
    y = np.array(values, dtype=np.float64)

    # slope = cov(x,y) / var(x)
    x_mean = x.mean()
    y_mean = y.mean()
    var_x = ((x - x_mean) ** 2).sum()
    if var_x == 0:
        return 0.0

    slope: float = float(((x - x_mean) * (y - y_mean)).sum() / var_x)
    return slope


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_volume_trend(
    candles_1m: list[Candle],
    lookback: int = 120,
) -> VolumeTrendResult:
    """Analyse volume trend over the last *lookback* 1-minute candles.

    Steps:
      1. Group into 15-min buckets, sum volume per bucket.
      2. Check each successive bucket exceeds the previous by >= 5%.
      3. Linear regression slope on bucket volumes.
      4. Normalise slope by mean volume.
      5. Composite score combining growth-check ratio and normalised slope.

    ``is_valid`` when composite score >= 60.
    """
    window = candles_1m[-lookback:] if len(candles_1m) >= lookback else candles_1m

    if len(window) < 4:
        return VolumeTrendResult(
            trend=VolumeTrend.FLAT,
            score=0.0,
            is_valid=False,
            quarter_volumes=[0.0] * _NUM_QUARTERS,
            slope_normalized=0.0,
        )

    buckets = _bucket_volumes(window, _BUCKET_MINUTES)
    quarters = _quarter_volumes(buckets, _NUM_QUARTERS)

    # --- Growth check: successive buckets beating threshold ---
    growth_hits = 0
    growth_total = max(1, len(buckets) - 1)
    for i in range(1, len(buckets)):
        prev = buckets[i - 1]
        if prev > 0 and buckets[i] >= prev * _GROWTH_THRESHOLD:
            growth_hits += 1
        elif prev == 0 and buckets[i] > 0:
            growth_hits += 1  # 0 -> positive counts as growth

    growth_ratio = growth_hits / growth_total

    # --- Linear regression ---
    slope = _linear_regression_slope(buckets)
    mean_vol = sum(buckets) / len(buckets) if buckets else 1.0
    slope_normalized = slope / mean_vol if mean_vol > 0 else 0.0

    # --- Classify trend direction ---
    if slope_normalized > 0.05:
        trend = VolumeTrend.INCREASING
    elif slope_normalized < -0.05:
        trend = VolumeTrend.DECREASING
    else:
        trend = VolumeTrend.FLAT

    # --- Composite score ---
    # growth_score: 0-60 (ratio of buckets that grew)
    growth_score = growth_ratio * 60.0

    # slope_score: 0-40 based on normalised slope
    # slope_normalized ~0.1 is moderate, ~0.3+ is strong
    if slope_normalized > 0:
        slope_score = min(40.0, slope_normalized / 0.3 * 40.0)
    else:
        slope_score = 0.0

    composite = growth_score + slope_score
    composite = max(0.0, min(100.0, composite))

    return VolumeTrendResult(
        trend=trend,
        score=round(composite, 2),
        is_valid=composite >= 60.0,
        quarter_volumes=[round(q, 2) for q in quarters],
        slope_normalized=round(slope_normalized, 4),
    )
