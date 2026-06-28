"use strict";

// test_r8_risk_controls_check.js — Sprint 4 R8
// Validates read-only R8 risk controls check in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r8 = require("./r8_risk_controls_check");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r8-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r8-output-"));
const G = "\x1b[32m✔\x1b[0m";

try {
  const missing = r8.collectR8RiskControlsStatus({
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRuntime
  });
  assert.strictEqual(missing.evaluation.verdict, "RISK CONTROLS DEFINED BUT NOT ARMED");
  assert.strictEqual(missing.liveTradingApproved, false);
  console.log(`${G} missing metrics handled safely`);

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false
    }, null, 2)}\n`
  );
  fs.mkdirSync(path.join(tmpOutput), { recursive: true });
  fs.writeFileSync(
    path.join(tmpOutput, "r7_strategy_metrics.json"),
    `${JSON.stringify({ recommendation: { verdict: "NOT ENOUGH DATA" } }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(tmpOutput, "r7b_daily_summary.json"),
    `${JSON.stringify({ progress: { readyForR8: false, recommendation: "CONTINUE_DRY_RUN" } }, null, 2)}\n`
  );

  const status = r8.collectR8RiskControlsStatus({
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRuntime
  });
  const withMetrics = r8.collectR8RiskControlsStatus({
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRuntime,
    analysisDir: tmpOutput
  });

  assert.strictEqual(withMetrics.evaluation.verdict, "RISK CONTROLS DEFINED BUT NOT ARMED");
  assert.ok(withMetrics.blockers.includes("R7b sample thresholds not met"));
  console.log(`${G} controls defined but not armed when R7b incomplete`);

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "LIVE",
      dryRunMode: false,
      liveArmed: true
    }, null, 2)}\n`
  );
  const unsafe = r8.collectR8RiskControlsStatus({
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRuntime
  });
  assert.strictEqual(unsafe.evaluation.verdict, "NOT READY FOR LIVE");
  console.log(`${G} unsafe posture yields NOT READY FOR LIVE`);

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false
    }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(tmpOutput, "r7_strategy_metrics.json"),
    `${JSON.stringify({ recommendation: { verdict: "EDGE PROMISING BUT NOT LIVE READY" } }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(tmpOutput, "r7b_daily_summary.json"),
    `${JSON.stringify({ progress: { readyForR8: true, recommendation: "READY_FOR_R8_RISK_REVIEW" } }, null, 2)}\n`
  );
  const readyR9 = r8.deriveVerdict({
    posture: { executionMode: "PIPELINE_DRY_RUN", dryRunMode: true, liveArmed: false },
    recoveryActionsJsonl: { exists: false },
    r7Verdict: "EDGE PROMISING BUT NOT LIVE READY",
    r7bReadyForR8: true
  });
  assert.strictEqual(readyR9.verdict, "READY FOR WALLET/SIGNER REVIEW");
  console.log(`${G} ready for wallet/signer review only when gates met`);

  const outFile = path.join(tmpOutput, "r8_risk_controls_status.json");
  r8.runR8RiskControlsCheck({
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRuntime,
    outputFile: outFile,
    print: false
  });
  assert.ok(fs.existsSync(outFile));
  assert.strictEqual(JSON.parse(fs.readFileSync(outFile, "utf8")).liveTradingApproved, false);
  console.log(`${G} output only writes to analysis/`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  console.log(`${G} no live_config.json mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  const src = fs.readFileSync(path.join(__dirname, "r8_risk_controls_check.js"), "utf8");
  assert.ok(!/writeFileSync\([^)]*live_config\.json/.test(src));
  assert.ok(!/SOLANA_SIGNER|private.?key|secret/i.test(src));
  console.log(`${G} no wallet/signer handling or config mutation`);

  console.log("\nR8 RISK CONTROLS CHECK TEST PASSED (8/8)");
} finally {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
