"use strict";

// r7_strategy_review.js — Sprint 4 R7
// Read-only strategy performance / edge metrics from paper and dry-run artifacts.
// Writes only to analysis/ (or R7_OUTPUT_DIR). Does not mutate trading state.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const RUNTIME_ROOT = process.env.TRACKTA_RUNTIME_ROOT
  ? path.resolve(process.env.TRACKTA_RUNTIME_ROOT)
  : ROOT;
const OUTPUT_DIR = process.env.R7_OUTPUT_DIR
  ? path.resolve(process.env.R7_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r7_strategy_metrics.json");

const CLOSED_STATUSES = ["WIN", "LOSS", "TIMEOUT", "NEEDS_REVIEW"];
const DEFAULT_SOAK_START = "2026-06-27T01:45:46.258Z";
const DEFAULT_SOAK_END = "2026-06-28T01:45:50.289Z";

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return { rows: [], status: "missing" };
  }
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return { rows: [], status: "empty" };
  const rows = [];
  let invalid = 0;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      invalid += 1;
    }
  }
  return {
    rows,
    status: invalid ? "usable_with_parse_warnings" : "usable",
    invalidLines: invalid
  };
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { data: null, status: "missing" };
  }
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return { data: null, status: "empty" };
  try {
    return { data: JSON.parse(raw), status: "usable" };
  } catch (err) {
    return {
      data: null,
      status: "corrupt",
      error: err && err.message ? err.message : String(err)
    };
  }
}

function resolveSoakWindow() {
  const summaryPath = path.join(ROOT, "soak_runs", "r6a_24h_soak_summary.json");
  if (fs.existsSync(summaryPath)) {
    try {
      const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
      if (summary.startedAt && summary.completedAt) {
        return {
          startMs: Date.parse(summary.startedAt),
          endMs: Date.parse(summary.completedAt),
          source: summaryPath
        };
      }
    } catch {
      // fall through
    }
  }
  return {
    startMs: Date.parse(process.env.R7_SOAK_START || DEFAULT_SOAK_START),
    endMs: Date.parse(process.env.R7_SOAK_END || DEFAULT_SOAK_END),
    source: "default_or_env"
  };
}

function inWindow(ts, startMs, endMs) {
  const ms = Date.parse(ts);
  return !Number.isNaN(ms) && ms >= startMs && ms <= endMs;
}

function summarizePaperPositions(positions, window) {
  const all = Object.values(positions || {});
  const closed = all.filter(row => CLOSED_STATUSES.includes(row.status));
  const open = all.filter(row => row.status === "OPEN");
  const wins = closed.filter(row => row.status === "WIN");
  const losses = closed.filter(row => row.status === "LOSS");
  const timeouts = closed.filter(row => row.status === "TIMEOUT");
  const needsReview = closed.filter(row => row.status === "NEEDS_REVIEW");
  const breakevens = closed.filter(row => Math.abs(Number(row.pnlPercent || 0)) < 0.5);

  const pnls = closed.map(row => Number(row.pnlPercent || 0));
  const winPnls = wins.map(row => Number(row.pnlPercent || 0));
  const lossPnls = losses.map(row => Number(row.pnlPercent || 0));
  const totalPnl = pnls.reduce((sum, n) => sum + n, 0);
  const grossWins = winPnls.reduce((sum, n) => sum + n, 0);
  const grossLosses = lossPnls.reduce((sum, n) => sum + n, 0);

  const holdMinutes = closed
    .filter(row => row.closedAt && row.entryId)
    .map(row => {
      const entryTs = row.entryId.split("_")[0];
      return (Date.parse(row.closedAt) - Date.parse(entryTs)) / 60000;
    })
    .filter(minutes => Number.isFinite(minutes) && minutes >= 0);

  const chronological = [...closed].sort(
    (a, b) => Date.parse(a.closedAt || 0) - Date.parse(b.closedAt || 0)
  );
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const row of chronological) {
    cumulative += Number(row.pnlPercent || 0);
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const windowClosed = closed.filter(row => inWindow(row.closedAt, window.startMs, window.endMs));
  const windowOpen = open.filter(row => {
    const ts = row.updatedAt || (row.entryId ? row.entryId.split("_")[0] : null);
    return ts && inWindow(ts, window.startMs, window.endMs);
  });

  return {
    totalTrades: all.length,
    openPositions: open.length,
    closedPositions: closed.length,
    wins: wins.length,
    losses: losses.length,
    timeouts: timeouts.length,
    needsReview: needsReview.length,
    breakevens: breakevens.length,
    totalPaperPnlPercent: Number(totalPnl.toFixed(4)),
    averageWinPercent: winPnls.length ? Number((grossWins / winPnls.length).toFixed(4)) : null,
    averageLossPercent: lossPnls.length ? Number((grossLosses / lossPnls.length).toFixed(4)) : null,
    winRatePercent: closed.length ? Number(((wins.length / closed.length) * 100).toFixed(4)) : null,
    lossRatePercent: closed.length ? Number(((losses.length / closed.length) * 100).toFixed(4)) : null,
    timeoutRatePercent: closed.length ? Number(((timeouts.length / closed.length) * 100).toFixed(4)) : null,
    profitFactor: grossLosses !== 0 ? Number((grossWins / Math.abs(grossLosses)).toFixed(4)) : null,
    largestWinPercent: pnls.length ? Math.max(...pnls) : null,
    largestLossPercent: pnls.length ? Math.min(...pnls) : null,
    maxDrawdownOnCumulativePnlPercent: Number(maxDrawdown.toFixed(4)),
    averageHoldMinutes: holdMinutes.length
      ? Number((holdMinutes.reduce((a, b) => a + b, 0) / holdMinutes.length).toFixed(4))
      : null,
    soakWindow: {
      closedTrades: windowClosed.length,
      openTrades: windowOpen.length,
      trades: windowClosed.map(row => ({
        symbol: row.symbol,
        status: row.status,
        pnlPercent: row.pnlPercent,
        closedAt: row.closedAt
      }))
    }
  };
}

function summarizeThesis(rows) {
  const withField = rows.filter(row => row.thesisMatch !== undefined);
  const thesisTrue = withField.filter(row => row.thesisMatch === true);
  const thesisFalse = withField.filter(row => row.thesisMatch === false);
  const reasonCounts = {};
  for (const row of thesisFalse) {
    for (const reason of row.thesisFailureReasons || []) {
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }
  }
  const sortedReasons = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count }));

  return {
    rowsWithThesisField: withField.length,
    thesisMatchTrue: thesisTrue.length,
    thesisMatchFalse: thesisFalse.length,
    openRowsInLedger: rows.filter(row => row.status === "OPEN").length,
    topFailureReasons: sortedReasons.slice(0, 10)
  };
}

function summarizeAuditSoak(filePath, window) {
  if (!fs.existsSync(filePath)) {
    return { status: "missing", pipelineDryRunEvents: 0, thesisMatchTrue: 0, thesisMatchFalse: 0 };
  }
  let pipelineDryRunEvents = 0;
  let thesisMatchTrue = 0;
  let thesisMatchFalse = 0;
  let parseErrors = 0;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      parseErrors += 1;
      continue;
    }
    if (!inWindow(row.timestamp, window.startMs, window.endMs)) continue;
    if (row.eventType !== "EXECUTION_STAGE" || row.stage !== "PIPELINE_DRY_RUN") continue;
    pipelineDryRunEvents += 1;
    if (row.payload?.thesisMatch === true) thesisMatchTrue += 1;
    if (row.payload?.thesisMatch === false) thesisMatchFalse += 1;
  }
  return {
    status: parseErrors ? "usable_with_parse_warnings" : "usable",
    parseErrors,
    pipelineDryRunEvents,
    thesisMatchTrue,
    thesisMatchFalse
  };
}

function collectEvidenceStatus(repoRoot = ROOT, runtimeRoot = RUNTIME_ROOT) {
  const entries = [
    { file: "soak_runs/r6a_24h_soak_summary.json", base: repoRoot },
    { file: "soak_runs/r6a_24h_soak_checkpoints.jsonl", base: repoRoot },
    { file: "paper_trades.json", base: runtimeRoot },
    { file: "paper_positions.json", base: runtimeRoot },
    { file: "live_positions.json", base: runtimeRoot },
    { file: "observation_dedup.json", base: runtimeRoot },
    { file: "scanner_health.json", base: runtimeRoot },
    { file: "wallet_status.json", base: runtimeRoot },
    { file: "live_trades.jsonl", base: runtimeRoot },
    { file: "execution_audit.jsonl", base: runtimeRoot },
    { file: "pipeline_candidates.jsonl", base: runtimeRoot },
    { file: "near_misses.json", base: runtimeRoot },
    { file: "rpc_health.json", base: runtimeRoot },
    { file: "live_trades.json", base: runtimeRoot },
    { file: "live_errors.jsonl", base: runtimeRoot }
  ];
  return entries.map(({ file, base }) => {
    const resolved = path.join(base, file);
    const exists = fs.existsSync(resolved);
    let status = "missing";
    if (exists) {
      status = fs.statSync(resolved).size === 0 ? "empty" : "present";
    }
    return { file, exists, status };
  });
}

function recommendVerdict(metrics) {
  const soakClosed = metrics.paperPerformance.soakWindow.closedTrades;
  const historicalClosed = metrics.paperPerformance.closedPositions;
  const pf = metrics.paperPerformance.profitFactor;
  if (soakClosed < 5 && historicalClosed >= 30) {
    return {
      verdict: "NOT ENOUGH DATA",
      reason: "R6a soak window produced insufficient closed paper trades for edge validation."
    };
  }
  if (historicalClosed < 20) {
    return { verdict: "NOT ENOUGH DATA", reason: "Insufficient historical closed paper sample." };
  }
  if (pf !== null && pf >= 1.2 && metrics.paperPerformance.winRatePercent >= 35) {
    return {
      verdict: "EDGE PROMISING BUT NOT LIVE READY",
      reason: "Historical paper metrics show modest edge; live execution not validated."
    };
  }
  return { verdict: "EDGE NOT PROVEN", reason: "Paper metrics do not demonstrate durable edge." };
}

function collectR7Metrics(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;
  const window = options.soakWindow || resolveSoakWindow();

  const paperPositionsPath = path.join(runtimeRoot, "paper_positions.json");
  const paperPositions = readJsonFile(paperPositionsPath);
  const paperTrades = readJsonLines(path.join(runtimeRoot, "paper_trades.json"));
  const pipeline = readJsonLines(path.join(runtimeRoot, "pipeline_candidates.jsonl"));
  const liveTrades = readJsonLines(path.join(runtimeRoot, "live_trades.jsonl"));
  const soakSummary = readJsonFile(path.join(repoRoot, "soak_runs", "r6a_24h_soak_summary.json"));

  const positionsObj = paperPositions.data?.positions || {};
  const paperPerformance = paperPositions.status === "usable"
    ? summarizePaperPositions(positionsObj, window)
    : { error: "paper_positions unavailable", soakWindow: { closedTrades: 0, openTrades: 0, trades: [] } };

  const pipelineSoak = pipeline.rows.filter(row => inWindow(row.timestamp, window.startMs, window.endMs));
  const liveTradesSoak = liveTrades.rows.filter(row =>
    inWindow(row.timestamp || row.recordedAt, window.startMs, window.endMs)
  );

  const metrics = {
    timestamp: new Date().toISOString(),
    review: "R7-strategy-performance-edge",
    liveTradingApproved: false,
    runtimeRoot,
    soakWindow: {
      start: new Date(window.startMs).toISOString(),
      end: new Date(window.endMs).toISOString(),
      source: window.source
    },
    evidence: collectEvidenceStatus(repoRoot, runtimeRoot),
    soakSummary: soakSummary.status === "usable"
      ? {
          overallVerdict: soakSummary.data.overallVerdict,
          liveTradingApproved: soakSummary.data.liveTradingApproved === true
        }
      : { status: soakSummary.status },
    paperPerformance,
    thesisAnalysis: summarizeThesis(paperTrades.rows),
    pipelineCandidates: {
      total: pipeline.rows.length,
      soakWindow: pipelineSoak.length,
      status: pipeline.status
    },
    liveTradesJsonl: {
      total: liveTrades.rows.length,
      soakWindow: liveTradesSoak.length,
      status: liveTrades.status
    },
    executionAuditSoak: summarizeAuditSoak(path.join(runtimeRoot, "execution_audit.jsonl"), window),
    scannerHealth: readJsonFile(path.join(runtimeRoot, "scanner_health.json")),
    walletStatus: readJsonFile(path.join(runtimeRoot, "wallet_status.json")),
    observationDedup: readJsonFile(path.join(runtimeRoot, "observation_dedup.json")),
    livePositions: readJsonFile(path.join(runtimeRoot, "live_positions.json"))
  };

  metrics.recommendation = recommendVerdict(metrics);
  return metrics;
}

function printSummary(metrics) {
  const p = metrics.paperPerformance;
  console.log("[r7-review] Strategy Performance / Edge Review (read-only)");
  console.log(`  soak window: ${metrics.soakWindow.start} → ${metrics.soakWindow.end}`);
  console.log(`  paper closed (all-time): ${p.closedPositions ?? "n/a"}`);
  console.log(`  paper closed (soak): ${p.soakWindow?.closedTrades ?? 0}`);
  console.log(`  win rate: ${p.winRatePercent ?? "n/a"}%`);
  console.log(`  profit factor: ${p.profitFactor ?? "n/a"}`);
  console.log(`  total paper PnL (% sum): ${p.totalPaperPnlPercent ?? "n/a"}`);
  console.log(`  thesis rows w/ field: ${metrics.thesisAnalysis.rowsWithThesisField}`);
  console.log(`  pipeline dry-run events (soak): ${metrics.executionAuditSoak.pipelineDryRunEvents}`);
  console.log(`  recommended verdict: ${metrics.recommendation.verdict}`);
  console.log(`  live trading approved: false`);
}

function writeMetrics(metrics, outputFile = OUTPUT_FILE) {
  const dir = path.dirname(outputFile);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(metrics, null, 2)}\n`);
  return outputFile;
}

function runR7Review(options = {}) {
  const metrics = collectR7Metrics(options);
  const outputFile = options.outputFile || OUTPUT_FILE;
  if (options.writeOutput !== false) {
    writeMetrics(metrics, outputFile);
  }
  if (options.print !== false) {
    printSummary(metrics);
  }
  return { metrics, outputFile: options.writeOutput !== false ? outputFile : null };
}

if (require.main === module) {
  try {
    const result = runR7Review();
    if (result.outputFile) {
      console.log(`  metrics: ${result.outputFile}`);
    }
  } catch (err) {
    console.error("[r7-review] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  ROOT,
  RUNTIME_ROOT,
  OUTPUT_DIR,
  OUTPUT_FILE,
  readJsonLines,
  readJsonFile,
  resolveSoakWindow,
  summarizePaperPositions,
  summarizeThesis,
  summarizeAuditSoak,
  collectR7Metrics,
  recommendVerdict,
  runR7Review,
  writeMetrics
};
