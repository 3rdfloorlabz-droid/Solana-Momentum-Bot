"use strict";

const timing = require("./armed_continuum_timing");

const STATES = Object.freeze([
  "PRECHECK",
  "ARMING",
  "STUB",
  "AP",
  "N6",
  "ROLLBACK",
  "DOMAIN_C",
  "FINALIZE"
]);

const EXIT_CODES = Object.freeze({
  PASS: 0,
  PRECHECK_FAILED: 10,
  AUTHORIZATION_INVALID: 11,
  DOMAIN_A_STALE: 12,
  ISOLATION_INVALID: 13,
  DUPLICATE_CONTINUUM_INVOCATION: 14,
  ARMING_FAILED: 20,
  STUB_FAILED: 21,
  INSUFFICIENT_POST_STUB_WINDOW: 22,
  AP_FAILED: 23,
  N6_FAILED: 24,
  DEADLINE_EXCEEDED: 25,
  TIMING_ENFORCEMENT_VIOLATION: 26,
  MONOTONIC_TIMER_ANOMALY: 27,
  ROLLBACK_FAILED: 30,
  DOMAIN_C_FAILED: 31,
  SAFETY_SUITE_FAILED: 32,
  RECEIPT_WRITE_FAILED: 40,
  UNEXPECTED_STATE: 50
});

const FAIL_CLASSES = Object.freeze({
  ROLLBACK_INITIATION_DELAY_EXCEEDED: "ROLLBACK_INITIATION_DELAY_EXCEEDED",
  DOMAIN_C_RESERVE_VIOLATION: "DOMAIN_C_RESERVE_VIOLATION",
  ILLEGAL_STATE_TRANSITION: "ILLEGAL_STATE_TRANSITION",
  DUPLICATE_CONTINUUM_INVOCATION: "DUPLICATE_CONTINUUM_INVOCATION",
  STALE_OR_CONSUMED_AUTHORIZATION: "STALE_OR_CONSUMED_AUTHORIZATION",
  MONOTONIC_TIMER_ANOMALY: "MONOTONIC_TIMER_ANOMALY"
});

const FAIL_REASON_BY_EXIT = Object.freeze({
  10: "FAIL_CLOSED_VALIDATION",
  11: "FAIL_CLOSED_VALIDATION",
  12: "FAIL_CLOSED_VALIDATION",
  13: "FAIL_CLOSED_VALIDATION",
  14: "FAIL_CLOSED_VALIDATION",
  20: "FAIL_CLOSED_VALIDATION",
  21: "FAIL_CLOSED_VALIDATION",
  22: "FAIL_CLOSED_TIMING",
  23: "FAIL_CLOSED_AP",
  24: "FAIL_CLOSED_N6",
  25: "FAIL_CLOSED_TIMING",
  26: "FAIL_CLOSED_TIMING",
  27: "FAIL_CLOSED_TIMING",
  30: "FAIL_CLOSED_ROLLBACK",
  31: "FAIL_CLOSED_DOMAIN_C",
  32: "FAIL_CLOSED_DOMAIN_C",
  40: "FAIL_CLOSED_UNEXPECTED",
  50: "FAIL_CLOSED_UNEXPECTED"
});

const TRANSITIONS = Object.freeze({
  PRECHECK: {
    predecessors: [],
    success: "ARMING",
    failure: "FINALIZE",
    rollbackObligation: false,
    deadlineCheck: false,
    successReason: "PRECHECK_COMPLETE",
    failureReason: "VALIDATION_ABORT"
  },
  ARMING: {
    predecessors: ["PRECHECK"],
    success: "STUB",
    failure: "ROLLBACK",
    rollbackObligation: true,
    deadlineCheck: true,
    successReason: "C3_COMPLETE",
    failureReason: "VALIDATION_ABORT"
  },
  STUB: {
    predecessors: ["ARMING"],
    success: "AP",
    failure: "ROLLBACK",
    rollbackObligation: true,
    deadlineCheck: true,
    successReason: "STUB_VALIDATED",
    failureReason: "VALIDATION_ABORT"
  },
  AP: {
    predecessors: ["STUB"],
    success: "N6",
    failure: "ROLLBACK",
    rollbackObligation: true,
    deadlineCheck: true,
    successReason: "AP_COMPLETED",
    failureReason: "VALIDATION_ABORT"
  },
  N6: {
    predecessors: ["AP"],
    success: "ROLLBACK",
    failure: "ROLLBACK",
    rollbackObligation: true,
    deadlineCheck: true,
    successReason: "N6_COMPLETED",
    failureReason: "VALIDATION_ABORT"
  },
  ROLLBACK: {
    predecessors: ["ARMING", "STUB", "AP", "N6"],
    success: "DOMAIN_C",
    failure: "DOMAIN_C",
    rollbackObligation: false,
    deadlineCheck: false,
    successReason: "ROLLBACK_COMPLETED",
    failureReason: "ROLLBACK_STARTED"
  },
  DOMAIN_C: {
    predecessors: ["ROLLBACK"],
    success: "FINALIZE",
    failure: "FINALIZE",
    rollbackObligation: false,
    deadlineCheck: false,
    successReason: "SAFETY_COMPLETED",
    failureReason: "DOMAIN_C_STARTED"
  },
  FINALIZE: {
    predecessors: ["PRECHECK", "DOMAIN_C"],
    success: null,
    failure: null,
    rollbackObligation: false,
    deadlineCheck: false,
    successReason: "AUTO_CHAIN",
    failureReason: "UNEXPECTED_ERROR"
  }
});

function assertLegalTransition(fromState, toState) {
  if (!TRANSITIONS[fromState]) return { ok: false, reason: "unknown_from_state" };
  const def = TRANSITIONS[fromState];
  const allowed = new Set();
  if (def.success) allowed.add(def.success);
  if (def.failure) allowed.add(def.failure);
  if (["ARMING", "STUB", "AP", "N6"].includes(fromState)) allowed.add("ROLLBACK");

  if (toState === "FINALIZE") {
    if (fromState === "PRECHECK" || fromState === "DOMAIN_C") return { ok: true };
    return { ok: false, reason: "illegal_transition" };
  }

  if (!allowed.has(toState)) return { ok: false, reason: "illegal_transition" };

  const predecessors = TRANSITIONS[toState]?.predecessors || [];
  if (predecessors.length > 0 && !predecessors.includes(fromState)) {
    return { ok: false, reason: "predecessor_mismatch" };
  }
  return { ok: true };
}

function mapFailureToExit(failClass) {
  const key = String(failClass || "").toUpperCase();
  if (key === FAIL_CLASSES.ROLLBACK_INITIATION_DELAY_EXCEEDED
    || key === FAIL_CLASSES.DOMAIN_C_RESERVE_VIOLATION) {
    return EXIT_CODES.TIMING_ENFORCEMENT_VIOLATION;
  }
  if (key === FAIL_CLASSES.DUPLICATE_CONTINUUM_INVOCATION) {
    return EXIT_CODES.DUPLICATE_CONTINUUM_INVOCATION;
  }
  if (key === FAIL_CLASSES.MONOTONIC_TIMER_ANOMALY) {
    return EXIT_CODES.MONOTONIC_TIMER_ANOMALY;
  }
  if (key === FAIL_CLASSES.ILLEGAL_STATE_TRANSITION) {
    return EXIT_CODES.UNEXPECTED_STATE;
  }
  if (key === FAIL_CLASSES.STALE_OR_CONSUMED_AUTHORIZATION) {
    return EXIT_CODES.AUTHORIZATION_INVALID;
  }
  if (EXIT_CODES[key] != null) return EXIT_CODES[key];
  return EXIT_CODES.UNEXPECTED_STATE;
}

function mapExitToStatus(exitCode) {
  if (exitCode === 0) return "PASS";
  return FAIL_REASON_BY_EXIT[exitCode] || "FAIL_CLOSED_UNEXPECTED";
}

function thresholdForState(state) {
  switch (state) {
    case "STUB":
      return { after: timing.MIN_POST_STUB_REMAINING_MS, label: "post_stub" };
    case "AP":
      return { before: timing.MIN_AP_REMAINING_MS, label: "ap_floor" };
    case "N6":
      return { before: timing.MIN_N6_REMAINING_MS, label: "n6_floor" };
    default:
      return null;
  }
}

module.exports = {
  STATES,
  EXIT_CODES,
  FAIL_CLASSES,
  FAIL_REASON_BY_EXIT,
  TRANSITIONS,
  assertLegalTransition,
  mapFailureToExit,
  mapExitToStatus,
  thresholdForState
};
