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
  "test_ownership_guards.js",
  // Sprint 4 A2c guardrails: static guard that the Recovery Action Preview UI
  // stays preview-only (no buttons/forms/POST/spawn/kill/recovery_actions writes).
  "test_recovery_preview_guards.js",
  // Sprint 4 A2i/A2j: static dashboard auth guard (route inventory, forbidden recovery
  // surfaces, A2j fail-closed auth wrapper on config-control POST routes).
  "test_dashboard_auth_guards.js",
  // Sprint 4 A2k: isolated HTTP behavioral auth tests (temp fixtures only; never port 3000).
  "test_dashboard_auth_behavior.js"
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
