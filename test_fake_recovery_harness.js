"use strict";

// test_fake_recovery_harness.js — Sprint 4 A2q (Fake Process Harness)
//
// Unit tests for fake_recovery_harness.js using temp fixtures only.
// Does not spawn/kill real processes, mutate live_config.json, create repo-root
// recovery_actions.jsonl, or add dashboard recovery routes.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = __dirname;
const REPO_RECOVERY_AUDIT = path.join(ROOT, "recovery_actions.jsonl");
const REAL_CONFIG = path.join(ROOT, "live_config.json");
const HARNESS_SRC = fs.readFileSync(path.join(ROOT, "fake_recovery_harness.js"), "utf8");
const DASHBOARD_SRC = fs.readFileSync(path.join(ROOT, "dashboard_server.js"), "utf8");

const G = "\x1b[32m✔\x1b[0m";
const X = "\x1b[31mX\x1b[0m";

const failures = [];
function check(label, cond) {
  if (cond) console.log(`${G} ${label}`);
  else {
    failures.push(label);
    console.log(`${X} FAIL: ${label}`);
  }
}

function snapshotFile(filePath) {
  if (!fs.existsSync(filePath)) return { content: "", mtimeMs: null };
  const st = fs.statSync(filePath);
  return { content: fs.readFileSync(filePath, "utf8"), mtimeMs: st.mtimeMs };
}

const savedRuntimeRoot = process.env.TRACKTA_RUNTIME_ROOT;
const realConfigBefore = snapshotFile(REAL_CONFIG);

check("repo-root recovery_actions.jsonl absent before tests", !fs.existsSync(REPO_RECOVERY_AUDIT));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trackta-a2q-"));
process.env.TRACKTA_RUNTIME_ROOT = tmp;
delete require.cache[require.resolve("./fake_recovery_harness.js")];
const harnessMod = require("./fake_recovery_harness.js");

try {
  const harness = harnessMod.createFakeRecoveryHarness({ runtimeRoot: tmp });
  const processIds = Object.keys(harnessMod.PROCESS_DEFS);

  check("harness initializes with all four fake processes", processIds.length === 4);
  for (const id of processIds) {
    check(`default fake process present: ${id}`, harness.processes[id] != null);
    check(`default ${id} is HEALTHY`, harness.processes[id].state === "HEALTHY");
  }

  for (const state of ["STALE", "MISSING", "FAILED"]) {
    harnessMod.setFakeProcessState(harness, "scanner", state, `test-${state}`);
    check(`scanner can be set to ${state}`, harness.processes.scanner.state === state);
    harnessMod.resetFakeHarness(harness);
  }

  harnessMod.writeFakeHeartbeat(harness, "scanner", "2026-06-23T12:00:00.000Z");
  const hb = harnessMod.readFakeHeartbeat(harness, "scanner");
  check("fake heartbeat can be updated in memory", hb.heartbeatAt === "2026-06-23T12:00:00.000Z");
  check("fake heartbeat file written under temp root",
    hb.filePath.startsWith(tmp) && fs.existsSync(hb.filePath));

  function assertRestartOnlyTarget(actionId, targetId) {
    harnessMod.resetFakeHarness(harness);
    for (const id of processIds) {
      if (id !== targetId) {
        harnessMod.setFakeProcessState(harness, id, "STALE", "control");
      }
    }
    harnessMod.setFakeProcessState(harness, targetId, "STALE", "needs restart");
    const beforeCounts = Object.fromEntries(processIds.map((id) => [id, harness.processes[id].restartCount]));
    const result = harnessMod.simulateRecoveryAction(harness, actionId);
    check(`${actionId} returns executed`, result.result === "executed");
    check(`${actionId} sets only ${targetId} to HEALTHY`,
      harness.processes[targetId].state === "HEALTHY");
    for (const id of processIds) {
      if (id === targetId) continue;
      check(`${actionId} leaves ${id} unchanged`, harness.processes[id].state === "STALE");
      check(`${actionId} does not increment restartCount for ${id}`,
        harness.processes[id].restartCount === beforeCounts[id]);
    }
    check(`${actionId} increments restartCount only for ${targetId}`,
      harness.processes[targetId].restartCount === beforeCounts[targetId] + 1);
  }

  assertRestartOnlyTarget("restart-scanner", "scanner");
  assertRestartOnlyTarget("restart-paper-monitor", "paper-monitor");
  assertRestartOnlyTarget("restart-wallet-monitor", "wallet-monitor");
  assertRestartOnlyTarget("restart-dashboard", "dashboard");

  harnessMod.resetFakeHarness(harness);
  const blockedExecutor = harnessMod.simulateRecoveryAction(harness, "restart-executor");
  check("restart-executor is blocked", blockedExecutor.result === "blocked");
  check("restart-executor does not mutate scanner state",
    harness.processes.scanner.state === "HEALTHY" && harness.processes.scanner.restartCount === 0);

  const forbiddenLive = harnessMod.simulateRecoveryAction(harness, "enable-live-trading");
  check("enable-live-trading is forbidden", forbiddenLive.result === "forbidden");

  const forbiddenArbitrary = harnessMod.simulateRecoveryAction(harness, "run-arbitrary-command");
  check("arbitrary command action is forbidden", forbiddenArbitrary.result === "forbidden");

  harnessMod.setFakeProcessState(harness, "scanner", "HEALTHY");
  const blockedHealthy = harnessMod.simulateRecoveryAction(harness, "restart-scanner");
  check("restart-scanner blocked when target already HEALTHY", blockedHealthy.result === "blocked");

  check("temp heartbeat files remain under TRACKTA_RUNTIME_ROOT only",
    fs.readdirSync(tmp).every((name) => !fs.existsSync(path.join(ROOT, name))));

  // Static safety checks on harness module
  for (const [label, re] of [
    ["spawn(", /\bspawn\s*\(/],
    ["exec(", /\bexec\s*\(/],
    ["execSync", /\bexecSync\b/],
    ["execFile", /\bexecFile\b/],
    ["child_process", /child_process/],
    ["process.kill", /process\.kill\s*\(/],
    ["taskkill", /taskkill/i],
    ["Stop-Process", /Stop-Process/i],
    ["powershell", /powershell/i],
    ["cmd.exe", /cmd\.exe/i],
    ["bash", /\bbash\b/],
    ["sh -c", /sh\s+-c/]
  ]) {
    check(`fake_recovery_harness.js introduces no ${label}`, !re.test(HARNESS_SRC));
  }

  check("fake_recovery_harness.js does not write live_config.json",
    !/writeFileSync\s*\(\s*[^,]*live_config|writeConfigAtomic/.test(HARNESS_SRC));

  const recoveryRoutesSrc = fs.readFileSync(path.join(ROOT, "recovery_routes.js"), "utf8");
  const postRoutes = [];
  const postRe = /app\.post\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = postRe.exec(DASHBOARD_SRC)) !== null) postRoutes.push(m[1]);
  while ((m = postRe.exec(recoveryRoutesSrc)) !== null) postRoutes.push(m[1]);
  check("recovery POST routes are allowlisted only",
    JSON.stringify([...postRoutes].sort()) ===
    JSON.stringify([
      "/control/emergency",
      "/control/start",
      "/control/stop",
      "/recovery/confirm/:actionId",
      "/recovery/plan/:actionId"
    ]));

  const routeGuard = spawnSync(process.execPath, [path.join(ROOT, "test_recovery_route_guards.js")], {
    cwd: ROOT,
    encoding: "utf8"
  });
  check("existing A2p route guards still pass", routeGuard.status === 0);

} finally {
  if (savedRuntimeRoot === undefined) delete process.env.TRACKTA_RUNTIME_ROOT;
  else process.env.TRACKTA_RUNTIME_ROOT = savedRuntimeRoot;
  delete require.cache[require.resolve("./fake_recovery_harness.js")];
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
}

const realConfigAfter = snapshotFile(REAL_CONFIG);
check("real live_config.json unchanged by fake harness tests",
  realConfigBefore.content === realConfigAfter.content &&
  realConfigBefore.mtimeMs === realConfigAfter.mtimeMs);
check("repo-root recovery_actions.jsonl remains absent during tests", !fs.existsSync(REPO_RECOVERY_AUDIT));

if (failures.length) {
  console.error(`\nFAKE RECOVERY HARNESS TEST FAILED (${failures.length} violation${failures.length === 1 ? "" : "s"})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("\nFAKE RECOVERY HARNESS TEST PASSED (A2q — temp fixtures only; no real processes touched)");
