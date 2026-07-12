# Pre-Arming Implementation Planning — 2026-07-05

Status:
**Planning complete — no config, no code, no runtime, no capital**

Gate type:
Consolidated pre-arming implementation plan — credit-conscious future gate sequence

Prerequisites:
Full live-readiness planning arc through `R14 CONFIG HARMONIZATION PLANNING — 2026-07-05.md`

Live readiness achieved:
**No**

Human soak readiness:
**Not authorized**

OR-20260630-008:
**not_promoted** (unchanged)

**Code changed:** **No** · **Runtime processes started:** **No** · **`live_config.json` modified:** **No**

Credit conservation:
No observation windows, no drills, no config apply, no live path in this gate.

---

## 1. Files Inspected (read-only)

| File | Purpose |
|------|---------|
| `LIVE READINESS PREPARATION PLANNING — 2026-07-05.md` | LR-01–LR-09; authorization sequence |
| `R7B STRATEGY EVIDENCE ASSESSMENT — 2026-07-05.md` | LR-02/LR-03 deferred |
| `A1 STATE DURABILITY DRILL PLANNING — 2026-07-05.md` | A1-D01–D09; A1-EV1 |
| `R14 POLICY DECISION SESSION — 2026-07-05.md` | Taylor R14 decisions |
| `R14 CONFIG HARMONIZATION PLANNING — 2026-07-05.md` | Config apply map |
| `MICRO-LIVE RUNBOOK GAP REVIEW — 2026-07-05.md` | RB-G1–G14 |
| `ACTIVE_MANIFEST.md` | Posture boundaries; R12–R16 helpers |

---

## 2. Executive Summary

Process/control evidence is **closed** (B2A 12h). Pre-arming work remains across **strategy**, **durability drills**, **R14 config+enforcement**, **signer/reconciliation**, **runbook/R13 authorization**, and **R16 live path**. 

This plan defines a **consolidated, ordered, credit-conscious path** to future implementation gates. It **does not** implement, apply config, drill, arm, or authorize capital.

**Arming invariant:** `liveArmed` remains **false** until a **separate explicit arming gate** after all non-negotiable blockers below.

---

## 3. Consolidated Implementation Matrix

| Workstream | Current status | Required action | Blocking severity | Doc-only? | Code? | Runtime drill? | Required future gate | Risk if skipped |
|------------|----------------|-----------------|-------------------|-----------|-------|----------------|----------------------|-----------------|
| **R14 config harmonization** | Planned; not applied | Apply mapped field diffs per harmonization note | **Critical** | No | Config write only | No | **R14 Config Harmonization Implementation Authorization** | Loose slippage/loss caps at arming |
| **R14 enforcement implementation** | Policy decided; not coded | Quote age, hard reject 300 bps, realized halt, route rules, retry+re-quote, partial-fill abort, MEV mode, audit fields | **Critical** | Partial plan | **Yes** | Optional fixture test | **R14 Slippage/MEV Implementation Planning** → **Implementation Execution** | Policy on paper only |
| **Liquidity/depth numeric threshold** | **`TBD_BLOCKING`** | Taylor decision on numeric floor + config key | **Critical** | **Yes** (decision gate) | Later | No | **R14 Liquidity/Depth Threshold Decision** | Illiquid pool live trades |
| **A1-D01 clean stop/restart** | Planned; not run | Short DRY drill | **High** | No | No | **Yes** | **A1-D01 Clean Stop/Restart Drill Execution** | Wrong restart assumptions |
| **A1-D02 stale lock recovery** | Planned; B2A orphan documented | Short DRY drill | **High** | No | No | **Yes** | **A1-D02 Stale Lock Recovery Drill Execution** | Unsafe lock hygiene |
| **A1-D03 crash/interruption** | Planned; not run | Controlled CRASH drill | **High** | No | No | **Yes** | **A1-D03 Crash/Interruption Drill Execution** | Torn state under load |
| **A1-D04 reconciliation interrupt** | Planned; not run | DRY reconciliation drill | **High** | No | No | **Yes** | **A1-D04 Reconciliation Interrupt Drill Execution** | Unreconciled ambiguous outcomes |
| **A1-D05 audit durability** | Planned; not run | DRY append-only verification | **Medium** | No | No | **Yes** (short) | **A1-D05 Audit Durability Drill Execution** | Lost audit trail |
| **A1-D06 snapshot read-during-write** | DOC in drill plan | Review + optional short DRY | **Medium** | **Yes** first | Maybe | Optional | **A1-D06 Snapshot Read-During-Write Review** | Stale wallet/RPC reads |
| **A1-D07 observation idempotency** | Planned; not run | DRY dedup drill | **High** | No | No | **Yes** | **A1-D07 Observation Idempotency Drill Execution** | Duplicate intents |
| **A1-D08 recovery_actions policy** | Planned | DOC review of A2 allowlist | **Medium** | **Yes** | No | No (SIM in CI) | **A1-D08 Recovery Actions Policy Review** | Unauthorized recovery surface |
| **A1-D09 live idempotency SIM** | R10 harness exists | Review simulation output | **High** | **Yes** | No | SIM only | **A1-D09 Live-Path Idempotency Simulation Review** | Double submit |
| **A1-EV1 A1d 24h** | Not executed; not waived | Future authorized observation | **Medium** | No | No | **Yes** (24h) | **A1d Stability Observation Execution** (separate auth) | Missing long-run race evidence |
| **Signer path / secret-safe validation** | Fake harness only | Readiness review; no secret dump | **Critical** | Partial | **Yes** (later) | DRY/SIM | **Live Submission Path Readiness Review** | Wrong signer / leak |
| **Reconciliation drill** | Deferred | A1-D04 + live-path reconcile procedure | **High** | Partial | **Yes** (later) | **Yes** | **Reconciliation Dry-Run Drill Execution** | Orphan positions |
| **E-stop / kill-switch drill** | R11 simulation only | Live-path block drill (no capital) | **Critical** | Partial | **Yes** (later) | **Yes** | **E-Stop Live-Path Drill Execution** | Trading during halt |
| **Micro-live runbook completion** | Gaps reviewed; incomplete | Consolidated operator runbook + tabletop | **High** | **Yes** (consolidation) | No | Optional rehearsal | **Micro-Live Runbook Consolidation** → **Dry Rehearsal** | Operator error |
| **R15/R13 signed approval record** | Template only | Taylor signed record with R14/R7b acks | **Critical** | Partial | No | No | **R13 Final Micro-Live Approval Review** | Unaccountable arming |
| **R7b strategy / R13 waiver** | Insufficient; deferred collection | Thresholds met **or** signed research-exception waiver | **Critical** | Partial | No | No | **R13 waiver decision** (human) | Live without edge evidence |
| **OR-20260630-008 promotion** | **not_promoted** | Separate if ever requested | **None** for micro-live | **Yes** | No | No | **OR Promotion Review** (optional) | Conflating OR with live |
| **R16 live path coupling** | Gaps inventoried | Signer, submit, confirm, position write, R14 gates in executor | **Critical** | Partial plan | **Yes** | **Yes** (SIM/harness) | **R16 Live Path Implementation Planning** → execution gates | Broken live path |

---

## 4. Recommended Future Gate Order (Credit-Conscious)

Consolidated sequence minimizing overhead while preserving safety. **Each line is a separate gate** unless noted as combinable (§5).

| Phase | Order | Gate | Type | Capital? |
|-------|-------|------|------|----------|
| **A — Doc decisions (no runtime)** | 1 | **R14 Liquidity/Depth Threshold Decision** | Doc | No |
| | 2 | **A1-D08 Recovery Actions Policy Review** | Doc | No |
| | 3 | **A1-D09 Live-Path Idempotency Simulation Review** | Doc/SIM | No |
| | 4 | **Micro-Live Runbook Consolidation** | Doc | No |
| **B — Config (authorized apply only)** | 5 | **R14 Config Harmonization Implementation Authorization** | Config apply | No |
| **C — Code planning then implementation** | 6 | **R14 Slippage/MEV Implementation Planning** | Doc | No |
| | 7 | **R16 Live Path Implementation Planning** | Doc | No |
| | 8 | **R14 + R16 Implementation Execution** *(combined code gate)* | Code + tests | No |
| **D — Drills (short; Taylor authorized batches)** | 9 | **A1 Drill Authorization Decision** | Authorization doc | No |
| | 10 | **A1 Critical Drill Batch** *(D01, D02, D07 — combinable)* | Runtime DRY | No |
| | 11 | **A1-D03 Crash/Interruption Drill Execution** | Runtime CRASH | No |
| | 12 | **A1-D04 + Reconciliation Dry-Run Drill** *(combinable)* | Runtime DRY | No |
| | 13 | **E-Stop Live-Path Drill Execution** | Runtime SIM/DRY | No |
| | 14 | **Live Submission Path Readiness Review** | Doc + harness | No |
| **E — Human authorization** | 15 | **R13 Final Micro-Live Approval Review** *(incl. R7b waiver if needed)* | Human sign-off | No |
| | 16 | **Pre-Arming Implementation Authorization** | Confirms A–D complete | No |
| **F — Arming / execution (never combined)** | 17 | **Separate Arming Gate** | `liveArmed`/mode | Arming only |
| | 18 | **Separate Micro-Live Execution Gate** | First submit | **Yes** |

**Deferred unless Taylor separately authorizes:** A1-EV1 (24h A1d), passive R7b collection, full observation windows.

---

## 5. Safe to Combine vs Must Stay Separate

### Safe to combine (one gate, one receipt)

| Combined gate | Items | Rationale |
|---------------|-------|-----------|
| **A1 Critical Drill Batch** | A1-D01 + D02 + D07 | Short DRY; same posture; ~1 session |
| **Reconciliation drill bundle** | A1-D04 + reconciliation dry-run | Same concern; one interrupt scenario |
| **R14 + R16 Implementation Execution** | Config enforcement + submit-path guards | Single code review; tests green before merge |
| **Doc decision batch** (optional) | D08 + D09 + runbook consolidation | All doc-only; credit-friendly |

### Must stay separate

| Gate | Why separate |
|------|--------------|
| **R14 Config Harmonization Implementation Authorization** | Config write blast radius; audit trail per manifest |
| **R14 Liquidity/Depth Threshold Decision** | Blocking decision before config key `minPoolLiquidityUsd` |
| **A1-D03 Crash/Interruption** | CRASH class; distinct abort criteria |
| **E-Stop Live-Path Drill** | Safety-critical; own receipt |
| **R13 Final Micro-Live Approval Review** | Human accountability; cannot merge with code |
| **Arming gate** | `liveArmed` / mode transition — never with execution |
| **Micro-live execution gate** | Capital exposure — never with arming planning |
| **OR Promotion Review** | Unrelated to micro-live; optional parallel track |

---

## 6. Non-Negotiable Blockers Before Any Arming Gate

All must be satisfied **or** explicitly documented residual-risk acceptance signed by Taylor (where noted):

| # | Blocker | Status today |
|---|---------|--------------|
| N1 | **R14 liquidity/depth threshold decided** | **`TBD_BLOCKING`** |
| N2 | **R14 config harmonized** (slippage 1%, impact 2%, loss 0.03 SOL, retries 2, new keys) | Planned not applied |
| N3 | **R14 enforcement implemented** (quote age, realized halt, route rules, retry discipline, partial-fill policy) | Open |
| N4 | **A1 critical drills executed** (minimum: D01, D02, D03, D07) **or** signed residual-risk acceptance | Not executed |
| N5 | **Signer + reconciliation validated** without secret exposure | Not done |
| N6 | **E-stop live-path drill** | Not done |
| N7 | **Micro-live runbook completed** (consolidated + operator-ready) | Incomplete |
| N8 | **R13/Taylor live-readiness authorization signed** (incl. R14 + R7b waiver if applicable) | Not signed |
| N9 | **R16 live path implementation** for submit/confirm/position-write | Open |
| N10 | **`liveArmed` remains false** until separate arming gate after N1–N9 | **Held** |

**Not required for arming (micro-live path):** OR-20260630-008 promotion (LR-07 optional).

**Strategy:** R7b thresholds **or** explicit R13 research-exception waiver (N8 includes waiver ack).

---

## 7. LR Blocker Status After This Gate

| ID | Status |
|----|--------|
| LR-01 | Open — R13 sign-off required |
| LR-02/LR-03 | Open — deferred collection or waiver |
| LR-04 | Open — signer/submission path |
| LR-05 | Partial — drills planned not run |
| LR-06 | Partial — policy decided; harmonization planned; enforcement open; liquidity TBD |
| LR-07 | not_promoted — optional |
| LR-08 | Partial — runbook gaps reviewed; consolidation pending |
| LR-09 | Open — reconciliation drill pending |
| Process/control | **Closed** |

---

## 8. Explicit Non-Actions (This Gate)

| Non-action | Confirmed |
|------------|-----------|
| Modify `live_config.json` | **No** |
| Modify `.env` | **No** |
| Code changes | **No** |
| Runtime drills / loops / observation | **No** |
| Live mode / `liveArmed` | **No** |
| Capital exposure | **No** |
| OR promotion | **No** |
| Live readiness claim | **No** |
| Secrets inspected | **No** |

---

## 9. Recommended Next Gate

**R14 Liquidity/Depth Threshold Decision**

(Doc-only; resolves **`TBD_BLOCKING`** non-negotiable blocker N1 without runtime or config apply.)

---

## 10. Safety Confirmation

| Item | Value |
|------|-------|
| `.env` opened | **No** |
| Secrets inspected | **No** |
| `process.env` dumped | **No** |
| Code changed | **No** |
| Runtime processes started | **No** |
| OR-20260630-008 status | **not_promoted** |
| Promotion authorized | **No** |
| Live readiness claimed | **No** |
| Human soak readiness claimed | **No** |
| Capital exposure enabled | **No** |

---

**Signed / confirmed by Taylor:** Taylor Cheaney (pre-arming implementation planning, 2026-07-05)
