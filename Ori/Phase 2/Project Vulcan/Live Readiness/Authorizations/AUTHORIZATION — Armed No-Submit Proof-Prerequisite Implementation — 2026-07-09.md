# AUTHORIZATION — Armed No-Submit Proof-Prerequisite Implementation — 2026-07-09

> **IMPLEMENTATION AUTHORIZATION ONLY**
>
> **NO CODE CREATED IN THIS GATE**
>
> **NO EXISTING TOOLING MODIFIED**
>
> **SYSTEM NOT RE-ARMED**
>
> **NO RUNTIME STUB · NO PROOF SESSION · NO R15/ARMING/PROOF AUTHORIZATION CHAIN · NO CAPITAL EXPOSURE**
>
> This record authorizes **one future governed implementation gate** to resolve the four approved armed no-submit proof prerequisites per the signed proof decision. It **does not** implement code, alter production posture, create proof-session authorizations, re-arm the system, or authorize the armed no-submit proof.

---

## Record metadata

| Field | Value |
|-------|-------|
| **Gate name** | Armed No-Submit Proof-Prerequisite Implementation Authorization |
| **Record type** | Implementation Authorization · Governance-only |
| **Status** | **SIGNED — APPROVED — NOT IMPLEMENTED — NO CAPITAL EXPOSURE** |
| **Signer** | **Taylor Cheaney** |
| **Signature date** | **2026-07-09** |
| **Linked proof decision** | [`../Decisions/DECISION — Armed No-Submit Production Proof — 2026-07-09.md`](../Decisions/DECISION%20%E2%80%94%20Armed%20No-Submit%20Production%20Proof%20%E2%80%94%202026-07-09.md) |
| **Decision gate receipt** | [`../ARMED-CONTEXT ARMED NO-SUBMIT PROOF DECISION — 2026-07-09.md`](../ARMED-CONTEXT%20ARMED%20NO-SUBMIT%20PROOF%20DECISION%20%E2%80%94%202026-07-09.md) |
| **Planning reference** | [`../ARMED-CONTEXT ARMED NO-SUBMIT PROOF PLANNING — 2026-07-09.md`](../ARMED-CONTEXT%20ARMED%20NO-SUBMIT%20PROOF%20PLANNING%20%E2%80%94%202026-07-09.md) |
| **Linked architecture decision** | [`../Decisions/DECISION — Armed-Context Preflight Architecture — 2026-07-08.md`](../Decisions/DECISION%20%E2%80%94%20Armed-Context%20Preflight%20Architecture%20%E2%80%94%202026-07-08.md) |
| **Proof session format** | `RB-G9-{YYYYMMDD}-AP01` *(not created by this authorization)* |
| **Capital exposure** | **none** |
| **EV01/EV02 reuse** | **Forbidden** |
| **OR-20260630-008** | **not_promoted** |
| **Strategy readiness** | **NOT READY** |
| **Gate receipt** | [`../ARMED NO-SUBMIT PROOF-PREREQUISITE IMPLEMENTATION AUTHORIZATION — 2026-07-09.md`](../ARMED%20NO-SUBMIT%20PROOF-PREREQUISITE%20IMPLEMENTATION%20AUTHORIZATION%20%E2%80%94%202026-07-09.md) |
| **Safety baseline (disarmed)** | Domain A dry proof **PASS** · armed-preflight regression **PASS** |

---

## 1. What this signed record authorizes

Taylor authorizes **exactly one future gate**:

**Armed No-Submit Proof-Prerequisite Implementation Gate**

That gate may implement **only** the four approved prerequisite remediations (Sections A–D below) plus narrowly scoped supporting artifacts.

**Invariant:** This sign-off ≠ prerequisite implementation complete ≠ armed proof ≠ proof session created.

---

## 2. Authorized implementation scope (Implementation Gate only)

### A. Session-scoped authorization linkage

Replace EV02-hardcoded `authorizationDocs()` behavior with explicit session-scoped document inputs.

| Requirement | Detail |
|-------------|--------|
| **G1** | Fresh R15 engineering-validation authorization |
| **G2** | Arming authorization |
| **G3** | Runtime R15 stub creation authorization |
| **G4** | **Armed No-Submit Proof Authorization** |
| **Session binding** | All four documents must reference the **same** session ID |
| **Fail closed** | Missing · duplicate · stale · mismatched · cross-session → **FAIL** |
| **Rejected** | EV01/EV02 fallback · “latest document” selection · broad directory guessing |

### B. CLI remediation

Add to Domain B entrypoints (`validate_armed_preflight.js` · `run_armed_preflight_manifest.js`):

| Flag | Requirement |
|------|-------------|
| `--session-id` | Explicit · required for session-scoped proof mode |
| `--arming-baseline-hash` | Explicit SHA-256 at arming baseline |
| Optional explicit auth doc paths or one session-manifest path | Only if required · all paths explicit |

| Rule | Detail |
|------|--------|
| **No hidden defaults** | No EV02 default session |
| **No env-only selection** | Session must not be selected from environment alone |
| **Receipt echo** | Non-secret normalized arguments only in fingerprints |
| **Malformed/missing** | Fail closed |

### C. AP-02 proof mapping

AP-02 must validate proof-specific G1–G4 chain:

| Rule | Detail |
|------|--------|
| **G4 type** | Armed No-Submit Proof Authorization |
| **Not acceptable** | Micro-Live Execution Authorization **cannot** satisfy G4 |
| **G4 content** | Must explicitly prohibit submit · sign · broadcast · candidate selection · capital exposure |
| **Fail** | Wrong authorization type · mixed session linkage |

### D. AP-15 proof handling

When proof scope is active (no-submit proof session):

| Field | Value |
|-------|-------|
| **Status** | `NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE` |
| **Replacement evidence ID** | `armed-no-submit-proof-scope` |

**Required evidence fields:**
- `noCandidateSelected: true`
- `noExecutionQuoteRequested: true`
- `noTradeMetadata: true`
- `positionSizeSolCap: 0.005` *(unchanged)*
- `maxSlippageBps: 100` *(unchanged)*
- `automationCandidateHandoffDisabled: true` *(G3 / monitor-scanner stop policy)*
- `noScaling: true`
- `runtimeStubPurpose: armed_no_submit_proof_only`
- `proofAuthorizationProhibitsExecution: true`
- `executionPathCallCount: 0`

**Prohibited:** AP-15 as **PASS** · silent omission · fabricated candidate fixtures · weakening later live candidate checks

---

## 3. Authorized supporting scope

| Item | Scope |
|------|-------|
| Narrowly focused regression tests | Prerequisite contract enforcement |
| Deterministic fixtures | Session-scoped auth doc fixtures · AP-15 N/A fixtures |
| Machine-readable receipts | Secret-free JSON |
| Minimal command documentation | `docs/ARMED_PREFLIGHT.md` additive updates only |
| Package scripts | **Only** if required to invoke new tests or flags |

---

## 4. Explicit prohibitions (Implementation Gate must not)

| Prohibition |
|-------------|
| Broad waiver flags or generic skip lists |
| “Latest authorization” discovery or directory scan defaults |
| Session ID default to EV02 or any prior session |
| EV02 compatibility fallback paths |
| AP-15 PASS without candidate evidence during no-submit proof scope |
| Weakening of later live-session candidate bounds checks |
| Any `enterPosition` · `exitPosition` · `submitSwap` · `sendTransaction` · `sendRawTransaction` · or signing call |
| Production re-arming or C1–C3 transition |
| Runtime stub creation |
| New proof session folder or G1–G4 proof authorization creation |
| Modification of Domain A tooling (`validate_live_system.js` · `run_safety_tests.js` · `test_n6_estop_drill.js`) |
| OR promotion or readiness/profitability claims |

---

## 5. Preservation requirements

| Requirement | Detail |
|-------------|--------|
| Domain A behavior | **Unchanged** |
| Safety suite | **85/85** manifest and behavior unchanged |
| Armed-preflight regression | Existing proof remains valid |
| Wrong-posture exit | Production dry posture still exit **2** |
| N6 dry drill | Unchanged |
| N6 armed probe | Wrong-posture fail-closed preserved |
| No-submit guarantees | Preserved across all non-proof contexts |

---

## 6. Required regression tests (Implementation Gate)

The Implementation Gate must add or extend tests proving:

| # | Test requirement |
|---|------------------|
| **T1** | Explicit session ID required when session-scoped mode active |
| **T2** | Explicit baseline hash required when session-scoped mode active |
| **T3** | EV02 fallback rejected |
| **T4** | Mixed-session documents rejected |
| **T5** | Missing G1/G2/G3/G4 rejected |
| **T6** | Duplicate authorization type rejected |
| **T7** | Wrong G4 type rejected |
| **T8** | Micro-Live Execution Authorization cannot satisfy G4 |
| **T9** | Stale/expired authorization rejected |
| **T10** | Malformed CLI argument rejected |
| **T11** | Hidden/default session selection absent |
| **T12** | AP-15 emits exact `NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE` |
| **T13** | AP-15 replacement evidence ID exact: `armed-no-submit-proof-scope` |
| **T14** | AP-15 replacement evidence complete |
| **T15** | AP-15 missing evidence fails aggregate |
| **T16** | AP-15 cannot report PASS in no-submit proof scope |
| **T17** | No execution function invoked in prerequisite test suite |
| **T18** | No secret appears in stdout · stderr · receipts · fixtures |

---

## 7. Implementation Gate operating constraints

| Constraint | Requirement |
|------------|-------------|
| **Posture** | Production remains **fully disarmed** for entire gate |
| **Stop before** | Fresh dry proof · proof-session planning · G1–G4 authorization creation · production arming |
| **Config** | No `live_config.json` or `.env` mutation |
| **Capital** | No position · reconciliation · recovery · capital exposure |

---

## 8. Later required gates (not authorized here)

| # | Gate |
|---|------|
| 1 | Proof-Prerequisite Implementation Gate *(authorized by this record)* |
| 2 | Proof-Prerequisite Regression Gate |
| 3 | Fresh Domain A Dry Proof |
| 4 | Fresh proof-session R15 planning |
| 5 | Proof authorization chain (G1–G4 for proof session) |
| 6 | Armed no-submit proof execution |
| 7 | Immediate Domain C closure + RB-G9 |

---

## 9. Signature block

| Field | Value |
|-------|-------|
| **Authorized by** | **Taylor Cheaney** |
| **Date** | **2026-07-09** |
| **Scope** | One Proof-Prerequisite Implementation Gate only |
| **Capital exposure** | **none** |
| **Arming** | **not authorized** |
| **Proof execution** | **not authorized** |

---

**Canonical authorization path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — Armed No-Submit Proof-Prerequisite Implementation — 2026-07-09.md`
