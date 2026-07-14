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
const pendingFile = executor.FILES.PENDING_RECONCILIATION_FILE;
const TEST_TOKEN_ADDRESS = "FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6";
const TEST_PAIR_ADDRESS = "Fh2JdK8Lm9NpQr3StUvWxYzAbCdEfGhIjKlMnPqRsTuV";

const originalEnv = {
  signer: process.env.SOLANA_SIGNER_SECRET,
  rpc: process.env.SOLANA_RPC_URL,
  heliusRpc: process.env.HELIUS_RPC_URL,
  heliusApiKey: process.env.HELIUS_API_KEY,
  expected: process.env.EXPECTED_WALLET_PUBLIC_ADDRESS,
  arm: process.env.FOMO_ENABLE_LIVE_SUBMISSION
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resetPendingReconciliationForLiveSubmitTests() {
  fs.writeFileSync(pendingFile, "");
  executor.__r16LivePathTest.clearAllLiveSubmitInFlightForTest();
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
    secretJson: JSON.stringify(secretBytes),
    address: encodeBase58(publicBytes)
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

function signedBytesForHelperTests() {
  const bytes = v0TransactionBytes();
  bytes.set(Uint8Array.from({ length: 64 }, (_, i) => i + 1), 1);
  return bytes;
}

function txSigFromSubmitBody(body) {
  return submissionTest.txSigFromSignedBytes(Uint8Array.from(Buffer.from(body.params[0], "base64")));
}

function baseCfg(overrides = {}) {
  return {
    executionMode: "LIVE",
    dryRunMode: false,
    automationEnabled: true,
    emergencyStop: false,
    walletPublicAddress: "11111111111111111111111111111111",
    positionSizeSol: 0.01,
    maxEntrySlippagePct: 3,
    maxExitSlippagePct: 5,
    maxRoutePriceImpactPct: 10,
    confirmationCommitment: "confirmed",
    confirmationTimeoutMs: 30000,
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
    tokenAddress: TEST_TOKEN_ADDRESS,
    pairAddress: TEST_PAIR_ADDRESS,
    expectedPrice: 0.0001,
    positionSizeSol: 0.01
  };
}

function readRows(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
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

function installPipelineMocks({ returnedTxSig, fillThrows = false, highUsdFill = false, missingFillAttempts = 0, owner = "11111111111111111111111111111111", tokenAddress = TEST_TOKEN_ADDRESS } = {}) {
  quoteTest.setQuoteFetchForTest(async () => ({
    ok: true,
    json: async () => ({
      inputMint: quoteTest.SOL_MINT,
      outputMint: tokenAddress,
      inAmount: "10000000",
      outAmount: "100",
      otherAmountThreshold: "97",
      priceImpactPct: "1",
      slippageBps: 100,
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
  submissionTest.setSubmissionFetchForTest(async (endpoint, opts) => {
    const body = JSON.parse(opts.body);
    assert(body.method === "sendTransaction", "sendTransaction method missing");
    assert(body.params[1].encoding === "base64", "submission encoding not base64");
    assert(body.params[1].skipPreflight === false, "skipPreflight must be false");
    assert(body.params[1].preflightCommitment === "confirmed", "preflight commitment must be confirmed");
    assert(body.params[1].maxRetries === 0, "RPC maxRetries must be 0");
    return { ok: true, status: 200, json: async () => ({ result: returnedTxSig || txSigFromSubmitBody(body) }) };
  });
  submissionTest.setConfirmationFetchForTest(async (endpoint, opts) => {
    const body = JSON.parse(opts.body);
    assert(body.method === "getSignatureStatuses", "confirmation must poll getSignatureStatuses");
    return { ok: true, status: 200, json: async () => ({ result: { value: [{ slot: 222, err: null, confirmationStatus: "confirmed" }] } }) };
  });
  let fillAttempts = 0;
  submissionTest.setFillFetchForTest(async () => {
    fillAttempts++;
    if (fillThrows) throw new Error("mock fill parser failed");
    if (fillAttempts <= missingFillAttempts) {
      return { ok: true, status: 200, json: async () => ({ result: null }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          slot: 333,
          blockTime: 1710000000,
          meta: {
            fee: 5000,
            preBalances: [1000000000],
            postBalances: [990000000],
            preTokenBalances: [],
            postTokenBalances: [{
              owner,
              mint: tokenAddress,
              uiTokenAmount: { amount: "100", uiAmount: 100, uiAmountString: "100" }
            }]
          }
        }
      })
    };
  });
}

function resetMocks() {
  quoteTest.resetQuoteFetchForTest();
  feeTest.resetPriorityFeeFetchForTest();
  buildTest.resetSwapBuildFetchForTest();
  simulationTest.resetSimulationFetchForTest();
  submissionTest.resetSubmissionFetchForTest();
  submissionTest.resetConfirmationFetchForTest();
  submissionTest.resetFillFetchForTest();
  pipeline.resetSignerLoaderForTest();
}

(async () => {
  try {
    executor.__r16LivePathTest.setMicroLiveApprovalGateForTest(() => ({ ok: true }));
    resetPendingReconciliationForLiveSubmitTests();
    delete process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
    delete process.env.HELIUS_RPC_URL;
    delete process.env.HELIUS_API_KEY;
    process.env.SOLANA_RPC_URL = "https://dedicated-rpc.invalid/?api-key=fake-step9b-key";
    process.env.FOMO_ENABLE_LIVE_SUBMISSION = "YES";
    const keypair = makeTestKeypair();
    process.env.SOLANA_SIGNER_SECRET = keypair.secretJson;

    installPipelineMocks({ owner: keypair.address });
    const startRows = readRows(auditFile).length;
    const result = await pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: keypair.address }));
    const rows = readRows(auditFile).slice(startRows);
    const stageRows = rows.filter(row => row.eventType === "EXECUTION_STAGE");
    const stagesSeen = stageRows.map(row => row.stage);
    for (const stage of [stages.SIGNED, stages.SUBMIT, stages.CONFIRMATION, stages.FILL_PARSE]) {
      assert(stagesSeen.includes(stage), `${stage} audit missing`);
    }
    const signedIndex = stageRows.findIndex(row => row.stage === stages.SIGNED);
    const submittedIndex = stageRows.findIndex(row => row.stage === stages.SUBMIT && row.payload?.txSig);
    const confirmedIndex = stageRows.findIndex(row => row.stage === stages.CONFIRMATION && row.payload?.txSig);
    const fillIndex = stageRows.findIndex(row => row.stage === stages.FILL_PARSE && row.payload?.txSig);
    assert(signedIndex < submittedIndex, "SIGNED must precede actual SUBMIT");
    assert(submittedIndex < confirmedIndex, "actual SUBMIT must precede CONFIRMATION");
    assert(confirmedIndex < fillIndex, "CONFIRMATION must precede FILL_PARSE");
    const happySubmitAudit = rows.find(row => row.stage === stages.SUBMIT && row.payload?.tokenAddress === TEST_TOKEN_ADDRESS);
    const happyConfirmationAudit = rows.find(row => row.stage === stages.CONFIRMATION && row.payload?.txSig);
    const happyFillAudit = rows.find(row => row.stage === stages.FILL_PARSE && row.payload?.txSig);
    assert(typeof result.txSig === "string" && result.txSig.length > 32, "returned txSig missing");
    assert(happySubmitAudit.payload.tokenAddress === TEST_TOKEN_ADDRESS, "SUBMIT audit tokenAddress not preserved");
    assert(happySubmitAudit.payload.pairAddress === TEST_PAIR_ADDRESS, "SUBMIT audit pairAddress not preserved");
    assert(!JSON.stringify(happySubmitAudit).includes("[REDACTED_BASE58]"), "SUBMIT audit should not redact public base58 identifiers");
    assert(result.isDryRun === false, "LIVE result must not be dry run");
    assert(result.feeSol === 0.000005, "actual feeSol mismatch");
    assert(result.actualFillPriceSolPerToken === 0.0001, "SOL/token fill mismatch");
    assert(result.filledPrice === null, "USD filledPrice must remain null without USD conversion");
    assert(result.slippagePct === null, "USD slippage must remain null without USD conversion");
    assert(result.filledPriceUnavailable === true, "filledPriceUnavailable must be true without USD conversion");
    assert(result.fillReason === "No USD conversion source defined for on-chain fill.", "fill reason must explain missing USD conversion");

    delete process.env.SOLANA_RPC_URL;
    await expectExecutionError(codes.SUBMIT_FAILED, stages.SUBMIT, () =>
      submissionTest.submitRawTransaction(signedBytesForHelperTests(), baseCfg(), { kind: "BUY" })
    );
    process.env.SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com?api-key=fake-public-key";
    await expectExecutionError(codes.SUBMIT_FAILED, stages.SUBMIT, () =>
      submissionTest.submitRawTransaction(signedBytesForHelperTests(), baseCfg(), { kind: "BUY" })
    );
    process.env.SOLANA_RPC_URL = "https://dedicated-rpc.invalid/?api-key=fake-step9b-key";

    let capturedSubmitBody = null;
    submissionTest.setSubmissionFetchForTest(async (endpoint, opts) => {
      capturedSubmitBody = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ result: txSigFromSubmitBody(capturedSubmitBody) }) };
    });
    const helperSubmit = await submissionTest.submitRawTransaction(signedBytesForHelperTests(), baseCfg(), { kind: "BUY" });
    assert(helperSubmit.txSig === txSigFromSubmitBody(capturedSubmitBody), "helper submit txSig mismatch");
    assert(capturedSubmitBody.method === "sendTransaction", "helper method must be sendTransaction");
    assert(capturedSubmitBody.params[1].encoding === "base64", "helper encoding must be base64");
    assert(capturedSubmitBody.params[1].skipPreflight === false, "helper skipPreflight must be false");
    assert(capturedSubmitBody.params[1].preflightCommitment === "confirmed", "helper preflightCommitment must be confirmed");
    assert(capturedSubmitBody.params[1].maxRetries === 0, "helper maxRetries must be 0");

    submissionTest.setSubmissionFetchForTest(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ result: "MismatchSignature111111111111111111111111111111111111111" })
    }));
    const mismatchError = await expectExecutionError(codes.SUBMIT_FAILED, stages.SUBMIT, () =>
      submissionTest.submitRawTransaction(signedBytesForHelperTests(), baseCfg(), { kind: "BUY" })
    );
    assert(mismatchError.message.includes("does not match signed bytes"), "signature mismatch must fail before confirmation");

    const pendingBeforeSubmitUnknown = readRows(pendingFile).length;
    submissionTest.setSubmissionFetchForTest(async () => { throw new Error("simulated timeout api-key=fake-secret-url"); });
    const unknownError = await expectExecutionError(codes.SUBMISSION_UNKNOWN, stages.SUBMIT, () =>
      submissionTest.submitRawTransaction(signedBytesForHelperTests(), baseCfg(), {
        kind: "BUY",
        tokenAddress: TEST_TOKEN_ADDRESS,
        pairAddress: TEST_PAIR_ADDRESS,
        expectedPrice: 1,
        positionSizeSol: 0.01,
        builtSwap: { metadata: { lastValidBlockHeight: 99 } }
      })
    );
    assert(unknownError.message === "Submission network error", "ambiguous submission safe message changed");
    const submitUnknownRows = readRows(pendingFile).slice(pendingBeforeSubmitUnknown);
    assert(submitUnknownRows.length === 1, "submission unknown reconciliation row missing");
    assert(submitUnknownRows[0].action === "SUBMISSION_UNKNOWN", "submission unknown action mismatch");
    assert(submitUnknownRows[0].txSig && submitUnknownRows[0].txSig.length > 8, "full txSig not preserved for submission unknown");
    assert(submitUnknownRows[0].tokenAddress === TEST_TOKEN_ADDRESS, "submission unknown tokenAddress was not preserved");
    assert(submitUnknownRows[0].pairAddress === TEST_PAIR_ADDRESS, "submission unknown pairAddress was not preserved");
    assert(!JSON.stringify(submitUnknownRows[0]).includes("[REDACTED_BASE58]"), "submission unknown should not redact public base58 identifiers");

    const pendingBeforeConfirmUnknown = readRows(pendingFile).length;
    submissionTest.setConfirmationFetchForTest(async (endpoint, opts) => {
      const body = JSON.parse(opts.body);
      if (body.method === "getBlockHeight") return { ok: true, status: 200, json: async () => ({ result: 12345 }) };
      return { ok: true, status: 200, json: async () => ({ result: { value: [null] } }) };
    });
    const timeoutError = await expectExecutionError(codes.CONFIRMATION_TIMEOUT, stages.CONFIRMATION, () =>
      submissionTest.awaitConfirmation("FullConfirmationTimeoutSignature111111111111111111111111111", baseCfg({ confirmationTimeoutMs: 0 }), {
        kind: "BUY",
        tokenAddress: TEST_TOKEN_ADDRESS,
        pairAddress: TEST_PAIR_ADDRESS,
        expectedPrice: 2,
        positionSizeSol: 0.01,
        submittedAt: "2026-06-16T00:00:00.000Z",
        builtSwap: { metadata: { lastValidBlockHeight: 777 } }
      })
    );
    assert(timeoutError.extra.txSig === "FullConfirmationTimeoutSignature111111111111111111111111111", "full txSig missing from timeout error");
    const confirmUnknownRows = readRows(pendingFile).slice(pendingBeforeConfirmUnknown);
    assert(confirmUnknownRows.length === 1, "confirmation unknown reconciliation row missing");
    assert(confirmUnknownRows[0].action === "CONFIRMATION_UNKNOWN", "confirmation unknown action mismatch");
    assert(confirmUnknownRows[0].txSig === "FullConfirmationTimeoutSignature111111111111111111111111111", "full txSig not preserved for confirmation timeout");
    assert(confirmUnknownRows[0].tokenAddress === TEST_TOKEN_ADDRESS, "confirmation unknown tokenAddress was not preserved");
    assert(confirmUnknownRows[0].pairAddress === TEST_PAIR_ADDRESS, "confirmation unknown pairAddress was not preserved");
    assert(!JSON.stringify(confirmUnknownRows[0]).includes("[REDACTED_BASE58]"), "confirmation unknown should not redact public base58 identifiers");
    assert(confirmUnknownRows[0].currentBlockHeight === 12345, "current block height not captured");

    // Reconciliation helper tests above intentionally leave pending rows; LIVE submit
    // scenarios below require a clean pending queue.
    resetPendingReconciliationForLiveSubmitTests();

    installPipelineMocks({ owner: keypair.address });
    submissionTest.setConfirmationFetchForTest(async () => ({ ok: true, status: 200, json: async () => ({ result: { value: [null] } }) }));
    await expectExecutionError(codes.CONFIRMATION_TIMEOUT, stages.CONFIRMATION, () =>
      pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: keypair.address, confirmationTimeoutMs: 0 }))
    );

    resetPendingReconciliationForLiveSubmitTests();
    installPipelineMocks({ owner: keypair.address });
    submissionTest.setConfirmationFetchForTest(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ result: { value: [{ slot: 444, err: { InstructionError: [1, "Custom"] }, confirmationStatus: "confirmed" }] } })
    }));
    const failedError = await expectExecutionError(codes.CONFIRMATION_FAILED, stages.CONFIRMATION, () =>
      pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: keypair.address }))
    );
    assert(typeof failedError.extra.txSig === "string" && failedError.extra.txSig.length === 8, "confirmation failed txSig must be truncated in audit/error metadata");

    resetPendingReconciliationForLiveSubmitTests();
    installPipelineMocks({ fillThrows: true, owner: keypair.address });
    await expectExecutionError(codes.FILL_PARSE_FAILED, stages.FILL_PARSE, () =>
      pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: keypair.address }))
    );

    resetPendingReconciliationForLiveSubmitTests();
    let fillRetryAttempts = 0;
    installPipelineMocks({ missingFillAttempts: 2, owner: keypair.address });
    submissionTest.setFillFetchForTest(async () => {
      fillRetryAttempts++;
      if (fillRetryAttempts < 3) return { ok: true, status: 200, json: async () => ({ result: null }) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: {
            slot: 334,
            blockTime: 1710000001,
            meta: {
              fee: 5000,
              preBalances: [1000000000],
              postBalances: [990000000],
              preTokenBalances: [],
              postTokenBalances: [{
                owner: keypair.address,
                mint: TEST_TOKEN_ADDRESS,
                uiTokenAmount: { amount: "100", uiAmount: 100, uiAmountString: "100" }
              }]
            }
          }
        })
      };
    });
    const retryFill = await pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: keypair.address }));
    assert(fillRetryAttempts === 3, "fill parser must retry getTransaction for indexing lag");
    assert(retryFill.actualFillPriceSolPerToken === 0.0001, "retry fill price mismatch");

    resetPendingReconciliationForLiveSubmitTests();
    installPipelineMocks({ highUsdFill: true, owner: keypair.address });
    const noBlock = await pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: keypair.address }));
    assert(typeof noBlock.txSig === "string" && noBlock.txSig.length > 32, "post-fill slippage path should return landed tx");
    assert(noBlock.actualFillPriceUsdPerToken === null, "post-fill USD price must remain unavailable without conversion source");
    assert(noBlock.slippagePct === null, "post-fill USD slippage must remain unavailable without conversion source");

    const beforeDry = readRows(auditFile).length;
    const dry = await pipeline.submitSwapForTest("BUY", swapArgs({ executionMode: "DRY_RUN", dryRunMode: true, automationEnabled: true }));
    const dryRows = readRows(auditFile).slice(beforeDry);
    assert(dry.isDryRun === true && dry.txSig === null, "DRY_RUN changed");
    assert(!dryRows.some(row => [stages.SUBMIT, stages.CONFIRMATION, stages.FILL_PARSE].includes(row.stage)), "DRY_RUN emitted live submission stages");

    installPipelineMocks();
    const beforePipeline = readRows(auditFile).length;
    const pipelineResult = await pipeline.submitSwapForTest("BUY", swapArgs({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      walletPublicAddress: keypair.address
    }));
    const pipelineRows = readRows(auditFile).slice(beforePipeline);
    assert(pipelineResult.isPipelineDryRun === true, "PIPELINE_DRY_RUN changed");
    assert(!pipelineRows.some(row => [stages.SUBMIT, stages.CONFIRMATION, stages.FILL_PARSE].includes(row.stage)), "PIPELINE_DRY_RUN emitted live submission stages");

    delete process.env.SOLANA_SIGNER_SECRET;
    await expectExecutionError(codes.REAL_PATH_DISABLED, stages.GUARD, () =>
      pipeline.submitSwapForTest("BUY", swapArgs({ executionMode: "LIVE", dryRunMode: true, walletPublicAddress: keypair.address }))
    );

    const source = fs.readFileSync(require.resolve("./live_executor"), "utf8");
    const sendMatches = source.match(/sendTransaction/g) || [];
    assert(sendMatches.length === 1, `sendTransaction must appear exactly once in live_executor.js, found ${sendMatches.length}`);
    const submitHelperIndex = source.indexOf("async function submitRawTransaction");
    const sendIndex = source.indexOf('method: "sendTransaction"');
    assert(submitHelperIndex !== -1 && sendIndex > submitHelperIndex, "sendTransaction call must be inside submitRawTransaction");
    assert(source.includes("json.result !== txSig"), "submitRawTransaction must verify returned signature equals signed bytes");
    assert(source.includes("const pollTimeoutMs = Math.min(10000, remainingMs);"), "confirmation poll timeout must be capped by remaining budget");
    assert(source.includes("Could not derive fill price from transaction meta after retries"), "fill parser must fail only after bounded getTransaction retries");
    assert(source.includes("Post-fill USD slippage is diagnostic only"), "post-fill USD slippage comment missing");
    assert(!source.includes("sendRawTransaction("), "sendRawTransaction( method call must not exist");
    assert(!source.includes("partialSign("), "partialSign must not exist");

    console.log("STEP 9B SUBMISSION TEST PASSED");
    console.log("HAPPY_PATH_RESULT:");
    console.log(JSON.stringify(result));
    console.log("HAPPY_PATH_SUBMIT_AUDIT:");
    console.log(JSON.stringify(happySubmitAudit));
    console.log("HAPPY_PATH_CONFIRMATION_AUDIT:");
    console.log(JSON.stringify(happyConfirmationAudit));
    console.log("HAPPY_PATH_FILL_PARSE_AUDIT:");
    console.log(JSON.stringify(happyFillAudit));
  } finally {
    executor.__r16LivePathTest.resetMicroLiveApprovalGateForTest();
    resetMocks();
    if (originalEnv.signer === undefined) delete process.env.SOLANA_SIGNER_SECRET; else process.env.SOLANA_SIGNER_SECRET = originalEnv.signer;
    if (originalEnv.rpc === undefined) delete process.env.SOLANA_RPC_URL; else process.env.SOLANA_RPC_URL = originalEnv.rpc;
    if (originalEnv.heliusRpc === undefined) delete process.env.HELIUS_RPC_URL; else process.env.HELIUS_RPC_URL = originalEnv.heliusRpc;
    if (originalEnv.heliusApiKey === undefined) delete process.env.HELIUS_API_KEY; else process.env.HELIUS_API_KEY = originalEnv.heliusApiKey;
    if (originalEnv.expected === undefined) delete process.env.EXPECTED_WALLET_PUBLIC_ADDRESS; else process.env.EXPECTED_WALLET_PUBLIC_ADDRESS = originalEnv.expected;
    if (originalEnv.arm === undefined) delete process.env.FOMO_ENABLE_LIVE_SUBMISSION; else process.env.FOMO_ENABLE_LIVE_SUBMISSION = originalEnv.arm;
  }
})().catch(error => {
  console.error("STEP 9B SUBMISSION TEST FAILED");
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
