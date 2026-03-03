---
name: investigate
description: Deep-dive investigation of a specific wallet address for insider trading signals
---

Investigate wallet `$ARGUMENTS` for insider trading on Hyperliquid.

## Steps

1. Use the **data-fetcher** subagent to collect all data for this wallet:
   - userFills (full trade history)
   - clearinghouseState (current positions)
   - userFunding (funding payments)
   Save to `data/raw/wallets/{short_address}/`

2. Use the **data-fetcher** subagent to also fetch fills for the wallet's most-traded tokens to identify other wallets trading the same tokens at similar times.

3. Use the **wallet-clusterer** subagent to find related wallets:
   - Timing correlation with other wallets on same tokens
   - Similar trade sizes and directions
   Save clusters to `data/analysis/clusters/{short_address}.json`

4. Use the **pattern-scorer** subagent to score:
   - Pre-event accumulation
   - Volume anomalies
   - Win rate on new listings
   - Timing precision
   - Cluster involvement
   - One-shot behavior
   Save to `data/analysis/scores/{short_address}.json`

5. Use the **report-writer** subagent to generate investigation report at `reports/investigations/{short_address}_{YYMMDD}.md`

6. Present findings summary to user.

If the wallet scores ≥ 80, also generate an alert report at `reports/alerts/`.

For complex investigations (many related wallets found), consider using an **Agent Team** instead of sequential subagents for parallel analysis.
