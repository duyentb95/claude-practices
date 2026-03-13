# /init-bmad

Initialize BMAD-GSD framework for this project.

**Usage:** `/init-bmad`

Creates `.bmad/` folder structure with all template files.
Reads any existing project files to populate CONTEXT_HUB.
Asks user for WHY, WHO, STANDARDS to fill in context.

---

# /plan

Enter Plan Mode. Master-Agent analyzes request and creates task breakdown.

**Usage:** `/plan [description of what needs to be done]`

1. Master-Agent reads context → proposes task breakdown
2. Presents plan with task board (IDs, models, dependencies, parallel groups)
3. WAITS for user to type `CONFIRMED` before proceeding
4. On confirm → writes tasks to `.bmad/tasks/` and updates MASTER_PLAN

---

# /status

Check current project status.

**Usage:** `/status`

Reads MASTER_PLAN.md → shows task board with current statuses.
Recommends next action.

---

# /compact

Compact current session context for handoff.

**Usage:** `/compact`

Activates Context Compactor → writes STAGING.md → signals ready for fresh session.

---

# /review

Review completed sub-agent output.

**Usage:** `/review TASK_NNN`

Master-Agent reads task brief + output → checks against DoD → reports findings.

---

# /adhoc

Handle an ad-hoc request outside current sprint.

**Usage:** `/adhoc [description]`

Creates isolated task in `.bmad/adhoc/`. Does not pollute MASTER_PLAN.
After completion, extracts reusable knowledge into `.bmad/knowledge/`.

---

# /gsd

Quick-strike mode. Do it now, no planning overhead.

**Usage:** `/gsd [simple task description]`

For tasks < 15 minutes. Master-Agent executes directly, commits, reports.
