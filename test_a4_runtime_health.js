"use strict";

// ─── Vulcan A4.3 — Tests for Runtime Health A4 Classification ──────────────────
//
// PURE, in-memory tests. Synthetic evidence only. No files, no `.env`, no
// network, no processes, no secrets. Verifies that A4 health is warning/blocker
// only, never claims live readiness/soak, and never leaks secrets. A4.25 may map
// to A4_VERIFIED_DEDICATED only when explicit attributed approval satisfies all
// preconditions (still not live readiness).
//
// Guiding principle: Runtime health should expose blockers without weakening them.

const assert = require("assert");
const rh = require("./runtime_health");

const NOW = Date.parse("2026-07-02T23:40:00.000Z");
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

// Convenience: minimal a4Evidence object.
function a4(statusHint, extra = {}) {
  return Object.assign({ statusHint }, extra);
}

// 1. A4_UNKNOWN → warning blocker, no live readiness.
test("a4_unknown_maps_to_warning_blocker", () => {
  const h = rh.classifyA4Health(a4("A4_UNKNOWN"));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.UNKNOWN);
  assert.strictEqual(h.severity, rh.A4_HEALTH_SEVERITY.WARNING);
  assert.strictEqual(h.blockerActive, true);
  assert.ok(h.warnings.includes(rh.A4_WARNINGS.UNKNOWN));
  assert.strictEqual(h.supportsLiveReadiness, false);
  assert.strictEqual(h.supportsSoakClaim, false);

  // Absent a4Evidence entirely → also conservative UNKNOWN.
  const hNone = rh.classifyA4Health(undefined);
  assert.strictEqual(hNone.status, rh.A4_HEALTH_STATUS.UNKNOWN);
  assert.strictEqual(hNone.blockerActive, true);
});

// 2. A4_NOT_CONFIGURED → blocked.
test("a4_not_configured_maps_to_blocked", () => {
  const h = rh.classifyA4Health(a4("A4_NOT_CONFIGURED", {
    rpcRequired: true, rpcConfigured: false, refusalActive: true,
    rpcProviderLabel: "not_configured", rpcEndpointClass: "not_configured", confidence: "high"
  }));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.NOT_CONFIGURED);
  assert.strictEqual(h.severity, rh.A4_HEALTH_SEVERITY.BLOCKED);
  assert.strictEqual(h.blockerActive, true);
  assert.ok(h.warnings.includes(rh.A4_WARNINGS.NOT_CONFIGURED));
  assert.strictEqual(h.supportsLiveReadiness, false);
});

// 3. A4_REFUSAL_ACTIVE → blocked.
test("a4_refusal_active_maps_to_blocked", () => {
  const h = rh.classifyA4Health(a4("A4_REFUSAL_ACTIVE", { refusalActive: true, refusalReason: "dedicated_rpc_required_not_satisfied" }));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.REFUSAL_ACTIVE);
  assert.strictEqual(h.severity, rh.A4_HEALTH_SEVERITY.BLOCKED);
  assert.strictEqual(h.blockerActive, true);
  assert.strictEqual(h.refusalActive, true);
  assert.strictEqual(h.refusalReason, "dedicated_rpc_required_not_satisfied");
  assert.ok(h.warnings.includes(rh.A4_WARNINGS.REFUSAL_ACTIVE));
});

// 4. A4_CONFIGURED_UNVERIFIED → does not pass; still a blocker; not live-ready.
test("a4_configured_unverified_does_not_pass", () => {
  const h = rh.classifyA4Health(a4("A4_CONFIGURED_UNVERIFIED", {
    rpcConfigured: true, rpcProviderLabel: "solana_rpc_url_configured", rpcEndpointClass: "dedicated", confidence: "high"
  }));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.CONFIGURED_UNVERIFIED);
  assert.strictEqual(h.blockerActive, true);
  assert.strictEqual(h.rpcConfigured, true);
  assert.strictEqual(h.providerLabel, "solana_rpc_url_configured");
  assert.strictEqual(h.endpointClass, "dedicated");
  assert.strictEqual(h.supportsLiveReadiness, false);
  assert.strictEqual(h.supportsSoakClaim, false);
});

// 5. A4_FALLBACK_DETECTED → blocked, publicFallbackDetected true.
test("a4_fallback_detected_maps_to_blocked", () => {
  const h = rh.classifyA4Health(a4("A4_FALLBACK_DETECTED", { publicFallbackDetected: true, rpcEndpointClass: "public" }));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.FALLBACK_DETECTED);
  assert.strictEqual(h.severity, rh.A4_HEALTH_SEVERITY.BLOCKED);
  assert.strictEqual(h.publicFallbackDetected, true);
  assert.strictEqual(h.blockerActive, true);
  assert.ok(h.warnings.includes(rh.A4_WARNINGS.FALLBACK_DETECTED));
});

// 6. A4_VERIFIED_DEDICATED (synthetic) must never claim live readiness/soak.
test("a4_verified_dedicated_does_not_claim_live_readiness", () => {
  const h = rh.classifyA4Health(a4("A4_VERIFIED_DEDICATED", { rpcConfigured: true, rpcEndpointClass: "dedicated" }));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.VERIFIED_DEDICATED);
  assert.strictEqual(h.blockerActive, false, "verified may clear the A4 blocker only");
  assert.strictEqual(h.supportsLiveReadiness, false, "verified A4 must never grant live readiness");
  assert.strictEqual(h.supportsSoakClaim, false, "verified A4 must never grant soak");
  assert.deepStrictEqual(h.warnings, [], "verified A4 adds no warning");
});

// 7. Secret-shaped inputs must never appear in a4Health output.
test("a4_health_omits_raw_secrets", () => {
  const FAKE_URL = "https://mainnet.helius-rpc.com/?api-key=FAKE_SECRET_abc123";
  const FAKE_KEY = "FAKE_SECRET_abc123";
  const h = rh.classifyA4Health({
    statusHint: "A4_CONFIGURED_UNVERIFIED",
    rpcConfigured: true,
    // Hostile fields: raw URL/key in places the mapper must sanitize.
    rpcProviderLabel: FAKE_URL,
    rpcEndpointClass: FAKE_URL,
    refusalReason: FAKE_KEY,
    confidence: FAKE_KEY,
    rpcSource: FAKE_URL,
    notes: [FAKE_URL, FAKE_KEY]
  });
  const json = JSON.stringify(h);
  for (const needle of [FAKE_URL, FAKE_KEY, "api-key", "://"]) {
    assert.ok(!json.includes(needle), `a4Health leaked forbidden value: ${needle}`);
  }
  assert.strictEqual(h.providerLabel, "unknown");
  assert.strictEqual(h.endpointClass, "unknown");
  assert.strictEqual(h.refusalReason, null);
  assert.strictEqual(h.confidence, "low");
});

// 8. A4 warning is surfaced in the top-level runtime health warnings.
test("a4_warning_added_to_runtime_health_warnings", () => {
  const result = rh.classifyRuntimeHealth({
    now: NOW,
    capitalExposure: "none",
    a4Evidence: { statusHint: "A4_NOT_CONFIGURED", rpcConfigured: false, refusalActive: true }
  });
  assert.ok(result.warnings.includes(rh.A4_WARNINGS.NOT_CONFIGURED), "top-level warnings must surface A4");
  assert.ok(result.a4Health && result.a4Health.status === rh.A4_HEALTH_STATUS.NOT_CONFIGURED);
  assert.strictEqual(result.supportsLiveReadiness, false);
  assert.strictEqual(result.a4Health.supportsLiveReadiness, false);
});

// 9. A4 must not override / suppress a stale-scanner warning.
test("a4_does_not_override_stale_scanner", () => {
  const result = rh.classifyRuntimeHealth({
    now: NOW,
    capitalExposure: "none",
    scannerHealth: { lastScanAt: minutesAgo(45) },
    a4Evidence: { statusHint: "A4_NOT_CONFIGURED" }
  });
  assert.ok(result.warnings.includes(rh.WARNINGS.STALE_SCANNER), "stale scanner warning must remain");
  assert.ok(result.warnings.includes(rh.A4_WARNINGS.NOT_CONFIGURED), "A4 warning also present");
});

// 10. A4 must not override / suppress a heartbeat-missing warning.
test("a4_does_not_override_missing_heartbeat", () => {
  const result = rh.classifyRuntimeHealth({
    now: NOW,
    capitalExposure: "none",
    heartbeatEvidence: { present: false },
    a4Evidence: { statusHint: "A4_FALLBACK_DETECTED", publicFallbackDetected: true }
  });
  assert.ok(result.warnings.includes(rh.WARNINGS.HEARTBEAT_MISSING), "heartbeat-missing warning must remain");
  assert.ok(result.warnings.includes(rh.A4_WARNINGS.FALLBACK_DETECTED));
});

// 11. A4 must not override executor-loop-unconfirmed.
test("a4_does_not_override_executor_loop_unconfirmed", () => {
  const result = rh.classifyRuntimeHealth({
    now: NOW,
    capitalExposure: "none",
    a4Evidence: { statusHint: "A4_REFUSAL_ACTIVE", refusalActive: true }
  });
  assert.ok(result.warnings.includes(rh.WARNINGS.EXECUTOR_LOOP_UNCONFIRMED), "executor-loop-unconfirmed must remain");
  assert.strictEqual(result.details.executorLoopConfirmed, false);
});

// 12. A4 must not upgrade posture / relax conservatism (A1 / capital uncertainty).
test("a4_does_not_override_a1_or_capital_uncertainty", () => {
  // Even a synthetic "verified" A4 must not upgrade an ambiguous verdict or
  // claim live readiness/soak.
  const result = rh.classifyRuntimeHealth({
    now: NOW,
    capitalExposure: "none",
    a4Evidence: { statusHint: "A4_VERIFIED_DEDICATED", rpcConfigured: true }
  });
  assert.strictEqual(result.supportsLiveReadiness, false, "A4 verified must not grant live readiness");
  assert.strictEqual(result.supportsSoakClaim, false, "A4 verified must not grant soak");
  assert.ok(
    result.classification === rh.CLASSIFICATIONS.CAPITAL_SAFE_BUT_RUNTIME_AMBIGUOUS ||
      result.classification === rh.CLASSIFICATIONS.UNKNOWN_NEEDS_REVIEW,
    `posture must remain conservative, got ${result.classification}`
  );
  // Capital-exposure-unknown must still dominate to a conservative verdict.
  const unknownExposure = rh.classifyRuntimeHealth({
    now: NOW,
    a4Evidence: { statusHint: "A4_VERIFIED_DEDICATED" }
    // no capitalExposure / openPositions → unknown
  });
  assert.strictEqual(unknownExposure.supportsLiveReadiness, false);
});

// Extra: additive A4 must not break a confirmed dry-run soak classification.
test("a4_additive_preserves_healthy_dry_run_soak", () => {
  const result = rh.classifyRuntimeHealth({
    now: NOW,
    capitalExposure: "none",
    liveArmed: false,
    scannerHealth: { lastScanAt: minutesAgo(1) },
    lockEvidence: { present: true, updatedAt: minutesAgo(0.2) },
    heartbeatEvidence: { present: true, lastBeatAt: minutesAgo(0.1) },
    a4Evidence: { statusHint: "A4_NOT_CONFIGURED" }
  });
  // Classification decided on pre-A4 warnings, so soak is still supported;
  // the A4 warning is appended for visibility but does not flip live readiness.
  assert.strictEqual(result.classification, rh.CLASSIFICATIONS.HEALTHY_DRY_RUN);
  assert.strictEqual(result.supportsSoakClaim, true);
  assert.strictEqual(result.supportsLiveReadiness, false);
  assert.ok(result.warnings.includes(rh.A4_WARNINGS.NOT_CONFIGURED), "A4 warning still surfaced additively");
});

// ─── A4.13 — read-only proof status mapping ───────────────────────────────────

// 13. Fresh successful proof evidence → A4_READ_ONLY_RPC_VERIFIED (warning blocker).
test("runtime_health_maps_success_to_A4_READ_ONLY_RPC_VERIFIED", () => {
  const h = rh.classifyA4Health(a4("A4_READ_ONLY_RPC_VERIFIED", {
    rpcConfigured: true,
    rpcProviderLabel: "helius_rpc_url_configured",
    rpcEndpointClass: "dedicated",
    confidence: "high",
    proof: {
      proofStatus: "READ_ONLY_RPC_OK", providerLabel: "helius_rpc_url_configured",
      endpointClass: "dedicated", method: "getSlot", latencyMsBucket: "<250ms",
      freshness: "fresh", publicFallbackUsed: false, secretSafe: true,
      slotObserved: true, slotValuePresent: true, proofObservedAt: minutesAgo(1)
    }
  }));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.READ_ONLY_RPC_VERIFIED);
  assert.strictEqual(h.severity, rh.A4_HEALTH_SEVERITY.WARNING);
  assert.strictEqual(h.blockerActive, true);
  assert.ok(h.warnings.includes(rh.A4_WARNINGS.READ_ONLY_RPC_VERIFIED));
  assert.ok(h.proof && h.proof.proofStatus === "READ_ONLY_RPC_OK");
  assert.strictEqual(h.proof.method, "getSlot");
  assert.strictEqual(h.supportsLiveReadiness, false);
  assert.strictEqual(h.supportsSoakClaim, false);
});

// 14. Failed proof → A4_PROOF_FAILED (blocked).
test("runtime_health_maps_failure_to_A4_PROOF_FAILED", () => {
  const h = rh.classifyA4Health(a4("A4_PROOF_FAILED", {
    proof: { proofStatus: "READ_ONLY_RPC_FAILED", method: "getSlot", freshness: "fresh", errorCode: "RPC_TIMEOUT" }
  }));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.PROOF_FAILED);
  assert.strictEqual(h.severity, rh.A4_HEALTH_SEVERITY.BLOCKED);
  assert.strictEqual(h.blockerActive, true);
  assert.strictEqual(h.supportsLiveReadiness, false);
  assert.strictEqual(h.supportsSoakClaim, false);
});

// 15. Stale proof → A4_PROOF_STALE (warning blocker).
test("runtime_health_maps_stale_to_A4_PROOF_STALE", () => {
  const h = rh.classifyA4Health(a4("A4_PROOF_STALE", {
    proof: { proofStatus: "READ_ONLY_RPC_OK", method: "getSlot", freshness: "stale" }
  }));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.PROOF_STALE);
  assert.strictEqual(h.severity, rh.A4_HEALTH_SEVERITY.WARNING);
  assert.strictEqual(h.blockerActive, true);
  assert.strictEqual(h.supportsLiveReadiness, false);
  assert.strictEqual(h.supportsSoakClaim, false);
});

// 16. Live readiness stays false across every proof status.
test("runtime_health_keeps_live_readiness_false_for_all_proof_statuses", () => {
  for (const s of ["A4_READ_ONLY_RPC_VERIFIED", "A4_PROOF_FAILED", "A4_PROOF_STALE"]) {
    const result = rh.classifyRuntimeHealth({
      now: NOW,
      capitalExposure: "none",
      a4Evidence: { statusHint: s, proof: { proofStatus: "READ_ONLY_RPC_OK", freshness: "fresh" } }
    });
    assert.strictEqual(result.supportsLiveReadiness, false, `${s} must not grant live readiness`);
    assert.strictEqual(result.supportsSoakClaim, false, `${s} must not grant soak`);
    assert.strictEqual(result.a4Health.status, s);
  }
});

// 17. Proof statuses must not emit A4_VERIFIED_DEDICATED without approval.
test("runtime_health_proof_statuses_stay_below_verified_without_approval", () => {
  for (const s of ["A4_READ_ONLY_RPC_VERIFIED", "A4_PROOF_FAILED", "A4_PROOF_STALE"]) {
    const h = rh.classifyA4Health(a4(s, { proof: { proofStatus: "READ_ONLY_RPC_OK", freshness: "fresh" } }));
    assert.notStrictEqual(h.status, rh.A4_HEALTH_STATUS.VERIFIED_DEDICATED);
  }
});

// ─── A4.18 — stability status mapping ─────────────────────────────────────────

function stabilityCandidate(extra = {}) {
  return Object.assign({
    successCount: 2, freshSuccessCount: 2, separationBucket: ">=15m",
    providerConsistent: true, endpointClassConsistent: true,
    providerLabel: "helius_rpc_url_configured", endpointClass: "dedicated",
    fallbackObserved: false, failureObserved: false, secretSafe: true,
    withinFreshnessWindow: true, stabilityCandidate: true,
    threshold: { minSuccesses: 2, minSeparationMs: 900000, freshnessMs: 86400000 }
  }, extra);
}

// 18. stabilityCandidate + READ_ONLY_RPC_VERIFIED → A4_STABILITY_PROOF_OBSERVED.
test("runtime_health_maps_stability_candidate_to_A4_STABILITY_PROOF_OBSERVED", () => {
  const h = rh.classifyA4Health(a4("A4_READ_ONLY_RPC_VERIFIED", {
    rpcConfigured: true, proofStability: stabilityCandidate()
  }));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.STABILITY_PROOF_OBSERVED);
  assert.strictEqual(h.severity, rh.A4_HEALTH_SEVERITY.WARNING);
  assert.ok(h.proofStability && h.proofStability.stabilityCandidate === true);
});

// 19. stability observed keeps blocker active.
test("runtime_health_keeps_blocker_active_for_stability_observed", () => {
  const h = rh.classifyA4Health(a4("A4_READ_ONLY_RPC_VERIFIED", { proofStability: stabilityCandidate() }));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.STABILITY_PROOF_OBSERVED);
  assert.strictEqual(h.blockerActive, true);
});

// 20. stability observed never grants live/soak readiness.
test("runtime_health_keeps_live_readiness_false_for_stability_observed", () => {
  const result = rh.classifyRuntimeHealth({
    now: NOW, capitalExposure: "none",
    a4Evidence: { statusHint: "A4_READ_ONLY_RPC_VERIFIED", proofStability: stabilityCandidate() }
  });
  assert.strictEqual(result.a4Health.status, "A4_STABILITY_PROOF_OBSERVED");
  assert.strictEqual(result.supportsLiveReadiness, false);
  assert.strictEqual(result.supportsSoakClaim, false);
  assert.strictEqual(result.a4Health.supportsLiveReadiness, false);
  assert.strictEqual(result.a4Health.supportsSoakClaim, false);
});

// 21. stability observed stays below verified without approval.
test("runtime_health_stability_observed_stays_below_verified_without_approval", () => {
  const h = rh.classifyA4Health(a4("A4_READ_ONLY_RPC_VERIFIED", { proofStability: stabilityCandidate() }));
  assert.notStrictEqual(h.status, rh.A4_HEALTH_STATUS.VERIFIED_DEDICATED);
});

// 22. stability does not override NOT_CONFIGURED.
test("runtime_health_does_not_let_stability_override_not_configured", () => {
  const h = rh.classifyA4Health(a4("A4_NOT_CONFIGURED", {
    rpcConfigured: false, refusalActive: true, proofStability: stabilityCandidate()
  }));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.NOT_CONFIGURED);
  assert.strictEqual(h.severity, rh.A4_HEALTH_SEVERITY.BLOCKED);
});

// 23. stability does not override FALLBACK_DETECTED.
test("runtime_health_does_not_let_stability_override_fallback_detected", () => {
  const h = rh.classifyA4Health(a4("A4_FALLBACK_DETECTED", {
    publicFallbackDetected: true, proofStability: stabilityCandidate()
  }));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.FALLBACK_DETECTED);
  assert.strictEqual(h.severity, rh.A4_HEALTH_SEVERITY.BLOCKED);
});

// 24. stability does not override PROOF_FAILED.
test("runtime_health_does_not_let_stability_override_proof_failed", () => {
  const h = rh.classifyA4Health(a4("A4_PROOF_FAILED", { proofStability: stabilityCandidate() }));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.PROOF_FAILED);
  assert.strictEqual(h.severity, rh.A4_HEALTH_SEVERITY.BLOCKED);
});

// 25. stabilityCandidate false leaves READ_ONLY_RPC_VERIFIED unchanged.
test("runtime_health_stability_not_candidate_stays_read_only_verified", () => {
  const h = rh.classifyA4Health(a4("A4_READ_ONLY_RPC_VERIFIED", {
    proofStability: stabilityCandidate({ stabilityCandidate: false, freshSuccessCount: 1, separationBucket: "unknown" })
  }));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.READ_ONLY_RPC_VERIFIED);
});

// ─── A4.21 — proof-scan-backed stability + fail-safe messaging ────────────────

// 26. Scan-backed stabilityCandidate maps to A4_STABILITY_PROOF_OBSERVED.
test("runtime_health_maps_targeted_scan_stability_to_A4_STABILITY_PROOF_OBSERVED", () => {
  const h = rh.classifyA4Health(a4("A4_READ_ONLY_RPC_VERIFIED", {
    proofStability: stabilityCandidate(),
    proofScan: { available: true, limit: 5000, errorCode: null }
  }));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.STABILITY_PROOF_OBSERVED);
  assert.ok(h.proofScan && h.proofScan.available === true);
  assert.strictEqual(h.proofScan.limit, 5000);
  assert.strictEqual(h.proofScan.errorCode, null);
});

// 27. Scan-backed stability still keeps live/soak readiness false.
test("runtime_health_keeps_live_readiness_false", () => {
  const h = rh.classifyA4Health(a4("A4_READ_ONLY_RPC_VERIFIED", {
    proofStability: stabilityCandidate(),
    proofScan: { available: true, limit: 5000, errorCode: null }
  }));
  assert.strictEqual(h.supportsLiveReadiness, false);
  assert.strictEqual(h.supportsSoakClaim, false);
});

// 28. Scan-backed stability stays below verified without approval.
test("runtime_health_scan_stability_stays_below_verified_without_approval", () => {
  const h = rh.classifyA4Health(a4("A4_READ_ONLY_RPC_VERIFIED", {
    proofStability: stabilityCandidate(),
    proofScan: { available: true, limit: 5000, errorCode: null }
  }));
  assert.notStrictEqual(h.status, rh.A4_HEALTH_STATUS.VERIFIED_DEDICATED);
});

// 29. Proof scan unavailable is surfaced safely (enumerated code, no throw).
test("runtime_health_handles_proof_scan_unavailable_safely", () => {
  const h = rh.classifyA4Health(a4("A4_CONFIGURED_UNVERIFIED", {
    rpcConfigured: true,
    proofScan: { available: false, limit: 5000, errorCode: "A4_PROOF_SCAN_READ_ERROR" }
  }));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.CONFIGURED_UNVERIFIED);
  assert.ok(h.proofScan);
  assert.strictEqual(h.proofScan.available, false);
  assert.strictEqual(h.proofScan.errorCode, "A4_PROOF_SCAN_READ_ERROR");
  // Unknown/forbidden error codes collapse to null.
  const h2 = rh.classifyA4Health(a4("A4_CONFIGURED_UNVERIFIED", {
    proofScan: { available: false, limit: 5000, errorCode: "https://leak?api-key=x" }
  }));
  assert.strictEqual(h2.proofScan.errorCode, null);
});

// ─── A4.25 — approval coupling ────────────────────────────────────────────────

function validApproval(extra = {}) {
  return Object.assign({
    present: true,
    approved: true,
    status: "approved",
    approver: "Taylor",
    decisionRef: "DECISION-2026-07-04-A4-STABILITY-PROOF-ACCEPTED",
    evidenceRef: "helius_rpc_url_configured:dedicated",
    evidenceRefConsistent: true,
    approvedAtIso: minutesAgo(1),
    expiresAtIso: null,
    freshness: "fresh",
    secretRisk: false
  }, extra);
}

function stabilityWithScan(extra = {}) {
  return {
    proofStability: stabilityCandidate(extra.proofStability || {}),
    proofScan: { available: true, limit: 5000, errorCode: null },
    approvalScan: { available: true, limit: 5000, errorCode: null }
  };
}

// 30. No approval event → stays A4_STABILITY_PROOF_OBSERVED.
test("no_approval_event_stays_stability_proof_observed", () => {
  const h = rh.classifyA4Health(a4("A4_READ_ONLY_RPC_VERIFIED", stabilityWithScan()));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.STABILITY_PROOF_OBSERVED);
});

// 31. Valid approval + stability → A4_VERIFIED_DEDICATED.
test("valid_approval_event_maps_to_A4_VERIFIED_DEDICATED", () => {
  const h = rh.classifyA4Health(a4("A4_READ_ONLY_RPC_VERIFIED", Object.assign(
    stabilityWithScan(),
    { approval: validApproval() }
  )));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.VERIFIED_DEDICATED);
  assert.strictEqual(h.severity, rh.A4_HEALTH_SEVERITY.INFO);
  assert.ok(h.approval && h.approval.approved === true);
});

// 32. pending/not_approved does not verify.
test("pending_or_not_approved_does_not_verify", () => {
  for (const status of ["pending_review", "not_approved"]) {
    const h = rh.classifyA4Health(a4("A4_READ_ONLY_RPC_VERIFIED", Object.assign(
      stabilityWithScan(),
      { approval: validApproval({ approved: false, status, present: true }) }
    )));
    assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.STABILITY_PROOF_OBSERVED, status);
  }
});

// 33. Revoked supersedes prior approval.
test("revoked_event_supersedes_prior_approval", () => {
  const h = rh.classifyA4Health(a4("A4_READ_ONLY_RPC_VERIFIED", Object.assign(
    stabilityWithScan(),
    { approval: validApproval({ approved: false, status: "revoked" }) }
  )));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.STABILITY_PROOF_OBSERVED);
});

// 34. Expired approval is not trusted.
test("expired_approval_is_not_trusted", () => {
  const h = rh.classifyA4Health(a4("A4_READ_ONLY_RPC_VERIFIED", Object.assign(
    stabilityWithScan(),
    { approval: validApproval({ approved: false, freshness: "expired", expiresAtIso: minutesAgo(60) }) }
  )));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.STABILITY_PROOF_OBSERVED);
});

// 35. evidenceRef mismatch does not verify.
test("approval_with_evidence_ref_mismatch_does_not_verify", () => {
  const h = rh.classifyA4Health(a4("A4_READ_ONLY_RPC_VERIFIED", Object.assign(
    stabilityWithScan(),
    { approval: validApproval({ evidenceRefConsistent: false, evidenceRef: "wrong:ref" }) }
  )));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.STABILITY_PROOF_OBSERVED);
});

// 36. Blocker overrides approval.
test("blocker_overrides_approval", () => {
  const bundle = Object.assign(stabilityWithScan(), { approval: validApproval() });
  for (const blocker of ["A4_FALLBACK_DETECTED", "A4_PROOF_FAILED", "A4_NOT_CONFIGURED"]) {
    const h = rh.classifyA4Health(a4(blocker, bundle));
    assert.notStrictEqual(h.status, rh.A4_HEALTH_STATUS.VERIFIED_DEDICATED, blocker);
  }
});

// 37. Approval does not grant live or soak readiness.
test("approval_does_not_grant_live_or_soak_readiness", () => {
  const result = rh.classifyRuntimeHealth({
    now: NOW,
    capitalExposure: "none",
    a4Evidence: a4("A4_READ_ONLY_RPC_VERIFIED", Object.assign(stabilityWithScan(), { approval: validApproval() }))
  });
  assert.strictEqual(result.a4Health.status, rh.A4_HEALTH_STATUS.VERIFIED_DEDICATED);
  assert.strictEqual(result.supportsLiveReadiness, false);
  assert.strictEqual(result.supportsSoakClaim, false);
  assert.strictEqual(result.a4Health.supportsLiveReadiness, false);
  assert.strictEqual(result.a4Health.supportsSoakClaim, false);
});

// 38. Secret-like approval field rejected safely.
test("approval_event_with_secret_like_field_is_rejected_safely", () => {
  const h = rh.classifyA4Health(a4("A4_READ_ONLY_RPC_VERIFIED", Object.assign(
    stabilityWithScan(),
    { approval: validApproval({ approved: false, secretRisk: true }) }
  )));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.STABILITY_PROOF_OBSERVED);
});

// 39. proofScan unavailable fails closed even with approval present.
test("approval_without_proof_scan_available_fails_closed", () => {
  const h = rh.classifyA4Health(a4("A4_READ_ONLY_RPC_VERIFIED", {
    proofStability: stabilityCandidate(),
    proofScan: { available: false, limit: 5000, errorCode: "A4_PROOF_SCAN_READ_ERROR" },
    approval: validApproval()
  }));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.STABILITY_PROOF_OBSERVED);
});

// 40. Canonical A4.35 live-style approval payload maps to VERIFIED_DEDICATED.
test("canonical_a4_35_live_approval_payload_maps_to_verified_dedicated", () => {
  const fs = require("fs");
  const re = require("./runtime_evidence");
  const lines = fs.readFileSync("execution_audit.jsonl", "utf8").trim().split("\n");
  const approvalRow = JSON.parse(lines.find((l) => l.includes("A4_VERIFIED_DEDICATED_APPROVAL")));
  const approvalEvidence = re.buildA4ApprovalEvidence([approvalRow], {
    stability: {
      providerConsistent: true,
      providerLabel: "helius_rpc_url_configured",
      endpointClass: "dedicated"
    },
    rpcProviderLabel: "helius_rpc_url_configured",
    rpcEndpointClass: "dedicated"
  });
  assert.strictEqual(approvalEvidence.approved, true);
  assert.strictEqual(approvalEvidence.evidenceRefConsistent, true);
  const h = rh.classifyA4Health(a4("A4_READ_ONLY_RPC_VERIFIED", Object.assign(
    stabilityWithScan(),
    { approval: approvalEvidence }
  )));
  assert.strictEqual(h.status, rh.A4_HEALTH_STATUS.VERIFIED_DEDICATED);
  assert.strictEqual(h.supportsLiveReadiness, false);
  assert.strictEqual(h.supportsSoakClaim, false);
});

console.log("");
console.log(`a4 runtime_health tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
