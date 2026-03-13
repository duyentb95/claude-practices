# Changelog — hl-data-fetcher

---

## [1.2.0] - 2026-03-13

### Added
- **Rate Limits documentation**: Full weight system documented in `info-endpoint.md` — endpoint weights (2/20/60/variable), WebSocket limits (10 connections, 1000 subs), address-based limits, best practices.
- **L2 Book enhanced docs**: `nSigFigs`, `mantissa` aggregation params, response format with `n` (order count), weight=2 note.
- **Candle Snapshot enhanced docs**: 5000 candle limit, HIP-3 prefix format, all 14 intervals, weight formula (20+⌈items/60⌉).

### Changed
- Rate limiter recommendation: use **weight-based** limiter instead of fixed delay. Different endpoints have vastly different costs (w=2 for l2Book vs w=20+ for userFills).

---

## [1.1.0] - 2026-03-09

### Added
- **`allPerpMetas` endpoint**: new API type that returns all perpetuals metadata including HIP-3 DEX pairs. Replaces `metaAndAssetCtxs` when only coin metadata is needed.
- **`isDelisted` field** on `PerpMetaDto`: pairs with `isDelisted: true` should be filtered before subscribing to WebSocket trades.
- **`dex: 'ALL_DEXS'` WebSocket subscription**: single subscription that receives trades for all HIP-3 DEX pairs. Add alongside per-coin subscriptions for full coverage.
- Updated `info-endpoint.md`: `allPerpMetas` documented as preferred for coin lists; `metaAndAssetCtxs` noted as not including HIP-3 pairs.
- Updated `websocket.md`: HIP-3 coverage pattern documented (allPerpMetas + dex:ALL_DEXS).

---

## [1.0.0] - 2026-03-05

### Added
- Initial skill: full Info REST endpoint coverage (all major query types).
- Paginated fills: `userFillsByTime` backward pagination up to 10 000 records with 300ms inter-page delay.
- `aggregateByTime: true` support — merges partial fills of same order for accurate order-level analysis.
- WebSocket subscriptions: `trades`, `allMids`, `l2Book`, `userFills`, `webData2`, `orderUpdates`.
- MM/HFT filter pattern: check `userFees.userAddRate ≤ 0` before expensive data fetches.
- Rate limiter pattern: 1 100 ms sequential queue for REST, 300 ms between pagination pages.
- `lossless-json` requirement for precision-safe large integer parsing.
- Resources: `info-endpoint.md` (full endpoint reference), `websocket.md` (subscription guide).
- Examples: `fetch-wallet.md` (single wallet inspection walkthrough).

### Known Gaps
- No built-in retry logic — caller must handle transient 429 / 5xx errors.
- WebSocket reconnect pattern documented but not implemented as a reusable module.
- `userFills` (non-time-range version) capped at 2 000 — always prefer `userFillsByTime` for pagination.
