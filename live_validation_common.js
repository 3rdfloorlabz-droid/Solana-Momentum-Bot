"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SCHEMA_VERSION = "armed-preflight-receipt/1.0.0";

const ALLOWED_CHECK_STATUSES = Object.freeze([
  "PASS",
  "FAIL",
  "NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE"
]);

const FORBIDDEN_CHECK_STATUSES = Object.freeze(["SKIP", "N/A", "PASS_SKIPPED"]);

function nowIso() {
  return new Date().toISOString();
}

function hashFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function safeLoadJson(filePath, fallback = null) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function redactSecrets(value) {
  return String(value ?? "")
    .replace(/((?:[?&]|\b)(?:api[-_]?key|apikey|token)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\[(?:\s*\d{1,3}\s*,){15,}\s*\d{1,3}\s*\]/g, "[REDACTED_BYTE_ARRAY]")
    .replace(/\bSOLANA_SIGNER_SECRET\b[^,\n]*/gi, "SOLANA_SIGNER_SECRET=[REDACTED]")
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{44,}\b/g, "[REDACTED_BASE58]");
}

function validateCheckStatus(status) {
  if (!ALLOWED_CHECK_STATUSES.includes(status)) {
    throw new Error(`invalid check status: ${String(status)}`);
  }
}

function buildCheckResult(checkId, status, rationale, evidence = {}) {
  validateCheckStatus(status);
  const ts = nowIso();
  return {
    checkId,
    status,
    rationale: String(rationale || ""),
    evidence: sanitizeEvidence(evidence),
    timestamp: ts
  };
}

function sanitizeEvidence(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return {};
  }
  const out = {};
  for (const [key, value] of Object.entries(evidence)) {
    if (/secret|credential|private|mnemonic|seed/i.test(key)) continue;
    if (typeof value === "string") out[key] = redactSecrets(value);
    else if (value === null || typeof value === "boolean" || typeof value === "number") out[key] = value;
    else if (Array.isArray(value)) out[key] = value.map(v => typeof v === "string" ? redactSecrets(v) : v);
    else if (typeof value === "object") out[key] = sanitizeEvidence(value);
  }
  return out;
}

function envGateBooleans() {
  return {
    FOMO_ENABLE_LIVE_SUBMISSION: process.env.FOMO_ENABLE_LIVE_SUBMISSION === "YES" ? "YES" : "unset",
    FOMO_ALLOW_LOOP_LIVE: process.env.FOMO_ALLOW_LOOP_LIVE === "YES" ? "YES" : "unset",
    SOLANA_SIGNER_SECRET: process.env.SOLANA_SIGNER_SECRET ? "present" : "absent",
    EXPECTED_WALLET_PUBLIC_ADDRESS: process.env.EXPECTED_WALLET_PUBLIC_ADDRESS ? "present" : "absent"
  };
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortObject(value[key]);
  }
  return out;
}

function serializeReceipt(receipt) {
  return `${JSON.stringify(sortObject(receipt), null, 2)}\n`;
}

function buildReceipt({
  toolName,
  context,
  posture,
  fingerprints,
  checks,
  failures,
  overallStatus,
  startedAt,
  completedAt
}) {
  for (const check of checks) validateCheckStatus(check.status);
  return sortObject({
    schemaVersion: SCHEMA_VERSION,
    toolName,
    context,
    startedAt,
    completedAt: completedAt || nowIso(),
    overallStatus,
    posture,
    fingerprints: sanitizeEvidence(fingerprints || {}),
    checks,
    evidence: { checkCount: checks.length },
    failures: failures || []
  });
}

function collectCodeFingerprint(root, relativeFiles) {
  const hashes = {};
  for (const rel of relativeFiles) {
    const abs = path.join(root, rel);
    hashes[rel] = hashFile(abs);
  }
  return {
    algorithm: "sha256",
    files: hashes,
    aggregate: hashBuffer(Buffer.from(JSON.stringify(hashes)))
  };
}

function collectProcessFingerprint(processes = []) {
  return {
    count: processes.length,
    executorLoopCount: processes.filter(p => p.isExecutorLoop === true).length,
    fingerprint: hashBuffer(Buffer.from(JSON.stringify(processes.map(p => ({
      pid: p.pid || null,
      isExecutorLoop: !!p.isExecutorLoop
    })))))
  };
}

function assertNoSecretInReceipt(receipt) {
  const text = JSON.stringify(receipt);
  if (/SOLANA_SIGNER_SECRET["']?\s*:\s*["'][^[\]]+\]/i.test(text)) {
    throw new Error("receipt contains signer secret value");
  }
  if (/\[\s*\d{1,3}\s*,\s*\d{1,3}/.test(text)) {
    throw new Error("receipt may contain secret byte array");
  }
}

module.exports = {
  SCHEMA_VERSION,
  ALLOWED_CHECK_STATUSES,
  FORBIDDEN_CHECK_STATUSES,
  nowIso,
  hashFile,
  hashBuffer,
  safeLoadJson,
  redactSecrets,
  validateCheckStatus,
  buildCheckResult,
  sanitizeEvidence,
  envGateBooleans,
  serializeReceipt,
  buildReceipt,
  collectCodeFingerprint,
  collectProcessFingerprint,
  assertNoSecretInReceipt,
  sortObject
};
