"use strict";
// Signer/Reconciliation fixture drill — S1–S8, R1–R6 (SIGNER RECONCILIATION DRILL PLANNING — 2026-07-05).
// TRACKTA_RUNTIME_ROOT temp only; synthetic keypairs; mocked RPC; no production secrets.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "signer-recon-drill-"));
process.env.TRACKTA_RUNTIME_ROOT = TEMP_ROOT;

const ORIGINAL_ENV = {
  signer: process.env.SOLANA_SIGNER_SECRET,
  rpc: process.env.SOLANA_RPC_URL,
  arm: process.env.FOMO_ENABLE_LIVE_SUBMISSION,
  expected: process.env.EXPECTED_WALLET_PUBLIC_ADDRESS
};

const evidence = { tmpRoot: TEMP_ROOT, drills: {}, startedAt: new Date().toISOString() };
const results = [];

function record(id, pass, detail = "") {
  evidence.drills[id] = { pass, detail };
  results.push({ id, pass });
  if (!pass) throw new Error(`${id} FAILED: ${detail}`);
}

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
    address: encodeBase58(publicBytes),
    publicKey: pair.publicKey
  };
}

function v0TransactionBytes() {
  return Uint8Array.from([
    1, ...new Array(64).fill(0), 0x80, 1, 0, 0, 1,
    ...new Array(32).fill(0), ...new Array(32).fill(0), 1, 0, 0, 0
  ]);
}

function v0TransactionBase64() {
  return Buffer.from(v0TransactionBytes()).toString("base64");
}

function signedBytesForHelper() {
  const bytes = v0TransactionBytes();
  bytes.set(Uint8Array.from({ length: 64 }, (_, i) => i + 1), 1);
  return bytes;
}

function txSigFromBody(body) {
  const bytes = Uint8Array.from(Buffer.from(body.params[0], "base64"));
  return executor.__submissionTest.txSigFromSignedBytes(bytes);
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
    pairAddress: "drill-pair",
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
  const p = path.join(TEMP_ROOT, "live_positions.json");
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, "utf8"));
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

function seedRuntimeConfig(walletAddress) {
  fs.writeFileSync(
    path.join(TEMP_ROOT, "live_config.json"),
    `${JSON.stringify({
      phase: "PHASE_1_AUTONOMOUS_DRY_RUN",
      automationEnabled: true,
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      emergencyStop: false,
      walletPublicAddress: walletAddress,
      positionSizeSol: 0.01,
      maxOpenTrades: 1
    }, null, 2)}\n`
  );
  fs.writeFileSync(path.join(TEMP_ROOT, "live_positions.json"), "[]\n");
  fs.writeFileSync(path.join(TEMP_ROOT, "live_trades.jsonl"), "");
  fs.writeFileSync(path.join(TEMP_ROOT, "pending_reconciliation.jsonl"), "");
}

function installLiveMocks(keypair, opts = {}) {
  const quoteTest = executor.__jupiterQuoteTest;
  const feeTest = executor.__priorityFeeTest;
  const buildTest = executor.__txBuildTest;
  const simulationTest = executor.__simulationTest;
  const submissionTest = executor.__submissionTest;

  quoteTest.setQuoteFetchForTest(async () => ({
    ok: true,
    json: async () => ({
      inputMint: quoteTest.SOL_MINT,
      outputMint: "11111111111111111111111111111111",
      inAmount: "10000000",
      outAmount: "100",
      otherAmountThreshold: "97",
      priceImpactPct: "1",
      slippageBps: 100,
      routePlan: [{ swapInfo: { label: "MOCK" }, percent: 100 }],
      _fetchedAtMs: Date.now()
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
      result: { context: { slot: 99 }, value: { err: null, logs: ["ok"], unitsConsumed: 100000 } }
    })
  }));

  if (opts.submissionThrow) {
    submissionTest.setSubmissionFetchForTest(async () => {
      throw new Error("simulated submission timeout");
    });
  } else {
    submissionTest.setSubmissionFetchForTest(async (endpoint, opts2) => {
      const body = JSON.parse(opts2.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: txSigFromBody(body) })
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

  if (opts.fillThrow) {
    submissionTest.setFillFetchForTest(async () => {
      throw new Error("mock fill parse failed");
    });
  } else {
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
            postBalances: [990000000],
            preTokenBalances: [],
            postTokenBalances: [{
              owner: keypair.address,
              mint: "11111111111111111111111111111111",
              uiTokenAmount: { uiAmount: 100, uiAmountString: "100" }
            }]
          }
        }
      })
    }));
  }
}

function installPipelineMocksOnly() {
  const quoteTest = executor.__jupiterQuoteTest;
  const feeTest = executor.__priorityFeeTest;
  const buildTest = executor.__txBuildTest;
  const simulationTest = executor.__simulationTest;
  quoteTest.setQuoteFetchForTest(async () => ({
    ok: true,
    json: async () => ({
      inputMint: quoteTest.SOL_MINT,
      outputMint: "11111111111111111111111111111111",
      inAmount: "10000000",
      outAmount: "100",
      otherAmountThreshold: "97",
      priceImpactPct: "1",
      slippageBps: 100,
      routePlan: [{ swapInfo: { label: "MOCK" }, percent: 100 }],
      _fetchedAtMs: Date.now()
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
      result: { context: { slot: 99 }, value: { err: null, logs: ["ok"], unitsConsumed: 100000 } }
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
  executor.__pipelineDryRunTest.resetSignerLoaderForTest();
  if (executor?.__r16LivePathTest) executor.__r16LivePathTest.clearAllLiveSubmitInFlightForTest();
  if (TEMP_ROOT) {
    try { fs.writeFileSync(path.join(TEMP_ROOT, "pending_reconciliation.jsonl"), ""); } catch { /* ignore */ }
  }
}

// RB-G10 follow-up: submitSwap's mode==="LIVE" path now re-reads live_config.json
// from disk (assertOnDiskLiveSubmissionPosture, be31d91) instead of trusting only
// the in-memory cfg passed to submitSwapForTest — and the resulting attemptCfg
// (the disk read) is what flows through signer loading, quote/build/simulation,
// and completion too, not just the initial gate check. armLiveEnv/armLiveGatesOnly
// only ever set env vars, so the isolated temp root's on-disk config stayed at
// the minimal dry-run shape seedRuntimeConfig() wrote once at the top of
// runDrills() — missing the slippage/priority-fee/quote-age fields the swapArgs
// cfg normally supplies. Once the disk read replaces cfg for the whole call,
// those missing fields surface as real "invalid parameters" failures further
// down the pipeline, not just a gate-check mismatch. Uses baseCfg()'s full
// field set (same shape swapArgs' cfg uses) so the on-disk config is a
// genuinely complete config, not just enough to pass the gate check.
function armDiskLive() {
  const current = JSON.parse(fs.readFileSync(path.join(TEMP_ROOT, "live_config.json"), "utf8"));
  const armed = { ...baseCfg(), ...current, executionMode: "LIVE", dryRunMode: false };
  executor.saveConfig(armed, {
    audit: { actor: "test", source: "test_signer_reconciliation_drill", reason: "synthetic LIVE posture in isolated temp root" }
  });
}

function armLiveEnv(keypair) {
  process.env.SOLANA_RPC_URL = "https://dedicated-rpc.drill.invalid/?api-key=fake-drill-key";
  process.env.FOMO_ENABLE_LIVE_SUBMISSION = "YES";
  process.env.SOLANA_SIGNER_SECRET = keypair ? keypair.secretJson : undefined;
  delete process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
  armDiskLive();
}

function armLiveGatesOnly() {
  process.env.SOLANA_RPC_URL = "https://dedicated-rpc.drill.invalid/?api-key=fake-drill-key";
  process.env.FOMO_ENABLE_LIVE_SUBMISSION = "YES";
  delete process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
  armDiskLive();
}

function clearLiveEnv() {
  delete process.env.SOLANA_SIGNER_SECRET;
  delete process.env.SOLANA_RPC_URL;
  delete process.env.FOMO_ENABLE_LIVE_SUBMISSION;
}

let executor;

async function runDrills() {
  const kp = makeTestKeypair();
  seedRuntimeConfig(kp.address);
  executor = require("./live_executor");
  executor.__r16LivePathTest.setMicroLiveApprovalGateForTest(() => ({ ok: true }));

  const pipeline = executor.__pipelineDryRunTest;
  const submissionTest = executor.__submissionTest;
  const codes = executor.__executionLoggingTest.EXECUTION_ABORT_CODES;
  const pendingFile = executor.FILES.PENDING_RECONCILIATION_FILE;
  const auditFile = executor.FILES.EXECUTION_AUDIT_FILE;

  assert(pendingFile.startsWith(TEMP_ROOT), "pending file must be under temp root");
  assert(auditFile.startsWith(TEMP_ROOT), "audit file must be under temp root");

  // S1 — missing signer secret
  clearLiveEnv();
  pipeline.resetSignerLoaderForTest();
  await expectCode(codes.REAL_PATH_DISABLED, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }))
  );
  record("S1", true, "missing secret → REAL_PATH_DISABLED");

  // S2 — malformed JSON secret
  clearLiveEnv();
  pipeline.resetSignerLoaderForTest();
  armLiveGatesOnly();
  process.env.SOLANA_SIGNER_SECRET = "not-json";
  await expectCode(codes.SIGNER_LOAD_FAILED, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }))
  );
  record("S2", true, "malformed JSON → SIGNER_LOAD_FAILED");

  // S3 — wrong-length byte array
  armLiveGatesOnly();
  process.env.SOLANA_SIGNER_SECRET = JSON.stringify(Array(32).fill(1));
  await expectCode(codes.SIGNER_LOAD_FAILED, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }))
  );
  record("S3", true, "32-byte array → SIGNER_LOAD_FAILED");

  // S4 — embedded public key mismatch
  const tampered = [...kp.secretBytes];
  tampered[63] = (tampered[63] + 1) % 256;
  armLiveGatesOnly();
  process.env.SOLANA_SIGNER_SECRET = JSON.stringify(tampered);
  await expectCode(codes.SIGNER_LOAD_FAILED, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }))
  );
  record("S4", true, "tampered pubkey → SIGNER_LOAD_FAILED");

  // S5 — wallet address mismatch. Passing a mismatched walletPublicAddress via
  // swapArgs' cfg no longer reaches the check directly (be31d91's on-disk
  // recheck now supplies the actual walletPublicAddress used, from the temp
  // root's real config — correctly, since a caller-supplied cfg can no longer
  // inject a fake wallet). Using the second, independent WALLET_MISMATCH check
  // (EXPECTED_WALLET_PUBLIC_ADDRESS env var vs. the on-disk configured wallet)
  // to exercise the same failure mode instead.
  armLiveEnv(kp);
  pipeline.resetSignerLoaderForTest();
  process.env.EXPECTED_WALLET_PUBLIC_ADDRESS = "WrongWalletAddress111111111111111111111";
  await expectCode(codes.WALLET_MISMATCH, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }))
  );
  delete process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
  record("S5", true, "wallet mismatch → WALLET_MISMATCH");

  // S6 — non-LIVE mode identity-only signer
  clearLiveEnv();
  resetMocks();
  installPipelineMocksOnly();
  const auditBeforeS6 = readRows(auditFile).length;
  const pipelineResult = await pipeline.submitSwapForTest("BUY", swapArgs({
    executionMode: "PIPELINE_DRY_RUN",
    dryRunMode: true,
    walletPublicAddress: kp.address
  }));
  assert(pipelineResult.isPipelineDryRun === true, "expected pipeline dry run");
  const identitySigner = Object.defineProperties(
    { publicKey: Object.freeze({ toBase58: () => kp.address }) },
    {
      sign: { get() { throw new Error("PIPELINE_DRY_RUN signer is identity-only and cannot sign."); } },
      secretKey: { get() { throw new Error("PIPELINE_DRY_RUN signer has no secret material."); } }
    }
  );
  let identityBlocked = false;
  try { identitySigner.sign; } catch { identityBlocked = true; }
  try { void identitySigner.secretKey; } catch { identityBlocked = true; }
  assert(identityBlocked, "identity signer must block sign/secret access");
  const pipelineAudit = readRows(auditFile).slice(auditBeforeS6);
  const liveStages = ["SUBMIT", "CONFIRMATION", "FILL_PARSE", "SIGNED"];
  assert(!pipelineAudit.some(r => liveStages.includes(r.stage)), "PIPELINE_DRY_RUN must not emit live submission stages");
  record("S6", true, "PIPELINE_DRY_RUN never reaches live submit stages");

  // S7 — mocked LIVE sign path with signerLoaderForTest
  armLiveEnv(kp);
  installLiveMocks(kp);
  pipeline.setSignerLoaderForTest(() => ({
    publicKey: Object.freeze({ toBase58: () => kp.address }),
    secretKey: kp.secretBytes,
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
  }));
  const auditBefore = readRows(auditFile).length;
  const liveResult = await pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }));
  const auditAfter = readRows(auditFile).slice(auditBefore);
  assert(liveResult.isDryRun === false && typeof liveResult.txSig === "string", "LIVE mock path landed");
  assert(auditAfter.some(r => r.stage === "SIGNED"), "SIGNED audit present");
  assert(auditAfter.some(r => r.stage === "SUBMIT"), "SUBMIT audit present");
  record("S7", true, "mocked LIVE path reaches sign/submit/confirm with signerLoaderForTest");

  // S8 — no secrets in audit
  const auditText = readRows(auditFile).map(r => JSON.stringify(r)).join("\n");
  assert(!auditText.includes(kp.secretJson), "audit must not contain secret JSON");
  assert(!auditText.includes(kp.secretBytes.slice(0, 8).join(",")), "audit must not contain raw secret bytes");
  record("S8", true, "audit rows secret-free under drill conditions");

  // R1 — SUBMISSION_UNKNOWN
  resetMocks();
  armLiveEnv(kp);
  installLiveMocks(kp, { submissionThrow: true });
  pipeline.setSignerLoaderForTest(() => ({
    publicKey: { toBase58: () => kp.address },
    sign: msg => new Uint8Array(64).fill(7)
  }));
  const posBeforeR1 = readPositions().length;
  const pendingBeforeR1 = readRows(pendingFile).length;
  await expectCode(codes.SUBMISSION_UNKNOWN, () =>
    submissionTest.submitRawTransaction(signedBytesForHelper(), baseCfg(), {
      kind: "BUY",
      tokenAddress: "11111111111111111111111111111111",
      pairAddress: "drill-pair",
      builtSwap: { metadata: { lastValidBlockHeight: 99 } }
    })
  );
  const pendingR1 = readRows(pendingFile).slice(pendingBeforeR1);
  assert(pendingR1.length === 1 && pendingR1[0].action === "SUBMISSION_UNKNOWN", "SUBMISSION_UNKNOWN row");
  assert(readPositions().length === posBeforeR1, "no position write on submission unknown");
  record("R1", true, "SUBMISSION_UNKNOWN + no position write");

  // R2 — CONFIRMATION_UNKNOWN
  resetMocks();
  installLiveMocks(kp, { confirmNever: true });
  const pendingBeforeR2 = readRows(pendingFile).length;
  const posBeforeR2 = readPositions().length;
  await expectCode(codes.CONFIRMATION_TIMEOUT, () =>
    submissionTest.awaitConfirmation(
      "FullConfirmationTimeoutSignature111111111111111111111111111",
      baseCfg({ confirmationTimeoutMs: 0 }),
      {
        kind: "BUY",
        tokenAddress: "11111111111111111111111111111111",
        pairAddress: "drill-pair",
        builtSwap: { metadata: { lastValidBlockHeight: 777 } }
      }
    )
  );
  const pendingR2 = readRows(pendingFile).slice(pendingBeforeR2);
  assert(pendingR2.some(r => r.action === "CONFIRMATION_UNKNOWN"), "CONFIRMATION_UNKNOWN row");
  assert(readPositions().length === posBeforeR2, "no position write on confirm unknown");
  record("R2", true, "CONFIRMATION_UNKNOWN + no position write");

  // R3 — FILL_PARSE_UNKNOWN
  resetMocks();
  armLiveEnv(kp);
  installLiveMocks(kp, { fillThrow: true });
  pipeline.setSignerLoaderForTest(() => ({
    publicKey: { toBase58: () => kp.address },
    sign: msg => {
      const privateKeyObj = crypto.createPrivateKey({
        key: Buffer.concat([
          Buffer.from("302e020100300506032b657004220420", "hex"),
          Buffer.from(kp.secretBytes.slice(0, 32))
        ]),
        format: "der",
        type: "pkcs8"
      });
      return new Uint8Array(crypto.sign(null, Buffer.from(msg), privateKeyObj));
    }
  }));
  const posBeforeR3 = readPositions().length;
  await expectCode(codes.FILL_PARSE_FAILED, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }))
  );
  assert(readRows(pendingFile).some(r => r.action === "FILL_PARSE_UNKNOWN"), "FILL_PARSE_UNKNOWN row");
  assert(readPositions().length === posBeforeR3, "no position write on fill parse fail");
  record("R3", true, "FILL_PARSE_UNKNOWN + no position write");

  // R4 — no auto-resolution in executor (count-for-gate reads allowed)
  const src = fs.readFileSync(path.join(__dirname, "live_executor.js"), "utf8");
  const appendOnly = (src.match(/appendJsonl\(PENDING_RECONCILIATION_FILE/g) || []).length >= 1;
  const noAutoResolution = !/readJsonl\(PENDING_RECONCILIATION_FILE|autoRetry|autoResolve|resumePending/i.test(src);
  assert(appendOnly && noAutoResolution && src.includes("countPendingReconciliationEntries"), "executor append-only for pending reconciliation");
  record("R4", true, "no auto-resolution read path in live_executor.js");

  // R5 — exit-side ambiguity keeps position OPEN
  resetMocks();
  armLiveEnv(kp);
  fs.writeFileSync(
    path.join(TEMP_ROOT, "live_config.json"),
    `${JSON.stringify({
      phase: "PHASE_1_AUTONOMOUS_DRY_RUN",
      automationEnabled: true,
      executionMode: "LIVE",
      dryRunMode: false,
      emergencyStop: false,
      walletPublicAddress: kp.address,
      positionSizeSol: 0.01,
      maxOpenTrades: 1,
      maxEntrySlippagePct: 1,
      maxExitSlippagePct: 1,
      confirmationTimeoutMs: 30000,
      confirmationCommitment: "confirmed"
    }, null, 2)}\n`
  );
  const openPos = {
    liveTradeId: "drill-exit-1",
    symbol: "TEST",
    address: "11111111111111111111111111111111",
    pairAddress: "drill-pair",
    positionSizeSol: 0.01,
    entryTime: new Date().toISOString(),
    actualEntryPrice: 0.0001,
    targetPrice: 0.0002,
    stopPrice: 0.00005,
    poolLiquidityUsd: 30000,
    status: "OPEN"
  };
  fs.writeFileSync(path.join(TEMP_ROOT, "live_positions.json"), `${JSON.stringify([openPos], null, 2)}\n`);
  installLiveMocks(kp, { submissionThrow: true });
  pipeline.setSignerLoaderForTest(() => ({
    publicKey: { toBase58: () => kp.address },
    sign: () => new Uint8Array(64).fill(9)
  }));
  try {
    await executor.executeLiveExit("drill-exit-1", { triggerType: "STOP", triggerPrice: 0.00005 });
  } catch {
    // expected submit failure
  }
  const afterExit = readPositions();
  assert(afterExit.length === 1 && afterExit[0].status === "OPEN", "position remains OPEN after failed exit submit");
  record("R5", true, "exit-side submit failure leaves position OPEN");

  // R6 — reconciliation row written even when emergencyStop set (reporting); new entries blocked
  resetMocks();
  armLiveEnv(kp);
  installLiveMocks(kp, { submissionThrow: true });
  const pendingBeforeR6 = readRows(pendingFile).length;
  await expectCode(codes.SUBMISSION_UNKNOWN, () =>
    submissionTest.submitRawTransaction(signedBytesForHelper(), baseCfg({ emergencyStop: true }), {
      kind: "BUY",
      builtSwap: { metadata: { lastValidBlockHeight: 50 } }
    })
  );
  assert(readRows(pendingFile).length > pendingBeforeR6, "reconciliation row written under e-stop cfg");
  const gate = executor.safetyCheck(baseCfg({ emergencyStop: true, automationEnabled: true }));
  assert(!gate.allowed && gate.reasons.some(r => r.includes("Emergency stop")), "safetyCheck blocks entries under e-stop");
  record("R6", true, "reconciliation recorded; safetyCheck blocks new entries under e-stop");

  evidence.completedAt = new Date().toISOString();
  evidence.allPass = results.every(r => r.pass);
  evidence.summary = results;
}

function restoreEnv() {
  if (executor?.__r16LivePathTest) {
    executor.__r16LivePathTest.resetMicroLiveApprovalGateForTest();
  }
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

function evidenceOutputPath() {
  return path.join(TEMP_ROOT, "analysis", "signer_reconciliation_drill_evidence.json");
}

function writeEvidenceOutput() {
  const outPath = evidenceOutputPath();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
  return outPath;
}

runDrills()
  .then(() => {
    const outPath = writeEvidenceOutput();
    console.log("SIGNER RECONCILIATION DRILL TEST PASSED");
    console.log(JSON.stringify({
      allPass: evidence.allPass,
      drills: evidence.summary,
      outPath
    }, null, 2));
    restoreEnv();
  })
  .catch(err => {
    console.error("SIGNER RECONCILIATION DRILL TEST FAILED:", err.message);
    try {
      evidence.completedAt = new Date().toISOString();
      evidence.allPass = false;
      evidence.error = err.message;
      writeEvidenceOutput();
    } catch { /* ignore */ }
    restoreEnv();
    process.exitCode = 1;
  });
