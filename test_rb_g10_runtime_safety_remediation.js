"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const originalEnv = {
  runtimeRoot: process.env.TRACKTA_RUNTIME_ROOT,
  signer: process.env.SOLANA_SIGNER_SECRET,
  rpc: process.env.SOLANA_RPC_URL,
  heliusRpc: process.env.HELIUS_RPC_URL,
  heliusApiKey: process.env.HELIUS_API_KEY,
  liveSubmission: process.env.FOMO_ENABLE_LIVE_SUBMISSION
};

const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "rb-g10-runtime-safety-"));
process.env.TRACKTA_RUNTIME_ROOT = TEMP_ROOT;

process.env.SOLANA_SIGNER_SECRET = "RB_G10_SYNTHETIC_SIGNER_PRESENT_ONLY";
process.env.SOLANA_RPC_URL = "https://dedicated-rpc.invalid/?api-key=rb-g10-synthetic";
delete process.env.HELIUS_RPC_URL;
delete process.env.HELIUS_API_KEY;
process.env.FOMO_ENABLE_LIVE_SUBMISSION = "YES";

fs.mkdirSync(path.join(TEMP_ROOT, "analysis"), { recursive: true });

const executor = require("./live_executor");
const quoteTest = executor.__jupiterQuoteTest;
const feeTest = executor.__priorityFeeTest;
const buildTest = executor.__txBuildTest;
const simulationTest = executor.__simulationTest;
const submissionTest = executor.__submissionTest;
const pipelineTest = executor.__pipelineDryRunTest;
const r16Test = executor.__r16LivePathTest;
const codes = executor.__executionLoggingTest.EXECUTION_ABORT_CODES;
const stages = executor.__executionLoggingTest.EXECUTION_STAGES;

const TEST_WALLET = "FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6";
const TEST_TOKEN = "FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6";
const TEST_PAIR = "Fh2JdK8Lm9NpQr3StUvWxYzAbCdEfGhIjKlMnPqRsTuV";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function baseConfig(overrides = {}) {
  return {
    phase: "PHASE_1_AUTONOMOUS_DRY_RUN",
    executionMode: "PIPELINE_DRY_RUN",
    dryRunMode: true,
    automationEnabled: true,
    emergencyStop: false,
    walletPublicAddress: TEST_WALLET,
    positionSizeSol: 0.005,
    maxOpenTrades: 1,
    maxEntrySlippagePct: 3,
    maxExitSlippagePct: 5,
    maxRoutePriceImpactPct: 10,
    maxQuoteAgeMs: 10000,
    priorityFeeMode: "dynamic_helius",
    maxPriorityFeeLamports: 1000000,
    fallbackPriorityFeeLamports: 200000,
    assumedComputeUnitLimit: 300000,
    confirmationCommitment: "confirmed",
    confirmationTimeoutMs: 30000,
    maxSubmitRetries: 0,
    minWalletBalanceSol: 0,
    compoundingEnabled: false,
    averagingDownEnabled: false,
    martingaleEnabled: false,
    ...overrides
  };
}

function writeDiskConfig(cfg) {
  fs.writeFileSync(configPath(), `${JSON.stringify(cfg, null, 2)}\n`);
}

function configPath() {
  return path.join(TEMP_ROOT, "live_config.json");
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function v0TransactionBase64() {
  return Buffer.from(Uint8Array.from([
    1,
    ...new Array(64).fill(0),
    0x80,
    1, 0, 0,
    1,
    ...new Array(32).fill(0),
    ...new Array(32).fill(0),
    1,
    0, 0, 0
  ])).toString("base64");
}

function installHappyPipelineMocks({ onSecondQuote } = {}) {
  let quoteCalls = 0;
  quoteTest.setQuoteFetchForTest(async () => {
    quoteCalls += 1;
    if (quoteCalls === 2 && onSecondQuote) onSecondQuote();
    return {
      ok: true,
      json: async () => ({
        inputMint: quoteTest.SOL_MINT,
        outputMint: TEST_TOKEN,
        inAmount: "5000000",
        outAmount: "100",
        otherAmountThreshold: "97",
        priceImpactPct: "0",
        slippageBps: 100,
        routePlan: [{ swapInfo: { label: "MOCK", ammKey: TEST_PAIR }, percent: 100 }]
      })
    };
  });
  feeTest.setPriorityFeeFetchForTest(async () => ({
    ok: true,
    json: async () => ({ result: { totalPriorityFeeLamports: 200000 } })
  }));
  buildTest.setSwapBuildFetchForTest(async () => ({
    ok: true,
    json: async () => ({
      swapTransaction: v0TransactionBase64(),
      lastValidBlockHeight: 321,
      prioritizationFeeLamports: 200000
    })
  }));
  simulationTest.setSimulationFetchForTest(async () => ({
    ok: true,
    json: async () => ({
      result: {
        context: { slot: 99 },
        value: { err: null, logs: ["Program success"], unitsConsumed: 100000 }
      }
    })
  }));
  submissionTest.setSubmissionFetchForTest(async () => {
    throw new Error("submission must not be reached");
  });
}

async function expectExecutionError(expectedCode, expectedStage, fn) {
  try {
    await fn();
  } catch (error) {
    assert(error.code === expectedCode, `expected ${expectedCode}, got ${error.code || error.name}`);
    assert(error.stage === expectedStage, `expected ${expectedStage}, got ${error.stage}`);
    return error;
  }
  throw new Error(`expected ${expectedCode}, but call succeeded`);
}

(async () => {
  try {
    writeDiskConfig(baseConfig());
    fs.writeFileSync(executor.FILES.PENDING_RECONCILIATION_FILE, "");
    fs.writeFileSync(executor.FILES.LIVE_POSITIONS_FILE, "[]\n");

    const liveConfig = baseConfig({ executionMode: "LIVE", dryRunMode: false });
    let unauditedError = null;
    try {
      executor.saveConfig(liveConfig);
    } catch (error) {
      unauditedError = error;
    }
    assert(unauditedError && unauditedError.code === "CONFIG_AUDIT_REQUIRED", "unaudited critical config write must fail");
    assert(executor.loadConfig().executionMode === "PIPELINE_DRY_RUN", "failed unaudited write must leave disk config dry");
    assert(readJsonl(executor.FILES.CONFIG_AUDIT_FILE).length === 0, "failed unaudited write must not write audit rows");

    executor.saveConfig(liveConfig, {
      audit: {
        actor: "operator",
        source: "test_rb_g10_runtime_safety_remediation",
        reason: "synthetic audited live transition in temp root"
      }
    });
    const auditRows = readJsonl(executor.FILES.CONFIG_AUDIT_FILE);
    assert(auditRows.some(row => row.field === "executionMode" && row.newValue === "LIVE"), "audited executionMode row missing");
    assert(auditRows.some(row => row.field === "dryRunMode" && row.newValue === false), "audited dryRunMode row missing");

    writeDiskConfig(baseConfig());
    let quoteCalled = false;
    let signerLoaded = false;
    quoteTest.setQuoteFetchForTest(async () => {
      quoteCalled = true;
      throw new Error("quote must not be reached");
    });
    pipelineTest.setSignerLoaderForTest(() => {
      signerLoaded = true;
      throw new Error("signer must not be loaded");
    });
    r16Test.setMicroLiveApprovalGateForTest(() => ({ ok: true }));
    const staleCfgError = await expectExecutionError(codes.REAL_PATH_DISABLED, stages.GUARD, () =>
      pipelineTest.submitSwapForTest("BUY", {
        cfg: liveConfig,
        tokenAddress: TEST_TOKEN,
        pairAddress: TEST_PAIR,
        expectedPrice: 1,
        positionSizeSol: 0.005
      })
    );
    assert(staleCfgError.extra.failures.some(item => item.includes("executionMode must be LIVE")), "disk dry executionMode failure missing");
    assert(quoteCalled === false, "stale in-memory LIVE cfg must fail before quote");
    assert(signerLoaded === false, "stale in-memory LIVE cfg must fail before signer load");

    executor.saveConfig(liveConfig, {
      audit: {
        actor: "operator",
        source: "test_rb_g10_runtime_safety_remediation",
        reason: "synthetic audited live transition for pre-sign regression"
      }
    });
    let signCalled = false;
    let submissionCalled = false;
    pipelineTest.setSignerLoaderForTest(() => ({
      publicKey: { toBase58: () => TEST_WALLET },
      sign: () => {
        signCalled = true;
        return Uint8Array.from(new Array(64).fill(1));
      }
    }));
    submissionTest.setSubmissionFetchForTest(async () => {
      submissionCalled = true;
      throw new Error("submission must not be reached");
    });
    installHappyPipelineMocks({
      onSecondQuote: () => writeDiskConfig(baseConfig())
    });
    const preSignError = await expectExecutionError(codes.REAL_PATH_DISABLED, stages.GUARD, () =>
      pipelineTest.submitSwapForTest("BUY", {
        cfg: liveConfig,
        tokenAddress: TEST_TOKEN,
        pairAddress: TEST_PAIR,
        expectedPrice: 1,
        positionSizeSol: 0.005,
        poolLiquidityUsd: 50000
      })
    );
    assert(preSignError.extra.phase === "pre-sign", "pre-sign disk posture phase missing");
    assert(signCalled === false, "disk dry flip before sign must block signing");
    assert(submissionCalled === false, "disk dry flip before sign must block submission");

    console.log("RB-G10 RUNTIME SAFETY REMEDIATION TEST PASSED");
  } finally {
    quoteTest.resetQuoteFetchForTest();
    feeTest.resetPriorityFeeFetchForTest();
    buildTest.resetSwapBuildFetchForTest();
    simulationTest.resetSimulationFetchForTest();
    submissionTest.resetSubmissionFetchForTest();
    submissionTest.resetConfirmationFetchForTest();
    submissionTest.resetFillFetchForTest();
    pipelineTest.resetSignerLoaderForTest();
    r16Test.resetMicroLiveApprovalGateForTest();
    try { fs.rmSync(TEMP_ROOT, { recursive: true, force: true }); } catch { /* best effort */ }
    if (originalEnv.signer === undefined) delete process.env.SOLANA_SIGNER_SECRET; else process.env.SOLANA_SIGNER_SECRET = originalEnv.signer;
    if (originalEnv.rpc === undefined) delete process.env.SOLANA_RPC_URL; else process.env.SOLANA_RPC_URL = originalEnv.rpc;
    if (originalEnv.heliusRpc === undefined) delete process.env.HELIUS_RPC_URL; else process.env.HELIUS_RPC_URL = originalEnv.heliusRpc;
    if (originalEnv.heliusApiKey === undefined) delete process.env.HELIUS_API_KEY; else process.env.HELIUS_API_KEY = originalEnv.heliusApiKey;
    if (originalEnv.liveSubmission === undefined) delete process.env.FOMO_ENABLE_LIVE_SUBMISSION; else process.env.FOMO_ENABLE_LIVE_SUBMISSION = originalEnv.liveSubmission;
    if (originalEnv.runtimeRoot === undefined) delete process.env.TRACKTA_RUNTIME_ROOT; else process.env.TRACKTA_RUNTIME_ROOT = originalEnv.runtimeRoot;
  }
})().catch(error => {
  console.error("RB-G10 RUNTIME SAFETY REMEDIATION TEST FAILED");
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
