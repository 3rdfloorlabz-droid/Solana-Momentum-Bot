"use strict";

// r15_manual_approval_check.js — Sprint 4 R15
// Read-only manual approval record / session runbook status. Writes analysis/ only.
// Does NOT approve micro-live, connect wallets, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const r7b = require("./r7b_daily_summary");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R15_OUTPUT_DIR
  ? path.resolve(process.env.R15_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r15_manual_approval_status.json");
const DEFAULT_RECORD_FILE = path.join(OUTPUT_DIR, "r15_manual_approval_record.json");

const GATE_DOCS = {
  r12: "docs/R12_MICRO_LIVE_READINESS_CHECKLIST.md",
  r13: "docs/R13_FINAL_MICRO_LIVE_APPROVAL_GATE.md",
  r14: "docs/R14_SLIPPAGE_MEV_PROTECTION_REVIEW.md",
  r15: "docs/R15_MANUAL_APPROVAL_RECORD_AND_SESSION_RUNBOOK.md"
};

const APPROVAL_STATUSES = {
  NOT_APPROVED: "NOT APPROVED",
  FINAL_REVIEW_ONLY: "APPROVED FOR FINAL REVIEW ONLY",
  ONE_SESSION_ONLY: "APPROVED FOR ONE MICRO-LIVE SESSION ONLY"
};

const MICRO_LIMITS = {
  note: "Proposed draft limits only — NOT active in live_config.json",
  maxAuthorizedSessionAllocationSol: 0.05,
  maxFirstTradeSizeSol: 0.01,
  maxOpenPositions: 1,
  maxTradesFirstSession: 1,
  maxTradesPerDayAfterReview: 3,
  maxSessionDrawdownSol: 0.03,
  stopAfterConsecutiveLosses: 2
};

const REQUIRED_ACK_FIELDS = [
  "totalLossRiskAcknowledged",
  "slippageCapAcknowledged",
  "mevProtectionPlanAcknowledged",
  "emergencyStopPolicyAcknowledged",
  "noAutoCompoundingAcknowledged",
  "noAveragingDownAcknowledged",
  "noUnattendedExecutionAcknowledged",
  "liveTradingNotForIncomeAcknowledged"
];

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
  for (const [key, rel] of Object.entries(GATE_DOCS)) {
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
    emergencyStop: data.emergencyStop === true
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

function normalizeRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const ack = raw.acknowledgments && typeof raw.acknowledgments === "object"
    ? raw.acknowledgments
    : {};
  const limits = raw.limits && typeof raw.limits === "object" ? raw.limits : {};
  return {
    approvalId: raw.approvalId || null,
    operatorName: raw.operatorName || null,
    dateTime: raw.dateTime || null,
    sessionStartTime: raw.sessionStartTime || null,
    sessionEndTime: raw.sessionEndTime || null,
    researchWalletPublicAddress: raw.researchWalletPublicAddress || null,
    totalWalletBalance: raw.totalWalletBalance ?? null,
    authorizedSessionAllocationSol:
      limits.authorizedSessionAllocationSol ?? raw.authorizedSessionAllocationSol ?? null,
    maxFirstTradeSizeSol: limits.maxFirstTradeSizeSol ?? raw.maxFirstTradeSizeSol ?? null,
    maxSessionLoss: limits.maxSessionLoss ?? raw.maxSessionLoss ?? null,
    maxDailyLoss: limits.maxDailyLoss ?? raw.maxDailyLoss ?? null,
    maxWeeklyLoss: limits.maxWeeklyLoss ?? raw.maxWeeklyLoss ?? null,
    maxOpenPositions: limits.maxOpenPositions ?? raw.maxOpenPositions ?? null,
    maxTradesThisSession: limits.maxTradesThisSession ?? raw.maxTradesThisSession ?? null,
    maxTradesPerDay: limits.maxTradesPerDay ?? raw.maxTradesPerDay ?? null,
    perTradeApprovalRequired: raw.perTradeApprovalRequired !== false,
    finalApprovalStatus: raw.finalApprovalStatus || APPROVAL_STATUSES.NOT_APPROVED,
    acknowledgments: {
      r7bBypassRiskAcknowledged: ack.r7bBypassRiskAcknowledged === true,
      totalLossRiskAcknowledged: ack.totalLossRiskAcknowledged === true,
      slippageCapAcknowledged: ack.slippageCapAcknowledged === true,
      mevProtectionPlanAcknowledged: ack.mevProtectionPlanAcknowledged === true,
      emergencyStopPolicyAcknowledged: ack.emergencyStopPolicyAcknowledged === true,
      noAutoCompoundingAcknowledged: ack.noAutoCompoundingAcknowledged === true,
      noAveragingDownAcknowledged: ack.noAveragingDownAcknowledged === true,
      noUnattendedExecutionAcknowledged: ack.noUnattendedExecutionAcknowledged === true,
      liveTradingNotForIncomeAcknowledged: ack.liveTradingNotForIncomeAcknowledged === true
    },
    operatorSignaturePresent: raw.operatorSignaturePresent === true
  };
}

function validateApprovalRecord(record, context) {
  const blockers = [];
  const warnings = [];

  if (!record) {
    blockers.push("manual approval record missing");
    return { valid: false, blockers, warnings, allocationWithinMicroLimit: false, acksComplete: false };
  }

  if (!record.approvalId || !record.operatorName || !record.dateTime) {
    blockers.push("approval record malformed — missing approvalId, operatorName, or dateTime");
  }

  const allocation = Number(record.authorizedSessionAllocationSol);
  const maxTrade = Number(record.maxFirstTradeSizeSol);
  const allocationWithinMicroLimit =
    Number.isFinite(allocation) &&
    Number.isFinite(maxTrade) &&
    allocation <= MICRO_LIMITS.maxAuthorizedSessionAllocationSol &&
    maxTrade <= MICRO_LIMITS.maxFirstTradeSizeSol;

  if (!allocationWithinMicroLimit) {
    blockers.push("proposed allocation or trade size exceeds micro limit");
  }

  const acksComplete = REQUIRED_ACK_FIELDS.every(
    (field) => record.acknowledgments[field] === true
  );
  if (!acksComplete) {
    blockers.push("required acknowledgments incomplete");
  }

  if (!context.r7bReady && !record.acknowledgments.r7bBypassRiskAcknowledged) {
    blockers.push("R7b bypass risk not acknowledged while R7b thresholds unmet");
  }

  if (record.finalApprovalStatus === APPROVAL_STATUSES.ONE_SESSION_ONLY) {
    warnings.push(
      "record claims ONE MICRO-LIVE SESSION approval — script does not auto-approve; live path not implemented"
    );
    blockers.push("record status claims session approval but live arming remains blocked");
  }

  if (record.finalApprovalStatus !== APPROVAL_STATUSES.NOT_APPROVED &&
      record.finalApprovalStatus !== APPROVAL_STATUSES.FINAL_REVIEW_ONLY &&
      record.finalApprovalStatus !== APPROVAL_STATUSES.ONE_SESSION_ONLY) {
    blockers.push("unknown or invalid finalApprovalStatus");
  }

  if (!record.operatorSignaturePresent) {
    blockers.push("operator signature not recorded");
  }

  return {
    valid: blockers.length === 0,
    blockers,
    warnings,
    allocationWithinMicroLimit,
    acksComplete
  };
}

function deriveGateStatus(context) {
  if (
    context.posture.liveArmed === true ||
    context.posture.emergencyStop === true ||
    !context.recoveryAbsent ||
    context.safetySuiteGreen === false ||
    !context.gateDocs.r12 ||
    !context.gateDocs.r13 ||
    !context.gateDocs.r14 ||
    !context.gateDocs.r15
  ) {
    return {
      gateStatus: "BLOCKED",
      approvalStatus: APPROVAL_STATUSES.NOT_APPROVED,
      reason: "Unsafe posture, missing gate docs, or safety signal — manual approval remains blocked."
    };
  }

  if (!context.recordPresent) {
    return {
      gateStatus: "NOT_APPROVED",
      approvalStatus: APPROVAL_STATUSES.NOT_APPROVED,
      reason: "No manual approval record on file — default NOT APPROVED."
    };
  }

  if (!context.recordValidation.valid) {
    return {
      gateStatus: "BLOCKED",
      approvalStatus: APPROVAL_STATUSES.NOT_APPROVED,
      reason: "Approval record present but invalid or incomplete — live remains blocked."
    };
  }

  if (
    context.recordValidation.valid &&
    context.recordValidation.allocationWithinMicroLimit &&
    isSafeObservationPosture(context.posture) &&
    context.record.finalApprovalStatus === APPROVAL_STATUSES.FINAL_REVIEW_ONLY
  ) {
    return {
      gateStatus: "REVIEWABLE_ONLY",
      approvalStatus: APPROVAL_STATUSES.FINAL_REVIEW_ONLY,
      reason: "Record complete for final review — live trading still NOT approved by this check."
    };
  }

  return {
    gateStatus: "NOT_APPROVED",
    approvalStatus: APPROVAL_STATUSES.NOT_APPROVED,
    reason: "Manual approval runbook defined; record not ready or status remains NOT APPROVED."
  };
}

function collectR15ManualApprovalStatus(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const recordFile = options.recordFile || path.join(analysisDir, "r15_manual_approval_record.json");

  const posture = readPosture(runtimeRoot);
  const recoveryAbsent = !fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"));
  const gateDocs = options.gateDocs || readGateDocs(repoRoot);

  let r7bSummary = options.r7bSummary || null;
  if (!r7bSummary) {
    const r7bFile = readJsonIfPresent(path.join(analysisDir, "r7b_daily_summary.json"));
    r7bSummary = r7bFile.data;
  }
  const r7bReady = r7bSummary?.progress?.readyForR8 === true;

  const safetySuiteGreen = options.safetySuiteGreen !== undefined
    ? options.safetySuiteGreen === true
    : null;

  const recordFileResult = options.approvalRecord
    ? { status: "present", data: options.approvalRecord }
    : readJsonIfPresent(recordFile);

  const record = recordFileResult.status === "present"
    ? normalizeRecord(recordFileResult.data)
    : null;

  const context = {
    posture,
    recoveryAbsent,
    gateDocs,
    r7bReady,
    safetySuiteGreen: safetySuiteGreen === true,
    recordPresent: record != null,
    record
  };

  context.recordValidation = validateApprovalRecord(record, context);
  const gate = deriveGateStatus(context);

  const blockers = [...context.recordValidation.blockers];
  if (!context.gateDocs.r12) blockers.push("R12 doc missing");
  if (!context.gateDocs.r13) blockers.push("R13 doc missing");
  if (!context.gateDocs.r14) blockers.push("R14 doc missing");
  if (!context.gateDocs.r15) blockers.push("R15 doc missing");
  if (!context.r7bReady) blockers.push("R7b thresholds not met");
  blockers.push("live execution implementation not approved");
  blockers.push("real wallet not connected through approved path");
  blockers.push("signer not implemented for live");
  blockers.push("1 SOL wallet liquidity is not authorized active risk");

  return {
    timestamp: new Date().toISOString(),
    review: "R15-manual-approval-record-session-runbook",
    liveTradingApproved: false,
    microLiveApproved: false,
    approved: false,
    capitalAtRiskUsd: 0,
    posture,
    recoveryActionsJsonl: { exists: !recoveryAbsent },
    gateDocs,
    priorGates: {
      r12: gateDocs.r12 ? "CHECKLIST DEFINED BUT BLOCKED" : "MISSING",
      r13: gateDocs.r13 ? "FINAL APPROVAL GATE DEFINED — BLOCKED" : "MISSING",
      r14: gateDocs.r14 ? "SLIPPAGE / MEV REVIEW DEFINED — NOT IMPLEMENTED" : "MISSING"
    },
    r7bReady,
    proposedMicroLiveTerms: MICRO_LIMITS,
    approvalRecord: {
      file: recordFile,
      fileStatus: recordFileResult.status,
      present: context.recordPresent,
      finalApprovalStatus: record?.finalApprovalStatus || APPROVAL_STATUSES.NOT_APPROVED,
      validation: context.recordValidation
    },
    evaluation: {
      verdict: "MANUAL APPROVAL RUNBOOK DEFINED — LIVE STILL BLOCKED",
      gateStatus: gate.gateStatus,
      approvalStatus: gate.approvalStatus,
      reason: gate.reason,
      approved: false
    },
    implementationBlockers: [...new Set(blockers)],
    warnings: context.recordValidation.warnings,
    recommendedNextGate:
      "Continue R7b where possible; use R15 record for research exception only with explicit ack; build R16 Micro-Live Implementation Gap Review; do not arm live; do not connect wallet"
  };
}

function printSummary(status) {
  console.log("[r15-approval] Manual Approval Record / Session Runbook (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  gate status: ${status.evaluation.gateStatus}`);
  console.log(`  approval status: ${status.evaluation.approvalStatus}`);
  console.log(`  approved: false`);
  console.log(`  live trading approved: false`);
  console.log(`  record present: ${status.approvalRecord.present}`);
  console.log(`  R7b ready: ${status.r7bReady === true}`);
  console.log(`  blockers: ${status.implementationBlockers.length}`);
}

function writeStatus(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runR15ManualApprovalCheck(options = {}) {
  const status = collectR15ManualApprovalStatus(options);
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
    const result = runR15ManualApprovalCheck();
    if (result.outputFile) {
      console.log(`  status: ${result.outputFile}`);
    }
  } catch (err) {
    console.error("[r15-approval] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOCS,
  APPROVAL_STATUSES,
  MICRO_LIMITS,
  OUTPUT_FILE,
  DEFAULT_RECORD_FILE,
  readPosture,
  readGateDocs,
  normalizeRecord,
  validateApprovalRecord,
  deriveGateStatus,
  collectR15ManualApprovalStatus,
  runR15ManualApprovalCheck,
  writeStatus
};
