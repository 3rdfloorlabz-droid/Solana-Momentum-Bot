# RB-G9 AP02 Arming Authorization Planning — 2026-07-11

Status:
**PLANNING COMPLETE — PRODUCTION DISARMED UNCHANGED — NO G2 SIGNED — CURRENT G1 CANNOT SUPPORT PROOF WINDOW**

Gate type:
Session-bound G2 arming authorization design — planning and documentation only

Prerequisites:
`AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260713-AP02 — 2026-07-11.md` · `RB-G9 AP02 R15 AUTHORIZATION — 2026-07-11.md` · `RB-G9 AP02 PRE-G1 OPERATIONAL READINESS — 2026-07-11.md` · `RB-G9 AP02 PROOF-DAY RUNBOOK — 2026-07-11.md`

Planning capture UTC:
**`2026-07-11T03:06:19Z`**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**G2 created/signed:** **No** · **G3/G4 created:** **No** · **Current G1 modified:** **No** · **Runtime stub / session folder:** **Not created** · **Arming performed:** **No**

---

## 1. Prominent post-gate state

> **DISARMED · DRY · NO TRADE**
>
> **G2 ARMING AUTHORIZATION DESIGN DOCUMENTED**
>
> **CURRENT G1 CANNOT SUPPORT SELECTED PROOF WINDOW**
>
> **G2 READY PENDING FRESH PROOF-DAY G1 — DO NOT SIGN G2 AGAINST CURRENT G1**

---

## 2. Files inspected (read-only)

| File | Purpose |
|------|---------|
| `Authorizations/AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260713-AP02 — 2026-07-11.md` | Signed AP02 G1 — SIGNED/UNUSED |
| `RB-G9 AP02 R15 AUTHORIZATION — 2026-07-11.md` | G1 gate receipt |
| `RB-G9 AP02 R15 AUTHORIZATION PLANNING — 2026-07-11.md` | AP02 G1 design |
| `RB-G9 AP02 OPERATING WINDOW SELECTION — 2026-07-11.md` | Confirmed window |
| `RB-G9 AP02 PRE-G1 OPERATIONAL READINESS — 2026-07-11.md` | Process/wrapper readiness |
| `RB-G9 AP02 PROOF-DAY RUNBOOK — 2026-07-11.md` | Proof/rollback staging |
| `RB-G9-20260709-AP01 UNUSED AUTHORIZATION CHAIN CLOSURE — 2026-07-11.md` | Closure precedent |
| `FRESH ARMED NO-SUBMIT PROOF ARMING AUTHORIZATION PLANNING — 2026-07-09.md` | AP01 G2 planning structure |
| `Authorizations/AUTHORIZATION — Arming — RB-G9-20260709-AP01 — 2026-07-09.md` | AP01 G2 structure (closed — reference only) |
| `Authorizations/AUTHORIZATION — Process Isolation Scope Amendment — RB-G9-20260709-AP01 — 2026-07-10.md` | Isolation amendment (closed — design carry-forward) |
| `Decisions/DECISION — Armed No-Submit Production Proof — 2026-07-09.md` | C1–C3 · 15m cap |
| `Decisions/DECISION — Armed-Context Preflight Architecture — 2026-07-08.md` | Three-domain model |
| `armed_preflight_session.js` | Chain validation · explicit paths · consumed detection |
| `Authorizations/README.md` · `Sessions/README.md` | Index state |
| `live_config.json` | Disarmed posture |

Signed G1 body **not modified**. AP01 signed authorization bodies **not edited**.

---

## 3. G1 timing-conflict result

| Field | Value |
|-------|-------|
| **Current G1 signature UTC** | **`2026-07-11T02:53:21Z`** |
| **Current G1 expiry UTC** | **`2026-07-13T02:53:21Z`** *(48 hours after signature)* |
| **Selected operating block start UTC** | **`2026-07-13T20:00:00Z`** *(14:00 MDT)* |
| **Selected operating block end UTC** | **`2026-07-14T02:00:00Z`** *(20:00 MDT)* |
| **Exact expiry-to-window-start gap** | **`17 hours 6 minutes 39 seconds`** *(61,599,000 ms)* |
| **G1 remaining at block start** | **None** — expired ~17h 6m earlier |

**G1 timing-conflict result:** **FAIL — CURRENT G1 CANNOT SUPPORT THE SELECTED PROOF WINDOW**

Current G1 **cannot** authorize proof-day Final Fresh Domain A · Process Isolation · C1–C3 · stub creation · armed proof · or AP/N6 invocation. **Do not sign G2 against this G1.**

---

## 4. Current G1 disposition recommendation

| Rule | Policy |
|------|--------|
| **Leave current G1 unchanged** | **Yes** — signed body · timestamp · expiry · fingerprint preserved |
| **Status until closure** | **SIGNED/UNUSED** |
| **Use for G2–G4 signing** | **Forbidden** |
| **At expiry or proof-day morning** | Formal closure gate: **`EXPIRED_UNUSED — SUPERSEDED_BEFORE_EXECUTION`** |
| **Signed body edit** | **Forbidden** |
| **Consumed claim** | **Forbidden** — never armed · never executed |
| **Replacement** | Fresh proof-day G1 under resolved session-ID policy (§5) |

Follows AP01 closure precedent: unused chain closed with **`SUPERSEDED_BEFORE_EXECUTION`** while preserving original fingerprints.

---

## 5. Session-ID policy resolution

### 5.1 Evaluation matrix

| Criterion | Same-session replacement (`RB-G9-20260713-AP02`) | New session (`RB-G9-20260713-AP03`) |
|-----------|--------------------------------------------------|---------------------------------------|
| Signed-history preservation | **Yes** — old G1 closed · body unchanged · fingerprint `f2c495ec…` preserved | **Yes** — AP02 chain closed as unused attempt |
| `oneSessionOnly` semantics | **Compatible** — one proof execution per session; early G1 was unused scope signature only | **Compatible** — new chain |
| Runtime guard ambiguity | **Low** — `validateProofAuthorizationChain` uses **explicit paths**; consumed docs fail if referenced; no directory scan | **None** |
| Authorization discovery | **Explicit manifest / `--auth-g1` paths only** — no “latest file” inference | **Clean** |
| Canonical path collision | **No** — distinct sign dates: `…AP02 — 2026-07-11.md` vs `…AP02 — 2026-07-13.md` | **No** |
| Two G1 records same session | **Manageable** — closure index + manifest binds fresh path only | **N/A** |

### 5.2 Fail-closed rule

**Same-session replacement permitted:** **Yes** — with mandatory closure of expired G1 and explicit path binding for fresh G1–G4.

Conditions:
1. Closure gate marks **`AUTHORIZATION — … AP02 — 2026-07-11.md`** as **`EXPIRED_UNUSED — SUPERSEDED_BEFORE_EXECUTION`** via index/receipt only
2. Fresh G1 signed proof-day with **distinct filename** `{SIGN_DATE}` matching proof-day calendar date (e.g. **`2026-07-13`**)
3. G2–G4 bind **fresh G1 path and fingerprint** — never the closed record
4. Session manifest lists **only** fresh chain paths
5. **`FORBIDDEN_PATH_MARKERS`** in `armed_preflight_session.js` **not** triggered for closed AP02 G1 unless future code change adds AP02 early path — **not recommended**; closure uses index/consumed markers in README only

**Use `RB-G9-20260713-AP03` only if:** closure/supersession cannot be documented unambiguously · or governance rejects two G1 files under one session ID · or runtime/manifest binding fails review.

### 5.3 Final recommended session ID

**`RB-G9-20260713-AP02`** — retain planned session ID after expired-G1 closure and fresh proof-day G1 re-sign.

---

## 6. Required pre-proof closure / supersession gate

| Field | Value |
|-------|-------|
| **Gate name** | **RB-G9-20260713-AP02 Expired G1 Closure and Supersession Planning** *(then authorization/closure execution)* |
| **Terminal status** | **`EXPIRED_UNUSED — SUPERSEDED_BEFORE_EXECUTION`** |
| **Original G1 fingerprint** | **`f2c495ec6784df10d9a211a5d5748a8461f6060b4f646fa369d8fc4ab7ed014a`** — preserved |
| **Signed body** | **Unchanged** |
| **Consumed claim** | **No** |
| **Proof executed claim** | **No** |
| **Runtime authority after expiry** | **None** |

---

## 7. Proof-day authorization timing (recommended coordinated block)

| Phase | Timing (MDT) | Action |
|-------|--------------|--------|
| Access + readiness confirmation | **14:00–14:30** | Reconfirm host · power · wrappers · FOMO exclusion |
| Close/supersede expired G1 | **~14:30** | If not already expired-closed |
| Sign fresh G1 | **Immediately after closure** | Expiry ≥ **`2026-07-14T06:00:00Z`** recommended |
| Sign G2 · G3 · G4 · isolation amendment | **Same coordinated block** | Verify fingerprints · same session linkage |
| Final Fresh Domain A | **Immediately after G1–G4 validation** | Fresh baseline capture |
| Process Isolation | **Immediately after Domain A PASS** | Exact-identity stops |
| Arming Transition (C1–C3) | **Only if freshness thresholds pass** | Separate execution gate |
| Stub · AP · N6 | **G3/G4 authorized gates only** | Within 15m armed window |

**Fresh G1 sign target:** no later than **2026-07-13 10:00 MDT** if Domain A starts at 14:00 MDT *(≥ 4h G1 lifetime before Domain A)* — or sign at block start if Domain A follows immediately after G1–G4 in same block.

---

## 8. Fresh G1 validity requirement

| Rule | Value |
|------|-------|
| **Must extend beyond entire operating block** | Through **`2026-07-14T02:00:00Z`** + contingency |
| **Recommended minimum expiry** | **`2026-07-14T06:00:00Z`** *(4h after block end)* |
| **Typical validity if signed ~14:30 MDT Jul 13** | 48h → **`2026-07-15T20:30:00Z`** approx — exceeds minimum |
| **`oneSessionOnly`** | **true** |
| **Automatic extension** | **Forbidden** |
| **Reuse after proof/abort/disarm/expiry** | **Forbidden** |

---

## 9. G2 canonical path

```
Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — Arming — RB-G9-20260713-AP02 — {SIGN_DATE}.md
```

`{SIGN_DATE}` = calendar date of Taylor G2 signature on proof day (expected **`2026-07-13`**).

**Not created or signed in this gate.** G2 **must** bind **fresh** G1 path/fingerprint — not `…AP02 — 2026-07-11.md`.

---

## 10. G2 purpose and scope

| Field | Value |
|-------|-------|
| **Purpose** | Authorize **exactly one future C1–C3 posture transition** for armed no-submit proof |
| **Session binding** | **`RB-G9-20260713-AP02`** exclusively — linked to **fresh** signed G1 |
| **Maximum LIVE_ARMED duration** | **15 minutes** from confirmed `LIVE_ARMED` |
| **Transitions authorized** | **One only** — non-reusable |
| **Disarm obligation** | Immediate rollback after PASS · FAIL · abort · ambiguity · or timeout |

G2 authorizes **posture transition only**. It **does not** authorize proof execution · runtime-stub creation · process stop execution · candidate selection · submission · broadcast · or capital exposure.

---

## 11. Authorized C1–C3 only

| Step | Target | Field | Authorized change |
|------|--------|-------|-------------------|
| **C1** | gitignored `.env` | `FOMO_ENABLE_LIVE_SUBMISSION` | unset → **`YES`** |
| **C2** | `live_config.json` | `executionMode` | **`PIPELINE_DRY_RUN`** → **`LIVE`** |
| **C3** | `live_config.json` | `dryRunMode` | **`true`** → **`false`** |

Any other `.env` or `live_config.json` mutation during transition → **abort**.

---

## 12. Explicitly unchanged state

| Item | Requirement |
|------|-------------|
| `FOMO_ALLOW_LOOP_LIVE` | Remains **unset / not YES** |
| G3 manual slippage override | **Disabled** |
| `positionSizeSol` | **Unchanged** — **0.005** |
| Slippage bounds | **Unchanged** |
| Candidate · quote · trade · capital fields | **Not introduced** |
| Other `live_config` fields | **No changes** |
| Production code / tests | **No changes** |
| Runtime stub | **Not created** by G2 sign-off |
| Executor processes | **Not started** |
| AP / N6 | **Not invoked** by G2 |

---

## 13. Process-isolation authority (incorporated into G2 planning)

**Isolation authority incorporated:** **Yes** — design carry-forward from pre-G1 readiness; fresh additive amendment or G2 text at sign-off.

### Authorized future isolation targets

| Target | Rule |
|--------|------|
| **Monitor restart wrapper** | Stop by **exact command identity** before `monitor.js` |
| **`monitor.js`** | Authorized Node target |
| **`dashboard_server.js`** | Authorized Node target |
| **`scanner_gmgn_trending.js --watch`** | Authorized Node target |
| **Dashboard passive launcher (PID 20188 class)** | **Not stopped** — passive · not restart wrapper |
| **Scanner restart wrapper for gmgn** | **Not positively identified** — stop gmgn node only |
| **Observation loops** (`scanner.js` · `b2a_24h`) | **Ordinary close before Domain A** — not governed isolation targets |

### Explicit process exclusions

- **FOMO Wallet Monitor** — `FOMO-Wallet-Intel\run-monitor.bat` — **never stop**
- Broad PowerShell · broad `node.exe` · parent-tree wildcards · services · scheduled tasks · Cursor/editor shells

### Isolation execution rules

- Wrappers before Node children
- **≥ 10 seconds** no-respawn observation
- Derive **`isolatedProcessSetHash`** before C1
- **`isolatedProcessSetHash` required** before arming transition

**Approved monitor restart-wrapper identity:**

```
powershell.exe -NoExit -Command cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot; while ($true) { Get-Date; node monitor.js; Start-Sleep -Seconds 60 }
```

---

## 14. Baseline-binding requirements

G2 use requires **fresh** G1–G4 chain binding:

| Binding | Requirement |
|---------|-------------|
| Final session ID | **`RB-G9-20260713-AP02`** exact |
| G1–G4 paths and fingerprints | Exact · fresh chain only |
| Final Fresh Domain A | **PASS** |
| Domain A freshness before isolation | **≥ 20 minutes** remaining |
| Domain A freshness before C1 | **≥ 12 minutes** remaining |
| **`armingBaselineHash`** | Exact · from fresh Domain A |
| **`isolatedProcessSetHash`** | Exact · from isolation PASS |
| Code fingerprint | Exact |
| `live_config.json` hash | Exact |
| Environment-gate fingerprint | Exact |
| Process-set fingerprints | Pre/post isolation exact |
| Runtime stub | **Absent** before G3 use |
| Executor processes | **0** |
| Position/reconciliation/recovery/capital | **None** |

---

## 15. Process-stop preconditions

| Precondition | Required |
|--------------|----------|
| Monitor restart wrapper stopped | **Yes** — exact identity |
| `monitor.js` stopped | **Yes** |
| `dashboard_server.js` stopped | **Yes** |
| `scanner_gmgn_trending.js` stopped | **Yes** |
| Observation loops absent before baseline | **Yes** — operator cleanup |
| Dashboard passive launcher | **Not unnecessarily terminated** |
| FOMO Wallet Monitor | **Untouched** |
| `live_executor.js` count | **0** |
| Respawn after stop | **None** |
| Automatic restart during proof window | **Forbidden** |
| Controlled process delta | **PASS** |

---

## 16. Pre-transition conditions

| Check | Required state |
|-------|----------------|
| Fresh G1–G4 | Valid · signed · unused · same-session · explicit paths |
| Domain A | Fresh · within threshold |
| Isolation | **PASS** |
| `liveArmed` | **`false`** |
| Posture | **`PIPELINE_OBSERVING`** |
| `executionMode` | **`PIPELINE_DRY_RUN`** |
| `dryRunMode` | **`true`** |
| `FOMO_ENABLE_LIVE_SUBMISSION` | **Not YES** |
| `FOMO_ALLOW_LOOP_LIVE` | **Not YES** |
| Runtime stub | **Absent** |
| Signer/public address | Match G1 |
| RPC read-only health | **PASS** |
| Capital state | **Flat** |
| OR-20260630-008 | **not_promoted** |

---

## 17. Post-transition checks

| Check | Expected |
|-------|----------|
| Config/env delta | **C1–C3 only** |
| `liveArmed` | **`true`** |
| Posture | **`LIVE_ARMED`** |
| Armed timer | **15-minute countdown starts** |
| Executor count | **0** |
| Submit/sign/broadcast count | **0** |
| Transaction signatures | **None** |
| Position/reconciliation/recovery/capital | **None** |
| Runtime stub | **Still absent** until G3-authorized creation |

---

## 18. Rollback procedure (D1–D11 summary)

On abort · timeout · ambiguity · or normal PASS closure:

| Step | Action |
|------|--------|
| **D1** | Unset/remove `FOMO_ENABLE_LIVE_SUBMISSION` |
| **D2** | `executionMode` → **`PIPELINE_DRY_RUN`** |
| **D3** | `dryRunMode` → **`true`** |
| **D4** | Verify `liveArmed: false` · **`PIPELINE_OBSERVING`** |
| **D5** | Stop executor processes |
| **D6** | Remove/consume runtime stub if created |
| **D7** | Verify flat state |
| **D8** | Domain C: `validate_live_system.js` **PASS** |
| **D9** | Domain C: `run_safety_tests.js` **85/85 PASS** |
| **D10** | File session evidence |
| **D11** | Close G1–G4 + amendment — **CONSUMED/CLOSED** |

Restoration of monitor/dashboard/scanner **only after Domain C** per runbook §6.

---

## 19. Invalidation triggers

- Expired or superseded G1 (including current `…2026-07-11` record)
- Wrong G1 fingerprint · session mismatch
- Stale Domain A · missing `isolatedProcessSetHash`
- Process/config/code/environment/auth fingerprint drift
- Wrapper identity mismatch · FOMO Wallet Monitor targeted
- Unexpected executor · runtime stub present before G3 gate
- Execution-path call · `txSig` · position/reconciliation/recovery/capital
- Secret exposure · OR status change
- Insufficient timing threshold · ambiguity at any stage

---

## 20. No-rush thresholds

| Threshold | Minimum | Override |
|-----------|---------|----------|
| Fresh G1 lifetime before Domain A | **≥ 4 hours** | **Forbidden** |
| Domain A freshness before isolation | **≥ 20 minutes** | **Forbidden** |
| Domain A freshness before C1 | **≥ 12 minutes** | **Forbidden** |
| LIVE_ARMED time remaining before AP | **≥ 10 minutes** | **Forbidden** |

---

## 21. Governance sequence (same-session replacement — recommended)

1. **RB-G9-20260713-AP02 Expired G1 Closure and Supersession Planning**
2. **RB-G9-20260713-AP02 Expired G1 Closure** *(or combined closure gate on proof day)*
3. **Fresh AP02 G1 Authorization** *(proof-day morning · expiry ≥ 2026-07-14T06:00:00Z)*
4. **AP02 G2 Authorization**
5. **AP02 G3 Authorization**
6. **AP02 G4 Authorization**
7. **AP02 Process Isolation Scope Amendment Authorization**
8. **Final Fresh Domain A Proof for AP02**
9. **Process Isolation Gate**
10. **Arming Transition Gate**
11. **Runtime Stub Creation Gate**
12. **Armed No-Submit Proof Execution Gate**
13. **Immediate Domain C Closure**

Steps 3–7: one coordinated governance block. Steps 8–13: one coordinated operating block.

### Alternate sequence (if same-session replacement rejected)

1. AP02 Expired G1 Closure
2. **RB-G9 AP03 R15 Authorization Planning**
3. AP03 G1–G4 + remaining proof chain under **`RB-G9-20260713-AP03`**

---

## 22. G2 planning readiness

| Field | Value |
|-------|-------|
| **G2 planning readiness** | **READY pending fresh proof-day G1** |
| **Blocked by session-ID ambiguity** | **No** — same-session replacement unambiguous with closure + explicit paths |
| **Governance amendment required** | **No** |
| **May sign G2 against current G1** | **No** — timing conflict · fail closed |

---

## 23. Post-gate verification

| Check | Result |
|-------|--------|
| Current G1 modified | **No** |
| G2 / G3 / G4 created | **No** |
| Production code / tests changed | **No** |
| Config / environment changed | **No** |
| Processes stopped or started | **No** |
| Runtime stub / session folder | **Not created** |
| C1/C2/C3 performed | **No** |
| Submit/sign/broadcast | **No** |
| System remains disarmed | **Yes** |

Readiness/profitability claims: **none**

---

## 24. Recommended next gate

**RB-G9-20260713-AP02 Expired G1 Closure and Supersession Planning**

---

**Receipt path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9 AP02 ARMING AUTHORIZATION PLANNING — 2026-07-11.md`
