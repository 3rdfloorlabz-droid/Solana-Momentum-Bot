"use strict";

// ─── Vulcan Stage 8 — executor CLI invocation-context tests ───────────────────
//
// Verifies positive invocation context tagging for live_executor CLI entry
// points (status, cycle, loop) via the existing AsyncLocalStorage mechanism.
//
// SAFETY:
//   - TRACKTA_RUNTIME_ROOT temp dir before requiring live_executor.
//   - Does NOT run CLI --loop (infinite). Tests use runWithExecutorInvocationContext
//     with the same context objects the CLI branches use.
//   - Static guards confirm CLI branches wrap with correct contexts.
//   - Synthetic fake secrets only. Does not read .env.
//
// Run directly:  node test_live_executor_invocation_context.js

const fs = require("fs");
const os = require("os");
const path = require("path");

const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "vulcan-stage8-"));
process.env.TRACKTA_RUNTIME_ROOT = TEMP_ROOT;

const FAKE_API_KEY = "FAKE_SECRET_FOR_TEST_ONLY";
const FAKE_PRIVATE_KEY = "FAKE_PRIVATE_KEY_FOR_TEST_ONLY";
const FAKE_RPC_URL = "https://example.invalid/fake-rpc-key?api-key=FAKE_SECRET_FOR_TEST_ONLY";

const executor = require("./live_executor");
const test = executor.__executionLoggingTest;
const AUDIT_FILE = executor.FILES.EXECUTION_AUDIT_FILE;
const EXECUTOR_SRC = fs.readFileSync(path.join(__dirname, "live_executor.js"), "utf8");
const MONITOR_SRC = fs.readFileSync(path.join(__dirname, "monitor.js"), "utf8");

const MONITOR_CONTEXT = {
  invocationContext: "monitor_mirror",
  invocationSource: "monitor",
  bridgeMode: "monitor_live_exit_mirror"
};

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

// Static: CLI branches use Stage 8 contexts (full CLI not invoked — --loop is unsafe in tests).
testCase("cli_branches_use_executor_cli_invocation_contexts", () => {
  assert(/runWithExecutorInvocationContext\(EXECUTOR_CLI_INVOCATION\.LOOP/.test(EXECUTOR_SRC),
    "CLI --loop branch must wrap with EXECUTOR_CLI_INVOCATION.LOOP");
  assert(/runWithExecutorInvocationContext\(EXECUTOR_CLI_INVOCATION\.CYCLE/.test(EXECUTOR_SRC),
    "CLI --cycle branch must wrap with EXECUTOR_CLI_INVOCATION.CYCLE");
  assert(/runWithExecutorInvocationContext\(EXECUTOR_CLI_INVOCATION\.STATUS/.test(EXECUTOR_SRC),
    "CLI default status branch must wrap with EXECUTOR_CLI_INVOCATION.STATUS");
  assert(/invocationContext:\s*"executor_loop"/.test(EXECUTOR_SRC), "executor_loop context defined");
  assert(/invocationContext:\s*"executor_cycle"/.test(EXECUTOR_SRC), "executor_cycle context defined");
  assert(/invocationContext:\s*"executor_status"/.test(EXECUTOR_SRC), "executor_status context defined");
});

// 1. executor_status_entry_sets_invocation_context
testCase("executor_status_entry_sets_invocation_context", () => {
  const runId = `stage8-status-${Date.now()}`;
  test.runWithExecutorInvocationContext(test.EXECUTOR_CLI_INVOCATION.STATUS, () => {
    test.logExecutionStage(test.EXECUTION_STAGES.SUBMIT, { runId });
  });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "row written under executor_status context");
  assert(row.invocationContext === "executor_status", `expected executor_status, got ${row.invocationContext}`);
  assert(row.invocationSource === "live_executor", "invocationSource is live_executor");
  assert(row.bridgeMode === "none", "bridgeMode is none");
  assert(row.producer === "live_executor", "producer unchanged");
});

// 2. executor_cycle_entry_sets_invocation_context
testCase("executor_cycle_entry_sets_invocation_context", () => {
  const runId = `stage8-cycle-${Date.now()}`;
  test.runWithExecutorInvocationContext(test.EXECUTOR_CLI_INVOCATION.CYCLE, () => {
    test.logExecutionStage(test.EXECUTION_STAGES.CYCLE_START, { runId });
  });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "row written under executor_cycle context");
  assert(row.invocationContext === "executor_cycle", `expected executor_cycle, got ${row.invocationContext}`);
  assert(row.invocationSource === "live_executor", "invocationSource is live_executor");
  assert(row.bridgeMode === "none", "bridgeMode is none");
});

// 3. executor_loop_entry_sets_invocation_context
testCase("executor_loop_entry_sets_invocation_context", () => {
  const runId = `stage8-loop-${Date.now()}`;
  test.runWithExecutorInvocationContext(test.EXECUTOR_CLI_INVOCATION.LOOP, () => {
    test.logExecutionStage(test.EXECUTION_STAGES.CYCLE_END, { runId, action: "TEST" });
  });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "row written under executor_loop context");
  assert(row.invocationContext === "executor_loop", `expected executor_loop, got ${row.invocationContext}`);
  assert(row.invocationSource === "live_executor", "invocationSource is live_executor");
  assert(row.bridgeMode === "none", "bridgeMode is none");
});

// 4. status_path_does_not_claim_executor_loop
testCase("status_path_does_not_claim_executor_loop", () => {
  const runId = `stage8-status-noloop-${Date.now()}`;
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
  test.runWithExecutorInvocationContext(test.EXECUTOR_CLI_INVOCATION.STATUS, () => {
    test.logExecutionStage(test.EXECUTION_STAGES.SIMULATION, a4Payload);
  });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "A4-style row under status context");
  assert(row.invocationContext === "executor_status", "status path tagged executor_status");
  assert(row.invocationContext !== "executor_loop", "status/A4 path must NOT claim executor_loop");
  assert(row.payload.requireDedicated === true, "A4 refusal shape preserved");
});

// 5. existing_no_context_callers_default_unknown
testCase("existing_no_context_callers_default_unknown", () => {
  const runId = `stage8-noctx-${Date.now()}`;
  test.logExecutionStage(test.EXECUTION_STAGES.QUOTE, { runId });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "row written without context");
  assert(row.invocationContext === "unknown", "invocationContext defaults to unknown");
  assert(row.invocationSource === "unknown", "invocationSource defaults to unknown");
  assert(row.bridgeMode === "none", "bridgeMode defaults to none");
});

// 6. monitor_mirror_context_still_preserved
testCase("monitor_mirror_context_still_preserved", () => {
  const runId = `stage8-monitor-${Date.now()}`;
  test.runWithInvocationContext(MONITOR_CONTEXT, () => {
    test.logExecutionStage(test.EXECUTION_STAGES.SUBMIT, { runId });
  });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "monitor context row found");
  assert(row.invocationContext === "monitor_mirror", "monitor_mirror preserved");
  assert(row.invocationSource === "monitor", "monitor source preserved");
  assert(row.bridgeMode === "monitor_live_exit_mirror", "bridge mode preserved");
  assert(/invocationContext:\s*"monitor_mirror"/.test(MONITOR_SRC), "monitor.js still passes monitor_mirror");
  assert(!/invocationContext:\s*"executor_loop"/.test(MONITOR_SRC), "monitor.js must not send executor_loop");
});

// 7. redaction_still_preserved
testCase("redaction_still_preserved", () => {
  const runId = `stage8-redact-${Date.now()}`;
  test.runWithExecutorInvocationContext(test.EXECUTOR_CLI_INVOCATION.STATUS, () => {
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
  assert(row.payload.apiKey === "[REDACTED]", "apiKey redacted");
  assert(row.payload.privateKey === "[REDACTED]", "privateKey redacted");
  assert(!serialized.includes(`"apiKey":"${FAKE_API_KEY}"`), "raw apiKey must not appear");
  assert(!row.payload.url.includes("api-key=FAKE_SECRET_FOR_TEST_ONLY"), "url api-key query redacted");
});

// 8. a4_refusal_shape_preserved
testCase("a4_refusal_shape_preserved", () => {
  const runId = `stage8-a4-${Date.now()}`;
  const a4Payload = {
    runId,
    endpointResolution: true,
    purpose: "submission",
    requireDedicated: true,
    provider: null,
    publicFallbackUsed: false,
    rejectedAsPublic: [],
    configuredProvidersPresent: [],
    message: "Dedicated RPC endpoint required; public mainnet-beta fallback refused."
  };
  test.runWithExecutorInvocationContext(test.EXECUTOR_CLI_INVOCATION.CYCLE, () => {
    test.logExecutionStage(test.EXECUTION_STAGES.SUBMIT, a4Payload);
  });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "A4 refusal row found");
  assert(row.eventType === "EXECUTION_STAGE", "eventType preserved");
  assert(row.stage === test.EXECUTION_STAGES.SUBMIT, "stage preserved");
  assert(row.payload.requireDedicated === true, "requireDedicated preserved");
  assert(row.payload.publicFallbackUsed === false, "publicFallbackUsed preserved");
  assert(
    row.payload.message === "Dedicated RPC endpoint required; public mainnet-beta fallback refused.",
    "A4 refusal message preserved verbatim"
  );
  assert(row.producer === "live_executor", "producer attribution present");
  assert(row.invocationContext === "executor_cycle", "cycle context does not alter A4 shape");
});

let passed = 0;
for (const { name, fn } of cases) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  x ${name}: ${err.message}`);
    console.error(`\nLIVE_EXECUTOR INVOCATION CONTEXT TEST FAILED at ${name}`);
    process.exit(1);
  }
}

console.log(`\nLIVE_EXECUTOR INVOCATION CONTEXT TESTS PASSED: ${passed}/${cases.length}`);
console.log(`(temp runtime root: ${TEMP_ROOT})`);
process.exit(0);
