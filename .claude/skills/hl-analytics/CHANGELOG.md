# Changelog — hl-analytics

---

## [1.0.0] - 2026-03-05

### Added
- Initial skill: 5 analysis types (trader performance, market snapshot, funding screener, leaderboard, token deep-dive).
- Trader metrics: totalPnl, realizedPnl, unrealizedPnl, winRate, profitFactor, maxDrawdown, Sharpe approximation, fundingPaid.
- Drawdown computation: peak-to-trough on running closed PnL timeline.
- Sharpe approximation: daily PnL mean/std × √365 (requires ≥ 10 closed trades).
- Funding analysis: hourly rate × 8760 annualization; per-interval × 1095.
- Market anomaly signals: HIGH_FUNDING, OI_EXPANSION, VOL_SPIKE, DEAD_MARKET, PREMIUM_DIVERGENCE.
- Coin tier classification: BLUECHIP / MID_CAP / LOW_CAP / MICRO_CAP (matches insider-scanner thresholds).
- Order book analysis: bid/ask depth, imbalance ratio.
- Resources: `metrics.md` (all metric formulas).
- Examples: `market-snapshot.md` (market overview walkthrough).

### Known Gaps
- No historical OI data endpoint — OI trend requires storing snapshots over time.
- Sharpe uses daily PnL not returns-on-capital (no initial capital tracking).
- Volatility computation requires candles — not available from fills data alone.
- Leaderboard window comparison (day vs week vs month) not automated.
