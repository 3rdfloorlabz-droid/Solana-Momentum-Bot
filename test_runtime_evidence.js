"use strict";

// ─── Vulcan Stage 5 — Tests for the Read-Only Runtime Evidence Collector ───────
//
// All fixtures are written into an isolated OS temp directory. NO real runtime
// files are read or written. No processes are started. No secrets are touched.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const re = require("./runtime_evidence");
const rh = require("./runtime_health");

const NOW = "2026-06-30T18:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const minutesAgo = (m) => new Date(NOW_MS - m * 60 * 1000).toISOString();

// Fresh, isolated temp runtime root per test.
function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vulcan-stage5-"));
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

// 1. Reads audit tail from a temp JSONL file.
test("evidence_collector_reads_audit_tail", (root) => {
  const lines = [];
  for (let i = 0; i < 60; i += 1) {
    lines.push(JSON.stringify({ timestamp: minutesAgo(60 - i), eventType: "EXECUTION_STAGE", stage: "S", producer: "live_executor", seq: i }));
  }
  writeFile(root, re.FILES.AUDIT, lines.join("\n") + "\n");

  const info = re.readRecentAuditEvents({ runtimeRoot: root, auditTailLimit: 50 });
  assert.strictEqual(info.present, true);
  assert.strictEqual(info.returned, 50, "should return last 50 rows");
  assert.strictEqual(info.rows[info.rows.length - 1].seq, 59, "last row should be newest");
  assert.strictEqual(info.parseWarnings.length, 0);
});

// 2. Missing files → missing/unknown evidence, not a crash.
test("evidence_collector_handles_missing_files", (root) => {
  const { evidence, meta } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  assert.ok(Array.isArray(evidence.auditEvents), "auditEvents should be an array (empty)");
  assert.strictEqual(evidence.auditEvents.length, 0);
  assert.strictEqual(evidence.scannerHealth, undefined, "scanner absent → no scannerHealth field");
  assert.strictEqual(evidence.lockEvidence.present, false);
  assert.strictEqual(evidence.capitalExposure, "unknown", "missing positions must not imply none");
  assert.ok(meta.uncertainties.length > 0, "uncertainties should be recorded");
});

// 3. Malformed JSONL rows → parse warnings, no crash.
test("evidence_collector_handles_malformed_jsonl", (root) => {
  const content = [
    JSON.stringify({ timestamp: minutesAgo(3), stage: "OK", producer: "live_executor" }),
    "{ this is not valid json",
    "",
    JSON.stringify({ timestamp: minutesAgo(1), stage: "OK2", producer: "live_executor" })
  ].join("\n") + "\n";
  writeFile(root, re.FILES.AUDIT, content);

  const info = re.readRecentAuditEvents({ runtimeRoot: root, auditTailLimit: 50 });
  assert.strictEqual(info.returned, 2, "two valid rows parsed");
  assert.strictEqual(info.parseWarnings.length, 1, "one malformed row warned");
  assert.ok(Number.isInteger(info.parseWarnings[0].line), "warning includes line number");
});

// 4. Scanner health populated from fixture.
test("evidence_collector_reads_scanner_health", (root) => {
  writeFile(root, re.FILES.SCANNER_HEALTH, JSON.stringify({
    schemaVersion: 1,
    scannerFile: "scanner_gmgn_trending.js",
    watchMode: true,
    lastScanAt: minutesAgo(2),
    lastScanStatus: "ok",
    quietMarket: false,
    scanStats: { pairsEvaluated: 12, resultsCount: 0 }
  }));

  const info = re.readScannerHealth({ runtimeRoot: root });
  assert.strictEqual(info.present, true);
  assert.strictEqual(info.parseOk, true);
  assert.strictEqual(info.scannerHealth.pairsEvaluated, 12);
  // Classifier should read freshness from the passed-through lastScanAt.
  const fresh = rh.classifyScannerFreshness(info.scannerHealth, NOW);
  assert.strictEqual(fresh.state, rh.SCANNER_FRESHNESS.FRESH);
});

// 5. Lock absent when file missing.
test("evidence_collector_reads_lock_absent", (root) => {
  const info = re.readLockEvidence({ runtimeRoot: root });
  assert.strictEqual(info.present, false);
  assert.strictEqual(info.raw, null);
});

// 6. Lock present populated from fixture.
test("evidence_collector_reads_lock_present", (root) => {
  writeFile(root, re.FILES.EXECUTOR_LOCK, JSON.stringify({
    schemaVersion: 1,
    instanceId: "abc-123",
    pid: 4242,
    startedAt: minutesAgo(30),
    updatedAt: minutesAgo(1),
    hostname: "test-host",
    command: "live_executor.js --loop",
    dryRunMode: true,
    liveArmed: false,
    mode: "dry_run"
  }));

  const info = re.readLockEvidence({ runtimeRoot: root });
  assert.strictEqual(info.present, true);
  assert.strictEqual(info.updatedAt, minutesAgo(1));
  assert.strictEqual(info.liveArmed, false);
  assert.strictEqual(info.mode, "dry_run");

  // Heartbeat should be inferred (uncertain) from lock.updatedAt.
  const hb = re.readHeartbeatEvidence({ runtimeRoot: root, lockEvidence: info });
  assert.strictEqual(hb.present, true);
  assert.strictEqual(hb.uncertain, true);
  const hbState = rh.classifyHeartbeatState(hb, NOW);
  assert.strictEqual(hbState.state, rh.HEARTBEAT_STATES.CURRENT);
});

// 7. Empty positions → openPositions [] and no live-readiness implication.
test("evidence_collector_reads_open_positions_empty", (root) => {
  writeFile(root, re.FILES.LIVE_POSITIONS, JSON.stringify([]));

  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  assert.deepStrictEqual(evidence.openPositions, []);
  assert.strictEqual(evidence.capitalExposure, "none");
  // liveArmed must remain unknown/false-not-implied by empty positions.
  assert.notStrictEqual(evidence.liveArmed, true, "empty positions must not imply live readiness");
});

// 8. Non-empty positions → capitalExposure active or possible.
test("evidence_collector_reads_open_positions_active", (root) => {
  writeFile(root, re.FILES.LIVE_POSITIONS, JSON.stringify([
    { liveTradeId: "t1", status: "OPEN", dryRun: false }
  ]));

  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  assert.strictEqual(evidence.openPositions.length, 1);
  assert.ok(
    evidence.capitalExposure === "active" || evidence.capitalExposure === "possible",
    `expected active/possible, got ${evidence.capitalExposure}`
  );
  // A real (non-dryRun) open position should read as active.
  assert.strictEqual(evidence.capitalExposure, "active");
});

// 9. A4 refusal-style audit rows → a4GateSignals.
test("evidence_collector_detects_a4_refusal_signal", (root) => {
  const content = [
    JSON.stringify({ timestamp: minutesAgo(5), stage: "OK", producer: "live_executor", payload: {} }),
    JSON.stringify({
      timestamp: minutesAgo(2),
      stage: "RPC_ENDPOINT_RESOLUTION",
      producer: "live_executor",
      payload: { message: "Dedicated RPC endpoint required; public mainnet-beta fallback refused.", requireDedicated: true, publicFallbackUsed: false, provider: null }
    })
  ].join("\n") + "\n";
  writeFile(root, re.FILES.AUDIT, content);

  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  assert.strictEqual(evidence.a4GateSignals.dedicatedRpcRefusalDetected, true);
  assert.strictEqual(evidence.a4GateSignals.recentRefusalCount, 1);
  assert.strictEqual(evidence.a4GateSignals.latestRefusalAt, minutesAgo(2));
});

// 10. Collected evidence integrates cleanly with runtime_health classifier.
test("evidence_collector_integrates_with_runtime_health", (root) => {
  // Monitor-driven audit, no lock/heartbeat, no positions file → ambiguous/monitor.
  const content = [
    JSON.stringify({
      timestamp: minutesAgo(1),
      eventType: "EXECUTION_STAGE",
      stage: "SWAP_SUBMITTED",
      producer: "live_executor",
      invocationContext: "monitor_mirror",
      invocationSource: "monitor",
      bridgeMode: "monitor_live_exit_mirror",
      payload: {}
    })
  ].join("\n") + "\n";
  writeFile(root, re.FILES.AUDIT, content);
  writeFile(root, re.FILES.LIVE_POSITIONS, JSON.stringify([]));

  const { evidence } = re.collectRuntimeEvidence({ runtimeRoot: root, now: NOW });
  const result = rh.classifyRuntimeHealth(evidence);

  assert.strictEqual(result.classification, rh.CLASSIFICATIONS.MONITOR_DRIVEN_AUDIT_WITH_WARNINGS);
  assert.strictEqual(result.details.executorLoopConfirmed, false);
  assert.strictEqual(result.supportsSoakClaim, false);
  assert.strictEqual(result.supportsLiveReadiness, false);
});

// Extra: strict mode is opt-in; default never throws on missing files.
test("evidence_collector_default_mode_never_throws", (root) => {
  // Nonexistent nested root path used only to prove no throw in default mode.
  const ghostRoot = path.join(root, "does", "not", "exist");
  let threw = false;
  let out = null;
  try {
    out = re.collectRuntimeEvidence({ runtimeRoot: ghostRoot, now: NOW });
  } catch {
    threw = true;
  }
  assert.strictEqual(threw, false, "default mode must not throw on missing files");
  assert.ok(out && out.evidence, "evidence returned even when files absent");
});

console.log("");
console.log(`runtime_evidence tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
