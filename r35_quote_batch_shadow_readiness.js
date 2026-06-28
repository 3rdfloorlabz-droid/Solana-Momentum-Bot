"use strict";

// r35_quote_batch_shadow_readiness.js — Sprint 4 R35
// Read-only quote batch results review + shadow execution readiness. Writes analysis/ only.
// Does NOT activate shadow execution, polling, trade, sign, submit, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const r18 = require("./r18_shadow_quote_review");
const r33 = require("./r33_clean_quote_observation_review");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R35_OUTPUT_DIR
  ? path.resolve(process.env.R35_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r35_quote_batch_shadow_readiness.json");
const GATE_DOC = "docs/R35_QUOTE_BATCH_RESULTS_AND_SHADOW_READINESS.md";
const DEFAULT_R34_REVIEW_FILE = path.join(OUTPUT_DIR, "r34_manual_quote_batch_review.json");
const DEFAULT_OBSERVATIONS_FILE = path.join(OUTPUT_DIR, "real_quote_observations.jsonl");

const SCHEMA_VERSION = 1;
const MIN_SCHEMA_V2_FOR_SHADOW_DESIGN = 3;

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

function countByVerdict(observations) {
  return {
    total: observations.length,
    passCount: observations.filter((o) => o.gateVerdict === r18.DECISION.PASS).length,
    warnCount: observations.filter((o) => o.gateVerdict === r18.DECISION.WARN).length,
    rejectCount: observations.filter((o) => o.gateVerdict === r18.DECISION.REJECT).length
  };
}

function hasProviderFailure(record) {
  if (!record || typeof record !== "object") return false;
  const status = record.providerHttpStatus;
  if (typeof status === "number" && status >= 400) return true;
  const preview = String(record.providerErrorBodyPreview || "").toLowerCase();
  if (preview.includes("rate limit") || preview.includes("rate_limit") || preview.includes("429")) {
    return true;
  }
  return false;
}

function validateSchemaV2ReadinessBatch(records) {
  const issues = [];
  const providerFailures = [];

  for (let i = 0; i < records.length; i += 1) {
    const validation = r33.validateSchemaV2Record(records[i], i + 1);
    if (!validation.valid) issues.push(...validation.issues);
    if (hasProviderFailure(records[i])) {
      providerFailures.push(records[i].candidateId || `observation ${i + 1}`);
    }
  }

  return { valid: issues.length === 0, issues, providerFailures };
}

function summarizeRoutes(schemaV2Observations) {
  return schemaV2Observations.map((o) => ({
    candidateId: o.candidateId || null,
    routeSummary: o.routeSummary || null,
    gateVerdict: o.gateVerdict || null,
    requestedSlippageBps: o.requestedSlippageBps ?? null,
    priceImpactBps: o.priceImpactBps ?? null,
    quoteAgeSeconds: o.quoteAgeSeconds ?? null
  }));
}

function deriveReadinessStatus(context) {
  if (!context.gateDocPresent) {
    return {
      readinessStatus: "BLOCKED",
      reason: "R35 gate doc missing."
    };
  }

  if (context.r34ReviewLoad.status === "missing" || context.r34ReviewLoad.status === "corrupt") {
    return {
      readinessStatus: "BLOCKED",
      reason: "R34 batch review file missing or corrupt."
    };
  }

  if (context.observationsLoad.status === "missing") {
    return {
      readinessStatus: "BLOCKED",
      reason: "Real quote observations file missing."
    };
  }

  if (context.observationsLoad.status === "corrupt") {
    return {
      readinessStatus: "INVALID_OBSERVATION_RECORD",
      reason: context.observationsLoad.errors.join("; ")
    };
  }

  if (context.recoveryPresent) {
    return {
      readinessStatus: "BLOCKED",
      reason: "recovery_actions.jsonl present."
    };
  }

  if (!isSafeObservationPosture(context.posture)) {
    return {
      readinessStatus: "BLOCKED",
      reason: "Unsafe runtime posture for shadow readiness review."
    };
  }

  if (!context.batchValidation.valid) {
    return {
      readinessStatus: "INVALID_OBSERVATION_RECORD",
      reason: context.batchValidation.issues.join("; ")
    };
  }

  if (context.batchValidation.providerFailures.length > 0) {
    return {
      readinessStatus: "BLOCKED",
      reason: `Provider failures on: ${context.batchValidation.providerFailures.join(", ")}`
    };
  }

  if (context.schemaV2Count < MIN_SCHEMA_V2_FOR_SHADOW_DESIGN) {
    return {
      readinessStatus: "NOT_READY_NEED_MORE_OBSERVATIONS",
      reason: `${context.schemaV2Count} of ${MIN_SCHEMA_V2_FOR_SHADOW_DESIGN} schema v2 observations collected.`
    };
  }

  if (context.schemaV2Summary.rejectCount > 0) {
    return {
      readinessStatus: "NOT_READY_ROUTE_REJECTIONS",
      reason: `${context.schemaV2Summary.rejectCount} schema v2 observation(s) rejected by policy.`
    };
  }

  if (context.schemaV2Summary.passCount + context.schemaV2Summary.warnCount < MIN_SCHEMA_V2_FOR_SHADOW_DESIGN) {
    return {
      readinessStatus: "NOT_READY_ROUTE_REJECTIONS",
      reason: "Insufficient PASS/WARN schema v2 observations for shadow harness design."
    };
  }

  return {
    readinessStatus: "READY_FOR_SHADOW_EXECUTION_HARNESS_DESIGN",
    reason: "Three clean schema v2 observations passed policy — ready for shadow harness design only."
  };
}

function collectR35QuoteBatchShadowReadiness(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const r34ReviewFile = options.r34ReviewFile || DEFAULT_R34_REVIEW_FILE;
  const observationsFile = options.observationsFile || DEFAULT_OBSERVATIONS_FILE;

  const gateDocPresent = options.gateDocPresent !== undefined
    ? options.gateDocPresent === true
    : fs.existsSync(path.join(repoRoot, GATE_DOC));

  let r34ReviewLoad;
  if (options.r34ReviewData !== undefined) {
    r34ReviewLoad = { status: "present", data: options.r34ReviewData };
  } else {
    r34ReviewLoad = readJsonIfPresent(r34ReviewFile);
  }

  let observationsLoad;
  if (Array.isArray(options.observations)) {
    observationsLoad = { status: "present", observations: options.observations, errors: [] };
  } else {
    observationsLoad = r33.loadObservationsJsonl(observationsFile);
  }

  const allObservations = observationsLoad.observations || [];
  const schemaV2Observations = allObservations.filter(r33.isSchemaV2);
  const legacyV1Observations = allObservations.filter(r33.isLegacyV1);
  const schemaV2Summary = countByVerdict(schemaV2Observations);
  const batchValidation = validateSchemaV2ReadinessBatch(schemaV2Observations);

  const recoveryPresent = options.recoveryPresent !== undefined
    ? options.recoveryPresent === true
    : fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"))
      || fs.existsSync(path.join(repoRoot, "recovery_actions.jsonl"));

  const posture = options.posture || readPosture(runtimeRoot);

  const context = {
    gateDocPresent,
    r34ReviewLoad,
    observationsLoad,
    schemaV2Count: schemaV2Observations.length,
    schemaV2Summary,
    batchValidation,
    recoveryPresent,
    posture
  };

  const gate = deriveReadinessStatus(context);

  const remainingBlockers = [
    "R7b edge validation not complete",
    "no wallet connected through bot",
    "no signer configured for live submission",
    "no transaction construction approved",
    "no submit path approval",
    "no micro-live final approval",
    "no live trading approval",
    "shadow execution not activated"
  ];

  return {
    timestamp: new Date().toISOString(),
    review: "R35-quote-batch-shadow-readiness",
    schemaVersion: SCHEMA_VERSION,
    gateDocPresent,
    approved: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    shadowExecutionActivated: false,
    capitalAtRiskUsd: 0,
    sources: {
      gateDoc: GATE_DOC,
      r34ReviewFile: options.r34ReviewData ? "(inline fixture)" : r34ReviewFile,
      observationsFile: Array.isArray(options.observations) ? "(inline fixture)" : observationsFile
    },
    r34ReviewSummary: r34ReviewLoad.status === "present" ? {
      reviewStatus: r34ReviewLoad.data.evaluation?.reviewStatus || null,
      schemaV2Count: r34ReviewLoad.data.observationSummary?.schemaV2Count ?? null
    } : null,
    batchSummary: {
      schemaV2: schemaV2Summary,
      legacyV1: {
        total: legacyV1Observations.length,
        countedTowardReadiness: false
      },
      providerErrors: batchValidation.providerFailures,
      rateLimitDetected: batchValidation.providerFailures.length > 0,
      routes: summarizeRoutes(schemaV2Observations)
    },
    postureSummary: posture.available ? {
      executionMode: posture.executionMode,
      dryRunMode: posture.dryRunMode,
      liveArmed: posture.liveArmed,
      emergencyStop: posture.emergencyStop,
      safeForObservation: isSafeObservationPosture(posture),
      recoveryActionsAbsent: !recoveryPresent
    } : { available: false, status: posture.status },
    shadowReadinessCriteria: {
      minSchemaV2Observations: MIN_SCHEMA_V2_FOR_SHADOW_DESIGN,
      allPassOrWarn: schemaV2Summary.rejectCount === 0,
      noSchemaV2Rejects: schemaV2Summary.rejectCount === 0,
      allApprovedFalse: batchValidation.valid,
      noWalletSigningSubmissionFlags: batchValidation.valid,
      noProviderFailures: batchValidation.providerFailures.length === 0,
      postureDryRunDisarmed: isSafeObservationPosture(posture),
      recoveryAbsent: !recoveryPresent
    },
    remainingBlockers,
    evaluation: {
      verdict: gate.readinessStatus === "READY_FOR_SHADOW_EXECUTION_HARNESS_DESIGN"
        ? "QUOTE BATCH REVIEWED — READY FOR SHADOW EXECUTION HARNESS DESIGN"
        : "QUOTE BATCH REVIEWED — SHADOW HARNESS DESIGN NOT READY",
      readinessStatus: gate.readinessStatus,
      reason: gate.reason,
      approved: false
    },
    blockers: [
      "live trading not approved",
      "micro-live not approved",
      "shadow execution not activated",
      "continuous polling not activated",
      "no wallet connection",
      "no signing",
      "no submission"
    ],
    recommendedNextGate: "R36 Shadow Execution Harness — simulation only"
  };
}

function writeReview(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[r35-shadow] Quote Batch Results Review + Shadow Execution Readiness (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  readiness status: ${status.evaluation.readinessStatus}`);
  console.log(`  approved: false`);
  console.log(`  schema v2: ${status.batchSummary.schemaV2.total} pass=${status.batchSummary.schemaV2.passCount} reject=${status.batchSummary.schemaV2.rejectCount}`);
  console.log(`  legacy v1 (not counted): ${status.batchSummary.legacyV1.total}`);
  if (status.batchSummary.routes.length > 0) {
    console.log("  routes:");
    for (const route of status.batchSummary.routes) {
      console.log(`    - ${route.candidateId}: ${route.routeSummary}`);
    }
  }
}

function runR35QuoteBatchShadowReadiness(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const outputFile = options.outputFile || path.join(analysisDir, "r35_quote_batch_shadow_readiness.json");
  const status = collectR35QuoteBatchShadowReadiness({
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
    const result = runR35QuoteBatchShadowReadiness();
    if (result.outputFile) console.log(`  output: ${result.outputFile}`);
    if (result.status.recommendedNextGate) {
      console.log(`  next gate: ${result.status.recommendedNextGate}`);
    }
  } catch (err) {
    console.error("[r35-shadow] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOC,
  OUTPUT_FILE,
  DEFAULT_R34_REVIEW_FILE,
  DEFAULT_OBSERVATIONS_FILE,
  MIN_SCHEMA_V2_FOR_SHADOW_DESIGN,
  hasProviderFailure,
  validateSchemaV2ReadinessBatch,
  deriveReadinessStatus,
  collectR35QuoteBatchShadowReadiness,
  runR35QuoteBatchShadowReadiness
};
