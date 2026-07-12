# Armed-Context Preflight Regression Test Gate — 2026-07-08

Status:
**REGRESSION PROOF PASS — PRODUCTION DISARMED UNCHANGED — NO ARMED PROOF**

Gate type:
Formal regression and proof — mocked/isolated LIVE_ARMED only

Prerequisites:
`ARMED-CONTEXT PREFLIGHT IMPLEMENTATION GATE — 2026-07-08.md` · `Decisions/DECISION — Armed-Context Preflight Architecture — 2026-07-08.md` · `Authorizations/AUTHORIZATION — Armed-Context Preflight Implementation — 2026-07-08.md`

Regression date:
**2026-07-08**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**Production code changed:** **No** · **Existing dry tooling changed:** **No** · **Config changed:** **No** · **`.env` changed:** **No** · **Armed production proof:** **No** · **Submit/broadcast:** **No**

---

## 1. Prominent post-gate state

> **DISARMED · DRY · NO TRADE**
>
> **REGRESSION PROOF PASS**
>
> **ARMED NO-SUBMIT PROOF DEFERRED**

---

## 2. Baseline

| Field | Value |
|-------|-------|
| **Posture** | `PIPELINE_OBSERVING` |
| **`liveArmed`** | `false` |
| **`executionMode`** | `PIPELINE_DRY_RUN` |
| **`dryRunMode`** | `true` |
| **`FOMO_ENABLE_LIVE_SUBMISSION`** | unset |
| **Runtime stub** | absent |
| **Executor loops** | 0 |
| **`live_config.json` SHA-256** | `0996882e1a5244d05079a2a6f3ff09049758ecbbf3b8e3e0434ee4b13a4d33ef` |

---

## 3. Files inspected

| File | Purpose |
|------|---------|
| `ARMED-CONTEXT PREFLIGHT IMPLEMENTATION GATE — 2026-07-08.md` | Implementation baseline |
| `Decisions/DECISION — Armed-Context Preflight Architecture — 2026-07-08.md` | AP manifest · contracts |
| `Authorizations/AUTHORIZATION — Armed-Context Preflight Implementation — 2026-07-08.md` | Scope |
| `validate_armed_preflight.js` | Domain B validator |
| `run_armed_preflight_manifest.js` | Manifest runner |
| `test_n6_armed_estop_probe.js` | Armed-safe N6 |
| `live_validation_common.js` | Shared helpers |
| `test_armed_preflight_unit.js` | Unit suite |
| `test_armed_preflight_regression.js` | Regression suite |
| `validate_live_system.js` | Domain A unchanged |
| `run_safety_tests.js` | Domain A unchanged |
| `test_n6_estop_drill.js` | Dry N6 unchanged |
| `docs/ARMED_PREFLIGHT.md` | Operator docs |
| `package.json` | Scripts |

---

## 4. Regression execution summary

| Suite | Total | Passed | Failed |
|-------|-------|--------|--------|
| **Unit (`test_armed_preflight_unit.js`)** | 20 | 20 | 0 |
| **Regression (`test_armed_preflight_regression.js`)** | 46 | 46 | 0 |
| **Combined new armed-preflight suite** | **66** | **66** | **0** |

---

## 5. Proof matrix results

| Proof area | Result |
|------------|--------|
| Syntax/load checks (8 new files) | **PASS** |
| Production wrong-posture exit 2 | **PASS** |
| Partially armed fail-closed matrix (4 cases) | **PASS** |
| Mocked LIVE_ARMED full PASS AP-01–AP-20 | **PASS** |
| Mandatory fail-closed matrix (17 cases) | **PASS** |
| Manifest status contract | **PASS** |
| Armed-safe N6 wrong posture | **PASS** — fail closed |
| Armed-safe N6 mocked harness | **PASS** |
| N6 production config hash preserved | **Yes** |
| Secret sentinel leakage | **PASS** — none detected |
| Deterministic normalized receipts | **PASS** |
| No-submit/sign/broadcast instrumentation | **PASS** — call count 0 |
| Existing dry validator | **PASS** |
| Existing safety suite | **PASS — 85/85** |
| Existing N6 dry behavior | **PASS** — N6 E-STOP DRILL TEST PASSED |

---

## 6. Post-test production state

| Field | Value |
|-------|-------|
| **`live_config.json` SHA-256** | `0996882e1a5244d05079a2a6f3ff09049758ecbbf3b8e3e0434ee4b13a4d33ef` *(unchanged)* |
| **Configuration/environment** | unchanged |
| **Runtime stub** | absent |
| **`liveArmed`** | `false` |
| **Posture** | `PIPELINE_OBSERVING` |
| **Executor loops** | 0 |
| **Submit/broadcast** | none |
| **Transaction signatures** | none |
| **Position/reconciliation/recovery/capital** | none |

---

## 7. Machine-readable receipt

**Path:** `analysis/armed_preflight_regression_receipt.json`

Secret-free regression gate artifact — **not** a runtime authorization stub.

---

## 8. Required output summary

| Item | Value |
|------|-------|
| **Regression gate receipt path** | `ARMED-CONTEXT PREFLIGHT REGRESSION TEST GATE — 2026-07-08.md` |
| **Machine-readable receipt path** | `analysis/armed_preflight_regression_receipt.json` |
| **Baseline posture** | `PIPELINE_OBSERVING` |
| **Baseline live_config hash** | `0996882e1a5244d05079a2a6f3ff09049758ecbbf3b8e3e0434ee4b13a4d33ef` |
| **Syntax/load checks result** | **PASS** |
| **New regression suite total** | **66** |
| **New regression suite passed** | **66** |
| **New regression suite failed** | **0** |
| **Wrong-posture exit 2 result** | **PASS** |
| **Partially armed fail-closed matrix result** | **PASS** |
| **Mocked LIVE_ARMED full-pass result** | **PASS** |
| **AP-01 through AP-20 completeness result** | **PASS** |
| **Manifest status contract result** | **PASS** |
| **Fail-closed case matrix result** | **PASS** |
| **Armed-safe N6 probe result** | **PASS** |
| **N6 production config hash preserved** | **Yes** |
| **No-submit/sign/broadcast instrumentation result** | **PASS** |
| **Production execution function call count** | **0** |
| **Secret sentinel leakage result** | **PASS** |
| **Deterministic receipt result** | **PASS** |
| **Existing dry validator result** | **PASS** |
| **Existing dry safety-suite result** | **PASS — 85/85** |
| **Existing N6 behavior preserved** | **Yes** |
| **Existing dry behavior preserved** | **Yes** |
| **Post-test live_config hash** | `0996882e…` *(unchanged)* |
| **Configuration/environment changed** | **No** |
| **Runtime stub created** | **No** |
| **System remains disarmed** | **Yes** |
| **Executor loops started** | **No** |
| **Submit/broadcast invoked** | **No** |
| **Transaction signatures** | **none** |
| **Position/reconciliation/recovery/capital** | **none** |
| **Regression proof status** | **PASS** |
| **OR-20260630-008 status** | **not_promoted** |
| **Readiness/profitability claims** | **No** |

---

## 9. Explicit non-executions (this gate)

| Item | Status |
|------|--------|
| Armed no-submit production proof | **Not performed** |
| Production re-arming | **No** |
| Runtime stub | **No** |
| OR promotion / readiness claims | **No** |

---

## 10. Recommended next gate

**Armed-Context Disarmed Dry Proof**

---

**Receipt path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/ARMED-CONTEXT PREFLIGHT REGRESSION TEST GATE — 2026-07-08.md`
