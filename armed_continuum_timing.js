"use strict";

const common = require("./live_validation_common");

const ARMED_CAP_MS = 900_000;
const MIN_POST_STUB_REMAINING_MS = 720_000;
const MIN_AP_REMAINING_MS = 600_000;
const MIN_N6_REMAINING_MS = 480_000;
const DOMAIN_C_RESERVE_MS = 180_000;
const MAX_STUB_TO_AP_DELAY_MS = 120_000;
const STUB_TO_AP_SLO_MS = 30_000;
const MAX_AP_TO_N6_DELAY_MS = 15_000;
const MAX_ROLLBACK_INITIATION_DELAY_MS = 5_000;
const G1_POST_BLOCK_MARGIN_MS = 3_600_000;
const DOMAIN_A_FRESHNESS_BEFORE_C1_MS = 720_000;

const TIMING_CONSTANTS = Object.freeze({
  ARMED_CAP_MS,
  MIN_POST_STUB_REMAINING_MS,
  MIN_AP_REMAINING_MS,
  MIN_N6_REMAINING_MS,
  DOMAIN_C_RESERVE_MS,
  MAX_STUB_TO_AP_DELAY_MS,
  STUB_TO_AP_SLO_MS,
  MAX_AP_TO_N6_DELAY_MS,
  MAX_ROLLBACK_INITIATION_DELAY_MS,
  G1_POST_BLOCK_MARGIN_MS,
  DOMAIN_A_FRESHNESS_BEFORE_C1_MS
});

function readMonotonicNs(clock = null) {
  if (clock && typeof clock.monotonicNs === "function") {
    const value = clock.monotonicNs();
    if (typeof value !== "bigint" && typeof value !== "number") {
      throw new Error("ambiguous monotonic clock value");
    }
    return typeof value === "bigint" ? value : BigInt(Math.trunc(value));
  }
  return process.hrtime.bigint();
}

function nsToMs(ns) {
  if (typeof ns !== "bigint") throw new Error("missing monotonic reference");
  return Number(ns / 1_000_000n);
}

function createArmedTimer(options = {}) {
  const clock = options.clock || null;
  const startMono = readMonotonicNs(clock);
  const startUtc = options.startUtc || common.nowIso();
  const capMs = Number.isFinite(options.capMs) ? options.capMs : ARMED_CAP_MS;
  if (!Number.isFinite(capMs) || capMs <= 0) {
    throw new Error("ambiguous armed cap");
  }

  return Object.freeze({
    startMono,
    startUtc,
    capMs,
    deadlineMono: startMono + BigInt(capMs) * 1_000_000n
  });
}

function remainingMs(timer, clock = null) {
  if (!timer || timer.startMono == null || timer.deadlineMono == null) {
    throw new Error("missing timer data");
  }
  const now = readMonotonicNs(clock);
  const remainingNs = timer.deadlineMono - now;
  return remainingNs <= 0n ? 0 : nsToMs(remainingNs);
}

function elapsedMs(timer, clock = null) {
  if (!timer || timer.startMono == null) throw new Error("missing timer data");
  const now = readMonotonicNs(clock);
  return nsToMs(now - timer.startMono);
}

function assertMinRemaining(timer, minRemainingMs, clock = null) {
  const remaining = remainingMs(timer, clock);
  if (!Number.isFinite(minRemainingMs) || minRemainingMs < 0) {
    throw new Error("ambiguous threshold");
  }
  if (remaining < minRemainingMs) {
    return {
      ok: false,
      remainingMs: remaining,
      requiredMs: minRemainingMs,
      reason: "INSUFFICIENT_REMAINING"
    };
  }
  return { ok: true, remainingMs: remaining, requiredMs: minRemainingMs };
}

function assertTransitionDelay(startedAtMono, maxDelayMs, clock = null) {
  if (startedAtMono == null) throw new Error("missing transition start");
  const now = readMonotonicNs(clock);
  const elapsed = nsToMs(now - startedAtMono);
  if (!Number.isFinite(maxDelayMs) || maxDelayMs < 0) {
    throw new Error("ambiguous transition delay");
  }
  if (elapsed > maxDelayMs) {
    return { ok: false, elapsedMs: elapsed, maxDelayMs, reason: "TRANSITION_DELAY_EXCEEDED" };
  }
  return { ok: true, elapsedMs: elapsed, maxDelayMs };
}

function detectMonotonicAnomaly(previousMono, clock = null, options = {}) {
  if (previousMono == null) return { ok: true };
  let now;
  try {
    now = readMonotonicNs(clock);
  } catch (error) {
    return {
      ok: false,
      reason: "MONOTONIC_TIMER_ANOMALY",
      detail: "missing_timer_reading",
      message: error.message || String(error)
    };
  }
  if (typeof now !== "bigint") {
    return { ok: false, reason: "MONOTONIC_TIMER_ANOMALY", detail: "invalid_timer_reading" };
  }
  if (now < previousMono) {
    return { ok: false, reason: "MONOTONIC_TIMER_ANOMALY", detail: "MONOTONIC_REGRESSION" };
  }
  if (options.maxForwardJumpMs != null) {
    const jumpMs = nsToMs(now - previousMono);
    if (jumpMs > options.maxForwardJumpMs) {
      return { ok: false, reason: "MONOTONIC_TIMER_ANOMALY", detail: "IMPOSSIBLE_FORWARD_JUMP", jumpMs };
    }
  }
  return { ok: true, nowMono: now };
}

function assertRollbackInitiationDelay(terminalMono, rollbackStartMono, maxDelayMs = MAX_ROLLBACK_INITIATION_DELAY_MS) {
  if (terminalMono == null || rollbackStartMono == null) {
    throw new Error("missing monotonic reference");
  }
  if (!Number.isFinite(maxDelayMs) || maxDelayMs < 0) {
    throw new Error("ambiguous rollback initiation threshold");
  }
  const delayMs = nsToMs(rollbackStartMono - terminalMono);
  if (delayMs > maxDelayMs) {
    return {
      ok: false,
      delayMs,
      thresholdMs: maxDelayMs,
      reason: "ROLLBACK_INITIATION_DELAY_EXCEEDED"
    };
  }
  return { ok: true, delayMs, thresholdMs: maxDelayMs };
}

function assertDomainCReserve(remainingMs, reserveMs = DOMAIN_C_RESERVE_MS) {
  if (!Number.isFinite(remainingMs) || !Number.isFinite(reserveMs)) {
    throw new Error("ambiguous domain C reserve check");
  }
  if (remainingMs < reserveMs) {
    return {
      ok: false,
      remainingMs,
      thresholdMs: reserveMs,
      reason: "DOMAIN_C_RESERVE_VIOLATION"
    };
  }
  return { ok: true, remainingMs, thresholdMs: reserveMs };
}

module.exports = {
  TIMING_CONSTANTS,
  ARMED_CAP_MS,
  MIN_POST_STUB_REMAINING_MS,
  MIN_AP_REMAINING_MS,
  MIN_N6_REMAINING_MS,
  DOMAIN_C_RESERVE_MS,
  MAX_STUB_TO_AP_DELAY_MS,
  STUB_TO_AP_SLO_MS,
  MAX_AP_TO_N6_DELAY_MS,
  MAX_ROLLBACK_INITIATION_DELAY_MS,
  G1_POST_BLOCK_MARGIN_MS,
  DOMAIN_A_FRESHNESS_BEFORE_C1_MS,
  readMonotonicNs,
  nsToMs,
  createArmedTimer,
  remainingMs,
  elapsedMs,
  assertMinRemaining,
  assertTransitionDelay,
  detectMonotonicAnomaly,
  assertRollbackInitiationDelay,
  assertDomainCReserve
};
