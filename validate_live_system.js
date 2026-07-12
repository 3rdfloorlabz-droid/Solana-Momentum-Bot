// validate_live_system.js
// Read-only validator for the Phase 1 live system. Submits nothing, changes
// nothing. Exits non-zero if any safety-critical check fails.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, "live_config.json");
const POSITIONS_FILE = path.join(ROOT, "live_positions.json");
const LIVE_TRADES_FILE = path.join(ROOT, "live_trades.jsonl");
const CONTROL_FILE = path.join(ROOT, "live_control_events.jsonl");
const ERRORS_FILE = path.join(ROOT, "live_errors.jsonl");
const DASHBOARD_FILE = path.join(ROOT, "dashboard_server.js");
const EXECUTOR_FILE = path.join(ROOT, "live_executor.js");
const PAPER_FILE = path.join(ROOT, "paper_trades.json");
const ENV_EXAMPLE_FILE = path.join(ROOT, ".env.example");
const ENV_FILE = path.join(ROOT, ".env");
const paperHashAtStart = fs.existsSync(PAPER_FILE)
  ? crypto.createHash("sha256").update(fs.readFileSync(PAPER_FILE)).digest("hex")
  : null;

const G = "\x1b[32m✔\x1b[0m", R = "\x1b[31m✘\x1b[0m", Y = "\x1b[33m⚠\x1b[0m", D = "\x1b[2m", X = "\x1b[0m", B = "\x1b[1m";

let failures = 0, warnings = 0;
function ok(label, detail = "")  { console.log(`  ${G} ${label}${detail ? `  ${D}${detail}${X}` : ""}`); }
function bad(label, detail = "") { console.log(`  ${R} ${label}${detail ? `  ${D}${detail}${X}` : ""}`); failures++; }
function warn(label, detail = ""){ console.log(`  ${Y} ${label}${detail ? `  ${D}${detail}${X}` : ""}`); warnings++; }
function section(t) { console.log(`\n${B}── ${t} ${"─".repeat(Math.max(0, 50 - t.length))}${X}`); }
function readJsonl(f) {
  if (!fs.existsSync(f)) return { rows: [], errors: 0 };
  let errors = 0; const rows = [];
  fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).forEach(l => { try { rows.push(JSON.parse(l)); } catch { errors++; } });
  return { rows, errors };
}
function redactSensitive(value) {
  return String(value ?? "")
    .replace(/((?:[?&]|\b)(?:api[-_]?key|apikey|token)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\[(?:\s*\d{1,3}\s*,){15,}\s*\d{1,3}\s*\]/g, "[REDACTED_BYTE_ARRAY]")
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{44,}\b/g, "[REDACTED_BASE58]");
}
function parseEnvTemplate(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/);
    if (match) result[match[1]] = match[2].trim();
  }
  return result;
}
function projectTextFiles(dir) {
  const ignored = new Set(["node_modules", ".git", "outputs", "work"]);
  const allowedNames = new Set([".env.example"]);
  const allowedExts = new Set([".js", ".json", ".md", ".txt", ".ps1"]);
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) files.push(...projectTextFiles(path.join(dir, entry.name)));
      continue;
    }
    if (allowedNames.has(entry.name) || allowedExts.has(path.extname(entry.name).toLowerCase())) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

const SIGNER_ASSIGNMENT_RE = /^[ \t]*SOLANA_SIGNER_SECRET[ \t]*=[ \t]*[^ \t\r\n#]/m;

function normalizeRelativePath(relativePath) {
  return String(relativePath || "").replace(/\\/g, "/");
}

function isExcludedSecretScanPath(relativePath) {
  const norm = normalizeRelativePath(relativePath);
  if (norm.startsWith("docs/")) return true;
  if (norm.startsWith("Ori/")) return true;
  if (norm.startsWith("analysis/")) return true;
  if (norm.startsWith("Sessions/")) return true;
  if (/^test_/i.test(path.basename(norm))) return true;
  if (norm.includes("/test_")) return true;
  return false;
}

function isProductionJsScanCandidate(relativePath) {
  const norm = normalizeRelativePath(relativePath);
  if (!norm.endsWith(".js")) return false;
  return !isExcludedSecretScanPath(norm);
}

function scanProductionHardcodedSignerAssignments(rootDir) {
  const violations = [];
  for (const file of projectTextFiles(rootDir)) {
    const rel = normalizeRelativePath(path.relative(rootDir, file));
    if (!isProductionJsScanCandidate(rel)) continue;
    const text = fs.readFileSync(file, "utf8");
    if (SIGNER_ASSIGNMENT_RE.test(text)) violations.push(rel);
  }
  return violations;
}

function checkMaxSubmitRetriesPolicy(value) {
  return Number.isInteger(value) && value >= 0 && value <= 2;
}

function evaluateLiveSubmissionStructure(executorSource) {
  const submitSwapSrc = executorSource.match(/async function submitSwap[\s\S]*?\n}\n\n\/\/ ─── Pre-trade abort checks/)?.[0] || "";
  const pipelineSrc = executorSource.match(/async function executeQuotedSwapAttempt[\s\S]*?\n}\n\nasync function executeQuotedSwapWithRetries/)?.[0] || "";
  const completeSrc = executorSource.match(/async function completeLiveSwapFromPipeline[\s\S]*?\n}\n\nasync function submitSwap/)?.[0] || "";
  const preSubmitSrc = executorSource.match(/function assertLivePathPreSubmit[\s\S]*?\n}\n\nasync function fetchJsonRpc/)?.[0] || "";

  const armingBeforePipeline =
    submitSwapSrc.includes("assertLivePathPreSubmit") &&
    submitSwapSrc.includes("executeQuotedSwapAttempt") &&
    submitSwapSrc.indexOf("assertLivePathPreSubmit") < submitSwapSrc.indexOf("executeQuotedSwapAttempt");
  const armingGatePresent = preSubmitSrc.includes("assertLiveSubmissionArmed");
  const simulateBeforeSign =
    pipelineSrc.includes("simulateSwapTx(builtSwap, cfg)") &&
    completeSrc.includes("signer.sign(messageBytes)");
  const signCallIndex = completeSrc.indexOf("signer.sign(messageBytes)");
  const submitIndex = completeSrc.indexOf("submitRawTransaction(signedBytes, cfg");
  const confirmIndex = completeSrc.indexOf("awaitConfirmation(submission.txSig, cfg");
  const fillIndex = completeSrc.indexOf("parseFillFromTransaction(submission.txSig, cfg, kind, builtSwap");
  const signBeforeSubmit = signCallIndex !== -1 && submitIndex !== -1 && signCallIndex < submitIndex;
  const submitBeforeConfirm = submitIndex !== -1 && confirmIndex !== -1 && submitIndex < confirmIndex;
  const confirmBeforeFill = confirmIndex !== -1 && fillIndex !== -1 && confirmIndex < fillIndex;
  const dryRunBeforeSigner =
    submitSwapSrc.includes('if (mode === "DRY_RUN")') &&
    submitSwapSrc.includes("loadSignerFromEnvForRealExecution(cfg)") &&
    submitSwapSrc.indexOf('if (mode === "DRY_RUN")') < submitSwapSrc.indexOf("loadSignerFromEnvForRealExecution(cfg)");
  const requiredBodiesPresent = !!(submitSwapSrc && pipelineSrc && completeSrc && preSubmitSrc);

  return {
    pass: requiredBodiesPresent &&
      armingBeforePipeline &&
      armingGatePresent &&
      simulateBeforeSign &&
      signBeforeSubmit &&
      submitBeforeConfirm &&
      confirmBeforeFill &&
      dryRunBeforeSigner,
    checks: {
      requiredBodiesPresent,
      armingBeforePipeline,
      armingGatePresent,
      simulateBeforeSign,
      signBeforeSubmit,
      submitBeforeConfirm,
      confirmBeforeFill,
      dryRunBeforeSigner
    }
  };
}

function evaluateArmingGate(executorSource) {
  return executorSource.includes('process.env.FOMO_ENABLE_LIVE_SUBMISSION === "YES"') &&
    executorSource.includes('"FOMO_ENABLE_LIVE_SUBMISSION must equal YES"') &&
    executorSource.includes("positionSizeSol must be > 0 and <= 0.01 for first-live safety") &&
    executorSource.includes("function collectLiveSubmissionGateFailures") &&
    executorSource.includes("function assertLiveSubmissionArmed");
}

function runValidation() {
// 1. CONFIG SAFETY
section("CONFIG SAFETY");
let cfg = null;
if (!fs.existsSync(CONFIG_FILE)) { bad("live_config.json exists"); }
else {
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); ok("live_config.json valid JSON"); }
  catch (e) { bad("live_config.json valid JSON", e.message); }
}
if (cfg) {
  const validExecutionModes = ["DRY_RUN", "PIPELINE_DRY_RUN", "LIVE"];
  validExecutionModes.includes(cfg.executionMode) ? ok("executionMode valid", cfg.executionMode) : bad("executionMode valid", String(cfg.executionMode));
  cfg.executionMode === "LIVE" ? warn("executionMode = LIVE while Step 9 is unavailable") : ok("executionMode is non-live", cfg.executionMode);
  cfg.dryRunMode === true ? ok("dryRunMode = true (Phase 1 required)") : bad("dryRunMode = true", `is ${cfg.dryRunMode} — Phase 1 must stay in dry run`);
  typeof cfg.automationEnabled === "boolean" ? ok("automationEnabled is boolean", `currently ${cfg.automationEnabled}`) : bad("automationEnabled is boolean", `is ${typeof cfg.automationEnabled}`);
  cfg.emergencyStop === false ? ok("emergencyStop = false") : warn("emergencyStop is true", "run reset_live_safety.js to clear");
  cfg.compoundingEnabled === false ? ok("compounding disabled") : bad("compounding disabled");
  cfg.averagingDownEnabled === false ? ok("averaging-down disabled") : bad("averaging-down disabled");
  cfg.martingaleEnabled === false ? ok("martingale disabled") : bad("martingale disabled");
}

// 2. ENVIRONMENT / SECRET SAFETY
section("ENVIRONMENT / SECRET SAFETY");
const requiredEnvNames = [
  "SOLANA_SIGNER_SECRET",
  "EXPECTED_WALLET_PUBLIC_ADDRESS",
  "HELIUS_API_KEY",
  "SOLANA_RPC_URL"
];
if (!fs.existsSync(ENV_EXAMPLE_FILE)) {
  bad(".env.example exists");
} else {
  ok(".env.example exists");
  const envExampleText = fs.readFileSync(ENV_EXAMPLE_FILE, "utf8");
  const envExample = parseEnvTemplate(envExampleText);
  for (const name of requiredEnvNames) {
    Object.hasOwn(envExample, name) ? ok(`.env.example contains ${name}`) : bad(`.env.example contains ${name}`);
  }

  const nonEmptyTemplateValues = requiredEnvNames.filter(name => String(envExample[name] ?? "").length > 0);
  nonEmptyTemplateValues.length === 0
    ? ok(".env.example required values are empty")
    : bad(".env.example contains non-empty required value(s)", nonEmptyTemplateValues.join(", "));

  const realLookingTemplateSecret =
    /\[(?:\s*\d{1,3}\s*,){15,}\s*\d{1,3}\s*\]/.test(envExampleText) ||
    /^[ \t]*SOLANA_SIGNER_SECRET[ \t]*=[ \t]*[^ \t\r\n#]/m.test(envExampleText) ||
    /^[ \t]*HELIUS_API_KEY[ \t]*=[ \t]*[^ \t\r\n#]/m.test(envExampleText);
  realLookingTemplateSecret
    ? bad(".env.example does not contain real-looking secrets")
    : ok(".env.example does not contain real-looking secrets");
}

fs.existsSync(ENV_FILE)
  ? warn(".env exists", "values were not read or printed")
  : ok(".env not present");

cfg?.walletPublicAddress
  ? ok("live_config.json walletPublicAddress present")
  : bad("live_config.json walletPublicAddress present");

const expectedWallet = process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
if (expectedWallet) {
  expectedWallet === cfg?.walletPublicAddress
    ? ok("EXPECTED_WALLET_PUBLIC_ADDRESS matches live_config.json")
    : bad("EXPECTED_WALLET_PUBLIC_ADDRESS does not match live_config.json");
} else {
  ok("EXPECTED_WALLET_PUBLIC_ADDRESS", "NOT SET");
}
ok("HELIUS_API_KEY", process.env.HELIUS_API_KEY ? "SET" : "NOT SET");
ok("SOLANA_RPC_URL", process.env.SOLANA_RPC_URL ? "SET" : "NOT SET");

const scanFiles = projectTextFiles(ROOT);
const forbiddenTerms = [
  ["seed phrase", /\bseed phrase\b/gi],
  ["mnemonic", /\bmnemonic\b/gi],
  ["private key", /\bprivate key\b/gi]
];
for (const [label, pattern] of forbiddenTerms) {
  const matchedFiles = [];
  for (const file of scanFiles) {
    const text = fs.readFileSync(file, "utf8");
    if (pattern.test(text)) matchedFiles.push(path.relative(ROOT, file));
    pattern.lastIndex = 0;
  }
  matchedFiles.length === 0
    ? ok(`project scan: no "${label}" references`)
    : warn(`project scan: "${label}" reference(s) found`, `${matchedFiles.length} file(s); values not printed`);
}

const productionSignerAssignments = scanProductionHardcodedSignerAssignments(ROOT);
productionSignerAssignments.length === 0
  ? ok("production scan: no hardcoded SOLANA_SIGNER_SECRET assignments in production JavaScript")
  : bad("production scan: hardcoded SOLANA_SIGNER_SECRET assignment found in production JavaScript", `${productionSignerAssignments.length} file(s); values not printed`);

const redactionSelfCheck =
  redactSensitive("https://rpc.invalid/?api-key=secret").includes("[REDACTED]") &&
  redactSensitive("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz").includes("[REDACTED_BASE58]") &&
  redactSensitive(`[${Array.from({ length: 64 }, (_, i) => i).join(",")}]`).includes("[REDACTED_BYTE_ARRAY]");
redactionSelfCheck ? ok("secret redaction helper operational") : bad("secret redaction helper operational");

// 3. WALLET ADDRESS
section("WALLET ADDRESS");
const EXPECTED = "FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6";
if (cfg) {
  if (!cfg.walletPublicAddress) bad("walletPublicAddress set");
  else {
    ok("walletPublicAddress set", cfg.walletPublicAddress);
    // base58-ish length + charset sanity (not full validation)
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(cfg.walletPublicAddress) ? ok("address format plausible") : warn("address format unusual");
    cfg.walletPublicAddress === EXPECTED ? ok("address matches dedicated Phase 1 wallet") : warn("address differs from documented wallet");
  }
}

// 4. POSITION SIZE
section("POSITION SIZE");
if (cfg) {
  Number(cfg.positionSizeSol) === 0.10 ? ok("positionSizeSol = 0.10") : (Number(cfg.positionSizeSol) <= 0.10 ? warn("positionSizeSol <= 0.10", `is ${cfg.positionSizeSol}`) : bad("positionSizeSol > 0.10", `is ${cfg.positionSizeSol}`));
  Number(cfg.maxOpenTrades) === 1 ? ok("maxOpenTrades = 1") : bad("maxOpenTrades must equal 1", `is ${cfg.maxOpenTrades}`);
  Number(cfg.maxDailyLossSol) <= 0.10 ? ok("maxDailyLossSol <= 0.10") : warn("maxDailyLossSol > 0.10", `is ${cfg.maxDailyLossSol}`);
  Number(cfg.maxDailyLossCount) <= 3 ? ok("maxDailyLossCount <= 3") : warn("maxDailyLossCount > 3", `is ${cfg.maxDailyLossCount}`);
}

// 5. SWAP EXECUTION CONFIG PREPARATION
section("SWAP EXECUTION CONFIG PREPARATION");
if (cfg) {
  const requiredSwapFields = [
    "priorityFeeMode",
    "maxPriorityFeeLamports",
    "fallbackPriorityFeeLamports",
    "assumedComputeUnitLimit",
    "maxEntrySlippagePct",
    "maxExitSlippagePct",
    "maxRoutePriceImpactPct",
    "confirmationCommitment",
    "confirmationTimeoutMs",
    "maxSubmitRetries"
  ];
  for (const field of requiredSwapFields) {
    Object.hasOwn(cfg, field) ? ok(`${field} exists`) : bad(`${field} exists`);
  }

  const numberFields = [
    "maxPriorityFeeLamports",
    "fallbackPriorityFeeLamports",
    "assumedComputeUnitLimit",
    "maxEntrySlippagePct",
    "maxExitSlippagePct",
    "maxRoutePriceImpactPct",
    "confirmationTimeoutMs",
    "maxSubmitRetries"
  ];
  for (const field of numberFields) {
    typeof cfg[field] === "number" && Number.isFinite(cfg[field])
      ? ok(`${field} is a finite number`, String(cfg[field]))
      : bad(`${field} is a finite number`, `is ${typeof cfg[field]}`);
  }

  typeof cfg.priorityFeeMode === "string" ? ok("priorityFeeMode is string") : bad("priorityFeeMode is string");
  typeof cfg.confirmationCommitment === "string" ? ok("confirmationCommitment is string") : bad("confirmationCommitment is string");
  cfg.priorityFeeMode === "dynamic_helius" ? ok("priorityFeeMode = dynamic_helius") : bad("priorityFeeMode must be dynamic_helius", `is ${cfg.priorityFeeMode}`);
  Number.isInteger(cfg.maxPriorityFeeLamports) && cfg.maxPriorityFeeLamports >= 0 ? ok("maxPriorityFeeLamports is total-lamport transaction budget") : bad("maxPriorityFeeLamports must be non-negative total-lamport budget");
  Number.isInteger(cfg.fallbackPriorityFeeLamports) && cfg.fallbackPriorityFeeLamports >= 0 ? ok("fallbackPriorityFeeLamports is total-lamport transaction budget") : bad("fallbackPriorityFeeLamports must be non-negative total-lamport budget");
  Number.isInteger(cfg.assumedComputeUnitLimit) && cfg.assumedComputeUnitLimit > 0 ? ok("assumedComputeUnitLimit is positive integer") : bad("assumedComputeUnitLimit must be positive integer");
  String(cfg.phase1Notes || "").includes("total lamport budget caps per transaction")
    ? ok("priority-fee total-lamport unit contract documented")
    : bad("priority-fee total-lamport unit contract documented");
  cfg.maxEntrySlippagePct >= 0 && cfg.maxEntrySlippagePct <= 3 ? ok("maxEntrySlippagePct between 0 and 3") : bad("maxEntrySlippagePct outside 0–3", `is ${cfg.maxEntrySlippagePct}`);
  cfg.maxExitSlippagePct >= 0 && cfg.maxExitSlippagePct <= 5 ? ok("maxExitSlippagePct between 0 and 5") : bad("maxExitSlippagePct outside 0–5", `is ${cfg.maxExitSlippagePct}`);
  cfg.maxRoutePriceImpactPct >= 0 && cfg.maxRoutePriceImpactPct <= 10 ? ok("maxRoutePriceImpactPct between 0 and 10") : bad("maxRoutePriceImpactPct outside 0–10", `is ${cfg.maxRoutePriceImpactPct}`);
  cfg.confirmationCommitment === "confirmed" ? ok("confirmationCommitment = confirmed") : bad("confirmationCommitment must be confirmed", `is ${cfg.confirmationCommitment}`);
  cfg.confirmationTimeoutMs >= 0 && cfg.confirmationTimeoutMs <= 30000 ? ok("confirmationTimeoutMs between 0 and 30000") : bad("confirmationTimeoutMs outside 0–30000", `is ${cfg.confirmationTimeoutMs}`);
  checkMaxSubmitRetriesPolicy(cfg.maxSubmitRetries)
    ? ok("maxSubmitRetries between 0 and 2 (R14 policy)")
    : bad("maxSubmitRetries must be integer between 0 and 2", `is ${cfg.maxSubmitRetries}`);
}

if (cfg && fs.existsSync(EXECUTOR_FILE)) {
  const executorPolicySource = fs.readFileSync(EXECUTOR_FILE, "utf8");
  executorPolicySource.includes("function maxSubmitAttempts") &&
  executorPolicySource.includes("Math.min(Math.floor(retries) + 1, 10)")
    ? ok("maxSubmitRetries wired to bounded quote/submit attempt counter")
    : bad("maxSubmitRetries must drive bounded quote/submit attempts");
}

// 6. EMERGENCY STOP STATE
section("EMERGENCY STOP STATE");
if (cfg) {
  if (cfg.emergencyStop) { warn("emergency stop is ACTIVE", "no entries or exits until reset"); }
  else ok("emergency stop not active");
  if (cfg.emergencyStop && cfg.automationEnabled) bad("INVALID: emergencyStop true while automationEnabled true");
  else ok("emergency/automation flags consistent");
}

// 7. EXECUTION LOGGING SCAFFOLD
section("EXECUTION LOGGING SCAFFOLD");
if (!fs.existsSync(EXECUTOR_FILE)) {
  bad("live_executor.js exists");
} else {
  const executorSource = fs.readFileSync(EXECUTOR_FILE, "utf8");
  const abortCodes = [
    "REAL_PATH_DISABLED", "SIGNER_LOAD_FAILED", "WALLET_MISMATCH",
    "INSUFFICIENT_BALANCE", "MINT_MISMATCH", "QUOTE_FAILED",
    "ENTRY_SLIPPAGE_BLOCKED", "EXIT_SLIPPAGE_BLOCKED", "ROUTE_REJECTED",
    "PRIORITY_FEE_UNAVAILABLE", "TX_BUILD_FAILED", "SIMULATION_FAILED",
    "SUBMIT_FAILED", "SUBMISSION_UNKNOWN", "SUBMISSION_NOT_IMPLEMENTED",
    "CONFIRMATION_TIMEOUT", "CONFIRMATION_FAILED", "FILL_PARSE_FAILED"
  ];
  const executionStages = [
    "GUARD", "SIGNER_LOAD", "WALLET_MATCH", "BALANCE_CHECK", "MINT_RESOLUTION",
    "QUOTE", "ROUTE_VALIDATION", "PRIORITY_FEE", "TX_BUILD", "SIMULATION",
    "SIGNED", "SUBMIT", "CONFIRMATION", "FILL_PARSE", "PIPELINE_DRY_RUN"
  ];
  const missingAbortCodes = abortCodes.filter(code => !executorSource.includes(`${code}: "${code}"`));
  const missingStages = executionStages.filter(stage => !executorSource.includes(`${stage}: "${stage}"`));
  missingAbortCodes.length === 0 ? ok("all execution abort-code constants exist") : bad("missing execution abort-code constants", missingAbortCodes.join(", "));
  missingStages.length === 0 ? ok("all execution-stage constants exist") : bad("missing execution-stage constants", missingStages.join(", "));
  executorSource.includes("function redactSecrets(") ? ok("redaction helper exists") : bad("redaction helper exists");
  executorSource.includes("function makeExecutionError(") ? ok("typed execution-error helper exists") : bad("typed execution-error helper exists");
  executorSource.includes("function logExecutionStage(") ? ok("execution-stage logger exists") : bad("execution-stage logger exists");
  executorSource.includes("function logExecutionFailure(") ? ok("execution-failure logger exists") : bad("execution-failure logger exists");
  executorSource.includes("function loadSignerFromEnvForRealExecution(") ? ok("real-execution signer guard helper exists") : bad("real-execution signer guard helper exists");
  executorSource.includes("function resolveSwapMints(") ? ok("swap-mint resolver exists") : bad("swap-mint resolver exists");
  executorSource.includes("async function getJupiterQuote(") ? ok("Jupiter quote helper exists") : bad("Jupiter quote helper exists");
  executorSource.includes("function validateJupiterRoute(") ? ok("Jupiter route validator exists") : bad("Jupiter route validator exists");
  executorSource.includes("async function resolvePriorityFee(") ? ok("priority-fee resolver exists") : bad("priority-fee resolver exists");
  executorSource.includes("function resolveRpcEndpoint(") ? ok("centralized RPC endpoint resolver exists") : bad("centralized RPC endpoint resolver exists");
  executorSource.includes("async function submitRawTransaction(") ? ok("raw transaction submission helper exists") : bad("raw transaction submission helper exists");
  executorSource.includes("async function awaitConfirmation(") ? ok("confirmation polling helper exists") : bad("confirmation polling helper exists");
  executorSource.includes("async function parseFillFromTransaction(") ? ok("fill parsing helper exists") : bad("fill parsing helper exists");
  (executorSource.match(/function encodeBase58\(/g) || []).length === 1
    ? ok("base58 encoder is single-source")
    : bad("base58 encoder must not be duplicated");
  executorSource.includes("function writePendingReconciliation(") ? ok("pending reconciliation writer exists") : bad("pending reconciliation writer exists");
  executorSource.includes("function isPublicSolanaRpcEndpoint(") &&
    executorSource.includes("new URL(endpoint.trim()).hostname.toLowerCase()")
    ? ok("public Solana RPC detection uses normalized URL hostname")
    : bad("public Solana RPC detection must use normalized URL hostname");
  executorSource.includes("rejectedAsPublic") && executorSource.includes("configuredProvidersPresent")
    ? ok("dedicated RPC refusal diagnostics are audited before throw")
    : bad("dedicated RPC refusal diagnostics must be audited before throw");
  executorSource.includes('resolveRpcEndpoint(cfg, { requireDedicated: true, purpose: "priority_fee" })')
    ? ok("priority-fee resolution requires centralized dedicated RPC")
    : bad("priority-fee resolution must use centralized dedicated RPC");
  executorSource.includes('resolveRpcEndpoint(cfg, { requireDedicated: true, purpose: "simulation" })')
    ? ok("simulation requires centralized dedicated RPC")
    : bad("simulation must use centralized dedicated RPC");
  executorSource.includes('resolveRpcEndpoint(cfg, { requireDedicated: true, purpose: "submission" })')
    ? ok("submission requires centralized dedicated RPC")
    : bad("submission must use centralized dedicated RPC");
  executorSource.includes('resolveRpcEndpoint(cfg, { requireDedicated: true, purpose: "confirmation" })')
    ? ok("confirmation requires centralized dedicated RPC")
    : bad("confirmation must use centralized dedicated RPC");
  executorSource.includes('resolveRpcEndpoint(cfg, { requireDedicated: true, purpose: "fill_parse" })')
    ? ok("fill parsing requires centralized dedicated RPC")
    : bad("fill parsing must use centralized dedicated RPC");
  const simulationHelperSource = executorSource.match(/async function simulateSwapTx[\s\S]*?\n}\n\n\/\/ ─── Config/)?.[0] || "";
  !simulationHelperSource.includes("api.mainnet-beta.solana.com")
    ? ok("simulateSwapTx has no direct public-RPC fallback")
    : bad("simulateSwapTx must not hardcode public-RPC fallback");
  const priorityHelperSource = executorSource.match(/async function resolvePriorityFee[\s\S]*?\n}\n\n\/\/ Jupiter Swap/)?.[0] || "";
  !priorityHelperSource.includes("process.env.HELIUS_RPC_URL") &&
    !priorityHelperSource.includes("process.env.SOLANA_RPC_URL") &&
    !priorityHelperSource.includes("process.env.HELIUS_API_KEY")
    ? ok("resolvePriorityFee has no separate endpoint-resolution logic")
    : bad("resolvePriorityFee must not contain separate endpoint-resolution logic");
  executorSource.includes("async function buildSwapTx(") ? ok("Jupiter swap transaction builder exists") : bad("Jupiter swap transaction builder exists");
  executorSource.includes("async function simulateSwapTx(") ? ok("unsigned simulation helper exists") : bad("unsigned simulation helper exists");
  executorSource.includes('method: "simulateTransaction"') ? ok("simulateTransaction exists as an RPC method") : bad("simulateTransaction RPC method missing");
  executorSource.includes("sigVerify: false") ? ok("unsigned simulation explicitly uses sigVerify=false") : bad("unsigned simulation must explicitly use sigVerify=false");
  !executorSource.includes("sigVerify: true") ? ok("sigVerify=true absent") : bad("sigVerify=true must be absent");
  executorSource.includes("replaceRecentBlockhash: false") ? ok("simulation preserves recent blockhash") : bad("replaceRecentBlockhash must be false");
  executorSource.includes("malformedResponse: true") && executorSource.includes("rawResponseShape")
    ? ok("malformed simulation responses are audited before failure")
    : bad("malformed simulation responses must be audited before failure");
  executorSource.includes("cuHeadroomVsAssumed") && !executorSource.includes("const cuHeadroom =")
    ? ok("simulation compute headroom is labeled against assumed limit")
    : bad("simulation compute headroom must be labeled cuHeadroomVsAssumed");
  executorSource.includes("Dedicated RPC configured before real execution") &&
    executorSource.includes("Public mainnet-beta RPC is not acceptable for live execution")
    ? ok("real-execution readiness requires dedicated RPC")
    : bad("real-execution readiness must require dedicated RPC");
  executorSource.includes("function readShortvec(") && executorSource.includes("function inspectVersionedV0Transaction(")
    ? ok("strict versioned-v0 transaction shape parser exists")
    : bad("strict versioned-v0 transaction shape parser exists");
  executorSource.includes("signature count\", true") && executorSource.includes("version !== 0")
    ? ok("multi-byte signature count and future versions are rejected")
    : bad("multi-byte signature count and future versions are rejected");
  executorSource.includes("Transactions with zero instructions are not allowed")
    ? ok("zero-instruction transactions are rejected")
    : bad("zero-instruction transactions are rejected");
  executorSource.includes("wirePrioritizationFeeLamports") &&
    executorSource.includes("derivedMicroLamportsPerCU") &&
    executorSource.includes("derivedFromAssumedComputeUnitLimit")
    ? ok("TX_BUILD wire and derived fee audit fields are explicit")
    : bad("TX_BUILD wire and derived fee audit fields are explicit");
  executorSource.includes("lastValidBlockHeight") && executorSource.includes("jupiterReportedPrioritizationFeeLamports")
    ? ok("Jupiter build response fee and block-height metadata are audited")
    : bad("Jupiter build response fee and block-height metadata are audited");
  executorSource.includes("jupiter_swap_client") &&
    executorSource.includes("JUPITER_SWAP_BASE_DEFAULT") &&
    !executorSource.includes("https://quote-api.jup.ag/v6/quote")
    ? ok("Jupiter Swap v1 unified adapter reference exists; deprecated v6 quote host removed")
    : bad("Jupiter Swap v1 unified adapter reference must exist; deprecated v6 quote host must be removed");
  executorSource.includes("https://quote-api.jup.ag/v6/quote") ? bad("deprecated Jupiter v6 quote endpoint must not remain in live_executor") : ok("deprecated Jupiter v6 quote endpoint removed from live_executor");
  executorSource.includes("fetchJupiterQuote") && executorSource.includes("buildSwapRequestUrl")
    ? ok("live_executor uses shared Jupiter quote and swap-build adapter")
    : bad("live_executor must use shared Jupiter quote and swap-build adapter");
  executorSource.includes("getPriorityFeeEstimate") ? ok("Helius priority-fee method reference exists") : bad("Helius priority-fee method reference exists");
  executorSource.includes("maxPriorityFeeLamports") && executorSource.includes("fallbackPriorityFeeLamports")
    ? ok("priority-fee total-lamport cap and fallback references exist")
    : bad("priority-fee total-lamport cap and fallback references exist");
  executorSource.includes("assumedComputeUnitLimit") && executorSource.includes("/ 1e6")
    ? ok("per-CU estimate conversion to total lamports exists")
    : bad("per-CU estimate conversion to total lamports exists");
  executorSource.includes("new AbortController()") &&
    executorSource.includes("setTimeout(() => controller.abort(), timeoutMs)") &&
    executorSource.includes("clearTimeout(timer)")
    ? ok("Helius priority-fee call has bounded timeout cleanup")
    : bad("Helius priority-fee call has bounded timeout cleanup");
  executorSource.includes("api[-_]?key") && executorSource.includes("[REDACTED]")
    ? ok("API-key redaction exists")
    : bad("API-key redaction exists");

  const rawSignerLogged = /(?:console\.\w+|log\w*)\s*\([^)]*process\.env\.SOLANA_SIGNER_SECRET/s.test(executorSource);
  rawSignerLogged ? bad("raw SOLANA_SIGNER_SECRET is never logged") : ok("raw SOLANA_SIGNER_SECRET is never logged");

  const submitSwapMatch = executorSource.match(/async function submitSwap[\s\S]*?\n}\n\n\/\/ ─── Pre-trade abort checks/);
  const submitSwapSource = submitSwapMatch?.[0] || "";
  const liveStructure = evaluateLiveSubmissionStructure(executorSource);
  liveStructure.pass
    ? ok("LIVE submission path preserves arming → pipeline → sign → submit → confirm → fill order")
    : bad("LIVE submission path must preserve arming → pipeline → sign → submit → confirm → fill order");
  liveStructure.checks.armingBeforePipeline
    ? ok("LIVE arming guard occurs before execution pipeline")
    : bad("LIVE arming guard must occur before execution pipeline");
  liveStructure.checks.simulateBeforeSign
    ? ok("LIVE simulation occurs before signing")
    : bad("LIVE simulation must occur before signing");
  liveStructure.checks.signBeforeSubmit
    ? ok("LIVE signing occurs before submit")
    : bad("LIVE signing must occur before submit");
  liveStructure.checks.submitBeforeConfirm
    ? ok("LIVE submit occurs before confirmation")
    : bad("LIVE submit must occur before confirmation");
  liveStructure.checks.confirmBeforeFill
    ? ok("LIVE confirmation occurs before fill parsing")
    : bad("LIVE confirmation must occur before fill parsing");
  evaluateArmingGate(executorSource)
    ? ok('LIVE submission gate requires exact FOMO_ENABLE_LIVE_SUBMISSION === "YES" and <=0.01 SOL size')
    : bad('LIVE submission gate must require exact FOMO_ENABLE_LIVE_SUBMISSION === "YES" and <=0.01 SOL size');
  executorSource.includes('action: "SUBMISSION_UNKNOWN"') &&
    executorSource.includes('action: "CONFIRMATION_UNKNOWN"') &&
    executorSource.includes('action: "FILL_PARSE_UNKNOWN"') &&
    executorSource.includes("PENDING_RECONCILIATION_FILE")
    ? ok("ambiguous submission/confirmation/fill states write pending reconciliation")
    : bad("unknown live execution states must write pending reconciliation");

  const dryRunBeforeSigner = submitSwapMatch &&
    submitSwapMatch[0].indexOf('if (mode === "DRY_RUN")') <
      submitSwapMatch[0].indexOf("loadSignerFromEnvForRealExecution(cfg)");
  dryRunBeforeSigner ? ok("dry-run path returns before signer guard") : bad("dry-run path returns before signer guard");
  executorSource.includes("function resolveExecutionMode(") && executorSource.includes("function isAnyDryRun(")
    ? ok("execution-mode compatibility helpers exist")
    : bad("execution-mode compatibility helpers exist");
  executorSource.includes("function buildPipelineDryRunResult(") &&
    executorSource.includes('mode === "PIPELINE_DRY_RUN"')
    ? ok("pipeline dry-run result path exists")
    : bad("pipeline dry-run result path exists");
  executorSource.includes("setSignerLoaderForTest") && executorSource.includes("signerLoaderForTest")
    ? ok("pipeline dry-run poison-signer test seam exists")
    : bad("pipeline dry-run poison-signer test seam exists");
  executorSource.includes("function deriveFillFromQuoteApproachA(") &&
    executorSource.includes("Approach A: raw ratio only, no USD/token basis available")
    ? ok("pipeline dry-run uses honest unavailable-price contract")
    : bad("pipeline dry-run honest unavailable-price contract missing");
  executorSource.includes("function computeFeeBreakdownSol(") &&
    executorSource.includes("baseFeeLamports") && executorSource.includes("ataRentAccounted") &&
    executorSource.includes("ataDetectionMethod") && executorSource.includes("totalLamports")
    ? ok("pipeline dry-run fee breakdown exists")
    : bad("pipeline dry-run fee breakdown missing");

  const signerHelperMatch = executorSource.match(/function loadSignerFromEnvForRealExecution[\s\S]*?\n}\n\n\/\/ ─── Config/);
  const jsonArrayOnly = signerHelperMatch &&
    signerHelperMatch[0].includes("JSON.parse(raw)") &&
    signerHelperMatch[0].includes("secretBytes.length !== 64") &&
    !/\bmnemonic\b|\bseed phrase\b/i.test(signerHelperMatch[0]);
  jsonArrayOnly ? ok("signer guard accepts JSON byte-array format only") : bad("signer guard must accept JSON byte-array format only");

  const forbiddenSubmissionMethods = [
    "sendRawTransaction(", "signTransaction(",
    "partialSign(", "addSignature(", "nacl.sign(",
    "Keypair.fromSecretKey(", "Jupiter.quote("
  ];
  const addedSubmissionMethods = forbiddenSubmissionMethods.filter(method => executorSource.includes(method));
  const sendTransactionMethodCount = (executorSource.match(/method:\s*"sendTransaction"/g) || []).length;
  const submitRawSource = executorSource.match(/async function submitRawTransaction[\s\S]*?\n}\n\nasync function awaitConfirmation/)?.[0] || "";
  const expectedSigningOnly = executorSource.includes("crypto.sign(null, Buffer.from(messageBytes), privateKeyObj)") &&
    executorSource.includes("signer.sign(messageBytes)");
  addedSubmissionMethods.length === 0
    ? ok("no forbidden SDK submission/signing methods added")
    : bad("forbidden transaction submission/signing method detected", addedSubmissionMethods.join(", "));
  sendTransactionMethodCount === 1 && submitRawSource.includes('method: "sendTransaction"')
    ? ok("sendTransaction JSON-RPC method exists exactly once inside submitRawTransaction")
    : bad("sendTransaction JSON-RPC method must exist exactly once inside submitRawTransaction", `count ${sendTransactionMethodCount}`);
  submitRawSource.includes("skipPreflight: false") &&
    submitRawSource.includes('preflightCommitment: cfg.confirmationCommitment || "confirmed"') &&
    submitRawSource.includes("maxRetries: 0")
    ? ok("submission RPC uses preflight and disables internal retries")
    : bad("submission RPC must use skipPreflight=false, confirmed preflight, maxRetries=0");
  submitRawSource.includes("json.result !== txSig")
    ? ok("submission RPC returned signature must match signed bytes")
    : bad("submission RPC returned signature must match signed bytes");
  executorSource.includes("const pollTimeoutMs = Math.min(10000, remainingMs);")
    ? ok("confirmation poll timeout is capped by remaining budget")
    : bad("confirmation poll timeout must be capped by remaining budget");
  executorSource.includes("attempt <= 3") &&
    executorSource.includes("Could not derive fill price from transaction meta after retries")
    ? ok("fill parser retries bounded getTransaction indexing lag")
    : bad("fill parser must retry getTransaction indexing lag with a bounded limit");
  executorSource.includes("Post-fill USD slippage is diagnostic only")
    ? ok("post-fill USD slippage is documented as diagnostic only")
    : bad("post-fill USD slippage must be documented as diagnostic only");
  expectedSigningOnly
    ? ok("Step 9a local signing call sites exist")
    : bad("Step 9a expected local signing call sites missing");

  const buildHelperMatch = executorSource.match(/async function buildSwapTx[\s\S]*?\n}\n\n\/\/ ─── Config/);
  const noTransactionPersistence = buildHelperMatch &&
    !/appendJsonl\([^)]*(swapTransaction|serializedBytes|transaction)/s.test(buildHelperMatch[0]) &&
    !/writeFileSync\([^)]*(swapTransaction|serializedBytes|transaction)/s.test(buildHelperMatch[0]);
  noTransactionPersistence ? ok("swap transaction object is not written to disk") : bad("swap transaction object must not be written to disk");
}

// 8. JSONL VALIDITY
section("JSONL VALIDITY");
for (const [name, f] of [["live_trades.jsonl", LIVE_TRADES_FILE], ["live_control_events.jsonl", CONTROL_FILE], ["live_errors.jsonl", ERRORS_FILE], ["execution_audit.jsonl", path.join(ROOT, "execution_audit.jsonl")]]) {
  if (!fs.existsSync(f)) { warn(`${name} not yet created`, "will be created on first write"); continue; }
  const { rows, errors } = readJsonl(f);
  errors === 0 ? ok(`${name} valid`, `${rows.length} rows`) : bad(`${name} has ${errors} bad line(s)`);
}

// 9. DUPLICATE POSITIONS + MAX OPEN
section("POSITIONS / DUPLICATES / MAX OPEN");
let positions = [];
if (fs.existsSync(POSITIONS_FILE)) {
  try { const p = JSON.parse(fs.readFileSync(POSITIONS_FILE, "utf8")); positions = Array.isArray(p) ? p : []; ok("live_positions.json valid JSON"); }
  catch (e) { bad("live_positions.json valid JSON", e.message); }
} else ok("live_positions.json not yet created", "no open positions");
const open = positions.filter(p => p.status === "OPEN");
open.length <= (cfg ? Number(cfg.maxOpenTrades || 1) : 1) ? ok("open positions within max", `${open.length} open`) : bad("too many open positions", `${open.length}`);
const addrs = open.map(p => p.address);
const dupeAddr = addrs.filter((a, i) => addrs.indexOf(a) !== i);
dupeAddr.length === 0 ? ok("no duplicate open positions by address") : bad("duplicate open positions", dupeAddr.join(", "));

// 10. DAILY STOP STATUS
section("DAILY STOP STATUS");
const { rows: tradeRows } = readJsonl(LIVE_TRADES_FILE);
const today = new Date().toLocaleDateString("en-CA");
const closedToday = tradeRows.filter(r => r.eventType === "CLOSED_LIVE_TRADE" && r.exitTime && new Date(r.exitTime).toLocaleDateString("en-CA") === today);
const lossesToday = closedToday.filter(r => r.status === "LOSS" || Number(r.netPnlSol) < 0).length;
const solToday = closedToday.reduce((s, r) => s + Number(r.netPnlSol || 0), 0);
const lossCountHit = cfg && lossesToday >= Number(cfg.maxDailyLossCount || 3);
const lossSolHit = cfg && solToday <= -(Math.abs(Number(cfg.maxDailyLossSol || 0.10)));
if (lossCountHit || lossSolHit) warn("daily stop currently HIT", `${lossesToday} losses, ${solToday.toFixed(4)} SOL today`);
else ok("daily stop not hit", `${lossesToday} losses, ${solToday.toFixed(4)} SOL today`);

// 11. DASHBOARD CONTROL INTEGRITY
section("DASHBOARD CONTROL INTEGRITY");
if (!fs.existsSync(DASHBOARD_FILE)) bad("dashboard_server.js exists");
else {
  const src = fs.readFileSync(DASHBOARD_FILE, "utf8");
  src.includes('/control/start') ? ok("START endpoint present") : bad("START endpoint /control/start missing");
  src.includes('/control/stop') ? ok("STOP endpoint present") : bad("STOP endpoint /control/stop missing");
  src.includes('/control/emergency') ? ok("EMERGENCY endpoint present") : bad("EMERGENCY endpoint /control/emergency missing");
  src.includes("LIVE AUTOMATION CONTROL") ? ok("automation control panel present") : bad("automation control panel missing");
}

// 12. READ-ONLY DATA INTEGRITY
section("READ-ONLY DATA INTEGRITY");
if (!paperHashAtStart || !fs.existsSync(PAPER_FILE)) {
  bad("paper_trades.json exists for hash verification");
} else {
  const paperHashAtEnd = crypto.createHash("sha256").update(fs.readFileSync(PAPER_FILE)).digest("hex");
  paperHashAtEnd === paperHashAtStart
    ? ok("paper_trades.json hash unchanged during validation")
    : bad("paper_trades.json hash changed during validation");
}

// RESULT
section("RESULT");
console.log(`  ${failures === 0 ? G : R} ${failures} failure(s), ${warnings} warning(s)`);
if (failures === 0) console.log(`\n  ${B}\x1b[32mLIVE SYSTEM VALIDATION PASSED${X} ${D}(dry run; automation state unchanged by validator)${X}\n`);
else console.log(`\n  ${B}\x1b[31mVALIDATION FAILED — fix failures before proceeding${X}\n`);
return { failures, warnings };
}

if (require.main === module) {
  const result = runValidation();
  process.exit(result.failures === 0 ? 0 : 1);
}

module.exports = {
  SIGNER_ASSIGNMENT_RE,
  normalizeRelativePath,
  isExcludedSecretScanPath,
  isProductionJsScanCandidate,
  scanProductionHardcodedSignerAssignments,
  checkMaxSubmitRetriesPolicy,
  evaluateLiveSubmissionStructure,
  evaluateArmingGate,
  runValidation,
  projectTextFiles
};
