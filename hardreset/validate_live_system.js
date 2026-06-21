// validate_live_system.js
// Read-only validator for the Phase 1 live system. Submits nothing, changes
// nothing. Exits non-zero if any safety-critical check fails.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, "live_config.json");
const POSITIONS_FILE = path.join(ROOT, "live_positions.json");
const LIVE_TRADES_FILE = path.join(ROOT, "live_trades.jsonl");
const CONTROL_FILE = path.join(ROOT, "live_control_events.jsonl");
const ERRORS_FILE = path.join(ROOT, "live_errors.jsonl");
const DASHBOARD_FILE = path.join(ROOT, "dashboard_server.js");

const G = "\x1b[32m✔\x1b[0m", R = "\x1b[31m✘\x1b[0m", Y = "\x1b[33m⚠\x1b[0m", D = "\x1b[2m", X = "\x1b[0m", B = "\x1b[1m";

let failures = 0, warnings = 0;
function ok(label, detail = "")  { console.log(`  ${G} ${label}${detail ? `  ${D}${detail}${X}` : ""}`); }
function bad(label, detail = "") { console.log(`  ${R} ${label}${detail ? `  ${D}${detail}${X}` : ""}`); failures++; }
function warn(label, detail = ""){ console.log(`  ${Y} ${label}${detail ? `  ${D}${detail}${X}` : ""}`); warnings++; }
function section(t) { console.log(`\n${B}── ${t} ${"─".repeat(Math.max(0, 50 - t.length))}${X}`); }
function readJsonl(f) {
  if (!fs.existsSync(f)) return { rows: [], errors: 0 };
  let errors = 0; const rows = [];
  fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).forEach(l => { try { rows.push(JSON.parse(l)); } catch { errors++; } });
  return { rows, errors };
}

// 1. CONFIG SAFETY
section("CONFIG SAFETY");
let cfg = null;
if (!fs.existsSync(CONFIG_FILE)) { bad("live_config.json exists"); }
else {
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); ok("live_config.json valid JSON"); }
  catch (e) { bad("live_config.json valid JSON", e.message); }
}
if (cfg) {
  cfg.dryRunMode === true ? ok("dryRunMode = true (Phase 1 required)") : bad("dryRunMode = true", `is ${cfg.dryRunMode} — Phase 1 must stay in dry run`);
  cfg.automationEnabled === false ? ok("automationEnabled = false (shipped state)") : warn("automationEnabled is true", "automation is currently ON");
  cfg.emergencyStop === false ? ok("emergencyStop = false") : warn("emergencyStop is true", "run reset_live_safety.js to clear");
  !cfg.compoundingEnabled ? ok("compounding disabled") : bad("compounding disabled");
  !cfg.averagingDownEnabled ? ok("averaging-down disabled") : bad("averaging-down disabled");
  !cfg.martingaleEnabled ? ok("martingale disabled") : bad("martingale disabled");
}

// 2. WALLET ADDRESS
section("WALLET ADDRESS");
const EXPECTED = "FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6";
if (cfg) {
  if (!cfg.walletPublicAddress) bad("walletPublicAddress set");
  else {
    ok("walletPublicAddress set", cfg.walletPublicAddress);
    // base58-ish length + charset sanity (not full validation)
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(cfg.walletPublicAddress) ? ok("address format plausible") : warn("address format unusual");
    cfg.walletPublicAddress === EXPECTED ? ok("address matches dedicated Phase 1 wallet") : warn("address differs from documented wallet");
  }
}

// 3. POSITION SIZE
section("POSITION SIZE");
if (cfg) {
  Number(cfg.positionSizeSol) === 0.10 ? ok("positionSizeSol = 0.10") : (Number(cfg.positionSizeSol) <= 0.10 ? warn("positionSizeSol <= 0.10", `is ${cfg.positionSizeSol}`) : bad("positionSizeSol > 0.10", `is ${cfg.positionSizeSol}`));
  Number(cfg.maxOpenTrades) <= 1 ? ok("maxOpenTrades <= 1") : bad("maxOpenTrades > 1", `is ${cfg.maxOpenTrades}`);
  Number(cfg.maxDailyLossSol) <= 0.10 ? ok("maxDailyLossSol <= 0.10") : warn("maxDailyLossSol > 0.10", `is ${cfg.maxDailyLossSol}`);
  Number(cfg.maxDailyLossCount) <= 3 ? ok("maxDailyLossCount <= 3") : warn("maxDailyLossCount > 3", `is ${cfg.maxDailyLossCount}`);
}

// 4. EMERGENCY STOP STATE
section("EMERGENCY STOP STATE");
if (cfg) {
  if (cfg.emergencyStop) { warn("emergency stop is ACTIVE", "no entries or exits until reset"); }
  else ok("emergency stop not active");
  if (cfg.emergencyStop && cfg.automationEnabled) bad("INVALID: emergencyStop true while automationEnabled true");
  else ok("emergency/automation flags consistent");
}

// 5. JSONL VALIDITY
section("JSONL VALIDITY");
for (const [name, f] of [["live_trades.jsonl", LIVE_TRADES_FILE], ["live_control_events.jsonl", CONTROL_FILE], ["live_errors.jsonl", ERRORS_FILE]]) {
  if (!fs.existsSync(f)) { warn(`${name} not yet created`, "will be created on first write"); continue; }
  const { rows, errors } = readJsonl(f);
  errors === 0 ? ok(`${name} valid`, `${rows.length} rows`) : bad(`${name} has ${errors} bad line(s)`);
}

// 6. DUPLICATE POSITIONS + MAX OPEN
section("POSITIONS / DUPLICATES / MAX OPEN");
let positions = [];
if (fs.existsSync(POSITIONS_FILE)) {
  try { const p = JSON.parse(fs.readFileSync(POSITIONS_FILE, "utf8")); positions = Array.isArray(p) ? p : []; ok("live_positions.json valid JSON"); }
  catch (e) { bad("live_positions.json valid JSON", e.message); }
} else ok("live_positions.json not yet created", "no open positions");
const open = positions.filter(p => p.status === "OPEN");
open.length <= (cfg ? Number(cfg.maxOpenTrades || 1) : 1) ? ok("open positions within max", `${open.length} open`) : bad("too many open positions", `${open.length}`);
const addrs = open.map(p => p.address);
const dupeAddr = addrs.filter((a, i) => addrs.indexOf(a) !== i);
dupeAddr.length === 0 ? ok("no duplicate open positions by address") : bad("duplicate open positions", dupeAddr.join(", "));

// 7. DAILY STOP STATUS
section("DAILY STOP STATUS");
const { rows: tradeRows } = readJsonl(LIVE_TRADES_FILE);
const today = new Date().toLocaleDateString("en-CA");
const closedToday = tradeRows.filter(r => r.eventType === "CLOSED_LIVE_TRADE" && r.exitTime && new Date(r.exitTime).toLocaleDateString("en-CA") === today);
const lossesToday = closedToday.filter(r => r.status === "LOSS" || Number(r.netPnlSol) < 0).length;
const solToday = closedToday.reduce((s, r) => s + Number(r.netPnlSol || 0), 0);
const lossCountHit = cfg && lossesToday >= Number(cfg.maxDailyLossCount || 3);
const lossSolHit = cfg && solToday <= -(Math.abs(Number(cfg.maxDailyLossSol || 0.10)));
if (lossCountHit || lossSolHit) warn("daily stop currently HIT", `${lossesToday} losses, ${solToday.toFixed(4)} SOL today`);
else ok("daily stop not hit", `${lossesToday} losses, ${solToday.toFixed(4)} SOL today`);

// 8. DASHBOARD CONTROL INTEGRITY
section("DASHBOARD CONTROL INTEGRITY");
if (!fs.existsSync(DASHBOARD_FILE)) bad("dashboard_server.js exists");
else {
  const src = fs.readFileSync(DASHBOARD_FILE, "utf8");
  src.includes('/control/start') ? ok("START endpoint present") : bad("START endpoint /control/start missing");
  src.includes('/control/stop') ? ok("STOP endpoint present") : bad("STOP endpoint /control/stop missing");
  src.includes('/control/emergency') ? ok("EMERGENCY endpoint present") : bad("EMERGENCY endpoint /control/emergency missing");
  src.includes("LIVE AUTOMATION CONTROL") ? ok("automation control panel present") : bad("automation control panel missing");
}

// RESULT
section("RESULT");
console.log(`  ${failures === 0 ? G : R} ${failures} failure(s), ${warnings} warning(s)`);
if (failures === 0) console.log(`\n  ${B}\x1b[32mLIVE SYSTEM VALIDATION PASSED${X} ${D}(dry run, automation off)${X}\n`);
else console.log(`\n  ${B}\x1b[31mVALIDATION FAILED — fix failures before proceeding${X}\n`);
process.exit(failures === 0 ? 0 : 1);
