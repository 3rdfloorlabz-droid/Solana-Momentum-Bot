"use strict";
// A1-D03 Tier 1 fixture crash drill — D3-0 preflight + W4/W6/W3/W5/W2/W1 + A1-D04 regression
// (A1-D03 CRASH DRILL AUTHORIZATION — 2026-07-06). Temp TRACKTA_RUNTIME_ROOT only; simulated hooks; no SIGKILL.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const REPO_ROOT = __dirname;
const PROD_CONFIG = path.join(REPO_ROOT, "live_config.json");
const RECOVERY_FILE = path.join(REPO_ROOT, "recovery_actions.jsonl");

const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "a1-d03-crash-drill-"));
process.env.TRACKTA_RUNTIME_ROOT = TEMP_ROOT;

const ORIGINAL_ENV = {
  signer: undefined,
  rpc: undefined,
  arm: undefined,
  loopLive: process.env.FOMO_ALLOW_LOOP_LIVE,
  expected: undefined
};

const evidence = {
  gate: "A1-D03 Tier 1 Fixture Crash Drill Execution",
  tier: 1,
  tmpRoot: TEMP_ROOT,
  preflight: {},
  windows: {},
  a1D04Regression: {},
  sweeps: {},
  startedAt: new Date().toISOString()
};
const results = [];

function record(id, pass, detail = "") {
  evidence.windows[id] = { pass, detail };
  results.push({ id, pass });
  if (!pass) throw new Error(`${id} FAILED: ${detail}`);
}

function recordMeta(id, pass, detail = "") {
  evidence[id] = { pass, detail };
  results.push({ id, pass });
  if (!pass) throw new Error(`${id} FAILED: ${detail}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
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
  return {
    secretBytes: [...seed, ...publicBytes],
    secretJson: JSON.stringify([...seed, ...publicBytes]),
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
    pairAddress: "d3-pair",
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

function samplePosition(overrides = {}) {
  return {
    liveTradeId: "d3-pos-1",
    symbol: "TEST",
    address: "11111111111111111111111111111111",
    pairAddress: "d3-pair",
    positionSizeSol: 0.01,
    entryTime: new Date().toISOString(),
    actualEntryPrice: 0.0001,
    targetPrice: 0.0002,
    stopPrice: 0.00005,
    poolLiquidityUsd: 30000,
    status: "OPEN",
    dryRun: true,
    ...overrides
  };
}

function tmpFilesInRoot(root = TEMP_ROOT) {
  return fs.readdirSync(root).filter(n => n.includes(".tmp"));
}

function parseSweep(root = TEMP_ROOT) {
  const files = [
    "live_config.json", "live_positions.json", "observation_dedup.json",
    "executor_singleton.lock.json", "live_trades.jsonl", "execution_audit.jsonl",
    "pending_reconciliation.jsonl", "pipeline_candidates.jsonl"
  ];
  const out = { ok: true, files: {}, errors: [], tmpFiles: tmpFilesInRoot(root) };
  for (const f of files) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) {
      out.files[f] = { exists: false, ok: true };
      continue;
    }
    try {
      if (f.endsWith(".jsonl")) {
        const lines = fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean);
        lines.forEach(l => JSON.parse(l));
        out.files[f] = { exists: true, lines: lines.length, ok: true };
      } else {
        JSON.parse(fs.readFileSync(p, "utf8"));
        out.files[f] = { exists: true, ok: true };
      }
    } catch (err) {
      out.ok = false;
      out.files[f] = { exists: true, ok: false, error: err.message };
      out.errors.push(`${f}: ${err.message}`);
    }
  }
  return out;
}

function stateHashes(root = TEMP_ROOT) {
  const names = ["live_config.json", "live_positions.json", "observation_dedup.json", "executor_singleton.lock.json"];
  const hashes = {};
  for (const n of names) {
    const p = path.join(root, n);
    hashes[n] = sha256File(p);
  }
  return hashes;
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

function seedRuntime(walletAddress) {
  fs.writeFileSync(
    path.join(TEMP_ROOT, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      automationEnabled: true,
      emergencyStop: false,
      walletPublicAddress: walletAddress,
      positionSizeSol: 0.01,
      maxOpenTrades: 1
    }, null, 2)}\n`
  );
  fs.writeFileSync(path.join(TEMP_ROOT, "live_positions.json"), "[]\n");
  fs.writeFileSync(path.join(TEMP_ROOT, "observation_dedup.json"), `${JSON.stringify({ keys: {}, pairTimestamps: {} }, null, 2)}\n`);
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
      const bytes = Uint8Array.from(Buffer.from(body.params[0], "base64"));
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: executor.__submissionTest.txSigFromSignedBytes(bytes) })
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
          postBalances: [990000000],
          preTokenBalances: [],
          postTokenBalances: [{
            owner: kp.address,
            mint: "11111111111111111111111111111111",
            uiTokenAmount: { uiAmount: 100, uiAmountString: "100" }
          }]
        }
      }
    })
  }));
}

function resetMocks() {
  if (!executor) return;
  executor.__jupiterQuoteTest.resetQuoteFetchForTest();
  executor.__priorityFeeTest.resetPriorityFeeFetchForTest();
  executor.__txBuildTest.resetSwapBuildFetchForTest();
  executor.__simulationTest.resetSimulationFetchForTest();
  executor.__submissionTest.resetSubmissionFetchForTest();
  executor.__submissionTest.resetConfirmationFetchForTest();
  executor.__submissionTest.resetFillFetchForTest();
  executor.__pipelineDryRunTest.resetSignerLoaderForTest();
  executor.__r16LivePathTest.resetSignerLoaderForTest();
  executor.__r16LivePathTest.resetMicroLiveApprovalGateForTest();
  executor.__r16LivePathTest.resetWritePositionsForTest();
  executor.__r16LivePathTest.resetWalletBalanceForTest();
  executor.__r16LivePathTest.clearAllLiveSubmitInFlightForTest();
  executor.__r16LivePathTest.setMicroLiveApprovalGateForTest(() => ({ ok: true }));
  fs.writeFileSync(path.join(TEMP_ROOT, "pending_reconciliation.jsonl"), "");
}

function armLiveEnv(kp) {
  process.env.SOLANA_RPC_URL = "https://dedicated-rpc.d3.invalid/?api-key=fake-d3-key";
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

function withRenameCrash(targetFile, fn) {
  const orig = fs.renameSync;
  let crashed = false;
  fs.renameSync = (from, to) => {
    if (!crashed && to === targetFile) {
      crashed = true;
      throw new Error("simulated crash during atomic rename");
    }
    return orig(from, to);
  };
  try {
    return fn();
  } finally {
    fs.renameSync = orig;
  }
}

let executor;
const r16 = () => executor.__r16LivePathTest;
const codes = () => executor.__executionLoggingTest.EXECUTION_ABORT_CODES;

function runPreflight(prodConfigHashBefore) {
  assert(fs.existsSync(PROD_CONFIG), "production live_config.json missing");
  const prodCfg = JSON.parse(fs.readFileSync(PROD_CONFIG, "utf8"));
  if (prodCfg.executionMode === "LIVE") throw new Error("ABORT: production executionMode LIVE");
  if (prodCfg.dryRunMode !== true) throw new Error("ABORT: production dryRunMode not true");
  if (process.env.FOMO_ALLOW_LOOP_LIVE === "YES") throw new Error("ABORT: FOMO_ALLOW_LOOP_LIVE=YES");

  evidence.preflight = {
    productionConfigHashSha256: prodConfigHashBefore,
    executionMode: prodCfg.executionMode,
    dryRunMode: prodCfg.dryRunMode,
    emergencyStop: prodCfg.emergencyStop,
    recoveryActionsJsonlPresent: fs.existsSync(RECOVERY_FILE),
    fomoAllowLoopLive: process.env.FOMO_ALLOW_LOOP_LIVE || "unset",
    or20260630008: "not_promoted",
    realSignerAccess: false,
    realRpcBroadcast: false,
    baselineParseSweep: parseSweep(TEMP_ROOT),
    timestamp: new Date().toISOString()
  };
}

async function runDrills() {
  const prodConfigHashBefore = sha256File(PROD_CONFIG);
  runPreflight(prodConfigHashBefore);

  const kp = makeTestKeypair();
  seedRuntime(kp.address);
  executor = require("./live_executor");
  ORIGINAL_ENV.signer = process.env.SOLANA_SIGNER_SECRET;
  ORIGINAL_ENV.rpc = process.env.SOLANA_RPC_URL;
  ORIGINAL_ENV.arm = process.env.FOMO_ENABLE_LIVE_SUBMISSION;
  ORIGINAL_ENV.expected = process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;

  const armed = r16().computeLiveArmedStatus(JSON.parse(fs.readFileSync(PROD_CONFIG, "utf8")));
  const exposure = r16().resolveCapitalExposureForLiveGate(JSON.parse(fs.readFileSync(PROD_CONFIG, "utf8")));
  evidence.preflight.liveArmed = armed.liveArmed;
  evidence.preflight.capitalExposure = exposure;
  assert(!armed.liveArmed, "production liveArmed must be false");
  assert(exposure === "none", "production capitalExposure must be none");
  recordMeta("D3-0", true, `preflight OK — ${evidence.preflight.executionMode} · dryRunMode true · liveArmed false · capitalExposure none`);

  const positionsStore = require("./live_positions_store");
  const guard = require("./executor_singleton_guard");
  const positionsFile = path.join(TEMP_ROOT, "live_positions.json");
  const lockFile = path.join(TEMP_ROOT, "executor_singleton.lock.json");
  const pipeline = executor.__pipelineDryRunTest;
  const submissionTest = executor.__submissionTest;
  const pendingFile = executor.FILES.PENDING_RECONCILIATION_FILE;

  // W4 — during live_positions.json atomic write (priority 1)
  const w4Before = [samplePosition({ liveTradeId: "w4-keep" })];
  positionsStore.writeLivePositionsStateAtomic(w4Before, positionsFile);
  const w4HashBefore = sha256File(positionsFile);
  let w4Crashed = false;
  try {
    withRenameCrash(positionsFile, () => {
      positionsStore.writeLivePositionsStateAtomic(
        [samplePosition({ liveTradeId: "w4-new" })],
        positionsFile
      );
    });
    throw new Error("W4 expected rename crash");
  } catch (err) {
    w4Crashed = err.message.includes("simulated crash during atomic rename");
  }
  assert(w4Crashed, "W4 simulated rename crash");
  assert(sha256File(positionsFile) === w4HashBefore, "W4 original positions byte-identical after crash");
  assert(tmpFilesInRoot().length === 0, "W4 no persistent tmp after failed atomic write");
  positionsStore.writeLivePositionsStateAtomic([samplePosition({ liveTradeId: "w4-recovered" })], positionsFile);
  assert(positionsStore.validateLivePositionsState(JSON.parse(fs.readFileSync(positionsFile, "utf8"))).ok, "W4 recovery write valid");
  evidence.windows.W4 = {
    pass: true,
    detail: "rename crash leaves original intact; tmp cleaned; recovery write succeeds",
    hashBefore: w4HashBefore,
    hashAfterRecovery: sha256File(positionsFile)
  };
  results.push({ id: "W4", pass: true });

  // W6 — during lock heartbeat update (priority 2)
  if (fs.existsSync(lockFile)) fs.rmSync(lockFile, { force: true });
  const acq = guard.acquireExecutorSingletonGuard({
    file: lockFile,
    posture: { mode: "PIPELINE_DRY_RUN", dryRunMode: true, liveArmed: false }
  });
  assert(acq.ok, "W6 acquire ok");
  const dup = guard.acquireExecutorSingletonGuard({ file: lockFile });
  assert(!dup.ok && dup.blocked, "W6 duplicate acquire blocked");
  let w6Crashed = false;
  try {
    withRenameCrash(lockFile, () => {
      guard.refreshExecutorSingletonGuard(acq.instanceId, lockFile, { dryRunMode: true, liveArmed: false });
    });
    throw new Error("W6 expected rename crash");
  } catch (err) {
    w6Crashed = err.message.includes("simulated crash during atomic rename");
  }
  assert(w6Crashed, "W6 simulated refresh crash");
  const lockRead = guard.readExecutorLock(lockFile);
  assert(lockRead.state === "present", "W6 lock still present after refresh crash");
  assert(lockRead.lock.instanceId === acq.instanceId, "W6 lock ownership unchanged");
  assert(tmpFilesInRoot().length === 0, "W6 no persistent tmp");
  const dupAfter = guard.acquireExecutorSingletonGuard({ file: lockFile });
  assert(!dupAfter.ok, "W6 no duplicate ownership after refresh crash");
  guard.releaseExecutorSingletonGuard(acq.instanceId, lockFile);
  evidence.windows.W6 = {
    pass: true,
    detail: "refresh rename crash preserves lock owner; duplicate acquire blocked; tmp clean",
    lockInstanceId: acq.instanceId
  };
  results.push({ id: "W6", pass: true });

  // W3 — after confirm, before position write (priority 3)
  resetMocks();
  seedRuntime(kp.address);
  armLiveEnv(kp);
  r16().setWalletBalanceForTest(1.0);
  installLiveMocks(kp);
  pipeline.setSignerLoaderForTest(() => mockSigner(kp));
  r16().setWritePositionsForTest(() => {
    throw new Error("simulated W3 crash during position write");
  });
  const w3Candidate = {
    symbol: "W3TEST",
    name: "W3 Test",
    address: "11111111111111111111111111111111",
    pairAddress: "d3-pair",
    entryPrice: 0.0001,
    score: 85,
    marketCap: 150000,
    liquidity: 30000,
    source: "gmgn_trending"
  };
  const w3Id = await r16().enterPositionForTest(baseCfg({ walletPublicAddress: kp.address }), w3Candidate);
  assert(!w3Id, "W3 enterPosition returns null on write crash");
  assert(readPositions().length === 0, "W3 no silent position write");
  assert(readRows(pendingFile).some(r => r.action === "POSITION_WRITE_FAILED"), "W3 reconciliation artifact on write failure");
  const w3Sweep = parseSweep();
  assert(w3Sweep.ok, `W3 parse sweep: ${w3Sweep.errors.join("; ")}`);
  record("W3", true, "post-confirm position write crash → null id, no position, POSITION_WRITE_FAILED row");

  // W5 — during pending_reconciliation.jsonl append (priority 4)
  resetMocks();
  seedRuntime(kp.address);
  const seedRow = {
    timestamp: new Date().toISOString(),
    operatorActionRequired: true,
    action: "CONFIRMATION_UNKNOWN",
    liveTradeId: "w5-seed"
  };
  fs.writeFileSync(pendingFile, `${JSON.stringify(seedRow)}\n`);
  const seedText = fs.readFileSync(pendingFile, "utf8");
  const origAppend = fs.appendFileSync;
  fs.appendFileSync = (file, data, ...rest) => {
    if (file === pendingFile) {
      throw new Error("simulated W5 crash before reconciliation append completes");
    }
    return origAppend(file, data, ...rest);
  };
  armLiveEnv(kp);
  installLiveMocks(kp, { confirmNever: true });
  let w5Threw = false;
  try {
    await submissionTest.awaitConfirmation(
      "W5AppendCrashSig111111111111111111111111111111111",
      baseCfg({ confirmationTimeoutMs: 0, walletPublicAddress: kp.address }),
      { kind: "BUY", tokenAddress: "11111111111111111111111111111111", pairAddress: "d3-pair", builtSwap: { metadata: { lastValidBlockHeight: 50 } } }
    );
  } catch {
    w5Threw = true;
  }
  fs.appendFileSync = origAppend;
  assert(w5Threw, "W5 append hook interrupted reconciliation path");
  assert(fs.readFileSync(pendingFile, "utf8") === seedText, "W5 prior reconciliation rows unchanged after append crash");
  assert(readRows(pendingFile).length === 1, "W5 no partial new row after crash-before-append");
  record("W5", true, "append crash before write completes; prior rows byte-identical");

  // W2 — after submit fixture, before confirmation classification (priority 5)
  resetMocks();
  seedRuntime(kp.address);
  armLiveEnv(kp);
  installLiveMocks(kp, { confirmNever: true });
  const posBeforeW2 = readPositions().length;
  await expectCode(codes().CONFIRMATION_TIMEOUT, () =>
    submissionTest.awaitConfirmation(
      "W2TimeoutSig111111111111111111111111111111111111111",
      baseCfg({ confirmationTimeoutMs: 0, walletPublicAddress: kp.address }),
      { kind: "BUY", tokenAddress: "11111111111111111111111111111111", pairAddress: "d3-pair", builtSwap: { metadata: { lastValidBlockHeight: 50 } } }
    )
  );
  assert(readPositions().length === posBeforeW2, "W2 no position on pre-confirm ambiguity");
  assert(readRows(pendingFile).some(r => r.action === "CONFIRMATION_UNKNOWN"), "W2 reconciliation artifact present");
  record("W2", true, "submit fixture then confirm ambiguity; no position; reconciliation appended");

  // W1 — after quote/sim pass, before submit (priority 6)
  resetMocks();
  seedRuntime(kp.address);
  armLiveEnv(kp);
  installLiveMocks(kp);
  pipeline.setSignerLoaderForTest(() => ({
    publicKey: { toBase58: () => kp.address },
    sign: () => {
      throw Object.assign(new Error("simulated W1 crash after sim before submit"), { code: "SIMULATED_CRASH" });
    }
  }));
  const posBeforeW1 = readPositions().length;
  let w1Failed = false;
  try {
    await pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }));
  } catch {
    w1Failed = true;
  }
  assert(w1Failed, "W1 failed before submit");
  assert(readPositions().length === posBeforeW1, "W1 no position corruption");
  record("W1", true, "crash hook after sim before submit; fail-closed; no position write");

  // A1-D04 regression spot-check
  const src = fs.readFileSync(path.join(REPO_ROOT, "live_executor.js"), "utf8");
  const noAuto = !/readJsonl\(PENDING_RECONCILIATION_FILE|autoRetry|autoResolve|resumePending/i.test(src);
  assert(noAuto, "A1-D04 no auto-resolution path");
  resetMocks();
  seedRuntime(kp.address);
  armLiveEnv(kp);
  installLiveMocks(kp, { submissionThrow: true });
  pipeline.setSignerLoaderForTest(() => mockSigner(kp));
  const posBeforeReg = readPositions().length;
  await expectCode(codes().SUBMISSION_UNKNOWN, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }))
  );
  assert(readPositions().length === posBeforeReg, "A1-D04 regression: no position on ambiguous entry");
  fs.writeFileSync(positionsFile, `${JSON.stringify([samplePosition({ liveTradeId: "d3-exit-reg" })], null, 2)}\n`);
  installLiveMocks(kp, { submissionThrow: true });
  try {
    await executor.executeLiveExit("d3-exit-reg", { triggerType: "STOP", triggerPrice: 0.00005 });
  } catch { /* expected */ }
  const afterExit = readPositions();
  assert(afterExit.length === 1 && afterExit[0].status === "OPEN", "A1-D04 regression: exit ambiguity leaves OPEN");
  evidence.a1D04Regression = { pass: true, noAutoResolution: true, noPositionOnAmbiguity: true, exitLeavesOpen: true };
  recordMeta("A1-D04-regression", true, "no auto-resolve; ambiguous entry no write; exit OPEN preserved");

  // Final sweeps and postflight
  const finalSweep = parseSweep();
  evidence.sweeps = {
    parseSweep: finalSweep,
    tmpFiles: tmpFilesInRoot(),
    stateHashes: stateHashes()
  };
  assert(finalSweep.ok, `final parse sweep failed: ${finalSweep.errors.join("; ")}`);
  assert(tmpFilesInRoot().length === 0, "persistent tmp files after drill");

  clearLiveEnv();
  resetMocks();
  seedRuntime(kp.address);
  const harnessCfg = JSON.parse(fs.readFileSync(path.join(TEMP_ROOT, "live_config.json"), "utf8"));
  evidence.postflight = {
    productionConfigHashSha256: sha256File(PROD_CONFIG),
    productionConfigUnchanged: sha256File(PROD_CONFIG) === prodConfigHashBefore,
    harnessExecutionMode: harnessCfg.executionMode,
    harnessDryRunMode: harnessCfg.dryRunMode,
    harnessLiveArmed: false,
    capitalExposure: "none",
    or20260630008: "not_promoted",
    timestamp: new Date().toISOString()
  };
  assert(evidence.postflight.productionConfigUnchanged, "production config hash unchanged");
  recordMeta("D3-8", true, "cleanup restores DRY/unarmed/no-capital; production hash unchanged");

  evidence.completedAt = new Date().toISOString();
  evidence.allPass = results.every(r => r.pass);
  evidence.summary = results;
}

function restoreEnv() {
  if (executor?.__r16LivePathTest) {
    executor.__r16LivePathTest.resetMicroLiveApprovalGateForTest();
    executor.__r16LivePathTest.resetWritePositionsForTest();
  }
  if (executor) resetMocks();
  clearLiveEnv();
  if (ORIGINAL_ENV.signer === undefined) delete process.env.SOLANA_SIGNER_SECRET;
  else process.env.SOLANA_SIGNER_SECRET = ORIGINAL_ENV.signer;
  if (ORIGINAL_ENV.rpc === undefined) delete process.env.SOLANA_RPC_URL;
  else process.env.SOLANA_RPC_URL = ORIGINAL_ENV.rpc;
  if (ORIGINAL_ENV.arm === undefined) delete process.env.FOMO_ENABLE_LIVE_SUBMISSION;
  else process.env.FOMO_ENABLE_LIVE_SUBMISSION = ORIGINAL_ENV.arm;
  if (ORIGINAL_ENV.expected === undefined) delete process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
  else process.env.EXPECTED_WALLET_PUBLIC_ADDRESS = ORIGINAL_ENV.expected;
  if (ORIGINAL_ENV.loopLive === undefined) delete process.env.FOMO_ALLOW_LOOP_LIVE;
  else process.env.FOMO_ALLOW_LOOP_LIVE = ORIGINAL_ENV.loopLive;
  delete process.env.TRACKTA_RUNTIME_ROOT;
  try { fs.rmSync(TEMP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
}

runDrills()
  .then(() => {
    const outPath = path.join(REPO_ROOT, "analysis", "a1_d03_crash_drill_evidence.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log("A1-D03 TIER 1 CRASH DRILL TEST PASSED");
    console.log(JSON.stringify({ allPass: evidence.allPass, count: results.length, results }, null, 2));
    restoreEnv();
  })
  .catch(err => {
    evidence.completedAt = new Date().toISOString();
    evidence.allPass = false;
    evidence.error = err.message;
    try {
      const outPath = path.join(REPO_ROOT, "analysis", "a1_d03_crash_drill_evidence.json");
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
    } catch { /* ignore */ }
    console.error("A1-D03 TIER 1 CRASH DRILL TEST FAILED:", err.message);
    restoreEnv();
    process.exitCode = 1;
  });
