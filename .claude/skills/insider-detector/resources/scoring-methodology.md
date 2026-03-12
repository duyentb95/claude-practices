# Insider Detection — Scoring Methodology

> Matches `InsiderDetectorService.scoreTrader()` in `apps/insider-scanner/src/scanner/insider-detector.service.ts`
> Last synced with code: 2026-03-12

---

## Formula

```
finalScore = min(100, round( (A + B + C + D + E) × F ))
```

Where each component targets a different dimension of the insider-trading hypothesis.

---

## Component A — Deposit-to-Trade Speed (0–25 pts)

**Hypothesis**: Insiders move capital in immediately before trading — this gap is the strongest signal.

```typescript
const gapMs  = trade.detectedAt - lastFundingTime;
const gapMin = gapMs / 60_000;

scoreA =
  gapMin <= 5    ? 25 :  // + flag FRESH_DEPOSIT
  gapMin <= 15   ? 22 :
  gapMin <= 30   ? 18 :
  gapMin <= 60   ? 14 :
  gapMin <= 180  ? 10 :
  gapMin <= 360  ?  6 :
  gapMin <= 1440 ?  3 : 0;

// Bonus: nearly all deposit deployed as this trade
if (totalFundingUsd > 0 && trade.usdSize / totalFundingUsd > 0.80) {
  scoreA = Math.min(25, scoreA + 3);
}
```

**lastFundingTime** = `max(...deposits.time, ...incomingSends.time)`

Deposits include both `type: 'deposit'` AND `type: 'send'` where `delta.user ≠ target` (i.e., funded by another address — controller / sub-account pattern).

---

## Component B — Wallet Freshness & Quality (−8 to 20 pts)

**Hypothesis**: Insiders use fresh wallets with no history. Chronic losers are not insiders.

### Age sub-score
```typescript
walletAgeDays = (Date.now() - firstLedgerEntry.time) / 86_400_000;

if      (walletAgeDays < 1)  scoreB += 10;
else if (walletAgeDays < 3)  scoreB += 8;
else if (walletAgeDays < 7)  scoreB += 6;
else if (walletAgeDays < 14) scoreB += 4;
else if (walletAgeDays < 30) scoreB += 2;
```

### 90-day order count
`fillCount = fills.filter(f => f.time >= ninetyDaysAgo).length`
(uses `aggregateByTime: true` — counts actual orders, not raw fills)

```typescript
if      (fillCount >= 2000) scoreB -= 5;  // API hard cap = established HF trader
else if (fillCount === 0)   scoreB += 10;
else if (fillCount <= 3)    scoreB += 8;
else if (fillCount <= 10)   scoreB += 5;
else if (fillCount <= 30)   scoreB += 2;
```

### Win rate (90-day closed positions)
```typescript
const closedFills = fills90d.filter(f => parseFloat(f.closedPnl ?? '0') !== 0);
const winRate = closedFills.length >= 10
  ? fills90d.filter(f => parseFloat(f.closedPnl ?? '0') > 0).length / closedFills.length
  : null; // skip if < 10 data points

if (winRate !== null) {
  if      (winRate < 0.20) scoreB -= 8;
  else if (winRate < 0.35) scoreB -= 5;
  else if (winRate < 0.50) scoreB -= 3;
  else if (winRate > 0.70) scoreB += 5;
  else if (winRate > 0.60) scoreB += 3;
}
```

### All-time PnL (from full paginated fills)
```typescript
const allTimePnl = allFills.reduce(
  (sum, f) => sum + parseFloat(f.closedPnl ?? '0'), 0
);

if (allFills.length > 0) {
  if      (allTimePnl > 10_000)  scoreB += 4;
  else if (allTimePnl > 0)       scoreB += 2;
  else if (allTimePnl < -10_000) scoreB -= 5;
  else if (allTimePnl < 0)       scoreB -= 3;
}

scoreB = Math.min(20, Math.max(-8, scoreB));
```

---

## Component C — Trade Size vs Market Context (0–20 pts)

**Hypothesis**: Large trades relative to market depth suggest conviction from non-public information.

Coin tier data from `metaAndAssetCtxs` (refreshed hourly):
- `dayNtlVlm` — 24-hour notional volume in USD
- `openInterest` × `markPx` = OI in USD

```typescript
// Dynamic thresholds (per-coin, not global)
const BLUECHIPS = ['BTC', 'ETH', 'SOL'];
function calcThreshold(coin, dayNtlVlm) {
  if (BLUECHIPS.includes(coin) || dayNtlVlm > 100_000_000) return 500_000;
  if (dayNtlVlm > 10_000_000)  return 100_000;
  if (dayNtlVlm > 500_000)     return 30_000;
  return 10_000;
}

// Dead market bonus
if (dayNtlVlm < 100_000 && trade.usdSize > 10_000) {
  scoreC += 12; // flag DEAD_MARKET
} else {
  const vlmRatio = trade.usdSize / dayNtlVlm;
  if      (vlmRatio > 0.10) scoreC += 10;
  else if (vlmRatio > 0.05) scoreC += 7;
  else if (vlmRatio > 0.01) scoreC += 4;
}

const oiRatio = trade.usdSize / oiUsd;
if      (oiRatio > 0.10) { scoreC += 8; } // flag HIGH_OI_RATIO
else if (oiRatio > 0.05)   scoreC += 6;
else if (oiRatio > 0.01)   scoreC += 3;

// Volume EMA anomaly adjustment (Phase 3 — requires ≥10 EMA samples)
// coinVolumeEma updated every ~60s in refreshCoinTiers(); α = 0.1
const volEma = coinVolumeEma.get(trade.coin);
if (volEma && volEma.sampleCount >= 10 && volEma.ema > 0) {
  const volumeRatio = dayNtlVlm / volEma.ema;
  if (volumeRatio > 3.0) {
    scoreC = Math.max(0, scoreC - 3);  // flag VOLUME_SPIKE — news/event day, less suspicious
  } else if (volumeRatio < 0.5) {
    scoreC = Math.min(20, scoreC + 2); // quiet market — trade stands out more
  }
}

scoreC = Math.min(20, scoreC);
```

---

## Component D — Position Concentration (0–15 pts)

**Hypothesis**: Going "all-in" on high leverage is a behavioural tell of information advantage.

```typescript
const accountValue = parseFloat(state.marginSummary.accountValue);
const marginUsed   = parseFloat(state.marginSummary.totalMarginUsed);
const marginUtil   = marginUsed / accountValue;
const impliedLev   = trade.usdSize / accountValue;

if      (marginUtil > 0.9) { scoreD += 8; } // flag ALL_IN
else if (marginUtil > 0.7)   scoreD += 5;
else if (marginUtil > 0.5)   scoreD += 3;

if (impliedLev >= 20) { scoreD += 3; } // flag HIGH_LEVERAGE

if (totalFundingUsd > 0 && marginUsed / totalFundingUsd > 0.9) {
  scoreD += 4;   // almost all deposited capital is now in margin
}

scoreD = Math.min(15, scoreD);
```

---

## Component E — Ledger Purity (0–10 pts)

**Hypothesis**: One-way wallets (deposit → trade, no withdrawals) suggest single-use throwaway accounts.

```typescript
const isDepositOnly = withdrawals.length === 0 && deposits.length > 0;

if (isDepositOnly) {
  scoreE += 5; // flag DEPOSIT_ONLY
}
// Only 'deposit' ledger type — no sends, rewards, etc.
if (ledgerTypes.size === 1 && ledgerTypes.has('deposit')) {
  scoreE += 3;
}
// No rewards claim suggests wallet is not a regular user
if (!ledgerTypes.has('rewardsClaim') && walletAgeDays < 30) {
  scoreE += 2;
}

scoreE = Math.min(10, scoreE);
```

---

## Component F — Behavioral Multiplier (×1.0–1.5)

**Hypothesis**: Combinations of signals are multiplicatively more suspicious than any single signal.

```typescript
const hasImmediate   = scoreA >= 22;          // funded < 15 min before trade
const hasFreshWallet = fillCount90d === 0 || walletAgeDays < 1;
const hasAllIn       = extraFlags.includes(InsiderFlag.ALL_IN);
const hasDeadMarket  = extraFlags.includes(InsiderFlag.DEAD_MARKET);

let multiplier = 1.0;
if (hasImmediate && hasFreshWallet)              multiplier += 0.20;
if (hasImmediate && hasAllIn)                    multiplier += 0.15;
if (hasFreshWallet && hasDeadMarket)             multiplier += 0.15;
if (hasImmediate && hasFreshWallet && hasAllIn)  multiplier += 0.10; // triple combo

multiplier = Math.min(1.5, multiplier);
```

---

## Score Interpretation Guide

| Range | Meaning | False positive rate |
|------:|---------|---------------------|
| 90–100 | Near-certain insider | < 5% |
| 75–89 | Very likely insider (CRITICAL) | ~10% |
| 55–74 | Probable insider (HIGH) | ~25% |
| 40–54 | Suspicious (MEDIUM) | ~50% |
| 25–39 | Minor signals (LOW) | ~75% |
| < 25 | Normal trader — discard | — |

**Known false positive sources:**
- Newly funded legitimate large traders who happen to trade immediately
- Sub-accounts of known market participants (now caught by SUB_ACCOUNT type)
- Very low liquidity coins where any trade is a large % of volume (DEAD_MARKET flag)
- Established smart traders flagged for large position on normal coin (SMART_TRADER archetype, scoreG = −8)
- Volume-spike days (news/events): VOLUME_SPIKE flag reduces scoreC by 3

**Daily FP Digest**: the scanner sends a daily Lark card at configured UTC hour (`FP_DIGEST_HOUR`, default 8)
listing HIGH/CRITICAL suspects with FP indicators for operator review. Set `FP_DIGEST_ENABLED=false` to disable.

**Known false negative sources:**
- Insiders using old wallets with trading history (scoreB = 0, reduces A+C+D+E impact)
- Insiders using HFT/MM wallets (caught by Layer 1 filter — but they're skipped entirely)
- Very slow insiders funding days before trading (scoreA = 0)
