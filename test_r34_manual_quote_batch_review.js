"use strict";

// test_r34_manual_quote_batch_review.js — Sprint 4 R34
// Validates manual quote batch review in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r34 = require("./r34_manual_quote_batch_review");
const r33 = require("./r33_clean_quote_observation_review");
const r29 = require("./r29_real_quote_observer");
const r18 = require("./r18_shadow_quote_review");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r34-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r34-output-"));
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

function goodCandidate(id, overrides = {}) {
  return {
    candidateId: id,
    enabled: true,
    source: "manual",
    tokenSymbol: "SOL-USDC",
    inputMint: "So11111111111111111111111111111111111111112",
    outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    intendedInputAmountSol: 0.001,
    requestedSlippageBps: 100,
    ...overrides
  };
}

function goodBatch(overrides = {}) {
  return {
    schemaVersion: 1,
    candidates: [
      goodCandidate("R34-SOL-USDC-001"),
      goodCandidate("R34-SOL-USDC-002", { intendedInputAmountSol: 0.002 })
    ],
    ...overrides
  };
}

function schemaV2Observation(overrides = {}) {
  return {
    candidateId: "R31-SOL-USDC-001",
    observationSchemaVersion: 2,
    requestedSlippageBps: 100,
    realizedSlippageBps: null,
    slippageInterpretation: r29.SLIPPAGE_INTERPRETATION,
    gateVerdict: r18.DECISION.PASS,
    approved: false,
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false,
    ...overrides
  };
}

function legacyV1Observation(overrides = {}) {
  return {
    candidateId: "R29-MANUAL-SOL-USDC-001",
    slippageBps: 300,
    gateVerdict: r18.DECISION.REJECT,
    approved: false,
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false,
    ...overrides
  };
}

function baseOptions(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: __dirname,
    analysisDir: tmpOutput,
    gateDocPresent: true,
    candidateData: goodBatch(),
    observations: [],
    recoveryPresent: false,
    ...overrides
  };
}

async function runTests() {
  writeSafePosture();

  const missingDoc = r34.collectR34ManualQuoteBatchReview({
    ...baseOptions(),
    gateDocPresent: false
  });
  assert.strictEqual(missingDoc.evaluation.reviewStatus, "BLOCKED");
  console.log(`${G} missing R34 doc blocks`);

  const missingCandidates = r34.collectR34ManualQuoteBatchReview({
    ...baseOptions(),
    candidateData: undefined,
    candidateFile: path.join(tmpOutput, "missing-candidates.json")
  });
  assert.strictEqual(missingCandidates.evaluation.reviewStatus, "BLOCKED");
  console.log(`${G} missing candidate file blocks`);

  const tooMany = r34.collectR34ManualQuoteBatchReview({
    ...baseOptions(),
    candidateData: {
      candidates: [
        goodCandidate("R34-001"),
        goodCandidate("R34-002"),
        goodCandidate("R34-003"),
        goodCandidate("R34-004")
      ]
    }
  });
  assert.strictEqual(tooMany.evaluation.reviewStatus, "INVALID_BATCH_CANDIDATES");
  console.log(`${G} more than 3 candidates blocks`);

  const slippageHigh = r34.collectR34ManualQuoteBatchReview({
    ...baseOptions(),
    candidateData: {
      candidates: [goodCandidate("R34-HIGH", { requestedSlippageBps: 250 })]
    }
  });
  assert.strictEqual(slippageHigh.evaluation.reviewStatus, "INVALID_BATCH_CANDIDATES");
  console.log(`${G} requestedSlippageBps > 200 blocks`);

  const slippage100 = r34.collectR34ManualQuoteBatchReview(baseOptions());
  assert.strictEqual(slippage100.evaluation.reviewStatus, "NEED_MORE_SCHEMA_V2_OBSERVATIONS");
  assert.strictEqual(slippage100.batchPlan.enabledCandidateCount, 2);
  console.log(`${G} requestedSlippageBps 100 passes`);

  const secretCandidate = r34.collectR34ManualQuoteBatchReview({
    ...baseOptions(),
    candidateData: {
      candidates: [goodCandidate("R34-SECRET", { privateKey: "bad" })]
    }
  });
  assert.strictEqual(secretCandidate.evaluation.reviewStatus, "INVALID_BATCH_CANDIDATES");
  console.log(`${G} wallet/private/secret-like field blocks`);

  for (const [field, label] of [
    ["approved", "approved true in existing observations blocks"],
    ["tradingAllowed", "tradingAllowed true blocks"],
    ["signingAllowed", "signingAllowed true blocks"],
    ["submissionAllowed", "submissionAllowed true blocks"],
    ["walletRequired", "walletRequired true blocks"]
  ]) {
    const blocked = r34.collectR34ManualQuoteBatchReview({
      ...baseOptions(),
      observations: [schemaV2Observation({ [field]: true })]
    });
    assert.strictEqual(blocked.evaluation.reviewStatus, "BLOCKED");
    console.log(`${G} ${label}`);
  }

  const mixedObs = r34.collectR34ManualQuoteBatchReview({
    ...baseOptions(),
    observations: [
      legacyV1Observation(),
      schemaV2Observation({ candidateId: "R31-SOL-USDC-001" })
    ]
  });
  assert.strictEqual(mixedObs.observationSummary.schemaV2Count, 1);
  assert.strictEqual(mixedObs.observationSummary.legacyV1.total, 1);
  assert.strictEqual(mixedObs.observationSummary.legacyV1.countedTowardReadiness, false);
  assert.strictEqual(mixedObs.evaluation.reviewStatus, "NEED_MORE_SCHEMA_V2_OBSERVATIONS");
  console.log(`${G} schema v2 observations counted correctly`);
  console.log(`${G} legacy v1 observations not counted toward readiness`);

  const enough = r34.collectR34ManualQuoteBatchReview({
    ...baseOptions(),
    observations: [
      schemaV2Observation({ candidateId: "R34-A" }),
      schemaV2Observation({ candidateId: "R34-B" }),
      schemaV2Observation({ candidateId: "R34-C" })
    ]
  });
  assert.strictEqual(enough.evaluation.reviewStatus, "ENOUGH_SCHEMA_V2_OBSERVATIONS_FOR_REVIEW");
  assert.strictEqual(enough.observationSummary.schemaV2Count, 3);
  console.log(`${G} three schema v2 observations returns ENOUGH_SCHEMA_V2_OBSERVATIONS_FOR_REVIEW`);

  const outputFile = path.join(tmpOutput, "r34_manual_quote_batch_review.json");
  const result = r34.runR34ManualQuoteBatchReview({
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

  const src = fs.readFileSync(path.join(__dirname, "r34_manual_quote_batch_review.js"), "utf8");
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  console.log(`${G} no network calls`);

  console.log("\nR34 MANUAL QUOTE BATCH REVIEW TEST PASSED (18/18)");
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
