"use strict";

// config_store.js — Sprint 4 A1b
// Single shared ATOMIC writer for live_config.json (and any config-shaped JSON file).
//
//   serialize → temp file → fsync → re-parse validate → atomic rename → cleanup-on-error
//
// This module performs NO semantic validation and NO policy gates. It does not audit,
// enforce safety rules, change values, or know anything about A3. It only guarantees
// that a config write is atomic and never leaves a torn/partial file. Value gates live
// in live_executor.loadConfig()/readinessChecks(); audit lives in live_executor (A3).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CONFIG_FILE = path.join(__dirname, "live_config.json");

// Match the current writer's format exactly (2-space indent + trailing newline) so
// output is byte-identical for the same object — no reformatting churn.
function serializeConfig(cfg) {
  return `${JSON.stringify(cfg, null, 2)}\n`;
}

// Atomic replace. On Windows libuv maps fs.renameSync to MoveFileEx with
// replace-existing (atomic); on POSIX rename(2) is atomic. On any failure the
// original file is left untouched and the temp file is removed.
function writeConfigAtomic(cfg, file = CONFIG_FILE) {
  const dir = path.dirname(file);
  const base = path.basename(file);
  const tmp = path.join(dir, `${base}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`);
  const data = serializeConfig(cfg);

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

    // Validate before replace: the temp must re-read as valid JSON. Integrity only.
    const verify = fs.readFileSync(tmp, "utf8");
    JSON.parse(verify);

    fs.renameSync(tmp, file); // atomic replace
  } catch (err) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* ignore */ }
    }
    try { if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
    throw err;
  }
}

module.exports = {
  CONFIG_FILE,
  serializeConfig,
  writeConfigAtomic
};
