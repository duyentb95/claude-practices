# Hyperliquid API Reference for Insider Detection

## Base URL
`https://api.hyperliquid.xyz`

## All Info Requests
Method: `POST /info`
Content-Type: `application/json`

## Endpoints Used

### metaAndAssetCtxs
Returns all token metadata including listing dates, market stats.
```json
{"type": "metaAndAssetCtxs"}
```
Response: `[{universe: [{name, szDecimals, maxLeverage}]}, [{dayNtlVlm, funding, ...}]]`

### userFills
All trades for a wallet. Key fields: `coin`, `px`, `sz`, `side`, `time`, `closedPnl`, `oid`.
```json
{"type": "userFills", "user": "0x..."}
```

### clearinghouseState
Current positions + margin info.
```json
{"type": "clearinghouseState", "user": "0x..."}
```

### openOrders
Pending orders.
```json
{"type": "openOrders", "user": "0x..."}
```

### userFunding
Funding payments in a time range.
```json
{"type": "userFunding", "user": "0x...", "startTime": <epoch_ms>, "endTime": <epoch_ms>}
```

## Rate Limits
- ~1200 requests/minute
- Delay: 50ms between sequential requests
- On 429: exponential backoff (1s, 2s, 4s, max 30s)
- On 5xx: retry up to 3 times with 2s delay

## Parsing Notes
- Use `lossless-json` for large integers (avoid precision loss)
- Timestamps are in milliseconds since epoch
- Prices are strings to preserve precision
- `side`: "B" = buy/long, "A" = sell/short
