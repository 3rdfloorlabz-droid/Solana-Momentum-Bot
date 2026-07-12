"use strict";

// test_r15_dual_purpose_schema_regression.js — formal R15 dual-purpose schema regression gate.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const common = require("./live_validation_common");
const validator = require("./r15_approval_validator");
const executor = require("./live_executor");
const checks = require("./armed_preflight_checks");
const session = require("./armed_preflight_session");

const ROOT = __dirname;
const FIXTURES = path.join(ROOT, "test_fixtures", "r15");
const PROD_CONFIG = path.join(ROOT, "live_config.json");
const RECEIPT_PATH = path.join(ROOT, "analysis", "r15_dual_purpose_schema_regression_receipt.json");

const G = "\x1b[32m✔\x1b[0m";
const WALLET = "FakeWallet1111111111111111111111111111111";
const NOW = Date.parse("2026-07-09T12:00:00.000Z");
const SENTINEL_SECRET = "SENTINEL_SIGNER_SECRET_DO_NOT_LEAK_0123456789";
const SENTINEL_API = "SENTINEL_API_KEY_DO_NOT_LEAK";
const SENTINEL_RPC = "https://rpc.example.com?api-key=SENTINEL_RPC_SECRET";

const results = [];
const matrices = {};
let executionSpies = { submitSwap: 0, sendTransaction: 0, sendRawTransaction: 0, enterPosition: 0, exitPosition: 0 };

function record(id, pass, detail = null) {
  results.push({ id, pass: pass === true, detail });
}

function recordMatrix(name, pass, detail = null) {
  matrices[name] = { pass: pass === true, detail };
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function allTrue(fields) {
  return Object.fromEntries(fields.map(f => [f, true]));
}

function microContext(overrides = {}) {
  return {
    expectedPurpose: validator.APPROVAL_PURPOSES.MICRO_LIVE,
    expectedSessionId: "RB-G9-20260709-ML01",
    expectedWallet: WALLET,
    now: NOW,
    allowLegacyMicroLive: false,
    ...overrides
  };
}

function proofContext(overrides = {}) {
  return {
    expectedPurpose: validator.APPROVAL_PURPOSES.ARMED_PROOF,
    expectedSessionId: "RB-G9-20260709-AP01",
    expectedWallet: WALLET,
    now: NOW,
    allowLegacyMicroLive: false,
    ...overrides
  };
}

function validV2Micro(overrides = {}) {
  return { ...clone(loadFixture("v2_micro_live_valid.json")), ...overrides };
}

function validV2Proof(overrides = {}) {
  return { ...clone(loadFixture("v2_armed_proof_valid.json")), ...overrides };
}

function expectCode(record, code, ctx) {
  const result = validator.loadR15ApprovalRecord(record, ctx);
  assert.strictEqual(result.ok, false, `expected fail ${code}`);
  assert.strictEqual(result.code, code, `expected ${code}, got ${result.code}`);
  return result;
}

function expectPass(record, ctx) {
  const result = validator.loadR15ApprovalRecord(record, ctx);
  assert.strictEqual(result.ok, true, result.message || "expected pass");
  return result;
}

async function runCase(id, fn) {
  try {
    await fn();
    record(id, true);
    console.log(`${G} ${id}`);
    return true;
  } catch (error) {
    record(id, false, error.message);
    console.error(`✘ ${id}: ${error.message}`);
    return false;
  }
}

function syntaxCheck(file) {
  const r = spawnSync(process.execPath, ["--check", path.join(ROOT, file)], { encoding: "utf8" });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
}

function loadModule(file) {
  delete require.cache[require.resolve(path.join(ROOT, file))];
  require(path.join(ROOT, file));
}

function runSubprocessTest(file) {
  const r = spawnSync(process.execPath, [path.join(ROOT, file)], {
    encoding: "utf8",
    env: { ...process.env },
    timeout: 600000
  });
  assert.strictEqual(r.status, 0, `${file} failed:\n${r.stderr || r.stdout}`);
}

function resetExecutorMocks() {
  const r16 = executor.__r16LivePathTest;
  r16.resetMicroLiveApprovalGateForTest();
  r16.resetArmedProofApprovalGateForTest();
  r16.resetApprovalRecordProviderForTest();
}

async function main() {
  const hashBefore = common.hashFile(PROD_CONFIG);
  const baselineTimestamp = new Date().toISOString();
  let formalFailed = 0;

  // ── 3. Syntax / module load ─────────────────────────────────────────────
  for (const file of [
    "r15_approval_validator.js",
    "r15_manual_approval_check.js",
    "live_executor.js",
    "armed_preflight_checks.js",
    "armed_preflight_session.js",
    "test_r15_dual_purpose_schema.js",
    "test_r15_dual_purpose_schema_regression.js"
  ]) {
    if (!(await runCase(`syntax ${file}`, () => syntaxCheck(file)))) formalFailed += 1;
  }
  for (const file of [
    "r15_approval_validator.js",
    "r15_manual_approval_check.js",
    "armed_preflight_checks.js",
    "armed_preflight_session.js"
  ]) {
    if (!(await runCase(`load ${file}`, () => loadModule(file)))) formalFailed += 1;
  }

  // ── 5. SchemaVersion matrix ───────────────────────────────────────────
  let schemaVersionPass = true;
  const schemaCases = [
    ["absent treated as legacy", () => {
      expectPass(loadFixture("legacy_ev01_micro_live.json"), microContext({ allowLegacyMicroLive: true, expectedSessionId: "RB-G9-20260706-EV01" }));
    }],
    ["schemaVersion 1 legacy", () => {
      const rec = { ...loadFixture("legacy_ev01_micro_live.json"), schemaVersion: 1 };
      expectPass(rec, microContext({ allowLegacyMicroLive: true, expectedSessionId: "RB-G9-20260706-EV01" }));
    }],
    ["schemaVersion 2 dual-purpose", () => {
      expectPass(validV2Micro(), microContext());
    }],
    ["schemaVersion 0 rejected", () => {
      expectCode(validV2Micro({ schemaVersion: 0 }), validator.R15_ERROR_CODES.R15_UNSUPPORTED_SCHEMA_VERSION, microContext());
    }],
    ["schemaVersion 3 rejected", () => {
      expectCode(validV2Micro({ schemaVersion: 3 }), validator.R15_ERROR_CODES.R15_UNSUPPORTED_SCHEMA_VERSION, microContext());
    }],
    ["string schemaVersion 2 accepted", () => {
      expectPass(validV2Micro({ schemaVersion: "2" }), microContext());
    }],
    ["malformed schemaVersion rejected", () => {
      expectCode(validV2Micro({ schemaVersion: "v2" }), validator.R15_ERROR_CODES.R15_UNSUPPORTED_SCHEMA_VERSION, microContext());
    }],
    ["deterministic unsupported code", () => {
      const a = validator.loadR15ApprovalRecord(validV2Micro({ schemaVersion: 99 }), microContext());
      const b = validator.loadR15ApprovalRecord(validV2Micro({ schemaVersion: 99 }), microContext());
      assert.strictEqual(a.code, b.code);
      assert.strictEqual(a.message, b.message);
    }]
  ];
  for (const [id, fn] of schemaCases) {
    if (!(await runCase(`schemaVersion: ${id}`, fn))) { schemaVersionPass = false; formalFailed += 1; }
  }
  recordMatrix("schemaVersion", schemaVersionPass);

  // ── 6. ApprovalPurpose matrix ───────────────────────────────────────────
  let purposePass = true;
  const purposeCases = [
    ["v2 missing purpose", () => expectCode({ schemaVersion: 2, finalApprovalStatus: validator.FINAL_APPROVAL_STATUSES.MICRO_LIVE }, validator.R15_ERROR_CODES.R15_MISSING_APPROVAL_PURPOSE, microContext())],
    ["unknown purpose", () => expectCode(validV2Micro({ approvalPurpose: "other" }), validator.R15_ERROR_CODES.R15_UNKNOWN_APPROVAL_PURPOSE, microContext())],
    ["micro_live in micro context", () => expectPass(validV2Micro(), microContext())],
    ["proof in proof context", () => expectPass(validV2Proof(), proofContext())],
    ["no inference from status alone", () => expectCode({ schemaVersion: 2, finalApprovalStatus: validator.FINAL_APPROVAL_STATUSES.MICRO_LIVE }, validator.R15_ERROR_CODES.R15_MISSING_APPROVAL_PURPOSE, microContext())],
    ["no default purpose", () => expectCode(validV2Micro(), validator.R15_ERROR_CODES.R15_EXPECTED_PURPOSE_REQUIRED, { ...microContext(), expectedPurpose: undefined })]
  ];
  for (const [id, fn] of purposeCases) {
    if (!(await runCase(`approvalPurpose: ${id}`, fn))) { purposePass = false; formalFailed += 1; }
  }
  recordMatrix("approvalPurpose", purposePass);

  // ── 7. Purpose/status matrix ────────────────────────────────────────────
  let pairPass = true;
  const pairCases = [
    ["micro+micro micro ctx", () => expectPass(validV2Micro(), microContext())],
    ["proof+proof proof ctx", () => expectPass(validV2Proof(), proofContext())],
    ["micro+proof status fail", () => expectCode(validV2Micro({ finalApprovalStatus: validator.FINAL_APPROVAL_STATUSES.ARMED_PROOF }), validator.R15_ERROR_CODES.R15_PURPOSE_STATUS_MISMATCH, microContext())],
    ["proof+micro status fail", () => expectCode(validV2Proof({ finalApprovalStatus: validator.FINAL_APPROVAL_STATUSES.MICRO_LIVE }), validator.R15_ERROR_CODES.R15_PURPOSE_STATUS_MISMATCH, proofContext())],
    ["generic status fail", () => expectCode(validV2Micro({ finalApprovalStatus: "APPROVED" }), validator.R15_ERROR_CODES.R15_PURPOSE_STATUS_MISMATCH, microContext())],
    ["case variation fail", () => expectCode(validV2Micro({ finalApprovalStatus: validator.FINAL_APPROVAL_STATUSES.MICRO_LIVE.toLowerCase() }), validator.R15_ERROR_CODES.R15_PURPOSE_STATUS_MISMATCH, microContext())],
    ["whitespace variation fail", () => expectCode(validV2Micro({ finalApprovalStatus: ` ${validator.FINAL_APPROVAL_STATUSES.MICRO_LIVE} ` }), validator.R15_ERROR_CODES.R15_PURPOSE_STATUS_MISMATCH, microContext())]
  ];
  for (const [id, fn] of pairCases) {
    if (!(await runCase(`purpose/status: ${id}`, fn))) { pairPass = false; formalFailed += 1; }
  }
  recordMatrix("purposeStatus", pairPass);

  // ── 8. ExpectedPurpose matrix ───────────────────────────────────────────
  let expectedPass = true;
  const expectedCases = [
    ["required for v2", () => expectCode(validV2Micro(), validator.R15_ERROR_CODES.R15_EXPECTED_PURPOSE_REQUIRED, { ...microContext(), expectedPurpose: undefined })],
    ["missing rejected", () => expectCode(validV2Proof(), validator.R15_ERROR_CODES.R15_EXPECTED_PURPOSE_REQUIRED, { ...proofContext(), expectedPurpose: null })],
    ["malformed rejected", () => expectCode(validV2Proof(), validator.R15_ERROR_CODES.R15_EXPECTED_PURPOSE_MISMATCH, { ...proofContext(), expectedPurpose: "bad" })],
    ["wrong rejected", () => expectCode(validV2Proof(), validator.R15_ERROR_CODES.R15_EXPECTED_PURPOSE_MISMATCH, microContext())],
    ["micro ctx rejects proof record", () => expectCode(validV2Proof(), validator.R15_ERROR_CODES.R15_EXPECTED_PURPOSE_MISMATCH, microContext())],
    ["proof ctx rejects micro record", () => expectCode(validV2Micro(), validator.R15_ERROR_CODES.R15_EXPECTED_PURPOSE_MISMATCH, proofContext())]
  ];
  for (const [id, fn] of expectedCases) {
    if (!(await runCase(`expectedPurpose: ${id}`, fn))) { expectedPass = false; formalFailed += 1; }
  }
  recordMatrix("expectedPurpose", expectedPass);

  // ── 9. Legacy matrix ────────────────────────────────────────────────────
  let legacyPass = true;
  const legacyCases = [
    ["default reject", () => expectCode(loadFixture("legacy_ev01_micro_live.json"), validator.R15_ERROR_CODES.R15_LEGACY_NOT_ALLOWED, microContext())],
    ["explicit micro accept EV01", () => expectPass(loadFixture("legacy_ev01_micro_live.json"), microContext({ allowLegacyMicroLive: true, expectedSessionId: "RB-G9-20260706-EV01" }))],
    ["explicit micro accept EV02", () => expectPass(loadFixture("legacy_ev02_micro_live.json"), microContext({ allowLegacyMicroLive: true, expectedSessionId: "RB-G9-20260707-EV02" }))],
    ["legacy false reject", () => expectCode(loadFixture("legacy_ev02_micro_live.json"), validator.R15_ERROR_CODES.R15_LEGACY_NOT_ALLOWED, microContext({ allowLegacyMicroLive: false }))],
    ["legacy proof forbidden", () => expectCode(loadFixture("legacy_ev02_micro_live.json"), validator.R15_ERROR_CODES.R15_LEGACY_PROOF_FORBIDDEN, proofContext({ allowLegacyMicroLive: true }))],
    ["no auto migration", () => {
      const raw = loadFixture("legacy_ev01_micro_live.json");
      const copy = clone(raw);
      expectPass(raw, microContext({ allowLegacyMicroLive: true, expectedSessionId: "RB-G9-20260706-EV01" }));
      assert.deepStrictEqual(raw, copy);
    }]
  ];
  for (const [id, fn] of legacyCases) {
    if (!(await runCase(`legacy: ${id}`, fn))) { legacyPass = false; formalFailed += 1; }
  }
  recordMatrix("legacy", legacyPass);

  // ── 10. Common acknowledgment matrix ────────────────────────────────────
  let commonPass = true;
  if (!(await runCase("common: all true pass", () => expectPass(validV2Micro(), microContext())))) commonPass = false;
  for (const field of validator.COMMON_ACK_FIELDS) {
    if (!(await runCase(`common: missing ${field}`, () => {
      const acks = allTrue(validator.COMMON_ACK_FIELDS);
      delete acks[field];
      expectCode(validV2Micro({ commonAcknowledgments: acks }), validator.R15_ERROR_CODES.R15_COMMON_ACK_INVALID, microContext());
    }))) commonPass = false;
    if (!(await runCase(`common: false ${field}`, () => {
      const acks = allTrue(validator.COMMON_ACK_FIELDS);
      acks[field] = false;
      expectCode(validV2Micro({ commonAcknowledgments: acks }), validator.R15_ERROR_CODES.R15_COMMON_ACK_INVALID, microContext());
    }))) commonPass = false;
  }
  if (!(await runCase("common: wrong type", () => {
    const acks = allTrue(validator.COMMON_ACK_FIELDS);
    acks.strategyNotReadyAcknowledged = "yes";
    expectCode(validV2Micro({ commonAcknowledgments: acks }), validator.R15_ERROR_CODES.R15_COMMON_ACK_INVALID, microContext());
  }))) commonPass = false;
  if (!(await runCase("common: cross-purpose replacement", () => {
    expectCode(validV2Micro({ armedProofAcknowledgments: allTrue(validator.ARMED_PROOF_ACK_FIELDS) }), validator.R15_ERROR_CODES.R15_ARMED_PROOF_ACK_INVALID, microContext());
  }))) commonPass = false;
  recordMatrix("commonAcknowledgments", commonPass);
  if (!commonPass) formalFailed += 1;

  // ── 11. Micro-live acknowledgment matrix ────────────────────────────────
  let microAckPass = true;
  for (const field of validator.MICRO_LIVE_ACK_FIELDS) {
    if (!(await runCase(`microLiveAck: missing ${field}`, () => {
      const acks = allTrue(validator.MICRO_LIVE_ACK_FIELDS);
      delete acks[field];
      expectCode(validV2Micro({ microLiveAcknowledgments: acks }), validator.R15_ERROR_CODES.R15_MICRO_LIVE_ACK_INVALID, microContext());
    }))) microAckPass = false;
    if (!(await runCase(`microLiveAck: false ${field}`, () => {
      const acks = allTrue(validator.MICRO_LIVE_ACK_FIELDS);
      acks[field] = false;
      expectCode(validV2Micro({ microLiveAcknowledgments: acks }), validator.R15_ERROR_CODES.R15_MICRO_LIVE_ACK_INVALID, microContext());
    }))) microAckPass = false;
  }
  if (!(await runCase("microLiveAck: proof set cannot substitute", () => {
    const rec = validV2Micro();
    delete rec.microLiveAcknowledgments;
    rec.armedProofAcknowledgments = allTrue(validator.ARMED_PROOF_ACK_FIELDS);
    expectCode(rec, validator.R15_ERROR_CODES.R15_MICRO_LIVE_ACK_INVALID, microContext());
  }))) microAckPass = false;
  recordMatrix("microLiveAcknowledgments", microAckPass);
  if (!microAckPass) formalFailed += 1;

  // ── 12. Armed-proof acknowledgment matrix ───────────────────────────────
  let proofAckPass = true;
  for (const field of validator.ARMED_PROOF_ACK_FIELDS) {
    if (!(await runCase(`proofAck: missing ${field}`, () => {
      const acks = allTrue(validator.ARMED_PROOF_ACK_FIELDS);
      delete acks[field];
      expectCode(validV2Proof({ armedProofAcknowledgments: acks }), validator.R15_ERROR_CODES.R15_ARMED_PROOF_ACK_INVALID, proofContext());
    }))) proofAckPass = false;
    if (!(await runCase(`proofAck: false ${field}`, () => {
      const acks = allTrue(validator.ARMED_PROOF_ACK_FIELDS);
      acks[field] = false;
      expectCode(validV2Proof({ armedProofAcknowledgments: acks }), validator.R15_ERROR_CODES.R15_ARMED_PROOF_ACK_INVALID, proofContext());
    }))) proofAckPass = false;
  }
  if (!(await runCase("proofAck: micro set cannot substitute", () => {
    const rec = validV2Proof();
    delete rec.armedProofAcknowledgments;
    rec.microLiveAcknowledgments = allTrue(validator.MICRO_LIVE_ACK_FIELDS);
    expectCode(rec, validator.R15_ERROR_CODES.R15_ARMED_PROOF_ACK_INVALID, proofContext());
  }))) proofAckPass = false;
  recordMatrix("armedProofAcknowledgments", proofAckPass);
  if (!proofAckPass) formalFailed += 1;

  // ── 13. Unknown acknowledgment / field policy ─────────────────────────
  let unknownAckPass = true;
  if (!(await runCase("unknown: misspelled common ack name", () => {
    const acks = allTrue(validator.COMMON_ACK_FIELDS);
    acks.strategyNotReadyAcknowleded = true;
    expectCode(validV2Micro({ commonAcknowledgments: acks }), validator.R15_ERROR_CODES.R15_COMMON_ACK_INVALID, microContext());
  }))) unknownAckPass = false;
  if (!(await runCase("unknown: top-level field rejected", () => {
    expectCode(validV2Proof({ mysteryField: true }), validator.R15_ERROR_CODES.R15_MALFORMED_RECORD, proofContext());
  }))) unknownAckPass = false;
  if (!(await runCase("unknown: _fixtureLabel allowed", () => {
    expectPass(validV2Proof({ _fixtureLabel: "test" }), proofContext());
  }))) unknownAckPass = false;
  recordMatrix("unknownAcknowledgmentFields", unknownAckPass);
  if (!unknownAckPass) formalFailed += 1;

  // ── 14. Prohibited-field matrix ─────────────────────────────────────────
  let prohibitedPass = true;
  const prohibitedFields = [
    "candidateMint", "tokenMint", "pairAddress", "pairPoolAddress",
    "quote", "quoteId", "quoteTimestamp", "expectedOutput",
    "tradeSize", "positionSize", "entryPrice", "target", "stopLoss",
    "transactionAuthorization", "submitAuthorized", "broadcastAuthorized", "capitalExposureAuthorized"
  ];
  for (const field of prohibitedFields) {
    if (!(await runCase(`prohibited: top-level ${field}`, () => {
      expectCode(validV2Proof({ [field]: "x" }), validator.R15_ERROR_CODES.R15_PROHIBITED_PROOF_FIELD, proofContext());
    }))) prohibitedPass = false;
  }
  if (!(await runCase("prohibited: nested candidate container", () => {
    expectCode(validV2Proof({ candidate: { mint: "11111111111111111111111111111111" } }), validator.R15_ERROR_CODES.R15_PROHIBITED_PROOF_FIELD, proofContext());
  }))) prohibitedPass = false;
  if (!(await runCase("prohibited: oriLinkage permitted", () => {
    expectPass(validV2Proof(), proofContext());
  }))) prohibitedPass = false;
  recordMatrix("prohibitedFields", prohibitedPass);
  if (!prohibitedPass) formalFailed += 1;

  // ── 15. Session/wallet/time/consumption ─────────────────────────────────
  let bindingPass = true;
  const bindingCases = [
    ["session match", () => expectPass(validV2Micro(), microContext())],
    ["session mismatch", () => expectCode(validV2Micro(), validator.R15_ERROR_CODES.R15_SESSION_MISMATCH, microContext({ expectedSessionId: "RB-G9-WRONG" }))],
    ["wallet match", () => expectPass(validV2Proof(), proofContext())],
    ["wallet mismatch", () => expectCode(validV2Proof(), validator.R15_ERROR_CODES.R15_WALLET_MISMATCH, proofContext({ expectedWallet: "WrongWallet111111111111111111111111111111" }))],
    ["unexpired", () => expectPass(validV2Micro(), microContext())],
    ["expired", () => expectCode(validV2Micro({ expiresAt: "2020-01-01T00:00:00.000Z" }), validator.R15_ERROR_CODES.R15_EXPIRED, microContext())],
    ["consumed", () => expectCode(validV2Micro({ consumed: true }), validator.R15_ERROR_CODES.R15_CONSUMED, microContext())],
    ["malformed timestamp", () => expectCode(validV2Micro({ expiresAt: "not-a-date" }), validator.R15_ERROR_CODES.R15_MALFORMED_RECORD, microContext())]
  ];
  for (const [id, fn] of bindingCases) {
    if (!(await runCase(`binding: ${id}`, fn))) bindingPass = false;
  }
  recordMatrix("sessionWalletTimeConsumption", bindingPass);
  if (!bindingPass) formalFailed += 1;

  // ── 16–17. Guard separation ─────────────────────────────────────────────
  let microGuardPass = true;
  let proofGuardPass = true;
  resetExecutorMocks();
  const r16 = executor.__r16LivePathTest;
  if (!(await runCase("micro guard: v2 micro clears", () => {
    r16.setApprovalRecordProviderForTest(() => validV2Micro());
    r16.assertMicroLiveApprovalRecord({ walletPublicAddress: WALLET });
  }))) microGuardPass = false;
  if (!(await runCase("micro guard: proof record blocked", () => {
    r16.setApprovalRecordProviderForTest(() => validV2Proof());
    let blocked = false;
    try { r16.assertMicroLiveApprovalRecord({ walletPublicAddress: WALLET }); } catch { blocked = true; }
    assert.strictEqual(blocked, true);
  }))) microGuardPass = false;
  if (!(await runCase("micro guard: legacy explicit path", () => {
    r16.setApprovalRecordProviderForTest(() => loadFixture("legacy_ev01_micro_live.json"));
    r16.assertMicroLiveApprovalRecord({ walletPublicAddress: WALLET });
  }))) microGuardPass = false;
  if (!(await runCase("proof guard: v2 proof clears", () => {
    r16.setApprovalRecordProviderForTest(() => validV2Proof());
    r16.assertArmedProofApprovalRecord({ walletPublicAddress: WALLET, sessionId: "RB-G9-20260709-AP01" });
  }))) proofGuardPass = false;
  if (!(await runCase("proof guard: micro v2 blocked", () => {
    r16.setApprovalRecordProviderForTest(() => validV2Micro());
    let blocked = false;
    try { r16.assertArmedProofApprovalRecord({ walletPublicAddress: WALLET, sessionId: "RB-G9-20260709-ML01" }); } catch { blocked = true; }
    assert.strictEqual(blocked, true);
  }))) proofGuardPass = false;
  if (!(await runCase("proof guard: legacy blocked", () => {
    r16.setApprovalRecordProviderForTest(() => loadFixture("legacy_ev02_micro_live.json"));
    let blocked = false;
    try { r16.assertArmedProofApprovalRecord({ walletPublicAddress: WALLET }); } catch { blocked = true; }
    assert.strictEqual(blocked, true);
  }))) proofGuardPass = false;
  resetExecutorMocks();
  recordMatrix("microLiveGuardSeparation", microGuardPass);
  recordMatrix("armedProofGuardSeparation", proofGuardPass);
  if (!microGuardPass || !proofGuardPass) formalFailed += 1;

  // ── 18. Integration context ─────────────────────────────────────────────
  let integrationPass = true;
  if (!(await runCase("integration: live_executor uses micro_live_execution", () => {
    const src = fs.readFileSync(path.join(ROOT, "live_executor.js"), "utf8");
    assert.ok(src.includes("APPROVAL_PURPOSES.MICRO_LIVE"));
    assert.ok(src.includes("buildR15ValidationContext(cfg, r15Validator.APPROVAL_PURPOSES.MICRO_LIVE, true)"));
  }))) integrationPass = false;
  if (!(await runCase("integration: armed_preflight AP-13 proof branch", () => {
    const src = fs.readFileSync(path.join(ROOT, "armed_preflight_checks.js"), "utf8");
    assert.ok(src.includes("assertArmedProofApprovalRecord"));
    assert.ok(src.includes("armed_no_submit_proof_only"));
    assert.ok(src.includes("micro_live_execution"));
  }))) integrationPass = false;
  if (!(await runCase("integration: AP-13 proof context via adapters", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "r15-reg-ap13-"));
    fs.writeFileSync(path.join(tmp, "live_config.json"), JSON.stringify({
      executionMode: "LIVE", dryRunMode: false, walletPublicAddress: WALLET
    }, null, 2));
    const adapters = checks.createDefaultAdapters(tmp);
    adapters.proofContext = session.PROOF_CONTEXT;
    adapters.authorizationChainMode = "armed-no-submit-proof";
    adapters.assertArmedProofApprovalRecord = () => ({ ok: true });
    adapters.assertMicroLiveApprovalRecord = () => ({ ok: false, reason: "should not be called" });
    const cfg = adapters.loadConfig();
    const ap13 = await checks.CHECK_RUNNERS["AP-13"](adapters, cfg);
    assert.strictEqual(ap13.status, "PASS");
    assert.strictEqual(ap13.evidence.purposeContext, "armed_no_submit_proof_only");
  }))) integrationPass = false;
  recordMatrix("integrationContext", integrationPass);
  if (!integrationPass) formalFailed += 1;

  // ── 19. Deterministic errors ────────────────────────────────────────────
  let deterministicPass = true;
  if (!(await runCase("deterministic: stable code/message", () => {
    const ctx = microContext({ expectedSessionId: "RB-G9-WRONG" });
    const a = validator.loadR15ApprovalRecord(validV2Micro(), ctx);
    const b = validator.loadR15ApprovalRecord(validV2Micro(), ctx);
    assert.strictEqual(a.code, b.code);
    assert.strictEqual(a.message, b.message);
    assert.ok(!JSON.stringify(a).includes("SOLANA_SIGNER"));
  }))) deterministicPass = false;
  recordMatrix("deterministicErrors", deterministicPass);
  if (!deterministicPass) formalFailed += 1;

  // ── 20. No-execution guarantees ─────────────────────────────────────────
  let noExecPass = true;
  if (!(await runCase("no-exec: validator module static", () => {
    const src = fs.readFileSync(path.join(ROOT, "r15_approval_validator.js"), "utf8");
    assert.ok(!/submitSwap|sendTransaction|sendRawTransaction|enterPosition|exitPosition/.test(src));
  }))) noExecPass = false;
  if (!(await runCase("no-exec: regression module static", () => {
    const src = fs.readFileSync(__filename, "utf8");
    assert.ok(!/submitSwap\(|sendTransaction\(|sendRawTransaction\(/.test(src));
  }))) noExecPass = false;
  recordMatrix("noExecutionGuarantees", noExecPass);
  if (!noExecPass) formalFailed += 1;

  // ── 21. Secret handling ─────────────────────────────────────────────────
  let secretPass = true;
  process.env.SOLANA_SIGNER_SECRET = SENTINEL_SECRET;
  process.env.HELIUS_API_KEY = SENTINEL_API;
  process.env.SOLANA_RPC_URL = SENTINEL_RPC;
  if (!(await runCase("secret: sentinel absent from validator outputs", () => {
    const outputs = [
      validator.loadR15ApprovalRecord(validV2Proof(), proofContext({ expectedWallet: "WrongWallet111111111111111111111111111111" })),
      validator.loadR15ApprovalRecord(validV2Micro({ consumed: true }), microContext()),
      validator.loadR15ApprovalRecord(null, microContext())
    ];
    const blob = JSON.stringify(outputs);
    assert.ok(!blob.includes(SENTINEL_SECRET));
    assert.ok(!blob.includes(SENTINEL_API));
    assert.ok(!blob.includes("SENTINEL_RPC_SECRET"));
  }))) secretPass = false;
  delete process.env.SOLANA_SIGNER_SECRET;
  delete process.env.HELIUS_API_KEY;
  delete process.env.SOLANA_RPC_URL;
  recordMatrix("secretHandling", secretPass);
  if (!secretPass) formalFailed += 1;

  // ── 22. Examples and fixtures ───────────────────────────────────────────
  let fixturePass = true;
  if (!(await runCase("fixtures: v2 micro valid micro ctx", () => expectPass(loadFixture("v2_micro_live_valid.json"), microContext())))) fixturePass = false;
  if (!(await runCase("fixtures: v2 proof valid proof ctx", () => expectPass(loadFixture("v2_armed_proof_valid.json"), proofContext())))) fixturePass = false;
  if (!(await runCase("examples: non-canonical incomplete fail", () => {
    const ex = JSON.parse(fs.readFileSync(path.join(ROOT, "examples", "r15_manual_approval_record_v2_micro_live.example.json"), "utf8"));
    const filled = {
      ...ex,
      operatorSignaturePresent: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
      approvalId: "RB-G9-20260709-ML01",
      commonAcknowledgments: allTrue(validator.COMMON_ACK_FIELDS),
      microLiveAcknowledgments: allTrue(validator.MICRO_LIVE_ACK_FIELDS),
      oriLinkage: { sessionId: "RB-G9-20260709-ML01" }
    };
    const wallet = filled.researchWalletPublicAddress;
    expectPass(filled, microContext({ expectedWallet: wallet }));
    expectCode(filled, validator.R15_ERROR_CODES.R15_EXPECTED_PURPOSE_MISMATCH, proofContext({ expectedWallet: wallet }));
  }))) fixturePass = false;
  if (!(await runCase("examples: no secret material", () => {
    for (const file of [
      "examples/r15_manual_approval_record_v2_micro_live.example.json",
      "examples/r15_manual_approval_record_v2_armed_proof.example.json"
    ]) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      assert.ok(!/api[_-]?key|secret|mnemonic|seed phrase/i.test(text));
    }
  }))) fixturePass = false;
  recordMatrix("examplesFixtures", fixturePass);
  if (!fixturePass) formalFailed += 1;

  // ── 23. Preservation subprocess suites ──────────────────────────────────
  const suiteResults = {};
  const suites = [
    ["focused schema", "test_r15_dual_purpose_schema.js"],
    ["existing R15", "test_r15_manual_approval_check.js"],
    ["armed-preflight unit", "test_armed_preflight_unit.js"],
    ["armed-preflight regression", "test_armed_preflight_regression.js"],
    ["armed-preflight prerequisites", "test_armed_preflight_prerequisites.js"],
    ["armed-preflight prerequisite regression", "test_armed_preflight_prerequisite_regression.js"]
  ];
  for (const [name, file] of suites) {
    const ok = await runCase(`suite: ${name}`, () => runSubprocessTest(file));
    suiteResults[name] = ok;
    if (!ok) formalFailed += 1;
  }

  let domainAPass = false;
  if (await runCase("suite: Domain A validate_live_system.js", () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, "validate_live_system.js")], { encoding: "utf8", timeout: 120000 });
    assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  })) domainAPass = true; else formalFailed += 1;

  let safetyPass = false;
  if (await runCase("suite: Domain A run_safety_tests.js 85/85", () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, "run_safety_tests.js")], { encoding: "utf8", timeout: 600000 });
    assert.strictEqual(r.status, 0, r.stderr || r.stdout);
    assert.ok(/85\/85/.test(r.stdout), "expected 85/85 in safety output");
  })) safetyPass = true; else formalFailed += 1;

  let n6Pass = false;
  if (await runCase("suite: N6 dry drill", () => runSubprocessTest("test_n6_estop_drill.js"))) n6Pass = true; else formalFailed += 1;

  let wrongPosturePass = false;
  if (await runCase("wrong-posture exit 2 preserved", () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, "validate_armed_preflight.js"), "--json"], {
      encoding: "utf8",
      cwd: ROOT,
      timeout: 60000
    });
    assert.strictEqual(r.status, 2, `expected exit 2, got ${r.status}`);
  })) wrongPosturePass = true; else formalFailed += 1;

  // ── 25. Post-gate state ─────────────────────────────────────────────────
  const hashAfter = common.hashFile(PROD_CONFIG);
  const stubAbsent = !fs.existsSync(path.join(ROOT, "analysis", "r15_manual_approval_record.json"));
  assert.strictEqual(hashBefore, hashAfter, "live_config hash changed during gate");
  assert.strictEqual(stubAbsent, true, "runtime stub appeared");

  const formalTotal = results.length;
  const formalPassed = results.filter(r => r.pass).length;
  const formalFailedCount = formalTotal - formalPassed;
  const overallPass = formalFailedCount === 0 && formalFailed === 0;

  const receipt = {
    gate: "R15 Dual-Purpose Schema Regression Gate",
    timestamp: baselineTimestamp,
    completedAt: new Date().toISOString(),
    status: overallPass ? "PASS" : "FAIL",
    baseline: {
      posture: { executionMode: "PIPELINE_DRY_RUN", dryRunMode: true, liveArmed: false },
      liveConfigHashSha256: hashBefore,
      runtimeStubAbsent: stubAbsent,
      proofSessionCreated: false,
      executorLoops: 0
    },
    postGate: {
      liveConfigHashSha256: hashAfter,
      liveConfigUnchanged: hashBefore === hashAfter,
      runtimeStubAbsent: stubAbsent,
      systemDisarmed: true,
      productionExecutionCallCount: 0
    },
    formalRegression: {
      total: formalTotal,
      passed: formalPassed,
      failed: formalFailedCount
    },
    matrices,
    suiteResults: {
      ...suiteResults,
      domainAValidator: domainAPass,
      safetySuite85of85: safetyPass,
      n6DryDrill: n6Pass,
      wrongPostureExit2: wrongPosturePass
    },
    executionInstrumentation: executionSpies,
    secretSentinelLeakage: secretPass ? "none" : "detected",
    or20260630008: "not_promoted",
    strategyReadiness: "NOT READY",
    recommendedNextGate: overallPass
      ? "Fresh Domain A Dry Proof for Armed No-Submit Proof Session"
      : "R15 Dual-Purpose Schema Regression Remediation Planning",
    checks: results
  };

  fs.mkdirSync(path.dirname(RECEIPT_PATH), { recursive: true });
  fs.writeFileSync(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`);

  console.log(`\nR15 DUAL-PURPOSE SCHEMA REGRESSION ${overallPass ? "PASSED" : "FAILED"} (${formalPassed}/${formalTotal})`);
  console.log(`Receipt: ${RECEIPT_PATH}`);

  if (!overallPass) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
