"use strict";

// r43a_pre_approval_readiness.js — R43A read-only final pre-approval readiness review.
// Writes analysis/ only. Does NOT approve caps, enable live trading, or handle secrets.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const review = require("./r7_strategy_review");
const capsModule = require("./micro_live_caps");
const guardrails = require("./micro_live_guardrails");
const rpcConfig = require("./micro_live_rpc_config");
const rpcPreflight = require("./micro_live_rpc_preflight");
const r42 = require("./r42_final_micro_live_review");
const signerPreflight = require("./signer_plan_preflight");
const secretScan = require("./secret_safety_scan");
const livePositionsStore = require("./live_positions_store");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R43A_OUTPUT_DIR
  ? path.resolve(process.env.R43A_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r43a_pre_approval_readiness.json");
const GATE_DOC = "docs/R43A_FINAL_PRE_APPROVAL_READINESS_REVIEW.md";
const OPERATOR_CAPS = "operator_records/micro_live_demo_caps.json";

const SCHEMA_VERSION = 1;
const R43A_VERDICT = "R43A PRE-APPROVAL READINESS — NOT LIVE EXECUTION APPROVAL";

const VERDICTS = Object.freeze({
  NOT_READY: "NOT_READY_FOR_OPERATOR_APPROVAL",
  READY_CAPS: "READY_FOR_OPERATOR_CAPS_APPROVAL",
  READY_PROOF: "READY_FOR_FINAL_MICRO_LIVE_PROOF_REVIEW"
});

const FORBIDDEN_VERDICTS = Object.freeze([
  "READY FOR LIVE TRADING",
  "LIVE APPROVED",
  "MICRO_LIVE_APPROVED"
]);

const OPERATOR_APPROVAL_LANGUAGE =
  "I approve a one-transaction micro-live engineering proof only. "
  + "This is not strategy-profit validation, not full live trading approval, "
  + "and not approval for repeated trading. Maximum trade size is 0.01 SOL. "
  + "Maximum daily loss is 0.05 SOL. I will be present during execution. "
  + "Stop after the first transaction.";

const REMAINING_STEPS_AFTER_R43A = Object.freeze([
  "R43B — operator caps approval file (human approval record; caps approved:true only after explicit operator action)",
  "R43C — real local signer implementation under guardrails (outside stub phase)",
  "R43D — final proof preflight (read-only gate before one transaction)",
  "R43E — one tiny controlled transaction proof (engineering proof only)",
  "R43F — post-transaction audit review"
]);

const STOP_CONDITIONS = Object.freeze([
  "RPC status is not DEDICATED_CANDIDATE",
  "operator caps missing or not conservative",
  "safety suite fails (when verified)",
  "recovery_actions.jsonl exists",
  "duplicate executor loop active",
  "executor singleton lock malformed",
  "live_positions.json has open positions",
  "wallet balance exceeds approved demo cap (future proof gate)",
  "local signer secret handling not approved for real signing",
  "secret scan shows non-test patterns in repo",
  "live_executor signer integration before approval",
  "git working tree has unexpected dirty tracked files",
  "operator not present during proof window"
]);

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

function isSafePreApprovalPosture(posture) {
  return (
    posture.available === true &&
    posture.executionMode === "PIPELINE_DRY_RUN" &&
    posture.dryRunMode === true &&
    posture.liveArmed === false &&
    posture.emergencyStop !== true
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
      ok: true,
      dirtyFiles: [],
      note: "git status unavailable — not blocking R43A"
    };
  }

  const lines = (result.stdout || "").split(/\r?\n/).filter(Boolean);
  return {
    available: true,
    clean: lines.length === 0,
    ok: lines.length === 0,
    dirtyFiles: lines,
    note: lines.length === 0 ? "working tree clean" : `${lines.length} dirty path(s)`
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

function summarizeEvidence(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;

  const rpcSetup = options.rpcSetupSummary !== undefined
    ? options.rpcSetupSummary
    : rpcConfig.loadMicroLiveRpcConfig({ repoRoot, runtimeRoot, ...options });

  const rpcReadiness = options.rpcReadinessSummary !== undefined
    ? options.rpcReadinessSummary
    : rpcPreflight.collectR41cRpcSignerReadiness({
      repoRoot,
      runtimeRoot,
      analysisDir,
      writeOutput: false,
      print: false,
      runSecretScan: options.runSecretScan,
      secretScanFindings: options.secretScanFindings,
      ...options
    });

  const guardStatus = options.guardStatusSummary !== undefined
    ? options.guardStatusSummary
    : guardrails.collectMicroLiveGuardrailsCheck({
      repoRoot,
      runtimeRoot,
      analysisDir,
      writeOutput: false,
      print: false,
      safetySuiteGreen: options.safetySuiteGreen
    });

  const r42Status = options.r42StatusSummary !== undefined
    ? options.r42StatusSummary
    : r42.collectR42FinalMicroLiveReview({
      repoRoot,
      runtimeRoot,
      analysisDir,
      writeOutput: false,
      print: false,
      ...options
    });

  const signerPlan = options.signerPlanSummary !== undefined
    ? options.signerPlanSummary
    : signerPreflight.collectSignerPlanPreflight({
      repoRoot,
      runtimeRoot,
      analysisDir,
      runSecretScan: false,
      secretScanFindings: options.secretScanFindings || [],
      ...options
    });

  let secretSummary;
  if (options.secretScanSummary !== undefined) {
    secretSummary = options.secretScanSummary;
  } else if (options.runSecretScan === false) {
    secretSummary = { nonTestFindingCount: 0, findings: [] };
  } else {
    const scan = secretScan.scanRepo(repoRoot, options.scanOptions);
    secretSummary = {
      nonTestFindingCount: signerPreflight.filterNonTestSecretFindings(scan.findings).length,
      findings: signerPreflight.filterNonTestSecretFindings(scan.findings).map((finding) => ({
        file: finding.file,
        patternId: finding.patternId,
        line: finding.line,
        redactedSnippet: finding.redactedSnippet
      }))
    };
  }

  return {
    microLiveRpcConfig: {
      status: rpcSetup.status,
      source: rpcSetup.source,
      redactedUrl: rpcSetup.redactedUrl,
      dedicatedCandidate: rpcSetup.dedicatedCandidate === true
    },
    microLiveRpcPreflight: {
      readinessVerdict: rpcReadiness.readinessVerdict,
      failedChecks: rpcReadiness.failedChecks
    },
    microLiveGuardrails: {
      guardrailVerdict: guardStatus.guardrailVerdict,
      approved: guardStatus.approved === true
    },
    r42FinalMicroLiveReview: {
      r42Verdict: r42Status.r42Verdict,
      approved: r42Status.approved === true
    },
    signerPlanPreflight: {
      preflightVerdict: signerPlan.preflightVerdict,
      r41Verdict: signerPlan.r41Verdict
    },
    secretSafetyScan: secretSummary,
    liveExecutorStatus: {
      note: "posture read from live_config.json; live_executor --status not spawned in R43A",
      executionMode: options.posture?.executionMode,
      dryRunMode: options.posture?.dryRunMode,
      liveArmed: options.posture?.liveArmed,
      liveSubmission: "DISARMED"
    },
    runSafetyTests: {
      verified: options.safetySuiteGreen === true,
      note: options.safetySuiteGreen === true
        ? "safety suite confirmed green by caller"
        : "not executed inside R43A — operator must confirm node run_safety_tests.js"
    },
    gitStatus: options.gitStatusCheck || { note: "see gitStatus field" }
  };
}

function buildGateStatusTable(context) {
  return {
    dedicatedRpcConfiguredLocally: context.rpcStatus === rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE,
    rpcClassifiedDedicatedCandidate: context.rpcStatus === rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE,
    rpcSecretsNotCommitted: context.committedRpcSecrets.ok === true,
    capsFilePresent: context.capsLoad.status === "present",
    capsApprovedFalse: context.capsLoad.status === "present" && context.capsLoad.data?.approved !== true,
    capsConservative: context.capsConservativeOk === true,
    localSignerStubOnly: context.localSignerStub.ok === true,
    realSignerAbsent: context.localSignerStub.stubOnly === true,
    executorSignerIntegrationAbsent: context.executorIntegration.ok === true,
    recoveryActionsAbsent: !context.recoveryPresent,
    safetySuiteGreen: context.safetySuiteGreen === true
      ? true
      : (context.safetySuiteGreen === false ? false : "not_verified_in_checker"),
    liveArmedFalse: context.posture.liveArmed !== true,
    dryRunModeTrue: context.posture.dryRunMode === true,
    executionModePipelineDryRun: context.posture.executionMode === "PIPELINE_DRY_RUN",
    r7EdgeNotEnoughData: context.r7Verdict === "NOT ENOUGH DATA",
    fullLiveTradingNotApproved: true
  };
}

function deriveR43aVerdict(context) {
  const blockers = [];

  if (!context.postureSafe) blockers.push("unsafe runtime posture");
  if (context.recoveryPresent) blockers.push("recovery_actions.jsonl present");
  if (context.rpcStatus !== rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE) {
    blockers.push(`RPC status is ${context.rpcStatus}`);
  }
  if (!context.committedRpcSecrets.ok) blockers.push("RPC secrets may be committed");
  if (context.capsLoad.status !== "present") blockers.push("operator caps file missing");
  if (context.capsLoad.status === "corrupt") blockers.push("operator caps file corrupt");
  if (!context.capsConservativeOk) blockers.push("operator caps not conservative");
  if (!context.localSignerStub.ok) blockers.push("local signer stub not ready");
  if (context.executorIntegration.integrated) blockers.push("live_executor signer integration present");
  if (context.nonTestSecretFindings.length > 0) blockers.push("non-test secret patterns found");
  if (!context.livePositions.ok) blockers.push("live_positions.json not empty/valid");
  if (context.singletonCheck.duplicateLoop) blockers.push("duplicate executor loop active");
  if (context.singletonCheck.malformed) blockers.push("executor singleton lock malformed");
  if (context.gitStatus.available && !context.gitStatus.clean) blockers.push("git working tree dirty");
  if (context.safetySuiteGreen === false) blockers.push("safety suite failed");

  if (blockers.length > 0) {
    return {
      r43aVerdict: VERDICTS.NOT_READY,
      reason: blockers.join("; ")
    };
  }

  if (context.capsApproved) {
    return {
      r43aVerdict: VERDICTS.READY_PROOF,
      reason: "Pre-approval gates satisfied with operator caps approved — ready for final micro-live proof review; live trading still NOT APPROVED"
    };
  }

  return {
    r43aVerdict: VERDICTS.READY_CAPS,
    reason: "Pre-approval gates satisfied — ready for operator caps approval (R43B); not live execution"
  };
}

function collectR43aPreApprovalReadiness(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;

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
    : isSafePreApprovalPosture(posture);

  const rpcSetup = options.rpcSetupSummary !== undefined
    ? options.rpcSetupSummary
    : rpcConfig.loadMicroLiveRpcConfig({ repoRoot, runtimeRoot, ...options });

  const rpcStatus = options.rpcStatus !== undefined ? options.rpcStatus : rpcSetup.status;

  const capsFile = options.capsFile || path.join(repoRoot, OPERATOR_CAPS);
  const capsLoad = options.capsLoad !== undefined
    ? options.capsLoad
    : capsModule.loadCapsFile(capsFile);
  const capsSummary = options.capsSummary !== undefined
    ? options.capsSummary
    : capsModule.summarizeCapsLoad(capsLoad);
  const capsConservativeOk = capsSummary.conservativeOk === true;
  const capsApproved = capsLoad.status === "present" && capsLoad.data?.approved === true;

  const localSignerStub = options.localSignerStubCheck !== undefined
    ? options.localSignerStubCheck
    : rpcPreflight.checkLocalSignerStubOnly(repoRoot, options);

  const executorIntegration = options.executorIntegrationCheck !== undefined
    ? options.executorIntegrationCheck
    : r42.checkExecutorIntegration(repoRoot);

  const committedRpcSecrets = options.committedRpcSecretsCheck !== undefined
    ? options.committedRpcSecretsCheck
    : rpcPreflight.checkCommittedRpcSecrets(repoRoot, options);

  const singletonCheck = options.singletonCheck !== undefined
    ? options.singletonCheck
    : guardrails.checkSingletonLock(runtimeRoot);

  const livePositions = checkLivePositions(runtimeRoot, options);
  const gitStatus = checkGitStatus(repoRoot, options);

  let nonTestSecretFindings;
  if (options.secretScanFindings !== undefined) {
    nonTestSecretFindings = options.secretScanFindings;
  } else if (options.runSecretScan === false) {
    nonTestSecretFindings = [];
  } else {
    const scan = secretScan.scanRepo(repoRoot, options.scanOptions);
    nonTestSecretFindings = signerPreflight.filterNonTestSecretFindings(scan.findings);
  }

  const r7MetricsFile = path.join(analysisDir, "r7_strategy_metrics.json");
  let r7Verdict = options.r7Verdict;
  if (!r7Verdict && fs.existsSync(r7MetricsFile)) {
    try {
      r7Verdict = JSON.parse(fs.readFileSync(r7MetricsFile, "utf8"))?.recommendation?.verdict;
    } catch {
      r7Verdict = "NOT ENOUGH DATA";
    }
  }
  r7Verdict = r7Verdict || "NOT ENOUGH DATA";

  const context = {
    posture,
    postureSafe,
    recoveryPresent,
    rpcStatus,
    committedRpcSecrets,
    capsLoad,
    capsConservativeOk,
    capsApproved,
    localSignerStub,
    executorIntegration,
    nonTestSecretFindings,
    livePositions,
    singletonCheck,
    gitStatus,
    safetySuiteGreen: options.safetySuiteGreen,
    r7Verdict
  };

  const derived = deriveR43aVerdict(context);
  const gateStatus = buildGateStatusTable(context);
  const evidenceReviewed = summarizeEvidence({
    ...options,
    repoRoot,
    runtimeRoot,
    analysisDir,
    posture,
    gitStatusCheck: gitStatus
  });

  const checks = [];
  const addCheck = (id, ok, detail) => checks.push({ id, ok: ok === true, detail });

  addCheck("gate_doc_present", gateDocPresent, GATE_DOC);
  addCheck("recovery_absent", !recoveryPresent, "recovery_actions.jsonl absent");
  addCheck("posture_safe", postureSafe, "PIPELINE_DRY_RUN / dryRunMode true / liveArmed false");
  addCheck("rpc_dedicated_candidate", rpcStatus === rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE, rpcStatus);
  addCheck("rpc_secrets_not_committed", committedRpcSecrets.ok, `${committedRpcSecrets.findings?.length || 0} finding(s)`);
  addCheck("caps_file_present", capsLoad.status === "present", capsLoad.status);
  addCheck("caps_conservative", capsConservativeOk, capsSummary.conservativeOk
    ? "conservative limits satisfied"
    : (capsSummary.conservativeErrors || capsSummary.errors || []).join("; ") || "not conservative");
  addCheck("local_signer_stub_only", localSignerStub.ok, localSignerStub.note);
  addCheck("executor_signer_not_integrated", executorIntegration.ok, executorIntegration.note);
  addCheck("no_non_test_secret_patterns", nonTestSecretFindings.length === 0, `${nonTestSecretFindings.length} finding(s)`);
  addCheck("live_positions_empty", livePositions.ok, String(livePositions.openCount));
  addCheck("no_duplicate_executor", !singletonCheck.duplicateLoop, singletonCheck.executorSingletonLock);
  addCheck("git_clean_or_unverified", gitStatus.ok !== false, gitStatus.note);
  addCheck("live_trading_not_approved", true, "live trading NOT APPROVED");

  const failed = checks.filter((check) => !check.ok);

  return {
    timestamp: new Date().toISOString(),
    review: "R43A-pre-approval-readiness",
    schemaVersion: SCHEMA_VERSION,
    gateDocPresent,
    approved: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    microLiveProofApproved: false,
    privateKeysHandled: false,
    r43aReviewVerdict: R43A_VERDICT,
    r43aVerdict: derived.r43aVerdict,
    forbiddenVerdicts: FORBIDDEN_VERDICTS,
    evaluation: {
      r43aVerdict: derived.r43aVerdict,
      r43aReviewVerdict: R43A_VERDICT,
      reason: derived.reason,
      approved: false,
      liveTradingApproved: false,
      scope: "pre-approval readiness only — not live execution approval"
    },
    executiveVerdict: {
      r43aVerdict: derived.r43aVerdict,
      reason: derived.reason,
      readyForOperatorCapsApproval: derived.r43aVerdict === VERDICTS.READY_CAPS,
      readyForFinalMicroLiveProofReview: derived.r43aVerdict === VERDICTS.READY_PROOF,
      liveTradingApproved: false
    },
    evidenceReviewed,
    gateStatus,
    postureSummary: posture.available ? {
      executionMode: posture.executionMode,
      dryRunMode: posture.dryRunMode,
      liveArmed: posture.liveArmed,
      emergencyStop: posture.emergencyStop,
      liveSubmission: "DISARMED",
      safeForPreApproval: postureSafe
    } : { available: false, status: posture.status },
    rpcSummary: {
      status: rpcStatus,
      source: rpcSetup.source,
      redactedUrl: rpcSetup.redactedUrl,
      dedicatedCandidate: rpcStatus === rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE
    },
    capsSummary: {
      file: capsFile,
      loadStatus: capsLoad.status,
      approved: capsApproved,
      conservativeOk: capsConservativeOk
    },
    signerSummary: {
      localSignerStubOnly: localSignerStub.stubOnly === true,
      executorSignerIntegrated: executorIntegration.integrated === true,
      realSigningImplemented: false
    },
    gitStatus,
    safetySuite: {
      verified: options.safetySuiteGreen === true,
      green: options.safetySuiteGreen === true,
      note: options.safetySuiteGreen === true
        ? "confirmed green"
        : "confirm with node run_safety_tests.js before R43B"
    },
    operatorApprovalLanguage: OPERATOR_APPROVAL_LANGUAGE,
    operatorApprovalActivated: false,
    remainingStepsAfterR43A: [...REMAINING_STEPS_AFTER_R43A],
    stopConditions: [...STOP_CONDITIONS],
    checks,
    failedChecks: failed.map((check) => check.id),
    blockers: derived.r43aVerdict === VERDICTS.NOT_READY ? [derived.reason] : [],
    recommendedNextStep: derived.r43aVerdict === VERDICTS.READY_CAPS
      ? "R43B — operator caps approval file"
      : derived.r43aVerdict === VERDICTS.READY_PROOF
        ? "R43D — final proof preflight"
        : "resolve blockers and re-run R43A"
  };
}

function assertAnalysisWritePath(outputFile, analysisDir) {
  const resolvedOutput = path.resolve(outputFile);
  const resolvedAnalysis = path.resolve(analysisDir);
  const prefix = resolvedAnalysis.endsWith(path.sep)
    ? resolvedAnalysis
    : `${resolvedAnalysis}${path.sep}`;
  if (!resolvedOutput.startsWith(prefix)) {
    throw new Error("R43A output must stay under analysis/");
  }
}

function writeReview(status, outputFile = OUTPUT_FILE, analysisDir = OUTPUT_DIR) {
  assertAnalysisWritePath(outputFile, analysisDir);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[r43a-review] Final Pre-Approval Readiness Review (read-only)");
  console.log(`  verdict: ${status.r43aVerdict}`);
  console.log(`  rpc status: ${status.rpcSummary.status}`);
  console.log(`  caps approved: ${status.capsSummary?.approved === true}`);
  console.log(`  live trading approved: false`);
  console.log(`  failed checks: ${status.failedChecks.length}`);
}

function runR43aPreApprovalReadiness(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const outputFile = options.outputFile || path.join(analysisDir, "r43a_pre_approval_readiness.json");
  const status = collectR43aPreApprovalReadiness({
    ...options,
    analysisDir
  });

  if (options.writeOutput !== false) {
    writeReview(status, outputFile, analysisDir);
  }

  if (options.print !== false) {
    printSummary(status);
  }

  return { status, outputFile: options.writeOutput !== false ? outputFile : null };
}

if (require.main === module) {
  try {
    const result = runR43aPreApprovalReadiness();
    if (result.outputFile) console.log(`  output: ${result.outputFile}`);
  } catch (err) {
    console.error("[r43a-review] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOC,
  OUTPUT_FILE,
  OPERATOR_CAPS,
  SCHEMA_VERSION,
  R43A_VERDICT,
  VERDICTS,
  FORBIDDEN_VERDICTS,
  OPERATOR_APPROVAL_LANGUAGE,
  REMAINING_STEPS_AFTER_R43A,
  STOP_CONDITIONS,
  readPosture,
  isSafePreApprovalPosture,
  checkGitStatus,
  checkLivePositions,
  summarizeEvidence,
  buildGateStatusTable,
  deriveR43aVerdict,
  collectR43aPreApprovalReadiness,
  runR43aPreApprovalReadiness
};
