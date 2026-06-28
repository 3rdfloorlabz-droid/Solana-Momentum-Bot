# R8 — Risk Controls Review

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **COMPLETE** — controls **defined only**; **NOT armed**  
**Review date:** 2026-06-28  
**Operator note:** Research funds may be allocated later for **micro-live execution validation** — this review **does not approve live trading**.

**Prior gates:**  
- [R6_72_HOUR_DRY_RUN_SOAK_PLAN.md](./R6_72_HOUR_DRY_RUN_SOAK_PLAN.md) §16 — R6a **PASS**  
- [R7_STRATEGY_PERFORMANCE_EDGE_REVIEW.md](./R7_STRATEGY_PERFORMANCE_EDGE_REVIEW.md) — **NOT ENOUGH DATA**  
- [R7B_STRATEGY_DATA_COLLECTION_PLAN.md](./R7B_STRATEGY_DATA_COLLECTION_PLAN.md) — collection **IN PROGRESS**  

**Helper:** `node r8_risk_controls_check.js` → `analysis/r8_risk_controls_status.json` (read-only)

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED**

---

## 1. Executive verdict

### **RISK CONTROLS DEFINED BUT NOT ARMED**

Proposed micro-live research-budget boundaries and risk controls are **documented** for a **future** supervised micro-live phase. No control is **active** in `live_config.json`. `liveArmed` remains **false**. Live submission remains **blocked**.

This verdict is **not** “ready for live trading.”

---

## 2. Current status

| Item | Status |
|------|--------|
| **R6a 24h dry-run soak** | **PASS** — system stability under `PIPELINE_DRY_RUN` |
| **R7 Strategy / Edge Review** | **NOT ENOUGH DATA** — soak window had 1 closed paper trade |
| **R7b data collection** | **PLAN COMPLETE — collection IN PROGRESS** — thresholds not met |
| **R8 Risk Controls Review** | **COMPLETE** — defines proposed limits only |
| **Live trading** | **BLOCKED** |
| **Research funds (operator)** | May be used **later** only under **micro-live rules** defined here — **not authorized now** |

Current posture (verified via `node live_executor.js --status`):

- `executionMode: PIPELINE_DRY_RUN`
- `dryRunMode: true`
- `liveArmed: false`
- `recovery_actions.jsonl`: absent
- Safety suite: **21/21 PASS** (22/22 after R8 test added)

---

## 3. Research budget boundary

**All values below are proposed placeholders only.** They are **not** written to `live_config.json` and **not** enforced by the bot today.

| Control | Proposed conservative default |
|---------|-------------------------------|
| Total research budget | **Operator-defined** — not assumed by TracktaOS |
| First micro-live allocation (total at risk) | **$25–$50** maximum |
| First trade size | **$5–$10** equivalent per trade |
| Max open positions | **1** |
| Max trades per day | **3** |
| Max daily loss | **$15** or **30%** of micro allocation, **whichever is lower** |
| Max weekly loss | **$30** or **60%** of micro allocation, **whichever is lower** |
| Stop after consecutive losses | **2** |
| Stop after abnormal execution | **Immediate halt + manual review** |
| Auto-compounding | **Forbidden** |
| Scaling / size increases | **Forbidden** |
| Averaging down | **Forbidden** |
| Revenge trades | **Forbidden** |
| Unattended live session | **Forbidden** |

**Assume total loss of the micro allocation is possible.**

---

## 4. Position sizing rules

Initial micro-live phase (proposed — **not active**):

| Rule | Requirement |
|------|-------------|
| Open positions | **One maximum** |
| Sizing method | **Fixed size only** — no percentage compounding |
| Dynamic size increases | **Forbidden** |
| Increase after win streak | **Forbidden** |
| Increase after loss | **Forbidden** |
| Missing liquidity / slippage data | **No live trade** |
| Missing scanner confidence / thesis data | **No live trade** |
| Wallet monitor stale | **No live trade** |
| Singleton lock unhealthy / PID mismatch | **No live trade** |

Existing executor note: first-live cap in code references `positionSizeSol <= 0.01` for arming gates — **R8 does not change this**; future micro-live config must align with operator USD caps above.

---

## 5. Loss limits

Proposed **hard stops** (manual + automated where supported in future — **not armed now**):

| Limit | Proposed value |
|-------|----------------|
| Per-trade loss cap | Stop at strategy stop (~−5% gross paper band) + **absolute $ cap per trade ($5–$10 risk envelope)** |
| Daily loss cap | **$15** or **30%** of micro allocation (lower) |
| Weekly loss cap | **$30** or **60%** of micro allocation (lower) |
| Consecutive loss cap | **Halt after 2 consecutive losses** |
| Abnormal behavior | Halt on duplicate tx, partial fill anomaly, simulation mismatch, unexpected slippage |
| Emergency stop | `emergencyStop: true` — **must be tested before any future live session** |
| After any halt | **Manual review required** — no same-day resume without written operator sign-off |

---

## 6. Slippage and liquidity controls

**Document only** — implement in a future approved gate; do not loosen current filters.

| Gate | Proposed policy |
|------|-----------------|
| Maximum allowed slippage | Reject if quoted/ simulated slippage exceeds operator-defined cap (suggest start ≤ 300 bps for micro-live research — **explicit review required**) |
| Minimum liquidity | Align with strategy minimums ($25k scanner floor; thesis band stricter) |
| Minimum volume | Require minimum 5m/1h volume thresholds already used in scanner — **no trade if missing** |
| Thin pools | **Reject** — avoid low depth at entry size |
| Extremely new pools | **Reject unless explicitly reviewed** for micro-live |
| Unreliable price data | **Reject** — includes NEEDS_REVIEW-style anomalies |
| Missing/unstable quote route | **Reject** |
| Wide spread | **Reject** if spread implies execution edge destroyed |

Existing pipeline dry-run simulation is **observation only** today — not a live slippage guarantee.

---

## 7. Execution safety controls

Required **before** first micro-live submit (future gates — **not implemented in R8**):

| Control | Requirement |
|---------|-------------|
| Paper vs dry-run comparison | Required for each candidate class before live |
| Transaction simulation | Required before real submit when supported |
| Duplicate transaction prevention | Required |
| Failed transaction handling | Document outcome; no silent retry loops |
| Partial failure handling | Halt + reconcile; no orphan state |
| Position write confirmation | Atomic write verified (R4 store) before treating position open |
| Exit confirmation | On-chain / ledger confirmation before marking closed |
| Emergency stop | Visible, tested, documented |
| Autonomous recovery | **Forbidden during first micro-live** |
| Executor recovery | **Forbidden during first micro-live** |

R5 singleton lock must show **active** with PID match at session start.

---

## 8. Operator controls

First micro-live phase requires **supervised human operation**:

| Control | Requirement |
|---------|-------------|
| Session supervision | Operator present for entire live session |
| Session start | Typed/ documented confirmation — not dashboard auto-arm |
| Session end | Explicit end checklist; verify no open live positions |
| Wallet balance | Verify before start; verify after end |
| Token approvals | Confirm no unexpected approvals/permissions |
| Bot posture | Verify `PIPELINE_DRY_RUN` until deliberate, approved transition — **R8 does not authorize transition** |
| Candidate review | Operator reviews **every** live candidate in first phase if manual approval required |
| Daily review | Required — compare live vs paper |

---

## 9. Required blockers before micro-live

All must be cleared before **considering** arming — **none are cleared today**:

| # | Blocker |
|---|---------|
| B1 | **R7b sample thresholds not met** |
| B2 | **R8 defines controls only** — not armed in config |
| B3 | **Wallet / signer review not complete** (R9) |
| B4 | **Live execution path review not complete** |
| B5 | **Emergency stop live drill not complete** |
| B6 | **Live readiness checklist not complete** |
| B7 | **Explicit human approval not given** |
| B8 | **Micro-live config not created** (separate from this doc) |
| B9 | **`liveArmed` still false** (required until deliberate approved arming) |
| B10 | **Dedicated RPC** not provisioned (A4) |
| B11 | **R7 edge evidence insufficient** at time of R7 review |

---

## 10. Recommended next gate

1. **Continue R7b data collection** — `node r7b_daily_summary.js` daily  
2. When R7b thresholds met, **re-assess** with `node r8_risk_controls_check.js`  
3. **Proceed to R9 Wallet / Signer Security Review** — only after R7b + R8 readiness signals; **do not arm live trading**  
4. **Do not** set `liveArmed: true`, `dryRunMode: false`, or `executionMode: LIVE`

---

## 11. Future Micro-Live Research Policy — Draft Only

This section is a **draft policy** for a **future** phase. It is **not active** and **not approval** to trade.

Research funds are **risk capital**. **Total loss is possible** and should be assumed during micro-live validation.

Micro-live exists to validate **safe transaction lifecycle** (discover → simulate → submit → confirm → exit → audit) — **not** profit maximization.

**First goal:** prove controlled execution under caps — **not** income.

| Principle | Policy |
|-----------|--------|
| Purpose | Execution validation under risk caps |
| Profit expectation | **None required** for phase success |
| Auto-compounding | **Forbidden** |
| Open positions | **One maximum** initially |
| Stop conditions | Strict — §5 limits apply |
| Daily review | Required — paper vs live comparison |
| Scaling | **Forbidden** until separate approved review |
| Session type | **Supervised only** |
| Failure | Halt, document, manual review — no revenge trading |

Passing R8 **does not** approve micro-live. Passing R7b **does not** approve micro-live. Operator research-fund willingness **does not** approve micro-live.

---

## 12. Verdict table

| Field | Value |
|-------|-------|
| **R8 verdict** | **RISK CONTROLS DEFINED BUT NOT ARMED** |
| **Live trading approved** | **NO** |
| **Micro-live approved** | **NO** |
| **Controls armed in config** | **NO** |
| **Recommended next gate** | Continue R7b → R9 Wallet/Signer Review (when ready) |
| **Status check** | `node r8_risk_controls_check.js` |

---

## 13. Footer

R6a proved stability.  
R7 proved insufficient fresh edge data.  
R7b collects strategy evidence.  
R8 defines risk boundaries — it does not arm them.  
Research funds are risk capital, not permission.  
Live trading remains disarmed.  
Humans authorize.  
Ori advises.  
Gates enforce.
