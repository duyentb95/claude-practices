"""Orderbook analysis — L2 book snapshots with imbalance and wall detection.

Fetches L2Book via REST (rate-limited) or consumes WS l2Book updates.
Computes bid/ask imbalance, spread, depth, and wall detection for
signal quality assessment.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import aiohttp
import structlog

if TYPE_CHECKING:
    from src.utils.rate_limiter import HyperliquidRateLimiter

logger = structlog.get_logger(__name__)


@dataclass
class OrderbookSnapshot:
    """Processed orderbook metrics for a single coin."""

    coin: str
    timestamp: float

    # Mid price
    mid_price: float = 0.0

    # Spread
    spread_bps: float = 0.0         # bid-ask spread in basis points
    best_bid: float = 0.0
    best_ask: float = 0.0

    # Depth (USD value within % of mid)
    bid_depth_1pct: float = 0.0     # total bid value within 1% of mid
    ask_depth_1pct: float = 0.0     # total ask value within 1% of mid
    bid_depth_2pct: float = 0.0
    ask_depth_2pct: float = 0.0

    # Imbalance: (bid - ask) / (bid + ask), range [-1, +1]
    # +1 = all bids (bullish), -1 = all asks (bearish)
    imbalance_1pct: float = 0.0
    imbalance_2pct: float = 0.0

    # Top-of-book imbalance
    top_bid_size: float = 0.0       # size at best bid
    top_ask_size: float = 0.0       # size at best ask
    top_imbalance: float = 0.0      # (top_bid - top_ask) / (top_bid + top_ask)

    # Wall detection (largest cluster within 2% of mid)
    bid_wall_price: float = 0.0
    bid_wall_size: float = 0.0
    ask_wall_price: float = 0.0
    ask_wall_size: float = 0.0

    # Number of levels
    bid_levels: int = 0
    ask_levels: int = 0


def parse_l2book(data: dict[str, Any]) -> OrderbookSnapshot | None:
    """Parse a raw l2Book response into an OrderbookSnapshot.

    Expected format: {"coin": "BTC", "time": ms, "levels": [[bids], [asks]]}
    Each level: {"px": "95000.0", "sz": "0.5", "n": 3}
    """
    coin = data.get("coin", "")
    ts = data.get("time", time.time() * 1000) / 1000
    levels = data.get("levels", [])

    if not isinstance(levels, list) or len(levels) < 2:
        return None

    raw_bids = levels[0] if isinstance(levels[0], list) else []
    raw_asks = levels[1] if isinstance(levels[1], list) else []

    if not raw_bids or not raw_asks:
        return None

    # Parse levels: [(price, size, n_orders)]
    bids = []
    for lv in raw_bids:
        try:
            bids.append((float(lv["px"]), float(lv["sz"]), int(lv.get("n", 1))))
        except (KeyError, ValueError, TypeError):
            continue

    asks = []
    for lv in raw_asks:
        try:
            asks.append((float(lv["px"]), float(lv["sz"]), int(lv.get("n", 1))))
        except (KeyError, ValueError, TypeError):
            continue

    if not bids or not asks:
        return None

    best_bid = bids[0][0]
    best_ask = asks[0][0]
    mid = (best_bid + best_ask) / 2

    if mid <= 0:
        return None

    spread_bps = (best_ask - best_bid) / mid * 10_000

    # Calculate depth and find walls within % of mid
    def _depth_and_wall(levels: list[tuple[float, float, int]], pct: float) -> tuple[float, float, float]:
        """Returns (depth_usd, wall_price, wall_size)."""
        depth = 0.0
        wall_px = 0.0
        wall_sz = 0.0
        threshold = mid * pct / 100
        for px, sz, _ in levels:
            if abs(px - mid) <= threshold:
                val = px * sz
                depth += val
                if sz > wall_sz:
                    wall_sz = sz
                    wall_px = px
        return depth, wall_px, wall_sz

    bid_d1, _, _ = _depth_and_wall(bids, 1.0)
    ask_d1, _, _ = _depth_and_wall(asks, 1.0)
    bid_d2, bid_wall_px, bid_wall_sz = _depth_and_wall(bids, 2.0)
    ask_d2, ask_wall_px, ask_wall_sz = _depth_and_wall(asks, 2.0)

    def _imbalance(b: float, a: float) -> float:
        total = b + a
        return (b - a) / total if total > 0 else 0.0

    top_bid_sz = bids[0][1]
    top_ask_sz = asks[0][1]

    return OrderbookSnapshot(
        coin=coin,
        timestamp=ts,
        mid_price=mid,
        spread_bps=round(spread_bps, 2),
        best_bid=best_bid,
        best_ask=best_ask,
        bid_depth_1pct=bid_d1,
        ask_depth_1pct=ask_d1,
        bid_depth_2pct=bid_d2,
        ask_depth_2pct=ask_d2,
        imbalance_1pct=round(_imbalance(bid_d1, ask_d1), 4),
        imbalance_2pct=round(_imbalance(bid_d2, ask_d2), 4),
        top_bid_size=top_bid_sz,
        top_ask_size=top_ask_sz,
        top_imbalance=round(_imbalance(top_bid_sz, top_ask_sz), 4),
        bid_wall_price=bid_wall_px,
        bid_wall_size=bid_wall_sz,
        ask_wall_price=ask_wall_px,
        ask_wall_size=ask_wall_sz,
        bid_levels=len(bids),
        ask_levels=len(asks),
    )


class OrderbookTracker:
    """Tracks orderbook state for multiple coins.

    Can consume either WS l2Book updates or REST snapshots.
    Register as callback: feeder.on("l2Book", tracker.on_l2book)
    """

    def __init__(self) -> None:
        self._snapshots: dict[str, OrderbookSnapshot] = {}

    def get_snapshot(self, coin: str) -> OrderbookSnapshot | None:
        """Get latest orderbook snapshot for a coin."""
        return self._snapshots.get(coin)

    def remove_coin(self, coin: str) -> None:
        self._snapshots.pop(coin, None)

    async def on_l2book(self, data: dict[str, Any]) -> None:
        """Callback for feeder 'l2Book' events.

        Expected data format from Hyperliquid WS:
        {"channel": "l2Book", "data": {"coin": "BTC", "time": ms, "levels": [...]}}
        """
        book_data = data.get("data", data)
        snap = parse_l2book(book_data)
        if snap:
            self._snapshots[snap.coin] = snap

    async def fetch_snapshot(
        self,
        coin: str,
        session: aiohttp.ClientSession,
        api_url: str,
        rate_limiter: HyperliquidRateLimiter | None = None,
    ) -> OrderbookSnapshot | None:
        """Fetch L2Book via REST and parse. Uses rate limiter if provided."""
        payload = {"type": "l2Book", "coin": coin}

        if rate_limiter:
            raw = await rate_limiter.post_info(session, api_url, payload)
        else:
            try:
                async with session.post(
                    api_url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    if resp.status != 200:
                        return None
                    raw = await resp.json()
            except Exception:
                logger.exception("orderbook_fetch_error", coin=coin)
                return None

        if raw is None:
            return None

        snap = parse_l2book(raw)
        if snap:
            self._snapshots[coin] = snap
        return snap

    def all_snapshots(self) -> dict[str, OrderbookSnapshot]:
        return dict(self._snapshots)
