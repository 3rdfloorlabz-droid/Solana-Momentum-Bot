"use strict";

const scanner = require("./scanner_gmgn_trending");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const baseCtx = () => {
  const ctx = scanner.createScanHealthContext();
  ctx.uniqueTokenCount = 42;
  ctx.trendingIntervals = {
    "1m": { ok: true, rowCount: 40, error: null },
    "5m": { ok: true, rowCount: 38, error: null },
    "1h": { ok: true, rowCount: 35, error: null }
  };
  ctx.scanStats.resultsCount = 0;
  return ctx;
};

(() => {
  const quiet = scanner.buildScannerHealthSnapshot(baseCtx());
  assert(quiet.lastScanStatus === "ok", "quiet market scan should be ok");
  assert(quiet.quietMarket === true, "quietMarket flag should be true for zero results");
  const quietClass = scanner.classifyScannerHealth(quiet, Date.now());
  assert(quietClass.status === "HEALTHY", "quiet market should classify HEALTHY");

  const degradedCtx = baseCtx();
  degradedCtx.trendingIntervals["5m"] = { ok: false, rowCount: 0, error: "timeout" };
  degradedCtx.errors.gmgnTrendingFailures = 1;
  const degraded = scanner.buildScannerHealthSnapshot(degradedCtx);
  assert(degraded.lastScanStatus === "degraded", "partial GMGN failure should be degraded");
  const degradedClass = scanner.classifyScannerHealth(degraded, Date.now());
  assert(degradedClass.status === "DEGRADED", "GMGN interval failure should classify DEGRADED");

  const stalled = scanner.buildScannerHealthSnapshot(baseCtx());
  stalled.watchMode = true;
  stalled.scanIntervalMs = 60000;
  stalled.lastScanAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const stalledClass = scanner.classifyScannerHealth(stalled, Date.now());
  assert(stalledClass.status === "STALLED", "old watch scan should classify STALLED");

  const missing = scanner.classifyScannerHealth(null, Date.now());
  assert(missing.status === "NO_DATA", "missing health should classify NO DATA");

  console.log("SCANNER HEALTH TEST PASSED");
})();
