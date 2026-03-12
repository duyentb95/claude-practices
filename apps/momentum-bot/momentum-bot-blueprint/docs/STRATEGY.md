# MOMENTUM STRATEGY — Codified Rules

> Extracted from "Momentum Trading Strategy Guide" by Spicy (100 pages)
> This is the machine-readable version for implementation.

## THE GOLDEN RULE

**The market regime matters more than the strategy.**
Identify the regime FIRST. Only then decide whether to trade.

---

## REGIME CLASSIFICATION

### 3 Variables (ALL must be scored independently)

| # | Variable | What to Look For | Score ≥ 60 = ✓ |
|---|----------|-------------------|----------------|
| V1 | Grindy Staircase | Higher highs + higher lows (or lower lows + lower highs), small pullbacks relative to impulse moves, consistent slope over 2+ hours | Look at last 120 1m candles |
| V2 | Increasing Volume | Each 30-min quarter has higher avg volume than previous, positive linear regression slope | Compare quarters within 2h window |
| V3 | High Volatility | Current ATR >> 24h baseline ATR, coin is a top gainer/loser of the day | Current vs baseline ratio |

### Decision Matrix

| Score | Classification | Action |
|-------|---------------|--------|
| 3/3 ✓ | **STRONG MOMENTUM** | Trade aggressively, aim for 1.5R, consider trailing SL |
| 2/3 ✓ | **MOMENTUM** | Trade normally, aim for 1R, conservative TP |
| 1/3 ✓ | **WEAK** | DO NOT trade momentum. Consider mean reversion. |
| 0/3 ✓ | **MEAN REVERSION** | DO NOT trade momentum at all. |

### CRITICAL: The Staircase is King

Even if 2/3 criteria are met, if V1 (staircase) is NOT met → DO NOT TRADE.
The staircase provides the "high margin of error" that makes the strategy work.

---

## ENTRY RULES

### WHERE: Swing Highs/Lows

```
Swing High = candle with higher high than both neighbors (min 3 candles)
Swing Low  = candle with lower low than both neighbors (min 3 candles)

Level hierarchy (bigger = easier trade):
  1h high/low  → minimum quality, most opportunities
  4h high/low  → good quality
  Daily high/low → great quality, fewer opportunities
  Weekly high/low → best quality, rare

Rule: The MORE TIME price spends AWAY from a level, the MORE VIOLENT the reaction.
  20 minutes away → weak reaction
  37 hours away → strong reaction
```

### WHEN: 1 Candle Close Through the Level

```
FOR LONGS:  1 candle must CLOSE above the swing high level (not just wick)
FOR SHORTS: 1 candle must CLOSE below the swing low level (not just wick)

This confirms the "wall of limit orders" has been absorbed.
```

### HOW: Limit vs Market Order

```
IF distance_to_stoploss < 3%:
  → LIMIT ORDER placed directly ON the broken level
  → Reason: market order fees eat too much edge on small moves

IF distance_to_stoploss ≥ 3%:
  → MARKET ORDER immediately after candle close
  → Reason: guaranteed fill, fee impact is acceptable
```

---

## STOPLOSS RULES

```
FOR LONGS:  SL = most recent relevant SWING LOW below entry
FOR SHORTS: SL = most recent relevant SWING HIGH above entry

Constraints:
  - Minimum distance: 0.5% from entry
  - Maximum distance: 5% from entry (beyond = risk:reward too poor)
  - SL must be placed IMMEDIATELY after entry (never trade without SL)
  - If SL order fails: close position at market immediately
```

---

## TAKE PROFIT RULES

### Standard Case (next level exists)
```
TP = next major swing point in the trade direction
  LONGS: next swing high above entry
  SHORTS: next swing low below entry

Aim for 1R to 1.5R. Consistent, compounding profits.
```

### All-Time High Breakout (no level above)
```
IF regime score 3/3:
  → Trail SL to each new swing low (riding the trend)
  → No fixed TP — let the trend run

IF regime score 2/3:
  → Exit at +1R (play it safe)

IF regime score 1/3 or less:
  → DO NOT TAKE THIS TRADE
```

### Evolving R Rule (prevent round-tripping)
```
IF unrealized P&L reaches +0.9R:
  → Move SL to entry_price + 0.1R (lock in small profit)
  → Max risk is now capped at ~1R of combined realized + unrealized
```

### Time-Based Exit
```
IF position open > 2 hours AND price is stuck/choppy:
  → Exit at market
  → Regime is likely shifting to mean reversion

"Would I re-enter this trade right now?" test:
  IF YES → stay in the trade
  IF NO → exit immediately
```

---

## COIN SELECTION

```
1. Scan every 5 minutes:
   → Rank all Hyperliquid coins by 1h change %
   → Top 5 gainers → candidates for momentum LONG
   → Top 5 losers → candidates for momentum SHORT

2. Filter:
   → Minimum $100k/1min volume
   → Minimum $5M 24h volume
   → Exclude illiquid / newly listed (< 7 days)

3. For each candidate:
   → Run regime detection (3 variables)
   → Only proceed if score ≥ 2/3

4. Prefer:
   → Coins with grindy staircase (V1 is the MOST IMPORTANT filter)
   → Coins being promoted on exchanges (top gainers lists)
   → Coins with high tick count relative to others
```

---

## TRADE QUALITY CHECKLIST (from the PDF)

| Question | ✓ Good | ! Unclear | ✗ Bad |
|----------|--------|-----------|-------|
| Was there a "slow grind" approach into the level? | Yes | Mixed | Fast spike |
| Was the volume increasing? | Yes | Flat | Decreasing |
| Is there at least 2 hours of "staircase" price action? | Yes | Short staircase | Sideways/choppy |

- **3/3** = High quality → be ambitious with target (1.5R, trail SL)
- **2/3** = Good quality → normal target (1R)
- **1/3** = Bad quality → DO NOT TRADE
- **0/3** = Terrible → this is a mean reversion setup, not momentum

---

## ORDERBOOK MECHANICS (WHY THE STAIRCASE WORKS)

```
Grindy Staircase = simultaneous imbalance in BOTH:

1. LIMIT ORDER IMBALANCE:
   Aggressive buyers chasing price UP with limit buy orders
   → These absorb incoming market sell orders
   → Makes it HARDER to push price DOWN
   → Makes it EASIER to push price UP

2. MARKET ORDER IMBALANCE:
   More market buys than market sells
   → Direct upward pressure
   → Combined with thin limit sells above = price grinds up

Result:
   DOWN-MOVES are small (absorbed by limit buys)
   UP-MOVES are larger (market buys eating through thin limit sells)
   = STAIRCASE pattern
```

## WHY FAST SPIKES ARE BAD (WORST CONDITION)

```
Fast spike into a level = likely limit order imbalance is SMALL or NONEXISTENT

After a fast spike:
  - Many traders who wanted to buy have ALREADY bought (into the spike)
  - Short sellers who got stopped out have ALREADY been forced out
  - There is less "fuel" remaining to push price further

This is why fast spikes INTO a level often result in REJECTION at the level.
= Best for mean reversion, worst for momentum.
```
