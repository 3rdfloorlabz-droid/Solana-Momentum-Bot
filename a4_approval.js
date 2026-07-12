"use strict";

// ─── A4.25 — Safe A4 verified-dedicated approval audit helpers ────────────────
//
// Converts an explicit human approval (A4.24) into a secret-safe audit-event
// shape. Does NOT parse markdown decision docs, does NOT grant live/soak readiness,
// and does NOT emit A4_VERIFIED_DEDICATED by itself — runtime_health maps that
// only when stability evidence + this attributed event both satisfy preconditions.
//
// Guiding principle: Runtime may recognize approval only after approval is explicit.

const A4_APPROVAL_PRODUCER = "a4_approval";
const A4_APPROVAL_EVENT_TYPE = "A4_VERIFIED_DEDICATED_APPROVAL";
const A4_APPROVAL_INVOCATION_CONTEXT = "a4_verified_dedicated_approval";

const A4_APPROVAL_STATUSES = new Set([
  "approved",
  "approved_with_conditions",
  "revoked",
  "pending_review",
  "not_approved"
]);

const A4_APPROVAL_APPROVED_STATUSES = new Set(["approved", "approved_with_conditions"]);

// Stable slug for the A4.24 decision record (never a filesystem path).
const A4_APPROVAL_DEFAULT_DECISION_REF = "DECISION-2026-07-04-A4-STABILITY-PROOF-ACCEPTED";

const A4_APPROVAL_AUDIT_ALLOWED_KEYS = Object.freeze([
  "approver",
  "approvalStatus",
  "decisionRef",
  "evidenceRef",
  "approvedAtIso",
  "expiresAtIso",
  "scopeNote"
]);

const A4_APPROVAL_FORBIDDEN_KEYS = [
  "endpoint", "url", "uri", "apiKey", "api_key", "apikey", "headers", "header",
  "body", "requestBody", "rawSlot", "slot", "slotValue", "wallet", "walletAddress",
  "signature", "transaction", "tx", "stack", "stackTrace", "env", "processEnv",
  "rpcUrl", "secret", "token", "password", "privateKey"
];

const A4_APPROVAL_SECRET_LIKE = /(:\/\/|api[-_]?key|bearer\s|sk-[a-z0-9])/i;

// decisionRef / evidenceRef: short slugs only — no paths, no URLs.
const A4_APPROVAL_REF_PATTERN = /^[A-Za-z0-9._:-]+$/;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function payloadHasForbiddenApprovalField(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  for (const key of Object.keys(payload)) {
    if (A4_APPROVAL_FORBIDDEN_KEYS.includes(key)) return true;
    const v = payload[key];
    if (typeof v === "string" && A4_APPROVAL_SECRET_LIKE.test(v)) return true;
  }
  return false;
}

function sanitizeApprover(value) {
  if (!isNonEmptyString(value)) return null;
  const trimmed = value.trim();
  if (trimmed.length > 80) return null;
  if (A4_APPROVAL_SECRET_LIKE.test(trimmed)) return null;
  if (!/^[A-Za-z .'-]+$/.test(trimmed)) return null;
  return trimmed;
}

function sanitizeApprovalRef(value) {
  if (!isNonEmptyString(value)) return null;
  const trimmed = value.trim();
  if (trimmed.length > 120) return null;
  if (!A4_APPROVAL_REF_PATTERN.test(trimmed)) return null;
  return trimmed;
}

function sanitizeA4ApprovalForAudit(approvalInput) {
  const src = (approvalInput && typeof approvalInput === "object") ? approvalInput : {};
  const payload = {};
  const approver = sanitizeApprover(src.approver);
  if (approver) payload.approver = approver;

  const status = (typeof src.approvalStatus === "string" && A4_APPROVAL_STATUSES.has(src.approvalStatus))
    ? src.approvalStatus
    : "approved";
  payload.approvalStatus = status;

  const decisionRef = sanitizeApprovalRef(src.decisionRef || A4_APPROVAL_DEFAULT_DECISION_REF);
  if (decisionRef) payload.decisionRef = decisionRef;

  const evidenceRef = sanitizeApprovalRef(src.evidenceRef);
  if (evidenceRef) payload.evidenceRef = evidenceRef;

  if (isNonEmptyString(src.approvedAtIso)) payload.approvedAtIso = src.approvedAtIso;
  if (isNonEmptyString(src.expiresAtIso)) payload.expiresAtIso = src.expiresAtIso;

  if (isNonEmptyString(src.scopeNote)) {
    const note = src.scopeNote.trim();
    if (note.length <= 200 && !A4_APPROVAL_SECRET_LIKE.test(note)) {
      payload.scopeNote = note;
    }
  }

  payload.invocationContext = A4_APPROVAL_INVOCATION_CONTEXT;
  return payload;
}

function buildA4ApprovalAuditEvent(approvalInput, options = {}) {
  const payload = sanitizeA4ApprovalForAudit(approvalInput);
  const event = {
    eventType: A4_APPROVAL_EVENT_TYPE,
    stage: A4_APPROVAL_EVENT_TYPE,
    producer: A4_APPROVAL_PRODUCER,
    invocationContext: A4_APPROVAL_INVOCATION_CONTEXT,
    runtimeMode: "observation_only",
    authorityMode: "human_required",
    capitalExposure: "none",
    actionRequested: "a4_verified_dedicated_approval_record",
    actionAllowed: true,
    gateResult: "APPROVAL_RECORDED",
    reason: "explicit human approval for A4 stability evidence (not live readiness)",
    payload
  };
  if (typeof options.timestamp === "string" && options.timestamp) {
    event.timestamp = options.timestamp;
  }
  return event;
}

module.exports = {
  A4_APPROVAL_PRODUCER,
  A4_APPROVAL_EVENT_TYPE,
  A4_APPROVAL_INVOCATION_CONTEXT,
  A4_APPROVAL_DEFAULT_DECISION_REF,
  A4_APPROVAL_STATUSES,
  A4_APPROVAL_APPROVED_STATUSES,
  A4_APPROVAL_AUDIT_ALLOWED_KEYS,
  sanitizeA4ApprovalForAudit,
  buildA4ApprovalAuditEvent,
  payloadHasForbiddenApprovalField,
  sanitizeApprover,
  sanitizeApprovalRef
};
