<p align="center">
  <img src="https://img.shields.io/badge/NestJS-10-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Deploy-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" />
  <img src="https://img.shields.io/badge/Hyperliquid-DEX-6366f1?style=for-the-badge" />
</p>

<h1 align="center">Hyperliquid Insider Scanner</h1>

<p align="center">
  Phát hiện insider trading real-time trên Hyperliquid DEX — scoring engine tổng hợp, filter MM/HFT, web dashboard & Lark alerts.
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.vi.md"><b>Tiếng Việt</b></a>
</p>

---

## Mục lục

- [Tổng quan](#tổng-quan)
- [Cách hoạt động](#cách-hoạt-động)
  - [Pipeline phát hiện](#pipeline-phát-hiện)
  - [Scoring Engine](#scoring-engine)
  - [Filter MM/HFT](#filter-mmhft)
- [Danh sách App](#danh-sách-app)
- [Bắt đầu sử dụng](#bắt-đầu-sử-dụng)
  - [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
  - [Chạy local](#chạy-local)
  - [Docker](#docker)
  - [Deploy lên Railway](#deploy-lên-railway)
- [Cấu hình](#cấu-hình)
- [Web Dashboard](#web-dashboard)
- [Kiến trúc](#kiến-trúc)
- [Lệnh phát triển](#lệnh-phát-triển)

---

## Tổng quan

NestJS monorepo theo dõi perpetuals trên Hyperliquid theo thời gian thực, phát hiện các giao dịch lớn đáng ngờ và chấm điểm ví bằng mô hình composite insider-probability.

**Tính năng chính:**

- Subscribe WebSocket `trades` của Hyperliquid cho toàn bộ perp coins
- Sliding-window fill aggregation (500 ms extension, cap 3 s) để gộp các partial order
- Composite scoring 0–100 qua 5 thành phần + behavioral multiplier
- Filter MM/HFT qua native Hyperliquid `userFees` API (tier maker-rebate = bỏ qua)
- Paginated fill history — tối đa 10 000 orders gần nhất mỗi ví
- All-time PnL là tín hiệu scoring (có lãi = xác suất insider cao hơn)
- Web dashboard real-time + Lark webhook alerts

---

## Cách hoạt động

### Pipeline phát hiện

```
Hyperliquid WebSocket (trades)
        │
        ▼
  WsScannerService          ← subscribe toàn bộ perp coins
        │  sliding-window aggregation (500 ms / cap 3 s)
        ▼
  InsiderDetectorService    ← lọc trade ≥ MIN_TRADE_USD
        │
        ├─ Layer 0: bỏ zero address (0x000...000)
        ├─ Layer 1: check MM/HFT qua userFees API
        │           userAddRate ≤ 0 → skip (maker-rebate tier)
        │
        ▼  REST inspection (qua RateLimiterService — queue 1 100 ms)
  inspectTrader()
        ├─ getUserNonFundingLedger()   ← pattern deposit/send
        ├─ getUserFillsPaginated()     ← tối đa 10k orders (aggregateByTime)
        └─ getClearinghouseState()     ← margin / position
              │
              ▼
        scoreTrader()  → InsiderScore (0–100) → upsertSuspect()
              │
              └─ LarkAlertService  ← webhook alert nếu score ≥ ngưỡng
```

### Scoring Engine

Điểm tổng hợp **A + B + C + D + E × F**, tối đa 100:

| Thành phần | Max | Tín hiệu |
|------------|----:|---------|
| **A** Tốc độ Deposit → Trade | 25 | Khoảng cách giữa lần deposit/send cuối và thời điểm phát hiện trade |
| **B** Độ mới & Chất lượng ví | 20 | Tuổi ví · số order 90 ngày · win rate 90 ngày · PnL all-time |
| **C** Quy mô trade vs Thị trường | 20 | Notional / 24h volume + tỷ lệ OI |
| **D** Độ tập trung vị thế | 15 | Margin utilization · implied leverage |
| **E** Độ sạch Ledger | 10 | Ví chỉ có deposit, không rút tiền |
| **F** Behavioral Multiplier | ×1.0–1.5 | Bonus combo (immediate + fresh + all-in) |

**Alert levels:**

| Điểm | Level | Màu |
|-----:|-------|-----|
| ≥ 75 | `CRITICAL` | Đỏ |
| ≥ 55 | `HIGH` | Cam |
| ≥ 40 | `MEDIUM` | Vàng |
| ≥ 25 | `LOW` | Xanh |
| < 25 | `NONE` | — (không lưu) |

**Loại ví phát hiện:** `GHOST` · `ONE_SHOT` · `SUB_ACCOUNT` · `FRESH` · `WHALE` · `NORMAL`

**Insider flags:** `LARGE` · `MEGA` · `NEW_ACCT` · `FIRST` · `FRESH_DEP` · `DEP_ONLY` · `GHOST` · `ONE_SHOT` · `ALL_IN` · `HIGH_LEV` · `DEAD_MKT` · `HIGH_OI` · `HFT`

### Filter MM/HFT

| Layer | Điều kiện | Hành động |
|-------|-----------|-----------|
| **0** | Address = `0x000...000` | Hard-skip trong `bufferTrade()` |
| **1** | `userFees` API: `userAddRate ≤ 0` | Bỏ qua inspection, gắn flag `HFT`; cache 24 h |

---

## Danh sách App

| App | Port | Mô tả |
|-----|-----:|-------|
| `insider-scanner` | `WEB_PORT` (mặc định 3235) | Scanner insider real-time — web dashboard |
| `data-analytics` | `PORT` (mặc định 3234) | REST API analytics read-only cho trader data |

---

## Bắt đầu sử dụng

### Yêu cầu hệ thống

- Node.js ≥ 18 (đã test trên v22)
- npm
- (Tuỳ chọn) Docker & Docker Compose
- (Tuỳ chọn) [Railway CLI](https://docs.railway.app/develop/cli) để deploy cloud

### Chạy local

```bash
# 1. Cài dependencies
npm install

# 2. Sao chép file env và điền giá trị
cp .env.example .env

# 3. Khởi động insider-scanner ở chế độ watch
npm run start:dev:insider-scanner
```

Web dashboard: **http://localhost:3235** (hoặc port đã set bằng `WEB_PORT`)

### Docker

```bash
cp .env.example .env
# Tuỳ chọn: set LARK_WEBHOOK_URL để nhận alert

docker compose up --build
```

### Deploy lên Railway

1. Push repo lên GitHub
2. Vào [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
3. Set các environment variables (xem [Cấu hình](#cấu-hình))
4. Railway tự detect `Dockerfile` và build

> **Production:** https://insider-scanner-production.up.railway.app

---

## Cấu hình

Tất cả biến đều có giá trị mặc định — hoạt động được ngay với Hyperliquid mainnet.

| Biến | Mặc định | Mô tả |
|------|---------|-------|
| `WEB_PORT` | `3235` | HTTP port cho web dashboard |
| `HYPER_WS_URL` | `wss://api.hyperliquid.xyz/ws` | Hyperliquid WebSocket endpoint |
| `HYPER_API_URL` | `https://api.hyperliquid.xyz` | Hyperliquid REST endpoint |
| `MIN_TRADE_USD` | `100000` | Kích thước trade tối thiểu để flag (USD) |
| `MEGA_TRADE_USD` | `1000000` | Ngưỡng mega trade — alert Lark ngay lập tức |
| `NEW_TRADER_FILLS_THRESHOLD` | `30` | Số order 90 ngày dưới mức này = "tài khoản mới" |
| `REST_RATE_LIMIT_MS` | `1100` | Delay giữa các REST call (≈ 54 calls/phút) |
| `LARK_WEBHOOK_URL` | _(trống)_ | Lark bot webhook URL — để trống để tắt |
| `LARK_ALERT_COOLDOWN_MS` | `600000` | Thời gian tối thiểu giữa 2 alert cùng địa chỉ (ms) |

Sao chép `.env.example` thành `.env` và thay đổi theo nhu cầu.

---

## Web Dashboard

`GET /` — Dashboard live tự refresh mỗi 2 giây

`GET /api/state` — JSON snapshot được dashboard sử dụng

```jsonc
{
  "stats": { "largeTradesFound": 42, "suspectsFound": 5, "queueLength": 0 },
  "trades": [ /* LargeTrade[] — 50 giao dịch gần nhất */ ],
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
  "logs": [ /* 8 dòng log gần nhất */ ],
  "uptime": 86400000
}
```

---

## Kiến trúc

```
apps/
├── insider-scanner/
│   └── src/
│       ├── configs/          # Env vars & constants
│       ├── frameworks/
│       │   └── hyperliquid/  # REST client read-only (POST /info)
│       ├── scanner/
│       │   ├── ws-scanner.service.ts      # WebSocket + fill aggregation
│       │   ├── insider-detector.service.ts # Scoring engine & suspect registry
│       │   ├── rate-limiter.service.ts    # Sequential REST queue (1 100 ms)
│       │   └── lark-alert.service.ts      # Lark webhook alerts
│       └── web/
│           └── app.controller.ts          # GET / dashboard · GET /api/state
└── data-analytics/
    └── src/
        ├── analytics/        # Endpoints analytics trader & market
        ├── collector/        # Cron jobs làm ấm Redis cache
        └── frameworks/       # Hyperliquid REST client + Redis cache
```

**Hyperliquid API** — tất cả call qua `POST /info`:

```
{"type": "metaAndAssetCtxs"}                                    → metadata token + market ctx
{"type": "userFillsByTime", "user": "0x…", "startTime": ms}    → lịch sử fill (phân trang, 10k)
{"type": "clearinghouseState", "user": "0x…"}                  → positions + margin
{"type": "userNonFundingLedgerUpdates", "user": "0x…"}         → deposit / withdrawal / send
{"type": "userFees", "user": "0x…"}                            → fee tier (phát hiện MM/HFT)
```

---

## Lệnh phát triển

```bash
# Cài dependencies
npm install

# Chạy ở chế độ watch
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

# Chạy một file test cụ thể
npx jest path/to/file.spec.ts
```
