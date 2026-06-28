"use strict";

// test_r43e_operator_broadcast_deps.js — R43E-3 operator broadcast deps (temp fixtures only).

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r43e = require("./r43e_one_transaction_proof_harness");
const r43d = require("./r43d_final_proof_preflight");
const r43c = require("./r43c_local_signer_readiness");
const r43b = require("./r43b_operator_caps_approval_check");
const capsModule = require("./micro_live_caps");
const rpcConfig = require("./micro_live_rpc_config");
const operatorDeps = require("./r43e_operator_broadcast_deps");

const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const REPO_LIVE_POSITIONS = path.join(__dirname, "live_positions.json");
const REPO_CAPS = path.join(__dirname, "operator_records", "micro_live_demo_caps.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;
const beforeLivePositionsHash = fs.existsSync(REPO_LIVE_POSITIONS) ? fs.readFileSync(REPO_LIVE_POSITIONS) : null;
const beforeCapsHash = fs.existsSync(REPO_CAPS) ? fs.readFileSync(REPO_CAPS) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r43e3-runtime-"));
const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "r43e3-repo-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r43e3-output-"));
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

function proofTarget(overrides = {}) {
  return {
    configType: "R43E_REAL_PROOF_TARGET",
    purpose: r43e.PROOF_SCOPE,
    inputMint: "So11111111111111111111111111111111111111112",
    outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    amountSol: 0.01,
    slippageBps: 300,
    routeProvider: "jupiter",
    maxTradeSizeSol: 0.01,
    stopAfterFirstTransaction: true,
    notes: "test fixture only",
    ...overrides
  };
}

function readyR43dStatus(overrides = {}) {
  return {
    r43dVerdict: r43d.VERDICTS.READY,
    blockers: [],
    warnings: [],
    rpcStatus: {
      status: rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE,
      source: "fixture",
      redactedUrl: "https://provider.example/?api-key=%5BREDACTED%5D"
    },
    postureStatus: safePosture,
    tradingState: { livePositionsOpen: 0, recoveryPresent: false, sessionNonDryRunTrades: 0 },
    executorStatus: { duplicateLoop: false, submitDisarmed: true },
    r7Verdict: "NOT ENOUGH DATA",
    ...overrides
  };
}

function readyRpcLoad(overrides = {}) {
  return {
    status: rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE,
    source: "fixture",
    redactedUrl: "https://provider.example/?api-key=%5BREDACTED%5D",
    dedicatedCandidate: true,
    ...overrides
  };
}

function finalCli(overrides = {}) {
  return {
    executeRealProof: true,
    simulate: false,
    humanPresent: true,
    confirmOneTransactionProof: true,
    finalBroadcastConfirmation: true,
    ...overrides
  };
}

function readyOperatorOptions(overrides = {}) {
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
  fs.writeFileSync(path.join(tmpRepo, "docs", "R43E3_OPERATOR_BROADCAST_DEPS.md"), "# R43E3 fixture\n");

  return {
    repoRoot: tmpRepo,
    runtimeRoot: tmpRuntime,
    analysisDir: tmpOutput,
    cli: finalCli(overrides.cli),
    capsLoad: { status: "present", data: approvedCaps(overrides.capsOverrides) },
    r43dStatusSummary: readyR43dStatus(overrides.r43dStatusSummary),
    r43cStatusSummary: { r43cVerdict: r43c.VERDICTS.READY, ...(overrides.r43cStatusSummary || {}) },
    simulationStatusSummary: {
      r43eVerdict: r43e.VERDICTS.COMPLETED,
      transactionSubmitted: false,
      ...(overrides.simulationStatusSummary || {})
    },
    proofTargetLoad: {
      status: "present",
      file: "fixture",
      data: proofTarget(overrides.proofTargetOverrides)
    },
    localSecretSourceCheck: overrides.localSecretSourceCheck || {
      envSecretJsonPresent: true,
      keyfilePathPresent: false,
      contentPrinted: false,
      contentRead: false,
      note: "fixture"
    },
    executorIntegrationCheck: { ok: true, integrated: false, note: "fixture" },
    rpcLoad: readyRpcLoad(overrides.rpcLoad),
    dedicatedRpcUrl: "https://provider.example/rpc",
    ...overrides
  };
}

function mockHttpSuccess(quoteBody, swapBody) {
  return async (url, options = {}) => {
    if (options.method === "POST") {
      return { ok: true, statusCode: 200, body: JSON.stringify(swapBody) };
    }
    return { ok: true, statusCode: 200, body: JSON.stringify(quoteBody) };
  };
}

function mockBroadcastDeps(overrides = {}) {
  let broadcastCount = 0;
  const sendRawTransactionImpl = overrides.sendRawTransactionImpl || (() => {
    broadcastCount += 1;
    return { signature: "mockSignatureBase58" };
  });
  return {
    broadcastCountRef: () => broadcastCount,
    options: {
      ...readyOperatorOptions(overrides),
      allowOperatorBroadcastDeps: true,
      httpRequest: mockHttpSuccess(
        {
          inputMint: "So11111111111111111111111111111111111111112",
          outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          slippageBps: 300
        },
        { swapTransaction: Buffer.from("mock-tx").toString("base64") }
      ),
      sendRawTransactionImpl,
      testFixtureSecret: true
    }
  };
}

(async () => {
  try {
    const defaultDeps = operatorDeps.createOperatorBroadcastDeps({});
    assert.strictEqual(defaultDeps.blocked, true);
    assert.throws(() => defaultDeps.fetchJupiterQuote({}), (err) => err.code === operatorDeps.OPERATOR_DEPS_BLOCKED);
    console.log(`${G} deps blocked by default`);

    assert.strictEqual(operatorDeps.createOperatorBroadcastDeps(readyOperatorOptions()).blocked, true);
    console.log(`${G} deps require allowOperatorBroadcastDeps:true`);

    assert.strictEqual(operatorDeps.createOperatorBroadcastDeps(readyOperatorOptions({
      allowOperatorBroadcastDeps: true,
      cli: finalCli({ finalBroadcastConfirmation: false })
    })).blocked, true);
    console.log(`${G} missing final confirmation blocks`);

    assert.strictEqual(operatorDeps.createOperatorBroadcastDeps(readyOperatorOptions({
      allowOperatorBroadcastDeps: true,
      proofTargetLoad: { status: "missing", file: "x", data: null }
    })).blocked, true);
    console.log(`${G} missing proof target blocks`);

    assert.strictEqual(operatorDeps.createOperatorBroadcastDeps(readyOperatorOptions({
      allowOperatorBroadcastDeps: true,
      localSecretSourceCheck: {
        envSecretJsonPresent: false,
        keyfilePathPresent: false,
        contentPrinted: false,
        contentRead: false,
        note: "missing"
      }
    })).blocked, true);
    console.log(`${G} missing signer secret blocks`);

    assert.strictEqual(operatorDeps.createOperatorBroadcastDeps(readyOperatorOptions({
      allowOperatorBroadcastDeps: true,
      rpcLoad: { status: rpcConfig.RPC_STATUS.MISSING, redactedUrl: "", dedicatedCandidate: false }
    })).blocked, true);
    console.log(`${G} missing dedicated RPC blocks`);

    assert.strictEqual(operatorDeps.createOperatorBroadcastDeps(readyOperatorOptions({
      allowOperatorBroadcastDeps: true,
      rpcLoad: { status: rpcConfig.RPC_STATUS.PUBLIC_FALLBACK, redactedUrl: "[REDACTED]", dedicatedCandidate: false }
    })).blocked, true);
    console.log(`${G} public fallback RPC blocks`);

    assert.strictEqual(operatorDeps.createOperatorBroadcastDeps(readyOperatorOptions({
      allowOperatorBroadcastDeps: true,
      capsLoad: { status: "present", data: approvedCaps({ maxTradeSizeSol: 0.02 }) }
    })).blocked, true);
    console.log(`${G} unsafe caps block`);

    assert.strictEqual(operatorDeps.createOperatorBroadcastDeps(readyOperatorOptions({
      allowOperatorBroadcastDeps: true,
      r43dStatusSummary: readyR43dStatus({ postureStatus: { ...safePosture, liveArmed: true } })
    })).blocked, true);
    console.log(`${G} liveArmed true blocks`);

    assert.strictEqual(operatorDeps.createOperatorBroadcastDeps(readyOperatorOptions({
      allowOperatorBroadcastDeps: true,
      r43dStatusSummary: readyR43dStatus({ postureStatus: { ...safePosture, dryRunMode: false } })
    })).blocked, true);
    console.log(`${G} dryRunMode false blocks`);

    assert.strictEqual(operatorDeps.createOperatorBroadcastDeps(readyOperatorOptions({
      allowOperatorBroadcastDeps: true,
      r43dStatusSummary: readyR43dStatus({ postureStatus: { ...safePosture, executionMode: "LIVE" } })
    })).blocked, true);
    console.log(`${G} executionMode LIVE blocks`);

    assert.strictEqual(operatorDeps.createOperatorBroadcastDeps(readyOperatorOptions({
      allowOperatorBroadcastDeps: true,
      r43dStatusSummary: readyR43dStatus({ tradingState: { livePositionsOpen: 0, recoveryPresent: true } })
    })).blocked, true);
    console.log(`${G} recovery_actions.jsonl present blocks`);

    assert.strictEqual(operatorDeps.createOperatorBroadcastDeps(readyOperatorOptions({
      allowOperatorBroadcastDeps: true,
      r43dStatusSummary: readyR43dStatus({ tradingState: { livePositionsOpen: 1, recoveryPresent: false } })
    })).blocked, true);
    console.log(`${G} open live position blocks`);

    assert.strictEqual(operatorDeps.createOperatorBroadcastDeps(readyOperatorOptions({
      allowOperatorBroadcastDeps: true,
      r43dStatusSummary: readyR43dStatus({ executorStatus: { duplicateLoop: true, submitDisarmed: true } })
    })).blocked, true);
    console.log(`${G} duplicate executor blocks`);

    assert.strictEqual(operatorDeps.createOperatorBroadcastDeps(readyOperatorOptions({
      allowOperatorBroadcastDeps: true,
      capsLoad: { status: "present", data: approvedCaps({ autoCompoundingAllowed: true }) }
    })).blocked, true);
    console.log(`${G} autoCompounding true blocks`);

    assert.strictEqual(operatorDeps.createOperatorBroadcastDeps(readyOperatorOptions({
      allowOperatorBroadcastDeps: true,
      proofTargetLoad: { status: "present", file: "fixture", data: proofTarget({ amountSol: 0.02, maxTradeSizeSol: 0.02 }) }
    })).blocked, true);
    console.log(`${G} amountSol > 0.01 blocks`);

    assert.strictEqual(operatorDeps.createOperatorBroadcastDeps(readyOperatorOptions({
      allowOperatorBroadcastDeps: true,
      proofTargetLoad: { status: "present", file: "fixture", data: proofTarget({ stopAfterFirstTransaction: false }) }
    })).blocked, true);
    console.log(`${G} stopAfterFirstTransaction false blocks`);

    assert.strictEqual(operatorDeps.createOperatorBroadcastDeps(readyOperatorOptions({
      allowOperatorBroadcastDeps: true,
      proofTargetLoad: { status: "present", file: "fixture", data: proofTarget({ fromScanner: true, scannerCandidateId: "scan-1" }) }
    })).blocked, true);
    console.log(`${G} scanner candidate cannot be used as target`);

    assert.strictEqual(operatorDeps.createOperatorBroadcastDeps(readyOperatorOptions({
      allowOperatorBroadcastDeps: true,
      executorIntegrationCheck: { ok: false, integrated: true, note: "integrated" }
    })).blocked, true);
    console.log(`${G} normal live_executor integration blocks`);

    assert.strictEqual(operatorDeps.validateQuoteUrl("https://lite-api.jup.ag/swap/v1/quote?x=1").ok, true);
    assert.strictEqual(operatorDeps.validateQuoteUrl("https://lite-api.jup.ag/swap/v1/execute").ok, false);
    assert.strictEqual(operatorDeps.validateSwapUrl("https://lite-api.jup.ag/swap/v1/swap").ok, true);
    assert.strictEqual(operatorDeps.validateSwapUrl("https://lite-api.jup.ag/swap/v1/submit").ok, false);
    console.log(`${G} quote/swap helpers cannot call execute/submit endpoints`);

    const src = fs.readFileSync(path.join(__dirname, "r43e_operator_broadcast_deps.js"), "utf8");
    assert.ok(!/require\s*\(\s*['"]\.\/live_executor['"]/.test(src));
    console.log(`${G} no live_executor integration in operator deps module`);

    const mocks = mockBroadcastDeps();
    const enabled = operatorDeps.createOperatorBroadcastDeps(mocks.options);
    assert.strictEqual(enabled.blocked, false);
    enabled.loadGuardedLocalSigner = () => ({
      getPublicKey: () => "MockPublicKey111",
      getSafeAuditMetadata: () => ({ publicKey: "MockPublicKey111" }),
      destroy: () => {}
    });
    enabled.signSwapTransaction = async () => ({
      signedTransactionBase64: Buffer.from("signed-mock-tx").toString("base64"),
      publicKey: "MockPublicKey111"
    });

    const harnessAttempt = await r43e.collectRealProofReviewAsync({
      ...mocks.options,
      outputDir: tmpOutput,
      deps: enabled
    });
    assert.strictEqual(harnessAttempt.r43eRealProofVerdict, r43e.REAL_PROOF_VERDICTS.ATTEMPTED);
    assert.strictEqual(harnessAttempt.transactionSubmitted, true);
    assert.strictEqual(harnessAttempt.signature, "mockSignatureBase58");
    assert.strictEqual(mocks.broadcastCountRef(), 1);
    console.log(`${G} mocked broadcast is called at most once`);

    await assert.rejects(
      () => r43e.executeRealProofAttempt(
        {
          realProofGuardsPassed: true,
          broadcastAttempted: true,
          rpcMetadata: { redactedUrl: "[REDACTED]" },
          proofTarget: proofTarget()
        },
        enabled
      ),
      (err) => err && err.code === "R43E_PROOF_STOPPED"
    );
    console.log(`${G} no retry after failure`);

    const failBeforeBroadcast = mockBroadcastDeps();
    const failDeps = operatorDeps.createOperatorBroadcastDeps(failBeforeBroadcast.options);
    failDeps.signSwapTransaction = async () => {
      throw Object.assign(new Error("sign failed"), {
        code: operatorDeps.REAL_TRANSACTION_BUILD_NOT_IMPLEMENTED
      });
    };
    const failedReview = await r43e.collectRealProofReviewAsync({
      ...failBeforeBroadcast.options,
      outputDir: tmpOutput,
      deps: failDeps
    });
    assert.strictEqual(failedReview.r43eRealProofVerdict, r43e.REAL_PROOF_VERDICTS.FAILED_BEFORE_BROADCAST);
    assert.strictEqual(failedReview.transactionSubmitted, false);
    console.log(`${G} transactionSubmitted true only when mocked broadcast called`);

    const written = await r43e.runRealProofReview({
      ...readyOperatorOptions({ allowOperatorBroadcastDeps: true }),
      cli: finalCli({ finalBroadcastConfirmation: false }),
      outputDir: tmpOutput
    });
    assert.ok(written.outputFile.startsWith(tmpOutput));
    assert.ok(!/"privateKey"\s*:/.test(JSON.stringify(written)));
    console.log(`${G} no secrets in audit output`);
    console.log(`${G} output writes only to analysis/`);

    assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
    console.log(`${G} no recovery_actions.jsonl creation`);

    if (beforeConfigHash) assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
    if (beforeLivePositionsHash) assert.ok(beforeLivePositionsHash.equals(fs.readFileSync(REPO_LIVE_POSITIONS)));
    if (beforeCapsHash) assert.ok(beforeCapsHash.equals(fs.readFileSync(REPO_CAPS)));
    console.log(`${G} no normal trading state mutation`);

    console.log("\nR43E OPERATOR BROADCAST DEPS TEST PASSED (28/28)");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
