"use strict";

// ─── A4.25 — Human-run A4 verified-dedicated approval audit emitter ───────────
//
// Appends ONE secret-safe A4_VERIFIED_DEDICATED_APPROVAL row to execution_audit.jsonl.
// Intended for explicit human use after A4.24 sign-off — runtime never self-authors.
//
// Does NOT read `.env`, does NOT call RPC, does NOT grant live/soak readiness,
// and does NOT promote OR-20260630-008.

const path = require("path");
const { writeAuditEvent, DEFAULT_AUDIT_FILE } = require("./audit_writer");
const {
  buildA4ApprovalAuditEvent,
  A4_APPROVAL_DEFAULT_DECISION_REF,
  A4_APPROVAL_PRODUCER
} = require("./a4_approval");

const DEFAULT_EVIDENCE_REF = "helius_rpc_url_configured:dedicated";

function parseArgs(argv) {
  const out = {
    auditFile: null,
    approver: "Taylor",
    approvalStatus: "approved",
    decisionRef: A4_APPROVAL_DEFAULT_DECISION_REF,
    evidenceRef: DEFAULT_EVIDENCE_REF,
    approvedAtIso: new Date().toISOString(),
    expiresAtIso: null,
    scopeNote: "stability-evidence-only; not live readiness or capital permission"
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--audit-file" && argv[i + 1]) { out.auditFile = argv[i + 1]; i += 1; continue; }
    if (arg === "--approver" && argv[i + 1]) { out.approver = argv[i + 1]; i += 1; continue; }
    if (arg === "--status" && argv[i + 1]) { out.approvalStatus = argv[i + 1]; i += 1; continue; }
    if (arg === "--decision-ref" && argv[i + 1]) { out.decisionRef = argv[i + 1]; i += 1; continue; }
    if (arg === "--evidence-ref" && argv[i + 1]) { out.evidenceRef = argv[i + 1]; i += 1; continue; }
    if (arg === "--approved-at" && argv[i + 1]) { out.approvedAtIso = argv[i + 1]; i += 1; continue; }
    if (arg === "--expires-at" && argv[i + 1]) { out.expiresAtIso = argv[i + 1]; i += 1; continue; }
    if (arg === "--scope-note" && argv[i + 1]) { out.scopeNote = argv[i + 1]; i += 1; continue; }
    if (arg === "--help" || arg === "-h") { out.help = true; }
  }
  return out;
}

function printHelp() {
  console.log("Usage: node a4_approval_emit.js [options]");
  console.log("  --audit-file <path>   Target audit JSONL (default: execution_audit.jsonl under runtime root)");
  console.log("  --approver <name>     Human approver label (default: Taylor)");
  console.log("  --status <status>     approved | approved_with_conditions | revoked | pending_review | not_approved");
  console.log("  --decision-ref <id>   Stable decision slug (default: A4.24 decision ref)");
  console.log("  --evidence-ref <id>   provider:class evidence slug (default: helius_rpc_url_configured:dedicated)");
  console.log("  --approved-at <iso>   Approval timestamp ISO (default: now)");
  console.log("  --expires-at <iso>    Optional expiry ISO");
  console.log("  --scope-note <text>   Optional short scope note (max 200 chars)");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const auditFile = args.auditFile
    ? path.resolve(args.auditFile)
    : DEFAULT_AUDIT_FILE;

  const built = buildA4ApprovalAuditEvent({
    approver: args.approver,
    approvalStatus: args.approvalStatus,
    decisionRef: args.decisionRef,
    evidenceRef: args.evidenceRef,
    approvedAtIso: args.approvedAtIso,
    expiresAtIso: args.expiresAtIso,
    scopeNote: args.scopeNote
  }, { timestamp: args.approvedAtIso });

  const written = writeAuditEvent(built, { filePath: auditFile });

  console.log(JSON.stringify({
    ok: true,
    producer: A4_APPROVAL_PRODUCER,
    eventType: written.eventType,
    auditFile,
    decisionRef: written.payload.decisionRef,
    evidenceRef: written.payload.evidenceRef,
    approvalStatus: written.payload.approvalStatus,
    approver: written.payload.approver,
    approvedAtIso: written.payload.approvedAtIso,
    capitalExposure: written.capitalExposure,
    note: "stability-evidence-only; not live readiness or capital permission"
  }));
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, DEFAULT_EVIDENCE_REF };
