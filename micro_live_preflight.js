"use strict";

// micro_live_preflight.js — Sprint 4 R8A
// Read-only micro-live engineering proof preflight. Writes analysis/ only.
// Does NOT arm, trade, sign, submit, or enable live trading.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const review = require("./r7_strategy_review");
const singleton = require("./executor_singleton_guard");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R8A_OUTPUT_DIR
  ? path.resolve(process.env.R8A_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "micro_live_preflight.json");
const GATE_DOC = "docs/R8A_MICRO_LIVE_ENGINEERING_PROOF_PLAN.md";
const R7_METRICS_FILE = path.join(OUTPUT_DIR, "r7_strategy_metrics.json");
const DEMO_CAPS_EXAMPLE = path.join(ROOT, "examples", "micro_live_demo_caps.example.json");
const OPERATOR_DEMO_CAPS = path.join(ROOT, "operator_records", "micro_live_demo_caps.json");

const SCHEMA_VERSION = 1;
const R7_EXPECTED_VERDICT = "NOT ENOUGH DATA";

const PROPOSED_DEMO_LIMITS = Object.freeze({
  maxTradeSizeSol: { min: 0.01, max: 0.02, note: "suggested engineering-demo default" },
  maxDailyLossSol: { max: 0.05, note: "suggested engineering-demo default" },
  maxOpenPositions: 1,
  maxTradesFirstProof: 1,
  stopAfterFirstTransaction: true
});

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

function isSafePreflightPosture(posture) {
  return (
    posture.available === true &&
    posture.executionMode === "PIPELINE_DRY_RUN" &&
    posture.dryRunMode === true &&
    posture.liveArmed === false &&
    posture.emergencyStop !== true
  );
}

function checkGitClean(repoRoot) {
  const result = spawnSync("git", ["-C", repoRoot, "status", "--porcelain"], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    return { available: false, clean: false, error: "git status failed" };
  }
  const lines = (result.stdout || "").split(/\r?\n/).filter(Boolean);
  return { available: true, clean: lines.length === 0, dirtyFiles: lines };
}

function checkSingletonLock(runtimeRoot) {
  const lockFile = path.join(runtimeRoot, singleton.LOCK_FILE_NAME);
  const status = singleton.describeExecutorLockStatus(lockFile);
  const duplicateLoop = status.executorSingletonLock === "active";
  const healthy = status.executorSingletonLock === "none"
    || status.executorSingletonLock === "stale";
  return {
    lockFile,
    ...status,
    duplicateLoop,
    healthy,
    malformed: status.executorSingletonLock === "malformed"
  };
}

function collectMicroLivePreflight(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;

  const gateDocPresent = options.gateDocPresent !== undefined
    ? options.gateDocPresent === true
    : fs.existsSync(path.join(repoRoot, GATE_DOC));

  const recoveryPresent = options.recoveryPresent !== undefined
    ? options.recoveryPresent === true
    : fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"))
      || fs.existsSync(path.join(repoRoot, "recovery_actions.jsonl"));

  const posture = options.posture || readPosture(runtimeRoot);
  const gitCheck = options.gitCheck !== undefined
    ? options.gitCheck
    : checkGitClean(repoRoot);

  const singletonCheck = options.singletonCheck !== undefined
    ? options.singletonCheck
    : checkSingletonLock(runtimeRoot);

  let r7Load;
  if (options.r7Metrics !== undefined) {
    r7Load = { status: "present", data: options.r7Metrics };
  } else {
    r7Load = readJsonIfPresent(options.r7MetricsFile || R7_METRICS_FILE);
  }

  const r7Verdict = r7Load.data?.recommendation?.verdict || null;
  const r7Acknowledged = r7Verdict === R7_EXPECTED_VERDICT;

  const walletStatus = review.readJsonFile(
    options.walletStatusFile || path.join(runtimeRoot, "wallet_status.json")
  );

  const demoCapsExample = readJsonIfPresent(
    options.demoCapsExampleFile || DEMO_CAPS_EXAMPLE
  );
  const operatorDemoCaps = readJsonIfPresent(
    options.operatorDemoCapsFile || OPERATOR_DEMO_CAPS
  );

  const safetyTestsScript = path.join(repoRoot, "run_safety_tests.js");
  const safetySuiteAvailable = fs.existsSync(safetyTestsScript);

  const checks = [];
  const addCheck = (id, ok, detail) => {
    checks.push({ id, ok: ok === true, detail });
  };

  addCheck("gate_doc_present", gateDocPresent, GATE_DOC);
  addCheck("recovery_absent", !recoveryPresent, "recovery_actions.jsonl must be absent");
  addCheck("posture_safe", isSafePreflightPosture(posture), "PIPELINE_DRY_RUN / dryRunMode true / liveArmed false");
  addCheck("execution_mode_dry_run", posture.executionMode === "PIPELINE_DRY_RUN", posture.executionMode);
  addCheck("dry_run_mode_true", posture.dryRunMode === true, String(posture.dryRunMode));
  addCheck("live_armed_false", posture.liveArmed !== true, String(posture.liveArmed));
  addCheck("emergency_stop_false", posture.emergencyStop !== true, String(posture.emergencyStop));
  addCheck("git_clean", gitCheck.available && gitCheck.clean, gitCheck.available ? "clean" : gitCheck.error);
  addCheck("singleton_healthy", singletonCheck.healthy && !singletonCheck.malformed, singletonCheck.executorSingletonLock);
  addCheck("no_duplicate_executor", !singletonCheck.duplicateLoop, singletonCheck.executorSingletonLock);
  addCheck("wallet_status_present", walletStatus.status === "usable", walletStatus.status);
  addCheck("r7_metrics_present", r7Load.status === "present", r7Load.status);
  addCheck("r7_verdict_acknowledged", r7Acknowledged, r7Verdict || "missing");
  addCheck("safety_suite_available", safetySuiteAvailable, "run_safety_tests.js");
  addCheck("demo_caps_example_present", demoCapsExample.status === "present", DEMO_CAPS_EXAMPLE);
  addCheck("operator_demo_caps_present", operatorDemoCaps.status === "present", "optional operator file");

  const criticalIds = new Set([
    "recovery_absent",
    "posture_safe",
    "execution_mode_dry_run",
    "dry_run_mode_true",
    "live_armed_false",
    "no_duplicate_executor",
    "singleton_healthy",
    "wallet_status_present",
    "r7_metrics_present",
    "r7_verdict_acknowledged"
  ]);

  const failedCritical = checks.filter((c) => criticalIds.has(c.id) && !c.ok);
  const failedNonCritical = checks.filter((c) => !criticalIds.has(c.id) && !c.ok);

  let preflightVerdict;
  let r8aVerdict;

  if (!gateDocPresent) {
    preflightVerdict = "BLOCKED";
    r8aVerdict = "NOT READY FOR MICRO-LIVE ENGINEERING PROOF";
  } else if (failedCritical.length > 0) {
    preflightVerdict = "FAILED";
    r8aVerdict = "NOT READY FOR MICRO-LIVE ENGINEERING PROOF";
  } else if (
    operatorDemoCaps.status === "present" &&
    gitCheck.clean &&
    failedNonCritical.length === 0
  ) {
    preflightVerdict = "PASS";
    r8aVerdict = "READY FOR FINAL MICRO-LIVE APPROVAL REVIEW";
  } else {
    preflightVerdict = "PASS_WITH_NOTES";
    r8aVerdict = "READY TO BUILD MICRO-LIVE GUARDS";
  }

  return {
    timestamp: new Date().toISOString(),
    review: "R8A-micro-live-preflight",
    schemaVersion: SCHEMA_VERSION,
    gateDocPresent,
    approved: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    capitalAtRiskUsd: 0,
    operatorDecisionNote: "Operator chose engineering proof despite R7 NOT ENOUGH DATA — does not bypass R7 edge findings.",
    r7Context: {
      verdict: r7Verdict,
      expectedVerdict: R7_EXPECTED_VERDICT,
      acknowledged: r7Acknowledged,
      strategyEdgeProven: false
    },
    postureSummary: posture.available ? {
      executionMode: posture.executionMode,
      dryRunMode: posture.dryRunMode,
      liveArmed: posture.liveArmed,
      emergencyStop: posture.emergencyStop,
      safeForPreflight: isSafePreflightPosture(posture)
    } : { available: false, status: posture.status },
    gitStatus: gitCheck,
    singletonStatus: singletonCheck,
    walletStatusSummary: {
      status: walletStatus.status,
      present: walletStatus.status === "usable"
    },
    demoCaps: {
      exampleFile: demoCapsExample.status,
      operatorFile: operatorDemoCaps.status,
      operatorApproved: operatorDemoCaps.data?.operatorApproved === true,
      proposedLimits: PROPOSED_DEMO_LIMITS
    },
    safetySuite: {
      scriptAvailable: safetySuiteAvailable,
      note: "Operator must run node run_safety_tests.js before arming; preflight does not auto-run full suite."
    },
    checks,
    failedCritical: failedCritical.map((c) => c.id),
    failedNonCritical: failedNonCritical.map((c) => c.id),
    evaluation: {
      preflightVerdict,
      r8aVerdict,
      reason: failedCritical.length > 0
        ? failedCritical.map((c) => `${c.id}: ${c.detail}`).join("; ")
        : r8aVerdict,
      approved: false
    },
    blockers: [
      "live trading not approved",
      "micro-live not approved",
      "R7 edge not proven",
      "micro-live guards not yet built",
      "no human approval for first proof",
      "no transaction submission in R8A"
    ],
    recommendedNextSteps: [
      "Build hard micro-live guardrails (trade size, daily loss, max positions)",
      "Complete R39–R43 signer path design",
      "Operator documents approved demo caps in operator_records/",
      "Run safety suite immediately before any future arming",
      "Proceed to final micro-live approval review only after guards exist"
    ]
  };
}

function writePreflight(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[r8a-preflight] Micro-live Engineering Proof Preflight (read-only)");
  console.log(`  r8a verdict: ${status.evaluation.r8aVerdict}`);
  console.log(`  preflight: ${status.evaluation.preflightVerdict}`);
  console.log(`  approved: false`);
  console.log(`  R7 verdict: ${status.r7Context.verdict} (acknowledged: ${status.r7Context.acknowledged})`);
  console.log(`  critical failures: ${status.failedCritical.length}`);
}

function runMicroLivePreflight(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const outputFile = options.outputFile || path.join(analysisDir, "micro_live_preflight.json");
  const status = collectMicroLivePreflight({
    ...options,
    analysisDir
  });

  if (options.writeOutput !== false) {
    writePreflight(status, outputFile);
  }

  if (options.print !== false) {
    printSummary(status);
  }

  return { status, outputFile: options.writeOutput !== false ? outputFile : null };
}

if (require.main === module) {
  try {
    const result = runMicroLivePreflight();
    if (result.outputFile) console.log(`  output: ${result.outputFile}`);
  } catch (err) {
    console.error("[r8a-preflight] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOC,
  OUTPUT_FILE,
  R7_EXPECTED_VERDICT,
  PROPOSED_DEMO_LIMITS,
  checkGitClean,
  checkSingletonLock,
  isSafePreflightPosture,
  collectMicroLivePreflight,
  runMicroLivePreflight
};
