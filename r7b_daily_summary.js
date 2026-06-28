"use strict";

// r7b_daily_summary.js — Sprint 4 R7b
// Read-only daily R7b collection progress summary. Writes analysis/ only.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R7B_OUTPUT_DIR
  ? path.resolve(process.env.R7B_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r7b_daily_summary.json");

const R7B_THRESHOLDS = {
  minClosedTrades: 30,
  minActiveMarketDays: 7,
  minThesisMatched: 10,
  minStopExits: 5,
  minTargetOrProfitableExits: 5,
  minTimeoutExits: 5,
  minProfitFactor: 1.2
};

const DEFAULT_COLLECTION_START = "2026-06-27T01:45:46.258Z";

function resolveCollectionStart() {
  if (process.env.R7B_COLLECTION_START) {
    const ms = Date.parse(process.env.R7B_COLLECTION_START);
    if (!Number.isNaN(ms)) {
      return { startMs: ms, source: "R7B_COLLECTION_START" };
    }
  }
  const summaryPath = path.join(ROOT, "soak_runs", "r6a_24h_soak_summary.json");
  if (fs.existsSync(summaryPath)) {
    try {
      const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
      if (summary.startedAt) {
        const ms = Date.parse(summary.startedAt);
        if (!Number.isNaN(ms)) {
          return { startMs: ms, source: summaryPath };
        }
      }
    } catch {
      // fall through
    }
  }
  return {
    startMs: Date.parse(DEFAULT_COLLECTION_START),
    source: "default_r6a_start"
  };
}

function inWindow(ts, startMs, endMs) {
  const ms = Date.parse(ts);
  return !Number.isNaN(ms) && ms >= startMs && ms <= endMs;
}

function summarizeThesisInWindow(rows, startMs, endMs) {
  const inRange = rows.filter(row => inWindow(row.timestamp, startMs, endMs));
  const withField = inRange.filter(row => row.thesisMatch !== undefined);
  const thesisTrue = withField.filter(row => row.thesisMatch === true);
  const thesisFalse = withField.filter(row => row.thesisMatch === false);
  const reasonCounts = {};
  for (const row of thesisFalse) {
    for (const reason of row.thesisFailureReasons || []) {
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }
  }
  return {
    rowsInWindow: inRange.length,
    rowsWithThesisField: withField.length,
    thesisMatchTrue: thesisTrue.length,
    thesisMatchFalse: thesisFalse.length,
    topFailureReasons: Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count }))
  };
}

function countActiveMarketDays(runtimeRoot, startMs, endMs) {
  const days = new Set();
  const positionsFile = path.join(runtimeRoot, "paper_positions.json");
  const positionsRead = review.readJsonFile(positionsFile);
  if (positionsRead.status === "usable") {
    for (const row of Object.values(positionsRead.data.positions || {})) {
      if (!row.closedAt || !inWindow(row.closedAt, startMs, endMs)) continue;
      days.add(row.closedAt.slice(0, 10));
    }
  }
  const auditPath = path.join(runtimeRoot, "execution_audit.jsonl");
  if (fs.existsSync(auditPath)) {
    for (const line of fs.readFileSync(auditPath, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (!inWindow(row.timestamp, startMs, endMs)) continue;
        if (row.eventType === "EXECUTION_STAGE" && row.stage === "PIPELINE_DRY_RUN") {
          days.add(row.timestamp.slice(0, 10));
        }
      } catch {
        // ignore
      }
    }
  }
  return days.size;
}

function countFreshExits(positions, startMs, endMs) {
  const closed = Object.values(positions || {}).filter(row =>
    ["WIN", "LOSS", "TIMEOUT", "NEEDS_REVIEW"].includes(row.status) &&
    row.closedAt &&
    inWindow(row.closedAt, startMs, endMs)
  );
  const stops = closed.filter(row =>
    row.status === "LOSS" || row.triggerType === "STOP"
  );
  const targets = closed.filter(row => row.status === "WIN");
  const profitable = closed.filter(row => Number(row.pnlPercent || 0) > 0);
  const targetOrProfitable = closed.filter(row =>
    row.status === "WIN" || Number(row.pnlPercent || 0) > 0
  );
  const timeouts = closed.filter(row => row.status === "TIMEOUT");
  return {
    closedTrades: closed.length,
    stopExits: stops.length,
    targetExits: targets.length,
    profitableExits: profitable.length,
    targetOrProfitableExits: targetOrProfitable.length,
    timeoutExits: timeouts.length
  };
}

function evaluateR7bProgress(fresh, thresholds = R7B_THRESHOLDS) {
  const checks = {
    closedTrades: fresh.exitCounts.closedTrades >= thresholds.minClosedTrades,
    activeMarketDays: fresh.activeMarketDays >= thresholds.minActiveMarketDays,
    thesisMatched: fresh.thesisInWindow.thesisMatchTrue >= thresholds.minThesisMatched,
    stopExits: fresh.exitCounts.stopExits >= thresholds.minStopExits,
    targetOrProfitableExits:
      fresh.exitCounts.targetOrProfitableExits >= thresholds.minTargetOrProfitableExits,
    timeoutExits: fresh.exitCounts.timeoutExits >= thresholds.minTimeoutExits,
    profitFactor:
      fresh.paperPerformance.profitFactor === null ||
      fresh.paperPerformance.profitFactor >= thresholds.minProfitFactor,
    safetyPosture:
      fresh.posture.executionMode === "PIPELINE_DRY_RUN" &&
      fresh.posture.dryRunMode === true &&
      fresh.posture.liveArmed === false,
    recoveryAbsent: fresh.recoveryActionsJsonl.exists !== true,
    stateIntegrity: fresh.stateIntegrity.ok === true
  };

  const sampleReady = checks.closedTrades && checks.activeMarketDays;
  const exitMixReady =
    checks.stopExits &&
    checks.targetOrProfitableExits &&
    checks.timeoutExits &&
    checks.thesisMatched;
  const qualityReady = checks.profitFactor;
  const safetyReady =
    checks.safetyPosture &&
    checks.recoveryAbsent &&
    checks.stateIntegrity;

  let recommendation;
  if (sampleReady && exitMixReady && qualityReady && safetyReady) {
    recommendation = "READY_FOR_R8_RISK_REVIEW";
  } else if (
    !checks.profitFactor ||
    (fresh.paperPerformance.profitFactor !== null &&
      fresh.paperPerformance.profitFactor < 1.0)
  ) {
    recommendation = "CONTINUE_DRY_RUN_OR_HALT";
  } else {
    recommendation = "CONTINUE_DRY_RUN";
  }

  return {
    checks,
    sampleReady,
    exitMixReady,
    qualityReady,
    safetyReady,
    readyForR8: recommendation === "READY_FOR_R8_RISK_REVIEW",
    recommendation,
    liveTradingApproved: false
  };
}

function readPosture(runtimeRoot) {
  const cfg = review.readJsonFile(path.join(runtimeRoot, "live_config.json"));
  if (cfg.status !== "usable") {
    return { available: false };
  }
  const data = cfg.data || {};
  return {
    available: true,
    executionMode: data.executionMode || "unknown",
    dryRunMode: data.dryRunMode !== false,
    liveArmed: data.liveArmed === true,
    emergencyStop: data.emergencyStop === true
  };
}

function readStateIntegrity(runtimeRoot) {
  const files = [
    "paper_positions.json",
    "live_positions.json",
    "observation_dedup.json"
  ];
  const results = {};
  let ok = true;
  for (const name of files) {
    const status = review.readJsonFile(path.join(runtimeRoot, name));
    results[name] = status.status;
    if (status.status === "corrupt") ok = false;
  }
  return { ok, files: results };
}

function collectR7bDailySummary(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;
  const collection = options.collectionStart || resolveCollectionStart();
  const endMs = options.endMs || Date.now();
  const window = {
    startMs: collection.startMs,
    endMs,
    source: collection.source
  };

  const paperPositions = review.readJsonFile(path.join(runtimeRoot, "paper_positions.json"));
  const paperTrades = review.readJsonLines(path.join(runtimeRoot, "paper_trades.json"));
  const positionsObj = paperPositions.data?.positions || {};

  const paperPerformance = paperPositions.status === "usable"
    ? review.summarizePaperPositions(positionsObj, window)
    : { error: "paper_positions unavailable" };

  const exitCounts = countFreshExits(positionsObj, window.startMs, window.endMs);
  const thesisInWindow = summarizeThesisInWindow(paperTrades.rows, window.startMs, window.endMs);
  const activeMarketDays = countActiveMarketDays(runtimeRoot, window.startMs, window.endMs);
  const postureConfig = readPosture(runtimeRoot);
  const posture = {
    executionMode: postureConfig.executionMode || "unknown",
    dryRunMode: postureConfig.dryRunMode !== false,
    liveArmed: postureConfig.liveArmed === true
  };

  const fresh = {
    paperPerformance,
    exitCounts,
    thesisInWindow,
    activeMarketDays,
    posture,
    recoveryActionsJsonl: {
      exists: fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"))
    },
    stateIntegrity: readStateIntegrity(runtimeRoot),
    executionAudit: review.summarizeAuditSoak(
      path.join(runtimeRoot, "execution_audit.jsonl"),
      window
    ),
    scannerHealth: review.readJsonFile(path.join(runtimeRoot, "scanner_health.json")),
    walletStatus: review.readJsonFile(path.join(runtimeRoot, "wallet_status.json"))
  };

  const evaluation = evaluateR7bProgress(fresh, options.thresholds || R7B_THRESHOLDS);

  return {
    timestamp: new Date().toISOString(),
    review: "R7b-strategy-data-collection",
    liveTradingApproved: false,
    collectionWindow: {
      start: new Date(window.startMs).toISOString(),
      end: new Date(window.endMs).toISOString(),
      source: window.source,
      elapsedDays: Number(((window.endMs - window.startMs) / 86400000).toFixed(4))
    },
    thresholds: options.thresholds || R7B_THRESHOLDS,
    freshMetrics: fresh,
    progress: evaluation,
    r7MetricsPath: path.join(OUTPUT_DIR, "r7_strategy_metrics.json")
  };
}

function printDailySummary(summary) {
  const p = summary.freshMetrics.paperPerformance;
  const e = summary.freshMetrics.exitCounts;
  console.log("[r7b-daily] Strategy Data Collection progress (read-only)");
  console.log(`  collection window: ${summary.collectionWindow.start} → ${summary.collectionWindow.end}`);
  console.log(`  fresh closed trades: ${e.closedTrades} / ${summary.thresholds.minClosedTrades}`);
  console.log(`  active market days: ${summary.freshMetrics.activeMarketDays} / ${summary.thresholds.minActiveMarketDays}`);
  console.log(`  thesisMatch true: ${summary.freshMetrics.thesisInWindow.thesisMatchTrue} / ${summary.thresholds.minThesisMatched}`);
  console.log(`  stop exits: ${e.stopExits} / ${summary.thresholds.minStopExits}`);
  console.log(`  target/profitable exits: ${e.targetOrProfitableExits} / ${summary.thresholds.minTargetOrProfitableExits}`);
  console.log(`  timeout exits: ${e.timeoutExits} / ${summary.thresholds.minTimeoutExits}`);
  console.log(`  profit factor (fresh): ${p.profitFactor ?? "n/a"}`);
  console.log(`  recommendation: ${summary.progress.recommendation}`);
  console.log(`  live trading approved: false`);
}

function writeDailySummary(summary, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(summary, null, 2)}\n`);
  return outputFile;
}

function runR7bDailySummary(options = {}) {
  if (options.refreshR7Metrics !== false) {
    review.runR7Review({
      runtimeRoot: options.runtimeRoot,
      repoRoot: options.repoRoot,
      print: false,
      writeOutput: true
    });
  }
  const summary = collectR7bDailySummary(options);
  const outputFile = options.outputFile || OUTPUT_FILE;
  if (options.writeOutput !== false) {
    writeDailySummary(summary, outputFile);
  }
  if (options.print !== false) {
    printDailySummary(summary);
  }
  return { summary, outputFile: options.writeOutput !== false ? outputFile : null };
}

if (require.main === module) {
  try {
    const result = runR7bDailySummary();
    if (result.outputFile) {
      console.log(`  summary: ${result.outputFile}`);
    }
  } catch (err) {
    console.error("[r7b-daily] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  R7B_THRESHOLDS,
  OUTPUT_FILE,
  resolveCollectionStart,
  summarizeThesisInWindow,
  countActiveMarketDays,
  countFreshExits,
  evaluateR7bProgress,
  collectR7bDailySummary,
  runR7bDailySummary,
  writeDailySummary
};
