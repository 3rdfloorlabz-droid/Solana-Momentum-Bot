# RB-G9 AP04 Timing Remediation and Proof Retry Planning — 2026-07-11

Status:
**PLANNING COMPLETE — PRODUCTION DISARMED UNCHANGED — NO AP04 AUTHORIZATION — NO SESSION ACTIVATED**

Gate type:
Planning / design / read-only verification — timing remediation for future armed no-submit proof retry

Prerequisites:
`RB-G9 Governance Integrity and Timing-Pressure Review` *(prior chat/review)* · `RB-G9-20260711-AP03 EMERGENCY DOMAIN C CLOSURE — 2026-07-11.md` · `analysis/rb_g9_20260711_ap03_emergency_domain_c_closure_receipt.json` · `RB-G9-20260713-AP02 EXPIRED G1 CLOSURE — 2026-07-13.md` · `RB-G9-20260713-AP02 FRESH R15 AUTHORIZATION — 2026-07-11 — FAIL CLOSED.md` · `RB-G9 AP02 PROOF-DAY RUNBOOK — 2026-07-11.md` · `Decisions/DECISION — Armed No-Submit Production Proof — 2026-07-09.md`

Planning capture UTC:
**`2026-07-11T22:57:52.440Z`**

Planning capture local (MDT):
**`Sat Jul 11 2026 16:57:52 GMT-0600 (Mountain Daylight Time)`**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**AP04 session created:** **No** · **AP04 G1–G4 created/signed:** **No** · **Arming performed:** **No** · **Runtime stub created:** **No** · **AP/N6 invoked:** **No** · **Processes stopped/started:** **No** · **Git staged/committed:** **No** · **`.git/index.lock` cleared:** **No**

---

## 1. Prominent post-gate state

> **DISARMED · DRY · NO TRADE**
>
> **AP04 TIMING REMEDIATION DESIGNED — NOT AUTHORIZED**
>
> **NO SESSION · NO C1–C3 · NO STUB · NO AP/N6**

---

## 2. Read-only verification (this gate)

| Check | Result |
|-------|--------|
| **`executionMode`** | `PIPELINE_DRY_RUN` |
| **`dryRunMode`** | `true` |
| **`emergencyStop`** | `false` |
| **`liveArmed`** | `false` |
| **`FOMO_ENABLE_LIVE_SUBMISSION`** | not YES |
| **`FOMO_ALLOW_LOOP_LIVE`** | not YES |
| **Runtime stub** | absent |
| **Temporary stub** | absent |
| **FOMO Wallet Monitor** | present · **Ready** · untouched |
| **`git ls-files Ori/`** | **0** tracked |
| **`.git/index.lock`** | **present** — **not cleared** (out of scope) |
| **OR-20260630-008** | **not_promoted** |
| **Strategy readiness** | **NOT READY** |

---

## 3. Defects in scope (verified — not re-litigated)

### 3.1 AP02 — authorization-timing defect

| Field | Value |
|-------|-------|
| **Early G1 signed** | `2026-07-11T02:53:21Z` |
| **Intended operating block** | `2026-07-13` · **14:00–20:00 MDT** |
| **G1 expiry** | `2026-07-13T02:53:21Z` |
| **Structural failure** | Expiry precedes block start by **~17 hours** |
| **Disposition** | CLOSED unused · non-reusable |
| **Second early attempt** | FAIL CLOSED · **`PROOF_DAY_NOT_REACHED`** |

### 3.2 AP03 — armed-window defect

| Field | Value |
|-------|-------|
| **`armedStartUtc`** | `2026-07-11T20:17:50.496Z` |
| **`armedDeadlineUtc`** | `2026-07-11T20:32:50.496Z` (**15 minutes**) |
| **Stub completion** | `2026-07-11T20:22:21.845Z` |
| **Armed remaining after stub** | **~10.48 minutes** |
| **Required before AP** | **≥ 10 minutes** |
| **Slack after stub** | **~28.7 seconds** |
| **Proof-gate start** | `2026-07-11T20:24:52.447Z` |
| **Stub→proof delay** | **~150.6 seconds** |
| **Abort** | **`INSUFFICIENT_ARMED_WINDOW`** |
| **AP/N6** | **not invoked** |
| **Disposition** | **`FAIL_CLOSED_TIMING — PROOF_NOT_EXECUTED`** |
| **Domain C / safety** | PASS · **85/85** |
| **Capital / tx** | **none** |

### 3.3 Governance provenance defect (supporting)

| Field | Value |
|-------|-------|
| **Repo-local Ori tracked** | **0** files |
| **Repo-local Ori on disk** | ~234 files (untracked) |
| **Markdown mtime cluster** | ~189 files share `2026-07-11T21:33:54Z` |
| **Implication** | Machine JSON receipts with matching internal timestamps are stronger timing provenance than Markdown mtimes |

---

## 4. Root-cause synthesis

| Defect | Root cause | Not the root cause |
|--------|------------|--------------------|
| **AP02** | G1 signed days early with **48h expiry that cannot cover the selected operating block** | Fabricated future filename · agent execution overreach |
| **AP03** | **15-minute LIVE_ARMED budget** must contain arming residual + stub + AP start under a **≥10-minute AP floor**, while **multi-gate handoffs** consume minutes — leaving **~29s** of true slack | Unauthorized AP/N6 · capital exposure · Domain C failure |
| **Shared** | Workflow **encourages sequential Chat gates during countdown** · documentation/provenance work competes with armed-window work | Secrets exposure · FOMO Wallet Monitor interference |

Fail-closed behavior on both defects was **correct and must be preserved**.

---

## 5. Design goals for future proof retry (AP04-class)

| # | Goal |
|---|------|
| **D1** | G1 lifetime always covers the entire selected operating block with margin |
| **D2** | No LIVE_ARMED multi-prompt / multi-agent handoff |
| **D3** | After stub validation, remaining armed time must exceed the AP floor by a **designed slack**, not accident |
| **D4** | All governance signing, Domain A, and isolation complete **before** C1 |
| **D5** | Fail-closed thresholds remain hard — no override language |
| **D6** | Machine receipts remain primary timing evidence |
| **D7** | AP02/AP03 artifacts remain historical · non-reusable |
| **D8** | No readiness / profitability / OR-promotion claims |

---

## 6. Remediation Option Set

### Option A — Proof-day G1 only + expiry covers block end (**REQUIRED**)

| Rule | Detail |
|------|--------|
| **R-A1** | Do **not** sign G1 before local proof-day date of the selected operating block |
| **R-A2** | Keep **`PROOF_DAY_NOT_REACHED`** fail-closed |
| **R-A3** | G1 expiry UTC must be **≥ operating_block_end_UTC + 60 minutes** (recommended margin) |
| **R-A4** | Reject any G1 whose expiry is before block start (AP02 class) at planning and at G1 sign-off |
| **R-A5** | Pre-proof-day work is limited to planning, readiness, runbook, and **unsigned** drafts |

**Status:** **ADOPT** for any future AP04-class session.

### Option B — Single Armed Continuum Gate (**REQUIRED**)

Collapse post-isolation armed work into **one continuous gate** with no Chat handoff:

| Step | Action | Target duration |
|------|--------|-----------------|
| **1** | Preflight bindings (baseline · isolation hash · G1–G4 · isolation auth) | ≤ 30s |
| **2** | C1–C3 · confirm `LIVE_ARMED` · start 15m timer | ≤ 60s |
| **3** | Create + validate proof-only runtime stub | ≤ 60s |
| **4** | Re-check armed remaining ≥ **10 minutes + designed slack** | instant |
| **5** | Invoke AP-01–AP-20 **once** | as tooling requires |
| **6** | Invoke armed-safe N6 **once** | as tooling requires |
| **7** | Immediate Domain C rollback regardless of PASS/FAIL/abort | mandatory |

**Hard rule:** While `liveArmed: true`, **do not** open a new Chat, paste a new multi-page handoff, or wait for a separate “next gate” prompt.

**Status:** **ADOPT**.

### Option C — Designed slack inside the 15-minute cap (**REQUIRED** if 15m retained)

Keep maximum LIVE_ARMED = **15 minutes** (current decision) **and** require:

| Checkpoint | Minimum remaining |
|------------|-------------------|
| Before C1 | Domain A freshness ≥ **12 minutes** *(unchanged)* |
| Immediately after stub PASS | Armed remaining ≥ **12 minutes** *(new — was effectively ~10.48m on AP03)* |
| Before AP invocation | Armed remaining ≥ **10 minutes** *(unchanged floor)* |
| Designed slack after stub before AP | ≥ **2 minutes** reserved for tooling start only — **not** for Chat handoff |

If after stub remaining **< 12 minutes** → **FAIL CLOSED** · disarm · Domain C · do not invoke AP.

**Status:** **ADOPT** under current 15-minute policy.

### Option D — Extend maximum armed duration to 20 minutes (**OPTIONAL — needs Taylor decision**)

| Pros | Cons |
|------|------|
| More room for AP + N6 + rollback initiation | Broader production armed exposure |
| Tolerates modest tooling variance | Requires explicit decision amendment |

**Status:** **DEFER** — not required if Option B+C are adopted. Record as optional policy decision; **do not** assume approved.

### Option E — Lower AP remaining floor below 10 minutes (**REJECT**)

Reduces safety margin that correctly aborted AP03.

**Status:** **REJECT**.

### Option F — Pre-create runtime stub while disarmed (**REJECT**)

Stub is armed-context / G3-bound; creating early would blur Domain A/B boundaries and weaken purpose guards.

**Status:** **REJECT**.

---

## 7. Corrected future workflow (AP04-class — not authorized here)

### Phase 0 — Scheduling (days before)

1. Select operating block with human-present capacity for a **continuous** armed continuum (≥ 20–30 minutes operator attention recommended).
2. Confirm host / power / remote / FOMO exclusion / process classification still valid.
3. **Do not** sign G1 yet.

### Phase 1 — Proof-day governance (disarmed · before Domain A)

1. Local date must equal proof-day date.
2. Sign G1 with expiry satisfying Option A.
3. Sign G2 · G3 · G4 · Process Isolation Authorization in the same governance block.
4. Validate fingerprints · SIGNED/UNUSED · same session · wallet/signer.
5. Still **disarmed** · no C1 · no stub.

### Phase 2 — Pre-armed technical (disarmed)

1. Ordinary-close observation loops if present.
2. Final Fresh Domain A · capture `armingBaselineHash`.
3. Process Isolation · derive `isolatedProcessSetHash`.
4. Confirm Domain A freshness ≥ **20 minutes** before isolation start · ≥ **12 minutes** before C1.
5. Confirm scripts/receipts paths ready · operator will remain in **one** continuum session.

### Phase 3 — Armed Continuum Gate (LIVE_ARMED · single gate)

Execute Option B steps 1–7 without Chat handoff.

### Phase 4 — Closure

1. Domain C validator + safety suite.
2. Consume/close authorizations per outcome.
3. Restore monitor/dashboard/scanner **only after** Domain C (separate action).
4. Never reuse session IDs or fingerprints.

---

## 8. Explicit timing budget (15-minute policy retained)

Assume C1 at `T0`:

| Elapsed | Milestone | Remaining (ideal) |
|---------|-----------|-------------------|
| **T0** | LIVE_ARMED confirmed | **15:00** |
| **T0+≤1m** | Stub PASS | ≥ **14:00** · must be ≥ **12:00** or abort |
| **T0+≤2m** | AP starts | ≥ **13:00** · must be ≥ **10:00** or abort |
| **T0+≤12m** | AP+N6 complete (target) | ≥ **3:00** for rollback start |
| **≤T0+15m** | Disarm initiated | mandatory |

AP03 failure mode mapped: stub at ~T0+4.5m left ~10.5m; Chat delay to ~T0+7m left ~8m → abort. Continuum design forbids that delay class.

---

## 9. Governance / Ori provenance remediation (planning only — not executed)

| Action | When | This gate |
|--------|------|-----------|
| Declare machine JSON receipts **canonical for timing** | Now (policy in this plan) | Recorded |
| Treat Markdown mtimes as **non-authoritative** after bulk-touch clusters | Now | Recorded |
| Track repo-local `Ori/` in Git (or formal vault-bridge rule) | **Future dedicated governance gate** | **Not executed** — do not stage/commit here |
| Clear `.git/index.lock` | Only by operator outside this gate if safe | **Not touched** |
| Rewrite historical AP02/AP03 timestamps | Never | Forbidden |

---

## 10. Future session naming (placeholder only)

| Field | Value |
|-------|-------|
| **Provisional session family** | **AP04-class** |
| **Session ID** | **Not assigned in this gate** |
| **Operating block** | **Not selected in this gate** |
| **Authorizations** | **Not drafted/signed in this gate** |

Assign session ID + block only in a later **Operating Window Selection** gate after Taylor accepts this remediation design.

---

## 11. Reuse prohibitions (unchanged)

| Artifact | Status |
|----------|--------|
| **AP01 chain** | CLOSED · non-reusable |
| **AP02 early G1 / plan** | CLOSED / superseded · non-reusable |
| **AP03 chain · baseline · isolation hash · stub** | CLOSED · non-reusable |
| **Any AP03 retry using same session** | **Prohibited** |

---

## 12. Explicit non-authorizations (this planning gate)

| Item | Status |
|------|--------|
| AP04 session activation | **No** |
| AP04 G1–G4 / isolation authorization | **No** |
| Arming / C1–C3 | **No** |
| Runtime stub | **No** |
| AP / N6 | **No** |
| Process start/stop | **No** |
| `.env` / `live_config.json` changes | **No** |
| Git stage / commit / lock clear | **No** |
| OR promotion | **No** |
| Readiness / profitability claim | **No** |

---

## 13. Acceptance criteria before any future AP04 authorization is eligible

| # | Criterion |
|---|-----------|
| **C1** | Taylor accepts Option A + B + C (and optionally decides Option D) |
| **C2** | Operating window selected with continuous-operator capacity |
| **C3** | Proof-day runbook updated to Armed Continuum Gate language |
| **C4** | Pre-armed checklist includes “no Chat handoff while LIVE_ARMED” |
| **C5** | Capture scripts support continuum receipts without requiring a second prompt |
| **C6** | Production remains disarmed until a separate authorized arming continuum begins |
| **C7** | Fresh G1–G4 + isolation + Domain A + isolation PASS under new rules |

Until **C1–C7** are satisfied, **do not** open AP04 authorization sign-off.

---

## 14. Recommended next gate

**RB-G9 AP04 Remediation Acceptance Decision**

*(Taylor accepts/rejects Options A–D; no authorizations; no arming.)*

Alternate if decision is already implicit acceptance of A+B+C:

**RB-G9 AP04 Operating Window Selection**

---

## 15. Required output summary

| Item | Value |
|------|-------|
| **Gate** | RB-G9 AP04 Timing Remediation and Proof Retry Planning |
| **Mode** | Planning / design / read-only verification |
| **AP02 remediation** | Proof-day G1 only · expiry covers block end |
| **AP03 remediation** | Armed Continuum Gate · post-stub ≥12m remaining · no Chat handoff |
| **15-minute cap** | Retained unless Taylor later approves Option D |
| **AP floor ≥10m** | Retained |
| **AP04 authorized** | **No** |
| **System remains disarmed** | **Yes** |
| **OR-20260630-008** | **not_promoted** |
| **Readiness/profitability claims** | **No** |

---

**Canonical path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9 AP04 Timing Remediation and Proof Retry Planning — 2026-07-11.md`
