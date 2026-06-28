"use strict";

// local_signer.js — R41B stub + R43C guarded real local signer.
// Real mode loads secrets only from approved local sources under guardrails.
// Does NOT integrate with live_executor.js or submit transactions.

const fs = require("fs");
const path = require("path");
const capsModule = require("./micro_live_caps");
const mockSigner = require("./mock_signer");

const ROOT = __dirname;

const LOCAL_SIGNER_STUB_PUBLIC_KEY = "LOCAL_SIGNER_STUB_NOT_ARMED";
const R41B_VERDICT = "LOCAL SIGNER STUB ONLY — REAL SIGNING NOT IMPLEMENTED";
const R43C_VERDICT = "R43C REAL LOCAL SIGNER — GUARDED — NOT LIVE TRADING — NO SUBMISSION";

const ENV_SECRET_JSON = "TRACKTA_LOCAL_SIGNER_SECRET_JSON";
const ENV_KEYFILE = "TRACKTA_LOCAL_SIGNER_KEYFILE";

const LOCAL_PROVIDER_MODES = Object.freeze({
  STUB: "local_stub",
  REAL: "local_real"
});

const REQUIRED_APPROVAL_SCOPE = "one-transaction micro-live engineering proof only";

const R43C_LIMITS = Object.freeze({
  maxTradeSizeSol: 0.01,
  maxDailyLossSol: 0.05,
  maxTradesPerSession: 1,
  maxOpenLivePositions: 1,
  autoCompoundingAllowed: false,
  requireHumanPresent: true,
  stopAfterFirstTransaction: true
});

const BLOCKED_SECRET_SOURCE_TYPES = new Set([
  "env",
  "environment",
  "file",
  "keyfile",
  "mnemonic",
  "seed",
  "hardware"
]);

function normalizeRelPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function validateR43cCaps(caps) {
  const errors = [];
  if (!caps || typeof caps !== "object") {
    return { ok: false, errors: ["caps missing"] };
  }

  if (caps.approved !== true) errors.push("caps not approved");
  if (caps.approvalScope !== REQUIRED_APPROVAL_SCOPE) {
    errors.push("approvalScope must match R43C engineering proof scope");
  }
  if (!Number.isFinite(Number(caps.maxTradeSizeSol))
      || Number(caps.maxTradeSizeSol) > R43C_LIMITS.maxTradeSizeSol) {
    errors.push(`maxTradeSizeSol must be <= ${R43C_LIMITS.maxTradeSizeSol}`);
  }
  if (Number(caps.maxTradesPerSession) !== R43C_LIMITS.maxTradesPerSession) {
    errors.push(`maxTradesPerSession must be ${R43C_LIMITS.maxTradesPerSession}`);
  }
  if (caps.stopAfterFirstTransaction !== true) {
    errors.push("stopAfterFirstTransaction must be true");
  }
  if (caps.autoCompoundingAllowed !== false) {
    errors.push("autoCompoundingAllowed must be false");
  }
  if (caps.requireHumanPresent !== true) {
    errors.push("requireHumanPresent must be true");
  }

  const conservative = capsModule.validateConservativeCaps(caps);
  if (!conservative.ok) errors.push(...conservative.errors);

  return { ok: errors.length === 0, errors };
}

function validateSignerGuardContext(context = {}, options = {}) {
  const blockers = [];
  const caps = context.caps ?? options.caps ?? null;
  const posture = context.posture ?? options.posture ?? {};
  const rpcStatus = context.rpcStatus ?? options.rpcStatus;

  if (context.recoveryPresent === true || options.recoveryPresent === true) {
    blockers.push("recovery_actions.jsonl present");
  }

  if (!caps) {
    blockers.push("operator caps missing");
  } else {
    const r43c = validateR43cCaps(caps);
    if (!r43c.ok) blockers.push(...r43c.errors);
  }

  if (posture.executionMode !== "PIPELINE_DRY_RUN") {
    blockers.push("executionMode must be PIPELINE_DRY_RUN");
  }
  if (posture.dryRunMode !== true) {
    blockers.push("dryRunMode must be true");
  }
  if (posture.liveArmed === true) {
    blockers.push("liveArmed must be false");
  }
  if (posture.emergencyStop === true) {
    blockers.push("emergencyStop must be false");
  }

  if (rpcStatus !== "DEDICATED_CANDIDATE") {
    blockers.push("rpcStatus must be DEDICATED_CANDIDATE");
  }

  if (context.humanPresent !== true && options.humanPresent !== true) {
    blockers.push("humanPresent must be true");
  }

  if (context.repeatedTrading === true || context.autonomousTrading === true) {
    blockers.push("repeated/autonomous trading context blocked");
  }
  if (context.autoCompounding === true || caps?.autoCompoundingAllowed === true) {
    blockers.push("autoCompounding blocked");
  }
  if (context.executorSignerIntegrated === true || context.liveExecutorIntegration === true) {
    blockers.push("live_executor signer integration blocked");
  }
  if (context.submit === true || context.requestSubmission === true
      || options.submit === true || options.requestSubmission === true) {
    blockers.push("transaction submission blocked");
  }

  const sessionCount = Number(context.sessionTradeCount ?? 0);
  if (sessionCount > 0 && caps?.stopAfterFirstTransaction === true) {
    blockers.push("session trade count exceeds stopAfterFirstTransaction guard");
  }

  if (options.checkAllowReal !== false && options.allowRealLocalSigner !== true) {
    blockers.push("allowRealLocalSigner must be true");
  }

  if (blockers.length > 0) {
    throw Object.assign(new Error(blockers.join("; ")), {
      code: "LOCAL_GUARD_CONTEXT_BLOCKED",
      blockers
    });
  }

  return { ok: true };
}

function redactSignerSourceMetadata(metadata = {}) {
  const safe = {
    sourceType: metadata.sourceType || "unknown",
    loadedAt: metadata.loadedAt || null,
    outsideRepo: metadata.outsideRepo === true,
    redactedSource: "[REDACTED]"
  };
  if (metadata.envVar) safe.envVar = String(metadata.envVar);
  if (metadata.fileBasename) safe.fileBasename = String(metadata.fileBasename);
  return safe;
}

function parseSecretByteArray(value) {
  if (!Array.isArray(value) || value.length !== 64) {
    throw Object.assign(new Error("secret must be a 64-byte array"), {
      code: "LOCAL_SECRET_INVALID_FORMAT"
    });
  }
  if (!value.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255)) {
    throw Object.assign(new Error("secret bytes invalid"), { code: "LOCAL_SECRET_INVALID_BYTES" });
  }
  return Uint8Array.from(value);
}

function parseSecretJsonString(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw Object.assign(new Error("secret JSON parse failed"), { code: "LOCAL_SECRET_PARSE_FAILED" });
  }
  return parseSecretByteArray(parsed);
}

function validateApprovedKeyfilePath(keyfilePath, repoRoot = ROOT) {
  const resolved = path.resolve(keyfilePath);
  const repoResolved = path.resolve(repoRoot);
  const rel = path.relative(repoResolved, resolved);
  const insideRepo = rel && !rel.startsWith("..") && !path.isAbsolute(rel);

  if (insideRepo) {
    const normalized = normalizeRelPath(rel);
    if (!normalized.startsWith("operator_records/")) {
      throw Object.assign(new Error("repo-relative secret path blocked"), {
        code: "LOCAL_SECRET_PATH_BLOCKED"
      });
    }
    if (normalized.includes("micro_live_demo_caps") || normalized.includes(".example.")) {
      throw Object.assign(new Error("repo-relative secret path not in approved operator path"), {
        code: "LOCAL_SECRET_PATH_BLOCKED"
      });
    }
  }

  if (!fs.existsSync(resolved)) {
    throw Object.assign(new Error("secret keyfile missing"), { code: "LOCAL_SECRET_FILE_MISSING" });
  }

  return resolved;
}

function loadSecretBytesFromApprovedSource(options = {}) {
  if (options.testFixtureSecret === true) {
    let secretBytes;
    if (options.testSecretBytes) {
      secretBytes = parseSecretByteArray(options.testSecretBytes);
    } else if (options.testKeypair && options.testKeypair.secretKey) {
      secretBytes = Uint8Array.from(options.testKeypair.secretKey);
    } else {
      const { Keypair } = require("@solana/web3.js");
      secretBytes = Keypair.generate().secretKey;
    }
    return {
      secretBytes,
      sourceMetadata: {
        sourceType: "test_fixture",
        loadedAt: new Date().toISOString(),
        outsideRepo: true
      }
    };
  }

  const env = options.env || process.env;

  if (env[ENV_SECRET_JSON]) {
    return {
      secretBytes: parseSecretJsonString(env[ENV_SECRET_JSON]),
      sourceMetadata: {
        sourceType: "env_json",
        envVar: ENV_SECRET_JSON,
        loadedAt: new Date().toISOString(),
        outsideRepo: true
      }
    };
  }

  if (env[ENV_KEYFILE]) {
    const resolved = validateApprovedKeyfilePath(env[ENV_KEYFILE], options.repoRoot || ROOT);
    const raw = fs.readFileSync(resolved, "utf8");
    const secretBytes = parseSecretJsonString(raw.trim());
    return {
      secretBytes,
      sourceMetadata: {
        sourceType: "keyfile",
        fileBasename: path.basename(resolved),
        loadedAt: new Date().toISOString(),
        outsideRepo: !normalizeRelPath(path.relative(path.resolve(options.repoRoot || ROOT), resolved))
          .startsWith("operator_records/")
      }
    };
  }

  throw Object.assign(new Error("no approved local signer secret source configured"), {
    code: "LOCAL_SECRET_SOURCE_MISSING"
  });
}

function runStubGuardChecks(options = {}) {
  if (options.recoveryPresent === true) {
    throw Object.assign(new Error("recovery_actions.jsonl present"), { code: "LOCAL_RECOVERY_PRESENT" });
  }

  const caps = options.caps ?? null;
  if (!caps || typeof caps !== "object") {
    throw Object.assign(new Error("operator caps missing"), { code: "LOCAL_CAPS_MISSING" });
  }

  const conservative = capsModule.validateConservativeCaps(caps);
  if (!conservative.ok) {
    throw Object.assign(new Error(conservative.errors.join("; ")), {
      code: "LOCAL_CAPS_INVALID",
      errors: conservative.errors
    });
  }

  if (caps.approved !== true) {
    throw Object.assign(new Error("operator caps not approved"), { code: "LOCAL_CAPS_NOT_APPROVED" });
  }

  const postureCheck = mockSigner.validateSafePosture(options.posture ?? {
    executionMode: "PIPELINE_DRY_RUN",
    dryRunMode: true,
    liveArmed: false,
    emergencyStop: false
  });
  if (!postureCheck.ok) {
    throw Object.assign(new Error(postureCheck.blockers.join("; ")), {
      code: "LOCAL_POSTURE_BLOCKED",
      blockers: postureCheck.blockers
    });
  }

  return { ok: true };
}

function rejectRealSecretSource(options = {}) {
  for (const field of ["privateKey", "secretKey", "seedPhrase", "mnemonic", "signerSecret", "keyMaterial"]) {
    if (options[field] !== undefined && options[field] !== null && options[field] !== "") {
      throw Object.assign(new Error(`${field} must not be supplied in stub phase`), {
        code: "LOCAL_SECRET_FIELD_BLOCKED"
      });
    }
  }

  if (options.loadRealSecret === true || options.parseKeyMaterial === true) {
    throw Object.assign(new Error("real key loading blocked in stub phase"), {
      code: "LOCAL_REAL_KEY_LOAD_BLOCKED"
    });
  }

  if (mockSigner.containsSuspiciousSecretMaterial(options)) {
    throw Object.assign(new Error("suspicious secret-like material rejected"), { code: "LOCAL_SECRET_INPUT" });
  }

  const sourceType = String(options.secretSourceType || options.secretSource || "").toLowerCase();
  if (sourceType && BLOCKED_SECRET_SOURCE_TYPES.has(sourceType)) {
    throw Object.assign(new Error("real secret source blocked in stub phase"), {
      code: "LOCAL_REAL_SECRET_SOURCE_BLOCKED"
    });
  }
}

function createLocalSignerStub(options = {}) {
  rejectRealSecretSource(options);

  const caps = options.caps ?? null;
  const posture = options.posture ?? {
    executionMode: "PIPELINE_DRY_RUN",
    dryRunMode: true,
    liveArmed: false,
    emergencyStop: false
  };
  const recoveryPresent = options.recoveryPresent === true;

  let destroyed = false;
  let loadAttempts = options.loadedFromSource === true ? 1 : 0;
  const auditEvents = [];

  function assertActive() {
    if (destroyed) {
      throw Object.assign(new Error("local signer stub destroyed"), { code: "LOCAL_SIGNER_DESTROYED" });
    }
  }

  function recordAudit(stage, detail = {}) {
    auditEvents.push({
      timestamp: new Date().toISOString(),
      stage,
      stub: true,
      publicKey: LOCAL_SIGNER_STUB_PUBLIC_KEY,
      detail: typeof detail === "object" ? { ...detail } : { note: String(detail) }
    });
  }

  function getPublicKey() {
    assertActive();
    return LOCAL_SIGNER_STUB_PUBLIC_KEY;
  }

  function signTransaction(unsignedTransaction, context = {}) {
    assertActive();

    runStubGuardChecks({ caps, posture, recoveryPresent });

    if (!unsignedTransaction || typeof unsignedTransaction !== "object") {
      throw Object.assign(new Error("unsignedTransaction must be an object"), { code: "LOCAL_TX_INVALID" });
    }

    if (unsignedTransaction.live === true || unsignedTransaction.mainnet === true
        || context.live === true || context.network === "mainnet") {
      throw Object.assign(new Error("live/mainnet context blocked"), { code: "LOCAL_LIVE_CONTEXT_BLOCKED" });
    }

    if (mockSigner.containsSuspiciousSecretMaterial(unsignedTransaction)
        || mockSigner.containsSuspiciousSecretMaterial(context)) {
      throw Object.assign(new Error("suspicious secret-like material in input"), { code: "LOCAL_SECRET_INPUT" });
    }

    if (context.submit === true || unsignedTransaction.submit === true) {
      throw Object.assign(new Error("transaction submission blocked in stub phase"), {
        code: "LOCAL_SUBMISSION_BLOCKED"
      });
    }

    const contextCheck = mockSigner.validateSignContext(context, caps);
    if (!contextCheck.ok) {
      throw Object.assign(new Error(contextCheck.blockers.join("; ")), {
        code: "LOCAL_CONTEXT_BLOCKED",
        blockers: contextCheck.blockers
      });
    }

    recordAudit("LOCAL_SIGN_BLOCKED", { reason: "real signing not implemented" });

    throw Object.assign(new Error("real signing not implemented in local signer stub phase"), {
      code: "LOCAL_SIGN_NOT_IMPLEMENTED"
    });
  }

  function destroy() {
    destroyed = true;
    auditEvents.length = 0;
    loadAttempts = 0;
  }

  function getSafeAuditMetadata() {
    return {
      stub: true,
      destroyed,
      publicKey: LOCAL_SIGNER_STUB_PUBLIC_KEY,
      loadAttempts,
      signImplemented: false,
      networkSubmit: false,
      privateKeysHandled: false,
      approved: false,
      liveTradingApproved: false,
      r41bVerdict: R41B_VERDICT,
      events: auditEvents.map((event) => ({
        ...event,
        detail: event.detail && typeof event.detail === "object"
          ? Object.fromEntries(Object.entries(event.detail).map(([k, v]) => [k, mockSigner.redactValue(v)]))
          : event.detail
      }))
    };
  }

  return {
    stub: true,
    phase: "R41B",
    providerMode: LOCAL_PROVIDER_MODES.STUB,
    getPublicKey,
    signTransaction,
    destroy,
    getSafeAuditMetadata
  };
}

function createLocalSignerReal(options = {}) {
  validateSignerGuardContext({
    caps: options.caps,
    posture: options.posture,
    recoveryPresent: options.recoveryPresent === true,
    rpcStatus: options.rpcStatus,
    humanPresent: options.humanPresent === true,
    repeatedTrading: options.repeatedTrading === true,
    autonomousTrading: options.autonomousTrading === true,
    autoCompounding: options.autoCompounding === true,
    executorSignerIntegrated: options.executorSignerIntegrated === true,
    liveExecutorIntegration: options.liveExecutorIntegration === true,
    sessionTradeCount: options.sessionTradeCount
  }, {
    allowRealLocalSigner: options.allowRealLocalSigner,
    checkAllowReal: true
  });

  const loaded = loadSecretBytesFromApprovedSource(options);
  const secretBytes = loaded.secretBytes;
  const sourceMetadata = loaded.sourceMetadata;

  const { ed25519 } = require("@noble/curves/ed25519");
  const { Keypair } = require("@solana/web3.js");
  let keypair = Keypair.fromSecretKey(secretBytes);
  let destroyed = false;
  const auditEvents = [];
  const caps = options.caps;
  const posture = options.posture ?? {
    executionMode: "PIPELINE_DRY_RUN",
    dryRunMode: true,
    liveArmed: false,
    emergencyStop: false
  };
  const recoveryPresent = options.recoveryPresent === true;
  const rpcStatus = options.rpcStatus;

  function assertActive() {
    if (destroyed || !keypair) {
      throw Object.assign(new Error("local signer destroyed"), { code: "LOCAL_SIGNER_DESTROYED" });
    }
  }

  function recordAudit(stage, detail = {}) {
    auditEvents.push({
      timestamp: new Date().toISOString(),
      stage,
      stub: false,
      providerMode: LOCAL_PROVIDER_MODES.REAL,
      publicKey: keypair.publicKey.toBase58(),
      detail: typeof detail === "object"
        ? Object.fromEntries(Object.entries(detail).map(([k, v]) => [k, mockSigner.redactValue(v)]))
        : { note: String(detail) }
    });
  }

  function getPublicKey() {
    assertActive();
    return keypair.publicKey.toBase58();
  }

  function signTransaction(unsignedTransaction, context = {}) {
    assertActive();

    validateSignerGuardContext({
      caps,
      posture,
      recoveryPresent,
      rpcStatus,
      humanPresent: context.humanPresent === true || options.humanPresent === true,
      repeatedTrading: context.repeatedTrading === true,
      autonomousTrading: context.autonomousTrading === true,
      autoCompounding: context.autoCompounding === true,
      executorSignerIntegrated: context.executorSignerIntegrated === true,
      liveExecutorIntegration: context.liveExecutorIntegration === true,
      submit: context.submit === true || unsignedTransaction?.submit === true,
      requestSubmission: context.requestSubmission === true,
      sessionTradeCount: context.sessionTradeCount
    }, {
      allowRealLocalSigner: true,
      checkAllowReal: true
    });

    if (!unsignedTransaction || typeof unsignedTransaction !== "object") {
      throw Object.assign(new Error("unsignedTransaction must be an object"), { code: "LOCAL_TX_INVALID" });
    }

    if (unsignedTransaction.live === true || unsignedTransaction.mainnet === true
        || context.live === true || context.network === "mainnet") {
      throw Object.assign(new Error("live/mainnet context blocked"), { code: "LOCAL_LIVE_CONTEXT_BLOCKED" });
    }

    if (context.submit === true || unsignedTransaction.submit === true || context.requestSubmission === true) {
      throw Object.assign(new Error("transaction submission blocked"), { code: "LOCAL_SUBMISSION_BLOCKED" });
    }

    const contextCheck = mockSigner.validateSignContext(context, caps);
    if (!contextCheck.ok) {
      throw Object.assign(new Error(contextCheck.blockers.join("; ")), {
        code: "LOCAL_CONTEXT_BLOCKED",
        blockers: contextCheck.blockers
      });
    }

    const payload = Buffer.from(JSON.stringify({
      txId: unsignedTransaction.txId || "r43c-proof-only",
      proofOnly: true,
      networkSubmit: false
    }));
    const signatureBytes = ed25519.sign(payload, keypair.secretKey.slice(0, 32));
    const signature = Buffer.from(signatureBytes).toString("base64");

    recordAudit("LOCAL_SIGN_PROOF_ONLY", {
      txId: unsignedTransaction.txId,
      signaturePreview: signature.slice(0, 8)
    });

    return {
      signed: true,
      proofOnly: true,
      networkSubmit: false,
      publicKey: keypair.publicKey.toBase58(),
      signature,
      txId: unsignedTransaction.txId || null
    };
  }

  function destroy() {
    destroyed = true;
    keypair = null;
    auditEvents.length = 0;
  }

  function getSafeAuditMetadata() {
    const publicKey = destroyed ? null : keypair?.publicKey?.toBase58?.() || null;
    return {
      stub: false,
      destroyed,
      phase: "R43C",
      providerMode: LOCAL_PROVIDER_MODES.REAL,
      providerType: LOCAL_PROVIDER_MODES.REAL,
      publicKey,
      sourceMetadata: redactSignerSourceMetadata(sourceMetadata),
      signImplemented: true,
      networkSubmit: false,
      privateKeysHandled: !destroyed,
      approved: false,
      liveTradingApproved: false,
      r43cVerdict: R43C_VERDICT,
      events: auditEvents
    };
  }

  recordAudit("LOCAL_SIGNER_LOADED", { sourceType: sourceMetadata.sourceType });

  return {
    stub: false,
    phase: "R43C",
    providerMode: LOCAL_PROVIDER_MODES.REAL,
    getPublicKey,
    signTransaction,
    destroy,
    getSafeAuditMetadata
  };
}

function createLocalSigner(options = {}) {
  const mode = String(options.providerMode || options.mode || LOCAL_PROVIDER_MODES.STUB).toLowerCase();
  if (mode === LOCAL_PROVIDER_MODES.REAL) {
    if (options.allowRealLocalSigner !== true) {
      throw Object.assign(new Error("local_real requires allowRealLocalSigner true"), {
        code: "LOCAL_REAL_SIGNER_BLOCKED"
      });
    }
    return createLocalSignerReal(options);
  }
  return createLocalSignerStub(options);
}

function loadSignerFromApprovedSource(options = {}) {
  const mode = String(options.providerMode || "").toLowerCase();
  if (mode === LOCAL_PROVIDER_MODES.REAL) {
    if (options.allowRealLocalSigner !== true) {
      throw Object.assign(new Error("local_real requires allowRealLocalSigner true"), {
        code: "LOCAL_REAL_SIGNER_BLOCKED"
      });
    }
    return createLocalSignerReal(options);
  }

  rejectRealSecretSource(options);
  return createLocalSignerStub({ ...options, loadedFromSource: true });
}

function printStubSummary() {
  console.log("[r41b-local-signer] Local Signer Safety Stub (no real signing)");
  console.log(`  public key: ${LOCAL_SIGNER_STUB_PUBLIC_KEY}`);
  console.log(`  verdict: ${R41B_VERDICT}`);
  console.log("  real secret loading: blocked in stub mode");
  console.log("  transaction submission: blocked");
  console.log("  live_executor integration: none");
}

if (require.main === module) {
  printStubSummary();
}

module.exports = {
  LOCAL_SIGNER_STUB_PUBLIC_KEY,
  R41B_VERDICT,
  R43C_VERDICT,
  LOCAL_PROVIDER_MODES,
  REQUIRED_APPROVAL_SCOPE,
  R43C_LIMITS,
  ENV_SECRET_JSON,
  ENV_KEYFILE,
  BLOCKED_SECRET_SOURCE_TYPES,
  runStubGuardChecks,
  rejectRealSecretSource,
  validateR43cCaps,
  validateSignerGuardContext,
  redactSignerSourceMetadata,
  createLocalSigner,
  createLocalSignerStub,
  createLocalSignerReal,
  loadSignerFromApprovedSource,
  loadSecretBytesFromApprovedSource,
  printStubSummary
};
