"use strict";

// r28_manual_quote_observation_decision_check.js — Sprint 4 R28
// Read-only manual quote observation decision session status. Writes analysis/ only.
// Does NOT activate polling, shadow execution, sign, submit, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R28_OUTPUT_DIR
  ? path.resolve(process.env.R28_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r28_manual_quote_observation_decision_status.json");
const DEFAULT_DECISION_FILE = path.join(ROOT, "examples", "r28_manual_quote_observation_decision.example.json");

const GATE_DOC = "docs/R28_MANUAL_QUOTE_OBSERVATION_DECISION_SESSION.md";

const OPERATOR_DECISIONS = new Set([
  "HOLD",
  "APPROVE_OBSERVATION_ONLY",
  "RETURN_TO_R7B",
  "BLOCK"
]);

const ACK_FIELDS = [
  "quoteObservationNotTradingAcknowledged",
  "noWalletAcknowledged",
  "noSigningAcknowledged",
  "noSubmissionAcknowledged",
  "noPrivateKeysAcknowledged",
  "providerCostAcknowledged",
  "rateLimitsAcknowledged",
  "quoteDataLimitationsAcknowledged",
  "slippageMevUnprovenAcknowledged",
  "liveTradingNotApprovedAcknowledged",
  "microLiveNotApprovedAcknowledged"
];

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
    const isAckField = prefix === "acknowledgements" && ACK_FIELDS.includes(key);
    if (!isAckField && SECRET_FIELD_PATTERN.test(key)) hits.push(pathKey);
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

function getAcknowledgements(decision) {
  return (decision && decision.acknowledgements) || {};
}

function allAcknowledgementsComplete(decision) {
  const acks = getAcknowledgements(decision);
  return ACK_FIELDS.every((field) => acks[field] === true);
}

function validateDecisionRecord(decision) {
  const issues = [];
  if (!decision || typeof decision !== "object") {
    return { valid: false, issues: ["decision record missing or invalid"] };
  }

  const secretHits = findSecretLikeFields(decision);
  if (secretHits.length > 0) {
    issues.push(`secret-like fields: ${secretHits.join(", ")}`);
  }

  const operatorDecision = decision.operatorDecision || "HOLD";
  if (!OPERATOR_DECISIONS.has(operatorDecision)) {
    issues.push(`unknown operatorDecision: ${operatorDecision}`);
  }

  const forbiddenTrue = [
    "tradingAllowed",
    "signingAllowed",
    "submissionAllowed",
    "walletRequired",
    "liveTradingApproved",
    "microLiveApproved"
  ].filter((field) => decision[field] === true);
  if (forbiddenTrue.length > 0) {
    issues.push(`forbidden fields true: ${forbiddenTrue.join(", ")}`);
  }

  if (decision.approved === true) {
    issues.push("approved true forbidden");
  }

  const acksComplete = allAcknowledgementsComplete(decision);

  if (decision.quoteObservationApproved === true && !acksComplete) {
    issues.push("quoteObservationApproved true requires all acknowledgements");
  }

  if (
    decision.networkPollingAllowed === true &&
    operatorDecision !== "APPROVE_OBSERVATION_ONLY"
  ) {
    issues.push("networkPollingAllowed true forbidden unless APPROVE_OBSERVATION_ONLY");
  }

  if (operatorDecision === "APPROVE_OBSERVATION_ONLY") {
    if (!acksComplete) {
      issues.push("APPROVE_OBSERVATION_ONLY requires all acknowledgements");
    }
    if (decision.quoteObservationApproved === true) {
      issues.push("quoteObservationApproved must remain false in R28");
    }
  }

  const decisionStatus = decision.decisionStatus || "NOT_DECIDED";
  const defaultHold =
    (decisionStatus === "NOT_DECIDED" || decisionStatus === "NOT DECIDED") &&
    operatorDecision === "HOLD";

  return {
    valid: issues.length === 0,
    issues,
    operatorDecision,
    decisionStatus,
    defaultHold,
    acksComplete,
    reviewableObservationOnly:
      operatorDecision === "APPROVE_OBSERVATION_ONLY" &&
      acksComplete &&
      issues.length === 0
  };
}

function deriveDecisionSessionStatus(context) {
  if (
    !context.gateDocPresent ||
    context.decisionStatus === "missing" ||
    context.decisionStatus === "corrupt" ||
    context.networkPollingActive ||
    context.posture.liveArmed === true ||
    context.posture.dryRunMode === false ||
    context.posture.emergencyStop === true ||
    !context.recoveryAbsent ||
    !isSafeObservationPosture(context.posture) ||
    (context.decisionValidation && !context.decisionValidation.valid)
  ) {
    return {
      sessionStatus: "BLOCKED",
      reason: "Missing doc/example, unsafe posture, polling active, or invalid decision record."
    };
  }

  const decision = context.decision || {};
  const operatorDecision = context.decisionValidation.operatorDecision;

  if (operatorDecision === "HOLD") {
    return {
      sessionStatus: "HOLD",
      reason: "Operator decision HOLD — quote observation remains off."
    };
  }

  if (operatorDecision === "RETURN_TO_R7B") {
    return {
      sessionStatus: "RETURN_TO_R7B",
      reason: "Operator chose RETURN_TO_R7B — continue paper/data collection."
    };
  }

  if (operatorDecision === "BLOCK") {
    return {
      sessionStatus: "BLOCKED",
      reason: "Operator chose BLOCK — quote observation path stopped."
    };
  }

  if (
    operatorDecision === "APPROVE_OBSERVATION_ONLY" &&
    context.decisionValidation.reviewableObservationOnly
  ) {
    return {
      sessionStatus: "REVIEWABLE_OBSERVATION_ONLY_DECISION",
      reason: "Reviewable observation-only decision — R29 implementation still required; polling NOT active."
    };
  }

  if (context.gateDocPresent && context.decisionValidation.defaultHold) {
    return {
      sessionStatus: "DECISION_SESSION_DEFINED_NOT_APPROVED",
      reason: "Decision session defined — default HOLD / NOT_DECIDED; polling NOT active."
    };
  }

  return {
    sessionStatus: "DECISION_SESSION_DEFINED_NOT_APPROVED",
    reason: "Manual quote observation decision session defined — NOT APPROVED."
  };
}

function collectR28ManualQuoteObservationDecisionStatus(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;

  const posture = readPosture(runtimeRoot);
  const recoveryAbsent = !fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"));
  const gateDocPresent = options.gateDocPresent !== undefined
    ? options.gateDocPresent === true
    : docExists(repoRoot, GATE_DOC);

  let decisionLoad;
  if (options.decisionRecord && typeof options.decisionRecord === "object") {
    decisionLoad = { status: "present", data: options.decisionRecord };
  } else {
    const decisionPath = options.decisionFile || DEFAULT_DECISION_FILE;
    decisionLoad = readJsonIfPresent(decisionPath);
  }

  const decisionValidation = decisionLoad.status === "present"
    ? validateDecisionRecord(decisionLoad.data)
    : null;

  const networkPollingActive = detectNetworkPollingActive(repoRoot, options);

  const context = {
    gateDocPresent,
    decisionStatus: decisionLoad.status,
    decision: decisionLoad.data,
    decisionValidation,
    posture,
    recoveryAbsent,
    networkPollingActive
  };

  const gate = deriveDecisionSessionStatus(context);

  const blockers = [];
  if (!gateDocPresent) blockers.push("R28 doc missing");
  if (decisionLoad.status === "missing") blockers.push("R28 decision example missing");
  if (networkPollingActive) blockers.push("network polling active — forbidden");
  if (decisionValidation && !decisionValidation.valid) blockers.push(...decisionValidation.issues);
  if (posture.liveArmed === true) blockers.push("liveArmed true");
  if (posture.dryRunMode === false) blockers.push("dryRunMode false");
  if (!recoveryAbsent) blockers.push("recovery_actions.jsonl present");
  blockers.push("quote polling not activated");
  blockers.push("shadow execution not active");
  blockers.push("operator decision not approved for activation");

  return {
    timestamp: new Date().toISOString(),
    review: "R28-manual-quote-observation-decision-session",
    liveTradingApproved: false,
    microLiveApproved: false,
    approved: false,
    quotePollingActive: false,
    shadowExecutionActive: false,
    capitalAtRiskUsd: 0,
    posture,
    recoveryActionsJsonl: { exists: !recoveryAbsent },
    gateDocPresent,
    decisionRecord: {
      source: options.decisionRecord ? "(inline fixture)" : DEFAULT_DECISION_FILE,
      status: decisionLoad.status,
      validation: decisionValidation
    },
    operatorDecisionOptions: [...OPERATOR_DECISIONS],
    approvalLimits: {
      note: "Future APPROVE_OBSERVATION_ONLY only — R29 still required",
      maxQuotesPerTokenPerMinute: 3,
      maxTokensPerCycle: 5,
      maxQuotesPerDay: 100,
      cooldownSeconds: 5
    },
    evaluation: {
      verdict: "MANUAL QUOTE OBSERVATION DECISION SESSION DEFINED — NOT APPROVED",
      sessionStatus: gate.sessionStatus,
      reason: gate.reason,
      approved: false
    },
    blockers: [...new Set(blockers)],
    recommendedNextGate:
      gate.sessionStatus === "REVIEWABLE_OBSERVATION_ONLY_DECISION"
        ? "R29 Real Quote Observation Activation Implementation (observation-only, no trading)"
        : "Continue R7b; do not activate quote polling; do not connect wallet; do not arm live"
  };
}

function printSummary(status) {
  console.log("[r28-decision] Manual Quote Observation Decision Session (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  session status: ${status.evaluation.sessionStatus}`);
  console.log(`  approved: false`);
  console.log(`  quote polling active: false`);
  console.log(`  operator decision: ${status.decisionRecord.validation?.operatorDecision || "unknown"}`);
  console.log(`  blockers: ${status.blockers.length}`);
}

function writeStatus(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runR28ManualQuoteObservationDecisionCheck(options = {}) {
  const status = collectR28ManualQuoteObservationDecisionStatus(options);
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
    const result = runR28ManualQuoteObservationDecisionCheck();
    if (result.outputFile) {
      console.log(`  status: ${result.outputFile}`);
    }
  } catch (err) {
    console.error("[r28-decision] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOC,
  DEFAULT_DECISION_FILE,
  OUTPUT_FILE,
  OPERATOR_DECISIONS,
  ACK_FIELDS,
  readPosture,
  detectNetworkPollingActive,
  validateDecisionRecord,
  deriveDecisionSessionStatus,
  collectR28ManualQuoteObservationDecisionStatus,
  runR28ManualQuoteObservationDecisionCheck,
  writeStatus
};
