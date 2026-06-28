"use strict";

// r22_real_quote_observation_collector.js — Sprint 4 R22
// Disabled-by-default real quote observation collector skeleton. Writes analysis/ only.
// Does NOT poll live quotes, sign, submit, connect wallet, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R22_OUTPUT_DIR
  ? path.resolve(process.env.R22_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const STATUS_FILE = path.join(OUTPUT_DIR, "r22_real_quote_observation_status.json");
const DEFAULT_CONFIG_FILE = path.join(ROOT, "examples", "real_quote_observation_config.example.json");

const SCHEMA_VERSION = 1;
const SECRET_FIELD_PATTERN = /private[_-]?key|secret|seed|mnemonic|signer[_-]?secret|passphrase|api[_-]?key|wallet[_-]?private/i;
const LIVE_PROVIDER_PATTERN = /^(jupiter|gmgn|raydium|rpc|birdeye|helius|orca|meteora)$/i;
const FIXTURE_PROVIDER_PATTERN = /^(fixture|replay|local_fixture|local-fixture)$/i;
const FORBIDDEN_EXECUTION_MODES = new Set(["LIVE", "MICRO_LIVE"]);

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

function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return { status: "missing", config: null, error: "collector config missing" };
  }
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return { status: "present", config, configPath };
  } catch (err) {
    return {
      status: "corrupt",
      config: null,
      error: err && err.message ? err.message : String(err)
    };
  }
}

function normalizeProviders(providers) {
  if (!Array.isArray(providers)) return [];
  return providers.map((item) => {
    if (typeof item === "string") return item.trim();
    if (item && typeof item === "object" && item.name) return String(item.name).trim();
    return String(item);
  }).filter(Boolean);
}

function validateCollectorConfig(config) {
  const invalidReasons = [];
  if (!config || typeof config !== "object") {
    return { valid: false, invalidReasons: ["config missing or invalid"], secretHits: [] };
  }

  const secretHits = findSecretLikeFields(config);
  if (secretHits.length > 0) {
    invalidReasons.push(`secret-like fields: ${secretHits.join(", ")}`);
  }

  if (config.active === true) invalidReasons.push("active true forbidden in R22");
  if (config.networkPollingAllowed === true) invalidReasons.push("networkPollingAllowed true forbidden in R22");
  if (config.tradingAllowed === true) invalidReasons.push("tradingAllowed true forbidden");
  if (config.signingAllowed === true) invalidReasons.push("signingAllowed true forbidden");
  if (config.submissionAllowed === true) invalidReasons.push("submissionAllowed true forbidden");
  if (config.walletRequired === true) invalidReasons.push("walletRequired true forbidden");

  if (config.executionMode && FORBIDDEN_EXECUTION_MODES.has(String(config.executionMode).toUpperCase())) {
    invalidReasons.push(`executionMode ${config.executionMode} forbidden`);
  }
  if (config.dryRunMode === false) invalidReasons.push("dryRunMode false forbidden");
  if (config.liveArmed === true) invalidReasons.push("liveArmed true forbidden");

  const providers = normalizeProviders(config.providers);
  const liveProviders = providers.filter((name) => LIVE_PROVIDER_PATTERN.test(name));
  const fixtureProviders = providers.filter((name) => FIXTURE_PROVIDER_PATTERN.test(name));
  const unknownProviders = providers.filter(
    (name) => !LIVE_PROVIDER_PATTERN.test(name) && !FIXTURE_PROVIDER_PATTERN.test(name)
  );

  if (liveProviders.length > 0 && config.futureProviderApproved !== true) {
    invalidReasons.push(`live providers forbidden without future approval: ${liveProviders.join(", ")}`);
  }
  if (unknownProviders.length > 0) {
    invalidReasons.push(`unknown providers: ${unknownProviders.join(", ")}`);
  }

  const fixtureOnlyProviders =
    providers.length === 0 || providers.every((name) => FIXTURE_PROVIDER_PATTERN.test(name));

  return {
    valid: invalidReasons.length === 0,
    invalidReasons,
    secretHits,
    providers,
    liveProviders,
    fixtureProviders,
    fixtureOnlyProviders
  };
}

function deriveCollectorStatus(context) {
  if (context.configStatus === "missing" || context.configStatus === "corrupt") {
    return {
      collectorStatus: "INVALID_CONFIG",
      reason: context.configError || "Collector config missing or corrupt."
    };
  }

  if (context.configValidation && !context.configValidation.valid) {
    return {
      collectorStatus: "INVALID_CONFIG",
      reason: context.configValidation.invalidReasons.join("; ")
    };
  }

  if (
    !context.recoveryAbsent ||
    context.posture.liveArmed === true ||
    context.posture.dryRunMode === false ||
    context.posture.emergencyStop === true ||
    !isSafeObservationPosture(context.posture)
  ) {
    return {
      collectorStatus: "BLOCKED",
      reason: "Unsafe runtime posture or recovery_actions.jsonl present."
    };
  }

  const config = context.config || {};

  if (context.fixtureReplayMode === true && context.configValidation.fixtureOnlyProviders) {
    return {
      collectorStatus: "FIXTURE_REPLAY_ONLY",
      reason: "Fixture/replay mode only — no network polling."
    };
  }

  if (config.active !== true && config.networkPollingAllowed !== true) {
    if (context.enableProviderImplementationReview === true) {
      return {
        collectorStatus: "READY_FOR_REAL_PROVIDER_IMPLEMENTATION_REVIEW",
        reason: "Disabled skeleton ready for future real provider implementation review — polling NOT active."
      };
    }
    return {
      collectorStatus: "DISABLED",
      reason: "Collector disabled by default — no network polling."
    };
  }

  return {
    collectorStatus: "BLOCKED",
    reason: "Collector activation blocked — polling NOT permitted in R22."
  };
}

function collectR22RealQuoteObservationStatus(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const collectedAt = options.collectedAt || new Date().toISOString();

  const posture = readPosture(runtimeRoot);
  const recoveryAbsent = !fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"));

  let configLoad;
  if (options.config && typeof options.config === "object") {
    configLoad = { status: "present", config: options.config, configPath: "(inline fixture)" };
  } else {
    const configPath = options.configFile || DEFAULT_CONFIG_FILE;
    configLoad = loadConfig(configPath);
    if (configLoad.status === "present") {
      configLoad.configPath = configPath;
    }
  }

  const configValidation = configLoad.status === "present"
    ? validateCollectorConfig(configLoad.config)
    : null;

  const context = {
    configStatus: configLoad.status,
    configError: configLoad.error,
    config: configLoad.config,
    configValidation,
    posture,
    recoveryAbsent,
    fixtureReplayMode: options.fixtureReplayMode === true,
    enableProviderImplementationReview: options.enableProviderImplementationReview === true
  };

  const gate = deriveCollectorStatus(context);

  return {
    schemaVersion: SCHEMA_VERSION,
    timestamp: collectedAt,
    review: "R22-real-quote-observation-collector-disabled",
    liveTradingApproved: false,
    microLiveApproved: false,
    approved: false,
    quotePollingActive: false,
    networkPolling: false,
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false,
    capitalAtRiskUsd: 0,
    posture,
    recoveryActionsJsonl: { exists: !recoveryAbsent },
    config: {
      source: configLoad.configPath || DEFAULT_CONFIG_FILE,
      status: configLoad.status,
      active: configLoad.config ? configLoad.config.active === true : false,
      networkPollingAllowed: configLoad.config ? configLoad.config.networkPollingAllowed === true : false,
      providers: configValidation ? configValidation.providers : [],
      validation: configValidation
    },
    collectorStatus: gate.collectorStatus,
    observationCount: 0,
    evaluation: {
      verdict: "REAL QUOTE COLLECTOR SKELETON BUILT — DISABLED BY DEFAULT",
      collectorStatus: gate.collectorStatus,
      reason: gate.reason,
      approved: false
    },
    outputs: {
      observationsJsonl: configLoad.config?.outputPath || "analysis/real_quote_observations.jsonl",
      statusJson: options.statusFile || path.join(analysisDir, "r22_real_quote_observation_status.json")
    },
    recommendedNextGate:
      "Build R23 Real Provider Implementation Review (design-only, still disabled); continue R7b; do not connect wallet; do not arm live"
  };
}

function writeStatus(status, outputFile = STATUS_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[r22-collector] Real Quote Observation Collector (disabled by default)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  collector status: ${status.collectorStatus}`);
  console.log(`  approved: false`);
  console.log(`  network polling: false`);
  console.log(`  config active: ${status.config.active}`);
}

function runR22RealQuoteObservationCollector(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const statusFile = options.statusFile || path.join(analysisDir, "r22_real_quote_observation_status.json");

  const status = collectR22RealQuoteObservationStatus({
    ...options,
    analysisDir
  });

  if (options.writeOutput !== false) {
    writeStatus(status, statusFile);
  }

  if (options.print !== false) {
    printSummary(status);
  }

  return { status, statusFile: options.writeOutput !== false ? statusFile : null };
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--config" && argv[i + 1]) {
      options.configFile = path.resolve(argv[i + 1]);
      i += 1;
    }
    if (argv[i] === "--fixture-replay") {
      options.fixtureReplayMode = true;
    }
    if (argv[i] === "--provider-review") {
      options.enableProviderImplementationReview = true;
    }
  }
  return options;
}

if (require.main === module) {
  try {
    const result = runR22RealQuoteObservationCollector(parseCliArgs());
    if (result.statusFile) {
      console.log(`  status: ${result.statusFile}`);
    }
    process.exit(0);
  } catch (err) {
    console.error("[r22-collector] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  SCHEMA_VERSION,
  DEFAULT_CONFIG_FILE,
  STATUS_FILE,
  SECRET_FIELD_PATTERN,
  LIVE_PROVIDER_PATTERN,
  readPosture,
  loadConfig,
  validateCollectorConfig,
  deriveCollectorStatus,
  collectR22RealQuoteObservationStatus,
  writeStatus,
  runR22RealQuoteObservationCollector
};
