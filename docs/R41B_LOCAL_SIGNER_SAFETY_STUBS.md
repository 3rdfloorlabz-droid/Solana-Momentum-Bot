# R41B — Local Signer Safety Stubs

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Track:** A — Micro-live engineering proof  
**Status:** **BUILT** — stub only  
**Review date:** 2026-06-23  

**Prerequisites:** [R41](./R41_LOCAL_SIGNER_IMPLEMENTATION_PLAN.md) · [R40](./R40_MOCK_SIGNER_TEST_PLAN.md) · [R42](./R42_FINAL_MICRO_LIVE_APPROVAL_REVIEW.md)

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED**  
**Private keys:** **NOT HANDLED**  
**Real signing:** **NOT IMPLEMENTED**

---

## 1. Purpose

R41B creates the **local signer module boundary** and **safety checks** that a future real signer must pass — without implementing real signing.

This is **not** real signing. This is **not** executor integration. This is **not** R43 approval.

---

## 2. What was built

| Module | Role |
|--------|------|
| `local_signer.js` | Local signer stub — guards only, `LOCAL_SIGN_NOT_IMPLEMENTED` |
| `signer_provider.js` | Provider selection — mock + local_stub allowed; real blocked |
| `test_local_signer_safety.js` | Temp-fixture regression tests |

**Stub public key:** `LOCAL_SIGNER_STUB_NOT_ARMED`

---

## 3. Stub behavior

| Function | Phase behavior |
|----------|----------------|
| `createLocalSignerStub(options)` | Creates guard-bound stub |
| `loadSignerFromApprovedSource(options)` | **Rejects** real secret sources; returns stub |
| `getPublicKey()` | Returns `LOCAL_SIGNER_STUB_NOT_ARMED` |
| `signTransaction(...)` | Runs guards then **throws** `LOCAL_SIGN_NOT_IMPLEMENTED` |
| `destroy()` | Clears placeholder audit state |
| `getSafeAuditMetadata()` | Redacted metadata only — no secrets |

---

## 4. Provider behavior

| Provider | Status |
|----------|--------|
| `mock` | Allowed when `mockMode: true` |
| `local_stub` | Allowed when `allowLocalStub: true` |
| `local_real` / `real` / `hardware` | **Blocked** |
| Unknown | **Blocked** |

---

## 5. Required blocks (enforced)

- Operator caps missing / unapproved / invalid
- `executionMode: LIVE`, `dryRunMode: false`, `liveArmed: true`
- `recovery_actions.jsonl` present
- Secret-like input (privateKey, secretKey, seed phrase, key arrays, PEM)
- Live/mainnet context
- Transaction submission attempts
- Real secret source types (env, file, mnemonic, etc.)

---

## 6. Why stubs exist before R43

R41 defined the plan; R41B proves the **guard boundary** can be tested without keys. R43 requires explicit operator approval (`approved: true` on caps) before any real signer work.

Current operator caps draft: **`approved: false`** — execution remains blocked.

---

## 7. Remaining blockers before one-transaction proof

1. R43 operator approval (`approved: true` on caps)
2. Real local signer implementation (post-R43 only)
3. Dedicated RPC
4. Final human approval record
5. `live_executor.js` integration (separate gated step — not in R41B)
6. R7 **NOT ENOUGH DATA** — not bypassed
7. Live trading **NOT APPROVED**

---

## 8. Verdict

### **LOCAL SIGNER STUB ONLY — REAL SIGNING NOT IMPLEMENTED**

---

## Verification

```bash
node local_signer.js
node signer_provider.js
node test_local_signer_safety.js
node run_safety_tests.js
```
