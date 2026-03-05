# Changelog — hl-trading

---

## [1.0.0] - 2026-03-05

### Added
- Initial skill: full Exchange endpoint coverage.
- Order types: limit (Gtc/Ioc/Alo), market (FrontendMarket), stop-limit, stop-market, TP/SL.
- Position management: `updateLeverage` (cross/isolated), `updateIsolatedMargin`.
- Batch operations: `batchModify` for bulk order modifications.
- TWAP orders: `twapOrder` (5–1440 min duration) + `twapCancel`.
- Transfers: `withdraw3` (on-chain), `spotSend` (internal HL transfer).
- Advanced: `scheduleCancel`, `approveAgent`, `vaultTransfer`.
- EIP-712 signing: phantom agent signature pattern (msgpack + keccak256 + signTypedData).
- `hyperliquidRoundPrice()`: 5 significant digits, capped at (6 − szDecimals) decimal places.
- Resources: `exchange-endpoint.md`, `order-types.md`, `signing.md`.
- Examples: `place-order.md` (end-to-end walkthrough).

### Known Gaps
- No built-in order execution loop / retry on partial fills.
- CLOID (client order ID) usage not demonstrated in examples.
- Spot trading (non-perp) not covered — focus is on perpetuals.
- Vault-specific operations (vaultTransfer) documented but not exemplified.
