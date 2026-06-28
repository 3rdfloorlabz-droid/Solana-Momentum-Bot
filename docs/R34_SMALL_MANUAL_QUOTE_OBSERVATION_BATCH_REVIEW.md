# R34 — Small Manual Quote Observation Batch Review

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **DEFINED** — manual batch review only  
**Review date:** 2026-06-23  

**Prerequisites:** [R33](./R33_CLEAN_QUOTE_OBSERVATION_REVIEW.md) · [R32](./R32_ADDITIONAL_OBSERVATION_BATCH_PLAN.md)

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED**  
**Continuous polling:** **NOT ACTIVATED**

---

## 1. Executive verdict

### **SMALL MANUAL QUOTE BATCH REVIEW DEFINED — OBSERVATION ONLY**

R34 defines and validates the next **manual-only** quote observation batch process. It does **not** activate continuous polling, trading, wallet connection, signing, or submission.

---

## 2. Purpose

- R34 defines the **manual batch process** for collecting up to **3 schema v2 quote observations**.
- It reviews **readiness** to run that batch when the operator chooses.
- It validates candidate files, batch rules, and existing observation counts.
- It does **not** approve trading, micro-live, wallet connection, signing, or submission.

---

## 3. Batch rules

| Rule | Value |
|------|-------|
| Max candidates | **3** (enabled only) |
| Trigger | Manual `--observe-once` only |
| Continuous loop | **Forbidden** |
| Scheduler / daemon | **Forbidden** |
| Unattended run | **Forbidden** |
| Default `requestedSlippageBps` | **100** |
| Max `requestedSlippageBps` | **200** |
| Output | Analysis-only (`analysis/real_quote_observations.jsonl`) |
| `approved` | Must remain **false** on every observation |
| `tradingAllowed` | Must remain **false** |
| `signingAllowed` | Must remain **false** |
| `submissionAllowed` | Must remain **false** |
| `walletRequired` | Must remain **false** |

---

## 4. Candidate requirements

Each candidate must:

- Be a **schema-valid** record in the batch JSON file
- Use **real public token mints** only
- Contain **no private wallet data** and **no secrets**
- Use `source: manual` (recorded as `candidateSource` in observations)
- Be allowed by the R29 approval record

**Allowed pairs:**

| Pair | Requirement |
|------|-------------|
| SOL-USDC | Allowed — verified public mints |
| SOL-USDT | Allowed only if mint is verified |
| One additional manual token | Allowed only if mint is verified and operator accepts observation risk |

**No random memecoin mints** unless mint is verified and operator explicitly accepts observation risk.

Example batch file: `examples/r34_manual_quote_batch_candidates.example.json`

---

## 5. Batch review criteria

After the operator runs the manual batch, review:

| Criterion | Action |
|-----------|--------|
| Schema v2 observations | Prefer **≥ 3 total** before shadow execution discussion |
| Pass / warn / reject counts | Summarize per batch and cumulative |
| Route stability | Compare `routeSummary` across observations |
| `priceImpactBps` | Review for spikes or anomalies |
| `quoteAgeSeconds` | Review for stale quotes |
| Provider errors | Review `providerHttpStatus` / error previews |
| Rate limits | Stop batch if rate-limit responses occur |
| Wallet / signing / submission flags | **Must not appear** |
| `approved: true` | **Must not appear** |

Legacy schema v1 records remain **historical context** and are **not counted** toward the 3-observation readiness threshold.

---

## 6. Stop conditions

Stop the batch immediately if any of the following occur:

- `emergencyStop: true`
- `liveArmed: true`
- `dryRunMode: false`
- `executionMode` is not `PIPELINE_DRY_RUN`
- `recovery_actions.jsonl` appears
- Provider error on a candidate
- Rate limit response
- Malformed quote response
- Any observation has `approved: true`
- Any `walletRequired`, `signingAllowed`, or `submissionAllowed` flag is true
- Any transaction construction, signing, or submission path appears

**No wallet · no signing · no submission · no continuous polling**

---

## 7. Recommended operator command

**Do not run automatically.** When the operator is ready:

```powershell
node r29_real_quote_observer.js --observe-once --candidates examples/r34_manual_quote_batch_candidates.example.json
```

Then run:

```powershell
node r34_manual_quote_batch_review.js
```

---

## 8. Recommended next gate

| Outcome | Next gate |
|---------|-----------|
| Batch produces **≥ 3 clean schema v2** observations | **R35 Quote Batch Results Review + Shadow Execution Readiness** |
| Batch fails (provider errors, rejections, invalid candidates) | **R34a Provider/Candidate Hardening Patch** |

Shadow execution remains **blocked** until at least **3 clean schema v2 observations** are collected manually with all safety flags held.

---

## 9. Background work

Continue **R7b** data collection in parallel.

---

## 10. No live trading approval

This gate **does not** approve live trading, micro-live, wallet connection, signing, or submission.

**Capital at risk remains $0.**  
**1 SOL remains operational liquidity, not active risk.**
