# Copin Analyzer — Integration Architecture

> Phiên bản: 1.0 · Ngày: 2026-03-06
> Mô tả kỹ thuật chi tiết để tích hợp Copin API vào insider-scanner

---

## 1. Tổng quan

Copin Analyzer cung cấp pre-computed behavioral statistics cho Hyperliquid traders —
win rate, avg hold time, liquidation count, profit/loss ratio, account age — được tính
từ historical position data. Đây là nguồn data bổ sung hoàn hảo cho HL API:

```
HL API   → TIMING signals (deposit speed, fill count, margin state)
Copin    → BEHAVIORAL signals (trading style, track record, risk profile)
Combined → Richer insider probability with fewer false positives
```

---

## 2. Authentication & Rate Limit

```typescript
// .env
COPIN_API_KEY=<X-API-KEY value>   // user sẽ cung cấp
COPIN_API_URL=https://api.copin.io

// Headers cho mọi request
const COPIN_HEADERS = {
  'Content-Type': 'application/json',
  'X-API-KEY': process.env.COPIN_API_KEY,
};
```

**Rate limit: 30 req/min** → dùng 2000ms gap giữa các calls (riêng biệt với HL queue 1100ms).

---

## 3. CopinInfoService — Interface thiết kế

```typescript
// apps/insider-scanner/src/frameworks/copin/copin-info.service.ts

@Injectable()
export class CopinInfoService {
  private readonly baseUrl = process.env.COPIN_API_URL ?? 'https://api.copin.io';
  private readonly enabled = process.env.COPIN_ENABLED !== 'false';
  private cache = new Map<string, { data: CopinTraderStats; fetchedAt: number }>();
  private readonly CACHE_TTL = 30 * 60_000; // 30 min

  /** Fetch D30 stats for a single wallet. Returns null if Copin is disabled or unavailable. */
  async getTraderStats(address: string): Promise<CopinTraderStats | null>

  /** Bulk fetch top HL traders from Copin leaderboard (MONTH window) */
  async getLeaderboard(limit = 100): Promise<CopinLeaderboardEntry[]>

  /** Find potential MM/HFT wallets via Copin filter */
  async getAlgoTraders(): Promise<string[]>   // returns address list

  /** Find Copin-confirmed "smart traders" */
  async getSmartTraders(): Promise<string[]>  // returns address list

  /** Open interest: top N wallets with largest open positions right now */
  async getTopOpenPositions(limit = 100): Promise<CopinOpenPosition[]>
}
```

---

## 4. API Calls được sử dụng

### 4.1 Trader Stats (D30) — primary call per inspection

```typescript
// GET /HYPERLIQUID/position-statistic/{address}
// Returns D7/D15/D30/D60 stats in one call

const stats = await this.get<CopinTraderStatsResponse>(
  `/HYPERLIQUID/position-statistic/${address}`,
);

// Dùng period D30 cho behavioral classification
const d30 = stats.D30;
/*
{
  winRate: 65.4,                // % (0–100)
  totalTrade: 47,               // closed positions
  totalWin: 31,
  totalLose: 16,
  totalLiquidation: 0,
  realisedPnl: 45230,          // USD excluding fees
  realisedMaxDrawdown: -12.3,  // % (negative)
  profitLossRatio: 1.87,       // avgWin / avgLoss
  avgLeverage: 8.2,
  maxLeverage: 15,
  avgDuration: 66600,          // seconds (~18.5 hours)
  minDuration: 1800,
  longRate: 72.3,              // % long positions
  orderPositionRatio: 2.1,     // orders per position
  runTimeDays: 183,            // account age
  lastTradeAtTs: 1709500000000
}
*/
```

**Cache strategy:** 30 min in-memory per address (Copin data thay đổi chậm).

**Graceful fallback:**
```typescript
try {
  return await this.fetchWithTimeout(url, 5000);
} catch (e) {
  this.logger.warn(`Copin unavailable for ${address}: ${e.message}`);
  return null;  // inspector tiếp tục với G=0
}
```

---

### 4.2 Algo/MM Whitelist Scan (6h periodic)

```typescript
// POST /public/HYPERLIQUID/position/statistic/filter
// Tìm wallets có dấu hiệu algorithmic trading

const body = {
  pagination: { limit: 200, offset: 0 },
  queries: [{ fieldName: 'type', value: 'D30' }],
  ranges: [
    { fieldName: 'totalTrade', gte: 200 },        // high frequency
    { fieldName: 'avgDuration', lte: 3600 },       // <1h avg hold
    { fieldName: 'orderPositionRatio', gte: 3 },   // scaling behavior
    { fieldName: 'longRate', gte: 40, lte: 60 },   // balanced L/S
  ],
  sortBy: 'totalTrade',
  sortType: 'desc',
};

// → addresses saved to Set<string> algoWhitelist (in-memory)
// → persist to data/analysis/traders/mm_hft_whitelist.json
```

---

### 4.3 Smart Trader Whitelist Scan (6h periodic)

```typescript
// POST /public/HYPERLIQUID/position/statistic/filter
// Tìm wallets là established smart traders

const body = {
  pagination: { limit: 200, offset: 0 },
  queries: [{ fieldName: 'type', value: 'D30' }],
  ranges: [
    { fieldName: 'winRate', gte: 55 },
    { fieldName: 'realisedPnl', gte: 10000 },       // $10k+ profit
    { fieldName: 'profitLossRatio', gte: 1.5 },
    { fieldName: 'realisedMaxDrawdown', gte: -30 },  // not worse than -30%
    { fieldName: 'totalTrade', gte: 20 },
    { fieldName: 'runTimeDays', gte: 30 },           // ≥1 month old
  ],
  sortBy: 'realisedPnl',
  sortType: 'desc',
};

// → addresses saved to Set<string> smartTraderWhitelist
// → persist to data/analysis/traders/smart_trader_whitelist.json
```

---

### 4.4 Leaderboard Pre-scan (daily)

```typescript
// GET /leaderboards/page?protocol=HYPERLIQUID&statisticType=MONTH&limit=100...
// Pre-cache top 100 monthly traders

// Run mỗi sáng 7:00 UTC+7 (midnight UTC)
// Kết quả: warm Copin cache cho addresses này
// Alert nếu leaderboard wallet trade coin bất thường (off their usual coins)
```

---

### 4.5 Open Interest Monitoring (Phase 3)

```typescript
// POST /HYPERLIQUID/top-positions/opening
// Top wallets by open position size RIGHT NOW

const body = {
  pagination: { limit: 100, offset: 0 },
  sortBy: 'size',
  sortType: 'desc',
};

// Useful for:
// 1. Detect when a known insider suddenly opens large position
// 2. Cross-reference với HL real-time trade alerts
// 3. Find wallets with massive OI concentration
```

---

## 5. Classification Engine (per wallet)

```typescript
interface CopinClassification {
  archetype: 'INSIDER_SUSPECT' | 'SMART_TRADER' | 'ALGO_HFT' | 'DEGEN' | 'NORMAL' | 'UNKNOWN';
  confidence: number;   // 0–1
  signals: string[];    // human-readable evidence
  scoreG: number;       // contribution to insider score: +15 to −10
}

function classifyFromCopin(stats: CopinTraderStats | null): CopinClassification {
  if (!stats) return { archetype: 'UNKNOWN', confidence: 0, signals: [], scoreG: 0 };

  const d30 = stats.D30;
  if (!d30 || d30.totalTrade < 5) return { archetype: 'UNKNOWN', ... };

  // Priority order: check algo first (most important to skip)

  // 1. Algo/HFT — hard skip in Layer 2
  if (d30.totalTrade >= 200 && d30.avgDuration <= 3600 && d30.longRate >= 40 && d30.longRate <= 60) {
    return {
      archetype: 'ALGO_HFT',
      confidence: 0.9,
      signals: [`${d30.totalTrade} trades/30d`, `avg hold ${Math.round(d30.avgDuration/60)}min`],
      scoreG: -10,  // effectively removes from suspects
    };
  }

  // 2. Insider suspect pattern
  if (d30.winRate >= 80 && d30.totalTrade <= 20 && d30.avgDuration <= 86400 && d30.totalLiquidation === 0) {
    return {
      archetype: 'INSIDER_SUSPECT',
      confidence: 0.8,
      signals: [`${d30.winRate}% win rate`, `only ${d30.totalTrade} trades`, 'never liquidated'],
      scoreG: +10,
    };
  }

  // 3. Smart trader — reduce false positive risk
  if (d30.winRate >= 55 && d30.profitLossRatio >= 1.5 && d30.realisedPnl >= 10000 && d30.runTimeDays >= 30) {
    return {
      archetype: 'SMART_TRADER',
      confidence: 0.85,
      signals: [`${d30.winRate}% win rate`, `PL ratio ${d30.profitLossRatio}`, `${d30.runTimeDays}d old`],
      scoreG: -8,
    };
  }

  // 4. Degen
  if (d30.totalLiquidation >= 3 && d30.avgLeverage >= 30) {
    return {
      archetype: 'DEGEN',
      confidence: 0.75,
      signals: [`${d30.totalLiquidation} liquidations`, `avg ${d30.avgLeverage}x leverage`],
      scoreG: -5,  // bad trader ≠ insider
    };
  }

  // 5. Mild suspicious (not clear insider but elevated suspicion)
  if (d30.winRate >= 65 && d30.totalTrade <= 30 && d30.realisedAvgRoi >= 20) {
    return {
      archetype: 'INSIDER_SUSPECT',
      confidence: 0.5,
      signals: [`${d30.winRate}% win rate`, `avg ROI ${d30.realisedAvgRoi}%`],
      scoreG: +5,
    };
  }

  return { archetype: 'NORMAL', confidence: 0.6, signals: [], scoreG: 0 };
}
```

---

## 6. Tích hợp vào InsiderDetectorService

### Thứ tự calls trong `inspectTrader()`:

```typescript
async inspectTrader(address: string, trade: LargeTrade): Promise<void> {
  // Layer 1: HL userFees (existing)
  const isHft = await this.checkIsHft(address);
  if (isHft) return;

  // Layer 2: Copin algo whitelist (NEW — fast check, in-memory)
  if (this.algoWhitelist.has(address.toLowerCase())) {
    this.logger.log(`[Copin Layer 2] Skip ${address} — algo/MM whitelist`);
    return;
  }

  // Parallel: HL ledger + fills + state (existing 3 calls)
  const [ledger, fills, state] = await Promise.all([/* ... */]);
  // NOTE: still sequential in queue due to rate limiter — just logical grouping

  // Copin: fetch D30 stats (NEW — 1 call, separate queue)
  const copinStats = await this.copinService.getTraderStats(address);
  const copinClass = classifyFromCopin(copinStats);

  // Layer 2b: hard skip ALGO_HFT from Copin classification
  if (copinClass.archetype === 'ALGO_HFT' && copinClass.confidence >= 0.8) {
    this.logger.log(`[Copin Layer 2b] Skip ${address} — Copin ALGO_HFT (${copinClass.signals})`);
    return;
  }

  // Score (existing + new G component)
  const score = this.scoreTrader(trade, ledger, fills, state, copinClass);

  // Smart Trader whitelist: if SMART_TRADER from Copin, min score ≥ 55 to alert
  // (avoid false positives on established traders who happen to make a large trade)
  if (copinClass.archetype === 'SMART_TRADER' && score.total < 55) {
    this.logger.log(`[Copin FP filter] Skip ${address} — SMART_TRADER score ${score.total} < 55`);
    return;
  }

  // upsert + alert (existing)
  this.upsertSuspect(address, trade, score, copinClass);
}
```

---

## 7. State API Enhancement

### GET /api/state — thêm Copin data vào suspect

```typescript
// SuspectEntry thêm trường:
interface SuspectEntry {
  // ... existing fields ...
  copinProfile?: {
    archetype: string;         // 'INSIDER_SUSPECT' | 'SMART_TRADER' | ...
    confidence: number;        // 0–1
    signals: string[];         // human-readable
    d30: {
      winRate: number;
      totalTrade: number;
      avgDuration: number;     // seconds
      avgLeverage: number;
      totalLiquidation: number;
      realisedPnl: number;
      runTimeDays: number;
    } | null;
    scoreG: number;            // contribution to total
  };
}
```

---

## 8. Dashboard Enhancement

Thêm vào suspect card trong web UI:

```html
<!-- Copin badge + data -->
<div class="copin-badge archetype-${archetype}">
  ${copinArchetypeIcon} ${copinArchetype}
  <span class="confidence">${Math.round(confidence*100)}%</span>
</div>
<div class="copin-stats">
  WR: ${winRate}% · ${totalTrade}T · Hold: ${avgHoldH}h · Liq: ${liq} · ${runTimeDays}d
</div>
```

```css
.archetype-INSIDER_SUSPECT { color: #ff4444; }
.archetype-SMART_TRADER    { color: #4488ff; }
.archetype-ALGO_HFT        { color: #888888; }
.archetype-DEGEN           { color: #ff8800; }
.archetype-NORMAL          { color: #aaaaaa; }
```

---

## 9. Error Handling & Fallback

```typescript
// Nếu Copin API không khả dụng:
// 1. Log warning (không throw)
// 2. Set copinClass = { archetype: 'UNKNOWN', scoreG: 0 }
// 3. Tiếp tục với HL-only scoring (backward compatible)
// 4. Không show Copin section trong dashboard

// Nếu COPIN_API_KEY không set:
// 1. Log warning on startup
// 2. CopinInfoService returns null cho mọi call
// 3. System hoạt động bình thường, chỉ thiếu G component

// Nếu rate limit bị hit (429):
// 1. Wait 5s, retry once
// 2. Nếu vẫn fail → return null (graceful)
// 3. Log metric để monitor rate usage
```

---

## 10. File Structure

```
apps/insider-scanner/src/
└── frameworks/
    └── copin/
        ├── copin-info.service.ts         # REST client + cache
        ├── copin-classifier.ts           # classifyFromCopin() function
        └── copin.module.ts               # NestJS module

data/analysis/traders/
├── mm_hft_whitelist.json                 # periodic Copin algo scan
├── smart_trader_whitelist.json           # periodic Copin smart trader scan
└── leaderboard-{YYYYMMDD}.json          # daily leaderboard snapshot

.env additions:
  COPIN_API_KEY=
  COPIN_API_URL=https://api.copin.io
  COPIN_RATE_LIMIT_MS=2000
  COPIN_ENABLED=true
  COPIN_WHITELIST_REFRESH_MS=21600000
```

---

## 11. Testing Strategy

### Retrospective test (2026-03-04 dataset)

1. Lấy 19 suspect addresses từ `data/raw/daily/20260304/suspects.json`
2. Fetch Copin D30 stats cho tất cả
3. Chạy `classifyFromCopin()` trên từng wallet
4. So sánh G scores với known FPs và known TPs
5. Tính FP rate mới với threshold G=-8 filter

**Expected results:**
- `0xc8787a` (32.4% WR, chronic loser): Copin → DEGEN → scoreG = −5 → total score giảm từ 71 xuống ~62
- `0x185dc9` (margin exhaustion, known FP): nếu có Copin data → likely NORMAL hoặc DEGEN → scoreG = −5
- `0x040db4` (real insider, 9.7s gap): có thể là NEW account → Copin insufficient data → UNKNOWN → scoreG = 0 (safe)
- `0x6b9e77` (cluster master): Copin sẽ show low trade count hoặc no data (new account) → không bị filtered

**Safety constraint:** Wallets với Copin `UNKNOWN` (insufficient data) → scoreG = 0, không giảm score.
Đây là quan trọng để không miss real insiders với fresh accounts.
