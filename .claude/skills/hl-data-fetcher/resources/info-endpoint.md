# Info Endpoint — Full Reference

Base URL: `https://api.hyperliquid.xyz`
All calls: `POST /info` · `Content-Type: application/json`
No authentication required.

---

## Market Data

### `allMids`
Current mid prices for all coins.
```json
// Request
{ "type": "allMids" }
// Response: { "BTC": "95230.5", "ETH": "3420.1", ... }
```

### `allPerpMetas` ⭐ preferred for coin lists
All perpetuals metadata **including HIP-3 pairs**. Use this when you only need coin names/metadata.
```json
// Request
{ "type": "allPerpMetas" }
// Response: [{ name, szDecimals, maxLeverage, onlyIsolated?, isDelisted? }, ...]
// isDelisted: true → pair removed from trading; filter before subscribing
// Includes HIP-3 DEX pairs not returned by metaAndAssetCtxs
```
**Always filter `isDelisted: true` before subscribing to WebSocket trades.**

### `metaAndAssetCtxs`
All perpetuals metadata + live market context. Use when you need market context (OI, funding, volume) alongside metadata.
```json
// Request
{ "type": "metaAndAssetCtxs" }
// Response: [meta, ctxArray]
// meta.universe[i]: { name, szDecimals, maxLeverage }
// ctxArray[i]: { funding, openInterest, prevDayPx, dayNtlVlm, markPx, midPx, premium, oiNtlVlm }
```
Coin `i` is shared between `meta.universe` and `ctxArray`. Does NOT include HIP-3 pairs.

### `l2Book`
Order book snapshot.
```json
{ "type": "l2Book", "coin": "BTC", "nSigFigs": 5 }
// Response: { "coin": "BTC", "time": ms, "levels": [[bids], [asks]] }
// Each level: { "px": "95000", "sz": "0.5", "n": 3 }
```

### `candleSnapshot`
OHLCV candles.
```json
{
  "type": "candleSnapshot",
  "req": { "coin": "BTC", "interval": "15m", "startTime": 1709500000000, "endTime": 1709600000000 }
}
// Intervals: "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "8h" | "12h" | "1d" | "3d" | "1w"
// Each: { t (openMs), T (closeMs), s (coin), i (interval), o, h, l, c, v (base), n (tradeCount) }
```

### `fundingHistory`
Historical 8-hour funding rates.
```json
{ "type": "fundingHistory", "coin": "BTC", "startTime": ms }
// Optional: "endTime": ms
// Each: { "coin", "fundingRate", "premium", "time" }
// fundingRate is per-interval (8h); annualize × 1095
```

### `perpDexFundingHistory`
Extended funding history (alternative endpoint).
```json
{ "type": "perpDexFundingHistory", "coin": "BTC", "startTime": ms }
```

---

## User Account Data

### `clearinghouseState`
Account margin summary + all open positions.
```json
{ "type": "clearinghouseState", "user": "0x..." }
// Response:
// marginSummary: { accountValue, totalNtlPos, totalRawUsd, totalMarginUsed }
// crossMarginSummary: same fields for cross-margin only
// assetPositions: [{ position: { coin, szi, entryPx, positionValue, returnOnEquity, liquidationPx, marginUsed, maxTradeSzs, cumFunding: { allTime, sinceOpen, sinceChange } }, type: "oneWay" }]
// withdrawable: string (USDC available to withdraw)
```

### `userFills`
Most recent fills (max 2 000). Use `userFillsByTime` for pagination.
```json
{ "type": "userFills", "user": "0x..." }
```

### `userFillsByTime`
Fills in time range — paginate backwards for up to 10k.
```json
{
  "type": "userFillsByTime",
  "user": "0x...",
  "startTime": 0,
  "endTime": 1709600000000,
  "aggregateByTime": true
}
// aggregateByTime: true → merge partial fills of same order (recommended)
// Max 2 000 per page. Paginate: endTime = min(page.time) - 1
// Each fill: { coin, px, sz, side, time, startPosition, dir, closedPnl, hash, oid, crossed, fee, tid, liquidation?, cloid? }
```

### `userNonFundingLedgerUpdates`
Deposit, withdrawal, send, reward history.
```json
{ "type": "userNonFundingLedgerUpdates", "user": "0x..." }
// Each: { delta: { type: 'deposit'|'withdraw'|'send'|'rewardsClaim'|'accountClassTransfer', usdc?, usdcValue?, amount?, user? }, time, hash }
// Key mapping:
//   deposit:  delta.usdc       = USDC amount string
//   send:     delta.usdcValue  = value string; delta.user = sender address
//   withdraw: delta.usdc       = USDC amount string
```

### `userFees`
Fee tier and rate info. **Use for MM/HFT detection.**
```json
{ "type": "userFees", "user": "0x..." }
// Response: { dailyUserVlm: [...], feeSchedule: {...}, userAddRate, userCrossRate, activeReferralDiscount, ... }
// userAddRate ≤ 0 → maker rebate tier → MM/HFT → skip inspection
```

### `userFunding`
Funding payment history.
```json
{ "type": "userFunding", "user": "0x...", "startTime": ms }
// Optional: "endTime": ms
// Each: { delta: { coin, fundingRate, szi, usdc }, time, hash }
```

### `userRateLimit`
Current rate limit status for a user.
```json
{ "type": "userRateLimit", "user": "0x..." }
// Response: { cumVlm, nRequestsUsed, nRequestsCap }
```

---

## Order & Trade Queries

### `openOrders`
All open resting orders.
```json
{ "type": "openOrders", "user": "0x..." }
// Each: { coin, side, limitPx, sz, oid, timestamp, origSz, cloid? }
```

### `frontendOpenOrders`
Open orders with extra frontend metadata (preferred for UI).
```json
{ "type": "frontendOpenOrders", "user": "0x..." }
```

### `orderStatus`
Status of a specific order by OID.
```json
{ "type": "orderStatus", "user": "0x...", "oid": 12345 }
// Response: { status: 'open'|'filled'|'canceled'|'triggered'|'rejected', order: {...} }
```

### `twapHistory`
Historical TWAP orders.
```json
{ "type": "twapHistory", "user": "0x..." }
```

---

## Analytics

### `leaderboard`
Top traders by PnL across time windows.
```json
{ "type": "leaderboard" }
// Response: { leaderboardRows: [{ ethAddress, accountValue, windowPerformances: [{period, pnl, roi, vlm}] }] }
// periods: 'day' | 'week' | 'month' | 'allTime'
```

### `spotDeployState`
Spot token deployment info.
```json
{ "type": "spotDeployState", "user": "0x..." }
```

---

## Pagination Pattern (Fills)

```
page 1: endTime = now         → returns [fills T=100..T=80]
page 2: endTime = 80 - 1 = 79 → returns [fills T=79..T=60]
...
stop when: page.length < 2000 OR total >= maxFills OR endTime <= 0
```

Max 10 000 fills practical limit (API cap + memory).
Always use 300 ms delay between pages to respect rate limits.

---

## Error Handling

```typescript
// Transient errors — retry once after 2s
const TRANSIENT = [429, 500, 502, 503, 504];

async function postInfo<T>(body: object, fallback: T): Promise<T> {
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return parse(text) as T;   // lossless-json parse
  } catch (e) {
    console.error(`Hyperliquid info error [${body.type}]`, e.message);
    return fallback;
  }
}
```

Common errors:
- `"User not found"` → address has no activity; treat as empty result
- `429` → rate limited; back off 5–10s
- Empty array `[]` → valid; address exists but no data in requested range
