"use strict";

// test_observation_dedup_atomic.js — Sprint 4 R3
// Validates observation_dedup_store in an isolated OS temp directory.
// NEVER touches repo-root observation_dedup.json, live_config.json, or recovery_actions.jsonl.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const ROOT = __dirname;
const REPO_DEDUP = path.join(ROOT, "observation_dedup.json");
const REPO_CONFIG = path.join(ROOT, "live_config.json");
const REPO_RECOVERY = path.join(ROOT, "recovery_actions.jsonl");

const G = "\x1b[32m✔\x1b[0m";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "r3-obs-dedup-"));
const target = path.join(tmp, "observation_dedup.json");

function hash(file) {
  return fs.readFileSync(file);
}

function leftoverTmpFiles(dir = tmp) {
  return fs.readdirSync(dir).filter(f => f.endsWith(".tmp"));
}

function samplePayload(overrides = {}) {
  return {
    schemaVersion: 1,
    updatedAt: "2026-06-23T12:00:00.000Z",
    observedKeys: ["intent|fixture-intent-a"],
    pairLastObservedMs: { "address_pair|MintA|PairA": 1710000000000 },
    ...overrides
  };
}

function loadStore() {
  delete require.cache[require.resolve("./observation_dedup_store")];
  return require("./observation_dedup_store");
}

const beforeRepoDedupExists = fs.existsSync(REPO_DEDUP);
const beforeRepoConfigHash = fs.existsSync(REPO_CONFIG) ? hash(REPO_CONFIG) : null;
const beforeRepoRecoveryExists = fs.existsSync(REPO_RECOVERY);

try {
  let store = loadStore();

  // ── T1: missing file loads default state ────────────────────────────────────
  assert.deepStrictEqual(store.loadObservationDedupState(target), {
    observedKeys: [],
    pairLastObservedMs: {}
  });
  console.log(`${G} T1 missing file loads default state`);

  // ── T2: valid state loads correctly ─────────────────────────────────────────
  const sample = samplePayload();
  store.writeObservationDedupStateAtomic(sample, target);
  const loaded = store.loadObservationDedupState(target);
  assert.deepStrictEqual(loaded.observedKeys, sample.observedKeys);
  assert.deepStrictEqual(loaded.pairLastObservedMs, sample.pairLastObservedMs);
  console.log(`${G} T2 valid state loads correctly`);

  // ── T3: writeObservationDedupStateAtomic creates file ───────────────────────
  assert.ok(fs.existsSync(target), "atomic write must create the dedup file");
  console.log(`${G} T3 writeObservationDedupStateAtomic creates file`);

  // ── T4: second write replaces file atomically ───────────────────────────────
  const v2 = samplePayload({
    observedKeys: ["intent|fixture-intent-b", "intent|fixture-intent-c"],
    pairLastObservedMs: { "address_pair|MintB|PairB": 1710000001000 }
  });
  store.writeObservationDedupStateAtomic(v2, target);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, "utf8")), v2);
  assert.strictEqual(leftoverTmpFiles().length, 0, "no temp files after replace");
  console.log(`${G} T4 second write replaces file atomically`);

  // ── T5: failed validation does not replace existing valid file ──────────────
  const bytesBefore = fs.readFileSync(target);
  let threw = false;
  try {
    store.writeObservationDedupStateAtomic({ schemaVersion: 2, observedKeys: [], pairLastObservedMs: {} }, target);
  } catch {
    threw = true;
  }
  assert.ok(threw, "invalid schemaVersion must throw");
  assert.ok(bytesBefore.equals(fs.readFileSync(target)), "failed write must leave original byte-identical");
  assert.strictEqual(leftoverTmpFiles().length, 0, "failed write must not leave temp files");
  console.log(`${G} T5 failed validation does not replace existing valid file`);

  // ── T6: corrupt existing file is not silently overwritten by load ───────────
  fs.writeFileSync(target, "{ not valid json\n");
  let warned = false;
  const corruptLoaded = store.loadObservationDedupState(target, {
    onWarn: () => { warned = true; }
  });
  assert.deepStrictEqual(corruptLoaded, { observedKeys: [], pairLastObservedMs: {} });
  assert.ok(warned, "corrupt load should report a warning");
  assert.strictEqual(fs.readFileSync(target, "utf8"), "{ not valid json\n", "load must not overwrite corrupt file");
  console.log(`${G} T6 corrupt existing file is not silently overwritten by load`);

  // Restore valid file for subsequent tests.
  store.writeObservationDedupStateAtomic(sample, target);

  // ── T7: temp file cleanup on failed write when possible ─────────────────────
  const circular = { schemaVersion: 1, observedKeys: [], pairLastObservedMs: {} };
  circular.self = circular;
  threw = false;
  try {
    store.writeObservationDedupStateAtomic(circular, target);
  } catch {
    threw = true;
  }
  assert.ok(threw, "circular payload must throw during serialization");
  assert.strictEqual(leftoverTmpFiles().length, 0, "failed write must clean up temp file");
  console.log(`${G} T7 temp file cleanup on failed write`);

  // ── T8: updateObservationDedupState preserves existing entries ──────────────
  store.writeObservationDedupStateAtomic(samplePayload({
    observedKeys: ["intent|keep-me"],
    pairLastObservedMs: { "address_pair|Keep|Pair": 1000 }
  }), target);
  const updated = store.updateObservationDedupState(current => ({
    observedKeys: [...current.observedKeys, "intent|added-me"],
    pairLastObservedMs: {
      ...current.pairLastObservedMs,
      "address_pair|Added|Pair": 2000
    }
  }), target);
  assert.ok(updated.observedKeys.includes("intent|keep-me"), "update must preserve existing keys");
  assert.ok(updated.observedKeys.includes("intent|added-me"), "update must add new keys");
  assert.strictEqual(updated.pairLastObservedMs["address_pair|Keep|Pair"], 1000);
  assert.strictEqual(updated.pairLastObservedMs["address_pair|Added|Pair"], 2000);
  console.log(`${G} T8 updateObservationDedupState preserves existing entries`);

  // ── T9: no repo-root observation_dedup.json created by tests ────────────────
  assert.strictEqual(fs.existsSync(REPO_DEDUP), beforeRepoDedupExists,
    "tests must not create repo-root observation_dedup.json");
  console.log(`${G} T9 no repo-root observation_dedup.json created by tests`);

  // ── T10: no live_config.json mutation ───────────────────────────────────────
  if (beforeRepoConfigHash) {
    assert.ok(beforeRepoConfigHash.equals(hash(REPO_CONFIG)), "tests must not mutate live_config.json");
  }
  console.log(`${G} T10 no live_config.json mutation`);

  // ── T11: no recovery_actions.jsonl creation ───────────────────────────────────
  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRepoRecoveryExists,
    "tests must not create recovery_actions.jsonl");
  console.log(`${G} T11 no recovery_actions.jsonl creation`);

  // ── T12: store uses TRACKTA_RUNTIME_ROOT temp path in tests ─────────────────
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "r3-runtime-root-"));
  process.env.TRACKTA_RUNTIME_ROOT = runtimeRoot;
  store = loadStore();
  const runtimePath = store.getObservationDedupPath();
  assert.strictEqual(runtimePath, path.join(runtimeRoot, "observation_dedup.json"));
  store.writeObservationDedupStateAtomic(samplePayload({ observedKeys: ["intent|runtime-root"] }), runtimePath);
  assert.ok(fs.existsSync(runtimePath), "TRACKTA_RUNTIME_ROOT path must be writable");
  delete process.env.TRACKTA_RUNTIME_ROOT;
  console.log(`${G} T12 store uses TRACKTA_RUNTIME_ROOT temp path in tests`);

  // ── Static checks ───────────────────────────────────────────────────────────
  const storeSrc = fs.readFileSync(path.join(ROOT, "observation_dedup_store.js"), "utf8");
  const testSrc = fs.readFileSync(__filename, "utf8");
  const executorSrc = fs.readFileSync(path.join(ROOT, "live_executor.js"), "utf8");

  assert.ok(!/\brequire\s*\(\s*["']child_process["']\s*\)/.test(storeSrc),
    "observation_dedup_store must not import child_process");
  assert.ok(!/\brequire\s*\(\s*["']child_process["']\s*\)/.test(testSrc),
    "test file must not import child_process");
  assert.ok(!/\b(spawnSync|spawn|execSync|exec)\s*\(/.test(storeSrc),
    "observation_dedup_store must not spawn/exec");
  assert.ok(!/\bprocess\.kill\s*\(/.test(storeSrc),
    "observation_dedup_store must not kill processes");
  assert.ok(/writeObservationDedupStateAtomic\s*\(/.test(executorSrc),
    "live_executor must route dedup writes through atomic store");
  assert.ok(!/(?:fs\.)?writeFileSync\s*\(\s*observationDedupFilePath\(\)/.test(executorSrc),
    "live_executor must not raw-write observation dedup file");
  console.log(`${G} static checks: store/test have no child_process import or spawn/exec/kill`);
  console.log(`${G} static checks: executor uses atomic dedup store (no raw writeFileSync)`);

  console.log("\nOBSERVATION DEDUP ATOMIC WRITE TEST PASSED (12/12)");
} finally {
  delete process.env.TRACKTA_RUNTIME_ROOT;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
}
