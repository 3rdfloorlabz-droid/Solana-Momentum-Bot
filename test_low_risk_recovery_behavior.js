"use strict";

// test_low_risk_recovery_behavior.js — Sprint 4 A2r
//
// Behavioral tests for future low-risk human-confirmed recovery using
// fake_recovery_harness.js, fake_recovery_flow.js, and recovery_audit.js
// under TRACKTA_RUNTIME_ROOT temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = __dirname;
const REPO_RECOVERY_AUDIT = path.join(ROOT, "recovery_actions.jsonl");
const REAL_CONFIG = path.join(ROOT, "live_config.json");
const HARNESS_SRC = fs.readFileSync(path.join(ROOT, "fake_recovery_harness.js"), "utf8");
const FLOW_SRC = fs.readFileSync(path.join(ROOT, "fake_recovery_flow.js"), "utf8");
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

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function countByResult(rows, result) {
  return rows.filter((row) => row.result === result).length;
}

function defaultPosture(overrides = {}) {
  return {
    executionMode: "PIPELINE_DRY_RUN",
    dryRunMode: true,
    liveArmed: false,
    emergencyStop: false,
    ...overrides
  };
}

function flowOptions(harness, tmp, actionId, meta, overrides = {}) {
  return {
    actionId,
    actor: "operator-test",
    authMethod: "dashboard_control_token",
    confirmationPhraseId: meta.confirmationPhraseId,
    confirmationPhraseMatched: true,
    confirmationPhrase: `typed phrase for ${meta.confirmationPhraseId} must not persist raw`,
    reason: "A2r behavioral test",
    posture: defaultPosture(overrides.posture),
    fakeHarness: harness,
    runtimeRoot: tmp,
    requireTypedConfirmation: overrides.requireTypedConfirmation,
    safetySuiteStatus: overrides.safetySuiteStatus ?? "green",
    cooldownState: overrides.cooldownState,
    auditAppendShouldFail: overrides.auditAppendShouldFail,
    auditAppendFailureMessage: overrides.auditAppendFailureMessage,
    command: overrides.command,
    cmd: overrides.cmd,
    shell: overrides.shell,
    args: overrides.args
  };
}

const savedRuntimeRoot = process.env.TRACKTA_RUNTIME_ROOT;
const savedControlToken = process.env.DASHBOARD_CONTROL_TOKEN;
const realConfigBefore = snapshotFile(REAL_CONFIG);

check("repo-root recovery_actions.jsonl absent before tests", !fs.existsSync(REPO_RECOVERY_AUDIT));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trackta-a2r-"));
process.env.TRACKTA_RUNTIME_ROOT = tmp;

delete require.cache[require.resolve("./fake_recovery_harness.js")];
delete require.cache[require.resolve("./fake_recovery_flow.js")];
delete require.cache[require.resolve("./recovery_audit.js")];

const harnessMod = require("./fake_recovery_harness.js");
const flowMod = require("./fake_recovery_flow.js");
const auditMod = require("./recovery_audit.js");

const auditPath = auditMod.getRecoveryAuditFilePath();
const processIds = Object.keys(harnessMod.PROCESS_DEFS);

function freshHarness() {
  return harnessMod.createFakeRecoveryHarness({ runtimeRoot: tmp });
}

function clearTempAudit() {
  if (fs.existsSync(auditPath)) fs.unlinkSync(auditPath);
  for (const def of Object.values(harnessMod.PROCESS_DEFS)) {
    const hb = path.join(tmp, def.heartbeatFile);
    try { if (fs.existsSync(hb)) fs.unlinkSync(hb); } catch { /* ignore */ }
  }
}

function assertOtherProcessesUnchanged(harness, targetId, beforeStates) {
  for (const id of processIds) {
    if (id === targetId) continue;
    check(`${targetId} recovery leaves ${id} state unchanged`,
      harness.processes[id].state === beforeStates[id].state);
    check(`${targetId} recovery leaves ${id} restartCount unchanged`,
      harness.processes[id].restartCount === beforeStates[id].restartCount);
  }
}

try {
  clearTempAudit();

  // A. Successful fake scanner recovery
  {
    const harness = freshHarness();
    harnessMod.setFakeProcessState(harness, "scanner", "STALE");
    const beforeStates = Object.fromEntries(processIds.map((id) => [
      id,
      { state: harness.processes[id].state, restartCount: harness.processes[id].restartCount }
    ]));
    const meta = flowMod.LOW_RISK_ACTION_CATALOG["restart-scanner"];
    const result = flowMod.simulateHumanConfirmedRecoveryFlow(
      flowOptions(harness, tmp, "restart-scanner", meta)
    );
    const ledger = readJsonl(auditPath);
    check("A: scanner recovery succeeds", result.ok === true);
    check("A: planned audit row written", countByResult(ledger, "planned") >= 1);
    check("A: executed audit row written", countByResult(ledger, "executed") >= 1);
    check("A: fake scanner becomes HEALTHY", harness.processes.scanner.state === "HEALTHY");
    check("A: scanner restartCount increments", harness.processes.scanner.restartCount === 1);
    assertOtherProcessesUnchanged(harness, "scanner", beforeStates);
    check("A: temp audit ledger under runtime root", auditPath.startsWith(tmp));
    clearTempAudit();
  }

  // B. Successful fake paper monitor recovery
  {
    const harness = freshHarness();
    harnessMod.setFakeProcessState(harness, "paper-monitor", "MISSING");
    const before = harness.processes["paper-monitor"].restartCount;
    const meta = flowMod.LOW_RISK_ACTION_CATALOG["restart-paper-monitor"];
    const result = flowMod.simulateHumanConfirmedRecoveryFlow(
      flowOptions(harness, tmp, "restart-paper-monitor", meta)
    );
    check("B: paper monitor recovery succeeds", result.ok === true);
    check("B: only paper monitor restartCount changes",
      harness.processes["paper-monitor"].restartCount === before + 1 &&
      processIds.filter((id) => id !== "paper-monitor").every((id) => harness.processes[id].restartCount === 0));
    check("B: audit rows temp only", readJsonl(auditPath).length >= 3 && auditPath.startsWith(tmp));
    clearTempAudit();
  }

  // C. Successful fake wallet monitor recovery
  {
    const harness = freshHarness();
    harnessMod.setFakeProcessState(harness, "wallet-monitor", "FAILED");
    const meta = flowMod.LOW_RISK_ACTION_CATALOG["restart-wallet-monitor"];
    const result = flowMod.simulateHumanConfirmedRecoveryFlow(
      flowOptions(harness, tmp, "restart-wallet-monitor", meta)
    );
    check("C: wallet monitor recovery succeeds", result.ok === true);
    check("C: wallet monitor HEALTHY", harness.processes["wallet-monitor"].state === "HEALTHY");
    check("C: audit rows temp only", readJsonl(auditPath).every(() => true) && auditPath.startsWith(tmp));
    clearTempAudit();
  }

  // D. Successful fake dashboard recovery
  {
    const harness = freshHarness();
    harnessMod.setFakeProcessState(harness, "dashboard", "STALE");
    const meta = flowMod.LOW_RISK_ACTION_CATALOG["restart-dashboard"];
    const result = flowMod.simulateHumanConfirmedRecoveryFlow(
      flowOptions(harness, tmp, "restart-dashboard", meta)
    );
    check("D: dashboard recovery succeeds", result.ok === true);
    check("D: dashboard HEALTHY only", harness.processes.dashboard.state === "HEALTHY");
    check("D: scanner remains default HEALTHY", harness.processes.scanner.state === "HEALTHY");
    clearTempAudit();
  }

  // E. Healthy process blocked
  {
    const harness = freshHarness();
    const beforeCount = harness.processes.scanner.restartCount;
    const meta = flowMod.LOW_RISK_ACTION_CATALOG["restart-scanner"];
    const result = flowMod.simulateHumanConfirmedRecoveryFlow(
      flowOptions(harness, tmp, "restart-scanner", meta)
    );
    const ledger = readJsonl(auditPath);
    check("E: healthy target blocked", result.ok === false && result.result === "blocked");
    check("E: no restartCount increment", harness.processes.scanner.restartCount === beforeCount);
    check("E: blocked audit row written", countByResult(ledger, "blocked") >= 1);
    check("E: no executed audit row", countByResult(ledger, "executed") === 0);
    clearTempAudit();
  }

  // F. Forbidden action blocked
  {
    const harness = freshHarness();
    harnessMod.setFakeProcessState(harness, "scanner", "STALE");
    const result = flowMod.simulateHumanConfirmedRecoveryFlow({
      ...flowOptions(harness, tmp, "enable-live-trading", { confirmationPhraseId: "ENABLE_LIVE" }),
      confirmationPhraseId: "ENABLE_LIVE",
      confirmationPhraseMatched: true
    });
    const ledger = readJsonl(auditPath);
    check("F: enable-live-trading blocked", result.ok === false);
    check("F: no fake mutation", harness.processes.scanner.state === "STALE");
    check("F: audit blocked/denied row written",
      countByResult(ledger, "blocked") + countByResult(ledger, "denied") >= 1);
    check("F: no commandExecuted on blocked rows",
      ledger.every((row) => row.result !== "executed" && row.commandExecuted == null));
    clearTempAudit();
  }

  // G. High-risk actions blocked
  for (const [actionId, label] of [
    ["restart-executor", "executor"],
    ["reset-after-panic", "panic reset"],
    ["clear-emergency-stop", "emergency stop clear"]
  ]) {
    const harness = freshHarness();
    harnessMod.setFakeProcessState(harness, "scanner", "STALE");
    const result = flowMod.simulateHumanConfirmedRecoveryFlow({
      actionId,
      actor: "operator-test",
      authMethod: "dashboard_control_token",
      confirmationPhraseId: "TEST",
      confirmationPhraseMatched: true,
      reason: "high-risk block test",
      posture: defaultPosture(),
      fakeHarness: harness,
      runtimeRoot: tmp,
      safetySuiteStatus: "green"
    });
    check(`G: ${label} blocked`, result.ok === false);
    check(`G: ${label} leaves fake scanner STALE`, harness.processes.scanner.state === "STALE");
    clearTempAudit();
  }

  // H. Unsafe posture blocks
  for (const [label, posture] of [
    ["liveArmed true", { liveArmed: true }],
    ["dryRunMode false", { dryRunMode: false }],
    ["executionMode LIVE", { executionMode: "LIVE" }]
  ]) {
    const harness = freshHarness();
    harnessMod.setFakeProcessState(harness, "scanner", "STALE");
    const meta = flowMod.LOW_RISK_ACTION_CATALOG["restart-scanner"];
    const result = flowMod.simulateHumanConfirmedRecoveryFlow(
      flowOptions(harness, tmp, "restart-scanner", meta, { posture })
    );
    check(`H: ${label} blocks recovery`, result.ok === false);
    check(`H: ${label} no fake mutation`, harness.processes.scanner.state === "STALE");
    check(`H: ${label} audit row written`, readJsonl(auditPath).length >= 1);
    clearTempAudit();
  }

  // I. Missing or wrong confirmation blocks
  {
    const harness = freshHarness();
    harnessMod.setFakeProcessState(harness, "scanner", "STALE");
    const meta = flowMod.LOW_RISK_ACTION_CATALOG["restart-scanner"];
    const missing = flowMod.simulateHumanConfirmedRecoveryFlow({
      ...flowOptions(harness, tmp, "restart-scanner", meta),
      confirmationPhraseId: undefined,
      confirmationPhraseMatched: undefined
    });
    check("I: missing confirmation blocks", missing.ok === false);
    check("I: missing confirmation no mutation", harness.processes.scanner.state === "STALE");
    clearTempAudit();

    const wrong = flowMod.simulateHumanConfirmedRecoveryFlow({
      ...flowOptions(harness, tmp, "restart-scanner", meta),
      confirmationPhraseId: "WRONG_PHRASE_ID",
      confirmationPhraseMatched: true
    });
    const ledger = readJsonl(auditPath);
    check("I: wrong confirmation blocks", wrong.ok === false);
    check("I: no raw confirmation phrase stored",
      ledger.every((row) =>
        row.confirmationPhrase == null ||
        row.confirmationPhrase === "not-recorded" ||
        /^matched:|^unmatched:/.test(row.confirmationPhrase)
      ));
    clearTempAudit();
  }

  // J. Audit failure blocks action
  {
    const harness = freshHarness();
    harnessMod.setFakeProcessState(harness, "scanner", "STALE");
    const meta = flowMod.LOW_RISK_ACTION_CATALOG["restart-scanner"];
    const result = flowMod.simulateHumanConfirmedRecoveryFlow(
      flowOptions(harness, tmp, "restart-scanner", meta, { auditAppendShouldFail: true })
    );
    check("J: audit failure stops flow", result.auditFailure === true && result.ok === false);
    check("J: fake scanner remains STALE", harness.processes.scanner.state === "STALE");
    check("J: no temp audit ledger created on failure", !fs.existsSync(auditPath));
  }

  // K. No client command strings
  {
    const harness = freshHarness();
    harnessMod.setFakeProcessState(harness, "scanner", "STALE");
    const meta = flowMod.LOW_RISK_ACTION_CATALOG["restart-scanner"];
    const withCommand = flowMod.simulateHumanConfirmedRecoveryFlow({
      ...flowOptions(harness, tmp, "restart-scanner", meta),
      command: "node evil.js"
    });
    check("K: req.body.command-like field blocks", withCommand.ok === false);
    clearTempAudit();

    const arbitrary = flowMod.simulateHumanConfirmedRecoveryFlow({
      actionId: "run-arbitrary-command",
      actor: "operator-test",
      authMethod: "dashboard_control_token",
      confirmationPhraseId: "TEST",
      confirmationPhraseMatched: true,
      reason: "arbitrary block test",
      posture: defaultPosture(),
      fakeHarness: harness,
      runtimeRoot: tmp
    });
    check("K: arbitrary command action blocked", arbitrary.ok === false);
    clearTempAudit();
  }

  // L. Temp-only guarantee
  check("L: audit path resolves under temp runtime root", auditPath.startsWith(tmp));
  check("L: repo-root recovery_actions.jsonl still absent", !fs.existsSync(REPO_RECOVERY_AUDIT));

  // Static safety checks
  for (const [file, src] of [
    ["fake_recovery_harness.js", HARNESS_SRC],
    ["fake_recovery_flow.js", FLOW_SRC]
  ]) {
    for (const [label, re] of [
      ["spawn(", /\bspawn\s*\(/],
      ["exec(", /\bexec\s*\(/],
      ["execSync", /\bexecSync\b/],
      ["execFile", /\bexecFile\b/],
      ["child_process", /child_process/],
      ["process.kill", /process\.kill\s*\(/]
    ]) {
      check(`${file} introduces no ${label}`, !re.test(src));
    }
  }

  check("fake_recovery_flow.js does not import dashboard_server.js",
    !/require\s*\(\s*["'`]\.\/dashboard_server/.test(FLOW_SRC));

  check("dashboard_server.js does not require recovery_audit",
    !/require\s*\(\s*["'`]\.\/recovery_audit/.test(DASHBOARD_SRC));
  check("dashboard_server.js does not call appendRecoveryAuditEntry directly",
    !/\bappendRecoveryAuditEntry\b/.test(DASHBOARD_SRC));

  const postRoutes = [];
  const postRe = /app\.post\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = postRe.exec(DASHBOARD_SRC)) !== null) postRoutes.push(m[1]);
  while ((m = postRe.exec(fs.readFileSync(path.join(ROOT, "recovery_routes.js"), "utf8"))) !== null) postRoutes.push(m[1]);
  check("dashboard POST routes remain allowlisted only",
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
  if (savedControlToken === undefined) delete process.env.DASHBOARD_CONTROL_TOKEN;
  else process.env.DASHBOARD_CONTROL_TOKEN = savedControlToken;
  delete require.cache[require.resolve("./fake_recovery_harness.js")];
  delete require.cache[require.resolve("./fake_recovery_flow.js")];
  delete require.cache[require.resolve("./recovery_audit.js")];
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
}

const realConfigAfter = snapshotFile(REAL_CONFIG);
check("real live_config.json unchanged by A2r behavioral tests",
  realConfigBefore.content === realConfigAfter.content &&
  realConfigBefore.mtimeMs === realConfigAfter.mtimeMs);
check("repo-root recovery_actions.jsonl remains absent after tests", !fs.existsSync(REPO_RECOVERY_AUDIT));

if (failures.length) {
  console.error(`\nLOW-RISK RECOVERY BEHAVIOR TEST FAILED (${failures.length} violation${failures.length === 1 ? "" : "s"})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("\nLOW-RISK RECOVERY BEHAVIOR TEST PASSED (A2r — fake harness + temp audit only)");
