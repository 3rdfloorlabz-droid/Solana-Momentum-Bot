# Active Manifest — Solana Momentum Bot

**TracktaOS Module 1 · Canonical runtime paths**

This file is the single source of truth for which scripts, configs, and state files are **active** in production operation. If a path is not listed here as canonical, do not run it or edit it expecting the live bot to change.

**Safe default:** `executionMode: PIPELINE_DRY_RUN` in `live_config.json`

**Related:** [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) · [docs/OPERATIONS.md](./docs/OPERATIONS.md) · [MIGRATION_NOTES.md](./MIGRATION_NOTES.md)

---

## Canonical rule

All active processes run from the **repository root** (`Solana-Momentum-Bot/`). Ops scripts default to `$PSScriptRoot` (this directory).

**Do not** run or patch copies under archive folders listed below.

---

## Core processes (run these)

| Role | Script | Typical command |
|------|--------|-----------------|
| **Scanner** | `scanner_gmgn_trending.js` | `node scanner_gmgn_trending.js` or `--watch` |
| **Paper monitor** | `monitor.js` | `node monitor.js` |
| **Executor** | `live_executor.js` | `node live_executor.js --status` (safe) · `--loop` (observation cycle) |
| **Dashboard** | `dashboard_server.js` | `node dashboard_server.js` → `http://localhost:3000` |
| **Wallet monitor** | `wallet_monitor.js` | `node wallet_monitor.js` |

**Which scanner?** Only `scanner_gmgn_trending.js`. Legacy scanners (`scanner.js`, `scanner_v3.js`, `scanner_trending.js`, backups) are not active.

---

## Supporting processes (optional)

| Role | Script | Typical command |
|------|--------|-----------------|
| Near-miss follow-up | `near_miss_followup.js` | `node near_miss_followup.js --watch` |
| Pipeline backfill | `run_pipeline_dry_run_backfill.js` | Manual / maintenance only |
| Executor simulation | `simulate_live_executor.js` | Offline replay / analysis |

---

## Ops scripts (PowerShell, repo root)

| Script | Purpose |
|--------|---------|
| `start_fomo.ps1` | Launch dashboard, wallet monitor, scanner, paper monitor, executor loop |
| `fomo_status.ps1` | Port 3000, matching Node processes, config safety snapshot |
| `panic.ps1` | Emergency stop: `emergencyStop=true`, stop bot processes, log to `panic_events.jsonl` |
| `reset_after_panic.ps1` | Interactive post-panic reset (requires typed `YES`) |
| `stop_fomo.ps1` | Stop helper (verify behavior before use) |

All ops scripts accept optional `-ProjectPath`; default is `$PSScriptRoot`. Each exits if `live_config.json` is missing.

---

## Safety and validation (Node, repo root)

| Script | Purpose |
|--------|---------|
| `emergency_stop.js` | Set `emergencyStop=true` and halt automation |
| `reset_live_safety.js` | Clear emergency stop; keeps automation off and dry run on |
| `validate_live_system.js` | System safety and file integrity checks |
| `validate_live_preflight.js` | Pre-live environment validation |
| `validate_wallet_connection.js` | Wallet/RPC connectivity check |
| `validate_data.js` | Paper-trade JSONL structure validation |
| `soak_checkpoint.js` | R6a read-only soak checkpoint collector (evidence only) |
| `run_24h_soak_checkpoints.js` | R6a 24h checkpoint scheduler (evidence only) |
| `r7_strategy_review.js` | R7 read-only strategy metrics (`analysis/r7_strategy_metrics.json`) |
| `r7b_daily_summary.js` | R7b read-only collection progress (`analysis/r7b_daily_summary.json`) |
| `r8_risk_controls_check.js` | R8 read-only risk controls status (`analysis/r8_risk_controls_status.json`) |
| `r9_wallet_security_check.js` | R9 read-only wallet/signer security status (`analysis/r9_wallet_security_status.json`) |
| `signer_simulation_harness.js` | R10 fake signer / transaction lifecycle simulation only (`analysis/signer_simulation_output.json`) |

---

## Operational status

**Last updated:** 2026-06-28

| Item | Status |
|------|--------|
| **R6a 24h soak** | **COMPLETE — PASS** (2026-06-28) — `soak_runs/r6a_24h_soak_summary.json` |
| **R7 Strategy Performance / Edge Review** | **COMPLETE — NOT ENOUGH DATA** (2026-06-28) — [docs/R7_STRATEGY_PERFORMANCE_EDGE_REVIEW.md](./docs/R7_STRATEGY_PERFORMANCE_EDGE_REVIEW.md) · **live trading NOT approved** |
| **R7b Strategy Data Collection** | **PLAN COMPLETE — collection IN PROGRESS** — [docs/R7B_STRATEGY_DATA_COLLECTION_PLAN.md](./docs/R7B_STRATEGY_DATA_COLLECTION_PLAN.md) |
| **R8 Risk Controls Review** | **COMPLETE — RISK CONTROLS DEFINED BUT NOT ARMED** (2026-06-28) — [docs/R8_RISK_CONTROLS_REVIEW.md](./docs/R8_RISK_CONTROLS_REVIEW.md) · **live trading NOT approved** |
| **R9 Wallet / Signer Security Review** | **COMPLETE — WALLET SECURITY DESIGN DEFINED BUT NOT CONNECTED** (2026-06-28) — [docs/R9_WALLET_SIGNER_SECURITY_REVIEW.md](./docs/R9_WALLET_SIGNER_SECURITY_REVIEW.md) · **no wallet connected** |
| **R10 Live Execution Path Review** | **COMPLETE — READY FOR SIGNER SIMULATION HARNESS** (2026-06-28) — [docs/R10_LIVE_EXECUTION_PATH_REVIEW.md](./docs/R10_LIVE_EXECUTION_PATH_REVIEW.md) · **fake signer only; no real submission** |
| **Recommended next gate** | **Continue R7b** → micro-live readiness checklist — **do not connect wallet; do not arm live trading** |
| **Safety suite** | **24/24** (`node run_safety_tests.js`) |
| **Posture** | `PIPELINE_DRY_RUN` · `dryRunMode: true` · `liveArmed: false` |
| **`live_errors.jsonl`** | Rows 1–54 = synthetic `test_execution_logging.js` (tagged `SYNTHETIC_HISTORY_BOUNDARY` line 55) |
| **`live_trades.json`** | Empty orphan — canonical ledger is `live_trades.jsonl` |
| **Dedicated RPC** | **Missing** — promotion gate OPEN; pipeline observation allowed |
| **Soak evidence** | `soak_runs/r6a_24h_soak_checkpoints.jsonl`, `r6a_24h_soak_latest.json` (gitignored) |

---

## Safety tests

Run from repo root before executor changes:

```powershell
npm test
```

Equivalent manual run:

```powershell
node run_safety_tests.js
```

Core scripts (in order): `test_signer_guard.js`, `test_pipeline_candidate_handoff.js`, `test_pipeline_dry_run.js`, `test_observation_pool.js`, the Sprint 4 state-ownership guards `test_paper_positions_ownership.js`, `test_config_store_atomic.js`, the Sprint 4 R3 guard `test_observation_dedup_atomic.js`, the Sprint 4 R4 guard `test_live_positions_atomic.js`, the Sprint 4 R5 guard `test_executor_singleton_guard.js`, the Sprint 4 R6a guard `test_soak_checkpoint_tooling.js`, the Sprint 4 R7 guard `test_r7_strategy_review.js`, the Sprint 4 R7b guard `test_r7b_daily_summary.js`, the Sprint 4 R8 guard `test_r8_risk_controls_check.js`, the Sprint 4 R9 guard `test_r9_wallet_security_check.js`, the Sprint 4 R10 guard `test_signer_simulation_harness.js`, `test_ownership_guards.js`, the Sprint 4 A2c guard `test_recovery_preview_guards.js`, the Sprint 4 A2i/A2j static guard `test_dashboard_auth_guards.js`, the Sprint 4 A2k behavioral guard `test_dashboard_auth_behavior.js`, the Sprint 4 A2m guard `test_recovery_audit.js`, the Sprint 4 A2p guard `test_recovery_route_guards.js`, the Sprint 4 A2q guard `test_fake_recovery_harness.js`, the Sprint 4 A2r guard `test_low_risk_recovery_behavior.js`, and the Sprint 4 A2s guard `test_low_risk_recovery_routes.js`.

A2c Preview-Only UI (dashboard **Recovery Action Preview**) is guarded by `test_recovery_preview_guards.js` — a static source guard that fails if the preview ever gains buttons, forms, POST routes, `spawn`/`exec`/`child_process`/`process.kill`, or `recovery_actions.jsonl` writes. The preview shows command text only; it executes no recovery.

A2i/A2j dashboard auth guard (`test_dashboard_auth_guards.js`) is **active in `run_safety_tests.js` (24/24)** for static checks (POST route inventory, forbidden recovery routes/primitives, A2c preview boundary, **A2j fail-closed auth wrapper** on `/control/start`, `/control/stop`, `/control/emergency`, and **A2s allowlisted recovery routes** `/recovery/plan/:actionId`, `/recovery/confirm/:actionId`). **A2k** (`test_dashboard_auth_behavior.js`) adds isolated HTTP behavioral auth tests using temp fixtures via `TRACKTA_RUNTIME_ROOT`. **A2m** (`recovery_audit.js` + `test_recovery_audit.js`) implements the append-only recovery audit writer. **A2p** (`test_recovery_route_guards.js`) protects recovery route boundaries. **A2q** (`fake_recovery_harness.js` + `test_fake_recovery_harness.js`) provides a deterministic fake process/runtime model for tests. **A2r** (`fake_recovery_flow.js` + `test_low_risk_recovery_behavior.js`) proves the future low-risk human-confirmed recovery lifecycle using fake harness and temp audit ledger only. **A2s** (`recovery_allowlist.js`, `recovery_service.js`, `recovery_routes.js`, `test_low_risk_recovery_routes.js`) implements authenticated low-risk recovery plan/confirm routes with **simulated execution only** — no real process spawn/kill; **no dashboard recovery buttons**; allowed actions: `restart-scanner`, `restart-paper-monitor`, `restart-wallet-monitor`, `restart-dashboard` only. **R3** (`observation_dedup_store.js` + `test_observation_dedup_atomic.js`) hardens `observation_dedup.json` with atomic temp-rename writes and validation — **state durability only**, not trading/live approval. **R4** (`live_positions_store.js` + `test_live_positions_atomic.js`) hardens `live_positions.json` with atomic temp-rename writes, executor-only ownership, and validation — **state durability only**, not live approval. **R5** (`executor_singleton_guard.js` + `test_executor_singleton_guard.js`) adds a JSON singleton lock for `live_executor.js --loop` to refuse duplicate executor loops on shared runtime state — **state/process ownership hardening only**, not live approval. **R6a** (`soak_checkpoint.js`, `run_24h_soak_checkpoints.js`, `test_soak_checkpoint_tooling.js`) collects read-only soak checkpoint evidence under `soak_runs/` — **observation only**, not live approval. **R7** (`r7_strategy_review.js`, `test_r7_strategy_review.js`) performs read-only strategy performance analysis — writes `analysis/r7_strategy_metrics.json` only; **does not approve live trading**. **R7b** (`r7b_daily_summary.js`, `test_r7b_daily_summary.js`) tracks fresh collection progress toward R8 thresholds — writes `analysis/r7b_daily_summary.json` only; **does not approve live trading**. **R8** (`r8_risk_controls_check.js`, `test_r8_risk_controls_check.js`) read-only risk controls status — writes `analysis/r8_risk_controls_status.json` only; **does not approve live trading or arm controls**. **R9** (`r9_wallet_security_check.js`, `test_r9_wallet_security_check.js`) read-only wallet/signer security status — writes `analysis/r9_wallet_security_status.json` only; **does not connect wallet or handle signing material**. **R10** (`signer_simulation_harness.js`, `test_signer_simulation_harness.js`) fake signer lifecycle simulation only — **no real submission, no signing material, no live approval**.

**CI:** GitHub Actions workflow **Safety Tests** (`.github/workflows/safety-tests.yml`) runs `npm test` on every push and pull request to `main`.

Additional tests: `test_step9a_signing.js`, `test_step9b_submission.js`, and others listed in [MIGRATION_NOTES.md](./MIGRATION_NOTES.md).

---

## Analysis scripts (repo root, non-runtime)

| Script | Purpose |
|--------|---------|
| `analyze_forward_test.js` | Forward-test / paper outcome analysis |
| `analyze_results.js` | Paper trade results |
| `analyze_near_misses.js` | Near-miss analysis |

---

## Configuration (repo root)

| File | Purpose |
|------|---------|
| `live_config.json` | **Operational truth:** mode, automation, limits, thesis bounds. **Sprint 4 A1b:** all JS writers go through `config_store.writeConfigAtomic()` (temp → validate → atomic rename); PowerShell writers were already atomic |
| `.env` | Local secrets and RPC (from `.env.example`; never commit) |
| `.env.example` | Template for env vars |

**Do not** switch to `LIVE` or disable dry run without explicit authorization.

---

## State ownership contract (Single Writer / Many Readers)

**Sprint 4 (A1a/A1b/A1c/R3/R4/R5).** Each mutable state file has exactly **one writer**; everyone else is a **reader**. This eliminates the dual-writer races that previously corrupted shared JSON/JSONL. The contract below is enforced by `test_ownership_guards.js` (static source guards, part of `node run_safety_tests.js`).

| File | Single Writer | Many Readers | Write mode |
|------|---------------|--------------|------------|
| `paper_trades.json` | **Scanner** (`scanner_gmgn_trending.js`) | monitor, dashboard, analysis scripts | Append-only (JSONL) |
| `paper_positions.json` | **Monitor** (`monitor.js` via `paper_positions_store.js`) | scanner (cooldowns), dashboard | Atomic replace (temp → rename) |
| `live_config.json` | **Executor / ops only** (`live_executor.saveConfig`, `emergency_stop.js`, `reset_live_safety.js` via `config_store.writeConfigAtomic`; PowerShell `panic.ps1` / `reset_after_panic.ps1` via their atomic helper) | dashboard, validators, all readers | Atomic replace (temp → fsync → validate → rename) |
| `live_positions.json` | **Executor** (`live_executor.js` via `live_positions_store.js`) | dashboard, `reset_live_safety.js`, `validate_live_system.js` (read) | Atomic replace (temp → fsync → validate → rename) |
| `observation_dedup.json` | **Executor** (`live_executor.js` via `observation_dedup_store.js`) | executor only | Atomic replace (temp → fsync → validate → rename) |
| `executor_singleton.lock.json` | **Executor loop** (`live_executor.js --loop` via `executor_singleton_guard.js`) | dashboard/`--status` (read-only) | Atomic replace (temp → fsync → validate → rename); refreshed each loop cycle |

**Rules:**
- No file may add a second writer without updating this table **and** `test_ownership_guards.js`.
- The monitor must never write `paper_trades.json`; the scanner must never write `paper_positions.json`.
- All JS writes to `live_config.json` must route through `config_store.writeConfigAtomic` — never raw `fs.writeFileSync`.
- All JS writes to `observation_dedup.json` must route through `observation_dedup_store.writeObservationDedupStateAtomic` — never raw `fs.writeFileSync`.
- All JS writes to `live_positions.json` must route through `live_positions_store.writeLivePositionsStateAtomic` — never raw `fs.writeFileSync`.
- `live_executor.js --loop` must acquire/refreshed/release via `executor_singleton_guard.js`; `--status` is read-only and must not acquire the lock.

---

## State and ledgers (repo root, runtime data)

These files are **runtime artifacts**, not source code. Enforced by root [`.gitignore`](./.gitignore) — see [MIGRATION_NOTES.md](./MIGRATION_NOTES.md) local-data policy.

### Ledgers (JSONL; some use `.json` extension)

| File | Writer | Purpose |
|------|--------|---------|
| `paper_trades.json` | **Scanner only (append-only)** | Paper trade entry/research ledger (JSONL). **Sprint 4 A1a:** monitor no longer writes this file |
| `paper_positions.json` | **Monitor only** | Mutable paper-trade lifecycle store (status/exit/pnl), keyed by `entryId = timestamp_address_pairAddress`. **Sprint 4 A1a** (single-writer split) |
| `pipeline_candidates.jsonl` | Scanner | Scanner-to-executor handoff queue |
| `near_misses.json` | Scanner | Rejected high-score candidates (JSONL format) |
| `near_miss_followups.json` | `near_miss_followup.js` | Follow-up price measurements |
| `live_trades.jsonl` | `live_executor.js` | Live event history (**canonical** executor ledger) |
| `live_trades.json` | *(none — orphan)* | **Not canonical.** Empty local orphan may exist; executor/dashboard read `.jsonl` only |
| `live_positions.json` | `live_executor.js` | Open live positions snapshot |

### Audit and telemetry (append-only JSONL)

| File | Purpose |
|------|---------|
| `execution_audit.jsonl` | Pipeline stages, cycle audit |
| `live_errors.jsonl` | Errors and guard failures; synthetic test rows tagged via `SYNTHETIC_HISTORY_BOUNDARY` operator note |
| `live_control_events.jsonl` | START / STOP / EMERGENCY / RESET |
| `wallet_history.jsonl` | Periodic wallet snapshots |
| `pending_reconciliation.jsonl` | Ambiguous on-chain outcomes (human review) |
| `panic_events.jsonl` | Panic / reset incidents |
| `config_change_audit.jsonl` | A3 config field change audit (executor/ops writers) |
| `recovery_actions.jsonl` | **A2m:** future recovery action audit (`recovery_audit.js` append-only writer). **Not auto-created; not wired to dashboard recovery execution** |

**Support module (A2m):** `recovery_audit.js` — validated append-only writer for `recovery_actions.jsonl`. Tests: `test_recovery_audit.js` (temp fixtures via `TRACKTA_RUNTIME_ROOT` only).

### R6a soak evidence (gitignored)

| Path | Purpose |
|------|---------|
| `soak_runs/r6a_24h_soak_checkpoints.jsonl` | Append-only R6a checkpoint rows |
| `soak_runs/r6a_24h_soak_latest.json` | Latest checkpoint summary |
| `soak_runs/r6a_24h_soak_summary.json` | Final runner summary (after +24h) |
| `analysis/r7_strategy_metrics.json` | R7 read-only strategy metrics output (gitignored) |
| `analysis/r7b_daily_summary.json` | R7b read-only collection progress output (gitignored) |
| `analysis/r8_risk_controls_status.json` | R8 read-only risk controls status output (gitignored) |
| `analysis/r9_wallet_security_status.json` | R9 read-only wallet/signer security status output (gitignored) |
| `analysis/signer_simulation_output.json` | R10 fake signer simulation output (gitignored) |

### Snapshots (overwrite JSON)

| File | Purpose |
|------|---------|
| `wallet_status.json` | Latest wallet/RPC read |
| `rpc_health.json` | RPC ping statistics |
| `simulation_results.json` | `simulate_live_executor.js` output |

**Dashboard:** Root `dashboard_server.js` reads the same canonical ledger via `liveExecutor.FILES.LIVE_TRADES_FILE` (fallback: `live_trades.jsonl`).

---

## Non-canonical — do not run or edit for production

These directories contain **duplicate or historical snapshots**. Changes here do **not** affect a bot started from repo root.

| Folder | Status |
|--------|--------|
| `automation/` | Archive copy — not active |
| `hardreset/` | Archive copy — not active |
| `harness/` | Archive / test harness copy — not active |
| `files/` | Archive copy — not active |
| `phase1_files/` | Archive copy — not active |

**Sprint 2+ (M9):** physical quarantine or removal from active package.

### Legacy root scripts (do not run)

| Script | Replace with |
|--------|----------------|
| `scanner.js` | `scanner_gmgn_trending.js` |
| `scanner_v3.js` | `scanner_gmgn_trending.js` |
| `scanner_trending.js` | `scanner_gmgn_trending.js` |
| `scanner_gmgn_trending_backup.js` | `scanner_gmgn_trending.js` |
| `scanner_gmgn_trending_pre_bot10.js` | `scanner_gmgn_trending.js` |
| `monitor_backup.js` | `monitor.js` |
| `files/live_executor.js`, `automation/live_executor.js`, etc. | `live_executor.js` (root) |

---

## Preflight checklist (operators)

Before starting or restarting processes:

1. Confirm working directory is **this repo root** (or ops script `$PSScriptRoot`).
2. Run `node live_executor.js --status` — expect `PIPELINE_DRY_RUN`, `dryRunMode: true`.
3. Confirm you are editing **root** scripts, not an archive folder.
4. Do not commit local runtime JSON/JSONL to source control.

---

## Document maintenance

Update this manifest when:

- A root script is added, renamed, or retired
- Canonical ledger filenames change
- Archive folders are quarantined or removed

Log structural changes in [docs/DECISIONS.md](./docs/DECISIONS.md).

---

*Sprint 4 R6a · Active manifest · TracktaOS Module 1 · last status update 2026-06-27*
