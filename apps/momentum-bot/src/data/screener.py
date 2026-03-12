"""Coin scanner/screener for momentum candidates."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal

import structlog

from src.data.candle_store import CandleStore

if TYPE_CHECKING:
    from src.config import ScannerConfig, StrategyConfig

logger = structlog.get_logger(__name__)

# Coins listed fewer than this many days ago are excluded.
_MIN_LISTING_AGE_DAYS = 7
_MS_PER_DAY = 86_400_000


@dataclass(frozen=True, slots=True)
class CoinCandidate:
    """A coin that passed the screener filters."""

    coin: str
    direction: Literal["LONG", "SHORT"]
    change_1h_pct: float
    volume_per_minute: float  # USD/min over last hour
    volume_24h: float  # USD


class CoinScreener:
    """Scan Hyperliquid perpetuals for momentum candidates.

    The screener combines REST metadata (24h volume, OI, listing time) with
    in-memory candle data to rank coins by 1-hour price change.  The top N
    gainers and losers (by absolute change) that pass the liquidity filters
    are returned.
    """

    def __init__(
        self,
        info_client: Any,  # HyperliquidExecutor or any object with get_meta / get_all_mids
        candle_store: CandleStore,
        scanner_config: ScannerConfig,
        strategy_config: StrategyConfig,
    ) -> None:
        self._info = info_client
        self._candle_store = candle_store
        self._scanner_cfg = scanner_config
        self._strategy_cfg = strategy_config

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def scan(self) -> list[CoinCandidate]:
        """Run a full scan and return ranked momentum candidates.

        Steps:
        1. Fetch ``metaAndAssetCtxs`` for volume, OI, and listing metadata.
        2. Fetch all mid prices for current pricing.
        3. Compute 1h price change from candle store (or from 24h change
           if candle history is insufficient).
        4. Filter by minimum per-minute volume and 24h volume.
        5. Exclude coins listed fewer than 7 days ago.
        6. Return top N gainers (LONG) and top N losers (SHORT).
        """
        meta_raw: dict[str, Any] = await self._info.get_meta()
        all_mids: dict[str, float] = await self._info.get_all_mids()

        universe = meta_raw.get("universe", [])
        asset_ctxs: list[dict[str, Any]] = meta_raw.get("assetCtxs", [])

        if not universe or not asset_ctxs:
            logger.warning("screener_empty_meta")
            return []

        now_ms = int(time.time() * 1000)
        top_n = self._scanner_cfg.top_n_candidates
        min_vol_per_min = float(self._strategy_cfg.min_volume_per_minute_usd)
        min_24h_vol = float(self._scanner_cfg.min_24h_volume_usd)

        candidates: list[CoinCandidate] = []

        for idx, coin_meta in enumerate(universe):
            if idx >= len(asset_ctxs):
                break

            coin: str = coin_meta.get("name", "")
            if not coin:
                continue

            ctx = asset_ctxs[idx]

            # -- Filter: delisted coins --------------------------------
            if coin_meta.get("isDelisted", False):
                continue

            # -- Filter: recently listed coins -------------------------
            listing_ts = coin_meta.get("onboardTimestamp")
            if listing_ts is not None:
                age_days = (now_ms - int(listing_ts)) / _MS_PER_DAY
                if age_days < _MIN_LISTING_AGE_DAYS:
                    continue

            # -- Volume filters ----------------------------------------
            volume_24h = _safe_float(ctx.get("dayNtlVlm", 0))
            if volume_24h < min_24h_vol:
                continue

            # Approximate per-minute volume = 24h volume / 1440
            vol_per_min = volume_24h / 1440.0
            if vol_per_min < min_vol_per_min:
                continue

            # -- Price change ------------------------------------------
            change_1h = self._compute_1h_change(coin, all_mids.get(coin))

            if change_1h is None:
                # Fall back to 24h change stored in meta if available.
                day_change = _safe_float(ctx.get("dayChange"))
                if day_change == 0.0:
                    continue
                change_1h = day_change * 100.0  # Convert ratio to pct.

            direction: Literal["LONG", "SHORT"] = "LONG" if change_1h > 0 else "SHORT"

            candidates.append(
                CoinCandidate(
                    coin=coin,
                    direction=direction,
                    change_1h_pct=change_1h,
                    volume_per_minute=vol_per_min,
                    volume_24h=volume_24h,
                )
            )

        # Rank: top N gainers + top N losers by absolute 1h change.
        gainers = sorted(
            [c for c in candidates if c.direction == "LONG"],
            key=lambda c: c.change_1h_pct,
            reverse=True,
        )[:top_n]

        losers = sorted(
            [c for c in candidates if c.direction == "SHORT"],
            key=lambda c: c.change_1h_pct,
        )[:top_n]

        result = gainers + losers
        logger.info(
            "screener_scan_complete",
            total_universe=len(universe),
            after_filter=len(candidates),
            selected=len(result),
        )
        return result

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _compute_1h_change(self, coin: str, current_mid: float | None) -> float | None:
        """Compute 1h price change percent from the candle store.

        Returns ``None`` if there is not enough candle data (fewer than 60
        one-minute candles).
        """
        if current_mid is None or current_mid <= 0:
            return None

        candles = self._candle_store.get_candles(coin, count=60)
        if len(candles) < 60:
            return None

        open_price = candles[0].open
        if open_price <= 0:
            return None

        return ((current_mid - open_price) / open_price) * 100.0


def _safe_float(value: Any) -> float:
    """Convert *value* to float, returning 0.0 on failure."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0
