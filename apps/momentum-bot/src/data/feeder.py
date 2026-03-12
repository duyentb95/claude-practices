"""WebSocket data ingestion from Hyperliquid."""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Any

import structlog
import websockets
import websockets.asyncio.client as ws_client
import json

from src.data.candle_store import CandleStore
from src.strategy.models import Candle

logger = structlog.get_logger(__name__)

# Type alias for event callbacks: async functions that accept the raw payload.
EventCallback = Callable[[dict[str, Any]], Awaitable[None]]

# Hyperliquid WS subscription channels
_CHANNEL_CANDLE = "candle"
_CHANNEL_TRADES = "trades"
_CHANNEL_L2BOOK = "l2Book"
_CHANNEL_ALL_MIDS = "allMids"
_CHANNEL_USER_FILLS = "userFills"
_CHANNEL_ORDER_UPDATES = "orderUpdates"

# Reconnect parameters
_INITIAL_BACKOFF_S = 1.0
_MAX_BACKOFF_S = 30.0
_BACKOFF_FACTOR = 2.0

# Ping interval to keep the connection alive
_PING_INTERVAL_S = 20.0


class HyperliquidFeeder:
    """Connects to the Hyperliquid WebSocket and streams real-time data.

    Responsibilities:
    - Maintain a persistent WS connection with auto-reconnect.
    - Subscribe to candle (1m), trades, l2Book per coin.
    - Subscribe to allMids for the screener.
    - Subscribe to userFills and orderUpdates per user address.
    - Route incoming messages to the ``CandleStore`` and registered callbacks.
    """

    def __init__(
        self,
        candle_store: CandleStore,
        ws_url: str = "wss://api.hyperliquid.xyz/ws",
    ) -> None:
        self.ws_url = ws_url
        self.candle_store = candle_store

        # Registered callbacks: event_type -> list of async callables
        self._callbacks: dict[str, list[EventCallback]] = {}

        # Track active subscriptions so we can re-subscribe after reconnect.
        self._coin_subs: set[str] = set()
        self._user_subs: set[str] = set()
        self._all_mids_subscribed: bool = False

        # Connection handle (set during run loop)
        self._ws: ws_client.ClientConnection | None = None
        self._running: bool = False

        # Latest mid prices (updated by allMids channel)
        self.latest_mids: dict[str, float] = {}

    # ------------------------------------------------------------------
    # Public API: callback registration
    # ------------------------------------------------------------------

    def on(self, event_type: str, callback: EventCallback) -> None:
        """Register an async *callback* for *event_type*.

        Supported event types: ``candle``, ``trades``, ``l2Book``,
        ``allMids``, ``userFills``, ``orderUpdates``.
        """
        self._callbacks.setdefault(event_type, []).append(callback)

    # ------------------------------------------------------------------
    # Public API: subscriptions
    # ------------------------------------------------------------------

    async def subscribe_coin(self, coin: str) -> None:
        """Subscribe to candle (1m), trades, and l2Book for *coin*."""
        self._coin_subs.add(coin)
        if self._ws is None:
            return  # Will be sent on connect.

        await self._send_sub({"type": "subscribe", "subscription": {"type": _CHANNEL_CANDLE, "coin": coin, "interval": "1m"}})
        await self._send_sub({"type": "subscribe", "subscription": {"type": _CHANNEL_TRADES, "coin": coin}})
        await self._send_sub({"type": "subscribe", "subscription": {"type": _CHANNEL_L2BOOK, "coin": coin}})
        logger.info("subscribed_coin", coin=coin)

    async def subscribe_user(self, address: str) -> None:
        """Subscribe to userFills and orderUpdates for *address*."""
        self._user_subs.add(address)
        if self._ws is None:
            return

        await self._send_sub({"type": "subscribe", "subscription": {"type": _CHANNEL_USER_FILLS, "user": address}})
        await self._send_sub({"type": "subscribe", "subscription": {"type": _CHANNEL_ORDER_UPDATES, "user": address}})
        logger.info("subscribed_user", address=address)

    async def subscribe_all_mids(self) -> None:
        """Subscribe to allMids for the screener."""
        self._all_mids_subscribed = True
        if self._ws is None:
            return

        await self._send_sub({"type": "subscribe", "subscription": {"type": _CHANNEL_ALL_MIDS}})
        logger.info("subscribed_all_mids")

    async def unsubscribe_coin(self, coin: str) -> None:
        """Unsubscribe from all channels for *coin*."""
        self._coin_subs.discard(coin)
        if self._ws is None:
            return

        for ch in (_CHANNEL_CANDLE, _CHANNEL_TRADES, _CHANNEL_L2BOOK):
            sub: dict[str, Any] = {"type": ch, "coin": coin}
            if ch == _CHANNEL_CANDLE:
                sub["interval"] = "1m"
            await self._send_sub({"type": "unsubscribe", "subscription": sub})
        logger.info("unsubscribed_coin", coin=coin)

    # ------------------------------------------------------------------
    # Main run loop
    # ------------------------------------------------------------------

    async def run(self) -> None:
        """Main loop: connect, subscribe, and process messages forever.

        Implements exponential backoff on disconnection.
        """
        self._running = True
        backoff = _INITIAL_BACKOFF_S

        while self._running:
            try:
                await self._connect_and_listen()
            except (
                websockets.exceptions.ConnectionClosed,
                websockets.exceptions.InvalidURI,
                OSError,
            ) as exc:
                logger.warning("ws_disconnected", error=str(exc), backoff=backoff)
            except asyncio.CancelledError:
                logger.info("ws_feeder_cancelled")
                break
            except Exception as exc:
                logger.error("ws_unexpected_error", error=str(exc), backoff=backoff)

            self._ws = None
            await asyncio.sleep(backoff)
            backoff = min(backoff * _BACKOFF_FACTOR, _MAX_BACKOFF_S)

    async def stop(self) -> None:
        """Gracefully shut down the feeder."""
        self._running = False
        if self._ws is not None:
            await self._ws.close()
            self._ws = None
        logger.info("ws_feeder_stopped")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _connect_and_listen(self) -> None:
        """Open a WS connection, replay all subscriptions, and read messages."""
        logger.info("ws_connecting", url=self.ws_url)
        async with ws_client.connect(
            self.ws_url,
            ping_interval=_PING_INTERVAL_S,
            max_size=10 * 1024 * 1024,  # 10 MB
        ) as ws:
            self._ws = ws
            logger.info("ws_connected")

            # Replay subscriptions
            await self._replay_subscriptions()

            async for raw in ws:
                if isinstance(raw, bytes):
                    raw = raw.decode("utf-8")
                try:
                    msg = json.loads(raw)
                except Exception:
                    logger.warning("ws_parse_error", raw=raw[:200])
                    continue
                await self._handle_message(msg)

    async def _replay_subscriptions(self) -> None:
        """Re-send all tracked subscriptions after reconnect."""
        for coin in list(self._coin_subs):
            await self._send_sub({"type": "subscribe", "subscription": {"type": _CHANNEL_CANDLE, "coin": coin, "interval": "1m"}})
            await self._send_sub({"type": "subscribe", "subscription": {"type": _CHANNEL_TRADES, "coin": coin}})
            await self._send_sub({"type": "subscribe", "subscription": {"type": _CHANNEL_L2BOOK, "coin": coin}})

        for address in list(self._user_subs):
            await self._send_sub({"type": "subscribe", "subscription": {"type": _CHANNEL_USER_FILLS, "user": address}})
            await self._send_sub({"type": "subscribe", "subscription": {"type": _CHANNEL_ORDER_UPDATES, "user": address}})

        if self._all_mids_subscribed:
            await self._send_sub({"type": "subscribe", "subscription": {"type": _CHANNEL_ALL_MIDS}})

        logger.info(
            "subscriptions_replayed",
            coins=len(self._coin_subs),
            users=len(self._user_subs),
            all_mids=self._all_mids_subscribed,
        )

    async def _send_sub(self, payload: dict[str, Any]) -> None:
        """Serialize and send a subscription frame."""
        if self._ws is None:
            return
        await self._ws.send(json.dumps(payload))

    # ------------------------------------------------------------------
    # Message routing
    # ------------------------------------------------------------------

    async def _handle_message(self, msg: dict[str, Any]) -> None:
        """Route an incoming WS message to the appropriate handler."""
        channel: str | None = msg.get("channel")
        data: Any = msg.get("data")

        if channel is None or data is None:
            # Subscription confirmations, pings, etc.
            return

        if channel == _CHANNEL_CANDLE:
            await self._on_candle(data)
        elif channel == _CHANNEL_TRADES:
            await self._on_trade(data)
        elif channel == _CHANNEL_L2BOOK:
            await self._on_l2book(data)
        elif channel == _CHANNEL_ALL_MIDS:
            await self._on_all_mids(data)
        elif channel == _CHANNEL_USER_FILLS:
            await self._fire_callbacks(_CHANNEL_USER_FILLS, data)
        elif channel == _CHANNEL_ORDER_UPDATES:
            await self._fire_callbacks(_CHANNEL_ORDER_UPDATES, data)
        else:
            logger.debug("ws_unknown_channel", channel=channel)

    async def _on_candle(self, data: dict[str, Any]) -> None:
        """Handle a candle update and store it."""
        # Hyperliquid candle payload: {s: coin, t: timestamp, ...}
        # The data may be a single candle dict or list of candles.
        candles_raw: list[dict[str, Any]] = data if isinstance(data, list) else [data]

        for raw in candles_raw:
            coin: str = raw.get("s", "")
            if not coin:
                continue

            candle = Candle(
                timestamp=int(raw.get("t", 0)),
                open=float(raw.get("o", 0)),
                high=float(raw.get("h", 0)),
                low=float(raw.get("l", 0)),
                close=float(raw.get("c", 0)),
                volume=float(raw.get("v", 0)),
                trades=int(raw.get("n", 0)),
            )
            self.candle_store.add_candle(coin, candle)

        await self._fire_callbacks(_CHANNEL_CANDLE, data)

    async def _on_trade(self, data: dict[str, Any] | list[dict[str, Any]]) -> None:
        """Handle incoming trade messages and fire callbacks."""
        await self._fire_callbacks(_CHANNEL_TRADES, data)

    async def _on_l2book(self, data: dict[str, Any]) -> None:
        """Handle L2 order book snapshot and fire callbacks."""
        await self._fire_callbacks(_CHANNEL_L2BOOK, data)

    async def _on_all_mids(self, data: dict[str, Any]) -> None:
        """Handle allMids update: store latest mid prices and fire callbacks."""
        mids: dict[str, str] = data.get("mids", {})
        parsed: dict[str, float] = {}
        for coin, price_str in mids.items():
            try:
                parsed[coin] = float(price_str)
            except (ValueError, TypeError):
                continue
        self.latest_mids = parsed
        await self._fire_callbacks(_CHANNEL_ALL_MIDS, data)

    async def _fire_callbacks(self, event_type: str, data: Any) -> None:
        """Invoke all registered callbacks for *event_type*."""
        cbs = self._callbacks.get(event_type)
        if not cbs:
            return
        for cb in cbs:
            try:
                await cb(data)
            except Exception as exc:
                logger.error(
                    "callback_error",
                    event_type=event_type,
                    callback=cb.__qualname__,
                    error=str(exc),
                )
