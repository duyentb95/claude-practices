# Copin Analyzer API Reference (v2 — api-docs.copin.io)

> Source: https://api-docs.copin.io/api-reference/introduction
> Updated: 2026-03-05

## Authentication

**ALL requests require API key header:**

```
X-API-KEY: ${COPIN_API_KEY}
```

Load from environment variable. NEVER hardcode.

```bash
# .env
COPIN_API_KEY=your_actual_key_here
```

```typescript
const COPIN_HEADERS = {
  "X-API-KEY": process.env.COPIN_API_KEY,
  "Content-Type": "application/json"
};
```

## Base URL
```
https://api.copin.io
```

## Rate Limiting
**30 requests per minute.** Implement 2000ms delay between requests + exponential backoff on 429.

---

## ALL ENDPOINTS (19 total)

### ━━━ TRADER EXPLORER (Public + API Key) ━━━

#### 1. Position Statistic List GraphQL
```
POST /position-statistic/filter/graphql
Headers: X-API-KEY
```
Advanced GraphQL-style filtering for trader discovery across protocols.

#### 2. PnL Statistic
```
POST /position-statistic/pnl
Headers: X-API-KEY
```
PnL aggregation and time-series data for traders.

### ━━━ TRADER PROFILE ━━━

#### 3. Position Statistic of Trader (GET)
```
GET /{protocol}/position-statistic/{account}
Headers: X-API-KEY
```
All time-period statistics (D7/D15/D30/D60) for one trader in a single call.

#### 4. Position List By Account (POST)
```
POST /{protocol}/position/filter
Headers: X-API-KEY
Body: {pagination, queries: [{fieldName:"account",value:"0x..."},{fieldName:"status",value:"CLOSE"}], sortBy, sortType}
```

Position fields: `id, account, indexToken, size, fee, collateral, averagePrice, pnl, realisedPnl, roi, realisedRoi, isLong, isWin, isLiquidate, leverage, orderCount, orderIncreaseCount, orderDecreaseCount, durationInSecond, status, openBlockTime, closeBlockTime, protocol`

#### 5. Position By ID (GET)
```
GET /{protocol}/position/detail/{positionId}
Headers: X-API-KEY
```
Returns position + all orders array.

Order types: `OPEN, INCREASE, DECREASE, CLOSE, MARGIN_TRANSFERRED, LIQUIDATE`

Order fields: `id, account, txHash, blockNumber, blockTime, indexToken, sizeDeltaNumber, sizeNumber, collateralDeltaNumber, priceNumber, feeNumber, fundingRateNumber, fundingNumber, leverage, isLong, isOpen, isClose, type`

#### 6. Position By txHash (GET)
```
GET /{protocol}/position/detail/tx/{txHash}
Headers: X-API-KEY
```
Not available for Hyperliquid.

### ━━━ OPEN INTEREST ━━━

#### 7. Open Interest Position By GraphQL (POST)
```
POST /{protocol}/top-positions/opening/graphql
Headers: X-API-KEY
```

Legacy simple version:
```
POST /{protocol}/top-positions/opening
Body: {"pagination":{"limit":100,"offset":0},"sortBy":"size","sortType":"desc"}
```

### ━━━ LIVE TRADE ━━━

#### 8. Live Order By GraphQL (POST)
```
POST /order/filter/graphql
Headers: X-API-KEY
```
Real-time orders being placed NOW across all protocols.

#### 9. Live Position By GraphQL (POST)
```
POST /position/filter/graphql
Headers: X-API-KEY
```
Real-time position opens, closes, modifications happening NOW.

### ━━━ TRADER BOARD ━━━

#### 10. Trader Leaderboard (GET)
```
GET /leaderboards/page?protocol=HYPERLIQUID&queryDate={epoch_ms}&statisticType=MONTH&limit=20&offset=0&sort_by=ranking&sort_type=asc
Headers: X-API-KEY
```

sort_by: `ranking, totalPnl, totalRealisedPnl, totalVolume, totalFee, totalTrade, totalWin, totalLose, totalLiquidation, totalLiquidationAmount`

### ━━━ AUTHS (JWT) ━━━

| # | Method | Endpoint | Auth |
|---|--------|----------|------|
| 11 | POST | `/auth/login` | X-API-KEY |
| 12 | POST | `/auth/verify` | X-API-KEY |
| 13 | POST | `/auth/logout` | JWT |
| 14 | GET | `/auth/me` | JWT (`Authorization: <token>`) |

### ━━━ COPY TRADES (JWT Auth Required) ━━━

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 15 | GET | `/copy-wallets/list` | List copy wallets |
| 16 | POST | `/copy-trade/filter` | List active copy trades |
| 17 | POST | `/copy-position/filter` | List copy positions |
| 18 | GET | `/copy-order/{copyTradeId}` | Copy orders |
| 19 | POST | `/copy-trade/create` | Create copy trade |
| 20 | PUT | `/copy-trade/update/{id}` | Update settings |
| 21 | GET | `/copy-trade/pre-delete/{id}` | Pre-check delete |
| 22 | DEL | `/copy-trade/delete/{id}` | Delete copy trade |
| 23 | POST | `/copy-trade/activity-log` | Activity logs |
| 24 | GET | `/copy-wallets/hyperliquid-embedded/list` | HL embedded wallets |
| 25 | GET | `/tokens/list` | All supported tokens |

### ━━━ WALLETS (JWT Auth) ━━━

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 26 | POST | `/wallet/withdraw` | Withdraw |
| 27 | GET | `/wallet/deposit-withdraw-history` | Tx history |

### ━━━ MIXINS (Bulk/Advanced with API Key) ━━━

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 28 | POST | `/position-statistic/filter/search-after` | Cursor-based pagination (efficient for large scans) |
| 29 | POST | `/public/{protocol}/position/statistic/filter` | Main trader filter (also works without key for public) |
| 30 | POST | `/{protocol}/position/filter` | Position list (all accounts) |
| 31 | POST | `/{protocol}/order/filter` | Order list (all accounts) |

---

## TRADER STATISTICS — FULL FIELD REFERENCE

### Query Fields (`queries[].fieldName`)

| fieldName | values | Purpose |
|-----------|--------|---------|
| `type` | `D7`, `D15`, `D30`, `D60` | Time period filter |
| `account` | `0x...` | Specific wallet |

### Range Fields (`ranges[].fieldName`) — ALL 30+ fields

| Category | Field | Description | Unit |
|----------|-------|-------------|------|
| **PnL** | `pnl` | P&L including fees | USD |
| | `realisedPnl` | P&L excluding fees | USD |
| | `totalGain` | Sum of wins (incl fee) | USD |
| | `realisedTotalGain` | Sum of wins (excl fee) | USD |
| | `totalLoss` | Sum of losses (incl fee) | USD |
| | `realisedTotalLoss` | Sum of losses (excl fee) | USD |
| **ROI** | `avgRoi` | Avg ROI incl fee | % |
| | `realisedAvgRoi` | Avg ROI excl fee | % |
| | `maxRoi` | Best trade ROI incl fee | % |
| | `realisedMaxRoi` | Best trade ROI excl fee | % |
| **Risk** | `maxDrawdown` | Max DD incl fee | % (neg) |
| | `realisedMaxDrawdown` | Max DD excl fee | % (neg) |
| **Volume** | `totalVolume` | Total notional | USD |
| | `avgVolume` | Avg per trade | USD |
| | `totalFee` | Fees paid | USD |
| **Trades** | `totalTrade` | Closed positions | count |
| | `totalWin` | Winning trades | count |
| | `totalLose` | Losing trades | count |
| | `totalLiquidation` | Times liquidated | count |
| **Rates** | `winRate` | Win % | 0-100 |
| | `profitRate` | Gain/(Gain+Loss) incl fee | 0-100 |
| | `realisedProfitRate` | Gain/(Gain+Loss) excl fee | 0-100 |
| | `longRate` | Long / Total % | 0-100 |
| | `orderPositionRatio` | Orders per position | ratio |
| **Ratios** | `profitLossRatio` | AvgWin/AvgLoss incl fee | ratio |
| | `realisedProfitLossRatio` | AvgWin/AvgLoss excl fee | ratio |
| | `gainLossRatio` | TotalGain/TotalLoss incl fee | ratio |
| | `realisedGainLossRatio` | TotalGain/TotalLoss excl fee | ratio |
| **Leverage** | `avgLeverage` | Mean | x |
| | `maxLeverage` | Maximum | x |
| | `minLeverage` | Minimum | x |
| **Duration** | `avgDuration` | Mean hold | seconds |
| | `minDuration` | Shortest | seconds |
| | `maxDuration` | Longest | seconds |
| **Time** | `lastTradeAtTs` | Last trade | epoch ms |
| | `runTimeDays` | Account age | days |

---

## CURL TEMPLATES (with API key)

### Find smart traders
```bash
curl -X POST https://api.copin.io/public/HYPERLIQUID/position/statistic/filter \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: ${COPIN_API_KEY}" \
  -d '{
    "pagination": {"limit": 20, "offset": 0},
    "queries": [{"fieldName": "type", "value": "D30"}],
    "ranges": [
      {"fieldName": "winRate", "gte": 55},
      {"fieldName": "realisedPnl", "gte": 5000},
      {"fieldName": "profitLossRatio", "gte": 1.5},
      {"fieldName": "totalTrade", "gte": 20}
    ],
    "sortBy": "realisedPnl",
    "sortType": "desc"
  }'
```

### Get trader positions
```bash
curl -X POST https://api.copin.io/HYPERLIQUID/position/filter \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: ${COPIN_API_KEY}" \
  -d '{
    "pagination": {"limit": 50, "offset": 0},
    "queries": [
      {"fieldName": "account", "value": "0x1234..."},
      {"fieldName": "status", "value": "CLOSE"}
    ],
    "sortBy": "closeBlockTime",
    "sortType": "desc"
  }'
```

### Get leaderboard
```bash
curl -X GET "https://api.copin.io/leaderboards/page?protocol=HYPERLIQUID&queryDate=$(date +%s)000&statisticType=MONTH&limit=20&offset=0&sort_by=ranking&sort_type=asc" \
  -H "X-API-KEY: ${COPIN_API_KEY}"
```

### Get open interest (top positions)
```bash
curl -X POST https://api.copin.io/HYPERLIQUID/top-positions/opening \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: ${COPIN_API_KEY}" \
  -d '{"pagination": {"limit": 100, "offset": 0}, "sortBy": "size", "sortType": "desc"}'
```

### Get position detail with orders
```bash
curl -X GET "https://api.copin.io/HYPERLIQUID/position/detail/${POSITION_ID}" \
  -H "X-API-KEY: ${COPIN_API_KEY}"
```

### Get trader stats (single account)
```bash
curl -X GET "https://api.copin.io/HYPERLIQUID/position-statistic/0x1234567890abcdef" \
  -H "X-API-KEY: ${COPIN_API_KEY}"
```
