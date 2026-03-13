# Gotchas & Lessons Learned

## 2026-03-12 — NestJS DI Export Issue
**Problem**: `Nest can't resolve dependencies of AppController` after adding LarkAlertService injection
**Root cause**: LarkAlertService was in `providers` but not `exports` of ScannerModule. AppController is in a different module (InsiderScannerModule) that imports ScannerModule.
**Fix**: Added LarkAlertService to `exports` array in scanner.module.ts
**Prevention**: When injecting a service across module boundaries, always check both `providers` AND `exports`

## 2026-03-12 — Railway Service Mismatch
**Problem**: `railway up` deployed to wrong service (momentum-bot instead of insider-scanner)
**Root cause**: Railway CLI remembers last linked service; project had multiple services
**Fix**: Run `railway service insider-scanner` to switch, then `railway up --detach`
**Prevention**: Always verify current service with `railway status` before deploying

## 2026-03-13 — Hyperliquid SDK float_to_wire Rejection
**Problem**: `ValueError: ('float_to_wire causes rounding', 4.384426517011576)` in momentum-bot
**Root cause**: SDK rejects sizes that don't conform to per-asset `szDecimals`
**Fix**: Added `AssetMetaCache` + `round_size()` that truncates toward zero using `szDecimals`
**Prevention**: Always call `round_price()` and `round_size()` before any SDK order method

---
*Append new gotchas as they arise. Never rewrite entire file.*
