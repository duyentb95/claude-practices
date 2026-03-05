# hl-orchestrator

Master orchestrator for the Hyperliquid quant trading skill system.

## Quick Start
```bash
"Full due diligence on HYPE token"
"Morning briefing"
"BTC crashed — analyze everything"
"/team-analyze Investigate token X: insiders + market + backtest"
```

## Architecture
**Type:** Composable (routes to and composes 4 specialized skills)
**Complexity:** 18/20

## Skill Registry
| Skill | Domain | Output |
|-------|--------|--------|
| insider-detector | Insider trading detection | Scores, evidence, alerts |
| trade-reconciler | Trade operations | Recon reports, P&L audit |
| alpha-backtester | Strategy research | Backtest results, scripts |
| perp-analytics | Market analytics | Dashboards, event analysis |

## When to Use
- Task spans 2+ skills → Orchestrator creates Agent Team
- Complex workflow → Orchestrator manages dependencies
- "Analyze everything" → Orchestrator runs all relevant skills
- Simple single-skill task → Orchestrator routes to that skill directly
