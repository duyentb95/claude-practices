<p align="center">
  <img src="https://img.shields.io/badge/NestJS-10-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Deploy-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" />
  <img src="https://img.shields.io/badge/Hyperliquid-DEX-6366f1?style=for-the-badge" />
</p>

<h1 align="center">Hyperliquid Insider Scanner</h1>

<p align="center">
  Real-time insider trade detection for Hyperliquid DEX — composite scoring engine, Copin behavioral profiling, cluster detection, MM/HFT filter, web dashboard & Lark alerts.
</p>

<p align="center">
  <a href="README.md"><b>English</b></a> · <a href="README.vi.md">Tiếng Việt</a>
</p>

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
  - [Detection Pipeline](#detection-pipeline)
  - [Scoring Engine](#scoring-engine)
  - [MM/HFT Filter](#mmhft-filter)
  - [Copin Behavioral Profiling](#copin-behavioral-profiling)
  - [Cluster Detection](#cluster-detection)
  - [Leaderboard Monitoring](#leaderboard-monitoring)
- [Apps](#apps)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development](#local-development)
  - [Docker](#docker)
  - [Deploy to Railway](#deploy-to-railway)
- [Configuration](#configuration)
- [Web Dashboard](#web-dashboard)
- [Architecture](#architecture)
- [Development Commands](#development-commands)

---

## Overview

A NestJS monorepo that monitors Hyperliquid perpetuals in real time, detects suspicious large trades, and scores wallets using a composite insider-probability model.

**Key features:**

- Subscribes to Hyperliquid WebSocket `trades` for all perp coins **including HIP-3 DEX pairs** (303+ coins)
- Sliding-window fill aggregation (500 ms extension, 3 s cap) to merge split orders
- Composite scoring 0–100: **A+B+C+D+E × F + G** (7 components)
- MM/HFT filter via native Hyperliquid `userFees` API (maker-rebate tier = skip)
- **Copin behavioral profiling** — classifies traders as ALGO_HFT / SMART_TRADER / INSIDER_SUSPECT / DEGEN
- **Send-graph cluster detection** — flags wallets funded by known suspects (+10 score boost)
- **Leaderboard monitoring** — pre-warms Copin cache for top-100 traders; alerts on unusual-coin trades
- Paginated fill history — up to 10 000 most recent orders per wallet
- All-time PnL as a scoring signal (profitable = higher insider probability)
- Web dashboard with live state + Lark webhook alerts

---

## How It Works

### Detection Pipeline

```
Hyperliquid WebSocket (trades)
        │
        ├─ { type: 'trades', coin }      ← standard perps (229 coins)
        └─ { type: 'trades', dex: 'ALL_DEXS' } ← HIP-3 DEX pairs
        │
        ▼
  WsScannerService          ← allPerpMetas (incl. HIP-3, filters isDelisted)
        │  sliding-window aggregation (500 ms / 3 s cap)
        ▼
  InsiderDetectorService    ← filters trades ≥ MIN_TRADE_USD
        │
        ├─ Layer 0: skip zero address (0x000...000)
        ├─ Layer 1: MM/HFT check via userFees API
        │           userAddRate ≤ 0 → skip (maker-rebate tier)
        ├─ Layer 2: ALGO_HFT check via Copin → skip (scoreG = −10)
        │           Smart-trader whitelist → raise FP filter threshold
        │
        ▼  REST inspection (via RateLimiterService — 1 100 ms queue)
  inspectTrader()
        ├─ getUserNonFundingLedger()   ← deposit/send pattern + cluster check
        ├─ getUserFillsPaginated()     ← up to 10k orders (aggregateByTime)
        ├─ getClearinghouseState()     ← margin / position
        └─ CopinInfoService            ← behavioral classification (scoreG)
              │
              ▼
        scoreTrader()  → InsiderScore (0–100) → upsertSuspect()
              │
              └─ LarkAlertService  ← webhook alert if score ≥ threshold
```

### Scoring Engine

Composite score **(A + B + C + D + E) × F + G**, capped at 100:

| Component | Range | Signal |
|-----------|------:|--------|
| **A** Deposit-to-Trade Speed | 0–25 | Gap between last deposit/send and trade detection |
| **B** Wallet Freshness & Quality | −8–20 | Age · 90-day order count · 90-day win rate · all-time PnL |
| **C** Trade Size vs Market | 0–20 | Notional / 24h volume + OI ratio |
| **D** Position Concentration | 0–15 | Margin utilization · implied leverage |
| **E** Ledger Purity | 0–10 | Deposit-only wallet, no withdrawals |
| **F** Behavioral Multiplier | ×1.0–1.5 | Combo bonuses (immediate + fresh + all-in) |
| **G** Copin Behavioral Score | −10–+10 | Trader archetype from 30-day Copin stats |

**Component G — Copin archetype score:**

| Archetype | scoreG | Criteria |
|-----------|-------:|----------|
| `ALGO_HFT` | −10 | ≥200 trades/30d, avg hold ≤1h, ≥3 orders/pos → **hard skip** |
| `INSIDER_SUSPECT` (strong) | +10 | ≥80% WR, ≤20 trades, ≤24h hold, 0 liquidations |
| `SMART_TRADER` | −8 | ≥55% WR, PL≥1.5×, PnL≥$10k, age≥30d → FP filter |
| `DEGEN` | −5 | ≥3 liquidations, avg leverage ≥30× |
| `INSIDER_SUSPECT` (mild) | +5 | ≥65% WR, ≤30 trades, avg ROI≥20% |
| `NORMAL` / `UNKNOWN` | 0 | Default |

**Cluster boost:** +10 pts if wallet was funded by a known suspect (`LINKED_SUSPECT` flag).

**Alert levels:**

| Score | Level | Color |
|------:|-------|-------|
| ≥ 75 | `CRITICAL` | Red |
| ≥ 55 | `HIGH` | Orange |
| ≥ 40 | `MEDIUM` | Yellow |
| ≥ 25 | `LOW` | Blue |
| < 25 | `NONE` | — (not recorded) |

**Wallet types detected:** `GHOST` · `ONE_SHOT` · `SUB_ACCOUNT` · `FRESH` · `WHALE` · `NORMAL`

**Insider flags:**

| Flag | Meaning |
|------|---------|
| `LARGE` | Trade ≥ MIN_TRADE_USD |
| `MEGA` | Trade ≥ MEGA_TRADE_USD |
| `NEW_ACCT` | <30 fills in 90 days |
| `FIRST` | First-ever trade on this coin |
| `FRESH_DEP` | Deposited within 24h of trade |
| `DEP_ONLY` | No withdrawals ever |
| `GHOST` | Deposit-only, almost no history |
| `ONE_SHOT` | ≤2 deposits, ≤3 fills, young wallet |
| `ALL_IN` | Margin utilization >90% |
| `HIGH_LEV` | Implied leverage ≥20× |
| `DEAD_MKT` | Trading illiquid coin (<$100k/day) |
| `HIGH_OI` | Trade >10% of open interest |
| `HFT` | Maker-rebate tier via userFees API |
| `COPIN_SUSP` | Copin: high WR + few trades + short hold → insider pattern |
| `SMART` | Copin: established profitable trader (FP indicator) |
| `LINKED` | Funded by a known suspect (cluster) |
| `LB_COIN` | Leaderboard wallet trading unusual coin |
| `VOL_SPIKE` | 24h volume > 3× EMA baseline (news/event day, less suspicious) |
| `NEW_LIST` | Coin appeared in market < 48h ago (post-startup new listing) |

### MM/HFT Filter

| Layer | Check | Action |
|-------|-------|--------|
| **0** | Address = `0x000...000` | Hard-skip in `bufferTrade()` |
| **1** | `userFees` API: `userAddRate ≤ 0` | Skip inspection, flag `HFT`; cached 24 h |
| **2** | Copin: `ALGO_HFT` archetype | Skip inspection (scoreG = −10); cached 30 min |

### Copin Behavioral Profiling

Fetches 30-day statistics from [Copin API](https://copin.io) for each inspected wallet, classifying traders into 5 archetypes. This drives component **G** of the scoring formula and provides early false-positive filtering:

- **ALGO_HFT**: algorithmic high-frequency traders — skipped entirely
- **SMART_TRADER**: established profitable traders — score penalty (reduces FP)
- **INSIDER_SUSPECT**: suspicious win-rate/pattern profile — score bonus
- **DEGEN**: chronic over-leveraged liquidations — score penalty
- **NORMAL / UNKNOWN**: no signal

Results cached 30 min per address. Rate-limited to 30 req/min.

Requires `COPIN_API_KEY` env var. Gracefully degrades (G = 0) if disabled.

### Cluster Detection

When inspecting a wallet's ledger, `inspectTrader()` scans all `send`-type entries. If the sender address matches any known suspect in the current session, the wallet receives:
- `LINKED_SUSPECT` flag
- +10 score boost
- Alert-level recalculation with boosted score
- Lark card shows the funding address

### Leaderboard Monitoring

`LeaderboardMonitorService` refreshes the top-100 Hyperliquid traders (by 30d PnL) every 6 hours via Copin API, pre-warming the classification cache. When a leaderboard wallet trades a coin outside its historical fingerprint, a separate yellow Lark alert fires (`LB_COIN` flag).

### Volume EMA Baseline

Each coin's 24h notional volume is tracked as an exponential moving average (α = 0.1, updated every ~60 s). When today's volume exceeds 3× the EMA baseline, the coin receives a `VOL_SPIKE` flag and `scoreC` is reduced by 3 points (news/event day → insider trades are less anomalous). When volume is below 0.5× EMA (quiet market), `scoreC` gains +2 (trade stands out more). Requires 10 EMA samples (~10 min) before activating.

### New Listing Detection

`InsiderDetectorService` tracks when each coin first appears in `refreshCoinTiers()`. All coins present at scanner startup are marked as baseline (no flag). Any coin appearing after startup receives the `NEW_LISTING` flag and a `scoreC` boost of +8 for a 48-hour window. This catches the classic pattern of insiders buying a new perpetual listing before public announcement.

### Daily FP Digest

Once per day at the configured UTC hour, the scanner sends a grey Lark digest card listing HIGH/CRITICAL suspects that show false-positive indicators (SMART_TRADER archetype, DEGEN archetype, VOLUME_SPIKE without hot flags). This helps operators whitelist legitimate traders and tune the scoring thresholds.

---

## Apps

| App | Port | Description |
|-----|-----:|-------------|
| `insider-scanner` | `WEB_PORT` (default 3235) | Real-time insider scanner — web dashboard |
| `data-analytics` | `PORT` (default 3234) | Read-only analytics REST API for trader data |

---

## Getting Started

### Prerequisites

- Node.js ≥ 18 (tested on v22)
- npm
- (Optional) Docker & Docker Compose
- (Optional) [Railway CLI](https://docs.railway.app/develop/cli) for cloud deploy

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in values
cp .env.example .env

# 3. Start insider-scanner in watch mode
npm run start:dev:insider-scanner
```

Web dashboard: **http://localhost:3235** (or the port set by `WEB_PORT`)

### Docker

```bash
cp .env.example .env
# Optional: set LARK_WEBHOOK_URL for alerts

docker compose up --build
```

### Deploy to Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
3. Set environment variables (see [Configuration](#configuration))
4. Railway auto-detects the `Dockerfile` and builds

> **Production:** https://insider-scanner-production.up.railway.app

---

## Configuration

All variables are optional — defaults work out of the box for Hyperliquid mainnet.

### Core

| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_PORT` | `3235` | HTTP port for the web dashboard |
| `HYPER_WS_URL` | `wss://api.hyperliquid.xyz/ws` | Hyperliquid WebSocket endpoint |
| `HYPER_API_URL` | `https://api.hyperliquid.xyz` | Hyperliquid REST endpoint |
| `MIN_TRADE_USD` | `100000` | Minimum trade size to flag (USD) |
| `MEGA_TRADE_USD` | `1000000` | Mega trade threshold — immediate Lark alert |
| `NEW_TRADER_FILLS_THRESHOLD` | `30` | 90-day order count below this = "new account" |
| `REST_RATE_LIMIT_MS` | `1100` | Delay between REST calls (≈ 54 calls/min) |
| `LARK_WEBHOOK_URL` | _(empty)_ | Lark bot webhook URL — leave empty to disable |
| `LARK_ALERT_COOLDOWN_MS` | `600000` | Min ms between two alerts for the same address |

### Copin Integration

| Variable | Default | Description |
|----------|---------|-------------|
| `COPIN_API_KEY` | _(empty)_ | Copin API key — required to enable behavioral scoring |
| `COPIN_ENABLED` | `true` if key set | Set to `false` to disable (scoreG = 0 for all) |
| `COPIN_RATE_LIMIT_MS` | `2000` | Min ms between Copin API calls |
| `COPIN_API_URL` | `https://api.copin.io` | Copin API base URL |

### Leaderboard Monitoring

| Variable | Default | Description |
|----------|---------|-------------|
| `LEADERBOARD_REFRESH_MS` | `21600000` | Leaderboard refresh interval (default 6h) |
| `LEADERBOARD_SIZE` | `100` | Number of top traders to track |
| `LEADERBOARD_ALERT_ENABLED` | `true` | Enable unusual-coin alerts for leaderboard wallets |

### Phase 3 — Volume & FP Digest

| Variable | Default | Description |
|----------|---------|-------------|
| `FP_DIGEST_ENABLED` | `true` | Enable daily FP digest Lark alert |
| `FP_DIGEST_HOUR` | `8` | UTC hour to send daily FP digest (0–23) |

Copy `.env.example` to `.env` and override as needed.

---

## Web Dashboard

`GET /` — Live dashboard auto-refreshing every 2 s

`GET /api/state` — JSON snapshot used by the dashboard

```jsonc
{
  "stats": {
    "connected": true,
    "subscribedCoins": 303,
    "tradesReceived": 15000,
    "largeTradesFound": 42,
    "suspectsFound": 5,
    "queueLength": 0
  },
  "trades": [ /* LargeTrade[] — last 50 */ ],
  "suspects": [
    {
      "address": "0xabc…",
      "insiderScore": 78,
      "alertLevel": "CRITICAL",
      "walletType": "GHOST",
      "totalUsd": 2500000,
      "tradeCount": 3,
      "coins": ["BTC", "ETH"],
      "flags": ["FRESH_DEP", "ALL_IN", "DEP_ONLY", "LINKED"],
      "depositToTradeGapMs": 240000,
      "linkedSuspectAddress": "0xdef…",    // set if funded by known suspect
      "isLeaderboardWallet": false,
      "copinProfile": {
        "archetype": "INSIDER_SUSPECT",
        "confidence": 0.8,
        "scoreG": 10,
        "signals": ["85% WR", "12 trades", "avg hold 4h", "no liq"],
        "d30": {
          "winRate": 85,
          "totalTrade": 12,
          "realisedPnl": 45000,
          "avgLeverage": 10,
          "avgDuration": 14400,
          "runTimeDays": 15,
          "totalLiquidation": 0
        }
      },
      "profile": { "fillCount90d": 0, "accountValue": 240000 }
    }
  ],
  "leaderboard": {
    "size": 100,
    "lastRefreshedAt": 1741500000000,
    "preWarmCount": 97
  },
  "logs": [ /* last 8 log lines */ ],
  "uptime": 86400000
}
```

---

## Architecture

```
apps/
├── insider-scanner/
│   └── src/
│       ├── configs/                   # Env vars & constants
│       ├── frameworks/
│       │   ├── hyperliquid/           # Read-only REST client (POST /info)
│       │   └── copin/                 # Copin API client + behavioral classification
│       ├── scanner/
│       │   ├── ws-scanner.service.ts           # WebSocket + fill aggregation (HIP-3 incl.)
│       │   ├── insider-detector.service.ts     # Scoring engine & suspect registry
│       │   ├── leaderboard-monitor.service.ts  # Top-100 tracker + unusual-coin alerts
│       │   ├── rate-limiter.service.ts         # Sequential REST queue (1 100 ms)
│       │   └── lark-alert.service.ts           # Lark webhook alerts
│       └── web/
│           └── app.controller.ts              # GET / dashboard · GET /api/state
└── data-analytics/
    └── src/
        ├── analytics/        # Trader & market analytics endpoints
        ├── collector/        # Cron jobs to warm Redis cache
        └── frameworks/       # Hyperliquid REST client + Redis cache
```

**Hyperliquid API** — all calls via `POST /info`:

```
{"type": "allPerpMetas"}                                        → all perp metadata incl. HIP-3 (isDelisted field)
{"type": "metaAndAssetCtxs"}                                    → standard perps metadata + market ctx
{"type": "userFillsByTime", "user": "0x…", "startTime": ms}    → fill history (paginated, 10k)
{"type": "clearinghouseState", "user": "0x…"}                  → positions + margin
{"type": "userNonFundingLedgerUpdates", "user": "0x…"}         → deposits / withdrawals / sends
{"type": "userFees", "user": "0x…"}                            → fee tier (MM/HFT detection)
```

**WebSocket subscriptions:**

```
{ type: 'trades', coin: 'BTC' }        → standard perp trades (per-coin)
{ type: 'trades', dex: 'ALL_DEXS' }   → all HIP-3 DEX pair trades (single subscription)
```

---

## Development Commands

```bash
# Install dependencies
npm install

# Start in watch mode
npm run start:dev:insider-scanner
npm run start:dev              # data-analytics

# Build
nest build insider-scanner
nest build data-analytics

# Format & lint
npm run format
npm run lint

# Test
npm run test
npm run test:watch

# Run a single test file
npx jest path/to/file.spec.ts
```
