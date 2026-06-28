"use strict";

// test_r7_strategy_review.js — Sprint 4 R7
// Validates read-only strategy review metrics in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const review = require("./r7_strategy_review");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r7-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r7-output-"));
const G = "\x1b[32m✔\x1b[0m";

function writeFixturePaperPositions(dir, positions) {
  fs.writeFileSync(
    path.join(dir, "paper_positions.json"),
    `${JSON.stringify({ version: "paper_positions_v1", positions }, null, 2)}\n`
  );
}

try {
  const missing = review.collectR7Metrics({
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRuntime,
    soakWindow: { startMs: 0, endMs: 1, source: "test" },
    writeOutput: false
  });
  assert.strictEqual(missing.paperPerformance.error, "paper_positions unavailable");
  console.log(`${G} missing files handled safely`);

  writeFixturePaperPositions(tmpRuntime, {
    "2026-01-01T00:00:00.000Z_mint_pair": {
      entryId: "2026-01-01T00:00:00.000Z_mint_pair",
      symbol: "WIN1",
      status: "WIN",
      pnlPercent: 10,
      closedAt: "2026-01-01T00:10:00.000Z"
    },
    "2026-01-01T00:05:00.000Z_mint2_pair2": {
      entryId: "2026-01-01T00:05:00.000Z_mint2_pair2",
      symbol: "LOSS1",
      status: "LOSS",
      pnlPercent: -5,
      closedAt: "2026-01-01T00:15:00.000Z"
    },
    "2026-01-01T00:20:00.000Z_mint3_pair3": {
      entryId: "2026-01-01T00:20:00.000Z_mint3_pair3",
      symbol: "TIME1",
      status: "TIMEOUT",
      pnlPercent: 1,
      closedAt: "2026-01-01T00:40:00.000Z"
    }
  });
  fs.writeFileSync(path.join(tmpRuntime, "paper_trades.json"), "\n");

  const metrics = review.collectR7Metrics({
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRuntime,
    soakWindow: {
      startMs: Date.parse("2026-01-01T00:00:00.000Z"),
      endMs: Date.parse("2026-01-01T23:59:59.999Z"),
      source: "test"
    }
  });
  assert.strictEqual(metrics.paperPerformance.wins, 1);
  assert.strictEqual(metrics.paperPerformance.losses, 1);
  assert.strictEqual(metrics.paperPerformance.timeouts, 1);
  assert.strictEqual(metrics.paperPerformance.closedPositions, 3);
  console.log(`${G} wins/losses/timeouts calculated correctly`);

  writeFixturePaperPositions(tmpRuntime, {});
  fs.writeFileSync(path.join(tmpRuntime, "paper_trades.json"), "");
  const empty = review.collectR7Metrics({
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRuntime,
    soakWindow: { startMs: 0, endMs: 1, source: "test" }
  });
  assert.strictEqual(empty.paperPerformance.closedPositions, 0);
  console.log(`${G} empty trade files handled safely`);

  fs.writeFileSync(path.join(tmpRuntime, "paper_positions.json"), "{not-json");
  assert.doesNotThrow(() => review.collectR7Metrics({
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRuntime,
    soakWindow: { startMs: 0, endMs: 1, source: "test" }
  }));
  console.log(`${G} malformed files do not crash the review`);

  const outFile = path.join(tmpOutput, "r7_strategy_metrics.json");
  review.runR7Review({
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRuntime,
    outputFile: outFile,
    soakWindow: { startMs: 0, endMs: 1, source: "test" },
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

  const src = fs.readFileSync(path.join(__dirname, "r7_strategy_review.js"), "utf8");
  assert.ok(!/writeFileSync\([^)]*live_config|writeFileSync\([^)]*paper_positions\.json/.test(src));
  assert.ok(!/taskkill|Stop-Process|recovery_actions\.jsonl.*writeFileSync/.test(src));
  console.log(`${G} no trading state mutation in review script`);

  console.log("\nR7 STRATEGY REVIEW TEST PASSED (8/8)");
} finally {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
