# Signer / Reconciliation Drill Planning — 2026-07-05

Status:
**Planning complete — drill matrix defined; no drills executed, no code, no config, no runtime**

Gate type:
Doc-only drill plan for N5 (signer path validation) and N5-R / A1-D04 (reconciliation drill), per `PRE-ARMING BLOCKER STATUS REVIEW — 2026-07-05.md` §4/§8

Prerequisites:
`R16 LIVE PATH IMPLEMENTATION PLANNING — 2026-07-05.md` (§5.3–5.4) · `A1 STATE DURABILITY DRILL PLANNING — 2026-07-05.md` (D04) · `RECONCILIATION_RUNBOOK.md` · `docs/R9_WALLET_SIGNER_SECURITY_REVIEW.md`

Decision authority:
**Taylor Cheaney** — this doc plans drills; it does not authorize or execute them

Session tool:
Claude/Cowork

Live readiness achieved:
**No**

**Code changed:** **No** · **Config changed:** **No** · **Runtime processes started:** **No** · **Secrets used:** **No — none of these drills require a real signer secret**

---

## 1. Files Inspected (read-only)

| File | What was checked |
|---|---|
| `live_executor.js` | `loadSignerFromEnvForRealExecution` (L381), `signerLoaderForTest` hook, `collectLiveSubmissionGateFailures`/`assertLiveSubmissionArmed` (L2222), `submitRawTransaction` SUBMISSION_UNKNOWN path (L2343–2364), `buildReconciliationContext`/`writePendingReconciliation` (L2120+) |
| `RECONCILIATION_RUNBOOK.md` | Existing human procedure for SUBMISSION_UNKNOWN / CONFIRMATION_UNKNOWN / FILL_PARSE_UNKNOWN |
| `test_signer_guard.js`, `test_step9a_signing.js`, `test_step9b_submission.js` | Existing signer/submission test coverage to extend, not replace |
| `fake_recovery_harness.js` / `test_fake_recovery_harness.js` (A2q pattern) | Established project convention for deterministic fake-process/runtime drills — reused as the model here |
| `PRE-ARMING BLOCKER STATUS REVIEW — 2026-07-05.md` | Confirms N5 (signer) and N5-R/A1-D04 (reconciliation) are still open; A1 Critical Batch already run did **not** include D04 |

---

## 2. Purpose

Two of the ten non-negotiable pre-arming blockers (N5, and the reconciliation half of N5/A1-D04) remain open and are explicitly **not** covered by the A1 Critical Drill Batch already executed (that batch was D01+D02+D07 — clean restart, stale lock, observation idempotency — not signer or reconciliation). This gate defines what a **DRY/SIM-only** drill for each would look like, using the same fake-harness pattern already proven safe for A2's recovery drills, so that when Taylor authorizes execution there is a precise, bounded script rather than an open-ended "test the signer" instruction touching anything resembling a real secret.

**Hard constraint carried through this whole doc:** every drill here uses `signerLoaderForTest`/mocked keypairs and injected/simulated RPC responses. **None of them require `SOLANA_SIGNER_SECRET`, a funded wallet, or a real broadcast.**

---

## 3. Signer Drill Matrix (N5-S)

| # | Scenario | Mechanism | Expected outcome | Proves |
|---|---|---|---|---|
| S1 | Missing signer secret | `delete process.env.SOLANA_SIGNER_SECRET` in test | `SIGNER_LOAD_FAILED`/`REAL_PATH_DISABLED`; no submit attempted | Absence fails closed |
| S2 | Malformed JSON secret | `signerLoaderForTest` returns invalid JSON string | `SIGNER_LOAD_FAILED` at parse | Bad input fails closed, not a crash |
| S3 | Wrong-length byte array | Mocked 32-byte or 128-byte array | `SIGNER_LOAD_FAILED` (64-byte check) | Shape validation holds |
| S4 | Embedded public key mismatch | Mocked keypair with tampered last 32 bytes | `SIGNER_LOAD_FAILED` ("not a valid Ed25519 keypair") | Cryptographic self-consistency check holds |
| S5 | Wallet address mismatch | Valid mocked keypair, `cfg.walletPublicAddress` set to a different address | `WALLET_MISMATCH` | Wrong-wallet protection holds even with a technically-valid key |
| S6 | Valid mocked signer, `mode !== "LIVE"` | Any mode other than `LIVE` | Identity-only signer used; `.sign()`/`.secretKey` throw if accessed | Dry-run paths can never accidentally sign |
| S7 | Valid mocked signer, `mode === "LIVE"`, all gates pass | Full `signerLoaderForTest` mock + `assertLiveSubmissionArmed` preconditions satisfied | Reaches sign step in a **test-only** path; signed bytes zeroed after use (assert via spy) | The one path that's allowed to sign does so, and cleans up after itself |
| S8 | Secret never appears in logs/audit | Run S1–S7 with `execution_audit.jsonl` captured to a temp file | No raw secret, no raw signed bytes, no full signature in any audit row | Redaction discipline holds under drill conditions, not just static guards |

**All eight are unit/fixture-level** — no process spawn, no network call, no lock acquisition. This can run as a normal `node test_signer_drill.js` addition to the safety suite, same as existing `test_signer_guard.js`.

---

## 4. Reconciliation Drill Matrix (N5-R / A1-D04)

| # | Scenario | Mechanism | Expected outcome | Proves |
|---|---|---|---|---|
| R1 | `SUBMISSION_UNKNOWN` (HTTP timeout mid-submit) | Mock `submissionFetch` to throw an abort/timeout error | Row appended to `pending_reconciliation.jsonl` via `buildReconciliationContext`; `EXECUTION_FAILURE`/operator-required audit row; **no position written** | Submission ambiguity fails closed, matches `RECONCILIATION_RUNBOOK.md` §SUBMISSION_UNKNOWN |
| R2 | `CONFIRMATION_UNKNOWN` (poll timeout) | Mock `confirmationFetch` to never return a terminal status before `confirmationTimeoutMs` | Reconciliation row written with `CONFIRMATION_UNKNOWN` context; **no position written** | Confirmation ambiguity fails closed, matches runbook §CONFIRMATION_UNKNOWN |
| R3 | `FILL_PARSE_UNKNOWN` (confirmed tx, unparseable fill) | Mock a confirmed status with a malformed/incomplete transaction-meta shape | Reconciliation row written; position write blocked pending manual fill calculation | Matches runbook §FILL_PARSE_UNKNOWN manual-formula path |
| R4 | Reconciliation row is human-review-only, never auto-resolved | Inspect executor code paths after R1–R3 | No code path reads `pending_reconciliation.jsonl` and resumes/retries automatically | Confirms the runbook's "do not retry automatically" rule is enforced by the absence of auto-resolution code, not just convention |
| R5 | Reconciliation during an **open position** (exit-side ambiguity) | Same R1–R3 injected on `manageOpenPositions`/`executeLiveExit` instead of entry | Position remains `OPEN` (not falsely closed); reconciliation row references the existing `liveTradeId` | Exit-side ambiguity doesn't silently mark a position closed when it may still be live on-chain |
| R6 | Reconciliation + E-stop interaction | Trigger R1 while `emergencyStop` is set true mid-drill | Reconciliation row still written (the ambiguous tx already happened); no *new* entries attempted afterward | E-stop and reconciliation don't fight each other — halting new entries doesn't suppress honest reporting of an already-ambiguous prior one |

**These six are the actual content of A1-D04**, scoped specifically to the reconciliation file rather than the broader "crash/interruption" class already partially covered by A1-D03/D01.

---

## 5. What This Drill Plan Deliberately Does Not Cover

| Out of scope here | Why | Where it belongs |
|---|---|---|
| Real signer secret handling | No drill in this doc ever loads `SOLANA_SIGNER_SECRET` | **Live Submission Path Readiness Review** (later, per `LIVE READINESS PREPARATION PLANNING` LR-04) |
| Real RPC submission | All RPC calls mocked | Micro-live execution gate only |
| Process crash mid-write (torn state) | That's A1-D03, a distinct crash class already scoped separately | A1-D03 Crash/Interruption Drill |
| Wallet balance monitor freshness | Separate concern (R9) | Not this doc |
| Dashboard reconciliation panel UX | Read-path only, not a safety drill | Not this doc |

---

## 6. Execution Plan (Future — Not This Gate)

| Step | Action | Runtime? |
|---|---|---|
| 1 | Taylor authorizes drill execution (this doc + scope) | No |
| 2 | Write `test_signer_reconciliation_drill.js` implementing S1–S8, R1–R6 as fixture/mock tests | Code, no runtime |
| 3 | Run `node test_signer_reconciliation_drill.js` in isolation | No process spawn |
| 4 | Add to `run_safety_tests.js` manifest | Code |
| 5 | `node run_safety_tests.js` green before/after | No |
| 6 | Record verdict in a `SIGNER RECONCILIATION DRILL EXECUTION` receipt (same template as `A1 CRITICAL DRILL BATCH EXECUTION`) | No |

**No step in this plan touches a real key, a real RPC, or real capital.** This closes N5-S and N5-R at the same low-cost, doc/fixture tier as the A1 Critical Batch already executed for D01/D02/D07 — it does not require the heavier "controlled CRASH drill" tier reserved for A1-D03.

---

## 7. Explicit Non-Actions

| Non-action | Confirmed |
|---|---|
| Load a real signer secret | **No** |
| Modify `.env` | **No** |
| Modify `live_executor.js` | **No — test file only, at future execution gate** |
| Start runtime / loops | **No** |
| Capital exposure / arming | **No** |
| Claim live readiness | **No** |

---

## 8. Recommended Next Gate

**Signer/Reconciliation Drill Execution Authorization** — Taylor reviews S1–S8/R1–R6 and authorizes writing `test_signer_reconciliation_drill.js` (fixture-only, no secrets, no runtime).

---

## 9. Safety Confirmation

| Item | Value |
|---|---|
| `.env` opened | **No** |
| Secrets inspected | **No** |
| Code changed | **No** |
| Config changed | **No** |
| Runtime processes started | **No** |
| OR-20260630-008 status | **not_promoted** |
| Live readiness claimed | **No** |
| Capital exposure enabled | **No** |

---

*Prepared for Taylor review — 2026-07-05 (Claude/Cowork planning session).*
