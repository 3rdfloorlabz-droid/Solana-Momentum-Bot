"use strict";

// recovery_audit.js — Sprint 4 A2m
// Append-only recovery action audit writer for future recovery_actions.jsonl.
//
// Does NOT execute recovery, spawn/kill processes, mutate live_config.json, or
// authorize actions. Audit is evidence only. No production caller should append
// until explicitly approved and wired.
//
// Path: TRACKTA_RUNTIME_ROOT/recovery_actions.jsonl when env set (tests);
//       otherwise <repo-root>/recovery_actions.jsonl (defined, not auto-created).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RECOVERY_AUDIT_FILENAME = "recovery_actions.jsonl";

const ACTION_CLASSES = new Set([
  "view-only",
  "preview-only",
  "config-control",
  "low-risk-recovery",
  "high-risk-recovery",
  "forbidden"
]);

const RISK_LEVELS = new Set(["none", "low", "medium", "high", "critical"]);

const RESULTS = new Set([
  "denied",
  "blocked",
  "planned",
  "executed",
  "failed",
  "postcheck_failed",
  "cancelled"
]);

const CHECK_STATUSES = new Set(["pass", "fail", "skipped", "unknown"]);

const AUTH_METHODS = new Set([
  "operator_token",
  "dashboard_control_token",
  "hmac",
  "none"
]);

const SCHEMA_FIELDS = Object.freeze([
  "timestamp",
  "actionId",
  "actor",
  "authMethod",
  "actionClass",
  "actionName",
  "targetProcess",
  "requestedState",
  "reason",
  "commandPreview",
  "commandExecuted",
  "precheckStatus",
  "precheckDetails",
  "postcheckStatus",
  "postcheckDetails",
  "result",
  "error",
  "liveArmedAtRequest",
  "executionModeAtRequest",
  "dryRunModeAtRequest",
  "emergencyStopAtRequest",
  "confirmationPhrase",
  "sourceIpOrHost",
  "dashboardSessionId",
  "relatedConfigAuditId",
  "requiresReview",
  "riskLevel"
]);

// Input-only helpers stripped before persistence (never written to ledger).
const INPUT_ONLY_FIELDS = new Set(["confirmationPhraseId", "confirmationPhraseMatched"]);

const FORBIDDEN_ENTRY_KEYS = /(?:^|_)(token|secret|privatekey|authorization|signersecret)(?:$|_)/i;

const SAFE_CONFIRMATION_PHRASE = /^(not-recorded|matched:[A-Za-z0-9_-]+|unmatched:[A-Za-z0-9_-]+)$/;

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const SECRET_SUBSTRING_PATTERNS = [
  /x-trackta-control-token:\s*\S+/gi,
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/gi
];

function getRecoveryAuditFilePath(fileOverride) {
  if (fileOverride) return path.resolve(fileOverride);
  const root = process.env.TRACKTA_RUNTIME_ROOT
    ? path.resolve(process.env.TRACKTA_RUNTIME_ROOT)
    : __dirname;
  return path.join(root, RECOVERY_AUDIT_FILENAME);
}

function buildRecoveryAuditEntry(partial = {}) {
  const base = {
    timestamp: new Date().toISOString(),
    actionId: crypto.randomUUID(),
    actor: "operator",
    authMethod: "none",
    actionClass: "preview-only",
    actionName: null,
    targetProcess: null,
    requestedState: null,
    reason: null,
    commandPreview: null,
    commandExecuted: null,
    precheckStatus: "unknown",
    precheckDetails: [],
    postcheckStatus: "unknown",
    postcheckDetails: [],
    result: "blocked",
    error: null,
    liveArmedAtRequest: false,
    executionModeAtRequest: "PIPELINE_DRY_RUN",
    dryRunModeAtRequest: true,
    emergencyStopAtRequest: false,
    confirmationPhrase: null,
    sourceIpOrHost: "127.0.0.1",
    dashboardSessionId: null,
    relatedConfigAuditId: null,
    requiresReview: true,
    riskLevel: "none"
  };
  return { ...base, ...partial };
}

function redactString(value) {
  if (typeof value !== "string") return value;
  let out = value;
  const envSecrets = [
    process.env.DASHBOARD_CONTROL_TOKEN,
    process.env.SOLANA_SIGNER_SECRET,
    process.env.TRACKTAOS_OPERATOR_TOKEN
  ].filter((s) => typeof s === "string" && s.length > 0);
  for (const secret of envSecrets) {
    if (out.includes(secret)) out = out.split(secret).join("[REDACTED]");
  }
  for (const re of SECRET_SUBSTRING_PATTERNS) {
    out = out.replace(re, "[REDACTED]");
  }
  return out;
}

function normalizeConfirmationPhrase(entry) {
  const id = entry.confirmationPhraseId;
  const matched = entry.confirmationPhraseMatched;
  if (typeof id === "string" && id.trim() !== "") {
    const safeId = id.trim().replace(/[^A-Za-z0-9_-]/g, "_");
    return matched === true ? `matched:${safeId}` : `unmatched:${safeId}`;
  }
  const phrase = entry.confirmationPhrase;
  if (phrase === null || phrase === undefined) return null;
  if (typeof phrase !== "string") return null;
  const trimmed = phrase.trim();
  if (trimmed === "") return null;
  if (SAFE_CONFIRMATION_PHRASE.test(trimmed)) return trimmed;
  // Raw operator input is never stored.
  return "not-recorded";
}

function sanitizeRecoveryAuditEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("Recovery audit entry must be a plain object.");
  }

  for (const key of Object.keys(entry)) {
    if (FORBIDDEN_ENTRY_KEYS.test(key)) {
      throw new Error(`Recovery audit entry contains forbidden key: ${key}`);
    }
  }

  const out = {};
  for (const field of SCHEMA_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(entry, field)) continue;
    let value = entry[field];
    if (typeof value === "string") value = redactString(value);
    if (field === "precheckDetails" || field === "postcheckDetails") {
      if (!Array.isArray(value)) {
        throw new Error(`${field} must be an array.`);
      }
      out[field] = value.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          throw new Error(`${field} items must be plain objects.`);
        }
        const row = { ...item };
        if (typeof row.detail === "string") row.detail = redactString(row.detail);
        if (typeof row.label === "string") row.label = redactString(row.label);
        return row;
      });
      continue;
    }
    out[field] = value;
  }

  out.confirmationPhrase = normalizeConfirmationPhrase(entry);
  return out;
}

function isIsoTimestamp(value) {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value)) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function validateRecoveryAuditEntry(entry) {
  const errors = [];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { ok: false, errors: ["Entry must be a plain object."] };
  }

  for (const key of Object.keys(entry)) {
    if (!SCHEMA_FIELDS.includes(key)) {
      errors.push(`Unknown field: ${key}`);
    }
  }

  const required = [
    "timestamp",
    "actionId",
    "actor",
    "authMethod",
    "actionClass",
    "result",
    "liveArmedAtRequest",
    "executionModeAtRequest",
    "dryRunModeAtRequest",
    "emergencyStopAtRequest",
    "sourceIpOrHost",
    "requiresReview",
    "riskLevel"
  ];
  for (const field of required) {
    if (entry[field] === undefined || entry[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (entry.timestamp !== undefined && !isIsoTimestamp(entry.timestamp)) {
    errors.push("timestamp must be an ISO-8601 UTC string");
  }
  if (entry.actionId !== undefined && (typeof entry.actionId !== "string" || entry.actionId.trim() === "")) {
    errors.push("actionId must be a non-empty string");
  }
  if (entry.actor !== undefined && (typeof entry.actor !== "string" || entry.actor.trim() === "")) {
    errors.push("actor must be a non-empty string");
  }
  if (entry.authMethod !== undefined && !AUTH_METHODS.has(entry.authMethod)) {
    errors.push(`Invalid authMethod: ${entry.authMethod}`);
  }
  if (entry.actionClass !== undefined && !ACTION_CLASSES.has(entry.actionClass)) {
    errors.push(`Invalid actionClass: ${entry.actionClass}`);
  }
  if (entry.riskLevel !== undefined && !RISK_LEVELS.has(entry.riskLevel)) {
    errors.push(`Invalid riskLevel: ${entry.riskLevel}`);
  }
  if (entry.result !== undefined && !RESULTS.has(entry.result)) {
    errors.push(`Invalid result: ${entry.result}`);
  }
  if (entry.precheckStatus !== undefined && entry.precheckStatus !== null &&
      !CHECK_STATUSES.has(entry.precheckStatus)) {
    errors.push(`Invalid precheckStatus: ${entry.precheckStatus}`);
  }
  if (entry.postcheckStatus !== undefined && entry.postcheckStatus !== null &&
      !CHECK_STATUSES.has(entry.postcheckStatus)) {
    errors.push(`Invalid postcheckStatus: ${entry.postcheckStatus}`);
  }

  for (const boolField of ["liveArmedAtRequest", "dryRunModeAtRequest", "emergencyStopAtRequest", "requiresReview"]) {
    if (entry[boolField] !== undefined && typeof entry[boolField] !== "boolean") {
      errors.push(`${boolField} must be a boolean`);
    }
  }

  if (entry.executionModeAtRequest !== undefined && typeof entry.executionModeAtRequest !== "string") {
    errors.push("executionModeAtRequest must be a string");
  }
  if (entry.sourceIpOrHost !== undefined && typeof entry.sourceIpOrHost !== "string") {
    errors.push("sourceIpOrHost must be a string");
  }

  if (entry.precheckDetails !== undefined && !Array.isArray(entry.precheckDetails)) {
    errors.push("precheckDetails must be an array");
  }
  if (entry.postcheckDetails !== undefined && !Array.isArray(entry.postcheckDetails)) {
    errors.push("postcheckDetails must be an array");
  }

  if (entry.confirmationPhrase !== undefined && entry.confirmationPhrase !== null) {
    if (typeof entry.confirmationPhrase !== "string" ||
        !SAFE_CONFIRMATION_PHRASE.test(entry.confirmationPhrase)) {
      errors.push("confirmationPhrase must be null, not-recorded, or matched:/unmatched:<id>");
    }
  }

  const noExecutionResults = new Set(["denied", "blocked", "planned", "cancelled"]);
  if (noExecutionResults.has(entry.result) &&
      entry.commandExecuted !== undefined && entry.commandExecuted !== null) {
    errors.push("commandExecuted must be null for denied/blocked/planned/cancelled results");
  }

  if ((entry.result === "failed" || entry.result === "postcheck_failed") &&
      (entry.error === undefined || entry.error === null || String(entry.error).trim() === "")) {
    errors.push("error is required when result is failed or postcheck_failed");
  }

  if (entry.actionClass === "high-risk-recovery") {
    if (!entry.reason || String(entry.reason).trim() === "") {
      errors.push("reason is required for high-risk-recovery");
    }
    if (entry.requiresReview !== true) {
      errors.push("requiresReview must be true for high-risk-recovery");
    }
  }

  if (entry.actionClass === "low-risk-recovery" || entry.actionClass === "high-risk-recovery") {
    if (!entry.actionName || String(entry.actionName).trim() === "") {
      errors.push("actionName is required for recovery action classes");
    }
  }

  if (entry.result === "blocked" || entry.result === "denied") {
    if (entry.requiresReview !== true) {
      errors.push("requiresReview must be true for denied/blocked results");
    }
  }

  // Secret leakage check on sanitized strings.
  for (const field of SCHEMA_FIELDS) {
    if (typeof entry[field] !== "string") continue;
    const envSecrets = [
      process.env.DASHBOARD_CONTROL_TOKEN,
      process.env.SOLANA_SIGNER_SECRET
    ].filter((s) => typeof s === "string" && s.length > 0);
    for (const secret of envSecrets) {
      if (entry[field].includes(secret)) {
        errors.push(`${field} must not contain secret values`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function readExistingActionIds(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  const ids = new Set();
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row && row.actionId) ids.add(row.actionId);
    } catch {
      throw new Error(`Corrupt recovery audit ledger: invalid JSON line in ${filePath}`);
    }
  }
  return ids;
}

function appendRecoveryAuditEntry(entry, options = {}) {
  const filePath = getRecoveryAuditFilePath(options.filePath);
  const sanitized = sanitizeRecoveryAuditEntry(entry);
  const validation = validateRecoveryAuditEntry(sanitized);
  if (!validation.ok) {
    throw new Error(`Invalid recovery audit entry: ${validation.errors.join("; ")}`);
  }

  const existingIds = readExistingActionIds(filePath);
  if (existingIds.has(sanitized.actionId)) {
    throw new Error(`Duplicate recovery audit actionId: ${sanitized.actionId}`);
  }

  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const line = `${JSON.stringify(sanitized)}\n`;
  const prior = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";

  fs.appendFileSync(filePath, line, { encoding: "utf8" });

  const after = fs.readFileSync(filePath, "utf8");
  if (!after.startsWith(prior)) {
    throw new Error("Recovery audit append must not truncate existing content.");
  }
  if (after.slice(prior.length) !== line) {
    throw new Error("Recovery audit append wrote unexpected content.");
  }

  JSON.parse(line.trim());

  return {
    actionId: sanitized.actionId,
    filePath,
    entry: sanitized
  };
}

module.exports = {
  getRecoveryAuditFilePath,
  buildRecoveryAuditEntry,
  validateRecoveryAuditEntry,
  sanitizeRecoveryAuditEntry,
  appendRecoveryAuditEntry,
  SCHEMA_FIELDS,
  ACTION_CLASSES,
  RISK_LEVELS,
  RESULTS,
  CHECK_STATUSES,
  AUTH_METHODS
};
