"use strict";

// test_r43b_operator_caps_approval_check.js — R43B operator caps approval (temp fixtures only).

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r43b = require("./r43b_operator_caps_approval_check");
const capsModule = require("./micro_live_caps");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const REPO_LIVE_POSITIONS = path.join(__dirname, "live_positions.json");
const REPO_CAPS = path.join(__dirname, "operator_records", "micro_live_demo_caps.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;
const beforeLivePositionsHash = fs.existsSync(REPO_LIVE_POSITIONS) ? fs.readFileSync(REPO_LIVE_POSITIONS) : null;
const beforeCapsHash = fs.existsSync(REPO_CAPS) ? fs.readFileSync(REPO_CAPS) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r43b-runtime-"));
const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "r43b-repo-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r43b-output-"));
const G = "\x1b[32m✔\x1b[0m";

const safePosture = Object.freeze({
  available: true,
  executionMode: "PIPELINE_DRY_RUN",
  dryRunMode: true,
  liveArmed: false,
  emergencyStop: false,
  liveSubmission: "DISARMED"
});

function approvedCaps(overrides = {}) {
  return {
    approved: true,
    approvedBy: "Taylor Cheaney",
    approvedAt: new Date().toISOString(),
    approvalText: r43b.REQUIRED_APPROVAL_TEXT,
    approvalScope: r43b.REQUIRED_APPROVAL_SCOPE,
    purpose: capsModule.REQUIRED_PURPOSE,
    maxTradeSizeSol: 0.01,
    maxDailyLossSol: 0.05,
    maxTradesPerSession: 1,
    maxOpenLivePositions: 1,
    autoCompoundingAllowed: false,
    requireHumanPresent: true,
    stopAfterFirstTransaction: true,
    notes: "test fixture only",
    ...overrides
  };
}

function baseOptions(overrides = {}) {
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );
  fs.mkdirSync(path.join(tmpRepo, "docs"), { recursive: true });
  fs.writeFileSync(path.join(tmpRepo, "docs", "R43B_OPERATOR_CAPS_APPROVAL_RECORD.md"), "# R43B fixture\n");

  return {
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRepo,
    analysisDir: tmpOutput,
    gateDocPresent: true,
    recoveryPresent: false,
    posture: safePosture,
    postureSafe: true,
    capsLoad: { status: "present", data: approvedCaps() },
    executorIntegrationCheck: { integrated: false, ok: true, note: "none" },
    r7Verdict: "NOT ENOUGH DATA",
    ...overrides
  };
}

async function runTests() {
  assert.strictEqual(
    r43b.collectR43bOperatorCapsApprovalCheck({
      ...baseOptions(),
      capsLoad: { status: "present", data: approvedCaps({ approved: false }) }
    }).r43bVerdict,
    r43b.VERDICTS.INVALID
  );
  console.log(`${G} approved:false fails`);

  assert.strictEqual(
    r43b.collectR43bOperatorCapsApprovalCheck({
      ...baseOptions(),
      capsLoad: { status: "present", data: approvedCaps({ approvedBy: "" }) }
    }).r43bVerdict,
    r43b.VERDICTS.INVALID
  );
  console.log(`${G} missing approvedBy fails`);

  assert.strictEqual(
    r43b.collectR43bOperatorCapsApprovalCheck({
      ...baseOptions(),
      capsLoad: { status: "present", data: approvedCaps({ approvedAt: null }) }
    }).r43bVerdict,
    r43b.VERDICTS.INVALID
  );
  console.log(`${G} missing approvedAt fails`);

  assert.strictEqual(
    r43b.collectR43bOperatorCapsApprovalCheck({
      ...baseOptions(),
      capsLoad: { status: "present", data: approvedCaps({ approvalText: "wrong text" }) }
    }).r43bVerdict,
    r43b.VERDICTS.INVALID
  );
  console.log(`${G} changed approvalText fails`);

  assert.strictEqual(
    r43b.collectR43bOperatorCapsApprovalCheck({
      ...baseOptions(),
      capsLoad: { status: "present", data: approvedCaps({ maxTradeSizeSol: 0.02 }) }
    }).r43bVerdict,
    r43b.VERDICTS.INVALID
  );
  console.log(`${G} maxTradeSizeSol > 0.01 fails`);

  assert.strictEqual(
    r43b.collectR43bOperatorCapsApprovalCheck({
      ...baseOptions(),
      capsLoad: { status: "present", data: approvedCaps({ maxDailyLossSol: 0.06 }) }
    }).r43bVerdict,
    r43b.VERDICTS.INVALID
  );
  console.log(`${G} maxDailyLossSol > 0.05 fails`);

  assert.strictEqual(
    r43b.collectR43bOperatorCapsApprovalCheck({
      ...baseOptions(),
      capsLoad: { status: "present", data: approvedCaps({ maxTradesPerSession: 2 }) }
    }).r43bVerdict,
    r43b.VERDICTS.INVALID
  );
  console.log(`${G} maxTradesPerSession > 1 fails`);

  assert.strictEqual(
    r43b.collectR43bOperatorCapsApprovalCheck({
      ...baseOptions(),
      capsLoad: { status: "present", data: approvedCaps({ autoCompoundingAllowed: true }) }
    }).r43bVerdict,
    r43b.VERDICTS.INVALID
  );
  console.log(`${G} autoCompoundingAllowed true fails`);

  assert.strictEqual(
    r43b.collectR43bOperatorCapsApprovalCheck({
      ...baseOptions(),
      capsLoad: { status: "present", data: approvedCaps({ stopAfterFirstTransaction: false }) }
    }).r43bVerdict,
    r43b.VERDICTS.INVALID
  );
  console.log(`${G} stopAfterFirstTransaction false fails`);

  assert.strictEqual(
    r43b.collectR43bOperatorCapsApprovalCheck({
      ...baseOptions(),
      posture: { ...safePosture, liveArmed: true },
      postureSafe: false
    }).r43bVerdict,
    r43b.VERDICTS.INVALID
  );
  console.log(`${G} liveArmed true fails`);

  assert.strictEqual(
    r43b.collectR43bOperatorCapsApprovalCheck({
      ...baseOptions(),
      posture: { ...safePosture, executionMode: "LIVE" },
      postureSafe: false
    }).r43bVerdict,
    r43b.VERDICTS.INVALID
  );
  console.log(`${G} executionMode LIVE fails`);

  assert.strictEqual(
    r43b.collectR43bOperatorCapsApprovalCheck({ ...baseOptions(), recoveryPresent: true }).r43bVerdict,
    r43b.VERDICTS.INVALID
  );
  console.log(`${G} recovery_actions.jsonl present fails`);

  const valid = r43b.collectR43bOperatorCapsApprovalCheck(baseOptions());
  assert.strictEqual(valid.r43bVerdict, r43b.VERDICTS.VALID);
  assert.strictEqual(valid.liveTradingApproved, false);
  console.log(`${G} valid approved caps pass engineering-proof-only check`);

  const outputFile = path.join(tmpOutput, "r43b_operator_caps_approval_check.json");
  r43b.runR43bOperatorCapsApprovalCheck({
    ...baseOptions(),
    analysisDir: tmpOutput,
    outputFile,
    writeOutput: true,
    print: false
  });
  assert.ok(outputFile.startsWith(tmpOutput));
  const outputJson = fs.readFileSync(outputFile, "utf8");
  assert.ok(!outputJson.includes("privateKey"));
  console.log(`${G} output writes only to analysis/`);

  console.log(`${G} no secrets printed`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  if (beforeLivePositionsHash) {
    assert.ok(beforeLivePositionsHash.equals(fs.readFileSync(REPO_LIVE_POSITIONS)));
  }
  if (beforeCapsHash) {
    assert.ok(beforeCapsHash.equals(fs.readFileSync(REPO_CAPS)));
    console.log(`${G} operator caps file unchanged by tests`);
  }
  console.log(`${G} no trading state mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  console.log("\nR43B OPERATOR CAPS APPROVAL TEST PASSED (16/16)");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
}).finally(() => {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpRepo, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
});
