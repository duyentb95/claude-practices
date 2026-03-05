---
name: insider-detector
version: 2.1.0
description: >
  Detect insider trading patterns on Hyperliquid perpetuals.
  Trigger when asked to investigate a wallet, token, or suspicious large trade.
  Keywords: insider, suspicious trade, fresh deposit, whale, investigate wallet,
  scan token, coordinated wallets, suspicious activity, front-running.
complexity: 18/20
architecture: Pipeline
platforms: [claude-code]
updated: 2026-03-05
---

## Goal

Investigate wallets and trades on Hyperliquid DEX for insider trading signals.
Produce a composite insider-probability score (0–100) with supporting evidence,
classify alert level, and generate a structured Markdown report.

## Core Capabilities

- **Composite scoring** — A+B+C+D+E × F model (0–100) tuned to Hyperliquid data
- **MM/HFT filter** — skips market makers via native `userFees` API (maker-rebate tier)
- **Send-type detection** — catches sub-account/controller funding via internal `send` entries
- **Paginated fills** — up to 10 000 most recent aggregated orders per wallet
- **All-time PnL signal** — profitable wallets score higher (informed trader indicator)
- **Wallet clustering** — delegates to `wallet-clusterer` agent for correlated wallets

---

## Instructions

### Phase 1 — Clarify Scope

Before fetching data, determine:
1. **Target**: wallet address, coin symbol, or "all recent large trades"
2. **Mode**: quick (single wallet) or full investigation (token + top wallets)
3. **Time window**: default last 7 days; extend to 30 if suspect appears long-running

If target is a token name, resolve to coin symbol first (e.g. "Bitcoin" → "BTC").

---

### Phase 2 — Data Acquisition

All calls: `POST https://api.hyperliquid.xyz/info`
Rate limit: **1 100 ms between calls**. Use the `data-fetcher` agent for bulk collection.

**Inspection order for each wallet:**

```
1. userFees                        → Layer 1: skip if userAddRate ≤ 0 (HFT/MM)
2. userNonFundingLedgerUpdates     → deposit / send / withdraw history
3. userFillsByTime (paginated)     → up to 10k orders, aggregateByTime: true
   └─ page = 2000 records, pause 300ms between pages, endTime = min(page.time)−1
4. clearinghouseState              → margin summary + open positions
5. metaAndAssetCtxs                → coin 24h volume + OI for scoreC context
```

**Ledger field mapping by entry type:**

| type | amount field | sender field |
|------|-------------|--------------|
| `deposit` | `usdc` | — |
| `send` (incoming) | `usdcValue` or `amount` | `user` (sender address) |
| `withdraw` | `usdc` | — |

Treat `send` where `delta.user ≠ target_address` as deposit-equivalent.
This catches the **controller/sub-account funding pattern** (wallets funded by a master controller without on-chain deposit).

---

### Phase 3 — Composite Scoring (A+B+C+D+E × F)

#### [A] Deposit-to-Trade Speed — 0–25 pts

```
lastFundingTime = max(deposit.time, incoming_send.time)
gapMs  = trade.detectedAt − lastFundingTime
gapMin = gapMs / 60_000

≤ 5 min  → 25   + flag FRESH_DEPOSIT
≤ 15 min → 22
≤ 30 min → 18
≤ 60 min → 14
≤ 3 h    → 10
≤ 6 h    →  6
≤ 24 h   →  3
> 24 h   →  0

Bonus: if trade.usdSize / totalFundingUsd > 0.80 → +3 (nearly all deposit used)
```

#### [B] Wallet Freshness & Quality — floor −8, cap 20 pts

```
# Wallet age (from first ledger entry)
< 1 day  → +10
< 3 days → +8
< 7 days → +6
< 14 days → +4
< 30 days → +2

# 90-day order count (fills90d.length, aggregateByTime=true)
≥ 2000 → −5   (hard-cap API returns 2000: established HF trader)
= 0    → +10
≤ 3    → +8
≤ 10   → +5
≤ 30   → +2

# Win rate (90d closed fills, require ≥10 closed positions)
< 20% → −8   | < 35% → −5   | < 50% → −3
> 60% → +3   | > 70% → +5

# All-time PnL (sum closedPnl across all paginated fills)
> $10 000  → +4   | > $0     → +2
< $0       → −3   | < −$10 000 → −5

scoreB = clamp(scoreB, min=−8, max=20)
```

#### [C] Trade Size vs Market — 0–20 pts

```
dayNtlVlm = coin.dayNtlVlm from metaAndAssetCtxs (24h volume USD)
oiUsd     = coin.openInterest × coin.markPx

if dayNtlVlm < 100_000 AND trade.usdSize > 10_000:
  → +12 + flag DEAD_MARKET
else:
  vlmRatio = trade.usdSize / dayNtlVlm
  > 10% → +10  | > 5% → +7  | > 1% → +4

oiRatio = trade.usdSize / oiUsd
> 10% → +8 + flag HIGH_OI_RATIO  | > 5% → +6  | > 1% → +3

scoreC = min(20, scoreC)
```

#### [D] Position Concentration — 0–15 pts

```
marginUtil = totalMarginUsed / accountValue
impliedLev = trade.usdSize / accountValue

marginUtil > 90% → +8 + flag ALL_IN
marginUtil > 70% → +5
marginUtil > 50% → +3

impliedLev ≥ 20× → +3 + flag HIGH_LEVERAGE

marginUsed / totalFundingUsd > 90% → +4   (all deposited capital deployed)

scoreD = min(15, scoreD)
```

#### [E] Ledger Purity — 0–10 pts

```
isDepositOnly = (withdrawals.length = 0 AND deposits.length > 0)

isDepositOnly              → +5 + flag DEPOSIT_ONLY
ledgerTypes = {'deposit'}  → +3   (no sends, rewards, etc.)
no rewardsClaim + age <30d → +2

scoreE = min(10, scoreE)
```

#### [F] Behavioral Multiplier — ×1.0–1.5

```
hasImmediate   = scoreA ≥ 22   (funded < 15 min before trade)
hasFreshWallet = fills90d = 0 OR walletAge < 1 day
hasAllIn       = flag ALL_IN in extraFlags
hasDeadMarket  = flag DEAD_MARKET in extraFlags

hasImmediate + hasFreshWallet             → +0.20
hasImmediate + hasAllIn                   → +0.15
hasFreshWallet + hasDeadMarket            → +0.15
hasImmediate + hasFreshWallet + hasAllIn  → +0.10  (triple combo)

multiplier = min(1.5, 1.0 + bonuses)
finalScore = min(100, round((A+B+C+D+E) × multiplier))
```

---

### Phase 4 — Classify & Record

**Alert level:**

| Score | Level | Badge | Action |
|------:|-------|-------|--------|
| ≥ 75 | `CRITICAL` | 🔴 | Lark alert + full report |
| ≥ 55 | `HIGH` | 🟠 | Lark alert + report |
| ≥ 40 | `MEDIUM` | 🟡 | Log + report |
| ≥ 25 | `LOW` | 🔵 | Log only |
| < 25 | `NONE` | — | **Discard — do not record** |

**Wallet type** (evaluated in order, first match wins):

| Type | Criteria |
|------|----------|
| `GHOST` | `isDepositOnly` AND `fills90d ≤ 5` AND `walletAge < 14d` |
| `ONE_SHOT` | `deposits ≤ 2` AND `fills90d ≤ 3` AND `walletAge < 7d` |
| `SUB_ACCOUNT` | funded via incoming `send` from another HL address |
| `FRESH` | `walletAge < 30d` AND `fills90d < 20` |
| `WHALE` | `accountValue > $1 000 000` |
| `NORMAL` | default |

**Flag bonuses** (used for suspect sorting, not score):
`GHOST +15` · `ONE_SHOT +12` · `FRESH_DEP +10` · `FIRST +8` · `ALL_IN +6` · `MEGA +5` · `NEW_ACCT +4`

---

### Phase 5 — Generate Report

```markdown
## 🔍 Investigation: {COIN} — {YYYY-MM-DD HH:MM UTC+7}

### Executive Summary
**Score: XX/100 — LEVEL 🔴**
Wallet `0xXXX…XXX` (TYPE) traded {COIN} {SIDE} ${X.XM} approximately {X} minutes
after depositing ${X.XM}. [One-sentence verdict.]

### Score Breakdown
| Component | Score | Key Signal |
|-----------|------:|------------|
| A. Deposit Speed | XX/25 | {X} min gap |
| B. Freshness & Quality | XX/20 | {X}d old · {X} 90d orders · PnL ${X} |
| C. Market Ratio | XX/20 | {X}% of 24h vol · {X}% OI |
| D. Position Concentration | XX/15 | {X}% margin utilization |
| E. Ledger Purity | XX/10 | {deposit-only/has withdrawals} |
| **Multiplier** | ×X.X | {combo description} |
| **Final Score** | **XX/100** | **{LEVEL}** |

### Evidence Timeline (UTC+7)
| Time | Event | Amount | Notes |
|------|-------|--------|-------|
| HH:MM | Deposit | +$X,XXX | via {deposit/send from 0xABC…} |
| HH:MM | Trade detected | {COIN} {BUY/SELL} $X.XM | {X} fills aggregated |

### Wallet Profile
| Field | Value |
|-------|-------|
| Address | `0xXXX…XXX` · [Copin ↗](https://app.copin.io/trader/0x.../HYPERLIQUID) |
| Type | {WalletType} |
| Age | {X} days |
| Account Value | ${X} |
| 90d Orders | {X} |
| All-time PnL | ${X} |
| Flags | `{FLAG1}` `{FLAG2}` |

### Related Wallets
{Cluster analysis from wallet-clusterer, or "None identified"}

### Verdict
{CRITICAL/HIGH: Recommend monitoring. Likely pre-positioned on {information source}.}
{MEDIUM: Suspicious but insufficient evidence. Continue monitoring.}
{LOW: Unlikely insider. Normal trader profile.}
```

---

## Constraints

1. **Layer 0**: Always skip `0x0000000000000000000000000000000000000000`
2. **Layer 1**: Always check `userFees` first; skip if `userAddRate ≤ 0` (HFT cache 24h)
3. **Rate limits**: 1 100 ms between REST calls; 300 ms between pagination pages
4. **Minimum data**: require at least `ledger` + `clearinghouseState` to produce a score
5. **scoreB floor**: −8 (never unbounded negative)
6. **NONE = discard**: scores < 25 are never recorded or alerted
7. **lossless-json**: mandatory for Hyperliquid API parsing (large integer precision)
8. **Copin URL**: always `/HYPERLIQUID` uppercase
9. **Address display**: `0xXXX…XXX` format (first 5 chars + last 3 chars)
10. **Do not hardcode thresholds** — coin-tier thresholds come from live `metaAndAssetCtxs`
