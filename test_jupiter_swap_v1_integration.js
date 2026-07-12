"use strict";

const crypto = require("crypto");
const client = require("./jupiter_swap_client");
const executor = require("./live_executor");

const quoteTest = executor.__jupiterQuoteTest;
const feeTest = executor.__priorityFeeTest;
const txBuildTest = executor.__txBuildTest;
const simulationTest = executor.__simulationTest;
const submissionTest = executor.__submissionTest;

const tokenMint = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const cfg = {
  maxEntrySlippagePct: 3,
  maxExitSlippagePct: 5,
  maxRoutePriceImpactPct: 10,
  priorityFeeMode: "dynamic_helius",
  maxPriorityFeeLamports: 1_000_000,
  fallbackPriorityFeeLamports: 200_000,
  assumedComputeUnitLimit: 300_000
};

let quoteUrls = [];
let swapUrls = [];
let sendCalls = 0;
let signCalls = 0;

const originalSigner = process.env.SOLANA_SIGNER_SECRET;
const originalRpc = process.env.SOLANA_RPC_URL;
const originalApiKey = process.env.JUPITER_API_KEY;

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
  return { secretJson: JSON.stringify([...seed, ...publicBytes]), address: encodeBase58(publicBytes) };
}

function versionedTransactionBase64() {
  return Buffer.from([
    1, ...new Array(64).fill(0), 0x80, 1, 0, 0, 1,
    ...new Array(32).fill(0), ...new Array(32).fill(0), 1, 0, 0, 0
  ]).toString("base64");
}

function quoteFor(kind, amount, overrides = {}) {
  const mints = quoteTest.resolveSwapMints(kind, tokenMint);
  return {
    inputMint: mints.inputMint,
    outputMint: mints.outputMint,
    inAmount: String(amount),
    outAmount: kind === "BUY" ? "900000" : "4900000",
    otherAmountThreshold: kind === "BUY" ? "873000" : "4753000",
    priceImpactPct: "0.5",
    slippageBps: 100,
    routePlan: [{ swapInfo: { label: "MOCK_ROUTE", ammKey: "amm-fixture" }, percent: 100 }],
    _jupiterBaseUrl: client.JUPITER_SWAP_BASE_DEFAULT,
    ...overrides
  };
}

function installDeterministicFixtures() {
  quoteUrls = [];
  swapUrls = [];
  quoteTest.setQuoteFetchForTest(async url => {
    quoteUrls.push(url);
    const params = new URL(url).searchParams;
    const inputMint = params.get("inputMint");
    const kind = inputMint === quoteTest.SOL_MINT ? "BUY" : "SELL";
    const amount = Number(params.get("amount"));
    return { ok: true, json: async () => quoteFor(kind, amount) };
  });
  txBuildTest.setSwapBuildFetchForTest(async (url, options) => {
    swapUrls.push(url);
    const body = JSON.parse(options.body);
    client.assertQuoteBuildConsistency(body.quoteResponse, {
      swapBaseUrl: client.JUPITER_SWAP_BASE_DEFAULT,
      walletPublicAddress: body.userPublicKey,
      slippageBps: body.slippageBps
    });
    return {
      ok: true,
      json: async () => ({
        swapTransaction: versionedTransactionBase64(),
        lastValidBlockHeight: 456,
        prioritizationFeeLamports: body.prioritizationFeeLamports
      })
    };
  });
  feeTest.setPriorityFeeFetchForTest(async () => ({
    ok: true,
    json: async () => ({ result: { totalPriorityFeeLamports: 250_000 } })
  }));
  simulationTest.setSimulationFetchForTest(async () => ({
    ok: true,
    json: async () => ({
      result: {
        context: { slot: 789 },
        value: { err: null, logs: ["Program success"], unitsConsumed: 120_000 }
      }
    })
  }));
  submissionTest.setSubmissionFetchForTest(async () => {
    sendCalls += 1;
    throw new Error("sendTransaction boundary must remain disabled");
  });
}

async function runNoBroadcastPath(kind, keypair) {
  quoteUrls.length = 0;
  swapUrls.length = 0;
  const result = await quoteTest.submitSwapForTest(kind, {
    cfg: {
      ...cfg,
      dryRunMode: true,
      executionMode: "PIPELINE_DRY_RUN",
      walletPublicAddress: keypair.address
    },
    tokenAddress: tokenMint,
    pairAddress: "fixture-pair",
    expectedPrice: 1,
    positionSizeSol: 0.005,
    ...(kind === "SELL" ? { sellAmountTokenUnits: 900_000, poolLiquidityUsd: 1_000_000 } : {})
  });
  assert(result.isPipelineDryRun === true, `${kind} must remain pipeline dry-run`);
  assert(result.txSig === null, `${kind} must not submit a transaction`);
  assert(quoteUrls.length === 1, `${kind} must fetch exactly one quote`);
  assert(swapUrls.length === 1, `${kind} must build exactly one swap transaction`);
  assert(
    quoteUrls[0].startsWith(`${client.JUPITER_SWAP_BASE_DEFAULT}/quote`),
    `${kind} quote must use lite-api /swap/v1 base`
  );
  assert(
    swapUrls[0] === `${client.JUPITER_SWAP_BASE_DEFAULT}/swap`,
    `${kind} swap build must use same base host`
  );
  const quoteHost = new URL(quoteUrls[0]).hostname;
  const swapHost = new URL(swapUrls[0]).hostname;
  assert(quoteHost === swapHost, `${kind} quote/build host mismatch rejection required`);
  assert(result.pipelineMetadata?.quoteHash, `${kind} must preserve quote metadata through pipeline dry-run`);
}

(async () => {
  try {
    delete process.env.JUPITER_API_KEY;
    const keypair = makeTestKeypair();
    process.env.SOLANA_SIGNER_SECRET = keypair.secretJson;
    process.env.SOLANA_RPC_URL = "https://rpc.invalid";

    installDeterministicFixtures();
    await runNoBroadcastPath("BUY", keypair);
    await runNoBroadcastPath("SELL", keypair);

    expectJupiterHostMismatchBlocked();
    expectJupiterGenerationMismatchBlocked();

    assert(sendCalls === 0 && signCalls === 0, "send/sign boundaries must remain untouched");
    console.log("JUPITER SWAP V1 INTEGRATION TEST PASSED");
    console.log("BUY/SELL no-broadcast paths verified; quote/build host unified; send/broadcast calls: 0");
  } finally {
    quoteTest.resetQuoteFetchForTest();
    feeTest.resetPriorityFeeFetchForTest();
    txBuildTest.resetSwapBuildFetchForTest();
    simulationTest.resetSimulationFetchForTest();
    submissionTest.resetSubmissionFetchForTest();
    if (originalSigner === undefined) delete process.env.SOLANA_SIGNER_SECRET;
    else process.env.SOLANA_SIGNER_SECRET = originalSigner;
    if (originalRpc === undefined) delete process.env.SOLANA_RPC_URL;
    else process.env.SOLANA_RPC_URL = originalRpc;
    if (originalApiKey === undefined) delete process.env.JUPITER_API_KEY;
    else process.env.JUPITER_API_KEY = originalApiKey;
  }
})().catch(error => {
  console.error("JUPITER SWAP V1 INTEGRATION TEST FAILED:", error.message);
  process.exitCode = 1;
});

function expectJupiterHostMismatchBlocked() {
  const quote = quoteFor("BUY", 5_000_000, {
    _jupiterBaseUrl: client.JUPITER_SWAP_BASE_PRO
  });
  let threw = false;
  try {
    client.assertQuoteBuildConsistency(quote, { swapBaseUrl: client.JUPITER_SWAP_BASE_DEFAULT });
  } catch (error) {
    threw = error.code === "JUPITER_HOST_MISMATCH";
  }
  assert(threw, "host mismatch must be rejected");
}

function expectJupiterGenerationMismatchBlocked() {
  let threw = false;
  try {
    client.assertSupportedSwapV1Base("https://quote-api.jup.ag/v6/quote");
  } catch (error) {
    threw = error.code === "JUPITER_HOST_DEPRECATED" || error.code === "JUPITER_API_GENERATION_MISMATCH";
  }
  assert(threw, "deprecated v6 generation must be rejected");
}
