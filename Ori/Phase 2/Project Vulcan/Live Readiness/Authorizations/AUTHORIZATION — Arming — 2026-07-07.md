# AUTHORIZATION — Arming — Engineering Validation · Pre-Transition — 2026-07-07

> **ARMING AUTHORIZATION ONLY**
>
> **ACTUAL ARMING NOT PERFORMED**
>
> **MICRO-LIVE EXECUTION NOT AUTHORIZED**
>
> **NO CAPITAL EXPOSURE**
>
> This record authorizes a **future Arming Transition Execution Gate** only after **Arming Transition Execution Preparation Review** passes. It **does not** change flags, arm the system, create a runtime approval stub, broadcast transactions, or expose capital.

---

## Record metadata

| Field | Value |
|-------|-------|
| **Gate name** | Arming Authorization Gate — Engineering Validation · Pre-Transition |
| **Record type** | Arming Authorization · Engineering Validation · Governance-only |
| **Status** | **SIGNED — NOT ARMED — NO FLAGS CHANGED — NO CAPITAL EXPOSURE** |
| **Signer** | **Taylor Cheaney** |
| **Signature date** | **2026-07-07** |
| **Linked R15 session** | **`RB-G9-20260706-EV01`** · [`AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — 2026-07-06.md`](AUTHORIZATION%20%E2%80%94%20R15%20ENGINEERING-VALIDATION%20ONE_SESSION_ONLY%20%E2%80%94%202026-07-06.md) |
| **R15 unused expiry** | **2026-07-20** *(must complete arming transition before R15 expires if unused)* |
| **Research wallet public address** | `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |
| **OR-20260630-008** | **not_promoted** |
| **Strategy readiness** | **NOT READY** |
| **Capital exposure status** | **none** |
| **Gate receipt** | [`../ARMING AUTHORIZATION GATE — 2026-07-07.md`](../ARMING%20AUTHORIZATION%20GATE%20%E2%80%94%202026-07-07.md) |

---

## 1. Three-gate arming sequence (approved)

| # | Gate | Purpose | This record |
|---|------|---------|-------------|
| **1** | **Arming Authorization Gate** *(this gate)* | Taylor signs authorization for a **future** arming transition | **Signed 2026-07-07** — no flags changed |
| **2** | **Arming Transition Execution Preparation Review** | Fresh 82/82 · signer/public re-check · RPC no-broadcast re-check · exact transition and rollback commands · **no flags changed** | **Required before Gate 3** |
| **3** | **Arming Transition Execution Gate** | Apply minimum authorized flag transition · verify `liveArmed: true` · **no submit · no broadcast · no loop** | **Not authorized until Gate 2 passes** |

**Invariant:** Gate 1 sign-off ≠ Gate 2 prep pass ≠ Gate 3 arming transition ≠ micro-live execution.

---

## 2. What this signed record authorizes

Taylor authorizes **only** a future **Arming Transition Execution Gate (Gate 3)** to apply the **minimum flag transition** below — **if and only if** **Arming Transition Execution Preparation Review (Gate 2)** passes first.

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
| Actual transaction broadcast / trade | **No** |
| `FOMO_ALLOW_LOOP_LIVE=YES` | **No** |
| Capital exposure | **No** |
| OR-20260630-008 promotion | **No** |
| Live / human soak / strategy readiness claims | **No** |
| Profitability / edge claim | **No** |

---

## 4. Signed risk acknowledgements

| # | Acknowledgement | Signed |
|---|-----------------|--------|
| **A1** | **R13 signed 2026-07-06** — engineering validation only; strategy **NOT READY** | **Yes** |
| **A2** | **R15 ONE_SESSION_ONLY signed 2026-07-06** — session `RB-G9-20260706-EV01` · max 1 trade · 0.005 SOL default · 0.01 SOL not authorized | **Yes** |
| **A3** | **LR-02 / R7b NOT MET** · **LR-03 NOT ENOUGH DATA** — no profitability or strategy-edge claim | **Yes** |
| **A4** | **Production-root proofs remain deferred** — N4 prod tier · N6 prod tier · A1-D03 Tier 2/3 — **explicit residual accepted for arming-only scope** | **Yes** |
| **A4a** | **N4 fixture durability matrix accepted** for arming-only scope — not prod-root closure | **Yes** |
| **A4b** | **N6 fixture e-stop evidence (E0–E10) accepted** for arming-only scope — not prod-root closure | **Yes** |
| **A4c** | **A1-D03 Tier 2/3 remain deferred** — not waived | **Yes** |
| **A5** | **Real transaction broadcast unproven** — dedicated RPC read-only verified only; **not waived for execution** | **Yes** |
| **A6** | **Safety suite 82/82 PASS** verified 2026-07-06 — re-run required at Gate 2 | **Yes** |
| **A7** | **Signer placed; public address verified** — secret not exposed in Ori records | **Yes** |
| **A8** | **Dedicated RPC no-broadcast verified** 2026-07-06 — re-check required at Gate 2 | **Yes** |
| **A9** | **Gate 2 required before Gate 3** — prep review must pass with fresh checks and documented rollback | **Yes** |
| **A10** | **Runtime approval stub remains separate** — not created in arming path until separately gated | **Yes** |
| **A11** | **Micro-Live Execution Authorization remains separate** after Gate 3 if ever | **Yes** |
| **A12** | **Actual execution remains separate** | **Yes** |
| **A13** | **OR-20260630-008 remains not_promoted** | **Yes** |
| **A14** | **G3 disabled** — 100 bps default slippage only | **Yes** |
| **A15** | **RB-G9 required after any armed session** including no-trade/aborted | **Yes** |
| **A16** | **Rollback obligation** — disarm immediately on abort per guard transition plan | **Yes** |

---

## 5. Signed session boundaries (R13/R15 — unchanged)

| Boundary | Value |
|----------|-------|
| Max trades — authorized session | **1** |
| Default position size | **0.005 SOL** |
| Absolute trade cap | **0.01 SOL not authorized** |
| Session / daily loss stop | **0.03 SOL** each |
| Consecutive-loss stop | **2** — halt |
| Default slippage | **100 bps only** |
| G3 manual override | **Disabled** |
| Scaling | **Forbidden** |
| Halt on ambiguity / reconciliation / e-stop / posture drift | **Required** |

---

## 6. Signed residual acceptance (arming-only scope)

| Residual | Acceptance | Waived for execution? |
|----------|------------|----------------------|
| **Production-root proofs** | **Deferred — explicitly accepted** for arming-only engineering validation | **No** |
| **N4 fixture durability matrix** | **Accepted** for arming-only scope | **No** for prod-root submit |
| **N6 fixture e-stop (E0–E10)** | **Accepted** for arming-only scope | **No** for prod-root halt proof |
| **A1-D03 Tier 2/3** | **Deferred — not closed** | **No** |
| **Real transaction broadcast** | **Unproven — acknowledged** | **Not waived** — execution gates must address |
| **Strategy NOT READY** | **Acknowledged** | **Not waived** for deployment |
| **Profitability / edge** | **No claim** | **Not waived** |
| **Live / human soak / strategy readiness** | **No claim** | **Not waived** |
| **OR-20260630-008** | **not_promoted** | **Not waived** |

---

## 7. Future Arming Transition Execution Gate prerequisites

The future **Arming Transition Execution Gate** may proceed **only if all** of the following pass immediately before flag transition:

| # | Prerequisite |
|---|--------------|
| **P1** | This signed Arming Authorization record valid and not expired |
| **P2** | R15 `ONE_SESSION_ONLY` signed · valid · unused · session `RB-G9-20260706-EV01` |
| **P3** | **Arming Transition Execution Preparation Review** passed — documented transition + rollback commands |
| **P4** | Fresh safety suite re-run **82/82 PASS** |
| **P5** | Signer/public address re-check PASS |
| **P6** | Dedicated RPC no-broadcast re-check PASS |
| **P7** | RB-G9 session path/template ready *(session folder may be created at prep or transition gate — not required in this gate)* |
| **P8** | G3 manual slippage override **disabled** |
| **P9** | Pre-transition posture snapshot recorded — DRY · unarmed · no capital |
| **P10** | Rollback/disarm procedure ready and referenced |
| **P11** | No scanner/executor LIVE `--loop` running |
| **P12** | No open live position · no blocking pending reconciliation |

**Gate 3 verification obligation:** After C1–C3 only, verify `computeLiveArmedStatus` → `liveArmed: true` **without** starting a loop, submitting, signing-and-sending, broadcasting, creating a position, or exposing capital. Run immediate rollback/disarm verification if any check fails.

---

## 8. Expiration rules

This Arming Authorization expires under **any** of the following (first trigger wins):

| # | Expiration trigger |
|---|-------------------|
| **X1** | **R15 expires** — including unused expiry **2026-07-20** or any R15 expiration rule |
| **X2** | **R15 consumed or invalidated** — armed session completed · one trade · ambiguity · halt · e-stop · posture drift · RB-G9 filing failure |
| **X3** | **Ambiguity, halt, e-stop, or posture drift** before or during authorized transition |
| **X4** | **Safety suite failure** — any non-green result at prep or transition gate |
| **X5** | **Signer or public address change** without new signed authorization |

**After expiration:** No arming transition without new signed R15 (if applicable) **and** new signed Arming Authorization.

---

## 9. Linked evidence

| Prerequisite | Path |
|--------------|------|
| **Final pre-arming blocker review** | [`../FINAL PRE-ARMING BLOCKER REVIEW — 2026-07-07.md`](../FINAL%20PRE-ARMING%20BLOCKER%20REVIEW%20%E2%80%94%202026-07-07.md) |
| **Guard transition plan** | [`../FINAL PRE-ARMING GUARD TRANSITION PLAN — 2026-07-06.md`](../FINAL%20PRE-ARMING%20GUARD%20TRANSITION%20PLAN%20%E2%80%94%202026-07-06.md) |
| **Arming prep review** | [`../ARMING AUTHORIZATION PREPARATION REVIEW — 2026-07-06.md`](../ARMING%20AUTHORIZATION%20PREPARATION%20REVIEW%20%E2%80%94%202026-07-06.md) |
| **R13 signed waiver** | [`../R13 SIGN-OFF GATE — 2026-07-06.md`](../R13%20SIGN-OFF%20GATE%20%E2%80%94%202026-07-06.md) |
| **R15 signed session auth** | [`AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — 2026-07-06.md`](AUTHORIZATION%20%E2%80%94%20R15%20ENGINEERING-VALIDATION%20ONE_SESSION_ONLY%20%E2%80%94%202026-07-06.md) |
| **Safety suite 82/82** | [`../A1-D03 HARNESS DRIFT REMEDIATION — 2026-07-06.md`](../A1-D03%20HARNESS%20DRIFT%20REMEDIATION%20%E2%80%94%202026-07-06.md) |
| **Signer placement** | [`../SIGNER SECRET PLACEMENT EXECUTION — 2026-07-06.md`](../SIGNER%20SECRET%20PLACEMENT%20EXECUTION%20%E2%80%94%202026-07-06.md) |
| **RPC no-broadcast** | [`../REAL RPC NO-BROADCAST READINESS CHECK — 2026-07-06.md`](../REAL%20RPC%20NO-BROADCAST%20READINESS%20CHECK%20%E2%80%94%202026-07-06.md) |

---

## 10. Taylor Cheaney — signed attestation

I, Taylor Cheaney, acknowledge and attest:

1. I authorize a **future Arming Transition Execution Gate** only after **Arming Transition Execution Preparation Review** passes — not in this gate.
2. **This Arming Authorization Gate changes no flags.** The system remains disarmed after my signature.
3. Strategy readiness is **NOT READY**; LR-02/R7b and LR-03 are **not met**; I make **no** profitability or strategy-edge claim.
4. I accept **deferred production-root proofs**; **N4 fixture** and **N6 fixture e-stop** evidence for arming-only scope; **A1-D03 Tier 2/3 deferred**; and **unproven real broadcast not waived for execution**.
5. R15 session `RB-G9-20260706-EV01` bounds apply; OR-20260630-008 remains **not_promoted**.
6. This sign-off **does not** authorize runtime stub creation, micro-live execution authorization, broadcast, capital exposure, or `--loop` live trading.
7. Gate 3 may apply only C1–C3 minimum flags; I will disarm immediately on abort per the guard transition plan.

**Taylor's explicit statement (recorded):**

> I sign the Arming Authorization record dated 2026-07-07 for a future arming transition only. This gate changes no flags. Arming Transition Execution Preparation Review must pass before any flag transition. Strategy is NOT READY; I make no profitability claim. OR-20260630-008 remains not_promoted. No runtime stub, no broadcast, no capital exposure, no micro-live execution authorization.

**Signed:** Taylor Cheaney · **Date:** 2026-07-07

---

**Canonical path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — Arming — 2026-07-07.md`
