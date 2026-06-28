# R43E-1 — One Controlled Transaction Proof Harness (Simulation First)

**Status:** Simulation-only harness — **NOT live trading approval**  
**Scope:** One-transaction micro-live engineering proof only  
**Date:** 2026-06-23

## Purpose

R43E-1 builds an **isolated proof executor structure** for a future one tiny controlled transaction. This milestone runs in **`SIMULATION_ONLY`** mode: it validates gates, builds a safe proof intent, and writes audit output — **without submitting any real transaction**.

## Verdicts

| Verdict | Meaning |
|---------|---------|
| `R43E_SIMULATION_NOT_READY` | Blockers present or required CLI flags missing |
| `R43E_SIMULATION_READY` | Reserved — gates satisfied (internal); CLI success uses COMPLETED |
| `R43E_SIMULATION_COMPLETED` | Simulation harness completed — proof intent recorded, no transaction submitted |

**Forbidden verdicts:** `LIVE_APPROVED`, `READY_FOR_LIVE_TRADING`, `REAL_TRANSACTION_SUBMITTED`

## CLI

```bash
# Default — blocks (required flags missing)
node r43e_one_transaction_proof_harness.js

# Simulation run — requires all three flags
node r43e_one_transaction_proof_harness.js --simulate --human-present --confirm-one-transaction-proof
```

| Flag | Purpose |
|------|---------|
| `--simulate` | **Required.** Refused if missing. Enables simulation-only proof path |
| `--human-present` | Operator affirms physical presence — does not arm live trading |
| `--confirm-one-transaction-proof` | Operator confirms one-transaction engineering proof scope only |

Output: `analysis/r43e_one_transaction_proof_harness.json` only.

## Required gates

1. **R43D preflight** — `R43D_READY_FOR_ONE_TRANSACTION_PROOF` with `humanPresent`
2. **Caps** — R43B approved record with one-transaction limits
3. **Signer** — R43C guarded `local_real`; secret source optional in R43E-1 simulation
4. **RPC** — `DEDICATED_CANDIDATE`, redacted output only
5. **Runtime posture** — disarmed (`PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false`, `liveSubmission: DISARMED`)
6. **Proof intent** — safe simulation object only; no token selection, no quotes, no trades

## Proof intent (simulation)

Safe fields only:

- `proofId`, `createdAt`, `proofScope`, `simulationOnly: true`
- `maxTradeSizeSol: 0.01`, `stopAfterFirstTransaction: true`, `humanPresent: true`
- `liveTradingApproved: false`, `transactionSubmitted: false`
- `signature: null`, `targetToken: null`, `routeProvider: null`

## Hard boundaries

- No `sendTransaction` / `sendRawTransaction`
- No Jupiter execute/submit endpoints
- No integration with autonomous `live_executor` loop
- No global posture changes
- No repeated trading or auto-compounding
- No secrets printed or written to analysis

## Next step

After R43E-1 simulation passes: **`R43E-2 real transaction implementation review`** (not implemented in this milestone).

## Operator notes

- Run `node r43d_final_proof_preflight.js --human-present` first
- Ensure git working tree clean
- R7 remains `NOT ENOUGH DATA` — this is engineering proof only, not strategy validation
