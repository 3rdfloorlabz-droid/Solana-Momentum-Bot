"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const common = require("./live_validation_common");
const manifest = require("./armed_preflight_manifest");
const checks = require("./armed_preflight_checks");
const session = require("./armed_preflight_session");
const { runArmedPreflight } = require("./validate_armed_preflight");
const { runArmedPreflightManifest } = require("./run_armed_preflight_manifest");

const G = "\x1b[32m✔\x1b[0m";

function armedCfg(overrides = {}) {
  return {
    executionMode: "LIVE",
    dryRunMode: false,
    automationEnabled: true,
    emergencyStop: false,
    walletPublicAddress: "FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6",
    positionSizeSol: 0.005,
    maxOpenTrades: 1,
    capitalExposure: "none",
    manualSlippageApprovalBps: 200,
    ...overrides
  };
}

function mockAdapters(overrides = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ap-unit-"));
  const configFile = path.join(tmp, "live_config.json");
  const cfg = armedCfg(overrides.config || {});
  fs.writeFileSync(configFile, `${JSON.stringify(cfg, null, 2)}\n`);
  fs.writeFileSync(path.join(tmp, "live_positions.json"), "[]\n");

  const base = checks.createDefaultAdapters(tmp);
  const sessionId = Object.prototype.hasOwnProperty.call(overrides, "sessionId")
    ? overrides.sessionId
    : "RB-G9-TEST-EV99";
  base.sessionId = sessionId;
  const authDir = path.join(tmp, "auth");
  fs.mkdirSync(authDir);
  for (const name of ["r15", "arming", "microLive", "stubCreation"]) {
    fs.writeFileSync(path.join(authDir, `${name}.md`), "# SIGNED\n**APPROVED**\n");
  }
  base.authorizationDocs = () => ({
    r15: path.join(authDir, "r15.md"),
    arming: path.join(authDir, "arming.md"),
    microLive: path.join(authDir, "microLive.md"),
    stubCreation: path.join(authDir, "stubCreation.md")
  });
  base.authorizationChainMode = "micro-live";
  base.configFile = configFile;
  base.loadConfig = () => JSON.parse(fs.readFileSync(configFile, "utf8"));
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
      approvalId: "TEST",
      operatorSignaturePresent: true
    };
  base.listProcesses = () => overrides.processes || [];
  base.readPositions = () => overrides.positions || [];
  base.countPendingReconciliation = () => overrides.pending ?? 0;
  base.recoveryState = () => ({ present: false, lineCount: 0 });
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
  base.jupiterProbe = async () => ({ ok: true, v6Removed: true, usesAdapter: true });
  base.runN6ArmedProbe = async () => overrides.n6 ?? { ok: true, evidence: { productionConfigUnchanged: true } };
  base.runR16Evidence = async () => ({ ok: true });
  base.armingBaselineHash = overrides.baseline ?? null;
  base.orStatus = overrides.orStatus || "not_promoted";
  base.root = tmp;

  if (overrides.patch) overrides.patch(base);
  return base;
}

async function test(name, fn) {
  await fn();
  console.log(`${G} ${name}`);
}

(async () => {
  await test("armed validator exits 2 in dry posture", async () => {
    const result = await runArmedPreflight();
    assert.strictEqual(result.exitCode, 2);
    assert.strictEqual(result.wrongPosture, true);
  });

  await test("armed validator fails when posture partially armed", async () => {
    const adapters = mockAdapters({ liveArmed: false, forceChecks: true });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.notStrictEqual(result.exitCode, 0);
  });

  await test("armed validator passes when all mandatory mocked checks pass", async () => {
    const adapters = mockAdapters();
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.receipt.overallStatus, "PASS");
    assert.strictEqual(result.receipt.checks.length, 20);
  });

  await test("executor loop presence fails AP-04", async () => {
    const adapters = mockAdapters({ processes: [{ pid: 1, isExecutorLoop: true }] });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.strictEqual(result.exitCode, 1);
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-04" && c.status === "FAIL"));
  });

  await test("auth mismatch fails AP-02 without session", async () => {
    const adapters = mockAdapters({ sessionId: null });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-02" && c.status === "FAIL"));
  });

  await test("stub mismatch fails AP-03", async () => {
    const adapters = mockAdapters({ stub: null });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-03" && c.status === "FAIL"));
  });

  await test("oriLinkage session binding passes AP-03", async () => {
    const sessionId = "RB-G9-TEST-EV99";
    const adapters = mockAdapters({
      stub: {
        oriLinkage: { sessionId },
        approvalId: "TEST",
        operatorSignaturePresent: true
      }
    });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    const ap03 = result.receipt.checks.find(c => c.checkId === "AP-03");
    assert.strictEqual(ap03.status, "PASS");
    assert.strictEqual(ap03.evidence.sessionId, sessionId);
  });

  await test("signer/public mismatch fails AP-10", async () => {
    const adapters = mockAdapters({ walletMatch: false });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-10" && c.status === "FAIL"));
  });

  await test("RPC failure fails AP-11", async () => {
    const adapters = mockAdapters({ rpc: { ok: false, reason: "rpc down" } });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-11" && c.status === "FAIL"));
  });

  await test("open position fails AP-06", async () => {
    const adapters = mockAdapters({ positions: [{ status: "OPEN", address: "x" }] });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-06" && c.status === "FAIL"));
  });

  await test("pending reconciliation fails AP-07", async () => {
    const adapters = mockAdapters({ pending: 2 });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-07" && c.status === "FAIL"));
  });

  await test("capital exposure fails AP-09", async () => {
    const adapters = mockAdapters({ capitalExposure: "enabled" });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-09" && c.status === "FAIL"));
  });

  await test("gate failures fail AP-12", async () => {
    const adapters = mockAdapters({ gateFailures: ["executionMode must be LIVE"] });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-12" && c.status === "FAIL"));
  });

  await test("AP-14 passes proof context to no-submit probe", async () => {
    const adapters = mockAdapters({
      patch: base => {
        base.authorizationChainMode = "armed-no-submit-proof";
        base.proofContext = session.PROOF_CONTEXT;
        base.probeBuyNoSubmit = async (cfg, options) => {
          assert.strictEqual(options.noSubmitProof, true);
          assert.strictEqual(options.proofContext, session.PROOF_CONTEXT);
          return { ok: true, preSubmitGuardsSatisfied: true };
        };
      }
    });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    const ap14 = result.receipt.checks.find(c => c.checkId === "AP-14");
    assert.strictEqual(ap14.status, "PASS");
    assert.strictEqual(ap14.evidence.purposeContext, "armed_no_submit_proof_only");
  });

  await test("default AP-14 proof probe uses armed-proof approval", async () => {
    const executor = require("./live_executor");
    const r16 = executor.__r16LivePathTest;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ap-unit-default-proof-"));
    const analysisDir = path.join(tmp, "analysis");
    fs.mkdirSync(analysisDir);
    fs.writeFileSync(path.join(tmp, "live_config.json"), `${JSON.stringify(armedCfg(), null, 2)}\n`);
    fs.writeFileSync(path.join(tmp, "live_positions.json"), "[]\n");

    const record = JSON.parse(fs.readFileSync(path.join(__dirname, "test_fixtures", "r15", "v2_armed_proof_valid.json"), "utf8"));
    record.approvalId = "RB-G9-TEST-EV99";
    record.oriLinkage.sessionId = "RB-G9-TEST-EV99";
    record.researchWalletPublicAddress = "FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6";
    record.walletPublicAddress = "FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6";

    const previous = {
      FOMO_ENABLE_LIVE_SUBMISSION: process.env.FOMO_ENABLE_LIVE_SUBMISSION,
      SOLANA_SIGNER_SECRET: process.env.SOLANA_SIGNER_SECRET,
      HELIUS_RPC_URL: process.env.HELIUS_RPC_URL
    };
    try {
      process.env.FOMO_ENABLE_LIVE_SUBMISSION = "YES";
      process.env.SOLANA_SIGNER_SECRET = "UNIT_TEST_SIGNER_PRESENT_ONLY";
      process.env.HELIUS_RPC_URL = "https://unit-test.invalid";
      r16.setApprovalRecordProviderForTest(() => record);
      r16.setCapitalExposureProviderForTest(() => "none");

      const adapters = checks.createDefaultAdapters(tmp);
      adapters.sessionId = "RB-G9-TEST-EV99";
      adapters.authorizationChainMode = "armed-no-submit-proof";
      adapters.proofContext = session.PROOF_CONTEXT;
      const cfg = { ...adapters.loadConfig(), sessionId: "RB-G9-TEST-EV99" };
      const ap14 = await checks.CHECK_RUNNERS["AP-14"](adapters, cfg);
      assert.strictEqual(ap14.status, "PASS");
      assert.strictEqual(ap14.evidence.purposeContext, "armed_no_submit_proof_only");
    } finally {
      r16.resetApprovalRecordProviderForTest();
      r16.resetCapitalExposureProviderForTest();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  await test("missing AP item fails manifest validation", async () => {
    const bad = manifest.validateManifestResults([common.buildCheckResult("AP-01", "PASS", "x", {})]);
    assert.strictEqual(bad.ok, false);
  });

  await test("duplicate AP item fails manifest validation", async () => {
    const one = common.buildCheckResult("AP-01", "PASS", "x", {});
    const bad = manifest.validateManifestResults([one, one]);
    assert.strictEqual(bad.ok, false);
  });

  await test("invalid status fails manifest validation", async () => {
    assert.throws(() => common.buildCheckResult("AP-01", "SKIP", "x", {}));
  });

  await test("missing rationale fails manifest validation", async () => {
    const checksList = manifest.AP_ORDER.map(id => ({
      checkId: id,
      status: "PASS",
      rationale: id === "AP-03" ? "" : "ok",
      evidence: {},
      timestamp: common.nowIso()
    }));
    const bad = manifest.validateManifestResults(checksList);
    assert.strictEqual(bad.ok, false);
  });

  await test("missing replacement evidence fails manifest validation", async () => {
    const bad = manifest.validateManifestResults([
      common.buildCheckResult("AP-01", "NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE", "x", {})
    ]);
    assert.strictEqual(bad.ok, false);
  });

  await test("deterministic receipt schema", async () => {
    const adapters = mockAdapters();
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.strictEqual(result.receipt.schemaVersion, common.SCHEMA_VERSION);
    assert.ok(result.receipt.startedAt);
    assert.ok(result.receipt.completedAt);
    assert.strictEqual(result.receipt.checks.length, 20);
    assert.ok(result.receipt.fingerprints);
    common.assertNoSecretInReceipt(result.receipt);
    const ids = result.receipt.checks.map(c => c.checkId);
    assert.deepStrictEqual(ids, manifest.AP_ORDER);
  });

  await test("manifest runner wrong posture exit 2", async () => {
    const result = await runArmedPreflightManifest();
    assert.strictEqual(result.exitCode, 2);
  });

  await test("secret values absent from receipts", async () => {
    process.env.SOLANA_SIGNER_SECRET = "[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64]";
    const adapters = mockAdapters();
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    const text = JSON.stringify(result.receipt);
    assert.ok(!text.includes("[1,2,3"));
    delete process.env.SOLANA_SIGNER_SECRET;
  });

  console.log("\nARMED PREFLIGHT UNIT TESTS PASSED\n");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
