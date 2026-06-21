"use strict";

const fs = require("fs");
const executor = require("./live_executor");

const pipeline = executor.__pipelineDryRunTest;
const quoteTest = executor.__jupiterQuoteTest;
const feeTest = executor.__priorityFeeTest;
const buildTest = executor.__txBuildTest;
const simulationTest = executor.__simulationTest;
const signerGuardTest = executor.__signerGuardTest;
const codes = executor.__executionLoggingTest.EXECUTION_ABORT_CODES;
const auditFile = executor.FILES.EXECUTION_AUDIT_FILE;

const originals = {
  signer: process.env.SOLANA_SIGNER_SECRET,
  rpc: process.env.SOLANA_RPC_URL,
  heliusRpc: process.env.HELIUS_RPC_URL,
  heliusApiKey: process.env.HELIUS_API_KEY,
  expected: process.env.EXPECTED_WALLET_PUBLIC_ADDRESS
};

const WALLET = "11111111111111111111111111111111";
const TOKEN = "11111111111111111111111111111111";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readAuditRows() {
  if (!fs.existsSync(auditFile)) return [];
  return fs.readFileSync(auditFile, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function auditLineCount() {
  if (!fs.existsSync(auditFile)) return 0;
  return fs.readFileSync(auditFile, "utf8").split(/\r?\n/).filter(Boolean).length;
}

function v0Transaction() {
  return Buffer.from([1, ...new Array(64).fill(0), 0x80, 1, 0, 0, 1,
    ...new Array(32).fill(0), ...new Array(32).fill(0), 1, 0, 0, 0]).toString("base64");
}

function baseCfg(overrides = {}) {
  return {
    executionMode: "PIPELINE_DRY_RUN",
    dryRunMode: true,
    walletPublicAddress: WALLET,
    maxEntrySlippagePct: 3,
    maxExitSlippagePct: 5,
    maxRoutePriceImpactPct: 10,
    priorityFeeMode: "dynamic_helius",
    maxPriorityFeeLamports: 1000000,
    fallbackPriorityFeeLamports: 200000,
    assumedComputeUnitLimit: 300000,
    ...overrides
  };
}

function swapArgs(cfgOverrides = {}) {
  return {
    cfg: baseCfg(cfgOverrides),
    tokenAddress: TOKEN,
    pairAddress: "pipeline-signer-test-pair",
    expectedPrice: 2,
    positionSizeSol: 0.1
  };
}

function makeIdentityOnlySigner(walletPublicAddress) {
  if (!walletPublicAddress) {
    throw new Error("walletPublicAddress missing from config for PIPELINE_DRY_RUN.");
  }
  return Object.defineProperties(
    { publicKey: Object.freeze({ toBase58: () => walletPublicAddress }) },
    {
      sign: { get() { throw new Error("PIPELINE_DRY_RUN signer is identity-only and cannot sign."); } },
      secretKey: { get() { throw new Error("PIPELINE_DRY_RUN signer has no secret material."); } },
      privateKey: { get() { throw new Error("PIPELINE_DRY_RUN signer has no secret material."); } }
    }
  );
}

function installHappyPathMocks() {
  quoteTest.setQuoteFetchForTest(async () => ({ ok: true, json: async () => ({
    inputMint: quoteTest.SOL_MINT,
    outputMint: TOKEN,
    inAmount: "100000000",
    outAmount: "50000000",
    otherAmountThreshold: "48500000",
    priceImpactPct: "1",
    slippageBps: 300,
    routePlan: [{ swapInfo: { label: "MOCK" }, percent: 100 }]
  }) }));
  feeTest.setPriorityFeeFetchForTest(async () => ({ ok: true, json: async () => ({
    result: { totalPriorityFeeLamports: 250000 }
  }) }));
  buildTest.setSwapBuildFetchForTest(async () => ({ ok: true, json: async () => ({
    swapTransaction: v0Transaction(),
    lastValidBlockHeight: 321,
    prioritizationFeeLamports: 250000
  }) }));
  simulationTest.setSimulationFetchForTest(async () => ({ ok: true, json: async () => ({
    result: {
      context: { slot: 99 },
      value: { err: null, logs: ["Program success"], unitsConsumed: 180000 }
    }
  }) }));
}

async function expectExecutionError(expectedCode, expectedStage, fn) {
  try {
    await fn();
  } catch (error) {
    assert(error.code === expectedCode, `expected ${expectedCode}, received ${error.code || error.name}`);
    assert(error.stage === expectedStage, `expected stage ${expectedStage}, received ${error.stage}`);
    return error;
  }
  throw new Error(`expected ${expectedCode}, but call succeeded`);
}

(async () => {
  try {
    delete process.env.SOLANA_SIGNER_SECRET;
    delete process.env.HELIUS_RPC_URL;
    delete process.env.HELIUS_API_KEY;
    delete process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
    process.env.SOLANA_RPC_URL = "https://dedicated-rpc.invalid/?api-key=fake-pipeline-signer-test";

    const identity = makeIdentityOnlySigner(WALLET);
    assert(identity.publicKey.toBase58() === WALLET, "identity-only signer public key mismatch");
    assert.throws = (fn, expected) => {
      try { fn(); } catch (error) {
        assert(error.message.includes(expected), `expected throw containing ${expected}, received ${error.message}`);
        return;
      }
      throw new Error(`expected throw containing ${expected}`);
    };
    assert.throws(() => identity.sign, "cannot sign");
    assert.throws(() => identity.secretKey, "no secret material");
    assert.throws(() => identity.privateKey, "no secret material");

    signerGuardTest.resetSignerLoadCount();
    installHappyPathMocks();
    const startCount = readAuditRows().length;
    const result = await pipeline.submitSwapForTest("BUY", swapArgs());
    const endRows = readAuditRows().slice(startCount);

    assert(result.isPipelineDryRun === true, "PIPELINE_DRY_RUN result marker missing");
    assert(result.isDryRun === true, "PIPELINE_DRY_RUN must remain dry");
    assert(result.txSig === null, "PIPELINE_DRY_RUN must not produce a transaction signature");
    assert(result.pipelineMetadata.simulationSuccess === true, "mocked unsigned simulation did not complete");
    assert(signerGuardTest.getSignerLoadCount() === 0, "PIPELINE_DRY_RUN loaded the real signer guard");

    const stages = endRows.filter(row => row.eventType === "EXECUTION_STAGE").map(row => row.stage);
    const expectedStages = ["QUOTE", "ROUTE_VALIDATION", "PRIORITY_FEE", "TX_BUILD", "SIMULATION", "PIPELINE_DRY_RUN"];
    let cursor = -1;
    for (const stage of expectedStages) {
      const next = stages.indexOf(stage, cursor + 1);
      assert(next !== -1, `missing pipeline stage: ${stage}`);
      cursor = next;
    }
    assert(!stages.includes("GUARD"), "PIPELINE_DRY_RUN short-circuited at signer guard");
    assert(!JSON.stringify(endRows).includes("fake-pipeline-signer-test"), "audit leaked fake API key");

    signerGuardTest.resetSignerLoadCount();
    const liveError = await expectExecutionError(codes.REAL_PATH_DISABLED, "GUARD", () =>
      pipeline.submitSwapForTest("BUY", swapArgs({ executionMode: "LIVE", dryRunMode: true }))
    );
    assert(signerGuardTest.getSignerLoadCount() === 1, "LIVE did not load the signer guard");
    assert(liveError.message.includes("Real execution signer is not configured"), "LIVE signer error message changed");

    signerGuardTest.resetSignerLoadCount();
    const missingWalletError = await expectExecutionError(codes.WALLET_MISMATCH, "WALLET_MATCH", () =>
      pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: "" }))
    );
    assert(missingWalletError.message.includes("walletPublicAddress missing"), "missing wallet message changed");
    assert(signerGuardTest.getSignerLoadCount() === 0, "missing-wallet PIPELINE_DRY_RUN loaded signer guard");

    signerGuardTest.resetSignerLoadCount();
    const beforeDry = auditLineCount();
    const dry = await pipeline.submitSwapForTest("BUY", swapArgs({ executionMode: "DRY_RUN" }));
    const afterDry = auditLineCount();
    const dryAuditDelta = afterDry - beforeDry;
    assert(dryAuditDelta === 0, `DRY_RUN emitted pipeline audit entries; delta=${dryAuditDelta}`);
    assert(dry.isDryRun === true && !dry.isPipelineDryRun && dry.txSig === null, "DRY_RUN legacy result changed");
    assert(signerGuardTest.getSignerLoadCount() === 0, "DRY_RUN loaded signer guard");

    console.log("PIPELINE_DRY_RUN SIGNER TEST PASSED");
    console.log("PIPELINE_DRY_RUN stages:", expectedStages.join(" -> "));
    console.log("LIVE error:", JSON.stringify({ code: liveError.code, stage: liveError.stage, message: liveError.message }));
    console.log("Signer guard loads in PIPELINE_DRY_RUN: 0");
  } finally {
    quoteTest.resetQuoteFetchForTest();
    feeTest.resetPriorityFeeFetchForTest();
    buildTest.resetSwapBuildFetchForTest();
    simulationTest.resetSimulationFetchForTest();
    pipeline.resetSignerLoaderForTest();
    if (originals.signer === undefined) delete process.env.SOLANA_SIGNER_SECRET; else process.env.SOLANA_SIGNER_SECRET = originals.signer;
    if (originals.rpc === undefined) delete process.env.SOLANA_RPC_URL; else process.env.SOLANA_RPC_URL = originals.rpc;
    if (originals.heliusRpc === undefined) delete process.env.HELIUS_RPC_URL; else process.env.HELIUS_RPC_URL = originals.heliusRpc;
    if (originals.heliusApiKey === undefined) delete process.env.HELIUS_API_KEY; else process.env.HELIUS_API_KEY = originals.heliusApiKey;
    if (originals.expected === undefined) delete process.env.EXPECTED_WALLET_PUBLIC_ADDRESS; else process.env.EXPECTED_WALLET_PUBLIC_ADDRESS = originals.expected;
  }
})().catch(error => {
  console.error("PIPELINE_DRY_RUN SIGNER TEST FAILED:", error.message);
  process.exitCode = 1;
});
