"use strict";

// paper_positions_store.js — Sprint 4 A1a
// Shared, single-source helper for the paper-trade ownership split.
//
//   paper_trades.json     → scanner-owned, APPEND-ONLY entry/research ledger (never mutated here)
//   paper_positions.json  → monitor-owned, MUTABLE lifecycle store (single writer: monitor)
//
// This module performs NO strategy logic, NO exits, NO live actions. It only reads
// the ledger, reads/writes the lifecycle store, and produces a merged read view so
// existing readers (scanner cooldowns, dashboard metrics) stay behavior-compatible.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PAPER_FILE = path.join(ROOT, "paper_trades.json");
const POSITIONS_FILE = path.join(ROOT, "paper_positions.json");
const STORE_VERSION = "paper_positions_v1";

// Fields the monitor owns/mutates over a paper trade's lifecycle. Entry/research
// fields (score, liquidity, entryPrice, thesisMatch, …) stay ONLY in the ledger.
const LIFECYCLE_FIELDS = [
  "status", "triggerType", "triggerPrice", "exitPrice", "pnlPercent", "closedAt",
  "anomalyReason", "observedPrice", "observedPairAddress", "anomalyTimestamp", "monitorVersion"
];

// Deterministic join key. Identical formula to scanner candidateIntentId.
function entryIdOf(row) {
  return [row.timestamp, row.address || "unknown-address", row.pairAddress || "unknown-pair"].join("_");
}

function readLedger(file = PAPER_FILE) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

// Returns the positions map { [entryId]: row }, or null when the store is MISSING
// (callers use null to trigger the legacy ledger-only fallback).
function readPositions(file = POSITIONS_FILE) {
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed && parsed.positions && typeof parsed.positions === "object") return parsed.positions;
    return {};
  } catch {
    return {};
  }
}

// Atomic replace (temp file + rename). This is the paper lifecycle store only —
// NOT live_config.json (that atomicity work is A1b).
function writePositions(positions, file = POSITIONS_FILE) {
  const payload = { version: STORE_VERSION, updatedAt: new Date().toISOString(), positions: positions || {} };
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function extractLifecycle(row) {
  const lc = {};
  for (const f of LIFECYCLE_FIELDS) {
    if (row[f] !== undefined) lc[f] = row[f];
  }
  if (!lc.status) lc.status = "OPEN";
  return lc;
}

function buildPositionRow(ledgerRow, updatedAt) {
  const id = entryIdOf(ledgerRow);
  return {
    entryId: id,
    address: ledgerRow.address,
    pairAddress: ledgerRow.pairAddress,
    symbol: ledgerRow.symbol,
    ...extractLifecycle(ledgerRow),
    updatedAt: updatedAt || ledgerRow.closedAt || ledgerRow.anomalyTimestamp || ledgerRow.timestamp
  };
}

// Build a positions map from the existing ledger, preserving whatever lifecycle
// state each historical row already carries (closed outcomes are NOT lost).
function seedPositionsFromLedger(ledger = readLedger()) {
  const positions = {};
  for (const row of ledger) {
    positions[entryIdOf(row)] = buildPositionRow(row);
  }
  return positions;
}

// Idempotent: if the store is missing, seed it from the ledger and persist.
// Returns the positions map either way. Never overwrites an existing store.
function ensureSeeded() {
  let positions = readPositions();
  if (positions === null) {
    positions = seedPositionsFromLedger();
    writePositions(positions);
  }
  return positions;
}

// Merged read view: ledger entry/research rows with lifecycle overlaid from the
// store. When the store is missing OR has no row for an entry, the ledger row's
// own (entry-time) lifecycle is used — identical to pre-A1a behavior.
function mergedRows() {
  const ledger = readLedger();
  const positions = readPositions();
  return ledger.map(row => {
    const overlay = positions ? positions[entryIdOf(row)] : null;
    if (!overlay) return row;
    const merged = { ...row };
    for (const f of LIFECYCLE_FIELDS) {
      if (overlay[f] !== undefined) merged[f] = overlay[f];
    }
    return merged;
  });
}

module.exports = {
  PAPER_FILE,
  POSITIONS_FILE,
  STORE_VERSION,
  LIFECYCLE_FIELDS,
  entryIdOf,
  readLedger,
  readPositions,
  writePositions,
  extractLifecycle,
  buildPositionRow,
  seedPositionsFromLedger,
  ensureSeeded,
  mergedRows
};
