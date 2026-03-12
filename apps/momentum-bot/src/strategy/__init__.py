"""Momentum breakout strategy layer.

Re-exports the main public interfaces so callers can do::

    from strategy import generate_signal, classify_regime, Signal, RegimeResult
"""

from .models import (
    Candle,
    ExitReason,
    ManagedPosition,
    PositionStatus,
    Signal,
    SignalDirection,
)
from .regime import RegimeResult, RegimeType, classify_regime
from .signal import generate_signal
from .staircase import StaircaseResult, detect_staircase
from .swing_points import SwingPoint, find_swing_points
from .volume_trend import VolumeTrend, VolumeTrendResult, detect_volume_trend

__all__ = [
    "Candle",
    "ExitReason",
    "ManagedPosition",
    "PositionStatus",
    "RegimeResult",
    "RegimeType",
    "Signal",
    "SignalDirection",
    "StaircaseResult",
    "SwingPoint",
    "VolumeTrend",
    "VolumeTrendResult",
    "classify_regime",
    "detect_staircase",
    "detect_volume_trend",
    "find_swing_points",
    "generate_signal",
]
