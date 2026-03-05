# Trader Archetype Classification Rules

## Overview

8 archetypes, each defined by Copin API filter criteria + behavioral signals.
A trader can match multiple archetypes. Report primary (highest score) + secondary.

## Decision Tree

```
                    ┌── totalTrade ≥ 200?
                    │   YES → avgDuration ≤ 3600?
                    │          YES → longRate 40-60%?
                    │                 YES → 🤖 Algo/MM/HFT
                    │                 NO  → 🤖 Algo (directional)
                    │          NO  → continue
Trader ─────────────┤
                    │── totalTrade ≤ 20?
                    │   YES → winRate ≥ 80%?
                    │          YES → avgROI ≥ 30%?
                    │                 YES → 🕵️ Insider suspect
                    │                 NO  → 🎯 Sniper
                    │          NO  → maxROI ≥ 100%?
                    │                 YES → 🎯 Sniper
                    │                 NO  → unclassified
                    │
                    │── avgLeverage ≥ 30?
                    │   YES → 🎰 Degen
                    │
                    │── avgDuration ≥ 604800? (7 days)
                    │   YES → 💎 Diamond Hands
                    │
                    │── longRate ≥ 70% OR ≤ 30%?
                    │   YES → winRate ≥ 55%?
                    │          YES → 📊 Sense Trader
                    │
                    └── winRate ≥ 55% AND profitLossRatio ≥ 1.5?
                        YES → 🧠 Smart Trader
```

## Scoring Normalization

All scores are normalized to 0-100 using:
```
normalized = min(100, max(0, (value - min_threshold) / (max_threshold - min_threshold) * 100))
```

### Smart Trader Score Thresholds

| Factor | Min (0) | Max (100) | Weight |
|--------|---------|-----------|--------|
| winRate | 50% | 80% | 0.20 |
| profitLossRatio | 1.0 | 3.0 | 0.20 |
| maxDrawdown | -50% | 0% | 0.20 |
| consistency | 0.3 | 0.9 | 0.15 |
| runTimeDays | 7 | 365 | 0.10 |
| avgVolume | $1k | $100k | 0.15 |

### Copy-Worthiness Score Thresholds

| Factor | Min (0) | Max (100) | Weight |
|--------|---------|-----------|--------|
| winRate | 40% | 75% | 0.15 |
| realisedPnl | $0 | $100k | 0.15 |
| maxDrawdown | -60% | 0% | 0.15 |
| consistency | 0.3 | 0.9 | 0.15 |
| totalTrade | 5 | 100 | 0.10 |
| realisedAvgRoi | 0% | 50% | 0.10 |
| avgLeverage (inv) | 50x | 1x | 0.10 |
| runTimeDays | 7 | 180 | 0.10 |

### Insider Suspicion Score

Not API-filterable alone. Requires position-level analysis:

| Factor | Weight | Method |
|--------|--------|--------|
| Win rate anomaly | 0.25 | WR > 80% on < 20 trades |
| Timing precision | 0.25 | Trades cluster near events |
| One-shot pattern | 0.20 | Fresh wallet → few trades → withdraw |
| Token concentration | 0.15 | Only trades 1-2 tokens |
| Duration anomaly | 0.15 | Avg hold < 24h despite high ROI |

## MM/HFT Sub-Classification

When a trader matches 🤖 Algo, further classify:

| Sub-type | Distinguishing Signal |
|----------|----------------------|
| **HFT** | avgDuration < 300s (5min), totalTrade > 500 |
| **Market Maker** | longRate 45-55%, profitRate > 60%, very low PnL per trade but high volume |
| **Grid Bot** | Regular entry price spacing, both long and short on same token |
| **Arbitrageur** | Multiple tokens opened within seconds of each other, opposite directions |
| **DCA Bot** | Regular time intervals between INCREASE orders on same position |

## Integration with insider-detector Skill

Wallets classified as 🤖 Algo/MM/HFT → export to `data/analysis/traders/mm_hft_whitelist.json`:

```json
{
  "generated_at": "2026-03-05T12:00:00Z",
  "protocol": "HYPERLIQUID",
  "wallets": [
    {
      "address": "0xABC...",
      "classification": "market_maker",
      "confidence": 0.92,
      "total_trades_30d": 847,
      "avg_duration_seconds": 180
    }
  ]
}
```

insider-detector should load this whitelist and SKIP these wallets during scanning
to reduce false positives.
