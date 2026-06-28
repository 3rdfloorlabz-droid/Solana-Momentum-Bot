"use strict";

// r12_micro_live_readiness_check.js — Sprint 4 R12
// Read-only micro-live readiness checklist status. Writes analysis/ only.
// Does NOT approve micro-live, connect wallets, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const r7b = require("./r7b_daily_summary");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R12_OUTPUT_DIR
  ? path.resolve(process.env.R12_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r12_micro_live_readiness_status.json");

const R7B_THRESHOLDS = r7b.R7B_THRESHOLDS;

const DOC_PATHS = {
  r8: "docs/R8_RISK_CONTROLS_REVIEW.md",
  r9: "docs/R9_WALLET_SIGNER_SECURITY_REVIEW.md",
  r10: "docs/R10_LIVE_EXECUTION_PATH_REVIEW.md",
  r11: "docs/R11_EMERGENCY_STOP_VALIDATION.md",
  r12: "docs/R12_MICRO_LIVE_READINESS_CHECKLIST.md",
  r13: "docs/R13_FINAL_MICRO_LIVE_APPROVAL_GATE.md",
  r14: "docs/R14_SLIPPAGE_MEV_PROTECTION_REVIEW.md"
};

const OPERATOR_WALLET_NOTE = {
  note: "Operator-reported context only — NOT authorization",
  solInWallet: 1,
  walletBalanceIsOperationalLiquidity: true,
  fullWalletBalanceNotAuthorized: true
};

const PROPOSED_R8_LIMITS = {
  note: "Proposed draft limits only — NOT active in live_config.json",
  maxAuthorizedSessionAllocationSol: 0.05,
  maxFirstTradeSizeSol: { min: 0.005, max: 0.01 },
  maxOpenPositions: 1,
  maxTradesFirstSession: 1,
  maxTradesPerDayAfterReview: 3,
  maxSessionDrawdownSol: 0.03,
  stopAfterConsecutiveLosses: 2,
  autoCompounding: false,
  scaling: false,
  averagingDown: false,
  unattendedSession: false
};

const PROPOSED_R14_LIMITS = {
  note: "Proposed draft limits only — NOT active in live_config.json",
  defaultSlippageCapBps: 100,
  manualHighVolatilityExceptionBps: 200,
  hardRejectSlippageBps: 300,
  realizedSlippageWarningBps: 100,
  realizedSlippageHaltBps: 200,
  quoteMaxAgeSeconds: 10
};

function readJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return { status: "missing", data: null };
  try {
    return { status: "present", data: JSON.parse(fs.readFileSync(filePath, "utf8")) };
  } catch (err) {
    return {
      status: "corrupt",
      data: null,
      error: err && err.message ? err.message : String(err)
    };
  }
}

function docExists(repoRoot, relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function readGateDocs(repoRoot) {
  const docs = {};
  for (const [key, rel] of Object.entries(DOC_PATHS)) {
    docs[key] = docExists(repoRoot, rel);
  }
  return docs;
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
    walletPublicAddress: data.walletPublicAddress || null
  };
}

function isSafeObservationPosture(posture) {
  return (
    posture.executionMode === "PIPELINE_DRY_RUN" &&
    posture.dryRunMode === true &&
    posture.liveArmed === false &&
    posture.emergencyStop !== true
  );
}

function buildChecklistItems(context) {
  const items = [];
  const add = (category, requirement, currentStatus, blocking, evidence, notes = "") => {
    items.push({ category, requirement, currentStatus, blocking, evidence, notes });
  };

  add("R6a", "24h dry-run soak PASS", context.r6aPass ? "PASS" : "UNKNOWN", !context.r6aPass, "soak_runs/r6a_24h_soak_summary.json");
  add("R7", "Fresh edge evidence sufficient", context.r7Verdict, context.r7Verdict === "NOT ENOUGH DATA", "analysis/r7_strategy_metrics.json");
  add("R7b", "≥30 fresh closed paper trades", String(context.r7bProgress?.exitCounts?.closedTrades ?? "unknown"), !(context.r7bChecks?.closedTrades === true), "r7b_daily_summary", `threshold ${R7B_THRESHOLDS.minClosedTrades}`);
  add("R7b", "≥7 active-market days", String(context.r7bProgress?.activeMarketDays ?? "unknown"), !(context.r7bChecks?.activeMarketDays === true), "r7b_daily_summary", `threshold ${R7B_THRESHOLDS.minActiveMarketDays}`);
  add("R7b", "≥10 thesis matches", String(context.r7bProgress?.thesisInWindow?.thesisMatchTrue ?? "unknown"), !(context.r7bChecks?.thesisMatched === true), "r7b_daily_summary");
  add("R7b", "Exit mix minimums met", context.r7bExitMixReady ? "MET" : "NOT MET", !context.r7bExitMixReady, "r7b_daily_summary");
  add("R7b", "Fresh profit factor ≥ 1.20", String(context.r7bProgress?.paperPerformance?.profitFactor ?? "unknown"), !(context.r7bChecks?.profitFactor === true), "r7b_daily_summary");
  add("Safety", "Safety suite green", context.safetySuiteGreen ? "GREEN" : "UNKNOWN/BLOCKED", !context.safetySuiteGreen, "run_safety_tests.js");
  add("Safety", "recovery_actions.jsonl absent", context.recoveryAbsent ? "ABSENT" : "PRESENT", !context.recoveryAbsent, "runtime root");
  add("Safety", "State integrity OK", context.stateIntegrityOk ? "OK" : "FAIL", !context.stateIntegrityOk, "core JSON files");
  add("Posture", "PIPELINE_DRY_RUN observing", context.posture.executionMode, !isSafeObservationPosture(context.posture), "live_config.json");
  add("Posture", "dryRunMode true (current phase)", String(context.posture.dryRunMode), context.posture.dryRunMode !== true, "live_config.json", "Required now until approved arming");
  add("Posture", "liveArmed false (current phase)", String(context.posture.liveArmed), context.posture.liveArmed === true, "live_config.json", "Must remain false until explicit approval");
  add("Posture", "liveSubmission DISARMED", context.liveSubmissionDisarmed ? "DISARMED" : "UNKNOWN", !context.liveSubmissionDisarmed, "live_executor.js --status");
  add("R8", "Risk controls defined", "DEFINED NOT ARMED", false, DOC_PATHS.r8);
  add("R9", "Wallet security design", "DEFINED NOT CONNECTED", false, DOC_PATHS.r9);
  add("R9", "Real wallet connected", context.walletConnected ? "YES" : "NO", context.walletConnected === true, "runtime/config", "Must not connect before final approval");
  add("R10", "Live execution path defined", "FAKE HARNESS ONLY", false, DOC_PATHS.r10);
  add("R11", "Emergency stop validated", "SIMULATION ONLY", false, DOC_PATHS.r11, "Live drill not performed");
  add("R13", "Final approval gate defined", context.gateDocs.r13 ? "DEFINED BLOCKED" : "MISSING", !context.gateDocs.r13, DOC_PATHS.r13);
  add("R13", "Final approval granted", context.r13FinalApprovalGranted ? "YES" : "NO", !context.r13FinalApprovalGranted, "operator record", "Required before arming");
  add("R14", "Slippage/MEV review defined", context.gateDocs.r14 ? "DEFINED NOT IMPLEMENTED" : "MISSING", !context.gateDocs.r14, DOC_PATHS.r14);
  add("R14", "Slippage/MEV active gate", context.slippageMevActiveGate ? "IMPLEMENTED" : "NOT IMPLEMENTED", !context.slippageMevActiveGate, DOC_PATHS.r14, "Design only today");
  add("Approval", "Explicit human approval", context.explicitHumanApproval ? "GIVEN" : "NOT GIVEN", !context.explicitHumanApproval, "operator record");
  add("Approval", "Final signed approval record", context.finalSignedApproval ? "YES" : "NO", !context.finalSignedApproval, "R13 §4");
  add("Config", "Micro-live config created", context.microLiveConfigCreated ? "YES" : "NO", !context.microLiveConfigCreated, "future config");
  add("Wallet", "1 SOL liquidity ≠ authorized risk", "CONTEXT ONLY", true, "operator", "Proposed cap 0.05 SOL");
  add("Runbook", "Live session runbook executed", context.runbookExecuted ? "YES" : "NO", !context.runbookExecuted, DOC_PATHS.r12);

  return items;
}

function collectHardBlockers(context) {
  const blockers = [];
  if (!context.r7bReady) blockers.push("R7b thresholds not met");
  if (context.r7Verdict === "NOT ENOUGH DATA") blockers.push("R7 fresh edge not proven");
  if (!context.walletConnectedApprovedPath) {
    blockers.push("real wallet not connected through approved bot path");
  }
  if (!context.signerImplemented) blockers.push("private key/signer not implemented");
  if (!context.liveExecutionApproved) blockers.push("live execution implementation not approved");
  blockers.push("emergency stop only validated in simulation");
  if (!context.r13FinalApprovalGranted) blockers.push("R13 final approval not granted");
  if (!context.microLiveConfigCreated) blockers.push("micro-live config not created");
  if (!context.explicitHumanApproval) blockers.push("explicit human approval not given");
  if (context.posture.liveArmed === false) blockers.push("liveArmed false");
  if (context.posture.dryRunMode === true) blockers.push("dryRunMode true");
  if (context.posture.executionMode !== "MICRO_LIVE") {
    blockers.push("executionMode not MICRO_LIVE");
  }
  if (!context.finalSignedApproval) blockers.push("no final signed approval record");
  if (!context.runbookExecuted) blockers.push("no live session runbook executed");
  if (!context.slippageMevActiveGate) {
    blockers.push("slippage/MEV policy not implemented as active gate");
  }
  blockers.push("1 SOL wallet liquidity is not authorized active risk");
  if (!context.gateDocs.r13) blockers.push("R13 final approval gate doc missing");
  if (!context.gateDocs.r14) blockers.push("R14 slippage/MEV review doc missing");
  if (!context.recoveryAbsent) blockers.push("recovery_actions.jsonl present");
  if (!context.stateIntegrityOk) blockers.push("state corruption detected");
  if (context.safetySuiteGreen === false) blockers.push("safety suite not green");
  return blockers;
}

function deriveGateStatus(context) {
  const postureMismatch =
    context.posture.executionMode === "PIPELINE_DRY_RUN" &&
    (context.posture.dryRunMode !== true || context.posture.liveArmed === true);

  if (
    postureMismatch ||
    context.posture.emergencyStop === true ||
    !context.recoveryAbsent ||
    !context.stateIntegrityOk ||
    context.safetySuiteGreen === false ||
    !context.gateDocs.r13 ||
    !context.gateDocs.r14
  ) {
    return {
      gateStatus: "BLOCKED",
      verdict: "CHECKLIST DEFINED BUT BLOCKED",
      reason: "Unsafe posture, missing gate docs, or safety signal — micro-live must remain blocked."
    };
  }
  if (context.readyForFinalApprovalReview === true) {
    return {
      gateStatus: "REVIEWABLE_ONLY",
      verdict: "CHECKLIST DEFINED BUT BLOCKED",
      reason: "Checklist prerequisites met for R13 final approval review — micro-live still NOT approved."
    };
  }
  return {
    gateStatus: "CHECKLIST_DEFINED_BUT_BLOCKED",
    verdict: "CHECKLIST DEFINED BUT BLOCKED",
    reason: "Micro-live readiness checklist documented; blockers remain — micro-live NOT approved."
  };
}

function collectR12MicroLiveReadinessStatus(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;

  const posture = readPosture(runtimeRoot);
  const recoveryActionsJsonl = {
    exists: fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"))
  };
  const recoveryAbsent = !recoveryActionsJsonl.exists;

  const gateDocs = options.gateDocs || readGateDocs(repoRoot);

  const soakSummary = readJsonIfPresent(path.join(repoRoot, "soak_runs", "r6a_24h_soak_summary.json"));
  const r6aPass = options.r6aPass === true || soakSummary.data?.overallVerdict === "PASS";

  const r7Metrics = readJsonIfPresent(path.join(analysisDir, "r7_strategy_metrics.json"));
  const r7Verdict = options.r7Verdict || r7Metrics.data?.recommendation?.verdict || "NOT ENOUGH DATA";

  let r7bSummary = options.r7bSummary || null;
  if (!r7bSummary) {
    const r7bFile = readJsonIfPresent(path.join(analysisDir, "r7b_daily_summary.json"));
    r7bSummary = r7bFile.data;
    if (!r7bSummary && options.collectR7b !== false) {
      try {
        r7bSummary = r7b.collectR7bDailySummary({
          runtimeRoot,
          repoRoot
        });
      } catch {
        r7bSummary = null;
      }
    }
  }

  const r7bChecks = r7bSummary?.progress?.checks || {};
  const r7bReady = r7bSummary?.progress?.readyForR8 === true;
  const r7bExitMixReady = Boolean(
    r7bChecks.stopExits &&
    r7bChecks.targetOrProfitableExits &&
    r7bChecks.timeoutExits &&
    r7bChecks.thesisMatched
  );
  const r7bProgress = r7bSummary?.freshMetrics || null;

  const stateIntegrityOk = options.stateIntegrity
    ? options.stateIntegrity.ok === true
    : r7bProgress?.stateIntegrity?.ok !== false;

  const safetySuiteGreen = options.safetySuiteGreen !== undefined
    ? options.safetySuiteGreen === true
    : null;

  const walletConnected = options.walletConnected === true;
  const r7bBypassAcknowledged = options.r7bBypassAcknowledged === true;

  const context = {
    posture,
    recoveryAbsent,
    gateDocs,
    r6aPass,
    r7Verdict,
    r7bReady,
    r7bChecks,
    r7bExitMixReady,
    r7bProgress,
    stateIntegrityOk,
    safetySuiteGreen: safetySuiteGreen === true,
    safetySuiteKnown: safetySuiteGreen !== null,
    liveSubmissionDisarmed: posture.executionMode === "PIPELINE_DRY_RUN" && posture.dryRunMode === true,
    walletConnected: walletConnected === true,
    walletConnectedApprovedPath: options.walletConnectedApprovedPath === true,
    signerImplemented: options.signerImplemented === true,
    liveExecutionApproved: options.liveExecutionApproved === true,
    microLiveConfigCreated: options.microLiveConfigCreated === true,
    explicitHumanApproval: options.explicitHumanApproval === true,
    finalSignedApproval: options.finalSignedApproval === true,
    r13FinalApprovalGranted: options.r13FinalApprovalGranted === true,
    runbookExecuted: options.runbookExecuted === true,
    slippageMevActiveGate: options.slippageMevActiveGate === true,
    r7bBypassAcknowledged
  };

  context.readyForFinalApprovalReview =
    context.r6aPass === true &&
    (context.r7bReady === true || context.r7bBypassAcknowledged === true) &&
    context.r7Verdict !== "NOT ENOUGH DATA" &&
    context.recoveryAbsent === true &&
    context.stateIntegrityOk === true &&
    context.safetySuiteGreen === true &&
    isSafeObservationPosture(context.posture) &&
    context.walletConnected === false &&
    context.explicitHumanApproval === false &&
    context.microLiveConfigCreated === false &&
    context.gateDocs.r13 === true &&
    context.gateDocs.r14 === true;

  const checklist = buildChecklistItems(context);
  const hardBlockers = collectHardBlockers(context);
  const gate = deriveGateStatus(context);

  return {
    timestamp: new Date().toISOString(),
    review: "R12-micro-live-readiness",
    liveTradingApproved: false,
    microLiveApproved: false,
    capitalAtRiskUsd: 0,
    posture,
    recoveryActionsJsonl,
    priorGates: {
      r6a: r6aPass ? "PASS" : "UNKNOWN",
      r7Verdict,
      r7bReady,
      r7bStatus: r7bReady ? "THRESHOLDS MET" : "ACTIVE — THRESHOLDS NOT MET",
      r8: "RISK CONTROLS DEFINED BUT NOT ARMED",
      r9: "WALLET SECURITY DESIGN DEFINED BUT NOT CONNECTED",
      r10: "READY FOR SIGNER SIMULATION HARNESS",
      r11: "EMERGENCY STOP VALIDATED IN SIMULATION ONLY",
      r12: "CHECKLIST DEFINED BUT BLOCKED",
      r13: gateDocs.r13 ? "FINAL APPROVAL GATE DEFINED — BLOCKED" : "MISSING",
      r14: gateDocs.r14 ? "SLIPPAGE / MEV REVIEW DEFINED — NOT IMPLEMENTED" : "MISSING"
    },
    gateDocs,
    operatorWalletNote: OPERATOR_WALLET_NOTE,
    r7bThresholds: R7B_THRESHOLDS,
    proposedR8Limits: PROPOSED_R8_LIMITS,
    proposedR14Limits: PROPOSED_R14_LIMITS,
    r7bProgress: r7bSummary?.progress || { status: "missing" },
    checklist,
    hardBlockers,
    evaluation: {
      verdict: gate.verdict,
      gateStatus: gate.gateStatus,
      reason: gate.reason,
      approved: false
    },
    readyForFinalApprovalReview: context.readyForFinalApprovalReview === true,
    recommendedNextGate:
      "Continue R7b data collection where possible; use R13 only with explicit research-exception risk; use R14 before any real trade; build R15 Manual Approval Record / Session Runbook next; do not connect wallet; do not arm live"
  };
}

function printSummary(status) {
  console.log("[r12-readiness] Micro-Live Readiness Checklist (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  gate status: ${status.evaluation.gateStatus}`);
  console.log(`  micro-live approved: false`);
  console.log(`  live trading approved: false`);
  console.log(`  capital at risk: $0`);
  console.log(`  posture: mode=${status.posture.executionMode} dryRunMode=${status.posture.dryRunMode} liveArmed=${status.posture.liveArmed}`);
  console.log(`  R7b ready: ${status.priorGates.r7bReady === true}`);
  console.log(`  R13 doc: ${status.gateDocs.r13 === true ? "present" : "missing"}`);
  console.log(`  R14 doc: ${status.gateDocs.r14 === true ? "present" : "missing"}`);
  console.log(`  blockers: ${status.hardBlockers.length}`);
  console.log(`  recommended next gate: ${status.recommendedNextGate}`);
}

function writeStatus(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runR12MicroLiveReadinessCheck(options = {}) {
  const status = collectR12MicroLiveReadinessStatus(options);
  const outputFile = options.outputFile || OUTPUT_FILE;
  if (options.writeOutput !== false) {
    writeStatus(status, outputFile);
  }
  if (options.print !== false) {
    printSummary(status);
  }
  return { status, outputFile: options.writeOutput !== false ? outputFile : null };
}

if (require.main === module) {
  try {
    const result = runR12MicroLiveReadinessCheck();
    if (result.outputFile) {
      console.log(`  status: ${result.outputFile}`);
    }
  } catch (err) {
    console.error("[r12-readiness] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  R7B_THRESHOLDS,
  DOC_PATHS,
  OPERATOR_WALLET_NOTE,
  PROPOSED_R8_LIMITS,
  PROPOSED_R14_LIMITS,
  OUTPUT_FILE,
  readPosture,
  docExists,
  readGateDocs,
  isSafeObservationPosture,
  buildChecklistItems,
  collectHardBlockers,
  deriveGateStatus,
  collectR12MicroLiveReadinessStatus,
  runR12MicroLiveReadinessCheck,
  writeStatus
};
