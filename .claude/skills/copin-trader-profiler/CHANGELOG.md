# Changelog

## [1.1.0] - 2026-03-05

### Changed
- **BREAKING**: All API calls now require `X-API-KEY: ${COPIN_API_KEY}` header (from env var)
- Updated API reference to match new api-docs.copin.io documentation
- Rate limit updated: 30 req/min (was undocumented, now enforced)
- Added 2000ms delay between requests (was 100ms)

### Added
- New endpoints: Live Order GraphQL, Live Position GraphQL (real-time monitoring)
- New endpoint: Position Statistic by Account (GET single trader all periods)
- New endpoint: Search After pagination (cursor-based, efficient for large scans)
- New endpoint: PnL Statistic (aggregated PnL time-series)
- New protocols: JUPITER, HOLDSTATION_BERA, GMX_SOL, OSTIUM_ARB, PERPETUAL_OP
- Added error handling guidance (401, 429, 500)
- Added curl templates with X-API-KEY in all examples

## [1.0.0] - 2026-03-05

### Added
- Initial release: 8-archetype trader classification engine
- Copin API integration (5 endpoints: statistics, positions, details, leaderboard, OI)
- Behavioral fingerprinting from position-level data
- Copy-worthiness composite scoring
- MM/HFT whitelist generation for insider-detector integration
