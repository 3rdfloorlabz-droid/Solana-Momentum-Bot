"use strict";

// test_r15_dual_purpose_schema.js — focused schemaVersion 2 dual-purpose R15 contract tests.

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const validator = require("./r15_approval_validator");
const executor = require("./live_executor");
const r15 = require("./r15_manual_approval_check");

const FIXTURES = path.join(__dirname, "test_fixtures", "r15");
const G = "\x1b[32m✔\x1b[0m";
const WALLET = "FakeWallet1111111111111111111111111111111";
const NOW = Date.parse("2026-07-09T12:00:00.000Z");

let passed = 0;

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));
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

function expectFail(code, fn) {
  const result = fn();
  assert.strictEqual(result.ok, false, `expected failure ${code}`);
  assert.strictEqual(result.code, code, `expected code ${code}, got ${result.code}`);
  passed += 1;
}

function expectPass(fn) {
  const result = fn();
  assert.strictEqual(result.ok, true, result.message || "expected pass");
  passed += 1;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function allTrue(fields, prefix = "") {
  const out = {};
  for (const field of fields) out[field] = true;
  return out;
}

function validV2Micro(overrides = {}) {
  return {
    ...clone(loadFixture("v2_micro_live_valid.json")),
    ...overrides
  };
}

function validV2Proof(overrides = {}) {
  return {
    ...clone(loadFixture("v2_armed_proof_valid.json")),
    ...overrides
  };
}

function resetExecutorMocks() {
  const r16 = executor.__r16LivePathTest;
  r16.resetMicroLiveApprovalGateForTest();
  r16.resetArmedProofApprovalGateForTest();
  r16.resetApprovalRecordProviderForTest();
}

try {
  // 1
  expectFail(
    validator.R15_ERROR_CODES.R15_UNSUPPORTED_SCHEMA_VERSION,
    () => validator.loadR15ApprovalRecord({ schemaVersion: 99, approvalPurpose: "micro_live_execution" }, microContext())
  );
  console.log(`${G} 1 unknown schemaVersion rejected`);

  // 2
  expectFail(
    validator.R15_ERROR_CODES.R15_MISSING_APPROVAL_PURPOSE,
    () => validator.loadR15ApprovalRecord({ schemaVersion: 2, finalApprovalStatus: validator.FINAL_APPROVAL_STATUSES.MICRO_LIVE }, microContext())
  );
  console.log(`${G} 2 v2 missing approvalPurpose rejected`);

  // 3
  expectFail(
    validator.R15_ERROR_CODES.R15_UNKNOWN_APPROVAL_PURPOSE,
    () => validator.loadR15ApprovalRecord({
      schemaVersion: 2,
      approvalPurpose: "unknown_purpose",
      finalApprovalStatus: validator.FINAL_APPROVAL_STATUSES.MICRO_LIVE
    }, microContext())
  );
  console.log(`${G} 3 unknown approvalPurpose rejected`);

  // 4
  expectPass(() => validator.loadR15ApprovalRecord(validV2Micro(), microContext()));
  console.log(`${G} 4 valid v2 micro-live accepted in micro-live context`);

  // 5
  expectPass(() => validator.loadR15ApprovalRecord(validV2Proof(), proofContext()));
  console.log(`${G} 5 valid v2 armed-proof accepted in proof context`);

  // 6
  expectFail(
    validator.R15_ERROR_CODES.R15_PURPOSE_STATUS_MISMATCH,
    () => validator.loadR15ApprovalRecord(validV2Micro({
      approvalPurpose: validator.APPROVAL_PURPOSES.MICRO_LIVE,
      finalApprovalStatus: validator.FINAL_APPROVAL_STATUSES.ARMED_PROOF
    }), microContext())
  );
  console.log(`${G} 6 micro-live purpose + proof status rejected`);

  // 7
  expectFail(
    validator.R15_ERROR_CODES.R15_PURPOSE_STATUS_MISMATCH,
    () => validator.loadR15ApprovalRecord(validV2Proof({
      approvalPurpose: validator.APPROVAL_PURPOSES.ARMED_PROOF,
      finalApprovalStatus: validator.FINAL_APPROVAL_STATUSES.MICRO_LIVE
    }), proofContext())
  );
  console.log(`${G} 7 proof purpose + micro-live status rejected`);

  // 8
  expectFail(
    validator.R15_ERROR_CODES.R15_EXPECTED_PURPOSE_MISMATCH,
    () => validator.loadR15ApprovalRecord(validV2Micro(), proofContext())
  );
  console.log(`${G} 8 micro-live record rejected in proof context`);

  // 9
  expectFail(
    validator.R15_ERROR_CODES.R15_EXPECTED_PURPOSE_MISMATCH,
    () => validator.loadR15ApprovalRecord(validV2Proof(), microContext())
  );
  console.log(`${G} 9 proof record rejected in micro-live context`);

  // 10
  expectFail(
    validator.R15_ERROR_CODES.R15_EXPECTED_PURPOSE_REQUIRED,
    () => validator.loadR15ApprovalRecord(validV2Micro(), { ...microContext(), expectedPurpose: undefined })
  );
  console.log(`${G} 10 missing expectedPurpose rejected`);

  // 11
  expectFail(
    validator.R15_ERROR_CODES.R15_EXPECTED_PURPOSE_MISMATCH,
    () => validator.loadR15ApprovalRecord(validV2Micro(), {
      ...microContext(),
      expectedPurpose: validator.APPROVAL_PURPOSES.ARMED_PROOF
    })
  );
  console.log(`${G} 11 wrong expectedPurpose rejected`);

  // 12
  expectFail(
    validator.R15_ERROR_CODES.R15_LEGACY_NOT_ALLOWED,
    () => validator.loadR15ApprovalRecord(loadFixture("legacy_ev01_micro_live.json"), microContext())
  );
  console.log(`${G} 12 legacy rejected by default`);

  // 13
  expectPass(() => validator.loadR15ApprovalRecord(loadFixture("legacy_ev01_micro_live.json"), microContext({
    allowLegacyMicroLive: true,
    expectedSessionId: "RB-G9-20260706-EV01"
  })));
  console.log(`${G} 13 legacy accepted with explicit micro-live compatibility`);

  // 14
  expectFail(
    validator.R15_ERROR_CODES.R15_LEGACY_PROOF_FORBIDDEN,
    () => validator.loadR15ApprovalRecord(loadFixture("legacy_ev02_micro_live.json"), proofContext({
      allowLegacyMicroLive: true
    }))
  );
  console.log(`${G} 14 legacy rejected in armed-proof context`);

  // 15
  expectFail(
    validator.R15_ERROR_CODES.R15_COMMON_ACK_INVALID,
    () => validator.loadR15ApprovalRecord(validV2Micro({
      commonAcknowledgments: {
        ...allTrue(validator.COMMON_ACK_FIELDS),
        strategyNotReadyAcknowledged: false
      }
    }), microContext())
  );
  console.log(`${G} 15 missing/false common acknowledgment rejected`);

  // 16
  expectFail(
    validator.R15_ERROR_CODES.R15_MICRO_LIVE_ACK_INVALID,
    () => validator.loadR15ApprovalRecord(validV2Micro({
      microLiveAcknowledgments: { ...allTrue(validator.MICRO_LIVE_ACK_FIELDS), totalLossRiskAcknowledged: false }
    }), microContext())
  );
  console.log(`${G} 16 missing/false micro-live acknowledgment rejected`);

  // 17
  expectFail(
    validator.R15_ERROR_CODES.R15_ARMED_PROOF_ACK_INVALID,
    () => validator.loadR15ApprovalRecord(validV2Proof({
      armedProofAcknowledgments: { ...allTrue(validator.ARMED_PROOF_ACK_FIELDS), noSubmitAcknowledged: false }
    }), proofContext())
  );
  console.log(`${G} 17 missing/false armed-proof acknowledgment rejected`);

  // 18
  expectFail(
    validator.R15_ERROR_CODES.R15_ARMED_PROOF_ACK_INVALID,
    () => validator.loadR15ApprovalRecord(validV2Micro({
      armedProofAcknowledgments: allTrue(validator.ARMED_PROOF_ACK_FIELDS)
    }), microContext())
  );
  console.log(`${G} 18 cross-purpose acknowledgment substitution rejected`);

  // 19
  expectFail(
    validator.R15_ERROR_CODES.R15_PROHIBITED_PROOF_FIELD,
    () => validator.loadR15ApprovalRecord(loadFixture("v2_armed_proof_prohibited_candidate.json"), proofContext())
  );
  console.log(`${G} 19 candidate field in proof record rejected`);

  // 20
  expectFail(
    validator.R15_ERROR_CODES.R15_PROHIBITED_PROOF_FIELD,
    () => validator.loadR15ApprovalRecord(validV2Proof({ quoteId: "q-1" }), proofContext())
  );
  console.log(`${G} 20 quote field in proof record rejected`);

  // 21
  expectFail(
    validator.R15_ERROR_CODES.R15_PROHIBITED_PROOF_FIELD,
    () => validator.loadR15ApprovalRecord(validV2Proof({ tradeSize: 0.01 }), proofContext())
  );
  console.log(`${G} 21 trade field in proof record rejected`);

  // 22
  expectFail(
    validator.R15_ERROR_CODES.R15_PROHIBITED_PROOF_FIELD,
    () => validator.loadR15ApprovalRecord(validV2Proof({ transactionAuthorization: true }), proofContext())
  );
  console.log(`${G} 22 transaction authorization in proof record rejected`);

  // 23
  expectFail(
    validator.R15_ERROR_CODES.R15_PROHIBITED_PROOF_FIELD,
    () => validator.loadR15ApprovalRecord(validV2Proof({ capitalExposureAuthorized: true }), proofContext())
  );
  console.log(`${G} 23 capital authorization in proof record rejected`);

  // 24
  expectFail(
    validator.R15_ERROR_CODES.R15_SESSION_MISMATCH,
    () => validator.loadR15ApprovalRecord(validV2Micro(), microContext({ expectedSessionId: "RB-G9-WRONG" }))
  );
  console.log(`${G} 24 session mismatch rejected`);

  // 25
  expectFail(
    validator.R15_ERROR_CODES.R15_WALLET_MISMATCH,
    () => validator.loadR15ApprovalRecord(validV2Micro(), microContext({ expectedWallet: "WrongWallet111111111111111111111111111111" }))
  );
  console.log(`${G} 25 wallet mismatch rejected`);

  // 26
  expectFail(
    validator.R15_ERROR_CODES.R15_EXPIRED,
    () => validator.loadR15ApprovalRecord(validV2Micro({ expiresAt: "2020-01-01T00:00:00.000Z" }), microContext())
  );
  console.log(`${G} 26 expired record rejected`);

  // 27
  expectFail(
    validator.R15_ERROR_CODES.R15_CONSUMED,
    () => validator.loadR15ApprovalRecord(validV2Micro({ consumed: true }), microContext())
  );
  console.log(`${G} 27 consumed record rejected`);

  // 28 — proof record cannot clear micro-live guard
  resetExecutorMocks();
  const r16 = executor.__r16LivePathTest;
  r16.setApprovalRecordProviderForTest(() => validV2Proof());
  let microBlocked = false;
  try {
    r16.assertMicroLiveApprovalRecord({ walletPublicAddress: WALLET });
  } catch (error) {
    microBlocked = true;
  }
  assert.strictEqual(microBlocked, true, "proof record must not clear micro-live guard");
  passed += 1;
  console.log(`${G} 28 proof record cannot clear micro-live guard`);

  // 29 — micro-live record cannot clear proof guard
  resetExecutorMocks();
  r16.setApprovalRecordProviderForTest(() => validV2Micro());
  let proofBlocked = false;
  try {
    r16.assertArmedProofApprovalRecord({ walletPublicAddress: WALLET, sessionId: "RB-G9-20260709-ML01" });
  } catch (error) {
    proofBlocked = true;
  }
  assert.strictEqual(proofBlocked, true, "micro-live record must not clear proof guard");
  passed += 1;
  console.log(`${G} 29 micro-live record cannot clear proof guard`);

  // 30 — EV01/EV02 legacy fixtures under explicit compatibility
  expectPass(() => validator.loadR15ApprovalRecord(loadFixture("legacy_ev01_micro_live.json"), microContext({
    allowLegacyMicroLive: true,
    expectedSessionId: "RB-G9-20260706-EV01"
  })));
  expectPass(() => validator.loadR15ApprovalRecord(loadFixture("legacy_ev02_micro_live.json"), microContext({
    allowLegacyMicroLive: true,
    expectedSessionId: "RB-G9-20260707-EV02"
  })));
  passed += 1;
  console.log(`${G} 30 EV01/EV02 legacy fixtures behaviorally correct under explicit compatibility`);

  // 31 — deterministic error codes
  const errA = validator.loadR15ApprovalRecord({ schemaVersion: 3 }, microContext());
  const errB = validator.loadR15ApprovalRecord({ schemaVersion: 3 }, microContext());
  assert.strictEqual(errA.code, errB.code);
  assert.strictEqual(errA.message, errB.message);
  passed += 1;
  console.log(`${G} 31 deterministic error codes`);

  // 32 — no secret leakage
  const leakResult = validator.loadR15ApprovalRecord(validV2Proof(), proofContext({
    expectedWallet: "WrongWallet111111111111111111111111111111"
  }));
  const serialized = JSON.stringify(leakResult);
  assert.ok(!serialized.includes("SOLANA_SIGNER"));
  assert.ok(!serialized.includes(process.env.SOLANA_SIGNER_SECRET || "__absent__"));
  passed += 1;
  console.log(`${G} 32 no secret leakage in validator results`);

  // 33 — no execution functions invoked (static guard)
  const src = fs.readFileSync(path.join(__dirname, "r15_approval_validator.js"), "utf8");
  assert.ok(!/submitSwap|sendTransaction|sendRawTransaction|enterPosition|exitPosition/.test(src));
  passed += 1;
  console.log(`${G} 33 no execution functions in validator module`);

  resetExecutorMocks();

  console.log(`\nR15 DUAL-PURPOSE SCHEMA TEST PASSED (${passed}/33)`);
} catch (error) {
  resetExecutorMocks();
  console.error(error);
  process.exit(1);
}
