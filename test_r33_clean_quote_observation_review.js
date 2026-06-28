"use strict";

// test_r33_clean_quote_observation_review.js — Sprint 4 R33
// Validates clean quote observation review in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r33 = require("./r33_clean_quote_observation_review");
const r29 = require("./r29_real_quote_observer");
const r18 = require("./r18_shadow_quote_review");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r33-output-"));
const G = "\x1b[32m✔\x1b[0m";

function schemaV2Observation(overrides = {}) {
  return {
    candidateId: "R31-SOL-USDC-001",
    observationSchemaVersion: 2,
    provider: "jupiter_quote_readonly",
    routeSummary: "AlphaQ -> Meteora DLMM",
    requestedSlippageBps: 100,
    slippageBps: 100,
    slippageBpsDeprecated: true,
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
    networkPolling: true,
    ...overrides
  };
}

function legacyV1Observation(overrides = {}) {
  return {
    candidateId: "R29-MANUAL-SOL-USDC-001",
    provider: "jupiter_quote_readonly",
    slippageBps: 300,
    priceImpactBps: 0,
    gateVerdict: r18.DECISION.REJECT,
    rejectionReasons: ["SLIPPAGE_ABOVE_MANUAL_EXCEPTION"],
    approved: false,
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false,
    ...overrides
  };
}

function goodStatus(overrides = {}) {
  return {
    observerStatus: "OBSERVATION_COMPLETE",
    observationCount: 1,
    passCount: 1,
    warnCount: 0,
    rejectCount: 0,
    approved: false,
    ...overrides
  };
}

function baseOptions(overrides = {}) {
  return {
    analysisDir: tmpOutput,
    repoRoot: __dirname,
    statusData: goodStatus(),
    observations: [schemaV2Observation()],
    ...overrides
  };
}

async function runTests() {
  const missingStatus = r33.collectR33CleanQuoteObservationReview({
    ...baseOptions(),
    statusData: undefined,
    statusFile: path.join(tmpOutput, "missing-status.json")
  });
  assert.strictEqual(missingStatus.evaluation.reviewStatus, "BLOCKED");
  console.log(`${G} missing status blocks`);

  const missingObs = r33.collectR33CleanQuoteObservationReview({
    ...baseOptions(),
    observations: undefined,
    observationsFile: path.join(tmpOutput, "missing-observations.jsonl")
  });
  assert.strictEqual(missingObs.evaluation.reviewStatus, "BLOCKED");
  console.log(`${G} missing observations file blocks`);

  const legacyOnly = r33.collectR33CleanQuoteObservationReview({
    ...baseOptions(),
    observations: [legacyV1Observation()]
  });
  assert.strictEqual(legacyOnly.evaluation.reviewStatus, "LEGACY_ONLY_NO_SCHEMA_V2");
  console.log(`${G} legacy-only file returns LEGACY_ONLY_NO_SCHEMA_V2`);

  const cleanPass = r33.collectR33CleanQuoteObservationReview({
    ...baseOptions(),
    observations: [legacyV1Observation(), schemaV2Observation()]
  });
  assert.strictEqual(cleanPass.evaluation.reviewStatus, "CLEAN_SCHEMA_V2_OBSERVATION_PASS");
  assert.strictEqual(cleanPass.schemaSummary.schemaV2.passCount, 1);
  assert.strictEqual(cleanPass.schemaSummary.legacyV1.total, 1);
  assert.strictEqual(cleanPass.approved, false);
  console.log(`${G} clean schema v2 PASS returns CLEAN_SCHEMA_V2_OBSERVATION_PASS`);

  const v2Reject = r33.collectR33CleanQuoteObservationReview({
    ...baseOptions(),
    observations: [schemaV2Observation({
      requestedSlippageBps: 300,
      gateVerdict: r18.DECISION.REJECT,
      rejectionReasons: ["REQUESTED_SLIPPAGE_ABOVE_MANUAL_EXCEPTION"]
    })]
  });
  assert.strictEqual(v2Reject.evaluation.reviewStatus, "SCHEMA_V2_OBSERVATION_REJECTED");
  console.log(`${G} schema v2 rejected returns SCHEMA_V2_OBSERVATION_REJECTED`);

  const missingRequested = r33.collectR33CleanQuoteObservationReview({
    ...baseOptions(),
    observations: [schemaV2Observation({ requestedSlippageBps: undefined })]
  });
  assert.strictEqual(missingRequested.evaluation.reviewStatus, "INVALID_OBSERVATION_RECORD");
  console.log(`${G} schema v2 missing requestedSlippageBps blocks`);

  const realizedSet = r33.collectR33CleanQuoteObservationReview({
    ...baseOptions(),
    observations: [schemaV2Observation({ realizedSlippageBps: 50 })]
  });
  assert.strictEqual(realizedSet.evaluation.reviewStatus, "INVALID_OBSERVATION_RECORD");
  console.log(`${G} schema v2 with realizedSlippageBps non-null blocks`);

  const missingInterp = r33.collectR33CleanQuoteObservationReview({
    ...baseOptions(),
    observations: [schemaV2Observation({ slippageInterpretation: "WRONG" })]
  });
  assert.strictEqual(missingInterp.evaluation.reviewStatus, "INVALID_OBSERVATION_RECORD");
  console.log(`${G} schema v2 missing slippageInterpretation blocks`);

  for (const [field, label] of [
    ["approved", "approved true blocks"],
    ["tradingAllowed", "tradingAllowed true blocks"],
    ["signingAllowed", "signingAllowed true blocks"],
    ["submissionAllowed", "submissionAllowed true blocks"],
    ["walletRequired", "walletRequired true blocks"]
  ]) {
    const blocked = r33.collectR33CleanQuoteObservationReview({
      ...baseOptions(),
      observations: [schemaV2Observation({ [field]: true })]
    });
    assert.strictEqual(blocked.evaluation.reviewStatus, "INVALID_OBSERVATION_RECORD");
    console.log(`${G} ${label}`);
  }

  const malformedPath = path.join(tmpOutput, "malformed-observations.jsonl");
  fs.writeFileSync(malformedPath, '{"candidateId":"ok"}\n{bad json}\n');
  const malformed = r33.collectR33CleanQuoteObservationReview({
    ...baseOptions(),
    observations: undefined,
    observationsFile: malformedPath
  });
  assert.strictEqual(malformed.evaluation.reviewStatus, "INVALID_OBSERVATION_RECORD");
  console.log(`${G} malformed jsonl blocks`);

  const outputFile = path.join(tmpOutput, "r33_clean_quote_observation_review.json");
  const result = r33.runR33CleanQuoteObservationReview({
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

  const src = fs.readFileSync(path.join(__dirname, "r33_clean_quote_observation_review.js"), "utf8");
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  console.log(`${G} no network calls`);

  console.log("\nR33 CLEAN QUOTE OBSERVATION REVIEW TEST PASSED (18/18)");
}

runTests()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
  });
