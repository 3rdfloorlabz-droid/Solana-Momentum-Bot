# Armed-Context Preflight Architecture Decision — 2026-07-08

Status:
**DECISION APPROVED — ARCHITECTURE ADOPTED — IMPLEMENTATION NOT AUTHORIZED — SYSTEM REMAINS DISARMED**

Gate type:
Architecture decision sign-off — governance only

Prerequisites:
`ARMED-CONTEXT PREFLIGHT ARCHITECTURE PLANNING — 2026-07-08.md` · `EV02 NO-TRADE DISARM AND RB-G9 CLOSURE — 2026-07-08.md` · `FRESH MICRO-LIVE SINGLE-TRADE EXECUTION GATE — 2026-07-08.md` · `Sessions/SESSION — RB-G9-20260707-EV02 — 2026-07-08/RB-G9 — REVIEW.md`

Decision date:
**2026-07-08**

Decision owner:
**Taylor Cheaney**

Decision status:
**APPROVED**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**Code changed:** **No** · **Tests changed:** **No** · **Config changed:** **No** · **`.env` changed:** **No** · **Runtime stub created:** **No** · **Implementation authorized:** **No** · **Submit/broadcast:** **No** · **System armed:** **No**

---

## 1. Prominent post-gate state

> **DISARMED · DRY · NO TRADE**
>
> **ARCHITECTURE DECISION APPROVED — NOT IMPLEMENTED**
>
> **EV02 CLOSED — DO NOT REUSE**

---

## 2. Files inspected (read-only)

| File | Purpose |
|------|---------|
| `ARMED-CONTEXT PREFLIGHT ARCHITECTURE PLANNING — 2026-07-08.md` | Planning baseline · Option B recommendation · AP manifest |
| `EV02 NO-TRADE DISARM AND RB-G9 CLOSURE — 2026-07-08.md` | Originating incident closure · post-disarm 85/85 |
| `FRESH MICRO-LIVE SINGLE-TRADE EXECUTION GATE — 2026-07-08.md` | Phase 1 structural abort evidence |
| `Sessions/SESSION — RB-G9-20260707-EV02 — 2026-07-08/RB-G9 — REVIEW.md` | ABORTED_BEFORE_BROADCAST |
| `validate_live_system.js` | Dry-only `dryRunMode === true` requirement |
| `run_safety_tests.js` | Monolithic 85-test manifest |
| `test_n6_estop_drill.js` | E0 production LIVE abort guard |
| `live_executor.js` | `computeLiveArmedStatus` · gate failures · R15 guard |
| `live_config.json` | Disarmed posture · hash `0996882e…` |
| `R15 SECURE STORAGE DECISION — 2026-07-06.md` | Authorization/stub governance |
| `RB-G9 STRUCTURED STORAGE DECISION — 2026-07-06.md` | Session evidence model |
| `Authorizations/README.md` | EV02 CONSUMED/CLOSED linkage |

---

## 3. Decision recorded

| Field | Value |
|-------|-------|
| **Canonical decision path** | `Decisions/DECISION — Armed-Context Preflight Architecture — 2026-07-08.md` |
| **Decision owner** | Taylor Cheaney |
| **Decision date** | 2026-07-08 |
| **Decision status** | **APPROVED** |
| **Originating session** | `RB-G9-20260707-EV02` |
| **Originating classification** | **ABORTED_BEFORE_BROADCAST** |
| **Capital exposure** | **none** |
| **Decision index updated** | `Decisions/README.md` |

---

## 4. Adopted architecture summary

| Adoption | Status |
|----------|--------|
| Three-domain model (A/B/C) | **Yes** |
| Option B selected | **Yes** |
| Options A and C rejected | **Yes** |
| AP-01 through AP-20 manifest | **Yes** |
| N6 armed-safe replacement design | **Yes** |
| Armed validator contract | **Yes** |
| Manifest-runner contract | **Yes** |
| Evidence freshness rules | **Yes** |
| Transition invariants | **Yes** |
| Invalidation triggers | **Yes** |
| Governance sequence (9 steps) | **Yes** |
| Regression requirements | **Yes** |

---

## 5. Structural conflict (confirmed)

**LIVE_ARMED + dry validator PASS + full safety suite incl. N6 PASS cannot all hold simultaneously.**

Root cause: dry tooling requires `dryRunMode: true` and N6 refuses production `executionMode: LIVE`; authorized execution requires the opposite. Future execution gates must use **Domain B** armed preflight, not Domain A dry checks, after arming.

---

## 6. Approved future components (not created in this gate)

| Component | Domain |
|-----------|--------|
| `validate_armed_preflight.js` | B |
| `run_armed_preflight_manifest.js` | B |
| `test_n6_armed_estop_probe.js` | B |
| Shared posture-independent validation library | A/B/C shared |

Existing dry tooling remains **behaviorally unchanged**.

---

## 7. Explicit non-authorizations (this gate)

| Item | Status |
|------|--------|
| Implementation authorized | **No** |
| Production code change | **No** |
| Test change | **No** |
| Config / `.env` change | **No** |
| Runtime stub / new R15 session | **No** |
| Re-arming | **No** |
| Submit / broadcast | **No** |
| OR promotion / readiness claims | **No** |

---

## 8. Required output summary

| Item | Value |
|------|-------|
| **Architecture decision path** | `Decisions/DECISION — Armed-Context Preflight Architecture — 2026-07-08.md` |
| **Gate receipt path** | `ARMED-CONTEXT PREFLIGHT ARCHITECTURE DECISION — 2026-07-08.md` |
| **Decision status** | **APPROVED** |
| **Decision owner** | Taylor Cheaney |
| **Decision date** | 2026-07-08 |
| **Originating session** | `RB-G9-20260707-EV02` |
| **Originating classification** | **ABORTED_BEFORE_BROADCAST** |
| **Three-domain model adopted** | **Yes** |
| **Option B selected** | **Yes** |
| **Options A and C rejected** | **Yes** |
| **AP-01 through AP-20 adopted** | **Yes** |
| **N6 armed-safe replacement adopted** | **Yes** |
| **Armed validator contract adopted** | **Yes** |
| **Manifest-runner contract adopted** | **Yes** |
| **Evidence freshness rules adopted** | **Yes** |
| **Transition invariants adopted** | **Yes** |
| **Invalidation rules adopted** | **Yes** |
| **Governance sequence adopted** | **Yes** |
| **Regression requirements adopted** | **Yes** |
| **Implementation authorized** | **No** |
| **Production code changed** | **No** |
| **Tests changed** | **No** |
| **Configuration/environment changed** | **No** |
| **Runtime stub created** | **No** |
| **System remains disarmed** | **Yes** |
| **Submit/broadcast invoked** | **No** |
| **Position/reconciliation/recovery/capital** | **none** |
| **OR-20260630-008 status** | **not_promoted** |
| **Readiness/profitability claims** | **No** |

---

## 9. Recommended next gate

**Armed-Context Preflight Implementation Authorization**

*(Governance sign-off only — bounded scope for Option B implementation; no arming or execution.)*

---

**Receipt path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/ARMED-CONTEXT PREFLIGHT ARCHITECTURE DECISION — 2026-07-08.md`
