# Strategy Improvement Proposal: Send-Type Ledger Coverage, Fill-Cap False Positives, Win Rate Filter, and Cluster Coordination Boost

**Date**: 2026-03-04
**Priority**: P0
**Estimated Impact**: Reduces false negatives by ~32% (6 wallets in C001 cluster that scored 25-36 should score 50-72); reduces false positives by ~15% (wallets hitting 2000-fill cap with low win rates de-scored); eliminates one confirmed false-positive flag class (FIRST/ONE_SHOT on 2000-fill wallets).

---

## Problem Statement

The 2026-03-04 deep-scan of 19 suspects produced three concrete evidence-backed failures in the live scoring engine (`scoreTrader`):

**Issue 1 — `send` type ledger entries bypass the FRESH_DEP filter and scoreA entirely.**
Six wallets in cluster C001 were funded exclusively via `send` type ledger entries from controller `0x6b9e773128f453f5c2c60935ee2de2cbc5390a24`. None of them produced a `depositToTradeGapMs` or `FRESH_DEP` flag, because `scoreA` only reads entries where `l.delta?.type === 'deposit'`. The cluster analysis confirms these six wallets deployed capital 26–112 seconds after receiving funds — timing that is objectively more suspicious than the `≤ 5 min` FRESH_DEP tier, yet they each received `scoreA = 0`. Their live scores were 25–36 vs a corrected deep-scan score of 38–68. The fund-flow gap is the single highest-confidence clustering signal identified today.

**Issue 2 — Wallets at the 2000-fill API cap receive inflated scoreB from `fillCount === 0` false positives.**
Wallet `0x185dc9eb` was tagged `FIRST_TIMER` (fills = 0) and scored `scoreB += 10` for zero fills, plus additional multiplier boost. The wallet's actual file contains 2000 fills; the live REST call returned 0 because the 90-day query was served a cached or rate-limited empty response at the moment of inspection. The wallet is a confirmed losing BTC short-closer with 0% win rate — the exact opposite of insider behaviour. Separately, wallets genuinely at the 2000-fill cap (cap is a hard API limit, not a reflection of trading activity) should not receive a freshness bonus because high fill counts disqualify one-shot classification. The current model does not penalise the 2000-fill edge case.

**Issue 3 — Win rate is computed in the deep scorer but absent from the live `scoreTrader` model.**
The deep scorer penalised wallets with win rates below 57% and assigned a score penalty of 1–7 points. None of the 19 suspects had win rate > 57%. Genuine insiders, by definition, should have asymmetrically positive trade outcomes around their information edge. Established traders with chronic losses (0%–32% win rates across 2000+ fills) are the most common false-positive class in the current live suspect set. Win rate is computable from the `fills` array already fetched in `inspectTrader` (closedPnl field, non-zero = closed trade, positive = winner). Adding a win rate penalty to `scoreB` or as a new component `scoreF` would systematically reduce false-positive suspects.

**Issue 4 — Cluster members have independent scores with no coordination bonus.**
All six wallets in C001 scored 25–36 individually. The cluster analysis raised their effective scores to 38–68 by adding a `cluster_coordination` factor worth 10 points. The live engine has no mechanism to propagate a cluster signal. When a controller address is detected funding multiple suspects, each sub-wallet should receive a retroactive score boost.

---

## Root Cause

### Issue 1
In `scoreTrader` (line 428):
```typescript
const deposits = ledger.filter(l => l.delta?.type === 'deposit');
```
This exclusively matches Hyperliquid bridge deposits (on-chain → perp). Internal spot-to-perp transfers initiated from another Hyperliquid address appear as `type === 'send'` in the ledger (confirmed by the cluster JSON: all C001 transfers carry `"type": "send"`). The `lastDepositTime` calculation therefore returns `0` for any wallet funded entirely via internal sends, making `scoreA = 0` and `depositToTradeGapMs = null` regardless of how quickly capital was deployed.

### Issue 2
The 2000-fill REST cap is a hard Hyperliquid API limit — the endpoint returns at most 2000 fills per query. When a wallet is at the cap, the scanner's `fills.length` correctly reflects `2000`, but the `fillCount === 0` path is reached only when the REST call returns an empty array due to API error, cache miss, or rate limiting at the time of query. The current code has no guard for this: `scoreB` grants its maximum freshness bonus (`+10`) to `fillCount === 0` wallets unconditionally. Additionally, there is no downward adjustment when `fills.length === 2000` — a wallet at the API cap is treated identically to a wallet with 2000 legitimate fills in the scoring model, but should be penalised since high fill count disqualifies the insider profile.

### Issue 3
`scoreTrader` fetches `fills` (line 374) and uses `fills.length` for scoring but never computes win rate. The `closedPnl` field is present on each fill object returned by the Hyperliquid fills REST endpoint. The deep scorer already demonstrates the computation is trivial (`closedPnl > 0` = win). The live model simply has no component for it.

### Issue 4
`scoreTrader` is a pure per-wallet function with no knowledge of other suspects. `upsertSuspect` stores suspects in `this.suspects` (a `Map`), which is accessible at the service level. After scoring a new wallet, the engine never checks whether other suspects share a common `send`-type funder address, so coordinated clusters produce no feedback loop.

---

## Proposed Changes

### Change 1: Extend deposit-speed scoring to include `send` type ledger entries

**File**: `apps/insider-scanner/src/scanner/insider-detector.service.ts`
**Location**: `scoreTrader` method, lines 428–469 (section `[A] Deposit-to-Trade Speed`)

**Current behavior**:
```typescript
// Parse ledger entries
const deposits     = ledger.filter(l => l.delta?.type === 'deposit');
const withdrawals  = ledger.filter(l => l.delta?.type === 'withdraw');
const ledgerTypes  = new Set<string>(ledger.map(l => l.delta?.type).filter(Boolean));

const lastDepositTime = deposits.length > 0
  ? Math.max(...deposits.map(d => d.time))
  : 0;
const totalDepositsUsd = deposits.reduce((sum, d) => sum + parseFloat(d.delta.usdc || '0'), 0);
```

**Proposed behavior**:
```typescript
// Parse ledger entries — treat both external 'deposit' and internal 'send' as funding events.
// 'send' entries represent spot-to-perp internal transfers from another Hyperliquid address
// (e.g. a controller funding a sub-wallet). Their delta object contains a 'usdc' amount field
// identical in shape to deposit entries.
const deposits     = ledger.filter(l => l.delta?.type === 'deposit' || l.delta?.type === 'send');
const withdrawals  = ledger.filter(l => l.delta?.type === 'withdraw');
const ledgerTypes  = new Set<string>(ledger.map(l => l.delta?.type).filter(Boolean));

// Track whether funding came via internal send (sub-account / controller pattern)
const fundedViaSend = deposits.some(d => d.delta?.type === 'send');

const lastDepositTime = deposits.length > 0
  ? Math.max(...deposits.map(d => d.time))
  : 0;
const totalDepositsUsd = deposits.reduce((sum, d) => sum + parseFloat(d.delta.usdc || '0'), 0);
```

**Also update** the `FRESH_DEP` flag push and the `DEPOSIT_ONLY` check in section `[E]` to account for send-only wallets (no external deposits, only sends):

In the `[A]` block where `FRESH_DEPOSIT` is pushed (line 463), no change is needed — the flag is emitted whenever `gapMin <= 5`, which now correctly fires for send-funded wallets.

In the `[E]` block (line 542), extend the `isDepositOnly` definition:
```typescript
// Current:
const isDepositOnly = withdrawals.length === 0 && deposits.length > 0;

// Proposed (deposits now includes 'send' entries, so condition is unchanged in shape,
// but semantics now correctly cover send-funded wallets):
const isDepositOnly = withdrawals.length === 0 && deposits.length > 0;
// Note: deposits array already includes 'send' entries after Change 1 above —
// no further change needed here.
```

**Rationale**: The six C001 wallets (040db4, ccd85d, 62ad4c, b3fe34, e25cbf, 308ac0) all show `depositToTradeGapMs = null` in the live scanner despite 26–112 second deploy-to-trade windows. With this fix, wallet 040db4 (`send` at 1772546601054, trade at 1772546643669, gap = 42.6s = 0.71 min) would score `scoreA = 22` (sub-15-min tier) and receive `FRESH_DEP`. Wallet `ccd85d` (send at 1772557701037, trade at 1772557813623, gap = 112.6s = 1.88 min) would score `scoreA = 18`. These corrections would lift the C001 members from 25–36 into the 42–55 range, crossing the MEDIUM threshold.

**Risk**: `send` entries can also represent spot→perp collateral moves by the wallet itself (self-send). To avoid falsely treating a routine self-fund as a fresh deposit signal, the `fundedViaSend` variable should be surfaced in the `FRESH_DEP` flag logic to distinguish external-send (from a different `user` address) from self-send. The ledger's `send` entry format includes a `user` field indicating the sender. A self-send has `l.delta.user === address`; a controller send has a different address.

A refined guard should be applied at the flag emission point:

```typescript
// Refined FRESH_DEP emission — only flag if send came from an external address
if (gapMin <= 5) {
  const isSelfFunded = deposits
    .filter(d => d.delta?.type === 'send')
    .every(d => d.delta?.user?.toLowerCase() === address.toLowerCase());
  if (!isSelfFunded) {
    extraFlags.push(InsiderFlag.FRESH_DEPOSIT);
  } else {
    extraFlags.push(InsiderFlag.FRESH_DEPOSIT); // self-funded spot→perp is still valid signal
  }
}
```

Note: since even self-funded spot→perp moves represent intentional capital deployment into the perp engine immediately before a large trade, the `FRESH_DEP` flag is appropriate in both cases. The primary value of tracking `fundedViaSend` is the `SUB_ACCOUNT` wallet classification (see New Flag below) and future cluster correlation.

---

### Change 2: Add fill-cap penalty and win rate component to scoreB

**File**: `apps/insider-scanner/src/scanner/insider-detector.service.ts`
**Location**: `scoreTrader` method, lines 480–487 (section `[B] Wallet Freshness`) and the `fills` variable used at line 481

**Current behavior**:
```typescript
const fillCount = fills.length;
if      (fillCount === 0)  scoreB += 10;
else if (fillCount <= 3)   scoreB += 8;
else if (fillCount <= 10)  scoreB += 5;
else if (fillCount <= 30)  scoreB += 2;
```

**Proposed behavior**:
```typescript
const fillCount = fills.length;
// 2000 is the Hyperliquid REST API hard cap for fill history queries.
// A wallet at the cap is a high-frequency established trader — the exact opposite
// of the fresh/new-wallet insider profile. Apply a penalty instead of a bonus.
const atFillCap = fillCount === 2000;

if (atFillCap) {
  scoreB += -5; // penalty: established HFT/active trader, not a fresh insider wallet
} else if (fillCount === 0) {
  scoreB += 10;
} else if (fillCount <= 3)   scoreB += 8;
else if (fillCount <= 10)    scoreB += 5;
else if (fillCount <= 30)    scoreB += 2;
// fillCount 31–1999: no bonus (neutral)

// ── Win Rate Computation (penalty for chronic losers) ──────────────────────
// closedPnl field on each fill: > 0 = profitable close, < 0 = loss, 0.0 = open/funding
// Only closed fills have meaningful win/loss signal.
const closedFills = fills.filter(f => {
  const pnl = parseFloat(f.closedPnl ?? '0');
  return pnl !== 0;
});
const winningFills = closedFills.filter(f => parseFloat(f.closedPnl) > 0);
const winRate = closedFills.length >= 10
  ? winningFills.length / closedFills.length
  : null; // insufficient data — do not penalise

// Genuine insiders should have elevated win rates on their information-edge trades.
// Chronic losers (win rate < 40%) are almost certainly not acting on inside information.
// Apply a graduated negative adjustment to scoreB:
let winRatePenalty = 0;
if (winRate !== null) {
  if      (winRate < 0.20) winRatePenalty = -8;
  else if (winRate < 0.35) winRatePenalty = -5;
  else if (winRate < 0.50) winRatePenalty = -3;
  else if (winRate > 0.70) winRatePenalty = +5; // bonus: high win rate is consistent with edge
  else if (winRate > 0.60) winRatePenalty = +3;
}
scoreB = Math.min(20, Math.max(-8, scoreB + winRatePenalty));
```

**Rationale**:
- Wallet `0x185dc9` had `fillCount90d = 0` from a failed REST call but actually has 2000 fills; the fill-cap penalty would not have fixed the false positive directly (the bug is the REST call returning 0, not the scoring). However, introducing an explicit `atFillCap` branch prevents the inverse problem: a genuine 2000-fill wallet correctly reported at cap no longer receives silence — it receives a `-5` penalty reflecting its established-trader status.
- The win rate penalty directly addresses the analysis finding that all 19 suspects had win rates below 57%. The three highest-scoring false positives had win rates of 32.4% (0xc8787a), 0.7% (0x308ac0), and 0.0% (0x185dc9). Applying the penalty tiers: 0xc8787a (`winRate = 0.324`) gets `-5`; 0x308ac0 (`winRate = 0.007`) gets `-8`; 0x185dc9 (`winRate = 0.0`) gets `-8`. These reductions correctly push them toward MEDIUM or LOW alert levels.
- The `+5` bonus for `winRate > 0.70` rewards a genuine signal without inflating scores beyond the cap.

**Risk**:
- `closedPnl = 0.0` on open positions is correctly excluded. However, funding payments also appear in fills with closedPnl = 0 — the `pnl !== 0` filter correctly handles this.
- Wallets with fewer than 10 closed fills cannot produce a statistically meaningful win rate. The `winRate = null` guard prevents penalising new wallets that have only opened positions.
- A manipulative actor could intentionally take small losses to suppress their win rate and evade this filter. This is acknowledged as a low-probability evasion path given the associated capital cost.

---

### Change 3: Add SUB_ACCOUNT wallet classification for send-funded wallets

**File**: `apps/insider-scanner/src/scanner/insider-detector.service.ts`
**Location**: `scoreTrader` method, lines 565–578 (wallet type classification block)

**Current behavior**:
```typescript
let walletType: WalletType;
if (isDepositOnly && fillCount <= 5 && walletAgeDays < 14) {
  walletType = WalletType.GHOST;
  extraFlags.push(InsiderFlag.GHOST_WALLET);
} else if (deposits.length <= 2 && fillCount <= 3 && walletAgeDays < 7) {
  walletType = WalletType.ONE_SHOT;
  extraFlags.push(InsiderFlag.ONE_SHOT);
} else if (walletAgeDays < 30 && fillCount < 20) {
  walletType = WalletType.FRESH;
} else if (accountValue > 1_000_000) {
  walletType = WalletType.WHALE;
} else {
  walletType = WalletType.NORMAL;
}
```

**Proposed behavior**:
```typescript
let walletType: WalletType;
if (isDepositOnly && fillCount <= 5 && walletAgeDays < 14) {
  walletType = WalletType.GHOST;
  extraFlags.push(InsiderFlag.GHOST_WALLET);
} else if (deposits.length <= 2 && fillCount <= 3 && walletAgeDays < 7) {
  walletType = WalletType.ONE_SHOT;
  extraFlags.push(InsiderFlag.ONE_SHOT);
} else if (fundedViaSend) {
  // Wallet was funded (at least partially) by an internal 'send' from another
  // Hyperliquid address. This is the sub-account / controller pattern.
  // SUB_ACCOUNT takes priority over FRESH to surface the funding relationship.
  walletType = WalletType.SUB_ACCOUNT;
} else if (walletAgeDays < 30 && fillCount < 20) {
  walletType = WalletType.FRESH;
} else if (accountValue > 1_000_000) {
  walletType = WalletType.WHALE;
} else {
  walletType = WalletType.NORMAL;
}
```

**Rationale**: `WalletType.SUB_ACCOUNT` is already defined in the enum (`trade.dto.ts` line 43: `SUB_ACCOUNT = 'SUB_ACCOUNT', // Funded via internal transfer`) but is never set by any code path in the live engine. This change activates it. The `fundedViaSend` variable is introduced in Change 1. Surfacing `SUB_ACCOUNT` in the web UI and Lark alerts gives human reviewers an immediate signal that the wallet is likely part of a controlled network without requiring them to read the ledger entries manually.

**Risk**: Low. `WalletType.SUB_ACCOUNT` is a display/classification field only and does not affect score calculation. The sole risk is misclassifying a wallet that received a one-off legitimate spot gift (e.g., from an exchange withdrawal arriving via internal send). This is acceptable given the high specificity of the fund_flow signal.

---

### Change 4: Add cluster coordination retroactive score boost

**File**: `apps/insider-scanner/src/scanner/insider-detector.service.ts`
**Location**: `upsertSuspect` method, lines 604–657, and a new private helper method `applyClusterBoost`

**Current behavior**: `upsertSuspect` stores each suspect independently. No inter-suspect relationship is tracked. After a new suspect is added, no existing suspects are re-evaluated.

**Proposed behavior**:

Add a private method that extracts the sender addresses from `send`-type ledger entries and checks whether any currently stored suspect shares a common funder. If a shared funder is found, both the new suspect and all existing suspects funded by the same address receive a cluster coordination bonus.

The method requires access to the ledger, which is only available inside `inspectTrader`. The cleanest approach is to pass the parsed funder addresses into `upsertSuspect` as an optional parameter.

```typescript
// In inspectTrader, after scoring, extract external funder addresses:
const externalFunders = new Set<string>(
  ledger
    .filter(l => l.delta?.type === 'send' && l.delta?.user?.toLowerCase() !== address.toLowerCase())
    .map(l => (l.delta.user as string).toLowerCase())
    .filter(Boolean)
);

// Pass to upsertSuspect:
this.upsertSuspect(address, trade, profile, scoring, externalFunders);
```

```typescript
// upsertSuspect signature change:
private upsertSuspect(
  address: string,
  trade: LargeTrade,
  profile: TraderProfile,
  scoring: InsiderScore,
  externalFunders: Set<string> = new Set(),
) {
  // ... existing logic unchanged ...

  // After inserting or updating, apply cluster boost if funders overlap
  if (externalFunders.size > 0) {
    this.applyClusterBoost(address, externalFunders);
  }
}

/**
 * If the current suspect shares a funder address with any existing suspect,
 * apply a cluster coordination bonus to all wallets in the funder group.
 * Boost is capped at 15 points and only applied once per funder group discovery.
 */
private applyClusterBoost(newAddress: string, funders: Set<string>) {
  const CLUSTER_BONUS = 15;

  for (const [existingAddr, existingSuspect] of this.suspects.entries()) {
    if (existingAddr === newAddress) continue;

    // Check if the existing suspect's stored externalFunders overlap
    // (requires storing funders on SuspectEntry — see New Fields below)
    const sharedFunder = [...funders].some(f =>
      existingSuspect.externalFunders?.has(f)
    );

    if (sharedFunder) {
      // Boost both wallets
      const newSuspect = this.suspects.get(newAddress)!;
      newSuspect.insiderScore = Math.min(100, newSuspect.insiderScore + CLUSTER_BONUS);
      existingSuspect.insiderScore = Math.min(100, existingSuspect.insiderScore + CLUSTER_BONUS);

      // Update alert levels to reflect boosted scores
      newSuspect.alertLevel = this.scoreToAlertLevel(newSuspect.insiderScore);
      existingSuspect.alertLevel = this.scoreToAlertLevel(existingSuspect.insiderScore);

      this.addLog(
        `[CLUSTER] Shared funder detected — boosted ${newAddress.slice(0, 10)}` +
        ` and ${existingAddr.slice(0, 10)} by +${CLUSTER_BONUS} pts`
      );
    }
  }

  // Store funders on the new suspect for future correlation
  const newSuspect = this.suspects.get(newAddress);
  if (newSuspect) {
    newSuspect.externalFunders = funders;
  }
}

private scoreToAlertLevel(score: number): AlertLevel {
  if      (score >= 75) return AlertLevel.CRITICAL;
  else if (score >= 55) return AlertLevel.HIGH;
  else if (score >= 40) return AlertLevel.MEDIUM;
  else if (score >= 25) return AlertLevel.LOW;
  else                  return AlertLevel.NONE;
}
```

**Rationale**: Today's cluster C001 had 6 wallets scoring 25–36 individually. With a 15-point cluster bonus, all 6 would reach 40–51, crossing the MEDIUM threshold. The shared controller address `0x6b9e773128f453f5c2c60935ee2de2cbc5390a24` is the single most compelling evidence of coordinated insider activity in today's data: $1.25M deployed to 6 sub-accounts trading 9 different coins simultaneously. The bonus is appropriate at 15 points because shared funding is a structural signal not captured by any individual wallet's ledger purity or timing signals.

**Risk**:
- The boost is additive and applied retroactively, which could cause a suspect to jump from LOW to HIGH alert unexpectedly. The Lark alert should log the cluster event separately rather than re-sending a full suspect alert.
- False cluster detection is possible if a legitimate custodial exchange address appears as the funder for multiple independent traders. Mitigate by excluding known custodial addresses (e.g., the Hyperliquid staking contract `0x2222222222222222222222222222222222222222`) from the funder correlation set.

---

## New Flag (applicable to Change 3)

**Flag**: `InsiderFlag.FUNDED_VIA_SEND` (optional, lower priority than the wallet type change)

This flag would explicitly mark wallets whose primary funding mechanism is an internal `send` rather than an external bridge deposit. It surfaces in the Lark alert and web UI without requiring reviewers to inspect ledger details.

```typescript
// In trade.dto.ts, InsiderFlag enum — add after DEPOSIT_ONLY:
FUNDED_VIA_SEND = 'SEND_FUNDED',  // Wallet's primary capital source is an internal 'send' from another HL address
```

Emit in `scoreTrader` after the `[A]` block:
```typescript
if (fundedViaSend && !extraFlags.includes(InsiderFlag.FUNDED_VIA_SEND)) {
  extraFlags.push(InsiderFlag.FUNDED_VIA_SEND);
}
```

---

## New Fields on `SuspectEntry` (required by Change 4)

**File**: `apps/insider-scanner/src/scanner/dto/trade.dto.ts`
**Location**: `SuspectEntry` interface, after `depositToTradeGapMs`

```typescript
// Add to SuspectEntry interface:
externalFunders?: Set<string>;  // controller addresses that sent 'send' type ledger entries to this wallet
clusterBoostApplied?: boolean;  // true once cluster boost has been applied (prevents double-boost)
```

---

## Test Cases

### Test 1: `send`-funded wallet receives scoreA (Change 1)
- Input: ledger = `[{ time: T, delta: { type: 'send', usdc: '30000', user: '0xController' } }]`, trade detected at `T + 45000ms`
- Expected: `lastDepositTime = T`, `depositToTradeGapMs = 45000` (0.75 min), `scoreA = 22`, `FRESH_DEP` flag emitted
- Current result: `scoreA = 0`, `depositToTradeGapMs = null`

### Test 2: Self-send (spot→perp) is not mistaken for external funding (Change 1)
- Input: ledger entry has `delta.type = 'send'` and `delta.user = address` (same wallet)
- Expected: `scoreA` computed normally (self-fund is still a valid timing signal), `walletType` should NOT be `SUB_ACCOUNT`
- Note: `fundedViaSend` should be `false` when all sends are self-sends; `SUB_ACCOUNT` assignment guarded accordingly

### Test 3: 2000-fill cap wallet receives penalty (Change 2)
- Input: `fills.length === 2000`
- Expected: `scoreB` receives `-5` for fill-cap status, net scoreB reflects penalty
- Current result: wallet receives no adjustment at 2000-fill boundary

### Test 4: Chronic loser receives win rate penalty (Change 2)
- Input: fills contains 828 closed trades, 268 winners → `winRate = 0.324`
- Expected: `winRatePenalty = -5` applied to scoreB (0.324 falls in `< 0.35` band)
- Concrete case: wallet `0xc8787a` (AIXBT, 32.4% win rate) — live score 46 should drop to approximately 41

### Test 5: Cluster boost fires on shared funder (Change 4)
- Input: wallet A already in suspects with `externalFunders = { '0xController' }`; wallet B inspected with ledger containing a `send` from `'0xController'`
- Expected: both A and B receive `+15` insiderScore, cluster log message emitted
- Expected: alert levels recalculated after boost

### Test 6: Known custodial address excluded from cluster funder set (Change 4)
- Input: wallet funded via `send` from `0x2222222222222222222222222222222222222222` (HL staking contract)
- Expected: staking contract address not added to `externalFunders`; no cluster boost triggered
- Implementation: maintain a `KNOWN_CUSTODIAL_ADDRESSES` constant and filter before constructing `externalFunders`

---

## Expected Impact

| Metric | Before (2026-03-04 live) | After (projected) |
|--------|--------------------------|-------------------|
| C001 cluster wallets detected at >= MEDIUM | 0 / 6 | 5–6 / 6 |
| 0x040db4 (kBONK, send-funded, 42s gap) score | 36 | ~58 (scoreA +22, cluster +15, net) |
| 0xccd85d (ADA, send-funded, 112s gap) score | 30 | ~52 (scoreA +18, cluster +15) |
| 0x308ac0 (SUI/APT, send-funded, WHALE) score | 29 | ~49 (scoreA computed, cluster +15) |
| 0x185dc9 false-positive (ONE_SHOT/FIRST) | Tagged suspicious, score 25 | Score reduced ~17 → NONE (2000-fill penalty -5, 0% win rate -8, no FIRST/ONE_SHOT if REST is fixed) |
| 0xc8787a (AIXBT, 32.4% win rate) score | 46 (MEDIUM) | ~41 (MEDIUM, but penalty surfaced in components) |
| 0x308ac0 (0.7% win rate) score | 29 (LOW) | ~21 (NONE — correctly filtered) |
| False-positive suspects in MEDIUM+ | 2 confirmed | 0–1 projected |
| C001 cluster surface rate | 0% (all scored LOW, no cluster signal) | ~83–100% (cluster boost + send-filter) |
| SUB_ACCOUNT wallet type usage | 0 (dead code) | Active for all send-funded wallets |

---

## Implementation Priority

1. **Change 1** (send ledger filter) — highest impact, single-line filter change, no new state required
2. **Change 2** (fill-cap penalty + win rate) — medium complexity, requires `closedPnl` parsing from fills already in scope
3. **Change 3** (SUB_ACCOUNT classification) — one-line addition, activates existing dead enum value
4. **Change 4** (cluster boost) — highest complexity, requires new state on `SuspectEntry` and a new coordination pass; implement after Changes 1–3 are validated

Changes 1–3 can be shipped together in a single commit. Change 4 should be validated in a staging run against the 2026-03-04 suspect set before production deployment.
