"use strict";

// test_micro_live_preflight.js — Sprint 4 R8A
// Validates micro-live preflight in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const preflight = require("./micro_live_preflight");
const singleton = require("./executor_singleton_guard");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r8a-runtime-"));
const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "r8a-repo-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r8a-output-"));
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

function goodR7Metrics() {
  return {
    recommendation: { verdict: "NOT ENOUGH DATA", reason: "Insufficient fresh edge evidence." }
  };
}

function baseOptions(overrides = {}) {
  writeSafePosture();
  writeWalletStatus();
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRepo,
    analysisDir: tmpOutput,
    gateDocPresent: true,
    recoveryPresent: false,
    gitCheck: { available: true, clean: true, dirtyFiles: [] },
    singletonCheck: {
      executorSingletonLock: "none",
      duplicateLoop: false,
      healthy: true,
      malformed: false
    },
    r7Metrics: goodR7Metrics(),
    demoCapsExampleFile: path.join(__dirname, "examples", "micro_live_demo_caps.example.json"),
    ...overrides
  };
}

async function runTests() {
  const recoveryPass = preflight.collectMicroLivePreflight(baseOptions());
  assert.strictEqual(recoveryPass.checks.find((c) => c.id === "recovery_absent").ok, true);
  console.log(`${G} missing recovery file passes`);

  const recoveryFail = preflight.collectMicroLivePreflight({
    ...baseOptions(),
    recoveryPresent: true
  });
  assert.strictEqual(recoveryFail.evaluation.r8aVerdict, "NOT READY FOR MICRO-LIVE ENGINEERING PROOF");
  console.log(`${G} present recovery_actions.jsonl fails`);

  const armed = preflight.collectMicroLivePreflight({
    ...baseOptions(),
    posture: {
      available: true,
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: true,
      emergencyStop: false
    }
  });
  assert.strictEqual(armed.evaluation.r8aVerdict, "NOT READY FOR MICRO-LIVE ENGINEERING PROOF");
  console.log(`${G} liveArmed true fails`);

  const dryFalse = preflight.collectMicroLivePreflight({
    ...baseOptions(),
    posture: {
      available: true,
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: false,
      liveArmed: false,
      emergencyStop: false
    }
  });
  assert.strictEqual(dryFalse.evaluation.r8aVerdict, "NOT READY FOR MICRO-LIVE ENGINEERING PROOF");
  console.log(`${G} dryRunMode false fails`);

  const liveMode = preflight.collectMicroLivePreflight({
    ...baseOptions(),
    posture: {
      available: true,
      executionMode: "LIVE",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false
    }
  });
  assert.strictEqual(liveMode.evaluation.r8aVerdict, "NOT READY FOR MICRO-LIVE ENGINEERING PROOF");
  console.log(`${G} executionMode LIVE fails`);

  const duplicate = preflight.collectMicroLivePreflight({
    ...baseOptions(),
    singletonCheck: {
      executorSingletonLock: "active",
      duplicateLoop: true,
      healthy: false,
      malformed: false
    }
  });
  assert.strictEqual(duplicate.evaluation.r8aVerdict, "NOT READY FOR MICRO-LIVE ENGINEERING PROOF");
  console.log(`${G} duplicate executor fails`);

  const noWallet = preflight.collectMicroLivePreflight({
    ...baseOptions(),
    walletStatusFile: path.join(tmpOutput, "missing-wallet-status.json")
  });
  assert.strictEqual(noWallet.evaluation.r8aVerdict, "NOT READY FOR MICRO-LIVE ENGINEERING PROOF");
  console.log(`${G} missing wallet status fails`);

  const outputFile = path.join(tmpOutput, "micro_live_preflight.json");
  const result = preflight.runMicroLivePreflight({
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

  const src = fs.readFileSync(path.join(__dirname, "micro_live_preflight.js"), "utf8");
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  console.log(`${G} no network calls`);

  console.log("\nMICRO-LIVE PREFLIGHT TEST PASSED (11/11)");
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
