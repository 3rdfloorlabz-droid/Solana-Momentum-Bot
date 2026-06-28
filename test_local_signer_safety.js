"use strict";

// test_local_signer_safety.js — R41B local signer safety stubs (temp fixtures only).

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const localSigner = require("./local_signer");
const provider = require("./signer_provider");
const capsModule = require("./micro_live_caps");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const REPO_LIVE_POSITIONS = path.join(__dirname, "live_positions.json");
const REPO_CAPS = path.join(__dirname, "operator_records", "micro_live_demo_caps.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;
const beforeLivePositionsHash = fs.existsSync(REPO_LIVE_POSITIONS) ? fs.readFileSync(REPO_LIVE_POSITIONS) : null;
const beforeCapsHash = fs.existsSync(REPO_CAPS) ? fs.readFileSync(REPO_CAPS) : null;

const G = "\x1b[32m✔\x1b[0m";

const safePosture = Object.freeze({
  executionMode: "PIPELINE_DRY_RUN",
  dryRunMode: true,
  liveArmed: false,
  emergencyStop: false
});

function goodCaps(overrides = {}) {
  return {
    approved: true,
    approvedBy: "test-operator",
    approvedAt: new Date().toISOString(),
    purpose: capsModule.REQUIRED_PURPOSE,
    maxTradeSizeSol: 0.01,
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

function draftCaps() {
  return goodCaps({ approved: false, approvedBy: "", approvedAt: null });
}

function baseStubOptions(overrides = {}) {
  return {
    caps: goodCaps(),
    posture: safePosture,
    recoveryPresent: false,
    allowLocalStub: true,
    ...overrides
  };
}

function assertThrowsCode(fn, code) {
  assert.throws(fn, (err) => err && err.code === code);
}

try {
  const stub = localSigner.createLocalSignerStub(baseStubOptions());
  assert.strictEqual(stub.getPublicKey(), localSigner.LOCAL_SIGNER_STUB_PUBLIC_KEY);
  assertThrowsCode(
    () => stub.signTransaction({ txId: "t1", mock: true }, {
      tradeSizeSol: 0.01,
      sessionTradeCount: 0,
      quoteAgeMs: 1000,
      slippageBps: 50,
      network: "mock"
    }),
    "LOCAL_SIGN_NOT_IMPLEMENTED"
  );
  console.log(`${G} local signer stub does not sign`);

  const base58LikeSecret = "5" + "x".repeat(86);
  assertThrowsCode(
    () => localSigner.loadSignerFromApprovedSource({
      ...baseStubOptions(),
      notes: base58LikeSecret
    }),
    "LOCAL_SECRET_INPUT"
  );
  console.log(`${G} local signer stub rejects real secret-looking input`);

  assertThrowsCode(
    () => localSigner.loadSignerFromApprovedSource({
      ...baseStubOptions(),
      privateKey: "5xSecretKeyMaterialThatShouldNeverBeUsedInStubPhaseEver"
    }),
    "LOCAL_SECRET_FIELD_BLOCKED"
  );
  console.log(`${G} local signer stub rejects privateKey field`);

  assertThrowsCode(
    () => localSigner.loadSignerFromApprovedSource({
      ...baseStubOptions(),
      seedPhrase: "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu"
    }),
    "LOCAL_SECRET_FIELD_BLOCKED"
  );
  console.log(`${G} local signer stub rejects seed phrase-like input`);

  const secretArray = Array.from({ length: 64 }, (_, i) => i);
  assertThrowsCode(
    () => localSigner.createLocalSignerStub({
      ...baseStubOptions(),
      secretKey: secretArray
    }),
    "LOCAL_SECRET_FIELD_BLOCKED"
  );
  console.log(`${G} local signer stub rejects secretKey fields`);

  assertThrowsCode(
    () => provider.createSignerFromProvider({ providerType: "local_real", caps: goodCaps() }),
    "PROVIDER_BLOCKED"
  );
  console.log(`${G} provider blocks real signer provider`);

  const mockProvider = provider.createSignerFromProvider({
    providerType: "mock",
    mockMode: true,
    caps: goodCaps()
  });
  assert.strictEqual(mockProvider.providerType, provider.PROVIDERS.MOCK);
  console.log(`${G} provider allows mock signer only in mockMode`);

  assertThrowsCode(
    () => localSigner.createLocalSignerStub(baseStubOptions({ caps: draftCaps() })).signTransaction(
      { txId: "t2" },
      { tradeSizeSol: 0.01, sessionTradeCount: 0, quoteAgeMs: 1000, slippageBps: 50, network: "mock" }
    ),
    "LOCAL_CAPS_NOT_APPROVED"
  );
  console.log(`${G} approved false caps block readiness`);

  assertThrowsCode(
    () => localSigner.createLocalSignerStub(baseStubOptions({
      posture: { ...safePosture, liveArmed: true }
    })).signTransaction(
      { txId: "t3" },
      { tradeSizeSol: 0.01, sessionTradeCount: 0, quoteAgeMs: 1000, slippageBps: 50, network: "mock" }
    ),
    "LOCAL_POSTURE_BLOCKED"
  );
  console.log(`${G} liveArmed true blocks`);

  assertThrowsCode(
    () => localSigner.createLocalSignerStub(baseStubOptions({
      posture: { ...safePosture, dryRunMode: false }
    })).signTransaction(
      { txId: "t4" },
      { tradeSizeSol: 0.01, sessionTradeCount: 0, quoteAgeMs: 1000, slippageBps: 50, network: "mock" }
    ),
    "LOCAL_POSTURE_BLOCKED"
  );
  console.log(`${G} dryRunMode false blocks`);

  assertThrowsCode(
    () => localSigner.createLocalSignerStub(baseStubOptions({
      posture: { ...safePosture, executionMode: "LIVE" }
    })).signTransaction(
      { txId: "t5" },
      { tradeSizeSol: 0.01, sessionTradeCount: 0, quoteAgeMs: 1000, slippageBps: 50, network: "mock" }
    ),
    "LOCAL_POSTURE_BLOCKED"
  );
  console.log(`${G} executionMode LIVE blocks`);

  assertThrowsCode(
    () => localSigner.createLocalSignerStub(baseStubOptions({ recoveryPresent: true })).signTransaction(
      { txId: "t6" },
      { tradeSizeSol: 0.01, sessionTradeCount: 0, quoteAgeMs: 1000, slippageBps: 50, network: "mock" }
    ),
    "LOCAL_RECOVERY_PRESENT"
  );
  console.log(`${G} recovery_actions.jsonl present blocks`);

  assertThrowsCode(
    () => localSigner.createLocalSignerStub(baseStubOptions()).signTransaction(
      { txId: "t7", submit: true },
      { tradeSizeSol: 0.01, sessionTradeCount: 0, quoteAgeMs: 1000, slippageBps: 50, network: "mock" }
    ),
    "LOCAL_SUBMISSION_BLOCKED"
  );
  console.log(`${G} no transaction submission occurs`);

  const auditStub = localSigner.createLocalSignerStub(baseStubOptions());
  try {
    auditStub.signTransaction({ txId: "audit-tx" }, {
      tradeSizeSol: 0.01,
      sessionTradeCount: 0,
      quoteAgeMs: 1000,
      slippageBps: 50,
      network: "mock"
    });
  } catch (err) {
    assert.strictEqual(err.code, "LOCAL_SIGN_NOT_IMPLEMENTED");
  }
  const audit = auditStub.getSafeAuditMetadata();
  const auditJson = JSON.stringify(audit);
  assert.strictEqual(audit.privateKeysHandled, false);
  assert.ok(!/\b[1-9A-HJ-NP-Za-km-z]{87,88}\b/.test(auditJson));
  assert.ok(!/"privateKey"\s*:/.test(auditJson));
  assert.ok(!/"secretKey"\s*:/.test(auditJson));
  console.log(`${G} no secret appears in audit metadata or errors`);

  const src = [
    fs.readFileSync(path.join(__dirname, "local_signer.js"), "utf8"),
    fs.readFileSync(path.join(__dirname, "signer_provider.js"), "utf8")
  ].join("\n");
  assert.ok(!/require\s*\(\s*['"]\.\/live_executor/.test(src));
  console.log(`${G} no live_executor integration`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  if (beforeLivePositionsHash) {
    assert.ok(beforeLivePositionsHash.equals(fs.readFileSync(REPO_LIVE_POSITIONS)));
  }
  if (beforeCapsHash) {
    assert.ok(beforeCapsHash.equals(fs.readFileSync(REPO_CAPS)));
    console.log(`${G} operator caps draft unchanged`);
  }
  console.log(`${G} no trading state mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  console.log("\nLOCAL SIGNER SAFETY TEST PASSED (16/16)");
} catch (err) {
  console.error(err);
  process.exit(1);
}
