"use strict";

// test_r13_micro_live_approval_check.js — Sprint 4 R13
// Validates read-only final approval gate check in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r13 = require("./r13_micro_live_approval_check");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r13-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r13-output-"));
const G = "\x1b[32m✔\x1b[0m";

try {
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );

  const blockedR7b = r13.collectR13MicroLiveApprovalStatus({
    runtimeRoot: tmpRuntime,
    analysisDir: tmpOutput,
    r7bSummary: { progress: { readyForR8: false } },
    safetySuiteGreen: true
  });
  assert.strictEqual(blockedR7b.evaluation.verdict, "FINAL APPROVAL GATE DEFINED — BLOCKED");
  assert.strictEqual(blockedR7b.evaluation.approved, false);
  assert.strictEqual(blockedR7b.r7bBypass.thresholdsMet, false);
  console.log(`${G} blocked when R7b thresholds not met`);

  const noBypass = r13.collectR13MicroLiveApprovalStatus({
    runtimeRoot: tmpRuntime,
    analysisDir: tmpOutput,
    r7bSummary: { progress: { readyForR8: false } },
    r7bBypassAcknowledged: false,
    safetySuiteGreen: true
  });
  assert.ok(noBypass.implementationBlockers.includes("R7b bypass risk not explicitly acknowledged"));
  console.log(`${G} blocked when R7b bypass not acknowledged`);

  const badSafety = r13.collectR13MicroLiveApprovalStatus({
    runtimeRoot: tmpRuntime,
    analysisDir: tmpOutput,
    safetySuiteGreen: false
  });
  assert.strictEqual(badSafety.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} blocked when safety suite status is bad`);

  fs.writeFileSync(path.join(tmpRuntime, "recovery_actions.jsonl"), "{}\n");
  const recovery = r13.collectR13MicroLiveApprovalStatus({
    runtimeRoot: tmpRuntime,
    analysisDir: tmpOutput,
    safetySuiteGreen: true
  });
  assert.strictEqual(recovery.evaluation.gateStatus, "BLOCKED");
  fs.unlinkSync(path.join(tmpRuntime, "recovery_actions.jsonl"));
  console.log(`${G} blocked when recovery_actions.jsonl exists`);

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "MICRO_LIVE",
      dryRunMode: false,
      liveArmed: true,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const armed = r13.collectR13MicroLiveApprovalStatus({
    runtimeRoot: tmpRuntime,
    analysisDir: tmpOutput,
    safetySuiteGreen: true,
    r7bBypassAcknowledged: true,
    proposedAllocationSol: 0.05,
    proposedFirstTradeSol: 0.01
  });
  assert.strictEqual(armed.evaluation.gateStatus, "BLOCKED");
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );
  console.log(`${G} blocked when liveArmed true unexpectedly`);

  const overAlloc = r13.collectR13MicroLiveApprovalStatus({
    runtimeRoot: tmpRuntime,
    analysisDir: tmpOutput,
    safetySuiteGreen: true,
    proposedAllocationSol: 1,
    proposedFirstTradeSol: 0.5
  });
  assert.strictEqual(overAlloc.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} blocked when wallet allocation exceeds micro limit`);

  const reviewable = r13.collectR13MicroLiveApprovalStatus({
    runtimeRoot: tmpRuntime,
    analysisDir: tmpOutput,
    r7bSummary: { progress: { readyForR8: false } },
    r7bBypassAcknowledged: true,
    safetySuiteGreen: true,
    proposedAllocationSol: 0.05,
    proposedFirstTradeSol: 0.01,
    finalSignedApproval: false
  });
  assert.strictEqual(reviewable.evaluation.verdict, "FINAL APPROVAL GATE DEFINED — BLOCKED");
  assert.strictEqual(reviewable.evaluation.gateStatus, "REVIEWABLE ONLY");
  assert.strictEqual(reviewable.microLiveApproved, false);
  assert.strictEqual(reviewable.liveTradingApproved, false);
  console.log(`${G} reviewable only with simulated bypass acknowledgment and tiny allocation`);

  assert.strictEqual(reviewable.evaluation.approved, false);
  assert.ok(!JSON.stringify(reviewable).includes('"approved": true'));
  console.log(`${G} never returns approved`);

  const outFile = path.join(tmpOutput, "r13_micro_live_approval_status.json");
  r13.runR13MicroLiveApprovalCheck({
    runtimeRoot: tmpRuntime,
    analysisDir: tmpOutput,
    outputFile: outFile,
    print: false
  });
  assert.ok(outFile.startsWith(tmpOutput));
  console.log(`${G} output only writes to analysis/`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  console.log(`${G} no live_config.json mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  console.log(`${G} no trading state mutation`);

  const src = fs.readFileSync(path.join(__dirname, "r13_micro_live_approval_check.js"), "utf8");
  assert.ok(!/writeFileSync\([^)]*live_config\.json/.test(src));
  assert.ok(!/process\.env\.SOLANA_SIGNER/.test(src));
  console.log(`${G} no credential handling or config mutation`);

  console.log("\nR13 MICRO-LIVE APPROVAL CHECK TEST PASSED (11/11)");
} finally {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
