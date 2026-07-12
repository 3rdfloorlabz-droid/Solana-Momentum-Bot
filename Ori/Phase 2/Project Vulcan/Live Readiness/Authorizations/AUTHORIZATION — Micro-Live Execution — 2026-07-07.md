# AUTHORIZATION — Micro-Live Execution — Engineering Validation · ONE_SESSION_ONLY — 2026-07-07

> **MICRO-LIVE EXECUTION AUTHORIZATION ONLY**
>
> **NO CANDIDATE SELECTED · NO EXECUTION PERFORMED**
>
> **THIS SIGNATURE DOES NOT SUBMIT OR BROADCAST ANY TRANSACTION**
>
> **FINAL PER-TRADE CONFIRMATION STILL REQUIRED BEFORE ANY BUY**
>
> This record authorizes **one future, separately executed** bounded micro-live engineering-validation session — **one BUY and one mandatory SELL** — under the constraints below. It **does not** select a token, start loops, expose capital, or execute trades in this gate.

---

## Record metadata

| Field | Value |
|-------|-------|
| **Gate name** | Micro-Live Execution Authorization Gate — Engineering Validation · ONE_SESSION_ONLY |
| **Record type** | Micro-Live Execution Authorization · Governance-only |
| **Status** | **SIGNED — GOVERNANCE AUTHORIZED — NO EXECUTION PERFORMED — NO CAPITAL EXPOSURE IN THIS GATE** |
| **Signer** | **Taylor Cheaney** |
| **Signature date** | **2026-07-07** |
| **Signature timestamp (UTC)** | **2026-07-07T17:44:00.000Z** *(2026-07-07 11:44 AM UTC-6)* |
| **Authorization expiry (UTC)** | **2026-07-07T21:44:00.000Z** *(4 hours after signature · 2026-07-07 3:44 PM UTC-6)* |
| **No-entry timeout** | **60 minutes** after **Micro-Live Execution Gate** start *(not from this signature)* |
| **Linked R15 session** | **`RB-G9-20260706-EV01`** · [`AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — 2026-07-06.md`](AUTHORIZATION%20%E2%80%94%20R15%20ENGINEERING-VALIDATION%20ONE_SESSION_ONLY%20%E2%80%94%202026-07-06.md) |
| **Linked R15 expiry** | **2026-07-20** *(if unused — see R15 §4)* |
| **Research wallet public address** | `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |
| **Runtime stub path** | `analysis/r15_manual_approval_record.json` *(present · gitignored · non-canonical)* |
| **OR-20260630-008** | **not_promoted** |
| **Strategy readiness** | **NOT READY** |
| **Capital exposure status** | **none** *(unchanged in this gate)* |
| **Preparation review** | [`../MICRO-LIVE EXECUTION AUTHORIZATION PREPARATION REVIEW — 2026-07-07.md`](../MICRO-LIVE%20EXECUTION%20AUTHORIZATION%20PREPARATION%20REVIEW%20%E2%80%94%202026-07-07.md) |
| **Gate receipt** | [`../MICRO-LIVE EXECUTION AUTHORIZATION GATE — 2026-07-07.md`](../MICRO-LIVE%20EXECUTION%20AUTHORIZATION%20GATE%20%E2%80%94%202026-07-07.md) |

---

## 1. Authorized scope (one trade · entry + exit together)

Taylor authorizes **one manually selected engineering-validation trade only** in session **`RB-G9-20260706-EV01`**, to be executed in a **future separate Micro-Live Execution Gate** — not in this gate.

| Authorized scope | Detail |
|------------------|--------|
| **Purpose** | Engineering validation of real-path submit/confirm/reconcile/exit under human supervision — **not** strategy deployment |
| **Entries** | **Maximum 1 BUY** |
| **Exits** | **Exactly 1 mandatory SELL** to return flat — authorized **together with entry** for this single trade |
| **Second trade / second entry** | **Forbidden** |
| **Position size** | **0.005 SOL maximum** — fixed |
| **0.01 SOL escalation** | **Not authorized** |
| **Scaling / compounding / averaging / martingale** | **Forbidden** |
| **Unattended execution** | **Forbidden** |
| **Loop authorization** | **`FOMO_ALLOW_LOOP_LIVE=YES` forbidden** · scanner/executor `--loop` **forbidden** |
| **Execution mode** | Manual · attended · single-shot · no-loop |

**Governance separation:** This signed record authorizes **future execution discussion and a future execution gate**. It **does not** authorize execution by itself. **Final per-trade confirmation** (§8) is required immediately before any BUY.

---

## 2. Candidate constraints (record before execution — not in this gate)

No candidate is selected or approved in this gate. Before any future BUY, operator must record:

| # | Constraint |
|---|------------|
| **CS1** | **Manual candidate selection only** — no autonomous scanner loop |
| **CS2** | **Token contract address** recorded before execution |
| **CS3** | **Pair address** recorded before execution |
| **CS4** | Pool liquidity **≥ $25,000 USD** — freshly verified |
| **CS5** | Quoted price impact **≤ 2.0%** |
| **CS6** | Quote age **≤ 10 seconds** at submit |
| **CS7** | Quoted slippage **≤ 100 bps (1.0%)** — G3 override **disabled** |
| **CS8** | **No known** freeze authority · transfer restrictions · or obvious honeypot behavior where detectable |
| **CS9** | Route and venue documented (secret-free) |
| **CS10** | Entry: one **BUY** via dedicated RPC · `public_micro_live_only` |
| **CS11** | Exit: one **SELL** under execution bounds (§3) |

**Reject** if any constraint fails at selection or pre-entry re-check.

---

## 3. Execution bounds (enforced configuration + signed session)

| Parameter | Bound |
|-----------|-------|
| **Target** | **+10%** from monitoring entry price |
| **Stop** | **−5%** from monitoring entry price |
| **Position timeout** | **20 minutes** |
| **Confirmation timeout** | **30 seconds** |
| **Realized slippage halt** | **200 bps** post-fill |
| **Session loss stop** | **0.03 SOL** |
| **Daily loss stop** | **0.03 SOL** |
| **Default slippage cap** | **100 bps** — G3 **disabled** |
| **Price impact cap** | **2.0%** |
| **Quote freshness** | **10 seconds** |
| **Min pool liquidity** | **$25,000** |
| **MEV route mode** | **`public_micro_live_only`** |
| **Max open positions** | **1** |
| **Max trades this session** | **1** |

---

## 4. Final per-trade confirmation (mandatory — separate from this signature)

| Rule | Requirement |
|------|-------------|
| **This authorization alone** | **Insufficient to execute** |
| **Before any BUY** | Taylor must provide **separate final per-trade confirmation** after candidate details and fresh quote are presented |
| **Confirmation scope** | Token · pair · quote timestamp · route · liquidity · impact · slippage · 0.005 SOL size |
| **Operator may withhold** | Confirmation at any time — abort without penalty beyond session governance |

---

## 5. Residual risk acceptance (signed)

Taylor acknowledges and accepts **all** of the following for this bounded engineering-validation session:

| # | Residual risk | Accepted |
|---|---------------|----------|
| **R1** | **Real transaction broadcast remains unproven** until future execution gate | **Yes** |
| **R2** | **Production-root reconciliation and e-stop proofs remain deferred** — fixture evidence only | **Yes** |
| **R3** | **Total loss is possible** — up to signed session caps (0.03 SOL loss stops) | **Yes** |
| **R4** | **Slippage and MEV risk exist** — caps enforced but not eliminated | **Yes** |
| **R5** | **RPC or confirmation failure may occur** | **Yes** |
| **R6** | **Exit may be delayed or fail** — operator must follow e-stop/reconciliation runbook | **Yes** |
| **R7** | **Strategy is NOT READY** | **Yes** |
| **R8** | **No profitability or edge claim exists** | **Yes** |
| **R9** | **Session is engineering validation only** — not deployment or income | **Yes** |
| **R10** | **OR-20260630-008 remains not_promoted** | **Yes** |
| **R11** | **Live / human soak / strategy readiness claims forbidden** | **Yes** |

---

## 6. Expiration and invalidation rules

This Micro-Live Execution Authorization expires or is invalidated under **any** of the following (first trigger wins unless noted):

| # | Trigger |
|---|---------|
| **X1** | **Authorization clock** — **4 hours** after signature (**2026-07-07T21:44:00.000Z**) |
| **X2** | **R15 expires** — including unused expiry **2026-07-20** or any R15 §4 rule |
| **X3** | **R15 consumed or invalidated** — one trade · armed session completed · ambiguity · halt · e-stop · posture drift · RB-G9 filing failure |
| **X4** | **No entry within 60 minutes** after **Micro-Live Execution Gate** start — mandatory disarm · stub removal · RB-G9 **`NO_TRADE_EXECUTED`** |
| **X5** | **Ambiguity, halt, e-stop, or posture drift** |
| **X6** | **Signer or wallet mismatch** vs config/stub |
| **X7** | **Safety or preflight failure** at execution gate |
| **X8** | **Candidate constraint failure** (§2) at pre-entry |
| **X9** | **One entry executed** — authorization consumed for entry; **exit authority survives entry solely to close the authorized position**; **no second entry permitted** |

**After expiration without entry:** Disarm · remove/consume runtime stub · file RB-G9 **`NO_TRADE_EXECUTED`** or **`ABORTED_BEFORE_BROADCAST`** as applicable.

---

## 7. Post-session obligations (future execution gate)

After any future execution attempt — trade completed · aborted · or no-entry timeout:

| # | Obligation |
|---|------------|
| **O1** | **Mandatory exit or emergency close attempt** if entry occurred |
| **O2** | **Reconcile flat** — 0 OPEN live positions · 0 blocking pending reconciliation |
| **O3** | **Disarm** — reverse C1–C3 per arming transition rollback plan |
| **O4** | **Remove/consume** `analysis/r15_manual_approval_record.json` |
| **O5** | **File RB-G9** at `Sessions/SESSION — RB-G9-20260706-EV01 — {YYYY-MM-DD}/` |
| **O6** | Document **no-trade** or **aborted** session if no entry occurred |

---

## 8. Explicit non-authorizations (this signed record / this gate)

| Item | Status |
|------|--------|
| Candidate selected or approved | **No** |
| Final per-trade confirmation given | **No** |
| Actual execution performed | **No** |
| Transaction submission or broadcast | **No** |
| `enterPosition` / `exitPosition` / `submitSwap` invoked | **No** |
| Scanner/executor loops started | **No** |
| `FOMO_ALLOW_LOOP_LIVE=YES` | **No** |
| Live position / pending reconciliation / capital exposure | **No** |
| `live_config.json` / `.env` / runtime stub modified | **No** |
| G3 enabled · 0.01 SOL authorized | **No** |
| OR-20260630-008 promoted | **No** |
| Live / human soak / strategy / profitability claims | **No** |

---

## 9. Future execution gate prerequisites

A future **Micro-Live Execution Gate** may proceed **only if all** pass immediately before any BUY:

| # | Prerequisite |
|---|--------------|
| **P1** | This signed authorization valid and not expired |
| **P2** | R15 `ONE_SESSION_ONLY` valid · unused · session `RB-G9-20260706-EV01` |
| **P3** | Runtime stub present and loader-valid |
| **P4** | System armed · `liveArmed: true` · no loops |
| **P5** | Fresh safety suite **82/82 PASS** |
| **P6** | Signer/RPC preflight PASS |
| **P7** | Candidate CS1–CS11 recorded and re-verified |
| **P8** | **Taylor final per-trade confirmation** given (§4) |
| **P9** | 0 open live positions · 0 pending reconciliation · capital exposure none |
| **P10** | G3 disabled · `positionSizeSol: 0.005` · no 0.01 SOL intent |

**Recommended preparatory gate before execution:** **Micro-Live Candidate Selection and Per-Trade Confirmation Preparation**

---

## 10. Linked evidence

| Prerequisite | Path |
|--------------|------|
| **Preparation review** | [`../MICRO-LIVE EXECUTION AUTHORIZATION PREPARATION REVIEW — 2026-07-07.md`](../MICRO-LIVE%20EXECUTION%20AUTHORIZATION%20PREPARATION%20REVIEW%20%E2%80%94%202026-07-07.md) |
| **R15 signed session** | [`AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — 2026-07-06.md`](AUTHORIZATION%20%E2%80%94%20R15%20ENGINEERING-VALIDATION%20ONE_SESSION_ONLY%20%E2%80%94%202026-07-06.md) |
| **Arming authorization** | [`AUTHORIZATION — Arming — 2026-07-07.md`](AUTHORIZATION%20%E2%80%94%20Arming%20%E2%80%94%202026-07-07.md) |
| **Arming transition gate** | [`../ARMING TRANSITION EXECUTION GATE — 2026-07-07.md`](../ARMING%20TRANSITION%20EXECUTION%20GATE%20%E2%80%94%202026-07-07.md) |
| **Runtime stub creation** | [`AUTHORIZATION — Runtime R15 Approval Stub Creation — 2026-07-07.md`](AUTHORIZATION%20%E2%80%94%20Runtime%20R15%20Approval%20Stub%20Creation%20%E2%80%94%202026-07-07.md) · [`../RUNTIME R15 APPROVAL STUB CREATION GATE — 2026-07-07.md`](../RUNTIME%20R15%20APPROVAL%20STUB%20CREATION%20GATE%20%E2%80%94%202026-07-07.md) |
| **Micro-live runbook** | [`../MICRO-LIVE RUNBOOK CONSOLIDATION — 2026-07-05.md`](../MICRO-LIVE%20RUNBOOK%20CONSOLIDATION%20%E2%80%94%202026-07-05.md) |
| **RB-G9 storage** | [`../RB-G9 STRUCTURED STORAGE DECISION — 2026-07-06.md`](../RB-G9%20STRUCTURED%20STORAGE%20DECISION%20%E2%80%94%202026-07-06.md) |

---

## 11. Taylor Cheaney — signed attestation

I, Taylor Cheaney, acknowledge and attest:

1. I authorize **one future bounded micro-live engineering-validation session** — **one BUY and one mandatory SELL** — under the scope, candidate constraints, execution bounds, and expiration rules in this record.
2. **This gate performs no execution.** No candidate is selected. No transaction is submitted or broadcast. No loop is started. No capital is exposed in this gate.
3. **This signature alone is insufficient to execute.** I must provide **separate final per-trade confirmation** after candidate details and a fresh quote are presented.
4. Strategy readiness is **NOT READY**; I make **no** profitability, strategy-edge, live readiness, or human soak readiness claim.
5. **Real broadcast remains unproven**; production-root reconciliation/e-stop proofs remain **deferred** — I accept these residuals for this bounded session only.
6. **OR-20260630-008 remains not_promoted.**
7. **0.01 SOL is not authorized.** G3 remains **disabled.** No scaling, compounding, averaging, unattended execution, or loop.
8. If no entry occurs within **60 minutes** after the execution gate starts, I will disarm, consume the runtime stub, and file RB-G9 **`NO_TRADE_EXECUTED`**.
9. After any entry, I will complete mandatory exit, reconcile flat, disarm, consume stub, and file RB-G9 before treating the session closed.

**Signer:** Taylor Cheaney  
**Signature date:** 2026-07-07  
**Signature timestamp (UTC):** 2026-07-07T17:44:00.000Z  
**Authorization expiry (UTC):** 2026-07-07T21:44:00.000Z  
**Linked session ID:** RB-G9-20260706-EV01  
**Final approval status:** **APPROVED FOR ONE MICRO-LIVE EXECUTION SESSION ONLY — GOVERNANCE AUTHORIZATION · NO EXECUTION IN THIS GATE**
