# AUTHORIZATION — Arming — Engineering Validation · Pre-Transition — RB-G9-20260707-EV02 — 2026-07-07

> **ARMING AUTHORIZATION ONLY**
>
> **ACTUAL ARMING NOT PERFORMED**
>
> **MICRO-LIVE EXECUTION NOT AUTHORIZED**
>
> **NO CAPITAL EXPOSURE**
>
> This record authorizes a **future Arming Transition Execution Gate** only after **Fresh Arming Transition Execution Preparation Review** passes. It **does not** change flags, arm the system, create a runtime approval stub, broadcast transactions, or expose capital.

---

## Record metadata

| Field | Value |
|-------|-------|
| **Gate name** | Fresh Arming Authorization Gate — Engineering Validation · Pre-Transition |
| **Record type** | Arming Authorization · Engineering Validation · Governance-only |
| **Status** | **SIGNED — NOT ARMED — NO FLAGS CHANGED — NO CAPITAL EXPOSURE** |
| **Signer** | **Taylor Cheaney** |
| **Signature date** | **2026-07-07** |
| **Linked R15 session** | **`RB-G9-20260707-EV02`** · [`AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — RB-G9-20260707-EV02 — 2026-07-07.md`](AUTHORIZATION%20%E2%80%94%20R15%20ENGINEERING-VALIDATION%20ONE_SESSION_ONLY%20%E2%80%94%20RB-G9-20260707-EV02%20%E2%80%94%202026-07-07.md) |
| **R15 unused expiry** | **2026-07-14** *(must complete arming transition before R15 expires if unused)* |
| **Previous session (closed)** | **`RB-G9-20260706-EV01`** — **must not be reused** |
| **Previous arming auth (EV01)** | [`AUTHORIZATION — Arming — 2026-07-07.md`](AUTHORIZATION%20%E2%80%94%20Arming%20%E2%80%94%202026-07-07.md) — **CONSUMED/CLOSED** at EV01 disarm |
| **Research wallet public address** | `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |
| **Safety baseline** | **85/85 PASS** (verified 2026-07-07) |
| **Validator baseline** | **PASS** — 0 failures, 5 informational warnings |
| **Jupiter U1/U2** | **CLOSED** |
| **OR-20260630-008** | **not_promoted** |
| **Strategy readiness** | **NOT READY** |
| **Capital exposure status** | **none** |
| **Gate receipt** | [`../FRESH ARMING AUTHORIZATION GATE — 2026-07-07.md`](../FRESH%20ARMING%20AUTHORIZATION%20GATE%20%E2%80%94%202026-07-07.md) |
| **Pre-arming refresh** | [`../FRESH PRE-ARMING BLOCKER REFRESH — 2026-07-07.md`](../FRESH%20PRE-ARMING%20BLOCKER%20REFRESH%20%E2%80%94%202026-07-07.md) |

---

## 1. Three-gate arming sequence (approved)

| # | Gate | Purpose | This record |
|---|------|---------|-------------|
| **1** | **Fresh Arming Authorization Gate** *(this gate)* | Taylor signs authorization for a **future** arming transition linked to **EV02** | **Signed 2026-07-07** — no flags changed |
| **2** | **Fresh Arming Transition Execution Preparation Review** | Fresh 85/85 · validator · signer/public re-check · RPC no-broadcast re-check · exact transition and rollback commands · **no flags changed** | **Required before Gate 3** |
| **3** | **Arming Transition Execution Gate** | Apply minimum authorized flag transition · verify `liveArmed: true` · **no submit · no broadcast · no loop** | **Not authorized until Gate 2 passes** |

**Invariant:** Gate 1 sign-off ≠ Gate 2 prep pass ≠ Gate 3 arming transition ≠ micro-live execution.

---

## 2. What this signed record authorizes

Taylor authorizes **only** a future **Arming Transition Execution Gate (Gate 3)** to apply the **minimum flag transition** below — **if and only if** **Fresh Arming Transition Execution Preparation Review (Gate 2)** passes first.

### 2.1 Authorized future flag transition (Gate 3 only — not applied in this gate)

| Order | Target | Field | Authorized change |
|-------|--------|-------|-------------------|
| **C1** | `.env` | `FOMO_ENABLE_LIVE_SUBMISSION` | unset → `YES` |
| **C2** | `live_config.json` | `executionMode` | `PIPELINE_DRY_RUN` → `LIVE` |
| **C3** | `live_config.json` | `dryRunMode` | `true` → `false` |

### 2.2 Explicitly not authorized in Gate 3 unless separately signed

| Field | Requirement |
|-------|-------------|
| `FOMO_ALLOW_LOOP_LIVE` | **Leave unset** |
| `positionSizeSol` | **Keep 0.005** |
| `capitalExposure` | **Keep none** |
| `emergencyStop` | **Keep false** unless e-stop triggered |
| G3 manual slippage override | **Forbidden** |
| `analysis/r15_manual_approval_record.json` | **Do not create** in arming transition |
| Scanner/executor `--loop` | **Forbidden** |
| Submit / broadcast | **Forbidden** |

### 2.3 Expected post–Gate 3 posture (verification only)

When all gates pass after Gate 3: `computeLiveArmedStatus` may return `liveArmed: true` and `operationalPosture: LIVE_ARMED` — **without** authorizing BUY submit (still blocked by runtime stub + Micro-Live Execution Authorization).

---

## 3. Explicit non-authorizations (this signed record)

| Item | Status |
|------|--------|
| Flag changes in Gate 1 | **No** — this gate is sign-off only |
| `liveArmed true` achieved | **No** |
| `FOMO_ENABLE_LIVE_SUBMISSION=YES` set | **No** |
| `executionMode LIVE` / `dryRunMode false` set | **No** |
| Runtime approval stub created | **No** |
| Micro-live execution authorization | **No** |
| Candidate selection or final per-trade confirmation | **No** |
| Actual transaction broadcast / trade | **No** |
| `FOMO_ALLOW_LOOP_LIVE=YES` | **No** |
| Capital exposure | **No** |
| OR-20260630-008 promotion | **No** |
| Live / human soak / strategy readiness claims | **No** |
| Profitability / edge claim | **No** |
| EV01 session / arming auth reuse | **Forbidden** |

---

## 4. Signed risk acknowledgements

| # | Acknowledgement | Signed |
|---|-----------------|--------|
| **A1** | **R13 signed 2026-07-06** — engineering validation only; strategy **NOT READY** | **Yes** |
| **A2** | **R15 ONE_SESSION_ONLY signed 2026-07-07** — session **`RB-G9-20260707-EV02`** · max 1 BUY + 1 mandatory SELL · 0.005 SOL · 0.01 SOL not authorized | **Yes** |
| **A3** | **LR-02 / R7b NOT MET** · **LR-03 NOT ENOUGH DATA** — no profitability or strategy-edge claim | **Yes** |
| **A4** | **Production-root reconciliation/e-stop evidence remains deferred** — fixture/drill only · **explicit residual accepted for arming-only scope** | **Yes** |
| **A5** | **Real transaction broadcast unproven** — dedicated RPC read-only verified historically; **not waived for execution** | **Yes** |
| **A6** | **Safety suite 85/85 PASS** verified 2026-07-07 — re-run required at Gate 2 | **Yes** |
| **A7** | **validate_live_system PASS** (0 failures, 5 warnings) — re-run required at Gate 2 | **Yes** |
| **A8** | **Jupiter U1/U2 CLOSED** — unified `/swap/v1` adapter; fee decomposition corrected; **not proof of broadcast** | **Yes** |
| **A9** | **Signer placed; public address verified** — secret not exposed in Ori records | **Yes** |
| **A10** | **Dedicated RPC no-broadcast verified historically** — re-check required at Gate 2 | **Yes** |
| **A11** | **Gate 2 required before Gate 3** — prep review must pass with fresh checks and documented rollback | **Yes** |
| **A12** | **Runtime approval stub remains separate** — not created in arming path until separately gated | **Yes** |
| **A13** | **Micro-Live Execution Authorization remains separate** after Gate 3 if ever | **Yes** |
| **A14** | **Actual execution remains separate** | **Yes** |
| **A15** | **OR-20260630-008 remains not_promoted** | **Yes** |
| **A16** | **G3 disabled** — 100 bps default slippage only | **Yes** |
| **A17** | **Five validator warnings accepted** as informational residuals | **Yes** |
| **A18** | **EV01 chain consumed** — **`RB-G9-20260706-EV01` must not be reused** | **Yes** |
| **A19** | **RB-G9 required after any armed session** including no-trade/aborted | **Yes** |
| **A20** | **Rollback obligation** — disarm immediately on abort per guard transition plan | **Yes** |

---

## 5. Signed session boundaries (R13/R15 EV02)

| Boundary | Value |
|----------|-------|
| Session ID | **`RB-G9-20260707-EV02`** |
| Max entries | **1 BUY + 1 mandatory SELL** |
| Default position size | **0.005 SOL** |
| Absolute trade cap | **0.01 SOL not authorized** |
| Session / daily loss stop | **0.03 SOL** each |
| Consecutive-loss stop (`maxDailyLossCount`) | **2** — halt |
| Default slippage | **100 bps only** |
| G3 manual override | **Disabled** |
| MEV route mode | **`public_micro_live_only`** |
| Scaling / averaging / compounding / loop | **Forbidden** |
| Halt on ambiguity / reconciliation / e-stop / posture drift | **Required** |

---

## 6. Signed residual acceptance (arming-only scope)

| Residual | Acceptance | Waived for execution? |
|----------|------------|----------------------|
| **Production-root proofs** | **Deferred — explicitly accepted** for arming-only engineering validation | **No** |
| **Real transaction broadcast (N5)** | **Unproven — acknowledged** | **Not waived** |
| **Strategy NOT READY** | **Acknowledged** | **Not waived** for deployment |
| **Profitability / edge** | **No claim** | **Not waived** |
| **Five validator warnings** | **Informational — accepted** | **Not waived** for readiness claims |
| **Live / human soak / strategy readiness** | **No claim** | **Not waived** |
| **OR-20260630-008** | **not_promoted** | **Not waived** |

---

## 7. Future Arming Transition Execution Gate prerequisites

The future **Arming Transition Execution Gate** may proceed **only if all** of the following pass immediately before flag transition:

| # | Prerequisite |
|---|--------------|
| **P1** | This signed Arming Authorization record valid and not expired |
| **P2** | R15 `ONE_SESSION_ONLY` signed · valid · unused · session **`RB-G9-20260707-EV02`** · expiry **2026-07-14** |
| **P3** | **Fresh Arming Transition Execution Preparation Review** passed — documented transition + rollback commands |
| **P4** | Fresh safety suite re-run **85/85 PASS** |
| **P5** | `validate_live_system` re-run **PASS** |
| **P6** | Signer/public address re-check PASS |
| **P7** | Dedicated RPC no-broadcast re-check PASS |
| **P8** | RB-G9 session path ready — `Sessions/SESSION — RB-G9-20260707-EV02 — {SESSION_DATE}/` *(folder at session close — not required in this gate)* |
| **P9** | G3 manual slippage override **disabled** |
| **P10** | Pre-transition posture snapshot recorded — DRY · unarmed · no capital |
| **P11** | Rollback/disarm procedure ready and referenced |
| **P12** | No scanner/executor LIVE `--loop` running |
| **P13** | No open live position · no blocking pending reconciliation |
| **P14** | Jupiter U1/U2 remain closed — no adapter regression |

**Gate 3 verification obligation:** After C1–C3 only, verify `computeLiveArmedStatus` → `liveArmed: true` **without** starting a loop, submitting, signing-and-sending, broadcasting, creating a position, or exposing capital. Run immediate rollback/disarm verification if any check fails.

---

## 8. Expiration rules

This Arming Authorization expires under **any** of the following (first trigger wins):

| # | Expiration trigger |
|---|-------------------|
| **X1** | **R15 expires** — unused expiry **2026-07-14** or any R15 invalidation rule |
| **X2** | **R15 consumed or invalidated** — armed session completed · one entry · ambiguity · halt · e-stop · posture drift · RB-G9 filing failure |
| **X3** | **Ambiguity, halt, e-stop, or posture drift** before or during authorized transition |
| **X4** | **Safety or validator failure** — any non-green result at prep or transition gate |
| **X5** | **Jupiter adapter regression** — U1/U2 reopen |
| **X6** | **Signer or public address change** without new signed authorization |
| **X7** | **Session ID mismatch** — any attempt to arm under EV01 or other session |

**After expiration:** No arming transition without valid R15 **and** new signed Arming Authorization for the active session.

---

## 9. Linked evidence

| Prerequisite | Path |
|--------------|------|
| **Pre-arming blocker refresh** | [`../FRESH PRE-ARMING BLOCKER REFRESH — 2026-07-07.md`](../FRESH%20PRE-ARMING%20BLOCKER%20REFRESH%20%E2%80%94%202026-07-07.md) |
| **EV02 R15 signed session auth** | [`AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — RB-G9-20260707-EV02 — 2026-07-07.md`](AUTHORIZATION%20%E2%80%94%20R15%20ENGINEERING-VALIDATION%20ONE_SESSION_ONLY%20%E2%80%94%20RB-G9-20260707-EV02%20%E2%80%94%202026-07-07.md) |
| **Post-validator verification** | [`../POST-VALIDATOR REMEDIATION VERIFICATION REVIEW — 2026-07-07.md`](../POST-VALIDATOR%20REMEDIATION%20VERIFICATION%20REVIEW%20%E2%80%94%202026-07-07.md) |
| **Jupiter no-broadcast verification** | [`../JUPITER EXECUTION PATH NO-BROADCAST VERIFICATION REVIEW — 2026-07-07.md`](../JUPITER%20EXECUTION%20PATH%20NO-BROADCAST%20VERIFICATION%20REVIEW%20%E2%80%94%202026-07-07.md) |
| **Validator remediation** | [`../VALIDATE LIVE SYSTEM STATIC VALIDATOR DRIFT REMEDIATION IMPLEMENTATION — 2026-07-07.md`](../VALIDATE%20LIVE%20SYSTEM%20STATIC%20VALIDATOR%20DRIFT%20REMEDIATION%20IMPLEMENTATION%20%E2%80%94%202026-07-07.md) |
| **Guard transition plan** | [`../FINAL PRE-ARMING GUARD TRANSITION PLAN — 2026-07-06.md`](../FINAL%20PRE-ARMING%20GUARD%20TRANSITION%20PLAN%20%E2%80%94%202026-07-06.md) |
| **R13 signed waiver** | [`../R13 SIGN-OFF GATE — 2026-07-06.md`](../R13%20SIGN-OFF%20GATE%20%E2%80%94%202026-07-06.md) |
| **Signer placement** | [`../SIGNER SECRET PLACEMENT EXECUTION — 2026-07-06.md`](../SIGNER%20SECRET%20PLACEMENT%20EXECUTION%20%E2%80%94%202026-07-06.md) |
| **RPC no-broadcast (historical)** | [`../REAL RPC NO-BROADCAST READINESS CHECK — 2026-07-06.md`](../REAL%20RPC%20NO-BROADCAST%20READINESS%20CHECK%20%E2%80%94%202026-07-06.md) |
| **Prior EV01 RB-G9 (do not reuse)** | [`../Sessions/SESSION — RB-G9-20260706-EV01 — 2026-07-07/RB-G9 — REVIEW.md`](../Sessions/SESSION%20%E2%80%94%20RB-G9-20260706-EV01%20%E2%80%94%202026-07-07/RB-G9%20%E2%80%94%20REVIEW.md) |

---

## 10. Taylor Cheaney — signed attestation

I, Taylor Cheaney, acknowledge and attest:

1. I authorize a **future Arming Transition Execution Gate** only after **Fresh Arming Transition Execution Preparation Review** passes — not in this gate.
2. **This Fresh Arming Authorization Gate changes no flags.** The system remains disarmed after my signature.
3. Strategy readiness is **NOT READY**; LR-02/R7b and LR-03 are **not met**; I make **no** profitability or strategy-edge claim.
4. I accept **deferred production-root proofs**, **unproven real broadcast not waived for execution**, and **five informational validator warnings**.
5. R15 session **`RB-G9-20260707-EV02`** bounds apply; unused expiry **2026-07-14**; OR-20260630-008 remains **not_promoted**.
6. Prior session **`RB-G9-20260706-EV01`** and its arming chain are **closed** — I will **not** reuse them.
7. This sign-off **does not** authorize runtime stub creation, micro-live execution authorization, candidate selection, final per-trade confirmation, broadcast, capital exposure, or `--loop` live trading.
8. Gate 3 may apply only C1–C3 minimum flags; I will disarm immediately on abort per the guard transition plan.

**Taylor's explicit statement (recorded):**

> I sign the Fresh Arming Authorization record dated 2026-07-07 for session `RB-G9-20260707-EV02` and a future arming transition only. This gate changes no flags. Fresh Arming Transition Execution Preparation Review must pass before any flag transition. Strategy is NOT READY; I make no profitability claim. OR-20260630-008 remains not_promoted. No runtime stub, no broadcast, no capital exposure, no micro-live execution authorization.

**Signed:** Taylor Cheaney · **Date:** 2026-07-07

---

**Canonical path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — Arming — RB-G9-20260707-EV02 — 2026-07-07.md`
