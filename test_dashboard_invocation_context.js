"use strict";

// ─── Vulcan Stage 10 — dashboard_status invocation-context tests ──────────────
//
// Verifies dashboard-originated read/status paths tag audit rows with
// dashboard_status / dashboard / dashboard_status_read via the shared
// AsyncLocalStorage mechanism (Stage 3 / Stage 8 reused, Stage 10 public export).
//
// SAFETY:
//   - TRACKTA_RUNTIME_ROOT temp dir before requiring live_executor / dashboard.
//   - dashboard_server.js is import-safe (app.listen guarded by require.main).
//   - Does NOT start the HTTP server, run CLI paths, or touch real runtime logs.
//   - Uses the exported dashboard wrapper + executor logging test surface.
//   - Static guards confirm dashboard wraps render/recovery reads and that
//     POST /control/* routes are NOT wrapped as dashboard_status.
//   - Synthetic fake secrets only. Does not read .env.
//
// Run directly:  node test_dashboard_invocation_context.js

const fs = require("fs");
const os = require("os");
const path = require("path");

const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "vulcan-stage10-"));
process.env.TRACKTA_RUNTIME_ROOT = TEMP_ROOT;

const FAKE_API_KEY = "FAKE_SECRET_FOR_TEST_ONLY";
const FAKE_PRIVATE_KEY = "FAKE_PRIVATE_KEY_FOR_TEST_ONLY";
const FAKE_RPC_URL = "https://example.invalid/fake-rpc-key?api-key=FAKE_SECRET_FOR_TEST_ONLY";

const executor = require("./live_executor");
const dashboard = require("./dashboard_server");
const test = executor.__executionLoggingTest;
const AUDIT_FILE = executor.FILES.EXECUTION_AUDIT_FILE;
const DASHBOARD_SRC = fs.readFileSync(path.join(__dirname, "dashboard_server.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readAuditRows() {
  if (!fs.existsSync(AUDIT_FILE)) return [];
  return fs.readFileSync(AUDIT_FILE, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

const cases = [];
function testCase(name, fn) { cases.push({ name, fn }); }

assert(AUDIT_FILE.startsWith(TEMP_ROOT), `SAFETY: audit file must be inside temp root. Got: ${AUDIT_FILE}`);
assert(typeof executor.runWithInvocationContext === "function", "live_executor exports public runWithInvocationContext");
assert(executor.DASHBOARD_INVOCATION && executor.DASHBOARD_INVOCATION.invocationContext === "dashboard_status", "DASHBOARD_INVOCATION exported");
assert(typeof dashboard.withDashboardStatusContext === "function", "dashboard exports withDashboardStatusContext");

// 1. dashboard_status_context_applied_to_dashboard_render
testCase("dashboard_status_context_applied_to_dashboard_render", () => {
  const runId = `stage10-render-${Date.now()}`;
  // Simulate a dashboard render invoking an audit-producing readiness/status helper.
  dashboard.withDashboardStatusContext(() => {
    test.logExecutionStage(test.EXECUTION_STAGES.SIMULATION, { runId });
  });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "row written under dashboard status context");
  assert(row.invocationContext === "dashboard_status", `expected dashboard_status, got ${row.invocationContext}`);
  assert(row.producer === "live_executor", "producer unchanged (writer identity)");
});

// 2. dashboard_status_uses_invocationSource_dashboard
testCase("dashboard_status_uses_invocationSource_dashboard", () => {
  const runId = `stage10-source-${Date.now()}`;
  dashboard.withDashboardStatusContext(() => {
    test.logExecutionStage(test.EXECUTION_STAGES.QUOTE, { runId });
  });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "row found");
  assert(row.invocationSource === "dashboard", `expected dashboard, got ${row.invocationSource}`);
});

// 3. dashboard_status_uses_bridgeMode_dashboard_status_read
testCase("dashboard_status_uses_bridgeMode_dashboard_status_read", () => {
  const runId = `stage10-bridge-${Date.now()}`;
  dashboard.withDashboardStatusContext(() => {
    test.logExecutionStage(test.EXECUTION_STAGES.QUOTE, { runId });
  });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "row found");
  assert(row.bridgeMode === "dashboard_status_read", `expected dashboard_status_read, got ${row.bridgeMode}`);
});

// 4. dashboard_status_does_not_claim_executor_loop
testCase("dashboard_status_does_not_claim_executor_loop", () => {
  const runId = `stage10-noloop-${Date.now()}`;
  dashboard.withDashboardStatusContext(() => {
    test.logExecutionStage(test.EXECUTION_STAGES.SUBMIT, { runId });
  });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "row found");
  assert(row.invocationContext !== "executor_loop", "dashboard row must NOT claim executor_loop");
  assert(row.invocationContext === "dashboard_status", "dashboard row is dashboard_status");
});

// 5. dashboard_status_does_not_claim_soak_or_live_readiness
testCase("dashboard_status_does_not_claim_soak_or_live_readiness", () => {
  // Structural: the dashboard context object carries no soak/live-readiness flag,
  // and the runtime-health endpoint hard-codes supportsLiveReadiness:false.
  const ctx = executor.DASHBOARD_INVOCATION;
  assert(!("supportsSoakClaim" in ctx), "dashboard context must not assert soak");
  assert(!("supportsLiveReadiness" in ctx), "dashboard context must not assert live readiness");
  const health = dashboard.buildVulcanRuntimeHealth({ runtimeRoot: TEMP_ROOT });
  assert(health.supportsLiveReadiness === false, "runtime health never supports live readiness");
  assert(health.supportsSoakClaim === false, "runtime health does not support soak here");
});

// 6. post_control_routes_not_wrapped (static guard)
testCase("post_control_routes_not_wrapped", () => {
  // Control routes must remain plain handleControl calls with no dashboard_status wrap.
  const startRoute = /app\.post\("\/control\/start"[\s\S]*?\}\);/.exec(DASHBOARD_SRC);
  const stopRoute = /app\.post\("\/control\/stop"[\s\S]*?\}\);/.exec(DASHBOARD_SRC);
  const emergencyRoute = /app\.post\("\/control\/emergency"[\s\S]*?\}\);/.exec(DASHBOARD_SRC);
  assert(startRoute, "start route present");
  assert(stopRoute, "stop route present");
  assert(emergencyRoute, "emergency route present");
  for (const [name, m] of [["start", startRoute], ["stop", stopRoute], ["emergency", emergencyRoute]]) {
    assert(!/withDashboardStatusContext/.test(m[0]), `control ${name} route must NOT be wrapped as dashboard_status`);
    assert(!/DASHBOARD_INVOCATION/.test(m[0]), `control ${name} route must NOT reference DASHBOARD_INVOCATION`);
  }
  // Render + recovery reads SHOULD be wrapped.
  assert(/withDashboardStatusContext\(\(\)\s*=>\s*renderDashboard/.test(DASHBOARD_SRC), "renderDashboard must be wrapped");
  assert(/getRecoveryPostureSnapshot[\s\S]*?withDashboardStatusContext/.test(DASHBOARD_SRC), "recovery posture snapshot must be wrapped");
});

// 7. redaction_still_preserved
testCase("redaction_still_preserved", () => {
  const runId = `stage10-redact-${Date.now()}`;
  dashboard.withDashboardStatusContext(() => {
    test.logExecutionStage(test.EXECUTION_STAGES.QUOTE, {
      runId,
      url: FAKE_RPC_URL,
      apiKey: FAKE_API_KEY,
      privateKey: FAKE_PRIVATE_KEY
    });
  });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "row found");
  const serialized = JSON.stringify(row);
  assert(row.payload.apiKey === "[REDACTED]", "apiKey redacted under dashboard context");
  assert(row.payload.privateKey === "[REDACTED]", "privateKey redacted under dashboard context");
  assert(!serialized.includes(`"apiKey":"${FAKE_API_KEY}"`), "raw apiKey must not appear");
  assert(!row.payload.url.includes("api-key=FAKE_SECRET_FOR_TEST_ONLY"), "url api-key query redacted");
});

// 8. a4_refusal_shape_preserved
testCase("a4_refusal_shape_preserved", () => {
  const runId = `stage10-a4-${Date.now()}`;
  const a4Payload = {
    runId,
    endpointResolution: true,
    purpose: "simulation",
    requireDedicated: true,
    provider: null,
    publicFallbackUsed: false,
    rejectedAsPublic: [],
    configuredProvidersPresent: [],
    message: "Dedicated RPC endpoint required; public mainnet-beta fallback refused."
  };
  dashboard.withDashboardStatusContext(() => {
    test.logExecutionStage(test.EXECUTION_STAGES.SIMULATION, a4Payload);
  });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "A4 refusal row found");
  assert(row.eventType === "EXECUTION_STAGE", "eventType preserved");
  assert(row.stage === test.EXECUTION_STAGES.SIMULATION, "stage preserved");
  assert(row.payload.requireDedicated === true, "requireDedicated preserved");
  assert(row.payload.publicFallbackUsed === false, "publicFallbackUsed preserved");
  assert(
    row.payload.message === "Dedicated RPC endpoint required; public mainnet-beta fallback refused.",
    "A4 refusal message preserved verbatim"
  );
  assert(row.producer === "live_executor", "producer attribution present");
  assert(row.invocationContext === "dashboard_status", "dashboard context added on top of A4 shape");
});

// 9. existing_no_context_callers_default_unknown (dashboard wrap must not leak)
testCase("existing_no_context_callers_default_unknown", () => {
  const runId = `stage10-noctx-${Date.now()}`;
  test.logExecutionStage(test.EXECUTION_STAGES.QUOTE, { runId });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "row written without context");
  assert(row.invocationContext === "unknown", "unwrapped caller defaults to unknown");
  assert(row.invocationSource === "unknown", "unwrapped source defaults to unknown");
  assert(row.bridgeMode === "none", "unwrapped bridgeMode defaults to none");
});

let passed = 0;
for (const { name, fn } of cases) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  x ${name}: ${err.message}`);
    console.error(`\nDASHBOARD INVOCATION CONTEXT TEST FAILED at ${name}`);
    process.exit(1);
  }
}

console.log(`\nDASHBOARD INVOCATION CONTEXT TESTS PASSED: ${passed}/${cases.length}`);
console.log(`(temp runtime root: ${TEMP_ROOT})`);
process.exit(0);
