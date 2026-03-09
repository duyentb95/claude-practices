# WebSocket — Subscription Guide

Endpoint: `wss://api.hyperliquid.xyz/ws`
Testnet:  `wss://api.hyperliquid-testnet.xyz/ws`

---

## Connection

```typescript
import WebSocket = require('ws');   // webpack apps: use require, NOT named import

const ws = new WebSocket('wss://api.hyperliquid.xyz/ws');

ws.on('open', () => {
  console.log('Connected');
  // Subscribe immediately after open
  subscribe({ type: 'allMids' });
  // Start keepalive
  setInterval(() => ws.send('ping'), 30_000);
});

ws.on('message', (data: Buffer) => {
  const msg = data.toString();
  if (msg === 'pong') return;
  const parsed = JSON.parse(msg);
  handleMessage(parsed);
});

ws.on('close', () => reconnect());
ws.on('error', (e) => console.error('WS error', e.message));

function subscribe(subscription: object) {
  ws.send(JSON.stringify({ method: 'subscribe', subscription }));
}

function unsubscribe(subscription: object) {
  ws.send(JSON.stringify({ method: 'unsubscribe', subscription }));
}
```

---

## Subscription Types

### `trades` — Real-time trade feed

```typescript
// Standard perp coin subscription
subscribe({ type: 'trades', coin: 'BTC' });

// HIP-3 DEX pairs — subscribe once to receive ALL DEX pair trades
subscribe({ type: 'trades', dex: 'ALL_DEXS' });

// Message format:
{
  channel: 'trades',
  data: [{
    coin: 'BTC',
    side: 'B',                    // 'B' = buy-initiated, 'A' = sell-initiated
    px: '95230.5',                // fill price
    sz: '0.12',                   // fill size (base coin)
    time: 1709600000000,
    hash: '0xabc...',
    users: ['0xBuyer...', '0xSeller...'],   // [0]=buyer, [1]=seller
    tid: 12345678,                // trade ID
  }]
}

// Compute notional: parseFloat(px) * parseFloat(sz)
// Track both sides: users[0] and users[1] for insider detection
```

**HIP-3 coverage**: To monitor all pairs including HIP-3 DEX tokens:
1. Use `{ type: 'allPerpMetas' }` to get coin list (includes HIP-3; filter `isDelisted: true`)
2. Subscribe per-coin for standard perps: `{ type: 'trades', coin }`
3. Add one `{ type: 'trades', dex: 'ALL_DEXS' }` subscription for all HIP-3 pairs

### `allMids` — Live mid prices (all coins)

```typescript
subscribe({ type: 'allMids' });

// Message format:
{
  channel: 'allMids',
  data: { mids: { BTC: '95230.5', ETH: '3420.1', ... } }
}
```

### `l2Book` — Order book live updates

```typescript
subscribe({ type: 'l2Book', coin: 'BTC' });

// Message format:
{
  channel: 'l2Book',
  data: {
    coin: 'BTC',
    time: 1709600000000,
    levels: [
      [{ px: '95200', sz: '0.5', n: 2 }, ...],  // [0] = bids (descending)
      [{ px: '95230', sz: '0.3', n: 1 }, ...],  // [1] = asks (ascending)
    ]
  }
}
// Note: this is a FULL snapshot on each update, not a delta
```

### `userFills` — User fill updates (requires address)

```typescript
subscribe({ type: 'userFills', user: '0x...' });

// Message format:
{
  channel: 'userFills',
  data: {
    user: '0x...',
    fills: [{
      coin, px, sz, side, time, startPosition, dir, closedPnl,
      hash, oid, crossed, fee, tid, cloid?
    }]
  }
}
```

### `orderUpdates` — Order status changes

```typescript
subscribe({ type: 'orderUpdates', user: '0x...' });

// Message format:
{
  channel: 'orderUpdates',
  data: [{
    order: { coin, side, limitPx, sz, oid, timestamp, origSz, cloid? },
    status: 'open' | 'filled' | 'canceled' | 'triggered' | 'rejected',
    statusTimestamp: ms,
  }]
}
```

### `webData2` — Full account state (positions + orders + fills)

```typescript
subscribe({ type: 'webData2', user: '0x...' });

// Message format (heavy — sent on any account change):
{
  channel: 'webData2',
  data: {
    clearinghouseState: { marginSummary, assetPositions, withdrawable },
    openOrders: [...],
    fills: [...],            // recent fills
    serverTime: ms,
  }
}
```

### `notification` — Liquidation + system alerts

```typescript
subscribe({ type: 'notification', user: '0x...' });

// Message format:
{
  channel: 'notification',
  data: { notification: 'string message' }
}
```

---

## Reconnect Pattern

```typescript
let reconnectDelay = 1_000;

async function reconnect() {
  await sleep(reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 30_000);   // exponential backoff, max 30s
  connect();
}

ws.on('open', () => {
  reconnectDelay = 1_000;   // reset on successful connection
  resubscribeAll();
});
```

**Important:** Resubscribe to all channels after reconnect — subscriptions are not persistent.

---

## Sliding Window Aggregation (insider-scanner pattern)

```typescript
// Key: `${address}:${coin}:${side}`
// Window: 500ms extension on each fill, 3s absolute cap

const windows = new Map<string, { trades: Trade[], timer: NodeJS.Timeout, startTime: number }>();

function bufferTrade(trade: Trade) {
  const key = `${trade.users[0]}:${trade.coin}:${trade.side}`;
  const now = Date.now();

  if (!windows.has(key)) {
    windows.set(key, { trades: [trade], timer: null, startTime: now });
  } else {
    windows.get(key).trades.push(trade);
  }

  const window = windows.get(key);
  clearTimeout(window.timer);

  const elapsed = now - window.startTime;
  const remaining = Math.min(500, 3_000 - elapsed);   // cap at 3s total

  if (remaining > 0) {
    window.timer = setTimeout(() => flushWindow(key), remaining);
  } else {
    flushWindow(key);
  }
}
```

---

## Multiple Coin Subscription (bulk trades)

```typescript
// Subscribe to all perp coins at startup
const [meta] = await postInfo({ type: 'metaAndAssetCtxs' });
for (const coin of meta.universe.map(u => u.name)) {
  subscribe({ type: 'trades', coin });
  await sleep(50);   // short pause between subscribes
}
```
