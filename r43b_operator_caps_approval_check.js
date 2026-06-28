"use strict";

// r43b_operator_caps_approval_check.js — R43B read-only operator caps approval checker.
// Writes analysis/ only. Does NOT enable live trading, sign, or submit transactions.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const capsModule = require("./micro_live_caps");
const r42 = require("./r42_final_micro_live_review");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R43B_OUTPUT_DIR
  ? path.resolve(process.env.R43B_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r43b_operator_caps_approval_check.json");
const GATE_DOC = "docs/R43B_OPERATOR_CAPS_APPROVAL_RECORD.md";
const OPERATOR_CAPS = "operator_records/micro_live_demo_caps.json";

const SCHEMA_VERSION = 1;
const R43B_VERDICT = "R43B CAPS APPROVAL — ENGINEERING PROOF ONLY — NOT LIVE TRADING APPROVAL";

const VERDICTS = Object.freeze({
  INVALID: "CAPS_APPROVAL_INVALID",
  VALID: "CAPS_APPROVAL_VALID_FOR_ENGINEERING_PROOF_ONLY"
});

const FORBIDDEN_VERDICTS = Object.freeze([
  "LIVE_APPROVED",
  "READY_FOR_LIVE_TRADING",
  "STRATEGY_APPROVED"
]);

const REQUIRED_APPROVAL_TEXT =
  "I approve a one-transaction micro-live engineering proof only. "
  + "This is not strategy-profit validation, not full live trading approval, "
  + "and not approval for repeated trading. Maximum trade size is 0.01 SOL. "
  + "Maximum daily loss is 0.05 SOL. I will be present during execution. "
  + "Stop after the first transaction.";

const REQUIRED_APPROVAL_SCOPE = "one-transaction micro-live engineering proof only";

const R43B_LIMITS = Object.freeze({
  maxTradeSizeSol: 0.01,
  maxDailyLossSol: 0.05,
  maxTradesPerSession: 1,
  maxOpenLivePositions: 1,
  autoCompoundingAllowed: false,
  requireHumanPresent: true,
  stopAfterFirstTransaction: true
});

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

function isSafeApprovalPosture(posture) {
  return (
    posture.available === true &&
    posture.executionMode === "PIPELINE_DRY_RUN" &&
    posture.dryRunMode === true &&
    posture.liveArmed === false &&
    posture.emergencyStop !== true
  );
}

function readR7Verdict(analysisDir, options = {}) {
  if (options.r7Verdict !== undefined) return options.r7Verdict;
  const file = path.join(analysisDir, "r7_strategy_metrics.json");
  if (!fs.existsSync(file)) return "NOT ENOUGH DATA";
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))?.recommendation?.verdict || "NOT ENOUGH DATA";
  } catch {
    return "NOT ENOUGH DATA";
  }
}

function validateCapsApprovalRecord(caps, options = {}) {
  const errors = [];
  const requiredText = options.requiredApprovalText || REQUIRED_APPROVAL_TEXT;
  const requiredScope = options.requiredApprovalScope || REQUIRED_APPROVAL_SCOPE;
  const limits = options.r43bLimits || R43B_LIMITS;

  if (!caps || typeof caps !== "object") {
    return { ok: false, errors: ["caps missing"] };
  }

  if (caps.approved !== true) errors.push("approved must be true");
  if (typeof caps.approvedBy !== "string" || !caps.approvedBy.trim()) {
    errors.push("approvedBy must be a non-empty string");
  }
  if (!capsModule.isIsoTimestamp(caps.approvedAt)) {
    errors.push("approvedAt must be a valid ISO timestamp");
  }
  if (caps.approvalText !== requiredText) {
    errors.push("approvalText must match required R43B text exactly");
  }
  if (caps.approvalScope !== requiredScope) {
    errors.push("approvalScope must match required R43B scope exactly");
  }
  if (caps.purpose !== capsModule.REQUIRED_PURPOSE) {
    errors.push(`purpose must be exactly "${capsModule.REQUIRED_PURPOSE}"`);
  }

  if (!Number.isFinite(Number(caps.maxTradeSizeSol)) || Number(caps.maxTradeSizeSol) > limits.maxTradeSizeSol) {
    errors.push(`maxTradeSizeSol must be <= ${limits.maxTradeSizeSol}`);
  }
  if (!Number.isFinite(Number(caps.maxDailyLossSol)) || Number(caps.maxDailyLossSol) > limits.maxDailyLossSol) {
    errors.push(`maxDailyLossSol must be <= ${limits.maxDailyLossSol}`);
  }
  if (Number(caps.maxTradesPerSession) !== limits.maxTradesPerSession) {
    errors.push(`maxTradesPerSession must be exactly ${limits.maxTradesPerSession}`);
  }
  if (Number(caps.maxOpenLivePositions) !== limits.maxOpenLivePositions) {
    errors.push(`maxOpenLivePositions must be exactly ${limits.maxOpenLivePositions}`);
  }
  if (caps.autoCompoundingAllowed !== limits.autoCompoundingAllowed) {
    errors.push("autoCompoundingAllowed must be false");
  }
  if (caps.requireHumanPresent !== limits.requireHumanPresent) {
    errors.push("requireHumanPresent must be true");
  }
  if (caps.stopAfterFirstTransaction !== limits.stopAfterFirstTransaction) {
    errors.push("stopAfterFirstTransaction must be true");
  }

  return { ok: errors.length === 0, errors };
}

function collectR43bOperatorCapsApprovalCheck(options = {}) {
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
    : isSafeApprovalPosture(posture);

  const capsFile = options.capsFile || path.join(repoRoot, OPERATOR_CAPS);
  const capsLoad = options.capsLoad !== undefined
    ? options.capsLoad
    : capsModule.loadCapsFile(capsFile);

  const caps = capsLoad.status === "present" ? capsLoad.data : null;
  const capsValidation = validateCapsApprovalRecord(caps, options);
  const capsSummary = capsLoad.status === "present"
    ? capsModule.summarizeCapsLoad(capsLoad)
    : { fileStatus: capsLoad.status, conservativeOk: false, approvedOk: false, errors: ["caps missing"] };

  const executorIntegration = options.executorIntegrationCheck !== undefined
    ? options.executorIntegrationCheck
    : r42.checkExecutorIntegration(repoRoot);

  const r7Verdict = readR7Verdict(analysisDir, options);

  const checks = [];
  const addCheck = (id, ok, detail) => checks.push({ id, ok: ok === true, detail });

  addCheck("gate_doc_present", gateDocPresent, GATE_DOC);
  addCheck("recovery_absent", !recoveryPresent, "recovery_actions.jsonl absent");
  addCheck("posture_safe", postureSafe, "PIPELINE_DRY_RUN / dryRunMode true / liveArmed false");
  addCheck("caps_file_present", capsLoad.status === "present", capsLoad.status);
  addCheck("caps_approved_true", caps?.approved === true, String(caps?.approved));
  addCheck("caps_approval_record_valid", capsValidation.ok, capsValidation.errors.join("; ") || "ok");
  addCheck("caps_conservative", capsSummary.conservativeOk === true, "conservative limits satisfied");
  addCheck("executor_signer_not_integrated", executorIntegration.ok, executorIntegration.note);
  addCheck("r7_not_enough_data", r7Verdict === "NOT ENOUGH DATA", r7Verdict);
  addCheck("live_trading_not_approved", true, "full live trading NOT APPROVED");
  addCheck("engineering_proof_scope_only", true, REQUIRED_APPROVAL_SCOPE);

  const failed = checks.filter((check) => !check.ok);

  let r43bVerdict = VERDICTS.INVALID;
  let reason = failed.map((check) => `${check.id}: ${check.detail}`).join("; ");

  if (failed.length === 0) {
    r43bVerdict = VERDICTS.VALID;
    reason = "Operator caps approval valid for one-transaction engineering proof only — live trading still NOT APPROVED";
  }

  return {
    timestamp: new Date().toISOString(),
    review: "R43B-operator-caps-approval-check",
    schemaVersion: SCHEMA_VERSION,
    gateDocPresent,
    approved: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    strategyApproved: false,
    engineeringProofApproved: r43bVerdict === VERDICTS.VALID,
    r43bReviewVerdict: R43B_VERDICT,
    r43bVerdict,
    forbiddenVerdicts: FORBIDDEN_VERDICTS,
    evaluation: {
      r43bVerdict,
      r43bReviewVerdict: R43B_VERDICT,
      reason,
      approved: false,
      liveTradingApproved: false,
      approvalScope: REQUIRED_APPROVAL_SCOPE
    },
    approvalScope: REQUIRED_APPROVAL_SCOPE,
    requiredApprovalText: REQUIRED_APPROVAL_TEXT,
    postureSummary: posture.available ? {
      executionMode: posture.executionMode,
      dryRunMode: posture.dryRunMode,
      liveArmed: posture.liveArmed,
      emergencyStop: posture.emergencyStop,
      liveSubmission: "DISARMED",
      safeForApprovalCheck: postureSafe
    } : { available: false, status: posture.status },
    capsSummary: {
      file: capsFile,
      loadStatus: capsLoad.status,
      approved: caps?.approved === true,
      approvedBy: caps?.approvedBy || null,
      approvedAt: caps?.approvedAt || null,
      approvalScope: caps?.approvalScope || null,
      conservativeOk: capsSummary.conservativeOk === true,
      approvalRecordValid: capsValidation.ok === true,
      validationErrors: capsValidation.errors
    },
    r7Verdict,
    signerIntegration: {
      executorSignerIntegrated: executorIntegration.integrated === true,
      note: executorIntegration.note
    },
    checks,
    failedChecks: failed.map((check) => check.id),
    blockers: r43bVerdict === VERDICTS.INVALID ? [reason] : [],
    remainingBeforeProof: [
      "R43C — real local signer implementation under guardrails",
      "R43D — final proof preflight",
      "R43E — one tiny controlled transaction proof",
      "R43F — post-transaction audit review"
    ]
  };
}

function assertAnalysisWritePath(outputFile, analysisDir) {
  const resolvedOutput = path.resolve(outputFile);
  const resolvedAnalysis = path.resolve(analysisDir);
  const prefix = resolvedAnalysis.endsWith(path.sep)
    ? resolvedAnalysis
    : `${resolvedAnalysis}${path.sep}`;
  if (!resolvedOutput.startsWith(prefix)) {
    throw new Error("R43B output must stay under analysis/");
  }
}

function writeCheck(status, outputFile = OUTPUT_FILE, analysisDir = OUTPUT_DIR) {
  assertAnalysisWritePath(outputFile, analysisDir);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[r43b-caps] Operator Caps Approval Check (read-only)");
  console.log(`  verdict: ${status.r43bVerdict}`);
  console.log(`  approval scope: ${status.approvalScope}`);
  console.log(`  live trading approved: false`);
  console.log(`  failed checks: ${status.failedChecks.length}`);
}

function runR43bOperatorCapsApprovalCheck(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const outputFile = options.outputFile || path.join(analysisDir, "r43b_operator_caps_approval_check.json");
  const status = collectR43bOperatorCapsApprovalCheck({
    ...options,
    analysisDir
  });

  if (options.writeOutput !== false) {
    writeCheck(status, outputFile, analysisDir);
  }

  if (options.print !== false) {
    printSummary(status);
  }

  return { status, outputFile: options.writeOutput !== false ? outputFile : null };
}

if (require.main === module) {
  try {
    const result = runR43bOperatorCapsApprovalCheck();
    if (result.outputFile) console.log(`  output: ${result.outputFile}`);
  } catch (err) {
    console.error("[r43b-caps] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOC,
  OUTPUT_FILE,
  OPERATOR_CAPS,
  SCHEMA_VERSION,
  R43B_VERDICT,
  VERDICTS,
  FORBIDDEN_VERDICTS,
  REQUIRED_APPROVAL_TEXT,
  REQUIRED_APPROVAL_SCOPE,
  R43B_LIMITS,
  readPosture,
  isSafeApprovalPosture,
  readR7Verdict,
  validateCapsApprovalRecord,
  collectR43bOperatorCapsApprovalCheck,
  runR43bOperatorCapsApprovalCheck
};
