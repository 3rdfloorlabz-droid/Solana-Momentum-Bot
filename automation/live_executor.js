// live_executor.js
// 3rd Floor Labz — Phase 1 AUTONOMOUS Live Execution Layer (v2)
//
// This is the ONLY file responsible for live automation.
//
// SAFETY CONTRACT — these are enforced every cycle and cannot be bypassed:
//   1. DRY RUN by default. dryRunMode:true => no transactions are ever submitted.
//   2. Default OFF. automationEnabled:false => no entries.
//   3. emergencyStop:true => no entries AND no exits. Requires reset_live_safety.js.
//   4. Fixed position size. No compounding, no averaging down, no martingale.
//   5. Max 1 open live position.
//   6. Daily stop: 3 losses OR -0.10 SOL realized => no new entries.
//   7. Strict gmgn_v4 thesis only.
//   8. Never reads a private key from source. Real signing requires an env var
//      the user provides, and is NOT implemented here (guarded stub).
//   9. Paper trades are read-only. live and paper data never mix.
//
// Files written (all in project root):
//   live_trades.jsonl          append-only event + closed-trade log
//   live_positions.json        current open positions (overwritten on change)
//   live_control_events.jsonl  START / STOP / EMERGENCY / RESET events
//   live_errors.jsonl          aborts and errors

"use strict";

const fs   = require("fs");
const path = require("path");

let axios = null;
try { axios = require("axios"); } catch { /* price polling will degrade gracefully */ }

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT                = __dirname;
const CONFIG_FILE         = path.join(ROOT, "live_config.json");
const PAPER_FILE          = path.join(ROOT, "paper_trades.json");
const LIVE_TRADES_FILE    = path.join(ROOT, "live_trades.jsonl");
const LIVE_POSITIONS_FILE = path.join(ROOT, "live_positions.json");
const CONTROL_EVENTS_FILE = path.join(ROOT, "live_control_events.jsonl");
const ERRORS_FILE         = path.join(ROOT, "live_errors.jsonl");

const DEX = "https://api.dexscreener.com";

const PHASE            = "PHASE_1_AUTONOMOUS_DRY_RUN";
const EXECUTOR_VERSION = "live_executor_v2";
const TARGET_MULT      = 1.10;  // matches paper monitor target
const STOP_MULT        = 0.95;  // matches paper monitor stop
const TIMEOUT_MINUTES  = 20;    // matches paper monitor timeout

const FORBIDDEN_FLAGS = ["COMPOUNDING", "AVERAGING_DOWN", "MARTINGALE", "MULTI_POSITION"];

// ─── Small fs helpers ─────────────────────────────────────────────────────────

function nowIso() { return new Date().toISOString(); }

function appendJsonl(file, obj) {
  fs.appendFileSync(file, JSON.stringify(obj) + "\n");
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, i) => {
      try { return JSON.parse(line); }
      catch { return { _parseError: true, _line: i + 1, _raw: line }; }
    });
}

function logError(stage, message, extra = {}) {
  try {
    appendJsonl(ERRORS_FILE, { timestamp: nowIso(), stage, message, ...extra });
  } catch { /* never throw from the error logger */ }
}

// ─── Config ───────────────────────────────────────────────────────────────────

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) throw new Error(`live_config.json not found at ${CONFIG_FILE}`);
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }
  catch (err) { throw new Error(`live_config.json parse error: ${err.message}`); }

  // Hard ceilings — config can never exceed Phase 1 limits.
  if (Number(cfg.positionSizeSol) > 0.10) {
    throw new Error(`SAFETY VIOLATION: positionSizeSol ${cfg.positionSizeSol} exceeds Phase 1 max 0.10`);
  }
  if (Number(cfg.maxOpenTrades) > 1) {
    throw new Error(`SAFETY VIOLATION: maxOpenTrades ${cfg.maxOpenTrades} exceeds Phase 1 max 1`);
  }
  if (cfg.compoundingEnabled)   throw new Error("SAFETY VIOLATION: compoundingEnabled must be false");
  if (cfg.averagingDownEnabled) throw new Error("SAFETY VIOLATION: averagingDownEnabled must be false");
  if (cfg.martingaleEnabled)    throw new Error("SAFETY VIOLATION: martingaleEnabled must be false");

  return cfg;
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n");
}

// ─── Positions store ──────────────────────────────────────────────────────────

function readPositions() {
  if (!fs.existsSync(LIVE_POSITIONS_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(LIVE_POSITIONS_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    logError("readPositions", err.message);
    return [];
  }
}

function writePositions(positions) {
  fs.writeFileSync(LIVE_POSITIONS_FILE, JSON.stringify(positions, null, 2) + "\n");
}

function openPositions() {
  return readPositions().filter(p => p.status === "OPEN");
}

function findOpenLiveTradeByAddress(address) {
  if (!address) return null;
  return openPositions().find(p => p.address === address) || null;
}

// ─── Event writer (with forbidden-flag guard) ─────────────────────────────────

function writeLiveEvent(event) {
  const stamped = { executorVersion: EXECUTOR_VERSION, phase: PHASE, recordedAt: nowIso(), ...event };
  for (const flag of FORBIDDEN_FLAGS) {
    if (stamped.anomalyFlags && stamped.anomalyFlags.includes(flag)) {
      throw new Error(`SAFETY VIOLATION: forbidden flag ${flag} in live event`);
    }
  }
  appendJsonl(LIVE_TRADES_FILE, stamped);
  return stamped;
}

// ─── Daily stats / stop ───────────────────────────────────────────────────────

function localDayKey(value = new Date()) {
  return new Date(value).toLocaleDateString("en-CA");
}

function closedTrades() {
  // Closed-trade summaries live in the jsonl as eventType CLOSED_LIVE_TRADE.
  return readLiveTrades().filter(e => e.eventType === "CLOSED_LIVE_TRADE");
}

function todayStats() {
  const today = localDayKey();
  const todays = closedTrades().filter(t => t.exitTime && localDayKey(t.exitTime) === today);
  const losses = todays.filter(t => t.status === "LOSS" || Number(t.netPnlSol) < 0);
  const realizedPnlSol = todays.reduce((s, t) => s + Number(t.netPnlSol || 0), 0);
  return { tradesToday: todays.length, lossesToday: losses.length, realizedPnlSol };
}

function dailyStopHit(cfg, daily = todayStats()) {
  const lossCountHit = daily.lossesToday >= (cfg.maxDailyLossCount || 3);
  const lossSolHit   = daily.realizedPnlSol <= -(Math.abs(cfg.maxDailyLossSol || 0.10));
  return { hit: lossCountHit || lossSolHit, lossCountHit, lossSolHit };
}

// ─── Safety gate (entries) ────────────────────────────────────────────────────

function safetyCheck(cfg = loadConfig()) {
  const reasons = [];
  if (cfg.emergencyStop)      reasons.push("Emergency stop is active");
  if (!cfg.automationEnabled) reasons.push("automationEnabled is false");

  const open = openPositions();
  if (open.length >= (cfg.maxOpenTrades || 1)) reasons.push(`Max open positions reached (${open.length}/${cfg.maxOpenTrades})`);

  const daily = todayStats();
  const stop = dailyStopHit(cfg, daily);
  if (stop.lossCountHit) reasons.push(`Daily loss-count stop: ${daily.lossesToday}/${cfg.maxDailyLossCount}`);
  if (stop.lossSolHit)   reasons.push(`Daily SOL-loss stop: ${daily.realizedPnlSol.toFixed(4)}/-${cfg.maxDailyLossSol}`);

  return { allowed: reasons.length === 0, reasons, open, daily, dailyStop: stop };
}

// ─── Thesis matching (strict Phase 1) ─────────────────────────────────────────

function matchesPhase1Thesis(trade, cfg) {
  const t = cfg.thesis || {};
  const score = Number(trade.score);
  const mc    = Number(trade.marketCap);
  const bot   = Number(trade.botDegenRate);
  const top10 = Number(trade.top10HolderRate);
  const liq   = Number(trade.liquidity);
  const reasons = [];

  if (trade.source !== (t.source || "gmgn_trending")) reasons.push("source != gmgn_trending");
  if (!(score >= (t.scoreMin ?? 80) && score <= (t.scoreMax ?? 89))) reasons.push("score outside 80-89");
  if (!(mc >= (t.marketCapMin ?? 100000) && mc <= (t.marketCapMax ?? 250000))) reasons.push("marketCap outside 100k-250k");
  if (!(bot < (t.botDegenRateMax ?? 0.05))) reasons.push("botDegenRate >= 0.05");
  if (!(top10 >= (t.top10HolderRateMin ?? 0.10) && top10 <= (t.top10HolderRateMax ?? 0.20))) reasons.push("top10 outside 0.10-0.20");
  if (!(Number.isFinite(liq) && liq > 0)) reasons.push("liquidity missing");
  if (!trade.pairAddress) reasons.push("pairAddress missing");
  if (!Number.isFinite(Number(trade.entryPrice)) || Number(trade.entryPrice) <= 0) reasons.push("entry price missing");

  return { ok: reasons.length === 0, reasons };
}

// ─── Read paper signals (read-only) ───────────────────────────────────────────

function readPaperTrades() {
  if (!fs.existsSync(PAPER_FILE)) return [];
  return fs.readFileSync(PAPER_FILE, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// Find the newest OPEN paper trade matching strict thesis that we have not
// already taken a live position on (dedupe by address + pairAddress).
function findEntryCandidate(cfg) {
  const positions = readPositions();
  const takenAddrs = new Set(positions.map(p => p.address));
  const takenPairs = new Set(positions.map(p => p.pairAddress));

  // Also dedupe against anything already logged today as a live entry.
  const today = localDayKey();
  const enteredToday = new Set(
    readLiveTrades()
      .filter(e => e.eventType === "ACTUAL_LIVE_ENTRY" && e.entryTime && localDayKey(e.entryTime) === today)
      .map(e => e.address)
  );

  const open = readPaperTrades().filter(t => t.status === "OPEN");
  const matching = open
    .filter(t => matchesPhase1Thesis(t, cfg).ok)
    .filter(t => !takenAddrs.has(t.address) && !takenPairs.has(t.pairAddress) && !enteredToday.has(t.address))
    .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

  return matching[0] || null;
}

// ─── Wallet adapter ───────────────────────────────────────────────────────────

async function getWalletBalanceSol(cfg) {
  // Best-effort balance read via Solana JSON-RPC. Never throws.
  const rpc = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const addr = cfg.walletPublicAddress;
  if (!addr) return null;
  if (typeof fetch !== "function") return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [addr] }),
      signal: controller.signal
    });
    clearTimeout(timer);
    const json = await res.json();
    const lamports = json && json.result && json.result.value;
    return Number.isFinite(lamports) ? lamports / 1e9 : null;
  } catch {
    return null;
  }
}

// DRY RUN: returns a synthetic intent. REAL: guarded — not implemented.
async function submitSwap(kind, { cfg, tokenAddress, pairAddress, expectedPrice, positionSizeSol }) {
  if (cfg.dryRunMode) {
    return {
      txSig: null,
      filledPrice: expectedPrice,
      slippagePct: 0,
      feeSol: 0,
      latencyMs: 0,
      isDryRun: true,
      intent: { kind, tokenAddress, pairAddress, expectedPrice, positionSizeSol },
      note: "DRY_RUN — transaction intent generated, nothing submitted."
    };
  }

  // ── REAL EXECUTION PATH (intentionally not implemented) ──────────────────────
  // This is reached only if dryRunMode is false. By design it throws, so that
  // shipping this code can never move real money without the user implementing
  // and auditing their own signer. Implement with @solana/web3.js + Jupiter,
  // reading the signer from process.env.SOLANA_SIGNER_SECRET (never from disk).
  throw new Error(
    "REAL execution path is not implemented. Keep dryRunMode:true, or implement " +
    "submitSwap() with your own audited signer before disabling dry run."
  );
}

// ─── Pre-trade abort checks ───────────────────────────────────────────────────

async function preTradeChecks(cfg, candidate) {
  const aborts = [];

  // Wallet address must match config.
  if (!cfg.walletPublicAddress) aborts.push("walletPublicAddress missing from config");
  if (process.env.EXPECTED_WALLET_PUBLIC_ADDRESS &&
      process.env.EXPECTED_WALLET_PUBLIC_ADDRESS !== cfg.walletPublicAddress) {
    aborts.push("Wallet address mismatch: env EXPECTED_WALLET_PUBLIC_ADDRESS != config");
  }

  // pairAddress + token address present.
  if (!candidate.pairAddress) aborts.push("pairAddress missing");
  if (!candidate.address)     aborts.push("token address missing");

  // Quote present (entry price stands in for the quote in dry run).
  if (!Number.isFinite(Number(candidate.entryPrice)) || Number(candidate.entryPrice) <= 0) {
    aborts.push("quote/entry price missing");
  }

  // Balance check. In dry run, unknown balance is non-fatal (flagged).
  const balance = await getWalletBalanceSol(cfg);
  const minBal = Number(cfg.minWalletBalanceSol || 0.12);
  if (balance === null) {
    if (!cfg.dryRunMode) aborts.push("Could not read wallet balance (required for real execution)");
  } else if (balance < minBal) {
    aborts.push(`Wallet balance ${balance.toFixed(4)} SOL below minimum ${minBal} SOL`);
  }

  // Slippage estimate. In dry run we assume 0; real path would estimate from quote.
  const estSlippage = 0;
  if (estSlippage > Number(cfg.maxEntrySlippagePct || 3)) {
    aborts.push(`Estimated slippage ${estSlippage}% exceeds max ${cfg.maxEntrySlippagePct}%`);
  }

  // Duplicate-trade risk (defense in depth; findEntryCandidate already dedupes).
  if (findOpenLiveTradeByAddress(candidate.address)) {
    aborts.push("Duplicate trade risk: an open live position already exists for this token");
  }

  return { ok: aborts.length === 0, aborts, balance, balanceKnown: balance !== null };
}

// ─── Entry ────────────────────────────────────────────────────────────────────

async function enterPosition(cfg, candidate) {
  const entryStart = Date.now();
  const liveTradeId = `live_${candidate.symbol || "UNKNOWN"}_${entryStart}`;

  // Pre-trade aborts.
  const checks = await preTradeChecks(cfg, candidate);
  if (!checks.ok) {
    logError("preTradeChecks", checks.aborts.join(" | "), { liveTradeId, symbol: candidate.symbol });
    writeLiveEvent({
      eventType: "ENTRY_ABORTED", liveTradeId, timestamp: nowIso(),
      symbol: candidate.symbol, address: candidate.address,
      aborts: checks.aborts, anomalyFlags: ["ENTRY_ABORTED"]
    });
    return null;
  }

  writeLiveEvent({
    eventType: "INTENDED_LIVE_ENTRY", liveTradeId, timestamp: nowIso(),
    symbol: candidate.symbol, address: candidate.address, pairAddress: candidate.pairAddress,
    score: candidate.score, marketCap: candidate.marketCap, liquidity: candidate.liquidity,
    botDegenRate: candidate.botDegenRate, top10HolderRate: candidate.top10HolderRate,
    source: candidate.source, strategyVersion: cfg.strategyVersion,
    intendedPositionSizeSol: cfg.positionSizeSol, intendedEntryPrice: candidate.entryPrice,
    dryRun: !!cfg.dryRunMode, anomalyFlags: []
  });

  let res;
  try {
    res = await submitSwap("BUY", {
      cfg, tokenAddress: candidate.address, pairAddress: candidate.pairAddress,
      expectedPrice: candidate.entryPrice, positionSizeSol: cfg.positionSizeSol
    });
  } catch (err) {
    logError("submitSwap.BUY", err.message, { liveTradeId, symbol: candidate.symbol });
    writeLiveEvent({
      eventType: "EXECUTION_FAILURE", liveTradeId, timestamp: nowIso(),
      symbol: candidate.symbol, failureReason: "BUY_FAILED", failureDetail: err.message,
      anomalyFlags: ["EXECUTION_FAILURE"], status: "FAILED"
    });
    return null;
  }

  const entryLatencyMs = Date.now() - entryStart;
  const anomalyFlags = [];
  if (Math.abs(res.slippagePct) > Number(cfg.maxEntrySlippagePct || 3)) anomalyFlags.push("HIGH_ENTRY_SLIPPAGE");
  if (res.isDryRun) anomalyFlags.push("DRY_RUN");

  const entryPrice = res.filledPrice;
  const targetPrice = candidate.targetPrice || Number((entryPrice * TARGET_MULT).toFixed(12));
  const stopPrice   = candidate.stopPrice   || Number((entryPrice * STOP_MULT).toFixed(12));

  // Append entry event.
  writeLiveEvent({
    eventType: "ACTUAL_LIVE_ENTRY", liveTradeId, timestamp: nowIso(), entryTime: nowIso(),
    symbol: candidate.symbol, address: candidate.address, pairAddress: candidate.pairAddress,
    score: candidate.score, source: candidate.source, strategyVersion: cfg.strategyVersion,
    positionSizeSol: cfg.positionSizeSol,
    intendedEntryPrice: candidate.entryPrice, actualEntryPrice: entryPrice,
    entrySlippagePct: res.slippagePct, entryFeeSol: res.feeSol || 0,
    entryTxSig: res.txSig, entryLatencyMs, targetPrice, stopPrice,
    dryRun: !!res.isDryRun, anomalyFlags, status: "OPEN"
  });

  // Create position record.
  const positions = readPositions();
  positions.push({
    liveTradeId, symbol: candidate.symbol, name: candidate.name,
    address: candidate.address, pairAddress: candidate.pairAddress,
    score: candidate.score, source: candidate.source,
    positionSizeSol: cfg.positionSizeSol,
    entryTime: nowIso(), intendedEntryPrice: candidate.entryPrice, actualEntryPrice: entryPrice,
    entrySlippagePct: res.slippagePct, entryFeeSol: res.feeSol || 0,
    entryTxSig: res.txSig, entryLatencyMs, targetPrice, stopPrice,
    dryRun: !!res.isDryRun, anomalyFlags, status: "OPEN"
  });
  writePositions(positions);

  console.log(`[executor] ENTRY ${candidate.symbol} @ $${entryPrice} | ${res.isDryRun ? "DRY_RUN intent" : "txSig " + res.txSig} | latency ${entryLatencyMs}ms`);
  return liveTradeId;
}

// ─── Price polling for open positions ─────────────────────────────────────────

async function getCurrentPrice(pairAddress) {
  if (!axios) return null;
  try {
    const r = await axios.get(`${DEX}/latest/dex/pairs/solana/${pairAddress}`, { timeout: 8000 });
    const pairs = [r.data.pair, ...(r.data.pairs || [])].filter(Boolean);
    const pair = pairs.find(p => p.pairAddress?.toLowerCase() === pairAddress.toLowerCase());
    if (!pair) return null;
    return { price: Number(pair.priceUsd || 0), pairAddress: pair.pairAddress };
  } catch (err) {
    logError("getCurrentPrice", err.message, { pairAddress });
    return null;
  }
}

// ─── Exit ─────────────────────────────────────────────────────────────────────

// Exit by liveTradeId with an explicit trigger (used by monitor mirror and loop).
async function executeLiveExit(liveTradeId, trigger) {
  const exitStart = Date.now();
  let cfg;
  try { cfg = loadConfig(); } catch (err) { logError("exit.loadConfig", err.message, { liveTradeId }); throw err; }

  const positions = readPositions();
  const pos = positions.find(p => p.liveTradeId === liveTradeId && p.status === "OPEN");
  if (!pos) {
    // Idempotent: nothing open to exit.
    writeLiveEvent({ eventType: "EXIT_SKIPPED", liveTradeId, timestamp: nowIso(),
      reason: "No matching OPEN position", trigger: trigger && trigger.triggerType });
    return null;
  }

  writeLiveEvent({
    eventType: "INTENDED_LIVE_EXIT", liveTradeId, timestamp: nowIso(),
    triggerType: trigger.triggerType, triggerPrice: trigger.triggerPrice
  });

  let res;
  try {
    res = await submitSwap("SELL", {
      cfg, tokenAddress: pos.address, pairAddress: pos.pairAddress,
      expectedPrice: trigger.triggerPrice, positionSizeSol: pos.positionSizeSol
    });
  } catch (err) {
    logError("submitSwap.SELL", err.message, { liveTradeId, symbol: pos.symbol });
    writeLiveEvent({ eventType: "EXECUTION_FAILURE", liveTradeId, timestamp: nowIso(),
      symbol: pos.symbol, failureReason: "SELL_FAILED", failureDetail: err.message,
      anomalyFlags: ["EXECUTION_FAILURE"], status: "FAILED" });
    throw err;
  }

  const exitLatencyMs = Date.now() - exitStart;
  const exitPrice = res.filledPrice;
  const entryPrice = pos.actualEntryPrice || pos.intendedEntryPrice;
  const pos_ = pos.positionSizeSol;

  const grossPnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;
  const grossPnlSol = pos_ * (grossPnlPct / 100);
  const totalFeesSol = (pos.entryFeeSol || 0) + (res.feeSol || 0);
  const netPnlSol = grossPnlSol - totalFeesSol;

  const anomalyFlags = [...(pos.anomalyFlags || [])];
  if (Math.abs(res.slippagePct) > Number(cfg.maxEntrySlippagePct || 3)) anomalyFlags.push("HIGH_EXIT_SLIPPAGE");
  if (res.isDryRun) anomalyFlags.push("DRY_RUN");

  const status =
    trigger.triggerType === "TARGET"  ? "WIN" :
    trigger.triggerType === "STOP"    ? "LOSS" :
    trigger.triggerType === "TIMEOUT" ? "TIMEOUT" : "CLOSED";

  // Append exit + closed summary.
  writeLiveEvent({
    eventType: "ACTUAL_LIVE_EXIT", liveTradeId, timestamp: nowIso(), exitTime: nowIso(),
    symbol: pos.symbol, address: pos.address, pairAddress: pos.pairAddress,
    triggerType: trigger.triggerType, positionSizeSol: pos_,
    actualEntryPrice: entryPrice, actualExitPrice: exitPrice,
    exitSlippagePct: res.slippagePct, exitFeeSol: res.feeSol || 0, totalFeesSol,
    exitTxSig: res.txSig, exitLatencyMs,
    grossPnlPct: Number(grossPnlPct.toFixed(4)), grossPnlSol: Number(grossPnlSol.toFixed(6)),
    netPnlSol: Number(netPnlSol.toFixed(6)), dryRun: !!res.isDryRun, anomalyFlags, status
  });

  writeLiveEvent({
    eventType: "CLOSED_LIVE_TRADE", liveTradeId, timestamp: nowIso(),
    entryTime: pos.entryTime, exitTime: nowIso(),
    symbol: pos.symbol, address: pos.address, pairAddress: pos.pairAddress,
    positionSizeSol: pos_, actualEntryPrice: entryPrice, actualExitPrice: exitPrice,
    entrySlippagePct: pos.entrySlippagePct, exitSlippagePct: res.slippagePct,
    entryFeeSol: pos.entryFeeSol || 0, exitFeeSol: res.feeSol || 0, totalFeesSol,
    entryLatencyMs: pos.entryLatencyMs, exitLatencyMs,
    entryTxSig: pos.entryTxSig, exitTxSig: res.txSig,
    grossPnlPct: Number(grossPnlPct.toFixed(4)), netPnlSol: Number(netPnlSol.toFixed(6)),
    triggerType: trigger.triggerType, dryRun: !!res.isDryRun, anomalyFlags, status
  });

  // Remove from open positions.
  pos.status = status;
  pos.exitTime = nowIso();
  writePositions(positions.filter(p => p.liveTradeId !== liveTradeId));

  console.log(`[executor] EXIT ${pos.symbol} | ${status} | net ${netPnlSol.toFixed(4)} SOL | ${res.isDryRun ? "DRY_RUN" : "txSig " + res.txSig}`);

  // Daily stop notice.
  const stop = dailyStopHit(cfg);
  if (stop.hit) {
    writeLiveEvent({ eventType: "DAILY_STOP_TRIGGERED", timestamp: nowIso(), ...todayStats() });
    console.log("[executor] ⚠ DAILY STOP TRIGGERED — no new entries today.");
  }
  return status;
}

// Flag (do not sell) an open live position when paper monitor sees an anomaly.
function flagOpenLiveTradeAnomaly(address, reason) {
  const live = findOpenLiveTradeByAddress(address);
  if (!live) return null;
  return writeLiveEvent({
    eventType: "LIVE_ANOMALY_FLAGGED", liveTradeId: live.liveTradeId, timestamp: nowIso(),
    symbol: live.symbol, address: live.address, reason,
    anomalyFlags: ["NEEDS_REVIEW", "PAPER_ANOMALY_MIRRORED"],
    note: "Open live position NOT auto-exited — data anomalous. Manual review required."
  });
}

// ─── Manage open positions (poll + exit) ──────────────────────────────────────

async function manageOpenPositions(cfg) {
  for (const pos of openPositions()) {
    if (!pos.pairAddress) continue;

    // In dry run with no price feed we still time out stale positions.
    const ageMin = (Date.now() - new Date(pos.entryTime).getTime()) / 60000;
    const obs = await getCurrentPrice(pos.pairAddress);
    const price = obs && obs.price;

    if (price) {
      if (price >= pos.targetPrice) { await executeLiveExit(pos.liveTradeId, { triggerType: "TARGET", triggerPrice: price }); continue; }
      if (price <= pos.stopPrice) {
        const livePnl = ((price - (pos.actualEntryPrice || pos.intendedEntryPrice)) / (pos.actualEntryPrice || pos.intendedEntryPrice)) * 100;
        if (livePnl < -50) { flagOpenLiveTradeAnomaly(pos.address, `Implied loss ${livePnl.toFixed(1)}% worse than -50% threshold`); continue; }
        await executeLiveExit(pos.liveTradeId, { triggerType: "STOP", triggerPrice: price }); continue;
      }
    }
    if (ageMin >= TIMEOUT_MINUTES) {
      await executeLiveExit(pos.liveTradeId, { triggerType: "TIMEOUT", triggerPrice: price || pos.actualEntryPrice || pos.intendedEntryPrice });
    }
  }
}

// ─── One cycle ────────────────────────────────────────────────────────────────

async function runCycle() {
  let cfg;
  try { cfg = loadConfig(); }
  catch (err) { logError("runCycle.loadConfig", err.message); return { action: "CONFIG_ERROR", error: err.message }; }

  // Emergency halt: nothing at all.
  if (cfg.emergencyStop) return { action: "EMERGENCY_HALT" };

  // Exits ALWAYS run (even when stopped) — only emergency halts them.
  try { await manageOpenPositions(cfg); }
  catch (err) { logError("manageOpenPositions", err.message); }

  // Entries gated by automationEnabled + safety.
  if (!cfg.automationEnabled) return { action: "STOPPED_NO_ENTRIES" };

  const gate = safetyCheck(cfg);
  if (!gate.allowed) return { action: "BLOCKED", reasons: gate.reasons };

  const candidate = findEntryCandidate(cfg);
  if (!candidate) return { action: "NO_CANDIDATE" };

  try {
    const id = await enterPosition(cfg, candidate);
    return { action: id ? "ENTERED" : "ENTRY_ABORTED", liveTradeId: id, symbol: candidate.symbol };
  } catch (err) {
    logError("enterPosition", err.message, { symbol: candidate.symbol });
    return { action: "ENTRY_ERROR", error: err.message };
  }
}

// ─── Control functions (dashboard buttons call these) ─────────────────────────

function logControl(action, reason, extra = {}) {
  appendJsonl(CONTROL_EVENTS_FILE, { timestamp: nowIso(), action, reason, ...extra });
}

function readinessChecks(cfg = loadConfig()) {
  const checks = [];
  const add = (label, ok, detail = "") => checks.push({ label, ok, detail });

  add("Config loads", true);
  add("Not in emergency stop", !cfg.emergencyStop, cfg.emergencyStop ? "Run reset_live_safety.js" : "");
  add("Wallet address set", !!cfg.walletPublicAddress);
  add("Position size <= 0.10 SOL", Number(cfg.positionSizeSol) <= 0.10, `current ${cfg.positionSizeSol}`);
  add("Max open trades <= 1", Number(cfg.maxOpenTrades) <= 1);
  add("No compounding/averaging/martingale",
      !cfg.compoundingEnabled && !cfg.averagingDownEnabled && !cfg.martingaleEnabled);
  add("Daily stop not already hit", !dailyStopHit(cfg).hit);
  add("live_trades.jsonl valid", readLiveTrades().every(e => !e._parseError));
  add("Dry run mode ON (Phase 1)", cfg.dryRunMode === true,
      cfg.dryRunMode ? "" : "WARNING: dry run is OFF");
  const open = openPositions();
  add("Open positions within limit", open.length <= (cfg.maxOpenTrades || 1), `${open.length} open`);

  return { allPassed: checks.every(c => c.ok), checks };
}

function startAutomation(reason = "Manual START from dashboard") {
  const cfg = loadConfig();
  if (cfg.emergencyStop) {
    logControl("START_REJECTED", "Emergency stop active");
    return { ok: false, error: "Emergency stop is active — clear it with reset_live_safety.js first." };
  }
  const readiness = readinessChecks(cfg);
  if (!readiness.allPassed) {
    const failed = readiness.checks.filter(c => !c.ok).map(c => c.label);
    logControl("START_REJECTED", "Readiness failed", { failed });
    return { ok: false, error: `Readiness checks failed: ${failed.join(", ")}`, readiness };
  }
  cfg.automationEnabled = true;
  cfg.lastAutomationToggleAt = nowIso();
  cfg.lastAutomationToggleReason = reason;
  saveConfig(cfg);
  logControl("START", reason, { dryRunMode: cfg.dryRunMode });
  return { ok: true, dryRunMode: cfg.dryRunMode };
}

function stopAutomation(reason = "Manual STOP from dashboard") {
  const cfg = loadConfig();
  cfg.automationEnabled = false; // entries off; exits continue
  cfg.lastAutomationToggleAt = nowIso();
  cfg.lastAutomationToggleReason = reason;
  saveConfig(cfg);
  logControl("STOP", reason);
  return { ok: true, note: "New entries disabled. Open positions will still be exited by the loop." };
}

function emergencyStopControl(reason = "Manual EMERGENCY STOP from dashboard") {
  const cfg = loadConfig();
  cfg.automationEnabled = false;
  cfg.emergencyStop = true;
  cfg.lastAutomationToggleAt = nowIso();
  cfg.lastAutomationToggleReason = reason;
  saveConfig(cfg);
  logControl("EMERGENCY_STOP", reason);
  writeLiveEvent({ eventType: "KILL_SWITCH_ACTIVATED", timestamp: nowIso(), reason, anomalyFlags: ["KILL_SWITCH"] });
  return { ok: true };
}

// ─── Stats (dashboard) ────────────────────────────────────────────────────────

function readLiveTrades() { return readJsonl(LIVE_TRADES_FILE); }

function liveStats() {
  const cfg = (() => { try { return loadConfig(); } catch { return {}; } })();
  const closed = closedTrades();
  const wins = closed.filter(t => t.status === "WIN").length;
  const losses = closed.filter(t => t.status === "LOSS").length;
  const timeouts = closed.filter(t => t.status === "TIMEOUT").length;
  const open = openPositions();

  const pnls = closed.map(t => Number(t.netPnlSol)).filter(Number.isFinite);
  const totalNetPnlSol = pnls.reduce((s, v) => s + v, 0);
  const avgPnlSol = pnls.length ? totalNetPnlSol / pnls.length : 0;
  const grossWins = pnls.filter(v => v > 0).reduce((s, v) => s + v, 0);
  const grossLoss = Math.abs(pnls.filter(v => v < 0).reduce((s, v) => s + v, 0));
  const profitFactor = grossLoss > 0 ? grossWins / grossLoss : null;

  let equity = 0, peak = 0, maxDd = 0;
  for (const p of pnls) { equity += p; peak = Math.max(peak, equity); maxDd = Math.max(maxDd, peak - equity); }
  const maxDrawdownPct = peak > 0 ? (maxDd / peak) * 100 : 0;

  const slips = [];
  for (const t of closed) {
    if (Number.isFinite(Number(t.entrySlippagePct))) slips.push(Math.abs(Number(t.entrySlippagePct)));
    if (Number.isFinite(Number(t.exitSlippagePct)))  slips.push(Math.abs(Number(t.exitSlippagePct)));
  }
  const avgSlippage = slips.length ? slips.reduce((s, v) => s + v, 0) / slips.length : 0;
  const maxSlippage = slips.length ? Math.max(...slips) : 0;
  const entrySlips = closed.map(t => Math.abs(Number(t.entrySlippagePct))).filter(Number.isFinite);
  const exitSlips  = closed.map(t => Math.abs(Number(t.exitSlippagePct))).filter(Number.isFinite);
  const avgEntrySlip = entrySlips.length ? entrySlips.reduce((s, v) => s + v, 0) / entrySlips.length : 0;
  const avgExitSlip  = exitSlips.length ? exitSlips.reduce((s, v) => s + v, 0) / exitSlips.length : 0;
  const totalFeesSol = closed.reduce((s, t) => s + Number(t.totalFeesSol || 0), 0);
  const lats = closed.map(t => Number(t.exitLatencyMs)).filter(Number.isFinite);
  const avgLatency = lats.length ? lats.reduce((s, v) => s + v, 0) / lats.length : 0;

  // Paper comparison (gmgn_v4 closed).
  const paperClosed = readPaperTrades().filter(t =>
    ["WIN", "LOSS", "TIMEOUT"].includes(t.status) &&
    Number.isFinite(Number(t.pnlPercent)) && t.strategyVersion === "gmgn_v4");
  const paperPnls = paperClosed.map(t => Number(t.pnlPercent));
  const paperAvg = paperPnls.length ? paperPnls.reduce((s, v) => s + v, 0) / paperPnls.length : null;
  const liveAvgPct = closed.length
    ? closed.map(t => Number(t.grossPnlPct || 0)).filter(Number.isFinite).reduce((s, v) => s + v, 0) / closed.length
    : null;
  let edgeScore = null;
  if (paperAvg && liveAvgPct !== null && paperAvg !== 0) edgeScore = Math.round((liveAvgPct / paperAvg) * 100);

  const daily = todayStats();
  const stop = dailyStopHit(cfg, daily);
  const parseErrors = readLiveTrades().filter(e => e._parseError).length;

  return {
    totalLiveTrades: closed.length, openTrades: open.length,
    wins, losses, timeouts,
    winRate: closed.length ? ((wins / closed.length) * 100).toFixed(1) : null,
    totalNetPnlSol: Number(totalNetPnlSol.toFixed(6)), avgPnlSol: Number(avgPnlSol.toFixed(6)),
    profitFactor: profitFactor !== null ? Number(profitFactor.toFixed(3)) : null,
    maxDrawdownSol: Number(maxDd.toFixed(6)),
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    avgSlippagePct: Number(avgSlippage.toFixed(3)),
    maxSlippagePct: Number(maxSlippage.toFixed(3)),
    avgEntrySlippagePct: Number(avgEntrySlip.toFixed(3)),
    avgExitSlippagePct: Number(avgExitSlip.toFixed(3)),
    totalFeesSol: Number(totalFeesSol.toFixed(6)),
    avgExitLatencyMs: Math.round(avgLatency),
    edgePreservationScore: edgeScore,
    paperTradesCount: paperClosed.length,
    paperAvgPnlPct: paperAvg !== null ? Number(paperAvg.toFixed(2)) : null,
    liveAvgPnlPct: liveAvgPct !== null ? Number(liveAvgPct.toFixed(2)) : null,
    dailyStopActive: stop.hit, lossesToday: daily.lossesToday,
    realizedPnlSolToday: Number(daily.realizedPnlSol.toFixed(6)),
    parseErrors,
    config: {
      automationEnabled: cfg.automationEnabled, dryRunMode: cfg.dryRunMode,
      emergencyStop: cfg.emergencyStop, positionSizeSol: cfg.positionSizeSol,
      maxDailyLossSol: cfg.maxDailyLossSol, maxDailyLossCount: cfg.maxDailyLossCount,
      maxDrawdownPercent: cfg.maxDrawdownPercent, walletPublicAddress: cfg.walletPublicAddress || null,
      lastAutomationToggleAt: cfg.lastAutomationToggleAt, lastAutomationToggleReason: cfg.lastAutomationToggleReason,
      lastError: cfg.lastError
    }
  };
}

// ─── Backward-compat alias for monitor mirror from prior turn ─────────────────
const groupLiveTrades = readLiveTrades;

// ─── Autonomous loop ──────────────────────────────────────────────────────────

async function autonomousLoop(intervalMs = 60000) {
  console.log(`[executor] Autonomous loop starting. Cycle every ${intervalMs / 1000}s.`);
  console.log("[executor] Reminder: this respects automationEnabled, emergencyStop, dailyStop, and dryRunMode every cycle.");
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const cfg = loadConfig();
      const result = await runCycle();
      const banner = cfg.dryRunMode ? "DRY RUN" : "LIVE";
      console.log(`[executor] [${banner}] cycle: ${result.action}${result.reasons ? " — " + result.reasons.join("; ") : ""}`);
    } catch (err) {
      logError("autonomousLoop", err.message);
      console.error("[executor] cycle error:", err.message);
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === "--loop") {
    autonomousLoop();
  } else if (arg === "--cycle") {
    runCycle().then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); });
  } else {
    // Default: status only, no execution.
    try {
      const cfg = loadConfig();
      console.log("[executor] Status (no execution).");
      console.log("  dryRunMode:", cfg.dryRunMode, "| automationEnabled:", cfg.automationEnabled, "| emergencyStop:", cfg.emergencyStop);
      const gate = safetyCheck(cfg);
      console.log("  Entries allowed:", gate.allowed, gate.allowed ? "" : "— " + gate.reasons.join("; "));
      const r = readinessChecks(cfg);
      console.log("  Readiness:", r.allPassed ? "ALL PASS" : "FAILS: " + r.checks.filter(c => !c.ok).map(c => c.label).join(", "));
      console.log("\nUsage: node live_executor.js [--loop | --cycle]");
    } catch (err) {
      console.error("[executor] error:", err.message);
      process.exit(1);
    }
  }
}

module.exports = {
  // lifecycle
  runCycle, autonomousLoop, manageOpenPositions,
  enterPosition, executeLiveExit, flagOpenLiveTradeAnomaly,
  findEntryCandidate, matchesPhase1Thesis,
  // controls
  startAutomation, stopAutomation, emergencyStopControl, readinessChecks,
  // data / stats
  loadConfig, saveConfig, liveStats, safetyCheck, todayStats, dailyStopHit,
  readLiveTrades, readPositions, openPositions, findOpenLiveTradeByAddress,
  groupLiveTrades, getWalletBalanceSol, writeLiveEvent, logControl,
  // meta
  EXECUTOR_VERSION, PHASE,
  FILES: { LIVE_TRADES_FILE, LIVE_POSITIONS_FILE, CONTROL_EVENTS_FILE, ERRORS_FILE }
};
