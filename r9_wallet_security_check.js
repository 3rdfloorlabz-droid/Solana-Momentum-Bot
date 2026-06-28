"use strict";

// r9_wallet_security_check.js — Sprint 4 R9
// Read-only wallet/signer security posture check. Writes analysis/ only.
// Does NOT connect wallets, read signing material, or enable live trading.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const review = require("./r7_strategy_review");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R9_OUTPUT_DIR
  ? path.resolve(process.env.R9_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r9_wallet_security_status.json");

const REQUIRED_GITIGNORE_PATTERNS = [
  ".env",
  ".env.*",
  "secrets/",
  "private/",
  "keys/",
  "*.key",
  "*.pem",
  "*secret*",
  "signer_secret*",
  "wallet_secret*",
  "SOLANA_SIGNER_SECRET*"
];

const RISKY_PATH_BASENAMES = [
  ".env",
  ".env.local",
  ".env.live.local",
  "secrets.local.json",
  "wallet.json",
  "keypair.json"
];

const PLACEHOLDER_MARKERS = [
  "PRIVATE_KEY_DO_NOT_USE_FAKE_EXAMPLE_ONLY",
  "DO_NOT_USE",
  "FAKE_EXAMPLE",
  "example-only",
  "11111111111111111111111111111111"
];

const SCAN_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "analysis",
  "soak_runs",
  "coverage",
  "dist",
  "build"
]);

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
    walletPublicAddress: data.walletPublicAddress || null
  };
}

function checkGitignorePolicy(repoRoot) {
  const gitignorePath = path.join(repoRoot, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    return {
      ok: false,
      missingPatterns: REQUIRED_GITIGNORE_PATTERNS.slice(),
      note: ".gitignore missing"
    };
  }
  const content = fs.readFileSync(gitignorePath, "utf8");
  const missingPatterns = REQUIRED_GITIGNORE_PATTERNS.filter(
    pattern => !content.split(/\r?\n/).some(line => line.trim() === pattern)
  );
  return {
    ok: missingPatterns.length === 0,
    missingPatterns,
    patternsChecked: REQUIRED_GITIGNORE_PATTERNS.length
  };
}

function listGitTrackedFiles(repoRoot) {
  const result = spawnSync("git", ["-C", repoRoot, "ls-files"], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0 || !result.stdout) {
    return { available: false, files: [] };
  }
  return {
    available: true,
    files: result.stdout.split(/\r?\n/).filter(Boolean)
  };
}

function isPlaceholderLine(line) {
  if (/<[^>]+>/.test(line)) return true;
  return PLACEHOLDER_MARKERS.some(marker => line.includes(marker));
}

function shouldSkipScanFile(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const base = path.basename(normalized);
  if (/^test_/i.test(base)) return true;
  if (/\.example$/i.test(base)) return true;
  if (/(^|\/)(automation|hardreset|files|phase1_files|harness)(\/|$)/.test(normalized)) {
    return true;
  }
  return false;
}

function scanLineForIndicators(line, filePath = "") {
  if (!line || isPlaceholderLine(line)) return null;
  if (/process\.env\.SOLANA_SIGNER/.test(line)) return null;
  if (/SOLANA_SIGNER_[A-Z_]+\s*=\s*\S+/.test(line)) {
    return "env-signer-assignment";
  }
  if (/\[\s*\d+\s*(?:,\s*\d+\s*){31,}/.test(line)) {
    return "numeric-key-array";
  }
  const base58Match = line.match(/\b[1-9A-HJ-NP-Za-km-z]{87,88}\b/);
  if (base58Match && !isPlaceholderLine(base58Match[0]) && !shouldSkipScanFile(filePath)) {
    return "long-base58-material";
  }
  return null;
}

function scanFileForIndicators(filePath) {
  if (shouldSkipScanFile(filePath)) return [];
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const findings = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const indicator = scanLineForIndicators(lines[i], filePath);
    if (indicator) {
      findings.push({
        file: filePath,
        line: i + 1,
        indicator,
        redacted: true
      });
    }
  }
  return findings;
}

function walkForScan(dir, repoRoot, findings, depth = 0) {
  if (depth > 8) return;
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
      walkForScan(fullPath, repoRoot, findings, depth + 1);
      continue;
    }
    if (!/\.(js|md|json|txt|example|env)$/i.test(entry.name)) continue;
    findings.push(...scanFileForIndicators(fullPath));
  }
}

function checkRiskyPaths(repoRoot) {
  const present = [];
  for (const name of RISKY_PATH_BASENAMES) {
    const fullPath = path.join(repoRoot, name);
    if (fs.existsSync(fullPath)) {
      present.push({ path: fullPath, basename: name, contentNotRead: true });
    }
  }
  return present;
}

function checkTrackedRiskyFiles(repoRoot) {
  const tracked = listGitTrackedFiles(repoRoot);
  if (!tracked.available) {
    return { available: false, matches: [] };
  }
  const riskyPatterns = [
    /^\.env(\.|$)/,
    /secrets\.local\.json$/,
    /wallet\.json$/,
    /keypair\.json$/,
    /signer_secret/i,
    /wallet_secret/i,
    /\.key$/,
    /\.pem$/
  ];
  const matches = tracked.files.filter(file => {
    const norm = file.replace(/\\/g, "/");
    if (/\.example$/i.test(norm)) return false;
    return riskyPatterns.some(pattern => pattern.test(norm));
  });
  return { available: true, matches };
}

function collectBlockers(context) {
  const blockers = [];
  if (context.posture.liveArmed === true) blockers.push("liveArmed is true");
  if (context.posture.executionMode === "LIVE") blockers.push("executionMode is LIVE");
  if (context.posture.dryRunMode !== true) blockers.push("dryRunMode is not true");
  if (context.recoveryActionsJsonl.exists) blockers.push("recovery_actions.jsonl exists unexpectedly");
  if (context.r7bReadyForR8 !== true) blockers.push("R7b sample thresholds not met");
  if (context.gitignorePolicy.ok !== true) blockers.push(".gitignore missing required credential patterns");
  if (context.trackedRiskyFiles.matches.length > 0) blockers.push("tracked risky credential paths detected in git");
  if (context.secretIndicators.length > 0) blockers.push("potential signing material indicators detected in repo scan");
  blockers.push("R9 is security design only — wallet not connected");
  blockers.push("signer simulation not built");
  blockers.push("live execution path review not complete (R10 pending)");
  blockers.push("emergency stop live validation not complete");
  blockers.push("micro-live config not created");
  blockers.push("explicit human approval not given");
  blockers.push("real wallet not connected");
  return blockers;
}

function deriveVerdict(context) {
  if (
    context.posture.liveArmed === true ||
    context.posture.executionMode === "LIVE" ||
    context.posture.dryRunMode === false ||
    context.recoveryActionsJsonl.exists ||
    context.trackedRiskyFiles.matches.length > 0 ||
    context.secretIndicators.length > 0 ||
    context.gitignorePolicy.ok !== true
  ) {
    return {
      verdict: "NOT READY FOR WALLET CONNECTION",
      reason: "Unsafe posture or credential hygiene issue detected — wallet connection must remain blocked."
    };
  }
  return {
    verdict: "WALLET SECURITY DESIGN DEFINED BUT NOT CONNECTED",
    reason: "Wallet/signer security policy documented; no wallet connected; live trading still NOT approved."
  };
}

function collectR9WalletSecurityStatus(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const scanRepo = options.scanRepo !== false;

  const posture = readPosture(runtimeRoot);
  const recoveryActionsJsonl = {
    exists: fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"))
  };
  const gitignorePolicy = checkGitignorePolicy(repoRoot);
  const riskyPathsPresent = checkRiskyPaths(repoRoot);
  const trackedRiskyFiles = checkTrackedRiskyFiles(repoRoot);

  let secretIndicators = [];
  if (scanRepo) {
    const findings = [];
    walkForScan(repoRoot, repoRoot, findings);
    secretIndicators = findings;
  }
  if (Array.isArray(options.secretIndicators)) {
    secretIndicators = options.secretIndicators;
  }

  const r7bSummary = readJsonIfPresent(path.join(analysisDir, "r7b_daily_summary.json"));
  const r8Status = readJsonIfPresent(path.join(analysisDir, "r8_risk_controls_status.json"));
  const r7bReadyForR8 = r7bSummary.data?.progress?.readyForR8 === true;

  const context = {
    posture,
    recoveryActionsJsonl,
    gitignorePolicy,
    trackedRiskyFiles,
    secretIndicators,
    r7bReadyForR8
  };

  const evaluation = deriveVerdict(context);
  const blockers = collectBlockers(context);

  return {
    timestamp: new Date().toISOString(),
    review: "R9-wallet-signer-security",
    liveTradingApproved: false,
    microLiveApproved: false,
    walletConnected: false,
    signingMaterialHandled: false,
    realWalletConnected: false,
    posture,
    recoveryActionsJsonl,
    gitignorePolicy,
    riskyPathsPresent,
    trackedRiskyFiles,
    secretIndicators,
    priorGates: {
      r8Verdict: r8Status.data?.evaluation?.verdict || "RISK CONTROLS DEFINED BUT NOT ARMED",
      r7bReadyForR8
    },
    evaluation,
    blockers,
    recommendedNextGate:
      "Continue R7b data collection; proceed to R10 Live Execution Path Review / signer simulation design; do not connect real wallet yet"
  };
}

function printSummary(status) {
  console.log("[r9-wallet] Wallet / Signer Security Review status (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  wallet connected: false`);
  console.log(`  live trading approved: false`);
  console.log(`  posture: mode=${status.posture.executionMode} dryRunMode=${status.posture.dryRunMode} liveArmed=${status.posture.liveArmed}`);
  console.log(`  .gitignore policy ok: ${status.gitignorePolicy.ok === true}`);
  console.log(`  tracked risky files: ${status.trackedRiskyFiles.matches.length}`);
  console.log(`  secret-like indicators: ${status.secretIndicators.length}`);
  console.log(`  recommended next gate: ${status.recommendedNextGate}`);
}

function writeStatus(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runR9WalletSecurityCheck(options = {}) {
  const status = collectR9WalletSecurityStatus(options);
  const outputFile = options.outputFile || OUTPUT_FILE;
  if (options.writeOutput !== false) {
    writeStatus(status, outputFile);
  }
  if (options.print !== false) {
    printSummary(status);
  }
  return { status, outputFile: options.writeOutput !== false ? outputFile : null };
}

if (require.main === module) {
  try {
    const result = runR9WalletSecurityCheck();
    if (result.outputFile) {
      console.log(`  status: ${result.outputFile}`);
    }
  } catch (err) {
    console.error("[r9-wallet] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  REQUIRED_GITIGNORE_PATTERNS,
  OUTPUT_FILE,
  readPosture,
  checkGitignorePolicy,
  scanLineForIndicators,
  deriveVerdict,
  collectBlockers,
  collectR9WalletSecurityStatus,
  runR9WalletSecurityCheck,
  writeStatus
};
