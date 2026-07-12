"use strict";

// ─── Vulcan Stage 1 — Shared Audit Writer unit tests ──────────────────────────
//
// Self-contained. Writes ONLY to a temporary file in the OS temp dir — never to
// the real execution_audit.jsonl. No live bot state, no `.env`, no processes.
//
// Run directly:   node test_audit_writer.js
// Exit code 0 = all cases passed; non-zero = failure.

const fs = require("fs");
const os = require("os");
const path = require("path");

const auditWriter = require("./audit_writer");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJsonl(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse);
}

function tempFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vulcan-audit-writer-"));
  return path.join(dir, name);
}

const cases = [];
function testCase(name, fn) {
  cases.push({ name, fn });
}

// 1. audit_writer_requires_producer
testCase("audit_writer_requires_producer", () => {
  const file = tempFile("no_producer.jsonl");
  let threw = false;
  try {
    auditWriter.writeAuditEvent(
      { eventType: "EXECUTION_STAGE", stage: "SUBMIT", payload: {} },
      { filePath: file }
    );
  } catch (err) {
    threw = true;
    assert(/producer/i.test(err.message), "error message should mention producer");
  }
  assert(threw, "writing without producer must throw");
  assert(!fs.existsSync(file), "no file should be written when producer is missing");
});

// 2. audit_writer_writes_required_fields
testCase("audit_writer_writes_required_fields", () => {
  const file = tempFile("required_fields.jsonl");
  auditWriter.writeAuditEvent(
    {
      eventType: "EXECUTION_STAGE",
      stage: "SUBMIT",
      producer: auditWriter.PRODUCERS.LIVE_EXECUTOR_LOOP,
      runtimeMode: auditWriter.RUNTIME_MODES.DRY_RUN,
      authorityMode: auditWriter.AUTHORITY_MODES.GATED_EXECUTION,
      capitalExposure: auditWriter.CAPITAL_EXPOSURE.NONE,
      payload: { note: "hello" }
    },
    { filePath: file }
  );
  const rows = readJsonl(file);
  assert(rows.length === 1, "exactly one row should be written");
  const row = rows[0];
  assert(row.producer === "live_executor_loop", "producer preserved");
  assert(row.runtimeMode === "dry_run", "runtimeMode preserved");
  assert(row.authorityMode === "gated_execution", "authorityMode preserved");
  assert(row.capitalExposure === "none", "capitalExposure preserved");
  assert(row.legacyRow === false, "new row must not be legacy");
  assert(typeof row.timestamp === "string" && row.timestamp.length > 0, "timestamp present");
  assert(row.eventType === "EXECUTION_STAGE", "eventType present");
  assert(row.stage === "SUBMIT", "stage present");
  assert(row.payload && row.payload.note === "hello", "payload present");
});

// 3. audit_writer_supports_test_file_path
testCase("audit_writer_supports_test_file_path", () => {
  const file = tempFile("override_path.jsonl");
  auditWriter.writeAuditEvent(
    { producer: auditWriter.PRODUCERS.TEST_HARNESS, stage: "GUARD" },
    { filePath: file }
  );
  assert(fs.existsSync(file), "override file should be created");
  assert(file !== auditWriter.DEFAULT_AUDIT_FILE, "test path must differ from default runtime audit path");
  assert(!/execution_audit\.jsonl$/.test(path.basename(path.dirname(file))), "test writes into temp dir, not runtime root");
});

// 4. audit_writer_preserves_payload
testCase("audit_writer_preserves_payload", () => {
  const file = tempFile("payload.jsonl");
  const payload = { symbol: "ABC", address: "So1111", nested: { a: 1, b: [2, 3] } };
  auditWriter.writeAuditEvent(
    { producer: auditWriter.PRODUCERS.LIVE_EXECUTOR_CYCLE, stage: "QUOTE", payload },
    { filePath: file }
  );
  const row = readJsonl(file)[0];
  assert(JSON.stringify(row.payload) === JSON.stringify(payload), "payload must be preserved exactly");
});

// 5. audit_writer_does_not_mark_new_rows_as_legacy
testCase("audit_writer_does_not_mark_new_rows_as_legacy", () => {
  const file = tempFile("not_legacy.jsonl");
  auditWriter.writeAuditEvent(
    { producer: auditWriter.PRODUCERS.MONITOR, stage: "SUBMIT" },
    { filePath: file }
  );
  const row = readJsonl(file)[0];
  assert(row.legacyRow === false, "new rows default to legacyRow false");
});

// 6. audit_writer_defaults_unknown_optional_fields
testCase("audit_writer_defaults_unknown_optional_fields", () => {
  const file = tempFile("defaults.jsonl");
  auditWriter.writeAuditEvent(
    { producer: auditWriter.PRODUCERS.MANUAL_OPERATOR },
    { filePath: file }
  );
  const row = readJsonl(file)[0];
  assert(row.runtimeMode === "unknown", "runtimeMode defaults to unknown");
  assert(row.authorityMode === "unknown", "authorityMode defaults to unknown");
  assert(row.pipelineMode === "unknown", "pipelineMode defaults to unknown");
  assert(row.capitalExposure === "unknown", "capitalExposure defaults to unknown");
  assert(row.scannerFreshness === "unknown", "scannerFreshness defaults to unknown");
  assert(row.lockState === "unknown", "lockState defaults to unknown");
  assert(row.heartbeatState === "unknown", "heartbeatState defaults to unknown");
  assert(row.confidence === "medium", "confidence defaults to medium");
  assert(row.producerScript === "unknown", "producerScript defaults to unknown");
  assert(row.eventType === "EXECUTION_STAGE", "eventType defaults to EXECUTION_STAGE");
  assert(row.stage === "UNKNOWN", "stage defaults to UNKNOWN");
  assert(row.payload && typeof row.payload === "object", "payload defaults to object");
  assert(row.legacyRow === false, "defaulted row still not legacy");
});

let passed = 0;
for (const { name, fn } of cases) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  x ${name}: ${err.message}`);
    console.error(`\nAUDIT WRITER TEST FAILED at ${name}`);
    process.exit(1);
  }
}

console.log(`\nAUDIT WRITER TESTS PASSED: ${passed}/${cases.length}`);
process.exit(0);
