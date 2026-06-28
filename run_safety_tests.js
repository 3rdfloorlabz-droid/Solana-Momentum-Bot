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
