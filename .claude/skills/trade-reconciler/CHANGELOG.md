# Changelog — trade-reconciler

---

## [1.0.0] - 2026-03-05

### Added
- Initial skill design: 5 reconciliation types (fills, positions, P&L, funding, fees).
- Tolerance levels: price ±0.01%, size ±0.001, P&L ±$0.01.
- Severity classification: CRITICAL / WARNING / INFO.
- `lossless-json` requirement for financial precision.
- Self-reconciliation fallback when internal records are unavailable.

### Known Gaps
- No production implementation yet (no corresponding NestJS service in `apps/`).
- Fee schedule verification is manual — no automated schedule-change detection.
- Funding calculation does not handle mid-interval position openings.
