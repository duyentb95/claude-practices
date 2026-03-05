# trade-reconciler

Reconcile Hyperliquid perp DEX trades and verify P&L accuracy.

## Quick Start
```bash
# Reconcile a wallet's trades
"Reconcile trades for 0xABC...DEF from March 1 to March 5"

# Audit P&L
"Audit P&L for wallet 0x1234...5678 this week"

# Check positions
"Verify current positions match fill history for 0xABC"
```

## Architecture
**Type:** Context-Aware (adapts to available data sources)
**Complexity:** 12/20

## Reconciliation Types
- Fill matching (exchange vs internal records)
- Position reconstruction from fill history
- P&L verification (calculated vs reported)
- Funding payment audit
- Fee schedule compliance check
