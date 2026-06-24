"use strict";

// test_dashboard_auth_guards.js — Sprint 4 A2i (Auth Guard Tests First)
//
// Regression guards for dashboard mutation-route auth expectations.
// STATIC source assertions only in the default path: reads dashboard_server.js
// as text and fails if route inventory drifts or forbidden recovery surfaces appear.
//
// Auth enforcement is NOT implemented yet. The main test path passes today and
// is registered in run_safety_tests.js (9/9). Pending A2j auth-enforcement
// checks live in runPendingA2jAuthChecks() and are NOT run by the safety suite
// until A2j implements the auth wrapper and activates them.
//
// Does not execute the bot, POST to the live dashboard, start/stop processes,
// touch real live_config.json, or create recovery_actions.jsonl.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const G = "\x1b[32m✔\x1b[0m";
const X = "\x1b[31mX\x1b[0m";

const SRC = fs.readFileSync(path.join(ROOT, "dashboard_server.js"), "utf8");

// Isolate A2c preview block (same boundaries as test_recovery_preview_guards.js).
const A2C_START = SRC.indexOf("// ─── A2c Recovery Action Preview");
const A2C_END = SRC.indexOf("function supervisorRecommendationCard(item) {", A2C_START);
const A2C = (A2C_START !== -1 && A2C_END !== -1) ? SRC.slice(A2C_START, A2C_END) : "";

const failures = [];
function check(label, cond) {
  if (cond) {
    console.log(`${G} ${label}`);
  } else {
    failures.push(label);
    console.log(`${X} FAIL: ${label}`);
  }
}

// ── 1. POST route inventory (known config-control routes only) ───────────────

const KNOWN_POST_ROUTES = ["/control/emergency", "/control/start", "/control/stop"];
const postRoutes = [];
const postRe = /app\.post\s*\(\s*["'`]([^"'`]+)["'`]/g;
let m;
while ((m = postRe.exec(SRC)) !== null) postRoutes.push(m[1]);
const sortedPost = [...postRoutes].sort();

check(
  `app.post routes are exactly /control/start, /control/stop, /control/emergency (found: ${postRoutes.join(", ") || "none"})`,
  JSON.stringify(sortedPost) === JSON.stringify(KNOWN_POST_ROUTES)
);

// ── 2. No recovery execution routes ───────────────────────────────────────────

const FORBIDDEN_ROUTE_FRAGMENTS = [
  "/recover",
  "/recovery",
  "/restart",
  "/kill",
  "/spawn",
  "/reset",
  "/execute",
  "/run-command"
];
for (const frag of FORBIDDEN_ROUTE_FRAGMENTS) {
  check(`no recovery execution route containing "${frag}"`,
    !new RegExp(`app\\.(post|get|put|delete)\\s*\\(\\s*["'\`]${frag.replace("/", "\\/")}`, "i").test(SRC));
}
check("no recover/restart/kill/spawn/reset route on any verb",
  !/app\.(post|get|put|delete)\s*\(\s*["'`][^"'`]*(recover|restart|kill|spawn|reset|execute|run-command)/i.test(SRC));

// ── 3. No recovery execution primitives ───────────────────────────────────────

const PRIMITIVES = [
  ["spawn(", /\bspawn\s*\(/],
  ["exec(", /\bexec\s*\(/],
  ["execSync", /\bexecSync\b/],
  ["execFile", /\bexecFile\b/],
  ["child_process", /child_process/],
  ["process.kill", /process\.kill\s*\(/],
  ["taskkill", /taskkill/i],
  ["Stop-Process", /Stop-Process/i]
];
for (const [label, re] of PRIMITIVES) {
  check(`dashboard introduces no ${label}`, !re.test(SRC));
}

// ── 4. No recovery_actions.jsonl ──────────────────────────────────────────────

check("dashboard does not reference or create recovery_actions.jsonl",
  !/recovery_actions/i.test(SRC));

// ── 5. A2c preview-only panel remains present ─────────────────────────────────

check("A2c Recovery Action Preview panel is present",
  /A2c Recovery Action Preview/i.test(SRC));
check("A2c contains Preview only wording",
  /Preview only/i.test(A2C));
check("A2c contains 'Nothing in this panel authorizes live trading.'",
  /Nothing in this panel authorizes live trading\./.test(A2C));

// ── 6. Loopback bind (localhost-only surface) ─────────────────────────────────

check("dashboard listens on 127.0.0.1 only",
  /app\.listen\s*\(\s*PORT\s*,\s*["']127\.0\.0\.1["']/.test(SRC));

if (failures.length) {
  console.error(`\nDASHBOARD AUTH GUARD TEST FAILED (${failures.length} violation${failures.length === 1 ? "" : "s"})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nDASHBOARD AUTH GUARD TEST PASSED (static checks — auth not enforced yet)");

// ── A2j PENDING: Auth enforcement (NOT in safety suite until A2j) ─────────────
//
// Behavioral tests (POST without token → 401/403, no config mutation) require
// an isolated test harness — see docs/A2H_AUTH_GUARD_TEST_DESIGN.md §11.
// Do not POST to the live dashboard or mutate real live_config.json.
//
// Run manually to see expected A2j failure:
//   node test_dashboard_auth_guards.js --pending-a2j

function runPendingA2jAuthChecks() {
  const pendingFailures = [];
  const pending = (label, cond) => {
    if (cond) console.log(`${G} ${label}`);
    else {
      pendingFailures.push(label);
      console.log(`${X} FAIL: ${label}`);
    }
  };

  console.log("\n--- A2j pending auth enforcement checks (expected to fail until A2j) ---\n");

  const hasAuthHelper =
    /\brequireDashboardControlAuth\b/.test(SRC) ||
    /\bvalidateDashboardControlToken\b/.test(SRC);
  pending(
    "dashboard POST routes are protected by auth helper (requireDashboardControlAuth or validateDashboardControlToken)",
    hasAuthHelper
  );

  pending(
    "DASHBOARD_CONTROL_TOKEN env var is referenced for fail-closed auth",
    /DASHBOARD_CONTROL_TOKEN/.test(SRC)
  );

  for (const route of KNOWN_POST_ROUTES) {
    const routeBlock = new RegExp(
      `app\\.post\\s*\\(\\s*["'\`]${route.replace("/", "\\/")}["'\`][\\s\\S]{0,400}`,
      "m"
    );
    const block = SRC.match(routeBlock);
    const usesAuthInHandler = block
      ? /\b(requireDashboardControlAuth|validateDashboardControlToken)\b/.test(block[0])
      : false;
    pending(`POST ${route} handler invokes auth guard before mutation`, usesAuthInHandler);
  }

  if (pendingFailures.length) {
    console.error(
      `\nA2j expected failure: dashboard POST routes are not yet protected by auth guard. ` +
      `Implement A2j auth wrapper next. (${pendingFailures.length} pending check${pendingFailures.length === 1 ? "" : "s"})`
    );
    for (const f of pendingFailures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("\nA2J AUTH ENFORCEMENT CHECKS PASSED");
}

if (process.argv.includes("--pending-a2j")) {
  runPendingA2jAuthChecks();
}

module.exports = { runPendingA2jAuthChecks };
