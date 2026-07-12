# RB-G9 Armed Continuum Remediation Findings Correction — 2026-07-11

Status:
**CORRECTION PASS — READY FOR INDEPENDENT RE-REVIEW**

Mode:
**BOUNDED CODE-AND-TEST CORRECTION**

Correction start UTC:
**`2026-07-12T00:10:36.650Z`**

Correction start local (MDT):
**`Sat Jul 11 2026 18:10:36 GMT-0600 (Mountain Daylight Time)`**

Correction completion UTC:
**`2026-07-12T00:17:27.386Z`**

Correction completion local (MDT):
**`Sat Jul 11 2026 18:17:27 GMT-0600 (Mountain Daylight Time)`**

Upstream disposition:
[`Decisions/DECISION — RB-G9 Armed Continuum Finding Disposition — 2026-07-11.md`](Decisions/DECISION%20%E2%80%94%20RB-G9%20Armed%20Continuum%20Finding%20Disposition%20%E2%80%94%202026-07-11.md)

Capital exposure:
**none**

---

## 1. Correction results

| Finding | Result |
|---------|--------|
| **F1** — rollback initiation threshold | **CORRECTED** |
| **F2** — Domain C reserve enforcement | **CORRECTED** |
| **F3** — runtime `assertLegalTransition` | **CORRECTED** |
| **F4** — production AP/N6 wiring | **REMAINS DEFERRED** |
| **F5A** — AP/N6 timing edge cases | **CORRECTED** |
| **F5B** — duplicate invocation | **CORRECTED** |
| **F5C** — stale/consumed authorization | **CORRECTED** |
| **F6** — monotonic anomaly enforcement | **CORRECTED** |

**Final correction result:** **CORRECTION PASS — READY FOR INDEPENDENT RE-REVIEW**

---

## 2. Implementation summary

### F1
- Terminal monotonic timestamp captured at `finally` entry
- Rollback start measured via `assertRollbackInitiationDelay`
- **>5000 ms** records `ROLLBACK_INITIATION_DELAY_EXCEEDED`, prohibits PASS, rollback still executes
- Event log + receipt include delay metadata via `rollback.initiationDelay`

### F2
- `assertDomainCReserve` checked before Domain C entry
- **<180000 ms** records `DOMAIN_C_RESERVE_VIOLATION`, prohibits PASS, Domain C still executes
- Reserve status recorded in events and `domainC.reserveCheck`

### F3
- `transitionToState` calls authoritative `assertLegalTransition` on every runtime transition
- Stricter transition table (FINALIZE only from PRECHECK/DOMAIN_C)
- Illegal transition fails closed with `ILLEGAL_STATE_TRANSITION`; rollback reachable post-C1

### F4 (deferred)
- No production `run_armed_preflight_manifest` / `runProbe` wiring added
- Non-rehearsal guard unchanged
- Framework/test scope only; AP04 blocked pending separate production-integration authorization

### F5
- **F5A:** Integration tests for AP/N6 at exact and below thresholds with injected clock
- **F5B:** In-process `continuumRunRegistry` rejects duplicate `sessionId:continuumRunId`
- **F5C:** Consumed G1 rejected at PRECHECK without C1/AP/N6/rollback

### F6
- `detectMonotonicAnomaly` invoked at critical checkpoints (pre-C1, after arming, stub, AP, N6, rollback, Domain C)
- Pre-C1 anomaly: fail closed without mutation
- Post-C1 anomaly: rollback triggered; Domain C monotonic check skipped on prior anomaly

### New controlled codes (state module)
`ROLLBACK_INITIATION_DELAY_EXCEEDED` · `DOMAIN_C_RESERVE_VIOLATION` · `ILLEGAL_STATE_TRANSITION` · `DUPLICATE_CONTINUUM_INVOCATION` · `STALE_OR_CONSUMED_AUTHORIZATION` · `MONOTONIC_TIMER_ANOMALY`

New exit codes: **14** (duplicate) · **26** (timing enforcement) · **27** (monotonic anomaly)

---

## 3. Files changed

| File | Action |
|------|--------|
| `run_armed_continuum.js` | Modified — enforcement orchestration |
| `armed_continuum_state.js` | Modified — fail classes, stricter transitions |
| `armed_continuum_timing.js` | Modified — delay/reserve helpers, enhanced anomaly detection |
| `test_armed_continuum_timing.js` | Modified — F1/F2/F3/F6 unit tests |
| `test_armed_continuum_integration.js` | Modified — F1–F6 integration tests |
| `docs/ARMED_PREFLIGHT.md` | Modified — enforcement documentation |

**Unauthorized files touched:** **none**

**Scope expansion required:** **no**

---

## 4. Test results

| Suite | Result |
|-------|--------|
| `test:armed-continuum-timing` | **16/16 PASS** |
| `test:armed-g1-proof-day` | **5/5 PASS** |
| `test:armed-continuum-events` | **3/3 PASS** |
| `test:armed-continuum-rollback` | **2/2 PASS** |
| `test:armed-continuum-integration` | **28/28 PASS** |
| `test:armed-preflight-unit` | **PASS** |
| `test:armed-preflight-regression` | **49/49 PASS** |
| Canonical safety suite (`npm test`) | **85/85 PASS** |

### Correction-specific tests added
- Rollback threshold: 4999 / 5000 / 5001 ms
- Domain C reserve: 180001 / 180000 / 179999 ms
- State transition legal chain + illegal rejection
- AP exactly/below 10m; N6 exactly/below 8m
- Duplicate invocation rejection
- Stale/consumed G1 at PRECHECK
- Monotonic decrease, missing timer, impossible jump, pre/post-C1 paths

### No-submit boundary
`verifyNoSubmitImportBoundary()` — **clean** (no signer/Jupiter/scanner/submit imports)

---

## 5. Production posture (after tests)

| Check | Value |
|-------|-------|
| `executionMode` | `PIPELINE_DRY_RUN` |
| `dryRunMode` | `true` |
| `liveArmed` | `false` |
| Runtime stub | **absent** |
| Executor / positions | **zero** |
| FOMO live flags | **not YES** |
| AP04 authorized | **no** |
| Live continuum executed | **no** |
| AP/N6 invoked live | **no** |
| Transaction/sign/submit/broadcast | **none** |
| Git staged | **no** |
| Git committed | **no** |
| `.git/index.lock` | **untouched** |

---

## 6. Strategy and OR status

| Field | Value |
|-------|-------|
| Strategy readiness | **NOT READY** |
| OR-20260630-008 | **not_promoted** |

---

## 7. Recommended next gate

**RB-G9 Armed Continuum Remediation Findings Independent Re-Review**

---

**Canonical path:**  
`Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9 Armed Continuum Remediation Findings Correction — 2026-07-11.md`

Operating principle: Strength through honesty, speed through integrity.
