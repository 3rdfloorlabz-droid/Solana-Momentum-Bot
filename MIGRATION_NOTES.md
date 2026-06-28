# Migration Notes

This repo is an existing Solana momentum research bot being migrated into TracktaOS. It contains source code, runtime JSON/JSONL data, backups, archives, dashboard assets, and safety utilities.

## Current Mode

The active `live_config.json` should remain in dry-run mode during migration:

- `executionMode` should stay `PIPELINE_DRY_RUN`
- `dryRunMode` should stay `true`
- live signer secrets should not be loaded
- live submission env flags should remain unset

## Active Root Files

See **[ACTIVE_MANIFEST.md](./ACTIVE_MANIFEST.md)** for the authoritative canonical path list. Summary:

- `scanner_gmgn_trending.js`: active scanner for GMGN trending candidates. Writes paper-trade and pipeline-candidate rows.
- `monitor.js`: monitors open paper trades and closes them on target, stop, or timeout.
- `near_miss_followup.js`: tracks outcomes for rejected or near-miss candidates.
- `analyze_forward_test.js`, `analyze_results.js`, `analyze_near_misses.js`: analysis scripts for paper-trade and follow-up data.
- `validate_data.js`: validates paper-trade JSONL structure.
- `dashboard_server.js`: local Express dashboard on port 3000.
- `wallet_monitor.js`: read-only wallet balance/RPC health monitor.
- `live_executor.js`: guarded execution layer for dry run, pipeline dry run, and live mode. Live mode is gated by config and environment checks.
- `live_trade_logger.js`: logging helper for live trade events.
- `emergency_stop.js`, `reset_live_safety.js`, `panic.ps1`, `reset_after_panic.ps1`: safety control utilities.
- `validate_live_system.js`, `validate_live_preflight.js`, `validate_wallet_connection.js`: safety and environment validators.
- `run_pipeline_dry_run_backfill.js`: backfills or replays pipeline dry-run observation data.
- `simulate_live_executor.js`: simulator for executor behavior.

## Test Files

Core safety tests run via npm (Sprint 1 Q6):

```powershell
npm test
```

Equivalent: `node run_safety_tests.js` — runs **32/32** safety tests including Sprint 4 R6a through R18 guards.

Additional standalone scripts (manual / extended coverage):

- `test_observation_pool.js`
- `test_pipeline_candidate_handoff.js`
- `test_pipeline_dry_run.js`
- `test_pipeline_dry_run_signer.js`
- `test_jupiter_quote_validation.js`
- `test_execution_logging.js`
- `test_priority_fee.js`
- `test_rpc_endpoint_resolution.js`
- `test_signer_guard.js`
- `test_simulation.js`
- `test_step9a_signing.js`
- `test_step9b_submission.js`
- `test_tx_build.js`

## Runtime Data

Runtime JSON/JSONL at the **repository root** is environment-specific operational history. It is **local-only** — do not commit ledgers, backups, or caches to source control.

**Enforcement:** root [`.gitignore`](./.gitignore) (see also [ACTIVE_MANIFEST.md](./ACTIVE_MANIFEST.md) preflight). Gitignore hides files from `git status`; it does not delete them from disk. **Do not** `git add` runtime files to “clean up” the working tree.

**Fresh clones** may have no runtime files until processes run or `npm test` preflight creates empty stubs for safety tests.

Review these before importing into TracktaOS:

- `paper_trades.json`: paper trade history.
- `pipeline_candidates.jsonl`: scanner-to-executor candidate handoff queue.
- `execution_audit.jsonl`: dry-run/live execution stage audit log.
- `near_misses.json`: rejected candidate history.
- `near_miss_followups.json`: follow-up outcomes.
- `live_trades.jsonl`: live event history (**canonical** executor ledger).
- `live_trades.json`: legacy/orphan filename — **not read by executor**; may exist empty locally. Merge manually if non-empty history diverges from `.jsonl`.
- `live_positions.json`: current live position state.
- `live_errors.jsonl`: execution and guard errors. Rows through **2026-06-14** from `test_execution_logging.js` are synthetic; tagged by operator note `SYNTHETIC_HISTORY_BOUNDARY` (line 55+). Ignore those when reviewing soak or live-readiness error counts.
- `live_control_events.jsonl`: start/stop/emergency/reset events.
- `wallet_history.jsonl`, `wallet_status.json`, `rpc_health.json`: read-only wallet/RPC telemetry.
- `simulation_intents.jsonl`, `simulation_rejections.jsonl`, `simulation_results.json`: simulation outputs.
- Legacy caches / manual backups: `boosts.json`, `signals.json`, `trending.json`, `*_backup.json`, `*_before_*.json`.

These files may be large, append-only, or environment-specific. TracktaOS should classify them as data artifacts, not source code.

### Operational status (2026-06-28)

| Item | Status |
|------|--------|
| **R6a 24h soak** | **COMPLETE — PASS** |
| **R7 Strategy / Edge Review** | **COMPLETE — NOT ENOUGH DATA** |
| **R7b Strategy Data Collection** | **PLAN COMPLETE — collection IN PROGRESS** |
| **R8 Risk Controls Review** | **COMPLETE — RISK CONTROLS DEFINED BUT NOT ARMED** — [docs/R8_RISK_CONTROLS_REVIEW.md](./docs/R8_RISK_CONTROLS_REVIEW.md) |
| **R9 Wallet / Signer Security Review** | **COMPLETE — WALLET SECURITY DESIGN DEFINED BUT NOT CONNECTED** — [docs/R9_WALLET_SIGNER_SECURITY_REVIEW.md](./docs/R9_WALLET_SIGNER_SECURITY_REVIEW.md) |
| **R10 Live Execution Path Review** | **COMPLETE — READY FOR SIGNER SIMULATION HARNESS** — [docs/R10_LIVE_EXECUTION_PATH_REVIEW.md](./docs/R10_LIVE_EXECUTION_PATH_REVIEW.md) |
| **R11 Emergency Stop Validation** | **COMPLETE — EMERGENCY STOP VALIDATED IN SIMULATION ONLY** — [docs/R11_EMERGENCY_STOP_VALIDATION.md](./docs/R11_EMERGENCY_STOP_VALIDATION.md) |
| **R12 Micro-Live Readiness Checklist** | **CLOSED — CHECKLIST DEFINED BUT BLOCKED** — [docs/R12_MICRO_LIVE_READINESS_CHECKLIST.md](./docs/R12_MICRO_LIVE_READINESS_CHECKLIST.md) |
| **R13 Final Micro-Live Approval Gate** | **DEFINED — BLOCKED** — [docs/R13_FINAL_MICRO_LIVE_APPROVAL_GATE.md](./docs/R13_FINAL_MICRO_LIVE_APPROVAL_GATE.md) |
| **R14 Slippage / MEV Protection Review** | **COMPLETE — NOT IMPLEMENTED** — [docs/R14_SLIPPAGE_MEV_PROTECTION_REVIEW.md](./docs/R14_SLIPPAGE_MEV_PROTECTION_REVIEW.md) |
| **R15 Manual Approval Record / Session Runbook** | **DEFINED — LIVE STILL BLOCKED** — [docs/R15_MANUAL_APPROVAL_RECORD_AND_SESSION_RUNBOOK.md](./docs/R15_MANUAL_APPROVAL_RECORD_AND_SESSION_RUNBOOK.md) |
| **R16 Micro-Live Implementation Gap Review** | **COMPLETE — LIVE BLOCKED** — [docs/R16_MICRO_LIVE_IMPLEMENTATION_GAP_REVIEW.md](./docs/R16_MICRO_LIVE_IMPLEMENTATION_GAP_REVIEW.md) |
| **R17 Simulated Micro-Live Config + Approval Harness** | **BUILT — LIVE STILL BLOCKED** — [docs/R17_SIMULATED_MICRO_LIVE_CONFIG_AND_APPROVAL_HARNESS.md](./docs/R17_SIMULATED_MICRO_LIVE_CONFIG_AND_APPROVAL_HARNESS.md) |
| **R18 Shadow-Quote Design Review** | **COMPLETE — NOT ACTIVE** — [docs/R18_SHADOW_QUOTE_DESIGN_REVIEW.md](./docs/R18_SHADOW_QUOTE_DESIGN_REVIEW.md) |
| **Recommended next gate** | Continue R7b; shadow quote collection via future gate only; **do not arm** |
| **Safety suite** | **32/32** |
| **Dedicated RPC** | Missing — observation OK; promotion/live submission blocked |
| **Live trading** | **NOT APPROVED** |

See [ACTIVE_MANIFEST.md](./ACTIVE_MANIFEST.md) for canonical paths and [OPERATIONS.md](./docs/OPERATIONS.md) → **R6a 24-hour Dry-run Soak Checkpoints**.

### Future `data/` convention (TracktaOS packaging — not current behavior)

**Today (Sprint 1):** all runtime writers and readers use repo-root filenames listed above and in ACTIVE_MANIFEST. Q10 does not move paths.

**Future option:** TracktaOS may mount a dedicated `data/` directory (or external volume) for ledgers during packaging. A later sprint would update writers/readers together — not in Q10.

Example layout for migration planning only:

```text
data/
  paper_trades.json
  pipeline_candidates.jsonl
  live_trades.jsonl
  execution_audit.jsonl
  ...
```

## Backup And Archive Material

The repo contains historical folders and zip files:

- `automation/`
- `files/`
- `hardreset/`
- `harness/`
- `phase1_files/`
- `*.zip`
- `*_backup.js`
- `*_backup.json`

These should be reviewed for provenance and then either archived outside the TracktaOS source package or imported as historical reference only.

## Environment Variables Found

- `HELIUS_RPC_URL`: preferred dedicated Helius RPC endpoint.
- `HELIUS_API_KEY`: used to derive a Helius RPC URL.
- `SOLANA_RPC_URL`: alternate Solana RPC endpoint.
- `RPC_URL`: used by live preflight and dry-run probe utilities.
- `JUPITER_API_KEY`: optional API key for Jupiter swap build requests.
- `EXPECTED_WALLET_PUBLIC_ADDRESS`: public wallet address consistency check.
- `SOLANA_SIGNER_SECRET`: live-only 64-byte JSON signer array. Do not expose or commit.
- `FOMO_ENABLE_LIVE_SUBMISSION`: live-only arming flag.
- `FOMO_ALLOW_LOOP_LIVE`: live-only loop arming flag.
- `DRY_RUN_PUBKEY`: public key used by `tools/fomo_dry_run_probe.mjs`.
- `INPUT_LAMPORTS`, `SLIPPAGE_BPS`, `ASSUMED_CU`, `PRIORITY_FEE`: dry-run probe tuning values.

## Verification Needed For TracktaOS

- Confirm the desired TracktaOS process model: separate scanner, monitor, dashboard, wallet monitor, and executor processes, or a supervisor-managed bundle.
- Confirm which runtime data files should be migrated, truncated, archived, or regenerated.
- Confirm GMGN CLI availability in the TracktaOS environment.
- Confirm Node.js version and global CLI dependencies.
- Confirm RPC provider strategy and rate limits.
- Confirm dashboard port and access controls.
- Confirm `.env` injection mechanism and secret storage.
- Confirm whether `live_config.json` should be managed by TracktaOS or treated as a mounted runtime config.
- Confirm that live submission remains disabled until an explicit live-approval workflow exists.
- Re-run syntax checks and focused safety tests after migration.

## Known Working Validation Commands

```powershell
node --check live_executor.js
node test_pipeline_candidate_handoff.js
node test_observation_pool.js
node live_executor.js --status
```

Use status-only and validation commands during migration. Avoid live cycles and live loops.
