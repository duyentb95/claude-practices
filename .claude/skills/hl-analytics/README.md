# hl-analytics

Skill for computing analytics and performance metrics from Hyperliquid data.

## When to use

- Trader PnL / performance report (win rate, drawdown, Sharpe)
- Market overview (top coins by volume, OI, funding)
- Funding rate screener (find high-yield opportunities)
- Leaderboard analysis (top traders by window)
- Token deep-dive (OHLCV, OI trend, funding history, order book)
- Statistical pattern detection (volume spikes, OI expansion)

## What it does NOT do

- Does NOT fetch raw data directly — relies on `hl-data-fetcher` for API calls
- Does NOT place orders — pairs with `hl-trading` for execution

## Resources

- [`resources/metrics.md`](resources/metrics.md) — metric definitions and computation formulas
- [`examples/market-snapshot.md`](examples/market-snapshot.md) — market overview walkthrough
- [`../../docs/hyperliquid-api-reference.md`](../../docs/hyperliquid-api-reference.md) — master API reference

## Output Paths

| Analysis | Path |
|----------|------|
| Trader stats | `data/analysis/traders/{address}-{YYYYMMDD}.json` |
| Market snapshot | `data/analysis/market/snapshot-{YYYYMMDD}.json` |
| Leaderboard | `data/analysis/leaderboard/{window}-{YYYYMMDD}.json` |
| Token deep-dive | `reports/investigations/{TOKEN}-{YYYYMMDD}.md` |
| Funding screener | `reports/daily/{YYYYMMDD}-funding.md` |
