"use strict";
// B2A/R7b 12h extended observation orchestrator — checkpoint schedule + append log.
const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CHECKPOINT_SCRIPT = path.join(__dirname, "b2a_rehearsal_checkpoint.js");
const LOG_FILE = path.join(ROOT, "analysis", "b2a_12h_extended_checkpoints.jsonl");
const RUN_LABEL = "B2A_R7B_12H_EXTENDED_OBSERVATION_NOT_24H";

const SCHEDULE = [
  { label: "start", offsetMs: 90 * 1000 },
  { label: "plus_15m", offsetMs: 15 * 60 * 1000 },
  { label: "plus_1h", offsetMs: 60 * 60 * 1000 },
  { label: "plus_4h", offsetMs: 4 * 60 * 60 * 1000 },
  { label: "plus_6h", offsetMs: 6 * 60 * 60 * 1000 },
  { label: "plus_12h", offsetMs: 12 * 60 * 60 * 1000 },
  { label: "stop", offsetMs: 12 * 60 * 60 * 1000 + 30 * 1000 }
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function capture(label, startIso) {
  const env = { ...process.env, B2A_RUN_LABEL: RUN_LABEL, B2A_OBSERVATION_START: startIso };
  const out = execSync(`node "${CHECKPOINT_SCRIPT}" ${label}`, { cwd: ROOT, encoding: "utf8", env, timeout: 120000 });
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, out.trim() + "\n", "utf8");
  console.log(`[b2a-12h] captured ${label} at ${new Date().toISOString()}`);
  return JSON.parse(out.trim());
}

function runHelper(cmd, label) {
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: "utf8", timeout: 120000 });
    console.log(`[b2a-12h] helper ${label} ok`);
    return out.trim();
  } catch (e) {
    console.log(`[b2a-12h] helper ${label} failed: ${(e.message || "").slice(0, 120)}`);
    return null;
  }
}

function stopProcesses(scannerPid, executorPid) {
  for (const pid of [scannerPid, executorPid]) {
    if (!pid) continue;
    try {
      process.kill(pid);
      console.log(`[b2a-12h] stopped pid ${pid}`);
    } catch {
      // ignore
    }
  }
}

async function main() {
  const startIso = process.env.B2A_OBSERVATION_START;
  const scannerPid = Number(process.env.B2A_SCANNER_PID || 0);
  const executorPid = Number(process.env.B2A_EXECUTOR_PID || 0);
  if (!startIso) {
    console.error("B2A_OBSERVATION_START required");
    process.exit(1);
  }
  const startMs = Date.parse(startIso);
  console.log(`[b2a-12h] orchestrator start; observation start=${startIso}`);

  for (const item of SCHEDULE) {
    const target = startMs + item.offsetMs;
    const wait = target - Date.now();
    if (wait > 0) {
      console.log(`[b2a-12h] waiting ${Math.round(wait / 1000)}s until ${item.label}`);
      await sleep(wait);
    }
    capture(item.label, startIso);
    if (item.label === "start") {
      runHelper("node soak_checkpoint.js --label=b2a_12h_start", "soak_start");
      runHelper("node b2a_24h_observation_status.js --write", "b2a_status_start");
    }
    if (item.label === "plus_1h") {
      runHelper("node r7b_daily_summary.js", "r7b_daily");
    }
    if (item.label === "plus_6h") {
      runHelper("node b2a_24h_observation_status.js --write", "b2a_status_mid");
    }
    if (item.label === "stop") {
      runHelper("node soak_checkpoint.js --label=b2a_12h_stop", "soak_stop");
      runHelper("node b2a_24h_observation_status.js --write", "b2a_status_stop");
      stopProcesses(scannerPid, executorPid);
    }
  }
  console.log("[b2a-12h] orchestrator complete");
}

main().catch((err) => {
  console.error("[b2a-12h] fatal", err);
  process.exit(1);
});
