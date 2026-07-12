# AUTHORIZATION — Arming — Armed No-Submit Proof · Pre-Transition — RB-G9-20260709-AP01 — 2026-07-09

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
| **Gate name** | Fresh Armed No-Submit Proof Arming Authorization |
| **Record type** | Arming Authorization · Armed No-Submit Proof · Governance-only (G2) |
| **Status** | **SIGNED — NOT ARMED — NO FLAGS CHANGED — NO CAPITAL EXPOSURE** |
| **Authorization status** | **SIGNED/UNUSED** |
| **Signer** | **Taylor Cheaney** |
| **Signature timestamp (UTC)** | **`2026-07-10T03:55:02Z`** |
| **Signature timestamp (local)** | **`Thu Jul 09 2026 21:55:02 GMT-0600 (Mountain Daylight Time)`** |
| **Signature date** | **2026-07-09** |
| **Linked session ID** | **`RB-G9-20260709-AP01`** |
| **Linked G1 (R15)** | [`AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260709-AP01 — 2026-07-09.md`](AUTHORIZATION%20%E2%80%94%20R15%20ARMED-NO-SUBMIT%20ONE_SESSION_ONLY%20%E2%80%94%20RB-G9-20260709-AP01%20%E2%80%94%202026-07-09.md) |
| **Linked G1 fingerprint (SHA-256)** | **`d24fdbe6dbb4febbeb17d1b190776fec653462b61064d00c1c322fb8d15e2a84`** |
| **G1 authorization expiry (UTC)** | **`2026-07-11T03:25:11Z`** *(arming transition must occur while G1 remains valid)* |
| **Previous sessions (closed — must not reuse)** | **`RB-G9-20260706-EV01`** · **`RB-G9-20260707-EV02`** |
| **Previous arming auth (EV02)** | [`AUTHORIZATION — Arming — RB-G9-20260707-EV02 — 2026-07-07.md`](AUTHORIZATION%20%E2%80%94%20Arming%20%E2%80%94%20RB-G9-20260707-EV02%20%E2%80%94%202026-07-07.md) — **CONSUMED/CLOSED** |
| **Research wallet public address** | `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |
| **Maximum LIVE_ARMED duration** | **15 minutes** from first confirmed `liveArmed: true` |
| **OR-20260630-008** | **not_promoted** |
| **Strategy readiness** | **NOT READY** |
| **Capital exposure status** | **none** |
| **Planning receipt** | [`../FRESH ARMED NO-SUBMIT PROOF ARMING AUTHORIZATION PLANNING — 2026-07-09.md`](../FRESH%20ARMED%20NO-SUBMIT%20PROOF%20ARMING%20AUTHORIZATION%20PLANNING%20%E2%80%94%202026-07-09.md) |
| **Sign-off gate receipt** | [`../FRESH ARMED NO-SUBMIT PROOF ARMING AUTHORIZATION — 2026-07-09.md`](../FRESH%20ARMED%20NO-SUBMIT%20PROOF%20ARMING%20AUTHORIZATION%20%E2%80%94%202026-07-09.md) |

---

## 1. G2 scope (one future posture transition only)

Taylor authorizes **only** a future **Arming Transition Execution Gate** to apply the **minimum C1–C3 flag transition** below — **if and only if** all pre-transition conditions in §6 pass, including G3 and G4 signed, fresh Domain A proof within 30 minutes, and process-stop verification.

| Field | Value |
|-------|-------|
| **Purpose** | One temporary posture transition supporting armed no-submit proof |
| **Session binding** | **`RB-G9-20260709-AP01`** exclusively — linked to signed G1 |
| **Transitions authorized** | **One only** — non-reusable |
| **Maximum armed duration** | **15 minutes** from first confirmed `LIVE_ARMED` |
| **Rollback obligation** | Immediate after PASS · FAIL · abort · ambiguity · or timeout |

**This signed record does not authorize proof execution, runtime-stub creation, AP manifest execution, N6 armed probe, submit, sign, broadcast, or capital exposure.**

---

## 2. Authorized future C1–C3 changes (transition gate only — not applied in this gate)

| Order | Target | Field | Authorized change |
|-------|--------|-------|-------------------|
| **C1** | gitignored `.env` | `FOMO_ENABLE_LIVE_SUBMISSION` | unset → **`YES`** |
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
| Runtime stub | **Not created** in this gate or in transition gate alone |
| Processes | **Not started** — zero executor loops |

---

## 4. Baseline-binding requirements

Future arming transition may proceed **only if** G2 is bound to:

| Binding | Requirement |
|---------|-------------|
| **Fresh Domain A receipt** | Completed **after** G1–G4 signed · within **30 minutes** before C1 |
| **`live_config.json` SHA-256** | Full pre-arming hash captured and matched |
| **Code fingerprint** | Approved revision at final dry proof |
| **Process-set fingerprint** | Post-stop snapshot |
| **G1–G4 fingerprints** | All four governance records same session |
| **Runtime stub** | **Absent** before separately authorized G3 creation gate |
| **Environment-gate booleans** | Pre-C1 state documented (boolean only) |
| **Executor processes** | **0** |
| **Positions / reconciliation / recovery / capital** | **0 / none** |

Any drift after final pre-C1 dry proof → G2 use **invalid**.

---

## 5. Process-stop precondition (before C1)

| Process | Policy |
|---------|--------|
| **`monitor.js`** | **Stopped** |
| **Dashboard server** | **Stopped** if active |
| **`scanner_gmgn_trending.js --watch`** | **Stopped** |
| **`live_executor.js`** | **Zero** processes |
| **Replacement / child processes** | **None** |
| **Automatic restart** | **Forbidden** |
| **Evidence** | Post-stop process-set fingerprint recorded |

---

## 6. Pre-transition conditions (abort if any fail)

| # | Condition |
|---|-----------|
| **P1** | G1–G4 signed · valid · unused · same session **`RB-G9-20260709-AP01`** |
| **P2** | G1 unexpired |
| **P3** | G2 signed and session-linked *(this record)* |
| **P4** | Fresh Domain A proof ≤ **30 minutes** old |
| **P5** | `liveArmed` **false** |
| **P6** | Posture **`PIPELINE_OBSERVING`** |
| **P7** | `executionMode` **`PIPELINE_DRY_RUN`** |
| **P8** | `dryRunMode` **`true`** |
| **P9** | `FOMO_ENABLE_LIVE_SUBMISSION` **not YES** |
| **P10** | `FOMO_ALLOW_LOOP_LIVE` **not YES** |
| **P11** | Runtime stub **absent** *(before G3 creation gate)* |
| **P12** | Signer / public address match |
| **P13** | Dedicated RPC read-only health |
| **P14** | G3 manual slippage override **disabled** |
| **P15** | OR-20260630-008 **not_promoted** |
| **P16** | Flat state — no position · reconciliation · recovery · capital |
| **P17** | Process-stop verification complete |

---

## 7. Post-transition verification requirements

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

## 8. 15-minute armed timer rule

| Rule | Detail |
|------|--------|
| **Start** | First confirmed `liveArmed: true` after C3 |
| **Cap** | **15 minutes** — no extension |
| **Delayed proof** | If proof cannot begin promptly → **disarm** |
| **Timeout** | **Mandatory rollback** |
| **Closure** | Immediate after proof or abort |

---

## 9. Invalidation triggers

G2 becomes **invalid immediately** if any occur:

| # | Trigger |
|---|---------|
| **I1** | G1 invalid · expired · consumed · or session mismatch |
| **I2** | G2 reuse after consumption |
| **I3** | G3 or G4 missing or invalid at transition time |
| **I4** | Stale Domain A proof (>30 min before C1) |
| **I5** | Code / config / process / auth fingerprint drift |
| **I6** | Unauthorized environment or config value |
| **I7** | Monitor / dashboard / scanner active at C1 |
| **I8** | Executor process present |
| **I9** | Unexpected runtime stub before G3 gate |
| **I10** | Signer / RPC mismatch |
| **I11** | Open position / reconciliation / recovery / capital |
| **I12** | G3 manual slippage override enabled |
| **I13** | Secret exposure |
| **I14** | OR-20260630-008 status change |
| **I15** | Unauthorized `live_config` diff |
| **I16** | Armed timer timeout |
| **I17** | Ambiguity |

---

## 10. Mandatory rollback acceptance

Taylor accepts mandatory rollback on abort · timeout · ambiguity · or proof completion:

| Step | Action |
|------|--------|
| **D1** | Unset `FOMO_ENABLE_LIVE_SUBMISSION` in `.env` |
| **D2** | `executionMode` → **`PIPELINE_DRY_RUN`** |
| **D3** | `dryRunMode` → **`true`** |
| **D4** | Verify `liveArmed: false` · posture **`PIPELINE_OBSERVING`** |
| **D5** | Stop all executor processes |
| **D6** | Remove/consume runtime stub if G3 gate later created it |
| **D7** | Verify flat state |
| **D8** | Domain C: `validate_live_system.js` **PASS** |
| **D9** | Domain C: `run_safety_tests.js` **85/85 PASS** |
| **D10** | File RB-G9 session evidence |
| **D11** | Close G1–G4 — **CONSUMED/CLOSED** |

---

## 11. Explicit non-authorizations (this signed record)

| Item | Status |
|------|--------|
| C1–C3 execution in this gate | **No** |
| `liveArmed true` achieved | **No** |
| Runtime-stub creation | **No** — G3 separate gate |
| AP-01 through AP-20 invocation | **No** — G4 separate gate |
| Armed-safe N6 probe | **No** — G4 separate gate |
| Candidate selection | **No** |
| Quote · final trade confirmation · transaction construction | **No** |
| Submit · sign · broadcast | **No** |
| Micro-live execution | **No** |
| Capital exposure | **No** |
| Executor loop | **No** |
| OR promotion | **No** |
| Readiness / profitability claim | **No** |
| EV01/EV02 session or arming auth reuse | **Forbidden** |

---

## 12. Signed risk acknowledgements

| # | Acknowledgement | Signed |
|---|-----------------|--------|
| **A1** | **G1 signed 2026-07-09** — session **`RB-G9-20260709-AP01`** · schemaVersion 2 · `armed_no_submit_proof_only` · max **15 minutes** armed | **Yes** |
| **A2** | **Strategy NOT READY** — no profitability or strategy-edge claim | **Yes** |
| **A3** | **Arming-only scope** — C1–C3 posture transition only; **no trade or capital exposure authorized** | **Yes** |
| **A4** | **G3 and G4 required** before transition — stub and proof execution remain separate gates | **Yes** |
| **A5** | **Fresh Domain A proof required** within 30 minutes before C1 — prior dry proof is planning evidence only | **Yes** |
| **A6** | **Process-stop required** before C1 — monitor · dashboard · scanner · executor zero | **Yes** |
| **A7** | **15-minute armed timer** — no extension; mandatory rollback on timeout | **Yes** |
| **A8** | **G3 manual slippage override disabled** — 100 bps default only | **Yes** |
| **A9** | **OR-20260630-008 remains not_promoted** | **Yes** |
| **A10** | **EV01/EV02 chains consumed** — must not reuse | **Yes** |
| **A11** | **Rollback obligation accepted** — D1–D11 on abort · timeout · or completion | **Yes** |
| **A12** | **Real submit/broadcast unproven** — armed posture does not authorize execution | **Yes** |

---

## 13. Linked evidence and decisions

| Prerequisite | Path |
|--------------|------|
| **G2 planning** | [`../FRESH ARMED NO-SUBMIT PROOF ARMING AUTHORIZATION PLANNING — 2026-07-09.md`](../FRESH%20ARMED%20NO-SUBMIT%20PROOF%20ARMING%20AUTHORIZATION%20PLANNING%20%E2%80%94%202026-07-09.md) |
| **Linked G1** | [`AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260709-AP01 — 2026-07-09.md`](AUTHORIZATION%20%E2%80%94%20R15%20ARMED-NO-SUBMIT%20ONE_SESSION_ONLY%20%E2%80%94%20RB-G9-20260709-AP01%20%E2%80%94%202026-07-09.md) |
| **Armed no-submit production proof decision** | [`../Decisions/DECISION — Armed No-Submit Production Proof — 2026-07-09.md`](../Decisions/DECISION%20%E2%80%94%20Armed%20No-Submit%20Production%20Proof%20%E2%80%94%202026-07-09.md) |
| **Armed-context proof planning** | [`../ARMED-CONTEXT ARMED NO-SUBMIT PROOF PLANNING — 2026-07-09.md`](../ARMED-CONTEXT%20ARMED%20NO-SUBMIT%20PROOF%20PLANNING%20%E2%80%94%202026-07-09.md) |
| **Armed-context architecture decision** | [`../Decisions/DECISION — Armed-Context Preflight Architecture — 2026-07-08.md`](../Decisions/DECISION%20%E2%80%94%20Armed-Context%20Preflight%20Architecture%20%E2%80%94%202026-07-08.md) |
| **Dry proof (historical only)** | [`../FRESH DOMAIN A DRY PROOF FOR ARMED NO-SUBMIT PROOF SESSION — 2026-07-09.md`](../FRESH%20DOMAIN%20A%20DRY%20PROOF%20FOR%20ARMED%20NO-SUBMIT%20PROOF%20SESSION%20%E2%80%94%202026-07-09.md) |

---

## 14. Future gate separation (unchanged by this sign-off)

| Gate | Relationship |
|------|--------------|
| **G3 — Runtime Stub Creation Authorization** | Separate — required before proof; not authorized here |
| **G4 — Armed No-Submit Proof Authorization** | Separate — AP + N6 armed probe; not execution |
| **Fresh Domain A Dry Proof** | Mandatory after G1–G4 · within 30 min before C1 |
| **Process-stop gate** | Required before transition |
| **Arming Transition Execution Gate** | Applies C1–C3 only under this G2 |
| **Armed no-submit proof execution gate** | Domain B + N6 — separate |
| **Immediate disarm + Domain C closure** | Mandatory after proof or abort |

**Invariant:** G2 sign-off ≠ arming transition ≠ stub creation ≠ proof execution ≠ capital exposure.

---

## 15. Taylor Cheaney — signed attestation

I, Taylor Cheaney, acknowledge and attest:

1. I have read this Arming Authorization (G2) for session **`RB-G9-20260709-AP01`**, linked to signed G1 at fingerprint **`d24fdbe6dbb4febbeb17d1b190776fec653462b61064d00c1c322fb8d15e2a84`**.
2. This authorization permits **one future C1–C3 posture transition only** — maximum **15 minutes** LIVE_ARMED — supporting the armed no-submit proof.
3. Strategy readiness is **NOT READY**; I make **no** profitability or strategy-edge claim.
4. **No trade or capital exposure is authorized** by this G2 sign-off.
5. This G2 sign-off **does not** perform C1–C3, create a runtime stub, invoke AP-01–AP-20, run the N6 armed probe, submit, sign, or broadcast.
6. I accept mandatory rollback (D1–D11) on abort · timeout · ambiguity · or proof completion.
7. **OR-20260630-008 remains not_promoted**.
8. Prior sessions **EV01** and **EV02** are **closed** — I will **not** reuse them.

**Taylor's explicit statement (recorded):**

> I sign the Arming Authorization (G2) dated 2026-07-09 for session `RB-G9-20260709-AP01`. This authorizes one future C1–C3 posture transition only — not runtime-stub creation, not proof execution, not submit, not sign, not broadcast, and not capital exposure. Strategy readiness is NOT READY; I make no profitability or strategy-edge claim. OR-20260630-008 remains not_promoted.

| Field | Value |
|-------|-------|
| **Signed** | **Taylor Cheaney** |
| **Signature timestamp (UTC)** | **`2026-07-10T03:55:02Z`** |
| **Signature timestamp (local)** | **`Thu Jul 09 2026 21:55:02 GMT-0600 (Mountain Daylight Time)`** |

---

**Canonical path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — Arming — RB-G9-20260709-AP01 — 2026-07-09.md`
