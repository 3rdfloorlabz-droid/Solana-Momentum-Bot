"use strict";

// micro_live_rpc_preflight.js — R41C read-only dedicated RPC + local signer readiness.
// Writes analysis/ only. Does NOT enable live trading, read secrets, or submit transactions.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const capsModule = require("./micro_live_caps");
const secretScan = require("./secret_safety_scan");
const preflight = require("./signer_plan_preflight");
const r42 = require("./r42_final_micro_live_review");
const localSigner = require("./local_signer");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R41C_OUTPUT_DIR
  ? path.resolve(process.env.R41C_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r41c_rpc_signer_readiness.json");
const GATE_DOC = "docs/R41C_DEDICATED_RPC_AND_SIGNER_READINESS.md";

const SCHEMA_VERSION = 1;
const R41C_VERDICT = "R41C READINESS CHECK ONLY — NOT APPROVED FOR LIVE TRADING";

const FORBIDDEN_VERDICTS = Object.freeze([
  "READY FOR LIVE TRADING",
  "LIVE APPROVED",
  "MICRO_LIVE_APPROVED",
  "READY FOR ONE-TRANSACTION PROOF"
]);

const READINESS_VERDICTS = Object.freeze({
  NOT_READY: "NOT_READY",
  PARTIAL_READINESS: "PARTIAL_READINESS",
  READY_FOR_R43_REVIEW: "READY_FOR_R43_REVIEW"
});

const PUBLIC_SOLANA_RPC_HOSTNAMES = Object.freeze(new Set([
  "api.mainnet-beta.solana.com",
  "api.devnet.solana.com",
  "api.testnet.solana.com",
  "solana.com",
  "www.solana.com"
]));

const PLACEHOLDER_RPC_PATTERNS = Object.freeze([
  /placeholder/i,
  /change[_-]?me/i,
  /your-api-key/i,
  /insert[_-]?key/i,
  /example\.com/i,
  /TODO/i,
  /TBD/i,
  /xxx+/i,
  /^https?:\/\/\s*$/
]);

const REQUIRED_SIGNER_FILES = Object.freeze([
  "local_signer.js",
  "signer_provider.js",
  "mock_signer.js",
  "secret_safety_scan.js",
  "signer_plan_preflight.js"
]);

const COMMITTED_RPC_SCAN_FILES = Object.freeze([
  "live_config.json"
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
    emergencyStop: data.emergencyStop === true
  };
}

function isSafeReadinessPosture(posture) {
  return (
    posture.available === true &&
    posture.executionMode === "PIPELINE_DRY_RUN" &&
    posture.dryRunMode === true &&
    posture.liveArmed === false &&
    posture.emergencyStop !== true
  );
}

function redactRpcUrl(endpoint) {
  if (!endpoint || typeof endpoint !== "string") return "";
  try {
    const url = new URL(endpoint.trim());
    for (const key of [...url.searchParams.keys()]) {
      if (/key|token|secret|auth|signature|apikey/i.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    const userinfo = url.username || url.password;
    if (userinfo) {
      url.username = url.username ? "[REDACTED]" : "";
      url.password = url.password ? "[REDACTED]" : "";
    }
    return url.toString();
  } catch {
    return "[MALFORMED_ENDPOINT_REDACTED]";
  }
}

function isPublicSolanaRpcEndpoint(endpoint) {
  if (typeof endpoint !== "string" || !endpoint.trim()) return false;
  try {
    const hostname = new URL(endpoint.trim()).hostname.toLowerCase();
    if (PUBLIC_SOLANA_RPC_HOSTNAMES.has(hostname)) return true;
    if (hostname.endsWith(".solana.com") && hostname.startsWith("api.")) return true;
    return false;
  } catch {
    return false;
  }
}

function isPlaceholderRpc(endpoint) {
  if (typeof endpoint !== "string" || !endpoint.trim()) return true;
  const trimmed = endpoint.trim();
  if (trimmed.length < 12) return true;
  return PLACEHOLDER_RPC_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function isLocalhostRpc(endpoint) {
  if (typeof endpoint !== "string" || !endpoint.trim()) return false;
  try {
    const hostname = new URL(endpoint.trim()).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function collectRpcCandidates(options = {}) {
  const env = options.env !== undefined ? options.env : process.env;
  const candidates = [];

  const envKeys = ["HELIUS_RPC_URL", "SOLANA_RPC_URL", "RPC_URL"];
  for (const key of envKeys) {
    if (env && env[key]) {
      candidates.push({ source: key, url: String(env[key]) });
    }
  }

  if (env && env.HELIUS_API_KEY) {
    candidates.push({
      source: "HELIUS_API_KEY_DERIVED",
      url: `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(String(env.HELIUS_API_KEY))}`
    });
  }

  const configRpc = options.configRpc !== undefined
    ? options.configRpc
    : (() => {
      const cfg = review.readJsonFile(path.join(options.runtimeRoot || RUNTIME_ROOT, "live_config.json"));
      return cfg.status === "usable" && typeof cfg.data?.rpcEndpoint === "string"
        ? cfg.data.rpcEndpoint
        : null;
    })();

  if (configRpc) {
    candidates.push({ source: "live_config.rpcEndpoint", url: configRpc });
  }

  return candidates;
}

function evaluateRpcCandidate(url, options = {}) {
  const issues = [];
  if (!url || typeof url !== "string" || !url.trim()) {
    return { ok: false, issues: ["empty"], redacted: "" };
  }

  const trimmed = url.trim();
  if (isPlaceholderRpc(trimmed)) issues.push("placeholder");
  if (isLocalhostRpc(trimmed) && options.testOnlyRpc !== true) issues.push("localhost_without_test_mark");
  if (isPublicSolanaRpcEndpoint(trimmed)) issues.push("public_fallback");

  return {
    ok: issues.length === 0,
    issues,
    redacted: redactRpcUrl(trimmed)
  };
}

function checkDedicatedRpc(options = {}) {
  const candidates = options.rpcCandidates !== undefined
    ? options.rpcCandidates
    : collectRpcCandidates(options);

  if (candidates.length === 0) {
    return {
      ok: false,
      status: "missing",
      selectedSource: null,
      redactedEndpoint: null,
      candidates: [],
      publicFallbackDetected: false,
      endpointReachability: "not_checked_read_only",
      note: "no RPC URL configured in env or live_config.json"
    };
  }

  const evaluated = candidates.map((candidate) => ({
    source: candidate.source,
    ...evaluateRpcCandidate(candidate.url, options)
  }));

  const dedicated = evaluated.find((candidate) => candidate.ok === true);

  return {
    ok: dedicated !== undefined,
    status: dedicated ? "dedicated_configured" : "not_ready",
    selectedSource: dedicated ? dedicated.source : null,
    redactedEndpoint: dedicated
      ? dedicated.redacted
      : (evaluated[0] ? evaluated[0].redacted : null),
    candidates: evaluated.map((candidate) => ({
      source: candidate.source,
      redacted: candidate.redacted,
      ok: candidate.ok,
      issues: candidate.issues
    })),
    publicFallbackDetected: evaluated.some((candidate) => candidate.issues.includes("public_fallback")),
    endpointReachability: "not_checked_read_only",
    note: dedicated
      ? "dedicated RPC candidate configured (reachability not probed in R41C)"
      : evaluated.map((candidate) => `${candidate.source}: ${candidate.issues.join(", ")}`).join("; ")
  };
}

function checkWalletStatus(runtimeRoot, options = {}) {
  if (options.walletStatusCheck !== undefined) {
    return options.walletStatusCheck;
  }

  const wallet = review.readJsonFile(path.join(runtimeRoot, "wallet_status.json"));
  return {
    ok: wallet.status === "usable",
    status: wallet.status,
    note: wallet.status === "usable"
      ? "wallet_status.json present"
      : "wallet_status.json missing or unreadable"
  };
}

function checkRequiredSignerFiles(repoRoot, options = {}) {
  const files = options.requiredSignerFiles || REQUIRED_SIGNER_FILES;
  const missing = [];
  const present = [];

  for (const rel of files) {
    const full = path.join(repoRoot, rel);
    if (fs.existsSync(full)) present.push(rel);
    else missing.push(rel);
  }

  return { ok: missing.length === 0, missing, present };
}

function checkLocalSignerStubOnly(repoRoot, options = {}) {
  if (options.localSignerStubCheck !== undefined) {
    return options.localSignerStubCheck;
  }

  const filePath = path.join(repoRoot, "local_signer.js");
  if (!fs.existsSync(filePath)) {
    return { ok: false, stubOnly: false, note: "local_signer.js missing" };
  }

  const src = fs.readFileSync(filePath, "utf8");
  const stubOnly = src.includes("LOCAL_SIGNER_STUB_PUBLIC_KEY")
    && src.includes("LOCAL_SIGN_NOT_IMPLEMENTED")
    && /REAL SIGNING NOT IMPLEMENTED/i.test(src);

  return {
    ok: stubOnly,
    stubOnly,
    publicKey: localSigner.LOCAL_SIGNER_STUB_PUBLIC_KEY,
    note: stubOnly ? "local signer remains stub-only" : "local signer may contain real signing paths"
  };
}

function checkRealSignerProviderBlocked(repoRoot, options = {}) {
  if (options.realSignerProviderCheck !== undefined) {
    return options.realSignerProviderCheck;
  }

  const filePath = path.join(repoRoot, "signer_provider.js");
  if (!fs.existsSync(filePath)) {
    return { ok: false, note: "signer_provider.js missing" };
  }

  const src = fs.readFileSync(filePath, "utf8");
  const blocked = src.includes("PROVIDER_BLOCKED")
    && src.includes("local_real")
    && /require\s*\(\s*['"]\.\/local_signer['"]/.test(src);

  return {
    ok: blocked,
    note: blocked ? "real signer provider blocked" : "real signer provider block missing"
  };
}

function checkCommittedRpcSecrets(repoRoot, options = {}) {
  if (options.committedRpcSecretCheck !== undefined) {
    return options.committedRpcSecretCheck;
  }

  const findings = [];
  for (const rel of COMMITTED_RPC_SCAN_FILES) {
    const full = path.join(repoRoot, rel);
    if (!fs.existsSync(full)) continue;
    const content = fs.readFileSync(full, "utf8");
    if (/helius-rpc\.com\/?\?api-key=[^"'\s&\]]+/i.test(content)) {
      findings.push({ file: rel, issue: "rpc_api_key_in_committed_config" });
    }
    if (/"rpcEndpoint"\s*:\s*"https?:\/\/[^"]*(?:api[_-]?key|token|secret)=[^"]+"/i.test(content)) {
      findings.push({ file: rel, issue: "rpc_endpoint_with_secret_in_committed_config" });
    }
  }

  return {
    ok: findings.length === 0,
    findings
  };
}

function checkOperatorCapsDraft(repoRoot, options = {}) {
  const capsFile = options.capsFile || path.join(repoRoot, "operator_records", "micro_live_demo_caps.json");
  const load = options.capsLoad !== undefined
    ? options.capsLoad
    : capsModule.loadCapsFile(capsFile);

  if (load.status === "missing") {
    return {
      ok: false,
      status: "missing",
      approved: false,
      conservativeOk: false,
      prematureApproval: false,
      note: "operator caps file missing"
    };
  }

  if (load.status === "corrupt") {
    return {
      ok: false,
      status: "corrupt",
      approved: false,
      conservativeOk: false,
      prematureApproval: false,
      note: "operator caps file corrupt"
    };
  }

  if (load.data?.approved === true) {
    return {
      ok: false,
      status: "present",
      approved: true,
      conservativeOk: capsModule.validateConservativeCaps(load.data).ok,
      prematureApproval: true,
      note: "operator caps approved true before R43 — blocked"
    };
  }

  const conservative = capsModule.validateConservativeCaps(load.data);
  return {
    ok: conservative.ok && load.data.approved === false,
    status: "present",
    approved: false,
    conservativeOk: conservative.ok,
    prematureApproval: false,
    errors: conservative.errors,
    note: conservative.ok
      ? "operator caps draft present with conservative limits; not approved"
      : conservative.errors.join("; ")
  };
}

function deriveReadinessVerdict(context) {
  if (!context.postureSafe || context.recoveryPresent) {
    return {
      readinessVerdict: READINESS_VERDICTS.NOT_READY,
      reason: context.recoveryPresent
        ? "recovery_actions.jsonl present"
        : "unsafe runtime posture"
    };
  }

  if (context.operatorCaps.prematureApproval) {
    return {
      readinessVerdict: READINESS_VERDICTS.NOT_READY,
      reason: "operator caps approved before R43"
    };
  }

  if (!context.requiredSignerFiles.ok
      || !context.localSignerStub.ok
      || !context.realSignerProvider.ok
      || !context.executorIntegration.ok
      || context.nonTestSecretFindings.length > 0
      || !context.committedRpcSecrets.ok) {
    return {
      readinessVerdict: READINESS_VERDICTS.NOT_READY,
      reason: "signer or secret readiness checks failed"
    };
  }

  if (!context.operatorCaps.ok) {
    return {
      readinessVerdict: READINESS_VERDICTS.NOT_READY,
      reason: context.operatorCaps.note || "operator caps draft invalid"
    };
  }

  if (!context.dedicatedRpc.ok) {
    return {
      readinessVerdict: READINESS_VERDICTS.PARTIAL_READINESS,
      reason: "signer and caps draft ready; dedicated RPC not configured"
    };
  }

  if (!context.walletStatus.ok) {
    return {
      readinessVerdict: READINESS_VERDICTS.PARTIAL_READINESS,
      reason: "signer and RPC ready; wallet_status.json missing"
    };
  }

  return {
    readinessVerdict: READINESS_VERDICTS.READY_FOR_R43_REVIEW,
    reason: "infrastructure readiness checks pass; R43 human approval still required"
  };
}

function collectR41cRpcSignerReadiness(options = {}) {
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
  const postureSafe = isSafeReadinessPosture(posture);

  const dedicatedRpc = options.dedicatedRpcCheck !== undefined
    ? options.dedicatedRpcCheck
    : checkDedicatedRpc({ ...options, runtimeRoot });

  const walletStatus = checkWalletStatus(runtimeRoot, options);
  const requiredSignerFiles = options.requiredSignerFilesCheck !== undefined
    ? options.requiredSignerFilesCheck
    : checkRequiredSignerFiles(repoRoot, options);
  const localSignerStub = checkLocalSignerStubOnly(repoRoot, options);
  const realSignerProvider = checkRealSignerProviderBlocked(repoRoot, options);
  const executorIntegration = options.executorIntegrationCheck !== undefined
    ? options.executorIntegrationCheck
    : r42.checkExecutorIntegration(repoRoot);
  const committedRpcSecrets = checkCommittedRpcSecrets(repoRoot, options);
  const operatorCaps = checkOperatorCapsDraft(repoRoot, options);

  let nonTestSecretFindings;
  if (options.secretScanFindings !== undefined) {
    nonTestSecretFindings = options.secretScanFindings;
  } else if (options.runSecretScan === false) {
    nonTestSecretFindings = [];
  } else {
    const scanResult = secretScan.scanRepo(repoRoot, options.scanOptions);
    nonTestSecretFindings = preflight.filterNonTestSecretFindings(scanResult.findings);
  }

  const checks = [];
  const addCheck = (id, ok, detail) => {
    checks.push({ id, ok: ok === true, detail });
  };

  addCheck("gate_doc_present", gateDocPresent, GATE_DOC);
  addCheck("recovery_absent", !recoveryPresent, "recovery_actions.jsonl must be absent");
  addCheck("posture_safe", postureSafe, "PIPELINE_DRY_RUN / dryRunMode true / liveArmed false");
  addCheck("dedicated_rpc_configured", dedicatedRpc.ok, dedicatedRpc.note);
  addCheck("wallet_status_present", walletStatus.ok, walletStatus.note || walletStatus.status);
  addCheck("required_signer_files_present", requiredSignerFiles.ok, requiredSignerFiles.missing?.join(", ") || "all present");
  addCheck("local_signer_stub_only", localSignerStub.ok, localSignerStub.note);
  addCheck("real_signer_provider_blocked", realSignerProvider.ok, realSignerProvider.note);
  addCheck("executor_signer_not_integrated", executorIntegration.ok, executorIntegration.note);
  addCheck("committed_rpc_secrets_absent", committedRpcSecrets.ok, `${committedRpcSecrets.findings?.length || 0} finding(s)`);
  addCheck("operator_caps_draft_valid", operatorCaps.ok, operatorCaps.note);
  addCheck("operator_caps_not_approved", operatorCaps.approved !== true, "approved must remain false before R43");
  addCheck("no_non_test_secret_patterns", nonTestSecretFindings.length === 0, `${nonTestSecretFindings.length} non-test finding(s)`);
  addCheck("live_trading_not_approved", true, "live trading remains NOT APPROVED");
  addCheck("real_signing_not_implemented", localSignerStub.stubOnly === true, localSigner.R41B_VERDICT);

  const failed = checks.filter((check) => !check.ok);
  const derived = deriveReadinessVerdict({
    postureSafe,
    recoveryPresent,
    dedicatedRpc,
    walletStatus,
    requiredSignerFiles,
    localSignerStub,
    realSignerProvider,
    executorIntegration,
    committedRpcSecrets,
    operatorCaps,
    nonTestSecretFindings
  });

  return {
    timestamp: new Date().toISOString(),
    review: "R41C-rpc-signer-readiness",
    schemaVersion: SCHEMA_VERSION,
    gateDocPresent,
    approved: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    privateKeysHandled: false,
    r41cVerdict: R41C_VERDICT,
    readinessVerdict: derived.readinessVerdict,
    forbiddenVerdicts: FORBIDDEN_VERDICTS,
    evaluation: {
      readinessVerdict: derived.readinessVerdict,
      r41cVerdict: R41C_VERDICT,
      reason: derived.reason,
      approved: false,
      liveTradingApproved: false
    },
    postureSummary: posture.available ? {
      executionMode: posture.executionMode,
      dryRunMode: posture.dryRunMode,
      liveArmed: posture.liveArmed,
      emergencyStop: posture.emergencyStop,
      safeForReadinessPhase: postureSafe
    } : { available: false, status: posture.status },
    dedicatedRpc: {
      ok: dedicatedRpc.ok,
      status: dedicatedRpc.status,
      selectedSource: dedicatedRpc.selectedSource,
      redactedEndpoint: dedicatedRpc.redactedEndpoint,
      publicFallbackDetected: dedicatedRpc.publicFallbackDetected,
      endpointReachability: dedicatedRpc.endpointReachability,
      candidates: dedicatedRpc.candidates
    },
    walletStatus: {
      ok: walletStatus.ok,
      status: walletStatus.status,
      note: walletStatus.note
    },
    signerReadiness: {
      requiredFiles: requiredSignerFiles.present,
      missingRequiredFiles: requiredSignerFiles.missing || [],
      localSignerStubOnly: localSignerStub.stubOnly === true,
      stubPublicKey: localSigner.LOCAL_SIGNER_STUB_PUBLIC_KEY,
      realSignerProviderBlocked: realSignerProvider.ok === true,
      executorSignerIntegrated: executorIntegration.integrated === true,
      r41bVerdict: localSigner.R41B_VERDICT
    },
    operatorCaps: {
      status: operatorCaps.status,
      approved: operatorCaps.approved === true,
      conservativeOk: operatorCaps.conservativeOk === true,
      prematureApproval: operatorCaps.prematureApproval === true,
      note: operatorCaps.note
    },
    committedRpcSecrets: {
      ok: committedRpcSecrets.ok,
      findings: committedRpcSecrets.findings || []
    },
    secretScanSummary: {
      nonTestFindingCount: nonTestSecretFindings.length,
      findings: nonTestSecretFindings.map((finding) => ({
        file: finding.file,
        patternId: finding.patternId,
        line: finding.line,
        redactedSnippet: finding.redactedSnippet
      }))
    },
    checks,
    failedChecks: failed.map((check) => check.id),
    blockers: [
      ...(operatorCaps.approved !== true ? ["operator caps not approved (R43 required)"] : []),
      ...(!dedicatedRpc.ok ? ["dedicated RPC not configured"] : []),
      ...(!walletStatus.ok ? ["wallet_status.json missing or stale"] : []),
      ...(!localSignerStub.ok ? ["local signer stub not ready"] : []),
      ...(executorIntegration.integrated ? ["live_executor signer integration present"] : []),
      "real signing not implemented",
      "live trading not approved",
      "micro-live not approved",
      "R7 edge not proven",
      "R43 final human approval required before one-transaction proof"
    ],
    recommendedNextSteps: [
      "Provision dedicated RPC outside public fallback",
      "Keep operator caps approved:false until R43",
      "Complete R43 final approval review",
      "Do not integrate signer into live_executor until R43",
      "Do not add private keys until explicit R43 approval"
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
    throw new Error("R41C readiness output must stay under analysis/");
  }
}

function writeReadiness(status, outputFile = OUTPUT_FILE, analysisDir = OUTPUT_DIR) {
  assertAnalysisWritePath(outputFile, analysisDir);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[r41c-readiness] Dedicated RPC + Local Signer Readiness (read-only)");
  console.log(`  readiness: ${status.readinessVerdict}`);
  console.log(`  r41c verdict: ${status.r41cVerdict}`);
  console.log(`  dedicated rpc: ${status.dedicatedRpc.ok ? "configured" : "missing/blocked"}`);
  console.log(`  signer stub: ${status.signerReadiness.localSignerStubOnly ? "stub-only" : "not ready"}`);
  console.log(`  caps approved: false`);
  console.log(`  failed checks: ${status.failedChecks.length}`);
}

function runR41cRpcSignerReadiness(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const outputFile = options.outputFile || path.join(analysisDir, "r41c_rpc_signer_readiness.json");
  const status = collectR41cRpcSignerReadiness({
    ...options,
    analysisDir
  });

  if (options.writeOutput !== false) {
    writeReadiness(status, outputFile, analysisDir);
  }

  if (options.print !== false) {
    printSummary(status);
  }

  return { status, outputFile: options.writeOutput !== false ? outputFile : null };
}

if (require.main === module) {
  try {
    const result = runR41cRpcSignerReadiness();
    if (result.outputFile) console.log(`  output: ${result.outputFile}`);
  } catch (err) {
    console.error("[r41c-readiness] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOC,
  OUTPUT_FILE,
  SCHEMA_VERSION,
  R41C_VERDICT,
  FORBIDDEN_VERDICTS,
  READINESS_VERDICTS,
  PUBLIC_SOLANA_RPC_HOSTNAMES,
  REQUIRED_SIGNER_FILES,
  readPosture,
  isSafeReadinessPosture,
  redactRpcUrl,
  isPublicSolanaRpcEndpoint,
  isPlaceholderRpc,
  isLocalhostRpc,
  collectRpcCandidates,
  evaluateRpcCandidate,
  checkDedicatedRpc,
  checkWalletStatus,
  checkRequiredSignerFiles,
  checkLocalSignerStubOnly,
  checkRealSignerProviderBlocked,
  checkCommittedRpcSecrets,
  checkOperatorCapsDraft,
  deriveReadinessVerdict,
  collectR41cRpcSignerReadiness,
  runR41cRpcSignerReadiness
};
