# hl-trading

Skill for executing trades and managing positions on Hyperliquid DEX via the Exchange REST endpoint.

> **Warning:** All actions require EIP-712 private key signing. Always test on testnet first.
> Always confirm with the user before executing real trades or transfers.

## When to use

- Placing limit / market / stop orders on perpetuals
- Setting leverage and margin mode
- Executing TWAP orders for large sizes
- Managing positions (close, reduce, modify)
- USDC deposits, withdrawals, internal transfers
- Approving trading agents / sub-accounts

## Prerequisites

- `PRIVATE_KEY` env var (0x-prefixed 32-byte hex)
- Optional: `VAULT_ADDRESS` for vault trading
- `ethers` + `msgpackr` packages installed
- Asset index resolved from `metaAndAssetCtxs`

## Resources

- [`resources/exchange-endpoint.md`](resources/exchange-endpoint.md) — full Exchange endpoint reference
- [`resources/order-types.md`](resources/order-types.md) — order types and TIF options
- [`resources/signing.md`](resources/signing.md) — EIP-712 signing deep-dive
- [`examples/place-order.md`](examples/place-order.md) — end-to-end order placement walkthrough
- [`../../docs/hyperliquid-api-reference.md`](../../docs/hyperliquid-api-reference.md) — master API reference

## Safety Rules

1. **Testnet first** — always verify new code on `api.hyperliquid-testnet.xyz`
2. **User confirmation** — present trade details and ask before executing
3. **Never hardcode keys** — `process.env.PRIVATE_KEY` only
4. **Nonce = Date.now()** — unique millisecond timestamp per request
5. **Price precision** — use `hyperliquidRoundPrice()` for all price inputs
