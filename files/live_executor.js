// live_executor.js
// 3rd Floor Labz — Phase 1 Live Execution Layer
//
// SAFETY CONTRACT (never break these):
//   - Default state is OFF.  liveTradingEnabled AND ENABLE_LIVE_TRADING must BOTH be true to allow any trade.
//   - positionSizeSol is fixed at the config value.  No compounding.  No averaging down.  No martingale.
//   - maxOpenTrades = 1.  Only one live position at a time.
//   - Daily stop triggers on 3 losses OR -0.10 SOL realized loss, whichever comes first.
//   - Every execution failure is logged before rethrowing.
//   - Paper trades are never touched by this file.
//   - Kill switch (node emergency_stop.js) always works regardless of process state.
//
// Architecture:
//   Scanner / Monitor call into live_executor after their paper-trade logic runs.
//   live_executor decides whether to execute, validates all safety conditions,
//   calls the wallet adapter, and writes every event to live_trades.json as JSON-lines.
//
// Wallet adapter:
//   The actual swap calls live in LiveWalletAdapter below.
//   Phase 1: adapter stubs return DRY_RUN results so you can integrate
//   without submitting transactions until you are ready.
//   To go live set ENABLE_LIVE_TRADING=true in live_config.json AND
//   implement the two methods (buyToken, sellToken) with real Jupiter/Raydium calls.

"use strict";

const fs   = require("fs");
const path = require("path");

// ─── Constants ───────────────────────────────────────────────────────────────

const ROOT              = __dirname;
const CONFIG_FILE       = path.join(ROOT, "live_config.json");
const LIVE_TRADES_FILE  = path.join(ROOT, "live_trades.json");
const PAPER_FILE        = path.join(ROOT, "paper_trades.json");

const PHASE            = "PHASE_1_MICRO_TEST";
const EXECUTOR_VERSION = "live_executor_v1";

// Forbidden safety flags — these must never appear in a valid live trade.
const FORBIDDEN_FLAGS = [
  "COMPOUNDING",
  "AVERAGING_DOWN",
  "MARTINGALE",
  "MULTI_POSITION"
];

// ─── Config ──────────────────────────────────────────────────────────────────

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(`live_config.json not found at ${CONFIG_FILE}`);
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch (err) {
    throw new Error(`live_config.json parse error: ${err.message}`);
  }

  // Hard-coded Phase 1 guard rails — config values cannot exceed these.
  const MAX_POSITION_SOL  = 0.10;
  const MAX_OPEN_TRADES   = 1;

  if (Number(cfg.positionSizeSol) > MAX_POSITION_SOL) {
    throw new Error(
      `SAFETY VIOLATION: positionSizeSol ${cfg.positionSizeSol} exceeds Phase 1 maximum ${MAX_POSITION_SOL}`
    );
  }
  if (Number(cfg.maxOpenTrades) > MAX_OPEN_TRADES) {
    throw new Error(
      `SAFETY VIOLATION: maxOpenTrades ${cfg.maxOpenTrades} exceeds Phase 1 maximum ${MAX_OPEN_TRADES}`
    );
  }
  if (cfg.compoundingEnabled)   throw new Error("SAFETY VIOLATION: compoundingEnabled must be false");
  if (cfg.averagingDownEnabled) throw new Error("SAFETY VIOLATION: averagingDownEnabled must be false");
  if (cfg.martingaleEnabled)    throw new Error("SAFETY VIOLATION: martingaleEnabled must be false");

  return cfg;
}

// ─── JSON-lines helpers ───────────────────────────────────────────────────────

function readLiveTrades() {
  if (!fs.existsSync(LIVE_TRADES_FILE)) return [];
  return fs.readFileSync(LIVE_TRADES_FILE, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try { return JSON.parse(line); }
      catch { return { _parseError: true, _line: index + 1, _raw: line }; }
    });
}

function appendLiveEvent(event) {
  const line = JSON.stringify(event) + "\n";
  fs.appendFileSync(LIVE_TRADES_FILE, line);
}

function writeLiveEvent(event) {
  // Every event gets executor metadata stamped on it.
  const stamped = {
    executorVersion: EXECUTOR_VERSION,
    phase: PHASE,
    recordedAt: new Date().toISOString(),
    ...event
  };

  // Forbidden-flag guard.
  for (const flag of FORBIDDEN_FLAGS) {
    if (stamped.anomalyFlags && stamped.anomalyFlags.includes(flag)) {
      throw new Error(`SAFETY VIOLATION: forbidden flag ${flag} found in live event`);
    }
  }

  appendLiveEvent(stamped);
  return stamped;
}

// ─── Trade grouping ───────────────────────────────────────────────────────────

function groupLiveTrades(events = readLiveTrades()) {
  const map = new Map();
  for (const event of events) {
    if (!event.liveTradeId) continue;
    const trade = map.get(event.liveTradeId) || {
      liveTradeId: event.liveTradeId,
      events: []
    };
    trade.events.push(event);
    // Merge fields — later events win (exit overwrites entry for shared keys).
    Object.assign(trade, event);
    map.set(event.liveTradeId, trade);
  }
  return [...map.values()];
}

function openLiveTrades(trades = groupLiveTrades()) {
  // A trade is open if it was entered (has an ACTUAL_LIVE_ENTRY → status OPEN)
  // and has not yet been closed. We key off status, NOT txSig, because in
  // dry-run mode txSig is null — keying off txSig would miss open dry-run
  // positions and wrongly allow a second concurrent entry.
  return trades.filter(t =>
    t.status === "OPEN" &&
    !t.exitTime &&
    t.status !== "FAILED" &&
    t.status !== "CANCELLED" &&
    t.status !== "CLOSED"
  );
}

// ─── Daily tracking ───────────────────────────────────────────────────────────

function localDayKey(value = new Date()) {
  return new Date(value).toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function todayStats(trades = groupLiveTrades()) {
  const today = localDayKey();
  const CLOSED_STATUSES = ["WIN", "LOSS", "TIMEOUT", "CLOSED"];
  const todayTrades = trades.filter(t =>
    t.exitTime &&
    localDayKey(t.exitTime) === today &&
    CLOSED_STATUSES.includes(t.status)
  );
  // A loss is any closed trade with negative realized SOL PnL OR an explicit LOSS status.
  const losses = todayTrades.filter(t =>
    t.status === "LOSS" || Number(t.netPnlSol) < 0
  );
  const realizedPnlSol = todayTrades.reduce((s, t) => s + Number(t.netPnlSol || 0), 0);
  return {
    tradesToday: todayTrades.length,
    lossesToday: losses.length,
    realizedPnlSol
  };
}

// ─── Safety gate ──────────────────────────────────────────────────────────────

function safetyCheck(cfg, trades) {
  const reasons = [];

  // Primary kill: both flags must be true.
  if (!cfg.liveTradingEnabled) {
    reasons.push("liveTradingEnabled is false in live_config.json");
  }
  if (!cfg.ENABLE_LIVE_TRADING) {
    reasons.push("ENABLE_LIVE_TRADING is false in live_config.json");
  }
  if (cfg.requireManualConfirm) {
    reasons.push(
      "requireManualConfirm=true — set to false only after manual review and wallet connection"
    );
  }

  // Emergency stop.
  if (cfg.emergencyStopActivatedAt) {
    reasons.push(
      `Emergency stop active since ${cfg.emergencyStopActivatedAt}. Run node reset_live_safety.js to clear.`
    );
  }

  // Open position cap.
  const open = openLiveTrades(trades);
  if (open.length >= (cfg.maxOpenTrades || 1)) {
    reasons.push(`Max open live trades reached (${open.length}/${cfg.maxOpenTrades})`);
  }

  // Daily loss stop.
  const daily = todayStats(trades);
  if (daily.lossesToday >= (cfg.maxDailyLosses || 3)) {
    reasons.push(
      `Daily loss count stop triggered: ${daily.lossesToday} losses today (limit: ${cfg.maxDailyLosses})`
    );
  }
  if (daily.realizedPnlSol <= -(Math.abs(cfg.maxDailyLossSol || 0.10))) {
    reasons.push(
      `Daily SOL loss stop triggered: ${daily.realizedPnlSol.toFixed(4)} SOL today (limit: -${cfg.maxDailyLossSol})`
    );
  }

  return { allowed: reasons.length === 0, reasons, open, daily };
}

function assertAllowed(cfg, trades, context = "") {
  const gate = safetyCheck(cfg, trades);
  if (!gate.allowed) {
    const msg = `LIVE EXECUTION BLOCKED${context ? ` [${context}]` : ""}: ${gate.reasons.join(" | ")}`;
    // Always log the block event before throwing.
    try {
      writeLiveEvent({
        eventType: "EXECUTION_BLOCKED",
        context,
        reasons: gate.reasons,
        timestamp: new Date().toISOString()
      });
    } catch { /* do not mask the original error */ }
    throw new Error(msg);
  }
  return gate;
}

// ─── Wallet adapter (stub for Phase 1 dry-run) ───────────────────────────────
//
// Replace buyToken and sellToken with real Jupiter / Raydium calls.
// These stubs return a DRY_RUN result so every other system path can be
// exercised without touching the blockchain.

class LiveWalletAdapter {
  constructor(walletAddress) {
    this.walletAddress = walletAddress;
    this.isDryRun = true; // set false when real signing is wired up
  }

  async getBalanceSol() {
    // TODO: replace with real RPC call
    // const connection = new Connection(RPC_URL);
    // const balance = await connection.getBalance(new PublicKey(this.walletAddress));
    // return balance / LAMPORTS_PER_SOL;
    return null; // null = not connected
  }

  // Returns { txSig, filledPrice, slippagePct, feeSol, latencyMs, isDryRun }
  async buyToken({ tokenAddress, pairAddress, expectedPrice, positionSizeSol }) {
    if (this.isDryRun) {
      return {
        txSig: null,
        filledPrice: expectedPrice,
        slippagePct: 0,
        feeSol: 0,
        latencyMs: 0,
        isDryRun: true,
        note: "DRY_RUN — no transaction submitted. Wire real Jupiter/Raydium call here."
      };
    }

    // Real implementation goes here:
    // const { Connection, PublicKey, VersionedTransaction } = require("@solana/web3.js");
    // const { createJupiterApiClient } = require("@jup-ag/api");
    // ... build and sign swap transaction, submit, confirm ...
    throw new Error("Real buy not implemented. Set isDryRun=true or implement buyToken.");
  }

  // Returns { txSig, filledPrice, slippagePct, feeSol, latencyMs, isDryRun }
  async sellToken({ tokenAddress, pairAddress, expectedPrice, positionSizeSol }) {
    if (this.isDryRun) {
      return {
        txSig: null,
        filledPrice: expectedPrice,
        slippagePct: 0,
        feeSol: 0,
        latencyMs: 0,
        isDryRun: true,
        note: "DRY_RUN — no transaction submitted. Wire real Jupiter/Raydium call here."
      };
    }

    throw new Error("Real sell not implemented. Set isDryRun=true or implement sellToken.");
  }
}

// ─── Trade ID ─────────────────────────────────────────────────────────────────

function generateTradeId(symbol, timestamp = Date.now()) {
  return `live_${symbol}_${timestamp}`;
}

// ─── Entry execution ──────────────────────────────────────────────────────────

// Call this from scanner after logPaperTrade() runs — pass the same candidate.
// candidate: { symbol, address, pairAddress, score, entryPrice, marketCap,
//              botDegenRate, top10HolderRate, liquidity, source, strategyVersion }
//
// Returns the written LIVE_ENTRY event, or null if execution was skipped safely.

async function executeLiveEntry(candidate) {
  const entryStart = Date.now();
  const tradeId = generateTradeId(candidate.symbol || "UNKNOWN", entryStart);

  // 1. Load config and trades fresh every call — never cache.
  let cfg, trades;
  try {
    cfg = loadConfig();
    trades = groupLiveTrades();
  } catch (err) {
    // Config load failure is a hard abort — log and re-throw.
    logExecutionFailure(tradeId, candidate, "CONFIG_LOAD_FAILED", err.message);
    throw err;
  }

  // 2. Safety gate.
  let gate;
  try {
    gate = assertAllowed(cfg, trades, "ENTRY");
  } catch (err) {
    // Blocked — not an error from our perspective, just not allowed right now.
    console.log(`[live_executor] Entry blocked for ${candidate.symbol}: ${err.message}`);
    return null;
  }

  // 3. Validate candidate has required fields.
  const requiredFields = ["symbol", "address", "pairAddress", "entryPrice", "score"];
  const missing = requiredFields.filter(f => !candidate[f]);
  if (missing.length) {
    logExecutionFailure(tradeId, candidate, "INVALID_CANDIDATE", `Missing fields: ${missing.join(", ")}`);
    console.log(`[live_executor] Invalid candidate — missing: ${missing.join(", ")}`);
    return null;
  }

  // 4. Log INTENDED_ENTRY (before wallet call).
  const intendedEntry = writeLiveEvent({
    eventType: "INTENDED_LIVE_ENTRY",
    liveTradeId: tradeId,
    timestamp: new Date().toISOString(),
    symbol: candidate.symbol,
    address: candidate.address,
    pairAddress: candidate.pairAddress,
    score: candidate.score,
    marketCap: candidate.marketCap,
    liquidity: candidate.liquidity,
    botDegenRate: candidate.botDegenRate,
    top10HolderRate: candidate.top10HolderRate,
    source: candidate.source,
    strategyVersion: candidate.strategyVersion || cfg.strategyVersion,
    intendedPositionSizeSol: cfg.positionSizeSol,
    intendedEntryPrice: candidate.entryPrice,
    targetPrice: candidate.targetPrice,
    stopPrice: candidate.stopPrice,
    anomalyFlags: []
  });

  console.log(`[live_executor] Attempting live entry: ${candidate.symbol} @ $${candidate.entryPrice}`);

  // 5. Execute wallet buy.
  const adapter = new LiveWalletAdapter(cfg.walletAddress);
  let buyResult;
  try {
    buyResult = await adapter.buyToken({
      tokenAddress: candidate.address,
      pairAddress: candidate.pairAddress,
      expectedPrice: candidate.entryPrice,
      positionSizeSol: cfg.positionSizeSol
    });
  } catch (err) {
    logExecutionFailure(tradeId, candidate, "BUY_TX_FAILED", err.message);
    throw err;
  }

  const entryLatencyMs = Date.now() - entryStart;
  const slippagePct = buyResult.slippagePct || 0;

  // 6. Anomaly detection on fill.
  const anomalyFlags = [];
  if (Math.abs(slippagePct) > 5) anomalyFlags.push("HIGH_ENTRY_SLIPPAGE");
  if (buyResult.isDryRun) anomalyFlags.push("DRY_RUN");

  // 7. Log ACTUAL_LIVE_ENTRY.
  const actualEntry = writeLiveEvent({
    eventType: "ACTUAL_LIVE_ENTRY",
    liveTradeId: tradeId,
    timestamp: new Date().toISOString(),
    entryTime: new Date().toISOString(),
    symbol: candidate.symbol,
    address: candidate.address,
    pairAddress: candidate.pairAddress,
    score: candidate.score,
    marketCap: candidate.marketCap,
    liquidity: candidate.liquidity,
    botDegenRate: candidate.botDegenRate,
    top10HolderRate: candidate.top10HolderRate,
    source: candidate.source,
    strategyVersion: candidate.strategyVersion || cfg.strategyVersion,
    positionSizeSol: cfg.positionSizeSol,
    intendedEntryPrice: candidate.entryPrice,
    actualEntryPrice: buyResult.filledPrice,
    entrySlippagePct: slippagePct,
    entryFeeSol: buyResult.feeSol || 0,
    entryTxSig: buyResult.txSig,
    entryLatencyMs,
    targetPrice: candidate.targetPrice,
    stopPrice: candidate.stopPrice,
    anomalyFlags,
    isDryRun: buyResult.isDryRun || false,
    status: "OPEN"
  });

  console.log(
    `[live_executor] Entry logged: ${candidate.symbol} | ` +
    `fill $${buyResult.filledPrice} | slippage ${slippagePct.toFixed(2)}% | ` +
    `latency ${entryLatencyMs}ms | ` +
    (buyResult.isDryRun ? "DRY_RUN" : `txSig: ${buyResult.txSig}`)
  );

  return actualEntry;
}

// ─── Exit execution ───────────────────────────────────────────────────────────

// Call this from monitor after it decides to close a paper trade.
// trade: the paper trade object that just triggered (has address, pairAddress,
//        symbol, entryPrice, triggerType, triggerPrice)
// liveTradeId: the ID that was returned from executeLiveEntry for this position.

async function executeLiveExit(liveTradeId, trade) {
  const exitStart = Date.now();

  // 1. Load fresh.
  let cfg, trades;
  try {
    cfg = loadConfig();
    trades = groupLiveTrades();
  } catch (err) {
    logExecutionFailure(liveTradeId, trade, "CONFIG_LOAD_FAILED", err.message);
    throw err;
  }

  // 2. Find the open live trade record.
  const liveEntry = trades.find(t =>
    t.liveTradeId === liveTradeId &&
    t.entryTxSig !== undefined &&   // was actually entered
    t.status === "OPEN"
  );

  if (!liveEntry) {
    // No matching open live trade — log and skip.
    writeLiveEvent({
      eventType: "EXIT_SKIPPED",
      liveTradeId,
      reason: "No matching OPEN live trade found for this ID",
      paperTrigger: trade.triggerType,
      timestamp: new Date().toISOString()
    });
    console.log(`[live_executor] Exit skipped — no open live trade for ${liveTradeId}`);
    return null;
  }

  // 3. Log INTENDED_EXIT.
  writeLiveEvent({
    eventType: "INTENDED_LIVE_EXIT",
    liveTradeId,
    timestamp: new Date().toISOString(),
    paperTriggerType: trade.triggerType,
    paperTriggerPrice: trade.triggerPrice,
    paperPnlPercent: trade.pnlPercent
  });

  console.log(
    `[live_executor] Attempting live exit: ${trade.symbol} | ` +
    `trigger: ${trade.triggerType} @ $${trade.triggerPrice}`
  );

  // 4. Execute wallet sell.
  const adapter = new LiveWalletAdapter(cfg.walletAddress);
  let sellResult;
  try {
    sellResult = await adapter.sellToken({
      tokenAddress: trade.address,
      pairAddress: trade.pairAddress,
      expectedPrice: trade.triggerPrice,
      positionSizeSol: cfg.positionSizeSol
    });
  } catch (err) {
    logExecutionFailure(liveTradeId, trade, "SELL_TX_FAILED", err.message);
    throw err;
  }

  const exitLatencyMs = Date.now() - exitStart;
  const exitSlippagePct = sellResult.slippagePct || 0;

  // 5. Compute PnL.
  const entryPrice = liveEntry.actualEntryPrice || liveEntry.intendedEntryPrice;
  const exitPrice  = sellResult.filledPrice;
  const posSize    = cfg.positionSizeSol;

  const grossPnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;
  const grossPnlSol = posSize * (grossPnlPct / 100);
  const totalFeesSol = (liveEntry.entryFeeSol || 0) + (sellResult.feeSol || 0);
  const netPnlSol   = grossPnlSol - totalFeesSol;
  const netPnlPct   = posSize > 0 ? (netPnlSol / posSize) * 100 : 0;

  // 6. Anomaly detection on exit.
  const anomalyFlags = [...(liveEntry.anomalyFlags || [])];
  if (Math.abs(exitSlippagePct) > 5)  anomalyFlags.push("HIGH_EXIT_SLIPPAGE");
  if (sellResult.isDryRun)            anomalyFlags.push("DRY_RUN");

  // Slippage vs paper divergence.
  const paperPnlPct  = Number(trade.pnlPercent || 0);
  const pnlDeviation = Math.abs(grossPnlPct - paperPnlPct);
  if (pnlDeviation > 10) anomalyFlags.push("LARGE_PAPER_LIVE_DIVERGENCE");

  const status =
    trade.triggerType === "TARGET"  ? "WIN" :
    trade.triggerType === "STOP"    ? "LOSS" :
    trade.triggerType === "TIMEOUT" ? "TIMEOUT" : "CLOSED";

  // 7. Log ACTUAL_LIVE_EXIT.
  const actualExit = writeLiveEvent({
    eventType: "ACTUAL_LIVE_EXIT",
    liveTradeId,
    timestamp: new Date().toISOString(),
    exitTime: new Date().toISOString(),
    symbol: trade.symbol,
    address: trade.address,
    pairAddress: trade.pairAddress,
    paperTriggerType: trade.triggerType,
    paperTriggerPrice: trade.triggerPrice,
    paperPnlPercent: trade.pnlPercent,
    positionSizeSol: posSize,
    actualEntryPrice: entryPrice,
    actualExitPrice: exitPrice,
    exitSlippagePct,
    exitFeeSol: sellResult.feeSol || 0,
    entryFeeSol: liveEntry.entryFeeSol || 0,
    totalFeesSol,
    grossPnlPct: Number(grossPnlPct.toFixed(4)),
    grossPnlSol: Number(grossPnlSol.toFixed(6)),
    netPnlSol: Number(netPnlSol.toFixed(6)),
    netPnlPct: Number(netPnlPct.toFixed(4)),
    exitTxSig: sellResult.txSig,
    exitLatencyMs,
    paperLivePnlDeviation: Number(pnlDeviation.toFixed(4)),
    anomalyFlags,
    isDryRun: sellResult.isDryRun || false,
    status
  });

  console.log(
    `[live_executor] Exit logged: ${trade.symbol} | ` +
    `${status} | gross ${grossPnlPct.toFixed(2)}% | net ${netPnlSol.toFixed(4)} SOL | ` +
    `fees ${totalFeesSol.toFixed(4)} SOL | ` +
    (sellResult.isDryRun ? "DRY_RUN" : `txSig: ${sellResult.txSig}`)
  );

  // 8. Post-exit daily stop check — log warning if now triggered.
  try {
    const postTrades = groupLiveTrades();
    const daily = todayStats(postTrades);
    const cfgFresh = loadConfig();
    if (
      daily.lossesToday >= (cfgFresh.maxDailyLosses || 3) ||
      daily.realizedPnlSol <= -(Math.abs(cfgFresh.maxDailyLossSol || 0.10))
    ) {
      writeLiveEvent({
        eventType: "DAILY_STOP_TRIGGERED",
        timestamp: new Date().toISOString(),
        lossesToday: daily.lossesToday,
        realizedPnlSol: daily.realizedPnlSol,
        maxDailyLosses: cfgFresh.maxDailyLosses,
        maxDailyLossSol: cfgFresh.maxDailyLossSol,
        note: "Next entry will be blocked by safetyCheck. No automatic config change — review manually."
      });
      console.log(
        `[live_executor] ⚠ DAILY STOP TRIGGERED — losses: ${daily.lossesToday} | ` +
        `SOL: ${daily.realizedPnlSol.toFixed(4)}`
      );
    }
  } catch { /* post-exit check is best-effort */ }

  return actualExit;
}

// ─── Execution failure logger ─────────────────────────────────────────────────

function logExecutionFailure(liveTradeId, context, reason, detail = "") {
  try {
    writeLiveEvent({
      eventType: "EXECUTION_FAILURE",
      liveTradeId,
      timestamp: new Date().toISOString(),
      symbol: context && context.symbol,
      address: context && context.address,
      failureReason: reason,
      failureDetail: detail,
      anomalyFlags: ["EXECUTION_FAILURE"],
      status: "FAILED"
    });
  } catch (err) {
    // Last resort: write to stderr so it's never silently lost.
    process.stderr.write(
      `[live_executor] CRITICAL: could not log failure event: ${err.message}\n` +
      `  Original failure: ${reason} — ${detail}\n`
    );
  }
}

// ─── Kill switch ──────────────────────────────────────────────────────────────

// Programmatic kill switch — also works from CLI via emergency_stop.js.
// Logs the stop event, then writes the config change.
function killSwitch(reason = "Manual kill switch activated") {
  console.log(`[live_executor] KILL SWITCH: ${reason}`);
  writeLiveEvent({
    eventType: "KILL_SWITCH_ACTIVATED",
    timestamp: new Date().toISOString(),
    reason,
    anomalyFlags: ["KILL_SWITCH"]
  });

  const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  const stopped = {
    ...cfg,
    liveTradingEnabled: false,
    ENABLE_LIVE_TRADING: false,
    emergencyStopActivatedAt: new Date().toISOString(),
    killSwitchReason: reason
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(stopped, null, 2) + "\n");
  console.log("[live_executor] live_config.json updated — liveTradingEnabled=false");
}

// ─── Stats helpers (used by dashboard) ───────────────────────────────────────

function liveStats() {
  const events = readLiveTrades();
  const trades = groupLiveTrades(events);
  const closed = trades.filter(t => t.status === "CLOSED" || t.status === "WIN" || t.status === "LOSS" || t.status === "TIMEOUT");
  const wins   = closed.filter(t => t.status === "WIN").length;
  const losses = closed.filter(t => t.status === "LOSS").length;
  const timeouts = closed.filter(t => t.status === "TIMEOUT").length;
  const open   = openLiveTrades(trades);

  const pnlValues = closed
    .map(t => Number(t.netPnlSol))
    .filter(Number.isFinite);

  const totalNetPnlSol = pnlValues.reduce((s, v) => s + v, 0);
  const avgPnlSol = pnlValues.length ? totalNetPnlSol / pnlValues.length : 0;
  const grossWins  = pnlValues.filter(v => v > 0).reduce((s, v) => s + v, 0);
  const grossLoss  = Math.abs(pnlValues.filter(v => v < 0).reduce((s, v) => s + v, 0));
  const profitFactor = grossLoss > 0 ? grossWins / grossLoss : null;

  // Drawdown — running equity from position size.
  const cfg = (() => { try { return loadConfig(); } catch { return {}; } })();
  const posSizeSol = cfg.positionSizeSol || 0.10;

  let equity = 0;
  let peak   = 0;
  let maxDrawdownSol = 0;
  for (const pnl of pnlValues) {
    equity += pnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdownSol) maxDrawdownSol = dd;
  }
  const maxDrawdownPct = peak > 0 ? (maxDrawdownSol / (peak + (posSizeSol * wins))) * 100 : 0;

  // Slippage stats (entry + exit combined).
  const allSlippage = [];
  for (const t of closed) {
    if (Number.isFinite(Number(t.entrySlippagePct))) allSlippage.push(Math.abs(Number(t.entrySlippagePct)));
    if (Number.isFinite(Number(t.exitSlippagePct)))  allSlippage.push(Math.abs(Number(t.exitSlippagePct)));
  }
  const avgSlippage = allSlippage.length
    ? allSlippage.reduce((s, v) => s + v, 0) / allSlippage.length
    : 0;
  const maxSlippage = allSlippage.length ? Math.max(...allSlippage) : 0;

  // Edge preservation vs paper trades.
  let edgeScore = null;
  try {
    const paperLines = fs.readFileSync(PAPER_FILE, "utf8").split("\n").filter(Boolean);
    const paperTrades = paperLines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const paperClosed = paperTrades.filter(t =>
      ["WIN", "LOSS", "TIMEOUT"].includes(t.status) &&
      Number.isFinite(Number(t.pnlPercent)) &&
      t.strategyVersion === "gmgn_v4"
    );
    const paperPnls = paperClosed.map(t => Number(t.pnlPercent));
    const paperAvg  = paperPnls.length ? paperPnls.reduce((s, v) => s + v, 0) / paperPnls.length : null;
    const liveAvgPct = closed.length
      ? closed.map(t => Number(t.grossPnlPct || 0)).filter(Number.isFinite).reduce((s, v) => s + v, 0) / closed.length
      : null;

    if (paperAvg !== null && liveAvgPct !== null && paperAvg !== 0) {
      // Score: 100 = live matches paper, >100 = live outperforms, <100 = underperforms.
      edgeScore = Math.round((liveAvgPct / paperAvg) * 100);
    }
  } catch { /* edge score is best-effort */ }

  // Daily stop status.
  const daily = todayStats(trades);
  const dailyStopActive =
    daily.lossesToday >= (cfg.maxDailyLosses || 3) ||
    daily.realizedPnlSol <= -(Math.abs(cfg.maxDailyLossSol || 0.10));

  // Parse errors.
  const parseErrors = events.filter(e => e._parseError).length;

  return {
    totalLiveTrades: closed.length,
    openTrades: open.length,
    wins, losses, timeouts,
    winRate: closed.length ? ((wins / closed.length) * 100).toFixed(1) : null,
    totalNetPnlSol: Number(totalNetPnlSol.toFixed(6)),
    avgPnlSol: Number(avgPnlSol.toFixed(6)),
    profitFactor: profitFactor !== null ? Number(profitFactor.toFixed(3)) : null,
    maxDrawdownSol: Number(maxDrawdownSol.toFixed(6)),
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    avgSlippagePct: Number(avgSlippage.toFixed(3)),
    maxSlippagePct: Number(maxSlippage.toFixed(3)),
    edgePreservationScore: edgeScore,
    dailyStopActive,
    lossesToday: daily.lossesToday,
    realizedPnlSolToday: Number(daily.realizedPnlSol.toFixed(6)),
    parseErrors,
    config: {
      positionSizeSol: cfg.positionSizeSol,
      maxDailyLossSol: cfg.maxDailyLossSol,
      maxDailyLosses: cfg.maxDailyLosses,
      maxDrawdownPercent: cfg.maxDrawdownPercent,
      liveTradingEnabled: cfg.liveTradingEnabled,
      ENABLE_LIVE_TRADING: cfg.ENABLE_LIVE_TRADING,
      walletAddress: cfg.walletAddress || null
    }
  };
}

// ─── CLI self-test ────────────────────────────────────────────────────────────

if (require.main === module) {
  console.log("\n[live_executor] Self-test — loading config and checking safety state...\n");
  try {
    const cfg = loadConfig();
    console.log("Config loaded:", JSON.stringify(cfg, null, 2));
    const trades = groupLiveTrades();
    const gate = safetyCheck(cfg, trades);
    console.log("\nSafety check:");
    console.log("  Allowed:", gate.allowed);
    console.log("  Reasons:", gate.reasons.length ? gate.reasons : ["none — all checks passed"]);
    console.log("\nLive stats:");
    console.log(JSON.stringify(liveStats(), null, 2));
    console.log("\n[live_executor] Self-test complete. No trades executed.\n");
  } catch (err) {
    console.error("[live_executor] Self-test error:", err.message);
    process.exit(1);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  executeLiveEntry,
  executeLiveExit,
  killSwitch,
  liveStats,
  loadConfig,
  readLiveTrades,
  groupLiveTrades,
  safetyCheck,
  todayStats,
  writeLiveEvent,
  EXECUTOR_VERSION,
  PHASE
};
