# DECISION — Armed No-Submit Production Proof — 2026-07-09

Status:
**APPROVED**

Decision owner:
**Taylor Cheaney**

Decision date:
**2026-07-09**

Affected domain:
**Project Vulcan Live Readiness · Domain B production-host proof**

Originating issue:
**Production Domain B armed-context preflight not yet established on LIVE_ARMED production host**

Linked architecture decision:
[`DECISION — Armed-Context Preflight Architecture — 2026-07-08.md`](DECISION%20%E2%80%94%20Armed-Context%20Preflight%20Architecture%20%E2%80%94%202026-07-08.md)

Planning reference:
[`../ARMED-CONTEXT ARMED NO-SUBMIT PROOF PLANNING — 2026-07-09.md`](../ARMED-CONTEXT%20ARMED%20NO-SUBMIT%20PROOF%20PLANNING%20%E2%80%94%202026-07-09.md)

Gate receipt:
[`../ARMED-CONTEXT ARMED NO-SUBMIT PROOF DECISION — 2026-07-09.md`](../ARMED-CONTEXT%20ARMED%20NO-SUBMIT%20PROOF%20DECISION%20%E2%80%94%202026-07-09.md)

Capital exposure:
**none**

Decision type:
Governance · production armed no-submit proof policy · prerequisite remediation policy

---

## 1. Decision summary

Taylor **approves** exactly **one future production-host armed no-submit proof session** under the constraints in this decision, and **approves** the prerequisite remediation policy required before any proof may be authorized or executed.

This decision **does not** authorize prerequisite implementation, arming, runtime stub creation, proof execution, live trading, or strategy readiness.

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

---

## 2. Proof scope (approved)

| In scope | Out of scope |
|----------|--------------|
| One temporary LIVE_ARMED production-host session | Candidate selection |
| Maximum **15 minutes** armed duration | Final per-trade confirmation |
| C1–C3 arming transition only | Submit · sign · broadcast |
| AP-01 through AP-20 production-host proof | Transaction signature |
| Armed-safe N6 probe (AP-17) | Position · reconciliation · recovery · capital |
| Immediate disarm + Domain C closure | Executor loop |
| | Micro-live execution gate |
| | Proof session reuse |

---

## 3. Session identity (approved)

| Field | Decision |
|-------|----------|
| **Format** | `RB-G9-{YYYYMMDD}-AP01` |
| **Uniqueness** | One proof attempt per session ID; non-reusable |
| **Prohibited reuse** | `RB-G9-20260706-EV01` · `RB-G9-20260707-EV02` |
| **Flow-through requirement** | Session ID must appear in G1–G4 authorizations, runtime stub, AP receipts, manifest receipts, N6 evidence, and RB-G9 session folder |

---

## 4. authorizationDocs() remediation (approved)

Taylor **approves** replacing hardcoded EV02 authorization paths with **session-scoped, explicitly supplied document linkage**.

### Required authorization classes (G1–G4)

| Key | Class | Required |
|-----|-------|----------|
| **G1** | Fresh R15 engineering-validation authorization | Yes |
| **G2** | Arming authorization | Yes |
| **G3** | Runtime R15 stub creation authorization | Yes |
| **G4** | **Armed No-Submit Proof Authorization** | Yes |

### Fail-closed rules

- Missing · duplicate · stale · mismatched · or cross-session document → **FAIL**
- **No fallback** to EV02 or any prior session
- **No** broad directory scan that silently selects “latest” authorization
- **No** implicit default paths when `--session-id` is supplied

Implementation of this remediation requires a separate **Proof-Prerequisite Implementation Authorization** — not authorized by this decision.

---

## 5. CLI remediation (approved)

Taylor **approves** narrowly scoped CLI flags on Domain B entrypoints:

| Flag | Required behavior |
|------|-------------------|
| `--session-id` | Explicit session ID; no EV02 default |
| `--arming-baseline-hash` | Explicit SHA-256 at C3 completion |
| Optional explicit auth doc paths or session manifest path | Only if required by implementation; all paths explicit |

### Requirements

- Explicit values mandatory for production proof
- No environment-only hidden session selection
- Machine-readable echo of non-secret argument values in receipt fingerprints
- Fail closed on missing or malformed values
- No `--force-checks` or waiver flags on production CLI

---

## 6. AP-02 behavior (approved)

AP-02 must validate the **proof-specific G1–G4 authorization chain**:

| Rule | Detail |
|------|--------|
| **G4 type** | **Armed No-Submit Proof Authorization** |
| **Not acceptable** | Micro-Live Execution Authorization must **not** satisfy G4 |
| **G4 content** | Must explicitly prohibit execution and capital exposure |
| **Session linkage** | All four documents must reference the same session ID |
| **Fail conditions** | Wrong authorization type · mixed session linkage · unsigned · expired · reused |

The `microLive` adapter key (if retained internally) must map to G4 proof authorization for AP01 sessions — not EV02 micro-live execution records.

---

## 7. AP-15 behavior (approved)

Taylor **selects** canonical handling:

### `NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE`

Candidate-specific execution bounds are **not applicable** during the no-submit proof. AP-15 must **not** be reported as PASS without candidate evidence.

### Mandatory replacement evidence (receipt fields)

| Field | Required value / assertion |
|-------|---------------------------|
| `replacementEvidenceId` | `armed-no-submit-proof-scope` |
| `noCandidateSelected` | `true` |
| `noQuoteRequestedForExecution` | `true` |
| `noTradeMetadataPresent` | `true` |
| `positionSizeSolCap` | `0.005` *(unchanged global cap)* |
| `maxSlippageBps` | `100` *(1% — unchanged)* |
| `automationCandidateHandoffDisabled` | `true` *(monitor/scanner stopped)* |
| `noScaling` | `true` |
| `proofAuthorizationProhibitsExecution` | `true` |
| `runtimeStubPurpose` | `armed_no_submit_proof_only` |
| `executionPathCallCount` | `0` |
| `rationale` | Explicit no-submit proof scope statement |

### Explicitly prohibited

- Fabricated candidate fixtures represented as production evidence
- AP-15 reported as **PASS** during no-submit proof
- Silently omitting AP-15
- Weakening execution bounds for later live sessions

Prerequisite implementation must add AP-15 no-submit proof branch — not authorized by this decision alone.

---

## 8. Runtime stub purpose (approved)

| Field | Requirement |
|-------|-------------|
| **Purpose** | `armed_no_submit_proof_only` |
| **Forbidden** | Candidate fields · trade authorization · execution permission |
| **Scope** | ONE_SESSION_ONLY |
| **Expiry** | Bounded (≤ armed window + 15 minutes) |
| **Storage** | Gitignored `analysis/r15_manual_approval_record.json` |
| **Content** | Secret-free |
| **Removal** | Immediately after proof or abort |

---

## 9. First-proof process policy (approved)

| Process | Policy |
|---------|--------|
| `monitor.js` | **Stop** before arming |
| `scanner_gmgn_trending.js --watch` | **Stop** before arming |
| `live_executor.js` processes | **Zero** before, during, and after proof |
| Automatic restart | Verify **none** during proof window |
| Post-closure restart | Separate operator action only — after Domain C PASS |

---

## 10. Evidence freshness (approved)

| Evidence | Max age / rule |
|----------|----------------|
| Domain A dry proof before arming | ≤ **30 minutes** |
| Authorization chain at arming | Valid · signed · session-matched |
| Armed AP receipts | ≤ **15 minutes** at disarm sign-off |
| Maximum armed duration | **15 minutes** from C3 |
| Drift | Any code/config/process/auth drift invalidates proof |

---

## 11. Proof classifications (approved)

| Classification | Use |
|----------------|-----|
| `ARMED_NO_SUBMIT_PROOF_PASS` | All criteria met · disarm + Domain C green |
| `ABORTED_BEFORE_ARMING` | Pre-C1 abort |
| `ABORTED_WHILE_ARMED_NO_BROADCAST` | Armed abort · no broadcast · disarm completed |
| `UNRESOLVED_STATE` | Ambiguous state — incident treatment |

**Forbidden:** Any trade-completion or execution-success classification.

---

## 12. Mandatory rollback (approved)

After proof or abort:

1. Reverse C1–C3
2. Remove runtime stub
3. Confirm `liveArmed: false` · `PIPELINE_OBSERVING`
4. Confirm zero executor loops
5. Confirm flat / no reconciliation / recovery / capital
6. Domain C: `validate_live_system.js` PASS
7. Domain C: `run_safety_tests.js` **85/85** PASS
8. RB-G9 closure under session folder
9. Mark G1–G4 authorizations **CONSUMED/CLOSED**

---

## 13. Rejected approaches

Taylor **rejects**:

| # | Rejected approach |
|---|-------------------|
| R1 | Proving armed mode with a Micro-Live Execution Authorization |
| R2 | Reusing EV02 authorization documents |
| R3 | Hardcoded authorization paths (current `authorizationDocs()` EV02 linkage) |
| R4 | Implicit “latest authorization” directory selection |
| R5 | Generic authorization bypass or waiver flags |
| R6 | AP-15 as PASS without candidate evidence during no-submit proof |
| R7 | Candidate selection during proof |
| R8 | Any submit-capable executor loop process during proof |
| R9 | Armed duration extension within same session |
| R10 | Proof session ID reuse |

---

## 14. Prerequisite governance sequence (approved)

| # | Gate / action |
|---|---------------|
| 1 | Armed No-Submit Proof Decision *(this decision)* |
| 2 | Proof-Prerequisite Implementation Authorization |
| 3 | Proof-Prerequisite Implementation Gate |
| 4 | Proof-Prerequisite Regression Gate |
| 5 | Fresh Domain A Dry Proof |
| 6 | Fresh proof-session R15 planning and authorization |
| 7 | Arming Authorization |
| 8 | Runtime Stub Creation Authorization |
| 9 | Armed No-Submit Proof Authorization |
| 10 | Arming transition |
| 11 | Stub creation |
| 12 | Armed no-submit proof |
| 13 | Immediate disarm and Domain C closure |
| 14 | RB-G9 |
| 15 | Runbook/governance update |

---

## 15. Architecture boundaries (explicit non-authorizations)

This decision **does not**:

- Authorize prerequisite implementation
- Authorize arming or stub creation
- Create a proof session or authorizations
- Approve live execution or micro-live trading
- Establish strategy readiness
- Promote OR-20260630-008

Prerequisite implementation is authorized only by a future **Proof-Prerequisite Implementation Authorization** gate.

---

## 16. Current implementation gaps (documented, not remediated)

| Gap | Location | Remediation gate |
|-----|----------|------------------|
| EV02 hardcoded auth paths | `armed_preflight_checks.js:88–93` | Proof-Prerequisite Implementation Gate |
| No CLI `--session-id` / `--arming-baseline-hash` | `validate_armed_preflight.js:70–77` | Proof-Prerequisite Implementation Gate |
| AP-02 expects `microLive` doc | `armed_preflight_checks.js:163–182` | Proof-Prerequisite Implementation Gate |
| AP-15 requires candidate packet for PASS | `armed_preflight_checks.js:302–320` | Proof-Prerequisite Implementation Gate |

**None of these gaps may be improvised during the proof gate.**

---

**Canonical decision path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Decisions/DECISION — Armed No-Submit Production Proof — 2026-07-09.md`
