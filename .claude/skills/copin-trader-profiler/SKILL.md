---
name: copin-trader-profiler
description: >
  Use this skill to analyze and classify perp DEX traders using Copin Analyzer data.
  Triggers: trader profile, trader analysis, trader classification, smart trader, insider trader,
  algo trader, MM, HFT, market maker, whale, copy-worthy, trading behavior, sense trading,
  good trader, bad trader, degen, sniper, reverse copy, Copin, trader score, trader ranking,
  wallet analysis, perp DEX trader, Hyperliquid trader, GMX trader, dYdX trader.
version: 1.1.0
author: quant-trading-team
architecture: Pipeline
complexity: 17
platforms: [claude-code, cursor, windsurf]
tags: [copin, trader-profiling, perp-dex, hyperliquid, behavior-analysis, classification]
---

# Copin Trader Profiler

## Goal

Analyze and classify perpetual DEX traders using Copin Analyzer's public API and data.
Profile traders across behavioral archetypes (insider, smart trader, algo/MM/HFT, degen, sniper, etc.).
Output actionable trader intelligence reports with classification, behavioral fingerprints, and copy-worthiness scores.

## Instructions

### Copin API Reference

> Full reference: `resources/copin-api-reference.md`
> Source: https://api-docs.copin.io/api-reference/introduction

**Base URL:** `https://api.copin.io`
**Auth:** ALL requests require `X-API-KEY` header from env var `COPIN_API_KEY`
**Rate limit:** 30 req/min — use 2000ms delay between requests

```typescript
// Standard headers for ALL Copin API calls
const COPIN_HEADERS = {
  "Content-Type": "application/json",
  "X-API-KEY": process.env.COPIN_API_KEY  // NEVER hardcode
};
```

```bash
# Bash equivalent
-H "Content-Type: application/json" -H "X-API-KEY: ${COPIN_API_KEY}"
```

Protocol for Hyperliquid: `HYPERLIQUID`

#### API 1: Trader Statistics Filter (POST) — Main discovery endpoint
```
POST /public/{PROTOCOL}/position/statistic/filter
Headers: X-API-KEY: ${COPIN_API_KEY}

Body: {
  "pagination": {"limit": 20, "offset": 0},
  "queries": [{"fieldName": "type", "value": "D30"}],
  "ranges": [{"fieldName": "FIELD", "gte": N, "lte": N}],
  "sortBy": "FIELD",
  "sortType": "desc"
}
```

30+ filter fields across: PnL (pnl, realisedPnl, totalGain, totalLoss), ROI (avgRoi, maxRoi),
Risk (maxDrawdown), Volume (totalVolume, avgVolume), Trades (totalTrade, totalWin, totalLose,
totalLiquidation), Rates (winRate, profitRate, longRate, orderPositionRatio),
Ratios (profitLossRatio, gainLossRatio), Leverage (avgLeverage, maxLeverage, minLeverage),
Duration (avgDuration, minDuration, maxDuration in seconds), Time (lastTradeAtTs, runTimeDays), Fees (totalFee).

#### API 2: Trader Stats by Account (GET) — Single trader profile
```
GET /{PROTOCOL}/position-statistic/{account}
Headers: X-API-KEY: ${COPIN_API_KEY}
```
Returns all time periods (D7/D15/D30/D60) for one trader.

#### API 3: Positions by Account (POST)
```
POST /{PROTOCOL}/position/filter
Headers: X-API-KEY: ${COPIN_API_KEY}

Body: {
  "pagination": {"limit": 50, "offset": 0},
  "queries": [
    {"fieldName": "account", "value": "0x..."},
    {"fieldName": "status", "value": "CLOSE"}
  ],
  "sortBy": "closeBlockTime", "sortType": "desc"
}
```

#### API 4: Position Detail with Orders (GET)
```
GET /{PROTOCOL}/position/detail/{positionId}
Headers: X-API-KEY: ${COPIN_API_KEY}
```
Returns position + orders array (types: OPEN, INCREASE, DECREASE, CLOSE, MARGIN_TRANSFERRED, LIQUIDATE)

#### API 5: Leaderboard (GET)
```
GET /leaderboards/page?protocol=HYPERLIQUID&queryDate={epoch_ms}&statisticType=MONTH&limit=20&offset=0&sort_by=ranking&sort_type=asc
Headers: X-API-KEY: ${COPIN_API_KEY}
```

#### API 6: Open Interest (POST)
```
POST /{PROTOCOL}/top-positions/opening
Headers: X-API-KEY: ${COPIN_API_KEY}
Body: {"pagination": {"limit": 100, "offset": 0}, "sortBy": "size", "sortType": "desc"}
```

#### API 7: Live Orders (POST) — Real-time
```
POST /order/filter/graphql
Headers: X-API-KEY: ${COPIN_API_KEY}
```

#### API 8: Live Positions (POST) — Real-time
```
POST /position/filter/graphql
Headers: X-API-KEY: ${COPIN_API_KEY}
```

#### API 9: Search After (POST) — Efficient cursor-based pagination for large scans
```
POST /position-statistic/filter/search-after
Headers: X-API-KEY: ${COPIN_API_KEY}
```

#### API 10: PnL Statistic (POST)
```
POST /position-statistic/pnl
Headers: X-API-KEY: ${COPIN_API_KEY}
```

### Step 1: Data Collection

Based on user request, determine collection strategy:

| Request | Strategy |
|---------|----------|
| "Classify wallet 0xABC" | Fetch statistic (D30/D60) + all positions for that account |
| "Find smart traders on Hyperliquid" | Query statistics with smart trader filters |
| "Find insiders" | Query for high win rate + new listing timing + low trade count |
| "Top traders this month" | Fetch leaderboard MONTH |
| "Whale positions right now" | Fetch open interest, filter by size |
| "Algo/MM detection" | Query for high trade count + consistent timing + low duration |

### Step 2: Trader Classification Engine

Classify each trader into one or more **archetypes** using Copin data fields.

#### Archetype 1: 🧠 Smart Trader
High skill, consistent profitability, good risk management.
```
Filters:
  winRate >= 55%
  realisedPnl > 0
  profitLossRatio >= 1.5       (avg win / avg loss)
  realisedMaxDrawdown >= -30%  (not worse than -30%)
  totalTrade >= 20             (sufficient sample)
  avgLeverage <= 20            (not degenerate)
  runTimeDays >= 30            (not a one-week wonder)

Scoring:
  smart_score = (
    winRate_norm * 0.20 +
    profitLossRatio_norm * 0.20 +
    drawdown_norm * 0.20 +       (closer to 0 = better)
    consistency_norm * 0.15 +     (totalWin / totalTrade variance)
    longevity_norm * 0.10 +       (runTimeDays)
    volume_norm * 0.15            (avgVolume — skin in the game)
  ) * 100
```

#### Archetype 2: 🕵️ Insider / Suspicious Trader
Unusual win rate on low-frequency trades, especially around events.
```
Filters:
  winRate >= 80%
  totalTrade <= 20              (few, targeted trades)
  realisedAvgRoi >= 30%         (unusually high ROI)
  avgDuration <= 86400          (< 24h hold — in and out fast)
  totalLiquidation == 0         (never liquidated)
  maxLeverage >= 10             (aggressive sizing)

Additional analysis (requires position-level data):
  - Trade timing vs token listing dates
  - One-shot pattern: fresh account, few trades, high PnL, then inactive
  - Token concentration: trades only 1-2 tokens
```

#### Archetype 3: 🤖 Algo / MM / HFT Trader
Machine-like execution, high frequency, tight risk management.
```
Filters:
  totalTrade >= 200             (high frequency)
  avgDuration <= 3600           (< 1 hour avg hold)
  orderPositionRatio >= 3       (many orders per position — scaling)
  realisedMaxDrawdown >= -15%   (tight risk)
  longRate between 40-60%       (balanced — not directional)

Behavioral signals (from position data):
  - Consistent position sizing (low variance in size)
  - Regular time intervals between trades
  - Orders placed at precise price levels
  - High orderIncreaseCount + orderDecreaseCount (active management)

Sub-classifications:
  HFT:  avgDuration < 300 (5min) AND totalTrade > 500
  MM:   longRate 45-55% AND profitRate > 60% AND low PnL variance
  GRID: Regular spacing in entry prices, both long and short
  ARBI: Cross-token correlated positions opening simultaneously
```

#### Archetype 4: 🎯 Sniper Trader
Few but extremely precise trades with massive ROI.
```
Filters:
  totalTrade <= 30
  maxRoi >= 100%                (at least one 2x trade)
  winRate >= 70%
  avgDuration <= 43200          (< 12 hours)
  realisedPnl > 5000            (meaningful profit)

Behavioral signals:
  - Trades only during high-volatility events
  - Entries coincide with major announcements
  - Extremely precise timing (minutes before big moves)
```

#### Archetype 5: 🎰 Degen Trader
High risk, high leverage, low consistency. Gambler profile.
```
Filters:
  avgLeverage >= 30
  totalLiquidation >= 3         (multiple liquidations)
  realisedMaxDrawdown <= -50%   (massive drawdowns)
  winRate <= 45%

  OR:
  maxLeverage >= 50
  totalTrade >= 50
  pnl < 0                      (net negative despite activity)
```

#### Archetype 6: 📊 Sense Trader (Intuition-Based)
Directional bias, medium frequency, good market read.
```
Filters:
  longRate >= 70% OR longRate <= 30%   (strong directional bias)
  winRate >= 55%
  avgDuration between 3600 and 604800  (1h to 7d hold)
  totalTrade between 20 and 200
  profitLossRatio >= 1.2

Behavioral signals:
  - Clear trend-following or mean-reversion patterns
  - Sizes up during trending markets
  - Uses leverage dynamically (not fixed)
```

#### Archetype 7: 💎 Diamond Hands (Long-Term Holder)
Low frequency, high conviction, large unrealized positions.
```
Filters:
  avgDuration >= 604800         (> 7 days average hold)
  totalTrade <= 30
  maxDuration >= 2592000        (at least one 30-day hold)
  avgLeverage <= 10

Open interest check: large open positions with long duration
```

#### Archetype 8: 🔄 Copy-Worthy Trader
Specifically optimized for copy trading suitability.
```
Composite score using:
  win_rate_score:        winRate normalized, weight 0.15
  pnl_score:             realisedPnl normalized, weight 0.15
  drawdown_score:        abs(realisedMaxDrawdown) inverse, weight 0.15
  consistency_score:     (totalWin/totalTrade) stability, weight 0.15
  frequency_score:       totalTrade normalized (enough trades to copy), weight 0.10
  avg_roi_score:         realisedAvgRoi normalized, weight 0.10
  leverage_safety:       inverse of avgLeverage, weight 0.10
  longevity_score:       runTimeDays normalized, weight 0.10

copy_score = weighted_sum * 100

Thresholds:
  >= 80: "Highly Copy-Worthy" ⭐⭐⭐
  60-79: "Copy-Worthy with Caveats" ⭐⭐
  40-59: "Monitor First" ⭐
  < 40:  "Not Recommended for Copy"
```

### Step 3: Behavioral Fingerprinting

For deep-dive analysis, fetch position-level data and build a **behavioral fingerprint**:

```json
{
  "wallet": "0x...",
  "protocol": "HYPERLIQUID",
  "period": "D30",
  "archetypes": ["smart_trader", "sense_trader"],
  "primary_archetype": "smart_trader",
  "fingerprint": {
    "direction_bias": 0.72,           // longRate: 72% long
    "avg_hold_hours": 18.5,
    "leverage_style": "moderate",     // avg 8x, max 15x
    "sizing_consistency": 0.85,       // low variance in position size
    "timing_pattern": "session_based", // trades during specific hours
    "token_diversity": 8,             // unique tokens traded
    "scaling_behavior": "adds_to_winners", // increases winning positions
    "exit_style": "take_profit",      // mostly TP, rarely SL
    "risk_per_trade_pct": 2.3,        // avg collateral / estimated equity
    "activity_heatmap": {
      "most_active_hours": [14, 15, 16, 21, 22],  // UTC
      "most_active_days": ["Mon", "Tue", "Wed"]
    }
  },
  "scores": {
    "smart_score": 78,
    "insider_score": 12,
    "algo_score": 35,
    "copy_score": 72,
    "risk_score": 65
  }
}
```

### Step 4: Report Generation

Output format depends on request type:

**Single Trader Profile** → `reports/traders/{wallet_short}_{YYMMDD}.md`
**Filtered Trader List** → `reports/traders/filter_{description}_{YYMMDD}.md`
**Classification Scan** → `reports/traders/scan_{archetype}_{YYMMDD}.md`

Report structure:
```markdown
# Trader Profile: 0xABCD...1234
**Protocol**: Hyperliquid | **Period**: 30 Days | **Analyzed**: 2026-03-05

## Classification
**Primary**: 🧠 Smart Trader (score: 78/100)
**Secondary**: 📊 Sense Trader
**Copy-Worthy**: ⭐⭐ (score: 72/100)

## Key Metrics (30D)
| Metric | Value | Percentile |
|--------|-------|-----------|
| PnL | +$45,230 | Top 5% |
| Win Rate | 63% | Top 15% |
| Avg ROI | +18.5% | Top 10% |
| Max Drawdown | -12.3% | Top 20% |
| Total Trades | 47 | — |
| Avg Leverage | 8.2x | — |
| Avg Hold Time | 18.5h | — |

## Behavioral Fingerprint
- **Direction**: Long-biased (72% long positions)
- **Style**: Trend-following with momentum entries
- **Risk**: Moderate — 2.3% per trade, max 15x leverage
- **Scaling**: Adds to winning positions (DCA up)
- **Exit**: Primarily take-profit, rarely stopped out
- **Timing**: Most active 14:00-16:00 and 21:00-22:00 UTC

## Top Positions (by PnL)
| Token | Side | Entry | Exit | PnL | ROI | Duration |
|-------|------|-------|------|-----|-----|----------|
| BTC | Long | $64,200 | $67,800 | +$12,400 | +45% | 2d 4h |
| ETH | Long | $3,100 | $3,340 | +$8,200 | +32% | 1d 8h |

## Risk Assessment
🟢 Low liquidation risk (0 liquidations in period)
🟡 Moderate leverage (avg 8.2x, peak 15x)
🟢 Good profit/loss ratio (1.8x)
🟡 Directional bias may underperform in ranging markets

## Copy Trading Recommendation
**Score**: 72/100 — Copy-Worthy with Caveats
**Recommendation**: Suitable for copy with reduced size (50-70% mirror).
Monitor for directional bias during ranging markets.
Max suggested mirror leverage: 5x (vs trader's avg 8.2x).
```

## Examples

### Example 1: Find Smart Traders on Hyperliquid

**Input:**
```
Find top smart traders on Hyperliquid in the last 30 days
```

**API Call:**
```json
POST https://api.copin.io/public/HYPERLIQUID/position/statistic/filter
Headers: X-API-KEY: ${COPIN_API_KEY}

{
  "pagination": {"limit": 50, "offset": 0},
  "queries": [{"fieldName": "type", "value": "D30"}],
  "ranges": [
    {"fieldName": "winRate", "gte": 55},
    {"fieldName": "realisedPnl", "gte": 5000},
    {"fieldName": "profitLossRatio", "gte": 1.5},
    {"fieldName": "realisedMaxDrawdown", "gte": -30},
    {"fieldName": "totalTrade", "gte": 20},
    {"fieldName": "avgLeverage", "lte": 20}
  ],
  "sortBy": "realisedPnl",
  "sortType": "desc"
}
```

**Expected Output:**
```
## Smart Traders — Hyperliquid 30D | 2026-03-05

Found 23 traders matching smart trader criteria.

| # | Wallet | PnL | Win Rate | Avg ROI | DD | Trades | Smart Score |
|---|--------|-----|----------|---------|-----|--------|------------|
| 1 | 0xa1b2...c3d4 | +$182k | 68% | +24% | -8% | 45 | 91 |
| 2 | 0xe5f6...7890 | +$95k | 62% | +19% | -14% | 67 | 84 |
| 3 | 0x1234...5678 | +$67k | 71% | +31% | -11% | 28 | 82 |
...
```

### Example 2: Detect Potential Insiders

**Input:**
```
Find suspicious insider-like traders on Hyperliquid — high win rate, few trades, fast exits
```

**API Call:**
```json
POST https://api.copin.io/public/HYPERLIQUID/position/statistic/filter
Headers: X-API-KEY: ${COPIN_API_KEY}

{
  "pagination": {"limit": 50, "offset": 0},
  "queries": [{"fieldName": "type", "value": "D30"}],
  "ranges": [
    {"fieldName": "winRate", "gte": 80},
    {"fieldName": "totalTrade", "lte": 20},
    {"fieldName": "realisedAvgRoi", "gte": 30},
    {"fieldName": "totalLiquidation", "lte": 0},
    {"fieldName": "avgDuration", "lte": 86400}
  ],
  "sortBy": "realisedAvgRoi",
  "sortType": "desc"
}
```

**Then for each result:** Fetch positions via API 2 to check:
- Token concentration (trades only 1-2 tokens?)
- Timing vs known events (listings, airdrops)
- Account age and activity pattern

### Example 3: Detect Algo/MM/HFT

**Input:**
```
Find likely algorithmic traders or market makers on Hyperliquid
```

**API Call:**
```json
POST https://api.copin.io/public/HYPERLIQUID/position/statistic/filter
Headers: X-API-KEY: ${COPIN_API_KEY}

{
  "pagination": {"limit": 50, "offset": 0},
  "queries": [{"fieldName": "type", "value": "D30"}],
  "ranges": [
    {"fieldName": "totalTrade", "gte": 200},
    {"fieldName": "avgDuration", "lte": 3600},
    {"fieldName": "orderPositionRatio", "gte": 3},
    {"fieldName": "longRate", "gte": 40, "lte": 60}
  ],
  "sortBy": "totalTrade",
  "sortType": "desc"
}
```

### Example 4: Deep Profile a Specific Wallet

**Input:**
```
Profile trader 0xABCD1234 on Hyperliquid — full classification
```

**Workflow:**
1. Fetch D30 statistics for this account
2. Fetch all closed positions (last 100)
3. For top 5 positions, fetch detailed orders
4. Run classification engine (all 8 archetypes)
5. Build behavioral fingerprint
6. Generate full profile report

## Constraints

- **API key required**: ALL Copin API calls MUST include `X-API-KEY: ${COPIN_API_KEY}` header. Load from `process.env.COPIN_API_KEY` or `${COPIN_API_KEY}` in bash. NEVER hardcode the key.
- **Rate limit strict**: 30 req/min. Use 2000ms delay between requests. Queue, don't parallelize.
- **Protocol string**: For Hyperliquid, always use `HYPERLIQUID` exactly. Case-sensitive.
- **Time periods**: `D7` (7 days), `D15` (15 days), `D30` (30 days), `D60` (60 days) for statistics.
- **Minimum sample**: Never classify a trader with < 5 trades. Insufficient data = "Unclassifiable".
- **Multi-archetype**: Traders can match multiple archetypes. Always report primary + secondary.
- **Insider detection**: This is probabilistic. Always label findings as "suspicious pattern" not "confirmed insider".
- **Copy score caveats**: Past performance ≠ future results. Always include risk disclaimer.
- **File output**: Write to `data/analysis/traders/` and `reports/traders/`. Never modify `apps/` or `src/`.
- **Privacy**: Truncate wallet addresses in reports (0x1234...5678).
- **Cross-reference**: When used alongside `insider-detector` skill, merge Copin data with Hyperliquid direct API data for richer analysis.
- **MM/HFT whitelist**: Wallets classified as algo/MM/HFT should be excluded from insider detection to reduce false positives. Export whitelist to `data/analysis/traders/mm_hft_whitelist.json`.
- **Copin web links**: Include `https://app.copin.io/trader/{address}/hyperliquid` links in reports for easy reference.
- **Live Trade endpoints**: Use Live Order/Position GraphQL endpoints for real-time monitoring use cases. These show orders/positions happening NOW.
- **Search After pagination**: For scanning >1000 traders, use `/position-statistic/filter/search-after` instead of offset-based pagination for better performance.
- **Error handling**: On non-200 responses, log status code and response body. Common errors: 401 (bad API key), 429 (rate limit), 500 (server error).
