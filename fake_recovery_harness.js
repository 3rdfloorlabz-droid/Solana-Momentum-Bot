"use strict";

// fake_recovery_harness.js — Sprint 4 A2q
// Deterministic fake process/runtime model for future recovery behavior tests.
//
// Simulates scanner / paper-monitor / wallet-monitor / dashboard states and
// low-risk restart actions in memory or under TRACKTA_RUNTIME_ROOT temp fixtures.
//
// Does NOT spawn/kill real processes, run shell commands, inspect real PIDs,
// mutate live_config.json, wire dashboard routes, or authorize recovery execution.

const fs = require("fs");
const path = require("path");

const PROCESS_STATES = Object.freeze([
  "HEALTHY",
  "STALE",
  "MISSING",
  "NO DATA",
  "DEGRADED",
  "FAILED"
]);

const PROCESS_DEFS = Object.freeze({
  scanner: {
    id: "scanner",
    label: "Scanner",
    scriptName: "scanner_gmgn_trending.js --watch",
    heartbeatFile: "scanner_health.json",
    heartbeatField: "lastScanAt"
  },
  "paper-monitor": {
    id: "paper-monitor",
    label: "Paper Monitor",
    scriptName: "monitor.js",
    heartbeatFile: "paper_monitor_health.json",
    heartbeatField: "updatedAt"
  },
  "wallet-monitor": {
    id: "wallet-monitor",
    label: "Wallet Monitor",
    scriptName: "wallet_monitor.js",
    heartbeatFile: "wallet_status.json",
    heartbeatField: "updatedAt"
  },
  dashboard: {
    id: "dashboard",
    label: "Dashboard",
    scriptName: "dashboard_server.js",
    heartbeatFile: "dashboard_health.json",
    heartbeatField: "heartbeatAt"
  }
});

const ALLOWED_ACTION_IDS = Object.freeze([
  "restart-scanner",
  "restart-paper-monitor",
  "restart-wallet-monitor",
  "restart-dashboard"
]);

const BLOCKED_UNSUPPORTED_ACTION_IDS = Object.freeze([
  "restart-executor"
]);

const FORBIDDEN_ACTION_IDS = Object.freeze([
  "reset-after-panic",
  "clear-emergency-stop",
  "enable-live-trading"
]);

const ACTION_TO_PROCESS = Object.freeze({
  "restart-scanner": "scanner",
  "restart-paper-monitor": "paper-monitor",
  "restart-wallet-monitor": "wallet-monitor",
  "restart-dashboard": "dashboard"
});

function assertProcessState(state) {
  if (!PROCESS_STATES.includes(state)) {
    throw new Error(`invalid fake process state: ${state}`);
  }
}

function assertProcessId(processId) {
  if (!PROCESS_DEFS[processId]) {
    throw new Error(`unknown fake process id: ${processId}`);
  }
}

function cloneProcess(process) {
  return { ...process };
}

function createFakeProcessRecord(def, overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: def.id,
    label: def.label,
    scriptName: def.scriptName,
    state: "HEALTHY",
    heartbeatAt: now,
    lastActionAt: null,
    restartCount: 0,
    notes: null,
    ...overrides
  };
}

function createFakeRuntimeState(overridesById = {}) {
  const processes = {};
  for (const def of Object.values(PROCESS_DEFS)) {
    processes[def.id] = createFakeProcessRecord(def, overridesById[def.id] || {});
  }
  return processes;
}

function resolveRuntimeRoot(options = {}) {
  if (options.runtimeRoot) return options.runtimeRoot;
  if (process.env.TRACKTA_RUNTIME_ROOT) return process.env.TRACKTA_RUNTIME_ROOT;
  return null;
}

function createFakeRecoveryHarness(options = {}) {
  const runtimeRoot = resolveRuntimeRoot(options);
  if (runtimeRoot) {
    fs.mkdirSync(runtimeRoot, { recursive: true });
  }
  return {
    runtimeRoot,
    processes: createFakeRuntimeState(options.processes || {}),
    actionLog: []
  };
}

function getFakeProcessState(harness, processId) {
  assertProcessId(processId);
  return cloneProcess(harness.processes[processId]);
}

function setFakeProcessState(harness, processId, state, notes = null) {
  assertProcessId(processId);
  assertProcessState(state);
  const proc = harness.processes[processId];
  proc.state = state;
  proc.notes = notes;
  if (state === "MISSING") {
    proc.heartbeatAt = null;
  } else if (state !== "HEALTHY" && proc.heartbeatAt === null) {
    proc.heartbeatAt = new Date(0).toISOString();
  }
  return cloneProcess(proc);
}

function heartbeatFilePath(harness, processId) {
  const def = PROCESS_DEFS[processId];
  if (!harness.runtimeRoot || !def.heartbeatFile) return null;
  return path.join(harness.runtimeRoot, def.heartbeatFile);
}

function readFakeHeartbeat(harness, processId) {
  assertProcessId(processId);
  const proc = harness.processes[processId];
  const filePath = heartbeatFilePath(harness, processId);
  let filePayload = null;
  if (filePath && fs.existsSync(filePath)) {
    try {
      filePayload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      filePayload = null;
    }
  }
  return {
    processId,
    heartbeatAt: proc.heartbeatAt,
    filePath,
    filePayload
  };
}

function writeFakeHeartbeat(harness, processId, timestamp = new Date().toISOString()) {
  assertProcessId(processId);
  const def = PROCESS_DEFS[processId];
  const proc = harness.processes[processId];
  proc.heartbeatAt = timestamp;
  const filePath = heartbeatFilePath(harness, processId);
  if (filePath) {
    const payload = { [def.heartbeatField]: timestamp };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
  }
  return readFakeHeartbeat(harness, processId);
}

function classifyAction(actionId) {
  if (ALLOWED_ACTION_IDS.includes(actionId)) return "allowed";
  if (FORBIDDEN_ACTION_IDS.includes(actionId)) return "forbidden";
  if (BLOCKED_UNSUPPORTED_ACTION_IDS.includes(actionId)) return "blocked";
  if (/arbitrary|shell|command|execute|live-trading|panic|emergency-stop/i.test(actionId)) {
    return "forbidden";
  }
  return "blocked";
}

function isRecoverableState(state) {
  return state !== "HEALTHY";
}

function simulateRecoveryAction(harness, actionId) {
  const classification = classifyAction(actionId);
  if (classification === "forbidden") {
    return {
      actionId,
      result: "forbidden",
      targetProcess: ACTION_TO_PROCESS[actionId] || null,
      previousState: null,
      newState: null,
      restartCount: null,
      heartbeatAt: null,
      message: `Action "${actionId}" is forbidden by fake harness policy`
    };
  }
  if (classification === "blocked") {
    return {
      actionId,
      result: "blocked",
      targetProcess: ACTION_TO_PROCESS[actionId] || null,
      previousState: null,
      newState: null,
      restartCount: null,
      heartbeatAt: null,
      message: `Action "${actionId}" is unsupported by fake harness phase-1 allowlist`
    };
  }

  const processId = ACTION_TO_PROCESS[actionId];
  const proc = harness.processes[processId];
  const previousState = proc.state;
  if (!isRecoverableState(previousState)) {
    return {
      actionId,
      result: "blocked",
      targetProcess: processId,
      previousState,
      newState: previousState,
      restartCount: proc.restartCount,
      heartbeatAt: proc.heartbeatAt,
      message: `Target "${processId}" is already HEALTHY — fake restart not applicable`
    };
  }

  const now = new Date().toISOString();
  proc.state = "HEALTHY";
  proc.heartbeatAt = now;
  proc.lastActionAt = now;
  proc.restartCount += 1;
  proc.notes = `Fake restart via ${actionId}`;

  const heartbeat = writeFakeHeartbeat(harness, processId, now);
  const outcome = {
    actionId,
    result: "executed",
    targetProcess: processId,
    previousState,
    newState: "HEALTHY",
    restartCount: proc.restartCount,
    heartbeatAt: heartbeat.heartbeatAt,
    message: `Fake restart applied to ${processId}`
  };
  harness.actionLog.push({ ...outcome, timestamp: now });
  return outcome;
}

function resetFakeHarness(harness, options = {}) {
  harness.processes = createFakeRuntimeState(options.processes || {});
  harness.actionLog = [];
  if (harness.runtimeRoot && options.clearHeartbeatFiles !== false) {
    for (const def of Object.values(PROCESS_DEFS)) {
      const filePath = path.join(harness.runtimeRoot, def.heartbeatFile);
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        /* ignore temp cleanup errors */
      }
    }
  }
  return harness;
}

module.exports = {
  PROCESS_STATES,
  PROCESS_DEFS,
  ALLOWED_ACTION_IDS,
  BLOCKED_UNSUPPORTED_ACTION_IDS,
  FORBIDDEN_ACTION_IDS,
  createFakeRecoveryHarness,
  createFakeRuntimeState,
  getFakeProcessState,
  setFakeProcessState,
  simulateRecoveryAction,
  readFakeHeartbeat,
  writeFakeHeartbeat,
  resetFakeHarness
};
