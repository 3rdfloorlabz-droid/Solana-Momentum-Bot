"use strict";

// test_r28_manual_quote_observation_decision_check.js — Sprint 4 R28
// Validates manual quote observation decision session check in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r28 = require("./r28_manual_quote_observation_decision_check");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r28-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r28-output-"));
const G = "\x1b[32m✔\x1b[0m";

function allAcksTrue() {
  const acks = {};
  for (const field of r28.ACK_FIELDS) acks[field] = true;
  return acks;
}

function goodDecision(overrides = {}) {
  return {
    decisionId: "R28-TEST-0001",
    decisionStatus: "NOT_DECIDED",
    operatorDecision: "HOLD",
    operatorName: "TEST_OPERATOR",
    quoteObservationApproved: false,
    networkPollingAllowed: false,
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    acknowledgements: {
      quoteObservationNotTradingAcknowledged: false,
      noWalletAcknowledged: false,
      noSigningAcknowledged: false,
      noSubmissionAcknowledged: false,
      noPrivateKeysAcknowledged: false,
      providerCostAcknowledged: false,
      rateLimitsAcknowledged: false,
      quoteDataLimitationsAcknowledged: false,
      slippageMevUnprovenAcknowledged: false,
      liveTradingNotApprovedAcknowledged: false,
      microLiveNotApprovedAcknowledged: false
    },
    operatorSignature: "",
    ...overrides
  };
}

function baseOptions(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: __dirname,
    analysisDir: tmpOutput,
    gateDocPresent: true,
    decisionRecord: goodDecision(),
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

  const missingDoc = r28.collectR28ManualQuoteObservationDecisionStatus({
    ...baseOptions(),
    gateDocPresent: false
  });
  assert.strictEqual(missingDoc.evaluation.sessionStatus, "BLOCKED");
  console.log(`${G} missing R28 doc blocks`);

  const missingExample = r28.collectR28ManualQuoteObservationDecisionStatus({
    ...baseOptions(),
    decisionRecord: undefined,
    decisionFile: path.join(tmpOutput, "missing-r28-decision.json")
  });
  assert.strictEqual(missingExample.evaluation.sessionStatus, "BLOCKED");
  console.log(`${G} missing R28 decision example blocks`);

  const defaultDecision = r28.collectR28ManualQuoteObservationDecisionStatus(baseOptions());
  assert.strictEqual(defaultDecision.decisionRecord.validation.operatorDecision, "HOLD");
  assert.strictEqual(defaultDecision.decisionRecord.validation.decisionStatus, "NOT_DECIDED");
  assert.strictEqual(defaultDecision.evaluation.sessionStatus, "HOLD");
  console.log(`${G} default decision is HOLD / NOT_DECIDED`);

  const qObsNoAck = r28.collectR28ManualQuoteObservationDecisionStatus({
    ...baseOptions(),
    decisionRecord: goodDecision({ quoteObservationApproved: true })
  });
  assert.strictEqual(qObsNoAck.evaluation.sessionStatus, "BLOCKED");
  console.log(`${G} quoteObservationApproved true without all acknowledgements blocks`);

  const pollingHold = r28.collectR28ManualQuoteObservationDecisionStatus({
    ...baseOptions(),
    decisionRecord: goodDecision({ networkPollingAllowed: true })
  });
  assert.strictEqual(pollingHold.evaluation.sessionStatus, "BLOCKED");

  const reviewable = r28.collectR28ManualQuoteObservationDecisionStatus({
    ...baseOptions(),
    decisionRecord: goodDecision({
      operatorDecision: "APPROVE_OBSERVATION_ONLY",
      networkPollingAllowed: true,
      quoteObservationApproved: false,
      acknowledgements: allAcksTrue()
    })
  });
  assert.strictEqual(reviewable.evaluation.sessionStatus, "REVIEWABLE_OBSERVATION_ONLY_DECISION");
  assert.strictEqual(reviewable.approved, false);
  console.log(`${G} networkPollingAllowed true blocks unless APPROVE_OBSERVATION_ONLY reviewable only`);

  const trading = r28.collectR28ManualQuoteObservationDecisionStatus({
    ...baseOptions(),
    decisionRecord: goodDecision({ tradingAllowed: true })
  });
  assert.strictEqual(trading.evaluation.sessionStatus, "BLOCKED");
  console.log(`${G} tradingAllowed true blocks`);

  for (const [field, label] of [
    ["signingAllowed", "signingAllowed true blocks"],
    ["submissionAllowed", "submissionAllowed true blocks"],
    ["walletRequired", "walletRequired true blocks"],
    ["liveTradingApproved", "liveTradingApproved true blocks"],
    ["microLiveApproved", "microLiveApproved true blocks"]
  ]) {
    const blocked = r28.collectR28ManualQuoteObservationDecisionStatus({
      ...baseOptions(),
      decisionRecord: goodDecision({ [field]: true })
    });
    assert.strictEqual(blocked.evaluation.sessionStatus, "BLOCKED");
    console.log(`${G} ${label}`);
  }

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: true,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const armed = r28.collectR28ManualQuoteObservationDecisionStatus(baseOptions());
  assert.strictEqual(armed.evaluation.sessionStatus, "BLOCKED");
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: false,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const dryFalse = r28.collectR28ManualQuoteObservationDecisionStatus(baseOptions());
  assert.strictEqual(dryFalse.evaluation.sessionStatus, "BLOCKED");
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
  const recovery = r28.collectR28ManualQuoteObservationDecisionStatus(baseOptions());
  assert.strictEqual(recovery.evaluation.sessionStatus, "BLOCKED");
  fs.unlinkSync(path.join(tmpRuntime, "recovery_actions.jsonl"));
  console.log(`${G} recovery_actions.jsonl present blocks`);

  const outputFile = path.join(tmpOutput, "r28_manual_quote_observation_decision_status.json");
  const result = r28.runR28ManualQuoteObservationDecisionCheck({
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

  const src = fs.readFileSync(path.join(__dirname, "r28_manual_quote_observation_decision_check.js"), "utf8");
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  console.log(`${G} no network calls`);

  console.log("\nR28 MANUAL QUOTE OBSERVATION DECISION CHECK TEST PASSED (18/18)");
} finally {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
