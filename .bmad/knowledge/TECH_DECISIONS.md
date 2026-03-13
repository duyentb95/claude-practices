# Technical Decisions

## 2026-03-13 — Python for Momentum Bot (not Rust)
**Context**: Blueprint planned Rust with `rust_decimal` for financial precision
**Decision**: Implemented in Python with asyncio + `hyperliquid-python-sdk`
**Alternatives considered**: Rust (original plan), TypeScript (NestJS monorepo consistency)
**Reasoning**: Faster iteration for strategy tuning; SDK available in Python; precision handled by `round_price()`/`round_size()` at execution boundary
**Consequences**: Standalone app outside NestJS monorepo; separate deployment

## 2026-03-13 — Candle Pipeline Architecture (REST bootstrap + WS live)
**Context**: Need historical candles for regime detection but WS only provides live updates
**Decision**: Bootstrap 200 candles via `candleSnapshot` REST, then subscribe WS for live 1m candles
**Alternatives considered**: WS only (insufficient history), REST polling (too slow, rate limit)
**Reasoning**: Hybrid approach gives instant regime classification on subscribe + real-time updates
**Consequences**: CandleStore must handle dedup of bootstrap/WS overlap

## 2026-03-12 — Custom Webhooks via localStorage + Server TTL
**Context**: Users want personal Lark alerts without sharing ENV webhook
**Decision**: Client stores webhook in localStorage, registers with server via POST /api/webhook. Server holds 24h TTL map, client re-registers every 30min.
**Alternatives considered**: Server-side database (overkill), cookies (wrong tool)
**Reasoning**: Zero infrastructure cost, survives page refreshes, TTL auto-cleans abandoned hooks
**Consequences**: Webhooks lost if user clears browser data; server restart clears custom hooks (acceptable)

---
*Append new decisions as they arise. Never rewrite entire file.*
