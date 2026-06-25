"use strict";

// test_live_positions_atomic.js — Sprint 4 R4
// Validates live_positions_store in an isolated OS temp directory.
// NEVER touches repo-root live_positions.json, live_config.json, or recovery_actions.jsonl.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const ROOT = __dirname;
const REPO_POSITIONS = path.join(ROOT, "live_positions.json");
const REPO_CONFIG = path.join(ROOT, "live_config.json");
const REPO_RECOVERY = path.join(ROOT, "recovery_actions.jsonl");

const G = "\x1b[32m✔\x1b[0m";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "r4-live-positions-"));
const target = path.join(tmp, "live_positions.json");

function hash(file) {
  return fs.readFileSync(file);
}

function leftoverTmpFiles(dir = tmp) {
  return fs.readdirSync(dir).filter(f => f.endsWith(".tmp"));
}

function samplePosition(overrides = {}) {
  return {
    liveTradeId: "fixture-trade-1",
    symbol: "FIX",
    address: "Mint1111111111111111111111111111111111",
    pairAddress: "Pair1111111111111111111111111111111111",
    score: 85,
    source: "gmgn_trending",
    positionSizeSol: 0.005,
    entryTime: "2026-06-23T12:00:00.000Z",
    intendedEntryPrice: 0.0001,
    actualEntryPrice: 0.0001,
    targetPrice: 0.00013,
    stopPrice: 0.00007,
    dryRun: true,
    anomalyFlags: ["DRY_RUN"],
    status: "OPEN",
    ...overrides
  };
}

function sampleState(overrides = {}) {
  const positions = overrides.positions || [samplePosition()];
  return positions;
}

function loadStore() {
  delete require.cache[require.resolve("./live_positions_store")];
  return require("./live_positions_store");
}

const beforeRepoPositionsExists = fs.existsSync(REPO_POSITIONS);
const beforeRepoConfigHash = fs.existsSync(REPO_CONFIG) ? hash(REPO_CONFIG) : null;
const beforeRepoRecoveryExists = fs.existsSync(REPO_RECOVERY);

try {
  let store = loadStore();

  // ── T1: missing file loads default state ────────────────────────────────────
  assert.deepStrictEqual(store.loadLivePositionsState(target), []);
  assert.deepStrictEqual(store.createDefaultLivePositionsState(), []);
  console.log(`${G} T1 missing file loads default state`);

  // ── T2: valid state loads correctly ─────────────────────────────────────────
  const sample = sampleState();
  store.writeLivePositionsStateAtomic(sample, target);
  assert.deepStrictEqual(store.loadLivePositionsState(target), sample);
  console.log(`${G} T2 valid state loads correctly`);

  // ── T3: writeLivePositionsStateAtomic creates file ──────────────────────────
  assert.ok(fs.existsSync(target), "atomic write must create the positions file");
  console.log(`${G} T3 writeLivePositionsStateAtomic creates file`);

  // ── T4: second write replaces file atomically ───────────────────────────────
  const v2 = sampleState({
    positions: [samplePosition({ liveTradeId: "fixture-trade-2", symbol: "FIX2" })]
  });
  store.writeLivePositionsStateAtomic(v2, target);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, "utf8")), v2);
  assert.strictEqual(leftoverTmpFiles().length, 0, "no temp files after replace");
  console.log(`${G} T4 second write replaces file atomically`);

  // ── T5: failed validation does not replace existing valid file ──────────────
  const bytesBefore = fs.readFileSync(target);
  let threw = false;
  try {
    store.writeLivePositionsStateAtomic({ positions: [] }, target);
  } catch {
    threw = true;
  }
  assert.ok(threw, "non-array root must throw");
  assert.ok(bytesBefore.equals(fs.readFileSync(target)), "failed write must leave original byte-identical");
  assert.strictEqual(leftoverTmpFiles().length, 0, "failed write must not leave temp files");
  console.log(`${G} T5 failed validation does not replace existing valid file`);

  // ── T6: corrupt existing file is not silently overwritten by load ─────────────
  fs.writeFileSync(target, "{ not valid json\n");
  let warned = false;
  const corruptLoaded = store.loadLivePositionsState(target, {
    onWarn: () => { warned = true; }
  });
  assert.deepStrictEqual(corruptLoaded, []);
  assert.ok(warned, "corrupt load should report a warning");
  assert.strictEqual(fs.readFileSync(target, "utf8"), "{ not valid json\n", "load must not overwrite corrupt file");
  console.log(`${G} T6 corrupt existing file is not silently overwritten by load`);

  store.writeLivePositionsStateAtomic(sample, target);

  // ── T7: temp file cleanup on failed write when possible ─────────────────────
  const badPosition = samplePosition();
  badPosition.self = badPosition;
  threw = false;
  try {
    store.writeLivePositionsStateAtomic([badPosition], target);
  } catch {
    threw = true;
  }
  assert.ok(threw, "circular position payload must throw during serialization");
  assert.strictEqual(leftoverTmpFiles().length, 0, "failed write must clean up temp file");
  console.log(`${G} T7 temp file cleanup on failed write`);

  // ── T8: updateLivePositionsState preserves existing entries ─────────────────
  store.writeLivePositionsStateAtomic([samplePosition({ liveTradeId: "keep-me" })], target);
  const updated = store.updateLivePositionsState(current => [
    ...current,
    samplePosition({ liveTradeId: "added-me", symbol: "ADD" })
  ], target);
  assert.strictEqual(updated.length, 2);
  assert.ok(updated.some(p => p.liveTradeId === "keep-me"), "update must preserve existing entries");
  assert.ok(updated.some(p => p.liveTradeId === "added-me"), "update must add new entries");
  console.log(`${G} T8 updateLivePositionsState preserves existing entries`);

  // ── T9: current production-compatible shape validates ─────────────────────────
  const productionShape = store.validateLivePositionsState(sampleState());
  assert.ok(productionShape.ok, `production shape must validate (${productionShape.reason || "ok"})`);
  console.log(`${G} T9 current production-compatible shape validates`);

  // ── T10: invalid root shape rejects ─────────────────────────────────────────
  const badRoot = store.validateLivePositionsState({ liveTradeId: "x" });
  assert.ok(!badRoot.ok, "object root must reject");
  console.log(`${G} T10 invalid root shape rejects`);

  // ── T11: invalid position entries reject when safely detectable ─────────────
  const badEntry = store.validateLivePositionsState([{ liveTradeId: 123, status: "OPEN" }]);
  assert.ok(!badEntry.ok, "non-string liveTradeId must reject");
  const nestedArray = store.validateLivePositionsState([[]]);
  assert.ok(!nestedArray.ok, "array position entry must reject");
  console.log(`${G} T11 invalid position entries reject when safely detectable`);

  // ── T12: no repo-root live_positions.json created by tests ───────────────────
  assert.strictEqual(fs.existsSync(REPO_POSITIONS), beforeRepoPositionsExists,
    "tests must not create repo-root live_positions.json");
  console.log(`${G} T12 no repo-root live_positions.json created by tests`);

  // ── T13: no live_config.json mutation ────────────────────────────────────────
  if (beforeRepoConfigHash) {
    assert.ok(beforeRepoConfigHash.equals(hash(REPO_CONFIG)), "tests must not mutate live_config.json");
  }
  console.log(`${G} T13 no live_config.json mutation`);

  // ── T14: no recovery_actions.jsonl creation ─────────────────────────────────
  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRepoRecoveryExists,
    "tests must not create recovery_actions.jsonl");
  console.log(`${G} T14 no recovery_actions.jsonl creation`);

  // ── T15: store uses TRACKTA_RUNTIME_ROOT temp path in tests ─────────────────
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "r4-runtime-root-"));
  process.env.TRACKTA_RUNTIME_ROOT = runtimeRoot;
  store = loadStore();
  const runtimePath = store.getLivePositionsPath();
  assert.strictEqual(runtimePath, path.join(runtimeRoot, "live_positions.json"));
  store.writeLivePositionsStateAtomic([samplePosition({ liveTradeId: "runtime-root" })], runtimePath);
  assert.ok(fs.existsSync(runtimePath), "TRACKTA_RUNTIME_ROOT path must be writable");
  delete process.env.TRACKTA_RUNTIME_ROOT;
  console.log(`${G} T15 store uses TRACKTA_RUNTIME_ROOT temp path in tests`);

  // ── Static checks ───────────────────────────────────────────────────────────
  const storeSrc = fs.readFileSync(path.join(ROOT, "live_positions_store.js"), "utf8");
  const testSrc = fs.readFileSync(__filename, "utf8");
  const executorSrc = fs.readFileSync(path.join(ROOT, "live_executor.js"), "utf8");
  const dashboardSrc = fs.readFileSync(path.join(ROOT, "dashboard_server.js"), "utf8");

  assert.ok(!/\brequire\s*\(\s*["']child_process["']\s*\)/.test(storeSrc),
    "live_positions_store must not import child_process");
  assert.ok(!/\brequire\s*\(\s*["']child_process["']\s*\)/.test(testSrc),
    "test file must not import child_process");
  assert.ok(!/\b(spawnSync|spawn|execSync|exec)\s*\(/.test(storeSrc),
    "live_positions_store must not spawn/exec");
  assert.ok(!/\bprocess\.kill\s*\(/.test(storeSrc),
    "live_positions_store must not kill processes");
  assert.ok(/writeLivePositionsStateAtomic\s*\(/.test(executorSrc),
    "live_executor must route live positions writes through atomic store");
  assert.ok(!/(?:fs\.)?writeFileSync\s*\(\s*LIVE_POSITIONS_FILE/.test(executorSrc),
    "live_executor must not raw-write live_positions file");
  assert.ok(!/(?:fs\.)?writeFileSync\s*\(\s*[^)]*live_positions\.json/.test(dashboardSrc),
    "dashboard must remain read-only for live_positions.json");
  console.log(`${G} static checks: store/test have no child_process import or spawn/exec/kill`);
  console.log(`${G} static checks: executor uses atomic live positions store; dashboard read-only`);

  console.log("\nLIVE POSITIONS ATOMIC WRITE TEST PASSED (15/15)");
} finally {
  delete process.env.TRACKTA_RUNTIME_ROOT;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
}
