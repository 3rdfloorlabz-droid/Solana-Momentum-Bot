# DECISION — RB-G9 AP04 Remediation Acceptance — 2026-07-11

Status:
**ACCEPTED AS DESIGNED**

Decision owner:
**Taylor Cheaney**

Decision date:
**2026-07-11**

Decision start UTC:
**`2026-07-11T23:01:59.024Z`**

Decision start local (MDT):
**`Sat Jul 11 2026 17:01:59 GMT-0600 (Mountain Daylight Time)`**

Affected domain:
**Project Vulcan Live Readiness · AP04-class timing remediation · future armed no-submit proof retry policy**

Planning receipt:
[`../RB-G9 AP04 Timing Remediation and Proof Retry Planning — 2026-07-11.md`](../RB-G9%20AP04%20Timing%20Remediation%20and%20Proof%20Retry%20Planning%20%E2%80%94%202026-07-11.md)

Primary machine evidence reviewed:
`analysis/rb_g9_20260711_ap03_emergency_domain_c_closure_receipt.json` · `analysis/rb_g9_20260711_ap03_armed_no_submit_proof_receipt.json` · `analysis/rb_g9_20260711_ap03_runtime_stub_creation_receipt.json` · `analysis/rb_g9_20260713_ap02_expired_g1_closure_receipt.json` · `analysis/rb_g9_20260713_ap02_fresh_r15_authorization_receipt.json`

Capital exposure:
**none**

Decision type:
Governance · remediation design acceptance · **not** implementation authorization · **not** AP04 session authorization

---

## 1. Decision summary

Taylor **accepts as designed** the AP04 timing-remediation package (**A + B + C**), with **D deferred** and **E / F rejected**, as specified in the planning receipt and confirmed below.

This decision **does not** authorize:

- AP04 session creation or activation
- G1–G4 or process-isolation authorization creation or sign-off
- code implementation
- arming / C1–C3
- runtime stub creation
- AP / N6 invocation
- process start/stop
- Git stage/commit or `.git/index.lock` clearance
- OR promotion
- readiness or profitability claims

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

---

## 2. Precondition confirmation

| Check | Result |
|-------|--------|
| Planning receipt reviewed | **Yes** |
| AP02/AP03 machine evidence reviewed | **Yes** |
| AP04 session exists | **No** |
| AP04 authorizations exist | **No** |
| Arming / LIVE_ARMED | **No** · production disarmed |
| Runtime stub | **Absent** |
| AP / N6 | **Not invoked** |
| `.git/index.lock` | **Present · untouched** |

---

## 3. Decision questions

| # | Question | Answer |
|---|----------|--------|
| **1** | Does proof-day-only G1 adequately eliminate the AP02 timing defect? | **Yes** |
| **2** | Is the 60-minute post-block expiry margin sufficient? | **Yes** — closure/reserve margin; not a substitute for Domain C immediacy |
| **3** | Does the Single Armed Continuum Gate eliminate the AP03 chat/handoff delay? | **Yes** — eliminates that delay *class* when enforced |
| **4** | Is retaining the 15-minute cap justified with ≥12 minutes remaining after stub? | **Yes** — contingent on automatic continuum (no handoff) |
| **5** | Is the two-minute margin (12→10) adequate for automatic transition only? | **Yes** — **only** for automatic stub→AP tooling start; **not** for Chat/UI handoff |
| **6** | Should the 20-minute option remain deferred until deterministic timing tests exist? | **Yes** |
| **7** | Are E and F correctly rejected? | **Yes** |
| **8** | Is the package ready for implementation planning without authorizing AP04? | **Yes** |

---

## 4. Proposal dispositions

### Proposal A — Proof-day G1 rule — **ACCEPTED**

| Element | Decision |
|---------|----------|
| Sign G1 only on proof day | **Accepted** |
| Expiry covers complete operating block | **Accepted** |
| Expiry ≥ block end + **60 minutes** | **Accepted** |
| Fail-closed: proof day not reached | **Accepted** |
| Fail-closed: expiry before block end + reserve | **Accepted** |
| Fail-closed: timezone mismatch / stale / reused G1 | **Accepted** |

**Safety benefit:** Removes AP02 class defect (expiry before block).  
**Edge cases carried into implementation planning:** explicit UTC conversion rules for Mountain Time (including DST), single source of truth for block start/end UTC, mechanical rejection of ambiguous local-date/timezone inputs.

### Proposal B — Single Armed Continuum Gate — **ACCEPTED**

| Element | Decision |
|---------|----------|
| One-shot C1–C3 → stub → AP → N6 → Domain C | **Accepted** |
| No Chat/Cursor/Codex/Claude handoff while armed | **Accepted** |
| No manual prompt composition while armed | **Accepted** |
| No narrative Markdown generation while armed | **Accepted** |
| Machine receipts / minimal event logging only while armed | **Accepted** |
| No retry inside same armed window | **Accepted** |
| Exact session / authorization / stub binding | **Accepted** |
| Immediate fail-closed Domain C on any error | **Accepted** |
| No-submit / no-sign / no-broadcast / no-candidate / no-quote boundary | **Accepted · unchanged** |

**Process isolation boundary (binding clarification):** Process Isolation remains a **separate pre-continuum gate** (disarmed Phase 2). It is **not** inside the Armed Continuum Gate.

**Rollback responsibility:** Continuum owns immediate Domain C on PASS, FAIL, abort, ambiguity, or timeout.

### Proposal C — Fifteen-minute cap retained + ≥12 after stub — **ACCEPTED**

| Element | Decision |
|---------|----------|
| Max LIVE_ARMED **15 minutes** | **Retained** |
| AP floor **≥ 10 minutes** | **Retained** |
| After successful stub: remaining **≥ 12 minutes** or abort before AP | **Accepted** |
| Two-minute automatic-only margin (12→10) | **Accepted** |

**Viability:** Justified **in principle** when continuum is automatic.  
**Enforceability:** Must be mechanical (timestamp compare against `armedDeadlineUtc`) in future implementation.  
**Domain C reserve:** Continuum must initiate disarm/Domain C inside the remaining window; no Chat documentation during armed time.  
**Timing rehearsal:** Required as an **implementation-planning deliverable** (disarmed dry timing rehearsal / simulation) before any future AP04 continuum is considered authorization-eligible — **not** a redesign of A/B/C.

### Proposal D — 20-minute armed cap — **DEFERRED**

| Element | Decision |
|---------|----------|
| Adopt 20 minutes now | **No** |
| Reconsideration trigger | Deterministic continuum timing tests show **repeated** inability to meet post-stub ≥12m and AP ≥10m under automatic continuum with no handoff, after implementation planning and dry rehearsal |

### Proposal E — Lower 10-minute AP floor — **REJECTED**

Weakens the safety reserve that correctly aborted AP03.

### Proposal F — Create stub while disarmed — **REJECTED**

Changes authorization/state-binding model and Domain A/B boundaries.

---

## 5. Required amendments

**None.**

Binding clarifications in §4 are acceptance conditions for implementation planning, **not** design rework requiring a separate amendment-planning gate.

---

## 6. Boundary of this decision

| This gate approves | This gate does **not** approve |
|--------------------|--------------------------------|
| Remediation design A+B+C | Code changes |
| D deferred / E·F rejected | AP04 session or authorizations |
| Proceeding to implementation **planning** | Arming · stub · AP · N6 · execution |
| Machine JSON as canonical timing evidence (policy) | Git tracking of Ori / lock clearance |

---

## 7. Governance-record integrity track

Repo-local Ori remains **untracked** (`git ls-files Ori/` = 0). Markdown mtime provenance is weak after bulk-touch clusters.

**Determination:** Governance Record Integrity Planning may proceed as a **separate controlled track** and does **not** block Armed Continuum Remediation Implementation Planning, provided machine receipts remain canonical for timing and no historical timestamp rewriting occurs.

---

## 8. Final decision

**ACCEPTED AS DESIGNED**

---

## 9. Recommended next gate

**RB-G9 Armed Continuum Remediation Implementation Planning**

---

## 10. Sign-off

| Field | Value |
|-------|-------|
| **Decision** | **ACCEPTED AS DESIGNED** |
| **Signer** | **Taylor Cheaney** |
| **Signature timestamp (UTC)** | **`2026-07-11T23:01:59.024Z`** *(decision-gate capture; attestation recorded with gate)* |
| **Signature timestamp (local)** | **`Sat Jul 11 2026 17:01:59 GMT-0600 (Mountain Daylight Time)`** |

**Taylor's explicit statement:**

> I accept the AP04 timing-remediation design as specified: Proposal A (proof-day G1 with block coverage and 60-minute post-block margin), Proposal B (Single Armed Continuum Gate with process isolation outside the continuum), and Proposal C (retain 15-minute LIVE_ARMED cap with ≥12 minutes remaining after stub and ≥10 minutes before AP). Proposal D remains deferred. Proposals E and F remain rejected. This acceptance authorizes implementation planning only. It does not create an AP04 session, does not sign G1–G4, does not arm production, does not create a runtime stub, and does not invoke AP or N6. Strategy readiness is NOT READY. OR-20260630-008 remains not_promoted.

---

**Canonical path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Decisions/DECISION — RB-G9 AP04 Remediation Acceptance — 2026-07-11.md`
