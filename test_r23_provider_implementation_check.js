"use strict";

// test_r23_provider_implementation_check.js — Sprint 4 R23
// Validates read-only real provider implementation review in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r23 = require("./r23_provider_implementation_check");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r23-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r23-output-"));
const G = "\x1b[32m✔\x1b[0m";

const allGateDocs = { r21: true, r22: true, r23: true };

function goodCollectorConfig(overrides = {}) {
  return {
    schemaVersion: 1,
    configType: "EXAMPLE_ONLY",
    active: false,
    networkPollingAllowed: false,
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false,
    providers: [],
    candidateSources: ["fixture"],
    ...overrides
  };
}

function baseOptions(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: __dirname,
    analysisDir: tmpOutput,
    gateDocs: allGateDocs,
    r22CollectorPresent: true,
    r22ConfigPresent: true,
    collectorConfig: goodCollectorConfig(),
    ...overrides
  };
}

try {
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );

  const missingR22 = r23.collectR23ProviderImplementationStatus({
    ...baseOptions(),
    r22CollectorPresent: false
  });
  assert.strictEqual(missingR22.evaluation.reviewStatus, "BLOCKED");
  console.log(`${G} missing R22 blocks`);

  const missingR23 = r23.collectR23ProviderImplementationStatus({
    ...baseOptions(),
    gateDocs: { r21: true, r22: true, r23: false }
  });
  assert.strictEqual(missingR23.evaluation.reviewStatus, "BLOCKED");
  console.log(`${G} missing R23 blocks`);

  const activeProvider = r23.collectR23ProviderImplementationStatus({
    ...baseOptions(),
    collectorConfig: goodCollectorConfig({ active: true })
  });
  assert.strictEqual(activeProvider.evaluation.reviewStatus, "BLOCKED");
  console.log(`${G} active provider blocks`);

  const polling = r23.collectR23ProviderImplementationStatus({
    ...baseOptions(),
    collectorConfig: goodCollectorConfig({ networkPollingAllowed: true })
  });
  assert.strictEqual(polling.evaluation.reviewStatus, "BLOCKED");
  console.log(`${G} network polling true blocks`);

  const liveEnabled = r23.collectR23ProviderImplementationStatus({
    ...baseOptions(),
    collectorConfig: goodCollectorConfig({
      providers: [{ name: "jupiter", enabled: true }]
    })
  });
  assert.strictEqual(liveEnabled.evaluation.reviewStatus, "BLOCKED");
  console.log(`${G} live provider enabled blocks`);

  const secret = r23.collectR23ProviderImplementationStatus({
    ...baseOptions(),
    collectorConfig: goodCollectorConfig({ apiKey: "bad" })
  });
  assert.strictEqual(secret.evaluation.reviewStatus, "BLOCKED");
  console.log(`${G} secret-like provider config blocks`);

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: true,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const armed = r23.collectR23ProviderImplementationStatus(baseOptions());
  assert.strictEqual(armed.evaluation.reviewStatus, "BLOCKED");
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: false,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const dryFalse = r23.collectR23ProviderImplementationStatus(baseOptions());
  assert.strictEqual(dryFalse.evaluation.reviewStatus, "BLOCKED");
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
  const recovery = r23.collectR23ProviderImplementationStatus(baseOptions());
  assert.strictEqual(recovery.evaluation.reviewStatus, "BLOCKED");
  fs.unlinkSync(path.join(tmpRuntime, "recovery_actions.jsonl"));
  console.log(`${G} recovery_actions.jsonl present blocks`);

  const ready = r23.collectR23ProviderImplementationStatus(baseOptions());
  assert.strictEqual(ready.evaluation.reviewStatus, "READY_FOR_DISABLED_PROVIDER_ADAPTER_SKELETON");
  assert.strictEqual(ready.approved, false);
  console.log(`${G} ready status only means ready for disabled adapter skeleton`);

  const outputFile = path.join(tmpOutput, "r23_provider_implementation_status.json");
  const result = r23.runR23ProviderImplementationCheck({
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

  const src = fs.readFileSync(path.join(__dirname, "r23_provider_implementation_check.js"), "utf8");
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  console.log(`${G} no network calls`);

  console.log("\nR23 PROVIDER IMPLEMENTATION CHECK TEST PASSED (16/16)");
} finally {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
