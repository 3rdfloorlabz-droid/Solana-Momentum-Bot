"use strict";

// test_dashboard_auth_behavior.js — Sprint 4 A2k (Behavioral Auth Tests / Isolated Harness)
//
// HTTP-level fail-closed auth tests for dashboard config-control POST routes.
// Uses an in-process Express app on a random 127.0.0.1 port (never port 3000).
// Correct-token mutation tests use TRACKTA_RUNTIME_ROOT temp fixtures only.
// Does not POST to the operator's live dashboard, spawn/kill processes, or mutate
// real live_config.json / config_change_audit.jsonl / live_control_events.jsonl.

const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const crypto = require("crypto");

const ROOT = __dirname;
const REAL_CONFIG = path.join(ROOT, "live_config.json");
const REAL_AUDIT = path.join(ROOT, "config_change_audit.jsonl");
const REAL_CONTROL = path.join(ROOT, "live_control_events.jsonl");
const RECOVERY_ACTIONS = path.join(ROOT, "recovery_actions.jsonl");

const G = "\x1b[32m✔\x1b[0m";
const X = "\x1b[31mX\x1b[0m";

const TEST_TOKEN = crypto.randomBytes(24).toString("hex");
const WRONG_TOKEN = crypto.randomBytes(24).toString("hex");

const failures = [];

function check(label, cond) {
  if (cond) {
    console.log(`${G} ${label}`);
  } else {
    failures.push(label);
    console.log(`${X} FAIL: ${label}`);
  }
}

function snapshotFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, content: "", mtimeMs: null };
  }
  const st = fs.statSync(filePath);
  return { exists: true, content: fs.readFileSync(filePath, "utf8"), mtimeMs: st.mtimeMs };
}

function assertRealRuntimeUnchanged(before, after, label) {
  check(`${label} content unchanged`, before.content === after.content);
  check(`${label} mtime unchanged`, before.mtimeMs === after.mtimeMs);
}

function loadFreshDashboardApp({ runtimeRoot } = {}) {
  if (runtimeRoot) {
    process.env.TRACKTA_RUNTIME_ROOT = runtimeRoot;
  } else {
    delete process.env.TRACKTA_RUNTIME_ROOT;
  }
  for (const mod of ["./live_executor.js", "./dashboard_server.js"]) {
    delete require.cache[require.resolve(mod)];
  }
  return require("./dashboard_server.js").app;
}

function httpRequest(baseUrl, method, pathname, { headers = {}, query = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, baseUrl);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    const req = http.request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        headers
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: res.headers
          });
        });
      }
    );
    req.on("error", reject);
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
    throw new Error("Refusing to bind behavioral auth tests to port 3000");
  }
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await fn(baseUrl, port);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

function isAuthDenied(status) {
  return status === 401 || status === 403;
}

function authHeaders(token = TEST_TOKEN) {
  return { "X-Trackta-Control-Token": token };
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

function createTempRuntime(initialConfig) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trackta-a2k-"));
  fs.writeFileSync(path.join(dir, "live_config.json"), `${JSON.stringify(initialConfig, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, "live_trades.jsonl"), "");
  fs.writeFileSync(path.join(dir, "live_positions.json"), "[]\n");
  fs.writeFileSync(path.join(dir, "config_change_audit.jsonl"), "");
  fs.writeFileSync(path.join(dir, "live_control_events.jsonl"), "");
  return dir;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function assertNoTokenLeak(label, text) {
  check(`${label} does not contain auth token`, !text.includes(TEST_TOKEN));
}

async function assertDeniedPost(baseUrl, route, { headers = {}, query = {}, label }) {
  const res = await httpRequest(baseUrl, "POST", route, { headers, query });
  check(`${label} returns 401/403`, isAuthDenied(res.status));
  check(`${label} returns generic unauthorized message`,
    res.body.includes("Unauthorized dashboard control request."));
  return res;
}

async function runReadOnlyTests(baseUrl) {
  const home = await httpRequest(baseUrl, "GET", "/");
  check("GET / returns 200 without token", home.status === 200);
  assertNoTokenLeak("GET / HTML", home.body);

  const winners = await httpRequest(baseUrl, "GET", "/winners");
  check("GET /winners returns 200 without token", winners.status === 200);
  assertNoTokenLeak("GET /winners HTML", winners.body);
}

async function runDenialTests(baseUrl, realBefore) {
  const routes = ["/control/start", "/control/stop", "/control/emergency"];

  delete process.env.DASHBOARD_CONTROL_TOKEN;
  for (const route of routes) {
    await assertDeniedPost(baseUrl, route, {
      label: `missing env token: POST ${route}`
    });
  }
  let mid = {
    config: snapshotFile(REAL_CONFIG),
    audit: snapshotFile(REAL_AUDIT),
    control: snapshotFile(REAL_CONTROL)
  };
  assertRealRuntimeUnchanged(realBefore.config, mid.config, "real live_config.json after missing-env denial");
  assertRealRuntimeUnchanged(realBefore.audit, mid.audit, "real config_change_audit.jsonl after missing-env denial");
  assertRealRuntimeUnchanged(realBefore.control, mid.control, "real live_control_events.jsonl after missing-env denial");

  process.env.DASHBOARD_CONTROL_TOKEN = "";
  for (const route of routes) {
    await assertDeniedPost(baseUrl, route, {
      label: `empty env token: POST ${route}`
    });
  }

  process.env.DASHBOARD_CONTROL_TOKEN = TEST_TOKEN;
  for (const route of routes) {
    await assertDeniedPost(baseUrl, route, {
      label: `missing header: POST ${route}`
    });
  }

  for (const route of routes) {
    await assertDeniedPost(baseUrl, route, {
      headers: authHeaders(WRONG_TOKEN),
      label: `wrong header token: POST ${route}`
    });
  }

  for (const route of routes) {
    await assertDeniedPost(baseUrl, route, {
      query: { token: TEST_TOKEN },
      label: `query-string token rejected: POST ${route}`
    });
  }

  mid = {
    config: snapshotFile(REAL_CONFIG),
    audit: snapshotFile(REAL_AUDIT),
    control: snapshotFile(REAL_CONTROL)
  };
  assertRealRuntimeUnchanged(realBefore.config, mid.config, "real live_config.json after auth denials");
  assertRealRuntimeUnchanged(realBefore.audit, mid.audit, "real config_change_audit.jsonl after auth denials");
  assertRealRuntimeUnchanged(realBefore.control, mid.control, "real live_control_events.jsonl after auth denials");
}

async function runAuthorizedMutationTests() {
  process.env.DASHBOARD_CONTROL_TOKEN = TEST_TOKEN;

  const stopDir = createTempRuntime(baseFixtureConfig({ automationEnabled: true }));
  try {
    const app = loadFreshDashboardApp({ runtimeRoot: stopDir });
    await withServer(app, async (baseUrl) => {
      const res = await httpRequest(baseUrl, "POST", "/control/stop", { headers: authHeaders() });
      check("authorized POST /control/stop reaches handler (redirect)", res.status === 302);
      const cfg = readJsonFile(path.join(stopDir, "live_config.json"));
      check("isolated fixture: stop sets automationEnabled false", cfg.automationEnabled === false);
      check("isolated fixture: stop preserves executionMode",
        cfg.executionMode === "PIPELINE_DRY_RUN");
      check("isolated fixture: stop preserves dryRunMode", cfg.dryRunMode === true);

      const audit = readJsonl(path.join(stopDir, "config_change_audit.jsonl"));
      check("isolated fixture: stop appends config audit row", audit.length >= 1);
      assertNoTokenLeak("isolated config audit after stop", JSON.stringify(audit));

      const events = readJsonl(path.join(stopDir, "live_control_events.jsonl"));
      check("isolated fixture: stop appends live_control_events row",
        events.some((e) => e.action === "STOP"));
      assertNoTokenLeak("isolated live_control_events after stop", JSON.stringify(events));
    });
  } finally {
    fs.rmSync(stopDir, { recursive: true, force: true });
  }

  const startDir = createTempRuntime(baseFixtureConfig({ automationEnabled: false, emergencyStop: false }));
  try {
    const app = loadFreshDashboardApp({ runtimeRoot: startDir });
    await withServer(app, async (baseUrl) => {
      const res = await httpRequest(baseUrl, "POST", "/control/start", { headers: authHeaders() });
      check("authorized POST /control/start reaches handler (redirect or error redirect)",
        res.status === 302);
      const cfg = readJsonFile(path.join(startDir, "live_config.json"));
      check("isolated fixture: start sets automationEnabled true", cfg.automationEnabled === true);
      check("isolated fixture: start preserves executionMode",
        cfg.executionMode === "PIPELINE_DRY_RUN");
      check("isolated fixture: start preserves dryRunMode", cfg.dryRunMode === true);

      const audit = readJsonl(path.join(startDir, "config_change_audit.jsonl"));
      check("isolated fixture: start appends config audit row", audit.length >= 1);
      assertNoTokenLeak("isolated config audit after start", JSON.stringify(audit));

      const events = readJsonl(path.join(startDir, "live_control_events.jsonl"));
      check("isolated fixture: start appends live_control_events row",
        events.some((e) => e.action === "START"));
      assertNoTokenLeak("isolated live_control_events after start", JSON.stringify(events));
    });
  } finally {
    fs.rmSync(startDir, { recursive: true, force: true });
  }

  const emergencyDir = createTempRuntime(baseFixtureConfig({ automationEnabled: true, emergencyStop: false }));
  try {
    const app = loadFreshDashboardApp({ runtimeRoot: emergencyDir });
    await withServer(app, async (baseUrl) => {
      const res = await httpRequest(baseUrl, "POST", "/control/emergency", { headers: authHeaders() });
      check("authorized POST /control/emergency reaches handler (redirect)", res.status === 302);
      const cfg = readJsonFile(path.join(emergencyDir, "live_config.json"));
      check("isolated fixture: emergency sets automationEnabled false", cfg.automationEnabled === false);
      check("isolated fixture: emergency sets emergencyStop true", cfg.emergencyStop === true);
      check("isolated fixture: emergency preserves executionMode",
        cfg.executionMode === "PIPELINE_DRY_RUN");
      check("isolated fixture: emergency preserves dryRunMode", cfg.dryRunMode === true);

      const audit = readJsonl(path.join(emergencyDir, "config_change_audit.jsonl"));
      check("isolated fixture: emergency appends config audit row", audit.length >= 1);
      assertNoTokenLeak("isolated config audit after emergency", JSON.stringify(audit));

      const events = readJsonl(path.join(emergencyDir, "live_control_events.jsonl"));
      check("isolated fixture: emergency appends live_control_events row",
        events.some((e) => e.action === "EMERGENCY_STOP"));
      assertNoTokenLeak("isolated live_control_events after emergency", JSON.stringify(events));
    });
  } finally {
    fs.rmSync(emergencyDir, { recursive: true, force: true });
  }
}

async function main() {
  check("recovery_actions.jsonl absent before behavioral auth tests", !fs.existsSync(RECOVERY_ACTIONS));

  const realBefore = {
    config: snapshotFile(REAL_CONFIG),
    audit: snapshotFile(REAL_AUDIT),
    control: snapshotFile(REAL_CONTROL)
  };

  const savedTokenEnv = process.env.DASHBOARD_CONTROL_TOKEN;
  const savedRuntimeRoot = process.env.TRACKTA_RUNTIME_ROOT;

  try {
    const app = loadFreshDashboardApp();
    await withServer(app, async (baseUrl, port) => {
      check("behavioral harness binds ephemeral port, not 3000", port !== 3000);
      await runReadOnlyTests(baseUrl);
      await runDenialTests(baseUrl, realBefore);
    });

    await runAuthorizedMutationTests();
  } finally {
    if (savedTokenEnv === undefined) delete process.env.DASHBOARD_CONTROL_TOKEN;
    else process.env.DASHBOARD_CONTROL_TOKEN = savedTokenEnv;
    if (savedRuntimeRoot === undefined) delete process.env.TRACKTA_RUNTIME_ROOT;
    else process.env.TRACKTA_RUNTIME_ROOT = savedRuntimeRoot;
    delete require.cache[require.resolve("./live_executor.js")];
    delete require.cache[require.resolve("./dashboard_server.js")];
  }

  const realAfter = {
    config: snapshotFile(REAL_CONFIG),
    audit: snapshotFile(REAL_AUDIT),
    control: snapshotFile(REAL_CONTROL)
  };
  assertRealRuntimeUnchanged(realBefore.config, realAfter.config, "real live_config.json after all behavioral tests");
  assertRealRuntimeUnchanged(realBefore.audit, realAfter.audit, "real config_change_audit.jsonl after all behavioral tests");
  assertRealRuntimeUnchanged(realBefore.control, realAfter.control, "real live_control_events.jsonl after all behavioral tests");

  check("recovery_actions.jsonl still absent after behavioral auth tests", !fs.existsSync(RECOVERY_ACTIONS));

  if (failures.length) {
    console.error(`\nDASHBOARD AUTH BEHAVIOR TEST FAILED (${failures.length} violation${failures.length === 1 ? "" : "s"})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("\nDASHBOARD AUTH BEHAVIOR TEST PASSED (isolated HTTP harness — A2k)");
}

main().catch((err) => {
  console.error("\nDASHBOARD AUTH BEHAVIOR TEST ERROR:", err.message);
  process.exit(1);
});
