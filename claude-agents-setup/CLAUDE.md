# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
# Start apps in watch mode
npm run start:dev:hyperliquid-bot
npm run start:dev:insider-scanner

# Build specific app
nest build hyperliquid-bot
nest build hyper-rau
nest build insider-scanner
nest build data-analytics

# Format, lint, test
npm run format
npm run lint
npm run test
npm run test:watch
npx jest path/to/file.spec.ts
```

## Monorepo Structure

NestJS monorepo with trading bots and analytics tools for Hyperliquid DEX.

| App | Port | Role |
|-----|------|------|
| `hyperliquid-bot` | 3233 | Grid trading bot, credentials hardcoded |
| `hyper-rau` | `PORT` env | Production bot driven by Redis config |
| `data-analytics` | 3234 | Read-only analytics API cho trader data |
| `insider-scanner` | 3235 | Real-time insider trade scanner (web UI) |

```
apps/
  hyperliquid-bot/     Grid bot (standalone)
  hyper-rau/           Production bot (Redis-driven)
  data-analytics/      Analytics REST API
  insider-scanner/     Insider trade scanner
    src/
      configs/         Env vars & constants
      scanner/         WS scanner, detector, rate limiter, Lark alerts
      web/             HTTP controller (dashboard + /api/state)
      frameworks/      Hyperliquid REST client
```

Only `hyperliquid-bot` is registered in `nest-cli.json`. Other apps: `nest build <app-name>` / `nest start <app-name>`.

---

## hyperliquid-bot Architecture

Self-contained grid trading bot. Trading pairs and credentials hardcoded in `listener/listener.service.ts`.

- `ListenerService` — polls REST API every 2s via `@Cron`. Grid orders (long + short brackets) around current price, TP at ±4.5%/5%.
- `HyperliquidSdkService` — EIP-712 phantom agent signatures via `ethers`.
- `HYPERLIQUID_CONFIG` — built from `hyperliquid-pair-data.ts`, maps symbol → `{index, szDecimals, maxLeverage}`.

## hyper-rau Architecture

Production-grade bot driven entirely by Redis config.

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
| `WsService` | `listener/ws.service.ts` | WS lifecycle, routes messages, pings every 5s |
| `GlobalStateService` | `listener/global-state.service.ts` | In-memory state; polls Redis for SOPConfig every 1s |
| `OrderManagementService` | `listener/order-management.service.ts` | Core trading logic: grid, order modify, TP |
| `PlaceOrderService` | `listener/place-order.service.ts` | Cancel/close HTTP calls; holds API credentials |
| `HyperliquidSdkService` | `frameworks/hyperliquid/` | EIP-712 signing |
| `CacheService` | `frameworks/cache-service/` | Redis wrapper (hashes, sets, sorted sets, queues) |
| `CrawlCexTradeConfigService` | `crawl-cex-info/` | Hourly cron fetching pair metadata from CEXs |

### Redis Config Schema (SOPConfig)

```ts
{
  isEnable: boolean,
  timeAutoClose: number,     // seconds before force-closing
  timeDelay: number,         // ms delay before modifying orders
  pairConfigs: [{
    symbol: string,          // "BTC"
    percent: number[],       // grid levels [1, 2, 3]
    takeProfitPercent: number[],
    totalVolume: number,     // USDT allocated
    ratio: number[],         // weight per level
    isLong?: boolean,
    minTpPercent?: number,
  }]
}
```

## insider-scanner Architecture

Real-time scanner detecting insider trading patterns on Hyperliquid.

- **WS Scanner**: Subscribe Hyperliquid WebSocket, stream trades real-time
- **Detector**: Composite scoring engine (0–100) cho mỗi suspicious trade
- **Patterns detected**: Fresh deposit → immediate large trade, ghost wallets, one-shot wallets
- **MM/HFT filter**: Copin API để loại bỏ market makers
- **Alerts**: Lark webhook khi score cao
- **Web UI**: Dashboard tại `http://localhost:3235` + `/api/state`

## Shared Patterns

- **Grid/Bracket Strategy**: Long limit at `bid * (1 - pct/100)`, short limit at `ask * (1 + pct/100)`
- **Order Signing**: EIP-712 phantom agent, msgpack + keccak256 + ethers.signTypedData
- **Price Rounding**: `hyperliquidRoundPrice()` — 5 sig digits, capped at `max(0, 6 - szDecimals)` decimals
- **Decorators**: `@CronjobGuard()` prevents re-entrant crons, `@SafeFunctionGuard()` wraps try/catch
- **JSON parsing**: `lossless-json` to avoid precision loss on large integers

## Hyperliquid API Reference

Base: `https://api.hyperliquid.xyz` — All info requests: POST /info

```typescript
{"type": "metaAndAssetCtxs"}                           // All tokens metadata + market context
{"type": "userFills", "user": "0x..."}                  // Trade history of a wallet
{"type": "clearinghouseState", "user": "0x..."}         // Current positions + margin
{"type": "openOrders", "user": "0x..."}                 // Open orders
{"type": "userFunding", "user": "0x...", "startTime": ms, "endTime": ms}  // Funding payments
{"type": "l2Book", "coin": "BTC"}                       // Orderbook snapshot
```

Rate limit: ~1200 req/min. Implement 50ms delay between sequential requests + exponential backoff on 429.

## Environment Variables

Xem `.env.example`. Key vars: `PORT`, `TAG`, `API_KEY_*`, `SECRET_KEY_*`, `PASS_PHRASE_*`, `HYPER_WS_URL`, `REDIS_*`, `LARK_WEBHOOK_URL`.

---

# AI Agent System

Dự án sử dụng Claude Code agents để tự động hóa việc phân tích insider trading.
Tất cả agent definitions nằm trong `.claude/agents/`.
Tất cả slash commands nằm trong `.claude/commands/`.

## Agent Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        LEAD (bạn hoặc Claude Code main session) │
│  Nhận yêu cầu → chọn strategy → spawn agents → tổng hợp kết quả│
└──────┬──────────┬───────────────┬───────────────┬───────────────┘
       │          │               │               │
  ┌────▼────┐ ┌───▼─────┐ ┌──────▼──────┐ ┌──────▼──────┐
  │ data-   │ │ wallet- │ │ pattern-    │ │ report-     │
  │ fetcher │ │ cluster │ │ scorer      │ │ writer      │
  │ (sonnet)│ │ (opus)  │ │ (opus)      │ │ (sonnet)    │
  └─────────┘ └─────────┘ └─────────────┘ └─────────────┘
  Fetch raw    Map wallet   Score insider   Generate
  data from    relationships probability    reports
  HL API       & clusters   per wallet      from findings
```

### Khi nào dùng gì

| Situation | Action |
|-----------|--------|
| Fetch data 1 wallet / 1 token | `Task(agent_type="data-fetcher")` — subagent, nhẹ |
| Cluster analysis 1 nhóm wallets | `Task(agent_type="wallet-clusterer")` — subagent |
| Score 1 wallet đã có data | `Task(agent_type="pattern-scorer")` — subagent |
| Tạo report từ findings có sẵn | `Task(agent_type="report-writer")` — subagent |
| Phân tích toàn diện 1 token mới list | Agent Team — cần agents giao tiếp với nhau |
| Scan nhiều tokens song song | Agent Team — parallel work |
| Investigation sâu 1 vụ suspicious | Agent Team — competing hypotheses |

### File Ownership (CRITICAL — Agent Teams)

Khi chạy Agent Teams, TUYỆT ĐỐI không cho 2 teammates ghi cùng 1 file/folder:

| Agent | Writes to | Reads from |
|-------|-----------|------------|
| data-fetcher | `data/raw/`, `data/cache/` | `apps/insider-scanner/src/frameworks/` |
| wallet-clusterer | `data/analysis/clusters/` | `data/raw/` |
| pattern-scorer | `data/analysis/scores/` | `data/raw/`, `data/analysis/clusters/` |
| report-writer | `reports/` | `data/analysis/` |

### Agent Team Templates

**Template: Token Investigation**
```
Tạo agent team "hl-{token}-{YYMMDD}" để phân tích token {TOKEN}:

Teammate 1 — data-fetcher (sonnet):
  "Fetch tất cả userFills cho token {TOKEN} trong {N} ngày qua.
   Lấy danh sách top wallets theo volume.
   Với mỗi top wallet, fetch clearinghouseState và userFills đầy đủ.
   Lưu vào data/raw/{TOKEN}/. Message lead khi xong."

Teammate 2 — wallet-clusterer (opus):
  "Đợi data-fetcher xong. Đọc data/raw/{TOKEN}/.
   Cluster wallets theo: timing correlation, fund flow, size pattern.
   Lưu cluster map vào data/analysis/clusters/{TOKEN}.json.
   Message pattern-scorer khi có clusters."

Teammate 3 — pattern-scorer (opus):
  "Đọc data/raw/{TOKEN}/ và clusters từ wallet-clusterer.
   Score mỗi wallet/cluster: pre-event accumulation, volume anomaly,
   win rate, timing precision. Output ranked list.
   Lưu vào data/analysis/scores/{TOKEN}.json."
```

**Template: Wallet Deep-Dive**
```
Tạo agent team "hl-wallet-{short_addr}-{YYMMDD}":

Teammate 1 — data-fetcher (sonnet):
  "Fetch TOÀN BỘ history của wallet {ADDRESS}: userFills, positions,
   funding, open orders. Lưu data/raw/wallets/{short_addr}/."

Teammate 2 — wallet-clusterer (opus):
  "Tìm related wallets: cùng fund source, similar trade pattern,
   correlated timing. Với mỗi related wallet, yêu cầu data-fetcher
   lấy thêm data. Lưu data/analysis/clusters/{short_addr}.json."

Teammate 3 — pattern-scorer (opus):
  "Score wallet và cluster. So sánh trades vs Hyperliquid announcements.
   Tính win rate trên new listings. Xây evidence chain.
   Lưu data/analysis/scores/{short_addr}.json."
```

**Template: Daily Scan**
```
Tạo agent team "hl-daily-{YYMMDD}":

Teammate 1 — data-fetcher (sonnet):
  "Fetch metaAndAssetCtxs để lấy danh sách tokens.
   So sánh với cached list để detect new listings/delists.
   Fetch top trades trong 24h qua cho mỗi new token.
   Lưu data/raw/daily/{YYMMDD}/."

Teammate 2 — pattern-scorer (opus):
  "Khi data-fetcher xong, scan tất cả trades hôm nay.
   Flag wallets có pattern: fresh deposit → large trade, one-shot,
   abnormal volume. Lưu data/analysis/scores/daily-{YYMMDD}.json."

Teammate 3 — report-writer (sonnet):
  "Khi pattern-scorer xong, đọc scores.
   Tạo Markdown daily report tại reports/daily/{YYMMDD}.md.
   Include: summary, new findings, top alerts, methodology."
```

### Extending the insider-scanner App

Khi cần thêm detection pattern hoặc cải thiện scoring vào `apps/insider-scanner/`:

1. Patterns mới → thêm vào `apps/insider-scanner/src/scanner/detector/`
2. Data sources mới → thêm vào `apps/insider-scanner/src/frameworks/`
3. Alert channels mới → thêm vào `apps/insider-scanner/src/scanner/` cạnh Lark
4. API endpoints mới → thêm vào `apps/insider-scanner/src/web/`

Tuân thủ NestJS conventions: injectable services, module registration, DTO validation.

### Quality Rules cho Agent Output

- Mọi data file PHẢI có metadata: `{fetched_at, source, query, data}`
- Mọi analysis PHẢI có: `{analyzed_at, methodology, confidence, evidence[]}`
- Mọi score PHẢI có: `{wallet, score_0_100, factors[], evidence_chain[]}`
- Wallet addresses: lowercase hex, truncate trong reports (`0x1a2b...9z0y`)
- Timestamps: UTC epoch ms trong data, format `YYYY-MM-DD HH:mm UTC+7` trong reports
- Amounts: USD format `$1,234.56`, token amounts giữ nguyên decimals
