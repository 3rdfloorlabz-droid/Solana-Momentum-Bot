const fs = require("fs");

const PAPER_FILE = "paper_trades.json";
const MONITOR_FILE = "monitor.js";
const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED_STATUSES = new Set(["WIN", "LOSS", "TIMEOUT"]);
const CLOSED_FIELDS = [
  "triggerType",
  "triggerPrice",
  "exitPrice",
  "pnlPercent",
  "closedAt"
];

function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];

  return fs.readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        return { row: index + 1, value: JSON.parse(line) };
      } catch (err) {
        return { row: index + 1, error: err.message };
      }
    });
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function label(trade, row) {
  return `row ${row} | ${trade.symbol || "UNKNOWN"} | ${trade.address || "missing address"}`;
}

function warn(warnings, category, message) {
  warnings.push({ category, message });
}

function validateDuplicateOpenTrades(trades, warnings) {
  const byAddress = new Map();

  for (const item of trades.filter(item => item.value?.status === "OPEN")) {
    const address = item.value.address;
    if (!address) continue;
    if (!byAddress.has(address)) byAddress.set(address, []);
    byAddress.get(address).push(item);
  }

  for (const [address, items] of byAddress.entries()) {
    if (items.length > 1) {
      warn(
        warnings,
        "DUPLICATE_OPEN",
        `${address} has ${items.length} open trades on rows ${items.map(item => item.row).join(", ")}`
      );
    }
  }
}

function validateTradesWithin24Hours(trades, warnings) {
  const byAddress = new Map();

  for (const item of trades) {
    const address = item.value?.address;
    const timestamp = new Date(item.value?.timestamp).getTime();
    if (!address || !Number.isFinite(timestamp)) continue;
    if (!byAddress.has(address)) byAddress.set(address, []);
    byAddress.get(address).push({ ...item, timestamp });
  }

  for (const [address, items] of byAddress.entries()) {
    items.sort((a, b) => a.timestamp - b.timestamp);

    for (let index = 1; index < items.length; index += 1) {
      const previous = items[index - 1];
      const current = items[index];
      const difference = current.timestamp - previous.timestamp;

      if (difference < DAY_MS) {
        warn(
          warnings,
          "REENTRY_WITHIN_24H",
          `${address} traded on rows ${previous.row} and ${current.row}, ${(
            difference / 3600000
          ).toFixed(2)} hours apart`
        );
      }
    }
  }
}

function validateTradeFields(trades, warnings) {
  for (const item of trades) {
    const trade = item.value;
    if (!trade) continue;

    if (!hasValue(trade.strategyVersion) || !hasValue(trade.monitorVersion)) {
      warn(
        warnings,
        "MISSING_VERSION",
        `${label(trade, item.row)} is missing strategyVersion or monitorVersion`
      );
    }

    if (CLOSED_STATUSES.has(trade.status)) {
      const missing = CLOSED_FIELDS.filter(field => !hasValue(trade[field]));

      if (missing.length) {
        warn(
          warnings,
          "MISSING_CLOSED_FIELD",
          `${label(trade, item.row)} is missing ${missing.join(", ")}`
        );
      }
    }
  }
}

function validateMonitorPairTracking(warnings) {
  if (!fs.existsSync(MONITOR_FILE)) {
    warn(warnings, "MONITOR_PAIR_TRACKING", `${MONITOR_FILE} does not exist`);
    return;
  }

  const source = fs.readFileSync(MONITOR_FILE, "utf8");
  const usesSavedPair =
    source.includes("getCurrentPrice(trade.pairAddress)") &&
    source.includes("/latest/dex/pairs/solana/${pairAddress}");
  const usesTokenLookup = source.includes("/latest/dex/tokens/");

  if (!usesSavedPair || usesTokenLookup) {
    warn(
      warnings,
      "MONITOR_PAIR_TRACKING",
      "monitor.js does not exclusively monitor the saved trade.pairAddress"
    );
  }
}

function main() {
  const parsed = readJsonLines(PAPER_FILE);
  const warnings = [];

  for (const item of parsed.filter(item => item.error)) {
    warn(warnings, "INVALID_JSON", `row ${item.row}: ${item.error}`);
  }

  const trades = parsed.filter(item => item.value);

  validateDuplicateOpenTrades(trades, warnings);
  validateTradesWithin24Hours(trades, warnings);
  validateTradeFields(trades, warnings);
  validateMonitorPairTracking(warnings);

  console.log("\n=== DATA VALIDATION ===");
  console.log(`Trades checked: ${trades.length}`);
  console.log(`Warnings: ${warnings.length}`);

  if (!warnings.length) {
    console.log("No warnings found.");
    return;
  }

  const counts = new Map();
  for (const warning of warnings) {
    counts.set(warning.category, (counts.get(warning.category) || 0) + 1);
  }

  console.log("\n=== WARNING SUMMARY ===");
  for (const [category, count] of counts.entries()) {
    console.log(`${category}: ${count}`);
  }

  console.log("\n=== WARNINGS ===");
  for (const warning of warnings) {
    console.log(`WARNING [${warning.category}] ${warning.message}`);
  }
}

main();
