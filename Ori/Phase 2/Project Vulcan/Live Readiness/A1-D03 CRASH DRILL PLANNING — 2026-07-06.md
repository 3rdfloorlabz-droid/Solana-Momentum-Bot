# A1-D03 Crash Drill Planning — 2026-07-06

Status:
**Planning complete — no crash drill executed, no runtime, no readiness claim**

Gate type:
Doc-only A1-D03 crash/interruption drill plan (supersedes generic A1-D03 row in `A1 STATE DURABILITY DRILL PLANNING — 2026-07-05.md` for execution detail)

Prerequisites:
`PRE-ARMING BLOCKER STATUS REVIEW — POST-A1-D04 — 2026-07-06.md` · `A1 STATE DURABILITY DRILL PLANNING — 2026-07-05.md` · `A1 CRITICAL DRILL BATCH EXECUTION — 2026-07-05.md` · `A1-D04 RECONCILIATION DRILL EXECUTION — 2026-07-06.md` · `RECONCILIATION_RUNBOOK.md` · `R16 IMPLEMENTATION VERIFICATION REVIEW — 2026-07-06.md` · `N6 E-STOP DRILL EXECUTION — 2026-07-06.md` · `ACTIVE_MANIFEST.md`

Live readiness achieved:
**No**

Human soak readiness:
**Not authorized**

OR-20260630-008:
**not_promoted** (unchanged)

**Code changed:** **No** · **Config changed:** **No** · **Runtime processes started:** **No** · **Drill executed:** **No** · **Real RPC used:** **No** · **Real signer secrets used:** **No**

Credit conservation:
No observation, no crash tests, no production `--loop` interruption in this gate. Defines the **smallest safe future A1-D03 path** only.

---

## 1. Files Inspected (read-only)

| File | Purpose |
|------|---------|
| `PRE-ARMING BLOCKER STATUS REVIEW — POST-A1-D04 — 2026-07-06.md` | A1-D03 highest technical tear-risk; N4 partial status |
| `A1 STATE DURABILITY DRILL PLANNING — 2026-07-05.md` | Original A1-D03 row; Tier B arming requirement |
| `A1 CRITICAL DRILL BATCH EXECUTION — 2026-07-05.md` | Temp-root harness pattern (`scripts/a1_critical_drill_batch.js`); D01/D02/D07 residuals |
| `A1-D04 RECONCILIATION DRILL EXECUTION — 2026-07-06.md` | Fixture drill evidence pattern; reconciliation abort matrix |
| `RECONCILIATION_RUNBOOK.md` | Operator actions after ambiguous outcomes |
| `R16 IMPLEMENTATION VERIFICATION REVIEW — 2026-07-06.md` | Confirm-before-write; pending blocks entries |
| `N6 E-STOP DRILL EXECUTION — 2026-07-06.md` | Preflight/postflight; production hash unchanged pattern |
| `ACTIVE_MANIFEST.md` | Atomic store ownership; lock TTL; authoritative file list |
| `config_store.js` | Atomic write: temp → fsync → validate → rename |
| `live_positions_store.js` | Atomic `live_positions.json` writes |
| `observation_dedup_store.js` | Atomic `observation_dedup.json` writes (referenced via manifest) |
| `executor_singleton_guard.js` | Lock acquire/refresh/release; 3 min stale TTL |
| `scripts/a1_critical_drill_batch.js` | Isolated temp `TRACKTA_RUNTIME_ROOT` loop + SIGTERM pattern |
| `test_a1_d04_reconciliation_drill.js` | Fixture temp-root + mocked RPC/signer drill model |

**Not opened:** `.env` · production secrets · live signer material

---

## 2. Drill Objective (Future A1-D03 Execution)

Prove that **crash-class interruption** during critical state windows does **not** leave:

1. **Torn authoritative state** — all atomic JSON stores remain parse-valid; no truncated arrays/objects
2. **Duplicate executor ownership** — at most one valid `--loop` owner after recovery; lock semantics honest
3. **Silent position corruption** — `live_positions.json` not partially written; no phantom OPEN/CLOSED rows from tear
4. **Unrecoverable ambiguity** — where R16/A1-D04 rules apply, reconciliation artifact exists or state remains safely pre-write (no silent capital posture drift)
5. **Persistent hygiene failure** — no orphaned `*.tmp` files; posture remains `PIPELINE_DRY_RUN` · `dryRunMode: true` · `liveArmed: false` · `capitalExposure: none`

**Relationship to prior drills:**

| Prior evidence | What A1-D03 adds |
|----------------|-------------------|
| A1-D01/D02 batch (temp) | Graceful stop + stale lock — **not** mid-write crash |
| A1-D04 fixture PASS | Reconciliation on **ambiguous outcome** — **not** store tear under kill |
| R16 mocked coupling | Confirm-before-write logic — **not** durability under process death |
| `test_*_atomic.js` guards | Unit-level atomic write — **not** end-to-end mid-cycle kill |

**N4 target:** Move A1-D03 from **open** → **partial / fixture proven** (Tier 1) → optional Tier 2/3 later.

---

## 3. Drill Tiers

| Tier | Scope | Allowed | Forbidden (all tiers) |
|------|-------|---------|------------------------|
| **Tier 1 — Fixture simulated crash** | Temp `TRACKTA_RUNTIME_ROOT` only; injected interruption hooks or harness-level simulated kill **during** targeted write windows; mocked pipeline/RPC/signer (same class as A1-D04) | New fixture test file e.g. `test_a1_d03_crash_drill.js`; machine evidence JSON; parse/tmp sweeps | Production root mutation · real RPC · real signer secrets · LIVE mode · capital · arming |
| **Tier 2 — Isolated dry-run process interruption** | Temp `TRACKTA_RUNTIME_ROOT`; real child `live_executor.js --loop` (and optional monitor) **under temp root only**; `SIGKILL`/`Stop-Process -Force` at timed windows; production config hash unchanged | Extend `scripts/a1_d03_crash_drill.js` or batch harness; ≤30 min authorized window | Production `--loop` · production authoritative store writes · scanner on production root without separate auth |
| **Tier 3 — Production-root dry-run interruption** | Production repo root stores; `PIPELINE_DRY_RUN` only; short `--loop` interrupt | **Only if Taylor separately authorizes** in a dedicated gate after Tier 1 (+ optionally Tier 2) PASS | LIVE · `dryRunMode: false` · `liveArmed: true` · capital · real signer/RPC · `.env` edits |

**Tier sequencing (mandatory):**

1. **Tier 1 first** — lowest blast radius; validates store/lock/reconciliation durability semantics in fixture harness
2. **Tier 2 second** — only after Tier 1 PASS + **A1-D03 Crash Drill Authorization** for Tier 2 scope
3. **Tier 3 last** — separate authorization gate; never bundled with Tier 1/2

**All tiers:** `executionMode` must not be LIVE · `dryRunMode: true` · `liveArmed: false` · `FOMO_ALLOW_LOOP_LIVE` unset · `capitalExposure: none`

---

## 4. Candidate Crash Windows

Six windows ordered by **risk priority** (W4/W6 highest tear concern; W1 lowest):

| Window ID | Critical phase | Primary stores touched |
|-----------|----------------|------------------------|
| **W1** | After quote/pass but before submit | In-memory pipeline state; optional audit append; no position write yet |
| **W2** | After submit fixture but before confirmation classification | Submission context; audit; pending reconciliation path may open |
| **W3** | After confirmed fixture but before position write | Pre-write validation complete; `live_positions.json` not yet mutated |
| **W4** | During `live_positions.json` atomic write | `live_positions.json` + possible `*.tmp` |
| **W5** | During `pending_reconciliation.jsonl` append | JSONL append + audit |
| **W6** | During lock ownership / heartbeat update | `executor_singleton.lock.json` + possible `*.tmp` |

---

## 5. Per-Window Plan

### W1 — After quote/pass, before submit

| Field | Definition |
|-------|------------|
| **Preconditions** | Temp root seeded; `PIPELINE_DRY_RUN`; mocked quote/build/sim pass; no OPEN position write in flight |
| **Procedure summary** | Tier 1: inject crash hook after pipeline guard pass, before submit/sign. Tier 2: SIGKILL executor child after mocked or dry-run quote cycle reaches pre-submit stall point |
| **Evidence expected** | Preflight posture; before/after hashes for `live_config.json`, `live_positions.json`, `observation_dedup.json`; audit tail; tmp sweep; lock status |
| **Pass criteria** | All authoritative JSON parse; `live_positions.json` unchanged or valid empty array; no persistent `*.tmp`; no duplicate lock owners after restart; posture DRY/unarmed |
| **Fail/abort criteria** | Any parse error; posture drift; persistent tmp; duplicate `--loop` ownership |
| **Risk if skipped** | Low direct tear (no position write window) — but validates clean abort without orphan pipeline state |

### W2 — After submit fixture, before confirmation classification

| Field | Definition |
|-------|------------|
| **Preconditions** | Mocked submit returns tx sig; confirmation polling not yet classified; R16 confirm-before-write path active |
| **Procedure summary** | Tier 1: crash after mocked `submitRawTransaction` success, before confirmation resolution. Tier 2: kill child during confirmation wait (mocked RPC) |
| **Evidence expected** | W1 evidence set + `pending_reconciliation.jsonl` line count; reconciliation row if ambiguity path fires; no position write |
| **Pass criteria** | No OPEN position added; reconciliation row valid if present (`operatorActionRequired: true`); stores parse; no auto-resolution (A1-D04 regression) |
| **Fail/abort criteria** | Position written on ambiguous pre-confirm crash; torn JSONL; missing reconciliation when executor would have classified ambiguity |
| **Risk if skipped** | Silent partial submit state; duplicate retry on restart |

### W3 — After confirmed fixture, before position write

| Field | Definition |
|-------|------------|
| **Preconditions** | Mocked confirmation success; R16 `completeLiveSwapFromPipeline` reached; position write not committed |
| **Procedure summary** | Tier 1: hook crash immediately before `writeLivePositionsStateAtomic`. Tier 2: kill during dry-run success path pre-write (mocked fill) |
| **Evidence expected** | W1 set + confirmation audit stages; position count before/after |
| **Pass criteria** | **No position write** or prior valid state preserved; no torn partial array in `live_positions.json` |
| **Fail/abort criteria** | Partial OPEN row; torn positions file; capitalExposure drift |
| **Risk if skipped** | **High** — closest to silent capital-state corruption class (mitigated while dry-run, still Tier B blocker) |

### W4 — During position write

| Field | Definition |
|-------|------------|
| **Preconditions** | Tier 1: test hook wraps `writeLivePositionsStateAtomic` mid-rename. Tier 2: timed kill while temp positions file exists |
| **Procedure summary** | Interrupt during atomic replace of `live_positions.json` (see `live_positions_store.js`) |
| **Evidence expected** | Full tmp sweep; SHA-256 or parse of `live_positions.json`; list `*.tmp` in runtime root |
| **Pass criteria** | **Either** pre-crash valid file **or** complete post-crash valid file; **no** persistent `*.tmp`; no torn JSON (truncated array, half object) |
| **Fail/abort criteria** | Persistent `*.tmp`; unparseable `live_positions.json`; half-written content readable as corrupt JSON |
| **Risk if skipped** | **Highest tear-risk** — direct path to corrupted live positions at future arming |

### W5 — During reconciliation artifact append

| Field | Definition |
|-------|------------|
| **Preconditions** | Ambiguous outcome path active (SUBMISSION_UNKNOWN / CONFIRMATION_UNKNOWN / FILL_PARSE_UNKNOWN class); append to `pending_reconciliation.jsonl` in flight |
| **Procedure summary** | Tier 1: inject crash mid-`appendJsonl` to pending file. Tier 2: kill during reporting path after mocked ambiguity |
| **Evidence expected** | Pending file line-by-line parse; prior lines preserved; audit secret-free sweep |
| **Pass criteria** | Existing lines unchanged; new line either wholly absent or wholly valid JSONL row; no corrupt trailing bytes; append-only semantics |
| **Fail/abort criteria** | Truncated last line; interleaved garbage; secret material in row |
| **Risk if skipped** | Operator loses ambiguity evidence; false "no pending reconciliation" on restart |

### W6 — During lock ownership / heartbeat update

| Field | Definition |
|-------|------------|
| **Preconditions** | `--loop` child holds lock under temp root (Tier 2) or harness simulates refresh (Tier 1) |
| **Procedure summary** | Interrupt during `executor_singleton.lock.json` atomic refresh (`executor_singleton_guard.js`) |
| **Evidence expected** | Lock JSON parse; `instanceId`, `pid`, `updatedAt`; stale classification after kill; duplicate acquire attempt |
| **Pass criteria** | Lock parse-valid or absent; after TTL or hygiene, fresh acquire succeeds; **no** dual active loop; authoritative stores parse |
| **Fail/abort criteria** | Corrupt lock JSON; two live `--loop` owners; lock deleted while process still running (Tier 2 operator error) |
| **Risk if skipped** | Duplicate executor loops; false runtime-health lock signals |

---

## 6. Minimum Evidence Artifacts (Future Execution Gate)

| # | Artifact | Content |
|---|----------|---------|
| 1 | **Preflight posture snapshot** | Production + harness `executionMode`, `dryRunMode`, `liveArmed`, `capitalExposure`; `FOMO_ALLOW_LOOP_LIVE`; OR-20260630-008 `not_promoted` |
| 2 | **Before/after state hashes** | SHA-256 for `live_config.json`, `live_positions.json`, `observation_dedup.json`, lock file (production hash must be unchanged post-Tier 1/2) |
| 3 | **Lock/heartbeat evidence** | Lock JSON before crash / after recovery; `isExecutorLockStale`; duplicate ownership check |
| 4 | **JSON parse sweep** | All authoritative files in runtime root + line-by-line JSONL (`live_trades.jsonl`, `execution_audit.jsonl`, `pending_reconciliation.jsonl`, `pipeline_candidates.jsonl`) |
| 5 | **Tmp-file sweep** | List all `*.tmp` under runtime root — **must be empty** after recovery |
| 6 | **Reconciliation/audit artifact** | Line counts; sample rows; secret-free confirmation |
| 7 | **Duplicate ownership check** | At most one `--loop` child; lock `pid` matches live process or stale-only |
| 8 | **Post-recovery posture snapshot** | `--status` or harness equivalent; DRY/unarmed/no-capital |
| 9 | **`run_safety_tests.js` result** | **If practical** after any new test manifest entry — must remain green |
| 10 | **Machine JSON** | e.g. `analysis/a1_d03_crash_drill_evidence.json` with per-window PASS/FAIL, tier, tmpRoot, timestamps |
| 11 | **Ori execution receipt** | `A1-D03 CRASH DRILL EXECUTION — YYYY-MM-DD.md` |

**Regression checks to include in execution gate:**

- A1-D04 behaviors unchanged (no auto-resolution; pending blocks entries; ambiguous entry no position write)
- N6 e-stop interlock not regressed (fixture spot-check optional)

---

## 7. Pass / Fail Criteria (Future Execution — All Tiers)

### Overall PASS

- All **authorized windows** for the tier PASS
- Production `live_config.json` hash unchanged (Tier 1/2)
- Temp root cleaned up
- Safety suite green if manifest updated
- No abort criterion triggered

### Overall FAIL

- Any authorized window FAIL
- Any abort criterion triggered
- Unexplained production posture drift

### Per-window PASS (summary)

| Check | Requirement |
|-------|-------------|
| Parse integrity | Zero parse errors on authoritative stores |
| Tmp hygiene | No persistent `*.tmp` after recovery |
| Position integrity | No torn `live_positions.json`; no silent OPEN on pre-write crashes (W2/W3) |
| Lock integrity | No duplicate ownership; lock parse-valid or safely stale |
| Reconciliation | Append-only; valid JSONL lines; A1-D04 semantics preserved |
| Posture | `PIPELINE_DRY_RUN` · `dryRunMode: true` · `liveArmed: false` · `capitalExposure: none` |

---

## 8. Abort Criteria (Future A1-D03 Execution — Immediate Stop)

| # | Condition | Action |
|---|-----------|--------|
| 1 | Production `executionMode` LIVE detected | **ABORT** — do not proceed |
| 2 | `dryRunMode: false` detected | **ABORT** |
| 3 | `liveArmed: true` detected | **ABORT** |
| 4 | `FOMO_ALLOW_LOOP_LIVE=YES` detected | **ABORT** |
| 5 | `capitalExposure` not `none` | **ABORT** |
| 6 | Real signer secret access | **ABORT** |
| 7 | Real RPC broadcast | **ABORT** |
| 8 | Production `--loop`/scanner touched without Tier 3 authorization | **ABORT** |
| 9 | Torn/corrupt authoritative state (unparseable JSON) | **ABORT** — document; do not "repair" silently in drill |
| 10 | Duplicate executor ownership (dual active loop) | **ABORT** |
| 11 | Missing reconciliation artifact when ambiguity path expected (W2/W5) | **ABORT** |
| 12 | Persistent `*.tmp` files after recovery window | **ABORT** |
| 13 | Secret exposure in audit/reconciliation rows | **ABORT** |
| 14 | Unexpected `recovery_actions.jsonl` appears in production root | **ABORT** — document pre-existing vs drill-caused |
| 15 | Production config hash changed (Tier 1/2) | **ABORT** |

---

## 9. Recommended Execution Split

**Decision:** **Split into Authorization → Tier 1 Execution → (later) Tier 2 → (later) Tier 3**

| Gate | Purpose | Runtime? |
|------|---------|----------|
| **A1-D03 Crash Drill Planning** | This document | **No** |
| **A1-D03 Crash Drill Authorization** | Taylor bounded scope for Tier 1 (and explicitly not Tier 2/3 unless listed) | **No** |
| **A1-D03 Tier 1 Fixture Crash Drill Execution** | W1–W6 in temp harness; fixture hooks + parse/tmp sweeps | **Yes — temp only** |
| **A1-D03 Tier 2 Isolated Process Crash Drill Execution** | Separate authorization; temp-root SIGKILL windows | **Yes — temp only** |
| **A1-D03 Tier 3 Production-Root Crash Drill Execution** | Separate authorization; highest care | **Yes — prod root DRY only** |

**Not recommended:** Single combined execution gate covering Tier 1 + Tier 2 + Tier 3 — violates one-gate-at-a-time and blast-radius control.

**Tier 1 minimum window set for first execution:** **W4, W6, W3, W5** (highest tear-risk first), then W2, W1 if time budget allows in same gate.

**Harness pattern:** Reuse A1-D04 fixture model (`TRACKTA_RUNTIME_ROOT` temp, synthetic keypairs, mocked RPC) + A1 batch temp loop pattern (`scripts/a1_critical_drill_batch.js`) for Tier 2 only.

---

## 10. Relationship to N4 / LR-05 / Arming

| Item | After this planning gate |
|------|--------------------------|
| **A1-D03** | **Planned** — not executed |
| **N4** | **Partial** — unchanged until Tier 1 execution PASS |
| **LR-05** | **Partial** — drill path defined for highest open technical item |
| **Arming** | **Still blocked** — N8 + N4 remainder + real-path proofs |
| **A1-D04** | **Fixture proven** — A1-D03 must not regress reconciliation semantics |
| **A1-D05** | **Open** — parallel track; not blocked by this plan |

---

## 11. Explicit Non-Actions (This Gate)

| Non-action | Confirmed |
|------------|-----------|
| Execute A1-D03 crash drill | **No** |
| Kill/interrupt production scanner/executor | **No** |
| Start scanner/executor loops | **No** |
| Modify code / config / `.env` | **No** |
| Use real RPC / real signer secrets | **No** |
| Enable live / arming / capital | **No** |
| R13 sign-off / OR promotion | **No** |
| Claim live/soak readiness | **No** |

---

## 12. Recommended Next Gate

**A1-D03 Crash Drill Authorization**

---

## 13. Safety Confirmation

| Item | Value |
|------|-------|
| `.env` opened | **No** |
| Secrets inspected | **No** |
| `process.env` dumped | **No** |
| `executionMode` LIVE set | **No** |
| `dryRunMode` false set | **No** |
| `liveArmed` true set | **No** |
| `FOMO_ALLOW_LOOP_LIVE=YES` set | **No** |
| Runtime processes started | **No** |
| Drill executed | **No** |
| Real RPC used | **No** |
| Real signer secrets used | **No** |
| R13 sign-off performed | **No** |
| Arming authorized | **No** |
| Micro-live execution authorized | **No** |
| OR-20260630-008 status | **not_promoted** |
| Promotion authorized | **No** |
| Live readiness claimed | **No** |
| Human soak readiness claimed | **No** |
| Capital exposure enabled | **No** |

---

**Planning authority:** A1-D03 Crash Drill Planning gate (2026-07-06)
