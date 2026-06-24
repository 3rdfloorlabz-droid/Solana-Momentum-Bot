"use strict";

// test_recovery_audit.js — Sprint 4 A2m (Recovery Audit Writer + Tests)
//
// Unit tests for recovery_audit.js using TRACKTA_RUNTIME_ROOT temp fixtures only.
// Does not create repo-root recovery_actions.jsonl, mutate live_config.json,
// execute recovery, or POST to the dashboard.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const REPO_RECOVERY_AUDIT = path.join(ROOT, "recovery_actions.jsonl");
const REAL_CONFIG = path.join(ROOT, "live_config.json");
const DASHBOARD_SRC = fs.readFileSync(path.join(ROOT, "dashboard_server.js"), "utf8");
const AUDIT_SRC = fs.readFileSync(path.join(ROOT, "recovery_audit.js"), "utf8");

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

function loadAuditModule(tempRoot) {
  process.env.TRACKTA_RUNTIME_ROOT = tempRoot;
  delete require.cache[require.resolve("./recovery_audit.js")];
  return require("./recovery_audit.js");
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function minimalDeniedEntry(overrides = {}) {
  return {
    timestamp: new Date().toISOString(),
    actionId: crypto.randomUUID(),
    actor: "unauthenticated",
    authMethod: "none",
    actionClass: "config-control",
    actionName: null,
    targetProcess: null,
    requestedState: null,
    reason: null,
    commandPreview: null,
    commandExecuted: null,
    precheckStatus: "unknown",
    precheckDetails: [],
    postcheckStatus: "unknown",
    postcheckDetails: [],
    result: "denied",
    error: null,
    liveArmedAtRequest: false,
    executionModeAtRequest: "PIPELINE_DRY_RUN",
    dryRunModeAtRequest: true,
    emergencyStopAtRequest: false,
    confirmationPhrase: null,
    sourceIpOrHost: "127.0.0.1",
    dashboardSessionId: null,
    relatedConfigAuditId: null,
    requiresReview: true,
    riskLevel: "medium",
    ...overrides
  };
}

const savedRuntimeRoot = process.env.TRACKTA_RUNTIME_ROOT;
const savedControlToken = process.env.DASHBOARD_CONTROL_TOKEN;
const realConfigBefore = snapshotFile(REAL_CONFIG);

check("repo-root recovery_actions.jsonl absent before tests", !fs.existsSync(REPO_RECOVERY_AUDIT));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trackta-a2m-"));
let audit;
try {
  audit = loadAuditModule(tmp);
  const auditPath = audit.getRecoveryAuditFilePath();

  check("writer resolves audit path under TRACKTA_RUNTIME_ROOT", auditPath.startsWith(tmp));
  check("recovery_actions.jsonl absent in temp dir before append", !fs.existsSync(auditPath));

  const entry1 = minimalDeniedEntry({ actionName: "STOP automation" });
  const write1 = audit.appendRecoveryAuditEntry(entry1);
  check("append writes one valid JSON line", fs.existsSync(auditPath));
  const lines1 = readJsonl(auditPath);
  check("append produces exactly one ledger row", lines1.length === 1);
  check("written row parses with matching actionId", lines1[0].actionId === write1.actionId);
  check("timestamp is ISO string", /^\d{4}-\d{2}-\d{2}T/.test(lines1[0].timestamp));

  const priorBytes = fs.readFileSync(auditPath, "utf8");
  const entry2 = minimalDeniedEntry({
    result: "blocked",
    actionClass: "forbidden",
    actionName: "Enable live trading",
    precheckStatus: "fail",
    precheckDetails: [{ label: "forbidden class", ok: false }],
    riskLevel: "critical"
  });
  audit.appendRecoveryAuditEntry(entry2);
  const afterBytes = fs.readFileSync(auditPath, "utf8");
  check("second append preserves first line and adds second line",
    afterBytes.startsWith(priorBytes) && readJsonl(auditPath).length === 2);

  const invalidClass = minimalDeniedEntry({ actionClass: "auto-recovery" });
  let threwClass = false;
  try {
    audit.appendRecoveryAuditEntry(invalidClass);
  } catch (err) {
    threwClass = err.message.includes("Invalid actionClass");
  }
  check("invalid actionClass rejected", threwClass);

  const invalidRisk = minimalDeniedEntry({ riskLevel: "extreme" });
  let threwRisk = false;
  try {
    audit.appendRecoveryAuditEntry(invalidRisk);
  } catch (err) {
    threwRisk = err.message.includes("Invalid riskLevel");
  }
  check("invalid riskLevel rejected", threwRisk);

  const invalidResult = minimalDeniedEntry({ result: "success" });
  let threwResult = false;
  try {
    audit.appendRecoveryAuditEntry(invalidResult);
  } catch (err) {
    threwResult = err.message.includes("Invalid result");
  }
  check("invalid result rejected", threwResult);

  const invalidPrecheck = minimalDeniedEntry({ precheckStatus: "maybe" });
  let threwPrecheck = false;
  try {
    audit.appendRecoveryAuditEntry(invalidPrecheck);
  } catch (err) {
    threwPrecheck = err.message.includes("Invalid precheckStatus");
  }
  check("invalid precheckStatus rejected", threwPrecheck);

  const invalidPostcheck = minimalDeniedEntry({ postcheckStatus: "maybe" });
  let threwPostcheck = false;
  try {
    audit.appendRecoveryAuditEntry(invalidPostcheck);
  } catch (err) {
    threwPostcheck = err.message.includes("Invalid postcheckStatus");
  }
  check("invalid postcheckStatus rejected", threwPostcheck);

  const missingBase = minimalDeniedEntry();
  delete missingBase.actionId;
  let threwMissing = false;
  try {
    audit.appendRecoveryAuditEntry(missingBase);
  } catch (err) {
    threwMissing = err.message.includes("Missing required field: actionId");
  }
  check("missing required base fields rejected", threwMissing);

  const dupId = crypto.randomUUID();
  audit.appendRecoveryAuditEntry(minimalDeniedEntry({ actionId: dupId }));
  let threwDup = false;
  try {
    audit.appendRecoveryAuditEntry(minimalDeniedEntry({ actionId: dupId }));
  } catch (err) {
    threwDup = err.message.includes("Duplicate recovery audit actionId");
  }
  check("actionId must be unique within ledger", threwDup);

  process.env.DASHBOARD_CONTROL_TOKEN = "a2m-test-secret-token-value";
  delete require.cache[require.resolve("./recovery_audit.js")];
  audit = require("./recovery_audit.js");
  const secretPath = path.join(tmp, "secret-test.jsonl");
  const secretEntry = minimalDeniedEntry({
    reason: "attempt with token a2m-test-secret-token-value embedded"
  });
  const secretWrite = audit.appendRecoveryAuditEntry(secretEntry, { filePath: secretPath });
  const secretSerialized = JSON.stringify(secretWrite.entry);
  check("token/secret values redacted before write",
    !secretSerialized.includes("a2m-test-secret-token-value"));
  check("redacted secret file line parseable", readJsonl(secretPath).length === 1);

  let threwForbiddenKey = false;
  try {
    audit.sanitizeRecoveryAuditEntry({ ...minimalDeniedEntry(), privateKey: "x" });
  } catch (err) {
    threwForbiddenKey = /forbidden key/i.test(err.message);
  }
  check("token-like entry keys rejected", threwForbiddenKey);

  const phraseEntry = minimalDeniedEntry({
    actionClass: "high-risk-recovery",
    actionName: "Restart Executor",
    reason: "test",
    confirmationPhrase: "RESTART EXECUTOR IN DRY RUN ONLY raw operator text",
    confirmationPhraseId: "RESTART_EXECUTOR_DRY_RUN",
    confirmationPhraseMatched: true,
    result: "planned",
    riskLevel: "high"
  });
  const phraseWrite = audit.appendRecoveryAuditEntry(phraseEntry, {
    filePath: path.join(tmp, "phrase-test.jsonl")
  });
  check("raw confirmation phrase not stored",
    phraseWrite.entry.confirmationPhrase === "matched:RESTART_EXECUTOR_DRY_RUN");
  check("confirmationPhraseId input-only field not persisted",
    phraseWrite.entry.confirmationPhraseId === undefined);

  const ndjson = readJsonl(auditPath);
  check("newline-delimited JSON remains parseable", ndjson.every((row) => row && row.actionId));

  check("writer uses TRACKTA_RUNTIME_ROOT temp path in tests", audit.getRecoveryAuditFilePath().includes(tmp));

  // Static safety checks
  for (const [label, re] of [
    ["spawn(", /\bspawn\s*\(/],
    ["exec(", /\bexec\s*\(/],
    ["execSync", /\bexecSync\b/],
    ["execFile", /\bexecFile\b/],
    ["child_process", /child_process/],
    ["process.kill", /process\.kill\s*\(/],
    ["taskkill", /taskkill/i],
    ["Stop-Process", /Stop-Process/i]
  ]) {
    check(`recovery_audit.js introduces no ${label}`, !re.test(AUDIT_SRC));
  }

  check("recovery_audit.js does not write live_config.json",
    !/writeConfigAtomic|writeFileSync\s*\(\s*[^,]*live_config/.test(AUDIT_SRC));
  check("dashboard_server.js does not call appendRecoveryAuditEntry yet",
    !/\bappendRecoveryAuditEntry\b/.test(DASHBOARD_SRC));
  check("dashboard_server.js does not require recovery_audit yet",
    !/require\s*\(\s*["'`]\.\/recovery_audit/.test(DASHBOARD_SRC));

  const postRoutes = [];
  const postRe = /app\.post\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = postRe.exec(DASHBOARD_SRC)) !== null) postRoutes.push(m[1]);
  check("no recovery POST routes added to dashboard",
    JSON.stringify([...postRoutes].sort()) ===
    JSON.stringify(["/control/emergency", "/control/start", "/control/stop"]));

} finally {
  if (savedRuntimeRoot === undefined) delete process.env.TRACKTA_RUNTIME_ROOT;
  else process.env.TRACKTA_RUNTIME_ROOT = savedRuntimeRoot;
  if (savedControlToken === undefined) delete process.env.DASHBOARD_CONTROL_TOKEN;
  else process.env.DASHBOARD_CONTROL_TOKEN = savedControlToken;
  delete require.cache[require.resolve("./recovery_audit.js")];
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
}

const realConfigAfter = snapshotFile(REAL_CONFIG);
check("real live_config.json unchanged by audit writer tests",
  realConfigBefore.content === realConfigAfter.content &&
  realConfigBefore.mtimeMs === realConfigAfter.mtimeMs);
check("repo-root recovery_actions.jsonl remains absent during tests", !fs.existsSync(REPO_RECOVERY_AUDIT));

if (failures.length) {
  console.error(`\nRECOVERY AUDIT TEST FAILED (${failures.length} violation${failures.length === 1 ? "" : "s"})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("\nRECOVERY AUDIT TEST PASSED (A2m — temp fixtures only)");
