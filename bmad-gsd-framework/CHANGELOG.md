# BMAD x GSD Framework — Changelog

## v1.1 — 2026-03-13

### Added
- **Model Routing** — Brain vs Body philosophy, 4-tier model classification (Opus/Sonnet/Haiku/Local)
- **Cost-Aware Planning** — Master-Agent now includes cost tier breakdown in every plan
- **Production Pipeline Pattern** — Build Once, Run Forever architecture (FETCH > DETECT > POST agents)
- **Pipeline Task Brief Template** — structured format for recurring automated systems
- **Deploy Workflow** — Brain-to-Body export pattern (scripts > Docker/Railway/cron)
- **3 new commands**: `/pipeline` (design pipelines), `/cost` (cost analysis), framework `/deploy` (export scripts)
- **MASTER_PLAN template**: Model Tier column, PIPE_NNN convention, Cost Summary section, Production Pipelines section
- **master-agent SKILL**: Section 3b (Cost-Aware Planning), 3c (Production Pipeline Design), `Production?` field in task decomposition

### Changed
- Task decomposition now requires `Model Tier` + `Reasoning` fields (was just "Opus or Sonnet")
- Task board columns updated: `Agent + Model` merged into `Model Tier`, added `Production?`

## v1.0 — 2026-03-13

### Initial Release
- BMAD x GSD core framework
- 4 Phases: Context Absorption > Strategic Planning > Execution > Review
- 4 Skills: master-agent, sub-agent, context-compactor, knowledge-spine
- 7 Commands: /init-bmad, /plan, /status, /compact, /review, /adhoc, /gsd
- .bmad/ structure: CONTEXT_HUB, MASTER_PLAN, DICTIONARY, knowledge/, tasks/, adhoc/
- Context Compacting Protocol (STAGING.md)
- Token Optimization Rules
- Reverse Patterning
- Cross-Agent Prompting
