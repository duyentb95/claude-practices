"""Bootstrap historical candles via REST candleSnapshot endpoint."""

from __future__ import annotations

import os
import time
from typing import TYPE_CHECKING

import aiohttp
import structlog

from src.data.candle_store import CandleStore
from src.strategy.models import Candle

if TYPE_CHECKING:
    from src.utils.rate_limiter import HyperliquidRateLimiter

logger = structlog.get_logger(__name__)

HYPER_API_URL = os.getenv("HYPER_API_URL", "https://api.hyperliquid.xyz")
INFO_ENDPOINT = f"{HYPER_API_URL}/info"


async def bootstrap_candles(
    coin: str,
    candle_store: CandleStore,
    count: int = 200,
    api_url: str = INFO_ENDPOINT,
    rate_limiter: HyperliquidRateLimiter | None = None,
) -> int:
    """Fetch *count* historical 1m candles for *coin* and load into *candle_store*.

    Uses the ``candleSnapshot`` REST endpoint:
        POST /info  {"type":"candleSnapshot","req":{"coin":...,"interval":"1m","startTime":...,"endTime":...}}

    Returns the number of candles loaded.
    """
    now_ms = int(time.time() * 1000)
    # Each 1m candle = 60_000ms; fetch a bit extra to account for gaps.
    start_ms = now_ms - (count + 10) * 60_000
    end_ms = now_ms

    payload = {
        "type": "candleSnapshot",
        "req": {
            "coin": coin,
            "interval": "1m",
            "startTime": start_ms,
            "endTime": end_ms,
        },
    }

    try:
        if rate_limiter:
            async with aiohttp.ClientSession() as session:
                raw_candles = await rate_limiter.post_info(session, api_url, payload)
        else:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    api_url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as resp:
                    if resp.status != 200:
                        logger.warning("bootstrap_http_error", coin=coin, status=resp.status)
                        return 0
                    raw_candles = await resp.json()
    except Exception as exc:
        logger.warning("bootstrap_fetch_error", coin=coin, error=str(exc))
        return 0

    if not isinstance(raw_candles, list):
        logger.warning("bootstrap_bad_response", coin=coin, type=type(raw_candles).__name__)
        return 0

    loaded = 0
    for raw in raw_candles:
        try:
            candle = Candle(
                timestamp=int(raw.get("t", 0)),
                open=float(raw.get("o", 0)),
                high=float(raw.get("h", 0)),
                low=float(raw.get("l", 0)),
                close=float(raw.get("c", 0)),
                volume=float(raw.get("v", 0)),
                trades=int(raw.get("n", 0)),
            )
            candle_store.add_candle(coin, candle)
            loaded += 1
        except (KeyError, ValueError, TypeError) as exc:
            logger.debug("bootstrap_parse_skip", coin=coin, error=str(exc))

    logger.info("bootstrap_complete", coin=coin, loaded=loaded, requested=count)
    return loaded
