# Changelog — perp-analytics

---

## [1.1.0] - 2026-03-05

### Added
- System Monitor module: health checks for running NestJS apps (port, memory, log errors).
- Token Deep-Dive module: comprehensive single-coin analysis (OI, funding rate, volume trend, top traders).
- Whale Alert module: threshold-based detection at $100K+ notional (real-time via WebSocket feed).

### Changed
- Market Snapshot updated to use native Hyperliquid `metaAndAssetCtxs` endpoint directly.
- Funding Analytics: annualization formula clarified (8h rate × 3 × 365 = annual rate).
- Dashboard Builder module scoped to Markdown/table output only (removed Python Dash/Streamlit references — not implemented).

---

## [1.0.0] - 2026-03-05

### Added
- Initial skill with Market Snapshot, Funding Analytics, Liquidation Tracker, and Event Analyzer modules.
- Integration with `apps/data-analytics/` REST API for cached market data.
- Cron-warmed Redis cache: market snapshot (1 min TTL), leaderboard (5 min TTL).
