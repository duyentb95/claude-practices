"""Hyperliquid-specific helpers for price/size rounding and slippage.

Price rounding follows the official Hyperliquid tick-size rules:
    https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size

    maxDecimals = max(0, 6 - szDecimals)
    Round to 5 significant digits, capped at maxDecimals decimal places.
"""

from __future__ import annotations

import math
import os
import time
from typing import Any

import aiohttp
import structlog

logger = structlog.get_logger(__name__)

HYPER_API_URL = os.getenv("HYPER_API_URL", "https://api.hyperliquid.xyz")
INFO_ENDPOINT = f"{HYPER_API_URL}/info"


# ---------------------------------------------------------------------------
# Price rounding (faithful port of TypeScript hyperliquidRoundPrice)
# ---------------------------------------------------------------------------


def round_price(price: float, sz_decimals: int, significant_digits: int = 5) -> float:
    """Round *price* per Hyperliquid tick-size rules.

    Algorithm (mirrors the TypeScript SDK):
        1. Compute max allowed decimal places: ``max(0, 6 - szDecimals)``.
        2. Determine decimal places needed for *significant_digits* sig-figs.
        3. Actual decimals = min(needed, maxDecimals), clamped to >= 0.
        4. Round to that many decimal places.

    Args:
        price: The raw price to round.
        sz_decimals: The ``szDecimals`` value from Hyperliquid asset metadata.
        significant_digits: Number of significant digits (default 5).

    Returns:
        The rounded price as a float.
    """
    if price == 0.0:
        return 0.0

    max_decimals = max(0, 6 - sz_decimals)

    order_of_magnitude = math.floor(math.log10(abs(price)))

    # Decimal places required to maintain significant_digits sig-figs.
    needed_decimal_places = significant_digits - order_of_magnitude - 1

    # Clamp between 0 and max_decimals.
    actual_decimal_places = min(max(needed_decimal_places, 0), max_decimals)

    return round(price, actual_decimal_places)


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


# ---------------------------------------------------------------------------
# Asset metadata cache — provides szDecimals per coin
# ---------------------------------------------------------------------------


class AssetMetaCache:
    """Caches per-coin metadata (szDecimals, maxLeverage, etc.) from metaAndAssetCtxs.

    Refreshed at most once per ``ttl_seconds`` (default 5 minutes).
    """

    def __init__(self, ttl_seconds: float = 300.0) -> None:
        self._ttl = ttl_seconds
        self._last_fetch: float = 0.0
        self._meta: dict[str, dict[str, Any]] = {}
        self._session: aiohttp.ClientSession | None = None

    def get_sz_decimals(self, coin: str) -> int:
        """Return szDecimals for *coin*, defaulting to 0 if unknown."""
        info = self._meta.get(coin)
        if info is None:
            return 0
        return int(info.get("szDecimals", 0))

    def get_max_decimals(self, coin: str) -> int:
        """Return max price decimal places for *coin*."""
        return max(0, 6 - self.get_sz_decimals(coin))

    def get_meta(self, coin: str) -> dict[str, Any]:
        """Return full metadata dict for *coin*, or empty dict."""
        return self._meta.get(coin, {})

    @property
    def is_loaded(self) -> bool:
        return len(self._meta) > 0

    async def ensure_loaded(self) -> None:
        """Fetch metadata if cache is empty or stale."""
        now = time.time()
        if self._meta and (now - self._last_fetch) < self._ttl:
            return
        await self.refresh()

    async def refresh(self) -> None:
        """Fetch metaAndAssetCtxs and rebuild the cache."""
        if self._session is None:
            self._session = aiohttp.ClientSession()

        try:
            async with self._session.post(
                INFO_ENDPOINT,
                json={"type": "metaAndAssetCtxs"},
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status != 200:
                    logger.warning("asset_meta_fetch_error", status=resp.status)
                    return
                data = await resp.json()
        except Exception as exc:
            logger.warning("asset_meta_fetch_failed", error=str(exc))
            return

        if not isinstance(data, list) or len(data) < 2:
            logger.warning("asset_meta_bad_response")
            return

        meta_section = data[0]
        universe = meta_section.get("universe", [])

        new_meta: dict[str, dict[str, Any]] = {}
        for coin_info in universe:
            name = coin_info.get("name", "")
            if name:
                new_meta[name] = coin_info

        self._meta = new_meta
        self._last_fetch = time.time()
        logger.info("asset_meta_refreshed", coins=len(new_meta))

    async def close(self) -> None:
        if self._session:
            await self._session.close()
            self._session = None
