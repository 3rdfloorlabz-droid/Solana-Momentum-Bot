// reset_live_safety.js
// Purpose: Clear emergencyStopActivatedAt, verify safety config, validate live_trades.json.
// Does NOT enable live trading. Does NOT connect wallets. Does NOT submit transactions.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, "live_config.json");
const LIVE_TRADES_FILE = path.join(ROOT, "live_trades.json");

const PASS = "\x1b[32m✔\x1b[0m";
const FAIL = "\x1b[31m✘\x1b[0m";
const WARN = "\x1b[33m⚠\x1b[0m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";

function check(label, passed, detail = "") {
  const icon = passed ? PASS : FAIL;
  const status = passed ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  ${icon} ${status}  ${label}${detail ? `  ${DIM}${detail}${RESET}` : ""}`);
  return passed;
}

function warn(label, detail = "") {
  console.log(`  ${WARN} \x1b[33mWARN\x1b[0m  ${label}${detail ? `  ${DIM}${detail}${RESET}` : ""}`);
}

function section(title) {
  console.log(`\n${BOLD}${CYAN}── ${title.toUpperCase()} ${"─".repeat(Math.max(0, 52 - title.length))}${RESET}`);
}

// ─── Step 1: Load config ─────────────────────────────────────────────────────

section("Loading config");

if (!fs.existsSync(CONFIG_FILE)) {
  console.error(`${FAIL} live_config.json not found at: ${CONFIG_FILE}`);
  process.exit(1);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  console.log(`  ${PASS} live_config.json loaded`);
} catch (err) {
  console.error(`${FAIL} live_config.json parse error: ${err.message}`);
  process.exit(1);
}

// ─── Step 2: Clear emergencyStopActivatedAt ───────────────────────────────────

section("Clearing emergency stop");

const hadEmergencyStop = Boolean(config.emergencyStopActivatedAt);

if (hadEmergencyStop) {
  console.log(`  ${WARN} emergencyStopActivatedAt was set: ${config.emergencyStopActivatedAt}`);
  console.log(`  Clearing emergencyStopActivatedAt...`);
}

const updatedConfig = { ...config };
delete updatedConfig.emergencyStopActivatedAt;

// Safety guard: NEVER enable live trading from this script
updatedConfig.liveTradingEnabled = false;
updatedConfig.requireManualConfirm = true;

try {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updatedConfig, null, 2) + "\n");
  console.log(`  ${PASS} live_config.json saved`);
  if (hadEmergencyStop) {
    console.log(`  ${PASS} emergencyStopActivatedAt cleared`);
  } else {
    console.log(`  ${PASS} No emergency stop was set — nothing to clear`);
  }
} catch (err) {
  console.error(`${FAIL} Failed to write live_config.json: ${err.message}`);
  process.exit(1);
}

// ─── Step 3: Verify safety config ────────────────────────────────────────────

section("Verifying safety configuration");

const results = [];

results.push(check(
  "liveTradingEnabled = false",
  updatedConfig.liveTradingEnabled === false,
  `current: ${JSON.stringify(updatedConfig.liveTradingEnabled)}`
));

results.push(check(
  "requireManualConfirm = true",
  updatedConfig.requireManualConfirm === true,
  `current: ${JSON.stringify(updatedConfig.requireManualConfirm)}`
));

results.push(check(
  "positionSizeSol defined",
  typeof updatedConfig.positionSizeSol === "number" && updatedConfig.positionSizeSol > 0,
  `current: ${updatedConfig.positionSizeSol}`
));

results.push(check(
  "maxOpenTrades defined",
  typeof updatedConfig.maxOpenTrades === "number" && updatedConfig.maxOpenTrades >= 1,
  `current: ${updatedConfig.maxOpenTrades}`
));

results.push(check(
  "maxDailyLossSol defined",
  typeof updatedConfig.maxDailyLossSol === "number" && updatedConfig.maxDailyLossSol > 0,
  `current: ${updatedConfig.maxDailyLossSol}`
));

results.push(check(
  "maxDrawdownPercent defined",
  typeof updatedConfig.maxDrawdownPercent === "number" && updatedConfig.maxDrawdownPercent > 0,
  `current: ${updatedConfig.maxDrawdownPercent}`
));

results.push(check(
  "emergencyStopActivatedAt absent",
  !updatedConfig.emergencyStopActivatedAt,
  updatedConfig.emergencyStopActivatedAt ? `still set: ${updatedConfig.emergencyStopActivatedAt}` : "cleared"
));

if (updatedConfig.positionSizeSol > 0.25) {
  warn("positionSizeSol > 0.25 — Phase 1 target is 0.10 SOL", `current: ${updatedConfig.positionSizeSol}`);
}

// ─── Step 4: Validate live_trades.json ───────────────────────────────────────

section("Validating live_trades.json");

let liveTradesOk = false;

if (!fs.existsSync(LIVE_TRADES_FILE)) {
  // File missing — create a clean empty file
  console.log(`  ${WARN} live_trades.json not found — creating empty file`);
  try {
    fs.writeFileSync(LIVE_TRADES_FILE, "");
    console.log(`  ${PASS} live_trades.json created (empty)`);
    liveTradesOk = true;
  } catch (err) {
    console.error(`  ${FAIL} Could not create live_trades.json: ${err.message}`);
    results.push(false);
  }
} else {
  const raw = fs.readFileSync(LIVE_TRADES_FILE, "utf8");
  const trimmed = raw.trim();

  if (trimmed === "") {
    // Already empty — correct state
    check("live_trades.json exists", true);
    results.push(check("live_trades.json is empty", true, "ready for first live event"));
    liveTradesOk = true;
  } else {
    // Has content — validate as JSON-lines
    const lines = trimmed.split(/\r?\n/).filter(Boolean);
    let parseErrors = 0;
    const parsedEvents = [];

    for (let i = 0; i < lines.length; i++) {
      try {
        parsedEvents.push(JSON.parse(lines[i]));
      } catch {
        parseErrors += 1;
        console.log(`  ${FAIL} Parse error on line ${i + 1}: ${lines[i].substring(0, 80)}`);
      }
    }

    check("live_trades.json exists", true);

    const isEmptyFile = lines.length === 0;
    const hasInvalid = parseErrors > 0;
    const hasContent = parsedEvents.length > 0;

    if (hasContent) {
      warn(
        `live_trades.json has ${parsedEvents.length} existing event(s)`,
        "Not empty — contains prior live trade events"
      );
      results.push(check("JSON-lines format valid", parseErrors === 0, `${parseErrors} parse error(s)`));
      liveTradesOk = parseErrors === 0;

      // Check for open (unexited) live trades
      const openLiveTrades = parsedEvents.filter(
        e => e.actualEntryPrice && !e.actualExitPrice && e.success !== false
      );
      if (openLiveTrades.length > 0) {
        warn(
          `${openLiveTrades.length} live trade(s) appear open (no exit recorded)`,
          "Review before proceeding to Phase 1"
        );
      } else {
        check("No open live trades", true);
      }
    } else if (isEmptyFile) {
      results.push(check("live_trades.json is empty", true, "ready for first live event"));
      liveTradesOk = true;
    } else {
      // Lines exist but all failed to parse — offer to reset
      results.push(check("JSON-lines format valid", false, `${parseErrors} parse errors — file may be corrupted`));
      console.log(`\n  ${WARN} live_trades.json appears corrupted (likely the old '[ ]' array format).`);
      console.log(`     Run with --reset-live-trades to overwrite with an empty valid file.\n`);

      if (process.argv.includes("--reset-live-trades")) {
        try {
          const backup = LIVE_TRADES_FILE + ".bak." + Date.now();
          fs.copyFileSync(LIVE_TRADES_FILE, backup);
          fs.writeFileSync(LIVE_TRADES_FILE, "");
          console.log(`  ${PASS} Backed up corrupt file to: ${path.basename(backup)}`);
          console.log(`  ${PASS} live_trades.json reset to empty`);
          liveTradesOk = true;
        } catch (err) {
          console.error(`  ${FAIL} Reset failed: ${err.message}`);
        }
      }
    }
  }
}

// ─── Step 5: Verify emergency_stop.js is present ─────────────────────────────

section("Verifying kill switch");

const emergencyStopFile = path.join(ROOT, "emergency_stop.js");
results.push(check(
  "emergency_stop.js present",
  fs.existsSync(emergencyStopFile),
  fs.existsSync(emergencyStopFile) ? "kill switch available" : "FILE MISSING"
));

// ─── Step 6: Readiness summary ────────────────────────────────────────────────

section("Phase 1 Readiness Summary");

const allPassed = results.every(Boolean);
const passCount = results.filter(Boolean).length;

console.log(`\n  Config checks: ${passCount} / ${results.length} passed`);

if (allPassed && liveTradesOk) {
  console.log(`\n  ${PASS} ${BOLD}\x1b[32mSAFETY RESET COMPLETE${RESET}`);
  console.log(`  ${DIM}liveTradingEnabled=false | requireManualConfirm=true | live_trades.json validated${RESET}`);
  console.log(`  ${DIM}Emergency stop cleared. System is in safe standby state.${RESET}\n`);
} else {
  console.log(`\n  ${FAIL} ${BOLD}\x1b[31mREADINESS ISSUES DETECTED — review above before Phase 1${RESET}\n`);
}

console.log(`  Current config:`);
console.log(`  ${DIM}${JSON.stringify(updatedConfig, null, 4).split("\n").join("\n  ")}${RESET}\n`);
