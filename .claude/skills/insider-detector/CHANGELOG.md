# Changelog — insider-detector

All notable changes to this skill. Format: [semver] - YYYY-MM-DD

---

## [2.1.0] - 2026-03-05

### Added
- **All-time PnL criterion** in scoreB: profitable wallets score higher (+2/+4 pts),
  chronic losers score lower (−3/−5 pts). Uses sum of `closedPnl` from all paginated fills.
- **Paginated fill history**: `getUserFillsPaginated()` fetches up to 10 000 most recent
  orders (5 pages × 2 000) with `aggregateByTime: true`. 300 ms pause between pages.
- **Fill-cap penalty** in scoreB: wallets at the 2 000-fill API hard cap receive −5 pts
  (established high-frequency trader, opposite of fresh insider profile).

### Changed
- `getUserFills(ninetyDaysAgo)` replaced with `getUserFillsPaginated()` in `inspectTrader()`.
  90-day fill count now computed client-side by filtering `allFills` by timestamp.
- Win rate and fill count scoring now use **90-day subset** of paginated fills;
  all-time PnL uses the **full paginated dataset**.
- `scoreB` floor enforced at −8 (previously unbounded negative was possible).

---

## [2.0.0] - 2026-03-05

### Added
- **`send` type detection**: incoming `send` ledger entries (spot→perp internal transfers
  from another HL address) now treated as deposit-equivalent. Fixes the C001 cluster bypass
  where a master controller funded 6 wallets via `send` without triggering FRESH_DEP.
- **`WalletType.SUB_ACCOUNT`** activated: wallets funded via `send` are classified as
  sub-accounts of a controller. Previously this enum value existed but was never assigned.
- **`fundedViaSend` flag**: tracked per wallet; feeds into SUB_ACCOUNT classification.
- Amount normalization across deposit types: `delta.usdc || delta.usdcValue || delta.amount`.

### Changed
- **HFT filter migrated from Copin API to native Hyperliquid `userFees` API**.
  Removed dependency on `https://hyper.copin.io/info` and custom headers.
  Now uses same `postInfo()` pattern as all other REST calls.
- `LedgerUpdateDto` extended with `send`-specific fields: `amount`, `usdcValue`, `token`, `user`.

### Fixed
- False negative on cluster-funded wallets: deposit filter now catches `send` entries,
  not just `type: 'deposit'`. Confirmed on C001 cluster analysis (2026-03-04).

---

## [1.0.0] - 2026-03-05

### Added
- Initial composite scoring engine: A (0–25) + B (0–20) + C (0–20) + D (0–15) + E (0–10) × F (×1.0–1.5)
- Dynamic per-coin thresholds from `metaAndAssetCtxs` (BLUECHIP/MID/LOW/MICRO tiers)
- Layer 0: zero-address skip in `bufferTrade()`
- Layer 1: HFT filter via `userFees` API with 24h cache
- Sliding window fill aggregation: 500 ms extension, 3 s absolute cap
- Lark webhook alerts with AlertLevel color coding
- Web dashboard (`GET /`, `GET /api/state`) with address shortening and Copin ↗ links
- Win rate scoring (graduated ±3–8 pts) with 10-fill minimum guard
- All five wallet types: GHOST, ONE_SHOT, FRESH, WHALE, NORMAL
- Flag system: LARGE, MEGA, NEW_ACCT, FIRST, FRESH_DEP, DEP_ONLY, GHOST, ONE_SHOT,
  ALL_IN, HIGH_LEV, DEAD_MKT, HIGH_OI, HFT
