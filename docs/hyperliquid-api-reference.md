# Hyperliquid API Reference

> Kết hợp từ official docs + source code thực tế trong monorepo này.
> Last updated: 2026-03-05

---

## Mục lục

- [Tổng quan](#tổng-quan)
- [Info Endpoint — Đọc dữ liệu](#info-endpoint)
  - [Market Data](#market-data)
  - [User Account Data](#user-account-data)
  - [Ledger & History](#ledger--history)
  - [Analytics & Fees](#analytics--fees)
- [Exchange Endpoint — Trading](#exchange-endpoint)
  - [Authentication & Signing](#authentication--signing)
  - [Order Management](#order-management)
  - [Leverage & Margin](#leverage--margin)
  - [Transfers & Withdrawals](#transfers--withdrawals)
  - [Advanced Features](#advanced-features)
- [WebSocket — Real-time Streaming](#websocket)
  - [Subscription Types](#subscription-types)
  - [Trade Message Format](#trade-message-format)
  - [Connection Management](#connection-management)
- [Rate Limits](#rate-limits)
- [Data Types & DTOs](#data-types--dtos)
- [Implementation Patterns](#implementation-patterns)

---

## Tổng quan

| Endpoint | URL | Dùng cho |
|----------|-----|---------|
| Info (REST) | `https://api.hyperliquid.xyz/info` | Đọc dữ liệu (read-only) |
| Exchange (REST) | `https://api.hyperliquid.xyz/exchange` | Trading, transfers (requires signature) |
| WebSocket | `wss://api.hyperliquid.xyz/ws` | Real-time feeds |
| Testnet Info | `https://api.hyperliquid-testnet.xyz/info` | |
| Testnet WS | `wss://api.hyperliquid-testnet.xyz/ws` | |

**Headers bắt buộc:** `Content-Type: application/json`

**Lưu ý quan trọng:**
- Tất cả Info calls: `POST /info` với JSON body
- Asset ID: Perpetuals dùng coin name (e.g. `"BTC"`); Spot dùng `"PURR/USDC"` hoặc `"@{index}"`
- `userFills` trả tối đa 2000 records; dùng `userFillsByTime` + pagination để lấy nhiều hơn
- Dùng `lossless-json` khi parse response — standard `JSON.parse` mất precision trên số lớn

---

## Info Endpoint

### Market Data

#### `allMids` — Mid prices tất cả coins

```json
// Request
{ "type": "allMids" }

// Response
{ "BTC": "95230.5", "ETH": "3420.1", "SOL": "185.2", ... }
```

---

#### `metaAndAssetCtxs` — Metadata + live market context

```json
// Request
{ "type": "metaAndAssetCtxs" }

// Response: [metaObject, ctxArray]
[
  { "universe": [{ "name": "BTC", "szDecimals": 5, "maxLeverage": 50 }, ...] },
  [
    {
      "funding": "0.000012",      // hourly funding rate
      "openInterest": "4523.12",  // base coin quantity
      "prevDayPx": "94100.0",
      "dayNtlVlm": "1234567890",  // 24h notional volume USD
      "markPx": "95230.5",
      "midPx": "95231.0",
      "premium": "0.0001",
      "oiNtlVlm": "430000000"     // OI in USD
    },
    ...
  ]
]
```

**Coin tier thresholds** (dùng trong insider-scanner):

| `dayNtlVlm` | Min trade USD | Tier |
|-------------|--------------|------|
| BTC/ETH/SOL hoặc > $100M | $500 000 | BLUECHIP |
| > $10M | $100 000 | MID_CAP |
| > $500K | $30 000 | LOW_CAP |
| else | $10 000 | MICRO_CAP |

---

#### `l2Book` — Order book snapshot

```json
// Request
{ "type": "l2Book", "coin": "BTC", "nSigFigs": 5 }
// nSigFigs: optional, 2-5 (rounding significant figures)
// Alternative: "mantissa": 2 for rounding by mantissa

// Response
{
  "coin": "BTC",
  "time": 1709640000000,
  "levels": [
    [{"n": 3, "px": "95220.0", "sz": "0.5"}],   // bids (index 0)
    [{"n": 2, "px": "95240.0", "sz": "0.3"}]    // asks (index 1)
  ]
}
// Max 20 levels per side; n = number of orders at this level
```

---

#### `candleSnapshot` — OHLCV candles

```json
// Request
{
  "type": "candleSnapshot",
  "req": {
    "coin": "BTC",
    "interval": "15m",
    "startTime": 1709500000000,
    "endTime": 1709640000000
  }
}
// Intervals: "1m" "3m" "5m" "15m" "30m" "1h" "2h" "4h" "8h" "12h" "1d" "3d" "1w" "1M"
// Max 5000 candles per response

// Response: array of candles
[
  {
    "t": 1709500800000,   // open time ms
    "T": 1709500860000,   // close time ms
    "s": "BTC",
    "i": "15m",
    "o": "95100.0",       // open
    "c": "95230.5",       // close
    "h": "95280.0",       // high
    "l": "95080.0",       // low
    "v": "123.45",        // volume (base coin)
    "n": 847              // number of trades
  }
]
```

---

### User Account Data

#### `clearinghouseState` — Margin summary + positions

```json
// Request
{ "type": "clearinghouseState", "user": "0x..." }

// Response
{
  "marginSummary": {
    "accountValue": "248320.55",
    "totalNtlPos": "240000.0",
    "totalRawUsd": "248320.55",
    "totalMarginUsed": "230000.0"
  },
  "crossMaintenanceMarginUsed": "2300.0",
  "withdrawable": "18320.55",
  "assetPositions": [
    {
      "position": {
        "coin": "BTC",
        "szi": "0.5",              // signed size (+ long, - short)
        "entryPx": "94000.0",
        "positionValue": "47615.25",
        "unrealizedPnl": "615.25",
        "returnOnEquity": "0.013",
        "liquidationPx": "87000.0",
        "marginUsed": "4761.5",
        "leverage": { "type": "cross", "value": 10 },
        "cumFunding": {
          "allTime": "120.5",
          "sinceOpen": "12.3",
          "sinceChange": "5.1"
        },
        "maxLeverage": 50
      },
      "type": "oneWay"
    }
  ]
}
```

**Key formulas:**
```
marginUtil    = totalMarginUsed / accountValue
impliedLev    = trade.usdSize / accountValue
positionValue = |szi| × markPx
```

---

#### `openOrders` — Active orders

```json
// Request
{ "type": "openOrders", "user": "0x..." }
// With all DEXs: { "type": "openOrders", "user": "0x...", "dex": "ALL_DEXS" }

// Response: array of orders
[
  {
    "coin": "BTC",
    "side": "B",           // B=buy, A=sell
    "limitPx": "94000.0",
    "sz": "0.1",
    "oid": 123456789,
    "timestamp": 1709640000000,
    "origSz": "0.1",
    "cloid": "0xabc...",   // optional client order ID
    "reduceOnly": false
  }
]
```

#### `frontendOpenOrders` — Orders with full metadata

```json
// Request
{ "type": "frontendOpenOrders", "user": "0x..." }

// Response includes extra fields vs openOrders:
// orderType, tif, triggerPx, tpsl, isPositionTpsl
```

---

#### `orderStatus` — Check specific order

```json
// By order ID
{ "type": "orderStatus", "user": "0x...", "oid": 123456789 }

// By client order ID
{ "type": "orderStatus", "user": "0x...", "oid": "0xcloid..." }

// Response statuses: "open" | "filled" | "cancelled" | "triggered" |
// "rejected" | "marginCancelled" | "oracleRejected" | ...
```

---

### Ledger & History

#### `userFills` — Trade history (up to 2000 recent)

```json
// Request
{ "type": "userFills", "user": "0x..." }

// Response
[
  {
    "coin": "BTC",
    "px": "95230.5",
    "sz": "0.1",
    "side": "B",              // B=buy, A=sell
    "time": 1709640000000,
    "startPosition": "0.0",
    "dir": "Open Long",       // Open Long|Close Long|Open Short|Close Short|Short > Long|Long > Short
    "closedPnl": "0.0",       // non-zero for closing fills
    "hash": "0xabc...",
    "oid": 123456789,
    "crossed": true,          // true = taker
    "fee": "9.52",
    "tid": 999888777,
    "feeToken": "USDC"
  }
]
```

#### `userFillsByTime` — Fills trong time range (paginated)

```json
// Request
{
  "type": "userFillsByTime",
  "user": "0x...",
  "startTime": 1709500000000,
  "endTime": 1709640000000,
  "aggregateByTime": true     // true = gộp partial fills cùng order
}
// Max 2000 per response; max 10000 most recent fills available total
```

**Pagination pattern để lấy 10k:**

```typescript
async function getAllFills(address: string, maxFills = 10_000): Promise<Fill[]> {
  const PAGE_SIZE = 2_000;
  const all: Fill[] = [];
  let endTime = Date.now();

  while (all.length < maxFills) {
    const page = await postInfo({
      type: 'userFillsByTime',
      user: address,
      startTime: 0,
      endTime,
      aggregateByTime: true,
    });

    if (!page?.length) break;
    all.push(...page);
    if (page.length < PAGE_SIZE) break;

    // Paginate backwards: next endTime = earliest in this page - 1ms
    endTime = Math.min(...page.map(f => f.time)) - 1;
    if (endTime <= 0) break;

    await sleep(300); // 300ms between pages
  }

  return all.slice(0, maxFills);
}
```

---

#### `userNonFundingLedgerUpdates` — Deposits, withdrawals, transfers

```json
// Request
{ "type": "userNonFundingLedgerUpdates", "user": "0x..." }

// Response: array sorted newest first
[
  {
    "time": 1709640000000,
    "hash": "0xabc...",
    "delta": {
      "type": "deposit",
      "usdc": "250000.0",
      "nonce": 123,
      "fee": 0,
      "toPerp": true
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
      "user": "0xcontroller...",  // sender address
      "destination": "0xtarget..."
    }
  }
]
```

**Delta type mapping:**

| `type` | Amount field | Meaning |
|--------|-------------|---------|
| `deposit` | `usdc` | On-chain bridge deposit |
| `withdraw` | `usdc` | Bridge withdrawal |
| `send` | `usdcValue` or `amount` | Spot→perp internal transfer |
| `internalTransfer` | varies | Cross-vault |
| `subAccountTransfer` | varies | Sub-account funding |
| `rewardsClaim` | `usdc` | Staking/referral rewards |

**Normalization:** `parseFloat(delta.usdc || delta.usdcValue || delta.amount || '0')`

---

#### `userFunding` — Funding payments

```json
// Request
{
  "type": "userFunding",
  "user": "0x...",
  "startTime": 1709500000000,
  "endTime": 1709640000000
}

// Response
[
  {
    "time": 1709560800000,
    "coin": "BTC",
    "usdc": "-12.34",      // negative = paid, positive = received
    "szi": "0.5",          // position size when payment occurred
    "fundingRate": "0.0001"
  }
]
```

---

#### `historicalOrders` — Completed orders

```json
// Request
{ "type": "historicalOrders", "user": "0x..." }
// Returns up to 2000 most recent
```

---

### Analytics & Fees

#### `userFees` — Fee tier + MM/HFT detection

```json
// Request
{ "type": "userFees", "user": "0x..." }

// Response
{
  "userCrossRate": "0.00035",  // taker fee rate
  "userAddRate": "0.0001",     // maker fee rate
  // userAddRate <= 0 → maker rebate tier = Market Maker / HFT → SKIP inspection
  "dailyUserVlm": [...],
  "feeSchedule": {...},
  "activeReferralDiscount": 0,
  "trialEndDate": null
}
```

**Rule:** `parseFloat(userAddRate) <= 0` → trader is in maker-rebate tier → Market Maker / HFT.

---

#### `portfolioSnapshot` — Equity curve

```json
// Request
{ "type": "portfolioSnapshot", "user": "0x..." }

// Response: [[timestamp, {pnl, accountValue}], ...]
[[1709640000000, {"pnl": "1234.56", "accountValue": "51234.56"}], ...]
```

---

#### `leaderboard` — Public leaderboard

```json
// Request
{ "type": "leaderboard", "req": { "window": "day" } }
// window: "day" | "week" | "month" | "allTime"

// Response
{
  "leaderboardRows": [
    {
      "ethAddress": "0x...",
      "accountValue": "1234567.89",
      "windowPnl": "123456.78",
      "allTimePnl": "987654.32",
      "vlm": "98765432.10",
      "prize": null
    }
  ]
}
```

---

#### `subAccounts` — Sub-account listing

```json
// Request
{ "type": "subAccounts", "user": "0x..." }

// Response: array of sub-accounts with their margin summary + spot balances
```

---

## Exchange Endpoint

### Authentication & Signing

**Tất cả exchange calls** cần:
1. `nonce` — Unix timestamp in milliseconds (must be increasing)
2. `signature` — EIP-712 signature
3. Optional: `vaultAddress` khi thay mặt sub-account/vault

**Request structure:**
```json
{
  "action": { "type": "...", ...params },
  "nonce": 1709640000000,
  "signature": { "r": "0x...", "s": "0x...", "v": 28 },
  "vaultAddress": "0x...",     // optional: sign for sub-account
  "expiresAfter": 1709640060000 // optional: auto-cancel if not processed by this time
}
```

**Note:** Sub-accounts và vaults không có private key. Master account phải sign với `vaultAddress` = địa chỉ sub-account/vault.

---

### Order Management

#### Place Order

```json
{
  "action": {
    "type": "order",
    "orders": [{
      "a": 0,              // asset index (từ metaAndAssetCtxs universe)
      "b": true,           // isBuy
      "p": "95000.0",      // price (string)
      "s": "0.1",          // size (string, base coin)
      "r": false,          // reduceOnly
      "t": {
        "limit": { "tif": "Gtc" }
        // hoặc trigger order:
        // "trigger": { "isMarket": false, "triggerPx": "94000.0", "tpsl": "sl" }
      },
      "c": "0xabcdef..."   // optional client order ID (hex, 16 bytes)
    }],
    "grouping": "na",      // "na" | "normalTpsl" | "positionTpsl"
    "builder": { "b": "0xbuilder...", "f": 10 }  // optional, f = fee in 0.1bps
  },
  "nonce": 1709640000000,
  "signature": {...}
}
```

**Time-in-Force (tif):**
| Value | Meaning |
|-------|---------|
| `Gtc` | Good Till Cancelled |
| `Alo` | Add Liquidity Only (post-only) |
| `Ioc` | Immediate Or Cancel |

**Response:**
```json
{
  "status": "ok",
  "response": {
    "type": "order",
    "data": {
      "statuses": [
        { "resting": { "oid": 123456789 } }        // limit order resting
        // hoặc:
        // { "filled": { "totalSz": "0.1", "avgPx": "95010.0", "oid": 123456789 } }
        // hoặc:
        // { "error": "Insufficient margin" }
      ]
    }
  }
}
```

---

#### Cancel Order

```json
// By oid
{
  "action": {
    "type": "cancel",
    "cancels": [{ "a": 0, "o": 123456789 }]
  },
  "nonce": 1709640000000,
  "signature": {...}
}

// By client order ID
{
  "action": {
    "type": "cancelByCloid",
    "cancels": [{ "asset": 0, "cloid": "0xabcdef..." }]
  },
  "nonce": 1709640000000,
  "signature": {...}
}
```

---

#### Modify Order

```json
{
  "action": {
    "type": "modify",
    "oid": 123456789,        // hoặc "0xcloid..."
    "order": {
      "a": 0, "b": true, "p": "94500.0", "s": "0.15",
      "r": false, "t": { "limit": { "tif": "Gtc" } }
    }
  },
  "nonce": 1709640000000,
  "signature": {...}
}
```

---

#### TWAP Order

```json
{
  "action": {
    "type": "twapOrder",
    "twap": {
      "a": 0,           // asset
      "b": true,        // isBuy
      "s": "1.0",       // total size
      "r": false,       // reduceOnly
      "m": 60,          // duration in minutes
      "t": true         // randomize timing
    }
  },
  "nonce": 1709640000000,
  "signature": {...}
}

// Response
{ "status": "ok", "response": { "type": "twapOrder", "data": { "status": { "running": { "twapId": 42 } } } } }
```

---

### Leverage & Margin

#### Update Leverage

```json
{
  "action": {
    "type": "updateLeverage",
    "asset": 0,
    "isCross": true,
    "leverage": 10
  },
  "nonce": 1709640000000,
  "signature": {...}
}
```

#### Update Isolated Margin

```json
{
  "action": {
    "type": "updateIsolatedMargin",
    "asset": 0,
    "isBuy": true,
    "ntli": 1000000000  // amount with 6 decimals (1000 USDC = 1000000000)
  },
  "nonce": 1709640000000,
  "signature": {...}
}
```

---

### Transfers & Withdrawals

#### USDC Transfer (spot→perp hoặc address→address)

```json
// Spot ↔ Perp
{
  "action": {
    "type": "usdClassTransfer",
    "hyperliquidChain": "Mainnet",
    "signatureChainId": "0xa4b1",
    "amount": "1000.0",
    "toPerp": true,    // true: spot→perp, false: perp→spot
    "nonce": 1709640000000
  },
  "nonce": 1709640000000,
  "signature": {...}
}

// Send USDC to another address
{
  "action": {
    "type": "usdSend",
    "hyperliquidChain": "Mainnet",
    "signatureChainId": "0xa4b1",
    "destination": "0x...",
    "amount": "1000.0",
    "time": 1709640000000
  },
  "nonce": 1709640000000,
  "signature": {...}
}
```

#### Withdraw (Bridge out)

```json
{
  "action": {
    "type": "withdraw3",
    "hyperliquidChain": "Mainnet",
    "signatureChainId": "0xa4b1",
    "amount": "1000.0",
    "destination": "0xEVM...",
    "time": 1709640000000
  },
  "nonce": 1709640000000,
  "signature": {...}
}
// ~5 phút finalize, phí $1
```

---

### Advanced Features

#### Schedule Cancel (Dead Man's Switch)

```json
{
  "action": {
    "type": "scheduleCancel",
    "time": 1709640060000  // hủy tất cả orders tại thời điểm này
    // Bỏ "time" để xóa scheduled cancel
  },
  "nonce": 1709640000000,
  "signature": {...}
}
// Constraints: time phải > now + 5s; max 10 triggers/24h (reset UTC)
```

#### Approve API Wallet (Agent)

```json
{
  "action": {
    "type": "approveAgent",
    "hyperliquidChain": "Mainnet",
    "signatureChainId": "0xa4b1",
    "agentAddress": "0x...",
    "agentName": "my-bot",  // optional
    "nonce": 1709640000000
  },
  "nonce": 1709640000000,
  "signature": {...}
}
// Limits: 1 unnamed + 3 named agents per account; 2 extra named per subaccount
```

---

## WebSocket

### Connection

```typescript
import WebSocket = require('ws');  // QUAN TRỌNG: dùng require, không phải named import

const ws = new WebSocket('wss://api.hyperliquid.xyz/ws');

ws.on('open', () => {
  // Subscribe to channels
  ws.send(JSON.stringify({
    method: 'subscribe',
    subscription: { type: 'trades', coin: 'BTC' }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.channel === 'trades') {
    handleTrades(msg.data);
  }
});

// Keepalive
setInterval(() => ws.send(JSON.stringify({ method: 'ping' })), 20_000);
```

### Subscription Types

#### `trades` — Real-time trades

```json
// Subscribe
{ "method": "subscribe", "subscription": { "type": "trades", "coin": "BTC" } }

// Message
{
  "channel": "trades",
  "data": [
    {
      "coin": "BTC",
      "side": "B",           // B=buyer aggressor, A=seller aggressor
      "px": "95230.5",
      "sz": "0.5",
      "hash": "0xabc...",
      "time": 1709640000000,
      "tid": 999888777,
      "users": ["0xbuyer...", "0xseller..."]
    }
  ]
}
```

#### `l2Book` — Live order book

```json
{ "method": "subscribe", "subscription": { "type": "l2Book", "coin": "BTC" } }
// Response: same as REST l2Book
```

#### `allMids` — Mid price updates

```json
{ "method": "subscribe", "subscription": { "type": "allMids" } }
```

#### `userEvents` — Account events

```json
{ "method": "subscribe", "subscription": { "type": "userEvents", "user": "0x..." } }
// Covers: fills, funding, liquidations, order updates
```

#### `userFills` — Real-time fills

```json
{ "method": "subscribe", "subscription": { "type": "userFills", "user": "0x..." } }
```

#### `orderUpdates` — Order status changes

```json
{ "method": "subscribe", "subscription": { "type": "orderUpdates", "user": "0x..." } }
```

#### `candle` — OHLCV updates

```json
{ "method": "subscribe", "subscription": { "type": "candle", "coin": "BTC", "interval": "1m" } }
```

### Trade Message Format

```typescript
interface RawTrade {
  coin: string;
  side: 'B' | 'A';          // B=buyer aggressor (buy order took), A=seller aggressor
  px: string;                // price
  sz: string;                // size in base coin
  hash: string;              // transaction hash
  time: number;              // Unix ms
  tid: number;               // trade ID
  users?: [string, string];  // [buyerAddress, sellerAddress]
}
```

**Side interpretation:**
- `side: 'B'` → buyer là aggressor (market buy); `users[0]` là buyer address
- `side: 'A'` → seller là aggressor (market sell); `users[1]` là seller address
- Insider scanner tracks BOTH sides independently

### Connection Management

```typescript
class WsManager {
  private pingInterval: NodeJS.Timeout;
  private reconnectTimer: NodeJS.Timeout;
  private lastMessageAt: number = 0;

  private connect() {
    this.ws = new WebSocket(WS_URL);
    this.ws.on('open', () => this.onOpen());
    this.ws.on('message', (data) => { this.lastMessageAt = Date.now(); this.onMessage(data); });
    this.ws.on('close', (code, reason) => {
      this.logger.warn(`WS closed (${code}: ${reason}) – retry in 5s`);
      setTimeout(() => this.connect(), 5_000);
    });
    this.ws.on('error', (err) => this.logger.error(`WS error: ${err.message}`));
  }

  private onOpen() {
    // Send ping every 20s
    this.pingInterval = setInterval(() => {
      this.ws.send(JSON.stringify({ method: 'ping' }));
    }, 20_000);

    // Dead-connection check every 30s
    this.reconnectTimer = setInterval(() => {
      if (this.lastMessageAt && Date.now() - this.lastMessageAt > 60_000) {
        this.logger.warn('WebSocket dead – reconnecting');
        this.ws.terminate();
      }
    }, 30_000);

    this.resubscribeAll();
  }
}
```

**Quan trọng:** `import WebSocket = require('ws')` — KHÔNG dùng `{ WebSocket } from 'ws'` trong webpack-built NestJS apps.

---

## Rate Limits

| Context | Limit | Implementation |
|---------|-------|----------------|
| REST `/info` | ~1200 weight/min | 1 100 ms sequential queue |
| Per info call | ~20 weight | — |
| WS subscriptions | 1 000 per connection | Subscribe tất cả coins on open |
| `scheduleCancel` triggers | 10 per 24h | — |
| `expiresAfter` penalty | 5× rate limit | Khi bị cancel do stale |

**Rate limiter pattern (thực tế từ source):**

```typescript
class RateLimiterService {
  private queue: Array<() => Promise<void>> = [];
  private running = false;

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try { resolve(await fn()); }
        catch (e) { reject(e); }
      });
      if (!this.running) this.processQueue();
    });
  }

  private async processQueue() {
    this.running = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await task();
      await sleep(1_100); // REST_RATE_LIMIT_MS
    }
    this.running = false;
  }
}
```

---

## Data Types & DTOs

### Fill

```typescript
interface HyperFillDto {
  coin: string;
  px: string;           // price
  sz: string;           // size (base coin)
  side: 'B' | 'A';
  time: number;         // Unix ms
  startPosition: string;
  dir: 'Open Long' | 'Close Long' | 'Open Short' | 'Close Short' | 'Short > Long' | 'Long > Short';
  closedPnl: string;    // non-zero for closing fills
  hash: string;
  oid: number;
  crossed: boolean;     // true = taker
  fee: string;
  tid: number;
  feeToken: string;
  liquidation?: any;
  cloid?: string;
}
```

### Market Context

```typescript
interface PerpMetaDto {
  name: string;
  szDecimals: number;    // decimal places for size
  maxLeverage: number;
  onlyIsolated?: boolean;
}

interface AssetCtxDto {
  funding: string;       // hourly funding rate
  openInterest: string;  // base coin qty
  prevDayPx: string;
  dayNtlVlm: string;     // 24h notional USD
  markPx: string;
  midPx: string;
  premium: string;       // vs oracle
  oiNtlVlm: string;      // OI in USD
}
```

### Position

```typescript
interface PositionEntryDto {
  coin: string;
  szi: string;              // signed size (+ long, - short)
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPx: string | null;
  marginUsed: string;
  leverage: { type: 'cross' | 'isolated'; value: number; rawUsd?: string };
  cumFunding: { allTime: string; sinceOpen: string; sinceChange: string };
  maxLeverage: number;
}
```

### Candle

```typescript
interface CandleDto {
  t: number;   // open time ms
  T: number;   // close time ms
  s: string;   // symbol
  i: string;   // interval
  o: string;   // open
  c: string;   // close
  h: string;   // high
  l: string;   // low
  v: string;   // volume (base coin)
  n: number;   // trade count
}
```

---

## Implementation Patterns

### 1. postInfo helper

```typescript
private async postInfo<T>(body: Record<string, any>, fallback: T): Promise<T> {
  const response = await AsyncUtil.wrapPromise(
    lastValueFrom(
      this.httpService.post(`${this.API_URL}/info`, body, { timeout: 15_000 })
        .pipe(catchError((e) => {
          this.logger.error(`HL API error [${body.type}]: ${e.message}`);
          return of(null);
        }))
    ),
    17_000, // hard timeout
    null,
  );

  if (!response || response.status < 200 || response.status >= 300) return fallback;
  return response.data ?? fallback;
}
```

### 2. Sliding window fill aggregation

```typescript
const SLIDE_WINDOW_MS = 500;   // extend timer on each fill
const MAX_WINDOW_MS = 3_000;   // absolute cap

// Key: `${address}:${coin}:${side}` — both buyer and seller tracked
function bufferTrade(trade: RawTrade) {
  const [buyer, seller] = trade.users ?? [];
  if (buyer && buyer !== ZERO_ADDRESS) accumulateFill(buyer, 'B', trade);
  if (seller && seller !== ZERO_ADDRESS) accumulateFill(seller, 'A', trade);
}

function accumulateFill(address: string, side: 'B' | 'A', trade: RawTrade) {
  const key = `${address}:${trade.coin}:${side}`;
  const now = Date.now();

  const existing = this.buffers.get(key);
  if (existing) {
    existing.fills.push(trade);
    clearTimeout(existing.timer);
    // Only extend if within MAX_WINDOW_MS from start
    if (now - existing.startedAt < MAX_WINDOW_MS) {
      existing.timer = setTimeout(() => this.flushBuffer(key), SLIDE_WINDOW_MS);
    }
    // else: MAX_WINDOW_MS will flush via the fixed timer already set
  } else {
    this.buffers.set(key, {
      fills: [trade],
      address, side,
      startedAt: now,
      timer: setTimeout(() => this.flushBuffer(key), SLIDE_WINDOW_MS),
    });
    // Also set absolute cap timer
    setTimeout(() => {
      if (this.buffers.has(key)) this.flushBuffer(key);
    }, MAX_WINDOW_MS);
  }
}
```

### 3. Price rounding

```typescript
function hyperliquidRoundPrice(price: number, szDecimals: number): string {
  // 5 significant digits, capped at (6 - szDecimals) decimal places
  const maxDecimals = Math.max(0, 6 - szDecimals);
  const sigFigs = 5;

  const magnitude = Math.floor(Math.log10(Math.abs(price)));
  const decimalPlaces = Math.min(maxDecimals, sigFigs - 1 - magnitude);

  return price.toFixed(Math.max(0, decimalPlaces));
}
```

### 4. lossless-json parsing

```typescript
import { parse } from 'lossless-json';

// Thay thế JSON.parse cho Hyperliquid responses
// Tránh mất precision với số lớn (order IDs, timestamps, large integers)
const data = parse(responseText);
```

### 5. Asset index lookup

```typescript
// Perpetuals: index trong universe array
const [meta, ctxs] = await getMetaAndAssetCtxs();
const btcIndex = meta.findIndex(m => m.name === 'BTC'); // e.g. 0

// Spot: 10000 + index trong spotMeta.universe
const spotMeta = await getSpotMeta();
const purIndex = spotMeta.universe.findIndex(s => s.name === 'PURR/USDC'); // 0
const purAsset = 10000 + purIndex; // 10000
```
