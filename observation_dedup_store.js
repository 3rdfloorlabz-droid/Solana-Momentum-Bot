"use strict";

// observation_dedup_store.js — Sprint 4 R3
// Atomic read/write for observation_dedup.json (executor-owned dedup snapshot).
//
//   serialize → temp file → fsync → re-parse validate → atomic rename → cleanup-on-error
//
// No strategy logic, no policy gates, no live actions. Integrity and durability only.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SCHEMA_VERSION = 1;
const MAX_OBSERVED_KEYS = 100_000;
const MAX_PAIR_ENTRIES = 100_000;

const DEFAULT_RUNTIME_ROOT = process.env.TRACKTA_RUNTIME_ROOT
  ? path.resolve(process.env.TRACKTA_RUNTIME_ROOT)
  : __dirname;

const DEFAULT_DEDUP_FILE = path.join(DEFAULT_RUNTIME_ROOT, "observation_dedup.json");

function emptyNormalizedState() {
  return { observedKeys: [], pairLastObservedMs: {} };
}

function getObservationDedupPath(file) {
  return file || DEFAULT_DEDUP_FILE;
}

function normalizeLoadedState(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return emptyNormalizedState();
  }
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    return emptyNormalizedState();
  }
  const observedKeys = Array.isArray(parsed.observedKeys)
    ? parsed.observedKeys.filter(key => typeof key === "string" && key)
    : [];
  const pairLastObservedMs = {};
  if (parsed.pairLastObservedMs &&
      typeof parsed.pairLastObservedMs === "object" &&
      !Array.isArray(parsed.pairLastObservedMs)) {
    for (const [pairKey, timestampMs] of Object.entries(parsed.pairLastObservedMs)) {
      if (typeof pairKey === "string" && pairKey && Number.isFinite(Number(timestampMs))) {
        pairLastObservedMs[pairKey] = Number(timestampMs);
      }
    }
  }
  return { observedKeys, pairLastObservedMs };
}

function validateObservationDedupState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return { ok: false, reason: "root must be a plain object" };
  }
  if (state.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, reason: `schemaVersion must be ${SCHEMA_VERSION}` };
  }
  if (!Array.isArray(state.observedKeys)) {
    return { ok: false, reason: "observedKeys must be an array" };
  }
  if (state.observedKeys.length > MAX_OBSERVED_KEYS) {
    return { ok: false, reason: "observedKeys exceeds max size" };
  }
  for (const key of state.observedKeys) {
    if (typeof key !== "string" || !key) {
      return { ok: false, reason: "observedKeys must contain non-empty strings" };
    }
  }
  const pairs = state.pairLastObservedMs;
  if (pairs !== undefined && (typeof pairs !== "object" || pairs === null || Array.isArray(pairs))) {
    return { ok: false, reason: "pairLastObservedMs must be an object" };
  }
  if (pairs) {
    const entries = Object.entries(pairs);
    if (entries.length > MAX_PAIR_ENTRIES) {
      return { ok: false, reason: "pairLastObservedMs exceeds max size" };
    }
    for (const [pairKey, timestampMs] of entries) {
      if (typeof pairKey !== "string" || !pairKey) {
        return { ok: false, reason: "pairLastObservedMs keys must be non-empty strings" };
      }
      if (!Number.isFinite(Number(timestampMs))) {
        return { ok: false, reason: "pairLastObservedMs values must be finite numbers" };
      }
    }
  }
  if (state.updatedAt !== undefined && typeof state.updatedAt !== "string") {
    return { ok: false, reason: "updatedAt must be a string when present" };
  }
  return { ok: true };
}

function serializeObservationDedupState(state) {
  return `${JSON.stringify(state, null, 2)}\n`;
}

function loadObservationDedupState(file, options = {}) {
  const target = getObservationDedupPath(file);
  if (!fs.existsSync(target)) {
    return emptyNormalizedState();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8"));
    return normalizeLoadedState(parsed);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (typeof options.onWarn === "function") {
      options.onWarn(msg);
    }
    return emptyNormalizedState();
  }
}

function writeObservationDedupStateAtomic(state, file) {
  const target = getObservationDedupPath(file);
  const validation = validateObservationDedupState(state);
  if (!validation.ok) {
    throw new Error(`observation_dedup validation failed: ${validation.reason}`);
  }

  const dir = path.dirname(target);
  const base = path.basename(target);
  const tmp = path.join(dir, `${base}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`);
  const data = serializeObservationDedupState(state);

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
    const revalidation = validateObservationDedupState(verify);
    if (!revalidation.ok) {
      throw new Error(`observation_dedup temp validation failed: ${revalidation.reason}`);
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

function updateObservationDedupState(updater, file) {
  const target = getObservationDedupPath(file);
  const current = loadObservationDedupState(target);
  const nextNormalized = typeof updater === "function" ? (updater(current) || current) : current;
  const nextPayload = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    observedKeys: Array.isArray(nextNormalized.observedKeys)
      ? [...nextNormalized.observedKeys]
      : [...current.observedKeys],
    pairLastObservedMs: nextNormalized.pairLastObservedMs &&
        typeof nextNormalized.pairLastObservedMs === "object" &&
        !Array.isArray(nextNormalized.pairLastObservedMs)
      ? { ...nextNormalized.pairLastObservedMs }
      : { ...current.pairLastObservedMs }
  };
  writeObservationDedupStateAtomic(nextPayload, target);
  return normalizeLoadedState(nextPayload);
}

module.exports = {
  getObservationDedupPath,
  loadObservationDedupState,
  validateObservationDedupState,
  writeObservationDedupStateAtomic,
  updateObservationDedupState
};
