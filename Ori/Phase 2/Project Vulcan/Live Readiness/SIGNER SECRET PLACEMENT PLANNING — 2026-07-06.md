# Signer Secret Placement Planning — 2026-07-06

Status:
**Planning complete — burner-wallet signer placement policy documented; no secret placed, inspected, or configured in this gate**

Gate type:
Planning / documentation only — signer secret placement policy for a future execution gate

Prerequisites:
`R13 SIGN-OFF GATE — 2026-07-06.md` · `R13 SIGN-OFF PREPARATION REVIEW — 2026-07-06.md` · `PRE-ARMING BLOCKER STATUS REVIEW — POST-A1-D05 — 2026-07-06.md` · `SIGNER RECONCILIATION FIXTURE DRILL EXECUTION — 2026-07-06.md` · `MICRO-LIVE RUNBOOK CONSOLIDATION — 2026-07-05.md` · `RUNBOOK DOCUMENTATION UPDATE — 2026-07-06.md` · `ACTIVE_MANIFEST.md`

Decision authority:
**Taylor Cheaney** (planning only — no secret handling in this gate)

Live readiness achieved:
**No**

Human soak readiness:
**Not authorized**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**Code changed:** **No** · **Config changed:** **No** · **`.env` changed:** **No** · **Secret placed:** **No** · **Secret inspected:** **No** · **Runtime processes started:** **No** · **Real RPC used:** **No** · **Real signer secrets used:** **No** · **Arming authorized:** **No** · **Micro-live execution authorized:** **No** · **Capital exposure enabled:** **No**

---

## 1. Files Inspected (read-only)

| File | Purpose |
|------|---------|
| `R13 SIGN-OFF GATE — 2026-07-06.md` | Signed waiver; recommended this gate; arming still blocked |
| `R13 SIGN-OFF PREPARATION REVIEW — 2026-07-06.md` | Separated future gates; remaining blockers |
| `PRE-ARMING BLOCKER STATUS REVIEW — POST-A1-D05 — 2026-07-06.md` | N5 real path open; signer placement not planned |
| `SIGNER RECONCILIATION FIXTURE DRILL EXECUTION — 2026-07-06.md` | S1–S8 signer guard patterns; fixture-only baseline |
| `MICRO-LIVE RUNBOOK CONSOLIDATION — 2026-07-05.md` | Caps; gate separation; operator boundaries |
| `RUNBOOK DOCUMENTATION UPDATE — 2026-07-06.md` | Arming/execution separation labels |
| `ACTIVE_MANIFEST.md` | Posture boundaries; `.env` not authoritative config file |
| `.gitignore` | Confirms `.env` / secret patterns excluded |
| `.env.example` | Documented env variable names (template only — **not opened for edit**) |
| `local_env.js` | Loads `<repo-root>/.env` with metadata-only return (no value dump) |
| `live_executor.js` | `loadSignerFromEnvForRealExecution` — `SOLANA_SIGNER_SECRET` format and wallet match rules (read-only) |

**Not opened:** `.env` (production local secrets file) · any wallet key material · `process.env` dump

---

## 2. Approved Signer Type

| Rule | Requirement |
|------|-------------|
| **Wallet class** | **Burner wallet only** — dedicated research/engineering-validation wallet |
| **Main wallet** | **Forbidden** |
| **Exchange / custodial wallet** | **Forbidden** |
| **Meaningful funds** | **Forbidden** — fund only minimal SOL needed for one capped engineering-validation session (+ fees buffer) at execution time, not in this gate |
| **Reused production / personal wallet** | **Forbidden** |
| **Secret format** | **64-byte Ed25519 keypair as JSON integer array** (matches `loadSignerFromEnvForRealExecution` in `live_executor.js`) |
| **Seed phrase / raw base58 private key text** | **Forbidden in `.env`** — convert to approved JSON byte array offline before local entry |

**Purpose alignment (R13 waiver):** Signer exists only to support **future separately authorized** engineering-validation path proof — **not** strategy deployment or scaling.

---

## 3. Planned Secret Storage Target

| Field | Planned value |
|-------|---------------|
| **Storage class** | Local-only ignored environment file |
| **Primary path (repo convention)** | `<repo-root>/.env` |
| **Loader** | `local_env.js` → `path.join(rootDir, ".env")` with `override: false` (process env wins; `.env` fills missing keys only) |
| **Template reference** | `.env.example` (committed template — never contains real secrets) |
| **Alternative paths** | **Not approved** for first placement — do not use Obsidian vault, `operator_records/*.secret.json`, chat logs, or `analysis/` artifacts for private key storage |
| **R15 signed operator records** | Separate secure path **TBD** — stores **governance sign-off**, not private key bytes |

**Prohibited destinations (never):**

- Git-tracked files (including `.env.example`, receipts, evidence JSON, Cursor/Ori notes)
- Obsidian notes / Cursor chat / Claude chat / ChatGPT / run logs
- Committed `analysis/*.json` artifacts
- Screenshots or shared drives without encryption

---

## 4. Git Ignore Status / Required Action

| Item | Status |
|------|--------|
| `.env` | **Already listed** in `.gitignore` (lines 5–6, 109) |
| `.env.*` | **Already listed** — with `!.env.example` exception |
| `SOLANA_SIGNER_SECRET*` / `*secret*` / `*private*` patterns | **Already listed** |
| **Required gitignore action in this planning gate** | **None** — existing rules sufficient for repo-root `.env` |
| **Required verification in future execution gate** | Run `git check-ignore -v .env` — must show a match; run `git status --short .env` — must **not** appear as tracked/staged |

---

## 5. Environment Variable Names (Identified — Not Set)

| Variable | Safe to name? | Role |
|----------|---------------|------|
| **`SOLANA_SIGNER_SECRET`** | **Yes** | **Primary signer secret** — 64-byte JSON array; consumed by `loadSignerFromEnvForRealExecution` |
| **`EXPECTED_WALLET_PUBLIC_ADDRESS`** | **Yes** | **Optional public cross-check** — base58 public address only; no secret |
| **`walletPublicAddress`** (`live_config.json`) | **Yes (field name)** | Must **match** derived signer public address at load time — config field, not env secret |
| **`FOMO_ENABLE_LIVE_SUBMISSION`** | **Yes** | Live arming switch — **must remain unset/blank** in placement execution gate |
| **`FOMO_ALLOW_LOOP_LIVE`** | **Yes** | Loop live switch — **must remain unset/blank** in placement execution gate |
| **`HELIUS_RPC_URL` / `SOLANA_RPC_URL`** | **Yes** | RPC endpoints — separate from signer placement; no real RPC required in placement execution gate for address-only verification |

**Env variable name identified:** **Yes** — primary secret variable is **`SOLANA_SIGNER_SECRET`**.

**This planning gate sets no env values.**

---

## 6. Safe Verification Method (Future Execution Gate)

Verification must prove **signer loads and public address matches** without exposing secret material.

| Step | Allowed | Forbidden |
|------|---------|-----------|
| **1. Preflight posture** | Confirm `PIPELINE_DRY_RUN` · `dryRunMode: true` · `liveArmed: false` · `capitalExposure: none` | LIVE mode · arming switches |
| **2. Git ignore check** | `git check-ignore -v .env` | Committing `.env` |
| **3. Local entry** | Taylor enters `SOLANA_SIGNER_SECRET` into `.env` **locally only** in execution gate | Pasting key into AI chat · screenshots |
| **4. Public address derivation** | Use existing loader path (`loadSignerFromEnvForRealExecution` with matching `walletPublicAddress` in config) or `local_signer.js` guarded read path that returns **`getPublicKey()` / `toBase58()` only** | Printing `SOLANA_SIGNER_SECRET` · printing raw env value · logging `secretKey` bytes |
| **5. Cross-check** | Compare derived public address to `live_config.json` `walletPublicAddress` and optional `EXPECTED_WALLET_PUBLIC_ADDRESS` | Storing public address mismatch silently |
| **6. No-broadcast validation** | Run read-only / no-submission checks (e.g. `r43c_local_signer_readiness.js` posture pattern, signer load guard tests, or dedicated no-broadcast preflight) | `sendTransaction` · `sendRawTransaction` · live executor `--loop` with LIVE posture |
| **7. Evidence artifact** | Record **public address only** + pass/fail + timestamp in execution receipt — **no secret fields** | Secret bytes in JSONL/JSON evidence |

**Expected failure modes (fail-closed):**

- Missing secret → `REAL_PATH_DISABLED`
- Invalid JSON / wrong length → `SIGNER_LOAD_FAILED`
- Public address ≠ `walletPublicAddress` → `WALLET_MISMATCH`

---

## 7. Secret-Handling Rules

| Rule | Requirement |
|------|-------------|
| **Who enters secret** | **Taylor only**, locally, during **Signer Secret Placement Execution** gate |
| **Where entered** | Local `.env` editor or secure local paste — **never** in AI chat |
| **Terminal discipline** | Do not `echo`, `type`, `cat`, or `Get-Content` `.env` in shared logs; avoid commands that print env values |
| **AI tools** | **No copy/paste of private key** into Cursor, Claude, ChatGPT, or Obsidian |
| **Screenshots** | **Forbidden** while `.env` or key material visible |
| **Git** | **Never** `git add .env` · verify untracked/ignored before and after |
| **File upload** | **No** uploading `.env` or key files |
| **Audit / reconciliation** | Existing `redactSecrets` must keep secrets out of JSONL rows — verify no secret in logs after verification |
| **Rotation** | If exposure suspected → remove secret from `.env` immediately · rotate burner wallet · document incident in Ori (public facts only) |

---

## 8. Future Signer Secret Placement Execution Gate — Boundaries

| Allowed in execution gate | Forbidden in execution gate |
|---------------------------|----------------------------|
| Create or update **ignored** local `.env` with `SOLANA_SIGNER_SECRET` | Arming (`liveArmed true`) |
| Set **`EXPECTED_WALLET_PUBLIC_ADDRESS`** (public only) if used | `FOMO_ENABLE_LIVE_SUBMISSION=YES` |
| Update **`live_config.json` `walletPublicAddress`** to match burner public address (if not already set) — **public field only** | `FOMO_ALLOW_LOOP_LIVE=YES` |
| Verify **derived public address only** | `executionMode LIVE` · `dryRunMode false` |
| Run **no-broadcast** signer load / readiness checks | Real RPC **broadcast** / transaction submit |
| Record execution receipt with **public address hash/check only** | Micro-live execution |
| Confirm `.env` git-ignored and not staged | Capital exposure |
| | Secret in evidence JSON / run log / chat |

**Relationship to R13 waiver:** Placement execution closes **signer secret placement planned** blocker only — **does not** authorize arming, micro-live, or capital.

---

## 9. Future Abort Criteria (Execution Gate)

Abort immediately if any of the following occurs:

| # | Abort condition |
|---|-----------------|
| **1** | Private key appears in stdout, stderr, logs, audit rows, or evidence artifacts |
| **2** | Raw `SOLANA_SIGNER_SECRET` value printed or pasted into AI chat |
| **3** | `.env` is **not** ignored by git (`git check-ignore` fails) |
| **4** | `.env` appears staged or tracked in `git status` |
| **5** | Derived public address ≠ `live_config.json` `walletPublicAddress` |
| **6** | `EXPECTED_WALLET_PUBLIC_ADDRESS` set and mismatches configured wallet |
| **7** | File permissions unsafe (world-readable secret file on shared/multi-user host — tighten to owner-only) |
| **8** | `executionMode` LIVE detected |
| **9** | `dryRunMode: false` detected |
| **10** | `liveArmed: true` detected |
| **11** | `FOMO_ALLOW_LOOP_LIVE=YES` detected |
| **12** | `FOMO_ENABLE_LIVE_SUBMISSION=YES` set during placement gate |
| **13** | `capitalExposure` not `none` |
| **14** | Real RPC broadcast attempted |
| **15** | Any secret exposure in logs or artifacts |
| **16** | Main/exchange/high-value wallet used instead of approved burner |

On abort: remove or blank `SOLANA_SIGNER_SECRET` from `.env` if partially written; document abort receipt (no secret content); **do not** claim signer placement complete.

---

## 10. Relationship to Remaining Blockers

| Blocker | After this planning gate | After future execution gate (if PASS) |
|---------|--------------------------|----------------------------------------|
| **Signer secret placement planned** | **Closed** (this gate) | N/A |
| **Signer secret placement executed** | **Open** | **Closed** if execution PASS |
| **Real signer/RPC path** | **Open** | Partial — load proven; broadcast still separate |
| **R15 secure storage (signed records)** | **TBD** | Unchanged — not same as `.env` |
| **RB-G9 structured storage** | **TBD** | Unchanged |
| **Arming / micro-live / capital** | **Not authorized** | **Not authorized** |

---

## 11. Recommended Next Gate

**Signer Secret Placement Execution**

---

## 12. Explicit Non-Actions (This Gate)

| Non-action | Confirmed |
|------------|-----------|
| Private key requested in chat | **No** |
| Private key pasted into chat | **No** |
| Private key printed/logged | **No** |
| `.env` opened for editing | **No** |
| Secret inspected | **No** |
| `process.env` dumped | **No** |
| Code / config / `.env` modified | **No** |
| Runtime / real RPC / real signer use | **No** |
| Arming / micro-live / capital | **No** |
| OR promotion | **No** |
| Live / soak / strategy readiness claims | **No** |

---

## 13. Safety Confirmation

| Item | Value |
|------|-------|
| Private key requested in chat | **No** |
| Private key pasted into chat | **No** |
| Private key printed/logged | **No** |
| `.env` opened for editing | **No** |
| Secrets inspected | **No** |
| `process.env` dumped | **No** |
| `executionMode` LIVE set | **No** |
| `dryRunMode` false set | **No** |
| `liveArmed` true set | **No** |
| `FOMO_ALLOW_LOOP_LIVE=YES` set | **No** |
| Runtime processes started | **No** |
| Real RPC used | **No** |
| Real signer secrets used | **No** |
| OR-20260630-008 status | **not_promoted** |
| Promotion authorized | **No** |
| Live readiness claimed | **No** |
| Human soak readiness claimed | **No** |
| Strategy readiness claimed | **No** |
| Capital exposure enabled | **No** |

---

**Planning authority:** Signer Secret Placement Planning gate (2026-07-06) · documentation only; no secret handling
