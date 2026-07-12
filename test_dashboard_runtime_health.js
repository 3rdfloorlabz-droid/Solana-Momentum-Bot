"use strict";

// ─── Vulcan Stage 6 — Tests for Dashboard Runtime Health Display ───────────────
//
// These tests exercise the exported, read-only builder `buildVulcanRuntimeHealth`
// WITHOUT starting the dashboard HTTP server (app.listen is guarded by
// require.main === module). All evidence comes from isolated temp fixtures; no
// real runtime files are read or written, no processes are started, no secrets
// are touched.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Isolate any import-time runtime root away from real files before requiring
// the dashboard (which transitively requires live_executor et al.).
const IMPORT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "vulcan-stage6-import-"));
process.env.TRACKTA_RUNTIME_ROOT = IMPORT_ROOT;

const dashboard = require("./dashboard_server");
const runtimeHealthModule = require("./runtime_health");

const NOW = "2026-06-30T18:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const minutesAgo = (m) => new Date(NOW_MS - m * 60 * 1000).toISOString();

// Live-readiness claims that must NEVER appear, regardless of classification.
const ALWAYS_FORBIDDEN_WORDING = [
  "live ready",
  "live-ready",
  "safe for live",
  "ready for live",
  "fully running",
  "executor healthy"
];

// "soak active" is only acceptable when soak is genuinely supported
// (a confirmed dry-run loop). It must never appear when soak is unsupported.
const SOAK_WORDING = "soak active";

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vulcan-stage6-"));
}
function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
}
function writeFile(root, name, contents) {
  fs.writeFileSync(path.join(root, name), contents);
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

// 1. Status payload includes a runtimeHealth object with the expected fields.
test("dashboard_runtime_health_payload_exists", () => {
  assert.strictEqual(typeof dashboard.buildVulcanRuntimeHealth, "function", "builder must be exported");
  const root = makeRoot();
  try {
    writeFile(root, "live_positions.json", JSON.stringify([]));
    const rh = dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW });
    for (const field of [
      "classification", "severity", "summary", "evidenceUsed", "missingEvidence",
      "warnings", "recommendedOperatorAction", "dashboardWording",
      "supportsSoakClaim", "supportsLiveReadiness", "capitalExposure"
    ]) {
      assert.ok(Object.prototype.hasOwnProperty.call(rh, field), `runtimeHealth missing field: ${field}`);
    }
    assert.strictEqual(rh.evidenceReadOnly, true);
  } finally {
    cleanup(root);
  }
});

// 2. Live readiness is never supported.
test("dashboard_live_readiness_not_supported", () => {
  const roots = [];
  try {
    // A spread of evidence scenarios — none may claim live readiness.
    const scenarios = [
      (root) => { writeFile(root, "live_positions.json", JSON.stringify([])); },
      (root) => { writeFile(root, "live_positions.json", JSON.stringify([{ liveTradeId: "t1", status: "OPEN", dryRun: false }])); },
      (root) => {
        writeFile(root, "executor_singleton.lock.json", JSON.stringify({
          schemaVersion: 1, instanceId: "x", pid: 10, startedAt: minutesAgo(10),
          updatedAt: minutesAgo(0.2), dryRunMode: true, liveArmed: false
        }));
        writeFile(root, "scanner_health.json", JSON.stringify({ lastScanAt: minutesAgo(1) }));
        writeFile(root, "live_positions.json", JSON.stringify([]));
      },
      () => { /* completely empty root */ }
    ];
    for (const setup of scenarios) {
      const root = makeRoot();
      roots.push(root);
      setup(root);
      const rh = dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW });
      assert.strictEqual(rh.supportsLiveReadiness, false, `live readiness surfaced for scenario`);
    }
  } finally {
    roots.forEach(cleanup);
  }
});

// 3. Audit-only evidence (no lock/heartbeat) must not support a soak claim.
test("dashboard_soak_not_supported_without_executor_evidence", () => {
  const root = makeRoot();
  try {
    const rows = [
      JSON.stringify({ timestamp: minutesAgo(2), eventType: "EXECUTION_STAGE", stage: "SWAP_SUBMITTED", producer: "live_executor" }),
      JSON.stringify({ timestamp: minutesAgo(1), eventType: "EXECUTION_STAGE", stage: "SWAP_CONFIRMED", producer: "live_executor" })
    ].join("\n") + "\n";
    writeFile(root, "execution_audit.jsonl", rows);
    writeFile(root, "live_positions.json", JSON.stringify([]));

    const rh = dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW });
    assert.strictEqual(rh.supportsSoakClaim, false, "audit activity alone must not support soak");
    assert.strictEqual(rh.executorLoopConfirmed, false, "executor loop must not be confirmed");
    assert.strictEqual(rh.supportsLiveReadiness, false);
  } finally {
    cleanup(root);
  }
});

// 4. No unsafe readiness wording is introduced (behavioral + static source check).
test("dashboard_uses_warning_wording", () => {
  const roots = [];
  try {
    // A spread of scenarios, favorable and ambiguous alike.
    const scenarios = [
      // Confirmed dry-run loop: soak IS supported, "soak active — not live" is honest.
      (root) => {
        writeFile(root, "executor_singleton.lock.json", JSON.stringify({
          schemaVersion: 1, instanceId: "x", pid: 10, startedAt: minutesAgo(10),
          updatedAt: minutesAgo(0.2), dryRunMode: true, liveArmed: false
        }));
        writeFile(root, "scanner_health.json", JSON.stringify({ lastScanAt: minutesAgo(1) }));
        writeFile(root, "live_positions.json", JSON.stringify([]));
      },
      // Audit-only: soak NOT supported → "soak active" must not appear.
      (root) => {
        writeFile(root, "execution_audit.jsonl",
          JSON.stringify({ timestamp: minutesAgo(1), stage: "S", producer: "live_executor" }) + "\n");
        writeFile(root, "live_positions.json", JSON.stringify([]));
      },
      // Empty root: fully ambiguous.
      () => { /* nothing */ }
    ];
    for (const setup of scenarios) {
      const root = makeRoot();
      roots.push(root);
      setup(root);
      const rh = dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW });
      const wording = String(rh.dashboardWording || "").toLowerCase();

      // Live readiness claims are never allowed.
      for (const bad of ALWAYS_FORBIDDEN_WORDING) {
        assert.ok(!wording.includes(bad), `forbidden readiness wording surfaced: "${bad}"`);
      }
      // "soak active" only permitted when soak is genuinely supported.
      if (rh.supportsSoakClaim !== true) {
        assert.ok(!wording.includes(SOAK_WORDING), `soak wording surfaced without soak support`);
      }
      assert.strictEqual(rh.supportsLiveReadiness, false);
    }
  } finally {
    roots.forEach(cleanup);
  }

  // Static: the runtime-health surface in source must not introduce unsafe claims.
  const src = fs.readFileSync(path.join(__dirname, "dashboard_server.js"), "utf8");
  const idx = src.indexOf("Vulcan Stage 6 — read-only runtime health display");
  assert.ok(idx > -1, "Stage 6 runtime-health section should exist in source");
  const section = src.slice(idx);
  const lowerSection = section.toLowerCase();
  assert.ok(lowerSection.includes("supportslivereadiness: false"), "must hard-code supportsLiveReadiness false");
  // The surface must not assert live readiness anywhere in its own block.
  assert.ok(!/supportslivereadiness:\s*true/.test(lowerSection), "must never set supportsLiveReadiness true");
  for (const bad of ALWAYS_FORBIDDEN_WORDING) {
    assert.ok(!lowerSection.includes(bad), `Stage 6 source introduces forbidden wording: "${bad}"`);
  }
});

// 5. A classifier failure degrades to a safe fallback, not a crash.
test("dashboard_handles_classifier_failure_safely", () => {
  const root = makeRoot();
  const original = runtimeHealthModule.classifyRuntimeHealth;
  try {
    writeFile(root, "live_positions.json", JSON.stringify([]));
    // The dashboard calls classifyRuntimeHealth on the shared (cached) module
    // object, so patching it here exercises the builder's catch path.
    runtimeHealthModule.classifyRuntimeHealth = () => { throw new Error("synthetic classifier failure"); };

    let rh;
    let threw = false;
    try {
      rh = dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW });
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, false, "builder must not throw on classifier failure");
    assert.strictEqual(rh.classification, "UNKNOWN_NEEDS_REVIEW");
    assert.strictEqual(rh.supportsLiveReadiness, false);
    assert.strictEqual(rh.supportsSoakClaim, false);
    assert.ok(typeof rh.errorSummary === "string" && rh.errorSummary.length > 0, "error summary present");
  } finally {
    runtimeHealthModule.classifyRuntimeHealth = original;
    cleanup(root);
  }
});

// Extra: monitor-driven audit surfaces as a warning classification, not a soak.
test("dashboard_monitor_driven_surfaces_warning", () => {
  const root = makeRoot();
  try {
    const rows = [
      JSON.stringify({
        timestamp: minutesAgo(1), eventType: "EXECUTION_STAGE", stage: "SWAP_SUBMITTED",
        producer: "live_executor", invocationContext: "monitor_mirror",
        invocationSource: "monitor", bridgeMode: "monitor_live_exit_mirror"
      })
    ].join("\n") + "\n";
    writeFile(root, "execution_audit.jsonl", rows);
    writeFile(root, "live_positions.json", JSON.stringify([]));

    const rh = dashboard.buildVulcanRuntimeHealth({ runtimeRoot: root, now: NOW });
    assert.strictEqual(rh.classification, runtimeHealthModule.CLASSIFICATIONS.MONITOR_DRIVEN_AUDIT_WITH_WARNINGS);
    assert.strictEqual(rh.monitorDriven, true);
    assert.strictEqual(rh.supportsSoakClaim, false);
    assert.ok(rh.producerInvocationSummary && rh.producerInvocationSummary.rowsConsidered === 1);
  } finally {
    cleanup(root);
  }
});

process.on("exit", () => { cleanup(IMPORT_ROOT); });

console.log("");
console.log(`dashboard runtime health tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
