<p align="center">
  <img src="https://img.shields.io/badge/NestJS-10-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Deploy-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" />
  <img src="https://img.shields.io/badge/Hyperliquid-DEX-6366f1?style=for-the-badge" />
</p>

<h1 align="center">Hyperliquid Insider Scanner</h1>

<p align="center">
  Real-time insider trade detection for Hyperliquid DEX — composite scoring engine, MM/HFT filter, web dashboard & Lark alerts.
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

- Subscribes to Hyperliquid WebSocket `trades` channel for all perp coins
- Sliding-window fill aggregation (500 ms extension, 3 s cap) to merge split orders
- Composite scoring 0–100 across 5 components + behavioral multiplier
- MM/HFT filter via native Hyperliquid `userFees` API (maker-rebate tier = skip)
- Paginated fill history — up to 10 000 most recent orders per wallet
- All-time PnL as a scoring signal (profitable = higher insider probability)
- Web dashboard with live state + Lark webhook alerts

---

## How It Works

### Detection Pipeline

```
Hyperliquid WebSocket (trades)
        │
        ▼
  WsScannerService          ← subscribes to all perp coins
        │  sliding-window aggregation (500 ms / 3 s cap)
        ▼
  InsiderDetectorService    ← filters trades ≥ MIN_TRADE_USD
        │
        ├─ Layer 0: skip zero address (0x000...000)
        ├─ Layer 1: MM/HFT check via userFees API
        │           userAddRate ≤ 0 → skip (maker-rebate tier)
        │
        ▼  REST inspection (via RateLimiterService — 1 100 ms queue)
  inspectTrader()
        ├─ getUserNonFundingLedger()   ← deposit/send pattern
        ├─ getUserFillsPaginated()     ← up to 10k orders (aggregateByTime)
        └─ getClearinghouseState()     ← margin / position
              │
              ▼
        scoreTrader()  → InsiderScore (0–100) → upsertSuspect()
              │
              └─ LarkAlertService  ← webhook alert if score ≥ threshold
```

### Scoring Engine

Composite score **A + B + C + D + E × F**, capped at 100:

| Component | Max pts | Signal |
|-----------|--------:|--------|
| **A** Deposit-to-Trade Speed | 25 | Gap between last deposit/send and trade detection |
| **B** Wallet Freshness & Quality | 20 | Age · 90-day order count · 90-day win rate · all-time PnL |
| **C** Trade Size vs Market | 20 | Notional / 24h volume + OI ratio |
| **D** Position Concentration | 15 | Margin utilization · implied leverage |
| **E** Ledger Purity | 10 | Deposit-only wallet, no withdrawals |
| **F** Behavioral Multiplier | ×1.0–1.5 | Combo bonuses (immediate + fresh + all-in) |

**Alert levels:**

| Score | Level | Color |
|------:|-------|-------|
| ≥ 75 | `CRITICAL` | Red |
| ≥ 55 | `HIGH` | Orange |
| ≥ 40 | `MEDIUM` | Yellow |
| ≥ 25 | `LOW` | Blue |
| < 25 | `NONE` | — (not recorded) |

**Wallet types detected:** `GHOST` · `ONE_SHOT` · `SUB_ACCOUNT` · `FRESH` · `WHALE` · `NORMAL`

**Insider flags:** `LARGE` · `MEGA` · `NEW_ACCT` · `FIRST` · `FRESH_DEP` · `DEP_ONLY` · `GHOST` · `ONE_SHOT` · `ALL_IN` · `HIGH_LEV` · `DEAD_MKT` · `HIGH_OI` · `HFT`

### MM/HFT Filter

| Layer | Check | Action |
|-------|-------|--------|
| **0** | Address = `0x000...000` | Hard-skip in `bufferTrade()` |
| **1** | `userFees` API: `userAddRate ≤ 0` | Skip inspection, flag `HFT`; cached 24 h |

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

Copy `.env.example` to `.env` and override as needed.

---

## Web Dashboard

`GET /` — Live dashboard auto-refreshing every 2 s

`GET /api/state` — JSON snapshot used by the dashboard

```jsonc
{
  "stats": { "largeTradesFound": 42, "suspectsFound": 5, "queueLength": 0 },
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
      "flags": ["FRESH_DEP", "ALL_IN", "DEP_ONLY"],
      "depositToTradeGapMs": 240000,
      "profile": { "fillCount90d": 0, "accountValue": 240000 }
    }
  ],
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
│       ├── configs/          # Env vars & constants
│       ├── frameworks/
│       │   └── hyperliquid/  # Read-only REST client (POST /info)
│       ├── scanner/
│       │   ├── ws-scanner.service.ts      # WebSocket + fill aggregation
│       │   ├── insider-detector.service.ts # Scoring engine & suspect registry
│       │   ├── rate-limiter.service.ts    # Sequential REST queue (1 100 ms)
│       │   └── lark-alert.service.ts      # Lark webhook alerts
│       └── web/
│           └── app.controller.ts          # GET / dashboard · GET /api/state
└── data-analytics/
    └── src/
        ├── analytics/        # Trader & market analytics endpoints
        ├── collector/        # Cron jobs to warm Redis cache
        └── frameworks/       # Hyperliquid REST client + Redis cache
```

**Hyperliquid API** — all calls via `POST /info`:

```
{"type": "metaAndAssetCtxs"}                                    → token metadata + market ctx
{"type": "userFillsByTime", "user": "0x…", "startTime": ms}    → fill history (paginated, 10k)
{"type": "clearinghouseState", "user": "0x…"}                  → positions + margin
{"type": "userNonFundingLedgerUpdates", "user": "0x…"}         → deposits / withdrawals / sends
{"type": "userFees", "user": "0x…"}                            → fee tier (MM/HFT detection)
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
