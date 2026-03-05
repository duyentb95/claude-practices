# Changelog — hl-data-fetcher

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
