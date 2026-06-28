"use strict";

// r24_provider_adapter_skeleton.js — Sprint 4 R24
// Disabled-by-default provider adapter skeleton. Writes analysis/ only.
// Does NOT call network, poll live quotes, sign, submit, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const r20 = require("./r20_shadow_quote_collector");
const r18 = require("./r18_shadow_quote_review");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R24_OUTPUT_DIR
  ? path.resolve(process.env.R24_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const STATUS_FILE = path.join(OUTPUT_DIR, "r24_provider_adapter_status.json");
const DEFAULT_CONFIG_FILE = path.join(ROOT, "examples", "provider_adapter_config.example.json");
const DEFAULT_FIXTURE_FILE = path.join(ROOT, "examples", "shadow_quote_candidates.example.json");

const SCHEMA_VERSION = 1;
const SECRET_FIELD_PATTERN = /private[_-]?key|secret|seed|mnemonic|signer[_-]?secret|passphrase|api[_-]?key|wallet[_-]?private/i;
const LIVE_PROVIDER_PATTERN = /^(jupiter|gmgn|raydium|rpc|birdeye|helius|orca|meteora)$/i;
const FIXTURE_PROVIDER_PATTERN = /^(fixture|replay|local_fixture|local-fixture)$/i;

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
    return { status: "missing", config: null, error: "provider adapter config missing" };
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
    if (typeof item === "string") {
      return { name: item.trim().toLowerCase(), enabled: false, stub: false };
    }
    if (item && typeof item === "object") {
      return {
        name: String(item.name || item.providerName || "").trim().toLowerCase(),
        enabled: item.enabled === true,
        mode: item.mode || null,
        stub: item.stub === true
      };
    }
    return { name: String(item).toLowerCase(), enabled: false, stub: false };
  }).filter((p) => p.name);
}

function validateAdapterConfig(config) {
  const invalidReasons = [];
  if (!config || typeof config !== "object") {
    return { valid: false, invalidReasons: ["config missing or invalid"], secretHits: [], providers: [] };
  }

  const secretHits = findSecretLikeFields(config);
  if (secretHits.length > 0) {
    invalidReasons.push(`secret-like fields: ${secretHits.join(", ")}`);
  }

  if (config.active === true) invalidReasons.push("active true forbidden in R24");
  if (config.networkPollingAllowed === true) invalidReasons.push("networkPollingAllowed true forbidden");
  if (config.tradingAllowed === true) invalidReasons.push("tradingAllowed true forbidden");
  if (config.signingAllowed === true) invalidReasons.push("signingAllowed true forbidden");
  if (config.submissionAllowed === true) invalidReasons.push("submissionAllowed true forbidden");
  if (config.walletRequired === true) invalidReasons.push("walletRequired true forbidden");

  const providers = normalizeProviders(config.providers);
  const liveEnabled = providers.filter(
    (p) => LIVE_PROVIDER_PATTERN.test(p.name) && p.enabled === true
  );
  if (liveEnabled.length > 0) {
    invalidReasons.push(`live provider enabled forbidden: ${liveEnabled.map((p) => p.name).join(", ")}`);
  }

  const fixtureEnabled = providers.some((p) => p.name === "fixture" && p.enabled === true);
  const replayEnabled = providers.some((p) => p.name === "replay" && p.enabled === true);

  return {
    valid: invalidReasons.length === 0,
    invalidReasons,
    secretHits,
    providers,
    fixtureEnabled,
    replayEnabled,
    liveStubsPresent: providers.some((p) => LIVE_PROVIDER_PATTERN.test(p.name) && p.enabled !== true)
  };
}

function loadFixtureCandidates(fixturePath = DEFAULT_FIXTURE_FILE) {
  const loaded = r20.loadCandidates(fixturePath);
  return loaded.status === "present" ? loaded.candidates.slice(0, 1) : [];
}

function normalizeFixtureQuoteRecord(candidate, providerName, collectedAt, nowMs) {
  const quote = r20.buildQuoteFromCandidate(candidate, collectedAt);
  const evaluation = r18.evaluateShadowQuote(quote, { nowMs });
  const observation = r20.buildObservation(candidate, quote, evaluation, collectedAt);
  return {
    ...observation,
    provider: providerName,
    adapterMode: providerName === "replay" ? "REPLAY_ONLY" : "FIXTURE_ONLY",
    networkPolling: false,
    approved: false,
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false
  };
}

function deriveAdapterStatus(context) {
  if (context.configStatus === "missing" || context.configStatus === "corrupt") {
    return {
      adapterStatus: "INVALID_CONFIG",
      reason: context.configError || "Provider adapter config missing or corrupt."
    };
  }

  if (context.validation && !context.validation.valid) {
    return {
      adapterStatus: "INVALID_CONFIG",
      reason: context.validation.invalidReasons.join("; ")
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
      adapterStatus: "BLOCKED",
      reason: "Unsafe runtime posture or recovery_actions.jsonl present."
    };
  }

  const config = context.config || {};

  if (context.enableActivationApprovalReview === true && config.active !== true) {
    return {
      adapterStatus: "READY_FOR_ACTIVATION_APPROVAL_REVIEW",
      reason: "Disabled adapter skeleton ready for R25 activation approval review only — network OFF."
    };
  }

  if (context.validation.replayEnabled && context.adapterMode === "replay") {
    return {
      adapterStatus: "REPLAY_PROVIDER_READY",
      reason: "Replay provider ready — fixture/replay only, no network."
    };
  }

  if (context.validation.fixtureEnabled && context.adapterMode === "fixture") {
    return {
      adapterStatus: "FIXTURE_PROVIDER_READY",
      reason: "Fixture provider ready — no network polling."
    };
  }

  if (config.active !== true && config.networkPollingAllowed !== true) {
    return {
      adapterStatus: "DISABLED",
      reason: "Provider adapter disabled by default — network OFF."
    };
  }

  return {
    adapterStatus: "BLOCKED",
    reason: "Provider adapter activation blocked — network OFF."
  };
}

function collectR24ProviderAdapterStatus(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const collectedAt = options.collectedAt || new Date().toISOString();
  const nowMs = options.nowMs ?? Date.parse(collectedAt);

  const posture = readPosture(runtimeRoot);
  const recoveryAbsent = !fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"));

  let configLoad;
  if (options.config && typeof options.config === "object") {
    configLoad = { status: "present", config: options.config, configPath: "(inline fixture)" };
  } else {
    const configPath = options.configFile || DEFAULT_CONFIG_FILE;
    configLoad = loadConfig(configPath);
    if (configLoad.status === "present") configLoad.configPath = configPath;
  }

  const validation = configLoad.status === "present"
    ? validateAdapterConfig(configLoad.config)
    : null;

  const adapterMode = options.adapterMode || null;
  const normalizedRecords = [];

  if (validation && validation.valid && validation.fixtureEnabled && adapterMode === "fixture") {
    const candidates = options.candidates || loadFixtureCandidates(options.fixtureFile);
    for (const candidate of candidates) {
      normalizedRecords.push(
        normalizeFixtureQuoteRecord(candidate, "fixture", collectedAt, nowMs)
      );
    }
  }

  if (validation && validation.valid && validation.replayEnabled && adapterMode === "replay") {
    const candidates = options.candidates || loadFixtureCandidates(options.fixtureFile);
    for (const candidate of candidates) {
      normalizedRecords.push(
        normalizeFixtureQuoteRecord(candidate, "replay", collectedAt, nowMs)
      );
    }
  }

  const context = {
    configStatus: configLoad.status,
    configError: configLoad.error,
    config: configLoad.config,
    validation,
    posture,
    recoveryAbsent,
    adapterMode,
    enableActivationApprovalReview: options.enableActivationApprovalReview === true
  };

  const gate = deriveAdapterStatus(context);

  return {
    schemaVersion: SCHEMA_VERSION,
    timestamp: collectedAt,
    review: "R24-disabled-provider-adapter-skeleton",
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
      validation
    },
    adapterStatus: gate.adapterStatus,
    normalizedRecordCount: normalizedRecords.length,
    normalizedRecords,
    evaluation: {
      verdict: "DISABLED PROVIDER ADAPTER SKELETON BUILT — NETWORK OFF",
      adapterStatus: gate.adapterStatus,
      reason: gate.reason,
      approved: false
    },
    outputs: {
      observationsPath: configLoad.config?.output?.observationsPath || "analysis/real_quote_observations.jsonl",
      statusJson: options.statusFile || path.join(analysisDir, "r24_provider_adapter_status.json")
    },
    recommendedNextGate:
      "Complete R25 activation approval record review; continue R7b; do not activate quote polling; do not connect wallet"
  };
}

function writeStatus(status, outputFile = STATUS_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const { normalizedRecords, ...summary } = status;
  fs.writeFileSync(outputFile, `${JSON.stringify(summary, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[r24-adapter] Disabled Provider Adapter Skeleton");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  adapter status: ${status.adapterStatus}`);
  console.log(`  approved: false`);
  console.log(`  network polling: false`);
  console.log(`  normalized records: ${status.normalizedRecordCount}`);
}

function runR24ProviderAdapterSkeleton(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const statusFile = options.statusFile || path.join(analysisDir, "r24_provider_adapter_status.json");

  const status = collectR24ProviderAdapterStatus({
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
    if (argv[i] === "--fixture") {
      options.adapterMode = "fixture";
    }
    if (argv[i] === "--replay") {
      options.adapterMode = "replay";
    }
    if (argv[i] === "--activation-review") {
      options.enableActivationApprovalReview = true;
    }
  }
  return options;
}

if (require.main === module) {
  try {
    const result = runR24ProviderAdapterSkeleton(parseCliArgs());
    if (result.statusFile) {
      console.log(`  status: ${result.statusFile}`);
    }
    process.exit(0);
  } catch (err) {
    console.error("[r24-adapter] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  SCHEMA_VERSION,
  DEFAULT_CONFIG_FILE,
  STATUS_FILE,
  readPosture,
  loadConfig,
  validateAdapterConfig,
  normalizeFixtureQuoteRecord,
  deriveAdapterStatus,
  collectR24ProviderAdapterStatus,
  runR24ProviderAdapterSkeleton,
  writeStatus
};
