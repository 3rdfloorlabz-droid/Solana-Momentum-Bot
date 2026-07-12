"use strict";
// Ephemeral helper for B2A/R7b rehearsal checkpoints — read-only evidence capture.
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const label = process.argv[2] || "unknown";
const runLabel = process.env.B2A_RUN_LABEL || "B2A_R7B_12H_EXTENDED_OBSERVATION_NOT_24H";
const startIso = process.env.B2A_OBSERVATION_START || null;

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function scannerAgeMs(sh) {
  if (!sh || !sh.lastScanAt) return null;
  const t = Date.parse(sh.lastScanAt);
  return Number.isFinite(t) ? Date.now() - t : null;
}

function lockAgeMs(lock) {
  if (!lock || !lock.updatedAt) return null;
  const t = Date.parse(lock.updatedAt);
  return Number.isFinite(t) ? Date.now() - t : null;
}

function fetchRuntimeHealth() {
  return new Promise((resolve) => {
    const req = http.get("http://localhost:3000/api/runtime-health", { timeout: 25000 }, (res) => {
      let d = "";
      res.on("data", (c) => { d += c; });
      res.on("end", () => {
        try { resolve({ statusCode: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ statusCode: res.statusCode, body: null }); }
      });
    });
    req.on("error", () => resolve({ statusCode: null, body: null }));
    req.on("timeout", () => { req.destroy(); resolve({ statusCode: null, body: null }); });
  });
}

(async () => {
  const scanner = readJson(path.join(ROOT, "scanner_health.json"));
  const lock = readJson(path.join(ROOT, "executor_singleton.lock.json"));
  const scanAge = scannerAgeMs(scanner);
  const lockAge = lockAgeMs(lock);
  let statusOut = "";
  try {
    statusOut = execSync("node live_executor.js --status", { cwd: ROOT, encoding: "utf8", timeout: 60000 });
  } catch (e) {
    statusOut = (e.stdout || "") + (e.stderr || "");
  }
  const dryRun = /dryRunMode:\s*true/.test(statusOut);
  const liveArmed = /liveArmed:\s*true/.test(statusOut);
  const mode = (statusOut.match(/executionMode:\s*(\S+)/) || [])[1] || null;
  const rhResp = await fetchRuntimeHealth();
  const rh = rhResp.body;
  const rt = rh && rh.runtimeHealth ? rh.runtimeHealth : {};
  const a4 = rt.a4Health || {};
  const startMs = startIso ? Date.parse(startIso) : null;
  const elapsedMs = Number.isFinite(startMs) ? Date.now() - startMs : null;
  const out = {
    runLabel,
    label,
    timestamp: new Date().toISOString(),
    elapsedMs,
    elapsedHuman: elapsedMs !== null ? `${Math.floor(elapsedMs / 3600000)}h ${Math.floor((elapsedMs % 3600000) / 60000)}m` : null,
    scanner: {
      lastScanAt: scanner && scanner.lastScanAt ? scanner.lastScanAt : null,
      ageMs: scanAge,
      fresh: scanAge !== null && scanAge < 5 * 60 * 1000,
      stale: scanAge !== null && scanAge > 30 * 60 * 1000
    },
    lock: {
      updatedAt: lock && lock.updatedAt ? lock.updatedAt : null,
      ageMs: lockAge,
      current: lockAge !== null && lockAge <= 3 * 60 * 1000,
      present: !!lock
    },
    executorStatus: { executionMode: mode, dryRunMode: dryRun, liveArmed },
    runtimeHealth: rh ? {
      httpStatus: rhResp.statusCode,
      classification: rt.classification,
      executorLoopConfirmed: rt.executorLoopConfirmed,
      supportsLiveReadiness: rt.supportsLiveReadiness,
      supportsSoakClaim: rt.supportsSoakClaim,
      capitalExposure: rt.capitalExposure,
      warnings: rt.warnings,
      a4Status: a4.status,
      a4SupportsLiveReadiness: a4.supportsLiveReadiness,
      a4SupportsSoakClaim: a4.supportsSoakClaim
    } : null
  };
  console.log(JSON.stringify(out, null, 2));
})();
