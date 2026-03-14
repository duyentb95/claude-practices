---
name: daily-insider
description: Daily autonomous workflow for insider-scanner — check plan, pick task, brainstorm, implement
---

Daily autonomous agent workflow for **insider-scanner** app.

## Workflow

### Phase 1: Status Check
1. Read `.bmad/MASTER_PLAN.md` — check current sprint status, blockers, completed tasks
2. Read `apps/insider-scanner/` recent git log: `git log --oneline -10 -- apps/insider-scanner/`
3. Check if any tasks are 🔄 In Progress or ❌ Blocked — prioritize unblocking those first
4. Summarize: what was done yesterday, what's next

### Phase 2: Pick Task
1. Filter MASTER_PLAN tasks for insider-scanner that are ⏳ Not Started
2. If no tasks exist, brainstorm new tasks based on:
   - Known gaps in CLAUDE.md (scoring engine improvements, new detection patterns)
   - `.bmad/MASTER_PLAN.md` "Next Sprint Preview" section
   - Recent production issues (check Railway logs if accessible)
3. Rank by: (a) unblocks other work, (b) high impact on detection quality, (c) low complexity
4. Select TOP 1 task. Present rationale to user.
5. WAIT for user confirmation before proceeding.

### Phase 3: Brainstorm & Plan
1. Read all relevant source files for the selected task
2. Identify: what exists, what needs to change, what's the simplest approach
3. Write a task brief to `.bmad/tasks/TASK_NNN.md` with:
   - Context (why this matters)
   - Files to modify/create
   - Implementation steps (numbered)
   - Definition of Done
   - Risk assessment
4. Present the brief for user review

### Phase 4: Implement
1. On user confirmation, execute using GSD mode (direct implementation)
2. Follow CLAUDE.md conventions (NestJS patterns, decorators, env vars)
3. Run `npm run lint` and `npx jest` on changed files
4. Update `.bmad/MASTER_PLAN.md` task status to ✅
5. Update relevant CHANGELOG if applicable
6. Present diff summary

### Phase 5: Ship
1. Ask user: commit & deploy? or just commit?
2. If approved, use `/deploy` command flow

## Insider-Scanner Improvement Areas

Reference backlog for Phase 2 brainstorming:

**Detection Patterns:**
- Dormant wallet reactivation (wallet inactive >30d, suddenly trades before event)
- Cross-wallet fund flow (deposit chain: CEX → A → B → trade)
- Correlated timing (multiple fresh wallets trading same coin within minutes)
- Pre-announcement accumulation (large positions opened before listing/delisting)

**Scoring Engine:**
- Time-decay on deposit-to-trade gap (exponential, not linear)
- Cross-coin correlation bonus (same wallet insider-trades multiple coins)
- Historical accuracy feedback loop (track which alerts were true positives)

**Infrastructure:**
- Persistent storage (Redis/SQLite) for suspects across restarts
- Alert deduplication improvements
- WebSocket reconnection hardening
- Dashboard UX improvements (filters, search, export)

$ARGUMENTS
