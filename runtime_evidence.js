"use strict";

// ─── Vulcan Stage 5 — Read-Only Runtime Evidence Collector ────────────────────
//
// Purpose: gather runtime EVIDENCE from existing files and map it into the shape
// that runtime_health.js (Stage 4) expects. This is an ADAPTER, not a judge —
// it never decides health, never mutates runtime state, never starts/stops
// processes, never reads `.env`, and never prints secrets.
//
// Guiding principle: the classifier gives Ori a way to judge runtime health; the
// evidence collector gathers evidence WITHOUT touching the runtime.
//
// STAGE 5 SCOPE:
//   - Read-only file access under a configurable runtimeRoot.
//   - Conservative: missing/malformed/unreadable → unknown/missing evidence,
//     never a thrown error (unless the caller opts into strict mode).
//   - Does NOT wire into dashboard_server.js (that is a later, separate stage).
//   - Does NOT change runtime, trading, gate, strategy, or authority behavior.
//
// Field shapes are aligned (read-only) with:
//   - executor_singleton_guard.js  → executor_singleton.lock.json
//   - scanner_gmgn_trending.js     → scanner_health.json
//   - live_positions_store.js      → live_positions.json (root array)
//   - live_executor.js / audit_writer.js → execution_audit.jsonl rows

const fs = require("fs");
const path = require("path");
const {
  A4_APPROVAL_PRODUCER,
  A4_APPROVAL_EVENT_TYPE,
  A4_APPROVAL_APPROVED_STATUSES
} = require("./a4_approval");

// ─── File names (read-only targets) ───────────────────────────────────────────

const FILES = Object.freeze({
  AUDIT: "execution_audit.jsonl",
  SCANNER_HEALTH: "scanner_health.json",
  EXECUTOR_LOCK: "executor_singleton.lock.json",
  LIVE_POSITIONS: "live_positions.json",
  PENDING_RECONCILIATION: "pending_reconciliation.json"
});

// Lock refresh cadence in executor_singleton_guard.js is a 3-minute stale TTL.
// Reused here so lock/heartbeat staleness lines up with the guard's own view.
const LOCK_STALE_MS = 3 * 60 * 1000;
const DEFAULT_AUDIT_TAIL_LIMIT = 50;

// ─── Small time/helpers (pure) ────────────────────────────────────────────────

function resolveNowMs(now) {
  if (typeof now === "number" && Number.isFinite(now)) return now;
  if (now instanceof Date) return now.getTime();
  if (typeof now === "string") {
    const t = Date.parse(now);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

function toIso(now) {
  if (typeof now === "string") return now;
  if (now instanceof Date) return now.toISOString();
  if (typeof now === "number" && Number.isFinite(now)) return new Date(now).toISOString();
  return new Date().toISOString();
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function resolveRuntimeRoot(options = {}) {
  if (isNonEmptyString(options.runtimeRoot)) return path.resolve(options.runtimeRoot);
  if (isNonEmptyString(process.env.TRACKTA_RUNTIME_ROOT)) return path.resolve(process.env.TRACKTA_RUNTIME_ROOT);
  return __dirname;
}

// ─── Generic read-only file helpers ───────────────────────────────────────────

// Reads and parses a JSON file if it exists. Never throws in default mode;
// returns a structured status object instead.
function readJsonIfExists(filePath) {
  if (!isNonEmptyString(filePath) || !fs.existsSync(filePath)) {
    return { exists: false, ok: false, value: null, error: null };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const value = JSON.parse(raw);
    return { exists: true, ok: true, value, error: null };
  } catch (err) {
    return { exists: true, ok: false, value: null, error: (err && err.message) || String(err) };
  }
}

// Reads the last `limit` non-blank lines of a JSONL file and parses each row.
// Malformed rows are captured as parseWarnings rather than throwing.
function readJsonlTail(filePath, limit = DEFAULT_AUDIT_TAIL_LIMIT) {
  const capped = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_AUDIT_TAIL_LIMIT;
  if (!isNonEmptyString(filePath) || !fs.existsSync(filePath)) {
    return { exists: false, rows: [], parseWarnings: [], totalLines: 0, returned: 0 };
  }
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    return {
      exists: true,
      rows: [],
      parseWarnings: [{ line: null, error: (err && err.message) || String(err) }],
      totalLines: 0,
      returned: 0
    };
  }

  const allLines = content.split(/\r?\n/);
  // Track original line numbers so parse warnings point at the right place.
  const nonBlank = [];
  for (let i = 0; i < allLines.length; i += 1) {
    if (allLines[i].trim().length > 0) nonBlank.push({ lineNo: i + 1, text: allLines[i] });
  }

  const tail = nonBlank.slice(-capped);
  const rows = [];
  const parseWarnings = [];
  for (const entry of tail) {
    try {
      rows.push(JSON.parse(entry.text));
    } catch (err) {
      parseWarnings.push({ line: entry.lineNo, error: (err && err.message) || String(err) });
    }
  }

  return {
    exists: true,
    rows,
    parseWarnings,
    totalLines: nonBlank.length,
    returned: rows.length
  };
}

// ─── Audit evidence ───────────────────────────────────────────────────────────

function readRecentAuditEvents(options = {}) {
  const runtimeRoot = resolveRuntimeRoot(options);
  const auditFile = isNonEmptyString(options.auditFile)
    ? options.auditFile
    : path.join(runtimeRoot, FILES.AUDIT);
  const limit = Number.isFinite(options.auditTailLimit) ? options.auditTailLimit : DEFAULT_AUDIT_TAIL_LIMIT;

  const tail = readJsonlTail(auditFile, limit);
  return {
    source: auditFile,
    present: tail.exists,
    rows: tail.rows,
    parseWarnings: tail.parseWarnings,
    totalLines: tail.totalLines,
    returned: tail.returned
  };
}

// ─── Scanner health evidence ──────────────────────────────────────────────────

// Returns the raw scanner_health.json object for runtime_health.js to classify
// freshness itself. The collector does NOT decide freshness here.
function readScannerHealth(options = {}) {
  const runtimeRoot = resolveRuntimeRoot(options);
  const scannerFile = isNonEmptyString(options.scannerFile)
    ? options.scannerFile
    : path.join(runtimeRoot, FILES.SCANNER_HEALTH);

  const read = readJsonIfExists(scannerFile);
  if (!read.exists) {
    return { source: scannerFile, present: false, parseOk: false, scannerHealth: null };
  }
  if (!read.ok || !read.value || typeof read.value !== "object") {
    return { source: scannerFile, present: true, parseOk: false, scannerHealth: null, error: read.error };
  }

  const v = read.value;
  // Pass through fields the classifier + a future dashboard may use. lastScanAt
  // is the one runtime_health.js reads for freshness.
  const scannerHealth = {
    lastScanAt: isNonEmptyString(v.lastScanAt) ? v.lastScanAt : null,
    lastScanStatus: isNonEmptyString(v.lastScanStatus) ? v.lastScanStatus : null,
    scannerFile: isNonEmptyString(v.scannerFile) ? v.scannerFile : null,
    watchMode: typeof v.watchMode === "boolean" ? v.watchMode : null,
    quietMarket: typeof v.quietMarket === "boolean" ? v.quietMarket : null,
    pairsEvaluated: Number.isFinite(v.scanStats?.pairsEvaluated) ? v.scanStats.pairsEvaluated : null,
    resultsCount: Number.isFinite(v.scanStats?.resultsCount) ? v.scanStats.resultsCount : null,
    scanIntervalMs: Number.isFinite(v.scanIntervalMs) ? v.scanIntervalMs : null
  };
  return { source: scannerFile, present: true, parseOk: true, scannerHealth };
}

// ─── Lock evidence ────────────────────────────────────────────────────────────

// Maps executor_singleton.lock.json into the lockEvidence shape runtime_health.js
// expects: { present, updatedAt, expected, staleThresholdMs }. Absence is
// reported as present:false, NOT an error.
function readLockEvidence(options = {}) {
  const runtimeRoot = resolveRuntimeRoot(options);
  const lockFile = isNonEmptyString(options.lockFile)
    ? options.lockFile
    : path.join(runtimeRoot, FILES.EXECUTOR_LOCK);

  const read = readJsonIfExists(lockFile);

  if (!read.exists) {
    return {
      source: lockFile,
      present: false,
      // `expected` is only asserted when the caller tells us a loop should be
      // running. Without that, absence stays ambiguous (classifier → unknown).
      expected: options.expectExecutorLoop === true ? true
        : options.expectExecutorLoop === false ? false
          : undefined,
      raw: null
    };
  }

  if (!read.ok || !read.value || typeof read.value !== "object") {
    return {
      source: lockFile,
      present: false,
      malformed: true,
      expected: options.expectExecutorLoop === true ? true : undefined,
      error: read.error || "lock file malformed",
      raw: null
    };
  }

  const lock = read.value;
  return {
    source: lockFile,
    present: true,
    updatedAt: isNonEmptyString(lock.updatedAt) ? lock.updatedAt : null,
    startedAt: isNonEmptyString(lock.startedAt) ? lock.startedAt : null,
    pid: Number.isFinite(lock.pid) ? lock.pid : null,
    instanceId: isNonEmptyString(lock.instanceId) ? lock.instanceId : null,
    command: isNonEmptyString(lock.command) ? lock.command : null,
    mode: isNonEmptyString(lock.mode) ? lock.mode : null,
    dryRunMode: typeof lock.dryRunMode === "boolean" ? lock.dryRunMode : null,
    liveArmed: typeof lock.liveArmed === "boolean" ? lock.liveArmed : null,
    expected: options.expectExecutorLoop === false ? false : true,
    staleThresholdMs: LOCK_STALE_MS,
    raw: lock
  };
}

// ─── Heartbeat evidence ───────────────────────────────────────────────────────

// The singleton guard refreshes lock.updatedAt every cycle, so updatedAt doubles
// as a liveness/heartbeat signal. This is an INFERENCE, so it is always marked
// uncertain — no dedicated heartbeat file exists in the repo today.
function readHeartbeatEvidence(options = {}) {
  const lock = options.lockEvidence || readLockEvidence(options);

  if (lock && lock.present === true && isNonEmptyString(lock.updatedAt)) {
    return {
      present: true,
      lastBeatAt: lock.updatedAt,
      staleThresholdMs: LOCK_STALE_MS,
      source: "executor_singleton.lock.json:updatedAt",
      uncertain: true
    };
  }

  if (lock && lock.malformed === true) {
    // Malformed lock is not proof of a stopped loop; keep it uncertain/unknown.
    return { present: null, lastBeatAt: null, source: "executor_singleton.lock.json (malformed)", uncertain: true };
  }

  // No lock present → no proof of life. Conservative: report missing, but note
  // the uncertainty (a loop with no lock would be an anomaly, not confirmation).
  return {
    present: false,
    lastBeatAt: null,
    source: "executor_singleton.lock.json (absent)",
    uncertain: true
  };
}

// ─── Open positions + capital exposure evidence ───────────────────────────────

function readOpenPositions(options = {}) {
  const runtimeRoot = resolveRuntimeRoot(options);
  const positionsFile = isNonEmptyString(options.positionsFile)
    ? options.positionsFile
    : path.join(runtimeRoot, FILES.LIVE_POSITIONS);

  const read = readJsonIfExists(positionsFile);
  if (!read.exists) {
    return { source: positionsFile, present: false, parseOk: false, openPositions: null };
  }
  if (!read.ok) {
    return { source: positionsFile, present: true, parseOk: false, openPositions: null, error: read.error };
  }
  if (!Array.isArray(read.value)) {
    // live_positions.json is a root array; anything else is malformed for our purposes.
    return { source: positionsFile, present: true, parseOk: false, openPositions: null, error: "positions root is not an array" };
  }
  const openPositions = read.value.filter(e => e && typeof e === "object" && !Array.isArray(e));
  return { source: positionsFile, present: true, parseOk: true, openPositions };
}

// Conservative capital-exposure inference:
//   - missing/malformed positions          → "unknown" (never assume "none")
//   - present + empty array                 → "none"    (clear evidence)
//   - present + any non-dryRun position     → "active"
//   - present + all-dryRun positions        → "possible" (capital-shaped, be cautious)
function inferCapitalExposure(evidence = {}) {
  const posInfo = evidence.positionsInfo;
  if (!posInfo || posInfo.present !== true || posInfo.parseOk !== true || !Array.isArray(posInfo.openPositions)) {
    return "unknown";
  }
  const positions = posInfo.openPositions;
  if (positions.length === 0) return "none";
  const anyReal = positions.some(p => p && p.dryRun !== true);
  return anyReal ? "active" : "possible";
}

// ─── A4 dedicated-RPC refusal signal detection ────────────────────────────────

// Matches the A4 refusal emitted by live_executor.js
// ("Dedicated RPC endpoint required; public mainnet-beta fallback refused.").
// Read-only detection only — does NOT change A4 behavior or claim A4 resolved.
function detectA4RefusalSignals(auditRows) {
  const rows = Array.isArray(auditRows) ? auditRows : [];
  let count = 0;
  let latestRefusalAt = null;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const payload = (row.payload && typeof row.payload === "object") ? row.payload : {};
    const message = isNonEmptyString(payload.message) ? payload.message : "";
    const isRefusal =
      /dedicated rpc endpoint required/i.test(message) ||
      (payload.requireDedicated === true && payload.publicFallbackUsed === false && payload.provider == null);
    if (!isRefusal) continue;

    count += 1;
    const ts = isNonEmptyString(row.timestamp) ? row.timestamp : null;
    if (ts && (latestRefusalAt === null || Date.parse(ts) > Date.parse(latestRefusalAt))) {
      latestRefusalAt = ts;
    }
  }

  if (count === 0) {
    return { dedicatedRpcRefusalDetected: false, recentRefusalCount: 0, latestRefusalAt: null };
  }
  return { dedicatedRpcRefusalDetected: true, recentRefusalCount: count, latestRefusalAt };
}

// ─── A4.2 — Safe (secret-free) dedicated-RPC evidence normalization ────────────
//
// Turns the raw endpoint-resolution audit rows that live_executor.js already
// writes into a stable, SECRET-SAFE evidence object that a future runtime_health
// classification stage (A4.3) can reason about. This function:
//   - reads ONLY safe, already-written audit fields (never `.env`, never secrets),
//   - NEVER copies raw endpoints, URLs, API keys, tokens, or query strings,
//   - maps provider identifiers through a fixed allowlist → safe labels only,
//   - NEVER emits A4_VERIFIED_DEDICATED (no safe runtime proof of dedicated use
//     exists yet — configured is not verified),
//   - NEVER claims live readiness.
//
// Guiding principle: Configuration is not proof. Proof requires safe runtime evidence.

const A4_STATUS = Object.freeze({
  UNKNOWN: "A4_UNKNOWN",
  NOT_CONFIGURED: "A4_NOT_CONFIGURED",
  CONFIGURED_UNVERIFIED: "A4_CONFIGURED_UNVERIFIED",
  REFUSAL_ACTIVE: "A4_REFUSAL_ACTIVE",
  FALLBACK_DETECTED: "A4_FALLBACK_DETECTED",
  // A4.13 — read-only proof status hints. These are produced ONLY by elevating
  // an already-CONFIGURED_UNVERIFIED posture using a safe, attributed proof
  // event; they never override NOT_CONFIGURED / REFUSAL_ACTIVE / FALLBACK.
  READ_ONLY_RPC_VERIFIED: "A4_READ_ONLY_RPC_VERIFIED",
  PROOF_FAILED: "A4_PROOF_FAILED",
  PROOF_STALE: "A4_PROOF_STALE"
  // A4_VERIFIED_DEDICATED is intentionally NOT produced here.
});

// ─── A4.13 — safe read-only RPC proof event ingestion ─────────────────────────
// A future approved proof runner appends one attributed audit event per proof.
// We read ONLY the newest safe, attributed event and never trust a row that
// carries a forbidden (secret-shaped) field.
const A4_PROOF_PRODUCER = "a4_rpc_proof";
const A4_PROOF_EVENT_TYPE = "A4_READ_ONLY_RPC_PROOF";
const A4_PROOF_STALE_MS = 24 * 60 * 60 * 1000; // 24h first-pass freshness window

// A4.18 — first-pass stability threshold (NOT env-configurable by design).
const A4_STABILITY_MIN_SUCCESSES = 2;
const A4_STABILITY_MIN_SEPARATION_MS = 15 * 60 * 1000; // 15 minutes
const A4_STABILITY_FRESHNESS_MS = A4_PROOF_STALE_MS;   // 24h window

// A4.21 — targeted bounded A4 proof-event scan window. The GENERIC audit tail
// (DEFAULT_AUDIT_TAIL_LIMIT = 50) stays small for all other evidence; this
// larger bounded window is scanned ONLY for rare A4 proof events so high-volume
// monitor/live_executor rows can no longer bury them. NOT env-configurable in
// the first pass (code default + injectable option for tests).
const DEFAULT_A4_PROOF_SCAN_LIMIT = 5000;
const DEFAULT_A4_APPROVAL_SCAN_LIMIT = 5000;
const A4_PROOF_SCAN_ERROR_CODES = Object.freeze({
  UNAVAILABLE: "A4_PROOF_SCAN_UNAVAILABLE",
  READ_ERROR: "A4_PROOF_SCAN_READ_ERROR",
  PARSE_ERROR: "A4_PROOF_SCAN_PARSE_ERROR",
  UNKNOWN_ERROR: "A4_PROOF_SCAN_UNKNOWN_ERROR"
});
const A4_APPROVAL_SCAN_ERROR_CODES = Object.freeze({
  UNAVAILABLE: "A4_APPROVAL_SCAN_UNAVAILABLE",
  READ_ERROR: "A4_APPROVAL_SCAN_READ_ERROR",
  PARSE_ERROR: "A4_APPROVAL_SCAN_PARSE_ERROR",
  UNKNOWN_ERROR: "A4_APPROVAL_SCAN_UNKNOWN_ERROR"
});

const A4_PROOF_STATUSES = new Set(["READ_ONLY_RPC_OK", "READ_ONLY_RPC_FAILED", "UNVERIFIED"]);
const A4_PROOF_METHODS = new Set(["getSlot"]);
const A4_PROOF_LATENCY_BUCKETS = new Set(["<250ms", "250-1000ms", ">1000ms", "unknown"]);
const A4_PROOF_PROVIDER_LABELS = new Set([
  "helius_rpc_url_configured",
  "solana_rpc_url_configured",
  "helius_api_key_configured",
  "helius_api_key_derived_configured",
  "not_configured",
  "unknown"
]);
const A4_PROOF_ENDPOINT_CLASSES = new Set(["dedicated", "public", "not_configured", "unknown"]);
const A4_PROOF_ERROR_CODES = new Set([
  "RPC_NOT_CONFIGURED", "RPC_PUBLIC_FALLBACK_BLOCKED", "RPC_TIMEOUT", "RPC_NETWORK_ERROR",
  "RPC_HTTP_ERROR", "RPC_JSON_ERROR", "RPC_MALFORMED_RESPONSE", "RPC_METHOD_NOT_ALLOWED", "RPC_UNKNOWN_ERROR"
]);
// Keys that must NEVER appear in a proof event; their presence means the row is
// untrusted and is rejected without reading (secret-exposure guard).
const A4_PROOF_FORBIDDEN_KEYS = [
  "endpoint", "url", "uri", "apiKey", "api_key", "apikey", "headers", "header",
  "body", "requestBody", "rawSlot", "slot", "slotValue", "wallet", "walletAddress",
  "signature", "transaction", "tx", "stack", "stackTrace", "env", "processEnv"
];
const A4_PROOF_SECRET_LIKE = /(:\/\/|api[-_]?key|bearer\s|sk-[a-z0-9])/i;

// Fixed allowlist: only these known provider identifiers map to safe labels.
// Anything else (including a raw URL or key-bearing string) collapses to
// "unknown" so no secret-shaped value can ever escape into evidence.
const A4_PROVIDER_LABELS = Object.freeze({
  HELIUS_RPC_URL: "helius_rpc_url_configured",
  SOLANA_RPC_URL: "solana_rpc_url_configured",
  HELIUS_API_KEY_DERIVED: "helius_api_key_derived_configured",
  RPC_URL: "legacy_rpc_url_ignored",
  PUBLIC_FALLBACK: "public_fallback_detected"
});

// Provider identifiers that represent an explicit dedicated (non-public) source.
const A4_DEDICATED_PROVIDERS = new Set(["HELIUS_RPC_URL", "SOLANA_RPC_URL", "HELIUS_API_KEY_DERIVED"]);

function safeProviderLabel(value) {
  if (typeof value !== "string" || !value.trim()) return "unknown";
  const key = value.trim();
  return Object.prototype.hasOwnProperty.call(A4_PROVIDER_LABELS, key)
    ? A4_PROVIDER_LABELS[key]
    : "unknown";
}

// Category of the selected provider — used to decide class/status without ever
// echoing the raw value. Any non-allowlisted string is "unknown" (never dedicated).
function providerCategory(provider) {
  if (provider === null || provider === undefined || provider === "") return "none";
  if (provider === "PUBLIC_FALLBACK") return "public";
  if (A4_DEDICATED_PROVIDERS.has(provider)) return "dedicated";
  if (provider === "RPC_URL") return "legacy";
  return "unknown";
}

// Extracts only the safe fields from one audit row's endpoint-resolution payload.
// Returns null when the row is not an endpoint-resolution row.
function extractA4ResolutionFacts(row) {
  const payload = (row && row.payload && typeof row.payload === "object") ? row.payload : null;
  if (!payload) return null;
  const message = isNonEmptyString(payload.message) ? payload.message : "";
  const refusalMessagePresent = /dedicated rpc endpoint required/i.test(message);
  const isResolution =
    payload.endpointResolution === true ||
    typeof payload.requireDedicated === "boolean" ||
    refusalMessagePresent;
  if (!isResolution) return null;

  return {
    timestamp: isNonEmptyString(row.timestamp) ? row.timestamp : null,
    requireDedicated: typeof payload.requireDedicated === "boolean" ? payload.requireDedicated : null,
    // provider is a variable-name label from live_executor (e.g. "HELIUS_RPC_URL")
    // or null; it is never a raw endpoint. It is still mapped defensively below.
    provider: (typeof payload.provider === "string" || payload.provider === null) ? payload.provider : null,
    publicFallbackUsed: typeof payload.publicFallbackUsed === "boolean" ? payload.publicFallbackUsed : null,
    configuredProvidersPresent: Array.isArray(payload.configuredProvidersPresent)
      ? payload.configuredProvidersPresent
      : null,
    refusalMessagePresent
  };
}

function unknownA4Evidence(reason) {
  return {
    statusHint: A4_STATUS.UNKNOWN,
    rpcRequired: null,
    rpcConfigured: null,
    rpcProviderLabel: "unknown",
    rpcEndpointClass: "unknown",
    rpcSource: "unknown",
    configuredProviderCount: null,
    configuredProvidersPresent: [],
    publicFallbackDetected: false,
    refusalActive: false,
    refusalReason: null,
    lastRefusalAt: null,
    lastEvidenceAt: null,
    secretExposureRisk: "none_observed",
    confidence: "low",
    proof: null,
    proofStability: null,
    proofScan: { available: false, limit: null, errorCode: null },
    approval: null,
    approvalScan: { available: false, limit: null, errorCode: null },
    notes: [reason || "no A4 endpoint-resolution evidence in audit tail"]
  };
}

// Extract safe facts from ONE candidate proof row. Returns:
//   null                     → not a proof row (ignored)
//   { secretRisk: true }     → attributed proof row carrying forbidden fields
//   { ...safe fields }       → a usable, allowlisted proof fact
function extractA4ProofFacts(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  if (row.producer !== A4_PROOF_PRODUCER) return null;
  if (row.eventType !== A4_PROOF_EVENT_TYPE) return null;
  const payload = (row.payload && typeof row.payload === "object" && !Array.isArray(row.payload))
    ? row.payload : null;
  if (!payload) return null;

  // Reject if any forbidden (secret-shaped) key exists at top level or payload.
  for (const key of A4_PROOF_FORBIDDEN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key) ||
        Object.prototype.hasOwnProperty.call(row, key)) {
      return { secretRisk: true };
    }
  }
  // Reject if any string payload value looks secret-like (URL/key/token shaped).
  for (const value of Object.values(payload)) {
    if (typeof value === "string" && A4_PROOF_SECRET_LIKE.test(value)) {
      return { secretRisk: true };
    }
  }

  const proofStatus = A4_PROOF_STATUSES.has(payload.proofStatus) ? payload.proofStatus : null;
  if (!proofStatus) return null;

  return {
    timestamp: isNonEmptyString(row.timestamp) ? row.timestamp : null,
    proofStatus,
    providerLabel: A4_PROOF_PROVIDER_LABELS.has(payload.providerLabel) ? payload.providerLabel : "unknown",
    endpointClass: A4_PROOF_ENDPOINT_CLASSES.has(payload.endpointClass) ? payload.endpointClass : "unknown",
    method: A4_PROOF_METHODS.has(payload.method) ? payload.method : "unknown",
    slotObserved: payload.slotObserved === true,
    slotValuePresent: payload.slotValuePresent === true,
    latencyMsBucket: A4_PROOF_LATENCY_BUCKETS.has(payload.latencyMsBucket) ? payload.latencyMsBucket : "unknown",
    publicFallbackUsed: payload.publicFallbackUsed === true,
    secretSafe: payload.secretSafe === true,
    errorCode: A4_PROOF_ERROR_CODES.has(payload.errorCode) ? payload.errorCode : (payload.errorCode == null ? null : "RPC_UNKNOWN_ERROR")
  };
}

// Collect all safe proof facts from audit rows, ascending by timestamp. Rows
// carrying forbidden/secret-shaped fields are dropped and flagged via secretRisk.
function collectA4ProofFacts(auditRows) {
  const rows = Array.isArray(auditRows) ? auditRows : [];
  let secretRisk = false;
  const facts = [];
  for (const row of rows) {
    const f = extractA4ProofFacts(row);
    if (!f) continue;
    if (f.secretRisk) { secretRisk = true; continue; }
    facts.push(f);
  }
  facts.sort((a, b) => {
    const ta = a.timestamp ? Date.parse(a.timestamp) : -Infinity;
    const tb = b.timestamp ? Date.parse(b.timestamp) : -Infinity;
    return ta - tb;
  });
  return { facts, secretRisk };
}

// ─── A4.21 — targeted bounded A4 proof-event scan ─────────────────────────────
//
// Reads a LARGER bounded recent window of the audit log but keeps ONLY attributed
// A4 proof rows. Never parses the whole file by default; never calls RPC; never
// re-runs proof. Fail-safe: any error degrades to `available:false` + a safe
// error code (no raw error, no path, no line content exposed).

// Default reader: bounded JSONL tail read (reuses readJsonlTail). Injectable via
// options.a4ProofScanReader for deterministic tests.
function defaultA4ProofScanReader(options = {}) {
  const runtimeRoot = resolveRuntimeRoot(options);
  const auditFile = isNonEmptyString(options.auditFile)
    ? options.auditFile
    : path.join(runtimeRoot, FILES.AUDIT);
  return readJsonlTail(auditFile, options.limit);
}

function readA4ProofScan(options = {}) {
  const limit = Number.isFinite(options.a4ProofScanLimit) && options.a4ProofScanLimit > 0
    ? Math.floor(options.a4ProofScanLimit)
    : DEFAULT_A4_PROOF_SCAN_LIMIT;
  try {
    const reader = typeof options.a4ProofScanReader === "function"
      ? options.a4ProofScanReader
      : defaultA4ProofScanReader;
    const result = reader({ ...options, limit });
    if (!result || result.exists === false) {
      return { available: false, limit, errorCode: A4_PROOF_SCAN_ERROR_CODES.UNAVAILABLE, rows: [] };
    }
    // Keep ONLY attributed proof rows; ignore (and never expose) everything else.
    const rows = (Array.isArray(result.rows) ? result.rows : []).filter(
      (r) => r && typeof r === "object" &&
        r.producer === A4_PROOF_PRODUCER && r.eventType === A4_PROOF_EVENT_TYPE
    );
    return { available: true, limit, errorCode: null, rows };
  } catch (err) {
    // Never surface raw error text. Map to a safe, enumerated code only.
    const code = (err && typeof err.__a4ProofScanCode === "string" && err.__a4ProofScanCode)
      ? err.__a4ProofScanCode
      : A4_PROOF_SCAN_ERROR_CODES.READ_ERROR;
    return { available: false, limit, errorCode: code, rows: [] };
  }
}

// Stable, secret-free identity for a proof row (timestamp + attribution + a few
// safe payload fields). Never includes URLs or secret-derived values.
function a4ProofRowKey(row) {
  const p = (row && row.payload && typeof row.payload === "object" && !Array.isArray(row.payload))
    ? row.payload : {};
  return [
    isNonEmptyString(row && row.timestamp) ? row.timestamp : "",
    (row && row.producer) || "",
    (row && row.eventType) || "",
    typeof p.proofStatus === "string" ? p.proofStatus : "",
    typeof p.method === "string" ? p.method : ""
  ].join("|");
}

// Merge attributed proof rows from multiple sources (generic tail + targeted
// scan), de-duplicated by a stable secret-free key. Non-proof rows are dropped;
// the downstream builders re-filter/sanitize regardless.
function mergeA4ProofRows(...rowLists) {
  const seen = new Set();
  const merged = [];
  for (const list of rowLists) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      if (row.producer !== A4_PROOF_PRODUCER || row.eventType !== A4_PROOF_EVENT_TYPE) continue;
      const key = a4ProofRowKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
    }
  }
  return merged;
}

// ─── A4.25 — targeted bounded A4 approval-event scan ──────────────────────────

const A4_APPROVAL_REF_PATTERN = /^[A-Za-z0-9._:-]+$/;
const A4_APPROVAL_FORBIDDEN_KEYS = [
  "endpoint", "url", "uri", "apiKey", "api_key", "apikey", "headers", "header",
  "body", "requestBody", "rawSlot", "slot", "slotValue", "wallet", "walletAddress",
  "signature", "transaction", "tx", "stack", "stackTrace", "env", "processEnv",
  "rpcUrl", "secret", "token", "password", "privateKey"
];
const A4_APPROVAL_SECRET_LIKE = /(:\/\/|api[-_]?key|bearer\s|sk-[a-z0-9])/i;
const A4_APPROVAL_STATUSES = new Set([
  "approved", "approved_with_conditions", "revoked", "pending_review", "not_approved"
]);

function defaultA4ApprovalScanReader(options = {}) {
  const runtimeRoot = resolveRuntimeRoot(options);
  const auditFile = isNonEmptyString(options.auditFile)
    ? options.auditFile
    : path.join(runtimeRoot, FILES.AUDIT);
  return readJsonlTail(auditFile, options.limit);
}

function readA4ApprovalScan(options = {}) {
  const limit = Number.isFinite(options.a4ApprovalScanLimit) && options.a4ApprovalScanLimit > 0
    ? Math.floor(options.a4ApprovalScanLimit)
    : DEFAULT_A4_APPROVAL_SCAN_LIMIT;
  try {
    const reader = typeof options.a4ApprovalScanReader === "function"
      ? options.a4ApprovalScanReader
      : defaultA4ApprovalScanReader;
    const result = reader({ ...options, limit });
    if (!result || result.exists === false) {
      return { available: false, limit, errorCode: A4_APPROVAL_SCAN_ERROR_CODES.UNAVAILABLE, rows: [] };
    }
    const rows = (Array.isArray(result.rows) ? result.rows : []).filter(
      (r) => r && typeof r === "object" &&
        r.producer === A4_APPROVAL_PRODUCER && r.eventType === A4_APPROVAL_EVENT_TYPE
    );
    return { available: true, limit, errorCode: null, rows };
  } catch (err) {
    const code = (err && typeof err.__a4ApprovalScanCode === "string" && err.__a4ApprovalScanCode)
      ? err.__a4ApprovalScanCode
      : A4_APPROVAL_SCAN_ERROR_CODES.READ_ERROR;
    return { available: false, limit, errorCode: code, rows: [] };
  }
}

function a4ApprovalRowKey(row) {
  const p = (row && row.payload && typeof row.payload === "object" && !Array.isArray(row.payload))
    ? row.payload : {};
  return [
    isNonEmptyString(row && row.timestamp) ? row.timestamp : "",
    (row && row.producer) || "",
    (row && row.eventType) || "",
    typeof p.approvalStatus === "string" ? p.approvalStatus : "",
    typeof p.decisionRef === "string" ? p.decisionRef : ""
  ].join("|");
}

function mergeA4ApprovalRows(...rowLists) {
  const seen = new Set();
  const merged = [];
  for (const list of rowLists) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      if (row.producer !== A4_APPROVAL_PRODUCER || row.eventType !== A4_APPROVAL_EVENT_TYPE) continue;
      const key = a4ApprovalRowKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
    }
  }
  return merged;
}

function extractA4ApprovalFacts(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  if (row.producer !== A4_APPROVAL_PRODUCER) return null;
  if (row.eventType !== A4_APPROVAL_EVENT_TYPE) return null;
  const payload = (row.payload && typeof row.payload === "object" && !Array.isArray(row.payload))
    ? row.payload : null;
  if (!payload) return null;

  for (const key of A4_APPROVAL_FORBIDDEN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key) ||
        Object.prototype.hasOwnProperty.call(row, key)) {
      return { secretRisk: true };
    }
  }
  for (const value of Object.values(payload)) {
    if (typeof value === "string" && A4_APPROVAL_SECRET_LIKE.test(value)) {
      return { secretRisk: true };
    }
  }

  const approvalStatus = A4_APPROVAL_STATUSES.has(payload.approvalStatus)
    ? payload.approvalStatus
    : null;
  if (!approvalStatus) return null;

  const approver = (typeof payload.approver === "string" && /^[A-Za-z .'-]+$/.test(payload.approver.trim()))
    ? payload.approver.trim()
    : null;
  const decisionRef = (typeof payload.decisionRef === "string" && A4_APPROVAL_REF_PATTERN.test(payload.decisionRef.trim()))
    ? payload.decisionRef.trim()
    : null;
  const evidenceRef = (typeof payload.evidenceRef === "string" && A4_APPROVAL_REF_PATTERN.test(payload.evidenceRef.trim()))
    ? payload.evidenceRef.trim()
    : null;

  return {
    timestamp: isNonEmptyString(row.timestamp) ? row.timestamp : null,
    approvalStatus,
    approver,
    decisionRef,
    evidenceRef,
    approvedAtIso: isNonEmptyString(payload.approvedAtIso) ? payload.approvedAtIso : null,
    expiresAtIso: isNonEmptyString(payload.expiresAtIso) ? payload.expiresAtIso : null,
    scopeNote: isNonEmptyString(payload.scopeNote) ? payload.scopeNote : null
  };
}

function collectA4ApprovalFacts(approvalRows) {
  const rows = Array.isArray(approvalRows) ? approvalRows : [];
  let secretRisk = false;
  const facts = [];
  for (const row of rows) {
    const f = extractA4ApprovalFacts(row);
    if (!f) continue;
    if (f.secretRisk) { secretRisk = true; continue; }
    facts.push(f);
  }
  facts.sort((a, b) => {
    const ta = a.timestamp ? Date.parse(a.timestamp) : -Infinity;
    const tb = b.timestamp ? Date.parse(b.timestamp) : -Infinity;
    return ta - tb;
  });
  return { facts, secretRisk };
}

function buildExpectedA4EvidenceRefs(stability, rpcProviderLabel, rpcEndpointClass) {
  const refs = new Set();
  if (stability && stability.providerConsistent === true &&
      stability.providerLabel && stability.endpointClass) {
    refs.add(`${stability.providerLabel}:${stability.endpointClass}`);
  }
  if (isNonEmptyString(rpcProviderLabel) && isNonEmptyString(rpcEndpointClass) &&
      rpcProviderLabel !== "unknown" && rpcEndpointClass !== "unknown") {
    refs.add(`${rpcProviderLabel}:${rpcEndpointClass}`);
  }
  return refs;
}

// Newest attributed approval/revocation event wins. Returns a secret-safe summary.
function buildA4ApprovalEvidence(approvalRows, options = {}) {
  const nowMs = resolveNowMs(options.now);
  const { facts, secretRisk } = collectA4ApprovalFacts(approvalRows);
  const empty = {
    present: false,
    approved: false,
    status: null,
    approver: null,
    decisionRef: null,
    evidenceRef: null,
    evidenceRefConsistent: false,
    approvedAtIso: null,
    expiresAtIso: null,
    freshness: "unknown",
    secretRisk: secretRisk === true
  };
  if (facts.length === 0) return empty;

  const latest = facts[facts.length - 1];
  const expectedRefs = buildExpectedA4EvidenceRefs(
    options.stability,
    options.rpcProviderLabel,
    options.rpcEndpointClass
  );
  const evidenceRefConsistent = latest.evidenceRef
    ? expectedRefs.has(latest.evidenceRef)
    : false;

  let freshness = "unknown";
  const approvedAtMs = latest.approvedAtIso ? Date.parse(latest.approvedAtIso) : NaN;
  if (Number.isFinite(approvedAtMs)) {
    freshness = (nowMs - approvedAtMs) <= A4_PROOF_STALE_MS ? "fresh" : "stale";
  }

  const expiresAtMs = latest.expiresAtIso ? Date.parse(latest.expiresAtIso) : NaN;
  const expired = Number.isFinite(expiresAtMs) && nowMs > expiresAtMs;

  const approved = !expired &&
    latest.approvalStatus !== "revoked" &&
    latest.approvalStatus !== "not_approved" &&
    latest.approvalStatus !== "pending_review" &&
    A4_APPROVAL_APPROVED_STATUSES.has(latest.approvalStatus);

  return {
    present: true,
    approved,
    status: latest.approvalStatus,
    approver: latest.approver,
    decisionRef: latest.decisionRef,
    evidenceRef: latest.evidenceRef,
    evidenceRefConsistent,
    approvedAtIso: latest.approvedAtIso || latest.timestamp,
    expiresAtIso: latest.expiresAtIso,
    freshness: expired ? "expired" : freshness,
    secretRisk: secretRisk === true
  };
}

// Read the newest safe, attributed proof event from the audit rows. Returns a
// secret-safe summary (never raw values). `present:false` when none found.
function buildA4ProofEvidence(auditRows, options = {}) {
  const nowMs = resolveNowMs(options.now);
  const { facts, secretRisk } = collectA4ProofFacts(auditRows);
  if (facts.length === 0) return { present: false, secretRisk };

  const latest = facts.reduce((a, b) => {
    const ta = a.timestamp ? Date.parse(a.timestamp) : -Infinity;
    const tb = b.timestamp ? Date.parse(b.timestamp) : -Infinity;
    return tb >= ta ? b : a;
  });

  const observedMs = latest.timestamp ? Date.parse(latest.timestamp) : NaN;
  let freshness = "unknown";
  if (Number.isFinite(observedMs)) {
    freshness = (nowMs - observedMs) <= A4_PROOF_STALE_MS ? "fresh" : "stale";
  }

  return {
    present: true,
    secretRisk,
    proofStatus: latest.proofStatus,
    providerLabel: latest.providerLabel,
    endpointClass: latest.endpointClass,
    method: latest.method,
    slotObserved: latest.slotObserved,
    slotValuePresent: latest.slotValuePresent,
    latencyMsBucket: latest.latencyMsBucket,
    publicFallbackUsed: latest.publicFallbackUsed,
    secretSafe: latest.secretSafe,
    errorCode: latest.errorCode,
    proofObservedAt: latest.timestamp,
    freshness
  };
}

// A4.18 — additive, secret-safe multi-proof stability evaluation.
//
// Evaluates whether repeated, time-separated, consistent, safe read-only proof
// successes exist. Produces a SUMMARY ONLY (never raw values). This never
// promotes to A4_VERIFIED_DEDICATED and never grants readiness — it only reports
// whether the stability threshold is met (`stabilityCandidate`).
function buildA4ProofStability(auditRows, options = {}) {
  const nowMs = resolveNowMs(options.now);
  const { facts, secretRisk } = collectA4ProofFacts(auditRows);

  const threshold = {
    minSuccesses: A4_STABILITY_MIN_SUCCESSES,
    minSeparationMs: A4_STABILITY_MIN_SEPARATION_MS,
    freshnessMs: A4_STABILITY_FRESHNESS_MS
  };

  const empty = {
    successCount: 0,
    freshSuccessCount: 0,
    firstProofAt: null,
    latestProofAt: null,
    separationBucket: "unknown",
    providerConsistent: false,
    endpointClassConsistent: false,
    providerLabel: null,
    endpointClass: null,
    fallbackObserved: false,
    failureObserved: false,
    secretSafe: secretRisk !== true,
    withinFreshnessWindow: false,
    stabilityCandidate: false,
    threshold
  };

  if (facts.length === 0) return empty;

  // A failure/fallback ANYWHERE in the observed proof facts disqualifies a
  // clean stability claim (conservative: repeated truth must be uninterrupted).
  const failureObserved = facts.some((f) => f.proofStatus === "READ_ONLY_RPC_FAILED");
  const fallbackObserved = facts.some((f) => f.publicFallbackUsed === true);
  const allSecretSafe = secretRisk !== true && facts.every((f) => f.secretSafe === true);

  // Fresh, successful, dedicated, non-fallback, secret-safe successes only.
  const freshSuccesses = facts.filter((f) =>
    f.proofStatus === "READ_ONLY_RPC_OK" &&
    f.publicFallbackUsed === false &&
    f.secretSafe === true &&
    f.endpointClass === "dedicated" &&
    f.timestamp &&
    Number.isFinite(Date.parse(f.timestamp)) &&
    (nowMs - Date.parse(f.timestamp)) <= A4_STABILITY_FRESHNESS_MS
  );

  const successCount = facts.filter((f) => f.proofStatus === "READ_ONLY_RPC_OK").length;
  const freshSuccessCount = freshSuccesses.length;

  const firstFresh = freshSuccesses.length ? freshSuccesses[0] : null;
  const lastFresh = freshSuccesses.length ? freshSuccesses[freshSuccesses.length - 1] : null;

  const providerConsistent = freshSuccesses.length >= 2 &&
    freshSuccesses.every((f) => f.providerLabel === firstFresh.providerLabel);
  const endpointClassConsistent = freshSuccesses.length >= 2 &&
    freshSuccesses.every((f) => f.endpointClass === firstFresh.endpointClass);

  let separationMs = null;
  if (firstFresh && lastFresh && firstFresh !== lastFresh) {
    separationMs = Date.parse(lastFresh.timestamp) - Date.parse(firstFresh.timestamp);
  }
  let separationBucket = "unknown";
  if (typeof separationMs === "number" && Number.isFinite(separationMs)) {
    separationBucket = separationMs >= A4_STABILITY_MIN_SEPARATION_MS ? ">=15m" : "<15m";
  }

  const withinFreshnessWindow = freshSuccessCount >= 1;

  const stabilityCandidate =
    freshSuccessCount >= A4_STABILITY_MIN_SUCCESSES &&
    providerConsistent === true &&
    endpointClassConsistent === true &&
    (firstFresh ? firstFresh.endpointClass === "dedicated" : false) &&
    typeof separationMs === "number" &&
    separationMs >= A4_STABILITY_MIN_SEPARATION_MS &&
    fallbackObserved === false &&
    failureObserved === false &&
    allSecretSafe === true;

  return {
    successCount,
    freshSuccessCount,
    firstProofAt: firstFresh ? firstFresh.timestamp : null,
    latestProofAt: lastFresh ? lastFresh.timestamp : null,
    separationBucket,
    providerConsistent,
    endpointClassConsistent,
    providerLabel: providerConsistent ? firstFresh.providerLabel : (firstFresh ? firstFresh.providerLabel : null),
    endpointClass: endpointClassConsistent ? firstFresh.endpointClass : (firstFresh ? firstFresh.endpointClass : null),
    fallbackObserved,
    failureObserved,
    secretSafe: allSecretSafe,
    withinFreshnessWindow,
    stabilityCandidate,
    threshold
  };
}

// Builds the secret-safe a4Evidence object from audit rows.
function buildA4Evidence(auditRows, options = {}) {
  const rows = Array.isArray(auditRows) ? auditRows : [];
  const refusal = detectA4RefusalSignals(rows);

  // A4.21 — proof/stability builders read from a merged, de-duplicated set of
  // attributed proof rows: the generic tail PLUS any targeted-scan proof rows.
  // Config/refusal/fallback detection below still uses `rows` (generic tail)
  // only — the scan never changes those blockers. `proofScan` carries safe
  // availability metadata for fail-safe reporting.
  const scanProofRows = Array.isArray(options.a4ProofRows) ? options.a4ProofRows : [];
  const scanApprovalRows = Array.isArray(options.a4ApprovalRows) ? options.a4ApprovalRows : [];
  const proofRows = mergeA4ProofRows(rows, scanProofRows);
  const approvalRows = mergeA4ApprovalRows(rows, scanApprovalRows);
  const proofScan = (options.proofScan && typeof options.proofScan === "object" && !Array.isArray(options.proofScan))
    ? {
        available: options.proofScan.available === true,
        limit: Number.isFinite(options.proofScan.limit) ? options.proofScan.limit : null,
        errorCode: isNonEmptyString(options.proofScan.errorCode) ? options.proofScan.errorCode : null
      }
    : { available: false, limit: null, errorCode: null };
  const approvalScan = (options.approvalScan && typeof options.approvalScan === "object" && !Array.isArray(options.approvalScan))
    ? {
        available: options.approvalScan.available === true,
        limit: Number.isFinite(options.approvalScan.limit) ? options.approvalScan.limit : null,
        errorCode: isNonEmptyString(options.approvalScan.errorCode) ? options.approvalScan.errorCode : null
      }
    : { available: false, limit: null, errorCode: null };

  const facts = [];
  for (const row of rows) {
    const f = extractA4ResolutionFacts(row);
    if (f) facts.push(f);
  }

  if (facts.length === 0 && !refusal.dedicatedRpcRefusalDetected) {
    // No config-resolution evidence. A proof row alone must NOT elevate posture,
    // but its presence is still reported (visibility without trust promotion).
    const base = unknownA4Evidence("no A4 endpoint-resolution evidence in audit tail");
    base.proofScan = proofScan;
    const pe = buildA4ProofEvidence(proofRows, { now: options.now });
    // A4.18 — proofStability is additive and reported even without config
    // evidence (visibility only); it never elevates posture on its own.
    base.proofStability = buildA4ProofStability(proofRows, { now: options.now });
    base.approvalScan = approvalScan;
    base.approval = buildA4ApprovalEvidence(approvalRows, {
      now: options.now,
      stability: base.proofStability,
      rpcProviderLabel: base.rpcProviderLabel,
      rpcEndpointClass: base.rpcEndpointClass
    });
    if (base.approval.secretRisk === true) {
      base.secretExposureRisk = "approval_event_forbidden_field_detected";
    }
    if (pe.secretRisk === true) base.secretExposureRisk = "proof_event_forbidden_field_detected";
    if (pe.present === true) {
      base.proof = {
        proofStatus: pe.proofStatus,
        providerLabel: pe.providerLabel,
        endpointClass: pe.endpointClass,
        method: pe.method,
        slotObserved: pe.slotObserved,
        slotValuePresent: pe.slotValuePresent,
        latencyMsBucket: pe.latencyMsBucket,
        publicFallbackUsed: pe.publicFallbackUsed,
        secretSafe: pe.secretSafe,
        errorCode: pe.errorCode,
        proofObservedAt: pe.proofObservedAt,
        freshness: pe.freshness
      };
      base.notes.push("proof event present but no config evidence; posture not elevated");
    }
    return base;
  }

  // Newest resolution row wins for primary status (fallback: array order).
  const latest = facts.length
    ? facts.reduce((a, b) => {
        const ta = a.timestamp ? Date.parse(a.timestamp) : -Infinity;
        const tb = b.timestamp ? Date.parse(b.timestamp) : -Infinity;
        return tb >= ta ? b : a;
      })
    : null;

  const cat = latest ? providerCategory(latest.provider) : "none";
  const configuredArr = latest && Array.isArray(latest.configuredProvidersPresent)
    ? latest.configuredProvidersPresent
    : null;
  const configuredProvidersPresent = configuredArr ? configuredArr.map(safeProviderLabel) : [];
  const configuredProviderCount = configuredArr ? configuredArr.length : null;

  const publicFallbackDetected = latest ? latest.publicFallbackUsed === true : false;

  const latestRefusal = latest
    ? (latest.refusalMessagePresent === true) ||
      (latest.requireDedicated === true &&
        (latest.provider === null || latest.provider === undefined) &&
        latest.publicFallbackUsed !== true)
    : refusal.dedicatedRpcRefusalDetected;

  let rpcConfigured;
  if (configuredProviderCount === null) {
    rpcConfigured = cat === "dedicated" ? true : (cat === "none" ? false : null);
  } else {
    rpcConfigured = configuredProviderCount > 0;
  }

  let statusHint;
  let confidence = latest ? "high" : "medium";
  if (publicFallbackDetected) {
    statusHint = A4_STATUS.FALLBACK_DETECTED;
  } else if (latestRefusal) {
    statusHint = rpcConfigured === false ? A4_STATUS.NOT_CONFIGURED : A4_STATUS.REFUSAL_ACTIVE;
  } else if (cat === "dedicated" || rpcConfigured === true) {
    statusHint = A4_STATUS.CONFIGURED_UNVERIFIED;
  } else if (rpcConfigured === false) {
    statusHint = A4_STATUS.NOT_CONFIGURED;
  } else {
    statusHint = A4_STATUS.UNKNOWN;
    confidence = "low";
  }

  const rpcEndpointClass =
    publicFallbackDetected ? "public"
      : cat === "dedicated" ? "dedicated"
        : (rpcConfigured === false || cat === "none") ? "not_configured"
          : "unknown";

  const rpcProviderLabel =
    publicFallbackDetected ? "public_fallback_detected"
      : cat === "dedicated" ? safeProviderLabel(latest.provider)
        : (rpcConfigured === false || cat === "none") ? "not_configured"
          : "unknown";

  // rpcSource is a variable-NAME only (safe), never an endpoint value.
  const rpcSource =
    cat === "dedicated" ? latest.provider
      : publicFallbackDetected ? "public_fallback"
        : (rpcConfigured === false || cat === "none") ? "not_configured"
          : "unknown";

  const notes = ["configured != verified"];
  if (statusHint === A4_STATUS.NOT_CONFIGURED) notes.push("no dedicated RPC provider configured");
  if (latestRefusal) notes.push("executor refused public fallback (fail-closed)");
  if (publicFallbackDetected) notes.push("public fallback observed on a trust-critical stage");

  // ── A4.13 — additive read-only proof integration ───────────────────────────
  // A safe, attributed proof event can ONLY elevate/annotate a posture that is
  // already CONFIGURED_UNVERIFIED. It never overrides NOT_CONFIGURED,
  // REFUSAL_ACTIVE, or FALLBACK_DETECTED, and never emits A4_VERIFIED_DEDICATED.
  const proofEvidence = buildA4ProofEvidence(proofRows, { now: options.now });
  let proof = null;
  let secretExposureRisk = "none_observed";
  if (proofEvidence.secretRisk === true) {
    // A proof row carried a forbidden field. Flag risk WITHOUT exposing anything.
    secretExposureRisk = "proof_event_forbidden_field_detected";
    notes.push("a4 proof event rejected: forbidden/secret-shaped field present");
  }
  if (proofEvidence.present === true) {
    proof = {
      proofStatus: proofEvidence.proofStatus,
      providerLabel: proofEvidence.providerLabel,
      endpointClass: proofEvidence.endpointClass,
      method: proofEvidence.method,
      slotObserved: proofEvidence.slotObserved,
      slotValuePresent: proofEvidence.slotValuePresent,
      latencyMsBucket: proofEvidence.latencyMsBucket,
      publicFallbackUsed: proofEvidence.publicFallbackUsed,
      secretSafe: proofEvidence.secretSafe,
      errorCode: proofEvidence.errorCode,
      proofObservedAt: proofEvidence.proofObservedAt,
      freshness: proofEvidence.freshness
    };
    if (statusHint === A4_STATUS.CONFIGURED_UNVERIFIED) {
      if (proofEvidence.proofStatus === "READ_ONLY_RPC_OK" &&
          proofEvidence.secretSafe === true &&
          proofEvidence.publicFallbackUsed === false) {
        if (proofEvidence.freshness === "fresh") {
          statusHint = A4_STATUS.READ_ONLY_RPC_VERIFIED;
          notes.push("fresh read-only RPC proof observed (getSlot); stability + human approval still required");
        } else if (proofEvidence.freshness === "stale") {
          statusHint = A4_STATUS.PROOF_STALE;
          notes.push("read-only RPC proof is stale; re-run authorized proof");
        }
        // freshness unknown → leave CONFIGURED_UNVERIFIED (cannot trust timing)
      } else if (proofEvidence.proofStatus === "READ_ONLY_RPC_FAILED") {
        statusHint = A4_STATUS.PROOF_FAILED;
        notes.push("read-only RPC proof failed; investigate provider path safely");
      }
    }
  }

  if (statusHint !== A4_STATUS.READ_ONLY_RPC_VERIFIED) {
    notes.push("no fresh runtime proof of dedicated use elevated; A4_VERIFIED_DEDICATED not emitted");
  } else {
    notes.push("one read-only proof only; A4_VERIFIED_DEDICATED requires stability + human approval");
  }

  // ── A4.18 — additive stability summary ─────────────────────────────────────
  // Reported alongside the single-newest `proof`. Does NOT change statusHint
  // here; runtime_health maps stabilityCandidate → A4_STABILITY_PROOF_OBSERVED
  // (and only when the base posture is A4_READ_ONLY_RPC_VERIFIED). Never emits
  // A4_VERIFIED_DEDICATED and never grants readiness.
  const proofStability = buildA4ProofStability(proofRows, { now: options.now });
  if (proofStability.stabilityCandidate === true) {
    notes.push("stability threshold met (repeated safe proofs); explicit human approval required before A4_VERIFIED_DEDICATED");
  }
  // A4.21 — surface safe scan availability for fail-safe messaging (no raw
  // error/path/line content ever exposed).
  if (proofScan.available === false && proofScan.errorCode) {
    notes.push("a4 proof scan unavailable; proof/stability limited to generic tail evidence");
  }
  if (approvalScan.available === false && approvalScan.errorCode) {
    notes.push("a4 approval scan unavailable; approval limited to generic tail evidence");
  }

  const approval = buildA4ApprovalEvidence(approvalRows, {
    now: options.now,
    stability: proofStability,
    rpcProviderLabel,
    rpcEndpointClass
  });
  if (approval.secretRisk === true) {
    secretExposureRisk = secretExposureRisk === "none_observed"
      ? "approval_event_forbidden_field_detected"
      : secretExposureRisk;
    notes.push("a4 approval event rejected: forbidden/secret-shaped field present");
  }
  if (approval.present === true && approval.approved !== true) {
    notes.push("explicit human approval absent, expired, revoked, or evidenceRef mismatch");
  }

  return {
    statusHint,
    rpcRequired: latest
      ? (latest.requireDedicated === true ? true : (latest.requireDedicated === false ? false : null))
      : (refusal.dedicatedRpcRefusalDetected ? true : null),
    rpcConfigured,
    rpcProviderLabel,
    rpcEndpointClass,
    rpcSource,
    configuredProviderCount,
    configuredProvidersPresent,
    publicFallbackDetected,
    refusalActive: latestRefusal === true,
    refusalReason: latestRefusal ? "dedicated_rpc_required_not_satisfied" : null,
    lastRefusalAt: refusal.latestRefusalAt || null,
    lastEvidenceAt: (latest && latest.timestamp) || null,
    secretExposureRisk,
    confidence,
    proof,
    proofStability,
    proofScan,
    approval,
    approvalScan,
    notes
  };
}

// ─── Assemble the classifier-compatible evidence shape ────────────────────────

// Takes the raw collector outputs and produces exactly the object shape that
// runtime_health.js consumes. Fields left undefined signal "no evidence".
function buildEvidenceShape(raw = {}) {
  const evidence = { now: raw.now };

  if (raw.auditInfo) evidence.auditEvents = raw.auditInfo.rows;
  if (raw.scannerInfo && raw.scannerInfo.parseOk) evidence.scannerHealth = raw.scannerInfo.scannerHealth;
  else if (raw.scannerInfo && raw.scannerInfo.present) evidence.scannerHealth = null;

  if (raw.lockInfo) {
    evidence.lockEvidence = {
      present: raw.lockInfo.present,
      updatedAt: raw.lockInfo.updatedAt,
      expected: raw.lockInfo.expected,
      staleThresholdMs: raw.lockInfo.staleThresholdMs
    };
  }
  if (raw.heartbeatInfo) {
    evidence.heartbeatEvidence = {
      present: raw.heartbeatInfo.present,
      lastBeatAt: raw.heartbeatInfo.lastBeatAt,
      staleThresholdMs: raw.heartbeatInfo.staleThresholdMs
    };
  }

  // pipelineMode / liveArmed derived only from the lock file (safe, non-secret).
  evidence.pipelineMode = isNonEmptyString(raw.pipelineMode) ? raw.pipelineMode
    : (raw.lockInfo && isNonEmptyString(raw.lockInfo.mode) ? raw.lockInfo.mode : "unknown");
  if (raw.lockInfo && typeof raw.lockInfo.liveArmed === "boolean") {
    evidence.liveArmed = raw.lockInfo.liveArmed;
  } else if (typeof raw.liveArmed === "boolean") {
    evidence.liveArmed = raw.liveArmed;
  }

  if (raw.positionsInfo && Array.isArray(raw.positionsInfo.openPositions)) {
    evidence.openPositions = raw.positionsInfo.openPositions;
  }

  evidence.capitalExposure = raw.capitalExposure;
  if (raw.a4GateSignals) evidence.a4GateSignals = raw.a4GateSignals;
  // A4.2 — safe, secret-free dedicated-RPC evidence. runtime_health may ignore
  // this field for now (A4 classification is a later, separate stage).
  if (raw.a4Evidence) evidence.a4Evidence = raw.a4Evidence;

  return evidence;
}

// ─── Top-level orchestration ──────────────────────────────────────────────────

function collectRuntimeEvidence(options = {}) {
  const runtimeRoot = resolveRuntimeRoot(options);
  const strict = options.strict === true;
  const nowIso = toIso(options.now);
  const auditTailLimit = Number.isFinite(options.auditTailLimit) ? options.auditTailLimit : DEFAULT_AUDIT_TAIL_LIMIT;

  const opts = { ...options, runtimeRoot };

  const run = (label, fn) => {
    try {
      return fn();
    } catch (err) {
      if (strict) throw err;
      return { __error: (err && err.message) || String(err), __label: label };
    }
  };

  const auditInfo = run("audit", () => readRecentAuditEvents({ ...opts, auditTailLimit }));
  const scannerInfo = run("scanner", () => readScannerHealth(opts));
  const lockInfo = run("lock", () => readLockEvidence(opts));
  const heartbeatInfo = run("heartbeat", () => readHeartbeatEvidence({ ...opts, lockEvidence: lockInfo }));
  const positionsInfo = run("positions", () => readOpenPositions(opts));

  const capitalExposure = inferCapitalExposure({ positionsInfo });
  const auditRows = auditInfo && auditInfo.rows ? auditInfo.rows : [];
  const a4GateSignals = detectA4RefusalSignals(auditRows);

  // A4.21 — targeted bounded proof scan (default 5000 lines). General evidence
  // above still uses the small generic tail; only A4 proof rows are pulled from
  // this larger window so rare proofs survive high monitor/live_executor volume.
  const a4ProofScanLimit = Number.isFinite(options.a4ProofScanLimit)
    ? options.a4ProofScanLimit
    : DEFAULT_A4_PROOF_SCAN_LIMIT;
  const proofScanRaw = run("a4ProofScan", () => readA4ProofScan({ ...opts, a4ProofScanLimit }));
  const proofScan = (proofScanRaw && !proofScanRaw.__error)
    ? proofScanRaw
    : { available: false, limit: a4ProofScanLimit, errorCode: A4_PROOF_SCAN_ERROR_CODES.UNKNOWN_ERROR, rows: [] };

  const a4ApprovalScanLimit = Number.isFinite(options.a4ApprovalScanLimit)
    ? options.a4ApprovalScanLimit
    : DEFAULT_A4_APPROVAL_SCAN_LIMIT;
  const approvalScanRaw = run("a4ApprovalScan", () => readA4ApprovalScan({ ...opts, a4ApprovalScanLimit }));
  const approvalScan = (approvalScanRaw && !approvalScanRaw.__error)
    ? approvalScanRaw
    : { available: false, limit: a4ApprovalScanLimit, errorCode: A4_APPROVAL_SCAN_ERROR_CODES.UNKNOWN_ERROR, rows: [] };

  const a4Evidence = buildA4Evidence(auditRows, {
    now: nowIso,
    a4ProofRows: proofScan.rows,
    proofScan: { available: proofScan.available, limit: proofScan.limit, errorCode: proofScan.errorCode },
    a4ApprovalRows: approvalScan.rows,
    approvalScan: { available: approvalScan.available, limit: approvalScan.limit, errorCode: approvalScan.errorCode }
  });

  const raw = {
    now: nowIso,
    auditInfo,
    scannerInfo,
    lockInfo,
    heartbeatInfo,
    positionsInfo,
    capitalExposure,
    a4GateSignals,
    a4Evidence,
    pipelineMode: options.pipelineMode,
    liveArmed: options.liveArmed
  };

  const evidence = buildEvidenceShape(raw);

  // A read-only provenance/uncertainty report to accompany the evidence.
  const meta = {
    runtimeRoot,
    now: nowIso,
    sources: {
      audit: auditInfo && auditInfo.source,
      scanner: scannerInfo && scannerInfo.source,
      lock: lockInfo && lockInfo.source,
      positions: positionsInfo && positionsInfo.source
    },
    warnings: [],
    uncertainties: []
  };

  if (auditInfo && auditInfo.present === false) meta.uncertainties.push("audit log absent");
  if (auditInfo && Array.isArray(auditInfo.parseWarnings) && auditInfo.parseWarnings.length > 0) {
    meta.warnings.push(`audit parse warnings: ${auditInfo.parseWarnings.length}`);
  }
  if (scannerInfo && scannerInfo.present === false) meta.uncertainties.push("scanner_health.json absent");
  if (scannerInfo && scannerInfo.present === true && scannerInfo.parseOk === false) meta.warnings.push("scanner_health.json malformed");
  if (lockInfo && lockInfo.present === false) meta.uncertainties.push("executor lock absent");
  if (lockInfo && lockInfo.malformed === true) meta.warnings.push("executor lock malformed");
  if (heartbeatInfo && heartbeatInfo.uncertain === true) meta.uncertainties.push(`heartbeat inferred from ${heartbeatInfo.source}`);
  if (positionsInfo && positionsInfo.present === false) meta.uncertainties.push("live_positions.json absent → exposure unknown");
  if (capitalExposure === "unknown") meta.uncertainties.push("capital exposure unknown (not assumed none)");
  if (evidence.pipelineMode === "unknown") meta.uncertainties.push("pipelineMode unknown");
  if (evidence.liveArmed === undefined) meta.uncertainties.push("liveArmed unknown");

  return { evidence, meta };
}

module.exports = {
  collectRuntimeEvidence,
  readRecentAuditEvents,
  readScannerHealth,
  readLockEvidence,
  readHeartbeatEvidence,
  readOpenPositions,
  readJsonIfExists,
  readJsonlTail,
  inferCapitalExposure,
  detectA4RefusalSignals,
  buildA4Evidence,
  buildA4ProofEvidence,
  buildA4ProofStability,
  readA4ProofScan,
  mergeA4ProofRows,
  readA4ApprovalScan,
  mergeA4ApprovalRows,
  buildA4ApprovalEvidence,
  safeProviderLabel,
  providerCategory,
  buildEvidenceShape,
  A4_STATUS,
  A4_PROOF_PRODUCER,
  A4_PROOF_EVENT_TYPE,
  A4_PROOF_STALE_MS,
  A4_STABILITY_MIN_SUCCESSES,
  A4_STABILITY_MIN_SEPARATION_MS,
  A4_STABILITY_FRESHNESS_MS,
  DEFAULT_A4_PROOF_SCAN_LIMIT,
  DEFAULT_A4_APPROVAL_SCAN_LIMIT,
  A4_PROOF_SCAN_ERROR_CODES,
  A4_APPROVAL_SCAN_ERROR_CODES,
  FILES,
  LOCK_STALE_MS,
  DEFAULT_AUDIT_TAIL_LIMIT
};
