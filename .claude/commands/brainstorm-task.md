---
name: brainstorm-task
description: Brainstorm implementation approach for a specific task
---

Brainstorm the implementation approach for a task.

Input: `$ARGUMENTS` — either a TASK_NNN ID or a free-form task description.

## Steps

1. **If TASK_NNN**: Read `.bmad/tasks/TASK_NNN.md` if it exists, otherwise read from `.bmad/MASTER_PLAN.md`
2. **If free-form**: Parse the description as the task

3. **Research phase** (use Explore agent if needed):
   - Read all source files that will be affected
   - Check existing patterns in the codebase for consistency
   - Identify dependencies and potential conflicts

4. **Brainstorm 3 approaches** ranked by simplicity:
   - **Option A (Minimal):** Smallest change that delivers value
   - **Option B (Balanced):** Good coverage with moderate effort
   - **Option C (Comprehensive):** Full solution, higher effort

5. **For each option, specify:**
   - Files to modify/create
   - Key code changes (pseudocode or interface sketches)
   - Risks and edge cases
   - Effort estimate

6. **Recommend** one option with reasoning

7. **Write task brief** to `.bmad/tasks/TASK_NNN.md` using the recommended approach

8. **WAIT** for user to confirm or adjust before any implementation
