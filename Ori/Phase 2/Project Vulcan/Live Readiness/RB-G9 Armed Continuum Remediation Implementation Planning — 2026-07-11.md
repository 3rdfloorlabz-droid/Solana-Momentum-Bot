# RB-G9 Armed Continuum Remediation Implementation Planning — 2026-07-11

Status:
**COMPLETE — IMPLEMENTATION PLAN READY — CODE NOT AUTHORIZED — AP04 NOT AUTHORIZED**

Mode:
**IMPLEMENTATION PLANNING ONLY**

Planning start UTC:
**`2026-07-11T23:08:18.159Z`**

Planning start local (MDT):
**`Sat Jul 11 2026 17:08:18 GMT-0600 (Mountain Daylight Time)`**

Planning completion UTC:
**`2026-07-11T23:10:55.921Z`**

Planning completion local (MDT):
**`Sat Jul 11 2026 17:10:55 GMT-0600 (Mountain Daylight Time)`**

Accepted decision:
[`Decisions/DECISION — RB-G9 AP04 Remediation Acceptance — 2026-07-11.md`](Decisions/DECISION%20%E2%80%94%20RB-G9%20AP04%20Remediation%20Acceptance%20%E2%80%94%202026-07-11.md)

Upstream planning:
[`RB-G9 AP04 Timing Remediation and Proof Retry Planning — 2026-07-11.md`](RB-G9%20AP04%20Timing%20Remediation%20and%20Proof%20Retry%20Planning%20%E2%80%94%202026-07-11.md)

Capital exposure:
**none**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted**

---

## 0. Boundary of this gate

| This gate does | This gate does **not** |
|----------------|------------------------|
| Translate A+B+C into a precise implementation plan | Modify application code |
| Identify files, tests, sequence, exit codes | Create runtime scripts |
| Decide governance-integrity dependency for *implementation authorization* | Create AP04 session |
| Recommend exactly one next gate | Sign or create G1–G4 |
| Write this planning record + Cursor Run Log row | Arm · create stub · run AP/N6 |
| | Start/stop processes · edit `.env` / `live_config.json` |
| | Stage/commit · clear `.git/index.lock` |
| | Dump secrets / `process.env` |

Production posture at planning start (read-only):
`executionMode=PIPELINE_DRY_RUN` · `dryRunMode=true` · `liveArmed=false` · runtime stub absent · executor zero · `.git/index.lock` present · untouched

---

## 1. Accepted design summary (binding)

### A — Proof-day G1 only
- G1 signed only on proof day
- Expiry ≥ selected operating-block end + **60 minutes**
- Mechanical reject: proof day not reached · expiry short · timezone mismatch · stale · reused

### B — Single Armed Continuum Gate
One one-shot process: **C1–C3 → stub → AP → N6 → Domain C rollback**  
No Chat/Cursor/Codex/Claude handoff while armed · no prompt composition · no narrative Markdown while armed · machine receipts + minimal event log only · no retry · exact session/auth/stub binding · fail-closed rollback  
**Process isolation remains outside and before the continuum.**

### C — Timing
- LIVE_ARMED cap **15 minutes** retained
- Stub must complete with **≥ 12 minutes** remaining or abort (no AP)
- AP floor **≥ 10 minutes** retained
- Proposal D (20m) deferred · E (lower 10m floor) rejected · F (disarmed stub) rejected

### Binding clarifications from acceptance
- Isolation = separate pre-continuum disarmed gate
- Disarmed timing rehearsal / simulation is an **implementation deliverable** (tests), not a redesign
- UTC conversion rules for Mountain Time (incl. DST) required in G1 validator
- Machine JSON remains canonical timing evidence
- Governance integrity is a **parallel track** and does **not** block this planning gate

---

## 2. Current implementation architecture

Today’s armed proof path is a **multi-gate Chat-orchestrated sequence** of session-hardcoded capture scripts under gitignored `analysis/`, not a single continuum process. That handoff class caused AP03’s `INSUFFICIENT_ARMED_WINDOW` (~150.6s stub→proof delay; ~28.7s slack above the 10m floor after stub).

### 2.1 Component inventory

| Component | Path | Purpose | Inputs | Outputs | Side effects | Auth dep | State dep | Receipt | Failure | Owns rollback | Retries | Sync Markdown |
|-----------|------|---------|--------|----------|--------------|----------|-----------|---------|---------|---------------|---------|---------------|
| Process isolation gate (pre-continuum) | `analysis/rb_g9_ap03_process_isolation_gate_capture.js` | Stop dashboard/scanner; bind isolated set | Isolation auth · Domain A baseline | Isolation + process-set receipts | Stops observation PIDs | Isolation auth | Disarmed | JSON | Fail-closed before stops if preflight fails | N/A (pre-arm) | No | Marks isolation auth |
| Domain A capture | `analysis/rb_g9_ap03_final_domain_a_gate_capture.js` | Fresh baseline + safety | Config · processes | Domain A receipt · baseline manifest | None (read-only validate/safety) | Session binding | Disarmed | JSON + txt outs | Exit non-zero | No | No | No |
| Arming C1–C3 | `analysis/rb_g9_ap03_arming_transition_gate_capture.js` | Arm production | G1–G4 · isolation · baseline | Arming receipt · timer | `.env` FOMO · `live_config` LIVE/`dryRunMode=false` | G2 | Isolated · fresh Domain A | JSON | `rollback()` D1–D3 | **Yes** (on C fail) | No | Marks G2 |
| Runtime stub | `analysis/rb_g9_ap03_runtime_stub_creation_gate_capture.js` | Proof-only R15 stub | LIVE_ARMED · G3 | Stub JSON · stub receipt | Writes `analysis/r15_manual_approval_record.json`; marks G3 | G3 | LIVE_ARMED | JSON | `domainCRollback` + stub delete | **Yes** | No | Marks G3 |
| Proof / AP gate | `analysis/rb_g9_ap03_armed_no_submit_proof_gate_capture.js` | Window check + AP | Armed timer · stub · G4 | Proof receipt | May Domain C on abort | G4 | LIVE_ARMED · stub | JSON | Domain C on fail | **Yes** | No | May mark G4 on success path |
| Emergency Domain C | `analysis/rb_g9_ap03_emergency_domain_c_closure_gate_capture.js` | Closure after abort | Prior receipts | Closure receipt | D1–D3 · restore processes · close auths | Session | Post-abort | JSON | Partial failure recorded | **Yes** | No | Marks G1/G4 closed |
| Live posture | `live_executor.js` | `computeLiveArmedStatus` · `deriveOperationalPosture` · stub path | Config · env | Posture booleans | Read-only for these APIs | — | Config/env | — | Gate failures listed | No | No | No |
| Env load | `local_env.js` | Controlled `.env` load | `.env` | Loaded keys | May fill missing env | — | File | — | — | No | No | No |
| R15 validator | `r15_approval_validator.js` | Dual-purpose stub validate | Stub path · expected purpose | Pass/fail codes | None | — | Stub file | — | `R15_EXPIRED` etc. | No | No | No |
| AP CLI | `run_armed_preflight_manifest.js` | Aggregate AP-01–AP-20 | CLI / options | Manifest receipt | **None** (read-only) | G1–G4 via session | LIVE_ARMED | JSON | Exit 0/1/2 | No | No | No |
| AP validator | `validate_armed_preflight.js` | Domain B validator | Same | Receipt | None | Chain | LIVE_ARMED | JSON | Exit 0/1/2 | No | No | No |
| AP checks | `armed_preflight_checks.js` | Check implementations | Adapters · cfg | Check results | None | Via adapters | LIVE_ARMED | — | FAIL results | No | No | No |
| AP manifest | `armed_preflight_manifest.js` | AP order / defs | — | Ordered checks | None | — | — | — | — | No | No | No |
| AP session | `armed_preflight_session.js` | Session + `validateProofAuthorizationChain` | Auth paths · sessionId | Chain ok/errors | None | G1–G4 files | — | — | Errors list | No | No | No |
| Armed N6 | `test_n6_armed_estop_probe.js` | Armed-safe estop probe | LIVE_ARMED production | `{ ok, evidence }` | Temp harness only; **no** prod config mutate | — | LIVE_ARMED | — | Non-ok / throw | No | No | No |
| Domain C validate | `validate_live_system.js` | Structural live-system validate | Config · source | Pass/fail stdout | **None** | — | Prefer disarmed | — | Non-zero | No | No | No |
| Safety suite | `run_safety_tests.js` | ~85 sequential tests | Test list | Pass count | May create empty audit files | — | Prefer disarmed | — | Fail-fast | No | No | No |
| Receipt helpers | `live_validation_common.js` | Hash · receipt · secret scrub | Buffers/files | Hashes · receipts | None | — | — | Shared | Assert on secrets | No | No | No |
| Reset helper | `reset_live_safety.js` | Clear e-stop only | `live_config.json` | Updated config | Forces dry automation off; **does not** unset FOMO | — | Config | — | — | No | No | No |

### 2.2 Timing constants today
Duplicated inside AP03 gate captures (not a shared module):

| Constant | Value | Location |
|----------|-------|----------|
| `ARMED_DURATION_MS` | 15 × 60 × 1000 | Arming / stub / proof captures |
| `MIN_ARMED_BEFORE_AP_MS` | 10 × 60 × 1000 | Proof capture |
| `MIN_FRESHNESS_BEFORE_C1_MS` | 12 × 60 × 1000 | Arming capture |
| `MIN_ARMED_AFTER_STUB_MS` | **absent** | Policy only (accepted C) |
| G1 markdown expiry in `armed_preflight_session.js` | **not enforced** | Gate scripts only (string compare) |

### 2.3 Architecture gaps driving remediation
1. No shared C1–C3 / rollback / timing library — duplicated per session script  
2. Chat/Cursor handoff between gates while armed  
3. Narrative Markdown written/updated during/near armed window  
4. No continuum orchestrator · no append-only causal event log  
5. G1 proof-day / block+60m rules not in shared validator  
6. Post-stub ≥12m threshold not coded  

---

## 3. Implementation boundary

### In scope (future implementation authorization)
- New continuum orchestrator + shared timing / event-log / rollback modules
- Proof-day G1 mechanical validation in shared auth path
- Machine continuum receipt + event log schemas
- Tests (unit + simulated integration) proving thresholds and fail-closed rollback
- Minimal `package.json` script + docs update
- Disarmed timing rehearsal as **test/simulation**, not production arming

### Out of scope (this plan and immediate implementation)
- AP04 session creation · G1–G4 · isolation auth · Domain A production run · C1–C3 production · stub · live AP/N6
- Process isolation implementation change (remains separate pre-gate)
- Proposal D 20-minute cap
- Lowering AP 10m floor · disarmed stub creation
- Clearing `.git/index.lock` · staging/committing Ori
- Transaction / signing / submit / quote / candidate paths
- FOMO Wallet Monitor changes

### Pre-continuum remains separate
Process Isolation Gate (and Domain A freshness capture) stay **outside** `run_armed_continuum.js`. Continuum **PRECHECK** consumes their receipts/hashes; it does not stop/start observation processes except as required by Domain C restoration **after** disarm (restoration only after Domain C + safety PASS, matching AP03 closure pattern).

---

## 4. Minimal implementation surface

| Path | Classification | Role |
|------|----------------|------|
| `armed_continuum_timing.js` *(new)* | **MUST CHANGE** (new) | Constants + monotonic deadline helpers |
| `armed_continuum_events.js` *(new)* | **MUST CHANGE** (new) | Append-only hash-chained event log |
| `armed_continuum_rollback.js` *(new)* | **MUST CHANGE** (new) | Idempotent D1–D3 + stub remove + executor-zero verify |
| `armed_continuum_receipt.js` *(new)* | **MUST CHANGE** (new) | Continuum JSON receipt schema/writer |
| `armed_continuum_state.js` *(new)* | **MUST CHANGE** (new) | State machine transitions |
| `run_armed_continuum.js` *(new)* | **MUST CHANGE** (new) | One-shot CLI orchestrator entry |
| `armed_g1_proof_day.js` *(new)* **or** extend `armed_preflight_session.js` | **MUST CHANGE** | Proof-day / TZ / block+60m / stale-reuse |
| `package.json` | **LIKELY CHANGE** | `run:armed-continuum` + test scripts |
| `docs/ARMED_PREFLIGHT.md` | **DOCUMENTATION ONLY** | Continuum boundary + timing + exit codes |
| `test_armed_continuum_timing.js` *(new)* | **TEST ONLY** | Timing / deadline math |
| `test_armed_g1_proof_day.js` *(new)* | **TEST ONLY** | G1 rules |
| `test_armed_continuum_events.js` *(new)* | **TEST ONLY** | Hash chain / reason codes |
| `test_armed_continuum_rollback.js` *(new)* | **TEST ONLY** | Idempotent rollback (fixture env/config) |
| `test_armed_continuum_integration.js` *(new)* | **TEST ONLY** | Simulated continuum (mocked C1–AP–N6) |
| `armed_preflight_checks.js` | **LIKELY CHANGE** | Adapter hook so AP-17 can defer to continuum N6 state (avoid double N6) |
| `armed_preflight_session.js` | **LIKELY CHANGE** | Call shared G1 proof-day validator |
| `r15_approval_validator.js` | **NO CHANGE** (preferred) | Already enforces purpose/expiry on stub |
| `live_executor.js` | **NO CHANGE** (preferred) | Posture/stub path remain authoritative |
| `test_n6_armed_estop_probe.js` | **NO CHANGE** (preferred) | Invoke `runProbe` from continuum |
| `run_armed_preflight_manifest.js` | **NO CHANGE** (preferred) | Invoke from continuum |
| `validate_live_system.js` / `run_safety_tests.js` | **NO CHANGE** | Domain C tools |
| `analysis/rb_g9_ap03_*_gate_capture.js` | **NO CHANGE** | Historical; do not generalize in place |
| `live_config.json` / `.env` | **NO CHANGE** during implementation/tests against production | Fixtures only in tests |
| Ori authorization bodies | **DOCUMENTATION ONLY** later | Post-disarm narrative generation after future AP04 — not this implementation |

Avoid broad refactors of `live_executor.js` or the AP check suite unless a safety hook requires a thin adapter.

---

## 5. Proposed orchestrator

### 5.1 File / entry
| Item | Value |
|------|-------|
| **Path** | `run_armed_continuum.js` (repo root) |
| **Entry** | `node run_armed_continuum.js` · `main()` → `runArmedContinuum(options)` |
| **npm** | `"run:armed-continuum": "node run_armed_continuum.js"` |

### 5.2 CLI
```text
node run_armed_continuum.js \
  --session-id <RB-G9-…-APxx> \
  --auth-manifest <path.json> \
  --isolation-receipt <path.json> \
  --domain-a-receipt <path.json> \
  --arming-baseline-hash <sha256> \
  --isolated-process-set-hash <sha256> \
  --operating-block-start-utc <ISO-8601> \
  --operating-block-end-utc <ISO-8601> \
  --proof-day-local <YYYY-MM-DD> \
  --timezone America/Denver \
  --continuum-run-id <uuid> \
  --out analysis/rb_g9_<session>_armed_continuum_receipt.json \
  --events analysis/rb_g9_<session>_armed_continuum_events.jsonl \
  [--dry-rehearsal]   # disarmed simulation only; forbids real C1
```

**Required arguments:** session id · auth manifest (G1–G4 + isolation paths + fingerprints) · Domain A receipt · isolation receipt · baseline + process-set hashes · block start/end UTC · proof-day local date · timezone · continuum run id · out + events paths.

**Forbidden while armed (enforced by design, not Chat):** `--interactive`, prompt loops, Markdown writers.

### 5.3 Environment assumptions
- Process isolation already complete and receipt fresh
- Production starts **disarmed** (`PIPELINE_DRY_RUN`, `dryRunMode true`, `liveArmed false`)
- No executor · no stub · no `FOMO_LOOP_LIVE` / loop-live flag
- `local_env.loadLocalEnv({ override: true })` only inside orchestrator for gate-accurate FOMO reads
- Host clock may skew: **monotonic** clock is enforcement SoT; UTC wall clock is audit-only

### 5.4 Preconditions (PRECHECK)
1. Session id matches all auth docs  
2. Proof day + timezone rules pass for G1  
3. Operating block UTC bounds parse and bind to G1  
4. G1–G4 + isolation SIGNED/UNUSED (or isolation already CONSUMED/USED with matching receipt — bind exactly as auth model requires)  
5. Domain A freshness ≥ required margin before C1  
6. Isolation receipt binds `isolatedProcessSetHash` and authorized PID set empty of dashboard/scanner  
7. Disarmed baseline · executor zero · stub absent · loop-live unset  
8. Config/env fingerprints match Domain A baseline (fail-closed on drift)  
9. `--dry-rehearsal` XOR production mode: rehearsal never mutates production `.env`/`live_config`

### 5.5 Exit codes (process)
| Code | Class |
|------|-------|
| 0 | Continuum PASS — fully disarmed · Domain C + safety PASS |
| 10 | `PRECHECK_FAILED` |
| 11 | `AUTHORIZATION_INVALID` |
| 12 | `DOMAIN_A_STALE` |
| 13 | `ISOLATION_INVALID` |
| 20 | `ARMING_FAILED` |
| 21 | `STUB_FAILED` |
| 22 | `INSUFFICIENT_POST_STUB_WINDOW` |
| 23 | `AP_FAILED` |
| 24 | `N6_FAILED` |
| 25 | `DEADLINE_EXCEEDED` |
| 30 | `ROLLBACK_FAILED` |
| 31 | `DOMAIN_C_FAILED` |
| 32 | `SAFETY_SUITE_FAILED` |
| 40 | `RECEIPT_WRITE_FAILED` |
| 50 | `UNEXPECTED_STATE` |

(Align docs: distinct from Domain B 0/1/2; continuum owns this map.)

### 5.6 Receipt locations
| Artifact | Path pattern |
|----------|--------------|
| Continuum machine receipt | `analysis/rb_g9_<session>_armed_continuum_receipt.json` |
| Event log | `analysis/rb_g9_<session>_armed_continuum_events.jsonl` |
| Runtime stub (transient) | `analysis/r15_manual_approval_record.json` |
| Timing rehearsal receipt | `analysis/rb_g9_<session>_continuum_timing_rehearsal_receipt.json` |
| Post-disarm narrative (after future AP04 only) | Ori Live Readiness markdown generated **after** disarm from machine evidence |

---

## 6. Continuum state machine

States: `PRECHECK` → `ARMING` → `STUB` → `AP` → `N6` → `ROLLBACK` → `DOMAIN_C` → `FINALIZE`  
(`ROLLBACK` always entered after successful C1 mutation, including success path.)

| State | Entry | Actions | Success → | Failure → | Deadline check | Receipt event | Rollback obligation |
|-------|-------|---------|-----------|-----------|----------------|---------------|---------------------|
| **PRECHECK** | CLI start · disarmed | Validate session · proof day · block · G1–G4 · isolation · Domain A · process set · baseline · no executor/stub/loop-live | ARMING | FINALIZE (exit fail) | Freshness timers only | `PRECHECK_COMPLETE` / `VALIDATION_ABORT` | None (C1 not yet) |
| **ARMING** | PRECHECK ok | C1 · C2 · C3 · record `armedStartMono`/`armedStartUtc` · `armedDeadline = start+15m` | STUB | ROLLBACK | Before C1: Domain A freshness; after C3: armed deadline set | `C1_COMPLETE`…`C3_COMPLETE` | **Mandatory** after any successful C1 |
| **STUB** | Armed | Create stub · validate fingerprint/purpose · reject micro-live · require ≥12m remaining | AP | ROLLBACK | Before create · after validate | `STUB_CREATED` · `STUB_VALIDATED` · `THRESHOLD_CHECK` | Mandatory |
| **AP** | Stub ok + ≥12m | Require ≥10m remaining · invoke AP manifest **once** · no retry · AP-17 deferred to N6 | N6 | ROLLBACK | Before invoke · after return | `AP_STARTED` · `AP_COMPLETED` | Mandatory |
| **N6** | AP ok | Require ≥ N6 min remaining · `runProbe` **once** · no retry | ROLLBACK (success path) | ROLLBACK | Before invoke · after return | `N6_STARTED` · `N6_COMPLETED` | Mandatory |
| **ROLLBACK** | Any post-C1 terminal · or success after N6 | D1 · D2 · D3 · remove stub · verify executor zero · record partial failures | DOMAIN_C | DOMAIN_C (still) then FINALIZE with `ROLLBACK_FAILED` | Initiate within max rollback delay; do not wait for Chat | `ROLLBACK_STARTED` · `ROLLBACK_COMPLETED` | **Owns** cleanup |
| **DOMAIN_C** | After rollback attempt | `validate_live_system` · `run_safety_tests` · verify no tx/capital state · process restore **only if** Domain C+safety PASS | FINALIZE | FINALIZE (`DOMAIN_C_FAILED` / `SAFETY_SUITE_FAILED`) | Prefer start with Domain C reserve on success path; always run | `DOMAIN_C_*` · `SAFETY_*` | Already disarmed expected |
| **FINALIZE** | After DOMAIN_C | Write continuum receipt · flush event log · exit | exit | exit (`RECEIPT_WRITE_FAILED` if write fails after best-effort) | N/A | receipt hash fields | N/A |

**Always:** no transaction construction · no signing · no submission · no broadcast · no candidate · no quote.

**AP↔N6 binding:** Continuum must not invoke armed N6 twice. Prefer AP manifest adapter that marks AP-17 deferred; continuum **N6** state performs the single `runProbe`; receipt binds AP-17 evidence from that invoke.

---

## 7. Timing constants (proposed)

| Constant | Value | Notes |
|----------|-------|-------|
| `ARMED_CAP_MS` | **900_000** (15m) | Hard cap |
| `MIN_REMAINING_AFTER_STUB_MS` | **720_000** (12m) | Abort before AP if below |
| `MIN_REMAINING_AT_AP_MS` | **600_000** (10m) | Abort before AP invoke if below |
| `MIN_REMAINING_AT_N6_MS` | **480_000** (8m) | **Proposed** — leaves Domain C reserve after typical AP duration |
| `MIN_DOMAIN_C_RESERVE_MS` | **180_000** (3m) | **Proposed** — from AP03 Domain C ~3.4m wall; success path should enter ROLLBACK with ≥ this remaining when possible |
| `MAX_STUB_TO_AP_TRANSITION_MS` | **120_000** (2m) | **Proposed hard max** = entire 12→10 margin; operational SLO **≤ 30_000** |
| `MAX_AP_TO_N6_TRANSITION_MS` | **15_000** | **Proposed** |
| `MAX_ROLLBACK_INITIATION_DELAY_MS` | **5_000** | **Proposed** — from failure detect / N6 complete to ROLLBACK start |
| `G1_POST_BLOCK_EXPIRY_MARGIN_MS` | **3_600_000** (60m) | Proof-day G1 |
| `MIN_DOMAIN_A_FRESHNESS_BEFORE_C1_MS` | **720_000** (12m) | Retain AP03 arming practice |

Enforcement clock: **`process.hrtime.bigint()`** (or equivalent monotonic) from `armedStartMono`.  
Audit fields: UTC ISO-8601 from `Date` at event time (non-authoritative for deadlines).

---

## 8. Timer semantics

| Topic | Rule |
|-------|------|
| Source of truth for deadlines | Monotonic elapsed since `armedStartMono` vs `ARMED_CAP_MS` |
| UTC timestamps | Audit/receipt only; never sole deadline authority |
| Sleep / resume | On wake, recompute remaining from monotonic; if ambiguous or jumped past deadline → `DEADLINE_EXCEEDED` · ROLLBACK |
| System clock change | Wall-clock skew ignored for enforcement; log UTC anomaly as metadata if detected |
| Missing timer data | Fail-closed `UNEXPECTED_STATE` / `DEADLINE_EXCEEDED` — do not invent deadlines |
| Ambiguous timing | Fail-closed — no AP/N6 |
| Check points | **Before and after** each of STUB, AP, N6; before C1 freshness; at ROLLBACK entry |

---

## 9. Rollback ownership

| Requirement | Plan |
|-------------|------|
| Owner | Orchestrator after first successful C1 |
| Guaranteed path | `try/finally` (or equivalent) ensuring ROLLBACK if `c1Mutated===true` |
| Idempotent | Re-running D1–D3 / stub delete safe if already disarmed |
| Independent of AP/N6 success | Yes |
| Removes stub | Yes (file + `.tmp`) |
| Verifies D1–D3 | Yes |
| Verifies executor zero | Yes |
| Partial failures | Recorded in receipt + events; elevates exit to `ROLLBACK_FAILED` if verify fails |
| Process restoration | **After** Domain C + safety PASS only; not inside armed continuum body |
| No Chat-dependent cleanup | Mandatory |

Extract shared `armed_continuum_rollback.js` from the duplicated `domainCRollback` / `rollback` helpers in AP03 captures (logic port; do not keep session hardcoding).

---

## 10. Failure classes

| Class | C1 may have occurred | Rollback mandatory | Final disposition | Retry | Recommended next action |
|-------|----------------------|--------------------|-------------------|-------|-------------------------|
| `PRECHECK_FAILED` | No | No | Fail-closed disarmed | No (fix preconditions) | Re-run pre-continuum gates |
| `AUTHORIZATION_INVALID` | No | No | Fail-closed | No | Fresh auth / proof-day G1 |
| `DOMAIN_A_STALE` | No | No | Fail-closed | No | Fresh Domain A |
| `ISOLATION_INVALID` | No | No | Fail-closed | No | Re-isolation |
| `ARMING_FAILED` | Maybe | **Yes if C1 succeeded** | Disarmed or `ROLLBACK_FAILED` | No | Investigate; new session if C2 consumed |
| `STUB_FAILED` | Yes | Yes | Disarmed | No | New continuum after auth reset rules |
| `INSUFFICIENT_POST_STUB_WINDOW` | Yes | Yes | Disarmed · proof not executed | No | Timing/perf fix; no AP04 reuse of same armed window |
| `AP_FAILED` | Yes | Yes | Disarmed | No | Close session per runbook |
| `N6_FAILED` | Yes | Yes | Disarmed | No | Close session |
| `DEADLINE_EXCEEDED` | Yes | Yes | Disarmed | No | Close session |
| `ROLLBACK_FAILED` | Yes | Attempted | **Explicit closure failure** | No | Immediate human Domain C emergency gate |
| `DOMAIN_C_FAILED` | Yes (then attempted rollback) | Already attempted | Closure failure | No | Emergency Domain C |
| `SAFETY_SUITE_FAILED` | Same | Already attempted | Closure failure | No | Emergency Domain C |
| `RECEIPT_WRITE_FAILED` | Possible | Should already be done | Disarmed preferred; evidence incomplete | No | Manual evidence salvage |
| `UNEXPECTED_STATE` | Possible | Yes if C1 | Fail-closed | No | Halt · human review |

**Retry allowed: no** for all classes inside the same armed continuum / same `continuumRunId`.

---

## 11. Causal event log

**Path:** `analysis/rb_g9_<session>_armed_continuum_events.jsonl`  
**Mode:** append-only · one JSON object per line · written during continuum (including armed states)

### Event fields
`schemaVersion` · `sessionId` · `continuumRunId` · `sequence` · `state` · `eventType` · `timestampUtc` · `monotonicElapsedMs` · `remainingArmedMs` · `actor` (`armed_continuum`) · `transitionMode` (`AUTO`|`MANUAL`) · `reasonCode` · `previousEventHash` · `eventHash` · `result` · `metadata` (safe only)

### Controlled reason codes
`PRECHECK_COMPLETE` · `AUTO_CHAIN` · `C1_COMPLETE` · `C2_COMPLETE` · `C3_COMPLETE` · `STUB_CREATED` · `STUB_VALIDATED` · `THRESHOLD_CHECK` · `AP_STARTED` · `AP_COMPLETED` · `N6_STARTED` · `N6_COMPLETED` · `ROLLBACK_STARTED` · `ROLLBACK_COMPLETED` · `DOMAIN_C_STARTED` · `DOMAIN_C_COMPLETED` · `SAFETY_STARTED` · `SAFETY_COMPLETED` · `DEADLINE_ABORT` · `VALIDATION_ABORT` · `UNEXPECTED_ERROR`

### Never log
Secrets · signer material · private keys · secret-bearing URLs · full environment · full command lines with secrets

Hash: SHA-256 over canonical JSON of event body excluding `eventHash`, chaining `previousEventHash`.

While armed: **no** narrative Markdown · **no** Authorizations index updates · **no** bulk Ori docs.

---

## 12. Machine receipts

### During continuum
- One JSON continuum receipt (`armed_continuum_receipt.js`)
- One JSONL event log
- Stub file only as runtime artifact

### After disarm (future operational use; not this planning gate)
- Generate human Markdown from machine evidence
- Link narrative to `continuumReceiptSha256`
- Preserve original authorization fingerprints
- Do not rewrite signed authorization bodies without explicit closure procedure

### Continuum receipt schema (minimum fields)
`schemaVersion` · `gate` · `sessionId` · `continuumRunId` · `status` · `failReason` · `armedStartUtc` · `armedDeadlineUtc` · `armedStartMonoRef` · `timingConstants` · `authorizationFingerprints` · `armingBaselineHash` · `isolatedProcessSetHash` · `configFingerprint` · `envFingerprintGateOnly` · `stubFingerprint` · `stubPurpose` · `thresholds` · `apSummary` · `n6Summary` · `rollback` · `domainC` · `safety` · `eventLogPath` · `eventLogHeadHash` · `eventLogTailHash` · `capitalExposure` · `orStatus` · `strategyReadiness` · `noSubmitProof` · `receiptSha256`

### Final status vocabulary
`PASS` · `FAIL_CLOSED_TIMING` · `FAIL_CLOSED_VALIDATION` · `FAIL_CLOSED_AP` · `FAIL_CLOSED_N6` · `FAIL_CLOSED_ROLLBACK` · `FAIL_CLOSED_DOMAIN_C` · `FAIL_CLOSED_UNEXPECTED`

---

## 13. Proof-day G1 validator changes

| Item | Specification |
|------|---------------|
| Module | New `armed_g1_proof_day.js` consumed by `armed_preflight_session.js` + continuum PRECHECK |
| Timezone source | Explicit IANA id (default `America/Denver`); reject missing/ambiguous |
| Proof day | Local calendar date in that TZ must equal `--proof-day-local` and G1 declared proof day |
| Operating block | Parse start/end to UTC once; single SoT pair in auth + CLI must match |
| Required expiry | `g1ExpiresAtUtc >= operatingBlockEndUtc + 60m` |
| Same-day signing | `g1SignedAt` local date in TZ must equal proof day |
| Reject reasons | `PROOF_DAY_NOT_REACHED` · `G1_EXPIRY_BEFORE_BLOCK_RESERVE` · `TIMEZONE_MISMATCH` · `G1_STALE` · `G1_REUSED` · `BLOCK_BINDING_MISMATCH` |
| Stale/reuse | Consumed/closed markers · fingerprint reuse registry in session receipts · expiry before now |
| Receipt fields | `proofDayLocal` · `timezone` · `blockStartUtc` · `blockEndUtc` · `g1ExpiresAtUtc` · `requiredMinExpiryUtc` · `g1ValidationResult` |
| Tests | `test_armed_g1_proof_day.js` covering AP02-class early expiry and AP03-day TZ edges |

---

## 14. No-submit capability boundary

Continuum must prove (static + test assertions):

| Prohibition | Enforcement approach |
|-------------|----------------------|
| No transaction construction | Do not import/call tx builders used by submit path; tests assert zero calls |
| No signer invocation | Do not load signer secret into continuum path beyond existing env presence checks already required for LIVE_ARMED posture |
| No RPC send / broadcast | Do not call `sendTransaction` / `sendRawTransaction` / `submitSwap` |
| No candidate selection | Adapters force empty candidate packet / proofScopeOnly |
| No quote request | Do not call Jupiter quote fetch for execution |
| Stub purpose | `armed_no_submit_proof_only` only |
| Micro-live purpose | Rejected by `r15_approval_validator` |

**Modules that must remain unreachable from continuum success path (no require of execution submit path):**
- Any continuum code path that calls `live_executor.submitSwap` (or equivalent submit entry)
- Quote/execution orchestration used for trades
- Micro-live execution runners

Allowed read-only: `computeLiveArmedStatus`, `deriveOperationalPosture`, `assertArmedProofApprovalRecord`, AP checks, N6 temp-harness probe, validators.

Integration tests must assert `broadcastCount=0` · `candidateCount=0` · `quoteCount=0` · `executorCount=0` · flat capital · no stub purpose other than armed-proof.

---

## 15. Exact code changes (planned)

### New orchestrator
| Field | Value |
|-------|-------|
| File | `run_armed_continuum.js` |
| Summary | One-shot continuum CLI |
| Exports | `runArmedContinuum` |
| State mutated | `.env` / `live_config` / stub **only** inside ARMING/STUB/ROLLBACK |
| Safety | Fail-closed · no retry · no Markdown while armed |
| Migration risk | Low if gated behind new command; production default unchanged |
| Tests | Integration suite |

### Timing utilities
| File | `armed_continuum_timing.js` |
| Functions | `createArmedTimer` · `remainingMs` · `assertMinRemaining` · constants export |
| State | None |
| Tests | Unit timing + sleep/jump simulation |

### Event logger
| File | `armed_continuum_events.js` |
| Functions | `createEventLog` · `appendEvent` · `seal` |
| State | JSONL file append |
| Tests | Hash chain · reason codes |

### Receipt schema
| File | `armed_continuum_receipt.js` |
| Functions | `buildContinuumReceipt` · `writeContinuumReceipt` |
| State | JSON file write at FINALIZE |
| Tests | Schema · secret scrub |

### G1 validator
| File | `armed_g1_proof_day.js` (+ wire into `armed_preflight_session.js`) |
| Functions | `validateProofDayG1(...)` |
| State | None |
| Tests | Proof-day matrix |

### Rollback wrapper
| File | `armed_continuum_rollback.js` |
| Functions | `rollbackDomainC` · `verifyDisarmed` |
| State | `.env` · `live_config` · stub delete |
| Tests | Idempotent fixture rollback |

### package.json
| Change | Add `run:armed-continuum` + continuum test scripts; wire into safety suite only after green and authorization |

### Documentation
| File | `docs/ARMED_PREFLIGHT.md` — continuum section, timing table, exit codes |

### Tests (new files listed in §4)

---

## 16. Implementation sequence

| Step | Work | Files | Acceptance | Deps | Production behavior change? |
|------|------|-------|------------|------|------------------------------|
| 1 | Timing utility + constants | `armed_continuum_timing.js` · unit test | All timing unit tests pass | None | **No** |
| 2 | G1 proof-day validator | `armed_g1_proof_day.js` · session wire · unit test | AP02-class cases reject | 1 optional | **No** until continuum used |
| 3 | Event log schema/writer | `armed_continuum_events.js` · unit test | Hash chain verifies | None | **No** |
| 4 | Rollback wrapper | `armed_continuum_rollback.js` · unit test | Idempotent on fixtures | None | **No** until called |
| 5 | State machine skeleton | `armed_continuum_state.js` · `run_armed_continuum.js` stub | Transitions + exit map | 1–4 | **No** (refuses without auth) |
| 6 | Stub integration | continuum + R15 validator | Stub purpose enforced · ≥12m gate | 5 | Only when commanded |
| 7 | AP integration | defer AP-17 adapter | AP once · ≥10m gate | 6 | Only when commanded |
| 8 | N6 integration | `runProbe` once | N6 once · ≥8m gate | 7 | Only when commanded |
| 9 | Domain C integration | validate + safety | Always after rollback | 4–8 | Only when commanded |
| 10 | Machine receipt | receipt writer | Schema + hash links | 3,9 | File under `analysis/` |
| 11 | Full tests | unit + integration | §17 green | 1–10 | **No** default |
| 12 | Documentation | `docs/ARMED_PREFLIGHT.md` · npm scripts | Docs match behavior | 11 | **No** |

Disarmed timing rehearsal: implemented as deterministic simulation in step 11 (`--dry-rehearsal` / fake clocks), **not** a production arming.

---

## 17. Mandatory test plan

### Unit
- Timing calculations · G1 proof-day · expiry margin · reason codes · hash chain · exit-code mapping · idempotent rollback

### Integration (simulated continuum; **no AP04 session**)
- Complete PASS path  
- Stub remaining >12m · exactly 12m · below 12m  
- AP at exactly 10m · below 10m  
- N6 threshold  
- Induced 3-minute UI/tool delay (must fail closed)  
- Stub / AP / N6 failure  
- Deadline crossed during AP · during N6  
- Receipt-write failure · rollback partial failure · Domain C failure · safety failure  
- Sleep/time-jump simulation  
- Duplicate invocation · stale/reused auth · wrong session · wrong stub fingerprint · loop-live set · unexpected executor  

### Safety assertions (every test)
No tx construction · no signing · no submit · no broadcast · no capital exposure · no retry · final state disarmed **or** explicit closure failure (`ROLLBACK_FAILED` / Domain C fail)

### Suite posture
Canonical `run_safety_tests.js` remains **85/85** or higher with explained additions only after implementation authorization explicitly allows suite expansion.

---

## 18. Acceptance criteria (implementation completion)

1. All new continuum tests pass  
2. Safety suite ≥ 85/85 with explained additions  
3. Deterministic simulation: stub ≥12m remaining → AP auto-starts → no manual handoff → Domain C reserve intact on success path  
4. Induced ≥3m delay fails closed before AP  
5. All failure classes trigger rollback when C1 occurred  
6. Event log explains every transition  
7. No-submit boundary proven in tests  
8. **No AP04 session or authorization used during testing**  
9. Production default path unchanged unless `run_armed_continuum` explicitly invoked under future auth  

---

## 19. Observation-process recommendation (planning only — no process changes)

| Process | During code implementation | During continuum integration tests | FOMO Wallet Monitor |
|---------|----------------------------|------------------------------------|---------------------|
| Dashboard / gmgn scanner | May remain in dry-run observation if already running; **not required** for unit work | Prefer **stopped** or fully isolated fixture host so tests do not collide with LIVE_ARMED probes | **Untouched always** |
| Monitor | Remains separate; do not couple | Do not start for continuum tests | — |
| Executor | Must remain zero | Must remain zero | — |

Do **not** change process state in this planning gate. Future implementation/auth gates will state exact stop/start rules.

---

## 20. Governance-record integrity dependency

**Choice:** Implementation planning and **implementation authorization for continuum code** may proceed with **machine receipts as temporary canonical timing evidence**. A separate **RB-G9 Governance Record Integrity Planning** gate remains a **parallel track** and is **not** a blocker for continuum *code* implementation authorization.

**Justification:**
- Accepted decision §7 already separated integrity from continuum planning
- Continuum code lives on the git-tracked surface; Ori untracked provenance does not change the safety of a new orchestrator behind an unused command
- AP04 *session* authorization and production continuum *execution* still require intact auth chain + proof-day G1 + Domain A + isolation — integrity work strengthens Ori Markdown provenance but machine JSON already binds timing
- Integrity gate should still occur before relying on Ori Markdown wall-clock as evidence in disputes — not before authorizing code work

---

## 21. Implementation authorization status

**READY FOR IMPLEMENTATION AUTHORIZATION**

Not ready for:
- AP04 session authorization  
- Production continuum execution  
- G1–G4 signing  

---

## 22–24. Records

| Record | Action |
|--------|--------|
| This planning file | Created |
| Decisions README | No change (decision already indexed) |
| Cursor Run Log | Exactly one row appended |
| Code / `.env` / `live_config` / processes / git lock | Untouched |

---

## 25. Recommended next gate

**RB-G9 Armed Continuum Remediation Implementation Authorization**

---

## 26. Planning completion attestation

| Field | Value |
|-------|-------|
| Planning completion UTC | **`2026-07-11T23:10:55.921Z`** |
| AP04 authorized | **no** |
| Session created | **no** |
| Authorizations created | **no** |
| Arming performed | **no** |
| Runtime stub created | **no** |
| AP/N6 invoked | **no** |
| Production posture | disarmed · `PIPELINE_DRY_RUN` · `dryRunMode true` · `liveArmed false` |
| OR-20260630-008 | **not_promoted** |
| Strategy readiness | **NOT READY** |
| Design amendment required | **no** |

---

**Canonical path:**  
`Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9 Armed Continuum Remediation Implementation Planning — 2026-07-11.md`

Operating principle: Strength through honesty, speed through integrity.
