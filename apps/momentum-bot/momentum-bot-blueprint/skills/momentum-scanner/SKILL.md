---
name: momentum-scanner
description: >
  Use this skill to scan Hyperliquid coins for momentum trading opportunities.
  Triggers: scan for momentum, find trending coins, top movers, best momentum setup,
  which coin to trade, momentum candidates, breakout scanner.
version: 1.0.0
author: momentum-bot-team
architecture: Pipeline
complexity: 13
platforms: [claude-code, cursor]
tags: [scanner, momentum, coin-selection, breakout, hyperliquid]
---

# Momentum Scanner

## Goal

Scan all Hyperliquid perp coins every 5 minutes. Rank by momentum suitability.
Output a shortlist of coins with regime scores and pending swing level breakouts.

## Instructions

### Step 1: Fetch Universe

```
POST https://api.hyperliquid.xyz/info
Body: {"type": "metaAndAssetCtxs"}
```
Returns all coins with metadata. Filter by: active, has volume.

### Step 2: Rank by Movement

For each coin, calculate:
- 1h price change %
- 4h price change %
- 1-minute volume (most recent)
- 24h total volume

Rank:
- **Top 5 by positive 1h change** → Long candidates
- **Top 5 by negative 1h change** → Short candidates
- Filter out coins with < $100k/min volume or < $5M 24h volume

### Step 3: Regime Check Each Candidate

For each candidate, run the `regime-detector` skill:
- Fetch 120 1m candles
- Score V1 (staircase), V2 (volume), V3 (volatility)
- Classify regime

### Step 4: Find Pending Breakout Levels

For candidates with regime ≥ 2/3:
- Find swing highs (for long candidates)
- Find swing lows (for short candidates)
- Calculate distance from current price to level
- Coins where price is within 0.5% of a swing level = **IMMINENT BREAKOUT**

### Step 5: Output Ranked Watchlist

```json
{
  "scan_time": "2026-03-05T14:30:00Z",
  "long_candidates": [
    {
      "coin": "VIRTUAL",
      "1h_change_pct": 8.3,
      "volume_1min_usd": 450000,
      "regime": "STRONG_MOMENTUM",
      "regime_score": 3,
      "staircase_direction": "up",
      "nearest_swing_high": 3.245,
      "current_price": 3.228,
      "distance_to_level_pct": 0.53,
      "status": "IMMINENT_BREAKOUT"
    }
  ],
  "short_candidates": [...],
  "skipped": ["BTC (too efficient)", "NEWTOKEN (< 7 days)", ...]
}
```

## Constraints

- **Scan interval**: Every 5 minutes (configurable). Don't spam API.
- **Staircase required**: Even if a coin is top gainer, if no staircase → skip.
- **Volume minimum**: $100k per 1-minute candle. Below = illiquid, skip.
- **Exclude**: BTC, ETH (too efficient for retail momentum). Newly listed < 7 days.
- **Max candidates**: Return top 3 long + top 3 short (after regime filter).
