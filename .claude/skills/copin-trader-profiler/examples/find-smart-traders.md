# Example: Find and Profile Smart Traders on Hyperliquid

## Input
```
Find top smart traders on Hyperliquid in the last 30 days, then deep-profile the top 3
```

## Step 1: API Call — Filter Smart Traders

```bash
curl -s -X POST https://api.copin.io/public/HYPERLIQUID/position/statistic/filter \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: ${COPIN_API_KEY}" \
  -d '{
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
  }'
```

## Step 2: For Top 3, Fetch Positions

```bash
curl -s -X POST https://api.copin.io/HYPERLIQUID/position/filter \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: ${COPIN_API_KEY}" \
  -d '{
    "pagination": {"limit": 50, "offset": 0},
    "queries": [
      {"fieldName": "account", "value": "0xTOP_TRADER_ADDRESS"},
      {"fieldName": "status", "value": "CLOSE"}
    ],
    "sortBy": "closeBlockTime",
    "sortType": "desc"
  }'
```

## Step 3: Classification Output

```json
{
  "wallet": "0xa1b2...c3d4",
  "protocol": "HYPERLIQUID",
  "period": "D30",
  "archetypes": ["smart_trader", "sense_trader"],
  "primary_archetype": "smart_trader",
  "scores": {
    "smart_score": 87,
    "insider_score": 8,
    "algo_score": 22,
    "sniper_score": 15,
    "degen_score": 3,
    "sense_score": 61,
    "diamond_score": 5,
    "copy_score": 79
  },
  "fingerprint": {
    "direction_bias": 0.68,
    "avg_hold_hours": 22.3,
    "leverage_style": "moderate",
    "sizing_consistency": 0.82,
    "token_diversity": 12,
    "scaling_behavior": "adds_to_winners",
    "exit_style": "take_profit_dominant"
  },
  "raw_stats": {
    "realisedPnl": 182340,
    "winRate": 68,
    "realisedAvgRoi": 24.1,
    "realisedMaxDrawdown": -8.2,
    "totalTrade": 45,
    "avgLeverage": 8.7,
    "avgDuration": 80280,
    "profitLossRatio": 2.1,
    "longRate": 68,
    "totalLiquidation": 0
  }
}
```

## Step 4: Report Output

```markdown
# Smart Traders — Hyperliquid 30D | 2026-03-05

Found 23 traders matching smart trader criteria.
Deep-profiled top 3 by realized PnL.

## #1: 0xa1b2...c3d4 — Smart Score 87/100

| Metric | Value | Assessment |
|--------|-------|-----------|
| Realized PnL | +$182,340 | Excellent |
| Win Rate | 68% | Above average |
| Avg ROI | +24.1% | Strong |
| Max Drawdown | -8.2% | Very controlled |
| Total Trades | 45 | Good sample |
| Avg Leverage | 8.7x | Moderate |
| Avg Hold | 22.3 hours | Swing trader |
| P/L Ratio | 2.1x | Good risk/reward |
| Liquidations | 0 | Clean record |

**Classification**: 🧠 Smart Trader (primary) | 📊 Sense Trader (secondary)
**Copy Score**: 79/100 — ⭐⭐ Copy-Worthy with Caveats

**Behavioral Notes**:
- Long-biased (68%) — trend follower
- Scales into winning positions
- Exits primarily via take-profit
- Most active during Asian + European session overlap
- Trades 12 different tokens — well diversified

**Copin Profile**: https://app.copin.io/trader/0xa1b2c3d4.../hyperliquid
```
