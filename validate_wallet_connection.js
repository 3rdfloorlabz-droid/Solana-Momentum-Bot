// validate_wallet_connection.js
// Read-only validator for the wallet monitor. Changes nothing. Prints PASS/FAIL
// and exits non-zero on FAIL.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, "live_config.json");
const STATUS_FILE = path.join(ROOT, "wallet_status.json");
const DASHBOARD_FILE = path.join(ROOT, "dashboard_server.js");

const G = "\x1b[32m✔\x1b[0m", R = "\x1b[31m✘\x1b[0m", D = "\x1b[2m", X = "\x1b[0m", B = "\x1b[1m";

let failures = 0;
function ok(label, detail = "")  { console.log(`  ${G} ${label}${detail ? `  ${D}${detail}${X}` : ""}`); }
function bad(label, detail = "") { console.log(`  ${R} ${label}${detail ? `  ${D}${detail}${X}` : ""}`); failures++; }

console.log(`\n${B}── WALLET CONNECTION VALIDATION ──────────────────────${X}`);

// Load config (for address comparison).
let cfg = null;
try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }
catch (err) { bad("live_config.json readable", err.message); }

// 1. wallet_status.json exists.
let status = null;
if (!fs.existsSync(STATUS_FILE)) {
  bad("wallet_status.json exists", "run: node wallet_monitor.js --once");
} else {
  ok("wallet_status.json exists");
  try { status = JSON.parse(fs.readFileSync(STATUS_FILE, "utf8")); ok("wallet_status.json valid JSON"); }
  catch (err) { bad("wallet_status.json valid JSON", err.message); }
}

if (status) {
  // 2. wallet address matches config.
  if (!status.walletAddress) bad("walletAddress present in status");
  else if (cfg && status.walletAddress !== cfg.walletPublicAddress) {
    bad("wallet address matches config", `status ${status.walletAddress} != config ${cfg.walletPublicAddress}`);
  } else {
    ok("wallet address matches config", status.walletAddress);
  }

  // 3. balance field is numeric (or null when disconnected — still must be the right type).
  if (status.connected) {
    typeof status.balanceSol === "number" && Number.isFinite(status.balanceSol)
      ? ok("balanceSol numeric", String(status.balanceSol))
      : bad("balanceSol numeric", `got ${typeof status.balanceSol}: ${status.balanceSol}`);
  } else {
    // Disconnected: balance is allowed to be null, but the field must exist.
    "balanceSol" in status
      ? ok("balanceSol field present (null while disconnected)")
      : bad("balanceSol field present");
  }

  // 4. latency field exists.
  "latencyMs" in status ? ok("latencyMs field exists", String(status.latencyMs)) : bad("latencyMs field exists");

  // 5. timestamp exists.
  if (!status.updatedAt) bad("updatedAt timestamp exists");
  else if (Number.isFinite(new Date(status.updatedAt).getTime())) ok("updatedAt timestamp valid", status.updatedAt);
  else bad("updatedAt timestamp valid", status.updatedAt);

  // Bonus: connection flag is boolean.
  typeof status.connected === "boolean" ? ok("connected flag is boolean", String(status.connected)) : bad("connected flag is boolean");
}

// 6. dashboard panel present.
if (!fs.existsSync(DASHBOARD_FILE)) bad("dashboard_server.js exists");
else {
  const src = fs.readFileSync(DASHBOARD_FILE, "utf8");
  src.includes("WALLET CONNECTION STATUS") ? ok("dashboard wallet panel present") : bad("dashboard wallet panel present");
  src.includes("RPC HEALTH") ? ok("dashboard RPC health panel present") : bad("dashboard RPC health panel present");
}

console.log(`\n${B}── RESULT ────────────────────────────────────────────${X}`);
if (failures === 0) {
  console.log(`\n  ${B}\x1b[32mPASS${X} ${D}— wallet monitoring validated (read-only)${X}\n`);
  process.exit(0);
} else {
  console.log(`\n  ${B}\x1b[31mFAIL${X} — ${failures} check(s) failed\n`);
  process.exit(1);
}
