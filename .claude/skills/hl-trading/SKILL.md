---
name: hl-trading
version: 1.0.0
description: >
  Place orders, manage positions, and execute transfers on Hyperliquid DEX.
  Requires EIP-712 wallet signing. Use for: open/close positions, set leverage,
  TWAP execution, vault deposits, cross-margin management.
  Keywords: place order, close position, set leverage, limit order, market order,
  TWAP, deposit, withdraw, transfer, trading, perp, hyperliquid trade.
complexity: 14/20
architecture: Service
platforms: [claude-code]
updated: 2026-03-05
---

## Goal

Execute trading operations on Hyperliquid via the Exchange REST endpoint.
All actions require EIP-712 phantom agent signature. Produce a structured
execution report with order IDs, fill prices, and error handling.

## Core Capabilities

- **Order placement** — limit, market, stop-limit, TWAP
- **Position management** — leverage, cross/isolated margin, close positions
- **Transfers** — USDC deposits/withdrawals, spot transfers
- **Vault operations** — deposit/withdraw from vault sub-accounts
- **Schedule cancel** — auto-cancel open orders after time threshold
- **Agent approval** — delegate trading rights to another address

---

## Instructions

### Phase 1 — Prerequisites

Before trading, verify:
1. **Private key** available as env var (never hardcode)
2. **Asset index** — must resolve coin name to numeric index from `metaAndAssetCtxs`
3. **Price precision** — use `hyperliquidRoundPrice()` for all price inputs
4. **Nonce** — use `Date.now()` (Unix milliseconds) as nonce for each request

```typescript
// Env setup
const PRIVATE_KEY = process.env.PRIVATE_KEY;         // 0x-prefixed 32-byte hex
const VAULT_ADDRESS = process.env.VAULT_ADDRESS;     // optional: for vault trading
const API_URL = 'https://api.hyperliquid.xyz';

// Resolve coin to asset index
const [meta] = await postInfo({ type: 'metaAndAssetCtxs' });
const assetIndex = meta.universe.findIndex((u) => u.name === coin);
// assetIndex is used as `a` field in order actions
```

**Price rounding:**

```typescript
function hyperliquidRoundPrice(price: number, szDecimals: number): string {
  // Round to 5 significant figures
  const sigFigs = 5;
  const magnitude = Math.floor(Math.log10(Math.abs(price))) + 1;
  const decimalPlaces = Math.max(0, Math.min(6 - szDecimals, sigFigs - magnitude));
  return price.toFixed(decimalPlaces);
}
```

---

### Phase 2 — EIP-712 Signing

All Exchange requests follow this pattern:

```typescript
import { ethers } from 'ethers';
import * as msgpack from 'msgpackr';

const wallet = new ethers.Wallet(PRIVATE_KEY);

async function signAction(action: object, nonce: number, vaultAddress?: string) {
  // 1. Encode action with msgpack
  const actionBytes = msgpack.encode(action);

  // 2. Build hash: keccak256(actionBytes + nonce_bytes + [vaultAddress_bytes])
  const nonceBytes = Buffer.alloc(8);
  nonceBytes.writeBigUInt64BE(BigInt(nonce));
  const suffix = vaultAddress
    ? Buffer.concat([Buffer.from([1]), Buffer.from(vaultAddress.slice(2), 'hex')])
    : Buffer.from([0]);
  const payload = Buffer.concat([actionBytes, nonceBytes, suffix]);
  const hash = ethers.keccak256(payload);

  // 3. Sign with EIP-712 phantom agent domain
  const domain = {
    name: 'Exchange',
    version: '1',
    chainId: 1337,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  };
  const types = {
    Agent: [
      { name: 'source', type: 'string' },
      { name: 'connectionId', type: 'bytes32' },
    ],
  };
  const value = {
    source: vaultAddress ? 'b' : 'a',
    connectionId: hash,
  };

  const sig = await wallet.signTypedData(domain, types, value);
  const { r, s, v } = ethers.Signature.from(sig);

  return { r, s, v };
}

async function postExchange(action: object, nonce: number, vaultAddress?: string) {
  const signature = await signAction(action, nonce, vaultAddress);
  const body = { action, nonce, signature, ...(vaultAddress && { vaultAddress }) };

  const response = await fetch(`${API_URL}/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}
```

---

### Phase 3 — Order Actions

#### Place Order (Limit / Market / Stop)

```typescript
const nonce = Date.now();
const action = {
  type: 'order',
  orders: [{
    a: assetIndex,          // coin asset index (from metaAndAssetCtxs)
    b: true,                // true = buy, false = sell
    p: '95000',             // price (use hyperliquidRoundPrice); '0' for market orders
    s: '0.01',              // size in base coin
    r: false,               // reduce-only
    t: {
      limit: {
        tif: 'Gtc',         // 'Gtc' | 'Ioc' | 'Alo' | 'FrontendMarket'
      },
      // OR for stop orders:
      // trigger: { triggerPx: '94000', isMarket: true, tpsl: 'sl' }
    },
  }],
  grouping: 'na',           // 'na' | 'normalTpsl' | 'positionTpsl'
};

const result = await postExchange(action, nonce, VAULT_ADDRESS);
// result.response.data.statuses: [{resting: {oid: 123}} | {filled: {oid, totalSz, avgPx}} | {error: '...'}]
```

**TIF (Time-in-Force) options:**

| TIF | Behavior |
|-----|---------|
| `Gtc` | Good-till-cancelled — rests in book |
| `Ioc` | Immediate-or-cancel — fills or cancels |
| `Alo` | Add-liquidity-only — maker only |
| `FrontendMarket` | Market order via frontend API |

#### Cancel Order

```typescript
const action = {
  type: 'cancel',
  cancels: [{ a: assetIndex, o: orderId }],
};
```

#### Cancel by CLOID (Client Order ID)

```typescript
const action = {
  type: 'cancelByCloid',
  cancels: [{ asset: assetIndex, cloid: '0x...' }],
};
```

#### Modify Order

```typescript
const action = {
  type: 'batchModify',
  modifies: [{
    oid: orderId,
    order: { a: assetIndex, b: true, p: newPrice, s: newSize, r: false, t: { limit: { tif: 'Gtc' } } },
  }],
};
```

---

### Phase 4 — Position Management

#### Set Leverage

```typescript
// Must call before placing leveraged order
const action = {
  type: 'updateLeverage',
  asset: assetIndex,
  isCross: true,            // true = cross margin, false = isolated
  leverage: 10,             // 1–50 (check coin maxLeverage from meta)
};
await postExchange(action, Date.now(), VAULT_ADDRESS);
```

#### Update Isolated Margin

```typescript
const action = {
  type: 'updateIsolatedMargin',
  asset: assetIndex,
  isBuy: true,
  ntli: 1000,               // USDC amount to add (positive) or remove (negative)
};
```

#### Close All Positions

```typescript
// Market close: use reduce-only + FrontendMarket
const closeAction = {
  type: 'order',
  orders: [{
    a: assetIndex,
    b: false,               // opposite side of current position
    p: '0',                 // market price
    s: positionSzi,         // full position size
    r: true,                // reduce-only = true
    t: { limit: { tif: 'FrontendMarket' } },
  }],
  grouping: 'na',
};
```

---

### Phase 5 — TWAP Orders

TWAP splits a large order into smaller chunks over time.

```typescript
const action = {
  type: 'twapOrder',
  twap: {
    a: assetIndex,
    b: true,                // buy
    s: '1.0',               // total size
    r: false,               // reduce-only
    m: 10,                  // duration in minutes (5–1440)
    t: false,               // randomize timing
  },
};

// Cancel active TWAP
const cancelAction = {
  type: 'twapCancel',
  a: assetIndex,
  t: twapId,
};
```

---

### Phase 6 — Transfers

#### USDC Withdraw

```typescript
const action = {
  type: 'withdraw3',
  hyperliquidChain: 'Mainnet',
  signatureChainId: '0xa4b1',  // Arbitrum
  destination: '0xRecipient...',
  amount: '1000',               // USDC string
  time: Date.now(),
};
```

#### Internal Transfer (USDC to another HL account)

```typescript
const action = {
  type: 'spotSend',
  hyperliquidChain: 'Mainnet',
  signatureChainId: '0xa4b1',
  destination: '0xRecipient...',
  token: 'USDC:0x6d1e7cde53ba9467b783cb7c530ce054',
  amount: '500',
  time: Date.now(),
};
```

#### Schedule Cancel (Auto-cancel after threshold)

```typescript
// Set a time after which all open orders auto-cancel
const action = {
  type: 'scheduleCancel',
  time: Date.now() + 60 * 60 * 1000,   // cancel in 1 hour; null to disable
};
```

#### Approve Agent

```typescript
// Delegate trading rights to another address (no withdrawal rights)
const action = {
  type: 'approveAgent',
  hyperliquidChain: 'Mainnet',
  agentAddress: '0xAgent...',
  agentName: 'my-bot',
  nonce: Date.now(),
};
```

---

### Phase 7 — Output

Log all trades to `data/trades/{YYYY-MM-DD}/`:

```
data/trades/2026-03-05/
├── orders.json        # all order submissions with timestamps + results
├── fills.json         # confirmed fills from WS userFills feed
└── errors.json        # failed orders with error messages
```

**Order result structure:**

```json
{
  "timestamp": 1709600000000,
  "coin": "BTC",
  "side": "buy",
  "size": "0.01",
  "price": "95000",
  "type": "limit-gtc",
  "result": {
    "status": "resting" | "filled" | "error",
    "oid": 12345,
    "avgPx": "95001.2",
    "error": null
  }
}
```

---

## Constraints

1. **Never hardcode private keys** — use `process.env.PRIVATE_KEY` only
2. **Nonce = Date.now()** — always Unix milliseconds, unique per request
3. **Price precision** — always use `hyperliquidRoundPrice()` before sending
4. **Asset index** — resolve from `metaAndAssetCtxs` at startup, refresh hourly
5. **Max leverage** — respect `meta.universe[i].maxLeverage` per coin
6. **Vault address** — include in signature and request body when trading from vault
7. **Testnet first** — test all new strategies on `api.hyperliquid-testnet.xyz`
8. **Rate limit** — Exchange endpoint: conservative 500 ms between order requests
9. **User confirmation** — always ask user before executing any real trade or transfer
10. **TWAP minimum** — 5 minutes minimum duration; maximum 1440 minutes (24h)

---

## Examples

### Example 1 — Open 0.1 BTC Long at Market

```
1. Resolve BTC asset index from metaAndAssetCtxs
2. Set leverage: updateLeverage(BTC, cross, 10x)
3. Get current mid price from allMids
4. Place order: buy 0.1 BTC at FrontendMarket (tif='FrontendMarket', p='0')
5. Poll clearinghouseState to confirm position opened
6. Log to data/trades/2026-03-05/orders.json
```

### Example 2 — TWAP Sell 5 ETH over 30 minutes

```
1. Resolve ETH asset index
2. Verify position size ≥ 5 ETH in clearinghouseState
3. Place TWAP: { coin: ETH, side: sell, size: 5, duration: 30m, randomize: true }
4. Monitor via WebSocket webData2 subscription for fill updates
5. Cancel TWAP if price drops > 2% from entry (twapCancel)
```
