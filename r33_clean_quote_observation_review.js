"use strict";

// r33_clean_quote_observation_review.js — Sprint 4 R33
// Read-only clean quote observation review + schema v2 validation. Writes analysis/ only.
// Does NOT activate polling, trade, sign, submit, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const r18 = require("./r18_shadow_quote_review");
const r29 = require("./r29_real_quote_observer");

const ROOT = review.ROOT;
const OUTPUT_DIR = process.env.R33_OUTPUT_DIR
  ? path.resolve(process.env.R33_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r33_clean_quote_observation_review.json");
const DEFAULT_STATUS_FILE = path.join(OUTPUT_DIR, "r29_real_quote_observation_status.json");
const DEFAULT_OBSERVATIONS_FILE = path.join(OUTPUT_DIR, "real_quote_observations.jsonl");
const GATE_DOC = "docs/R33_CLEAN_QUOTE_OBSERVATION_REVIEW.md";

const SCHEMA_VERSION = 1;
const SCHEMA_V2_VERSION = r29.OBSERVATION_SCHEMA_VERSION;
const SLIPPAGE_INTERPRETATION = r29.SLIPPAGE_INTERPRETATION;
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

function isSchemaV2(record) {
  if (!record || typeof record !== "object") return false;
  if (record.observationSchemaVersion === SCHEMA_V2_VERSION) return true;
  return (
    record.requestedSlippageBps !== undefined &&
    record.slippageInterpretation === SLIPPAGE_INTERPRETATION &&
    record.realizedSlippageBps === null
  );
}

function isLegacyV1(record) {
  return !isSchemaV2(record);
}

function validateSchemaV2Record(record, index) {
  const issues = [];
  if (!record || typeof record !== "object") {
    return { valid: false, issues: [`schema v2 observation ${index}: missing or invalid`] };
  }

  const secretHits = findSecretLikeFields(record);
  if (secretHits.length > 0) {
    issues.push(`schema v2 observation ${index}: secret-like fields: ${secretHits.join(", ")}`);
  }

  if (record.requestedSlippageBps === undefined) {
    issues.push(`schema v2 observation ${index}: missing requestedSlippageBps`);
  }
  if (record.realizedSlippageBps !== null) {
    issues.push(`schema v2 observation ${index}: realizedSlippageBps must be null`);
  }
  if (record.slippageInterpretation !== SLIPPAGE_INTERPRETATION) {
    issues.push(`schema v2 observation ${index}: slippageInterpretation must be REQUESTED_TOLERANCE_NOT_REALIZED`);
  }
  if (record.approved === true) issues.push(`schema v2 observation ${index}: approved true forbidden`);
  if (record.tradingAllowed === true) issues.push(`schema v2 observation ${index}: tradingAllowed true forbidden`);
  if (record.signingAllowed === true) issues.push(`schema v2 observation ${index}: signingAllowed true forbidden`);
  if (record.submissionAllowed === true) issues.push(`schema v2 observation ${index}: submissionAllowed true forbidden`);
  if (record.walletRequired === true) issues.push(`schema v2 observation ${index}: walletRequired true forbidden`);

  return { valid: issues.length === 0, issues, record };
}

function countByVerdict(observations) {
  return {
    total: observations.length,
    passCount: observations.filter((o) => o.gateVerdict === r18.DECISION.PASS).length,
    warnCount: observations.filter((o) => o.gateVerdict === r18.DECISION.WARN).length,
    rejectCount: observations.filter((o) => o.gateVerdict === r18.DECISION.REJECT).length
  };
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
      reviewStatus: "BLOCKED",
      reason: "Real quote observations file missing."
    };
  }

  if (context.observationsLoad.status === "corrupt") {
    return {
      reviewStatus: "INVALID_OBSERVATION_RECORD",
      reason: context.observationsLoad.errors.join("; ")
    };
  }

  if (context.observationsLoad.status === "empty" || context.allObservations.length === 0) {
    return {
      reviewStatus: "BLOCKED",
      reason: "No observation records found."
    };
  }

  if (context.schemaV2Observations.length === 0) {
    return {
      reviewStatus: "LEGACY_ONLY_NO_SCHEMA_V2",
      reason: "Only legacy schema v1 observations present — no schema v2 records for policy review."
    };
  }

  if (context.invalidSchemaV2Records.length > 0) {
    return {
      reviewStatus: "INVALID_OBSERVATION_RECORD",
      reason: context.invalidSchemaV2Records.join("; ")
    };
  }

  if (context.schemaV2Summary.rejectCount > 0) {
    return {
      reviewStatus: "SCHEMA_V2_OBSERVATION_REJECTED",
      reason: "One or more schema v2 observations rejected by policy."
    };
  }

  if (context.schemaV2Summary.passCount > 0) {
    return {
      reviewStatus: "CLEAN_SCHEMA_V2_OBSERVATION_PASS",
      reason: "Schema v2 observation(s) passed policy without rejection."
    };
  }

  return {
    reviewStatus: "BLOCKED",
    reason: "Schema v2 observations present but no PASS verdict found."
  };
}

function collectR33CleanQuoteObservationReview(options = {}) {
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

  const allObservations = observationsLoad.observations || [];
  const schemaV2Observations = allObservations.filter(isSchemaV2);
  const legacyV1Observations = allObservations.filter(isLegacyV1);

  const schemaV2Validations = schemaV2Observations.map((record, index) =>
    validateSchemaV2Record(record, index + 1)
  );
  const invalidSchemaV2Records = schemaV2Validations.filter((v) => !v.valid).flatMap((v) => v.issues);

  const schemaV2Summary = countByVerdict(schemaV2Observations);
  const legacyV1Summary = countByVerdict(legacyV1Observations);

  const context = {
    statusLoad,
    observationsLoad,
    allObservations,
    schemaV2Observations,
    legacyV1Observations,
    invalidSchemaV2Records,
    schemaV2Summary
  };

  const gate = deriveReviewStatus(context);

  const lessonsLearned = [
    "Endpoint works with lite Jupiter quote base",
    "Real public mints work for observation-only quotes",
    "Safe 100 bps requested tolerance can produce PASS",
    "Route quality fields normalized in schema v2",
    "Observation-only gates held; approved remained false",
    "Legacy v1 rejected records remain historical context only"
  ];

  return {
    timestamp: new Date().toISOString(),
    review: "R33-clean-quote-observation-review",
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
      rejectCount: statusLoad.data.rejectCount ?? null
    } : null,
    schemaSummary: {
      schemaV2Version: SCHEMA_V2_VERSION,
      slippageInterpretation: SLIPPAGE_INTERPRETATION,
      schemaV2: schemaV2Summary,
      legacyV1: legacyV1Summary,
      schemaV2Records: schemaV2Observations.map((o) => ({
        candidateId: o.candidateId || null,
        observationSchemaVersion: o.observationSchemaVersion ?? null,
        requestedSlippageBps: o.requestedSlippageBps ?? null,
        realizedSlippageBps: o.realizedSlippageBps ?? null,
        gateVerdict: o.gateVerdict || null,
        routeSummary: o.routeSummary || null
      })),
      legacyV1Records: legacyV1Observations.map((o) => ({
        candidateId: o.candidateId || null,
        observationSchemaVersion: o.observationSchemaVersion ?? null,
        slippageBps: o.slippageBps ?? null,
        gateVerdict: o.gateVerdict || null,
        rejectionReasons: o.rejectionReasons || []
      }))
    },
    lessonsLearned,
    shadowExecutionBlockers: [
      "At least 3 clean schema v2 observations required manually",
      "All records must remain approved false",
      "No wallet/signing/submission flags",
      "No rate-limit/provider error clusters",
      "Quote fields must remain stable",
      "R7b must continue in background"
    ],
    evaluation: {
      verdict: "CLEAN QUOTE OBSERVATION REVIEWED — TRADING STILL BLOCKED",
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
    recommendedNextGate: "R34 Small Manual Quote Observation Batch Review"
  };
}

function writeReview(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[r33-review] Clean Quote Observation Review + Schema v2 Validation (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  review status: ${status.evaluation.reviewStatus}`);
  console.log(`  approved: false`);
  console.log(`  schema v2: ${status.schemaSummary.schemaV2.total} pass=${status.schemaSummary.schemaV2.passCount} reject=${status.schemaSummary.schemaV2.rejectCount}`);
  console.log(`  legacy v1: ${status.schemaSummary.legacyV1.total}`);
}

function runR33CleanQuoteObservationReview(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const outputFile = options.outputFile || path.join(analysisDir, "r33_clean_quote_observation_review.json");
  const status = collectR33CleanQuoteObservationReview({
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
    const result = runR33CleanQuoteObservationReview();
    if (result.outputFile) console.log(`  output: ${result.outputFile}`);
  } catch (err) {
    console.error("[r33-review] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  SCHEMA_V2_VERSION,
  SLIPPAGE_INTERPRETATION,
  GATE_DOC,
  OUTPUT_FILE,
  DEFAULT_STATUS_FILE,
  DEFAULT_OBSERVATIONS_FILE,
  isSchemaV2,
  isLegacyV1,
  validateSchemaV2Record,
  loadObservationsJsonl,
  deriveReviewStatus,
  collectR33CleanQuoteObservationReview,
  runR33CleanQuoteObservationReview
};
