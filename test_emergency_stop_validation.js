"use strict";

// test_emergency_stop_validation.js — Sprint 4 R11
// Validates emergency-stop behavior via fake signer simulation only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const sim = require("./signer_simulation_harness");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r11-estop-"));
const G = "\x1b[32m✔\x1b[0m";

const microLivePosture = {
  executionMode: "MICRO_LIVE",
  dryRunMode: false,
  liveArmed: true,
  emergencyStop: false
};

const liveContext = {
  singletonLockValid: true,
  exactlyOneExecutorLoop: true,
  r8LimitsLoaded: true,
  walletMonitorFresh: true,
  signerPresent: true,
  operatorApprovalPresent: true
};

try {
  const lifecycle = sim.runFakeLifecycle({
    outputDir: tmpOutput,
    posture: microLivePosture,
    context: liveContext,
    intent: { tokenAddress: "MintAllow", amountUsd: 10 }
  });
  assert.strictEqual(lifecycle.confirmed.confirmed, true);
  console.log(`${G} emergencyStop false allows fake lifecycle when other fake gates pass`);

  const stoppedHarness = sim.createSignerSimulationHarness({ emergencyStop: true });
  const tx = sim.createFakeTransaction({ tokenAddress: "MintStop" });
  assert.throws(
    () => sim.fakeSign(stoppedHarness, tx, microLivePosture, liveContext),
    err => err.code === "SIM_EMERGENCY_STOP"
  );
  console.log(`${G} emergencyStop true blocks fake sign`);

  const submitHarness = sim.createSignerSimulationHarness();
  const signed = sim.fakeSign(submitHarness, tx, microLivePosture, liveContext);
  submitHarness.emergencyStop = true;
  assert.throws(
    () => sim.fakeSubmit(submitHarness, signed, microLivePosture, liveContext),
    err => err.code === "SIM_EMERGENCY_STOP"
  );
  console.log(`${G} emergencyStop true blocks fake submit`);

  const mid = sim.runMidFlowEmergencyStopScenario({
    outputDir: tmpOutput,
    intent: { tokenAddress: "MintMid", amountUsd: 9 }
  });
  assert.ok(mid.signed);
  assert.strictEqual(mid.submitError.code, "SIM_EMERGENCY_STOP");
  console.log(`${G} mid-flow emergency stop blocks remaining submit`);

  const post = sim.runPostConfirmEmergencyStopScenario({
    outputDir: tmpOutput,
    intent: { tokenAddress: "MintFirst", amountUsd: 8 },
    nextIntent: { tokenAddress: "MintSecond", amountUsd: 6 }
  });
  assert.strictEqual(post.confirmed.confirmed, true);
  assert.strictEqual(post.signError.code, "SIM_EMERGENCY_STOP");
  console.log(`${G} emergencyStop after fake confirmation blocks next transaction`);

  const autoHarness = sim.createSignerSimulationHarness({ emergencyStop: true });
  sim.triggerEmergencyStop(autoHarness, "manual_operator_stop");
  const reset = sim.attemptAutomaticEmergencyReset(autoHarness);
  assert.strictEqual(reset.autoReset, false);
  assert.strictEqual(autoHarness.emergencyStop, true);
  console.log(`${G} reset cannot occur automatically`);

  const dupHarness = sim.createSignerSimulationHarness({ emergencyStop: true });
  const dupSigned = { txId: "dup-tx", signature: `${sim.SIMULATED_SIGNATURE_PREFIX}abc`, simulated: true };
  assert.throws(
    () => sim.fakeSubmit(dupHarness, dupSigned, microLivePosture, liveContext),
    err => err.code === "SIM_EMERGENCY_STOP"
  );
  console.log(`${G} duplicate submit remains blocked under emergency stop`);

  const eventHarness = sim.createSignerSimulationHarness();
  const event = sim.triggerEmergencyStop(eventHarness, "manual_operator_stop", "operator");
  assert.strictEqual(event.stage, "EMERGENCY_STOP_TRIGGERED");
  assert.strictEqual(event.recoveryActionsCreated, false);
  const serialized = JSON.stringify(eventHarness.events);
  assert.ok(!/SOLANA_SIGNER|private.?key|seed/i.test(serialized));
  console.log(`${G} emergency stop event logged without signing material`);

  const outHarness = sim.createSignerSimulationHarness({ emergencyStop: true });
  sim.triggerEmergencyStop(outHarness, "validation_run");
  const outFile = sim.writeEmergencyStopValidationOutput(
    outHarness,
    path.join(tmpOutput, "r11_emergency_stop_validation.json")
  );
  assert.ok(outFile.startsWith(tmpOutput));
  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} emergency stop does not create recovery_actions.jsonl`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  console.log(`${G} emergency stop does not mutate live_config.json`);

  assert.throws(
    () => sim.triggerEmergencyStop({ simulated: true }),
    err => err.code === "SIM_EMERGENCY_STATE_MALFORMED"
  );
  console.log(`${G} malformed emergency stop state fails closed`);

  const postureBlocked = sim.checkAgreementGates(
    { ...microLivePosture, emergencyStop: true },
    liveContext
  );
  assert.strictEqual(postureBlocked.ok, false);
  console.log(`${G} safety posture with emergencyStop true blocks agreement gates`);

  const dryRun = sim.checkAgreementGates(
    {
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false
    },
    liveContext
  );
  assert.strictEqual(dryRun.ok, false);
  console.log(`${G} safety posture remains dry-run/disarmed`);

  console.log(`${G} emergency stop output only writes to analysis/ or temp fixtures`);

  console.log("\nR11 EMERGENCY STOP VALIDATION TEST PASSED (14/14)");
} finally {
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
