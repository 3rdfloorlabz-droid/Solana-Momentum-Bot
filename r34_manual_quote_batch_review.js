"use strict";

// r34_manual_quote_batch_review.js — Sprint 4 R34
// Read-only small manual quote observation batch review. Writes analysis/ only.
// Does NOT activate polling, trade, sign, submit, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const r18 = require("./r18_shadow_quote_review");
const r33 = require("./r33_clean_quote_observation_review");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R34_OUTPUT_DIR
  ? path.resolve(process.env.R34_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r34_manual_quote_batch_review.json");
const GATE_DOC = "docs/R34_SMALL_MANUAL_QUOTE_OBSERVATION_BATCH_REVIEW.md";
const DEFAULT_CANDIDATE_FILE = path.join(ROOT, "examples", "r34_manual_quote_batch_candidates.example.json");
const DEFAULT_OBSERVATIONS_FILE = path.join(OUTPUT_DIR, "real_quote_observations.jsonl");

const SCHEMA_VERSION = 1;
const MAX_BATCH_CANDIDATES = 3;
const DEFAULT_REQUESTED_SLIPPAGE_BPS = 100;
const MAX_REQUESTED_SLIPPAGE_BPS = 200;
const MIN_SCHEMA_V2_FOR_SHADOW_REVIEW = 3;
const SECRET_FIELD_PATTERN = /private[_-]?key|secret|seed|mnemonic|signer[_-]?secret|passphrase|api[_-]?key|wallet[_-]?private/i;

const BATCH_RULES = Object.freeze({
  manualOnly: true,
  continuousLoopAllowed: false,
  maxBatchCandidates: MAX_BATCH_CANDIDATES,
  defaultRequestedSlippageBps: DEFAULT_REQUESTED_SLIPPAGE_BPS,
  maxRequestedSlippageBps: MAX_REQUESTED_SLIPPAGE_BPS,
  schedulerAllowed: false,
  daemonAllowed: false,
  unattendedRunAllowed: false
});

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
    emergencyStop: data.emergencyStop === true
  };
}

function isSafeObservationPosture(posture) {
  return (
    posture.available === true &&
    posture.executionMode === "PIPELINE_DRY_RUN" &&
    posture.dryRunMode === true &&
    posture.liveArmed === false &&
    posture.emergencyStop !== true
  );
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

function extractCandidates(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return Array.isArray(data.candidates) ? data.candidates : [];
}

function isCandidateEnabled(candidate) {
  return candidate && candidate.enabled !== false;
}

function validateBatchCandidates(candidates) {
  const issues = [];
  const enabled = candidates.filter(isCandidateEnabled);

  if (enabled.length === 0) {
    issues.push("no enabled candidates in batch file");
  }
  if (enabled.length > MAX_BATCH_CANDIDATES) {
    issues.push(`enabled candidate count ${enabled.length} exceeds max ${MAX_BATCH_CANDIDATES}`);
  }

  for (let i = 0; i < enabled.length; i += 1) {
    const c = enabled[i];
    const label = c.candidateId || `candidate ${i + 1}`;

    const secretHits = findSecretLikeFields(c);
    if (secretHits.length > 0) {
      issues.push(`${label}: secret-like fields: ${secretHits.join(", ")}`);
    }

    if (!c.inputMint) issues.push(`${label}: missing inputMint`);
    if (!c.outputMint) issues.push(`${label}: missing outputMint`);
    if (c.intendedInputAmountSol === undefined && c.inputAmount === undefined) {
      issues.push(`${label}: missing intendedInputAmountSol`);
    }

    const source = String(c.source || c.candidateSource || "").toLowerCase();
    if (source !== "manual") {
      issues.push(`${label}: source must be manual`);
    }

    const slippage = c.requestedSlippageBps;
    if (slippage === undefined) {
      issues.push(`${label}: missing requestedSlippageBps`);
    } else if (slippage > MAX_REQUESTED_SLIPPAGE_BPS) {
      issues.push(`${label}: requestedSlippageBps ${slippage} exceeds max ${MAX_REQUESTED_SLIPPAGE_BPS}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    enabledCount: enabled.length,
    enabledCandidates: enabled.map((c) => ({
      candidateId: c.candidateId || null,
      tokenSymbol: c.tokenSymbol || null,
      intendedInputAmountSol: c.intendedInputAmountSol ?? null,
      requestedSlippageBps: c.requestedSlippageBps ?? null,
      source: c.source || c.candidateSource || null
    }))
  };
}

function validateExistingObservations(observations) {
  const issues = [];
  for (let i = 0; i < observations.length; i += 1) {
    const record = observations[i];
    if (!r33.isSchemaV2(record)) continue;

    const validation = r33.validateSchemaV2Record(record, i + 1);
    if (!validation.valid) issues.push(...validation.issues);
  }
  return { valid: issues.length === 0, issues };
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
  if (!context.gateDocPresent) {
    return {
      reviewStatus: "BLOCKED",
      reason: "R34 gate doc missing."
    };
  }

  if (context.candidateLoad.status === "missing" || context.candidateLoad.status === "corrupt") {
    return {
      reviewStatus: "BLOCKED",
      reason: "R34 batch candidate file missing or corrupt."
    };
  }

  if (!context.candidateValidation.valid) {
    return {
      reviewStatus: "INVALID_BATCH_CANDIDATES",
      reason: context.candidateValidation.issues.join("; ")
    };
  }

  if (context.recoveryPresent) {
    return {
      reviewStatus: "BLOCKED",
      reason: "recovery_actions.jsonl present — batch must not run."
    };
  }

  if (!isSafeObservationPosture(context.posture)) {
    return {
      reviewStatus: "BLOCKED",
      reason: "Unsafe runtime posture for observation-only batch."
    };
  }

  if (context.observationsLoad.status === "corrupt") {
    return {
      reviewStatus: "BLOCKED",
      reason: context.observationsLoad.errors.join("; ")
    };
  }

  if (!context.existingObsValidation.valid) {
    return {
      reviewStatus: "BLOCKED",
      reason: context.existingObsValidation.issues.join("; ")
    };
  }

  if (context.schemaV2Count >= MIN_SCHEMA_V2_FOR_SHADOW_REVIEW) {
    return {
      reviewStatus: "ENOUGH_SCHEMA_V2_OBSERVATIONS_FOR_REVIEW",
      reason: `${context.schemaV2Count} schema v2 observations collected — ready for R35 batch results review.`,
      batchPlanStatus: "BATCH_PLAN_READY_MANUAL_ONLY"
    };
  }

  return {
    reviewStatus: "NEED_MORE_SCHEMA_V2_OBSERVATIONS",
    reason: `${context.schemaV2Count} of ${MIN_SCHEMA_V2_FOR_SHADOW_REVIEW} schema v2 observations collected.`,
    batchPlanStatus: "BATCH_PLAN_READY_MANUAL_ONLY"
  };
}

function collectR34ManualQuoteBatchReview(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const candidateFile = options.candidateFile || DEFAULT_CANDIDATE_FILE;
  const observationsFile = options.observationsFile || DEFAULT_OBSERVATIONS_FILE;

  const gateDocPresent = options.gateDocPresent !== undefined
    ? options.gateDocPresent === true
    : fs.existsSync(path.join(repoRoot, GATE_DOC));

  let candidateLoad;
  if (options.candidateData !== undefined) {
    candidateLoad = { status: "present", data: options.candidateData };
  } else {
    candidateLoad = readJsonIfPresent(candidateFile);
  }

  const candidates = extractCandidates(candidateLoad.data);
  const candidateValidation = validateBatchCandidates(candidates);

  let observationsLoad;
  if (Array.isArray(options.observations)) {
    observationsLoad = { status: "present", observations: options.observations, errors: [] };
  } else if (options.skipObservations === true) {
    observationsLoad = { status: "missing", observations: [], errors: [] };
  } else {
    observationsLoad = r33.loadObservationsJsonl(observationsFile);
  }

  const allObservations = observationsLoad.observations || [];
  const schemaV2Observations = allObservations.filter(r33.isSchemaV2);
  const legacyV1Observations = allObservations.filter(r33.isLegacyV1);
  const schemaV2Summary = countByVerdict(schemaV2Observations);
  const existingObsValidation = validateExistingObservations(allObservations);

  const recoveryPresent = options.recoveryPresent !== undefined
    ? options.recoveryPresent === true
    : fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"))
      || fs.existsSync(path.join(repoRoot, "recovery_actions.jsonl"));

  const posture = options.posture || readPosture(runtimeRoot);

  const context = {
    gateDocPresent,
    candidateLoad,
    candidateValidation,
    observationsLoad,
    schemaV2Count: schemaV2Observations.length,
    existingObsValidation,
    recoveryPresent,
    posture
  };

  const gate = deriveReviewStatus(context);

  const recommendedNextGate = context.schemaV2Count >= MIN_SCHEMA_V2_FOR_SHADOW_REVIEW
    ? "R35 Quote Batch Results Review + Shadow Execution Readiness"
    : context.schemaV2Count > 0 && schemaV2Summary.rejectCount > 0
      ? "R34a Provider/Candidate Hardening Patch"
      : "R35 Quote Batch Results Review + Shadow Execution Readiness (after batch completes)";

  return {
    timestamp: new Date().toISOString(),
    review: "R34-manual-quote-batch-review",
    schemaVersion: SCHEMA_VERSION,
    gateDocPresent,
    approved: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    capitalAtRiskUsd: 0,
    sources: {
      gateDoc: GATE_DOC,
      candidateFile: options.candidateData ? "(inline fixture)" : candidateFile,
      observationsFile: Array.isArray(options.observations) ? "(inline fixture)" : observationsFile
    },
    batchRules: BATCH_RULES,
    batchPlan: {
      enabledCandidateCount: candidateValidation.enabledCount,
      maxCandidates: MAX_BATCH_CANDIDATES,
      defaultRequestedSlippageBps: DEFAULT_REQUESTED_SLIPPAGE_BPS,
      maxRequestedSlippageBps: MAX_REQUESTED_SLIPPAGE_BPS,
      enabledCandidates: candidateValidation.enabledCandidates,
      batchPlanStatus: gate.batchPlanStatus || null
    },
    postureSummary: posture.available ? {
      executionMode: posture.executionMode,
      dryRunMode: posture.dryRunMode,
      liveArmed: posture.liveArmed,
      emergencyStop: posture.emergencyStop,
      safeForObservation: isSafeObservationPosture(posture)
    } : { available: false, status: posture.status },
    observationSummary: {
      minSchemaV2ForShadowReview: MIN_SCHEMA_V2_FOR_SHADOW_REVIEW,
      schemaV2: schemaV2Summary,
      legacyV1: {
        total: legacyV1Observations.length,
        countedTowardReadiness: false
      },
      schemaV2Count: schemaV2Observations.length,
      readinessMet: schemaV2Observations.length >= MIN_SCHEMA_V2_FOR_SHADOW_REVIEW
    },
    stopConditions: [
      "emergencyStop true",
      "liveArmed true",
      "dryRunMode false",
      "executionMode not PIPELINE_DRY_RUN",
      "recovery_actions.jsonl appears",
      "provider error or rate limit",
      "malformed quote response",
      "approved true on any observation",
      "wallet/signing/submission flags true"
    ],
    evaluation: {
      verdict: "SMALL MANUAL QUOTE BATCH REVIEW DEFINED — OBSERVATION ONLY",
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
    recommendedOperatorCommand:
      "node r29_real_quote_observer.js --observe-once --candidates examples/r34_manual_quote_batch_candidates.example.json",
    recommendedNextGate
  };
}

function writeReview(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[r34-batch] Small Manual Quote Observation Batch Review (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  review status: ${status.evaluation.reviewStatus}`);
  console.log(`  approved: false`);
  console.log(`  enabled candidates: ${status.batchPlan.enabledCandidateCount}`);
  console.log(`  schema v2 observations: ${status.observationSummary.schemaV2Count}`);
  console.log(`  legacy v1 (not counted): ${status.observationSummary.legacyV1.total}`);
}

function runR34ManualQuoteBatchReview(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const outputFile = options.outputFile || path.join(analysisDir, "r34_manual_quote_batch_review.json");
  const status = collectR34ManualQuoteBatchReview({
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
    const result = runR34ManualQuoteBatchReview();
    if (result.outputFile) console.log(`  output: ${result.outputFile}`);
    if (result.status.recommendedOperatorCommand) {
      console.log(`  next command: ${result.status.recommendedOperatorCommand}`);
    }
  } catch (err) {
    console.error("[r34-batch] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOC,
  OUTPUT_FILE,
  DEFAULT_CANDIDATE_FILE,
  DEFAULT_OBSERVATIONS_FILE,
  BATCH_RULES,
  MAX_BATCH_CANDIDATES,
  DEFAULT_REQUESTED_SLIPPAGE_BPS,
  MAX_REQUESTED_SLIPPAGE_BPS,
  MIN_SCHEMA_V2_FOR_SHADOW_REVIEW,
  extractCandidates,
  isCandidateEnabled,
  validateBatchCandidates,
  validateExistingObservations,
  isSafeObservationPosture,
  deriveReviewStatus,
  collectR34ManualQuoteBatchReview,
  runR34ManualQuoteBatchReview
};
