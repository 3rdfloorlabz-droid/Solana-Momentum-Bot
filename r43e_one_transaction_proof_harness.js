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

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R43E_OUTPUT_DIR
  ? path.resolve(process.env.R43E_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r43e_one_transaction_proof_harness.json");
const REAL_PROOF_OUTPUT_FILE = path.join(OUTPUT_DIR, "r43e_real_proof_review.json");
const GATE_DOC = "docs/R43E_ONE_TRANSACTION_PROOF_HARNESS.md";
const REAL_PROOF_GATE_DOC = "docs/R43E2_REAL_TRANSACTION_IMPLEMENTATION_REVIEW.md";
const TARGET_CONFIG_REL = "operator_records/r43e_real_proof_target.json";
const EXAMPLE_TARGET_REL = "examples/r43e_real_proof_target.example.json";
const PLACEHOLDER_OUTPUT_MINT = "PLACEHOLDER_TARGET_TOKEN_MINT";

const SCHEMA_VERSION = 1;
const R43E_REVIEW_VERDICT = "R43E ONE TRANSACTION PROOF HARNESS — SIMULATION + REAL PROOF REVIEW — NOT LIVE TRADING";
const PROOF_SCOPE = "one-transaction engineering proof only";
const PROOF_MODE = "SIMULATION_ONLY";
const REAL_PROOF_MODE = "REAL_PROOF_ISOLATED";
const NEXT_REQUIRED_STEP = "final execution command required";
const NEXT_R43F_STEP = "R43F post-transaction audit review";
const MAX_TRADE_SIZE_SOL = 0.01;

const VERDICTS = Object.freeze({
  NOT_READY: "R43E_SIMULATION_NOT_READY",
  READY: "R43E_SIMULATION_READY",
  COMPLETED: "R43E_SIMULATION_COMPLETED"
});

const REAL_PROOF_VERDICTS = Object.freeze({
  NOT_READY: "R43E_REAL_PROOF_NOT_READY",
  READY_FOR_FINAL_COMMAND: "R43E_REAL_PROOF_READY_FOR_FINAL_COMMAND",
  ATTEMPTED: "R43E_REAL_PROOF_ATTEMPTED",
  BLOCKED: "R43E_REAL_PROOF_BLOCKED"
});

const FORBIDDEN_VERDICTS = Object.freeze([
  "LIVE_APPROVED",
  "READY_FOR_LIVE_TRADING",
  "REAL_TRANSACTION_SUBMITTED",
  "STRATEGY_APPROVED",
  "AUTONOMOUS_TRADING_ENABLED"
]);

function parseCliArgs(argv = process.argv.slice(2)) {
  return {
    simulate: argv.includes("--simulate"),
    executeRealProof: argv.includes("--execute-real-proof"),
    humanPresent: argv.includes("--human-present"),
    confirmOneTransactionProof: argv.includes("--confirm-one-transaction-proof"),
    finalBroadcastConfirmation: argv.includes("--final-broadcast-confirmation")
  };
}

function validateCliFlags(cli = {}) {
  const blockers = [];
  if (cli.executeRealProof === true) {
    blockers.push("real proof path requires --execute-real-proof handler; do not combine with simulation-only flags");
    return { ok: false, blockers };
  }
  if (cli.simulate !== true) {
    blockers.push("--simulate required for R43E proof harness (SIMULATION_ONLY)");
  }
  if (cli.humanPresent !== true) {
    blockers.push("--human-present required");
  }
  if (cli.confirmOneTransactionProof !== true) {
    blockers.push("--confirm-one-transaction-proof required");
  }
  return { ok: blockers.length === 0, blockers };
}

function validateRealProofCli(cli = {}) {
  const blockers = [];
  if (cli.executeRealProof !== true) {
    blockers.push("--execute-real-proof required for real proof path");
  }
  if (cli.simulate === true) {
    blockers.push("--simulate cannot be combined with --execute-real-proof");
  }
  if (cli.humanPresent !== true) {
    blockers.push("--human-present required");
  }
  if (cli.confirmOneTransactionProof !== true) {
    blockers.push("--confirm-one-transaction-proof required");
  }
  return { ok: blockers.length === 0, blockers };
}

function validateRealProofBroadcastCli(cli = {}) {
  const base = validateRealProofCli(cli);
  if (!base.ok) return base;
  if (cli.finalBroadcastConfirmation !== true) {
    return { ok: false, blockers: ["--final-broadcast-confirmation required for broadcast attempt"] };
  }
  return { ok: true, blockers: [] };
}

function validateProofScopeCaps(caps) {
  const errors = [];
  if (!caps || typeof caps !== "object") {
    return { ok: false, errors: ["caps missing"] };
  }
  if (caps.approved !== true) errors.push("caps not approved");
  if (caps.approvalScope !== r43b.REQUIRED_APPROVAL_SCOPE) {
    errors.push("approvalScope must be one-transaction micro-live engineering proof only");
  }
  if (!Number.isFinite(Number(caps.maxTradeSizeSol)) || Number(caps.maxTradeSizeSol) > MAX_TRADE_SIZE_SOL) {
    errors.push(`maxTradeSizeSol must be <= ${MAX_TRADE_SIZE_SOL}`);
  }
  if (!Number.isFinite(Number(caps.maxDailyLossSol)) || Number(caps.maxDailyLossSol) > 0.05) {
    errors.push("maxDailyLossSol must be <= 0.05");
  }
  if (Number(caps.maxTradesPerSession) !== 1) errors.push("maxTradesPerSession must be 1");
  if (Number(caps.maxOpenLivePositions) !== 1) errors.push("maxOpenLivePositions must be 1");
  if (caps.autoCompoundingAllowed !== false) errors.push("autoCompoundingAllowed must be false");
  if (caps.stopAfterFirstTransaction !== true) errors.push("stopAfterFirstTransaction must be true");
  return { ok: errors.length === 0, errors };
}

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

function loadProofTargetConfig(repoRoot, options = {}) {
  if (options.proofTargetLoad !== undefined) {
    return options.proofTargetLoad;
  }
  const file = path.join(repoRoot, TARGET_CONFIG_REL);
  if (!fs.existsSync(file)) {
    return { status: "missing", file, data: null };
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return { status: "present", file, data };
  } catch (err) {
    return {
      status: "corrupt",
      file,
      data: null,
      error: err && err.message ? err.message : String(err)
    };
  }
}

function validateProofTarget(target) {
  const errors = [];
  if (!target || typeof target !== "object") {
    return { ok: false, errors: ["proof target missing"] };
  }
  if (target.configType !== "R43E_REAL_PROOF_TARGET") {
    errors.push("configType must be R43E_REAL_PROOF_TARGET");
  }
  if (target.purpose !== PROOF_SCOPE) {
    errors.push(`purpose must be "${PROOF_SCOPE}"`);
  }
  if (!Number.isFinite(Number(target.amountSol)) || Number(target.amountSol) > MAX_TRADE_SIZE_SOL) {
    errors.push(`amountSol must be <= ${MAX_TRADE_SIZE_SOL}`);
  }
  if (!Number.isFinite(Number(target.maxTradeSizeSol)) || Number(target.maxTradeSizeSol) > MAX_TRADE_SIZE_SOL) {
    errors.push(`maxTradeSizeSol must be <= ${MAX_TRADE_SIZE_SOL}`);
  }
  if (target.stopAfterFirstTransaction !== true) {
    errors.push("stopAfterFirstTransaction must be true");
  }
  if (target.autoCompoundingAllowed === true) {
    errors.push("autoCompoundingAllowed must be false");
  }
  if (!target.inputMint || typeof target.inputMint !== "string") {
    errors.push("inputMint required");
  }
  if (!target.outputMint || typeof target.outputMint !== "string") {
    errors.push("outputMint required");
  }
  if (target.outputMint === PLACEHOLDER_OUTPUT_MINT || /PLACEHOLDER/i.test(target.outputMint)) {
    errors.push("outputMint must not be a placeholder");
  }
  if (target.routeProvider !== "jupiter") {
    errors.push("routeProvider must be jupiter for isolated proof path");
  }
  return { ok: errors.length === 0, errors };
}

function summarizeProofTarget(target) {
  if (!target) return null;
  return {
    configType: target.configType || null,
    purpose: target.purpose || null,
    inputMint: target.inputMint || null,
    outputMint: target.outputMint || null,
    amountSol: target.amountSol,
    slippageBps: target.slippageBps,
    routeProvider: target.routeProvider || null,
    maxTradeSizeSol: target.maxTradeSizeSol,
    stopAfterFirstTransaction: target.stopAfterFirstTransaction === true
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

function executeRealProofAttempt(context, deps) {
  assertRealProofGuards(context);
  if (context.broadcastAttempted === true) {
    throw Object.assign(new Error("stopAfterFirstTransaction — broadcast already attempted"), {
      code: "R43E_PROOF_STOPPED"
    });
  }
  const quote = deps.fetchJupiterQuote(context);
  const swapTx = deps.fetchJupiterSwapTransaction(context, quote);
  const signer = deps.loadGuardedLocalSigner(context);
  const signed = deps.signSwapTransaction(signer, swapTx, context);
  const broadcast = deps.sendRawTransaction({
    rpcUrlRedacted: context.rpcMetadata.redactedUrl,
    signedTransaction: signed.signedTransactionBase64
  });
  context.broadcastAttempted = true;
  return {
    transactionSubmitted: true,
    signature: broadcast.signature || null,
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
  const repoRoot = options.repoRoot || ROOT;
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const cli = options.cli || parseCliArgs(options.argv);
  const deps = options.deps || createDefaultProofDeps();
  const realCliValidation = validateRealProofCli(cli);
  const blockers = [...realCliValidation.blockers];
  const warnings = [];

  const gateDocPresent = options.realProofGateDocPresent !== undefined
    ? options.realProofGateDocPresent === true
    : fs.existsSync(path.join(repoRoot, REAL_PROOF_GATE_DOC));

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

  let r43eRealProofVerdict = REAL_PROOF_VERDICTS.NOT_READY;
  let transactionSubmitted = false;
  let signature = null;
  let proofStoppedAfterFirstAttempt = false;
  let nextRequiredStep = "final execution command required";

  const gateStatus = {
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
    liveTradingApproved: false,
    transactionSubmitted: false
  };

  if (executorIntegration.ok === false) {
    r43eRealProofVerdict = REAL_PROOF_VERDICTS.BLOCKED;
  } else if (proofTargetValidation.ok === false && proofTargetLoad.status === "present") {
    r43eRealProofVerdict = REAL_PROOF_VERDICTS.BLOCKED;
  }

  if (blockers.length > 0) {
    r43eRealProofVerdict = r43eRealProofVerdict === REAL_PROOF_VERDICTS.BLOCKED
      ? REAL_PROOF_VERDICTS.BLOCKED
      : REAL_PROOF_VERDICTS.NOT_READY;
  } else if (cli.finalBroadcastConfirmation !== true) {
    r43eRealProofVerdict = REAL_PROOF_VERDICTS.READY_FOR_FINAL_COMMAND;
    nextRequiredStep = "final execution command required";
  } else {
    const context = {
      cli,
      realProofGuardsPassed: true,
      rpcMetadata,
      proofTarget: proofTargetLoad.data,
      caps,
      r43dStatus,
      broadcastAttempted: false
    };
    try {
      const attempt = executeRealProofAttempt(context, deps);
      transactionSubmitted = attempt.transactionSubmitted === true;
      signature = attempt.signature;
      proofStoppedAfterFirstAttempt = attempt.proofStoppedAfterFirstAttempt === true;
      signerMetadata.transactionSubmitted = transactionSubmitted;
      signerMetadata.broadcast = transactionSubmitted;
      r43eRealProofVerdict = REAL_PROOF_VERDICTS.ATTEMPTED;
      nextRequiredStep = NEXT_R43F_STEP;
    } catch (err) {
      blockers.push(err && err.message ? err.message : String(err));
      r43eRealProofVerdict = REAL_PROOF_VERDICTS.BLOCKED;
    }
  }

  const flagsReceived = {
    executeRealProof: cli.executeRealProof === true,
    humanPresent: cli.humanPresent === true,
    confirmOneTransactionProof: cli.confirmOneTransactionProof === true,
    finalBroadcastConfirmation: cli.finalBroadcastConfirmation === true,
    simulate: cli.simulate === true
  };

  return {
    timestamp: new Date().toISOString(),
    review: "R43E-2-real-transaction-proof-review",
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
    gateStatus,
    proofTargetSummary: summarizeProofTarget(proofTargetLoad.data),
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
    transactionSubmitted,
    signature,
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
  const status = collectRealProofReview(options);
  const outputFile = writeRealProofReview(status, analysisDir);
  return { ...status, outputFile };
}

function printRealProofSummary(status) {
  console.log("[r43e-real-proof] R43E-2 Real Transaction Proof Review (isolated path)");
  console.log(`  verdict: ${status.r43eRealProofVerdict}`);
  console.log(`  proofMode: ${status.proofMode}`);
  console.log(`  transactionSubmitted: ${status.transactionSubmitted}`);
  console.log(`  signature: ${status.signature || "null"}`);
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
    const status = runRealProofReview({ cli });
    printRealProofSummary(status);
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
  executeRealProofAttempt,
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
