"""Regime classifier combining staircase, volume trend, and volatility.

Produces a 0-3 score and a ``RegimeType`` label.  A regime is
tradeable only when the score is >= 2 **and** the staircase is valid.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import numpy as np

from .models import Candle
from .staircase import StaircaseResult, detect_staircase
from .volume_trend import VolumeTrendResult, detect_volume_trend


class RegimeType(str, Enum):
    STRONG_MOMENTUM = "STRONG_MOMENTUM"  # 3/3
    MOMENTUM = "MOMENTUM"  # 2/3
    WEAK = "WEAK"  # 1/3
    MEAN_REVERSION = "MEAN_REVERSION"  # 0/3


@dataclass
class RegimeResult:
    """Output of the regime classifier."""

    type: RegimeType
    score: int  # 0-3
    staircase: StaircaseResult
    volume: VolumeTrendResult
    volatility_score: float  # ATR ratio
    volatility_is_valid: bool  # ATR ratio >= 1.5
    tradeable: bool  # score >= 2 AND staircase is_valid


# ---------------------------------------------------------------------------
# ATR helpers
# ---------------------------------------------------------------------------

_ATR_PERIOD = 14


def _true_ranges(candles: list[Candle]) -> list[float]:
    """Compute true range for each candle (skipping the first)."""
    trs: list[float] = []
    for i in range(1, len(candles)):
        high_low = candles[i].high - candles[i].low
        high_prev_close = abs(candles[i].high - candles[i - 1].close)
        low_prev_close = abs(candles[i].low - candles[i - 1].close)
        trs.append(max(high_low, high_prev_close, low_prev_close))
    return trs


def _atr(candles: list[Candle], period: int = _ATR_PERIOD) -> float:
    """Average True Range over the last *period* bars (simple average)."""
    trs = _true_ranges(candles)
    if not trs:
        return 0.0
    window = trs[-period:] if len(trs) >= period else trs
    return float(np.mean(window))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def classify_regime(
    candles_1m: list[Candle],
    baseline_candles: list[Candle] | None = None,
    staircase_lookback: int = 120,
    volume_lookback: int = 120,
) -> RegimeResult:
    """Classify the current market regime.

    Three independent variables are scored:

    1. **Staircase** -- grindy trend pattern (via ``detect_staircase``).
    2. **Volume trend** -- increasing volume (via ``detect_volume_trend``).
    3. **Volatility** -- current ATR vs baseline ATR.  An ATR ratio >= 1.5
       means volatility has expanded enough for a momentum move.

    The regime score is the number of variables that pass (0-3).

    ``tradeable`` is ``True`` only when score >= 2 **and** the staircase
    component is valid.  This is the critical gate: even 2/3 passing will
    not unlock trading if the staircase itself is not confirmed.

    Parameters
    ----------
    candles_1m:
        Recent 1-minute candles (at least *staircase_lookback* bars
        recommended).
    baseline_candles:
        Longer history (e.g. 24h of 1-min candles) used to compute the
        baseline ATR.  If ``None``, the first half of *candles_1m* is used.
    staircase_lookback:
        Number of trailing candles for staircase detection.
    volume_lookback:
        Number of trailing candles for volume trend analysis.
    """
    # --- V1: Staircase ---
    staircase = detect_staircase(candles_1m, lookback=staircase_lookback)

    # --- V2: Volume trend ---
    volume = detect_volume_trend(candles_1m, lookback=volume_lookback)

    # --- V3: Volatility (ATR ratio) ---
    current_atr = _atr(candles_1m[-staircase_lookback:] if len(candles_1m) >= staircase_lookback else candles_1m)

    if baseline_candles is not None and len(baseline_candles) > _ATR_PERIOD:
        baseline_atr = _atr(baseline_candles)
    else:
        # Use first half of the window as baseline
        half = len(candles_1m) // 2
        if half > _ATR_PERIOD:
            baseline_atr = _atr(candles_1m[:half])
        else:
            baseline_atr = current_atr  # fallback: ratio will be 1.0

    if baseline_atr > 0:
        volatility_ratio = current_atr / baseline_atr
    else:
        volatility_ratio = 1.0

    volatility_is_valid = volatility_ratio >= 1.5

    # --- Tally ---
    score = 0
    if staircase.is_valid:
        score += 1
    if volume.is_valid:
        score += 1
    if volatility_is_valid:
        score += 1

    # --- Map to regime type ---
    if score == 3:
        regime_type = RegimeType.STRONG_MOMENTUM
    elif score == 2:
        regime_type = RegimeType.MOMENTUM
    elif score == 1:
        regime_type = RegimeType.WEAK
    else:
        regime_type = RegimeType.MEAN_REVERSION

    # CRITICAL: even if 2/3 met, if staircase NOT met -> not tradeable
    tradeable = score >= 2 and staircase.is_valid

    return RegimeResult(
        type=regime_type,
        score=score,
        staircase=staircase,
        volume=volume,
        volatility_score=round(volatility_ratio, 3),
        volatility_is_valid=volatility_is_valid,
        tradeable=tradeable,
    )
