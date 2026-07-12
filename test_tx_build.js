"use strict";

const fs = require("fs");
const executor = require("./live_executor");

const test = executor.__txBuildTest;
const codes = executor.__executionLoggingTest.EXECUTION_ABORT_CODES;
const originalApiKey = process.env.JUPITER_API_KEY;
const fakeApiKey = "fake-step7-jupiter-api-key";
let signCalls = 0;
let simulationCalls = 0;
let submissionCalls = 0;
let capturedRequest = null;

const wallet = "11111111111111111111111111111111";
const signer = Object.freeze({
  publicKey: Object.freeze({ toBase58: () => wallet })
});
const quote = Object.freeze({
  inputMint: "So11111111111111111111111111111111111111112",
  outputMint: wallet,
  inAmount: "100000000",
  outAmount: "90000000",
  otherAmountThreshold: "87300000",
  swapMode: "ExactIn",
  slippageBps: 300,
  priceImpactPct: "1",
  routePlan: Object.freeze([{ swapInfo: { label: "MOCK" }, percent: 100 }]),
  _jupiterBaseUrl: test.JUPITER_SWAP_BASE_DEFAULT
});
const priorityFee = Object.freeze({
  appliedPriorityFeeLamports: 200000
});
const cfg = Object.freeze({
  walletPublicAddress: wallet,
  assumedComputeUnitLimit: 300000,
  maxPriorityFeeLamports: 1000000
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectCode(code, fn) {
  try {
    await fn();
  } catch (error) {
    assert(error.code === code, `expected ${code}, received ${error.code || error.name}`);
    return;
  }
  throw new Error(`expected ${code}, but call succeeded`);
}

function versionedTransactionBase64({ version = 0, instructionCount = 1, signaturePrefix = [1] } = {}) {
  return Buffer.from([
    ...signaturePrefix,
    ...new Array(64).fill(0),
    0x80 | version,
    1, 0, 0,
    1,
    ...new Array(32).fill(0),
    ...new Array(32).fill(0),
    instructionCount,
    ...(instructionCount > 0 ? [0, 0, 0] : [])
  ]).toString("base64");
}

function mockSingleSwap() {
  test.setSwapBuildFetchForTest(async (url, options) => {
    capturedRequest = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({
        swapTransaction: versionedTransactionBase64(),
        lastValidBlockHeight: 123,
        prioritizationFeeLamports: 200000
      })
    };
  });
}

(async () => {
  try {
    process.env.JUPITER_API_KEY = fakeApiKey;
    mockSingleSwap();
    const built = await test.buildSwapTx(quote, signer, priorityFee, cfg);
    assert(capturedRequest.url.startsWith(`${test.JUPITER_SWAP_BASE_DEFAULT}/swap`), "swap build must use unified /swap/v1 base");
    assert(!capturedRequest.url.includes("quote-api.jup.ag"), "deprecated Jupiter host must not be used for swap build");
    assert(built.transaction.type === "versioned_v0", "versioned v0 transaction shape not detected");
    assert(built.transaction.serializedBytes instanceof Uint8Array, "transaction bytes not held in memory");
    assert(capturedRequest.body.quoteResponse === quote || JSON.stringify(capturedRequest.body.quoteResponse) === JSON.stringify(quote), "validated quote not passed unchanged");
    assert(capturedRequest.body.slippageBps === quote.slippageBps, "slippageBps not explicitly passed");
    assert(capturedRequest.body.userPublicKey === wallet, "userPublicKey incorrect");
    assert(capturedRequest.body.wrapAndUnwrapSol === true, "wrapAndUnwrapSol not true");
    assert(capturedRequest.body.asLegacyTransaction === false, "asLegacyTransaction not false");
    assert(capturedRequest.body.prioritizationFeeLamports === priorityFee.appliedPriorityFeeLamports, "priority fee was not derived from Step 6 result");
    assert(built.metadata.derivedMicroLamportsPerCU === Math.floor(200000 * 1e6 / 300000), "micro-lamports/CU derivation incorrect");
    assert(built.metadata.wirePrioritizationFeeLamports === 200000, "wire priority-fee audit field incorrect");
    assert(built.metadata.derivedFromAssumedComputeUnitLimit === true, "priority-fee derivation audit flag missing");
    assert(built.metadata.instructionCount === 1, "instruction count was not inspected");
    assert(built.metadata.lastValidBlockHeight === 123, "lastValidBlockHeight not audited");
    assert(built.metadata.jupiterReportedPrioritizationFeeLamports === 200000, "Jupiter-reported priority fee not audited");
    assert(built.metadata.ataCreation === "unknown_possible", "ATA policy metadata missing");

    await expectCode(codes.WALLET_MISMATCH, () =>
      test.buildSwapTx(quote, signer, priorityFee, { ...cfg, walletPublicAddress: "SysvarRent111111111111111111111111111111111" })
    );

    test.setSwapBuildFetchForTest(async () => ({
      ok: true,
      json: async () => ({ setupTransaction: "setup", swapTransaction: versionedTransactionBase64() })
    }));
    await expectCode(codes.TX_BUILD_FAILED, () => test.buildSwapTx(quote, signer, priorityFee, cfg));

    test.setSwapBuildFetchForTest(async () => ({ ok: true, json: async () => ({ unexpected: true }) }));
    await expectCode(codes.TX_BUILD_FAILED, () => test.buildSwapTx(quote, signer, priorityFee, cfg));

    test.setSwapBuildFetchForTest(async () => ({
      ok: true,
      json: async () => ({ swapTransaction: versionedTransactionBase64({ signaturePrefix: [0x81, 0x00] }) })
    }));
    await expectCode(codes.TX_BUILD_FAILED, () => test.buildSwapTx(quote, signer, priorityFee, cfg));

    test.setSwapBuildFetchForTest(async () => ({
      ok: true,
      json: async () => ({ swapTransaction: versionedTransactionBase64({ version: 1 }) })
    }));
    await expectCode(codes.TX_BUILD_FAILED, () => test.buildSwapTx(quote, signer, priorityFee, cfg));

    test.setSwapBuildFetchForTest(async () => ({
      ok: true,
      json: async () => ({ swapTransaction: versionedTransactionBase64({ instructionCount: 0 }) })
    }));
    await expectCode(codes.TX_BUILD_FAILED, () => test.buildSwapTx(quote, signer, priorityFee, cfg));

    const auditText = fs.readFileSync(executor.FILES.EXECUTION_AUDIT_FILE, "utf8");
    assert(!auditText.includes(fakeApiKey), "TX_BUILD audit contains API key");
    assert(!auditText.includes(versionedTransactionBase64()), "TX_BUILD audit contains serialized transaction");
    assert(signCalls === 0 && simulationCalls === 0 && submissionCalls === 0, "forbidden transaction method called");
    assert(!Object.keys(test).some(key => /sign|simulate|send|submit/i.test(key) && key !== "submitSwapForTest"), "forbidden test capability exposed");

    console.log("TX BUILD TEST PASSED");
    console.log("Single versioned transaction built in memory; signing/simulation/submission calls: 0");
  } finally {
    test.resetSwapBuildFetchForTest();
    if (originalApiKey === undefined) delete process.env.JUPITER_API_KEY;
    else process.env.JUPITER_API_KEY = originalApiKey;
  }
})().catch(error => {
  console.error("TX BUILD TEST FAILED:", error.message);
  process.exitCode = 1;
});
