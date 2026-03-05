# alpha-backtester

Backtest quantitative trading strategies on Hyperliquid perp DEX data.

## Quick Start
```bash
"Backtest funding rate arb on HYPE, last 90 days, $10k position"
"Test momentum strategy on top 10 tokens with walk-forward validation"
"Compare grid vs momentum strategy on ETH"
```

## Architecture
**Type:** Script (generates rerunnable Python backtest code)
**Complexity:** 15/20

## Features
- Realistic cost modeling (maker/taker fees + slippage + funding rates)
- Walk-forward validation to prevent overfitting
- Hyperliquid-specific: leverage limits, liquidation, 8h funding
- Full performance suite: Sharpe, Sortino, Calmar, drawdown, win rate
- Generates self-contained Python scripts for reproducibility

## Strategy Types Supported
momentum, mean_reversion, stat_arb, funding_rate, basis_trade, grid, breakout, ml_signal, custom

## Output
- `scripts/backtest_{name}.py` — Rerunnable Python script
- `data/analysis/backtest/{name}.json` — Raw metrics
- `reports/backtest/{name}.md` — Full report with charts
