"""Cumulative Volume Delta (CVD) tracker from WebSocket trades stream.

Accumulates buy/sell volume per coin from real-time trade data.
Provides CVD value, delta, aggressor ratio, and divergence detection.

CVD = cumulative(buy_volume - sell_volume) over time.
Rising CVD + rising price = genuine buying pressure.
Flat/falling CVD + rising price = weak breakout (divergence).
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

import structlog

logger = structlog.get_logger(__name__)


@dataclass
class CVDSnapshot:
    """Point-in-time CVD metrics for a single coin."""

    coin: str
    timestamp: float

    # Cumulative values (since tracking started)
    cvd: float = 0.0                # buy_vol - sell_vol (cumulative)
    total_buy_vol: float = 0.0
    total_sell_vol: float = 0.0

    # Rolling window metrics (last N minutes)
    delta_1m: float = 0.0           # buy - sell vol in last 1 min
    delta_5m: float = 0.0           # buy - sell vol in last 5 min
    delta_15m: float = 0.0          # buy - sell vol in last 15 min

    # Aggressor ratio: buy_vol / sell_vol (> 1 = buyers dominating)
    aggressor_ratio_5m: float = 1.0

    # Divergence detection
    cvd_slope_5m: float = 0.0       # positive = CVD rising
    price_slope_5m: float = 0.0     # positive = price rising
    is_divergent: bool = False       # CVD going opposite to price


@dataclass
class _TradeRecord:
    """Internal record of a single trade for windowed aggregation."""
    timestamp: float
    buy_vol: float
    sell_vol: float
    price: float


class CoinCVDState:
    """Tracks CVD state for a single coin."""

    def __init__(self, max_window_minutes: int = 20) -> None:
        self._trades: deque[_TradeRecord] = deque()
        self._max_window_s = max_window_minutes * 60
        self._cvd: float = 0.0
        self._total_buy: float = 0.0
        self._total_sell: float = 0.0

        # CVD snapshots every 30s for slope calculation
        self._cvd_history: deque[tuple[float, float]] = deque(maxlen=20)  # (ts, cvd)
        self._price_history: deque[tuple[float, float]] = deque(maxlen=20)  # (ts, price)

    def add_trade(self, price: float, size_usd: float, is_buy: bool) -> None:
        """Record a trade. is_buy=True means the aggressor was a buyer."""
        now = time.time()
        buy_vol = size_usd if is_buy else 0.0
        sell_vol = size_usd if not is_buy else 0.0

        self._trades.append(_TradeRecord(now, buy_vol, sell_vol, price))
        self._cvd += buy_vol - sell_vol
        self._total_buy += buy_vol
        self._total_sell += sell_vol

        # Prune old trades
        cutoff = now - self._max_window_s
        while self._trades and self._trades[0].timestamp < cutoff:
            self._trades.popleft()

    def record_snapshot(self, price: float) -> None:
        """Record periodic CVD + price snapshot for slope calculation."""
        now = time.time()
        self._cvd_history.append((now, self._cvd))
        self._price_history.append((now, price))

    def snapshot(self, coin: str) -> CVDSnapshot:
        """Compute current CVD metrics."""
        now = time.time()

        # Compute rolling deltas
        delta_1m = self._window_delta(now, 60)
        delta_5m = self._window_delta(now, 300)
        delta_15m = self._window_delta(now, 900)

        # Aggressor ratio (5m window)
        buy_5m, sell_5m = self._window_volumes(now, 300)
        aggressor = buy_5m / sell_5m if sell_5m > 0 else (2.0 if buy_5m > 0 else 1.0)

        # Slopes from snapshot history
        cvd_slope = self._compute_slope(self._cvd_history, now, 300)
        price_slope = self._compute_slope(self._price_history, now, 300)

        # Divergence: CVD and price moving in opposite directions
        is_divergent = False
        if abs(cvd_slope) > 0.01 and abs(price_slope) > 0.01:
            is_divergent = (cvd_slope > 0) != (price_slope > 0)

        return CVDSnapshot(
            coin=coin,
            timestamp=now,
            cvd=self._cvd,
            total_buy_vol=self._total_buy,
            total_sell_vol=self._total_sell,
            delta_1m=delta_1m,
            delta_5m=delta_5m,
            delta_15m=delta_15m,
            aggressor_ratio_5m=round(aggressor, 3),
            cvd_slope_5m=cvd_slope,
            price_slope_5m=price_slope,
            is_divergent=is_divergent,
        )

    def _window_delta(self, now: float, window_s: float) -> float:
        cutoff = now - window_s
        delta = 0.0
        for t in self._trades:
            if t.timestamp >= cutoff:
                delta += t.buy_vol - t.sell_vol
        return delta

    def _window_volumes(self, now: float, window_s: float) -> tuple[float, float]:
        cutoff = now - window_s
        buy = sell = 0.0
        for t in self._trades:
            if t.timestamp >= cutoff:
                buy += t.buy_vol
                sell += t.sell_vol
        return buy, sell

    @staticmethod
    def _compute_slope(history: deque[tuple[float, float]], now: float, window_s: float) -> float:
        """Simple linear regression slope over the window."""
        cutoff = now - window_s
        points = [(ts, val) for ts, val in history if ts >= cutoff]
        if len(points) < 2:
            return 0.0
        n = len(points)
        sum_x = sum(p[0] for p in points)
        sum_y = sum(p[1] for p in points)
        sum_xy = sum(p[0] * p[1] for p in points)
        sum_x2 = sum(p[0] ** 2 for p in points)
        denom = n * sum_x2 - sum_x ** 2
        if abs(denom) < 1e-12:
            return 0.0
        return (n * sum_xy - sum_x * sum_y) / denom


class CVDTracker:
    """Tracks CVD across multiple coins using WS trade data.

    Register as a callback on the feeder's "trades" event:
        feeder.on("trades", cvd_tracker.on_trades)
    """

    def __init__(self) -> None:
        self._coins: dict[str, CoinCVDState] = {}
        self._snapshot_interval = 30  # seconds
        self._last_snapshot: dict[str, float] = {}

    def get_or_create(self, coin: str) -> CoinCVDState:
        if coin not in self._coins:
            self._coins[coin] = CoinCVDState()
        return self._coins[coin]

    def get_snapshot(self, coin: str) -> CVDSnapshot | None:
        """Get current CVD snapshot for a coin. Returns None if not tracked."""
        state = self._coins.get(coin)
        if state is None:
            return None
        return state.snapshot(coin)

    def remove_coin(self, coin: str) -> None:
        self._coins.pop(coin, None)
        self._last_snapshot.pop(coin, None)

    async def on_trades(self, data: dict[str, Any]) -> None:
        """Callback for feeder 'trades' events.

        Expected data format from Hyperliquid WS:
        {"channel": "trades", "data": [{"coin": "BTC", "px": "95000", "sz": "0.1", "side": "B", "time": ms}, ...]}
        """
        trades = data.get("data", [])
        if not isinstance(trades, list):
            return

        for trade in trades:
            coin = trade.get("coin", "")
            if not coin or coin not in self._coins:
                continue

            try:
                price = float(trade.get("px", 0))
                size = float(trade.get("sz", 0))
                side = trade.get("side", "")
                is_buy = side in ("B", "buy")
                size_usd = price * size

                state = self._coins[coin]
                state.add_trade(price, size_usd, is_buy)

                # Periodic snapshot for slope calculation
                now = time.time()
                last = self._last_snapshot.get(coin, 0)
                if now - last >= self._snapshot_interval:
                    state.record_snapshot(price)
                    self._last_snapshot[coin] = now

            except (ValueError, TypeError):
                continue

    def all_snapshots(self) -> dict[str, CVDSnapshot]:
        """Get CVD snapshots for all tracked coins."""
        return {coin: state.snapshot(coin) for coin, state in self._coins.items()}
