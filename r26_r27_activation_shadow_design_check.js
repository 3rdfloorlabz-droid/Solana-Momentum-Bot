"use strict";

// r26_r27_activation_shadow_design_check.js — Sprint 4 R26-R27 combined
// Read-only activation review + shadow execution design status. Writes analysis/ only.
// Does NOT activate polling, execute trades, sign, submit, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R26R27_OUTPUT_DIR
  ? path.resolve(process.env.R26R27_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r26_r27_activation_shadow_design_status.json");

const GATE_DOCS = {
  r26: "docs/R26_REAL_QUOTE_OBSERVATION_ACTIVATION_REVIEW.md",
  r27: "docs/R27_SHADOW_EXECUTION_DESIGN.md"
};

const ARTIFACTS = {
  r25ActivationRecord: "examples/r25_quote_observation_activation_record.example.json",
  r26ActivationReview: "examples/r26_quote_observation_activation_review.example.json",
  shadowExecutionDecisions: "examples/shadow_execution_decisions.example.json"
};

const SECRET_FIELD_PATTERN = /private[_-]?key|secret|seed|mnemonic|signer[_-]?secret|passphrase|api[_-]?key|wallet[_-]?private/i;

function docExists(repoRoot, rel) {
  return fs.existsSync(path.join(repoRoot, rel));
}

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

function findSecretLikeFields(obj, prefix = "") {
  const hits = [];
  if (!obj || typeof obj !== "object") return hits;
  for (const [key, value] of Object.entries(obj)) {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    if (SECRET_FIELD_PATTERN.test(key)) hits.push(pathKey);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      hits.push(...findSecretLikeFields(value, pathKey));
    }
  }
  return hits;
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

function detectNetworkPollingActive(repoRoot, options = {}) {
  if (options.networkPollingActive === true) return true;
  const flagFile = path.join(repoRoot, "analysis", "shadow_quote_polling_active.json");
  if (!fs.existsSync(flagFile)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(flagFile, "utf8"));
    return data.active === true;
  } catch {
    return false;
  }
}

function validateActivationRecord(record) {
  const issues = [];
  if (!record || typeof record !== "object") {
    return { valid: false, notApproved: false, issues: ["R25 activation record missing"] };
  }

  const secretHits = findSecretLikeFields(record);
  if (secretHits.length > 0) issues.push(`secret-like fields: ${secretHits.join(", ")}`);

  const forbiddenTrue = ["tradingAllowed", "signingAllowed", "submissionAllowed", "walletRequired"]
    .filter((field) => record[field] === true);
  if (forbiddenTrue.length > 0) {
    issues.push(`forbidden fields true: ${forbiddenTrue.join(", ")}`);
  }

  if (record.networkPollingAllowed === true) {
    issues.push("networkPollingAllowed true forbidden");
  }

  const approvalStatus = record.approvalStatus || "NOT_APPROVED";
  const notApproved = approvalStatus === "NOT_APPROVED" || approvalStatus === "NOT APPROVED";

  if (record.approved === true) {
    issues.push("approved true forbidden");
  }

  return { valid: issues.length === 0, notApproved, secretHits, issues };
}

function validateActivationReview(reviewRecord) {
  const issues = [];
  if (!reviewRecord || typeof reviewRecord !== "object") {
    return { valid: false, notActivated: false, issues: ["R26 activation review missing"] };
  }

  const secretHits = findSecretLikeFields(reviewRecord);
  if (secretHits.length > 0) issues.push(`secret-like fields: ${secretHits.join(", ")}`);

  const reviewStatus = reviewRecord.reviewStatus || "NOT_APPROVED";
  const activationStatus = reviewRecord.activationStatus || "NOT_ACTIVATED";

  if (reviewStatus !== "NOT_APPROVED" && reviewStatus !== "NOT APPROVED") {
    issues.push("reviewStatus must remain NOT_APPROVED in R26");
  }
  if (activationStatus !== "NOT_ACTIVATED") {
    issues.push("activationStatus must remain NOT_ACTIVATED in R26");
  }
  if (reviewRecord.networkPollingAllowed === true) {
    issues.push("networkPollingAllowed true forbidden");
  }

  const approvedProviders = Array.isArray(reviewRecord.approvedProviders)
    ? reviewRecord.approvedProviders
    : [];
  if (approvedProviders.length > 0 && activationStatus === "NOT_ACTIVATED") {
    issues.push("approvedProviders must be empty while NOT_ACTIVATED");
  }

  const forbiddenTrue = ["tradingAllowed", "signingAllowed", "submissionAllowed", "walletRequired"]
    .filter((field) => reviewRecord[field] === true);
  if (forbiddenTrue.length > 0) {
    issues.push(`forbidden fields true: ${forbiddenTrue.join(", ")}`);
  }

  return {
    valid: issues.length === 0,
    notActivated: activationStatus === "NOT_ACTIVATED",
    approvedProviders,
    issues
  };
}

function extractShadowDecisions(data) {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.decisions)) return data.decisions;
  return [data];
}

function validateShadowExecutionExamples(data) {
  const issues = [];
  if (!data) {
    return { valid: false, decisionCount: 0, issues: ["shadow execution example missing"] };
  }

  const secretHits = findSecretLikeFields(data);
  if (secretHits.length > 0) issues.push(`secret-like fields: ${secretHits.join(", ")}`);

  const decisions = extractShadowDecisions(data);
  for (const decision of decisions) {
    if (decision.approved === true) issues.push("shadow decision approved true forbidden");
    if (decision.tradingAllowed === true) issues.push("shadow decision tradingAllowed true forbidden");
    if (decision.signingAllowed === true) issues.push("shadow decision signingAllowed true forbidden");
    if (decision.submissionAllowed === true) issues.push("shadow decision submissionAllowed true forbidden");
  }

  return { valid: issues.length === 0, decisionCount: decisions.length, issues };
}

function deriveCombinedStatus(context) {
  if (
    !context.gateDocs.r26 ||
    !context.gateDocs.r27 ||
    context.r25RecordStatus === "missing" ||
    context.r25RecordStatus === "corrupt" ||
    context.r26ReviewStatus === "missing" ||
    context.r26ReviewStatus === "corrupt" ||
    context.shadowExampleStatus === "missing" ||
    context.shadowExampleStatus === "corrupt" ||
    context.networkPollingActive ||
    context.posture.liveArmed === true ||
    context.posture.dryRunMode === false ||
    context.posture.emergencyStop === true ||
    !context.recoveryAbsent ||
    (context.r25Validation && !context.r25Validation.valid) ||
    (context.r26Validation && !context.r26Validation.valid) ||
    (context.shadowValidation && !context.shadowValidation.valid)
  ) {
    return {
      gateStatus: "BLOCKED",
      reason: "Missing docs/examples, unsafe posture, polling active, or invalid review/record."
    };
  }

  if (
    context.gateDocs.r26 &&
    context.gateDocs.r27 &&
    isSafeObservationPosture(context.posture) &&
    context.recoveryAbsent &&
    !context.networkPollingActive &&
    context.enableManualDecisionReview === true
  ) {
    return {
      gateStatus: "READY_FOR_MANUAL_QUOTE_OBSERVATION_DECISION",
      reason: "Activation review and shadow design complete — ready for manual operator decision only (not activated)."
    };
  }

  if (context.gateDocs.r27 && context.shadowValidation && context.shadowValidation.valid) {
    return {
      gateStatus: "SHADOW_DESIGN_DEFINED_NOT_ACTIVE",
      reason: "Shadow execution design defined — no execution active."
    };
  }

  if (context.gateDocs.r26 && context.r26Validation && context.r26Validation.valid) {
    return {
      gateStatus: "REVIEW_DEFINED_NOT_ACTIVE",
      reason: "Activation review defined — quote polling NOT activated."
    };
  }

  return {
    gateStatus: "BLOCKED",
    reason: "R26-R27 gates incomplete."
  };
}

function collectR26R27ActivationShadowDesignStatus(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;

  const posture = readPosture(runtimeRoot);
  const recoveryAbsent = !fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"));

  const gateDocs = options.gateDocs || {
    r26: docExists(repoRoot, GATE_DOCS.r26),
    r27: docExists(repoRoot, GATE_DOCS.r27)
  };

  let r25Load;
  if (options.r25ActivationRecord && typeof options.r25ActivationRecord === "object") {
    r25Load = { status: "present", data: options.r25ActivationRecord };
  } else {
    const recordPath = options.r25ActivationRecordFile ||
      path.join(repoRoot, ARTIFACTS.r25ActivationRecord);
    r25Load = readJsonIfPresent(recordPath);
  }

  let r26Load;
  if (options.r26ActivationReview && typeof options.r26ActivationReview === "object") {
    r26Load = { status: "present", data: options.r26ActivationReview };
  } else {
    const reviewPath = options.r26ActivationReviewFile ||
      path.join(repoRoot, ARTIFACTS.r26ActivationReview);
    r26Load = readJsonIfPresent(reviewPath);
  }

  let shadowLoad;
  if (options.shadowExecutionExample && typeof options.shadowExecutionExample === "object") {
    shadowLoad = { status: "present", data: options.shadowExecutionExample };
  } else {
    const shadowPath = options.shadowExecutionExampleFile ||
      path.join(repoRoot, ARTIFACTS.shadowExecutionDecisions);
    shadowLoad = readJsonIfPresent(shadowPath);
  }

  const r25Validation = r25Load.status === "present"
    ? validateActivationRecord(r25Load.data)
    : null;
  const r26Validation = r26Load.status === "present"
    ? validateActivationReview(r26Load.data)
    : null;
  const shadowValidation = shadowLoad.status === "present"
    ? validateShadowExecutionExamples(shadowLoad.data)
    : null;

  const networkPollingActive = detectNetworkPollingActive(repoRoot, options);

  const context = {
    gateDocs,
    r25RecordStatus: r25Load.status,
    r26ReviewStatus: r26Load.status,
    shadowExampleStatus: shadowLoad.status,
    r25Validation,
    r26Validation,
    shadowValidation,
    posture,
    recoveryAbsent,
    networkPollingActive,
    enableManualDecisionReview: options.enableManualDecisionReview === true
  };

  const gate = deriveCombinedStatus(context);

  const blockers = [];
  if (!gateDocs.r26) blockers.push("R26 doc missing");
  if (!gateDocs.r27) blockers.push("R27 doc missing");
  if (r25Load.status === "missing") blockers.push("R25 activation record missing");
  if (r26Load.status === "missing") blockers.push("R26 activation review missing");
  if (shadowLoad.status === "missing") blockers.push("shadow execution example missing");
  if (networkPollingActive) blockers.push("network polling active — forbidden");
  if (r25Validation && !r25Validation.valid) blockers.push(...r25Validation.issues);
  if (r26Validation && !r26Validation.valid) blockers.push(...r26Validation.issues);
  if (shadowValidation && !shadowValidation.valid) blockers.push(...shadowValidation.issues);
  if (posture.liveArmed === true) blockers.push("liveArmed true");
  if (posture.dryRunMode === false) blockers.push("dryRunMode false");
  if (!recoveryAbsent) blockers.push("recovery_actions.jsonl present");
  blockers.push("quote polling not activated");
  blockers.push("shadow execution not active");
  blockers.push("activation not approved");

  return {
    timestamp: new Date().toISOString(),
    review: "R26-R27-activation-shadow-design-check",
    liveTradingApproved: false,
    microLiveApproved: false,
    approved: false,
    quotePollingActive: false,
    shadowExecutionActive: false,
    capitalAtRiskUsd: 0,
    posture,
    recoveryActionsJsonl: { exists: !recoveryAbsent },
    gateDocs,
    artifacts: {
      r25ActivationRecord: r25Load.status,
      r26ActivationReview: r26Load.status,
      shadowExecutionDecisions: shadowLoad.status
    },
    networkPollingActive,
    r25ActivationRecord: { validation: r25Validation },
    r26ActivationReview: { validation: r26Validation },
    shadowExecutionDesign: {
      validation: shadowValidation,
      futureOutputs: {
        decisionsJsonl: "analysis/shadow_execution_decisions.jsonl",
        statusJson: "analysis/r27_shadow_execution_status.json"
      }
    },
    evaluation: {
      verdict: "R26-R27 ACTIVATION REVIEW + SHADOW DESIGN DEFINED — NOT ACTIVE",
      gateStatus: gate.gateStatus,
      reason: gate.reason,
      approved: false,
      r26Verdict: "REAL QUOTE OBSERVATION ACTIVATION REVIEW DEFINED — NOT ACTIVATED",
      r27Verdict: "SHADOW EXECUTION DESIGN DEFINED — NO EXECUTION ACTIVE"
    },
    blockers: [...new Set(blockers)],
    recommendedNextGate:
      "Future manual operator quote observation decision only; continue R7b; do not activate polling; do not connect wallet; do not arm live"
  };
}

function printSummary(status) {
  console.log("[r26-r27] Activation Review + Shadow Design Check (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  gate status: ${status.evaluation.gateStatus}`);
  console.log(`  approved: false`);
  console.log(`  quote polling active: false`);
  console.log(`  shadow execution active: false`);
  console.log(`  blockers: ${status.blockers.length}`);
}

function writeStatus(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runR26R27ActivationShadowDesignCheck(options = {}) {
  const status = collectR26R27ActivationShadowDesignStatus({
    ...options,
    enableManualDecisionReview: options.enableManualDecisionReview !== false
  });
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
    const result = runR26R27ActivationShadowDesignCheck();
    if (result.outputFile) {
      console.log(`  status: ${result.outputFile}`);
    }
  } catch (err) {
    console.error("[r26-r27] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOCS,
  ARTIFACTS,
  OUTPUT_FILE,
  readPosture,
  detectNetworkPollingActive,
  validateActivationRecord,
  validateActivationReview,
  validateShadowExecutionExamples,
  deriveCombinedStatus,
  collectR26R27ActivationShadowDesignStatus,
  runR26R27ActivationShadowDesignCheck,
  writeStatus
};
