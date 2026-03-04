# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
# Start insider-scanner in watch mode
npm run start:dev:insider-scanner

# Build specific app
nest build insider-scanner
nest build data-analytics

# Format, lint, test
npm run format
npm run lint
npm run test
npm run test:watch

# Run a single test file
npx jest path/to/file.spec.ts
```

## Monorepo Structure

NestJS monorepo with 2 active apps in `apps/`:

| App | Port | Config source |
|-----|------|---------------|
| `data-analytics` | 3234 | `PORT` env var |
| `insider-scanner` | 3235 | `WEB_PORT` env var |

Both apps registered in `nest-cli.json`.

## insider-scanner Architecture

Real-time scanner detecting insider trading patterns on Hyperliquid.

- `WsScannerService` — subscribes to Hyperliquid WebSocket `trades` channel for all perp coins; sliding-window aggregation (500ms + 3s cap) to merge partial fills.
- `InsiderDetectorService` — composite scoring engine (0–100); MM/HFT filter via Hyperliquid `userFees` API; maintains suspects map and large trades rolling window.
- `RateLimiterService` — sequential queue with 1100ms delay between REST calls.
- `HyperliquidInfoService` — read-only REST client; all calls POST `/info` (fills, ledger, positions, fee tier).
- `LarkAlertService` — Lark webhook alerts with AlertLevel color coding.
- `AppController` — `GET /` dashboard HTML; `GET /api/state` JSON state.

### Scoring Engine

Composite score A+B+C+D+E × F (0–100):

| Component | Max | Signal |
|-----------|-----|--------|
| A: Deposit-to-Trade Speed | 25 | Gap between last deposit and trade detection time |
| B: Wallet Freshness | 20 | Wallet age + 90-day fill count |
| C: Trade Size vs Market | 20 | Notional vs 24h volume + OI ratio |
| D: Position Concentration | 15 | Margin utilization + implied leverage |
| E: Ledger Purity | 10 | Deposit-only wallet, no withdrawals |
| F: Multiplier | ×1.0–1.5 | Combo bonuses (immediate + fresh + all-in) |

### MM/HFT Filter

- **Layer 0**: Skip `0x000...000` (zero address) in `bufferTrade()`
- **Layer 1**: `userFees` API `userAddRate <= 0` → maker rebate tier → skip inspection, flag `HFT`
- **Cache**: HFT status cached 24h per address

### Key Enums (`trade.dto.ts`)

```ts
AlertLevel: CRITICAL(≥75) | HIGH(≥55) | MEDIUM(≥40) | LOW(≥25) | NONE
WalletType: GHOST | ONE_SHOT | FRESH | SUB_ACCOUNT | WHALE | NORMAL
InsiderFlag: LARGE | MEGA | NEW_ACCT | FIRST | FRESH_DEP | DEP_ONLY |
             GHOST | ONE_SHOT | ALL_IN | HIGH_LEV | DEAD_MKT | HIGH_OI | HFT
```

### Environment Variables (insider-scanner)

```
WEB_PORT=3235          # HTTP port (Railway uses PORT env automatically)
HYPER_WS_URL           # default: wss://api.hyperliquid.xyz/ws
HYPER_API_URL          # default: https://api.hyperliquid.xyz
MIN_TRADE_USD          # default: 100000
MEGA_TRADE_USD         # default: 1000000
LARK_WEBHOOK_URL       # optional Lark bot webhook
REST_RATE_LIMIT_MS     # default: 1100
```

## data-analytics Architecture

Read-only analytics platform for Hyperliquid trader data.

- REST API: trader stats, positions, fills, funding, market data, leaderboard
- Redis cache for market snapshots (1 min) and leaderboards (5 min)
- No signing/credentials needed

## Shared Patterns

**Order Signing:** EIP-712 phantom agent signatures. Action payload msgpack-encoded + keccak256 hashed → signed with `ethers.Wallet.signTypedData`. Vault address appended when `passPhrase` is set.

**Price Rounding:** `hyperliquidRoundPrice()` rounds to 5 significant digits, capped at `max(0, 6 - szDecimals)` decimal places.

**Custom Decorators:**
- `@CronjobGuard()` — prevents re-entrant execution of scheduled methods
- `@SafeFunctionGuard()` — wraps async methods in try/catch to swallow errors

**`lossless-json`** is used to parse Hyperliquid API responses to avoid precision loss on large integers.

**WebSocket import:** Use `import WebSocket = require('ws')` (not named import) in webpack-built apps.

## Hyperliquid API Reference

Base: `https://api.hyperliquid.xyz` — All info requests: `POST /info`

```typescript
{"type": "metaAndAssetCtxs"}                           // All tokens metadata + market context
{"type": "userFills", "user": "0x..."}                  // Trade history
{"type": "userFillsByTime", "user": "0x...", "startTime": ms, "endTime": ms}
{"type": "clearinghouseState", "user": "0x..."}         // Positions + margin
{"type": "userNonFundingLedgerUpdates", "user": "0x..."}// Deposits, withdrawals, transfers
{"type": "userFees", "user": "0x..."}                   // Fee tier: userAddRate ≤ 0 = MM/HFT
{"type": "l2Book", "coin": "BTC"}                       // Orderbook snapshot
```

Rate limit: ~1200 req/min. Use 1100ms sequential queue for REST calls.

## Deployment

- **GitHub**: https://github.com/duyentb95/claude-practices
- **Railway**: https://insider-scanner-production.up.railway.app
- **Deploy**: `/deploy` slash command or `railway up --detach`
