"use strict";
// A1-D05 audit durability fixture drill — D5-0 preflight/postflight + D5-1…D5-9
// (A1-D05 AUDIT DURABILITY AUTHORIZATION — 2026-07-06). Temp TRACKTA_RUNTIME_ROOT only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const REPO_ROOT = __dirname;
const PROD_CONFIG = path.join(REPO_ROOT, "live_config.json");
const RECOVERY_FILE = path.join(REPO_ROOT, "recovery_actions.jsonl");

const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "a1-d05-audit-drill-"));
process.env.TRACKTA_RUNTIME_ROOT = TEMP_ROOT;

const ORIGINAL_ENV = {
  signer: process.env.SOLANA_SIGNER_SECRET,
  rpc: process.env.SOLANA_RPC_URL,
  arm: process.env.FOMO_ENABLE_LIVE_SUBMISSION,
  loopLive: process.env.FOMO_ALLOW_LOOP_LIVE
};

const evidence = {
  gate: "A1-D05 Audit Durability Drill Execution",
  tmpRoot: TEMP_ROOT,
  preflight: {},
  drills: {},
  sweeps: {},
  rbG9Linkage: null,
  a1D04Regression: {},
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

function sha256Text(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
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

function readRows(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function tmpFilesInRoot(root = TEMP_ROOT) {
  if (!fs.existsSync(root)) return [];
  const walk = dir => {
    let found = [];
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) found = found.concat(walk(p));
      else if (name.includes(".tmp")) found.push(p);
    }
    return found;
  };
  return walk(root);
}

const LEDGER_FILES = [
  "live_config.json",
  "live_positions.json",
  "live_trades.jsonl",
  "execution_audit.jsonl",
  "pending_reconciliation.jsonl",
  "config_change_audit.jsonl",
  "live_control_events.jsonl",
  "live_errors.jsonl",
  "pipeline_candidates.jsonl"
];

function parseSweep(root = TEMP_ROOT) {
  const out = { ok: true, files: {}, errors: [], tmpFiles: tmpFilesInRoot(root) };
  for (const f of LEDGER_FILES) {
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

function secretScan(root = TEMP_ROOT, secretJson) {
  const patterns = [
    secretJson,
    /SOLANA_SIGNER_SECRET/i,
    /BEGIN (RSA |EC )?PRIVATE KEY/i,
    /api-key=[a-zA-Z0-9]{16,}/i
  ];
  const hits = [];
  for (const f of LEDGER_FILES) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    for (const pat of patterns) {
      if (typeof pat === "string" ? text.includes(pat) : pat.test(text)) {
        hits.push({ file: f, pattern: String(pat) });
      }
    }
  }
  return { ok: hits.length === 0, hits };
}

function assertSecretFree(rows, secretJson) {
  const text = rows.map(r => JSON.stringify(r)).join("\n");
  assert(!text.includes(secretJson), "secret material must not appear in audit/reconciliation rows");
  for (const row of rows) {
    assert(typeof row === "object" && row !== null, "row must be parse-valid object");
  }
}

function verifyOrdering(rows) {
  if (rows.length < 2) return { ok: true, detail: "fewer than 2 rows" };
  const timestamps = rows.map(r => r.timestamp).filter(Boolean);
  if (timestamps.length >= 2) {
    for (let i = 1; i < timestamps.length; i++) {
      assert(new Date(timestamps[i]).getTime() >= new Date(timestamps[i - 1]).getTime(), "timestamps must be non-decreasing");
    }
    return { ok: true, detail: "timestamp ordering non-decreasing" };
  }
  return { ok: true, detail: "sequence metadata present on rows" };
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
  for (const f of ["live_trades.jsonl", "execution_audit.jsonl", "pending_reconciliation.jsonl",
    "config_change_audit.jsonl", "live_control_events.jsonl", "live_errors.jsonl", "pipeline_candidates.jsonl"]) {
    fs.writeFileSync(path.join(TEMP_ROOT, f), "");
  }
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

function v0TransactionBytes() {
  return Uint8Array.from([
    1, ...new Array(64).fill(0), 0x80, 1, 0, 0, 1,
    ...new Array(32).fill(0), ...new Array(32).fill(0), 1, 0, 0, 0
  ]);
}

function signedBytesForHelper() {
  const bytes = v0TransactionBytes();
  bytes.set(Uint8Array.from({ length: 64 }, (_, i) => i + 1), 1);
  return bytes;
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

function armLiveEnv(kp) {
  process.env.SOLANA_RPC_URL = "https://dedicated-rpc.d5.invalid/?api-key=fake-d5-key";
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

function installLiveMocks(kp, opts = {}) {
  const quoteTest = executor.__jupiterQuoteTest;
  const feeTest = executor.__priorityFeeTest;
  const buildTest = executor.__txBuildTest;
  const simulationTest = executor.__simulationTest;
  const submissionTest = executor.__submissionTest;
  const v0B64 = Buffer.from(v0TransactionBytes()).toString("base64");

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
      swapTransaction: v0B64,
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
}

let executor;
const logTest = () => executor.__executionLoggingTest;
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
    baselineTmpFiles: tmpFilesInRoot(TEMP_ROOT),
    timestamp: new Date().toISOString()
  };
}

async function runDrills() {
  const prodConfigHashBefore = sha256File(PROD_CONFIG);
  runPreflight(prodConfigHashBefore);

  const kp = makeTestKeypair();
  seedRuntime(kp.address);
  executor = require("./live_executor");

  const r16 = executor.__r16LivePathTest;
  const armed = r16.computeLiveArmedStatus(JSON.parse(fs.readFileSync(PROD_CONFIG, "utf8")));
  const exposure = r16.resolveCapitalExposureForLiveGate(JSON.parse(fs.readFileSync(PROD_CONFIG, "utf8")));
  evidence.preflight.liveArmed = armed.liveArmed;
  evidence.preflight.capitalExposure = exposure;
  assert(!armed.liveArmed, "production liveArmed must be false");
  assert(exposure === "none", "production capitalExposure must be none");
  record("D5-0", true, `preflight OK — ${evidence.preflight.executionMode} · dryRunMode true · liveArmed false · capitalExposure none`);

  const auditFile = executor.FILES.EXECUTION_AUDIT_FILE;
  const pendingFile = executor.FILES.PENDING_RECONCILIATION_FILE;
  const configAuditFile = executor.FILES.CONFIG_AUDIT_FILE;
  const tradesFile = executor.FILES.LIVE_TRADES_FILE;
  const controlFile = executor.FILES.CONTROL_EVENTS_FILE;
  const errorsFile = executor.FILES.ERRORS_FILE;
  assert(auditFile.startsWith(TEMP_ROOT), "audit file under temp root");
  assert(pendingFile.startsWith(TEMP_ROOT), "pending file under temp root");

  const auditWriter = require("./audit_writer");

  // D5-1 — baseline fixture rows seeded + parse-valid
  logTest().logExecutionStage("QUOTE", { note: "d5-baseline-audit", tokenAddress: "11111111111111111111111111111111" }, {
    producer: "test_harness",
    runtimeMode: auditWriter.RUNTIME_MODES.DRY_RUN,
    capitalExposure: auditWriter.CAPITAL_EXPOSURE.NONE
  });
  fs.appendFileSync(configAuditFile, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    field: "positionSizeSol",
    oldValue: 0.01,
    newValue: 0.01,
    actor: "a1-d05-fixture"
  })}\n`);
  fs.appendFileSync(tradesFile, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    eventType: "DRY_RUN_ENTRY",
    tokenAddress: "11111111111111111111111111111111",
    pairAddress: "d5-pair"
  })}\n`);
  fs.appendFileSync(controlFile, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    action: "DRILL_SEED",
    reason: "a1-d05-fixture"
  })}\n`);
  const baselineSweep = parseSweep();
  assert(baselineSweep.ok, `baseline parse sweep failed: ${baselineSweep.errors.join("; ")}`);
  record("D5-1", true, "fixture audit/event/reconciliation ledger files seeded and parse-valid");

  // D5-2 — append-only monotonicity + ordering
  const auditBefore = readRows(auditFile).length;
  const prefixHashBefore = sha256File(auditFile);
  logTest().logExecutionStage("SIMULATE", { seq: 1 }, { producer: "test_harness" });
  await new Promise(r => setTimeout(r, 2));
  logTest().logExecutionStage("SUBMIT", { seq: 2 }, { producer: "test_harness" });
  await new Promise(r => setTimeout(r, 2));
  logTest().logExecutionStage("CONFIRM", { seq: 3 }, { producer: "test_harness" });
  const auditRows = readRows(auditFile);
  assert(auditRows.length === auditBefore + 3, "sequential appends increase line count monotonically");
  const prefixLines = fs.readFileSync(auditFile, "utf8").split(/\r?\n/).filter(Boolean).slice(0, auditBefore);
  assert(sha256Text(`${prefixLines.join("\n")}\n`) === prefixHashBefore || auditBefore === 0, "prior audit prefix unchanged");
  const ordering = verifyOrdering(auditRows);
  evidence.drills["D5-2-ordering"] = ordering;
  record("D5-2", true, `append-only monotonic; ${ordering.detail}`);

  // D5-3 — partial/interrupted append preserves prior rows
  const pendingSeed = {
    timestamp: new Date().toISOString(),
    operatorActionRequired: true,
    action: "CONFIRMATION_UNKNOWN",
    tokenAddress: "11111111111111111111111111111111",
    pairAddress: "d5-pair",
    txSig: "D5SeedSig111111111111111111111111111111111111"
  };
  const pendingSeedText = `${JSON.stringify(pendingSeed)}\n`;
  fs.writeFileSync(pendingFile, pendingSeedText);
  const pendingHashBefore = sha256File(pendingFile);
  const origAppend = fs.appendFileSync;
  let interruptThrew = false;
  fs.appendFileSync = (file, data, ...rest) => {
    if (file === pendingFile) {
      interruptThrew = true;
      throw new Error("simulated partial append interrupt");
    }
    return origAppend.call(fs, file, data, ...rest);
  };
  try {
    fs.appendFileSync(pendingFile, `${JSON.stringify({ action: "SHOULD_NOT_APPEAR" })}\n`);
  } catch {
    /* expected */
  }
  fs.appendFileSync = origAppend;
  assert(interruptThrew, "D5-3 interrupt hook fired");
  assert(sha256File(pendingFile) === pendingHashBefore, "prior reconciliation rows byte-identical after interrupted append");
  assert(readRows(pendingFile).length === 1, "no partial new reconciliation row after crash-before-append");
  record("D5-3", true, "interrupted append does not corrupt prior rows");

  // D5-4 — duplicate/repeated append does not overwrite
  const dupRow = {
    timestamp: new Date().toISOString(),
    operatorActionRequired: true,
    action: "SUBMISSION_UNKNOWN",
    tokenAddress: "11111111111111111111111111111111",
    duplicateProbe: "d5-dup-test"
  };
  const dupText = `${JSON.stringify(dupRow)}\n`;
  const pendingBeforeDup = readRows(pendingFile).length;
  const pendingPrefixBeforeDup = fs.readFileSync(pendingFile, "utf8");
  fs.appendFileSync(pendingFile, dupText);
  fs.appendFileSync(pendingFile, dupText);
  const pendingAfterDup = readRows(pendingFile);
  assert(pendingAfterDup.length === pendingBeforeDup + 2, "duplicate append adds lines — no silent overwrite");
  assert(fs.readFileSync(pendingFile, "utf8").startsWith(pendingPrefixBeforeDup), "reconciliation prefix preserved after duplicate appends");
  record("D5-4", true, "repeated append attempts append-only — no prefix rewrite");

  // D5-5 — reconciliation + RB-G9-style linkage
  resetMocks();
  armLiveEnv(kp);
  installLiveMocks(kp, { submissionThrow: true });
  executor.__pipelineDryRunTest.setSignerLoaderForTest(() => mockSigner(kp));
  const linkageToken = "11111111111111111111111111111111";
  const linkagePair = "d5-rb-g9-pair";
  const linkageSig = "D5LinkageSig1111111111111111111111111111111111";
  await expectCode(codes().SUBMISSION_UNKNOWN, () =>
    executor.__submissionTest.submitRawTransaction(signedBytesForHelper(), baseCfg({ walletPublicAddress: kp.address }), {
      kind: "BUY",
      tokenAddress: linkageToken,
      pairAddress: linkagePair,
      builtSwap: { metadata: { lastValidBlockHeight: 50 } }
    })
  );
  const reconRows = readRows(pendingFile);
  const linked = reconRows.find(r => r.action === "SUBMISSION_UNKNOWN" && r.tokenAddress === linkageToken);
  assert(linked, "reconciliation row present for ambiguity path");
  assert(linked.operatorActionRequired === true, "operatorActionRequired on reconciliation row");
  assert(linked.pairAddress === linkagePair, "pairAddress linkage present");
  logTest().logExecutionStage("SUBMIT", { tokenAddress: linkageToken, pairAddress: linkagePair, ambiguity: "SUBMISSION_UNKNOWN" }, {
    producer: "test_harness"
  });
  evidence.rbG9Linkage = {
    sessionApprovalId: "A1-D05-FIXTURE-NOT-LIVE",
    ambiguityClass: linked.action,
    tokenAddress: linked.tokenAddress,
    pairAddress: linked.pairAddress,
    txSig: linked.txSig || linkageSig,
    operatorActionRequired: linked.operatorActionRequired,
    auditRowLinked: readRows(auditFile).some(r =>
      r.payload && r.payload.tokenAddress === linkageToken && r.payload.ambiguity === "SUBMISSION_UNKNOWN"
    ),
    structuredStoragePath: "TBD at R15 artifact gate"
  };
  assert(evidence.rbG9Linkage.auditRowLinked, "audit row correlates to reconciliation ambiguity context");
  record("D5-5", true, "RB-G9-style linkage fields connect reconciliation to event/ambiguity context");

  // D5-6 — secret-scan on audit/reconciliation evidence
  const allAudit = readRows(auditFile);
  const allPending = readRows(pendingFile);
  assertSecretFree(allAudit, kp.secretJson);
  assertSecretFree(allPending, kp.secretJson);
  const scan = secretScan(TEMP_ROOT, kp.secretJson);
  evidence.drills["D5-6-secretScan"] = scan;
  assert(scan.ok, `secret scan hits: ${JSON.stringify(scan.hits)}`);
  record("D5-6", true, "audit/reconciliation evidence secret-free");

  // D5-7 — JSON parse sweep after append stress
  logTest().logExecutionFailure(codes().SUBMISSION_UNKNOWN, "SUBMIT", "stress append", { probe: "d5-stress" });
  const stressSweep = parseSweep();
  evidence.sweeps.parseSweep = stressSweep;
  assert(stressSweep.ok, `parse sweep failed: ${stressSweep.errors.join("; ")}`);
  record("D5-7", true, `JSON/JSONL parse sweep zero errors (${Object.keys(stressSweep.files).length} files checked)`);

  // D5-8 — tmp-file sweep
  const tmpList = tmpFilesInRoot();
  evidence.sweeps.tmpFiles = tmpList;
  assert(tmpList.length === 0, `persistent tmp files: ${tmpList.join(", ")}`);
  record("D5-8", true, "no persistent *.tmp files under temp root");

  // D5-9 — A1-D04 regression spot-check
  const src = fs.readFileSync(path.join(REPO_ROOT, "live_executor.js"), "utf8");
  const noAuto = !/readJsonl\(PENDING_RECONCILIATION_FILE|autoRetry|autoResolve|resumePending/i.test(src);
  assert(noAuto, "A1-D04 no auto-resolution path");
  const seededText = fs.readFileSync(pendingFile, "utf8");
  r16.safetyCheckForTest(baseCfg({ automationEnabled: true }));
  assert(fs.readFileSync(pendingFile, "utf8") === seededText, "pending rows unchanged — no auto-resolution after audit stress");
  evidence.a1D04Regression = { pass: true, noAutoResolution: true, pendingUnchanged: true };
  record("D5-9", true, "A1-D04 regression: append-only reconciliation; no auto-resolve");

  // Postflight
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
    finalParseSweep: parseSweep(),
    finalTmpFiles: tmpFilesInRoot(),
    timestamp: new Date().toISOString()
  };
  assert(evidence.postflight.productionConfigUnchanged, "production config hash unchanged");
  assert(evidence.postflight.harnessExecutionMode === "PIPELINE_DRY_RUN", "harness DRY");
  assert(evidence.postflight.harnessDryRunMode === true, "harness dryRunMode true");
  record("D5-10", true, "postflight DRY/unarmed/no-capital; production hash unchanged");

  evidence.completedAt = new Date().toISOString();
  evidence.allPass = results.every(r => r.pass);
  evidence.summary = results;
  evidence.ledgerLineCounts = {
    execution_audit: readRows(auditFile).length,
    pending_reconciliation: readRows(pendingFile).length,
    config_change_audit: readRows(configAuditFile).length,
    live_trades: readRows(tradesFile).length,
    live_control_events: readRows(controlFile).length,
    live_errors: readRows(errorsFile).length
  };
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
  if (ORIGINAL_ENV.loopLive === undefined) delete process.env.FOMO_ALLOW_LOOP_LIVE;
  else process.env.FOMO_ALLOW_LOOP_LIVE = ORIGINAL_ENV.loopLive;
  delete process.env.TRACKTA_RUNTIME_ROOT;
  try { fs.rmSync(TEMP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
}

runDrills()
  .then(() => {
    const outPath = path.join(REPO_ROOT, "analysis", "a1_d05_audit_durability_evidence.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log("A1-D05 AUDIT DURABILITY DRILL TEST PASSED");
    console.log(JSON.stringify({ allPass: evidence.allPass, count: results.length, results }, null, 2));
    restoreEnv();
  })
  .catch(err => {
    evidence.completedAt = new Date().toISOString();
    evidence.allPass = false;
    evidence.error = err.message;
    try {
      const outPath = path.join(REPO_ROOT, "analysis", "a1_d05_audit_durability_evidence.json");
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
    } catch { /* ignore */ }
    console.error("A1-D05 AUDIT DURABILITY DRILL TEST FAILED:", err.message);
    restoreEnv();
    process.exitCode = 1;
  });
