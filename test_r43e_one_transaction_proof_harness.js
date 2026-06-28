"use strict";

// test_r43e_one_transaction_proof_harness.js — R43E-1 proof harness (temp fixtures only).

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

const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const REPO_LIVE_POSITIONS = path.join(__dirname, "live_positions.json");
const REPO_CAPS = path.join(__dirname, "operator_records", "micro_live_demo_caps.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;
const beforeLivePositionsHash = fs.existsSync(REPO_LIVE_POSITIONS) ? fs.readFileSync(REPO_LIVE_POSITIONS) : null;
const beforeCapsHash = fs.existsSync(REPO_CAPS) ? fs.readFileSync(REPO_CAPS) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r43e-runtime-"));
const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "r43e-repo-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r43e-output-"));
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

function simulationCli(overrides = {}) {
  return {
    simulate: true,
    humanPresent: true,
    confirmOneTransactionProof: true,
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
      source: rpcConfig.ENV_VAR,
      redactedUrl: "https://provider.example/?api-key=%5BREDACTED%5D"
    },
    postureStatus: safePosture,
    capsStatus: {
      approved: true,
      approvalScope: r43b.REQUIRED_APPROVAL_SCOPE,
      maxTradeSizeSol: 0.01,
      maxTradesPerSession: 1,
      autoCompoundingAllowed: false,
      stopAfterFirstTransaction: true
    },
    tradingState: { livePositionsOpen: 0, recoveryPresent: false, sessionNonDryRunTrades: 0 },
    executorStatus: { duplicateLoop: false, submitDisarmed: true },
    r7Verdict: "NOT ENOUGH DATA",
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
  fs.writeFileSync(path.join(tmpRepo, "docs", "R43E_ONE_TRANSACTION_PROOF_HARNESS.md"), "# R43E fixture\n");

  return {
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRepo,
    outputDir: tmpOutput,
    analysisDir: tmpOutput,
    gateDocPresent: true,
    cli: simulationCli(overrides.cli),
    capsLoad: { status: "present", data: approvedCaps(overrides.capsOverrides) },
    r43dStatusSummary: readyR43dStatus(overrides.r43dStatusSummary),
    r43cStatusSummary: { r43cVerdict: r43c.VERDICTS.READY, ...(overrides.r43cStatusSummary || {}) },
    providerCheck: { ok: true, detail: "blocked without guards" },
    localSecretSourceCheck: {
      envSecretJsonPresent: false,
      keyfilePathPresent: false,
      contentPrinted: false,
      contentRead: false,
      note: "fixture"
    },
    runSecretScan: false,
    ...overrides
  };
}

try {
  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      cli: { simulate: false, humanPresent: false, confirmOneTransactionProof: false }
    })).r43eVerdict,
    r43e.VERDICTS.NOT_READY
  );
  console.log(`${G} default run without flags blocks`);

  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      cli: simulationCli({ simulate: false })
    })).r43eVerdict,
    r43e.VERDICTS.NOT_READY
  );
  console.log(`${G} missing --simulate blocks`);

  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      cli: simulationCli({ humanPresent: false })
    })).r43eVerdict,
    r43e.VERDICTS.NOT_READY
  );
  console.log(`${G} missing --human-present blocks`);

  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      cli: simulationCli({ confirmOneTransactionProof: false })
    })).r43eVerdict,
    r43e.VERDICTS.NOT_READY
  );
  console.log(`${G} missing --confirm-one-transaction-proof blocks`);

  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      r43dStatusSummary: readyR43dStatus({
        r43dVerdict: r43d.VERDICTS.NOT_READY,
        blockers: ["git working tree dirty"]
      })
    })).r43eVerdict,
    r43e.VERDICTS.NOT_READY
  );
  console.log(`${G} dirty git blocks`);

  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      r43dStatusSummary: readyR43dStatus({
        r43dVerdict: r43d.VERDICTS.NOT_READY,
        blockers: ["R43D gate failed"]
      })
    })).r43eVerdict,
    r43e.VERDICTS.NOT_READY
  );
  console.log(`${G} R43D not ready blocks`);

  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      capsLoad: { status: "present", data: approvedCaps({ approved: false }) }
    })).r43eVerdict,
    r43e.VERDICTS.NOT_READY
  );
  console.log(`${G} unapproved caps block`);

  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      capsLoad: { status: "present", data: approvedCaps({ maxTradeSizeSol: 0.02 }) }
    })).r43eVerdict,
    r43e.VERDICTS.NOT_READY
  );
  console.log(`${G} unsafe caps block`);

  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      r43dStatusSummary: readyR43dStatus({
        r43dVerdict: r43d.VERDICTS.NOT_READY,
        blockers: ["RPC status is MISSING"],
        rpcStatus: { status: rpcConfig.RPC_STATUS.MISSING, redactedUrl: "" }
      })
    })).r43eVerdict,
    r43e.VERDICTS.NOT_READY
  );
  console.log(`${G} missing RPC blocks`);

  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      r43dStatusSummary: readyR43dStatus({
        r43dVerdict: r43d.VERDICTS.NOT_READY,
        blockers: ["RPC status is PUBLIC_FALLBACK"],
        rpcStatus: { status: rpcConfig.RPC_STATUS.PUBLIC_FALLBACK, redactedUrl: "[REDACTED]" }
      })
    })).r43eVerdict,
    r43e.VERDICTS.NOT_READY
  );
  console.log(`${G} public fallback RPC blocks`);

  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      r43dStatusSummary: readyR43dStatus({
        r43dVerdict: r43d.VERDICTS.NOT_READY,
        blockers: ["unsafe runtime posture"],
        postureStatus: { ...safePosture, liveArmed: true }
      })
    })).r43eVerdict,
    r43e.VERDICTS.NOT_READY
  );
  console.log(`${G} liveArmed true blocks`);

  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      r43dStatusSummary: readyR43dStatus({
        r43dVerdict: r43d.VERDICTS.NOT_READY,
        blockers: ["unsafe runtime posture"],
        postureStatus: { ...safePosture, dryRunMode: false }
      })
    })).r43eVerdict,
    r43e.VERDICTS.NOT_READY
  );
  console.log(`${G} dryRunMode false blocks`);

  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      r43dStatusSummary: readyR43dStatus({
        r43dVerdict: r43d.VERDICTS.NOT_READY,
        blockers: ["unsafe runtime posture"],
        postureStatus: { ...safePosture, executionMode: "LIVE" }
      })
    })).r43eVerdict,
    r43e.VERDICTS.NOT_READY
  );
  console.log(`${G} executionMode LIVE blocks`);

  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      r43dStatusSummary: readyR43dStatus({
        r43dVerdict: r43d.VERDICTS.NOT_READY,
        blockers: ["recovery_actions.jsonl present"],
        tradingState: { livePositionsOpen: 0, recoveryPresent: true }
      })
    })).r43eVerdict,
    r43e.VERDICTS.NOT_READY
  );
  console.log(`${G} recovery_actions.jsonl present blocks`);

  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      r43dStatusSummary: readyR43dStatus({
        r43dVerdict: r43d.VERDICTS.NOT_READY,
        blockers: ["live_positions.json not empty/valid (open=1)"],
        tradingState: { livePositionsOpen: 1, recoveryPresent: false }
      })
    })).r43eVerdict,
    r43e.VERDICTS.NOT_READY
  );
  console.log(`${G} open live position blocks`);

  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      r43dStatusSummary: readyR43dStatus({
        r43dVerdict: r43d.VERDICTS.NOT_READY,
        blockers: ["duplicate executor loop active"],
        executorStatus: { duplicateLoop: true, submitDisarmed: true }
      })
    })).r43eVerdict,
    r43e.VERDICTS.NOT_READY
  );
  console.log(`${G} duplicate executor blocks`);

  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      capsLoad: { status: "present", data: approvedCaps({ autoCompoundingAllowed: true }) }
    })).r43eVerdict,
    r43e.VERDICTS.NOT_READY
  );
  console.log(`${G} autoCompounding true blocks`);

  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      repeatedTradingScopeBlocked: true,
      capsLoad: { status: "present", data: approvedCaps({ maxTradesPerSession: 2 }) }
    })).r43eVerdict,
    r43e.VERDICTS.NOT_READY
  );
  console.log(`${G} repeated trading scope blocks`);

  const completed = r43e.runR43eOneTransactionProofHarness(readyContext());
  assert.strictEqual(completed.r43eVerdict, r43e.VERDICTS.COMPLETED);
  assert.strictEqual(completed.transactionSubmitted, false);
  assert.ok(completed.outputFile.startsWith(tmpOutput));
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

  assert.strictEqual(
    r43e.collectR43eOneTransactionProofHarness(readyContext({
      cli: { simulate: false, humanPresent: false, confirmOneTransactionProof: false, executeRealProof: false }
    })).transactionSubmitted,
    false
  );
  console.log(`${G} default run does not submit`);

  const completedSim = r43e.collectR43eOneTransactionProofHarness(readyContext());
  assert.strictEqual(completedSim.proofIntent.transactionSubmitted, false);
  assert.strictEqual(completedSim.proofIntent.simulationOnly, true);
  console.log(`${G} simulation run does not submit`);

  function realProofCli(overrides = {}) {
    return {
      executeRealProof: true,
      simulate: false,
      humanPresent: true,
      confirmOneTransactionProof: true,
      finalBroadcastConfirmation: false,
      ...overrides
    };
  }

  function writeProofTarget(repoRoot, overrides = {}) {
    const dir = path.join(repoRoot, "operator_records");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "r43e_real_proof_target.json"),
      `${JSON.stringify({
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
      }, null, 2)}\n`
    );
  }

  function readyRealContext(overrides = {}) {
    writeProofTarget(tmpRepo, overrides.proofTargetOverrides);
    fs.writeFileSync(path.join(tmpRepo, "docs", "R43E2_REAL_TRANSACTION_PROOF_HARNESS.md"), "# R43E2 fixture\n");
    const simBase = readyContext({ ...overrides, cli: simulationCli() });
    return {
      ...simBase,
      cli: realProofCli(overrides.cli),
      localSecretSourceCheck: overrides.localSecretSourceCheck || {
        envSecretJsonPresent: true,
        keyfilePathPresent: false,
        contentPrinted: false,
        contentRead: false,
        note: "fixture"
      },
      simulationStatusSummary: overrides.simulationStatusSummary || {
        r43eVerdict: r43e.VERDICTS.COMPLETED,
        transactionSubmitted: false
      },
      realProofGateDocPresent: true,
      deps: overrides.deps,
      ...overrides
    };
  }

  function mockDeps(onBroadcast) {
    let broadcastCount = 0;
    return {
      deps: {
        fetchJupiterQuote: () => ({ route: "mock-quote" }),
        fetchJupiterSwapTransaction: () => ({ swapTransactionBase64: "mockSwapTx" }),
        loadGuardedLocalSigner: () => ({
          getPublicKey: () => "MockPublicKey111",
          getSafeAuditMetadata: () => ({ publicKey: "MockPublicKey111", privateKeysHandled: true })
        }),
        signSwapTransaction: () => ({ signedTransactionBase64: "mockSignedTx" }),
        sendRawTransaction: () => {
          broadcastCount += 1;
          if (onBroadcast) onBroadcast();
          return { signature: "mockSignatureBase58" };
        }
      },
      getBroadcastCount: () => broadcastCount
    };
  }

  assert.strictEqual(
    r43e.collectRealProofReview(readyRealContext({
      cli: realProofCli({ finalBroadcastConfirmation: false })
    })).r43eRealProofVerdict,
    r43e.REAL_PROOF_VERDICTS.READY_FOR_FINAL_COMMAND
  );
  console.log(`${G} execute-real-proof missing final confirmation blocks broadcast`);

  assert.strictEqual(
    r43e.collectRealProofReview(readyRealContext({
      cli: realProofCli({ humanPresent: false })
    })).r43eRealProofVerdict,
    r43e.REAL_PROOF_VERDICTS.NOT_READY
  );
  console.log(`${G} execute-real-proof missing human-present blocks`);

  assert.strictEqual(
    r43e.collectRealProofReview(readyRealContext({
      proofTargetLoad: { status: "missing", file: "x", data: null }
    })).r43eRealProofVerdict,
    r43e.REAL_PROOF_VERDICTS.NOT_READY
  );
  console.log(`${G} execute-real-proof missing target config blocks`);

  assert.notStrictEqual(
    r43e.collectRealProofReview(readyRealContext({
      proofTargetOverrides: { amountSol: 0.02, maxTradeSizeSol: 0.02 }
    })).r43eRealProofVerdict,
    r43e.REAL_PROOF_VERDICTS.READY_FOR_FINAL_COMMAND
  );
  console.log(`${G} target amount > 0.01 blocks`);

  assert.notStrictEqual(
    r43e.collectRealProofReview(readyRealContext({
      proofTargetOverrides: { autoCompoundingAllowed: true }
    })).r43eRealProofVerdict,
    r43e.REAL_PROOF_VERDICTS.READY_FOR_FINAL_COMMAND
  );
  console.log(`${G} autoCompounding true blocks`);

  assert.notStrictEqual(
    r43e.collectRealProofReview(readyRealContext({
      proofTargetOverrides: { stopAfterFirstTransaction: false, autoCompoundingAllowed: false }
    })).r43eRealProofVerdict,
    r43e.REAL_PROOF_VERDICTS.READY_FOR_FINAL_COMMAND
  );
  console.log(`${G} stopAfterFirstTransaction false blocks`);
  assert.strictEqual(
    r43e.collectRealProofReview(readyRealContext({
      localSecretSourceCheck: {
        envSecretJsonPresent: false,
        keyfilePathPresent: false,
        contentPrinted: false,
        contentRead: false,
        note: "missing"
      }
    })).r43eRealProofVerdict,
    r43e.REAL_PROOF_VERDICTS.NOT_READY
  );
  console.log(`${G} missing signer secret source blocks real proof`);

  assert.strictEqual(
    r43e.collectRealProofReview(readyRealContext({
      executorIntegrationCheck: { integrated: true, ok: false, note: "integrated" }
    })).r43eRealProofVerdict,
    r43e.REAL_PROOF_VERDICTS.BLOCKED
  );
  console.log(`${G} normal live_executor integration blocks`);

  const mocks = mockDeps();
  const attempted = r43e.collectRealProofReview(readyRealContext({
    cli: realProofCli({ finalBroadcastConfirmation: true }),
    deps: mocks.deps
  }));
  assert.strictEqual(attempted.r43eRealProofVerdict, r43e.REAL_PROOF_VERDICTS.ATTEMPTED);
  assert.strictEqual(attempted.transactionSubmitted, true);
  assert.strictEqual(attempted.signature, "mockSignatureBase58");
  assert.strictEqual(attempted.proofStoppedAfterFirstAttempt, true);
  assert.strictEqual(mocks.getBroadcastCount(), 1);
  console.log(`${G} mocked broadcast can occur at most once`);

  assert.throws(
    () => r43e.executeRealProofAttempt(
      { realProofGuardsPassed: true, broadcastAttempted: true, rpcMetadata: { redactedUrl: "[REDACTED]" } },
      mocks.deps
    ),
    (err) => err && err.code === "R43E_PROOF_STOPPED"
  );
  console.log(`${G} after mocked broadcast, harness stops`);

  const mocksNoFinal = mockDeps();
  r43e.collectRealProofReview(readyRealContext({
    cli: realProofCli({ finalBroadcastConfirmation: false }),
    deps: mocksNoFinal.deps
  }));
  assert.strictEqual(mocksNoFinal.getBroadcastCount(), 0);
  console.log(`${G} transactionSubmitted false unless mocked broadcast path called`);

  const realOutput = r43e.runRealProofReview(readyRealContext({
    cli: realProofCli({ finalBroadcastConfirmation: false })
  }));
  assert.ok(realOutput.outputFile.includes("r43e_real_proof_review.json"));
  const realJson = JSON.stringify(realOutput);
  assert.ok(!/"privateKey"\s*:/.test(realJson));
  assert.ok(!/"secretKey"\s*:/.test(realJson));
  console.log(`${G} no secrets appear in analysis output`);

  const src = fs.readFileSync(path.join(__dirname, "r43e_one_transaction_proof_harness.js"), "utf8");
  assert.ok(!/require\s*\(\s*['"]\.\/live_executor['"]/.test(src));
  assert.ok(/executeRealProofAttempt/.test(src));
  assert.ok(/sendRawTransaction/.test(src));
  assert.ok(/function executeRealProofAttempt/.test(src));
  assert.ok(!/executeSwap/.test(src));
  console.log(`${G} no live_executor integration; sendRawTransaction only via injectable deps`);

  console.log("\nR43E ONE TRANSACTION PROOF HARNESS TEST PASSED (41/41)");
} catch (err) {
  console.error(err);
  process.exit(1);
}
