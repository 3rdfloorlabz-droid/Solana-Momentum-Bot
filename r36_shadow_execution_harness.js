"use strict";

// r36_shadow_execution_harness.js — Sprint 4 R36
// Shadow execution harness — simulation only. Writes analysis/ only.
// Does NOT activate real execution, polling, trade, sign, submit, or mutate positions.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const r18 = require("./r18_shadow_quote_review");
const r33 = require("./r33_clean_quote_observation_review");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R36_OUTPUT_DIR
  ? path.resolve(process.env.R36_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const DECISIONS_FILE = path.join(OUTPUT_DIR, "shadow_execution_decisions.jsonl");
const STATUS_FILE = path.join(OUTPUT_DIR, "r36_shadow_execution_status.json");
const GATE_DOC = "docs/R36_SHADOW_EXECUTION_HARNESS.md";
const DEFAULT_OBSERVATIONS_FILE = path.join(OUTPUT_DIR, "real_quote_observations.jsonl");

const SCHEMA_VERSION = 1;
const SOURCE_MODE = "SHADOW_SIMULATION_ONLY";
const MAX_REQUESTED_SLIPPAGE_BPS = 100;
const MAX_PRICE_IMPACT_BPS = 100;
const MAX_QUOTE_AGE_SECONDS = 10;

const SIMULATED_ACTION = Object.freeze({
  WOULD_ENTER: "WOULD_ENTER",
  SKIP: "SKIP"
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
    emergencyStop: data.emergencyStop === true
  };
}

function isSafeSimulationPosture(posture) {
  return (
    posture.available === true &&
    posture.executionMode === "PIPELINE_DRY_RUN" &&
    posture.dryRunMode === true &&
    posture.liveArmed === false &&
    posture.emergencyStop !== true
  );
}

function sourceObservationId(observation) {
  const payload = [
    observation.candidateId || "",
    observation.collectedAt || "",
    observation.routeSummary || "",
    observation.requestedSlippageBps ?? "",
    observation.inputAmount ?? ""
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function isEligibleObservation(observation) {
  if (!r33.isSchemaV2(observation)) return false;
  const verdict = observation.gateVerdict;
  return verdict === r18.DECISION.PASS || verdict === r18.DECISION.WARN;
}

function validateHarnessInputBatch(schemaV2Observations) {
  const issues = [];
  for (let i = 0; i < schemaV2Observations.length; i += 1) {
    const validation = r33.validateSchemaV2Record(schemaV2Observations[i], i + 1);
    if (!validation.valid) issues.push(...validation.issues);
  }
  return { valid: issues.length === 0, issues };
}

function simulateDecision(observation) {
  const riskFlags = [];

  if (observation.gateVerdict === r18.DECISION.WARN) {
    riskFlags.push("GATE_VERDICT_WARN");
    return {
      simulatedAction: SIMULATED_ACTION.SKIP,
      simulatedReason: "Gate verdict WARN — shadow skip",
      riskFlags
    };
  }

  if (observation.gateVerdict !== r18.DECISION.PASS) {
    riskFlags.push("GATE_VERDICT_NOT_PASS");
    return {
      simulatedAction: SIMULATED_ACTION.SKIP,
      simulatedReason: "Gate verdict not PASS",
      riskFlags
    };
  }

  if (observation.routeQualityVerdict !== r18.DECISION.PASS) {
    riskFlags.push("ROUTE_QUALITY_NOT_PASS");
    return {
      simulatedAction: SIMULATED_ACTION.SKIP,
      simulatedReason: "Route quality verdict not PASS",
      riskFlags
    };
  }

  if (observation.quoteRequestVerdict !== r18.DECISION.PASS) {
    riskFlags.push("QUOTE_REQUEST_NOT_PASS");
    return {
      simulatedAction: SIMULATED_ACTION.SKIP,
      simulatedReason: "Quote request verdict not PASS",
      riskFlags
    };
  }

  if (observation.requestedSlippageBps > MAX_REQUESTED_SLIPPAGE_BPS) {
    riskFlags.push("REQUESTED_SLIPPAGE_ABOVE_SHADOW_MAX");
    return {
      simulatedAction: SIMULATED_ACTION.SKIP,
      simulatedReason: `Requested slippage ${observation.requestedSlippageBps} bps exceeds shadow max ${MAX_REQUESTED_SLIPPAGE_BPS}`,
      riskFlags
    };
  }

  if ((observation.priceImpactBps ?? 0) > MAX_PRICE_IMPACT_BPS) {
    riskFlags.push("PRICE_IMPACT_ABOVE_SHADOW_MAX");
    return {
      simulatedAction: SIMULATED_ACTION.SKIP,
      simulatedReason: `Price impact ${observation.priceImpactBps} bps exceeds shadow max ${MAX_PRICE_IMPACT_BPS}`,
      riskFlags
    };
  }

  if ((observation.quoteAgeSeconds ?? 0) > MAX_QUOTE_AGE_SECONDS) {
    riskFlags.push("QUOTE_AGE_ABOVE_SHADOW_MAX");
    return {
      simulatedAction: SIMULATED_ACTION.SKIP,
      simulatedReason: `Quote age ${observation.quoteAgeSeconds}s exceeds shadow max ${MAX_QUOTE_AGE_SECONDS}s`,
      riskFlags
    };
  }

  if (Array.isArray(observation.rejectionReasons) && observation.rejectionReasons.length > 0) {
    riskFlags.push("REJECTION_REASONS_PRESENT");
    return {
      simulatedAction: SIMULATED_ACTION.SKIP,
      simulatedReason: "Rejection reasons present on observation",
      riskFlags
    };
  }

  return {
    simulatedAction: SIMULATED_ACTION.WOULD_ENTER,
    simulatedReason: "Shadow policy pass — all conservative checks satisfied",
    riskFlags
  };
}

function buildDecisionRecord(observation, simulation, generatedAt) {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceMode: SOURCE_MODE,
    approved: false,
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false,
    realExecution: false,
    transactionConstructed: false,
    transactionSigned: false,
    transactionSubmitted: false,
    positionMutated: false,
    candidateId: observation.candidateId || null,
    provider: observation.provider || null,
    routeSummary: observation.routeSummary || null,
    requestedSlippageBps: observation.requestedSlippageBps ?? null,
    realizedSlippageBps: null,
    priceImpactBps: observation.priceImpactBps ?? null,
    quoteAgeSeconds: observation.quoteAgeSeconds ?? null,
    gateVerdict: observation.gateVerdict || null,
    routeQualityVerdict: observation.routeQualityVerdict || null,
    quoteRequestVerdict: observation.quoteRequestVerdict || null,
    simulatedAction: simulation.simulatedAction,
    simulatedReason: simulation.simulatedReason,
    sourceObservationId: sourceObservationId(observation),
    riskFlags: simulation.riskFlags
  };
}

function deriveHarnessStatus(context) {
  if (context.observationsLoad.status === "missing") {
    return {
      status: "BLOCKED",
      reason: "Real quote observations file missing."
    };
  }

  if (context.observationsLoad.status === "corrupt") {
    return {
      status: "INVALID_OBSERVATION_RECORD",
      reason: context.observationsLoad.errors.join("; ")
    };
  }

  if (context.recoveryPresent) {
    return {
      status: "BLOCKED",
      reason: "recovery_actions.jsonl present."
    };
  }

  if (!isSafeSimulationPosture(context.posture)) {
    return {
      status: "BLOCKED",
      reason: "Unsafe runtime posture for shadow simulation."
    };
  }

  if (!context.inputValidation.valid) {
    return {
      status: "BLOCKED",
      reason: context.inputValidation.issues.join("; ")
    };
  }

  if (context.eligibleObservations.length === 0) {
    return {
      status: "NO_ELIGIBLE_OBSERVATIONS",
      reason: "No eligible schema v2 PASS/WARN observations found."
    };
  }

  return {
    status: "SHADOW_DECISIONS_GENERATED",
    reason: `${context.decisions.length} simulated decision(s) generated.`
  };
}

function collectR36ShadowExecutionHarness(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;

  const gateDocPresent = options.gateDocPresent !== undefined
    ? options.gateDocPresent === true
    : fs.existsSync(path.join(repoRoot, GATE_DOC));

  let observationsLoad;
  if (Array.isArray(options.observations)) {
    observationsLoad = { status: "present", observations: options.observations, errors: [] };
  } else {
    observationsLoad = r33.loadObservationsJsonl(options.observationsFile || DEFAULT_OBSERVATIONS_FILE);
  }

  const allObservations = observationsLoad.observations || [];
  const schemaV2Observations = allObservations.filter(r33.isSchemaV2);
  const legacyV1Observations = allObservations.filter(r33.isLegacyV1);
  const inputValidation = validateHarnessInputBatch(schemaV2Observations);

  const recoveryPresent = options.recoveryPresent !== undefined
    ? options.recoveryPresent === true
    : fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"))
      || fs.existsSync(path.join(repoRoot, "recovery_actions.jsonl"));

  const posture = options.posture || readPosture(runtimeRoot);

  const eligibleObservations = schemaV2Observations.filter(isEligibleObservation);
  const blockedCount = schemaV2Observations.length - eligibleObservations.length;

  const generatedAt = options.generatedAt || new Date().toISOString();
  const decisions = eligibleObservations.map((obs) => {
    const simulation = simulateDecision(obs);
    return buildDecisionRecord(obs, simulation, generatedAt);
  });

  const wouldEnterCount = decisions.filter((d) => d.simulatedAction === SIMULATED_ACTION.WOULD_ENTER).length;
  const skipCount = decisions.filter((d) => d.simulatedAction === SIMULATED_ACTION.SKIP).length;

  const context = {
    observationsLoad,
    recoveryPresent,
    posture,
    inputValidation,
    eligibleObservations,
    decisions
  };

  const gate = deriveHarnessStatus(context);

  return {
    timestamp: generatedAt,
    harness: "R36-shadow-execution-harness",
    schemaVersion: SCHEMA_VERSION,
    gateDocPresent,
    approved: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    shadowExecutionActivated: false,
    realExecution: false,
    capitalAtRiskUsd: 0,
    sources: {
      gateDoc: GATE_DOC,
      observationsFile: Array.isArray(options.observations)
        ? "(inline fixture)"
        : (options.observationsFile || DEFAULT_OBSERVATIONS_FILE)
    },
    inputSummary: {
      totalObservations: allObservations.length,
      schemaV2Count: schemaV2Observations.length,
      legacyV1Ignored: legacyV1Observations.length,
      eligibleCount: eligibleObservations.length,
      blockedCount
    },
    shadowPolicy: {
      maxRequestedSlippageBps: MAX_REQUESTED_SLIPPAGE_BPS,
      maxPriceImpactBps: MAX_PRICE_IMPACT_BPS,
      maxQuoteAgeSeconds: MAX_QUOTE_AGE_SECONDS
    },
    evaluation: {
      verdict: gate.status === "SHADOW_DECISIONS_GENERATED"
        ? "SHADOW EXECUTION HARNESS BUILT — SIMULATION ONLY"
        : "SHADOW EXECUTION HARNESS — NO DECISIONS GENERATED",
      status: gate.status,
      reason: gate.reason,
      approved: false
    },
    summary: {
      status: gate.status,
      decisionCount: decisions.length,
      wouldEnterCount,
      skipCount,
      blockedCount,
      approved: false,
      capitalAtRiskUsd: 0,
      shadowExecutionActivated: false,
      realExecution: false,
      tradingAllowed: false,
      signingAllowed: false,
      submissionAllowed: false,
      walletRequired: false
    },
    decisions,
    blockers: [
      "live trading not approved",
      "micro-live not approved",
      "real execution not activated",
      "shadow execution not activated against live infrastructure",
      "no wallet connection",
      "no signing",
      "no submission",
      "no position mutation"
    ],
    remainingBlockers: [
      "shadow decisions must be reviewed (R37)",
      "R7b edge validation not complete",
      "wallet/signing/submission still blocked",
      "final live trading approval not granted"
    ],
    recommendedNextGate: "R37 Shadow Execution Results Review + Research Wallet Setup Readiness"
  };
}

function writeDecisionsJsonl(decisions, outputFile = DECISIONS_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const body = decisions.length > 0
    ? `${decisions.map((d) => JSON.stringify(d)).join("\n")}\n`
    : "";
  fs.writeFileSync(outputFile, body);
  return outputFile;
}

function writeStatus(statusPayload, outputFile = STATUS_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(statusPayload, null, 2)}\n`);
  return outputFile;
}

function printSummary(result) {
  console.log("[r36-shadow] Shadow Execution Harness — simulation only");
  console.log(`  verdict: ${result.evaluation.verdict}`);
  console.log(`  status: ${result.evaluation.status}`);
  console.log(`  approved: false`);
  console.log(`  decisions: ${result.summary.decisionCount} wouldEnter=${result.summary.wouldEnterCount} skip=${result.summary.skipCount} blocked=${result.summary.blockedCount}`);
}

function runR36ShadowExecutionHarness(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const decisionsFile = options.decisionsFile || path.join(analysisDir, "shadow_execution_decisions.jsonl");
  const statusFile = options.statusFile || path.join(analysisDir, "r36_shadow_execution_status.json");

  const result = collectR36ShadowExecutionHarness({
    ...options,
    analysisDir
  });

  if (options.writeOutput !== false && result.evaluation.status === "SHADOW_DECISIONS_GENERATED") {
    writeDecisionsJsonl(result.decisions, decisionsFile);
  } else if (options.writeOutput !== false && result.evaluation.status === "NO_ELIGIBLE_OBSERVATIONS") {
    writeDecisionsJsonl([], decisionsFile);
  }

  if (options.writeOutput !== false) {
    writeStatus({
      timestamp: result.timestamp,
      harness: result.harness,
      schemaVersion: result.schemaVersion,
      gateDocPresent: result.gateDocPresent,
      approved: false,
      liveTradingApproved: false,
      microLiveApproved: false,
      shadowExecutionActivated: false,
      realExecution: false,
      capitalAtRiskUsd: 0,
      evaluation: result.evaluation,
      summary: result.summary,
      inputSummary: result.inputSummary,
      shadowPolicy: result.shadowPolicy,
      blockers: result.blockers,
      remainingBlockers: result.remainingBlockers,
      recommendedNextGate: result.recommendedNextGate,
      outputFiles: {
        decisionsJsonl: decisionsFile,
        statusJson: statusFile
      }
    }, statusFile);
  }

  if (options.print !== false) {
    printSummary(result);
  }

  return {
    result,
    decisionsFile: options.writeOutput !== false ? decisionsFile : null,
    statusFile: options.writeOutput !== false ? statusFile : null
  };
}

if (require.main === module) {
  try {
    const run = runR36ShadowExecutionHarness();
    if (run.decisionsFile) console.log(`  decisions: ${run.decisionsFile}`);
    if (run.statusFile) console.log(`  status: ${run.statusFile}`);
    if (run.result.recommendedNextGate) {
      console.log(`  next gate: ${run.result.recommendedNextGate}`);
    }
  } catch (err) {
    console.error("[r36-shadow] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOC,
  DECISIONS_FILE,
  STATUS_FILE,
  DEFAULT_OBSERVATIONS_FILE,
  SOURCE_MODE,
  SIMULATED_ACTION,
  MAX_REQUESTED_SLIPPAGE_BPS,
  MAX_PRICE_IMPACT_BPS,
  MAX_QUOTE_AGE_SECONDS,
  sourceObservationId,
  isEligibleObservation,
  simulateDecision,
  buildDecisionRecord,
  deriveHarnessStatus,
  collectR36ShadowExecutionHarness,
  runR36ShadowExecutionHarness
};
