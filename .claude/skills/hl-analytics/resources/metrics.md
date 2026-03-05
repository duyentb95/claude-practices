# Analytics Metrics — Definitions & Formulas

All metrics computed from Hyperliquid `userFillsByTime` (paginated) + `clearinghouseState`.

---

## Trader Performance Metrics

### PnL

```typescript
// Realized PnL: sum of closedPnl from fills with closedPnl ≠ 0
const realizedPnl = fills
  .filter(f => parseFloat(f.closedPnl) !== 0)
  .reduce((sum, f) => sum + parseFloat(f.closedPnl), 0);

// All-time PnL: sum of ALL fill closedPnl (including open)
const allTimePnl = fills.reduce((sum, f) => sum + parseFloat(f.closedPnl ?? '0'), 0);

// Unrealized PnL: from clearinghouseState positions (sum returnOnEquity × positionValue approximation)
// Or directly from state.assetPositions[i].position.returnOnEquity × marginUsed
const unrealizedPnl = state.assetPositions.reduce((sum, ap) => {
  const roe = parseFloat(ap.position.returnOnEquity);
  const margin = parseFloat(ap.position.marginUsed);
  return sum + roe * margin;
}, 0);
```

### Win Rate

```typescript
// Only count fills with closedPnl ≠ 0 (closed positions)
// Minimum: 10 closed fills to be statistically meaningful
const closed = fills.filter(f => parseFloat(f.closedPnl) !== 0);
const wins   = closed.filter(f => parseFloat(f.closedPnl) > 0);

const winRate     = closed.length >= 10 ? wins.length / closed.length : null;
const avgWin      = wins.reduce((s, f) => s + parseFloat(f.closedPnl), 0) / (wins.length || 1);
const losses      = closed.filter(f => parseFloat(f.closedPnl) < 0);
const avgLoss     = losses.reduce((s, f) => s + parseFloat(f.closedPnl), 0) / (losses.length || 1);
const profitFactor = Math.abs(avgWin * wins.length / (avgLoss * losses.length || 1));
```

### Maximum Drawdown

```typescript
// Peak-to-trough on running closed PnL (time-ordered)
const sorted = [...fills].sort((a, b) => a.time - b.time);
let running = 0, peak = 0, maxDrawdown = 0;

for (const f of sorted) {
  running += parseFloat(f.closedPnl ?? '0');
  if (running > peak) peak = running;
  const dd = peak - running;
  if (dd > maxDrawdown) maxDrawdown = dd;
}
// maxDrawdown is in USDC
// maxDrawdownPct = maxDrawdown / peak (if peak > 0)
```

### Sharpe Ratio (Approximation)

```typescript
// Requires ≥ 10 data points; daily resolution
// Note: uses daily PnL, not return on capital (no initial balance tracking)

// Group fills by UTC day
const byDay: Map<number, number> = new Map();
for (const f of fills) {
  const day = Math.floor(f.time / 86_400_000);
  byDay.set(day, (byDay.get(day) ?? 0) + parseFloat(f.closedPnl ?? '0'));
}

const dailyPnl = [...byDay.values()];
const n = dailyPnl.length;
if (n < 10) return null;  // insufficient data

const mean = dailyPnl.reduce((a, b) => a + b, 0) / n;
const variance = dailyPnl.reduce((s, d) => s + (d - mean) ** 2, 0) / n;
const std = Math.sqrt(variance);

const sharpe = std > 0 ? (mean / std) * Math.sqrt(365) : 0;
// Positive > 1.0: good | > 2.0: excellent | negative: risk-adjusted loss
```

### Volume

```typescript
const totalVolume = fills.reduce((sum, f) => {
  return sum + Math.abs(parseFloat(f.sz) * parseFloat(f.px));
}, 0);
```

### Funding Paid/Received

```typescript
// From separate fundingHistory call per coin held
const fundingHistory = await postInfo({
  type: 'userFunding',
  user: address,
  startTime: sinceMs,
});

const totalFunding = fundingHistory.reduce((sum, h) => {
  return sum + parseFloat(h.delta.usdc);
}, 0);
// Negative = paid (long in positive funding); Positive = received (short)
```

---

## Market Metrics

### Funding Rate Annualization

```typescript
// From metaAndAssetCtxs: ctxs[i].funding = hourly funding rate
const hourlyRate = parseFloat(ctx.funding);
const annualizedRate = hourlyRate * 8760;         // 8760 hours/year

// From fundingHistory endpoint: fundingRate = per-8h interval rate
const intervalRate = parseFloat(entry.fundingRate);
const annualizedFromHistory = intervalRate * 1095; // 1095 intervals/year (3 per day × 365)
```

### Open Interest

```typescript
// oiNtlVlm = OI in USDC (already computed by Hyperliquid)
const oiUsd = parseFloat(ctx.oiNtlVlm);

// Alternatively: openInterest (in base coin) × markPx
const oiAlt = parseFloat(ctx.openInterest) * parseFloat(ctx.markPx);

// Note: use oiNtlVlm — it's more accurate (includes cross-margin adjustments)
```

### Volume Tier Classification

```typescript
// Matches insider-scanner thresholds
function getCoinTier(vol24h: number, name: string): string {
  if (['BTC', 'ETH', 'SOL'].includes(name) || vol24h > 100_000_000) return 'BLUECHIP';
  if (vol24h > 10_000_000)  return 'MID_CAP';
  if (vol24h > 500_000)     return 'LOW_CAP';
  return 'MICRO_CAP';
}

// Minimum trade size by tier (for insider detection context)
const MIN_TRADE_USD = { BLUECHIP: 500_000, MID_CAP: 100_000, LOW_CAP: 30_000, MICRO_CAP: 10_000 };
```

### Price Premium

```typescript
// premium = (markPx - spotPx) / spotPx ≈ basis
// Positive = futures trading above spot (contango)
// Negative = futures below spot (backwardation)
const premium = parseFloat(ctx.premium);
const basisPct = premium * 100;
```

---

## Order Book Metrics

```typescript
const book = await postInfo({ type: 'l2Book', coin: 'BTC', nSigFigs: 5 });
const bids = book.levels[0];  // descending by price
const asks = book.levels[1];  // ascending by price

// Spread
const bestBid = parseFloat(bids[0].px);
const bestAsk = parseFloat(asks[0].px);
const spread = bestAsk - bestBid;
const spreadBps = (spread / bestBid) * 10_000;

// Depth (top N levels)
const N = 10;
const bidDepth = bids.slice(0, N).reduce((s, l) => s + parseFloat(l.sz) * parseFloat(l.px), 0);
const askDepth = asks.slice(0, N).reduce((s, l) => s + parseFloat(l.sz) * parseFloat(l.px), 0);

// Imbalance: +1 = all bids, -1 = all asks, 0 = balanced
const imbalance = (bidDepth - askDepth) / (bidDepth + askDepth);
```

---

## Market Anomaly Signals

| Signal | Condition | Threshold |
|--------|-----------|-----------|
| `HIGH_FUNDING` | `|annualizedRate| > 200%` | Extreme carry cost |
| `OI_EXPANSION` | OI > 2× rolling 7d avg | Unusual positioning |
| `VOL_SPIKE` | vol24h > 3× rolling 7d avg | Event-driven volume |
| `DEAD_MARKET` | vol24h < $500K | Thin, manipulable |
| `PREMIUM_DIVERGENCE` | `|premium| > 0.1%` | Basis arbitrage signal |
| `HIGH_OI_RATIO` | trade.usdSize / oiUsd > 5% | Large relative to market |

---

## OHLCV Metrics

```typescript
// From candleSnapshot: { t, T, o, h, l, c, v, n }
// v = volume in base coin; multiply by close price for USDC volume

// Historical volatility (20-period)
function historicalVol(candles: Candle[], period = 20): number {
  const returns = candles.slice(-period - 1).map((c, i, arr) => {
    if (i === 0) return 0;
    return Math.log(parseFloat(c.c) / parseFloat(arr[i - 1].c));
  }).slice(1);

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance * 365 * 24);  // annualized (assuming 1h candles)
}

// VWAP
function computeVWAP(candles: Candle[]): number {
  const totalVol = candles.reduce((s, c) => s + parseFloat(c.v), 0);
  const volWeighted = candles.reduce((s, c) => {
    const typical = (parseFloat(c.h) + parseFloat(c.l) + parseFloat(c.c)) / 3;
    return s + typical * parseFloat(c.v);
  }, 0);
  return volWeighted / totalVol;
}
```
