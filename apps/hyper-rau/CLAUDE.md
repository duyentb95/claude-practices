# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

This is a NestJS module for `hyper-rau`, a Hyperliquid perpetual futures trading bot. The `src/` directory is designed to live as an app within a NestJS monorepo (e.g. `apps/hyper-rau/`). Build and run commands are executed from the monorepo root (the directory containing `package.json`, `nest-cli.json`, etc.).

## Commands (run from monorepo root)

```bash
# Start in dev/watch mode (replace <app-name> with the registered app name in nest-cli.json)
npm run start:dev:<app-name>

# Build
nest build <app-name>

# Lint
npm run lint

# Tests
npm run test
npm run test:watch
```

## Environment Variables

Required in `.env`:
- `PORT` - HTTP server port (default: `3000`)
- `TAG` - Identifies which config key to load from Redis (`REDIS_KEY.LISTENER_CONFIG` hash field)
- `API_KEY_RAU_1` - Hyperliquid wallet address (checksummed)
- `SECRET_KEY_RAU_1` - Wallet private key for signing orders
- `PASS_PHRASE_RAU_1` - Optional vault address (for sub-account trading)
- `HYPER_WS_URL` - WebSocket endpoint (default: `wss://api.hyperliquid.xyz/ws`)
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_PASSWORD` - Redis connection

## Architecture

### Trading Strategy (Grid / SOP Orders)

The bot implements a grid/bracket order strategy around the current market price:
- For each configured pair and each `percent[i]`, it places a **long limit** at `bidPrice * (1 - percent/100)` and a **short limit** at `askPrice * (1 + percent/100)`
- Order size = `(totalVolume / weightedSum) * ratio[i] * percent[i] / price`
- Orders are modified when price moves by more than `percent * 10%` from the last placed price
- When a position is filled, a take-profit order is placed at `entryPrice * (1 ± tpPercent/100)`
- If a position is not closed by TP within `timeAutoClose` seconds, it is force-closed at market

### Data Flow

```
Redis (SOPConfig) ──► GlobalStateService ──► OrderManagementService
                                                     │
Hyperliquid WS ──► WsService ──────────────────────►│──► PlaceOrderService ──► HyperliquidSdkService
  l2Book (prices)                                    │
  openOrders                                         │
  userFills                                          ▼
  allDexsClearinghouseState (positions)         CacheService (Redis)
```

### Key Services

| Service | Location | Role |
|---|---|---|
| `WsService` | `listener/ws.service.ts` | Manages WebSocket lifecycle, routes incoming messages, pings every 5s |
| `GlobalStateService` | `listener/global-state.service.ts` | Holds in-memory state; reads `SOPConfig` and `hyperConfig` from Redis every second/5s |
| `OrderManagementService` | `listener/order-management.service.ts` | Core trading logic: setup orders, modify orders, manage positions, check rate limits |
| `PlaceOrderService` | `listener/place-order.service.ts` | Wraps HTTP cancel/close operations; holds the `apiKey` credentials |
| `HyperliquidSdkService` | `frameworks/hyperliquid/` | Signs and sends all requests to `https://api.hyperliquid.xyz`; handles EIP-712 signatures via `ethers` |
| `CacheService` | `frameworks/cache-service/` | Thin wrapper over Redis client with helpers for hashes, sets, sorted sets, queues |
| `CrawlCexTradeConfigService` | `crawl-cex-info/` | Hourly cron that fetches and caches pair metadata (szDecimals, index, maxLeverage) from Bybit, Binance, OKX, BingX, Gate, Bitget, Hyperliquid, Lighter into Redis |

### Runtime Configuration via Redis

The bot is controlled entirely through Redis without restarts:

- **`CONFIG`** hash field `<TAG>` → `SOPConfig` JSON:
  ```ts
  {
    isEnable: boolean,       // master on/off switch; checked every second
    timeAutoClose: number,   // seconds before force-closing a position
    timeDelay: number,       // ms delay before modifying orders
    pairConfigs: [{
      symbol: string,        // e.g. "BTC"
      percent: number[],     // grid levels, e.g. [1, 2, 3]
      takeProfitPercent: number[], // TP per level
      totalVolume: number,   // total USDT to allocate
      ratio: number[],       // volume weight per level
      isLong?: boolean,      // if true, only place long orders
      minTpPercent?: number  // minimum ROI% to trigger IOC close
    }]
  }
  ```
- **`pairsByExchange_HYPERLIQUID`** hash → per-pair metadata (`index`, `szDecimals`, `maxLeverage`), read every 5s and used for price rounding and asset IDs

### Custom Decorators

- **`@CronjobGuard()`** — Prevents re-entrant execution of a scheduled method; silently skips if already running
- **`@SafeFunctionGuard()`** — Wraps any async method in a try/catch to swallow and log errors without crashing

### Price Rounding

`HyperliquidSdkService.hyperliquidRoundPrice()` rounds to 5 significant digits, capped at `MAX_DECIMALS(6) - szDecimals` decimal places, per Hyperliquid's requirements.

### Order Signing

All exchange actions use EIP-712 phantom agent signatures:
- Action payload is msgpack-encoded + nonce appended
- Keccak256 hashed → phantom agent constructed → signed with `ethers.Wallet.signTypedData`
- If `passPhrase` (vault address) is set, it is appended to the payload as `vaultAddress`
