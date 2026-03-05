---
name: perp-analytics
description: >
  Use this skill for real-time and historical analytics on Hyperliquid perp DEX.
  Triggers: dashboard, market analysis, volume report, liquidation tracker, funding rates,
  open interest, whale alert, market event, flash crash analysis, exchange comparison,
  token metrics, performance report, trading system health, latency check, order flow.
version: 1.0.0
author: quant-trading-team
architecture: Context-Aware
complexity: 13
platforms: [claude-code, cursor, windsurf]
tags: [analytics, dashboard, market-data, trading-ops, hyperliquid, perp-dex]
---

# Perp Analytics

## Goal

Provide real-time and historical analytics for Hyperliquid perp DEX trading operations.
Generate dashboards, market reports, system health checks, and event analyses
that support trader decision-making — matching the Trading Analyst role at firms like Wintermute.

## Instructions

### Analysis Type Detection

Parse user request and route to the appropriate analysis module:

| Request Pattern | Module | Priority |
|----------------|--------|----------|
| "market overview", "what's happening" | Market Snapshot | Immediate |
| "funding rates", "funding arb" | Funding Analytics | Immediate |
| "liquidations", "rekt" | Liquidation Tracker | Immediate |
| "whale", "large trades" | Whale Alert | Immediate |
| "flash crash", "dump", "spike" | Event Analyzer | Immediate |
| "volume", "OI", "open interest" | Volume & OI Report | Standard |
| "compare exchanges", "vs Binance" | Cross-Exchange Comparison | Standard |
| "system health", "latency" | System Monitor | Standard |
| "token report", "token metrics" | Token Deep-Dive | Standard |
| "build dashboard", "create report" | Dashboard Builder | Extended |

### Module 1: Market Snapshot

Quick overview of Hyperliquid market state:

```
Fetch:
  metaAndAssetCtxs → all tokens with current funding, volume, OI

Generate:
  Top 10 by 24h volume (with % change)
  Top 5 funding rate (positive = shorts pay longs)
  Top 5 funding rate (negative = longs pay shorts)
  Total platform 24h volume
  Notable: any token with >50% volume change vs yesterday
```

### Module 2: Funding Analytics

```
For requested tokens:
  Fetch current funding rates from metaAndAssetCtxs
  Calculate annualized rate: funding_8h * 3 * 365 * 100

Report:
  Current rates (8h, daily, annualized)
  Historical rates if data available (chart)
  Funding arb opportunities: tokens where |annualized| > 20%
  Cost analysis: holding period vs funding collected
```

### Module 3: Liquidation Tracker

```
Monitor large position changes as proxy for liquidations:
  Fetch recent fills with large market orders
  Flag: market order > $50k AND price moved > 2% in 5min

Report:
  Recent large liquidation events
  Tokens with highest liquidation activity
  Cascading liquidation risk: tokens with high OI + high leverage
```

### Module 4: Whale Alert

```
Scan recent trades for whale activity:
  Threshold: single fill > $100k USD

Report per whale trade:
  Wallet (truncated), token, side, size, price, timestamp
  Position context: new position or adding to existing?
  Market impact: price before/after within 60s
```

### Module 5: Event Analyzer

For market events (flash crash, pump, exchange outage):

```
1. Define event window from user description
2. Fetch all fills in window for affected token(s)
3. Build 1-second price bars during the event
4. Calculate:
   - Price range (high/low/% drop)
   - Volume spike (vs 1h prior average)
   - Largest individual trades during event
   - Recovery time (time to regain 50% of drop)
5. Timeline: second-by-second narrative
```

### Module 6: Token Deep-Dive

Comprehensive single-token analysis:

```
For token X:
  Market data: price, 24h change, 7d change, ATH, ATL
  Volume: 24h, 7d avg, 30d avg, volume trend
  Open Interest: current, OI/volume ratio, OI change
  Funding: current rate, 7d avg rate, funding trend
  Liquidity: spread, depth at ±1%, ±2% from mid
  Top holders: wallets with largest open positions
  Correlation: vs BTC, vs ETH (if data available)
```

### Module 7: Dashboard Builder

Generate Python Dash/Streamlit code for custom dashboards:

```python
# Template: trading-dashboard.py
# Real-time P&L tracker
# Position monitor
# Market data feed
# Funding rate heatmap
# Volume/OI charts

# Use Streamlit for rapid prototyping:
# streamlit run scripts/dashboard_{name}.py
```

### Module 8: System Monitor

Check health of running trading systems:

```
For each app (hyperliquid-bot, hyper-rau, insider-scanner):
  Check if process is running (port check)
  Parse recent logs for errors
  Measure API response latency (time a simple request)
  Check WebSocket connection status (if applicable)
  Report: uptime, error rate, avg latency, last error
```

## Examples

### Example 1: Market Event Analysis

**Input:**
```
BTC just dropped 8% in 10 minutes. Analyze what happened on Hyperliquid.
```

**Expected Output:**
```markdown
## Flash Crash Analysis: BTC -8% | 2026-03-05 14:20–14:30 UTC+7

### Timeline
| Time | Price | Event |
|------|-------|-------|
| 14:20:00 | $67,200 | Normal trading, spread 0.01% |
| 14:20:15 | $66,800 | Large market sell: $2.3M (0xab12...cd34) |
| 14:20:22 | $65,100 | Cascade: 12 liquidations totaling $8.7M |
| 14:21:05 | $62,400 | Low: -8.1% from pre-event |
| 14:23:00 | $63,800 | Partial recovery begins |
| 14:30:00 | $64,900 | Stabilized at -3.4% |

### Impact Metrics
| Metric | Value |
|--------|-------|
| Max drawdown | -8.1% ($67,200 → $61,750) |
| Total volume in window | $47.2M (vs $3.1M avg/10min) |
| Estimated liquidations | $8.7M across 12 wallets |
| Largest single trade | $2.3M market sell (trigger) |
| Recovery to -4% | 3min 45sec |
| Spread during event | Peaked at 0.15% (15x normal) |

### Key Wallets
- **Trigger**: 0xab12...cd34 — $2.3M market sell at 14:20:15
- **Largest liq**: 0x7890...abcd — $1.8M long liquidated at $63,100
- **Buyer at bottom**: 0xef01...2345 — $500k long at $62,400
```

### Example 2: Funding Rate Report

**Input:**
```
Which tokens have the highest funding rates right now?
```

**Expected Output:**
```markdown
## Hyperliquid Funding Rates — 2026-03-05 15:00 UTC+7

### Top Positive Funding (shorts pay longs)
| Token | 8h Rate | Daily | Annualized | OI |
|-------|---------|-------|------------|-----|
| DOGE | +0.035% | +0.105% | +38.3% | $12.4M |
| WIF | +0.028% | +0.084% | +30.7% | $5.1M |
| PEPE | +0.022% | +0.066% | +24.1% | $8.7M |

### Top Negative Funding (longs pay shorts)
| Token | 8h Rate | Daily | Annualized | OI |
|-------|---------|-------|------------|-----|
| BTC | -0.008% | -0.024% | -8.8% | $245M |

### Arb Opportunities (|annualized| > 20%)
DOGE and WIF show elevated positive funding. Short perp + spot long
could yield 25-35% annualized. Risk: funding can reverse rapidly.
```

## Constraints

- **Read-only**: This skill NEVER places orders or modifies trading systems.
- **Real-time awareness**: For "right now" queries, always fetch fresh data. Don't rely on cache.
- **System monitor**: Only check systems via port/log checks. Never restart services.
- **Dashboard code**: Save generated dashboards to `scripts/dashboard_*.py`. Include `requirements.txt`.
- **File output**: Reports to `reports/analytics/`. Dashboard scripts to `scripts/`.
- **Exchange comparison**: Only compare data we can actually fetch. Don't fabricate competitor data.
- **Whale threshold**: $100k for whale alerts. Adjustable if user specifies different threshold.
- **Performance**: For market events, build second-by-second timeline. For reports, minute-level is sufficient.
- **Existing apps**: Reference `apps/data-analytics/` and `apps/insider-scanner/` for available data.
