"use strict";

// test_soak_checkpoint_tooling.js — Sprint 4 R6a
// Validates soak checkpoint evidence collection in isolated temp directories.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { spawnSync } = require("child_process");

const checkpoint = require("./soak_checkpoint");
const runner = require("./run_24h_soak_checkpoints");

const ROOT = __dirname;
const REPO_CONFIG = path.join(ROOT, "live_config.json");
const REPO_RECOVERY = path.join(ROOT, "recovery_actions.jsonl");
const G = "\x1b[32m✔\x1b[0m";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "r6a-runtime-"));
const soakRunsDir = fs.mkdtempSync(path.join(os.tmpdir(), "r6a-soak-runs-"));
const beforeRepoConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;
const beforeRepoRecoveryExists = fs.existsSync(REPO_RECOVERY);

function healthySimulate(overrides = {}) {
  return checkpoint.healthySimulateFixture(overrides);
}

function evaluate(simulate) {
  const snap = checkpoint.collectSoakCheckpoint({
    runtimeRoot: tmpRoot,
    checkpointLabel: "test",
    simulate
  });
  return snap;
}

const PS_EXECUTOR_WRAPPER = {
  pid: 11080,
  commandLine:
    '"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoExit -NoProfile -Command & { ' +
    "$Host.UI.RawUI.WindowTitle = 'FOMO Live Executor'; Set-Location -LiteralPath " +
    "'C:\\TracktaOS\\Projects\\Active\\Solana-Momentum-Bot'; Write-Host 'FOMO Live Executor' -ForegroundColor " +
    "Cyan; node live_executor.js --loop } "
};

const NODE_EXECUTOR_LOOP = {
  pid: 7988,
  commandLine: '"C:\\Program Files\\nodejs\\node.exe" live_executor.js --loop'
};

function evaluateFromProcessInventory(processRows, lockPid = 7988) {
  const base = healthySimulate();
  const { processes, lockPidMatch, ...rest } = base;
  return evaluate({
    ...rest,
    executorLock: {
      ...base.executorLock,
      pid: lockPid
    },
    processInventory: { available: true, processes: processRows }
  });
}

try {
  const result = checkpoint.collectAndWriteCheckpoint({
    runtimeRoot: tmpRoot,
    soakRunsDir,
    checkpointLabel: "test-write",
    simulate: healthySimulate()
  });
  assert.ok(fs.existsSync(path.join(soakRunsDir, checkpoint.CHECKPOINT_JSONL)));
  assert.ok(fs.existsSync(path.join(soakRunsDir, checkpoint.LATEST_JSON)));
  const row = fs.readFileSync(path.join(soakRunsDir, checkpoint.CHECKPOINT_JSONL), "utf8")
    .trim()
    .split(/\r?\n/)
    .pop();
  assert.doesNotThrow(() => JSON.parse(row));
  assert.strictEqual(JSON.parse(row).checkpointLabel, "test-write");
  console.log(`${G} checkpoint writes evidence under soak_runs only`);

  const latest = JSON.parse(fs.readFileSync(path.join(soakRunsDir, checkpoint.LATEST_JSON), "utf8"));
  assert.strictEqual(latest.verdict, "PASS");
  console.log(`${G} latest summary JSON is written`);

  assert.strictEqual(evaluate(healthySimulate()).verdict, "PASS");
  console.log(`${G} simulated healthy process/lock state passes`);

  assert.strictEqual(
    evaluate(healthySimulate({
      processes: {
        ...healthySimulate().processes,
        executorLoop: [
          { pid: 4242, commandLine: "node live_executor.js --loop" },
          { pid: 4243, commandLine: "node live_executor.js --loop" }
        ],
        executorLoopCount: 2
      }
    })).verdict,
    "FAIL"
  );
  console.log(`${G} simulated duplicate executor fails`);

  assert.strictEqual(
    evaluate(healthySimulate({
      lockPidMatch: { lockPid: 9999, executorLoopPids: [4242], matches: false }
    })).verdict,
    "FAIL"
  );
  console.log(`${G} simulated lock pid mismatch fails`);

  assert.strictEqual(
    evaluate(healthySimulate({ posture: { mode: "PIPELINE_DRY_RUN", dryRunMode: true, liveArmed: true } })).verdict,
    "FAIL"
  );
  console.log(`${G} simulated liveArmed true fails`);

  assert.strictEqual(
    evaluate(healthySimulate({ posture: { mode: "PIPELINE_DRY_RUN", dryRunMode: false, liveArmed: false } })).verdict,
    "FAIL"
  );
  console.log(`${G} simulated dryRunMode false fails`);

  assert.strictEqual(
    evaluate(healthySimulate({ posture: { mode: "LIVE", dryRunMode: true, liveArmed: false } })).verdict,
    "FAIL"
  );
  console.log(`${G} simulated LIVE mode fails`);

  assert.strictEqual(
    evaluate(healthySimulate({ recoveryActionsJsonl: { exists: true } })).verdict,
    "FAIL"
  );
  console.log(`${G} simulated recovery_actions.jsonl present fails`);

  assert.strictEqual(
    evaluate(healthySimulate({
      stateFiles: {
        ...healthySimulate().stateFiles,
        "live_positions.json": { exists: true, parseOk: false, error: "bad json" }
      }
    })).verdict,
    "FAIL"
  );
  console.log(`${G} corrupt JSON state file fails`);

  const wrapperClassified = checkpoint.classifyProcesses([PS_EXECUTOR_WRAPPER, NODE_EXECUTOR_LOOP]);
  assert.strictEqual(wrapperClassified.executorLoopCount, 1);
  assert.strictEqual(wrapperClassified.executorLoop[0].pid, 7988);
  console.log(`${G} PowerShell wrapper does not count as executor loop`);

  const wrapperPass = evaluateFromProcessInventory([PS_EXECUTOR_WRAPPER, NODE_EXECUTOR_LOOP]);
  assert.strictEqual(wrapperPass.processes.executorLoopCount, 1);
  assert.strictEqual(wrapperPass.lockPidMatch.matches, true);
  assert.strictEqual(wrapperPass.verdict, "PASS");
  console.log(`${G} wrapper + actual node executor passes with lockPidMatch true`);

  const twoNodeLoops = [
    NODE_EXECUTOR_LOOP,
    { pid: 7999, commandLine: '"C:\\Program Files\\nodejs\\node.exe" live_executor.js --loop' }
  ];
  assert.strictEqual(evaluateFromProcessInventory(twoNodeLoops).verdict, "FAIL");
  assert.strictEqual(checkpoint.classifyProcesses(twoNodeLoops).executorLoopCount, 2);
  console.log(`${G} two actual node.exe executor loops still fail`);

  assert.strictEqual(
    evaluateFromProcessInventory([PS_EXECUTOR_WRAPPER, ...twoNodeLoops]).verdict,
    "FAIL"
  );
  console.log(`${G} wrapper + two actual node loops still fail`);

  assert.strictEqual(evaluateFromProcessInventory([PS_EXECUTOR_WRAPPER]).verdict, "FAIL");
  assert.strictEqual(checkpoint.classifyProcesses([PS_EXECUTOR_WRAPPER]).executorLoopCount, 0);
  console.log(`${G} wrapper only and no actual node loop still fails`);

  const lockMatchesWrapperOnly = evaluateFromProcessInventory([PS_EXECUTOR_WRAPPER, NODE_EXECUTOR_LOOP], 11080);
  assert.strictEqual(lockMatchesWrapperOnly.lockPidMatch.matches, false);
  assert.strictEqual(lockMatchesWrapperOnly.verdict, "FAIL");
  console.log(`${G} lock pid matching wrapper but not actual node process fails`);

  const runnerResult = spawnSync(process.execPath, ["run_24h_soak_checkpoints.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      R6A_TEST_INTERVALS: "1",
      R6A_TEST_SIMULATE: "healthy",
      SOAK_RUNS_DIR: soakRunsDir,
      TRACKTA_RUNTIME_ROOT: tmpRoot
    },
    encoding: "utf8",
    timeout: 30000
  });
  assert.strictEqual(runnerResult.status, 0, runnerResult.stdout + runnerResult.stderr);
  assert.ok(fs.existsSync(path.join(soakRunsDir, "r6a_24h_soak_summary.json")));
  const summary = JSON.parse(fs.readFileSync(path.join(soakRunsDir, "r6a_24h_soak_summary.json"), "utf8"));
  assert.strictEqual(summary.overallVerdict, "PASS");
  assert.strictEqual(summary.testMode, true);
  console.log(`${G} test mode intervals do not wait 24 hours`);

  if (beforeRepoConfigHash) {
    assert.ok(beforeRepoConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  console.log(`${G} no live_config.json mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRepoRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation unless temp fixture`);

  const soakSrc = fs.readFileSync(path.join(ROOT, "soak_checkpoint.js"), "utf8");
  const runnerSrc = fs.readFileSync(path.join(ROOT, "run_24h_soak_checkpoints.js"), "utf8");
  const spawnLines = (src) => src.split(/\r?\n/).filter(line => /\bspawn(?:Sync)?\s*\(|\bexec(?:Sync)?\s*\(/.test(line));
  assert.doesNotThrow(() => checkpoint.assertAllowlistedSpawnCommands(soakSrc));
  for (const line of spawnLines(soakSrc)) {
    assert.ok(!/taskkill|Stop-Process|start_fomo|stop_fomo/.test(line), line);
  }
  assert.ok(!/child_process/.test(runnerSrc));
  console.log(`${G} no process killing/restart commands in checkpoint tooling`);

  console.log("\nSOAK CHECKPOINT TOOLING TEST PASSED (19/19)");
} finally {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(soakRunsDir, { recursive: true, force: true }); } catch { /* ignore */ }
}
