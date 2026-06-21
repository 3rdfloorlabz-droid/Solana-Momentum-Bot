const fs = require("fs");

const PAPER_FILE = "paper_trades.json";
const STRATEGY_FILE = "scanner_gmgn_trending.js";
const MONITOR_FILE = "monitor.js";
const CLOSED_STATUSES = new Set(["WIN", "LOSS", "TIMEOUT"]);

function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];

  return fs.readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function readVersion(file, constantName) {
  if (!fs.existsSync(file)) return null;

  const source = fs.readFileSync(file, "utf8");
  const match = source.match(new RegExp(`const ${constantName} = "([^"]+)"`));
  return match?.[1] || null;
}

function argumentValue(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.find(value => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function groupBy(items, bucketFn) {
  const groups = new Map();

  for (const item of items) {
    const bucket = bucketFn(item);
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(item);
  }

  return groups;
}

function printGroups(title, trades, bucketFn, order = []) {
  console.log(`\n=== ${title} ===`);
  const groups = groupBy(trades, bucketFn);
  const keys = [
    ...order.filter(key => groups.has(key)),
    ...[...groups.keys()].filter(key => !order.includes(key))
  ];

  if (!keys.length) {
    console.log("No closed forward-test trades.");
    return;
  }

  for (const key of keys) {
    const list = groups.get(key);
    const pnl = list.reduce((sum, trade) => sum + Number(trade.pnlPercent), 0);
    const wins = list.filter(trade => trade.status === "WIN").length;
    const winRate = (wins / list.length) * 100;

    console.log(
      `${key} | Trades ${list.length} | Win Rate ${winRate.toFixed(2)}% | Avg ${(pnl / list.length).toFixed(2)}% | PnL ${pnl.toFixed(2)}%`
    );
  }
}

function botRateBucket(trade) {
  if (trade.botDegenRate === undefined || trade.botDegenRate === null) return "Missing";
  const rate = Number(trade.botDegenRate);
  if (rate < 0.05) return "0-5%";
  if (rate < 0.10) return "5-10%";
  if (rate < 0.15) return "10-15%";
  if (rate < 0.20) return "15-20%";
  return "20%+";
}

function marketCapBucket(trade) {
  if (trade.marketCap === undefined || trade.marketCap === null) return "Missing";
  const marketCap = Number(trade.marketCap);
  if (marketCap < 100000) return "<100k";
  if (marketCap < 250000) return "100k-250k";
  if (marketCap < 500000) return "250k-500k";
  if (marketCap < 1000000) return "500k-1M";
  return "1M+";
}

function scoreBucket(trade) {
  if (trade.score === undefined || trade.score === null) return "Missing";
  const score = Number(trade.score);
  if (score < 70) return "<70";
  if (score < 80) return "70-79";
  if (score < 90) return "80-89";
  return "90-100";
}

function top10Bucket(trade) {
  if (trade.top10HolderRate === undefined || trade.top10HolderRate === null) return "Missing";
  const rate = Number(trade.top10HolderRate);
  if (rate < 0.10) return "0-10%";
  if (rate < 0.20) return "10-20%";
  if (rate < 0.30) return "20-30%";
  if (rate < 0.40) return "30-40%";
  return "40%+";
}

function main() {
  const strategyVersion =
    argumentValue("strategy-version") ||
    readVersion(STRATEGY_FILE, "STRATEGY_VERSION");
  const monitorVersion =
    argumentValue("monitor-version") ||
    readVersion(MONITOR_FILE, "MONITOR_VERSION");

  if (!strategyVersion || !monitorVersion) {
    console.error("Unable to determine newest strategyVersion or monitorVersion.");
    process.exitCode = 1;
    return;
  }

  const allTrades = readJsonLines(PAPER_FILE);
  const versionedTrades = allTrades.filter(trade =>
    trade.strategyVersion === strategyVersion &&
    trade.monitorVersion === monitorVersion
  );
  const closed = versionedTrades.filter(trade =>
    CLOSED_STATUSES.has(trade.status) &&
    Number.isFinite(Number(trade.pnlPercent))
  );
  const pnl = closed.reduce((sum, trade) => sum + Number(trade.pnlPercent), 0);

  console.log("\n=== FORWARD TEST ===");
  console.log(`Strategy Version: ${strategyVersion}`);
  console.log(`Monitor Version: ${monitorVersion}`);
  console.log(`Matching Trades: ${versionedTrades.length}`);
  console.log(`Closed Count: ${closed.length}`);
  console.log(`Unique Token Count: ${new Set(closed.map(trade => trade.address)).size}`);
  console.log(`Wins: ${closed.filter(trade => trade.status === "WIN").length}`);
  console.log(`Losses: ${closed.filter(trade => trade.status === "LOSS").length}`);
  console.log(`Timeouts: ${closed.filter(trade => trade.status === "TIMEOUT").length}`);
  console.log(`Average Return Per Trade: ${avg(closed.map(trade => Number(trade.pnlPercent))).toFixed(2)}%`);
  console.log(`Total Summed PnL: ${pnl.toFixed(2)}%`);
  console.log(`Legacy/Mixed Trades Excluded: ${allTrades.length - versionedTrades.length}`);

  printGroups(
    "PERFORMANCE BY BOT RATE",
    closed,
    botRateBucket,
    ["0-5%", "5-10%", "10-15%", "15-20%", "20%+", "Missing"]
  );
  printGroups(
    "PERFORMANCE BY MARKET CAP",
    closed,
    marketCapBucket,
    ["<100k", "100k-250k", "250k-500k", "500k-1M", "1M+", "Missing"]
  );
  printGroups(
    "PERFORMANCE BY SCORE BUCKET",
    closed,
    scoreBucket,
    ["<70", "70-79", "80-89", "90-100", "Missing"]
  );
  printGroups(
    "PERFORMANCE BY TOP10 BUCKET",
    closed,
    top10Bucket,
    ["0-10%", "10-20%", "20-30%", "30-40%", "40%+", "Missing"]
  );
}

main();
