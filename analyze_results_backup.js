const fs = require("fs");

const PAPER_FILE = "paper_trades.json";
const NEAR_MISS_FILE = "near_misses.json";

function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];

  return fs.readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); }
      catch { return null; }
    })
    .filter(Boolean);
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function groupBy(items, keyFn) {
  const map = new Map();

  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }

  return map;
}

function scoreBucket(score) {
  if (score >= 90) return "90-100";
  if (score >= 80) return "80-89";
  if (score >= 70) return "70-79";
  if (score >= 60) return "60-69";
  return "Below 60";
}

function reasonBucket(reason = "") {
  const r = reason.toLowerCase();

  if (r.includes("bot")) return "Bot rate";
  if (r.includes("top10")) return "Top 10";
  if (r.includes("holder")) return "Holders";
  if (r.includes("bundler")) return "Bundlers";
  if (r.includes("liquidity")) return "Liquidity";
  if (r.includes("rug")) return "Rug ratio";
  if (r.includes("ath")) return "ATH drop";
  return "Other";
}

function printTradeStats(trades) {
  const closed = trades.filter(t => ["WIN", "LOSS", "TIMEOUT"].includes(t.status));
  const wins = closed.filter(t => t.status === "WIN");
  const losses = closed.filter(t => t.status === "LOSS");
  const timeouts = closed.filter(t => t.status === "TIMEOUT");

  const totalPnl = closed.reduce((sum, t) => sum + Number(t.pnlPercent || 0), 0);
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;

  console.log("\n=== PAPER TRADE SUMMARY ===");
  console.log(`Closed: ${closed.length}`);
  console.log(`Wins: ${wins.length}`);
  console.log(`Losses: ${losses.length}`);
  console.log(`Timeouts: ${timeouts.length}`);
  console.log(`Win Rate: ${winRate.toFixed(2)}%`);
  console.log(`Total PnL: ${totalPnl.toFixed(2)}%`);
  console.log(`Average Winner: ${avg(wins.map(t => Number(t.pnlPercent || 0))).toFixed(2)}%`);
  console.log(`Average Loser: ${avg(losses.map(t => Number(t.pnlPercent || 0))).toFixed(2)}%`);
  console.log(`Average Timeout: ${avg(timeouts.map(t => Number(t.pnlPercent || 0))).toFixed(2)}%`);

  console.log("\n=== TOP WINNERS ===");
  closed
    .slice()
    .sort((a, b) => Number(b.pnlPercent || 0) - Number(a.pnlPercent || 0))
    .slice(0, 10)
    .forEach(t => {
      console.log(`${t.symbol} | ${t.status} | ${Number(t.pnlPercent || 0).toFixed(2)}% | Score ${t.score} | ${t.source || "v3"}`);
    });

  console.log("\n=== WORST LOSERS ===");
  closed
    .slice()
    .sort((a, b) => Number(a.pnlPercent || 0) - Number(b.pnlPercent || 0))
    .slice(0, 10)
    .forEach(t => {
      console.log(`${t.symbol} | ${t.status} | ${Number(t.pnlPercent || 0).toFixed(2)}% | Score ${t.score} | ${t.source || "v3"}`);
    });

  console.log("\n=== PERFORMANCE BY SCORE BUCKET ===");
  const byScore = groupBy(closed, t => scoreBucket(Number(t.score || 0)));

  for (const [bucket, list] of [...byScore.entries()].sort()) {
    const pnl = list.reduce((sum, t) => sum + Number(t.pnlPercent || 0), 0);
    const winsInBucket = list.filter(t => t.status === "WIN").length;
    const wr = list.length ? (winsInBucket / list.length) * 100 : 0;

    console.log(`${bucket} | Trades ${list.length} | Win Rate ${wr.toFixed(2)}% | PnL ${pnl.toFixed(2)}%`);
  }

  console.log("\n=== PERFORMANCE BY SOURCE ===");
  const bySource = groupBy(closed, t => t.source || "v3");

  for (const [source, list] of bySource.entries()) {
    const pnl = list.reduce((sum, t) => sum + Number(t.pnlPercent || 0), 0);
    const winsInSource = list.filter(t => t.status === "WIN").length;
    const wr = list.length ? (winsInSource / list.length) * 100 : 0;

    console.log(`${source} | Trades ${list.length} | Win Rate ${wr.toFixed(2)}% | PnL ${pnl.toFixed(2)}%`);
  }
}

function analyzeThresholds(closed) {
  console.log("\n=== SCORE THRESHOLD ANALYSIS ===");

  const thresholds = [75, 80, 85, 90];

  for (const threshold of thresholds) {
    const trades = closed.filter(t => Number(t.score || 0) >= threshold);

    const wins = trades.filter(t => t.status === "WIN").length;

    const pnl = trades.reduce(
      (sum, t) => sum + Number(t.pnlPercent || 0),
      0
    );

    const winRate =
      trades.length > 0
        ? (wins / trades.length) * 100
        : 0;

    console.log(
      `Score >= ${threshold} | Trades ${trades.length} | Win Rate ${winRate.toFixed(
        2
      )}% | PnL ${pnl.toFixed(2)}%`
    );
  }
}

function printNearMissStats(nearMisses) {
  console.log("\n=== NEAR MISS SUMMARY ===");
  console.log(`Near Misses: ${nearMisses.length}`);

  const byReason = groupBy(nearMisses, n => reasonBucket(n.reason));

  for (const [reason, list] of [...byReason.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${reason} | Count ${list.length}`);
  }

  console.log("\n=== TOP NEAR MISSES BY SCORE ===");
  nearMisses
    .slice()
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 15)
    .forEach(n => {
      console.log(`${n.symbol} | Score ${n.score} | ${n.reason} | MC $${Math.round(n.marketCap || 0).toLocaleString()} | Liq $${Math.round(n.liquidity || 0).toLocaleString()}`);
    });
}

function main() {
  const trades = readJsonLines(PAPER_FILE);
  const nearMisses = readJsonLines(NEAR_MISS_FILE);

  printTradeStats(trades);
  const closed = trades.filter(t =>
  ["WIN", "LOSS", "TIMEOUT"].includes(t.status)
);

analyzeThresholds(closed);
  printNearMissStats(nearMisses);

  console.log("\n=== AGENT TAKEAWAY ===");

  const totalPnl = closed.reduce((sum, t) => sum + Number(t.pnlPercent || 0), 0);
  const winRate = closed.length
    ? (closed.filter(t => t.status === "WIN").length / closed.length) * 100
    : 0;

  if (closed.length < 50) {
    console.log("Sample is still small. Keep collecting until at least 50 closed trades.");
  } else if (totalPnl > 0 && winRate >= 30) {
    console.log("System is currently positive. Avoid major filter changes. Focus on analyzing near misses.");
  } else if (totalPnl < 0) {
    console.log("System is negative. Review worst losers and tighten the filter causing the largest drawdowns.");
  } else {
    console.log("Mixed result. Keep collecting data and compare by source, score bucket, and rejection reason.");
  }
}

main();