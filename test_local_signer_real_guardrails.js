"use strict";

// test_local_signer_real_guardrails.js — R43C guarded real local signer (temp fixtures only).

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { Keypair } = require("@solana/web3.js");

const localSigner = require("./local_signer");
const provider = require("./signer_provider");
const r43c = require("./r43c_local_signer_readiness");
const capsModule = require("./micro_live_caps");
const r43b = require("./r43b_operator_caps_approval_check");

const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const REPO_LIVE_POSITIONS = path.join(__dirname, "live_positions.json");
const REPO_CAPS = path.join(__dirname, "operator_records", "micro_live_demo_caps.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;
const beforeLivePositionsHash = fs.existsSync(REPO_LIVE_POSITIONS) ? fs.readFileSync(REPO_LIVE_POSITIONS) : null;
const beforeCapsHash = fs.existsSync(REPO_CAPS) ? fs.readFileSync(REPO_CAPS) : null;

const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r43c-output-"));
const G = "\x1b[32m✔\x1b[0m";

const safePosture = Object.freeze({
  executionMode: "PIPELINE_DRY_RUN",
  dryRunMode: true,
  liveArmed: false,
  emergencyStop: false
});

function approvedCaps(overrides = {}) {
  return {
    approved: true,
    approvedBy: "Taylor Cheaney",
    approvedAt: new Date().toISOString(),
    approvalText: r43b.REQUIRED_APPROVAL_TEXT,
    approvalScope: r43b.REQUIRED_APPROVAL_SCOPE,
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

function goodRealOptions(overrides = {}) {
  return {
    providerMode: "local_real",
    allowRealLocalSigner: true,
    testFixtureSecret: true,
    caps: approvedCaps(),
    posture: safePosture,
    recoveryPresent: false,
    rpcStatus: "DEDICATED_CANDIDATE",
    humanPresent: true,
    ...overrides
  };
}

function signContext(overrides = {}) {
  return {
    tradeSizeSol: 0.01,
    sessionTradeCount: 0,
    quoteAgeMs: 1000,
    slippageBps: 50,
    network: "mock",
    humanPresent: true,
    ...overrides
  };
}

function assertThrowsCode(fn, code) {
  assert.throws(fn, (err) => err && err.code === code);
}

try {
  assertThrowsCode(
    () => localSigner.createLocalSigner({ providerMode: "local_real" }),
    "LOCAL_REAL_SIGNER_BLOCKED"
  );
  console.log(`${G} local_real blocked by default`);

  assertThrowsCode(
    () => localSigner.createLocalSigner({
      providerMode: "local_real",
      allowRealLocalSigner: false,
      ...goodRealOptions({ allowRealLocalSigner: false })
    }),
    "LOCAL_REAL_SIGNER_BLOCKED"
  );
  console.log(`${G} local_real requires allowRealLocalSigner true`);

  assertThrowsCode(
    () => localSigner.createLocalSigner(goodRealOptions({ caps: null })),
    "LOCAL_GUARD_CONTEXT_BLOCKED"
  );
  console.log(`${G} missing caps blocks`);

  assertThrowsCode(
    () => localSigner.createLocalSigner(goodRealOptions({ caps: approvedCaps({ approved: false }) })),
    "LOCAL_GUARD_CONTEXT_BLOCKED"
  );
  console.log(`${G} unapproved caps blocks`);

  assertThrowsCode(
    () => localSigner.createLocalSigner(goodRealOptions({ caps: approvedCaps({ maxTradeSizeSol: 0.02 }) })),
    "LOCAL_GUARD_CONTEXT_BLOCKED"
  );
  console.log(`${G} unsafe caps block`);

  assertThrowsCode(
    () => localSigner.createLocalSigner(goodRealOptions({ rpcStatus: "MISSING" })),
    "LOCAL_GUARD_CONTEXT_BLOCKED"
  );
  console.log(`${G} missing dedicated RPC blocks`);

  assertThrowsCode(
    () => localSigner.createLocalSigner(goodRealOptions({ rpcStatus: "PUBLIC_FALLBACK" })),
    "LOCAL_GUARD_CONTEXT_BLOCKED"
  );
  console.log(`${G} public fallback RPC blocks`);

  assertThrowsCode(
    () => localSigner.createLocalSigner(goodRealOptions({ recoveryPresent: true })),
    "LOCAL_GUARD_CONTEXT_BLOCKED"
  );
  console.log(`${G} recovery_actions.jsonl present blocks`);

  assertThrowsCode(
    () => localSigner.createLocalSigner(goodRealOptions({
      posture: { ...safePosture, executionMode: "LIVE" }
    })),
    "LOCAL_GUARD_CONTEXT_BLOCKED"
  );
  console.log(`${G} executionMode LIVE blocks`);

  assertThrowsCode(
    () => localSigner.createLocalSigner(goodRealOptions({
      posture: { ...safePosture, dryRunMode: false }
    })),
    "LOCAL_GUARD_CONTEXT_BLOCKED"
  );
  console.log(`${G} dryRunMode false blocks`);

  assertThrowsCode(
    () => localSigner.createLocalSigner(goodRealOptions({
      posture: { ...safePosture, liveArmed: true }
    })),
    "LOCAL_GUARD_CONTEXT_BLOCKED"
  );
  console.log(`${G} liveArmed true blocks`);

  assertThrowsCode(
    () => localSigner.createLocalSigner(goodRealOptions({ repeatedTrading: true })),
    "LOCAL_GUARD_CONTEXT_BLOCKED"
  );
  console.log(`${G} repeated trading context blocks`);

  assertThrowsCode(
    () => localSigner.createLocalSigner(goodRealOptions({
      caps: approvedCaps({ autoCompoundingAllowed: true })
    })),
    "LOCAL_GUARD_CONTEXT_BLOCKED"
  );
  console.log(`${G} autoCompounding true blocks`);

  assertThrowsCode(
    () => localSigner.createLocalSigner(goodRealOptions({ humanPresent: false })),
    "LOCAL_GUARD_CONTEXT_BLOCKED"
  );
  console.log(`${G} missing humanPresent blocks`);

  assertThrowsCode(
    () => localSigner.createLocalSigner(goodRealOptions({ executorSignerIntegrated: true })),
    "LOCAL_GUARD_CONTEXT_BLOCKED"
  );
  console.log(`${G} live_executor integration detected blocks`);

  assertThrowsCode(
    () => provider.createSignerFromProvider({
      providerType: "local_real",
      caps: approvedCaps()
    }),
    "PROVIDER_BLOCKED"
  );
  console.log(`${G} provider blocks local_real without explicit guard options`);

  const fixtureKeypair = Keypair.generate();
  const realSigner = localSigner.createLocalSigner(goodRealOptions({ testKeypair: fixtureKeypair }));
  assert.strictEqual(realSigner.getPublicKey(), fixtureKeypair.publicKey.toBase58());
  const audit = realSigner.getSafeAuditMetadata();
  const auditJson = JSON.stringify(audit);
  assert.ok(audit.privateKeysHandled === true);
  assert.ok(!/"secretKey"\s*:/.test(auditJson));
  assert.ok(!/"privateKey"\s*:/.test(auditJson));
  assert.ok(!/\[\s*(?:\d{1,3}\s*,\s*){31,}\d{1,3}\s*\]/.test(auditJson));
  assert.strictEqual(audit.sourceMetadata.redactedSource, "[REDACTED]");
  console.log(`${G} private key is never printed in audit metadata`);

  const redacted = localSigner.redactSignerSourceMetadata({
    sourceType: "keyfile",
    fullPath: "C:\\TracktaOS\\Secrets\\signer.json",
    rawSecret: fixtureKeypair.secretKey,
    loadedAt: new Date().toISOString()
  });
  const redactedJson = JSON.stringify(redacted);
  assert.ok(!redactedJson.includes(fixtureKeypair.publicKey.toBase58()) || redacted.sourceType === "keyfile");
  assert.ok(!/\[\s*(?:\d{1,3}\s*,\s*){31,}\d{1,3}\s*\]/.test(redactedJson));
  assert.strictEqual(redacted.redactedSource, "[REDACTED]");
  console.log(`${G} secret-like values are redacted`);

  const signResult = realSigner.signTransaction({ txId: "r43c-test-tx" }, signContext());
  assert.strictEqual(signResult.proofOnly, true);
  assert.strictEqual(signResult.networkSubmit, false);
  assert.ok(typeof signResult.signature === "string" && signResult.signature.length > 0);
  console.log(`${G} proof-only signing works under guardrails`);

  realSigner.destroy();
  assertThrowsCode(() => realSigner.getPublicKey(), "LOCAL_SIGNER_DESTROYED");
  console.log(`${G} destroy clears internal signer reference`);

  const readiness = r43c.runReadiness({
    outputDir: tmpOutput,
    gateDocPresent: true,
    recoveryPresent: false,
    posture: {
      available: true,
      ...safePosture,
      liveSubmission: "DISARMED"
    },
    postureSafe: true,
    capsLoad: { status: "present", data: approvedCaps() },
    rpcSetup: { status: "DEDICATED_CANDIDATE" },
    executorIntegrationCheck: { integrated: false, ok: true, note: "none" },
    analysisSecretCheck: { ok: true, suspicious: [] }
  });
  assert.ok(readiness.outputFile.startsWith(tmpOutput));
  assert.ok(readiness.outputFile.includes(`${path.sep}r43c_local_signer_readiness.json`));
  console.log(`${G} output writes only to analysis/`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  if (beforeLivePositionsHash) {
    assert.ok(beforeLivePositionsHash.equals(fs.readFileSync(REPO_LIVE_POSITIONS)));
  }
  if (beforeCapsHash) {
    assert.ok(beforeCapsHash.equals(fs.readFileSync(REPO_CAPS)));
  }
  console.log(`${G} no trading state mutation`);

  const src = [
    fs.readFileSync(path.join(__dirname, "local_signer.js"), "utf8"),
    fs.readFileSync(path.join(__dirname, "signer_provider.js"), "utf8")
  ].join("\n");
  assert.ok(!/require\s*\(\s*['"]\.\/live_executor/.test(src));
  assert.ok(!/sendTransaction\s*\(/.test(src));
  assert.ok(!/sendRawTransaction\s*\(/.test(src));
  console.log(`${G} no live_executor integration or submission APIs in signer modules`);

  console.log("\nLOCAL SIGNER REAL GUARDRAILS TEST PASSED (24/24)");
} catch (err) {
  console.error(err);
  process.exit(1);
}
