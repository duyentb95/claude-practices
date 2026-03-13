"""Hyperliquid SDK order execution wrapper.

Wraps the ``hyperliquid-python-sdk`` ``Exchange`` and ``Info`` objects behind
an async interface.  All SDK calls are synchronous under the hood, so we
delegate them to a thread-pool executor to avoid blocking the event loop.
"""

from __future__ import annotations

import asyncio
import functools
from typing import Any

import structlog
from hyperliquid.exchange import Exchange
from hyperliquid.info import Info
from hyperliquid.utils import constants as hl_constants

from src.utils.hl_helpers import AssetMetaCache, round_price, round_size

logger = structlog.get_logger(__name__)

# Default slippage for market orders (0.5%)
_MARKET_SLIPPAGE_PCT = 0.005

# Order type literals expected by the SDK
_ORDER_TYPE_LIMIT = {"limit": {"tif": "Gtc"}}
_ORDER_TYPE_IOC = {"limit": {"tif": "Ioc"}}


def _trigger_order_type(trigger_price: float, is_buy: bool) -> dict[str, Any]:
    """Build a trigger (stop) order type dict.

    For a stop-loss on a long position (is_buy=False), the trigger fires
    when the mark price falls *below* ``trigger_price``.  The SDK expects
    ``isMarket=True`` to place a market order once triggered.
    """
    return {
        "trigger": {
            "triggerPx": trigger_price,
            "isMarket": True,
            "tpsl": "sl",
        }
    }


def _tp_order_type(trigger_price: float) -> dict[str, Any]:
    """Build a take-profit trigger order type dict."""
    return {
        "trigger": {
            "triggerPx": trigger_price,
            "isMarket": True,
            "tpsl": "tp",
        }
    }


class HyperliquidExecutor:
    """Async wrapper around the Hyperliquid Python SDK.

    All methods that hit the network run in a thread-pool so callers can
    ``await`` them without blocking the asyncio event loop.
    """

    def __init__(
        self,
        private_key: str,
        account_address: str,
        testnet: bool = True,
    ) -> None:
        base_url: str = (
            hl_constants.TESTNET_API_URL if testnet else hl_constants.MAINNET_API_URL
        )
        self._info = Info(base_url, skip_ws=True)
        self._exchange = Exchange(
            wallet=None,  # type: ignore[arg-type]
            base_url=base_url,
            account_address=account_address,
        )
        # The SDK Exchange constructor accepts a raw private key string.
        # We re-initialise with the wallet so signing works.
        self._exchange = Exchange(
            wallet=private_key,
            base_url=base_url,
            account_address=account_address,
        )
        self._account_address = account_address
        self._testnet = testnet
        self._asset_meta = AssetMetaCache()

        logger.info(
            "executor_init",
            address=account_address,
            testnet=testnet,
            base_url=base_url,
        )

    # ------------------------------------------------------------------
    # Thread-pool helper
    # ------------------------------------------------------------------

    @staticmethod
    async def _run_sync(func: Any, *args: Any, **kwargs: Any) -> Any:
        """Run a blocking SDK call in the default thread-pool executor."""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, functools.partial(func, *args, **kwargs)
        )

    # ------------------------------------------------------------------
    # Order placement
    # ------------------------------------------------------------------

    async def place_limit_order(
        self,
        coin: str,
        is_buy: bool,
        size: float,
        price: float,
        reduce_only: bool = False,
    ) -> dict[str, Any]:
        """Place a GTC limit order.

        Price and size are rounded per Hyperliquid tick/lot rules before
        submission.  Returns the SDK order response dict.
        """
        await self._asset_meta.ensure_loaded()
        sz_dec = self._asset_meta.get_sz_decimals(coin)
        price = round_price(price, sz_dec)
        size = round_size(size, sz_dec)

        logger.info(
            "place_limit",
            coin=coin,
            side="BUY" if is_buy else "SELL",
            size=size,
            price=price,
            sz_decimals=sz_dec,
        )
        result: dict[str, Any] = await self._run_sync(
            self._exchange.order,
            coin,
            is_buy,
            size,
            price,
            _ORDER_TYPE_LIMIT,
            reduce_only=reduce_only,
        )
        logger.info("order_result", coin=coin, result=result)
        return result

    async def place_market_order(
        self,
        coin: str,
        is_buy: bool,
        size: float,
        slippage_pct: float = _MARKET_SLIPPAGE_PCT,
    ) -> dict[str, Any]:
        """Place an IOC limit order at mid +/- slippage to simulate market.

        The price is fetched from ``allMids`` and adjusted by
        *slippage_pct* in the direction of the trade.  Both price and
        size are rounded per Hyperliquid tick/lot rules.
        """
        await self._asset_meta.ensure_loaded()
        sz_dec = self._asset_meta.get_sz_decimals(coin)

        mids = await self.get_all_mids()
        mid = mids.get(coin)
        if mid is None or mid <= 0:
            raise ValueError(f"No mid price available for {coin}")

        if is_buy:
            price = mid * (1 + slippage_pct)
        else:
            price = mid * (1 - slippage_pct)

        price = round_price(price, sz_dec)
        size = round_size(size, sz_dec)

        logger.info(
            "place_market",
            coin=coin,
            side="BUY" if is_buy else "SELL",
            size=size,
            mid=mid,
            limit_price=price,
            sz_decimals=sz_dec,
        )
        result: dict[str, Any] = await self._run_sync(
            self._exchange.order,
            coin,
            is_buy,
            size,
            price,
            _ORDER_TYPE_IOC,
        )
        logger.info("market_order_result", coin=coin, result=result)
        return result

    async def set_stop_loss(
        self,
        coin: str,
        is_buy: bool,
        trigger_price: float,
        size: float,
    ) -> dict[str, Any]:
        """Place a trigger stop-loss order (reduce_only).

        *is_buy* should be the **closing** side: ``True`` to close a short,
        ``False`` to close a long.  Trigger price and size are rounded.
        """
        await self._asset_meta.ensure_loaded()
        sz_dec = self._asset_meta.get_sz_decimals(coin)
        trigger_price = round_price(trigger_price, sz_dec)
        size = round_size(size, sz_dec)

        logger.info(
            "set_stop_loss",
            coin=coin,
            side="BUY" if is_buy else "SELL",
            trigger=trigger_price,
            size=size,
        )
        result: dict[str, Any] = await self._run_sync(
            self._exchange.order,
            coin,
            is_buy,
            size,
            trigger_price,
            _trigger_order_type(trigger_price, is_buy),
            reduce_only=True,
        )
        logger.info("sl_result", coin=coin, result=result)
        return result

    async def set_take_profit(
        self,
        coin: str,
        is_buy: bool,
        trigger_price: float,
        size: float,
    ) -> dict[str, Any]:
        """Place a trigger take-profit order (reduce_only).

        *is_buy* is the **closing** side.  Trigger price and size are rounded.
        """
        await self._asset_meta.ensure_loaded()
        sz_dec = self._asset_meta.get_sz_decimals(coin)
        trigger_price = round_price(trigger_price, sz_dec)
        size = round_size(size, sz_dec)

        logger.info(
            "set_take_profit",
            coin=coin,
            side="BUY" if is_buy else "SELL",
            trigger=trigger_price,
            size=size,
        )
        result: dict[str, Any] = await self._run_sync(
            self._exchange.order,
            coin,
            is_buy,
            size,
            trigger_price,
            _tp_order_type(trigger_price),
            reduce_only=True,
        )
        logger.info("tp_result", coin=coin, result=result)
        return result

    async def cancel_order(self, coin: str, oid: int) -> dict[str, Any]:
        """Cancel an open order by its order id."""
        logger.info("cancel_order", coin=coin, oid=oid)
        result: dict[str, Any] = await self._run_sync(
            self._exchange.cancel, coin, oid
        )
        logger.info("cancel_result", coin=coin, oid=oid, result=result)
        return result

    async def modify_order(
        self,
        oid: int,
        coin: str,
        is_buy: bool,
        size: float,
        price: float,
    ) -> dict[str, Any]:
        """Modify an existing order (amend price/size).  Rounds both."""
        await self._asset_meta.ensure_loaded()
        sz_dec = self._asset_meta.get_sz_decimals(coin)
        price = round_price(price, sz_dec)
        size = round_size(size, sz_dec)

        logger.info(
            "modify_order",
            oid=oid,
            coin=coin,
            side="BUY" if is_buy else "SELL",
            size=size,
            price=price,
        )
        result: dict[str, Any] = await self._run_sync(
            self._exchange.modify_order,
            oid,
            coin,
            is_buy,
            size,
            price,
            _ORDER_TYPE_LIMIT,
        )
        logger.info("modify_result", coin=coin, oid=oid, result=result)
        return result

    # ------------------------------------------------------------------
    # Read-only queries
    # ------------------------------------------------------------------

    async def get_positions(self) -> list[dict[str, Any]]:
        """Return all open perpetual positions for the configured account."""
        state: dict[str, Any] = await self._run_sync(
            self._info.user_state, self._account_address
        )
        positions: list[dict[str, Any]] = state.get("assetPositions", [])
        return positions

    async def get_equity(self) -> float:
        """Return the account's cross-margin equity in USD."""
        state: dict[str, Any] = await self._run_sync(
            self._info.user_state, self._account_address
        )
        margin_summary = state.get("marginSummary", {})
        return float(margin_summary.get("accountValue", 0))

    async def get_all_mids(self) -> dict[str, float]:
        """Return ``{coin: mid_price}`` for all perpetuals."""
        raw: dict[str, str] = await self._run_sync(self._info.all_mids)
        return {coin: float(price) for coin, price in raw.items()}

    async def get_meta(self) -> dict[str, Any]:
        """Return ``metaAndAssetCtxs`` (universe + per-asset context)."""
        raw: list[dict[str, Any]] = await self._run_sync(
            self._info.meta_and_asset_ctxs
        )
        # SDK returns [meta_dict, asset_ctxs_list].
        if isinstance(raw, list) and len(raw) >= 2:
            meta: dict[str, Any] = raw[0]
            meta["assetCtxs"] = raw[1]
            return meta
        # Fallback: return as-is wrapped in a dict.
        return {"raw": raw}
