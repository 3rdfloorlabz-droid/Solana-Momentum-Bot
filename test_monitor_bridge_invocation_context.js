"use strict";

// ─── Vulcan Stage 3 — monitor bridge invocation-context tests ─────────────────
//
// Verifies that:
//   - live_executor audit rows carry invocationContext/invocationSource/bridgeMode
//     when produced inside an invocation context (the mechanism executeLiveExit
//     uses via AsyncLocalStorage);
//   - existing callers (no context) default safely to unknown/none;
//   - monitor-originated context never claims the executor loop;
//   - redaction is preserved with context present;
//   - monitor.js statically passes explicit monitor_mirror context to executeLiveExit.
//
// SAFETY:
//   - Sets TRACKTA_RUNTIME_ROOT to a temp dir BEFORE requiring live_executor, so
//     runtime writes land in temp — never the real logs.
//   - monitor.js is NOT imported: it calls main() (an infinite loop) at module
//     load, so importing it would start the monitor. We assert its bridge call
//     statically instead (repo's static-guard convention).
//   - Uses only synthetic fake-secret strings. Does not read .env.
//
// Run directly:  node test_monitor_bridge_invocation_context.js

const fs = require("fs");
const os = require("os");
const path = require("path");

const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "vulcan-stage3-"));
process.env.TRACKTA_RUNTIME_ROOT = TEMP_ROOT;

const FAKE_API_KEY = "FAKE_SECRET_FOR_TEST_ONLY";
const FAKE_PRIVATE_KEY = "FAKE_PRIVATE_KEY_FOR_TEST_ONLY";
const FAKE_RPC_URL = "https://example.invalid/fake-rpc-key?api-key=FAKE_SECRET_FOR_TEST_ONLY";

const executor = require("./live_executor");
const test = executor.__executionLoggingTest;
const AUDIT_FILE = executor.FILES.EXECUTION_AUDIT_FILE;

const MONITOR_SRC = fs.readFileSync(path.join(__dirname, "monitor.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readAuditRows() {
  if (!fs.existsSync(AUDIT_FILE)) return [];
  return fs.readFileSync(AUDIT_FILE, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

const MONITOR_CONTEXT = {
  invocationContext: "monitor_mirror",
  invocationSource: "monitor",
  bridgeMode: "monitor_live_exit_mirror"
};

const cases = [];
function testCase(name, fn) { cases.push({ name, fn }); }

assert(AUDIT_FILE.startsWith(TEMP_ROOT), `SAFETY: audit file must be inside temp root. Got: ${AUDIT_FILE}`);

// 1. monitor_bridge_passes_invocation_context (static guard — monitor.js not imported)
testCase("monitor_bridge_passes_invocation_context", () => {
  // The mirror bridge must call executeLiveExit with explicit monitor context.
  assert(/executeLiveExit\(\s*live\.liveTradeId\s*,\s*trade\s*,\s*\{/.test(MONITOR_SRC),
    "monitor.js mirrorLiveExit must pass a context object to executeLiveExit");
  assert(/invocationContext:\s*"monitor_mirror"/.test(MONITOR_SRC), "monitor context sets invocationContext monitor_mirror");
  assert(/invocationSource:\s*"monitor"/.test(MONITOR_SRC), "monitor context sets invocationSource monitor");
  assert(/bridgeMode:\s*"monitor_live_exit_mirror"/.test(MONITOR_SRC), "monitor context sets bridgeMode monitor_live_exit_mirror");
});

// 2. live_executor_preserves_invocation_context
testCase("live_executor_preserves_invocation_context", () => {
  const runId = `stage3-ctx-${Date.now()}`;
  test.runWithInvocationContext(MONITOR_CONTEXT, () => {
    test.logExecutionStage(test.EXECUTION_STAGES.SUBMIT, { runId });
  });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "row written under invocation context");
  assert(row.invocationContext === "monitor_mirror", "invocationContext propagated");
  assert(row.invocationSource === "monitor", "invocationSource propagated");
  assert(row.bridgeMode === "monitor_live_exit_mirror", "bridgeMode propagated");
  // Producer identity is preserved (Stage 2) — writer is still live_executor.
  assert(row.producer === "live_executor", "producer identity preserved");
});

// 3. live_executor_existing_callers_still_work_without_context
testCase("live_executor_existing_callers_still_work_without_context", () => {
  const runId = `stage3-noctx-${Date.now()}`;
  test.logExecutionStage(test.EXECUTION_STAGES.QUOTE, { runId });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "row written without context");
  assert(row.invocationContext === "unknown", "invocationContext defaults to unknown");
  assert(row.invocationSource === "unknown", "invocationSource defaults to unknown");
  assert(row.bridgeMode === "none", "bridgeMode defaults to none");
  // Stage 2 fields still present and safe.
  assert(row.producer === "live_executor", "producer still live_executor");
  assert(row.eventType === "EXECUTION_STAGE", "eventType preserved");
  assert(row.stage === test.EXECUTION_STAGES.QUOTE, "stage preserved");
});

// 4. monitor_bridge_does_not_claim_executor_loop
testCase("monitor_bridge_does_not_claim_executor_loop", () => {
  const runId = `stage3-noloop-${Date.now()}`;
  test.runWithInvocationContext(MONITOR_CONTEXT, () => {
    test.logExecutionStage(test.EXECUTION_STAGES.SIMULATION, { runId });
  });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "row found");
  assert(row.invocationContext !== "executor_loop", "monitor-originated row must NOT claim executor_loop");
  assert(row.invocationContext === "monitor_mirror", "monitor-originated row is monitor_mirror");
  // Static guard: monitor.js must never send executor_loop.
  assert(!/invocationContext:\s*"executor_loop"/.test(MONITOR_SRC), "monitor.js must not send executor_loop context");
});

// 5. redaction_still_preserved_with_context
testCase("redaction_still_preserved_with_context", () => {
  const runId = `stage3-redact-${Date.now()}`;
  test.runWithInvocationContext(MONITOR_CONTEXT, () => {
    test.logExecutionStage(test.EXECUTION_STAGES.SUBMIT, {
      runId,
      url: FAKE_RPC_URL,
      apiKey: FAKE_API_KEY,
      privateKey: FAKE_PRIVATE_KEY
    });
  });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "row found");
  const serialized = JSON.stringify(row);
  assert(row.payload.apiKey === "[REDACTED]", "apiKey redacted with context present");
  assert(row.payload.privateKey === "[REDACTED]", "privateKey redacted with context present");
  assert(!serialized.includes(`"apiKey":"${FAKE_API_KEY}"`), "raw apiKey must not appear");
  assert(!serialized.includes(`"privateKey":"${FAKE_PRIVATE_KEY}"`), "raw privateKey must not appear");
  assert(!row.payload.url.includes("api-key=FAKE_SECRET_FOR_TEST_ONLY"), "url api-key query redacted");
});

let passed = 0;
for (const { name, fn } of cases) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  x ${name}: ${err.message}`);
    console.error(`\nMONITOR BRIDGE INVOCATION CONTEXT TEST FAILED at ${name}`);
    process.exit(1);
  }
}

console.log(`\nMONITOR BRIDGE INVOCATION CONTEXT TESTS PASSED: ${passed}/${cases.length}`);
console.log(`(temp runtime root: ${TEMP_ROOT})`);
process.exit(0);
