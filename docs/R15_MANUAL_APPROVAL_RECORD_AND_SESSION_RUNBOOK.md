# R15 — Manual Approval Record / Session Runbook

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **DEFINED ONLY** — **LIVE STILL BLOCKED**  
**Review date:** 2026-06-28  

**Helper:** `node r15_manual_approval_check.js` → `analysis/r15_manual_approval_status.json` (read-only)

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED**  
**Capital at risk:** **$0**

---

## 1. Executive verdict

### **MANUAL APPROVAL RUNBOOK DEFINED — LIVE STILL BLOCKED**

R15 creates the **written approval record** and **session runbook** — the final human-control documentation layer before any future micro-live exception could even be **reviewed**. It **does not approve live trading**. It **does not arm** the bot. It **does not connect** a wallet. It **does not create** live config.

This verdict is **not** “ready for live trading.”

---

## 2. Purpose

| Goal | Description |
|------|-------------|
| Human control | Require explicit written approval before any future arming review |
| Prevent rushed activation | Block emotional or impulsive live enablement |
| Session discipline | Define pre-session, per-trade, and post-trade steps |
| Audit trail | Record operator decisions without credentials |

R15 **does not**:

- Approve live trading  
- Arm live trading  
- Connect a wallet  
- Create or modify `live_config.json`  
- Create active micro-live config  

---

## 3. Manual approval record template

> **Default status: NOT APPROVED.** Copy this template to a secure operator-controlled location. Optional machine-readable draft: `analysis/r15_manual_approval_record.json` (gitignored — **never commit real records**).

| Field | Value |
|-------|-------|
| **Approval ID** | *(unique identifier)* |
| **Operator name** | |
| **Date/time** | |
| **Session start time** | |
| **Session end time** | |
| **Research wallet public address** | |
| **Total wallet balance** | |
| **Authorized session allocation** | |
| **Max first trade size** | |
| **Max session loss** | |
| **Max daily loss** | |
| **Max weekly loss** | |
| **Max open positions** | |
| **Max trades this session** | |
| **Max trades per day** | |
| **Per-trade approval required** | yes / no *(first phase: **yes**)* |
| **R7b bypass risk acknowledged** | yes / no |
| **Total loss risk acknowledged** | yes / no |
| **Slippage cap acknowledged** | yes / no |
| **MEV protection plan acknowledged** | yes / no |
| **Emergency stop policy acknowledged** | yes / no |
| **No auto-compounding acknowledged** | yes / no |
| **No averaging down acknowledged** | yes / no |
| **No unattended execution acknowledged** | yes / no |
| **Live trading not for income acknowledged** | yes / no |
| **Operator signature line** | _________________________ |
| **Final approval status** | *(see §10 — default **NOT APPROVED**)* |

---

## 4. Proposed micro-live terms (draft only — NOT active config)

| Term | Proposed value |
|------|----------------|
| Wallet liquidity | May contain **1 SOL** as operational liquidity — **not active risk** |
| Authorized session allocation | **0.05 SOL max** unless later explicitly changed in signed record |
| First trade | **0.005–0.01 SOL** |
| Max open positions | **1** |
| Max first session trades | **1**, then review |
| Max trades/day after review | **3** |
| Stop after consecutive losses | **2** |
| Session drawdown stop | **0.03 SOL** or less |
| Auto-compounding | **Forbidden** |
| Scaling | **Forbidden** |
| Averaging down | **Forbidden** |
| Unattended session | **Forbidden** |

**These are not written to `live_config.json`.**

---

## 5. Pre-session runbook

Complete **all** steps before any future arming review:

| # | Step | Pass? |
|---|------|-------|
| 1 | Confirm repo clean (`git status`) | ☐ |
| 2 | Run safety suite (`node run_safety_tests.js`) — **green** | ☐ |
| 3 | Confirm `recovery_actions.jsonl` **absent** | ☐ |
| 4 | Confirm CLI posture (`node live_executor.js --status`) | ☐ |
| 5 | Confirm dashboard posture matches CLI | ☐ |
| 6 | Confirm singleton lock healthy | ☐ |
| 7 | Confirm exactly **one** executor loop | ☐ |
| 8 | Confirm `emergencyStop` **false** | ☐ |
| 9 | Confirm `liveArmed` **false** before any intentional approval | ☐ |
| 10 | Confirm `dryRunMode` **true** before any intentional approval | ☐ |
| 11 | Confirm `executionMode` **PIPELINE_DRY_RUN** before any intentional approval | ☐ |
| 12 | Confirm **R12 / R13 / R14** docs reviewed | ☐ |
| 13 | Confirm wallet balance and **authorized allocation** (not full wallet) | ☐ |
| 14 | Confirm no excess wallet assets if applicable | ☐ |
| 15 | Confirm signer secret handling policy (no exposure) | ☐ |
| 16 | Confirm slippage policy (R14) | ☐ |
| 17 | Confirm MEV protection policy (R14) | ☐ |
| 18 | Confirm operator **present** | ☐ |
| 19 | Confirm manual stop plan known | ☐ |
| 20 | Confirm approval record **completed** (§3) | ☐ |

---

## 6. Per-trade approval runbook (first phase: required)

| Field | Record |
|-------|--------|
| Token / pair | |
| Intended input amount | |
| Quote timestamp | |
| Quote age | |
| Expected output | |
| Minimum output | |
| Slippage cap | |
| Price impact | |
| Priority fee | |
| MEV protection route | |
| Liquidity check | pass / fail |
| Route stability check | pass / fail |
| Wallet monitor freshness | |
| Emergency stop check | clear / blocked |
| Operator approval timestamp | |
| **Proceed / reject decision** | |

**Reject** if quote stale, slippage too high, route unstable, or operator not present.

---

## 7. Post-trade review runbook

| Field | Record |
|-------|--------|
| Transaction ID *(if submitted in future)* | |
| Confirmation status | |
| Actual output | |
| Realized slippage | |
| Fee paid | |
| Priority fee paid | |
| MEV protection used | yes / no |
| Position write confirmed | yes / no |
| Exit plan recorded | |
| Abnormalities | |
| **Continue / stop decision** | |
| Ori Posture Log update | ☐ |
| Repo docs update if needed | ☐ |

Compare live result to quoted / paper expectation before any continuation.

---

## 8. Session stop conditions

Stop **immediately** if any:

- `emergencyStop` **true**
- Realized slippage above **halt threshold** (R14: 200 bps)
- Quote route **unstable**
- Transaction fails **repeatedly**
- **Abnormal confirmation**
- Position write **mismatch**
- Wallet monitor **stale**
- Singleton **mismatch**
- **Duplicate** executor loop
- Safety suite **fails**
- `recovery_actions.jsonl` appears **unexpectedly**
- **Loss cap** reached
- **2 consecutive losses**
- Operator **absent**
- Dashboard / CLI **posture mismatch**
- **Emotional override pressure** appears

---

## 9. R7b research exception section

| Fact | Policy |
|------|--------|
| Ordinary path | Requires **R7b thresholds met** |
| Live samples before R7b | **High-risk research exception** only |
| Exception requirement | Explicit **R7b bypass acknowledgment** in approval record |
| Exception allocation | **Tiny only** (≤ 0.05 SOL session cap proposed) |
| Exception purpose | **Not strategy proof** — execution validation / data collection |
| After every trade | **Mandatory review** |
| Operator authority | May **stop at any time** |

Exception path **does not** auto-approve live. R15 record + R13 gate + implementation review still required.

---

## 10. Approval status rules

| Status | Meaning |
|--------|---------|
| **NOT APPROVED** | **Default.** No arming, no wallet connection, no live config. |
| **APPROVED FOR FINAL REVIEW ONLY** | Checklist and record ready for human final review — **still no live arming** |
| **APPROVED FOR ONE MICRO-LIVE SESSION ONLY** | Future status — still requires **separate explicit operator confirmation** and **approved implementation path** before any arming |

**This document does not set approval to live.**  
`r15_manual_approval_check.js` **never auto-approves** — `approved` is always **false**.

---

## 11. Recommended next gate

1. **Continue R7b** data collection where possible  
2. Use **R15 approval record** if operator chooses research-exception path  
3. **Build R16 Micro-Live Implementation Gap Review** next  
4. **Do not arm live** yet  
5. **Do not connect real wallet** through bot yet  

---

## 12. Verdict table

| Field | Value |
|-------|-------|
| **R15 verdict** | **MANUAL APPROVAL RUNBOOK DEFINED — LIVE STILL BLOCKED** |
| **Default approval status** | **NOT APPROVED** |
| **Live trading approved** | **NO** |
| **Micro-live approved** | **NO** |
| **Status check** | `node r15_manual_approval_check.js` |

---

## 13. Footer

Humans authorize.  
Documents guide.  
Gates enforce.  
Live trading remains blocked.
