---
name: pick-task
description: Pick the next task from the BMAD plan for a specific app
---

Pick the next task to work on.

1. Read `.bmad/MASTER_PLAN.md`
2. Filter tasks by app: `$ARGUMENTS` (default: insider-scanner)
3. Show tasks grouped by status: ❌ Blocked → 🔄 In Progress → ⏳ Not Started
4. For blocked tasks: identify what's blocking and if it can be resolved now
5. For not-started tasks: rank by impact × feasibility
6. Recommend the single best task to work on next with reasoning
7. If no tasks remain, suggest 3 new tasks based on the app's known gaps and improvement areas

Output format:
```
## Current Board (filtered)
[table of relevant tasks]

## Recommendation
**Next task:** TASK_NNN — [title]
**Why:** [1-2 sentences]
**Estimated effort:** Quick (<15min) | Medium (15-60min) | Large (>1h)
**Approach:** GSD (quick) | Plan Mode (needs design)
```
