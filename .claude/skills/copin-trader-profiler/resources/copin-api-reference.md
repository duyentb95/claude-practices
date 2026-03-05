# Copin Analyzer API Reference

## Overview

Copin.io provides public APIs for accessing on-chain trader data from 55+ perpetual DEXs.
Data includes 2M+ trader profiles and billions of position trades.
Base URL: `https://api.copin.io`

## Protocol String for Hyperliquid

```
HYPERLIQUID
```

Short key: `HLP`
Chain: Hyperliquid L1
Active: Yes
Copy trading via Copin: No (use direct API)

## API 1: Trader Statistics

**Endpoint:** `POST /public/{PROTOCOL}/position/statistic/filter`

**Purpose:** Search and filter traders by performance metrics.

**Request Body:**
```json
{
  "pagination": {"limit": 20, "offset": 0},
  "queries": [
    {"fieldName": "type", "value": "D30"}
  ],
  "ranges": [
    {"fieldName": "winRate", "gte": 60},
    {"fieldName": "realisedPnl", "gte": 1000}
  ],
  "sortBy": "realisedPnl",
  "sortType": "desc"
}
```

**Time periods:** D7, D15, D30, D60

**All available fields for ranges/sortBy:**

| Category | Field | Description |
|----------|-------|-------------|
| PnL | `pnl` | PnL including fees |
| | `realisedPnl` | PnL without fees |
| | `totalGain` / `realisedTotalGain` | Total gains |
| | `totalLoss` / `realisedTotalLoss` | Total losses |
| ROI | `avgRoi` / `realisedAvgRoi` | Average ROI per trade |
| | `maxRoi` / `realisedMaxRoi` | Best single trade ROI |
| Risk | `maxDrawdown` / `realisedMaxDrawdown` | Max drawdown (negative) |
| Volume | `totalVolume` | Total notional volume traded |
| | `avgVolume` | Average volume per trade |
| Trades | `totalTrade` | Total closed positions |
| | `totalWin` | Winning trades count |
| | `totalLose` | Losing trades count |
| | `totalLiquidation` | Times liquidated |
| Rates | `winRate` | Win percentage (0-100) |
| | `profitRate` / `realisedProfitRate` | Gain / (Gain + Loss) % |
| | `longRate` | Long positions / Total % |
| | `orderPositionRatio` | Orders / Positions ratio |
| Ratios | `profitLossRatio` / `realisedProfitLossRatio` | (AvgWin) / (AvgLoss) |
| | `gainLossRatio` / `realisedGainLossRatio` | TotalGain / TotalLoss |
| Leverage | `avgLeverage` | Mean leverage used |
| | `maxLeverage` / `minLeverage` | Range of leverage |
| Duration | `avgDuration` | Avg hold time (seconds) |
| | `minDuration` / `maxDuration` | Hold time range (seconds) |
| Time | `lastTradeAtTs` | Last trade timestamp (epoch ms) |
| | `runTimeDays` | Days since first trade |
| Fees | `totalFee` | Total fees paid |

**Response fields per trader:**
```
id, account, totalTrade, totalWin, totalLose, totalGain, realisedTotalGain,
totalLoss, realisedTotalLoss, totalVolume, avgVolume, avgRoi, realisedAvgRoi,
maxRoi, realisedMaxRoi, pnl, realisedPnl, maxPnl, realisedMaxPnl,
maxDrawdown, realisedMaxDrawdown, maxDrawdownPnl, realisedMaxDrawdownPnl,
winRate, profitRate, realisedProfitRate, orderPositionRatio, profitLossRatio,
realisedProfitLossRatio, longRate, gainLossRatio, realisedGainLossRatio,
avgDuration, minDuration, maxDuration, avgLeverage, minLeverage, maxLeverage,
totalLiquidation, totalLiquidationAmount, runTimeDays, lastTradeAtTs,
totalFee, type, statisticAt, lastTradeAt, createdAt, isOpenPosition, protocol
```

## API 2: Trader Positions

**Endpoint:** `POST /{PROTOCOL}/position/filter`

**Purpose:** Get positions (open or closed) for a specific wallet.

**Request Body:**
```json
{
  "pagination": {"limit": 20, "offset": 0},
  "queries": [
    {"fieldName": "account", "value": "0x..."},
    {"fieldName": "status", "value": "CLOSE"}
  ],
  "sortBy": "closeBlockTime",
  "sortType": "desc"
}
```

**Position fields:**
```
id, account, indexToken, size, fee, collateral, averagePrice,
pnl, realisedPnl, roi, realisedRoi, isLong, isWin, isLiquidate,
leverage, orderCount, orderIncreaseCount, orderDecreaseCount,
durationInSecond, status, openBlockTime, closeBlockTime, protocol
```

## API 3: Position Details

**Endpoint:** `GET /{PROTOCOL}/position/detail/{positionId}`

**Purpose:** Full position with all orders.

**Order types:** OPEN, INCREASE, DECREASE, CLOSE, MARGIN_TRANSFERRED, LIQUIDATE

**Order fields:**
```
id, account, txHash, blockNumber, blockTime, indexToken,
sizeDeltaNumber, sizeNumber, collateralDeltaNumber, priceNumber,
feeNumber, fundingRateNumber, fundingNumber, leverage,
isLong, isOpen, isClose, type
```

## API 4: Leaderboard

**Endpoint:** `GET /leaderboards/page`

**Query params:** protocol, queryDate (epoch ms), statisticType (WEEK|MONTH), limit, offset, sort_by, sort_type

## API 5: Open Interest

**Endpoint:** `POST /{PROTOCOL}/top-positions/opening`

**Purpose:** Currently open positions, sorted by size.

## Web Integration

Trader profile URL:
```
https://app.copin.io/trader/{address}/hyperliquid
```

Leaderboard URL:
```
https://app.copin.io/HYPERLIQUID/leaderboard?leaderboard_type=MONTH
```

## Notes

- No authentication required for public endpoints
- Response includes `meta.total` for pagination planning
- `indexToken` is the contract address of the traded asset
- For Hyperliquid, position details may not include txHash-based lookup
- All monetary values are in USD
- Timestamps in ISO 8601 format (positions) or epoch ms (statistics)
