"use strict";

// test_r42_final_micro_live_review.js — R42 final micro-live review (temp fixtures only).

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r42 = require("./r42_final_micro_live_review");
const capsModule = require("./micro_live_caps");
const guardrails = require("./micro_live_guardrails");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const REPO_LIVE_POSITIONS = path.join(__dirname, "live_positions.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;
const beforeLivePositionsHash = fs.existsSync(REPO_LIVE_POSITIONS) ? fs.readFileSync(REPO_LIVE_POSITIONS) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r42-runtime-"));
const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "r42-repo-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r42-output-"));
const G = "\x1b[32m✔\x1b[0m";

const safePosture = Object.freeze({
  available: true,
  executionMode: "PIPELINE_DRY_RUN",
  dryRunMode: true,
  liveArmed: false,
  emergencyStop: false,
  dedicatedRpcConfigured: false
});

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
  fs.writeFileSync(path.join(tmpRuntime, "live_positions.json"), "[]\n");
}

function writeRequiredArtifacts(repoRoot) {
  for (const rel of r42.REQUIRED_DOCS) {
    const full = path.join(repoRoot, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, `# ${rel}\n`);
  }
  for (const rel of r42.REQUIRED_MODULES) {
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
  writeRequiredArtifacts(tmpRepo);
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRepo,
    analysisDir: tmpOutput,
    posture: safePosture,
    postureSafe: true,
    recoveryPresent: false,
    docsCheck: { ok: true, missing: [], present: [...r42.REQUIRED_DOCS] },
    modulesCheck: { ok: true, missing: [], present: [...r42.REQUIRED_MODULES] },
    capsLoad: { status: "missing", file: path.join(tmpRepo, r42.OPERATOR_CAPS), data: null },
    capsSummary: capsModule.summarizeCapsLoad({ status: "missing", file: "missing", data: null }),
    localSignerStubPresent: false,
    executorIntegration: { integrated: false, ok: true, note: "no signer integration" },
    dedicatedRpcReady: false,
    finalHumanApproval: false,
    singletonCheck: {
      executorSingletonLock: "none",
      duplicateLoop: false,
      healthy: true,
      malformed: false
    },
    livePositionsCheck: { ok: true, openCount: 0, status: "usable" },
    guardrailVerdict: guardrails.VERDICTS.NOT_READY,
    r7Verdict: "NOT ENOUGH DATA",
    ...overrides
  };
}

async function runTests() {
  const missingCaps = r42.collectR42FinalMicroLiveReview(baseOptions());
  assert.notStrictEqual(missingCaps.r42Verdict, r42.VERDICTS.READY_PROOF);
  assert.strictEqual(missingCaps.r42Verdict, r42.VERDICTS.READY_CAPS);
  console.log(`${G} missing caps keeps verdict below final proof`);

  const approvedNoStub = r42.collectR42FinalMicroLiveReview({
    ...baseOptions(),
    capsLoad: { status: "present", data: goodCaps() },
    capsSummary: capsModule.summarizeCapsLoad({ status: "present", data: goodCaps() })
  });
  assert.notStrictEqual(approvedNoStub.r42Verdict, r42.VERDICTS.READY_PROOF);
  assert.strictEqual(approvedNoStub.r42Verdict, r42.VERDICTS.READY_STUBS);
  console.log(`${G} missing signer implementation blocks final proof`);

  assert.strictEqual(
    r42.collectR42FinalMicroLiveReview({ ...baseOptions(), recoveryPresent: true }).r42Verdict,
    r42.VERDICTS.NOT_READY
  );
  console.log(`${G} recovery_actions.jsonl present fails`);

  assert.strictEqual(
    r42.collectR42FinalMicroLiveReview({
      ...baseOptions(),
      posture: { ...safePosture, liveArmed: true },
      postureSafe: false
    }).r42Verdict,
    r42.VERDICTS.NOT_READY
  );
  console.log(`${G} liveArmed true fails`);

  assert.strictEqual(
    r42.collectR42FinalMicroLiveReview({
      ...baseOptions(),
      posture: { ...safePosture, dryRunMode: false },
      postureSafe: false
    }).r42Verdict,
    r42.VERDICTS.NOT_READY
  );
  console.log(`${G} dryRunMode false fails`);

  assert.strictEqual(
    r42.collectR42FinalMicroLiveReview({
      ...baseOptions(),
      posture: { ...safePosture, executionMode: "LIVE" },
      postureSafe: false
    }).r42Verdict,
    r42.VERDICTS.NOT_READY
  );
  console.log(`${G} executionMode LIVE fails`);

  const checklist = r42.collectR42FinalMicroLiveReview(baseOptions());
  assert.strictEqual(checklist.r42Verdict, r42.VERDICTS.READY_CAPS);
  assert.strictEqual(checklist.liveTradingApproved, false);
  assert.strictEqual(checklist.approved, false);
  assert.notStrictEqual(checklist.r42Verdict, r42.VERDICTS.READY_PROOF);
  console.log(`${G} all docs present passes checklist readiness but not live approval`);

  const outputFile = path.join(tmpOutput, "r42_final_micro_live_review.json");
  const result = r42.runR42FinalMicroLiveReview({
    ...baseOptions(),
    outputFile,
    writeOutput: true,
    print: false
  });
  assert.ok(outputFile.startsWith(tmpOutput));
  assert.ok(!JSON.stringify(result.status).includes('"liveTradingApproved": true'));
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

  console.log("\nR42 FINAL MICRO-LIVE REVIEW TEST PASSED (9/9)");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
}).finally(() => {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpRepo, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
});
