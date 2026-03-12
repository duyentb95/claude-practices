"""Thread-safe rolling candle window per coin."""

from __future__ import annotations

import threading
from collections import deque

import structlog

from src.strategy.models import Candle

logger = structlog.get_logger(__name__)


class CandleStore:
    """In-memory rolling window of candles per coin.

    All public methods are thread-safe via a reentrant lock so that the
    WebSocket reader and strategy consumers can operate concurrently.
    """

    def __init__(self, max_candles: int = 1500) -> None:
        self._max_candles = max_candles
        self._store: dict[str, deque[Candle]] = {}
        self._lock = threading.RLock()

    # ------------------------------------------------------------------
    # Write path
    # ------------------------------------------------------------------

    def add_candle(self, coin: str, candle: Candle) -> None:
        """Append *candle* to the rolling window for *coin*.

        If the newest stored candle has the same timestamp, it is replaced
        (update in place) rather than appended.  This handles partial candle
        updates that Hyperliquid sends while the minute is still open.
        """
        with self._lock:
            buf = self._store.get(coin)
            if buf is None:
                buf = deque(maxlen=self._max_candles)
                self._store[coin] = buf

            # Replace if same timestamp (live candle update)
            if buf and buf[-1].timestamp == candle.timestamp:
                buf[-1] = candle
            else:
                buf.append(candle)

        logger.debug(
            "candle_stored",
            coin=coin,
            ts=candle.timestamp,
            close=candle.close,
            depth=len(buf),
        )

    # ------------------------------------------------------------------
    # Read path
    # ------------------------------------------------------------------

    def get_candles(self, coin: str, count: int = 120) -> list[Candle]:
        """Return the most recent *count* candles for *coin*.

        Returns an empty list when the coin has no data.
        """
        with self._lock:
            buf = self._store.get(coin)
            if buf is None:
                return []
            # Slice from the right end of the deque.
            if count >= len(buf):
                return list(buf)
            return list(buf)[-count:]

    def get_latest(self, coin: str) -> Candle | None:
        """Return the most recent candle for *coin*, or ``None``."""
        with self._lock:
            buf = self._store.get(coin)
            if buf:
                return buf[-1]
            return None

    def get_coins(self) -> list[str]:
        """Return a sorted list of all coins currently tracked."""
        with self._lock:
            return sorted(self._store.keys())

    def has_enough_data(self, coin: str, min_candles: int = 120) -> bool:
        """Check whether *coin* has at least *min_candles* stored."""
        with self._lock:
            buf = self._store.get(coin)
            if buf is None:
                return False
            return len(buf) >= min_candles

    # ------------------------------------------------------------------
    # Maintenance
    # ------------------------------------------------------------------

    def remove_coin(self, coin: str) -> None:
        """Drop all stored candles for *coin*."""
        with self._lock:
            self._store.pop(coin, None)

    def clear(self) -> None:
        """Drop all stored data."""
        with self._lock:
            self._store.clear()

    def snapshot_depths(self) -> dict[str, int]:
        """Return ``{coin: num_candles}`` for monitoring."""
        with self._lock:
            return {coin: len(buf) for coin, buf in self._store.items()}
