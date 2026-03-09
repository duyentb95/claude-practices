<p align="center">
  <img src="https://img.shields.io/badge/NestJS-10-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Deploy-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" />
  <img src="https://img.shields.io/badge/Hyperliquid-DEX-6366f1?style=for-the-badge" />
</p>

<h1 align="center">Hyperliquid Insider Scanner</h1>

<p align="center">
  Phát hiện insider trading real-time trên Hyperliquid DEX — scoring engine tổng hợp, phân tích hành vi Copin, phát hiện cluster, filter MM/HFT, web dashboard & Lark alerts.
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
  - [Phân tích hành vi Copin](#phân-tích-hành-vi-copin)
  - [Phát hiện Cluster](#phát-hiện-cluster)
  - [Theo dõi Leaderboard](#theo-dõi-leaderboard)
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

- Subscribe WebSocket `trades` của Hyperliquid cho toàn bộ perp coins **bao gồm các cặp HIP-3 DEX** (303+ coins)
- Sliding-window fill aggregation (500 ms extension, cap 3 s) để gộp các partial order
- Composite scoring 0–100: **A+B+C+D+E × F + G** (7 thành phần)
- Filter MM/HFT qua native Hyperliquid `userFees` API (tier maker-rebate = bỏ qua)
- **Phân tích hành vi Copin** — phân loại trader thành ALGO_HFT / SMART_TRADER / INSIDER_SUSPECT / DEGEN
- **Phát hiện cluster qua send-graph** — gắn flag cho ví được nạp tiền bởi suspect đã biết (+10 điểm)
- **Theo dõi Leaderboard** — pre-warm cache Copin cho top-100 trader; cảnh báo khi trade coin bất thường
- Paginated fill history — tối đa 10 000 orders gần nhất mỗi ví
- All-time PnL là tín hiệu scoring (có lãi = xác suất insider cao hơn)
- Web dashboard real-time + Lark webhook alerts

---

## Cách hoạt động

### Pipeline phát hiện

```
Hyperliquid WebSocket (trades)
        │
        ├─ { type: 'trades', coin }           ← perp tiêu chuẩn (229 coins)
        └─ { type: 'trades', dex: 'ALL_DEXS' } ← các cặp HIP-3 DEX
        │
        ▼
  WsScannerService          ← allPerpMetas (bao gồm HIP-3, lọc isDelisted)
        │  sliding-window aggregation (500 ms / cap 3 s)
        ▼
  InsiderDetectorService    ← lọc trade ≥ MIN_TRADE_USD
        │
        ├─ Layer 0: bỏ zero address (0x000...000)
        ├─ Layer 1: check MM/HFT qua userFees API
        │           userAddRate ≤ 0 → skip (maker-rebate tier)
        ├─ Layer 2: check ALGO_HFT qua Copin → skip (scoreG = −10)
        │           Smart-trader whitelist → nâng ngưỡng filter FP
        │
        ▼  REST inspection (qua RateLimiterService — queue 1 100 ms)
  inspectTrader()
        ├─ getUserNonFundingLedger()   ← pattern deposit/send + cluster check
        ├─ getUserFillsPaginated()     ← tối đa 10k orders (aggregateByTime)
        ├─ getClearinghouseState()     ← margin / position
        └─ CopinInfoService            ← phân loại hành vi (scoreG)
              │
              ▼
        scoreTrader()  → InsiderScore (0–100) → upsertSuspect()
              │
              └─ LarkAlertService  ← webhook alert nếu score ≥ ngưỡng
```

### Scoring Engine

Điểm tổng hợp **(A + B + C + D + E) × F + G**, tối đa 100:

| Thành phần | Khoảng | Tín hiệu |
|------------|-------:|---------|
| **A** Tốc độ Deposit → Trade | 0–25 | Khoảng cách giữa lần deposit/send cuối và thời điểm phát hiện trade |
| **B** Độ mới & Chất lượng ví | −8–20 | Tuổi ví · số order 90 ngày · win rate 90 ngày · PnL all-time |
| **C** Quy mô trade vs Thị trường | 0–20 | Notional / 24h volume + tỷ lệ OI |
| **D** Độ tập trung vị thế | 0–15 | Margin utilization · implied leverage |
| **E** Độ sạch Ledger | 0–10 | Ví chỉ có deposit, không rút tiền |
| **F** Behavioral Multiplier | ×1.0–1.5 | Bonus combo (immediate + fresh + all-in) |
| **G** Copin Behavioral Score | −10–+10 | Archetype trader từ thống kê 30 ngày Copin |

**Thành phần G — điểm archetype Copin:**

| Archetype | scoreG | Điều kiện |
|-----------|-------:|-----------|
| `ALGO_HFT` | −10 | ≥200 trades/30d, avg hold ≤1h, ≥3 orders/pos → **hard skip** |
| `INSIDER_SUSPECT` (mạnh) | +10 | ≥80% WR, ≤20 trades, hold ≤24h, 0 liquidation |
| `SMART_TRADER` | −8 | ≥55% WR, PL≥1.5×, PnL≥$10k, age≥30d → filter FP |
| `DEGEN` | −5 | ≥3 lần liquidation, avg leverage ≥30× |
| `INSIDER_SUSPECT` (nhẹ) | +5 | ≥65% WR, ≤30 trades, avg ROI≥20% |
| `NORMAL` / `UNKNOWN` | 0 | Mặc định |

**Cluster boost:** +10 điểm nếu ví được nạp tiền bởi suspect đã biết (flag `LINKED_SUSPECT`).

**Alert levels:**

| Điểm | Level | Màu |
|-----:|-------|-----|
| ≥ 75 | `CRITICAL` | Đỏ |
| ≥ 55 | `HIGH` | Cam |
| ≥ 40 | `MEDIUM` | Vàng |
| ≥ 25 | `LOW` | Xanh |
| < 25 | `NONE` | — (không lưu) |

**Loại ví phát hiện:** `GHOST` · `ONE_SHOT` · `SUB_ACCOUNT` · `FRESH` · `WHALE` · `NORMAL`

**Insider flags:**

| Flag | Ý nghĩa |
|------|---------|
| `LARGE` | Trade ≥ MIN_TRADE_USD |
| `MEGA` | Trade ≥ MEGA_TRADE_USD |
| `NEW_ACCT` | <30 fills trong 90 ngày |
| `FIRST` | Lần đầu trade coin này |
| `FRESH_DEP` | Nạp tiền trong vòng 24h trước trade |
| `DEP_ONLY` | Chưa bao giờ rút tiền |
| `GHOST` | Chỉ có deposit, gần như không có lịch sử |
| `ONE_SHOT` | ≤2 lần nạp, ≤3 fills, ví còn mới |
| `ALL_IN` | Margin utilization >90% |
| `HIGH_LEV` | Implied leverage ≥20× |
| `DEAD_MKT` | Giao dịch coin thanh khoản thấp (<$100k/ngày) |
| `HIGH_OI` | Trade >10% open interest |
| `HFT` | Tier maker-rebate qua userFees API |
| `LINKED` | Được nạp tiền bởi suspect đã biết (cluster) |
| `LB_COIN` | Ví leaderboard trade coin bất thường |

### Filter MM/HFT

| Layer | Điều kiện | Hành động |
|-------|-----------|-----------|
| **0** | Address = `0x000...000` | Hard-skip trong `bufferTrade()` |
| **1** | `userFees` API: `userAddRate ≤ 0` | Bỏ qua inspection, gắn flag `HFT`; cache 24 h |
| **2** | Copin: archetype `ALGO_HFT` | Bỏ qua inspection (scoreG = −10); cache 30 phút |

### Phân tích hành vi Copin

Lấy thống kê 30 ngày từ [Copin API](https://copin.io) cho mỗi ví được kiểm tra, phân loại trader thành 5 archetype. Đây là nền tảng của thành phần **G** trong công thức scoring và lọc false-positive sớm:

- **ALGO_HFT**: trader HFT algorithmic — bỏ qua hoàn toàn
- **SMART_TRADER**: trader có lợi nhuận ổn định — trừ điểm (giảm FP)
- **INSIDER_SUSPECT**: profile win-rate/pattern đáng ngờ — cộng điểm
- **DEGEN**: hay bị liquidation, over-leverage — trừ điểm
- **NORMAL / UNKNOWN**: không có tín hiệu

Kết quả cache 30 phút mỗi địa chỉ. Rate-limit 30 req/phút.

Yêu cầu env var `COPIN_API_KEY`. Tự động fallback (G = 0) nếu bị tắt.

### Phát hiện Cluster

Khi kiểm tra ledger của một ví, `inspectTrader()` quét tất cả các entry kiểu `send`. Nếu địa chỉ người gửi trùng với bất kỳ suspect nào trong phiên hiện tại, ví nhận:
- Flag `LINKED_SUSPECT`
- +10 điểm boost
- Tính lại alert-level với điểm đã tăng
- Lark card hiển thị địa chỉ nguồn tiền

### Theo dõi Leaderboard

`LeaderboardMonitorService` refresh top-100 trader Hyperliquid (theo PnL 30 ngày) mỗi 6 giờ qua Copin API, pre-warm cache phân loại. Khi một ví leaderboard trade coin nằm ngoài fingerprint lịch sử của họ, hệ thống gửi một Lark alert riêng màu vàng (flag `LB_COIN`).

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

### Core

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

### Tích hợp Copin

| Biến | Mặc định | Mô tả |
|------|---------|-------|
| `COPIN_API_KEY` | _(trống)_ | API key Copin — bắt buộc để bật behavioral scoring |
| `COPIN_ENABLED` | `true` nếu có key | Đặt `false` để tắt (scoreG = 0 cho tất cả) |
| `COPIN_RATE_LIMIT_MS` | `2000` | Khoảng cách tối thiểu giữa các Copin API call |
| `COPIN_API_URL` | `https://api.copin.io` | Base URL của Copin API |

### Theo dõi Leaderboard

| Biến | Mặc định | Mô tả |
|------|---------|-------|
| `LEADERBOARD_REFRESH_MS` | `21600000` | Chu kỳ refresh leaderboard (mặc định 6h) |
| `LEADERBOARD_SIZE` | `100` | Số lượng top trader cần theo dõi |
| `LEADERBOARD_ALERT_ENABLED` | `true` | Bật alert unusual-coin cho ví leaderboard |

Sao chép `.env.example` thành `.env` và thay đổi theo nhu cầu.

---

## Web Dashboard

`GET /` — Dashboard live tự refresh mỗi 2 giây

`GET /api/state` — JSON snapshot được dashboard sử dụng

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
      "flags": ["FRESH_DEP", "ALL_IN", "DEP_ONLY", "LINKED"],
      "depositToTradeGapMs": 240000,
      "linkedSuspectAddress": "0xdef…",    // địa chỉ suspect nguồn tiền (nếu có)
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
│       ├── configs/                   # Env vars & constants
│       ├── frameworks/
│       │   ├── hyperliquid/           # REST client read-only (POST /info)
│       │   └── copin/                 # Copin API client + phân loại hành vi
│       ├── scanner/
│       │   ├── ws-scanner.service.ts           # WebSocket + fill aggregation (có HIP-3)
│       │   ├── insider-detector.service.ts     # Scoring engine & suspect registry
│       │   ├── leaderboard-monitor.service.ts  # Theo dõi top-100 + alert coin bất thường
│       │   ├── rate-limiter.service.ts         # Sequential REST queue (1 100 ms)
│       │   └── lark-alert.service.ts           # Lark webhook alerts
│       └── web/
│           └── app.controller.ts              # GET / dashboard · GET /api/state
└── data-analytics/
    └── src/
        ├── analytics/        # Endpoints analytics trader & market
        ├── collector/        # Cron jobs làm ấm Redis cache
        └── frameworks/       # Hyperliquid REST client + Redis cache
```

**Hyperliquid API** — tất cả call qua `POST /info`:

```
{"type": "allPerpMetas"}                                        → metadata tất cả perp kể cả HIP-3
{"type": "metaAndAssetCtxs"}                                    → metadata perp tiêu chuẩn + market ctx
{"type": "userFillsByTime", "user": "0x…", "startTime": ms}    → lịch sử fill (phân trang, 10k)
{"type": "clearinghouseState", "user": "0x…"}                  → positions + margin
{"type": "userNonFundingLedgerUpdates", "user": "0x…"}         → deposit / withdrawal / send
{"type": "userFees", "user": "0x…"}                            → fee tier (phát hiện MM/HFT)
```

**WebSocket subscriptions:**

```
{ type: 'trades', coin: 'BTC' }        → trades perp tiêu chuẩn (từng coin)
{ type: 'trades', dex: 'ALL_DEXS' }   → tất cả trades các cặp HIP-3 DEX (1 subscription)
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
