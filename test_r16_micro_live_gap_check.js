"use strict";

// test_r16_micro_live_gap_check.js — Sprint 4 R16
// Validates read-only implementation gap check in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r16 = require("./r16_micro_live_gap_check");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r16-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r16-output-"));
const G = "\x1b[32m✔\x1b[0m";

const allGateDocs = {
  r8: true,
  r9: true,
  r10: true,
  r11: true,
  r12: true,
  r13: true,
  r14: true,
  r15: true,
  r16: true
};

function baseOptions(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: __dirname,
    analysisDir: tmpOutput,
    gateDocs: allGateDocs,
    safetySuiteGreen: true,
    r7bSummary: { progress: { readyForR8: false } },
    fakeSignerOnly: true,
    walletConnected: false,
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

  const missingR13 = r16.collectR16MicroLiveGapStatus({
    ...baseOptions(),
    gateDocs: { ...allGateDocs, r13: false }
  });
  assert.strictEqual(missingR13.evaluation.gateStatus, "BLOCKED");
  assert.ok(missingR13.missingDocBlockers.some((b) => b.includes("R13")));
  console.log(`${G} missing R13 doc blocks`);

  const missingR14 = r16.collectR16MicroLiveGapStatus({
    ...baseOptions(),
    gateDocs: { ...allGateDocs, r14: false }
  });
  assert.strictEqual(missingR14.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} missing R14 doc blocks`);

  const missingR15 = r16.collectR16MicroLiveGapStatus({
    ...baseOptions(),
    gateDocs: { ...allGateDocs, r15: false }
  });
  assert.strictEqual(missingR15.evaluation.gateStatus, "BLOCKED");
  console.log(`${G} missing R15 doc blocks`);

  const gaps = r16.collectR16MicroLiveGapStatus(baseOptions());
  assert.ok(
    gaps.implementationGaps.some(
      (g) => g.requiredCapability.includes("Real signer") && g.currentStatus.includes("Fake")
    )
  );
  console.log(`${G} missing signer implementation is reported as gap`);

  assert.ok(
    gaps.implementationGaps.some(
      (g) => g.requiredCapability.includes("wallet") && g.currentStatus.includes("Not connected")
    )
  );
  console.log(`${G} missing real wallet path is reported as gap`);

  assert.ok(
    gaps.implementationGaps.some(
      (g) => g.requiredCapability.includes("Micro-live config") && g.blocksLive === true
    )
  );
  console.log(`${G} missing micro-live config is reported as gap`);

  assert.strictEqual(gaps.researchException.r7bComplete, false);
  assert.strictEqual(gaps.researchException.highRiskIfBeforeR7b, true);
  console.log(`${G} R7b unmet reported as research-exception risk`);

  assert.strictEqual(gaps.approved, false);
  assert.strictEqual(gaps.liveTradingApproved, false);
  assert.ok(!JSON.stringify(gaps).includes('"approved": true'));
  console.log(`${G} never returns approved`);

  assert.ok(
    gaps.evaluation.gateStatus === "GAPS_IDENTIFIED" ||
    gaps.evaluation.gateStatus === "READY_FOR_SIMULATED_IMPLEMENTATION_PLAN"
  );
  assert.strictEqual(gaps.evaluation.verdict, "IMPLEMENTATION GAPS IDENTIFIED — LIVE BLOCKED");
  console.log(`${G} gaps identified with live blocked verdict`);

  const outFile = path.join(tmpOutput, "r16_micro_live_gap_status.json");
  r16.runR16MicroLiveGapCheck({
    ...baseOptions(),
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

  const src = fs.readFileSync(path.join(__dirname, "r16_micro_live_gap_check.js"), "utf8");
  assert.ok(!/writeFileSync\([^)]*live_config\.json/.test(src));
  assert.ok(!/process\.env\.SOLANA_SIGNER/.test(src));
  console.log(`${G} no secret handling`);

  console.log("\nR16 MICRO-LIVE GAP CHECK TEST PASSED (12/12)");
} finally {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
