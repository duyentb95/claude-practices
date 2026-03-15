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

NestJS monorepo with 3 registered apps in `nest-cli.json`:

| App | Port | Config source |
|-----|------|---------------|
| `hyperliquid-bot` | 3233 | hardcoded |
| `data-analytics` | 3234 | `PORT` env var |
| `insider-scanner` | 3235 | `WEB_PORT` env var |

Additional apps: `hyper-rau` (manual build), `momentum-bot` (Python, standalone).

## insider-scanner Architecture

Real-time scanner detecting insider trading patterns on Hyperliquid.

- `WsScannerService` — subscribes to Hyperliquid WebSocket `trades` channel for all perp coins; sliding-window aggregation (500ms + 3s cap) to merge partial fills.
- `InsiderDetectorService` — composite scoring engine (0–100); MM/HFT filter via Hyperliquid `userFees` API; maintains suspects map and large trades rolling window.
- `RateLimiterService` — sequential queue with 1100ms delay between REST calls.
- `HyperliquidInfoService` — read-only REST client; all calls POST `/info` (fills, ledger, positions, fee tier).
- `LarkAlertService` — Lark webhook alerts with AlertLevel color coding; supports custom per-user webhooks via `POST /api/webhook` with 24h TTL.
- `LeaderboardMonitorService` — tracks top-100 Copin leaderboard traders, flags unusual coin trades.
- `AppController` — `GET /` dashboard HTML; `GET /api/state` JSON state; `POST /api/webhook` register custom webhook; `DELETE /api/webhook` unregister.

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
             GHOST | ONE_SHOT | ALL_IN | HIGH_LEV | DEAD_MKT | HIGH_OI |
             VOL_SPIKE | NEW_LIST | HFT | COPIN_SUSP | SMART | LINKED | LB_COIN | DORMANT | CORREL
```

### Environment Variables (insider-scanner)

```
WEB_PORT=3235              # HTTP port (Railway uses PORT env automatically)
HYPER_WS_URL               # default: wss://api.hyperliquid.xyz/ws
HYPER_API_URL              # default: https://api.hyperliquid.xyz
MIN_TRADE_USD              # default: 100000
MEGA_TRADE_USD             # default: 1000000
LARK_WEBHOOK_URL           # Lark bot webhook (has hardcoded default)
LARK_ALERT_COOLDOWN_MS     # default: 600000 (10 min)
REST_RATE_LIMIT_MS         # default: 1100
NEW_TRADER_FILLS_THRESHOLD # default: 30
TRADER_CACHE_TTL_MS        # default: 300000 (5 min)
MAX_TRADE_HISTORY          # default: 50
MAX_SUSPECTS               # default: 30
COPIN_API_KEY              # Copin Analyzer API key (or X_API_KEY legacy)
COPIN_API_URL              # default: https://api.copin.io
COPIN_ENABLED              # default: true (if API key set)
COPIN_RATE_LIMIT_MS        # default: 2000
COPIN_WHITELIST_REFRESH_MS # default: 21600000 (6h)
LEADERBOARD_REFRESH_MS     # default: 21600000 (6h)
LEADERBOARD_SIZE           # default: 100
LEADERBOARD_ALERT_ENABLED  # default: true
FP_DIGEST_ENABLED          # default: true
FP_DIGEST_HOUR             # default: 8 (UTC)
SUPABASE_URL               # Supabase project URL (optional — persistence disabled if not set)
SUPABASE_KEY               # Supabase anon or service_role key
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
{"type": "allPerpMetas"}                               // All perp metadata incl. HIP-3; isDelisted field
{"type": "metaAndAssetCtxs"}                           // Standard perps metadata + market context (no HIP-3)
{"type": "userFills", "user": "0x..."}                  // Trade history
{"type": "userFillsByTime", "user": "0x...", "startTime": ms, "endTime": ms}
{"type": "clearinghouseState", "user": "0x..."}         // Positions + margin
{"type": "userNonFundingLedgerUpdates", "user": "0x..."}// Deposits, withdrawals, transfers
{"type": "userFees", "user": "0x..."}                   // Fee tier: userAddRate ≤ 0 = MM/HFT
{"type": "l2Book", "coin": "BTC"}                       // Orderbook snapshot
```

**HIP-3 WebSocket**: Subscribe `{ type: 'trades', dex: 'ALL_DEXS' }` to receive all HIP-3 DEX pair trades (one subscription covers all). Always combine with per-coin subscriptions for complete coverage.

Rate limit: ~1200 req/min. Use 1100ms sequential queue for REST calls.

## Documentation Policy

**IMPORTANT: Every code change must be accompanied by documentation updates:**
1. **CHANGELOG.md** in the relevant skill directory (e.g., `.claude/skills/insider-detector/CHANGELOG.md`, `.claude/skills/hl-data-fetcher/CHANGELOG.md`)
2. **Resource `.md` files** in the skill (e.g., `resources/hyperliquid-api.md`, `resources/websocket.md`, `resources/info-endpoint.md`) — update any endpoints, patterns, or behaviors that changed
3. **CLAUDE.md** — update architecture notes, env vars, API reference if affected
4. **Memory file** (`~/.claude/projects/.../memory/MEMORY.md`) — update if project structure or key patterns changed

This applies to all features, bug fixes, and API changes.

## Deployment

- **GitHub**: https://github.com/duyentb95/claude-practices
- **Railway**: https://insider-scanner-production.up.railway.app
- **Deploy**: `/deploy` slash command or `railway up --detach`
