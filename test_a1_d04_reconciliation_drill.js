"use strict";
// A1-D04 reconciliation fixture drill — D4-0 preflight/postflight + D4-1…D4-9
// (A1-D04 RECONCILIATION DRILL AUTHORIZATION — 2026-07-06).
// TRACKTA_RUNTIME_ROOT temp only; synthetic keypairs; mocked RPC; no production secrets.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const REPO_ROOT = __dirname;
const PROD_CONFIG = path.join(REPO_ROOT, "live_config.json");
const RECOVERY_FILE = path.join(REPO_ROOT, "recovery_actions.jsonl");

const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "a1-d04-recon-drill-"));
process.env.TRACKTA_RUNTIME_ROOT = TEMP_ROOT;

const ORIGINAL_ENV = {
  signer: process.env.SOLANA_SIGNER_SECRET,
  rpc: process.env.SOLANA_RPC_URL,
  arm: process.env.FOMO_ENABLE_LIVE_SUBMISSION,
  loopLive: process.env.FOMO_ALLOW_LOOP_LIVE
};

const evidence = {
  gate: "A1-D04 Reconciliation Drill Execution",
  tmpRoot: TEMP_ROOT,
  preflight: {},
  drills: {},
  rbG9ManualCapture: null,
  startedAt: new Date().toISOString()
};
const results = [];

function record(id, pass, detail = "") {
  evidence.drills[id] = { pass, detail };
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
  const secretBytes = [...seed, ...publicBytes];
  return {
    secretBytes,
    secretJson: JSON.stringify(secretBytes),
    address: encodeBase58(publicBytes)
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
    pairAddress: "d4-pair",
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

function seedRuntime(walletAddress, overrides = {}) {
  fs.writeFileSync(
    path.join(TEMP_ROOT, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      automationEnabled: true,
      emergencyStop: false,
      walletPublicAddress: walletAddress,
      positionSizeSol: 0.01,
      maxOpenTrades: 1,
      ...overrides
    }, null, 2)}\n`
  );
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
              owner: kp.address,
              mint: "11111111111111111111111111111111",
              uiTokenAmount: { uiAmount: 100, uiAmountString: "100" }
            }]
          }
        }
      })
    }));
  }
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
  process.env.SOLANA_RPC_URL = "https://dedicated-rpc.d4.invalid/?api-key=fake-d4-key";
  process.env.FOMO_ENABLE_LIVE_SUBMISSION = "YES";
  process.env.SOLANA_SIGNER_SECRET = kp.secretJson;
}

function clearLiveEnv() {
  delete process.env.SOLANA_SIGNER_SECRET;
  delete process.env.SOLANA_RPC_URL;
  delete process.env.FOMO_ENABLE_LIVE_SUBMISSION;
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

function assertSecretFree(rows, secretJson) {
  const text = rows.map(r => JSON.stringify(r)).join("\n");
  assert(!text.includes(secretJson), "secret material must not appear in audit/reconciliation rows");
  for (const row of rows) {
    assert(typeof row === "object" && row !== null, "row must be parse-valid object");
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
    timestamp: new Date().toISOString()
  };
}

async function runDrills() {
  const prodConfigHashBefore = sha256File(PROD_CONFIG);
  runPreflight(prodConfigHashBefore);

  const kp = makeTestKeypair();
  seedRuntime(kp.address);
  executor = require("./live_executor");

  const armed = r16().computeLiveArmedStatus(JSON.parse(fs.readFileSync(PROD_CONFIG, "utf8")));
  const exposure = r16().resolveCapitalExposureForLiveGate(JSON.parse(fs.readFileSync(PROD_CONFIG, "utf8")));
  evidence.preflight.liveArmed = armed.liveArmed;
  evidence.preflight.capitalExposure = exposure;
  assert(!armed.liveArmed, "production liveArmed must be false");
  assert(exposure === "none", "production capitalExposure must be none");
  record("D4-0", true, `preflight OK — ${evidence.preflight.executionMode} · dryRunMode true · liveArmed false · capitalExposure none`);

  const pipeline = executor.__pipelineDryRunTest;
  const submissionTest = executor.__submissionTest;
  const pendingFile = executor.FILES.PENDING_RECONCILIATION_FILE;
  const auditFile = executor.FILES.EXECUTION_AUDIT_FILE;
  const configPath = path.join(TEMP_ROOT, "live_config.json");

  assert(pendingFile.startsWith(TEMP_ROOT), "pending file under temp root");
  assert(auditFile.startsWith(TEMP_ROOT), "audit file under temp root");

  const entryAmbiguity = [];

  // D4-1 / D4-2 / D4-3 — ambiguous entry fixtures (SUBMISSION_UNKNOWN, CONFIRMATION_UNKNOWN, FILL_PARSE_UNKNOWN)
  resetMocks();
  armLiveEnv(kp);
  installLiveMocks(kp, { submissionThrow: true });
  pipeline.setSignerLoaderForTest(() => mockSigner(kp));
  const posBeforeSub = readPositions().length;
  const pendingBeforeSub = readRows(pendingFile).length;
  await expectCode(codes().SUBMISSION_UNKNOWN, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }))
  );
  assert(readPositions().length === posBeforeSub, "no position on SUBMISSION_UNKNOWN");
  assert(readRows(pendingFile).length > pendingBeforeSub, "SUBMISSION_UNKNOWN reconciliation row");
  assert(readRows(pendingFile).some(r => r.action === "SUBMISSION_UNKNOWN" && r.operatorActionRequired === true), "SUBMISSION_UNKNOWN operatorActionRequired");
  entryAmbiguity.push("SUBMISSION_UNKNOWN");

  resetMocks();
  armLiveEnv(kp);
  installLiveMocks(kp, { confirmNever: true });
  const posBeforeConf = readPositions().length;
  const pendingBeforeConf = readRows(pendingFile).length;
  await expectCode(codes().CONFIRMATION_TIMEOUT, () =>
    submissionTest.awaitConfirmation(
      "FullConfirmationTimeoutSignature111111111111111111111111111",
      baseCfg({ confirmationTimeoutMs: 0, walletPublicAddress: kp.address }),
      {
        kind: "BUY",
        tokenAddress: "11111111111111111111111111111111",
        pairAddress: "d4-pair",
        builtSwap: { metadata: { lastValidBlockHeight: 777 } }
      }
    )
  );
  assert(readPositions().length === posBeforeConf, "no position on CONFIRMATION_UNKNOWN");
  assert(readRows(pendingFile).length > pendingBeforeConf, "CONFIRMATION_UNKNOWN reconciliation row");
  assert(readRows(pendingFile).some(r => r.action === "CONFIRMATION_UNKNOWN"), "CONFIRMATION_UNKNOWN row present");
  entryAmbiguity.push("CONFIRMATION_UNKNOWN");

  resetMocks();
  armLiveEnv(kp);
  installLiveMocks(kp, { fillThrow: true });
  pipeline.setSignerLoaderForTest(() => mockSigner(kp));
  const posBeforeFill = readPositions().length;
  const pendingBeforeFill = readRows(pendingFile).length;
  await expectCode(codes().FILL_PARSE_FAILED, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }))
  );
  assert(readPositions().length === posBeforeFill, "no position on FILL_PARSE_UNKNOWN");
  assert(readRows(pendingFile).some(r => r.action === "FILL_PARSE_UNKNOWN"), "FILL_PARSE_UNKNOWN row present");
  entryAmbiguity.push("FILL_PARSE_UNKNOWN");

  record("D4-1", true, `ambiguous entry fixtures: ${entryAmbiguity.join(", ")}`);
  record("D4-2", true, "no position write on ambiguous entry (all three paths)");
  record("D4-3", true, "reconciliation rows appended with operatorActionRequired");

  // D4-4 — ambiguous exit leaves position OPEN
  resetMocks();
  armLiveEnv(kp);
  fs.writeFileSync(
    configPath,
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      automationEnabled: true,
      emergencyStop: false,
      walletPublicAddress: kp.address,
      positionSizeSol: 0.01,
      maxOpenTrades: 1,
      confirmationTimeoutMs: 30000,
      confirmationCommitment: "confirmed"
    }, null, 2)}\n`
  );
  const openPos = {
    liveTradeId: "d4-exit-1",
    symbol: "TEST",
    address: "11111111111111111111111111111111",
    pairAddress: "d4-pair",
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
  pipeline.setSignerLoaderForTest(() => mockSigner(kp));
  try {
    await executor.executeLiveExit("d4-exit-1", { triggerType: "STOP", triggerPrice: 0.00005 });
  } catch {
    // expected submit failure
  }
  const afterExit = readPositions();
  assert(afterExit.length === 1 && afterExit[0].status === "OPEN", "position remains OPEN after failed exit");
  record("D4-4", true, "exit-side submit failure leaves position OPEN");
  fs.writeFileSync(path.join(TEMP_ROOT, "live_positions.json"), "[]\n");

  // D4-5 — no auto-resolution inside executor
  const src = fs.readFileSync(path.join(REPO_ROOT, "live_executor.js"), "utf8");
  const appendOnly = (src.match(/appendJsonl\(PENDING_RECONCILIATION_FILE/g) || []).length >= 1;
  const noAutoResolution = !/readJsonl\(PENDING_RECONCILIATION_FILE|autoRetry|autoResolve|resumePending/i.test(src);
  assert(appendOnly && noAutoResolution && src.includes("countPendingReconciliationEntries"), "executor append-only pending reconciliation");
  resetMocks();
  const seededRow = {
    timestamp: new Date().toISOString(),
    operatorActionRequired: true,
    action: "CONFIRMATION_UNKNOWN",
    liveTradeId: "d4-no-auto"
  };
  const seededText = `${JSON.stringify(seededRow)}\n`;
  fs.writeFileSync(pendingFile, seededText);
  const gateBlocked = r16().safetyCheckForTest(baseCfg({ automationEnabled: true }));
  assert(!gateBlocked.allowed, "new entry blocked while pending exists");
  assert(fs.readFileSync(pendingFile, "utf8") === seededText, "pending row unchanged — no auto-resolution");
  record("D4-5", true, "static + runtime: append-only; no auto-resolve path invoked");

  // D4-6 — pending ambiguity + e-stop/safety interlock blocks new entries
  resetMocks();
  fs.writeFileSync(pendingFile, seededText);
  const pendingGate = r16().safetyCheckForTest(baseCfg({ automationEnabled: true }));
  assert(!pendingGate.allowed && pendingGate.reasons.some(r => r.includes("Pending reconciliation")), "safetyCheck blocks pending ambiguity");

  armLiveEnv(kp);
  r16().setWalletBalanceForTest(1.0);
  installLiveMocks(kp);
  pipeline.setSignerLoaderForTest(() => mockSigner(kp));
  await expectCode(codes().PENDING_RECONCILIATION_BLOCKS_ENTRY, () =>
    pipeline.submitSwapForTest("BUY", swapArgs({ walletPublicAddress: kp.address }))
  );

  fs.writeFileSync(configPath, `${JSON.stringify({ ...JSON.parse(fs.readFileSync(configPath, "utf8")), emergencyStop: true }, null, 2)}\n`);
  const dualGate = r16().safetyCheckForTest(baseCfg({ emergencyStop: true, automationEnabled: true }));
  assert(!dualGate.allowed, "dual block active");
  assert(
    dualGate.reasons.some(r => r.includes("Emergency stop")) &&
    dualGate.reasons.some(r => r.includes("Pending reconciliation")),
    "e-stop + pending reconciliation both present"
  );
  record("D4-6", true, "safetyCheck + LIVE pre-submit + dual e-stop/pending block new entries");

  // D4-7 — audit/reconciliation append-only and secret-free
  resetMocks();
  armLiveEnv(kp);
  installLiveMocks(kp, { submissionThrow: true });
  pipeline.setSignerLoaderForTest(() => mockSigner(kp));
  const auditBefore = readRows(auditFile).length;
  const pendingBefore = readRows(pendingFile).length;
  await expectCode(codes().SUBMISSION_UNKNOWN, () =>
    submissionTest.submitRawTransaction(signedBytesForHelper(), baseCfg({ walletPublicAddress: kp.address }), {
      kind: "BUY",
      builtSwap: { metadata: { lastValidBlockHeight: 50 } }
    })
  );
  const auditAfter = readRows(auditFile);
  const pendingAfter = readRows(pendingFile);
  assert(auditAfter.length >= auditBefore, "audit rows append-only");
  assert(pendingAfter.length > pendingBefore, "reconciliation rows append-only");
  assertSecretFree(auditAfter, kp.secretJson);
  assertSecretFree(pendingAfter, kp.secretJson);
  record("D4-7", true, "audit/reconciliation append-only; parse-valid; secret-free");

  // D4-9 — RB-G9 §5.5 manual artifact capture (structured storage TBD)
  const pendingSummary = pendingAfter.map(r => r.action).filter(Boolean);
  evidence.rbG9ManualCapture = {
    sessionApprovalId: "A1-D04-FIXTURE-NOT-LIVE",
    tradeSequence: "fixture-drill-only",
    tokenPairTxSig: "11111111111111111111111111111111 / d4-pair / mocked-tx",
    entryOrExit: "entry+exit ambiguity fixtures",
    realizedSlippageFees: "n/a — fixture drill",
    positionWriteConfirmed: false,
    reconciliationTriggered: true,
    engineeringValidationNotes: "no edge claim — fixture-only A1-D04 drill",
    continueOrHalt: "halt — operator review required on ambiguity",
    operatorInitialsTimestamp: "Cursor fixture drill / 2026-07-06",
    ambiguityActionsObserved: pendingSummary,
    structuredStoragePath: "TBD at R15 artifact gate"
  };
  const rbG9Path = path.join(REPO_ROOT, "analysis", "a1_d04_rb_g9_manual_capture.json");
  fs.mkdirSync(path.dirname(rbG9Path), { recursive: true });
  fs.writeFileSync(rbG9Path, `${JSON.stringify(evidence.rbG9ManualCapture, null, 2)}\n`);
  record("D4-9", true, "RB-G9 §5.5 manual template captured at analysis/a1_d04_rb_g9_manual_capture.json");

  // D4-8 — post-drill cleanup / posture (production unchanged; harness DRY/unarmed)
  clearLiveEnv();
  resetMocks();
  seedRuntime(kp.address);
  const harnessCfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert(harnessCfg.executionMode === "PIPELINE_DRY_RUN", "harness executionMode DRY");
  assert(harnessCfg.dryRunMode === true, "harness dryRunMode true");
  assert(!r16().computeLiveArmedStatus(harnessCfg).liveArmed, "harness liveArmed false");
  assert(r16().resolveCapitalExposureForLiveGate(harnessCfg) === "none", "capitalExposure none");

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
  assert(evidence.postflight.productionConfigUnchanged, "production live_config.json unchanged");
  record("D4-8", true, "cleanup restores DRY/unarmed/no-capital; production config hash unchanged");

  evidence.completedAt = new Date().toISOString();
  evidence.allPass = results.every(r => r.pass);
  evidence.summary = results;
  evidence.entryAmbiguity = entryAmbiguity;
}

function restoreEnv() {
  if (executor?.__r16LivePathTest) {
    executor.__r16LivePathTest.resetMicroLiveApprovalGateForTest();
  }
  if (executor) resetMocks();
  clearLiveEnv();
  if (ORIGINAL_ENV.signer === undefined) delete process.env.SOLANA_SIGNER_SECRET;
  else process.env.SOLANA_SIGNER_SECRET = ORIGINAL_ENV.signer;
  if (ORIGINAL_ENV.rpc === undefined) delete process.env.SOLANA_RPC_URL;
  else process.env.SOLANA_RPC_URL = ORIGINAL_ENV.rpc;
  if (ORIGINAL_ENV.arm === undefined) delete process.env.FOMO_ENABLE_LIVE_SUBMISSION;
  else process.env.FOMO_ENABLE_LIVE_SUBMISSION = ORIGINAL_ENV.arm;
  if (ORIGINAL_ENV.loopLive === undefined) delete process.env.FOMO_ALLOW_LOOP_LIVE;
  else process.env.FOMO_ALLOW_LOOP_LIVE = ORIGINAL_ENV.loopLive;
  delete process.env.TRACKTA_RUNTIME_ROOT;
  try { fs.rmSync(TEMP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
}

runDrills()
  .then(() => {
    const outPath = path.join(REPO_ROOT, "analysis", "a1_d04_reconciliation_drill_evidence.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log("A1-D04 RECONCILIATION DRILL TEST PASSED");
    console.log(JSON.stringify({ allPass: evidence.allPass, count: results.length, results }, null, 2));
    restoreEnv();
  })
  .catch(err => {
    evidence.completedAt = new Date().toISOString();
    evidence.allPass = false;
    evidence.error = err.message;
    try {
      const outPath = path.join(REPO_ROOT, "analysis", "a1_d04_reconciliation_drill_evidence.json");
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
    } catch { /* ignore */ }
    console.error("A1-D04 RECONCILIATION DRILL TEST FAILED:", err.message);
    restoreEnv();
    process.exitCode = 1;
  });
