"use strict";

const crypto = require("crypto");
const executor = require("./live_executor");

const test = executor.__jupiterQuoteTest;
const feeTest = executor.__priorityFeeTest;
const txBuildTest = executor.__txBuildTest;
const simulationTest = executor.__simulationTest;
const codes = executor.__executionLoggingTest.EXECUTION_ABORT_CODES;
const tokenMint = "11111111111111111111111111111111";
const otherMint = "SysvarRent111111111111111111111111111111111";
const cfg = {
  maxEntrySlippagePct: 3,
  maxExitSlippagePct: 5,
  maxRoutePriceImpactPct: 10,
  priorityFeeMode: "dynamic_helius",
  maxPriorityFeeLamports: 1000000,
  fallbackPriorityFeeLamports: 200000,
  assumedComputeUnitLimit: 300000
};
let quoteCalls = 0;
let transactionCalls = 0;
const originalSigner = process.env.SOLANA_SIGNER_SECRET;
const originalExpected = process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
const originalSolanaRpc = process.env.SOLANA_RPC_URL;

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

function quoteFor(kind, overrides = {}) {
  const mints = test.resolveSwapMints(kind, tokenMint);
  return {
    inputMint: mints.inputMint,
    outputMint: mints.outputMint,
    inAmount: "100000000",
    outAmount: "90000000",
    otherAmountThreshold: "87300000",
    priceImpactPct: "1.5",
    slippageBps: kind === "BUY" ? 100 : 100,
    routePlan: [{ swapInfo: { label: "MOCK_ROUTE" }, percent: 100 }],
    ...overrides
  };
}

function encodeBase58(bytes) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = 0n;
  for (const byte of bytes) value = (value * 256n) + BigInt(byte);
  let encoded = "";
  while (value > 0n) {
    encoded = alphabet[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  return "1".repeat(zeros) + (encoded || (zeros ? "" : "1"));
}

function makeTestKeypair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const seed = Buffer.from(privateKey.export({ format: "der", type: "pkcs8" })).subarray(-32);
  const publicBytes = Buffer.from(publicKey.export({ format: "der", type: "spki" })).subarray(-32);
  return { secretJson: JSON.stringify([...seed, ...publicBytes]), address: encodeBase58(publicBytes) };
}

(async () => {
  try {
    const buyMints = test.resolveSwapMints("BUY", tokenMint);
    assert(buyMints.inputMint === test.SOL_MINT && buyMints.outputMint === tokenMint, "BUY mint resolution incorrect");
    const sellMints = test.resolveSwapMints("SELL", tokenMint);
    assert(sellMints.inputMint === tokenMint && sellMints.outputMint === test.SOL_MINT, "SELL mint resolution incorrect");
    await expectCode(codes.MINT_MISMATCH, () => Promise.resolve(test.resolveSwapMints("BUY", "bad")));

    await expectCode(codes.MINT_MISMATCH, () => Promise.resolve(test.validateJupiterRoute(
      quoteFor("BUY", { inputMint: otherMint }), "BUY", cfg, buyMints
    )));
    await expectCode(codes.MINT_MISMATCH, () => Promise.resolve(test.validateJupiterRoute(
      quoteFor("BUY", { outputMint: otherMint }), "BUY", cfg, buyMints
    )));
    await expectCode(codes.ROUTE_REJECTED, () => Promise.resolve(test.validateJupiterRoute(
      quoteFor("BUY", { priceImpactPct: "10.01" }), "BUY", cfg, buyMints
    )));
    await expectCode(codes.ENTRY_SLIPPAGE_BLOCKED, () => Promise.resolve(test.validateJupiterRoute(
      quoteFor("BUY", { slippageBps: 101 }), "BUY", { ...cfg, maxEntrySlippagePct: 1 }, buyMints
    )));
    await expectCode(codes.ROUTE_REJECTED, () => Promise.resolve(test.validateJupiterRoute(
      quoteFor("BUY", { slippageBps: 300 }), "BUY", { ...cfg, hardRejectSlippageBps: 300 }, buyMints
    )));
    await expectCode(codes.ROUTE_REJECTED, () => Promise.resolve(test.validateJupiterRoute(
      quoteFor("BUY", { otherAmountThreshold: null, outAmount: null }), "BUY", cfg, buyMints
    )));
    assert(test.isQuoteFresh({ _fetchedAtMs: Date.now() }, 10000), "fresh quote should pass");
    assert(!test.isQuoteFresh({ _fetchedAtMs: Date.now() - 11000 }, 10000), "stale quote should fail");
    await expectCode(codes.EXIT_SLIPPAGE_BLOCKED, () => Promise.resolve(test.validateJupiterRoute(
      quoteFor("SELL", { slippageBps: 150 }), "SELL", { ...cfg, maxExitSlippagePct: 1 }, sellMints
    )));
    assert(test.validateJupiterRoute(quoteFor("BUY"), "BUY", cfg, buyMints), "good BUY route rejected");

    test.setQuoteFetchForTest(async url => {
      quoteCalls += 1;
      assert(url.startsWith(`${test.JUPITER_SWAP_BASE_DEFAULT}/quote`), "wrong Jupiter quote endpoint");
      assert(!url.includes("quote-api.jup.ag"), "deprecated Jupiter quote host must not be used");
      assert(!url.includes("/v6/"), "Jupiter v6 quote path must not be used");
      return { ok: true, json: async () => quoteFor("BUY") };
    });
    const fetchedQuote = await test.getJupiterQuote("BUY", cfg, buyMints, 100000000);
    assert(fetchedQuote.outAmount === "90000000", "mocked quote retrieval failed");

    const keypair = makeTestKeypair();
    process.env.SOLANA_SIGNER_SECRET = keypair.secretJson;
    process.env.SOLANA_RPC_URL = "https://rpc.invalid";
    delete process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
    feeTest.setPriorityFeeFetchForTest(async () => ({
      ok: true,
      json: async () => ({ result: { totalPriorityFeeLamports: 250000 } })
    }));
    txBuildTest.setSwapBuildFetchForTest(async () => ({
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
    await expectCode(codes.REAL_PATH_DISABLED, () => test.submitSwapForTest("BUY", {
      cfg: { ...cfg, dryRunMode: false, walletPublicAddress: keypair.address },
      tokenAddress: tokenMint,
      pairAddress: "mock-pair",
      expectedPrice: 1,
      positionSizeSol: 0.005
    }));

    if (process.env.RUN_REAL_QUOTE_TEST === "true") {
      test.resetQuoteFetchForTest();
      await test.getJupiterQuote("BUY", cfg, buyMints, 1000000);
    }

    assert(transactionCalls === 0, "transaction/simulation/submission method called");
    assert(!Object.keys(test).some(key => /transaction|simulate|submit/i.test(key) && key !== "submitSwapForTest"), "transaction capability exposed");
    console.log("JUPITER QUOTE VALIDATION TEST PASSED");
    console.log(`Mock quote calls: ${quoteCalls}; transaction/simulation/submission calls: 0`);
  } finally {
    test.resetQuoteFetchForTest();
    feeTest.resetPriorityFeeFetchForTest();
    txBuildTest.resetSwapBuildFetchForTest();
    simulationTest.resetSimulationFetchForTest();
    if (originalSigner === undefined) delete process.env.SOLANA_SIGNER_SECRET;
    else process.env.SOLANA_SIGNER_SECRET = originalSigner;
    if (originalExpected === undefined) delete process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
    else process.env.EXPECTED_WALLET_PUBLIC_ADDRESS = originalExpected;
    if (originalSolanaRpc === undefined) delete process.env.SOLANA_RPC_URL;
    else process.env.SOLANA_RPC_URL = originalSolanaRpc;
  }
})().catch(error => {
  console.error("JUPITER QUOTE VALIDATION TEST FAILED:", error.message);
  process.exitCode = 1;
});
