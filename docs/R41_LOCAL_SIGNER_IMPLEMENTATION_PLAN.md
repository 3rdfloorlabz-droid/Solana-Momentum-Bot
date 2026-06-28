# R41 — Local Signer Implementation Plan

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Track:** A — Micro-live engineering proof  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **DEFINED** — plan only  
**Review date:** 2026-06-23  

**Prerequisites:** [R39](./R39_SIGNER_SAFETY_DESIGN.md) · [R40](./R40_MOCK_SIGNER_TEST_PLAN.md) · [TRACK_A_MICRO_LIVE_GUARDRAILS.md](./TRACK_A_MICRO_LIVE_GUARDRAILS.md)

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED** (engineering proof only)  
**R7 strategy edge:** **NOT ENOUGH DATA** — not bypassed  
**Private keys:** **NOT HANDLED**

---

## 1. Purpose

R41 is the **local signer implementation plan** for a future **one-transaction micro-live engineering proof**.

This milestone defines **exactly how** a real local signer could be built and wired in later gates (R42/R43) — without implementing it now.

R41 does **not**:

- Implement a real signer
- Request, add, read, or parse private keys
- Add Solana signing dependencies
- Submit transactions
- Integrate a signer into `live_executor.js`
- Enable live trading or approve micro-live
- Bypass R7 **NOT ENOUGH DATA**

---

## 2. Current posture

| Item | Value |
|------|--------|
| `executionMode` | `PIPELINE_DRY_RUN` |
| `dryRunMode` | `true` |
| `liveArmed` | `false` |
| Live submission | **DISARMED** |
| `recovery_actions.jsonl` | **absent** |
| Safety suite | **53/53 PASS** → **54/54** after R41 preflight test wired |
| R7 strategy edge | **NOT ENOUGH DATA** |
| Real key handled | **none** |
| Transaction submission | **none enabled** |
| `live_executor.js` signer integration | **none** |
| Mock signer harness | R40 complete (`mock_signer.js`) |
| Operator caps file | Not yet created |

Capital at risk: **$0**.

---

## 3. Recommended signer method

R39 compared outside-repo encrypted keyfile (Option E) and ephemeral environment variable (Option A). R41 selects a **primary** and **fallback** for R42/R43.

### Option E — Outside-repo encrypted local keyfile (PRIMARY)

| | |
|--|--|
| **Pros** | Not in repo; not in shell history; passphrase separate from ciphertext; aligns with R38 path (`C:\TracktaOS\Secrets\...`); easy to delete after proof |
| **Cons** | Decrypted key briefly in memory during sign; backup discipline required |
| **First proof** | **Recommended primary method** |

### Option A — Ephemeral environment variable (FALLBACK)

| | |
|--|--|
| **Pros** | No persistent secret file; quick session setup; easy unset after proof |
| **Cons** | Visible in process environment; risk of inline shell history; accidental logging |
| **First proof** | **Acceptable fallback only** if keyfile path unavailable — must use redaction and immediate cleanup |

### R41 recommendation for R42/R43

**Primary:** outside-repo encrypted local keyfile outside `Solana-Momentum-Bot`, loaded once at process start after all guardrails pass, destroyed on `destroy()`.

**Fallback:** ephemeral `SOLANA_SIGNER_SECRET` (or approved env name) set locally immediately before arming, cleared immediately after proof — never committed, never logged.

**R41 does not create the keyfile or environment variable.**

---

## 4. Dedicated hot wallet requirements

| Rule | Requirement |
|------|-------------|
| Main wallet | **Never use** |
| Wallet type | **New dedicated hot wallet only** |
| Balance | **Tiny only** — no higher than approved demo cap (`maxTradeSizeSol` + buffer within operator caps) |
| Assets | **No NFTs**, no important tokens, no personal holdings |
| Reuse | **No reused personal wallet** |
| Documentation | Wallet **public address** may be documented; **secret never documented** |
| After proof | Operator may **drain or abandon** wallet |
| Pinning | Future signer must verify `wallet_status.json` pubkey matches approved dedicated address |

---

## 5. Future signer module design

**Proposed files (R42+ — not created in R41):**

| File | Role |
|------|------|
| `local_signer.js` | Load approved secret source; real sign path (future) |
| `signer_provider.js` | Factory — mock vs local; guard orchestration |
| `test_local_signer_safety.js` | Safety tests with temp fixtures only |

**Intended interface (must never expose secret material):**

| Method | Returns / behavior |
|--------|-------------------|
| `loadSignerFromApprovedSource(options)` | Signer instance; **no secret in return value** |
| `getPublicKey()` | Public key string only |
| `signTransaction(unsignedTransaction, context)` | Signature + safe metadata |
| `destroy()` | Clear in-memory references; best-effort wipe |
| `getSafeAuditMetadata()` | Redacted audit record only |

Implementation must delegate guard checks to:

- `micro_live_caps.js`
- `micro_live_guardrails.js`
- `mock_signer.js` guard patterns (extended for real sign path)

**No `live_executor.js` changes in R41.**

---

## 6. Required guard checks before any future real sign

Future local signer must **refuse signing** unless **all** pass:

### Operator caps

- Caps file exists and validates (`operator_records/micro_live_demo_caps.json`)
- `maxTradeSizeSol <= 0.02`
- `maxDailyLossSol <= 0.05`
- `maxTradesPerSession === 1`
- `maxOpenLivePositions === 1`
- `autoCompoundingAllowed === false`
- `requireHumanPresent === true`
- `stopAfterFirstTransaction === true`

### Infrastructure

- Safety suite passed **immediately before** arming
- `recovery_actions.jsonl` absent
- Singleton executor lock healthy; no duplicate loops
- `secret_safety_scan.js` clean (no non-test suspicious patterns)

### Wallet

- `wallet_status.json` present and usable
- Pubkey matches approved dedicated hot wallet
- Balance `<=` operator-approved demo balance

### Posture transitions (explicit operator approval required)

- `executionMode` transition approved (separate gate record)
- `liveArmed` transition approved
- `dryRunMode` transition approved

### Execution context

- Quote fresh (within policy threshold)
- Slippage within cap
- Session trade count **0**
- `live_positions.json` open count **0**
- Emergency stop **not active**; emergency stop behavior tested (R11 baseline)

---

## 7. Required blocks

Future signer must block:

| Block | Trigger |
|-------|---------|
| Main wallet | Pubkey not on approved dedicated list |
| Missing / unapproved caps | Caps file absent or `approved !== true` |
| Oversized caps | Conservative validation failure |
| Wrong wallet | `wallet_status` mismatch |
| Balance too high | Above demo cap |
| >1 transaction | Session count ≥ 1 |
| >1 open position | `live_positions.json` length > 0 |
| Stale quote | Quote age over threshold |
| High slippage | Above cap |
| Recovery present | `recovery_actions.jsonl` exists |
| Duplicate executor | Active singleton conflict |
| Unsafe posture | LIVE / armed / dry-run false without approved transition |
| Stale safety suite | Not run immediately before arming |
| Secret in logs/audit/errors | Redaction failure |
| Dashboard one-click arming | Forbidden — human-present multi-step only |

---

## 8. Secret lifecycle

### Operator provides secret (future R42+)

1. Create dedicated hot wallet offline
2. Fund with tiny demo balance only
3. Store secret **outside repo** (encrypted keyfile primary) or set ephemeral env var in local shell **never in Cursor chat**
4. Document **public address only** in operator records
5. Run guardrails + preflight + safety suite
6. Arm only with human present

### Process memory

- Load secret once per proof session
- Call `destroy()` after proof or on error
- Avoid logging signer object or env dumps
- Never serialize secret to JSON

### Logs and errors

- All paths through `redactSecrets()` (existing executor pattern)
- Error handlers must not `JSON.stringify` raw context with env or key fields
- Audit JSONL: public keys and tx ids only

### Tests

- Mock signer and temp fixtures only
- No real secrets in repo, examples, or docs

### Gitignore

- `.env`, `.env.*`, `*.key`, `*.pem`, `*secret*`, `signer_secret*`, `wallet_secret*` (enforced by R9 policy)

### Cleanup after proof

1. Disarm (`liveArmed: false`, restore `PIPELINE_DRY_RUN`)
2. `destroy()` signer
3. Delete or secure keyfile; unset env var
4. Run safety suite
5. Confirm `recovery_actions.jsonl` still absent
6. Optional: drain/abandon hot wallet

---

## 9. Final micro-live approval dependency

Even after R41:

| Gate | Requirement |
|------|-------------|
| **R42** | Final approval review — explicit operator sign-off |
| **Operator caps** | `operator_records/micro_live_demo_caps.json` created and approved |
| **Preflight** | `signer_plan_preflight.json` + `micro_live_guardrails_check.json` pass |
| **Safety suite** | Green immediately before any arming |
| **Live trading** | Remains **NOT APPROVED** until explicit R42/R43 approval |

R41 is **plan only** — it does not satisfy R42 or approve micro-live.

---

## 10. Verdict

### **LOCAL SIGNER PLAN ONLY — NOT READY FOR IMPLEMENTATION**

R41 defines the local signer implementation plan. **No real signer, no keys, no submission, no executor integration.**

**Forbidden verdicts (not used):**

- `READY FOR LIVE TRADING`
- `LIVE APPROVED`

**Next gate:** R42 final micro-live approval review + optional local signer safety stubs (still no real signing without explicit approval).

---

## Supporting tooling

| Script | Purpose |
|--------|---------|
| `signer_plan_preflight.js` | Read-only plan readiness check → `analysis/signer_plan_preflight.json` |

```bash
node signer_plan_preflight.js
node run_safety_tests.js
```

---

## Related documents

- [R39 — Signer Safety Design](./R39_SIGNER_SAFETY_DESIGN.md)
- [R40 — Mock Signer Test Plan](./R40_MOCK_SIGNER_TEST_PLAN.md)
- [R38 — Research Wallet Secret Storage Design](./R38_RESEARCH_WALLET_SECRET_STORAGE_DESIGN.md)
- [TRACK_A_MICRO_LIVE_GUARDRAILS.md](./TRACK_A_MICRO_LIVE_GUARDRAILS.md)
