# R5 Review — Singleton Executor Guard / Duplicate Process Protection (Complete)

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — State / Process Safety)  
**Status:** **COMPLETE** — JSON singleton lock for `live_executor.js --loop`  
**Review date:** 2026-06-23  
**Reviewer:** Taylor / Ori  

**Context:** [STATE_DURABILITY_AND_LIVE_READINESS_GAP_REVIEW.md](./STATE_DURABILITY_AND_LIVE_READINESS_GAP_REVIEW.md) · [R4_LIVE_POSITIONS_ATOMICITY_REVIEW.md](./R4_LIVE_POSITIONS_ATOMICITY_REVIEW.md) · **Prior state durability:** R4 (`live_positions_store.js`) · R3 (`observation_dedup_store.js`) · A1b (`config_store.js`)  
**Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · [OPERATIONS.md](./OPERATIONS.md) · `executor_singleton_guard.js` · `live_executor.js` · `test_executor_singleton_guard.js` · `run_safety_tests.js`

---

## 1. Executive Summary

R5 added a **conservative singleton guard** for **`live_executor.js --loop`** to reduce the risk of two executor loops operating on shared runtime state at the same time.

Even with R3/R4 atomic writes, concurrent executor loops could still interleave reads and writes. R5 addresses this at **startup and loop-ownership** level using a JSON lock file refreshed each cycle.

Plainly:

- **R5 blocks duplicate executor loops** when a fresh lock is held.
- **R5 does not kill existing processes.**
- **R5 does not restart processes.**
- **R5 does not enable live trading.**
- **R5 does not change strategy logic.**
- **R5 does not approve live execution.**

Posture remains unchanged: **`PIPELINE_DRY_RUN` / `dryRunMode: true` / `liveArmed: false` / `PIPELINE_OBSERVING`**.

> **Singleton executor before live execution. No duplicate loop should share live position state.**

---

## 2. Scope

### Covered

| Area | Detail |
|------|--------|
| **`executor_singleton_guard.js`** | Acquire, refresh, release, validate, stale detection, atomic lock writes |
| **`live_executor.js --loop`** | Acquire before loop; refresh start/end of each cycle; release on clean exit/signals |
| **`live_executor.js --status`** | Read-only lock display via `describeExecutorLockStatus()` — no acquire |
| **`test_executor_singleton_guard.js`** | Isolated temp-runtime tests (16/16) |
| **`run_safety_tests.js`** | Suite **17/17 → 18/18** |
| **`.gitignore`** | `executor_singleton.lock.json` (runtime artifact) |
| **Docs** | `ACTIVE_MANIFEST.md`, `KNOWN_ISSUES.md`, `OPERATIONS.md` updated for R5 |

### Not covered (intentionally out of scope)

- OS-level advisory locking
- Automatic PID verification against running processes
- Automatic duplicate process termination
- Executor recovery
- Process killing / `taskkill` / `Stop-Process`
- Live trading enablement
- Strategy changes
- Recovery expansion
- Guarding `--cycle` (single-shot mode, by design)

---

## 3. Implementation Summary

### Lock file path

| Convention | Path |
|------------|------|
| Production default | `{repo root}/executor_singleton.lock.json` |
| Test / fixture override | `{TRACKTA_RUNTIME_ROOT}/executor_singleton.lock.json` when env set |
| Module helper | `getExecutorLockPath(file?)` |

### Lock file fields

| Field | Type / notes |
|-------|----------------|
| `schemaVersion` | `1` |
| `instanceId` | Non-empty string (unique per loop instance) |
| `pid` | Finite positive integer or `null` |
| `startedAt` | ISO timestamp string |
| `updatedAt` | ISO timestamp string (refreshed each cycle) |
| `hostname` | String |
| `command` | e.g. `"live_executor.js --loop"` |
| `mode` | String when present (e.g. `PIPELINE_DRY_RUN`) |
| `dryRunMode` | Boolean |
| `liveArmed` | Boolean |

No secrets are stored in the lock file.

Writes use the same atomic pattern as R3/R4/A1b: **temp → fsync → re-parse validate → rename**.

### Acquire behavior (`acquireExecutorSingletonGuard`)

| Lock state | Result |
|------------|--------|
| **Missing** | Acquire via atomic write; return `instanceId` |
| **Stale** (`updatedAt` older than **3 minutes**) | Replace via atomic write |
| **Fresh** | **Block** — `"Executor singleton lock active; refusing to start duplicate loop."` |
| **Malformed / corrupt** | **Block** — manual operator review required; lock **not** auto-deleted |

R5 does **not** kill the process holding an existing lock.

### Refresh behavior (`refreshExecutorSingletonGuard`)

- Called at **start** and **end** of each autonomous loop cycle
- Updates `updatedAt` and optional posture fields (`mode`, `dryRunMode`, `liveArmed`)
- If `instanceId` no longer matches lock owner → loop **stops** (`process.exit(1)`)
- Preserves same `instanceId` across refreshes

### Release behavior (`releaseExecutorSingletonGuard`)

- Registered on clean exit, `SIGINT`, and `SIGTERM` (best-effort)
- Removes lock **only** when `instanceId` matches current owner
- **Never** removes another instance’s lock
- No process killing

---

## 4. Status Behavior

`live_executor.js --status` is **read-only** with respect to the singleton lock.

It may display:

| Field | Values |
|-------|--------|
| `executorSingletonLock` | `none` / `active` / `stale` / `malformed` |
| `lockOwnerInstanceId` | Present when lock file readable |
| `lockUpdatedAt` | Present when lock file readable |

It **must not** acquire, refresh, or delete the lock.

Example (no loop running):

```text
executorSingletonLock: none
```

---

## 5. Safety Boundary

| Allowed | Forbidden |
|---------|-----------|
| Detect duplicate executor loop intent | Kill any process |
| Refuse to start duplicate `--loop` | Restart any process |
| Read/write `executor_singleton.lock.json` atomically | Make live trading easier |
| Refresh/release own lock | Auto-delete malformed production lock |
| Stop own loop if ownership lost | PID-based termination |

R5 is **state/process ownership hardening only** — not live approval.

---

## 6. Test Coverage

`test_executor_singleton_guard.js` — **16/16 PASS** (isolated OS temp directory; `TRACKTA_RUNTIME_ROOT` where applicable):

| Test | Coverage |
|------|----------|
| T1 | Missing lock can acquire |
| T2 | Fresh lock blocks second acquire |
| T3 | Stale lock can be replaced |
| T4 | Malformed/corrupt lock blocks startup (not auto-deleted) |
| T5 | `--status` path does not acquire lock (static source check) |
| T6 | Refresh updates `updatedAt` for same instance |
| T7 | Refresh fails if ownership changes |
| T8 | Release removes lock only for matching `instanceId` |
| T9 | Release does not remove another owner’s lock |
| T10 | Lock write is atomic; failed validation leaves original intact |
| T11 | Invalid lock shape rejected |
| T12 | No repo-root lock file created by tests |
| T13 | No `live_config.json` mutation |
| T14 | No `recovery_actions.jsonl` creation |
| T15 | No repo-root `live_positions.json` / `observation_dedup.json` mutation |
| T16 | `TRACKTA_RUNTIME_ROOT` path resolution |
| Static | No `child_process` / spawn / exec / kill / shell in guard |
| Static | `live_executor.js --loop` uses singleton guard |
| Static | `live_executor.js --status` remains read-only |

---

## 7. Verification Results

Recorded at R5 completion (2026-06-23):

| Command | Result |
|---------|--------|
| `node --check executor_singleton_guard.js` | **PASS** |
| `node --check test_executor_singleton_guard.js` | **PASS** |
| `node --check live_executor.js` | **PASS** |
| `node test_executor_singleton_guard.js` | **16/16 PASS** |
| `node run_safety_tests.js` | **18/18 PASS** |
| `node live_executor.js --status` | `PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false`, `operationalPosture: PIPELINE_OBSERVING`, `executorSingletonLock: none` |
| `Test-Path recovery_actions.jsonl` | **False** |

---

## 8. Negative Verification

Confirmed **absent** at R5 completion:

- Live trading enabled
- `executionMode: LIVE`
- `dryRunMode: false`
- `liveArmed: true`
- Process killing / PID killing
- `taskkill` / `Stop-Process`
- Shell execution (in guard or R5 tests)
- Recovery route expansion
- Real process recovery
- Dashboard recovery buttons
- Strategy threshold changes
- Repo-root `recovery_actions.jsonl`
- Real `live_config.json` mutation in R5 tests

---

## 9. Remaining Limitations

| Limitation | Detail |
|------------|--------|
| **Not OS advisory lock** | JSON file lock only; no kernel-level exclusive lock |
| **Simultaneous start race** | Two loops starting together on missing/stale lock may both attempt acquire; last atomic write wins |
| **`--cycle` unguarded** | Single-shot cycle mode does not acquire lock (by design) |
| **No PID verification** | Lock records `pid` but does not verify process is alive |
| **No automatic duplicate termination** | R5 refuses new loop; does not stop existing loop |
| **Operator manual review** | Stale/malformed locks may require human inspection before delete |
| **Reboot / update** | Lock may be absent or stale after reboot; operator should run `--status` before starting loop |

These limitations are documented in [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) and [STATE_DURABILITY_AND_LIVE_READINESS_GAP_REVIEW.md](./STATE_DURABILITY_AND_LIVE_READINESS_GAP_REVIEW.md).

---

## 10. Restart Note

| Component | Restart required? |
|-----------|-------------------|
| **Dashboard** | **No** — `dashboard_server.js` unchanged |
| **Executor loop** | **Yes, when convenient** — running loop must reload updated `live_executor.js` to use singleton guard |

After computer reboot or update, the executor lock may be **absent** or **stale**. Operator should:

1. Run `node live_executor.js --status` and inspect `executorSingletonLock`
2. Confirm no executor loop window is already running
3. Only then start `node live_executor.js --loop`
4. Do **not** delete `executor_singleton.lock.json` unless confirmed no loop is running

---

## 11. Verdict

| Field | Value |
|-------|-------|
| **R5 Singleton Executor Guard / Duplicate Process Protection** | **COMPLETE** |
| **Safety suite** | **18/18 PASS** |
| **Live status** | **DISARMED** |
| **Live trading** | **NOT APPROVED** |
| **Duplicate executor risk** | **PARTIALLY MITIGATED AT STARTUP-GUARD LEVEL** |

---

## 12. Recommendation

**Next step:** **R6 — 72-hour Dry-run Soak Plan**

**Purpose:** Run the system under observation after A2/R3/R4/R5 hardening and verify stability over time before live-readiness checklist work.

**Do not:**

- Proceed directly to live trading
- Proceed directly to real process recovery

Prior abbreviated A2d soak (~1h) is not sufficient for live-readiness claims; R6 should define a full-duration observation plan with checkpoints.

---

## 13. Footer

Singleton executor before live execution.  
State durability before live readiness.  
Atomic writes before real money.  
No duplicate loop should share live position state.  
Live trading remains disarmed.  
Humans authorize.  
Ori advises.  
Gates enforce.
