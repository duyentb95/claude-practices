"""Swing point detection for momentum breakout strategy.

Identifies local highs/lows confirmed by surrounding bars, plus helpers
to find major swing levels and relevant stop-loss anchors.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .models import Candle


@dataclass
class SwingPoint:
    """A confirmed swing high or low."""

    type: Literal["high", "low"]
    price: float
    time: int  # epoch ms
    index: int
    strength: int  # how many bars on each side confirm it


# ---------------------------------------------------------------------------
# Core detection
# ---------------------------------------------------------------------------


def find_swing_points(
    candles: list[Candle],
    min_bars: int = 3,
) -> list[SwingPoint]:
    """Return all swing highs and lows confirmed by *min_bars* neighbours.

    A swing high at index *i* requires ``candle[i].high`` to be strictly
    greater than the high of every candle within *min_bars* on each side.
    Swing lows are the mirror image using ``.low``.

    Results are ordered by index (ascending).
    """
    if len(candles) < 2 * min_bars + 1:
        return []

    points: list[SwingPoint] = []

    for i in range(min_bars, len(candles) - min_bars):
        # --- swing high check ---
        is_high = True
        strength = 0
        for offset in range(1, min_bars + 1):
            if (
                candles[i].high > candles[i - offset].high
                and candles[i].high > candles[i + offset].high
            ):
                strength += 1
            else:
                is_high = False
                break

        if is_high:
            # Extend strength beyond min_bars if possible
            extra = min_bars + 1
            while (
                i - extra >= 0
                and i + extra < len(candles)
                and candles[i].high > candles[i - extra].high
                and candles[i].high > candles[i + extra].high
            ):
                strength += 1
                extra += 1

            points.append(
                SwingPoint(
                    type="high",
                    price=candles[i].high,
                    time=candles[i].timestamp,
                    index=i,
                    strength=strength,
                )
            )

        # --- swing low check ---
        is_low = True
        strength_low = 0
        for offset in range(1, min_bars + 1):
            if (
                candles[i].low < candles[i - offset].low
                and candles[i].low < candles[i + offset].low
            ):
                strength_low += 1
            else:
                is_low = False
                break

        if is_low:
            extra = min_bars + 1
            while (
                i - extra >= 0
                and i + extra < len(candles)
                and candles[i].low < candles[i - extra].low
                and candles[i].low < candles[i + extra].low
            ):
                strength_low += 1
                extra += 1

            points.append(
                SwingPoint(
                    type="low",
                    price=candles[i].low,
                    time=candles[i].timestamp,
                    index=i,
                    strength=strength_low,
                )
            )

    # Sort by index so callers can iterate chronologically
    points.sort(key=lambda p: p.index)
    return points


# ---------------------------------------------------------------------------
# Major swing helpers (multi-timeframe friendly)
# ---------------------------------------------------------------------------


def find_major_swing_high(
    candles: list[Candle],
    timeframes: list[str] | None = None,
) -> SwingPoint | None:
    """Return the highest high over the entire candle set.

    *timeframes* is accepted for API compatibility (the caller is expected
    to pass the appropriate candle resolution).  The function simply finds
    the bar with the highest ``.high`` and wraps it in a ``SwingPoint``.
    """
    if not candles:
        return None

    best_idx = 0
    for i in range(1, len(candles)):
        if candles[i].high > candles[best_idx].high:
            best_idx = i

    return SwingPoint(
        type="high",
        price=candles[best_idx].high,
        time=candles[best_idx].timestamp,
        index=best_idx,
        strength=len(candles),  # confirmed by all bars
    )


def find_major_swing_low(
    candles: list[Candle],
    timeframes: list[str] | None = None,
) -> SwingPoint | None:
    """Return the lowest low over the entire candle set."""
    if not candles:
        return None

    best_idx = 0
    for i in range(1, len(candles)):
        if candles[i].low < candles[best_idx].low:
            best_idx = i

    return SwingPoint(
        type="low",
        price=candles[best_idx].low,
        time=candles[best_idx].timestamp,
        index=best_idx,
        strength=len(candles),
    )


# ---------------------------------------------------------------------------
# Relevant swing for stop-loss placement
# ---------------------------------------------------------------------------


def find_relevant_swing_low(
    candles: list[Candle],
    entry_index: int,
    min_bars: int = 3,
) -> SwingPoint | None:
    """Most recent confirmed swing low *below* the price at *entry_index*.

    Used to anchor stop-loss for long positions.
    """
    if entry_index < 0 or entry_index >= len(candles):
        return None

    current_price = candles[entry_index].close
    points = find_swing_points(candles[: entry_index + 1], min_bars=min_bars)

    # Walk backwards through swing lows that are below current price
    candidates = [p for p in points if p.type == "low" and p.price < current_price]
    if not candidates:
        return None

    # Return the most recent one (highest index)
    return max(candidates, key=lambda p: p.index)


def find_relevant_swing_high(
    candles: list[Candle],
    entry_index: int,
    min_bars: int = 3,
) -> SwingPoint | None:
    """Most recent confirmed swing high *above* the price at *entry_index*.

    Used to anchor stop-loss for short positions.
    """
    if entry_index < 0 or entry_index >= len(candles):
        return None

    current_price = candles[entry_index].close
    points = find_swing_points(candles[: entry_index + 1], min_bars=min_bars)

    candidates = [p for p in points if p.type == "high" and p.price > current_price]
    if not candidates:
        return None

    return max(candidates, key=lambda p: p.index)
