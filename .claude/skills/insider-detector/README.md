# insider-detector

Detect insider trading patterns on Hyperliquid perpetual DEX.

## Quick Start

```bash
# In Claude Code session:
/scan-token HYPE              # Scan a specific token
/investigate 0xABC...DEF      # Deep-dive a wallet
/daily-report                 # Daily scan all tokens
```

## What It Does

1. Fetches trading data from Hyperliquid API (fills, ledger, positions, fees)
2. Runs composite scoring: **(A+B+C+D+E) × F + G** (7 components, 0–100)
3. Layer 0/1/2 MM/HFT filters (zero-address, userFees, Copin ALGO_HFT)
4. Send-graph cluster detection — links wallets funded by known suspects
5. Copin behavioral profiling — classifies archetype, adjusts score via component G
6. Leaderboard monitoring — pre-warms Copin cache for top-100 traders; alerts unusual-coin trades
7. Lark webhook alerts with Copin archetype section + cluster hit context
8. Generates Markdown reports with evidence chains

## Architecture

**Type:** Pipeline (sequential phases with parallel detectors)
**Complexity:** 18/20
**Version:** 3.1.0

```
Data Acquisition → MM/HFT Filter (L0/L1/L2) → Scoring (A–G) → Cluster/LB Check → Alert → Report
```

## Scoring Summary

| Component | Range | Signal |
|-----------|------:|--------|
| A. Deposit Speed | 0–25 | Gap between deposit/send and trade |
| B. Freshness & Quality | −8–20 | Age · 90d fills · win rate · all-time PnL |
| C. Trade vs Market | 0–20 | Size / 24h vol + OI ratio |
| D. Position Concentration | 0–15 | Margin util · implied leverage |
| E. Ledger Purity | 0–10 | Deposit-only, no withdrawals |
| F. Behavioral Multiplier | ×1.0–1.5 | Combo bonuses |
| G. Copin Behavioral | −10–+10 | Archetype from 30d Copin stats |
| Cluster Boost | +10 | Funded by known suspect |

## Flags

`LARGE` · `MEGA` · `NEW_ACCT` · `FIRST` · `FRESH_DEP` · `DEP_ONLY` · `GHOST` · `ONE_SHOT` · `ALL_IN` · `HIGH_LEV` · `DEAD_MKT` · `HIGH_OI` · `HFT` · `LINKED` · `LB_COIN`

## Output Locations

| Type | Path |
|------|------|
| Raw data | `data/raw/{scope}/` |
| Scores | `data/analysis/scores/{scope}.json` |
| Reports | `reports/{type}/{scope}_{YYMMDD}.md` |
| Cache | `data/cache/` |

## Dependencies

- Hyperliquid API access (no auth required for read)
- Copin API key (`COPIN_API_KEY`) — optional; G = 0 if unset
- `curl` or `fetch` for HTTP requests
- Existing project: `apps/insider-scanner/` for reference

## Version History

See [CHANGELOG.md](./CHANGELOG.md)
