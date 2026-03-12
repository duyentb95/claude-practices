"""Hyperliquid-specific helpers for price/size rounding and slippage."""

from __future__ import annotations

import math


def round_price(price: float, sz_decimals: int) -> float:
    """Round price to 5 significant digits, capped at max(0, 6 - szDecimals) decimal places.

    This mirrors the TypeScript ``hyperliquidRoundPrice()`` used across the
    NestJS monorepo.

    Args:
        price: The raw price to round.
        sz_decimals: The ``szDecimals`` value from Hyperliquid asset metadata.

    Returns:
        The rounded price.
    """
    if price == 0.0:
        return 0.0

    max_decimals = max(0, 6 - sz_decimals)

    # Round to 5 significant digits.
    magnitude = math.floor(math.log10(abs(price)))
    sig_digits = 5
    factor = 10 ** (sig_digits - 1 - magnitude)
    rounded = round(price * factor) / factor

    # Cap at max_decimals decimal places.
    rounded = round(rounded, max_decimals)
    return rounded


def round_size(size: float, sz_decimals: int) -> float:
    """Round size to *sz_decimals* decimal places.

    Truncates toward zero rather than rounding to avoid exceeding
    available balance.

    Args:
        size: The raw position size.
        sz_decimals: Number of allowed decimal places for this asset.

    Returns:
        The truncated size.
    """
    if sz_decimals <= 0:
        return float(int(size))

    factor = 10 ** sz_decimals
    return math.trunc(size * factor) / factor


def calculate_slippage_price(
    mid_price: float,
    is_buy: bool,
    slippage_pct: float = 0.005,
) -> float:
    """Calculate a limit price with slippage for IOC market-style orders.

    For buys the price is pushed *up* by ``slippage_pct``.
    For sells the price is pushed *down*.

    Args:
        mid_price: Current mid (or mark) price.
        is_buy: ``True`` for a buy order, ``False`` for a sell order.
        slippage_pct: Slippage tolerance as a decimal fraction
            (0.005 = 0.5%).

    Returns:
        The adjusted limit price (not rounded -- caller should apply
        ``round_price`` afterwards).
    """
    if is_buy:
        return mid_price * (1.0 + slippage_pct)
    return mid_price * (1.0 - slippage_pct)
