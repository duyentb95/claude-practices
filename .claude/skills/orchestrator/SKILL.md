---
name: hl-orchestrator
version: 2.0.0
description: >
  Master orchestrator for the Hyperliquid insider-scanner skill system.
  Trigger when a task requires multiple specialized agents or skills working together,
  or when scope is too large for a single skill session.
  Keywords: analyze, investigate team, run pipeline, daily pipeline, multi-step,
  orchestrate, coordinate agents, full analysis, system-wide.
complexity: 16/20
architecture: Composable
platforms: [claude-code]
updated: 2026-03-05
---

## Goal

Route tasks to the correct specialized skill or agent team. Coordinate parallel work,
manage file ownership, synthesize cross-skill outputs into actionable insights.

## Core Capabilities

- **Task routing** — match user requests to the right skill or command
- **Agent team creation** — spawn parallel subagents with clear file ownership
- **Daily pipeline** — orchestrate the full data-fetcher → scorer → clusterer → writer flow
- **Output synthesis** — merge results from multiple agents into a single coherent report
- **Error resilience** — if one agent fails, continue with others; flag missing data in report

---

## Instructions

### Phase 1 — Classify the Request

Determine the task type and route accordingly:

| User says... | Route to | Mode |
|-------------|----------|------|
| "scan BTC" / "investigate 0x..." | `/investigate` or `/scan-token` | Single skill |
| "run daily report" / "daily pipeline" | `/daily-report` | Agent Team (3 agents) |
| "analyze this token that just listed" | `/scan-token {TOKEN}` | Agent Team (4 agents) |
| "optimize the strategy" | `/optimize-strategy` | Sequential pipeline |
| "deploy" | `/deploy` | Sequential pipeline |
| Complex custom request | Build custom Agent Team | See Phase 3 |

**Fast-path rules:**
- Single wallet → `/investigate {address}` (sequential subagents, no team needed)
- Single coin + straightforward → `/scan-token {coin}` (team of 3)
- Multi-coin, multi-day, strategic → custom team

---

### Phase 2 — Standard Pipelines

#### Daily Pipeline (`/daily-report`)

```
Parallel Agent Team:
  ┌─ data-fetcher        → data/raw/{YYYY-MM-DD}/
  └─ [waits for fetcher] ─┬─ pattern-scorer   → data/analysis/scores/daily-{YYYYMMDD}.json
                           └─ wallet-clusterer → data/analysis/clusters/daily-{YYYYMMDD}.json

Sequential after both complete:
  report-writer → reports/daily/{YYYYMMDD}.md
  strategy-optimizer → data/proposals/strategy-{YYYYMMDD}-{title}.md  [if issues found]
```

**Agent assignments:**

| Agent | Model | Output directory | Max turns |
|-------|-------|-----------------|-----------|
| `data-fetcher` | sonnet | `data/raw/` | 40 |
| `pattern-scorer` | opus | `data/analysis/scores/` | 40 |
| `wallet-clusterer` | opus | `data/analysis/clusters/` | 35 |
| `report-writer` | sonnet | `reports/` | 20 |
| `strategy-optimizer` | opus | `data/proposals/` | 40 |
| `code-dev` | opus | `apps/` | 50 |

#### Token Investigation (`/scan-token {TOKEN}`)

```
Agent Team (parallel):
  ├─ data-fetcher: fetch 14-day window, top 30 early wallets for {TOKEN}
  ├─ wallet-clusterer: cluster wallets by timing/size/direction correlation
  └─ pattern-scorer: score each wallet using composite model

After all complete:
  report-writer: generates investigation report + alert (if score ≥ HIGH)
```

#### Single Wallet (`/investigate {address}`)

```
Sequential subagents:
  1. data-fetcher   → collect ledger, fills (10k), state for address
  2. wallet-clusterer → find related addresses via send graph
  3. pattern-scorer → compute composite score
  4. report-writer  → generate investigation report
```

#### Strategy Optimization (`/optimize-strategy`)

```
Sequential pipeline:
  1. strategy-optimizer → analyze current false positive/negative patterns
                        → produce proposal in data/proposals/
  2. [user review of proposal]
  3. code-dev          → implement approved changes
  4. [build + test]
  5. /deploy           → Railway deploy + verify
```

---

### Phase 3 — Custom Agent Team Construction

When none of the standard pipelines fit, build a custom team:

```
Rules:
  1. Max 4 agents in parallel (token budget)
  2. Assign each agent a unique output directory — no overlap
  3. Sequential agents must explicitly wait for predecessors to complete
  4. Include synthesis step at the end
```

**Team template:**
```
Teammate 1 — {agent-name}:
  Task: {specific task description}
  Output: {directory/filename pattern}
  Depends on: [none | teammate N]

Teammate 2 — {agent-name}:
  Task: {specific task description}
  Output: {directory/filename pattern}
  Depends on: [none | teammate N]

Synthesis (orchestrator):
  Read outputs from all teammates.
  Generate unified report at: reports/{type}/{YYYYMMDD}-{title}.md
  Highlight cross-agent insights (not just concatenation).
```

---

### Phase 4 — Output Synthesis

After all agents complete, the orchestrator synthesizes:

1. **Cross-domain findings**: patterns that only become visible when combining scorer + clusterer output
2. **Confidence calibration**: single wallet score vs corroborated cluster score
3. **Priority ranking**: sort suspects by (clusterSize × maxScore) not just individual score
4. **Action recommendations**: concrete next steps based on alert levels

Example synthesis insight (not available from single agent):
> "Wallet `0xabc…` scored 72 alone (HIGH), but it is part of cluster C001 where
> master controller `0xdef…` funded 6 wallets totalling $1.25M — collective score
> elevates to CRITICAL. Recommend alerting on the cluster, not individual wallets."

---

### Phase 5 — Error Handling

| Failure | Action |
|---------|--------|
| data-fetcher returns empty | Continue with note: "insufficient data for {address}" |
| pattern-scorer fails on 1 wallet | Skip that wallet; flag in report |
| API rate limit (429) | data-fetcher handles retry internally; orchestrator does not retry |
| wallet-clusterer times out | Use pattern-scorer output alone; note cluster data unavailable |
| All agents succeed but no suspects found | Generate "clean scan" report — this is valid output |

---

## File Ownership Map

```
data/raw/{YYYY-MM-DD}/       → data-fetcher ONLY
data/raw/wallets/{addr}/     → data-fetcher ONLY
data/raw/tokens/{TOKEN}/     → data-fetcher ONLY
data/analysis/scores/        → pattern-scorer ONLY
data/analysis/clusters/      → wallet-clusterer ONLY
data/proposals/              → strategy-optimizer ONLY
reports/daily/               → report-writer ONLY
reports/investigations/      → report-writer ONLY
reports/alerts/              → report-writer ONLY
apps/                        → code-dev ONLY
```

**NEVER** allow two agents to write to the same directory in the same session.

---

## Constraints

1. **Token budget**: Agent Teams cost 5× single session. Use teams only when parallelism is necessary.
2. **Model selection**: data-fetcher and report-writer → `sonnet` (fast, sufficient). Analysts → `opus`.
3. **File ownership**: strictly enforced — each agent owns its output directory.
4. **Synthesis is mandatory**: orchestrator must always produce a synthesis, not just concatenate agent outputs.
5. **Do not re-run completed agents**: check if output files already exist before spawning.
6. **Time scope**: default analysis window is last 7 days unless user specifies otherwise.
