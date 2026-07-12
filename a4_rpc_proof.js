"use strict";

// ─── A4.11 — Standalone read-only RPC proof (secret-safe, no authority) ───────
//
// Verifies that the configured DEDICATED RPC path can answer a single read-only
// JSON-RPC call (getSlot) — WITHOUT exposing secrets, loading a signer, sending
// a transaction, or touching execution/strategy logic.
//
// Guiding principle: Proof without authority. Visibility without exposure.
//
// Hard guarantees:
//   - never prints or returns a raw endpoint URL, API key, header, or request body
//   - never dumps the process environment
//   - never loads a signer / never reads any signer secret
//   - never submits a transaction (no write/submit or unsigned-sim calls here)
//   - returns METADATA ONLY (see result shape below)
//   - fails CLOSED when no dedicated provider is configured or public fallback
//     would be used (mirrors the executor's existing refusal)
//
// This module does NOT integrate with runtime_health, does NOT expose a dashboard
// endpoint, and by itself does NOT prove runtime use. A4.12 runtime verification
// is required. Configured is not verified; read-only proof is not live readiness.

const PROOF_STATUS = Object.freeze({
  UNVERIFIED: "UNVERIFIED",
  OK: "READ_ONLY_RPC_OK",
  FAILED: "READ_ONLY_RPC_FAILED"
});

const ERROR_CODES = Object.freeze({
  NOT_CONFIGURED: "RPC_NOT_CONFIGURED",
  PUBLIC_FALLBACK_BLOCKED: "RPC_PUBLIC_FALLBACK_BLOCKED",
  TIMEOUT: "RPC_TIMEOUT",
  NETWORK_ERROR: "RPC_NETWORK_ERROR",
  HTTP_ERROR: "RPC_HTTP_ERROR",
  JSON_ERROR: "RPC_JSON_ERROR",
  MALFORMED_RESPONSE: "RPC_MALFORMED_RESPONSE",
  METHOD_NOT_ALLOWED: "RPC_METHOD_NOT_ALLOWED",
  UNKNOWN_ERROR: "RPC_UNKNOWN_ERROR"
});

// Only these provider identifiers map to safe labels. Anything else (including a
// raw URL/key-bearing string) collapses to "unknown" so no secret can leak.
const PROVIDER_LABELS = Object.freeze({
  HELIUS_RPC_URL: "helius_rpc_url_configured",
  SOLANA_RPC_URL: "solana_rpc_url_configured",
  HELIUS_API_KEY_DERIVED: "helius_api_key_configured"
});

const DEDICATED_PROVIDERS = new Set(["HELIUS_RPC_URL", "SOLANA_RPC_URL", "HELIUS_API_KEY_DERIVED"]);

const DEFAULT_METHOD = "getSlot";
const ALLOWED_METHODS = new Set([DEFAULT_METHOD]);
const DEFAULT_TIMEOUT_MS = 3000;

function safeProviderLabel(provider) {
  if (typeof provider !== "string" || !provider) return "unknown";
  return Object.prototype.hasOwnProperty.call(PROVIDER_LABELS, provider)
    ? PROVIDER_LABELS[provider]
    : "unknown";
}

function safeEndpointClass(provider) {
  if (provider === "PUBLIC_FALLBACK") return "public";
  if (DEDICATED_PROVIDERS.has(provider)) return "dedicated";
  if (provider === null || provider === undefined || provider === "") return "not_configured";
  return "unknown";
}

function latencyBucket(ms) {
  if (typeof ms !== "number" || !isFinite(ms) || ms < 0) return "unknown";
  if (ms < 250) return "<250ms";
  if (ms <= 1000) return "250-1000ms";
  return ">1000ms";
}

// Build the metadata-only result. NO raw endpoint/key/header/body/slot ever.
function makeResult(fields) {
  return {
    proofStatus: fields.proofStatus,
    providerLabel: fields.providerLabel || "unknown",
    endpointClass: fields.endpointClass || "unknown",
    method: fields.method || DEFAULT_METHOD,
    slotObserved: fields.slotObserved === true,
    slotValuePresent: fields.slotValuePresent === true,
    latencyMsBucket: fields.latencyMsBucket || "unknown",
    publicFallbackUsed: fields.publicFallbackUsed === true,
    secretSafe: true,
    errorCode: fields.errorCode || null
  };
}

// Classify a thrown resolver refusal into a safe fail-closed result WITHOUT
// echoing any endpoint. The executor refusal error carries safe extras only
// (rejectedAsPublic / configuredProvidersPresent are provider-NAME labels).
function classifyResolverRefusal(err, method) {
  const extra = (err && typeof err === "object" && err.extra && typeof err.extra === "object")
    ? err.extra
    : {};
  const rejectedAsPublic = Array.isArray(extra.rejectedAsPublic) ? extra.rejectedAsPublic : [];
  const publicFallbackUsed = extra.publicFallbackUsed === true || rejectedAsPublic.length > 0;
  const errorCode = publicFallbackUsed
    ? ERROR_CODES.PUBLIC_FALLBACK_BLOCKED
    : ERROR_CODES.NOT_CONFIGURED;
  return makeResult({
    proofStatus: PROOF_STATUS.FAILED,
    providerLabel: "not_configured",
    endpointClass: "not_configured",
    method,
    publicFallbackUsed,
    errorCode
  });
}

// Classify a fetch/transport failure into a safe code. NEVER surface the raw
// error message (it may embed the endpoint URL or api-key).
function classifyTransportError(err) {
  const name = err && typeof err.name === "string" ? err.name : "";
  const code = err && typeof err.code === "string" ? err.code : "";
  if (name === "AbortError" || code === "A4_PROOF_TIMEOUT" || code === "ETIMEDOUT") {
    return ERROR_CODES.TIMEOUT;
  }
  // DNS / connection-level failures and any other fetch throw → network error.
  return ERROR_CODES.NETWORK_ERROR;
}

function timeoutError() {
  const err = new Error("a4 proof timeout");
  err.code = "A4_PROOF_TIMEOUT";
  return err;
}

/**
 * Run a single read-only RPC proof against the configured dedicated provider.
 * Returns metadata only; never throws for expected failures.
 *
 * @param {object} [options]
 * @param {function} [options.resolveEndpoint] injectable resolver (defaults to
 *        live_executor.resolveRpcEndpoint). Signature:
 *        (cfg, { requireDedicated, purpose }) => { endpoint, provider, publicFallbackUsed } | throws
 * @param {object}   [options.cfg] config object passed to the resolver (default {})
 * @param {function} [options.fetchImpl] injectable fetch (defaults to global fetch)
 * @param {string}   [options.method] read-only method (default "getSlot"; only getSlot allowed)
 * @param {number}   [options.timeoutMs] request timeout (default 3000)
 * @param {function} [options.now] injectable clock for latency (default Date.now)
 * @returns {Promise<object>} metadata-only proof result
 */
async function runA4ReadOnlyRpcProof(options = {}) {
  const method = typeof options.method === "string" ? options.method : DEFAULT_METHOD;
  const now = typeof options.now === "function" ? options.now : Date.now;
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : DEFAULT_TIMEOUT_MS;

  if (!ALLOWED_METHODS.has(method)) {
    return makeResult({
      proofStatus: PROOF_STATUS.FAILED,
      method,
      errorCode: ERROR_CODES.METHOD_NOT_ALLOWED
    });
  }

  // 1) Resolve provider through the existing safe resolver (fail-closed).
  let resolveEndpoint = options.resolveEndpoint;
  if (typeof resolveEndpoint !== "function") {
    // Lazy require so injecting a resolver in tests never loads the executor.
    resolveEndpoint = require("./live_executor").resolveRpcEndpoint;
  }
  const cfg = options.cfg && typeof options.cfg === "object" ? options.cfg : {};

  let resolved;
  try {
    resolved = resolveEndpoint(cfg, { requireDedicated: true, purpose: "a4_proof" });
  } catch (err) {
    return classifyResolverRefusal(err, method);
  }

  const provider = resolved ? resolved.provider : null;
  const providerLabel = safeProviderLabel(provider);
  const endpointClass = safeEndpointClass(provider);

  // Defensive: even though requireDedicated:true refuses public fallback, never
  // proceed if the resolver somehow reports a public fallback / non-dedicated.
  if (!resolved || resolved.publicFallbackUsed === true || provider === "PUBLIC_FALLBACK") {
    return makeResult({
      proofStatus: PROOF_STATUS.FAILED,
      providerLabel: "not_configured",
      endpointClass: "public",
      method,
      publicFallbackUsed: true,
      errorCode: ERROR_CODES.PUBLIC_FALLBACK_BLOCKED
    });
  }
  if (!DEDICATED_PROVIDERS.has(provider)) {
    return makeResult({
      proofStatus: PROOF_STATUS.FAILED,
      providerLabel,
      endpointClass,
      method,
      errorCode: ERROR_CODES.NOT_CONFIGURED
    });
  }

  // 2) Perform ONE read-only JSON-RPC call. Endpoint consumed internally only.
  let fetchImpl = options.fetchImpl;
  if (typeof fetchImpl !== "function") {
    fetchImpl = (typeof fetch === "function") ? fetch : null;
  }
  if (typeof fetchImpl !== "function") {
    return makeResult({
      proofStatus: PROOF_STATUS.FAILED,
      providerLabel,
      endpointClass,
      method,
      errorCode: ERROR_CODES.NETWORK_ERROR
    });
  }

  const requestBody = { jsonrpc: "2.0", id: 1, method, params: [] };
  const started = now();

  let response;
  try {
    const fetchPromise = fetchImpl(resolved.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(timeoutError()), timeoutMs);
    });
    try {
      response = await Promise.race([fetchPromise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return makeResult({
      proofStatus: PROOF_STATUS.FAILED,
      providerLabel,
      endpointClass,
      method,
      latencyMsBucket: latencyBucket(now() - started),
      errorCode: classifyTransportError(err)
    });
  }

  if (!response || response.ok !== true) {
    return makeResult({
      proofStatus: PROOF_STATUS.FAILED,
      providerLabel,
      endpointClass,
      method,
      latencyMsBucket: latencyBucket(now() - started),
      errorCode: ERROR_CODES.HTTP_ERROR
    });
  }

  let parsed;
  try {
    parsed = await response.json();
  } catch {
    return makeResult({
      proofStatus: PROOF_STATUS.FAILED,
      providerLabel,
      endpointClass,
      method,
      latencyMsBucket: latencyBucket(now() - started),
      errorCode: ERROR_CODES.JSON_ERROR
    });
  }

  // JSON-RPC error object present → sanitized code only (never echo message).
  if (parsed && typeof parsed === "object" && parsed.error !== undefined && parsed.error !== null) {
    return makeResult({
      proofStatus: PROOF_STATUS.FAILED,
      providerLabel,
      endpointClass,
      method,
      latencyMsBucket: latencyBucket(now() - started),
      errorCode: ERROR_CODES.JSON_ERROR
    });
  }

  // getSlot result must be a finite number. Presence only — raw value never returned.
  const result = parsed && typeof parsed === "object" ? parsed.result : undefined;
  const slotValuePresent = typeof result === "number" && isFinite(result);
  if (!slotValuePresent) {
    return makeResult({
      proofStatus: PROOF_STATUS.FAILED,
      providerLabel,
      endpointClass,
      method,
      latencyMsBucket: latencyBucket(now() - started),
      errorCode: ERROR_CODES.MALFORMED_RESPONSE
    });
  }

  return makeResult({
    proofStatus: PROOF_STATUS.OK,
    providerLabel,
    endpointClass,
    method,
    slotObserved: true,
    slotValuePresent: true,
    latencyMsBucket: latencyBucket(now() - started),
    publicFallbackUsed: false,
    errorCode: null
  });
}

// ─── A4.13 — safe audit-event representation of a proof result ────────────────
//
// These helpers convert a proof result into the secret-safe shape a future
// approved proof runner would append to execution_audit.jsonl. They NEVER call
// RPC, NEVER write a file, and NEVER include forbidden fields. Producing the
// event object is metadata-only; writing it is the caller's responsibility.

const A4_PROOF_PRODUCER = "a4_rpc_proof";
const A4_PROOF_EVENT_TYPE = "A4_READ_ONLY_RPC_PROOF";
const A4_PROOF_INVOCATION_CONTEXT = "a4_read_only_rpc_proof";

// Only these payload keys may ever appear in a proof audit event.
const A4_PROOF_AUDIT_ALLOWED_KEYS = Object.freeze([
  "proofStatus",
  "providerLabel",
  "endpointClass",
  "method",
  "slotObserved",
  "slotValuePresent",
  "latencyMsBucket",
  "publicFallbackUsed",
  "secretSafe",
  "errorCode"
]);

// Return a payload containing ONLY the allowlisted proof fields. Anything else
// (endpoint/url/key/headers/raw slot/wallet/signature/etc.) is dropped by
// construction — the allowlist is positive, so unknown keys never survive.
function sanitizeA4RpcProofForAudit(proofResult) {
  const src = (proofResult && typeof proofResult === "object") ? proofResult : {};
  const payload = {};
  for (const key of A4_PROOF_AUDIT_ALLOWED_KEYS) {
    if (src[key] !== undefined) payload[key] = src[key];
  }
  // secretSafe is asserted true for a well-formed proof result; default true.
  payload.secretSafe = src.secretSafe === false ? false : true;
  return payload;
}

// Build the full safe audit-event object (NOT written here). The shape matches
// audit_writer's canonical expectations: a required `producer`, a non-execution
// `eventType`, and proof fields under `payload`.
function buildA4RpcProofAuditEvent(proofResult, options = {}) {
  const payload = sanitizeA4RpcProofForAudit(proofResult);
  payload.invocationContext = A4_PROOF_INVOCATION_CONTEXT;
  const event = {
    eventType: A4_PROOF_EVENT_TYPE,
    stage: A4_PROOF_EVENT_TYPE,
    producer: A4_PROOF_PRODUCER,
    invocationContext: A4_PROOF_INVOCATION_CONTEXT,
    payload
  };
  if (typeof options.timestamp === "string" && options.timestamp) {
    event.timestamp = options.timestamp;
  }
  return event;
}

module.exports = {
  runA4ReadOnlyRpcProof,
  sanitizeA4RpcProofForAudit,
  buildA4RpcProofAuditEvent,
  PROOF_STATUS,
  ERROR_CODES,
  DEFAULT_METHOD,
  A4_PROOF_PRODUCER,
  A4_PROOF_EVENT_TYPE,
  A4_PROOF_INVOCATION_CONTEXT,
  A4_PROOF_AUDIT_ALLOWED_KEYS
};
