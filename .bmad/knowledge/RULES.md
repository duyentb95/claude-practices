# Project Rules

## Code Rules
- Always use `lossless-json` for parsing Hyperliquid API responses (precision loss on large ints)
- Always round price/size via `hyperliquidRoundPrice()` before SDK order calls
- Use `import WebSocket = require('ws')` in webpack-built NestJS apps (not named import)
- NestJS services must be in both `providers` AND `exports` arrays to be injectable across modules
- Hyperliquid REST rate limit: 1100ms sequential queue between calls
- Copin REST rate limit: 2000ms between calls

## Design Rules
- Insider scoring: 5 components (A-E) with multiplier F, never exceed 100
- MM/HFT filter runs BEFORE expensive REST inspection (save rate limit budget)
- Custom webhooks use 24h TTL with client-side heartbeat (30-min re-registration)
- Candle pipeline: bootstrap via REST first, then subscribe WS for live updates
- Protected coins (with open positions) are never unsubscribed from WS

## Strategy Rules (from docs/STRATEGY.md)
- Regime detection FIRST, trade execution SECOND
- 3 variables: staircase (highest priority), volume trend, ATR expansion
- Entry only after candle CLOSE through swing point (not intra-candle)
- SL at structural swing point, not fixed percentage
- TP: 1.0R for regime 2/3, 1.5R for regime 3/3

---
*Append new rules as they arise. Never rewrite entire file.*
