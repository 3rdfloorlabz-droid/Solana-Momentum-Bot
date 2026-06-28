"use strict";

// test_micro_live_guardrails.js — Track A micro-live guardrails (temp fixtures only).

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const capsModule = require("./micro_live_caps");
const guardrails = require("./micro_live_guardrails");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const REPO_LIVE_POSITIONS = path.join(__dirname, "live_positions.json");
const REPO_PAPER_POSITIONS = path.join(__dirname, "paper_positions.json");
const REPO_PAPER_TRADES = path.join(__dirname, "paper_trades.json");
const REPO_OBS_DEDUP = path.join(__dirname, "observation_dedup.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;
const beforeLivePositionsHash = fs.existsSync(REPO_LIVE_POSITIONS) ? fs.readFileSync(REPO_LIVE_POSITIONS) : null;
const beforePaperPositionsHash = fs.existsSync(REPO_PAPER_POSITIONS) ? fs.readFileSync(REPO_PAPER_POSITIONS) : null;
const beforePaperTradesHash = fs.existsSync(REPO_PAPER_TRADES) ? fs.readFileSync(REPO_PAPER_TRADES) : null;
const beforeObsDedupHash = fs.existsSync(REPO_OBS_DEDUP) ? fs.readFileSync(REPO_OBS_DEDUP) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "tracka-runtime-"));
const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "tracka-repo-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "tracka-output-"));
const tmpCapsDir = path.join(tmpRepo, "operator_records");
const tmpCapsFile = path.join(tmpCapsDir, "micro_live_demo_caps.json");
const G = "\x1b[32m✔\x1b[0m";

function goodCaps(overrides = {}) {
  return {
    approved: true,
    approvedBy: "test-operator",
    approvedAt: new Date().toISOString(),
    purpose: capsModule.REQUIRED_PURPOSE,
    maxTradeSizeSol: 0.02,
    maxDailyLossSol: 0.05,
    maxTradesPerSession: 1,
    maxOpenLivePositions: 1,
    autoCompoundingAllowed: false,
    requireHumanPresent: true,
    stopAfterFirstTransaction: true,
    notes: "test fixture only",
    ...overrides
  };
}

function writeCaps(data) {
  fs.mkdirSync(tmpCapsDir, { recursive: true });
  fs.writeFileSync(tmpCapsFile, `${JSON.stringify(data, null, 2)}\n`);
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

function writeWalletStatus() {
  fs.writeFileSync(
    path.join(tmpRuntime, "wallet_status.json"),
    `${JSON.stringify({
      updatedAt: new Date().toISOString(),
      balanceSol: 1.0,
      connected: true
    }, null, 2)}\n`
  );
}

function writeEmptyLiveState() {
  fs.writeFileSync(path.join(tmpRuntime, "live_positions.json"), "[]\n");
  fs.writeFileSync(path.join(tmpRuntime, "live_trades.jsonl"), "");
}

function baseOptions(overrides = {}) {
  writeSafePosture();
  writeWalletStatus();
  writeEmptyLiveState();
  const capsData = overrides.capsData !== undefined ? overrides.capsData : goodCaps();
  if (overrides.writeCaps !== false) {
    writeCaps(capsData);
  }
  const { capsData: _capsData, writeCaps: _writeCaps, ...rest } = overrides;
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRepo,
    analysisDir: tmpOutput,
    capsFile: tmpCapsFile,
    gateDocPresent: true,
    recoveryPresent: false,
    safetySuiteGreen: true,
    singletonCheck: {
      executorSingletonLock: "none",
      duplicateLoop: false,
      healthy: true,
      malformed: false
    },
    ...rest
  };
}

function runCheck(overrides = {}) {
  return guardrails.collectMicroLiveGuardrailsCheck(baseOptions(overrides));
}

async function runTests() {
  const missingCaps = guardrails.collectMicroLiveGuardrailsCheck({
    ...baseOptions(),
    capsLoad: { status: "missing", file: tmpCapsFile, data: null },
    capsSummary: capsModule.summarizeCapsLoad({ status: "missing", file: tmpCapsFile, data: null })
  });
  assert.strictEqual(missingCaps.guardrailVerdict, guardrails.VERDICTS.NOT_READY);
  console.log(`${G} missing caps file => NOT_READY`);

  const notApproved = runCheck({
    capsData: goodCaps({ approved: false, approvedBy: "", approvedAt: null })
  });
  assert.strictEqual(notApproved.guardrailVerdict, guardrails.VERDICTS.NOT_READY);
  console.log(`${G} caps approved false => NOT_READY`);

  assert.strictEqual(
    capsModule.validateConservativeCaps(goodCaps({ maxTradeSizeSol: 0.03 })).ok,
    false
  );
  assert.strictEqual(
    runCheck({ capsData: goodCaps({ maxTradeSizeSol: 0.03 }) }).guardrailVerdict,
    guardrails.VERDICTS.NOT_READY
  );
  console.log(`${G} maxTradeSizeSol above 0.02 => fail`);

  assert.strictEqual(
    runCheck({ capsData: goodCaps({ maxDailyLossSol: 0.06 }) }).guardrailVerdict,
    guardrails.VERDICTS.NOT_READY
  );
  console.log(`${G} maxDailyLossSol above 0.05 => fail`);

  assert.strictEqual(
    runCheck({ capsData: goodCaps({ maxTradesPerSession: 2 }) }).guardrailVerdict,
    guardrails.VERDICTS.NOT_READY
  );
  console.log(`${G} maxTradesPerSession above 1 => fail`);

  assert.strictEqual(
    runCheck({ capsData: goodCaps({ maxOpenLivePositions: 2 }) }).guardrailVerdict,
    guardrails.VERDICTS.NOT_READY
  );
  console.log(`${G} maxOpenLivePositions above 1 => fail`);

  assert.strictEqual(
    runCheck({ capsData: goodCaps({ autoCompoundingAllowed: true }) }).guardrailVerdict,
    guardrails.VERDICTS.NOT_READY
  );
  console.log(`${G} autoCompoundingAllowed true => fail`);

  assert.strictEqual(
    runCheck({ capsData: goodCaps({ requireHumanPresent: false }) }).guardrailVerdict,
    guardrails.VERDICTS.NOT_READY
  );
  console.log(`${G} requireHumanPresent false => fail`);

  assert.strictEqual(
    runCheck({ capsData: goodCaps({ stopAfterFirstTransaction: false }) }).guardrailVerdict,
    guardrails.VERDICTS.NOT_READY
  );
  console.log(`${G} stopAfterFirstTransaction false => fail`);

  writeCaps(goodCaps());
  const recoveryFail = runCheck({ recoveryPresent: true });
  assert.strictEqual(recoveryFail.guardrailVerdict, guardrails.VERDICTS.NOT_READY);
  console.log(`${G} recovery_actions.jsonl present => fail`);

  const armed = runCheck({
    posture: {
      available: true,
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: true,
      emergencyStop: false,
      autoCompounding: false
    }
  });
  assert.strictEqual(armed.guardrailVerdict, guardrails.VERDICTS.NOT_READY);
  console.log(`${G} liveArmed true => fail`);

  const dryFalse = runCheck({
    posture: {
      available: true,
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: false,
      liveArmed: false,
      emergencyStop: false,
      autoCompounding: false
    }
  });
  assert.strictEqual(dryFalse.guardrailVerdict, guardrails.VERDICTS.NOT_READY);
  console.log(`${G} dryRunMode false => fail`);

  const liveMode = runCheck({
    posture: {
      available: true,
      executionMode: "LIVE",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false,
      autoCompounding: false
    }
  });
  assert.strictEqual(liveMode.guardrailVerdict, guardrails.VERDICTS.NOT_READY);
  console.log(`${G} executionMode LIVE => fail`);

  const duplicate = runCheck({
    singletonCheck: {
      executorSingletonLock: "active",
      duplicateLoop: true,
      healthy: false,
      malformed: false
    }
  });
  assert.strictEqual(duplicate.guardrailVerdict, guardrails.VERDICTS.NOT_READY);
  console.log(`${G} duplicate executor loops => fail`);

  const ready = runCheck({ capsData: goodCaps() });
  assert.strictEqual(ready.guardrailVerdict, guardrails.VERDICTS.READY_FOR_FINAL_MICRO_LIVE_REVIEW);
  assert.strictEqual(ready.approved, false);
  assert.strictEqual(ready.liveTradingApproved, false);
  console.log(`${G} valid conservative caps + safe posture => READY_FOR_FINAL_MICRO_LIVE_REVIEW`);

  const outputFile = path.join(tmpOutput, "micro_live_guardrails_check.json");
  const result = guardrails.runMicroLiveGuardrailsCheck({
    ...baseOptions(),
    outputFile,
    writeOutput: true,
    print: false
  });
  assert.ok(outputFile.startsWith(tmpOutput));
  assert.ok(!JSON.stringify(result.status).includes('"approved": true'));
  console.log(`${G} output only writes to analysis/`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  if (beforeLivePositionsHash) {
    assert.ok(beforeLivePositionsHash.equals(fs.readFileSync(REPO_LIVE_POSITIONS)));
  }
  if (beforePaperPositionsHash) {
    assert.ok(beforePaperPositionsHash.equals(fs.readFileSync(REPO_PAPER_POSITIONS)));
  }
  if (beforePaperTradesHash) {
    assert.ok(beforePaperTradesHash.equals(fs.readFileSync(REPO_PAPER_TRADES)));
  }
  if (beforeObsDedupHash) {
    assert.ok(beforeObsDedupHash.equals(fs.readFileSync(REPO_OBS_DEDUP)));
  }
  console.log(`${G} no trading state mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  const src = [
    fs.readFileSync(path.join(__dirname, "micro_live_guardrails.js"), "utf8"),
    fs.readFileSync(path.join(__dirname, "micro_live_caps.js"), "utf8")
  ].join("\n");
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  console.log(`${G} no network calls`);

  console.log("\nMICRO-LIVE GUARDRAILS TEST PASSED (18/18)");
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
