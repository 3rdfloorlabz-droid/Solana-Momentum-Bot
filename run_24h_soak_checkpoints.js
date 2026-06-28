"use strict";

// run_24h_soak_checkpoints.js — Sprint 4 R6a
// Schedules read-only soak checkpoints for the operator-selected 24-hour minimum soak.
// Does NOT start/stop/kill/restart TracktaOS processes or mutate trading/recovery state.

const fs = require("fs");
const path = require("path");
const {
  DEFAULT_SOAK_RUNS_DIR,
  collectAndWriteCheckpoint,
  printCheckpointSummary,
  healthySimulateFixture
} = require("./soak_checkpoint");

const TEST_MODE = process.env.R6A_TEST_INTERVALS === "1";
const RUN_SAFETY_AT_ALL = process.env.R6A_RUN_SAFETY_ALL === "1";

const SCHEDULE = TEST_MODE
  ? [
      { label: "start", delayMs: 0 },
      { label: "cp1_1h", delayMs: 1000 },
      { label: "cp2_4h", delayMs: 2000 },
      { label: "cp3_12h", delayMs: 3000 },
      { label: "cp4_24h", delayMs: 4000 }
    ]
  : [
      { label: "start", delayMs: 0 },
      { label: "cp1_1h", delayMs: 60 * 60 * 1000 },
      { label: "cp2_4h", delayMs: 4 * 60 * 60 * 1000 },
      { label: "cp3_12h", delayMs: 12 * 60 * 60 * 1000 },
      { label: "cp4_24h", delayMs: 24 * 60 * 60 * 1000 }
    ];

function readResumeStartedAt(soakRunsDir) {
  const env = process.env.R6A_SOAK_STARTED_AT;
  if (env) {
    const ms = Date.parse(env);
    if (!Number.isNaN(ms)) return ms;
  }
  if (process.env.R6A_RESUME_SOAK !== "1") return null;
  const jsonlPath = path.join(soakRunsDir, "r6a_24h_soak_checkpoints.jsonl");
  if (!fs.existsSync(jsonlPath)) return null;
  const lines = fs.readFileSync(jsonlPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (row.checkpointLabel === "start" && row.timestamp) {
        const ms = Date.parse(row.timestamp);
        if (!Number.isNaN(ms)) return ms;
      }
    } catch {
      // ignore malformed rows
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shouldRunSafety(label) {
  if (RUN_SAFETY_AT_ALL) return true;
  return label === "start" || label === "cp4_24h";
}

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  if (hr > 0) return `${hr}h ${min % 60}m`;
  if (min > 0) return `${min}m ${sec % 60}s`;
  return `${sec}s`;
}

async function runScheduledCheckpoints() {
  const soakRunsDir = process.env.SOAK_RUNS_DIR || DEFAULT_SOAK_RUNS_DIR;
  fs.mkdirSync(soakRunsDir, { recursive: true });
  const resumeStartedAt = readResumeStartedAt(soakRunsDir);
  const resuming = resumeStartedAt !== null;
  const startedAt = resuming ? resumeStartedAt : Date.now();
  const checkpoints = [];

  console.log("[r6a-soak] 24-hour minimum dry-run soak checkpoint runner");
  console.log("[r6a-soak] observation only — does not start/stop/kill processes");
  if (TEST_MODE) {
    console.log("[r6a-soak] R6A_TEST_INTERVALS=1 (short test schedule active)");
  } else if (resuming) {
    console.log(`[r6a-soak] resuming soak from ${new Date(startedAt).toISOString()}`);
    console.log(`[r6a-soak] elapsed: ${formatDuration(Date.now() - startedAt)}`);
  } else {
    console.log("[r6a-soak] production schedule: start, +1h, +4h, +12h, +24h");
  }
  console.log("[r6a-soak] 24h is risk-accepted minimum; not equivalent to preferred 72h soak");

  for (const entry of SCHEDULE) {
    const elapsed = Date.now() - startedAt;
    if (resuming && elapsed > entry.delayMs + 5000) {
      console.log(`[r6a-soak] skipping ${entry.label} (already elapsed at ${formatDuration(entry.delayMs)})`);
      checkpoints.push({
        label: entry.label,
        skipped: true,
        resumeReason: "already_elapsed",
        scheduledDelayMs: entry.delayMs
      });
      continue;
    }
    const waitMs = Math.max(0, entry.delayMs - elapsed);
    if (waitMs > 0) {
      console.log(`[r6a-soak] next checkpoint ${entry.label} in ${formatDuration(waitMs)}`);
      await sleep(waitMs);
    }
    const result = collectAndWriteCheckpoint({
      checkpointLabel: entry.label,
      runSafetySuite: shouldRunSafety(entry.label),
      soakRunsDir,
      simulate: process.env.R6A_TEST_SIMULATE === "healthy" ? healthySimulateFixture() : null
    });
    checkpoints.push({
      label: entry.label,
      timestamp: result.snapshot.timestamp,
      verdict: result.snapshot.verdict,
      failReasons: result.snapshot.failReasons
    });
    printCheckpointSummary(result.snapshot);
    console.log(`  evidence: ${result.paths.jsonlPath}`);
  }

  const overallVerdict = checkpoints.every(row => row.skipped || row.verdict === "PASS") ? "PASS" : "FAIL";
  const summary = {
    timestamp: new Date().toISOString(),
    soakPlan: "R6a-24h-minimum-risk-accepted",
    soakDurationAcceptedHours: 24,
    preferredSoakHours: 72,
    riskAcceptanceNote:
      "24 hours is the minimum accepted soak and does not provide the same confidence as the preferred 72-hour soak.",
    testMode: TEST_MODE,
    resumed: resuming,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date().toISOString(),
    checkpoints,
    overallVerdict,
    liveTradingApproved: false
  };
  const summaryPath = path.join(soakRunsDir, "r6a_24h_soak_summary.json");
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`[r6a-soak] overall verdict: ${overallVerdict}`);
  console.log(`[r6a-soak] summary: ${summaryPath}`);
  process.exit(overallVerdict === "PASS" ? 0 : 1);
}

if (require.main === module) {
  runScheduledCheckpoints().catch(err => {
    console.error("[r6a-soak] fatal:", err.message);
    process.exit(1);
  });
}

module.exports = {
  SCHEDULE,
  TEST_MODE,
  shouldRunSafety,
  readResumeStartedAt,
  runScheduledCheckpoints
};
