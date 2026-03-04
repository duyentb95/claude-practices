---
name: team-analyze
description: Spawn a custom agent team for complex analysis tasks. Describe the task and agents will be auto-configured.
---

User wants to run a custom analysis: `$ARGUMENTS`

## Instructions

Analyze the user's request and create an appropriate **Agent Team**.

### Team Configuration Guidelines

1. **Name**: `hl-custom-{short_description}-{YYMMDD}`

2. **Choose teammates based on the task**:
   - Need data from Hyperliquid API? → Include **data-fetcher** (sonnet)
   - Need wallet relationship analysis? → Include **wallet-clusterer** (opus)
   - Need insider scoring? → Include **pattern-scorer** (opus)
   - Need formatted report? → Include **report-writer** (sonnet)
   - Need code changes? → Include **code-dev** (opus)

3. **Team size**: 2-4 teammates max. More teammates = more tokens.

4. **File ownership**: Ensure no two teammates write to the same directory.

5. **Dependencies**: Set clear task ordering:
   - data-fetcher runs first (if included)
   - wallet-clusterer and pattern-scorer can run in parallel after data is ready
   - report-writer runs last
   - code-dev runs independently

6. **Spawn prompts**: Be specific. Include:
   - Exact files/directories to read from
   - Exact output location
   - What to message and to whom when done
   - Acceptance criteria

### Fallback to Subagents

If the task is simple enough for sequential execution (single wallet lookup, single token check, code fix), use **subagents** via `Task()` instead of a full Agent Team. Agent Teams are for parallel, communicating work only.

Execute the team and present results when complete.
