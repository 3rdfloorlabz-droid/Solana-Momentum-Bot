"use strict";

// r13_micro_live_approval_check.js — Sprint 4 R13
// Read-only final micro-live approval gate status. Writes analysis/ only.
// Does NOT approve micro-live, connect wallets, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const r7b = require("./r7b_daily_summary");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R13_OUTPUT_DIR
  ? path.resolve(process.env.R13_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r13_micro_live_approval_status.json");

const OPERATOR_WALLET_NOTE = {
  note: "Operator-reported context only — NOT authorization",
  totalSolAvailable: 2,
  solInWallet: 1,
  walletBalanceIsOperationalLiquidity: true,
  authorizedRiskSmallerThanWalletBalance: true,
  fullWalletBalanceNotAuthorized: true
};

const PROPOSED_APPROVAL_TERMS = {
  note: "Proposed approval terms only — NOT active in live_config.json",
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
  unattendedSession: false,
  noAddingFundsDuringSession: true
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

function collectImplementationBlockers(context) {
  const blockers = [];
  if (!context.r12Complete) blockers.push("R12 checklist may be incomplete or blocked");
  if (!context.r7bReady) blockers.push("R7b thresholds not met");
  if (!context.r14Complete) blockers.push("R14 slippage/MEV review not complete for live path");
  blockers.push("R7 fresh edge NOT ENOUGH DATA — bypass is HIGH RISK");
  blockers.push("signer simulation is fake only");
  blockers.push("real signer not implemented");
  blockers.push("real wallet not connected through approved path");
  blockers.push("live execution implementation not approved");
  blockers.push("micro-live config not created");
  blockers.push("no final signed approval record");
  blockers.push("per-trade approval workflow not implemented unless separately approved");
  if (context.posture.liveArmed === false) blockers.push("liveArmed still false");
  if (context.posture.dryRunMode === true) blockers.push("dryRunMode still true");
  if (context.posture.executionMode !== "MICRO_LIVE") {
    blockers.push("executionMode not MICRO_LIVE (expected only after explicit approved arming)");
  }
  if (!context.r7bBypassAcknowledged) blockers.push("R7b bypass risk not explicitly acknowledged");
  if (!context.finalSignedApproval) blockers.push("no final signed approval record");
  if (!context.recoveryAbsent) blockers.push("recovery_actions.jsonl present");
  if (context.safetySuiteGreen === false) blockers.push("safety suite not green");
  if (!context.allocationWithinMicroLimit) blockers.push("proposed allocation exceeds micro limit");
  return blockers;
}

function deriveGateStatus(context) {
  if (
    context.posture.liveArmed === true ||
    context.posture.emergencyStop === true ||
    !context.recoveryAbsent ||
    context.safetySuiteGreen === false ||
    !context.allocationWithinMicroLimit
  ) {
    return {
      gateStatus: "BLOCKED",
      reason: "Unsafe posture, safety signal, or allocation cap violation — final approval remains blocked."
    };
  }
  if (
    context.r7bBypassAcknowledged === true &&
    context.r7bReady === false &&
    context.allocationWithinMicroLimit === true &&
    context.safetySuiteGreen === true &&
    isSafeObservationPosture(context.posture) &&
    context.finalSignedApproval === false
  ) {
    return {
      gateStatus: "REVIEWABLE ONLY",
      reason:
        "Operator may review final approval requirements with explicit R7b bypass acknowledgment — micro-live still NOT approved."
    };
  }
  return {
    gateStatus: "BLOCKED",
    reason: "Final approval gate defined; prerequisites and explicit human approval remain incomplete."
  };
}

function collectR13MicroLiveApprovalStatus(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;

  const posture = readPosture(runtimeRoot);
  const recoveryAbsent = !fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"));

  const r7Metrics = readJsonIfPresent(path.join(analysisDir, "r7_strategy_metrics.json"));
  const r7Verdict = options.r7Verdict || r7Metrics.data?.recommendation?.verdict || "NOT ENOUGH DATA";

  let r7bSummary = options.r7bSummary || null;
  if (!r7bSummary) {
    const r7bFile = readJsonIfPresent(path.join(analysisDir, "r7b_daily_summary.json"));
    r7bSummary = r7bFile.data;
  }
  const r7bReady = r7bSummary?.progress?.readyForR8 === true;

  const r12Status = readJsonIfPresent(path.join(analysisDir, "r12_micro_live_readiness_status.json"));
  const r12Complete = r12Status.data?.evaluation?.verdict != null;
  const r14Status = readJsonIfPresent(path.join(analysisDir, "r14_slippage_mev_status.json"));
  const r14Complete = options.r14Complete === true || r14Status.data?.evaluation?.verdict != null;

  const proposedAllocationSol = options.proposedAllocationSol ?? PROPOSED_APPROVAL_TERMS.maxAuthorizedSessionAllocationSol;
  const proposedFirstTradeSol = options.proposedFirstTradeSol ?? PROPOSED_APPROVAL_TERMS.maxFirstTradeSizeSol.max;
  const allocationWithinMicroLimit =
    proposedAllocationSol <= PROPOSED_APPROVAL_TERMS.maxAuthorizedSessionAllocationSol &&
    proposedFirstTradeSol <= PROPOSED_APPROVAL_TERMS.maxFirstTradeSizeSol.max;

  const context = {
    posture,
    recoveryAbsent,
    r7Verdict,
    r7bReady,
    r12Complete,
    r14Complete,
    r7bBypassAcknowledged: options.r7bBypassAcknowledged === true,
    finalSignedApproval: options.finalSignedApproval === true,
    safetySuiteGreen: options.safetySuiteGreen === true,
    allocationWithinMicroLimit,
    proposedAllocationSol,
    proposedFirstTradeSol
  };

  const gate = deriveGateStatus(context);
  const blockers = collectImplementationBlockers(context);

  return {
    timestamp: new Date().toISOString(),
    review: "R13-final-micro-live-approval-gate",
    liveTradingApproved: false,
    microLiveApproved: false,
    capitalAtRiskUsd: 0,
    capitalAtRiskSol: 0,
    posture,
    recoveryActionsJsonl: { exists: !recoveryAbsent },
    priorGates: {
      r6a: "PASS",
      r7Verdict,
      r7bReady,
      r7bStatus: r7bReady ? "THRESHOLDS MET" : "ACTIVE — THRESHOLDS NOT MET",
      r8: "RISK CONTROLS DEFINED BUT NOT ARMED",
      r9: "WALLET SECURITY DESIGN DEFINED BUT NOT CONNECTED",
      r10: "READY FOR SIGNER SIMULATION HARNESS",
      r11: "EMERGENCY STOP VALIDATED IN SIMULATION ONLY",
      r12: r12Complete ? "CHECKLIST DEFINED BUT BLOCKED" : "UNKNOWN/PENDING",
      r14: r14Complete ? "SLIPPAGE / MEV REVIEW DEFINED — NOT IMPLEMENTED" : "UNKNOWN/PENDING"
    },
    r7bBypass: {
      status: context.r7bBypassAcknowledged ? "HIGH RISK ACKNOWLEDGED" : "NOT ACKNOWLEDGED",
      thresholdsMet: r7bReady,
      edgeProven: false,
      note: "R7b bypass is a higher-risk operator exception — NOT approved by this check"
    },
    operatorWalletNote: OPERATOR_WALLET_NOTE,
    proposedApprovalTerms: PROPOSED_APPROVAL_TERMS,
    proposedSessionAllocation: {
      proposedAllocationSol,
      proposedFirstTradeSol,
      withinMicroLimit: allocationWithinMicroLimit,
      fullWalletSolNotAuthorized: true
    },
    evaluation: {
      verdict: "FINAL APPROVAL GATE DEFINED — BLOCKED",
      gateStatus: gate.gateStatus,
      reason: gate.reason,
      approved: false
    },
    implementationBlockers: blockers,
    recommendedNextGate:
      "Complete R12 if pending; complete R14 slippage/MEV review; continue R7b if possible; do not arm live; do not connect wallet through unapproved path; do not treat 1 SOL as active risk amount"
  };
}

function printSummary(status) {
  console.log("[r13-approval] Final Micro-Live Approval Gate (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  gate status: ${status.evaluation.gateStatus}`);
  console.log(`  micro-live approved: false`);
  console.log(`  live trading approved: false`);
  console.log(`  R7b thresholds met: ${status.priorGates.r7bReady === true}`);
  console.log(`  R7b bypass: ${status.r7bBypass.status}`);
  console.log(`  proposed max session allocation: ${status.proposedApprovalTerms.maxAuthorizedSessionAllocationSol} SOL`);
  console.log(`  blockers: ${status.implementationBlockers.length}`);
}

function writeStatus(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runR13MicroLiveApprovalCheck(options = {}) {
  const status = collectR13MicroLiveApprovalStatus(options);
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
    const result = runR13MicroLiveApprovalCheck();
    if (result.outputFile) {
      console.log(`  status: ${result.outputFile}`);
    }
  } catch (err) {
    console.error("[r13-approval] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  OPERATOR_WALLET_NOTE,
  PROPOSED_APPROVAL_TERMS,
  OUTPUT_FILE,
  readPosture,
  isSafeObservationPosture,
  deriveGateStatus,
  collectImplementationBlockers,
  collectR13MicroLiveApprovalStatus,
  runR13MicroLiveApprovalCheck,
  writeStatus
};
