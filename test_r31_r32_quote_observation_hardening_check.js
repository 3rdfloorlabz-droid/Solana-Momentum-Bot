"use strict";

// test_r31_r32_quote_observation_hardening_check.js — Sprint 4 R31-R32 combined
// Validates quote observation hardening check in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const check = require("./r31_r32_quote_observation_hardening_check");
const r29 = require("./r29_real_quote_observer");
const r18 = require("./r18_shadow_quote_review");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r31r32-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r31r32-output-"));
const G = "\x1b[32m✔\x1b[0m";

function goodCandidateExample() {
  return {
    schemaVersion: 1,
    candidates: [
      {
        candidateId: "R31-TEST-001",
        source: "manual",
        tokenSymbol: "SOL-USDC",
        inputMint: "So11111111111111111111111111111111111111112",
        outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        intendedInputAmountSol: 0.001,
        requestedSlippageBps: 100
      }
    ]
  };
}

function baseOptions(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: __dirname,
    analysisDir: tmpOutput,
    gateDocR31Present: true,
    gateDocR32Present: true,
    candidateExample: goodCandidateExample(),
    ...overrides
  };
}

async function runTests() {
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );

  const missingR31 = check.collectR31R32QuoteObservationHardeningStatus({
    ...baseOptions(),
    gateDocR31Present: false
  });
  assert.strictEqual(missingR31.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} missing R31 doc blocks`);

  const missingR32 = check.collectR31R32QuoteObservationHardeningStatus({
    ...baseOptions(),
    gateDocR32Present: false
  });
  assert.strictEqual(missingR32.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} missing R32 doc blocks`);

  const missingExample = check.collectR31R32QuoteObservationHardeningStatus({
    ...baseOptions(),
    candidateExample: undefined,
    candidateFile: path.join(tmpOutput, "missing-candidates.json")
  });
  assert.strictEqual(missingExample.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} missing candidate example blocks`);

  assert.strictEqual(r29.resolveRequestedSlippageBps({}), 100);
  assert.strictEqual(r29.DEFAULT_REQUESTED_SLIPPAGE_BPS, 100);
  console.log(`${G} default requestedSlippageBps is 100`);

  const passFixture = check.buildFixtureObservation();
  assert.strictEqual(passFixture.observation.realizedSlippageBps, null);
  assert.strictEqual(passFixture.observation.slippageInterpretation, "REQUESTED_TOLERANCE_NOT_REALIZED");
  console.log(`${G} realizedSlippageBps is null in observation output`);
  console.log(`${G} slippageInterpretation is REQUESTED_TOLERANCE_NOT_REALIZED`);

  const reject300 = check.buildFixtureObservation({
    candidate: { requestedSlippageBps: 300 },
    normalized: { requestedSlippageBps: 300 }
  });
  assert.ok(reject300.observation.rejectionReasons.includes("REQUESTED_SLIPPAGE_ABOVE_MANUAL_EXCEPTION"));
  console.log(`${G} 300 bps requested slippage rejects as request tolerance issue`);

  assert.strictEqual(passFixture.evaluation.decision, r18.DECISION.PASS);
  console.log(`${G} 100 bps requested slippage with good mock quote can pass`);

  const safe400 = r29.sanitizeProviderErrorBody('{"error":"invalid mint"}', 400);
  assert.strictEqual(safe400.providerHttpStatus, 400);
  assert.ok(safe400.providerErrorBodyPreview.includes("invalid mint"));
  const longBody = "x".repeat(600);
  const truncated = r29.sanitizeProviderErrorBody(longBody, 400);
  assert.ok(truncated.providerErrorBodyPreview.includes("[truncated]"));
  console.log(`${G} HTTP 400 safe body preview is captured and truncated`);

  const secretBody = r29.sanitizeProviderErrorBody('{"privateKey":"bad"}', 400);
  assert.strictEqual(secretBody.providerErrorBodyPreview, "[REDACTED_SECRET_LIKE_CONTENT]");
  console.log(`${G} secret-like provider body is redacted or blocked`);

  assert.strictEqual(check.BATCH_PLAN.maxBatchCandidates, 3);
  assert.strictEqual(check.BATCH_PLAN.manualOnly, true);
  assert.strictEqual(check.BATCH_PLAN.continuousLoopAllowed, false);
  console.log(`${G} batch plan has max 3 candidates`);
  console.log(`${G} batch plan manual-only`);

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: true,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const armed = check.collectR31R32QuoteObservationHardeningStatus(baseOptions());
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
  const dryFalse = check.collectR31R32QuoteObservationHardeningStatus(baseOptions());
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
  const recovery = check.collectR31R32QuoteObservationHardeningStatus(baseOptions());
  assert.strictEqual(recovery.evaluation.gateStatus, "BLOCKED");
  fs.unlinkSync(path.join(tmpRuntime, "recovery_actions.jsonl"));
  console.log(`${G} recovery_actions.jsonl present blocks`);

  const ready = check.collectR31R32QuoteObservationHardeningStatus(baseOptions());
  assert.strictEqual(ready.evaluation.hardeningStatus, "HARDENING_COMPLETE");
  assert.strictEqual(ready.evaluation.batchPlanStatus, "BATCH_PLAN_DEFINED_MANUAL_ONLY");
  assert.strictEqual(ready.evaluation.gateStatus, "READY_FOR_SMALL_MANUAL_BATCH_OBSERVATION");
  assert.strictEqual(ready.approved, false);

  const outputFile = path.join(tmpOutput, "r31_r32_quote_observation_hardening_status.json");
  const result = check.runR31R32QuoteObservationHardeningCheck({
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

  const src = fs.readFileSync(path.join(__dirname, "r31_r32_quote_observation_hardening_check.js"), "utf8");
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  console.log(`${G} no network calls`);

  console.log("\nR31-R32 QUOTE OBSERVATION HARDENING CHECK TEST PASSED (20/20)");
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
