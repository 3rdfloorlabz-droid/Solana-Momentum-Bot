"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const common = require("./live_validation_common");
const manifest = require("./armed_preflight_manifest");
const checks = require("./armed_preflight_checks");
const session = require("./armed_preflight_session");
const { runArmedPreflight, buildOptionsFromCli } = require("./validate_armed_preflight");
const { runArmedPreflightManifest } = require("./run_armed_preflight_manifest");

const G = "\x1b[32m✔\x1b[0m";
const ROOT = __dirname;
const PROD_CONFIG = path.join(ROOT, "live_config.json");
const VALID_SESSION = "RB-G9-20260710-AP01";
const VALID_HASH = "0996882e1a5244d05079a2a6f3ff09049758ecbbf3b8e3e0434ee4b13a4d33ef";
const SENTINEL_SECRET = "SENTINEL_SIGNER_SECRET_DO_NOT_LEAK_0123456789";
const SENTINEL_API = "SENTINEL_API_KEY_DO_NOT_LEAK";
const SENTINEL_RPC = "https://rpc.example.com?api-key=SENTINEL_RPC_SECRET";

const results = [];
const hashBefore = common.hashFile(PROD_CONFIG);

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
    compoundingEnabled: false,
    averagingDownEnabled: false,
    martingaleEnabled: false,
    capitalExposure: "none",
    ...overrides
  };
}

function writeAuthDoc(filePath, { sessionId, title, signed = true, consumed = false, extra = "" }) {
  const status = consumed
    ? "CONSUMED/CLOSED — do not reuse"
    : signed
      ? "**SIGNED — APPROVED**"
      : "DRAFT ONLY — NOT SIGNED — NOT AUTHORIZED";
  fs.writeFileSync(filePath, [`# ${title}`, status, `Session ID: ${sessionId}`, extra].join("\n"));
}

function writeProofAuthSet(authDir, sessionId, options = {}) {
  const prohibitions = options.g4Extra || [
    "submit prohibited",
    "sign prohibited",
    "broadcast prohibited",
    "candidate selection prohibited",
    "capital exposure prohibited"
  ].join("\n");
  writeAuthDoc(path.join(authDir, "g1-r15.md"), { sessionId, title: "AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY", signed: options.signed !== false, consumed: options.consumed === true });
  writeAuthDoc(path.join(authDir, "g2-arming.md"), { sessionId, title: "AUTHORIZATION — Arming", signed: options.signed !== false, consumed: options.consumed === true });
  writeAuthDoc(path.join(authDir, "g3-stub-creation.md"), { sessionId, title: "AUTHORIZATION — Runtime R15 Approval Stub Creation", signed: options.signed !== false, consumed: options.consumed === true });
  writeAuthDoc(path.join(authDir, "g4-proof-auth.md"), { sessionId, title: "AUTHORIZATION — Armed No-Submit Proof", signed: options.signed !== false, consumed: options.consumed === true, extra: prohibitions });
  return {
    g1: path.join(authDir, "g1-r15.md"),
    g2: path.join(authDir, "g2-arming.md"),
    g3: path.join(authDir, "g3-stub-creation.md"),
    g4: path.join(authDir, "g4-proof-auth.md")
  };
}

function proofAdapters(overrides = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ap-prg-"));
  const configFile = path.join(tmp, "live_config.json");
  const cfg = armedCfg(overrides.config || {});
  fs.writeFileSync(configFile, `${JSON.stringify(cfg, null, 2)}\n`);
  fs.writeFileSync(path.join(tmp, "live_positions.json"), "[]\n");
  const sessionId = overrides.sessionId === undefined ? VALID_SESSION : overrides.sessionId;
  const authDir = path.join(tmp, "auth");
  fs.mkdirSync(authDir);
  const documents = sessionId ? writeProofAuthSet(authDir, sessionId, overrides.auth || {}) : null;
  const base = checks.createDefaultAdapters(tmp);
  base.configFile = configFile;
  base.loadConfig = () => JSON.parse(fs.readFileSync(configFile, "utf8"));
  base.sessionId = sessionId;
  base.armingBaselineHash = overrides.baseline ?? VALID_HASH;
  base.executionPathCallCount = overrides.executionPathCallCount ?? 0;
  base.proofAuthorizationProhibitsExecution = overrides.proofAuthorizationProhibitsExecution !== false;
  base.automationCandidateHandoffDisabled = overrides.automationCandidateHandoffDisabled !== false;
  base.runtimeStubPurpose = overrides.runtimeStubPurpose ?? "armed_no_submit_proof_only";
  if (documents) {
    session.applySessionLinkage(base, {
      sessionId,
      armingBaselineHash: base.armingBaselineHash,
      proofContext: session.PROOF_CONTEXT,
      authorizationChainMode: "armed-no-submit-proof",
      documents,
      authorizationMetadata: {}
    });
  }
  base.envGates = () => ({ FOMO_ENABLE_LIVE_SUBMISSION: "YES", FOMO_ALLOW_LOOP_LIVE: "unset", SOLANA_SIGNER_SECRET: "present", EXPECTED_WALLET_PUBLIC_ADDRESS: "present" });
  base.computeLiveArmedStatus = () => ({ liveArmed: true, operationalPosture: "LIVE_ARMED", failures: [] });
  base.collectLiveSubmissionGateFailures = () => ({ failures: [], gates: {} });
  base.loadStubRecord = () => ({ sessionId, linkedSessionId: sessionId, approvalId: "PRG", operatorSignaturePresent: true });
  base.listProcesses = () => [];
  base.readPositions = () => [];
  base.countPendingReconciliation = () => 0;
  base.recoveryState = () => ({ present: false, lineCount: 0 });
  base.resolveCapitalExposure = () => "none";
  base.walletMatch = () => ({ ok: true });
  base.rpcReadOnly = async () => ({ ok: true, provider: "helius" });
  base.assertMicroLiveApprovalRecord = () => ({ ok: true });
  base.probeBuyNoSubmit = async () => ({ ok: true, preSubmitGuardsSatisfied: true });
  base.readExecutorLock = () => ({ state: "none", lock: null });
  base.candidatePacket = () => overrides.candidate ?? null;
  base.getExecutionQuoteMetadata = () => overrides.quoteMetadata ?? null;
  base.getTradeMetadata = () => overrides.tradeMetadata ?? null;
  base.jupiterProbe = async () => ({ ok: true, v6Removed: true, usesAdapter: true });
  base.runN6ArmedProbe = async () => ({ ok: true, evidence: { productionConfigUnchanged: true } });
  base.runR16Evidence = async () => ({ ok: true });
  base.orStatus = "not_promoted";
  base.root = tmp;
  if (overrides.patch) overrides.patch(base);
  return base;
}

function microLiveAdapters() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ap-ml-prg-"));
  const configFile = path.join(tmp, "live_config.json");
  fs.writeFileSync(configFile, `${JSON.stringify(armedCfg(), null, 2)}\n`);
  const authDir = path.join(tmp, "auth");
  fs.mkdirSync(authDir);
  const sessionId = "RB-G9-20260710-AP02";
  for (const [name, title] of [["r15", "AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY"], ["arming", "AUTHORIZATION — Arming"], ["microLive", "AUTHORIZATION — Micro-Live Execution"], ["stubCreation", "AUTHORIZATION — Runtime R15 Approval Stub Creation"]]) {
    writeAuthDoc(path.join(authDir, `${name}.md`), { sessionId, title, signed: true });
  }
  const base = checks.createDefaultAdapters(tmp);
  base.configFile = configFile;
  base.loadConfig = () => JSON.parse(fs.readFileSync(configFile, "utf8"));
  base.sessionId = sessionId;
  base.authorizationDocs = () => ({ r15: path.join(authDir, "r15.md"), arming: path.join(authDir, "arming.md"), microLive: path.join(authDir, "microLive.md"), stubCreation: path.join(authDir, "stubCreation.md") });
  base.authorizationChainMode = "micro-live";
  base.candidatePacket = () => ({ mint: "JUP", positionSizeSol: 0.005 });
  base.envGates = () => ({ FOMO_ENABLE_LIVE_SUBMISSION: "YES", FOMO_ALLOW_LOOP_LIVE: "unset", SOLANA_SIGNER_SECRET: "present", EXPECTED_WALLET_PUBLIC_ADDRESS: "present" });
  base.computeLiveArmedStatus = () => ({ liveArmed: true, operationalPosture: "LIVE_ARMED", failures: [] });
  base.collectLiveSubmissionGateFailures = () => ({ failures: [], gates: {} });
  base.loadStubRecord = () => ({ sessionId, operatorSignaturePresent: true, approvalId: "ML" });
  base.listProcesses = () => [];
  base.readPositions = () => [];
  base.countPendingReconciliation = () => 0;
  base.recoveryState = () => ({ present: false, lineCount: 0 });
  base.resolveCapitalExposure = () => "none";
  base.walletMatch = () => ({ ok: true });
  base.rpcReadOnly = async () => ({ ok: true, provider: "helius" });
  base.assertMicroLiveApprovalRecord = () => ({ ok: true });
  base.probeBuyNoSubmit = async () => ({ ok: true, preSubmitGuardsSatisfied: true });
  base.readExecutorLock = () => ({ state: "none", lock: null });
  base.jupiterProbe = async () => ({ ok: true, v6Removed: true, usesAdapter: true });
  base.runN6ArmedProbe = async () => ({ ok: true, evidence: {} });
  base.runR16Evidence = async () => ({ ok: true });
  base.orStatus = "not_promoted";
  base.root = tmp;
  return base;
}

function normalizeReceipt(receipt) {
  const clone = JSON.parse(JSON.stringify(receipt));
  delete clone.startedAt;
  delete clone.completedAt;
  if (clone.checks) clone.checks = clone.checks.map(c => { const x = { ...c }; delete x.timestamp; return x; });
  if (clone.fingerprints?.codeFingerprint?.files) {
    clone.fingerprints.codeFingerprint = { aggregate: clone.fingerprints.codeFingerprint.aggregate };
  }
  return clone;
}

async function runCase(name, fn) {
  await fn();
  results.push({ id: name, pass: true });
  console.log(`${G} ${name}`);
}

async function main() {
  const files = [
    "armed_preflight_session.js",
    "armed_preflight_checks.js",
    "validate_armed_preflight.js",
    "run_armed_preflight_manifest.js",
    "test_armed_preflight_prerequisites.js",
    "test_fixtures/armed_preflight_proof_session_manifest.example.json"
  ];

  for (const file of files) {
    await runCase(`syntax ${file}`, async () => {
      if (file.endsWith(".json")) return;
      const check = spawnSync(process.execPath, ["--check", path.join(ROOT, file)], { encoding: "utf8" });
      assert.strictEqual(check.status, 0, check.stderr || file);
    });
  }

  for (const file of ["armed_preflight_session.js", "armed_preflight_checks.js", "validate_armed_preflight.js", "run_armed_preflight_manifest.js"]) {
    await runCase(`load ${file}`, async () => {
      delete require.cache[require.resolve(path.join(ROOT, file))];
      require(path.join(ROOT, file));
    });
  }

  await runCase("prerequisite suite subprocess 34/34", async () => {
    const proc = spawnSync(process.execPath, ["test_armed_preflight_prerequisites.js"], { cwd: ROOT, encoding: "utf8" });
    assert.strictEqual(proc.status, 0, proc.stdout + proc.stderr);
    assert.ok(/34\/34/.test(proc.stdout));
  });

  await runCase("empty session ID rejected", async () => {
    assert.strictEqual(session.validateSessionId("   ").ok, false);
    assert.strictEqual(session.parseArmedPreflightCli(["--session-id", "  ", "--arming-baseline-hash", VALID_HASH, "--auth-g1", "a", "--auth-g2", "b", "--auth-g3", "c", "--auth-g4", "d"]).ok, false);
  });

  await runCase("placeholder baseline hash rejected", async () => {
    assert.strictEqual(session.validateBaselineHash("deadbeef").ok, false);
    assert.strictEqual(session.parseArmedPreflightCli(["--session-id", VALID_SESSION, "--arming-baseline-hash", "deadbeef", "--auth-g1", "a", "--auth-g2", "b", "--auth-g3", "c", "--auth-g4", "d"]).ok, false);
  });

  await runCase("session manifest mode resolves G1-G4", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ap-manifest-"));
    const authDir = path.join(tmp, "auth");
    fs.mkdirSync(authDir);
    const docs = writeProofAuthSet(authDir, VALID_SESSION);
    const manifestPath = path.join(tmp, "session_manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify({
      sessionId: VALID_SESSION,
      proofContext: session.PROOF_CONTEXT,
      authorizations: { g1: docs.g1, g2: docs.g2, g3: docs.g3, g4: docs.g4 }
    }, null, 2));
    const parsed = session.parseArmedPreflightCli(["--session-id", VALID_SESSION, "--arming-baseline-hash", VALID_HASH, "--session-manifest", manifestPath]);
    assert.strictEqual(parsed.ok, true);
    const opts = buildOptionsFromCli(parsed, tmp);
    assert.strictEqual(opts.cliErrors, undefined);
    assert.strictEqual(opts.sessionLinkage.documents.g1, docs.g1);
  });

  await runCase("mixed manifest and explicit auth paths rejected", async () => {
    const parsed = session.parseArmedPreflightCli([
      "--session-id", VALID_SESSION,
      "--arming-baseline-hash", VALID_HASH,
      "--session-manifest", "manifest.json",
      "--auth-g1", "a.md"
    ]);
    assert.strictEqual(parsed.ok, false);
  });

  await runCase("unreadable authorization path fails AP-02", async () => {
    const adapters = proofAdapters();
    adapters.authorizationDocs = () => ({
      g1: path.join(adapters.root, "missing-g1.md"),
      g2: path.join(adapters.root, "auth/g2-arming.md"),
      g3: path.join(adapters.root, "auth/g3-stub-creation.md"),
      g4: path.join(adapters.root, "auth/g4-proof-auth.md")
    });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-02" && c.status === "FAIL"));
  });

  await runCase("G4 missing candidate-selection prohibition rejected", async () => {
    const adapters = proofAdapters({ auth: { g4Extra: "submit prohibited\nsign prohibited\nbroadcast prohibited\ncapital exposure prohibited" } });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-02" && c.status === "FAIL"));
  });

  await runCase("G4 missing capital-exposure prohibition rejected", async () => {
    const adapters = proofAdapters({ auth: { g4Extra: "submit prohibited\nsign prohibited\nbroadcast prohibited\ncandidate selection prohibited" } });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-02" && c.status === "FAIL"));
  });

  await runCase("CLI normalized inputs echoed in receipt", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ap-cli-echo-"));
    const authDir = path.join(tmp, "auth");
    fs.mkdirSync(authDir);
    const docs = writeProofAuthSet(authDir, VALID_SESSION);
    const adapters = proofAdapters();
    adapters.cliInputsEcho = { sessionId: VALID_SESSION, armingBaselineHash: VALID_HASH, proofContext: session.PROOF_CONTEXT };
    session.applySessionLinkage(adapters, {
      sessionId: VALID_SESSION,
      armingBaselineHash: VALID_HASH,
      proofContext: session.PROOF_CONTEXT,
      authorizationChainMode: "armed-no-submit-proof",
      documents: docs,
      authorizationMetadata: session.validateProofAuthorizationChain(docs, VALID_SESSION).metadata
    });
    const result = await runArmedPreflight({ adapters, forceChecks: true, cliInputsEcho: adapters.cliInputsEcho });
    assert.strictEqual(result.receipt.fingerprints.cliInputs.sessionId, VALID_SESSION);
    assert.strictEqual(result.receipt.fingerprints.armingBaselineHashSha256, VALID_HASH);
  });

  await runCase("AP-15 position-size cap mismatch fails", async () => {
    const adapters = proofAdapters({ config: { positionSizeSol: 0.02 } });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-15" && c.status === "FAIL"));
  });

  await runCase("AP-15 slippage cap mismatch fails", async () => {
    const adapters = proofAdapters({ config: { maxEntrySlippagePct: 2 } });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-15" && c.status === "FAIL"));
  });

  await runCase("AP-15 scaling enabled fails", async () => {
    const adapters = proofAdapters({ config: { compoundingEnabled: true } });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-15" && c.status === "FAIL"));
  });

  await runCase("AP-15 automation handoff enabled fails", async () => {
    const adapters = proofAdapters({
      patch: base => { base.automationCandidateHandoffDisabled = false; }
    });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-15" && c.status === "FAIL"));
  });

  await runCase("AP-15 runtime stub purpose mismatch fails", async () => {
    const adapters = proofAdapters({
      patch: base => { base.runtimeStubPurpose = "micro_live_execution"; }
    });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-15" && c.status === "FAIL"));
  });

  await runCase("micro-live AP-15 requires candidate evidence", async () => {
    const adapters = microLiveAdapters();
    adapters.candidatePacket = () => null;
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-15" && c.status === "FAIL"));
  });

  await runCase("micro-live AP-15 PASS preserved", async () => {
    const adapters = microLiveAdapters();
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.strictEqual(result.receipt.checks.find(c => c.checkId === "AP-15").status, "PASS");
  });

  await runCase("proof N/A cannot leak into micro-live context", async () => {
    const adapters = microLiveAdapters();
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    const ap15 = result.receipt.checks.find(c => c.checkId === "AP-15");
    assert.notStrictEqual(ap15.status, "NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE");
  });

  await runCase("deterministic normalized receipt", async () => {
    const adapters = proofAdapters();
    const a = await runArmedPreflight({ adapters, forceChecks: true });
    const b = await runArmedPreflight({ adapters, forceChecks: true });
    assert.deepStrictEqual(normalizeReceipt(a.receipt), normalizeReceipt(b.receipt));
  });

  await runCase("production wrong posture exit 2 preserved", async () => {
    const before = common.hashFile(PROD_CONFIG);
    const result = await runArmedPreflight();
    assert.strictEqual(result.exitCode, 2);
    assert.strictEqual(common.hashFile(PROD_CONFIG), before);
  });

  await runCase("manifest runner production exit 2 preserved", async () => {
    const result = await runArmedPreflightManifest();
    assert.strictEqual(result.exitCode, 2);
  });

  await runCase("secret sentinel not in receipts", async () => {
    process.env.SOLANA_SIGNER_SECRET = SENTINEL_SECRET;
    process.env.HELIUS_API_KEY = SENTINEL_API;
    process.env.SOLANA_RPC_URL = SENTINEL_RPC;
    const adapters = proofAdapters();
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    const blob = JSON.stringify(result.receipt);
    assert.ok(!blob.includes(SENTINEL_SECRET));
    assert.ok(!blob.includes(SENTINEL_API));
    assert.ok(!blob.includes("SENTINEL_RPC_SECRET"));
    delete process.env.SOLANA_SIGNER_SECRET;
    delete process.env.HELIUS_API_KEY;
    delete process.env.SOLANA_RPC_URL;
  });

  await runCase("no directory guessing in session module", async () => {
    const src = fs.readFileSync(path.join(ROOT, "armed_preflight_session.js"), "utf8");
    assert.ok(!/readdirSync|glob\(|latest authorization/i.test(src));
  });

  assert.strictEqual(common.hashFile(PROD_CONFIG), hashBefore);

  const receipt = {
    schemaVersion: "armed-preflight-prerequisite-regression/1.0.0",
    toolName: "armed_preflight_prerequisite_regression_gate",
    context: "prerequisite-regression-gate",
    startedAt: common.nowIso(),
    completedAt: common.nowIso(),
    overallStatus: "PASS",
    posture: { production: "PIPELINE_OBSERVING", liveArmed: false },
    fingerprints: {
      liveConfigHashSha256Before: hashBefore,
      liveConfigHashSha256After: common.hashFile(PROD_CONFIG),
      prerequisiteSuitePassed: 34,
      extensionCasesPassed: results.length - 6
    },
    checks: results,
    evidence: { total: results.length, passed: results.length, failed: 0, prerequisiteSubprocess: "34/34 PASS" },
    failures: []
  };
  common.assertNoSecretInReceipt(receipt);

  const outPath = path.join(ROOT, "analysis", "armed_preflight_prerequisite_regression_receipt.json");
  fs.writeFileSync(outPath, common.serializeReceipt(receipt));

  console.log(`\nARMED PREFLIGHT PREREQUISITE REGRESSION GATE PASSED (${results.length}/${results.length})\n`);
  console.log(`Receipt: ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
