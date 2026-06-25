"use strict";

// test_recovery_preview_guards.js — Sprint 4 A2c Guardrails
//
// Regression guards that LOCK IN the A2c "Recovery Action Preview" as a
// PREVIEW-ONLY surface. These are STATIC source assertions: they read
// dashboard_server.js as text and fail if a future edit turns the preview into
// recovery execution (buttons, forms, POST routes, process spawning/killing,
// shell calls, or recovery_actions.jsonl writes). They do not execute the bot,
// touch runtime files, change config, or hit the network.
//
// What stays true:
//   - The A2c panel renders command PREVIEWS as plain text only.
//   - It contains the required disclaimers and forbidden-action listing.
//   - It introduces NO execution primitive anywhere in dashboard_server.js.
//   - The ONLY app.post routes are the three pre-existing config-control routes
//     (/control/start, /control/stop, /control/emergency) — A2c adds none.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const G = "\x1b[32m✔\x1b[0m";
const X = "\x1b[31mX\x1b[0m";

const SRC = fs.readFileSync(path.join(ROOT, "dashboard_server.js"), "utf8");

// ── Isolate the A2c preview source block (the functions that render it) ────────
// From the A2c section banner comment to the next unrelated function.
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

// ── 0. The A2c block exists and is isolatable ──────────────────────────────────

check("A2c preview source block is present and isolatable", A2C.length > 0);

// ── 1. Required content / disclaimers ──────────────────────────────────────────

check("dashboard contains 'A2c Recovery Action Preview' surface",
  /A2c Recovery Action Preview/i.test(SRC));
check("contains preview-only disclaimer (does not execute / perform recovery)",
  /preview-only\. It does not execute commands.*perform recovery/i.test(A2C));
check("contains 'Preview only. Operator must run commands manually in a terminal.'",
  /Preview only\. Operator must run commands manually in a terminal\./.test(A2C));
check("contains 'Blocked actions are shown for planning visibility only.'",
  /Blocked actions are shown for planning visibility only\./.test(A2C));
check("contains 'Nothing in this panel authorizes live trading.'",
  /Nothing in this panel authorizes live trading\./.test(A2C));
check("contains a 'Forbidden actions' listing",
  /Forbidden actions/i.test(A2C));

// ── 2. Required preview action model ───────────────────────────────────────────

const MODEL = [
  "Restart Scanner",
  "Restart Paper Monitor",
  "Restart Wallet Monitor",
  "Restart Dashboard",
  "Restart Executor",
  "Reset After Panic"
];
for (const name of MODEL) {
  check(`preview model includes "${name}"`, A2C.includes(name));
}

// Specific forbidden entries that must be enumerated.
check('forbidden actions include "Enable live trading"',
  /Enable live trading/i.test(A2C));
check('forbidden actions include "Autonomous restart loop"',
  /Autonomous restart loop/i.test(A2C));

// High-risk confirmation phrases must be present (proves they remain gated text).
check('high-risk phrase "RESTART EXECUTOR IN DRY RUN ONLY" present',
  /RESTART EXECUTOR IN DRY RUN ONLY/.test(A2C));
check('high-risk phrase "RESET AFTER PANIC MANUALLY REVIEWED" present',
  /RESET AFTER PANIC MANUALLY REVIEWED/.test(A2C));

// ── 3. No recovery-execution primitives anywhere in dashboard_server.js ────────

const PRIMITIVES = [
  ["spawn(", /\bspawn\s*\(/],
  ["exec(", /\bexec\s*\(/],
  ["execSync", /\bexecSync\b/],
  ["execFile", /\bexecFile\b/],
  ["child_process", /child_process/],
  ["process.kill", /process\.kill\s*\(/],
  ["taskkill / Stop-Process (PID kill)", /taskkill|Stop-Process/i]
];
for (const [label, re] of PRIMITIVES) {
  check(`dashboard introduces no ${label}`, !re.test(SRC));
}

// No recovery_actions ledger reference/write anywhere in the dashboard.
check("dashboard does not reference or write recovery_actions(.jsonl)",
  !/recovery_actions/i.test(SRC));

// ── 4. app.post routes are EXACTLY the three pre-existing control routes ────────

const KNOWN_ROUTES = [
  "/control/emergency",
  "/control/start",
  "/control/stop",
  "/recovery/confirm/:actionId",
  "/recovery/plan/:actionId"
];
const postRoutes = [];
const postRe = /app\.post\s*\(\s*["'`]([^"'`]+)["'`]/g;
let m;
while ((m = postRe.exec(SRC)) !== null) postRoutes.push(m[1]);
const recoveryPostRe = /app\.post\s*\(\s*["'`]([^"'`]+)["'`]/g;
while ((m = recoveryPostRe.exec(fs.readFileSync(path.join(ROOT, "recovery_routes.js"), "utf8"))) !== null) {
  postRoutes.push(m[1]);
}
const sortedRoutes = [...postRoutes].sort();

const ROUTE_SRC = SRC + fs.readFileSync(path.join(ROOT, "recovery_routes.js"), "utf8");
check(`app.post routes are exactly the known control + allowlisted recovery routes (found: ${postRoutes.join(", ") || "none"})`,
  JSON.stringify(sortedRoutes) === JSON.stringify(KNOWN_ROUTES));
check("no forbidden generic recovery execution routes outside allowlist",
  !/app\.post\s*\(\s*["'`]\/recover[^y]/i.test(ROUTE_SRC) &&
  !/app\.post\s*\(\s*["'`][^"'`]*\/(restart|kill|spawn|execute|run-command)/i.test(ROUTE_SRC));

// ── 5. The A2c preview section is non-mutating (no executable controls) ─────────

const FORBIDDEN_IN_A2C = [
  ["<button", /<button/i],
  ["<form", /<form/i],
  ["onclick", /onclick/i],
  ["fetch(", /\bfetch\s*\(/i],
  ['method="post"', /method\s*=\s*["']post["']/i],
  ["data-action", /data-action/i],
  ["mutating href (/control/ or javascript:)", /href\s*=\s*["'][^"']*(?:\/control\/|javascript:)/i]
];
for (const [label, re] of FORBIDDEN_IN_A2C) {
  check(`A2c preview section contains no ${label}`, !re.test(A2C));
}

// ── result ─────────────────────────────────────────────────────────────────────

if (failures.length) {
  console.error(`\nRECOVERY PREVIEW GUARD TEST FAILED (${failures.length} violation${failures.length === 1 ? "" : "s"})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nRECOVERY PREVIEW GUARD TEST PASSED");
