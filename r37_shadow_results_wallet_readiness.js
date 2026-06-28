"use strict";

// r37_shadow_results_wallet_readiness.js — Sprint 4 R37
// Read-only shadow results review + wallet setup design readiness. Writes analysis/ only.
// Does NOT handle private keys, connect wallet, sign, submit, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const r36 = require("./r36_shadow_execution_harness");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R37_OUTPUT_DIR
  ? path.resolve(process.env.R37_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r37_shadow_results_wallet_readiness.json");
const GATE_DOC = "docs/R37_SHADOW_RESULTS_AND_WALLET_SETUP_READINESS.md";
const DEFAULT_R36_STATUS_FILE = path.join(OUTPUT_DIR, "r36_shadow_execution_status.json");
const DEFAULT_DECISIONS_FILE = path.join(OUTPUT_DIR, "shadow_execution_decisions.jsonl");

const SCHEMA_VERSION = 1;
const EXPECTED_SOURCE_MODE = r36.SOURCE_MODE;

const SCAN_SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "analysis",
  "soak_runs",
  ".cursor"
]);

const FORBIDDEN_BASENAMES = new Set([
  ".env",
  ".env.local",
  ".env.live.local",
  "secrets.local.json",
  "wallet.json",
  "keypair.json",
  "solana-research-wallet.json"
]);

const FORBIDDEN_BASENAME_PATTERNS = [
  /^\.env\./,
  /signer_secret/i,
  /wallet_secret/i,
  /\.key$/,
  /\.pem$/
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

function loadDecisionsJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
    return { status: "missing", decisions: [], errors: ["shadow decisions file missing"] };
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) {
    return { status: "empty", decisions: [], errors: [] };
  }

  const decisions = [];
  const errors = [];
  for (let i = 0; i < lines.length; i += 1) {
    try {
      decisions.push(JSON.parse(lines[i]));
    } catch (err) {
      errors.push(`line ${i + 1}: ${err && err.message ? err.message : String(err)}`);
    }
  }

  if (errors.length > 0) {
    return { status: "corrupt", decisions, errors };
  }
  return { status: "present", decisions, errors: [] };
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

function isSafeDesignPosture(posture) {
  return (
    posture.available === true &&
    posture.executionMode === "PIPELINE_DRY_RUN" &&
    posture.dryRunMode === true &&
    posture.liveArmed === false &&
    posture.emergencyStop !== true
  );
}

function isForbiddenBasename(basename) {
  if (!basename) return false;
  if (FORBIDDEN_BASENAMES.has(basename)) return true;
  if (/\.example$/i.test(basename)) return false;
  if (basename === ".env.example") return false;
  return FORBIDDEN_BASENAME_PATTERNS.some((pattern) => pattern.test(basename));
}

function scanForbiddenSecretPaths(repoRoot, options = {}) {
  const hits = [];
  const maxDepth = options.maxDepth ?? 8;

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (SCAN_SKIP_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
        continue;
      }
      if (isForbiddenBasename(entry.name)) {
        hits.push({
          path: fullPath,
          basename: entry.name,
          contentNotRead: true
        });
      }
    }
  }

  walk(repoRoot, 0);
  return hits;
}

function validateDecisionRecord(record, index) {
  const issues = [];
  const label = record?.candidateId || `decision ${index}`;

  if (!record || typeof record !== "object") {
    return { valid: false, issues: [`${label}: missing or invalid record`] };
  }

  const requiredFalse = [
    "approved",
    "realExecution",
    "transactionConstructed",
    "transactionSigned",
    "transactionSubmitted",
    "positionMutated",
    "tradingAllowed",
    "signingAllowed",
    "submissionAllowed",
    "walletRequired"
  ];

  for (const field of requiredFalse) {
    if (record[field] === true) {
      issues.push(`${label}: ${field} true forbidden`);
    }
  }

  if (record.sourceMode !== EXPECTED_SOURCE_MODE) {
    issues.push(`${label}: sourceMode must be ${EXPECTED_SOURCE_MODE}`);
  }

  if (!record.simulatedAction) {
    issues.push(`${label}: missing simulatedAction`);
  }

  return { valid: issues.length === 0, issues };
}

function summarizeDecisions(decisions) {
  return {
    decisionCount: decisions.length,
    wouldEnterCount: decisions.filter((d) => d.simulatedAction === r36.SIMULATED_ACTION.WOULD_ENTER).length,
    skipCount: decisions.filter((d) => d.simulatedAction === r36.SIMULATED_ACTION.SKIP).length,
    blockedCount: 0
  };
}

function deriveReadinessStatus(context) {
  if (!context.gateDocPresent) {
    return {
      readinessStatus: "BLOCKED",
      reason: "R37 gate doc missing."
    };
  }

  if (context.r36StatusLoad.status === "missing" || context.r36StatusLoad.status === "corrupt") {
    return {
      readinessStatus: "BLOCKED",
      reason: "R36 shadow execution status missing or corrupt."
    };
  }

  if (context.decisionsLoad.status === "missing") {
    return {
      readinessStatus: "BLOCKED",
      reason: "Shadow execution decisions file missing."
    };
  }

  if (context.decisionsLoad.status === "corrupt") {
    return {
      readinessStatus: "INVALID_SHADOW_DECISION_RECORD",
      reason: context.decisionsLoad.errors.join("; ")
    };
  }

  if (context.recoveryPresent) {
    return {
      readinessStatus: "BLOCKED",
      reason: "recovery_actions.jsonl present."
    };
  }

  if (!isSafeDesignPosture(context.posture)) {
    return {
      readinessStatus: "BLOCKED",
      reason: "Unsafe runtime posture for wallet setup design readiness."
    };
  }

  if (context.secretPathHits.length > 0) {
    return {
      readinessStatus: "BLOCKED_SECRET_FILE_IN_REPO",
      reason: `Forbidden secret/wallet filename(s) in repo: ${context.secretPathHits.map((h) => h.basename).join(", ")}`
    };
  }

  if (!context.decisionValidation.valid) {
    return {
      readinessStatus: "INVALID_SHADOW_DECISION_RECORD",
      reason: context.decisionValidation.issues.join("; ")
    };
  }

  const r36Status = context.r36StatusLoad.data?.evaluation?.status
    || context.r36StatusLoad.data?.summary?.status
    || null;

  if (r36Status !== "SHADOW_DECISIONS_GENERATED") {
    return {
      readinessStatus: "NOT_READY_REVIEW_SHADOW_RESULTS",
      reason: `R36 status is ${r36Status || "unknown"} — expected SHADOW_DECISIONS_GENERATED.`
    };
  }

  if (context.decisions.length === 0) {
    return {
      readinessStatus: "NOT_READY_REVIEW_SHADOW_RESULTS",
      reason: "No shadow decisions found to review."
    };
  }

  return {
    readinessStatus: "READY_FOR_WALLET_SETUP_DESIGN",
    reason: "Shadow decisions reviewed; repo secret filename scan clean; ready for wallet setup design only."
  };
}

function collectR37ShadowResultsWalletReadiness(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;

  const gateDocPresent = options.gateDocPresent !== undefined
    ? options.gateDocPresent === true
    : fs.existsSync(path.join(repoRoot, GATE_DOC));

  let r36StatusLoad;
  if (options.r36StatusData !== undefined) {
    r36StatusLoad = { status: "present", data: options.r36StatusData };
  } else {
    r36StatusLoad = readJsonIfPresent(options.r36StatusFile || DEFAULT_R36_STATUS_FILE);
  }

  let decisionsLoad;
  if (Array.isArray(options.decisions)) {
    decisionsLoad = { status: "present", decisions: options.decisions, errors: [] };
  } else {
    decisionsLoad = loadDecisionsJsonl(options.decisionsFile || DEFAULT_DECISIONS_FILE);
  }

  const decisions = decisionsLoad.decisions || [];
  const decisionValidation = { valid: true, issues: [] };
  for (let i = 0; i < decisions.length; i += 1) {
    const result = validateDecisionRecord(decisions[i], i + 1);
    if (!result.valid) decisionValidation.issues.push(...result.issues);
  }
  decisionValidation.valid = decisionValidation.issues.length === 0;

  const decisionSummary = summarizeDecisions(decisions);
  const secretPathHits = options.secretPathHits !== undefined
    ? options.secretPathHits
    : scanForbiddenSecretPaths(repoRoot, options.scanOptions);

  const recoveryPresent = options.recoveryPresent !== undefined
    ? options.recoveryPresent === true
    : fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"))
      || fs.existsSync(path.join(repoRoot, "recovery_actions.jsonl"));

  const posture = options.posture || readPosture(runtimeRoot);

  const context = {
    gateDocPresent,
    r36StatusLoad,
    decisionsLoad,
    decisions,
    decisionValidation,
    secretPathHits,
    recoveryPresent,
    posture
  };

  const gate = deriveReadinessStatus(context);

  return {
    timestamp: new Date().toISOString(),
    review: "R37-shadow-results-wallet-readiness",
    schemaVersion: SCHEMA_VERSION,
    gateDocPresent,
    approved: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    walletConnected: false,
    privateKeysHandled: false,
    realExecution: false,
    capitalAtRiskUsd: 0,
    sources: {
      gateDoc: GATE_DOC,
      r36StatusFile: options.r36StatusData ? "(inline fixture)" : (options.r36StatusFile || DEFAULT_R36_STATUS_FILE),
      decisionsFile: Array.isArray(options.decisions) ? "(inline fixture)" : (options.decisionsFile || DEFAULT_DECISIONS_FILE)
    },
    shadowResultsSummary: {
      ...decisionSummary,
      sourceMode: EXPECTED_SOURCE_MODE,
      allApprovedFalse: decisionValidation.valid,
      allRealExecutionFalse: decisions.every((d) => d.realExecution !== true),
      allTransactionFlagsFalse: decisions.every((d) =>
        d.transactionConstructed !== true &&
        d.transactionSigned !== true &&
        d.transactionSubmitted !== true
      ),
      allPositionMutatedFalse: decisions.every((d) => d.positionMutated !== true)
    },
    repoSecretScan: {
      scanMethod: "filename-only",
      contentRead: false,
      forbiddenPathHits: secretPathHits,
      secretFilesInRepo: secretPathHits.length > 0
    },
    postureSummary: posture.available ? {
      executionMode: posture.executionMode,
      dryRunMode: posture.dryRunMode,
      liveArmed: posture.liveArmed,
      emergencyStop: posture.emergencyStop,
      safeForDesignReview: isSafeDesignPosture(posture),
      recoveryActionsAbsent: !recoveryPresent
    } : { available: false, status: posture.status },
    walletSetupReadinessCriteria: {
      safetySuiteExpectedGreen: true,
      postureDryRunDisarmed: isSafeDesignPosture(posture),
      recoveryAbsent: !recoveryPresent,
      r36DecisionsGenerated: r36StatusLoad.data?.evaluation?.status === "SHADOW_DECISIONS_GENERATED",
      allDecisionSafetyFlagsHeld: decisionValidation.valid,
      noWalletConnected: true,
      noPrivateKeysInRepo: secretPathHits.length === 0
    },
    researchWalletPolicy: {
      dedicatedResearchWalletOnly: true,
      noMainWallet: true,
      noOldWallet: true,
      noNfts: true,
      noValuableAssets: true,
      tinyResearchFundsLater: true,
      operationalLiquidityNotActiveRisk: true,
      noPrivateKeyInChat: true,
      noPrivateKeyInPrompt: true,
      noPrivateKeyInGit: true,
      noPrivateKeyInDocs: true,
      noPrivateKeyInAnalysis: true,
      noPrivateKeyInLogs: true,
      noDashboardSecrets: true
    },
    secretSetupDesignOptions: [
      {
        option: "A",
        label: "Local secret file outside repo",
        examplePath: "C:\\TracktaOS\\Secrets\\solana-research-wallet.json",
        implemented: false
      },
      {
        option: "B",
        label: "Environment variable — local machine only",
        implemented: false
      },
      {
        option: "C",
        label: "OS credential manager / encrypted store — future",
        implemented: false
      }
    ],
    remainingBlockers: [
      "R38 secret storage design",
      "R39 redaction and leak detection tests",
      "R40 fake-key signer simulation",
      "R41 real signer integration — no submit",
      "R7b edge validation not complete",
      "final live trading approval absent"
    ],
    evaluation: {
      verdict: gate.readinessStatus === "READY_FOR_WALLET_SETUP_DESIGN"
        ? "SHADOW RESULTS REVIEWED — READY FOR WALLET SETUP DESIGN ONLY"
        : "SHADOW RESULTS REVIEWED — WALLET SETUP DESIGN NOT READY",
      readinessStatus: gate.readinessStatus,
      reason: gate.reason,
      approved: false
    },
    blockers: [
      "live trading not approved",
      "micro-live not approved",
      "real execution not activated",
      "no wallet connection",
      "no private key handling",
      "no signing",
      "no submission"
    ],
    recommendedNextGates: [
      "R38 Research Wallet + Secret Storage Design",
      "R39 Secret Redaction and Leak Detection Tests",
      "R40 Signer Loading Simulation — fake key only",
      "R41 Real Signer Integration — no submit"
    ]
  };
}

function writeReview(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[r37-wallet] Shadow Results Review + Wallet Setup Readiness (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  readiness status: ${status.evaluation.readinessStatus}`);
  console.log(`  approved: false`);
  console.log(`  decisions: ${status.shadowResultsSummary.decisionCount} wouldEnter=${status.shadowResultsSummary.wouldEnterCount} skip=${status.shadowResultsSummary.skipCount}`);
  console.log(`  repo secret scan hits: ${status.repoSecretScan.forbiddenPathHits.length} (filename-only)`);
}

function runR37ShadowResultsWalletReadiness(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const outputFile = options.outputFile || path.join(analysisDir, "r37_shadow_results_wallet_readiness.json");
  const status = collectR37ShadowResultsWalletReadiness({
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
    const result = runR37ShadowResultsWalletReadiness();
    if (result.outputFile) console.log(`  output: ${result.outputFile}`);
    if (result.status.recommendedNextGates?.[0]) {
      console.log(`  next gate: ${result.status.recommendedNextGates[0]}`);
    }
  } catch (err) {
    console.error("[r37-wallet] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOC,
  OUTPUT_FILE,
  DEFAULT_R36_STATUS_FILE,
  DEFAULT_DECISIONS_FILE,
  EXPECTED_SOURCE_MODE,
  FORBIDDEN_BASENAMES,
  scanForbiddenSecretPaths,
  validateDecisionRecord,
  deriveReadinessStatus,
  collectR37ShadowResultsWalletReadiness,
  runR37ShadowResultsWalletReadiness
};
