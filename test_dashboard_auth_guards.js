"use strict";

// test_dashboard_auth_guards.js — Sprint 4 A2i + A2j (Dashboard Auth Guard Tests)
//
// Regression guards for dashboard mutation-route auth expectations.
// STATIC source assertions only: reads dashboard_server.js as text and fails if
// route inventory drifts, auth wrapper is missing, forbidden recovery surfaces
// appear, or tokens leak into HTML/query-string acceptance.
//
// Behavioral route tests (POST without token → 403, no config mutation) require
// an isolated test harness — see docs/A2H_AUTH_GUARD_TEST_DESIGN.md §11.
// TODO(A2j+): add isolated Express harness when a safe fixture path exists.
// Do not POST to the live dashboard or mutate real live_config.json.
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

const AUTH_START = SRC.indexOf("// ─── A2j Dashboard control auth");
const AUTH_END = SRC.indexOf("// ─── Live automation control endpoints", AUTH_START);
const AUTH_BLOCK = (AUTH_START !== -1 && AUTH_END !== -1) ? SRC.slice(AUTH_START, AUTH_END) : "";

const RENDER_START = SRC.indexOf("function renderDashboard(");
const RENDER_END = AUTH_START > RENDER_START ? AUTH_START : SRC.length;
const HTML_RENDER_BLOCK = RENDER_START !== -1 ? SRC.slice(RENDER_START, RENDER_END) : "";

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

// ── 7. A2j auth wrapper (active enforcement checks) ────────────────────────────

const hasAuthHelper =
  /\brequireDashboardControlAuth\b/.test(SRC) &&
  /\bvalidateDashboardControlToken\b/.test(SRC);
check(
  "dashboard POST routes are protected by auth helpers (requireDashboardControlAuth and validateDashboardControlToken)",
  hasAuthHelper
);

check(
  "DASHBOARD_CONTROL_TOKEN env var is referenced for fail-closed auth",
  /DASHBOARD_CONTROL_TOKEN/.test(AUTH_BLOCK)
);

for (const route of KNOWN_POST_ROUTES) {
  const routeBlock = new RegExp(
    `app\\.post\\s*\\(\\s*["'\`]${route.replace("/", "\\/")}["'\`][\\s\\S]{0,400}`,
    "m"
  );
  const block = SRC.match(routeBlock);
  const usesAuthInHandler = block
    ? /\brequireDashboardControlAuth\b/.test(block[0]) &&
      block[0].indexOf("requireDashboardControlAuth") < block[0].indexOf("handleControl")
    : false;
  check(`POST ${route} handler invokes auth guard before mutation`, usesAuthInHandler);
}

check(
  "auth uses generic unauthorized message only",
  /Unauthorized dashboard control request\./.test(AUTH_BLOCK)
);

check(
  "auth rejects query-string token candidates (requestUsesQueryStringToken)",
  /\brequestUsesQueryStringToken\b/.test(AUTH_BLOCK)
);

check(
  "no query-string token acceptance via req.query token fields",
  !/req\.query\s*\[\s*["'`]?DASHBOARD_CONTROL_TOKEN/.test(SRC) &&
  !/req\.query\.(?:token|controlToken)/i.test(SRC)
);

check(
  "DASHBOARD_CONTROL_TOKEN is not rendered into dashboard HTML",
  !/DASHBOARD_CONTROL_TOKEN/.test(HTML_RENDER_BLOCK) &&
  !/process\.env\.DASHBOARD_CONTROL_TOKEN/.test(HTML_RENDER_BLOCK)
);

check(
  "X-Trackta-Control-Token is not embedded in dashboard HTML templates",
  !/X-Trackta-Control-Token/.test(HTML_RENDER_BLOCK)
);

check(
  "auth uses constant-time comparison (crypto.timingSafeEqual)",
  /crypto\.timingSafeEqual/.test(AUTH_BLOCK)
);

if (process.argv.includes("--pending-a2j")) {
  if (failures.length) {
    console.error(
      `\nA2j pending mode: ${failures.length} auth check${failures.length === 1 ? "" : "s"} still failing.`
    );
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "\nA2j auth enforcement checks are active in the main test path. " +
    "--pending-a2j is no longer required."
  );
  process.exit(0);
}

if (failures.length) {
  console.error(`\nDASHBOARD AUTH GUARD TEST FAILED (${failures.length} violation${failures.length === 1 ? "" : "s"})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("\nDASHBOARD AUTH GUARD TEST PASSED (static checks — A2j auth wrapper enforced)");
console.log(
  "NOTE: behavioral auth route tests deferred — no isolated harness yet; " +
  "see docs/A2H_AUTH_GUARD_TEST_DESIGN.md §11."
);

module.exports = {};
