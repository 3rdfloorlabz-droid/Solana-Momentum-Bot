"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = __dirname;
const AUDIT_FILE = path.join(ROOT, "execution_audit.jsonl");
const PREFLIGHT_FILES = [
  [path.join(ROOT, "live_positions.json"), "[]\n"],
  [path.join(ROOT, "live_trades.jsonl"), ""],
  [path.join(ROOT, "live_errors.jsonl"), ""],
  [path.join(ROOT, "paper_trades.json"), ""]
];
const TESTS = [
  "test_signer_guard.js",
  "test_pipeline_candidate_handoff.js",
  "test_pipeline_dry_run.js",
  "test_observation_pool.js",
  // Sprint 4 state-ownership regression guards (A1a/A1b/A1c). Static + temp-dir
  // only; they protect single-writer ownership and atomic config writes.
  "test_paper_positions_ownership.js",
  "test_config_store_atomic.js",
  // Sprint 4 R3: observation dedup atomic store (temp runtime root only).
  "test_observation_dedup_atomic.js",
  // Sprint 4 R4: live positions atomic store (temp runtime root only).
  "test_live_positions_atomic.js",
  // Sprint 4 R5: executor singleton guard (temp runtime root only).
  "test_executor_singleton_guard.js",
  // Sprint 4 R6a: soak checkpoint tooling (temp soak_runs only).
  "test_soak_checkpoint_tooling.js",
  // Sprint 4 R7: strategy performance / edge review (temp fixtures only).
  "test_r7_strategy_review.js",
  // Sprint 4 R7b: strategy data collection daily summary (temp fixtures only).
  "test_r7b_daily_summary.js",
  // Sprint 4 R8: risk controls read-only status check (temp fixtures only).
  "test_r8_risk_controls_check.js",
  // Sprint 4 R9: wallet/signer security read-only status check (temp fixtures only).
  "test_r9_wallet_security_check.js",
  // Sprint 4 R10: fake signer simulation harness (temp fixtures only).
  "test_signer_simulation_harness.js",
  // Sprint 4 R11: emergency stop validation via fake simulation (temp fixtures only).
  "test_emergency_stop_validation.js",
  // Sprint 4 R12: micro-live readiness checklist read-only check (temp fixtures only).
  "test_r12_micro_live_readiness_check.js",
  // Sprint 4 R13: final micro-live approval gate read-only check (temp fixtures only).
  "test_r13_micro_live_approval_check.js",
  // Sprint 4 R14: slippage / MEV protection read-only review (temp fixtures only).
  "test_r14_slippage_mev_review.js",
  // Sprint 4 R15: manual approval record / session runbook read-only check (temp fixtures only).
  "test_r15_manual_approval_check.js",
  // Sprint 4 R16: micro-live implementation gap read-only check (temp fixtures only).
  "test_r16_micro_live_gap_check.js",
  // Sprint 4 R17: simulated micro-live config + approval harness (temp fixtures only).
  "test_r17_simulated_micro_live_harness.js",
  // Sprint 4 R18: shadow-quote design fixture review (temp fixtures only).
  "test_r18_shadow_quote_review.js",
  // Sprint 4 R19: shadow quote collection plan read-only check (temp fixtures only).
  "test_r19_shadow_quote_collection_check.js",
  // Sprint 4 R20: fixture dry-run shadow quote collector (temp fixtures only).
  "test_r20_shadow_quote_collector.js",
  // Sprint 4 R21: real quote observation approval gate (temp fixtures only).
  "test_r21_real_quote_observation_approval_check.js",
  // Sprint 4 R22: real quote observation collector disabled by default (temp fixtures only).
  "test_r22_real_quote_observation_collector.js",
  // Sprint 4 R23-R25: provider adapter skeleton + combined provider gate (temp fixtures only).
  "test_r24_provider_adapter_skeleton.js",
  "test_r23_r25_provider_gate_check.js",
  // Sprint 4 R26-R27: activation review + shadow execution design (temp fixtures only).
  "test_r26_r27_activation_shadow_design_check.js",
  // Sprint 4 R28: manual quote observation decision session (temp fixtures only).
  "test_r28_manual_quote_observation_decision_check.js",
  // Sprint 4 R29: real quote observation activation implementation (temp fixtures only).
  "test_r29_real_quote_observer.js",
  // Sprint 4 R30: real quote observation results review (temp fixtures only).
  "test_r30_quote_observation_results_review.js",
  // Sprint 4 R31-R32: quote observation hardening + batch plan (temp fixtures only).
  "test_r31_r32_quote_observation_hardening_check.js",
  // Sprint 4 R33: clean quote observation review + schema v2 validation (temp fixtures only).
  "test_r33_clean_quote_observation_review.js",
  // Sprint 4 R34: small manual quote observation batch review (temp fixtures only).
  "test_r34_manual_quote_batch_review.js",
  // Sprint 4 R35: quote batch results + shadow execution readiness (temp fixtures only).
  "test_r35_quote_batch_shadow_readiness.js",
  // Sprint 4 R36: shadow execution harness — simulation only (temp fixtures only).
  "test_r36_shadow_execution_harness.js",
  // Sprint 4 R37: shadow results + wallet setup readiness (temp fixtures only).
  "test_r37_shadow_results_wallet_readiness.js",
  // Sprint 4 R38: research wallet + secret storage design (temp fixtures only).
  "test_r38_research_wallet_secret_design_check.js",
  // Sprint 4 R8A: micro-live engineering proof preflight (temp fixtures only).
  "test_micro_live_preflight.js",
  // Track A: micro-live hard guardrails (temp fixtures only).
  "test_micro_live_guardrails.js",
  // R39: secret safety scan (temp fixtures only).
  "test_secret_safety_scan.js",
  // R40: mock signer harness (temp fixtures only).
  "test_mock_signer.js",
  // R41: local signer plan preflight (temp fixtures only).
  "test_signer_plan_preflight.js",
  // R42: final micro-live approval review (temp fixtures only).
  "test_r42_final_micro_live_review.js",
  // R41B: local signer safety stubs (temp fixtures only).
  "test_local_signer_safety.js",
  // R41C: dedicated RPC + signer readiness (temp fixtures only).
  "test_micro_live_rpc_preflight.js",
  // R41D: dedicated RPC operator setup loader (temp fixtures only).
  "test_micro_live_rpc_config.js",
  // R43A: final pre-approval readiness review (temp fixtures only).
  "test_r43a_pre_approval_readiness.js",
  // R43B: operator caps approval record check (temp fixtures only).
  "test_r43b_operator_caps_approval_check.js",
  // R43C: guarded real local signer (temp fixtures only).
  "test_local_signer_real_guardrails.js",
  // R43D: final proof preflight (temp fixtures only).
  "test_r43d_final_proof_preflight.js",
  // R43E-1/R43E-2/R43E-3: one-transaction proof harness + operator broadcast deps (temp fixtures only).
  "test_r43e_one_transaction_proof_harness.js",
  // R43E-3: operator broadcast dependency adapter (temp fixtures only).
  "test_r43e_operator_broadcast_deps.js",
  // R43E CLI guards: shared validation without circular deps.
  "test_r43e_real_proof_cli_guards.js",
  // R43F: post-transaction audit review (temp fixtures only).
  "test_r43f_post_transaction_audit.js",
  "test_ownership_guards.js",
  // Sprint 4 A2c guardrails: static guard that the Recovery Action Preview UI
  // stays preview-only (no buttons/forms/POST/spawn/kill/recovery_actions writes).
  "test_recovery_preview_guards.js",
  // Sprint 4 A2i/A2j: static dashboard auth guard (route inventory, forbidden recovery
  // surfaces, A2j fail-closed auth wrapper on config-control POST routes).
  "test_dashboard_auth_guards.js",
  // Sprint 4 A2k: isolated HTTP behavioral auth tests (temp fixtures only; never port 3000).
  "test_dashboard_auth_behavior.js",
  // Sprint 4 A2m: recovery audit writer unit tests (temp fixtures via TRACKTA_RUNTIME_ROOT).
  "test_recovery_audit.js",
  // Sprint 4 A2p: static recovery route boundary guards (no routes implemented yet).
  "test_recovery_route_guards.js",
  // Sprint 4 A2q: fake process harness unit tests (temp fixtures only; no real processes).
  "test_fake_recovery_harness.js",
  // Sprint 4 A2r: low-risk recovery behavioral tests (fake harness + temp audit only).
  "test_low_risk_recovery_behavior.js",
  // Sprint 4 A2s: low-risk recovery route HTTP tests (simulated execution; temp fixtures only).
  "test_low_risk_recovery_routes.js"
];

if (!fs.existsSync(AUDIT_FILE)) {
  fs.writeFileSync(AUDIT_FILE, "");
  console.log("Preflight: created empty execution_audit.jsonl");
}

for (const [file, contents] of PREFLIGHT_FILES) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, contents);
    console.log(`Preflight: created empty ${path.basename(file)}`);
  }
}

const node = process.execPath;
const passed = [];

for (const script of TESTS) {
  console.log(`\n=== ${script} ===`);
  const result = spawnSync(node, [path.join(ROOT, script)], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    const code = result.status === null ? 1 : result.status;
    console.error(`\nFAILED at ${script} (exit ${code})`);
    process.exit(code);
  }

  passed.push(script);
}

console.log(`\n${passed.length}/${TESTS.length} safety tests passed`);
for (const script of passed) {
  console.log(`  ✔ ${script}`);
}
