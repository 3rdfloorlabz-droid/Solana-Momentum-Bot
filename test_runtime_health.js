"use strict";

// ─── Vulcan Stage 4 — Tests for the Read-Only Runtime Health Classifier ────────
//
// These tests are PURE and in-memory. They read no runtime files, write no
// files, start no processes, and touch no secrets. All evidence is synthetic.

const assert = require("assert");
const rh = require("./runtime_health");

const NOW = Date.parse("2026-06-30T18:00:00.000Z");
const minutesAgo = (m) => new Date(NOW - m * 60 * 1000).toISOString();

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  x ${name}: ${err.message}`);
  }
}

// 1. Audit activity alone must not support a soak claim.
test("audit_activity_alone_does_not_support_soak", () => {
  const result = rh.classifyRuntimeHealth({
    now: NOW,
    auditEvents: [
      { timestamp: minutesAgo(1), eventType: "EXECUTION_STAGE", stage: "SWAP_SUBMITTED", producer: "live_executor" }
    ],
    capitalExposure: "none"
    // no lock / heartbeat evidence → executor loop cannot be confirmed
  });
  assert.strictEqual(result.supportsSoakClaim, false, "audit activity alone must not support soak");
  assert.strictEqual(result.supportsLiveReadiness, false);
});

// 2. Monitor-driven audit activity classifies with warning; executor loop not claimed.
test("monitor_mirror_classifies_with_warning", () => {
  const result = rh.classifyRuntimeHealth({
    now: NOW,
    auditEvents: [
      {
        timestamp: minutesAgo(1),
        eventType: "EXECUTION_STAGE",
        stage: "SWAP_SUBMITTED",
        producer: "live_executor",
        invocationContext: "monitor_mirror",
        invocationSource: "monitor",
        bridgeMode: "monitor_live_exit_mirror"
      }
    ],
    capitalExposure: "none"
  });
  assert.strictEqual(result.classification, rh.CLASSIFICATIONS.MONITOR_DRIVEN_AUDIT_WITH_WARNINGS);
  assert.ok(result.warnings.includes(rh.WARNINGS.EXECUTOR_LOOP_UNCONFIRMED), "executor loop must be unconfirmed");
  assert.strictEqual(result.details.executorLoopConfirmed, false, "executor loop must not be claimed");
  assert.strictEqual(result.supportsSoakClaim, false);
});

// 3. Stale scanner (>30 min).
test("stale_scanner_detected", () => {
  const s = rh.classifyScannerFreshness({ lastScanAt: minutesAgo(45) }, NOW);
  assert.strictEqual(s.state, rh.SCANNER_FRESHNESS.STALE);
});

// 4. Aging scanner (5–30 min).
test("aging_scanner_detected", () => {
  const s = rh.classifyScannerFreshness({ lastScanAt: minutesAgo(15) }, NOW);
  assert.strictEqual(s.state, rh.SCANNER_FRESHNESS.AGING);
});

// 5. Fresh scanner (<5 min).
test("fresh_scanner_detected", () => {
  const s = rh.classifyScannerFreshness({ lastScanAt: minutesAgo(2) }, NOW);
  assert.strictEqual(s.state, rh.SCANNER_FRESHNESS.FRESH);
});

// 6. Missing / malformed scanner → unknown.
test("missing_scanner_unknown", () => {
  assert.strictEqual(rh.classifyScannerFreshness(undefined, NOW).state, rh.SCANNER_FRESHNESS.UNKNOWN);
  assert.strictEqual(rh.classifyScannerFreshness({ lastScanAt: "not-a-date" }, NOW).state, rh.SCANNER_FRESHNESS.UNKNOWN);
  assert.strictEqual(rh.classifyScannerFreshness({}, NOW).state, rh.SCANNER_FRESHNESS.UNKNOWN);
});

// 7. Legacy audit rows normalize to unknown_legacy + legacyRow true.
test("legacy_audit_rows_normalize_unknown_legacy", () => {
  const norm = rh.normalizeAuditEvent({
    timestamp: minutesAgo(3),
    eventType: "EXECUTION_STAGE",
    stage: "SWAP_SUBMITTED",
    payload: { foo: "bar" }
  });
  assert.strictEqual(norm.producer, "unknown_legacy");
  assert.strictEqual(norm.invocationContext, "unknown");
  assert.strictEqual(norm.invocationSource, "unknown");
  assert.strictEqual(norm.bridgeMode, "unknown");
  assert.strictEqual(norm.runtimeMode, "unknown");
  assert.strictEqual(norm.authorityMode, "unknown");
  assert.strictEqual(norm.capitalExposure, "unknown");
  assert.strictEqual(norm.legacyRow, true);
  // Payload preserved, not rewritten.
  assert.deepStrictEqual(norm.payload, { foo: "bar" });
});

// 8. Missing lock when expected → LOCK_MISSING_WARNING.
test("missing_lock_unexpected_warns", () => {
  const lockState = rh.classifyLockState({ present: false, expected: true }, NOW);
  assert.strictEqual(lockState.state, rh.LOCK_STATES.ABSENT_UNEXPECTED);

  const result = rh.classifyRuntimeHealth({
    now: NOW,
    lockEvidence: { present: false, expected: true },
    capitalExposure: "none"
  });
  assert.ok(result.warnings.includes(rh.WARNINGS.LOCK_MISSING), "lock-missing warning must be present");
});

// 9. Capital active without authority → CRITICAL_CAPITAL_RISK.
test("capital_active_without_authority_is_critical", () => {
  const result = rh.classifyRuntimeHealth({
    now: NOW,
    capitalExposure: "active",
    openPositions: [{ mint: "SYNTHETIC" }]
  });
  assert.strictEqual(result.classification, rh.CLASSIFICATIONS.CRITICAL_CAPITAL_RISK);
  assert.strictEqual(result.severity, rh.SEVERITY.CRITICAL);
  assert.strictEqual(result.supportsLiveReadiness, false);
});

// 10. Capital none, runtime ambiguous → CAPITAL_SAFE_BUT_RUNTIME_AMBIGUOUS / UNKNOWN.
test("capital_none_runtime_ambiguous", () => {
  const result = rh.classifyRuntimeHealth({
    now: NOW,
    capitalExposure: "none",
    scannerHealth: { lastScanAt: minutesAgo(2) }
    // no lock/heartbeat/audit → cannot confirm loop
  });
  assert.ok(
    result.classification === rh.CLASSIFICATIONS.CAPITAL_SAFE_BUT_RUNTIME_AMBIGUOUS ||
      result.classification === rh.CLASSIFICATIONS.UNKNOWN_NEEDS_REVIEW,
    `unexpected classification: ${result.classification}`
  );
  assert.strictEqual(result.supportsSoakClaim, false);
});

// 11. Live readiness must never be claimed across a spread of classifications.
test("live_readiness_never_claimed", () => {
  const scenarios = [
    { now: NOW, capitalExposure: "active" },
    { now: NOW, capitalExposure: "possible" },
    { now: NOW, capitalExposure: "none" },
    { now: NOW, observationOnly: true, capitalExposure: "none" },
    { now: NOW, auditEvents: [{ producer: "live_executor", invocationContext: "monitor_mirror" }], capitalExposure: "none" },
    { now: NOW, stoppedConfirmed: true, capitalExposure: "none" },
    {
      now: NOW,
      capitalExposure: "none",
      liveArmed: false,
      scannerHealth: { lastScanAt: minutesAgo(1) },
      lockEvidence: { present: true, updatedAt: minutesAgo(0.2) },
      heartbeatEvidence: { present: true, lastBeatAt: minutesAgo(0.1) }
    },
    {}
  ];
  for (const ev of scenarios) {
    const result = rh.classifyRuntimeHealth(ev);
    assert.strictEqual(result.supportsLiveReadiness, false, `live readiness claimed for ${JSON.stringify(ev)}`);
  }
});

// Extra: confirmed loop + dry-run posture supports a soak claim (but never live).
test("confirmed_dry_run_loop_supports_soak_not_live", () => {
  const result = rh.classifyRuntimeHealth({
    now: NOW,
    capitalExposure: "none",
    liveArmed: false,
    scannerHealth: { lastScanAt: minutesAgo(1) },
    lockEvidence: { present: true, updatedAt: minutesAgo(0.2) },
    heartbeatEvidence: { present: true, lastBeatAt: minutesAgo(0.1) }
  });
  assert.strictEqual(result.details.executorLoopConfirmed, true);
  assert.strictEqual(result.classification, rh.CLASSIFICATIONS.HEALTHY_DRY_RUN);
  assert.strictEqual(result.supportsSoakClaim, true);
  assert.strictEqual(result.supportsLiveReadiness, false);
});

// Extra: summarizer produces a readable one-liner.
test("summarize_health_classification_readable", () => {
  const result = rh.classifyRuntimeHealth({ now: NOW, capitalExposure: "active" });
  const line = rh.summarizeHealthClassification(result);
  assert.ok(line.includes("CRITICAL_CAPITAL_RISK"));
  assert.ok(line.includes("critical"));
});

console.log("");
console.log(`runtime_health tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
