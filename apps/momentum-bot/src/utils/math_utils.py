"""Statistics and math helpers for the momentum strategy."""

from __future__ import annotations

import math
from typing import TypeVar

import numpy as np

from src.strategy.models import Candle

T = TypeVar("T")


def linear_regression_slope(values: list[float]) -> float:
    """Calculate the slope of a linear regression line through *values*.

    Uses numpy polyfit with degree 1.  Returns 0.0 when fewer than
    two data points are provided.
    """
    if len(values) < 2:
        return 0.0

    x = np.arange(len(values), dtype=np.float64)
    y = np.array(values, dtype=np.float64)

    coefficients: np.ndarray = np.polyfit(x, y, deg=1)
    slope: float = float(coefficients[0])
    return slope


def calculate_atr(candles: list[Candle], period: int = 14) -> float:
    """Calculate Average True Range over the last *period* candles.

    TR = max(high - low, |high - prev_close|, |low - prev_close|)
    ATR = simple moving average of TR over *period*.

    Returns 0.0 when there are not enough candles (need at least *period* + 1).
    """
    if len(candles) < period + 1:
        return 0.0

    # Use the last (period + 1) candles so we have `period` TR values.
    window = candles[-(period + 1) :]
    tr_values: list[float] = []

    for i in range(1, len(window)):
        high = window[i].high
        low = window[i].low
        prev_close = window[i - 1].close

        tr = max(
            high - low,
            abs(high - prev_close),
            abs(low - prev_close),
        )
        tr_values.append(tr)

    return sum(tr_values) / len(tr_values) if tr_values else 0.0


def mean(values: list[float]) -> float:
    """Arithmetic mean.  Returns 0.0 for an empty list."""
    if not values:
        return 0.0
    return sum(values) / len(values)


def stdev(values: list[float]) -> float:
    """Population standard deviation.  Returns 0.0 for fewer than 2 values."""
    if len(values) < 2:
        return 0.0

    avg = mean(values)
    variance = sum((v - avg) ** 2 for v in values) / len(values)
    return math.sqrt(variance)


def chunk(lst: list[T], size: int) -> list[list[T]]:
    """Split *lst* into sub-lists of at most *size* elements.

    The last chunk may be smaller than *size*.  An empty input returns
    an empty list.  *size* must be >= 1.
    """
    if size < 1:
        raise ValueError(f"chunk size must be >= 1, got {size}")

    return [lst[i : i + size] for i in range(0, len(lst), size)]
