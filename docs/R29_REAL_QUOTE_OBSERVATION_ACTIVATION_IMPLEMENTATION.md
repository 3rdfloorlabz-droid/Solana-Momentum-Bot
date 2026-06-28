# R29 — Real Quote Observation Activation Implementation

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **IMPLEMENTED** — observation-only; **trading still blocked**  
**Review date:** 2026-06-23  

**Approval record:** `operator_records/r29_quote_observation_approval.json`  
**Config example:** `examples/r29_real_quote_observation_config.example.json` (`active: false`)  
**Observer:** `node r29_real_quote_observer.js` (default **DISABLED**) · `node r29_real_quote_observer.js --observe-once` (gated)  

**Prerequisites:** [R28](./R28_MANUAL_QUOTE_OBSERVATION_DECISION_SESSION.md) · operator decision **APPROVE_OBSERVATION_ONLY**

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED**  
**Capital at risk:** **$0**

---

## 1. Executive verdict

### **REAL QUOTE OBSERVATION IMPLEMENTED — TRADING STILL BLOCKED**

R29 implements **observation-only** real quote polling when **explicitly invoked** with `--observe-once` and a valid operator approval record. It writes quote observations to `analysis/` only. It **does not trade**, **does not connect a wallet**, **does not sign**, **does not submit**, and **does not approve micro-live**.

Default command run exits **DISABLED** — no network calls.

---

## 2. Purpose

| Goal | Description |
|------|-------------|
| Gated observation | Real quote reads only when all runtime gates pass |
| Analysis output | Observations to `analysis/real_quote_observations.jsonl` |
| Fail closed | Default deny; no automatic polling loop |

R29 **does not** enable live trading, shadow execution with wallet, or position mutation.

---

## 3. Operator approval scope

| Field | Value |
|-------|-------|
| R28 decision | **APPROVE_OBSERVATION_ONLY** |
| Approved scope | Real quote observation / network quote polling only |
| **Not approved** | Trading · wallet · signing · submission · micro-live |

Approval record: `operator_records/r29_quote_observation_approval.json`

---

## 4. Runtime gates

Before polling, **all** must be true:

- Valid operator approval record (`APPROVE_OBSERVATION_ONLY`)
- Explicit `--observe-once` flag
- `executionMode: PIPELINE_DRY_RUN`
- `dryRunMode: true`
- `liveArmed: false`
- `emergencyStop: false`
- `recovery_actions.jsonl` absent
- `tradingAllowed`, `signingAllowed`, `submissionAllowed`, `walletRequired`: **false**
- Provider on allowlist
- Rate limits active
- No wallet/signer/submit/swap fields in config or approval

---

## 5. Provider scope

**Allowed**

- Quote/read-only provider calls (`jupiter_quote_readonly`)
- Fixture/replay fallback via mock injection in tests
- Provider output normalization to R18/R20/R29 observation format

**Forbidden**

- Swap transaction build
- Submit · sign · wallet request · private key request
- Transaction serialization

### R29a — Jupiter quote endpoint migration (2026-06-23)

| Item | Value |
|------|-------|
| Old failing host | `quote-api.jup.ag` (deprecated) |
| New default quote base | `https://lite-api.jup.ag/swap/v1` |
| Optional pro base | `https://api.jup.ag/swap/v1` (override only; no API keys in repo) |
| Quote path only | `/quote` → `https://lite-api.jup.ag/swap/v1/quote?...` |
| Endpoint policy | `QUOTE_ONLY` — pathname must end with `/quote` |
| Provider name | `jupiter_quote_readonly` (unchanged) |

Blocked paths: `/swap-instructions` · `/execute` · `/submit` · `/transaction`. **Trading remains blocked.** No signing · no submission · no wallet.

Status output includes: `providerBaseUrl` · `providerPath` · `endpointPolicy` · `networkPolling` (true only during `--observe-once`).

---

## 6. Output policy

Write **only**:

- `analysis/real_quote_observations.jsonl`
- `analysis/r29_real_quote_observation_status.json`

Every observation includes:

`approved: false` · `tradingAllowed: false` · `signingAllowed: false` · `submissionAllowed: false` · `walletRequired: false` · `networkPolling: true` · `provider` · `collectedAt` · `candidateId` · `inputMint` · `outputMint` · `inputAmount` · `quotedOutputAmount` · `minimumOutputAmount` · `slippageBps` · `priceImpactBps` · `routeSummary` · `quoteAgeSeconds` · `warnings` · `rejectionReasons` · `gateVerdict`

---

## 7. Rate limits

| Limit | Value |
|-------|-------|
| Max quotes / token / minute | 3 |
| Max tokens / cycle | 5 |
| Max quotes / day | 100 |
| Cooldown | 5 seconds |

Stop on provider error cluster · stop on rate-limit response · no retry storm · no infinite loop.

---

## 8. Stop conditions

Stop immediately if:

- `emergencyStop: true` · `liveArmed: true` · `dryRunMode: false`
- `executionMode` not `PIPELINE_DRY_RUN`
- `recovery_actions.jsonl` appears
- Safety suite failure (operator responsibility)
- Provider errors repeatedly · rate limits hit repeatedly
- Any wallet/signer/private-key prompt
- Any transaction construction/signing/submission path

---

## 9. Recommended next gate

| Path | Gate |
|------|------|
| After observation cycle | **R30** Real Quote Observation Results Review |
| If quote data clean | **R31** Shadow Execution Harness |
| Background | Continue **R7b** |

**Do not arm live. Do not connect wallet.**
