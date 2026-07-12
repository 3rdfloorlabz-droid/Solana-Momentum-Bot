# DECISION — RB-G9 Armed Continuum Remediation Acceptance — 2026-07-11

Status:
**REMEDIATION ACCEPTED WITH REQUIRED PRE-INTEGRATION FOLLOW-UPS**

Decision owner:
**Taylor Cheaney**

Decision date:
**2026-07-11**

Decision start UTC:
**`2026-07-12T02:29:38.301Z`**

Decision start local (MDT):
**`Sat Jul 11 2026 20:29:38 GMT-0600 (Mountain Daylight Time)`**

Decision completion UTC:
**`2026-07-12T02:30:01.288Z`**

Decision completion local (MDT):
**`Sat Jul 11 2026 20:30:01 GMT-0600 (Mountain Daylight Time)`**

Affected domain:
**Project Vulcan Live Readiness · RB-G9 Armed Continuum remediation · simulation/framework acceptance**

Upstream records:
[`DECISION — RB-G9 AP04 Remediation Acceptance — 2026-07-11.md`](DECISION%20%E2%80%94%20RB-G9%20AP04%20Remediation%20Acceptance%20%E2%80%94%202026-07-11.md) · [`../RB-G9 Armed Continuum Remediation Implementation Planning — 2026-07-11.md`](../RB-G9%20Armed%20Continuum%20Remediation%20Implementation%20Planning%20%E2%80%94%202026-07-11.md) · [`../RB-G9 Armed Continuum Remediation Implementation — 2026-07-11.md`](../RB-G9%20Armed%20Continuum%20Remediation%20Implementation%20%E2%80%94%202026-07-11.md) · [`../RB-G9 Armed Continuum Remediation Independent Review — 2026-07-11.md`](../RB-G9%20Armed%20Continuum%20Remediation%20Independent%20Review%20%E2%80%94%202026-07-11.md) · [`DECISION — RB-G9 Armed Continuum Finding Disposition — 2026-07-11.md`](DECISION%20%E2%80%94%20RB-G9%20Armed%20Continuum%20Finding%20Disposition%20%E2%80%94%202026-07-11.md) · [`../RB-G9 Armed Continuum Remediation Findings Correction — 2026-07-11.md`](../RB-G9%20Armed%20Continuum%20Remediation%20Findings%20Correction%20%E2%80%94%202026-07-11.md) · [`../RB-G9 Armed Continuum Remediation Findings Independent Re-Review — 2026-07-11.md`](../RB-G9%20Armed%20Continuum%20Remediation%20Findings%20Independent%20Re-Review%20%E2%80%94%202026-07-11.md)

Capital exposure:
**none**

Decision type:
Governance · remediation framework acceptance · **not** F4 production integration · **not** AP04 authorization · **not** arming · **not** live execution

---

## 1. Decision summary

Taylor **accepts** the RB-G9 Armed Continuum remediation **framework** as implemented, tested, corrected, and independently re-reviewed, **with required pre-production-integration follow-ups** before any F4 adapter work or AP04 advancement.

This decision **does not** authorize:

- F4 production AP/N6 adapter wiring
- AP04 session creation or activation
- G1–G4 creation or signing
- process isolation for AP04
- arming / C1–C3 live mutation
- runtime stub creation (live)
- live continuum execution
- live AP / N6 invocation
- transaction-capable paths
- bounded micro-live activity
- OR-20260630-008 promotion
- strategy readiness or profitability claims

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

---

## 2. Precondition confirmation

| Check | Result |
|-------|--------|
| Implementation receipt reviewed | **Yes** |
| Initial independent review reviewed | **Yes** |
| Finding disposition reviewed | **Yes** |
| Findings correction receipt reviewed | **Yes** |
| Independent re-review reviewed | **Yes** |
| F1–F3, F5A–F6 closed | **Yes** |
| F4 deferred | **Yes** |
| Blocking findings | **0** |
| Unsafe findings | **0** |
| Regressions | **0** |
| AP04 session exists | **No** |
| AP04 authorizations exist | **No** |
| Production disarmed | **Yes** |
| `.git/index.lock` | **Present · untouched** |

---

## 3. Conformance results

| Domain | Result |
|--------|--------|
| **Design conformance** | **CONFORMANT** |
| **Safety conformance** | **CONFORMANT** |
| **Test sufficiency** | **SUFFICIENT FOR FRAMEWORK SCOPE** |

### 3.1 Design conformance (accepted design A + B + C)

| Requirement | Result |
|-------------|--------|
| **A. Proof-day G1** — local enforcement, block+60m expiry, stale/reused/consumed rejection | **Conformant** |
| **B. Single Armed Continuum framework** — one process, one invocation, no retry, pre-continuum isolation, C1→stub→AP→N6→rollback→Domain C, no chat handoff, machine evidence only | **Conformant** (simulation/dry-rehearsal scope) |
| **C. Timing model** — 15m cap, ≥12m post-stub, ≥10m AP, ≥8m N6, 3m Domain C reserve, 5s rollback initiation, monotonic anomaly enforcement | **Conformant** |

### 3.2 Safety conformance

| Requirement | Result |
|-------------|--------|
| No-submit import boundary clean | **Yes** |
| No signer / quote / candidate / tx / RPC send reachability | **Yes** |
| Rollback mandatory after C1 mutation | **Yes** |
| Domain C runs on reserve violation | **Yes** |
| Receipt failure cannot block rollback execution | **Yes** |
| Duplicate invocation fails closed | **Yes** |
| Stale/consumed auth fails before C1 | **Yes** |
| Non-rehearsal execution blocked | **Yes** |

### 3.3 Test sufficiency (framework scope)

| Requirement | Result |
|-------------|--------|
| Edge thresholds tested | **Yes** — 16/16 timing + integration edge cases |
| Failure paths tested | **Yes** |
| Duplicate invocation tested | **Yes** |
| Stale/consumed authorization tested | **Yes** (consumed continuum path; stale via G1 unit + shared precheck) |
| Monotonic anomaly tested | **Yes** |
| Violations cannot produce PASS | **Yes** — F1/F2 enforcement downgrades PASS |
| Tests preserve disarmed/no-submit/no-capital invariants | **Yes** |

Independent test totals confirmed: timing **16/16** · events **3/3** · rollback **2/2** · integration **28/28** · G1 **5/5** · continuum **54/54** · preflight unit **PASS** · regression **49/49** · safety **85/85**.

---

## 4. Finding status at acceptance

| Finding | Status |
|---------|--------|
| F1 | **CLOSED — VERIFIED** |
| F2 | **CLOSED — VERIFIED** |
| F3 | **CLOSED — VERIFIED** |
| F4 | **DEFERRED — PRODUCTION INTEGRATION NOT AUTHORIZED** |
| F5A | **CLOSED — VERIFIED** |
| F5B | **CLOSED — VERIFIED** |
| F5C | **CLOSED — VERIFIED** |
| F6 | **CLOSED — VERIFIED** |

---

## 5. Re-review observation dispositions

| # | Observation | Disposition |
|---|-------------|-------------|
| **1** | Forward-jump monotonic anomaly not wired at orchestrator checkpoints | **ACCEPT AS NON-BLOCKING** for remediation acceptance · **REQUIRE FOLLOW-UP BEFORE PRODUCTION INTEGRATION** |
| **2** | Stale G1 not duplicated as second continuum integration test | **ACCEPT AS NON-BLOCKING** for remediation acceptance · **REQUIRE FOLLOW-UP BEFORE PRODUCTION INTEGRATION** |
| **3** | Illegal pre-C1 transition not integration-tested | **ACCEPT AS NON-BLOCKING** for remediation acceptance · **REQUIRE FOLLOW-UP BEFORE PRODUCTION INTEGRATION** |

---

## 6. F4 boundary (binding)

| Rule | Requirement |
|------|-------------|
| Remediation acceptance ≠ production wiring acceptance | Framework/simulation scope only |
| AP04 blocked | AP04 **cannot** be opened until F4 real adapters are implemented and independently reviewed |
| No placeholder adapters | Prohibited |
| Separate gate | **RB-G9 Armed Continuum Production Integration Authorization** (or equivalent) required |
| No AP03 reuse | No AP04 artifact may reuse AP03 evidence or authority |
| Adapter requirements | Real `run_armed_preflight_manifest` (AP-17 deferred) + real `runProbe`; no-submit boundary preserved |

---

## 7. Governance-integrity dependency

**NON-BLOCKING FOR REMEDIATION ACCEPTANCE; REQUIRED BEFORE AP04 AUTHORIZATION**

Rationale: Machine receipts, source, and test output are primary acceptance evidence. Canonical repo-local Ori governance records remain untracked; integrity gate must precede AP04 authorization even though framework acceptance is valid today.

---

## 8. Accepted scope

| Accepted | Not accepted |
|----------|--------------|
| Framework implementation | Production AP/N6 integration (F4) |
| Timing controls (15m/12m/10m/8m/3m/5s) | AP04 session |
| Rollback controls | Arming |
| State machine (`assertLegalTransition`) | Live execution |
| Event log (append-only JSONL) | Transaction-capable behavior |
| Machine receipts | Strategy readiness |
| Completed test scope (54/54 continuum + safety 85/85) | OR promotion |
| Dry-rehearsal execution | Bounded micro-live |
| Simulated AP/N6 adapter interfaces | |
| No-submit architecture | |
| Proof-day G1 validator | |

---

## 9. Mandatory pre-production-integration follow-ups

Before F4 production integration or AP04 planning:

1. **F4 real AP adapter design** — one-shot `run_armed_preflight_manifest` with AP-17 deferred
2. **F4 real N6 adapter design** — one-shot armed-safe `runProbe`
3. **Independent no-submit import review** of adapter wiring
4. **Forward-jump anomaly disposition** — orchestrator-level wiring decision before production integration
5. **Stale-G1 continuum integration coverage disposition** — explicit test or equivalence proof before production integration
6. **Illegal pre-C1 transition coverage disposition** — explicit integration test or equivalence proof before production integration
7. **Governance record-integrity gate** — canonical Ori tracking before AP04 authorization
8. **Current machine posture revalidation** — disarmed baseline at integration authorization time
9. **Fresh session and authorization design** — AP04-class session; no AP03 evidence reuse

---

## 10. What this decision authorizes

- Reference the accepted continuum framework in future planning gates
- Proceed to governance record-integrity planning (recommended next)
- Proceed later to F4 production-integration planning (after follow-ups and separate authorization)

## 11. What this decision does not authorize

- Any item listed in §1 decision summary exclusion list
- Claim that AP04 is ready
- Claim that production continuum may execute

---

## 12. Recommended next gate

**RB-G9 Governance Record Integrity Planning**

Reason: Framework accepted; AP04 must not advance while canonical repo-local Ori records remain entirely untracked.

---

**Canonical path:**  
`Ori/Phase 2/Project Vulcan/Live Readiness/Decisions/DECISION — RB-G9 Armed Continuum Remediation Acceptance — 2026-07-11.md`

Operating principle: Strength through honesty, speed through integrity.
