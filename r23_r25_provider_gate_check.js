"use strict";

// r23_r25_provider_gate_check.js — Sprint 4 R23-R25 combined
// Read-only provider gate status across R23/R24/R25. Writes analysis/ only.
// Does NOT activate network polling, sign, submit, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const r24 = require("./r24_provider_adapter_skeleton");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R23R25_OUTPUT_DIR
  ? path.resolve(process.env.R23R25_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r23_r25_provider_gate_status.json");

const GATE_DOCS = {
  r23: "docs/R23_REAL_PROVIDER_IMPLEMENTATION_REVIEW.md",
  r24: "docs/R24_DISABLED_PROVIDER_ADAPTER_SKELETON.md",
  r25: "docs/R25_REAL_QUOTE_OBSERVATION_ACTIVATION_APPROVAL_RECORD.md"
};

const ARTIFACTS = {
  r24Adapter: "r24_provider_adapter_skeleton.js",
  adapterConfig: "examples/provider_adapter_config.example.json",
  activationRecord: "examples/r25_quote_observation_activation_record.example.json"
};

const SECRET_FIELD_PATTERN = /private[_-]?key|secret|seed|mnemonic|signer[_-]?secret|passphrase|api[_-]?key|wallet[_-]?private/i;

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

function validateActivationRecord(record) {
  const issues = [];
  if (!record || typeof record !== "object") {
    return { valid: false, defaultNotApproved: false, reviewableOnly: false, issues: ["activation record missing"] };
  }

  const secretHits = findSecretLikeFields(record);
  if (secretHits.length > 0) issues.push(`secret-like fields: ${secretHits.join(", ")}`);

  const forbiddenTrue = ["tradingAllowed", "signingAllowed", "submissionAllowed", "walletRequired"]
    .filter((field) => record[field] === true);
  if (forbiddenTrue.length > 0) {
    issues.push(`forbidden fields true: ${forbiddenTrue.join(", ")}`);
  }

  if (record.networkPollingAllowed === true) {
    issues.push("networkPollingAllowed true forbidden without explicit future approval");
  }

  const approvalStatus = record.approvalStatus || "NOT_APPROVED";
  const defaultNotApproved = approvalStatus === "NOT_APPROVED" || approvalStatus === "NOT APPROVED";

  const ackFields = [
    "stopConditionsAcknowledged",
    "noWalletAcknowledged",
    "noSigningAcknowledged",
    "noSubmissionAcknowledged",
    "rateLimitAcknowledged",
    "costAcknowledged"
  ];
  const acksComplete = ackFields.every((field) => record[field] === true);
  const reviewableOnly =
    forbiddenTrue.length === 0 &&
    secretHits.length === 0 &&
    record.networkPollingAllowed !== true &&
    acksComplete &&
    defaultNotApproved;

  return {
    valid: issues.length === 0,
    defaultNotApproved,
    reviewableOnly,
    secretHits,
    issues
  };
}

function deriveCombinedGateStatus(context) {
  if (
    !context.gateDocs.r23 ||
    !context.gateDocs.r24 ||
    !context.gateDocs.r25 ||
    !context.r24AdapterPresent ||
    context.adapterConfigStatus === "missing" ||
    context.adapterConfigStatus === "corrupt" ||
    context.activationRecordStatus === "missing" ||
    context.activationRecordStatus === "corrupt" ||
    context.networkPollingActive ||
    context.posture.liveArmed === true ||
    context.posture.dryRunMode === false ||
    context.posture.emergencyStop === true ||
    !context.recoveryAbsent ||
    (context.adapterValidation && !context.adapterValidation.valid) ||
    (context.activationValidation && !context.activationValidation.valid)
  ) {
    return {
      gateStatus: "BLOCKED",
      reason: "Missing docs/artifacts, unsafe posture, polling active, or invalid config/record."
    };
  }

  if (
    context.requireActivationRecord &&
    context.activationRecordStatus === "missing"
  ) {
    return {
      gateStatus: "BLOCKED",
      reason: "Activation record missing."
    };
  }

  if (
    context.gateDocs.r23 &&
    context.gateDocs.r24 &&
    context.gateDocs.r25 &&
    context.r24AdapterPresent &&
    isSafeObservationPosture(context.posture) &&
    context.recoveryAbsent &&
    !context.networkPollingActive &&
    context.adapterValidation.valid &&
    context.activationValidation.defaultNotApproved
  ) {
    if (context.enableFutureActivationReview === true) {
      return {
        gateStatus: "READY_FOR_FUTURE_ACTIVATION_REVIEW",
        reason: "Provider gates complete — ready for future activation review only (not approved, polling OFF)."
      };
    }
    return {
      gateStatus: "READY_FOR_DISABLED_ADAPTER_REVIEW",
      reason: "Provider gates complete — disabled adapter review ready (network OFF)."
    };
  }

  return {
    gateStatus: "PROVIDER_GATES_DEFINED_NOT_ACTIVE",
    reason: "R23-R25 provider gates defined — polling NOT active."
  };
}

function collectR23R25ProviderGateStatus(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;

  const posture = readPosture(runtimeRoot);
  const recoveryAbsent = !fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"));

  const gateDocs = options.gateDocs || {
    r23: docExists(repoRoot, GATE_DOCS.r23),
    r24: docExists(repoRoot, GATE_DOCS.r24),
    r25: docExists(repoRoot, GATE_DOCS.r25)
  };

  const r24AdapterPresent = options.r24AdapterPresent !== false &&
    artifactExists(repoRoot, ARTIFACTS.r24Adapter);

  let adapterConfig;
  if (options.adapterConfig && typeof options.adapterConfig === "object") {
    adapterConfig = { status: "present", data: options.adapterConfig };
  } else {
    const configPath = options.adapterConfigFile ||
      path.join(repoRoot, ARTIFACTS.adapterConfig);
    adapterConfig = readJsonIfPresent(configPath);
  }

  let activationRecord;
  if (options.activationRecord && typeof options.activationRecord === "object") {
    activationRecord = { status: "present", data: options.activationRecord };
  } else {
    const recordPath = options.activationRecordFile ||
      path.join(repoRoot, ARTIFACTS.activationRecord);
    activationRecord = readJsonIfPresent(recordPath);
  }

  const adapterValidation = adapterConfig.status === "present"
    ? r24.validateAdapterConfig(adapterConfig.data)
    : null;

  const activationValidation = activationRecord.status === "present"
    ? validateActivationRecord(activationRecord.data)
    : null;

  const networkPollingActive = detectNetworkPollingActive(repoRoot, options);

  const context = {
    gateDocs,
    r24AdapterPresent,
    adapterConfigStatus: adapterConfig.status,
    activationRecordStatus: activationRecord.status,
    adapterValidation,
    activationValidation,
    posture,
    recoveryAbsent,
    networkPollingActive,
    requireActivationRecord: options.requireActivationRecord === true,
    enableFutureActivationReview: options.enableFutureActivationReview === true
  };

  const gate = deriveCombinedGateStatus(context);

  const blockers = [];
  if (!gateDocs.r23) blockers.push("R23 doc missing");
  if (!gateDocs.r24) blockers.push("R24 doc missing");
  if (!gateDocs.r25) blockers.push("R25 doc missing");
  if (!r24AdapterPresent) blockers.push("R24 adapter skeleton missing");
  if (adapterConfig.status === "missing") blockers.push("provider adapter config missing");
  if (activationRecord.status === "missing") blockers.push("activation record example missing");
  if (networkPollingActive) blockers.push("network polling active — forbidden");
  if (adapterValidation && !adapterValidation.valid) {
    blockers.push(...adapterValidation.invalidReasons);
  }
  if (activationValidation && !activationValidation.valid) {
    blockers.push(...activationValidation.issues);
  }
  if (posture.liveArmed === true) blockers.push("liveArmed true");
  if (posture.dryRunMode === false) blockers.push("dryRunMode false");
  if (!recoveryAbsent) blockers.push("recovery_actions.jsonl present");
  blockers.push("quote polling not activated");
  blockers.push("activation not approved");

  return {
    timestamp: new Date().toISOString(),
    review: "R23-R25-combined-provider-gate-check",
    liveTradingApproved: false,
    microLiveApproved: false,
    approved: false,
    quotePollingActive: false,
    capitalAtRiskUsd: 0,
    posture,
    recoveryActionsJsonl: { exists: !recoveryAbsent },
    gateDocs,
    artifacts: {
      r24Adapter: r24AdapterPresent,
      adapterConfig: adapterConfig.status,
      activationRecord: activationRecord.status
    },
    networkPollingActive,
    adapterConfigAnalysis: adapterValidation,
    activationRecordAnalysis: activationValidation,
    evaluation: {
      verdict: "R23-R25 PROVIDER GATES DEFINED — NOT ACTIVE",
      gateStatus: gate.gateStatus,
      reason: gate.reason,
      approved: false,
      r23Verdict: "REAL PROVIDER IMPLEMENTATION DESIGN DEFINED — NOT ACTIVE",
      r24Verdict: "DISABLED PROVIDER ADAPTER SKELETON BUILT — NETWORK OFF",
      r25Verdict: "ACTIVATION APPROVAL RECORD DEFINED — NOT APPROVED"
    },
    blockers: [...new Set(blockers)],
    recommendedNextGate:
      "Future operator activation review session only; continue R7b; do not activate quote polling; do not connect wallet; do not arm live"
  };
}

function printSummary(status) {
  console.log("[r23-r25-gate] Combined Provider Gate Check (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  gate status: ${status.evaluation.gateStatus}`);
  console.log(`  approved: false`);
  console.log(`  quote polling active: false`);
  console.log(`  activation default NOT_APPROVED: ${status.activationRecordAnalysis?.defaultNotApproved === true}`);
  console.log(`  blockers: ${status.blockers.length}`);
}

function writeStatus(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runR23R25ProviderGateCheck(options = {}) {
  const status = collectR23R25ProviderGateStatus(options);
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
    const result = runR23R25ProviderGateCheck({
      enableFutureActivationReview: false
    });
    if (result.outputFile) {
      console.log(`  status: ${result.outputFile}`);
    }
  } catch (err) {
    console.error("[r23-r25-gate] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOCS,
  ARTIFACTS,
  OUTPUT_FILE,
  readPosture,
  detectNetworkPollingActive,
  validateActivationRecord,
  deriveCombinedGateStatus,
  collectR23R25ProviderGateStatus,
  runR23R25ProviderGateCheck,
  writeStatus
};
