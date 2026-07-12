"use strict";

const executor = require("./live_executor");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const cfg = {
  maxDailyLossCount: 2,
  maxDailyLossSol: 0.10
};

const oneLoss = { tradesToday: 1, lossesToday: 1, realizedPnlSol: -0.01 };
const twoLosses = { tradesToday: 2, lossesToday: 2, realizedPnlSol: -0.02 };

const stopOne = executor.dailyStopHit(cfg, oneLoss);
assert(!stopOne.hit, "one loss should not trigger daily stop at count 2");
assert(!stopOne.lossCountHit, "lossCountHit false at 1/2");

const stopTwo = executor.dailyStopHit(cfg, twoLosses);
assert(stopTwo.hit, "two losses should trigger daily stop");
assert(stopTwo.lossCountHit, "lossCountHit true at 2/2");

const defaultCfg = {};
const stopDefault = executor.dailyStopHit(defaultCfg, twoLosses);
assert(stopDefault.lossCountHit, "default maxDailyLossCount should be 2 when unset");

const gate = executor.safetyCheck({
  automationEnabled: true,
  emergencyStop: false,
  maxOpenTrades: 1,
  maxDailyLossCount: 2,
  maxDailyLossSol: 0.10,
  maxSessionLossSol: 0.03,
  sessionStartedAt: new Date().toISOString()
});
assert(gate.allowed, "safetyCheck should remain allowed without live trade history");

console.log("DAILY LOSS COUNT STOP TEST PASSED");
