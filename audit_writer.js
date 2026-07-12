"use strict";

// ─── Vulcan Stage 1 — Shared Audit Writer ─────────────────────────────────────
//
// Purpose: provide a single, attribution-enforcing writer for NEW audit rows so
// that runtime activity can eventually be classified by WHO produced it, under
// WHAT mode, and under WHAT authority — not by file recency alone.
//
// Guiding principle: operational health requires producer identity, not just
// activity.
//
// STAGE 1 SCOPE (important):
//   - This module is a FOUNDATION only. Nothing in the running bot is wired to
//     it yet. Creating this file does NOT change bot behavior.
//   - It does not read `.env`, does not touch secrets, does not start/stop any
//     process, and does not resolve A1 or A4.
//   - It does not rewrite or migrate any legacy audit row.
//
// The writer refuses to emit a NEW row without a `producer`. Unattributed rows
// are exactly the ambiguity Vulcan Cycle 002 surfaced, so they are forbidden by
// construction here.
//
// Ref: Ori/Phase 2/Project Vulcan/Implementation Planning/
//      VULCAN IMPLEMENTATION PLAN — Runtime Identity & Audit Producer Clarity.md

const fs = require("fs");
const path = require("path");

// Honor the same runtime-root convention live_executor.js uses, so a future
// wiring stage points at the same audit file without surprises. Falls back to
// this module's directory when the override is absent.
const ROOT = process.env.TRACKTA_RUNTIME_ROOT
  ? path.resolve(process.env.TRACKTA_RUNTIME_ROOT)
  : __dirname;

const DEFAULT_AUDIT_FILE = path.join(ROOT, "execution_audit.jsonl");

// ─── Reference vocabularies (ratified design) ─────────────────────────────────
// Enumerations are provided for callers and tests. The writer does NOT reject
// unknown enum values (forward-compatibility); it only enforces that producer
// is present. Enums document the ratified intent.

const PRODUCERS = Object.freeze({
  MONITOR: "monitor",
  LIVE_EXECUTOR_LOOP: "live_executor_loop",
  LIVE_EXECUTOR_CYCLE: "live_executor_cycle",
  LIVE_EXECUTOR_STATUS: "live_executor_status",
  DASHBOARD: "dashboard",
  SCANNER: "scanner",
  TEST_HARNESS: "test_harness",
  MANUAL_OPERATOR: "manual_operator",
  UNKNOWN_LEGACY: "unknown_legacy"
});

const RUNTIME_MODES = Object.freeze({
  PAPER: "paper",
  DRY_RUN: "dry_run",
  SIMULATION: "simulation",
  OBSERVATION_ONLY: "observation_only",
  LIVE_ARMED: "live_armed",
  TEST: "test",
  UNKNOWN: "unknown",
  UNKNOWN_LEGACY: "unknown_legacy"
});

const AUTHORITY_MODES = Object.freeze({
  ADVISORY: "advisory",
  MONITOR_ONLY: "monitor_only",
  GATED_EXECUTION: "gated_execution",
  HUMAN_REQUIRED: "human_required",
  FORBIDDEN: "forbidden",
  UNKNOWN: "unknown",
  UNKNOWN_LEGACY: "unknown_legacy"
});

const CAPITAL_EXPOSURE = Object.freeze({
  NONE: "none",
  SIMULATED: "simulated",
  POSSIBLE: "possible",
  ACTIVE: "active",
  UNKNOWN: "unknown"
});

// Canonical field order for a new audit row. Kept explicit so serialized rows
// are stable and readable, and so reviewers can eyeball attribution quickly.
const AUDIT_FIELD_ORDER = Object.freeze([
  "timestamp",
  "eventType",
  "stage",
  "producer",
  "producerScript",
  "producerPid",
  "runtimeMode",
  "authorityMode",
  "pipelineMode",
  "capitalExposure",
  "sourceModule",
  "actionRequested",
  "actionAllowed",
  "gateResult",
  "reason",
  "scannerFreshness",
  "lockState",
  "heartbeatState",
  "relatedTradeId",
  "relatedTokenAddress",
  "legacyRow",
  "confidence",
  "payload"
]);

function nowIso() {
  return new Date().toISOString();
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// Build a fully-defaulted, attribution-complete audit event WITHOUT writing it.
// Throws if `producer` is missing/empty — a new row must never be unattributed.
function buildAuditEvent(event = {}) {
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    throw new TypeError("audit_writer: event must be a plain object");
  }

  if (!isNonEmptyString(event.producer)) {
    throw new Error(
      "audit_writer: `producer` is required for a new audit row. " +
      "Unattributed audit rows are forbidden (Vulcan runtime-identity rule)."
    );
  }

  const normalized = {
    timestamp: isNonEmptyString(event.timestamp) ? event.timestamp : nowIso(),
    eventType: isNonEmptyString(event.eventType) ? event.eventType : "EXECUTION_STAGE",
    stage: isNonEmptyString(event.stage) ? event.stage : "UNKNOWN",
    producer: event.producer,
    producerScript: isNonEmptyString(event.producerScript) ? event.producerScript : "unknown",
    producerPid: Number.isInteger(event.producerPid)
      ? event.producerPid
      : (typeof process !== "undefined" && Number.isInteger(process.pid) ? process.pid : null),
    runtimeMode: isNonEmptyString(event.runtimeMode) ? event.runtimeMode : RUNTIME_MODES.UNKNOWN,
    authorityMode: isNonEmptyString(event.authorityMode) ? event.authorityMode : AUTHORITY_MODES.UNKNOWN,
    pipelineMode: isNonEmptyString(event.pipelineMode) ? event.pipelineMode : "unknown",
    capitalExposure: isNonEmptyString(event.capitalExposure) ? event.capitalExposure : CAPITAL_EXPOSURE.UNKNOWN,
    sourceModule: isNonEmptyString(event.sourceModule) ? event.sourceModule : null,
    actionRequested: event.actionRequested !== undefined ? event.actionRequested : null,
    actionAllowed: typeof event.actionAllowed === "boolean" ? event.actionAllowed : null,
    gateResult: event.gateResult !== undefined ? event.gateResult : null,
    reason: isNonEmptyString(event.reason) ? event.reason : null,
    scannerFreshness: isNonEmptyString(event.scannerFreshness) ? event.scannerFreshness : "unknown",
    lockState: isNonEmptyString(event.lockState) ? event.lockState : "unknown",
    heartbeatState: isNonEmptyString(event.heartbeatState) ? event.heartbeatState : "unknown",
    relatedTradeId: event.relatedTradeId !== undefined ? event.relatedTradeId : null,
    relatedTokenAddress: event.relatedTokenAddress !== undefined ? event.relatedTokenAddress : null,
    // A NEW row is never legacy. This flag is only true when a reader backfills
    // it for a pre-schema row (handled elsewhere, not written here).
    legacyRow: event.legacyRow === true ? true : false,
    confidence: isNonEmptyString(event.confidence) ? event.confidence : "medium",
    payload: (event.payload !== null && typeof event.payload === "object" && !Array.isArray(event.payload))
      ? event.payload
      : {}
  };

  // Emit fields in canonical order for stable, reviewable JSONL.
  const ordered = {};
  for (const key of AUDIT_FIELD_ORDER) {
    ordered[key] = normalized[key];
  }
  return ordered;
}

// Build + append a single JSONL row. Returns the written event object.
//
// options.filePath — override the target file (tests MUST use this so real
//   runtime logs are never touched).
// options.append   — default true; when false, throws (reserved; no rewrite of
//   history in Stage 1).
function writeAuditEvent(event, options = {}) {
  const filePath = isNonEmptyString(options.filePath) ? options.filePath : DEFAULT_AUDIT_FILE;

  if (options.append === false) {
    throw new Error("audit_writer: non-append writes are not supported (no history rewrite).");
  }

  const built = buildAuditEvent(event);
  fs.appendFileSync(filePath, JSON.stringify(built) + "\n");
  return built;
}

module.exports = {
  writeAuditEvent,
  buildAuditEvent,
  DEFAULT_AUDIT_FILE,
  AUDIT_FIELD_ORDER,
  PRODUCERS,
  RUNTIME_MODES,
  AUTHORITY_MODES,
  CAPITAL_EXPOSURE
};
