# R43E-2 — Real Transaction Implementation Review

**Status:** Isolated real-proof path — **NOT full live trading approval**  
**Scope:** One-transaction micro-live engineering proof only  
**Date:** 2026-06-23

## Purpose

R43E-2 implements the **reviewable real transaction path** for the isolated one-transaction proof harness. It can submit **exactly one** tiny controlled transaction **only** when the operator supplies every final execution flag and all preflight gates pass.

Default and simulation runs **never** broadcast.

## This is not full live trading

- `liveTradingApproved: false` always
- Global posture remains `PIPELINE_DRY_RUN` / `dryRunMode: true` / `liveArmed: false`
- No integration with autonomous `live_executor` loop
- No scanner auto-selection, no repeated trading, no auto-compounding
- R7 remains `NOT ENOUGH DATA` — engineering proof only

## Required final command

All four flags are required for broadcast attempt:

```bash
node r43e_one_transaction_proof_harness.js \
  --execute-real-proof \
  --human-present \
  --confirm-one-transaction-proof \
  --final-broadcast-confirmation
```

Without `--final-broadcast-confirmation`, gates may pass but verdict is `R43E_REAL_PROOF_READY_FOR_FINAL_COMMAND` — **no broadcast**.

## Simulation command (unchanged)

```bash
node r43e_one_transaction_proof_harness.js \
  --simulate \
  --human-present \
  --confirm-one-transaction-proof
```

Submits nothing. Verdict: `R43E_SIMULATION_COMPLETED`.

## Proof target configuration

Create a **local-only** gitignored file (never commit real sensitive targets):

`operator_records/r43e_real_proof_target.json`

Use `examples/r43e_real_proof_target.example.json` as template. Replace `PLACEHOLDER_TARGET_TOKEN_MINT` with your manually chosen mint locally — **do not paste keys or secrets into Cursor**.

Required fields:

- `configType: R43E_REAL_PROOF_TARGET`
- `purpose: one-transaction engineering proof only`
- `inputMint`, `outputMint` (no placeholders for real proof)
- `amountSol <= 0.01`
- `maxTradeSizeSol <= 0.01`
- `stopAfterFirstTransaction: true`
- `routeProvider: jupiter` (quote/swap transaction endpoints only)

## Signer secret configuration (local only)

Configure **outside Cursor** via one of:

- `TRACKTA_LOCAL_SIGNER_SECRET_JSON` — JSON 64-byte array at runtime
- `TRACKTA_LOCAL_SIGNER_KEYFILE` — path outside repo (e.g. `C:\TracktaOS\Secrets\`)

Real proof **requires** a signer secret source. Simulation does not.

## Preflight sequence

1. `node r43d_final_proof_preflight.js --human-present` → `R43D_READY_FOR_ONE_TRANSACTION_PROOF`
2. Simulation command → `R43E_SIMULATION_COMPLETED`
3. Configure proof target + signer locally
4. Run real proof command **only after operator review** — not during R43E-2 milestone tests

## Verify no secrets staged

```bash
git status --short
node secret_safety_scan.js
```

Ensure no `operator_records/r43e_real_proof_target.json` with real values is staged. Ensure `.gitignore` covers proof target files.

## Stop conditions

Immediately block if any of:

- Missing any required CLI flag
- R43D not ready or R43E simulation not completed
- Caps invalid or auto-compounding enabled
- RPC not `DEDICATED_CANDIDATE`
- Posture not disarmed
- `recovery_actions.jsonl` present
- Open live positions or duplicate executor
- Placeholder proof target mint
- `live_executor` signer integration detected
- Signer secret missing (real proof only)
- Second broadcast attempt in same run (`proofStoppedAfterFirstAttempt`)

## Audit output

`analysis/r43e_real_proof_review.json` — redacted metadata only; never secret material.

## Verdicts

| Verdict | Meaning |
|---------|---------|
| `R43E_REAL_PROOF_NOT_READY` | Prerequisites or flags missing |
| `R43E_REAL_PROOF_READY_FOR_FINAL_COMMAND` | Gates pass; awaiting `--final-broadcast-confirmation` |
| `R43E_REAL_PROOF_ATTEMPTED` | One broadcast attempt occurred (mock or real via deps) |
| `R43E_REAL_PROOF_BLOCKED` | Explicit safety block |

## Post-attempt requirement

If broadcast attempted → **`R43F post-transaction audit review`**

Otherwise → **`final execution command required`**

## Transaction path design

- Dedicated RPC only (redacted in output)
- Local signer via R43C guardrails only
- Explicit proof target config only
- Jupiter quote + swap **transaction** endpoints only (no execute shortcuts)
- Local sign → single `sendRawTransaction` via injectable `deps.sendRawTransaction` only after all flags
- No retry, no loop, max one attempt
