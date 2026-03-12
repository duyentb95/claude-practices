"""Hyperliquid Info API poller.

Periodically fetches account state from the Hyperliquid REST API
and populates shared data structures for the dashboard.

All calls use POST /info as per Hyperliquid API convention.
"""

from __future__ import annotations

import asyncio
import os
import time
from typing import Any

import aiohttp

from src.utils.logger import get_logger

log = get_logger(__name__)

HYPER_API_URL = os.getenv("HYPER_API_URL", "https://api.hyperliquid.xyz")
INFO_ENDPOINT = f"{HYPER_API_URL}/info"

# Poll intervals (seconds)
ACCOUNT_POLL_INTERVAL = 10
FILLS_POLL_INTERVAL = 30
ORDERS_POLL_INTERVAL = 5


class HyperliquidInfoPoller:
    """Fetches account data from Hyperliquid REST API on a timer.

    Populates shared mutable containers that the dashboard server reads.
    """

    def __init__(
        self,
        account_address: str,
        account_summary: dict[str, Any],
        hl_positions: list[dict[str, Any]],
        open_orders: list[dict[str, Any]],
        recent_fills: list[dict[str, Any]],
        historical_orders: list[dict[str, Any]],
    ) -> None:
        self._address = account_address
        self._account_summary = account_summary
        self._hl_positions = hl_positions
        self._open_orders = open_orders
        self._recent_fills = recent_fills
        self._historical_orders = historical_orders
        self._session: aiohttp.ClientSession | None = None
        self._running = False

    async def _post_info(self, payload: dict[str, Any]) -> Any:
        """POST /info with the given payload. Returns parsed JSON."""
        if self._session is None:
            self._session = aiohttp.ClientSession()
        try:
            async with self._session.post(
                INFO_ENDPOINT,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    log.warning("hl_info_api_error", status=resp.status, body=text[:200])
                    return None
                return await resp.json()
        except Exception:
            log.exception("hl_info_request_failed", payload_type=payload.get("type"))
            return None

    # ------------------------------------------------------------------
    # Fetchers
    # ------------------------------------------------------------------

    async def fetch_clearinghouse_state(self) -> None:
        """Fetch account summary: balance, margin, positions."""
        data = await self._post_info({
            "type": "clearinghouseState",
            "user": self._address,
        })
        if data is None:
            return

        # Parse margin summary
        margin = data.get("marginSummary", {})
        self._account_summary.clear()
        self._account_summary.update({
            "account_value": float(margin.get("accountValue", 0)),
            "total_margin_used": float(margin.get("totalMarginUsed", 0)),
            "total_ntl_pos": float(margin.get("totalNtlPos", 0)),
            "total_raw_usd": float(margin.get("totalRawUsd", 0)),
            "withdrawable": float(data.get("withdrawable", 0)),
            "cross_margin_summary": data.get("crossMarginSummary", {}),
            "cross_maintenance_margin_used": float(data.get("crossMaintenanceMarginUsed", 0)),
        })

        # Parse positions from clearinghouseState
        asset_positions = data.get("assetPositions", [])
        self._hl_positions.clear()
        for ap in asset_positions:
            pos = ap.get("position", {})
            if not pos:
                continue
            entry_px = pos.get("entryPx")
            if entry_px is None:
                continue
            unrealized_pnl = float(pos.get("unrealizedPnl", 0))
            return_on_equity = float(pos.get("returnOnEquity", 0))
            self._hl_positions.append({
                "coin": pos.get("coin", ""),
                "size": float(pos.get("szi", 0)),
                "entry_price": float(entry_px),
                "position_value": float(pos.get("positionValue", 0)),
                "unrealized_pnl": unrealized_pnl,
                "return_on_equity": return_on_equity,
                "leverage_type": pos.get("leverage", {}).get("type", ""),
                "leverage_value": int(pos.get("leverage", {}).get("value", 0)),
                "liquidation_px": pos.get("liquidationPx"),
                "margin_used": float(pos.get("marginUsed", 0)),
                "max_leverage": int(pos.get("maxLeverage", 0)),
            })

        log.info(
            "hl_account_fetched",
            balance=self._account_summary.get("account_value"),
            positions=len(self._hl_positions),
            margin_used=self._account_summary.get("total_margin_used"),
        )

    async def fetch_open_orders(self) -> None:
        """Fetch open orders with frontend info."""
        data = await self._post_info({
            "type": "frontendOpenOrders",
            "user": self._address,
        })
        if data is None:
            return

        self._open_orders.clear()
        for order in (data if isinstance(data, list) else []):
            self._open_orders.append({
                "coin": order.get("coin", ""),
                "side": "BUY" if order.get("isBuy") else "SELL",
                "type": order.get("orderType", "Limit"),
                "size": float(order.get("sz", 0)),
                "price": float(order.get("limitPx", 0)),
                "status": "OPEN",
                "oid": order.get("oid"),
                "time": order.get("timestamp"),
                "reduce_only": order.get("reduceOnly", False),
                "trigger_px": order.get("triggerPx"),
                "trigger_condition": order.get("triggerCondition"),
            })

        log.debug("hl_orders_fetched", count=len(self._open_orders))

    async def fetch_recent_fills(self) -> None:
        """Fetch recent fills (last 100)."""
        data = await self._post_info({
            "type": "userFills",
            "user": self._address,
        })
        if data is None:
            return

        fills = data if isinstance(data, list) else []
        # Take last 100 fills, newest first
        fills = fills[-100:]
        fills.reverse()

        self._recent_fills.clear()
        for fill in fills:
            self._recent_fills.append({
                "coin": fill.get("coin", ""),
                "side": fill.get("side", ""),
                "size": float(fill.get("sz", 0)),
                "price": float(fill.get("px", 0)),
                "fee": float(fill.get("fee", 0)),
                "time": fill.get("time"),
                "crossed": fill.get("crossed", False),
                "dir": fill.get("dir", ""),
                "hash": fill.get("hash", ""),
                "oid": fill.get("oid"),
                "closed_pnl": float(fill.get("closedPnl", 0)),
            })

        log.debug("hl_fills_fetched", count=len(self._recent_fills))

    async def fetch_historical_orders(self) -> None:
        """Fetch historical orders (order status endpoint)."""
        data = await self._post_info({
            "type": "historicalOrders",
            "user": self._address,
        })
        if data is None:
            return

        orders = data if isinstance(data, list) else []
        orders = orders[-200:]

        self._historical_orders.clear()
        for order in reversed(orders):
            status_info = order.get("status", "")
            o = order.get("order", order)
            self._historical_orders.append({
                "coin": o.get("coin", ""),
                "side": "BUY" if o.get("isBuy") else "SELL",
                "type": o.get("orderType", ""),
                "size": float(o.get("sz", 0)),
                "price": float(o.get("limitPx", 0)),
                "status": status_info if isinstance(status_info, str) else str(status_info),
                "time": o.get("timestamp"),
                "oid": o.get("oid"),
            })

        log.debug("hl_historical_orders_fetched", count=len(self._historical_orders))

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def run(self) -> None:
        """Run the poller loops until cancelled."""
        self._running = True

        if not self._address:
            log.warning("hl_info_poller_skipped", reason="no HL_ACCOUNT_ADDRESS configured")
            # Keep running but do nothing — lets the TaskGroup not exit
            while self._running:
                await asyncio.sleep(60)
            return

        log.info("hl_info_poller_starting", address=self._address[:10] + "...")

        # Initial fetch
        await self._fetch_all()

        # Stagger the loops
        account_task = asyncio.create_task(self._loop(self.fetch_clearinghouse_state, ACCOUNT_POLL_INTERVAL))
        orders_task = asyncio.create_task(self._loop(self.fetch_open_orders, ORDERS_POLL_INTERVAL))
        fills_task = asyncio.create_task(self._loop(self.fetch_recent_fills, FILLS_POLL_INTERVAL))

        try:
            await asyncio.gather(account_task, orders_task, fills_task)
        finally:
            if self._session:
                await self._session.close()
                self._session = None
            self._running = False

    async def _fetch_all(self) -> None:
        """Fetch all data once (for startup)."""
        await asyncio.gather(
            self.fetch_clearinghouse_state(),
            self.fetch_open_orders(),
            self.fetch_recent_fills(),
            return_exceptions=True,
        )

    async def _loop(self, fn: Any, interval: float) -> None:
        """Run a fetch function on a timer."""
        while self._running:
            await asyncio.sleep(interval)
            try:
                await fn()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("hl_info_poll_error", fn=fn.__name__)

    def stop(self) -> None:
        self._running = False
