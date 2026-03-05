# Example: Token Investigation Output

## Input
```
/scan-token PURR
```

## Raw Score Output (data/analysis/scores/PURR.json)

```json
{
  "analyzed_at": "2026-03-05T12:00:00.000Z",
  "methodology": "composite_scoring_v1",
  "event_reference": "PURR listing 2026-02-20T14:00:00Z",
  "scan_window": "2026-02-13 to 2026-03-05",
  "total_wallets_scanned": 847,
  "total_wallets_scored": 45,
  "flagged_wallets": 4,
  "results": [
    {
      "rank": 1,
      "wallet": "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
      "wallet_display": "0x1a2b...9a0b",
      "score": 91,
      "verdict": "high_confidence_insider",
      "factors": {
        "pre_event_accumulation": {
          "score": 95,
          "weight": 0.30,
          "weighted": 28.5,
          "detail": "Opened $180k PURR long 3h before listing announcement"
        },
        "volume_anomaly": {
          "score": 100,
          "weight": 0.20,
          "weighted": 20.0,
          "detail": "No prior activity — fresh wallet with $180k first trade"
        },
        "win_rate_new_listings": {
          "score": 80,
          "weight": 0.15,
          "weighted": 12.0,
          "detail": "4/5 wins on tokens listed within 30 days (80%)"
        },
        "timing_precision": {
          "score": 90,
          "weight": 0.15,
          "weighted": 13.5,
          "detail": "Average 8min before 5% price move"
        },
        "cluster_coordination": {
          "score": 85,
          "weight": 0.10,
          "weighted": 8.5,
          "detail": "In cluster C001 (3 wallets, confidence 0.87)"
        },
        "one_shot_behavior": {
          "score": 90,
          "weight": 0.10,
          "weighted": 9.0,
          "detail": "3 total trades, account age 2 days, max trade $180k"
        }
      },
      "evidence_chain": [
        "2026-02-20 08:15 UTC+7 — Wallet created, received $200,000 USDC from 0x5e6f...7a8b",
        "2026-02-20 08:22 UTC+7 — Opened $180,000 PURR long at $0.0042 (50x leverage)",
        "2026-02-20 11:00 UTC+7 — Hyperliquid announces PURR listing on Twitter",
        "2026-02-20 11:03 UTC+7 — PURR price jumps to $0.0067 (+59.5%)",
        "2026-02-20 11:15 UTC+7 — Closed position, realized PnL: +$47,200",
        "2026-02-20 11:30 UTC+7 — Full withdrawal to 0x9c0d...1e2f"
      ],
      "related_cluster": "C001",
      "total_suspicious_volume_usd": 180000,
      "estimated_pnl_usd": 47200
    }
  ]
}
```

## Markdown Report Output (reports/investigations/PURR_260305.md)

```markdown
# Investigation Report: PURR Token
**Date**: 2026-03-05 19:00 UTC+7
**Analyst**: Claude Code Agent Team
**Confidence**: High

## Executive Summary

Analysis of 847 wallets trading PURR around its listing date (2026-02-20) flagged
4 suspicious wallets. The top wallet (score 91) received $200k USDC minutes before
opening a $180k leveraged long position, 3 hours before the listing announcement.
Estimated total insider PnL: $67,200.

## Key Findings

### 🔴 Finding 1: 0x1a2b...9a0b — Score 91/100

| Factor | Score | Detail |
|--------|-------|--------|
| Pre-event accumulation | 95 | $180k long, 3h before announcement |
| Volume anomaly | 100 | Fresh wallet, no prior activity |
| Win rate (new listings) | 80 | 4/5 wins (80%) |
| Timing precision | 90 | Avg 8min before 5% move |
| Cluster coordination | 85 | In C001 (3 wallets, 87% confidence) |
| One-shot behavior | 90 | 3 trades total, 2-day-old wallet |

**Evidence Timeline:**
| Time (UTC+7) | Event |
|---|---|
| 2026-02-20 08:15 | Wallet received $200,000 USDC |
| 2026-02-20 08:22 | Opened $180,000 PURR long at $0.0042 |
| 2026-02-20 11:00 | PURR listing announced |
| 2026-02-20 11:15 | Closed position, +$47,200 PnL |
| 2026-02-20 11:30 | Full withdrawal to cluster member |
```
