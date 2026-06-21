const axios = require("axios");
const fs = require("fs");

const PAPER_FILE = "paper_trades.json";
const DEX = "https://api.dexscreener.com";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadTrades() {
  if (!fs.existsSync(PAPER_FILE)) return [];

  return fs.readFileSync(PAPER_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function saveTrades(trades) {
  fs.writeFileSync(
    PAPER_FILE,
    trades.map(t => JSON.stringify(t)).join("\n") + "\n"
  );
}

async function getCurrentPrice(address) {
  try {
    const response = await axios.get(`${DEX}/latest/dex/tokens/${address}`);

    if (!response.data.pairs?.length) return null;

    const solPairs = response.data.pairs.filter(p => p.chainId === "solana");
    const pair = solPairs[0] || response.data.pairs[0];

    return Number(pair.priceUsd || 0);
  } catch {
    return null;
  }
}

async function monitorTrades() {
  const trades = loadTrades();
  let changed = false;

  for (const trade of trades) {
    if (trade.status !== "OPEN") continue;

    const currentPrice = await getCurrentPrice(trade.address);
    if (!currentPrice) continue;

    const ageMinutes =
      (Date.now() - new Date(trade.timestamp).getTime()) / 60000;

    const livePnl =
      ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;

    const distanceToTarget =
      ((trade.targetPrice - currentPrice) / currentPrice) * 100;

    const distanceToStop =
      ((currentPrice - trade.stopPrice) / currentPrice) * 100;

    console.log(
      `${trade.symbol} | PnL ${livePnl.toFixed(2)}% | Target ${distanceToTarget.toFixed(2)}% away | Stop ${distanceToStop.toFixed(2)}% away | Age ${ageMinutes.toFixed(1)}m`
    );

    if (currentPrice >= trade.targetPrice) {
      trade.status = "WIN";
      trade.exitPrice = currentPrice;
      trade.pnlPercent = Number(livePnl.toFixed(2));
      trade.closedAt = new Date().toISOString();

      console.log(`✅ WIN ${trade.symbol}`);
      changed = true;
      continue;
    }

   if (currentPrice <= trade.stopPrice) {
  trade.status = "LOSS";
  trade.exitPrice = trade.stopPrice;
  trade.pnlPercent = -5;
  trade.closedAt = new Date().toISOString();

  console.log(`❌ LOSS ${trade.symbol}`);
  changed = true;
  continue;
}

    if (ageMinutes >= 20) {
      trade.status = "TIMEOUT";
      trade.exitPrice = currentPrice;
      trade.pnlPercent = Number(livePnl.toFixed(2));
      trade.closedAt = new Date().toISOString();

      console.log(`⏰ TIMEOUT ${trade.symbol}`);
      changed = true;
    }

    await sleep(250);
  }

  if (changed) saveTrades(trades);

  const open = trades.filter(t => t.status === "OPEN").length;
  const wins = trades.filter(t => t.status === "WIN").length;
  const losses = trades.filter(t => t.status === "LOSS").length;
  const timeouts = trades.filter(t => t.status === "TIMEOUT").length;
  const closed = trades.filter(t => t.status !== "OPEN");

  const totalPnl = closed.reduce((sum, t) => sum + Number(t.pnlPercent || 0), 0);
  const winRate = closed.length
    ? ((wins / closed.length) * 100).toFixed(2)
    : "0.00";

  console.log("\n=== PAPER TRADE STATS ===");
  console.log(`OPEN: ${open}`);
  console.log(`WINS: ${wins}`);
  console.log(`LOSSES: ${losses}`);
  console.log(`TIMEOUTS: ${timeouts}`);
  console.log(`CLOSED: ${closed.length}`);
  console.log(`WIN RATE: ${winRate}%`);
  console.log(`TOTAL PAPER PNL: ${totalPnl.toFixed(2)}%`);
}

async function main() {
  while (true) {
    console.clear();
    await monitorTrades();

    console.log("\nNext monitor cycle in 60 seconds. Press Ctrl+C to stop.");
    await sleep(60000);
  }
}

main().catch(err => console.error("Fatal error:", err.message));