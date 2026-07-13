# VALIDATE LIVE SYSTEM STATIC VALIDATOR DRIFT REMEDIATION PLANNING — 2026-07-07

**Gate:** validate_live_system Static Validator Drift Remediation Planning  
**Date:** 2026-07-07  
**Type:** Read-only planning and design  
**Strategy readiness:** **NOT READY** (unchanged)  
**OR-20260630-008:** **not_promoted** (unchanged)

---

## 1. Objective

Design the **smallest safe** remediation for four stale `validate_live_system.js` checks so the validator accurately reflects current production semantics **without weakening** real safety policy. **No code, test, config, or documentation changes in this gate.**

---

## 2. Files inspected

| File | Purpose |
|------|---------|
| `POST-REMEDIATION LIVE READINESS BLOCKER REVIEW — 2026-07-07.md` | Failure classification baseline |
| `validate_live_system.js` | Failing rules (lines 157–166, 245, 390–425, 426–429) |
| `live_executor.js` | Runtime arming gates, refactored submit path |
| `live_config.json` | `maxSubmitRetries: 2` |
| `docs/OPERATIONS.md:371` | V1 match |
| `docs/R9_WALLET_SIGNER_SECURITY_REVIEW.md:139` | V1 match |
| `test_submit_retry_requote.js` | R14 retry semantics |
| `test_r16_live_path_coupling.js` | Arming gate coupling |
| `run_safety_tests.js` | Suite baseline (84 tests) |
| `ACTIVE_MANIFEST.md` | Manifest posture |

---

## 3. Failures reproduced

**Four failures reproduced:** **yes**

`node validate_live_system.js` → **4 failure(s), 5 warning(s)**

| ID | Validator rule location | Exact rule / message |
|----|-------------------------|----------------------|
| **V1** | `validate_live_system.js:157–166` | `/^[ \t]*SOLANA_SIGNER_SECRET[ \t]*=[ \t]*[^ \t\r\n#]/m` over `projectTextFiles(ROOT)` → `bad("project scan: non-empty SOLANA_SIGNER_SECRET assignment found")` |
| **V2** | `validate_live_system.js:245` | `cfg.maxSubmitRetries >= 0 && cfg.maxSubmitRetries <= 1` → `bad("maxSubmitRetries must be integer between 0 and 1", …)` |
| **V3** | `validate_live_system.js:390–425` | Monolithic regex on `async function submitSwap…` through `// ─── Pre-trade abort checks`; requires simulate/sign/submit/confirm/fill **inside** that block |
| **V4** | `validate_live_system.js:426–429` | `executorSource.includes('process.env.FOMO_ENABLE_LIVE_SUBMISSION !== "YES"')` AND position-size fail string |

---

## 4. Remediation design — V1 (documentation secret scan)

### Root cause

Broad line-start assignment regex scans all `projectTextFiles` (`.js`, `.json`, `.md`, `.txt`, `.ps1`, `.env.example`). Two **documentation** files contain intentional placeholder examples:

- `docs/OPERATIONS.md:371` — `SOLANA_SIGNER_SECRET=<real signer>`
- `docs/R9_WALLET_SIGNER_SECURITY_REVIEW.md:139` — `SOLANA_SIGNER_SECRET=PRIVATE_KEY_DO_NOT_USE_FAKE_EXAMPLE_ONLY`

`.env` is correctly **excluded** from scan. Production `.js` sources do not contain line-start hardcoded assignments. Test files use `process.env.SOLANA_SIGNER_SECRET = …` (runtime assignment) which does **not** match the line-start regex.

### Proposed rule (path-aware exclusion + production-focused scan)

**Change type:** path-aware exclusion + scoped scan

Replace single global scan with **two-tier logic**:

1. **Production source scan (strict)** — scan only:
   - `live_executor.js`, `monitor.js`, `dashboard_server.js`, `local_signer.js`, `signer_provider.js`, and other non-test root `.js` files matching `/^(?!test_).*\.js$/` at repo root (explicit allowlist preferred over denylist)
   - **Exclude:** `test_*.js`, `docs/**`, `Ori/**`, `analysis/**`, `Sessions/**`
   - Same regex; any match → **fail**

2. **Documentation scan (advisory only)** — optional **warn** (not fail) if `docs/**` contains assignment-like lines **without** known placeholder markers

3. **Placeholder allowlist** (secondary filter on any remaining matches):
   - Value contains `<` and `>` (e.g. `<real signer>`)
   - Value matches `/PRIVATE_KEY_DO_NOT_USE|FAKE_EXAMPLE|DO_NOT_USE|example only/i`

### Negative-safety preservation

- Production `.js` hardcoded secret assignments still **fail**
- Existing check **PASS**: raw `process.env.SOLANA_SIGNER_SECRET` never logged (`validate_live_system.js:387–388`) — **unchanged**
- `.env.example` empty-value check — **unchanged**
- `loadSignerFromEnvForRealExecution` JSON-array-only static check — **unchanged**

### Documentation changes recommended

**No** — validator exclusions alone are preferable. Doc placeholders are intentional operator guidance; editing would reduce clarity without improving security.

---

## 5. Remediation design — V2 (maxSubmitRetries)

### Root cause

Validator enforces pre-R14 range **0–1**. R14 Implementation Authorization (2026-07-05) harmonized config to **`maxSubmitRetries: 2`** (max **2 retries** = **3 quote/submit attempts**). Runtime:

```javascript
// live_executor.js:877–880
function maxSubmitAttempts(cfg) {
  const retries = Number(cfg?.maxSubmitRetries);
  if (!Number.isFinite(retries) || retries < 0) return 1;
  return Math.min(Math.floor(retries) + 1, 10);
}
```

`test_submit_retry_requote.js:73` asserts `maxSubmitAttempts({ maxSubmitRetries: 2 }) === 3`.

### Proposed policy check

**Change type:** policy update

Replace line 245:

```javascript
// FROM:
Number.isInteger(cfg.maxSubmitRetries) && cfg.maxSubmitRetries >= 0 && cfg.maxSubmitRetries <= 1

// TO:
Number.isInteger(cfg.maxSubmitRetries) && cfg.maxSubmitRetries >= 0 && cfg.maxSubmitRetries <= 2
```

Update ok message: `"maxSubmitRetries between 0 and 2 (R14 policy)"`.

**Optional structural companion check** (same gate, no production change):

```javascript
executorSource.includes("function maxSubmitAttempts") &&
executorSource.includes("Math.min(Math.floor(retries) + 1, 10)")
  ? ok("maxSubmitRetries wired to bounded attempt counter")
  : bad("maxSubmitRetries must drive bounded quote/submit attempts");
```

### Upper-bound preservation

- Config **reject** `maxSubmitRetries > 2` (fail closed vs R14 micro-live policy)
- Config **reject** non-integer or `< 0`
- Runtime hard cap **10** in `maxSubmitAttempts` remains production responsibility; validator documents R14 canonical max **2** only
- Values **3+** in config must still **fail** validator

---

## 6. Remediation design — V3 (LIVE submit branch ordering)

### Root cause

Post-refactor call graph split across functions:

| Stage | Function | Key calls |
|-------|----------|-----------|
| Orchestration | `submitSwap` (~3037) | DRY_RUN return; LIVE → `assertLivePathPreSubmit`; → `executeQuotedSwapAttempt`; → `completeLiveSwapFromPipeline` |
| Pipeline | `executeQuotedSwapAttempt` (~893) | quote → validate → build → **`simulateSwapTx`** |
| LIVE completion | `completeLiveSwapFromPipeline` (~2812) | **`signer.sign`** → **`submitRawTransaction`** → **`awaitConfirmation`** → **`parseFillFromTransaction`** |
| Arming | `assertLivePathPreSubmit` (~2383) | e-stop → **`assertLiveSubmissionArmed`** → capital → reconciliation → R15 |

Old validator expects all stages inside `submitSwap` body; indices for simulate/sign/submit/confirm/fill are **-1** in extracted block.

### Proposed structural check

**Change type:** structural/call-graph check (replace lines 390–425)

Extract three function bodies from `executorSource`:

```javascript
const submitSwapSrc = matchFunction("async function submitSwap", "// ─── Pre-trade abort checks");
const pipelineSrc = matchFunction("async function executeQuotedSwapAttempt", "async function executeQuotedSwapWithRetries");
const completeSrc = matchFunction("async function completeLiveSwapFromPipeline", "async function submitSwap");
const preSubmitSrc = matchFunction("function assertLivePathPreSubmit", "function registerLiveSubmitInFlight");
```

**Checks (all required):**

| # | Check | Rationale |
|---|-------|-----------|
| A | `submitSwapSrc` includes `if (mode === "DRY_RUN")` before `loadSignerFromEnvForRealExecution` | Dry-run isolation |
| B | `submitSwapSrc` includes `assertLivePathPreSubmit` before `executeQuotedSwapAttempt` | Arming before pipeline |
| C | `preSubmitSrc` includes `assertLiveSubmissionArmed` | Arming gate present |
| D | `pipelineSrc` includes `simulateSwapTx(builtSwap, cfg)` | Simulation before sign |
| E | `completeSrc` has ordered indices: `signer.sign` < `submitRawTransaction` < `awaitConfirmation` < `parseFillFromTransaction` | Sign → submit → confirm → fill |
| F | `completeSrc` includes `signedBytes.fill(0)` and `signer = null` | Lifecycle discipline |
| G | File-level: `indexOf("async function executeQuotedSwapAttempt")` < `indexOf("async function completeLiveSwapFromPipeline")` | Pipeline defined before completion |

**Remove** requirement that `assertLiveSubmissionArmed({ ...cfg, positionSizeSol })` appear inside `submitSwap` (it correctly lives in `assertLivePathPreSubmit`).

### Guard-order preservation

Runtime LIVE order after fix:

1. `assertLivePathPreSubmit` (arming, R15, reconciliation, capital)
2. `executeQuotedSwapAttempt` (quote, slippage, simulate)
3. `completeLiveSwapFromPipeline` (sign, submit, confirm, fill)

**Stricter than old check:** arming fires **before** quote/simulate, not between simulate and sign.

---

## 7. Remediation design — V4 (arming environment gate)

### Root cause

Validator expects legacy negative pattern:

```javascript
process.env.FOMO_ENABLE_LIVE_SUBMISSION !== "YES"
```

Runtime uses **positive fail-closed gate** in `collectLiveSubmissionGateFailures` (~2175–2180):

```javascript
process.env.FOMO_ENABLE_LIVE_SUBMISSION === "YES"  // must be exactly YES
```

Semantically equivalent (fail unless exact YES) but literal mismatch fails static check.

### Proposed exact-value check

**Change type:** regex correction / structural check

Replace lines 426–429 with **both** required:

```javascript
const armingGateOk =
  executorSource.includes('process.env.FOMO_ENABLE_LIVE_SUBMISSION === "YES"') &&
  executorSource.includes('"FOMO_ENABLE_LIVE_SUBMISSION must equal YES"') &&
  executorSource.includes("positionSizeSol must be > 0 and <= 0.01 for first-live safety") &&
  executorSource.includes("function collectLiveSubmissionGateFailures") &&
  executorSource.includes("function assertLiveSubmissionArmed");
```

### Non-YES rejection preservation

Runtime already rejects:

- unset → `"FOMO_ENABLE_LIVE_SUBMISSION must equal YES"`
- `"yes"` lowercase → fail (`=== "YES"` strict)
- any other value → fail

`test_r16_live_path_coupling.js` exercises arming with exact `"YES"`. **No production change.**

---

## 8. Proposed validator changes summary

| ID | Change type | File | Approx lines | Scope |
|----|-------------|------|--------------|-------|
| V1 | path-aware exclusion | `validate_live_system.js` | 157–166 | Secret scan scope |
| V2 | policy update | `validate_live_system.js` | 245 | maxSubmitRetries 0–2 |
| V2b | structural (optional) | `validate_live_system.js` | after 245 | maxSubmitAttempts wiring |
| V3 | structural/call-graph | `validate_live_system.js` | 390–425 | LIVE path ordering |
| V4 | regex correction | `validate_live_system.js` | 426–429 | Arming gate pattern |

**Files changed in implementation gate:** `validate_live_system.js` only (+ new test file).

**Not in scope:** `live_executor.js`, `live_config.json`, docs, `.env`.

---

## 9. Proposed regression tests

Add **`test_validate_live_system_drift.js`** (included in `run_safety_tests.js` after implementation):

### V1 — secret scan

| Case | Fixture | Expected |
|------|---------|----------|
| Positive | Current repo with doc placeholders | scan passes (docs excluded or allowlisted) |
| Negative | Temp file `temp_secret_leak.js` with line `SOLANA_SIGNER_SECRET=[1,2,...]` | validator helper returns fail |
| Negative | Temp file with a signer-secret assignment placeholder at line start in root `.js` | fail |

Implementation approach: export scan helper from validator OR spawn `node validate_live_system.js` with `TRACKTA_RUNTIME_ROOT` temp fixture root containing injected bad file.

### V2 — maxSubmitRetries

| Case | Fixture | Expected |
|------|---------|----------|
| Positive | `live_config.json` with `maxSubmitRetries: 2` | pass |
| Negative | temp config `maxSubmitRetries: 3` | fail |
| Negative | `maxSubmitRetries: -1` | fail |

### V3 — LIVE path structure

| Case | Fixture | Expected |
|------|---------|----------|
| Positive | current `live_executor.js` | structural checks pass |
| Negative | stub executor missing `completeLiveSwapFromPipeline` | fail (future fixture test via exported matcher) |

### V4 — arming gate

| Case | Fixture | Expected |
|------|---------|----------|
| Positive | current `live_executor.js` with `=== "YES"` | pass |
| Negative | stub replacing `=== "YES"` with `!== "NO"` only | fail |

---

## 10. Acceptance criteria (implementation gate)

| Criterion | Target |
|-----------|--------|
| V1 false positive cleared | `docs/OPERATIONS.md` + `docs/R9_*` no longer fail |
| V1 true positives preserved | hardcoded production `.js` assignment still fails |
| V2 false positive cleared | `maxSubmitRetries: 2` passes |
| V2 upper bound | `maxSubmitRetries: 3` fails |
| V3 false positive cleared | refactored LIVE path passes structural checks |
| V3 guard order | arming before pipeline; simulate before sign; sign before submit |
| V4 false positive cleared | positive `=== "YES"` gate passes |
| V4 strictness | non-exact arming values still fail at runtime (unchanged) |
| No genuine checks weakened | Jupiter adapter checks, signer guard, dry-run isolation unchanged |
| `validate_live_system.js` | **fully green** or warnings-only (5 existing doc-term warnings acceptable) |
| `run_safety_tests.js` | **84/84+ PASS** (84 existing + 1 new drift test) |
| Production posture | disarmed; no broadcast |

---

## 11. Implementation gate scope (next)

**Recommended next gate:** **validate_live_system Static Validator Drift Remediation Implementation**

Estimated diff:

- **`validate_live_system.js`** — ~60–80 lines modified (V1–V4)
- **`test_validate_live_system_drift.js`** — new (~120 lines)
- **`run_safety_tests.js`** — add one test entry
- **`ACTIVE_MANIFEST.md`** — update safety suite count if convention requires

**Explicitly out of scope:** production code, config, docs, `.env`, arming, R15, broadcast.

---

## 12. Sign-off

| Field | Value |
|-------|-------|
| Planning complete | **yes** |
| Code changed | **no** |
| Tests changed | **no** |
| Validator changed | **no** |
| Docs changed | **no** |
| Config/`.env` changed | **no** |
| System armed | **no** |
| Runtime stub created | **no** |
| Submit/broadcast invoked | **no** |
| Position/reconciliation/capital | **none** |
| OR-20260630-008 | **not_promoted** |
| Readiness/profitability claims | **no** |
