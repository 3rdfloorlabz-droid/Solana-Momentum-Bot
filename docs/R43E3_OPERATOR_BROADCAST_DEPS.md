# R43E-3 — Operator Broadcast Dependency Adapter

**Status:** Operator-only broadcast deps — **NOT full live trading approval**  
**Scope:** One-transaction micro-live engineering proof only  
**Date:** 2026-06-23

## Why R43E-2 blocked

R43E-2 implemented the reviewable real proof path with injectable dependencies. The default dependency factory throws:

`real proof deps blocked — inject deps for tests or operator execution`

That is intentional: R43E-2 is a **dependency safety wall**. No real quote, sign, or broadcast could occur without explicit operator wiring.

## What R43E-3 adds

`r43e_operator_broadcast_deps.js` exports `createOperatorBroadcastDeps(options)`.

When **all** gates pass and `allowOperatorBroadcastDeps === true`, the harness receives real operator deps that can:

1. Read explicit proof target from `operator_records/r43e_real_proof_target.json`
2. Fetch Jupiter quote (lite `/quote` only)
3. Build unsigned swap transaction (lite `/swap` POST only — never `/execute` or `/submit`)
4. Load guarded local signer (R43C)
5. Sign VersionedTransaction locally (`@solana/web3.js`)
6. Broadcast once via dedicated RPC (`sendRawTransaction`, `maxRetries: 0`)
7. Stop immediately — no retry, no loop

If gates fail, deps remain blocked with `R43E_OPERATOR_DEPS_BLOCKED`.

If build/sign fails before broadcast: verdict `R43E_REAL_PROOF_FAILED_BEFORE_BROADCAST`.

## This is not full live trading

- `liveTradingApproved: false` always
- Global posture stays `PIPELINE_DRY_RUN` / `dryRunMode: true` / `liveArmed: false`
- No `live_executor.js` integration
- No scanner auto-selection
- R7 remains `NOT ENOUGH DATA`

## Required final command

```bash
node r43e_one_transaction_proof_harness.js \
  --execute-real-proof \
  --human-present \
  --confirm-one-transaction-proof \
  --final-broadcast-confirmation
```

Without `--final-broadcast-confirmation`: **no broadcast** (verdict `R43E_REAL_PROOF_READY_FOR_FINAL_COMMAND` when other gates pass).

## Stop-after-first-attempt rule

- Exactly one broadcast attempt per invocation
- No automatic retry on failure
- `proofStoppedAfterFirstAttempt: true` in audit output
- Second attempt throws `R43E_PROOF_STOPPED`

## Signer secret configuration

Configure locally (never commit, never paste into Cursor):

- `TRACKTA_LOCAL_SIGNER_KEYFILE` → e.g. `C:\TracktaOS\Secrets\r43e-proof-wallet.json`
- or `TRACKTA_LOCAL_SIGNER_SECRET_JSON` (64-byte JSON array)

See [R43C_REAL_LOCAL_SIGNER_GUARDRAILS.md](./R43C_REAL_LOCAL_SIGNER_GUARDRAILS.md).

## Proof target configuration

Copy [examples/r43e_real_proof_target.example.json](../examples/r43e_real_proof_target.example.json) to gitignored:

`operator_records/r43e_real_proof_target.json`

Replace placeholder `outputMint` with explicit target. Do not use scanner candidates.

## Audit output

`analysis/r43e_real_proof_review.json` includes:

- `r43eRealProofVerdict`
- `operatorBroadcastDepsEnabled`
- `transactionSubmitted` (true only if `sendRawTransaction` was called)
- `signature` (from RPC response only)
- `broadcastAttemptedAt` / `broadcastError`
- `signerPublicKey` (public key only)
- redacted RPC metadata
- `liveTradingApproved: false`

## R43F required after any attempted broadcast

If `transactionSubmitted: true` or broadcast was attempted, next step is:

**R43F post-transaction audit review**

Do not treat a successful engineering proof as strategy approval or full live trading approval.

## Verdicts (real proof path)

| Verdict | Meaning |
|---------|---------|
| `R43E_REAL_PROOF_BLOCKED` | Safety gate or operator deps blocked |
| `R43E_REAL_PROOF_READY_FOR_FINAL_COMMAND` | Gates pass; awaiting `--final-broadcast-confirmation` |
| `R43E_REAL_PROOF_ATTEMPTED` | Broadcast path invoked |
| `R43E_REAL_PROOF_FAILED_BEFORE_BROADCAST` | Quote/build/sign failed before RPC send |

Forbidden: `LIVE_APPROVED`, `READY_FOR_LIVE_TRADING`, `STRATEGY_APPROVED`, `AUTONOMOUS_TRADING_ENABLED`.
