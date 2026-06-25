"use strict";

// executor_singleton_guard.js — Sprint 4 R5
// JSON lock file to prevent duplicate live_executor --loop instances on shared runtime state.
//
//   acquire → refresh (each cycle) → release (clean exit)
//
// No process killing, no shell execution, no live actions. Process ownership only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const SCHEMA_VERSION = 1;
const LOCK_FILE_NAME = "executor_singleton.lock.json";
const STALE_TTL_MS = 3 * 60 * 1000;

const DEFAULT_RUNTIME_ROOT = process.env.TRACKTA_RUNTIME_ROOT
  ? path.resolve(process.env.TRACKTA_RUNTIME_ROOT)
  : __dirname;

const DEFAULT_LOCK_FILE = path.join(DEFAULT_RUNTIME_ROOT, LOCK_FILE_NAME);

function getExecutorLockPath(file) {
  return file || DEFAULT_LOCK_FILE;
}

function createExecutorInstanceId() {
  return `${process.pid}-${crypto.randomBytes(8).toString("hex")}-${Date.now()}`;
}

function validateExecutorLock(lock) {
  if (!lock || typeof lock !== "object" || Array.isArray(lock)) {
    return { ok: false, reason: "root must be a plain object" };
  }
  if (lock.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, reason: `schemaVersion must be ${SCHEMA_VERSION}` };
  }
  if (typeof lock.instanceId !== "string" || !lock.instanceId) {
    return { ok: false, reason: "instanceId must be a non-empty string" };
  }
  if (lock.pid !== undefined && lock.pid !== null) {
    if (!Number.isFinite(Number(lock.pid)) || Number(lock.pid) <= 0) {
      return { ok: false, reason: "pid must be a finite positive integer or null" };
    }
  }
  if (typeof lock.startedAt !== "string" || !lock.startedAt) {
    return { ok: false, reason: "startedAt must be a non-empty ISO string" };
  }
  if (typeof lock.updatedAt !== "string" || !lock.updatedAt) {
    return { ok: false, reason: "updatedAt must be a non-empty ISO string" };
  }
  if (Number.isNaN(new Date(lock.startedAt).getTime())) {
    return { ok: false, reason: "startedAt must be a valid ISO timestamp" };
  }
  if (Number.isNaN(new Date(lock.updatedAt).getTime())) {
    return { ok: false, reason: "updatedAt must be a valid ISO timestamp" };
  }
  if (lock.hostname !== undefined && typeof lock.hostname !== "string") {
    return { ok: false, reason: "hostname must be a string when present" };
  }
  if (lock.command !== undefined && typeof lock.command !== "string") {
    return { ok: false, reason: "command must be a string when present" };
  }
  if (lock.mode !== undefined && lock.mode !== null && typeof lock.mode !== "string") {
    return { ok: false, reason: "mode must be a string when present" };
  }
  if (lock.dryRunMode !== undefined && typeof lock.dryRunMode !== "boolean") {
    return { ok: false, reason: "dryRunMode must be a boolean when present" };
  }
  if (lock.liveArmed !== undefined && typeof lock.liveArmed !== "boolean") {
    return { ok: false, reason: "liveArmed must be a boolean when present" };
  }
  return { ok: true };
}

function serializeExecutorLock(lock) {
  return `${JSON.stringify(lock, null, 2)}\n`;
}

function readExecutorLock(file) {
  const target = getExecutorLockPath(file);
  if (!fs.existsSync(target)) {
    return { state: "none", lock: null };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8"));
    const validation = validateExecutorLock(parsed);
    if (!validation.ok) {
      return { state: "malformed", lock: parsed, validation };
    }
    return { state: "present", lock: parsed, validation };
  } catch {
    return { state: "malformed", lock: null, validation: { ok: false, reason: "invalid JSON" } };
  }
}

function isExecutorLockStale(lock, nowMs = Date.now()) {
  if (!lock || typeof lock.updatedAt !== "string") return true;
  const updatedMs = new Date(lock.updatedAt).getTime();
  if (!Number.isFinite(updatedMs)) return true;
  return nowMs - updatedMs > STALE_TTL_MS;
}

function writeExecutorLockAtomic(lock, file) {
  const target = getExecutorLockPath(file);
  const validation = validateExecutorLock(lock);
  if (!validation.ok) {
    throw new Error(`executor_singleton validation failed: ${validation.reason}`);
  }

  const dir = path.dirname(target);
  const base = path.basename(target);
  const tmp = path.join(dir, `${base}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`);
  const data = serializeExecutorLock(lock);

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
    const revalidation = validateExecutorLock(verify);
    if (!revalidation.ok) {
      throw new Error(`executor_singleton temp validation failed: ${revalidation.reason}`);
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

function buildLockPayload(instanceId, posture = {}, command = "live_executor.js --loop") {
  const now = new Date().toISOString();
  const pid = Number.isFinite(process.pid) && process.pid > 0 ? process.pid : null;
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    instanceId,
    pid,
    startedAt: now,
    updatedAt: now,
    hostname: os.hostname(),
    command,
    dryRunMode: posture.dryRunMode === true,
    liveArmed: posture.liveArmed === true
  };
  if (typeof posture.mode === "string") {
    payload.mode = posture.mode;
  }
  return payload;
}

function acquireExecutorSingletonGuard(options = {}) {
  const file = options.file;
  const command = options.command || "live_executor.js --loop";
  const posture = options.posture || {};
  const read = readExecutorLock(file);

  if (read.state === "malformed") {
    return {
      ok: false,
      blocked: true,
      reason: "Executor singleton lock malformed; refusing to start duplicate loop. Manual operator review required.",
      lock: read.lock,
      validation: read.validation
    };
  }

  if (read.state === "present" && !isExecutorLockStale(read.lock)) {
    return {
      ok: false,
      blocked: true,
      reason: "Executor singleton lock active; refusing to start duplicate loop.",
      lock: read.lock
    };
  }

  const instanceId = createExecutorInstanceId();
  const lock = buildLockPayload(instanceId, posture, command);
  writeExecutorLockAtomic(lock, file);
  return { ok: true, blocked: false, instanceId, lock };
}

function refreshExecutorSingletonGuard(instanceId, file, posture = {}) {
  if (!instanceId) {
    return { ok: false, reason: "instanceId required" };
  }
  const read = readExecutorLock(file);
  if (read.state === "malformed") {
    return { ok: false, reason: "lock malformed" };
  }
  if (read.state === "none") {
    return { ok: false, reason: "lock missing" };
  }
  if (read.lock.instanceId !== instanceId) {
    return { ok: false, reason: "ownership changed" };
  }

  const next = {
    ...read.lock,
    updatedAt: new Date().toISOString(),
    ...(posture.mode !== undefined ? { mode: posture.mode } : {}),
    ...(posture.dryRunMode !== undefined ? { dryRunMode: posture.dryRunMode === true } : {}),
    ...(posture.liveArmed !== undefined ? { liveArmed: posture.liveArmed === true } : {})
  };
  writeExecutorLockAtomic(next, file);
  return { ok: true, lock: next };
}

function releaseExecutorSingletonGuard(instanceId, file) {
  if (!instanceId) {
    return { ok: true, released: false };
  }
  const read = readExecutorLock(file);
  if (read.state !== "present") {
    return { ok: true, released: false };
  }
  if (read.lock.instanceId !== instanceId) {
    return { ok: true, released: false };
  }
  try {
    fs.rmSync(getExecutorLockPath(file), { force: true });
    return { ok: true, released: true };
  } catch {
    return { ok: false, released: false };
  }
}

function describeExecutorLockStatus(file) {
  const read = readExecutorLock(file);
  if (read.state === "none") {
    return {
      executorSingletonLock: "none",
      lockOwnerInstanceId: null,
      lockUpdatedAt: null
    };
  }
  if (read.state === "malformed") {
    return {
      executorSingletonLock: "malformed",
      lockOwnerInstanceId: read.lock?.instanceId || null,
      lockUpdatedAt: read.lock?.updatedAt || null
    };
  }
  if (isExecutorLockStale(read.lock)) {
    return {
      executorSingletonLock: "stale",
      lockOwnerInstanceId: read.lock.instanceId,
      lockUpdatedAt: read.lock.updatedAt
    };
  }
  return {
    executorSingletonLock: "active",
    lockOwnerInstanceId: read.lock.instanceId,
    lockUpdatedAt: read.lock.updatedAt
  };
}

function registerExecutorSingletonRelease(instanceId, file) {
  const release = () => {
    try { releaseExecutorSingletonGuard(instanceId, file); } catch { /* best-effort */ }
  };
  process.on("exit", release);
  process.on("SIGINT", () => {
    release();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    release();
    process.exit(143);
  });
}

module.exports = {
  LOCK_FILE_NAME,
  STALE_TTL_MS,
  getExecutorLockPath,
  createExecutorInstanceId,
  readExecutorLock,
  validateExecutorLock,
  writeExecutorLockAtomic,
  acquireExecutorSingletonGuard,
  refreshExecutorSingletonGuard,
  releaseExecutorSingletonGuard,
  isExecutorLockStale,
  describeExecutorLockStatus,
  registerExecutorSingletonRelease
};
