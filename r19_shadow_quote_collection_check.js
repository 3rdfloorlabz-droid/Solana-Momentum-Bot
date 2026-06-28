"use strict";

// r19_shadow_quote_collection_check.js — Sprint 4 R19
// Read-only shadow quote collection plan status. Writes analysis/ only.
// Does NOT poll live quotes, sign, submit, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R19_OUTPUT_DIR
  ? path.resolve(process.env.R19_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r19_shadow_quote_collection_status.json");

const GATE_DOCS = {
  r18: "docs/R18_SHADOW_QUOTE_DESIGN_REVIEW.md",
  r19: "docs/R19_SHADOW_QUOTE_COLLECTION_PLAN.md"
};

const ARTIFACTS = {
  r18Harness: "r18_shadow_quote_review.js",
  r18Fixtures: "examples/shadow_quotes.example.json"
};

const COLLECTION_LIMITS = {
  note: "Draft future limits only — NOT active",
  maxQuotesPerTokenPerMinute: 3,
  maxTokensPerCycle: 5,
  maxTotalQuotesPerDay: 100,
  cooldownBetweenQuotesSeconds: 5
};

function docExists(repoRoot, rel) {
  return fs.existsSync(path.join(repoRoot, rel));
}

function artifactExists(repoRoot, rel) {
  return fs.existsSync(path.join(repoRoot, rel));
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

function detectLiveQuotePollingFlag(repoRoot, options = {}) {
  if (options.liveQuotePollingActive === true) return true;
  const flagFile = path.join(repoRoot, "analysis", "shadow_quote_polling_active.json");
  if (!fs.existsSync(flagFile)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(flagFile, "utf8"));
    return data.active === true;
  } catch {
    return false;
  }
}

function deriveCollectionStatus(context) {
  if (
    !context.gateDocs.r18 ||
    !context.gateDocs.r19 ||
    !context.r18HarnessPresent ||
    context.liveQuotePollingActive ||
    context.posture.liveArmed === true ||
    context.posture.dryRunMode === false ||
    context.posture.emergencyStop === true ||
    !context.recoveryAbsent ||
    context.safetySuiteGreen === false
  ) {
    return {
      collectionStatus: "BLOCKED",
      reason: "Missing docs, unsafe posture, recovery present, or live polling flag detected."
    };
  }

  if (
    context.gateDocs.r18 &&
    context.gateDocs.r19 &&
    context.r18HarnessPresent &&
    context.r18FixturesPresent &&
    isSafeObservationPosture(context.posture) &&
    context.recoveryAbsent &&
    !context.liveQuotePollingActive
  ) {
    return {
      collectionStatus: "READY_FOR_FIXTURE_COLLECTOR_DESIGN",
      reason: "Plan and R18 harness present; ready for R20 fixture collector design — not live polling."
    };
  }

  return {
    collectionStatus: "PLAN_DEFINED_NOT_ACTIVE",
    reason: "Shadow quote collection plan defined; real quote polling NOT active."
  };
}

function collectR19ShadowQuoteCollectionStatus(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;

  const posture = readPosture(runtimeRoot);
  const recoveryAbsent = !fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"));

  const gateDocs = options.gateDocs || {
    r18: docExists(repoRoot, GATE_DOCS.r18),
    r19: docExists(repoRoot, GATE_DOCS.r19)
  };

  const r18HarnessPresent = options.r18HarnessPresent !== false &&
    artifactExists(repoRoot, ARTIFACTS.r18Harness);
  const r18FixturesPresent = artifactExists(repoRoot, ARTIFACTS.r18Fixtures);

  const liveQuotePollingActive = detectLiveQuotePollingFlag(repoRoot, options);

  const safetySuiteGreen = options.safetySuiteGreen !== undefined
    ? options.safetySuiteGreen === true
    : null;

  const context = {
    posture,
    recoveryAbsent,
    gateDocs,
    r18HarnessPresent,
    r18FixturesPresent,
    liveQuotePollingActive,
    safetySuiteGreen: safetySuiteGreen === true
  };

  const gate = deriveCollectionStatus(context);

  const blockers = [];
  if (!gateDocs.r18) blockers.push("R18 doc missing");
  if (!gateDocs.r19) blockers.push("R19 doc missing");
  if (!r18HarnessPresent) blockers.push("R18 harness missing");
  if (liveQuotePollingActive) blockers.push("live quote polling flag active — forbidden");
  if (posture.liveArmed === true) blockers.push("liveArmed true");
  if (posture.dryRunMode === false) blockers.push("dryRunMode false");
  if (posture.emergencyStop === true) blockers.push("emergencyStop true");
  if (!recoveryAbsent) blockers.push("recovery_actions.jsonl present");
  if (safetySuiteGreen === false) blockers.push("safety suite not green");
  blockers.push("real quote polling not activated");
  blockers.push("operator quote observation mode not approved");
  blockers.push("wallet not connected — required for collection plan only as no-wallet scope");

  return {
    timestamp: new Date().toISOString(),
    review: "R19-shadow-quote-collection-plan",
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
      r18Fixtures: r18FixturesPresent
    },
    liveQuotePollingActive,
    collectionScope: {
      quoteObservationOnly: true,
      signing: false,
      submission: false,
      walletRequired: false,
      privateKeyRequired: false,
      positionCreation: false,
      tradingStateMutation: false,
      liveConfigMutation: false,
      networkCalls: false
    },
    collectionLimits: COLLECTION_LIMITS,
    futureOutputs: {
      observationsJsonl: "analysis/shadow_quote_observations.jsonl",
      statusJson: "analysis/r19_shadow_quote_collection_status.json"
    },
    evaluation: {
      verdict: "SHADOW QUOTE COLLECTION PLAN DEFINED — NOT ACTIVE",
      collectionStatus: gate.collectionStatus,
      reason: gate.reason,
      approved: false
    },
    blockers: [...new Set(blockers)],
    recommendedNextGate:
      "Build R20 Fixture + Dry-Run Shadow Quote Collector (no network); then R21 Real Quote Observation Approval Gate; continue R7b; do not connect wallet; do not arm live"
  };
}

function printSummary(status) {
  console.log("[r19-collection] Shadow Quote Collection Plan (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  collection status: ${status.evaluation.collectionStatus}`);
  console.log(`  quote polling active: false`);
  console.log(`  approved: false`);
  console.log(`  R18 harness: ${status.artifacts.r18Harness === true}`);
  console.log(`  blockers: ${status.blockers.length}`);
}

function writeStatus(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runR19ShadowQuoteCollectionCheck(options = {}) {
  const status = collectR19ShadowQuoteCollectionStatus(options);
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
    const result = runR19ShadowQuoteCollectionCheck();
    if (result.outputFile) {
      console.log(`  status: ${result.outputFile}`);
    }
  } catch (err) {
    console.error("[r19-collection] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOCS,
  ARTIFACTS,
  COLLECTION_LIMITS,
  OUTPUT_FILE,
  readPosture,
  detectLiveQuotePollingFlag,
  deriveCollectionStatus,
  collectR19ShadowQuoteCollectionStatus,
  runR19ShadowQuoteCollectionCheck,
  writeStatus
};
