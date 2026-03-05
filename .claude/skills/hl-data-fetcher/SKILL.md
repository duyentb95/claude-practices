---
name: hl-data-fetcher
version: 1.0.0
description: >
  Fetch data from Hyperliquid APIs (Info REST + WebSocket).
  Use for: wallet inspection, market snapshots, trade history, ledger reads,
  order book queries, real-time trade feeds.
  Keywords: fetch wallet, get fills, ledger history, market data, order book,
  websocket stream, user positions, funding history, hyperliquid data.
complexity: 8/20
architecture: Service
platforms: [claude-code]
updated: 2026-03-05
---

## Goal

Retrieve data from Hyperliquid's public APIs: Info REST endpoint (read-only, no auth)
and WebSocket feed (real-time). Produce structured JSON suitable for downstream
scoring, analysis, or report-writing agents.

## Core Capabilities

- **Info REST** — all read-only queries via `POST /info`
- **Paginated fills** — up to 10 000 orders per wallet using `userFillsByTime`
- **Rate-limited batching** — 1 100 ms between calls; 300 ms between pages
- **Market context** — live mids, OI, funding via `metaAndAssetCtxs`
- **WebSocket** — real-time subscription to trades, order book, account events
- **lossless-json** — precision-safe parsing for large integers

---

## Instructions

### Phase 1 — Identify What to Fetch

Determine the data type needed:

| Intent | Call chain |
|--------|-----------|
| Inspect a single wallet | `userFees` → `userNonFundingLedgerUpdates` → `userFillsByTime` (paginated) → `clearinghouseState` |
| Market snapshot | `metaAndAssetCtxs` → `allMids` |
| Single coin OB | `l2Book` |
| Leaderboard | `leaderboard` |
| Coin candles | `candleSnapshot` |
| Real-time trades | WebSocket `trades` subscription |
| Real-time positions | WebSocket `webData2` subscription |

---

### Phase 2 — REST Calls (Info Endpoint)

Base URL: `https://api.hyperliquid.xyz`
All calls: `POST /info` with `Content-Type: application/json`

**Rate limit: 1 100 ms between calls (sequential queue).**

#### Single Wallet Inspection (ordered)

```typescript
// Step 1: Check MM/HFT tier — skip if maker rebate
const fees = await postInfo({ type: 'userFees', user: address });
if (fees.userAddRate <= 0) return { skip: true, reason: 'HFT' };

// Step 2: Ledger history
const ledger = await postInfo({
  type: 'userNonFundingLedgerUpdates',
  user: address,
});
// entries: [{delta: {type: 'deposit'|'send'|'withdraw', usdc/usdcValue, user?}, time}]

// Step 3: Fills (paginated — up to 10k)
const fills = await getUserFillsPaginated(address, 10_000);

// Step 4: Account state
const state = await postInfo({ type: 'clearinghouseState', user: address });
// state.marginSummary: {accountValue, totalMarginUsed, totalRawUsd}
// state.assetPositions: [{position: {coin, szi, entryPx, positionValue, returnOnEquity}}]
```

#### Paginated Fills Pattern

```typescript
async function getUserFillsPaginated(address: string, maxFills = 10_000) {
  const PAGE_SIZE = 2_000;
  const all: Fill[] = [];
  let endTime = Date.now();

  while (all.length < maxFills) {
    const page = await postInfo({
      type: 'userFillsByTime',
      user: address,
      startTime: 0,
      endTime,
      aggregateByTime: true,   // merge partial fills of same order
    });

    if (!page || page.length === 0) break;
    all.push(...page);
    if (page.length < PAGE_SIZE) break;                  // last page

    const minTime = Math.min(...page.map((f) => f.time));
    endTime = minTime - 1;
    if (endTime <= 0) break;

    await sleep(300);                                    // inter-page delay
  }

  return all.slice(0, maxFills);
}
```

#### Market Data

```typescript
// All coins: meta + live context
const [meta, ctxs] = await postInfo({ type: 'metaAndAssetCtxs' });
// meta.universe[i]: {name, szDecimals, maxLeverage}
// ctxs[i]:          {funding, openInterest, dayNtlVlm, markPx, midPx, oiNtlVlm}
// Coin index i is shared between meta.universe and ctxs array.

// Single coin order book (snapshot)
const book = await postInfo({ type: 'l2Book', coin: 'BTC', nSigFigs: 5 });
// book.levels: [[bids], [asks]], each entry: {px: string, sz: string, n: number}

// OHLCV candles
const candles = await postInfo({
  type: 'candleSnapshot',
  req: { coin: 'BTC', interval: '15m', startTime: ms, endTime: ms },
});
// each: {t: openMs, T: closeMs, o, h, l, c, v, n: tradeCount}

// Funding history
const funding = await postInfo({
  type: 'fundingHistory',
  coin: 'BTC',
  startTime: ms,          // optional endTime
});
// each: {coin, fundingRate, premium, time}
```

#### Leaderboard

```typescript
const board = await postInfo({ type: 'leaderboard' });
// leaderboardRows: [{ethAddress, accountValue, windowPerformances: [{period, pnl, roi, vlm}]}]
// periods: 'day' | 'week' | 'month' | 'allTime'
```

---

### Phase 3 — WebSocket Subscriptions

Connect to: `wss://api.hyperliquid.xyz/ws`

**Connection management:**
- Send ping every 30 s to keep alive
- On disconnect: exponential backoff reconnect (1s → 2s → 4s → max 30s)
- Use `import WebSocket = require('ws')` in webpack apps (NOT named import)

```typescript
// Subscribe to trades for a coin
ws.send(JSON.stringify({
  method: 'subscribe',
  subscription: { type: 'trades', coin: 'BTC' },
}));

// Subscribe to all mid prices (ticks on any price change)
ws.send(JSON.stringify({
  method: 'subscribe',
  subscription: { type: 'allMids' },
}));

// Subscribe to L2 order book (live updates)
ws.send(JSON.stringify({
  method: 'subscribe',
  subscription: { type: 'l2Book', coin: 'BTC' },
}));

// Subscribe to user fills (requires address)
ws.send(JSON.stringify({
  method: 'subscribe',
  subscription: { type: 'userFills', user: '0x...' },
}));

// Subscribe to full account state (positions + orders + fills)
ws.send(JSON.stringify({
  method: 'subscribe',
  subscription: { type: 'webData2', user: '0x...' },
}));
```

**Trade message format:**

```typescript
// Incoming WS message
{
  channel: 'trades',
  data: [{
    coin: 'BTC',
    side: 'B' | 'A',          // B = buyer-initiated, A = seller-initiated
    px: '95230.5',
    sz: '0.12',
    time: 1709600000000,       // Unix ms
    hash: '0xabc...',
    users: ['0xBuyer...', '0xSeller...'],  // [0] = buyer, [1] = seller
    tid: 12345678,             // trade ID
  }]
}
```

---

### Phase 4 — Output

Save raw fetched data to `data/raw/{YYYY-MM-DD}/`:

```
data/raw/2026-03-05/
├── suspects.json          # [{address, ledger, fills, state}] array
├── market-snapshot.json   # {timestamp, meta, ctxs, mids}
└── wallets/
    └── 0xabc.../
        ├── ledger.json
        ├── fills.json
        └── state.json
```

When fetching for a specific investigation: `data/raw/wallets/{address}/`

---

## Constraints

1. **No credentials needed** — Info endpoint is fully public
2. **Rate limit**: 1 100 ms between REST calls (sequential, never parallel)
3. **lossless-json**: always use `lossless-json.parse()` not `JSON.parse()` for Hyperliquid responses
4. **Pagination delay**: 300 ms between fill pages
5. **Max fills**: 10 000 per wallet (API cap with time-range pagination)
6. **Skip zero address**: never inspect `0x0000000000000000000000000000000000000000`
7. **MM filter**: check `userFees` first; skip wallet if `userAddRate ≤ 0`
8. **testnet**: use `https://api.hyperliquid-testnet.xyz` + `wss://api.hyperliquid-testnet.xyz/ws` for tests

---

## Examples

### Example 1 — Fetch Top 30 Wallets by USD Volume

```
Task: Fetch market leaders and their recent fills for today's pipeline.

1. Call metaAndAssetCtxs → get all coins sorted by dayNtlVlm
2. Call leaderboard → top 30 by accountValue or weekly PnL
3. For each wallet:
   - userFees (skip HFT)
   - userNonFundingLedgerUpdates
   - getUserFillsPaginated (10k)
   - clearinghouseState
4. Save to data/raw/2026-03-05/suspects.json
5. Message lead: "data-fetcher done, N wallets saved"
```

### Example 2 — Real-time Trade Feed (Single Coin)

```
Task: Monitor BTC trades ≥ $500K for the next 30 minutes.

1. Connect to wss://api.hyperliquid.xyz/ws
2. Subscribe: { type: 'trades', coin: 'BTC' }
3. On each message: filter trades where px * sz >= 500_000
4. For each qualifying trade: extract users[0] (buyer), users[1] (seller)
5. Queue REST inspection (POST to data-fetcher queue)
6. Log to data/raw/2026-03-05/large-trades.json
```
