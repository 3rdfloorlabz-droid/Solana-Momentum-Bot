"use strict";

// r8_risk_controls_check.js — Sprint 4 R8
// Read-only risk controls posture check. Writes analysis/ only.
// Does NOT enable live trading, mutate config, or handle wallet/signer credentials.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R8_OUTPUT_DIR
  ? path.resolve(process.env.R8_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r8_risk_controls_status.json");

const PROPOSED_RESEARCH_LIMITS = {
  note: "Proposed future micro-live limits only — NOT active in live_config.json",
  totalResearchBudgetUsd: "operator-defined",
  firstMicroLiveAllocationUsd: { min: 25, max: 50 },
  firstTradeSizeUsd: { min: 5, max: 10 },
  maxOpenPositions: 1,
  maxTradesPerDay: 3,
  maxDailyLossUsd: 15,
  maxDailyLossPctOfMicroAllocation: 0.3,
  maxWeeklyLossUsd: 30,
  maxWeeklyLossPctOfMicroAllocation: 0.6,
  stopAfterConsecutiveLosses: 2,
  autoCompounding: false,
  scaling: false,
  averagingDown: false,
  revengeTrades: false,
  unattendedLiveSession: false
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
    positionSizeSol: data.positionSizeSol ?? null
  };
}

function collectBlockers(context) {
  const blockers = [];
  if (context.posture.executionMode !== "PIPELINE_DRY_RUN") {
    blockers.push("executionMode is not PIPELINE_DRY_RUN");
  }
  if (context.posture.dryRunMode !== true) {
    blockers.push("dryRunMode is not true");
  }
  if (context.posture.liveArmed === true) {
    blockers.push("liveArmed is true");
  }
  if (context.recoveryActionsJsonl.exists) {
    blockers.push("recovery_actions.jsonl exists unexpectedly");
  }
  if (context.r7Verdict === "NOT ENOUGH DATA") {
    blockers.push("R7 verdict was NOT ENOUGH DATA");
  }
  if (context.r7bReadyForR8 !== true) {
    blockers.push("R7b sample thresholds not met");
  }
  blockers.push("R8 defines controls only — not armed");
  blockers.push("wallet/signer review not complete (R9 pending)");
  blockers.push("live execution path review not complete");
  blockers.push("emergency stop live drill not complete");
  blockers.push("live readiness checklist not complete");
  blockers.push("explicit human approval not given");
  blockers.push("micro-live config not created");
  return blockers;
}

function deriveVerdict(context) {
  if (
    context.posture.liveArmed === true ||
    context.posture.executionMode === "LIVE" ||
    context.posture.dryRunMode === false
  ) {
    return {
      verdict: "NOT READY FOR LIVE",
      reason: "Unsafe posture detected — live trading must remain blocked."
    };
  }
  if (context.r7bReadyForR8 === true && context.r7Verdict !== "NOT ENOUGH DATA") {
    return {
      verdict: "READY FOR WALLET/SIGNER REVIEW",
      reason: "Controls defined and strategy sample gates met — R9 may be considered. Live trading still NOT approved."
    };
  }
  return {
    verdict: "RISK CONTROLS DEFINED BUT NOT ARMED",
    reason: "Proposed micro-live limits documented; prerequisites and R7b collection remain incomplete."
  };
}

function collectR8RiskControlsStatus(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;

  const posture = readPosture(runtimeRoot);
  const recoveryActionsJsonl = {
    exists: fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"))
  };

  const soakSummary = readJsonIfPresent(path.join(repoRoot, "soak_runs", "r6a_24h_soak_summary.json"));
  const r7Metrics = readJsonIfPresent(path.join(analysisDir, "r7_strategy_metrics.json"));
  const r7bSummary = readJsonIfPresent(path.join(analysisDir, "r7b_daily_summary.json"));

  const r7Verdict = r7Metrics.data?.recommendation?.verdict || "NOT ENOUGH DATA";
  const r7bReadyForR8 = r7bSummary.data?.progress?.readyForR8 === true;

  const context = {
    posture,
    recoveryActionsJsonl,
    r7Verdict,
    r7bReadyForR8
  };

  const evaluation = deriveVerdict(context);
  const blockers = collectBlockers(context);

  return {
    timestamp: new Date().toISOString(),
    review: "R8-risk-controls",
    liveTradingApproved: false,
    microLiveApproved: false,
    controlsArmed: false,
    proposedResearchLimits: PROPOSED_RESEARCH_LIMITS,
    posture,
    recoveryActionsJsonl,
    priorGates: {
      r6aSoak: soakSummary.data
        ? { overallVerdict: soakSummary.data.overallVerdict, liveTradingApproved: false }
        : { status: soakSummary.status },
      r7Verdict,
      r7bProgress: r7bSummary.data
        ? {
            recommendation: r7bSummary.data.progress?.recommendation,
            readyForR8: r7bSummary.data.progress?.readyForR8 === true
          }
        : { status: r7bSummary.status }
    },
    evaluation,
    blockers,
    recommendedNextGate: evaluation.verdict === "READY FOR WALLET/SIGNER REVIEW"
      ? "Proceed to R9 Wallet / Signer Security Review — do not arm live trading"
      : "Continue R7b data collection — do not arm live trading"
  };
}

function printSummary(status) {
  console.log("[r8-risk] Risk Controls Review status (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  controls armed: false`);
  console.log(`  live trading approved: false`);
  console.log(`  posture: mode=${status.posture.executionMode} dryRunMode=${status.posture.dryRunMode} liveArmed=${status.posture.liveArmed}`);
  console.log(`  R7 verdict: ${status.priorGates.r7Verdict}`);
  console.log(`  R7b ready for R8: ${status.priorGates.r7bProgress.readyForR8 === true}`);
  console.log(`  recommended next gate: ${status.recommendedNextGate}`);
}

function writeStatus(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runR8RiskControlsCheck(options = {}) {
  const status = collectR8RiskControlsStatus(options);
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
    const result = runR8RiskControlsCheck();
    if (result.outputFile) {
      console.log(`  status: ${result.outputFile}`);
    }
  } catch (err) {
    console.error("[r8-risk] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  PROPOSED_RESEARCH_LIMITS,
  OUTPUT_FILE,
  readPosture,
  collectBlockers,
  deriveVerdict,
  collectR8RiskControlsStatus,
  runR8RiskControlsCheck,
  writeStatus
};
