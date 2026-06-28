"use strict";

// r21_real_quote_observation_approval_check.js — Sprint 4 R21
// Read-only real quote observation approval gate status. Writes analysis/ only.
// Does NOT activate network polling, sign, submit, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R21_OUTPUT_DIR
  ? path.resolve(process.env.R21_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r21_real_quote_observation_approval_status.json");
const DEFAULT_RECORD_FILE = path.join(OUTPUT_DIR, "r21_quote_observation_approval_record.json");
const EXAMPLE_RECORD_FILE = path.join(ROOT, "examples", "r21_quote_observation_approval_record.example.json");

const GATE_DOCS = {
  r18: "docs/R18_SHADOW_QUOTE_DESIGN_REVIEW.md",
  r19: "docs/R19_SHADOW_QUOTE_COLLECTION_PLAN.md",
  r20: "docs/R20_FIXTURE_DRY_RUN_SHADOW_QUOTE_COLLECTOR.md",
  r21: "docs/R21_REAL_QUOTE_OBSERVATION_APPROVAL_GATE.md"
};

const ARTIFACTS = {
  r18Harness: "r18_shadow_quote_review.js",
  r20Collector: "r20_shadow_quote_collector.js",
  r20Fixtures: "examples/shadow_quote_candidates.example.json"
};

const QUOTE_OBSERVATION_LIMITS = {
  note: "Draft approval terms only — NOT active config",
  maxQuotesPerTokenPerMinute: 3,
  maxTokensPerCycle: 5,
  maxQuotesPerDay: 100,
  cooldownSeconds: 5
};

const PROVIDER_POLICY = {
  jupiterQuoteProvider: { active: false, requiresApproval: true },
  gmgnQuoteLikeProvider: { active: false, requiresApproval: true },
  localFixtureProvider: { active: true, scope: "FIXTURE_ONLY" },
  replayProvider: { active: false, requiresApproval: true }
};

const FORBIDDEN_APPROVAL_FIELDS = [
  "tradingAllowed",
  "signingAllowed",
  "submissionAllowed",
  "walletRequired"
];

const REVIEW_ACK_FIELDS = [
  "stopConditionsAcknowledged",
  "noWalletAcknowledged",
  "noSigningAcknowledged",
  "noSubmissionAcknowledged",
  "rateLimitAcknowledged",
  "costAcknowledged"
];

const SECRET_FIELD_PATTERN = /private[_-]?key|secret|seed|mnemonic|signer[_-]?secret|passphrase|api[_-]?key/i;

function docExists(repoRoot, rel) {
  return fs.existsSync(path.join(repoRoot, rel));
}

function artifactExists(repoRoot, rel) {
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

function loadApprovalRecord(options = {}) {
  if (options.approvalRecord && typeof options.approvalRecord === "object") {
    return { status: "present", data: options.approvalRecord, source: "(inline fixture)" };
  }
  const recordPath = options.approvalRecordFile || DEFAULT_RECORD_FILE;
  const loaded = readJsonIfPresent(recordPath);
  return { ...loaded, source: recordPath };
}

function validateApprovalRecord(record) {
  const issues = [];
  if (!record || typeof record !== "object") {
    return { valid: false, reviewable: false, forbiddenFields: [], issues: ["approval record missing or invalid"] };
  }

  const secretHits = findSecretLikeFields(record);
  if (secretHits.length > 0) {
    issues.push(`secret-like fields: ${secretHits.join(", ")}`);
  }

  const forbiddenFields = FORBIDDEN_APPROVAL_FIELDS.filter((field) => record[field] === true);
  if (forbiddenFields.length > 0) {
    issues.push(`forbidden approval fields true: ${forbiddenFields.join(", ")}`);
  }

  if (record.quoteObservationMode !== true) {
    issues.push("quoteObservationMode must be true for quote observation scope");
  }
  if (record.networkPollingAllowed !== true) {
    issues.push("networkPollingAllowed must be true for future polling approval scope");
  }

  const approvalStatus = record.approvalStatus || "NOT_APPROVED";
  const defaultNotApproved = approvalStatus === "NOT_APPROVED" || approvalStatus === "NOT APPROVED";

  const acksComplete = REVIEW_ACK_FIELDS.every((field) => record[field] === true);
  const limitsPresent =
    typeof record.maxQuotesPerTokenPerMinute === "number" &&
    typeof record.maxTokensPerCycle === "number" &&
    typeof record.maxQuotesPerDay === "number" &&
    typeof record.cooldownSeconds === "number";

  const reviewable =
    forbiddenFields.length === 0 &&
    secretHits.length === 0 &&
    record.quoteObservationMode === true &&
    record.networkPollingAllowed === true &&
    limitsPresent &&
    Array.isArray(record.allowedProviders) &&
    Array.isArray(record.allowedCandidateSources) &&
    acksComplete &&
    defaultNotApproved;

  return {
    valid: forbiddenFields.length === 0 && secretHits.length === 0,
    reviewable,
    forbiddenFields,
    secretHits,
    defaultNotApproved,
    approvalStatus,
    issues
  };
}

function deriveApprovalGateStatus(context) {
  if (
    !context.gateDocs.r18 ||
    !context.gateDocs.r19 ||
    !context.gateDocs.r20 ||
    !context.gateDocs.r21 ||
    !context.r20CollectorPresent ||
    !context.r20FixturesPresent ||
    context.networkPollingActive ||
    context.posture.liveArmed === true ||
    context.posture.dryRunMode === false ||
    context.posture.emergencyStop === true ||
    !context.recoveryAbsent ||
    context.safetySuiteGreen === false ||
    context.approvalRecordStatus === "corrupt" ||
    (context.requireApprovalRecord && context.approvalRecordStatus === "missing") ||
    (context.approvalValidation && context.approvalValidation.forbiddenFields.length > 0) ||
    (context.approvalValidation && context.approvalValidation.secretHits.length > 0)
  ) {
    return {
      gateStatus: "BLOCKED",
      reason: "Missing docs/artifacts, unsafe posture, recovery present, polling active, or invalid approval record."
    };
  }

  if (context.approvalValidation && context.approvalValidation.reviewable) {
    return {
      gateStatus: "REVIEWABLE_ONLY",
      reason: "Reviewable quote observation approval record present — operator signature/approval still required; polling NOT active."
    };
  }

  if (context.approvalRecordStatus === "present" && context.approvalValidation && context.approvalValidation.defaultNotApproved) {
    return {
      gateStatus: "NOT_APPROVED",
      reason: "Approval record present with default NOT_APPROVED status — network polling NOT active."
    };
  }

  if (
    context.gateDocs.r18 &&
    context.gateDocs.r19 &&
    context.gateDocs.r20 &&
    context.gateDocs.r21 &&
    context.r20CollectorPresent &&
    isSafeObservationPosture(context.posture) &&
    context.recoveryAbsent &&
    !context.networkPollingActive
  ) {
    return {
      gateStatus: "APPROVAL_GATE_DEFINED",
      reason: "R21 approval gate defined; prerequisites complete — operator approval record required before polling."
    };
  }

  return {
    gateStatus: "NOT_APPROVED",
    reason: "Real quote observation not approved — polling NOT active."
  };
}

function collectR21RealQuoteObservationApprovalStatus(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;

  const posture = readPosture(runtimeRoot);
  const recoveryAbsent = !fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"));

  const gateDocs = options.gateDocs || {
    r18: docExists(repoRoot, GATE_DOCS.r18),
    r19: docExists(repoRoot, GATE_DOCS.r19),
    r20: docExists(repoRoot, GATE_DOCS.r20),
    r21: docExists(repoRoot, GATE_DOCS.r21)
  };

  const r18HarnessPresent = options.r18HarnessPresent !== false &&
    artifactExists(repoRoot, ARTIFACTS.r18Harness);
  const r20CollectorPresent = options.r20CollectorPresent !== false &&
    artifactExists(repoRoot, ARTIFACTS.r20Collector);
  const r20FixturesPresent = options.r20FixturesPresent !== false &&
    artifactExists(repoRoot, ARTIFACTS.r20Fixtures);

  const networkPollingActive = detectNetworkPollingActive(repoRoot, options);

  const safetySuiteGreen = options.safetySuiteGreen !== undefined
    ? options.safetySuiteGreen === true
    : null;

  const approvalLoad = loadApprovalRecord(options);
  const approvalValidation = approvalLoad.status === "present"
    ? validateApprovalRecord(approvalLoad.data)
    : null;

  const context = {
    posture,
    recoveryAbsent,
    gateDocs,
    r18HarnessPresent,
    r20CollectorPresent,
    r20FixturesPresent,
    networkPollingActive,
    safetySuiteGreen,
    approvalRecordStatus: approvalLoad.status,
    approvalValidation,
    requireApprovalRecord: options.requireApprovalRecord === true
  };

  const gate = deriveApprovalGateStatus(context);

  const blockers = [];
  if (!gateDocs.r18) blockers.push("R18 doc missing");
  if (!gateDocs.r19) blockers.push("R19 doc missing");
  if (!gateDocs.r20) blockers.push("R20 doc missing");
  if (!gateDocs.r21) blockers.push("R21 doc missing");
  if (!r20CollectorPresent) blockers.push("R20 collector missing");
  if (!r20FixturesPresent) blockers.push("R20 candidate fixtures missing");
  if (networkPollingActive) blockers.push("network polling flag active — forbidden");
  if (posture.liveArmed === true) blockers.push("liveArmed true");
  if (posture.dryRunMode === false) blockers.push("dryRunMode false");
  if (posture.emergencyStop === true) blockers.push("emergencyStop true");
  if (!recoveryAbsent) blockers.push("recovery_actions.jsonl present");
  if (safetySuiteGreen === false) blockers.push("safety suite not green");
  if (approvalLoad.status === "missing") blockers.push("approval record not created");
  if (approvalLoad.status === "corrupt") blockers.push("approval record corrupt");
  if (approvalValidation && approvalValidation.forbiddenFields.length > 0) {
    blockers.push(`forbidden approval fields: ${approvalValidation.forbiddenFields.join(", ")}`);
  }
  if (approvalValidation && approvalValidation.secretHits.length > 0) {
    blockers.push("approval record contains secret-like fields");
  }
  blockers.push("real quote polling not activated");
  blockers.push("network provider not implemented (R22)");
  blockers.push("operator quote observation approval not granted");

  return {
    timestamp: new Date().toISOString(),
    review: "R21-real-quote-observation-approval-gate",
    liveTradingApproved: false,
    microLiveApproved: false,
    approved: false,
    quotePollingActive: false,
    capitalAtRiskUsd: 0,
    posture,
    recoveryActionsJsonl: { exists: !recoveryAbsent },
    gateDocs,
    artifacts: {
      r18Harness: r18HarnessPresent,
      r20Collector: r20CollectorPresent,
      r20Fixtures: r20FixturesPresent
    },
    networkPollingActive,
    approvalRecord: {
      source: approvalLoad.source || DEFAULT_RECORD_FILE,
      status: approvalLoad.status,
      exampleFile: EXAMPLE_RECORD_FILE,
      validation: approvalValidation
    },
    quoteObservationLimits: QUOTE_OBSERVATION_LIMITS,
    providerPolicy: PROVIDER_POLICY,
    observationScope: {
      quoteObservationOnly: true,
      tradingAllowed: false,
      signingAllowed: false,
      submissionAllowed: false,
      walletRequired: false,
      privateKeyRequired: false,
      transactionConstruction: false,
      liveConfigMutation: false,
      networkCalls: false
    },
    futureOutputs: {
      observationsJsonl: "analysis/real_quote_observations.jsonl",
      statusJson: "analysis/r21_quote_observation_status.json"
    },
    evaluation: {
      verdict: "REAL QUOTE OBSERVATION APPROVAL GATE DEFINED — POLLING NOT ACTIVE",
      gateStatus: gate.gateStatus,
      reason: gate.reason,
      approved: false
    },
    blockers: [...new Set(blockers)],
    recommendedNextGate:
      "Build R22 Real Quote Observation Collector (disabled by default); continue R7b; do not connect wallet; do not arm live; do not sign or submit"
  };
}

function printSummary(status) {
  console.log("[r21-approval] Real Quote Observation Approval Gate (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  gate status: ${status.evaluation.gateStatus}`);
  console.log(`  quote polling active: false`);
  console.log(`  approved: false`);
  console.log(`  approval record: ${status.approvalRecord.status}`);
  console.log(`  blockers: ${status.blockers.length}`);
}

function writeStatus(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runR21RealQuoteObservationApprovalCheck(options = {}) {
  const status = collectR21RealQuoteObservationApprovalStatus(options);
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
    const result = runR21RealQuoteObservationApprovalCheck();
    if (result.outputFile) {
      console.log(`  status: ${result.outputFile}`);
    }
  } catch (err) {
    console.error("[r21-approval] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOCS,
  ARTIFACTS,
  QUOTE_OBSERVATION_LIMITS,
  PROVIDER_POLICY,
  OUTPUT_FILE,
  DEFAULT_RECORD_FILE,
  EXAMPLE_RECORD_FILE,
  readPosture,
  detectNetworkPollingActive,
  validateApprovalRecord,
  deriveApprovalGateStatus,
  collectR21RealQuoteObservationApprovalStatus,
  runR21RealQuoteObservationApprovalCheck,
  writeStatus
};
