"use strict";

// live_positions_store.js — Sprint 4 R4
// Atomic read/write for live_positions.json (executor-owned live position snapshot).
//
// Production on-disk shape: JSON array of position objects (legacy format preserved).
//   serialize → temp file → fsync → re-parse validate → atomic rename → cleanup-on-error
//
// No strategy logic, no policy gates, no live actions. Integrity and durability only.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MAX_POSITIONS = 1_000;

const DEFAULT_RUNTIME_ROOT = process.env.TRACKTA_RUNTIME_ROOT
  ? path.resolve(process.env.TRACKTA_RUNTIME_ROOT)
  : __dirname;

const DEFAULT_POSITIONS_FILE = path.join(DEFAULT_RUNTIME_ROOT, "live_positions.json");

function createDefaultLivePositionsState() {
  return [];
}

function getLivePositionsPath(file) {
  return file || DEFAULT_POSITIONS_FILE;
}

function normalizeLoadedState(parsed) {
  if (!Array.isArray(parsed)) {
    return createDefaultLivePositionsState();
  }
  return parsed.filter(entry => entry && typeof entry === "object" && !Array.isArray(entry));
}

function validatePositionEntry(entry, index) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { ok: false, reason: `positions[${index}] must be a plain object` };
  }
  if (entry.liveTradeId !== undefined &&
      (typeof entry.liveTradeId !== "string" || !entry.liveTradeId)) {
    return { ok: false, reason: `positions[${index}].liveTradeId must be a non-empty string when present` };
  }
  if (entry.status !== undefined && typeof entry.status !== "string") {
    return { ok: false, reason: `positions[${index}].status must be a string when present` };
  }
  if (entry.address !== undefined && typeof entry.address !== "string") {
    return { ok: false, reason: `positions[${index}].address must be a string when present` };
  }
  if (entry.pairAddress !== undefined && typeof entry.pairAddress !== "string") {
    return { ok: false, reason: `positions[${index}].pairAddress must be a string when present` };
  }
  if (entry.symbol !== undefined && typeof entry.symbol !== "string") {
    return { ok: false, reason: `positions[${index}].symbol must be a string when present` };
  }
  if (entry.dryRun !== undefined && typeof entry.dryRun !== "boolean") {
    return { ok: false, reason: `positions[${index}].dryRun must be a boolean when present` };
  }
  if (entry.anomalyFlags !== undefined) {
    if (!Array.isArray(entry.anomalyFlags)) {
      return { ok: false, reason: `positions[${index}].anomalyFlags must be an array when present` };
    }
    for (const flag of entry.anomalyFlags) {
      if (typeof flag !== "string") {
        return { ok: false, reason: `positions[${index}].anomalyFlags must contain strings` };
      }
    }
  }
  for (const field of [
    "positionSizeSol", "intendedEntryPrice", "actualEntryPrice", "targetPrice", "stopPrice",
    "entrySlippagePct", "entryFeeSol", "entryLatencyMs", "score"
  ]) {
    if (entry[field] !== undefined && entry[field] !== null && !Number.isFinite(Number(entry[field]))) {
      return { ok: false, reason: `positions[${index}].${field} must be a finite number or null when present` };
    }
  }
  return { ok: true };
}

function validateLivePositionsState(state) {
  if (!Array.isArray(state)) {
    return { ok: false, reason: "root must be a JSON array" };
  }
  if (state.length > MAX_POSITIONS) {
    return { ok: false, reason: "positions array exceeds max size" };
  }
  for (let i = 0; i < state.length; i += 1) {
    const entryCheck = validatePositionEntry(state[i], i);
    if (!entryCheck.ok) return entryCheck;
  }
  return { ok: true };
}

function serializeLivePositionsState(state) {
  return `${JSON.stringify(state, null, 2)}\n`;
}

function loadLivePositionsState(file, options = {}) {
  const target = getLivePositionsPath(file);
  if (!fs.existsSync(target)) {
    return createDefaultLivePositionsState();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8"));
    return normalizeLoadedState(parsed);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (typeof options.onWarn === "function") {
      options.onWarn(msg);
    }
    return createDefaultLivePositionsState();
  }
}

function writeLivePositionsStateAtomic(state, file) {
  const target = getLivePositionsPath(file);
  const validation = validateLivePositionsState(state);
  if (!validation.ok) {
    throw new Error(`live_positions validation failed: ${validation.reason}`);
  }

  const dir = path.dirname(target);
  const base = path.basename(target);
  const tmp = path.join(dir, `${base}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`);
  const data = serializeLivePositionsState(state);

  let fd = null;
  try {
    fd = fs.openSync(tmp, "w");
    fs.writeSync(fd, data);
    try {
      fs.fsyncSync(fd);
    } catch {
      // fsync may be unsupported on some filesystems; durability is best-effort.
    }
    fs.closeSync(fd);
    fd = null;

    const verify = JSON.parse(fs.readFileSync(tmp, "utf8"));
    const revalidation = validateLivePositionsState(verify);
    if (!revalidation.ok) {
      throw new Error(`live_positions temp validation failed: ${revalidation.reason}`);
    }

    fs.renameSync(tmp, target);
  } catch (err) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* ignore */ }
    }
    try { if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
    throw err;
  }
}

function updateLivePositionsState(updater, file) {
  const target = getLivePositionsPath(file);
  const current = loadLivePositionsState(target);
  const next = typeof updater === "function" ? (updater(current) || current) : current;
  const nextState = Array.isArray(next) ? [...next] : [...current];
  writeLivePositionsStateAtomic(nextState, target);
  return normalizeLoadedState(nextState);
}

module.exports = {
  getLivePositionsPath,
  createDefaultLivePositionsState,
  loadLivePositionsState,
  validateLivePositionsState,
  writeLivePositionsStateAtomic,
  updateLivePositionsState
};
