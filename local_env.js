"use strict";

// ─── A4.8 — Controlled local `.env` ingestion (secret-safe) ─────────────────
//
// Loads project-local `.env` into process.env without printing, returning, or
// dumping secret values. Guiding principle: a secret can be loaded without
// being revealed.
//
// Override policy: existing process.env wins; `.env` fills missing keys only
// (dotenv `override: false`).

const fs = require("fs");
const path = require("path");

const RPC_KEY_NAMES = Object.freeze([
  "HELIUS_RPC_URL",
  "SOLANA_RPC_URL",
  "HELIUS_API_KEY"
]);

function keysPresentSnapshot() {
  return {
    HELIUS_RPC_URL: !!process.env.HELIUS_RPC_URL,
    SOLANA_RPC_URL: !!process.env.SOLANA_RPC_URL,
    HELIUS_API_KEY: !!process.env.HELIUS_API_KEY
  };
}

function safeErrorCode(err) {
  if (!err) return null;
  if (err.code === "ENOENT") return "ENOENT";
  return "LOAD_ERROR";
}

/**
 * Load local `.env` into process.env. Returns metadata only — never values.
 * @param {object} [options]
 * @param {string} [options.rootDir] - project root (default: this module's dir)
 * @param {string} [options.path] - explicit env file path (for tests)
 * @param {boolean} [options.override] - default false; process env wins when false
 * @returns {{ loaded: boolean, pathUsed: string|null, errorCode: string|null, keysPresent: object }}
 */
function loadLocalEnv(options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname);
  const envPath = options.path || path.join(rootDir, ".env");
  const override = options.override === true;

  const meta = {
    loaded: false,
    pathUsed: null,
    errorCode: null,
    keysPresent: keysPresentSnapshot()
  };

  if (!fs.existsSync(envPath)) {
    meta.errorCode = "ENOENT";
    return meta;
  }

  let dotenv;
  try {
    dotenv = require("dotenv");
  } catch {
    meta.errorCode = "DOTENV_UNAVAILABLE";
    return meta;
  }

  try {
    const result = dotenv.config({ path: envPath, override, quiet: true });
    if (result.error) {
      meta.errorCode = safeErrorCode(result.error);
      meta.keysPresent = keysPresentSnapshot();
      return meta;
    }
    meta.loaded = true;
    meta.pathUsed = path.basename(envPath) || ".env";
    meta.keysPresent = keysPresentSnapshot();
    return meta;
  } catch (err) {
    meta.errorCode = safeErrorCode(err) || "LOAD_ERROR";
    meta.keysPresent = keysPresentSnapshot();
    return meta;
  }
}

module.exports = {
  loadLocalEnv,
  RPC_KEY_NAMES
};
