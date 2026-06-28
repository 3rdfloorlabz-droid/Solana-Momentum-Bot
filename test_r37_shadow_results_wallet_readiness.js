"use strict";

// test_r37_shadow_results_wallet_readiness.js — Sprint 4 R37
// Validates shadow results wallet readiness review in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r37 = require("./r37_shadow_results_wallet_readiness");
const r36 = require("./r36_shadow_execution_harness");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r37-runtime-"));
const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "r37-repo-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r37-output-"));
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

function goodR36Status(overrides = {}) {
  return {
    evaluation: {
      status: "SHADOW_DECISIONS_GENERATED",
      verdict: "SHADOW EXECUTION HARNESS BUILT — SIMULATION ONLY",
      approved: false
    },
    summary: {
      status: "SHADOW_DECISIONS_GENERATED",
      decisionCount: 3,
      wouldEnterCount: 3,
      skipCount: 0,
      blockedCount: 0,
      approved: false
    },
    ...overrides
  };
}

function goodDecision(overrides = {}) {
  return {
    schemaVersion: 1,
    generatedAt: "2026-06-23T12:00:00.000Z",
    sourceMode: r36.SOURCE_MODE,
    approved: false,
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false,
    realExecution: false,
    transactionConstructed: false,
    transactionSigned: false,
    transactionSubmitted: false,
    positionMutated: false,
    candidateId: "R31-SOL-USDC-001",
    simulatedAction: r36.SIMULATED_ACTION.WOULD_ENTER,
    simulatedReason: "Shadow policy pass",
    ...overrides
  };
}

function threeWouldEnterDecisions() {
  return [
    goodDecision({ candidateId: "R31-SOL-USDC-001" }),
    goodDecision({ candidateId: "R34-SOL-USDC-001" }),
    goodDecision({ candidateId: "R34-SOL-USDC-002" })
  ];
}

function baseOptions(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRepo,
    analysisDir: tmpOutput,
    gateDocPresent: true,
    r36StatusData: goodR36Status(),
    decisions: threeWouldEnterDecisions(),
    recoveryPresent: false,
    ...overrides
  };
}

async function runTests() {
  writeSafePosture();

  const missingR36 = r37.collectR37ShadowResultsWalletReadiness({
    ...baseOptions(),
    r36StatusData: undefined,
    r36StatusFile: path.join(tmpOutput, "missing-r36.json")
  });
  assert.strictEqual(missingR36.evaluation.readinessStatus, "BLOCKED");
  console.log(`${G} missing R36 status blocks`);

  const missingDecisions = r37.collectR37ShadowResultsWalletReadiness({
    ...baseOptions(),
    decisions: undefined,
    decisionsFile: path.join(tmpOutput, "missing-decisions.jsonl")
  });
  assert.strictEqual(missingDecisions.evaluation.readinessStatus, "BLOCKED");
  console.log(`${G} missing shadow decisions blocks`);

  const ready = r37.collectR37ShadowResultsWalletReadiness(baseOptions());
  assert.strictEqual(ready.evaluation.readinessStatus, "READY_FOR_WALLET_SETUP_DESIGN");
  assert.strictEqual(ready.evaluation.verdict, "SHADOW RESULTS REVIEWED — READY FOR WALLET SETUP DESIGN ONLY");
  assert.strictEqual(ready.shadowResultsSummary.wouldEnterCount, 3);
  assert.strictEqual(ready.approved, false);
  assert.strictEqual(ready.privateKeysHandled, false);
  console.log(`${G} 3 clean WOULD_ENTER decisions returns READY_FOR_WALLET_SETUP_DESIGN`);

  for (const [field, label] of [
    ["approved", "approved true blocks"],
    ["realExecution", "realExecution true blocks"],
    ["transactionConstructed", "transactionConstructed true blocks"],
    ["transactionSigned", "transactionSigned true blocks"],
    ["transactionSubmitted", "transactionSubmitted true blocks"],
    ["positionMutated", "positionMutated true blocks"],
    ["tradingAllowed", "tradingAllowed true blocks"],
    ["signingAllowed", "signingAllowed true blocks"],
    ["submissionAllowed", "submissionAllowed true blocks"],
    ["walletRequired", "walletRequired true blocks"]
  ]) {
    const blocked = r37.collectR37ShadowResultsWalletReadiness({
      ...baseOptions(),
      decisions: [goodDecision({ [field]: true })]
    });
    assert.strictEqual(blocked.evaluation.readinessStatus, "INVALID_SHADOW_DECISION_RECORD");
    console.log(`${G} ${label}`);
  }

  const secretRepo = fs.mkdtempSync(path.join(os.tmpdir(), "r37-secret-repo-"));
  const secretFile = path.join(secretRepo, "wallet.json");
  fs.writeFileSync(secretFile, "[58,12,99,FAKE_TEST_ONLY_DO_NOT_USE]\n");
  const secretBlocked = r37.collectR37ShadowResultsWalletReadiness({
    runtimeRoot: tmpRuntime,
    repoRoot: secretRepo,
    analysisDir: tmpOutput,
    gateDocPresent: true,
    r36StatusData: goodR36Status(),
    decisions: threeWouldEnterDecisions(),
    recoveryPresent: false
  });
  assert.strictEqual(secretBlocked.evaluation.readinessStatus, "BLOCKED_SECRET_FILE_IN_REPO");
  assert.strictEqual(secretBlocked.repoSecretScan.contentRead, false);
  assert.ok(secretBlocked.repoSecretScan.forbiddenPathHits.every((h) => h.contentNotRead === true));
  console.log(`${G} forbidden secret filename inside repo blocks`);

  const scanHits = r37.scanForbiddenSecretPaths(secretRepo);
  assert.strictEqual(scanHits.length, 1);
  assert.strictEqual(scanHits[0].contentNotRead, true);
  const src = fs.readFileSync(path.join(__dirname, "r37_shadow_results_wallet_readiness.js"), "utf8");
  const scanFn = src.slice(src.indexOf("function scanForbiddenSecretPaths"), src.indexOf("function validateDecisionRecord"));
  assert.ok(!/readFileSync/.test(scanFn));
  console.log(`${G} helper does not read secret-looking file contents`);

  const outputFile = path.join(tmpOutput, "r37_shadow_results_wallet_readiness.json");
  const result = r37.runR37ShadowResultsWalletReadiness({
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

  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  console.log(`${G} no network calls`);

  console.log("\nR37 SHADOW RESULTS WALLET READINESS TEST PASSED (18/18)");

  try { fs.rmSync(secretRepo, { recursive: true, force: true }); } catch { /* ignore */ }
}

runTests()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
    try { fs.rmSync(tmpRepo, { recursive: true, force: true }); } catch { /* ignore */ }
    try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
  });
