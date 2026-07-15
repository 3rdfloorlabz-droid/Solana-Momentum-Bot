"use strict";

// ─── Vulcan A4.2 — Tests for Safe (secret-free) Dedicated-RPC Evidence Fields ──
//
// All fixtures are synthetic and written into an isolated OS temp directory.
// NO real runtime files are read or written. No processes are started. No
// secrets are touched. `.env` is never read.
//
// Guiding principle: Configuration is not proof. Proof requires safe runtime evidence.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const re = require("./runtime_evidence");

const NOW = "2026-07-02T23:40:00.000Z";
const NOW_MS = Date.parse(NOW);
const minutesAgo = (m) => new Date(NOW_MS - m * 60 * 1000).toISOString();

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vulcan-a42-"));
}
function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
}
function writeAudit(root, rows) {
  fs.writeFileSync(path.join(root, re.FILES.AUDIT), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  const root = makeRoot();
  try {
    fn(root);
    passed += 1;
    console.log(`  ok ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  x ${name}: ${err.message}`);
  } finally {
    cleanup(root);
  }
}

// Deep-scans an object for any string containing a forbidden secret-shaped
// fragment. Used to prove a4Evidence never echoes raw endpoints/keys.
function assertNoSecretLeak(obj, forbidden) {
  const json = JSON.stringify(obj);
  for (const needle of forbidden) {
    assert.ok(!json.includes(needle), `a4Evidence leaked forbidden value: ${needle}`);
  }
}

// 1. Not configured + refusal → normalized safely.
test("a4_not_configured_refusal_normalized", (root) => {
  writeAudit(root, [
    {
      timestamp: minutesAgo(2),
      eventType: "EXECUTION_STAGE",
      stage: "SIMULATION",
      producer: "live_executor",
      payload: {
        endpointResolution: true,
        purpose: "simulation",
        requireDedicated: true,
        provider: null,
        publicFallbackUsed: false,
        rejectedAsPublic: [],
        configuredProvidersPresent: [],
        message: "Dedicated RPC endpoint required; public mainnet-beta fallback refused."
      }
    }
  ]);

  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const a4 = evidence.a4Evidence;
  assert.ok(a4, "a4Evidence should be present");
  assert.ok(
    a4.statusHint === re.A4_STATUS.NOT_CONFIGURED || a4.statusHint === re.A4_STATUS.REFUSAL_ACTIVE,
    `unexpected statusHint ${a4.statusHint}`
  );
  assert.strictEqual(a4.rpcRequired, true);
  assert.strictEqual(a4.rpcConfigured, false);
  assert.strictEqual(a4.refusalActive, true);
  assert.strictEqual(a4.configuredProviderCount, 0);
  assert.strictEqual(a4.publicFallbackDetected, false);
  assert.strictEqual(a4.secretExposureRisk, "none_observed");
  assert.strictEqual(a4.rpcEndpointClass, "not_configured");
  assert.strictEqual(a4.confidence, "high");
  assert.notStrictEqual(a4.statusHint, "A4_VERIFIED_DEDICATED");
});

// 2. Configured but unverified → rpcConfigured true, not verified.
test("a4_configured_unverified_normalized", (root) => {
  writeAudit(root, [
    {
      timestamp: minutesAgo(1),
      eventType: "EXECUTION_STAGE",
      stage: "SIMULATION",
      producer: "live_executor",
      payload: {
        endpointResolution: true,
        purpose: "simulation",
        requireDedicated: true,
        provider: "SOLANA_RPC_URL",
        publicFallbackUsed: false,
        rejectedAsPublic: [],
        configuredProvidersPresent: ["SOLANA_RPC_URL"]
      }
    }
  ]);

  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const a4 = evidence.a4Evidence;
  assert.strictEqual(a4.rpcConfigured, true);
  assert.strictEqual(a4.statusHint, re.A4_STATUS.CONFIGURED_UNVERIFIED);
  assert.notStrictEqual(a4.statusHint, "A4_VERIFIED_DEDICATED");
  assert.strictEqual(a4.rpcProviderLabel, "solana_rpc_url_configured");
  assert.strictEqual(a4.rpcEndpointClass, "dedicated");
  assert.strictEqual(a4.rpcSource, "SOLANA_RPC_URL");
  assert.strictEqual(a4.refusalActive, false);
  assert.deepStrictEqual(a4.configuredProvidersPresent, ["solana_rpc_url_configured"]);
});

// 3. Public fallback detected → flagged, no live readiness implied.
test("a4_public_fallback_detected", (root) => {
  writeAudit(root, [
    {
      timestamp: minutesAgo(1),
      eventType: "EXECUTION_STAGE",
      stage: "BALANCE_CHECK",
      producer: "live_executor",
      payload: {
        endpointResolution: true,
        purpose: "balance",
        requireDedicated: false,
        provider: "PUBLIC_FALLBACK",
        publicFallbackUsed: true,
        rejectedAsPublic: [],
        configuredProvidersPresent: []
      }
    }
  ]);

  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const a4 = evidence.a4Evidence;
  assert.strictEqual(a4.publicFallbackDetected, true);
  assert.strictEqual(a4.statusHint, re.A4_STATUS.FALLBACK_DETECTED);
  assert.strictEqual(a4.rpcEndpointClass, "public");
  assert.strictEqual(a4.confidence, "high");
});

// 4. Secret-shaped values must never appear in a4Evidence.
test("a4_secret_not_logged_or_returned", (root) => {
  const FAKE_URL = "https://mainnet.helius-rpc.com/?api-key=FAKE_SECRET_abc123";
  const FAKE_KEY = "FAKE_SECRET_abc123";
  writeAudit(root, [
    {
      timestamp: minutesAgo(1),
      eventType: "EXECUTION_STAGE",
      stage: "SIMULATION",
      producer: "live_executor",
      payload: {
        endpointResolution: true,
        purpose: "simulation",
        requireDedicated: true,
        // Hostile/malformed row: provider carries a raw URL, plus stray fields.
        provider: FAKE_URL,
        endpoint: FAKE_URL,
        apiKey: FAKE_KEY,
        publicFallbackUsed: false,
        configuredProvidersPresent: [FAKE_URL, "HELIUS_API_KEY=" + FAKE_KEY]
      }
    }
  ]);

  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const a4 = evidence.a4Evidence;
  assertNoSecretLeak(a4, [FAKE_URL, FAKE_KEY, "api-key", "://"]);
  // Unmapped/hostile provider must collapse to a safe label.
  assert.strictEqual(a4.rpcProviderLabel, "unknown");
  assert.deepStrictEqual(a4.configuredProvidersPresent, ["unknown", "unknown"]);
  assert.strictEqual(a4.secretExposureRisk, "none_observed");
});

// 5. No A4 evidence at all → unknown, low confidence.
test("a4_unknown_when_no_evidence", (root) => {
  writeAudit(root, [
    { timestamp: minutesAgo(1), eventType: "EXECUTION_STAGE", stage: "QUOTE", producer: "live_executor", payload: {} }
  ]);

  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const a4 = evidence.a4Evidence;
  assert.strictEqual(a4.statusHint, re.A4_STATUS.UNKNOWN);
  assert.ok(a4.confidence === "low" || a4.confidence === "unknown", `expected low/unknown, got ${a4.confidence}`);
  assert.strictEqual(a4.rpcConfigured, null);
  assert.strictEqual(a4.refusalActive, false);
  assert.strictEqual(a4.secretExposureRisk, "none_observed");
});

// 6. No audit file at all → unknown (never a crash, never a guess).
test("a4_unknown_when_no_audit_file", (root) => {
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const a4 = evidence.a4Evidence;
  assert.strictEqual(a4.statusHint, re.A4_STATUS.UNKNOWN);
  assert.strictEqual(a4.rpcConfigured, null);
});

// 7. buildA4Evidence is a pure helper usable directly on synthetic rows.
test("a4_build_helper_is_pure", () => {
  const rows = [
    {
      timestamp: minutesAgo(1),
      payload: {
        endpointResolution: true,
        requireDedicated: true,
        provider: null,
        publicFallbackUsed: false,
        configuredProvidersPresent: []
      }
    }
  ];
  const a4a = re.buildA4Evidence(rows, { now: NOW });
  const a4b = re.buildA4Evidence(rows, { now: NOW });
  assert.deepStrictEqual(a4a, a4b, "same input must yield same output (pure)");
  assert.strictEqual(a4a.refusalActive, true);
});

// 8. Safe label mapping allowlist behaves as documented.
test("a4_safe_provider_label_allowlist", () => {
  assert.strictEqual(re.safeProviderLabel("HELIUS_RPC_URL"), "helius_rpc_url_configured");
  assert.strictEqual(re.safeProviderLabel("SOLANA_RPC_URL"), "solana_rpc_url_configured");
  assert.strictEqual(re.safeProviderLabel("HELIUS_API_KEY_DERIVED"), "helius_api_key_derived_configured");
  assert.strictEqual(re.safeProviderLabel("RPC_URL"), "legacy_rpc_url_ignored");
  assert.strictEqual(re.safeProviderLabel("https://secret.example/?api-key=x"), "unknown");
  assert.strictEqual(re.safeProviderLabel(null), "unknown");
});

// ─── A4.13 — read-only RPC proof event ingestion (fixture rows only) ──────────

// A CONFIGURED_UNVERIFIED resolution row so the base posture can be elevated.
function configuredRow(tsIso) {
  return {
    timestamp: tsIso,
    eventType: "EXECUTION_STAGE",
    stage: "SIMULATION",
    producer: "live_executor",
    payload: {
      endpointResolution: true,
      purpose: "simulation",
      requireDedicated: true,
      provider: "HELIUS_RPC_URL",
      publicFallbackUsed: false,
      rejectedAsPublic: [],
      configuredProvidersPresent: ["HELIUS_RPC_URL"]
    }
  };
}

// A safe, attributed proof row.
function proofRow(tsIso, overrides = {}) {
  return {
    timestamp: tsIso,
    eventType: "A4_READ_ONLY_RPC_PROOF",
    producer: "a4_rpc_proof",
    invocationContext: "a4_read_only_rpc_proof",
    payload: Object.assign({
      proofStatus: "READ_ONLY_RPC_OK",
      providerLabel: "helius_rpc_url_configured",
      endpointClass: "dedicated",
      method: "getSlot",
      slotObserved: true,
      slotValuePresent: true,
      latencyMsBucket: "<250ms",
      publicFallbackUsed: false,
      secretSafe: true,
      errorCode: null
    }, overrides)
  };
}

function proofReviewRow(tsIso, targetTsIso, overrides = {}) {
  return {
    timestamp: tsIso,
    eventType: "A4_PROOF_FAILURE_REVIEW",
    producer: "a4_proof_review",
    invocationContext: "a4_proof_failure_review",
    payload: Object.assign({
      reviewStatus: "accepted",
      classification: "sandbox_network_environment_noise",
      targetTimestamp: targetTsIso,
      targetProofStatus: "READ_ONLY_RPC_FAILED",
      targetProviderLabel: "helius_rpc_url_configured",
      targetEndpointClass: "dedicated",
      targetMethod: "getSlot",
      targetPublicFallbackUsed: false,
      targetSecretSafe: true,
      targetErrorCode: "RPC_NETWORK_ERROR",
      decisionRef: "RB-G10-A4-PROOF-FAILURE-REVIEW-2026-07-14",
      evidenceRef: "RB-G10-A4-PROOF-FAILURE-REVIEW-2026-07-14"
    }, overrides)
  };
}

// A4.13-1 — reads a safe, fresh, successful proof event and elevates posture.
test("runtime_evidence_reads_safe_a4_proof_event", (root) => {
  writeAudit(root, [configuredRow(minutesAgo(2)), proofRow(minutesAgo(1))]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const a4 = evidence.a4Evidence;
  assert.ok(a4.proof, "proof evidence should be present");
  assert.strictEqual(a4.proof.proofStatus, "READ_ONLY_RPC_OK");
  assert.strictEqual(a4.proof.freshness, "fresh");
  assert.strictEqual(a4.statusHint, re.A4_STATUS.READ_ONLY_RPC_VERIFIED);
  assert.notStrictEqual(a4.statusHint, "A4_VERIFIED_DEDICATED");
});

// A4.13-2 — ignores wrong producer.
test("runtime_evidence_ignores_wrong_producer", (root) => {
  const bad = proofRow(minutesAgo(1));
  bad.producer = "monitor";
  writeAudit(root, [configuredRow(minutesAgo(2)), bad]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const a4 = evidence.a4Evidence;
  assert.strictEqual(a4.proof, null, "wrong-producer row must not produce proof evidence");
  assert.strictEqual(a4.statusHint, re.A4_STATUS.CONFIGURED_UNVERIFIED);
});

// A4.13-3 — ignores wrong eventType.
test("runtime_evidence_ignores_wrong_event_type", (root) => {
  const bad = proofRow(minutesAgo(1));
  bad.eventType = "EXECUTION_STAGE";
  writeAudit(root, [configuredRow(minutesAgo(2)), bad]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const a4 = evidence.a4Evidence;
  assert.strictEqual(a4.proof, null, "wrong-eventType row must not produce proof evidence");
  assert.strictEqual(a4.statusHint, re.A4_STATUS.CONFIGURED_UNVERIFIED);
});

// A4.13-4 — rejects proof rows carrying secret-like / forbidden fields.
test("runtime_evidence_rejects_secret_like_fields", (root) => {
  const FAKE = "https://secret.example/?api-key=FAKE_SECRET";
  const hostile = proofRow(minutesAgo(1), {});
  hostile.payload.endpoint = FAKE; // forbidden field
  writeAudit(root, [configuredRow(minutesAgo(2)), hostile]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const a4 = evidence.a4Evidence;
  assert.strictEqual(a4.proof, null, "hostile proof row must be rejected");
  assert.strictEqual(a4.secretExposureRisk, "proof_event_forbidden_field_detected");
  assertNoSecretLeak(a4, [FAKE, "api-key", "://", "FAKE_SECRET"]);
  // Rejected proof must not elevate posture.
  assert.strictEqual(a4.statusHint, re.A4_STATUS.CONFIGURED_UNVERIFIED);
});

// A4.13-5 — marks proof stale beyond the freshness window.
test("runtime_evidence_marks_stale_proof", (root) => {
  writeAudit(root, [configuredRow(minutesAgo(2)), proofRow(minutesAgo(60 * 25))]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const a4 = evidence.a4Evidence;
  assert.ok(a4.proof, "stale proof still surfaced for visibility");
  assert.strictEqual(a4.proof.freshness, "stale");
  assert.strictEqual(a4.statusHint, re.A4_STATUS.PROOF_STALE);
});

// A4.13-6 — a fresh proof must NOT promote a not-configured posture.
test("runtime_evidence_does_not_override_not_configured_with_old_proof", (root) => {
  const notConfigured = {
    timestamp: minutesAgo(3),
    eventType: "EXECUTION_STAGE",
    stage: "SIMULATION",
    producer: "live_executor",
    payload: {
      endpointResolution: true,
      requireDedicated: true,
      provider: null,
      publicFallbackUsed: false,
      rejectedAsPublic: [],
      configuredProvidersPresent: [],
      message: "Dedicated RPC endpoint required; public mainnet-beta fallback refused."
    }
  };
  writeAudit(root, [notConfigured, proofRow(minutesAgo(1))]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const a4 = evidence.a4Evidence;
  assert.ok(
    a4.statusHint === re.A4_STATUS.NOT_CONFIGURED || a4.statusHint === re.A4_STATUS.REFUSAL_ACTIVE,
    `not-configured posture must not be promoted by proof, got ${a4.statusHint}`
  );
  assert.notStrictEqual(a4.statusHint, re.A4_STATUS.READ_ONLY_RPC_VERIFIED);
});

// A4.13-7 — failed proof maps posture to PROOF_FAILED.
test("runtime_evidence_maps_failed_proof", (root) => {
  writeAudit(root, [
    configuredRow(minutesAgo(2)),
    proofRow(minutesAgo(1), { proofStatus: "READ_ONLY_RPC_FAILED", slotObserved: false, slotValuePresent: false, latencyMsBucket: "unknown", errorCode: "RPC_TIMEOUT" })
  ]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const a4 = evidence.a4Evidence;
  assert.strictEqual(a4.statusHint, re.A4_STATUS.PROOF_FAILED);
  assert.strictEqual(a4.proof.errorCode, "RPC_TIMEOUT");
});

// ─── A4.18 — stability evidence (multi-proof) tests (fixtures only) ───────────

// A4.18-1 — one success only → not a stability candidate.
test("stability_requires_two_successes", (root) => {
  writeAudit(root, [configuredRow(minutesAgo(30)), proofRow(minutesAgo(1))]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const st = evidence.a4Evidence.proofStability;
  assert.ok(st, "proofStability present");
  assert.strictEqual(st.freshSuccessCount, 1);
  assert.strictEqual(st.stabilityCandidate, false);
});

// A4.18-2 — two time-separated successes ≥15 min apart → candidate true.
test("stability_detects_two_time_separated_successes", (root) => {
  writeAudit(root, [configuredRow(minutesAgo(40)), proofRow(minutesAgo(30)), proofRow(minutesAgo(1))]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const st = evidence.a4Evidence.proofStability;
  assert.strictEqual(st.freshSuccessCount, 2);
  assert.strictEqual(st.providerConsistent, true);
  assert.strictEqual(st.endpointClassConsistent, true);
  assert.strictEqual(st.separationBucket, ">=15m");
  assert.strictEqual(st.fallbackObserved, false);
  assert.strictEqual(st.failureObserved, false);
  assert.strictEqual(st.secretSafe, true);
  assert.strictEqual(st.stabilityCandidate, true);
});

// A4.18-3 — two successes < 15 min apart → candidate false.
test("stability_requires_time_separation", (root) => {
  writeAudit(root, [configuredRow(minutesAgo(20)), proofRow(minutesAgo(10)), proofRow(minutesAgo(1))]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const st = evidence.a4Evidence.proofStability;
  assert.strictEqual(st.freshSuccessCount, 2);
  assert.strictEqual(st.separationBucket, "<15m");
  assert.strictEqual(st.stabilityCandidate, false);
});

// A4.18-4 — mismatched provider label → candidate false.
test("stability_rejects_mismatched_provider_label", (root) => {
  writeAudit(root, [
    configuredRow(minutesAgo(40)),
    proofRow(minutesAgo(30), { providerLabel: "solana_rpc_url_configured" }),
    proofRow(minutesAgo(1), { providerLabel: "helius_rpc_url_configured" })
  ]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const st = evidence.a4Evidence.proofStability;
  assert.strictEqual(st.providerConsistent, false);
  assert.strictEqual(st.stabilityCandidate, false);
});

// A4.18-5 — mismatched endpoint class → candidate false.
test("stability_rejects_mismatched_endpoint_class", (root) => {
  writeAudit(root, [
    configuredRow(minutesAgo(40)),
    proofRow(minutesAgo(30), { endpointClass: "unknown" }),
    proofRow(minutesAgo(1), { endpointClass: "dedicated" })
  ]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const st = evidence.a4Evidence.proofStability;
  // The "unknown"-class row is excluded from fresh successes (dedicated-only),
  // leaving a single fresh success → not a candidate.
  assert.strictEqual(st.stabilityCandidate, false);
});

// A4.18-6 — non-dedicated endpoint class excluded → candidate false.
test("stability_requires_dedicated_endpoint_class", (root) => {
  writeAudit(root, [
    configuredRow(minutesAgo(40)),
    proofRow(minutesAgo(30), { endpointClass: "public", publicFallbackUsed: false }),
    proofRow(minutesAgo(1), { endpointClass: "public", publicFallbackUsed: false })
  ]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const st = evidence.a4Evidence.proofStability;
  assert.strictEqual(st.freshSuccessCount, 0, "public-class successes are not counted as dedicated");
  assert.strictEqual(st.stabilityCandidate, false);
});

// A4.18-7 — public fallback observed → candidate false.
test("stability_rejects_public_fallback", (root) => {
  writeAudit(root, [
    configuredRow(minutesAgo(40)),
    proofRow(minutesAgo(30)),
    proofRow(minutesAgo(1), { publicFallbackUsed: true })
  ]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const st = evidence.a4Evidence.proofStability;
  assert.strictEqual(st.fallbackObserved, true);
  assert.strictEqual(st.stabilityCandidate, false);
});

// A4.18-8 — failure between successes → candidate false.
test("stability_rejects_failure_between_successes", (root) => {
  writeAudit(root, [
    configuredRow(minutesAgo(50)),
    proofRow(minutesAgo(40)),
    proofRow(minutesAgo(20), { proofStatus: "READ_ONLY_RPC_FAILED", slotObserved: false, slotValuePresent: false, latencyMsBucket: "unknown", errorCode: "RPC_TIMEOUT" }),
    proofRow(minutesAgo(1))
  ]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const st = evidence.a4Evidence.proofStability;
  assert.strictEqual(st.failureObserved, true);
  assert.strictEqual(st.stabilityCandidate, false);
});

// A4.18-9 — secret-unsafe (forbidden field) proof event → candidate false + flagged.
test("stability_rejects_secret_unsafe_event", (root) => {
  const hostile = proofRow(minutesAgo(1));
  hostile.payload.endpoint = "https://secret.example/?api-key=FAKE_SECRET";
  writeAudit(root, [configuredRow(minutesAgo(40)), proofRow(minutesAgo(30)), hostile]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const st = evidence.a4Evidence.proofStability;
  // The hostile row is dropped (secretRisk); only one clean fresh success remains.
  assert.strictEqual(st.secretSafe, false);
  assert.strictEqual(st.stabilityCandidate, false);
  assertNoSecretLeak(st, ["secret.example", "api-key", "://", "FAKE_SECRET"]);
});

// A4.18-10 — wrong producer/eventType ignored for stability.
test("stability_ignores_wrong_producer_or_event_type", (root) => {
  const badProducer = proofRow(minutesAgo(30)); badProducer.producer = "monitor";
  const badType = proofRow(minutesAgo(20)); badType.eventType = "EXECUTION_STAGE";
  writeAudit(root, [configuredRow(minutesAgo(40)), badProducer, badType, proofRow(minutesAgo(1))]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const st = evidence.a4Evidence.proofStability;
  assert.strictEqual(st.freshSuccessCount, 1, "only the valid proof row counts");
  assert.strictEqual(st.stabilityCandidate, false);
});

// A4.18-11 — stale proofs outside 24h window not counted.
test("stability_marks_stale_proofs_outside_24h", (root) => {
  writeAudit(root, [
    configuredRow(minutesAgo(60 * 30)),
    proofRow(minutesAgo(60 * 26)),
    proofRow(minutesAgo(60 * 25))
  ]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const st = evidence.a4Evidence.proofStability;
  assert.strictEqual(st.freshSuccessCount, 0, "stale successes excluded from fresh count");
  assert.strictEqual(st.stabilityCandidate, false);
});

// A4.18-12 — stability summary never exposes secret-like fields.
test("stability_does_not_expose_secret_like_fields", (root) => {
  writeAudit(root, [configuredRow(minutesAgo(40)), proofRow(minutesAgo(30)), proofRow(minutesAgo(1))]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const st = evidence.a4Evidence.proofStability;
  const allowed = new Set([
    "successCount", "freshSuccessCount", "firstProofAt", "latestProofAt",
    "separationBucket", "providerConsistent", "endpointClassConsistent",
    "providerLabel", "endpointClass", "fallbackObserved", "failureObserved",
    "unremediatedFailureObserved", "reviewedFailureCount",
    "secretSafe", "withinFreshnessWindow", "stabilityCandidate", "threshold"
  ]);
  for (const k of Object.keys(st)) assert.ok(allowed.has(k), `unexpected stability field: ${k}`);
  assertNoSecretLeak(st, ["://", "api-key"]);
});

// ─── A4.21 — targeted bounded proof-scan visibility tests (fixtures only) ─────

// A noisy monitor/live_executor audit row (not a proof row).
function noiseRow(tsIso, i = 0) {
  return {
    timestamp: tsIso,
    eventType: "EXECUTION_STAGE",
    stage: "STATUS",
    producer: "live_executor",
    invocationContext: "executor_status",
    payload: { note: "monitor-driven status row", seq: i }
  };
}

// A4.21-1 — proof rows buried beyond the generic tail are found by the scan.
test("proof_rows_beyond_default_tail_are_discovered_by_targeted_scan", (root) => {
  const rows = [
    configuredRow(minutesAgo(120)),
    proofRow(minutesAgo(40)),
    proofRow(minutesAgo(20))
  ];
  // 200 noisy rows AFTER the proofs → default 50-row tail would miss both.
  for (let i = 0; i < 200; i += 1) rows.push(noiseRow(minutesAgo(19 - i * 0.05), i));
  writeAudit(root, rows);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const a4 = evidence.a4Evidence;
  assert.strictEqual(a4.proofStability.freshSuccessCount, 2, "targeted scan should surface both proofs");
  assert.strictEqual(a4.proofStability.stabilityCandidate, true);
  assert.strictEqual(a4.proofScan.available, true);
  assert.strictEqual(a4.proofScan.errorCode, null);
});

// A4.21-2 — generic audit tail default remains small (50).
test("generic_tail_limit_remains_small", () => {
  assert.strictEqual(re.DEFAULT_AUDIT_TAIL_LIMIT, 50);
  assert.strictEqual(re.DEFAULT_A4_PROOF_SCAN_LIMIT, 5000);
});

// A4.21-3 — targeted scan keeps only a4_rpc_proof / A4_READ_ONLY_RPC_PROOF rows.
test("targeted_scan_filters_only_a4_rpc_proof_events", (root) => {
  const badProducer = proofRow(minutesAgo(40)); badProducer.producer = "monitor";
  const badType = proofRow(minutesAgo(30)); badType.eventType = "EXECUTION_STAGE";
  const rows = [configuredRow(minutesAgo(120)), badProducer, badType, proofRow(minutesAgo(20))];
  for (let i = 0; i < 100; i += 1) rows.push(noiseRow(minutesAgo(19 - i * 0.05), i));
  writeAudit(root, rows);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  assert.strictEqual(evidence.a4Evidence.proofStability.freshSuccessCount, 1, "only the valid proof row counts");
});

// A4.21-4 — the same proof row in both windows is counted once (dedupe).
test("targeted_scan_merges_without_duplicates", () => {
  const p1 = proofRow(minutesAgo(40));
  const p2 = proofRow(minutesAgo(20));
  // Generic tail (rows) already contains both; scan supplies the same two again.
  const genericRows = [configuredRow(minutesAgo(120)), p1, p2];
  const scanRows = [p1, p2];
  const ev = re.buildA4Evidence(genericRows, { now: NOW, a4ProofRows: scanRows, proofScan: { available: true, limit: 5000, errorCode: null } });
  assert.strictEqual(ev.proofStability.freshSuccessCount, 2, "duplicate proof rows must not double-count");
  assert.strictEqual(ev.proofStability.stabilityCandidate, true);
});

// A4.21-5 — secret-like fields in a scanned proof row are rejected, not echoed.
test("targeted_scan_rejects_secret_like_fields", (root) => {
  const hostile = proofRow(minutesAgo(20));
  hostile.payload.endpoint = "https://mainnet.helius-rpc.com/?api-key=FAKE_SECRET";
  const rows = [configuredRow(minutesAgo(120)), proofRow(minutesAgo(40)), hostile];
  for (let i = 0; i < 100; i += 1) rows.push(noiseRow(minutesAgo(19 - i * 0.05), i));
  writeAudit(root, rows);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const a4 = evidence.a4Evidence;
  assert.strictEqual(a4.secretExposureRisk, "proof_event_forbidden_field_detected");
  assert.strictEqual(a4.proofStability.stabilityCandidate, false, "secret-bearing row must not count toward stability");
  assertNoSecretLeak(a4, ["helius-rpc.com", "api-key", "://", "FAKE_SECRET"]);
});

// A4.21-6 — proof rows outside the bounded scan window are not discovered.
test("targeted_scan_respects_bounded_limit", (root) => {
  const rows = [configuredRow(minutesAgo(200)), proofRow(minutesAgo(190)), proofRow(minutesAgo(180))];
  for (let i = 0; i < 60; i += 1) rows.push(noiseRow(minutesAgo(170 - i * 0.05), i));
  writeAudit(root, rows);
  // Tiny scan window (10 lines) cannot reach the two proofs near the top.
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW, a4ProofScanLimit: 10 });
  const a4 = evidence.a4Evidence;
  assert.strictEqual(a4.proofStability.freshSuccessCount, 0, "proofs outside the bounded window must stay hidden");
  assert.strictEqual(a4.proofStability.stabilityCandidate, false);
});

// A4.21-7 — a scan read/parse failure fails safe (no throw; safe error code).
test("targeted_scan_failure_fails_safe", (root) => {
  writeAudit(root, [configuredRow(minutesAgo(120)), proofRow(minutesAgo(40)), proofRow(minutesAgo(20))]);
  const boom = () => { const e = new Error("simulated read failure"); e.__a4ProofScanCode = "A4_PROOF_SCAN_READ_ERROR"; throw e; };
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW, a4ProofScanReader: boom });
  const a4 = evidence.a4Evidence;
  assert.strictEqual(a4.proofScan.available, false);
  assert.strictEqual(a4.proofScan.errorCode, "A4_PROOF_SCAN_READ_ERROR");
  // Generic tail still had the proofs here, but the failure must not throw.
  assert.ok(a4.proofStability, "proofStability present even on scan failure");
});

// A4.21-8 — stability never overrides NOT_CONFIGURED. The blocker is visible in
// the generic tail; the two proofs are only reachable via the targeted scan.
test("targeted_scan_does_not_override_not_configured", () => {
  const notConfigured = {
    timestamp: minutesAgo(5), eventType: "EXECUTION_STAGE", stage: "SIMULATION",
    producer: "live_executor",
    payload: { endpointResolution: true, requireDedicated: true, provider: null, publicFallbackUsed: false, configuredProvidersPresent: [], message: "Dedicated RPC endpoint required; public mainnet-beta fallback refused." }
  };
  const scanRows = [proofRow(minutesAgo(40)), proofRow(minutesAgo(20))];
  const a4 = re.buildA4Evidence([notConfigured], { now: NOW, a4ProofRows: scanRows, proofScan: { available: true, limit: 5000, errorCode: null } });
  assert.ok(a4.statusHint === re.A4_STATUS.NOT_CONFIGURED || a4.statusHint === re.A4_STATUS.REFUSAL_ACTIVE,
    `not-configured/refusal must win, got ${a4.statusHint}`);
});

// A4.21-9 — stability never overrides FALLBACK_DETECTED (blocker in generic
// tail; proofs only via targeted scan).
test("targeted_scan_does_not_override_fallback_detected", () => {
  const fallback = {
    timestamp: minutesAgo(5), eventType: "EXECUTION_STAGE", stage: "SUBMIT",
    producer: "live_executor",
    payload: { endpointResolution: true, requireDedicated: false, provider: "PUBLIC_FALLBACK", publicFallbackUsed: true, configuredProvidersPresent: ["HELIUS_RPC_URL"] }
  };
  const scanRows = [proofRow(minutesAgo(40)), proofRow(minutesAgo(20))];
  const a4 = re.buildA4Evidence([fallback], { now: NOW, a4ProofRows: scanRows, proofScan: { available: true, limit: 5000, errorCode: null } });
  assert.strictEqual(a4.statusHint, re.A4_STATUS.FALLBACK_DETECTED);
});

// A4.21-10 — scanned evidence never exposes raw rows/urls in a4Evidence.
test("targeted_scan_does_not_expose_raw_rows_or_urls", (root) => {
  const rows = [configuredRow(minutesAgo(120)), proofRow(minutesAgo(40)), proofRow(minutesAgo(20))];
  for (let i = 0; i < 100; i += 1) rows.push(noiseRow(minutesAgo(19 - i * 0.05), i));
  writeAudit(root, rows);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  assertNoSecretLeak(evidence.a4Evidence, ["://", "api-key", "monitor-driven status row"]);
  assert.ok(!Array.isArray(evidence.a4Evidence.proofScan), "proofScan is a summary object, not raw rows");
});

// ─── A4.25 — targeted bounded A4 approval-event scan ──────────────────────────

const a4Approval = require("./a4_approval");

function approvalRow(tsIso, overrides = {}) {
  return a4Approval.buildA4ApprovalAuditEvent(Object.assign({
    approver: "Taylor",
    approvalStatus: "approved",
    decisionRef: a4Approval.A4_APPROVAL_DEFAULT_DECISION_REF,
    evidenceRef: "helius_rpc_url_configured:dedicated",
    approvedAtIso: tsIso,
    scopeNote: "stability-evidence-only"
  }, overrides), { timestamp: tsIso });
}

// A4.25-1 — reads a valid approval event via targeted scan.
test("targeted_approval_scan_discovers_valid_event", (root) => {
  const rows = [configuredRow(minutesAgo(120)), proofRow(minutesAgo(40)), proofRow(minutesAgo(20)), approvalRow(minutesAgo(1))];
  for (let i = 0; i < 100; i += 1) rows.push(noiseRow(minutesAgo(19 - i * 0.05), i));
  writeAudit(root, rows);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const a4 = evidence.a4Evidence;
  assert.strictEqual(a4.approvalScan.available, true);
  assert.strictEqual(a4.approval.present, true);
  assert.strictEqual(a4.approval.approved, true);
  assert.strictEqual(a4.approval.evidenceRefConsistent, true);
  assert.strictEqual(a4.approval.approver, "Taylor");
  assertNoSecretLeak(a4, ["stability-evidence-only"]);
});

// A4.25-2 — buildA4ApprovalEvidence rejects secret-like fields.
test("targeted_approval_scan_rejects_secret_like_fields", (root) => {
  const hostile = approvalRow(minutesAgo(1));
  hostile.payload.endpoint = "https://mainnet.helius-rpc.com/?api-key=FAKE_SECRET";
  writeAudit(root, [configuredRow(minutesAgo(120)), proofRow(minutesAgo(40)), proofRow(minutesAgo(20)), hostile]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const a4 = evidence.a4Evidence;
  assert.strictEqual(a4.secretExposureRisk, "approval_event_forbidden_field_detected");
  assert.strictEqual(a4.approval.approved, false);
  assertNoSecretLeak(a4, ["helius-rpc.com", "api-key", "://", "FAKE_SECRET"]);
});

// A4.25-3 — revoked approval is not trusted.
test("targeted_approval_scan_honors_revocation", (root) => {
  writeAudit(root, [
    configuredRow(minutesAgo(120)), proofRow(minutesAgo(40)), proofRow(minutesAgo(20)),
    approvalRow(minutesAgo(10), { approvalStatus: "approved" }),
    approvalRow(minutesAgo(1), { approvalStatus: "revoked" })
  ]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  assert.strictEqual(evidence.a4Evidence.approval.status, "revoked");
  assert.strictEqual(evidence.a4Evidence.approval.approved, false);
});

// A4.25-4 — approval scan failure fails safe.
test("targeted_approval_scan_failure_fails_safe", (root) => {
  writeAudit(root, [configuredRow(minutesAgo(120)), proofRow(minutesAgo(40)), proofRow(minutesAgo(20)), approvalRow(minutesAgo(1))]);
  const boom = () => { const e = new Error("simulated read failure"); e.__a4ApprovalScanCode = "A4_APPROVAL_SCAN_READ_ERROR"; throw e; };
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW, a4ApprovalScanReader: boom });
  assert.strictEqual(evidence.a4Evidence.approvalScan.available, false);
  assert.strictEqual(evidence.a4Evidence.approvalScan.errorCode, "A4_APPROVAL_SCAN_READ_ERROR");
});

// A4.25-5 — evidenceRef mismatch flagged.
test("targeted_approval_scan_flags_evidence_ref_mismatch", () => {
  const scanRows = [approvalRow(minutesAgo(1), { evidenceRef: "wrong:ref" })];
  const a4 = re.buildA4Evidence([configuredRow(minutesAgo(5))], {
    now: NOW,
    a4ProofRows: [proofRow(minutesAgo(40)), proofRow(minutesAgo(20))],
    proofScan: { available: true, limit: 5000, errorCode: null },
    a4ApprovalRows: scanRows,
    approvalScan: { available: true, limit: 5000, errorCode: null }
  });
  assert.strictEqual(a4.approval.evidenceRefConsistent, false);
  assert.strictEqual(a4.approval.approved, true, "approved status but inconsistent ref");
});

// RB-G10 — accepted sandbox/network review remediates the exact failed proof
// for stability candidacy without hiding that a failure was observed.
test("stability_accepts_reviewed_sandbox_network_failure", (root) => {
  const failureAt = minutesAgo(20);
  writeAudit(root, [
    configuredRow(minutesAgo(50)),
    proofRow(minutesAgo(40)),
    proofRow(failureAt, {
      proofStatus: "READ_ONLY_RPC_FAILED",
      slotObserved: false,
      slotValuePresent: false,
      errorCode: "RPC_NETWORK_ERROR"
    }),
    proofReviewRow(minutesAgo(19), failureAt),
    proofRow(minutesAgo(1))
  ]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const st = evidence.a4Evidence.proofStability;
  assert.strictEqual(st.failureObserved, true);
  assert.strictEqual(st.unremediatedFailureObserved, false);
  assert.strictEqual(st.reviewedFailureCount, 1);
  assert.strictEqual(st.stabilityCandidate, true);
});

test("stability_rejects_review_target_mismatch", (root) => {
  const failureAt = minutesAgo(20);
  writeAudit(root, [
    configuredRow(minutesAgo(50)),
    proofRow(minutesAgo(40)),
    proofRow(failureAt, {
      proofStatus: "READ_ONLY_RPC_FAILED",
      slotObserved: false,
      slotValuePresent: false,
      errorCode: "RPC_NETWORK_ERROR"
    }),
    proofReviewRow(minutesAgo(19), minutesAgo(21)),
    proofRow(minutesAgo(1))
  ]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const st = evidence.a4Evidence.proofStability;
  assert.strictEqual(st.failureObserved, true);
  assert.strictEqual(st.unremediatedFailureObserved, true);
  assert.strictEqual(st.reviewedFailureCount, 0);
  assert.strictEqual(st.stabilityCandidate, false);
});

test("stability_rejects_review_for_non_network_failure", (root) => {
  const failureAt = minutesAgo(20);
  writeAudit(root, [
    configuredRow(minutesAgo(50)),
    proofRow(minutesAgo(40)),
    proofRow(failureAt, {
      proofStatus: "READ_ONLY_RPC_FAILED",
      slotObserved: false,
      slotValuePresent: false,
      errorCode: "RPC_TIMEOUT"
    }),
    proofReviewRow(minutesAgo(19), failureAt, { targetErrorCode: "RPC_TIMEOUT" }),
    proofRow(minutesAgo(1))
  ]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const st = evidence.a4Evidence.proofStability;
  assert.strictEqual(st.unremediatedFailureObserved, true);
  assert.strictEqual(st.reviewedFailureCount, 0);
  assert.strictEqual(st.stabilityCandidate, false);
});

test("stability_rejects_review_for_public_fallback_failure", (root) => {
  const failureAt = minutesAgo(20);
  writeAudit(root, [
    configuredRow(minutesAgo(50)),
    proofRow(minutesAgo(40)),
    proofRow(failureAt, {
      proofStatus: "READ_ONLY_RPC_FAILED",
      slotObserved: false,
      slotValuePresent: false,
      publicFallbackUsed: true,
      errorCode: "RPC_NETWORK_ERROR"
    }),
    proofReviewRow(minutesAgo(19), failureAt, { targetPublicFallbackUsed: true }),
    proofRow(minutesAgo(1))
  ]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const st = evidence.a4Evidence.proofStability;
  assert.strictEqual(st.fallbackObserved, true);
  assert.strictEqual(st.unremediatedFailureObserved, true);
  assert.strictEqual(st.stabilityCandidate, false);
});

test("stability_rejects_secret_shaped_review_event", (root) => {
  const failureAt = minutesAgo(20);
  const hostile = proofReviewRow(minutesAgo(19), failureAt);
  hostile.payload.endpoint = "https://mainnet.helius-rpc.com/?api-key=FAKE_SECRET";
  writeAudit(root, [
    configuredRow(minutesAgo(50)),
    proofRow(minutesAgo(40)),
    proofRow(failureAt, {
      proofStatus: "READ_ONLY_RPC_FAILED",
      slotObserved: false,
      slotValuePresent: false,
      errorCode: "RPC_NETWORK_ERROR"
    }),
    hostile,
    proofRow(minutesAgo(1))
  ]);
  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const st = evidence.a4Evidence.proofStability;
  assert.strictEqual(st.secretSafe, false);
  assert.strictEqual(st.unremediatedFailureObserved, true);
  assert.strictEqual(st.stabilityCandidate, false);
  assertNoSecretLeak(st, ["helius-rpc.com", "api-key", "://", "FAKE_SECRET"]);
});

console.log("");
console.log(`a4 runtime_evidence tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
