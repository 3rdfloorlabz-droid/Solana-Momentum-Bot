"use strict";

// test_r43f_post_transaction_audit.js — R43F post-transaction audit (temp fixtures only).

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r43f = require("./r43f_post_transaction_audit");
const r43e = require("./r43e_one_transaction_proof_harness");
const r43c = require("./r43c_local_signer_readiness");
const r43d = require("./r43d_final_proof_preflight");
const r43b = require("./r43b_operator_caps_approval_check");
const capsModule = require("./micro_live_caps");
const rpcConfig = require("./micro_live_rpc_config");
const G = "\x1b[32m✔\x1b[0m";

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r43f-runtime-"));
const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "r43f-repo-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r43f-output-"));

function writeRuntimePosture() {
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

function attemptedProofReview(overrides = {}) {
  return {
    r43eRealProofVerdict: "R43E_REAL_PROOF_ATTEMPTED",
    transactionSubmitted: true,
    signature: "mockSignatureBase58mockSignatureBase58mockSignatureBase58xx",
    proofStoppedAfterFirstAttempt: true,
    broadcastAttemptedAt: new Date().toISOString(),
    broadcastError: null,
    liveTradingApproved: false,
    strategyApproved: false,
    r7Status: "NOT ENOUGH DATA",
    amountSol: 0.01,
    signerPublicKey: "MockPublicKey1111111111111111111111111111111",
    signerStatus: { secretContentPrinted: false, publicKey: "MockPublicKey1111111111111111111111111111111" },
    gateStatus: {
      scope: "pre-broadcast-only",
      transactionSubmitted: false
    },
    ...overrides
  };
}

function readyContext(overrides = {}) {
  writeRuntimePosture();
  fs.mkdirSync(path.join(tmpRepo, "docs"), { recursive: true });
  fs.writeFileSync(path.join(tmpRepo, "docs", "R43F_POST_TRANSACTION_AUDIT.md"), "# R43F fixture\n");
  const proofFile = path.join(tmpOutput, "r43e_real_proof_review.json");
  fs.writeFileSync(proofFile, `${JSON.stringify(attemptedProofReview(overrides.proofReviewOverrides), null, 2)}\n`);
  return {
    repoRoot: tmpRepo,
    runtimeRoot: tmpRuntime,
    outputDir: tmpOutput,
    analysisDir: tmpOutput,
    proofReviewFile: proofFile,
    gateDocPresent: true,
    executorIntegrationCheck: { ok: true, integrated: false, note: "fixture" },
    recoveryPresent: false,
    ...overrides
  };
}

try {
  (async () => {
  assert.strictEqual(
    r43f.collectR43fPostTransactionAudit(readyContext()).r43fVerdict,
    r43f.VERDICTS.PASSED
  );
  console.log(`${G} attempted proof audit passes engineering checks`);

  const legacyWarning = r43f.evaluateGateStatusConsistency(attemptedProofReview());
  assert.ok(legacyWarning.warnings.length > 0);
  console.log(`${G} legacy gateStatus pre-broadcast inconsistency documented`);

  const modern = r43f.evaluateGateStatusConsistency(attemptedProofReview({
    preBroadcastGateStatus: { scope: "pre-broadcast-only" },
    finalTransactionStatus: {
      transactionSubmitted: true,
      signature: "mockSignatureBase58mockSignatureBase58mockSignatureBase58xx",
      proofStoppedAfterFirstAttempt: true,
      broadcastAttemptCount: 1
    }
  }));
  assert.strictEqual(modern.warnings.length, 0);
  console.log(`${G} finalTransactionStatus clears gateStatus ambiguity`);

  assert.strictEqual(
    r43f.collectR43fPostTransactionAudit(readyContext({
      proofReviewOverrides: { transactionSubmitted: false, signature: null }
    })).r43fVerdict,
    r43f.VERDICTS.NOT_READY
  );
  console.log(`${G} missing broadcast does not pass audit`);

  assert.strictEqual(
    r43f.collectR43fPostTransactionAudit(readyContext({ recoveryPresent: true })).r43fVerdict,
    r43f.VERDICTS.FAILED
  );
  console.log(`${G} recovery_actions.jsonl present fails audit`);

  const output = r43f.runR43fPostTransactionAudit(readyContext());
  assert.ok(output.outputFile.startsWith(tmpOutput));
  assert.ok(!/"privateKey"\s*:/.test(JSON.stringify(output)));
  console.log(`${G} no secrets in R43F analysis output`);

  const mocks = {
    blocked: false,
    operatorBroadcastDepsEnabled: true,
    fetchJupiterQuote: () => ({ inputMint: "a", outputMint: "b", slippageBps: 300 }),
    fetchJupiterSwapTransaction: () => ({ swapTransactionBase64: "mockSwapTx" }),
    loadGuardedLocalSigner: () => ({
      getPublicKey: () => "MockPublicKey111",
      getSafeAuditMetadata: () => ({ publicKey: "MockPublicKey111" })
    }),
    signSwapTransaction: () => ({
      signedTransactionBase64: "mockSignedTx",
      publicKey: "MockPublicKey111"
    }),
    sendRawTransaction: () => ({ signature: "mockSignatureBase58" })
  };

  const attempted = await r43e.collectRealProofReviewAsync({
    outputDir: tmpOutput,
    deps: mocks,
    cli: {
      executeRealProof: true,
      simulate: false,
      humanPresent: true,
      confirmOneTransactionProof: true,
      finalBroadcastConfirmation: true
    },
    capsLoad: {
      status: "present",
      data: {
        approved: true,
        approvedBy: "Taylor Cheaney",
        approvalText: r43b.REQUIRED_APPROVAL_TEXT,
        approvalScope: r43b.REQUIRED_APPROVAL_SCOPE,
        purpose: capsModule.REQUIRED_PURPOSE,
        maxTradeSizeSol: 0.01,
        maxDailyLossSol: 0.05,
        maxTradesPerSession: 1,
        maxOpenLivePositions: 1,
        autoCompoundingAllowed: false,
        requireHumanPresent: true,
        stopAfterFirstTransaction: true
      }
    },
    r43dStatusSummary: {
      r43dVerdict: r43d.VERDICTS.READY,
      blockers: [],
      postureStatus: {
        executionMode: "PIPELINE_DRY_RUN",
        dryRunMode: true,
        liveArmed: false
      },
      r7Verdict: "NOT ENOUGH DATA",
      rpcStatus: {
        status: rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE,
        source: "fixture",
        redactedUrl: "https://provider.example/?api-key=%5BREDACTED%5D"
      }
    },
    simulationStatusSummary: { r43eVerdict: r43e.VERDICTS.COMPLETED, transactionSubmitted: false },
    proofTargetLoad: { status: "present", data: {
      configType: "R43E_REAL_PROOF_TARGET",
      purpose: r43e.PROOF_SCOPE,
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amountSol: 0.01,
      slippageBps: 300,
      routeProvider: "jupiter",
      maxTradeSizeSol: 0.01,
      stopAfterFirstTransaction: true
    } },
    localSecretSourceCheck: { envSecretJsonPresent: true, keyfilePathPresent: false },
    r43cStatusSummary: { r43cVerdict: r43c.VERDICTS.READY },
    executorIntegrationCheck: { ok: true },
    realProofGateDocPresent: true
  });
  assert.strictEqual(attempted.finalTransactionStatus.transactionSubmitted, true);
  assert.strictEqual(attempted.finalTransactionStatus.broadcastAttemptCount, 1);
  assert.strictEqual(attempted.preBroadcastGateStatus.scope, "pre-broadcast-only");
  assert.strictEqual(attempted.gateStatus.transactionSubmitted, undefined);
  console.log(`${G} harness writes finalTransactionStatus and preBroadcastGateStatus`);

  console.log("\nR43F POST TRANSACTION AUDIT TEST PASSED (7/7)");
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} catch (err) {
  console.error(err);
  process.exit(1);
}
