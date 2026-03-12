# Insider Scanner — Improvement Plan v2

> Phiên bản: 2.0 · Ngày: 2026-03-06
> Dựa trên: phân tích dữ liệu 2026-03-04, skills inventory, Copin Analyzer API

---

## 1. Tình trạng hiện tại

### 1.1 Điểm mạnh đã có

| Chức năng | Status | Ghi chú |
|-----------|--------|---------|
| Real-time WebSocket (229+ coins) | ✅ Live | 1.7M+ trades/ngày |
| Composite scoring A+B+C+D+E×F | ✅ Live | 0–100, 5 alert levels |
| Paginated fills 10k | ✅ v2.1 | aggregateByTime=true |
| MM/HFT filter (userFees Layer 1) | ✅ Live | cached 24h |
| Send-type deposit detection | ✅ v2.0 | SUB_ACCOUNT pattern |
| Win rate scoring | ✅ v2.1 | require ≥10 closed |
| All-time PnL scoring | ✅ v2.1 | +4/+2/−3/−5 |
| Fill-cap penalty (≥2000 fills) | ✅ v2.1 | −5 scoreB |
| Web dashboard | ✅ Live | port 3235, real-time |
| Lark alerts | ✅ Live | cooldown 10 min |

### 1.2 Gaps đã xác định (từ dữ liệu 2026-03-04)

#### Gap G1: False Positive Rate cao

**Quan sát:** 19 suspects flagged, ít nhất 4–5 là FP rõ ràng:
- `0x185dc9` — margin exhaustion (caught wrong side BTC rally), không phải insider
- `0x44fbbb` — USTC de-pegged stablecoin, không có catalyst
- `0xc8787a` — 32.4% win rate (AIXBT bot), chronic loser, không phải informed trader
- `0x308ac0` — underwater -16.7% SUI, win rate 0.7% → bad trader, không phải insider

**Root cause:** Model chưa phân biệt được "bad luck large trade" vs "informed position"

#### Gap G2: Thiếu Behavioral Context

Model hiện tại chỉ nhìn 1 giao dịch isolated. Thiếu:
- Lịch sử hành vi dài hạn của wallet (30–60 ngày)
- Pattern so sánh vs toàn bộ thị trường (percentile ranking)
- Phân biệt style: directional trader vs algo/HFT vs degen vs insider

#### Gap G3: MM/HFT Filter chưa đủ

Layer 1 (`userFees.userAddRate ≤ 0`) chỉ bắt được maker-rebate wallets.
Nhiều algo traders taker vẫn bị inspect, waste rate limit budget.
Copin đã có classification dựa trên hành vi (totalTrade, avgDuration, longRate).

#### Gap G4: Không có Smart Trader Whitelist

Một "smart trader" có win rate 70%, 5 năm lịch sử, đột nhiên trade lớn → scored cao (vì
trade size lớn + margin cao) nhưng không phải insider. Hiện tại không có mechanism
để downgrade score cho known good traders.

#### Gap G5: Cluster Detection chỉ chạy offline

Wallet clustering (pattern: 1 controller → N sub-wallets) chỉ chạy trong daily pipeline
(orchestrator → wallet-clusterer agent). Không có live alert khi phát hiện cluster mới.

#### Gap G6: Không có Historical Baseline

Model không biết "bình thường" là gì cho từng coin. Trade $500K trên HYPE khác với
$500K trên BTC về mặt tương đối. Cần baseline 7d/30d average per coin.

---

## 2. Priority Matrix

```
Impact (cao → thấp)
│
│  [G2+Copin] Enhanced Scoring    [G5] Live Clustering
│  with Copin Behavioral Data ◀── highest value work
│
│  [G3+G4] Extended MM/HFT        [G6] Historical Baseline
│  & Smart Trader Whitelist        per Coin
│
│  [G1] FP Reduction via          [new] Daily Leaderboard
│  Copin Cross-validation          Pre-scan
│
└──────────────────────────────────────────── Effort (thấp → cao)
       quick wins          medium           large refactor
```

### Priority list (xếp theo Impact/Effort)

| # | Cải tiến | Impact | Effort | Phase |
|---|---------|--------|--------|-------|
| P1 | Tích hợp Copin API (CopinInfoService) | ⬆⬆⬆ | Low | 1 |
| P2 | Copin behavioral score G → thay thế phần B thô sơ | ⬆⬆⬆ | Medium | 1 |
| P3 | Extended MM/HFT filter từ Copin (Layer 2) | ⬆⬆ | Low | 1 |
| P4 | Smart Trader Whitelist (Copin D30 snapshot) | ⬆⬆ | Low | 1 |
| P5 | Cross-validation FP filter: Copin score vs HL score | ⬆⬆ | Medium | 2 |
| P6 | Leaderboard pre-scan (proactive monitoring) | ⬆ | Medium | 2 |
| P7 | Live cluster detection (in-memory send-graph) | ⬆⬆ | High | 2 |
| P8 | Historical baseline per coin (7d rolling avg) | ⬆ | High | 3 |
| P9 | Open Interest monitoring (Copin top-positions) | ⬆ | Medium | 3 |

---

## 3. Phased Roadmap

### Phase 1 — Copin Integration (1–2 tuần)

**Goal:** Tích hợp Copin Analyzer API để enhance quality của mỗi inspection.

```
Hiện tại (1 inspection):
  HL: userFees → ledger → fills → state → score(A+B+C+D+E×F)

Sau Phase 1 (2 data sources):
  HL:    userFees [Layer 1] → ledger → fills → state
  Copin: traderStats(D30) → classification
         ↓
  Merge → score(A+B+C+D+E+G×F) + FP filter
```

**Deliverables:**
- [ ] `CopinInfoService` trong `apps/insider-scanner/src/frameworks/copin/`
- [ ] `COPIN_API_KEY` env var (user sẽ cung cấp X_API_KEY)
- [ ] Component G: Copin Behavioral Score (0–15)
- [ ] Layer 2 filter: Copin-confirmed Algo/MM skip
- [ ] Smart Trader Whitelist (periodic refresh 6h)
- [ ] New flags: `COPIN_SUSPICIOUS`, `SMART_TRADER`
- [ ] Dashboard: thêm Copin data vào suspect card

**Acceptance criteria:**
- FP rate giảm ≥ 30% (verified on 2026-03-04 dataset retrospectively)
- Zero additional false negatives (không miss real insiders)
- Rate limit compliance: Copin ≤ 30 req/min, HL ≤ 54 req/min
- Graceful fallback khi Copin API down (fallback về HL-only scoring)

---

### Phase 2 — Enhanced Detection (2–3 tuần)

**Goal:** Proactive scanning + live clustering.

**Deliverables:**
- [x] `LeaderboardMonitorService` — daily scan top 100 wallets từ Copin leaderboard (migrated to `/leaderboards-v2/page` API)
- [ ] Pre-warm cache cho known traders (skip full inspect nếu đã có Copin profile)
- [ ] In-memory send-graph: khi wallet mới detected, check nếu controller address đã là suspect
- [ ] Alert: khi leaderboard wallet trade coin bất thường (off their usual 3-5 coins)
- [ ] Copin open interest endpoint: detect khi top OI holder suddenly change position
- [ ] Report enhancement: Copin archetype classification trong daily report

---

### Phase 3 — Intelligence Layer (4–6 tuần)

**Goal:** Từ reactive sang proactive intelligence.

**Deliverables:**
- [ ] Historical baseline per coin: 7d/30d rolling avg trade size, detect outliers
- [ ] Token event correlation: compare trade timing vs known listing/announcement calendar
- [ ] Full live cluster detection với Copin cross-validation
- [ ] Automated FP report: daily digest những wallet scored cao nhưng likely FP
- [ ] Scoring model auto-calibration proposal (strategy-optimizer pipeline)

---

## 4. Phân tích Copin vs Hyperliquid Data

### Copin cung cấp gì mà HL API không có?

| Metric | Copin | Hyperliquid | Ưu tiên |
|--------|-------|------------|---------|
| Win rate (30d) | ✅ Pre-computed | ⚠️ Phải tính từ fills | P1 |
| Avg hold duration | ✅ seconds | ❌ Không có | P1 |
| Profit/loss ratio | ✅ Pre-computed | ⚠️ Phải tính | P1 |
| Total liquidations | ✅ Count | ❌ Không có | P1 |
| Max drawdown | ✅ Pre-computed | ⚠️ Phải tính | P2 |
| Long/short ratio | ✅ longRate % | ⚠️ Từ fills | P2 |
| Orders per position | ✅ orderPositionRatio | ⚠️ Từ fills | P2 |
| Account age (runTimeDays) | ✅ Direct | ⚠️ Từ ledger first entry | P1 |
| Trader ranking (percentile) | ✅ Leaderboard | ⚠️ Không có | P2 |
| Open positions (all traders) | ✅ top-positions | ❌ Không có bulk | P3 |
| Live orders (cross-protocol) | ✅ graphql | ❌ Per-wallet only | P3 |
| Token concentration | ⚠️ Tính từ positions | ⚠️ Tính từ fills | P2 |

### Hyperliquid cung cấp gì mà Copin không có?

| Data | Chỉ có trên HL | Dùng cho |
|------|----------------|---------|
| `userFees.userAddRate` | ✅ | Layer 1 MM/HFT filter |
| `userNonFundingLedgerUpdates` | ✅ | Deposit timing (scoreA) |
| Ledger `send` entries | ✅ | SUB_ACCOUNT detection |
| Deposit-to-trade gap (ms) | ✅ | Core insider signal |
| Sliding-window trade merge | ✅ | Real-time aggregation |
| Margin utilization (live) | ✅ | ALL_IN detection (scoreD) |
| Ledger purity | ✅ | scoreE |

**Kết luận:** Copin và HL bổ sung cho nhau, không thay thế. Chiến lược là **HL = primary
real-time signal source + Copin = behavioral validation layer.**

---

## 5. Scoring Model v3 Preview

Xem chi tiết: [`scoring-model-v3.md`](scoring-model-v3.md)

```
Current:  finalScore = (A + B + C + D + E) × F
Target:   finalScore = (A + B + C + D + E + G) × F  →  cap 100

G = Copin Behavioral Score:  +15 to −10
  Insider pattern (Copin):   +10  (winRate≥80, totalTrade≤20, avgDuration≤86400)
  Suspicious (Copin):        +5   (winRate≥65, totalTrade≤30)
  Smart trader (Copin):      −8   (winRate≥55, profitLossRatio≥1.5, runTimeDays≥30)
  Algo/HFT (Copin):          −10  → hard skip (Layer 2 filter)
  Degen (Copin):             −5   (liquidations≥3, avgLeverage≥30)

New total max = 25+20+20+15+10+15 = 105, capped at 100
```

---

## 6. Architecture Changes

### New Services

```
apps/insider-scanner/src/
├── frameworks/
│   ├── hyperliquid/
│   │   └── hyperliquid-info.service.ts        (existing)
│   └── copin/
│       ├── copin-info.service.ts              (NEW) - REST client
│       └── copin-cache.service.ts             (NEW) - in-memory cache
├── scanner/
│   ├── ws-scanner.service.ts                  (existing)
│   ├── insider-detector.service.ts            (MODIFY - add G score)
│   ├── rate-limiter.service.ts                (existing)
│   └── leaderboard-monitor.service.ts         (NEW - Phase 2)
└── configs/
    └── index.ts                               (MODIFY - add COPIN_API_KEY)
```

### Data Flow (Phase 1)

```
WebSocket trade event
        │
        ▼
[WsScannerService] sliding window → LargeTrade
        │
        ▼
[InsiderDetectorService] queue inspection
        │
        ├─── HL: checkIsHft()          [Layer 1: userFees]
        │
        ├─── Copin: getTraderStats()   [Layer 2: algo/MM check]
        │    └─── if ALGO/MM → skip
        │
        ├─── HL: getLedger()           [deposit timing]
        ├─── HL: getFillsPaginated()   [10k fills]
        ├─── HL: getState()            [margin state]
        │
        ├─── Copin: classify()         [behavioral profile]
        │
        ▼
[scoreTrader()] A+B+C+D+E+G × F
        │
        ├─── if alertLevel == NONE → discard
        └─── else → upsert suspects + Lark alert
```

### Rate Limit Budget

```
HL API:    54 calls/min  (1100ms gap × sequential queue)
Copin API: 30 calls/min  (2000ms gap × sequential queue)

Mỗi inspection uses:
  HL:    4 calls (userFees + ledger + fills + state)
  Copin: 1 call  (traderStats D30)

Max throughput: ~13 inspections/min (HL-limited)
With Copin:     ~13 inspections/min (HL still bottleneck → no impact)
```

---

## 7. New Environment Variables

```bash
# .env additions for Phase 1
COPIN_API_KEY=                    # X-API-KEY from Copin (user sẽ cung cấp)
COPIN_API_URL=https://api.copin.io
COPIN_RATE_LIMIT_MS=2000          # 2s between Copin calls
COPIN_WHITELIST_REFRESH_MS=21600000   # refresh smart trader whitelist mỗi 6h
COPIN_ENABLED=true                # feature flag — fallback gracefully nếu false
```

---

## 8. Metrics để đánh giá thành công

| Metric | Baseline (2026-03-04) | Target (Phase 1) | Target (Phase 2) |
|--------|----------------------|------------------|------------------|
| FP rate (% suspects that are FP) | ~25–30% | < 15% | < 10% |
| True insider detection rate | ~70% (est) | ≥ 75% | ≥ 80% |
| Avg score của confirmed insiders | ~68 | ≥ 72 | ≥ 75 |
| Avg score của FPs | ~38 | < 30 | < 25 |
| Cluster detection latency | manual/daily | < 10 min live | real-time |
| Inspection throughput | ~8/min | ~12/min | ~15/min |

---

## 9. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Copin API down | Medium | Medium | Graceful fallback, G=0 if unavailable |
| Copin rate limit hit | Low | Low | Separate queue, cache 30 min |
| Copin data lags vs HL | Medium | Medium | HL data always primary source |
| Smart Trader miss | Low | High | Whitelist opt-in, not hard block |
| New HFT patterns bypass Layer 2 | Medium | Medium | Layer 1 (userFees) remains primary |
