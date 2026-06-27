"use strict";

// soak_checkpoint.js — Sprint 4 R6a
// Read-only dry-run soak checkpoint collector. Evidence only — no trading, recovery,
// process start/stop/kill, or config mutation.
//
// Allowlisted child_process uses (read-only checkpoint evidence only):
//   1. git status --short
//   2. node run_safety_tests.js (optional; --run-safety)
//   3. PowerShell Get-CimInstance Win32_Process (read-only process inventory on Windows)

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const executorSingletonGuard = require("./executor_singleton_guard");

const REPO_ROOT = __dirname;
const RUNTIME_ROOT = process.env.TRACKTA_RUNTIME_ROOT
  ? path.resolve(process.env.TRACKTA_RUNTIME_ROOT)
  : REPO_ROOT;
const DEFAULT_SOAK_RUNS_DIR = path.join(REPO_ROOT, "soak_runs");
const CHECKPOINT_JSONL = "r6a_24h_soak_checkpoints.jsonl";
const LATEST_JSON = "r6a_24h_soak_latest.json";

const PROCESS_PATTERNS = {
  scanner: /scanner_gmgn_trending\.js/,
  monitor: /(?:^|[\\/])monitor\.js/,
  walletMonitor: /wallet_monitor\.js/,
  dashboard: /dashboard_server\.js/,
  executor: /live_executor\.js/
};

const STATE_FILES = [
  "live_positions.json",
  "observation_dedup.json",
  "paper_positions.json",
  "scanner_health.json",
  "wallet_status.json"
];

const FORBIDDEN_SPAWN = /taskkill|Stop-Process|start_fomo|stop_fomo|live_executor\.js.*--loop/i;

function getSoakRunsDir(override) {
  return override || process.env.SOAK_RUNS_DIR || DEFAULT_SOAK_RUNS_DIR;
}

function readJsonFileStatus(root, name) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) {
    return { exists: false, parseOk: true, skipped: true };
  }
  try {
    JSON.parse(fs.readFileSync(file, "utf8"));
    return { exists: true, parseOk: true };
  } catch (err) {
    return {
      exists: true,
      parseOk: false,
      error: err && err.message ? err.message : String(err)
    };
  }
}

function readConfigPosture(root) {
  const file = path.join(root, "live_config.json");
  if (!fs.existsSync(file)) {
    return { available: false };
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
    const executionMode = ["DRY_RUN", "PIPELINE_DRY_RUN", "LIVE"].includes(cfg?.executionMode)
      ? cfg.executionMode
      : (cfg?.dryRunMode === false ? "LIVE" : "DRY_RUN");
    return {
      available: true,
      executionMode,
      dryRunMode: cfg?.dryRunMode !== false,
      emergencyStop: cfg?.emergencyStop === true
    };
  } catch (err) {
    return {
      available: false,
      parseError: err && err.message ? err.message : String(err)
    };
  }
}

function readGitStatusSummary() {
  const result = spawnSync("git", ["status", "--short"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false
  });
  if (result.error || result.status !== 0) {
    return {
      available: false,
      summary: "",
      error: result.error ? result.error.message : `git exit ${result.status}`
    };
  }
  const summary = (result.stdout || "").trim();
  return { available: true, summary, clean: summary.length === 0 };
}

function runSafetySuiteCheck() {
  const result = spawnSync(process.execPath, ["run_safety_tests.js"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const match = output.match(/(\d+)\/(\d+)\s+safety tests passed/);
  return {
    run: true,
    passed: result.status === 0,
    exitCode: result.status === null ? 1 : result.status,
    count: match ? `${match[1]}/${match[2]}` : null,
    outputTail: output.trim().split(/\r?\n/).slice(-5).join("\n")
  };
}

function listProcessesWindows() {
  const ps = [
    "Get-CimInstance Win32_Process",
    "| Where-Object { $_.CommandLine }",
    "| Select-Object ProcessId, CommandLine",
    "| ConvertTo-Json -Compress"
  ].join(" ");
  const result = spawnSync("powershell", ["-NoProfile", "-Command", ps], {
    encoding: "utf8",
    shell: false
  });
  if (result.error || result.status !== 0) {
    return { available: false, processes: [], error: "process inventory unavailable" };
  }
  const raw = (result.stdout || "").trim();
  if (!raw) return { available: true, processes: [] };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { available: false, processes: [], error: "process inventory parse failed" };
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return {
    available: true,
    processes: rows
      .filter(row => row && row.ProcessId && row.CommandLine)
      .map(row => ({
        pid: Number(row.ProcessId),
        commandLine: String(row.CommandLine)
      }))
  };
}

function isActualNodeExecutorLoop(commandLine) {
  const cmd = commandLine || "";
  if (!/\blive_executor\.js\b/.test(cmd)) return false;
  if (!/\s--loop(?:\s|$)/.test(cmd)) return false;
  if (/\bpowershell(?:\.exe)?\b/i.test(cmd)) return false;
  if (/(?:^|[\s"'])cmd(?:\.exe)?\b/i.test(cmd)) return false;
  return /\bnode(?:\.exe)?\b/i.test(cmd);
}

function classifyProcesses(processRows) {
  const buckets = {
    scanner: [],
    monitor: [],
    walletMonitor: [],
    dashboard: [],
    executorAll: [],
    executorLoop: []
  };
  for (const row of processRows) {
    const cmd = row.commandLine || "";
    if (PROCESS_PATTERNS.scanner.test(cmd)) buckets.scanner.push(row);
    if (PROCESS_PATTERNS.monitor.test(cmd) && !/wallet_monitor\.js/.test(cmd)) buckets.monitor.push(row);
    if (PROCESS_PATTERNS.walletMonitor.test(cmd)) buckets.walletMonitor.push(row);
    if (PROCESS_PATTERNS.dashboard.test(cmd)) buckets.dashboard.push(row);
    if (PROCESS_PATTERNS.executor.test(cmd)) {
      buckets.executorAll.push(row);
      if (isActualNodeExecutorLoop(cmd)) buckets.executorLoop.push(row);
    }
  }
  return {
    ...buckets,
    executorLoopCount: buckets.executorLoop.length
  };
}

function readLockSnapshot(runtimeRoot) {
  const lockFile = executorSingletonGuard.getExecutorLockPath(
    path.join(runtimeRoot, executorSingletonGuard.LOCK_FILE_NAME)
  );
  const exists = fs.existsSync(lockFile);
  const described = executorSingletonGuard.describeExecutorLockStatus(lockFile);
  const read = executorSingletonGuard.readExecutorLock(lockFile);
  const lock = read.state === "present" || read.state === "malformed" ? read.lock : null;
  return {
    file: lockFile,
    exists,
    state: described.executorSingletonLock,
    pid: lock?.pid ?? null,
    instanceId: lock?.instanceId ?? null,
    updatedAt: lock?.updatedAt ?? null,
    mode: lock?.mode ?? null,
    dryRunMode: lock?.dryRunMode,
    liveArmed: lock?.liveArmed,
    malformed: read.state === "malformed",
    validation: read.validation || null
  };
}

function derivePosture(lock, configPosture) {
  const mode = lock.mode
    ?? (configPosture.available ? configPosture.executionMode : null);
  const dryRunMode = lock.dryRunMode !== undefined && lock.dryRunMode !== null
    ? lock.dryRunMode === true
    : (configPosture.available ? configPosture.dryRunMode === true : null);
  const liveArmed = lock.liveArmed !== undefined && lock.liveArmed !== null
    ? lock.liveArmed === true
    : false;
  return { mode, dryRunMode, liveArmed };
}

function evaluateCheckpointVerdict(snapshot) {
  const failReasons = [];
  const posture = snapshot.posture || {};
  const lock = snapshot.executorLock || {};
  const processes = snapshot.processes || {};
  const safety = snapshot.safetySuite || {};
  const recovery = snapshot.recoveryActionsJsonl || {};
  const stateFiles = snapshot.stateFiles || {};

  if (posture.mode !== "PIPELINE_DRY_RUN") {
    failReasons.push(`executionMode is ${posture.mode ?? "unknown"} (expected PIPELINE_DRY_RUN)`);
  }
  if (posture.dryRunMode !== true) {
    failReasons.push(`dryRunMode is ${posture.dryRunMode} (expected true)`);
  }
  if (posture.liveArmed === true) {
    failReasons.push("liveArmed is true (expected false)");
  }

  const loopCount = processes.executorLoopCount ?? 0;
  if (loopCount === 0) failReasons.push("zero executor --loop processes");
  if (loopCount > 1) failReasons.push(`more than one executor --loop process (${loopCount})`);

  if (loopCount >= 1) {
    if (!lock.exists) failReasons.push("singleton lock missing while executor loop active");
    if (lock.malformed || lock.state === "malformed") failReasons.push("singleton lock malformed");
    if (snapshot.lockPidMatch && snapshot.lockPidMatch.matches === false) {
      failReasons.push("singleton lock pid mismatch with executor loop process");
    }
  }

  if (recovery.exists === true) {
    failReasons.push("recovery_actions.jsonl exists unexpectedly");
  }

  if (safety.run === true && safety.passed !== true) {
    failReasons.push("safety suite failed or did not complete");
  }

  for (const [name, status] of Object.entries(stateFiles)) {
    if (status.exists && status.parseOk === false) {
      failReasons.push(`${name} corrupt or unparsable`);
    }
  }

  return {
    verdict: failReasons.length ? "FAIL" : "PASS",
    failReasons
  };
}

function healthySimulateFixture(overrides = {}) {
  return {
    gitStatus: { available: true, summary: "", clean: true },
    safetySuite: { run: true, passed: true, count: "19/19" },
    recoveryActionsJsonl: { exists: false },
    executorLock: {
      exists: true,
      state: "active",
      pid: 4242,
      instanceId: "fixture-instance",
      updatedAt: new Date().toISOString(),
      mode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false,
      malformed: false
    },
    processInventory: { available: true, processes: [] },
    processes: {
      scanner: [{ pid: 1, commandLine: "node scanner_gmgn_trending.js --watch" }],
      monitor: [{ pid: 2, commandLine: "node monitor.js" }],
      walletMonitor: [{ pid: 3, commandLine: "node wallet_monitor.js" }],
      dashboard: [{ pid: 4, commandLine: "node dashboard_server.js" }],
      executorAll: [{ pid: 4242, commandLine: "node live_executor.js --loop" }],
      executorLoop: [{ pid: 4242, commandLine: "node live_executor.js --loop" }],
      executorLoopCount: 1
    },
    lockPidMatch: { lockPid: 4242, executorLoopPids: [4242], matches: true },
    configPosture: {
      available: true,
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      emergencyStop: false
    },
    posture: { mode: "PIPELINE_DRY_RUN", dryRunMode: true, liveArmed: false },
    stateFiles: {
      "live_positions.json": { exists: true, parseOk: true },
      "observation_dedup.json": { exists: true, parseOk: true },
      "paper_positions.json": { exists: true, parseOk: true },
      "scanner_health.json": { exists: true, parseOk: true },
      "wallet_status.json": { exists: true, parseOk: true }
    },
    ...overrides
  };
}

function collectSoakCheckpoint(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const checkpointLabel = options.checkpointLabel || "manual";
  const runSafetySuite = options.runSafetySuite === true;
  const simulate = options.simulate || null;

  let gitStatus = simulate?.gitStatus ?? readGitStatusSummary();
  let safetySuite = simulate?.safetySuite ?? (
    runSafetySuite ? runSafetySuiteCheck() : { run: false, passed: null, count: null }
  );
  let recoveryActionsJsonl = simulate?.recoveryActionsJsonl ?? {
    exists: fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"))
  };
  let executorLock = simulate?.executorLock ?? readLockSnapshot(runtimeRoot);
  let processInventory = simulate?.processInventory ?? (
    process.platform === "win32" ? listProcessesWindows() : { available: false, processes: [] }
  );
  let processes = simulate?.processes ?? classifyProcesses(processInventory.processes || []);
  let configPosture = simulate?.configPosture ?? readConfigPosture(runtimeRoot);
  let stateFiles = simulate?.stateFiles ?? Object.fromEntries(
    STATE_FILES.map(name => [name, readJsonFileStatus(runtimeRoot, name)])
  );

  const posture = simulate?.posture ?? derivePosture(executorLock, configPosture);

  const executorLoopPids = (processes.executorLoop || []).map(row => row.pid);
  const lockPidMatch = simulate?.lockPidMatch ?? {
    lockPid: executorLock.pid ?? null,
    executorLoopPids,
    matches: executorLoopPids.length === 1 &&
      executorLock.pid !== null &&
      executorLock.pid !== undefined &&
      executorLoopPids.includes(Number(executorLock.pid))
  };

  const snapshot = {
    timestamp: new Date().toISOString(),
    checkpointLabel,
    soakPlan: "R6a-24h-minimum-risk-accepted",
    soakDurationAcceptedHours: 24,
    preferredSoakHours: 72,
    riskAcceptanceNote:
      "24 hours is the minimum accepted soak and does not provide the same confidence as the preferred 72-hour soak.",
    runtimeRoot,
    gitStatus,
    safetySuite,
    recoveryActionsJsonl,
    executorLock,
    processInventoryAvailable: processInventory.available === true,
    processes,
    lockPidMatch,
    configPosture,
    posture,
    stateFiles
  };

  const evaluation = evaluateCheckpointVerdict(snapshot);
  snapshot.verdict = evaluation.verdict;
  snapshot.failReasons = evaluation.failReasons;
  return snapshot;
}

function writeSoakCheckpointEvidence(snapshot, options = {}) {
  const soakRunsDir = getSoakRunsDir(options.soakRunsDir);
  fs.mkdirSync(soakRunsDir, { recursive: true });
  const jsonlPath = path.join(soakRunsDir, CHECKPOINT_JSONL);
  const latestPath = path.join(soakRunsDir, LATEST_JSON);
  fs.appendFileSync(jsonlPath, `${JSON.stringify(snapshot)}\n`);
  fs.writeFileSync(latestPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return { soakRunsDir, jsonlPath, latestPath };
}

function collectAndWriteCheckpoint(options = {}) {
  const snapshot = collectSoakCheckpoint(options);
  const paths = writeSoakCheckpointEvidence(snapshot, options);
  return { snapshot, paths };
}

function printCheckpointSummary(snapshot) {
  console.log(`[soak-checkpoint] ${snapshot.checkpointLabel} @ ${snapshot.timestamp}`);
  console.log(`  verdict: ${snapshot.verdict}`);
  if (snapshot.failReasons.length) {
    for (const reason of snapshot.failReasons) {
      console.log(`  FAIL: ${reason}`);
    }
  }
  console.log(`  posture: mode=${snapshot.posture.mode} dryRunMode=${snapshot.posture.dryRunMode} liveArmed=${snapshot.posture.liveArmed}`);
  console.log(`  executorLoopCount: ${snapshot.processes.executorLoopCount}`);
  console.log(`  executorSingletonLock: ${snapshot.executorLock.state}`);
  console.log(`  lockPidMatch: ${snapshot.lockPidMatch.matches}`);
  console.log(`  recovery_actions.jsonl: ${snapshot.recoveryActionsJsonl.exists}`);
  if (snapshot.safetySuite.run) {
    console.log(`  safetySuite: ${snapshot.safetySuite.passed ? "PASS" : "FAIL"} (${snapshot.safetySuite.count || "unknown"})`);
  } else {
    console.log("  safetySuite: skipped");
  }
}

function assertAllowlistedSpawnCommands(sourceText) {
  const lines = sourceText.split(/\r?\n/);
  for (const line of lines) {
    if (!/\bspawn(?:Sync)?\s*\(|\bexec(?:Sync)?\s*\(/.test(line)) continue;
    const forbidden = line.match(FORBIDDEN_SPAWN);
    if (forbidden) {
      throw new Error(`forbidden spawn pattern detected: ${forbidden[0]}`);
    }
  }
}

if (require.main === module) {
  const runSafety = process.argv.includes("--run-safety");
  const labelArg = process.argv.find(arg => arg.startsWith("--label="));
  const checkpointLabel = labelArg ? labelArg.slice("--label=".length) : "manual";
  const snapshot = collectAndWriteCheckpoint({ checkpointLabel, runSafetySuite: runSafety });
  printCheckpointSummary(snapshot.snapshot);
  console.log(`  evidence: ${snapshot.paths.jsonlPath}`);
  console.log(`  latest: ${snapshot.paths.latestPath}`);
  process.exit(snapshot.snapshot.verdict === "PASS" ? 0 : 1);
}

module.exports = {
  REPO_ROOT,
  RUNTIME_ROOT,
  DEFAULT_SOAK_RUNS_DIR,
  CHECKPOINT_JSONL,
  LATEST_JSON,
  getSoakRunsDir,
  collectSoakCheckpoint,
  writeSoakCheckpointEvidence,
  collectAndWriteCheckpoint,
  evaluateCheckpointVerdict,
  printCheckpointSummary,
  readJsonFileStatus,
  classifyProcesses,
  isActualNodeExecutorLoop,
  assertAllowlistedSpawnCommands,
  FORBIDDEN_SPAWN,
  healthySimulateFixture
};
