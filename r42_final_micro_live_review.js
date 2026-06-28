"use strict";

// r42_final_micro_live_review.js — R42 read-only final micro-live approval review.
// Writes analysis/ only. Does NOT enable live trading, sign, or handle secrets.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const capsModule = require("./micro_live_caps");
const guardrails = require("./micro_live_guardrails");
const livePositionsStore = require("./live_positions_store");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R42_OUTPUT_DIR
  ? path.resolve(process.env.R42_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r42_final_micro_live_review.json");
const GATE_DOC = "docs/R42_FINAL_MICRO_LIVE_APPROVAL_REVIEW.md";

const SCHEMA_VERSION = 1;

const VERDICTS = Object.freeze({
  NOT_READY: "NOT READY FOR MICRO-LIVE PROOF",
  READY_CAPS: "READY TO CREATE OPERATOR CAPS FILE",
  READY_STUBS: "READY TO BUILD LOCAL SIGNER STUBS",
  READY_PROOF: "READY FOR ONE-TRANSACTION ENGINEERING PROOF"
});

const FORBIDDEN_VERDICTS = Object.freeze([
  "READY FOR LIVE TRADING",
  "LIVE APPROVED",
  "MICRO_LIVE_APPROVED"
]);

const REQUIRED_DOCS = Object.freeze([
  "docs/R8A_MICRO_LIVE_ENGINEERING_PROOF_PLAN.md",
  "docs/TRACK_A_MICRO_LIVE_GUARDRAILS.md",
  "docs/R39_SIGNER_SAFETY_DESIGN.md",
  "docs/R40_MOCK_SIGNER_TEST_PLAN.md",
  "docs/R41_LOCAL_SIGNER_IMPLEMENTATION_PLAN.md",
  GATE_DOC
]);

const REQUIRED_MODULES = Object.freeze([
  "micro_live_caps.js",
  "micro_live_guardrails.js",
  "micro_live_preflight.js",
  "mock_signer.js",
  "secret_safety_scan.js",
  "signer_plan_preflight.js",
  "examples/micro_live_demo_caps.example.json"
]);

const LOCAL_SIGNER_STUB = "local_signer.js";
const OPERATOR_CAPS = "operator_records/micro_live_demo_caps.json";

const OPERATOR_APPROVAL_TEMPLATE =
  "I approve a one-transaction micro-live engineering proof only. "
  + "This is not strategy-profit validation, not full live trading approval, "
  + "and not approval for repeated trading. Maximum trade size is X SOL. "
  + "Maximum daily loss is Y SOL. I will be present during execution. "
  + "Stop after the first transaction.";

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
    emergencyStop: data.emergencyStop === true,
    dedicatedRpcConfigured: data.dedicatedRpcConfigured === true
      || (typeof data.rpcEndpoint === "string" && data.rpcEndpoint && !/mainnet-beta/i.test(data.rpcEndpoint))
  };
}

function isSafeReviewPosture(posture) {
  return (
    posture.available === true &&
    posture.executionMode === "PIPELINE_DRY_RUN" &&
    posture.dryRunMode === true &&
    posture.liveArmed === false &&
    posture.emergencyStop !== true
  );
}

function checkFileList(repoRoot, relativePaths) {
  const missing = [];
  const present = [];
  for (const rel of relativePaths) {
    const full = path.join(repoRoot, rel);
    if (fs.existsSync(full)) present.push(rel);
    else missing.push(rel);
  }
  return { ok: missing.length === 0, missing, present };
}

function checkLivePositions(runtimeRoot) {
  const file = path.join(runtimeRoot, "live_positions.json");
  if (!fs.existsSync(file)) return { ok: true, openCount: 0, status: "missing" };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const validation = livePositionsStore.validateLivePositionsState(parsed);
    const openCount = Array.isArray(parsed) ? parsed.length : 0;
    return { ok: validation.ok && openCount === 0, openCount, status: validation.ok ? "usable" : "invalid" };
  } catch {
    return { ok: false, openCount: null, status: "corrupt" };
  }
}

function checkExecutorIntegration(repoRoot) {
  const executorPath = path.join(repoRoot, "live_executor.js");
  if (!fs.existsSync(executorPath)) {
    return { integrated: false, ok: true, note: "live_executor.js not found" };
  }
  const src = fs.readFileSync(executorPath, "utf8");
  const integrated = /require\s*\(\s*['"]\.\/local_signer['"]/.test(src)
    || /loadSignerFromApprovedSource/.test(src);
  return {
    integrated,
    ok: !integrated,
    note: integrated ? "local_signer integrated in live_executor — unexpected for R42" : "no signer integration"
  };
}

function deriveVerdict(context) {
  if (!context.postureSafe || context.recoveryPresent) {
    return {
      verdict: VERDICTS.NOT_READY,
      reason: context.recoveryPresent
        ? "recovery_actions.jsonl present"
        : "unsafe runtime posture"
    };
  }

  if (!context.docsCheck.ok || !context.modulesCheck.ok) {
    return {
      verdict: VERDICTS.NOT_READY,
      reason: `missing artifacts: ${[
        ...(context.docsCheck.missing || []),
        ...(context.modulesCheck.missing || [])
      ].join(", ")}`
    };
  }

  if (context.capsLoad.status === "corrupt") {
    return {
      verdict: VERDICTS.NOT_READY,
      reason: "operator caps file corrupt"
    };
  }

  const capsMissing = context.capsLoad.status === "missing";
  const capsUnapproved = context.capsLoad.status === "present"
    && context.capsSummary.approvedOk !== true;

  if (capsMissing || capsUnapproved) {
    return {
      verdict: VERDICTS.READY_CAPS,
      reason: capsMissing
        ? "operator caps file missing — create from example template"
        : "operator caps present but not approved"
    };
  }

  if (!context.localSignerStubPresent) {
    return {
      verdict: VERDICTS.READY_STUBS,
      reason: "operator caps approved; local_signer.js safety stubs not yet built"
    };
  }

  const proofBlockers = [];
  if (context.executorIntegration.integrated) proofBlockers.push("live_executor signer integration present");
  if (!context.dedicatedRpcReady) proofBlockers.push("dedicated RPC missing");
  if (!context.finalHumanApproval) proofBlockers.push("final human approval missing");
  if (context.guardrailVerdict !== guardrails.VERDICTS.READY_FOR_FINAL_MICRO_LIVE_REVIEW) {
    proofBlockers.push(`guardrails: ${context.guardrailVerdict}`);
  }
  if (!context.livePositions.ok) proofBlockers.push("live positions not empty/valid");
  if (context.singletonCheck.duplicateLoop) proofBlockers.push("duplicate executor loop");
  if (context.r7Verdict === "NOT ENOUGH DATA") {
    proofBlockers.push("R7 NOT ENOUGH DATA — engineering proof only with explicit operator risk acceptance");
  }

  if (proofBlockers.length === 0) {
    return {
      verdict: VERDICTS.READY_PROOF,
      reason: "All R42 checklist items satisfied for one-transaction engineering proof review — live trading still NOT APPROVED"
    };
  }

  return {
    verdict: VERDICTS.READY_STUBS,
    reason: proofBlockers.join("; ")
  };
}

function collectR42FinalMicroLiveReview(options = {}) {
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
  const postureSafe = options.postureSafe !== undefined
    ? options.postureSafe === true
    : isSafeReviewPosture(posture);

  const docsCheck = options.docsCheck !== undefined
    ? options.docsCheck
    : checkFileList(repoRoot, REQUIRED_DOCS);

  const modulesCheck = options.modulesCheck !== undefined
    ? options.modulesCheck
    : checkFileList(repoRoot, REQUIRED_MODULES);

  const capsFile = options.capsFile || path.join(repoRoot, OPERATOR_CAPS);
  const capsLoad = options.capsLoad !== undefined
    ? options.capsLoad
    : capsModule.loadCapsFile(capsFile);
  const capsSummary = options.capsSummary !== undefined
    ? options.capsSummary
    : capsModule.summarizeCapsLoad(capsLoad);

  const localSignerStubPresent = options.localSignerStubPresent !== undefined
    ? options.localSignerStubPresent === true
    : fs.existsSync(path.join(repoRoot, LOCAL_SIGNER_STUB));

  const executorIntegration = options.executorIntegration !== undefined
    ? options.executorIntegration
    : checkExecutorIntegration(repoRoot);

  const dedicatedRpcReady = options.dedicatedRpcReady !== undefined
    ? options.dedicatedRpcReady === true
    : posture.dedicatedRpcConfigured === true;

  const finalHumanApproval = options.finalHumanApproval === true;

  const singletonCheck = options.singletonCheck !== undefined
    ? options.singletonCheck
    : guardrails.checkSingletonLock(runtimeRoot);

  const livePositions = options.livePositionsCheck !== undefined
    ? options.livePositionsCheck
    : checkLivePositions(runtimeRoot);

  let guardrailVerdict = options.guardrailVerdict;
  if (guardrailVerdict === undefined) {
    const guardStatus = guardrails.collectMicroLiveGuardrailsCheck({
      repoRoot,
      runtimeRoot,
      analysisDir,
      capsLoad,
      capsSummary,
      writeOutput: false,
      print: false,
      safetySuiteGreen: options.safetySuiteGreen
    });
    guardrailVerdict = guardStatus.guardrailVerdict;
  }

  const r7Metrics = readJsonIfPresent(
    options.r7MetricsFile || path.join(analysisDir, "r7_strategy_metrics.json")
  );
  const r7Verdict = options.r7Verdict
    || r7Metrics.data?.recommendation?.verdict
    || "NOT ENOUGH DATA";

  const context = {
    postureSafe,
    recoveryPresent,
    docsCheck,
    modulesCheck,
    capsLoad,
    capsSummary,
    localSignerStubPresent,
    executorIntegration,
    dedicatedRpcReady,
    finalHumanApproval,
    guardrailVerdict,
    livePositions,
    singletonCheck,
    r7Verdict
  };

  const derived = deriveVerdict(context);

  const checks = [];
  const addCheck = (id, ok, detail) => checks.push({ id, ok: ok === true, detail });

  addCheck("gate_doc_present", gateDocPresent, GATE_DOC);
  addCheck("recovery_absent", !recoveryPresent, "recovery_actions.jsonl absent");
  addCheck("posture_safe", postureSafe, "PIPELINE_DRY_RUN / dryRunMode true / liveArmed false");
  addCheck("required_docs_present", docsCheck.ok, docsCheck.missing?.join(", ") || "ok");
  addCheck("required_modules_present", modulesCheck.ok, modulesCheck.missing?.join(", ") || "ok");
  addCheck("operator_caps_ready", capsSummary.approvedOk === true, capsLoad.status);
  addCheck("local_signer_stub_present", localSignerStubPresent, LOCAL_SIGNER_STUB);
  addCheck("no_executor_signer_integration", executorIntegration.ok, executorIntegration.note);
  addCheck("live_positions_empty", livePositions.ok, String(livePositions.openCount));
  addCheck("no_duplicate_executor", !singletonCheck.duplicateLoop, singletonCheck.executorSingletonLock);
  addCheck("live_trading_not_approved", true, "live trading NOT APPROVED");
  addCheck("full_live_trading_not_approved", true, "R42 is not full live trading approval");

  return {
    timestamp: new Date().toISOString(),
    review: "R42-final-micro-live-approval",
    schemaVersion: SCHEMA_VERSION,
    gateDocPresent,
    approved: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    microLiveProofApproved: false,
    capitalAtRiskUsd: 0,
    r42Verdict: derived.verdict,
    forbiddenVerdicts: FORBIDDEN_VERDICTS,
    evaluation: {
      r42Verdict: derived.verdict,
      reason: derived.reason,
      approved: false,
      liveTradingApproved: false,
      scope: "one-transaction engineering proof review only — not full live trading approval"
    },
    scopeStatement: {
      isFullLiveTradingApproval: false,
      isStrategyProfitValidation: false,
      isOneTransactionEngineeringProofReview: true,
      r7Bypassed: false
    },
    gateStatus: {
      r6aSoak: "PASS",
      r7EdgeReview: r7Verdict,
      r8aPlan: docsCheck.present.includes("docs/R8A_MICRO_LIVE_ENGINEERING_PROOF_PLAN.md") ? "COMPLETE" : "MISSING",
      trackAGuardrails: modulesCheck.present.includes("micro_live_guardrails.js") ? "COMPLETE" : "MISSING",
      r39SignerDesign: docsCheck.present.includes("docs/R39_SIGNER_SAFETY_DESIGN.md") ? "COMPLETE" : "MISSING",
      r40MockSigner: modulesCheck.present.includes("mock_signer.js") ? "COMPLETE" : "MISSING",
      r41LocalSignerPlan: docsCheck.present.includes("docs/R41_LOCAL_SIGNER_IMPLEMENTATION_PLAN.md") ? "COMPLETE" : "MISSING",
      operatorCapsFile: capsLoad.status,
      operatorCapsApproved: capsSummary.approvedOk === true,
      realLocalSigner: localSignerStubPresent ? "STUB_PRESENT" : "MISSING",
      liveExecutorSignerIntegration: executorIntegration.integrated ? "PRESENT" : "MISSING",
      dedicatedRpc: dedicatedRpcReady ? "CONFIGURED" : "MISSING",
      finalHumanApproval: finalHumanApproval ? "PRESENT" : "MISSING",
      liveTradingApproved: false
    },
    postureSummary: posture.available ? {
      executionMode: posture.executionMode,
      dryRunMode: posture.dryRunMode,
      liveArmed: posture.liveArmed,
      emergencyStop: posture.emergencyStop,
      liveSubmission: "DISARMED",
      safeForReview: postureSafe
    } : { available: false, status: posture.status },
    capsSummary: {
      file: capsFile,
      loadStatus: capsLoad.status,
      conservativeOk: capsSummary.conservativeOk,
      approvedOk: capsSummary.approvedOk
    },
    guardrailVerdict,
    signerPlanNote: "signer_plan_preflight.js available — run separately",
    operatorApprovalLanguageDraft: OPERATOR_APPROVAL_TEMPLATE,
    remainingBeforeProof: [
      "create operator_records/micro_live_demo_caps.json",
      "approve conservative caps with operator sign-off",
      "choose dedicated hot wallet",
      "verify wallet balance within cap",
      "choose R41 secret method",
      "build local_signer.js safety stubs",
      "run secret_safety_scan.js",
      "run micro_live_guardrails.js",
      "run run_safety_tests.js",
      "verify recovery_actions.jsonl absent",
      "verify no duplicate executor",
      "verify live_positions.json empty",
      "write rollback/post-trade review plan",
      "provision dedicated RPC",
      "obtain R43 final human approval"
    ],
    requiredBlocksRemain: [
      "full live trading",
      "repeated autonomous trades",
      "auto-compounding",
      "more than one open position",
      "main wallet usage",
      "large balance wallet",
      "signer secret exposure",
      "dashboard one-click live enable",
      "recovery automation in live mode",
      "any transaction when guardrails fail"
    ],
    checks,
    failedChecks: checks.filter((c) => !c.ok).map((c) => c.id),
    recommendedNextStep: derived.verdict === VERDICTS.READY_CAPS
      ? "create operator caps file"
      : derived.verdict === VERDICTS.READY_STUBS
        ? "build local signer safety stubs"
        : derived.verdict === VERDICTS.NOT_READY
          ? "resolve blockers first"
          : "proceed to R43 final human approval — live trading still NOT APPROVED",
    blockers: [
      "live trading not approved",
      "micro-live not full approval",
      "R7 edge not proven",
      "engineering proof only"
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
    throw new Error("R42 review output must stay under analysis/");
  }
}

function writeReview(status, outputFile = OUTPUT_FILE, analysisDir = OUTPUT_DIR) {
  assertAnalysisWritePath(outputFile, analysisDir);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[r42-review] Final Micro-Live Approval Review (read-only)");
  console.log(`  verdict: ${status.r42Verdict}`);
  console.log(`  approved: false`);
  console.log(`  live trading approved: false`);
  console.log(`  next step: ${status.recommendedNextStep}`);
}

function runR42FinalMicroLiveReview(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const outputFile = options.outputFile || path.join(analysisDir, "r42_final_micro_live_review.json");
  const status = collectR42FinalMicroLiveReview({
    ...options,
    analysisDir
  });

  if (options.writeOutput !== false) {
    writeReview(status, outputFile, analysisDir);
  }

  if (options.print !== false) {
    printSummary(status);
  }

  return { status, outputFile: options.writeOutput !== false ? outputFile : null };
}

if (require.main === module) {
  try {
    const result = runR42FinalMicroLiveReview();
    if (result.outputFile) console.log(`  output: ${result.outputFile}`);
  } catch (err) {
    console.error("[r42-review] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOC,
  OUTPUT_FILE,
  SCHEMA_VERSION,
  VERDICTS,
  FORBIDDEN_VERDICTS,
  REQUIRED_DOCS,
  REQUIRED_MODULES,
  LOCAL_SIGNER_STUB,
  OPERATOR_CAPS,
  OPERATOR_APPROVAL_TEMPLATE,
  readPosture,
  isSafeReviewPosture,
  checkFileList,
  checkLivePositions,
  checkExecutorIntegration,
  deriveVerdict,
  collectR42FinalMicroLiveReview,
  runR42FinalMicroLiveReview
};
