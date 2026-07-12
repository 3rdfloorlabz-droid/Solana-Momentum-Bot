"use strict";

// ─── Vulcan Stage 2 — live_executor audit attribution integration tests ───────
//
// Verifies that live_executor's execution_audit.jsonl writer now routes through
// the shared audit_writer, adding producer attribution WHILE preserving:
//   - legacy fields (timestamp, eventType, stage, payload)
//   - redaction of secret-like values
//   - A4 dedicated-RPC refusal row shape
//
// SAFETY:
//   - Sets TRACKTA_RUNTIME_ROOT to a fresh temp dir BEFORE requiring live_executor,
//     so every runtime write (including execution_audit.jsonl) lands in temp — the
//     real runtime logs are never touched.
//   - Uses only SYNTHETIC fake-secret strings.
//   - Does NOT start any loop (module load only; CLI is guarded by require.main).
//   - Does NOT read .env.
//
// Run directly:  node test_live_executor_audit_attribution.js

const fs = require("fs");
const os = require("os");
const path = require("path");

// Redirect ALL live_executor runtime paths into an isolated temp root.
const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "vulcan-stage2-"));
process.env.TRACKTA_RUNTIME_ROOT = TEMP_ROOT;

// Synthetic secrets — never real. These must NOT appear raw in audit output.
const FAKE_API_KEY = "FAKE_SECRET_FOR_TEST_ONLY";
const FAKE_PRIVATE_KEY = "FAKE_PRIVATE_KEY_FOR_TEST_ONLY";
const FAKE_RPC_URL = "https://example.invalid/fake-rpc-key?api-key=FAKE_SECRET_FOR_TEST_ONLY";
// Public-style values that SHOULD remain visible (parity with existing redaction test).
const PUBLIC_WALLET = "FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6";

const executor = require("./live_executor");
const test = executor.__executionLoggingTest;
const AUDIT_FILE = executor.FILES.EXECUTION_AUDIT_FILE;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readAuditRows() {
  if (!fs.existsSync(AUDIT_FILE)) return [];
  return fs
    .readFileSync(AUDIT_FILE, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse);
}

const cases = [];
function testCase(name, fn) {
  cases.push({ name, fn });
}

// Confirm the temp redirect actually took effect — guards against ever writing
// to the real runtime audit log.
assert(
  AUDIT_FILE.startsWith(TEMP_ROOT),
  `SAFETY: audit file must be inside temp root. Got: ${AUDIT_FILE}`
);

// 1. live_executor_audit_uses_shared_writer
testCase("live_executor_audit_uses_shared_writer", () => {
  const runId = `stage2-shared-${Date.now()}`;
  test.logExecutionStage(test.EXECUTION_STAGES.QUOTE, { runId });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "row written via shared writer path");
  // Shared-writer attribution fields present:
  assert("producer" in row, "producer field present");
  assert("runtimeMode" in row, "runtimeMode field present");
  assert("authorityMode" in row, "authorityMode field present");
  assert("capitalExposure" in row, "capitalExposure field present");
  assert("legacyRow" in row, "legacyRow field present");
  assert("confidence" in row, "confidence field present");
  assert(row.legacyRow === false, "new row is not legacy");
});

// 2. live_executor_audit_preserves_legacy_fields
testCase("live_executor_audit_preserves_legacy_fields", () => {
  const runId = `stage2-legacy-${Date.now()}`;
  test.logExecutionStage(test.EXECUTION_STAGES.SIMULATION, { runId, foo: "bar" });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "row found");
  assert(typeof row.timestamp === "string" && row.timestamp.length > 0, "timestamp preserved");
  assert(row.eventType === "EXECUTION_STAGE", "eventType preserved");
  assert(row.stage === test.EXECUTION_STAGES.SIMULATION, "stage preserved");
  assert(row.payload && row.payload.foo === "bar", "payload preserved");
});

// 3. live_executor_audit_includes_producer
testCase("live_executor_audit_includes_producer", () => {
  const runId = `stage2-producer-${Date.now()}`;
  test.logExecutionStage(test.EXECUTION_STAGES.SUBMIT, { runId });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "row found");
  // Executor-origin rows are tagged live_executor (neutral — not asserting loop).
  assert(row.producer === "live_executor", `producer should be live_executor, got ${row.producer}`);
  assert(row.producerScript === "live_executor.js", "producerScript is live_executor.js");
  assert(row.sourceModule === "live_executor", "sourceModule is live_executor");
});

// 4. live_executor_audit_preserves_redaction
testCase("live_executor_audit_preserves_redaction", () => {
  const runId = `stage2-redact-${Date.now()}`;
  test.logExecutionStage(test.EXECUTION_STAGES.QUOTE, {
    runId,
    url: FAKE_RPC_URL,
    apiKey: FAKE_API_KEY,
    privateKey: FAKE_PRIVATE_KEY,
    walletAddress: PUBLIC_WALLET
  });
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "row found");
  const serialized = JSON.stringify(row);
  // The raw secret values must not appear anywhere in the serialized row as a
  // live field value (they were passed under secret-like keys / query params).
  assert(row.payload.apiKey === "[REDACTED]", "apiKey field redacted to [REDACTED]");
  assert(!serialized.includes(`"apiKey":"${FAKE_API_KEY}"`), "raw apiKey value must not be written");
  assert(!serialized.includes(`"privateKey":"${FAKE_PRIVATE_KEY}"`), "raw privateKey value must not be written");
  assert(row.payload.privateKey === "[REDACTED]", "privateKey field redacted to [REDACTED]");
  assert(!row.payload.url.includes("api-key=FAKE_SECRET_FOR_TEST_ONLY"), "url api-key query redacted");
  assert(row.payload.url.includes("[REDACTED]"), "url shows redaction marker");
  // Public value remains visible.
  assert(row.payload.walletAddress === PUBLIC_WALLET, "public wallet address remains visible");
});

// 5. live_executor_a4_refusal_shape_preserved
testCase("live_executor_a4_refusal_shape_preserved", () => {
  const runId = `stage2-a4-${Date.now()}`;
  // Mirror the real A4 refusal payload shape (see execution_audit.jsonl tail).
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
  test.logExecutionStage(test.EXECUTION_STAGES.SUBMIT, a4Payload);
  const row = readAuditRows().find(r => r.payload && r.payload.runId === runId);
  assert(row, "A4 refusal row found");
  assert(row.eventType === "EXECUTION_STAGE", "eventType preserved for A4 refusal");
  assert(row.stage === test.EXECUTION_STAGES.SUBMIT, "stage preserved for A4 refusal");
  assert(row.payload.requireDedicated === true, "requireDedicated preserved");
  assert(row.payload.publicFallbackUsed === false, "publicFallbackUsed preserved");
  assert(
    row.payload.message === "Dedicated RPC endpoint required; public mainnet-beta fallback refused.",
    "A4 refusal message preserved verbatim"
  );
  // Attribution added on top without altering the refusal shape.
  assert(row.producer === "live_executor", "A4 refusal row carries producer attribution");
});

let passed = 0;
for (const { name, fn } of cases) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  x ${name}: ${err.message}`);
    console.error(`\nLIVE_EXECUTOR AUDIT ATTRIBUTION TEST FAILED at ${name}`);
    process.exit(1);
  }
}

console.log(`\nLIVE_EXECUTOR AUDIT ATTRIBUTION TESTS PASSED: ${passed}/${cases.length}`);
console.log(`(temp runtime root: ${TEMP_ROOT})`);
process.exit(0);
