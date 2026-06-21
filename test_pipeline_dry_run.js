"use strict";

const fs = require("fs");
const crypto = require("crypto");
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

function assert(condition, message) { if (!condition) throw new Error(message); }

function encodeBase58(bytes) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let result = "";
  while (value > 0n) { result = alphabet[Number(value % 58n)] + result; value /= 58n; }
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  return "1".repeat(zeros) + (result || (zeros ? "" : "1"));
}

function testKeypair() {
  const pair = crypto.generateKeyPairSync("ed25519");
  const seed = Buffer.from(pair.privateKey.export({ format: "der", type: "pkcs8" })).subarray(-32);
  const pub = Buffer.from(pair.publicKey.export({ format: "der", type: "spki" })).subarray(-32);
  return { secret: JSON.stringify([...seed, ...pub]), address: encodeBase58(pub) };
}

function v0Transaction() {
  return Buffer.from([1, ...new Array(64).fill(0), 0x80, 1, 0, 0, 1,
    ...new Array(32).fill(0), ...new Array(32).fill(0), 1, 0, 0, 0]).toString("base64");
}

function args(cfg) {
  return {
    cfg: {
      dryRunMode: true,
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
    pairAddress: "pipeline-pair",
    expectedPrice: 2,
    positionSizeSol: 0.1,
  };
}

function installMocks() {
  quoteTest.setQuoteFetchForTest(async () => ({ ok: true, json: async () => ({
    inputMint: quoteTest.SOL_MINT,
    outputMint: "11111111111111111111111111111111",
    inAmount: "100000000",
    outAmount: "50000000",
    otherAmountThreshold: "48500000",
    priceImpactPct: "1",
    slippageBps: 300,
    routePlan: [{ swapInfo: { label: "MOCK" }, percent: 100 }]
  }) }));
  feeTest.setPriorityFeeFetchForTest(async () => ({ ok: true, json: async () => ({ result: { totalPriorityFeeLamports: 250000 } }) }));
  buildTest.setSwapBuildFetchForTest(async () => ({ ok: true, json: async () => ({
    swapTransaction: v0Transaction(), lastValidBlockHeight: 321, prioritizationFeeLamports: 250000
  }) }));
  simulationTest.setSimulationFetchForTest(async () => ({ ok: true, json: async () => ({
    result: { context: { slot: 99 }, value: { err: null, logs: ["Program success"], unitsConsumed: 180000 } }
  }) }));
}

async function expectCode(code, fn) {
  try { await fn(); } catch (error) {
    assert(error.code === code, `expected ${code}, received ${error.code || error.name}`);
    return;
  }
  throw new Error(`expected ${code}, but call succeeded`);
}

(async () => {
  try {
    assert(pipeline.resolveExecutionMode({ dryRunMode: true }) === "DRY_RUN", "legacy true precedence failed");
    assert(pipeline.resolveExecutionMode({ dryRunMode: false }) === "LIVE", "legacy false precedence failed");
    assert(pipeline.resolveExecutionMode({ dryRunMode: true, executionMode: "PIPELINE_DRY_RUN" }) === "PIPELINE_DRY_RUN", "explicit mode precedence failed");
    assert(pipeline.isAnyDryRun({ executionMode: "DRY_RUN" }), "DRY_RUN dry semantics failed");
    assert(pipeline.isAnyDryRun({ executionMode: "PIPELINE_DRY_RUN" }), "PIPELINE_DRY_RUN dry semantics failed");
    assert(!pipeline.isAnyDryRun({ executionMode: "LIVE" }), "LIVE dry semantics failed");

    const beforeDry = fs.existsSync(auditFile) ? fs.statSync(auditFile).size : 0;
    const dry = await pipeline.submitSwapForTest("BUY", args({ executionMode: "DRY_RUN" }));
    const afterDry = fs.existsSync(auditFile) ? fs.statSync(auditFile).size : 0;
    assert(afterDry === beforeDry, "plain DRY_RUN emitted pipeline audit");
    assert(JSON.stringify(dry) === JSON.stringify({
      txSig: null, filledPrice: 2, slippagePct: 0, feeSol: 0, latencyMs: 0, isDryRun: true,
      intent: { kind: "BUY", tokenAddress: "11111111111111111111111111111111", pairAddress: "pipeline-pair", expectedPrice: 2, positionSizeSol: 0.1 },
      note: "DRY_RUN — transaction intent generated, nothing submitted."
    }), "plain DRY_RUN behavior changed");

    const kp = testKeypair();
    process.env.SOLANA_RPC_URL = "https://dedicated-rpc.invalid/?api-key=fake-pipeline-key";
    delete process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
    signerGuardTest.resetSignerLoadCount();
    let signerLoaderCalls = 0;
    pipeline.setSignerLoaderForTest(() => {
      signerLoaderCalls += 1;
      throw new Error("PIPELINE_DRY_RUN must not load a real signer");
    });
    installMocks();
    const startLines = fs.readFileSync(auditFile, "utf8").split(/\r?\n/).filter(Boolean).length;
    const result = await pipeline.submitSwapForTest("BUY", args({ executionMode: "PIPELINE_DRY_RUN", walletPublicAddress: kp.address }));
    assert(signerLoaderCalls === 0, "PIPELINE_DRY_RUN unexpectedly loaded the real signer");
    assert(signerGuardTest.getSignerLoadCount() === 0, "PIPELINE_DRY_RUN touched the signer guard");
    assert(result.txSig === null && result.isDryRun === true && result.isPipelineDryRun === true, "pipeline dry-run shape invalid");
    assert(result.filledPrice === null && result.slippagePct === null && result.filledPriceUnavailable === true, "unavailable fill/slippage contract invalid");
    assert(result.reason === "Approach A: raw ratio only, no USD/token basis available", "unavailable fill reason missing");
    assert(result.pipelineMetadata.rawOutputPerInput === 0.5, "raw quote ratio contract invalid");
    assert(result.pipelineMetadata.quotedSlippageBps === 300, "quoted slippage BPS missing");
    assert(result.pipelineMetadata.fillDerivationReason === result.reason, "fill derivation reason mismatch");
    assert(result.feeSol === 0.000255 && result.pipelineMetadata.simulationSuccess === true, "pipeline fee/metadata invalid");
    assert(result.pipelineMetadata.feeBreakdown.baseFeeLamports === 5000, "base fee estimate missing");
    assert(result.pipelineMetadata.feeBreakdown.priorityFeeLamports === 250000, "priority fee breakdown missing");
    assert(result.pipelineMetadata.feeBreakdown.totalLamports === 255000, "total fee breakdown incorrect");
    assert(result.pipelineMetadata.feeBreakdown.ataRentAccounted === true, "simulation logs must be inspected for ATA creation");
    assert(result.pipelineMetadata.feeBreakdown.ataDetectionMethod === "simulation_logs_scan", "ATA detection method incorrect");
    const rows = fs.readFileSync(auditFile, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse).slice(startLines);
    const stages = rows.filter(row => row.eventType === "EXECUTION_STAGE").map(row => row.stage);
    for (const stage of ["QUOTE", "ROUTE_VALIDATION", "PRIORITY_FEE", "TX_BUILD", "SIMULATION", "PIPELINE_DRY_RUN"]) {
      assert(stages.includes(stage), `pipeline stage missing: ${stage}`);
    }
    let stageCursor = -1;
    for (const stage of ["QUOTE", "ROUTE_VALIDATION", "PRIORITY_FEE", "TX_BUILD", "SIMULATION", "PIPELINE_DRY_RUN"]) {
      const next = stages.indexOf(stage, stageCursor + 1);
      assert(next !== -1, `pipeline stage ordering invalid; missing ordered ${stage}`);
      stageCursor = next;
    }
    const pipelineAudit = rows.find(row => row.stage === "PIPELINE_DRY_RUN");
    assert(pipelineAudit.payload.derivedFilledPrice === null && pipelineAudit.payload.derivedSlippagePct === null, "audit fabricated fill/slippage");
    assert(pipelineAudit.payload.filledPriceUnavailable === true, "audit unavailable-fill marker missing");
    assert(pipelineAudit.payload.rawOutputPerInput === 0.5 && pipelineAudit.payload.quotedSlippageBps === 300, "audit Approach A fields invalid");
    assert(pipelineAudit.payload.fillDerivationReason === result.reason, "audit fill reason mismatch");
    assert(!JSON.stringify(rows).includes("fake-pipeline-key"), "pipeline audit leaked API key");

    const resultArgs = {
      kind: "BUY",
      quote: { inAmount: "100000000", outAmount: "50000000", slippageBps: 300 },
      priorityFee: { appliedPriorityFeeLamports: 250000, clamped: false, fallbackUsed: false },
      builtSwap: { metadata: { quoteHash: "fee-test", signatureCount: 1, lastValidBlockHeight: 321 } },
      args: { tokenAddress: "11111111111111111111111111111111", pairAddress: "pipeline-pair", expectedPrice: 2, positionSizeSol: 0.1 },
      pipelineStartedAt: Date.now()
    };
    const ataResult = pipeline.buildPipelineDryRunResult({
      ...resultArgs,
      simulation: { success: true, logs: ["Program log: Create Associated Token Account"], unitsConsumed: 180000, cuHeadroomVsAssumed: 0.4 }
    });
    assert(ataResult.pipelineMetadata.feeBreakdown.ataRentLamports === 2039280, "ATA rent was not included when detected");
    assert(ataResult.feeSol === (5000 + 250000 + 2039280) / 1e9, "ATA-inclusive fee total incorrect");

    const noLogsResult = pipeline.buildPipelineDryRunResult({
      ...resultArgs,
      simulation: { success: true, unitsConsumed: 180000, cuHeadroomVsAssumed: 0.4 }
    });
    assert(noLogsResult.pipelineMetadata.feeBreakdown.ataRentAccounted === false, "missing logs must leave ATA rent unaccounted");
    assert(noLogsResult.pipelineMetadata.feeBreakdown.ataDetectionMethod === "none", "missing-log ATA method incorrect");

    pipeline.resetSignerLoaderForTest();
    await expectCode(codes.REAL_PATH_DISABLED, () =>
      pipeline.submitSwapForTest("BUY", args({ executionMode: "LIVE", dryRunMode: true, walletPublicAddress: kp.address }))
    );

    delete process.env.SOLANA_RPC_URL;
    delete process.env.HELIUS_RPC_URL;
    delete process.env.HELIUS_API_KEY;
    await expectCode(codes.PRIORITY_FEE_UNAVAILABLE, () =>
      pipeline.submitSwapForTest("BUY", args({ executionMode: "PIPELINE_DRY_RUN", walletPublicAddress: kp.address }))
    );

    const source = fs.readFileSync(require.resolve("./live_executor"), "utf8");
    for (const forbidden of ["sendTransaction(", "sendRawTransaction(", "signTransaction(", "partialSign(", "addSignature(", "keypair.sign(", "nacl.sign("]) {
      assert(!source.includes(forbidden), `forbidden capability exists: ${forbidden}`);
    }
    const signerSignMatches = [...source.matchAll(/signer\.sign\(/g)];
    assert(signerSignMatches.length === 1, `expected exactly one signer.sign( call site, found ${signerSignMatches.length}`);
    const submitSwapMatch = source.match(/async function submitSwap[\s\S]*?\n}\n\n\/\/ ─── Pre-trade abort checks/);
    assert(submitSwapMatch && submitSwapMatch[0].includes("signature = signer.sign(messageBytes)"), "signer.sign( is not inside submitSwap LIVE terminus");
    assert(submitSwapMatch[0].includes('if (mode === "PIPELINE_DRY_RUN")') &&
      submitSwapMatch[0].indexOf("signature = signer.sign(messageBytes)") >
      submitSwapMatch[0].indexOf('if (mode === "PIPELINE_DRY_RUN")'), "signer.sign( appears before PIPELINE_DRY_RUN return");
    assert(source.includes("sign: { get() { throw new Error(\"PIPELINE_DRY_RUN signer is identity-only and cannot sign.\"); } }"),
      "PIPELINE_DRY_RUN identity-only signer sign getter is not preserved");
    console.log("PIPELINE_DRY_RUN HAPPY-PATH RETURN:");
    console.log(JSON.stringify(result));
    console.log("PIPELINE_DRY_RUN HAPPY-PATH AUDIT:");
    console.log(JSON.stringify(pipelineAudit));
    console.log("PIPELINE DRY RUN TEST PASSED");
    console.log("Full mocked Steps 4-8 executed; signing/submission calls: 0");
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
  console.error("PIPELINE DRY RUN TEST FAILED:", error.message);
  process.exitCode = 1;
});
