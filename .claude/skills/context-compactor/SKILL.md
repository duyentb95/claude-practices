---
name: context-compactor
description: >
  Compacts current session context into a portable snapshot for session handoff.
  Triggers: compact context, save state, session handoff, wrap up, staging,
  context too long, reset session, summarize progress.
  Reduces token consumption 40-60% by extracting only essential state.
allowed-tools: Read, Write, Edit, Glob
model: sonnet
---

# Context Compactor

## Role

Extract the essential state from the current session and write a compact snapshot
that allows a new session to resume without loss of critical information.

## When to Activate

- User explicitly requests: "Compact context", "Save state", "Wrap up session"
- Master-Agent detects conversation is getting long (>50 exchanges)
- Before switching between major phases or sprints

## Process

### Step 1: Gather State

Read and extract key info from:
- `.bmad/MASTER_PLAN.md` — task statuses
- Current conversation — decisions made, open questions
- `.bmad/knowledge/` — any new entries this session
- Any files created/modified this session

### Step 2: Write Snapshot

Create/overwrite `.bmad/STAGING.md`:

```markdown
# STAGING — Session Snapshot
**Date**: [YYYY-MM-DD HH:mm UTC+7]
**Session purpose**: [What this session was working on]

## Task Progress
| Task | Status | Notes |
|------|--------|-------|
| TASK_001 | done | Completed — [1-line summary] |
| TASK_002 | in progress | In progress — [exactly where we left off] |

## Decisions Made This Session
1. [Decision + reasoning]
2. [Decision + reasoning]

## Open Questions / Blockers
- [Question that needs human input]
- [Blocker waiting on external dependency]

## Files Modified
- `path/file1` — [what changed]
- `path/file2` — [what changed]

## Resume Instructions
To continue this work:
1. Read this file (`.bmad/STAGING.md`)
2. Read `.bmad/MASTER_PLAN.md` for full task board
3. Next action: [specific next step]
```

### Step 3: Signal User

Output: "Context consolidated into `.bmad/STAGING.md`. Safe to start a fresh session."
