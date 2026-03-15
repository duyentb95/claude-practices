# MASTER PLAN

> Quản lý bởi Master-Agent. Review bởi Human.
> Cập nhật sau mỗi task hoàn thành.

## Current Sprint

**Sprint**: #1 — Insider-Scanner Detection Improvements
**Goal**: Improve detection quality, reduce false positives, add new patterns
**Status**: 🔄 In Progress

## Task Board

### Sprint 0 (✅ Complete)

| ID | Task | Agent | Model | Status | Dependencies | Parallel? |
|----|------|-------|-------|--------|-------------|-----------|
| TASK_001 | Wire candle pipeline + price rounding (momentum-bot) | Master (GSD) | — | ✅ | None | — |
| TASK_002 | Custom Lark webhook per user (insider-scanner) | Master (GSD) | — | ✅ | None | — |
| TASK_003 | Audit & fix all CLAUDE.md files | Master (GSD) | — | ✅ | None | — |
| TASK_004 | Deploy insider-scanner to Railway | Master (GSD) | — | ✅ | 002 | — |
| TASK_005 | Initialize BMAD-GSD framework | Master (GSD) | — | ✅ | None | — |
| TASK_006 | Rate limiter + CVD + orderbook + limit orders (momentum-bot) | Master (GSD) | — | ✅ | 001 | — |

### Sprint 1 — Insider-Scanner

| ID | Task | Agent | Model | Status | Dependencies | Parallel? |
|----|------|-------|-------|--------|-------------|-----------|
| TASK_101 | Dormant wallet reactivation detector | Master (GSD) | — | ✅ | None | Yes |
| TASK_102 | Correlated timing detection (multi-wallet same coin) | Master (GSD) | — | ✅ | None | Yes |
| TASK_103 | Supabase integration — persistent suspects, large trades (7d), evaluations | Master (GSD) | — | ✅ | None | Yes |
| TASK_104 | False-positive digest + feedback loop | — | Sonnet | ⏳ | None | No |
| TASK_105 | Dashboard UX: filters, search, export CSV | — | Sonnet | ⏳ | None | No |
| TASK_106 | Cross-wallet fund flow detection (deposit chains) | — | Opus | ⏳ | None | No |
| TASK_107 | WebSocket reconnection hardening | Master (GSD) | — | ✅ | None | Yes |
| TASK_108 | Scoring engine: time-decay + cross-coin correlation | — | Opus | ⏳ | None | No |

### Status Legend
- ⏳ Not started
- 🔄 In progress
- ✅ Done
- ❌ Blocked
- 🔁 Needs revision

## Execution Order

```
Sprint 0 (completed):
  Wave 1: TASK_001 (momentum-bot) + TASK_002 (insider-scanner)
  Wave 2: TASK_003 (docs) + TASK_004 (deploy)
  Wave 3: TASK_005 (BMAD init)
  Wave 4: TASK_006 (momentum-bot phase 2)

Sprint 1 (in progress):
  Wave 1: TASK_101 + TASK_102 + TASK_103 + TASK_107 (parallel, independent)
  Wave 2: TASK_104 + TASK_105 (after wave 1 stabilizes)
  Wave 3: TASK_106 + TASK_108 (complex patterns, need wave 1 infrastructure)
```

## Completed Tasks Log

| ID | Completed | Summary | Files Changed |
|----|-----------|---------|---------------|
| TASK_001 | 2026-03-13 | Candle pipeline + AssetMetaCache + round_price/round_size | 8 files (2 new, 6 modified) |
| TASK_002 | 2026-03-12 | Custom webhook UI + localStorage + 24h TTL server-side | lark-alert.service.ts, app.controller.ts |
| TASK_003 | 2026-03-13 | Root CLAUDE.md updated, stale claude-agents-setup deleted, blueprint deprecated | 3 files |
| TASK_004 | 2026-03-12 | Deployed to Railway, fixed LarkAlertService DI export | scanner.module.ts |
| TASK_005 | 2026-03-13 | BMAD-GSD framework initialized: .bmad/, 4 skills, 6 commands, .claudecodeignore | 18 files created |
| TASK_006 | 2026-03-14 | Weight-based rate limiter, CVD tracker, orderbook tracker, limit order support | 9 files (3 new, 6 modified) |
| TASK_107 | 2026-03-14 | WS reconnection: exponential backoff, stale detection, coin refresh, downtime tracking | ws-scanner.service.ts, trade.dto.ts |
| TASK_103 | 2026-03-15 | Supabase integration: persistent suspects, 7d large trades, evaluations API, daily stats | 8 files (4 new, 4 modified) |
| TASK_101 | 2026-03-15 | Dormant wallet reactivation: DORMANT flag, graduated scoring (+4/+6/+8), multiplier combos | trade.dto.ts, insider-detector.service.ts |
| TASK_102 | 2026-03-15 | Correlated timing: CORREL flag, 10min window, cross-trade detection, +8 score boost, retroactive flagging | trade.dto.ts, insider-detector.service.ts |

## Blockers & Issues

| Issue | Severity | Owner | Status |
|-------|----------|-------|--------|
| momentum-bot not deployed yet (candle pipeline untested in prod) | Medium | Human | Open |

## Daily Workflow

Use `/daily-insider` to run the full daily cycle: check plan → pick task → brainstorm → implement.
Supporting commands: `/pick-task insider-scanner`, `/brainstorm-task TASK_NNN`.

## Next Sprint Preview

```
Sprint 2 — TBD
Potential tasks:
- Deploy momentum-bot to Railway (prod test)
- Backtest momentum strategy with historical data
- Cross-app intelligence sharing (insider-scanner ↔ momentum-bot)
```

---
*Last updated: 2026-03-15*
