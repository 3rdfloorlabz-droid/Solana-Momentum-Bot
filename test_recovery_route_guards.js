"use strict";

// test_recovery_route_guards.js — Sprint 4 A2p + A2s (Recovery Route Static Guards)
//
// Static regression guards for recovery route safety boundaries.
// Passes with A2s allowlisted recovery routes when protected and bounded.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const G = "\x1b[32m✔\x1b[0m";
const X = "\x1b[31mX\x1b[0m";

const DASHBOARD_SRC = fs.readFileSync(path.join(ROOT, "dashboard_server.js"), "utf8");
const RECOVERY_ROUTES_SRC = fs.readFileSync(path.join(ROOT, "recovery_routes.js"), "utf8");
const RECOVERY_SERVICE_SRC = fs.readFileSync(path.join(ROOT, "recovery_service.js"), "utf8");
const ROUTE_SRC = DASHBOARD_SRC + "\n" + RECOVERY_ROUTES_SRC;

const A2C_START = DASHBOARD_SRC.indexOf("// ─── A2c Recovery Action Preview");
const A2C_END = DASHBOARD_SRC.indexOf("function supervisorRecommendationCard(item) {", A2C_START);
const A2C = (A2C_START !== -1 && A2C_END !== -1)
  ? DASHBOARD_SRC.slice(A2C_START, A2C_END)
  : "";
const NON_A2C_SRC = (A2C_START !== -1 && A2C_END !== -1)
  ? DASHBOARD_SRC.slice(0, A2C_START) + DASHBOARD_SRC.slice(A2C_END)
  : DASHBOARD_SRC;

const failures = [];
function check(label, cond) {
  if (cond) console.log(`${G} ${label}`);
  else {
    failures.push(label);
    console.log(`${X} FAIL: ${label}`);
  }
}

function extractRoutes(src) {
  const routes = [];
  const re = /app\.(post|get|put|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    routes.push({ method: m[1], path: m[2] });
  }
  return routes;
}

function extractPostHandlerBlock(src, routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `app\\.post\\s*\\(\\s*["'\`]${escaped}["'\`][\\s\\S]{0,2500}`,
    "m"
  );
  const match = src.match(re);
  return match ? match[0] : "";
}

const KNOWN_POST_ROUTES = [
  "/control/emergency",
  "/control/start",
  "/control/stop",
  "/recovery/confirm/:actionId",
  "/recovery/plan/:actionId"
];
const ALLOWED_RECOVERY_POST_PREFIXES = ["/recovery/plan/", "/recovery/confirm/"];

const FORBIDDEN_ROUTE_FRAGMENTS = [
  "/restart",
  "/kill",
  "/spawn",
  "/execute",
  "/run-command",
  "/command",
  "/shell",
  "/live",
  "/promote"
];

const FORBIDDEN_ROUTE_NAME_PARTS = [
  "execute",
  "run-command",
  "shell",
  "spawn",
  "kill",
  "taskkill",
  "stop-process",
  "live",
  "promote",
  "signer",
  "secret",
  "private-key",
  "arbitrary-command"
];

const CLIENT_COMMAND_PATTERNS = [
  /req\.body\.command\b/,
  /req\.body\.cmd\b/,
  /req\.body\.shell\b/,
  /req\.body\.args\b/,
  /req\.query\.command\b/,
  /req\.query\.cmd\b/,
  /req\.query\.token\b/,
  /req\.query\.actionCommand\b/
];

const LIVE_PROMOTION_PATTERNS = [
  /executionMode\s*=\s*["']LIVE["']/,
  /dryRunMode\s*=\s*false/,
  /liveArmed\s*=\s*true/,
  /SOLANA_SIGNER_SECRET/,
  /privateKey/,
  /\/promote/i,
  /live promotion/i
];

function routeHasForbiddenFragment(routePath, frag) {
  const lower = routePath.toLowerCase();
  if (lower.includes("/recovery/plan/") || lower.includes("/recovery/confirm/")) {
    return false;
  }
  if (frag === "/recover" && lower.includes("/recovery/")) return false;
  return lower.includes(frag.toLowerCase());
}

check("recovery_allowlist.js module exists", fs.existsSync(path.join(ROOT, "recovery_allowlist.js")));
check("recovery_service.js module exists", fs.existsSync(path.join(ROOT, "recovery_service.js")));
check("recovery_routes.js module exists", fs.existsSync(path.join(ROOT, "recovery_routes.js")));
check("test_low_risk_recovery_routes.js exists", fs.existsSync(path.join(ROOT, "test_low_risk_recovery_routes.js")));
check("test_recovery_audit.js exists", fs.existsSync(path.join(ROOT, "test_recovery_audit.js")));
check("test_recovery_preview_guards.js exists", fs.existsSync(path.join(ROOT, "test_recovery_preview_guards.js")));
check("test_dashboard_auth_guards.js exists", fs.existsSync(path.join(ROOT, "test_dashboard_auth_guards.js")));
check("test_dashboard_auth_behavior.js exists", fs.existsSync(path.join(ROOT, "test_dashboard_auth_behavior.js")));

const postRoutes = extractRoutes(ROUTE_SRC).filter((r) => r.method === "post");
const postPaths = postRoutes.map((r) => r.path);
const sortedPost = [...postPaths].sort();

check(
  `app.post routes are exactly control + allowlisted recovery routes (found: ${postPaths.join(", ") || "none"})`,
  JSON.stringify(sortedPost) === JSON.stringify(KNOWN_POST_ROUTES)
);

const recoveryPostRoutes = postPaths.filter((p) => p.includes("/recovery"));
check(
  "recovery POST routes are only /recovery/plan/:actionId and /recovery/confirm/:actionId",
  recoveryPostRoutes.length === 2 &&
  recoveryPostRoutes.includes("/recovery/plan/:actionId") &&
  recoveryPostRoutes.includes("/recovery/confirm/:actionId")
);

const allRoutes = extractRoutes(ROUTE_SRC);
for (const { method, path: routePath } of allRoutes) {
  for (const frag of FORBIDDEN_ROUTE_FRAGMENTS) {
    check(`no ${method.toUpperCase()} route containing "${frag}" (${routePath})`,
      !routeHasForbiddenFragment(routePath, frag));
  }

  if (routePath.toLowerCase().includes("/recovery")) {
    const allowlisted = method === "post" && ALLOWED_RECOVERY_POST_PREFIXES.some((prefix) =>
      routePath.startsWith(prefix) || routePath.includes(`${prefix}:actionId`)
    );
    check(
      `recovery route ${method.toUpperCase()} ${routePath} is allowlisted (/recovery/plan/ or /recovery/confirm/ only)`,
      allowlisted
    );
  }
}

for (const part of FORBIDDEN_ROUTE_NAME_PARTS) {
  const re = new RegExp(
    'app\\.(post|get|put|delete)\\s*\\(\\s*["\'`][^"\'`]*' + part.replace(/-/g, "\\-"),
    "i"
  );
  check(`no active route path contains forbidden fragment "${part}"`, !re.test(ROUTE_SRC));
}

for (const routePath of postPaths.filter((p) => p.includes("/recovery"))) {
  const block = extractPostHandlerBlock(RECOVERY_ROUTES_SRC, routePath);
  check(`POST ${routePath} invokes requireDashboardControlAuth before handler logic`,
    /\brequireDashboardControlAuth\b/.test(block));
  check(`POST ${routePath} does not accept client-supplied command fields in route module`,
    !CLIENT_COMMAND_PATTERNS.some((re) => re.test(block)));
  check(`POST ${routePath} references server-side allowlist/actionId validation`,
    /planRecoveryAction|confirmRecoveryAction|:actionId/.test(block));
  check(`POST ${routePath} introduces no spawn/exec/child_process in handler`,
    !/\bspawn\s*\(|\bexec\s*\(|child_process|process\.kill/.test(block));
  check(`POST ${routePath} has no live promotion patterns in handler`,
    !LIVE_PROMOTION_PATTERNS.some((re) => re.test(block)));
}

for (const re of CLIENT_COMMAND_PATTERNS) {
  check(`dashboard route modules do not reference suspicious client command field ${re}`,
    !re.test(DASHBOARD_SRC) && !re.test(RECOVERY_ROUTES_SRC));
}

const ROUTE_PRIMITIVES = [
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
];
for (const [label, re] of ROUTE_PRIMITIVES) {
  check(`dashboard (outside A2c preview text) introduces no ${label}`, !re.test(NON_A2C_SRC));
  check(`recovery_service.js introduces no ${label}`, !re.test(RECOVERY_SERVICE_SRC));
  check(`recovery_routes.js introduces no ${label}`, !re.test(RECOVERY_ROUTES_SRC));
}

check("recovery_service.js uses recovery audit writer",
  /require\s*\(\s*["'`]\.\/recovery_audit/.test(RECOVERY_SERVICE_SRC) &&
  /\bappendRecoveryAuditEntry\b/.test(RECOVERY_SERVICE_SRC));
check("dashboard_server.js registers recovery routes",
  /registerRecoveryRoutes/.test(DASHBOARD_SRC));
check("dashboard HTML does not reference recovery_actions.jsonl directly",
  !/recovery_actions/i.test(DASHBOARD_SRC));

for (const routePath of extractRoutes(DASHBOARD_SRC).filter((r) => r.method === "post").map((r) => r.path)) {
  const block = extractPostHandlerBlock(DASHBOARD_SRC, routePath);
  for (const re of LIVE_PROMOTION_PATTERNS) {
    check(`POST ${routePath} handler has no live promotion pattern ${re}`, !re.test(block));
  }
}

check("A2c Recovery Action Preview panel is present", /A2c Recovery Action Preview/i.test(DASHBOARD_SRC));
check("A2c preview section contains no HTML form for recovery execution", !/<form/i.test(A2C));
check("A2c preview section contains no POST method", !/method\s*=\s*["']post["']/i.test(A2C));

check("repo-root recovery_actions.jsonl absent", !fs.existsSync(path.join(ROOT, "recovery_actions.jsonl")));

if (failures.length) {
  console.error(`\nRECOVERY ROUTE GUARD TEST FAILED (${failures.length} violation${failures.length === 1 ? "" : "s"})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("\nRECOVERY ROUTE GUARD TEST PASSED (A2p/A2s — allowlisted recovery routes bounded)");
