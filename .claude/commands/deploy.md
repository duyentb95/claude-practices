---
name: deploy
description: Build, lint, commit, push to GitHub, and deploy insider-scanner to Railway. Run after code changes are reviewed and approved.
---

Deploy the insider-scanner app to Railway.

Commit message: `$ARGUMENTS` (if empty, use "chore: deploy insider-scanner update")

---

## Pre-deploy Checks

Run these first — abort if any fail:

```bash
# 1. Lint
npm run lint 2>&1 | tail -10

# 2. Build
nest build insider-scanner 2>&1 | tail -5
```

If lint has **errors** (not warnings): stop and report. Do not deploy broken code.
If build fails: stop and report. Do not deploy.

---

## Commit & Push

```bash
# Show what changed
git status --short
git diff --stat HEAD

# Stage only insider-scanner source + strategy docs
git add apps/insider-scanner/ FRESH_DEPOSIT_STRATEGY.md .claude/

# Commit
git commit -m "$ARGUMENTS

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

# Push to GitHub
git push origin main
```

If `git push` fails: report the error. Do not proceed to Railway deploy.

---

## Deploy to Railway

```bash
railway up --detach
```

Wait for build to complete by polling logs:

```bash
sleep 90
railway logs --build 2>&1 | tail -15
```

Build success indicator: `Build time: XX seconds` at the end.
Build failure indicator: `ERROR:` or `failed to solve`.

If build fails: report build logs to user.

---

## Verify Deployment

```bash
sleep 20
curl -s --max-time 15 https://insider-scanner-production.up.railway.app/api/state \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
st = d['stats']
print(f'✅ Connected: {st[\"connected\"]}')
print(f'   Subscribed coins: {st[\"subscribedCoins\"]}')
print(f'   Trades received: {st[\"tradesReceived\"]}')
print(f'   Large trades: {st[\"largeTradesFound\"]}')
print(f'   Suspects: {st[\"suspectsFound\"]}')
print(f'   Queue: {st[\"queueLength\"]}')
"
```

Success: `connected: True` and `subscribedCoins > 0`.
Failure (502/connection error): wait 30s more and retry once.

---

## Report to User

After successful deploy:
```
✅ Deployed successfully.
- GitHub: https://github.com/duyentb95/claude-practices/commits/main
- Dashboard: https://insider-scanner-production.up.railway.app
- Commit: {git commit hash}
```

After failed deploy:
```
❌ Deploy failed at step: {lint/build/push/railway-build/verify}
Error: {error message}
Next steps: {what to fix}
```
