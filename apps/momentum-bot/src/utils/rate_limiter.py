"""Weight-based rate limiter for Hyperliquid REST API.

Hyperliquid enforces 1200 weight/minute per IP.
Different endpoints have different weights:

  Weight 2:  l2Book, allMids, clearinghouseState, orderStatus,
             spotClearinghouseState, exchangeStatus
  Weight 20: Most other info endpoints (metaAndAssetCtxs, userFills, etc.)
  Weight 60: userRole
  Variable:  candleSnapshot  = 20 + ceil(items / 60)
             userFills/etc.  = 20 + ceil(items / 20)  (response-dependent)

This module provides a shared async rate limiter that tracks weight
consumption via a sliding window and pauses callers when budget is low.
"""

from __future__ import annotations

import asyncio
import time
from collections import deque
from typing import Any, TypeVar

import aiohttp

from src.utils.logger import get_logger

log = get_logger(__name__)

T = TypeVar("T")

# ── Weight table ──────────────────────────────────────────────────────
LIGHT_ENDPOINTS = frozenset({
    "l2Book", "allMids", "clearinghouseState", "orderStatus",
    "spotClearinghouseState", "exchangeStatus",
})

HEAVY_ENDPOINTS = frozenset({
    "userRole",
})

# Endpoints whose weight grows with response size
VARIABLE_ENDPOINTS: dict[str, int] = {
    "candleSnapshot": 60,   # +1 per 60 items
    "userFills": 20,        # +1 per 20 items
    "userFillsByTime": 20,
    "recentTrades": 20,
    "historicalOrders": 20,
}

WEIGHT_BUDGET = 1200       # per minute
WINDOW_SECONDS = 60        # sliding window
SAFETY_MARGIN = 0.85       # use at most 85% of budget to leave headroom
EFFECTIVE_BUDGET = int(WEIGHT_BUDGET * SAFETY_MARGIN)


def estimate_weight(endpoint_type: str, response_items: int = 0) -> int:
    """Estimate the weight of a request based on endpoint type."""
    if endpoint_type in LIGHT_ENDPOINTS:
        return 2
    if endpoint_type in HEAVY_ENDPOINTS:
        return 60
    if endpoint_type in VARIABLE_ENDPOINTS:
        divisor = VARIABLE_ENDPOINTS[endpoint_type]
        return 20 + (response_items + divisor - 1) // divisor
    # Default: standard info endpoint
    return 20


class HyperliquidRateLimiter:
    """Async weight-based rate limiter with sliding window.

    Usage::

        limiter = HyperliquidRateLimiter()

        # Simple call — weight auto-calculated from endpoint type
        data = await limiter.post_info(session, url, {"type": "l2Book", "coin": "BTC"})

        # Or acquire weight manually before custom logic
        async with limiter.acquire(weight=20):
            ...  # make your own request
    """

    def __init__(self, budget: int = EFFECTIVE_BUDGET) -> None:
        self._budget = budget
        self._window: deque[tuple[float, int]] = deque()  # (timestamp, weight)
        self._lock = asyncio.Lock()
        self._total_requests = 0
        self._total_weight = 0

    @property
    def used_weight(self) -> int:
        """Weight consumed in the current sliding window."""
        self._prune()
        return sum(w for _, w in self._window)

    @property
    def remaining_weight(self) -> int:
        return max(0, self._budget - self.used_weight)

    @property
    def stats(self) -> dict[str, Any]:
        return {
            "budget": self._budget,
            "used": self.used_weight,
            "remaining": self.remaining_weight,
            "total_requests": self._total_requests,
            "total_weight": self._total_weight,
        }

    def _prune(self) -> None:
        """Remove entries older than the sliding window."""
        cutoff = time.monotonic() - WINDOW_SECONDS
        while self._window and self._window[0][0] < cutoff:
            self._window.popleft()

    async def _wait_for_budget(self, weight: int) -> None:
        """Block until enough budget is available."""
        while True:
            self._prune()
            used = sum(w for _, w in self._window)
            if used + weight <= self._budget:
                return
            # Calculate how long until enough weight expires
            needed = used + weight - self._budget
            freed = 0
            wait_until = time.monotonic()
            for ts, w in self._window:
                freed += w
                wait_until = ts + WINDOW_SECONDS
                if freed >= needed:
                    break
            sleep_time = max(0.1, wait_until - time.monotonic() + 0.05)
            log.debug(
                "rate_limiter_waiting",
                sleep=round(sleep_time, 2),
                used=used,
                weight=weight,
                budget=self._budget,
            )
            await asyncio.sleep(sleep_time)

    async def acquire(self, weight: int = 20) -> None:
        """Acquire rate limit budget. Blocks if budget exhausted."""
        async with self._lock:
            await self._wait_for_budget(weight)
            self._window.append((time.monotonic(), weight))
            self._total_requests += 1
            self._total_weight += weight

    async def post_info(
        self,
        session: aiohttp.ClientSession,
        url: str,
        payload: dict[str, Any],
        *,
        timeout: float = 15,
    ) -> Any:
        """POST /info with automatic rate limiting and weight tracking.

        Returns parsed JSON on success, None on error.
        """
        endpoint_type = payload.get("type", "")
        weight = estimate_weight(endpoint_type)

        await self.acquire(weight)

        try:
            async with session.post(
                url,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=timeout),
            ) as resp:
                if resp.status == 429:
                    log.warning("rate_limited_429", endpoint=endpoint_type)
                    # Back off and retry once
                    await asyncio.sleep(5)
                    await self.acquire(weight)
                    async with session.post(
                        url,
                        json=payload,
                        timeout=aiohttp.ClientTimeout(total=timeout),
                    ) as retry_resp:
                        if retry_resp.status != 200:
                            log.warning(
                                "rate_limited_retry_failed",
                                endpoint=endpoint_type,
                                status=retry_resp.status,
                            )
                            return None
                        return await retry_resp.json()

                if resp.status != 200:
                    text = await resp.text()
                    log.warning(
                        "hl_api_error",
                        endpoint=endpoint_type,
                        status=resp.status,
                        body=text[:200],
                    )
                    return None

                data = await resp.json()

                # Update weight for variable endpoints based on response size
                if endpoint_type in VARIABLE_ENDPOINTS and isinstance(data, list):
                    actual_weight = estimate_weight(endpoint_type, len(data))
                    if actual_weight > weight:
                        extra = actual_weight - weight
                        async with self._lock:
                            self._window.append((time.monotonic(), extra))
                            self._total_weight += extra

                return data

        except asyncio.TimeoutError:
            log.warning("hl_api_timeout", endpoint=endpoint_type)
            return None
        except Exception:
            log.exception("hl_api_request_failed", endpoint=endpoint_type)
            return None
