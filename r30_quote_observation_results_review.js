"use strict";

// r30_quote_observation_results_review.js — Sprint 4 R30
// Read-only review of R29 real quote observation results. Writes analysis/ only.
// Does NOT activate polling, trade, sign, submit, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const r18 = require("./r18_shadow_quote_review");

const ROOT = review.ROOT;
const OUTPUT_DIR = process.env.R30_OUTPUT_DIR
  ? path.resolve(process.env.R30_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r30_quote_observation_results_review.json");
const DEFAULT_STATUS_FILE = path.join(OUTPUT_DIR, "r29_real_quote_observation_status.json");
const DEFAULT_OBSERVATIONS_FILE = path.join(OUTPUT_DIR, "real_quote_observations.jsonl");
const GATE_DOC = "docs/R30_REAL_QUOTE_OBSERVATION_RESULTS_REVIEW.md";

const SCHEMA_VERSION = 1;
const POLICY = r18.SHADOW_QUOTE_POLICY;
const SECRET_FIELD_PATTERN = /private[_-]?key|secret|seed|mnemonic|signer[_-]?secret|passphrase|api[_-]?key|wallet[_-]?private/i;

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

function loadObservationsJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
    return { status: "missing", observations: [], errors: ["observations file missing"] };
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) {
    return { status: "empty", observations: [], errors: [] };
  }

  const observations = [];
  const errors = [];
  for (let i = 0; i < lines.length; i += 1) {
    try {
      observations.push(JSON.parse(lines[i]));
    } catch (err) {
      errors.push(`line ${i + 1}: ${err && err.message ? err.message : String(err)}`);
    }
  }

  if (errors.length > 0) {
    return { status: "corrupt", observations, errors };
  }
  return { status: "present", observations, errors: [] };
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

function validateObservationRecord(record, index) {
  const issues = [];
  if (!record || typeof record !== "object") {
    return { valid: false, issues: [`observation ${index}: missing or invalid`] };
  }

  const secretHits = findSecretLikeFields(record);
  if (secretHits.length > 0) {
    issues.push(`observation ${index}: secret-like fields: ${secretHits.join(", ")}`);
  }

  if (record.approved === true) issues.push(`observation ${index}: approved true forbidden`);
  if (record.tradingAllowed === true) issues.push(`observation ${index}: tradingAllowed true forbidden`);
  if (record.signingAllowed === true) issues.push(`observation ${index}: signingAllowed true forbidden`);
  if (record.submissionAllowed === true) issues.push(`observation ${index}: submissionAllowed true forbidden`);
  if (record.walletRequired === true) issues.push(`observation ${index}: walletRequired true forbidden`);

  return { valid: issues.length === 0, issues, record };
}

function summarizeRejectionReasons(observations) {
  const counts = {};
  for (const obs of observations) {
    const reasons = Array.isArray(obs.rejectionReasons) ? obs.rejectionReasons : [];
    for (const reason of reasons) {
      counts[reason] = (counts[reason] || 0) + 1;
    }
  }
  return counts;
}

function detectSlippageAbovePolicy(observations) {
  const cap = POLICY.manualExceptionSlippageCapBps;
  return observations.filter((obs) => {
    const slippageBps = Number(obs.requestedSlippageBps ?? obs.slippageBps);
    return Number.isFinite(slippageBps) && slippageBps > cap;
  });
}

function deriveReviewStatus(context) {
  if (context.statusLoad.status === "missing" || context.statusLoad.status === "corrupt") {
    return {
      reviewStatus: "BLOCKED",
      reason: "R29 observation status missing or corrupt."
    };
  }

  if (context.observationsLoad.status === "missing") {
    return {
      reviewStatus: "NO_OBSERVATIONS_FOUND",
      reason: "Real quote observations file missing."
    };
  }

  if (context.observationsLoad.status === "corrupt") {
    return {
      reviewStatus: "INVALID_OBSERVATION_RECORD",
      reason: context.observationsLoad.errors.join("; ")
    };
  }

  if (context.observationsLoad.status === "empty" || context.observations.length === 0) {
    return {
      reviewStatus: "NO_OBSERVATIONS_FOUND",
      reason: "No observation records found."
    };
  }

  if (context.invalidRecords.length > 0) {
    return {
      reviewStatus: "INVALID_OBSERVATION_RECORD",
      reason: context.invalidRecords.join("; ")
    };
  }

  if (context.rejectCount > 0) {
    return {
      reviewStatus: "REVIEW_COMPLETE_ROUTE_REJECTED",
      reason: "One or more observations rejected by policy."
    };
  }

  return {
    reviewStatus: "REVIEW_COMPLETE_ACCEPTABLE_OBSERVATION",
    reason: "Observations passed or warned without rejection."
  };
}

function collectR30QuoteObservationResultsReview(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const statusFile = options.statusFile || DEFAULT_STATUS_FILE;
  const observationsFile = options.observationsFile || DEFAULT_OBSERVATIONS_FILE;
  const gateDocPresent = options.gateDocPresent !== undefined
    ? options.gateDocPresent === true
    : fs.existsSync(path.join(options.repoRoot || ROOT, GATE_DOC));

  let statusLoad;
  if (options.statusData && typeof options.statusData === "object") {
    statusLoad = { status: "present", data: options.statusData };
  } else {
    statusLoad = readJsonIfPresent(statusFile);
  }

  let observationsLoad;
  if (Array.isArray(options.observations)) {
    observationsLoad = { status: "present", observations: options.observations, errors: [] };
  } else {
    observationsLoad = loadObservationsJsonl(observationsFile);
  }

  const validations = (observationsLoad.observations || []).map((record, index) =>
    validateObservationRecord(record, index + 1)
  );
  const invalidRecords = validations.filter((v) => !v.valid).flatMap((v) => v.issues);
  const observations = observationsLoad.observations || [];

  const passCount = observations.filter((o) => o.gateVerdict === r18.DECISION.PASS).length;
  const warnCount = observations.filter((o) => o.gateVerdict === r18.DECISION.WARN).length;
  const rejectCount = observations.filter((o) => o.gateVerdict === r18.DECISION.REJECT).length;
  const slippageAbovePolicy = detectSlippageAbovePolicy(observations);
  const rejectionReasonSummary = summarizeRejectionReasons(observations);

  const context = {
    statusLoad,
    observationsLoad,
    observations,
    invalidRecords,
    passCount,
    warnCount,
    rejectCount
  };

  const gate = deriveReviewStatus(context);

  const lessonsLearned = [
    "R29a endpoint migration succeeded",
    "DNS/connectivity succeeded for lite Jupiter quote base",
    "Fake fixture mints fail HTTP 400; real mints work",
    "Provider normalization produced valid output",
    "Observation file written to analysis/",
    "Rejection logic worked; approved remained false",
    "No wallet, signing, or submission occurred"
  ];

  return {
    timestamp: new Date().toISOString(),
    review: "R30-quote-observation-results-review",
    schemaVersion: SCHEMA_VERSION,
    gateDocPresent,
    approved: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    capitalAtRiskUsd: 0,
    sources: {
      statusFile: options.statusData ? "(inline fixture)" : statusFile,
      observationsFile: Array.isArray(options.observations) ? "(inline fixture)" : observationsFile
    },
    statusSummary: statusLoad.status === "present" ? {
      observerStatus: statusLoad.data.observerStatus || null,
      observationCount: statusLoad.data.observationCount ?? null,
      passCount: statusLoad.data.passCount ?? null,
      warnCount: statusLoad.data.warnCount ?? null,
      rejectCount: statusLoad.data.rejectCount ?? null,
      approved: statusLoad.data.approved === true ? true : false,
      tradingAllowed: statusLoad.data.tradingAllowed === true ? true : false
    } : null,
    observationSummary: {
      total: observations.length,
      passCount,
      warnCount,
      rejectCount,
      slippageAbovePolicyCount: slippageAbovePolicy.length,
      slippagePolicyCapBps: POLICY.manualExceptionSlippageCapBps,
      rejectionReasonSummary
    },
    rejectedRoutes: observations
      .filter((o) => o.gateVerdict === r18.DECISION.REJECT)
      .map((o) => ({
        candidateId: o.candidateId || null,
        routeSummary: o.routeSummary || null,
        slippageBps: o.slippageBps ?? null,
        gateVerdict: o.gateVerdict,
        rejectionReasons: o.rejectionReasons || []
      })),
    slippageAbovePolicy: slippageAbovePolicy.map((o) => ({
      candidateId: o.candidateId || null,
      slippageBps: o.slippageBps ?? null,
      rejectionReasons: o.rejectionReasons || []
    })),
    lessonsLearned,
    followUpNeeds: [
      "Add real-mint manual candidate examples for observation testing",
      "Distinguish configured slippage tolerance from measured/allowed slippage policy",
      "Consider safer default observation slippage request such as 100 bps",
      "Improve HTTP 400 diagnostics with safe non-secret provider error body",
      "Add route/output checks for quote quality",
      "Clarify whether slippageBps in output is requested tolerance or actual route slippage",
      "Continue R7b in background"
    ],
    shadowExecutionBlockers: [
      "Multiple real observations must pass or warn without rejection",
      "Quote response fields must be correctly interpreted",
      "Slippage policy must be confirmed",
      "Minimum output calculation must be verified",
      "Route summary normalization must be stable",
      "Provider error diagnostics must be improved",
      "Safety suite must remain green"
    ],
    evaluation: {
      verdict: "FIRST REAL QUOTE OBSERVATION REVIEWED — ROUTE REJECTED BY POLICY",
      reviewStatus: gate.reviewStatus,
      reason: gate.reason,
      approved: false
    },
    blockers: [
      "live trading not approved",
      "micro-live not approved",
      "continuous polling not activated",
      "no wallet connection",
      "no signing",
      "no submission"
    ],
    recommendedNextGate: "R31-R32 Quote Observation Hardening + Additional Observation Batch Plan"
  };
}

function writeReview(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[r30-review] Real Quote Observation Results Review (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  review status: ${status.evaluation.reviewStatus}`);
  console.log(`  approved: false`);
  console.log(`  observations: ${status.observationSummary.total} pass=${status.observationSummary.passCount} warn=${status.observationSummary.warnCount} reject=${status.observationSummary.rejectCount}`);
  if (Object.keys(status.observationSummary.rejectionReasonSummary).length > 0) {
    console.log(`  rejection reasons: ${JSON.stringify(status.observationSummary.rejectionReasonSummary)}`);
  }
}

function runR30QuoteObservationResultsReview(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const outputFile = options.outputFile || path.join(analysisDir, "r30_quote_observation_results_review.json");
  const status = collectR30QuoteObservationResultsReview({
    ...options,
    analysisDir
  });

  if (options.writeOutput !== false) {
    writeReview(status, outputFile);
  }

  if (options.print !== false) {
    printSummary(status);
  }

  return { status, outputFile: options.writeOutput !== false ? outputFile : null };
}

if (require.main === module) {
  try {
    const result = runR30QuoteObservationResultsReview();
    if (result.outputFile) console.log(`  output: ${result.outputFile}`);
  } catch (err) {
    console.error("[r30-review] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  SCHEMA_VERSION,
  GATE_DOC,
  OUTPUT_FILE,
  DEFAULT_STATUS_FILE,
  DEFAULT_OBSERVATIONS_FILE,
  loadObservationsJsonl,
  validateObservationRecord,
  deriveReviewStatus,
  collectR30QuoteObservationResultsReview,
  writeReview,
  runR30QuoteObservationResultsReview
};
