# R19 — Shadow Quote Collection Plan

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **DEFINED ONLY** — collection **NOT ACTIVE**  
**Review date:** 2026-06-28  

**Helper:** `node r19_shadow_quote_collection_check.js` → `analysis/r19_shadow_quote_collection_status.json` (read-only)

**Prerequisite:** [R18 Shadow-Quote Design Review](./R18_SHADOW_QUOTE_DESIGN_REVIEW.md)

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED**  
**Network quote polling:** **NOT ACTIVATED**  
**Capital at risk:** **$0**

---

## 1. Executive verdict

### **SHADOW QUOTE COLLECTION PLAN DEFINED — NOT ACTIVE**

R19 defines how **real quote observations** could be collected later **without** signing, submitting, connecting a wallet, or changing posture. **No live quote polling is activated** by this gate.

This verdict is **not** “ready for live trading.”

---

## 2. Purpose

| Goal | Description |
|------|-------------|
| Collection plan | Define future real quote observation workflow |
| Safety boundaries | Quote-only scope with hard kill conditions |
| Activation gate | Explicit operator approval required before any polling |

R19 **does not**:

- Collect live quotes yet · sign · submit · connect wallet · approve micro-live  

---

## 3. Collection scope (future — when explicitly approved)

| Allowed | Forbidden |
|---------|-----------|
| Quote observation only | Signing |
| Analysis output writes | Submission |
| Read-only candidate sources | Transaction construction for live submit |
| R18 evaluation on each record | Wallet requirement |
| | Private key handling |
| | Position creation |
| | Trading state mutation |
| | `live_config.json` mutation |

---

## 4. Candidate source

Future quote candidates may come from:

| Source | Notes |
|--------|-------|
| Scanner candidates | Read-only handoff metadata |
| Paper trade candidates | Closed/open paper intents |
| Thesis-matched observations | Observation pool only |
| Manually supplied token/pair list | Operator-controlled, no secrets |
| Fixture replay | R20 dry-run collector |

**Requirement:** Any future **real quote polling** must receive **explicit operator approval** before activation (R21 gate).

---

## 5. Quote provider design (not activated)

| Provider | Status |
|----------|--------|
| Jupiter quote endpoint | Design-level — **not activated** |
| Route provider abstraction | Design-level |
| Fake fixture provider | R18/R20 — safe now |
| Local replay provider | R20 candidate |

**No live provider activation in R19.**

---

## 6. Collection limits (future)

| Limit | Draft value |
|-------|-------------|
| Max quotes per token per minute | **3** |
| Max tokens per cycle | **5** |
| Max total quotes per day | **100** |
| Cooldown between quotes | **≥ 5 s** per token |
| Retry storm | **Forbidden** |
| Route spam | **Forbidden** |

**No collection when:**

- Posture unsafe · `emergencyStop: true` · duplicate executor loop · singleton unhealthy

---

## 7. Required fields (future collected records)

Each observation record should include:

- `collectedAt` · token/pair · input/output mint · input amount  
- Quoted output · minimum output · slippage bps · price impact bps  
- Route provider · route summary · route hash · quote age  
- Priority fee estimate · liquidity · volume (if available)  
- Source candidate id · gate verdict · rejection reasons  
- **`approved: false`**

---

## 8. Safety checks before collection (future)

Before any future shadow quote collection session:

| # | Check |
|---|-------|
| 1 | Git status clean |
| 2 | Safety suite **green** |
| 3 | `recovery_actions.jsonl` **absent** |
| 4 | Posture dry-run / disarmed |
| 5 | `emergencyStop` **false** |
| 6 | Singleton lock healthy |
| 7 | Exactly **one** executor loop |
| 8 | R18 harness passing on fixtures |
| 9 | **No** wallet/signer connected |
| 10 | Operator **explicitly approves** quote observation mode |

---

## 9. Evaluation policy

Apply **R18 rules** to each collected quote:

- Slippage pass / warn / reject  
- Price impact warn / reject  
- Quote freshness · route instability · priority fee ratio  
- Reject: missing minimum output · stale quote · secret-like fields  

---

## 10. Output design (future — analysis only)

| File | Purpose |
|------|---------|
| `analysis/shadow_quote_observations.jsonl` | Append-only observation log (gitignored) |
| `analysis/r19_shadow_quote_collection_status.json` | Collection session summary (gitignored) |

Both are **analysis-only** — never runtime config.

---

## 11. Stop conditions

Stop future collection immediately if:

- `emergencyStop: true` · posture mismatch · `liveArmed: true` unexpectedly  
- `dryRunMode: false` unexpectedly · `executionMode` ≠ `PIPELINE_DRY_RUN`  
- `recovery_actions.jsonl` appears · safety suite fails  
- Quote provider errors repeatedly · rate limit issues  
- Route instability cluster · priority fees spike  
- Observed slippage risk exceeds threshold  
- Any signer / private-key prompt appears  

---

## 12. Future activation requirements

Before **real quote polling** may be activated:

1. R19 plan reviewed  
2. **Explicit operator approval** recorded  
3. Collector must be **analysis-only** (tests prove no submit/sign path)  
4. **No wallet dependency** · **no secret dependency**  
5. Hard kill switch · rate limits enforced  
6. Ori update · safety suite green  
7. **R21 Real Quote Observation Approval Gate** complete  

---

## 13. Recommended next gate

1. **Build R20 Fixture + Dry-Run Shadow Quote Collector** (no network)  
2. **Build R21 Real Quote Observation Approval Gate**  
3. **Continue R7b** in background  
4. **Do not connect wallet** · **Do not arm live**  

---

## 14. Verdict table

| Field | Value |
|-------|-------|
| **R19 verdict** | **SHADOW QUOTE COLLECTION PLAN DEFINED — NOT ACTIVE** |
| **Quote polling active** | **NO** |
| **Live trading approved** | **NO** |
| **Status check** | `node r19_shadow_quote_collection_check.js` |

---

## 15. Footer

Plan defined.  
Collection inactive.  
Polling requires future approval.  
Live remains blocked.
