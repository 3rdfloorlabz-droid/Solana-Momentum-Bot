"use strict";

// test_r36_shadow_execution_harness.js — Sprint 4 R36
// Validates shadow execution harness in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r36 = require("./r36_shadow_execution_harness");
const r29 = require("./r29_real_quote_observer");
const r18 = require("./r18_shadow_quote_review");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const REPO_LIVE_POSITIONS = path.join(__dirname, "live_positions.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;
const beforePositionsHash = fs.existsSync(REPO_LIVE_POSITIONS) ? fs.readFileSync(REPO_LIVE_POSITIONS) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r36-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r36-output-"));
const G = "\x1b[32m✔\x1b[0m";

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

function schemaV2Observation(overrides = {}) {
  return {
    candidateId: "R31-SOL-USDC-001",
    observationSchemaVersion: 2,
    collectedAt: "2026-06-28T05:48:00.019Z",
    provider: "jupiter_quote_readonly",
    routeSummary: "AlphaQ -> Meteora DLMM",
    requestedSlippageBps: 100,
    realizedSlippageBps: null,
    slippageInterpretation: r29.SLIPPAGE_INTERPRETATION,
    priceImpactBps: 0,
    quoteAgeSeconds: 0,
    routeQualityVerdict: r18.DECISION.PASS,
    quoteRequestVerdict: r18.DECISION.PASS,
    gateVerdict: r18.DECISION.PASS,
    rejectionReasons: [],
    approved: false,
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false,
    ...overrides
  };
}

function threeCleanPassObservations() {
  return [
    schemaV2Observation({ candidateId: "R31-SOL-USDC-001", routeSummary: "AlphaQ -> Meteora DLMM" }),
    schemaV2Observation({ candidateId: "R34-SOL-USDC-001", routeSummary: "BisonFi -> AlphaQ -> Meteora DLMM", collectedAt: "2026-06-28T05:56:56.567Z" }),
    schemaV2Observation({ candidateId: "R34-SOL-USDC-002", routeSummary: "GoonFi V2 -> Meteora DLMM", collectedAt: "2026-06-28T05:56:56.568Z" })
  ];
}

function baseOptions(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: __dirname,
    analysisDir: tmpOutput,
    gateDocPresent: true,
    observations: threeCleanPassObservations(),
    recoveryPresent: false,
    generatedAt: "2026-06-23T12:00:00.000Z",
    ...overrides
  };
}

async function runTests() {
  writeSafePosture();

  const missingObs = r36.collectR36ShadowExecutionHarness({
    ...baseOptions(),
    observations: undefined,
    observationsFile: path.join(tmpOutput, "missing-observations.jsonl")
  });
  assert.strictEqual(missingObs.evaluation.status, "BLOCKED");
  console.log(`${G} missing observations file blocks`);

  const legacyIgnored = r36.collectR36ShadowExecutionHarness({
    ...baseOptions(),
    observations: [
      {
        candidateId: "R29-MANUAL-SOL-USDC-001",
        slippageBps: 300,
        gateVerdict: r18.DECISION.REJECT,
        approved: false
      },
      ...threeCleanPassObservations()
    ]
  });
  assert.strictEqual(legacyIgnored.inputSummary.legacyV1Ignored, 1);
  assert.strictEqual(legacyIgnored.summary.decisionCount, 3);
  assert.strictEqual(legacyIgnored.summary.wouldEnterCount, 3);
  console.log(`${G} legacy v1 records ignored`);

  const threeEnter = r36.collectR36ShadowExecutionHarness(baseOptions());
  assert.strictEqual(threeEnter.evaluation.status, "SHADOW_DECISIONS_GENERATED");
  assert.strictEqual(threeEnter.summary.wouldEnterCount, 3);
  assert.strictEqual(threeEnter.summary.skipCount, 0);
  assert.strictEqual(threeEnter.approved, false);
  assert.strictEqual(threeEnter.shadowExecutionActivated, false);
  for (const d of threeEnter.decisions) {
    assert.strictEqual(d.simulatedAction, r36.SIMULATED_ACTION.WOULD_ENTER);
    assert.strictEqual(d.realExecution, false);
    assert.strictEqual(d.positionMutated, false);
  }
  console.log(`${G} 3 clean schema v2 PASS records generate WOULD_ENTER decisions`);

  const warnSkip = r36.collectR36ShadowExecutionHarness({
    ...baseOptions(),
    observations: [schemaV2Observation({ gateVerdict: r18.DECISION.WARN })]
  });
  assert.strictEqual(warnSkip.summary.skipCount, 1);
  assert.strictEqual(warnSkip.decisions[0].simulatedAction, r36.SIMULATED_ACTION.SKIP);
  console.log(`${G} WARN record generates SKIP`);

  const rejectBlocked = r36.collectR36ShadowExecutionHarness({
    ...baseOptions(),
    observations: [
      schemaV2Observation({ candidateId: "R34-REJECT", gateVerdict: r18.DECISION.REJECT }),
      schemaV2Observation({ candidateId: "R34-PASS" })
    ]
  });
  assert.strictEqual(rejectBlocked.inputSummary.blockedCount, 1);
  assert.strictEqual(rejectBlocked.summary.decisionCount, 1);
  assert.strictEqual(rejectBlocked.summary.wouldEnterCount, 1);
  console.log(`${G} REJECT record is skipped with blockedCount`);

  const slippageSkip = r36.collectR36ShadowExecutionHarness({
    ...baseOptions(),
    observations: [schemaV2Observation({ requestedSlippageBps: 150 })]
  });
  assert.strictEqual(slippageSkip.decisions[0].simulatedAction, r36.SIMULATED_ACTION.SKIP);
  console.log(`${G} requestedSlippageBps > 100 generates SKIP`);

  const impactSkip = r36.collectR36ShadowExecutionHarness({
    ...baseOptions(),
    observations: [schemaV2Observation({ priceImpactBps: 150 })]
  });
  assert.strictEqual(impactSkip.decisions[0].simulatedAction, r36.SIMULATED_ACTION.SKIP);
  console.log(`${G} priceImpactBps > 100 generates SKIP`);

  const ageSkip = r36.collectR36ShadowExecutionHarness({
    ...baseOptions(),
    observations: [schemaV2Observation({ quoteAgeSeconds: 15 })]
  });
  assert.strictEqual(ageSkip.decisions[0].simulatedAction, r36.SIMULATED_ACTION.SKIP);
  console.log(`${G} quoteAgeSeconds > 10 generates SKIP`);

  for (const [field, label] of [
    ["approved", "approved true blocks"],
    ["tradingAllowed", "tradingAllowed true blocks"],
    ["signingAllowed", "signingAllowed true blocks"],
    ["submissionAllowed", "submissionAllowed true blocks"],
    ["walletRequired", "walletRequired true blocks"]
  ]) {
    const blocked = r36.collectR36ShadowExecutionHarness({
      ...baseOptions(),
      observations: [schemaV2Observation({ [field]: true })]
    });
    assert.strictEqual(blocked.evaluation.status, "BLOCKED");
    console.log(`${G} ${label}`);
  }

  const realizedSet = r36.collectR36ShadowExecutionHarness({
    ...baseOptions(),
    observations: [schemaV2Observation({ realizedSlippageBps: 50 })]
  });
  assert.strictEqual(realizedSet.evaluation.status, "BLOCKED");
  console.log(`${G} realizedSlippageBps non-null blocks`);

  const malformedPath = path.join(tmpOutput, "malformed-observations.jsonl");
  fs.writeFileSync(malformedPath, '{"candidateId":"ok"}\n{bad json}\n');
  const malformed = r36.collectR36ShadowExecutionHarness({
    ...baseOptions(),
    observations: undefined,
    observationsFile: malformedPath
  });
  assert.strictEqual(malformed.evaluation.status, "INVALID_OBSERVATION_RECORD");
  console.log(`${G} malformed jsonl blocks`);

  const decisionsFile = path.join(tmpOutput, "shadow_execution_decisions.jsonl");
  const statusFile = path.join(tmpOutput, "r36_shadow_execution_status.json");
  const run = r36.runR36ShadowExecutionHarness({
    ...baseOptions(),
    decisionsFile,
    statusFile,
    writeOutput: true,
    print: false
  });
  assert.ok(decisionsFile.startsWith(tmpOutput));
  assert.ok(statusFile.startsWith(tmpOutput));
  assert.strictEqual(run.result.approved, false);
  assert.ok(!JSON.stringify(run.result).includes('"approved": true'));
  const lines = fs.readFileSync(decisionsFile, "utf8").trim().split("\n");
  assert.strictEqual(lines.length, 3);
  console.log(`${G} never returns approved true`);
  console.log(`${G} output only writes to analysis/`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  if (beforePositionsHash) {
    assert.ok(beforePositionsHash.equals(fs.readFileSync(REPO_LIVE_POSITIONS)));
  }
  console.log(`${G} no trading state mutation`);
  console.log(`${G} no position mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  const src = fs.readFileSync(path.join(__dirname, "r36_shadow_execution_harness.js"), "utf8");
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  console.log(`${G} no network calls`);

  console.log("\nR36 SHADOW EXECUTION HARNESS TEST PASSED (19/19)");
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
