"use strict";

// test_low_risk_recovery_routes.js — Sprint 4 A2s
//
// Isolated HTTP behavioral tests for low-risk recovery plan/confirm routes.
// Uses TRACKTA_RUNTIME_ROOT temp fixtures only; never port 3000.

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");

const ROOT = __dirname;
const REPO_RECOVERY_AUDIT = path.join(ROOT, "recovery_actions.jsonl");
const REAL_CONFIG = path.join(ROOT, "live_config.json");

const G = "\x1b[32m✔\x1b[0m";
const X = "\x1b[31mX\x1b[0m";
const TEST_TOKEN = crypto.randomBytes(24).toString("hex");

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

function baseFixtureConfig(overrides = {}) {
  return {
    phase: "PHASE_1_AUTONOMOUS_DRY_RUN",
    automationEnabled: false,
    executionMode: "PIPELINE_DRY_RUN",
    dryRunMode: true,
    emergencyStop: false,
    requireManualConfirm: false,
    walletPublicAddress: "TestWallet111111111111111111111111111111",
    positionSizeSol: 0.005,
    maxOpenTrades: 1,
    maxDailyLossSol: 0.1,
    maxDailyLossCount: 3,
    maxDrawdownPercent: 15,
    startingCapitalUsd: 200,
    strategyVersion: "gmgn_v4",
    minWalletBalanceSol: 0.12,
    priorityFeeMode: "dynamic_helius",
    maxPriorityFeeLamports: 1000000,
    fallbackPriorityFeeLamports: 200000,
    assumedComputeUnitLimit: 300000,
    maxEntrySlippagePct: 3,
    maxExitSlippagePct: 5,
    maxRoutePriceImpactPct: 10,
    confirmationCommitment: "confirmed",
    confirmationTimeoutMs: 30000,
    maxSubmitRetries: 1,
    thesis: {
      source: "gmgn_trending",
      scoreMin: 80,
      scoreMax: 89,
      marketCapMin: 100000,
      marketCapMax: 250000,
      botDegenRateMax: 0.05,
      top10HolderRateMin: 0.1,
      top10HolderRateMax: 0.2
    },
    compoundingEnabled: false,
    averagingDownEnabled: false,
    martingaleEnabled: false,
    lastAutomationToggleAt: null,
    lastAutomationToggleReason: null,
    lastError: null,
    ...overrides
  };
}

function createTempRuntime(configOverrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trackta-a2s-"));
  fs.writeFileSync(path.join(dir, "live_config.json"), `${JSON.stringify(baseFixtureConfig(configOverrides), null, 2)}\n`);
  fs.writeFileSync(path.join(dir, "live_trades.jsonl"), "");
  fs.writeFileSync(path.join(dir, "live_positions.json"), "[]\n");
  fs.writeFileSync(path.join(dir, "config_change_audit.jsonl"), "");
  fs.writeFileSync(path.join(dir, "live_control_events.jsonl"), "");
  const staleAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  fs.writeFileSync(path.join(dir, "scanner_health.json"), `${JSON.stringify({ lastScanAt: staleAt })}\n`);
  return dir;
}

function loadFreshDashboardApp(runtimeRoot) {
  process.env.TRACKTA_RUNTIME_ROOT = runtimeRoot;
  process.env.DASHBOARD_CONTROL_TOKEN = TEST_TOKEN;
  for (const mod of ["./live_executor.js", "./dashboard_server.js", "./recovery_service.js", "./recovery_routes.js", "./recovery_audit.js"]) {
    delete require.cache[require.resolve(mod)];
  }
  return require("./dashboard_server.js").app;
}

function httpRequest(baseUrl, method, pathname, { headers = {}, query = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, baseUrl);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const payload = body == null ? null : JSON.stringify(body);
    const reqHeaders = { ...headers };
    if (payload != null) {
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request({
      method,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      headers: reqHeaders
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* non-json ok for auth text */ }
        resolve({ status: res.statusCode, body: text, json, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (payload != null) req.write(payload);
    req.end();
  });
}

async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });
  const { port } = server.address();
  if (port === 3000) {
    server.close();
    throw new Error("Refusing to bind A2s route tests to port 3000");
  }
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

function authHeaders() {
  return { "X-Trackta-Control-Token": TEST_TOKEN };
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

const savedRuntimeRoot = process.env.TRACKTA_RUNTIME_ROOT;
const savedControlToken = process.env.DASHBOARD_CONTROL_TOKEN;
const realConfigBefore = snapshotFile(REAL_CONFIG);

check("repo-root recovery_actions.jsonl absent before tests", !fs.existsSync(REPO_RECOVERY_AUDIT));

const tmp = createTempRuntime();
const auditPath = path.join(tmp, "recovery_actions.jsonl");

(async () => {
  try {
    const app = loadFreshDashboardApp(tmp);

    await withServer(app, async (baseUrl) => {
      // A. GET dashboard remains public
      const home = await httpRequest(baseUrl, "GET", "/");
      check("A: GET / returns 200 without token", home.status === 200);
      check("A: GET / does not leak auth token", !home.body.includes(TEST_TOKEN));

      // B. Control routes still require auth
      const stopDenied = await httpRequest(baseUrl, "POST", "/control/stop");
      check("B: POST /control/stop requires auth", stopDenied.status === 403);

      // C. Plan requires auth
      const planDenied = await httpRequest(baseUrl, "POST", "/recovery/plan/restart-scanner");
      check("C: POST /recovery/plan/:actionId requires auth", planDenied.status === 403);

      // D. Confirm requires auth
      const confirmDenied = await httpRequest(baseUrl, "POST", "/recovery/confirm/restart-scanner");
      check("D: POST /recovery/confirm/:actionId requires auth", confirmDenied.status === 403);

      // E. Query token rejected
      const queryToken = await httpRequest(baseUrl, "POST", "/recovery/plan/restart-scanner", {
        headers: authHeaders(),
        query: { token: TEST_TOKEN }
      });
      check("E: query token rejected on recovery plan", queryToken.status === 403);

      // F. Unknown actionId blocked
      const unknown = await httpRequest(baseUrl, "POST", "/recovery/plan/not-a-real-action", {
        headers: authHeaders(),
        body: { reason: "test" }
      });
      check("F: unknown actionId blocked", unknown.status === 400 && unknown.json && unknown.json.ok === false);

      // G. Forbidden actionIds blocked
      for (const actionId of ["restart-executor", "reset-after-panic", "clear-emergency-stop", "enable-live-trading"]) {
        const res = await httpRequest(baseUrl, "POST", `/recovery/plan/${actionId}`, {
          headers: authHeaders(),
          body: { reason: "forbidden test" }
        });
        check(`G: ${actionId} blocked`, res.status === 400 && res.json && res.json.ok === false);
      }

      // H. Client command fields rejected
      for (const [field, value] of [
        ["command", "node evil.js"],
        ["cmd", "evil"],
        ["shell", "bash"],
        ["args", ["--bad"]],
        ["actionCommand", "run"]
      ]) {
        const res = await httpRequest(baseUrl, "POST", "/recovery/plan/restart-scanner", {
          headers: authHeaders(),
          body: { reason: "test", [field]: value }
        });
        check(`H: body.${field} rejected`, res.status === 400 && res.json && res.json.ok === false);
      }

      // I. Unsafe posture blocks
      const { validatePosture } = require("./recovery_service.js");
      check("I: liveArmed true blocks recovery posture",
        !validatePosture({ executionMode: "PIPELINE_DRY_RUN", dryRunMode: true, liveArmed: true }).ok);
      check("I: dryRunMode false blocks recovery posture",
        !validatePosture({ executionMode: "PIPELINE_DRY_RUN", dryRunMode: false, liveArmed: false }).ok);
      for (const [label, overrides] of [
        ["executionMode LIVE / dryRunMode false", { executionMode: "LIVE", dryRunMode: false }]
      ]) {
        const badTmp = createTempRuntime(overrides);
        const badApp = loadFreshDashboardApp(badTmp);
        await withServer(badApp, async (badBase) => {
          const res = await httpRequest(badBase, "POST", "/recovery/plan/restart-scanner", {
            headers: authHeaders(),
            body: { reason: "posture test" }
          });
          check(`I: ${label} blocks recovery`, res.status === 400 && res.json && res.json.ok === false);
        });
        try { fs.rmSync(badTmp, { recursive: true, force: true }); } catch { /* ignore */ }
      }
      process.env.TRACKTA_RUNTIME_ROOT = tmp;

      // J/K. Missing/wrong confirmation blocks confirm
      const missingConfirm = await httpRequest(baseUrl, "POST", "/recovery/confirm/restart-scanner", {
        headers: authHeaders(),
        body: { reason: "test" }
      });
      check("J: missing confirmation blocks confirm", missingConfirm.status === 400 && missingConfirm.json && missingConfirm.json.ok === false);

      const wrongConfirm = await httpRequest(baseUrl, "POST", "/recovery/confirm/restart-scanner", {
        headers: authHeaders(),
        body: { reason: "test", confirmation: "WRONG PHRASE" }
      });
      check("K: wrong confirmation blocks confirm", wrongConfirm.status === 400 && wrongConfirm.json && wrongConfirm.json.ok === false);

      // L. Valid confirmation produces simulated safe result
      if (fs.existsSync(auditPath)) fs.unlinkSync(auditPath);
      const plan = await httpRequest(baseUrl, "POST", "/recovery/plan/restart-scanner", {
        headers: authHeaders(),
        body: { reason: "plan test", actor: "a2s-test" }
      });
      check("L: plan succeeds for stale scanner", plan.status === 200 && plan.json && plan.json.result === "planned");

      const confirm = await httpRequest(baseUrl, "POST", "/recovery/confirm/restart-scanner", {
        headers: authHeaders(),
        body: {
          reason: "confirm test",
          actor: "a2s-test",
          confirmation: "RESTART SCANNER IN DRY RUN"
        }
      });
      check("L: confirm succeeds with exact phrase", confirm.status === 200 && confirm.json && confirm.json.ok === true);
      check("L: confirm reports simulated execution", confirm.json && confirm.json.executionMode === "simulated");
      check("L: response does not echo auth token", !confirm.body.includes(TEST_TOKEN));

      // M/N. Audit temp only; repo root absent
      const auditMod = require("./recovery_audit.js");
      const resolvedAuditPath = auditMod.getRecoveryAuditFilePath();
      const ledger = readJsonl(resolvedAuditPath);
      check("M: audit rows written under temp runtime root",
        ledger.length >= 3 && path.resolve(resolvedAuditPath).startsWith(path.resolve(tmp)));
      check("N: repo-root recovery_actions.jsonl remains absent", !fs.existsSync(REPO_RECOVERY_AUDIT));

      // O. live_config.json unchanged in repo
      const realAfter = snapshotFile(REAL_CONFIG);
      check("O: real live_config.json unchanged", realConfigBefore.content === realAfter.content &&
        realConfigBefore.mtimeMs === realAfter.mtimeMs);

      // P. No token or raw confirmation phrase in audit
      const serialized = JSON.stringify(ledger);
      check("P: audit rows do not contain auth token", !serialized.includes(TEST_TOKEN));
      check("P: audit rows do not store raw confirmation phrase",
        !serialized.includes("RESTART SCANNER IN DRY RUN"));
      check("P: audit stores matched metadata only",
        ledger.some((row) => row.confirmationPhrase === "matched:restart-scanner") ||
        ledger.every((row) => row.confirmationPhrase == null || /^matched:|^unmatched:|^not-recorded$/.test(row.confirmationPhrase)));

      // Q. No arbitrary command from request in audit/response
      const cmdAttempt = await httpRequest(baseUrl, "POST", "/recovery/plan/restart-scanner", {
        headers: authHeaders(),
        body: { reason: "test", command: "node evil.js" }
      });
      check("Q: arbitrary command not accepted", cmdAttempt.status === 400);
      check("Q: response does not include client command string",
        !cmdAttempt.body.includes("node evil.js"));
    });

    // R. Static route guards still pass
    const { spawnSync } = require("child_process");
    const guard = spawnSync(process.execPath, [path.join(ROOT, "test_recovery_route_guards.js")], {
      cwd: ROOT,
      encoding: "utf8"
    });
    check("R: A2p route static guards still pass", guard.status === 0);

  } finally {
    if (savedRuntimeRoot === undefined) delete process.env.TRACKTA_RUNTIME_ROOT;
    else process.env.TRACKTA_RUNTIME_ROOT = savedRuntimeRoot;
    if (savedControlToken === undefined) delete process.env.DASHBOARD_CONTROL_TOKEN;
    else process.env.DASHBOARD_CONTROL_TOKEN = savedControlToken;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  if (failures.length) {
    console.error(`\nLOW-RISK RECOVERY ROUTE TEST FAILED (${failures.length} violation${failures.length === 1 ? "" : "s"})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("\nLOW-RISK RECOVERY ROUTE TEST PASSED (A2s — simulated execution; temp fixtures only)");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
