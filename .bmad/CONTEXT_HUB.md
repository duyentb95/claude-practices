# CONTEXT HUB — Shared Project Context

> Single Source of Truth cho toàn bộ agents.
> Master-Agent cập nhật. Sub-agents chỉ đọc.

## WHY — Tại sao dự án này tồn tại

Build hệ thống phát hiện insider trading real-time trên Hyperliquid DEX,
kèm analytics platform và momentum trading bot tự động.
Mục tiêu: edge trong thị trường perp thông qua data intelligence + automated execution.

## WHO — Ai là người nhận output

- **Primary**: Solo developer/trader — cần code chạy production-grade trên Railway
- **Secondary**: Claude Code agents — cần docs + context rõ ràng để thực thi đúng
- **End users**: Bản thân + team nhỏ sử dụng insider-scanner dashboard + momentum bot

## STANDARDS — Tiêu chuẩn output

### Code Standards
- **NestJS apps (TS)**: Strict mode, no `any`, async/await, NestJS DI conventions
- **Python apps**: Python 3.12+, type hints required, structlog for logging
- **JSON parsing**: `lossless-json` cho Hyperliquid API (precision loss prevention)
- **Price rounding**: `hyperliquidRoundPrice()` — 5 sig digits, `max(0, 6 - szDecimals)` decimals
- **WebSocket**: `import WebSocket = require('ws')` trong webpack-built apps
- **Error handling**: `@SafeFunctionGuard()` cho non-critical, explicit errors cho critical paths
- **Custom decorators**: `@CronjobGuard()` prevents re-entrant crons

### Document Standards
- Language: Tiếng Việt cho internal docs/planning, English cho code comments + commit messages
- Format: Markdown
- Timestamps: UTC+7 cho display, epoch ms cho data
- Wallet addresses: lowercase hex, truncate `0x1a2b...9z0y` trong reports

### Quality Gates
- Code: lint pass (`npm run lint`), no type errors
- Docs: CLAUDE.md + CHANGELOG.md updated after each feature
- Knowledge: lessons learned captured in `.bmad/knowledge/`
- Deploy: `railway up --detach` for insider-scanner

## TECH STACK

| Layer | Technology | Notes |
|-------|-----------|-------|
| Backend (scanner) | NestJS + TypeScript | Monorepo, 3 registered apps |
| Backend (bot) | Python 3.12 + asyncio | Standalone in `apps/momentum-bot/` |
| Deployment | Railway | insider-scanner production |
| Cache | Redis | data-analytics market/leaderboard cache |
| API | Hyperliquid REST + WS | POST `/info`, rate limit 1200 req/min |
| External | Copin Analyzer API | Trader profiling, 30 req/min |
| Alerts | Lark Webhook | Rate limit 5 req/s |
| Monitoring | Web dashboard | insider-scanner at `:3235` |

## KEY CONSTRAINTS

- **Hyperliquid rate limit**: 1200 weight/min → sequential queue with 1100ms gap
- **Copin rate limit**: 30 req/min → 2000ms gap
- **Lark rate limit**: 5 req/s → 300ms queue gap, 10-min cooldown per address
- **No f64 for prices**: Always round via `hyperliquidRoundPrice()` before SDK calls
- **EIP-712 signing**: Required for exchange actions (order, cancel, modify)
- **WebSocket dedup**: Candle bootstrap + WS may overlap → CandleStore handles dedup

---
*Last updated: 2026-03-13*
*Updated by: Master-Agent (init-bmad)*
