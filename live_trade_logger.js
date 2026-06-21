const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, "live_config.json");
const LIVE_TRADES_FILE = path.join(ROOT, "live_trades.json");

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
}

function readEvents() {
  if (!fs.existsSync(LIVE_TRADES_FILE)) return [];
  return fs.readFileSync(LIVE_TRADES_FILE, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function appendEvent(eventType, details = {}) {
  const event = {
    eventType,
    timestamp: new Date().toISOString(),
    ...details
  };
  fs.appendFileSync(LIVE_TRADES_FILE, `${JSON.stringify(event)}\n`);
  return event;
}

function tradeId(details) {
  const value = details.liveTradeId || details.tradeId;
  if (!value) throw new Error("liveTradeId is required.");
  return value;
}

function groupTrades(events = readEvents()) {
  const grouped = new Map();
  for (const event of events) {
    if (!event.liveTradeId) continue;
    const trade = grouped.get(event.liveTradeId) || { liveTradeId: event.liveTradeId, events: [] };
    trade.events.push(event);
    Object.assign(trade, event);
    grouped.set(event.liveTradeId, trade);
  }
  return [...grouped.values()];
}

function localDayKey(value = new Date()) {
  return new Date(value).toLocaleDateString("en-CA");
}

function safetyStatus({ manualConfirmed = false, currentCapitalUsd, peakCapitalUsd } = {}) {
  const config = loadConfig();
  const trades = groupTrades();
  const openTrades = trades.filter(trade => trade.actualEntryPrice && !trade.actualExitPrice && trade.success !== false);
  const today = localDayKey();
  const todayPnlSol = trades
    .filter(trade => trade.actualExitTimestamp && localDayKey(trade.actualExitTimestamp) === today)
    .reduce((sum, trade) => sum + Number(trade.actualPnlSol || 0), 0);
  const dailyLossSol = Math.abs(Math.min(0, todayPnlSol));
  const drawdownPercent = Number.isFinite(Number(currentCapitalUsd)) &&
    Number.isFinite(Number(peakCapitalUsd)) &&
    Number(peakCapitalUsd) > 0
    ? ((Number(peakCapitalUsd) - Number(currentCapitalUsd)) / Number(peakCapitalUsd)) * 100
    : 0;
  const reasons = [];

  if (!config.liveTradingEnabled) reasons.push("Live trading is disabled.");
  if (config.requireManualConfirm && !manualConfirmed) reasons.push("Manual confirmation is required.");
  if (openTrades.length >= config.maxOpenTrades) reasons.push("Maximum open live trades reached.");
  if (dailyLossSol >= config.maxDailyLossSol) reasons.push("Maximum daily loss reached.");
  if (drawdownPercent >= config.maxDrawdownPercent) reasons.push("Maximum account drawdown reached.");

  return {
    allowed: reasons.length === 0,
    reasons,
    liveTradingEnabled: config.liveTradingEnabled,
    requireManualConfirm: config.requireManualConfirm,
    openTrades: openTrades.length,
    dailyLossSol,
    drawdownPercent
  };
}

function assertExecutionAllowed(options = {}) {
  const status = safetyStatus(options);
  if (!status.allowed) throw new Error(`Live execution blocked: ${status.reasons.join(" ")}`);
  return status;
}

function recordIntendedPaperEntry(details) {
  return appendEvent("INTENDED_PAPER_ENTRY", {
    ...details,
    liveTradeId: tradeId(details),
    strategyVersion: details.strategyVersion || "gmgn_v4"
  });
}

function recordActualLiveEntry(details, safetyOptions = {}) {
  assertExecutionAllowed(safetyOptions);
  return appendEvent("ACTUAL_LIVE_ENTRY", {
    ...details,
    liveTradeId: tradeId(details),
    success: details.success !== false
  });
}

function recordIntendedPaperExit(details) {
  return appendEvent("INTENDED_PAPER_EXIT", { ...details, liveTradeId: tradeId(details) });
}

function recordActualLiveExit(details) {
  return appendEvent("ACTUAL_LIVE_EXIT", {
    ...details,
    liveTradeId: tradeId(details),
    success: details.success !== false
  });
}

function recordExecutionFailure(details) {
  if (!details.reasonForFailure) throw new Error("reasonForFailure is required.");
  return appendEvent("EXECUTION_FAILURE", {
    ...details,
    liveTradeId: tradeId(details),
    success: false
  });
}

module.exports = {
  appendEvent,
  assertExecutionAllowed,
  groupTrades,
  loadConfig,
  readEvents,
  recordActualLiveEntry,
  recordActualLiveExit,
  recordExecutionFailure,
  recordIntendedPaperEntry,
  recordIntendedPaperExit,
  safetyStatus
};
