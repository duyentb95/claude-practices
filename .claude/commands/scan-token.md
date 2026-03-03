---
name: scan-token
description: Scan a specific token for insider trading activity around its listing or recent events
---

Scan token `$ARGUMENTS` for insider trading patterns on Hyperliquid.

## Steps

Create an **Agent Team** named `hl-scan-{token}-{YYMMDD}` with 3 teammates:

### Teammate 1: data-fetcher (sonnet)
```
Fetch all trading data for token {TOKEN}:
1. Get metaAndAssetCtxs to find token metadata (listing date, index)
2. Collect all userFills for this token over the past 14 days
3. Identify top 30 wallets by volume
4. For each top wallet, fetch their full userFills and clearinghouseState
5. Save to data/raw/tokens/{TOKEN}/
Message lead and wallet-clusterer when complete with wallet count and record count.
```

### Teammate 2: wallet-clusterer (opus)
```
When data-fetcher is ready, read data/raw/tokens/{TOKEN}/:
1. Cluster the top wallets by timing correlation, size pattern, direction alignment
2. For each cluster found, check if wallets share behavioral fingerprints
3. Save to data/analysis/clusters/{TOKEN}.json
Message pattern-scorer when clusters are ready.
```

### Teammate 3: pattern-scorer (opus)
```
Start reading raw data as soon as data-fetcher has partial results.
When wallet-clusterer provides clusters, incorporate into scoring:
1. Score all top wallets using the full scoring model
2. Cross-reference trade timing with token listing date and any announcements
3. Flag wallets with pre-listing accumulation
4. Produce ranked list with evidence chains
5. Save to data/analysis/scores/{TOKEN}.json
Message lead with summary of findings.
```

## After team completes

Use the **report-writer** subagent to generate:
- Investigation report at `reports/investigations/{TOKEN}_{YYMMDD}.md`
- Alert reports for any wallets scoring ≥ 80

Present summary to user with top findings.
