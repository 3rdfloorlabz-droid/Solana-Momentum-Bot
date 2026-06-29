"use strict";

// r43e_one_transaction_proof_harness.js — R43E-1 simulation + R43E-2 real proof path.
// Isolated harness. Default/simulation do NOT submit. Real broadcast only with all final flags.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const r42 = require("./r42_final_micro_live_review");
const r43b = require("./r43b_operator_caps_approval_check");
const r43c = require("./r43c_local_signer_readiness");
const r43d = require("./r43d_final_proof_preflight");
const capsModule = require("./micro_live_caps");
const rpcConfig = require("./micro_live_rpc_config");
const localSigner = require("./local_signer");
const provider = require("./signer_provider");
const cliGuards = require("./r43e_real_proof_cli_guards");
const proofConfig = require("./r43e_proof_config");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R43E_OUTPUT_DIR
  ? path.resolve(process.env.R43E_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r43e_one_transaction_proof_harness.json");
const REAL_PROOF_OUTPUT_FILE = path.join(OUTPUT_DIR, "r43e_real_proof_review.json");
const GATE_DOC = "docs/R43E_ONE_TRANSACTION_PROOF_HARNESS.md";
const REAL_PROOF_GATE_DOC = "docs/R43E2_REAL_TRANSACTION_IMPLEMENTATION_REVIEW.md";
const OPERATOR_BROADCAST_DEPS_DOC = "docs/R43E3_OPERATOR_BROADCAST_DEPS.md";
const TARGET_CONFIG_REL = proofConfig.TARGET_CONFIG_REL;
const EXAMPLE_TARGET_REL = proofConfig.EXAMPLE_TARGET_REL;
const PLACEHOLDER_OUTPUT_MINT = proofConfig.PLACEHOLDER_OUTPUT_MINT;
const PROOF_SCOPE = proofConfig.PROOF_SCOPE;
const MAX_TRADE_SIZE_SOL = proofConfig.MAX_TRADE_SIZE_SOL;

const SCHEMA_VERSION = 1;
const R43E_REVIEW_VERDICT = "R43E ONE TRANSACTION PROOF HARNESS — SIMULATION + REAL PROOF REVIEW — NOT LIVE TRADING";
const PROOF_MODE = "SIMULATION_ONLY";
const REAL_PROOF_MODE = "REAL_PROOF_ISOLATED";
const NEXT_REQUIRED_STEP = "final execution command required";
const NEXT_R43F_STEP = "R43F post-transaction audit review";

const VERDICTS = Object.freeze({
  NOT_READY: "R43E_SIMULATION_NOT_READY",
  READY: "R43E_SIMULATION_READY",
  COMPLETED: "R43E_SIMULATION_COMPLETED"
});

const REAL_PROOF_VERDICTS = Object.freeze({
  READY_FOR_FINAL_COMMAND: "R43E_REAL_PROOF_READY_FOR_FINAL_COMMAND",
  ATTEMPTED: "R43E_REAL_PROOF_ATTEMPTED",
  BLOCKED: "R43E_REAL_PROOF_BLOCKED",
  FAILED_BEFORE_BROADCAST: "R43E_REAL_PROOF_FAILED_BEFORE_BROADCAST"
});

const FORBIDDEN_VERDICTS = Object.freeze([
  "LIVE_APPROVED",
  "READY_FOR_LIVE_TRADING",
  "REAL_TRANSACTION_SUBMITTED",
  "STRATEGY_APPROVED",
  "AUTONOMOUS_TRADING_ENABLED"
]);

const parseCliArgs = cliGuards.parseCliArgs;
const validateCliFlags = cliGuards.validateCliFlags;
const validateRealProofCli = cliGuards.validateRealProofCli;
const validateRealProofBroadcastCli = cliGuards.validateRealProofBroadcastCli;
const validateProofScopeCaps = proofConfig.validateProofScopeCaps;
const loadProofTargetConfig = proofConfig.loadProofTargetConfig;
const validateProofTarget = proofConfig.validateProofTarget;
const summarizeProofTarget = proofConfig.summarizeProofTarget;

function buildProofIntent(context) {
  const createdAt = new Date().toISOString();
  const proofId = `r43e-sim-${crypto.createHash("sha256").update(`${createdAt}:${PROOF_MODE}`).digest("hex").slice(0, 16)}`;
  return {
    proofId,
    createdAt,
    proofScope: PROOF_SCOPE,
    proofMode: PROOF_MODE,
    simulationOnly: true,
    maxTradeSizeSol: MAX_TRADE_SIZE_SOL,
    stopAfterFirstTransaction: true,
    humanPresent: context.cli.humanPresent === true,
    liveTradingApproved: false,
    transactionSubmitted: false,
    signature: null,
    targetToken: null,
    routeProvider: null
  };
}

function buildGateStatusTable(context) {
  return {
    simulateFlag: context.cli.simulate === true,
    humanPresentFlag: context.cli.humanPresent === true,
    confirmOneTransactionProofFlag: context.cli.confirmOneTransactionProof === true,
    r43dReady: context.r43dStatus.r43dVerdict === r43d.VERDICTS.READY,
    capsProofScopeValid: context.proofScopeCaps.ok === true,
    r43cSignerReady: context.r43cStatus.r43cVerdict === r43c.VERDICTS.READY,
    localRealGuarded: context.providerCheck.ok === true,
    rpcDedicatedCandidate: context.r43dStatus.rpcStatus?.status === rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE
      || context.r43dStatus.rpcStatus === rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE,
    postureDisarmed: context.r43dStatus.postureStatus?.executionMode === "PIPELINE_DRY_RUN"
      && context.r43dStatus.postureStatus?.dryRunMode === true
      && context.r43dStatus.postureStatus?.liveArmed === false,
    recoveryAbsent: context.r43dStatus.tradingState?.recoveryPresent !== true,
    livePositionsEmpty: context.r43dStatus.tradingState?.livePositionsOpen === 0
      || context.r43dStatus.tradingState?.livePositionsOpen === undefined,
    noDuplicateExecutor: context.r43dStatus.executorStatus?.duplicateLoop !== true,
    repeatedTradingScopeBlocked: context.repeatedTradingScopeBlocked !== true,
    simulationOnly: true,
    transactionSubmitted: false,
    liveTradingApproved: false
  };
}

function deriveR43eVerdict(context) {
  const blockers = [];
  const warnings = [];

  for (const blocker of context.cliBlockers) blockers.push(blocker);

  if (context.r43dStatus.r43dVerdict !== r43d.VERDICTS.READY) {
    blockers.push(`R43D preflight not ready: ${context.r43dStatus.r43dVerdict}`);
    for (const item of context.r43dStatus.blockers || []) {
      if (!blockers.includes(item)) blockers.push(item);
    }
  }

  if (!context.proofScopeCaps.ok) {
    blockers.push(`proof scope caps invalid: ${context.proofScopeCaps.errors.join("; ")}`);
  }

  if (context.r43cStatus.r43cVerdict !== r43c.VERDICTS.READY) {
    blockers.push(`R43C signer not ready: ${context.r43cStatus.r43cVerdict}`);
  }

  if (!context.providerCheck.ok) {
    blockers.push("local_real not guarded by default in provider registry");
  }

  if (context.repeatedTradingScopeBlocked === true) {
    blockers.push("repeated trading scope blocked for one-transaction proof");
  }

  if (!context.localSecretSource.envSecretJsonPresent
      && !context.localSecretSource.keyfilePathPresent) {
    warnings.push("no local signer secret source detected — acceptable for R43E-1 simulation");
  }

  if (blockers.length > 0) {
    return {
      r43eVerdict: VERDICTS.NOT_READY,
      blockers,
      warnings,
      reason: blockers.join("; ")
    };
  }

  if (context.cli.simulate === true
      && context.cli.humanPresent === true
      && context.cli.confirmOneTransactionProof === true) {
    return {
      r43eVerdict: VERDICTS.COMPLETED,
      blockers: [],
      warnings,
      reason: "R43E-1 simulation harness completed — proof intent recorded; no transaction submitted"
    };
  }

  return {
    r43eVerdict: VERDICTS.READY,
    blockers: [],
    warnings,
    reason: "R43E simulation gates satisfied — awaiting simulation execution flags"
  };
}

function createDefaultProofDeps() {
  const blocked = () => {
    throw Object.assign(new Error("real proof deps blocked — inject deps for tests or operator execution"), {
      code: "R43E_BROADCAST_BLOCKED"
    });
  };
  return {
    fetchJupiterQuote: blocked,
    fetchJupiterSwapTransaction: blocked,
    loadGuardedLocalSigner: blocked,
    signSwapTransaction: blocked,
    sendRawTransaction: blocked
  };
}

function assertRealProofGuards(context) {
  if (context.realProofGuardsPassed !== true) {
    throw Object.assign(new Error("real proof guards not satisfied"), { code: "R43E_REAL_PROOF_GUARD_BLOCKED" });
  }
}

function resolveRealProofDeps(options = {}, cli = {}) {
  if (options.deps !== undefined) return options.deps;
  if (cli.finalBroadcastConfirmation === true) {
    const operatorBroadcastDeps = require("./r43e_operator_broadcast_deps");
    return operatorBroadcastDeps.createOperatorBroadcastDeps({
      allowOperatorBroadcastDeps: true,
      cli,
      repoRoot: options.repoRoot || ROOT,
      runtimeRoot: options.runtimeRoot || RUNTIME_ROOT,
      analysisDir: options.analysisDir || OUTPUT_DIR,
      env: options.env,
      httpRequest: options.httpRequest,
      sendRawTransactionImpl: options.sendRawTransactionImpl,
      jupiterSwapBaseUrl: options.jupiterSwapBaseUrl,
      dedicatedRpcUrl: options.dedicatedRpcUrl,
      testFixtureSecret: options.testFixtureSecret,
      testSecretBytes: options.testSecretBytes,
      r43dStatusSummary: options.r43dStatusSummary,
      simulationStatusSummary: options.simulationStatusSummary,
      capsLoad: options.capsLoad,
      proofTargetLoad: options.proofTargetLoad,
      proofScopeCapsCheck: options.proofScopeCapsCheck,
      localSecretSourceCheck: options.localSecretSourceCheck,
      executorIntegrationCheck: options.executorIntegrationCheck,
      r43cStatusSummary: options.r43cStatusSummary,
      rpcLoad: options.rpcLoad
    });
  }
  return createDefaultProofDeps();
}

async function executeRealProofAttempt(context, deps) {
  assertRealProofGuards(context);
  if (context.broadcastAttempted === true) {
    throw Object.assign(new Error("stopAfterFirstTransaction — broadcast already attempted"), {
      code: "R43E_PROOF_STOPPED"
    });
  }
  if (deps.blocked === true) {
    throw Object.assign(new Error(deps.blockReason || "operator broadcast deps blocked"), {
      code: "R43E_OPERATOR_DEPS_BLOCKED"
    });
  }

  const quote = await Promise.resolve(deps.fetchJupiterQuote(context));
  const swapTx = await Promise.resolve(deps.fetchJupiterSwapTransaction(context, quote));
  const signer = deps.loadGuardedLocalSigner(context);
  const signed = await Promise.resolve(deps.signSwapTransaction(signer, swapTx, context));
  if (typeof signer.destroy === "function") signer.destroy();

  let transactionSubmitted = false;
  let signature = null;
  let broadcastError = null;
  const broadcastAttemptedAt = new Date().toISOString();
  context.sendRawTransactionCalled = false;

  try {
    context.sendRawTransactionCalled = true;
    const broadcast = await Promise.resolve(deps.sendRawTransaction({
      rpcUrlRedacted: context.rpcMetadata.redactedUrl,
      signedTransaction: signed.signedTransactionBase64
    }));
    context.broadcastAttempted = true;
    transactionSubmitted = true;
    signature = broadcast.signature || null;
  } catch (err) {
    if (context.sendRawTransactionCalled === true) {
      context.broadcastAttempted = true;
      transactionSubmitted = true;
      broadcastError = err && err.message ? err.message : String(err);
    } else {
      throw err;
    }
  }

  return {
    transactionSubmitted,
    signature,
    broadcastError,
    broadcastAttemptedAt,
    signerPublicKey: signed.publicKey || signer.getPublicKey(),
    proofStoppedAfterFirstAttempt: true
  };
}

function collectSimulationStatusForRealProof(options = {}) {
  if (options.simulationStatusSummary !== undefined) {
    return options.simulationStatusSummary;
  }
  return collectR43eOneTransactionProofHarness({
    ...options,
    cli: {
      simulate: true,
      executeRealProof: false,
      humanPresent: true,
      confirmOneTransactionProof: true,
      finalBroadcastConfirmation: false
    }
  });
}

function collectRealProofReview(options = {}) {
  return collectRealProofReviewAsync(options);
}

async function collectRealProofReviewAsync(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const cli = options.cli || parseCliArgs(options.argv);
  const deps = resolveRealProofDeps(options, cli);
  const realCliValidation = validateRealProofCli(cli);
  const blockers = [...realCliValidation.blockers];
  const warnings = [];

  const gateDocPresent = options.realProofGateDocPresent !== undefined
    ? options.realProofGateDocPresent === true
    : fs.existsSync(path.join(repoRoot, REAL_PROOF_GATE_DOC))
      || fs.existsSync(path.join(repoRoot, OPERATOR_BROADCAST_DEPS_DOC));

  const r43dStatus = options.r43dStatusSummary !== undefined
    ? options.r43dStatusSummary
    : r43d.collectR43dFinalProofPreflight({
      repoRoot,
      runtimeRoot,
      analysisDir,
      humanPresent: cli.humanPresent === true,
      cli: { humanPresent: cli.humanPresent === true },
      runSecretScan: options.runSecretScan,
      ...options
    });

  const simulationStatus = collectSimulationStatusForRealProof(options);
  const capsLoad = options.capsLoad !== undefined
    ? options.capsLoad
    : capsModule.loadCapsFile(path.join(repoRoot, "operator_records", "micro_live_demo_caps.json"));
  const caps = capsLoad.data;
  const proofScopeCaps = options.proofScopeCapsCheck !== undefined
    ? options.proofScopeCapsCheck
    : validateProofScopeCaps(caps);
  const proofTargetLoad = loadProofTargetConfig(repoRoot, options);
  const proofTargetValidation = proofTargetLoad.status === "present"
    ? validateProofTarget(proofTargetLoad.data)
    : { ok: false, errors: [`proof target ${proofTargetLoad.status}`] };

  const localSecretSource = options.localSecretSourceCheck !== undefined
    ? options.localSecretSourceCheck
    : r43d.classifyLocalSignerSecretPresence({ repoRoot, env: options.env });

  const executorIntegration = options.executorIntegrationCheck !== undefined
    ? options.executorIntegrationCheck
    : r42.checkExecutorIntegration(repoRoot);

  const r43cStatus = options.r43cStatusSummary !== undefined
    ? options.r43cStatusSummary
    : r43c.buildStatus({ repoRoot, runtimeRoot, analysisDir, runSecretScan: false, ...options });

  if (cli.simulate === true) {
    blockers.push("--simulate cannot be combined with --execute-real-proof");
  }
  if (r43dStatus.r43dVerdict !== r43d.VERDICTS.READY) {
    blockers.push(`R43D preflight not ready: ${r43dStatus.r43dVerdict}`);
    for (const item of r43dStatus.blockers || []) {
      if (!blockers.includes(item)) blockers.push(item);
    }
  }
  if (simulationStatus.r43eVerdict !== VERDICTS.COMPLETED) {
    blockers.push(`R43E simulation not completed: ${simulationStatus.r43eVerdict}`);
  }
  if (!proofScopeCaps.ok) {
    blockers.push(`proof scope caps invalid: ${proofScopeCaps.errors.join("; ")}`);
  }
  if (proofTargetLoad.status !== "present") {
    blockers.push(`proof target config ${proofTargetLoad.status}: ${TARGET_CONFIG_REL}`);
  }
  if (!proofTargetValidation.ok) {
    blockers.push(`proof target invalid: ${proofTargetValidation.errors.join("; ")}`);
  }
  if (r43cStatus.r43cVerdict !== r43c.VERDICTS.READY) {
    blockers.push(`R43C signer not ready: ${r43cStatus.r43cVerdict}`);
  }
  if (!executorIntegration.ok) {
    blockers.push("live_executor signer integration detected");
  }
  if (!localSecretSource.envSecretJsonPresent && !localSecretSource.keyfilePathPresent) {
    blockers.push("local signer secret source required for real proof path");
  }

  const rpcMetadata = {
    status: r43dStatus.rpcStatus?.status || r43dStatus.rpcStatus,
    source: r43dStatus.rpcStatus?.source || null,
    redactedUrl: r43dStatus.rpcStatus?.redactedUrl || "[REDACTED]",
    dedicatedCandidate: (r43dStatus.rpcStatus?.status || r43dStatus.rpcStatus)
      === rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE
  };

  const signerMetadata = {
    r43cVerdict: r43cStatus.r43cVerdict,
    localSecretSource,
    secretContentPrinted: false,
    transactionSubmitted: false,
    broadcast: false
  };

  let r43eRealProofVerdict = REAL_PROOF_VERDICTS.BLOCKED;
  let transactionSubmitted = false;
  let signature = null;
  let broadcastError = null;
  let broadcastAttemptedAt = null;
  let signerPublicKey = null;
  let proofStoppedAfterFirstAttempt = false;
  let nextRequiredStep = "final execution command required";
  let operatorBroadcastDepsEnabled = deps.operatorBroadcastDepsEnabled === true;

  const preBroadcastGateStatus = {
    scope: "pre-broadcast-only",
    executeRealProofFlag: cli.executeRealProof === true,
    humanPresentFlag: cli.humanPresent === true,
    confirmOneTransactionProofFlag: cli.confirmOneTransactionProof === true,
    finalBroadcastConfirmationFlag: cli.finalBroadcastConfirmation === true,
    r43dReady: r43dStatus.r43dVerdict === r43d.VERDICTS.READY,
    simulationCompleted: simulationStatus.r43eVerdict === VERDICTS.COMPLETED,
    proofTargetPresent: proofTargetLoad.status === "present",
    proofTargetValid: proofTargetValidation.ok === true,
    signerSecretPresent: localSecretSource.envSecretJsonPresent === true
      || localSecretSource.keyfilePathPresent === true,
    executorNotIntegrated: executorIntegration.ok === true,
    rpcDedicatedCandidate: rpcMetadata.dedicatedCandidate === true,
    liveTradingApproved: false
  };

  if (executorIntegration.ok === false) {
    r43eRealProofVerdict = REAL_PROOF_VERDICTS.BLOCKED;
  } else if (proofTargetValidation.ok === false && proofTargetLoad.status === "present") {
    r43eRealProofVerdict = REAL_PROOF_VERDICTS.BLOCKED;
  }

  if (blockers.length > 0) {
    r43eRealProofVerdict = r43eRealProofVerdict === REAL_PROOF_VERDICTS.BLOCKED
      ? REAL_PROOF_VERDICTS.BLOCKED
      : REAL_PROOF_VERDICTS.BLOCKED;
  } else if (cli.finalBroadcastConfirmation !== true) {
    r43eRealProofVerdict = REAL_PROOF_VERDICTS.READY_FOR_FINAL_COMMAND;
    nextRequiredStep = "final execution command required";
  } else {
    let context = null;
    try {
      context = {
        cli,
        realProofGuardsPassed: true,
        rpcMetadata,
        proofTarget: proofTargetLoad.data,
        caps,
        r43dStatus,
        broadcastAttempted: false,
        sendRawTransactionCalled: false
      };
      const attempt = await executeRealProofAttempt(context, deps);
      transactionSubmitted = attempt.transactionSubmitted === true;
      signature = attempt.signature;
      broadcastError = attempt.broadcastError || null;
      broadcastAttemptedAt = attempt.broadcastAttemptedAt || null;
      signerPublicKey = attempt.signerPublicKey || null;
      proofStoppedAfterFirstAttempt = attempt.proofStoppedAfterFirstAttempt === true;
      signerMetadata.transactionSubmitted = transactionSubmitted;
      signerMetadata.broadcast = transactionSubmitted;
      signerMetadata.publicKey = signerPublicKey;
      r43eRealProofVerdict = REAL_PROOF_VERDICTS.ATTEMPTED;
      nextRequiredStep = NEXT_R43F_STEP;
    } catch (err) {
      const errMessage = err && err.message ? err.message : String(err);
      blockers.push(errMessage);
      if (err.code === "R43E_OPERATOR_DEPS_BLOCKED") {
        r43eRealProofVerdict = REAL_PROOF_VERDICTS.BLOCKED;
      } else if (err.code === "REAL_TRANSACTION_BUILD_NOT_IMPLEMENTED"
          || !context || context.sendRawTransactionCalled !== true) {
        r43eRealProofVerdict = REAL_PROOF_VERDICTS.FAILED_BEFORE_BROADCAST;
        broadcastError = errMessage;
      } else {
        r43eRealProofVerdict = REAL_PROOF_VERDICTS.ATTEMPTED;
        broadcastError = errMessage;
        nextRequiredStep = NEXT_R43F_STEP;
      }
    }
  }

  const finalTransactionStatus = {
    transactionSubmitted,
    signature,
    proofStoppedAfterFirstAttempt,
    broadcastAttemptedAt,
    broadcastError,
    broadcastAttemptCount: transactionSubmitted === true ? 1 : 0
  };

  const flagsReceived = {
    executeRealProof: cli.executeRealProof === true,
    humanPresent: cli.humanPresent === true,
    confirmOneTransactionProof: cli.confirmOneTransactionProof === true,
    finalBroadcastConfirmation: cli.finalBroadcastConfirmation === true,
    simulate: cli.simulate === true
  };

  return {
    timestamp: new Date().toISOString(),
    review: "R43E-3-operator-broadcast-proof-review",
    schemaVersion: SCHEMA_VERSION,
    gateDocPresent,
    approved: false,
    liveTradingApproved: false,
    strategyApproved: false,
    proofScope: PROOF_SCOPE,
    proofMode: REAL_PROOF_MODE,
    r43eRealProofVerdict,
    forbiddenVerdicts: FORBIDDEN_VERDICTS,
    flagsReceived,
    blockers,
    warnings,
    preBroadcastGateStatus,
    gateStatus: preBroadcastGateStatus,
    finalTransactionStatus,
    operatorBroadcastDepsEnabled,
    proofTargetSummary: summarizeProofTarget(proofTargetLoad.data),
    amountSol: proofTargetLoad.data?.amountSol ?? null,
    slippageBps: proofTargetLoad.data?.slippageBps ?? null,
    routeProvider: proofTargetLoad.data?.routeProvider ?? null,
    capsStatus: r43dStatus.capsStatus || {
      approved: caps?.approved === true,
      approvalScope: caps?.approvalScope || null,
      maxTradeSizeSol: caps?.maxTradeSizeSol,
      maxTradesPerSession: caps?.maxTradesPerSession,
      autoCompoundingAllowed: caps?.autoCompoundingAllowed,
      stopAfterFirstTransaction: caps?.stopAfterFirstTransaction
    },
    rpcStatus: rpcMetadata,
    signerStatus: signerMetadata,
    signerPublicKey,
    postureStatus: r43dStatus.postureStatus,
    transactionSubmitted,
    signature,
    broadcastAttemptedAt,
    broadcastError,
    proofStoppedAfterFirstAttempt,
    r7Status: r43dStatus.r7Verdict || "NOT ENOUGH DATA",
    nextRequiredStep,
    r43dVerdict: r43dStatus.r43dVerdict,
    simulationVerdict: simulationStatus.r43eVerdict,
    outputFile: REAL_PROOF_OUTPUT_FILE
  };
}

function writeRealProofReview(status, outputDir = OUTPUT_DIR) {
  const outputFile = path.join(outputDir, path.basename(REAL_PROOF_OUTPUT_FILE));
  assertAnalysisWritePath(outputFile, outputDir);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runRealProofReview(options = {}) {
  const analysisDir = options.outputDir || OUTPUT_DIR;
  return collectRealProofReviewAsync(options).then((status) => {
    const outputFile = writeRealProofReview(status, analysisDir);
    return { ...status, outputFile };
  });
}

function printRealProofSummary(status) {
  console.log("[r43e-real-proof] R43E-3 Operator Broadcast Proof Review (isolated path)");
  console.log(`  verdict: ${status.r43eRealProofVerdict}`);
  console.log(`  proofMode: ${status.proofMode}`);
  console.log(`  operatorBroadcastDepsEnabled: ${status.operatorBroadcastDepsEnabled === true}`);
  console.log(`  transactionSubmitted: ${status.transactionSubmitted}`);
  console.log(`  signature: ${status.signature || "null"}`);
  if (status.broadcastError) {
    console.log(`  broadcastError: ${status.broadcastError}`);
  }
  console.log(`  blockers: ${status.blockers.length}`);
  for (const blocker of status.blockers) {
    console.log(`    - ${blocker}`);
  }
  console.log(`  r43dVerdict: ${status.r43dVerdict}`);
  console.log(`  simulationVerdict: ${status.simulationVerdict}`);
  console.log(`  live trading approved: ${status.liveTradingApproved}`);
  console.log(`  next step: ${status.nextRequiredStep}`);
  console.log(`  output: ${status.outputFile}`);
}

function collectR43eOneTransactionProofHarness(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const cli = options.cli || parseCliArgs(options.argv);
  const cliValidation = validateCliFlags(cli);

  const gateDocPresent = options.gateDocPresent !== undefined
    ? options.gateDocPresent === true
    : fs.existsSync(path.join(repoRoot, GATE_DOC));

  const capsLoad = options.capsLoad !== undefined
    ? options.capsLoad
    : capsModule.loadCapsFile(path.join(repoRoot, "operator_records", "micro_live_demo_caps.json"));
  const caps = capsLoad.data;
  const proofScopeCaps = options.proofScopeCapsCheck !== undefined
    ? options.proofScopeCapsCheck
    : validateProofScopeCaps(caps);

  const r43dStatus = options.r43dStatusSummary !== undefined
    ? options.r43dStatusSummary
    : r43d.collectR43dFinalProofPreflight({
      repoRoot,
      runtimeRoot,
      analysisDir,
      humanPresent: cli.humanPresent === true,
      cli: { humanPresent: cli.humanPresent === true },
      runSecretScan: options.runSecretScan,
      ...options
    });

  const r43cStatus = options.r43cStatusSummary !== undefined
    ? options.r43cStatusSummary
    : r43c.buildStatus({
      repoRoot,
      runtimeRoot,
      analysisDir,
      runSecretScan: false,
      ...options
    });

  const providerCheck = options.providerCheck !== undefined
    ? options.providerCheck
    : r43c.checkProviderBlocksRealWithoutGuards();

  const localSecretSource = options.localSecretSourceCheck !== undefined
    ? options.localSecretSourceCheck
    : r43d.classifyLocalSignerSecretPresence({ repoRoot, env: options.env });

  const repeatedTradingScopeBlocked = options.repeatedTradingScopeBlocked === true
    || caps?.autoCompoundingAllowed === true
    || Number(caps?.maxTradesPerSession) > 1
    || caps?.stopAfterFirstTransaction === false
    || (options.repeatedTradingContext === true);

  const context = {
    cli,
    cliBlockers: cliValidation.blockers,
    r43dStatus,
    proofScopeCaps,
    r43cStatus,
    providerCheck,
    localSecretSource,
    repeatedTradingScopeBlocked
  };

  const derived = deriveR43eVerdict(context);
  const gateStatus = buildGateStatusTable(context);

  let proofIntent = null;
  if (derived.r43eVerdict === VERDICTS.COMPLETED) {
    proofIntent = buildProofIntent(context);
  }

  const signerMetadata = {
    r43cVerdict: r43cStatus.r43cVerdict,
    localRealBlockedByDefault: providerCheck.ok === true,
    localSecretSource,
    providerType: provider.PROVIDERS.LOCAL_REAL,
    secretContentPrinted: false,
    transactionSubmitted: false,
    broadcast: false
  };

  const rpcMetadata = {
    status: r43dStatus.rpcStatus?.status || r43dStatus.rpcStatus,
    source: r43dStatus.rpcStatus?.source || null,
    redactedUrl: r43dStatus.rpcStatus?.redactedUrl || "[REDACTED]",
    dedicatedCandidate: (r43dStatus.rpcStatus?.status || r43dStatus.rpcStatus)
      === rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE
  };

  const checks = [];
  const addCheck = (id, ok, detail) => checks.push({ id, ok: ok === true, detail });

  addCheck("gate_doc_present", gateDocPresent, GATE_DOC);
  addCheck("simulate_flag", cli.simulate === true, String(cli.simulate));
  addCheck("human_present_flag", cli.humanPresent === true, String(cli.humanPresent));
  addCheck("confirm_proof_flag", cli.confirmOneTransactionProof === true, String(cli.confirmOneTransactionProof));
  addCheck("r43d_ready", r43dStatus.r43dVerdict === r43d.VERDICTS.READY, r43dStatus.r43dVerdict);
  addCheck("proof_scope_caps", proofScopeCaps.ok, proofScopeCaps.errors?.join("; ") || "ok");
  addCheck("r43c_signer_ready", r43cStatus.r43cVerdict === r43c.VERDICTS.READY, r43cStatus.r43cVerdict);
  addCheck("simulation_only", true, PROOF_MODE);
  addCheck("transaction_not_submitted", true, "transactionSubmitted:false");
  addCheck("live_trading_not_approved", true, "live trading NOT APPROVED");

  const failed = checks.filter((check) => !check.ok);

  return {
    timestamp: new Date().toISOString(),
    review: "R43E-1-one-transaction-proof-harness",
    schemaVersion: SCHEMA_VERSION,
    gateDocPresent,
    approved: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    strategyApproved: false,
    engineeringProofApproved: proofScopeCaps.ok === true,
    proofScope: PROOF_SCOPE,
    proofMode: PROOF_MODE,
    simulationOnly: true,
    transactionSubmitted: false,
    humanPresent: cli.humanPresent === true,
    r43eReviewVerdict: R43E_REVIEW_VERDICT,
    r43eVerdict: derived.r43eVerdict,
    forbiddenVerdicts: FORBIDDEN_VERDICTS,
    nextRequiredStep: NEXT_REQUIRED_STEP,
    evaluation: {
      r43eVerdict: derived.r43eVerdict,
      r43eReviewVerdict: R43E_REVIEW_VERDICT,
      reason: derived.reason,
      approved: false,
      liveTradingApproved: false,
      proofScope: PROOF_SCOPE,
      proofMode: PROOF_MODE,
      transactionSubmitted: false,
      blockers: derived.blockers,
      warnings: derived.warnings
    },
    blockers: derived.blockers,
    warnings: derived.warnings,
    gateStatus,
    proofIntent,
    capsStatus: r43dStatus.capsStatus || {
      approved: caps?.approved === true,
      approvalScope: caps?.approvalScope || null,
      maxTradeSizeSol: caps?.maxTradeSizeSol,
      maxTradesPerSession: caps?.maxTradesPerSession,
      autoCompoundingAllowed: caps?.autoCompoundingAllowed,
      stopAfterFirstTransaction: caps?.stopAfterFirstTransaction
    },
    rpcStatus: rpcMetadata,
    signerStatus: signerMetadata,
    postureStatus: r43dStatus.postureStatus,
    r43dVerdict: r43dStatus.r43dVerdict,
    r7Verdict: r43dStatus.r7Verdict,
    checks,
    failedChecks: failed.map((check) => check.id),
    outputFile: OUTPUT_FILE
  };
}

function assertAnalysisWritePath(outputFile, analysisDir) {
  const resolvedOutput = path.resolve(outputFile);
  const resolvedAnalysis = path.resolve(analysisDir);
  const prefix = resolvedAnalysis.endsWith(path.sep)
    ? resolvedAnalysis
    : `${resolvedAnalysis}${path.sep}`;
  if (!resolvedOutput.startsWith(prefix)) {
    throw new Error("R43E output must stay under analysis/");
  }
}

function writeStatus(status, outputDir = OUTPUT_DIR) {
  const outputFile = path.join(outputDir, path.basename(OUTPUT_FILE));
  assertAnalysisWritePath(outputFile, outputDir);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runR43eOneTransactionProofHarness(options = {}) {
  const analysisDir = options.outputDir || OUTPUT_DIR;
  const status = collectR43eOneTransactionProofHarness(options);
  const outputFile = writeStatus(status, analysisDir);
  return { ...status, outputFile };
}

function printSummary(status) {
  console.log("[r43e-proof-harness] R43E-1 One Transaction Proof Harness (SIMULATION_ONLY)");
  console.log(`  verdict: ${status.r43eVerdict}`);
  console.log(`  review: ${status.r43eReviewVerdict}`);
  console.log(`  proofMode: ${status.proofMode}`);
  console.log(`  transactionSubmitted: ${status.transactionSubmitted}`);
  console.log(`  blockers: ${status.blockers.length}`);
  if (status.blockers.length > 0) {
    for (const blocker of status.blockers) {
      console.log(`    - ${blocker}`);
    }
  }
  if (status.warnings.length > 0) {
    console.log(`  warnings: ${status.warnings.length}`);
    for (const warning of status.warnings) {
      console.log(`    - ${warning}`);
    }
  }
  if (status.proofIntent) {
    console.log(`  proofId: ${status.proofIntent.proofId}`);
  }
  console.log(`  r43dVerdict: ${status.r43dVerdict}`);
  console.log(`  live trading approved: ${status.liveTradingApproved}`);
  console.log(`  next step: ${status.nextRequiredStep}`);
  console.log(`  output: ${status.outputFile}`);
}

if (require.main === module) {
  const cli = parseCliArgs();
  if (cli.executeRealProof === true) {
    runRealProofReview({ cli })
      .then((status) => printRealProofSummary(status))
      .catch((err) => {
        console.error("[r43e-real-proof] fatal:", err.message);
        process.exit(1);
      });
  } else {
    const status = runR43eOneTransactionProofHarness({ cli });
    printSummary(status);
  }
}

module.exports = {
  ROOT,
  RUNTIME_ROOT,
  OUTPUT_DIR,
  OUTPUT_FILE,
  REAL_PROOF_OUTPUT_FILE,
  GATE_DOC,
  REAL_PROOF_GATE_DOC,
  OPERATOR_BROADCAST_DEPS_DOC,
  TARGET_CONFIG_REL,
  EXAMPLE_TARGET_REL,
  PLACEHOLDER_OUTPUT_MINT,
  PROOF_SCOPE,
  PROOF_MODE,
  REAL_PROOF_MODE,
  NEXT_REQUIRED_STEP,
  NEXT_R43F_STEP,
  VERDICTS,
  REAL_PROOF_VERDICTS,
  FORBIDDEN_VERDICTS,
  R43E_REVIEW_VERDICT,
  parseCliArgs,
  validateCliFlags,
  validateRealProofCli,
  validateRealProofBroadcastCli,
  validateProofScopeCaps,
  validateProofTarget,
  loadProofTargetConfig,
  summarizeProofTarget,
  createDefaultProofDeps,
  resolveRealProofDeps,
  executeRealProofAttempt,
  collectRealProofReviewAsync,
  buildProofIntent,
  collectR43eOneTransactionProofHarness,
  collectRealProofReview,
  writeStatus,
  writeRealProofReview,
  runR43eOneTransactionProofHarness,
  runRealProofReview,
  printSummary,
  printRealProofSummary
};
