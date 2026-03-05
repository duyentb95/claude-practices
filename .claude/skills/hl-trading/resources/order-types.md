# Order Types & TIF Options

---

## Limit Orders

Standard resting orders that execute at specified price or better.

### GTC — Good Till Cancelled

```json
"t": { "limit": { "tif": "Gtc" } }
```

- Rests in order book until filled or cancelled
- Default for most strategies
- Provides liquidity → may receive maker rebate

### IOC — Immediate or Cancel

```json
"t": { "limit": { "tif": "Ioc" } }
```

- Fills immediately at best available price up to limit price
- Unfilled portion cancelled instantly
- Suitable for urgent entries with price protection

### ALO — Add Liquidity Only (Post-only)

```json
"t": { "limit": { "tif": "Alo" } }
```

- Cancelled if it would cross the spread (take liquidity)
- Guarantees maker rebate when filled
- Use for market-making / rebate strategies

---

## Market Orders

```json
{
  "a": 0,
  "b": true,
  "p": "0",                                     // price = "0" for market
  "s": "0.01",
  "r": false,
  "t": { "limit": { "tif": "FrontendMarket" } }
}
```

- `FrontendMarket` executes at best available price
- Acts as IOC with very aggressive pricing
- Use for immediate entries without price concern

---

## Stop Orders

### Stop-Market

```json
"t": {
  "trigger": {
    "triggerPx": "94000",   // price that activates the order
    "isMarket": true,        // true = market order when triggered
    "tpsl": "sl"             // "sl" = stop loss, "tp" = take profit
  }
}
```

### Stop-Limit

```json
"t": {
  "trigger": {
    "triggerPx": "94000",
    "isMarket": false,
    "tpsl": "sl"
  }
}
// Note: for stop-limit, set p to the limit price (not "0")
```

---

## TP/SL Grouping

Place main order + TP + SL as a linked group:

```json
{
  "type": "order",
  "orders": [
    {
      "a": 0, "b": true, "p": "95000", "s": "0.1", "r": false,
      "t": { "limit": { "tif": "Gtc" } }
    },
    {
      "a": 0, "b": false, "p": "97000", "s": "0.1", "r": true,
      "t": { "trigger": { "triggerPx": "97000", "isMarket": false, "tpsl": "tp" } }
    },
    {
      "a": 0, "b": false, "p": "0", "s": "0.1", "r": true,
      "t": { "trigger": { "triggerPx": "93000", "isMarket": true, "tpsl": "sl" } }
    }
  ],
  "grouping": "normalTpsl"   // links the 3 orders; cancel one cancels all
}
```

Grouping options:
- `"na"` — independent orders (default)
- `"normalTpsl"` — TP + SL linked to entry order
- `"positionTpsl"` — TP + SL linked to entire position

---

## Size Precision

```typescript
function getMinSize(coin: string, meta: Meta): number {
  const asset = meta.universe.find(u => u.name === coin);
  return Math.pow(10, -asset.szDecimals);
}

// Size must be a multiple of min size
function roundSize(size: number, szDecimals: number): string {
  return size.toFixed(szDecimals);
}
```

---

## Price Precision

```typescript
function hyperliquidRoundPrice(price: number, szDecimals: number): string {
  const sigFigs = 5;
  if (price === 0) return '0';
  const magnitude = Math.floor(Math.log10(Math.abs(price))) + 1;
  const decimalPlaces = Math.max(0, Math.min(6 - szDecimals, sigFigs - magnitude));
  return price.toFixed(decimalPlaces);
}

// Examples:
// BTC price 95230.5, szDecimals=5: magnitude=5 → decimals = max(0, min(1, 0)) = 0 → "95231"
// ETH price 3420.1, szDecimals=4:  magnitude=4 → decimals = max(0, min(2, 1)) = 1 → "3420.1"
// SOL price 185.25, szDecimals=2:  magnitude=3 → decimals = max(0, min(4, 2)) = 2 → "185.25"
```

---

## Reduce-Only Flag

```json
"r": true
```

- Order can only reduce an existing position (never open new)
- Use for TP/SL and closing orders
- Prevents accidentally doubling a position

---

## Close Position (All sizes)

```typescript
// Get current position size
const state = await postInfo({ type: 'clearinghouseState', user: address });
const pos = state.assetPositions.find(p => p.position.coin === coin);
const size = Math.abs(parseFloat(pos.position.szi));
const isLong = parseFloat(pos.position.szi) > 0;

// Market close (opposite side, reduce-only)
const closeOrder = {
  a: assetIndex,
  b: !isLong,          // opposite of current position
  p: '0',
  s: size.toFixed(szDecimals),
  r: true,             // reduce-only
  t: { limit: { tif: 'FrontendMarket' } },
};
```
