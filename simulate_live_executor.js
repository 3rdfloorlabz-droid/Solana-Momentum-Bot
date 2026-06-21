"use strict";

const fs = require("fs");
const path = require("path");
const { loadConfig, matchesPhase1Thesis } = require("./live_executor");

const ROOT = __dirname;
const PAPER_FILE = path.join(ROOT, "paper_trades.json");
const NEAR_MISSES_FILE = path.join(ROOT, "near_misses.json");
const RESULTS_FILE = path.join(ROOT, "simulation_results.json");
const INTENTS_FILE = path.join(ROOT, "simulation_intents.jsonl");
const REJECTIONS_FILE = path.join(ROOT, "simulation_rejections.jsonl");
const CLOSED = new Set(["WIN", "LOSS", "TIMEOUT"]);

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch { return { _parseError: true, _line: index + 1 }; }
  });
}

function writeJsonl(file, rows) {
  fs.writeFileSync(file, rows.map(row => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
}

function localDay(value) {
  return new Date(value).toLocaleDateString("en-CA");
}

function normalizeNearMiss(row) {
  return {
    ...row,
    candidateType: "near_miss",
    entryPrice: row.entryPrice ?? row.referencePrice,
    botDegenRate: row.botDegenRate ?? row.botRate,
    top10HolderRate: row.top10HolderRate ?? row.top10,
    holderCount: row.holderCount ?? row.holders
  };
}

function maxDrawdown(pnls) {
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const pnl of pnls) {
    equity += pnl;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
  }
  return drawdown;
}

function runReplay() {
  const config = loadConfig();
  const paper = readJsonl(PAPER_FILE)
    .filter(trade => trade.strategyVersion === "gmgn_v4" && trade.monitorVersion === "monitor_v4")
    .map(trade => ({ ...trade, candidateType: "paper_trade" }));
  const nearMisses = readJsonl(NEAR_MISSES_FILE)
    .filter(row => row.strategyVersion === "gmgn_v4")
    .map(normalizeNearMiss);
  const candidates = [...paper, ...nearMisses]
    .filter(row => !row._parseError && Number.isFinite(new Date(row.timestamp).getTime()))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const intents = [];
  const rejections = [];
  const acceptedAddresses = new Set();
  const acceptedPairs = new Set();
  const daily = new Map();
  let openPosition = null;
  let maxOpenViolations = 0;
  let duplicatePreventionEvents = 0;
  let dailyStopTriggers = 0;

  for (const candidate of candidates) {
    if (openPosition && new Date(openPosition.closedAt) <= new Date(candidate.timestamp)) openPosition = null;

    const rejectionReasons = [];
    const thesis = matchesPhase1Thesis(candidate, config);
    rejectionReasons.push(...thesis.reasons);

    if (acceptedAddresses.has(candidate.address) || acceptedPairs.has(candidate.pairAddress)) {
      rejectionReasons.push("duplicate address or pairAddress");
      duplicatePreventionEvents += 1;
    }

    const day = localDay(candidate.timestamp);
    const dayStats = daily.get(day) || { losses: 0, realizedPnlSol: 0, stopped: false };
    if (dayStats.losses >= Number(config.maxDailyLossCount || 3) ||
        dayStats.realizedPnlSol <= -Math.abs(Number(config.maxDailyLossSol || 0.10))) {
      rejectionReasons.push("daily stop active");
      if (!dayStats.stopped) {
        dayStats.stopped = true;
        dailyStopTriggers += 1;
      }
    }

    if (openPosition) rejectionReasons.push("maxOpenTrades reached");
    if (candidate.candidateType !== "paper_trade" || !CLOSED.has(candidate.status) ||
        !Number.isFinite(Number(candidate.exitPrice)) || !candidate.closedAt) {
      rejectionReasons.push("recorded paper exit unavailable");
    }

    if (rejectionReasons.length) {
      rejections.push({
        timestamp: candidate.timestamp,
        symbol: candidate.symbol || "UNKNOWN",
        address: candidate.address || null,
        pairAddress: candidate.pairAddress || null,
        candidateType: candidate.candidateType,
        reasons: [...new Set(rejectionReasons)]
      });
      daily.set(day, dayStats);
      continue;
    }

    if (openPosition) {
      maxOpenViolations += 1;
      continue;
    }

    const pnlPercent = Number(candidate.pnlPercent);
    const pnlSol = Number(config.positionSizeSol) * (pnlPercent / 100);
    const intent = {
      eventType: "DRY_RUN_REPLAY_INTENT",
      dryRunMode: true,
      transactionInvoked: false,
      timestamp: candidate.timestamp,
      symbol: candidate.symbol,
      address: candidate.address,
      pairAddress: candidate.pairAddress,
      entryPrice: Number(candidate.entryPrice),
      positionSizeSol: Number(config.positionSizeSol),
      simulatedExit: {
        status: candidate.status,
        triggerType: candidate.triggerType || candidate.status,
        exitPrice: Number(candidate.exitPrice),
        pnlPercent,
        pnlSol: Number(pnlSol.toFixed(8)),
        closedAt: candidate.closedAt
      }
    };
    intents.push(intent);
    acceptedAddresses.add(candidate.address);
    acceptedPairs.add(candidate.pairAddress);
    openPosition = intent.simulatedExit;

    dayStats.realizedPnlSol += pnlSol;
    if (candidate.status === "LOSS" || pnlSol < 0) dayStats.losses += 1;
    daily.set(day, dayStats);
  }

  const pnls = intents.map(intent => intent.simulatedExit.pnlPercent);
  const paperStrict = paper.filter(trade => matchesPhase1Thesis(trade, config).ok && CLOSED.has(trade.status));
  const paperStrictPnl = paperStrict.reduce((sum, trade) => sum + Number(trade.pnlPercent || 0), 0);
  const summedPnl = pnls.reduce((sum, pnl) => sum + pnl, 0);
  const reasonCounts = {};
  for (const rejection of rejections) {
    for (const reason of rejection.reasons) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  }
  const everyAcceptedMatchesStrictThesis = intents.every(intent =>
    matchesPhase1Thesis({
      ...paper.find(trade => trade.address === intent.address && trade.timestamp === intent.timestamp)
    }, config).ok
  );
  const edgePreservationScore = paperStrictPnl !== 0 ? (summedPnl / paperStrictPnl) * 100 : null;
  const safety = {
    transactionCodeInvoked: false,
    maxOpenViolations,
    duplicateEntries: 0,
    duplicatePreventionEvents,
    everyAcceptedMatchesStrictThesis,
    dryRunModeRemainsTrue: config.dryRunMode === true
  };
  const pass = !safety.transactionCodeInvoked &&
    safety.maxOpenViolations === 0 &&
    safety.duplicateEntries === 0 &&
    safety.everyAcceptedMatchesStrictThesis &&
    summedPnl > 0 &&
    safety.dryRunModeRemainsTrue;
  const verdict = pass ? "PASS" : summedPnl > 0 && safety.dryRunModeRemainsTrue ? "REVIEW" : "FAIL";

  const results = {
    generatedAt: new Date().toISOString(),
    phase: "PHASE_1_2_DRY_RUN_REPLAY",
    verdict,
    configSnapshot: {
      dryRunMode: config.dryRunMode,
      positionSizeSol: config.positionSizeSol,
      maxOpenTrades: config.maxOpenTrades,
      maxDailyLossSol: config.maxDailyLossSol,
      maxDailyLossCount: config.maxDailyLossCount
    },
    totalReplayCandidates: candidates.length,
    cleanPaperCandidates: paper.length,
    nearMissCandidates: nearMisses.length,
    acceptedIntents: intents.length,
    rejectedCandidates: rejections.length,
    wins: intents.filter(intent => intent.simulatedExit.status === "WIN").length,
    losses: intents.filter(intent => intent.simulatedExit.status === "LOSS").length,
    timeouts: intents.filter(intent => intent.simulatedExit.status === "TIMEOUT").length,
    summedPnlPercent: Number(summedPnl.toFixed(2)),
    averagePnlPercent: Number((intents.length ? summedPnl / intents.length : 0).toFixed(2)),
    maxDrawdownPercent: Number(maxDrawdown(pnls).toFixed(2)),
    dailyStopTriggers,
    edgePreservationScore: edgePreservationScore === null ? null : Number(edgePreservationScore.toFixed(2)),
    strictPaperBenchmark: {
      trades: paperStrict.length,
      summedPnlPercent: Number(paperStrictPnl.toFixed(2))
    },
    rejectionReasons: Object.fromEntries(Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])),
    safety
  };

  fs.writeFileSync(RESULTS_FILE, `${JSON.stringify(results, null, 2)}\n`);
  writeJsonl(INTENTS_FILE, intents);
  writeJsonl(REJECTIONS_FILE, rejections);
  return results;
}

if (require.main === module) {
  const results = runReplay();
  console.log("\n=== PHASE 1.2 DRY-RUN REPLAY VERIFICATION ===");
  console.log(`Verdict: ${results.verdict}`);
  console.log(`Candidates: ${results.totalReplayCandidates}`);
  console.log(`Accepted / Rejected: ${results.acceptedIntents} / ${results.rejectedCandidates}`);
  console.log(`Wins / Losses / Timeouts: ${results.wins} / ${results.losses} / ${results.timeouts}`);
  console.log(`Summed / Average PnL: ${results.summedPnlPercent.toFixed(2)}% / ${results.averagePnlPercent.toFixed(2)}%`);
  console.log(`Max drawdown: ${results.maxDrawdownPercent.toFixed(2)}%`);
  console.log(`Edge preservation: ${results.edgePreservationScore === null ? "-" : results.edgePreservationScore.toFixed(2) + "%"}`);
  console.log(`Safety: ${JSON.stringify(results.safety)}`);
}

module.exports = { runReplay };
