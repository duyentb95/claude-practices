# Agent Team Patterns

Reference guide for building effective agent teams in the Hyperliquid skill system.

---

## Available Agents

| Agent | Model | Role | Max Turns | Output |
|-------|-------|------|-----------|--------|
| `data-fetcher` | sonnet | REST data collection from Hyperliquid API | 40 | `data/raw/` |
| `pattern-scorer` | opus | Composite insider scoring engine | 40 | `data/analysis/scores/` |
| `wallet-clusterer` | opus | Correlated wallet group detection | 35 | `data/analysis/clusters/` |
| `report-writer` | sonnet | Markdown report generation | 20 | `reports/` |
| `strategy-optimizer` | opus | Detection strategy improvement proposals | 40 | `data/proposals/` |
| `code-dev` | opus | TypeScript NestJS implementation | 50 | `apps/` |

---

## Pattern 1 — Fan-Out → Fan-In (Daily Pipeline)

Use when: independent analysis tasks can run in parallel, then results are merged.

```
[data-fetcher]
      │
      ▼ (data ready in data/raw/)
[pattern-scorer] ─── parallel ─── [wallet-clusterer]
      │                                    │
      └──────────── fan-in ────────────────┘
                        │
                   [report-writer]
```

**Implementation:**
```
Create Agent Team:

Teammate 1 — data-fetcher:
  Collect [specific data]. Save to data/raw/{YYYY-MM-DD}/.
  When complete, message lead: "data-fetcher done"

Teammate 2 — pattern-scorer:
  Wait for data-fetcher to complete.
  Read from data/raw/{YYYY-MM-DD}/. Score all wallets.
  Save to data/analysis/scores/daily-{YYYYMMDD}.json

Teammate 3 — wallet-clusterer:
  Wait for data-fetcher to complete.
  Read from data/raw/{YYYY-MM-DD}/. Cluster wallets.
  Save to data/analysis/clusters/daily-{YYYYMMDD}.json

After teammates 2 and 3 complete:
  [orchestrator] synthesize and delegate to report-writer
```

---

## Pattern 2 — Sequential Chain (Single Wallet)

Use when: each step depends on the previous step's output.

```
data-fetcher → wallet-clusterer → pattern-scorer → report-writer
```

Cost: lower than team (sequential). Time: longer (4 agent hops).
Use for single-wallet investigations where parallelism isn't needed.

---

## Pattern 3 — Parallel Specialists + Synthesis (Token Investigation)

Use when: multiple independent analyses converge on a single token.

```
        ┌─ data-fetcher (wallet data)
        ├─ data-fetcher (token OHLC + OI)
[token] ┤
        ├─ wallet-clusterer
        └─ pattern-scorer
                │
           [orchestrator synthesis]
                │
           report-writer
```

Note: Two data-fetcher instances can run in parallel if they write to different subdirectories.

---

## Pattern 4 — Optimize → Implement → Deploy

Use when: strategy improvement cycle is requested.

```
strategy-optimizer → [user approval] → code-dev → /deploy → verify
```

This pattern is **always sequential** — never parallelize code changes.

---

## File Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Daily score | `data/analysis/scores/daily-{YYYYMMDD}.json` | `daily-20260305.json` |
| Cluster | `data/analysis/clusters/daily-{YYYYMMDD}.json` | `daily-20260305.json` |
| Daily report | `reports/daily/{YYYYMMDD}.md` | `20260305.md` |
| Investigation | `reports/investigations/{TOKEN}-{YYYYMMDD}.md` | `BTC-20260305.md` |
| Alert | `reports/alerts/{YYYYMMDD}-{address}.md` | `20260305-0xabc.md` |
| Proposal | `data/proposals/strategy-{YYYYMMDD}-{title}.md` | `strategy-20260305-send-filter.md` |
| Raw wallet | `data/raw/wallets/{address}/` | `data/raw/wallets/0xabc.../` |
| Raw token | `data/raw/tokens/{TOKEN}/` | `data/raw/tokens/BTC/` |

---

## Cost Guidelines

| Team size | Approximate token cost | Use when |
|-----------|----------------------|----------|
| 1 agent (sequential) | 1× | Single task, single output |
| 2-3 agents | 2-3× | Parallelizable analysis |
| 4 agents | 4-5× | Full pipeline (daily report) |
| 5+ agents | 6×+ | Avoid — diminishing returns |

> Token budget is the main constraint. Always ask: can this be done sequentially without losing value?
