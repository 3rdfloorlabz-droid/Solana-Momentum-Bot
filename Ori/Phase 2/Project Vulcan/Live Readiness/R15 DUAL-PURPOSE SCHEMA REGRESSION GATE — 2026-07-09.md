# R15 Dual-Purpose Schema Regression Gate — 2026-07-09

Status:
**REGRESSION PASS — SCHEMA FORMALLY PROVEN — SYSTEM REMAINS DISARMED**

Gate type:
Regression and proof only — dual-purpose R15 schema formal verification

Prerequisites:
`R15 DUAL-PURPOSE SCHEMA IMPLEMENTATION GATE — 2026-07-09.md` · `Authorizations/AUTHORIZATION — R15 Dual-Purpose Schema Implementation — 2026-07-09.md` · `Decisions/DECISION — R15 Dual-Purpose Approval Schema — 2026-07-09.md`

Regression date:
**2026-07-09**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**Regression performed:** **Yes** · **Production code changed:** **No** *(validator hardening only during regression)* · **Config changed:** **No** · **`.env` changed:** **No** · **Runtime stub created:** **No** · **Proof session created:** **No** · **Submit/broadcast:** **No** · **System armed:** **No**

---

## 1. Prominent post-gate state

> **DISARMED · DRY · NO TRADE**
>
> **DUAL-PURPOSE R15 SCHEMA REGRESSION PROVEN**
>
> **ARMED NO-SUBMIT PROOF NOT AUTHORIZED**

---

## 2. Baseline (pre-regression)

| Item | Value |
|------|-------|
| **Baseline timestamp** | **2026-07-09T17:44:42.7136034-06:00** |
| **Baseline posture** | `PIPELINE_DRY_RUN` · `dryRunMode: true` · `liveArmed: false` |
| **Baseline live_config SHA-256** | `0996882E1A5244D05079A2A6F3FF09049758ECBBF3B8E3E0434EE4B13A4D33EF` |
| **Runtime stub** | **absent** |
| **Proof session** | **not created** |
| **Executor loops** | **0** |
| **Position/reconciliation/recovery/capital** | **none** |

---

## 3. Files inspected (read-only)

| File | Purpose |
|------|---------|
| `R15 DUAL-PURPOSE SCHEMA IMPLEMENTATION GATE — 2026-07-09.md` | Implementation gate receipt |
| `Authorizations/AUTHORIZATION — R15 Dual-Purpose Schema Implementation — 2026-07-09.md` | Consumed implementation authorization |
| `Decisions/DECISION — R15 Dual-Purpose Approval Schema — 2026-07-09.md` | Canonical schema decision |
| `R15 ARMED-PROOF STATUS SCHEMA PLANNING — 2026-07-09.md` | Planning baseline |
| `r15_approval_validator.js` | Shared validator |
| `r15_manual_approval_check.js` | Legacy status helper |
| `live_executor.js` | Micro-live guard integration |
| `armed_preflight_checks.js` | AP-13 proof/micro-live separation |
| `armed_preflight_session.js` | Proof context |
| `test_r15_dual_purpose_schema.js` | Focused contract tests |
| `test_r15_dual_purpose_schema_regression.js` | Formal regression suite |
| `test_fixtures/r15/*` | v2 and legacy fixtures |
| `examples/r15_manual_approval_record_v2_*.example.json` | Non-canonical examples |

---

## 4. Formal regression summary

| Item | Result |
|------|--------|
| **Machine-readable receipt** | [`analysis/r15_dual_purpose_schema_regression_receipt.json`](../../../analysis/r15_dual_purpose_schema_regression_receipt.json) |
| **Formal regression total** | **148** |
| **Formal regression passed** | **148** |
| **Formal regression failed** | **0** |
| **Regression proof status** | **PASS** |

---

## 5. Matrix results

| Matrix | Result |
|--------|--------|
| **SchemaVersion** | **PASS** |
| **ApprovalPurpose** | **PASS** |
| **Purpose/status** | **PASS** |
| **ExpectedPurpose** | **PASS** |
| **Legacy policy** | **PASS** |
| **Common acknowledgments** | **PASS** |
| **Micro-live acknowledgments** | **PASS** |
| **Armed-proof acknowledgments** | **PASS** |
| **Unknown acknowledgment fields** | **PASS** |
| **Prohibited proof fields** | **PASS** |
| **Session/wallet/time/consumption** | **PASS** |
| **Micro-live guard separation** | **PASS** |
| **Armed-proof guard separation** | **PASS** |
| **Integration context** | **PASS** |
| **Deterministic errors** | **PASS** |
| **No-execution guarantees** | **PASS** |
| **Secret sentinel handling** | **PASS** — none observed |
| **Examples/fixtures** | **PASS** |

---

## 6. Preservation suite results

| Suite | Result |
|-------|--------|
| **Focused schema (`test_r15_dual_purpose_schema.js`)** | **PASS** |
| **Existing R15 (`test_r15_manual_approval_check.js`)** | **PASS** |
| **Armed-preflight unit** | **PASS** |
| **Armed-preflight regression** | **PASS** |
| **Armed-preflight prerequisites** | **PASS** |
| **Armed-preflight prerequisite regression** | **PASS** |
| **Domain A validator** | **PASS** |
| **Domain A safety suite** | **PASS** (85/85) |
| **N6 dry drill** | **PASS** — unchanged |
| **Wrong-posture exit 2** | **Preserved** |

---

## 7. Post-gate verification

| Item | Value |
|------|-------|
| **Post-gate live_config SHA-256** | `0996882E1A5244D05079A2A6F3FF09049758ECBBF3B8E3E0434EE4B13A4D33EF` *(unchanged)* |
| **Config/environment changed** | **No** |
| **Runtime stub created** | **No** |
| **Proof session created** | **No** |
| **System remains disarmed** | **Yes** |
| **Executor loops started** | **No** |
| **Submit/broadcast invoked** | **No** |
| **Transaction signatures** | **none** |
| **Production execution call count** | **0** |
| **Position/reconciliation/recovery/capital** | **none** |
| **OR-20260630-008 status** | **not_promoted** |
| **Readiness/profitability claims** | **No** |

---

## 8. Regression hardening applied during gate

Minor validator tightening discovered and verified during formal regression:

- Unknown acknowledgment field names in purpose buckets → `R15_*_ACK_INVALID`
- Malformed `expiresAt` / `sessionEndTime` when present → `R15_MALFORMED_RECORD`

No governance semantics changed. Micro-live legacy wallet binding semantics preserved.

---

## 9. Explicit non-executions (this gate)

| Item | Status |
|------|--------|
| Runtime R15 stub | **Not created** |
| Proof session | **Not created** |
| Fresh Domain A dry proof | **Not run** (next gate) |
| Production arming | **No** |

---

## 10. Recommended next gate

**Fresh Domain A Dry Proof for Armed No-Submit Proof Session**

---

**Receipt path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/R15 DUAL-PURPOSE SCHEMA REGRESSION GATE — 2026-07-09.md`
