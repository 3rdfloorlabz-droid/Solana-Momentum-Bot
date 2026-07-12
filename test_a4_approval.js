"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const a4 = require("./a4_approval");
const emit = require("./a4_approval_emit");
const { writeAuditEvent } = require("./audit_writer");

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

test("buildA4ApprovalAuditEvent_is_secret_safe", () => {
  const event = a4.buildA4ApprovalAuditEvent({
    approver: "Taylor",
    approvalStatus: "approved",
    evidenceRef: "helius_rpc_url_configured:dedicated"
  });
  assert.strictEqual(event.producer, "a4_approval");
  assert.strictEqual(event.eventType, "A4_VERIFIED_DEDICATED_APPROVAL");
  assert.strictEqual(event.capitalExposure, "none");
  assert.strictEqual(event.runtimeMode, "observation_only");
  const json = JSON.stringify(event);
  assert.ok(!json.includes("://"));
  assert.ok(!json.includes("api-key"));
});

test("payloadHasForbiddenApprovalField_detects_endpoint", () => {
  assert.strictEqual(a4.payloadHasForbiddenApprovalField({ endpoint: "https://x" }), true);
  assert.strictEqual(a4.payloadHasForbiddenApprovalField({ approver: "Taylor" }), false);
});

test("a4_approval_emit_writes_attributed_row", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vulcan-a425-"));
  const auditFile = path.join(root, "execution_audit.jsonl");
  try {
    const built = a4.buildA4ApprovalAuditEvent({
      approver: "Taylor",
      approvalStatus: "approved",
      evidenceRef: emit.DEFAULT_EVIDENCE_REF,
      approvedAtIso: "2026-07-04T12:00:00.000Z"
    }, { timestamp: "2026-07-04T12:00:00.000Z" });
    writeAuditEvent(built, { filePath: auditFile });
    const lines = fs.readFileSync(auditFile, "utf8").trim().split("\n");
    assert.strictEqual(lines.length, 1);
    const row = JSON.parse(lines[0]);
    assert.strictEqual(row.producer, "a4_approval");
    assert.strictEqual(row.payload.evidenceRef, emit.DEFAULT_EVIDENCE_REF);
    assert.ok(!JSON.stringify(row).includes("://"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

console.log("");
console.log(`a4 approval tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
