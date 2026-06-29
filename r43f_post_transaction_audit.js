"use strict";

// r43f_post_transaction_audit.js — R43F post-transaction audit review (read-only).
// Reviews analysis/r43e_real_proof_review.json only. Does NOT submit transactions.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const r42 = require("./r42_final_micro_live_review");
const r43d = require("./r43d_final_proof_preflight");
const livePositionsStore = require("./live_positions_store");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R43F_OUTPUT_DIR
  ? path.resolve(process.env.R43F_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const PROOF_REVIEW_FILE = path.join(OUTPUT_DIR, "r43e_real_proof_review.json");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r43f_post_transaction_audit.json");
const GATE_DOC = "docs/R43F_POST_TRANSACTION_AUDIT.md";
const RECOVERY_FILE = "recovery_actions.jsonl";

const SCHEMA_VERSION = 1;
const R43F_REVIEW_VERDICT = "R43F POST-TRANSACTION AUDIT — NOT FULL LIVE TRADING — NO NEW SUBMISSION";
const PROOF_SCOPE = "one-transaction engineering proof only";
const MAX_TRADE_SIZE_SOL = 0.01;
const EXPECTED_R43E_VERDICT = "R43E_REAL_PROOF_ATTEMPTED";

const VERDICTS = Object.freeze({
  NOT_READY: "R43F_NOT_READY_FOR_AUDIT",
  PASSED: "R43F_POST_TRANSACTION_AUDIT_PASSED",
  FAILED: "R43F_POST_TRANSACTION_AUDIT_FAILED"
});

const FORBIDDEN_VERDICTS = Object.freeze([
  "LIVE_APPROVED",
  "READY_FOR_LIVE_TRADING",
  "STRATEGY_APPROVED",
  "AUTONOMOUS_TRADING_ENABLED"
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
    liveSubmission: "DISARMED"
  };
}

function loadProofReview(options = {}) {
  const file = options.proofReviewFile || PROOF_REVIEW_FILE;
  if (!fs.existsSync(file)) {
    return { status: "missing", file, data: null };
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return { status: "present", file, data };
  } catch (err) {
    return {
      status: "corrupt",
      file,
      data: null,
      error: err && err.message ? err.message : String(err)
    };
  }
}

function checkLivePositions(runtimeRoot, options = {}) {
  if (options.livePositionsCheck !== undefined) {
    return options.livePositionsCheck;
  }
  const file = path.join(runtimeRoot, "live_positions.json");
  if (!fs.existsSync(file)) {
    return { ok: true, openCount: 0, status: "missing_treated_empty" };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const validation = livePositionsStore.validateLivePositionsState(parsed);
    const openCount = Array.isArray(parsed) ? parsed.length : 0;
    return {
      ok: validation.ok === true && openCount === 0,
      openCount,
      status: validation.ok ? "empty" : "invalid_or_open"
    };
  } catch {
    return { ok: false, openCount: null, status: "corrupt" };
  }
}

function safeScanProofReviewJson(text) {
  const hits = [];
  if (/"privateKey"\s*:/.test(text)) hits.push("privateKey field");
  if (/"secretKey"\s*:/.test(text)) hits.push("secretKey field");
  if (/"seedPhrase"\s*:/.test(text)) hits.push("seedPhrase field");
  if (/"mnemonic"\s*:/.test(text)) hits.push("mnemonic field");
  return hits;
}

function evaluateGateStatusConsistency(proofReview) {
  const warnings = [];
  const notes = [];
  const gateStatus = proofReview.gateStatus || {};
  const preBroadcast = proofReview.preBroadcastGateStatus || gateStatus;
  const finalStatus = proofReview.finalTransactionStatus || null;

  if (finalStatus && typeof finalStatus === "object") {
    notes.push("finalTransactionStatus present — use for post-broadcast state");
    return { ok: true, warnings, notes };
  }

  if (proofReview.transactionSubmitted === true
      && preBroadcast.transactionSubmitted === false) {
    warnings.push(
      "gateStatus.transactionSubmitted is pre-broadcast-only (false) while top-level transactionSubmitted is true — use finalTransactionStatus after R43E harness update"
    );
    return { ok: true, warnings, notes: [...notes, "legacy audit: gateStatus is pre-broadcast-only"] };
  }

  if (proofReview.transactionSubmitted === true
      && preBroadcast.transactionSubmitted === true) {
    return { ok: true, warnings, notes };
  }

  return { ok: true, warnings, notes };
}

function collectR43fPostTransactionAudit(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const blockers = [];
  const warnings = [];
  const checks = [];

  const gateDocPresent = options.gateDocPresent !== undefined
    ? options.gateDocPresent === true
    : fs.existsSync(path.join(repoRoot, GATE_DOC));

  const proofReviewLoad = options.proofReviewLoad !== undefined
    ? options.proofReviewLoad
    : loadProofReview({ proofReviewFile: options.proofReviewFile });

  const posture = options.postureStatus !== undefined
    ? options.postureStatus
    : readPosture(runtimeRoot);

  const recoveryPresent = options.recoveryPresent !== undefined
    ? options.recoveryPresent === true
    : fs.existsSync(path.join(runtimeRoot, RECOVERY_FILE))
      || fs.existsSync(path.join(repoRoot, RECOVERY_FILE));

  const livePositions = checkLivePositions(runtimeRoot, options);

  const executorIntegration = options.executorIntegrationCheck !== undefined
    ? options.executorIntegrationCheck
    : r42.checkExecutorIntegration(repoRoot);

  const proofReview = proofReviewLoad.data;
  let r43fVerdict = VERDICTS.NOT_READY;

  function addCheck(id, ok, detail) {
    checks.push({ id, ok: ok === true, detail: String(detail) });
  }

  addCheck("gate_doc_present", gateDocPresent, GATE_DOC);
  addCheck("proof_review_present", proofReviewLoad.status === "present", proofReviewLoad.status);

  if (proofReviewLoad.status !== "present" || !proofReview) {
    blockers.push(`proof review ${proofReviewLoad.status}: r43e_real_proof_review.json`);
    return buildResult({
      r43fVerdict,
      blockers,
      warnings,
      checks,
      gateDocPresent,
      proofReviewLoad,
      posture,
      recoveryPresent,
      livePositions,
      executorIntegration,
      options
    });
  }

  const gateConsistency = evaluateGateStatusConsistency(proofReview);
  for (const warning of gateConsistency.warnings) warnings.push(warning);

  addCheck("r43e_attempted_verdict", proofReview.r43eRealProofVerdict === EXPECTED_R43E_VERDICT,
    proofReview.r43eRealProofVerdict || "missing");
  addCheck("single_broadcast_recorded", proofReview.transactionSubmitted === true
      && typeof proofReview.signature === "string"
      && proofReview.signature.length > 20,
    `transactionSubmitted=${proofReview.transactionSubmitted} signature=${proofReview.signature ? "present" : "null"}`);
  addCheck("proof_stopped_after_first_attempt", proofReview.proofStoppedAfterFirstAttempt === true,
    String(proofReview.proofStoppedAfterFirstAttempt));
  addCheck("no_broadcast_error", !proofReview.broadcastError, proofReview.broadcastError || "none");
  addCheck("live_trading_not_approved", proofReview.liveTradingApproved !== true, "liveTradingApproved:false");
  addCheck("strategy_not_approved", proofReview.strategyApproved !== true, "strategyApproved:false");
  addCheck("r7_not_enough_data", proofReview.r7Status === "NOT ENOUGH DATA", proofReview.r7Status || "missing");
  addCheck("recovery_absent", !recoveryPresent, "recovery_actions.jsonl absent");
  addCheck("live_positions_empty", livePositions.ok === true, `open=${livePositions.openCount}`);
  addCheck("executor_not_integrated", executorIntegration.ok === true, executorIntegration.note || "ok");
  addCheck("posture_dry_run", posture.executionMode === "PIPELINE_DRY_RUN", posture.executionMode || "unknown");
  addCheck("posture_dry_run_mode", posture.dryRunMode === true, String(posture.dryRunMode));
  addCheck("posture_not_live_armed", posture.liveArmed !== true, String(posture.liveArmed));
  addCheck("signer_public_key_only", Boolean(proofReview.signerPublicKey)
      && proofReview.signerStatus?.secretContentPrinted !== true,
    proofReview.signerPublicKey || "missing");
  addCheck("amount_within_cap", Number(proofReview.amountSol) <= MAX_TRADE_SIZE_SOL,
    String(proofReview.amountSol));
  addCheck("forbidden_verdicts_absent", !FORBIDDEN_VERDICTS.includes(proofReview.r43eRealProofVerdict),
    proofReview.r43eRealProofVerdict || "missing");

  const proofJsonText = JSON.stringify(proofReview);
  const secretHits = safeScanProofReviewJson(proofJsonText);
  addCheck("no_secrets_in_proof_review", secretHits.length === 0, secretHits.join("; ") || "ok");

  if (proofReview.r43eRealProofVerdict !== EXPECTED_R43E_VERDICT) {
    blockers.push(`expected ${EXPECTED_R43E_VERDICT}, got ${proofReview.r43eRealProofVerdict}`);
  }
  if (proofReview.transactionSubmitted !== true) {
    blockers.push("transactionSubmitted is not true — no broadcast to audit");
  }
  if (!proofReview.signature) {
    blockers.push("signature missing from proof review");
  }
  if (proofReview.proofStoppedAfterFirstAttempt !== true) {
    blockers.push("proofStoppedAfterFirstAttempt must be true");
  }
  if (proofReview.liveTradingApproved === true) {
    blockers.push("liveTradingApproved must remain false");
  }
  if (proofReview.strategyApproved === true) {
    blockers.push("strategyApproved must remain false");
  }
  if (recoveryPresent) {
    blockers.push("recovery_actions.jsonl present");
  }
  if (!livePositions.ok) {
    blockers.push(`live_positions.json not empty (open=${livePositions.openCount})`);
  }
  if (!executorIntegration.ok) {
    blockers.push("live_executor signer integration detected");
  }
  if (posture.executionMode !== "PIPELINE_DRY_RUN"
      || posture.dryRunMode !== true
      || posture.liveArmed === true) {
    blockers.push("unsafe runtime posture after proof attempt");
  }
  if (secretHits.length > 0) {
    blockers.push(`secret leakage in proof review: ${secretHits.join("; ")}`);
  }
  if (Number(proofReview.amountSol) > MAX_TRADE_SIZE_SOL) {
    blockers.push(`amountSol exceeds cap (${proofReview.amountSol})`);
  }

  const failedChecks = checks.filter((check) => !check.ok);
  if (blockers.length === 0 && failedChecks.length === 0) {
    r43fVerdict = VERDICTS.PASSED;
  } else if (proofReview.transactionSubmitted === true) {
    r43fVerdict = blockers.length > 0 ? VERDICTS.FAILED : VERDICTS.PASSED;
  }

  return buildResult({
    r43fVerdict,
    blockers,
    warnings,
    checks,
    gateDocPresent,
    proofReviewLoad,
    proofReview,
    posture,
    recoveryPresent,
    livePositions,
    executorIntegration,
    gateConsistency,
    secretHits,
    options
  });
}

function buildResult(context) {
  const proofReview = context.proofReview || context.proofReviewLoad?.data || null;
  return {
    timestamp: new Date().toISOString(),
    review: "R43F-post-transaction-audit",
    schemaVersion: SCHEMA_VERSION,
    gateDocPresent: context.gateDocPresent === true,
    r43fReviewVerdict: R43F_REVIEW_VERDICT,
    r43fVerdict: context.r43fVerdict,
    forbiddenVerdicts: FORBIDDEN_VERDICTS,
    approved: false,
    liveTradingApproved: false,
    strategyApproved: false,
    engineeringProofAuditPassed: context.r43fVerdict === VERDICTS.PASSED,
    proofScope: PROOF_SCOPE,
    blockers: context.blockers,
    warnings: context.warnings,
    checks: context.checks,
    failedChecks: context.checks.filter((check) => !check.ok).map((check) => check.id),
    proofReviewSummary: proofReview ? {
      r43eRealProofVerdict: proofReview.r43eRealProofVerdict,
      transactionSubmitted: proofReview.transactionSubmitted === true,
      signature: proofReview.signature || null,
      proofStoppedAfterFirstAttempt: proofReview.proofStoppedAfterFirstAttempt === true,
      broadcastAttemptedAt: proofReview.broadcastAttemptedAt || null,
      signerPublicKey: proofReview.signerPublicKey || proofReview.signerStatus?.publicKey || null,
      amountSol: proofReview.amountSol,
      r7Status: proofReview.r7Status
    } : null,
    gateStatusConsistency: context.gateConsistency || null,
    postureStatus: context.posture,
    tradingState: {
      recoveryPresent: context.recoveryPresent === true,
      livePositionsOpen: context.livePositions?.openCount ?? null,
      livePositionsOk: context.livePositions?.ok === true
    },
    executorIntegration: {
      ok: context.executorIntegration?.ok === true,
      note: context.executorIntegration?.note || null
    },
    secretScan: {
      proofReviewHits: context.secretHits || [],
      contentPrinted: false
    },
    nextRecommendedStep: context.r43fVerdict === VERDICTS.PASSED
      ? "Track B B1 thesis / close Track A engineering proof chapter — live trading NOT approved"
      : context.r43fVerdict === VERDICTS.FAILED
        ? "remediate blockers before any further proof attempts"
        : "complete R43E broadcast and write r43e_real_proof_review.json before R43F",
    outputFile: OUTPUT_FILE
  };
}

function assertAnalysisWritePath(outputFile, analysisDir) {
  const resolvedOutput = path.resolve(outputFile);
  const resolvedAnalysis = path.resolve(analysisDir);
  const prefix = resolvedAnalysis.endsWith(path.sep)
    ? resolvedAnalysis
    : `${resolvedAnalysis}${path.sep}`;
  if (!resolvedOutput.startsWith(prefix)) {
    throw new Error("R43F output must stay under analysis/");
  }
}

function writeAudit(status, outputDir = OUTPUT_DIR) {
  const outputFile = path.join(outputDir, path.basename(OUTPUT_FILE));
  assertAnalysisWritePath(outputFile, outputDir);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runR43fPostTransactionAudit(options = {}) {
  const analysisDir = options.outputDir || OUTPUT_DIR;
  const status = collectR43fPostTransactionAudit(options);
  const outputFile = writeAudit(status, analysisDir);
  return { ...status, outputFile };
}

function printSummary(status) {
  console.log("[r43f-audit] R43F Post-Transaction Audit Review (read-only)");
  console.log(`  verdict: ${status.r43fVerdict}`);
  console.log(`  review: ${status.r43fReviewVerdict}`);
  console.log(`  engineering proof audit passed: ${status.engineeringProofAuditPassed === true}`);
  if (status.proofReviewSummary) {
    console.log(`  r43e verdict: ${status.proofReviewSummary.r43eRealProofVerdict}`);
    console.log(`  transactionSubmitted: ${status.proofReviewSummary.transactionSubmitted}`);
    console.log(`  signature: ${status.proofReviewSummary.signature || "null"}`);
    console.log(`  signerPublicKey: ${status.proofReviewSummary.signerPublicKey || "null"}`);
  }
  console.log(`  blockers: ${status.blockers.length}`);
  for (const blocker of status.blockers) {
    console.log(`    - ${blocker}`);
  }
  if (status.warnings.length > 0) {
    console.log(`  warnings: ${status.warnings.length}`);
    for (const warning of status.warnings) {
      console.log(`    - ${warning}`);
    }
  }
  console.log(`  live trading approved: ${status.liveTradingApproved}`);
  console.log(`  next step: ${status.nextRecommendedStep}`);
  console.log(`  output: ${status.outputFile}`);
}

if (require.main === module) {
  try {
    const status = runR43fPostTransactionAudit();
    printSummary(status);
  } catch (err) {
    console.error("[r43f-audit] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  ROOT,
  RUNTIME_ROOT,
  OUTPUT_DIR,
  OUTPUT_FILE,
  PROOF_REVIEW_FILE,
  GATE_DOC,
  SCHEMA_VERSION,
  R43F_REVIEW_VERDICT,
  PROOF_SCOPE,
  MAX_TRADE_SIZE_SOL,
  EXPECTED_R43E_VERDICT,
  VERDICTS,
  FORBIDDEN_VERDICTS,
  loadProofReview,
  evaluateGateStatusConsistency,
  collectR43fPostTransactionAudit,
  runR43fPostTransactionAudit,
  printSummary
};
