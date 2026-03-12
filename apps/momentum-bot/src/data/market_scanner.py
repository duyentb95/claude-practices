"""Market scanner — fetches metaAndAssetCtxs and screens for momentum candidates.

Produces structured scanner events for the dashboard terminal view.
"""

from __future__ import annotations

import collections
import os
import time
from typing import Any

import aiohttp

from src.utils.logger import get_logger

log = get_logger(__name__)

HYPER_API_URL = os.getenv("HYPER_API_URL", "https://api.hyperliquid.xyz")
INFO_ENDPOINT = f"{HYPER_API_URL}/info"

MAX_SCANNER_EVENTS = 300


def _safe_float(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _fmt_usd(v: float) -> str:
    """Format USD value compactly."""
    if v >= 1_000_000_000:
        return f"${v / 1_000_000_000:.2f}B"
    if v >= 1_000_000:
        return f"${v / 1_000_000:.1f}M"
    if v >= 1_000:
        return f"${v / 1_000:.1f}K"
    return f"${v:.0f}"


class MarketScanner:
    """Fetches market data and screens coins for momentum candidates.

    Emits structured events into a shared deque for the dashboard
    scanner terminal.
    """

    def __init__(
        self,
        scanner_events: collections.deque,
        min_24h_volume_usd: float = 5_000_000,
        top_n: int = 10,
    ) -> None:
        self._events = scanner_events
        self._min_vol = min_24h_volume_usd
        self._top_n = top_n
        self._session: aiohttp.ClientSession | None = None
        self._scan_count = 0

    def _emit(self, tag: str, msg: str, data: dict[str, Any] | None = None) -> None:
        """Push a scanner event to the ring buffer."""
        entry: dict[str, Any] = {
            "ts": time.strftime("%H:%M:%S", time.gmtime()),
            "timestamp": time.time(),
            "tag": tag,
            "msg": msg,
        }
        if data:
            entry["data"] = data
        self._events.append(entry)

    async def _post_info(self, payload: dict[str, Any]) -> Any:
        if self._session is None:
            self._session = aiohttp.ClientSession()
        try:
            async with self._session.post(
                INFO_ENDPOINT,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status != 200:
                    self._emit("ERROR", f"API returned {resp.status}")
                    return None
                return await resp.json()
        except Exception as exc:
            self._emit("ERROR", f"API request failed: {exc}")
            return None

    async def run_scan(self) -> list[dict[str, Any]]:
        """Execute a full market scan cycle. Returns top candidates."""
        self._scan_count += 1
        self._emit("SCAN", f"--- Scan cycle #{self._scan_count} ---")
        self._emit("FETCH", "Fetching metaAndAssetCtxs...")

        data = await self._post_info({"type": "metaAndAssetCtxs"})
        if data is None or not isinstance(data, list) or len(data) < 2:
            self._emit("ERROR", "Failed to fetch market data")
            return []

        meta = data[0]
        asset_ctxs = data[1]
        universe = meta.get("universe", [])

        self._emit("FETCH", f"Loaded {len(universe)} perp coins")

        # Build candidate list
        candidates: list[dict[str, Any]] = []
        skipped_vol = 0
        skipped_delisted = 0

        for idx, coin_meta in enumerate(universe):
            if idx >= len(asset_ctxs):
                break

            coin = coin_meta.get("name", "")
            if not coin:
                continue

            if coin_meta.get("isDelisted", False):
                skipped_delisted += 1
                continue

            ctx = asset_ctxs[idx]
            vol_24h = _safe_float(ctx.get("dayNtlVlm", 0))
            if vol_24h < self._min_vol:
                skipped_vol += 1
                continue

            day_change = _safe_float(ctx.get("dayChange", 0))
            mark_px = _safe_float(ctx.get("markPx", 0))
            open_interest = _safe_float(ctx.get("openInterest", 0))
            oi_usd = open_interest * mark_px
            funding = _safe_float(ctx.get("funding", 0))

            candidates.append({
                "coin": coin,
                "price": mark_px,
                "change_24h": day_change * 100,
                "volume_24h": vol_24h,
                "oi_usd": oi_usd,
                "funding": funding * 100,
                "direction": "LONG" if day_change > 0 else "SHORT",
            })

        self._emit(
            "FILTER",
            f"{len(candidates)} pass volume filter (>{_fmt_usd(self._min_vol)}), "
            f"skipped: {skipped_vol} low-vol, {skipped_delisted} delisted",
        )

        if not candidates:
            self._emit("SCAN", "No candidates after filtering")
            return []

        # Sort by absolute change
        candidates.sort(key=lambda c: abs(c["change_24h"]), reverse=True)

        # Top gainers
        gainers = sorted(
            [c for c in candidates if c["change_24h"] > 0],
            key=lambda c: c["change_24h"],
            reverse=True,
        )[:self._top_n]

        # Top losers
        losers = sorted(
            [c for c in candidates if c["change_24h"] < 0],
            key=lambda c: c["change_24h"],
        )[:self._top_n]

        # Emit top movers
        if gainers:
            g_str = ", ".join(
                f"{c['coin']} +{c['change_24h']:.1f}%" for c in gainers[:5]
            )
            self._emit("MOVERS", f"Top gainers: {g_str}")

        if losers:
            l_str = ", ".join(
                f"{c['coin']} {c['change_24h']:.1f}%" for c in losers[:5]
            )
            self._emit("MOVERS", f"Top losers: {l_str}")

        # Evaluate each top candidate
        top_candidates = (gainers + losers)[:self._top_n * 2]
        for c in top_candidates:
            vol_score = min(c["volume_24h"] / 50_000_000, 1.0)  # normalize to 50M
            momentum_score = min(abs(c["change_24h"]) / 10.0, 1.0)  # normalize to 10%
            oi_score = min(c["oi_usd"] / 100_000_000, 1.0)  # normalize to 100M
            composite = round((vol_score * 0.3 + momentum_score * 0.4 + oi_score * 0.3) * 100, 1)

            direction = c["direction"]
            chg = c["change_24h"]
            sign = "+" if chg > 0 else ""

            self._emit(
                "EVAL",
                f"{c['coin']:>6} {direction:>5} {sign}{chg:.2f}% "
                f"vol={_fmt_usd(c['volume_24h'])} "
                f"OI={_fmt_usd(c['oi_usd'])} "
                f"score={composite}",
                data={
                    "coin": c["coin"],
                    "direction": direction,
                    "change": chg,
                    "volume": c["volume_24h"],
                    "oi": c["oi_usd"],
                    "funding": c["funding"],
                    "score": composite,
                    "vol_score": round(vol_score, 2),
                    "momentum_score": round(momentum_score, 2),
                    "oi_score": round(oi_score, 2),
                },
            )

            # Check if strong enough for signal
            if composite >= 60:
                self._emit(
                    "SIGNAL",
                    f"{c['coin']} {direction} — score {composite} — "
                    f"entry ~{c['price']:.4g} funding={c['funding']:.4f}%",
                    data=c,
                )
            elif composite >= 40:
                self._emit(
                    "WATCH",
                    f"{c['coin']} {direction} — score {composite} — monitoring",
                )
            else:
                self._emit(
                    "SKIP",
                    f"{c['coin']} — score {composite} too low (<40)",
                )

        self._emit(
            "SCAN",
            f"Cycle #{self._scan_count} complete — "
            f"{len(top_candidates)} evaluated, "
            f"{sum(1 for c in top_candidates if (min(c['volume_24h']/50_000_000,1)*0.3+min(abs(c['change_24h'])/10,1)*0.4+min(c['oi_usd']/100_000_000,1)*0.3)*100 >= 60)} signals",
        )

        return top_candidates

    async def close(self) -> None:
        if self._session:
            await self._session.close()
            self._session = None
