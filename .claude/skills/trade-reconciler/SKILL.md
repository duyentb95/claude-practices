---
name: trade-reconciler
description: >
  Use this skill when reconciling trades, verifying P&L, checking settlement accuracy,
  or auditing trading system output on Hyperliquid perp DEX.
  Triggers: reconcile, recon, P&L mismatch, settlement, fill verification, fee audit,
  position mismatch, funding payment check, trade accounting, ledger, order audit.
version: 1.0.0
author: quant-trading-team
architecture: Context-Aware
complexity: 12
platforms: [claude-code, cursor, windsurf]
tags: [reconciliation, trading-ops, pnl, settlement, hyperliquid, perp-dex]
---

# Trade Reconciler

## Goal

Reconcile Hyperliquid perp DEX trades between exchange API data and internal records.
Detect mismatches in fills, P&L, funding payments, fees, and positions.
Output a reconciliation report with discrepancies classified by severity.

## Instructions

### Step 1: Identify Reconciliation Scope

Determine from user request:
- **Full recon**: All trades for a wallet in a time period
- **Position recon**: Current positions vs expected from fill history
- **Funding recon**: Funding payments received vs calculated from positions
- **P&L recon**: Realized P&L from fills vs reported by exchange
- **Fee audit**: Trading fees charged vs expected from fee schedule

### Step 2: Fetch Exchange Data (Source of Truth A)

From Hyperliquid API:
```
Fills:      POST /info {"type": "userFills", "user": "0x..."}
Positions:  POST /info {"type": "clearinghouseState", "user": "0x..."}
Funding:    POST /info {"type": "userFunding", "user": "0x...", "startTime": ms, "endTime": ms}
Orders:     POST /info {"type": "openOrders", "user": "0x..."}
```

### Step 3: Load Internal Records (Source of Truth B)

Check these locations in order:
1. `data/processed/` — If project has structured trade logs
2. Redis cache via `CacheService` — If hyper-rau is running
3. `apps/insider-scanner/` logs — If scanner captured relevant data
4. User-provided CSV/JSON file

If no internal records exist, perform **self-reconciliation**: reconstruct expected positions
and P&L from fill history, then compare against exchange-reported values.

### Step 4: Compare & Detect Discrepancies

**Fill Reconciliation:**
```
For each fill in Exchange:
  Match by: order_id (oid), timestamp ±1s, coin, side
  Compare: price (tolerance ±0.01%), size (tolerance ±0.001), fee

  Mismatch types:
    MISSING_INTERNAL — Fill on exchange but not in internal records
    MISSING_EXCHANGE — Internal record with no exchange fill
    PRICE_MISMATCH   — Matched but price differs beyond tolerance
    SIZE_MISMATCH    — Matched but size differs beyond tolerance
    FEE_MISMATCH     — Fee charged differs from expected
```

**Position Reconciliation:**
```
For each coin:
  expected_position = sum(fills.size * direction) from fill history
  actual_position = clearinghouseState.assetPositions

  Compare: size, entry_price, unrealized_pnl, leverage
  Flag if |expected - actual| > 0.001 contracts
```

**P&L Reconciliation:**
```
For each closed trade:
  expected_pnl = (exit_price - entry_price) * size * direction - fees
  reported_pnl = fill.closedPnl from userFills

  Flag if |expected - reported| > $0.01
```

**Funding Reconciliation:**
```
For each funding interval (8h):
  expected_funding = position_size * funding_rate * mark_price
  actual_funding = userFunding response

  Flag if |expected - actual| > $0.01
```

### Step 5: Classify & Report

Severity levels:
- 🔴 **CRITICAL**: Missing fills, position mismatch > 1%, P&L discrepancy > $100
- 🟡 **WARNING**: Fee mismatch, funding discrepancy, P&L diff $1–$100
- 🟢 **INFO**: Rounding differences < $1, timestamp drift < 5s

Output:
1. JSON report → `data/analysis/recon/{wallet_short}_{YYMMDD}.json`
2. Markdown summary → `reports/recon/{wallet_short}_{YYMMDD}.md`

## Examples

### Example 1: Full Reconciliation

**Input:**
```
Reconcile trades for wallet 0xABC...DEF from 2026-03-01 to 2026-03-05
```

**Expected Output:**
```markdown
# Trade Reconciliation Report
**Wallet**: 0xABC...DEF
**Period**: 2026-03-01 to 2026-03-05
**Status**: ⚠️ 2 discrepancies found

## Summary
| Metric | Value |
|--------|-------|
| Total fills (exchange) | 247 |
| Total fills (internal) | 245 |
| Matched | 243 |
| Mismatches | 2 |
| Total P&L (exchange) | $12,345.67 |
| Total P&L (calculated) | $12,341.23 |
| P&L difference | $4.44 |

## Discrepancies

### 🔴 CRITICAL: Missing Internal Record
- **Exchange fill**: BTC long 0.5 @ $67,234.50 at 2026-03-02 14:22:03
- **Order ID**: 0x9f8e7d6c
- **Action needed**: Check if order was placed via different system

### 🟡 WARNING: Fee Mismatch
- **Fill**: ETH short 2.0 @ $3,456.78 at 2026-03-03 09:15:00
- **Expected fee**: $3.46 (0.05% maker)
- **Charged fee**: $6.91 (0.10% taker)
- **Likely cause**: Order filled as taker despite limit order

## Positions Check
| Coin | Expected | Actual | Match |
|------|----------|--------|-------|
| BTC | +0.500 | +0.500 | ✅ |
| ETH | -2.000 | -2.000 | ✅ |
| HYPE | 0.000 | 0.000 | ✅ |
```

### Example 2: Self-Reconciliation (No Internal Records)

**Input:**
```
Audit P&L for wallet 0x1234...5678 this week
```

**Expected Behavior:**
1. Fetch all fills from exchange
2. Reconstruct position history from fills
3. Calculate expected P&L from entry/exit prices and fees
4. Compare with `closedPnl` reported in each fill
5. Flag any discrepancies

## Constraints

- **Tolerance levels are non-negotiable**: Price ±0.01%, size ±0.001, P&L ±$0.01
- **Always fetch from exchange first** — exchange data is source of truth for what happened on-chain
- **Never modify trading systems** — this skill is read-only analysis
- **File output**: Only write to `data/analysis/recon/` and `reports/recon/`
- **Funding calculation**: Use 8-hour funding intervals. Hyperliquid funding is continuous but settled 8-hourly.
- **Fee schedule**: Maker 0.01%, Taker 0.035% on Hyperliquid (verify — may change)
- **Precision**: Use lossless-json for parsing. Never use floating point for financial calculations.
- **Time zones**: All comparisons in UTC. Display in UTC+7 for reports.
