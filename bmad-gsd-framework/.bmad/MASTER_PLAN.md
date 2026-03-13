# MASTER PLAN

> Quản lý bởi Master-Agent. Review bởi Human.
> Cập nhật sau mỗi task hoàn thành.

## Current Sprint

**Sprint**: #1 — [Tên sprint]
**Goal**: [Mục tiêu sprint]
**Status**: In Progress

## Task Board

| ID | Task | Model Tier | Status | Deps | Parallel? | Production? |
|----|------|-----------|--------|------|-----------|-------------|
| TASK_001 | [Design logic] | Opus | Not started | None | Yes w/ 002 | No (one-time) |
| TASK_002 | [Implement module] | Sonnet | Not started | None | Yes w/ 001 | No |
| TASK_003 | [Wire pipeline] | Sonnet | Not started | 001, 002 | No | No |
| TASK_004 | [Fix typo] | GSD | Not started | None | — | No |
| PIPE_001 | [Fetch agent] | Haiku | Not started | 003 | — | Yes (30min) |
| PIPE_002 | [Detect agent] | Sonnet | Not started | 003 | — | Yes (30min) |
| PIPE_003 | [Post agent] | Haiku | Not started | 003 | — | Yes (on signal) |

### Status Legend
- Not started
- In progress
- Done
- Blocked
- Needs revision

## Execution Order

```
Wave 1 (parallel):  TASK_001 + TASK_002 + TASK_004(GSD)
Wave 2 (sequential): TASK_003 (depends on 001 + 002)
```

## Completed Tasks Log

| ID | Completed | Summary | Files Changed |
|----|-----------|---------|---------------|
| — | — | — | — |

## Blockers & Issues

| Issue | Severity | Owner | Status |
|-------|----------|-------|--------|
| — | — | — | — |

## Cost Summary

| Tier | Tasks | Est. Cost |
|------|-------|-----------|
| Opus (reasoning) | N | $X.XX |
| Sonnet (implement) | N | $X.XX |
| Haiku (execute) | N | $X.XX |
| GSD (Master self) | N | $0 |
| **Sprint total** | | **$X.XX** |

## Production Pipelines

| Pipeline | Schedule | Agents | Daily Cost | Status |
|----------|----------|--------|-----------|--------|
| [Alert system] | 30min | Fetch>Detect>Post | ~$0.50 | Not started |
| [Daily report] | Daily | Analyze>Format>Send | ~$0.10 | Not started |

## Next Sprint Preview

```
[Nếu đã plan ahead]
```

---
*Last updated: [timestamp]*
