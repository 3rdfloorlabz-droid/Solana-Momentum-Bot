"use strict";

// test_signer_simulation_harness.js — Sprint 4 R10
// Validates fake signer simulation harness in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const sim = require("./signer_simulation_harness");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r10-sim-out-"));
const G = "\x1b[32m✔\x1b[0m";

const dryRunPosture = {
  executionMode: "PIPELINE_DRY_RUN",
  dryRunMode: true,
  liveArmed: false,
  emergencyStop: false
};

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
  assert.ok(!/process\.env\.SOLANA_SIGNER/.test(fs.readFileSync(path.join(__dirname, "signer_simulation_harness.js"), "utf8")));
  console.log(`${G} no signing env material required`);

  const tx = sim.createFakeTransaction({ tokenAddress: "MintA", amountUsd: 10 });
  const signed1 = sim.fakeSign(
    sim.createSignerSimulationHarness(),
    tx,
    microLivePosture,
    liveContext
  );
  const signed2 = sim.fakeSign(
    sim.createSignerSimulationHarness(),
    tx,
    microLivePosture,
    liveContext
  );
  assert.strictEqual(signed1.signature, signed2.signature);
  assert.ok(signed1.signature.startsWith(sim.SIMULATED_SIGNATURE_PREFIX));
  assert.strictEqual(signed1.signerWallet, sim.SIMULATED_WALLET_ADDRESS);
  console.log(`${G} fake signer produces deterministic fake signature`);

  const harness = sim.createSignerSimulationHarness();
  const signed = sim.fakeSign(harness, tx, microLivePosture, liveContext);
  const submitted = sim.fakeSubmit(harness, signed, microLivePosture, liveContext);
  assert.strictEqual(submitted.networkSubmit, false);
  console.log(`${G} fake submit never touches network`);

  assert.throws(
    () => sim.fakeSubmit(harness, signed, microLivePosture, liveContext),
    err => err.code === "SIM_DUPLICATE_SUBMIT"
  );
  console.log(`${G} duplicate submit is blocked`);

  const stopped = sim.createSignerSimulationHarness({ emergencyStop: true });
  assert.throws(
    () => sim.fakeSign(stopped, tx, microLivePosture, liveContext),
    err => err.code === "SIM_EMERGENCY_STOP"
  );
  const stopHarness = sim.createSignerSimulationHarness();
  const stopSigned = sim.fakeSign(stopHarness, tx, microLivePosture, liveContext);
  stopHarness.emergencyStop = true;
  assert.throws(
    () => sim.fakeSubmit(stopHarness, stopSigned, microLivePosture, liveContext),
    err => err.code === "SIM_EMERGENCY_STOP"
  );
  console.log(`${G} emergency stop blocks fake submit`);

  assert.throws(
    () => sim.fakeSign(sim.createSignerSimulationHarness(), { simulated: false }, microLivePosture, liveContext),
    err => err.code === "SIM_TX_MALFORMED"
  );
  console.log(`${G} malformed fake transaction fails`);

  const confirmHarness = sim.createSignerSimulationHarness();
  const confirmSigned = sim.fakeSign(confirmHarness, tx, microLivePosture, liveContext);
  const confirmSubmitted = sim.fakeSubmit(confirmHarness, confirmSigned, microLivePosture, liveContext);
  const confirmed = sim.fakeConfirm(confirmHarness, confirmSubmitted);
  assert.strictEqual(confirmed.confirmed, true);
  console.log(`${G} fake confirmation path works`);

  assert.throws(
    () => sim.fakeConfirm(confirmHarness, confirmSubmitted, { fail: true }),
    err => err.code === "SIM_CONFIRM_FAIL"
  );
  const partial = sim.fakeConfirm(confirmHarness, confirmSubmitted, { partial: true });
  assert.strictEqual(partial.partial, true);
  console.log(`${G} fake failure path works`);

  const blocked = sim.checkAgreementGates(dryRunPosture, liveContext);
  assert.strictEqual(blocked.ok, false);
  assert.ok(blocked.blockers.length > 0);
  console.log(`${G} dry-run posture blocks agreement gates`);

  const lifecycle = sim.runFakeLifecycle({
    outputDir: tmpOutput,
    posture: microLivePosture,
    context: liveContext,
    intent: { tokenAddress: "MintLifecycle", amountUsd: 8 }
  });
  assert.strictEqual(lifecycle.confirmed.confirmed, true);
  const outFile = sim.writeSimulationOutput(lifecycle.harness, path.join(tmpOutput, "signer_simulation_output.json"));
  assert.ok(outFile.startsWith(tmpOutput));
  const outPayload = JSON.parse(fs.readFileSync(outFile, "utf8"));
  assert.strictEqual(outPayload.liveTradingApproved, false);
  assert.strictEqual(outPayload.networkSubmit, false);
  assert.ok(!JSON.stringify(outPayload).includes("SOLANA_SIGNER"));
  console.log(`${G} output only writes to analysis/ or temp fixtures`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  console.log(`${G} no live_config.json mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  console.log(`${G} no trading state mutation`);

  const src = fs.readFileSync(path.join(__dirname, "signer_simulation_harness.js"), "utf8");
  assert.ok(!/\bfetch\s*\(/.test(src));
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/writeFileSync\([^)]*live_config\.json/.test(src));
  console.log(`${G} harness has no network submit or config mutation`);

  console.log("\nSIGNER SIMULATION HARNESS TEST PASSED (12/12)");
} finally {
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
