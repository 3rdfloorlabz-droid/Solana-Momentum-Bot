// reset_live_safety.js
// Clears the emergency stop ONLY. Does NOT enable automation and does NOT
// turn off dry run. Verifies all safety invariants and prints a summary.

const fs = require("fs");
const path = require("path");
const configStore = require("./config_store"); // A1b: shared atomic config writer

const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, "live_config.json");
const CONTROL_FILE = path.join(ROOT, "live_control_events.jsonl");
const POSITIONS_FILE = path.join(ROOT, "live_positions.json");
const LIVE_TRADES_FILE = path.join(ROOT, "live_trades.jsonl");

const G = "\x1b[32m✔\x1b[0m", R = "\x1b[31m✘\x1b[0m", Y = "\x1b[33m⚠\x1b[0m", D = "\x1b[2m", X = "\x1b[0m";

function check(label, ok, detail = "") {
  console.log(`  ${ok ? G : R} ${label}${detail ? `  ${D}${detail}${X}` : ""}`);
  return ok;
}

if (!fs.existsSync(CONFIG_FILE)) { console.error(`${R} live_config.json not found`); process.exit(1); }

let cfg;
try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }
catch (err) { console.error(`${R} config parse error: ${err.message}`); process.exit(1); }

const configBefore = JSON.parse(JSON.stringify(cfg));

console.log("\n── CLEARING EMERGENCY STOP ──────────────────────────────");
const wasStopped = Boolean(cfg.emergencyStop || cfg.emergencyStopActivatedAt);
if (wasStopped) console.log(`  ${Y} Emergency stop was active. Clearing...`);

cfg.emergencyStop = false;
delete cfg.emergencyStopActivatedAt;
delete cfg.killSwitchReason;

// NEVER auto-enable automation or disable dry run.
cfg.automationEnabled = false;
if (cfg.dryRunMode !== true) {
  console.log(`  ${Y} dryRunMode was not true — forcing back to true for safety.`);
  cfg.dryRunMode = true;
}
cfg.lastAutomationToggleAt = new Date().toISOString();
cfg.lastAutomationToggleReason = "reset_live_safety.js cleared emergency stop";

configStore.writeConfigAtomic(cfg, CONFIG_FILE);
console.log(`  ${G} Emergency stop cleared. automation remains OFF, dry run remains ON.`);

try {
  fs.appendFileSync(CONTROL_FILE, JSON.stringify({
    timestamp: new Date().toISOString(), action: "RESET", reason: "reset_live_safety.js", source: "reset_live_safety.js"
  }) + "\n");
} catch { /* best-effort */ }

// A3 config change audit (append-only; never mutates config). Best-effort.
try {
  const executor = require("./live_executor");
  executor.auditConfigChange({
    oldCfg: configBefore,
    newCfg: cfg,
    actor: "operator",
    source: "reset_live_safety.js",
    reason: "cleared emergency stop (automation stays OFF, dry run stays ON)"
  });
} catch { /* audit is best-effort; never block reset */ }

console.log("\n── VERIFYING SAFETY INVARIANTS ──────────────────────────");
const results = [];
results.push(check("emergencyStop = false", cfg.emergencyStop === false));
results.push(check("automationEnabled = false", cfg.automationEnabled === false));
results.push(check("dryRunMode = true", cfg.dryRunMode === true));
results.push(check("positionSizeSol <= 0.10", Number(cfg.positionSizeSol) <= 0.10, `current ${cfg.positionSizeSol}`));
results.push(check("maxOpenTrades <= 1", Number(cfg.maxOpenTrades) <= 1));
results.push(check("walletPublicAddress set", !!cfg.walletPublicAddress, cfg.walletPublicAddress || "MISSING"));
results.push(check("no compounding/averaging/martingale",
  !cfg.compoundingEnabled && !cfg.averagingDownEnabled && !cfg.martingaleEnabled));

// Files
console.log("\n── FILE INTEGRITY ───────────────────────────────────────");
if (!fs.existsSync(LIVE_TRADES_FILE)) { fs.writeFileSync(LIVE_TRADES_FILE, ""); console.log(`  ${Y} live_trades.jsonl created (empty)`); }
let jsonlOk = true;
const raw = fs.readFileSync(LIVE_TRADES_FILE, "utf8").trim();
if (raw) {
  raw.split(/\r?\n/).forEach((line, i) => { try { JSON.parse(line); } catch { jsonlOk = false; console.log(`  ${R} parse error line ${i + 1}`); } });
}
results.push(check("live_trades.jsonl valid JSONL", jsonlOk));

let openCount = 0;
if (fs.existsSync(POSITIONS_FILE)) {
  try { const p = JSON.parse(fs.readFileSync(POSITIONS_FILE, "utf8")); openCount = (Array.isArray(p) ? p : []).filter(x => x.status === "OPEN").length; }
  catch { console.log(`  ${Y} live_positions.json unreadable`); }
}
results.push(check("open positions within limit", openCount <= Number(cfg.maxOpenTrades || 1), `${openCount} open`));

console.log("\n── SUMMARY ──────────────────────────────────────────────");
const allOk = results.every(Boolean);
console.log(`  ${results.filter(Boolean).length}/${results.length} checks passed`);
console.log(allOk
  ? `\n  ${G} Reset complete. System SAFE: automation OFF, dry run ON, no emergency stop.\n`
  : `\n  ${R} Issues found above — review before starting automation.\n`);
