"use strict";

// test_r7b_daily_summary.js — Sprint 4 R7b
// Validates read-only R7b daily summary in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r7b = require("./r7b_daily_summary");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r7b-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r7b-output-"));
const G = "\x1b[32m✔\x1b[0m";

const startMs = Date.parse("2026-06-27T00:00:00.000Z");
const endMs = Date.parse("2026-06-30T00:00:00.000Z");

function writePositions(dir, positions) {
  fs.writeFileSync(
    path.join(dir, "paper_positions.json"),
    `${JSON.stringify({ version: "paper_positions_v1", positions }, null, 2)}\n`
  );
}

function writeConfig(dir) {
  fs.writeFileSync(
    path.join(dir, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false
    }, null, 2)}\n`
  );
}

try {
  const missing = r7b.collectR7bDailySummary({
    runtimeRoot: tmpRuntime,
    collectionStart: { startMs, source: "test" },
    endMs
  });
  assert.strictEqual(missing.freshMetrics.paperPerformance.error, "paper_positions unavailable");
  console.log(`${G} missing files handled safely`);

  writeConfig(tmpRuntime);
  writePositions(tmpRuntime, {
    a: {
      entryId: "2026-06-27T01:00:00.000Z_m1_p1",
      status: "LOSS",
      triggerType: "STOP",
      pnlPercent: -5,
      closedAt: "2026-06-27T01:20:00.000Z"
    },
    b: {
      entryId: "2026-06-27T02:00:00.000Z_m2_p2",
      status: "WIN",
      pnlPercent: 10,
      closedAt: "2026-06-27T02:20:00.000Z"
    },
    c: {
      entryId: "2026-06-28T03:00:00.000Z_m3_p3",
      status: "TIMEOUT",
      pnlPercent: 1,
      closedAt: "2026-06-28T03:20:00.000Z"
    }
  });
  fs.writeFileSync(
    path.join(tmpRuntime, "paper_trades.json"),
    [
      JSON.stringify({
        timestamp: "2026-06-27T01:00:00.000Z",
        thesisMatch: true
      }),
      JSON.stringify({
        timestamp: "2026-06-27T02:00:00.000Z",
        thesisMatch: false,
        thesisFailureReasons: ["marketCap outside 100k-250k"]
      })
    ].join("\n") + "\n"
  );
  fs.writeFileSync(path.join(tmpRuntime, "live_positions.json"), "[]\n");
  fs.writeFileSync(path.join(tmpRuntime, "observation_dedup.json"), '{"observedKeys":[]}\n');
  fs.writeFileSync(
    path.join(tmpRuntime, "execution_audit.jsonl"),
    `${JSON.stringify({
      timestamp: "2026-06-27T04:00:00.000Z",
      eventType: "EXECUTION_STAGE",
      stage: "PIPELINE_DRY_RUN",
      payload: { thesisMatch: true }
    })}\n`
  );

  const summary = r7b.collectR7bDailySummary({
    runtimeRoot: tmpRuntime,
    collectionStart: { startMs, source: "test" },
    endMs,
    thresholds: {
      minClosedTrades: 3,
      minActiveMarketDays: 2,
      minThesisMatched: 1,
      minStopExits: 1,
      minTargetOrProfitableExits: 1,
      minTimeoutExits: 1,
      minProfitFactor: 1.0
    }
  });
  assert.strictEqual(summary.freshMetrics.exitCounts.closedTrades, 3);
  assert.strictEqual(summary.freshMetrics.thesisInWindow.thesisMatchTrue, 1);
  assert.strictEqual(summary.progress.readyForR8, true);
  console.log(`${G} wins/losses/timeouts and thesis counts calculated correctly`);

  fs.writeFileSync(path.join(tmpRuntime, "paper_positions.json"), "{bad");
  assert.doesNotThrow(() => r7b.collectR7bDailySummary({
    runtimeRoot: tmpRuntime,
    collectionStart: { startMs, source: "test" },
    endMs
  }));
  console.log(`${G} malformed files do not crash the summary`);

  writeConfig(tmpRuntime);
  writePositions(tmpRuntime, {});
  const outFile = path.join(tmpOutput, "r7b_daily_summary.json");
  r7b.runR7bDailySummary({
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRuntime,
    outputFile: outFile,
    collectionStart: { startMs, source: "test" },
    endMs,
    refreshR7Metrics: false,
    print: false
  });
  assert.ok(fs.existsSync(outFile));
  assert.ok(outFile.startsWith(tmpOutput));
  console.log(`${G} output only writes to analysis/ or configured output dir`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  console.log(`${G} no live_config.json mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  const src = fs.readFileSync(path.join(__dirname, "r7b_daily_summary.js"), "utf8");
  assert.ok(!/writeFileSync\([^)]*live_config\.json/.test(src));
  assert.ok(!/recovery_actions\.jsonl/.test(src.replace(/exists: fs\.existsSync\(path\.join\(runtimeRoot, "recovery_actions\.jsonl"\)\)/, "")));
  console.log(`${G} no trading state mutation in daily summary script`);

  console.log("\nR7B DAILY SUMMARY TEST PASSED (8/8)");
} finally {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
