# hl-data-fetcher

Skill for fetching data from Hyperliquid APIs — Info REST endpoint and WebSocket feed.

## When to use

- Bulk wallet inspection (ledger + fills + state) for pipeline runs
- Market snapshots (all coins, prices, OI, funding)
- Real-time trade feeds via WebSocket
- Order book queries
- Historical OHLCV candles

## Key Endpoints

| Call | Type |
|------|------|
| `metaAndAssetCtxs` | All coins meta + live market context |
| `userNonFundingLedgerUpdates` | Wallet deposit/withdraw/send history |
| `userFillsByTime` (paginated) | Up to 10k orders per wallet |
| `clearinghouseState` | Positions + margin summary |
| `userFees` | Fee tier (MM/HFT detection) |
| `l2Book` | Order book snapshot |
| `candleSnapshot` | OHLCV candles |
| `leaderboard` | Top traders by PnL/ROI |
| WS `trades` | Real-time trade stream |
| WS `webData2` | Live account state |

## Resources

- [`resources/info-endpoint.md`](resources/info-endpoint.md) — full Info endpoint reference
- [`resources/websocket.md`](resources/websocket.md) — WebSocket subscription guide
- [`examples/fetch-wallet.md`](examples/fetch-wallet.md) — wallet inspection walkthrough
- [`../../docs/hyperliquid-api-reference.md`](../../docs/hyperliquid-api-reference.md) — master API reference

## Rate Limits

- REST: 1 100 ms between calls (sequential queue)
- Pagination: 300 ms between pages
- Max fills per wallet: 10 000 (`userFillsByTime` + backward pagination)
