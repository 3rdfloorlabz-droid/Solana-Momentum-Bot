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

Equivalent: `node run_safety_tests.js` — runs **56/56** safety tests including Track A guardrails and R39–R42 signer/micro-live gates.

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
| **R8A Micro-live Engineering Proof Plan** | **DEFINED — ENGINEERING PROOF ONLY** — [docs/R8A_MICRO_LIVE_ENGINEERING_PROOF_PLAN.md](./docs/R8A_MICRO_LIVE_ENGINEERING_PROOF_PLAN.md) · operator fast-track; **does NOT bypass R7** |
| **Track A Micro-Live Hard Guardrails** | **BUILT — GUARDRAIL INFRASTRUCTURE ONLY** — [docs/TRACK_A_MICRO_LIVE_GUARDRAILS.md](./docs/TRACK_A_MICRO_LIVE_GUARDRAILS.md) · **live trading NOT approved** |
| **R39 Signer Safety Design** | **DEFINED — SIGNER DESIGN ONLY — NOT READY FOR IMPLEMENTATION** — [docs/R39_SIGNER_SAFETY_DESIGN.md](./docs/R39_SIGNER_SAFETY_DESIGN.md) · **no key handled** |
| **R40 Mock Signer Test Plan** | **COMPLETE — MOCK HARNESS BUILT — NO EXECUTOR INTEGRATION** — [docs/R40_MOCK_SIGNER_TEST_PLAN.md](./docs/R40_MOCK_SIGNER_TEST_PLAN.md) · **fake signing only** |
| **R41 Local Signer Implementation Plan** | **DEFINED — PLAN ONLY — NOT READY FOR IMPLEMENTATION** — [docs/R41_LOCAL_SIGNER_IMPLEMENTATION_PLAN.md](./docs/R41_LOCAL_SIGNER_IMPLEMENTATION_PLAN.md) · **no real signer** |
| **R41B Local Signer Safety Stubs** | **BUILT — STUB ONLY — NO REAL SIGNING** — [docs/R41B_LOCAL_SIGNER_SAFETY_STUBS.md](./docs/R41B_LOCAL_SIGNER_SAFETY_STUBS.md) |
| **R41C Dedicated RPC + Signer Readiness** | **BUILT — READINESS CHECK ONLY — NOT APPROVED** — [docs/R41C_DEDICATED_RPC_AND_SIGNER_READINESS.md](./docs/R41C_DEDICATED_RPC_AND_SIGNER_READINESS.md) · **live trading NOT approved** |
| **R41D Dedicated RPC Operator Setup** | **BUILT — LOCAL CONFIG ONLY — NOT APPROVED** — [docs/R41D_DEDICATED_RPC_OPERATOR_SETUP.md](./docs/R41D_DEDICATED_RPC_OPERATOR_SETUP.md) · **no real RPC committed** |
| **R43A Final Pre-Approval Readiness Review** | **BUILT — PRE-APPROVAL ONLY — NOT LIVE EXECUTION** — [docs/R43A_FINAL_PRE_APPROVAL_READINESS_REVIEW.md](./docs/R43A_FINAL_PRE_APPROVAL_READINESS_REVIEW.md) · **live trading NOT approved** |
| **R43B Operator Caps Approval Record** | **RECORDED — ENGINEERING PROOF ONLY — NOT LIVE TRADING** — [docs/R43B_OPERATOR_CAPS_APPROVAL_RECORD.md](./docs/R43B_OPERATOR_CAPS_APPROVAL_RECORD.md) |
| **R43C Real Local Signer Under Guardrails** | **BUILT — GUARDED — NOT LIVE TRADING — NO SUBMISSION** — [docs/R43C_REAL_LOCAL_SIGNER_GUARDRAILS.md](./docs/R43C_REAL_LOCAL_SIGNER_GUARDRAILS.md) |
| **R43D Final Proof Preflight** | **BUILT — READ-ONLY PREFLIGHT — NOT TRANSACTION** — [docs/R43D_FINAL_PROOF_PREFLIGHT.md](./docs/R43D_FINAL_PROOF_PREFLIGHT.md) |
| **R43E-1 One Transaction Proof Harness** | **BUILT — SIMULATION ONLY — NO SUBMISSION** — [docs/R43E_ONE_TRANSACTION_PROOF_HARNESS.md](./docs/R43E_ONE_TRANSACTION_PROOF_HARNESS.md) |
| **Operator caps approval** | **APPROVED — ENGINEERING PROOF ONLY** — `operator_records/micro_live_demo_caps.json` · one-transaction scope |
| **R42 Final Micro-Live Approval Review** | **COMPLETE — READY TO CREATE OPERATOR CAPS FILE** — [docs/R42_FINAL_MICRO_LIVE_APPROVAL_REVIEW.md](./docs/R42_FINAL_MICRO_LIVE_APPROVAL_REVIEW.md) · **not full live approval** |
| **Operator caps draft** | **APPROVED — ENGINEERING PROOF ONLY** — `operator_records/micro_live_demo_caps.json` · R43B record valid |
| **FOMO Strategic Pivot** | **DEFINED — PLANNING ONLY** — [docs/FOMO_STRATEGIC_PIVOT_AND_ENGINE_ROADMAP.md](./docs/FOMO_STRATEGIC_PIVOT_AND_ENGINE_ROADMAP.md) · Track A + Track B roadmap |
| **Recommended next gate** | Track A R43E-2 real transaction review · Track B **B1 thesis** |
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
| **R19 Shadow Quote Collection Plan** | **DEFINED — NOT ACTIVE** — [docs/R19_SHADOW_QUOTE_COLLECTION_PLAN.md](./docs/R19_SHADOW_QUOTE_COLLECTION_PLAN.md) |
| **R20 Fixture + Dry-Run Shadow Quote Collector** | **BUILT — FIXTURE ONLY — NETWORK POLLING BLOCKED** — [docs/R20_FIXTURE_DRY_RUN_SHADOW_QUOTE_COLLECTOR.md](./docs/R20_FIXTURE_DRY_RUN_SHADOW_QUOTE_COLLECTOR.md) |
| **R21 Real Quote Observation Approval Gate** | **DEFINED — POLLING NOT ACTIVE** — [docs/R21_REAL_QUOTE_OBSERVATION_APPROVAL_GATE.md](./docs/R21_REAL_QUOTE_OBSERVATION_APPROVAL_GATE.md) |
| **R22 Real Quote Observation Collector** | **BUILT — DISABLED BY DEFAULT** — [docs/R22_REAL_QUOTE_OBSERVATION_COLLECTOR_DISABLED.md](./docs/R22_REAL_QUOTE_OBSERVATION_COLLECTOR_DISABLED.md) |
| **R23 Real Provider Implementation Review** | **DEFINED — NOT ACTIVE** — [docs/R23_REAL_PROVIDER_IMPLEMENTATION_REVIEW.md](./docs/R23_REAL_PROVIDER_IMPLEMENTATION_REVIEW.md) |
| **R24 Disabled Provider Adapter Skeleton** | **BUILT — NETWORK OFF** — [docs/R24_DISABLED_PROVIDER_ADAPTER_SKELETON.md](./docs/R24_DISABLED_PROVIDER_ADAPTER_SKELETON.md) |
| **R25 Activation Approval Record** | **DEFINED — NOT APPROVED** — [docs/R25_REAL_QUOTE_OBSERVATION_ACTIVATION_APPROVAL_RECORD.md](./docs/R25_REAL_QUOTE_OBSERVATION_ACTIVATION_APPROVAL_RECORD.md) |
| **R26 Activation Review** | **DEFINED — NOT ACTIVATED** — [docs/R26_REAL_QUOTE_OBSERVATION_ACTIVATION_REVIEW.md](./docs/R26_REAL_QUOTE_OBSERVATION_ACTIVATION_REVIEW.md) |
| **R27 Shadow Execution Design** | **DEFINED — NOT ACTIVE** — [docs/R27_SHADOW_EXECUTION_DESIGN.md](./docs/R27_SHADOW_EXECUTION_DESIGN.md) |
| **R28 Manual Quote Observation Decision Session** | **DEFINED — NOT APPROVED** — [docs/R28_MANUAL_QUOTE_OBSERVATION_DECISION_SESSION.md](./docs/R28_MANUAL_QUOTE_OBSERVATION_DECISION_SESSION.md) |
| **R29 Real Quote Observation Activation** | **IMPLEMENTED — TRADING STILL BLOCKED** — [docs/R29_REAL_QUOTE_OBSERVATION_ACTIVATION_IMPLEMENTATION.md](./docs/R29_REAL_QUOTE_OBSERVATION_ACTIVATION_IMPLEMENTATION.md) |
| **R29a Jupiter Quote Endpoint Migration** | **PATCHED** — default quote base `https://lite-api.jup.ag/swap/v1/quote`; old host `quote-api.jup.ag` removed |
| **R30 Real Quote Observation Results Review** | **COMPLETE — ROUTE REJECTED BY POLICY** — [docs/R30_REAL_QUOTE_OBSERVATION_RESULTS_REVIEW.md](./docs/R30_REAL_QUOTE_OBSERVATION_RESULTS_REVIEW.md) |
| **R31 Quote Observation Hardening** | **COMPLETE — TRADING STILL BLOCKED** — [docs/R31_QUOTE_OBSERVATION_HARDENING.md](./docs/R31_QUOTE_OBSERVATION_HARDENING.md) |
| **R32 Additional Observation Batch Plan** | **DEFINED — MANUAL ONLY** — [docs/R32_ADDITIONAL_OBSERVATION_BATCH_PLAN.md](./docs/R32_ADDITIONAL_OBSERVATION_BATCH_PLAN.md) |
| **R33 Clean Quote Observation Review** | **COMPLETE — TRADING STILL BLOCKED** — [docs/R33_CLEAN_QUOTE_OBSERVATION_REVIEW.md](./docs/R33_CLEAN_QUOTE_OBSERVATION_REVIEW.md) |
| **R34 Small Manual Quote Batch Review** | **DEFINED — OBSERVATION ONLY** — [docs/R34_SMALL_MANUAL_QUOTE_OBSERVATION_BATCH_REVIEW.md](./docs/R34_SMALL_MANUAL_QUOTE_OBSERVATION_BATCH_REVIEW.md) |
| **R35 Quote Batch Results + Shadow Readiness** | **COMPLETE — READY FOR SHADOW HARNESS DESIGN** — [docs/R35_QUOTE_BATCH_RESULTS_AND_SHADOW_READINESS.md](./docs/R35_QUOTE_BATCH_RESULTS_AND_SHADOW_READINESS.md) |
| **R36 Shadow Execution Harness** | **BUILT — SIMULATION ONLY** — [docs/R36_SHADOW_EXECUTION_HARNESS.md](./docs/R36_SHADOW_EXECUTION_HARNESS.md) |
| **R37 Shadow Results + Wallet Setup Readiness** | **COMPLETE — READY FOR WALLET SETUP DESIGN ONLY** — [docs/R37_SHADOW_RESULTS_AND_WALLET_SETUP_READINESS.md](./docs/R37_SHADOW_RESULTS_AND_WALLET_SETUP_READINESS.md) |
| **R38 Research Wallet + Secret Storage Design** | **DEFINED — NO KEY HANDLED** — [docs/R38_RESEARCH_WALLET_SECRET_STORAGE_DESIGN.md](./docs/R38_RESEARCH_WALLET_SECRET_STORAGE_DESIGN.md) |
| **Recommended next gate** | Track A R43E-2 real transaction review · Track B **B1 thesis** |
| **Safety suite** | **63/63** |
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
