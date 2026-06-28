"use strict";

// micro_live_guardrails.js — Track A hard micro-live guardrail checker.
// Read-only on trading/config/strategy state. Writes analysis/ only.
// Does NOT arm, trade, sign, submit, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const singleton = require("./executor_singleton_guard");
const capsModule = require("./micro_live_caps");
const livePositionsStore = require("./live_positions_store");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.TRACK_A_GUARDRAILS_OUTPUT_DIR
  ? path.resolve(process.env.TRACK_A_GUARDRAILS_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "micro_live_guardrails_check.json");
const GATE_DOC = "docs/TRACK_A_MICRO_LIVE_GUARDRAILS.md";

const VERDICTS = Object.freeze({
  NOT_READY: "NOT_READY",
  READY_FOR_CAPS_APPROVAL: "READY_FOR_CAPS_APPROVAL",
  READY_FOR_FINAL_MICRO_LIVE_REVIEW: "READY_FOR_FINAL_MICRO_LIVE_REVIEW"
});

const FORBIDDEN_VERDICTS = Object.freeze([
  "READY_FOR_LIVE_TRADING",
  "LIVE_APPROVED"
]);

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
    emergencyStop: data.emergencyStop === true,
    autoCompounding: data.autoCompounding === true || data.autoCompound === true
  };
}

function isSafePrebuildPosture(posture) {
  return (
    posture.available === true &&
    posture.executionMode === "PIPELINE_DRY_RUN" &&
    posture.dryRunMode === true &&
    posture.liveArmed === false &&
    posture.emergencyStop !== true
  );
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

function countLiveSessionTrades(runtimeRoot) {
  const file = path.join(runtimeRoot, "live_trades.jsonl");
  if (!fs.existsSync(file)) {
    return { count: 0, ok: true, status: "missing" };
  }

  const content = fs.readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/).filter(Boolean);
  let count = 0;

  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (row.dryRun === true) continue;
      const event = row.event || row.type || "";
      if (
        event === "ACTUAL_ENTRY" ||
        event === "INTENDED_ENTRY" ||
        event === "CLOSED_LIVE_TRADE"
      ) {
        count += 1;
      }
    } catch {
      // ignore malformed lines for count purposes
    }
  }

  return { count, ok: count === 0, status: "present" };
}

function checkLivePositions(runtimeRoot) {
  const file = path.join(runtimeRoot, "live_positions.json");
  if (!fs.existsSync(file)) {
    return { status: "missing", ok: true, openCount: 0, validation: { ok: true } };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const validation = livePositionsStore.validateLivePositionsState(parsed);
    const openCount = Array.isArray(parsed) ? parsed.length : 0;
    return {
      status: validation.ok ? "usable" : "invalid",
      ok: validation.ok,
      openCount,
      validation
    };
  } catch (err) {
    return {
      status: "corrupt",
      ok: false,
      openCount: null,
      validation: { ok: false, reason: err && err.message ? err.message : String(err) }
    };
  }
}

function recoveryPresent(repoRoot, runtimeRoot) {
  return fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"))
    || fs.existsSync(path.join(repoRoot, "recovery_actions.jsonl"));
}

function collectMicroLiveGuardrailsCheck(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;

  const gateDocPresent = options.gateDocPresent !== undefined
    ? options.gateDocPresent === true
    : fs.existsSync(path.join(repoRoot, GATE_DOC));

  const recovery = options.recoveryPresent !== undefined
    ? options.recoveryPresent === true
    : recoveryPresent(repoRoot, runtimeRoot);

  const posture = options.posture || readPosture(runtimeRoot);
  const singletonCheck = options.singletonCheck !== undefined
    ? options.singletonCheck
    : checkSingletonLock(runtimeRoot);

  const capsFile = options.capsFile || capsModule.DEFAULT_CAPS_FILE;
  const capsLoad = options.capsLoad !== undefined
    ? options.capsLoad
    : capsModule.loadCapsFile(capsFile);
  const capsSummary = options.capsSummary !== undefined
    ? options.capsSummary
    : capsModule.summarizeCapsLoad(capsLoad);

  const walletStatus = review.readJsonFile(
    options.walletStatusFile || path.join(runtimeRoot, "wallet_status.json")
  );

  const livePositions = options.livePositionsCheck !== undefined
    ? options.livePositionsCheck
    : checkLivePositions(runtimeRoot);

  const liveSessionTrades = options.liveSessionTrades !== undefined
    ? options.liveSessionTrades
    : countLiveSessionTrades(runtimeRoot);

  const safetySuiteGreen = options.safetySuiteGreen;
  const safetyTestsScript = path.join(repoRoot, "run_safety_tests.js");
  const safetySuiteAvailable = fs.existsSync(safetyTestsScript);

  const checks = [];
  const addCheck = (id, ok, detail, severity = "critical") => {
    checks.push({ id, ok: ok === true, detail, severity });
  };

  addCheck("gate_doc_present", gateDocPresent, GATE_DOC, "non_critical");
  addCheck("recovery_absent", !recovery, "recovery_actions.jsonl must be absent");
  addCheck("posture_safe", isSafePrebuildPosture(posture), "PIPELINE_DRY_RUN / dryRunMode true / liveArmed false");
  addCheck("execution_mode_dry_run", posture.executionMode === "PIPELINE_DRY_RUN", posture.executionMode);
  addCheck("dry_run_mode_true", posture.dryRunMode === true, String(posture.dryRunMode));
  addCheck("live_armed_false", posture.liveArmed !== true, String(posture.liveArmed));
  addCheck("emergency_stop_false", posture.emergencyStop !== true, String(posture.emergencyStop));
  addCheck("singleton_healthy", singletonCheck.healthy && !singletonCheck.malformed, singletonCheck.executorSingletonLock);
  addCheck("no_duplicate_executor", !singletonCheck.duplicateLoop, singletonCheck.executorSingletonLock);
  addCheck("wallet_status_present", walletStatus.status === "usable", walletStatus.status);
  addCheck("live_positions_valid", livePositions.ok === true, livePositions.status || "unknown");
  addCheck("live_session_trades_zero", liveSessionTrades.ok === true, String(liveSessionTrades.count));
  addCheck("auto_compounding_disabled", posture.autoCompounding !== true && capsLoad.data?.autoCompoundingAllowed !== true, "auto-compounding must remain disabled");
  addCheck("caps_file_present", capsLoad.status === "present", capsLoad.status || "missing");
  addCheck("caps_conservative_valid", capsSummary.conservativeOk === true, (capsSummary.conservativeErrors || capsSummary.errors || []).join("; ") || "ok");
  addCheck("caps_operator_approved", capsSummary.approvedOk === true, capsLoad.data?.approved === true ? "approved" : "not approved");

  if (safetySuiteGreen === false) {
    addCheck("safety_suite_green", false, "safety suite reported not green");
  } else if (safetySuiteGreen === true) {
    addCheck("safety_suite_green", true, "safety suite green", "non_critical");
  } else {
    addCheck("safety_suite_green", true, "not verified this run", "non_critical");
  }

  addCheck("safety_suite_available", safetySuiteAvailable, "run_safety_tests.js", "non_critical");
  addCheck("live_trading_not_approved", true, "live trading remains NOT APPROVED", "non_critical");
  addCheck("no_forbidden_verdicts", true, FORBIDDEN_VERDICTS.join(", "), "non_critical");

  const criticalChecks = checks.filter((c) => c.severity !== "non_critical");
  const failedCritical = criticalChecks.filter((c) => !c.ok);
  const failedNonCritical = checks.filter((c) => c.severity === "non_critical" && !c.ok);

  const capsApprovalBlockers = [];
  if (capsLoad.status !== "present") capsApprovalBlockers.push("operator caps file missing");
  if (capsLoad.status === "present" && capsSummary.conservativeOk !== true) {
    capsApprovalBlockers.push("caps fail conservative validation");
  }
  if (capsLoad.status === "present" && capsLoad.data?.approved !== true) {
    capsApprovalBlockers.push("operator caps not approved");
  }

  const postureBlockers = failedCritical.filter((c) => [
    "recovery_absent",
    "posture_safe",
    "execution_mode_dry_run",
    "dry_run_mode_true",
    "live_armed_false",
    "emergency_stop_false",
    "no_duplicate_executor",
    "singleton_healthy"
  ].includes(c.id));

  const readinessBlockers = failedCritical.filter((c) => [
    "wallet_status_present",
    "live_positions_valid",
    "live_session_trades_zero",
    "auto_compounding_disabled",
    "caps_operator_approved",
    "safety_suite_green"
  ].includes(c.id));

  let guardrailVerdict = VERDICTS.NOT_READY;
  let reason;

  if (postureBlockers.length > 0 || recovery || capsLoad.status === "corrupt") {
    guardrailVerdict = VERDICTS.NOT_READY;
    reason = postureBlockers.length > 0
      ? postureBlockers.map((c) => `${c.id}: ${c.detail}`).join("; ")
      : recovery
        ? "recovery_actions.jsonl present"
        : "caps file corrupt";
  } else if (capsApprovalBlockers.length > 0) {
    guardrailVerdict = VERDICTS.NOT_READY;
    reason = capsApprovalBlockers.join("; ");
  } else if (readinessBlockers.length > 0 || failedNonCritical.some((c) => c.id === "safety_suite_green" && safetySuiteGreen === false)) {
    guardrailVerdict = VERDICTS.READY_FOR_CAPS_APPROVAL;
    reason = readinessBlockers.map((c) => `${c.id}: ${c.detail}`).join("; ") || "secondary readiness checks incomplete";
  } else if (failedCritical.length === 0) {
    guardrailVerdict = VERDICTS.READY_FOR_FINAL_MICRO_LIVE_REVIEW;
    reason = "All hard guardrails pass; engineering proof review only — live trading NOT APPROVED";
  } else {
    guardrailVerdict = VERDICTS.NOT_READY;
    reason = failedCritical.map((c) => `${c.id}: ${c.detail}`).join("; ");
  }

  return {
    timestamp: new Date().toISOString(),
    review: "Track-A-micro-live-guardrails",
    schemaVersion: capsModule.SCHEMA_VERSION,
    gateDocPresent,
    approved: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    capitalAtRiskUsd: 0,
    guardrailVerdict,
    forbiddenVerdicts: FORBIDDEN_VERDICTS,
    evaluation: {
      guardrailVerdict,
      reason,
      approved: false,
      liveTradingApproved: false
    },
    postureSummary: posture.available ? {
      executionMode: posture.executionMode,
      dryRunMode: posture.dryRunMode,
      liveArmed: posture.liveArmed,
      emergencyStop: posture.emergencyStop,
      autoCompounding: posture.autoCompounding === true,
      safeForPrebuild: isSafePrebuildPosture(posture)
    } : { available: false, status: posture.status },
    caps: {
      file: capsFile,
      loadStatus: capsLoad.status,
      conservativeOk: capsSummary.conservativeOk,
      approvedOk: capsSummary.approvedOk,
      limits: capsModule.CONSERVATIVE_LIMITS,
      errors: capsSummary.errors || []
    },
    singletonStatus: singletonCheck,
    walletStatusSummary: {
      status: walletStatus.status,
      present: walletStatus.status === "usable"
    },
    livePositionsSummary: {
      status: livePositions.status,
      openCount: livePositions.openCount,
      valid: livePositions.ok === true
    },
    liveSessionTrades,
    safetySuite: {
      scriptAvailable: safetySuiteAvailable,
      verifiedGreen: safetySuiteGreen === true,
      note: safetySuiteGreen === undefined
        ? "Run node run_safety_tests.js before any future arming; guardrails do not auto-run full suite."
        : safetySuiteGreen === true
          ? "Safety suite reported green for this check."
          : "Safety suite reported not green."
    },
    checks,
    failedCritical: failedCritical.map((c) => c.id),
    failedNonCritical: failedNonCritical.map((c) => c.id),
    blockers: [
      "live trading not approved",
      "micro-live not approved",
      "R7 edge not proven",
      "engineering proof only — not strategy-profit validation",
      "no transaction submission in guardrail phase"
    ],
    recommendedNextSteps: [
      "Operator creates and approves operator_records/micro_live_demo_caps.json",
      "Run node run_safety_tests.js immediately before any future arming",
      "Resolve any readiness blockers before final micro-live review",
      "Future live submission code must call guardrail check and pass before any tx"
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
    throw new Error("guardrail output must stay under analysis/");
  }
}

function writeGuardrailsCheck(status, outputFile = OUTPUT_FILE, analysisDir = OUTPUT_DIR) {
  assertAnalysisWritePath(outputFile, analysisDir);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[track-a-guardrails] Micro-live Guardrail Check (read-only)");
  console.log(`  verdict: ${status.guardrailVerdict}`);
  console.log(`  approved: false`);
  console.log(`  live trading approved: false`);
  console.log(`  critical failures: ${status.failedCritical.length}`);
}

function runMicroLiveGuardrailsCheck(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const outputFile = options.outputFile || path.join(analysisDir, "micro_live_guardrails_check.json");
  const status = collectMicroLiveGuardrailsCheck({
    ...options,
    analysisDir
  });

  if (options.writeOutput !== false) {
    writeGuardrailsCheck(status, outputFile, analysisDir);
  }

  if (options.print !== false) {
    printSummary(status);
  }

  return { status, outputFile: options.writeOutput !== false ? outputFile : null };
}

if (require.main === module) {
  try {
    const result = runMicroLiveGuardrailsCheck();
    if (result.outputFile) console.log(`  output: ${result.outputFile}`);
  } catch (err) {
    console.error("[track-a-guardrails] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOC,
  OUTPUT_FILE,
  VERDICTS,
  FORBIDDEN_VERDICTS,
  readPosture,
  isSafePrebuildPosture,
  checkSingletonLock,
  countLiveSessionTrades,
  checkLivePositions,
  collectMicroLiveGuardrailsCheck,
  runMicroLiveGuardrailsCheck
};
