// wallet_monitor.js
// 3rd Floor Labz — READ-ONLY wallet monitor.
//
// SAFETY: This file is incapable of moving funds. It only performs RPC reads
//   (getBalance). It imports no signer, reads no private key, builds no
//   transaction, and has no code path that could submit one. Its sole job is
//   to observe the dedicated Phase 1 wallet and report status to the dashboard.
//
// Every 30s:  read balance, measure latency, write wallet_status.json
// Every 30m:  append a snapshot to wallet_history.jsonl
//
// Usage:
//   node wallet_monitor.js          run the loop (30s balance, 30m history)
//   node wallet_monitor.js --once   single read, write status, exit

"use strict";

const fs   = require("fs");
const path = require("path");

const ROOT          = __dirname;
const CONFIG_FILE   = path.join(ROOT, "live_config.json");
const STATUS_FILE   = path.join(ROOT, "wallet_status.json");
const HISTORY_FILE  = path.join(ROOT, "wallet_history.jsonl");
const RPC_HEALTH_FILE = path.join(ROOT, "rpc_health.json");

const BALANCE_INTERVAL_MS = 30 * 1000;       // 30 seconds
const HISTORY_INTERVAL_MS = 30 * 60 * 1000;  // 30 minutes
const RPC_TIMEOUT_MS = 8000;

// In-process RPC health stats (also persisted to rpc_health.json).
const health = {
  pings: 0,
  failures: 0,
  latencies: [],          // recent latencies (capped)
  lastSuccessfulPing: null,
  lastFailureAt: null
};
const MAX_LATENCY_SAMPLES = 500;
const runtime = {
  interval: null,
  activeController: null,
  tickInProgress: false,
  shuttingDown: false
};

function nowIso() { return new Date().toISOString(); }

function gracefulShutdown({ abortActiveRequest = true } = {}) {
  if (runtime.shuttingDown) return;
  runtime.shuttingDown = true;

  if (runtime.interval) {
    clearInterval(runtime.interval);
    runtime.interval = null;
  }

  if (abortActiveRequest && runtime.activeController && !runtime.activeController.signal.aborted) {
    runtime.activeController.abort();
  }
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) throw new Error(`live_config.json not found at ${CONFIG_FILE}`);
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
}

function getRpcUrl() {
  // Helius if provided via env, else public Solana RPC. Reads only.
  if (process.env.HELIUS_RPC_URL) return process.env.HELIUS_RPC_URL;
  if (process.env.HELIUS_API_KEY) return `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  if (process.env.SOLANA_RPC_URL) return process.env.SOLANA_RPC_URL;
  return "https://api.mainnet-beta.solana.com";
}

// Read-only balance query. Returns { ok, balanceSol, latencyMs, error }.
async function queryBalance(address) {
  const rpc = getRpcUrl();
  const start = Date.now();
  let timer = null;
  let controller = null;

  if (typeof fetch !== "function") {
    return { ok: false, balanceSol: null, latencyMs: null, error: "fetch unavailable (Node 18+ required)" };
  }

  try {
    controller = new AbortController();
    runtime.activeController = controller;
    timer = setTimeout(() => {
      if (!controller.signal.aborted) controller.abort();
    }, RPC_TIMEOUT_MS);
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // getBalance is a READ-ONLY method. No signing, no transaction.
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
      signal: controller.signal
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      await res.arrayBuffer().catch(() => {});
      return { ok: false, balanceSol: null, latencyMs, error: `HTTP ${res.status}` };
    }

    const json = await res.json();
    if (json.error) {
      return { ok: false, balanceSol: null, latencyMs, error: json.error.message || "RPC error" };
    }

    const lamports = json && json.result && json.result.value;
    if (!Number.isFinite(lamports)) {
      return { ok: false, balanceSol: null, latencyMs, error: "Malformed balance response" };
    }

    return { ok: true, balanceSol: lamports / 1e9, latencyMs, error: null };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const reason = err.name === "AbortError" ? `timeout after ${RPC_TIMEOUT_MS}ms` : err.message;
    return { ok: false, balanceSol: null, latencyMs, error: reason };
  } finally {
    if (timer) clearTimeout(timer);
    if (runtime.activeController === controller) runtime.activeController = null;
  }
}

function recordHealth(result) {
  health.pings += 1;
  if (result.ok) {
    health.lastSuccessfulPing = nowIso();
    if (Number.isFinite(result.latencyMs)) {
      health.latencies.push(result.latencyMs);
      if (health.latencies.length > MAX_LATENCY_SAMPLES) health.latencies.shift();
    }
  } else {
    health.failures += 1;
    health.lastFailureAt = nowIso();
  }

  const lat = health.latencies;
  const summary = {
    pings: health.pings,
    failures: health.failures,
    avgLatencyMs: lat.length ? Math.round(lat.reduce((s, v) => s + v, 0) / lat.length) : null,
    worstLatencyMs: lat.length ? Math.max(...lat) : null,
    bestLatencyMs: lat.length ? Math.min(...lat) : null,
    lastSuccessfulPing: health.lastSuccessfulPing,
    lastFailureAt: health.lastFailureAt,
    updatedAt: nowIso()
  };
  try { fs.writeFileSync(RPC_HEALTH_FILE, JSON.stringify(summary, null, 2) + "\n"); } catch { /* best-effort */ }
  return summary;
}

function writeStatus(address, result) {
  const status = {
    connected: result.ok,
    walletAddress: address,
    balanceSol: result.ok ? Number(result.balanceSol.toFixed(6)) : null,
    latencyMs: result.latencyMs,
    updatedAt: nowIso(),
    ...(result.ok ? {} : { error: result.error })
  };
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2) + "\n");
  return status;
}

function appendHistory(address, result) {
  const snapshot = {
    timestamp: nowIso(),
    walletAddress: address,
    balanceSol: result.ok ? Number(result.balanceSol.toFixed(6)) : null,
    connected: result.ok,
    latencyMs: result.latencyMs
  };
  fs.appendFileSync(HISTORY_FILE, JSON.stringify(snapshot) + "\n");
  return snapshot;
}

async function tick(address, { writeHistory = false } = {}) {
  if (runtime.tickInProgress) return null;
  runtime.tickInProgress = true;
  try {
  const result = await queryBalance(address);
  const status = writeStatus(address, result);
  const healthSummary = recordHealth(result);
  if (writeHistory) appendHistory(address, result);

  const tag = result.ok
    ? `connected | ${status.balanceSol} SOL | ${result.latencyMs}ms`
    : `DISCONNECTED | ${result.error}`;
  console.log(`[wallet_monitor] ${nowIso()} | ${tag}`);
  return { status, healthSummary };
  } finally {
    runtime.tickInProgress = false;
  }
}

async function runLoop() {
  const cfg = loadConfig();
  const address = cfg.walletPublicAddress;
  if (!address) {
    throw new Error("No walletPublicAddress in live_config.json. Aborting.");
  }

  console.log("[wallet_monitor] READ-ONLY monitor starting.");
  console.log(`[wallet_monitor] Wallet: ${address}`);
  console.log(`[wallet_monitor] RPC: ${getRpcUrl().replace(/api-key=[^&]+/, "api-key=***")}`);
  console.log("[wallet_monitor] This process cannot submit transactions. getBalance reads only.\n");

  // First tick writes both status and a history snapshot.
  await tick(address, { writeHistory: true });
  let lastHistory = Date.now();

  runtime.interval = setInterval(async () => {
    if (runtime.shuttingDown) return;
    const writeHistory = Date.now() - lastHistory >= HISTORY_INTERVAL_MS;
    if (writeHistory) lastHistory = Date.now();
    try { await tick(address, { writeHistory }); }
    catch (err) { console.error("[wallet_monitor] tick error:", err.message); }
  }, BALANCE_INTERVAL_MS);
}

async function runOnce() {
  const cfg = loadConfig();
  const address = cfg.walletPublicAddress;
  if (!address) throw new Error("No walletPublicAddress in config.");

  await tick(address);
  gracefulShutdown({ abortActiveRequest: false });
}

if (require.main === module) {
  const once = process.argv.includes("--once");
  if (once) {
    runOnce().catch(err => {
      console.error("[wallet_monitor] --once failed:", err.message);
      gracefulShutdown();
      process.exitCode = 1;
    });
  } else {
    process.once("SIGINT", () => gracefulShutdown());
    process.once("SIGTERM", () => gracefulShutdown());
    runLoop().catch(err => {
      console.error("[wallet_monitor] fatal error:", err.message);
      gracefulShutdown();
      process.exitCode = 1;
    });
  }
}

module.exports = { queryBalance, writeStatus, appendHistory, recordHealth, getRpcUrl, loadConfig, gracefulShutdown, runOnce };
