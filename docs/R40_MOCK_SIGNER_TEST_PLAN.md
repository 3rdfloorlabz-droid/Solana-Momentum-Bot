# R40 — Mock Signer Test Plan

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Track:** A — Micro-live engineering proof  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **DEFINED** — mock harness built  
**Review date:** 2026-06-23  

**Prerequisites:** [R39](./R39_SIGNER_SAFETY_DESIGN.md) · [TRACK_A_MICRO_LIVE_GUARDRAILS.md](./TRACK_A_MICRO_LIVE_GUARDRAILS.md)

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED** (engineering proof only)  
**R7 strategy edge:** **NOT ENOUGH DATA** — not bypassed  
**Private keys:** **NOT HANDLED**

---

## 1. Purpose

R40 proves signer safety with **fake/mocked signing only**.

This milestone:

- Defines a **mock signer interface** that future real signers must mirror.
- Implements a **mock harness** (`mock_signer.js`) that returns deterministic fake signatures.
- Validates guardrails that **reject unsafe signing contexts** before any real key is introduced.
- Does **not** connect to `live_executor.js`, submit transactions, or handle real secrets.

R40 completes **Stage 2** from R39 (local mock signer test design + harness).

---

## 2. Current posture

| Item | Value |
|------|--------|
| `executionMode` | `PIPELINE_DRY_RUN` |
| `dryRunMode` | `true` |
| `liveArmed` | `false` |
| Live submission | **DISARMED** |
| `recovery_actions.jsonl` | **absent** |
| Safety suite | **52/52 PASS** → **53/53** after R40 test wired |
| Real key handled | **none** |
| Transaction submission | **none enabled** |
| `live_executor.js` integration | **none** |

Capital at risk: **$0**.

---

## 3. Mock signer concept

The mock signer:

| Property | Behavior |
|----------|----------|
| Real private key | **Does not contain** |
| Real wallet derivation | **Does not derive** |
| Real Solana signing | **Does not sign** |
| Signatures | Deterministic fake: `MOCK_SIGNATURE_<hash>` |
| Audit output | Safe metadata only — redacted |
| Live/mainnet payloads | **Rejected** |
| `liveArmed: true` | **Rejected** |
| `dryRunMode: false` | **Rejected** |
| `executionMode: LIVE` | **Rejected** |
| Missing operator caps | **Rejected** |
| Trade size above cap | **Rejected** |
| Session trade count ≥ 1 | **Rejected** |

The mock signer only operates when `mockMode: true` and runtime posture remains in the **safe prebuild** state (`PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false`).

---

## 4. Mock signer interface

| Method | Description |
|--------|-------------|
| `createMockSigner(options)` | Factory — returns mock signer instance |
| `signer.getPublicKey()` | Returns `MOCK_SIGNER_PUBLIC_KEY_DO_NOT_USE` |
| `signer.signTransaction(unsignedTransaction, context)` | Validates guards; returns fake signature |
| `signer.getAuditRecord()` | Returns safe, redacted audit metadata |

**Fake public key:** `MOCK_SIGNER_PUBLIC_KEY_DO_NOT_USE`  
**Fake signature format:** `MOCK_SIGNATURE_<sha256-hex-prefix>`

No real crypto signing. No Solana SDK dependency.

---

## 5. Mock signer guardrails

The mock signer blocks:

| Guard | Trigger |
|-------|---------|
| Real key material | `privateKey`, `secretKey`, PEM, numeric key arrays |
| Seed phrases | `mnemonic`, `seedPhrase` fields with values |
| Secret-like buffers | 64-byte numeric arrays |
| Live mode | `context.live === true` or `network === 'mainnet'` |
| Missing caps | Caps not loaded or not approved |
| Oversized trade | `tradeSizeSol > maxTradeSizeSol` |
| Session limit | `sessionTradeCount >= maxTradesPerSession` |
| Unsafe posture | `LIVE`, `dryRunMode: false`, `liveArmed: true` |
| Stale quote | `quoteAgeMs` above threshold |
| Unsafe slippage | `slippageBps` above cap |
| Recovery present | `recovery_actions.jsonl` present |

---

## 6. Implementation

| Module | Role |
|--------|------|
| `mock_signer.js` | Mock signer harness — no real crypto, no executor integration |
| `test_mock_signer.js` | Temp-fixture regression tests |

**Rules enforced:**

- No dependencies beyond Node built-ins
- No real crypto signing
- No Solana transaction submission
- No private key parsing
- No secret printing
- No `live_executor.js` integration
- Output only fake metadata (in-memory audit record)

---

## 7. Tests

`test_mock_signer.js` proves:

- Fake public key returned
- Deterministic fake signature
- Rejects live mode / mainnet context
- Rejects `dryRunMode: false`
- Rejects `liveArmed: true`
- Rejects missing caps
- Rejects `maxTradeSizeSol` above cap
- Rejects session trade count ≥ 1
- Rejects suspicious secret-looking input
- No `recovery_actions.jsonl` creation
- No trading state mutation
- No real private key in output
- Audit metadata safe and redacted

Wired into `run_safety_tests.js` (expected **53/53**).

---

## 8. Relationship to R10

| | R10 `signer_simulation_harness.js` | R40 `mock_signer.js` |
|--|-----------------------------------|----------------------|
| Purpose | Simulated lifecycle for agreement gates | Mock interface for safe prebuild testing |
| Posture | Requires MICRO_LIVE/LIVE armed | **Requires** PIPELINE_DRY_RUN disarmed |
| Caps | R8 limits context | Track A `micro_live_caps.js` |
| Executor | Not integrated | **Not integrated** |

R40 is the **safe mock boundary** before any local real signer plan (R41+).

---

## 9. Pre-implementation checklist (before real local signer)

Before connecting a real signer (future gate):

- [ ] R40 harness tests green
- [ ] R39 reviewed; secret storage method chosen
- [ ] Operator caps file created and approved
- [ ] `secret_safety_scan.js` clean or reviewed
- [ ] `micro_live_guardrails.js` passes
- [ ] Rollback / disarm runbook ready
- [ ] Explicit operator approval for local signer implementation plan

---

## 10. Verdict

### **MOCK SIGNER HARNESS COMPLETE — READY FOR LOCAL SIGNER IMPLEMENTATION PLAN**

R40 mock harness is built and tested. **No real signing, no live trading approval, no executor integration.**

**Forbidden verdicts (not used):**

- `READY FOR LIVE TRADING`
- `LIVE APPROVED`

**Next gate:** Local signer implementation **plan** only (outside-repo secret path design + integration spec) — not live arming.

---

## Supporting tooling

```bash
node mock_signer.js          # prints interface summary (no signing)
node test_mock_signer.js     # temp-fixture tests
node run_safety_tests.js     # full suite including R40
```

---

## Related documents

- [R39 — Signer Safety Design](./R39_SIGNER_SAFETY_DESIGN.md)
- [R10 — Live Execution Path Review](./R10_LIVE_EXECUTION_PATH_REVIEW.md)
- [TRACK_A_MICRO_LIVE_GUARDRAILS.md](./TRACK_A_MICRO_LIVE_GUARDRAILS.md)
