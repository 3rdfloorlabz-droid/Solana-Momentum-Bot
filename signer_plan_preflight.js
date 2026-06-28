"use strict";

// signer_plan_preflight.js — R41 read-only local signer plan preflight.
// Writes analysis/ only. Does NOT read env secrets, implement signing, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const capsModule = require("./micro_live_caps");
const secretScan = require("./secret_safety_scan");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R41_PREFLIGHT_OUTPUT_DIR
  ? path.resolve(process.env.R41_PREFLIGHT_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "signer_plan_preflight.json");
const GATE_DOC = "docs/R41_LOCAL_SIGNER_IMPLEMENTATION_PLAN.md";

const SCHEMA_VERSION = 1;
const R41_VERDICT = "LOCAL SIGNER PLAN ONLY — NOT READY FOR IMPLEMENTATION";

const FORBIDDEN_VERDICTS = Object.freeze([
  "READY FOR LIVE TRADING",
  "LIVE APPROVED",
  "MICRO_LIVE_APPROVED"
]);

const REQUIRED_REPO_FILES = Object.freeze([
  "secret_safety_scan.js",
  "mock_signer.js",
  "micro_live_guardrails.js",
  "micro_live_caps.js",
  "examples/micro_live_demo_caps.example.json"
]);

const PREFLIGHT_VERDICTS = Object.freeze({
  NOT_READY: "NOT_READY",
  PLAN_PREPARED: "PLAN_PREPARED"
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

function isSafePreflightPosture(posture) {
  return (
    posture.available === true &&
    posture.executionMode === "PIPELINE_DRY_RUN" &&
    posture.dryRunMode === true &&
    posture.liveArmed === false &&
    posture.emergencyStop !== true
  );
}

function checkRequiredFiles(repoRoot, options = {}) {
  const files = options.requiredFiles || REQUIRED_REPO_FILES;
  const missing = [];
  const present = [];

  for (const rel of files) {
    const full = path.join(repoRoot, rel);
    if (fs.existsSync(full)) {
      present.push(rel);
    } else {
      missing.push(rel);
    }
  }

  return { ok: missing.length === 0, missing, present };
}

function checkOperatorCaps(repoRoot, options = {}) {
  const capsFile = options.capsFile || path.join(repoRoot, "operator_records", "micro_live_demo_caps.json");
  const load = options.capsLoad !== undefined
    ? options.capsLoad
    : capsModule.loadCapsFile(capsFile);

  if (load.status === "missing") {
    return {
      ok: true,
      status: "missing",
      approved: false,
      note: "operator caps file absent — expected during plan phase"
    };
  }

  if (load.status === "corrupt") {
    return {
      ok: false,
      status: "corrupt",
      approved: false,
      note: "operator caps file corrupt"
    };
  }

  const approved = load.data?.approved === true;
  return {
    ok: true,
    status: "present",
    approved,
    note: approved
      ? "operator caps approved true — preflight does not approve live trading"
      : "operator caps present but not approved"
  };
}

function isTestFilePath(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/");
  const base = path.basename(normalized);
  return (
    base.startsWith("test_") ||
    normalized.includes("/test_") ||
    normalized.startsWith("test/")
  );
}

function filterNonTestSecretFindings(findings) {
  return (findings || []).filter((finding) => !isTestFilePath(finding.file));
}

function collectSignerPlanPreflight(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;

  const gateDocPresent = options.gateDocPresent !== undefined
    ? options.gateDocPresent === true
    : fs.existsSync(path.join(repoRoot, GATE_DOC));

  const recoveryPresent = options.recoveryPresent !== undefined
    ? options.recoveryPresent === true
    : fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"))
      || fs.existsSync(path.join(repoRoot, "recovery_actions.jsonl"));

  const posture = options.posture || readPosture(runtimeRoot);
  const requiredFiles = options.requiredFilesCheck !== undefined
    ? options.requiredFilesCheck
    : checkRequiredFiles(repoRoot, options);

  const operatorCaps = options.operatorCapsCheck !== undefined
    ? options.operatorCapsCheck
    : checkOperatorCaps(repoRoot, options);

  let scanFindings;
  if (options.secretScanFindings !== undefined) {
    scanFindings = options.secretScanFindings;
  } else if (options.runSecretScan === false) {
    scanFindings = [];
  } else {
    const scanResult = secretScan.scanRepo(repoRoot, options.scanOptions);
    scanFindings = filterNonTestSecretFindings(scanResult.findings);
  }

  const checks = [];
  const addCheck = (id, ok, detail) => {
    checks.push({ id, ok: ok === true, detail });
  };

  addCheck("gate_doc_present", gateDocPresent, GATE_DOC);
  addCheck("recovery_absent", !recoveryPresent, "recovery_actions.jsonl must be absent");
  addCheck("posture_safe", isSafePreflightPosture(posture), "PIPELINE_DRY_RUN / dryRunMode true / liveArmed false");
  addCheck("required_files_present", requiredFiles.ok, requiredFiles.missing?.join(", ") || "all present");
  addCheck("operator_caps_safe", operatorCaps.ok, operatorCaps.note || operatorCaps.status);
  addCheck("no_non_test_secret_patterns", scanFindings.length === 0, `${scanFindings.length} non-test finding(s)`);
  addCheck("live_trading_not_approved", true, "live trading remains NOT APPROVED");
  addCheck("signer_not_implemented", true, "R41 plan only — no local_signer.js");

  const failed = checks.filter((c) => !c.ok);

  let preflightVerdict = PREFLIGHT_VERDICTS.PLAN_PREPARED;
  let reason = "Plan infrastructure present; R41 plan only — not ready for real signer implementation";

  if (!gateDocPresent || recoveryPresent || !isSafePreflightPosture(posture) || !requiredFiles.ok) {
    preflightVerdict = PREFLIGHT_VERDICTS.NOT_READY;
    reason = failed.map((c) => `${c.id}: ${c.detail}`).join("; ");
  } else if (scanFindings.length > 0) {
    preflightVerdict = PREFLIGHT_VERDICTS.NOT_READY;
    reason = failed.map((c) => `${c.id}: ${c.detail}`).join("; ");
  }

  return {
    timestamp: new Date().toISOString(),
    review: "R41-signer-plan-preflight",
    schemaVersion: SCHEMA_VERSION,
    gateDocPresent,
    approved: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    privateKeysHandled: false,
    r41Verdict: R41_VERDICT,
    preflightVerdict,
    forbiddenVerdicts: FORBIDDEN_VERDICTS,
    evaluation: {
      preflightVerdict,
      r41Verdict: R41_VERDICT,
      reason,
      approved: false,
      liveTradingApproved: false
    },
    recommendedSignerMethod: {
      primary: "outside-repo encrypted local keyfile",
      fallback: "ephemeral environment variable at runtime only",
      note: "R41 does not create keyfile or env var"
    },
    postureSummary: posture.available ? {
      executionMode: posture.executionMode,
      dryRunMode: posture.dryRunMode,
      liveArmed: posture.liveArmed,
      emergencyStop: posture.emergencyStop,
      safeForPlanPhase: isSafePreflightPosture(posture)
    } : { available: false, status: posture.status },
    requiredFiles: requiredFiles.present,
    missingRequiredFiles: requiredFiles.missing || [],
    operatorCaps: {
      status: operatorCaps.status,
      approved: operatorCaps.approved === true,
      safeForPlanPhase: operatorCaps.ok === true,
      note: operatorCaps.note
    },
    secretScanSummary: {
      nonTestFindingCount: scanFindings.length,
      findings: scanFindings.map((f) => ({
        file: f.file,
        patternId: f.patternId,
        line: f.line,
        redactedSnippet: f.redactedSnippet
      }))
    },
    checks,
    failedChecks: failed.map((c) => c.id),
    blockers: [
      "R41 plan only — no real signer implementation",
      "live trading not approved",
      "micro-live not approved",
      "R7 edge not proven",
      "R42 final approval required before any real sign",
      "no live_executor signer integration"
    ],
    recommendedNextSteps: [
      "Review R41_LOCAL_SIGNER_IMPLEMENTATION_PLAN.md",
      "Create operator caps file when ready",
      "Run signer_plan_preflight.js before R42",
      "Do not add private keys until R42/R43 explicit approval"
    ]
  };
}

function assertAnalysisWritePath(outputFile, analysisDir) {
  const resolvedOutput = path.resolve(outputFile);
  const resolvedAnalysis = path.resolve(analysisDir);
  const prefix = resolvedAnalysis.endsWith(path.sep)
    ? resolvedAnalysis
    : `${resolvedAnalysis}${path.sep}`;
  if (!resolvedOutput.startsWith(prefix)) {
    throw new Error("signer plan preflight output must stay under analysis/");
  }
}

function writePreflight(status, outputFile = OUTPUT_FILE, analysisDir = OUTPUT_DIR) {
  assertAnalysisWritePath(outputFile, analysisDir);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[r41-preflight] Local Signer Plan Preflight (read-only)");
  console.log(`  preflight: ${status.preflightVerdict}`);
  console.log(`  r41 verdict: ${status.r41Verdict}`);
  console.log(`  approved: false`);
  console.log(`  failed checks: ${status.failedChecks.length}`);
}

function runSignerPlanPreflight(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const outputFile = options.outputFile || path.join(analysisDir, "signer_plan_preflight.json");
  const status = collectSignerPlanPreflight({
    ...options,
    analysisDir
  });

  if (options.writeOutput !== false) {
    writePreflight(status, outputFile, analysisDir);
  }

  if (options.print !== false) {
    printSummary(status);
  }

  return { status, outputFile: options.writeOutput !== false ? outputFile : null };
}

if (require.main === module) {
  try {
    const result = runSignerPlanPreflight();
    if (result.outputFile) console.log(`  output: ${result.outputFile}`);
  } catch (err) {
    console.error("[r41-preflight] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOC,
  OUTPUT_FILE,
  SCHEMA_VERSION,
  R41_VERDICT,
  FORBIDDEN_VERDICTS,
  PREFLIGHT_VERDICTS,
  REQUIRED_REPO_FILES,
  readPosture,
  isSafePreflightPosture,
  checkRequiredFiles,
  checkOperatorCaps,
  isTestFilePath,
  filterNonTestSecretFindings,
  collectSignerPlanPreflight,
  runSignerPlanPreflight
};
