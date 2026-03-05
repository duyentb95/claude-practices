# Example — Place a Limit Long Order (BTC)

End-to-end walkthrough: buy 0.05 BTC at limit price with 10× cross leverage.

---

## Input

```
Task: Buy 0.05 BTC at $94,500 limit, 10× cross leverage.
```

---

## Step 1 — Resolve Asset Index

```typescript
const [meta] = await postInfo({ type: 'metaAndAssetCtxs' });
const assetIndex = meta.universe.findIndex(u => u.name === 'BTC');
// assetIndex = 0 (BTC is always first)

const szDecimals = meta.universe[assetIndex].szDecimals;  // 5 for BTC
const maxLev     = meta.universe[assetIndex].maxLeverage;  // 50
console.log(`BTC: index=${assetIndex}, szDecimals=${szDecimals}, maxLev=${maxLev}`);
```

---

## Step 2 — Set Leverage

```typescript
const leverageNonce = Date.now();
const leverageAction = {
  type: 'updateLeverage',
  asset: assetIndex,
  isCross: true,
  leverage: 10,
};

const leverageResult = await postExchange(leverageAction, leverageNonce);
console.log('Leverage set:', leverageResult.status);
// Expected: { status: 'ok', response: { type: 'default' } }
```

---

## Step 3 — Round the Price

```typescript
const targetPrice = 94500;
const roundedPrice = hyperliquidRoundPrice(targetPrice, szDecimals);
// BTC szDecimals=5, magnitude=5 → decimals=0 → "94500"
console.log('Rounded price:', roundedPrice);
```

---

## Step 4 — Place the Order

```typescript
const orderNonce = Date.now() + 1;   // +1 to ensure unique nonce after leverage call
const orderAction = {
  type: 'order',
  orders: [{
    a: assetIndex,         // 0 = BTC
    b: true,               // buy
    p: roundedPrice,       // "94500"
    s: '0.05',             // size (5 decimal places max for BTC)
    r: false,              // not reduce-only
    t: { limit: { tif: 'Gtc' } },
  }],
  grouping: 'na',
};

const orderResult = await postExchange(orderAction, orderNonce);
console.log('Order result:', JSON.stringify(orderResult, null, 2));
```

---

## Step 5 — Read Result

**Success (resting):**
```json
{
  "status": "ok",
  "response": {
    "type": "order",
    "data": {
      "statuses": [
        { "resting": { "oid": 88819234 } }
      ]
    }
  }
}
```
Order resting in book at $94,500. OID = 88819234.

**Success (immediately filled):**
```json
{
  "status": "ok",
  "response": {
    "type": "order",
    "data": {
      "statuses": [
        { "filled": { "oid": 88819235, "totalSz": "0.05", "avgPx": "94498.2" } }
      ]
    }
  }
}
```

**Error:**
```json
{
  "status": "err",
  "response": "Insufficient balance"
}
```

---

## Step 6 — Log

```json
{
  "timestamp": 1709600001000,
  "coin": "BTC",
  "side": "buy",
  "size": "0.05",
  "price": "94500",
  "type": "limit-gtc",
  "leverage": "10x-cross",
  "result": {
    "status": "resting",
    "oid": 88819234,
    "avgPx": null,
    "error": null
  }
}
```

Saved to: `data/trades/2026-03-05/orders.json`

---

## Optional: Monitor Fill via WebSocket

```typescript
subscribe({ type: 'orderUpdates', user: wallet.address });

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.channel === 'orderUpdates') {
    const update = msg.data.find(u => u.order.oid === 88819234);
    if (update?.status === 'filled') {
      console.log(`Filled at avg ${update.order.avgPx}`);
    }
  }
});
```

---

## Optional: Cancel the Order

```typescript
const cancelAction = {
  type: 'cancel',
  cancels: [{ a: assetIndex, o: 88819234 }],
};
await postExchange(cancelAction, Date.now() + 2);
```
