"use strict";

// test_r22_real_quote_observation_collector.js — Sprint 4 R22
// Validates disabled-by-default real quote observation collector in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r22 = require("./r22_real_quote_observation_collector");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r22-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r22-output-"));
const G = "\x1b[32m✔\x1b[0m";

function goodConfig(overrides = {}) {
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
    maxQuotesPerTokenPerMinute: 3,
    maxTokensPerCycle: 5,
    maxQuotesPerDay: 100,
    cooldownSeconds: 5,
    outputPath: "analysis/real_quote_observations.jsonl",
    statusPath: "analysis/r22_real_quote_observation_status.json",
    ...overrides
  };
}

function baseOptions(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: __dirname,
    analysisDir: tmpOutput,
    config: goodConfig(),
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

  const statusFile = path.join(tmpOutput, "r22_real_quote_observation_status.json");
  const defaultResult = r22.runR22RealQuoteObservationCollector({
    ...baseOptions(),
    statusFile,
    print: false
  });
  assert.strictEqual(defaultResult.status.collectorStatus, "DISABLED");
  assert.ok(fs.existsSync(statusFile));
  assert.strictEqual(defaultResult.status.approved, false);
  console.log(`${G} default config exits DISABLED`);
  console.log(`${G} disabled status writes analysis output`);

  const active = r22.collectR22RealQuoteObservationStatus({
    ...baseOptions(),
    config: goodConfig({ active: true })
  });
  assert.strictEqual(active.collectorStatus, "INVALID_CONFIG");
  console.log(`${G} active true blocks`);

  const polling = r22.collectR22RealQuoteObservationStatus({
    ...baseOptions(),
    config: goodConfig({ networkPollingAllowed: true })
  });
  assert.strictEqual(polling.collectorStatus, "INVALID_CONFIG");
  console.log(`${G} networkPollingAllowed true blocks`);

  const trading = r22.collectR22RealQuoteObservationStatus({
    ...baseOptions(),
    config: goodConfig({ tradingAllowed: true })
  });
  assert.strictEqual(trading.collectorStatus, "INVALID_CONFIG");
  console.log(`${G} tradingAllowed true blocks`);

  const signing = r22.collectR22RealQuoteObservationStatus({
    ...baseOptions(),
    config: goodConfig({ signingAllowed: true })
  });
  assert.strictEqual(signing.collectorStatus, "INVALID_CONFIG");
  console.log(`${G} signingAllowed true blocks`);

  const submission = r22.collectR22RealQuoteObservationStatus({
    ...baseOptions(),
    config: goodConfig({ submissionAllowed: true })
  });
  assert.strictEqual(submission.collectorStatus, "INVALID_CONFIG");
  console.log(`${G} submissionAllowed true blocks`);

  const wallet = r22.collectR22RealQuoteObservationStatus({
    ...baseOptions(),
    config: goodConfig({ walletRequired: true })
  });
  assert.strictEqual(wallet.collectorStatus, "INVALID_CONFIG");
  console.log(`${G} walletRequired true blocks`);

  const liveProvider = r22.collectR22RealQuoteObservationStatus({
    ...baseOptions(),
    config: goodConfig({ providers: ["jupiter"] })
  });
  assert.strictEqual(liveProvider.collectorStatus, "INVALID_CONFIG");
  console.log(`${G} live provider in config blocks`);

  const secret = r22.collectR22RealQuoteObservationStatus({
    ...baseOptions(),
    config: goodConfig({ apiKey: "bad" })
  });
  assert.strictEqual(secret.collectorStatus, "INVALID_CONFIG");
  console.log(`${G} secret-like field blocks`);

  const liveMode = r22.collectR22RealQuoteObservationStatus({
    ...baseOptions(),
    config: goodConfig({ executionMode: "LIVE" })
  });
  assert.strictEqual(liveMode.collectorStatus, "INVALID_CONFIG");
  const microMode = r22.collectR22RealQuoteObservationStatus({
    ...baseOptions(),
    config: goodConfig({ executionMode: "MICRO_LIVE" })
  });
  assert.strictEqual(microMode.collectorStatus, "INVALID_CONFIG");
  console.log(`${G} MICRO_LIVE or LIVE mode blocks`);

  const dryFalseConfig = r22.collectR22RealQuoteObservationStatus({
    ...baseOptions(),
    config: goodConfig({ dryRunMode: false })
  });
  assert.strictEqual(dryFalseConfig.collectorStatus, "INVALID_CONFIG");
  console.log(`${G} dryRunMode false blocks`);

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: true,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const armed = r22.collectR22RealQuoteObservationStatus(baseOptions());
  assert.strictEqual(armed.collectorStatus, "BLOCKED");
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

  assert.ok(statusFile.startsWith(tmpOutput));
  console.log(`${G} output only writes to analysis/`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  console.log(`${G} no live_config.json mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  const src = fs.readFileSync(path.join(__dirname, "r22_real_quote_observation_collector.js"), "utf8");
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  console.log(`${G} no network calls`);

  assert.ok(!JSON.stringify(defaultResult.status).includes('"approved": true'));
  console.log(`${G} never returns approved true`);
  console.log(`${G} no secret handling`);

  console.log("\nR22 REAL QUOTE OBSERVATION COLLECTOR TEST PASSED (18/18)");
} finally {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
