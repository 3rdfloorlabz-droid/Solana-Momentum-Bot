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

function analyzeBotRate(closed) {
  console.log("\n=== PERFORMANCE BY BOT RATE ===");

  const buckets = [
    { min: 0, max: 0.05 },
    { min: 0.05, max: 0.10 },
    { min: 0.10, max: 0.15 },
    { min: 0.15, max: 0.20 },
    { min: 0.20, max: 0.25 }
  ];

  for (const b of buckets) {
    const trades = closed.filter(t => {
      const bot = Number(t.botDegenRate || 0);
      return bot >= b.min && bot < b.max;
    });

    if (!trades.length) continue;

    const wins = trades.filter(t => t.status === "WIN").length;

    const pnl = trades.reduce(
      (sum, t) => sum + Number(t.pnlPercent || 0),
      0
    );

    const winRate = (wins / trades.length) * 100;

    console.log(
      `${(b.min * 100).toFixed(0)}-${(b.max * 100).toFixed(0)}% | Trades ${trades.length} | Win Rate ${winRate.toFixed(2)}% | PnL ${pnl.toFixed(2)}%`
    );
  }
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

function analyzeBundlerRate(closed) {
  console.log("\n=== PERFORMANCE BY BUNDLER RATE ===");

  const buckets = [
    { min: 0, max: 0.10 },
    { min: 0.10, max: 0.20 },
    { min: 0.20, max: 0.30 },
    { min: 0.30, max: 0.40 },
    { min: 0.40, max: 0.50 },
    { min: 0.50, max: 1.00 }
  ];

  for (const b of buckets) {
    const trades = closed.filter(t => {
      const rate = Number(t.bundlerRate || 0);
      return rate >= b.min && rate < b.max;
    });

    if (!trades.length) continue;

    const wins = trades.filter(t => t.status === "WIN").length;

    const pnl = trades.reduce(
      (sum, t) => sum + Number(t.pnlPercent || 0),
      0
    );

    const winRate = (wins / trades.length) * 100;

    console.log(
      `${(b.min * 100).toFixed(0)}-${(b.max * 100).toFixed(0)}% | Trades ${trades.length} | Win Rate ${winRate.toFixed(2)}% | PnL ${pnl.toFixed(2)}%`
    );
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

function analyzeMarketCap(closed) {
  console.log("\n=== PERFORMANCE BY MARKET CAP ===");

  const buckets = [
    { min: 0, max: 100000, label: "0-100k" },
    { min: 100000, max: 250000, label: "100k-250k" },
    { min: 250000, max: 500000, label: "250k-500k" },
    { min: 500000, max: 1000000, label: "500k-1M" },
    { min: 1000000, max: Infinity, label: "1M+" }
  ];

  for (const b of buckets) {
    const trades = closed.filter(t => {
      const mc = Number(t.marketCap || 0);
      return mc >= b.min && mc < b.max;
    });

    if (!trades.length) continue;

    const wins = trades.filter(t => t.status === "WIN").length;

    const pnl = trades.reduce(
      (sum, t) => sum + Number(t.pnlPercent || 0),
      0
    );

    const winRate = (wins / trades.length) * 100;

    console.log(
      `${b.label} | Trades ${trades.length} | Win Rate ${winRate.toFixed(2)}% | PnL ${pnl.toFixed(2)}%`
    );
  }
}

function analyzeTop10(closed) {
  console.log("\n=== PERFORMANCE BY TOP10 HOLDER RATE ===");

  const buckets = [
    { min: 0, max: 0.10, label: "0-10%" },
    { min: 0.10, max: 0.20, label: "10-20%" },
    { min: 0.20, max: 0.30, label: "20-30%" },
    { min: 0.30, max: 0.40, label: "30-40%" },
    { min: 0.40, max: 0.50, label: "40-50%" },
    { min: 0.50, max: 1.00, label: "50%+" }
  ];

  for (const b of buckets) {
    const trades = closed.filter(t => {
      const rate = Number(t.top10HolderRate || 0);
      return rate >= b.min && rate < b.max;
    });

    if (!trades.length) continue;

    const wins = trades.filter(t => t.status === "WIN").length;

    const pnl = trades.reduce(
      (sum, t) => sum + Number(t.pnlPercent || 0),
      0
    );

    const winRate = (wins / trades.length) * 100;

    console.log(
      `${b.label} | Trades ${trades.length} | Win Rate ${winRate.toFixed(2)}% | PnL ${pnl.toFixed(2)}%`
    );
  }
}

function analyzeLiquidity(closed) {
  console.log("\n=== PERFORMANCE BY LIQUIDITY ===");

  const buckets = [
    { min: 0, max: 30000, label: "<30k" },
    { min: 30000, max: 50000, label: "30k-50k" },
    { min: 50000, max: 75000, label: "50k-75k" },
    { min: 75000, max: 100000, label: "75k-100k" },
    { min: 100000, max: Infinity, label: "100k+" }
  ];

  for (const b of buckets) {
    const trades = closed.filter(t => {
      const liq = Number(t.liquidity || 0);
      return liq >= b.min && liq < b.max;
    });

    if (!trades.length) continue;

    const wins = trades.filter(t => t.status === "WIN").length;

    const pnl = trades.reduce(
      (sum, t) => sum + Number(t.pnlPercent || 0),
      0
    );

    const winRate = (wins / trades.length) * 100;

    console.log(
      `${b.label} | Trades ${trades.length} | Win Rate ${winRate.toFixed(2)}% | PnL ${pnl.toFixed(2)}%`
    );
  }
}

function analyzeIdealSetup(closed) {
  console.log("\n=== IDEAL SETUP PERFORMANCE ===");

  const ideal = closed.filter(t =>
    Number(t.score || 0) >= 80 &&
    Number(t.score || 0) < 90 &&
    Number(t.botDegenRate || 0) < 0.10 &&
    Number(t.marketCap || 0) >= 100000 &&
    Number(t.marketCap || 0) <= 250000 &&
    Number(t.top10HolderRate || 0) >= 0.10 &&
    Number(t.top10HolderRate || 0) <= 0.30
  );

  const wins = ideal.filter(t => t.status === "WIN").length;

  const pnl = ideal.reduce(
    (sum, t) => sum + Number(t.pnlPercent || 0),
    0
  );

  const winRate = ideal.length
    ? (wins / ideal.length) * 100
    : 0;

  console.log(
    `Trades ${ideal.length} | Win Rate ${winRate.toFixed(2)}% | PnL ${pnl.toFixed(2)}%`
  );
}

function analyzeNonIdealTrades(closed) {
  console.log("\n=== NON-IDEAL TRADE BREAKDOWN ===");

  const categories = {
    "Score Outside 80-89": t =>
      Number(t.score || 0) < 80 || Number(t.score || 0) >= 90,

    "Bot Rate >=10%": t =>
      Number(t.botDegenRate || 0) >= 0.10,

    "Market Cap Outside 100k-250k": t =>
      Number(t.marketCap || 0) < 100000 ||
      Number(t.marketCap || 0) > 250000,

    "Top10 Outside 10-30%": t =>
      Number(t.top10HolderRate || 0) < 0.10 ||
      Number(t.top10HolderRate || 0) > 0.30
  };

  for (const [name, filter] of Object.entries(categories)) {
    const trades = closed.filter(filter);

    if (!trades.length) continue;

    const wins = trades.filter(t => t.status === "WIN").length;

    const pnl = trades.reduce(
      (sum, t) => sum + Number(t.pnlPercent || 0),
      0
    );

    const winRate = (wins / trades.length) * 100;

    console.log(
      `${name} | Trades ${trades.length} | Win Rate ${winRate.toFixed(2)}% | PnL ${pnl.toFixed(2)}%`
    );
  }
}

function main() {
  const trades = readJsonLines(PAPER_FILE);
  const nearMisses = readJsonLines(NEAR_MISS_FILE);

  printTradeStats(trades);
  const closed = trades.filter(t =>
  ["WIN", "LOSS", "TIMEOUT"].includes(t.status)
);

  analyzeThresholds(closed);
analyzeBundlerRate(closed);
analyzeMarketCap(closed);
analyzeTop10(closed);
analyzeLiquidity(closed);
analyzeIdealSetup(closed);
analyzeNonIdealTrades(closed);
analyzeBotRate(closed);
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