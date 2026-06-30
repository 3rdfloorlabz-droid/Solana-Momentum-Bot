"use strict";

// test_b2a_24h_observation_status.js — B2A observation status (temp fixtures only).

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const b2a = require("./b2a_24h_observation_status");
const G = "\x1b[32m✔\x1b[0m";

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "b2a-runtime-"));
const tmpSoak = fs.mkdtempSync(path.join(os.tmpdir(), "b2a-soak-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "b2a-output-"));

const startMs = Date.parse("2026-06-29T00:00:00.000Z");
const endMs = Date.parse("2026-06-30T00:00:00.000Z");

function writeConfig(dir) {
  fs.writeFileSync(
    path.join(dir, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false,
      automationEnabled: true,
      emergencyStop: false,
      positionSizeSol: 0.005
    }, null, 2)}\n`
  );
}

function writePositions(dir) {
  fs.writeFileSync(
    path.join(dir, "paper_positions.json"),
    `${JSON.stringify({
      version: "paper_positions_v1",
      positions: {
        a: {
          entryId: "2026-06-29T01:00:00.000Z_m1_p1",
          symbol: "AAA",
          status: "WIN",
          pnlPercent: 10,
          closedAt: "2026-06-29T01:20:00.000Z"
        },
        b: {
          entryId: "2026-06-29T02:00:00.000Z_m2_p2",
          symbol: "BBB",
          status: "LOSS",
          pnlPercent: -5,
          closedAt: "2026-06-29T02:20:00.000Z"
        }
      }
    }, null, 2)}\n`
  );
}

try {
  writeConfig(tmpRuntime);
  writePositions(tmpRuntime);
  fs.writeFileSync(
    path.join(tmpRuntime, "paper_trades.json"),
    [
      JSON.stringify({
        timestamp: "2026-06-29T01:00:00.000Z",
        thesisMatch: true,
        marketCap: 150000,
        liquidity: 80000,
        volume5m: 12000
      }),
      JSON.stringify({
        timestamp: "2026-06-29T03:00:00.000Z",
        thesisMatch: false,
        marketCap: 50000,
        liquidity: 30000,
        volume5m: 500
      })
    ].join("\n") + "\n"
  );
  fs.writeFileSync(
    path.join(tmpRuntime, "pipeline_candidates.jsonl"),
    `${JSON.stringify({ timestamp: "2026-06-29T01:00:00.000Z", address: "mint1" })}\n`
  );
  fs.writeFileSync(
    path.join(tmpRuntime, "execution_audit.jsonl"),
    `${JSON.stringify({
      timestamp: "2026-06-29T01:05:00.000Z",
      eventType: "EXECUTION_STAGE",
      stage: "PIPELINE_DRY_RUN",
      payload: { derivedSlippagePct: 0.5, quotedSlippageBps: 300 }
    })}\n${JSON.stringify({
      timestamp: "2026-06-29T01:06:00.000Z",
      eventType: "EXECUTION_FAILURE",
      message: "quote failed"
    })}\n`
  );
  fs.writeFileSync(
    path.join(tmpRuntime, "scanner_health.json"),
    `${JSON.stringify({ quietMarket: false, lastScanAt: "2026-06-29T01:00:00.000Z", lastScanStatus: "ok" }, null, 2)}\n`
  );

  const status = b2a.collectB2aObservationStatus({
    runtimeRoot: tmpRuntime,
    startMs,
    endMs,
    startSource: "test",
    runtimeSnapshot: {
      timestamp: new Date().toISOString(),
      processes: {
        scanner: [{ pid: 1 }],
        monitor: [{ pid: 2 }],
        walletMonitor: [{ pid: 3 }],
        dashboard: [{ pid: 4 }],
        executorLoopCount: 1
      },
      executorLock: { state: "active" },
      lockPidMatch: { matches: true }
    }
  });

  assert.strictEqual(status.postureStatus.executionMode, "PIPELINE_DRY_RUN");
  assert.strictEqual(status.postureStatus.liveArmed, false);
  assert.strictEqual(status.recoveryActionsJsonl.present, false);
  assert.strictEqual(status.liveSubmission.liveArmed, false);
  assert.ok(/DISARMED/i.test(status.liveSubmission.summary));
  assert.strictEqual(status.paperEntries.entriesInWindow, 2);
  assert.strictEqual(status.paperPerformance.closedInWindow, 2);
  assert.strictEqual(status.paperPerformance.wins, 1);
  assert.strictEqual(status.paperPerformance.losses, 1);
  assert.strictEqual(status.paperPerformance.netPaperPnlPercentInWindow, 5);
  assert.strictEqual(status.candidates.candidatesInWindow, 1);
  assert.strictEqual(status.routeQuotes.quoteSuccess, 1);
  assert.strictEqual(status.routeQuotes.quoteFailed, 1);
  console.log(`${G} window metrics and posture reported`);

  assert.strictEqual(b2a.tierMarketCap(150000), "MC_IN_BAND_100K_250K");
  assert.strictEqual(b2a.tierLiquidity(80000), "T2_25K_100K");
  assert.strictEqual(b2a.tierVolume5m(12000), "V2_10K_25K");
  console.log(`${G} segmentation tiers work`);

  const recorded = b2a.recordObservationStart({
    soakRunsDir: tmpSoak,
    startedAt: "2026-06-29T12:00:00.000Z"
  });
  assert.ok(fs.existsSync(recorded.file));
  console.log(`${G} record start marker writes soak_runs file`);

  process.env.B2A_OUTPUT_DIR = tmpOutput;
  const written = b2a.writeStatus(status, tmpOutput);
  assert.ok(written.startsWith(tmpOutput));
  assert.ok(!/"privateKey"\s*:/.test(fs.readFileSync(written, "utf8")));
  console.log(`${G} status write stays under analysis/`);

  console.log("\nB2A 24H OBSERVATION STATUS TEST PASSED (4/4)");
} catch (err) {
  console.error(err);
  process.exit(1);
}
