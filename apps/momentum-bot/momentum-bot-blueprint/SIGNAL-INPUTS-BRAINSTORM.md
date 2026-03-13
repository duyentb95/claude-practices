# Signal Inputs Brainstorm — Momentum Breakout Trading Bot

> Tất cả data inputs có thể dùng để xác định Entry, Exit, SL, TP
> Phân loại theo layers: Raw → Derived → Composite → Decision

---

## Tổng Quan: Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        RAW DATA LAYER                               │
│                                                                     │
│  Hyperliquid WS          Hyperliquid REST        External           │
│  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐  │
│  │ L2 Orderbook │        │ metaAndAsset │        │ Copin API    │  │
│  │ Trades/Ticks │        │ allMids      │        │ Funding Rates│  │
│  │ Candles 1m   │        │ userState    │        │ CEX prices   │  │
│  │ userFills    │        │ userFunding  │        │ BTC dominance│  │
│  │ orderUpdates │        │ openOrders   │        │ Social/news  │  │
│  └──────┬───────┘        └──────┬───────┘        └──────┬───────┘  │
└─────────┼───────────────────────┼───────────────────────┼──────────┘
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     DERIVED INDICATORS LAYER                        │
│                                                                     │
│  Price Structure    Volume Analysis    Orderbook Metrics   Timing   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────┐ │
│  │ Swing H/L    │  │ VWAP         │  │ Bid/Ask depth│  │ Session│ │
│  │ Staircase    │  │ Volume trend │  │ Spread       │  │ Day/Hr │ │
│  │ Candle patt. │  │ Delta (CVD)  │  │ Imbalance    │  │ Funding│ │
│  │ ATR / Vol    │  │ Tick count   │  │ Sell walls   │  │ time   │ │
│  │ Trend slope  │  │ Buy/Sell %   │  │ Queue depth  │  │        │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └───┬────┘ │
└─────────┼──────────────────┼──────────────────┼─────────────┼──────┘
          │                  │                  │             │
          ▼                  ▼                  ▼             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    COMPOSITE SIGNALS LAYER                           │
│                                                                     │
│  Regime Score (0-3)    Breakout Confidence    Trade Quality         │
│  Entry Signal          SL Placement           TP Placement          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Raw Data Sources

### 1.1 Hyperliquid WebSocket Streams

| Stream | Data | Frequency | Dùng cho |
|--------|------|-----------|----------|
| `trades` | Mỗi trade: price, size, side, time | Real-time (mỗi tick) | Tick count, CVD, volume delta, trade flow |
| `l2Book` | 20 levels bid/ask: price, size | ~100ms updates | Orderbook imbalance, spread, walls, depth |
| `candle` (1m) | OHLCV candles | Mỗi 1 phút | Staircase detection, swing points, pattern |
| `allMids` | Mid price tất cả coins | ~1s | Screener: top gainers/losers, correlation |
| `userFills` | Fills của mình | On fill | Position tracking, PnL |
| `orderUpdates` | Order status changes | On change | Execution monitoring |
| `activeAssetCtx` | Funding rate, OI, mark price | ~1s | Funding cost, sentiment |

### 1.2 Hyperliquid REST (Polling)

| Endpoint | Data | Frequency polling | Dùng cho |
|----------|------|-------------------|----------|
| `metaAndAssetCtxs` | Token list + market stats | Mỗi 5 phút | Universe filter, szDecimals, maxLeverage |
| `clearinghouseState` | Positions + equity | Mỗi 10s | Risk check, position sizing |
| `openOrders` | Pending orders | Mỗi 10s | Order management |
| `userFunding` | Funding payments | Mỗi 1h | PnL tracking |

### 1.3 External Data (Optional Enrichment)

| Source | Data | Dùng cho |
|--------|------|----------|
| Copin API | Trader statistics, whale positions | Smart money tracking, OI analysis |
| Binance/Bybit REST | CEX price, funding, OI | CEX-DEX premium, funding arb signal |
| CoinGecko/CoinMarketCap | Market cap, category trends | Sector rotation, narrative detection |
| TradingView (scrape) | Top gainers/losers watchlist | Screener confirmation |
| Twitter/Telegram | Social buzz, announcement timing | News catalyst detection |

---

## Layer 2: Derived Indicators

### 2.1 Price Structure Indicators

#### 2.1.1 Swing Points (Core — PDF strategy)
```python
@dataclass
class SwingPoint:
    price: float
    timestamp: int
    type: Literal["HIGH", "LOW"]
    timeframe: str          # "1m", "5m", "15m", "1h", "4h", "1d"
    strength: int           # Số candles bên trái/phải confirm (3, 5, 7...)
    time_away: int          # Seconds since price was last at this level
    touch_count: int        # Bao nhiêu lần price đã test level này

# Signals:
#   - Entry level: major swing H/L (bigger = better)
#   - SL placement: nearest swing point opposite direction
#   - Level quality: time_away càng lớn → reaction càng violent
#   - Breakout detection: close > swing_high → long entry trigger
```

#### 2.1.2 Staircase Pattern (Core — PDF strategy)
```python
@dataclass
class StaircaseMetrics:
    direction: Literal["BULLISH", "BEARISH", "NONE"]
    
    # Slope metrics
    swing_low_slope: float      # Linear regression slope of swing lows
    swing_high_slope: float     # Linear regression slope of swing highs
    
    # Asymmetry: avg(up_candles range) / avg(down_candles range)
    # > 1.2 = bullish momentum, < 0.8 = bearish momentum
    asymmetry_ratio: float
    
    # Grindiness: 1 - (max_single_candle_range / total_range)
    # > 0.7 = grindy (good), < 0.5 = spiky (bad)
    grindiness: float
    
    # Consistency: % of 15-min windows that moved in staircase direction
    directional_consistency: float   # > 0.6 = clean staircase
    
    # Pullback metrics
    avg_pullback_pct: float     # Average size of counter-moves
    max_pullback_pct: float     # Largest single pullback
    pullback_recovery_time: int # Avg minutes to recover from pullback
    
    # Duration
    duration_minutes: int
    num_swing_points: int

# Signals:
#   - Variable #1: is_valid staircase → score +1
#   - Entry confidence: higher grindiness + consistency = more confident
#   - SL tightness: small avg_pullback → can use tighter SL
#   - TP ambition: long duration + high consistency → aim for next S/R
```

#### 2.1.3 Candle Patterns
```python
@dataclass
class CandleAnalysis:
    # Individual candle metrics
    body_pct: float              # |close - open| / (high - low)
    upper_wick_pct: float        # (high - max(open,close)) / (high - low)
    lower_wick_pct: float        # (min(open,close) - low) / (high - low)
    is_bullish: bool
    range_vs_atr: float          # candle range / ATR → relative size
    
    # Multi-candle patterns (breakout-relevant)
    is_engulfing: bool           # Current candle engulfs previous
    is_marubozu: bool            # No/tiny wicks → strong conviction
    close_vs_range: float        # (close - low) / (high - low) → 0=weak, 1=strong

# Signals:
#   - Breakout candle quality: marubozu + large body = strong breakout
#   - Weak breakout: long upper wick after breaking resistance = trap
#   - Close vs range > 0.8 = closed near highs (bullish breakout quality)
#   - Engulfing at S/R = stronger breakout signal
```

#### 2.1.4 Volatility Metrics
```python
@dataclass
class VolatilityMetrics:
    atr_1m: float               # ATR on 1-minute candles
    atr_5m: float
    atr_1h: float
    atr_percentile: float       # Current ATR vs 24h range (0-100)
    
    realized_vol_1h: float      # Annualized realized volatility (1h window)
    realized_vol_4h: float
    
    bollinger_width: float      # BB width = (upper - lower) / middle
    bb_squeeze: bool            # Width at 20-period low → expansion coming
    
    range_expansion: bool       # Current 1h range > previous 1h range

# Signals:
#   - High ATR + expanding → good for momentum (Variable #3 proxy)
#   - BB squeeze → potential breakout setup (store energy → release)
#   - ATR percentile > 70 → use market orders (fast market)
#   - ATR percentile < 30 → use limit orders (slow market)
#   - Entry decision: ATR determines limit vs market order type
#   - SL sizing: SL distance should be ≥ 1.5x ATR to avoid noise
```

#### 2.1.5 Trend Indicators
```python
@dataclass
class TrendMetrics:
    # EMAs
    ema_9: float
    ema_21: float
    ema_50: float
    ema_200: float
    
    ema_alignment: Literal["BULLISH", "BEARISH", "MIXED"]
    # BULLISH: 9 > 21 > 50 > 200 (all aligned)
    
    # Price vs EMAs
    price_vs_ema50: float       # % distance from EMA50
    price_vs_ema200: float
    
    # ADX (trend strength)
    adx: float                  # > 25 = trending, < 20 = ranging
    plus_di: float
    minus_di: float
    
    # Higher timeframe trend
    htf_trend_4h: Literal["UP", "DOWN", "SIDEWAYS"]
    htf_trend_1d: Literal["UP", "DOWN", "SIDEWAYS"]

# Signals:
#   - EMA alignment BULLISH + staircase UP → strong confirmation
#   - ADX > 25 → trending environment (good for momentum)
#   - ADX < 20 → ranging (avoid momentum, consider mean reversion)
#   - Price stretched far from EMA50 → increased pullback risk
#   - HTF trend aligns with trade direction → higher quality setup
```

### 2.2 Volume Analysis

#### 2.2.1 Volume Trend (Core — PDF strategy)
```python
@dataclass
class VolumeAnalysis:
    # Rolling volume in USD
    volume_1m: float
    volume_5m: float
    volume_15m: float
    volume_1h: float
    
    # Volume trend (PDF Variable #2)
    trend_15m_buckets: Literal["INCREASING", "FLAT", "DECREASING"]
    trend_slope_normalized: float   # Slope / mean_volume
    
    # Volume relative to history
    volume_vs_24h_avg: float       # Current 1h vol / 24h avg hourly vol
    volume_percentile: float       # Where current vol sits in 24h distribution
    
    # Minimum liquidity check
    volume_per_minute_usd: float   # Must be ≥ $100k for strategy
    is_liquid_enough: bool

# Signals:
#   - Volume INCREASING → Variable #2 ✅ (score +1)
#   - volume_vs_24h_avg > 2x → "heating up" → higher conviction
#   - volume_per_minute < $100k → SKIP (too illiquid)
#   - Volume spike (>5x avg) on breakout candle → strong confirmation
```

#### 2.2.2 Cumulative Volume Delta (CVD)
```python
@dataclass
class CVDMetrics:
    # CVD = cumulative(buy_volume - sell_volume) over time
    cvd_raw: float              # Running CVD value
    cvd_slope_15m: float        # CVD trend direction
    cvd_divergence: bool        # Price up but CVD down → bearish divergence
    
    # Per-candle delta
    delta_1m: float             # buy_vol - sell_vol for last 1m candle
    delta_pct: float            # delta / total_volume → -1 to +1
    
    # Aggressor analysis
    buy_pct_15m: float          # % of volume from aggressive buys (last 15m)
    sell_pct_15m: float

# Signals:
#   - CVD rising + price rising → genuine buying pressure (momentum confirmed)
#   - CVD flat + price rising → weak breakout (limit orders being swept, not real demand)
#   - CVD divergence → DON'T ENTER even if staircase looks good
#   - buy_pct > 60% → aggressive buyers dominating → bullish momentum
#   - delta_pct > 0.3 on breakout candle → strong breakout confirmation
```

#### 2.2.3 Tick Analysis
```python
@dataclass
class TickMetrics:
    # Trade count (from PDF: "Tick Count")
    tick_count_5m: int          # Number of individual trades in 5 min
    tick_count_vs_avg: float    # Relative to 24h average
    
    # Tick distribution
    avg_trade_size: float       # Average size per tick (USD)
    large_trade_count: int      # Trades > $10k in last 5 min
    large_trade_pct: float      # % of volume from large trades
    
    # Trade arrival rate
    trades_per_second: float    # Current rate
    rate_acceleration: float    # Is rate increasing or decreasing?

# Signals:
#   - Tick count top 3 among all coins → "where the action is" (PDF tip)
#   - large_trade_pct > 30% → institutional/whale activity
#   - rate_acceleration > 0 → market heating up
#   - Abnormally high tick count → easier for momentum (PDF)
```

### 2.3 Orderbook Microstructure

#### 2.3.1 Orderbook Imbalance (Core — PDF theory)
```python
@dataclass
class OrderbookMetrics:
    # Depth
    bid_depth_1pct: float       # Total bid volume within 1% of mid
    ask_depth_1pct: float       # Total ask volume within 1% of mid
    bid_depth_2pct: float
    ask_depth_2pct: float
    
    # Imbalance ratio = (bid_depth - ask_depth) / (bid_depth + ask_depth)
    # +1 = all bids (bullish), -1 = all asks (bearish)
    imbalance_1pct: float       # -1 to +1
    imbalance_2pct: float
    
    # Spread
    spread_bps: float           # Bid-ask spread in basis points
    spread_vs_avg: float        # Relative to 1h average
    
    # Wall detection
    nearest_bid_wall: Optional[PriceLevel]  # Largest bid cluster
    nearest_ask_wall: Optional[PriceLevel]  # Largest ask cluster
    wall_distance_pct: float    # Distance from mid to nearest wall
    
    # Queue position metrics
    top_bid_size: float         # Size at best bid
    top_ask_size: float         # Size at best ask
    top_imbalance: float        # (top_bid - top_ask) / (top_bid + top_ask)

# Signals (from PDF orderbook theory):
#   - imbalance_1pct > 0.3 + staircase UP → double confirmation (limit + market imbalance)
#   - Thick bids (high bid_depth) absorb sell pressure → easier to push UP
#   - Thin asks → less resistance → breakout more likely to succeed
#   - ask_wall near resistance → TP target (or breakout level)
#   - ask_wall broken on breakout → next wall becomes TP target
#   - Spread widening during breakout → high volatility → use market order
#   - imbalance flip (was +0.3, now -0.2) → momentum exhaustion → consider exit
```

#### 2.3.2 Order Flow Dynamics
```python
@dataclass
class OrderFlowMetrics:
    # Market orders eating into book
    aggressive_buy_volume_1m: float
    aggressive_sell_volume_1m: float
    aggressor_ratio: float      # buy_aggressive / sell_aggressive
    
    # Absorption detection
    # When large sell hits bid wall but price doesn't drop → absorption
    absorption_detected: bool
    absorption_level: Optional[float]
    
    # Spoofing/flashing detection (orders placed and quickly cancelled)
    cancelled_bid_volume_1m: float
    cancelled_ask_volume_1m: float
    spoof_ratio: float          # cancelled / placed ratio
    
    # Iceberg detection (hidden orders)
    # If a price level keeps refilling after being hit → iceberg
    iceberg_bid_detected: bool
    iceberg_ask_detected: bool

# Signals:
#   - aggressor_ratio > 1.5 → strong buying pressure (momentum signal)
#   - Absorption at swing low → support holding → SL below this level is safe
#   - Iceberg bid detected at support → very strong support → tighter SL possible
#   - High spoof_ratio on asks → fake sell walls → breakout more likely
```

### 2.4 Cross-Market & Timing Signals

#### 2.4.1 Relative Strength
```python
@dataclass
class RelativeStrength:
    # vs BTC
    coin_vs_btc_24h: float      # Coin 24h return - BTC 24h return
    coin_vs_btc_1h: float
    
    # vs Market
    coin_vs_market_24h: float   # vs average of top 20 coins
    
    # Sector
    sector_strength: float      # If coin is in meme/defi/L1 sector, how is the sector doing?
    
    # CEX-DEX comparison
    cex_price: float            # Price on Binance/Bybit
    dex_price: float            # Price on Hyperliquid
    premium_pct: float          # (dex - cex) / cex * 100
    
    # Funding rate context
    funding_rate_8h: float      # Current funding rate
    funding_annualized: float
    funding_vs_avg: float       # vs 7-day average

# Signals:
#   - coin_vs_btc > 5% → outperforming → has its own momentum (good)
#   - Positive premium on DEX → aggressive DEX buyers → momentum confirmation
#   - Very high positive funding → crowded long → increased reversal risk
#   - Sector rotating into our coin's sector → tailwind for momentum
```

#### 2.4.2 Time-Based Signals
```python
@dataclass
class TimingSignals:
    # Session
    current_session: str        # "ASIA", "EUROPE", "US", "OVERLAP"
    session_open_close: bool    # Near session open/close?
    
    # Periodic levels
    daily_open: float           # Price at 00:00 UTC
    weekly_open: float          # Price at Monday 00:00 UTC
    prev_day_high: float
    prev_day_low: float
    prev_week_high: float
    prev_week_low: float
    
    # Time since level formation
    time_since_swing_high: int  # Minutes since last swing high formed
    time_since_swing_low: int
    
    # Candle time
    time_in_current_1h: int     # Minutes into current hourly candle
    time_to_hourly_close: int   # Minutes until hourly candle closes
    
    # Funding window
    time_to_next_funding: int   # Minutes until next 8h funding
    
    # Day of week
    day_of_week: int            # 0=Mon, 6=Sun
    is_weekend: bool

# Signals:
#   - US+EU overlap session → highest volume → best for momentum
#   - Weekend → lower volume → harder for momentum breakouts
#   - Near hourly close → wait for close to confirm breakout (don't front-run)
#   - Time since swing high > 24h → bigger level → stronger reaction expected
#   - prev_day_high as entry level → high quality (from PDF)
#   - Near funding time → avoid entering, funding can cause short-term volatility
```

---

## Layer 3: Composite Signals → Decision Points

### 3.1 Entry Decision Matrix

```
ENTRY SIGNAL = regime_ok AND breakout_confirmed AND orderbook_supportive

regime_ok:
  staircase_valid           → +1
  volume_increasing         → +1
  duration >= 120min        → +1
  NEED ≥ 2/3

breakout_confirmed:
  1m_candle.close > swing_high (long) or < swing_low (short)
  AND candle_quality: body_pct > 0.5 (not a doji/hammer)
  AND NOT (upper_wick > 50% of range)  → not a rejection
  
orderbook_supportive (confidence booster, not required):
  imbalance in trade direction > 0.2     → +confidence
  CVD confirming direction               → +confidence
  aggressor_ratio in trade direction > 1.3 → +confidence
  NO divergence (CVD vs price)           → +confidence
  
order_type:
  IF atr_percentile < 40 OR sl_distance < 3%:
      → LIMIT ORDER (patience, save fees)
  ELSE:
      → MARKET ORDER (speed, guarantee fill)
```

### 3.2 SL Decision Matrix

```
SL PLACEMENT:

Primary: relevant swing point opposite direction
  LONG:  SL = nearest swing LOW below entry
  SHORT: SL = nearest swing HIGH above entry

Adjustments:
  IF swing point too close (< 1% from entry):
      → Use 2nd swing point (wider SL but more breathing room)
      
  IF swing point too far (> 5% from entry):
      → Consider reducing position size or skip trade
      
  IF absorption detected at swing point:
      → Can tighten SL slightly below absorption level
      
  IF iceberg bid at support:
      → Strong support → SL just below iceberg level

EVOLVING SL (Active Management):
  IF unrealized_PnL >= 0.9R:
      → Trail SL to entry + 0.1R
      
  IF price makes new swing high (long) during trade:
      → Trail SL to new swing low (PDF: trailing at ATH breakouts)
      
  IF orderbook imbalance FLIPS against us:
      → Consider tightening SL to nearest swing point
      
  IF volume drops > 50% from entry level:
      → Consider early exit (regime exhaustion)
```

### 3.3 TP Decision Matrix

```
TP PLACEMENT:

IF regime_score == 3 (all criteria met):
    IF NOT at all-time high:
        → TP at NEXT major S/R level
        → But check: orderbook wall confirms that level?
        
    IF at all-time high:
        → Option A: TP at +1R (safe)
        → Option B: TP at next ask_wall in orderbook (medium)
        → Option C: No TP, trail SL only (aggressive, 3/3 only)
        
IF regime_score == 2:
    → TP at +1R (conservative — from PDF)
    → No exceptions, play it safe

EARLY EXIT TRIGGERS:
  IF 2 hours passed AND pnl < 0.5R:
      → Cut trade (momentum exhausted — from PDF)
      
  IF CVD divergence develops after entry:
      → Cut trade (buyers not following through)
      
  IF orderbook imbalance reverses significantly:
      → Cut at next candle close (support/resistance reforming)
      
  IF volume drops > 60% from entry candle:
      → Cut trade (interest fading)
      
  IF "would I re-enter this trade right now?" → NO:
      → Exit (PDF: "mouse prank" thought experiment)
```

### 3.4 Screener / Universe Selection

```
COIN SELECTION PIPELINE:

Step 1: Universe Filter
  ALL coins on Hyperliquid WHERE:
    volume_per_minute >= $100k
    AND listed >= 7 days (avoid brand new, unreliable data)
    AND maxLeverage >= 10 (tradeable)

Step 2: Directional Sort
  LONG candidates: sort by 24h_change_pct DESC (top gainers)
  SHORT candidates: sort by 24h_change_pct ASC (top losers)

Step 3: Momentum Quality Filter
  FOR each top 10 candidate:
    Run regime detection (staircase + volume + duration)
    Keep only those with score >= 2

Step 4: Priority Ranking
  Sort surviving candidates by:
    regime_score DESC,
    volume_vs_24h_avg DESC,
    tick_count_relative DESC
    
  Trade top 1-3 coins (limited by max_concurrent_positions)

Step 5: Dynamic Re-scan
  Re-run screener every 15 minutes
  If current coin's regime degrades → stop taking new entries
  If better candidate appears → add to watchlist (don't abandon open trades)
```

---

## Tổng Hợp: Input Catalog

### Bảng tổng hợp tất cả inputs → decision mapping

| # | Input | Source | Dùng cho | Priority |
|---|-------|--------|----------|----------|
| **PRICE** | | | | |
| 1 | OHLCV 1m candles | WS candle | Staircase, swings, patterns | Critical |
| 2 | OHLCV 5m/15m/1h | Aggregated from 1m | Multi-TF swing points, trend | Critical |
| 3 | Swing Highs/Lows | Derived from candles | Entry levels, SL/TP levels | Critical |
| 4 | Staircase metrics | Derived (slope, asymmetry, grindiness) | Variable #1 scoring | Critical |
| 5 | ATR (1m, 5m, 1h) | Derived from candles | Volatility, SL sizing, order type | High |
| 6 | EMA alignment | Derived (9/21/50/200) | Trend confirmation | Medium |
| 7 | ADX | Derived | Trending vs ranging regime | Medium |
| 8 | Bollinger Band width | Derived | Squeeze → expansion detection | Low |
| 9 | Previous day/week H/L | Derived from 1d/1w candles | Major S/R levels | High |
| **VOLUME** | | | | |
| 10 | Volume 1m raw | WS candle | Volume trend calculation | Critical |
| 11 | Volume 15m buckets | Aggregated | Variable #2 trend detection | Critical |
| 12 | Volume trend slope | Linear regression on buckets | Variable #2 scoring | Critical |
| 13 | Volume vs 24h avg | Derived | Market "heating up" detection | High |
| 14 | Volume per minute | Derived | Liquidity filter ($100k min) | Critical |
| 15 | Volume spike detection | Derived (>3x avg) | Breakout confirmation | High |
| **TICKS/TRADES** | | | | |
| 16 | Individual trades | WS trades | CVD, tick analysis, trade flow | High |
| 17 | Tick count (5m) | Counted from trades | Coin attention ranking | High |
| 18 | Buy/sell volume split | Classified from trades | CVD calculation, aggressor ratio | High |
| 19 | CVD (cum. volume delta) | Derived from trades | Divergence detection | High |
| 20 | Average trade size | Derived | Institutional vs retail detection | Medium |
| 21 | Large trade count | Filtered (>$10k) | Whale activity | Medium |
| **ORDERBOOK** | | | | |
| 22 | L2 book (20 levels) | WS l2Book | Imbalance, depth, walls | High |
| 23 | Bid/ask imbalance | Derived from L2 | Limit order imbalance (PDF theory) | High |
| 24 | Spread (bps) | Derived from L2 | Market quality, order type decision | Medium |
| 25 | Sell/buy walls | Detected from L2 | TP targets, breakout resistance | High |
| 26 | Absorption events | Inferred from L2 + trades | Support/resistance strength | Medium |
| **CROSS-MARKET** | | | | |
| 27 | BTC price & trend | WS allMids | Market context, correlation | Medium |
| 28 | Coin vs BTC relative | Derived | Outperformance → own momentum | Medium |
| 29 | Funding rate | WS activeAssetCtx | Cost of holding, sentiment proxy | Medium |
| 30 | CEX price (Binance) | External REST | Premium/discount detection | Low |
| 31 | Open Interest | Copin or HL API | Crowding, liquidation risk | Medium |
| **TIMING** | | | | |
| 32 | Trading session | Derived from UTC time | Volume expectation | Low |
| 33 | Time since level formed | Derived from swing detection | Level quality (PDF: more time = stronger) | High |
| 34 | Time in trade | Timer | Timeout rule (2h max) | Critical |
| 35 | Funding countdown | Derived from 8h intervals | Avoid entry near funding | Low |

### Priority Legend

| Priority | Meaning | Implementation Phase |
|----------|---------|---------------------|
| **Critical** | Strategy doesn't work without it | Phase 1-2 (Must have) |
| **High** | Significantly improves signal quality | Phase 2-3 (Should have) |
| **Medium** | Nice edge improvement | Phase 3-4 (Good to have) |
| **Low** | Minor optimization | Phase 4+ (Optional) |

---

## Phụ Lục: Data Structure Proposals

### Master State Object (per coin)

```python
@dataclass
class CoinState:
    """Complete state for one coin — updated in real-time"""
    
    # Identity
    coin: str
    timestamp: int
    
    # Price structure
    candles_1m: deque[Candle]           # Rolling 1000 candles
    swing_highs: list[SwingPoint]
    swing_lows: list[SwingPoint]
    staircase: StaircaseMetrics
    trend: TrendMetrics
    volatility: VolatilityMetrics
    
    # Volume
    volume: VolumeAnalysis
    cvd: CVDMetrics
    ticks: TickMetrics
    
    # Orderbook
    orderbook: OrderbookMetrics
    order_flow: OrderFlowMetrics
    
    # Cross-market
    relative_strength: RelativeStrength
    timing: TimingSignals
    
    # Regime
    regime_score: int                   # 0-3
    regime_details: dict                # Which variables passed/failed
    
    # Active signal
    active_signal: Optional[Signal]
    
    # Position (if any)
    active_position: Optional[Position]
```

### Signal Object

```python
@dataclass
class Signal:
    coin: str
    direction: Literal["LONG", "SHORT"]
    
    # Levels
    entry_price: float
    sl_price: float
    tp_price: float
    r_ratio: float                      # TP distance / SL distance
    
    # Quality
    regime_score: int                   # 0-3
    regime_details: dict
    breakout_candle_quality: float      # 0-1
    orderbook_confirmation: float       # 0-1
    cvd_confirmation: bool
    
    # Execution
    order_type: Literal["LIMIT", "MARKET"]
    position_size_usd: float
    leverage: float
    
    # Metadata
    entry_level_type: str               # "1h_high", "4h_low", "daily_high", etc.
    time_since_level_formed: int        # minutes
    
    timestamp: int
```

---

## Key Insight: Phân Lớp Ưu Tiên

```
Phase 1 (MVP — works):
  Candles 1m → Swing points → Staircase → Volume trend → Regime score
  → Breakout detection → Fixed SL/TP → Execute

Phase 2 (Better signals):
  + CVD confirmation
  + Orderbook imbalance check
  + Volatility-adaptive order type
  + Tick count screener
  + Evolving SL

Phase 3 (Edge optimization):
  + Wall detection for TP
  + Absorption detection for SL
  + Multi-timeframe trend alignment
  + Relative strength filter
  + Funding-aware timing

Phase 4 (Advanced):
  + Order flow dynamics
  + CEX-DEX premium
  + Sector rotation
  + Smart money tracking via Copin
  + AI pattern recognition
```
