# Example — Daily Pipeline Run (2026-03-04)

This is an annotated transcript of a real daily pipeline run showing orchestrator decisions.

---

## Input

User: `/daily-report`

---

## Phase 1 — Orchestrator Classifies

Request = "daily-report" → standard daily pipeline.
Uses Pattern 1 (Fan-Out → Fan-In):
- `data-fetcher` first, then `pattern-scorer` + `wallet-clusterer` in parallel,
  then `report-writer`, then optional `strategy-optimizer`.

---

## Phase 2 — Agent Team Spawned

```
Teammate 1 — data-fetcher (sonnet, 40 turns):
  Collect large trades from last 24h (≥$100K notional).
  Fetch top 30 wallets by USD volume.
  For each wallet: ledger, fills (10k paginated), state.
  Output: data/raw/2026-03-04/suspects.json (19 wallets)
  → Message lead: "data-fetcher done, 19 wallets saved"

Teammate 2 — pattern-scorer (opus, 40 turns):
  [waits for data-fetcher]
  Read data/raw/2026-03-04/suspects.json.
  Score each wallet with A+B+C+D+E × F model.
  Output: data/analysis/scores/daily-20260304.json
  → Top suspect: 0x6b9e… score 78 (CRITICAL)

Teammate 3 — wallet-clusterer (opus, 35 turns):
  [waits for data-fetcher]
  Cluster wallets by send-flow graph + timing correlation.
  Found: C001 cluster (master 0x6b9e… funded 6 wallets, $1.25M total)
  Output: data/analysis/clusters/daily-20260304.json
```

---

## Phase 3 — Synthesis (orchestrator reads both outputs)

**Cross-agent insight discovered:**
- pattern-scorer found 0x6b9e… scored 78 individually
- wallet-clusterer found 0x6b9e… controls 6 other wallets
- Combined: 6 wallets' scores should be elevated by cluster membership
- Collective capital: $1.25M across cluster = CRITICAL coordinated action

**Final priority list:**
1. C001 cluster — 6 wallets, $1.25M, master controller 0x6b9e… → CRITICAL
2. 0x185dc9 — score 57 (HIGH), but later found false positive (2 yr old wallet)
3. 0x44fbbb — score 52 (HIGH), false positive (algo trader with 1800+ 90d fills)

**False positive analysis identifies 2 gaps:**
- Gap 1: Send-type deposits not detected (C001 master uses send, not deposit)
- Gap 2: High fill count wallets should have lower scoreB (2000 cap not penalized)

Recommendation: strategy-optimizer to propose fixes.

---

## Phase 4 — report-writer generates

```
Output: reports/daily/20260304.md
- Executive summary: 19 wallets scanned, 5 suspects above LOW, 2 confirmed FP
- C001 cluster: master controller 0x6b9e… + 6 sub-accounts
- Score distribution: 1 CRITICAL, 2 HIGH, 2 MEDIUM
- Model gaps identified: send-filter + fill-cap penalty
```

---

## Phase 5 — strategy-optimizer generates

```
Output: data/proposals/strategy-20260304-send-filter-winrate.md
- Change 1: Extend deposit filter to include send type
- Change 2: Fill-cap penalty (≥2000 → -5 scoreB) + win rate component
- Change 3: Activate WalletType.SUB_ACCOUNT for send-funded wallets
```

---

## Outcome

All 3 proposed changes were implemented the same day (2026-03-05):
- C001-style clusters now correctly detected via send-type filtering
- False positive rate reduced by ~2 wallets per day (fill-cap + win rate)
- SUB_ACCOUNT wallet type now active for controller/sub-account patterns
