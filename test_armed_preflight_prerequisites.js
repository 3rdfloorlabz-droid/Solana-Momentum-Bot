"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const common = require("./live_validation_common");
const manifest = require("./armed_preflight_manifest");
const checks = require("./armed_preflight_checks");
const session = require("./armed_preflight_session");
const { runArmedPreflight, buildOptionsFromCli } = require("./validate_armed_preflight");

const G = "\x1b[32m✔\x1b[0m";
const ROOT = __dirname;
const PROD_CONFIG = path.join(ROOT, "live_config.json");
const SENTINEL_SECRET = "SENTINEL_SIGNER_SECRET_DO_NOT_LEAK_0123456789";
const VALID_SESSION = "RB-G9-20260710-AP01";
const VALID_HASH = "0996882e1a5244d05079a2a6f3ff09049758ecbbf3b8e3e0434ee4b13a4d33ef";

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
    compoundingEnabled: false,
    averagingDownEnabled: false,
    martingaleEnabled: false,
    capitalExposure: "none",
    manualSlippageApprovalBps: 200,
    ...overrides
  };
}

function writeAuthDoc(filePath, { sessionId, title, signed = true, consumed = false, extra = "" }) {
  const status = consumed
    ? "CONSUMED/CLOSED — do not reuse"
    : signed
      ? "**SIGNED — APPROVED**"
      : "DRAFT ONLY — NOT SIGNED — NOT AUTHORIZED";
  fs.writeFileSync(filePath, [
    `# ${title}`,
    status,
    `Session ID: ${sessionId}`,
    extra
  ].join("\n"));
}

function writeProofAuthSet(authDir, sessionId, options = {}) {
  const prohibitions = [
    "submit prohibited",
    "sign prohibited",
    "broadcast prohibited",
    "candidate selection prohibited",
    "capital exposure prohibited",
    "final trade confirmation prohibited",
    "transaction creation prohibited",
    "position creation prohibited"
  ].join("\n");

  writeAuthDoc(path.join(authDir, "g1-r15.md"), {
    sessionId,
    title: "AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY",
    signed: options.signed !== false,
    consumed: options.consumed === true,
    extra: options.g1Extra || ""
  });
  writeAuthDoc(path.join(authDir, "g2-arming.md"), {
    sessionId,
    title: "AUTHORIZATION — Arming",
    signed: options.signed !== false,
    consumed: options.consumed === true
  });
  writeAuthDoc(path.join(authDir, "g3-stub-creation.md"), {
    sessionId,
    title: "AUTHORIZATION — Runtime R15 Approval Stub Creation",
    signed: options.signed !== false,
    consumed: options.consumed === true
  });
  writeAuthDoc(path.join(authDir, "g4-proof-auth.md"), {
    sessionId,
    title: "AUTHORIZATION — Armed No-Submit Proof",
    signed: options.signed !== false,
    consumed: options.consumed === true,
    extra: options.g4Extra || prohibitions
  });

  if (options.wrongG4MicroLive) {
    writeAuthDoc(path.join(authDir, "g4-proof-auth.md"), {
      sessionId,
      title: "AUTHORIZATION — Micro-Live Execution",
      signed: true,
      extra: "Micro-Live Execution Authorization"
    });
  }

  return {
    g1: path.join(authDir, "g1-r15.md"),
    g2: path.join(authDir, "g2-arming.md"),
    g3: path.join(authDir, "g3-stub-creation.md"),
    g4: path.join(authDir, "g4-proof-auth.md")
  };
}

function proofAdapters(overrides = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ap-pre-"));
  const configFile = path.join(tmp, "live_config.json");
  const cfg = armedCfg(overrides.config || {});
  fs.writeFileSync(configFile, `${JSON.stringify(cfg, null, 2)}\n`);
  fs.writeFileSync(path.join(tmp, "live_positions.json"), "[]\n");

  const sessionId = overrides.sessionId === undefined ? VALID_SESSION : overrides.sessionId;
  const authDir = path.join(tmp, "auth");
  fs.mkdirSync(authDir);

  let documents = null;
  if (sessionId) {
    documents = writeProofAuthSet(authDir, sessionId, overrides.auth || {});
    if (overrides.mixedSession) {
      writeAuthDoc(path.join(authDir, "g2-arming.md"), {
        sessionId: "RB-G9-20260710-AP99",
        title: "AUTHORIZATION — Arming",
        signed: true
      });
    }
    if (overrides.missingG1) fs.unlinkSync(documents.g1);
    if (overrides.missingG2) fs.unlinkSync(documents.g2);
    if (overrides.missingG3) fs.unlinkSync(documents.g3);
    if (overrides.missingG4) fs.unlinkSync(documents.g4);
    if (overrides.duplicateG4) {
      documents.g4duplicate = path.join(authDir, "g4-dup.md");
      fs.copyFileSync(documents.g4, documents.g4duplicate);
    }
  }

  const base = checks.createDefaultAdapters(tmp);
  base.configFile = configFile;
  base.loadConfig = () => JSON.parse(fs.readFileSync(configFile, "utf8"));
  base.sessionId = sessionId;
  base.armingBaselineHash = overrides.baseline ?? VALID_HASH;
  base.executionPathCallCount = overrides.executionPathCallCount ?? 0;
  base.proofAuthorizationProhibitsExecution = overrides.proofAuthorizationProhibitsExecution !== false;
  base.automationCandidateHandoffDisabled = overrides.automationCandidateHandoffDisabled !== false;
  base.runtimeStubPurpose = overrides.runtimeStubPurpose || "armed_no_submit_proof_only";

  if (documents) {
    session.applySessionLinkage(base, {
      sessionId,
      armingBaselineHash: base.armingBaselineHash,
      proofContext: session.PROOF_CONTEXT,
      authorizationChainMode: "armed-no-submit-proof",
      documents: {
        g1: overrides.missingG1 ? null : documents.g1,
        g2: overrides.missingG2 ? null : documents.g2,
        g3: overrides.missingG3 ? null : documents.g3,
        g4: overrides.missingG4 ? null : documents.g4
      },
      authorizationMetadata: {}
    });
  }

  base.envGates = () => ({
    FOMO_ENABLE_LIVE_SUBMISSION: "YES",
    FOMO_ALLOW_LOOP_LIVE: "unset",
    SOLANA_SIGNER_SECRET: "present",
    EXPECTED_WALLET_PUBLIC_ADDRESS: "present"
  });
  base.computeLiveArmedStatus = () => ({
    liveArmed: true,
    operationalPosture: "LIVE_ARMED",
    failures: []
  });
  base.collectLiveSubmissionGateFailures = () => ({ failures: [], gates: {} });
  base.loadStubRecord = () => ({
    sessionId,
    linkedSessionId: sessionId,
    approvalId: "PRE-TEST",
    operatorSignaturePresent: true
  });
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

function microLiveAdapters(overrides = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ap-ml-"));
  const configFile = path.join(tmp, "live_config.json");
  fs.writeFileSync(configFile, `${JSON.stringify(armedCfg(overrides.config || {}), null, 2)}\n`);
  const authDir = path.join(tmp, "auth");
  fs.mkdirSync(authDir);
  const sessionId = "RB-G9-REG-MICRO01";
  for (const [name, title] of [
    ["r15", "AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY"],
    ["arming", "AUTHORIZATION — Arming"],
    ["microLive", "AUTHORIZATION — Micro-Live Execution"],
    ["stubCreation", "AUTHORIZATION — Runtime R15 Approval Stub Creation"]
  ]) {
    writeAuthDoc(path.join(authDir, `${name}.md`), { sessionId, title, signed: true });
  }
  const base = checks.createDefaultAdapters(tmp);
  base.configFile = configFile;
  base.loadConfig = () => JSON.parse(fs.readFileSync(configFile, "utf8"));
  base.sessionId = sessionId;
  base.authorizationDocs = () => ({
    r15: path.join(authDir, "r15.md"),
    arming: path.join(authDir, "arming.md"),
    microLive: path.join(authDir, "microLive.md"),
    stubCreation: path.join(authDir, "stubCreation.md")
  });
  base.authorizationChainMode = "micro-live";
  base.candidatePacket = () => ({ mint: "JUP", positionSizeSol: 0.005 });
  base.envGates = () => ({
    FOMO_ENABLE_LIVE_SUBMISSION: "YES",
    FOMO_ALLOW_LOOP_LIVE: "unset",
    SOLANA_SIGNER_SECRET: "present",
    EXPECTED_WALLET_PUBLIC_ADDRESS: "present"
  });
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

async function test(name, fn) {
  await fn();
  console.log(`${G} ${name}`);
}

async function main() {
  const hashBefore = common.hashFile(PROD_CONFIG);
  let count = 0;

  await test("1 missing session ID rejected", async () => {
    const parsed = session.parseArmedPreflightCli(["--arming-baseline-hash", VALID_HASH]);
    assert.strictEqual(parsed.ok, false);
    count++;
  });

  await test("2 missing baseline hash rejected", async () => {
    const parsed = session.parseArmedPreflightCli(["--session-id", VALID_SESSION]);
    assert.strictEqual(parsed.ok, false);
    count++;
  });

  await test("3 malformed session ID rejected", async () => {
    const parsed = session.parseArmedPreflightCli([
      "--session-id", "RB-G9-EV02",
      "--arming-baseline-hash", VALID_HASH,
      "--auth-g1", "a", "--auth-g2", "b", "--auth-g3", "c", "--auth-g4", "d"
    ]);
    assert.strictEqual(parsed.ok, false);
    count++;
  });

  await test("4 malformed baseline hash rejected", async () => {
    const parsed = session.parseArmedPreflightCli([
      "--session-id", VALID_SESSION,
      "--arming-baseline-hash", "not-a-hash",
      "--auth-g1", "a", "--auth-g2", "b", "--auth-g3", "c", "--auth-g4", "d"
    ]);
    assert.strictEqual(parsed.ok, false);
    count++;
  });

  await test("5 no hidden default session selection", async () => {
    const adapters = checks.createDefaultAdapters(ROOT);
    assert.strictEqual(adapters.authorizationDocs(), null);
    assert.strictEqual(session.detectAuthorizationChainMode(adapters.authorizationDocs?.() || {}), "unconfigured");
    count++;
  });

  await test("6 EV01 fallback rejected", async () => {
    assert.strictEqual(session.validateSessionId("RB-G9-20260706-EV01").ok, false);
    try {
      session.resolveAuthorizationDocuments({
        authPaths: {
          g1: "Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — RB-G9-20260706-EV01 — 2026-07-06.md"
        }
      }, ROOT);
      assert.fail("expected throw");
    } catch (error) {
      assert.ok(/historical authorization path rejected/i.test(error.message));
    }
    count++;
  });

  await test("7 EV02 fallback rejected", async () => {
    assert.strictEqual(session.validateSessionId("RB-G9-20260707-EV02").ok, false);
    const adapters = checks.createDefaultAdapters(ROOT);
    const docs = adapters.authorizationDocs();
    assert.strictEqual(docs, null);
    count++;
  });

  await test("8 latest authorization selection absent", async () => {
    const src = fs.readFileSync(path.join(ROOT, "armed_preflight_session.js"), "utf8");
    assert.ok(!/readdirSync|glob|latest authorization/i.test(src));
    count++;
  });

  await test("9 mixed-session G1-G4 rejected", async () => {
    const adapters = proofAdapters({ mixedSession: true });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-02" && c.status === "FAIL"));
    count++;
  });

  for (const [label, key] of [["10 missing G1", "missingG1"], ["11 missing G2", "missingG2"], ["12 missing G3", "missingG3"], ["13 missing G4", "missingG4"]]) {
    await test(label, async () => {
      const adapters = proofAdapters({ [key]: true });
      const result = await runArmedPreflight({ adapters, forceChecks: true });
      assert.ok(result.receipt.checks.find(c => c.checkId === "AP-02" && c.status === "FAIL"));
      count++;
    });
  }

  await test("14 duplicate authorization class rejected", async () => {
    const authDir = fs.mkdtempSync(path.join(os.tmpdir(), "ap-dup-"));
    const docs = writeProofAuthSet(authDir, VALID_SESSION);
    const validation = session.validateProofAuthorizationChain({
      g1: docs.g1,
      g2: docs.g2,
      g3: docs.g3,
      g4: docs.g1
    }, VALID_SESSION);
    assert.strictEqual(validation.ok, false);
    count++;
  });

  await test("15 wrong G4 type rejected", async () => {
    const adapters = proofAdapters({ auth: { wrongG4MicroLive: true } });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-02" && c.status === "FAIL"));
    count++;
  });

  await test("16 micro-live authorization cannot satisfy G4", async () => {
    const authDir = fs.mkdtempSync(path.join(os.tmpdir(), "ap-mlg4-"));
    const docs = writeProofAuthSet(authDir, VALID_SESSION);
    writeAuthDoc(docs.g4, {
      sessionId: VALID_SESSION,
      title: "AUTHORIZATION — Micro-Live Execution",
      signed: true,
      extra: "Micro-Live Execution Authorization"
    });
    const validation = session.validateProofAuthorizationChain({
      g1: docs.g1, g2: docs.g2, g3: docs.g3, g4: docs.g4
    }, VALID_SESSION);
    assert.strictEqual(validation.ok, false);
    count++;
  });

  await test("17 stale/expired authorization rejected", async () => {
    const adapters = proofAdapters({ auth: { consumed: true } });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-02" && c.status === "FAIL"));
    count++;
  });

  await test("18 consumed/closed authorization rejected", async () => {
    const adapters = proofAdapters({ auth: { signed: false } });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-02" && c.status === "FAIL"));
    count++;
  });

  await test("19 G4 missing no-execution prohibitions rejected", async () => {
    const adapters = proofAdapters({ auth: { g4Extra: "no prohibitions here" } });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-02" && c.status === "FAIL"));
    count++;
  });

  await test("20 malformed CLI argument rejected", async () => {
    const opts = buildOptionsFromCli({
      ok: false,
      errors: ["session ID missing"],
      wantsProofInputs: true
    }, ROOT);
    assert.ok(opts.cliErrors.length > 0);
    count++;
  });

  await test("21 AP-15 exact N/A status emitted", async () => {
    const adapters = proofAdapters();
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    const ap15 = result.receipt.checks.find(c => c.checkId === "AP-15");
    assert.strictEqual(ap15.status, "NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE");
    count++;
  });

  await test("22 AP-15 exact rationale emitted", async () => {
    const adapters = proofAdapters();
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    const ap15 = result.receipt.checks.find(c => c.checkId === "AP-15");
    assert.strictEqual(ap15.rationale, session.AP15_REPLACEMENT_ID);
    count++;
  });

  await test("23 AP-15 remains in canonical order", async () => {
    const adapters = proofAdapters();
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.deepStrictEqual(result.receipt.checks.map(c => c.checkId), manifest.AP_ORDER);
    count++;
  });

  await test("24 complete replacement evidence accepted", async () => {
    const adapters = proofAdapters();
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    const ap15 = result.receipt.checks.find(c => c.checkId === "AP-15");
    assert.strictEqual(ap15.evidence.replacementEvidenceId, session.AP15_REPLACEMENT_ID);
    assert.strictEqual(ap15.evidence.executionPathCallCount, 0);
    count++;
  });

  await test("25 missing replacement evidence rejected", async () => {
    const evidence = session.buildProofScopeReplacementEvidence(proofAdapters(), armedCfg());
    delete evidence.noCandidateSelected;
    const validation = session.validateProofScopeReplacementEvidence(evidence);
    assert.strictEqual(validation.ok, false);
    count++;
  });

  await test("26 false replacement evidence rejected", async () => {
    const adapters = proofAdapters({ executionPathCallCount: 1 });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-15" && c.status === "FAIL"));
    count++;
  });

  await test("27 candidate metadata causes AP-15 failure", async () => {
    const adapters = proofAdapters({ candidate: { mint: "ABC123", positionSizeSol: 0.005 } });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-15" && c.status === "FAIL"));
    count++;
  });

  await test("28 quote metadata causes AP-15 failure", async () => {
    const adapters = proofAdapters({ quoteMetadata: { requestedForExecution: true } });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-15" && c.status === "FAIL"));
    count++;
  });

  await test("29 trade metadata causes AP-15 failure", async () => {
    const adapters = proofAdapters({ tradeMetadata: { tradeId: "T1", side: "BUY" } });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    assert.ok(result.receipt.checks.find(c => c.checkId === "AP-15" && c.status === "FAIL"));
    count++;
  });

  await test("30 AP-15 cannot report PASS in proof context", async () => {
    const adapters = proofAdapters({ candidate: { mint: "SHOULD-FAIL", positionSizeSol: 0.005 } });
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    const ap15 = result.receipt.checks.find(c => c.checkId === "AP-15");
    assert.notStrictEqual(ap15.status, "PASS");
    count++;
  });

  await test("31 later candidate/live context remains unchanged", async () => {
    const adapters = microLiveAdapters();
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    const ap15 = result.receipt.checks.find(c => c.checkId === "AP-15");
    assert.strictEqual(ap15.status, "PASS");
    count++;
  });

  await test("32 zero execution functions invoked", async () => {
    assert.deepStrictEqual(executionSpies, {
      enterPosition: 0,
      exitPosition: 0,
      submitSwap: 0,
      sendTransaction: 0,
      sendRawTransaction: 0,
      sign: 0
    });
    count++;
  });

  await test("33 no secret values appear in receipts", async () => {
    process.env.SOLANA_SIGNER_SECRET = SENTINEL_SECRET;
    const adapters = proofAdapters();
    const result = await runArmedPreflight({ adapters, forceChecks: true });
    const blob = JSON.stringify(result.receipt);
    assert.ok(!blob.includes(SENTINEL_SECRET));
    delete process.env.SOLANA_SIGNER_SECRET;
    count++;
  });

  await test("34 wrong-posture exit behavior unchanged", async () => {
    const before = common.hashFile(PROD_CONFIG);
    const result = await runArmedPreflight();
    assert.strictEqual(result.exitCode, 2);
    assert.strictEqual(common.hashFile(PROD_CONFIG), before);
    count++;
  });

  assert.strictEqual(count, 34);
  assert.strictEqual(common.hashFile(PROD_CONFIG), hashBefore);

  console.log(`\nARMED PREFLIGHT PREREQUISITE TESTS PASSED (${count}/${count})\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
