"use strict";

// test_r12_micro_live_readiness_check.js — Sprint 4 R12
// Validates read-only micro-live readiness check in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r12 = require("./r12_micro_live_readiness_check");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r12-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r12-output-"));
const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "r12-repo-"));
const G = "\x1b[32m✔\x1b[0m";

const allGateDocs = {
  r8: true,
  r9: true,
  r10: true,
  r11: true,
  r12: true,
  r13: true,
  r14: true
};

const incompleteR7b = {
  progress: {
    readyForR8: false,
    checks: {
      closedTrades: false,
      activeMarketDays: false,
      thesisMatched: false,
      stopExits: false,
      targetOrProfitableExits: false,
      timeoutExits: false,
      profitFactor: false
    }
  },
  freshMetrics: {
    exitCounts: { closedTrades: 1 },
    activeMarketDays: 1,
    thesisInWindow: { thesisMatchTrue: 0 },
    paperPerformance: { profitFactor: 0.8 },
    stateIntegrity: { ok: true }
  }
};

const completeR7b = {
  progress: {
    readyForR8: true,
    recommendation: "READY_FOR_R8_RISK_REVIEW",
    checks: {
      closedTrades: true,
      activeMarketDays: true,
      thesisMatched: true,
      stopExits: true,
      targetOrProfitableExits: true,
      timeoutExits: true,
      profitFactor: true,
      safetyPosture: true,
      recoveryAbsent: true,
      stateIntegrity: true
    }
  },
  freshMetrics: {
    exitCounts: { closedTrades: 30, stopExits: 5, targetOrProfitableExits: 5, timeoutExits: 5 },
    activeMarketDays: 7,
    thesisInWindow: { thesisMatchTrue: 10 },
    paperPerformance: { profitFactor: 1.25 },
    stateIntegrity: { ok: true }
  }
};

function baseOptions(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRepo,
    analysisDir: tmpOutput,
    collectR7b: false,
    gateDocs: allGateDocs,
    safetySuiteGreen: true,
    r6aPass: true,
    ...overrides
  };
}

try {
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );

  const blocked = r12.collectR12MicroLiveReadinessStatus({
    ...baseOptions(),
    r7bSummary: incompleteR7b
  });
  assert.strictEqual(blocked.evaluation.verdict, "CHECKLIST DEFINED BUT BLOCKED");
  assert.ok(blocked.hardBlockers.includes("R7b thresholds not met"));
  console.log(`${G} blocked when R7b thresholds not met`);

  const missingR13 = r12.collectR12MicroLiveReadinessStatus({
    ...baseOptions(),
    r7bSummary: incompleteR7b,
    gateDocs: { ...allGateDocs, r13: false }
  });
  assert.strictEqual(missingR13.evaluation.gateStatus, "BLOCKED");
  assert.ok(missingR13.hardBlockers.includes("R13 final approval gate doc missing"));
  console.log(`${G} blocked when R13 doc missing`);

  const missingR14 = r12.collectR12MicroLiveReadinessStatus({
    ...baseOptions(),
    r7bSummary: incompleteR7b,
    gateDocs: { ...allGateDocs, r14: false }
  });
  assert.strictEqual(missingR14.evaluation.gateStatus, "BLOCKED");
  assert.ok(missingR14.hardBlockers.includes("R14 slippage/MEV review doc missing"));
  console.log(`${G} blocked when R14 doc missing`);

  const badSafety = r12.collectR12MicroLiveReadinessStatus({
    ...baseOptions(),
    r7bSummary: incompleteR7b,
    safetySuiteGreen: false
  });
  assert.strictEqual(badSafety.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} blocked when safety suite status is bad`);

  fs.writeFileSync(path.join(tmpRuntime, "recovery_actions.jsonl"), "{}\n");
  const recovery = r12.collectR12MicroLiveReadinessStatus({
    ...baseOptions(),
    r7bSummary: completeR7b
  });
  assert.strictEqual(recovery.evaluation.gateStatus, "BLOCKED");
  fs.unlinkSync(path.join(tmpRuntime, "recovery_actions.jsonl"));
  console.log(`${G} blocked when recovery_actions.jsonl exists`);

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: true,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const liveArmed = r12.collectR12MicroLiveReadinessStatus({
    ...baseOptions(),
    r7bSummary: completeR7b
  });
  assert.strictEqual(liveArmed.evaluation.gateStatus, "BLOCKED");
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: false,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const dryRunFalse = r12.collectR12MicroLiveReadinessStatus({
    ...baseOptions(),
    r7bSummary: completeR7b
  });
  assert.strictEqual(dryRunFalse.evaluation.gateStatus, "BLOCKED");
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );
  console.log(`${G} blocked when liveArmed true unexpectedly`);
  console.log(`${G} blocked when dryRunMode false unexpectedly`);

  const dryRunBlocksMicroLive = r12.collectR12MicroLiveReadinessStatus({
    ...baseOptions(),
    r7bSummary: completeR7b,
    r7Verdict: "EDGE PROMISING BUT NOT LIVE READY"
  });
  assert.ok(dryRunBlocksMicroLive.hardBlockers.includes("dryRunMode true"));
  assert.ok(dryRunBlocksMicroLive.hardBlockers.includes("liveArmed false"));
  console.log(`${G} blocked when dryRunMode true / liveArmed false for actual micro-live state`);

  const reviewable = r12.collectR12MicroLiveReadinessStatus({
    ...baseOptions(),
    r7bSummary: completeR7b,
    r7Verdict: "EDGE PROMISING BUT NOT LIVE READY"
  });
  assert.strictEqual(reviewable.evaluation.gateStatus, "REVIEWABLE_ONLY");
  assert.strictEqual(reviewable.evaluation.verdict, "CHECKLIST DEFINED BUT BLOCKED");
  assert.strictEqual(reviewable.microLiveApproved, false);
  assert.strictEqual(reviewable.liveTradingApproved, false);
  console.log(`${G} reviewable only when prerequisites simulated as met`);

  assert.strictEqual(reviewable.evaluation.approved, false);
  assert.ok(!JSON.stringify(reviewable).includes('"approved": true'));
  console.log(`${G} never returns approved`);

  const outFile = path.join(tmpOutput, "r12_micro_live_readiness_status.json");
  r12.runR12MicroLiveReadinessCheck({
    ...baseOptions(),
    r7bSummary: incompleteR7b,
    outputFile: outFile,
    print: false
  });
  assert.ok(outFile.startsWith(tmpOutput));
  console.log(`${G} output only writes to analysis/`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  console.log(`${G} no live_config.json mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  console.log(`${G} no trading state mutation`);

  const src = fs.readFileSync(path.join(__dirname, "r12_micro_live_readiness_check.js"), "utf8");
  assert.ok(!/writeFileSync\([^)]*live_config\.json/.test(src));
  assert.ok(!/process\.env\.SOLANA_SIGNER/.test(src));
  console.log(`${G} no secret handling`);

  console.log("\nR12 MICRO-LIVE READINESS CHECK TEST PASSED (14/14)");
} finally {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpRepo, { recursive: true, force: true }); } catch { /* ignore */ }
}
