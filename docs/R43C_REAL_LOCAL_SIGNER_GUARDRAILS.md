# R43C — Real Local Signer Implementation Under Guardrails

**Status:** Guarded implementation only — **NOT live trading approval**  
**Scope:** One-transaction micro-live engineering proof only  
**Date:** 2026-06-23

## Purpose

R43C implements a **real local signer module** that can exist safely behind guardrails. It proves:

- Signer loading from approved local-only sources
- Secret redaction in audit metadata
- Guard enforcement (caps, posture, RPC, human presence)
- Safe audit metadata output to `analysis/` only

R43C does **not** integrate the signer into `live_executor.js` and does **not** submit transactions.

## Scope

| In scope | Out of scope |
|----------|--------------|
| Guarded `local_real` provider mode | Live trading approval |
| Load secret from approved env/file sources | Executor integration |
| Return public key only in safe metadata | Transaction submission |
| Isolated proof-only signing in tests/helpers | Jupiter swap/submit endpoints |
| Readiness checker + safety tests | Strategy-profit validation |
| Documentation and guard registry updates | Repeated/autonomous trading |

## Allowed key sources

### Primary: `TRACKTA_LOCAL_SIGNER_SECRET_JSON`

- Local-only secret value at runtime
- JSON array of 64 bytes (standard Solana secret key format)
- Never committed, never printed, never written to `analysis/`

### Alternative: `TRACKTA_LOCAL_SIGNER_KEYFILE`

- Path to a local secret file **outside the repo** (preferred: `C:\TracktaOS\Secrets\`)
- File contents: JSON array of 64 bytes
- Repo-relative paths are **rejected** unless explicitly under gitignored `operator_records/` (excluding caps/example files)

### Test fixtures only

- Temp directories with **fake** key material
- `testFixtureSecret: true` with generated or injected fake bytes
- Never used in production paths

## Forbidden key sources

- Private keys pasted into Cursor or chat
- Keys committed to the repository
- Keys in `.env` committed to git
- Inline `privateKey`, `secretKey`, `seedPhrase`, `mnemonic` fields
- Repo-relative paths outside approved `operator_records/` secret paths
- Hardware wallets (not implemented)
- Generic `real` provider (blocked)
- Any source when guard context fails

## Redaction policy

All secret-derived metadata is redacted before exposure:

- Source paths → basename only or `[REDACTED]`
- Env values → never logged; env **variable name** only
- Audit events → `mockSigner.redactValue()` on all detail fields
- Safe audit output exposes: `publicKey`, `providerType`, `sourceType`, `loadedAt`, redacted source metadata
- `privateKeysHandled: true` indicates internal handling only — **never** includes raw material
- Forbidden in output: private key, seed phrase, raw byte array, base58 secret, file contents

## Proof-only approval boundaries

Real local signer (`providerMode: local_real`) requires **all** of:

| Guard | Requirement |
|-------|-------------|
| Explicit opt-in | `allowRealLocalSigner: true` |
| Caps | R43B-approved record with exact scope text |
| Trade size | `maxTradeSizeSol <= 0.01` |
| Session | `maxTradesPerSession === 1` |
| Stop rule | `stopAfterFirstTransaction: true` |
| Compounding | `autoCompoundingAllowed: false` |
| Human | `humanPresent: true` |
| Posture | `executionMode: PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false` |
| Recovery | `recovery_actions.jsonl` absent |
| RPC | `DEDICATED_CANDIDATE` (not public fallback) |
| Integration | No `live_executor.js` signer integration |
| Submission | No `submit` / `requestSubmission` context |

**Verdicts used in R43C:**

- `R43C_SIGNER_NOT_READY`
- `R43C_SIGNER_READY_FOR_FINAL_PROOF_PREFLIGHT`

**Forbidden verdicts:**

- `LIVE_APPROVED`
- `READY_FOR_LIVE_TRADING`

## No executor integration

- `live_executor.js` must **not** `require('./local_signer')`
- `loadSignerFromApprovedSource` must **not** appear in executor
- R43C readiness checker verifies this on every run

## No transaction submission

Blocked explicitly:

- `context.submit === true`
- `context.requestSubmission === true`
- `unsignedTransaction.submit === true`
- No `sendTransaction` / `sendRawTransaction` in `local_signer.js`
- No Jupiter swap/transaction/submit endpoint calls
- `networkSubmit: false` in all audit metadata

## Stop conditions

Immediately block real signer if any of:

1. `recovery_actions.jsonl` appears
2. Posture leaves disarmed state (`liveArmed`, `dryRunMode: false`, `executionMode: LIVE`)
3. RPC is not `DEDICATED_CANDIDATE`
4. Caps approval invalid or scope mismatch
5. Repeated/autonomous trading context detected
6. Executor integration detected
7. Submission requested
8. Secret-like material would appear in audit output

## Remaining path

| Milestone | Purpose |
|-----------|---------|
| **R43D** | Final proof preflight — verify all gates immediately before controlled proof |
| **R43E** | One controlled transaction engineering proof (still not full live trading) |
| **R43F** | Post-transaction audit review and posture verification |

R43C alone does **not** authorize live trading, strategy validation, or repeated execution.

## Operator notes

- Do **not** paste private keys into Cursor
- Configure secrets locally via env or outside-repo keyfile only
- Run `node r43c_local_signer_readiness.js` before any R43D work
- Safety suite must remain green (`run_safety_tests.js`)
