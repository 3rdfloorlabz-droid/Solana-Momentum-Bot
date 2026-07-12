# R14 Pre-Arming Fix Authorization — 2026-07-05

Status:
**Authorization complete — Taylor authorizes future limited G1/G2/G5 fix gate; no code, no config, no runtime in this gate**

Gate type:
Human authorization record — scope and boundaries for R14 pre-arming residual fixes only

Prerequisites:
`PRE-ARMING BLOCKER STATUS REVIEW — 2026-07-05.md` · `R14 IMPLEMENTATION VERIFICATION REVIEW — 2026-07-05.md` · `R14 CONFIG ENFORCEMENT IMPLEMENTATION — 2026-07-05.md`

Decision authority:
**Taylor Cheaney**

Live readiness achieved:
**No**

Human soak readiness:
**Not authorized**

OR-20260630-008:
**not_promoted** (unchanged)

**Code changed:** **No** · **Config changed:** **No** · **Runtime processes started:** **No**

---

## 1. Files Inspected (read-only)

| File | Purpose |
|------|---------|
| `PRE-ARMING BLOCKER STATUS REVIEW — 2026-07-05.md` | G1/G2/G5 classification; N1–N3 closed; recommended this gate |
| `R14 IMPLEMENTATION VERIFICATION REVIEW — 2026-07-05.md` | Residual gap decisions; arming-not-ready verdict |
| `R14 CONFIG ENFORCEMENT IMPLEMENTATION — 2026-07-05.md` | Implemented surfaces; known gaps |
| `live_config.json` (read-only) | `maxSessionLossSol: 0.03` present; `maxDailyLossCount: 3` |
| `live_executor.js` (grep/read-only) | `dailyStopHit()` uses daily only; BUY passes `poolLiquidityUsd`; SELL does not |

---

## 2. Authorization Decision (Taylor — Recorded)

Taylor **authorizes a future R14 Pre-Arming Fix Implementation gate** to address **G1, G2, and G5 only** — the remaining R14-specific pre-arming gaps identified after LR-06 implementation verification.

**This authorization gate does not apply fixes.** It grants scope for the next implementation gate only.

---

## 3. Authorized Scope (Next Gate — G1/G2/G5 Only)

| ID | Gap | Current state (verified) | Authorized fix |
|----|-----|--------------------------|----------------|
| **G1** | Session-loss tracking distinct from daily stop | `maxSessionLossSol: 0.03` in config; `dailyStopHit()` enforces `maxDailyLossSol` + `maxDailyLossCount` only — **no separate session accumulator** | Implement **distinct session-loss tracking** that separately enforces `maxSessionLossSol` (session-scoped realized loss, reset on explicit session boundary or documented session start semantics). If session and daily caps are intentionally equivalent at micro-live, implementation must still **enforce `maxSessionLossSol` explicitly** (not rely on daily stop alone) and surface session stop in `safetyCheck()` / audit. |
| **G2** | `maxDailyLossCount` harmonization | Config **3**; R8/R14 planning suggested **2** consecutive losses; `dailyStopHit()` defaults to 3 | Harmonize `maxDailyLossCount` **3 → 2** in `live_config.json` **if** consistent with R14 policy and existing tests; wire through `dailyStopHit()` / `safetyCheck()` messaging. |
| **G5** | SELL liquidity parity | BUY `enterPosition()` passes `poolLiquidityUsd: candidate.liquidity`; SELL `executeLiveExitImpl()` **does not** pass liquidity; `checkExecutionTimeLiquidity()` skips when absent | Add **SELL-path liquidity parity**: pass `poolLiquidityUsd` (or equivalent exit-path liquidity evidence from position/candidate/fresh read) into SELL `submitSwap()`; enforce `minPoolLiquidityUsd` floor at submit time **fail-closed** (same $25k micro-live floor as BUY). |

### Combined gate rule

All three fixes may ship in **one reviewed diff** (`R14 Pre-Arming Fix Implementation`) provided:
- Scope stays limited to G1/G2/G5
- `run_safety_tests.js` green before and after
- No arming, live mode, or capital enablement

---

## 4. Implementation Boundaries

### 4.1 Allowed in next gate

| Category | Allowed |
|----------|---------|
| Edit `live_config.json` | **G2 only** — `maxDailyLossCount: 2` (if policy-consistent) |
| Edit `live_executor.js` | Session-loss logic (G1); daily count wiring (G2); SELL liquidity pass-through + enforcement (G5) |
| Add/extend tests | Fail-closed tests per §6 |
| Implementation receipt | `R14 PRE-ARMING FIX IMPLEMENTATION — 2026-07-05.md` (or dated receipt) |

### 4.2 Forbidden in next gate (even with this authorization)

| Category | Forbidden |
|----------|-----------|
| `.env` edits | **No** |
| Secret inspection / logging | **No** |
| `executionMode` → LIVE | **No** |
| `liveArmed: true` | **No** |
| `FOMO_ALLOW_LOOP_LIVE=YES` | **No** |
| Capital exposure / live trading / micro-live execution | **No** |
| OR promotion | **No** |
| R13 sign-off / human soak claim | **No** |
| Live readiness claim | **No** |
| A1 drill execution | **No** |
| Signer validation / R16 implementation | **No** |
| R14 scope beyond G1/G2/G5 | **No** — no re-opening E1–E9 unless bugfix strictly required for G1/G2/G5 |

---

## 5. Explicit Non-Authorizations (This Gate and Next Gate Unless Separately Gated)

| Item | Status |
|------|--------|
| `.env` edits | **Not authorized** |
| Secret inspection | **Not authorized** |
| Live mode / arming | **Not authorized** |
| `liveArmed true` | **Not authorized** |
| `FOMO_ALLOW_LOOP_LIVE=YES` | **Not authorized** |
| Capital exposure | **Not authorized** |
| Live trading / micro-live execution | **Not authorized** |
| OR promotion | **Not authorized** |
| R13 sign-off | **Not authorized** |
| Human soak readiness claim | **Not authorized** |
| A1 drill execution | **Not authorized** |
| Signer validation | **Not authorized** |
| R16 live path implementation | **Not authorized** |

---

## 6. Required Tests (Next Gate)

Minimum fail-closed test additions/updates:

| Test | Covers |
|------|--------|
| `test_execution_time_liquidity_floor.js` (extend) or new `test_sell_liquidity_parity.js` | **G5** — SELL submit path rejects **< $25k**; passes when liquidity supplied |
| New or extend `test_session_loss_stop.js` | **G1** — session loss at `maxSessionLossSol` triggers stop independent of daily calendar boundary semantics |
| Extend `test_r8_risk_controls_check.js` or daily-stop fixture test | **G2** — loss count stop at **2** when harmonized |
| Existing R14 suite | Must remain green — `run_safety_tests.js` **before and after** |

---

## 7. Required Invariants (Must Hold After Implementation)

| Invariant | Required value / behavior |
|-----------|---------------------------|
| `executionMode` | **`PIPELINE_DRY_RUN`** (unchanged) |
| `dryRunMode` | **`true`** |
| `liveArmed` | **`false`** |
| `capitalExposure` | **`none`** |
| OR-20260630-008 | **`not_promoted`** |
| Live readiness | **Not claimed** by this work alone |
| Human soak readiness | **Not claimed** |
| Secret logging | **None** |
| Liquidity floor scope | **Micro-live only** — $25k minimum unchanged |
| N4–N9 blockers | **Remain open** — this gate does not close drills, R16, R13, or signer path |

---

## 8. Expected Outcome After Next Gate (Not This Gate)

| Item | Expected |
|------|----------|
| R14 arming-readiness (G1/G2/G5) | **Closed** |
| LR-06 R14 track | **Fully closed for micro-live pre-arming** (policy residual only: G3 manual ack, G4 scaling) |
| N1–N3 | **Remain closed** |
| N4–N9 | **Remain open** |
| Arming authorization | **Still not authorized** |

---

## 9. Recommended Next Gate

**R14 Pre-Arming Fix Implementation**

---

## 10. Safety Confirmation

| Item | Value |
|------|-------|
| `.env` opened | **No** |
| Secrets inspected | **No** |
| `process.env` dumped | **No** |
| `live_config.json` modified | **No** |
| `live_executor.js` modified | **No** |
| `executionMode` LIVE set | **No** |
| `liveArmed` true set | **No** |
| `FOMO_ALLOW_LOOP_LIVE=YES` set | **No** |
| Runtime processes started | **No** |
| OR-20260630-008 status | **not_promoted** |
| Promotion authorized | **No** |
| Live readiness claimed | **No** |
| Human soak readiness claimed | **No** |
| Capital exposure enabled | **No** |

---

**Signed / confirmed by Taylor:** Taylor Cheaney (R14 pre-arming fix authorization, 2026-07-05)
