# R21 — Real Quote Observation Approval Gate

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **DEFINED ONLY** — real quote polling **NOT ACTIVE**  
**Review date:** 2026-06-28  

**Helper:** `node r21_real_quote_observation_approval_check.js` → `analysis/r21_real_quote_observation_approval_status.json` (read-only)

**Prerequisites:** [R18](./R18_SHADOW_QUOTE_DESIGN_REVIEW.md) · [R19](./R19_SHADOW_QUOTE_COLLECTION_PLAN.md) · [R20](./R20_FIXTURE_DRY_RUN_SHADOW_QUOTE_COLLECTOR.md)

**Example approval record:** `examples/r21_quote_observation_approval_record.example.json` (default **NOT_APPROVED**)

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED**  
**Network quote polling:** **NOT ACTIVATED**  
**Capital at risk:** **$0**

---

## 1. Executive verdict

### **REAL QUOTE OBSERVATION APPROVAL GATE DEFINED — POLLING NOT ACTIVE**

R21 defines the **explicit operator approval requirements** before any future **real quote observation** (network read-only polling) may be activated. This gate **does not activate polling**, **does not trade**, **does not sign**, **does not submit**, and **does not connect a wallet**.

This verdict is **not** “ready for live trading.”

---

## 2. Purpose

| Goal | Description |
|------|-------------|
| Approval gate | Define what operator must approve before real quote polling |
| Scope boundary | Quote observation only — no trading path |
| Activation blockers | Enumerate what must exist before any future collector build |

R21 **does not**:

- Activate network quote polling · trade · sign · submit · connect wallet · approve micro-live

---

## 3. Approval distinction

| Layer | Status | Notes |
|-------|--------|-------|
| **R20 fixture collector** | ✅ **Built** | Reads fixture candidates only; `networkPolling: false` |
| **Real quote observation** | ⬜ **Future** | Network read-only polling — requires R21 approval record + R22 collector |
| **Live trading** | 🔴 **NOT APPROVED** | Unchanged |
| **Micro-live** | 🔴 **NOT APPROVED** | Unchanged |
| **Wallet / signing / submission** | 🔴 **BLOCKED** | Quote observation must remain no-wallet, no-sign, no-submit |

---

## 4. Required operator approval record

Future operator draft (analysis-only, never commit secrets):

**Path:** `analysis/r21_quote_observation_approval_record.json`

| Field | Requirement |
|-------|-------------|
| `approvalId` | Unique id |
| `operatorName` | Operator identity |
| `approvedAt` | ISO timestamp when approved (null until approved) |
| `quoteObservationMode` | Must be `true` for quote-only scope |
| `networkPollingAllowed` | Must be `true` to permit future polling |
| `tradingAllowed` | Must be **`false`** |
| `signingAllowed` | Must be **`false`** |
| `submissionAllowed` | Must be **`false`** |
| `walletRequired` | Must be **`false`** |
| `maxQuotesPerTokenPerMinute` | Rate limit ack |
| `maxTokensPerCycle` | Cycle limit ack |
| `maxQuotesPerDay` | Daily cap ack |
| `cooldownSeconds` | Cooldown ack |
| `allowedProviders` | Provider allowlist |
| `allowedCandidateSources` | Candidate source allowlist |
| `stopConditionsAcknowledged` | Must be `true` before review |
| `noWalletAcknowledged` | Must be `true` |
| `noSigningAcknowledged` | Must be `true` |
| `noSubmissionAcknowledged` | Must be `true` |
| `rateLimitAcknowledged` | Must be `true` |
| `costAcknowledged` | Must be `true` |
| `operatorSignature` | Required for final approval (non-secret marker) |

**Default `approvalStatus`:** **`NOT_APPROVED`**

Example template: `examples/r21_quote_observation_approval_record.example.json`

---

## 5. Provider approval policy

| Provider | Scope | Active without approval? |
|----------|-------|--------------------------|
| Jupiter quote provider | Design-level read-only quotes | **NO** |
| GMGN quote-like provider | Future if supported | **NO** |
| Local fixture provider | R18/R20 fixtures | **YES** (fixture-only) |
| Replay provider | Recorded fixture replay | **NO** (until approved) |

No network provider may be activated without an explicit R21 approval record and R22 disabled-by-default collector.

---

## 6. Required safety checks before activation

Before any **future** real quote polling activation:

| Check | Required |
|-------|----------|
| Git status clean | Yes |
| Safety suite green | Yes |
| `recovery_actions.jsonl` absent | Yes |
| `executionMode` | `PIPELINE_DRY_RUN` |
| `dryRunMode` | `true` |
| `liveArmed` | `false` |
| `emergencyStop` | `false` |
| Singleton lock healthy | Yes |
| Exactly one executor loop | Yes |
| Dashboard posture matches CLI | Yes |
| R18 / R19 / R20 complete | Yes |
| R20 fixture collector passing | Yes |
| Quote observation approval record present | Yes |
| Network polling limits defined | Yes |
| Provider allowlist defined | Yes |
| Stop conditions acknowledged | Yes |
| Ori updated | Yes |

---

## 7. Quote observation limits

**Draft approval terms only — NOT active config.**

| Limit | Value |
|-------|-------|
| Max quotes per token per minute | **3** |
| Max tokens per cycle | **5** |
| Max quotes per day | **100** |
| Cooldown seconds | **5** |

Also required:

- No retry storm
- No route spam
- No infinite loop
- Stop on repeated provider errors
- Stop on rate-limit response
- Stop on posture mismatch

---

## 8. Stop conditions

Stop quote observation immediately if:

- `emergencyStop` becomes `true`
- `liveArmed` becomes `true` unexpectedly
- `dryRunMode` becomes `false` unexpectedly
- `executionMode` is not `PIPELINE_DRY_RUN`
- `recovery_actions.jsonl` appears
- Safety suite fails
- Duplicate executor loop detected
- Singleton lock mismatch
- Dashboard/CLI posture mismatch
- Provider errors repeat
- Rate limit encountered repeatedly
- Route instability cluster
- Slippage risk cluster
- Any wallet/signer/private-key prompt appears
- Any transaction construction/signing/submission path appears

---

## 9. Output policy

Future real quote observation may write **only** to analysis files:

- `analysis/real_quote_observations.jsonl`
- `analysis/r21_quote_observation_status.json`

Every record must include:

- `approved: false`
- `tradingAllowed: false`
- `signingAllowed: false`
- `submissionAllowed: false`
- `walletRequired: false`
- `networkPolling: true`
- `provider`
- `collectedAt`
- candidate source
- quote fields
- R18 evaluation verdict
- rejection/warning reasons

---

## 10. Security and privacy policy

| Rule | Policy |
|------|--------|
| Wallet | **Not needed** |
| Private key | **Not needed** |
| Signer | **Not needed** |
| Seed phrase | **Forbidden** |
| Token approvals | **Forbidden** |
| Transaction creation | **Forbidden** |
| Request bodies with secrets | **Forbidden** |
| Env secrets | Not required unless provider API key reviewed separately |
| Secret logging | **Forbidden** |

---

## 11. Required implementation blockers

Before real quote observation activation:

- [ ] Approval record not created (operator)
- [ ] Network provider not implemented
- [ ] Provider rate limits not tested
- [ ] No active stop switch for quote collector
- [ ] Real quote collector not built (R22)
- [ ] **R21 only defines gate** — no activation in this gate
- [ ] No operator approval yet

---

## 12. Recommended next gate

1. **R22 Real Quote Observation Collector** — disabled by default  
2. **Continue R7b** in background  
3. **Do not connect wallet**  
4. **Do not arm live**  
5. **Do not sign or submit**

---

## 13. Verdict table

| Field | Value |
|-------|-------|
| **R21 verdict** | **REAL QUOTE OBSERVATION APPROVAL GATE DEFINED — POLLING NOT ACTIVE** |
| **Quote polling active** | **NO** |
| **Status check** | `node r21_real_quote_observation_approval_check.js` |

---

## 14. Footer

Gate defined.  
Polling stays off.  
Wallet stays disconnected.  
Live remains blocked.
