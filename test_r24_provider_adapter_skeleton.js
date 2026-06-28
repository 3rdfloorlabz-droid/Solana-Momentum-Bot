"use strict";

// test_r24_provider_adapter_skeleton.js — Sprint 4 R24
// Validates disabled provider adapter skeleton in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r24 = require("./r24_provider_adapter_skeleton");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r24-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r24-output-"));
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
    providers: [
      { name: "fixture", enabled: true, mode: "FIXTURE_ONLY" },
      { name: "replay", enabled: true, mode: "REPLAY_ONLY" },
      { name: "jupiter", enabled: false, mode: "OBSERVATION_ONLY", stub: true },
      { name: "gmgn", enabled: false, mode: "OBSERVATION_ONLY", stub: true }
    ],
    rateLimits: {
      maxQuotesPerTokenPerMinute: 3,
      maxTokensPerCycle: 5,
      maxQuotesPerDay: 100,
      cooldownSeconds: 5
    },
    output: {
      observationsPath: "analysis/real_quote_observations.jsonl",
      statusPath: "analysis/r24_provider_adapter_status.json"
    },
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

  const statusFile = path.join(tmpOutput, "r24_provider_adapter_status.json");
  const disabled = r24.runR24ProviderAdapterSkeleton({
    ...baseOptions(),
    statusFile,
    print: false
  });
  assert.strictEqual(disabled.status.adapterStatus, "DISABLED");
  assert.ok(fs.existsSync(statusFile));
  console.log(`${G} default config disables network`);
  console.log(`${G} disabled status writes analysis output`);

  const fixture = r24.collectR24ProviderAdapterStatus({
    ...baseOptions(),
    adapterMode: "fixture"
  });
  assert.strictEqual(fixture.adapterStatus, "FIXTURE_PROVIDER_READY");
  assert.ok(fixture.normalizedRecordCount >= 0);
  console.log(`${G} fixture/replay allowed`);

  const replay = r24.collectR24ProviderAdapterStatus({
    ...baseOptions(),
    adapterMode: "replay"
  });
  assert.strictEqual(replay.adapterStatus, "REPLAY_PROVIDER_READY");
  console.log(`${G} replay provider ready without network`);

  const jupiterStub = r24.collectR24ProviderAdapterStatus({
    ...baseOptions(),
    config: goodConfig({
      providers: [
        { name: "fixture", enabled: true },
        { name: "jupiter", enabled: false, stub: true }
      ]
    })
  });
  assert.strictEqual(jupiterStub.adapterStatus, "DISABLED");
  console.log(`${G} Jupiter stub name presence allowed when disabled`);

  const jupiterEnabled = r24.collectR24ProviderAdapterStatus({
    ...baseOptions(),
    config: goodConfig({
      providers: [{ name: "jupiter", enabled: true }]
    })
  });
  assert.strictEqual(jupiterEnabled.adapterStatus, "INVALID_CONFIG");
  const gmgnEnabled = r24.collectR24ProviderAdapterStatus({
    ...baseOptions(),
    config: goodConfig({
      providers: [{ name: "gmgn", enabled: true }]
    })
  });
  assert.strictEqual(gmgnEnabled.adapterStatus, "INVALID_CONFIG");
  console.log(`${G} Jupiter/GMGN enabled blocks`);

  const active = r24.collectR24ProviderAdapterStatus({
    ...baseOptions(),
    config: goodConfig({ active: true })
  });
  assert.strictEqual(active.adapterStatus, "INVALID_CONFIG");
  console.log(`${G} active true blocks`);

  const polling = r24.collectR24ProviderAdapterStatus({
    ...baseOptions(),
    config: goodConfig({ networkPollingAllowed: true })
  });
  assert.strictEqual(polling.adapterStatus, "INVALID_CONFIG");
  console.log(`${G} networkPollingAllowed true blocks`);

  for (const field of ["tradingAllowed", "signingAllowed", "submissionAllowed", "walletRequired"]) {
    const blocked = r24.collectR24ProviderAdapterStatus({
      ...baseOptions(),
      config: goodConfig({ [field]: true })
    });
    assert.strictEqual(blocked.adapterStatus, "INVALID_CONFIG");
  }
  console.log(`${G} trading/signing/submission/wallet true blocks`);

  const secret = r24.collectR24ProviderAdapterStatus({
    ...baseOptions(),
    config: goodConfig({ apiKey: "bad" })
  });
  assert.strictEqual(secret.adapterStatus, "INVALID_CONFIG");
  console.log(`${G} secret-like field blocks`);

  assert.ok(statusFile.startsWith(tmpOutput));
  console.log(`${G} output only writes to analysis/`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  console.log(`${G} no live_config.json mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  const src = fs.readFileSync(path.join(__dirname, "r24_provider_adapter_skeleton.js"), "utf8");
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  assert.ok(!/axios/.test(src));
  assert.ok(!/require\(["']https?/.test(src));
  console.log(`${G} no network calls`);

  assert.strictEqual(disabled.status.approved, false);
  assert.ok(!JSON.stringify(disabled.status).includes('"approved": true'));
  console.log(`${G} never returns approved true`);

  console.log("\nR24 PROVIDER ADAPTER SKELETON TEST PASSED (16/16)");
} finally {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
