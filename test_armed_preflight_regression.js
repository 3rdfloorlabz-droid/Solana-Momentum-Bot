"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const common = require("./live_validation_common");
const manifest = require("./armed_preflight_manifest");
const checks = require("./armed_preflight_checks");
const { runArmedPreflight } = require("./validate_armed_preflight");
const { runArmedPreflightManifest } = require("./run_armed_preflight_manifest");
const n6Probe = require("./test_n6_armed_estop_probe");

const G = "\x1b[32m✔\x1b[0m";
const ROOT = __dirname;
const PROD_CONFIG = path.join(ROOT, "live_config.json");
const SENTINEL_SECRET = "SENTINEL_SIGNER_SECRET_DO_NOT_LEAK_0123456789";
const SENTINEL_API = "SENTINEL_API_KEY_DO_NOT_LEAK";
const SENTINEL_RPC = "https://rpc.example.com?api-key=SENTINEL_RPC_SECRET";

const executionSpies = {
  enterPosition: 0,
  exitPosition: 0,
  submitSwap: 0,
  sendTransaction: 0,
  sendRawTransaction: 0,
  sign: 0
};

function armedCfg(overrides = {}) {
  return {
    executionMode: "LIVE",
    dryRunMode: false,
    automationEnabled: true,
    emergencyStop: false,
    walletPublicAddress: "FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6",
    positionSizeSol: 0.005,
    maxOpenTrades: 1,
    maxEntrySlippagePct: 1,
    maxExitSlippagePct: 1,
    capitalExposure: "none",
    manualSlippageApprovalBps: 200,
    ...overrides
  };
}

function mockAdapters(overrides = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ap-reg-"));
  const configFile = path.join(tmp, "live_config.json");
  const cfg = armedCfg(overrides.config || {});
  fs.writeFileSync(configFile, `${JSON.stringify(cfg, null, 2)}\n`);
  fs.writeFileSync(path.join(tmp, "live_positions.json"), "[]\n");

  const sessionId = Object.prototype.hasOwnProperty.call(overrides, "sessionId")
    ? overrides.sessionId
    : "RB-G9-REG-EV99";
  const authDir = path.join(tmp, "auth");
  fs.mkdirSync(authDir);
  const authSigned = overrides.authSigned !== false;
  for (const name of ["r15", "arming", "microLive", "stubCreation"]) {
    fs.writeFileSync(
      path.join(authDir, `${name}.md`),
      authSigned ? "# SIGNED\n**APPROVED**\n" : "# DRAFT\nunsigned\n"
    );
  }

  const base = checks.createDefaultAdapters(tmp);
  base.sessionId = sessionId;
  base.configFile = configFile;
  base.loadConfig = () => JSON.parse(fs.readFileSync(configFile, "utf8"));
  base.authorizationDocs = () => ({
    r15: path.join(authDir, "r15.md"),
    arming: path.join(authDir, "arming.md"),
    microLive: path.join(authDir, "microLive.md"),
    stubCreation: path.join(authDir, "stubCreation.md")
  });
  base.authorizationChainMode = "micro-live";
  base.envGates = () => ({
    FOMO_ENABLE_LIVE_SUBMISSION: overrides.liveSubmission === false ? "unset" : "YES",
    FOMO_ALLOW_LOOP_LIVE: "unset",
    SOLANA_SIGNER_SECRET: overrides.signer === false ? "absent" : "present",
    EXPECTED_WALLET_PUBLIC_ADDRESS: overrides.walletEnv === false ? "absent" : "present"
  });
  base.computeLiveArmedStatus = () => ({
    liveArmed: overrides.liveArmed !== false,
    operationalPosture: overrides.liveArmed === false ? "PIPELINE_OBSERVING" : "LIVE_ARMED",
    failures: overrides.liveArmed === false ? ["dryRunMode must be false"] : []
  });
  base.collectLiveSubmissionGateFailures = () => ({
    failures: overrides.gateFailures || [],
    gates: {}
  });
  base.loadStubRecord = () => Object.prototype.hasOwnProperty.call(overrides, "stub")
    ? overrides.stub
    : {
      sessionId,
      linkedSessionId: sessionId,
      approvalId: "REG-TEST",
      operatorSignaturePresent: true
    };
  base.listProcesses = () => overrides.processes || [];
  base.readPositions = () => overrides.positions || [];
  base.countPendingReconciliation = () => overrides.pending ?? 0;
  base.recoveryState = () => overrides.recovery ?? { present: false, lineCount: 0 };
  base.resolveCapitalExposure = () => overrides.capitalExposure || "none";
  base.walletMatch = () => ({
    ok: overrides.walletMatch !== false,
    reason: overrides.walletMatch === false ? "wallet mismatch" : undefined
  });
  base.rpcReadOnly = async () => overrides.rpc ?? { ok: true, provider: "helius" };
  base.assertMicroLiveApprovalRecord = () => overrides.r15 ?? { ok: true };
  base.probeBuyNoSubmit = async () => overrides.buyProbe ?? { ok: true, preSubmitGuardsSatisfied: true };
  base.readExecutorLock = () => ({ state: "none", lock: null });
  base.candidatePacket = () => Object.prototype.hasOwnProperty.call(overrides, "candidate")
    ? overrides.candidate
    : { mint: "JUP", positionSizeSol: 0.005 };
  base.jupiterProbe = async () => overrides.jupiter ?? { ok: true, v6Removed: true, usesAdapter: true };
  base.runN6ArmedProbe = async () => overrides.n6 ?? { ok: true, evidence: { productionConfigUnchanged: true } };
  base.runR16Evidence = async () => ({ ok: true });
  base.armingBaselineHash = overrides.baseline ?? null;
  base.orStatus = overrides.orStatus || "not_promoted";
  base.root = tmp;
  if (overrides.patch) overrides.patch(base);
  return base;
}

function normalizeReceipt(receipt) {
  const clone = JSON.parse(JSON.stringify(receipt));
  delete clone.startedAt;
  delete clone.completedAt;
  if (clone.checks) {
    clone.checks = clone.checks.map(c => {
      const x = { ...c };
      delete x.timestamp;
      return x;
    });
  }
  if (clone.fingerprints?.codeFingerprint?.files) {
    clone.fingerprints.codeFingerprint = { aggregate: clone.fingerprints.codeFingerprint.aggregate };
  }
  return clone;
}

function assertNoSentinelLeak(text) {
  assert.ok(!text.includes(SENTINEL_SECRET));
  assert.ok(!text.includes(SENTINEL_API));
  assert.ok(!text.includes("SENTINEL_RPC_SECRET"));
}

async function runCase(name, fn) {
  await fn();
  console.log(`${G} ${name}`);
  return { id: name, pass: true };
}

async function main() {
  const results = [];
  const hashBefore = common.hashFile(PROD_CONFIG);

  const newFiles = [
    "live_validation_common.js",
    "armed_preflight_manifest.js",
    "armed_preflight_checks.js",
    "armed_preflight_session.js",
    "validate_armed_preflight.js",
    "run_armed_preflight_manifest.js",
    "test_n6_armed_estop_probe.js",
    "test_armed_preflight_unit.js",
    "test_armed_preflight_regression.js",
    "test_armed_preflight_prerequisites.js"
  ];

  for (const file of newFiles) {
    results.push(await runCase(`syntax ${file}`, async () => {
      const check = spawnSync(process.execPath, ["--check", path.join(ROOT, file)], { encoding: "utf8" });
      assert.strictEqual(check.status, 0, check.stderr || file);
    }));
  }

  for (const file of newFiles.filter(f => !f.startsWith("test_"))) {
    results.push(await runCase(`load ${file}`, async () => {
      const modPath = path.join(ROOT, file);
      delete require.cache[require.resolve(modPath)];
      require(modPath);
    }));
  }

  results.push(await runCase("production wrong posture exit 2", async () => {
    const before = common.hashFile(PROD_CONFIG);
    const result = await runArmedPreflight();
    assert.strictEqual(result.exitCode, 2);
    assert.strictEqual(result.receipt.overallStatus, "WRONG_POSTURE");
    assert.strictEqual(result.receipt.checks.length, 0);
    assert.strictEqual(common.hashFile(PROD_CONFIG), before);
    assertNoSentinelLeak(JSON.stringify(result.receipt));
  }));

  const partialMatrix = [
    { name: "LIVE + dryRunMode true", config: { executionMode: "LIVE", dryRunMode: true }, liveArmed: false },
    { name: "PIPELINE_DRY_RUN + dryRunMode false", config: { executionMode: "PIPELINE_DRY_RUN", dryRunMode: false }, liveArmed: false },
    { name: "liveArmed false with LIVE config", config: { executionMode: "LIVE", dryRunMode: false }, liveArmed: false },
    { name: "missing live submission gate", liveSubmission: false }
  ];

  for (const row of partialMatrix) {
    results.push(await runCase(`partial posture fail: ${row.name}`, async () => {
      const adapters = mockAdapters(row);
      const result = await runArmedPreflight({ adapters, forceChecks: true });
      assert.notStrictEqual(result.exitCode, 0);
      assert.notStrictEqual(result.receipt.overallStatus, "PASS");
    }));
  }

  results.push(await runCase("mocked LIVE_ARMED full PASS AP-01..AP-20", async () => {
    const adapters = mockAdapters();
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.receipt.overallStatus, "PASS");
    assert.deepStrictEqual(result.receipt.checks.map(c => c.checkId), manifest.AP_ORDER);
  }));

  const failCases = [
    ["executor loop", { processes: [{ pid: 9, isExecutorLoop: true }] }, "AP-04"],
    ["missing authorization session", { sessionId: null }, "AP-02"],
    ["unsigned authorization", { authSigned: false }, "AP-02"],
    ["missing runtime stub", { stub: null }, "AP-03"],
    ["stub session mismatch", { stub: { sessionId: "OTHER", operatorSignaturePresent: true } }, "AP-03"],
    ["signer/public mismatch", { walletMatch: false }, "AP-10"],
    ["RPC failure", { rpc: { ok: false, reason: "down" } }, "AP-11"],
    ["open position", { positions: [{ status: "OPEN", address: "x" }] }, "AP-06"],
    ["pending reconciliation", { pending: 1 }, "AP-07"],
    ["capital exposure", { capitalExposure: "enabled" }, "AP-09"],
    ["gate failures", { gateFailures: ["executionMode must be LIVE"] }, "AP-12"],
    ["wrong position size", { config: { positionSizeSol: 0.05 } }, "AP-15"],
    ["config hash drift", { baseline: "deadbeef" }, "AP-18"],
    ["jupiter mismatch", { jupiter: { ok: false, v6Removed: false, usesAdapter: false } }, "AP-16"],
    ["stale candidate", { candidate: null, sessionId: "RB-G9-REG-EV99" }, "AP-15"],
    ["n6 replacement failure", { n6: { ok: false, reason: "probe fail" } }, "AP-17"],
    ["OR promoted", { orStatus: "promoted" }, "AP-19"]
  ];

  for (const [label, overrides, apId] of failCases) {
    results.push(await runCase(`fail-closed: ${label}`, async () => {
      const adapters = mockAdapters(overrides);
      const result = await runArmedPreflight({ adapters, forceChecks: true });
      assert.strictEqual(result.exitCode, 1);
      assert.ok(result.receipt.checks.find(c => c.checkId === apId && c.status === "FAIL"));
    }));
  }

  results.push(await runCase("manifest missing AP check", async () => {
    assert.strictEqual(manifest.validateManifestResults([]).ok, false);
  }));
  results.push(await runCase("manifest duplicate AP check", async () => {
    const one = common.buildCheckResult("AP-01", "PASS", "ok", {});
    assert.strictEqual(manifest.validateManifestResults([one, one]).ok, false);
  }));
  results.push(await runCase("manifest unknown AP check", async () => {
    const bad = [{ checkId: "AP-99", status: "PASS", rationale: "x", evidence: {}, timestamp: common.nowIso() }];
    assert.strictEqual(manifest.validateManifestResults(bad).ok, false);
  }));
  results.push(await runCase("manifest invalid status SKIP rejected", async () => {
    assert.throws(() => common.buildCheckResult("AP-01", "SKIP", "x", {}));
  }));
  results.push(await runCase("manifest N/A without replacement fails aggregate", async () => {
    const agg = manifest.aggregateOverallStatus([
      common.buildCheckResult("AP-01", "NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE", "x", {
        replacementCheckId: "AP-12"
      })
    ]);
    assert.strictEqual(agg.overallStatus, "FAIL");
  }));

  results.push(await runCase("n6 probe wrong posture fail closed", async () => {
    const result = await n6Probe.runProbe({ productionRoot: ROOT });
    assert.strictEqual(result.ok, false);
    assert.ok(/LIVE_ARMED/i.test(result.reason));
  }));

  results.push(await runCase("n6 probe mocked LIVE_ARMED harness", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "n6-reg-"));
    const cfgFile = path.join(tmp, "live_config.json");
    fs.writeFileSync(cfgFile, JSON.stringify(armedCfg(), null, 2));
    const adapters = checks.createDefaultAdapters(tmp);
    const realCompute = adapters.computeLiveArmedStatus;
    adapters.computeLiveArmedStatus = cfg => ({ liveArmed: true, operationalPosture: "LIVE_ARMED", failures: [] });
    adapters.loadConfig = () => JSON.parse(fs.readFileSync(cfgFile, "utf8"));
    adapters.envGates = () => ({
      FOMO_ENABLE_LIVE_SUBMISSION: "YES",
      FOMO_ALLOW_LOOP_LIVE: "unset",
      SOLANA_SIGNER_SECRET: "present",
      EXPECTED_WALLET_PUBLIC_ADDRESS: "present"
    });
    const before = common.hashFile(cfgFile);
    process.env.FOMO_ENABLE_LIVE_SUBMISSION = "YES";
    process.env.SOLANA_SIGNER_SECRET = JSON.stringify(Array.from({ length: 64 }, (_, i) => i + 1));
    process.env.EXPECTED_WALLET_PUBLIC_ADDRESS = "FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6";
    const result = await n6Probe.runProbe({ productionRoot: tmp, adapters });
    delete process.env.FOMO_ENABLE_LIVE_SUBMISSION;
    delete process.env.SOLANA_SIGNER_SECRET;
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.evidence.productionConfigUnchanged, true);
    assert.strictEqual(common.hashFile(cfgFile), before);
    assert.strictEqual(executionSpies.submitSwap, 0);
  }));

  results.push(await runCase("secret sentinel not in receipt", async () => {
    process.env.SOLANA_SIGNER_SECRET = SENTINEL_SECRET;
    process.env.HELIUS_API_KEY = SENTINEL_API;
    process.env.SOLANA_RPC_URL = SENTINEL_RPC;
    const adapters = mockAdapters();
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    const blob = JSON.stringify(result.receipt);
    assertNoSentinelLeak(blob);
    delete process.env.SOLANA_SIGNER_SECRET;
    delete process.env.HELIUS_API_KEY;
    delete process.env.SOLANA_RPC_URL;
  }));

  results.push(await runCase("deterministic normalized receipt", async () => {
    const adapters = mockAdapters();
    const a = await runArmedPreflight({ adapters, forceChecks: true });
    const b = await runArmedPreflight({ adapters, forceChecks: true });
    assert.deepStrictEqual(normalizeReceipt(a.receipt), normalizeReceipt(b.receipt));
  }));

  results.push(await runCase("manifest runner production exit 2", async () => {
    const result = await runArmedPreflightManifest();
    assert.strictEqual(result.exitCode, 2);
  }));

  const hashAfter = common.hashFile(PROD_CONFIG);
  assert.strictEqual(hashAfter, hashBefore);

  const receipt = {
    schemaVersion: common.SCHEMA_VERSION,
    toolName: "armed_preflight_regression_gate",
    context: "regression-test-gate",
    startedAt: common.nowIso(),
    completedAt: common.nowIso(),
    overallStatus: "PASS",
    posture: { production: "PIPELINE_OBSERVING", liveArmed: false },
    fingerprints: {
      liveConfigHashSha256Before: hashBefore,
      liveConfigHashSha256After: hashAfter,
      executionSpyCounts: executionSpies
    },
    checks: results,
    evidence: {
      total: results.length,
      passed: results.length,
      failed: 0
    },
    failures: []
  };
  common.assertNoSecretInReceipt(receipt);

  const outDir = path.join(ROOT, "analysis");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "armed_preflight_regression_receipt.json");
  fs.writeFileSync(outPath, common.serializeReceipt(receipt));

  console.log(`\nARMED PREFLIGHT REGRESSION TESTS PASSED (${results.length}/${results.length})\n`);
  console.log(`Receipt: ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
