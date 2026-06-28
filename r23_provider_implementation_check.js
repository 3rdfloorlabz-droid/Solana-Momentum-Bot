"use strict";

// r23_provider_implementation_check.js — Sprint 4 R23
// Read-only real provider implementation review status. Writes analysis/ only.
// Does NOT activate network polling, sign, submit, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R23_OUTPUT_DIR
  ? path.resolve(process.env.R23_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r23_provider_implementation_status.json");
const DEFAULT_COLLECTOR_CONFIG = path.join(ROOT, "examples", "real_quote_observation_config.example.json");

const GATE_DOCS = {
  r21: "docs/R21_REAL_QUOTE_OBSERVATION_APPROVAL_GATE.md",
  r22: "docs/R22_REAL_QUOTE_OBSERVATION_COLLECTOR_DISABLED.md",
  r23: "docs/R23_REAL_PROVIDER_IMPLEMENTATION_REVIEW.md"
};

const ARTIFACTS = {
  r22Collector: "r22_real_quote_observation_collector.js",
  r22Config: "examples/real_quote_observation_config.example.json"
};

const PROVIDER_CANDIDATES = {
  jupiterQuoteProvider: { active: false, requiresApproval: true, mode: "OBSERVATION_ONLY" },
  gmgnQuoteLikeProvider: { active: false, requiresApproval: true, mode: "OBSERVATION_ONLY" },
  localFixtureProvider: { active: true, scope: "FIXTURE_ONLY" },
  replayProvider: { active: false, requiresApproval: true, mode: "OBSERVATION_ONLY" }
};

const SECRET_FIELD_PATTERN = /private[_-]?key|secret|seed|mnemonic|signer[_-]?secret|passphrase|api[_-]?key|wallet[_-]?private/i;
const LIVE_PROVIDER_PATTERN = /^(jupiter|gmgn|raydium|rpc|birdeye|helius|orca|meteora)$/i;

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

function normalizeProviders(providers) {
  if (!Array.isArray(providers)) return [];
  return providers.map((item) => {
    if (typeof item === "string") {
      return { name: item.trim(), enabled: false };
    }
    if (item && typeof item === "object") {
      return {
        name: String(item.name || item.providerName || item.provider || "").trim(),
        enabled: item.enabled === true,
        mode: item.mode || null
      };
    }
    return { name: String(item), enabled: false };
  }).filter((p) => p.name);
}

function analyzeProviderConfig(config) {
  if (!config || typeof config !== "object") {
    return {
      valid: false,
      secretHits: [],
      activeProvider: false,
      networkPollingAllowed: false,
      liveProviderEnabled: false,
      providers: []
    };
  }

  const secretHits = findSecretLikeFields(config);
  const providers = normalizeProviders(config.providers);
  const liveProviderEnabled = providers.some(
    (p) => LIVE_PROVIDER_PATTERN.test(p.name) && p.enabled === true
  );
  const activeProvider = config.active === true || providers.some((p) => p.enabled === true);

  return {
    valid: secretHits.length === 0,
    secretHits,
    activeProvider,
    networkPollingAllowed: config.networkPollingAllowed === true,
    liveProviderEnabled,
    providers,
    tradingAllowed: config.tradingAllowed === true,
    signingAllowed: config.signingAllowed === true,
    submissionAllowed: config.submissionAllowed === true,
    walletRequired: config.walletRequired === true
  };
}

function deriveProviderReviewStatus(context) {
  if (
    !context.gateDocs.r22 ||
    !context.gateDocs.r23 ||
    !context.r22CollectorPresent ||
    context.networkPollingActive ||
    context.posture.liveArmed === true ||
    context.posture.dryRunMode === false ||
    context.posture.emergencyStop === true ||
    !context.recoveryAbsent ||
    context.providerAnalysis.secretHits.length > 0 ||
    context.providerAnalysis.liveProviderEnabled ||
    context.providerAnalysis.activeProvider ||
    context.providerAnalysis.networkPollingAllowed ||
    context.providerAnalysis.tradingAllowed ||
    context.providerAnalysis.signingAllowed ||
    context.providerAnalysis.submissionAllowed ||
    context.providerAnalysis.walletRequired
  ) {
    return {
      reviewStatus: "BLOCKED",
      reason: "Missing docs/artifacts, unsafe posture, polling active, or forbidden provider config."
    };
  }

  if (!context.gateDocs.r21 || !context.r22ConfigPresent) {
    return {
      reviewStatus: "PROVIDER_DESIGN_DEFINED_NOT_ACTIVE",
      reason: "R23 provider design defined; prerequisites incomplete — polling NOT active."
    };
  }

  if (
    context.gateDocs.r21 &&
    context.gateDocs.r22 &&
    context.gateDocs.r23 &&
    context.r22CollectorPresent &&
    context.r22ConfigPresent &&
    isSafeObservationPosture(context.posture) &&
    context.recoveryAbsent &&
    !context.networkPollingActive &&
    !context.providerAnalysis.liveProviderEnabled &&
    !context.providerAnalysis.activeProvider
  ) {
    return {
      reviewStatus: "READY_FOR_DISABLED_PROVIDER_ADAPTER_SKELETON",
      reason: "Provider design complete — ready for R24 disabled adapter skeleton only (not live polling)."
    };
  }

  return {
    reviewStatus: "PROVIDER_DESIGN_DEFINED_NOT_ACTIVE",
    reason: "Real provider implementation design defined — NOT ACTIVE."
  };
}

function collectR23ProviderImplementationStatus(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;

  const posture = readPosture(runtimeRoot);
  const recoveryAbsent = !fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"));

  const gateDocs = options.gateDocs || {
    r21: docExists(repoRoot, GATE_DOCS.r21),
    r22: docExists(repoRoot, GATE_DOCS.r22),
    r23: docExists(repoRoot, GATE_DOCS.r23)
  };

  const r22CollectorPresent = options.r22CollectorPresent !== false &&
    artifactExists(repoRoot, ARTIFACTS.r22Collector);
  const r22ConfigPresent = options.r22ConfigPresent !== false &&
    artifactExists(repoRoot, ARTIFACTS.r22Config);

  const networkPollingActive = detectNetworkPollingActive(repoRoot, options);

  let collectorConfig;
  if (options.collectorConfig && typeof options.collectorConfig === "object") {
    collectorConfig = options.collectorConfig;
  } else {
    const loaded = readJsonIfPresent(options.collectorConfigFile || DEFAULT_COLLECTOR_CONFIG);
    collectorConfig = loaded.status === "present" ? loaded.data : null;
  }

  const providerAnalysis = analyzeProviderConfig(collectorConfig);

  const context = {
    gateDocs,
    r22CollectorPresent,
    r22ConfigPresent,
    posture,
    recoveryAbsent,
    networkPollingActive,
    providerAnalysis
  };

  const gate = deriveProviderReviewStatus(context);

  const blockers = [];
  if (!gateDocs.r22) blockers.push("R22 doc missing");
  if (!gateDocs.r23) blockers.push("R23 doc missing");
  if (!r22CollectorPresent) blockers.push("R22 collector missing");
  if (networkPollingActive) blockers.push("network polling active — forbidden");
  if (providerAnalysis.activeProvider) blockers.push("active provider config forbidden");
  if (providerAnalysis.liveProviderEnabled) blockers.push("live provider enabled — forbidden");
  if (providerAnalysis.networkPollingAllowed) blockers.push("networkPollingAllowed true — forbidden");
  if (providerAnalysis.secretHits.length > 0) blockers.push("secret-like fields in provider config");
  if (posture.liveArmed === true) blockers.push("liveArmed true");
  if (posture.dryRunMode === false) blockers.push("dryRunMode false");
  if (posture.emergencyStop === true) blockers.push("emergencyStop true");
  if (!recoveryAbsent) blockers.push("recovery_actions.jsonl present");
  blockers.push("real provider not implemented");
  blockers.push("quote polling not activated");
  blockers.push("operator approval not granted");

  return {
    timestamp: new Date().toISOString(),
    review: "R23-real-provider-implementation-review",
    liveTradingApproved: false,
    microLiveApproved: false,
    approved: false,
    quotePollingActive: false,
    capitalAtRiskUsd: 0,
    posture,
    recoveryActionsJsonl: { exists: !recoveryAbsent },
    gateDocs,
    artifacts: {
      r22Collector: r22CollectorPresent,
      r22Config: r22ConfigPresent
    },
    networkPollingActive,
    providerCandidates: PROVIDER_CANDIDATES,
    providerConfig: {
      source: options.collectorConfig ? "(inline fixture)" : DEFAULT_COLLECTOR_CONFIG,
      analysis: providerAnalysis
    },
    providerSafetyGates: {
      explicitOperatorApprovalRequired: true,
      providerAllowlistRequired: true,
      networkPollingAllowedOnlyWhenApproved: true,
      tradingAllowed: false,
      signingAllowed: false,
      submissionAllowed: false,
      walletRequired: false
    },
    implementationBlockers: [
      "no real provider implemented",
      "no active quote observation approval record",
      "no approved network config",
      "no provider allowlist enforced",
      "rate limits not tested",
      "stop switch not tested",
      "real quote collector not activated",
      "R24 activation review not complete"
    ],
    evaluation: {
      verdict: "REAL PROVIDER IMPLEMENTATION DESIGN DEFINED — NOT ACTIVE",
      reviewStatus: gate.reviewStatus,
      reason: gate.reason,
      approved: false
    },
    blockers: [...new Set(blockers)],
    recommendedNextGate:
      "Build R24 Provider Adapter Skeleton (disabled, no network by default); continue R7b; do not activate quote polling; do not connect wallet; do not arm live"
  };
}

function printSummary(status) {
  console.log("[r23-provider] Real Provider Implementation Review (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  review status: ${status.evaluation.reviewStatus}`);
  console.log(`  quote polling active: false`);
  console.log(`  approved: false`);
  console.log(`  live providers enabled: ${status.providerConfig.analysis.liveProviderEnabled === true}`);
  console.log(`  blockers: ${status.blockers.length}`);
}

function writeStatus(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runR23ProviderImplementationCheck(options = {}) {
  const status = collectR23ProviderImplementationStatus(options);
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
    const result = runR23ProviderImplementationCheck();
    if (result.outputFile) {
      console.log(`  status: ${result.outputFile}`);
    }
  } catch (err) {
    console.error("[r23-provider] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOCS,
  ARTIFACTS,
  PROVIDER_CANDIDATES,
  OUTPUT_FILE,
  DEFAULT_COLLECTOR_CONFIG,
  readPosture,
  detectNetworkPollingActive,
  analyzeProviderConfig,
  deriveProviderReviewStatus,
  collectR23ProviderImplementationStatus,
  runR23ProviderImplementationCheck,
  writeStatus
};
