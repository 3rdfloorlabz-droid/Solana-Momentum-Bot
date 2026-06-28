"use strict";

// test_r29_real_quote_observer.js — Sprint 4 R29
// Validates gated real quote observer in temp fixtures only. Mock provider only — no network.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r29 = require("./r29_real_quote_observer");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r29-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r29-output-"));
const G = "\x1b[32m✔\x1b[0m";

function goodApproval(overrides = {}) {
  return {
    approvalId: "R29-TEST-APPROVAL",
    approvalStatus: "APPROVE_OBSERVATION_ONLY",
    operatorDecision: "APPROVE_OBSERVATION_ONLY",
    quoteObservationApproved: true,
    networkPollingAllowed: true,
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    maxQuotesPerTokenPerMinute: 3,
    maxTokensPerCycle: 5,
    maxQuotesPerDay: 100,
    cooldownSeconds: 5,
    allowedProviders: ["jupiter_quote_readonly"],
    allowedCandidateSources: ["manual", "fixture", "paper_candidate"],
    stopConditionsAcknowledged: true,
    noWalletAcknowledged: true,
    noSigningAcknowledged: true,
    noSubmissionAcknowledged: true,
    rateLimitAcknowledged: true,
    costAcknowledged: true,
    operatorSignature: "TEST — observation only",
    ...overrides
  };
}

function goodConfig(overrides = {}) {
  return {
    schemaVersion: 1,
    configType: "EXAMPLE_ONLY",
    active: false,
    networkPollingAllowed: false,
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false,
    defaultProvider: "jupiter_quote_readonly",
    ...overrides
  };
}

function mockQuoteProvider(normalizedOverrides = {}) {
  return async (candidate) => ({
    inputMint: candidate.inputMint,
    outputMint: candidate.outputMint,
    inputAmount: candidate.intendedInputAmountSol,
    quotedOutputAmount: 1000,
    minimumOutputAmount: 990,
    slippageBps: 80,
    priceImpactBps: 50,
    routeSummary: "MOCK_POOL_A -> MOCK_POOL_B",
    quoteAgeSeconds: 1,
    routeProvider: "jupiter_quote_readonly",
    ...normalizedOverrides
  });
}

function baseOptions(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: __dirname,
    analysisDir: tmpOutput,
    approval: goodApproval(),
    config: goodConfig(),
    observeOnce: false,
    quoteProvider: mockQuoteProvider(),
    persistRateState: true,
    writeOutput: true,
    print: false,
    ...overrides
  };
}

function writeSafePosture() {
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );
}

async function runTests() {
  writeSafePosture();

  const defaultResult = await r29.runR29RealQuoteObserver(baseOptions());
  assert.strictEqual(defaultResult.status.observerStatus, "DISABLED");
  assert.strictEqual(defaultResult.status.approved, false);
  console.log(`${G} default run DISABLED`);

  const noFlagCycle = await r29.runObservationCycle(baseOptions());
  assert.strictEqual(noFlagCycle.observerStatus, "DISABLED");
  assert.strictEqual(noFlagCycle.observationCount, 0);
  console.log(`${G} no --observe-once means no network`);

  const missingApproval = await r29.runObservationCycle({
    ...baseOptions(),
    observeOnce: true,
    approval: undefined,
    approvalFile: path.join(tmpOutput, "missing-approval.json")
  });
  assert.strictEqual(missingApproval.observerStatus, "INVALID_APPROVAL");
  console.log(`${G} missing approval blocks`);

  const badApproval = await r29.runObservationCycle({
    ...baseOptions(),
    observeOnce: true,
    approval: goodApproval({ approvalStatus: "HOLD" })
  });
  assert.strictEqual(badApproval.observerStatus, "INVALID_APPROVAL");
  console.log(`${G} invalid approval blocks`);

  for (const [field, label] of [
    ["tradingAllowed", "tradingAllowed true blocks"],
    ["signingAllowed", "signingAllowed true blocks"],
    ["submissionAllowed", "submissionAllowed true blocks"],
    ["walletRequired", "walletRequired true blocks"],
    ["liveTradingApproved", "liveTradingApproved true blocks"],
    ["microLiveApproved", "microLiveApproved true blocks"]
  ]) {
    const blocked = await r29.runObservationCycle({
      ...baseOptions(),
      observeOnce: true,
      approval: goodApproval({ [field]: true })
    });
    assert.strictEqual(blocked.observerStatus, "INVALID_APPROVAL");
    console.log(`${G} ${label}`);
  }

  const badConfig = await r29.runObservationCycle({
    ...baseOptions(),
    observeOnce: true,
    config: goodConfig({ active: true })
  });
  assert.strictEqual(badConfig.observerStatus, "INVALID_CONFIG");
  console.log(`${G} invalid config blocks`);

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: true,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const armed = await r29.runObservationCycle({ ...baseOptions(), observeOnce: true });
  assert.strictEqual(armed.observerStatus, "BLOCKED");

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: false,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const dryFalse = await r29.runObservationCycle({ ...baseOptions(), observeOnce: true });
  assert.strictEqual(dryFalse.observerStatus, "BLOCKED");

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "LIVE",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const liveMode = await r29.runObservationCycle({ ...baseOptions(), observeOnce: true });
  assert.strictEqual(liveMode.observerStatus, "BLOCKED");

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "MICRO_LIVE",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const microLive = await r29.runObservationCycle({ ...baseOptions(), observeOnce: true });
  assert.strictEqual(microLive.observerStatus, "BLOCKED");

  writeSafePosture();
  console.log(`${G} liveArmed true blocks`);
  console.log(`${G} dryRunMode false blocks`);
  console.log(`${G} executionMode LIVE/MICRO_LIVE blocks`);

  fs.writeFileSync(path.join(tmpRuntime, "recovery_actions.jsonl"), '{"action":"test"}\n');
  const recovery = await r29.runObservationCycle({ ...baseOptions(), observeOnce: true });
  assert.strictEqual(recovery.observerStatus, "STOPPED_BY_SAFETY_GATE");
  fs.unlinkSync(path.join(tmpRuntime, "recovery_actions.jsonl"));
  console.log(`${G} recovery_actions.jsonl present blocks`);

  let providerCalls = 0;
  const countingProvider = async (candidate) => {
    providerCalls += 1;
    return mockQuoteProvider()(candidate);
  };

  const observationsFile = path.join(tmpOutput, "real_quote_observations.jsonl");
  const statusFile = path.join(tmpOutput, "r29_real_quote_observation_status.json");
  const observeResult = await r29.runR29RealQuoteObserver({
    ...baseOptions(),
    observeOnce: true,
    quoteProvider: countingProvider,
    observationsFile,
    statusFile,
    candidatesFile: path.join(__dirname, "examples", "shadow_quote_candidates.example.json"),
    nowMs: Date.parse("2026-06-23T12:00:00.000Z")
  });

  assert.strictEqual(observeResult.status.observerStatus, "OBSERVATION_COMPLETE");
  assert.ok(providerCalls > 0);
  assert.ok(fs.existsSync(observationsFile));
  assert.ok(fs.existsSync(statusFile));
  const lines = fs.readFileSync(observationsFile, "utf8").trim().split("\n");
  const firstObs = JSON.parse(lines[lines.length - 1]);
  assert.strictEqual(firstObs.approved, false);
  assert.strictEqual(firstObs.tradingAllowed, false);
  assert.strictEqual(firstObs.signingAllowed, false);
  assert.strictEqual(firstObs.submissionAllowed, false);
  assert.strictEqual(firstObs.walletRequired, false);
  assert.strictEqual(firstObs.networkPolling, true);
  assert.strictEqual(observeResult.status.approved, false);
  console.log(`${G} one observation writes analysis output`);
  console.log(`${G} output records approved false`);
  console.log(`${G} output records trading/signing/submission false`);
  console.log(`${G} tests use mock provider only`);

  const rateStateFile = path.join(tmpOutput, "r29_rate_limit_state.json");
  await r29.runR29RealQuoteObserver({
    ...baseOptions(),
    observeOnce: true,
    quoteProvider: countingProvider,
    rateStateFile,
    approval: goodApproval({ maxTokensPerCycle: 1, cooldownSeconds: 0 }),
    candidatesFile: path.join(__dirname, "examples", "shadow_quote_candidates.example.json"),
    nowMs: Date.parse("2026-06-23T12:00:01.000Z"),
    observationsFile: path.join(tmpOutput, "rate-test-obs.jsonl"),
    statusFile: path.join(tmpOutput, "rate-test-status.json")
  });
  const limited = await r29.runObservationCycle({
    ...baseOptions(),
    observeOnce: true,
    approval: goodApproval({ maxQuotesPerDay: 0, cooldownSeconds: 0 }),
    rateStateFile,
    nowMs: Date.parse("2026-06-23T12:00:02.000Z")
  });
  assert.strictEqual(limited.observerStatus, "RATE_LIMITED");
  console.log(`${G} rate limits enforced`);

  let errorCalls = 0;
  const failingProvider = async () => {
    errorCalls += 1;
    throw new Error("mock provider failure");
  };
  const providerErr = await r29.runObservationCycle({
    ...baseOptions(),
    observeOnce: true,
    quoteProvider: failingProvider,
    rateStateFile: path.join(tmpOutput, "provider-error-rate-state.json"),
    candidatesFile: path.join(__dirname, "examples", "shadow_quote_candidates.example.json"),
    nowMs: Date.parse("2026-06-23T12:00:03.000Z")
  });
  assert.strictEqual(providerErr.observerStatus, "PROVIDER_ERROR");
  assert.ok(errorCalls >= 2);
  console.log(`${G} provider error fails closed`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  console.log(`${G} no live_config.json mutation`);
  console.log(`${G} no trading state mutation`);

  const statusJson = JSON.stringify(observeResult.status);
  assert.ok(!statusJson.includes('"approved": true'));
  console.log(`${G} never returns approved true`);

  assert.ok(!statusJson.includes("privateKey"));
  console.log(`${G} no wallet/signer/secret handling`);

  assert.ok(observationsFile.startsWith(tmpOutput));
  console.log(`${G} output only writes to analysis/`);

  console.log("\nR29 REAL QUOTE OBSERVER TEST PASSED (22/22)");
}

runTests()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
    try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
  });
