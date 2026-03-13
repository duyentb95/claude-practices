"""Candle pipeline manager — orchestrates WS subscriptions and signal evaluation.

Connects the scanner (which identifies WHAT to watch) to the feeder (which
streams candle data) and the strategy engine (which generates signals).

Flow:
    Scanner → update_candidates() → bootstrap + subscribe → on candle close → generate_signal()
"""

from __future__ import annotations

import collections
import time
from collections.abc import Awaitable, Callable
from typing import Any

import structlog

from src.data.candle_bootstrap import bootstrap_candles
from src.data.candle_store import CandleStore
from src.data.feeder import HyperliquidFeeder
from src.strategy.models import Signal
from src.strategy.regime import classify_regime
from src.strategy.signal import generate_signal

logger = structlog.get_logger(__name__)

# Type for the callback invoked when a signal is generated.
OnSignalCallback = Callable[[Signal], Awaitable[None]]


class CandlePipelineManager:
    """Orchestrates candle subscriptions, bootstrap, and signal evaluation.

    Responsibilities:
    - Diff current subscriptions vs new scanner candidates.
    - Bootstrap new coins with historical candles (REST).
    - Subscribe/unsubscribe WS channels via the feeder.
    - On each 1m candle close, run regime classification + signal generation.
    - Emit events to the scanner terminal for dashboard visibility.
    """

    def __init__(
        self,
        feeder: HyperliquidFeeder,
        candle_store: CandleStore,
        scanner_events: collections.deque,
        on_signal_callback: OnSignalCallback,
        max_subs: int = 5,
        min_candles: int = 120,
        bootstrap_count: int = 200,
    ) -> None:
        self._feeder = feeder
        self._candle_store = candle_store
        self._events = scanner_events
        self._on_signal = on_signal_callback
        self._max_subs = max_subs
        self._min_candles = min_candles
        self._bootstrap_count = bootstrap_count

        # Currently subscribed coins managed by this pipeline.
        self._subscribed: set[str] = set()

        # Track last candle timestamp per coin for close detection.
        self._last_candle_ts: dict[str, int] = {}

        # Register candle callback on the feeder.
        self._feeder.on("candle", self._on_candle_update)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def subscribed_coins(self) -> set[str]:
        """Return the set of currently subscribed coins."""
        return set(self._subscribed)

    async def update_candidates(
        self,
        candidates: list[dict[str, Any]],
        protected_coins: set[str],
    ) -> None:
        """Update subscriptions based on new scanner candidates.

        - Unsubscribe coins no longer in candidates (unless protected).
        - Bootstrap and subscribe new coins (up to max_subs).
        """
        # Extract coin names from candidates, preserving rank order.
        candidate_coins = []
        seen = set()
        for c in candidates:
            coin = c["coin"]
            if coin not in seen:
                candidate_coins.append(coin)
                seen.add(coin)

        desired = set(candidate_coins[:self._max_subs]) | protected_coins

        # Unsubscribe stale coins.
        stale = self._subscribed - desired
        for coin in stale:
            await self._feeder.unsubscribe_coin(coin)
            self._subscribed.discard(coin)
            self._last_candle_ts.pop(coin, None)
            self._emit("UNSUB", f"Unsubscribed {coin} (no longer a candidate)")

        # Subscribe new coins (up to max_subs total).
        for coin in candidate_coins:
            if len(self._subscribed) >= self._max_subs:
                break
            if coin in self._subscribed:
                continue
            await self._bootstrap_and_subscribe(coin)

        # Always ensure protected coins are subscribed.
        for coin in protected_coins:
            if coin not in self._subscribed:
                await self._bootstrap_and_subscribe(coin)

    # ------------------------------------------------------------------
    # Internal: bootstrap + subscribe
    # ------------------------------------------------------------------

    async def _bootstrap_and_subscribe(self, coin: str) -> None:
        """Bootstrap historical candles via REST, subscribe WS, evaluate regime."""
        self._emit("BOOTSTRAP", f"Bootstrapping {coin} ({self._bootstrap_count} candles)...")

        loaded = await bootstrap_candles(
            coin=coin,
            candle_store=self._candle_store,
            count=self._bootstrap_count,
        )
        self._emit(
            "BOOTSTRAP",
            f"{coin}: loaded {loaded} historical candles",
        )

        # Subscribe to live WS candle feed.
        await self._feeder.subscribe_coin(coin)
        self._subscribed.add(coin)

        # Immediately evaluate regime for terminal visibility.
        candles = self._candle_store.get_candles(coin, self._min_candles)
        if len(candles) >= 20:
            regime = classify_regime(candles)
            self._emit(
                "REGIME",
                f"{coin}: {regime.type.value} ({regime.score}/3) "
                f"tradeable={regime.tradeable} "
                f"staircase={regime.staircase.direction} "
                f"vol_trend={'UP' if regime.volume.is_valid else 'FLAT'} "
                f"atr_ratio={regime.volatility_score}",
            )
        else:
            self._emit("REGIME", f"{coin}: insufficient data ({len(candles)} candles)")

    # ------------------------------------------------------------------
    # Internal: candle update callback
    # ------------------------------------------------------------------

    async def _on_candle_update(self, data: Any) -> None:
        """Called by the feeder for every candle WS message.

        Detects candle close by comparing timestamps: when we see a new
        timestamp for a coin, the previous candle is complete.
        """
        candles_raw: list[dict[str, Any]] = data if isinstance(data, list) else [data]

        for raw in candles_raw:
            coin: str = raw.get("s", "")
            if not coin or coin not in self._subscribed:
                continue

            ts = int(raw.get("t", 0))
            prev_ts = self._last_candle_ts.get(coin)
            self._last_candle_ts[coin] = ts

            # A new timestamp means the previous candle just closed.
            if prev_ts is not None and ts != prev_ts:
                await self._evaluate_coin(coin)

    # ------------------------------------------------------------------
    # Internal: signal evaluation on candle close
    # ------------------------------------------------------------------

    async def _evaluate_coin(self, coin: str) -> None:
        """Run regime classification and signal generation for *coin*."""
        candles = self._candle_store.get_candles(coin, self._min_candles)
        if len(candles) < 20:
            return

        signal = generate_signal(coin, candles)

        if signal is not None:
            self._emit(
                "SIGNAL",
                f"{coin} {signal.direction.value} — "
                f"entry={signal.entry_price:.6g} "
                f"SL={signal.stop_loss:.6g} "
                f"TP={signal.take_profit:.6g} "
                f"R:R={signal.rr_ratio:.2f} "
                f"regime={signal.regime_score}/3",
            )
            await self._on_signal(signal)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _emit(self, tag: str, msg: str, data: dict[str, Any] | None = None) -> None:
        """Push an event to the scanner terminal ring buffer."""
        entry: dict[str, Any] = {
            "ts": time.strftime("%H:%M:%S", time.gmtime()),
            "timestamp": time.time(),
            "tag": tag,
            "msg": msg,
        }
        if data:
            entry["data"] = data
        self._events.append(entry)
