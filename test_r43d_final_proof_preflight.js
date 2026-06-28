"use strict";

// test_r43d_final_proof_preflight.js — R43D final proof preflight (temp fixtures only).

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r43d = require("./r43d_final_proof_preflight");
const r43c = require("./r43c_local_signer_readiness");
const r43b = require("./r43b_operator_caps_approval_check");
const capsModule = require("./micro_live_caps");
const rpcConfig = require("./micro_live_rpc_config");

const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const REPO_LIVE_POSITIONS = path.join(__dirname, "live_positions.json");
const REPO_CAPS = path.join(__dirname, "operator_records", "micro_live_demo_caps.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;
const beforeLivePositionsHash = fs.existsSync(REPO_LIVE_POSITIONS) ? fs.readFileSync(REPO_LIVE_POSITIONS) : null;
const beforeCapsHash = fs.existsSync(REPO_CAPS) ? fs.readFileSync(REPO_CAPS) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r43d-runtime-"));
const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "r43d-repo-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r43d-output-"));
const G = "\x1b[32m✔\x1b[0m";

const safePosture = Object.freeze({
  available: true,
  executionMode: "PIPELINE_DRY_RUN",
  dryRunMode: true,
  liveArmed: false,
  emergencyStop: false,
  liveSubmission: "DISARMED"
});

function approvedCaps(overrides = {}) {
  return {
    approved: true,
    approvedBy: "Taylor Cheaney",
    approvedAt: new Date().toISOString(),
    approvalText: r43b.REQUIRED_APPROVAL_TEXT,
    approvalScope: r43b.REQUIRED_APPROVAL_SCOPE,
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
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );
  fs.mkdirSync(path.join(tmpRepo, "docs"), { recursive: true });
  fs.writeFileSync(path.join(tmpRepo, "docs", "R43D_FINAL_PROOF_PREFLIGHT.md"), "# R43D fixture\n");
  fs.writeFileSync(path.join(tmpRepo, ".gitignore"), "operator_records/local_rpc_config.json\n");

  return {
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRepo,
    outputDir: tmpOutput,
    analysisDir: tmpOutput,
    gateDocPresent: true,
    recoveryPresent: false,
    posture: safePosture,
    postureSafe: true,
    humanPresent: false,
    cli: { humanPresent: false },
    rpcStatus: rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE,
    rpcSetupSummary: {
      status: rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE,
      source: rpcConfig.ENV_VAR,
      redactedUrl: "https://provider.example/?api-key=%5BREDACTED%5D",
      dedicatedCandidate: true
    },
    capsLoad: { status: "present", data: approvedCaps() },
    gitStatusCheck: { available: true, clean: true, ok: true, dirtyFiles: [], untrackedSuspicious: [], note: "clean" },
    localRpcGitignoreCheck: { ok: true, gitignored: true, tracked: false, note: "gitignored" },
    committedRpcSecretsCheck: { ok: true, findings: [] },
    r43cStatusSummary: {
      r43cVerdict: r43c.VERDICTS.READY,
      checks: [],
      blockers: []
    },
    providerCheck: { ok: true, detail: "blocked without guards" },
    executorIntegrationCheck: { integrated: false, ok: true, note: "none" },
    singletonCheck: {
      duplicateLoop: false,
      malformed: false,
      executorSingletonLock: "none",
      healthy: true
    },
    livePositionsCheck: { ok: true, openCount: 0, status: "missing" },
    sessionTradesCheck: { count: 0, ok: true, status: "missing" },
    secretScanFindings: [],
    analysisSecretCheck: { ok: true, suspicious: [] },
    localSecretSourceCheck: {
      envSecretJsonPresent: false,
      keyfilePathPresent: false,
      contentPrinted: false,
      contentRead: false,
      note: "fixture"
    },
    r7Verdict: "NOT ENOUGH DATA",
    runSecretScan: false,
    ...overrides
  };
}

try {
  const withoutHuman = r43d.collectR43dFinalProofPreflight(readyContext());
  assert.strictEqual(withoutHuman.r43dVerdict, r43d.VERDICTS.NOT_READY);
  assert.ok(withoutHuman.blockers.some((b) => /humanPresent/i.test(b)));
  console.log(`${G} missing human-present flag blocks`);

  const withHuman = r43d.collectR43dFinalProofPreflight(readyContext({
    humanPresent: true,
    cli: { humanPresent: true }
  }));
  assert.strictEqual(withHuman.r43dVerdict, r43d.VERDICTS.READY);
  console.log(`${G} human-present flag allows if all other gates pass`);

  assert.strictEqual(
    r43d.collectR43dFinalProofPreflight(readyContext({
      humanPresent: true,
      cli: { humanPresent: true },
      gitStatusCheck: {
        available: true,
        clean: false,
        ok: false,
        dirtyFiles: [" M local_signer.js"],
        untrackedSuspicious: [],
        note: "dirty"
      }
    })).r43dVerdict,
    r43d.VERDICTS.NOT_READY
  );
  console.log(`${G} dirty git blocks`);

  assert.strictEqual(
    r43d.collectR43dFinalProofPreflight(readyContext({
      humanPresent: true,
      cli: { humanPresent: true },
      rpcStatus: rpcConfig.RPC_STATUS.MISSING,
      rpcSetupSummary: { status: rpcConfig.RPC_STATUS.MISSING, redactedUrl: "" }
    })).r43dVerdict,
    r43d.VERDICTS.NOT_READY
  );
  console.log(`${G} missing RPC blocks`);

  assert.strictEqual(
    r43d.collectR43dFinalProofPreflight(readyContext({
      humanPresent: true,
      cli: { humanPresent: true },
      rpcStatus: rpcConfig.RPC_STATUS.PUBLIC_FALLBACK,
      rpcSetupSummary: { status: rpcConfig.RPC_STATUS.PUBLIC_FALLBACK, redactedUrl: "[REDACTED]" }
    })).r43dVerdict,
    r43d.VERDICTS.NOT_READY
  );
  console.log(`${G} public fallback RPC blocks`);

  assert.strictEqual(
    r43d.collectR43dFinalProofPreflight(readyContext({
      humanPresent: true,
      cli: { humanPresent: true },
      capsLoad: { status: "present", data: approvedCaps({ approved: false }) }
    })).r43dVerdict,
    r43d.VERDICTS.NOT_READY
  );
  console.log(`${G} unapproved caps block`);

  assert.strictEqual(
    r43d.collectR43dFinalProofPreflight(readyContext({
      humanPresent: true,
      cli: { humanPresent: true },
      capsLoad: { status: "present", data: approvedCaps({ maxTradeSizeSol: 0.02 }) }
    })).r43dVerdict,
    r43d.VERDICTS.NOT_READY
  );
  console.log(`${G} unsafe caps block`);

  assert.strictEqual(
    r43d.collectR43dFinalProofPreflight(readyContext({
      humanPresent: true,
      cli: { humanPresent: true },
      posture: { ...safePosture, liveArmed: true },
      postureSafe: false
    })).r43dVerdict,
    r43d.VERDICTS.NOT_READY
  );
  console.log(`${G} liveArmed true blocks`);

  assert.strictEqual(
    r43d.collectR43dFinalProofPreflight(readyContext({
      humanPresent: true,
      cli: { humanPresent: true },
      posture: { ...safePosture, dryRunMode: false },
      postureSafe: false
    })).r43dVerdict,
    r43d.VERDICTS.NOT_READY
  );
  console.log(`${G} dryRunMode false blocks`);

  assert.strictEqual(
    r43d.collectR43dFinalProofPreflight(readyContext({
      humanPresent: true,
      cli: { humanPresent: true },
      posture: { ...safePosture, executionMode: "LIVE" },
      postureSafe: false
    })).r43dVerdict,
    r43d.VERDICTS.NOT_READY
  );
  console.log(`${G} executionMode LIVE blocks`);

  assert.strictEqual(
    r43d.collectR43dFinalProofPreflight(readyContext({
      humanPresent: true,
      cli: { humanPresent: true },
      recoveryPresent: true
    })).r43dVerdict,
    r43d.VERDICTS.NOT_READY
  );
  console.log(`${G} recovery_actions.jsonl present blocks`);

  assert.strictEqual(
    r43d.collectR43dFinalProofPreflight(readyContext({
      humanPresent: true,
      cli: { humanPresent: true },
      livePositionsCheck: { ok: false, openCount: 1, status: "usable" }
    })).r43dVerdict,
    r43d.VERDICTS.NOT_READY
  );
  console.log(`${G} open live position blocks`);

  assert.strictEqual(
    r43d.collectR43dFinalProofPreflight(readyContext({
      humanPresent: true,
      cli: { humanPresent: true },
      singletonCheck: {
        duplicateLoop: true,
        malformed: false,
        executorSingletonLock: "active",
        healthy: false
      }
    })).r43dVerdict,
    r43d.VERDICTS.NOT_READY
  );
  console.log(`${G} duplicate executor blocks`);

  assert.strictEqual(
    r43d.collectR43dFinalProofPreflight(readyContext({
      humanPresent: true,
      cli: { humanPresent: true },
      r43cStatusSummary: { r43cVerdict: r43c.VERDICTS.NOT_READY }
    })).r43dVerdict,
    r43d.VERDICTS.NOT_READY
  );
  console.log(`${G} signer not ready blocks`);

  assert.strictEqual(
    r43d.collectR43dFinalProofPreflight(readyContext({
      humanPresent: true,
      cli: { humanPresent: true },
      executorIntegrationCheck: { integrated: true, ok: false, note: "integrated" }
    })).r43dVerdict,
    r43d.VERDICTS.NOT_READY
  );
  console.log(`${G} live_executor signer integration before R43E blocks`);

  assert.strictEqual(
    r43d.collectR43dFinalProofPreflight(readyContext({
      humanPresent: true,
      cli: { humanPresent: true },
      secretScanFindings: [{ file: "live_config.json", patternId: "ENV_SECRET_ASSIGNMENT", line: 1 }]
    })).r43dVerdict,
    r43d.VERDICTS.NOT_READY
  );
  console.log(`${G} secret scan with non-test finding blocks`);

  const outputResult = r43d.runR43dFinalProofPreflight(readyContext({
    humanPresent: true,
    cli: { humanPresent: true }
  }));
  assert.ok(outputResult.outputFile.startsWith(tmpOutput));
  assert.ok(outputResult.outputFile.includes(`${path.sep}r43d_final_proof_preflight.json`));
  const outputJson = JSON.stringify(outputResult);
  assert.strictEqual(outputResult.liveTradingApproved, false);
  assert.ok(!/"privateKey"\s*:/.test(outputJson));
  assert.ok(!/"secretKey"\s*:/.test(outputJson));
  assert.ok(!/\[\s*(?:\d{1,3}\s*,\s*){31,}\d{1,3}\s*\]/.test(outputJson));
  console.log(`${G} output writes only to analysis/`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  if (beforeLivePositionsHash) {
    assert.ok(beforeLivePositionsHash.equals(fs.readFileSync(REPO_LIVE_POSITIONS)));
  }
  if (beforeCapsHash) {
    assert.ok(beforeCapsHash.equals(fs.readFileSync(REPO_CAPS)));
  }
  console.log(`${G} no trading state mutation`);

  const classified = r43d.classifyLocalSignerSecretPresence({
    repoRoot: tmpRepo,
    env: { [require("./local_signer").ENV_SECRET_JSON]: "[1,2,3]" }
  });
  assert.strictEqual(classified.envSecretJsonPresent, true);
  assert.strictEqual(classified.contentPrinted, false);
  assert.strictEqual(classified.contentRead, false);
  console.log(`${G} no secrets printed`);

  console.log("\nR43D FINAL PROOF PREFLIGHT TEST PASSED (22/22)");
} catch (err) {
  console.error(err);
  process.exit(1);
}
