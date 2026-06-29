"use strict";

// b2a_24h_observation_status.js — B2A 24-hour observation run status (read-only).
// Reads existing logs/state only. Does NOT submit transactions or mutate live_config.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const soakCheckpoint = require("./soak_checkpoint");
const liveExecutor = require("./live_executor");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const SOAK_RUNS_DIR = soakCheckpoint.getSoakRunsDir();
const START_FILE = path.join(SOAK_RUNS_DIR, "b2a_24h_observation_start.json");
const OUTPUT_DIR = process.env.B2A_OUTPUT_DIR
  ? path.resolve(process.env.B2A_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "b2a_24h_observation_status.json");
const RECOVERY_FILE = "recovery_actions.jsonl";
const OBSERVATION_PLAN = "B2A-24h-observation-only";

function inWindow(ts, startMs, endMs) {
  const ms = Date.parse(ts);
  return !Number.isNaN(ms) && ms >= startMs && ms <= endMs;
}

function resolveObservationWindow(options = {}) {
  if (options.window) return options.window;
  const endMs = options.endMs !== undefined
    ? options.endMs
    : Date.now();

  if (options.startMs !== undefined) {
    return {
      startMs: options.startMs,
      endMs,
      source: options.startSource || "options.startMs"
    };
  }

  if (process.env.B2A_OBSERVATION_START) {
    const startMs = Date.parse(process.env.B2A_OBSERVATION_START);
    if (!Number.isNaN(startMs)) {
      return { startMs, endMs, source: "B2A_OBSERVATION_START" };
    }
  }

  const startFile = options.startFile || START_FILE;
  if (fs.existsSync(startFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(startFile, "utf8"));
      const startMs = Date.parse(data.startedAt);
      if (!Number.isNaN(startMs)) {
        return { startMs, endMs, source: startFile, plan: data.plan || OBSERVATION_PLAN };
      }
    } catch {
      // fall through
    }
  }

  return {
    startMs: endMs - (24 * 60 * 60 * 1000),
    endMs,
    source: "rolling_last_24h"
  };
}

function readPosture(runtimeRoot) {
  const cfg = review.readJsonFile(path.join(runtimeRoot, "live_config.json"));
  if (cfg.status !== "usable") {
    return { available: false, status: cfg.status };
  }
  const data = cfg.data || {};
  const executionMode = data.executionMode || "unknown";
  return {
    available: true,
    executionMode,
    dryRunMode: data.dryRunMode !== false,
    liveArmed: data.liveArmed === true,
    emergencyStop: data.emergencyStop === true,
    automationEnabled: data.automationEnabled !== false
  };
}

function readLiveSubmissionStatus(runtimeRoot) {
  const cfgPath = path.join(runtimeRoot, "live_config.json");
  if (!fs.existsSync(cfgPath)) {
    return { available: false, summary: "live_config.json missing" };
  }
  try {
    const armed = liveExecutor.computeLiveArmedStatus(liveExecutor.loadConfig());
    return {
      available: true,
      liveArmed: armed.liveArmed === true,
      summary: armed.summary,
      operationalPosture: armed.operationalPosture,
      blockedReasons: armed.failures || []
    };
  } catch (err) {
    return {
      available: false,
      summary: err && err.message ? err.message : String(err)
    };
  }
}

function summarizePaperEntries(rows, window) {
  const inRange = rows.filter(row => inWindow(row.timestamp, window.startMs, window.endMs));
  return {
    entriesInWindow: inRange.length,
    thesisMatchTrue: inRange.filter(row => row.thesisMatch === true).length,
    thesisMatchFalse: inRange.filter(row => row.thesisMatch === false).length
  };
}

function tierMarketCap(marketCap) {
  const mc = Number(marketCap);
  if (!Number.isFinite(mc)) return "MC_UNKNOWN";
  if (mc >= 100000 && mc <= 250000) return "MC_IN_BAND_100K_250K";
  if (mc < 100000) return "MC_BELOW_100K";
  return "MC_ABOVE_250K";
}

function tierLiquidity(liquidity) {
  const liq = Number(liquidity);
  if (!Number.isFinite(liq)) return "LIQ_UNKNOWN";
  if (liq >= 100000) return "T1_GTE_100K";
  if (liq >= 25000) return "T2_25K_100K";
  return "T3_LT_25K";
}

function tierVolume5m(volume5m) {
  const vol = Number(volume5m);
  if (!Number.isFinite(vol)) return "VOL_UNKNOWN";
  if (vol >= 25000) return "V1_GTE_25K";
  if (vol >= 10000) return "V2_10K_25K";
  if (vol >= 1000) return "V3_1K_10K";
  return "V4_LT_1K";
}

function summarizeEntrySegments(rows, window) {
  const inRange = rows.filter(row => inWindow(row.timestamp, window.startMs, window.endMs));
  const marketCapTier = {};
  const liquidityTier = {};
  const volumeTier = {};
  let liquiditySum = 0;
  let liquidityCount = 0;

  for (const row of inRange) {
    const mcTier = tierMarketCap(row.marketCap);
    const liqTier = tierLiquidity(row.liquidity);
    const volTier = tierVolume5m(row.volume5m);
    marketCapTier[mcTier] = (marketCapTier[mcTier] || 0) + 1;
    liquidityTier[liqTier] = (liquidityTier[liqTier] || 0) + 1;
    volumeTier[volTier] = (volumeTier[volTier] || 0) + 1;
    if (Number.isFinite(Number(row.liquidity))) {
      liquiditySum += Number(row.liquidity);
      liquidityCount += 1;
    }
  }

  return {
    entriesInWindow: inRange.length,
    marketCapTier,
    liquidityTier,
    volumeTier,
    averageLiquidityAtEntryUsd: liquidityCount
      ? Number((liquiditySum / liquidityCount).toFixed(2))
      : null,
    tokenAgeAtEntry: "not persisted on paper_trades rows — use near_miss/pair metadata in B2B review"
  };
}

function summarizePipelineCandidates(rows, window) {
  const inRange = rows.filter(row => inWindow(row.timestamp, window.startMs, window.endMs));
  return {
    candidatesInWindow: inRange.length,
    latestCandidateAt: inRange.length
      ? inRange[inRange.length - 1].timestamp
      : null
  };
}

function summarizeRouteQuotes(auditPath, errorsPath, window) {
  let pipelineDryRunEvents = 0;
  let quoteSuccess = 0;
  let quoteFailed = 0;
  let slippageSamples = 0;
  let slippageSum = 0;
  let auditParseErrors = 0;

  if (fs.existsSync(auditPath)) {
    for (const line of fs.readFileSync(auditPath, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        auditParseErrors += 1;
        continue;
      }
      if (!inWindow(row.timestamp, window.startMs, window.endMs)) continue;
      if (row.eventType === "EXECUTION_FAILURE") {
        quoteFailed += 1;
        continue;
      }
      if (row.eventType !== "EXECUTION_STAGE" || row.stage !== "PIPELINE_DRY_RUN") continue;
      pipelineDryRunEvents += 1;
      quoteSuccess += 1;
      const payload = row.payload || {};
      const slippage = Number(payload.derivedSlippagePct ?? payload.slippagePct);
      if (Number.isFinite(slippage)) {
        slippageSamples += 1;
        slippageSum += slippage;
      }
    }
  }

  let errorEvents = 0;
  let errorParseErrors = 0;
  if (fs.existsSync(errorsPath)) {
    for (const line of fs.readFileSync(errorsPath, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        errorParseErrors += 1;
        continue;
      }
      const ts = row.timestamp || row.recordedAt;
      if (!inWindow(ts, window.startMs, window.endMs)) continue;
      const msg = `${row.event || ""} ${row.message || ""}`.toLowerCase();
      if (/quote|jupiter|route|slippage/.test(msg)) {
        errorEvents += 1;
        quoteFailed += 1;
      }
    }
  }

  return {
    pipelineDryRunEvents,
    quoteSuccess,
    quoteFailed,
    estimatedAverageSlippagePct: slippageSamples
      ? Number((slippageSum / slippageSamples).toFixed(4))
      : null,
    slippageSampleCount: slippageSamples,
    liveErrorQuoteEvents: errorEvents,
    auditParseErrors,
    errorParseErrors
  };
}

function summarizeScannerHealth(runtimeRoot) {
  const file = path.join(runtimeRoot, "scanner_health.json");
  if (!fs.existsSync(file)) return { status: "missing" };
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      status: "present",
      quietMarket: data.quietMarket === true,
      lastScanAt: data.lastScanAt || null,
      lastScanStatus: data.lastScanStatus || null,
      resultsCount: data.resultsCount ?? null
    };
  } catch {
    return { status: "corrupt" };
  }
}

function summarizeRuntime(snapshot) {
  const processes = snapshot.processes || {};
  return {
    checkpointAt: snapshot.timestamp,
    scannerProcesses: (processes.scanner || []).length,
    monitorProcesses: (processes.monitor || []).length,
    walletMonitorProcesses: (processes.walletMonitor || []).length,
    dashboardProcesses: (processes.dashboard || []).length,
    executorLoopCount: processes.executorLoopCount ?? 0,
    executorSingletonLock: snapshot.executorLock?.state || "unknown",
    lockPidMatch: snapshot.lockPidMatch?.matches ?? null
  };
}

function collectB2aObservationStatus(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;
  const window = resolveObservationWindow(options);
  const snapshot = options.runtimeSnapshot !== undefined
    ? options.runtimeSnapshot
    : soakCheckpoint.collectSoakCheckpoint({
      runtimeRoot,
      checkpointLabel: options.checkpointLabel || "b2a_status",
      runSafetySuite: false
    });

  const paperTrades = review.readJsonLines(path.join(runtimeRoot, "paper_trades.json"));
  const pipeline = review.readJsonLines(path.join(runtimeRoot, "pipeline_candidates.jsonl"));
  const paperPositions = review.readJsonFile(path.join(runtimeRoot, "paper_positions.json"));
  const positionsObj = paperPositions.data?.positions || {};
  const paperPerformance = paperPositions.status === "usable"
    ? review.summarizePaperPositions(positionsObj, window)
    : {
      error: "paper_positions unavailable",
      openPositions: null,
      closedPositions: null,
      wins: null,
      losses: null,
      timeouts: null,
      totalPaperPnlPercent: null,
      soakWindow: { closedTrades: 0, openTrades: 0, trades: [] }
    };

  const recoveryPath = path.join(runtimeRoot, RECOVERY_FILE);
  const recoveryRepoPath = path.join(repoRoot, RECOVERY_FILE);
  const recoveryPresent = fs.existsSync(recoveryPath) || fs.existsSync(recoveryRepoPath);

  const posture = readPosture(runtimeRoot);
  const liveSubmission = readLiveSubmissionStatus(runtimeRoot);

  return {
    timestamp: new Date().toISOString(),
    review: "B2A-24h-observation-status",
    plan: window.plan || OBSERVATION_PLAN,
    liveTradingApproved: false,
    observationWindow: {
      start: new Date(window.startMs).toISOString(),
      end: new Date(window.endMs).toISOString(),
      source: window.source,
      elapsedHours: Number(((window.endMs - window.startMs) / 3600000).toFixed(2))
    },
    runtime: summarizeRuntime(snapshot),
    postureStatus: posture,
    liveSubmission,
    recoveryActionsJsonl: {
      present: recoveryPresent,
      runtimePath: recoveryPath,
      repoPath: recoveryRepoPath
    },
    paperEntries: summarizePaperEntries(paperTrades.rows, window),
    paperPerformance: {
      openInWindow: paperPerformance.soakWindow?.openTrades ?? null,
      closedInWindow: paperPerformance.soakWindow?.closedTrades ?? null,
      wins: paperPerformance.soakWindow
        ? paperPerformance.soakWindow.trades.filter(row => row.status === "WIN").length
        : null,
      losses: paperPerformance.soakWindow
        ? paperPerformance.soakWindow.trades.filter(row => row.status === "LOSS").length
        : null,
      timeouts: paperPerformance.soakWindow
        ? paperPerformance.soakWindow.trades.filter(row => row.status === "TIMEOUT").length
        : null,
      netPaperPnlPercentInWindow: paperPerformance.soakWindow?.trades
        ? Number(paperPerformance.soakWindow.trades
          .reduce((sum, row) => sum + Number(row.pnlPercent || 0), 0)
          .toFixed(4))
        : null,
      allTimeOpen: paperPerformance.openPositions ?? null,
      allTimeClosed: paperPerformance.closedPositions ?? null
    },
    candidates: summarizePipelineCandidates(pipeline.rows, window),
    entrySegments: summarizeEntrySegments(paperTrades.rows, window),
    routeQuotes: summarizeRouteQuotes(
      path.join(runtimeRoot, "execution_audit.jsonl"),
      path.join(runtimeRoot, "live_errors.jsonl"),
      window
    ),
    scannerHealth: summarizeScannerHealth(runtimeRoot),
    outputFile: OUTPUT_FILE
  };
}

function recordObservationStart(options = {}) {
  const soakRunsDir = options.soakRunsDir || SOAK_RUNS_DIR;
  fs.mkdirSync(soakRunsDir, { recursive: true });
  const startedAt = options.startedAt || new Date().toISOString();
  const file = path.join(soakRunsDir, "b2a_24h_observation_start.json");
  const payload = {
    plan: OBSERVATION_PLAN,
    startedAt,
    expectedEndAt: new Date(Date.parse(startedAt) + 24 * 60 * 60 * 1000).toISOString(),
    postureRequired: {
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false
    },
    note: "B2A observation-only — no live trading"
  };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return { file, payload };
}

function writeStatus(status, outputDir = OUTPUT_DIR) {
  fs.mkdirSync(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, path.basename(OUTPUT_FILE));
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[b2a-status] B2A 24-Hour Observation Status (read-only)");
  console.log(`  window: ${status.observationWindow.start} → ${status.observationWindow.end}`);
  console.log(`  elapsed: ${status.observationWindow.elapsedHours}h (source: ${status.observationWindow.source})`);
  console.log(`  posture: ${status.postureStatus.executionMode} dryRunMode=${status.postureStatus.dryRunMode} liveArmed=${status.postureStatus.liveArmed}`);
  console.log(`  liveSubmission: ${status.liveSubmission.summary || "unknown"}`);
  console.log(`  recovery_actions.jsonl: ${status.recoveryActionsJsonl.present ? "PRESENT" : "absent"}`);
  console.log(`  runtime: scanner=${status.runtime.scannerProcesses} monitor=${status.runtime.monitorProcesses} executorLoop=${status.runtime.executorLoopCount} lock=${status.runtime.executorSingletonLock}`);
  console.log(`  paper entries (window): ${status.paperEntries.entriesInWindow} (thesis true=${status.paperEntries.thesisMatchTrue})`);
  console.log(`  paper closed (window): ${status.paperPerformance.closedInWindow} wins=${status.paperPerformance.wins} losses=${status.paperPerformance.losses} timeouts=${status.paperPerformance.timeouts}`);
  console.log(`  net paper PnL % (window): ${status.paperPerformance.netPaperPnlPercentInWindow}`);
  console.log(`  pipeline candidates (window): ${status.candidates.candidatesInWindow}`);
  console.log(`  route quotes: success=${status.routeQuotes.quoteSuccess} failed=${status.routeQuotes.quoteFailed} avgSlippagePct=${status.routeQuotes.estimatedAverageSlippagePct}`);
  console.log(`  scanner: quietMarket=${status.scannerHealth.quietMarket} lastScan=${status.scannerHealth.lastScanAt || "n/a"}`);
  if (status.outputFile) {
    console.log(`  output: ${status.outputFile}`);
  }
}

if (require.main === module) {
  try {
    if (process.argv.includes("--record-start")) {
      const recorded = recordObservationStart();
      console.log(`[b2a-status] recorded start: ${recorded.file}`);
      console.log(`  startedAt: ${recorded.payload.startedAt}`);
      console.log(`  expectedEndAt: ${recorded.payload.expectedEndAt}`);
      process.exit(0);
    }
    const status = collectB2aObservationStatus();
    if (process.argv.includes("--write")) {
      status.outputFile = writeStatus(status);
    }
    printSummary(status);
  } catch (err) {
    console.error("[b2a-status] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  ROOT,
  RUNTIME_ROOT,
  SOAK_RUNS_DIR,
  START_FILE,
  OUTPUT_FILE,
  OBSERVATION_PLAN,
  resolveObservationWindow,
  collectB2aObservationStatus,
  recordObservationStart,
  writeStatus,
  printSummary,
  tierMarketCap,
  tierLiquidity,
  tierVolume5m
};
