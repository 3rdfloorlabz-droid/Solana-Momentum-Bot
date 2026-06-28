"use strict";

// test_r21_real_quote_observation_approval_check.js — Sprint 4 R21
// Validates read-only real quote observation approval gate in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r21 = require("./r21_real_quote_observation_approval_check");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r21-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r21-output-"));
const G = "\x1b[32m✔\x1b[0m";

const allGateDocs = { r18: true, r19: true, r20: true, r21: true };

function defaultRecord(overrides = {}) {
  return {
    approvalId: "R21-TEST-0001",
    operatorName: "TEST_OPERATOR",
    approvedAt: null,
    approvalStatus: "NOT_APPROVED",
    quoteObservationMode: true,
    networkPollingAllowed: true,
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false,
    maxQuotesPerTokenPerMinute: 3,
    maxTokensPerCycle: 5,
    maxQuotesPerDay: 100,
    cooldownSeconds: 5,
    allowedProviders: ["FIXTURE"],
    allowedCandidateSources: ["fixture_replay"],
    stopConditionsAcknowledged: false,
    noWalletAcknowledged: false,
    noSigningAcknowledged: false,
    noSubmissionAcknowledged: false,
    rateLimitAcknowledged: false,
    costAcknowledged: false,
    operatorSignature: null,
    ...overrides
  };
}

function reviewableRecord() {
  return defaultRecord({
    stopConditionsAcknowledged: true,
    noWalletAcknowledged: true,
    noSigningAcknowledged: true,
    noSubmissionAcknowledged: true,
    rateLimitAcknowledged: true,
    costAcknowledged: true,
    approvalStatus: "NOT_APPROVED",
    operatorSignature: null
  });
}

function baseOptions(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: __dirname,
    analysisDir: tmpOutput,
    gateDocs: allGateDocs,
    r18HarnessPresent: true,
    r20CollectorPresent: true,
    r20FixturesPresent: true,
    safetySuiteGreen: true,
    networkPollingActive: false,
    ...overrides
  };
}

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

  const missingR20 = r21.collectR21RealQuoteObservationApprovalStatus({
    ...baseOptions(),
    r20CollectorPresent: false
  });
  assert.strictEqual(missingR20.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} missing R20 blocks`);

  const missingR21 = r21.collectR21RealQuoteObservationApprovalStatus({
    ...baseOptions(),
    gateDocs: { r18: true, r19: true, r20: true, r21: false }
  });
  assert.strictEqual(missingR21.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} missing R21 blocks`);

  const missingRecord = r21.collectR21RealQuoteObservationApprovalStatus({
    ...baseOptions(),
    requireApprovalRecord: true
  });
  assert.strictEqual(missingRecord.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} missing approval record blocks`);

  const defaultRecordStatus = r21.collectR21RealQuoteObservationApprovalStatus({
    ...baseOptions(),
    approvalRecord: defaultRecord()
  });
  assert.strictEqual(defaultRecordStatus.evaluation.gateStatus, "NOT_APPROVED");
  assert.strictEqual(defaultRecordStatus.approved, false);
  console.log(`${G} default approval record is NOT_APPROVED`);

  const trading = r21.collectR21RealQuoteObservationApprovalStatus({
    ...baseOptions(),
    approvalRecord: defaultRecord({ tradingAllowed: true })
  });
  assert.strictEqual(trading.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} approval record with tradingAllowed true blocks`);

  const signing = r21.collectR21RealQuoteObservationApprovalStatus({
    ...baseOptions(),
    approvalRecord: defaultRecord({ signingAllowed: true })
  });
  assert.strictEqual(signing.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} approval record with signingAllowed true blocks`);

  const submission = r21.collectR21RealQuoteObservationApprovalStatus({
    ...baseOptions(),
    approvalRecord: defaultRecord({ submissionAllowed: true })
  });
  assert.strictEqual(submission.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} approval record with submissionAllowed true blocks`);

  const wallet = r21.collectR21RealQuoteObservationApprovalStatus({
    ...baseOptions(),
    approvalRecord: defaultRecord({ walletRequired: true })
  });
  assert.strictEqual(wallet.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} approval record with walletRequired true blocks`);

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: true,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const armed = r21.collectR21RealQuoteObservationApprovalStatus({
    ...baseOptions(),
    approvalRecord: defaultRecord()
  });
  assert.strictEqual(armed.evaluation.gateStatus, "BLOCKED");
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: false,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const dryFalse = r21.collectR21RealQuoteObservationApprovalStatus({
    ...baseOptions(),
    approvalRecord: defaultRecord()
  });
  assert.strictEqual(dryFalse.evaluation.gateStatus, "BLOCKED");
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );
  console.log(`${G} liveArmed true blocks`);
  console.log(`${G} dryRunMode false blocks`);

  fs.writeFileSync(path.join(tmpRuntime, "recovery_actions.jsonl"), '{"action":"test"}\n');
  const recovery = r21.collectR21RealQuoteObservationApprovalStatus({
    ...baseOptions(),
    approvalRecord: defaultRecord()
  });
  assert.strictEqual(recovery.evaluation.gateStatus, "BLOCKED");
  fs.unlinkSync(path.join(tmpRuntime, "recovery_actions.jsonl"));
  console.log(`${G} recovery_actions.jsonl present blocks`);

  const polling = r21.collectR21RealQuoteObservationApprovalStatus({
    ...baseOptions(),
    networkPollingActive: true,
    approvalRecord: defaultRecord()
  });
  assert.strictEqual(polling.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} network polling active flag blocks`);

  const reviewable = r21.collectR21RealQuoteObservationApprovalStatus({
    ...baseOptions(),
    approvalRecord: reviewableRecord()
  });
  assert.strictEqual(reviewable.evaluation.gateStatus, "REVIEWABLE_ONLY");
  assert.strictEqual(reviewable.approved, false);
  console.log(`${G} reviewable fixture returns REVIEWABLE_ONLY, not approved`);

  const outputFile = path.join(tmpOutput, "r21_real_quote_observation_approval_status.json");
  const result = r21.runR21RealQuoteObservationApprovalCheck({
    ...baseOptions(),
    outputFile,
    writeOutput: true,
    print: false
  });
  assert.ok(outputFile.startsWith(tmpOutput));
  assert.strictEqual(result.status.approved, false);
  assert.ok(!JSON.stringify(result.status).includes('"approved": true'));
  console.log(`${G} never returns approved true`);
  console.log(`${G} output only writes to analysis/`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  console.log(`${G} no trading state mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  const src = fs.readFileSync(path.join(__dirname, "r21_real_quote_observation_approval_check.js"), "utf8");
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  console.log(`${G} no network calls`);

  console.log("\nR21 REAL QUOTE OBSERVATION APPROVAL CHECK TEST PASSED (18/18)");
} finally {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
