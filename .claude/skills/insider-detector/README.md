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

1. Fetches trading data from Hyperliquid API
2. Runs 6 parallel detection algorithms (pre-event accumulation, volume anomaly, win rate, timing precision, wallet clustering, one-shot behavior)
3. Produces composite score (0–100) per wallet
4. Generates Markdown reports with evidence chains

## Architecture

**Type:** Pipeline (sequential phases with parallel detectors)
**Complexity:** 16/20

```
Data Acquisition → Pattern Detection (6 parallel) → Scoring → Report
```

## Output Locations

| Type | Path |
|------|------|
| Raw data | `data/raw/{scope}/` |
| Scores | `data/analysis/scores/{scope}.json` |
| Reports | `reports/{type}/{scope}_{YYMMDD}.md` |
| Cache | `data/cache/` |

## Dependencies

- Hyperliquid API access (no auth required for read)
- `curl` or `fetch` for HTTP requests
- Python 3 or Node.js for data processing
- Existing project: `apps/insider-scanner/` for reference

## Scoring Model

| Factor | Weight | What |
|--------|--------|------|
| Pre-event accumulation | 30% | Large positions before announcements |
| Volume anomaly | 20% | Volume spike vs 7-day baseline |
| Win rate (new listings) | 15% | Success rate on recently listed tokens |
| Timing precision | 15% | How close trades are to price moves |
| Wallet clustering | 10% | Coordinated wallet groups |
| One-shot behavior | 10% | Fresh wallet → big trade → withdraw |

## Version History

See [CHANGELOG.md](./CHANGELOG.md)
