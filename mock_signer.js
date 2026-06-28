"use strict";

// mock_signer.js — R40 mock signer harness.
// Fake signing only. Does NOT use real keys, wallets, crypto signing, or submission.
// NOT integrated with live_executor.js.

const crypto = require("crypto");
const capsModule = require("./micro_live_caps");

const MOCK_SIGNER_PUBLIC_KEY = "MOCK_SIGNER_PUBLIC_KEY_DO_NOT_USE";
const MOCK_SIGNATURE_PREFIX = "MOCK_SIGNATURE_";
const R40_VERDICT = "MOCK SIGNER HARNESS COMPLETE — READY FOR LOCAL SIGNER IMPLEMENTATION PLAN";

const DEFAULT_MAX_QUOTE_AGE_MS = 30_000;
const DEFAULT_MAX_SLIPPAGE_BPS = 100;

const SECRET_FIELD_NAMES = new Set([
  "privatekey",
  "secretkey",
  "seedphrase",
  "mnemonic",
  "signersecret"
]);

function hashDeterministic(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex").slice(0, 32);
}

function redactValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length <= 8) return "[REDACTED]";
    return `${value.slice(0, 4)}…[REDACTED]`;
  }
  if (Array.isArray(value)) return "[REDACTED_ARRAY]";
  if (typeof value === "object") return "[REDACTED_OBJECT]";
  return "[REDACTED]";
}

function containsSuspiciousSecretMaterial(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return false;

  if (typeof value === "string") {
    if (/-----BEGIN(?:[\s\w]+)?PRIVATE KEY-----/.test(value)) return true;
    if (/\[\s*(?:\d{1,3}\s*,\s*){31,}\d{1,3}\s*\]/.test(value)) return true;
    if (/^[\d,\s\[\]]+$/.test(value) && value.includes(",") && value.match(/\d+/g)?.length >= 32) {
      return true;
    }
    if (/\b[1-9A-HJ-NP-Za-km-z]{87,88}\b/.test(value)) return true;
    return false;
  }

  if (Array.isArray(value)) {
    if (value.length === 64 && value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      return true;
    }
    return value.some((entry) => containsSuspiciousSecretMaterial(entry, depth + 1));
  }

  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (SECRET_FIELD_NAMES.has(String(key).toLowerCase()) && entry != null && entry !== "") {
        return true;
      }
      if (containsSuspiciousSecretMaterial(entry, depth + 1)) return true;
    }
  }

  return false;
}

function validateCapsForMockSign(caps) {
  if (!caps || typeof caps !== "object") {
    return { ok: false, reason: "operator caps missing" };
  }
  const approved = capsModule.validateApprovedCaps(caps);
  if (!approved.ok) {
    return { ok: false, reason: approved.errors.join("; ") };
  }
  return { ok: true };
}

function validateSafePosture(posture) {
  const blockers = [];
  if (!posture || typeof posture !== "object") {
    return { ok: false, blockers: ["posture missing"] };
  }
  if (posture.executionMode === "LIVE") {
    blockers.push("executionMode LIVE forbidden for mock signer");
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
  return { ok: blockers.length === 0, blockers };
}

function validateSignContext(context, caps, options = {}) {
  const blockers = [];
  const maxQuoteAgeMs = options.maxQuoteAgeMs ?? DEFAULT_MAX_QUOTE_AGE_MS;
  const maxSlippageBps = options.maxSlippageBps ?? DEFAULT_MAX_SLIPPAGE_BPS;

  if (context.live === true) blockers.push("context.live true forbidden");
  if (context.network === "mainnet") blockers.push("mainnet network forbidden");

  const tradeSizeSol = Number(context.tradeSizeSol);
  if (!Number.isFinite(tradeSizeSol) || tradeSizeSol <= 0) {
    blockers.push("tradeSizeSol must be a positive number");
  } else if (tradeSizeSol > Number(caps.maxTradeSizeSol)) {
    blockers.push(`tradeSizeSol exceeds cap (${caps.maxTradeSizeSol})`);
  }

  const sessionCount = Number(context.sessionTradeCount ?? 0);
  const maxTrades = Number(caps.maxTradesPerSession ?? 1);
  if (sessionCount >= maxTrades) {
    blockers.push(`session trade count ${sessionCount} exceeds max ${maxTrades}`);
  }

  const quoteAgeMs = Number(context.quoteAgeMs);
  if (Number.isFinite(quoteAgeMs) && quoteAgeMs > maxQuoteAgeMs) {
    blockers.push(`quote stale (${quoteAgeMs}ms > ${maxQuoteAgeMs}ms)`);
  }

  const slippageBps = Number(context.slippageBps);
  if (Number.isFinite(slippageBps) && slippageBps > maxSlippageBps) {
    blockers.push(`slippage ${slippageBps}bps exceeds cap ${maxSlippageBps}bps`);
  }

  return { ok: blockers.length === 0, blockers };
}

function createMockSigner(options = {}) {
  if (options.mockMode === false) {
    throw Object.assign(new Error("mockMode must be true"), { code: "MOCK_MODE_REQUIRED" });
  }

  const caps = options.caps ?? null;
  const posture = options.posture ?? {
    executionMode: "PIPELINE_DRY_RUN",
    dryRunMode: true,
    liveArmed: false,
    emergencyStop: false
  };
  const recoveryPresent = options.recoveryPresent === true;
  const maxQuoteAgeMs = options.maxQuoteAgeMs ?? DEFAULT_MAX_QUOTE_AGE_MS;
  const maxSlippageBps = options.maxSlippageBps ?? DEFAULT_MAX_SLIPPAGE_BPS;

  const auditEvents = [];
  let mockSignCount = 0;

  function recordAudit(stage, payload = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      stage,
      mock: true,
      publicKey: MOCK_SIGNER_PUBLIC_KEY,
      txId: payload.txId ? redactValue(payload.txId) : undefined,
      tradeSizeSol: payload.tradeSizeSol,
      network: payload.network || "mock",
      signaturePreview: payload.signature
        ? redactValue(payload.signature)
        : undefined
    };
    auditEvents.push(entry);
    return entry;
  }

  function getPublicKey() {
    return MOCK_SIGNER_PUBLIC_KEY;
  }

  function signTransaction(unsignedTransaction, context = {}) {
    if (recoveryPresent) {
      throw Object.assign(new Error("recovery_actions.jsonl present"), { code: "MOCK_RECOVERY_PRESENT" });
    }

    const capsCheck = validateCapsForMockSign(caps);
    if (!capsCheck.ok) {
      throw Object.assign(new Error(capsCheck.reason), { code: "MOCK_CAPS_INVALID" });
    }

    const postureCheck = validateSafePosture(posture);
    if (!postureCheck.ok) {
      throw Object.assign(new Error(postureCheck.blockers.join("; ")), {
        code: "MOCK_POSTURE_BLOCKED",
        blockers: postureCheck.blockers
      });
    }

    if (!unsignedTransaction || typeof unsignedTransaction !== "object") {
      throw Object.assign(new Error("unsignedTransaction must be an object"), { code: "MOCK_TX_INVALID" });
    }

    if (unsignedTransaction.live === true || unsignedTransaction.mainnet === true) {
      throw Object.assign(new Error("transaction marked live or mainnet"), { code: "MOCK_LIVE_PAYLOAD" });
    }

    if (containsSuspiciousSecretMaterial(unsignedTransaction) || containsSuspiciousSecretMaterial(context)) {
      throw Object.assign(new Error("suspicious secret-like material in input"), { code: "MOCK_SECRET_INPUT" });
    }

    const contextCheck = validateSignContext(context, caps, { maxQuoteAgeMs, maxSlippageBps });
    if (!contextCheck.ok) {
      throw Object.assign(new Error(contextCheck.blockers.join("; ")), {
        code: "MOCK_CONTEXT_BLOCKED",
        blockers: contextCheck.blockers
      });
    }

    const txId = unsignedTransaction.txId || unsignedTransaction.id || "mock-tx";
    const signature = `${MOCK_SIGNATURE_PREFIX}${hashDeterministic(JSON.stringify({ txId, context, publicKey: MOCK_SIGNER_PUBLIC_KEY }))}`;

    mockSignCount += 1;

    const result = {
      mock: true,
      simulated: true,
      publicKey: MOCK_SIGNER_PUBLIC_KEY,
      signature,
      txId,
      networkSubmit: false,
      signedAt: new Date().toISOString()
    };

    recordAudit("MOCK_SIGN", {
      txId,
      tradeSizeSol: context.tradeSizeSol,
      network: context.network || "mock",
      signature: result.signature
    });

    return result;
  }

  function getAuditRecord() {
    return {
      mock: true,
      publicKey: MOCK_SIGNER_PUBLIC_KEY,
      signCount: mockSignCount,
      events: auditEvents.map((event) => ({ ...event })),
      approved: false,
      liveTradingApproved: false,
      privateKeysHandled: false,
      r40Verdict: R40_VERDICT
    };
  }

  return {
    mock: true,
    getPublicKey,
    signTransaction,
    getAuditRecord
  };
}

function printInterfaceSummary() {
  console.log("[r40-mock-signer] Mock Signer Harness (fake signing only)");
  console.log(`  public key: ${MOCK_SIGNER_PUBLIC_KEY}`);
  console.log(`  signature prefix: ${MOCK_SIGNATURE_PREFIX}`);
  console.log(`  verdict: ${R40_VERDICT}`);
  console.log("  integrated with live_executor: false");
  console.log("  real signing: false");
}

if (require.main === module) {
  printInterfaceSummary();
}

module.exports = {
  MOCK_SIGNER_PUBLIC_KEY,
  MOCK_SIGNATURE_PREFIX,
  R40_VERDICT,
  DEFAULT_MAX_QUOTE_AGE_MS,
  DEFAULT_MAX_SLIPPAGE_BPS,
  hashDeterministic,
  redactValue,
  containsSuspiciousSecretMaterial,
  validateCapsForMockSign,
  validateSafePosture,
  validateSignContext,
  createMockSigner,
  printInterfaceSummary
};
