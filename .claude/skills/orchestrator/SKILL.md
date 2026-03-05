---
name: hl-orchestrator
description: >
  Master orchestrator for Hyperliquid quant trading skill system. Routes tasks to specialized skills,
  manages multi-skill workflows, and creates agent teams when parallel work is needed.
  Triggers: any Hyperliquid trading task that spans multiple skills, complex investigation,
  full analysis pipeline, multi-step workflow, team analyze, comprehensive report.
  This skill should be invoked when the task doesn't clearly map to a single specialized skill.
version: 1.0.0
author: quant-trading-team
architecture: Composable
complexity: 18
platforms: [claude-code, cursor, windsurf]
tags: [orchestrator, multi-agent, workflow, hyperliquid, quant-trading]
---

# Hyperliquid Orchestrator

## Goal

Route incoming tasks to the correct specialized skill (or combination of skills).
Create agent teams for parallel work. Manage multi-step workflows that span
insider detection, trade reconciliation, backtesting, and analytics.

## Instructions

### Step 1: Task Classification

Analyze the user's request and classify into one or more skill domains:

```
Task → Classification → Routing Decision

"Scan token HYPE for insider trading"
  → Domain: insider-detection
  → Route: insider-detector skill (single)

"Reconcile this week's trades"
  → Domain: trading-ops
  → Route: trade-reconciler skill (single)

"Backtest momentum strategy on ETH"
  → Domain: alpha-research
  → Route: alpha-backtester skill (single)

"What's the funding rate on BTC?"
  → Domain: analytics
  → Route: perp-analytics skill (single)

"Full investigation: scan HYPE for insiders, check if our bot's fills match,
 and see if a funding arb strategy would have worked"
  → Domain: multi (insider + recon + backtest)
  → Route: Agent Team (parallel)
```

### Step 2: Routing Rules

**Single-skill routing** (use subagent via Task):

| Pattern | Skill | Model |
|---------|-------|-------|
| Insider, suspicious, front-running, scan token, investigate wallet | `insider-detector` | opus |
| Reconcile, recon, P&L check, fill verify, fee audit | `trade-reconciler` | sonnet |
| Backtest, strategy test, Sharpe, walk-forward, alpha signal | `alpha-backtester` | opus |
| Dashboard, market overview, funding, whale, liquidation, event | `perp-analytics` | sonnet |

**Multi-skill routing** (create Agent Team):

When the task requires 2+ skills AND the sub-tasks can run in parallel:

```
Create Agent Team "hl-{short_desc}-{YYMMDD}" with:

For each skill needed, spawn a teammate:
  - insider-detector tasks → Teammate with opus model
  - trade-reconciler tasks → Teammate with sonnet model
  - alpha-backtester tasks → Teammate with opus model
  - perp-analytics tasks → Teammate with sonnet model

Assign file ownership per skill's Constraints section.
Set task dependencies based on data flow.
```

### Step 3: Data Flow Management

Skills share data through the filesystem:

```
insider-detector → writes → data/analysis/scores/
                          → reports/investigations/
                          → reports/alerts/

trade-reconciler → writes → data/analysis/recon/
                          → reports/recon/

alpha-backtester → writes → data/analysis/backtest/
                          → reports/backtest/
                          → scripts/backtest_*.py

perp-analytics   → writes → reports/analytics/
                          → scripts/dashboard_*.py

All skills read from:
  data/raw/          (raw API data)
  data/cache/        (cached responses)
  apps/              (existing codebase — read only)
```

### Step 4: Synthesis

After all skills complete:
1. Read outputs from each skill
2. Synthesize findings into a unified summary
3. Highlight cross-domain insights (e.g., "insider wallet 0xABC also appears in reconciliation mismatch")
4. Generate executive summary if multiple reports were produced

### Common Workflows

**Workflow 1: New Token Due Diligence**
```
User: "Full analysis on newly listed token X"

1. perp-analytics → Token Deep-Dive (market data, OI, funding)
2. insider-detector → Scan for insider activity around listing
3. alpha-backtester → Quick test: would funding arb work?
4. Synthesize: "Token X — Market stats, insider risk assessment, trading opportunities"
```

**Workflow 2: Daily Operations**
```
User: "Morning briefing"

1. perp-analytics → Market Snapshot (overview, top funding, notable events)
2. insider-detector → Daily Scan (new listings, flagged wallets)
3. trade-reconciler → Check last 24h fills for reconciliation issues
4. perp-analytics → System Monitor (all apps health check)
5. Synthesize: "Daily Briefing — Market, Insiders, Recon, Systems"
```

**Workflow 3: Post-Event Analysis**
```
User: "BTC crashed 10%, analyze everything"

1. perp-analytics → Event Analyzer (timeline, impact, whale trades)
2. trade-reconciler → Check fills during crash (latency, missed fills)
3. insider-detector → Scan for front-running before crash
4. alpha-backtester → "If we had X strategy, how would we have performed?"
5. Synthesize: "Crash Post-Mortem — Timeline, Impact, Insiders, Lessons"
```

## Examples

### Example 1: Multi-Skill Task

**Input:**
```
/team-analyze Full due diligence on HYPE token: insider check, market analysis, and backtest a simple momentum strategy
```

**Expected Behavior:**

Orchestrator creates Agent Team:
```
Team: hl-hype-dd-260305

Teammate 1 (perp-analytics, sonnet):
  "Run Token Deep-Dive for HYPE: price, volume, OI, funding, liquidity, top holders.
   Save to reports/analytics/HYPE_260305.md"

Teammate 2 (insider-detector, opus):
  "Scan HYPE for insider trading: all fills in 14-day window around listing,
   top wallets, clustering, scoring. Save to reports/investigations/HYPE_260305.md"

Teammate 3 (alpha-backtester, opus):
  "Backtest momentum strategy on HYPE: long if 24h return > 5% and volume > 2x avg,
   SL 3%, TP 10%, $5k position, last 60 days.
   Save to reports/backtest/hype-momentum_260305.md"

Dependencies: None — all three can run in parallel.
Synthesis: After all complete, summarize key findings across all reports.
```

**Expected Output (synthesis):**
```markdown
# HYPE Token Due Diligence — 2026-03-05

## Market Analysis (perp-analytics)
- Current price: $14.20, 24h volume: $45M, OI: $120M
- Funding: +0.015% per 8h (annualized 20%) — shorts paying longs
- Liquidity: 2% depth = $2.1M, spread 0.02%

## Insider Risk (insider-detector)
- 4 wallets flagged (2 high-confidence, 2 likely)
- Highest score: 91 — pre-listing accumulation pattern
- See full report: reports/investigations/HYPE_260305.md

## Strategy Test (alpha-backtester)
- Momentum strategy: +12.3% over 60 days, Sharpe 1.21
- Warning: overfit ratio 1.4 — moderate risk
- See full report: reports/backtest/hype-momentum_260305.md

## Recommendation
HYPE shows strong trading activity but elevated insider risk.
Momentum strategy viable but requires careful position sizing
given the insider activity and high leverage in the market.
```

## Constraints

- **Routing accuracy**: Always route to the most specific skill. Don't use orchestrator for tasks that clearly belong to one skill.
- **Agent Teams sparingly**: Only create teams when 2+ skills are needed AND sub-tasks are parallelizable. For sequential tasks, run skills one at a time via subagent Task().
- **File conflicts**: NEVER let two teammates write to the same directory. Each skill has its own output directories.
- **Token budget**: Agent Teams cost ~5x a single session. Warn user before spawning teams for simple tasks.
- **Synthesis required**: When running multi-skill workflows, ALWAYS produce a synthesis summary that connects findings across skills.
- **Error handling**: If one skill fails, continue with others and note the failure in synthesis.
- **Existing apps**: Reference `apps/insider-scanner/`, `apps/data-analytics/`, `apps/hyper-rau/` for integration context.
- **Read-only**: Orchestrator never modifies source code. Skills that need code changes should use the code-dev agent instead.
