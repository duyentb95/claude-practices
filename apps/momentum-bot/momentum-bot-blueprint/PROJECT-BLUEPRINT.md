# Momentum Breakout Trading Bot — Project Blueprint

> Auto-trade momentum breakouts on Hyperliquid perp DEX
> Based on: "Momentum Trading Strategy Guide" by Spicy (100-page PDF)
> Stack: Python + Hyperliquid SDK | Claude Code agent-assisted development

---

## Table of Contents

1. [Strategy Codification](#1-strategy-codification)
2. [Tech Stack Analysis & Recommendation](#2-tech-stack-analysis)
3. [System Architecture](#3-system-architecture)
4. [Data Pipeline Design](#4-data-pipeline-design)
5. [Trading Engine Specification](#5-trading-engine-spec)
6. [Risk Management Module](#6-risk-management)
7. [CLAUDE.md — Agent Instructions](#7-claudemd)
8. [Skill Definition](#8-skill-definition)
9. [Development Roadmap](#9-development-roadmap)
10. [References](#10-references)

---

## 1. Strategy Codification

### 1.1 Core Philosophy (from PDF)

The strategy is a **breakout momentum** system. Key insight: "The Market Regime is like the weather conditions." Don't obsess over strategy tweaks — measure the regime first.

### 1.2 Three Momentum Quality Variables

Every trade is scored on 3 criteria. Need ≥2/3 to take the trade:

| # | Variable | ✅ Good (Momentum) | ❌ Bad (Avoid) |
|---|----------|-------------------|----------------|
| 1 | **Price approach** | "Grindy Staircase" — slow, grinding move into the level | "Fast Spike" — violent V-shaped move into level |
| 2 | **Volume** | Increasing over time (market "heating up") | Decreasing or flat |
| 3 | **Price action structure** | ≥2 hours of staircase pattern | Choppy sideways range, <2h of structure |

**Scoring:**
- 3/3 met → **High quality** → Aggressive target (next S/R or trail SL)
- 2/3 met → **Good trade** → Conservative target (1R)
- 1/3 or 0/3 → **Skip** — Not a momentum setup

### 1.3 Entry Rules (Codified)

```
WHERE:  Major swing highs/lows
        - Previous 1h, 4h, 1d, 1w high/low
        - Bigger level = easier trade
        - The more time price spent away from level = more violent reaction

WHEN:   After 1 candle close THROUGH the level
        - This confirms the "wall of limit orders" has been broken

HOW:    IF distance(entry, first_swing_low) < 3%:
            → LIMIT ORDER on the broken level (save on taker fees)
        ELSE:
            → MARKET ORDER immediately (guarantee fill)
```

### 1.4 Stop Loss Rules

```
FOR LONGS:  SL at the relevant swing LOW below entry
FOR SHORTS: SL at the relevant swing HIGH above entry

EVOLVING R RULE:
  IF unrealized_pnl >= 0.9R:
      → Trail SL to entry + 0.1R (lock in breakeven + small profit)
```

### 1.5 Take Profit Rules

```
IF quality == "high" (3/3 criteria):
    IF at all-time high:
        Option A: Exit at +1R (safe)
        Option B: Exit at next sell wall in orderbook
        Option C: Trail SL to each new swing low
    ELSE:
        → Exit at NEXT major S/R level
        
IF quality == "good" (2/3 criteria):
    → Exit at +1R (conservative, don't be ambitious)

TIMEOUT RULE:
  IF trade open > 2 hours AND price hasn't moved 0.5R in favor:
      → Cut early (momentum regime likely exhausted)
```

### 1.6 Coin Selection (Screener Logic)

```
Scan universe for:
1. Top gainers/losers by 24h change % (directional bias)
2. Volume filter: ≥ $100k per minute (sufficient liquidity)
3. Tick count: abnormally high relative to other coins
4. Grindy staircase detection on 1min chart (pattern recognition)

LONG candidates: Top gainers with upward staircase
SHORT candidates: Top losers with downward staircase
```

### 1.7 Why This Works (Orderbook Mechanics)

From the PDF's orderbook theory:
- **Grindy staircase UP** = Limit order imbalance (thick bids, thin asks) + Market buy imbalance → easier to push UP
- **Grindy staircase DOWN** = Limit order imbalance (thick asks, thin bids) + Market sell imbalance → easier to push DOWN
- **Platform FOMO promotion** = Exchange promotes "hot coins" → retail FOMO market buys → pushes price further in our direction after entry

---

## 2. Tech Stack Analysis

### 2.1 Language Comparison for Trading Bots

| Criterion | Python | TypeScript/Bun | Rust | Go |
|-----------|--------|---------------|------|-----|
| **Hyperliquid SDK** | ✅ Official (1450⭐) | ✅ Community (nktkas, nomeida) | ✅ Official (428⭐) | ❌ None |
| **CCXT support** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **WebSocket libs** | ✅ websockets/aiohttp | ✅ ws/native | ✅ tokio-tungstenite | ✅ gorilla/websocket |
| **Latency** | 🟡 ~5-20ms overhead | 🟡 ~3-10ms | ✅ ~0.1-1ms | ✅ ~0.5-2ms |
| **Data analysis** | ✅ pandas/numpy/ta | 🟡 Limited | 🟡 Limited | 🟡 Limited |
| **Rapid prototyping** | ✅ Fastest | ✅ Fast | ❌ Slow | 🟡 Medium |
| **Claude Code compat** | ✅ Excellent | ✅ Excellent | 🟡 Good | 🟡 Good |
| **Existing bot ecosystem** | ✅ Richest | ✅ Good | 🟡 Few | ❌ Minimal |
| **Async/concurrency** | ✅ asyncio | ✅ native async | ✅ tokio | ✅ goroutines |

### 2.2 Recommendation: Python (uv + asyncio)

**Primary: Python 3.12+** with:
- `hyperliquid-python-sdk` — Official, maintained by Hyperliquid team
- `pandas` + `numpy` + `ta` — Technical analysis and data processing
- `asyncio` + `websockets` — Async WebSocket for real-time data
- `uv` — Fast package manager (replaces pip/venv)
- `pydantic` — Config validation and data models
- `structlog` — Structured logging
- `APScheduler` — Cron-like scheduling
- `redis` (optional) — State persistence across restarts

**Why Python over others:**
1. Official Hyperliquid SDK is Python — best maintained, most examples
2. Momentum strategy is NOT latency-sensitive (holding 30min-2h, not HFT)
3. Data analysis libraries (pandas, ta) are essential for staircase/volume detection
4. Claude Code generates Python faster and more reliably
5. Existing hyper-rau project already uses Node/NestJS — Python bot runs as separate service, no conflict

**Why NOT Rust/Go:**
- Momentum breakout strategy operates on 1-minute candles — latency advantage of Rust is irrelevant
- Development speed matters more than execution speed
- If we later need HFT-level latency, can port the order execution module to Rust while keeping Python for signal generation

### 2.3 Deployment Stack

```
┌─────────────────────────────────────────┐
│            Trading Server (VPS)          │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ momentum-bot│  │ Redis (optional) │  │
│  │ Python 3.12 │  │ State + config   │  │
│  │ uv + asyncio│  └──────────────────┘  │
│  └──────┬──────┘                        │
│         │ WebSocket + REST              │
│  ┌──────▼──────────────────────┐        │
│  │ Hyperliquid API             │        │
│  │ WSS: wss://api.hyperliquid.xyz/ws   │
│  │ REST: https://api.hyperliquid.xyz   │
│  └─────────────────────────────┘        │
│                                         │
│  Monitoring: Lark/Telegram webhooks     │
│  Logs: structlog → stdout + file        │
│  Deploy: Docker + Railway/VPS           │
└─────────────────────────────────────────┘
```

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    MOMENTUM BOT — MODULES                        │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────┐      │
│  │ DATA FEEDER  │───▶│ REGIME       │───▶│ SIGNAL        │      │
│  │              │    │ DETECTOR     │    │ GENERATOR     │      │
│  │ • WS candles │    │              │    │               │      │
│  │ • WS trades  │    │ • Staircase  │    │ • Swing H/L   │      │
│  │ • WS L2 book │    │   classifier │    │ • Breakout    │      │
│  │ • REST meta  │    │ • Volume     │    │   detector    │      │
│  │ • Screener   │    │   trend      │    │ • Quality     │      │
│  └──────────────┘    │ • Volatility │    │   scorer      │      │
│                      │   meter      │    │ • Entry type  │      │
│                      │ • Score 0-3  │    │   (limit/mkt) │      │
│                      └──────────────┘    └───────┬───────┘      │
│                                                  │               │
│                                          ┌───────▼───────┐      │
│  ┌──────────────┐    ┌──────────────┐    │ ORDER         │      │
│  │ RISK         │◀──▶│ POSITION     │◀──▶│ EXECUTOR      │      │
│  │ MANAGER      │    │ MANAGER      │    │               │      │
│  │              │    │              │    │ • Place order  │      │
│  │ • Max pos    │    │ • Track open │    │ • Cancel order │      │
│  │ • Max loss   │    │ • Trail SL   │    │ • Modify order │      │
│  │ • Daily cap  │    │ • Timeout    │    │ • HL SDK calls │      │
│  │ • Sizing     │    │ • PnL calc   │    └───────────────┘      │
│  └──────────────┘    └──────────────┘                           │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐                           │
│  │ ALERTER      │    │ LOGGER       │                           │
│  │ • Lark       │    │ • structlog  │                           │
│  │ • Telegram   │    │ • Trade log  │                           │
│  │ • Trade noti │    │ • P&L report │                           │
│  └──────────────┘    └──────────────┘                           │
└──────────────────────────────────────────────────────────────────┘
```

### Module Descriptions

| Module | Responsibility | Key Logic |
|--------|---------------|-----------|
| **Data Feeder** | Stream real-time data from Hyperliquid | WS subscribe: `l2Book`, `trades`, `candle`, `allMids`. Build 1m/5m/1h candles |
| **Regime Detector** | Classify current market regime per coin | Staircase detection, volume trend, volatility. Output: regime_score 0-3 |
| **Signal Generator** | Generate entry signals | Find swing H/L, detect breakouts, score quality, decide limit vs market |
| **Order Executor** | Execute trades via Hyperliquid SDK | Place/cancel/modify orders, handle EIP-712 signing |
| **Position Manager** | Track and manage open positions | Trail SL, check timeout rule, evolving R rule |
| **Risk Manager** | Enforce risk limits | Max concurrent positions, max daily loss, position sizing |
| **Alerter** | Notify on trades/errors | Lark webhook, Telegram bot |
| **Logger** | Structured logging + trade journal | Every trade recorded with entry/exit/PnL/regime score |

---

## 4. Data Pipeline Design

### 4.1 Hyperliquid WebSocket Subscriptions

```python
# Subscribe to real-time data for monitored coins
subscriptions = [
    {"type": "l2Book", "coin": "BTC"},           # Orderbook depth
    {"type": "trades", "coin": "BTC"},            # Individual trades (tick data)
    {"type": "candle", "coin": "BTC", "interval": "1m"},  # 1-minute candles
    {"type": "allMids"},                          # All mid prices (screener)
    {"type": "userFills", "user": WALLET_ADDR},   # Our fills
    {"type": "orderUpdates", "user": WALLET_ADDR}, # Our order status
]
```

### 4.2 Candle Aggregation

From raw trades/candles, build multi-timeframe OHLCV:

```python
@dataclass
class Candle:
    timestamp: int       # epoch ms
    open: float
    high: float
    low: float
    close: float
    volume: float        # USD notional
    trades: int          # trade count (tick count)
    buy_volume: float    # aggressive buy volume
    sell_volume: float   # aggressive sell volume

# Aggregate 1m candles → 5m, 15m, 1h, 4h, 1d
# Keep rolling window: 1000 x 1m candles (~16 hours) in memory
```

### 4.3 Staircase Detection Algorithm

```python
def detect_staircase(candles_1m: list[Candle], lookback_minutes: int = 120) -> StaircaseResult:
    """
    Detect "Grindy Staircase" pattern from PDF theory.
    
    A bullish staircase has:
    - Swing lows that are RISING over time (higher lows)
    - Down-moves are SMALL relative to up-moves
    - Price is grinding UP, not spiking
    
    A bearish staircase is the mirror.
    """
    recent = candles[-lookback_minutes:]
    
    # 1. Find swing points (3-candle pattern)
    swing_highs, swing_lows = find_swing_points(recent)
    
    # 2. Check if swing lows are rising (bullish) or falling (bearish)
    if len(swing_lows) >= 3:
        lows_slope = linear_regression_slope([s.price for s in swing_lows])
        highs_slope = linear_regression_slope([s.price for s in swing_highs])
    
    # 3. Measure asymmetry: are up-moves bigger than down-moves?
    up_moves = [c.close - c.open for c in recent if c.close > c.open]
    down_moves = [c.open - c.close for c in recent if c.close < c.open]
    avg_up = mean(up_moves) if up_moves else 0
    avg_down = mean(down_moves) if down_moves else 0
    asymmetry = avg_up / avg_down if avg_down > 0 else 999
    
    # 4. Check grindiness: no single candle should be > 30% of total range
    total_range = max(c.high for c in recent) - min(c.low for c in recent)
    max_single_candle_range = max(c.high - c.low for c in recent)
    grindiness = 1 - (max_single_candle_range / total_range) if total_range > 0 else 0
    
    # 5. Duration check: need at least 120 candles (2 hours on 1m)
    is_sufficient_duration = len(recent) >= 120
    
    return StaircaseResult(
        direction="BULLISH" if lows_slope > 0 else "BEARISH" if lows_slope < 0 else "NONE",
        slope=lows_slope,
        asymmetry=asymmetry,        # >1.2 = good for momentum
        grindiness=grindiness,      # >0.7 = grindy (good), <0.5 = spiky (bad)
        duration_minutes=len(recent),
        is_valid=is_sufficient_duration and grindiness > 0.5 and asymmetry > 1.1,
        swing_highs=swing_highs,
        swing_lows=swing_lows,
    )
```

### 4.4 Volume Trend Detection

```python
def detect_volume_trend(candles_1m: list[Candle], lookback: int = 120) -> VolumeTrend:
    """
    Check if volume is increasing, flat, or decreasing over time.
    Use 15-minute rolling windows to smooth noise.
    """
    recent = candles[-lookback:]
    
    # Group into 15-min buckets
    buckets = chunk(recent, 15)
    bucket_volumes = [sum(c.volume for c in b) for b in buckets]
    
    # Linear regression on bucket volumes
    slope = linear_regression_slope(bucket_volumes)
    
    # Normalize slope relative to mean volume
    mean_vol = mean(bucket_volumes)
    normalized_slope = slope / mean_vol if mean_vol > 0 else 0
    
    if normalized_slope > 0.05:
        return VolumeTrend.INCREASING      # Variable #2: ✅
    elif normalized_slope < -0.05:
        return VolumeTrend.DECREASING      # Variable #2: ❌
    else:
        return VolumeTrend.FLAT            # Variable #2: ⚠️ (unclear)
```

---

## 5. Trading Engine Specification

### 5.1 Signal Generation Pipeline

```python
async def generate_signal(coin: str) -> Optional[Signal]:
    candles = data_store.get_candles(coin, "1m", count=1000)
    
    # Step 1: Regime Detection — Score 0-3
    staircase = detect_staircase(candles)
    volume_trend = detect_volume_trend(candles)
    has_staircase = staircase.is_valid                    # Variable #1
    has_volume = volume_trend == VolumeTrend.INCREASING   # Variable #2
    has_duration = staircase.duration_minutes >= 120      # Variable #3
    
    regime_score = sum([has_staircase, has_volume, has_duration])
    
    if regime_score < 2:
        return None  # Skip — not enough momentum criteria
    
    # Step 2: Find entry level
    direction = staircase.direction  # BULLISH or BEARISH
    if direction == "BULLISH":
        # Entry = highest swing high (resistance to break)
        entry_level = find_major_swing_high(candles, timeframes=["1h", "4h", "1d"])
    else:
        entry_level = find_major_swing_low(candles, timeframes=["1h", "4h", "1d"])
    
    if entry_level is None:
        return None
    
    # Step 3: Check if breakout occurred (1 candle close through level)
    latest = candles[-1]
    if direction == "BULLISH" and latest.close > entry_level.price:
        breakout_confirmed = True
    elif direction == "BEARISH" and latest.close < entry_level.price:
        breakout_confirmed = True
    else:
        breakout_confirmed = False
    
    if not breakout_confirmed:
        return None  # No breakout yet — keep monitoring
    
    # Step 4: Determine SL and entry method
    if direction == "BULLISH":
        sl_level = find_relevant_swing_low(candles)
        sl_distance_pct = (entry_level.price - sl_level.price) / entry_level.price
    else:
        sl_level = find_relevant_swing_high(candles)
        sl_distance_pct = (sl_level.price - entry_level.price) / entry_level.price
    
    order_type = "LIMIT" if sl_distance_pct < 0.03 else "MARKET"
    
    # Step 5: Determine TP
    if regime_score == 3:
        # High quality — aim for next S/R
        tp_level = find_next_sr_level(candles, direction)
    else:
        # Good quality — conservative 1R
        r_amount = abs(entry_level.price - sl_level.price)
        tp_level = entry_level.price + r_amount if direction == "BULLISH" \
                   else entry_level.price - r_amount
    
    return Signal(
        coin=coin,
        direction=direction,
        entry_price=entry_level.price,
        sl_price=sl_level.price,
        tp_price=tp_level,
        order_type=order_type,
        regime_score=regime_score,
        staircase_quality=staircase,
        volume_trend=volume_trend,
    )
```

### 5.2 Order Execution via Hyperliquid SDK

```python
from hyperliquid.exchange import Exchange
from hyperliquid.info import Info
from hyperliquid.utils import constants

class HyperliquidExecutor:
    def __init__(self, private_key: str, account_address: str, testnet: bool = True):
        url = constants.TESTNET_API_URL if testnet else constants.MAINNET_API_URL
        self.info = Info(url)
        self.exchange = Exchange(account_address, private_key, url)
    
    async def place_limit_order(self, coin: str, is_buy: bool, size: float, price: float):
        """Place a limit order using Hyperliquid SDK."""
        return self.exchange.order(
            coin=coin,
            is_buy=is_buy,
            sz=size,
            limit_px=price,
            order_type={"limit": {"tif": "Gtc"}},
        )
    
    async def place_market_order(self, coin: str, is_buy: bool, size: float):
        """Place a market order using slippage-tolerant price."""
        # Get current price
        all_mids = self.info.all_mids()
        mid_price = float(all_mids[coin])
        
        # Add 0.5% slippage for buys, subtract for sells
        slippage = 0.005
        limit_px = mid_price * (1 + slippage) if is_buy else mid_price * (1 - slippage)
        
        return self.exchange.order(
            coin=coin,
            is_buy=is_buy,
            sz=size,
            limit_px=limit_px,
            order_type={"limit": {"tif": "Ioc"}},  # IOC = immediate or cancel
        )
    
    async def set_stop_loss(self, coin: str, is_buy: bool, trigger_price: float, size: float):
        """Set stop-market order."""
        return self.exchange.order(
            coin=coin,
            is_buy=not is_buy,  # SL is opposite direction
            sz=size,
            limit_px=trigger_price,
            order_type={"trigger": {
                "isMarket": True,
                "triggerPx": str(trigger_price),
                "tpsl": "sl",
            }},
            reduce_only=True,
        )
```

---

## 6. Risk Management

### 6.1 Position Sizing

```python
def calculate_position_size(
    account_equity: float,
    risk_per_trade_pct: float,     # e.g., 1% = 0.01
    entry_price: float,
    sl_price: float,
    max_leverage: float = 10,
) -> PositionSize:
    """
    Fixed fractional risk: risk X% of account per trade.
    Position size = (equity * risk%) / |entry - SL|
    Then cap by max leverage.
    """
    risk_amount = account_equity * risk_per_trade_pct
    distance = abs(entry_price - sl_price)
    distance_pct = distance / entry_price
    
    # Size in USD notional
    notional = risk_amount / distance_pct
    
    # Cap by leverage
    max_notional = account_equity * max_leverage
    notional = min(notional, max_notional)
    
    # Size in token units
    size_tokens = notional / entry_price
    
    return PositionSize(
        notional_usd=notional,
        size_tokens=size_tokens,
        leverage=notional / account_equity,
        risk_amount=risk_amount,
    )
```

### 6.2 Risk Rules

```yaml
risk_config:
  max_risk_per_trade_pct: 1.0        # 1% of equity per trade
  max_concurrent_positions: 3         # No more than 3 open positions
  max_daily_loss_pct: 5.0             # Stop trading if down 5% today
  max_leverage: 10                    # Hard cap
  min_volume_per_minute_usd: 100000   # Don't trade illiquid coins
  max_holding_period_minutes: 120     # Force exit after 2 hours
  evolving_r_threshold: 0.9          # Trail SL when +0.9R reached
  evolving_r_lock: 0.1               # Trail SL to entry + 0.1R
```

---

## 7. CLAUDE.md — Agent Instructions

```markdown
# Momentum Breakout Trading Bot

## Project Overview
Auto-trade momentum breakouts on Hyperliquid using the "Spicy Momentum" strategy.
Strategy: Detect grindy staircase patterns → wait for S/R breakout → enter → SL at swing point → TP at next level or 1R.

## Tech Stack
- Python 3.12+ with uv package manager
- hyperliquid-python-sdk (official)
- pandas, numpy, ta-lib for analysis
- asyncio + websockets for real-time data
- pydantic for config validation
- structlog for logging
- Docker for deployment

## Project Structure
```
momentum-bot/
├── src/
│   ├── __init__.py
│   ├── main.py                 # Entry point, event loop
│   ├── config.py               # Pydantic config models
│   ├── data/
│   │   ├── feeder.py           # WebSocket data ingestion
│   │   ├── candle_store.py     # In-memory candle aggregation
│   │   └── screener.py         # Coin selection / scanner
│   ├── strategy/
│   │   ├── staircase.py        # Staircase pattern detector
│   │   ├── volume_trend.py     # Volume trend analyzer
│   │   ├── swing_points.py     # Swing high/low finder
│   │   ├── regime.py           # Regime classifier (score 0-3)
│   │   └── signal.py           # Signal generator
│   ├── execution/
│   │   ├── executor.py         # Hyperliquid SDK order execution
│   │   ├── position_mgr.py     # Track open positions, trail SL
│   │   └── risk_mgr.py         # Risk limits enforcement
│   ├── alerts/
│   │   ├── lark.py             # Lark webhook notifications
│   │   └── telegram.py         # Telegram bot notifications
│   └── utils/
│       ├── logger.py           # Structured logging setup
│       ├── math_utils.py       # Linear regression, statistics
│       └── hl_helpers.py       # Hyperliquid-specific helpers
├── config/
│   ├── default.yaml            # Default config
│   └── production.yaml         # Production overrides
├── tests/
│   ├── test_staircase.py
│   ├── test_volume_trend.py
│   ├── test_signal.py
│   └── test_risk_mgr.py
├── scripts/
│   └── backtest.py             # Offline backtester
├── pyproject.toml
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## Key Strategy Rules (from Spicy PDF)
1. Score each coin on 3 variables: staircase pattern, volume trend, price duration
2. Need ≥2/3 to trade. 3/3 = aggressive target, 2/3 = conservative (1R)
3. Entry: breakout of swing high (long) or swing low (short) with 1 candle close
4. SL: at relevant opposite swing point
5. TP: next S/R level (if 3/3) or +1R (if 2/3)
6. Timeout: cut after 2h if price hasn't moved 0.5R

## Hyperliquid API
- REST: https://api.hyperliquid.xyz POST /info, POST /exchange
- WS: wss://api.hyperliquid.xyz/ws
- SDK: hyperliquid-python-sdk (pip install hyperliquid-python-sdk)
- Testnet: https://api.hyperliquid-testnet.xyz
- EIP-712 signing for all exchange actions

## Environment Variables
```
HL_PRIVATE_KEY=         # Hyperliquid wallet private key
HL_ACCOUNT_ADDRESS=     # Wallet public address
HL_TESTNET=true         # true for testnet, false for mainnet
LARK_WEBHOOK_URL=       # Lark alert webhook
TELEGRAM_BOT_TOKEN=     # Telegram bot token
TELEGRAM_CHAT_ID=       # Telegram chat ID
```

## Coding Conventions
- Python 3.12+ with type hints everywhere
- async/await for all I/O
- pydantic models for all data structures
- structlog for all logging (JSON format)
- Tests for every strategy module
- Config via YAML + env vars (pydantic-settings)

## Development Workflow
1. Build and test each module independently
2. Always write tests for strategy logic (staircase, volume, signals)
3. Test on Hyperliquid TESTNET before mainnet
4. Use --dry-run mode first (log signals without executing)
5. Start with 1 coin (BTC), then expand to screener
```

---

## 8. Skill Definition

See separate file: `SKILL.md` in `.claude/skills/momentum-bot/`

---

## 9. Development Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Project scaffold with uv + pyproject.toml
- [ ] Config system (pydantic-settings + YAML)
- [ ] Hyperliquid SDK connection (testnet)
- [ ] WebSocket data feeder (candles, trades, L2)
- [ ] Candle store (in-memory rolling window)
- [ ] Basic logging + alerting

### Phase 2: Strategy Engine (Week 2)
- [ ] Swing point detection algorithm
- [ ] Staircase pattern classifier
- [ ] Volume trend detector
- [ ] Regime scorer (combine 3 variables → 0-3)
- [ ] Signal generator (entry/SL/TP calculation)
- [ ] Unit tests for all strategy modules

### Phase 3: Execution (Week 3)
- [ ] Order executor (limit + market + SL)
- [ ] Position manager (track open, trail SL, timeout)
- [ ] Risk manager (sizing, max positions, daily loss cap)
- [ ] Dry-run mode (signal + log, no real orders)
- [ ] Testnet live testing

### Phase 4: Screener + Polish (Week 4)
- [ ] Multi-coin screener (top gainers/losers + volume filter)
- [ ] Dynamic coin selection based on regime scores
- [ ] Backtester (replay historical data through strategy)
- [ ] Dashboard / trade journal viewer
- [ ] Docker + deployment config
- [ ] Production go-live on mainnet (small size)

---

## 10. References

### Strategy
- "Momentum Trading Strategy Guide" by Spicy (100-page PDF, uploaded)
- Spicy's X screener article: https://x.com/spicyofc/status/1978067515420107057

### Hyperliquid
- Official Python SDK: https://github.com/hyperliquid-dex/hyperliquid-python-sdk
- Official Rust SDK: https://github.com/hyperliquid-dex/hyperliquid-rust-sdk
- Community TypeScript SDK: https://github.com/nktkas/hyperliquid
- API Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
- CCXT integration: https://docs.ccxt.com/#/exchanges/hyperliquid
- Chainstack trading bot tutorial: https://github.com/chainstacklabs/hyperliquid-trading-bot

### Technical Analysis
- `ta` library (Python): technical indicators
- `pandas`: data manipulation
- Linear regression for slope detection

### Deployment
- Railway: railway.app (easy Docker deploy)
- Docker Compose for local dev
- Dwellir gRPC for low-latency Hyperliquid data: https://www.dwellir.com/
