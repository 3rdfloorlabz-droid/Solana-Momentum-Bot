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
| `r12_micro_live_readiness_check.js` | R12 read-only micro-live readiness status (`analysis/r12_micro_live_readiness_status.json`) |
| `r13_micro_live_approval_check.js` | R13 read-only final approval gate status (`analysis/r13_micro_live_approval_status.json`) |
| `r14_slippage_mev_review.js` | R14 read-only slippage/MEV policy review (`analysis/r14_slippage_mev_status.json`) |
| `r15_manual_approval_check.js` | R15 read-only manual approval record status (`analysis/r15_manual_approval_status.json`) |
| `r16_micro_live_gap_check.js` | R16 read-only implementation gap status (`analysis/r16_micro_live_gap_status.json`) |
| `r17_simulated_micro_live_harness.js` | R17 simulated micro-live config + approval harness (`analysis/r17_simulated_micro_live_status.json`) |
| `r18_shadow_quote_review.js` | R18 fixture-based shadow quote design review (`analysis/r18_shadow_quote_status.json`) |
| `r19_shadow_quote_collection_check.js` | R19 read-only shadow quote collection plan status (`analysis/r19_shadow_quote_collection_status.json`) |
| `r20_shadow_quote_collector.js` | R20 fixture dry-run shadow quote collector (`analysis/shadow_quote_observations.jsonl`, `analysis/r20_shadow_quote_collector_status.json`) |
| `r21_real_quote_observation_approval_check.js` | R21 read-only real quote observation approval gate (`analysis/r21_real_quote_observation_approval_status.json`) |
| `r22_real_quote_observation_collector.js` | R22 disabled-by-default real quote observation collector skeleton (`analysis/r22_real_quote_observation_status.json`) |
| `r23_provider_implementation_check.js` | R23 read-only real provider implementation review (`analysis/r23_provider_implementation_status.json`) |
| `r24_provider_adapter_skeleton.js` | R24 disabled-by-default provider adapter skeleton (`analysis/r24_provider_adapter_status.json`) |
| `r23_r25_provider_gate_check.js` | R23-R25 combined provider gate check (`analysis/r23_r25_provider_gate_status.json`) |
| `r26_r27_activation_shadow_design_check.js` | R26-R27 activation review + shadow design check (`analysis/r26_r27_activation_shadow_design_status.json`) |

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
| **R11 Emergency Stop Validation** | **COMPLETE — EMERGENCY STOP VALIDATED IN SIMULATION ONLY** (2026-06-28) — [docs/R11_EMERGENCY_STOP_VALIDATION.md](./docs/R11_EMERGENCY_STOP_VALIDATION.md) · **no live drill** |
| **R12 Micro-Live Readiness Checklist** | **CLOSED — CHECKLIST DEFINED BUT BLOCKED** (2026-06-28) — [docs/R12_MICRO_LIVE_READINESS_CHECKLIST.md](./docs/R12_MICRO_LIVE_READINESS_CHECKLIST.md) · aligned with R13/R14 · **micro-live NOT approved** |
| **R13 Final Micro-Live Approval Gate** | **DEFINED — FINAL APPROVAL GATE DEFINED BUT BLOCKED** (2026-06-28) — [docs/R13_FINAL_MICRO_LIVE_APPROVAL_GATE.md](./docs/R13_FINAL_MICRO_LIVE_APPROVAL_GATE.md) · **R7b bypass HIGH RISK; wallet liquidity ≠ authorized risk** |
| **R14 Slippage / MEV Protection Review** | **COMPLETE — SLIPPAGE / MEV REVIEW DEFINED — NOT IMPLEMENTED** (2026-06-28) — [docs/R14_SLIPPAGE_MEV_PROTECTION_REVIEW.md](./docs/R14_SLIPPAGE_MEV_PROTECTION_REVIEW.md) · **policy only** |
| **R15 Manual Approval Record / Session Runbook** | **DEFINED — MANUAL APPROVAL RUNBOOK DEFINED — LIVE STILL BLOCKED** (2026-06-28) — [docs/R15_MANUAL_APPROVAL_RECORD_AND_SESSION_RUNBOOK.md](./docs/R15_MANUAL_APPROVAL_RECORD_AND_SESSION_RUNBOOK.md) · **default NOT APPROVED** |
| **R16 Micro-Live Implementation Gap Review** | **COMPLETE — IMPLEMENTATION GAPS IDENTIFIED — LIVE BLOCKED** (2026-06-28) — [docs/R16_MICRO_LIVE_IMPLEMENTATION_GAP_REVIEW.md](./docs/R16_MICRO_LIVE_IMPLEMENTATION_GAP_REVIEW.md) |
| **R17 Simulated Micro-Live Config + Approval Harness** | **BUILT — SIMULATED HARNESS BUILT — LIVE STILL BLOCKED** (2026-06-28) — [docs/R17_SIMULATED_MICRO_LIVE_CONFIG_AND_APPROVAL_HARNESS.md](./docs/R17_SIMULATED_MICRO_LIVE_CONFIG_AND_APPROVAL_HARNESS.md) · **examples fake only** |
| **R18 Shadow-Quote Design Review** | **COMPLETE — SHADOW-QUOTE DESIGN DEFINED — NOT ACTIVE** (2026-06-28) — [docs/R18_SHADOW_QUOTE_DESIGN_REVIEW.md](./docs/R18_SHADOW_QUOTE_DESIGN_REVIEW.md) · **fixture-only** |
| **R19 Shadow Quote Collection Plan** | **DEFINED — SHADOW QUOTE COLLECTION PLAN DEFINED — NOT ACTIVE** (2026-06-28) — [docs/R19_SHADOW_QUOTE_COLLECTION_PLAN.md](./docs/R19_SHADOW_QUOTE_COLLECTION_PLAN.md) · **no live polling** |
| **R20 Fixture + Dry-Run Shadow Quote Collector** | **BUILT — FIXTURE COLLECTOR BUILT — NETWORK POLLING STILL BLOCKED** (2026-06-28) — [docs/R20_FIXTURE_DRY_RUN_SHADOW_QUOTE_COLLECTOR.md](./docs/R20_FIXTURE_DRY_RUN_SHADOW_QUOTE_COLLECTOR.md) · **fixture-only** |
| **R21 Real Quote Observation Approval Gate** | **DEFINED — REAL QUOTE OBSERVATION APPROVAL GATE DEFINED — POLLING NOT ACTIVE** (2026-06-28) — [docs/R21_REAL_QUOTE_OBSERVATION_APPROVAL_GATE.md](./docs/R21_REAL_QUOTE_OBSERVATION_APPROVAL_GATE.md) · **no polling activation** |
| **R22 Real Quote Observation Collector** | **BUILT — REAL QUOTE COLLECTOR SKELETON BUILT — DISABLED BY DEFAULT** (2026-06-28) — [docs/R22_REAL_QUOTE_OBSERVATION_COLLECTOR_DISABLED.md](./docs/R22_REAL_QUOTE_OBSERVATION_COLLECTOR_DISABLED.md) · **no polling** |
| **R23 Real Provider Implementation Review** | **DEFINED — REAL PROVIDER IMPLEMENTATION DESIGN DEFINED — NOT ACTIVE** (2026-06-28) — [docs/R23_REAL_PROVIDER_IMPLEMENTATION_REVIEW.md](./docs/R23_REAL_PROVIDER_IMPLEMENTATION_REVIEW.md) · **design-only** |
| **R24 Disabled Provider Adapter Skeleton** | **BUILT — DISABLED PROVIDER ADAPTER SKELETON BUILT — NETWORK OFF** (2026-06-28) — [docs/R24_DISABLED_PROVIDER_ADAPTER_SKELETON.md](./docs/R24_DISABLED_PROVIDER_ADAPTER_SKELETON.md) |
| **R25 Activation Approval Record** | **DEFINED — ACTIVATION APPROVAL RECORD DEFINED — NOT APPROVED** (2026-06-28) — [docs/R25_REAL_QUOTE_OBSERVATION_ACTIVATION_APPROVAL_RECORD.md](./docs/R25_REAL_QUOTE_OBSERVATION_ACTIVATION_APPROVAL_RECORD.md) |
| **R26 Real Quote Observation Activation Review** | **DEFINED — ACTIVATION REVIEW DEFINED — NOT ACTIVATED** (2026-06-28) — [docs/R26_REAL_QUOTE_OBSERVATION_ACTIVATION_REVIEW.md](./docs/R26_REAL_QUOTE_OBSERVATION_ACTIVATION_REVIEW.md) |
| **R27 Shadow Execution Design** | **DEFINED — SHADOW EXECUTION DESIGN DEFINED — NO EXECUTION ACTIVE** (2026-06-28) — [docs/R27_SHADOW_EXECUTION_DESIGN.md](./docs/R27_SHADOW_EXECUTION_DESIGN.md) |
| **Recommended next gate** | Future manual operator quote observation decision · continue R7b · **do not arm; no quote polling** |
| **Safety suite** | **39/39** (`node run_safety_tests.js`) |
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

Core scripts (in order): `test_signer_guard.js`, `test_pipeline_candidate_handoff.js`, `test_pipeline_dry_run.js`, `test_observation_pool.js`, the Sprint 4 state-ownership guards `test_paper_positions_ownership.js`, `test_config_store_atomic.js`, the Sprint 4 R3 guard `test_observation_dedup_atomic.js`, the Sprint 4 R4 guard `test_live_positions_atomic.js`, the Sprint 4 R5 guard `test_executor_singleton_guard.js`, the Sprint 4 R6a guard `test_soak_checkpoint_tooling.js`, the Sprint 4 R7 guard `test_r7_strategy_review.js`, the Sprint 4 R7b guard `test_r7b_daily_summary.js`, the Sprint 4 R8 guard `test_r8_risk_controls_check.js`, the Sprint 4 R9 guard `test_r9_wallet_security_check.js`, the Sprint 4 R10 guard `test_signer_simulation_harness.js`, the Sprint 4 R11 guard `test_emergency_stop_validation.js`, the Sprint 4 R12 guard `test_r12_micro_live_readiness_check.js`, the Sprint 4 R13 guard `test_r13_micro_live_approval_check.js`, the Sprint 4 R14 guard `test_r14_slippage_mev_review.js`, the Sprint 4 R15 guard `test_r15_manual_approval_check.js`, the Sprint 4 R16 guard `test_r16_micro_live_gap_check.js`, the Sprint 4 R17 guard `test_r17_simulated_micro_live_harness.js`, the Sprint 4 R18 guard `test_r18_shadow_quote_review.js`, the Sprint 4 R19 guard `test_r19_shadow_quote_collection_check.js`, the Sprint 4 R20 guard `test_r20_shadow_quote_collector.js`, the Sprint 4 R21 guard `test_r21_real_quote_observation_approval_check.js`, the Sprint 4 R22 guard `test_r22_real_quote_observation_collector.js`, the Sprint 4 R24 guard `test_r24_provider_adapter_skeleton.js`, the Sprint 4 R23-R25 guard `test_r23_r25_provider_gate_check.js`, the Sprint 4 R26-R27 guard `test_r26_r27_activation_shadow_design_check.js`, `test_ownership_guards.js`, the Sprint 4 A2c guard `test_recovery_preview_guards.js`, the Sprint 4 A2i/A2j static guard `test_dashboard_auth_guards.js`, the Sprint 4 A2k behavioral guard `test_dashboard_auth_behavior.js`, the Sprint 4 A2m guard `test_recovery_audit.js`, the Sprint 4 A2p guard `test_recovery_route_guards.js`, the Sprint 4 A2q guard `test_fake_recovery_harness.js`, the Sprint 4 A2r guard `test_low_risk_recovery_behavior.js`, and the Sprint 4 A2s guard `test_low_risk_recovery_routes.js`.

A2c Preview-Only UI (dashboard **Recovery Action Preview**) is guarded by `test_recovery_preview_guards.js` — a static source guard that fails if the preview ever gains buttons, forms, POST routes, `spawn`/`exec`/`child_process`/`process.kill`, or `recovery_actions.jsonl` writes. The preview shows command text only; it executes no recovery.

A2i/A2j dashboard auth guard (`test_dashboard_auth_guards.js`) is **active in `run_safety_tests.js` (39/39)** for static checks (POST route inventory, forbidden recovery routes/primitives, A2c preview boundary, **A2j fail-closed auth wrapper** on `/control/start`, `/control/stop`, `/control/emergency`, and **A2s allowlisted recovery routes** `/recovery/plan/:actionId`, `/recovery/confirm/:actionId`). **A2k** (`test_dashboard_auth_behavior.js`) adds isolated HTTP behavioral auth tests using temp fixtures via `TRACKTA_RUNTIME_ROOT`. **A2m** (`recovery_audit.js` + `test_recovery_audit.js`) implements the append-only recovery audit writer. **A2p** (`test_recovery_route_guards.js`) protects recovery route boundaries. **A2q** (`fake_recovery_harness.js` + `test_fake_recovery_harness.js`) provides a deterministic fake process/runtime model for tests. **A2r** (`fake_recovery_flow.js` + `test_low_risk_recovery_behavior.js`) proves the future low-risk human-confirmed recovery lifecycle using fake harness and temp audit ledger only. **A2s** (`recovery_allowlist.js`, `recovery_service.js`, `recovery_routes.js`, `test_low_risk_recovery_routes.js`) implements authenticated low-risk recovery plan/confirm routes with **simulated execution only** — no real process spawn/kill; **no dashboard recovery buttons**; allowed actions: `restart-scanner`, `restart-paper-monitor`, `restart-wallet-monitor`, `restart-dashboard` only. **R3** (`observation_dedup_store.js` + `test_observation_dedup_atomic.js`) hardens `observation_dedup.json` with atomic temp-rename writes and validation — **state durability only**, not trading/live approval. **R4** (`live_positions_store.js` + `test_live_positions_atomic.js`) hardens `live_positions.json` with atomic temp-rename writes, executor-only ownership, and validation — **state durability only**, not live approval. **R5** (`executor_singleton_guard.js` + `test_executor_singleton_guard.js`) adds a JSON singleton lock for `live_executor.js --loop` to refuse duplicate executor loops on shared runtime state — **state/process ownership hardening only**, not live approval. **R6a** (`soak_checkpoint.js`, `run_24h_soak_checkpoints.js`, `test_soak_checkpoint_tooling.js`) collects read-only soak checkpoint evidence under `soak_runs/` — **observation only**, not live approval. **R7** (`r7_strategy_review.js`, `test_r7_strategy_review.js`) performs read-only strategy performance analysis — writes `analysis/r7_strategy_metrics.json` only; **does not approve live trading**. **R7b** (`r7b_daily_summary.js`, `test_r7b_daily_summary.js`) tracks fresh collection progress toward R8 thresholds — writes `analysis/r7b_daily_summary.json` only; **does not approve live trading**. **R8** (`r8_risk_controls_check.js`, `test_r8_risk_controls_check.js`) read-only risk controls status — writes `analysis/r8_risk_controls_status.json` only; **does not approve live trading or arm controls**. **R9** (`r9_wallet_security_check.js`, `test_r9_wallet_security_check.js`) read-only wallet/signer security status — writes `analysis/r9_wallet_security_status.json` only; **does not connect wallet or handle signing material**. **R10** (`signer_simulation_harness.js`, `test_signer_simulation_harness.js`) fake signer lifecycle simulation only — **no real submission, no signing material, no live approval**. **R11** (`test_emergency_stop_validation.js`) emergency-stop validation via extended fake harness — **simulation only; no live drill; no executor changes**. **R12** (`r12_micro_live_readiness_check.js`, `test_r12_micro_live_readiness_check.js`) read-only micro-live readiness checklist — **does not approve micro-live**. **R12** (`r12_micro_live_readiness_check.js`, `test_r12_micro_live_readiness_check.js`) read-only micro-live readiness checklist — **closed; aligned with R13/R14; does not approve micro-live**. **R13** (`r13_micro_live_approval_check.js`, `test_r13_micro_live_approval_check.js`) read-only final approval gate — **does not approve micro-live; wallet liquidity ≠ authorized risk**. **R14** (`r14_slippage_mev_review.js`, `test_r14_slippage_mev_review.js`) read-only slippage/MEV policy review — **does not fetch live quotes or enable live trading**. **R15** (`r15_manual_approval_check.js`, `test_r15_manual_approval_check.js`) read-only manual approval record / session runbook — **default NOT APPROVED; never auto-approves live**. **R16** (`r16_micro_live_gap_check.js`, `test_r16_micro_live_gap_check.js`) read-only implementation gap review — **does not implement or approve live trading**. **R17** (`r17_simulated_micro_live_harness.js`, `test_r17_simulated_micro_live_harness.js`) simulated config + approval harness — **examples fake only; never auto-approves live**. **R18** (`r18_shadow_quote_review.js`, `test_r18_shadow_quote_review.js`) shadow-quote fixture review — **no network calls; never approves live**. **R19** (`r19_shadow_quote_collection_check.js`, `test_r19_shadow_quote_collection_check.js`) shadow quote collection plan — **polling NOT active; never approves live**. **R20** (`r20_shadow_quote_collector.js`, `test_r20_shadow_quote_collector.js`) fixture dry-run shadow quote collector — **fixture-only; no network calls; never approves live**. **R21** (`r21_real_quote_observation_approval_check.js`, `test_r21_real_quote_observation_approval_check.js`) real quote observation approval gate — **polling NOT active; never approves live**. **R22** (`r22_real_quote_observation_collector.js`, `test_r22_real_quote_observation_collector.js`) real quote observation collector skeleton — **disabled by default; no network calls; never approves live**. **R23-R25** (`r24_provider_adapter_skeleton.js`, `r23_r25_provider_gate_check.js`, `test_r24_provider_adapter_skeleton.js`, `test_r23_r25_provider_gate_check.js`) combined provider design sprint — **disabled by default; no network calls; never approves live**. **R26-R27** (`r26_r27_activation_shadow_design_check.js`, `test_r26_r27_activation_shadow_design_check.js`) activation review + shadow execution design — **not activated; no network; never approves live**.

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
| `analysis/r11_emergency_stop_validation.json` | R11 emergency stop simulation validation output (gitignored) |
| `analysis/r12_micro_live_readiness_status.json` | R12 read-only micro-live readiness status output (gitignored) |
| `analysis/r13_micro_live_approval_status.json` | R13 read-only final approval gate status output (gitignored) |
| `analysis/r14_slippage_mev_status.json` | R14 read-only slippage/MEV review output (gitignored) |
| `analysis/r15_manual_approval_status.json` | R15 read-only manual approval status output (gitignored) |
| `analysis/r15_manual_approval_record.json` | R15 operator approval record draft (gitignored — never commit) |
| `analysis/r16_micro_live_gap_status.json` | R16 read-only implementation gap status output (gitignored) |
| `analysis/r17_simulated_micro_live_status.json` | R17 simulated harness status output (gitignored) |
| `examples/micro_live_config.example.json` | R17 example-only micro-live config (fake — not runtime) |
| `examples/r15_manual_approval_record.example.json` | R17 example-only approval record (default NOT APPROVED) |
| `examples/shadow_quotes.example.json` | R18 example-only shadow quote fixtures (fake) |
| `examples/shadow_quote_candidates.example.json` | R20 example-only shadow quote candidate fixtures (fake) |
| `analysis/r18_shadow_quote_status.json` | R18 shadow quote review output (gitignored) |
| `analysis/r19_shadow_quote_collection_status.json` | R19 shadow quote collection plan status (gitignored) |
| `analysis/shadow_quote_observations.jsonl` | R20 shadow quote observations log (gitignored) |
| `analysis/r20_shadow_quote_collector_status.json` | R20 fixture collector status output (gitignored) |
| `examples/r21_quote_observation_approval_record.example.json` | R21 example-only quote observation approval record (default NOT_APPROVED) |
| `analysis/r21_real_quote_observation_approval_status.json` | R21 real quote observation approval gate status (gitignored) |
| `analysis/r21_quote_observation_approval_record.json` | R21 operator approval record draft (gitignored — never commit) |
| `analysis/real_quote_observations.jsonl` | Future real quote observations log (gitignored — not created by R21/R22) |
| `examples/real_quote_observation_config.example.json` | R22 example-only collector config (`active: false`) |
| `analysis/r22_real_quote_observation_status.json` | R22 disabled collector status output (gitignored) |
| `examples/provider_adapter_config.example.json` | R24 example-only provider adapter config (`active: false`) |
| `examples/r25_quote_observation_activation_record.example.json` | R25 example-only activation record (default NOT_APPROVED) |
| `analysis/r24_provider_adapter_status.json` | R24 provider adapter skeleton status (gitignored) |
| `analysis/r23_r25_provider_gate_status.json` | R23-R25 combined provider gate status (gitignored) |
| `examples/r26_quote_observation_activation_review.example.json` | R26 example-only activation review (NOT_APPROVED / NOT_ACTIVATED) |
| `examples/shadow_execution_decisions.example.json` | R27 example-only shadow execution decisions (fake) |
| `analysis/r26_r27_activation_shadow_design_status.json` | R26-R27 combined status (gitignored) |

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
