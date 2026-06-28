"use strict";

// r20_shadow_quote_collector.js — Sprint 4 R20
// Fixture-based dry-run shadow quote collector. Writes analysis/ only.
// Does NOT poll live quotes, sign, submit, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const r18 = require("./r18_shadow_quote_review");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R20_OUTPUT_DIR
  ? path.resolve(process.env.R20_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OBSERVATIONS_FILE = path.join(OUTPUT_DIR, "shadow_quote_observations.jsonl");
const STATUS_FILE = path.join(OUTPUT_DIR, "r20_shadow_quote_collector_status.json");
const DEFAULT_CANDIDATES_FILE = path.join(ROOT, "examples", "shadow_quote_candidates.example.json");

const SCHEMA_VERSION = 1;
const SECRET_FIELD_PATTERN = /private[_-]?key|secret|seed|mnemonic|signer[_-]?secret|passphrase|api[_-]?key/i;

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

function loadCandidates(fixturePath) {
  if (!fs.existsSync(fixturePath)) {
    return { status: "missing", candidates: [], error: "candidate fixture missing" };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    if (Array.isArray(raw)) return { status: "present", candidates: raw, networkPolling: false };
    if (raw && Array.isArray(raw.candidates)) {
      return {
        status: "present",
        candidates: raw.candidates,
        networkPolling: raw.networkPolling === true,
        fixtureType: raw.fixtureType || null
      };
    }
    return { status: "corrupt", candidates: [], error: "fixture must be array or { candidates: [] }" };
  } catch (err) {
    return {
      status: "corrupt",
      candidates: [],
      error: err && err.message ? err.message : String(err)
    };
  }
}

function buildQuoteFromCandidate(candidate, collectedAt) {
  const profile = candidate.expectedQuoteProfile || {};
  return {
    quoteId: `QUOTE-${candidate.candidateId}`,
    timestamp: candidate.createdAt || collectedAt,
    token: candidate.tokenSymbol,
    tokenMint: candidate.tokenMint,
    pairAddress: candidate.pairAddress,
    inputMint: candidate.inputMint,
    outputMint: candidate.outputMint,
    inputAmount: candidate.intendedInputAmountSol,
    outputAmount: profile.quotedOutputAmount,
    minimumOutputAmount: profile.minimumOutputAmount,
    slippageBps: profile.slippageBps,
    priceImpactBps: profile.priceImpactBps,
    quoteAgeSeconds: profile.quoteAgeSeconds,
    routeProvider: profile.routeProvider,
    routeSummary: profile.routeSummary,
    routeHash: profile.routeHash,
    priorityFeeEstimateSol: profile.priorityFeeEstimateSol,
    mevProtectionMode: profile.mevMode || "SIMULATED_REVIEW_ONLY",
    routeStable: profile.routeStable !== false,
    routeChanged: profile.routeChanged === true,
    outputVerifiable: profile.outputVerifiable !== false,
    liquidityTooLow: profile.liquidityTooLow === true,
    spreadTooWide: profile.spreadTooWide === true,
    outputChangedBeyondTolerance: profile.outputChangedBeyondTolerance === true
  };
}

function buildObservation(candidate, quote, evaluation, collectedAt) {
  const warnings = evaluation.findings
    .filter((f) => f.severity === r18.DECISION.WARN)
    .map((f) => f.code);
  const rejectionReasons = evaluation.findings
    .filter((f) => f.severity === r18.DECISION.REJECT)
    .map((f) => f.code);

  return {
    schemaVersion: SCHEMA_VERSION,
    collectedAt,
    sourceMode: "FIXTURE_ONLY",
    networkPolling: false,
    approved: false,
    candidateId: candidate.candidateId,
    source: candidate.source,
    tokenSymbol: candidate.tokenSymbol,
    tokenMint: candidate.tokenMint,
    pairAddress: candidate.pairAddress,
    inputMint: candidate.inputMint,
    outputMint: candidate.outputMint,
    inputAmountSol: candidate.intendedInputAmountSol,
    quotedOutputAmount: quote.outputAmount,
    minimumOutputAmount: quote.minimumOutputAmount,
    slippageBps: quote.slippageBps,
    priceImpactBps: quote.priceImpactBps,
    quoteAgeSeconds: quote.quoteAgeSeconds,
    routeProvider: quote.routeProvider,
    routeSummary: quote.routeSummary,
    routeHash: quote.routeHash,
    priorityFeeEstimateSol: quote.priorityFeeEstimateSol,
    mevMode: quote.mevProtectionMode,
    gateVerdict: evaluation.decision,
    rejectionReasons,
    warnings,
    thesisMatch: candidate.thesisMatch === true,
    riskNotes: candidate.riskNotes || null
  };
}

function deriveCollectorStatus(context) {
  if (context.invalidFixture) {
    return {
      collectorStatus: "INVALID_FIXTURE",
      verdict: "FIXTURE COLLECTOR DEFINED — NOT ACTIVE",
      reason: "Candidate fixture malformed or contains forbidden fields."
    };
  }
  if (
    context.networkPollingActive ||
    context.posture.liveArmed === true ||
    context.posture.dryRunMode === false ||
    context.posture.emergencyStop === true ||
    !context.recoveryAbsent ||
    context.candidateStatus === "missing"
  ) {
    return {
      collectorStatus: "BLOCKED",
      verdict: "FIXTURE COLLECTOR BUILT — NETWORK POLLING STILL BLOCKED",
      reason: "Unsafe posture, missing fixture, recovery present, or polling flag active."
    };
  }
  if (context.rejectCount > 0) {
    return {
      collectorStatus: "FIXTURE_COLLECTION_COMPLETE",
      verdict: "FIXTURE COLLECTOR BUILT — NETWORK POLLING STILL BLOCKED",
      reason: "Fixture collection complete with rejections — network polling still blocked."
    };
  }
  if (context.enableRealQuoteObservationReview === true && context.observationCount > 0) {
    return {
      collectorStatus: "READY_FOR_REAL_QUOTE_OBSERVATION_APPROVAL_REVIEW",
      verdict: "FIXTURE COLLECTOR BUILT — NETWORK POLLING STILL BLOCKED",
      reason: "Fixture collection complete — ready for R21 approval review only (not live)."
    };
  }
  return {
    collectorStatus: "FIXTURE_COLLECTION_COMPLETE",
    verdict: "FIXTURE COLLECTOR BUILT — NETWORK POLLING STILL BLOCKED",
    reason: "Fixture-based shadow quote collection complete — no network polling."
  };
}

function collectR20ShadowQuoteCollectorStatus(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const collectedAt = options.collectedAt || new Date().toISOString();
  const nowMs = options.nowMs ?? Date.parse(collectedAt);

  const posture = readPosture(runtimeRoot);
  const recoveryAbsent = !fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"));

  let candidateLoad;
  if (Array.isArray(options.candidates)) {
    candidateLoad = {
      status: "present",
      candidates: options.candidates,
      networkPolling: options.networkPolling === true
    };
  } else {
    const fixturePath = options.candidatesFile || DEFAULT_CANDIDATES_FILE;
    candidateLoad = { ...loadCandidates(fixturePath), fixturePath };
  }

  const networkPollingActive =
    options.networkPollingActive === true || candidateLoad.networkPolling === true;

  const secretHits = candidateLoad.candidates.flatMap((c) => findSecretLikeFields(c));
  const invalidFixture =
    candidateLoad.status === "corrupt" ||
    secretHits.length > 0 ||
    (candidateLoad.fixtureType && candidateLoad.fixtureType !== "EXAMPLE_ONLY" && options.requireExampleOnly !== false);

  const observations = [];
  const evaluations = [];

  if (!invalidFixture && candidateLoad.status === "present") {
    for (const candidate of candidateLoad.candidates) {
      const quote = buildQuoteFromCandidate(candidate, collectedAt);
      const evaluation = r18.evaluateShadowQuote(quote, { nowMs });
      evaluations.push({ candidateId: candidate.candidateId, evaluation });
      observations.push(buildObservation(candidate, quote, evaluation, collectedAt));
    }
  }

  const passCount = evaluations.filter((e) => e.evaluation.decision === r18.DECISION.PASS).length;
  const warnCount = evaluations.filter((e) => e.evaluation.decision === r18.DECISION.WARN).length;
  const rejectCount = evaluations.filter((e) => e.evaluation.decision === r18.DECISION.REJECT).length;

  const context = {
    invalidFixture,
    networkPollingActive,
    posture,
    recoveryAbsent,
    candidateStatus: candidateLoad.status,
    observationCount: observations.length,
    rejectCount,
    enableRealQuoteObservationReview: options.enableRealQuoteObservationReview === true
  };

  const gate = deriveCollectorStatus(context);

  return {
    timestamp: collectedAt,
    review: "R20-fixture-dry-run-shadow-quote-collector",
    liveTradingApproved: false,
    microLiveApproved: false,
    approved: false,
    quotePollingActive: false,
    capitalAtRiskUsd: 0,
    posture,
    recoveryActionsJsonl: { exists: !recoveryAbsent },
    source: {
      mode: "FIXTURE_ONLY",
      candidatesFile: options.candidates ? "(inline fixture)" : (candidateLoad.fixturePath || DEFAULT_CANDIDATES_FILE),
      candidateStatus: candidateLoad.status,
      candidateCount: candidateLoad.candidates.length
    },
    collectorStatus: gate.collectorStatus,
    observationCount: observations.length,
    passCount,
    warnCount,
    rejectCount,
    observations,
    evaluation: {
      verdict: gate.verdict,
      collectorStatus: gate.collectorStatus,
      reason: gate.reason,
      approved: false
    },
    outputs: {
      observationsJsonl: OBSERVATIONS_FILE,
      statusJson: STATUS_FILE
    },
    recommendedNextGate:
      "Build R21 Real Quote Observation Approval Gate; continue R7b; do not activate network polling; do not connect wallet; do not arm live"
  };
}

function writeObservations(observations, outputFile = OBSERVATIONS_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const body = observations.map((row) => `${JSON.stringify(row)}\n`).join("");
  fs.writeFileSync(outputFile, body);
  return outputFile;
}

function writeStatus(status, outputFile = STATUS_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const { observations, ...summary } = status;
  fs.writeFileSync(outputFile, `${JSON.stringify(summary, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[r20-collector] Fixture Dry-Run Shadow Quote Collector");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  collector status: ${status.collectorStatus}`);
  console.log(`  approved: false`);
  console.log(`  network polling: false`);
  console.log(`  observations: ${status.observationCount} pass=${status.passCount} warn=${status.warnCount} reject=${status.rejectCount}`);
}

function runR20ShadowQuoteCollector(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const observationsFile = options.observationsFile || path.join(analysisDir, "shadow_quote_observations.jsonl");
  const statusFile = options.statusFile || path.join(analysisDir, "r20_shadow_quote_collector_status.json");

  const status = collectR20ShadowQuoteCollectorStatus({
    ...options,
    analysisDir
  });

  if (options.writeOutput !== false && status.observationCount > 0) {
    writeObservations(status.observations, observationsFile);
    writeStatus(status, statusFile);
  } else if (options.writeOutput !== false && status.collectorStatus !== "BLOCKED") {
    writeStatus({ ...status, observations: [] }, statusFile);
  }

  if (options.print !== false) {
    printSummary(status);
  }

  return {
    status,
    observationsFile: options.writeOutput !== false ? observationsFile : null,
    statusFile: options.writeOutput !== false ? statusFile : null
  };
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--input" && argv[i + 1]) {
      options.candidatesFile = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return options;
}

if (require.main === module) {
  try {
    const result = runR20ShadowQuoteCollector({
      ...parseCliArgs(),
      enableRealQuoteObservationReview: true
    });
    if (result.statusFile) {
      console.log(`  status: ${result.statusFile}`);
    }
    if (result.observationsFile) {
      console.log(`  observations: ${result.observationsFile}`);
    }
  } catch (err) {
    console.error("[r20-collector] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  SCHEMA_VERSION,
  DEFAULT_CANDIDATES_FILE,
  OBSERVATIONS_FILE,
  STATUS_FILE,
  readPosture,
  loadCandidates,
  buildQuoteFromCandidate,
  buildObservation,
  deriveCollectorStatus,
  collectR20ShadowQuoteCollectorStatus,
  writeObservations,
  writeStatus,
  runR20ShadowQuoteCollector
};
