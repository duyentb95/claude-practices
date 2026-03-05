# Exchange Endpoint — Full Reference

Base URL: `https://api.hyperliquid.xyz`
Endpoint: `POST /exchange` · `Content-Type: application/json`
**Requires EIP-712 signature. See `signing.md` for implementation.**

---

## Request Structure

```json
{
  "action": { ... },          // action-specific payload
  "nonce": 1709600000000,     // Date.now() — unique ms timestamp
  "signature": { "r": "0x...", "s": "0x...", "v": 28 },
  "vaultAddress": "0x..."     // optional: include when trading from vault
}
```

---

## Order Actions

### `order` — Place orders

```json
{
  "type": "order",
  "orders": [{
    "a": 0,             // asset index (from metaAndAssetCtxs)
    "b": true,          // buy = true, sell = false
    "p": "95000",       // price string; "0" for market orders
    "s": "0.01",        // size in base coin
    "r": false,         // reduce-only
    "t": {
      "limit": { "tif": "Gtc" }
      // OR:
      // "trigger": { "triggerPx": "94000", "isMarket": true, "tpsl": "sl" }
    },
    "c": "0x..."        // optional: CLOID (client order ID, 16-byte hex)
  }],
  "grouping": "na"      // "na" | "normalTpsl" | "positionTpsl"
}
```

**Response statuses:**
```json
{
  "status": "ok",
  "response": {
    "type": "order",
    "data": {
      "statuses": [
        { "resting": { "oid": 123456 } },
        { "filled": { "oid": 123457, "totalSz": "0.01", "avgPx": "95001.2" } },
        { "error": "Insufficient balance" }
      ]
    }
  }
}
```

### `cancel` — Cancel by order ID

```json
{
  "type": "cancel",
  "cancels": [{ "a": 0, "o": 123456 }]
}
```

### `cancelByCloid` — Cancel by client order ID

```json
{
  "type": "cancelByCloid",
  "cancels": [{ "asset": 0, "cloid": "0x..." }]
}
```

### `batchModify` — Modify existing orders

```json
{
  "type": "batchModify",
  "modifies": [{
    "oid": 123456,
    "order": {
      "a": 0, "b": true, "p": "95500", "s": "0.01", "r": false,
      "t": { "limit": { "tif": "Gtc" } }
    }
  }]
}
```

---

## Position Management

### `updateLeverage`

```json
{
  "type": "updateLeverage",
  "asset": 0,
  "isCross": true,     // true = cross-margin; false = isolated
  "leverage": 10       // 1 to coin's maxLeverage
}
```

### `updateIsolatedMargin`

```json
{
  "type": "updateIsolatedMargin",
  "asset": 0,
  "isBuy": true,       // direction of the position
  "ntli": 1000         // USDC delta: positive = add, negative = remove
}
```

---

## TWAP

### `twapOrder`

```json
{
  "type": "twapOrder",
  "twap": {
    "a": 0,            // asset index
    "b": true,         // buy
    "s": "1.0",        // total size
    "r": false,        // reduce-only
    "m": 30,           // duration in minutes (5–1440)
    "t": false         // randomize timing
  }
}
```

Response includes `twapId` in `data.status.running.id`.

### `twapCancel`

```json
{
  "type": "twapCancel",
  "a": 0,              // asset index
  "t": 789             // twapId from twapOrder response
}
```

---

## Transfers & Withdrawals

### `withdraw3` — On-chain USDC withdrawal (to Arbitrum)

```json
{
  "type": "withdraw3",
  "hyperliquidChain": "Mainnet",
  "signatureChainId": "0xa4b1",
  "destination": "0xRecipient...",
  "amount": "1000",
  "time": 1709600000000
}
```

### `spotSend` — Internal HL transfer (USDC to another HL address)

```json
{
  "type": "spotSend",
  "hyperliquidChain": "Mainnet",
  "signatureChainId": "0xa4b1",
  "destination": "0xRecipient...",
  "token": "USDC:0x6d1e7cde53ba9467b783cb7c530ce054",
  "amount": "500",
  "time": 1709600000000
}
```

### `vaultTransfer` — Transfer between main account and vault

```json
{
  "type": "vaultTransfer",
  "vaultAddress": "0xVault...",
  "isDeposit": true,    // true = main→vault, false = vault→main
  "usd": 10000
}
```

---

## Advanced

### `scheduleCancel` — Auto-cancel all orders after time

```json
{
  "type": "scheduleCancel",
  "time": 1709686400000    // Unix ms; null to disable
}
```

### `approveAgent` — Delegate trading rights

```json
{
  "type": "approveAgent",
  "hyperliquidChain": "Mainnet",
  "agentAddress": "0xAgent...",
  "agentName": "my-trading-bot",
  "nonce": 1709600000000
}
```

### `setReferrer` — Set referral code

```json
{
  "type": "setReferrer",
  "code": "MYCODE"
}
```

---

## Error Responses

```json
{ "status": "err", "response": "Insufficient balance" }
{ "status": "err", "response": "Order size too small" }
{ "status": "err", "response": "Leverage exceeds maximum" }
{ "status": "err", "response": "Invalid nonce" }
```

Common errors:
- `"Insufficient balance"` — not enough USDC margin
- `"Order size too small"` — below minimum size for the coin
- `"Invalid nonce"` — nonce reused or too old; use fresh `Date.now()`
- `"Leverage exceeds maximum"` — check `meta.universe[i].maxLeverage`
