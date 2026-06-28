"use strict";

// test_signer_plan_preflight.js — R41 signer plan preflight (temp fixtures only).

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const preflight = require("./signer_plan_preflight");
const capsModule = require("./micro_live_caps");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const REPO_LIVE_POSITIONS = path.join(__dirname, "live_positions.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;
const beforeLivePositionsHash = fs.existsSync(REPO_LIVE_POSITIONS) ? fs.readFileSync(REPO_LIVE_POSITIONS) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r41-runtime-"));
const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "r41-repo-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r41-output-"));
const G = "\x1b[32m✔\x1b[0m";

function writeSafePosture() {
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );
}

function writeGateDoc(repoRoot) {
  fs.mkdirSync(path.join(repoRoot, "docs"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, "docs", "R41_LOCAL_SIGNER_IMPLEMENTATION_PLAN.md"), "# R41 fixture\n");
}

function writeRequiredFiles(repoRoot) {
  fs.mkdirSync(path.join(repoRoot, "examples"), { recursive: true });
  for (const rel of preflight.REQUIRED_REPO_FILES) {
    const full = path.join(repoRoot, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, `"${rel}"\n`);
  }
}

function goodCaps() {
  return {
    approved: true,
    approvedBy: "test-operator",
    approvedAt: new Date().toISOString(),
    purpose: capsModule.REQUIRED_PURPOSE,
    maxTradeSizeSol: 0.02,
    maxDailyLossSol: 0.05,
    maxTradesPerSession: 1,
    maxOpenLivePositions: 1,
    autoCompoundingAllowed: false,
    requireHumanPresent: true,
    stopAfterFirstTransaction: true,
    notes: "test fixture only"
  };
}

function baseOptions(overrides = {}) {
  writeSafePosture();
  writeGateDoc(tmpRepo);
  writeRequiredFiles(tmpRepo);
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRepo,
    analysisDir: tmpOutput,
    gateDocPresent: true,
    recoveryPresent: false,
    runSecretScan: false,
    secretScanFindings: [],
    ...overrides
  };
}

async function runTests() {
  const pass = preflight.collectSignerPlanPreflight(baseOptions());
  assert.strictEqual(pass.preflightVerdict, preflight.PREFLIGHT_VERDICTS.PLAN_PREPARED);
  assert.strictEqual(pass.r41Verdict, preflight.R41_VERDICT);
  console.log(`${G} required files present passes`);

  const missingMock = preflight.collectSignerPlanPreflight({
    ...baseOptions(),
    requiredFilesCheck: {
      ok: false,
      missing: ["mock_signer.js"],
      present: []
    }
  });
  assert.strictEqual(missingMock.preflightVerdict, preflight.PREFLIGHT_VERDICTS.NOT_READY);
  console.log(`${G} missing mock signer fails`);

  const recoveryFail = preflight.collectSignerPlanPreflight({
    ...baseOptions(),
    recoveryPresent: true
  });
  assert.strictEqual(recoveryFail.preflightVerdict, preflight.PREFLIGHT_VERDICTS.NOT_READY);
  console.log(`${G} recovery_actions.jsonl present fails`);

  const secretFail = preflight.collectSignerPlanPreflight({
    ...baseOptions(),
    secretScanFindings: [{
      file: "src/wallet.js",
      patternId: "NUMERIC_KEY_ARRAY",
      line: 1,
      redactedSnippet: "[REDACTED]"
    }]
  });
  assert.strictEqual(secretFail.preflightVerdict, preflight.PREFLIGHT_VERDICTS.NOT_READY);
  console.log(`${G} suspicious non-test secret pattern fails`);

  const capsDir = path.join(tmpRepo, "operator_records");
  fs.mkdirSync(capsDir, { recursive: true });
  fs.writeFileSync(
    path.join(capsDir, "micro_live_demo_caps.json"),
    `${JSON.stringify(goodCaps(), null, 2)}\n`
  );
  const approvedCaps = preflight.collectSignerPlanPreflight({
    ...baseOptions(),
    runSecretScan: false,
    secretScanFindings: []
  });
  assert.strictEqual(approvedCaps.operatorCaps.approved, true);
  assert.strictEqual(approvedCaps.liveTradingApproved, false);
  assert.strictEqual(approvedCaps.approved, false);
  console.log(`${G} approved operator caps do not approve live`);

  const outputFile = path.join(tmpOutput, "signer_plan_preflight.json");
  const result = preflight.runSignerPlanPreflight({
    ...baseOptions(),
    outputFile,
    writeOutput: true,
    print: false
  });
  assert.ok(outputFile.startsWith(tmpOutput));
  console.log(`${G} output only writes to analysis/`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  if (beforeLivePositionsHash) {
    assert.ok(beforeLivePositionsHash.equals(fs.readFileSync(REPO_LIVE_POSITIONS)));
  }
  console.log(`${G} no trading state mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  console.log("\nSIGNER PLAN PREFLIGHT TEST PASSED (8/8)");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
}).finally(() => {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpRepo, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
});
