# R28 — Manual Quote Observation Decision Session

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **DEFINED ONLY** — operator decision **NOT APPROVED**  
**Review date:** 2026-06-28  

**Example decision:** `examples/r28_manual_quote_observation_decision.example.json` (`NOT_DECIDED` / `HOLD`)

**Helper:** `node r28_manual_quote_observation_decision_check.js` → `analysis/r28_manual_quote_observation_decision_status.json`

**Prerequisites:** [R26](./R26_REAL_QUOTE_OBSERVATION_ACTIVATION_REVIEW.md) · [R27](./R27_SHADOW_EXECUTION_DESIGN.md)

**Live trading:** **NOT APPROVED**  
**Network quote polling:** **NOT ACTIVATED**  
**Shadow execution:** **NOT ACTIVE**  
**Capital at risk:** **$0**

---

## 1. Executive verdict

### **MANUAL QUOTE OBSERVATION DECISION SESSION DEFINED — NOT APPROVED**

R28 defines the **human/operator checklist and decision record** required before real quote observation may be activated in a **later implementation gate**. This session **does not activate polling**, **does not trade**, **does not sign**, **does not submit**, and **does not connect a wallet**.

This verdict is **not** “ready for live trading.”

---

## 2. Purpose

| Goal | Description |
|------|-------------|
| Operator checkpoint | Human decision before any future quote polling activation |
| Explicit options | HOLD · APPROVE_OBSERVATION_ONLY · RETURN_TO_R7B · BLOCK |
| Fail closed | Default deny; no automatic activation |

R28 **does not** activate quote polling or shadow execution.

---

## 3. Decision options

| Option | Meaning |
|--------|---------|
| **HOLD** | Keep quote observation off (default) |
| **APPROVE_OBSERVATION_ONLY** | Allow future real quote polling in R29 — **not live trading** |
| **RETURN_TO_R7B** | Continue paper/data collection first |
| **BLOCK** | Stop real quote observation path due to risk |

**No option may approve live trading or micro-live.**

---

## 4. Required acknowledgements

Operator must acknowledge before any future `APPROVE_OBSERVATION_ONLY` review:

- Quote observation is not trading  
- Wallet is not connected  
- No signing · no submission · no private keys  
- Provider/API costs may occur later  
- Rate limits may occur later  
- Quote data may be stale or incomplete  
- Slippage/MEV risk remains unproven  
- Live trading remains not approved  
- Micro-live remains not approved  

---

## 5. Required pre-checks (before any future approval)

- Git clean · safety suite green · `recovery_actions.jsonl` absent  
- Posture dry-run/disarmed · `liveArmed: false` · `dryRunMode: true` · `emergencyStop: false`  
- Singleton healthy · no duplicate executor  
- R20–R27 complete · Ori updated  
- No wallet/signer/secrets  

---

## 6. Approval limits (future APPROVE_OBSERVATION_ONLY only)

- Network polling still requires **R29 activation implementation gate**  
- Max 3 quotes/token/min · 5 tokens/cycle · 100 quotes/day · 5s cooldown  
- Allowed providers must be explicit  
- Output analysis-only · no trading state mutation  
- `approved: false` on every quote record  

---

## 7. Stop conditions

Stop quote observation path if:

- `emergencyStop: true` · posture mismatch · `liveArmed: true` · `dryRunMode: false`  
- `recovery_actions.jsonl` appears · safety suite failure  
- Provider error cluster · rate limit cluster · cost concern  
- Route instability · slippage/impact risk cluster  
- Any wallet/signer/private-key prompt  
- Any transaction construction/signing/submission path  

---

## 8. Recommended next gate

| Decision | Next step |
|----------|-----------|
| **HOLD** | Continue R7b |
| **APPROVE_OBSERVATION_ONLY** | R29 Real Quote Observation Activation Implementation (observation-only) |
| **RETURN_TO_R7B** | More paper/data collection |
| **BLOCK** | Stop real quote observation path |

---

## 9. Footer

Session defined.  
Polling stays off.  
Execution stays off.  
Live remains blocked.
