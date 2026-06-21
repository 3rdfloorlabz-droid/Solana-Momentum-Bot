"use strict";

const fs = require("fs");
const executor = require("./live_executor");

const test = executor.__priorityFeeTest;
const codes = executor.__executionLoggingTest.EXECUTION_ABORT_CODES;
const originalApiKey = process.env.HELIUS_API_KEY;
const originalHeliusRpc = process.env.HELIUS_RPC_URL;
const originalSolanaRpc = process.env.SOLANA_RPC_URL;
const cfg = {
  priorityFeeMode: "dynamic_helius",
  maxPriorityFeeLamports: 1000000,
  fallbackPriorityFeeLamports: 200000,
  assumedComputeUnitLimit: 300000
};
const fakeApiKey = "fake-step6-helius-api-key";
const fakeRpcUrl = `https://mainnet.helius-rpc.com/?api-key=${fakeApiKey}`;
let providerCalls = 0;
let transactionCalls = 0;

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

function mockResult(result) {
  test.setPriorityFeeFetchForTest(async () => {
    providerCalls += 1;
    return { ok: true, json: async () => ({ result }) };
  });
}

(async () => {
  try {
    process.env.HELIUS_API_KEY = fakeApiKey;
    delete process.env.HELIUS_RPC_URL;
    delete process.env.SOLANA_RPC_URL;

    mockResult({ totalPriorityFeeLamports: 300000 });
    const belowCap = await test.resolvePriorityFee(cfg);
    assert(belowCap.appliedPriorityFeeLamports === 300000 && belowCap.clamped === false && belowCap.fallbackUsed === false, "below-cap total estimate incorrect");

    mockResult({ totalPriorityFeeLamports: 1500000 });
    const aboveCap = await test.resolvePriorityFee(cfg);
    assert(aboveCap.appliedPriorityFeeLamports === 1000000 && aboveCap.clamped === true, "above-cap total estimate was not clamped");

    mockResult({ totalPriorityFeeLamports: 1000000.4 });
    const roundsToCap = await test.resolvePriorityFee(cfg);
    assert(roundsToCap.appliedPriorityFeeLamports === 1000000 && roundsToCap.clamped === false, "candidate rounding to cap falsely logged clamped");

    mockResult({ totalPriorityFeeLamports: 1000000.6 });
    const roundsAboveCap = await test.resolvePriorityFee(cfg);
    assert(roundsAboveCap.appliedPriorityFeeLamports === 1000000 && roundsAboveCap.clamped === true, "rounded value above cap did not log clamped");

    mockResult({ priorityFeeEstimate: 1000000 });
    const converted = await test.resolvePriorityFee(cfg);
    assert(converted.totalEstimatedLamports === 300000 && converted.assumedComputeUnitLimit === 300000, "micro-lamports-per-CU estimate conversion incorrect");

    mockResult({ priorityFeeEstimate: 10000000 });
    const convertedClamped = await test.resolvePriorityFee(cfg);
    assert(convertedClamped.totalEstimatedLamports === 3000000 && convertedClamped.appliedPriorityFeeLamports === 1000000 && convertedClamped.clamped === true, "converted estimate was not clamped");

    mockResult({ priorityFeeEstimate: "malformed" });
    const malformed = await test.resolvePriorityFee(cfg);
    assert(malformed.appliedPriorityFeeLamports === 200000 && malformed.fallbackUsed === true, "malformed estimate did not use fallback");

    mockResult({ totalPriorityFeeLamports: 0 });
    const zeroTotal = await test.resolvePriorityFee(cfg);
    assert(zeroTotal.appliedPriorityFeeLamports === 200000 && zeroTotal.fallbackUsed === true, "zero total estimate did not use fallback");

    mockResult({ priorityFeeEstimate: 0 });
    const zeroPerCu = await test.resolvePriorityFee(cfg);
    assert(zeroPerCu.appliedPriorityFeeLamports === 200000 && zeroPerCu.fallbackUsed === true, "zero per-CU estimate did not use fallback");

    mockResult({ totalPriorityFeeLamports: 0 });
    await expectCode(codes.PRIORITY_FEE_UNAVAILABLE, () =>
      test.resolvePriorityFee({ ...cfg, fallbackPriorityFeeLamports: null })
    );

    test.setPriorityFeeFetchForTest(async () => {
      providerCalls += 1;
      throw new Error(`provider failed at ${fakeRpcUrl}`);
    });
    const providerError = await test.resolvePriorityFee(cfg);
    assert(providerError.appliedPriorityFeeLamports === 200000 && providerError.fallbackUsed === true, "provider error did not use fallback");

    test.setPriorityFeeFetchForTest(async (_url, options) => {
      providerCalls += 1;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("timed out");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    const timedOut = await test.resolvePriorityFee(cfg, { timeoutMs: 5 });
    assert(timedOut.fallbackUsed === true && timedOut.rawEstimateShape === "timeout", "timeout did not use fallback");

    await expectCode(codes.PRIORITY_FEE_UNAVAILABLE, () =>
      test.resolvePriorityFee({ ...cfg, fallbackPriorityFeeLamports: null })
    );
    await expectCode(codes.PRIORITY_FEE_UNAVAILABLE, () =>
      test.resolvePriorityFee({ ...cfg, priorityFeeMode: "unsupported" })
    );

    const auditText = fs.readFileSync(executor.FILES.EXECUTION_AUDIT_FILE, "utf8");
    assert(!auditText.includes(fakeApiKey), "audit log contains API key");
    assert(!auditText.includes(fakeRpcUrl), "audit log contains RPC URL");
    const errorText = fs.readFileSync(executor.FILES.ERRORS_FILE, "utf8");
    assert(!errorText.includes(fakeApiKey), "error log contains API key");
    assert(!errorText.includes(fakeRpcUrl), "error log contains RPC URL");
    assert(errorText.includes("[REDACTED]"), "provider error URL did not pass through redaction path");
    const auditRows = auditText.split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(row => row.stage === "PRIORITY_FEE");
    assert(auditRows.some(row => row.payload?.fallbackUsed === true), "fallbackUsed=true was not logged");
    assert(auditRows.some(row => row.payload?.clamped === true), "clamped=true was not logged");
    assert(transactionCalls === 0, "transaction/simulation/submission method called");
    assert(!Object.keys(test).some(key => /transaction|simulate|sign/i.test(key)), "transaction capability exposed");

    console.log("PRIORITY FEE TEST PASSED");
    console.log(`Provider calls: ${providerCalls}; transaction/simulation/signing/submission calls: 0`);
  } finally {
    test.resetPriorityFeeFetchForTest();
    if (originalApiKey === undefined) delete process.env.HELIUS_API_KEY;
    else process.env.HELIUS_API_KEY = originalApiKey;
    if (originalHeliusRpc === undefined) delete process.env.HELIUS_RPC_URL;
    else process.env.HELIUS_RPC_URL = originalHeliusRpc;
    if (originalSolanaRpc === undefined) delete process.env.SOLANA_RPC_URL;
    else process.env.SOLANA_RPC_URL = originalSolanaRpc;
  }
})().catch(error => {
  console.error("PRIORITY FEE TEST FAILED:", error.message);
  process.exitCode = 1;
});
