const axios = require("axios");
const fs = require("fs");

const PAPER_FILE = "paper_trades.json";
const DEX = "https://api.dexscreener.com";
const MONITOR_VERSION = "monitor_v4";

// Sprint 4 A1a — paper trade ownership split.
// The monitor no longer rewrites paper_trades.json (scanner-owned, append-only).
// It owns the mutable lifecycle store paper_positions.json via this shared module.
const paperStore = require("./paper_positions_store");

// Live execution layer — OPTIONAL. The monitor's paper-trade logic must keep
// working even if this fails to load. Every live call below is guarded so a
// live-side error can never interrupt paper monitoring.
let liveExecutor = null;
try {
  liveExecutor = require("./live_executor");
  console.log("[monitor] live_executor loaded — live exits will mirror paper exits when a live position is open.");
} catch (err) {
  console.log(`[monitor] live_executor not loaded (${err.message}). Paper monitoring continues normally.`);
}

// Mirror a closed paper trade into a live exit, IF a live position is open for
// this token. Fully isolated: any error is caught and logged, never thrown.
// The paper trade object already carries triggerType/triggerPrice/pnlPercent
// from closeTrade(), which is everything executeLiveExit needs.
async function mirrorLiveExit(trade) {
  if (!liveExecutor) return;
  try {
    const live = liveExecutor.findOpenLiveTradeByAddress(trade.address);
    if (!live) return; // no open live position for this token — nothing to do
    // Vulcan Stage 3 — explicit invocation context so the resulting execution
    // audit rows record WHY this executor path ran: a monitor-driven live-exit
    // mirror, NOT the canonical executor --loop. Producer identity remains
    // "live_executor" (the writer), while this context distinguishes the caller.
    // We deliberately do not assert runtime/authority/capital here — prefer
    // "unknown" over overstatement.
    await liveExecutor.executeLiveExit(live.liveTradeId, trade, {
      invocationContext: "monitor_mirror",
      invocationSource: "monitor",
      bridgeMode: "monitor_live_exit_mirror"
    });
  } catch (err) {
    console.error(`[monitor] Live exit mirror failed for ${trade.symbol}: ${err.message}`);
  }
}

// When the paper monitor flags a catastrophic-loss anomaly (NEEDS_REVIEW), do
// NOT auto-sell any open live position — the price data is suspect. Instead
// flag it for manual review so a human decides. Fully isolated.
async function flagLiveReview(trade) {
  if (!liveExecutor) return;
  try {
    const flagged = liveExecutor.flagOpenLiveTradeAnomaly(
      trade.address,
      trade.anomalyReason || "Paper monitor flagged catastrophic-loss anomaly."
    );
    if (flagged) {
      console.error(`[monitor] ⚠ Open LIVE position for ${trade.symbol} flagged NEEDS_REVIEW — manual action required. NOT auto-sold.`);
    }
  } catch (err) {
    console.error(`[monitor] Live anomaly flag failed for ${trade.symbol}: ${err.message}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// A1a: lifecycle state lives in paper_positions.json (monitor-owned). The monitor
// reads the append-only ledger for entry/research fields and overlays lifecycle
// from the store. It never writes paper_trades.json.
function loadMergedTrades(positions) {
  const ledger = paperStore.readLedger();
  return ledger.map(row => {
    const id = paperStore.entryIdOf(row);
    const overlay = positions[id] || {};
    const merged = { ...row };
    for (const f of paperStore.LIFECYCLE_FIELDS) {
      if (overlay[f] !== undefined) merged[f] = overlay[f];
    }
    merged.entryId = id;
    return merged;
  });
}

function persistLifecycle(positions, trade) {
  positions[trade.entryId] = {
    entryId: trade.entryId,
    address: trade.address,
    pairAddress: trade.pairAddress,
    symbol: trade.symbol,
    ...paperStore.extractLifecycle(trade),
    updatedAt: new Date().toISOString()
  };
}

async function getCurrentPrice(pairAddress) {
  try {
    const response = await axios.get(`${DEX}/latest/dex/pairs/solana/${pairAddress}`);
    const pairs = [
      response.data.pair,
      ...(response.data.pairs || [])
    ].filter(Boolean);

    const pair = pairs.find(
      p => p.pairAddress?.toLowerCase() === pairAddress.toLowerCase()
    );
    if (!pair) return null;

    return {
      price: Number(pair.priceUsd || 0),
      pairAddress: pair.pairAddress
    };
  } catch {
    return null;
  }
}

function markNeedsReview(trade, observedPrice, observedPairAddress) {
  const impliedPnl =
    ((observedPrice - trade.entryPrice) / trade.entryPrice) * 100;

  trade.status = "NEEDS_REVIEW";
  trade.anomalyReason = `Observed price implies catastrophic loss of ${impliedPnl.toFixed(2)}%, worse than -50% safety threshold.`;
  trade.observedPrice = observedPrice;
  trade.observedPairAddress = observedPairAddress || trade.pairAddress;
  trade.anomalyTimestamp = new Date().toISOString();
  trade.monitorVersion = MONITOR_VERSION;
}

function closeTrade(trade, triggerType, triggerPrice) {
  const pnlPercent =
    ((triggerPrice - trade.entryPrice) / trade.entryPrice) * 100;

  trade.status =
    triggerType === "TARGET" ? "WIN" :
    triggerType === "STOP" ? "LOSS" :
    "TIMEOUT";
  trade.triggerType = triggerType;
  trade.triggerPrice = triggerPrice;
  trade.exitPrice = triggerPrice;
  trade.pnlPercent = Number(pnlPercent.toFixed(2));
  trade.monitorVersion = MONITOR_VERSION;
  trade.closedAt = new Date().toISOString();
}

async function monitorTrades() {
  // A1a: idempotently seed the lifecycle store from the existing ledger if missing,
  // then load the current positions map. Discovery: ensure every ledger entry has a
  // store row so the scanner and dashboard observe current lifecycle status.
  paperStore.ensureSeeded();
  const positions = paperStore.readPositions() || {};
  let changed = false;

  for (const row of paperStore.readLedger()) {
    const id = paperStore.entryIdOf(row);
    if (!positions[id]) {
      positions[id] = paperStore.buildPositionRow(row, row.timestamp);
      changed = true;
    }
  }

  const trades = loadMergedTrades(positions);

  for (const trade of trades) {
    if (trade.status !== "OPEN") continue;

    if (!trade.pairAddress) {
      console.log(`${trade.symbol} | Missing pairAddress. Cannot monitor safely.`);
      continue;
    }

    const observation = await getCurrentPrice(trade.pairAddress);
    if (!observation?.price) continue;
    const currentPrice = observation.price;

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
      closeTrade(trade, "TARGET", currentPrice);
      persistLifecycle(positions, trade);

      console.log(`✅ WIN ${trade.symbol}`);
      await mirrorLiveExit(trade);
      changed = true;
      continue;
    }

    if (currentPrice <= trade.stopPrice) {
      if (livePnl < -50) {
        markNeedsReview(trade, currentPrice, observation.pairAddress);
        persistLifecycle(positions, trade);

        console.log(`⚠ NEEDS_REVIEW ${trade.symbol} | ${trade.anomalyReason}`);
        await flagLiveReview(trade);
        changed = true;
        continue;
      }

      closeTrade(trade, "STOP", currentPrice);
      persistLifecycle(positions, trade);

      console.log(`❌ LOSS ${trade.symbol}`);
      await mirrorLiveExit(trade);
      changed = true;
      continue;
    }

    if (ageMinutes >= 20) {
      closeTrade(trade, "TIMEOUT", currentPrice);
      persistLifecycle(positions, trade);

      console.log(`⏰ TIMEOUT ${trade.symbol}`);
      await mirrorLiveExit(trade);
      changed = true;
    }

    await sleep(250);
  }

  // A1a: persist lifecycle changes to the monitor-owned store ONLY.
  // paper_trades.json is never rewritten by the monitor.
  if (changed) paperStore.writePositions(positions);

  const open = trades.filter(t => t.status === "OPEN").length;
  const wins = trades.filter(t => t.status === "WIN").length;
  const losses = trades.filter(t => t.status === "LOSS").length;
  const timeouts = trades.filter(t => t.status === "TIMEOUT").length;
  const needsReview = trades.filter(t => t.status === "NEEDS_REVIEW").length;
  const closed = trades.filter(t => ["WIN", "LOSS", "TIMEOUT"].includes(t.status));

  const totalPnl = closed.reduce((sum, t) => sum + Number(t.pnlPercent || 0), 0);
  const winRate = closed.length
    ? ((wins / closed.length) * 100).toFixed(2)
    : "0.00";

  console.log("\n=== PAPER TRADE STATS ===");
  console.log(`OPEN: ${open}`);
  console.log(`WINS: ${wins}`);
  console.log(`LOSSES: ${losses}`);
  console.log(`TIMEOUTS: ${timeouts}`);
  console.log(`NEEDS REVIEW: ${needsReview}`);
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
