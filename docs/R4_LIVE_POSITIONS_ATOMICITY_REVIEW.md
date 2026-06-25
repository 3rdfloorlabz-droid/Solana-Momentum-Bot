# R4 Review — live_positions.json Ownership and Atomicity (Complete)

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — State Durability)  
**Status:** **COMPLETE** — executor-owned atomic live position snapshot store  
**Review date:** 2026-06-23  
**Reviewer:** Taylor / Ori  

**Context:** [A2T_POST_ACTION_RECOVERY_REVIEW.md](./A2T_POST_ACTION_RECOVERY_REVIEW.md) · [A2S_REVIEW.md](./A2S_REVIEW.md) · **Prior state durability:** R3 (`observation_dedup_store.js`) · A1b (`config_store.js`) · A1a (`paper_positions_store.js`)  
**Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · [OPERATIONS.md](./OPERATIONS.md) · `live_positions_store.js` · `live_executor.js` · `test_live_positions_atomic.js` · `test_ownership_guards.js` · `run_safety_tests.js`

---

## 1. Executive Summary

R4 hardened **`live_positions.json`** by introducing a dedicated atomic store (`live_positions_store.js`) and routing **`live_executor.js`** position reads and writes through it.

R4 improves **state durability for the most sensitive runtime snapshot file** before any live-readiness work. Open live position state is closer to real-money risk than observation dedup or paper lifecycle stores.

Plainly:

- **R4 does not enable live trading.**
- **R4 does not change strategy logic.**
- **R4 does not change `executionMode`.**
- **R4 does not approve live submission.**
- **R4 does not implement recovery expansion.**

Posture remains unchanged: **`PIPELINE_DRY_RUN` / `dryRunMode: true` / `liveArmed: false` / `PIPELINE_OBSERVING`**.

> **Atomic writes before real money. Live trading remains disarmed.**

---

## 2. Scope

### Covered

| Area | Detail |
|------|--------|
| **`live_positions_store.js`** | New dedicated atomic read/write module for `live_positions.json` |
| **`live_executor.js`** | `readPositions()` / `writePositions()` routed through store (write safety only; lifecycle logic unchanged) |
| **`test_live_positions_atomic.js`** | Isolated temp-runtime tests (15/15) |
| **`test_ownership_guards.js`** | R4 static guards: executor atomic path; dashboard/scanner/monitor read-only |
| **`run_safety_tests.js`** | Suite **16/16 → 17/17** |
| **Docs** | `ACTIVE_MANIFEST.md`, `KNOWN_ISSUES.md`, `OPERATIONS.md` updated for R4 |

### Not covered (intentionally out of scope)

- Live trading enablement
- Strategy changes
- Trade sizing changes
- Entry/exit logic changes
- Recovery expansion
- Advisory locking / singleton executor enforcement
- Dual executor process prevention
- Dashboard code changes
- Production data migration
- Real process restart or kill

---

## 3. Previous State

Before R4, `live_positions.json` was a **non-atomic full replace** written synchronously by the executor.

| Location | Role | Pre-R4 behavior |
|----------|------|-----------------|
| **`live_executor.js`** | Sole production writer | `readPositions()` — `fs.readFileSync` + parse; `writePositions()` — **`fs.writeFileSync`** full replace |
| **`dashboard_server.js`** | Read-only | `liveExecutor.openPositions()` for open position display |
| **`reset_live_safety.js`** | Read-only | Parses file for open-position count during safety reset reporting |
| **`validate_live_system.js`** | Read-only | Validates JSON array shape during system checks |
| **`scanner_gmgn_trending.js`** | No access | Does not read or write `live_positions.json` |
| **`monitor.js`** | No access | Does not read or write `live_positions.json` |
| **Test fixtures** | Isolated temp only | e.g. `test_dashboard_auth_behavior.js`, `test_low_risk_recovery_routes.js` write empty `[]` under `TRACKTA_RUNTIME_ROOT` — not production writers |

On-disk shape was (and remains) a **legacy JSON array** at root: `[{ position object }, …]`.

---

## 4. Ownership Model

| Actor | Role |
|-------|------|
| **`live_executor.js`** | Sole production writer (entry open, exit remove) |
| **`live_positions_store.js`** | Only approved production write path (`writeLivePositionsStateAtomic`) |
| **`dashboard_server.js`** | Read-only (`openPositions()`) |
| **`reset_live_safety.js`** | Read-only (open count) |
| **`validate_live_system.js`** | Read-only (JSON validation) |
| **`scanner_gmgn_trending.js`** | No access |
| **`monitor.js`** | No access |

Regression-guarded by `test_ownership_guards.js` (R4 section) and `test_live_positions_atomic.js` static checks.

### Remaining assumption

**Dual concurrent executor processes can still race** because advisory locking is deferred to a future state module. R4 guarantees atomic single writes and single-writer ownership in production code; it does not prevent two executor loops from running simultaneously.

---

## 5. Implementation Summary

### `live_positions_store.js` exports

| Export | Purpose |
|--------|---------|
| `getLivePositionsPath` | Resolves path (`TRACKTA_RUNTIME_ROOT` or repo root; optional override) |
| `createDefaultLivePositionsState` | Returns `[]` |
| `loadLivePositionsState` | Safe read with corrupt-file handling |
| `validateLivePositionsState` | Pre-write shape validation |
| `writeLivePositionsStateAtomic` | Temp → validate → atomic rename |
| `updateLivePositionsState` | Load → updater merge → atomic write |

### Atomic write behavior

Matches the established pattern from `config_store.js` (A1b) and `observation_dedup_store.js` (R3):

1. Write payload to a **temp file in the same directory** (`live_positions.json.<pid>.<random>.tmp`)
2. **`fsync`** on the temp file (best-effort; unsupported filesystems degrade gracefully)
3. **Re-read** the temp file
4. **Parse and validate** before replacement
5. **`rename`** temp into place (atomic replace on POSIX; Windows `MoveFileEx` replace-existing)
6. **Never truncate** the existing valid file before a successful validated temp is ready
7. **Clean up** temp file on failure when safe

Built-in Node `fs` / `path` / `crypto` only. No new dependencies.

### `live_executor.js` wiring

```javascript
function readPositions() {
  return livePositionsStore.loadLivePositionsState(LIVE_POSITIONS_FILE, {
    onWarn: msg => logError("readPositions", msg)
  });
}

function writePositions(positions) {
  livePositionsStore.writeLivePositionsStateAtomic(positions, LIVE_POSITIONS_FILE);
}
```

Strategy, entry/exit rules, and position lifecycle semantics are **unchanged**.

---

## 6. Validation Model

On-disk shape **preserved** for backward compatibility:

| Rule | Detail |
|------|--------|
| **Root** | JSON **array** (not an object wrapper) |
| **Entries** | Each position is a plain object (not array, not null) |
| **String fields** (when present) | `liveTradeId`, `status`, `address`, `pairAddress`, `symbol` |
| **`liveTradeId`** | Non-empty string when present |
| **`dryRun`** | Boolean when present |
| **`anomalyFlags`** | Array of strings when present |
| **Numeric fields** (when present, or null) | `positionSizeSol`, `intendedEntryPrice`, `actualEntryPrice`, `targetPrice`, `stopPrice`, `entrySlippagePct`, `entryFeeSol`, `entryLatencyMs`, `score` — must be finite numbers or null |
| **Size cap** | Max **1,000** entries |
| **Invalid root** | Non-array root rejects write |
| **Invalid entries** | Rejects where safely detectable (e.g. wrong types, array-as-entry) |

Validation is **integrity-only** — it does not enforce strategy thresholds, thesis bounds, or live-arm gates.

---

## 7. Load Behavior

| Condition | Behavior |
|-----------|----------|
| **Missing file** | Returns `[]` (default empty state) |
| **Valid JSON array** | Loads and normalizes (filters non-object entries) |
| **Corrupt JSON** | Logs via `onWarn` → `logError("readPositions", …)`; returns `[]` |
| **Non-array root** | Returns `[]` (normalized default) |
| **Corrupt file on disk** | **Not deleted** |
| **Corrupt file on disk** | **Not automatically overwritten** by load |
| **Production repair** | **Not automated** — operator fixes or removes file when executor is stopped |

This matches the conservative corrupt-file policy used for R3 observation dedup.

---

## 8. Test Coverage

`test_live_positions_atomic.js` — **15/15 PASS** (isolated OS temp directory; `TRACKTA_RUNTIME_ROOT` where applicable):

| Test | Coverage |
|------|----------|
| T1 | Missing file loads default `[]` |
| T2 | Valid state loads correctly |
| T3 | `writeLivePositionsStateAtomic` creates file |
| T4 | Second write replaces atomically; no leftover `.tmp` |
| T5 | Failed validation does not replace existing valid file |
| T6 | Corrupt existing file not silently overwritten by load |
| T7 | Temp file cleanup on failed write |
| T8 | `updateLivePositionsState` preserves existing entries |
| T9 | Production-compatible shape validates |
| T10 | Invalid root shape rejects |
| T11 | Invalid position entries reject when safely detectable |
| T12 | No repo-root `live_positions.json` side effect |
| T13 | No `live_config.json` mutation |
| T14 | No `recovery_actions.jsonl` creation |
| T15 | Store uses `TRACKTA_RUNTIME_ROOT` temp path |
| Static | No `child_process` / spawn / exec / kill in store |
| Static | Executor uses atomic path; no raw `writeFileSync(LIVE_POSITIONS_FILE)` |
| Static | Dashboard remains read-only for `live_positions.json` |

---

## 9. Safety Suite

```text
node run_safety_tests.js — 17/17 PASS
```

R4 additions:

- **`test_live_positions_atomic.js`** — atomic store unit tests
- **R4 ownership guards** in **`test_ownership_guards.js`** — executor atomic path; no scanner/monitor/dashboard production writers

Prior state-durability guards remain green: `test_config_store_atomic.js`, `test_observation_dedup_atomic.js`, A1a paper ownership tests.

---

## 10. Verification Results

Recorded at R4 completion (2026-06-23):

| Command | Result |
|---------|--------|
| `node --check live_positions_store.js` | **PASS** |
| `node --check test_live_positions_atomic.js` | **PASS** |
| `node test_live_positions_atomic.js` | **15/15 PASS** |
| `node test_observation_dedup_atomic.js` | **12/12 PASS** |
| `node test_config_store_atomic.js` | **6/6 PASS** |
| `node test_ownership_guards.js` | **PASS** |
| `node run_safety_tests.js` | **17/17 PASS** |
| `node live_executor.js --status` | `PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false`, `operationalPosture: PIPELINE_OBSERVING` |
| `Test-Path recovery_actions.jsonl` | **False** |

---

## 11. Negative Verification

Confirmed **absent** at R4 completion:

- Live trading enabled
- `executionMode: LIVE`
- `dryRunMode: false`
- `liveArmed: true`
- Recovery route expansion
- Real process start
- Process killing
- Shell execution (in store or R4 tests)
- Repo-root `recovery_actions.jsonl`
- Real `live_config.json` mutation in R4 tests
- Strategy threshold changes
- Dashboard recovery buttons
- Direct production `fs.writeFileSync` to `live_positions.json` outside `live_positions_store.js`

---

## 12. Remaining Risks / Deferred Work

| Item | Status |
|------|--------|
| Advisory locking | **Deferred** — dual executor processes can still race |
| Corrupt file auto-repair | **Not implemented** — manual fix when executor stopped |
| Closed positions removed on exit | **Unchanged** — existing lifecycle behavior |
| 72-hour dry-run soak | **Pending** |
| Strategy edge validation | **Needs longer dry-run/paper observation** |
| Live-readiness checklist | **Not yet completed** |
| Live trading approval | **NOT APPROVED** |

Related open items (see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)): R5 snapshot read-during-write, R6 multi-appender JSONL interleave, executor recovery remains high-risk in A2 design until state durability review consolidates blockers.

---

## 13. Restart Note

| Component | Restart required? |
|-----------|-------------------|
| **Dashboard** | **No** — `dashboard_server.js` was unchanged in R4 |
| **Executor loop** | **Yes, when convenient** — running executor must reload updated `live_executor.js` to use `live_positions_store.js` for position persistence |

Restarting the executor is an operator action when ready; R4 does not automate or require immediate restart for correctness of the codebase itself.

---

## 14. Verdict

| Field | Value |
|-------|-------|
| **R4 live_positions.json Ownership and Atomicity** | **COMPLETE** |
| **Safety suite** | **17/17 PASS** |
| **Live status** | **DISARMED** |
| **Live trading** | **NOT APPROVED** |
| **State durability** | **IMPROVED** |

---

## 15. Recommendation

**Next step:** **State Durability Review / Live Readiness Gap Review**

**Purpose:** Consolidate A2 (simulated recovery), R3 (`observation_dedup.json`), and R4 (`live_positions.json`); identify remaining blockers before any live-readiness checklist.

**Do not:**

- Proceed directly to live trading
- Proceed directly to real process recovery

**Possible next technical hardening** (after review, human-approved):

- Advisory lock / singleton executor guard
- 72-hour dry-run soak
- Live-readiness checklist completion
- Strategy edge review

---

## 16. Footer

State durability before live readiness.  
Atomic writes before real money.  
Live positions require stronger ownership than paper state.  
Recovery must never outrun ownership.  
Live trading remains disarmed.  
Humans authorize.  
Ori advises.  
Gates enforce.
