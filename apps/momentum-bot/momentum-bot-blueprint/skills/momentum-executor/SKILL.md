---
name: momentum-executor
description: >
  Use this skill to execute momentum breakout trades on Hyperliquid.
  Triggers: enter momentum trade, execute breakout, place momentum order,
  manage position, trailing stoploss, exit momentum trade, close position.
  REQUIRES regime-detector to have confirmed regime ≥ 2/3 before execution.
version: 1.0.0
author: momentum-bot-team
architecture: Safety-First
complexity: 16
platforms: [claude-code, cursor]
tags: [execution, order-management, momentum, breakout, risk-management, hyperliquid]
---

# Momentum Executor

## Goal

Execute momentum breakout trades on Hyperliquid following strict rules:
entry after candle close through swing level, SL at opposite swing point,
TP at next level or trailing. Enforce all risk management rules.

## Instructions

### Pre-Flight Checks (MANDATORY — before ANY execution)

```
CHECK 1: Regime score ≥ 2/3? (from regime-detector)
  → If NO: ABORT. Log "Regime insufficient for momentum trade."

CHECK 2: Staircase (V1) ≥ 60?
  → If NO: ABORT even if V2+V3 are met.

CHECK 3: Current open positions < max_concurrent_positions?
  → If NO: WAIT or ABORT.

CHECK 4: No existing position on this coin?
  → If YES (already have position on this coin): ABORT.

CHECK 5: Daily loss limit not reached?
  → If reached: ABORT. Log "Daily loss limit hit."

CHECK 6: Account equity > min_account_balance?
  → If NO: ABORT. Emergency shutdown.
```

### Entry Execution

```
1. IDENTIFY the level:
   → LONG: swing high that price is about to break
   → SHORT: swing low that price is about to break

2. WAIT for trigger:
   → 1-minute candle must CLOSE through the level (body, not just wick)

3. DETERMINE order type:
   → IF abs(entry_price - stoploss_price) / entry_price < 0.03:
     → LIMIT ORDER at the broken level price (retest entry)
     → Set limit order TTL: 5 minutes (cancel if not filled)
   → ELSE:
     → MARKET ORDER immediately

4. CALCULATE position size:
   → risk_usd = account_equity × max_risk_per_trade_pct / 100
   → sl_distance = abs(entry_price - stoploss_price)
   → position_size = risk_usd / sl_distance
   → leverage = position_size × entry_price / collateral
   → Enforce: leverage ≤ min(max_leverage, token_max_leverage / 2)
   → If leverage exceeds: reduce position_size

5. PLACE entry order via Hyperliquid exchange API:
   → POST https://api.hyperliquid.xyz/exchange
   → Sign with EIP-712 phantom agent
```

### Stoploss Placement (IMMEDIATELY after entry)

```
1. SL price:
   → LONG: most recent swing low below entry
   → SHORT: most recent swing high above entry
   → Min distance: 0.5% from entry
   → Max distance: 5% from entry

2. Place SL as trigger order:
   → Type: stop market (trigger on last price)
   → CRITICAL: If SL order fails to place → CLOSE POSITION AT MARKET IMMEDIATELY

3. Verify SL is active:
   → Check open orders include the SL trigger
   → If not found within 5 seconds: emergency close
```

### Take Profit Management

```
Standard (next level exists):
  → TP = next swing high (long) or swing low (short)
  → Place as limit order (maker fee)

ATH breakout (no level above):
  → IF regime 3/3: No TP, use trailing SL instead
  → IF regime 2/3: TP at +1R

Evolving R Rule:
  → Monitor unrealized PnL continuously
  → IF unrealized ≥ +0.9R:
    → Move SL to entry_price + 0.1R (for longs)
    → or entry_price - 0.1R (for shorts)
    → This locks in small profit and caps downside
```

### Position Monitoring (Continuous)

```
EVERY 1 second while position is open:

1. Check WebSocket for fill updates (userFills, orderUpdates)
2. Update unrealized PnL
3. Check if SL/TP was hit → log trade result

4. TIME CHECK:
   → IF position open > 2 hours AND price is in a sideways range:
     → "Would I re-enter this trade right now?"
     → If staircase has degraded or volume died → EXIT AT MARKET

5. TRAILING SL (if regime 3/3 and no fixed TP):
   → On each new swing low formed above entry (for longs):
     → Move SL to that new swing low
   → On each new swing high formed below entry (for shorts):
     → Move SL to that new swing high

6. HEARTBEAT:
   → IF no WS data received for > 10 seconds:
     → CLOSE ALL POSITIONS AT MARKET
     → Alert: "WebSocket heartbeat lost — emergency close"
```

### Post-Trade Logging

```
Log every trade to PostgreSQL trade journal:

{
  trade_id, coin, direction, entry_price, exit_price,
  stoploss_price, target_price, position_size, leverage,
  entry_type (limit/market), exit_type (tp/sl/trailing/time/emergency),
  r_multiple, pnl_usd, pnl_pct,
  hold_duration_seconds,
  regime_score, staircase_score, volume_score, volatility_score,
  trade_quality (3/3, 2/3),
  max_favorable_excursion, max_adverse_excursion,
  timestamp_entry, timestamp_exit
}
```

## Examples

### Example: Long Entry on VIRTUAL

```
Regime: STRONG_MOMENTUM (3/3), direction: up
Level: Previous 4h high at $3.245
Current price: $3.248 (1m candle just closed above $3.245)
Swing low (SL): $3.152 (2.9% below entry → use LIMIT ORDER at $3.245)
Next swing high (TP): $3.380 (4.2% above entry)

Risk: 2% of $10,000 = $200
SL distance: $3.245 - $3.152 = $0.093
Position size: $200 / $0.093 = 2,150 VIRTUAL
R:R = ($3.380 - $3.245) / ($3.245 - $3.152) = 1.45R ✓

Execute:
  → Place LIMIT BUY 2,150 VIRTUAL @ $3.245
  → Immediately after fill: place STOP MARKET SELL trigger @ $3.152
  → Place LIMIT SELL 2,150 VIRTUAL @ $3.380 (TP)
  → Since regime 3/3: also prepare trailing SL logic
```

## Constraints

- **NEVER trade without regime check**: regime-detector MUST confirm ≥ 2/3 before execution.
- **NEVER trade without stoploss**: If SL order fails, close position immediately.
- **Risk limits are HARD-CODED**: max 2% per trade, max 3 concurrent, daily -5% halt.
- **EIP-712 signing**: Use ethers-rs or equivalent. Vault address if configured.
- **Hyperliquid specifics**: Use `hyperliquidRoundPrice()` for 5 sig digits. Check szDecimals.
- **Maker vs Taker**: Limit orders = 0.01% maker. Market orders = 0.035% taker.
- **Paper trading mode**: When `paper_trade = true`, log everything but don't submit orders.
- **Emergency close**: On any unhandled error → close all positions, alert, halt.
