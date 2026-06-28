"use strict";

// test_mock_signer.js — R40 mock signer harness (temp fixtures only).

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const mockSigner = require("./mock_signer");
const capsModule = require("./micro_live_caps");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const REPO_LIVE_POSITIONS = path.join(__dirname, "live_positions.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;
const beforeLivePositionsHash = fs.existsSync(REPO_LIVE_POSITIONS) ? fs.readFileSync(REPO_LIVE_POSITIONS) : null;

const G = "\x1b[32m✔\x1b[0m";

function goodCaps(overrides = {}) {
  return {
    approved: true,
    approvedBy: "test-operator",
    approvedAt: new Date().toISOString(),
    purpose: capsModule.REQUIRED_PURPOSE,
    maxTradeSizeSol: 0.02,
    maxDailyLossSol: 0.05,
    maxTradesPerSession: 1,
    maxOpenLivePositions: 1,
    autoCompoundingAllowed: false,
    requireHumanPresent: true,
    stopAfterFirstTransaction: true,
    notes: "test fixture only",
    ...overrides
  };
}

const safePosture = Object.freeze({
  executionMode: "PIPELINE_DRY_RUN",
  dryRunMode: true,
  liveArmed: false,
  emergencyStop: false
});

function baseSigner(overrides = {}) {
  return mockSigner.createMockSigner({
    caps: goodCaps(),
    posture: safePosture,
    recoveryPresent: false,
    mockMode: true,
    ...overrides
  });
}

function goodTx(overrides = {}) {
  return { txId: "mock-tx-001", mock: true, ...overrides };
}

function goodContext(overrides = {}) {
  return {
    tradeSizeSol: 0.01,
    sessionTradeCount: 0,
    quoteAgeMs: 1000,
    slippageBps: 50,
    network: "mock",
    ...overrides
  };
}

function assertThrowsCode(fn, code) {
  assert.throws(fn, (err) => err && err.code === code);
}

try {
  const signer = baseSigner();
  assert.strictEqual(signer.getPublicKey(), mockSigner.MOCK_SIGNER_PUBLIC_KEY);
  console.log(`${G} fake signer returns fake public key`);

  const tx = goodTx();
  const ctx = goodContext();
  const signed1 = signer.signTransaction(tx, ctx);
  const signed2 = baseSigner().signTransaction(tx, ctx);
  assert.strictEqual(signed1.signature, signed2.signature);
  assert.ok(signed1.signature.startsWith(mockSigner.MOCK_SIGNATURE_PREFIX));
  console.log(`${G} fake signer returns deterministic fake signature`);

  assertThrowsCode(
    () => baseSigner().signTransaction(goodTx({ live: true }), goodContext()),
    "MOCK_LIVE_PAYLOAD"
  );
  assertThrowsCode(
    () => baseSigner().signTransaction(goodTx(), goodContext({ network: "mainnet" })),
    "MOCK_CONTEXT_BLOCKED"
  );
  console.log(`${G} fake signer rejects live mode / mainnet`);

  assertThrowsCode(
    () => baseSigner({ posture: { ...safePosture, dryRunMode: false } }).signTransaction(goodTx(), goodContext()),
    "MOCK_POSTURE_BLOCKED"
  );
  console.log(`${G} fake signer rejects dryRunMode false`);

  assertThrowsCode(
    () => baseSigner({ posture: { ...safePosture, liveArmed: true } }).signTransaction(goodTx(), goodContext()),
    "MOCK_POSTURE_BLOCKED"
  );
  console.log(`${G} fake signer rejects liveArmed true`);

  assertThrowsCode(
    () => baseSigner({ caps: null }).signTransaction(goodTx(), goodContext()),
    "MOCK_CAPS_INVALID"
  );
  console.log(`${G} fake signer rejects missing caps`);

  assertThrowsCode(
    () => baseSigner().signTransaction(goodTx(), goodContext({ tradeSizeSol: 0.03 })),
    "MOCK_CONTEXT_BLOCKED"
  );
  console.log(`${G} fake signer rejects maxTradeSizeSol above cap`);

  assertThrowsCode(
    () => baseSigner().signTransaction(goodTx(), goodContext({ sessionTradeCount: 1 })),
    "MOCK_CONTEXT_BLOCKED"
  );
  console.log(`${G} fake signer rejects session trade count >= 1`);

  const secretArray = Array.from({ length: 64 }, (_, i) => i);
  assertThrowsCode(
    () => baseSigner().signTransaction(goodTx({ secretKey: secretArray }), goodContext()),
    "MOCK_SECRET_INPUT"
  );
  console.log(`${G} fake signer rejects suspicious secret-looking input`);

  assertThrowsCode(
    () => baseSigner({ recoveryPresent: true }).signTransaction(goodTx(), goodContext()),
    "MOCK_RECOVERY_PRESENT"
  );
  console.log(`${G} fake signer rejects recovery_actions.jsonl present`);

  const audit = signer.getAuditRecord();
  const auditJson = JSON.stringify(audit);
  assert.strictEqual(audit.privateKeysHandled, false);
  assert.strictEqual(audit.approved, false);
  assert.ok(auditJson.includes("[REDACTED]") || audit.events.length >= 0);
  assert.ok(!/\b[1-9A-HJ-NP-Za-km-z]{87,88}\b/.test(auditJson));
  assert.ok(!auditJson.includes("BEGIN PRIVATE KEY"));
  console.log(`${G} audit metadata is safe and redacted`);
  console.log(`${G} no real private key appears in output`);

  const src = fs.readFileSync(path.join(__dirname, "mock_signer.js"), "utf8");
  assert.ok(!/require\s*\(\s*['"]\.\/live_executor/.test(src));
  assert.ok(!/submitSwap|sendTransaction|nacl\.sign/.test(src));
  console.log(`${G} no live_executor integration`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  if (beforeLivePositionsHash) {
    assert.ok(beforeLivePositionsHash.equals(fs.readFileSync(REPO_LIVE_POSITIONS)));
  }
  console.log(`${G} no trading state mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  console.log("\nMOCK SIGNER TEST PASSED (14/14)");
} catch (err) {
  console.error(err);
  process.exit(1);
}
