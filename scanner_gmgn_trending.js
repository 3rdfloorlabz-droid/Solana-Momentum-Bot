const axios = require("axios");
const fs = require("fs");
const { execSync } = require("child_process");

const DEX = "https://api.dexscreener.com";
const PAPER_FILE = "paper_trades.json";
const NEAR_MISS_FILE = "near_misses.json";
const PIPELINE_CANDIDATES_FILE = "pipeline_candidates.jsonl";
const WATCH_MODE = process.argv.includes("--watch");

const MIN_SCORE_TO_LOG = 79;
const REENTRY_COOLDOWN_HOURS = 24;
const NEAR_MISS_COOLDOWN_HOURS = 24;
const STRATEGY_VERSION = "gmgn_v4";
const MONITOR_VERSION = "monitor_v4";

const MIN_MARKET_CAP = 100000;
const MAX_MARKET_CAP = 2500000;
const MIN_LIQUIDITY = 25000;
const MIN_POOL_LIQUIDITY = 25000;

const FILTER_VERSION = "ATH_PENALTY_V1";

const MIN_VOLUME_5M = 100;
const MIN_VOLUME_1H = 2500;

const MIN_HOLDER_COUNT = 300;
const MAX_TOP10_HOLDER_RATE = 0.30;
const MAX_BOT_DEGEN_RATE = 0.10;
const MAX_BUNDLER_RATE = 0.70;
const MAX_RUG_RATIO = 0.20;

const TRENDING_INTERVALS = ["1m", "5m", "1h"];
const TRENDING_LIMIT = 100;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function appendJsonLine(file, data) {
  fs.appendFileSync(file, JSON.stringify(data) + "\n");
}

function candidateIntentId(timestamp, address, pairAddress) {
  return [timestamp, address || "unknown-address", pairAddress || "unknown-pair"].join("_");
}

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

function readPaperTrades() {
  return readJsonLines(PAPER_FILE);
}

function recentlyTraded(address, hours = REENTRY_COOLDOWN_HOURS) {
  const cutoff = Date.now() - (hours * 60 * 60 * 1000);

  return readPaperTrades().some(t => {
    const timestamp = new Date(t.timestamp).getTime();
    return t.address === address && Number.isFinite(timestamp) && timestamp > cutoff;
  });
}

function recentlyLoggedNearMiss(address, hours = NEAR_MISS_COOLDOWN_HOURS) {
  const cutoff = Date.now() - (hours * 60 * 60 * 1000);

  return readJsonLines(NEAR_MISS_FILE).some(m => {
    const timestamp = new Date(m.timestamp).getTime();
    return m.address === address && Number.isFinite(timestamp) && timestamp > cutoff;
  });
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

function safeJsonParse(output, label) {
  try {
    return JSON.parse(output);
  } catch (err) {
    console.log(`${label} JSON parse failed: ${err.message}`);
    return null;
  }
}

function gmgnCli(cmd) {
  return execSync(cmd, {
    encoding: "utf8",
    timeout: 30000,
    shell: true
  });
}

function getGmgnTrending() {
  const unique = new Map();

  for (const interval of TRENDING_INTERVALS) {
    try {
      console.log(`Fetching GMGN trending interval: ${interval}`);

      const output = gmgnCli(
        `gmgn-cli market trending --chain sol --interval ${interval} --limit ${TRENDING_LIMIT} --raw`
      );

      const json = safeJsonParse(output, `GMGN TRENDING ${interval}`);
      const rank = json?.data?.rank || [];

      for (const item of rank) {
        if (!item.address) continue;

        const existing = unique.get(item.address);

        if (!existing) {
          unique.set(item.address, {
            ...item,
            intervals: [interval]
          });
        } else {
          existing.intervals.push(interval);

          const existingScore =
            Number(existing.volume || 0) +
            Math.abs(Number(existing.price_change_percent1h || 0));

          const newScore =
            Number(item.volume || 0) +
            Math.abs(Number(item.price_change_percent1h || 0));

          if (newScore > existingScore) {
            unique.set(item.address, {
              ...item,
              intervals: existing.intervals
            });
          }
        }
      }
    } catch (err) {
      console.log(`GMGN trending fetch failed for interval ${interval}.`);
      if (err.stderr) console.log(err.stderr.toString());
      console.log(err.message);
    }
  }

  return [...unique.values()];
}

async function getBestPair(tokenAddress) {
  try {
    const res = await axios.get(`${DEX}/token-pairs/v1/solana/${tokenAddress}`);
    const pairs = res.data || [];

    if (!pairs.length) return null;

    pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));

    return pairs[0];
  } catch {
    return null;
  }
}

function getGmgnInfo(address) {
  try {
    const output = gmgnCli(`gmgn-cli token info --chain sol --address ${address}`);
    return safeJsonParse(output, "GMGN INFO");
  } catch {
    return null;
  }
}

function getGmgnPool(address) {
  try {
    const output = gmgnCli(`gmgn-cli token pool --chain sol --address ${address}`);
    return safeJsonParse(output, "GMGN POOL");
  } catch {
    return null;
  }
}

function scoreCandidate(pair, trend) {
  let score = 0;

  const liquidity = pair.liquidity?.usd || trend.liquidity || 0;
  const marketCap = pair.marketCap || pair.fdv || trend.market_cap || 0;
  const volume5m = pair.volume?.m5 || 0;
  const volume1h = pair.volume?.h1 || trend.volume || 0;
  const buys5m = pair.txns?.m5?.buys || 0;
  const sells5m = pair.txns?.m5?.sells || 0;
  const change5m = pair.priceChange?.m5 || trend.price_change_percent5m || 0;
  const change1h = pair.priceChange?.h1 || trend.price_change_percent1h || 0;
  const ath = trend.history_highest_market_cap || 0;
  if (ath > 0 && marketCap > 0) {
   const athDrop = 1 - (marketCap / ath);

   if (athDrop > 0.80) score -= 20;
   else if (athDrop > 0.60) score -= 10;
  }

  if (marketCap < MIN_MARKET_CAP) return 0;
  if (marketCap > MAX_MARKET_CAP) return 0;
  if (liquidity < MIN_LIQUIDITY) return 0;
  if (volume5m < MIN_VOLUME_5M) return 0;
  if (volume1h < MIN_VOLUME_1H) return 0;
  if (buys5m <= sells5m) return 0;
  if (change5m <= 0) return 0;
  if (change1h <= 0) return 0;
  if (change5m > 60) return 0;

  if (liquidity >= 150000) score += 20;
  else if (liquidity >= 75000) score += 15;
  else score += 10;

  if (volume5m >= 25000) score += 20;
  else if (volume5m >= 10000) score += 15;
  else if (volume5m >= 1000) score += 10;
  else score += 5;

  if (volume1h >= 300000) score += 15;
  else if (volume1h >= 100000) score += 10;
  else score += 5;

  const ratio = sells5m === 0 ? buys5m : buys5m / sells5m;
  if (ratio >= 2) score += 20;
  else if (ratio >= 1.5) score += 15;
  else if (ratio >= 1.1) score += 10;
  else score += 5;

  if (change5m >= 5 && change5m <= 30) score += 15;
  else if (change5m > 0) score += 8;

  if (change1h >= 10 && change1h <= 150) score += 10;
  else if (change1h > 0) score += 5;

  if ((trend.smart_degen_count || 0) >= 3) score += 5;
  if ((trend.renowned_count || 0) >= 2) score += 5;

  return Math.min(score, 100);
}

function rejectReason(info, pool, trend) {
  if (!info) return "GMGN info failed";
  if (!pool) return "GMGN pool failed";

  const holderCount = Number(info.holder_count || trend.holder_count || 0);
  const top10 = Number(info.stat?.top_10_holder_rate || trend.top_10_holder_rate || 0);
  const botRate = Number(info.stat?.bot_degen_rate || trend.bot_degen_rate || 0);
  const bundlerRate = Number(trend.bundler_rate || info.stat?.top_bundler_trader_percentage || 0);
  const rugRatio = Number(trend.rug_ratio || 0);
  const poolLiquidity = Number(pool.liquidity || trend.liquidity || 0);
  const creatorHold = Number(info.stat?.creator_hold_rate || trend.creator_balance_rate || 0);
  const devHold = Number(info.stat?.dev_team_hold_rate || trend.dev_team_hold_rate || 0);

  if (poolLiquidity < MIN_POOL_LIQUIDITY) return `pool liquidity too low: $${Math.round(poolLiquidity)}`;
  if (holderCount < MIN_HOLDER_COUNT) return `holders too low: ${holderCount}`;
  if (top10 > MAX_TOP10_HOLDER_RATE) return `top10 too high: ${(top10 * 100).toFixed(2)}%`;
  if (botRate > MAX_BOT_DEGEN_RATE) return `bot rate too high: ${(botRate * 100).toFixed(2)}%`;
  if (bundlerRate > MAX_BUNDLER_RATE) return `bundler rate too high: ${(bundlerRate * 100).toFixed(2)}%`;
  if (rugRatio > MAX_RUG_RATIO) return `rug ratio too high: ${rugRatio}`;
  if (creatorHold > 0.05) return `creator hold too high: ${(creatorHold * 100).toFixed(2)}%`;
  if (devHold > 0.05) return `dev hold too high: ${(devHold * 100).toFixed(2)}%`;

  return null;
}

function logNearMiss(c, reason) {
  if (recentlyLoggedNearMiss(c.address)) {
    console.log("Recent near miss already logged. Skipped duplicate.");
    return;
  }

  appendJsonLine(NEAR_MISS_FILE, {
    timestamp: new Date().toISOString(),
    version: FILTER_VERSION,
    strategyVersion: STRATEGY_VERSION,
    source: "gmgn_trending",
    reason,
    symbol: c.symbol,
    name: c.name,
    address: c.address,
    pairAddress: c.pairAddress,
    referencePrice: Number(c.priceUsd || 0),
    score: c.score,
    marketCap: c.marketCap,
    liquidity: c.liquidity,
    volume5m: c.volume5m,
    volume1h: c.volume1h,
    change5m: c.change5m,
    change1h: c.change1h,
    holders: c.holderCount,
    top10: c.top10HolderRate,
    botRate: c.botDegenRate,
    bundlers: c.bundlerRate,
    chart: c.url
  });

  console.log("🟡 NEAR MISS LOGGED");
}

function buildPaperTradeRecord(c, timestamp = new Date().toISOString()) {
  const entryPrice = Number(c.priceUsd || 0);
  return {
    timestamp,
    source: "gmgn_trending",
    strategyVersion: STRATEGY_VERSION,
    monitorVersion: MONITOR_VERSION,
    symbol: c.symbol,
    name: c.name,
    address: c.address,
    pairAddress: c.pairAddress,
    score: c.score,
    liquidity: c.liquidity,
    marketCap: c.marketCap,
    poolLiquidity: c.poolLiquidity,
    holderCount: c.holderCount,
    top10HolderRate: c.top10HolderRate,
    botDegenRate: c.botDegenRate,
    bundlerRate: c.bundlerRate,
    volume5m: c.volume5m,
    volume1h: c.volume1h,
    buys5m: c.buys5m,
    sells5m: c.sells5m,
    entryPrice,
    targetPrice: Number((entryPrice * 1.10).toFixed(12)),
    stopPrice: Number((entryPrice * 0.95).toFixed(12)),
    status: "OPEN",
    chart: c.url
  };
}

function buildPipelineCandidateIntent(c, timestamp = new Date().toISOString()) {
  const record = buildPaperTradeRecord(c, timestamp);
  const { status, ...intent } = record;
  return {
    ...intent,
    candidateIntentId: candidateIntentId(timestamp, c.address, c.pairAddress)
  };
}

function logPaperTrade(c) {
  const entryPrice = Number(c.priceUsd || 0);
  if (!entryPrice) return;

  if (alreadyOpen(c.address)) {
    console.log("Already open. Skipped duplicate.");
    return;
  }

  if (recentlyLost(c.address)) {
    console.log("Recent loss cooldown. Skipped.");
    return;
  }

  if (recentlyTraded(c.address, REENTRY_COOLDOWN_HOURS)) {
  console.log("Recent trade cooldown. Skipped.");
  return;
  }

  const timestamp = new Date().toISOString();
  appendJsonLine(PAPER_FILE, buildPaperTradeRecord(c, timestamp));
  appendJsonLine(PIPELINE_CANDIDATES_FILE, buildPipelineCandidateIntent(c, timestamp));

  console.log("📒 PAPER TRADE LOGGED");
}

async function scan() {
  console.log("\nScanner GMGN Trending: GMGN Trending + Dex Metrics + GMGN Filters\n");

  const trending = getGmgnTrending();
  console.log(`GMGN trending tokens found: ${trending.length}`);

  const candidates = [];

  for (const trend of trending) {
    const pair = await getBestPair(trend.address);
    await sleep(120);

    if (!pair) continue;

    const score = scoreCandidate(pair, trend);

    candidates.push({
      trend,
      score,
      address: trend.address,
      symbol: pair.baseToken?.symbol || trend.symbol || "???",
      name: pair.baseToken?.name || trend.name || "Unknown",
      pairAddress: pair.pairAddress,
      priceUsd: Number(pair.priceUsd || trend.price || 0),
      liquidity: pair.liquidity?.usd || trend.liquidity || 0,
      marketCap: pair.marketCap || pair.fdv || trend.market_cap || 0,
      volume5m: pair.volume?.m5 || 0,
      volume1h: pair.volume?.h1 || trend.volume || 0,
      buys5m: pair.txns?.m5?.buys || 0,
      sells5m: pair.txns?.m5?.sells || 0,
      change5m: pair.priceChange?.m5 || trend.price_change_percent5m || 0,
      change1h: pair.priceChange?.h1 || trend.price_change_percent1h || 0,
      url: pair.url
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const passedDex = candidates.filter(c => c.score > 0).slice(0, 20);

  console.log(`Pairs evaluated: ${candidates.length}`);
  console.log(`Passed momentum filters: ${passedDex.length}`);

  console.log("\nTop candidates before GMGN:");
  for (const c of candidates.slice(0, 10)) {
    console.log(
      `${c.symbol} | Score ${c.score} | MC $${Math.round(c.marketCap).toLocaleString()} | Liq $${Math.round(c.liquidity).toLocaleString()} | Vol5m $${Math.round(c.volume5m).toLocaleString()} | Vol1h $${Math.round(c.volume1h).toLocaleString()} | 5m ${c.change5m}% | 1h ${c.change1h}% | Buys/Sells ${c.buys5m}/${c.sells5m}`
    );
  }

  const results = [];

  for (const c of passedDex) {
    console.log(`\nGMGN checking: ${c.symbol}`);
    console.log(`Address: ${c.address}`);

    const info = getGmgnInfo(c.address);
    await sleep(200);

    const pool = getGmgnPool(c.address);
    await sleep(200);

    c.holderCount = Number(info?.holder_count || c.trend.holder_count || 0);
    c.top10HolderRate = Number(info?.stat?.top_10_holder_rate || c.trend.top_10_holder_rate || 0);
    c.botDegenRate = Number(info?.stat?.bot_degen_rate || c.trend.bot_degen_rate || 0);
    c.bundlerRate = Number(c.trend.bundler_rate || info?.stat?.top_bundler_trader_percentage || 0);
    c.poolLiquidity = Number(pool?.liquidity || c.trend.liquidity || 0);

    const reason = rejectReason(info, pool, c.trend);

    if (reason) {
      console.log(`Rejected: ${c.symbol} | ${reason}`);
      if (c.score >= 70) logNearMiss(c, `HIGH SCORE REJECT | ${reason}`);
      continue;
    }

    results.push(c);
  }

  console.log("\n=== GMGN TRENDING RESULTS ===\n");

  if (!results.length) {
    console.log("No quality GMGN trending setups found right now.\n");
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
    console.log(`Bundler Rate: ${(r.bundlerRate * 100).toFixed(2)}%`);
    console.log(`Vol 5m: $${Math.round(r.volume5m).toLocaleString()}`);
    console.log(`Vol 1h: $${Math.round(r.volume1h).toLocaleString()}`);
    console.log(`Buys/Sells 5m: ${r.buys5m}/${r.sells5m}`);
    console.log(`Change 5m: ${r.change5m}%`);
    console.log(`Change 1h: ${r.change1h}%`);
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

if (require.main === module) {
  main().catch(err => console.error("Fatal error:", err.message));
}

module.exports = {
  PAPER_FILE,
  NEAR_MISS_FILE,
  PIPELINE_CANDIDATES_FILE,
  STRATEGY_VERSION,
  MONITOR_VERSION,
  appendJsonLine,
  readJsonLines,
  buildPaperTradeRecord,
  buildPipelineCandidateIntent,
  logPaperTrade
};
