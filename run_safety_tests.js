"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = __dirname;
const AUDIT_FILE = path.join(ROOT, "execution_audit.jsonl");
const TESTS = [
  "test_signer_guard.js",
  "test_pipeline_candidate_handoff.js",
  "test_pipeline_dry_run.js",
  "test_observation_pool.js"
];

if (!fs.existsSync(AUDIT_FILE)) {
  fs.writeFileSync(AUDIT_FILE, "");
  console.log("Preflight: created empty execution_audit.jsonl");
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
