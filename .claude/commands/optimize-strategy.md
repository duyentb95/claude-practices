---
name: optimize-strategy
description: Full automated pipeline to optimize the insider detection strategy. Analyzes live data, proposes improvements, writes code, reviews, tests, and deploys to Railway.
---

Run the full strategy optimization pipeline for the insider-scanner app.

Focus area (if specified): `$ARGUMENTS`
If no argument given, let `strategy-optimizer` determine the highest-priority improvement.

---

## Pipeline Overview

```
strategy-optimizer → code-dev → code-reviewer → [fix loop] → deploy
```

---

## Step 1 — Analyze & Propose

Use the **strategy-optimizer** subagent:

```
Analyze the current insider detection strategy and live system state.
Focus area: "$ARGUMENTS" (if empty, find the highest-priority improvement).

Steps:
1. Read apps/insider-scanner/src/scanner/insider-detector.service.ts and trade.dto.ts
2. Read FRESH_DEPOSIT_STRATEGY.md Section 10 (current status) and Section 11 (backlog)
3. Query live system: curl -s https://insider-scanner-production.up.railway.app/api/state
4. Identify the single highest-impact improvement (or implement focus area if given)
5. Write a detailed proposal to data/proposals/strategy-{YYMMDD}-{title}.md

Include in proposal:
- Exact code changes (before/after snippets)
- New flags if needed (with web UI badge spec)
- Test cases (inputs that should trigger, inputs that should not)
- Expected impact metrics

Message me with proposal path and 1-line summary when done.
```

Wait for strategy-optimizer to complete and review the proposal before proceeding.

---

## Step 2 — Implement

Use the **code-dev** subagent, passing the proposal path from Step 1:

```
Implement the strategy improvement described in data/proposals/strategy-{file}.md

Steps:
1. Read the proposal carefully — implement EXACTLY what is specified
2. Make all code changes to apps/insider-scanner/src/
3. If new InsiderFlag added:
   - Add to trade.dto.ts enum
   - Add badge to flagBadges() in web/app.controller.ts
   - Add colorFlags() entry in terminal/terminal.service.ts
   - Add flagLabel() entry in scanner/lark-alert.service.ts
4. Run: npm run lint
5. Run: nest build insider-scanner
6. Fix any lint/build errors before reporting done
7. Message me with: files changed, build status, any issues encountered
```

Wait for code-dev to complete.

---

## Step 3 — Review

Use the **code-reviewer** subagent:

```
Review all code changes made by code-dev.

Steps:
1. Run: git diff HEAD apps/insider-scanner/
2. Check alignment with proposal at data/proposals/strategy-{file}.md
3. Run full checklist (correctness, TypeScript, NestJS conventions, performance)
4. Run: npm run lint && nest build insider-scanner
5. Write review to data/proposals/review-{YYMMDD}-{title}.md
6. Message me with verdict: APPROVED or CHANGES_REQUESTED

If CHANGES_REQUESTED: list ALL blocking issues clearly with file:line and exact fix.
```

---

## Step 3b — Fix Loop (if CHANGES_REQUESTED)

If reviewer requests changes, use **code-dev** again:

```
The code-reviewer has requested the following changes:
{paste blocking issues from review}

Fix each blocking issue. After fixing:
1. Run: npm run lint
2. Run: nest build insider-scanner
3. Message me when done — code-reviewer will re-review.
```

Repeat Step 3 → Step 3b until **APPROVED**.

---

## Step 4 — Deploy

After APPROVED verdict, use the **deploy** command:

```
/deploy "strategy optimization: {title}"
```

---

## Step 5 — Verify & Report

After deploy succeeds:

```bash
sleep 30
curl -s https://insider-scanner-production.up.railway.app/api/state \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('connected:', d['stats']['connected'], '| trades:', d['stats']['largeTradesFound'], '| suspects:', d['stats']['suspectsFound'])"
```

Update `FRESH_DEPOSIT_STRATEGY.md` Section 10 to mark the implemented item as ✅ Done.

Report to user:
- What was changed and why
- Expected vs actual impact
- Link to Railway dashboard
- Link to proposal and review files
