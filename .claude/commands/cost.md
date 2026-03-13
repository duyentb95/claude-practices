---
description: Show cost analysis for current sprint and running pipelines.
---

Show cost analysis for current sprint and pipelines.

## Steps

1. Read `.bmad/MASTER_PLAN.md`
2. Calculate sprint cost by model tier:
   - Count Opus tasks → highest cost
   - Count Sonnet tasks → mid cost
   - Count Haiku tasks → lowest cost
   - Count GSD tasks → $0 (Master self)
3. Calculate running pipeline daily/monthly cost from Production Pipelines section
4. Suggest optimizations: any task using too expensive a model?
5. Check: can any Opus task be split into Opus design + Sonnet implementation?

## Output Format

```
Sprint Cost:
  Opus:   N tasks — $X.XX
  Sonnet: N tasks — $X.XX
  Haiku:  N tasks — $X.XX
  GSD:    N tasks — $0
  Total:  $X.XX

Pipeline Cost (daily):
  [Pipeline name]: $X.XX/day
  Total: $X.XX/day (~$X.XX/month)

Optimization suggestions:
  - [suggestion]
```
