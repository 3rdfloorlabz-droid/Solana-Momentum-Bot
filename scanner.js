const axios = require("axios");
const fs = require("fs");
const { execFileSync } = require("child_process");

const DEX = "https://api.dexscreener.com";
const PAPER_FILE = "paper_trades.json";
const WATCH_MODE = process.argv.includes("--watch");

const MIN_SCORE_TO_LOG = 75;
const REENTRY_COOLDOWN_HOURS = 24;
const STRATEGY_VERSION = "scanner_v4";
const MONITOR_VERSION = "monitor_v4";

const MIN_MARKET_CAP = 100000;
const MAX_MARKET_CAP = 500000;

const MIN_LIQUIDITY = 25000;
const MIN_VOLUME_5M = 2500;
const MIN_VOLUME_1H = 50000;

const MIN_HOLDER_COUNT = 300;
const MAX_TOP10_HOLDER_RATE = 0.25;
const MAX_BOT_DEGEN_RATE = 0.15;
const MAX_BUNDLER_WALLETS = 250;

const WATCHLIST = [
  "solana", "pump", "meme", "ai", "bonk", "wif", "fartcoin", "popcat",
  "pengu", "giga", "mew", "bome", "trenches", "moonshot", "raydium",
  "jupiter", "depin", "agent", "cto", "viral"
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readPaperTrades() {
  if (!fs.existsSync(PAPER_FILE)) return [];

  return fs.readFileSync(PAPER_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function alreadyOpen(address) {
  return readPaperTrades().some(
    trade => trade.address === address && trade.status === "OPEN"
  );
}

function recentlyTraded(address, hours = REENTRY_COOLDOWN_HOURS) {
  const cutoff = Date.now() - (hours * 60 * 60 * 1000);

  return readPaperTrades().some(trade => {
    const timestamp = new Date(trade.timestamp).getTime();
    return trade.address === address && Number.isFinite(timestamp) && timestamp > cutoff;
  });
}

function recentlyLost(address) {
  const trades = readPaperTrades();
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

  return trades.some(trade =>
    trade.address === address &&
    trade.status === "LOSS" &&
    new Date(trade.closedAt || trade.timestamp).getTime() > oneDayAgo
  );
}

function savePaperTrade(trade) {
  fs.appendFileSync(PAPER_FILE, JSON.stringify(trade) + "\n");
}

function getGmgnInfo(address) {
  try {
    const output = execFileSync(
      "gmgn-cli",
      ["token", "info", "--chain", "sol", "--address", address],
      { encoding: "utf8", timeout: 20000 }
    );

    return JSON.parse(output);
  } catch {
    console.log(`GMGN lookup failed for ${address}. Rejecting.`);
    return null;
  }
}

function gmgnRejectReason(info) {
  if (!info) return "GMGN lookup failed";

  const holderCount = Number(info.holder_count || info.stat?.holder_count || 0);
  const top10HolderRate = Number(info.stat?.top_10_holder_rate || info.dev?.top_10_holder_rate || 0);
  const botDegenRate = Number(info.stat?.bot_degen_rate || 0);
  const bundlerWallets = Number(info.wallet_tags_stat?.bundler_wallets || 0);
  const devTeamHoldRate = Number(info.stat?.dev_team_hold_rate || 0);
  const creatorHoldRate = Number(info.stat?.creator_hold_rate || 0);

  if (holderCount < MIN_HOLDER_COUNT) return `holders too low: ${holderCount}`;
  if (top10HolderRate > MAX_TOP10_HOLDER_RATE) return `top10 too high: ${(top10HolderRate * 100).toFixed(2)}%`;
  if (botDegenRate > MAX_BOT_DEGEN_RATE) return `bot rate too high: ${(botDegenRate * 100).toFixed(2)}%`;
  if (bundlerWallets > MAX_BUNDLER_WALLETS) return `bundlers too high: ${bundlerWallets}`;
  if (devTeamHoldRate > 0.05) return `dev hold too high: ${(devTeamHoldRate * 100).toFixed(2)}%`;
  if (creatorHoldRate > 0.03) return `creator hold too high: ${(creatorHoldRate * 100).toFixed(2)}%`;

  return null;
}

function scorePair(pair) {
  let score = 0;

  const liquidity = pair.liquidity?.usd || 0;
  const volume5m = pair.volume?.m5 || 0;
  const volume1h = pair.volume?.h1 || 0;
  const buys5m = pair.txns?.m5?.buys || 0;
  const sells5m = pair.txns?.m5?.sells || 0;
  const change5m = pair.priceChange?.m5 || 0;
  const change1h = pair.priceChange?.h1 || 0;
  const fdv = pair.fdv || 0;
  const marketCap = pair.marketCap || pair.fdv || 0;

  if (liquidity < MIN_LIQUIDITY) return 0;
  if (marketCap < MIN_MARKET_CAP) return 0;
  if (marketCap > MAX_MARKET_CAP) return 0;
  if (volume5m < MIN_VOLUME_5M) return 0;
  if (volume1h < MIN_VOLUME_1H) return 0;
  if (buys5m <= sells5m) return 0;
  if (change5m <= 0) return 0;
  if (change1h <= 0) return 0;
  if (change5m > 30) return 0;

  if (liquidity >= 300000) score += 25;
  else if (liquidity >= 150000) score += 20;
  else score += 15;

  if (volume5m >= 25000) score += 20;
  else if (volume5m >= 10000) score += 15;
  else if (volume5m >= 5000) score += 10;
  else score += 5;

  if (volume1h >= 300000) score += 15;
  else if (volume1h >= 150000) score += 10;
  else score += 5;

  const ratio = sells5m === 0 ? buys5m : buys5m / sells5m;

  if (ratio >= 2) score += 20;
  else if (ratio >= 1.5) score += 15;
  else if (ratio >= 1.2) score += 10;
  else score += 5;

  if (change5m >= 5 && change5m <= 20) score += 15;
  else if (change5m > 0 && change5m < 5) score += 8;

  if (change1h >= 10 && change1h <= 80) score += 10;
  else if (change1h > 0) score += 5;

  if (fdv > 0 && fdv < 100000000) score += 5;

  return Math.min(score, 100);
}

function logPaperTrade(result) {
  const entryPrice = Number(result.priceUsd || 0);

  if (!entryPrice || entryPrice <= 0) return;

  if (alreadyOpen(result.address)) {
    console.log("Already has open paper trade. Skipped duplicate.");
    return;
  }

  if (recentlyLost(result.address)) {
    console.log("Token lost recently. Skipped 24h cooldown.");
    return;
  }

  if (recentlyTraded(result.address)) {
    console.log("Recent trade cooldown. Skipped.");
    return;
  }

  const trade = {
    timestamp: new Date().toISOString(),
    strategyVersion: STRATEGY_VERSION,
    monitorVersion: MONITOR_VERSION,
    symbol: result.symbol,
    name: result.name,
    address: result.address,
    pairAddress: result.pairAddress,
    score: result.score,
    liquidity: result.liquidity,
    marketCap: result.marketCap,
    holderCount: result.holderCount,
    top10HolderRate: result.top10HolderRate,
    botDegenRate: result.botDegenRate,
    bundlerWallets: result.bundlerWallets,
    volume5m: result.volume5m,
    volume1h: result.volume1h,
    buys5m: result.buys5m,
    sells5m: result.sells5m,
    entryPrice,
    targetPrice: Number((entryPrice * 1.10).toFixed(12)),
    stopPrice: Number((entryPrice * 0.95).toFixed(12)),
    status: "OPEN",
    chart: result.url
  };

  savePaperTrade(trade);
  console.log("📒 PAPER TRADE LOGGED");
}

async function searchPairs(query) {
  try {
    const response = await axios.get(`${DEX}/latest/dex/search`, {
      params: { q: query }
    });

    return response.data.pairs || [];
  } catch {
    return [];
  }
}

async function scan() {
  console.log("\nScanning Solana candidates with DexScreener + GMGN filters...\n");
  console.log(`Market Cap Filter: $${MIN_MARKET_CAP.toLocaleString()} - $${MAX_MARKET_CAP.toLocaleString()}`);
  console.log(`Liquidity Filter: $${MIN_LIQUIDITY.toLocaleString()}+`);
  console.log(`GMGN Filters: holders ${MIN_HOLDER_COUNT}+, top10 <= ${MAX_TOP10_HOLDER_RATE * 100}%, bot <= ${MAX_BOT_DEGEN_RATE * 100}%, bundlers <= ${MAX_BUNDLER_WALLETS}\n`);

  const allPairs = [];

  for (const query of WATCHLIST) {
    const pairs = await searchPairs(query);
    allPairs.push(...pairs.filter(p => p.chainId === "solana"));
    await sleep(150);
  }

  const unique = new Map();

  for (const pair of allPairs) {
    if (!pair.pairAddress) continue;
    unique.set(pair.pairAddress, pair);
  }

  console.log("=== DEBUG DISCOVERY ===");
  console.log(`Raw Solana pairs found: ${allPairs.length}`);
  console.log(`Unique Solana pairs: ${unique.size}`);

  const allScored = [...unique.values()]
    .map(pair => ({
      pair,
      name: pair.baseToken?.name || "Unknown",
      symbol: pair.baseToken?.symbol || "???",
      address: pair.baseToken?.address,
      pairAddress: pair.pairAddress,
      priceUsd: Number(pair.priceUsd || 0),
      score: scorePair(pair),
      liquidity: pair.liquidity?.usd || 0,
      marketCap: pair.marketCap || pair.fdv || 0,
      volume5m: pair.volume?.m5 || 0,
      volume1h: pair.volume?.h1 || 0,
      volume24h: pair.volume?.h24 || 0,
      buys5m: pair.txns?.m5?.buys || 0,
      sells5m: pair.txns?.m5?.sells || 0,
      change5m: pair.priceChange?.m5 || 0,
      change1h: pair.priceChange?.h1 || 0,
      fdv: pair.fdv || 0,
      url: pair.url
    }))
    .sort((a, b) => b.score - a.score);

  const passedDex = allScored.filter(r => r.score > 0);

  console.log(`Scored candidates: ${allScored.length}`);
  console.log(`Passed Dex filters: ${passedDex.length}`);

  console.log("\nTop 10 before GMGN:");
  for (const r of allScored.slice(0, 10)) {
    console.log(
      `${r.symbol} | Score ${r.score} | Liq $${Math.round(r.liquidity).toLocaleString()} | MC $${Math.round(r.marketCap).toLocaleString()} | Vol5m $${Math.round(r.volume5m).toLocaleString()} | Vol1h $${Math.round(r.volume1h).toLocaleString()} | 5m ${r.change5m}% | 1h ${r.change1h}% | Buys/Sells ${r.buys5m}/${r.sells5m}`
    );
  }

  const initialResults = passedDex.slice(0, 10);
  const results = [];

  let gmgnChecked = 0;
  let gmgnRejected = 0;

  for (const r of initialResults) {
    console.log(`\nChecking GMGN: ${r.symbol}`);

    const gmgn = getGmgnInfo(r.address);
    gmgnChecked++;

    await sleep(250);

    const rejectReason = gmgnRejectReason(gmgn);

    if (rejectReason) {
      gmgnRejected++;
      console.log(`Rejected by GMGN: ${r.symbol} | ${rejectReason}`);
      continue;
    }

    r.holderCount = Number(gmgn.holder_count || gmgn.stat?.holder_count || 0);
    r.top10HolderRate = Number(gmgn.stat?.top_10_holder_rate || gmgn.dev?.top_10_holder_rate || 0);
    r.botDegenRate = Number(gmgn.stat?.bot_degen_rate || 0);
    r.bundlerWallets = Number(gmgn.wallet_tags_stat?.bundler_wallets || 0);

    results.push(r);
  }

  console.log("\n=== DEBUG GMGN ===");
  console.log(`GMGN checked: ${gmgnChecked}`);
  console.log(`GMGN rejected: ${gmgnRejected}`);
  console.log(`Passed GMGN: ${results.length}`);

  console.log("\n=== STRONGER SOLANA MOMENTUM SCANNER ===\n");

  if (results.length === 0) {
    console.log("No quality setups found right now.");
    console.log("That is acceptable. The bot should not force trades.\n");
    return;
  }

  for (const r of results.slice(0, 20)) {
    const status = r.score >= MIN_SCORE_TO_LOG ? "TRADE WATCH" : "WATCH ONLY";

    console.log(`${status} | ${r.symbol} | ${r.name}`);
    console.log(`Score: ${r.score}/100`);
    console.log(`Price: $${r.priceUsd}`);
    console.log(`Liquidity: $${Math.round(r.liquidity).toLocaleString()}`);
    console.log(`Market Cap: $${Math.round(r.marketCap).toLocaleString()}`);
    console.log(`Holders: ${r.holderCount}`);
    console.log(`Top 10 Holder Rate: ${(r.top10HolderRate * 100).toFixed(2)}%`);
    console.log(`Bot Degen Rate: ${(r.botDegenRate * 100).toFixed(2)}%`);
    console.log(`Bundler Wallets: ${r.bundlerWallets}`);
    console.log(`Vol 5m: $${Math.round(r.volume5m).toLocaleString()}`);
    console.log(`Vol 1h: $${Math.round(r.volume1h).toLocaleString()}`);
    console.log(`Vol 24h: $${Math.round(r.volume24h).toLocaleString()}`);
    console.log(`Buys/Sells 5m: ${r.buys5m}/${r.sells5m}`);
    console.log(`Change 5m: ${r.change5m}%`);
    console.log(`Change 1h: ${r.change1h}%`);
    console.log(`FDV: $${Math.round(r.fdv).toLocaleString()}`);
    console.log(`Chart: ${r.url}`);

    if (r.score >= MIN_SCORE_TO_LOG) logPaperTrade(r);

    console.log("--------------------------------\n");
  }
}

async function main() {
  if (!WATCH_MODE) {
    await scan();
    return;
  }

  while (true) {
    console.clear();
    await scan();
    console.log("Next scan in 60 seconds. Press Ctrl+C to stop.");
    await sleep(60000);
  }
}

main().catch(err => console.error("Fatal error:", err.message));
