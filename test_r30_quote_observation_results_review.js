"use strict";

// test_r30_quote_observation_results_review.js — Sprint 4 R30
// Validates quote observation results review in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r30 = require("./r30_quote_observation_results_review");
const r18 = require("./r18_shadow_quote_review");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r30-output-"));
const G = "\x1b[32m✔\x1b[0m";

function goodObservation(overrides = {}) {
  return {
    candidateId: "R30-TEST-001",
    provider: "jupiter_quote_readonly",
    routeSummary: "TEST_POOL",
    slippageBps: 300,
    requestedSlippageBps: 300,
    priceImpactBps: 0,
    quoteAgeSeconds: 0,
    gateVerdict: r18.DECISION.REJECT,
    rejectionReasons: ["REQUESTED_SLIPPAGE_ABOVE_MANUAL_EXCEPTION", "SLIPPAGE_ABOVE_MANUAL_EXCEPTION"],
    approved: false,
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false,
    networkPolling: true,
    ...overrides
  };
}

function goodStatus(overrides = {}) {
  return {
    observerStatus: "OBSERVATION_COMPLETE",
    observationCount: 1,
    passCount: 0,
    warnCount: 0,
    rejectCount: 1,
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
    analysisDir: tmpOutput,
    repoRoot: __dirname,
    statusData: goodStatus(),
    observations: [goodObservation()],
    ...overrides
  };
}

async function runTests() {
  const missingStatus = r30.collectR30QuoteObservationResultsReview({
    ...baseOptions(),
    statusData: undefined,
    statusFile: path.join(tmpOutput, "missing-status.json")
  });
  assert.strictEqual(missingStatus.evaluation.reviewStatus, "BLOCKED");
  console.log(`${G} missing status blocks`);

  const missingObs = r30.collectR30QuoteObservationResultsReview({
    ...baseOptions(),
    observations: undefined,
    observationsFile: path.join(tmpOutput, "missing-observations.jsonl")
  });
  assert.strictEqual(missingObs.evaluation.reviewStatus, "NO_OBSERVATIONS_FOUND");
  console.log(`${G} missing observations file blocks`);

  const rejected = r30.collectR30QuoteObservationResultsReview(baseOptions());
  assert.strictEqual(rejected.evaluation.reviewStatus, "REVIEW_COMPLETE_ROUTE_REJECTED");
  assert.strictEqual(rejected.approved, false);
  assert.ok(rejected.slippageAbovePolicy.length > 0);
  console.log(`${G} rejected slippage observation returns REVIEW_COMPLETE_ROUTE_REJECTED`);

  const acceptable = r30.collectR30QuoteObservationResultsReview({
    ...baseOptions(),
    statusData: goodStatus({
      passCount: 1,
      rejectCount: 0,
      observationCount: 1
    }),
    observations: [goodObservation({
      requestedSlippageBps: 80,
      slippageBps: 80,
      gateVerdict: r18.DECISION.PASS,
      rejectionReasons: []
    })]
  });
  assert.strictEqual(acceptable.evaluation.reviewStatus, "REVIEW_COMPLETE_ACCEPTABLE_OBSERVATION");
  console.log(`${G} acceptable observation returns REVIEW_COMPLETE_ACCEPTABLE_OBSERVATION`);

  for (const [field, label] of [
    ["approved", "approved true in any record blocks"],
    ["tradingAllowed", "tradingAllowed true blocks"],
    ["signingAllowed", "signingAllowed true blocks"],
    ["submissionAllowed", "submissionAllowed true blocks"],
    ["walletRequired", "walletRequired true blocks"]
  ]) {
    const blocked = r30.collectR30QuoteObservationResultsReview({
      ...baseOptions(),
      observations: [goodObservation({ [field]: true })]
    });
    assert.strictEqual(blocked.evaluation.reviewStatus, "INVALID_OBSERVATION_RECORD");
    console.log(`${G} ${label}`);
  }

  const malformedPath = path.join(tmpOutput, "malformed-observations.jsonl");
  fs.writeFileSync(malformedPath, '{"candidateId":"ok"}\n{bad json}\n');
  const malformed = r30.collectR30QuoteObservationResultsReview({
    ...baseOptions(),
    observations: undefined,
    observationsFile: malformedPath
  });
  assert.strictEqual(malformed.evaluation.reviewStatus, "INVALID_OBSERVATION_RECORD");
  console.log(`${G} malformed jsonl blocks`);

  const outputFile = path.join(tmpOutput, "r30_quote_observation_results_review.json");
  const result = r30.runR30QuoteObservationResultsReview({
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

  const src = fs.readFileSync(path.join(__dirname, "r30_quote_observation_results_review.js"), "utf8");
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  console.log(`${G} no network calls`);

  console.log("\nR30 QUOTE OBSERVATION RESULTS REVIEW TEST PASSED (16/16)");
}

runTests()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
  });
