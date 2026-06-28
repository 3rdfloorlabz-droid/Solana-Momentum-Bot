"use strict";

// r31_r32_quote_observation_hardening_check.js — Sprint 4 R31-R32 combined
// Read-only quote observation hardening + batch plan status. Writes analysis/ only.
// Does NOT activate polling, trade, sign, submit, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const r29 = require("./r29_real_quote_observer");
const r18 = require("./r18_shadow_quote_review");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R31R32_OUTPUT_DIR
  ? path.resolve(process.env.R31R32_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r31_r32_quote_observation_hardening_status.json");

const GATE_DOCS = {
  r31: "docs/R31_QUOTE_OBSERVATION_HARDENING.md",
  r32: "docs/R32_ADDITIONAL_OBSERVATION_BATCH_PLAN.md"
};
const DEFAULT_CANDIDATE_EXAMPLE = path.join(ROOT, "examples", "r31_real_quote_candidates.example.json");

const BATCH_PLAN = Object.freeze({
  manualOnly: true,
  continuousLoopAllowed: false,
  maxBatchCandidates: 3,
  defaultRequestedSlippageBps: 100,
  maxRequestToleranceBps: 200,
  allowedPairs: ["SOL-USDC", "SOL-USDT"]
});

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

function loadCandidateExample(filePath) {
  const loaded = readJsonIfPresent(filePath);
  if (loaded.status !== "present") return loaded;
  const data = loaded.data;
  const candidates = Array.isArray(data) ? data : (data?.candidates || []);
  return { status: "present", data, candidates };
}

function buildFixtureObservation(overrides = {}) {
  const candidate = {
    candidateId: "R31R32-FIXTURE-001",
    source: "manual",
    tokenSymbol: "SOL-USDC",
    inputMint: "So11111111111111111111111111111111111111112",
    outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    intendedInputAmountSol: 0.001,
    requestedSlippageBps: 100,
    ...overrides.candidate
  };
  const normalized = r29.normalizeProviderQuote({
    quotedOutputAmount: 70392,
    outputAmount: 70392,
    minimumOutputThreshold: 68281,
    priceImpactBps: 0,
    quoteAgeSeconds: 0,
    routeSummary: "GoonFi V2",
    requestedSlippageBps: candidate.requestedSlippageBps,
    ...overrides.normalized
  }, candidate);
  const evaluation = r29.evaluateObservationQuote(normalized, overrides.nowMs ?? Date.now());
  const observation = r29.buildObservationRecord(
    candidate,
    normalized,
    evaluation,
    overrides.collectedAt || new Date().toISOString(),
    "jupiter_quote_readonly"
  );
  return { candidate, normalized, evaluation, observation };
}

function verifyObservationSchema(observation) {
  const issues = [];
  const required = [
    "requestedSlippageBps",
    "realizedSlippageBps",
    "slippageInterpretation",
    "minimumOutputThreshold",
    "outputAmount",
    "priceImpactBps",
    "routeQualityVerdict",
    "quoteRequestVerdict"
  ];
  for (const field of required) {
    if (observation[field] === undefined) issues.push(`missing field: ${field}`);
  }
  if (observation.realizedSlippageBps !== null) {
    issues.push("realizedSlippageBps must be null in observation mode");
  }
  if (observation.slippageInterpretation !== r29.SLIPPAGE_INTERPRETATION) {
    issues.push("slippageInterpretation must be REQUESTED_TOLERANCE_NOT_REALIZED");
  }
  if (observation.approved === true) issues.push("approved true forbidden");
  if (observation.tradingAllowed === true) issues.push("tradingAllowed true forbidden");
  if (observation.signingAllowed === true) issues.push("signingAllowed true forbidden");
  if (observation.submissionAllowed === true) issues.push("submissionAllowed true forbidden");
  if (observation.walletRequired === true) issues.push("walletRequired true forbidden");
  return { valid: issues.length === 0, issues };
}

function verifyBatchPlan(candidateExample) {
  const issues = [];
  if (!BATCH_PLAN.manualOnly) issues.push("batch plan must be manual-only");
  if (BATCH_PLAN.continuousLoopAllowed) issues.push("continuous loop forbidden");
  if (BATCH_PLAN.maxBatchCandidates !== 3) issues.push("max batch candidates must be 3");
  if (BATCH_PLAN.defaultRequestedSlippageBps !== 100) issues.push("default requested slippage must be 100 bps");
  if (candidateExample.status === "present" && candidateExample.candidates.length > BATCH_PLAN.maxBatchCandidates) {
    issues.push("candidate example exceeds max batch size");
  }
  return { valid: issues.length === 0, issues };
}

function deriveHardeningStatus(context) {
  if (!context.gateDocs.r31 || !context.gateDocs.r32) {
    return {
      gateStatus: "BLOCKED",
      hardeningStatus: "BLOCKED",
      batchPlanStatus: "BLOCKED",
      reason: "R31/R32 docs missing."
    };
  }

  if (context.candidateExample.status === "missing" || context.candidateExample.status === "corrupt") {
    return {
      gateStatus: "BLOCKED",
      hardeningStatus: "BLOCKED",
      batchPlanStatus: "BLOCKED",
      reason: "R31 candidate example missing or corrupt."
    };
  }

  if (!context.schemaCheck.valid || !context.defaultSlippageOk || !context.reject300Ok || !context.pass100Ok) {
    return {
      gateStatus: "BLOCKED",
      hardeningStatus: "BLOCKED",
      batchPlanStatus: "BATCH_PLAN_DEFINED_MANUAL_ONLY",
      reason: context.schemaCheck.issues.concat(context.hardeningIssues).join("; ") || "hardening checks failed"
    };
  }

  if (
    !context.recoveryAbsent ||
    context.posture.liveArmed === true ||
    context.posture.dryRunMode === false ||
    !isSafeObservationPosture(context.posture)
  ) {
    return {
      gateStatus: "BLOCKED",
      hardeningStatus: "HARDENING_COMPLETE",
      batchPlanStatus: "BATCH_PLAN_DEFINED_MANUAL_ONLY",
      reason: "Unsafe runtime posture or recovery_actions.jsonl present."
    };
  }

  if (!context.batchPlanCheck.valid) {
    return {
      gateStatus: "BLOCKED",
      hardeningStatus: "HARDENING_COMPLETE",
      batchPlanStatus: "BLOCKED",
      reason: context.batchPlanCheck.issues.join("; ")
    };
  }

  return {
    gateStatus: "READY_FOR_SMALL_MANUAL_BATCH_OBSERVATION",
    hardeningStatus: "HARDENING_COMPLETE",
    batchPlanStatus: "BATCH_PLAN_DEFINED_MANUAL_ONLY",
    reason: "Hardening complete; manual batch plan defined; ready for small manual batch when operator chooses."
  };
}

function collectR31R32QuoteObservationHardeningStatus(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;
  const candidateFile = options.candidateFile || DEFAULT_CANDIDATE_EXAMPLE;

  const posture = readPosture(runtimeRoot);
  const recoveryAbsent = !fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"));

  const gateDocs = {
    r31: options.gateDocR31Present !== undefined
      ? options.gateDocR31Present === true
      : docExists(repoRoot, GATE_DOCS.r31),
    r32: options.gateDocR32Present !== undefined
      ? options.gateDocR32Present === true
      : docExists(repoRoot, GATE_DOCS.r32)
  };

  const candidateExample = options.candidateExample
    ? { status: "present", data: options.candidateExample, candidates: options.candidateExample.candidates || [] }
    : loadCandidateExample(candidateFile);

  const passFixture = options.fixtureObservation || buildFixtureObservation();
  const rejectFixture = options.rejectFixture || buildFixtureObservation({
    candidate: { requestedSlippageBps: 300 },
    normalized: { requestedSlippageBps: 300 }
  });

  const schemaCheck = verifyObservationSchema(passFixture.observation);
  const defaultSlippageOk = r29.resolveRequestedSlippageBps({}) === BATCH_PLAN.defaultRequestedSlippageBps;
  const reject300Ok = rejectFixture.evaluation.findings.some(
    (f) => f.code === "REQUESTED_SLIPPAGE_ABOVE_MANUAL_EXCEPTION"
  );
  const pass100Ok = passFixture.evaluation.decision === r18.DECISION.PASS;

  const hardeningIssues = [];
  if (!defaultSlippageOk) hardeningIssues.push("default requested slippage is not 100 bps");
  if (!reject300Ok) hardeningIssues.push("300 bps request rejection missing");
  if (!pass100Ok) hardeningIssues.push("100 bps good quote did not pass");

  const batchPlanCheck = verifyBatchPlan(candidateExample);

  const context = {
    gateDocs,
    candidateExample,
    schemaCheck,
    defaultSlippageOk,
    reject300Ok,
    pass100Ok,
    hardeningIssues,
    batchPlanCheck,
    posture,
    recoveryAbsent
  };

  const gate = deriveHardeningStatus(context);

  return {
    timestamp: new Date().toISOString(),
    review: "R31-R32-quote-observation-hardening-batch-plan",
    schemaVersion: 1,
    approved: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    capitalAtRiskUsd: 0,
    gateDocsPresent: gateDocs,
    candidateExample: {
      source: options.candidateExample ? "(inline fixture)" : candidateFile,
      status: candidateExample.status,
      candidateCount: candidateExample.candidates?.length || 0
    },
    batchPlan: { ...BATCH_PLAN },
    schemaVerification: {
      passFixture: schemaCheck,
      sampleFields: {
        requestedSlippageBps: passFixture.observation.requestedSlippageBps,
        realizedSlippageBps: passFixture.observation.realizedSlippageBps,
        slippageInterpretation: passFixture.observation.slippageInterpretation,
        quoteRequestVerdict: passFixture.observation.quoteRequestVerdict,
        routeQualityVerdict: passFixture.observation.routeQualityVerdict
      },
      reject300Codes: rejectFixture.observation.rejectionReasons
    },
    posture,
    recoveryActionsJsonl: { exists: !recoveryAbsent },
    evaluation: {
      verdict: "QUOTE OBSERVATION HARDENED — TRADING STILL BLOCKED",
      batchPlanVerdict: "ADDITIONAL OBSERVATION BATCH PLAN DEFINED — MANUAL ONLY",
      gateStatus: gate.gateStatus,
      hardeningStatus: gate.hardeningStatus,
      batchPlanStatus: gate.batchPlanStatus,
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
    recommendedNextGate: "Small manual --observe-once batch using examples/r31_real_quote_candidates.example.json when operator ready"
  };
}

function writeStatus(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[r31r32-check] Quote Observation Hardening + Batch Plan (read-only)");
  console.log(`  hardening verdict: ${status.evaluation.verdict}`);
  console.log(`  batch plan verdict: ${status.evaluation.batchPlanVerdict}`);
  console.log(`  gate status: ${status.evaluation.gateStatus}`);
  console.log(`  approved: false`);
}

function runR31R32QuoteObservationHardeningCheck(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const outputFile = options.outputFile || path.join(analysisDir, "r31_r32_quote_observation_hardening_status.json");
  const status = collectR31R32QuoteObservationHardeningStatus({
    ...options,
    analysisDir
  });

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
    const result = runR31R32QuoteObservationHardeningCheck();
    if (result.outputFile) console.log(`  output: ${result.outputFile}`);
  } catch (err) {
    console.error("[r31r32-check] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  BATCH_PLAN,
  GATE_DOCS,
  DEFAULT_CANDIDATE_EXAMPLE,
  OUTPUT_FILE,
  buildFixtureObservation,
  verifyObservationSchema,
  verifyBatchPlan,
  collectR31R32QuoteObservationHardeningStatus,
  runR31R32QuoteObservationHardeningCheck
};
