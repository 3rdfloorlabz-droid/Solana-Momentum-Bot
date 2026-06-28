# R39 — Signer Safety Design and Secret Boundary Review

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Track:** A — Micro-live engineering proof  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **DEFINED** — design only (Stage 1)  
**Review date:** 2026-06-23  

**Prerequisites:** [R38](./R38_RESEARCH_WALLET_SECRET_STORAGE_DESIGN.md) · [TRACK_A_MICRO_LIVE_GUARDRAILS.md](./TRACK_A_MICRO_LIVE_GUARDRAILS.md)

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED** (engineering proof only)  
**R7 strategy edge:** **NOT ENOUGH DATA** — not bypassed  
**Private keys:** **NOT HANDLED**

---

## 1. Purpose

R39 defines how a **future signer path** must be isolated and protected before any micro-live engineering proof.

This milestone:

- Establishes the **secret boundary** between operator-controlled signing material and bot runtime code.
- Documents **required guardrails** that must pass before any signer implementation (R40+).
- Defines **red-team failure modes** that implementation must prevent.
- Completes **Stage 1 only** — design and read-only scanning; **no real signing**.

R39 does **not**:

- Implement real signing or submission.
- Request, add, read, or print private keys.
- Enable live trading or approve micro-live.
- Bypass R7 edge findings or Track A operator caps.

---

## 2. Current posture

| Item | Value |
|------|-------|
| `executionMode` | `PIPELINE_DRY_RUN` |
| `dryRunMode` | `true` |
| `liveArmed` | `false` |
| Live submission | **DISARMED** |
| `recovery_actions.jsonl` | **absent** |
| Safety suite | **52/52 PASS** (`node run_safety_tests.js`) |
| Private key handled | **none** |
| Transaction submission | **none enabled** |
| Track A guardrails | Built — `micro_live_caps.js` / `micro_live_guardrails.js` |
| Operator caps file | Not yet created (`operator_records/micro_live_demo_caps.json`) |

Capital at risk: **$0**. Micro-live path remains **engineering proof only**, not strategy-profit validation.

---

## 3. Secret handling rules

These rules apply to all Track A work from R39 onward:

| Rule | Requirement |
|------|-------------|
| Main wallet | **Never use** — dedicated hot wallet only |
| Wallet funds | **Tiny demo balance only** — operator-approved cap |
| Seed phrase | **Never stored** in repo, logs, analysis, or config |
| Repo commits | **No secret committed** to git |
| `.env` | **No secret in `.env`** unless `.env` is gitignored **and** explicitly allowed in a future approved gate |
| Console | **No secret printed** to stdout/stderr |
| Logs | **No secret written** to log files or JSONL |
| Analysis | **No secret written** to `analysis/` |
| Audit | **No secret written** to audit JSONL (`execution_audit.jsonl`, etc.) |
| Dashboard | **No secret exposed** in HTML/JS/API responses |
| Cursor chat | **No secret passed** through Cursor prompts or history |
| Documentation | **No secret included** in docs |
| Tests | **No secret in test fixtures** (placeholders only) |
| Screenshots | **No secret in screenshots** |
| Operator supply | Secret supplied **only** through a future approved local-only method |

Violation of any rule is a **hard stop** — do not proceed to signer implementation.

---

## 4. Recommended signer approach (staged)

| Stage | Description | R39 status |
|-------|-------------|------------|
| **Stage 1** | No key — design only | **Complete in R39** |
| **Stage 2** | Local mock signer test | Not started |
| **Stage 3** | Devnet signer simulation (if supported) | Not started |
| **Stage 4** | Mainnet micro-live hot wallet — tiny balance only | Not started |
| **Stage 5** | One transaction max proof | Not started |

**R39 completes Stage 1 only.** No signer code paths are added to the executor.

---

## 5. Allowed future secret storage options

Comparison for the **first micro-live engineering proof**:

### A. Environment variable loaded locally at runtime

| | |
|--|--|
| **Pros** | Simple; no file on disk in repo; easy to clear after session |
| **Cons** | Visible in process environment; accidental logging risk; persists in shell history if set inline |
| **First proof** | **Acceptable with strict redaction** if set outside repo and never logged |

### B. Local uncommitted `.env` file

| | |
|--|--|
| **Pros** | Familiar pattern; stays on disk for session |
| **Cons** | Easy to commit accidentally; easy to copy into analysis; must be gitignored |
| **First proof** | **Conditional** — only if `.gitignore` enforced and R39 scan passes; not preferred |

### C. OS credential manager

| | |
|--|--|
| **Pros** | Strongest software isolation; not in repo or plain env |
| **Cons** | More integration work; platform-specific |
| **First proof** | **Best long-term** — defer implementation to R40+ unless operator already uses vault |

### D. Hardware wallet / manual signer

| | |
|--|--|
| **Pros** | Key never on bot host; human approves each signature |
| **Cons** | Not suitable for automated micro-live proof loop; operational friction |
| **First proof** | **Not appropriate** for first automated engineering proof |

### E. Encrypted local keyfile

| | |
|--|--|
| **Pros** | File outside repo; passphrase separate from ciphertext |
| **Cons** | Decrypted key in memory during signing; file backup risk |
| **First proof** | **Acceptable** if path is outside repo and never committed |

### R39 recommendation

**Safest practical first approach:** **Option A (environment variable)** or **Option E (encrypted keyfile outside repo)**, loaded at runtime only after all guardrails pass, with mandatory redaction in all logging paths.

R38 already recommends **local secret file outside repo** (`C:\TracktaOS\Secrets\...`) as the primary design. R39 aligns: **prefer outside-repo path or ephemeral env var**; do **not** store secrets in the repository.

**R39 does not implement any storage option.**

---

## 6. Required signer guardrails before implementation

Future signer implementation (R40+) must **block signing** unless **all** of the following pass:

### Operator caps (`micro_live_caps.js`)

- Operator caps file exists and validates
- `maxTradeSizeSol <= 0.02`
- `maxDailyLossSol <= 0.05`
- `maxTradesPerSession === 1`
- `maxOpenLivePositions === 1`
- `autoCompoundingAllowed === false`
- `requireHumanPresent === true`
- `stopAfterFirstTransaction === true`

### Track A guardrails (`micro_live_guardrails.js`)

- `micro_live_guardrails_check.json` verdict acceptable for proof phase
- `recovery_actions.jsonl` absent
- Singleton executor lock healthy
- No duplicate executor loops

### Runtime posture

- Safety suite passed **immediately before** arming
- `executionMode` / `dryRunMode` / `liveArmed` transition has **explicit operator approval** (separate gate — not R39)
- Emergency stop clear and tested (R11 simulation baseline)

### Execution policy

- Quote/slippage checks pass (R14/R18/R33 policy)
- Signer connected to **dedicated hot wallet only** (never main wallet)
- Wallet balance does not exceed operator-approved demo balance

Future submission code must call **`micro_live_guardrails.js`** and caps validation **before** any sign attempt.

---

## 7. Red-team failure modes

Implementation must prevent:

| Failure mode | Prevention |
|--------------|------------|
| Committing a private key | `.gitignore`, pre-commit scan, `secret_safety_scan.js` |
| Logging a private key | Mandatory `redactSecrets()` on all log paths |
| Dashboard leaking secrets | No secret fields in API/HTML; redact RPC URLs |
| Signing from wrong wallet | Wallet pubkey pin / dedicated-hot-wallet check |
| Signing more than one transaction | `maxTradesPerSession === 1`, `stopAfterFirstTransaction` |
| Duplicate executor submitting twice | R5 singleton lock + guardrail check |
| Stale quote execution | Quote freshness + slippage caps (R14/R18) |
| Slippage above cap | Pre-sign quote validation |
| Daily loss cap ignored | Session loss accumulator + hard stop |
| `liveArmed` left true after proof | Mandatory disarm + session teardown runbook |
| Auto-compounding accidentally enabled | Caps + config guard; default false |
| Emergency stop bypassed | Fail-closed submission gates |
| Recovery automation restarting into live mode | No autonomous recovery; `recovery_actions.jsonl` absent |

---

## 8. Files that must never contain secrets

| Location | Rule |
|----------|------|
| `docs/` | Placeholders and policy only |
| `analysis/` | Metrics and scan reports only — redacted |
| Logs (`*.log`, JSONL ledgers) | Redact all sensitive fields |
| Audit JSONL | Stage metadata only — no key material |
| Recovery files | No secrets in recovery plans |
| Config committed to git | No signing material |
| Tests | Fake placeholders only (`DO_NOT_USE`, `FAKE_EXAMPLE`) |
| `examples/` | `EXAMPLE_ONLY` / `configType` markers |
| Dashboard HTML/JS | Public addresses only |
| GitHub repository | Never |
| Cursor prompt/history | Never paste key material |

---

## 9. Pre-implementation checklist (before R40)

Before any signer implementation:

- [ ] R39 reviewed and accepted
- [ ] Git working tree clean (or changes explicitly scoped)
- [ ] Safety suite green (`node run_safety_tests.js`)
- [ ] Secret storage method chosen (A or E recommended)
- [ ] Operator caps file created (`operator_records/micro_live_demo_caps.json`)
- [ ] No active approval ambiguity (`approved: true` with explicit operator sign-off)
- [ ] Signer test plan written (Stage 2 mock signer)
- [ ] Rollback plan written (disarm, clear env, stop executor)

---

## 10. Verdict

### **SIGNER DESIGN ONLY — NOT READY FOR IMPLEMENTATION**

R39 defines the signer safety boundary and secret handling policy for Track A. **No signer implementation, no private key handling, no live trading approval.**

**Forbidden verdicts (not used):**

- `READY_FOR_LIVE_TRADING`
- `LIVE_APPROVED`
- `MICRO_LIVE_APPROVED`

**Next gate:** R40 — mock signer test design (Stage 2), only after checklist above and operator caps approval.

---

## Supporting tooling

| Script | Purpose |
|--------|---------|
| `secret_safety_scan.js` | Read-only repo text scan for obvious secret-risk patterns → `analysis/secret_safety_scan.json` |
| `test_secret_safety_scan.js` | Temp-fixture regression tests |

Run: `node secret_safety_scan.js`

Scan rules: read-only, no secrets printed, suspicious matches redacted in output, writes `analysis/` only.

---

## Related documents

- [R38 — Research Wallet Secret Storage Design](./R38_RESEARCH_WALLET_SECRET_STORAGE_DESIGN.md)
- [TRACK_A_MICRO_LIVE_GUARDRAILS.md](./TRACK_A_MICRO_LIVE_GUARDRAILS.md)
- [R8A — Micro-live Engineering Proof Plan](./R8A_MICRO_LIVE_ENGINEERING_PROOF_PLAN.md)
- [R10 — Live Execution Path Review](./R10_LIVE_EXECUTION_PATH_REVIEW.md)
- [R14 — Slippage / MEV Protection Review](./R14_SLIPPAGE_MEV_PROTECTION_REVIEW.md)
