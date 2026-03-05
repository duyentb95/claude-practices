---
name: hl-analytics
version: 1.0.0
description: >
  Analyze Hyperliquid market and trader data. Compute performance metrics,
  detect market anomalies, generate comparative reports.
  Use for: trader PnL analysis, market overview, funding rate analysis,
  leaderboard comparison, token deep-dive, statistical patterns.
  Keywords: analytics, PnL, performance, funding rate, OI, volume, leaderboard,
  win rate, drawdown, market snapshot, token analysis, trader stats.
complexity: 10/20
architecture: Pipeline
platforms: [claude-code]
updated: 2026-03-05
---

## Goal

Transform raw Hyperliquid API data into structured analytics:
trader performance metrics, market health indicators, and statistical summaries.
Produce Markdown reports or JSON datasets suitable for dashboards or strategy input.

## Core Capabilities

- **Trader stats** — PnL, win rate, volume, Sharpe, drawdown from fills
- **Market snapshot** — all perps sorted by volume / OI / funding
- **Funding analysis** — 8h funding cycles, annualized rates, historical trends
- **Leaderboard comparison** — day/week/month/allTime windows
- **Position analytics** — concentration, leverage distribution, margin health
- **Token deep-dive** — OHLCV, OI trend, funding history, large trader activity

---

## Instructions

### Phase 1 — Scope

Determine the analytics request type:

| Request | Data needed | Output |
|---------|------------|--------|
| Trader performance | fills (all-time paginated) + state | trader-stats.json / .md |
| Market overview | metaAndAssetCtxs + allMids | market-snapshot.md |
| Token deep-dive | candleSnapshot + fundingHistory + l2Book | {TOKEN}-analysis.md |
| Leaderboard | leaderboard | leaderboard-{window}.md |
| Funding opportunities | metaAndAssetCtxs (all coins) | funding-screener.md |

---

### Phase 2 — Trader Performance Metrics

**Data source:** `userFillsByTime` (paginated, 10k) + `clearinghouseState`

```typescript
interface TraderStats {
  address:      string;
  period:       string;          // '30d' | '90d' | 'allTime'
  totalPnl:     number;          // sum closedPnl (all fills)
  realizedPnl:  number;          // sum closedPnl (closed positions only)
  unrealizedPnl: number;         // from clearinghouseState positions
  totalVolume:  number;          // sum |sz * px|
  tradeCount:   number;          // fill count
  winRate:      number;          // winning_trades / total_closed_trades
  avgWin:       number;          // avg profit of winning trades
  avgLoss:      number;          // avg loss of losing trades
  profitFactor: number;          // totalProfit / |totalLoss|
  maxDrawdown:  number;          // peak-to-trough on running PnL
  sharpeApprox: number;          // mean(dailyReturn) / std(dailyReturn) * sqrt(365)
  coinsTraded:  string[];        // unique coins
  fundingPaid:  number;          // sum funding payments (from separate fundingHistory call)
}
```

**Computation pattern:**

```typescript
// Aggregate fills
const fills = await getUserFillsPaginated(address, 10_000);

// Filter by period
const since = Date.now() - days * 86_400_000;
const periodFills = fills.filter(f => f.time >= since);

// Win rate (closed positions only — has non-zero closedPnl)
const closed = periodFills.filter(f => parseFloat(f.closedPnl) !== 0);
const wins   = closed.filter(f => parseFloat(f.closedPnl) > 0);
const winRate = closed.length > 0 ? wins.length / closed.length : null;

// Running PnL for drawdown
let runningPnl = 0, peak = 0, maxDD = 0;
for (const f of periodFills.sort((a, b) => a.time - b.time)) {
  runningPnl += parseFloat(f.closedPnl);
  if (runningPnl > peak) peak = runningPnl;
  const dd = peak - runningPnl;
  if (dd > maxDD) maxDD = dd;
}

// Daily returns for Sharpe (bucket by day)
const byDay = groupBy(periodFills, f => Math.floor(f.time / 86_400_000));
const dailyPnl = Object.values(byDay).map(day =>
  day.reduce((s, f) => s + parseFloat(f.closedPnl), 0),
);
const mean = dailyPnl.reduce((a, b) => a + b, 0) / dailyPnl.length;
const std  = Math.sqrt(dailyPnl.map(d => (d - mean) ** 2).reduce((a, b) => a + b, 0) / dailyPnl.length);
const sharpe = std > 0 ? (mean / std) * Math.sqrt(365) : 0;
```

---

### Phase 3 — Market Snapshot

**Data source:** `metaAndAssetCtxs` + `allMids`

```typescript
// Sort and classify all perps
const coins = meta.universe.map((u, i) => ({
  name:       u.name,
  szDecimals: u.szDecimals,
  maxLev:     u.maxLeverage,
  midPx:      parseFloat(mids[u.name]),
  markPx:     parseFloat(ctxs[i].markPx),
  funding:    parseFloat(ctxs[i].funding),         // hourly rate
  fundingAnn: parseFloat(ctxs[i].funding) * 8760,  // annualized
  openInterest: parseFloat(ctxs[i].openInterest),
  oiUsd:      parseFloat(ctxs[i].oiNtlVlm),
  vol24h:     parseFloat(ctxs[i].dayNtlVlm),
  premium:    parseFloat(ctxs[i].premium),
}));

// Tier classification (matches insider-scanner thresholds)
function getTier(vol24h: number, name: string): string {
  if (['BTC', 'ETH', 'SOL'].includes(name) || vol24h > 100_000_000) return 'BLUECHIP';
  if (vol24h > 10_000_000)  return 'MID_CAP';
  if (vol24h > 500_000)     return 'LOW_CAP';
  return 'MICRO_CAP';
}
```

**Market anomaly signals:**

| Signal | Condition | Action |
|--------|-----------|--------|
| Extreme funding | `|fundingAnn| > 200%` | Flag `HIGH_FUNDING` |
| OI spike | OI > 2× 7d avg | Flag `OI_EXPANSION` |
| Volume spike | vol24h > 3× 7d avg | Flag `VOL_SPIKE` |
| Thin market | vol24h < $500K | Flag `DEAD_MARKET` |
| Basis premium | `|premium| > 0.1%` | Flag `PREMIUM_DIVERGENCE` |

---

### Phase 4 — Funding Rate Analysis

**Data source:** `fundingHistory` per coin

```typescript
// 8-hour funding intervals
const history = await postInfo({
  type: 'fundingHistory',
  coin: 'BTC',
  startTime: Date.now() - 30 * 86_400_000,
});

// Each entry: {coin, fundingRate, premium, time}
// funding is per-interval (8h); annualize × 1095 (365 × 3)
const annualized = history.map(h => ({
  time: h.time,
  rate: parseFloat(h.fundingRate),
  rateAnn: parseFloat(h.fundingRate) * 1095,
  premium: parseFloat(h.premium),
}));

// Funding arbitrage: short when annualized > 100% (pay 100%/yr, collect spot yield)
const arbitrageOpportunities = coins
  .filter(c => Math.abs(c.fundingAnn) > 1.0)   // > 100% annualized
  .sort((a, b) => Math.abs(b.fundingAnn) - Math.abs(a.fundingAnn));
```

---

### Phase 5 — Leaderboard Analysis

**Data source:** `leaderboard`

```typescript
const board = await postInfo({ type: 'leaderboard' });

// Normalize to structured rows
const rows = board.leaderboardRows.map(r => ({
  address:    r.ethAddress,
  accountValue: parseFloat(r.accountValue),
  performances: Object.fromEntries(
    r.windowPerformances.map(w => [w.period, {
      pnl:    parseFloat(w.pnl),
      roi:    parseFloat(w.roi),
      volume: parseFloat(w.vlm),
    }])
  ),
}));

// Top traders by metric
const topByPnl   = rows.sort((a, b) => b.performances.week.pnl - a.performances.week.pnl).slice(0, 20);
const topByRoi   = rows.sort((a, b) => b.performances.month.roi - a.performances.month.roi).slice(0, 20);
const megaWhales = rows.filter(r => r.accountValue > 1_000_000);
```

---

### Phase 6 — Token Deep-Dive

**Data sources:** `candleSnapshot` + `fundingHistory` + `l2Book` + `userFills` of large traders

```typescript
// OHLCV analysis
const candles = await postInfo({
  type: 'candleSnapshot',
  req: { coin: 'BTC', interval: '1h', startTime: weekAgo, endTime: now },
});

// Compute from candles:
const volatility = computeHistVol(candles, 24);   // 24h rolling HV
const vwap = computeVWAP(candles);
const trendStrength = computeADX(candles, 14);

// Order book depth
const book = await postInfo({ type: 'l2Book', coin: 'BTC', nSigFigs: 5 });
const bidDepth = book.levels[0].slice(0, 10).reduce((s, l) => s + parseFloat(l.sz) * parseFloat(l.px), 0);
const askDepth = book.levels[1].slice(0, 10).reduce((s, l) => s + parseFloat(l.sz) * parseFloat(l.px), 0);
const imbalance = (bidDepth - askDepth) / (bidDepth + askDepth);   // -1 to +1
```

---

### Phase 7 — Output

Save to appropriate path based on analysis type:

| Type | Path |
|------|------|
| Trader stats | `data/analysis/traders/{address}-{YYYYMMDD}.json` |
| Market snapshot | `data/analysis/market/snapshot-{YYYYMMDD}.json` |
| Token deep-dive | `reports/investigations/{TOKEN}-{YYYYMMDD}.md` |
| Leaderboard | `data/analysis/leaderboard/{window}-{YYYYMMDD}.json` |
| Funding screener | `reports/daily/{YYYYMMDD}-funding.md` |

**Standard report header:**

```markdown
## Analytics: {SUBJECT} — {YYYY-MM-DD HH:MM UTC+7}

### Summary
{1-3 sentence verdict with key numbers}

### Key Metrics
| Metric | Value | vs Baseline |
|--------|-------|-------------|
...

### Data Sources
- {timestamp} `metaAndAssetCtxs` — {N} coins
- {timestamp} `userFillsByTime` — {N} fills ({from} → {to})
```

---

## Constraints

1. **lossless-json**: always parse Hyperliquid responses with `lossless-json.parse()`
2. **Min closed positions**: require ≥ 10 closed fills to compute win rate / Sharpe
3. **Win rate**: only count fills with `closedPnl ≠ 0` (open fills have closedPnl = 0)
4. **Funding annualization**: hourly rate × 8760; per-interval rate × 1095
5. **OI in USD**: use `oiNtlVlm` field, not `openInterest × markPx` (already USD)
6. **Rate limit**: 1 100 ms between REST calls
7. **Period clarity**: always state analysis period in report header (e.g. "last 30 days")
8. **Unrealized PnL**: from `clearinghouseState.assetPositions`, not from fills
9. **Copin link**: always include `https://app.copin.io/trader/{address}/HYPERLIQUID`

---

## Examples

### Example 1 — Trader Performance Report

```
Input: wallet address 0xabc..., last 30 days

1. getUserFillsPaginated(address, 10_000) → all-time fills
2. Filter to last 30 days
3. clearinghouseState → unrealized PnL + open positions
4. fundingHistory (each open position coin, 30d) → funding paid
5. Compute: totalPnl, winRate, maxDrawdown, sharpe, tradeCount, volume
6. Output: data/analysis/traders/0xabc-20260305.json
7. Generate: reports/investigations/0xabc-20260305.md
```

### Example 2 — Funding Rate Screener

```
Input: "find best funding opportunities right now"

1. metaAndAssetCtxs → all coins with live funding rates
2. annualize: rate × 8760 for each coin
3. Sort descending by |fundingAnn|
4. Filter: |fundingAnn| > 50% (high opportunity)
5. For top 10: fetch fundingHistory (7d) to check trend
6. Output funding-screener table:
   | Coin | Hourly | Annualized | Trend | Long/Short Pays |
   |------|--------|-----------|-------|----------------|
   | HYPE | +0.01% | +87.6%    | ↑     | Long pays short |
7. Save: reports/daily/20260305-funding.md
```

### Example 3 — Market Overview

```
Input: "market snapshot"

1. metaAndAssetCtxs → all coins
2. allMids → current prices
3. Sort by dayNtlVlm desc → top 20 by volume
4. Flag anomalies: extreme funding, OI spikes, thin markets
5. Output markdown table:
   | Rank | Coin | Price | 24h Vol | OI (USD) | Funding (Ann) | Flags |
   |------|------|-------|---------|----------|--------------|-------|
6. Save: data/analysis/market/snapshot-20260305.json
```
