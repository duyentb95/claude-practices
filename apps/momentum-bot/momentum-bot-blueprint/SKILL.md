---
name: momentum-bot-builder
description: >
  Use this skill when building, modifying, testing, or operating the Momentum Breakout Trading Bot
  for Hyperliquid. Covers strategy implementation (staircase detection, volume trend, swing points,
  regime scoring, breakout signals), order execution via Hyperliquid Python SDK, position management
  (trailing SL, timeout rules), risk management, backtesting, and deployment.
  Triggers: momentum bot, trading bot, staircase pattern, breakout strategy, swing high, swing low,
  regime detection, volume trend, Hyperliquid bot, auto trade, position sizing, trailing stop.
version: 1.0.0
author: quant-trading-team
architecture: Pipeline
complexity: 18
platforms: [claude-code, cursor, windsurf]
tags: [momentum, trading-bot, hyperliquid, breakout, staircase, auto-trading]
---

# Momentum Bot Builder

## Goal

Build and operate an automated momentum breakout trading bot on Hyperliquid perp DEX.
The strategy detects "grindy staircase" patterns, scores the regime (0-3),
and enters trades on S/R breakouts with systematic entry/SL/TP rules.

## Instructions

### Strategy Rules (from Spicy's Momentum Trading Guide)

**3 Momentum Quality Variables — must score ≥2/3 to trade:**

1. **Grindy Staircase**: Price approaches level with slow, grinding moves (not fast spikes). Rising swing lows (bullish) or falling swing highs (bearish). Down-moves small, up-moves larger. Min 2 hours of pattern.

2. **Increasing Volume**: 15-minute rolling volume windows show upward trend. Market "heating up" over time. Flat or decreasing = bad signal.

3. **Sufficient Duration**: At least 2 hours of staircase price action visible on 1-minute chart. Short-lived mini-staircases don't count.

**Entry:**
- WHERE: Major swing highs (for longs) or swing lows (for shorts). Previous 1h/4h/1d/1w extremes.
- WHEN: After 1 candle closes THROUGH the level (breakout confirmation).
- HOW: Limit order if SL distance < 3%, market order if SL distance ≥ 3%.

**Stop Loss:**
- Longs: at relevant swing low below entry
- Shorts: at relevant swing high above entry
- Evolving R Rule: if price moves +0.9R, trail SL to entry + 0.1R

**Take Profit:**
- 3/3 score → next S/R level (or trail SL at ATH)
- 2/3 score → conservative +1R target
- Timeout: cut after 2 hours if < 0.5R in profit

### Tech Stack

```
Python 3.12+ / uv package manager
hyperliquid-python-sdk    # Official SDK
pandas + numpy + ta       # Data analysis
asyncio + websockets      # Real-time data
pydantic + pydantic-settings  # Config
structlog                 # Logging
APScheduler               # Scheduling
Docker                    # Deployment
```

### Project Structure

```
momentum-bot/
├── src/
│   ├── main.py                 # Async event loop
│   ├── config.py               # Pydantic config
│   ├── data/
│   │   ├── feeder.py           # WS data ingestion
│   │   ├── candle_store.py     # Rolling candle window
│   │   └── screener.py         # Coin scanner
│   ├── strategy/
│   │   ├── staircase.py        # Staircase detector
│   │   ├── volume_trend.py     # Volume analyzer
│   │   ├── swing_points.py     # Swing H/L finder
│   │   ├── regime.py           # Score 0-3
│   │   └── signal.py           # Entry/SL/TP generation
│   ├── execution/
│   │   ├── executor.py         # HL SDK orders
│   │   ├── position_mgr.py     # Trail SL, timeout
│   │   └── risk_mgr.py         # Position sizing, limits
│   ├── alerts/                 # Lark/Telegram
│   └── utils/                  # Helpers
├── config/                     # YAML configs
├── tests/                      # Unit tests
├── scripts/backtest.py         # Backtester
├── pyproject.toml
└── Dockerfile
```

### Key Algorithms

**Staircase Detection:**
```python
# 1. Find swing points (3-candle pattern: middle candle is extreme)
# 2. Check swing lows rising (bullish) or falling (bearish) via linear regression
# 3. Measure asymmetry: avg(up_moves) / avg(down_moves) > 1.2 = good
# 4. Grindiness: no single candle > 30% of total range
# 5. Duration: ≥ 120 one-minute candles
```

**Volume Trend:**
```python
# 1. Group 1m candles into 15-min buckets
# 2. Sum volume per bucket
# 3. Linear regression slope on bucket volumes
# 4. Normalize by mean volume
# 5. > +0.05 = INCREASING, < -0.05 = DECREASING, else FLAT
```

**Swing Point Detection:**
```python
# Swing High: candle[i].high > candle[i-1].high AND candle[i].high > candle[i+1].high
# Swing Low: candle[i].low < candle[i-1].low AND candle[i].low < candle[i+1].low
# Major swing = highest high / lowest low of past N hours (1h, 4h, 1d, 1w)
```

**Position Sizing:**
```python
# risk_amount = equity * risk_per_trade_pct (default 1%)
# notional = risk_amount / (distance_pct between entry and SL)
# cap at max_leverage * equity
```

### Hyperliquid SDK Usage

```python
from hyperliquid.exchange import Exchange
from hyperliquid.info import Info
from hyperliquid.utils import constants

# Info (read-only)
info = Info(constants.MAINNET_API_URL)
info.all_mids()                    # All mid prices
info.user_state(address)           # Positions + equity
info.meta()                        # Token metadata (szDecimals, maxLeverage)

# Exchange (write — requires private key)
exchange = Exchange(account, private_key, constants.MAINNET_API_URL)
exchange.order(coin, is_buy, sz, limit_px, order_type)
exchange.cancel(coin, oid)
exchange.modify_order(oid, coin, is_buy, sz, limit_px, order_type)

# WebSocket
info.subscribe({"type": "l2Book", "coin": "BTC"}, callback)
info.subscribe({"type": "trades", "coin": "BTC"}, callback)
info.subscribe({"type": "candle", "coin": "BTC", "interval": "1m"}, callback)
```

### Environment Variables

```bash
HL_PRIVATE_KEY=          # Wallet private key (or API wallet key)
HL_ACCOUNT_ADDRESS=      # Public address
HL_TESTNET=true          # Testnet mode
RISK_PER_TRADE_PCT=0.01  # 1% risk per trade
MAX_LEVERAGE=10
MAX_CONCURRENT_POSITIONS=3
MAX_DAILY_LOSS_PCT=0.05  # 5% daily loss cap
LARK_WEBHOOK_URL=
```

## Examples

### Example 1: Build the staircase detector

**Input:**
```
Build the staircase pattern detector module at src/strategy/staircase.py
```

**Expected behavior:**
1. Read PROJECT-BLUEPRINT.md for algorithm spec
2. Create `src/strategy/staircase.py` with `detect_staircase()` function
3. Implement: swing point finding, slope calculation, asymmetry ratio, grindiness score
4. Return `StaircaseResult` dataclass with all metrics
5. Create `tests/test_staircase.py` with test cases for bullish/bearish/choppy patterns
6. Run tests to verify

### Example 2: Implement the full signal pipeline

**Input:**
```
Wire up the complete signal generation: feeder → regime detector → signal generator
```

**Expected behavior:**
1. Ensure `data/feeder.py` streams 1m candles via WebSocket
2. `strategy/regime.py` combines staircase + volume + duration → score 0-3
3. `strategy/signal.py` generates entry/SL/TP when score ≥ 2 and breakout confirmed
4. `main.py` orchestrates: on new candle → check regime → check breakout → emit signal
5. In dry-run mode, log the signal without placing orders

### Example 3: Backtest on historical data

**Input:**
```
Backtest the momentum strategy on VIRTUAL/USDT for the past 30 days
```

**Expected behavior:**
1. Fetch historical 1m candles for VIRTUAL from Hyperliquid
2. Replay through staircase → regime → signal pipeline
3. Simulate entries/exits with realistic fees (maker 0.01%, taker 0.035%)
4. Calculate: total PnL, win rate, avg R, max drawdown, Sharpe
5. Output report to reports/backtest/

## Constraints

- **Testnet first**: ALWAYS test on Hyperliquid testnet before mainnet. Default HL_TESTNET=true.
- **Dry-run mode**: Include --dry-run flag that logs signals without placing orders. Default ON for new deployments.
- **Risk caps**: Never exceed risk_per_trade_pct or max_leverage from config. Hard code safety checks.
- **Rate limits**: Hyperliquid API ~1200 req/min. WS subscriptions are more efficient than polling.
- **Price rounding**: Use `hyperliquidRoundPrice()` — 5 sig digits, max(0, 6-szDecimals) decimal places.
- **EIP-712 signing**: All exchange actions use phantom agent signatures. SDK handles this.
- **Funding rates**: Not part of momentum strategy (short holds), but track for P&L accuracy.
- **No overnight holds**: Momentum trades should not exceed 2-4 hours. Force-close after max_holding_period.
- **Existing project**: This bot is a SEPARATE Python project from the NestJS monorepo. Don't mix.
- **File ownership**: This skill manages `momentum-bot/`. Never modify `apps/` in the main monorepo.
- **Testing**: Unit tests required for all strategy modules. Use pytest.
- **Config as code**: All parameters in YAML + env vars. No magic numbers in source code.
