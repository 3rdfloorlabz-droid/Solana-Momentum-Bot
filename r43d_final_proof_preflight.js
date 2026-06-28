"use strict";

// r43d_final_proof_preflight.js — R43D read-only final proof preflight.
// Writes analysis/ only. Does NOT enable live trading, sign, or submit transactions.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const review = require("./r7_strategy_review");
const r42 = require("./r42_final_micro_live_review");
const r43b = require("./r43b_operator_caps_approval_check");
const r43c = require("./r43c_local_signer_readiness");
const capsModule = require("./micro_live_caps");
const rpcConfig = require("./micro_live_rpc_config");
const rpcPreflight = require("./micro_live_rpc_preflight");
const guardrails = require("./micro_live_guardrails");
const signerPreflight = require("./signer_plan_preflight");
const secretScan = require("./secret_safety_scan");
const localSigner = require("./local_signer");
const provider = require("./signer_provider");
const mockSigner = require("./mock_signer");
const livePositionsStore = require("./live_positions_store");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R43D_OUTPUT_DIR
  ? path.resolve(process.env.R43D_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r43d_final_proof_preflight.json");
const GATE_DOC = "docs/R43D_FINAL_PROOF_PREFLIGHT.md";
const OPERATOR_CAPS = "operator_records/micro_live_demo_caps.json";

const SCHEMA_VERSION = 1;
const R43D_REVIEW_VERDICT = "R43D FINAL PROOF PREFLIGHT — NOT LIVE TRADING — NO TRANSACTION";
const PROOF_SCOPE = "one-transaction engineering proof only";
const REQUIRED_OPERATOR_NAME = "Taylor Cheaney";

const VERDICTS = Object.freeze({
  NOT_READY: "R43D_NOT_READY_FOR_PROOF",
  READY: "R43D_READY_FOR_ONE_TRANSACTION_PROOF"
});

const FORBIDDEN_VERDICTS = Object.freeze([
  "LIVE_APPROVED",
  "READY_FOR_LIVE_TRADING",
  "STRATEGY_APPROVED"
]);

const SUSPICIOUS_UNTRACKED_PATTERNS = [
  /^\.env/i,
  /secret/i,
  /private[_-]?key/i,
  /recovery_actions\.jsonl$/i,
  /\.pem$/i,
  /mnemonic/i,
  /seed[_-]?phrase/i
];

function parseCliArgs(argv = process.argv.slice(2)) {
  return {
    humanPresent: argv.includes("--human-present")
  };
}

function readPosture(runtimeRoot) {
  const cfg = review.readJsonFile(path.join(runtimeRoot, "live_config.json"));
  if (cfg.status !== "usable") {
    return { available: false, status: cfg.status };
  }
  const data = cfg.data || {};
  return {
    available: true,
    executionMode: data.executionMode || "unknown",
    dryRunMode: data.dryRunMode !== false,
    liveArmed: data.liveArmed === true,
    emergencyStop: data.emergencyStop === true,
    liveSubmission: "DISARMED"
  };
}

function isSafeProofPosture(posture) {
  return (
    posture.available === true &&
    posture.executionMode === "PIPELINE_DRY_RUN" &&
    posture.dryRunMode === true &&
    posture.liveArmed === false &&
    posture.emergencyStop !== true &&
    (posture.liveSubmission === "DISARMED" || posture.liveSubmission === undefined)
  );
}

function checkGitStatus(repoRoot, options = {}) {
  if (options.gitStatusCheck !== undefined) {
    return options.gitStatusCheck;
  }

  const result = spawnSync("git", ["-C", repoRoot, "status", "--porcelain"], {
    encoding: "utf8",
    windowsHide: true
  });

  if (result.status !== 0) {
    return {
      available: false,
      clean: false,
      ok: false,
      dirtyFiles: [],
      untrackedSuspicious: [],
      note: "git status unavailable"
    };
  }

  const lines = (result.stdout || "").split(/\r?\n/).filter(Boolean);
  const untrackedSuspicious = [];
  for (const line of lines) {
    const filePath = line.slice(3).trim();
    const isUntracked = line.startsWith("??");
    if (isUntracked && SUSPICIOUS_UNTRACKED_PATTERNS.some((pattern) => pattern.test(filePath))) {
      untrackedSuspicious.push(filePath);
    }
  }

  return {
    available: true,
    clean: lines.length === 0,
    ok: lines.length === 0 && untrackedSuspicious.length === 0,
    dirtyFiles: lines,
    untrackedSuspicious,
    note: lines.length === 0
      ? "working tree clean"
      : `${lines.length} dirty path(s)`
  };
}

function checkLocalRpcConfigGitignored(repoRoot, options = {}) {
  if (options.localRpcGitignoreCheck !== undefined) {
    return options.localRpcGitignoreCheck;
  }

  const rel = rpcConfig.LOCAL_CONFIG_REL.replace(/\\/g, "/");
  const gitignorePath = path.join(repoRoot, ".gitignore");
  let gitignored = false;
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, "utf8");
    gitignored = content.includes("local_rpc_config.json");
  }

  const trackedResult = spawnSync("git", ["-C", repoRoot, "ls-files", "--error-unmatch", rel], {
    encoding: "utf8",
    windowsHide: true
  });
  const tracked = trackedResult.status === 0;

  return {
    ok: gitignored && !tracked,
    gitignored,
    tracked,
    file: rel,
    note: gitignored && !tracked
      ? "local RPC config gitignored and not tracked"
      : tracked
        ? "local RPC config is tracked in git"
        : "local RPC config not listed in .gitignore"
  };
}

function checkLivePositions(runtimeRoot, options = {}) {
  if (options.livePositionsCheck !== undefined) {
    return options.livePositionsCheck;
  }

  const file = path.join(runtimeRoot, "live_positions.json");
  if (!fs.existsSync(file)) {
    return { ok: true, openCount: 0, status: "missing" };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const validation = livePositionsStore.validateLivePositionsState(parsed);
    const openCount = Array.isArray(parsed) ? parsed.length : 0;
    return {
      ok: validation.ok && openCount === 0,
      openCount,
      status: validation.ok ? "usable" : "invalid"
    };
  } catch {
    return { ok: false, openCount: null, status: "corrupt" };
  }
}

function classifyLocalSignerSecretPresence(options = {}) {
  const env = options.env || process.env;
  const repoRoot = options.repoRoot || ROOT;
  const hasEnvJson = Boolean(env[localSigner.ENV_SECRET_JSON]);
  const hasKeyfile = Boolean(env[localSigner.ENV_KEYFILE]);
  let keyfileOutsideRepo = null;

  if (hasKeyfile) {
    try {
      const resolved = path.resolve(env[localSigner.ENV_KEYFILE]);
      const rel = path.relative(path.resolve(repoRoot), resolved);
      keyfileOutsideRepo = rel.startsWith("..") || path.isAbsolute(rel);
    } catch {
      keyfileOutsideRepo = false;
    }
  }

  return {
    envSecretJsonPresent: hasEnvJson,
    keyfilePathPresent: hasKeyfile,
    keyfileOutsideRepo,
    contentPrinted: false,
    contentRead: false,
    note: hasEnvJson || hasKeyfile
      ? "local signer source configured (content not read or printed)"
      : "no local signer secret source detected"
  };
}

function checkExecutorSubmitDisarmed(posture) {
  const ok = posture.available === true
    && posture.executionMode === "PIPELINE_DRY_RUN"
    && posture.dryRunMode === true
    && posture.liveArmed === false
    && (posture.liveSubmission === "DISARMED" || posture.liveSubmission === undefined);
  return {
    ok,
    detail: ok ? "live_executor submit path disarmed via posture" : "submit path not disarmed"
  };
}

function scanAnalysisForSecrets(analysisDir) {
  if (!fs.existsSync(analysisDir)) {
    return { ok: true, suspicious: [] };
  }
  const suspicious = [];
  for (const entry of fs.readdirSync(analysisDir)) {
    const full = path.join(analysisDir, entry);
    if (!fs.statSync(full).isFile()) continue;
    const content = fs.readFileSync(full, "utf8");
    if (mockSigner.containsSuspiciousSecretMaterial(content)) {
      suspicious.push(entry);
    }
  }
  return { ok: suspicious.length === 0, suspicious };
}

function buildGateStatusTable(context) {
  return {
    gitClean: context.gitStatus.clean === true,
    noUntrackedSuspicious: context.gitStatus.untrackedSuspicious.length === 0,
    localRpcConfigGitignored: context.localRpcGitignore.ok === true,
    rpcSecretsNotCommitted: context.committedRpcSecrets.ok === true,
    posturePipelineDryRun: context.posture.executionMode === "PIPELINE_DRY_RUN",
    dryRunModeTrue: context.posture.dryRunMode === true,
    liveArmedFalse: context.posture.liveArmed !== true,
    liveSubmissionDisarmed: context.posture.liveSubmission === "DISARMED"
      || context.posture.liveSubmission === undefined,
    recoveryAbsent: !context.recoveryPresent,
    r43bCapsValid: context.capsValidation.ok === true,
    rpcDedicatedCandidate: context.rpcStatus === rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE,
    r43cSignerReady: context.r43cStatus.r43cVerdict === r43c.VERDICTS.READY,
    localRealBlockedByDefault: context.providerCheck.ok === true,
    executorSignerNotIntegrated: context.executorIntegration.ok === true,
    executorSubmitDisarmed: context.executorSubmitDisarmed.ok === true,
    noDuplicateExecutor: !context.singletonCheck.duplicateLoop,
    singletonHealthy: !context.singletonCheck.malformed,
    livePositionsEmpty: context.livePositions.ok === true,
    noSessionProofCompleted: context.sessionTrades.ok === true,
    noNonTestSecretPatterns: context.nonTestSecretFindings.length === 0,
    analysisOutputClean: context.analysisSecretCheck.ok === true,
    humanPresent: context.humanPresent === true,
    operatorNameValid: context.operatorNameOk === true,
    approvalTextPresent: context.approvalTextOk === true,
    r7NotEnoughData: context.r7Verdict === "NOT ENOUGH DATA",
    fullLiveTradingNotApproved: true
  };
}

function deriveR43dVerdict(context) {
  const blockers = [];
  const warnings = [];

  if (context.humanPresent !== true) {
    blockers.push("humanPresent flag missing — re-run with --human-present");
  }
  if (context.gitStatus.available && !context.gitStatus.clean) {
    blockers.push("git working tree dirty");
  }
  if (context.gitStatus.untrackedSuspicious.length > 0) {
    blockers.push(`untracked suspicious file(s): ${context.gitStatus.untrackedSuspicious.join(", ")}`);
  }
  if (!context.localRpcGitignore.ok) {
    blockers.push("local RPC config not gitignored or is tracked");
  }
  if (!context.committedRpcSecrets.ok) {
    blockers.push("committed RPC URL/key detected");
  }
  if (!context.postureSafe) {
    blockers.push("unsafe runtime posture");
  }
  if (context.recoveryPresent) {
    blockers.push("recovery_actions.jsonl present");
  }
  if (!context.capsValidation.ok) {
    blockers.push(`R43B caps invalid: ${context.capsValidation.errors.join("; ")}`);
  }
  if (context.rpcStatus !== rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE) {
    blockers.push(`RPC status is ${context.rpcStatus}`);
  }
  if (context.r43cStatus.r43cVerdict !== r43c.VERDICTS.READY) {
    blockers.push(`R43C signer not ready: ${context.r43cStatus.r43cVerdict}`);
  }
  if (!context.providerCheck.ok) {
    blockers.push("local_real not blocked without explicit guard options");
  }
  if (!context.executorIntegration.ok) {
    blockers.push("live_executor signer integration detected");
  }
  if (!context.executorSubmitDisarmed.ok) {
    blockers.push("live_executor submit path not disarmed");
  }
  if (context.singletonCheck.duplicateLoop) {
    blockers.push("duplicate executor loop active");
  }
  if (context.singletonCheck.malformed) {
    blockers.push("executor singleton lock malformed");
  }
  if (!context.livePositions.ok) {
    blockers.push(`live_positions.json not empty/valid (open=${context.livePositions.openCount})`);
  }
  if (!context.sessionTrades.ok) {
    blockers.push(`session proof already has ${context.sessionTrades.count} non-dry-run trade(s)`);
  }
  if (context.nonTestSecretFindings.length > 0) {
    blockers.push("non-test secret patterns found in repo");
  }
  if (!context.analysisSecretCheck.ok) {
    blockers.push("secret-like material in analysis output");
  }
  if (!context.operatorNameOk) {
    blockers.push(`operator name must be ${REQUIRED_OPERATOR_NAME}`);
  }
  if (!context.approvalTextOk) {
    blockers.push("R43B approval text missing or invalid");
  }
  if (context.r7Verdict !== "NOT ENOUGH DATA") {
    blockers.push(`R7 verdict must be NOT ENOUGH DATA (got ${context.r7Verdict})`);
  }

  if (!context.localSecretSource.envSecretJsonPresent
      && !context.localSecretSource.keyfilePathPresent) {
    warnings.push("no local signer secret source detected — configure before R43E execution");
  }

  if (blockers.length > 0) {
    return {
      r43dVerdict: VERDICTS.NOT_READY,
      blockers,
      warnings,
      reason: blockers.join("; ")
    };
  }

  return {
    r43dVerdict: VERDICTS.READY,
    blockers: [],
    warnings,
    reason: "Final proof preflight gates satisfied — ready for R43E one-transaction attempt; live trading still NOT APPROVED"
  };
}

function collectR43dFinalProofPreflight(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const cli = options.cli || parseCliArgs(options.argv);
  const humanPresent = options.humanPresent === true || cli.humanPresent === true;

  const gateDocPresent = options.gateDocPresent !== undefined
    ? options.gateDocPresent === true
    : fs.existsSync(path.join(repoRoot, GATE_DOC));

  const recoveryPresent = options.recoveryPresent !== undefined
    ? options.recoveryPresent === true
    : fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"))
      || fs.existsSync(path.join(repoRoot, "recovery_actions.jsonl"));

  const posture = options.posture || readPosture(runtimeRoot);
  const postureSafe = options.postureSafe !== undefined
    ? options.postureSafe === true
    : isSafeProofPosture(posture);

  const gitStatus = checkGitStatus(repoRoot, options);
  const localRpcGitignore = checkLocalRpcConfigGitignored(repoRoot, options);
  const committedRpcSecrets = options.committedRpcSecretsCheck !== undefined
    ? options.committedRpcSecretsCheck
    : rpcPreflight.checkCommittedRpcSecrets(repoRoot, options);

  const rpcSetup = options.rpcSetupSummary !== undefined
    ? options.rpcSetupSummary
    : rpcConfig.loadMicroLiveRpcConfig({ repoRoot, runtimeRoot, ...options });
  const rpcStatus = options.rpcStatus !== undefined ? options.rpcStatus : rpcSetup.status;

  const capsLoad = options.capsLoad !== undefined
    ? options.capsLoad
    : capsModule.loadCapsFile(path.join(repoRoot, OPERATOR_CAPS));
  const caps = capsLoad.data;
  const capsValidation = r43b.validateCapsApprovalRecord(caps, options);
  const operatorNameOk = caps?.approvedBy === REQUIRED_OPERATOR_NAME;
  const approvalTextOk = caps?.approvalText === r43b.REQUIRED_APPROVAL_TEXT;

  const r43cStatus = options.r43cStatusSummary !== undefined
    ? options.r43cStatusSummary
    : r43c.buildStatus({
      repoRoot,
      runtimeRoot,
      analysisDir,
      posture,
      postureSafe,
      recoveryPresent,
      rpcSetup,
      capsLoad,
      runSecretScan: false,
      ...options
    });

  const providerCheck = options.providerCheck !== undefined
    ? options.providerCheck
    : r43c.checkProviderBlocksRealWithoutGuards();

  const executorIntegration = options.executorIntegrationCheck !== undefined
    ? options.executorIntegrationCheck
    : r42.checkExecutorIntegration(repoRoot);

  const singletonCheck = options.singletonCheck !== undefined
    ? options.singletonCheck
    : guardrails.checkSingletonLock(runtimeRoot);

  const livePositions = checkLivePositions(runtimeRoot, options);
  const sessionTrades = options.sessionTradesCheck !== undefined
    ? options.sessionTradesCheck
    : guardrails.countLiveSessionTrades(runtimeRoot);

  const executorSubmitDisarmed = checkExecutorSubmitDisarmed(posture);

  let nonTestSecretFindings;
  if (options.secretScanFindings !== undefined) {
    nonTestSecretFindings = options.secretScanFindings;
  } else if (options.runSecretScan === false) {
    nonTestSecretFindings = [];
  } else {
    const scan = secretScan.scanRepo(repoRoot, options.scanOptions);
    nonTestSecretFindings = signerPreflight.filterNonTestSecretFindings(scan.findings);
  }

  const analysisSecretCheck = options.analysisSecretCheck !== undefined
    ? options.analysisSecretCheck
    : scanAnalysisForSecrets(analysisDir);

  const localSecretSource = options.localSecretSourceCheck !== undefined
    ? options.localSecretSourceCheck
    : classifyLocalSignerSecretPresence({ repoRoot, env: options.env });

  const r7Verdict = options.r7Verdict !== undefined
    ? options.r7Verdict
    : r43b.readR7Verdict(analysisDir, options);

  const context = {
    humanPresent,
    gitStatus,
    localRpcGitignore,
    committedRpcSecrets,
    posture,
    postureSafe,
    recoveryPresent,
    capsValidation,
    operatorNameOk,
    approvalTextOk,
    rpcStatus,
    rpcSetup,
    r43cStatus,
    providerCheck,
    executorIntegration,
    executorSubmitDisarmed,
    singletonCheck,
    livePositions,
    sessionTrades,
    nonTestSecretFindings,
    analysisSecretCheck,
    localSecretSource,
    r7Verdict
  };

  const derived = deriveR43dVerdict(context);
  const gateStatus = buildGateStatusTable(context);

  const checks = [];
  const addCheck = (id, ok, detail) => checks.push({ id, ok: ok === true, detail });

  addCheck("gate_doc_present", gateDocPresent, GATE_DOC);
  addCheck("human_present", humanPresent, humanPresent ? "operator affirmed presence" : "missing --human-present");
  addCheck("git_clean", gitStatus.clean === true, gitStatus.note);
  addCheck("no_untracked_suspicious", gitStatus.untrackedSuspicious.length === 0, String(gitStatus.untrackedSuspicious.length));
  addCheck("local_rpc_gitignored", localRpcGitignore.ok, localRpcGitignore.note);
  addCheck("rpc_secrets_not_committed", committedRpcSecrets.ok, `${committedRpcSecrets.findings?.length || 0} finding(s)`);
  addCheck("posture_disarmed", postureSafe, "PIPELINE_DRY_RUN / dryRunMode true / liveArmed false / DISARMED");
  addCheck("recovery_absent", !recoveryPresent, "recovery_actions.jsonl absent");
  addCheck("r43b_caps_valid", capsValidation.ok, capsValidation.errors.join("; ") || "ok");
  addCheck("rpc_dedicated_candidate", rpcStatus === rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE, rpcStatus);
  addCheck("r43c_signer_ready", r43cStatus.r43cVerdict === r43c.VERDICTS.READY, r43cStatus.r43cVerdict);
  addCheck("local_real_blocked_by_default", providerCheck.ok, providerCheck.detail);
  addCheck("executor_signer_not_integrated", executorIntegration.ok, executorIntegration.note);
  addCheck("executor_submit_disarmed", executorSubmitDisarmed.ok, executorSubmitDisarmed.detail);
  addCheck("no_duplicate_executor", !singletonCheck.duplicateLoop, singletonCheck.executorSingletonLock);
  addCheck("live_positions_empty", livePositions.ok, String(livePositions.openCount));
  addCheck("no_session_proof_completed", sessionTrades.ok, String(sessionTrades.count));
  addCheck("no_non_test_secret_patterns", nonTestSecretFindings.length === 0, String(nonTestSecretFindings.length));
  addCheck("analysis_output_clean", analysisSecretCheck.ok, analysisSecretCheck.suspicious?.join(", ") || "ok");
  addCheck("operator_name_valid", operatorNameOk, caps?.approvedBy || "missing");
  addCheck("approval_text_present", approvalTextOk, approvalTextOk ? "R43B text matched" : "invalid");
  addCheck("r7_not_enough_data", r7Verdict === "NOT ENOUGH DATA", r7Verdict);
  addCheck("live_trading_not_approved", true, "full live trading NOT APPROVED");

  const failed = checks.filter((check) => !check.ok);

  return {
    timestamp: new Date().toISOString(),
    review: "R43D-final-proof-preflight",
    schemaVersion: SCHEMA_VERSION,
    gateDocPresent,
    approved: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    strategyApproved: false,
    engineeringProofApproved: capsValidation.ok === true,
    proofScope: PROOF_SCOPE,
    humanPresent,
    r43dReviewVerdict: R43D_REVIEW_VERDICT,
    r43dVerdict: derived.r43dVerdict,
    forbiddenVerdicts: FORBIDDEN_VERDICTS,
    evaluation: {
      r43dVerdict: derived.r43dVerdict,
      r43dReviewVerdict: R43D_REVIEW_VERDICT,
      reason: derived.reason,
      approved: false,
      liveTradingApproved: false,
      proofScope: PROOF_SCOPE,
      blockers: derived.blockers,
      warnings: derived.warnings
    },
    blockers: derived.blockers,
    warnings: derived.warnings,
    gateStatus,
    postureStatus: posture.available ? {
      executionMode: posture.executionMode,
      dryRunMode: posture.dryRunMode,
      liveArmed: posture.liveArmed,
      liveSubmission: posture.liveSubmission || "DISARMED",
      emergencyStop: posture.emergencyStop === true
    } : { available: false, status: posture.status },
    capsStatus: {
      r43bVerdict: capsValidation.ok ? r43b.VERDICTS.VALID : r43b.VERDICTS.INVALID,
      approved: caps?.approved === true,
      approvedBy: caps?.approvedBy || null,
      approvalScope: caps?.approvalScope || null,
      approvalTextPresent: approvalTextOk,
      maxTradeSizeSol: caps?.maxTradeSizeSol,
      maxDailyLossSol: caps?.maxDailyLossSol,
      maxTradesPerSession: caps?.maxTradesPerSession,
      maxOpenLivePositions: caps?.maxOpenLivePositions,
      autoCompoundingAllowed: caps?.autoCompoundingAllowed,
      requireHumanPresent: caps?.requireHumanPresent,
      stopAfterFirstTransaction: caps?.stopAfterFirstTransaction
    },
    rpcStatus: {
      status: rpcStatus,
      source: rpcSetup.source || null,
      redactedUrl: rpcSetup.redactedUrl || rpcSetup.safeMetadata?.redactedUrl || "[REDACTED]",
      dedicatedCandidate: rpcStatus === rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE
    },
    signerStatus: {
      r43cVerdict: r43cStatus.r43cVerdict,
      localRealBlockedByDefault: providerCheck.ok === true,
      executorIntegrated: executorIntegration.integrated === true,
      localSecretSource,
      providerRegistry: provider.describeProviderAvailability()
    },
    executorStatus: {
      singletonLock: singletonCheck.executorSingletonLock,
      duplicateLoop: singletonCheck.duplicateLoop === true,
      submitDisarmed: executorSubmitDisarmed.ok === true
    },
    tradingState: {
      livePositionsOpen: livePositions.openCount,
      sessionNonDryRunTrades: sessionTrades.count,
      recoveryPresent
    },
    secretSafety: {
      nonTestFindingCount: nonTestSecretFindings.length,
      analysisOutputClean: analysisSecretCheck.ok === true
    },
    operatorAcknowledgement: {
      operatorName: caps?.approvedBy || null,
      operatorNameRequired: REQUIRED_OPERATOR_NAME,
      approvalTextPresent: approvalTextOk,
      r7Verdict,
      engineeringProofOnly: true,
      strategyApproved: false,
      liveTradingApproved: false
    },
    r7Verdict,
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
    throw new Error("R43D output must stay under analysis/");
  }
}

function writeStatus(status, outputDir = OUTPUT_DIR) {
  const outputFile = path.join(outputDir, path.basename(OUTPUT_FILE));
  assertAnalysisWritePath(outputFile, outputDir);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runR43dFinalProofPreflight(options = {}) {
  const analysisDir = options.outputDir || OUTPUT_DIR;
  const status = collectR43dFinalProofPreflight(options);
  const outputFile = writeStatus(status, analysisDir);
  return { ...status, outputFile };
}

function printSummary(status) {
  console.log("[r43d-proof-preflight] R43D Final Proof Preflight (read-only)");
  console.log(`  verdict: ${status.r43dVerdict}`);
  console.log(`  review: ${status.r43dReviewVerdict}`);
  console.log(`  humanPresent: ${status.humanPresent}`);
  console.log(`  proofScope: ${status.proofScope}`);
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
  console.log(`  posture: ${status.postureStatus?.executionMode || "unknown"} / dryRun=${status.postureStatus?.dryRunMode} / liveArmed=${status.postureStatus?.liveArmed}`);
  console.log(`  rpcStatus: ${status.rpcStatus?.status}`);
  console.log(`  r43cVerdict: ${status.signerStatus?.r43cVerdict}`);
  console.log(`  live trading approved: ${status.liveTradingApproved}`);
  console.log(`  output: ${status.outputFile}`);
}

if (require.main === module) {
  const cli = parseCliArgs();
  const status = runR43dFinalProofPreflight({ cli });
  printSummary(status);
}

module.exports = {
  ROOT,
  RUNTIME_ROOT,
  OUTPUT_DIR,
  OUTPUT_FILE,
  GATE_DOC,
  PROOF_SCOPE,
  REQUIRED_OPERATOR_NAME,
  VERDICTS,
  FORBIDDEN_VERDICTS,
  R43D_REVIEW_VERDICT,
  parseCliArgs,
  checkGitStatus,
  checkLocalRpcConfigGitignored,
  classifyLocalSignerSecretPresence,
  collectR43dFinalProofPreflight,
  writeStatus,
  runR43dFinalProofPreflight,
  printSummary
};
