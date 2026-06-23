# A1d — Stability Observation Runbook (Planning Only)

**Module:** TracktaOS Module 1 — Solana Momentum Bot
**Sprint:** 4 of 4 (Phase 1 — Structure and Recovery)
**Status:** **Planning only** — this document is a runbook; it changes no code, no config, no strategy, and no posture
**Operating constraint:** `PIPELINE_DRY_RUN` unchanged throughout; the observation runs the system exactly as it runs today

**Parent:** [A1_UNIFIED_STATE_PLAN.md](./A1_UNIFIED_STATE_PLAN.md) (state ownership & races R1–R6) · [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) (rank 1 — file races; A1 exit = "zero file races over a 24h concurrent run")
**Validates the shipped work of:** [A1A_PAPER_TRADES_OWNERSHIP_PLAN.md](./A1A_PAPER_TRADES_OWNERSHIP_PLAN.md) (R1) · [A1B_ATOMIC_CONFIG_WRITES_PLAN.md](./A1B_ATOMIC_CONFIG_WRITES_PLAN.md) (R2) · A1c ownership guards
**Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · [SPRINT_3_REVIEW.md](./SPRINT_3_REVIEW.md)

---

## 0. Scope separation (read first)

A1d is an **observation and validation** exercise. It runs the system normally for 24 hours and *checks* that the A1a/A1b/A1c ownership and atomicity changes hold under real operation. It **observes; it does not recover, restart, supervise, or change anything**.

| ID | Owns | This document? |
|----|------|----------------|
| **A1a** | Paper-trade ownership split (`paper_trades.json` append-only / `paper_positions.json` monitor-owned) | Done (shipped) — A1d validates it |
| **A1b** | Atomic `live_config.json` writes via `config_store.writeConfigAtomic` | Done (shipped) — A1d validates it |
| **A1c** | Ownership regression guards (`test_ownership_guards.js`) wired into `run_safety_tests.js` | Done (shipped) — A1d re-runs it |
| **A1d** (this doc) | **24h stability observation runbook** — pre/periodic/end checks, pass/fail criteria, artifacts, rollback | **Yes** |
| **A2** | Supervisor / recovery — restart policy, safe-mode, acting on M5 heartbeats | **No — explicitly out of scope** |
| Live authorization | Arming real capital | **No — still forbidden, unconditionally** |

> **A1d observes and validates. A2 recovers and supervises. Live authorization is a separate, later, human-gated decision.** A1d produces evidence, not permission.

**What A1d can validate (in scope):** R1 (`paper_trades.json` dual-writer) and R2 (`live_config.json` atomicity) are *resolved* and *stay* resolved under normal load.
**What A1d does not claim (out of scope):** R3 (`observation_dedup.json`), R4 (`live_positions.json`), R5 (snapshot read-during-write), R6 (multi-appender JSONL) remain open per [A1_UNIFIED_STATE_PLAN.md](./A1_UNIFIED_STATE_PLAN.md) §3.4 and belong to the future state module. A1d records that they remain single-writer and uncorrupted, but does **not** certify them atomic.

---

## 1. Mission

Validate the A1 ownership and atomicity changes under **normal `PIPELINE_DRY_RUN` operation** before any A2 (supervisor) work begins. Concretely, run Scanner + Paper Monitor + Executor (observation loop) + Wallet Monitor + Dashboard together for ~24 hours and confirm:

1. `paper_trades.json` remains **append-only** (never rewritten, prefix immutable).
2. `paper_positions.json` is **monitor-owned and mutable** (lifecycle progresses; valid JSON).
3. `live_config.json` remains **valid JSON** at all times (never torn).
4. Config writes are **atomic** (no half-written config; no orphan temp files).
5. **No temp files accumulate** (`*.tmp` are transient only).
6. `node run_safety_tests.js` remains **7/7** at start and end.
7. `node live_executor.js --status` remains **`PIPELINE_DRY_RUN` / `liveArmed: false`** throughout.
8. Dashboard **heartbeat (M5)** and **promotion (M8)** panels remain **coherent** (no false RUNNING; gates honest).
9. **No new reconciliation issues** appear (`pending_reconciliation.jsonl` does not grow unexpectedly).
10. **No JSON parse errors** appear in any process or on the dashboard.

---

## 2. Constraints (what this runbook may and may not do)

The runbook prescribes **observation only**. During the 24h window the operator must **not**:

- change code, strategy, exits, filters, thesis bounds, or the executor;
- change `PIPELINE_DRY_RUN`, `dryRunMode`, arming, or any safety gate;
- **edit `live_config.json`** (no value, no formatting) — see §16 for the single, optional, explicitly-flagged exception;
- move, rename, delete, or compress any file; create no `archive/` or `data/` folder;
- add a dependency, database, or state service;
- add or run any supervisor, auto-restart, watchdog, or retry (that is A2).

All checks are **manual operator inspections** using commands and scripts that already exist in the repo. A1d introduces no new script and writes no new code.

---

## 3. Validation matrix (target → method → pass condition)

| # | Validation target | How to observe (existing tooling) | Pass condition |
|---|-------------------|-----------------------------------|----------------|
| V1 | `paper_trades.json` append-only | Baseline copy at T0; compare prefix + line count at each checkpoint | Line count monotonically non-decreasing; first *N₀* lines byte-identical to baseline at all times |
| V2 | `paper_positions.json` monitor-owned, mutable | `ConvertFrom-Json` parse; inspect `updatedAt`, `status` transitions | Always valid JSON; `updatedAt` advances when trades close; statuses move OPEN→WIN/LOSS/TIMEOUT/NEEDS_REVIEW |
| V3 | `live_config.json` valid JSON | `Get-Content live_config.json -Raw | ConvertFrom-Json` at every checkpoint | Parses successfully every time; never empty/truncated |
| V4 | Config writes atomic | Pre-proven by `test_config_store_atomic.js` (in suite); in-run: §16 optional probe + temp hygiene (V5) | No torn config observed; (if probe run) write lands atomically with valid JSON |
| V5 | No temp files accumulate | `Get-ChildItem -Path . -Filter *.tmp` at every checkpoint | Zero (or only momentary) `*.tmp`; none persist between checkpoints |
| V6 | Safety suite 7/7 | `node run_safety_tests.js` at T0 and T+24h | `7/7 safety tests passed` both times (incl. A1a/A1b/A1c guards) |
| V7 | Posture stable | `node live_executor.js --status` at every checkpoint | `PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false`, `operationalPosture: PIPELINE_OBSERVING` every time |
| V8 | Dashboard panels coherent | Browser `http://localhost:3000` — M5 heartbeats + M8 promotion | Heartbeats reflect real liveness (HEALTHY/STALE/MISSING, no hardcoded RUNNING); promotion shows NOT READY with honest gates |
| V9 | No new reconciliation issues | `pending_reconciliation.jsonl` line count + dashboard reconciliation panel | No unexpected growth; no new unresolved ambiguous outcomes attributable to state corruption |
| V10 | No JSON parse errors | Process console output + parse sweep of all runtime JSON/JSONL | No `JSON parse error` / `SyntaxError` in any process; sweep parses every file |

---

## 4. Pre-run checklist (T-0, before starting processes)

Run from the repository root. **Confirm working directory is the repo root** (not an archive folder).

1. **Confirm clean posture:**
   ```powershell
   node live_executor.js --status
   ```
   Expect `executionMode: PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false`, `operationalPosture: PIPELINE_OBSERVING`, `emergencyStop: false`. **If any differ, STOP** — do not start the observation.

2. **Confirm safety + ownership guards pass:**
   ```powershell
   node run_safety_tests.js
   ```
   Expect `7/7 safety tests passed` including `test_paper_positions_ownership.js`, `test_config_store_atomic.js`, `test_ownership_guards.js`. **If not 7/7, STOP.**

3. **Confirm no leftover temp files before start:**
   ```powershell
   Get-ChildItem -Path . -Filter *.tmp
   ```
   Expect no output. (Patterns of interest: `live_config.json.*.tmp`, `paper_positions.json.tmp`, `live_config.json.panic-tmp`.)

4. **Capture baselines** (write these to an operator scratch note — *do not commit*):
   - `live_config.json` SHA-256:
     ```powershell
     (Get-FileHash .\live_config.json -Algorithm SHA256).Hash
     ```
   - `paper_trades.json` line count + a baseline copy for the append-only prefix check:
     ```powershell
     (Get-Content .\paper_trades.json | Measure-Object -Line).Lines
     Copy-Item .\paper_trades.json .\paper_trades.baseline.snapshot   # scratch, gitignored, delete after
     ```
   - `pending_reconciliation.jsonl` line count (0 if absent):
     ```powershell
     if (Test-Path .\pending_reconciliation.jsonl) { (Get-Content .\pending_reconciliation.jsonl | Measure-Object -Line).Lines } else { 0 }
     ```
   - `config_change_audit.jsonl` line count (to confirm it only grows on real control actions).

5. **Confirm dashboard reads (not writes):** open `http://localhost:3000` after start and confirm panels render; the dashboard must remain a pure reader (A1 §4.6).

6. **Record the start timestamp** (UTC) and the expected end time (T+24h).

---

## 5. Start commands

Use the existing launcher. Do **not** write new orchestration.

**Option A — standard launcher (recommended):**
```powershell
.\start_fomo.ps1
```
This launches Dashboard, Wallet Monitor, Scanner, Paper Monitor, and the Executor observation loop (per [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md)). It does **not** arm live trading; `PIPELINE_DRY_RUN` is preserved.

**Option B — manual, one process per terminal (if you want isolated logs):**
```powershell
node dashboard_server.js          # terminal 1  → http://localhost:3000
node wallet_monitor.js            # terminal 2
node scanner_gmgn_trending.js --watch   # terminal 3
node monitor.js                   # terminal 4
node live_executor.js --loop      # terminal 5  (observation loop; no signing/submission)
```

Immediately after start, re-run the **pre-run posture check** (`node live_executor.js --status`) once to confirm launch did not change posture.

> The goal is concurrent operation: Scanner (append), Monitor (positions store), Executor (loop), Wallet Monitor (snapshots), Dashboard (reader) all running together — the exact concurrency A1 was designed to make safe.

---

## 6. Periodic checks (every ~2–4 hours during the 24h window)

At each checkpoint, record results in the operator scratch note (timestamp each row). None of these mutate state.

1. **Posture (V7):**
   ```powershell
   node live_executor.js --status
   ```
   Confirm `PIPELINE_DRY_RUN` / `dryRunMode: true` / `liveArmed: false`.

2. **Temp-file hygiene (V5):**
   ```powershell
   Get-ChildItem -Path . -Filter *.tmp
   ```
   Expect none persisting. A `*.tmp` seen *once* mid-write is acceptable only if it is gone by the next checkpoint; a temp file that persists is a **failure** (see §9).

3. **`live_config.json` integrity (V3) + stability (V4):**
   ```powershell
   Get-Content .\live_config.json -Raw | ConvertFrom-Json | Out-Null   # must not error
   (Get-FileHash .\live_config.json -Algorithm SHA256).Hash            # compare to baseline
   ```
   The SHA should equal the T0 baseline **unless** a deliberate control action occurred (start/stop/panic) — in which case the change must have a matching `config_change_audit.jsonl` row (A3) and the file must still parse.

4. **`paper_trades.json` append-only (V1):**
   ```powershell
   (Get-Content .\paper_trades.json | Measure-Object -Line).Lines      # >= previous checkpoint
   ```
   Then confirm the prefix is unchanged (append-only signature): the first *N₀* lines (baseline count) must still byte-match `paper_trades.baseline.snapshot`. A shrink, a rewrite, or a changed prefix is a **failure**.

5. **`paper_positions.json` mutability (V2):**
   ```powershell
   Get-Content .\paper_positions.json -Raw | ConvertFrom-Json | Out-Null
   ```
   Confirm it parses, `updatedAt` is advancing over the run, and statuses transition as trades close. (Absent store early in a fresh run is acceptable — the merged view falls back to the ledger; the monitor seeds it on first cycle.)

6. **Dashboard coherence (V8):** refresh `http://localhost:3000`:
   - **M5 heartbeats:** Scanner / Executor / Wallet Monitor / Paper Monitor / Dashboard show HEALTHY (or honest STALE/MISSING if a process was intentionally not started) — never a hardcoded "RUNNING".
   - **M8 promotion checklist:** still **NOT READY FOR LIVE PROMOTION** with honest gate states.
   - Paper stats (open/wins/losses) match the merged ledger⊕positions view (no row loss, no double counting).

7. **Reconciliation (V9):**
   ```powershell
   if (Test-Path .\pending_reconciliation.jsonl) { (Get-Content .\pending_reconciliation.jsonl | Measure-Object -Line).Lines } else { 0 }
   ```
   Compare to baseline; investigate any growth.

8. **Parse sweep + error scan (V10):** scan each running process's console for `parse error` / `SyntaxError` / `Unexpected token`, and parse every runtime file:
   ```powershell
   Get-ChildItem -Path . -Filter *.json | ForEach-Object {
     try { Get-Content $_.FullName -Raw | ConvertFrom-Json | Out-Null }
     catch { Write-Warning "PARSE FAIL: $($_.Name)" }
   }
   ```
   (For `.jsonl` files, parse per line.) Any parse failure of an authoritative file is a **failure**.

> **If a check fails:** stop observing, do **not** attempt repair beyond §13 rollback, and capture the artifacts in §10–§12. A1d's job is to surface failure, not to recover from it (recovery is A2).

---

## 7. End-of-run checks (T+24h)

1. **Re-run the full safety + guard suite (V6):**
   ```powershell
   node run_safety_tests.js
   ```
   Expect `7/7 safety tests passed`. The three Sprint-4 guards must still pass against the now-exercised codebase.

2. **Final posture (V7):**
   ```powershell
   node live_executor.js --status
   ```
   Expect `PIPELINE_DRY_RUN` / `dryRunMode: true` / `liveArmed: false`.

3. **Final append-only confirmation (V1):** final line count ≥ all prior counts; prefix still matches `paper_trades.baseline.snapshot`.

4. **Final integrity sweep (V3, V10):** every runtime JSON/JSONL parses; `live_config.json` parses and (absent deliberate control actions) matches baseline SHA.

5. **Final temp-file hygiene (V5):**
   ```powershell
   Get-ChildItem -Path . -Filter *.tmp     # expect none
   ```

6. **Compare audit growth:** `config_change_audit.jsonl` grew **only** by the number of deliberate control actions taken (ideally zero in a pure observation run).

7. **Record final dashboard state** (screenshots, §12) and write the run summary (pass/fail per V1–V10).

8. **Clean up scratch:** delete `paper_trades.baseline.snapshot` and any operator scratch files (they are not committed).

---

## 8. Pass criteria (A1d succeeds when ALL hold)

- **V1** `paper_trades.json` never rewritten: line count monotonic; baseline prefix byte-identical at every checkpoint and at T+24h.
- **V2** `paper_positions.json` valid JSON throughout; lifecycle advanced (monitor-owned mutation observed); no corruption.
- **V3** `live_config.json` parsed successfully at **every** check; never torn/empty.
- **V4** No torn/partial config observed; (if §16 probe run) the write landed atomically and audit fired after the landed write.
- **V5** No `*.tmp` persisted between checkpoints.
- **V6** `run_safety_tests.js` = **7/7** at T0 and T+24h.
- **V7** `--status` = `PIPELINE_DRY_RUN` / `liveArmed: false` at every check.
- **V8** Dashboard heartbeat + promotion panels coherent and honest throughout (no false RUNNING; still NOT READY for live).
- **V9** No unexpected `pending_reconciliation.jsonl` growth; no reconciliation issue attributable to state corruption.
- **V10** Zero JSON parse errors across processes and the file sweep.

A passing run is **evidence** that A1a/A1b resolved R1/R2 under real load. It is **not** authorization to trade and **not** completion of A2.

---

## 9. Failure criteria (A1d fails / abort if ANY occur)

- `paper_trades.json` line count **decreases**, the file is **rewritten**, or its baseline **prefix changes** → R1 regression (dual-writer/rewrite).
- `paper_positions.json` becomes **invalid JSON**, is **truncated**, or stops updating while trades close.
- `live_config.json` is **ever** unparseable, empty, or truncated at a checkpoint → R2 regression (non-atomic write).
- A `*.tmp` file (`live_config.json.*.tmp`, `paper_positions.json.tmp`, `*.panic-tmp`) **persists** across checkpoints → failed/aborted atomic write not cleaned up.
- `run_safety_tests.js` is **< 7/7** at T+24h (any safety or ownership-guard regression).
- `--status` shows **anything other than** `PIPELINE_DRY_RUN` / `liveArmed: false` (posture drift) → abort immediately and investigate.
- Dashboard shows **hardcoded RUNNING** for a dead process, a **READY FOR LIVE** banner, or paper stats that don't match the merged view.
- **Any JSON parse error** on an authoritative file (`live_config.json`, `paper_trades.json`, `paper_positions.json`, `live_positions.json`).
- New **reconciliation** entries that trace to state corruption rather than genuine on-chain ambiguity.

On failure: **stop the observation, do not repair beyond §13, preserve all artifacts (§10–§12), and record the failure mode.** A2 (recovery) is the milestone that would act on this — not A1d.

---

## 10. Artifacts to inspect (during and after)

Authoritative / ledger / snapshot files at repo root (all RUNTIME LOCAL, gitignored):

| Artifact | Why it matters in A1d |
|----------|------------------------|
| `paper_trades.json` | R1 subject — must stay append-only (scanner-owned) |
| `paper_positions.json` | R1 subject — monitor-owned mutable lifecycle store |
| `live_config.json` | R2 subject — must stay valid + atomic |
| `live_positions.json` | Single-writer (executor); confirm valid JSON (atomicity = future module) |
| `observation_dedup.json` | Single-writer (executor); confirm valid JSON (atomicity = future module) |
| `scanner_health.json` | M5 heartbeat source (scanner liveness) |
| `wallet_status.json` / `rpc_health.json` | M5/A4 sources; snapshot read-during-write tolerance (R5) |
| `execution_audit.jsonl` | Executor cycle ledger; dedup/heartbeat source |
| `config_change_audit.jsonl` | A3 — should grow only on deliberate control actions |
| `live_control_events.jsonl` | Control-action ledger (start/stop/emergency) |
| `pending_reconciliation.jsonl` | V9 — must not grow unexpectedly |
| `*.tmp` (any) | V5 — must be transient only |

---

## 11. Artifacts NOT to commit

Per [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) and root `.gitignore`, **none** of the runtime artifacts are committed. Specifically do not commit:

- All runtime JSON/JSONL listed in §10 (already gitignored).
- All temp files: `live_config.json.*.tmp`, `*.json.*.tmp`, `*.panic-tmp` (gitignored).
- The operator scratch baseline `paper_trades.baseline.snapshot` and any scratch notes — delete after the run.
- Screenshots / recordings — store in the Obsidian vault or an operator log, **not** in the repo.

The **only** committable artifact from the A1d milestone is this document (and, separately, a written run report if the team chooses to keep one under `docs/` — that is a deliberate, reviewed commit, not a runtime artifact).

---

## 12. What to screenshot or record

Capture enough evidence that the run is reproducible and auditable:

1. **T0 and T+24h `--status` output** (full text) — posture proof.
2. **T0 and T+24h `run_safety_tests.js` tail** showing `7/7 safety tests passed`.
3. **Dashboard screenshots** at T0, ~midpoint, and T+24h: M5 heartbeat panel, M8 promotion checklist, paper stats, reconciliation panel, A3 config-audit card.
4. **Temp-file check output** at each checkpoint (proof of no accumulation).
5. **Append-only evidence:** the line-count series for `paper_trades.json` and the final prefix-match result.
6. **`live_config.json` SHA series** (baseline vs each checkpoint) — proof of no torn/unexpected writes.
7. **Any anomaly** (parse error console line, persisted `.tmp`, stale heartbeat) with timestamp.

Record results as a simple table (checkpoint time × V1–V10). Store evidence in the Obsidian vault / operator log per the Jarvis memory model — never in the repo as runtime data.

---

## 13. Rollback procedure

A1d is **observation only**, so "rollback" means *stopping the observation cleanly* and, if a regression was found, reverting the A1 implementation — not repairing live state in place.

1. **Stop the processes** (graceful):
   - If started via `start_fomo.ps1`, use the project's stop helper (`.\stop_fomo.ps1`, verify behavior) or close the launched terminals.
   - Manual mode: Ctrl-C each terminal.
2. **If posture ever drifted** (it must not): run the kill switch
   ```powershell
   .\panic.ps1
   ```
   (sets `emergencyStop=true`, halts processes, logs `panic_events.jsonl`). This is a safety stop, not a repair.
3. **If a state regression was confirmed** (V1/V2/V3 failure), revert the relevant A1 implementation commit:
   - A1a (paper split): follow [A1A_PAPER_TRADES_OWNERSHIP_PLAN.md](./A1A_PAPER_TRADES_OWNERSHIP_PLAN.md) §8 — revert code, run the documented lossless **fold-back** (merge `paper_positions.json` lifecycle back into `paper_trades.json` by `entryId`), then delete `paper_positions.json`.
   - A1b (atomic config): revert the A1b commit; output is byte-identical so config content is unaffected (per [A1B_ATOMIC_CONFIG_WRITES_PLAN.md](./A1B_ATOMIC_CONFIG_WRITES_PLAN.md) §3.5).
4. **Re-verify after any rollback:**
   ```powershell
   node run_safety_tests.js          # expect 7/7 (or 4/4 if guards reverted with A1c)
   node live_executor.js --status    # PIPELINE_DRY_RUN, liveArmed: false
   ```
5. **Clean scratch:** delete `paper_trades.baseline.snapshot` and any `*.tmp`.

> Rollback never re-enables live trading and never edits strategy. The system returns to `PIPELINE_DRY_RUN`, `liveArmed: false` in all cases.

---

## 14. What qualifies A1 as complete

A1 (the unified-state milestone for Phase 1) is considered **complete** when **all** of the following hold — A1d is the final evidence-gathering step:

1. **Ownership shipped:** A1a (paper split) and A1b (atomic config) implemented; A1c ownership guards in `run_safety_tests.js`. ✅ (shipped)
2. **Guards green:** `run_safety_tests.js` = **7/7**, including `test_ownership_guards.js`, `test_paper_positions_ownership.js`, `test_config_store_atomic.js`.
3. **24h observation passed:** a full A1d run meets **every** pass criterion in §8 — specifically **zero** observed file races on `paper_trades.json` and `live_config.json` (R1, R2) over the concurrent 24h window, satisfying the [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) A1 exit ("file races eliminated in a scanner + monitor + executor concurrent run").
4. **Posture intact:** `PIPELINE_DRY_RUN` / `liveArmed: false` held throughout; no strategy/gate change.
5. **Documented residue:** R3 (`observation_dedup.json`), R4 (`live_positions.json`), R5 (snapshot read-during-write), R6 (multi-appender JSONL) are explicitly recorded as **remaining, single-writer, deferred to the future state module** — A1 completion for Phase 1 covers R1/R2 (the Critical/High dual-writer + torn-config risks), with the remainder honestly carried forward.

**A1 complete unlocks A2 planning** (supervisor consuming M5 heartbeats + A1 healthy-state guarantees). It does **not** unlock live trading.

---

## 15. Explicit separation (restated)

- **A1d = observe and validate.** Run the system as-is for 24h; check the contracts; record evidence; do not change anything.
- **A2 = supervisor / recovery.** Restart STALE processes, safe-mode on config drift, act on M5 heartbeats. **Not part of A1d.** A1d may *reveal* the need for A2 (e.g., a process died and nothing restarted it) but must not implement it.
- **Live authorization = still forbidden.** A passing A1d run is structural-reliability evidence only. Arming capital remains gated on Sprint 4 completion **plus** the separate pre-live items (A5 cost model, A6 reconciliation enforcement, authorization-record signing, dashboard auth) and an explicit human decision. **No A1d outcome authorizes live trading.**

> **Ori advises. Humans authorize. Gates enforce.** A1d produces evidence for humans; it grants no permission.

---

## 16. Optional controlled atomic-write probe (use only if positive in-run proof is wanted)

Atomicity of config writes is **already proven in isolation** by `test_config_store_atomic.js` (in the 7/7 suite). During a *pure observation* run, `live_config.json` is typically **not written at all** (the executor loop does not call `saveConfig`; only control actions do). To honor "no config changes," the **default is to skip this probe** and rely on V3/V5 (integrity + temp hygiene) plus the suite.

If the operator wants positive in-situ confirmation, a **single, reversible, non-arming** toggle may be used — this is the *only* sanctioned config write during A1d and must be recorded:

```powershell
# Optional. Writes config via the atomic path; keeps dryRunMode true, never arms live.
node live_executor.js --status                 # capture before
# (perform one automation stop then start, or one start then stop, via the executor's
#  control path — NOT by hand-editing the file), then:
node live_executor.js --status                 # capture after: dryRunMode true, liveArmed false
Get-Content .\live_config.json -Raw | ConvertFrom-Json | Out-Null   # must parse
Get-ChildItem -Path . -Filter *.tmp            # must be none afterward
```

Confirm after the probe: (a) `live_config.json` parses, (b) a matching `config_change_audit.jsonl` row exists (A3 fired after the landed write), (c) `dryRunMode: true` / `liveArmed: false` unchanged, (d) no `*.tmp` persisted. **This probe changes `automationEnabled` toggle timestamps and appends audit rows** — note that net effect in the run report. If you are unsure, **do not run it**; skipping is the conservative default and does not weaken A1d's conclusion.

---

## 17. Do-not-do warnings (during the observation)

A1d, and any operator running it, must **never**:

- ❌ edit `live_config.json` by hand (use §16's executor control path only, or skip);
- ❌ change `executionMode` / `dryRunMode` / arming / any gate; ❌ set anything to LIVE;
- ❌ change strategy, exits, thesis bounds, sizes, slippage, or fees;
- ❌ start a supervisor, watchdog, auto-restart, or retry loop (that is A2);
- ❌ move, rename, delete, or compress runtime files; ❌ create `archive/` or `data/`;
- ❌ commit any runtime artifact, temp file, or scratch baseline;
- ❌ add a dependency, database, or state service;
- ❌ treat a passing run as permission to trade.

If any action requires one of the above, **stop — it is outside A1d.**

---

*A1d Stability Observation Runbook (planning only) · TracktaOS Module 1 · Phase 1 Stabilization (Sprint 4) · Validates A1a (R1) + A1b (R2) under 24h concurrent `PIPELINE_DRY_RUN` operation. A1d = observe & validate · A2 = supervisor/recovery · live authorization = still forbidden. No code, no config, no strategy, no supervisor, no dependency, no database. Act conservatively; TracktaOS stability has priority over speed.*
