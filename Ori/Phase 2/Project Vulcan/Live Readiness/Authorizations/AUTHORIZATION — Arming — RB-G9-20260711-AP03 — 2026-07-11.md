# AUTHORIZATION — Arming — Armed No-Submit Proof · Pre-Transition — RB-G9-20260711-AP03 — 2026-07-11

> **ARMING AUTHORIZATION ONLY**
>
> **ACTUAL ARMING NOT PERFORMED**
>
> **ARMED NO-SUBMIT PROOF EXECUTION NOT AUTHORIZED**
>
> **NO CAPITAL EXPOSURE**
>
> This record authorizes a **future Arming Transition Execution Gate** for one temporary C1–C3 posture transition supporting the armed no-submit proof. It **does not** change flags, arm the system, create a runtime approval stub, invoke AP-01–AP-20, run the armed-safe N6 probe, submit, sign, broadcast, or expose capital.

---

## Record metadata

| Field | Value |
|-------|-------|
| **Gate name** | RB-G9-20260711-AP03 Arming Authorization |
| **Record type** | Arming Authorization · Armed No-Submit Proof · Governance-only (G2) |
| **Status** | **CONSUMED — C1–C3 PERFORMED — LIVE_ARMED — NO CAPITAL EXPOSURE** |
| **Authorization status** | **CONSUMED/USED** |
| **Consumption timestamp (UTC)** | **`2026-07-11T20:17:49.926Z`** |
| **Consumption gate receipt** | [`../RB-G9-20260711-AP03 ARMING TRANSITION GATE — 2026-07-11.md`](../RB-G9-20260711-AP03%20ARMING%20TRANSITION%20GATE%20%E2%80%94%202026-07-11.md) |
| **Signer** | **Taylor Cheaney** |
| **Signature timestamp (UTC)** | **`2026-07-11T19:37:52Z`** |
| **Signature timestamp (local)** | **`Sat Jul 11 2026 13:37:52 GMT-0600 (Mountain Daylight Time)`** |
| **Signature date** | **2026-07-11** |
| **Linked session ID** | **`RB-G9-20260711-AP03`** |
| **Linked G1 (R15)** | [`AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260711-AP03 — 2026-07-11.md`](AUTHORIZATION%20%E2%80%94%20R15%20ARMED-NO-SUBMIT%20ONE_SESSION_ONLY%20%E2%80%94%20RB-G9-20260711-AP03%20%E2%80%94%202026-07-11.md) |
| **Linked G1 fingerprint (SHA-256)** | **`2271bfc79a75f798c40adf54f2b25822bd3b7f44f473ba4ed89e6a63eff92e7e`** |
| **G1 signature timestamp (UTC)** | **`2026-07-11T19:31:35Z`** |
| **G1 authorization expiry (UTC)** | **`2026-07-12T07:00:00Z`** |
| **G1 schemaVersion** | **`2`** |
| **G1 approvalPurpose** | **`armed_no_submit_proof_only`** |
| **G1 finalApprovalStatus** | **`APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY`** |
| **Previous sessions (closed — must not reuse)** | **`RB-G9-20260706-EV01`** · **`RB-G9-20260707-EV02`** · **`RB-G9-20260709-AP01`** · **`RB-G9-20260713-AP02`** *(superseded before execution)* |
| **Research wallet public address** | `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |
| **Maximum LIVE_ARMED duration** | **15 minutes** from first confirmed `liveArmed: true` |
| **OR-20260630-008** | **not_promoted** |
| **Strategy readiness** | **NOT READY** |
| **Capital exposure status** | **none** |
| **Operating window reselection** | [`../RB-G9 AP03 OPERATING WINDOW RESELECTION — 2026-07-11.md`](../RB-G9%20AP03%20OPERATING%20WINDOW%20RESELECTION%20%E2%80%94%202026-07-11.md) |
| **Linked G1 gate receipt** | [`../RB-G9-20260711-AP03 FRESH R15 AUTHORIZATION — 2026-07-11.md`](../RB-G9-20260711-AP03%20FRESH%20R15%20AUTHORIZATION%20%E2%80%94%202026-07-11.md) |
| **Sign-off gate receipt** | [`../RB-G9-20260711-AP03 ARMING AUTHORIZATION — 2026-07-11.md`](../RB-G9-20260711-AP03%20ARMING%20AUTHORIZATION%20%E2%80%94%202026-07-11.md) |

**One future use only · non-reusable**

---

## 1. G2 scope (one future posture transition only)

Taylor authorizes **only** a future **Arming Transition Execution Gate** to apply the **minimum C1–C3 flag transition** below — **if and only if** all pre-transition conditions in §7 pass, including G3, G4, and AP03 process-isolation authorization signed, fresh Domain A proof, process isolation PASS, and all no-rush thresholds satisfied.

| Field | Value |
|-------|-------|
| **Purpose** | One temporary posture transition supporting armed no-submit proof |
| **Session binding** | **`RB-G9-20260711-AP03`** exclusively — linked to signed G1 |
| **Transitions authorized** | **One only** — non-reusable |
| **Maximum armed duration** | **15 minutes** from first confirmed `LIVE_ARMED` |
| **Rollback obligation** | Immediate after PASS · FAIL · abort · ambiguity · or timeout |

**This signed record does not authorize proof execution, runtime-stub creation, process stopping, AP manifest execution, N6 armed probe, submit, sign, broadcast, or capital exposure.**

---

## 2. Authorized future C1–C3 changes (transition gate only — not applied in this gate)

| Order | Target | Field | Authorized change |
|-------|--------|-------|-------------------|
| **C1** | gitignored `.env` | `FOMO_ENABLE_LIVE_SUBMISSION` | unset / not YES → **`YES`** |
| **C2** | `live_config.json` | `executionMode` | **`PIPELINE_DRY_RUN`** → **`LIVE`** |
| **C3** | `live_config.json` | `dryRunMode` | **`true`** → **`false`** |

**Any other `live_config.json` or `.env` mutation during transition → abort.**

### Expected post-C3 verification (read-only)

When C1–C3 complete and all submission gates satisfied: `computeLiveArmedStatus()` may return `liveArmed: true` and `operationalPosture: LIVE_ARMED` — **without** authorizing submit, sign, broadcast, or capital exposure. Proof guards and G4 scope remain fail-closed.

---

## 3. Explicitly unchanged state

| Item | Requirement |
|------|-------------|
| `FOMO_ALLOW_LOOP_LIVE` | Remains **unset / not YES** |
| G3 manual slippage override | Remains **disabled** |
| `positionSizeSol` | **Unchanged** — current **0.005** |
| Slippage limits | **Unchanged** |
| Candidate · quote · trade · capital fields | **Not added** |
| Other `live_config` fields | **No changes** |
| Production code or tests | **No changes** |
| Runtime stub | **Not created** in this gate |
| Processes | **Not started** — zero executor loops |
| AP / N6 | **Not invoked** by this gate |

---

## 4. No-rush thresholds (fail closed — no override)

| Threshold | Minimum remaining | Applies before |
|-----------|-------------------|----------------|
| **G1 lifetime when Domain A begins** | **≥ 4 hours** until G1 expiry | Final Fresh Domain A start |
| **Domain A freshness before isolation** | **≥ 20 minutes** | Process Isolation start |
| **Domain A freshness before C1** | **≥ 12 minutes** | C1 |
| **LIVE_ARMED window before AP invocation** | **≥ 10 minutes** | AP/N6 in armed posture |

---

## 5. Baseline-binding requirements (before future G2 use)

Future arming transition may proceed **only if** G2 is bound to:

| Binding | Requirement |
|---------|-------------|
| **G1–G4 + isolation authorization** | All signed · valid · unused · same session |
| **Final Fresh Domain A** | **PASS** · fresh within thresholds |
| **`armingBaselineHash`** | Exact · from fresh Domain A |
| **`isolatedProcessSetHash`** | Exact · from process isolation PASS |
| **`live_config.json` SHA-256** | Exact pre-arming hash |
| **Code fingerprint** | Exact |
| **Environment-gate fingerprint** | Exact |
| **Process-set fingerprints** | Pre/post isolation exact |
| **G1–G4 fingerprints** | All governance records same session |
| **Runtime stub** | **Absent** before G3 creation gate |
| **Executor processes** | **0** |
| **Positions / reconciliation / recovery / capital** | **None** |

Any drift after final pre-C1 validation → G2 use **invalid**.

---

## 6. Process-isolation conditions (before C1)

| Target | Policy |
|--------|--------|
| **Observation loops** (`scanner.js` · `b2a_24h`) | **Absent before Final Fresh Domain A** — operator cleanup |
| **Monitor restart wrapper** | Stop **first** by exact command identity: `powershell.exe -NoExit -Command cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot; while ($true) { Get-Date; node monitor.js; Start-Sleep -Seconds 60 }` |
| **`monitor.js`** | **Stopped** |
| **Dashboard passive launcher** | **Untouched** — PASSIVE_LAUNCHER unless future inventory positively proves active restart |
| **`dashboard_server.js`** | **Stopped** |
| **`scanner_gmgn_trending.js --watch`** | **Stopped** |
| **Scanner restart wrapper** | Stop **only if positively identified** and separately authorized |
| **FOMO Wallet Monitor** | **Explicitly excluded** — `FOMO-Wallet-Intel\run-monitor.bat` · **never stop** |
| **`live_executor.js`** | **Count 0** |
| **Broad PowerShell/Node/process-tree termination** | **Forbidden** |
| **No-respawn observation** | **≥ 10 seconds** after stops |
| **Controlled process delta** | **PASS** |
| **`isolatedProcessSetHash`** | **Derived and bound** |

AP01 Process Isolation Scope Amendment is **historical design evidence only** — **not** authorization reuse for AP03.

---

## 7. Pre-transition conditions (abort if any fail)

| # | Condition |
|---|-----------|
| **P1** | G1–G4 signed · valid · unused · same session **`RB-G9-20260711-AP03`** |
| **P2** | AP03 process-isolation authorization signed · valid · unused |
| **P3** | G1 unexpired · **≥ 4 hours** remaining when Domain A began |
| **P4** | G2 signed and session-linked *(this record)* |
| **P5** | Final Fresh Domain A **PASS** · **≥ 20 min** freshness before isolation · **≥ 12 min** before C1 |
| **P6** | Process isolation **PASS** · `isolatedProcessSetHash` bound |
| **P7** | `liveArmed` **false** |
| **P8** | Posture **`PIPELINE_OBSERVING`** |
| **P9** | `executionMode` **`PIPELINE_DRY_RUN`** |
| **P10** | `dryRunMode` **`true`** |
| **P11** | `FOMO_ENABLE_LIVE_SUBMISSION` **not YES** |
| **P12** | `FOMO_ALLOW_LOOP_LIVE` **not YES** |
| **P13** | Runtime stub **absent** *(before G3 creation gate)* |
| **P14** | Signer / public address match G1 |
| **P15** | Dedicated RPC read-only health **PASS** |
| **P16** | G3 manual slippage override **disabled** |
| **P17** | OR-20260630-008 **not_promoted** |
| **P18** | Flat state — no position · reconciliation · recovery · capital |
| **P19** | All baseline fingerprints match |

---

## 8. Required transition order (future execution gate)

1. Revalidate all bindings immediately before use
2. Perform **C1** · verify C1 only
3. Perform **C2** · verify C2 only
4. Perform **C3** · verify C3 only
5. Run armed-posture validation
6. Confirm `liveArmed: true` · posture **`LIVE_ARMED`**
7. Start **15-minute** armed timer
8. Confirm executor count **0**
9. Confirm submit/sign/broadcast count **0**
10. Confirm runtime stub **still absent** until G3-authorized creation

---

## 9. Post-transition verification requirements

| Check | Expected |
|-------|----------|
| **Only C1–C3 changed** | **Yes** |
| **`liveArmed`** | **`true`** |
| **Posture** | **`LIVE_ARMED`** |
| **Executor loops** | **0** |
| **Submit / sign / broadcast** | **None** |
| **Transaction signature** | **None** |
| **Position / reconciliation / recovery / capital** | **None** |
| **Runtime stub** | **Absent** until separately authorized G3 gate |
| **Armed timer** | Starts at first confirmed `LIVE_ARMED` timestamp |

---

## 10. 15-minute armed timer rule

| Rule | Detail |
|------|--------|
| **Start** | First confirmed `liveArmed: true` after C3 |
| **Cap** | **15 minutes** — no extension |
| **Minimum before AP invocation** | **≥ 10 minutes** remaining |
| **Delayed proof** | If proof cannot begin promptly → **disarm** |
| **Timeout** | **Mandatory rollback** |

---

## 11. Invalidation triggers

G2 becomes **invalid immediately** if any occur:

| # | Trigger |
|---|---------|
| **I1** | G1 invalid · expired · consumed · wrong path/fingerprint · or session mismatch |
| **I2** | G2 reuse after consumption |
| **I3** | G3 · G4 · or isolation authorization missing or invalid at transition time |
| **I4** | Stale Domain A · missing `armingBaselineHash` or `isolatedProcessSetHash` |
| **I5** | Code / config / environment / process / auth fingerprint drift |
| **I6** | Wrapper identity mismatch · FOMO Wallet Monitor targeted |
| **I7** | Unauthorized environment or config value |
| **I8** | Monitor / dashboard / scanner active at C1 without isolation PASS |
| **I9** | Unexpected executor or runtime stub before G3 gate |
| **I10** | Signer / wallet / RPC mismatch |
| **I11** | Position / reconciliation / recovery / capital |
| **I12** | Execution-path call · any `txSig` |
| **I13** | Secret exposure |
| **I14** | OR-20260630-008 status change |
| **I15** | Insufficient timing threshold |
| **I16** | Ambiguity |

---

## 12. Mandatory rollback (D1–D11)

| Step | Action |
|------|--------|
| **D1** | Unset/remove `FOMO_ENABLE_LIVE_SUBMISSION` in `.env` |
| **D2** | `executionMode` → **`PIPELINE_DRY_RUN`** |
| **D3** | `dryRunMode` → **`true`** |
| **D4** | Verify `liveArmed: false` · posture **`PIPELINE_OBSERVING`** |
| **D5** | Stop any executor processes |
| **D6** | Remove/consume runtime stub if G3 gate later created it |
| **D7** | Verify no temporary stub · flat state |
| **D8** | Domain C: `validate_live_system.js` **PASS** |
| **D9** | Domain C: `run_safety_tests.js` **85/85 PASS** |
| **D10** | File RB-G9 session evidence |
| **D11** | Close G1–G4 + isolation authorization — **CONSUMED/CLOSED** |

Restore monitor/dashboard/scanner **only after Domain C** using documented procedures.

---

## 13. Explicit non-authorizations (this signed record)

| Item | Status |
|------|--------|
| Process stopping in this gate | **No** |
| C1–C3 execution in this gate | **No** |
| `.env` or `live_config.json` change in this gate | **No** |
| G3 · G4 · isolation authorization creation | **No** |
| Domain A · process isolation | **No** |
| Runtime-stub / session folder creation | **No** |
| AP-01 through AP-20 · armed-safe N6 | **No** |
| Candidate · quote · transaction construction | **No** |
| Submit · sign · broadcast | **No** |
| Capital exposure | **No** |
| OR promotion · readiness/profitability claim | **No** |
| AP01/AP02 authorization reuse | **Forbidden** |

---

## 14. Linked evidence and decisions

| Prerequisite | Path |
|--------------|------|
| **AP03 G1** | [`AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260711-AP03 — 2026-07-11.md`](AUTHORIZATION%20%E2%80%94%20R15%20ARMED-NO-SUBMIT%20ONE_SESSION_ONLY%20%E2%80%94%20RB-G9-20260711-AP03%20%E2%80%94%202026-07-11.md) |
| **AP03 operating window reselection** | [`../RB-G9 AP03 OPERATING WINDOW RESELECTION — 2026-07-11.md`](../RB-G9%20AP03%20OPERATING%20WINDOW%20RESELECTION%20%E2%80%94%202026-07-11.md) |
| **Pre-G1 operational readiness** | [`../RB-G9 AP02 PRE-G1 OPERATIONAL READINESS — 2026-07-11.md`](../RB-G9%20AP02%20PRE-G1%20OPERATIONAL%20READINESS%20%E2%80%94%202026-07-11.md) |
| **Armed no-submit production proof decision** | [`../Decisions/DECISION — Armed No-Submit Production Proof — 2026-07-09.md`](../Decisions/DECISION%20%E2%80%94%20Armed%20No-Submit%20Production%20Proof%20%E2%80%94%202026-07-09.md) |
| **Armed-context architecture decision** | [`../Decisions/DECISION — Armed-Context Preflight Architecture — 2026-07-08.md`](../Decisions/DECISION%20%E2%80%94%20Armed-Context%20Preflight%20Architecture%20%E2%80%94%202026-07-08.md) |
| **AP01 isolation amendment (design only)** | [`AUTHORIZATION — Process Isolation Scope Amendment — RB-G9-20260709-AP01 — 2026-07-10.md`](AUTHORIZATION%20%E2%80%94%20Process%20Isolation%20Scope%20Amendment%20%E2%80%94%20RB-G9-20260709-AP01%20%E2%80%94%202026-07-10.md) |

---

## 15. Future gate separation (unchanged by this sign-off)

| Gate | Relationship |
|------|--------------|
| **G3 — Runtime Stub Creation Authorization** | Separate — required before proof |
| **G4 — Armed No-Submit Proof Authorization** | Separate — AP + N6 armed probe |
| **Process Isolation Scope Amendment** | Separate — AP03 fresh additive authority |
| **Final Fresh Domain A Proof** | Mandatory before isolation/C1 |
| **Process Isolation Gate** | Mandatory before C1 |
| **Arming Transition Execution Gate** | Applies C1–C3 only under this G2 |
| **Immediate disarm + Domain C closure** | Mandatory after proof or abort |

**Invariant:** G2 sign-off ≠ arming transition ≠ stub creation ≠ proof execution ≠ capital exposure.

---

## 16. Taylor Cheaney — signed attestation

I, Taylor Cheaney, acknowledge and attest:

1. I have read this Arming Authorization (G2) for session **`RB-G9-20260711-AP03`**, linked to signed G1 at fingerprint **`2271bfc79a75f798c40adf54f2b25822bd3b7f44f473ba4ed89e6a63eff92e7e`**.
2. This authorization permits **one future C1–C3 posture transition only** — maximum **15 minutes** LIVE_ARMED — supporting the armed no-submit proof.
3. Strategy readiness is **NOT READY**; I make **no** profitability or strategy-edge claim.
4. **No trade or capital exposure is authorized** by this G2 sign-off.
5. This G2 sign-off **does not** perform C1–C3, stop processes, create a runtime stub, invoke AP-01–AP-20, run the N6 armed probe, submit, sign, or broadcast.
6. I accept mandatory rollback (D1–D11) on abort · timeout · ambiguity · or proof completion.
7. **OR-20260630-008 remains not_promoted**.
8. Prior sessions **EV01 · EV02 · AP01 · AP02** are **closed or superseded** — I will **not** reuse them.

**Taylor's explicit statement (recorded):**

> I sign the Arming Authorization (G2) dated 2026-07-11 for session `RB-G9-20260711-AP03`. This authorizes one future C1–C3 posture transition only — not process stop, not runtime-stub creation, not proof execution, not submit, not sign, not broadcast, and not capital exposure. Strategy readiness is NOT READY; I make no profitability or strategy-edge claim. OR-20260630-008 remains not_promoted.

| Field | Value |
|-------|-------|
| **Signed** | **Taylor Cheaney** |
| **Signature timestamp (UTC)** | **`2026-07-11T19:37:52Z`** |
| **Signature timestamp (local)** | **`Sat Jul 11 2026 13:37:52 GMT-0600 (Mountain Daylight Time)`** |

---

**Canonical path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — Arming — RB-G9-20260711-AP03 — 2026-07-11.md`
