# Momentum Breakout Strategy — Cheat Sheet

> Condensed from "Momentum Trading Strategy Guide" by Spicy (100 pages)

## Regime First, Strategy Second

"Most traders obsess about tweaking their strategy but completely ignore measuring the current market regime."

Easy regime → Trade more, risk more (even bad strategies win)
Hard regime → Trade less, risk less (even good strategies lose)

## 3 Quality Variables (Score ≥ 2/3 to trade)

| # | Variable | ✅ YES | ❌ NO |
|---|----------|--------|-------|
| 1 | **Grindy staircase into level?** | Slow grinding approach, higher lows (or lower highs), small pullbacks, large advances | Fast V-shaped spike into level |
| 2 | **Volume increasing?** | 15-min volume windows trending up | Flat, decreasing, or erratic |
| 3 | **≥2 hours of staircase?** | Clear directional structure for 120+ minutes on 1m chart | Choppy sideways range, or < 2h of structure |

**3/3 → High quality** → Aggressive TP (next S/R or trail)
**2/3 → Good trade** → Conservative TP (1R)
**1/3 or 0/3 → SKIP** — Do not trade

## Entry Rules

```
WHERE:  Major swing high (long) or swing low (short)
        Bigger level = easier trade (1d > 4h > 1h)
        
WHEN:   1 candle CLOSE through the level
        (confirms limit order wall has been broken)

HOW:    SL distance < 3%  → LIMIT ORDER on broken level
        SL distance ≥ 3%  → MARKET ORDER immediately
```

## Stop Loss

```
LONG:   SL at swing low below entry
SHORT:  SL at swing high above entry

EVOLVING R:
  If +0.9R reached → move SL to entry + 0.1R
```

## Take Profit

```
3/3 quality + next S/R visible → exit at next S/R
3/3 quality + ATH breakout     → trail SL or exit at sell wall
2/3 quality                    → exit at +1R (conservative)

TIMEOUT: If 2h passed and < 0.5R in profit → CUT
```

## Coin Selection

```
1. Sort by 24h change % (top gainers for longs, top losers for shorts)
2. Filter: ≥ $100k/min volume
3. Check: tick count abnormally high vs other coins
4. Verify: staircase pattern on 1m chart
```

## Why It Works (Orderbook Theory)

Grindy staircase = DUAL imbalance:
- **Limit imbalance**: Thick bids absorb sells (bullish) → harder to push down
- **Market imbalance**: More aggressive buys than sells → pushes price up
- **FOMO amplifier**: Exchange promotes "hot coin" → retail market buys → push further

## What to AVOID

- Fast V-shaped spikes into levels (exhaustion, not momentum)
- Decreasing volume (market cooling off)
- Choppy sideways ranges (mean reversion territory, not breakout)
- Recent 2h is choppy even if older staircase existed → skip
- No staircase = NEVER take momentum trade (lowest variable to compromise on)
