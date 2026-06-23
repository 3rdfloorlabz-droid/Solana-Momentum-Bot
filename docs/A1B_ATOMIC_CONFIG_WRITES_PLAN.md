# A1b — Atomic `live_config.json` Writes Plan (Planning Only)

**Module:** TracktaOS Module 1 — Solana Momentum Bot
**Sprint:** 4 of 4 (Phase 1 — Structure and Recovery)
**Status:** **Planning only** — no code, no config edits, no migration
**Operating constraint:** `PIPELINE_DRY_RUN` unchanged; this milestone changes no config values and no runtime behavior

**Parent:** [A1_UNIFIED_STATE_PLAN.md](./A1_UNIFIED_STATE_PLAN.md) (race **R2** — non-atomic + multi-writer `live_config.json`) · [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) (rank 1 — file races)
**Preserves:** [A3_CONFIG_CHANGE_AUDIT_PLAN.md](./A3_CONFIG_CHANGE_AUDIT_PLAN.md) (config change audit) · **Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)

---

## 0. Scope separation (read first)

| ID | Owns | This document? |
|----|------|----------------|
| **A1b** (this doc) | **Atomic `live_config.json` writes** — make every config write temp-write → validate → atomic rename, single shared strategy | **Yes** |
| **A3** | **Config change audit** — `config_change_audit.jsonl` (old→new, actor, reason, risk) | Preserved unchanged |
| **A1a** | Paper trade ownership split (`paper_trades.json` / `paper_positions.json`) | Done (shipped) |
| **A2** | Supervisor / recovery — restart, safe-mode | No |
| **Future state module** | Broader unified state (`live_positions.json`, `observation_dedup.json`, ledgers) | No |

A1b changes **only how `live_config.json` is written** (atomicity + integrity). It does **not** change *what* is written, *when* audit fires, any config value, strategy, execution behavior, `PIPELINE_DRY_RUN`, or arming. It adds no dependency, no database, no supervisor, and moves no archive. This document produces **only** `docs/A1B_ATOMIC_CONFIG_WRITES_PLAN.md`.

> **A1b makes the write safe. A3 records the change. A2 supervises the process. The broader state module unifies everything else.** These stay separate.

---

## 1. Mission

Resolve A1 race **R2**: `live_config.json` is written **non-atomically** by JS writers (`fs.writeFileSync` full overwrite) while being read by every process, and is written by **multiple** code paths with **mixed atomicity** (PowerShell paths are already atomic; JS paths are not). A crash or concurrent read mid-write can leave a **truncated/torn config** — a capital-safety hazard because every gate reads this file.

A1b defines a **single shared atomic write strategy** (temp-write → integrity-validate → atomic rename) applied uniformly to all JS writers, matching the contract the PowerShell scripts already use — **without changing any value or behavior**.

---

## 2. Inspection findings — every `live_config.json` write path

Enumerated from source on 2026-06-22.

| # | Writer | Mechanism (today) | Atomic? | A3 audit today | Notes |
|---|--------|-------------------|---------|----------------|-------|
| 1 | `live_executor.js` `saveConfig(cfg)` (L1019) — used by `startAutomation` (L2795+), `stopAutomation`, `emergencyStopControl` | `fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg,null,2)+"\n")` | **No** | Yes — `auditConfigChange()` **after** `saveConfig`, plus `live_control_events.jsonl` | The central JS write point; 3 control functions route through it |
| 2 | `emergency_stop.js` `emergencyStop()` (L24) | direct `fs.writeFileSync(CONFIG_FILE, …)` | **No** | No (control-event append only) | Standalone kill-switch script; does **not** require `live_executor` |
| 3 | `reset_live_safety.js` (L46) | direct `fs.writeFileSync(CONFIG_FILE, …)` | **No** | Yes — already `require("./live_executor")` and calls `auditConfigChange()` after write | Clears emergency stop; forces `dryRunMode:true`, automation off |
| 4 | `panic.ps1` `Write-ConfigAtomically` | temp (`live_config.json.panic-tmp`) → `ConvertFrom-Json` validate → `Move-Item -Force` | **Yes** | Yes — `panic_events.jsonl` + `config_change_audit.jsonl` (A3) | Already atomic + validated |
| 5 | `reset_after_panic.ps1` `Write-ConfigAtomically` | temp → validate → `Move-Item -Force` | **Yes** | Yes — `panic_events.jsonl` + `config_change_audit.jsonl` (A3) | Already atomic + validated |
| 6 | `dashboard_server.js` | **none** — calls `liveExecutor.startAutomation/stopAutomation/emergencyStopControl` in-process | n/a (via #1) | via #1 | **Confirmed not a direct config writer** (reads only) |

### 2.1 Atomic vs non-atomic summary

- **Atomic today:** PowerShell writers (#4, #5) — temp file, JSON re-parse validation, `Move-Item -Force` replace.
- **Non-atomic today:** all JS writers (#1 `saveConfig`, #2 `emergency_stop.js`, #3 `reset_live_safety.js`) — plain full-file `writeFileSync`, no temp, no validation, no atomic rename.

The fix is to bring the three JS writers up to the PowerShell standard.

### 2.2 How A3 audit is emitted relative to the write

Order today (control functions and `reset_live_safety.js`):

```
load cfg → snapshot `before` → mutate cfg → saveConfig(cfg)  → auditConfigChange({before, cfg})  → control-event log
                                              (the write)        (A3, after write)
```

A3's `auditConfigChange()` diffs **in-memory** `before` vs `cfg` objects — it does **not** read the file. Therefore the write *mechanism* (plain vs atomic) is **independent** of audit content. A1b can make the write atomic with **zero change** to what A3 records or when. The only invariant to preserve: **audit fires after a successful write** (so a failed/aborted write produces no audit, consistent with "nothing changed").

---

## 3. Proposed design

### 3.1 Single shared atomic config write strategy

Introduce one shared helper (mirroring the A1a `paper_positions_store.js` pattern) so there is exactly one implementation of the atomic write contract:

- **New module: `config_store.js`** (root) — tiny, dependency-free, exporting `writeConfigAtomic(cfg, file = CONFIG_FILE)`.
- `live_executor.js` `saveConfig()` **delegates** to `config_store.writeConfigAtomic()` (its 3 control functions inherit atomicity automatically; their before/after/audit logic is untouched).
- `emergency_stop.js` and `reset_live_safety.js` call `config_store.writeConfigAtomic()` instead of `fs.writeFileSync`. (`reset_live_safety.js` already `require`s `live_executor`; either it requires `config_store` directly or uses an exported `saveConfig`. Direct `require("./config_store")` keeps the kill-switch/reset path lightweight and avoids pulling the full executor into `emergency_stop.js`.)
- **PowerShell writers (#4, #5) stay as-is** — already atomic and validated. A1b documents them as the reference contract; optionally (low priority) factor their duplicated `Write-ConfigAtomically` into a shared `.ps1` include later. No PS change is required for A1b correctness.

### 3.2 The atomic write sequence (`writeConfigAtomic`)

1. **Serialize** `cfg` to the **exact same format used today** — `JSON.stringify(cfg, null, 2) + "\n"` (2-space indent, trailing newline). This guarantees byte-for-byte parity with the current writer (no formatting churn, no behavior change).
2. **Write temp file** alongside the target on the same filesystem/volume (so rename is atomic): `live_config.json.<pid>.<rand>.tmp`.
3. **Flush** the temp file to disk (`fs.fsyncSync` on the open fd) for durability (optional but recommended; matches "config must survive restart" durability in A1).
4. **Validate before replace:** re-read the temp file and `JSON.parse` it. If it does not parse (or is empty), **abort**: delete temp, leave original untouched, throw. This mirrors the PowerShell `ConvertFrom-Json` validation.
5. **Atomic rename** temp → `live_config.json` (`fs.renameSync`; on Windows libuv maps to `MoveFileEx` with replace-existing, i.e. atomic replace; on POSIX `rename(2)` is atomic).
6. **Cleanup on any error:** remove the temp file; the original `live_config.json` is never partially written.

### 3.3 Validation scope (integrity only — NOT enforcement)

A1b validates **structural integrity only** (the bytes re-parse as JSON), exactly like the PowerShell scripts. It does **not** add semantic gates (e.g., rejecting `positionSizeSol > 0.10`) — those already live in `loadConfig()` / `readinessChecks()` and are **out of A1b scope**. A1b must never reject a write based on values; that would change behavior and belongs to gates, not the writer.

### 3.4 Temp-file naming

- JS: `live_config.json.<pid>.<rand>.tmp` (unique per writer/invocation → no temp collision even in the unlikely concurrent-writer case).
- PS (existing, unchanged): `live_config.json.panic-tmp`.
- Distinct namespaces ⇒ JS and PS temp files never collide. All temp files are RUNTIME LOCAL; add `live_config.json.*.tmp` to `.gitignore` during implementation (planning notes it; creates nothing now).

### 3.5 Rollback behavior (per-write, automatic)

The strategy is **self-rolling-back at the write level**: if serialization, fsync, validation, or rename fails, the temp file is discarded and `live_config.json` remains the **last known-good** version. There is no half-written state. At worst, an orphan `.tmp` remains (harmless, cleaned next run). This is the core safety win over today's `writeFileSync`, where a crash mid-write can truncate the live config.

**Milestone-level rollback:** revert the A1b commit. Because `writeConfigAtomic` produces byte-identical output to the current writer (§3.2), reverting changes nothing about config content — only the write path returns to plain `writeFileSync`.

### 3.6 Interaction with A3 (`config_change_audit.jsonl`)

- **Unchanged audit content and timing.** `auditConfigChange()` continues to run **after** the (now atomic) write, diffing in-memory `before`/`cfg`. A1b touches neither the schema nor the call sites' before/after capture.
- **Slightly stronger guarantee.** Because the write now either fully succeeds or fully aborts (throwing), the existing "audit after write" ordering means audit rows are only emitted for writes that actually landed — eliminating the (today theoretical) case of an audit row for a torn/failed write.
- **No coupling added.** A1b does not move audit into the write helper. Audit stays where A3 put it (in the control functions / reset script). `config_store.writeConfigAtomic` knows nothing about auditing — single responsibility.
- **emergency_stop.js** remains un-audited by A3 (as today); A1b only makes its write atomic. Converging emergency_stop.js into A3 audit is a separate, future A3 task, not A1b.

### 3.7 Why a shared helper is appropriate

Yes — a shared helper is the right call:

- **One contract, one place.** Three JS writers currently duplicate a non-atomic write; centralizing prevents drift and matches the already-atomic PS contract.
- **Consistent with A1a.** `paper_positions_store.js` set the precedent (small, dependency-free state helper). `config_store.js` mirrors it.
- **Minimal blast radius.** `saveConfig` delegating to the helper means the executor's 3 control functions need **no logic change**; only the one-line write becomes atomic.
- **Lightweight for safety scripts.** `emergency_stop.js` (kill switch) can require a tiny `config_store.js` without pulling the full executor — keeping the emergency path robust.

---

## 4. Preserved invariants (must hold before, during, after)

- `executionMode` remains `PIPELINE_DRY_RUN`.
- `dryRunMode` remains `true`.
- `liveArmed` remains `false`; `operationalPosture` remains `PIPELINE_OBSERVING`.
- **No strategy values change** (`thesis.*`, slippage, sizes, limits, fees).
- No live enablement; no gate weakened; A3 audit behavior preserved exactly.
- `writeConfigAtomic` output is **byte-identical** to today's serializer for the same `cfg`.

---

## 5. Test plan

All from repo root; must pass before and after implementation.

1. **Unit — round-trip & atomicity** (`config_store.writeConfigAtomic(cfg, tempFile)` against an **isolated temp file**, never the real config):
   - write → read back → deep-equals input;
   - no `*.tmp` left on success;
   - output bytes equal `JSON.stringify(cfg,null,2)+"\n"` (format parity);
   - injected validation failure (e.g., monkeypatched serializer producing invalid JSON) → original temp target unchanged, error thrown, no partial file.
2. **Format parity:** serialize the real `live_config.json` object through `writeConfigAtomic` to a temp path; assert the bytes equal the current file's bytes (proves no reformatting).
3. **Syntax:** `node --check config_store.js live_executor.js emergency_stop.js reset_live_safety.js dashboard_server.js`.
4. **Safety suite:** `node run_safety_tests.js` → 4/4.
5. **Posture:** `node live_executor.js --status` → `PIPELINE_DRY_RUN`, `dryRunMode true`, `liveArmed false`.
6. **A3 preserved:** a simulated control toggle (in a temp/copy harness, not the live file) still emits the same `config_change_audit.jsonl` event shape, after the atomic write.
7. **PowerShell unchanged:** tokenizer syntax check on `panic.ps1`, `reset_after_panic.ps1` (no PS edits expected in minimal A1b).

## 6. Negative verification

**Planning (now):**

```powershell
git status --short                  # expect only docs/A1B_ATOMIC_CONFIG_WRITES_PLAN.md
Test-Path .\config_store.js         # expect False (not created during planning)
git diff -- live_config.json        # expect empty
node live_executor.js --status      # PIPELINE_DRY_RUN, dryRunMode true, liveArmed false
```

**Implementation (later):**
- `live_config.json` **byte-identical** (SHA-256) before/after a no-op write that serializes the same content.
- `executionMode` PIPELINE_DRY_RUN, `dryRunMode` true, `liveArmed` false unchanged.
- No strategy value changed; no `.env` change; no dependency/database added; no archive move.
- A3 `config_change_audit.jsonl` schema/behavior unchanged.

---

## 7. Acceptance criteria

1. **AC1** — Every `live_config.json` write path enumerated with current atomicity. ✅ (§2)
2. **AC2** — Atomic vs non-atomic writers identified. ✅ (§2.1)
3. **AC3** — Audit-relative-to-write ordering documented and preservation guaranteed. ✅ (§2.2, §3.6)
4. **AC4** — Single shared atomic strategy defined (serialize → temp → fsync → validate → rename → cleanup). ✅ (§3.2)
5. **AC5** — Validation = integrity only, not enforcement. ✅ (§3.3)
6. **AC6** — Temp naming, per-write rollback, and milestone rollback specified. ✅ (§3.4, §3.5)
7. **AC7** — Shared-helper recommendation justified; PS writers kept. ✅ (§3.1, §3.7)
8. **AC8** — Test plan + negative verification; planning footprint = only this doc; posture unchanged. ✅ (§5, §6)
9. **AC9** — Separation A1b / A3 / A2 / future state module preserved. ✅ (§0)

---

## 8. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Reformatting config (whitespace/key order) breaks diffs or readers | Medium | §3.2 byte-parity requirement; format-parity test (§5.2) |
| `renameSync` non-atomic on some Windows edge case | Low | libuv uses `MoveFileEx` replace-existing (atomic); validated temp ensures no torn target; PS path proven |
| Pulling full executor into `emergency_stop.js` adds fragility | Medium | Use tiny standalone `config_store.js`, not `live_executor` |
| Accidentally adding semantic validation (rejecting values) | Medium | §3.3: integrity-only; gates stay in loadConfig/readiness |
| Changing audit timing/content | Medium | §3.6: helper has no audit knowledge; audit stays after write |
| Scope creep into A1 broader state (positions/dedup) | Medium | §0: A1b is `live_config.json` only |
| Orphan `.tmp` files accumulate | Low | unique names + cleanup-on-error; `.gitignore` `*.tmp` at implementation |

---

## 9. Do-not-implement warnings (planning phase)

- ❌ Do not write `config_store.js` or modify any writer now (planning only).
- ❌ Do not edit `live_config.json` (no value, no formatting).
- ❌ Do not change `executionMode` / `dryRunMode` / arming / gates.
- ❌ Do not change strategy values (`thesis.*`, slippage, sizes, limits, fees).
- ❌ Do not alter A3 audit schema, timing, or call sites.
- ❌ Do not add semantic validation that can reject a write.
- ❌ Do not extend atomicity to `live_positions.json` / `observation_dedup.json` (future state module).
- ❌ Do not add a dependency, database, supervisor, or move archives.
- ✅ Allowed: authoring this doc; read-only `--status` / safety-test runs.

If applying A1b ever requires changing a config value or audit behavior, **stop — that is out of scope.**

---

## 10. Future phases (out of scope — separate approval)

| Phase | Work | Gated by |
|-------|------|----------|
| A1b-impl | `config_store.js` + delegate `saveConfig` + switch `emergency_stop.js` / `reset_live_safety.js`; tests; `.gitignore` `*.tmp` | This plan's approval |
| A1b-opt | Factor a shared PowerShell `Write-ConfigAtomically` include for `panic.ps1` / `reset_after_panic.ps1` (already atomic) | A1b-impl stable |
| Future state module | Atomic single-writer for `live_positions.json`, `observation_dedup.json`, advisory locks, 24h concurrent stress test (STABILIZATION A1 exit) | A1a + A1b complete |
| A2 | Supervisor consuming M5 heartbeats + A1 healthy-state guarantees | A1 implementation complete |

---

*A1b Atomic Config Writes (planning only) · TracktaOS Module 1 · Phase 1 Stabilization (Sprint 4) · Resolves A1 race R2. Safe default: `PIPELINE_DRY_RUN`, no live submission. A1b = atomic config writes · A3 = audit · A2 = supervisor · future state module = broader unified state. No implementation, no config edits, no dependency, no database. Act conservatively; TracktaOS stability has priority over cleanliness.*
