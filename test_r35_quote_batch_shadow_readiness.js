"use strict";

// test_r35_quote_batch_shadow_readiness.js — Sprint 4 R35
// Validates quote batch shadow readiness review in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r35 = require("./r35_quote_batch_shadow_readiness");
const r29 = require("./r29_real_quote_observer");
const r18 = require("./r18_shadow_quote_review");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r35-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r35-output-"));
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

function goodR34Review(overrides = {}) {
  return {
    evaluation: {
      reviewStatus: "ENOUGH_SCHEMA_V2_OBSERVATIONS_FOR_REVIEW",
      approved: false
    },
    observationSummary: {
      schemaV2Count: 3
    },
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
    routeSummary: "AlphaQ -> Meteora DLMM",
    gateVerdict: r18.DECISION.PASS,
    approved: false,
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false,
    ...overrides
  };
}

function threeCleanObservations() {
  return [
    schemaV2Observation({ candidateId: "R31-SOL-USDC-001", routeSummary: "AlphaQ -> Meteora DLMM" }),
    schemaV2Observation({ candidateId: "R34-SOL-USDC-001", routeSummary: "BisonFi -> AlphaQ -> Meteora DLMM" }),
    schemaV2Observation({ candidateId: "R34-SOL-USDC-002", routeSummary: "GoonFi V2 -> Meteora DLMM" })
  ];
}

function baseOptions(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: __dirname,
    analysisDir: tmpOutput,
    gateDocPresent: true,
    r34ReviewData: goodR34Review(),
    observations: threeCleanObservations(),
    recoveryPresent: false,
    ...overrides
  };
}

async function runTests() {
  writeSafePosture();

  const missingR34 = r35.collectR35QuoteBatchShadowReadiness({
    ...baseOptions(),
    r34ReviewData: undefined,
    r34ReviewFile: path.join(tmpOutput, "missing-r34.json")
  });
  assert.strictEqual(missingR34.evaluation.readinessStatus, "BLOCKED");
  console.log(`${G} missing R34 review blocks`);

  const missingObs = r35.collectR35QuoteBatchShadowReadiness({
    ...baseOptions(),
    observations: undefined,
    observationsFile: path.join(tmpOutput, "missing-observations.jsonl")
  });
  assert.strictEqual(missingObs.evaluation.readinessStatus, "BLOCKED");
  console.log(`${G} missing observations blocks`);

  const tooFew = r35.collectR35QuoteBatchShadowReadiness({
    ...baseOptions(),
    observations: [schemaV2Observation()]
  });
  assert.strictEqual(tooFew.evaluation.readinessStatus, "NOT_READY_NEED_MORE_OBSERVATIONS");
  console.log(`${G} fewer than 3 schema v2 observations returns NOT_READY_NEED_MORE_OBSERVATIONS`);

  const ready = r35.collectR35QuoteBatchShadowReadiness(baseOptions());
  assert.strictEqual(ready.evaluation.readinessStatus, "READY_FOR_SHADOW_EXECUTION_HARNESS_DESIGN");
  assert.strictEqual(ready.evaluation.verdict, "QUOTE BATCH REVIEWED — READY FOR SHADOW EXECUTION HARNESS DESIGN");
  assert.strictEqual(ready.batchSummary.schemaV2.passCount, 3);
  assert.strictEqual(ready.approved, false);
  assert.strictEqual(ready.shadowExecutionActivated, false);
  console.log(`${G} 3 clean schema v2 pass observations returns READY_FOR_SHADOW_EXECUTION_HARNESS_DESIGN`);

  const rejected = r35.collectR35QuoteBatchShadowReadiness({
    ...baseOptions(),
    observations: [
      ...threeCleanObservations().slice(0, 2),
      schemaV2Observation({
        candidateId: "R34-REJECT",
        gateVerdict: r18.DECISION.REJECT,
        rejectionReasons: ["REQUESTED_SLIPPAGE_ABOVE_MANUAL_EXCEPTION"]
      })
    ]
  });
  assert.strictEqual(rejected.evaluation.readinessStatus, "NOT_READY_ROUTE_REJECTIONS");
  console.log(`${G} schema v2 rejection returns NOT_READY_ROUTE_REJECTIONS`);

  for (const [field, label] of [
    ["approved", "approved true blocks"],
    ["tradingAllowed", "tradingAllowed true blocks"],
    ["signingAllowed", "signingAllowed true blocks"],
    ["submissionAllowed", "submissionAllowed true blocks"],
    ["walletRequired", "walletRequired true blocks"]
  ]) {
    const blocked = r35.collectR35QuoteBatchShadowReadiness({
      ...baseOptions(),
      observations: threeCleanObservations().map((o, i) => (
        i === 0 ? { ...o, [field]: true } : o
      ))
    });
    assert.strictEqual(blocked.evaluation.readinessStatus, "INVALID_OBSERVATION_RECORD");
    console.log(`${G} ${label}`);
  }

  const realizedSet = r35.collectR35QuoteBatchShadowReadiness({
    ...baseOptions(),
    observations: threeCleanObservations().map((o, i) => (
      i === 0 ? { ...o, realizedSlippageBps: 50 } : o
    ))
  });
  assert.strictEqual(realizedSet.evaluation.readinessStatus, "INVALID_OBSERVATION_RECORD");
  console.log(`${G} realizedSlippageBps non-null blocks`);

  const missingRequested = r35.collectR35QuoteBatchShadowReadiness({
    ...baseOptions(),
    observations: threeCleanObservations().map((o, i) => (
      i === 0 ? { ...o, requestedSlippageBps: undefined } : o
    ))
  });
  assert.strictEqual(missingRequested.evaluation.readinessStatus, "INVALID_OBSERVATION_RECORD");
  console.log(`${G} missing requestedSlippageBps blocks`);

  const malformedPath = path.join(tmpOutput, "malformed-observations.jsonl");
  fs.writeFileSync(malformedPath, '{"candidateId":"ok"}\n{bad json}\n');
  const malformed = r35.collectR35QuoteBatchShadowReadiness({
    ...baseOptions(),
    observations: undefined,
    observationsFile: malformedPath
  });
  assert.strictEqual(malformed.evaluation.readinessStatus, "INVALID_OBSERVATION_RECORD");
  console.log(`${G} malformed jsonl blocks`);

  const outputFile = path.join(tmpOutput, "r35_quote_batch_shadow_readiness.json");
  const result = r35.runR35QuoteBatchShadowReadiness({
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

  const src = fs.readFileSync(path.join(__dirname, "r35_quote_batch_shadow_readiness.js"), "utf8");
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  console.log(`${G} no network calls`);

  console.log("\nR35 QUOTE BATCH SHADOW READINESS TEST PASSED (18/18)");
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
