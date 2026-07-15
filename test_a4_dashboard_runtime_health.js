"use strict";

// ─── Vulcan A4.4 — Tests for Dashboard Runtime Health A4 Display ───────────────
//
// Exercises the exported, read-only builder `buildVulcanRuntimeHealth` WITHOUT
// starting the dashboard HTTP server. All evidence comes from isolated temp
// fixtures or from monkeypatching the classifier's a4Health output. No real
// runtime files, no `.env`, no network, no processes, no secrets, no live
// endpoint queries. Principle: Visibility is not authority.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Isolate any import-time runtime root away from real files before requiring
// the dashboard (which transitively requires live_executor et al.).
const IMPORT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "vulcan-a44-import-"));
process.env.TRACKTA_RUNTIME_ROOT = IMPORT_ROOT;

const dashboard = require("./dashboard_server");
const runtimeHealthModule = require("./runtime_health");

const NOW = "2026-07-02T23:59:00.000Z";
const NOW_MS = Date.parse(NOW);
const minutesAgo = (m) => new Date(NOW_MS - m * 60 * 1000).toISOString();

const READY_WORDS = ["live ready", "live-ready", "safe to trade", "approved", "armed", "resolved", "cleared"];

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vulcan-a44-"));
}
function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
}
function writeFile(root, name, contents) {
  fs.writeFileSync(path.join(root, name), contents);
}

// Run the builder with a temporarily-patched classifier result, then restore.
function withClassifierResult(result, fn) {
  const original = runtimeHealthModule.classifyRuntimeHealth;
  runtimeHealthModule.classifyRuntimeHealth = () => result;
  try {
    return fn();
  } finally {
    runtimeHealthModule.classifyRuntimeHealth = original;
  }
}
function withClassifierThrow(fn) {
  const original = runtimeHealthModule.classifyRuntimeHealth;
  runtimeHealthModule.classifyRuntimeHealth = () => { throw new Error("synthetic classifier failure"); };
  try {
    return fn();
  } finally {
    runtimeHealthModule.classifyRuntimeHealth = original;
  }
}

// Minimal well-formed classifier result carrying a given a4Health.
function resultWith(a4Health) {
  return {
    classification: "CAPITAL_SAFE_BUT_RUNTIME_AMBIGUOUS",
    severity: "warning",
    summary: "synthetic",
    evidenceUsed: [],
    missingEvidence: [],
    // Top-level warnings in the real system are always safe enumerated
    // constants; keep only allowlisted A4 IDs here so this helper never injects
    // secret-shaped strings into the passthrough warnings array.
    warnings: (Array.isArray(a4Health && a4Health.warnings) ? a4Health.warnings : [])
      .filter((w) => ["A4_UNKNOWN", "A4_NOT_CONFIGURED", "A4_REFUSAL_ACTIVE", "A4_CONFIGURED_UNVERIFIED", "A4_FALLBACK_DETECTED"].includes(w)),
    supportsSoakClaim: false,
    supportsLiveReadiness: false,
    a4Health,
    recommendedOperatorAction: "synthetic",
    dashboardWording: "Runtime health classification: needs review. Live readiness not supported.",
    details: { exposure: "none", executorLoopConfirmed: false, monitorDriven: false }
  };
}

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

// 1. Endpoint builder exposes structured a4Health.
test("runtime_health_endpoint_exposes_a4Health", () => {
  const root = makeRoot();
  try {
    writeFile(root, "live_positions.json", JSON.stringify([]));
    const rh = dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW });
    assert.ok(rh.a4Health && typeof rh.a4Health === "object", "a4Health present");
    for (const field of [
      "status", "severity", "blockerActive", "rpcRequired", "rpcConfigured",
      "publicFallbackDetected", "refusalActive", "refusalReason", "providerLabel",
      "endpointClass", "confidence", "warnings", "recommendedAction",
      "supportsLiveReadiness", "supportsSoakClaim"
    ]) {
      assert.ok(Object.prototype.hasOwnProperty.call(rh.a4Health, field), `a4Health missing field: ${field}`);
    }
    // No real A4 evidence in temp root → conservative unknown.
    assert.strictEqual(rh.a4Health.status, "A4_UNKNOWN");
    assert.strictEqual(rh.a4Health.blockerActive, true);
  } finally {
    cleanup(root);
  }
});

// 2. Endpoint builder exposes safe a4Summary.
test("runtime_health_endpoint_exposes_a4Summary", () => {
  const root = makeRoot();
  try {
    writeFile(root, "live_positions.json", JSON.stringify([]));
    const rh = dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW });
    assert.ok(rh.a4Summary && typeof rh.a4Summary === "object", "a4Summary present");
    for (const field of ["status", "severity", "label", "operatorMessage"]) {
      assert.ok(Object.prototype.hasOwnProperty.call(rh.a4Summary, field), `a4Summary missing field: ${field}`);
    }
    assert.strictEqual(rh.a4Summary.status, rh.a4Health.status, "summary mirrors health status");
  } finally {
    cleanup(root);
  }
});

// 3. Secret-shaped values in a4Health never reach the display output.
test("a4Health_omits_raw_secrets", () => {
  const FAKE_URL = "https://mainnet.helius-rpc.com/?api-key=FAKE_SECRET_abc123";
  const FAKE_KEY = "FAKE_SECRET_abc123";
  const hostile = {
    status: "A4_CONFIGURED_UNVERIFIED",
    severity: "warning",
    blockerActive: true,
    rpcRequired: true,
    rpcConfigured: true,
    publicFallbackDetected: false,
    refusalActive: false,
    refusalReason: FAKE_KEY,
    providerLabel: FAKE_URL,
    endpointClass: FAKE_URL,
    confidence: FAKE_KEY,
    warnings: ["A4_CONFIGURED_UNVERIFIED", FAKE_URL],
    recommendedAction: FAKE_URL,
    supportsLiveReadiness: true, // hostile: must be forced false
    supportsSoakClaim: true      // hostile: must be forced false
  };
  const root = makeRoot();
  try {
    writeFile(root, "live_positions.json", JSON.stringify([]));
    const rh = withClassifierResult(resultWith(hostile), () =>
      dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW }));
    const json = JSON.stringify(rh);
    for (const needle of [FAKE_URL, FAKE_KEY, "api-key", "://"]) {
      assert.ok(!json.includes(needle), `endpoint leaked forbidden value: ${needle}`);
    }
    assert.strictEqual(rh.a4Health.providerLabel, "unknown");
    assert.strictEqual(rh.a4Health.endpointClass, "unknown");
    assert.strictEqual(rh.a4Health.refusalReason, null);
    assert.strictEqual(rh.a4Health.confidence, "low");
    assert.deepStrictEqual(rh.a4Health.warnings, ["A4_CONFIGURED_UNVERIFIED"], "unsafe warning filtered out");
    assert.strictEqual(rh.a4Health.supportsLiveReadiness, false);
    assert.strictEqual(rh.a4Health.supportsSoakClaim, false);
  } finally {
    cleanup(root);
  }
});

// 4. Live readiness is never claimed (top-level and a4Health).
test("endpoint_preserves_supportsLiveReadiness_false", () => {
  const root = makeRoot();
  try {
    const hostile = { status: "A4_VERIFIED_DEDICATED", severity: "info", blockerActive: false, supportsLiveReadiness: true, warnings: [] };
    writeFile(root, "live_positions.json", JSON.stringify([]));
    const rh = withClassifierResult(resultWith(hostile), () =>
      dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW }));
    assert.strictEqual(rh.supportsLiveReadiness, false);
    assert.strictEqual(rh.a4Health.supportsLiveReadiness, false);
  } finally {
    cleanup(root);
  }
});

// 5. Soak is never claimed inside a4Health.
test("endpoint_preserves_supportsSoakClaim_false", () => {
  const root = makeRoot();
  try {
    const hostile = { status: "A4_VERIFIED_DEDICATED", severity: "info", blockerActive: false, supportsSoakClaim: true, warnings: [] };
    writeFile(root, "live_positions.json", JSON.stringify([]));
    const rh = withClassifierResult(resultWith(hostile), () =>
      dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW }));
    assert.strictEqual(rh.a4Health.supportsSoakClaim, false);
  } finally {
    cleanup(root);
  }
});

// 6. NOT_CONFIGURED message is fail-closed, not ready language.
test("a4_not_configured_message_is_fail_closed", () => {
  const root = makeRoot();
  try {
    const a4 = { status: "A4_NOT_CONFIGURED", severity: "blocked", blockerActive: true, warnings: ["A4_NOT_CONFIGURED"] };
    writeFile(root, "live_positions.json", JSON.stringify([]));
    const rh = withClassifierResult(resultWith(a4), () =>
      dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW }));
    const msg = rh.a4Summary.operatorMessage.toLowerCase();
    assert.ok(msg.includes("fail-closed") || msg.includes("refusal"), "message must convey fail-closed/refusal");
    for (const bad of READY_WORDS) assert.ok(!msg.includes(bad), `ready word leaked: ${bad}`);
    assert.strictEqual(rh.a4Summary.severity, "blocked");
  } finally {
    cleanup(root);
  }
});

// 7. CONFIGURED_UNVERIFIED message says configuration is not proof.
test("a4_configured_unverified_message_says_configuration_is_not_proof", () => {
  const root = makeRoot();
  try {
    const a4 = { status: "A4_CONFIGURED_UNVERIFIED", severity: "warning", blockerActive: true, warnings: ["A4_CONFIGURED_UNVERIFIED"] };
    writeFile(root, "live_positions.json", JSON.stringify([]));
    const rh = withClassifierResult(resultWith(a4), () =>
      dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW }));
    const msg = rh.a4Summary.operatorMessage.toLowerCase();
    assert.ok(msg.includes("not runtime-verified") || msg.includes("not proof"), "must say configuration is not proof");
    for (const bad of READY_WORDS) assert.ok(!msg.includes(bad), `ready word leaked: ${bad}`);
  } finally {
    cleanup(root);
  }
});

// 8. FALLBACK_DETECTED message is blocking.
test("a4_fallback_detected_message_is_blocking", () => {
  const root = makeRoot();
  try {
    const a4 = { status: "A4_FALLBACK_DETECTED", severity: "blocked", blockerActive: true, publicFallbackDetected: true, warnings: ["A4_FALLBACK_DETECTED"] };
    writeFile(root, "live_positions.json", JSON.stringify([]));
    const rh = withClassifierResult(resultWith(a4), () =>
      dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW }));
    const msg = rh.a4Summary.operatorMessage.toLowerCase();
    assert.ok(msg.includes("public fallback"), "must call out public fallback");
    assert.ok(msg.includes("not satisfied"), "must state trust boundary not satisfied");
    assert.strictEqual(rh.a4Summary.severity, "blocked");
    assert.strictEqual(rh.a4Health.publicFallbackDetected, true);
    for (const bad of READY_WORDS) assert.ok(!msg.includes(bad), `ready word leaked: ${bad}`);
  } finally {
    cleanup(root);
  }
});

// 9. Fallback builder uses conservative A4_UNKNOWN when classifier fails.
test("fallback_builder_uses_A4_UNKNOWN", () => {
  const root = makeRoot();
  try {
    writeFile(root, "live_positions.json", JSON.stringify([]));
    const rh = withClassifierThrow(() =>
      dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW }));
    assert.strictEqual(rh.classification, "UNKNOWN_NEEDS_REVIEW", "degrades safely");
    assert.ok(rh.a4Health, "fallback includes a4Health");
    assert.strictEqual(rh.a4Health.status, "A4_UNKNOWN");
    assert.strictEqual(rh.a4Health.blockerActive, true);
    assert.strictEqual(rh.a4Health.supportsLiveReadiness, false);
    assert.strictEqual(rh.a4Health.supportsSoakClaim, false);
    assert.ok(rh.a4Health.warnings.includes("A4_UNKNOWN"));
    assert.strictEqual(rh.a4Summary.status, "A4_UNKNOWN");
  } finally {
    cleanup(root);
  }
});

// 10. Static guard: control routes remain untouched and A4 display adds no
//     control coupling.
test("control_routes_untouched_static_guard", () => {
  const src = fs.readFileSync(path.join(__dirname, "dashboard_server.js"), "utf8");
  for (const route of ['app.post("/control/start"', 'app.post("/control/stop"', 'app.post("/control/emergency"']) {
    assert.ok(src.includes(route), `control route must remain: ${route}`);
  }
  // The A4.4 display block must not introduce any control/arming coupling.
  const start = src.indexOf("A4.4 — dedicated-RPC (A4) display helpers");
  const end = src.indexOf("end A4.4 display helpers");
  assert.ok(start > -1 && end > start, "A4.4 display block markers present");
  const block = src.slice(start, end).toLowerCase();
  for (const forbidden of ["/control", "livearmed", "app.post", "spawn", "exec(", "kill"]) {
    assert.ok(!block.includes(forbidden), `A4.4 display block must not reference: ${forbidden}`);
  }
});

// 11. A4.13 — dashboard displays only safe proof fields for a verified proof.
test("dashboard_summary_displays_safe_proof_fields_only", () => {
  const root = makeRoot();
  try {
    const a4 = {
      status: "A4_READ_ONLY_RPC_VERIFIED",
      severity: "warning",
      blockerActive: true,
      warnings: ["A4_READ_ONLY_RPC_VERIFIED"],
      providerLabel: "helius_rpc_url_configured",
      endpointClass: "dedicated",
      proof: {
        proofStatus: "READ_ONLY_RPC_OK", method: "getSlot",
        providerLabel: "helius_rpc_url_configured", endpointClass: "dedicated",
        freshness: "fresh", latencyMsBucket: "<250ms",
        publicFallbackUsed: false, secretSafe: true,
        slotObserved: true, slotValuePresent: true
      }
    };
    writeFile(root, "live_positions.json", JSON.stringify([]));
    const rh = withClassifierResult(resultWith(a4), () =>
      dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW }));
    assert.strictEqual(rh.a4Health.status, "A4_READ_ONLY_RPC_VERIFIED");
    assert.ok(rh.a4Health.proof, "proof summary present");
    assert.strictEqual(rh.a4Health.proof.proofStatus, "READ_ONLY_RPC_OK");
    assert.strictEqual(rh.a4Health.proof.method, "getSlot");
    assert.strictEqual(rh.a4Health.proof.freshness, "fresh");
    assert.strictEqual(rh.a4Health.proof.latencyMsBucket, "<250ms");
    assert.strictEqual(rh.a4Health.proof.publicFallbackUsed, false);
    assert.strictEqual(rh.a4Health.proof.secretSafe, true);
    // Proof summary must only carry allowlisted keys.
    const allowed = new Set([
      "proofStatus", "method", "providerLabel", "endpointClass", "freshness",
      "latencyMsBucket", "publicFallbackUsed", "secretSafe", "slotObserved", "slotValuePresent"
    ]);
    for (const k of Object.keys(rh.a4Health.proof)) {
      assert.ok(allowed.has(k), `unexpected proof display field: ${k}`);
    }
    assert.strictEqual(rh.supportsLiveReadiness, false);
  } finally {
    cleanup(root);
  }
});

// 12. A4.13 — secret-shaped proof fields never reach the display.
test("dashboard_summary_never_exposes_secret_fields", () => {
  const FAKE_URL = "https://mainnet.helius-rpc.com/?api-key=FAKE_SECRET_abc123";
  const FAKE_KEY = "FAKE_SECRET_abc123";
  const root = makeRoot();
  try {
    const a4 = {
      status: "A4_READ_ONLY_RPC_VERIFIED",
      severity: "warning",
      blockerActive: true,
      warnings: ["A4_READ_ONLY_RPC_VERIFIED"],
      providerLabel: "helius_rpc_url_configured",
      endpointClass: "dedicated",
      proof: {
        proofStatus: "READ_ONLY_RPC_OK", method: "getSlot",
        providerLabel: FAKE_URL, endpointClass: FAKE_URL,
        freshness: FAKE_KEY, latencyMsBucket: FAKE_URL,
        endpoint: FAKE_URL, apiKey: FAKE_KEY, rawSlot: 123456789,
        publicFallbackUsed: false, secretSafe: true
      }
    };
    writeFile(root, "live_positions.json", JSON.stringify([]));
    const rh = withClassifierResult(resultWith(a4), () =>
      dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW }));
    const json = JSON.stringify(rh);
    for (const needle of [FAKE_URL, FAKE_KEY, "api-key", "://", "123456789"]) {
      assert.ok(!json.includes(needle), `proof display leaked forbidden value: ${needle}`);
    }
    // Hostile fields collapse to safe sentinels; forbidden keys are dropped.
    assert.strictEqual(rh.a4Health.proof.providerLabel, "unknown");
    assert.strictEqual(rh.a4Health.proof.endpointClass, "unknown");
    assert.strictEqual(rh.a4Health.proof.freshness, "unknown");
    assert.strictEqual(rh.a4Health.proof.latencyMsBucket, "unknown");
    assert.ok(!Object.prototype.hasOwnProperty.call(rh.a4Health.proof, "endpoint"));
    assert.ok(!Object.prototype.hasOwnProperty.call(rh.a4Health.proof, "apiKey"));
    assert.ok(!Object.prototype.hasOwnProperty.call(rh.a4Health.proof, "rawSlot"));
  } finally {
    cleanup(root);
  }
});

// 13. A4.18 — dashboard displays only safe stability summary fields.
test("dashboard_displays_stability_summary_safe_fields", () => {
  const root = makeRoot();
  try {
    const a4 = {
      status: "A4_STABILITY_PROOF_OBSERVED",
      severity: "warning",
      blockerActive: true,
      warnings: ["A4_STABILITY_PROOF_OBSERVED"],
      providerLabel: "helius_rpc_url_configured",
      endpointClass: "dedicated",
      proofStability: {
        successCount: 2, freshSuccessCount: 2, separationBucket: ">=15m",
        providerConsistent: true, endpointClassConsistent: true,
        providerLabel: "helius_rpc_url_configured", endpointClass: "dedicated",
        fallbackObserved: false, failureObserved: false, secretSafe: true,
        withinFreshnessWindow: true, stabilityCandidate: true
      }
    };
    writeFile(root, "live_positions.json", JSON.stringify([]));
    const rh = withClassifierResult(resultWith(a4), () =>
      dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW }));
    assert.strictEqual(rh.a4Health.status, "A4_STABILITY_PROOF_OBSERVED");
    assert.ok(rh.a4Health.proofStability, "stability summary present");
    assert.strictEqual(rh.a4Health.proofStability.stabilityCandidate, true);
    assert.strictEqual(rh.a4Health.proofStability.separationBucket, ">=15m");
    assert.strictEqual(rh.a4Health.proofStability.successCount, 2);
    const allowed = new Set([
      "successCount", "freshSuccessCount", "separationBucket", "providerConsistent",
      "endpointClassConsistent", "providerLabel", "endpointClass", "fallbackObserved",
      "failureObserved", "unremediatedFailureObserved", "reviewedFailureCount",
      "secretSafe", "withinFreshnessWindow", "stabilityCandidate"
    ]);
    for (const k of Object.keys(rh.a4Health.proofStability)) {
      assert.ok(allowed.has(k), `unexpected stability display field: ${k}`);
    }
    assert.strictEqual(rh.supportsLiveReadiness, false);
    const msg = rh.a4Summary.operatorMessage.toLowerCase();
    for (const bad of READY_WORDS) assert.ok(!msg.includes(bad), `ready word leaked: ${bad}`);
  } finally {
    cleanup(root);
  }
});

// 14. A4.18 — secret-shaped stability fields never reach the display.
test("dashboard_does_not_expose_stability_secret_fields", () => {
  const FAKE_URL = "https://mainnet.helius-rpc.com/?api-key=FAKE_SECRET_abc123";
  const FAKE_KEY = "FAKE_SECRET_abc123";
  const root = makeRoot();
  try {
    const a4 = {
      status: "A4_STABILITY_PROOF_OBSERVED",
      severity: "warning",
      blockerActive: true,
      warnings: ["A4_STABILITY_PROOF_OBSERVED"],
      proofStability: {
        successCount: 2, freshSuccessCount: 2, separationBucket: FAKE_URL,
        providerConsistent: true, endpointClassConsistent: true,
        providerLabel: FAKE_URL, endpointClass: FAKE_URL,
        fallbackObserved: false, failureObserved: false, secretSafe: true,
        withinFreshnessWindow: true, stabilityCandidate: true,
        endpoint: FAKE_URL, apiKey: FAKE_KEY, rawSlot: 284512345
      }
    };
    writeFile(root, "live_positions.json", JSON.stringify([]));
    const rh = withClassifierResult(resultWith(a4), () =>
      dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW }));
    const json = JSON.stringify(rh);
    for (const needle of [FAKE_URL, FAKE_KEY, "api-key", "://", "284512345"]) {
      assert.ok(!json.includes(needle), `stability display leaked forbidden value: ${needle}`);
    }
    assert.strictEqual(rh.a4Health.proofStability.separationBucket, "unknown");
    assert.strictEqual(rh.a4Health.proofStability.providerLabel, "unknown");
    assert.strictEqual(rh.a4Health.proofStability.endpointClass, "unknown");
    assert.ok(!Object.prototype.hasOwnProperty.call(rh.a4Health.proofStability, "endpoint"));
    assert.ok(!Object.prototype.hasOwnProperty.call(rh.a4Health.proofStability, "apiKey"));
    assert.ok(!Object.prototype.hasOwnProperty.call(rh.a4Health.proofStability, "rawSlot"));
  } finally {
    cleanup(root);
  }
});

// 15. A4.21 — dashboard displays only safe proof-scan metadata.
test("dashboard_displays_proof_scan_metadata_safely", () => {
  const root = makeRoot();
  try {
    const a4 = {
      status: "A4_STABILITY_PROOF_OBSERVED",
      severity: "warning",
      blockerActive: true,
      warnings: ["A4_STABILITY_PROOF_OBSERVED"],
      proofScan: { available: true, limit: 5000, errorCode: null }
    };
    writeFile(root, "live_positions.json", JSON.stringify([]));
    const rh = withClassifierResult(resultWith(a4), () =>
      dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW }));
    assert.ok(rh.a4Health.proofScan, "proofScan present");
    assert.strictEqual(rh.a4Health.proofScan.available, true);
    assert.strictEqual(rh.a4Health.proofScan.limit, 5000);
    assert.strictEqual(rh.a4Health.proofScan.errorCode, null);
    const allowed = new Set(["available", "limit", "errorCode"]);
    for (const k of Object.keys(rh.a4Health.proofScan)) {
      assert.ok(allowed.has(k), `unexpected proofScan display field: ${k}`);
    }
  } finally {
    cleanup(root);
  }
});

// 16. A4.21 — raw errors / secret-shaped scan fields never reach the display.
test("dashboard_does_not_expose_raw_scan_errors_or_rows", () => {
  const RAW_ERR = "ENOENT: open C:\\secret\\path https://mainnet.helius-rpc.com/?api-key=FAKE_SECRET";
  const root = makeRoot();
  try {
    const a4 = {
      status: "A4_CONFIGURED_UNVERIFIED",
      severity: "warning",
      blockerActive: true,
      warnings: ["A4_CONFIGURED_UNVERIFIED"],
      proofScan: { available: false, limit: 5000, errorCode: RAW_ERR, rawRows: [{ endpoint: "https://x/?api-key=FAKE_SECRET" }] }
    };
    writeFile(root, "live_positions.json", JSON.stringify([]));
    const rh = withClassifierResult(resultWith(a4), () =>
      dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW }));
    const json = JSON.stringify(rh);
    for (const needle of [RAW_ERR, "helius-rpc.com", "api-key", "://", "FAKE_SECRET", "secret\\path", "rawRows"]) {
      assert.ok(!json.includes(needle), `proof-scan display leaked forbidden value: ${needle}`);
    }
    assert.strictEqual(rh.a4Health.proofScan.errorCode, null, "non-enumerated error code collapses to null");
    assert.ok(!Object.prototype.hasOwnProperty.call(rh.a4Health.proofScan, "rawRows"));
  } finally {
    cleanup(root);
  }
});

// 17. A4.25 — dashboard displays only safe approval metadata.
test("dashboard_displays_approval_summary_safely", () => {
  const root = makeRoot();
  const FAKE_URL = "https://mainnet.helius-rpc.com/?api-key=FAKE_SECRET";
  try {
    const a4 = {
      status: "A4_VERIFIED_DEDICATED",
      severity: "info",
      blockerActive: false,
      warnings: [],
      approval: {
        present: true,
        approved: true,
        status: "approved",
        approver: "Taylor",
        decisionRef: "DECISION-2026-07-04-A4-STABILITY-PROOF-ACCEPTED",
        evidenceRef: "helius_rpc_url_configured:dedicated",
        approvedAtIso: NOW,
        expiresAtIso: null,
        freshness: "fresh",
        endpoint: FAKE_URL,
        apiKey: "FAKE_KEY"
      },
      approvalScan: { available: true, limit: 5000, errorCode: null }
    };
    writeFile(root, "live_positions.json", JSON.stringify([]));
    const rh = withClassifierResult(resultWith(a4), () =>
      dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW }));
    assert.ok(rh.a4Health.approval);
    assert.strictEqual(rh.a4Health.approval.approver, "Taylor");
    assert.strictEqual(rh.a4Health.approval.status, "approved");
    assert.strictEqual(rh.a4Health.supportsLiveReadiness, false);
    assert.strictEqual(rh.a4Health.supportsSoakClaim, false);
    const allowed = new Set(["present", "approved", "status", "approver", "decisionRef", "evidenceRef", "approvedAtIso", "expiresAtIso", "freshness"]);
    for (const k of Object.keys(rh.a4Health.approval)) {
      assert.ok(allowed.has(k), `unexpected approval display field: ${k}`);
    }
    const json = JSON.stringify(rh);
    for (const needle of [FAKE_URL, "FAKE_KEY", "api-key", "://"]) {
      assert.ok(!json.includes(needle), `approval display leaked forbidden value: ${needle}`);
    }
  } finally {
    cleanup(root);
  }
});

process.on("exit", () => { cleanup(IMPORT_ROOT); });

console.log("");
console.log(`a4 dashboard runtime health tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
