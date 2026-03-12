---
name: regime-detector
description: >
  Use this skill to detect and classify market regimes on Hyperliquid perp pairs.
  Triggers: regime detection, market regime, momentum check, staircase detection,
  is this coin trending, should I trade momentum, regime score, market conditions.
  THIS IS THE MOST IMPORTANT SKILL — never trade without checking regime first.
version: 1.0.0
author: momentum-bot-team
architecture: Pipeline
complexity: 14
platforms: [claude-code, cursor]
tags: [regime-detection, momentum, staircase, volatility, volume-analysis, hyperliquid]
---

# Regime Detector

## Goal

Classify the current market regime for a Hyperliquid perp pair by scoring 3 independent variables:
Grindy Staircase (V1), Increasing Volume (V2), High Volatility (V3).
Output a regime classification and trading recommendation.

## Instructions

### Step 1: Fetch 1-Minute Candle Data

Fetch at least 1440 candles (24h) from Hyperliquid for the target coin.
Use the last 120 candles (2h) for regime analysis, and the full 1440 for baseline calculations.

```
WS subscription: {"method":"subscribe","subscription":{"type":"candle","coin":"TOKEN","interval":"1m"}}
```

Or from cached data in `data/raw/` if available.

### Step 2: Score Variable 1 — Grindy Staircase (Priority: HIGHEST)

Using the last 120 1-minute candles:

1. **Find swing points** (candle with higher high or lower low than both neighbors)
2. **Count sequential structure**:
   - Bullish: higher highs + higher lows count
   - Bearish: lower lows + lower highs count
3. **Measure pullback-to-impulse ratio**:
   - Identify impulse legs (direction-aligned moves) and pullback legs
   - Good staircase: avg pullback < 40% of avg impulse
4. **Measure slope consistency**:
   - Low variance in per-candle returns = grindy
   - High variance = spiky (bad for momentum)

**Score formula**: `trend_score × 0.4 + pullback_score × 0.3 + consistency_score × 0.3`
**Direction**: 'up' if bullish swings dominate, 'down' if bearish dominate, 'none' if < 30

### Step 3: Score Variable 2 — Increasing Volume

Split the 120-candle window into 4 quarters (30 candles each):

1. Calculate average volume for each quarter
2. Check if each quarter increases by ≥ 5% over previous
3. Calculate linear regression slope of volume over full window

**Score formula**: `(increasing_quarters / 3) × 60 + slope_normalized × 40`

### Step 4: Score Variable 3 — High Volatility

1. Calculate 14-period ATR for last 120 candles (current)
2. Calculate 14-period ATR for last 1440 candles (baseline)
3. Compute vol_ratio = current_ATR / baseline_ATR
4. Check daily price change % (absolute)

**Score formula**: `ratio_score × 0.6 + daily_change_score × 0.4`

### Step 5: Classify Regime

```
criteria_met = sum(score >= 60 for score in [V1, V2, V3])

STRONG MOMENTUM (3/3): → Trade aggressively, aim for 1.5R
MOMENTUM (2/3):        → Trade normally, aim for 1R
WEAK (1/3):            → Do NOT trade momentum
MEAN REVERSION (0/3):  → Do NOT trade momentum

SPECIAL RULE: If V1 (staircase) < 60, classify as WEAK regardless of V2/V3.
```

## Examples

### Example: Strong Momentum Detected

**Input:** `Check regime for VIRTUAL on Hyperliquid`

**Output:**
```json
{
  "coin": "VIRTUAL",
  "protocol": "HYPERLIQUID",
  "timestamp": "2026-03-05T14:30:00Z",
  "regime": "STRONG_MOMENTUM",
  "direction": "up",
  "criteria_met": 3,
  "scores": {
    "staircase": {"score": 82, "met": true, "direction": "up", "details": "12 higher highs, 11 higher lows in 2h window. Pullback ratio 0.28. Slope consistency 0.74."},
    "volume": {"score": 71, "met": true, "details": "Q1→Q2 +12%, Q2→Q3 +8%, Q3→Q4 +22%. Positive slope."},
    "volatility": {"score": 78, "met": true, "details": "ATR ratio 2.1x baseline. Daily change +14.3%."}
  },
  "recommendation": "TRADE — Strong momentum regime. Enter on next swing high break. Aim for 1.5R. Consider trailing SL.",
  "warnings": []
}
```

### Example: Mean Reversion Detected

**Output:**
```json
{
  "coin": "PEPE",
  "regime": "MEAN_REVERSION",
  "direction": "none",
  "criteria_met": 0,
  "scores": {
    "staircase": {"score": 18, "met": false, "details": "Sideways choppy price action. No clear HH/HL or LL/LH pattern."},
    "volume": {"score": 32, "met": false, "details": "Volume flat to decreasing across all quarters."},
    "volatility": {"score": 25, "met": false, "details": "ATR ratio 0.8x baseline. Daily change +1.2%."}
  },
  "recommendation": "DO NOT TRADE MOMENTUM. This is a mean reversion environment.",
  "warnings": ["No staircase detected — momentum trades will have very low margin of error."]
}
```

## Constraints

- **Staircase is king**: If V1 < 60, output WEAK regardless of V2/V3 scores.
- **Minimum data**: Require at least 120 1m candles. If less, return "INSUFFICIENT_DATA".
- **Rate limit**: Hyperliquid WS for live data. If using REST, respect 50ms delay.
- **Output always JSON**: For integration with momentum-executor skill.
- **No trade execution**: This skill only DETECTS regime. It never places orders.
- **Recency matters**: Weight recent candles more. If staircase existed 2h ago but last 30min is choppy → WEAK.
