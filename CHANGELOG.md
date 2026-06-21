# Changelog

## 2026-06-07 - Forward-Test Accounting Baseline

### Changed

- Monitor open trades using the saved `pairAddress` rather than selecting another token pair.
- Record actual observed TARGET, STOP, and TIMEOUT exit prices symmetrically.
- Store `triggerType`, `triggerPrice`, `exitPrice`, `pnlPercent`, and `closedAt` on closed trades.
- Enforce a 24-hour re-entry cooldown by token address across scanners.
- Add `strategyVersion` and `monitorVersion` to new paper trades.
- Deduplicate near misses by token address within a 24-hour window.
- Add near-miss follow-up tracking at 20, 60, and 120 minutes.

### Added

- `validate_data.js` for read-only trade-data integrity warnings.
- `analyze_forward_test.js` for version-isolated forward-test reporting.
