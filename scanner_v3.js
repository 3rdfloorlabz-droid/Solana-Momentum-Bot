const axios = require("axios");
const fs = require("fs");
const { execSync } = require("child_process");

const DEX = "https://api.dexscreener.com";
const PAPER_FILE = "paper_trades.json";
const NEAR_MISS_FILE = "near_misses.json";
const WATCH_MODE = process.argv.includes("--watch");

const MIN_SCORE_TO_LOG = 75;
const REENTRY_COOLDOWN_HOURS = 24;
const NEAR_MISS_COOLDOWN_HOURS = 24;
const STRATEGY_VERSION = "scanner_v3_v4";
const MONITOR_VERSION = "monitor_v4";

const MIN_MARKET_CAP = 100000;
const MAX_MARKET_CAP = 2500000;
const MIN_LIQUIDITY = 25000;
const MIN_POOL_LIQUIDITY = 25000;

const MIN_VOLUME_5M = 100;
const MIN_VOLUME_1H = 2500;

const MIN_HOLDER_COUNT = 300;
const MAX_TOP10_HOLDER_RATE = 0.30;
const MAX_BOT_DEGEN_RATE = 0.25;
const MAX_BUNDLER_WALLETS = 700;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
function recentlyTraded(address, hours = REENTRY_COOLDOWN_HOURS) {
  try {
    const trades = fs.existsSync("paper_trades.json")
      ? fs.readFileSync("paper_trades.json", "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map(line => JSON.parse(line))
      : [];

    const cutoff = Date.now() - (hours * 60 * 60 * 1000);

    return trades.some(t =>
      t.address === address &&
      new Date(t.timestamp).getTime() > cutoff
    );
  } catch {
    return false;
  }
}

function readPaperTrades() {
  return readJsonLines(PAPER_FILE);
}

function alreadyOpen(address) {
  return readPaperTrades().some(t => t.address === address && t.status === "OPEN");
}

function recentlyLost(address) {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return readPaperTrades().some(t =>
    t.address === address &&
    t.status === "LOSS" &&
    new Date(t.closedAt || t.timestamp).getTime() > oneDayAgo
  );
}

function appendJsonLine(file, data) {
  fs.appendFileSync(file, JSON.stringify(data) + "\n");
}

function savePaperTrade(trade) {
  appendJsonLine(PAPER_FILE, trade);
}

function recentlyLoggedNearMiss(address, hours = NEAR_MISS_COOLDOWN_HOURS) {
  const cutoff = Date.now() - (hours * 60 * 60 * 1000);

  return readJsonLines(NEAR_MISS_FILE).some(m => {
    const timestamp = new Date(m.timestamp).getTime();
    return m.address === address && Number.isFinite(timestamp) && timestamp > cutoff;
  });
}

function logNearMiss(result, reason) {
  if (recentlyLoggedNearMiss(result.address)) {
    console.log("Recent near miss already logged. Skipped duplicate.");
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    strategyVersion: STRATEGY_VERSION,
    symbol: result.symbol,
    name: result.name,
    address: result.address,
    pairAddress: result.pairAddress,
    referencePrice: Number(result.priceUsd || 0),
    score: result.score,
    reason,
    liquidity: result.liquidity,
    marketCap: result.marketCap,
    volume5m: result.volume5m,
    volume1h: result.volume1h,
    buys5m: result.buys5m,
    sells5m: result.sells5m,
    change5m: result.change5m,
    change1h: result.change1h,
    chart: result.url
  };

  appendJsonLine(NEAR_MISS_FILE, entry);
  console.log("🟡 NEAR MISS LOGGED");
}

function safeJsonParse(output, label, address) {
  try {
    return JSON.parse(output);
  } catch (err) {
    console.log(`\n${label} JSON PARSE ERROR`);
    console.log("Address:", address);
    console.log("Parse message:", err.message);
    return null;
  }
}

function getGmgnInfo(address) {
  try {
    const cmd = `gmgn-cli token info --chain sol --address ${address}`;

    const output = execSync(cmd, {
      encoding: "utf8",
      timeout: 30000,
      shell: true
    });

    return safeJsonParse(output, "GMGN INFO", address);
  } catch (err) {
    console.log("\nGMGN INFO ERROR");
    console.log("Address:", address);
    if (err.stdout) console.log("STDOUT:", err.stdout.toString());
    if (err.stderr) console.log("STDERR:", err.stderr.toString());
    console.log("MESSAGE:", err.message);
    return null;
  }
}

function getGmgnPool(address) {
  try {
    const cmd = `gmgn-cli token pool --chain sol --address ${address}`;

    const output = execSync(cmd, {
      encoding: "utf8",
      timeout: 30000,
      shell: true
    });

    return safeJsonParse(output, "GMGN POOL", address);
  } catch (err) {
    console.log("\nGMGN POOL ERROR");
    console.log("Address:", address);
    if (err.stdout) console.log("STDERR:", err.stderr.toString());
    console.log("MESSAGE:", err.message);
    return null;
  }
}

async function getBoostedTokens() {
  const urls = [
    `${DEX}/token-boosts/latest/v1`,
    `${DEX}/token-boosts/top/v1`
  ];

  const tokens = [];

  for (const url of urls) {
    try {
      const res = await axios.get(url);
      tokens.push(...res.data.filter(t => t.chainId === "solana"));
    } catch {
      console.log(`Boost fetch failed: ${url}`);
    }
  }

  const unique = new Map();

  for (const t of tokens) {
    if (!t.tokenAddress) continue;
    unique.set(t.tokenAddress, t);
  }

  return [...unique.values()];
}

async function getBestPair(tokenAddress) {
  try {
    const res = await axios.get(`${DEX}/token-pairs/v1/solana/${tokenAddress}`);
    const pairs = res.data || [];

    if (!pairs.length) return null;

    pairs.sort((a, b) => {
      const la = a.liquidity?.usd || 0;
      const lb = b.liquidity?.usd || 0;
      return lb - la;
    });

    return pairs[0];
  } catch {
    return null;
  }
}

function gmgnRejectReason(info, pool) {
  if (!info) return "GMGN info failed";
  if (!pool) return "GMGN pool failed";

  const holderCount = Number(info.holder_count || info.stat?.holder_count || 0);
  const top10HolderRate = Number(info.stat?.top_10_holder_rate || info.dev?.top_10_holder_rate || 0);
  const botDegenRate = Number(info.stat?.bot_degen_rate || 0);
  const bundlerWallets = Number(info.wallet_tags_stat?.bundler_wallets || 0);
  const devTeamHoldRate = Number(info.stat?.dev_team_hold_rate || 0);
  const creatorHoldRate = Number(info.stat?.creator_hold_rate || 0);
  const poolLiquidity = Number(pool.liquidity || 0);

  if (poolLiquidity < MIN_POOL_LIQUIDITY) return `pool liquidity too low: $${Math.round(poolLiquidity)}`;
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
  const marketCap = pair.marketCap || pair.fdv || 0;
  const volume5m = pair.volume?.m5 || 0;
  const volume1h = pair.volume?.h1 || 0;
  const buys5m = pair.txns?.m5?.buys || 0;
  const sells5m = pair.txns?.m5?.sells || 0;
  const change5m = pair.priceChange?.m5 || 0;
  const change1h = pair.priceChange?.h1 || 0;
  const activeBoosts = pair.boosts?.active || 0;

  if (liquidity < MIN_LIQUIDITY) return 0;
  if (marketCap < MIN_MARKET_CAP) return 0;
  if (marketCap > MAX_MARKET_CAP) return 0;
  if (volume5m < MIN_VOLUME_5M) return 0;
  if (volume1h < MIN_VOLUME_1H) return 0;
  if (buys5m <= sells5m) return 0;
  if (change5m <= 0) return 0;
  if (change1h <= 0) return 0;
  if (change5m > 35) return 0;

  if (liquidity >= 300000) score += 25;
  else if (liquidity >= 150000) score += 20;
  else score += 15;

  if (volume5m >= 25000) score += 20;
  else if (volume5m >= 10000) score += 15;
  else if (volume5m >= 5000) score += 10;
  else score += 5;

  if (volume1h >= 300000) score += 15;
  else if (volume1h >= 100000) score += 10;
  else score += 5;

  const ratio = sells5m === 0 ? buys5m : buys5m / sells5m;

  if (ratio >= 2) score += 20;
  else if (ratio >= 1.5) score += 15;
  else if (ratio >= 1.2) score += 10;
  else score += 5;

  if (change5m >= 5 && change5m <= 25) score += 15;
  else if (change5m > 0) score += 8;

  if (change1h >= 10 && change1h <= 100) score += 10;
  else if (change1h > 0) score += 5;

  if (activeBoosts >= 100) score += 5;
  else if (activeBoosts >= 30) score += 3;

  return Math.min(score, 100);
}

function logPaperTrade(result) {
  const entryPrice = Number(result.priceUsd || 0);
  if (!entryPrice) return;

  if (alreadyOpen(result.address)) {
    console.log("Already open. Skipped duplicate.");
    return;
  }

  if (recentlyLost(result.address)) {
    console.log("Recent loss cooldown. Skipped.");
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
    poolLiquidity: result.poolLiquidity,
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

async function scan() {
  console.log("\nScanner V3: Dex Boosts + GMGN Info + GMGN Pool\n");

  const boosts = await getBoostedTokens();

  console.log(`Boosted Solana tokens found: ${boosts.length}`);

  const candidates = [];

  for (const token of boosts) {
    const pair = await getBestPair(token.tokenAddress);
    await sleep(150);

    if (!pair) continue;

    const score = scorePair(pair);

    candidates.push({
      score,
      address: token.tokenAddress,
      symbol: pair.baseToken?.symbol || "???",
      name: pair.baseToken?.name || "Unknown",
      pairAddress: pair.pairAddress,
      priceUsd: Number(pair.priceUsd || 0),
      liquidity: pair.liquidity?.usd || 0,
      marketCap: pair.marketCap || pair.fdv || 0,
      volume5m: pair.volume?.m5 || 0,
      volume1h: pair.volume?.h1 || 0,
      volume24h: pair.volume?.h24 || 0,
      buys5m: pair.txns?.m5?.buys || 0,
      sells5m: pair.txns?.m5?.sells || 0,
      change5m: pair.priceChange?.m5 || 0,
      change1h: pair.priceChange?.h1 || 0,
      boosts: pair.boosts?.active || token.totalAmount || 0,
      url: pair.url
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  const dexPassed = candidates.filter(c => c.score > 0).slice(0, 15);

  console.log(`Pairs evaluated: ${candidates.length}`);
  console.log(`Passed Dex momentum filters: ${dexPassed.length}`);

  console.log("\nTop candidates before GMGN:");
  for (const c of candidates.slice(0, 10)) {
    console.log(
      `${c.symbol} | Score ${c.score} | Address ${c.address} | MC $${Math.round(c.marketCap).toLocaleString()} | Liq $${Math.round(c.liquidity).toLocaleString()} | Vol5m $${Math.round(c.volume5m).toLocaleString()} | Vol1h $${Math.round(c.volume1h).toLocaleString()} | 5m ${c.change5m}% | 1h ${c.change1h}% | Buys/Sells ${c.buys5m}/${c.sells5m}`
    );
  }

  const results = [];

  for (const c of dexPassed) {
    console.log(`\nGMGN checking: ${c.symbol}`);
    console.log(`Address: ${c.address}`);

    const info = getGmgnInfo(c.address);
    await sleep(250);

    const pool = getGmgnPool(c.address);
    await sleep(250);

    const rejectReason = gmgnRejectReason(info, pool);

    if (rejectReason) {
  console.log(`Rejected: ${c.symbol} | ${rejectReason}`);

  // Existing bundler near miss
  if (rejectReason.includes("bundlers too high")) {
    logNearMiss(c, rejectReason);
  }

  // New high-score near miss
  if (c.score >= 70) {
    logNearMiss(c, `HIGH SCORE REJECT | ${rejectReason}`);
  }

  continue;
}

    c.holderCount = Number(info.holder_count || info.stat?.holder_count || 0);
    c.top10HolderRate = Number(info.stat?.top_10_holder_rate || info.dev?.top_10_holder_rate || 0);
    c.botDegenRate = Number(info.stat?.bot_degen_rate || 0);
    c.bundlerWallets = Number(info.wallet_tags_stat?.bundler_wallets || 0);
    c.poolLiquidity = Number(pool.liquidity || 0);

    results.push(c);
  }

  console.log("\n=== SCANNER V3 RESULTS ===\n");

  if (!results.length) {
    console.log("No quality boosted setups found right now.\n");
    return;
  }

  for (const r of results) {
    const status = r.score >= MIN_SCORE_TO_LOG ? "TRADE WATCH" : "WATCH ONLY";

    console.log(`${status} | ${r.symbol} | ${r.name}`);
    console.log(`Score: ${r.score}/100`);
    console.log(`Address: ${r.address}`);
    console.log(`Price: $${r.priceUsd}`);
    console.log(`Market Cap: $${Math.round(r.marketCap).toLocaleString()}`);
    console.log(`Liquidity: $${Math.round(r.liquidity).toLocaleString()}`);
    console.log(`Pool Liquidity: $${Math.round(r.poolLiquidity).toLocaleString()}`);
    console.log(`Holders: ${r.holderCount}`);
    console.log(`Top 10 Holder Rate: ${(r.top10HolderRate * 100).toFixed(2)}%`);
    console.log(`Bot Degen Rate: ${(r.botDegenRate * 100).toFixed(2)}%`);
    console.log(`Bundler Wallets: ${r.bundlerWallets}`);
    console.log(`Vol 5m: $${Math.round(r.volume5m).toLocaleString()}`);
    console.log(`Vol 1h: $${Math.round(r.volume1h).toLocaleString()}`);
    console.log(`Buys/Sells 5m: ${r.buys5m}/${r.sells5m}`);
    console.log(`Change 5m: ${r.change5m}%`);
    console.log(`Change 1h: ${r.change1h}%`);
    console.log(`Boosts: ${r.boosts}`);
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
