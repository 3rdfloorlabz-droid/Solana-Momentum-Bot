"use strict";

const fs = require("fs");
const crypto = require("crypto");
const executor = require("./live_executor");

const pipeline = executor.__pipelineDryRunTest;
const quoteTest = executor.__jupiterQuoteTest;
const feeTest = executor.__priorityFeeTest;
const buildTest = executor.__txBuildTest;
const simulationTest = executor.__simulationTest;
const submissionTest = executor.__submissionTest;
const codes = executor.__executionLoggingTest.EXECUTION_ABORT_CODES;
const stages = executor.__executionLoggingTest.EXECUTION_STAGES;
const auditFile = executor.FILES.EXECUTION_AUDIT_FILE;

const originals = {
  signer: process.env.SOLANA_SIGNER_SECRET,
  rpc: process.env.SOLANA_RPC_URL,
  heliusRpc: process.env.HELIUS_RPC_URL,
  heliusApiKey: process.env.HELIUS_API_KEY,
  expected: process.env.EXPECTED_WALLET_PUBLIC_ADDRESS
  , arm: process.env.FOMO_ENABLE_LIVE_SUBMISSION
};
const originalCryptoSign = crypto.sign;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function encodeBase58(bytes) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let result = "";
  while (value > 0n) {
    result = alphabet[Number(value % 58n)] + result;
    value /= 58n;
  }
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  return "1".repeat(zeros) + (result || (zeros ? "" : "1"));
}

function makeTestKeypair() {
  const pair = crypto.generateKeyPairSync("ed25519");
  const seed = Buffer.from(pair.privateKey.export({ format: "der", type: "pkcs8" })).subarray(-32);
  const publicBytes = Buffer.from(pair.publicKey.export({ format: "der", type: "spki" })).subarray(-32);
  const secretBytes = [...seed, ...publicBytes];
  return {
    secretBytes,
    secretJson: JSON.stringify(secretBytes),
    address: encodeBase58(publicBytes),
    publicKey: pair.publicKey
  };
}

function v0TransactionBytes() {
  return Uint8Array.from([
    1,
    ...new Array(64).fill(0),
    0x80,
    1, 0, 0,
    1,
    ...new Array(32).fill(0),
    ...new Array(32).fill(0),
    1,
    0, 0, 0
  ]);
}

function v0TransactionBase64() {
  return Buffer.from(v0TransactionBytes()).toString("base64");
}

function baseCfg(overrides = {}) {
  return {
    executionMode: "LIVE",
    dryRunMode: false,
    automationEnabled: true,
    emergencyStop: false,
    walletPublicAddress: "11111111111111111111111111111111",
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
    tokenAddress: "11111111111111111111111111111111",
    pairAddress: "step9a-pair",
    expectedPrice: 2,
    positionSizeSol: 0.01
  };
}

function installMocks() {
  quoteTest.setQuoteFetchForTest(async () => ({
    ok: true,
    json: async () => ({
      inputMint: quoteTest.SOL_MINT,
      outputMint: "11111111111111111111111111111111",
      inAmount: "100000000",
      outAmount: "50000000",
      otherAmountThreshold: "48500000",
      priceImpactPct: "1",
      slippageBps: 300,
      routePlan: [{ swapInfo: { label: "MOCK" }, percent: 100 }]
    })
  }));
  feeTest.setPriorityFeeFetchForTest(async () => ({
    ok: true,
    json: async () => ({ result: { totalPriorityFeeLamports: 250000 } })
  }));
  buildTest.setSwapBuildFetchForTest(async () => ({
    ok: true,
    json: async () => ({
      swapTransaction: v0TransactionBase64(),
      lastValidBlockHeight: 321,
      prioritizationFeeLamports: 250000
    })
  }));
  simulationTest.setSimulationFetchForTest(async () => ({
    ok: true,
    json: async () => ({
      result: {
        context: { slot: 99 },
        value: { err: null, logs: ["Program success"], unitsConsumed: 180000 }
      }
    })
  }));
}

function readAuditRows() {
  if (!fs.existsSync(auditFile)) return [];
  return fs.readFileSync(auditFile, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
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
    delete process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
    delete process.env.HELIUS_RPC_URL;
    delete process.env.HELIUS_API_KEY;
    process.env.SOLANA_RPC_URL = "https://dedicated-rpc.invalid/?api-key=fake-step9a-key";
    process.env.FOMO_ENABLE_LIVE_SUBMISSION = "YES";
    installMocks();
    submissionTest.setSubmissionFetchForTest(async () => { throw new Error("controlled Step 9a submission stop"); });

    const keypair = makeTestKeypair();
    process.env.SOLANA_SIGNER_SECRET = keypair.secretJson;

    const expectedUnsigned = v0TransactionBytes();
    assert(expectedUnsigned[0] === 0x01, "test v0 tx does not use single-signature shortvec");
    assert(expectedUnsigned.slice(1, 65).every(byte => byte === 0), "test v0 tx placeholder signature slot is not zeroed");
    const expectedMessageHex = Buffer.from(expectedUnsigned.subarray(65)).toString("hex");

    let capturedMessage = null;
    let capturedSignature = null;
    crypto.sign = function patchedSign(...args) {
      const signature = originalCryptoSign.apply(this, args);
      capturedMessage = Buffer.from(args[1]);
      capturedSignature = Buffer.from(signature);
      return signature;
    };

    const startRows = readAuditRows().length;
    const error = await expectExecutionError(codes.SUBMISSION_UNKNOWN, stages.SUBMIT, () =>
      pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: keypair.address }))
    );
    const rows = readAuditRows().slice(startRows);
    const signedEntry = rows.find(row => row.eventType === "EXECUTION_STAGE" && row.stage === stages.SIGNED);
    assert(signedEntry, "SIGNED audit entry missing");
    assert(signedEntry.payload.signedAt, "SIGNED audit missing signedAt");
    assert(signedEntry.payload.signatureLength === 64, "SIGNED audit signature length invalid");
    assert(signedEntry.payload.signedByteLength === expectedUnsigned.length, "SIGNED audit signed-byte length invalid");
    assert(/^[0-9a-f]{8}$/.test(signedEntry.payload.signaturePrefix), "SIGNED audit prefix is not 8 hex chars");
    assert(signedEntry.payload.quoteHash, "SIGNED audit missing quoteHash");
    assert(signedEntry.payload.simulationSuccess === true, "SIGNED audit simulationSuccess invalid");
    assert(error.message === "Submission network error", "Step 9a controlled submission stop changed");

    assert(capturedMessage, "crypto.sign was not called");
    assert(capturedSignature && capturedSignature.length === 64, "signature was not captured");
    assert(Buffer.from(capturedMessage).toString("hex") === expectedMessageHex, "signed message bytes do not match v0 message section");
    assert(crypto.verify(null, capturedMessage, keypair.publicKey, capturedSignature), "Ed25519 signature did not verify");
    const auditJson = JSON.stringify(rows);
    assert(!auditJson.includes(capturedSignature.toString("hex")), "audit leaked full signature hex");
    assert(!auditJson.includes(Buffer.concat([Buffer.from([1]), capturedSignature, Buffer.from(capturedMessage)]).toString("hex")), "audit leaked signed transaction hex");
    assert(!auditJson.includes(Buffer.concat([Buffer.from([1]), capturedSignature, Buffer.from(capturedMessage)]).toString("base64")), "audit leaked signed transaction base64");

    const source = fs.readFileSync(require.resolve("./live_executor"), "utf8");
    assert((source.match(/signedBytes\.fill\(0\)/g) || []).length >= 1, "signedBytes.fill(0) missing");
    assert((source.match(/signature\.fill\(0\)/g) || []).length >= 1, "signature.fill(0) missing");
    assert((source.match(/signer = null/g) || []).length >= 1, "signer = null missing");

    pipeline.setSignerLoaderForTest(() => Object.freeze({
      publicKey: Object.freeze({ toBase58: () => keypair.address }),
      sign: () => { throw new Error("CONTROLLED_SIGN_FAILURE"); }
    }));
    const beforeFailRows = readAuditRows().length;
    try {
      await pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: keypair.address }));
      throw new Error("expected controlled signing failure");
    } catch (signError) {
      assert(signError.message === "CONTROLLED_SIGN_FAILURE", "controlled signer error was not propagated");
    }
    const failRows = readAuditRows().slice(beforeFailRows);
    assert(!failRows.some(row => row.stage === stages.SIGNED), "SIGNED audit emitted after signing failure");
    pipeline.resetSignerLoaderForTest();

    const beforePipelineRows = readAuditRows().length;
    const pipelineResult = await pipeline.submitSwapForTest("BUY", swapArgs({
      executionMode: "PIPELINE_DRY_RUN",
      walletPublicAddress: keypair.address
    }));
    const pipelineRows = readAuditRows().slice(beforePipelineRows);
    assert(pipelineResult.isPipelineDryRun === true, "PIPELINE_DRY_RUN result changed");
    assert(pipelineRows.some(row => row.stage === stages.PIPELINE_DRY_RUN), "PIPELINE_DRY_RUN audit missing");
    assert(!pipelineRows.some(row => row.stage === stages.SIGNED), "PIPELINE_DRY_RUN emitted SIGNED audit");
    const identityOnlySigner = Object.defineProperties(
      { publicKey: Object.freeze({ toBase58: () => keypair.address }) },
      { sign: { get() { throw new Error("PIPELINE_DRY_RUN signer is identity-only and cannot sign."); } } }
    );
    try {
      identityOnlySigner.sign;
      throw new Error("identity-only signer sign getter did not throw");
    } catch (identityError) {
      assert(identityError.message.includes("identity-only"), "identity-only signer sign getter changed");
    }

    const beforeDryRows = readAuditRows().length;
    const dryResult = await pipeline.submitSwapForTest("BUY", swapArgs({ executionMode: "DRY_RUN" }));
    const dryRows = readAuditRows().slice(beforeDryRows);
    assert(dryResult.isDryRun === true && dryResult.txSig === null && dryResult.slippagePct === 0, "DRY_RUN synthetic intent changed");
    assert(!dryRows.some(row => row.stage === stages.SIGNED), "DRY_RUN emitted SIGNED audit");

    delete process.env.SOLANA_SIGNER_SECRET;
    await expectExecutionError(codes.REAL_PATH_DISABLED, stages.GUARD, () =>
      pipeline.submitSwapForTest("BUY", swapArgs({ executionMode: "LIVE", walletPublicAddress: keypair.address }))
    );

    console.log("STEP 9A SIGNING TEST PASSED");
    console.log("SIGNED AUDIT ENTRY:");
    console.log(JSON.stringify(signedEntry));
    console.log("SUBMISSION_UNKNOWN ERROR:");
    console.log(JSON.stringify({
      code: error.code,
      stage: error.stage,
      message: error.message
    }));
    console.log("Verified Ed25519 signature over message bytes:", capturedMessage.length);
  } finally {
    crypto.sign = originalCryptoSign;
    quoteTest.resetQuoteFetchForTest();
    feeTest.resetPriorityFeeFetchForTest();
    buildTest.resetSwapBuildFetchForTest();
    simulationTest.resetSimulationFetchForTest();
    submissionTest.resetSubmissionFetchForTest();
    pipeline.resetSignerLoaderForTest();
    if (originals.signer === undefined) delete process.env.SOLANA_SIGNER_SECRET; else process.env.SOLANA_SIGNER_SECRET = originals.signer;
    if (originals.rpc === undefined) delete process.env.SOLANA_RPC_URL; else process.env.SOLANA_RPC_URL = originals.rpc;
    if (originals.heliusRpc === undefined) delete process.env.HELIUS_RPC_URL; else process.env.HELIUS_RPC_URL = originals.heliusRpc;
    if (originals.heliusApiKey === undefined) delete process.env.HELIUS_API_KEY; else process.env.HELIUS_API_KEY = originals.heliusApiKey;
    if (originals.expected === undefined) delete process.env.EXPECTED_WALLET_PUBLIC_ADDRESS; else process.env.EXPECTED_WALLET_PUBLIC_ADDRESS = originals.expected;
    if (originals.arm === undefined) delete process.env.FOMO_ENABLE_LIVE_SUBMISSION; else process.env.FOMO_ENABLE_LIVE_SUBMISSION = originals.arm;
  }
})().catch(error => {
  console.error("STEP 9A SIGNING TEST FAILED:", error.message);
  process.exitCode = 1;
});
