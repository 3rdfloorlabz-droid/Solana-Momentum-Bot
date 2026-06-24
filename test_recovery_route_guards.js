"use strict";

// test_recovery_route_guards.js — Sprint 4 A2p (Recovery Route Static Guards)
//
// Static regression guards for future recovery route safety boundaries.
// Reads dashboard_server.js as text. Passes today because no recovery routes
// exist. Fails if unsafe routes, generic execution, client-supplied commands,
// live promotion, or unauthenticated recovery mutation surfaces appear.
//
// Does not implement recovery routes, spawn/kill processes, write runtime
// files, or create recovery_actions.jsonl.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const G = "\x1b[32m✔\x1b[0m";
const X = "\x1b[31mX\x1b[0m";

const DASHBOARD_SRC = fs.readFileSync(path.join(ROOT, "dashboard_server.js"), "utf8");

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

const KNOWN_POST_ROUTES = ["/control/emergency", "/control/start", "/control/stop"];
const ALLOWED_RECOVERY_POST_PREFIXES = ["/recovery/plan/", "/recovery/confirm/"];

const FORBIDDEN_ROUTE_FRAGMENTS = [
  "/recover",
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

// ── 1. Companion modules and tests exist (A2c/A2j/A2m stack) ────────────────

check("recovery_audit.js module exists", fs.existsSync(path.join(ROOT, "recovery_audit.js")));
check("test_recovery_audit.js exists", fs.existsSync(path.join(ROOT, "test_recovery_audit.js")));
check("test_recovery_preview_guards.js exists", fs.existsSync(path.join(ROOT, "test_recovery_preview_guards.js")));
check("test_dashboard_auth_guards.js exists", fs.existsSync(path.join(ROOT, "test_dashboard_auth_guards.js")));
check("test_dashboard_auth_behavior.js exists", fs.existsSync(path.join(ROOT, "test_dashboard_auth_behavior.js")));

// ── 2. Current POST route inventory (config-control only) ───────────────────

const postRoutes = extractRoutes(DASHBOARD_SRC).filter((r) => r.method === "post");
const postPaths = postRoutes.map((r) => r.path);
const sortedPost = [...postPaths].sort();

check(
  `app.post routes are exactly /control/start, /control/stop, /control/emergency (found: ${postPaths.join(", ") || "none"})`,
  JSON.stringify(sortedPost) === JSON.stringify(KNOWN_POST_ROUTES)
);

const recoveryPostRoutes = postPaths.filter((p) => p.includes("/recovery"));
check(
  "no active recovery POST routes yet (expected before A2q/A2r)",
  recoveryPostRoutes.length === 0
);

// ── 3. Forbidden recovery-adjacent routes on any HTTP verb ───────────────────

const allRoutes = extractRoutes(DASHBOARD_SRC);
for (const { method, path: routePath } of allRoutes) {
  const lower = routePath.toLowerCase();
  for (const frag of FORBIDDEN_ROUTE_FRAGMENTS) {
    check(`no ${method.toUpperCase()} route containing "${frag}" (${routePath})`,
      !lower.includes(frag.toLowerCase()));
  }

  if (lower.includes("/recovery")) {
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
  check(`no active route path contains forbidden fragment "${part}"`, !re.test(DASHBOARD_SRC));
}

// ── 4. Future recovery POST route safety markers (defensive) ─────────────────

for (const routePath of postPaths.filter((p) => p.includes("/recovery"))) {
  const block = extractPostHandlerBlock(DASHBOARD_SRC, routePath);
  check(`POST ${routePath} invokes requireDashboardControlAuth before handler logic`,
    /\brequireDashboardControlAuth\b/.test(block) &&
    block.indexOf("requireDashboardControlAuth") < (block.indexOf("appendRecoveryAuditEntry") || Infinity));

  check(`POST ${routePath} does not accept client-supplied command fields`,
    !CLIENT_COMMAND_PATTERNS.some((re) => re.test(block)));

  check(`POST ${routePath} references server-side allowlist or actionId validation`,
    /\bactionId\b/.test(block) &&
    (/\ballowlist\b/i.test(block) || /\ballowedAction/i.test(block) || /\/recovery\/(plan|confirm)\//.test(routePath)));

  if (routePath.includes("/recovery/confirm/")) {
    check(`POST ${routePath} calls recovery audit before side effects (appendRecoveryAuditEntry)`,
      /\bappendRecoveryAuditEntry\b/.test(block) || /require\s*\(\s*["'`]\.\/recovery_audit/.test(block));
  }

  check(`POST ${routePath} introduces no spawn/exec/child_process in handler`,
    !/\bspawn\s*\(|\bexec\s*\(|child_process|process\.kill/.test(block));

  check(`POST ${routePath} has no live promotion patterns in handler`,
    !LIVE_PROMOTION_PATTERNS.some((re) => re.test(block)));
}

// ── 5. Forbidden client-supplied command input (dashboard-wide) ──────────────

for (const re of CLIENT_COMMAND_PATTERNS) {
  check(`dashboard does not reference suspicious client command field ${re}`, !re.test(DASHBOARD_SRC));
}

// ── 6. Forbidden execution primitives outside A2c preview text ───────────────

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
}

// ── 7. recovery_audit not wired to dashboard recovery routes yet ─────────────

check("dashboard_server.js does not require recovery_audit yet",
  !/require\s*\(\s*["'`]\.\/recovery_audit/.test(DASHBOARD_SRC));
check("dashboard_server.js does not call appendRecoveryAuditEntry yet",
  !/\bappendRecoveryAuditEntry\b/.test(DASHBOARD_SRC));
check("dashboard does not reference or write recovery_actions.jsonl",
  !/recovery_actions/i.test(DASHBOARD_SRC));

// ── 8. Live promotion controls in POST route handlers only (not read-only UI) ─

for (const routePath of postPaths) {
  const block = extractPostHandlerBlock(DASHBOARD_SRC, routePath);
  for (const re of LIVE_PROMOTION_PATTERNS) {
    check(`POST ${routePath} handler has no live promotion pattern ${re}`, !re.test(block));
  }
}

// ── 9. A2c preview remains non-executing (boundary compatibility) ────────────

check("A2c Recovery Action Preview panel is present", /A2c Recovery Action Preview/i.test(DASHBOARD_SRC));
check("A2c preview section contains no HTML form for recovery execution",
  !/<form/i.test(A2C));
check("A2c preview section contains no POST method",
  !/method\s*=\s*["']post["']/i.test(A2C));

// ── 10. Repo-root recovery_actions.jsonl absent ──────────────────────────────

check("repo-root recovery_actions.jsonl absent", !fs.existsSync(path.join(ROOT, "recovery_actions.jsonl")));

if (failures.length) {
  console.error(`\nRECOVERY ROUTE GUARD TEST FAILED (${failures.length} violation${failures.length === 1 ? "" : "s"})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("\nRECOVERY ROUTE GUARD TEST PASSED (A2p — no recovery routes; future boundaries enforced)");
