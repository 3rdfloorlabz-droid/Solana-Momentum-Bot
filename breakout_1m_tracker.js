// breakout_1m_tracker.js
//
// STRATEGY RESEARCH TOOL — NOT part of the live trading bot.
//
// Purpose: observe the "$1M breakout, sell initial at 2x, ride house money to
// 10-100x" strategy candidate flow with zero coupling to live_executor.js,
// live_config.json, or any wallet/signer/trading code. Read-only market data
// in, JSONL/JSON observation files out. No orders are ever placed by this file.
//
// Isolation contract:
//   - Does NOT import or modify scanner_gmgn_trending.js or live_executor.js.
//   - Writes only to analysis/breakout_1m_tracked.json and
//     analysis/breakout_1m_observations.jsonl (new files, not touched by
//     anything else in the repo).
//   - No wallet, no signer, no RPC submission, no paper_trades.json writes.
//   - Uses the same GMGN CLI + Dexscreener pattern as scanner_gmgn_trending.js
//     (duplicated on purpose — those helpers aren't exported, and this file
//     should never need to touch the production scanner).
//
// Run modes (on the user's own machine — gmgn-cli is a local CLI tool and is
// NOT reachable from a sandboxed environment):
//   node analysis/breakout_1m_tracker.js            single pass: discover + poll
//   node analysis/breakout_1m_tracker.js --watch     loop forever on POLL_INTERVAL_MS
//   node analysis/breakout_1m_tracker.js --list       print current tracked table
//   node analysis/breakout_1m_tracker.js --check <address>   one-off lookup, no state write
//
// Discovery band and thresholds are intentionally separate constants from the
// momentum bot's thesis band (100k-250k) in live_executor.js — this is a
// different strategy, different market-cap regime, different exit logic.

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const DEX = "https://api.dexscreener.com";

const ANALYSIS_DIR = path.join(__dirname, "analysis");
const TRACKED_FILE = path.join(ANALYSIS_DIR, "breakout_1m_tracked.json");
const OBSERVATIONS_FILE = path.join(ANALYSIS_DIR, "breakout_1m_observations.jsonl");

const WATCH_MODE = process.argv.includes("--watch");
const LIST_MODE = process.argv.includes("--list");
const CHECK_INDEX = process.argv.indexOf("--check");
const CHECK_ADDRESS = CHECK_INDEX !== -1 ? process.argv[CHECK_INDEX + 1] : null;

// ─── Config (env-overridable, all separate from live bot config) ────────────

const WATCH_MC_MIN = Number(process.env.BREAKOUT_WATCH_MC_MIN || 700000);
const WATCH_MC_MAX = Number(process.env.BREAKOUT_WATCH_MC_MAX || 1300000);
const MIN_POOL_LIQUIDITY = Number(process.env.BREAKOUT_MIN_LIQUIDITY || 25000);

const TWO_X_MULTIPLE = Number(process.env.BREAKOUT_TWO_X_MULTIPLE || 2.0);
const HOUSE_MONEY_WINDOW_DAYS = Number(process.env.BREAKOUT_WINDOW_DAYS || 14);
const CONTINUED_NX_THRESHOLD = Number(process.env.BREAKOUT_CONTINUED_NX || 3.0); // multiple *from 2x point* to count as "continued"
const STALL_BAND_PCT = Number(process.env.BREAKOUT_STALL_BAND_PCT || 0.15); // +/-15% of house-money start price = "stalled" if no new high by window expiry
const DEAD_LIQUIDITY_USD = Number(process.env.BREAKOUT_DEAD_LIQUIDITY || 500);

const POLL_INTERVAL_MS = Number(process.env.BREAKOUT_POLL_INTERVAL_MS || 5 * 60 * 1000); // 5 min
const TRENDING_INTERVALS = ["1m", "5m", "1h"];
const TRENDING_LIMIT = 100;
const REENTRY_COOLDOWN_HOURS = 24; // don't re-discover the same address once it has an outcome, for this long

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function ensureAnalysisDir() {
  if (!fs.existsSync(ANALYSIS_DIR)) fs.mkdirSync(ANALYSIS_DIR, { recursive: true });
}

function appendObservation(row) {
  ensureAnalysisDir();
  fs.appendFileSync(OBSERVATIONS_FILE, JSON.stringify(row) + "\n");
}

function loadTracked() {
  if (!fs.existsSync(TRACKED_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(TRACKED_FILE, "utf8"));
  } catch {
    console.log(`WARNING: ${TRACKED_FILE} failed to parse — starting from empty state. Old file left on disk for inspection.`);
    return {};
  }
}

function saveTracked(tracked) {
  ensureAnalysisDir();
  fs.writeFileSync(TRACKED_FILE, JSON.stringify(tracked, null, 2) + "\n");
}

// ─── Duplicated GMGN CLI + Dexscreener helpers ───────────────────────────────
// Deliberately copied from scanner_gmgn_trending.js rather than imported: that
// file doesn't export these, and this tool must never require touching the
// production scanner to do unrelated strategy research.

function safeJsonParse(output, label) {
  try {
    return JSON.parse(output);
  } catch (err) {
    console.log(`${label} JSON parse failed: ${err.message}`);
    return null;
  }
}

function gmgnCli(cmd) {
  return execSync(cmd, { encoding: "utf8", timeout: 30000, shell: true });
}

function getGmgnTrending() {
  const unique = new Map();
  for (const interval of TRENDING_INTERVALS) {
    try {
      const output = gmgnCli(
        `gmgn-cli market trending --chain sol --interval ${interval} --limit ${TRENDING_LIMIT} --raw`
      );
      const json = safeJsonParse(output, `GMGN TRENDING ${interval}`);
      const rank = json?.data?.rank || [];
      for (const item of rank) {
        if (!item.address) continue;
        if (!unique.has(item.address)) unique.set(item.address, item);
      }
    } catch (err) {
      console.log(`GMGN trending fetch failed for interval ${interval}: ${err.message}`);
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
  } catch (err) {
    console.log(`Dex pair fetch failed for ${tokenAddress}: ${err.message}`);
    return null;
  }
}

function getGmgnInfo(address) {
  try {
    const output = gmgnCli(`gmgn-cli token info --chain sol --address ${address}`);
    return safeJsonParse(output, "GMGN INFO");
  } catch (err) {
    console.log(`GMGN info failed for ${address}: ${err.message}`);
    return null;
  }
}

function getGmgnPool(address) {
  try {
    const output = gmgnCli(`gmgn-cli token pool --chain sol --address ${address}`);
    return safeJsonParse(output, "GMGN POOL");
  } catch (err) {
    console.log(`GMGN pool failed for ${address}: ${err.message}`);
    return null;
  }
}

// Standard filter fields — same extraction shape as rejectReason() in
// scanner_gmgn_trending.js (kept in sync manually; not imported — see header).
function extractStandardFilterFields(info, pool, trend, pair) {
  const infoObj = info || {};
  const poolObj = pool || {};
  const trendObj = trend || {};
  return {
    holderCount: Number(infoObj.holder_count || trendObj.holder_count || 0),
    top10HolderRate: Number(infoObj.stat?.top_10_holder_rate || trendObj.top_10_holder_rate || 0),
    botDegenRate: Number(infoObj.stat?.bot_degen_rate || trendObj.bot_degen_rate || 0),
    bundlerRate: Number(trendObj.bundler_rate || infoObj.stat?.top_bundler_trader_percentage || 0),
    rugRatio: Number(trendObj.rug_ratio || 0),
    poolLiquidity: Number(poolObj.liquidity || pair?.liquidity?.usd || trendObj.liquidity || 0),
    creatorHoldRate: Number(infoObj.stat?.creator_hold_rate || trendObj.creator_balance_rate || 0),
    devHoldRate: Number(infoObj.stat?.dev_team_hold_rate || trendObj.dev_team_hold_rate || 0)
  };
}

// ─── Core cycle logic ────────────────────────────────────────────────────────

function windowExpiryFromNow() {
  return new Date(Date.now() + HOUSE_MONEY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function recentlyResolved(tracked, address) {
  const row = tracked[address];
  if (!row || !row.resolvedAt) return false;
  const cutoff = Date.now() - REENTRY_COOLDOWN_HOURS * 60 * 60 * 1000;
  return new Date(row.resolvedAt).getTime() > cutoff;
}

async function discoverNewCandidates(tracked) {
  console.log(`\nDiscovering candidates in $${WATCH_MC_MIN.toLocaleString()}-$${WATCH_MC_MAX.toLocaleString()} mc band...`);
  const trending = getGmgnTrending();
  console.log(`GMGN trending tokens fetched: ${trending.length}`);

  let discoveredCount = 0;

  for (const trend of trending) {
    const address = trend.address;
    if (!address) continue;
    if (tracked[address] && !recentlyResolved(tracked, address)) continue; // already actively tracked
    if (recentlyResolved(tracked, address)) continue; // resolved recently, on cooldown

    const pair = await getBestPair(address);
    await sleep(120);
    if (!pair) continue;

    const marketCap = pair.marketCap || pair.fdv || trend.market_cap || 0;
    if (marketCap < WATCH_MC_MIN || marketCap > WATCH_MC_MAX) continue;

    const liquidity = pair.liquidity?.usd || trend.liquidity || 0;
    if (liquidity < MIN_POOL_LIQUIDITY) continue;

    const entryPrice = Number(pair.priceUsd || trend.price || 0);
    if (!entryPrice) continue;

    const info = getGmgnInfo(address);
    await sleep(200);
    const pool = getGmgnPool(address);
    await sleep(200);

    const filterFields = extractStandardFilterFields(info, pool, trend, pair);

    const row = {
      address,
      symbol: pair.baseToken?.symbol || trend.symbol || "???",
      name: pair.baseToken?.name || trend.name || "Unknown",
      pairAddress: pair.pairAddress,
      status: "WATCHING",
      discoveredAt: nowIso(),
      entryPrice,
      entryMarketCap: marketCap,
      entryLiquidity: liquidity,
      ...filterFields,
      volume5m: pair.volume?.m5 || 0,
      volume1h: pair.volume?.h1 || trend.volume || 0,
      lastPrice: entryPrice,
      lastMarketCap: marketCap,
      lastLiquidity: liquidity,
      lastCheckedAt: nowIso(),
      maxMultipleFromEntry: 1,
      maxMultipleAt: nowIso(),
      twoXAt: null,
      twoXPrice: null,
      sellFractionToRecoupCost: null,
      houseMoneyWindowExpiresAt: null,
      resolvedAt: null,
      outcome: null
    };

    tracked[address] = row;
    discoveredCount += 1;

    appendObservation({
      timestamp: nowIso(),
      event: "DISCOVERED",
      address,
      symbol: row.symbol,
      price: entryPrice,
      marketCap,
      liquidity,
      volume5m: row.volume5m,
      volume1h: row.volume1h,
      multipleFromEntry: 1,
      ...filterFields
    });

    console.log(`DISCOVERED ${row.symbol} (${address}) | mc $${Math.round(marketCap).toLocaleString()} | liq $${Math.round(liquidity).toLocaleString()} | holders ${filterFields.holderCount} | top10 ${(filterFields.top10HolderRate * 100).toFixed(1)}%`);
  }

  console.log(`New candidates discovered this cycle: ${discoveredCount}`);
  return tracked;
}

async function pollTrackedCandidates(tracked) {
  const active = Object.values(tracked).filter(r => r.status === "WATCHING" || r.status === "HOUSE_MONEY");
  console.log(`\nPolling ${active.length} actively tracked candidate(s)...`);

  for (const row of active) {
    const pair = await getBestPair(row.address);
    await sleep(150);

    if (!pair) {
      // No pair returned at all — pool delisted/dead. Treat as WENT_TO_ZERO.
      row.status = "WENT_TO_ZERO";
      row.resolvedAt = nowIso();
      row.outcome = "WENT_TO_ZERO";
      row.lastCheckedAt = nowIso();
      appendObservation({
        timestamp: nowIso(),
        event: "OUTCOME_WENT_TO_ZERO",
        address: row.address,
        symbol: row.symbol,
        price: null,
        marketCap: null,
        liquidity: null,
        note: "no tradeable pair returned by Dexscreener"
      });
      console.log(`${row.symbol} (${row.address}) -> WENT_TO_ZERO (no pair returned)`);
      continue;
    }

    const price = Number(pair.priceUsd || 0);
    const marketCap = pair.marketCap || pair.fdv || 0;
    const liquidity = pair.liquidity?.usd || 0;
    const multipleFromEntry = row.entryPrice > 0 ? price / row.entryPrice : 0;

    row.lastPrice = price;
    row.lastMarketCap = marketCap;
    row.lastLiquidity = liquidity;
    row.lastCheckedAt = nowIso();

    if (multipleFromEntry > row.maxMultipleFromEntry) {
      row.maxMultipleFromEntry = multipleFromEntry;
      row.maxMultipleAt = nowIso();
    }

    if (liquidity < DEAD_LIQUIDITY_USD && row.status !== "HOUSE_MONEY") {
      row.status = "WENT_TO_ZERO";
      row.resolvedAt = nowIso();
      row.outcome = "WENT_TO_ZERO";
      appendObservation({
        timestamp: nowIso(), event: "OUTCOME_WENT_TO_ZERO", address: row.address, symbol: row.symbol,
        price, marketCap, liquidity, multipleFromEntry, note: `liquidity collapsed below $${DEAD_LIQUIDITY_USD}`
      });
      console.log(`${row.symbol} -> WENT_TO_ZERO (liquidity collapsed to $${Math.round(liquidity)})`);
      continue;
    }

    appendObservation({
      timestamp: nowIso(), event: "POLL", address: row.address, symbol: row.symbol,
      price, marketCap, liquidity, volume5m: pair.volume?.m5 || 0, volume1h: pair.volume?.h1 || 0,
      multipleFromEntry, status: row.status
    });

    if (row.status === "WATCHING" && multipleFromEntry >= TWO_X_MULTIPLE) {
      row.status = "HOUSE_MONEY";
      row.twoXAt = nowIso();
      row.twoXPrice = price;
      // Sell fraction of TOKEN QUANTITY needed to recoup 100% of original SOL
      // cost basis at the 2x (or better) price actually observed: 1/multiple.
      row.sellFractionToRecoupCost = Number((1 / multipleFromEntry).toFixed(4));
      row.houseMoneyWindowExpiresAt = windowExpiryFromNow();

      appendObservation({
        timestamp: nowIso(), event: "TWO_X_TRIGGER", address: row.address, symbol: row.symbol,
        price, marketCap, liquidity, multipleFromEntry, sellFractionToRecoupCost: row.sellFractionToRecoupCost
      });
      console.log(`${row.symbol} -> TWO_X_TRIGGER at ${multipleFromEntry.toFixed(2)}x | sell ${(row.sellFractionToRecoupCost * 100).toFixed(1)}% of tokens to recoup cost basis, ride the rest`);
      continue;
    }

    if (row.status === "HOUSE_MONEY") {
      const houseMoneyMultiple = row.twoXPrice > 0 ? price / row.twoXPrice : 0;
      const windowExpired = row.houseMoneyWindowExpiresAt && Date.now() > new Date(row.houseMoneyWindowExpiresAt).getTime();

      if (windowExpired) {
        let outcome;
        if (houseMoneyMultiple >= CONTINUED_NX_THRESHOLD) {
          outcome = "CONTINUED_NX";
        } else if (houseMoneyMultiple >= (1 - STALL_BAND_PCT) && houseMoneyMultiple <= (1 + STALL_BAND_PCT)) {
          outcome = "STALLED";
        } else if (houseMoneyMultiple < (1 - STALL_BAND_PCT)) {
          outcome = "STALLED"; // gave back gains but didn't fully die — still "didn't work", not a total loss
        } else {
          outcome = "WINDOW_EXPIRED";
        }
        row.status = outcome;
        row.resolvedAt = nowIso();
        row.outcome = outcome;
        appendObservation({
          timestamp: nowIso(), event: `OUTCOME_${outcome}`, address: row.address, symbol: row.symbol,
          price, marketCap, liquidity, multipleFromEntry, houseMoneyMultiple, maxMultipleFromEntry: row.maxMultipleFromEntry
        });
        console.log(`${row.symbol} -> ${outcome} (house-money multiple ${houseMoneyMultiple.toFixed(2)}x, max-ever ${row.maxMultipleFromEntry.toFixed(2)}x from entry)`);
      } else {
        console.log(`${row.symbol} | HOUSE_MONEY | now ${multipleFromEntry.toFixed(2)}x from entry (${houseMoneyMultiple.toFixed(2)}x from 2x point) | window expires ${row.houseMoneyWindowExpiresAt}`);
      }
    } else {
      console.log(`${row.symbol} | WATCHING | ${multipleFromEntry.toFixed(2)}x from entry`);
    }
  }

  return tracked;
}

async function runCycle() {
  let tracked = loadTracked();
  tracked = await discoverNewCandidates(tracked);
  tracked = await pollTrackedCandidates(tracked);
  saveTracked(tracked);

  const counts = {};
  for (const row of Object.values(tracked)) counts[row.status] = (counts[row.status] || 0) + 1;
  console.log(`\nStatus summary: ${JSON.stringify(counts)}`);
}

function printList() {
  const tracked = loadTracked();
  const rows = Object.values(tracked);
  if (!rows.length) {
    console.log("No tracked candidates yet.");
    return;
  }
  console.log(`\n${rows.length} tracked candidate(s):\n`);
  for (const r of rows) {
    console.log(
      `${r.symbol.padEnd(12)} ${r.status.padEnd(14)} entry $${r.entryPrice} -> last $${r.lastPrice} | max ${r.maxMultipleFromEntry.toFixed(2)}x | mc $${Math.round(r.lastMarketCap || 0).toLocaleString()} | ${r.address}`
    );
  }
}

async function runCheck(address) {
  console.log(`Manual check: ${address}`);
  const pair = await getBestPair(address);
  if (!pair) {
    console.log("No tradeable pair found (delisted, never had a pool, or Dexscreener has no data).");
    return;
  }
  console.log(JSON.stringify({
    symbol: pair.baseToken?.symbol,
    name: pair.baseToken?.name,
    priceUsd: pair.priceUsd,
    marketCap: pair.marketCap || pair.fdv,
    liquidityUsd: pair.liquidity?.usd,
    volume24h: pair.volume?.h24,
    pairCreatedAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : null,
    url: pair.url
  }, null, 2));
}

async function main() {
  if (LIST_MODE) {
    printList();
    return;
  }
  if (CHECK_ADDRESS) {
    await runCheck(CHECK_ADDRESS);
    return;
  }

  if (!WATCH_MODE) {
    await runCycle();
    return;
  }

  console.log(`Watch mode: polling every ${POLL_INTERVAL_MS / 1000}s. Ctrl+C to stop.`);
  while (true) {
    try {
      await runCycle();
    } catch (err) {
      console.error("Cycle failed:", err.message);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error("Fatal error:", err.message);
    process.exit(1);
  });
}

module.exports = {
  extractStandardFilterFields,
  windowExpiryFromNow,
  TWO_X_MULTIPLE,
  WATCH_MC_MIN,
  WATCH_MC_MAX
};
