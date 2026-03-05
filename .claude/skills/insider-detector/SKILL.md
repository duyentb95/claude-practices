---
name: insider-detector
description: >
  Use this skill PROACTIVELY when analyzing Hyperliquid perp DEX trades for insider trading patterns.
  Triggers: insider, suspicious wallet, pre-listing, front-running, wash trading, ghost wallet,
  one-shot wallet, coordinated trading, abnormal volume, fresh deposit attack, whale tracking,
  Hyperliquid investigation, on-chain forensics.
version: 1.0.0
author: quant-trading-team
architecture: Pipeline
complexity: 16
platforms: [claude-code, cursor, windsurf]
tags: [insider-trading, hyperliquid, perp-dex, on-chain-forensics, pattern-detection]
---

# Insider Detector

## Goal

Detect insider trading patterns on Hyperliquid perpetual DEX by analyzing wallet behavior,
trade timing relative to announcements/listings, volume anomalies, and coordinated wallet clusters.
Output ranked suspicious wallets with evidence chains and confidence scores (0–100).

## Instructions

### Phase 1: Data Acquisition

1. Identify the **investigation scope** from user request:
   - Token-based: "scan token HYPE" → fetch all fills for that token
   - Wallet-based: "investigate 0xABC" → fetch all activity for that wallet
   - Event-based: "scan around HYPE listing" → fetch 48h window around event
   - Daily scan: "daily report" → fetch new listings + top volume wallets

2. Fetch data from Hyperliquid API (`POST https://api.hyperliquid.xyz/info`):
   ```
   Token metadata:    {"type": "metaAndAssetCtxs"}
   Wallet fills:      {"type": "userFills", "user": "0x..."}
   Positions:         {"type": "clearinghouseState", "user": "0x..."}
   Open orders:       {"type": "openOrders", "user": "0x..."}
   Funding history:   {"type": "userFunding", "user": "0x...", "startTime": ms, "endTime": ms}
   ```

3. Rate limiting: 50ms delay between requests. Exponential backoff on 429.
   Cache responses in `data/cache/` with 1-hour TTL.

4. Save raw data to `data/raw/{scope_type}/{identifier}/` with metadata wrapper:
   ```json
   {"fetched_at": "ISO8601", "source": "hyperliquid_api", "query": {...}, "record_count": N, "data": [...]}
   ```

### Phase 2: Pattern Detection

Run these 6 detectors in parallel. Each outputs a factor score (0–100):

**Detector 1: Pre-Event Accumulation (weight 0.30)**
- Find large positions opened 1–48h before known events (listings, airdrops, parameter changes)
- Score = min(100, position_size_usd / 1000) × timing_bonus
- Timing bonus: <4h = ×1.5, <12h = ×1.2, <48h = ×1.0
- Threshold: position > $10,000 USD

**Detector 2: Volume Anomaly (weight 0.20)**
- Compare pre-event 24h volume vs 7-day daily average
- Score = min(100, (volume_ratio - 1) × 33)
- No prior activity + volume > $5k → score = 90 (fresh wallet signal)

**Detector 3: Win Rate on New Listings (weight 0.15)**
- Calculate PnL per trade on tokens listed within 30 days
- Score = min(100, max(0, (win_rate - 0.5) × 200))
- Minimum 3 trades required, else score = 0

**Detector 4: Timing Precision (weight 0.15)**
- Measure time between order placement and 5% price move in trade direction
- <5min = 100, <30min = 70, <2h = 40, else = 0
- Average across all profitable trades

**Detector 5: Wallet Clustering (weight 0.10)**
- Group wallets by: timing correlation (<60s), size mirroring (±5%), directional alignment
- Cluster confidence = timing×0.35 + size×0.25 + direction×0.25 + behavior×0.15
- Score = cluster_confidence × 100. Bonus +20 if cluster > 3 wallets

**Detector 6: One-Shot Behavior (weight 0.10)**
- Fresh wallet (<7 days) + few trades (<5) + single large trade (>$10k) = score 90
- Few trades (<10) + few tokens (<3) = score 50
- Else = 0

### Phase 3: Scoring & Ranking

1. Composite score = Σ(factor_score × weight) for each wallet
2. Classify verdict:
   - ≥80: `high_confidence_insider` 🔴
   - 60–79: `likely_insider` 🟡
   - 40–59: `suspicious` 🟢
   - <40: `low_risk` (omit from report)
3. Build evidence chain for each flagged wallet: chronological list of events with timestamps, amounts, and context

### Phase 4: Report Generation

Output structured JSON to `data/analysis/scores/{scope}.json` AND
Markdown report to `reports/{type}/{scope}_{YYMMDD}.md`.

Report must include:
- Executive summary (2-3 sentences)
- Ranked findings with evidence tables
- Wallet clusters visualization (text-based)
- Statistical summary table
- Methodology section
- Raw data references

## Examples

### Example 1: Token Investigation

**Input:**
```
/scan-token PURR
```

**Expected Behavior:**
1. Fetch metaAndAssetCtxs → find PURR listing date
2. Fetch all userFills for PURR in 14-day window around listing
3. Identify top 30 wallets by volume
4. For each: fetch full history, run 6 detectors
5. Cluster analysis on top wallets
6. Score and rank
7. Generate report

**Expected Output (summary):**
```
## Token Investigation: PURR — 2026-03-05

Scanned 847 wallets trading PURR around listing (2026-02-20).
Flagged 4 wallets:
  🔴 0x1a2b...3c4d — Score 91 — $180k pre-listing long, 3h before announcement
  🔴 0x5e6f...7a8b — Score 84 — Cluster with above, correlated timing
  🟡 0x9c0d...1e2f — Score 67 — 5/6 win rate on new listings, one-shot pattern
  🟡 0x3a4b...5c6d — Score 62 — Volume 4.8x above 7-day average pre-event
Total suspicious volume: $423,000
Estimated insider PnL: $67,200
```

### Example 2: Wallet Deep-Dive

**Input:**
```
/investigate 0x1234567890abcdef1234567890abcdef12345678
```

**Expected Behavior:**
1. Fetch full wallet history: fills, positions, funding, orders
2. Find all tokens traded → identify new listings traded
3. Compute win rate, timing precision, volume patterns
4. Find related wallets (cluster analysis)
5. For each related wallet, repeat data fetch + scoring
6. Generate investigation report with evidence chain

**Expected Output (evidence chain):**
```
Evidence Chain — 0x1234...5678 (Score: 87)

2026-03-01 11:15 UTC+7 — Received $100,000 USDC deposit (first activity on this wallet)
2026-03-01 11:22 UTC+7 — Opened $85,000 HYPE long at $12.40 (25x leverage)
2026-03-01 14:00 UTC+7 — Hyperliquid announces HYPE listing on Twitter
2026-03-01 14:05 UTC+7 — HYPE price moves to $15.80 (+27.4%)
2026-03-01 14:10 UTC+7 — Closed position — realized PnL: +$23,100
2026-03-01 14:30 UTC+7 — Full withdrawal to 0x5e6f...7a8b (same cluster C001)
2026-03-01 15:00 UTC+7 — 0x5e6f...7a8b withdraws to Binance deposit address
```

### Example 3: Daily Scan

**Input:**
```
/daily-report
```

**Expected Output:**
```
## Daily Insider Scan — 2026-03-05

Tokens scanned: 142
New listings (48h): PURR, MOG, WIF
Wallets flagged: 7 (2 high, 3 likely, 2 suspicious)

🔴 HIGH PRIORITY:
  0x1a2b...3c4d — Score 91 — PURR pre-listing accumulation
  0x5e6f...7a8b — Score 84 — Cluster member, correlated with above

Full report: reports/daily/260305.md
```

## Constraints

- **Rate limit**: Max 1200 req/min to Hyperliquid API. Always implement 50ms delay.
- **File ownership**: This skill writes to `data/raw/`, `data/analysis/scores/`, `reports/`. NEVER modify `apps/` or `src/`.
- **Privacy**: Truncate wallet addresses in reports (0x1234...5678). Full addresses only in raw data.
- **Evidence standard**: Every finding MUST have timestamped evidence chain. No claims without data.
- **Statistical rigor**: Win rate requires minimum 3 trades. Volume anomaly requires 7-day baseline.
- **No false positives**: Score ≥60 = flagged. Report methodology and thresholds transparently.
- **Timestamps**: UTC epoch ms in data files. Display as `YYYY-MM-DD HH:mm UTC+7` in reports.
- **Amounts**: USD format `$1,234.56`. Token amounts preserve original decimals.
- **Existing scanner**: Reference `apps/insider-scanner/src/scanner/detector/` for consistency with live system.
- **Cache**: Check `data/cache/` before fetching. TTL = 1 hour.
