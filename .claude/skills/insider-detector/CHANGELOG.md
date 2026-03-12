# Changelog — insider-detector

All notable changes to this skill. Format: [semver] - YYYY-MM-DD

---

## [3.3.0] - 2026-03-12

### Added
- **Phase 3: New Listing Detection** — `coinFirstSeenAt` map tracks when each coin first appears in `refreshCoinTiers()`. Coins at startup marked as baseline (no flag). Coins appearing after startup trigger `NEW_LISTING` flag + scoreC +8 for 48h window. Log message on detection.
- **Phase 3: Copin win rate fallback in scoreB** — when HL 90d fills have < 10 closed positions (insufficient data), falls back to Copin D30 `winRate` if D30 has ≥ 10 trades. Improves accuracy for wallets with limited HL history.
- **InsiderFlag.NEW_LISTING ('NEW_LIST')** — emitted when trade coin appeared in `metaAndAssetCtxs` < 48h after scanner startup.
- **Lark flag label** for `NEW_LISTING` (🆕 NEW LIST).

---

## [3.2.0] - 2026-03-12

### Added
- **Phase 3: Volume EMA baseline for scoreC** — per-coin exponential moving average (α=0.1) maintained via `refreshCoinTiers()` (60s tick). VOLUME_SPIKE flag when today's 24h volume > 3× EMA (scoreC −3); quiet-market bonus when < 0.5× EMA (scoreC +2). Requires 10 samples before activating (~10 min).
- **Phase 3: Daily FP digest** — `@Cron` method `sendDailyFpDigest()` at configured UTC hour sends a grey Lark card listing HIGH/CRITICAL suspects with FP indicators (SMART_TRADER archetype, DEGEN archetype, VOLUME_SPIKE without hot flags, or high score without smoking-gun flags).
- **InsiderFlag.VOLUME_SPIKE ('VOL_SPIKE')** — emitted when coin volume > 3× EMA; indicates news/event day (less suspicious context).
- **Lark flag labels** for `VOLUME_SPIKE` (📣 VOL SPIKE), `COPIN_SUSPICIOUS` (🎯 COPIN SUSP), `SMART_TRADER` (🧠 SMART).
- **`fpDigestEnabled`** and **`fpDigestHour`** config env vars.

---

## [3.1.0] - 2026-03-09

### Added
- **HIP-3 WebSocket coverage**: `WsScannerService` now subscribes to `{ type: 'trades', dex: 'ALL_DEXS' }` in addition to per-coin subscriptions, receiving trades for all HIP-3 DEX pairs.
- **`allPerpMetas` coin loading**: `loadCoins()` migrated from `getMetaAndAssetCtxs()` to `getAllPerpMetas()`, which includes HIP-3 pairs and filters out delisted pairs (`isDelisted: true`).
- **`getAllPerpMetas()` in HyperliquidInfoService**: new method using `{ type: 'allPerpMetas' }` POST /info. Filters `isDelisted: true` by default.
- **`isDelisted` field** on `PerpMetaDto` interface.

---

## [3.0.0] - 2026-03-09

### Added
- **Phase 2: LeaderboardMonitorService** — pre-warms Copin classification cache for top-100 traders every 6h; detects when leaderboard wallets trade unusual coins (LEADERBOARD_COIN flag, yellow Lark alert).
- **Send-graph cluster detection** — wallets funded by known suspects receive LINKED_SUSPECT flag (+10 score boost). Uses `send`-type ledger entries to trace funding chain.
- **Copin archetype section** in Lark suspect cards: shows D30 win rate, PnL, avg hold time, archetype label with emoji.
- **Cluster hit section** in Lark suspect cards: shows funding address when LINKED_SUSPECT detected.
- **`alertLeaderboardUnusualCoin()`** — new Lark alert for leaderboard wallet trading an unusual coin (yellow card, 4h cooldown).
- **InsiderFlag.LINKED_SUSPECT ('LINKED')** and **InsiderFlag.LEADERBOARD_COIN ('LB_COIN')** added to enum.
- **`linkedSuspectAddress`** and **`isLeaderboardWallet`** fields on `SuspectEntry`.
- **Leaderboard stats** exposed in `GET /api/state` response (`leaderboard.size`, `lastRefreshedAt`, `preWarmCount`).
- **`archetypeEmoji()`** and **`fmtDuration()`** helpers in `lark-alert.service.ts`.
- **`leaderboardRefreshMs`**, **`leaderboardSize`**, **`leaderboardAlertEnabled`** config env vars.

### Notes
- Leaderboard pre-warm is pending until Copin filter API completes DB migration (API returns empty for all queries as of 2026-03-09). 5-min startup retry already in place.

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
