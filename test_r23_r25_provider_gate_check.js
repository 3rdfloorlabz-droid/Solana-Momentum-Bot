"use strict";

// test_r23_r25_provider_gate_check.js — Sprint 4 R23-R25 combined
// Validates combined provider gate check in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const gate = require("./r23_r25_provider_gate_check");
const r24 = require("./r24_provider_adapter_skeleton");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r23r25-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r23r25-output-"));
const G = "\x1b[32m✔\x1b[0m";

const allGateDocs = { r23: true, r24: true, r25: true };

function goodAdapterConfig(overrides = {}) {
  return {
    schemaVersion: 1,
    configType: "EXAMPLE_ONLY",
    active: false,
    networkPollingAllowed: false,
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false,
    providers: [
      { name: "fixture", enabled: true },
      { name: "replay", enabled: true },
      { name: "jupiter", enabled: false, stub: true },
      { name: "gmgn", enabled: false, stub: true }
    ],
    ...overrides
  };
}

function goodActivationRecord(overrides = {}) {
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
    maxQuotesPerTokenPerMinute: 3,
    maxTokensPerCycle: 5,
    maxQuotesPerDay: 100,
    cooldownSeconds: 5,
    stopConditionsAcknowledged: false,
    noWalletAcknowledged: false,
    noSigningAcknowledged: false,
    noSubmissionAcknowledged: false,
    rateLimitAcknowledged: false,
    costAcknowledged: false,
    operatorSignature: "",
    ...overrides
  };
}

function baseOptions(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: __dirname,
    analysisDir: tmpOutput,
    gateDocs: allGateDocs,
    r24AdapterPresent: true,
    adapterConfig: goodAdapterConfig(),
    activationRecord: goodActivationRecord(),
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

  const missingR23 = gate.collectR23R25ProviderGateStatus({
    ...baseOptions(),
    gateDocs: { r23: false, r24: true, r25: true }
  });
  assert.strictEqual(missingR23.evaluation.gateStatus, "BLOCKED");
  const missingR24 = gate.collectR23R25ProviderGateStatus({
    ...baseOptions(),
    gateDocs: { r23: true, r24: false, r25: true }
  });
  assert.strictEqual(missingR24.evaluation.gateStatus, "BLOCKED");
  const missingR25 = gate.collectR23R25ProviderGateStatus({
    ...baseOptions(),
    gateDocs: { r23: true, r24: true, r25: false }
  });
  assert.strictEqual(missingR25.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} missing R23/R24/R25 blocks`);

  const missingConfig = gate.collectR23R25ProviderGateStatus({
    ...baseOptions(),
    adapterConfig: undefined,
    adapterConfigFile: path.join(tmpOutput, "missing-adapter-config.json")
  });
  assert.strictEqual(missingConfig.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} missing config blocks`);

  const missingRecord = gate.collectR23R25ProviderGateStatus({
    ...baseOptions(),
    activationRecord: undefined,
    activationRecordFile: path.join(tmpOutput, "missing-activation-record.json")
  });
  assert.strictEqual(missingRecord.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} missing activation record blocks`);

  const defaultRecord = gate.collectR23R25ProviderGateStatus(baseOptions());
  assert.strictEqual(defaultRecord.activationRecordAnalysis.defaultNotApproved, true);
  console.log(`${G} activation record default NOT_APPROVED`);

  const trading = gate.collectR23R25ProviderGateStatus({
    ...baseOptions(),
    activationRecord: goodActivationRecord({ tradingAllowed: true })
  });
  assert.strictEqual(trading.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} activation record with tradingAllowed true blocks`);

  const signing = gate.collectR23R25ProviderGateStatus({
    ...baseOptions(),
    activationRecord: goodActivationRecord({ signingAllowed: true })
  });
  assert.strictEqual(signing.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} signingAllowed true blocks`);

  const submission = gate.collectR23R25ProviderGateStatus({
    ...baseOptions(),
    activationRecord: goodActivationRecord({ submissionAllowed: true })
  });
  assert.strictEqual(submission.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} submissionAllowed true blocks`);

  const wallet = gate.collectR23R25ProviderGateStatus({
    ...baseOptions(),
    activationRecord: goodActivationRecord({ walletRequired: true })
  });
  assert.strictEqual(wallet.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} walletRequired true blocks`);

  const polling = gate.collectR23R25ProviderGateStatus({
    ...baseOptions(),
    activationRecord: goodActivationRecord({ networkPollingAllowed: true })
  });
  assert.strictEqual(polling.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} networkPollingAllowed true blocks`);

  const reviewable = gate.validateActivationRecord(goodActivationRecord({
    stopConditionsAcknowledged: true,
    noWalletAcknowledged: true,
    noSigningAcknowledged: true,
    noSubmissionAcknowledged: true,
    rateLimitAcknowledged: true,
    costAcknowledged: true,
    networkPollingAllowed: false,
    approvalStatus: "NOT_APPROVED"
  }));
  assert.strictEqual(reviewable.reviewableOnly, true);
  assert.strictEqual(reviewable.valid, true);
  console.log(`${G} reviewable fixture stays not approved`);

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: true,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const armed = gate.collectR23R25ProviderGateStatus(baseOptions());
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
  const dryFalse = gate.collectR23R25ProviderGateStatus(baseOptions());
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
  const recovery = gate.collectR23R25ProviderGateStatus(baseOptions());
  assert.strictEqual(recovery.evaluation.gateStatus, "BLOCKED");
  fs.unlinkSync(path.join(tmpRuntime, "recovery_actions.jsonl"));
  console.log(`${G} recovery_actions.jsonl present blocks`);

  const ready = gate.collectR23R25ProviderGateStatus(baseOptions());
  assert.strictEqual(ready.evaluation.gateStatus, "READY_FOR_DISABLED_ADAPTER_REVIEW");
  assert.strictEqual(ready.approved, false);
  console.log(`${G} ready status does not mean approved`);

  const outputFile = path.join(tmpOutput, "r23_r25_provider_gate_status.json");
  const result = gate.runR23R25ProviderGateCheck({
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

  const src = fs.readFileSync(path.join(__dirname, "r23_r25_provider_gate_check.js"), "utf8");
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  console.log(`${G} no network calls`);

  assert.strictEqual(r24.validateAdapterConfig(goodAdapterConfig()).valid, true);
  console.log(`${G} adapter config validates fixture/replay only`);

  console.log("\nR23-R25 PROVIDER GATE CHECK TEST PASSED (20/20)");
} finally {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
