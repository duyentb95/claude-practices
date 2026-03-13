# MASTER PLAN

> Quản lý bởi Master-Agent. Review bởi Human.
> Cập nhật sau mỗi task hoàn thành.

## Current Sprint

**Sprint**: #0 — Foundation + BMAD Init
**Goal**: Stabilize existing apps, initialize BMAD workflow
**Status**: ✅ Complete

## Task Board

| ID | Task | Agent | Model | Status | Dependencies | Parallel? |
|----|------|-------|-------|--------|-------------|-----------|
| TASK_001 | Wire candle pipeline + price rounding (momentum-bot) | Master (GSD) | — | ✅ | None | — |
| TASK_002 | Custom Lark webhook per user (insider-scanner) | Master (GSD) | — | ✅ | None | — |
| TASK_003 | Audit & fix all CLAUDE.md files | Master (GSD) | — | ✅ | None | — |
| TASK_004 | Deploy insider-scanner to Railway | Master (GSD) | — | ✅ | 002 | — |
| TASK_005 | Initialize BMAD-GSD framework | Master (GSD) | — | ✅ | None | — |

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
```

## Completed Tasks Log

| ID | Completed | Summary | Files Changed |
|----|-----------|---------|---------------|
| TASK_001 | 2026-03-13 | Candle pipeline + AssetMetaCache + round_price/round_size | 8 files (2 new, 6 modified) |
| TASK_002 | 2026-03-12 | Custom webhook UI + localStorage + 24h TTL server-side | lark-alert.service.ts, app.controller.ts |
| TASK_003 | 2026-03-13 | Root CLAUDE.md updated, stale claude-agents-setup deleted, blueprint deprecated | 3 files |
| TASK_004 | 2026-03-12 | Deployed to Railway, fixed LarkAlertService DI export | scanner.module.ts |
| TASK_005 | 2026-03-13 | BMAD-GSD framework initialized: .bmad/, 4 skills, 6 commands, .claudecodeignore | 18 files created |

## Blockers & Issues

| Issue | Severity | Owner | Status |
|-------|----------|-------|--------|
| momentum-bot not deployed yet (candle pipeline untested in prod) | Medium | Human | Open |

## Next Sprint Preview

```
Sprint 1 — TBD by Human
Potential tasks:
- Deploy momentum-bot candle pipeline to Railway
- Add more insider detection patterns (dormant wallet reactivation, cross-wallet fund flow)
- Backtest momentum strategy with historical data
```

---
*Last updated: 2026-03-13*
