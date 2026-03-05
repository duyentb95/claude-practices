---
name: alpha-backtester
description: >
  Use this skill when backtesting trading strategies on Hyperliquid perp DEX data.
  Triggers: backtest, strategy test, alpha signal, PnL simulation, Sharpe ratio, drawdown,
  walk-forward, out-of-sample, funding rate strategy, basis trade, momentum, mean reversion,
  stat arb, grid strategy optimization, historical analysis, strategy performance.
version: 1.0.0
author: quant-trading-team
architecture: Script
complexity: 15
platforms: [claude-code, cursor, windsurf]
tags: [backtesting, alpha-research, quant, strategy, hyperliquid, perp-dex]
---

# Alpha Backtester

## Goal

Backtest quantitative trading strategies on Hyperliquid perp DEX historical data.
Generate performance reports with Sharpe ratio, max drawdown, PnL curve, win rate,
and transaction cost analysis. Support walk-forward validation to prevent overfitting.

## Instructions

### Step 1: Strategy Specification

Parse the user's strategy description into structured components:

```yaml
strategy:
  name: string               # kebab-case identifier
  type: enum                  # momentum | mean_reversion | stat_arb | funding_rate |
                              # basis_trade | grid | breakout | ml_signal | custom
  universe: string[]          # tokens to trade, e.g. ["BTC", "ETH", "HYPE"]
  timeframe: string           # candle interval: 1m, 5m, 15m, 1h, 4h, 1d
  direction: enum             # long_only | short_only | long_short

signals:
  entry: string               # Natural language → Python condition
  exit: string                # Natural language → Python condition
  stop_loss: number | null    # Percentage, e.g. 0.02 = 2%
  take_profit: number | null

position_sizing:
  method: enum                # fixed_usd | pct_equity | volatility_scaled | kelly
  value: number               # e.g. 10000 (USD) or 0.02 (2% equity)
  max_leverage: number        # e.g. 10
  max_positions: number       # concurrent positions allowed

backtest_config:
  start_date: string          # ISO date
  end_date: string            # ISO date or "now"
  initial_capital: number     # USD
  maker_fee: 0.0001           # 0.01% Hyperliquid maker
  taker_fee: 0.00035          # 0.035% Hyperliquid taker
  slippage_bps: 1             # 1 basis point default slippage
  funding_rate: true          # Include 8-hourly funding costs
```

### Step 2: Data Preparation

1. **Fetch historical data** from Hyperliquid or cached files:
   - If `data/raw/` has relevant data → use it
   - Else fetch via API or use `apps/data-analytics/` if available

2. **Build OHLCV candles** from raw trade data:
   ```python
   columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume', 'trades',
              'buy_volume', 'sell_volume', 'vwap', 'funding_rate']
   ```

3. **Feature engineering** (strategy-dependent):
   - Price-based: SMA, EMA, RSI, MACD, Bollinger Bands, ATR
   - Volume-based: OBV, VWAP deviation, volume profile
   - Microstructure: bid-ask spread, order imbalance, trade flow
   - Funding: funding rate, cumulative funding, funding velocity
   - Cross-market: BTC correlation, sector momentum

4. **Time-series split** (CRITICAL — no lookahead bias):
   ```
   |---- Train (60%) ----|---- Validation (20%) ----|---- Test (20%) ----|
   Walk-forward: slide window by validation_size, retrain, test on next window
   ```

### Step 3: Backtest Engine

Generate and execute Python backtest code:

```python
class BacktestEngine:
    def __init__(self, config):
        self.capital = config.initial_capital
        self.positions = {}      # coin → Position
        self.trades = []         # completed trades
        self.equity_curve = []   # timestamp → equity
        self.funding_paid = 0

    def on_candle(self, timestamp, candles):
        # 1. Update funding costs (every 8h)
        # 2. Check stop loss / take profit
        # 3. Generate signals
        # 4. Execute entry/exit with slippage + fees
        # 5. Record equity

    def execute_trade(self, coin, side, size, price):
        # Apply slippage: price * (1 + slippage_bps/10000 * direction)
        # Apply fee: taker_fee for market orders, maker_fee for limit
        # Update position tracking
```

**Hyperliquid-specific considerations:**
- Funding rates are paid/received every 8 hours based on position
- Liquidation price depends on leverage and maintenance margin
- Max leverage varies by token (check `metaAndAssetCtxs`)
- Price rounding: 5 significant digits

### Step 4: Performance Analysis

Calculate metrics:

```python
metrics = {
    # Returns
    "total_return_pct": (final_equity - initial) / initial * 100,
    "annualized_return_pct": ...,
    "sharpe_ratio": mean(daily_returns) / std(daily_returns) * sqrt(365),
    "sortino_ratio": mean(daily_returns) / downside_std * sqrt(365),
    "calmar_ratio": annualized_return / max_drawdown,

    # Risk
    "max_drawdown_pct": ...,
    "max_drawdown_duration_days": ...,
    "volatility_annual_pct": std(daily_returns) * sqrt(365) * 100,
    "var_95_pct": percentile(daily_returns, 5),

    # Trading
    "total_trades": ...,
    "win_rate_pct": wins / total * 100,
    "profit_factor": gross_profit / gross_loss,
    "avg_win_usd": ...,
    "avg_loss_usd": ...,
    "avg_holding_period": ...,

    # Costs
    "total_fees_usd": ...,
    "total_funding_usd": ...,
    "total_slippage_usd": ...,
    "cost_as_pct_of_pnl": ...,

    # Validation
    "in_sample_sharpe": ...,
    "out_of_sample_sharpe": ...,
    "overfit_ratio": in_sample_sharpe / out_of_sample_sharpe,
}
```

### Step 5: Report Generation

Output:
1. Python script → `scripts/backtest_{strategy_name}.py` (rerunnable)
2. Performance JSON → `data/analysis/backtest/{strategy_name}_{YYMMDD}.json`
3. Markdown report → `reports/backtest/{strategy_name}_{YYMMDD}.md`

Report includes:
- Strategy description and parameters
- Performance summary table
- Equity curve (ASCII chart or data for plotting)
- Monthly returns heatmap (text table)
- Top 5 best/worst trades
- Walk-forward results (if applicable)
- Transaction cost breakdown
- Risk warnings and limitations

## Examples

### Example 1: Funding Rate Arbitrage

**Input:**
```
Backtest funding rate arbitrage on HYPE:
- When funding rate > 0.01% per 8h, short HYPE perp
- When funding rate < -0.01% per 8h, long HYPE perp
- Close when funding normalizes (|rate| < 0.005%)
- Position size: $10k fixed
- Period: last 90 days
```

**Expected Output (summary):**
```
## Backtest: HYPE Funding Rate Arb — 90 Days

| Metric | Value |
|--------|-------|
| Total return | +8.3% ($830) |
| Sharpe ratio | 1.42 |
| Max drawdown | -3.1% |
| Win rate | 62% (18/29 trades) |
| Avg holding period | 2.4 days |
| Total funding collected | $1,240 |
| Total fees paid | $203 |
| Net after costs | $830 |

⚠️ Warning: Funding rate strategies are crowded. Out-of-sample
Sharpe (0.89) significantly lower than in-sample (1.42).
Overfit ratio: 1.60 — moderate overfitting risk.
```

### Example 2: Momentum Strategy

**Input:**
```
Test momentum strategy across top 10 Hyperliquid tokens:
- Long if 24h return > 5% and volume > 2x average
- Short if 24h return < -5% and volume > 2x average
- Stop loss 3%, take profit 10%
- $5k per position, max 3 concurrent
- Test on 6 months of data
```

**Expected Behavior:**
1. Identify top 10 tokens by volume
2. Build 1h candles for each
3. Implement dual-signal entry (return + volume)
4. Walk-forward: 4 months train, 1 month val, 1 month test
5. Generate full performance report

## Constraints

- **No lookahead bias**: NEVER use future data for signal generation. Time-series split only.
- **Realistic costs**: Always include maker/taker fees + slippage + funding. No frictionless backtests.
- **Hyperliquid fee schedule**: Maker 0.01%, Taker 0.035% (verify current rates before running).
- **Funding rates**: Include 8-hourly funding in P&L calculation for all positions held > 8h.
- **Liquidation**: Enforce liquidation at maintenance margin. Max leverage per token from metaAndAssetCtxs.
- **Walk-forward required**: For any strategy with > 2 parameters. Report in-sample vs out-of-sample metrics.
- **Overfit warning**: If in-sample Sharpe / out-of-sample Sharpe > 1.5, add explicit overfit warning.
- **File output**: Scripts to `scripts/`, data to `data/analysis/backtest/`, reports to `reports/backtest/`.
- **Rerunnable**: Generated Python scripts must be self-contained and rerunnable with `python scripts/backtest_*.py`.
- **No position taking**: This is a research tool. Never place real orders or interact with exchange signing endpoints.
