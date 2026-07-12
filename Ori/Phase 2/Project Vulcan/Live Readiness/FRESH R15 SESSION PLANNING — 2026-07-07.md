# FRESH R15 SESSION PLANNING — 2026-07-07

**Gate:** Fresh R15 Session Planning  
**Date:** 2026-07-07  
**Type:** Planning / documentation only  
**Strategy readiness:** **NOT READY** (unchanged)  
**OR-20260630-008:** **not_promoted** (unchanged)

---

## 1. Objective

Plan a **completely new** `ONE_SESSION_ONLY` engineering-validation authorization chain with a fresh canonical session ID, refreshed evidence links, current safety posture, residual-risk treatment, expiration rules, and RB-G9 destination — **without** creating, signing, or executing any authorization, arming action, runtime stub, candidate packet, or trade.

---

## 2. Files inspected (read-only)

| File | Purpose |
|------|---------|
| `POST-VALIDATOR REMEDIATION VERIFICATION REVIEW — 2026-07-07.md` | Current verified baseline |
| `JUPITER EXECUTION PATH NO-BROADCAST VERIFICATION REVIEW — 2026-07-07.md` | U1/U2 closure evidence |
| `JUPITER EXECUTION PATH REMEDIATION IMPLEMENTATION — 2026-07-07.md` | Adapter + fee remediation receipt |
| `VALIDATE LIVE SYSTEM STATIC VALIDATOR DRIFT REMEDIATION IMPLEMENTATION — 2026-07-07.md` | Validator remediation receipt |
| `Authorizations/AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — 2026-07-06.md` | Prior R15 (consumed/closed) |
| `Authorizations/AUTHORIZATION — Micro-Live Execution — 2026-07-07.md` | Prior micro-live auth (closed) |
| `Sessions/SESSION — RB-G9-20260706-EV01 — 2026-07-07/RB-G9 — REVIEW.md` | Prior session closure |
| `R15 SECURE STORAGE DECISION — 2026-07-06.md` | Authorization storage rules |
| `RB-G9 STRUCTURED STORAGE DECISION — 2026-07-06.md` | Session evidence storage rules |
| `Authorizations/README.md` | Authorization index |
| `Sessions/README.md` | Session index |
| `ACTIVE_MANIFEST.md` | Manifest posture |
| `live_config.json` | Read-only posture confirmation |

---

## 3. New canonical session ID

| Field | Value |
|-------|-------|
| **Proposed session ID** | **`RB-G9-20260707-EV02`** |
| **Format** | `RB-G9-{YYYYMMDD}-EV{nn}` |
| **Increment rationale** | Date advances to 2026-07-07; `EV02` is next engineering-validation ordinal after closed `EV01` |
| **Previous session** | **`RB-G9-20260706-EV01`** — **CLOSED** · **NO_TRADE_EXECUTED** · **must not be reused** |

### Session ID uniqueness verification

| Location checked | `RB-G9-20260707-EV02` present? |
|------------------|-------------------------------|
| `Authorizations/` | **no** |
| `Sessions/` | **no** |
| Runtime records (`analysis/r15_manual_approval_record.json`, `rb_g9_record.json`) | **no** |
| Repository-wide grep | **no matches** |

**Session ID uniqueness verified:** **yes**  
**Previous session reuse prevented:** **yes**

---

## 4. Current posture snapshot (read-only, unchanged by this gate)

| Field | Value |
|-------|-------|
| `executionMode` | `PIPELINE_DRY_RUN` |
| `dryRunMode` | `true` |
| `liveArmed` | `false` |
| `FOMO_ENABLE_LIVE_SUBMISSION` | unset |
| `FOMO_ALLOW_LOOP_LIVE` | not `YES` |
| Runtime R15 stub | **absent** |
| Scanner/executor loops | **not running** |
| Open live positions | **0** |
| Pending reconciliation | **0** |
| Capital exposure | **none** |

---

## 5. Proposed R15 authorization scope

**Purpose:** Engineering validation only — **not** strategy deployment, profitability proof, scaling, soak, or unattended operation.

| Scope element | Proposed value |
|---------------|----------------|
| **Record type** | `ONE_SESSION_ONLY` · Engineering Validation · Pre-Arming Session Scope |
| **Session ID assignment** | **`RB-G9-20260707-EV02`** |
| **Max entries** | **1 BUY** |
| **Mandatory exit** | **1 SELL** (entry + exit authorized together; no second entry) |
| **Default position size** | **0.005 SOL** |
| **Absolute trade cap** | **0.01 SOL not authorized** |
| **Scaling** | **Forbidden** |
| **Averaging down** | **Forbidden** |
| **Compounding** | **Forbidden** |
| **Martingale** | **Forbidden** |
| **Unattended execution** | **Forbidden** |
| **Loop authorization** | **`FOMO_ALLOW_LOOP_LIVE=YES` forbidden** · scanner/executor `--loop` forbidden |
| **G3 manual slippage override (200 bps)** | **Disabled — must remain disabled** |
| **MEV route mode** | **`public_micro_live_only`** |
| **Research wallet (public)** | `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |

**This planning gate does not authorize any of the above.** The table defines the **proposed draft scope** for the next authorization record.

### Explicit non-authorizations (unchanged posture)

| Item | Status |
|------|--------|
| Arming / `liveArmed true` | **No** |
| `FOMO_ENABLE_LIVE_SUBMISSION=YES` | **No** |
| `executionMode LIVE` / `dryRunMode false` | **No** |
| Runtime R15 stub creation | **No** |
| Micro-live execution | **No** |
| Broadcast / capital exposure | **No** |
| OR-20260630-008 promotion | **No** |
| Live / soak / strategy / profitability claims | **No** |

---

## 6. Proposed limits and enforced bounds

Carried forward from prior session + `live_config.json` alignment:

| Parameter | Bound |
|-----------|-------|
| **Default slippage cap** | **100 bps (1.0%)** |
| **G3 manual override** | **Disabled** |
| **Max route price impact** | **2.0%** |
| **Quote freshness maximum** | **10 seconds** |
| **Min pool liquidity floor** | **$25,000 USD** |
| **Target (monitoring)** | **+10%** |
| **Stop (monitoring)** | **−5%** |
| **Position timeout** | **20 minutes** |
| **Confirmation timeout** | **30 seconds** |
| **Realized slippage halt** | **200 bps** post-fill |
| **Session loss stop** | **0.03 SOL** |
| **Daily loss stop** | **0.03 SOL** |
| **`maxDailyLossCount`** | **2** consecutive losses → halt |
| **Max open positions** | **1** |
| **Max trades this session** | **1** |
| **`maxSubmitRetries`** | **2** (R14 policy; validator aligned) |
| **`mevRouteMode`** | **`public_micro_live_only`** |

---

## 7. Remediated evidence incorporated (reusable links)

| Evidence | Status | Canonical path |
|----------|--------|----------------|
| Jupiter unified `/swap/v1` adapter | **Implemented** | `JUPITER EXECUTION PATH REMEDIATION IMPLEMENTATION — 2026-07-07.md` |
| BUY/SELL no-broadcast integration | **PASS** | `test_jupiter_swap_v1_integration.js` · no-broadcast review |
| Fee decomposition corrected (U2) | **Closed** | `jupiter_swap_client.js` · `computeFeeBreakdownSol` |
| Deprecated `quote-api.jup.ag/v6` removed (U1) | **Closed** | `live_executor.js` · validator ✔ |
| `validate_live_system.js` | **PASS** (0 failures, 5 warnings) | `VALIDATE LIVE SYSTEM STATIC VALIDATOR DRIFT REMEDIATION IMPLEMENTATION — 2026-07-07.md` |
| Safety suite | **85/85 PASS** | `POST-VALIDATOR REMEDIATION VERIFICATION REVIEW — 2026-07-07.md` |
| V1–V4 validator drift remediation | **Closed** | Implementation + verification receipts |
| Prior session no-trade closure | **Filed** | `Sessions/SESSION — RB-G9-20260706-EV01 — 2026-07-07/RB-G9 — REVIEW.md` |

---

## 8. Residual risks (signed in future authorization; documented here)

| # | Residual | Treatment |
|---|----------|-----------|
| **R1** | **Real broadcast remains unproven** | Acknowledged; proof only in future execution gate |
| **R2** | **Production-root reconciliation/e-stop evidence deferred** | Fixture/drill evidence only; halt on ambiguity |
| **R3** | **Strategy NOT READY** | No strategy readiness claim |
| **R4** | **No profitability or edge claim** | Engineering validation framing only |
| **R5** | **OR-20260630-008 not_promoted** | Unchanged |
| **R6** | **Five validator warnings** | Accepted informational residuals — do not block planning |
| **R7** | **Prior governance chain consumed** | Fresh R15 + downstream authorizations required |
| **R8** | **Prior arming/micro-live auths closed** | New linked records required if execution path pursued |

---

## 9. Proposed validity windows

### R15 session authorization (unused window)

| Option | Window | Recommendation |
|--------|--------|----------------|
| Prior EV01 pattern | 14 calendar days | Superseded by no-trade lesson |
| **Proposed EV02** | **7 calendar days from signature** | **Recommended** |

**Proposed R15 unused expiry:** **2026-07-14** *(if signed 2026-07-07)*

**Rationale for shortening:** Prior session consumed the full governance chain within ~24 hours and ended without trade; stale authorization increases drift risk between evidence refresh and arming. Seven days balances operator scheduling with evidence freshness.

**Distinction:** R15 expiry governs **whether the session scope remains valid for arming prep**. It is **separate from** micro-live execution authorization expiry (see below).

### Micro-live execution authorization (future gate — not created here)

| Window | Proposed value |
|--------|----------------|
| **Authorization clock** | **4 hours** after signature *(carry forward from EV01 pattern)* |
| **No-entry timeout** | **60 minutes** after Micro-Live Execution Gate start |
| **Final per-trade confirmation** | **Separate** from both R15 and micro-live auth signatures |

---

## 10. Proposed invalidation triggers

First trigger wins unless noted:

| # | Trigger |
|---|---------|
| **I1** | **First armed session completed** — including no-trade or aborted armed session |
| **I2** | **One entry executed** — R15 consumed; exit authority survives only to close authorized position |
| **I3** | **Ambiguity** — reconciliation uncertainty · submission unknown · operator uncertainty |
| **I4** | **Any halt** — policy halt · loss cap · slippage halt · operator abort |
| **I5** | **E-stop activated** — `emergencyStop: true` |
| **I6** | **Posture drift** — unexpected LIVE/disarmed/capital mismatch vs signed plan |
| **I7** | **Signer or public-address mismatch** vs config / stub |
| **I8** | **Safety or validator failure** — suite not green · `validate_live_system` failure |
| **I9** | **Jupiter adapter regression** — v6 path reintroduced · host mismatch · fee double-count |
| **I10** | **R15 validity window lapse** — unused expiry |
| **I11** | **Micro-live auth expiry** — 4-hour clock or 60-minute no-entry timeout |
| **I12** | **RB-G9 not filed** — session incomplete until RB-G9 record exists |
| **I13** | **Session ID reuse attempted** — forbidden |

**After any invalidation:** Disarm · consume/remove runtime stub · file RB-G9 · require new R15 for any future attempt.

---

## 11. Required governance sequence (future gates)

Ordered chain — **each gate is separate**; this planning gate performs **none** of them:

| # | Gate | Purpose |
|---|------|---------|
| **G1** | **Fresh R15 Session Authorization Draft** | Draft new signed-ready authorization for `RB-G9-20260707-EV02` |
| **G2** | **Fresh R15 Session Authorization Sign-Off** | Taylor signs R15 scope only — no arming/execution |
| **G3** | **Pre-Arming Blocker Refresh** | Re-run 85/85 · `validate_live_system` · posture · RPC read-only · signer/public-address check |
| **G4** | **Arming Authorization** | New or refreshed arming authorization linked to EV02 R15 |
| **G5** | **Arming preparation** | Pre-flight checklist · evidence links · rollback plan |
| **G6** | **Arming transition** | C1–C3 env/config transition under human supervision |
| **G7** | **Runtime-stub authorization / creation** | Signed stub creation + `analysis/r15_manual_approval_record.json` |
| **G8** | **Micro-live authorization preparation / sign-off** | Separate micro-live execution authorization (4-hour window) |
| **G9** | **Candidate preparation** | Manual candidate packet · CS1–CS11 constraints |
| **G10** | **Final per-trade confirmation** | Taylor confirms token · quote · fees · 0.005 SOL immediately before BUY |
| **G11** | **Single-trade execution** | One BUY + one mandatory SELL under bounds |
| **G12** | **Disarm / stub consumption / RB-G9** | Rollback C1–C3 · file session evidence |

**Note on prior authorizations:** EV01 R15, arming auth, stub creation auth, and micro-live auth are **consumed/closed**. EV02 requires a **fresh chain** starting at G1–G2. Prior signed records remain audit history only.

---

## 12. Evidence reuse vs refresh requirements

### Reusable without re-implementation

| Evidence | Path / basis |
|----------|--------------|
| Jupiter remediation implementation | `JUPITER EXECUTION PATH REMEDIATION IMPLEMENTATION — 2026-07-07.md` |
| Jupiter no-broadcast verification | `JUPITER EXECUTION PATH NO-BROADCAST VERIFICATION REVIEW — 2026-07-07.md` |
| Validator drift remediation | `VALIDATE LIVE SYSTEM STATIC VALIDATOR DRIFT REMEDIATION IMPLEMENTATION — 2026-07-07.md` |
| Post-validator verification | `POST-VALIDATOR REMEDIATION VERIFICATION REVIEW — 2026-07-07.md` |
| Signer placement (public address) | `SIGNER SECRET PLACEMENT EXECUTION — 2026-07-06.md` |
| R13 waiver (engineering-validation framing) | `R13 SIGN-OFF GATE — 2026-07-06.md` |
| Prior RB-G9 no-trade lessons | `Sessions/SESSION — RB-G9-20260706-EV01 — 2026-07-07/` |

### Must be refreshed immediately before arming / execution

| Check | Command / method |
|-------|------------------|
| Full safety suite | `node run_safety_tests.js` → **85/85 PASS** |
| Static validator | `node validate_live_system.js` → **0 failures** |
| Signer / public-address match | `EXPECTED_WALLET_PUBLIC_ADDRESS` vs `live_config.json` — no secret print |
| Dedicated RPC read-only | `a4_rpc_proof.js` or equivalent read-only proof |
| Runtime posture | `computeLiveArmedStatus()` · config read · 0 positions · 0 reconciliation |
| Fresh quote / route / liquidity / impact / fees | At candidate prep and again at final per-trade confirmation |
| Fee upper bound for 0.005 SOL | Re-verify single-entry non-rent decomposition post-U2 |

---

## 13. RB-G9 destination (planned — not created in this gate)

**Canonical path (create at session close, not in planning gate):**

```
Ori/Phase 2/Project Vulcan/Live Readiness/Sessions/SESSION — RB-G9-20260707-EV02 — {SESSION_DATE}/
  RB-G9 — REVIEW.md
  rb_g9_record.json          (optional machine sidecar)
  CANDIDATE PACKET — RB-G9-20260707-EV02 — {SESSION_DATE}.md   (if candidate prep occurs)
```

**Placeholder `{SESSION_DATE}`:** Use actual session execution or disarm date (likely `2026-07-07` or later).

**Session folder created in this gate:** **no** — per RB-G9 decision, folder is created when session evidence is filed.

---

## 14. Prior session lessons applied to EV02

| Lesson from EV01 | EV02 planning response |
|------------------|------------------------|
| U1 quote-path mismatch blocked trade | U1 **closed** — unified `/swap/v1` adapter verified |
| U2 fee ~0.007 SOL vs 0.005 blocked trade | U2 **closed** — fee decomposition corrected |
| Final per-trade confirmation never given | G10 remains mandatory separate step |
| 4-hour micro-live auth expired unused | Refresh at G8 immediately before candidate prep |
| Full chain executed without trade | R15 shortened to 7-day unused window recommended |

---

## 15. Gate constraints confirmation

| Field | Value |
|-------|-------|
| Session folder created | **no** |
| Authorization created | **no** |
| Authorization signed | **no** |
| Runtime stub created | **no** |
| Code / tests / validator changed | **no** |
| Config / `.env` changed | **no** |
| System armed | **no** |
| Submit / broadcast invoked | **no** |
| Position / reconciliation / capital | **none** |
| OR-20260630-008 | **not_promoted** |
| Readiness / profitability claims | **no** |

---

## 16. Recommended next gate

**Fresh R15 Session Authorization Draft**

---

## 17. Sign-off

| Field | Value |
|-------|-------|
| Fresh session architecture documented | **yes** |
| New session ID assigned | **`RB-G9-20260707-EV02`** |
| EV01 reuse prevented | **yes** |
| Governance sequence defined | **yes** |
| No authorization or execution action | **confirmed** |
