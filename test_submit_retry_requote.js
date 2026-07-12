"use strict";

const executor = require("./live_executor");

const r14 = executor.__r14EnforcementTest;
const buildTest = executor.__txBuildTest;
const simulationTest = executor.__simulationTest;
const codes = r14.EXECUTION_ABORT_CODES;
const tokenMint = "11111111111111111111111111111111";

const cfg = {
  maxEntrySlippagePct: 1,
  maxExitSlippagePct: 1,
  maxRoutePriceImpactPct: 2,
  maxQuoteAgeMs: 10000,
  hardRejectSlippageBps: 300,
  maxSubmitRetries: 2,
  minPoolLiquidityUsd: 25000,
  mevRouteMode: "public_micro_live_only",
  positionSizeSol: 0.005,
  priorityFeeMode: "dynamic_helius",
  maxPriorityFeeLamports: 1000000,
  fallbackPriorityFeeLamports: 200000,
  assumedComputeUnitLimit: 300000,
  walletPublicAddress: "FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6"
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function goodQuote(kind = "BUY") {
  const mints = r14.resolveSwapMints(kind, tokenMint);
  return {
    inputMint: mints.inputMint,
    outputMint: mints.outputMint,
    inAmount: "5000000",
    outAmount: "90000000",
    otherAmountThreshold: "87300000",
    priceImpactPct: "1.5",
    slippageBps: 100,
    routePlan: [{ swapInfo: { label: "MOCK_ROUTE" }, percent: 100 }]
  };
}

function identitySigner() {
  return Object.defineProperties(
    { publicKey: Object.freeze({ toBase58: () => cfg.walletPublicAddress }) },
    {
      sign: { get() { throw new Error("test signer cannot sign"); } },
      secretKey: { get() { throw new Error("no secret"); } }
    }
  );
}

function installHappyPathMocks() {
  buildTest.setSwapBuildFetchForTest(async () => ({
    ok: true,
    json: async () => ({
      swapTransaction: Buffer.from([1, ...new Array(64).fill(0), 0x80, 1, 0, 0, 1, ...new Array(32).fill(0), ...new Array(32).fill(0), 1, 0, 0, 0]).toString("base64")
    })
  }));
  simulationTest.setSimulationFetchForTest(async () => ({
    ok: true,
    json: async () => ({
      result: { context: { slot: 123 }, value: { err: null, logs: ["Program success"], unitsConsumed: 100000 } }
    })
  }));
}

(async () => {
  try {
    assert(r14.maxSubmitAttempts({ maxSubmitRetries: 2 }) === 3, "maxSubmitRetries=2 should allow 3 attempts");
    assert(r14.isRetriableSubmitError({ code: codes.QUOTE_STALE }), "QUOTE_STALE is retriable");

    let quoteCalls = 0;
    r14.setQuoteFetchForTest(async () => {
      quoteCalls += 1;
      if (quoteCalls < 3) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => goodQuote("BUY") };
    });
    r14.setPriorityFeeFetchForTest(async () => ({
      ok: true,
      json: async () => ({ result: { totalPriorityFeeLamports: 250000 } })
    }));
    installHappyPathMocks();

    const pipeline = await r14.executeQuotedSwapWithRetries("BUY", {
      cfg,
      tokenAddress: tokenMint,
      positionSizeSol: 0.005,
      sellAmountTokenUnits: null,
      signer: identitySigner(),
      mode: "PIPELINE_DRY_RUN",
      poolLiquidityUsd: 50000,
      manualSlippageApproved: false
    });
    assert(pipeline.quote.outAmount === "90000000", "retry should succeed after re-quote");
    assert(quoteCalls === 3, "expected 3 quote attempts with maxSubmitRetries=2");

    quoteCalls = 0;
    r14.setQuoteFetchForTest(async () => {
      quoteCalls += 1;
      return { ok: false, json: async () => ({}) };
    });
    let failed = false;
    try {
      await r14.executeQuotedSwapWithRetries("BUY", {
        cfg,
        tokenAddress: tokenMint,
        positionSizeSol: 0.005,
        sellAmountTokenUnits: null,
        signer: identitySigner(),
        mode: "PIPELINE_DRY_RUN",
        poolLiquidityUsd: 50000,
        manualSlippageApproved: false
      });
    } catch (error) {
      failed = error.code === codes.QUOTE_FAILED || error.code === codes.RETRY_LIMIT_EXCEEDED;
    }
    assert(failed, "exhausted retries should fail closed");
    assert(quoteCalls === 3, "failed path should consume all quote attempts");

    console.log("SUBMIT RETRY REQUOTE TEST PASSED");
  } finally {
    r14.resetQuoteFetchForTest();
    r14.resetPriorityFeeFetchForTest();
    buildTest.resetSwapBuildFetchForTest();
    simulationTest.resetSimulationFetchForTest();
  }
})().catch(error => {
  console.error("SUBMIT RETRY REQUOTE TEST FAILED:", error.message);
  process.exitCode = 1;
});
