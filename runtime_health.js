"use strict";

// ─── Vulcan Stage 4 — Read-Only Runtime Health Classifier ─────────────────────
//
// Purpose: classify runtime health from EVIDENCE passed in by a caller — never
// by reading live files, starting processes, or inspecting secrets. This module
// is PURE: same input → same output, no side effects.
//
// Guiding principle: runtime health must be classified from evidence, not
// inferred from activity alone. Audit activity by itself never supports a soak
// claim, and no classification ever asserts live readiness.
//
// STAGE 4 SCOPE:
//   - Pure classification logic + helpers only. No file I/O by default.
//   - Does not wire into dashboard_server.js (that is a later, separate stage).
//   - Does not change runtime, trading, gate, or authority behavior.
//
// Ref: Ori/Phase 2/Project Vulcan/Implementation Design/
//      VULCAN DESIGN — Runtime Identity & Audit Producer Clarity.md (§8 matrix)

// ─── Enumerations ─────────────────────────────────────────────────────────────

const CLASSIFICATIONS = Object.freeze({
  HEALTHY_OBSERVATION: "HEALTHY_OBSERVATION",
  HEALTHY_DRY_RUN: "HEALTHY_DRY_RUN",
  RUNNING_WITH_WARNINGS: "RUNNING_WITH_WARNINGS",
  MONITOR_DRIVEN_AUDIT_WITH_WARNINGS: "MONITOR_DRIVEN_AUDIT_WITH_WARNINGS",
  STALE_SCANNER: "STALE_SCANNER",
  LOCK_MISSING_WARNING: "LOCK_MISSING_WARNING",
  HEARTBEAT_MISSING_WARNING: "HEARTBEAT_MISSING_WARNING",
  EXECUTOR_LOOP_UNCONFIRMED: "EXECUTOR_LOOP_UNCONFIRMED",
  CAPITAL_SAFE_BUT_RUNTIME_AMBIGUOUS: "CAPITAL_SAFE_BUT_RUNTIME_AMBIGUOUS",
  STOPPED_CONFIRMED: "STOPPED_CONFIRMED",
  UNKNOWN_NEEDS_REVIEW: "UNKNOWN_NEEDS_REVIEW",
  CRITICAL_CAPITAL_RISK: "CRITICAL_CAPITAL_RISK"
});

const SEVERITY = Object.freeze({ INFO: "info", WARNING: "warning", CRITICAL: "critical" });

const SCANNER_FRESHNESS = Object.freeze({
  FRESH: "fresh",
  AGING: "aging",
  STALE: "stale",
  UNKNOWN: "unknown"
});

const LOCK_STATES = Object.freeze({
  PRESENT_CURRENT: "lock_present_current",
  PRESENT_STALE: "lock_present_stale",
  ABSENT_EXPECTED: "lock_absent_expected",
  ABSENT_UNEXPECTED: "lock_absent_unexpected",
  UNKNOWN: "lock_unknown"
});

const HEARTBEAT_STATES = Object.freeze({
  CURRENT: "heartbeat_current",
  STALE: "heartbeat_stale",
  MISSING: "heartbeat_missing",
  UNKNOWN: "heartbeat_unknown"
});

const WARNINGS = Object.freeze({
  STALE_SCANNER: "STALE_SCANNER",
  LOCK_MISSING: "LOCK_MISSING_WARNING",
  HEARTBEAT_MISSING: "HEARTBEAT_MISSING_WARNING",
  EXECUTOR_LOOP_UNCONFIRMED: "EXECUTOR_LOOP_UNCONFIRMED"
});

// ─── Thresholds (ratified — Stage 0) ──────────────────────────────────────────
// Scanner: Fresh <5m · Aging 5–30m · Stale >30m · Unknown (missing/unreadable).
const SCANNER_FRESH_MS = 5 * 60 * 1000;
const SCANNER_STALE_MS = 30 * 60 * 1000;
// Default staleness window for lock/heartbeat when a caller does not specify one.
const DEFAULT_STALE_MS = 3 * 60 * 1000;

// ─── Small helpers ────────────────────────────────────────────────────────────

function resolveNowMs(now) {
  if (typeof now === "number" && Number.isFinite(now)) return now;
  if (now instanceof Date) return now.getTime();
  if (typeof now === "string") {
    const t = Date.parse(now);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

function parseTimeMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const t = Date.parse(value);
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

// ─── Scanner freshness ────────────────────────────────────────────────────────

function classifyScannerFreshness(scannerHealth, now) {
  const nowMs = resolveNowMs(now);
  if (!scannerHealth || typeof scannerHealth !== "object") {
    return { state: SCANNER_FRESHNESS.UNKNOWN, ageMs: null };
  }
  const lastMs = parseTimeMs(scannerHealth.lastScanAtMs ?? scannerHealth.lastScanAt);
  if (lastMs === null) return { state: SCANNER_FRESHNESS.UNKNOWN, ageMs: null };

  const ageMs = nowMs - lastMs;
  if (ageMs < 0) return { state: SCANNER_FRESHNESS.UNKNOWN, ageMs };
  if (ageMs < SCANNER_FRESH_MS) return { state: SCANNER_FRESHNESS.FRESH, ageMs };
  if (ageMs <= SCANNER_STALE_MS) return { state: SCANNER_FRESHNESS.AGING, ageMs };
  return { state: SCANNER_FRESHNESS.STALE, ageMs };
}

// ─── Lock interpretation ──────────────────────────────────────────────────────

// lockEvidence: { present, updatedAt|updatedAtMs, expected, staleThresholdMs }
function classifyLockState(lockEvidence, now) {
  const nowMs = resolveNowMs(now);
  if (!lockEvidence || typeof lockEvidence !== "object") {
    return { state: LOCK_STATES.UNKNOWN, ageMs: null };
  }
  const staleMs = Number.isFinite(lockEvidence.staleThresholdMs) ? lockEvidence.staleThresholdMs : DEFAULT_STALE_MS;

  if (lockEvidence.present === true) {
    const updatedMs = parseTimeMs(lockEvidence.updatedAtMs ?? lockEvidence.updatedAt);
    if (updatedMs === null) return { state: LOCK_STATES.PRESENT_CURRENT, ageMs: null };
    const ageMs = nowMs - updatedMs;
    return ageMs > staleMs
      ? { state: LOCK_STATES.PRESENT_STALE, ageMs }
      : { state: LOCK_STATES.PRESENT_CURRENT, ageMs };
  }

  if (lockEvidence.present === false) {
    if (lockEvidence.expected === true) return { state: LOCK_STATES.ABSENT_UNEXPECTED, ageMs: null };
    if (lockEvidence.expected === false) return { state: LOCK_STATES.ABSENT_EXPECTED, ageMs: null };
    return { state: LOCK_STATES.UNKNOWN, ageMs: null };
  }

  return { state: LOCK_STATES.UNKNOWN, ageMs: null };
}

// ─── Heartbeat interpretation ─────────────────────────────────────────────────

// heartbeatEvidence: { present, lastBeatAt|lastBeatAtMs, staleThresholdMs }
function classifyHeartbeatState(heartbeatEvidence, now) {
  const nowMs = resolveNowMs(now);
  if (!heartbeatEvidence || typeof heartbeatEvidence !== "object") {
    return { state: HEARTBEAT_STATES.UNKNOWN, ageMs: null };
  }
  if (heartbeatEvidence.present === false) return { state: HEARTBEAT_STATES.MISSING, ageMs: null };

  const beatMs = parseTimeMs(heartbeatEvidence.lastBeatAtMs ?? heartbeatEvidence.lastBeatAt);
  if (beatMs === null) {
    // present flag with no timestamp is not enough to assert current.
    return heartbeatEvidence.present === true
      ? { state: HEARTBEAT_STATES.UNKNOWN, ageMs: null }
      : { state: HEARTBEAT_STATES.UNKNOWN, ageMs: null };
  }
  const staleMs = Number.isFinite(heartbeatEvidence.staleThresholdMs) ? heartbeatEvidence.staleThresholdMs : DEFAULT_STALE_MS;
  const ageMs = nowMs - beatMs;
  return ageMs > staleMs
    ? { state: HEARTBEAT_STATES.STALE, ageMs }
    : { state: HEARTBEAT_STATES.CURRENT, ageMs };
}

// ─── Audit event normalization (read-only; never rewrites rows) ───────────────

function normalizeAuditEvent(row) {
  const r = (row && typeof row === "object") ? row : {};
  const hasAttribution = isNonEmptyString(r.producer);
  return {
    timestamp: isNonEmptyString(r.timestamp) ? r.timestamp : null,
    eventType: isNonEmptyString(r.eventType) ? r.eventType : "unknown",
    stage: isNonEmptyString(r.stage) ? r.stage : "unknown",
    payload: (r.payload && typeof r.payload === "object") ? r.payload : {},
    producer: isNonEmptyString(r.producer) ? r.producer : "unknown_legacy",
    invocationContext: isNonEmptyString(r.invocationContext) ? r.invocationContext : "unknown",
    invocationSource: isNonEmptyString(r.invocationSource) ? r.invocationSource : "unknown",
    bridgeMode: isNonEmptyString(r.bridgeMode) ? r.bridgeMode : "unknown",
    runtimeMode: isNonEmptyString(r.runtimeMode) ? r.runtimeMode : "unknown",
    authorityMode: isNonEmptyString(r.authorityMode) ? r.authorityMode : "unknown",
    capitalExposure: isNonEmptyString(r.capitalExposure) ? r.capitalExposure : "unknown",
    // A row lacking a producer field is treated as a pre-attribution legacy row.
    legacyRow: r.legacyRow === true ? true : (hasAttribution ? false : true)
  };
}

// ─── Capital exposure normalization ───────────────────────────────────────────

function normalizeExposure(capitalExposure, openPositions) {
  if (isNonEmptyString(capitalExposure)) return capitalExposure;
  if (Array.isArray(openPositions)) return openPositions.length > 0 ? "possible" : "none";
  return "unknown";
}

// ─── Dashboard wording + operator action per classification ───────────────────

const CLASSIFICATION_META = Object.freeze({
  HEALTHY_OBSERVATION: {
    severity: SEVERITY.INFO,
    dashboardWording: "Observation healthy — paper monitor active.",
    recommendedOperatorAction: "None — routine observation."
  },
  HEALTHY_DRY_RUN: {
    severity: SEVERITY.INFO,
    dashboardWording: "Dry-run soak active — not live.",
    recommendedOperatorAction: "Routine watch; confirm dry-run posture."
  },
  RUNNING_WITH_WARNINGS: {
    severity: SEVERITY.WARNING,
    dashboardWording: "Soak running with warnings — see details.",
    recommendedOperatorAction: "Investigate the listed warnings."
  },
  MONITOR_DRIVEN_AUDIT_WITH_WARNINGS: {
    severity: SEVERITY.WARNING,
    dashboardWording: "Monitor-driven audit activity detected; executor loop unconfirmed.",
    recommendedOperatorAction: "Confirm producer identity; do not treat as soak."
  },
  STALE_SCANNER: {
    severity: SEVERITY.WARNING,
    dashboardWording: "Scanner stale — signals may be outdated.",
    recommendedOperatorAction: "Inspect scanner; do not trust signals as current."
  },
  LOCK_MISSING_WARNING: {
    severity: SEVERITY.WARNING,
    dashboardWording: "Executor lock missing — loop unconfirmed.",
    recommendedOperatorAction: "Verify whether an executor loop is expected."
  },
  HEARTBEAT_MISSING_WARNING: {
    severity: SEVERITY.WARNING,
    dashboardWording: "Heartbeat missing — proof of life absent.",
    recommendedOperatorAction: "Verify the executor loop process."
  },
  EXECUTOR_LOOP_UNCONFIRMED: {
    severity: SEVERITY.WARNING,
    dashboardWording: "Executor loop unconfirmed.",
    recommendedOperatorAction: "Confirm loop via producer identity + lock + heartbeat."
  },
  CAPITAL_SAFE_BUT_RUNTIME_AMBIGUOUS: {
    severity: SEVERITY.WARNING,
    dashboardWording: "Capital exposure: none; operational status: needs review.",
    recommendedOperatorAction: "Document ambiguity; escalate to Vulcan if it persists."
  },
  STOPPED_CONFIRMED: {
    severity: SEVERITY.WARNING,
    dashboardWording: "Executor stopped (confirmed).",
    recommendedOperatorAction: "Decide whether a human-confirmed restart is warranted."
  },
  UNKNOWN_NEEDS_REVIEW: {
    severity: SEVERITY.WARNING,
    dashboardWording: "Operational status: unknown — needs review.",
    recommendedOperatorAction: "Gather more evidence before any claim."
  },
  CRITICAL_CAPITAL_RISK: {
    severity: SEVERITY.CRITICAL,
    dashboardWording: "CRITICAL — capital risk; human action required.",
    recommendedOperatorAction: "Human review now; consider emergency stop per runbook."
  }
});

// ─── A4.3 — Runtime health classification for dedicated-RPC posture ────────────
//
// PURE helper. Consumes only the safe, secret-free `a4Evidence` object produced
// by runtime_evidence.js (A4.2). It:
//   - reads no env vars, no files, no secrets; makes no network calls; mutates
//     nothing; writes no logs,
//   - is warning/blocker-only for live/soak — it NEVER sets supportsLiveReadiness or
//     supportsSoakClaim true,
//   - may map A4_STABILITY_PROOF_OBSERVED → A4_VERIFIED_DEDICATED only when an
//     explicit attributed approval event satisfies all A4.25 preconditions (still
//     not live readiness),
//   - passes provider/class/reason through fixed allowlists so no raw
//     URL/key/token can ever escape into the health output.
//
// Guiding principle: Runtime health should expose blockers without weakening them.

const A4_HEALTH_STATUS = Object.freeze({
  UNKNOWN: "A4_UNKNOWN",
  NOT_CONFIGURED: "A4_NOT_CONFIGURED",
  REFUSAL_ACTIVE: "A4_REFUSAL_ACTIVE",
  CONFIGURED_UNVERIFIED: "A4_CONFIGURED_UNVERIFIED",
  FALLBACK_DETECTED: "A4_FALLBACK_DETECTED",
  // A4.13 — read-only proof statuses. These remain warning/blocked blockers and
  // never grant live/soak readiness. They are strictly below VERIFIED_DEDICATED.
  READ_ONLY_RPC_VERIFIED: "A4_READ_ONLY_RPC_VERIFIED",
  PROOF_FAILED: "A4_PROOF_FAILED",
  PROOF_STALE: "A4_PROOF_STALE",
  // A4.18 — repeated safe, time-separated proof evidence observed. Still a
  // blocker; requires explicit human approval before VERIFIED_DEDICATED.
  STABILITY_PROOF_OBSERVED: "A4_STABILITY_PROOF_OBSERVED",
  VERIFIED_DEDICATED: "A4_VERIFIED_DEDICATED"
});

const A4_HEALTH_SEVERITY = Object.freeze({ INFO: "info", WARNING: "warning", BLOCKED: "blocked" });

const A4_WARNINGS = Object.freeze({
  UNKNOWN: "A4_UNKNOWN",
  NOT_CONFIGURED: "A4_NOT_CONFIGURED",
  REFUSAL_ACTIVE: "A4_REFUSAL_ACTIVE",
  CONFIGURED_UNVERIFIED: "A4_CONFIGURED_UNVERIFIED",
  FALLBACK_DETECTED: "A4_FALLBACK_DETECTED",
  READ_ONLY_RPC_VERIFIED: "A4_READ_ONLY_RPC_VERIFIED",
  PROOF_FAILED: "A4_PROOF_FAILED",
  PROOF_STALE: "A4_PROOF_STALE",
  STABILITY_PROOF_OBSERVED: "A4_STABILITY_PROOF_OBSERVED"
});

// Allowlists — anything outside these collapses to a safe sentinel so a raw
// URL/key/token that somehow reached a4Evidence can never leak into a4Health.
const A4_SAFE_PROVIDER_LABELS = new Set([
  "helius_rpc_url_configured",
  "solana_rpc_url_configured",
  "helius_api_key_derived_configured",
  "public_fallback_detected",
  "legacy_rpc_url_ignored",
  "not_configured",
  "unknown"
]);
const A4_SAFE_ENDPOINT_CLASSES = new Set(["dedicated", "public", "not_configured", "unknown"]);
const A4_SAFE_REFUSAL_REASONS = new Set(["dedicated_rpc_required_not_satisfied"]);
const A4_CONFIDENCE_VALUES = new Set(["low", "medium", "high"]);

// A4.13 — safe allowlists for surfacing (never trusting) proof metadata.
const A4_SAFE_PROOF_STATUSES = new Set(["READ_ONLY_RPC_OK", "READ_ONLY_RPC_FAILED", "UNVERIFIED"]);
const A4_SAFE_PROOF_METHODS = new Set(["getSlot", "unknown"]);
const A4_SAFE_PROOF_LATENCY_BUCKETS = new Set(["<250ms", "250-1000ms", ">1000ms", "unknown"]);
const A4_SAFE_PROOF_FRESHNESS = new Set(["fresh", "stale", "unknown"]);
const A4_SAFE_SEPARATION_BUCKETS = new Set(["<15m", ">=15m", "unknown"]);
// A4.21 — enumerated proof-scan error codes safe for display (no raw errors).
const A4_SAFE_PROOF_SCAN_ERROR_CODES = new Set([
  "A4_PROOF_SCAN_UNAVAILABLE",
  "A4_PROOF_SCAN_READ_ERROR",
  "A4_PROOF_SCAN_PARSE_ERROR",
  "A4_PROOF_SCAN_UNKNOWN_ERROR"
]);
const A4_SAFE_APPROVAL_SCAN_ERROR_CODES = new Set([
  "A4_APPROVAL_SCAN_UNAVAILABLE",
  "A4_APPROVAL_SCAN_READ_ERROR",
  "A4_APPROVAL_SCAN_PARSE_ERROR",
  "A4_APPROVAL_SCAN_UNKNOWN_ERROR"
]);
const A4_SAFE_APPROVAL_STATUSES = new Set([
  "approved", "approved_with_conditions", "revoked", "pending_review", "not_approved"
]);
const A4_SAFE_APPROVAL_FRESHNESS = new Set(["fresh", "stale", "expired", "unknown"]);
const A4_APPROVAL_BLOCKER_STATUS_HINTS = new Set([
  A4_HEALTH_STATUS.UNKNOWN,
  A4_HEALTH_STATUS.NOT_CONFIGURED,
  A4_HEALTH_STATUS.REFUSAL_ACTIVE,
  A4_HEALTH_STATUS.FALLBACK_DETECTED,
  A4_HEALTH_STATUS.PROOF_FAILED,
  A4_HEALTH_STATUS.PROOF_STALE
]);
const A4_SAFE_PROOF_PROVIDER_LABELS = new Set([
  "helius_rpc_url_configured", "solana_rpc_url_configured",
  "helius_api_key_configured", "helius_api_key_derived_configured",
  "not_configured", "unknown"
]);

// statusHint → health mapping (blockerActive, severity, warning id, action).
const A4_STATUS_MAP = Object.freeze({
  A4_UNKNOWN: {
    status: A4_HEALTH_STATUS.UNKNOWN,
    severity: A4_HEALTH_SEVERITY.WARNING,
    blockerActive: true,
    warning: A4_WARNINGS.UNKNOWN,
    recommendedAction: "Collect safe A4 evidence or review A4 configuration."
  },
  A4_NOT_CONFIGURED: {
    status: A4_HEALTH_STATUS.NOT_CONFIGURED,
    severity: A4_HEALTH_SEVERITY.BLOCKED,
    blockerActive: true,
    warning: A4_WARNINGS.NOT_CONFIGURED,
    recommendedAction: "Configure an approved dedicated RPC using the A4.1 config contract."
  },
  A4_REFUSAL_ACTIVE: {
    status: A4_HEALTH_STATUS.REFUSAL_ACTIVE,
    severity: A4_HEALTH_SEVERITY.BLOCKED,
    blockerActive: true,
    warning: A4_WARNINGS.REFUSAL_ACTIVE,
    recommendedAction: "Satisfy the dedicated-RPC proof requirement; preserve fail-closed refusal behavior."
  },
  A4_CONFIGURED_UNVERIFIED: {
    status: A4_HEALTH_STATUS.CONFIGURED_UNVERIFIED,
    severity: A4_HEALTH_SEVERITY.WARNING,
    blockerActive: true,
    warning: A4_WARNINGS.CONFIGURED_UNVERIFIED,
    recommendedAction: "Verify the runtime dedicated endpoint class without exposing secrets."
  },
  A4_FALLBACK_DETECTED: {
    status: A4_HEALTH_STATUS.FALLBACK_DETECTED,
    severity: A4_HEALTH_SEVERITY.BLOCKED,
    blockerActive: true,
    warning: A4_WARNINGS.FALLBACK_DETECTED,
    recommendedAction: "Stop relying on public fallback; verify the dedicated RPC path."
  },
  A4_READ_ONLY_RPC_VERIFIED: {
    // A4.13 — one fresh, secret-safe, non-fallback read-only proof observed.
    // Still a blocker: stability proof + human approval precede VERIFIED_DEDICATED.
    status: A4_HEALTH_STATUS.READ_ONLY_RPC_VERIFIED,
    severity: A4_HEALTH_SEVERITY.WARNING,
    blockerActive: true,
    warning: A4_WARNINGS.READ_ONLY_RPC_VERIFIED,
    recommendedAction: "One read-only RPC proof observed; stability proof and human approval still required before A4_VERIFIED_DEDICATED."
  },
  A4_PROOF_FAILED: {
    status: A4_HEALTH_STATUS.PROOF_FAILED,
    severity: A4_HEALTH_SEVERITY.BLOCKED,
    blockerActive: true,
    warning: A4_WARNINGS.PROOF_FAILED,
    recommendedAction: "Read-only RPC proof failed; investigate the dedicated provider path without exposing secrets."
  },
  A4_PROOF_STALE: {
    // Conservative: a stale proof is a warning-level blocker (visibility of
    // "was verified, now unverified" without claiming current verification).
    status: A4_HEALTH_STATUS.PROOF_STALE,
    severity: A4_HEALTH_SEVERITY.WARNING,
    blockerActive: true,
    warning: A4_WARNINGS.PROOF_STALE,
    recommendedAction: "Read-only RPC proof is stale; re-run an authorized read-only proof to refresh evidence."
  },
  A4_STABILITY_PROOF_OBSERVED: {
    // A4.18 — repeated safe, time-separated proofs observed. Still a blocker:
    // explicit human approval is required before A4_VERIFIED_DEDICATED. Never
    // auto-promotes and never grants live/soak readiness.
    status: A4_HEALTH_STATUS.STABILITY_PROOF_OBSERVED,
    severity: A4_HEALTH_SEVERITY.WARNING,
    blockerActive: true,
    warning: A4_WARNINGS.STABILITY_PROOF_OBSERVED,
    recommendedAction: "Record explicit human approval decision before any A4_VERIFIED_DEDICATED consideration."
  },
  A4_VERIFIED_DEDICATED: {
    // A4.25 — emitted only when stability + explicit attributed approval satisfy
    // all preconditions. Never grants live/soak readiness or capital permission.
    status: A4_HEALTH_STATUS.VERIFIED_DEDICATED,
    severity: A4_HEALTH_SEVERITY.INFO,
    blockerActive: false,
    warning: null,
    recommendedAction: "A4 dedicated RPC verified by explicit human approval; not live readiness. A1/execution/capital gates remain."
  }
});

function safeA4Value(value, allow, fallback) {
  return (typeof value === "string" && allow.has(value)) ? value : fallback;
}

function safeBoolOrNull(value) {
  return value === true ? true : (value === false ? false : null);
}

// Re-shape any proof metadata on a4Evidence into a strictly allowlisted,
// secret-safe summary. Returns null when no proof evidence is present.
function safeA4ProofSummary(proof) {
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) return null;
  return {
    proofStatus: safeA4Value(proof.proofStatus, A4_SAFE_PROOF_STATUSES, "UNVERIFIED"),
    providerLabel: safeA4Value(proof.providerLabel, A4_SAFE_PROOF_PROVIDER_LABELS, "unknown"),
    endpointClass: safeA4Value(proof.endpointClass, A4_SAFE_ENDPOINT_CLASSES, "unknown"),
    method: safeA4Value(proof.method, A4_SAFE_PROOF_METHODS, "unknown"),
    latencyMsBucket: safeA4Value(proof.latencyMsBucket, A4_SAFE_PROOF_LATENCY_BUCKETS, "unknown"),
    freshness: safeA4Value(proof.freshness, A4_SAFE_PROOF_FRESHNESS, "unknown"),
    publicFallbackUsed: proof.publicFallbackUsed === true,
    secretSafe: proof.secretSafe === true,
    slotObserved: proof.slotObserved === true,
    slotValuePresent: proof.slotValuePresent === true,
    proofObservedAt: isNonEmptyString(proof.proofObservedAt) ? proof.proofObservedAt : null
  };
}

// A4.18 — re-shape stability metadata into a strictly allowlisted, secret-safe
// summary. Returns null when no stability evidence is present.
function safeA4ProofStabilitySummary(stability) {
  if (!stability || typeof stability !== "object" || Array.isArray(stability)) return null;
  const th = (stability.threshold && typeof stability.threshold === "object") ? stability.threshold : {};
  return {
    successCount: Number.isFinite(stability.successCount) ? stability.successCount : 0,
    freshSuccessCount: Number.isFinite(stability.freshSuccessCount) ? stability.freshSuccessCount : 0,
    separationBucket: safeA4Value(stability.separationBucket, A4_SAFE_SEPARATION_BUCKETS, "unknown"),
    providerConsistent: stability.providerConsistent === true,
    endpointClassConsistent: stability.endpointClassConsistent === true,
    providerLabel: safeA4Value(stability.providerLabel, A4_SAFE_PROOF_PROVIDER_LABELS, "unknown"),
    endpointClass: safeA4Value(stability.endpointClass, A4_SAFE_ENDPOINT_CLASSES, "unknown"),
    fallbackObserved: stability.fallbackObserved === true,
    failureObserved: stability.failureObserved === true,
    unremediatedFailureObserved: stability.unremediatedFailureObserved === true,
    reviewedFailureCount: Number.isFinite(stability.reviewedFailureCount) ? stability.reviewedFailureCount : 0,
    secretSafe: stability.secretSafe === true,
    withinFreshnessWindow: stability.withinFreshnessWindow === true,
    stabilityCandidate: stability.stabilityCandidate === true,
    firstProofAt: isNonEmptyString(stability.firstProofAt) ? stability.firstProofAt : null,
    latestProofAt: isNonEmptyString(stability.latestProofAt) ? stability.latestProofAt : null,
    threshold: {
      minSuccesses: Number.isFinite(th.minSuccesses) ? th.minSuccesses : null,
      minSeparationMs: Number.isFinite(th.minSeparationMs) ? th.minSeparationMs : null,
      freshnessMs: Number.isFinite(th.freshnessMs) ? th.freshnessMs : null
    }
  };
}

// A4.21 — re-shape targeted proof-scan availability metadata into a strictly
// allowlisted, secret-safe summary. Returns null when no scan metadata present.
function safeA4ProofScanSummary(scan) {
  if (!scan || typeof scan !== "object" || Array.isArray(scan)) return null;
  return {
    available: scan.available === true,
    limit: Number.isFinite(scan.limit) ? scan.limit : null,
    errorCode: (typeof scan.errorCode === "string" && A4_SAFE_PROOF_SCAN_ERROR_CODES.has(scan.errorCode))
      ? scan.errorCode
      : null
  };
}

// A4.25 — re-shape approval metadata into a strictly allowlisted, secret-safe
// summary. Returns null when no approval evidence is present.
function safeA4ApprovalSummary(approval) {
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) return null;
  const approver = (typeof approval.approver === "string" && /^[A-Za-z .'-]+$/.test(approval.approver.trim()))
    ? approval.approver.trim()
    : null;
  const refPattern = /^[A-Za-z0-9._:-]+$/;
  const decisionRef = (typeof approval.decisionRef === "string" && refPattern.test(approval.decisionRef.trim()))
    ? approval.decisionRef.trim()
    : null;
  const evidenceRef = (typeof approval.evidenceRef === "string" && refPattern.test(approval.evidenceRef.trim()))
    ? approval.evidenceRef.trim()
    : null;
  return {
    present: approval.present === true,
    approved: approval.approved === true,
    status: safeA4Value(approval.status, A4_SAFE_APPROVAL_STATUSES, null),
    approver,
    decisionRef,
    evidenceRef,
    evidenceRefConsistent: approval.evidenceRefConsistent === true,
    approvedAtIso: isNonEmptyString(approval.approvedAtIso) ? approval.approvedAtIso : null,
    expiresAtIso: isNonEmptyString(approval.expiresAtIso) ? approval.expiresAtIso : null,
    freshness: safeA4Value(approval.freshness, A4_SAFE_APPROVAL_FRESHNESS, "unknown"),
    secretRisk: approval.secretRisk === true
  };
}

// A4.25 — re-shape targeted approval-scan availability metadata.
function safeA4ApprovalScanSummary(scan) {
  if (!scan || typeof scan !== "object" || Array.isArray(scan)) return null;
  return {
    available: scan.available === true,
    limit: Number.isFinite(scan.limit) ? scan.limit : null,
    errorCode: (typeof scan.errorCode === "string" && A4_SAFE_APPROVAL_SCAN_ERROR_CODES.has(scan.errorCode))
      ? scan.errorCode
      : null
  };
}

function classifyA4Health(a4Evidence) {
  const ev = (a4Evidence && typeof a4Evidence === "object") ? a4Evidence : null;
  const statusHint = ev && isNonEmptyString(ev.statusHint) ? ev.statusHint : A4_HEALTH_STATUS.UNKNOWN;

  const stability = ev ? safeA4ProofStabilitySummary(ev.proofStability) : null;
  const proofScan = ev ? safeA4ProofScanSummary(ev.proofScan) : null;
  const approval = ev ? safeA4ApprovalSummary(ev.approval) : null;
  const approvalScan = ev ? safeA4ApprovalScanSummary(ev.approvalScan) : null;

  // A4.18 — stability elevation. ONLY when the base posture is
  // A4_READ_ONLY_RPC_VERIFIED and a fresh, consistent, non-fallback, non-failure,
  // secret-safe stability threshold is met. Never overrides NOT_CONFIGURED /
  // REFUSAL_ACTIVE / FALLBACK_DETECTED / PROOF_FAILED / PROOF_STALE.
  let effectiveStatus = statusHint;
  if (statusHint === A4_HEALTH_STATUS.READ_ONLY_RPC_VERIFIED &&
      stability && stability.stabilityCandidate === true) {
    effectiveStatus = A4_HEALTH_STATUS.STABILITY_PROOF_OBSERVED;
  }

  // A4.25 — verified-dedicated elevation. ONLY when stability posture holds,
  // proof scan is available, and an explicit attributed approval event satisfies
  // all preconditions. Blockers always win; never grants live/soak readiness.
  if (effectiveStatus === A4_HEALTH_STATUS.STABILITY_PROOF_OBSERVED &&
      !A4_APPROVAL_BLOCKER_STATUS_HINTS.has(statusHint) &&
      stability && stability.stabilityCandidate === true &&
      proofScan && proofScan.available === true &&
      approval && approval.present === true &&
      approval.approved === true &&
      approval.evidenceRefConsistent === true &&
      approval.freshness !== "expired" &&
      approval.secretRisk !== true) {
    effectiveStatus = A4_HEALTH_STATUS.VERIFIED_DEDICATED;
  }

  // Unrecognized statusHint → conservative UNKNOWN (never trusted, never verified).
  const map = A4_STATUS_MAP[effectiveStatus] || A4_STATUS_MAP.A4_UNKNOWN;

  return {
    status: map.status,
    severity: map.severity,
    blockerActive: map.blockerActive === true,
    rpcRequired: ev ? safeBoolOrNull(ev.rpcRequired) : null,
    rpcConfigured: ev ? safeBoolOrNull(ev.rpcConfigured) : null,
    publicFallbackDetected: ev ? ev.publicFallbackDetected === true : false,
    refusalActive: ev ? ev.refusalActive === true : false,
    refusalReason: ev ? safeA4Value(ev.refusalReason, A4_SAFE_REFUSAL_REASONS, null) : null,
    providerLabel: ev ? safeA4Value(ev.rpcProviderLabel, A4_SAFE_PROVIDER_LABELS, "unknown") : "unknown",
    endpointClass: ev ? safeA4Value(ev.rpcEndpointClass, A4_SAFE_ENDPOINT_CLASSES, "unknown") : "unknown",
    confidence: ev ? safeA4Value(ev.confidence, A4_CONFIDENCE_VALUES, "low") : "low",
    // A4.13 — secret-safe proof summary (null when no proof evidence present).
    proof: ev ? safeA4ProofSummary(ev.proof) : null,
    // A4.18 — secret-safe stability summary (null when no stability evidence).
    proofStability: stability,
    // A4.21 — secret-safe proof-scan availability (null when no scan metadata).
    proofScan,
    // A4.25 — secret-safe approval summary (null when no approval evidence).
    approval,
    approvalScan,
    warnings: map.warning ? [map.warning] : [],
    recommendedAction: map.recommendedAction,
    // Invariants: A4 health can never assert live readiness or soak.
    supportsLiveReadiness: false,
    supportsSoakClaim: false
  };
}

// ─── Main classifier ──────────────────────────────────────────────────────────

function classifyRuntimeHealth(evidence = {}) {
  const now = resolveNowMs(evidence.now);
  const warnings = [];
  const evidenceUsed = [];
  const missingEvidence = [];

  // Scanner
  let scanner = { state: SCANNER_FRESHNESS.UNKNOWN, ageMs: null };
  if (evidence.scannerHealth !== undefined) {
    scanner = classifyScannerFreshness(evidence.scannerHealth, now);
    evidenceUsed.push("scannerHealth");
  } else {
    missingEvidence.push("scannerHealth");
  }

  // Lock
  let lock = { state: LOCK_STATES.UNKNOWN, ageMs: null };
  if (evidence.lockEvidence !== undefined) {
    lock = classifyLockState(evidence.lockEvidence, now);
    evidenceUsed.push("lockEvidence");
  } else {
    missingEvidence.push("lockEvidence");
  }

  // Heartbeat
  let heartbeat = { state: HEARTBEAT_STATES.UNKNOWN, ageMs: null };
  if (evidence.heartbeatEvidence !== undefined) {
    heartbeat = classifyHeartbeatState(evidence.heartbeatEvidence, now);
    evidenceUsed.push("heartbeatEvidence");
  } else {
    missingEvidence.push("heartbeatEvidence");
  }

  // Audit events
  const auditEvents = Array.isArray(evidence.auditEvents)
    ? evidence.auditEvents.map(normalizeAuditEvent)
    : [];
  if (evidence.auditEvents !== undefined) evidenceUsed.push("auditEvents");
  else missingEvidence.push("auditEvents");

  const invocationContexts = new Set(auditEvents.map(e => e.invocationContext));
  const invocationSources = new Set(auditEvents.map(e => e.invocationSource));
  const producers = new Set(auditEvents.map(e => e.producer));

  const hasAudit = auditEvents.length > 0;
  const monitorDriven =
    invocationContexts.has("monitor_mirror") ||
    invocationSources.has("monitor") ||
    producers.has("monitor");

  // Exposure / posture
  const exposure = normalizeExposure(evidence.capitalExposure, evidence.openPositions);
  if (evidence.capitalExposure !== undefined || evidence.openPositions !== undefined) evidenceUsed.push("capitalExposure");
  else missingEvidence.push("capitalExposure");

  const liveArmed = evidence.liveArmed === true ? true : (evidence.liveArmed === false ? false : null);
  const pipelineMode = isNonEmptyString(evidence.pipelineMode) ? evidence.pipelineMode : "unknown";

  // Executor loop is only "confirmed" with positive lock + heartbeat evidence.
  const executorLoopConfirmed =
    lock.state === LOCK_STATES.PRESENT_CURRENT && heartbeat.state === HEARTBEAT_STATES.CURRENT;

  // Accumulate warnings from evidence signals.
  if (scanner.state === SCANNER_FRESHNESS.STALE) warnings.push(WARNINGS.STALE_SCANNER);
  if (lock.state === LOCK_STATES.ABSENT_UNEXPECTED) warnings.push(WARNINGS.LOCK_MISSING);
  if (heartbeat.state === HEARTBEAT_STATES.MISSING) warnings.push(WARNINGS.HEARTBEAT_MISSING);
  if (!executorLoopConfirmed) warnings.push(WARNINGS.EXECUTOR_LOOP_UNCONFIRMED);

  // Authority adequacy for possible/active exposure: unarmed OR human-gated.
  const authorityModes = new Set(auditEvents.map(e => e.authorityMode));
  const authorityAdequate =
    liveArmed === false ||
    authorityModes.has("human_required") ||
    authorityModes.has("gated_execution");

  // ── Decision tree (conservative; prefer warning/uncertain over confidence) ──

  let classification;

  // 1. Capital risk dominates everything.
  if (exposure === "active") {
    classification = CLASSIFICATIONS.CRITICAL_CAPITAL_RISK;
  } else if (exposure === "possible" && !authorityAdequate) {
    classification = CLASSIFICATIONS.CRITICAL_CAPITAL_RISK;
  }
  // 2. Explicit stopped signal.
  else if (evidence.stoppedConfirmed === true) {
    classification = CLASSIFICATIONS.STOPPED_CONFIRMED;
  }
  // 3. Monitor-driven audit without executor-loop confirmation.
  else if (hasAudit && monitorDriven && !executorLoopConfirmed) {
    classification = CLASSIFICATIONS.MONITOR_DRIVEN_AUDIT_WITH_WARNINGS;
  }
  // 4. Confirmed executor loop.
  else if (executorLoopConfirmed) {
    if (scanner.state === SCANNER_FRESHNESS.FRESH && liveArmed === false && warnings.length === 0) {
      classification = CLASSIFICATIONS.HEALTHY_DRY_RUN;
    } else {
      classification = CLASSIFICATIONS.RUNNING_WITH_WARNINGS;
    }
  }
  // 5. Explicit healthy observation (paper monitor, no exposure, no warnings).
  else if (evidence.observationOnly === true && exposure === "none" && warnings.length === 0) {
    classification = CLASSIFICATIONS.HEALTHY_OBSERVATION;
  }
  // 6. Capital is safe but runtime attribution is incomplete.
  else if (exposure === "none") {
    classification = CLASSIFICATIONS.CAPITAL_SAFE_BUT_RUNTIME_AMBIGUOUS;
  }
  // 7. Not enough evidence to say anything.
  else {
    classification = CLASSIFICATIONS.UNKNOWN_NEEDS_REVIEW;
  }

  const meta = CLASSIFICATION_META[classification];

  // A soak claim requires a positively confirmed executor loop. Audit activity
  // alone (including monitor-driven) never supports it.
  const supportsSoakClaim =
    (classification === CLASSIFICATIONS.HEALTHY_DRY_RUN ||
      classification === CLASSIFICATIONS.RUNNING_WITH_WARNINGS) &&
    executorLoopConfirmed === true;

  const summary = buildSummary(classification, { scanner, lock, heartbeat, exposure, monitorDriven, executorLoopConfirmed });

  // A4.3 — additive, warning-only dedicated-RPC health. Computed AFTER the
  // classification decision above so A4 can never relax, upgrade, or override
  // any existing verdict (classification, soak, live readiness). A4 warnings are
  // appended to the returned `warnings` for visibility only.
  const a4Health = classifyA4Health(evidence.a4Evidence);
  const combinedWarnings = warnings.slice();
  for (const w of a4Health.warnings) {
    if (!combinedWarnings.includes(w)) combinedWarnings.push(w);
  }

  return {
    classification,
    severity: meta.severity,
    summary,
    evidenceUsed,
    missingEvidence,
    warnings: combinedWarnings,
    supportsSoakClaim,
    // Stage 4 never asserts live readiness under any classification. A4.3 does
    // not change this: A4 health is warning-only and never grants readiness.
    supportsLiveReadiness: false,
    a4Health,
    recommendedOperatorAction: meta.recommendedOperatorAction,
    dashboardWording: meta.dashboardWording,
    details: {
      scannerFreshness: scanner.state,
      scannerAgeMs: scanner.ageMs,
      lockState: lock.state,
      heartbeatState: heartbeat.state,
      exposure,
      liveArmed,
      pipelineMode,
      monitorDriven,
      executorLoopConfirmed
    }
  };
}

function buildSummary(classification, ctx) {
  switch (classification) {
    case CLASSIFICATIONS.CRITICAL_CAPITAL_RISK:
      return `Capital exposure "${ctx.exposure}" without adequate authority evidence — human action required.`;
    case CLASSIFICATIONS.MONITOR_DRIVEN_AUDIT_WITH_WARNINGS:
      return "Audit activity appears monitor-driven; executor loop is not confirmed. Not a soak.";
    case CLASSIFICATIONS.HEALTHY_DRY_RUN:
      return "Executor loop confirmed with fresh scanner in dry-run posture (not live).";
    case CLASSIFICATIONS.RUNNING_WITH_WARNINGS:
      return "Executor loop confirmed but at least one signal is degraded.";
    case CLASSIFICATIONS.HEALTHY_OBSERVATION:
      return "Paper monitor observation healthy; no capital exposure.";
    case CLASSIFICATIONS.STOPPED_CONFIRMED:
      return "Executor loop confirmed not running.";
    case CLASSIFICATIONS.CAPITAL_SAFE_BUT_RUNTIME_AMBIGUOUS:
      return "No capital exposure, but producer/loop/lock/scanner evidence is incomplete.";
    case CLASSIFICATIONS.UNKNOWN_NEEDS_REVIEW:
    default:
      return "Insufficient or contradictory evidence — needs human review.";
  }
}

function summarizeHealthClassification(result) {
  if (!result || typeof result !== "object") return "UNKNOWN — no classification";
  const w = Array.isArray(result.warnings) && result.warnings.length ? ` [${result.warnings.join(", ")}]` : "";
  return `${result.classification} (${result.severity}) — ${result.summary}${w}`;
}

module.exports = {
  classifyRuntimeHealth,
  classifyScannerFreshness,
  classifyLockState,
  classifyHeartbeatState,
  classifyA4Health,
  normalizeAuditEvent,
  normalizeExposure,
  summarizeHealthClassification,
  CLASSIFICATIONS,
  SEVERITY,
  SCANNER_FRESHNESS,
  LOCK_STATES,
  HEARTBEAT_STATES,
  WARNINGS,
  A4_HEALTH_STATUS,
  A4_HEALTH_SEVERITY,
  A4_WARNINGS,
  THRESHOLDS: Object.freeze({ SCANNER_FRESH_MS, SCANNER_STALE_MS, DEFAULT_STALE_MS })
};
