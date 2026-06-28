"use strict";

// r43c_local_signer_readiness.js — R43C read-only local signer readiness checker.
// Writes analysis/ only. Does NOT enable live trading, sign, or submit transactions.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const r42 = require("./r42_final_micro_live_review");
const r43b = require("./r43b_operator_caps_approval_check");
const capsModule = require("./micro_live_caps");
const rpcConfig = require("./micro_live_rpc_config");
const localSigner = require("./local_signer");
const provider = require("./signer_provider");
const mockSigner = require("./mock_signer");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R43C_OUTPUT_DIR
  ? path.resolve(process.env.R43C_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r43c_local_signer_readiness.json");
const GATE_DOC = "docs/R43C_REAL_LOCAL_SIGNER_GUARDRAILS.md";
const LOCAL_SIGNER_FILE = "local_signer.js";
const LIVE_EXECUTOR_FILE = "live_executor.js";

const SCHEMA_VERSION = 1;
const R43C_REVIEW_VERDICT = "R43C REAL LOCAL SIGNER — GUARDED — NOT LIVE TRADING — NO SUBMISSION";

const VERDICTS = Object.freeze({
  NOT_READY: "R43C_SIGNER_NOT_READY",
  READY: "R43C_SIGNER_READY_FOR_FINAL_PROOF_PREFLIGHT"
});

const FORBIDDEN_VERDICTS = Object.freeze([
  "LIVE_APPROVED",
  "READY_FOR_LIVE_TRADING"
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

function isSafePosture(posture) {
  return (
    posture.available === true &&
    posture.executionMode === "PIPELINE_DRY_RUN" &&
    posture.dryRunMode === true &&
    posture.liveArmed === false &&
    posture.emergencyStop !== true
  );
}

function checkLocalSignerModule(repoRoot) {
  const filePath = path.join(repoRoot, LOCAL_SIGNER_FILE);
  if (!fs.existsSync(filePath)) {
    return { ok: false, detail: "local_signer.js missing" };
  }
  const src = fs.readFileSync(filePath, "utf8");
  const exportsOk = typeof localSigner.createLocalSigner === "function"
    && typeof localSigner.validateSignerGuardContext === "function"
    && typeof localSigner.redactSignerSourceMetadata === "function"
    && typeof localSigner.loadSignerFromApprovedSource === "function";
  const guardedReal = /allowRealLocalSigner/.test(src)
    && /local_real/.test(src)
    && /LOCAL_GUARD_CONTEXT_BLOCKED/.test(src);
  const noSubmission = !/sendTransaction\s*\(/.test(src)
    && !/sendRawTransaction\s*\(/.test(src);
  return {
    ok: exportsOk && guardedReal && noSubmission,
    exportsOk,
    guardedReal,
    noSubmission,
    detail: exportsOk && guardedReal && noSubmission
      ? "local_real guarded module present"
      : "local signer module incomplete or unsafe"
  };
}

function checkProviderBlocksRealWithoutGuards() {
  const blocked = provider.validateProviderRequest({
    providerType: "local_real",
    caps: null
  });
  const blockedNoAllow = provider.validateProviderRequest({
    providerType: "local_real",
    allowRealLocalSigner: false
  });
  return {
    ok: blocked.ok === false && blockedNoAllow.ok === false,
    withoutOptions: blocked,
    withoutAllowFlag: blockedNoAllow,
    detail: blocked.ok === false && blockedNoAllow.ok === false
      ? "local_real blocked without explicit guard options"
      : "provider allows local_real without guards"
  };
}

function scanAnalysisForSecrets(analysisDir) {
  if (!fs.existsSync(analysisDir)) {
    return { ok: true, suspicious: [] };
  }
  const suspicious = [];
  for (const entry of fs.readdirSync(analysisDir)) {
    const full = path.join(analysisDir, entry);
    if (!fs.statSync(full).isFile()) continue;
    const content = fs.readFileSync(full, "utf8");
    if (mockSigner.containsSuspiciousSecretMaterial(content)) {
      suspicious.push(entry);
    }
  }
  return { ok: suspicious.length === 0, suspicious };
}

function scanRepoForPrivateKeyMaterial(repoRoot) {
  const localSignerPath = path.join(repoRoot, LOCAL_SIGNER_FILE);
  if (!fs.existsSync(localSignerPath)) return { ok: false, detail: "local_signer.js missing" };
  const src = fs.readFileSync(localSignerPath, "utf8");
  const hasInlineSecretArray = /\[\s*(?:\d{1,3}\s*,\s*){63}\d{1,3}\s*\]/.test(src);
  return {
    ok: !hasInlineSecretArray,
    detail: hasInlineSecretArray ? "inline secret array detected in local_signer.js" : "no inline secret arrays"
  };
}

function buildStatus(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const analysisDir = options.analysisDir || path.join(repoRoot, "analysis");
  const gateDocPresent = options.gateDocPresent !== undefined
    ? options.gateDocPresent === true
    : fs.existsSync(path.join(repoRoot, GATE_DOC));
  const recoveryPresent = options.recoveryPresent !== undefined
    ? options.recoveryPresent === true
    : fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"))
      || fs.existsSync(path.join(repoRoot, "recovery_actions.jsonl"));
  const posture = options.posture !== undefined
    ? options.posture
    : readPosture(runtimeRoot);
  const postureSafe = options.postureSafe !== undefined
    ? options.postureSafe === true
    : isSafePosture(posture);

  const capsLoad = options.capsLoad !== undefined
    ? options.capsLoad
    : capsModule.loadCapsFile();
  const caps = capsLoad.data;
  const capsValidation = r43b.validateCapsApprovalRecord(caps, options);

  const rpcSetup = options.rpcSetup !== undefined
    ? options.rpcSetup
    : rpcConfig.loadMicroLiveRpcConfig({ repoRoot, runtimeRoot, ...options });
  const rpcStatus = rpcSetup?.status || "MISSING";

  const executorIntegration = options.executorIntegrationCheck !== undefined
    ? options.executorIntegrationCheck
    : r42.checkExecutorIntegration(repoRoot);

  const executorPath = path.join(repoRoot, LIVE_EXECUTOR_FILE);
  const executorSrc = fs.existsSync(executorPath) ? fs.readFileSync(executorPath, "utf8") : "";
  const executorSendPath = /sendRawTransaction\s*\(/.test(executorSrc)
    ? "sendRawTransaction present in live_executor (pre-existing)"
    : "no new sendRawTransaction in signer path";

  const localSignerCheck = options.localSignerCheck !== undefined
    ? options.localSignerCheck
    : checkLocalSignerModule(repoRoot);
  const providerCheck = options.providerCheck !== undefined
    ? options.providerCheck
    : checkProviderBlocksRealWithoutGuards();
  const repoSecretCheck = options.repoSecretCheck !== undefined
    ? options.repoSecretCheck
    : scanRepoForPrivateKeyMaterial(repoRoot);
  const analysisSecretCheck = options.analysisSecretCheck !== undefined
    ? options.analysisSecretCheck
    : scanAnalysisForSecrets(analysisDir);

  const checks = [];
  const addCheck = (id, ok, detail) => checks.push({ id, ok: ok === true, detail });

  addCheck("gate_doc_present", gateDocPresent, GATE_DOC);
  addCheck("recovery_absent", !recoveryPresent, "recovery_actions.jsonl absent");
  addCheck("posture_disarmed", postureSafe, "PIPELINE_DRY_RUN / dryRunMode true / liveArmed false");
  addCheck("r43b_caps_approval_valid", capsValidation.ok, capsValidation.errors.join("; ") || "ok");
  addCheck("rpc_dedicated_candidate", rpcStatus === "DEDICATED_CANDIDATE", rpcStatus);
  addCheck("local_signer_guarded_real", localSignerCheck.ok, localSignerCheck.detail);
  addCheck("provider_blocks_unguarded_real", providerCheck.ok, providerCheck.detail);
  addCheck("executor_signer_not_integrated", executorIntegration.ok, executorIntegration.note);
  addCheck("local_signer_no_submission_api", localSignerCheck.noSubmission !== false, "no sendTransaction in local_signer.js");
  addCheck("no_inline_repo_secrets", repoSecretCheck.ok, repoSecretCheck.detail);
  addCheck("analysis_no_secrets", analysisSecretCheck.ok, analysisSecretCheck.suspicious?.join(", ") || "ok");
  addCheck("live_trading_not_approved", true, "full live trading NOT APPROVED");

  const failed = checks.filter((check) => !check.ok);
  const r43cVerdict = failed.length === 0 ? VERDICTS.READY : VERDICTS.NOT_READY;
  const reason = failed.length === 0
    ? "Guarded real local signer ready for R43D final proof preflight — live trading still NOT APPROVED"
    : failed.map((check) => `${check.id}: ${check.detail}`).join("; ");

  return {
    timestamp: new Date().toISOString(),
    review: "R43C-local-signer-readiness",
    schemaVersion: SCHEMA_VERSION,
    gateDocPresent,
    approved: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    strategyApproved: false,
    engineeringProofApproved: capsValidation.ok === true,
    r43cReviewVerdict: R43C_REVIEW_VERDICT,
    r43cVerdict,
    forbiddenVerdicts: FORBIDDEN_VERDICTS,
    evaluation: {
      r43cVerdict,
      r43cReviewVerdict: R43C_REVIEW_VERDICT,
      reason,
      approved: false,
      liveTradingApproved: false,
      signerModeStatus: {
        local_stub: "available with allowLocalStub",
        local_real: localSignerCheck.ok ? "guarded — requires allowRealLocalSigner + R43C context" : "not ready",
        networkSubmit: false,
        executorIntegration: false
      },
      providerRegistryStatus: provider.describeProviderAvailability()
    },
    postureSummary: posture.available ? {
      executionMode: posture.executionMode,
      dryRunMode: posture.dryRunMode,
      liveArmed: posture.liveArmed,
      liveSubmission: posture.liveSubmission || "DISARMED"
    } : { available: false, status: posture.status },
    rpcStatus,
    capsSummary: capsLoad.status === "present"
      ? capsModule.summarizeCapsLoad(capsLoad)
      : { fileStatus: capsLoad.status, conservativeOk: false, approvedOk: false },
    executorIntegration,
    executorSendPathNote: executorSendPath,
    checks,
    blockers: failed.map((check) => check.id),
    outputFile: OUTPUT_FILE
  };
}

function writeStatus(status, outputDir = OUTPUT_DIR) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const outputFile = path.join(outputDir, path.basename(OUTPUT_FILE));
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runReadiness(options = {}) {
  const status = buildStatus(options);
  const outputFile = writeStatus(status, options.outputDir || OUTPUT_DIR);
  return { ...status, outputFile };
}

function printSummary(status) {
  console.log("[r43c-local-signer-readiness] R43C Local Signer Readiness (read-only)");
  console.log(`  verdict: ${status.r43cVerdict}`);
  console.log(`  review: ${status.r43cReviewVerdict}`);
  console.log(`  posture: ${status.postureSummary?.executionMode || "unknown"} / dryRun=${status.postureSummary?.dryRunMode} / liveArmed=${status.postureSummary?.liveArmed}`);
  console.log(`  rpcStatus: ${status.rpcStatus}`);
  console.log(`  live trading approved: ${status.liveTradingApproved}`);
  console.log(`  output: ${status.outputFile}`);
}

if (require.main === module) {
  const status = runReadiness();
  printSummary(status);
}

module.exports = {
  ROOT,
  OUTPUT_DIR,
  OUTPUT_FILE,
  GATE_DOC,
  VERDICTS,
  FORBIDDEN_VERDICTS,
  R43C_REVIEW_VERDICT,
  buildStatus,
  writeStatus,
  runReadiness,
  printSummary,
  checkLocalSignerModule,
  checkProviderBlocksRealWithoutGuards,
  scanAnalysisForSecrets
};
