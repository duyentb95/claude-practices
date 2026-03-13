---
description: Design a production agent pipeline (Brain → Body pattern).
---

Design a production agent pipeline for: $ARGUMENTS

## Steps

1. Read `.bmad/CONTEXT_HUB.md` and `.bmad/MASTER_PLAN.md` for project context
2. Identify agents needed (Fetch, Detect, Post, Coordinator, Analysis)
3. Assign model tier per agent (minimize cost — DETECT is the only one needing intelligence)
4. Define fail behavior and retry logic per agent
5. Estimate daily/monthly cost
6. Create Pipeline Brief in `.bmad/tasks/PIPE_NNN_xxx.md`
7. Present plan — WAIT for `CONFIRMED` before creating standalone scripts

## Pipeline Architecture Template

```
FETCH Agent (Tier 3) ──► DETECT Agent (Tier 2) ──► POST Agent (Tier 3)
Lấy data, lưu raw       So sánh mới vs cũ         Format msg, send alert
1 lần/cycle              Lọc noise, đánh giá       ONLY if signal found
```

## Output

- Pipeline Brief with schedule, agents, model tiers, fail behavior
- Cost estimate (daily + monthly)
- Standalone scripts ready for deployment
