"use strict";

// r17_simulated_micro_live_harness.js — Sprint 4 R17
// Simulated micro-live config + approval validation. Writes analysis/ only.
// Does NOT approve micro-live, connect wallets, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R17_OUTPUT_DIR
  ? path.resolve(process.env.R17_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r17_simulated_micro_live_status.json");

const DEFAULT_CONFIG_FILE = path.join(ROOT, "examples", "micro_live_config.example.json");
const DEFAULT_APPROVAL_FILE = path.join(ROOT, "examples", "r15_manual_approval_record.example.json");

const LIMITS = {
  maxAuthorizedSessionAllocationSol: 0.05,
  maxFirstTradeSol: 0.01,
  maxOpenPositions: 1
};

const SIMULATED_WALLET_MARKERS = [
  "SIMULATED",
  "EXAMPLE",
  "DO_NOT_USE",
  "FAKE",
  "TEST_FIXTURE"
];

const SECRET_FIELD_PATTERN = /private[_-]?key|secret|seed|mnemonic|signer[_-]?secret|passphrase|api[_-]?key/i;

const REQUIRED_ACK_FIELDS = [
  "r7bBypassRiskAcknowledged",
  "totalLossRiskAcknowledged",
  "slippageCapAcknowledged",
  "mevProtectionPlanAcknowledged",
  "emergencyStopPolicyAcknowledged",
  "noAutoCompoundingAcknowledged",
  "noAveragingDownAcknowledged",
  "noUnattendedExecutionAcknowledged",
  "liveTradingNotForIncomeAcknowledged"
];

const REVIEWABLE_APPROVAL_STATUSES = [
  "APPROVED FOR FINAL REVIEW ONLY",
  "SIMULATION_REVIEWABLE_ONLY"
];

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

function findSecretLikeFields(obj, prefix = "") {
  const hits = [];
  if (!obj || typeof obj !== "object") return hits;
  for (const [key, value] of Object.entries(obj)) {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    if (SECRET_FIELD_PATTERN.test(key)) {
      hits.push(pathKey);
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      hits.push(...findSecretLikeFields(value, pathKey));
    }
  }
  return hits;
}

function isSimulatedWalletAddress(address, allowSimulatedWalletAddress) {
  if (!address || typeof address !== "string") return false;
  if (allowSimulatedWalletAddress === true) return true;
  const upper = address.toUpperCase();
  return SIMULATED_WALLET_MARKERS.some((m) => upper.includes(m));
}

function looksLikeRealSolanaAddress(address) {
  if (!address || typeof address !== "string") return false;
  if (isSimulatedWalletAddress(address, false)) return false;
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== "object") return null;
  return raw;
}

function normalizeApproval(raw) {
  if (!raw || typeof raw !== "object") return null;
  return raw;
}

function validateConfig(config, options = {}) {
  const blockers = [];
  const invalidReasons = [];

  if (!config) {
    invalidReasons.push("config missing or corrupt");
    return { valid: false, blockers, invalidReasons, exampleOnly: false };
  }

  const secretFields = findSecretLikeFields(config);
  if (secretFields.length > 0) {
    invalidReasons.push(`secret-like fields in config: ${secretFields.join(", ")}`);
  }

  if (config.configType !== "EXAMPLE_ONLY" && options.requireExampleOnly !== false) {
    blockers.push("configType is not EXAMPLE_ONLY");
  }

  if (config.active === true) blockers.push("config active is true");
  if (config.executionMode === "MICRO_LIVE" || config.executionMode === "LIVE") {
    blockers.push("executionMode is MICRO_LIVE or LIVE");
  }
  if (config.dryRunMode === false) blockers.push("dryRunMode is false");
  if (config.liveArmed === true) blockers.push("liveArmed is true");

  const wallet = config.walletPublicAddress;
  if (looksLikeRealSolanaAddress(wallet) && !options.allowSimulatedWalletAddress) {
    blockers.push("wallet public address appears real — example/fixture only");
  }

  const allocation = Number(config.authorizedSessionAllocationSol);
  if (!Number.isFinite(allocation) || allocation > LIMITS.maxAuthorizedSessionAllocationSol) {
    blockers.push("authorized allocation exceeds 0.05 SOL default cap");
  }

  const maxTrade = Number(config.maxFirstTradeSol);
  if (!Number.isFinite(maxTrade) || maxTrade > LIMITS.maxFirstTradeSol) {
    blockers.push("first trade size exceeds 0.01 SOL default cap");
  }

  const maxOpen = Number(config.maxOpenPositions);
  if (!Number.isFinite(maxOpen) || maxOpen > LIMITS.maxOpenPositions) {
    blockers.push("max open positions exceeds 1");
  }

  if (config.autoCompounding === true) blockers.push("autoCompounding is true");
  if (config.scaling === true) blockers.push("scaling is true");
  if (config.averagingDown === true) blockers.push("averagingDown is true");
  if (config.unattendedSessionAllowed === true) blockers.push("unattended session allowed");

  if (config.hardRejectSlippageBps == null) blockers.push("slippage hard reject missing");
  if (config.quoteMaxAgeSeconds == null) blockers.push("quote freshness missing");
  if (!config.mevProtectionMode) blockers.push("MEV policy missing");

  const liquidity = Number(config.walletLiquiditySol);
  const auth = Number(config.authorizedSessionAllocationSol);
  if (Number.isFinite(liquidity) && Number.isFinite(auth) && auth > liquidity) {
    blockers.push("authorized allocation exceeds wallet liquidity in config");
  }

  const exampleOnly =
    config.configType === "EXAMPLE_ONLY" &&
    config.active !== true &&
    isSimulatedWalletAddress(wallet, options.allowSimulatedWalletAddress);

  return {
    valid: blockers.length === 0 && invalidReasons.length === 0,
    blockers,
    invalidReasons,
    exampleOnly,
    walletLiquidityNotFullRisk: Number.isFinite(liquidity) && liquidity > auth
  };
}

function validateApproval(approval, config, options = {}) {
  const blockers = [];
  const invalidReasons = [];

  if (!approval) {
    blockers.push("approval record missing");
    return { valid: false, blockers, invalidReasons, reviewable: false };
  }

  const secretFields = findSecretLikeFields(approval);
  if (secretFields.length > 0) {
    invalidReasons.push(`secret-like fields in approval: ${secretFields.join(", ")}`);
  }

  const status = approval.approvalStatus || "NOT APPROVED";
  const simulationReviewable =
    approval.simulationReviewable === true ||
    REVIEWABLE_APPROVAL_STATUSES.includes(status);

  if (status === "NOT APPROVED" && !simulationReviewable) {
    blockers.push("approval status is NOT APPROVED");
  }

  const allocation = Number(approval.authorizedSessionAllocationSol);
  if (!Number.isFinite(allocation) || allocation > LIMITS.maxAuthorizedSessionAllocationSol) {
    blockers.push("approval allocation exceeds 0.05 SOL cap");
  }

  const maxTrade = Number(approval.maxTradeSizeSol);
  if (!Number.isFinite(maxTrade) || maxTrade > LIMITS.maxFirstTradeSol) {
    blockers.push("approval max trade exceeds 0.01 SOL cap");
  }

  const acksComplete = REQUIRED_ACK_FIELDS.every((field) => approval[field] === true);
  if (!acksComplete) {
    blockers.push("required acknowledgments missing or false");
  }

  if (config?.r7bBypassAcknowledgmentRequired === true && approval.r7bBypassRiskAcknowledged !== true) {
    blockers.push("R7b bypass acknowledgment required but not acknowledged");
  }

  if (approval.operatorSignaturePresent !== true && simulationReviewable) {
    blockers.push("operator signature not recorded for reviewable fixture");
  }

  const wallet = approval.walletPublicAddress;
  if (looksLikeRealSolanaAddress(wallet) && !options.allowSimulatedWalletAddress) {
    blockers.push("approval wallet address appears real");
  }

  const reviewable =
    simulationReviewable &&
    acksComplete &&
    blockers.filter((b) => b !== "approval status is NOT APPROVED").length === 0;

  return {
    valid: blockers.length === 0 && invalidReasons.length === 0,
    blockers,
    invalidReasons,
    reviewable,
    acksComplete
  };
}

function deriveHarnessStatus(context) {
  if (context.configValidation.invalidReasons.length > 0 ||
      context.approvalValidation.invalidReasons.length > 0) {
    return {
      harnessStatus: "INVALID_EXAMPLE",
      reason: "Example/fixture contains invalid or forbidden fields."
    };
  }

  if (
    !context.recoveryAbsent ||
    context.posture.liveArmed === true ||
    context.posture.emergencyStop === true ||
    context.configValidation.blockers.length > 0 ||
    context.approvalValidation.blockers.length > 0
  ) {
    return {
      harnessStatus: "BLOCKED",
      reason: "Simulation validation failed — live remains blocked."
    };
  }

  if (
    context.configValidation.exampleOnly &&
    context.approvalValidation.reviewable &&
    context.approvalValidation.acksComplete
  ) {
    if (context.enableShadowQuoteDesignReview === true) {
      return {
        harnessStatus: "READY_FOR_SHADOW_QUOTE_DESIGN_REVIEW",
        reason: "Simulation reviewable — ready for shadow-quote design review only (not live)."
      };
    }
    return {
      harnessStatus: "SIMULATION_REVIEWABLE_ONLY",
      reason: "Simulation fixture passes review checks — live trading still NOT approved."
    };
  }

  return {
    harnessStatus: "BLOCKED",
    reason: "Default example or incomplete fixture — blocked."
  };
}

function collectR17SimulatedMicroLiveStatus(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;

  const configFile = options.configFile || DEFAULT_CONFIG_FILE;
  const approvalFile = options.approvalFile || DEFAULT_APPROVAL_FILE;

  const configResult = options.config
    ? { status: "present", data: options.config }
    : readJsonIfPresent(configFile);
  const approvalResult = options.approvalRecord
    ? { status: "present", data: options.approvalRecord }
    : readJsonIfPresent(approvalFile);

  const config = normalizeConfig(configResult.data);
  const approval = normalizeApproval(approvalResult.data);
  const posture = readPosture(runtimeRoot);
  const recoveryAbsent = !fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"));

  const harnessOptions = {
    allowSimulatedWalletAddress: options.allowSimulatedWalletAddress === true,
    requireExampleOnly: options.requireExampleOnly !== false
  };

  const configValidation = validateConfig(config, harnessOptions);
  const approvalValidation = validateApproval(approval, config, harnessOptions);

  const context = {
    posture,
    recoveryAbsent,
    configValidation,
    approvalValidation,
    enableShadowQuoteDesignReview: options.enableShadowQuoteDesignReview === true
  };

  const gate = deriveHarnessStatus(context);

  return {
    timestamp: new Date().toISOString(),
    review: "R17-simulated-micro-live-config-approval-harness",
    liveTradingApproved: false,
    microLiveApproved: false,
    approved: false,
    capitalAtRiskUsd: 0,
    posture,
    recoveryActionsJsonl: { exists: !recoveryAbsent },
    sources: {
      configFile: options.config ? "(inline fixture)" : configFile,
      configStatus: configResult.status,
      approvalFile: options.approvalRecord ? "(inline fixture)" : approvalFile,
      approvalStatus: approvalResult.status
    },
    limits: LIMITS,
    configValidation,
    approvalValidation,
    evaluation: {
      verdict: "SIMULATED HARNESS BUILT — LIVE STILL BLOCKED",
      harnessStatus: gate.harnessStatus,
      reason: gate.reason,
      approved: false
    },
    validationSummary: {
      exampleConfigOnly: configValidation.exampleOnly === true,
      walletLiquidityNotFullRisk: configValidation.walletLiquidityNotFullRisk === true,
      allocationWithinCap: configValidation.blockers.every((b) => !b.includes("allocation")),
      slippagePolicyPresent: config?.hardRejectSlippageBps != null,
      mevPolicyPresent: Boolean(config?.mevProtectionMode),
      perTradeApprovalRequired: config?.perTradeApprovalRequired === true
    },
    recommendedNextGate:
      "R18 Shadow-Quote Design Review when ready; continue R7b; do not connect wallet; do not arm live"
  };
}

function printSummary(status) {
  console.log("[r17-sim] Simulated Micro-Live Config + Approval Harness (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  harness status: ${status.evaluation.harnessStatus}`);
  console.log(`  approved: false`);
  console.log(`  live trading approved: false`);
  console.log(`  config: ${status.sources.configStatus}`);
  console.log(`  approval: ${status.sources.approvalStatus}`);
  console.log(`  example config only: ${status.validationSummary.exampleConfigOnly}`);
}

function writeStatus(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runR17SimulatedMicroLiveHarness(options = {}) {
  const status = collectR17SimulatedMicroLiveStatus(options);
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
    const result = runR17SimulatedMicroLiveHarness();
    if (result.outputFile) {
      console.log(`  status: ${result.outputFile}`);
    }
  } catch (err) {
    console.error("[r17-sim] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  LIMITS,
  DEFAULT_CONFIG_FILE,
  DEFAULT_APPROVAL_FILE,
  OUTPUT_FILE,
  readPosture,
  findSecretLikeFields,
  isSimulatedWalletAddress,
  validateConfig,
  validateApproval,
  deriveHarnessStatus,
  collectR17SimulatedMicroLiveStatus,
  runR17SimulatedMicroLiveHarness,
  writeStatus
};
