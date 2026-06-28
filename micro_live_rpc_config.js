"use strict";

// micro_live_rpc_config.js — R41D dedicated RPC operator setup loader.
// Reads local-only env/file config. Never prints full RPC URLs. No network calls.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");

const ROOT = review.ROOT;
const OUTPUT_DIR = process.env.R41D_OUTPUT_DIR
  ? path.resolve(process.env.R41D_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r41d_rpc_operator_setup.json");
const GATE_DOC = "docs/R41D_DEDICATED_RPC_OPERATOR_SETUP.md";

const ENV_VAR = "TRACKTA_MICRO_LIVE_RPC_URL";
const LOCAL_CONFIG_REL = "operator_records/local_rpc_config.json";
const EXAMPLE_CONFIG_REL = "examples/local_rpc_config.example.json";

const SCHEMA_VERSION = 1;
const R41D_VERDICT = "R41D RPC OPERATOR SETUP — LOCAL CONFIG ONLY — NOT LIVE APPROVAL";

const RPC_STATUS = Object.freeze({
  MISSING: "MISSING",
  PLACEHOLDER: "PLACEHOLDER",
  PUBLIC_FALLBACK: "PUBLIC_FALLBACK",
  DEDICATED_CANDIDATE: "DEDICATED_CANDIDATE"
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
  /your_dedicated_rpc_provider/i,
  /insert[_-]?key/i,
  /example\.com/i,
  /\/REDACTED\b/i,
  /REDACTED/i,
  /TODO/i,
  /TBD/i,
  /xxx+/i,
  /^https?:\/\/\s*$/
]);

function redactRpcUrl(endpoint) {
  if (!endpoint || typeof endpoint !== "string") return "";
  try {
    const url = new URL(endpoint.trim());
    for (const key of [...url.searchParams.keys()]) {
      if (/key|token|secret|auth|signature|apikey/i.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    if (url.username || url.password) {
      url.username = url.username ? "[REDACTED]" : "";
      url.password = url.password ? "[REDACTED]" : "";
    }
    const segments = url.pathname.split("/").map((segment) => {
      if (/^[a-zA-Z0-9_-]{20,}$/.test(segment)) {
        return "[REDACTED]";
      }
      return segment;
    });
    url.pathname = segments.join("/") || "/";
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

function classifyRpcUrl(url, options = {}) {
  if (!url || typeof url !== "string" || !url.trim()) {
    return {
      status: RPC_STATUS.MISSING,
      redactedUrl: "",
      issues: ["empty"]
    };
  }

  const trimmed = url.trim();
  const issues = [];

  if (isPlaceholderRpc(trimmed)) issues.push("placeholder");
  if (isLocalhostRpc(trimmed) && options.testOnlyRpc !== true) issues.push("localhost_without_test_mark");
  if (isPublicSolanaRpcEndpoint(trimmed)) issues.push("public_fallback");

  let status = RPC_STATUS.DEDICATED_CANDIDATE;
  if (issues.includes("public_fallback")) {
    status = RPC_STATUS.PUBLIC_FALLBACK;
  } else if (issues.includes("placeholder") || issues.includes("localhost_without_test_mark")) {
    status = RPC_STATUS.PLACEHOLDER;
  }

  return {
    status,
    redactedUrl: redactRpcUrl(trimmed),
    issues,
    dedicatedCandidate: status === RPC_STATUS.DEDICATED_CANDIDATE
  };
}

function readLocalRpcConfigFile(repoRoot, options = {}) {
  const configPath = options.localConfigPath || path.join(repoRoot || ROOT, LOCAL_CONFIG_REL);
  if (!fs.existsSync(configPath)) {
    return { present: false, status: "missing", configPath, rpcUrl: null, data: null };
  }

  try {
    const data = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const rpcUrl = typeof data?.rpcUrl === "string" ? data.rpcUrl : null;
    return {
      present: true,
      status: "present",
      configPath,
      rpcUrl,
      data
    };
  } catch (err) {
    return {
      present: true,
      status: "corrupt",
      configPath,
      rpcUrl: null,
      data: null,
      error: err && err.message ? err.message : String(err)
    };
  }
}

function resolveMicroLiveRpcUrl(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const env = options.env !== undefined ? options.env : process.env;
  const envValue = env && env[ENV_VAR] ? String(env[ENV_VAR]).trim() : "";

  if (envValue) {
    return {
      source: ENV_VAR,
      sourceType: "env",
      rpcUrl: envValue,
      envVarPresent: true,
      configFilePresent: false,
      configFileStatus: "not_used_env_precedence"
    };
  }

  const file = options.localConfigRead !== undefined
    ? options.localConfigRead
    : readLocalRpcConfigFile(repoRoot, options);

  if (file.status === "present" && file.rpcUrl) {
    return {
      source: LOCAL_CONFIG_REL,
      sourceType: "file",
      rpcUrl: file.rpcUrl,
      envVarPresent: false,
      configFilePresent: true,
      configFileStatus: "present"
    };
  }

  return {
    source: null,
    sourceType: "none",
    rpcUrl: null,
    envVarPresent: false,
    configFilePresent: file.present === true,
    configFileStatus: file.status
  };
}

function loadMicroLiveRpcConfig(options = {}) {
  const resolved = resolveMicroLiveRpcUrl(options);
  const classified = resolved.rpcUrl
    ? classifyRpcUrl(resolved.rpcUrl, options)
    : { status: RPC_STATUS.MISSING, redactedUrl: "", issues: ["missing"], dedicatedCandidate: false };

  const status = resolved.rpcUrl ? classified.status : RPC_STATUS.MISSING;

  return {
    timestamp: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    r41dVerdict: R41D_VERDICT,
    approved: false,
    liveTradingApproved: false,
    status,
    source: resolved.source,
    sourceType: resolved.sourceType,
    envVar: ENV_VAR,
    envVarPresent: resolved.envVarPresent === true,
    configFile: LOCAL_CONFIG_REL,
    configFilePresent: resolved.configFilePresent === true,
    configFileStatus: resolved.configFileStatus,
    redactedUrl: classified.redactedUrl || "",
    dedicatedCandidate: status === RPC_STATUS.DEDICATED_CANDIDATE,
    issues: classified.issues || [],
    endpointReachability: "not_checked_read_only",
    safeMetadata: {
      status,
      source: resolved.source,
      redactedUrl: classified.redactedUrl || "",
      envVarPresent: resolved.envVarPresent === true,
      configFilePresent: resolved.configFilePresent === true,
      dedicatedCandidate: status === RPC_STATUS.DEDICATED_CANDIDATE,
      endpointReachability: "not_checked_read_only"
    }
  };
}

function collectRpcCandidatesFromConfig(options = {}) {
  const resolved = resolveMicroLiveRpcUrl(options);
  if (!resolved.rpcUrl) return [];
  return [{ source: resolved.source || "unknown", url: resolved.rpcUrl }];
}

function evaluateRpcCandidate(url, options = {}) {
  const classified = classifyRpcUrl(url, options);
  return {
    ok: classified.status === RPC_STATUS.DEDICATED_CANDIDATE,
    issues: classified.issues,
    redacted: classified.redactedUrl,
    status: classified.status
  };
}

function checkDedicatedRpcFromConfig(options = {}) {
  if (options.rpcCandidates !== undefined) {
    const evaluated = options.rpcCandidates.map((candidate) => ({
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
        issues: candidate.issues,
        status: candidate.status
      })),
      publicFallbackDetected: evaluated.some((candidate) => candidate.status === RPC_STATUS.PUBLIC_FALLBACK),
      endpointReachability: "not_checked_read_only",
      r41dConfig: null,
      note: dedicated
        ? "dedicated RPC candidate configured via override"
        : evaluated.map((candidate) => `${candidate.source}: ${candidate.issues.join(", ")}`).join("; ")
    };
  }

  const config = loadMicroLiveRpcConfig(options);
  const ok = config.status === RPC_STATUS.DEDICATED_CANDIDATE;

  return {
    ok,
    status: ok ? "dedicated_configured" : config.status.toLowerCase(),
    selectedSource: config.source,
    redactedEndpoint: config.redactedUrl || null,
    candidates: config.source ? [{
      source: config.source,
      redacted: config.redactedUrl,
      ok,
      issues: config.issues,
      status: config.status
    }] : [],
    publicFallbackDetected: config.status === RPC_STATUS.PUBLIC_FALLBACK,
    endpointReachability: "not_checked_read_only",
    r41dConfig: config.safeMetadata,
    note: ok
      ? `dedicated RPC configured via ${config.source}`
      : config.status === RPC_STATUS.MISSING
        ? `no RPC configured — set ${ENV_VAR} or ${LOCAL_CONFIG_REL}`
        : `${config.status}: ${(config.issues || []).join(", ")}`
  };
}

function assertAnalysisWritePath(outputFile, analysisDir) {
  const resolvedOutput = path.resolve(outputFile);
  const resolvedAnalysis = path.resolve(analysisDir);
  const prefix = resolvedAnalysis.endsWith(path.sep)
    ? resolvedAnalysis
    : `${resolvedAnalysis}${path.sep}`;
  if (!resolvedOutput.startsWith(prefix)) {
    throw new Error("R41D RPC setup output must stay under analysis/");
  }
}

function writeOperatorSetup(status, outputFile = OUTPUT_FILE, analysisDir = OUTPUT_DIR) {
  assertAnalysisWritePath(outputFile, analysisDir);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[r41d-rpc-setup] Dedicated RPC Operator Setup (read-only)");
  console.log(`  status: ${status.status}`);
  console.log(`  r41d verdict: ${status.r41dVerdict}`);
  console.log(`  source: ${status.source || "none"}`);
  console.log(`  dedicated candidate: ${status.dedicatedCandidate ? "yes" : "no"}`);
  console.log(`  approved: false`);
}

function runRpcOperatorSetup(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const outputFile = options.outputFile || path.join(analysisDir, "r41d_rpc_operator_setup.json");
  const status = {
    review: "R41D-rpc-operator-setup",
    gateDoc: GATE_DOC,
    exampleConfig: EXAMPLE_CONFIG_REL,
    ...loadMicroLiveRpcConfig(options)
  };

  if (options.writeOutput !== false) {
    writeOperatorSetup(status, outputFile, analysisDir);
  }

  if (options.print !== false) {
    printSummary(status);
  }

  return { status, outputFile: options.writeOutput !== false ? outputFile : null };
}

if (require.main === module) {
  try {
    const result = runRpcOperatorSetup();
    if (result.outputFile) console.log(`  output: ${result.outputFile}`);
  } catch (err) {
    console.error("[r41d-rpc-setup] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOC,
  OUTPUT_FILE,
  ENV_VAR,
  LOCAL_CONFIG_REL,
  EXAMPLE_CONFIG_REL,
  SCHEMA_VERSION,
  R41D_VERDICT,
  RPC_STATUS,
  PUBLIC_SOLANA_RPC_HOSTNAMES,
  PLACEHOLDER_RPC_PATTERNS,
  redactRpcUrl,
  isPublicSolanaRpcEndpoint,
  isPlaceholderRpc,
  isLocalhostRpc,
  classifyRpcUrl,
  readLocalRpcConfigFile,
  resolveMicroLiveRpcUrl,
  loadMicroLiveRpcConfig,
  collectRpcCandidatesFromConfig,
  evaluateRpcCandidate,
  checkDedicatedRpcFromConfig,
  runRpcOperatorSetup
};
