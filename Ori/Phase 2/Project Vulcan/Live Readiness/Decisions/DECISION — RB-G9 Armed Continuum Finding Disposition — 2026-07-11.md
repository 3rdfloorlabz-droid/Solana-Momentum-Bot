# DECISION — RB-G9 Armed Continuum Finding Disposition — 2026-07-11

Status:
**DISPOSITION COMPLETE — CORRECTION REQUIRED BEFORE ACCEPTANCE**

Decision owner:
**Taylor Cheaney** *(formal disposition per gate instruction; human sign-off on correction authorization is a separate gate)*

Disposition date:
**2026-07-11**

Disposition start UTC:
**`2026-07-12T00:01:37.331Z`**

Disposition start local (MDT):
**`Sat Jul 11 2026 18:01:37 GMT-0600 (Mountain Daylight Time)`**

Disposition completion UTC:
**`2026-07-12T00:02:21.452Z`**

Disposition completion local (MDT):
**`Sat Jul 11 2026 18:02:21 GMT-0600 (Mountain Daylight Time)`**

Affected domain:
**Project Vulcan Live Readiness · RB-G9 Armed Continuum remediation · independent-review finding disposition**

Upstream records:
[`../RB-G9 Armed Continuum Remediation Independent Review — 2026-07-11.md`](../RB-G9%20Armed%20Continuum%20Remediation%20Independent%20Review%20%E2%80%94%202026-07-11.md) · [`../RB-G9 Armed Continuum Remediation Implementation — 2026-07-11.md`](../RB-G9%20Armed%20Continuum%20Remediation%20Implementation%20%E2%80%94%202026-07-11.md) · [`../RB-G9 Armed Continuum Remediation Implementation Planning — 2026-07-11.md`](../RB-G9%20Armed%20Continuum%20Remediation%20Implementation%20Planning%20%E2%80%94%202026-07-11.md) · [`DECISION — RB-G9 AP04 Remediation Acceptance — 2026-07-11.md`](DECISION%20%E2%80%94%20RB-G9%20AP04%20Remediation%20Acceptance%20%E2%80%94%202026-07-11.md)

Capital exposure:
**none**

Decision type:
Governance · finding disposition · **not** code correction · **not** implementation acceptance · **not** AP04 authorization

---

## 1. Precondition confirmation

| Check | Result |
|-------|--------|
| Independent review result | **PASS WITH NON-BLOCKING FINDINGS** |
| Findings F1–F6 unmodified since review | **Yes** — no code/test fixes during this gate |
| AP04 session folders | **Absent** |
| AP04 authorizations | **Absent** |
| Non-rehearsal continuum execution | **Blocked** — CLI exits 11 without `--dry-rehearsal` |
| `executionMode` | `PIPELINE_DRY_RUN` |
| `dryRunMode` | `true` |
| `liveArmed` | `false` |
| Runtime stub | **Absent** |
| Executor / positions | **Zero** |
| FOMO live flags | **Not YES** |
| `.git/index.lock` | **Present · untouched** |

---

## 2. Overall disposition

**FINDINGS REQUIRE CORRECTION BEFORE ACCEPTANCE**

Implementation acceptance (remediation acceptance) is **not** authorized until F1, F2, F3, F5A, F5B, F5C, and F6 are corrected and independently re-verified. F4 is explicitly deferred with a mechanical pre-AP04 boundary.

---

## 3. Finding dispositions

### F1 — `MAX_ROLLBACK_INITIATION_DELAY_MS` not enforced

| Field | Value |
|-------|-------|
| **Disposition** | **FIX BEFORE ACCEPTANCE** |
| **Rationale** | The 5-second rollback-initiation threshold is a **mandatory accepted control**, not telemetry. Planning §7 defines it as the maximum delay from AP/N6 terminal event to ROLLBACK start. The existing `finally` path executes rollback immediately in the common case but provides **no measured enforcement**, **no violation recording**, and **no fail-closed signal** if host scheduling delays rollback beyond 5 seconds. Deferred behavior **can** be reached in authorized dry-rehearsal simulation if injected delays are introduced; the constant exists precisely to bound that risk. Acceptance without enforcement would accept a named control that is inert. |

### F2 — `DOMAIN_C_RESERVE_MS` not checked before Domain C

| Field | Value |
|-------|-------|
| **Disposition** | **FIX BEFORE ACCEPTANCE** |
| **Rationale** | The 3-minute Domain C reserve is part of the accepted timing design: N6 floor (8m) exists specifically to leave reserve for rollback + Domain C. Planning requires checking reserve before Domain C entry on the success path and recording violation when exhausted. Domain C must still execute as emergency closure even when reserve is violated, but **no PASS disposition may mask reserve failure**. Without the check, the design's layered timing proof (12m→10m→8m→3m) is incomplete and acceptance would overstate timing enforceability. |

### F3 — `assertLegalTransition` not called at runtime

| Field | Value |
|-------|-------|
| **Disposition** | **FIX BEFORE ACCEPTANCE** |
| **Rationale** | The orchestrator enforces transitions only implicitly via linear code. `armed_continuum_state.js` defines authoritative transition rules including N6→ROLLBACK on both success and failure, but **duplicate divergent logic** exists without runtime validation. An illegal transition (e.g., skip ROLLBACK, re-enter AP) would not be detected. For a one-shot safety gate, the state machine must be **runtime-authoritative** via `assertLegalTransition` at every state entry/exit. |

### F4 — No default production AP/N6 wiring

| Field | Value |
|-------|-------|
| **Disposition** | **DEFER UNTIL PRE-AP04 PRODUCTION WIRING** |
| **Deferred boundary** | See §5 |
| **Rationale** | Absence of production wiring is **acceptable for remediation acceptance of the test/simulation framework** only. The bounded implementation gate explicitly delivered injected-dependency simulation; non-rehearsal CLI is blocked; AP04 does not exist. Production AP/N6 adapters **cannot be reached** in any currently authorized state. Deferral is valid only because the boundary is explicit and mechanically enforced today. |

### F5 — Missing integration test cases

| Sub-finding | Disposition | Rationale |
|-------------|-------------|-----------|
| **F5A** — AP exactly/below 10m; N6 exactly/below 8m | **FIX BEFORE ACCEPTANCE** | Listed in implementation plan §17 mandatory integration tests. Unit timing tests do not substitute for continuum-path enforcement at AP/N6 state boundaries. |
| **F5B** — duplicate invocation | **FIX BEFORE ACCEPTANCE** | One-shot invariant is core to Proposal B. Without integration test, retry/forbidden second-run behavior is unproven in continuum context. |
| **F5C** — stale authorization in continuum path | **FIX BEFORE ACCEPTANCE** | G1 unit tests cover validator isolation; continuum PRECHECK integration with consumed/stale auth manifest is a distinct fail-closed path required by plan §17. |

### F6 — `detectMonotonicAnomaly` unused

| Field | Value |
|-------|-------|
| **Disposition** | **FIX BEFORE ACCEPTANCE** |
| **Rationale** | Monotonic anomaly detection is part of the accepted timer semantics (planning §8: sleep/resume and ambiguous timing → fail-closed). Monotonic deadline checks alone do not detect **backward** monotonic movement; a regression could theoretically extend perceived remaining time. The exported detector must be invoked at critical transitions; anomaly must force fail-closed rollback. |

---

## 4. Summary table

| Finding | Disposition |
|---------|-------------|
| F1 | **FIX BEFORE ACCEPTANCE** |
| F2 | **FIX BEFORE ACCEPTANCE** |
| F3 | **FIX BEFORE ACCEPTANCE** |
| F4 | **DEFER UNTIL PRE-AP04 PRODUCTION WIRING** |
| F5A | **FIX BEFORE ACCEPTANCE** |
| F5B | **FIX BEFORE ACCEPTANCE** |
| F5C | **FIX BEFORE ACCEPTANCE** |
| F6 | **FIX BEFORE ACCEPTANCE** |

| Category | Findings |
|----------|----------|
| **Requiring correction** | F1 · F2 · F3 · F5A · F5B · F5C · F6 |
| **Deferred** | F4 |
| **Accepted as non-blocking** | **none** |

---

## 5. F4 deferred boundary (binding)

| Rule | Requirement |
|------|-------------|
| Implementation acceptance ≠ production wiring acceptance | Remediation acceptance covers the **tested continuum framework** only |
| AP04 authorization blocked | AP04 **cannot** be authorized until real AP/N6 production adapters are implemented, tested, and independently reviewed |
| Adapter requirements | Must invoke `run_armed_preflight_manifest` once with AP-17 deferred; must invoke `runProbe` once; must preserve no-submit import boundary |
| Separate gate | **RB-G9 Armed Continuum Production Integration Authorization** *(or equivalent named gate after correction)* |
| Prohibited | No placeholder adapters · no stub wiring that reaches submit/sign/broadcast · no bypass of `--dry-rehearsal` / session-continuum-authorization guards |

---

## 6. Correction acceptance criteria

Corrections must remain within the already-authorized implementation surface:
`run_armed_continuum.js` · `armed_continuum_state.js` · `armed_continuum_timing.js` · `test_armed_continuum_timing.js` · `test_armed_continuum_integration.js` · related continuum test files.

### F1 correction criteria

- Terminal AP/N6 event records `terminalMono` timestamp
- Rollback initiation delay measured monotonically from terminal event
- Delay **> 5s** records violation in event log + receipt; does not block rollback execution
- Rollback still executes in `finally` regardless of threshold violation
- Integration test induces >5s delay and asserts violation recorded + rollback completed

### F2 correction criteria

- Before Domain C entry, `remainingMs` compared against `DOMAIN_C_RESERVE_MS` (180000)
- Exactly 3 minutes remaining: passes reserve check
- Below 3 minutes: records `DOMAIN_C_RESERVE_VIOLATION`; Domain C still executes
- PASS disposition impossible when reserve violated on success path
- Integration tests for exactly 3m and below 3m

### F3 correction criteria

- Every state transition calls `assertLegalTransition(from, to)`
- Illegal transition fails closed with `UNEXPECTED_STATE` or dedicated exit code
- Rollback remains reachable from `finally` after illegal transition detected
- Unit or integration test induces illegal transition (test hook only)

### F5 correction criteria

- **F5A:** Integration tests for AP at exactly 10m / below 10m; N6 at exactly 8m / below 8m; meaningful clock injection; no tautological mocks
- **F5B:** Duplicate `runArmedContinuum` invocation with same `continuumRunId` or overlapping session fails closed; no second C1 mutation
- **F5C:** Continuum PRECHECK rejects consumed/stale G1 or auth manifest; exit `AUTHORIZATION_INVALID`; no arming mutation

### F6 correction criteria

- `detectMonotonicAnomaly` invoked before/after STUB, AP, N6, and at rollback entry
- Backward monotonic step forces fail-closed path with rollback
- Test simulates monotonic regression and sleep/resume anomaly
- No silent extension of armed window

---

## 7. What this disposition does not authorize

- Code changes
- AP04 session or G1–G4
- Arming · stub · live continuum · AP/N6
- Implementation acceptance
- Strategy readiness
- OR promotion

---

## 8. Strategy and OR status

| Field | Value |
|-------|-------|
| Strategy readiness | **NOT READY** |
| OR-20260630-008 | **not_promoted** |
| AP04 authorized | **no** |

---

## 9. Recommended next gate

**RB-G9 Armed Continuum Remediation Findings Correction Authorization**

---

**Canonical path:**  
`Ori/Phase 2/Project Vulcan/Live Readiness/Decisions/DECISION — RB-G9 Armed Continuum Finding Disposition — 2026-07-11.md`

Operating principle: Strength through honesty, speed through integrity.
