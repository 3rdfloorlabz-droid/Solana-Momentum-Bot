"use strict";

// test_executor_singleton_guard.js — Sprint 4 R5
// Validates executor_singleton_guard in an isolated OS temp directory.
// NEVER touches repo-root lock file, live_config.json, or recovery_actions.jsonl.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const ROOT = __dirname;
const REPO_LOCK = path.join(ROOT, "executor_singleton.lock.json");
const REPO_CONFIG = path.join(ROOT, "live_config.json");
const REPO_RECOVERY = path.join(ROOT, "recovery_actions.jsonl");
const REPO_POSITIONS = path.join(ROOT, "live_positions.json");
const REPO_DEDUP = path.join(ROOT, "observation_dedup.json");

const G = "\x1b[32m✔\x1b[0m";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "r5-exec-singleton-"));
const lockFile = path.join(tmp, "executor_singleton.lock.json");

function hash(file) {
  return fs.readFileSync(file);
}

function leftoverTmpFiles(dir = tmp) {
  return fs.readdirSync(dir).filter(f => f.endsWith(".tmp"));
}

function sampleLock(overrides = {}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    instanceId: "fixture-instance-1",
    pid: 12345,
    startedAt: now,
    updatedAt: now,
    hostname: "fixture-host",
    command: "live_executor.js --loop",
    mode: "PIPELINE_DRY_RUN",
    dryRunMode: true,
    liveArmed: false,
    ...overrides
  };
}

function loadGuard() {
  delete require.cache[require.resolve("./executor_singleton_guard")];
  return require("./executor_singleton_guard");
}

const beforeRepoLockExists = fs.existsSync(REPO_LOCK);
const beforeRepoConfigHash = fs.existsSync(REPO_CONFIG) ? hash(REPO_CONFIG) : null;
const beforeRepoRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeRepoPositionsHash = fs.existsSync(REPO_POSITIONS) ? hash(REPO_POSITIONS) : null;
const beforeRepoDedupHash = fs.existsSync(REPO_DEDUP) ? hash(REPO_DEDUP) : null;

try {
  let guard = loadGuard();

  // ── T1: missing lock can acquire ────────────────────────────────────────────
  const first = guard.acquireExecutorSingletonGuard({
    file: lockFile,
    posture: { mode: "PIPELINE_DRY_RUN", dryRunMode: true, liveArmed: false }
  });
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.blocked, false);
  assert.ok(first.instanceId);
  assert.ok(fs.existsSync(lockFile));
  console.log(`${G} T1 missing lock can acquire`);

  // ── T2: fresh lock blocks second acquire ────────────────────────────────────
  const second = guard.acquireExecutorSingletonGuard({ file: lockFile });
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.blocked, true);
  assert.match(second.reason, /refusing to start duplicate loop/i);
  console.log(`${G} T2 fresh lock blocks second acquire`);

  // ── T3: stale lock can be replaced ──────────────────────────────────────────
  const staleAt = new Date(Date.now() - guard.STALE_TTL_MS - 1000).toISOString();
  guard.writeExecutorLockAtomic(sampleLock({
    instanceId: "stale-owner",
    updatedAt: staleAt,
    startedAt: staleAt
  }), lockFile);
  const replaced = guard.acquireExecutorSingletonGuard({ file: lockFile });
  assert.strictEqual(replaced.ok, true);
  assert.notStrictEqual(replaced.instanceId, "stale-owner");
  assert.strictEqual(JSON.parse(fs.readFileSync(lockFile, "utf8")).instanceId, replaced.instanceId);
  console.log(`${G} T3 stale lock can be replaced`);

  const ownerId = replaced.instanceId;

  // ── T4: malformed/corrupt lock blocks startup ───────────────────────────────
  fs.writeFileSync(lockFile, "{ not valid json\n");
  const malformed = guard.acquireExecutorSingletonGuard({ file: lockFile });
  assert.strictEqual(malformed.ok, false);
  assert.strictEqual(malformed.blocked, true);
  assert.match(malformed.reason, /malformed/i);
  assert.strictEqual(fs.readFileSync(lockFile, "utf8"), "{ not valid json\n", "malformed lock must not be auto-deleted");
  console.log(`${G} T4 malformed/corrupt lock blocks startup`);

  guard.writeExecutorLockAtomic(sampleLock({ instanceId: ownerId }), lockFile);

  // ── T5: --status path does not acquire lock (static source check) ───────────
  const executorSrc = fs.readFileSync(path.join(ROOT, "live_executor.js"), "utf8");
  const statusSection = executorSrc.split('} else {')[1] || "";
  assert.ok(!/acquireExecutorSingletonGuard\s*\(/.test(statusSection),
    "--status/default path must not acquire singleton lock");
  assert.ok(/describeExecutorLockStatus\s*\(/.test(executorSrc),
    "--status should read lock status read-only");
  console.log(`${G} T5 --status path does not acquire lock (static check)`);

  // ── T6: refresh updates updatedAt for same instance ─────────────────────────
  const beforeRefresh = JSON.parse(fs.readFileSync(lockFile, "utf8"));
  const refresh = guard.refreshExecutorSingletonGuard(ownerId, lockFile, {
    mode: "PIPELINE_DRY_RUN",
    dryRunMode: true,
    liveArmed: false
  });
  assert.strictEqual(refresh.ok, true);
  const afterRefresh = JSON.parse(fs.readFileSync(lockFile, "utf8"));
  assert.strictEqual(afterRefresh.instanceId, ownerId);
  assert.ok(new Date(afterRefresh.updatedAt).getTime() >= new Date(beforeRefresh.updatedAt).getTime(),
    "refresh must not move updatedAt backwards");
  console.log(`${G} T6 refresh updates updatedAt for same instance`);

  // ── T7: refresh fails/blocks if ownership changed ───────────────────────────
  guard.writeExecutorLockAtomic(sampleLock({ instanceId: "other-owner" }), lockFile);
  const lost = guard.refreshExecutorSingletonGuard(ownerId, lockFile);
  assert.strictEqual(lost.ok, false);
  assert.match(lost.reason, /ownership changed/i);
  console.log(`${G} T7 refresh fails/blocks if ownership changed`);

  guard.writeExecutorLockAtomic(sampleLock({ instanceId: ownerId }), lockFile);

  // ── T8: release removes lock only for matching instanceId ─────────────────────
  const released = guard.releaseExecutorSingletonGuard(ownerId, lockFile);
  assert.strictEqual(released.ok, true);
  assert.strictEqual(released.released, true);
  assert.strictEqual(fs.existsSync(lockFile), false);
  console.log(`${G} T8 release removes lock only for matching instanceId`);

  guard.writeExecutorLockAtomic(sampleLock({ instanceId: "foreign-owner" }), lockFile);
  const notMine = guard.releaseExecutorSingletonGuard(ownerId, lockFile);
  assert.strictEqual(notMine.released, false);
  assert.ok(fs.existsSync(lockFile));
  console.log(`${G} T9 release does not remove another owner's lock`);

  // ── T10: lock write is atomic ────────────────────────────────────────────────
  guard.writeExecutorLockAtomic(sampleLock({ instanceId: "atomic-owner" }), lockFile);
  const bytesBefore = fs.readFileSync(lockFile);
  let threw = false;
  try {
    guard.writeExecutorLockAtomic({ schemaVersion: 2, instanceId: "bad" }, lockFile);
  } catch {
    threw = true;
  }
  assert.ok(threw, "invalid lock shape must throw");
  assert.ok(bytesBefore.equals(fs.readFileSync(lockFile)), "failed write must leave original byte-identical");
  assert.strictEqual(leftoverTmpFiles().length, 0, "failed write must not leave temp files");
  console.log(`${G} T10 lock write is atomic`);

  // ── T11: invalid lock shape rejected ────────────────────────────────────────
  const badShape = guard.validateExecutorLock({ schemaVersion: 1, instanceId: "" });
  assert.ok(!badShape.ok);
  console.log(`${G} T11 invalid lock shape rejected`);

  // ── T12: no repo-root lock file created by tests ─────────────────────────────
  assert.strictEqual(fs.existsSync(REPO_LOCK), beforeRepoLockExists,
    "tests must not create repo-root executor_singleton.lock.json");
  console.log(`${G} T12 no repo-root lock file created by tests`);

  // ── T13: no live_config.json mutation ───────────────────────────────────────
  if (beforeRepoConfigHash) {
    assert.ok(beforeRepoConfigHash.equals(hash(REPO_CONFIG)), "tests must not mutate live_config.json");
  }
  console.log(`${G} T13 no live_config.json mutation`);

  // ── T14: no recovery_actions.jsonl creation ───────────────────────────────────
  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRepoRecoveryExists,
    "tests must not create recovery_actions.jsonl");
  console.log(`${G} T14 no recovery_actions.jsonl creation`);

  // ── T15: no repo-root live_positions.json / observation_dedup.json mutation ─
  if (beforeRepoPositionsHash) {
    assert.ok(beforeRepoPositionsHash.equals(hash(REPO_POSITIONS)), "tests must not mutate live_positions.json");
  }
  if (beforeRepoDedupHash) {
    assert.ok(beforeRepoDedupHash.equals(hash(REPO_DEDUP)), "tests must not mutate observation_dedup.json");
  }
  console.log(`${G} T15 no repo-root live_positions/dedup mutation`);

  // ── T16: store uses TRACKTA_RUNTIME_ROOT temp path in tests ───────────────────
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "r5-runtime-root-"));
  process.env.TRACKTA_RUNTIME_ROOT = runtimeRoot;
  guard = loadGuard();
  const runtimePath = guard.getExecutorLockPath();
  assert.strictEqual(runtimePath, path.join(runtimeRoot, "executor_singleton.lock.json"));
  const runtimeAcquire = guard.acquireExecutorSingletonGuard({ file: runtimePath });
  assert.ok(runtimeAcquire.ok);
  assert.ok(fs.existsSync(runtimePath));
  delete process.env.TRACKTA_RUNTIME_ROOT;
  console.log(`${G} T16 store uses TRACKTA_RUNTIME_ROOT temp path in tests`);

  // ── Static checks ───────────────────────────────────────────────────────────
  const guardSrc = fs.readFileSync(path.join(ROOT, "executor_singleton_guard.js"), "utf8");
  const testSrc = fs.readFileSync(__filename, "utf8");

  assert.ok(!/\brequire\s*\(\s*["']child_process["']\s*\)/.test(guardSrc),
    "executor_singleton_guard must not import child_process");
  assert.ok(!/\b(spawnSync|spawn|execSync|exec|taskkill|Stop-Process)\s*\(/.test(guardSrc),
    "executor_singleton_guard must not spawn/exec/kill");
  assert.ok(!/\bprocess\.kill\s*\(/.test(guardSrc),
    "executor_singleton_guard must not kill processes");
  assert.ok(/acquireExecutorSingletonGuard\s*\(/.test(executorSrc),
    "live_executor --loop must use singleton guard acquire");
  assert.ok(!/(?:fs\.)?writeFileSync\s*\(\s*[^)]*executor_singleton\.lock\.json/.test(executorSrc),
    "live_executor must not raw-write lock file");
  console.log(`${G} static checks: no child_process/spawn/exec/kill in guard`);
  console.log(`${G} static checks: live_executor --loop uses guard; --status read-only`);

  console.log("\nEXECUTOR SINGLETON GUARD TEST PASSED (16/16)");
} finally {
  delete process.env.TRACKTA_RUNTIME_ROOT;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
}
