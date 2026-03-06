# Scoring Model v3 — A+B+C+D+E+G × F

> Phiên bản: 3.0 · Ngày: 2026-03-06
> Cải tiến so với v2.1: thêm component G (Copin Behavioral Score)
> Dựa trên: phân tích FP/TP từ 2026-03-04, Copin API integration plan

---

## 1. Tổng quan thay đổi

| Version | Formula | Total cap | Ghi chú |
|---------|---------|-----------|---------|
| v1.0 | A+B+C+D+E × F | 100 | Initial release |
| v2.0 | A+B+C+D+E × F | 100 | Send-type, SUB_ACCOUNT, native userFees |
| v2.1 | A+B+C+D+E × F | 100 | Fill-cap penalty, all-time PnL, win rate |
| **v3.0** | **(A+B+C+D+E+G) × F** | **100** | **+Copin behavioral score G** |

```
finalScore = min(100, round((A + B + C + D + E + G) × F))
```

Theoretical max trước cap: 25 + 20 + 20 + 15 + 10 + 15 = 105 → capped 100.

---

## 2. Component G — Copin Behavioral Score

**Range:** −10 to +15 (no floor/cap — applied as delta to sum)
**Source:** Copin `GET /HYPERLIQUID/position-statistic/{address}` → D30 period
**Fallback:** G = 0 nếu Copin unavailable hoặc insufficient data (< 5 trades)

### G Decision Table

```
Input: CopinClassification.archetype + D30 stats

ALGO_HFT       → G = -10  (+ hard Layer 2 skip if confidence ≥ 0.8)
  Criteria: totalTrade ≥ 200 AND avgDuration ≤ 3600s AND longRate 40–60%

DEGEN          → G = -5
  Criteria: totalLiquidation ≥ 3 AND avgLeverage ≥ 30
  OR:       maxLeverage ≥ 50 AND totalTrade ≥ 50 AND realisedPnl < 0

SMART_TRADER   → G = -8   (+ score threshold 55 để alert)
  Criteria: winRate ≥ 55% AND profitLossRatio ≥ 1.5 AND realisedPnl ≥ $10k AND runTimeDays ≥ 30

NORMAL         → G = 0
  (không match bất kỳ pattern nào ở trên hoặc dưới)

UNKNOWN        → G = 0
  (insufficient Copin data: < 5 trades, or API unavailable)

INSIDER_SUSPECT (mild) → G = +5
  Criteria: winRate ≥ 65% AND totalTrade ≤ 30 AND realisedAvgRoi ≥ 20%
  AND không match SMART_TRADER criteria (runTimeDays < 30 hoặc realisedPnl < $10k)

INSIDER_SUSPECT (strong) → G = +10
  Criteria: winRate ≥ 80% AND totalTrade ≤ 20 AND avgDuration ≤ 86400s
  AND totalLiquidation = 0 AND realisedAvgRoi ≥ 30%
```

### Tại sao UNKNOWN → G = 0 (không giảm score)?

Fresh account (new insider) sẽ thường không có đủ Copin data.
Nếu ta penalize UNKNOWN, ta sẽ miss real insiders với fresh wallets.
**Safety principle: Copin chỉ được giảm score khi có evidence rõ ràng, không giảm vì thiếu data.**

---

## 3. Component A — Deposit-to-Trade Speed (0–25)

*Không thay đổi từ v2.1*

```typescript
const gapMin = (trade.detectedAt - lastFundingTime) / 60_000;

     ≤ 5 min  → 25  + flag FRESH_DEP
     ≤ 15 min → 22
     ≤ 30 min → 18
     ≤ 60 min → 14
     ≤ 3h     → 10
     ≤ 6h     →  6
     ≤ 24h    →  3
     > 24h    →  0  (no gap signal)

// Bonus:
if (trade.usdSize / totalFundingUsd > 0.80) scoreA = min(25, scoreA + 3)

// Funding sources (v2.0+):
// - deposit entries: delta.usdc
// - send entries where delta.user ≠ address: delta.usdcValue (SUB_ACCOUNT pattern)
```

**New in v3.0:** Nếu Copin `lastTradeAtTs` > 0 và `runTimeDays < 1`, supplement với
estimated wallet age từ Copin (hỗ trợ khi ledger entry thiếu).

---

## 4. Component B — Wallet Freshness & Quality (−8 to 20)

*Cải tiến: Copin data supplement cho accuracy tốt hơn*

```typescript
// [B1] Wallet age từ ledger (không đổi)
walletAgeDays = (Date.now() - firstLedgerEntryTime) / 86_400_000

// Supplement: nếu firstLedgerEntry null → dùng Copin runTimeDays
if (!firstLedgerEntry && copinStats?.D30?.runTimeDays) {
  walletAgeDays = copinStats.D30.runTimeDays;
}

< 1 day   → +10
< 3 days  → +8
< 7 days  → +6
< 14 days → +4
< 30 days → +2
≥ 30 days → +0

// [B2] 90-day fill count từ HL (không đổi)
≥ 2000 → -5    (established HFT)
= 0    → +10
≤ 3    → +8
≤ 10   → +5
≤ 30   → +2

// [B3] Win rate (v2.1+, require ≥ 10 closed positions từ HL fills)
// Nếu HL fills insufficient (< 10 closed), supplement với Copin D30 winRate
if (closedFillCount < 10 && copinStats?.D30?.totalTrade >= 10) {
  winRate = copinStats.D30.winRate / 100;  // normalize to 0-1
}

< 20% → -8  | < 35% → -5  | < 50% → -3
> 60% → +3  | > 70% → +5

// [B4] All-time PnL từ HL paginated fills (không đổi)
> $10k → +4  | > $0 → +2  | < $0 → -3  | < -$10k → -5

scoreB = clamp(scoreB, min=-8, max=20)
```

**Lưu ý:** Component G xử lý Copin-based behavioral signals riêng biệt.
Component B chỉ dùng Copin làm fallback data source, không tính G lần nữa.

---

## 5. Component C — Trade Size vs Market (0–20)

*Không thay đổi từ v2.1*

```typescript
// Dynamic coin tier from metaAndAssetCtxs (refreshed every 60s)
const dayNtlVlm = coinCtx.dayNtlVlm;  // 24h notional volume
const oiUsd     = coinCtx.oiNtlVlm;   // OI in USD

if (dayNtlVlm < 100_000 && trade.usdSize > 10_000) {
  scoreC += 12;  + flag DEAD_MARKET
} else {
  vlmRatio = trade.usdSize / dayNtlVlm;
  if (vlmRatio > 10%)  scoreC += 10;
  else if (vlmRatio > 5%)   scoreC += 7;
  else if (vlmRatio > 1%)   scoreC += 4;
}

oiRatio = trade.usdSize / oiUsd;
if (oiRatio > 10%)  { scoreC += 8; flag HIGH_OI; }
else if (oiRatio > 5%)   scoreC += 6;
else if (oiRatio > 1%)   scoreC += 3;

scoreC = min(20, scoreC);
```

---

## 6. Component D — Position Concentration (0–15)

*Không thay đổi từ v2.1*

```typescript
const marginUtil = totalMarginUsed / accountValue;
const impliedLev = trade.usdSize / accountValue;

marginUtil > 90% → +8 + flag ALL_IN
marginUtil > 70% → +5
marginUtil > 50% → +3

impliedLev ≥ 20 → +3 + flag HIGH_LEVERAGE

if (marginUsed / totalFundingUsd > 90%) scoreD += 4;  // all deposited capital deployed

scoreD = min(15, scoreD);
```

---

## 7. Component E — Ledger Purity (0–10)

*Không thay đổi từ v2.1*

```typescript
isDepositOnly = (withdrawals.length === 0 && deposits.length > 0)

isDepositOnly              → +5 + flag DEP_ONLY
ledgerTypes = {'deposit'}  → +3   (pure deposit-only ledger)
no rewardsClaim + age <30d → +2

scoreE = min(10, scoreE);
```

---

## 8. Component F — Behavioral Multiplier (×1.0–1.5)

*Không thay đổi từ v2.1, nhưng bổ sung combo mới trong v3.0*

```typescript
hasImmediate   = scoreA >= 22    // funded < 15 min
hasFreshWallet = fills90d === 0 || walletAgeDays < 1
hasAllIn       = flags.has('ALL_IN')
hasDeadMarket  = flags.has('DEAD_MARKET')
hasCopinSusp   = copinClass.archetype === 'INSIDER_SUSPECT'  // NEW v3.0

// Existing combos (v2.1):
if (hasImmediate && hasFreshWallet)             multiplier += 0.20
if (hasImmediate && hasAllIn)                   multiplier += 0.15
if (hasFreshWallet && hasDeadMarket)            multiplier += 0.15
if (hasImmediate && hasFreshWallet && hasAllIn) multiplier += 0.10  // triple

// NEW combo (v3.0): Copin + HL double confirmation
if (hasCopinSusp && hasImmediate)              multiplier += 0.10
if (hasCopinSusp && hasFreshWallet && hasAllIn) multiplier += 0.15  // triple

multiplier = min(1.5, 1.0 + totalBonuses)
```

---

## 9. Tóm tắt Score Ranges v3.0

```
Score = (A + B + C + D + E + G) × F

Lý thuyết max:
  A=25, B=20, C=20, D=15, E=10, G=15 = 105 × 1.5 = 157.5 → capped 100

Thực tế range:
  Fresh insider (immediate + all-in + Copin suspicious):
    A=25, B=18, C=15, D=12, E=8, G=10 = 88 × 1.5 = 132 → 100 (CRITICAL)

  Established smart trader (large trade, not insider):
    A=0, B=-2, C=8, D=5, E=2, G=-8 = 5 × 1.0 = 5 (NONE, discarded)

  Degen (big trade, high leverage):
    A=3, B=-8, C=10, D=12, E=5, G=-5 = 17 × 1.0 = 17 (NONE, discarded)

  Algo/HFT (bypassed Layer 2 somehow):
    A=14, B=5, C=8, D=8, E=3, G=-10 = 28 × 1.0 = 28 → LOW
    (still alerted but lower priority; Layer 2 should skip first)
```

---

## 10. Alert Level thresholds (không đổi)

| Score | Level | Badge | Action |
|------:|-------|-------|--------|
| ≥ 75 | CRITICAL | 🔴 | Lark alert immediate + report |
| ≥ 55 | HIGH | 🟠 | Lark alert + report |
| ≥ 40 | MEDIUM | 🟡 | Log + report |
| ≥ 25 | LOW | 🔵 | Log only |
| < 25 | NONE | — | **Discard** |

**Smart Trader threshold (v3.0):** Nếu Copin classifies as SMART_TRADER với confidence ≥ 0.8,
raise minimum alert threshold từ MEDIUM (40) lên HIGH (55). Lý do: established smart traders
thi thoảng trade lớn là bình thường, chỉ alert nếu pattern thực sự bất thường (score ≥ 55).

---

## 11. Wallet Type Classification (không đổi từ v2.0)

```typescript
// Priority order, first match wins:
if (isDepositOnly && fills90d <= 5 && walletAgeDays < 14)       → GHOST
if (deposits <= 2 && fills90d <= 3 && walletAgeDays < 7)        → ONE_SHOT
if (funded via incoming send from another HL address)           → SUB_ACCOUNT
if (walletAgeDays < 30 && fills90d < 20)                        → FRESH
if (accountValue > 1_000_000)                                   → WHALE
else                                                             → NORMAL
```

---

## 12. Flag Index v3.0

| Flag | Trigger | Sort bonus |
|------|---------|-----------|
| GHOST | isDepositOnly + fills90d≤5 + age<14d | +15 |
| ONE_SHOT | deposits≤2 + fills90d≤3 + age<7d | +12 |
| FRESH_DEP | scoreA ≥ 22 | +10 |
| FIRST | fills90d = 0 AND first ever fill | +8 |
| ALL_IN | marginUtil > 90% | +6 |
| MEGA | trade.usdSize ≥ MEGA_TRADE_USD | +5 |
| NEW_ACCT | fills90d < NEW_TRADER_FILLS_THRESHOLD | +4 |
| HIGH_LEV | impliedLev ≥ 20 | +2 |
| DEP_ONLY | isDepositOnly | +2 |
| DEAD_MKT | dayNtlVlm < $100K | +1 |
| HIGH_OI | oiRatio > 10% | +1 |
| HFT | userFees.userAddRate ≤ 0 | (skip — not added to suspects) |
| **COPIN_SUSPICIOUS** | **G ≥ 5 from Copin** | **+8** |
| **SMART_TRADER** | **Copin archetype SMART_TRADER** | **(info only, no bonus)** |

---

## 13. Calibration Notes (từ 2026-03-04 data)

### Retrospective analysis với v3.0

| Wallet | v2.1 score | G component | v3.0 score | Thay đổi |
|--------|-----------|------------|-----------|---------|
| 0x040db4 (real insider, kBONK) | 68 | +0 (UNKNOWN, new acc) | 68 | ↔ unchanged |
| 0x308ac0 (real insider, SUI/APT) | 62 | +0 (UNKNOWN) | 62 | ↔ unchanged |
| 0xc8787a (FP — chronic loser bot) | 71 | -5 (DEGEN) | 66 | ↓ -5 → HIGH not CRITICAL |
| 0x185dc9 (FP — margin exhaustion) | ~45 | -8 (SMART_TRADER?) | ~37 | ↓ may drop to LOW |
| 0x44fbbb (FP — USTC degen) | ~50 | -5 (DEGEN) | ~45 | ↓ reduced |

**Key insight:** G component không ảnh hưởng đến real insiders với fresh accounts (UNKNOWN → G=0),
nhưng giảm đáng kể score của chronic losers và established traders.

### Known limitations

1. **Copin data lag:** Copin stats cập nhật theo batch (không real-time). D30 stats có thể
   lag 1–6h. Chấp nhận được vì behavioral patterns thay đổi chậm.

2. **Very fresh accounts (< 5 trades):** Copin → UNKNOWN → G = 0. Đây là thiết kế đúng
   (không penalize fresh accounts, vì real insiders thường dùng fresh wallets).

3. **Copin classifies on CLOSED positions only.** Một trader mới open positions lớn nhưng
   chưa đóng → Copin stats có thể chưa reflect. HL direct data vẫn là primary.

4. **1 trader : nhiều protocols.** Copin data là per-protocol. Một insider có thể xuất hiện
   lần đầu trên HL nhưng có track record trên GMX/dYdX. Phase 3 có thể extend sang cross-protocol.
