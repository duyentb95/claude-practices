# perp-analytics

Real-time and historical analytics for Hyperliquid perp DEX trading operations.

## Quick Start
```bash
"What's happening on Hyperliquid right now?"
"Which tokens have highest funding rates?"
"BTC just dropped 8% — analyze what happened"
"Build me a P&L dashboard in Streamlit"
"Check if all trading systems are running"
```

## Architecture
**Type:** Context-Aware (routes to 8 analysis modules based on query)
**Complexity:** 13/20

## Modules
1. Market Snapshot — Quick overview
2. Funding Analytics — Rates, arb opportunities
3. Liquidation Tracker — Large position changes
4. Whale Alert — Trades > $100k
5. Event Analyzer — Flash crash, pump, outage analysis
6. Token Deep-Dive — Comprehensive single-token metrics
7. Dashboard Builder — Generate Python Dash/Streamlit code
8. System Monitor — Health check running trading apps
