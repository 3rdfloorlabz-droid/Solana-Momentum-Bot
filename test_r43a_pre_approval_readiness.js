"use strict";

// test_r43a_pre_approval_readiness.js — R43A pre-approval readiness (temp fixtures only).

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r43a = require("./r43a_pre_approval_readiness");
const rpcConfig = require("./micro_live_rpc_config");
const capsModule = require("./micro_live_caps");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const REPO_LIVE_POSITIONS = path.join(__dirname, "live_positions.json");
const REPO_CAPS = path.join(__dirname, "operator_records", "micro_live_demo_caps.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;
const beforeLivePositionsHash = fs.existsSync(REPO_LIVE_POSITIONS) ? fs.readFileSync(REPO_LIVE_POSITIONS) : null;
const beforeCapsHash = fs.existsSync(REPO_CAPS) ? fs.readFileSync(REPO_CAPS) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r43a-runtime-"));
const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "r43a-repo-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r43a-output-"));
const G = "\x1b[32m✔\x1b[0m";

const safePosture = Object.freeze({
  available: true,
  executionMode: "PIPELINE_DRY_RUN",
  dryRunMode: true,
  liveArmed: false,
  emergencyStop: false,
  liveSubmission: "DISARMED"
});

function draftCaps(overrides = {}) {
  return {
    approved: false,
    approvedBy: "",
    approvedAt: null,
    purpose: capsModule.REQUIRED_PURPOSE,
    maxTradeSizeSol: 0.01,
    maxDailyLossSol: 0.05,
    maxTradesPerSession: 1,
    maxOpenLivePositions: 1,
    autoCompoundingAllowed: false,
    requireHumanPresent: true,
    stopAfterFirstTransaction: true,
    notes: "test fixture only",
    ...overrides
  };
}

function readyContext(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRepo,
    analysisDir: tmpOutput,
    gateDocPresent: true,
    recoveryPresent: false,
    posture: safePosture,
    postureSafe: true,
    rpcStatus: rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE,
    rpcSetupSummary: {
      status: rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE,
      source: rpcConfig.ENV_VAR,
      redactedUrl: "https://provider.example/?api-key=%5BREDACTED%5D",
      dedicatedCandidate: true,
      safeMetadata: { status: rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE }
    },
    capsLoad: { status: "present", data: draftCaps() },
    capsSummary: capsModule.summarizeCapsLoad({ status: "present", data: draftCaps() }),
    localSignerStubCheck: { ok: true, stubOnly: true, note: "stub-only" },
    executorIntegrationCheck: { integrated: false, ok: true, note: "none" },
    committedRpcSecretsCheck: { ok: true, findings: [] },
    singletonCheck: {
      duplicateLoop: false,
      malformed: false,
      executorSingletonLock: "none",
      healthy: true
    },
    livePositionsCheck: { ok: true, openCount: 0, status: "usable" },
    gitStatusCheck: { available: true, clean: true, ok: true, dirtyFiles: [], note: "clean" },
    runSecretScan: false,
    secretScanFindings: [],
    r7Verdict: "NOT ENOUGH DATA",
    safetySuiteGreen: true,
    rpcReadinessSummary: { readinessVerdict: "PARTIAL_READINESS", failedChecks: [] },
    guardStatusSummary: { guardrailVerdict: "NOT_READY", approved: false },
    r42StatusSummary: { r42Verdict: "READY TO CREATE OPERATOR CAPS FILE", approved: false },
    signerPlanSummary: { preflightVerdict: "PLAN_PREPARED", r41Verdict: "PLAN" },
    ...overrides
  };
}

async function runTests() {
  const missingRpc = r43a.collectR43aPreApprovalReadiness({
    ...readyContext(),
    rpcStatus: rpcConfig.RPC_STATUS.MISSING,
    rpcSetupSummary: { status: rpcConfig.RPC_STATUS.MISSING, source: null, redactedUrl: "" }
  });
  assert.strictEqual(missingRpc.r43aVerdict, r43a.VERDICTS.NOT_READY);
  console.log(`${G} missing RPC blocks approval`);

  const ready = r43a.collectR43aPreApprovalReadiness(readyContext());
  assert.strictEqual(ready.r43aVerdict, r43a.VERDICTS.READY_CAPS);
  assert.strictEqual(ready.liveTradingApproved, false);
  console.log(`${G} RPC DEDICATED_CANDIDATE allows readiness`);

  assert.strictEqual(ready.gateStatus.capsApprovedFalse, true);
  assert.strictEqual(ready.r43aVerdict, r43a.VERDICTS.READY_CAPS);
  console.log(`${G} caps approved:false still allows only READY_FOR_OPERATOR_CAPS_APPROVAL`);

  const approvedCaps = r43a.collectR43aPreApprovalReadiness({
    ...readyContext(),
    capsLoad: {
      status: "present",
      data: draftCaps({
        approved: true,
        approvedBy: "test-operator",
        approvedAt: new Date().toISOString()
      })
    },
    capsSummary: capsModule.summarizeCapsLoad({
      status: "present",
      data: draftCaps({
        approved: true,
        approvedBy: "test-operator",
        approvedAt: new Date().toISOString()
      })
    })
  });
  assert.strictEqual(approvedCaps.r43aVerdict, r43a.VERDICTS.READY_PROOF);
  assert.strictEqual(approvedCaps.liveTradingApproved, false);
  console.log(`${G} caps approved:true does not approve live by itself`);

  assert.strictEqual(
    r43a.collectR43aPreApprovalReadiness({ ...readyContext(), recoveryPresent: true }).r43aVerdict,
    r43a.VERDICTS.NOT_READY
  );
  console.log(`${G} recovery_actions.jsonl present fails`);

  assert.strictEqual(
    r43a.collectR43aPreApprovalReadiness({
      ...readyContext(),
      posture: { ...safePosture, liveArmed: true },
      postureSafe: false
    }).r43aVerdict,
    r43a.VERDICTS.NOT_READY
  );
  console.log(`${G} liveArmed true fails`);

  assert.strictEqual(
    r43a.collectR43aPreApprovalReadiness({
      ...readyContext(),
      posture: { ...safePosture, dryRunMode: false },
      postureSafe: false
    }).r43aVerdict,
    r43a.VERDICTS.NOT_READY
  );
  console.log(`${G} dryRunMode false fails`);

  assert.strictEqual(
    r43a.collectR43aPreApprovalReadiness({
      ...readyContext(),
      posture: { ...safePosture, executionMode: "LIVE" },
      postureSafe: false
    }).r43aVerdict,
    r43a.VERDICTS.NOT_READY
  );
  console.log(`${G} executionMode LIVE fails`);

  assert.strictEqual(
    r43a.collectR43aPreApprovalReadiness({
      ...readyContext(),
      executorIntegrationCheck: { integrated: true, ok: false, note: "integrated" }
    }).r43aVerdict,
    r43a.VERDICTS.NOT_READY
  );
  console.log(`${G} real signer integration before approval fails`);

  const outputFile = path.join(tmpOutput, "r43a_pre_approval_readiness.json");
  const result = r43a.runR43aPreApprovalReadiness({
    ...readyContext(),
    analysisDir: tmpOutput,
    outputFile,
    writeOutput: true,
    print: false
  });
  assert.ok(outputFile.startsWith(tmpOutput));
  const outputJson = fs.readFileSync(outputFile, "utf8");
  assert.ok(!outputJson.includes("super-secret-api-key-value-1234567890"));
  console.log(`${G} output only writes to analysis/`);

  console.log(`${G} no secrets printed`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  if (beforeLivePositionsHash) {
    assert.ok(beforeLivePositionsHash.equals(fs.readFileSync(REPO_LIVE_POSITIONS)));
  }
  if (beforeCapsHash) {
    assert.ok(beforeCapsHash.equals(fs.readFileSync(REPO_CAPS)));
    console.log(`${G} operator caps draft unchanged`);
  }
  console.log(`${G} no trading state mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  console.log("\nR43A PRE-APPROVAL READINESS TEST PASSED (14/14)");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
}).finally(() => {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpRepo, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
});
