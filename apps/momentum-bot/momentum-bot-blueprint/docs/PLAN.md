# MOMENTUM TRADING BOT — Project Plan

## 1. Project Overview

Automated momentum breakout trading bot for Hyperliquid perp DEX.
Based on the "Spicy" Momentum Trading Strategy — codified from the 100-page PDF guide.

**Core Thesis**: Trade breakouts of swing highs/lows ONLY when market regime is favorable
(grindy staircase + increasing volume + high volatility). Skip when regime is mean-reversion.

**Key Insight from Strategy**: The market regime matters MORE than the strategy itself.
A washing machine flies in a tornado. The best kite fails with no wind.

---

## 2. Tech Stack Recommendation

### Why Rust for the Core Engine

| Requirement | Why Rust Wins |
|------------|---------------|
| Sub-millisecond order execution | Zero-cost abstractions, no GC pauses |
| WebSocket handling at scale | Tokio async runtime, native speed |
| 24/7 uptime without memory leaks | Ownership system prevents leaks by design |
| Numeric precision for financial calc | No floating point surprises, strong typing |
| Low resource usage on VPS | ~10MB RAM for full bot vs 200MB+ Node.js |

### Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MOMENTUM TRADING BOT                       │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ DATA LAYER   │  │ STRATEGY     │  │ EXECUTION LAYER    │ │
│  │ (Rust)       │  │ ENGINE       │  │ (Rust)             │ │
│  │              │  │ (Rust)       │  │                    │ │
│  │ • WS Feed    │  │              │  │ • Order Placement  │ │
│  │ • L2 Book    │  │ • Regime     │  │ • Position Mgmt    │ │
│  │ • Candle Agg │  │   Detector   │  │ • Risk Manager     │ │
│  │ • Volume Agg │  │ • Swing      │  │ • SL/TP Mgmt       │ │
│  │ • Trade Flow │  │   Finder     │  │ • EIP-712 Signing  │ │
│  │              │  │ • Entry      │  │                    │ │
│  └──────┬───────┘  │   Logic      │  └────────┬───────────┘ │
│         │          │ • Score      │           │              │
│         └─────────►│   Calculator │──────────►│              │
│                    └──────────────┘           │              │
│                                               │              │
│  ┌──────────────────────────────────────────┐ │              │
│  │ MONITORING & ALERTING (TypeScript/NestJS) │ │              │
│  │ • Dashboard REST API                      │ │              │
│  │ • Lark/Telegram alerts                    │ │              │
│  │ • Trade journal logging                   │ │              │
│  │ • Performance metrics                     │ │              │
│  └──────────────────────────────────────────┘ │              │
└─────────────────────────────────────────────────────────────┘
```

### Alternative: TypeScript/NestJS (If team prefers consistency with existing monorepo)

**Pros**: Same stack as hyper-rau/insider-scanner, shared code, familiar.
**Cons**: GC pauses during high-frequency operations, higher latency.
**Verdict**: Acceptable for 1-5 second candle timeframes. NOT acceptable for tick-level execution.

### Hybrid Approach (Recommended)

| Component | Stack | Why |
|-----------|-------|-----|
| **Core engine** (data + strategy + execution) | **Rust** | Speed, reliability, precision |
| **Monitoring dashboard** | **TypeScript/NestJS** | Reuse existing monorepo, REST API, UI |
| **Config & state** | **Redis** | Same as hyper-rau, hot-reload config |
| **Logs & journal** | **PostgreSQL** | Trade history, performance analysis |
| **Alerts** | **Lark + Telegram** | Same as insider-scanner |

### Key Dependencies (Rust)

```toml
[dependencies]
tokio = { version = "1", features = ["full"] }         # Async runtime
tokio-tungstenite = "0.21"                              # WebSocket client
reqwest = { version = "0.12", features = ["json"] }     # HTTP client
serde = { version = "1", features = ["derive"] }        # Serialization
serde_json = "1"                                         # JSON
rust_decimal = "1"                                       # Precise decimal math
ethers = "2"                                             # EIP-712 signing
ta = "0.5"                                               # Technical analysis (SMA, EMA, ATR, RSI)
tracing = "0.1"                                          # Structured logging
redis = { version = "0.25", features = ["tokio-comp"] }  # Redis async
sqlx = { version = "0.7", features = ["postgres", "runtime-tokio"] }  # PostgreSQL
```

### Hyperliquid API Integration

```
REST: https://api.hyperliquid.xyz/info      (POST, read-only)
REST: https://api.hyperliquid.xyz/exchange   (POST, write — requires EIP-712 signature)
WS:   wss://api.hyperliquid.xyz/ws          (subscriptions)

Key WS channels:
  {"method":"subscribe","subscription":{"type":"l2Book","coin":"BTC"}}
  {"method":"subscribe","subscription":{"type":"trades","coin":"BTC"}}
  {"method":"subscribe","subscription":{"type":"candle","coin":"BTC","interval":"1m"}}
  {"method":"subscribe","subscription":{"type":"userFills","user":"0x..."}}
  {"method":"subscribe","subscription":{"type":"orderUpdates","user":"0x..."}}
```

---

## 3. Strategy Codification

### 3.1 Regime Detection (THE MOST IMPORTANT PART)

The strategy is REGIME-FIRST. Never trade until regime is classified.

```
┌──────────────────────────────────────────────┐
│            REGIME CLASSIFICATION               │
│                                                │
│  Score 3 variables independently (0-100 each): │
│                                                │
│  V1: Grindy Staircase  ──► staircase_score     │
│  V2: Increasing Volume  ──► volume_score        │
│  V3: High Volatility    ──► volatility_score    │
│                                                │
│  Criteria met = score ≥ 60                     │
│                                                │
│  3/3 met → STRONG MOMENTUM → aggressive        │
│  2/3 met → MOMENTUM        → normal            │
│  1/3 met → WEAK            → skip              │
│  0/3 met → MEAN REVERSION  → absolutely skip   │
└──────────────────────────────────────────────┘
```

#### V1: Grindy Staircase Detection (weight: highest priority)

```python
def detect_staircase(candles_1m, lookback=120):  # 2 hours of 1min candles
    """
    A 'grindy staircase' has:
    1. Higher highs AND higher lows (uptrend) OR lower highs AND lower lows (downtrend)
    2. Small pullbacks relative to impulse moves
    3. Consistent slope (not spiky)

    Returns: (is_staircase: bool, direction: 'up'|'down'|'none', score: 0-100)
    """

    # Calculate swing points
    swings = find_swing_points(candles_1m, min_bars=3)

    # Check for sequential higher highs + higher lows (bullish)
    hh_count = count_higher_highs(swings)
    hl_count = count_higher_lows(swings)

    # Check for sequential lower lows + lower highs (bearish)
    ll_count = count_lower_lows(swings)
    lh_count = count_lower_highs(swings)

    # Measure pullback-to-impulse ratio
    # In a staircase: pullbacks are SMALL, impulses are LARGER
    impulse_sizes = [abs(s.high - prev.low) for s in impulse_legs]
    pullback_sizes = [abs(s.low - prev.high) for s in pullback_legs]
    avg_pullback_ratio = mean(pullback_sizes) / mean(impulse_sizes)
    # Good staircase: ratio < 0.4 (pullbacks < 40% of impulse)

    # Measure slope consistency (low variance = grindy, high variance = spiky)
    returns = [candle.close / prev.close - 1 for candle in candles_1m]
    slope_consistency = 1 - (stdev(returns) / abs(mean(returns)))

    # Composite staircase score
    trend_score = max(hh_count + hl_count, ll_count + lh_count) / len(swings) * 100
    pullback_score = max(0, (1 - avg_pullback_ratio / 0.5)) * 100
    consistency_score = slope_consistency * 100

    staircase_score = trend_score * 0.4 + pullback_score * 0.3 + consistency_score * 0.3

    direction = 'up' if (hh_count + hl_count) > (ll_count + lh_count) else 'down'
    if staircase_score < 30:
        direction = 'none'

    return (staircase_score >= 60, direction, staircase_score)
```

#### V2: Increasing Volume Detection

```python
def detect_increasing_volume(candles_1m, lookback=120):
    """
    Volume should be INCREASING over time.
    Measure: linear regression slope of volume over 2h window.

    Returns: (is_increasing: bool, score: 0-100)
    """
    volumes = [c.volume for c in candles_1m[-lookback:]]

    # Split into 4 quarters (30 min each)
    q1 = mean(volumes[0:30])
    q2 = mean(volumes[30:60])
    q3 = mean(volumes[60:90])
    q4 = mean(volumes[90:120])

    # Each successive quarter should be higher
    increasing_count = sum([
        q2 > q1 * 1.05,  # 5% increase threshold
        q3 > q2 * 1.05,
        q4 > q3 * 1.05,
    ])

    # Also check overall slope
    slope = linear_regression_slope(range(len(volumes)), volumes)
    slope_normalized = min(100, max(0, slope / mean(volumes) * 1000))

    score = increasing_count / 3 * 60 + slope_normalized * 0.4

    return (score >= 60, score)
```

#### V3: High Volatility Detection

```python
def detect_high_volatility(candles_1m, lookback=120, baseline_lookback=1440):
    """
    Compare current 2h volatility vs 24h baseline.
    High vol = current ATR >> baseline ATR.

    Returns: (is_high_vol: bool, score: 0-100)
    """
    current_atr = calculate_atr(candles_1m[-lookback:], period=14)
    baseline_atr = calculate_atr(candles_1m[-baseline_lookback:], period=14)

    if baseline_atr == 0:
        return (False, 0)

    vol_ratio = current_atr / baseline_atr

    # Also check: is this coin a "top gainer/loser" of the day?
    daily_change_pct = abs(candles_1m[-1].close / candles_1m[-1440].close - 1) * 100

    ratio_score = min(100, max(0, (vol_ratio - 1) * 100))  # 2x ATR = score 100
    change_score = min(100, daily_change_pct * 5)  # 20% daily move = score 100

    score = ratio_score * 0.6 + change_score * 0.4

    return (score >= 60, score)
```

### 3.2 Swing Point Detection

```python
def find_swing_points(candles, min_bars=3):
    """
    Swing High: candle[i].high > candle[i-1].high AND candle[i].high > candle[i+1].high
    Swing Low:  candle[i].low < candle[i-1].low AND candle[i].low < candle[i+1].low

    Requires at least 3 candles to form.

    Level hierarchy (bigger = better):
      - Previous 1h high/low (minimum quality)
      - Previous 4h high/low
      - Previous day high/low
      - Previous week high/low
    """
    swings = []
    for i in range(1, len(candles) - 1):
        if candles[i].high > candles[i-1].high and candles[i].high > candles[i+1].high:
            swings.append(SwingPoint(type='high', price=candles[i].high, time=candles[i].time, index=i))
        if candles[i].low < candles[i-1].low and candles[i].low < candles[i+1].low:
            swings.append(SwingPoint(type='low', price=candles[i].low, time=candles[i].time, index=i))
    return swings
```

### 3.3 Entry Logic

```
ENTRY RULES (IF → THEN):

1. WHERE: At relevant swing high (for longs) or swing low (for shorts)
   - Minimum: previous 1-hour high/low
   - Better: previous 4h, daily, weekly high/low
   - Bigger level = easier trade

2. WHEN: After 1 candle close THROUGH the level
   - The candle body must close beyond the level (not just wick through)
   - This confirms the "wall of limit orders" has been absorbed

3. HOW:
   - IF distance from entry level to stoploss < 3%:
     → Use LIMIT ORDER placed directly ON the broken level (retest entry)
   - IF distance from entry level to stoploss ≥ 3%:
     → Use MARKET ORDER immediately after candle close confirmation
   - Rationale: In low-volatility moves, market order fees eat too much edge

4. SIZE:
   - Risk per trade = configurable % of account (default 1-2%)
   - Position size = risk_amount / (entry_price - stoploss_price)
   - Max leverage from Hyperliquid metaAndAssetCtxs
```

### 3.4 Stoploss Logic

```
STOPLOSS RULES:

1. For LONGS: Place at the most recent relevant SWING LOW
2. For SHORTS: Place at the most recent relevant SWING HIGH

The swing point chosen for the stoploss should be:
  - The closest swing point that is on the OPPOSITE side of the level
  - Must be at least 0.5% away (minimum distance for Hyperliquid)
  - Should NOT be more than 5% away (otherwise risk:reward too poor)
```

### 3.5 Take Profit Logic

```
TAKE PROFIT RULES:

Standard case (there IS a next resistance/support level):
  → TP = next major swing high (for longs) or swing low (for shorts)
  → Trade "level to level"
  → Aim for 1R to 1.5R trades (consistent, compounding)

ATH breakout case (no next level above):
  → 3/3 regime score: Trail SL to each new swing low as price makes new highs
  → 2/3 regime score: Take profit at +1R
  → 1/3 or less: DON'T TRADE

Evolving R rule (prevent round-tripping):
  → IF price moves ≥ 0.9R in favor:
    → Move SL to +0.1R (lock in small profit)
  → This caps max risk at ~1R of unrealized + realized P&L

Time-based exit:
  → IF position is open for > 2 hours AND price is stuck sideways/choppy:
    → Exit at market (regime likely shifting to mean reversion)
  → "Would I re-enter this trade right now?" test
```

### 3.6 Coin Selection

```
COIN SELECTION CRITERIA:

1. Altcoin perpetual futures on Hyperliquid
2. Minimum volume: $100k per 1-minute candle (ideally top 3 by tick count)
3. Prefer: Top gainers for momentum longs, top losers for momentum shorts
4. Avoid: BTC/ETH (too efficient), illiquid coins (<$50k/min volume)

Scanning process:
  → Every 5 minutes: Rank all HL coins by 1h change %
  → Top 5 gainers: candidates for momentum LONG
  → Top 5 losers: candidates for momentum SHORT
  → For each candidate: run regime detection (3 variables)
  → Only trade if regime score ≥ 2/3
```

---

## 4. Risk Management

```
RISK RULES (HARD-CODED, NEVER OVERRIDE):

Position-level:
  • Max risk per trade: 2% of account equity
  • Max leverage: min(10x, token_max_leverage / 2)
  • Minimum R:R ratio: 1:1 (never enter if TP < SL distance)
  • Max concurrent positions: 3
  • Max positions per coin: 1

Account-level:
  • Daily loss limit: -5% of account equity → stop trading for 24h
  • Weekly loss limit: -10% of account equity → stop trading for 7 days
  • Max drawdown from peak: -15% → halt all trading, require manual restart
  • Min account balance to trade: $500 (below = auto-shutdown)

Execution safety:
  • All orders use post-only/reduce-only when applicable
  • SL orders placed IMMEDIATELY after entry confirmation
  • If SL order fails to place: close position at market immediately
  • Heartbeat: if no WS data for >10 seconds, close all positions
```

---

## 5. Implementation Phases

### Phase 1: Data Foundation (Week 1-2)
- [ ] Rust project scaffold with Cargo workspace
- [ ] Hyperliquid WS client (l2Book, trades, candles, userFills, orderUpdates)
- [ ] Candle aggregator (1m, 5m, 15m, 1h from WS trades)
- [ ] Volume tracker (rolling 1m/5m/1h volume bars)
- [ ] Swing point detector
- [ ] Redis state management (config hot-reload)
- [ ] PostgreSQL trade journal schema

### Phase 2: Strategy Engine (Week 3-4)
- [ ] Regime detector (3 variables → regime score)
- [ ] Coin scanner (top gainers/losers, volume filter)
- [ ] Entry signal generator (swing break + candle close confirmation)
- [ ] Stoploss calculator (swing point placement)
- [ ] Take profit calculator (next level + ATH logic)
- [ ] Position sizer (risk-based)
- [ ] Trade quality scorer (3/3, 2/3, 1/3 checklist)

### Phase 3: Execution Layer (Week 5-6)
- [ ] Hyperliquid order placement (EIP-712 signing in Rust)
- [ ] Limit order manager (place, cancel, modify)
- [ ] Market order executor
- [ ] SL/TP order management
- [ ] Trailing stoploss (evolving R rule)
- [ ] Position monitor (fill tracking, PnL updates)
- [ ] Time-based exit logic (2-hour stale check)

### Phase 4: Risk & Safety (Week 7)
- [ ] Per-trade risk enforcer
- [ ] Daily/weekly loss circuit breaker
- [ ] Max drawdown halt
- [ ] WS heartbeat watchdog
- [ ] SL placement verifier (never trade without SL)
- [ ] Emergency close-all function

### Phase 5: Monitoring & Dashboard (Week 8)
- [ ] NestJS monitoring app (reuse monorepo pattern)
- [ ] REST API: /status, /positions, /trades, /config
- [ ] Web dashboard: current regime, active positions, P&L
- [ ] Lark alerts: entry, exit, risk events, errors
- [ ] Telegram alerts: daily summary
- [ ] Trade journal: every trade logged with regime score, quality score, screenshot reference

### Phase 6: Backtesting & Optimization (Week 9-10)
- [ ] Historical data loader (Hyperliquid or Copin)
- [ ] Backtest engine: replay strategy on historical 1m candles
- [ ] Regime detection accuracy validation
- [ ] Parameter optimization: lookback periods, thresholds, R targets
- [ ] Walk-forward testing
- [ ] Paper trading mode (everything except real order placement)

---

## 6. Directory Structure

```
momentum-bot/
├── Cargo.toml                    # Rust workspace
├── crates/
│   ├── data/                     # WS feed, candle aggregation, orderbook
│   │   ├── src/
│   │   │   ├── ws_client.rs      # Hyperliquid WebSocket handler
│   │   │   ├── candle_agg.rs     # 1m candle aggregator from trades
│   │   │   ├── orderbook.rs      # L2 book state management
│   │   │   ├── volume.rs         # Rolling volume tracker
│   │   │   └── lib.rs
│   │   └── Cargo.toml
│   ├── strategy/                 # Regime detection, signals, scoring
│   │   ├── src/
│   │   │   ├── regime.rs         # 3-variable regime detector
│   │   │   ├── swing.rs          # Swing point detection
│   │   │   ├── entry.rs          # Entry logic (WHERE/WHEN/HOW)
│   │   │   ├── stoploss.rs       # SL placement
│   │   │   ├── target.rs         # TP calculation
│   │   │   ├── scanner.rs        # Coin selection (top gainers/losers)
│   │   │   ├── scorer.rs         # Trade quality score (3/3 checklist)
│   │   │   └── lib.rs
│   │   └── Cargo.toml
│   ├── execution/                # Order management, risk, signing
│   │   ├── src/
│   │   │   ├── orders.rs         # Hyperliquid order API
│   │   │   ├── signing.rs        # EIP-712 phantom agent
│   │   │   ├── position.rs       # Position tracking
│   │   │   ├── risk.rs           # Risk manager (limits, circuit breakers)
│   │   │   ├── trailing.rs       # Trailing SL / evolving R
│   │   │   └── lib.rs
│   │   └── Cargo.toml
│   └── bot/                      # Main binary, orchestration
│       ├── src/
│       │   ├── main.rs           # Entry point, init, event loop
│       │   ├── config.rs         # Redis config loader
│       │   └── journal.rs        # PostgreSQL trade journal
│       └── Cargo.toml
├── monitoring/                   # TypeScript/NestJS dashboard (in main monorepo)
│   └── (integrated into apps/momentum-monitor/)
├── config/
│   ├── default.toml              # Default config
│   └── production.toml           # Production overrides
├── docs/
│   ├── PLAN.md                   # This file
│   ├── STRATEGY.md               # Codified strategy rules
│   └── API.md                    # Hyperliquid API reference
├── .claude/
│   └── skills/                   # Claude Code skills for this project
└── scripts/
    ├── backtest.py               # Python backtest runner
    └── deploy.sh                 # Deployment script
```

---

## 7. Config Schema (Redis / TOML)

```toml
[account]
api_key = "${HYPERLIQUID_API_KEY}"          # From env
secret_key = "${HYPERLIQUID_SECRET_KEY}"    # From env
vault_address = ""                           # Optional

[risk]
max_risk_per_trade_pct = 2.0
max_leverage = 10
max_concurrent_positions = 3
max_positions_per_coin = 1
min_rr_ratio = 1.0
daily_loss_limit_pct = 5.0
weekly_loss_limit_pct = 10.0
max_drawdown_pct = 15.0
min_account_balance = 500.0

[strategy]
regime_lookback_minutes = 120               # 2 hours
min_volume_per_minute_usd = 100000          # $100k/min
min_regime_score = 2                         # Minimum 2 out of 3 criteria
candle_timeframe = "1m"                     # Primary timeframe
entry_candle_confirm = 1                    # 1 candle close through level
limit_order_threshold_pct = 3.0             # Below 3%: use limit, above: use market
stale_position_timeout_minutes = 120        # 2 hours max

[strategy.staircase]
min_lookback_candles = 120
pullback_ratio_threshold = 0.4
slope_consistency_threshold = 0.5

[strategy.volume]
increase_threshold_pct = 5.0                # Each quarter must increase by 5%

[strategy.volatility]
atr_ratio_threshold = 1.5                   # Current ATR must be 1.5x baseline
daily_change_threshold_pct = 5.0            # Coin must be moving >5% today

[strategy.levels]
min_level_timeframe = "1h"                  # Minimum: previous 1h high/low
preferred_timeframes = ["1h", "4h", "1d", "1w"]

[strategy.targets]
default_rr = 1.0                            # Default 1R target
strong_regime_rr = 1.5                      # 3/3 regime: aim for 1.5R
trailing_trigger_r = 0.9                    # Start trailing at 0.9R
trailing_lock_r = 0.1                       # Lock in 0.1R profit when trailing

[scanner]
scan_interval_seconds = 300                 # Scan every 5 minutes
top_n_candidates = 5                        # Top 5 gainers + top 5 losers
min_24h_volume_usd = 5000000                # $5M daily volume minimum

[alerts]
lark_webhook_url = "${LARK_WEBHOOK_URL}"
telegram_bot_token = "${TELEGRAM_BOT_TOKEN}"
telegram_chat_id = "${TELEGRAM_CHAT_ID}"
alert_on_entry = true
alert_on_exit = true
alert_on_risk_event = true
daily_summary = true
```

---

## 8. Key Metrics to Track

```
Per Trade:
  - Regime score at entry (staircase/volume/volatility scores)
  - Trade quality score (3/3, 2/3, 1/3)
  - Entry type (limit vs market)
  - R-multiple achieved
  - Hold duration
  - Max favorable excursion (MFE)
  - Max adverse excursion (MAE)
  - Coin, direction, leverage

Aggregate:
  - Win rate (overall + by regime quality)
  - Average R-multiple
  - Profit factor
  - Max drawdown
  - Sharpe ratio (daily returns)
  - Best/worst trades
  - Regime detection accuracy (did 3/3 trades perform better than 2/3?)
```
