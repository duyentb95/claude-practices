# Hyperliquid Insider Scanner — NestJS Monorepo

NestJS monorepo chứa analytics tools cho Hyperliquid DEX.

## Apps

| App | Port | Mô tả |
|-----|------|--------|
| `data-analytics` | 3234 | Read-only analytics API cho trader data |
| `insider-scanner` | 3235 | Real-time insider trade scanner (web UI) |

---

## insider-scanner

Scan real-time trades trên Hyperliquid, phát hiện pattern insider trading:
- Fresh deposit → immediate large trade
- Ghost wallets, one-shot wallets
- Composite scoring engine (0–100)
- MM/HFT filter via Hyperliquid `userFees` API

**Web UI**: `http://localhost:3235`

### Chạy local (development)

```bash
npm install
npm run start:dev:insider-scanner
```

### Chạy bằng Docker

```bash
cp .env.example .env
# Điền LARK_WEBHOOK_URL nếu muốn nhận alert

docker compose up --build
```

### Deploy lên Railway

1. Push repo lên GitHub
2. Vào [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Set environment variables (từ `.env.example`)
4. Railway tự detect `Dockerfile` và build

**Production**: https://insider-scanner-production.up.railway.app

### Environment Variables

Xem `.env.example` để biết đầy đủ biến cần thiết.

---

## Development

```bash
# Install dependencies
npm install

# Format & lint
npm run format
npm run lint

# Build specific app
nest build insider-scanner
nest build data-analytics

# Test
npm run test
```

## Monorepo Structure

```
apps/
  data-analytics/      Analytics REST API
  insider-scanner/     Insider trade scanner
    src/
      configs/         Env vars & constants
      scanner/         WS scanner, detector, rate limiter, Lark alerts
      web/             HTTP controller (dashboard + /api/state)
      frameworks/      Hyperliquid REST client
```
