"use strict";

// test_r43e_real_proof_cli_guards.js — R43E CLI guard module (no circular deps).

const assert = require("assert");
const { spawnSync } = require("child_process");
const path = require("path");

const cliGuards = require("./r43e_real_proof_cli_guards");
const G = "\x1b[32m✔\x1b[0m";

try {
  assert.strictEqual(typeof cliGuards.parseCliArgs, "function");
  assert.strictEqual(typeof cliGuards.validateCliFlags, "function");
  assert.strictEqual(typeof cliGuards.validateRealProofCli, "function");
  assert.strictEqual(typeof cliGuards.validateRealProofBroadcastCli, "function");
  console.log(`${G} validateRealProofBroadcastCli is a function`);

  const missingFinal = cliGuards.validateRealProofBroadcastCli({
    executeRealProof: true,
    simulate: false,
    humanPresent: true,
    confirmOneTransactionProof: true,
    finalBroadcastConfirmation: false
  });
  assert.strictEqual(missingFinal.ok, false);
  console.log(`${G} missing final confirmation blocks broadcast CLI`);

  const circularCheck = spawnSync(process.execPath, ["-e", `
    const warnings = [];
    process.on("warning", (warning) => {
      warnings.push(String(warning && warning.message ? warning.message : warning));
    });
    require("./r43e_one_transaction_proof_harness.js");
    require("./r43e_operator_broadcast_deps.js");
    const hit = warnings.some((message) => /circular|non-existent property/i.test(message));
    if (hit) {
      console.error(warnings.join("\\n"));
      process.exit(2);
    }
  `], { cwd: __dirname, encoding: "utf8" });
  assert.strictEqual(circularCheck.status, 0, circularCheck.stderr || circularCheck.stdout);
  console.log(`${G} requiring harness and operator deps produces no circular dependency warnings`);

  console.log("\nR43E REAL PROOF CLI GUARDS TEST PASSED (3/3)");
} catch (err) {
  console.error(err);
  process.exit(1);
}
