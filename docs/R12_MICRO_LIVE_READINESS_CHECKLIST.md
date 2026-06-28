# R12 — Micro-Live Readiness Checklist

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **CLOSED** — checklist **defined**; **micro-live NOT approved**  
**Review date:** 2026-06-28  

**Helper:** `node r12_micro_live_readiness_check.js` → `analysis/r12_micro_live_readiness_status.json` (read-only)

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED**  
**Capital at risk:** **$0**

---

## 1. Executive verdict

### **CHECKLIST DEFINED BUT BLOCKED**

R12 defines every condition required before a future **final approval review**. The gate sequence is aligned with **R13** (final approval gate) and **R14** (slippage / MEV protection review). Current blockers remain — especially **R7b thresholds not met**, **no explicit human approval**, and **no live path implementation**.

This verdict is **not** “ready for live trading.”

---

## 2. Current gate status

| Gate | Status |
|------|--------|
| **R6a** | **PASS** — 24-hour dry-run soak |
| **R7** | **NOT ENOUGH DATA** — edge not proven |
| **R7b** | **Active — thresholds NOT met** |
| **R8** | **Complete** — risk controls defined, **not armed** |
| **R9** | **Complete** — wallet security defined, **not connected** |
| **R10** | **Complete** — execution path defined, **fake harness only** |
| **R11** | **Complete** — emergency stop validated in **simulation only** |
| **R12** | **Closed** — checklist defined but **blocked** |
| **R13** | **Final approval gate defined — BLOCKED** |
| **R14** | **Slippage / MEV review defined — required before live** |

**Current posture**

| Field | Value |
|-------|-------|
| `executionMode` | `PIPELINE_DRY_RUN` |
| `dryRunMode` | `true` |
| `liveArmed` | `false` |
| `emergencyStop` | `false` |
| `operationalPosture` | `PIPELINE_OBSERVING` |
| `liveSubmission` | **DISARMED** |
| Capital at risk | **$0** |

---

## 3. Hard blockers

| # | Blocker |
|---|---------|
| B1 | R7b thresholds **not met** |
| B2 | R7 fresh edge **not proven** |
| B3 | Real wallet **not connected** through approved bot path |
| B4 | Private key / signer **not implemented** for live |
| B5 | Live execution implementation **not approved** |
| B6 | Emergency stop validated in **simulation only** |
| B7 | **R13 final approval not granted** |
| B8 | Micro-live config **not created** |
| B9 | Explicit human approval **not given** |
| B10 | `liveArmed` **false** |
| B11 | `dryRunMode` **true** |
| B12 | `executionMode` **not MICRO_LIVE** |
| B13 | No **final signed approval record** |
| B14 | No **live session runbook executed** |
| B15 | Slippage / MEV policy **not implemented** as active gate |
| B16 | **1 SOL wallet liquidity is not authorized active risk** |

---

## 4. Required R7b evidence before ordinary final approval review

| Requirement | Threshold |
|-------------|-----------|
| Fresh closed paper trades | **≥ 30** |
| Active-market calendar days | **≥ 7** |
| Thesis matches | **≥ 10** |
| Stop exits | **≥ 5** |
| Target / profitable exits | **≥ 5** |
| Timeout exits | **≥ 5** |
| Fresh profit factor | **≥ 1.20** |
| State corruption | **None** |
| `recovery_actions.jsonl` | **Absent** |
| Safety suite | **Green** |
| Posture | Stable dry-run observing |

Track daily: `node r7b_daily_summary.js`

**Research exception:** If the operator chooses a research exception **before** R7b completion, **R13** must record explicit **R7b bypass risk acknowledgment**. That still **does not approve live automatically**.

---

## 5. Required risk controls before micro-live (R8 — draft only)

**Not written to `live_config.json`.**

| Control | Proposed default |
|---------|------------------|
| Total research budget | Operator-defined |
| Wallet liquidity vs authorized risk | **Distinguished** — wallet balance ≠ approved risk |
| First micro allocation | **0.05 SOL max** authorized session allocation |
| First trade size | **0.005–0.01 SOL** |
| Max open positions | **1** |
| Max trades first session | **1**, then review |
| Max trades per day (after review) | **3** |
| Session drawdown stop | **0.03 SOL** or less |
| Consecutive loss stop | **2** |
| Daily loss cap | Operator-defined (R13 approval record) |
| Weekly loss cap | Operator-defined (R13 approval record) |
| Auto-compounding / scaling / averaging down | **Forbidden** |
| Unattended session | **Forbidden** |
| After any halt | **Manual review** |

**Operator wallet note (context only):** Wallet may contain **1 SOL** as operational liquidity. **1 SOL is not the approved risk amount.**

---

## 6. Required wallet/signer conditions (R9)

| Requirement | Status |
|-------------|--------|
| Dedicated research wallet only | Required — not connected |
| No main / treasury / personal wallet | Required |
| Tiny authorized risk only | Required when funded |
| No unrelated assets / NFTs / high-value tokens | Required |
| Signer secret outside git | Required |
| No secret in docs / chat / logs / dashboard / analysis / git | Required |
| Dry-run must not require signer | Required (current) |
| Live mode must refuse missing/malformed signer | Required (future) |
| No wallet connection before final approval | **Enforced now** |

---

## 7. Required live execution conditions (R10)

All **agreement gates** must pass before any future live signing/submission:

| Gate | Required value |
|------|----------------|
| `executionMode` | **MICRO_LIVE** or **LIVE** |
| `dryRunMode` | **false** |
| `liveArmed` | **true** |
| `emergencyStop` | **false** |
| Singleton lock | Valid |
| Executor loops | Exactly **one** |
| R8 limits | Loaded |
| Wallet monitor | Fresh |
| Signer | Present / validated |
| Operator approval | Present |

Also required:

- Fake signer harness **tested**
- Duplicate submit prevention **tested**
- Confirmation-before-position-write policy **documented**
- Failure modes **documented**
- **No real submission** until approved implementation review

---

## 8. Required emergency stop conditions (R11)

- Emergency stop blocks **sign**
- Emergency stop blocks **submit**
- Mid-flow stop blocks remaining lifecycle
- **No automatic reset**
- Manual reset only
- **No dashboard one-click clear** in first micro-live phase
- Reset requires **written operator decision**
- Reset requires **safety suite** and **posture verification**

Validated in **simulation only** — live drill not performed.

---

## 9. Required slippage / MEV conditions (R14 — draft only)

**Not written to `live_config.json`.**

| Policy | Draft value |
|--------|-------------|
| Default slippage cap | **100 bps / 1%** |
| Manual high-volatility exception | Up to **200 bps** |
| Hard reject | Above **300 bps** |
| Realized slippage warning | Above **100 bps** |
| Realized slippage halt | Above **200 bps** |
| Price impact warning | Above **1%** |
| Price impact hard reject | Above **2%** |
| Quote max age (volatile memecoins) | **5–10 seconds** |
| Re-quote before sign/submit | **Required** if stale |

Also required at design level:

- Route instability rejection defined
- Priority fee policy defined
- MEV protection route reviewed
- Safe logging defined
- Stop conditions defined

See [R14_SLIPPAGE_MEV_PROTECTION_REVIEW.md](./R14_SLIPPAGE_MEV_PROTECTION_REVIEW.md).

---

## 10. Operator approval model (future — R13 §4)

Future approval must include:

- Operator name · date/time
- Wallet public address · total wallet balance
- Authorized session allocation · max trade size
- Max session loss · max daily loss · max weekly loss
- Max open positions · max trades per session · max trades per day
- Session start/end time
- Per-trade approval required: **yes** (first phase)
- Slippage cap acknowledged
- MEV protection plan acknowledged
- Emergency stop reset policy acknowledged
- R7b bypass risk acknowledged (if applicable)
- Total loss risk acknowledged
- No auto-compounding acknowledged
- Live trading not for income acknowledged

---

## 11. First micro-live session runbook (draft)

| Phase | Steps |
|-------|-------|
| **Pre-session** | Git check · safety suite · recovery file check · CLI posture · dashboard posture · singleton lock · executor loop count · emergency stop |
| **Wallet / risk** | Wallet balance check · authorized allocation check · signer secret handling check (no exposure) |
| **Execution policy** | Slippage/MEV policy check · per-trade approval · quote freshness · expected output / minimum output · submit path |
| **During trade** | Submit path check · confirmation check · position write check (after on-chain confirm only) |
| **Exit** | Exit check with same safety stack |
| **Post-session** | Post-session review · paper vs live comparison · Ori / Posture Log update |

Runbook **not executed** — draft only.

---

## 12. Go / no-go matrix

### NO-GO if any:

- Any safety test fails
- `recovery_actions.jsonl` exists unexpectedly
- Duplicate executor loop
- Singleton mismatch
- `emergencyStop: true`
- `liveArmed` mismatch
- `dryRunMode` mismatch
- Dashboard / CLI posture mismatch
- R7b not met **and** no explicit research exception (R13)
- Wallet monitor stale
- Signer missing (when live path armed)
- Risk limits missing
- Slippage / MEV policy missing
- Operator not present
- Market liquidity poor
- Slippage too high
- Quote stale
- MEV route unresolved
- Bot attempts unattended execution

### READY FOR FINAL APPROVAL REVIEW ONLY if:

- All checklist items pass
- Either R7b thresholds met **or** R13 research exception explicitly acknowledged
- R8 / R9 / R10 / R11 / R14 complete
- Safety suite green
- Posture stable
- Research wallet ready but **not over-authorized**
- Explicit operator approval **prepared** (not yet granted)

**Does not authorize micro-live or arming.**

---

## 13. Checklist table

| Category | Requirement | Current status | Blocking? | Evidence / source | Notes |
|----------|-------------|----------------|-----------|-------------------|-------|
| R6a | 24h soak PASS | PASS | No | `soak_runs/r6a_24h_soak_summary.json` | |
| R7 | Fresh edge sufficient | NOT ENOUGH DATA | **Yes** | `analysis/r7_strategy_metrics.json` | |
| R7b | ≥30 fresh closes | Not met | **Yes** | `r7b_daily_summary.js` | |
| R7b | ≥7 active-market days | Not met | **Yes** | `r7b_daily_summary.js` | |
| R7b | Exit mix + PF ≥1.20 | Not met | **Yes** | `r7b_daily_summary.js` | |
| Safety | Safety suite green | 28/28 | No* | `run_safety_tests.js` | |
| Safety | recovery_actions absent | Absent | No | runtime root | |
| Posture | PIPELINE_DRY_RUN / dryRun / disarmed | Current | No* | `live_config.json` | |
| R8 | Risk controls | Defined not armed | No | R8 doc | |
| R9 | Wallet security | Defined not connected | No | R9 doc | |
| R10 | Execution path | Fake harness only | No | R10 doc + harness | |
| R11 | Emergency stop | Simulation only | **Yes** (live drill) | R11 doc | |
| R13 | Final approval gate | Defined blocked | **Yes** (not granted) | R13 doc | |
| R14 | Slippage / MEV | Defined not implemented | **Yes** (live gate) | R14 doc | |
| Approval | Human approval | Not given | **Yes** | operator record | |
| Config | Micro-live config | Not created | **Yes** | future | |
| Wallet | 1 SOL liquidity ≠ authorized risk | Context only | **Yes** | operator | Cap **0.05 SOL** proposed |
| Runbook | Session runbook executed | No | **Yes** | R12 §11 | |

\*Required now; blocking for micro-live arming only when violated.

Machine-readable: `node r12_micro_live_readiness_check.js`

---

## 14. Recommended next gate

1. **Continue R7b data collection** where possible  
2. Use **R13 final approval gate** only if operator explicitly accepts research-exception risk  
3. Use **R14** before any real trade  
4. **Build R15 Manual Approval Record / Session Runbook** next  
5. **Do not connect real wallet** through bot yet  
6. **Do not arm live trading** yet  

---

## 15. Verdict table

| Field | Value |
|-------|-------|
| **R12 verdict** | **CHECKLIST DEFINED BUT BLOCKED** |
| **Micro-live approved** | **NO** |
| **Live trading approved** | **NO** |
| **Status check** | `node r12_micro_live_readiness_check.js` |

---

## 16. Footer

R12 lists every gate.  
It does not open any gate.  
Micro-live remains blocked.  
Humans authorize.  
Gates enforce.
