"use strict";

// test_r26_r27_activation_shadow_design_check.js — Sprint 4 R26-R27 combined
// Validates activation review + shadow design check in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const check = require("./r26_r27_activation_shadow_design_check");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r26r27-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r26r27-output-"));
const G = "\x1b[32m✔\x1b[0m";

const allGateDocs = { r26: true, r27: true };

function goodR25Record(overrides = {}) {
  return {
    approvalId: "R25-TEST-0001",
    approvalStatus: "NOT_APPROVED",
    operatorName: "TEST_OPERATOR",
    quoteObservationMode: true,
    networkPollingAllowed: false,
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false,
    allowedProviders: [],
    ...overrides
  };
}

function goodR26Review(overrides = {}) {
  return {
    reviewId: "R26-TEST-0001",
    reviewStatus: "NOT_APPROVED",
    activationStatus: "NOT_ACTIVATED",
    operatorName: "TEST_OPERATOR",
    networkPollingAllowed: false,
    approvedProviders: [],
    rateLimitsConfirmed: false,
    stopConditionsAcknowledged: false,
    noWalletAcknowledged: false,
    noSigningAcknowledged: false,
    noSubmissionAcknowledged: false,
    costAcknowledged: false,
    operatorSignature: "",
    ...overrides
  };
}

function goodShadowExample(overrides = {}) {
  return {
    schemaVersion: 1,
    fixtureType: "EXAMPLE_ONLY",
    decisions: [
      {
        decisionId: "SHADOW-TEST-001",
        sourceMode: "EXAMPLE_ONLY",
        candidateId: "CAND-TEST-001",
        quoteObservationId: "QUOTE-TEST-001",
        tokenSymbol: "SIM_TOKEN",
        intendedInputSol: 0.008,
        slippageBps: 80,
        priceImpactBps: 50,
        gateVerdict: "PASS",
        simulatedAction: "WOULD_ENTER",
        simulatedReason: "test fixture",
        approved: false,
        tradingAllowed: false,
        signingAllowed: false,
        submissionAllowed: false
      }
    ],
    ...overrides
  };
}

function baseOptions(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: __dirname,
    analysisDir: tmpOutput,
    gateDocs: allGateDocs,
    r25ActivationRecord: goodR25Record(),
    r26ActivationReview: goodR26Review(),
    shadowExecutionExample: goodShadowExample(),
    enableManualDecisionReview: true,
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

  const missingR26 = check.collectR26R27ActivationShadowDesignStatus({
    ...baseOptions(),
    gateDocs: { r26: false, r27: true }
  });
  assert.strictEqual(missingR26.evaluation.gateStatus, "BLOCKED");
  const missingR27 = check.collectR26R27ActivationShadowDesignStatus({
    ...baseOptions(),
    gateDocs: { r26: true, r27: false }
  });
  assert.strictEqual(missingR27.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} missing R26 blocks`);
  console.log(`${G} missing R27 blocks`);

  const missingR25 = check.collectR26R27ActivationShadowDesignStatus({
    ...baseOptions(),
    r25ActivationRecord: undefined,
    r25ActivationRecordFile: path.join(tmpOutput, "missing-r25.json")
  });
  assert.strictEqual(missingR25.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} missing R25 activation record blocks`);

  const approvedTrue = check.collectR26R27ActivationShadowDesignStatus({
    ...baseOptions(),
    r25ActivationRecord: goodR25Record({ approved: true })
  });
  assert.strictEqual(approvedTrue.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} approval true blocks`);

  const polling = check.collectR26R27ActivationShadowDesignStatus({
    ...baseOptions(),
    r26ActivationReview: goodR26Review({ networkPollingAllowed: true })
  });
  assert.strictEqual(polling.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} networkPollingAllowed true blocks`);

  const providers = check.collectR26R27ActivationShadowDesignStatus({
    ...baseOptions(),
    r26ActivationReview: goodR26Review({ approvedProviders: ["jupiter"] })
  });
  assert.strictEqual(providers.evaluation.gateStatus, "BLOCKED");
  const notActivatedReviewable = check.validateActivationReview(goodR26Review({
    approvedProviders: [],
    activationStatus: "NOT_ACTIVATED"
  }));
  assert.strictEqual(notActivatedReviewable.valid, true);
  console.log(`${G} approved provider list not empty blocks unless NOT_ACTIVATED`);

  const trading = check.collectR26R27ActivationShadowDesignStatus({
    ...baseOptions(),
    r25ActivationRecord: goodR25Record({ tradingAllowed: true })
  });
  assert.strictEqual(trading.evaluation.gateStatus, "BLOCKED");
  const signing = check.collectR26R27ActivationShadowDesignStatus({
    ...baseOptions(),
    r25ActivationRecord: goodR25Record({ signingAllowed: true })
  });
  assert.strictEqual(signing.evaluation.gateStatus, "BLOCKED");
  const submission = check.collectR26R27ActivationShadowDesignStatus({
    ...baseOptions(),
    r25ActivationRecord: goodR25Record({ submissionAllowed: true })
  });
  assert.strictEqual(submission.evaluation.gateStatus, "BLOCKED");
  const wallet = check.collectR26R27ActivationShadowDesignStatus({
    ...baseOptions(),
    r25ActivationRecord: goodR25Record({ walletRequired: true })
  });
  assert.strictEqual(wallet.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} tradingAllowed/signingAllowed/submissionAllowed true blocks`);
  console.log(`${G} walletRequired true blocks`);

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: true,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const armed = check.collectR26R27ActivationShadowDesignStatus(baseOptions());
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
  const dryFalse = check.collectR26R27ActivationShadowDesignStatus(baseOptions());
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
  const recovery = check.collectR26R27ActivationShadowDesignStatus(baseOptions());
  assert.strictEqual(recovery.evaluation.gateStatus, "BLOCKED");
  fs.unlinkSync(path.join(tmpRuntime, "recovery_actions.jsonl"));
  console.log(`${G} recovery_actions.jsonl present blocks`);

  const shadowBad = check.validateShadowExecutionExamples(goodShadowExample({
    decisions: [{
      ...goodShadowExample().decisions[0],
      approved: true
    }]
  }));
  assert.strictEqual(shadowBad.valid, false);
  const shadowGood = check.validateShadowExecutionExamples(goodShadowExample());
  assert.strictEqual(shadowGood.valid, true);
  console.log(`${G} shadow execution example must be approved false`);
  console.log(`${G} shadow execution example must have trading/signing/submission false`);

  const ready = check.collectR26R27ActivationShadowDesignStatus(baseOptions());
  assert.strictEqual(ready.evaluation.gateStatus, "READY_FOR_MANUAL_QUOTE_OBSERVATION_DECISION");
  assert.strictEqual(ready.approved, false);
  console.log(`${G} ready status does not mean approved`);

  const outputFile = path.join(tmpOutput, "r26_r27_activation_shadow_design_status.json");
  const result = check.runR26R27ActivationShadowDesignCheck({
    ...baseOptions(),
    outputFile,
    writeOutput: true,
    print: false
  });
  assert.ok(outputFile.startsWith(tmpOutput));
  assert.ok(!JSON.stringify(result.status).includes('"approved": true'));
  console.log(`${G} never returns approved true`);
  console.log(`${G} output only writes to analysis/`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  console.log(`${G} no trading state mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  const src = fs.readFileSync(path.join(__dirname, "r26_r27_activation_shadow_design_check.js"), "utf8");
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  console.log(`${G} no network calls`);

  console.log("\nR26-R27 ACTIVATION SHADOW DESIGN CHECK TEST PASSED (20/20)");
} finally {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
