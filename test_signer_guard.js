"use strict";

const fs = require("fs");
const crypto = require("crypto");
const executor = require("./live_executor");

const guard = executor.__signerGuardTest;
const quoteTest = executor.__jupiterQuoteTest;
const feeTest = executor.__priorityFeeTest;
const txBuildTest = executor.__txBuildTest;
const simulationTest = executor.__simulationTest;
const codes = executor.__executionLoggingTest.EXECUTION_ABORT_CODES;
const originalSigner = process.env.SOLANA_SIGNER_SECRET;
const originalExpected = process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
const originalFetch = global.fetch;
const originalSolanaRpc = process.env.SOLANA_RPC_URL;
let networkCalls = 0;
global.fetch = async () => {
  networkCalls += 1;
  throw new Error("Network access is forbidden in signer guard tests");
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  const secretBytes = [...seed, ...publicBytes];
  return { secretBytes, secretJson: JSON.stringify(secretBytes), address: encodeBase58(publicBytes) };
}

async function expectCode(code, fn, stage = null) {
  try {
    await fn();
  } catch (error) {
    assert(error.code === code, `expected ${code}, received ${error.code || error.name}`);
    if (stage) assert(error.stage === stage, `expected stage ${stage}, received ${error.stage}`);
    return;
  }
  throw new Error(`expected ${code}, but call succeeded`);
}

const swapArgs = cfg => ({
  cfg: {
    automationEnabled: true,
    emergencyStop: false,
    maxEntrySlippagePct: 3,
    maxExitSlippagePct: 5,
    maxRoutePriceImpactPct: 10,
    priorityFeeMode: "dynamic_helius",
    maxPriorityFeeLamports: 1000000,
    fallbackPriorityFeeLamports: 200000,
    assumedComputeUnitLimit: 300000,
    ...cfg
  },
  tokenAddress: "11111111111111111111111111111111",
  pairAddress: "test-pair",
  expectedPrice: 1,
  positionSizeSol: 0.005
});

(async () => {
  try {
    assert(guard, "signer guard test interface missing");
    assert(!Object.hasOwn(guard, "loadSignerFromEnvForRealExecution"), "private signer loader must not be exported");

    // Isolate LIVE-path guard tests from operator/test pending-reconciliation rows.
    fs.writeFileSync(executor.FILES.PENDING_RECONCILIATION_FILE, "");
    executor.__r16LivePathTest.clearAllLiveSubmitInFlightForTest();

    delete process.env.SOLANA_SIGNER_SECRET;
    delete process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
    guard.resetSignerLoadCount();
    const dryResult = await guard.submitSwapForTest("BUY", swapArgs({ dryRunMode: true }));
    assert(dryResult.isDryRun === true, "dry-run call did not return synthetic result");
    assert(guard.getSignerLoadCount() === 0, "dry-run path called signer loader");

    await expectCode(codes.REAL_PATH_DISABLED, () =>
      guard.submitSwapForTest("BUY", swapArgs({ dryRunMode: false, walletPublicAddress: "unused" }))
    , "GUARD");

    process.env.FOMO_ENABLE_LIVE_SUBMISSION = "YES";
    process.env.SOLANA_RPC_URL = "https://dedicated-rpc.invalid/?api-key=signer-guard-test";
    executor.__r16LivePathTest.setMicroLiveApprovalGateForTest(() => ({ ok: true }));

    process.env.SOLANA_SIGNER_SECRET = "not-json";
    await expectCode(codes.SIGNER_LOAD_FAILED, () =>
      guard.submitSwapForTest("BUY", swapArgs({ dryRunMode: false, walletPublicAddress: "unused" }))
    );
    executor.__r16LivePathTest.clearAllLiveSubmitInFlightForTest();

    const testKeypair = makeTestKeypair();
    process.env.SOLANA_SIGNER_SECRET = testKeypair.secretJson;
    process.env.SOLANA_RPC_URL = "https://rpc.invalid";
    quoteTest.setQuoteFetchForTest(async () => ({
      ok: true,
      json: async () => ({
        inputMint: quoteTest.SOL_MINT,
        outputMint: "11111111111111111111111111111111",
        inAmount: "100000000",
        outAmount: "90000000",
        otherAmountThreshold: "87300000",
        priceImpactPct: "1",
        slippageBps: 100,
        routePlan: [{ swapInfo: { label: "MOCK" }, percent: 100 }]
      })
    }));
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
    await expectCode(codes.WALLET_MISMATCH, () =>
      guard.submitSwapForTest("BUY", swapArgs({ dryRunMode: false, walletPublicAddress: "WrongWalletAddress" }))
    );
    executor.__r16LivePathTest.clearAllLiveSubmitInFlightForTest();

    delete process.env.FOMO_ENABLE_LIVE_SUBMISSION;
    await expectCode(codes.REAL_PATH_DISABLED, () =>
      guard.submitSwapForTest("BUY", swapArgs({ dryRunMode: false, walletPublicAddress: testKeypair.address }))
    , "GUARD");
    executor.__r16LivePathTest.clearAllLiveSubmitInFlightForTest();

    process.env.FOMO_ENABLE_LIVE_SUBMISSION = "YES";
    executor.__r16LivePathTest.setMicroLiveApprovalGateForTest(() => ({ ok: true }));
    process.env.EXPECTED_WALLET_PUBLIC_ADDRESS = "WrongExpectedWallet";
    await expectCode(codes.WALLET_MISMATCH, () =>
      guard.submitSwapForTest("BUY", swapArgs({ dryRunMode: false, walletPublicAddress: testKeypair.address }))
    );

    const logs = [executor.FILES.ERRORS_FILE, executor.FILES.EXECUTION_AUDIT_FILE]
      .filter(fs.existsSync)
      .map(file => fs.readFileSync(file, "utf8"))
      .join("\n");
    assert(!logs.includes(testKeypair.secretJson), "logs contain signer byte array");
    assert(!logs.includes(testKeypair.secretBytes.slice(0, 8).join(",")), "logs contain signer bytes");
    assert(!/\bseed phrase\b/i.test(logs), "logs contain seed phrase text");
    assert(!/\bprivate key\b/i.test(logs), "logs contain private key text");
    assert(networkCalls === 0, "signer guard test called a network method");

    console.log("SIGNER GUARD TEST PASSED");
    console.log("Dry run bypassed signer; guard codes verified; network/transaction calls: 0");
  } finally {
    executor.__r16LivePathTest.resetMicroLiveApprovalGateForTest();
    executor.__r16LivePathTest.clearAllLiveSubmitInFlightForTest();
    if (originalSigner === undefined) delete process.env.SOLANA_SIGNER_SECRET;
    else process.env.SOLANA_SIGNER_SECRET = originalSigner;
    if (originalExpected === undefined) delete process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
    else process.env.EXPECTED_WALLET_PUBLIC_ADDRESS = originalExpected;
    global.fetch = originalFetch;
    quoteTest.resetQuoteFetchForTest();
    feeTest.resetPriorityFeeFetchForTest();
    txBuildTest.resetSwapBuildFetchForTest();
    simulationTest.resetSimulationFetchForTest();
    if (originalSolanaRpc === undefined) delete process.env.SOLANA_RPC_URL;
    else process.env.SOLANA_RPC_URL = originalSolanaRpc;
  }
})().catch(error => {
  console.error("SIGNER GUARD TEST FAILED:", error.message);
  process.exitCode = 1;
});
