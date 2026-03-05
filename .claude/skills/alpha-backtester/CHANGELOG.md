# Changelog — alpha-backtester

---

## [1.0.0] - 2026-03-05

### Added
- Initial skill design: 9 strategy types (momentum, mean_reversion, stat_arb, funding_rate,
  basis_trade, grid, breakout, ml_signal, custom).
- YAML strategy specification schema covering signals, position sizing, risk config.
- Risk metrics: Sharpe, Sortino, Calmar, max drawdown, VaR 95%.
- Walk-forward validation to prevent overfitting (in-sample vs out-of-sample split).
- Hyperliquid-specific constraints: max leverage, 8h funding intervals, maintenance margin.
- Output: rerunnable Python script at `scripts/backtest_{name}.py`.

### Known Gaps
- No production implementation yet (no backtest engine in `apps/`).
- Generated Python code is pseudocode template — requires real data fetching integration.
- Slippage model is simplified (1 bps default, no order-book impact scaling).
