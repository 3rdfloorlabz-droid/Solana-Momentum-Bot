"use strict";

// local_signer.js — R41B local signer safety stubs.
// Guard boundary only. Does NOT load real secrets, sign, submit, or integrate with live_executor.js.

const capsModule = require("./micro_live_caps");
const mockSigner = require("./mock_signer");

const LOCAL_SIGNER_STUB_PUBLIC_KEY = "LOCAL_SIGNER_STUB_NOT_ARMED";
const R41B_VERDICT = "LOCAL SIGNER STUB ONLY — REAL SIGNING NOT IMPLEMENTED";

const BLOCKED_SECRET_SOURCE_TYPES = new Set([
  "env",
  "environment",
  "file",
  "keyfile",
  "mnemonic",
  "seed",
  "hardware"
]);

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
    getPublicKey,
    signTransaction,
    destroy,
    getSafeAuditMetadata
  };
}

function loadSignerFromApprovedSource(options = {}) {
  rejectRealSecretSource(options);
  return createLocalSignerStub({ ...options, loadedFromSource: true });
}

function printStubSummary() {
  console.log("[r41b-local-signer] Local Signer Safety Stub (no real signing)");
  console.log(`  public key: ${LOCAL_SIGNER_STUB_PUBLIC_KEY}`);
  console.log(`  verdict: ${R41B_VERDICT}`);
  console.log("  real secret loading: blocked");
  console.log("  transaction submission: blocked");
  console.log("  live_executor integration: none");
}

if (require.main === module) {
  printStubSummary();
}

module.exports = {
  LOCAL_SIGNER_STUB_PUBLIC_KEY,
  R41B_VERDICT,
  BLOCKED_SECRET_SOURCE_TYPES,
  runStubGuardChecks,
  rejectRealSecretSource,
  createLocalSignerStub,
  loadSignerFromApprovedSource,
  printStubSummary
};
