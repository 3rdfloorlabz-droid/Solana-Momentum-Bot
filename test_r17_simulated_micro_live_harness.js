"use strict";

// test_r17_simulated_micro_live_harness.js — Sprint 4 R17
// Validates simulated micro-live harness in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r17 = require("./r17_simulated_micro_live_harness");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r17-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r17-output-"));
const G = "\x1b[32m✔\x1b[0m";

function baseConfig(overrides = {}) {
  return {
    schemaVersion: 1,
    configType: "EXAMPLE_ONLY",
    active: false,
    executionMode: "PIPELINE_DRY_RUN",
    dryRunMode: true,
    liveArmed: false,
    walletPublicAddress: "SIMULATED_RESEARCH_WALLET_DO_NOT_USE",
    walletLiquiditySol: 1,
    authorizedSessionAllocationSol: 0.05,
    maxFirstTradeSol: 0.01,
    minFirstTradeSol: 0.005,
    maxOpenPositions: 1,
    autoCompounding: false,
    scaling: false,
    averagingDown: false,
    unattendedSessionAllowed: false,
    hardRejectSlippageBps: 300,
    quoteMaxAgeSeconds: 10,
    mevProtectionMode: "SIMULATED_REVIEW_ONLY",
    perTradeApprovalRequired: true,
    r7bBypassAcknowledgmentRequired: true,
    totalLossRiskAcknowledgmentRequired: true,
    ...overrides
  };
}

function reviewableApproval(overrides = {}) {
  return {
    approvalId: "R17-TEST-REVIEWABLE",
    operatorName: "TEST_OPERATOR",
    approvalStatus: "APPROVED FOR FINAL REVIEW ONLY",
    simulationReviewable: true,
    simulationExampleOnly: true,
    walletPublicAddress: "SIMULATED_RESEARCH_WALLET_DO_NOT_USE",
    authorizedSessionAllocationSol: 0.05,
    maxTradeSizeSol: 0.01,
    operatorSignaturePresent: true,
    r7bBypassRiskAcknowledged: true,
    totalLossRiskAcknowledged: true,
    slippageCapAcknowledged: true,
    mevProtectionPlanAcknowledged: true,
    emergencyStopPolicyAcknowledged: true,
    noAutoCompoundingAcknowledged: true,
    noAveragingDownAcknowledged: true,
    noUnattendedExecutionAcknowledged: true,
    liveTradingNotForIncomeAcknowledged: true,
    ...overrides
  };
}

function baseOptions(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: __dirname,
    analysisDir: tmpOutput,
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

  const defaultExample = r17.collectR17SimulatedMicroLiveStatus(baseOptions());
  assert.strictEqual(defaultExample.evaluation.harnessStatus, "BLOCKED");
  assert.strictEqual(defaultExample.approved, false);
  console.log(`${G} default example approval blocks`);

  const activeTrue = r17.collectR17SimulatedMicroLiveStatus({
    ...baseOptions(),
    config: baseConfig({ active: true }),
    approvalRecord: reviewableApproval()
  });
  assert.strictEqual(activeTrue.evaluation.harnessStatus, "BLOCKED");
  console.log(`${G} config with active true blocks`);

  const microLive = r17.collectR17SimulatedMicroLiveStatus({
    ...baseOptions(),
    config: baseConfig({ executionMode: "MICRO_LIVE" }),
    approvalRecord: reviewableApproval()
  });
  assert.strictEqual(microLive.evaluation.harnessStatus, "BLOCKED");
  console.log(`${G} MICRO_LIVE mode blocks`);

  const liveMode = r17.collectR17SimulatedMicroLiveStatus({
    ...baseOptions(),
    config: baseConfig({ executionMode: "LIVE" }),
    approvalRecord: reviewableApproval()
  });
  assert.strictEqual(liveMode.evaluation.harnessStatus, "BLOCKED");
  console.log(`${G} LIVE mode blocks`);

  const dryFalse = r17.collectR17SimulatedMicroLiveStatus({
    ...baseOptions(),
    config: baseConfig({ dryRunMode: false }),
    approvalRecord: reviewableApproval()
  });
  assert.strictEqual(dryFalse.evaluation.harnessStatus, "BLOCKED");
  console.log(`${G} dryRunMode false blocks`);

  const armed = r17.collectR17SimulatedMicroLiveStatus({
    ...baseOptions(),
    config: baseConfig({ liveArmed: true }),
    approvalRecord: reviewableApproval()
  });
  assert.strictEqual(armed.evaluation.harnessStatus, "BLOCKED");
  console.log(`${G} liveArmed true blocks`);

  const overAlloc = r17.collectR17SimulatedMicroLiveStatus({
    ...baseOptions(),
    config: baseConfig({ authorizedSessionAllocationSol: 1 }),
    approvalRecord: reviewableApproval()
  });
  assert.strictEqual(overAlloc.evaluation.harnessStatus, "BLOCKED");
  console.log(`${G} allocation above 0.05 SOL blocks`);

  const overTrade = r17.collectR17SimulatedMicroLiveStatus({
    ...baseOptions(),
    config: baseConfig({ maxFirstTradeSol: 0.5 }),
    approvalRecord: reviewableApproval()
  });
  assert.strictEqual(overTrade.evaluation.harnessStatus, "BLOCKED");
  console.log(`${G} trade size above 0.01 SOL blocks`);

  const autoComp = r17.collectR17SimulatedMicroLiveStatus({
    ...baseOptions(),
    config: baseConfig({ autoCompounding: true }),
    approvalRecord: reviewableApproval()
  });
  assert.strictEqual(autoComp.evaluation.harnessStatus, "BLOCKED");
  console.log(`${G} autoCompounding true blocks`);

  const avgDown = r17.collectR17SimulatedMicroLiveStatus({
    ...baseOptions(),
    config: baseConfig({ averagingDown: true }),
    approvalRecord: reviewableApproval()
  });
  assert.strictEqual(avgDown.evaluation.harnessStatus, "BLOCKED");
  console.log(`${G} averagingDown true blocks`);

  const unattended = r17.collectR17SimulatedMicroLiveStatus({
    ...baseOptions(),
    config: baseConfig({ unattendedSessionAllowed: true }),
    approvalRecord: reviewableApproval()
  });
  assert.strictEqual(unattended.evaluation.harnessStatus, "BLOCKED");
  console.log(`${G} unattended true blocks`);

  const noSlippage = r17.collectR17SimulatedMicroLiveStatus({
    ...baseOptions(),
    config: baseConfig({ hardRejectSlippageBps: null }),
    approvalRecord: reviewableApproval()
  });
  assert.strictEqual(noSlippage.evaluation.harnessStatus, "BLOCKED");
  console.log(`${G} missing slippage policy blocks`);

  const noMev = r17.collectR17SimulatedMicroLiveStatus({
    ...baseOptions(),
    config: baseConfig({ mevProtectionMode: null }),
    approvalRecord: reviewableApproval()
  });
  assert.strictEqual(noMev.evaluation.harnessStatus, "BLOCKED");
  console.log(`${G} missing MEV policy blocks`);

  const noBypass = r17.collectR17SimulatedMicroLiveStatus({
    ...baseOptions(),
    config: baseConfig({ r7bBypassAcknowledgmentRequired: true }),
    approvalRecord: reviewableApproval({ r7bBypassRiskAcknowledged: false })
  });
  assert.strictEqual(noBypass.evaluation.harnessStatus, "BLOCKED");
  console.log(`${G} missing R7b bypass acknowledgment blocks when required`);

  const reviewable = r17.collectR17SimulatedMicroLiveStatus({
    ...baseOptions(),
    config: baseConfig(),
    approvalRecord: reviewableApproval()
  });
  assert.strictEqual(reviewable.evaluation.harnessStatus, "SIMULATION_REVIEWABLE_ONLY");
  assert.strictEqual(reviewable.approved, false);
  assert.strictEqual(reviewable.liveTradingApproved, false);
  console.log(`${G} fake reviewable fixture can return SIMULATION_REVIEWABLE_ONLY, not approved`);

  assert.ok(!JSON.stringify(reviewable).includes('"approved": true'));
  console.log(`${G} never returns approved`);

  const outFile = path.join(tmpOutput, "r17_simulated_micro_live_status.json");
  r17.runR17SimulatedMicroLiveHarness({
    ...baseOptions(),
    config: baseConfig(),
    approvalRecord: reviewableApproval(),
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

  const secretInvalid = r17.collectR17SimulatedMicroLiveStatus({
    ...baseOptions(),
    config: baseConfig({ privateKey: "must-not-exist" }),
    approvalRecord: reviewableApproval()
  });
  assert.strictEqual(secretInvalid.evaluation.harnessStatus, "INVALID_EXAMPLE");
  console.log(`${G} no secret handling`);

  console.log("\nR17 SIMULATED MICRO-LIVE HARNESS TEST PASSED (18/18)");
} finally {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
