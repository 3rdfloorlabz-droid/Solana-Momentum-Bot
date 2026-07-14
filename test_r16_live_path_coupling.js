"use strict";
// R16 submit → confirm → position-write coupling (mocked/fixture only).

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "r16-live-path-"));
process.env.TRACKTA_RUNTIME_ROOT = TEMP_ROOT;

const ORIGINAL_ENV = {
  signer: undefined,
  rpc: undefined,
  arm: undefined,
  expected: undefined
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function encodeBase58(bytes) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
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
  const pair = crypto.generateKeyPairSync("ed25519");
  const seed = Buffer.from(pair.privateKey.export({ format: "der", type: "pkcs8" })).subarray(-32);
  const publicBytes = Buffer.from(pair.publicKey.export({ format: "der", type: "spki" })).subarray(-32);
  const secretBytes = [...seed, ...publicBytes];
  return {
    secretBytes,
    secretJson: JSON.stringify(secretBytes),
    address: encodeBase58(publicBytes)
  };
}

function v0TransactionBase64() {
  return Buffer.from(Uint8Array.from([
    1, ...new Array(64).fill(0), 0x80, 1, 0, 0, 1,
    ...new Array(32).fill(0), ...new Array(32).fill(0), 1, 0, 0, 0
  ])).toString("base64");
}

function baseCfg(overrides = {}) {
  return {
    executionMode: "LIVE",
    dryRunMode: false,
    automationEnabled: true,
    emergencyStop: false,
    walletPublicAddress: "11111111111111111111111111111111",
    positionSizeSol: 0.01,
    maxEntrySlippagePct: 1,
    maxExitSlippagePct: 1,
    maxRoutePriceImpactPct: 2,
    confirmationCommitment: "confirmed",
    confirmationTimeoutMs: 30000,
    priorityFeeMode: "dynamic_helius",
    maxPriorityFeeLamports: 1000000,
    fallbackPriorityFeeLamports: 200000,
    assumedComputeUnitLimit: 300000,
    minPoolLiquidityUsd: 25000,
    ...overrides
  };
}

function swapArgs(cfgOverrides = {}, extra = {}) {
  return {
    cfg: baseCfg(cfgOverrides),
    tokenAddress: "11111111111111111111111111111111",
    pairAddress: "r16-pair",
    expectedPrice: 0.0001,
    positionSizeSol: 0.01,
    poolLiquidityUsd: 30000,
    ...extra
  };
}

function readRows(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function readPositions() {
  return JSON.parse(fs.readFileSync(path.join(TEMP_ROOT, "live_positions.json"), "utf8"));
}

async function expectCode(code, fn) {
  try {
    await fn();
  } catch (error) {
    if (error.code === code) return error;
    throw new Error(`expected ${code}, got ${error.code || error.message}`);
  }
  throw new Error(`expected ${code}, but call succeeded`);
}

function seedRuntime(walletAddress, overrides = {}) {
  fs.writeFileSync(path.join(TEMP_ROOT, "live_config.json"), `${JSON.stringify({
    executionMode: "PIPELINE_DRY_RUN",
    dryRunMode: true,
    automationEnabled: true,
    emergencyStop: false,
    walletPublicAddress: walletAddress,
    positionSizeSol: 0.01,
    maxEntrySlippagePct: 1,
    maxExitSlippagePct: 1,
    priorityFeeMode: "dynamic_helius",
    maxPriorityFeeLamports: 1000000,
    fallbackPriorityFeeLamports: 200000,
    assumedComputeUnitLimit: 300000,
    maxOpenTrades: 1,
    ...overrides
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(TEMP_ROOT, "live_positions.json"), "[]\n");
  fs.writeFileSync(path.join(TEMP_ROOT, "live_trades.jsonl"), "");
  fs.writeFileSync(path.join(TEMP_ROOT, "pending_reconciliation.jsonl"), "");
  fs.writeFileSync(path.join(TEMP_ROOT, "execution_audit.jsonl"), "");
}

function installLiveMocks(kp, opts = {}) {
  const quoteTest = executor.__jupiterQuoteTest;
  const feeTest = executor.__priorityFeeTest;
  const buildTest = executor.__txBuildTest;
  const simulationTest = executor.__simulationTest;
  const submissionTest = executor.__submissionTest;

  quoteTest.setQuoteFetchForTest(async (url) => {
    if (opts.slowQuoteMs) await new Promise(r => setTimeout(r, opts.slowQuoteMs));
    const isSell = opts.quoteKind === "SELL";
    if (typeof opts.onQuoteAmount === "function" && url) {
      opts.onQuoteAmount(new URL(url).searchParams.get("amount"));
    }
    return {
      ok: true,
      json: async () => ({
        inputMint: isSell ? "11111111111111111111111111111111" : quoteTest.SOL_MINT,
        outputMint: isSell ? quoteTest.SOL_MINT : "11111111111111111111111111111111",
        inAmount: isSell ? String(opts.sellAmountTokenUnits || 100) : "10000000",
        outAmount: isSell ? "9900000" : "100",
        otherAmountThreshold: isSell ? "9800000" : "97",
        priceImpactPct: "1",
        slippageBps: 100,
        routePlan: [{ swapInfo: { label: "MOCK" }, percent: 100 }],
        _fetchedAtMs: Date.now()
      })
    };
  });
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
      result: { context: { slot: 99 }, value: { err: null, logs: ["ok"], unitsConsumed: 100000 } }
    })
  }));

  if (opts.submissionThrow) {
    submissionTest.setSubmissionFetchForTest(async () => { throw new Error("simulated submission timeout"); });
  } else {
    submissionTest.setSubmissionFetchForTest(async (endpoint, req) => {
      const body = JSON.parse(req.body);
      const bytes = Uint8Array.from(Buffer.from(body.params[0], "base64"));
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: submissionTest.txSigFromSignedBytes(bytes) })
      };
    });
  }

  if (opts.confirmNever) {
    submissionTest.setConfirmationFetchForTest(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ result: { value: [null] } })
    }));
  } else {
    submissionTest.setConfirmationFetchForTest(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        result: { value: [{ slot: 222, err: null, confirmationStatus: "confirmed" }] }
      })
    }));
  }

  submissionTest.setFillFetchForTest(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      result: {
        slot: 333,
        blockTime: 1710000000,
        meta: {
          fee: 5000,
          preBalances: [1000000000],
          postBalances: opts.quoteKind === "SELL" ? [1009900000] : [990000000],
          preTokenBalances: opts.quoteKind === "SELL" ? [{
            owner: kp.address,
            mint: "11111111111111111111111111111111",
            uiTokenAmount: {
              amount: String(opts.sellAmountTokenUnits || 100),
              uiAmount: opts.sellAmountTokenUnits || 100,
              uiAmountString: String(opts.sellAmountTokenUnits || 100)
            }
          }] : [],
          postTokenBalances: opts.quoteKind === "SELL" ? [{
            owner: kp.address,
            mint: "11111111111111111111111111111111",
            uiTokenAmount: { amount: "0", uiAmount: 0, uiAmountString: "0" }
          }] : [{
            owner: kp.address,
            mint: "11111111111111111111111111111111",
            uiTokenAmount: { amount: "100", uiAmount: 100, uiAmountString: "100" }
          }]
        }
      }
    })
  }));
}

function resetMocks() {
  executor.__jupiterQuoteTest.resetQuoteFetchForTest();
  executor.__priorityFeeTest.resetPriorityFeeFetchForTest();
  executor.__txBuildTest.resetSwapBuildFetchForTest();
  executor.__simulationTest.resetSimulationFetchForTest();
  executor.__submissionTest.resetSubmissionFetchForTest();
  executor.__submissionTest.resetConfirmationFetchForTest();
  executor.__submissionTest.resetFillFetchForTest();
  executor.__r16LivePathTest.resetSignerLoaderForTest();
  executor.__r16LivePathTest.resetMicroLiveApprovalGateForTest();
  executor.__r16LivePathTest.resetApprovalRecordProviderForTest();
  executor.__r16LivePathTest.resetCapitalExposureProviderForTest();
  executor.__r16LivePathTest.resetWritePositionsForTest();
  executor.__r16LivePathTest.resetWalletBalanceForTest();
  executor.__r16LivePathTest.clearAllLiveSubmitInFlightForTest();
  executor.__r16LivePathTest.setMicroLiveApprovalGateForTest(() => ({ ok: true }));
  fs.writeFileSync(path.join(TEMP_ROOT, "pending_reconciliation.jsonl"), "");
}

function armLiveEnv(kp) {
  process.env.SOLANA_RPC_URL = "https://dedicated-rpc.r16.invalid/?api-key=fake-r16-key";
  process.env.FOMO_ENABLE_LIVE_SUBMISSION = "YES";
  process.env.SOLANA_SIGNER_SECRET = kp.secretJson;
  // live_executor loads repo .env on require; align expected wallet with fixture keypair.
  process.env.EXPECTED_WALLET_PUBLIC_ADDRESS = kp.address;
}

function clearLiveEnv() {
  delete process.env.SOLANA_SIGNER_SECRET;
  delete process.env.SOLANA_RPC_URL;
  delete process.env.FOMO_ENABLE_LIVE_SUBMISSION;
  if (ORIGINAL_ENV.expected === undefined) delete process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
  else process.env.EXPECTED_WALLET_PUBLIC_ADDRESS = ORIGINAL_ENV.expected;
}

function mockSigner(kp) {
  return {
    publicKey: { toBase58: () => kp.address },
    sign(messageBytes) {
      const privateKeyObj = crypto.createPrivateKey({
        key: Buffer.concat([
          Buffer.from("302e020100300506032b657004220420", "hex"),
          Buffer.from(kp.secretBytes.slice(0, 32))
        ]),
        format: "der",
        type: "pkcs8"
      });
      return new Uint8Array(crypto.sign(null, Buffer.from(messageBytes), privateKeyObj));
    }
  };
}

let executor;
const r16 = () => executor.__r16LivePathTest;
const codes = () => executor.__executionLoggingTest.EXECUTION_ABORT_CODES;

async function runTests() {
  const kp = makeTestKeypair();
  seedRuntime(kp.address);
  executor = require("./live_executor");
  ORIGINAL_ENV.signer = process.env.SOLANA_SIGNER_SECRET;
  ORIGINAL_ENV.rpc = process.env.SOLANA_RPC_URL;
  ORIGINAL_ENV.arm = process.env.FOMO_ENABLE_LIVE_SUBMISSION;
  ORIGINAL_ENV.expected = process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
  r16().setMicroLiveApprovalGateForTest(() => ({ ok: true }));

  const pipeline = executor.__pipelineDryRunTest;
  const pendingFile = executor.FILES.PENDING_RECONCILIATION_FILE;
  const auditFile = executor.FILES.EXECUTION_AUDIT_FILE;
  const liveTradesFile = executor.FILES.LIVE_TRADES_FILE;
  const results = [];

  function pass(id, detail = "") {
    results.push({ id, pass: true, detail });
  }

  // T1 — submit success → confirm → position write
  resetMocks();
  armLiveEnv(kp);
  r16().setWalletBalanceForTest(1.0);
  installLiveMocks(kp);
  pipeline.setSignerLoaderForTest(() => mockSigner(kp));
  const candidate = {
    symbol: "R16T1",
    name: "R16 Test",
    address: "11111111111111111111111111111111",
    pairAddress: "r16-pair",
    entryPrice: 0.0001,
    score: 85,
    marketCap: 150000,
    liquidity: 30000,
    source: "gmgn_trending"
  };
  const liveCfg = baseCfg({ walletPublicAddress: kp.address });
  const liveTradeId = await r16().enterPositionForTest(liveCfg, candidate);
  assert(liveTradeId, "T1 enterPosition returned id");
  const positions = readPositions();
  assert(positions.length === 1 && positions[0].status === "OPEN", "T1 position OPEN");
  assert(positions[0].filledTokenAmount === 100, "T1 stores filled token amount for mandatory SELL sizing");
  pass("T1", "enterPosition after mocked LIVE confirm writes OPEN position with filled token amount");

  // T2 — submit failure → no position write
  resetMocks();
  armLiveEnv(kp);
  fs.writeFileSync(path.join(TEMP_ROOT, "live_positions.json"), "[]\n");
  installLiveMocks(kp, { submissionThrow: true });
  pipeline.setSignerLoaderForTest(() => mockSigner(kp));
  await expectCode(codes().SUBMISSION_UNKNOWN, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }))
  );
  assert(readPositions().length === 0, "T2 no position after submit failure");
  pass("T2", "submit failure leaves positions empty");

  // T3 — confirmation timeout → reconciliation
  resetMocks();
  armLiveEnv(kp);
  installLiveMocks(kp, { confirmNever: true });
  pipeline.setSignerLoaderForTest(() => mockSigner(kp));
  await expectCode(codes().CONFIRMATION_TIMEOUT, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }))
  );
  assert(readRows(pendingFile).some(r => r.action === "CONFIRMATION_UNKNOWN"), "T3 reconciliation row");
  assert(readPositions().length === 0, "T3 no position on confirm timeout");
  pass("T3", "confirmation timeout writes reconciliation, no position");

  // T4 — position write failure after confirm
  resetMocks();
  armLiveEnv(kp);
  r16().setWalletBalanceForTest(1.0);
  installLiveMocks(kp);
  pipeline.setSignerLoaderForTest(() => mockSigner(kp));
  r16().setWritePositionsForTest(() => { throw new Error("simulated atomic store failure"); });
  const idT4 = await r16().enterPositionForTest(liveCfg, { ...candidate, symbol: "R16T4" });
  assert(!idT4, "T4 enterPosition returns null on store failure");
  assert(readPositions().length === 0, "T4 no persisted position");
  assert(readRows(pendingFile).some(r => r.action === "POSITION_WRITE_FAILED"), "T4 recovery row");
  pass("T4", "position write failure creates recovery artifact");

  // T5 — duplicate submit prevention
  resetMocks();
  armLiveEnv(kp);
  r16().setMicroLiveApprovalGateForTest(() => ({ ok: true }));
  installLiveMocks(kp, { slowQuoteMs: 400 });
  pipeline.setSignerLoaderForTest(() => mockSigner(kp));
  const first = pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }));
  await new Promise(r => setTimeout(r, 50));
  await expectCode(codes().DUPLICATE_SUBMIT_IN_FLIGHT, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }))
  );
  await first.catch(() => { /* first may fail if env races; duplicate is the assertion */ });
  pass("T5", "duplicate concurrent BUY blocked");

  // T6 — R14 rejection prevents submit
  resetMocks();
  armLiveEnv(kp);
  r16().setWalletBalanceForTest(1.0);
  installLiveMocks(kp);
  pipeline.setSignerLoaderForTest(() => mockSigner(kp));
  await expectCode(codes().LIQUIDITY_BELOW_FLOOR, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }, { poolLiquidityUsd: 1000 }))
  );
  pass("T6", "R14 liquidity floor blocks before submit");

  // T7 — signer unavailable
  resetMocks();
  armLiveEnv(kp);
  delete process.env.SOLANA_SIGNER_SECRET;
  await expectCode(codes().REAL_PATH_DISABLED, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }))
  );
  pass("T7", "missing signer blocks LIVE submit");

  // T8 — liveArmed false
  resetMocks();
  clearLiveEnv();
  pipeline.setSignerLoaderForTest(() => mockSigner(kp));
  await expectCode(codes().REAL_PATH_DISABLED, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }))
  );
  pass("T8", "disarmed gates block LIVE submit");

  // T9 — capitalExposure mismatch
  resetMocks();
  armLiveEnv(kp);
  r16().setCapitalExposureProviderForTest(() => "active");
  await expectCode(codes().CAPITAL_EXPOSURE_BLOCKED, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }))
  );
  pass("T9", "active capital exposure blocks LIVE BUY submit");

  // T10 — audit without secrets
  resetMocks();
  armLiveEnv(kp);
  r16().setWalletBalanceForTest(1.0);
  installLiveMocks(kp);
  pipeline.setSignerLoaderForTest(() => mockSigner(kp));
  await pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }));
  const auditText = readRows(auditFile).map(r => JSON.stringify(r)).join("\n");
  assert(!auditText.includes(kp.secretJson), "T10 no secret in audit");
  pass("T10", "audit secret-free");

  // T11 — emergencyStop prevents submit
  resetMocks();
  armLiveEnv(kp);
  await expectCode(codes().EMERGENCY_STOP_ACTIVE, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address, emergencyStop: true }))
  );
  pass("T11", "emergencyStop blocks LIVE submit");

  // T12 — approval missing
  resetMocks();
  armLiveEnv(kp);
  r16().resetMicroLiveApprovalGateForTest();
  r16().setApprovalRecordProviderForTest(() => null);
  await expectCode(codes().MICRO_LIVE_APPROVAL_BLOCKED, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }))
  );
  pass("T12", "missing R15 approval blocks LIVE BUY");

  // T13 — SELL liquidity parity
  resetMocks();
  armLiveEnv(kp);
  r16().setWalletBalanceForTest(1.0);
  fs.writeFileSync(path.join(TEMP_ROOT, "live_positions.json"), `${JSON.stringify([{
    liveTradeId: "sell-liquidity-open-position",
    symbol: "R16SELL",
    address: "11111111111111111111111111111111",
    pairAddress: "r16-pair",
    positionSizeSol: 0.01,
    filledTokenAmount: 100,
    entryTime: new Date().toISOString(),
    intendedEntryPrice: 0.0001,
    actualEntryPrice: 0.0001,
    entryFeeSol: 0.000005,
    poolLiquidityUsd: 30000,
    status: "OPEN",
    dryRun: false
  }], null, 2)}\n`);
  installLiveMocks(kp);
  pipeline.setSignerLoaderForTest(() => mockSigner(kp));
  await expectCode(codes().LIQUIDITY_BELOW_FLOOR, () =>
    pipeline.submitSwapForTest("SELL", swapArgs(
      { walletPublicAddress: kp.address },
      { poolLiquidityUsd: null, sellAmountTokenUnits: 100, liveTradeId: "sell-liquidity-open-position" }
    ))
  );
  pass("T13", "SELL missing poolLiquidityUsd fail-closed");

  // T14 - matching mandatory SELL may close the single authorized live position.
  resetMocks();
  armLiveEnv(kp);
  r16().setWalletBalanceForTest(1.0);
  fs.writeFileSync(path.join(TEMP_ROOT, "live_positions.json"), `${JSON.stringify([{
    liveTradeId: "matching-sell-open-position",
    symbol: "R16SELLOK",
    address: "11111111111111111111111111111111",
    pairAddress: "r16-pair",
    positionSizeSol: 0.01,
    filledTokenAmount: 100,
    entryTime: new Date().toISOString(),
    intendedEntryPrice: 0.0001,
    actualEntryPrice: 0.0001,
    entryFeeSol: 0.000005,
    poolLiquidityUsd: 30000,
    status: "OPEN",
    dryRun: false
  }], null, 2)}\n`);
  const matchingSellKey = r16().assertLivePathPreSubmit(baseCfg({ walletPublicAddress: kp.address }), {
    kind: "SELL",
    tokenAddress: "11111111111111111111111111111111",
    pairAddress: "r16-pair",
    positionSizeSol: 0.01,
    sellAmountTokenUnits: 100,
    liveTradeId: "matching-sell-open-position"
  });
  assert(matchingSellKey, "T14 matching SELL guard returned an in-flight key");
  r16().clearLiveSubmitInFlight(matchingSellKey);
  pass("T14", "matching mandatory SELL passes the live pre-submit guard");

  // T15 - mismatched mandatory SELL remains blocked before route/submission.
  resetMocks();
  armLiveEnv(kp);
  fs.writeFileSync(path.join(TEMP_ROOT, "live_positions.json"), `${JSON.stringify([{
    liveTradeId: "mismatched-sell-open-position",
    symbol: "R16SELLBLOCK",
    address: "11111111111111111111111111111111",
    pairAddress: "r16-pair",
    positionSizeSol: 0.01,
    filledTokenAmount: 100,
    entryTime: new Date().toISOString(),
    intendedEntryPrice: 0.0001,
    actualEntryPrice: 0.0001,
    entryFeeSol: 0.000005,
    poolLiquidityUsd: 30000,
    status: "OPEN",
    dryRun: false
  }], null, 2)}\n`);
  await expectCode(codes().CAPITAL_EXPOSURE_BLOCKED, () =>
    pipeline.submitSwapForTest("SELL", swapArgs(
      { walletPublicAddress: kp.address },
      { sellAmountTokenUnits: 99, liveTradeId: "mismatched-sell-open-position" }
    ))
  );
  pass("T15", "mismatched mandatory SELL remains blocked");

  // Pending reconciliation blocks new entries via safetyCheck
  fs.writeFileSync(pendingFile, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    operatorActionRequired: true,
    action: "CONFIRMATION_UNKNOWN"
  })}\n`);
  const gate = r16().safetyCheckForTest(baseCfg());
  assert(!gate.allowed && gate.reasons.some(r => r.includes("Pending reconciliation")), "safetyCheck blocks entries");
  pass("T-extra", "pending reconciliation blocks safetyCheck entries");

  // T-extra-exit - mandatory exit refuses positions without a concrete filled token amount.
  resetMocks();
  seedRuntime(kp.address);
  fs.writeFileSync(path.join(TEMP_ROOT, "live_positions.json"), `${JSON.stringify([{
    liveTradeId: "missing-sell-amount",
    symbol: "R16EXIT",
    address: "11111111111111111111111111111111",
    pairAddress: "r16-pair",
    positionSizeSol: 0.01,
    entryTime: new Date().toISOString(),
    intendedEntryPrice: 0.0001,
    actualEntryPrice: 0.0001,
    entryFeeSol: 0.000005,
    status: "OPEN"
  }], null, 2)}\n`);
  await expectCode(codes().MINT_MISMATCH, () =>
    r16().executeLiveExitForTest("missing-sell-amount", { triggerType: "MANUAL", triggerPrice: 0.0001 })
  );
  assert(readPositions().length === 1, "T-extra-exit position remains open for operator review");
  assert(readRows(liveTradesFile).some(r => r.failureReason === "SELL_AMOUNT_MISSING"), "T-extra-exit writes SELL_AMOUNT_MISSING failure");
  pass("T-extra-exit", "mandatory exit fails closed when filled token amount is missing");

  // T-extra-exit-success - mandatory exit quotes the stored filled token amount.
  resetMocks();
  seedRuntime(kp.address);
  const quotedSellAmounts = [];
  fs.writeFileSync(path.join(TEMP_ROOT, "live_positions.json"), `${JSON.stringify([{
    liveTradeId: "exit-with-filled-amount",
    symbol: "R16EXITOK",
    address: "11111111111111111111111111111111",
    pairAddress: "r16-pair",
    positionSizeSol: 0.01,
    filledTokenAmount: 100,
    entryTime: new Date().toISOString(),
    intendedEntryPrice: 0.0001,
    actualEntryPrice: 0.0001,
    entryFeeSol: 0.000005,
    poolLiquidityUsd: 30000,
    status: "OPEN"
  }], null, 2)}\n`);
  installLiveMocks(kp, {
    quoteKind: "SELL",
    sellAmountTokenUnits: 100,
    onQuoteAmount: amount => quotedSellAmounts.push(amount)
  });
  await r16().executeLiveExitForTest("exit-with-filled-amount", { triggerType: "MANUAL", triggerPrice: 0.0001 });
  assert(quotedSellAmounts.includes("100"), "T-extra-exit-success SELL quote used filledTokenAmount");
  assert(readPositions().length === 0, "T-extra-exit-success closes the open position");
  pass("T-extra-exit-success", "mandatory exit quotes stored filled token amount and closes position");

  // T-extra-live-exit-success - confirmed LIVE SELL compares raw lamports and closes.
  resetMocks();
  seedRuntime(kp.address, {
    executionMode: "LIVE",
    dryRunMode: false
  });
  armLiveEnv(kp);
  r16().setWalletBalanceForTest(1.0);
  fs.writeFileSync(path.join(TEMP_ROOT, "live_positions.json"), `${JSON.stringify([{
    liveTradeId: "live-exit-with-filled-amount",
    symbol: "R16LIVEEXITOK",
    address: "11111111111111111111111111111111",
    pairAddress: "r16-pair",
    positionSizeSol: 0.01,
    filledTokenAmount: 100,
    entryTime: new Date().toISOString(),
    intendedEntryPrice: 0.0001,
    actualEntryPrice: 0.0001,
    entryFeeSol: 0.000005,
    poolLiquidityUsd: 30000,
    status: "OPEN",
    dryRun: false
  }], null, 2)}\n`);
  installLiveMocks(kp, {
    quoteKind: "SELL",
    sellAmountTokenUnits: 100,
    onQuoteAmount: amount => quotedSellAmounts.push(amount)
  });
  pipeline.setSignerLoaderForTest(() => mockSigner(kp));
  await r16().executeLiveExitForTest("live-exit-with-filled-amount", { triggerType: "MANUAL", triggerPrice: 0.0001 });
  assert(readPositions().length === 0, "T-extra-live-exit-success closes the open live position");
  assert(readRows(pendingFile).length === 0, "T-extra-live-exit-success does not create reconciliation");
  pass("T-extra-live-exit-success", "confirmed LIVE SELL validates raw output units and closes position");

  return results;
}

function restoreEnv() {
  resetMocks();
  if (ORIGINAL_ENV.signer === undefined) delete process.env.SOLANA_SIGNER_SECRET;
  else process.env.SOLANA_SIGNER_SECRET = ORIGINAL_ENV.signer;
  if (ORIGINAL_ENV.rpc === undefined) delete process.env.SOLANA_RPC_URL;
  else process.env.SOLANA_RPC_URL = ORIGINAL_ENV.rpc;
  if (ORIGINAL_ENV.arm === undefined) delete process.env.FOMO_ENABLE_LIVE_SUBMISSION;
  else process.env.FOMO_ENABLE_LIVE_SUBMISSION = ORIGINAL_ENV.arm;
  if (ORIGINAL_ENV.expected === undefined) delete process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
  else process.env.EXPECTED_WALLET_PUBLIC_ADDRESS = ORIGINAL_ENV.expected;
  delete process.env.TRACKTA_RUNTIME_ROOT;
  try { fs.rmSync(TEMP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
}

runTests()
  .then(results => {
    const outPath = path.join(__dirname, "analysis", "r16_live_path_coupling_evidence.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify({ allPass: true, results, completedAt: new Date().toISOString() }, null, 2)}\n`);
    console.log("R16 LIVE PATH COUPLING TEST PASSED");
    console.log(JSON.stringify({ count: results.length, results }, null, 2));
    restoreEnv();
  })
  .catch(err => {
    console.error("R16 LIVE PATH COUPLING TEST FAILED:", err.message);
    restoreEnv();
    process.exitCode = 1;
  });
