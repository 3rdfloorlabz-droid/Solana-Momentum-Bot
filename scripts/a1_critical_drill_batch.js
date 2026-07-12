"use strict";
// A1 Critical Drill Batch — isolated temp runtime only (D01/D02/D07).
// Does not modify production live_config.json or .env.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "a1-drill-"));
const evidence = { tmpRoot: TMP, startedAt: new Date().toISOString(), drills: {} };

function copyConfig() {
  const src = path.join(ROOT, "live_config.json");
  const cfg = JSON.parse(fs.readFileSync(src, "utf8"));
  if (cfg.executionMode !== "PIPELINE_DRY_RUN" || cfg.dryRunMode !== true) {
    throw new Error("ABORT: production config posture not PIPELINE_DRY_RUN/dryRunMode true");
  }
  fs.writeFileSync(path.join(TMP, "live_config.json"), `${JSON.stringify(cfg, null, 2)}\n`);
  fs.writeFileSync(path.join(TMP, "live_positions.json"), "[]\n");
  fs.writeFileSync(path.join(TMP, "observation_dedup.json"), `${JSON.stringify({ keys: {}, pairTimestamps: {} }, null, 2)}\n`);
  fs.writeFileSync(path.join(TMP, "live_trades.jsonl"), "");
  fs.writeFileSync(path.join(TMP, "pipeline_candidates.jsonl"), "");
}

function env(extra = {}) {
  return { ...process.env, TRACKTA_RUNTIME_ROOT: TMP, ...extra };
}

function parseSweep() {
  const files = [
    "live_config.json", "live_positions.json", "observation_dedup.json",
    "live_trades.jsonl", "executor_singleton.lock.json"
  ];
  const out = {};
  for (const f of files) {
    const p = path.join(TMP, f);
    if (!fs.existsSync(p)) { out[f] = { exists: false, ok: true }; continue; }
    try {
      if (f.endsWith(".jsonl")) {
        const lines = fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean);
        lines.forEach(l => JSON.parse(l));
        out[f] = { exists: true, lines: lines.length, ok: true };
      } else {
        JSON.parse(fs.readFileSync(p, "utf8"));
        out[f] = { exists: true, ok: true };
      }
    } catch (err) {
      out[f] = { exists: true, ok: false, error: err.message };
    }
  }
  const tmpFiles = fs.readdirSync(TMP).filter(n => n.includes(".tmp"));
  out.persistentTmp = tmpFiles;
  return out;
}

function statusCapture(label) {
  const out = execSync("node live_executor.js --status", {
    cwd: ROOT, env: env(), encoding: "utf8", timeout: 30000
  });
  return {
    label,
    executionMode: /executionMode:\s*(\S+)/.exec(out)?.[1] || null,
    dryRunMode: /dryRunMode:\s*(\S+)/.exec(out)?.[1] || null,
    liveArmed: /liveArmed:\s*(\S+)/.exec(out)?.[1] || null,
    lockLine: out.split("\n").find(l => l.includes("executorSingletonLock"))?.trim() || null
  };
}

function waitLoop(child, ms) {
  return new Promise(resolve => setTimeout(resolve, ms)).then(() => child);
}

function stopChild(child, label) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
      resolve({ label, signal: "SIGKILL" });
    }, 8000);
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ label, code, signal: signal || "exit" });
    });
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
  });
}

function readDedupKeys() {
  const p = path.join(TMP, "observation_dedup.json");
  if (!fs.existsSync(p)) return [];
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  return Object.keys(data.keys || data.observedKeys || data || {}).sort();
}

async function runD01() {
  const before = statusCapture("d01_before");
  const child = spawn("node", ["live_executor.js", "--loop"], {
    cwd: ROOT, env: env(), stdio: "ignore", windowsHide: true
  });
  await waitLoop(child, 5000);
  const running = statusCapture("d01_running");
  const lockPath = path.join(TMP, "executor_singleton.lock.json");
  const lockPresent = fs.existsSync(lockPath);
  const lock = lockPresent ? JSON.parse(fs.readFileSync(lockPath, "utf8")) : null;
  const stop = await stopChild(child, "d01_stop");
  await new Promise(r => setTimeout(r, 1500));
  const afterStop = statusCapture("d01_after_stop");
  const lockAfter = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, "utf8")) : null;
  const guard = require(path.join(ROOT, "executor_singleton_guard.js"));
  const lockStatus = guard.describeExecutorLockStatus(lockPath);
  const restart = spawn("node", ["live_executor.js", "--loop"], {
    cwd: ROOT, env: env(), stdio: "ignore", windowsHide: true
  });
  await waitLoop(restart, 3000);
  const afterRestart = statusCapture("d01_after_restart");
  const restartStop = await stopChild(restart, "d01_restart_stop");
  evidence.drills.D01 = {
    pass: before.executionMode === "PIPELINE_DRY_RUN" && before.liveArmed === "false" &&
      running.lockLine && running.lockLine.includes("active") &&
      stop.signal === "SIGTERM" || stop.code === 143 || stop.code === 0,
    before, running, stop, afterStop, lockAfter, lockStatus, afterRestart, restartStop,
    parseSweep: parseSweep()
  };
}

async function runD02() {
  const guard = require(path.join(ROOT, "executor_singleton_guard.js"));
  const lockPath = path.join(TMP, "executor_singleton.lock.json");
  const staleLock = {
    schemaVersion: 1,
    instanceId: "drill-stale-test",
    pid: 99999999,
    startedAt: new Date(Date.now() - 600000).toISOString(),
    updatedAt: new Date(Date.now() - 240000).toISOString(),
    hostname: os.hostname(),
    command: "live_executor.js --loop",
    mode: "PIPELINE_DRY_RUN",
    dryRunMode: true,
    liveArmed: false
  };
  guard.writeExecutorLockAtomic(staleLock, lockPath);
  const beforeHygiene = guard.describeExecutorLockStatus(lockPath);
  const stale = guard.isExecutorLockStale(staleLock);
  fs.rmSync(lockPath, { force: true });
  const afterDelete = guard.describeExecutorLockStatus(lockPath);
  const acquire = guard.acquireExecutorSingletonGuard({
    file: lockPath,
    command: "live_executor.js --loop",
    posture: { mode: "PIPELINE_DRY_RUN", dryRunMode: true, liveArmed: false }
  });
  if (acquire.ok && acquire.instanceId) {
    guard.releaseExecutorSingletonGuard(acquire.instanceId, lockPath);
  }
  evidence.drills.D02 = {
    pass: stale === true && beforeHygiene.executorSingletonLock === "stale" &&
      afterDelete.executorSingletonLock === "none" && acquire.ok === true,
    staleLockPid: staleLock.pid,
    isStale: stale,
    beforeHygiene,
    afterDelete,
    acquire: { ok: acquire.ok, blocked: acquire.blocked || false, instanceId: acquire.instanceId || null },
    parseSweep: parseSweep()
  };
}

async function runD07() {
  const dedupBefore = readDedupKeys();
  const child = spawn("node", ["live_executor.js", "--loop"], {
    cwd: ROOT, env: env(), stdio: "ignore", windowsHide: true
  });
  await waitLoop(child, 8000);
  const dedupMid = readDedupKeys();
  await stopChild(child, "d07_stop1");
  await new Promise(r => setTimeout(r, 1000));
  const dedupAfterStop = readDedupKeys();
  const child2 = spawn("node", ["live_executor.js", "--loop"], {
    cwd: ROOT, env: env(), stdio: "ignore", windowsHide: true
  });
  await waitLoop(child2, 8000);
  const dedupAfterRestart = readDedupKeys();
  await stopChild(child2, "d07_stop2");
  const dedupFinal = readDedupKeys();
  const dedupParse = (() => {
    try { JSON.parse(fs.readFileSync(path.join(TMP, "observation_dedup.json"), "utf8")); return true; }
    catch { return false; }
  })();
  evidence.drills.D07 = {
    pass: dedupParse && JSON.stringify(dedupAfterStop) === JSON.stringify(dedupMid) &&
      dedupFinal.length >= dedupBefore.length,
    dedupBeforeCount: dedupBefore.length,
    dedupMidCount: dedupMid.length,
    dedupAfterStopCount: dedupAfterStop.length,
    dedupAfterRestartCount: dedupAfterRestart.length,
    dedupFinalCount: dedupFinal.length,
    dedupParseOk: dedupParse,
    parseSweep: parseSweep()
  };
}

async function main() {
  copyConfig();
  evidence.preflight = {
    recoveryActionsProdAbsent: !fs.existsSync(path.join(ROOT, "recovery_actions.jsonl")),
    prodParseSweep: (() => {
      const files = ["live_config.json", "live_positions.json", "observation_dedup.json"];
      return files.every(f => {
        try { JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); return true; } catch { return f === "observation_dedup.json" && !fs.existsSync(path.join(ROOT, f)); }
      });
    })()
  };
  await runD01();
  await runD02();
  await runD07();
  evidence.completedAt = new Date().toISOString();
  evidence.allPass = evidence.drills.D01.pass && evidence.drills.D02.pass && evidence.drills.D07.pass;
  const outPath = path.join(ROOT, "analysis", "a1_critical_drill_batch_evidence.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ allPass: evidence.allPass, outPath, drills: {
    D01: evidence.drills.D01.pass,
    D02: evidence.drills.D02.pass,
    D07: evidence.drills.D07.pass
  }}, null, 2));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(evidence.allPass ? 0 : 1);
}

main().catch(err => {
  console.error("ABORT:", err.message);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(2);
});
