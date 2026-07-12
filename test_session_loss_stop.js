"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "r14-g1-session-"));
process.env.TRACKTA_RUNTIME_ROOT = TEMP_ROOT;

const executor = require("./live_executor");
const TRADES_FILE = executor.FILES.LIVE_TRADES_FILE;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeClosedTrade({ exitTime, netPnlSol, status = "LOSS" }) {
  const row = {
    eventType: "CLOSED_LIVE_TRADE",
    liveTradeId: `test-${Date.now()}-${Math.random()}`,
    exitTime,
    netPnlSol,
    status
  };
  fs.appendFileSync(TRADES_FILE, `${JSON.stringify(row)}\n`);
}

const cfgBase = {
  automationEnabled: true,
  emergencyStop: false,
  maxOpenTrades: 1,
  maxDailyLossSol: 0.10,
  maxSessionLossSol: 0.03,
  maxDailyLossCount: 2,
  sessionStartedAt: "2026-07-01T00:00:00.000Z"
};

writeClosedTrade({
  exitTime: "2026-07-02T12:00:00.000Z",
  netPnlSol: -0.04,
  status: "LOSS"
});

const session = executor.sessionStats(cfgBase);
assert(session.realizedPnlSol <= -0.03, "session realized loss should exceed cap");
assert(session.tradesInSession === 1, "trade before today should count in session");

const sessionStop = executor.sessionStopHit(cfgBase, session);
assert(sessionStop.hit, "session stop should hit on maxSessionLossSol");
assert(sessionStop.lossSolHit, "session lossSolHit should be true");

const daily = executor.todayStats();
const dailyStop = executor.dailyStopHit(cfgBase, daily);
assert(!dailyStop.hit, "daily stop should not hit when no trades closed today");

const gate = executor.safetyCheck(cfgBase);
assert(!gate.allowed, "entries blocked when session stop active");
assert(
  gate.reasons.some(r => r.startsWith("Session SOL-loss stop")),
  "safetyCheck should surface session stop reason"
);

console.log("SESSION LOSS STOP TEST PASSED");
