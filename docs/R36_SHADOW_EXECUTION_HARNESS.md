# R36 — Shadow Execution Harness

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **BUILT** — simulation only  
**Review date:** 2026-06-23  

**Prerequisites:** [R35](./R35_QUOTE_BATCH_RESULTS_AND_SHADOW_READINESS.md)

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED**  
**Real execution:** **NOT ACTIVATED**  
**Shadow execution (real):** **NOT ACTIVATED**

---

## 1. Executive verdict

### **SHADOW EXECUTION HARNESS BUILT — SIMULATION ONLY**

R36 converts schema v2 quote observations into simulated `WOULD_ENTER` / `SKIP` decisions. It does **not** trade, connect a wallet, sign, submit, or mutate real trading state.

---

## 2. Purpose

- R36 reads quote observations and produces **simulated trade decisions**.
- Decisions are **analysis-only** — no execution path is activated.
- It does **not** trade, connect a wallet, sign, submit, or write real positions.

---

## 3. Input requirements

Harness reads `analysis/real_quote_observations.jsonl` and processes only records that meet all of:

| Requirement | Value |
|-------------|-------|
| Schema | **v2 only** (legacy v1 ignored) |
| `gateVerdict` | **PASS** or **WARN** |
| `approved` | **false** |
| `tradingAllowed` | **false** |
| `signingAllowed` | **false** |
| `submissionAllowed` | **false** |
| `walletRequired` | **false** |
| `realizedSlippageBps` | **null** |
| `requestedSlippageBps` | **must exist** |

Records with invalid safety flags **block** the harness run.  
Records with `gateVerdict: REJECT` are **not eligible** (counted as blocked, not simulated).

---

## 4. Shadow decision logic

Conservative simulation rules:

### WOULD_ENTER only if

- `observationSchemaVersion` is 2
- `gateVerdict` is **PASS**
- `routeQualityVerdict` is **PASS**
- `quoteRequestVerdict` is **PASS**
- `requestedSlippageBps` ≤ **100**
- `priceImpactBps` ≤ **100**
- `quoteAgeSeconds` ≤ **10**
- `rejectionReasons` empty
- `approved` false
- trading / signing / submission / wallet flags false

### SKIP if

- `gateVerdict` is **WARN** or **REJECT**
- missing required fields
- `priceImpactBps` > **100**
- `requestedSlippageBps` > **100**
- `quoteAgeSeconds` > **10**
- route quality not **PASS**
- quote request not **PASS**
- any safety flag invalid
- `rejectionReasons` present

---

## 5. Output files

Writes **analysis only**:

| File | Purpose |
|------|---------|
| `analysis/shadow_execution_decisions.jsonl` | Simulated decision log |
| `analysis/r36_shadow_execution_status.json` | Harness status summary |

Each decision record includes:

- `schemaVersion`, `generatedAt`, `sourceMode: "SHADOW_SIMULATION_ONLY"`
- `approved: false`, `tradingAllowed: false`, `signingAllowed: false`, `submissionAllowed: false`, `walletRequired: false`
- `realExecution: false`, `transactionConstructed: false`, `transactionSigned: false`, `transactionSubmitted: false`, `positionMutated: false`
- `candidateId`, `provider`, `routeSummary`, `requestedSlippageBps`, `realizedSlippageBps: null`
- `priceImpactBps`, `quoteAgeSeconds`
- `simulatedAction`: `WOULD_ENTER` or `SKIP`
- `simulatedReason`, `sourceObservationId`, `riskFlags`

---

## 6. Status summary

`analysis/r36_shadow_execution_status.json` includes:

- `status`, `decisionCount`, `wouldEnterCount`, `skipCount`, `blockedCount`
- `approved: false`, `capitalAtRiskUsd: 0`
- `shadowExecutionActivated: false`, `realExecution: false`
- trading / signing / submission / wallet flags **false**

**Allowed statuses:** `SHADOW_DECISIONS_GENERATED`, `NO_ELIGIBLE_OBSERVATIONS`, `BLOCKED`, `INVALID_OBSERVATION_RECORD` — never approved.

---

## 7. Remaining blockers

Before any signer / private-key work:

- Shadow decisions must be **reviewed** (R37)
- No real execution should be active
- **R7b** edge validation still not complete
- Wallet / signing / submission still blocked
- Final live trading approval not granted

---

## 8. Recommended next gate

### **R37 Shadow Execution Results Review + Research Wallet Setup Readiness**

R37 should review shadow decisions and decide whether the project can begin the **research-wallet / private-key setup design track** (design only — no key handling in R37).

---

## 9. No live trading approval

This harness **does not** approve live trading, micro-live, real shadow execution, wallet connection, signing, or submission.

Capital at risk remains **$0**.

**Run:**

```powershell
node r36_shadow_execution_harness.js
```
