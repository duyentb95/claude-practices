# Hyperliquid API Reference — Insider Detection

Base URL: `https://api.hyperliquid.xyz`
All requests: `POST /info` with JSON body
Rate limit: ~1 200 req/min → use **1 100 ms sequential queue** in production

---

## Endpoints Used in Detection

### 1. `userFees` — MM/HFT Layer 1 Filter

```json
{ "type": "userFees", "user": "0x..." }
```

Response:
```json
{ "userCrossRate": "0.00035", "userAddRate": "0.0001" }
```

**Rule**: if `userAddRate ≤ 0` → market maker rebate tier → **skip inspection, flag HFT**
Cache result 24 hours per address.

---

### 2. `userNonFundingLedgerUpdates` — Deposit / Send History

```json
{ "type": "userNonFundingLedgerUpdates", "user": "0x..." }
```

Response: array of `LedgerUpdateDto`, sorted newest first.

```json
[
  {
    "time": 1709640000000,
    "hash": "0xabc...",
    "delta": {
      "type": "deposit",
      "usdc": "250000.0",
      "nonce": 123,
      "fee": 0
    }
  },
  {
    "time": 1709620000000,
    "hash": "0xdef...",
    "delta": {
      "type": "send",
      "amount": "100000.0",
      "usdcValue": "100000.0",
      "token": "USDC",
      "user": "0xcontroller...",
      "destination": "0xtarget..."
    }
  }
]
```

**Amount field by type:**

| `delta.type` | Amount field | Notes |
|-------------|-------------|-------|
| `deposit` | `delta.usdc` | On-chain deposit |
| `send` (incoming) | `delta.usdcValue` or `delta.amount` | Spot→perp internal transfer |
| `withdraw` | `delta.usdc` | Withdrawal |
| `internalTransfer` | varies | Cross-vault |

**Normalization**: `parseFloat(delta.usdc || delta.usdcValue || delta.amount || '0')`

---

### 3. `userFillsByTime` — Paginated Fill History

```json
{
  "type": "userFillsByTime",
  "user": "0x...",
  "startTime": 0,
  "endTime": 1709640000000,
  "aggregateByTime": true
}
```

- Max **2 000** records per response
- Only the **10 000 most recent** fills are available in total
- `aggregateByTime: true` → combines partial fills of same order (recommended for scoring)

**Pagination pattern** (get up to 10k):
```typescript
let endTime = Date.now();
const all: HyperFillDto[] = [];

while (all.length < 10_000) {
  const page = await postInfo({ type: 'userFillsByTime', user, startTime: 0,
                                endTime, aggregateByTime: true });
  if (!page || page.length === 0) break;
  all.push(...page);
  if (page.length < 2000) break;                     // last page
  endTime = Math.min(...page.map(f => f.time)) - 1;  // paginate backwards
  if (endTime <= 0) break;
  await sleep(300);  // polite delay between pages
}
```

Fill record fields:
```typescript
interface HyperFillDto {
  coin: string;       // "BTC"
  px: string;         // fill price
  sz: string;         // fill size (base token)
  side: string;       // "B" (buy) | "A" (sell/ask)
  time: number;       // Unix ms
  startPosition: string;
  dir: string;        // "Open Long" | "Close Long" | "Open Short" | "Close Short"
  closedPnl: string;  // realized PnL (non-zero for closing fills)
  hash: string;
  oid: number;        // order ID
  crossed: boolean;
  fee: string;
  tid: number;
  feeToken: string;
}
```

---

### 4. `clearinghouseState` — Margin & Positions

```json
{ "type": "clearinghouseState", "user": "0x..." }
```

Response:
```json
{
  "marginSummary": {
    "accountValue": "248320.55",
    "totalNtlPos": "240000.0",
    "totalRawUsd": "248320.55",
    "totalMarginUsed": "230000.0"
  },
  "crossMaintenanceMarginUsed": "2300.0",
  "withdrawable": "18320.55",
  "assetPositions": [...]
}
```

Key derived values:
- `marginUtil = totalMarginUsed / accountValue`
- `impliedLev  = trade.usdSize / accountValue`

---

### 5. `metaAndAssetCtxs` — All Coins Market Data

```json
{ "type": "metaAndAssetCtxs" }
```

Response: `[{universe: PerpMetaDto[]}, AssetCtxDto[]]`

Used for dynamic coin tier thresholds:
```typescript
interface AssetCtxDto {
  funding: string;
  openInterest: string;   // base token quantity
  prevDayPx: string;
  dayNtlVlm: string;      // 24h notional volume USD
  markPx: string;
  midPx: string;
}
```

**Coin tier thresholds** (minimum trade USD to inspect):

| Condition | Threshold | Tier |
|-----------|----------:|------|
| BTC/ETH/SOL or `dayNtlVlm > $100M` | $500 000 | BLUECHIP |
| `dayNtlVlm > $10M` | $100 000 | MID_CAP |
| `dayNtlVlm > $500K` | $30 000 | LOW_CAP |
| else | $10 000 | MICRO_CAP |

Refreshed every hour via `@Interval()` in `WsScannerService`.

---

## Error Handling

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 429 | Rate limit exceeded | Wait 2s, retry once; then log error and return fallback |
| 5xx | Server error | Retry once after 1s |
| Timeout (>17s) | Network issue | Return fallback value (empty array `[]` or `null`) |

All calls wrapped in try/catch; failures return configured fallback, never throw.

**lossless-json** is required for parsing — standard `JSON.parse` loses precision on large integers (e.g., order IDs, timestamps in some Hyperliquid responses).

---

## WebSocket — Trade Feed

```
wss://api.hyperliquid.xyz/ws
```

Subscribe to all perp coins:
```json
{ "method": "subscribe", "subscription": { "type": "trades", "coin": "BTC" } }
```

Trade message structure:
```typescript
interface RawTrade {
  coin: string;
  side: 'B' | 'A';
  px: string;
  sz: string;
  hash: string;
  time: number;
  tid: number;
  users: [string, string];  // [buyer_address, seller_address]
}
```

Both `users[0]` (buyer) and `users[1]` (seller) are tracked independently via sliding-window aggregation.
