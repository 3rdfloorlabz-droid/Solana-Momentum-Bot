"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const validator = require("./validate_live_system");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "validate-drift-"));
}

function writeTempFile(root, relativePath, contents) {
  const full = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
  return full;
}

function runValidatorCli(cwd) {
  const result = spawnSync(process.execPath, [path.join(__dirname, "validate_live_system.js")], {
    cwd,
    encoding: "utf8",
    env: process.env
  });
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
}

(async () => {
  const repoRoot = __dirname;
  let tempRoot = null;

  try {
    // V1 — current repository production scan passes; docs excluded
    const repoViolations = validator.scanProductionHardcodedSignerAssignments(repoRoot);
    assert(repoViolations.length === 0, `repo production scan should pass, found: ${repoViolations.join(", ")}`);
    assert(
      validator.isExcludedSecretScanPath("docs/OPERATIONS.md"),
      "docs path must be excluded from production secret scan"
    );
    assert(
      validator.isExcludedSecretScanPath("test_signer_guard.js"),
      "test files must be excluded from production secret scan"
    );

    tempRoot = makeTempRoot();
    writeTempFile(tempRoot, "docs/OPERATIONS.md", "SOLANA_SIGNER_SECRET=<real signer>\n");
    writeTempFile(tempRoot, "bad_production.js", "SOLANA_SIGNER_SECRET=hardcoded-secret-value\n");
    const docOnlyScan = validator.scanProductionHardcodedSignerAssignments(tempRoot);
    assert(docOnlyScan.length === 1, "injected production .js hardcoded secret must fail scan");
    assert(docOnlyScan[0].replace(/\\/g, "/") === "bad_production.js", "violation must target production js file");

    // V2 — policy bounds
    assert(validator.checkMaxSubmitRetriesPolicy(2), "maxSubmitRetries 2 must pass");
    assert(!validator.checkMaxSubmitRetriesPolicy(3), "maxSubmitRetries 3 must fail");
    assert(!validator.checkMaxSubmitRetriesPolicy(-1), "maxSubmitRetries -1 must fail");

    // V3 — current executor structure passes; weakened fixture fails
    const executorSource = fs.readFileSync(path.join(repoRoot, "live_executor.js"), "utf8");
    const liveStructure = validator.evaluateLiveSubmissionStructure(executorSource);
    assert(liveStructure.pass, "current live_executor LIVE structure must pass");
    assert(liveStructure.checks.armingBeforePipeline, "arming-before-pipeline required");
    assert(liveStructure.checks.simulateBeforeSign, "simulate-before-sign required");
    assert(liveStructure.checks.signBeforeSubmit, "sign-before-submit required");
    assert(liveStructure.checks.submitBeforeConfirm, "submit-before-confirm required");
    assert(liveStructure.checks.confirmBeforeFill, "confirm-before-fill required");

    const weakenedStructure = validator.evaluateLiveSubmissionStructure(
      executorSource.replace("async function completeLiveSwapFromPipeline", "async function removedCompleteLiveSwapFromPipeline")
    );
    assert(!weakenedStructure.pass, "missing completion function must fail structural check");

    // V4 — exact YES gate passes; weakened gate fails
    assert(validator.evaluateArmingGate(executorSource), "current arming gate must pass exact YES requirement");
    const weakenedGate = executorSource.replace(
      'process.env.FOMO_ENABLE_LIVE_SUBMISSION === "YES"',
      'process.env.FOMO_ENABLE_LIVE_SUBMISSION !== "NO"'
    );
    assert(!validator.evaluateArmingGate(weakenedGate), "weakened arming gate must fail");

    // Full validator CLI on canonical repo
    const cli = runValidatorCli(repoRoot);
    assert(cli.status === 0, `validate_live_system.js must pass on repo root (exit ${cli.status})`);
    assert(/LIVE SYSTEM VALIDATION PASSED/.test(cli.stdout), "validator must report PASS");

    console.log("VALIDATE LIVE SYSTEM DRIFT TEST PASSED");
  } finally {
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
})().catch(error => {
  console.error("VALIDATE LIVE SYSTEM DRIFT TEST FAILED:", error.message);
  process.exitCode = 1;
});
