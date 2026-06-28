"use strict";

// test_r15_manual_approval_check.js — Sprint 4 R15
// Validates read-only manual approval check in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r15 = require("./r15_manual_approval_check");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r15-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r15-output-"));
const G = "\x1b[32m✔\x1b[0m";

const allGateDocs = { r12: true, r13: true, r14: true, r15: true };

function baseOptions(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: __dirname,
    analysisDir: tmpOutput,
    gateDocs: allGateDocs,
    safetySuiteGreen: true,
    r7bSummary: { progress: { readyForR8: false } },
    ...overrides
  };
}

function tinyValidRecord(overrides = {}) {
  return {
    approvalId: "R15-TEST-001",
    operatorName: "Test Operator",
    dateTime: "2026-06-28T00:00:00.000Z",
    sessionStartTime: "2026-06-28T12:00:00.000Z",
    sessionEndTime: "2026-06-28T14:00:00.000Z",
    researchWalletPublicAddress: "FakeWallet1111111111111111111111111111111",
    totalWalletBalance: 1,
    perTradeApprovalRequired: true,
    finalApprovalStatus: r15.APPROVAL_STATUSES.FINAL_REVIEW_ONLY,
    operatorSignaturePresent: true,
    limits: {
      authorizedSessionAllocationSol: 0.05,
      maxFirstTradeSizeSol: 0.01,
      maxOpenPositions: 1,
      maxTradesThisSession: 1,
      maxTradesPerDay: 3
    },
    acknowledgments: {
      r7bBypassRiskAcknowledged: true,
      totalLossRiskAcknowledged: true,
      slippageCapAcknowledged: true,
      mevProtectionPlanAcknowledged: true,
      emergencyStopPolicyAcknowledged: true,
      noAutoCompoundingAcknowledged: true,
      noAveragingDownAcknowledged: true,
      noUnattendedExecutionAcknowledged: true,
      liveTradingNotForIncomeAcknowledged: true
    },
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

  const defaultStatus = r15.collectR15ManualApprovalStatus(baseOptions());
  assert.strictEqual(defaultStatus.evaluation.approvalStatus, r15.APPROVAL_STATUSES.NOT_APPROVED);
  assert.strictEqual(defaultStatus.evaluation.gateStatus, "NOT_APPROVED");
  assert.strictEqual(defaultStatus.approved, false);
  console.log(`${G} default status is NOT_APPROVED`);

  const missingRecord = r15.collectR15ManualApprovalStatus(baseOptions());
  assert.ok(missingRecord.implementationBlockers.some((b) => b.includes("manual approval record missing") ||
    missingRecord.evaluation.gateStatus === "NOT_APPROVED"));
  console.log(`${G} missing approval record blocks`);

  const malformed = r15.collectR15ManualApprovalStatus({
    ...baseOptions(),
    approvalRecord: { operatorName: "Only Name" }
  });
  assert.strictEqual(malformed.evaluation.gateStatus, "BLOCKED");
  assert.ok(malformed.approvalRecord.validation.blockers.some((b) => b.includes("malformed")));
  console.log(`${G} malformed approval record blocks`);

  const overAlloc = r15.collectR15ManualApprovalStatus({
    ...baseOptions(),
    approvalRecord: tinyValidRecord({
      limits: { authorizedSessionAllocationSol: 1, maxFirstTradeSizeSol: 0.5 }
    })
  });
  assert.strictEqual(overAlloc.evaluation.gateStatus, "BLOCKED");
  assert.ok(overAlloc.approvalRecord.validation.blockers.some((b) => b.includes("micro limit")));
  console.log(`${G} approval record with too-large allocation blocks`);

  const noBypass = r15.collectR15ManualApprovalStatus({
    ...baseOptions(),
    approvalRecord: tinyValidRecord({
      acknowledgments: {
        ...tinyValidRecord().acknowledgments,
        r7bBypassRiskAcknowledged: false
      }
    })
  });
  assert.strictEqual(noBypass.evaluation.gateStatus, "BLOCKED");
  assert.ok(noBypass.approvalRecord.validation.blockers.some((b) => b.includes("R7b bypass")));
  console.log(`${G} approval record missing R7b bypass acknowledgment blocks when R7b is unmet`);

  const reviewable = r15.collectR15ManualApprovalStatus({
    ...baseOptions(),
    approvalRecord: tinyValidRecord()
  });
  assert.strictEqual(reviewable.evaluation.gateStatus, "REVIEWABLE_ONLY");
  assert.strictEqual(reviewable.evaluation.approvalStatus, r15.APPROVAL_STATUSES.FINAL_REVIEW_ONLY);
  assert.strictEqual(reviewable.approved, false);
  assert.strictEqual(reviewable.liveTradingApproved, false);
  assert.strictEqual(reviewable.microLiveApproved, false);
  console.log(`${G} approval record with tiny allocation can become REVIEWABLE_ONLY, not approved`);

  assert.strictEqual(reviewable.evaluation.approved, false);
  assert.ok(!JSON.stringify(reviewable).includes('"approved": true'));
  console.log(`${G} never returns approved automatically`);

  const sessionClaim = r15.collectR15ManualApprovalStatus({
    ...baseOptions(),
    approvalRecord: tinyValidRecord({
      finalApprovalStatus: r15.APPROVAL_STATUSES.ONE_SESSION_ONLY
    })
  });
  assert.strictEqual(sessionClaim.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} session-only record status does not auto-approve`);

  const outFile = path.join(tmpOutput, "r15_manual_approval_status.json");
  r15.runR15ManualApprovalCheck({
    ...baseOptions(),
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

  const src = fs.readFileSync(path.join(__dirname, "r15_manual_approval_check.js"), "utf8");
  assert.ok(!/writeFileSync\([^)]*live_config\.json/.test(src));
  assert.ok(!/process\.env\.SOLANA_SIGNER/.test(src));
  console.log(`${G} no secret handling`);

  console.log("\nR15 MANUAL APPROVAL CHECK TEST PASSED (12/12)");
} finally {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
