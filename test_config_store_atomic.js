"use strict";

// test_config_store_atomic.js — Sprint 4 A1b
// Validates config_store.writeConfigAtomic in an isolated OS temp directory.
// It NEVER touches the real live_config.json and performs no network/live calls.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const store = require("./config_store");

const G = "\x1b[32m✔\x1b[0m";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "a1b-config-"));
const target = path.join(tmp, "live_config.json");

function leftoverTmpFiles() {
  return fs.readdirSync(tmp).filter(f => f.endsWith(".tmp"));
}

try {
  const sample = {
    executionMode: "PIPELINE_DRY_RUN",
    dryRunMode: true,
    automationEnabled: false,
    emergencyStop: false,
    positionSizeSol: 0.005,
    thesis: { scoreMin: 80, scoreMax: 89, marketCapMin: 100000 },
    walletPublicAddress: "ExampleWalletAddr1111111111111111111111111",
    nested: { a: [1, 2, 3], b: { c: true } }
  };

  // ── T1: JSON round-trip ─────────────────────────────────────────────────────
  store.writeConfigAtomic(sample, target);
  const readBack = JSON.parse(fs.readFileSync(target, "utf8"));
  assert.deepStrictEqual(readBack, sample, "round-trip must preserve the config object");
  console.log(`${G} T1 writeConfigAtomic round-trips the config object`);

  // ── T2: format parity (byte-identical to the legacy serializer) ─────────────
  const expectedBytes = JSON.stringify(sample, null, 2) + "\n";
  assert.strictEqual(fs.readFileSync(target, "utf8"), expectedBytes, "output must match JSON.stringify(cfg,null,2)+\\n");
  console.log(`${G} T2 output format parity (no reformatting churn)`);

  // ── T3: temp cleanup on success (no *.tmp left behind) ──────────────────────
  assert.strictEqual(leftoverTmpFiles().length, 0, "no temp files should remain after a successful write");
  console.log(`${G} T3 temp file cleaned up on success (atomic rename)`);

  // ── T4: atomic replace of an existing file ──────────────────────────────────
  const v2 = { ...sample, automationEnabled: true, note: "v2" };
  store.writeConfigAtomic(v2, target);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, "utf8")), v2, "existing file must be replaced atomically");
  assert.strictEqual(leftoverTmpFiles().length, 0, "no temp files after replace");
  console.log(`${G} T4 atomic replace of an existing config file`);

  // ── T5: failed write leaves the original intact + cleans temp ───────────────
  const bytesBefore = fs.readFileSync(target);
  const circular = {};
  circular.self = circular; // JSON.stringify throws on circular references
  let threw = false;
  try {
    store.writeConfigAtomic(circular, target);
  } catch {
    threw = true;
  }
  assert.ok(threw, "an unserializable config must throw, not silently corrupt");
  assert.ok(bytesBefore.equals(fs.readFileSync(target)), "failed write must leave the original file byte-identical");
  assert.strictEqual(leftoverTmpFiles().length, 0, "failed write must not leave a temp file behind");
  console.log(`${G} T5 failed write leaves original intact and cleans up temp`);

  // ── T6: exported serializer matches the on-disk format ──────────────────────
  assert.strictEqual(store.serializeConfig(v2), JSON.stringify(v2, null, 2) + "\n");
  console.log(`${G} T6 serializeConfig matches legacy format`);

  console.log("\nCONFIG STORE ATOMIC WRITE TEST PASSED (6/6)");
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
}
