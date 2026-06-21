// emergency_stop.js
// Global kill switch. Sets automationEnabled=false AND emergencyStop=true.
// After this runs, the executor halts ALL activity (entries and exits) until
// reset_live_safety.js is run. Works regardless of executor process state.

const fs = require("fs");
const path = require("path");

const CONFIG_FILE = path.join(__dirname, "live_config.json");
const CONTROL_FILE = path.join(__dirname, "live_control_events.jsonl");

function emergencyStop(reason = "Manual emergency_stop.js") {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  const stopped = {
    ...config,
    automationEnabled: false,
    emergencyStop: true,
    liveTradingEnabled: false,
    ENABLE_LIVE_TRADING: false,
    emergencyStopActivatedAt: new Date().toISOString(),
    lastAutomationToggleAt: new Date().toISOString(),
    lastAutomationToggleReason: reason
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(stopped, null, 2) + "\n");

  try {
    fs.appendFileSync(CONTROL_FILE,
      JSON.stringify({ timestamp: new Date().toISOString(), action: "EMERGENCY_STOP", reason, source: "emergency_stop.js" }) + "\n");
  } catch { /* control log is best-effort */ }

  return stopped;
}

if (require.main === module) {
  const reason = process.argv.slice(2).join(" ") || "Manual emergency_stop.js";
  emergencyStop(reason);
  console.log("⛔ EMERGENCY STOP ACTIVE");
  console.log("   automationEnabled = false");
  console.log("   emergencyStop = true");
  console.log("   Run: node reset_live_safety.js  to clear (does NOT re-enable automation).");
}

module.exports = { emergencyStop };
