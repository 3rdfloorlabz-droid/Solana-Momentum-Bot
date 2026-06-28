"use strict";

// micro_live_caps.js — Track A micro-live operator caps schema/loader.
// Read-only. Does NOT arm, trade, sign, submit, or enable live trading.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DEFAULT_CAPS_FILE = path.join(ROOT, "operator_records", "micro_live_demo_caps.json");
const EXAMPLE_CAPS_FILE = path.join(ROOT, "examples", "micro_live_demo_caps.example.json");

const SCHEMA_VERSION = 1;
const REQUIRED_PURPOSE = "micro-live engineering proof only";

const CONSERVATIVE_LIMITS = Object.freeze({
  maxTradeSizeSol: 0.02,
  maxDailyLossSol: 0.05,
  maxTradesPerSession: 1,
  maxOpenLivePositions: 1,
  autoCompoundingAllowed: false,
  requireHumanPresent: true,
  stopAfterFirstTransaction: true
});

const REQUIRED_FIELDS = Object.freeze([
  "approved",
  "approvedBy",
  "approvedAt",
  "purpose",
  "maxTradeSizeSol",
  "maxDailyLossSol",
  "maxTradesPerSession",
  "maxOpenLivePositions",
  "autoCompoundingAllowed",
  "requireHumanPresent",
  "stopAfterFirstTransaction",
  "notes"
]);

function isIsoTimestamp(value) {
  if (typeof value !== "string" || !value) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function loadCapsFile(filePath = DEFAULT_CAPS_FILE) {
  const target = filePath || DEFAULT_CAPS_FILE;
  if (!fs.existsSync(target)) {
    return { status: "missing", file: target, data: null };
  }
  try {
    const data = JSON.parse(fs.readFileSync(target, "utf8"));
    return { status: "present", file: target, data };
  } catch (err) {
    return {
      status: "corrupt",
      file: target,
      data: null,
      error: err && err.message ? err.message : String(err)
    };
  }
}

function validateConservativeCaps(caps) {
  const errors = [];
  if (!caps || typeof caps !== "object" || Array.isArray(caps)) {
    return { ok: false, errors: ["caps must be a JSON object"] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in caps)) {
      errors.push(`missing required field: ${field}`);
    }
  }

  if (typeof caps.purpose !== "string" || caps.purpose !== REQUIRED_PURPOSE) {
    errors.push(`purpose must be exactly "${REQUIRED_PURPOSE}"`);
  }

  if (!Number.isFinite(Number(caps.maxTradeSizeSol)) || Number(caps.maxTradeSizeSol) <= 0) {
    errors.push("maxTradeSizeSol must be a positive number");
  } else if (Number(caps.maxTradeSizeSol) > CONSERVATIVE_LIMITS.maxTradeSizeSol) {
    errors.push(`maxTradeSizeSol must be <= ${CONSERVATIVE_LIMITS.maxTradeSizeSol}`);
  }

  if (!Number.isFinite(Number(caps.maxDailyLossSol)) || Number(caps.maxDailyLossSol) <= 0) {
    errors.push("maxDailyLossSol must be a positive number");
  } else if (Number(caps.maxDailyLossSol) > CONSERVATIVE_LIMITS.maxDailyLossSol) {
    errors.push(`maxDailyLossSol must be <= ${CONSERVATIVE_LIMITS.maxDailyLossSol}`);
  }

  if (Number(caps.maxTradesPerSession) !== CONSERVATIVE_LIMITS.maxTradesPerSession) {
    errors.push(`maxTradesPerSession must be exactly ${CONSERVATIVE_LIMITS.maxTradesPerSession}`);
  }

  if (Number(caps.maxOpenLivePositions) !== CONSERVATIVE_LIMITS.maxOpenLivePositions) {
    errors.push(`maxOpenLivePositions must be exactly ${CONSERVATIVE_LIMITS.maxOpenLivePositions}`);
  }

  if (caps.autoCompoundingAllowed !== CONSERVATIVE_LIMITS.autoCompoundingAllowed) {
    errors.push("autoCompoundingAllowed must be false");
  }

  if (caps.requireHumanPresent !== CONSERVATIVE_LIMITS.requireHumanPresent) {
    errors.push("requireHumanPresent must be true");
  }

  if (caps.stopAfterFirstTransaction !== CONSERVATIVE_LIMITS.stopAfterFirstTransaction) {
    errors.push("stopAfterFirstTransaction must be true");
  }

  if (caps.notes !== undefined && typeof caps.notes !== "string") {
    errors.push("notes must be a string when present");
  }

  if (caps.approvedBy !== undefined && typeof caps.approvedBy !== "string") {
    errors.push("approvedBy must be a string");
  }

  if (caps.approvedAt !== undefined && caps.approvedAt !== null && !isIsoTimestamp(caps.approvedAt)) {
    errors.push("approvedAt must be a valid ISO timestamp or null");
  }

  if (caps.approved !== undefined && typeof caps.approved !== "boolean") {
    errors.push("approved must be a boolean");
  }

  return { ok: errors.length === 0, errors };
}

function validateApprovedCaps(caps) {
  const conservative = validateConservativeCaps(caps);
  const errors = [...conservative.errors];

  if (caps && caps.approved !== true) {
    errors.push("approved must be true for operator clearance");
  }

  if (caps && caps.approved === true) {
    if (typeof caps.approvedBy !== "string" || !caps.approvedBy.trim()) {
      errors.push("approvedBy must be a non-empty string when approved is true");
    }
    if (!isIsoTimestamp(caps.approvedAt)) {
      errors.push("approvedAt must be a valid ISO timestamp when approved is true");
    }
  }

  return { ok: errors.length === 0, errors, conservativeOk: conservative.ok };
}

function summarizeCapsLoad(loadResult) {
  if (loadResult.status === "missing") {
    return {
      fileStatus: "missing",
      conservativeOk: false,
      approvedOk: false,
      errors: ["operator caps file missing"]
    };
  }
  if (loadResult.status === "corrupt") {
    return {
      fileStatus: "corrupt",
      conservativeOk: false,
      approvedOk: false,
      errors: [`caps file corrupt: ${loadResult.error || "parse error"}`]
    };
  }

  const conservative = validateConservativeCaps(loadResult.data);
  const approved = validateApprovedCaps(loadResult.data);
  return {
    fileStatus: "present",
    conservativeOk: conservative.ok,
    approvedOk: loadResult.data.approved === true && approved.ok,
    approved: loadResult.data.approved === true,
    errors: approved.errors,
    conservativeErrors: conservative.errors
  };
}

module.exports = {
  ROOT,
  DEFAULT_CAPS_FILE,
  EXAMPLE_CAPS_FILE,
  SCHEMA_VERSION,
  REQUIRED_PURPOSE,
  CONSERVATIVE_LIMITS,
  REQUIRED_FIELDS,
  isIsoTimestamp,
  loadCapsFile,
  validateConservativeCaps,
  validateApprovedCaps,
  summarizeCapsLoad
};
