---
name: daily-report
description: Run daily scan for insider activity across all Hyperliquid tokens and generate summary report
---

Run daily insider trading scan on Hyperliquid.

## Steps

Create an **Agent Team** named `hl-daily-{YYMMDD}`:

### Teammate 1: data-fetcher (sonnet)
```
1. Fetch metaAndAssetCtxs — compare with cached version to detect new listings/delistings
2. For any new tokens listed in past 48h, fetch all userFills
3. Fetch top volume wallets across all tokens in past 24h
4. Save to data/raw/daily/{YYMMDD}/
5. Save updated token list to data/cache/token_list.json
Message lead and pattern-scorer when data collection is complete.
```

### Teammate 2: pattern-scorer (opus)
```
When data-fetcher is ready:
1. For new listings: score all early traders using full scoring model
2. For existing tokens: scan for volume anomalies vs 7-day baseline
3. Flag any wallet scoring ≥ 40
4. Save to data/analysis/scores/daily-{YYMMDD}.json
Message lead with summary: new listings count, flagged wallets count, top scores.
```

### Teammate 3: report-writer (sonnet)
```
When pattern-scorer is ready:
1. Read scores and any cluster data available
2. Generate daily summary at reports/daily/{YYMMDD}.md
3. For any wallet scoring ≥ 80, also generate alert report
Message lead when reports are written.
```

## After team completes

Present daily summary to user:
- New listings detected
- Number of wallets flagged
- Top 5 suspicious wallets with scores
- Link to full report
