# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
# Start hyperliquid-bot in watch mode (registered in nest-cli.json)
npm run start:dev:hyperliquid-bot

# Build specific app
nest build hyperliquid-bot
nest build hyper-rau

# Format, lint, test
npm run format
npm run lint
npm run test
npm run test:watch

# Run a single test file
npx jest path/to/file.spec.ts
```

## Monorepo Structure

NestJS monorepo with two active trading apps in `apps/`:

| App | Port | Config source |
|-----|------|---------------|
| `hyperliquid-bot` | 3233 | Hardcoded in `ListenerService` |
| `hyper-rau` | `PORT` env var | Redis (`SOPConfig` via `TAG` env) |

Only `hyperliquid-bot` is registered in `nest-cli.json`. The `hyper-rau` app must be built/run with `nest build hyper-rau` / `nest start hyper-rau`.

## hyperliquid-bot Architecture

Simpler, self-contained bot with trading pairs and credentials hardcoded in `listener/listener.service.ts`. No external config source.

- `ListenerService` — polls Hyperliquid REST API every 2s via `@Cron`. Places grid orders (long + short brackets) around current price, manages positions, takes profit at ±4.5%/5%.
- `HyperliquidSdkService` — signs and sends all exchange requests; uses EIP-712 phantom agent signatures via `ethers`.
- `HYPERLIQUID_CONFIG` — built at startup from `hyperliquid-pair-data.ts` (static snapshot of Hyperliquid's universe), maps symbol → `{index, szDecimals, maxLeverage}`.

## hyper-rau Architecture

Production-grade bot driven entirely by Redis config — no restart needed to change pairs or parameters.

### Data Flow

```
Redis (SOPConfig) ──► GlobalStateService ──► OrderManagementService
                                                     │
Hyperliquid WS ──► WsService ──────────────────────►│──► PlaceOrderService ──► HyperliquidSdkService
  l2Book, openOrders, userFills, positions            │
                                                 CacheService (Redis)
```

### Key Services

| Service | File | Role |
|---------|------|------|
| `WsService` | `listener/ws.service.ts` | WebSocket lifecycle, routes messages, pings every 5s |
| `GlobalStateService` | `listener/global-state.service.ts` | In-memory state; polls Redis for `SOPConfig` every 1s, pair metadata every 5s |
| `OrderManagementService` | `listener/order-management.service.ts` | Core trading logic: grid setup, order modification, position/TP management |
| `PlaceOrderService` | `listener/place-order.service.ts` | Wraps cancel/close HTTP calls; holds API key credentials |
| `HyperliquidSdkService` | `frameworks/hyperliquid/` | Same EIP-712 signing as hyperliquid-bot |
| `CacheService` | `frameworks/cache-service/` | Redis client wrapper (hashes, sets, sorted sets, queues) |
| `CrawlCexTradeConfigService` | `crawl-cex-info/` | Hourly cron fetching pair metadata from Bybit, Binance, OKX, BingX, Gate, Bitget, Hyperliquid into Redis |

### Redis Config Schema (`SOPConfig`)

```ts
{
  isEnable: boolean,         // master on/off; checked every second
  timeAutoClose: number,     // seconds before force-closing unfilled position
  timeDelay: number,         // ms delay before modifying orders
  pairConfigs: [{
    symbol: string,          // e.g. "BTC"
    percent: number[],       // grid levels, e.g. [1, 2, 3]
    takeProfitPercent: number[],
    totalVolume: number,     // total USDT allocated
    ratio: number[],         // volume weight per grid level
    isLong?: boolean,        // long-only if true
    minTpPercent?: number,   // minimum ROI% to trigger IOC close
  }]
}
```

Pair metadata is stored in Redis hash `pairsByExchange_HYPERLIQUID`.

### Environment Variables (hyper-rau)

Required in `.env`:
- `PORT`, `TAG`
- `API_KEY_RAU_1`, `SECRET_KEY_RAU_1`, `PASS_PHRASE_RAU_1` (optional vault address)
- `HYPER_WS_URL` (default: `wss://api.hyperliquid.xyz/ws`)
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_PASSWORD`

## Shared Patterns

**Grid/Bracket Strategy:** For each `percent[i]`, places a long limit at `bidPrice * (1 - percent/100)` and a short limit at `askPrice * (1 + percent/100)`. Order size = `(totalVolume / weightedSum) * ratio[i] * percent[i] / price`. Orders are modified when price moves >10% of the grid level from last placement price.

**Order Signing:** All exchange actions use EIP-712 phantom agent signatures. Action payload is msgpack-encoded + keccak256 hashed → signed with `ethers.Wallet.signTypedData`. Vault address appended when `passPhrase` is set.

**Price Rounding:** `hyperliquidRoundPrice()` rounds to 5 significant digits, capped at `max(0, 6 - szDecimals)` decimal places.

**Custom Decorators:**
- `@CronjobGuard()` — prevents re-entrant execution of scheduled methods
- `@SafeFunctionGuard()` — wraps async methods in try/catch to swallow errors

**`lossless-json`** is used to parse Hyperliquid API responses to avoid precision loss on large integers.
