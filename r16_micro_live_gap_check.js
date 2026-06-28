"use strict";

// r16_micro_live_gap_check.js — Sprint 4 R16
// Read-only micro-live implementation gap status. Writes analysis/ only.
// Does NOT approve micro-live, connect wallets, or enable live trading.

const fs = require("fs");
const path = require("path");
const review = require("./r7_strategy_review");
const r7b = require("./r7b_daily_summary");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R16_OUTPUT_DIR
  ? path.resolve(process.env.R16_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r16_micro_live_gap_status.json");

const GATE_DOCS = {
  r8: "docs/R8_RISK_CONTROLS_REVIEW.md",
  r9: "docs/R9_WALLET_SIGNER_SECURITY_REVIEW.md",
  r10: "docs/R10_LIVE_EXECUTION_PATH_REVIEW.md",
  r11: "docs/R11_EMERGENCY_STOP_VALIDATION.md",
  r12: "docs/R12_MICRO_LIVE_READINESS_CHECKLIST.md",
  r13: "docs/R13_FINAL_MICRO_LIVE_APPROVAL_GATE.md",
  r14: "docs/R14_SLIPPAGE_MEV_PROTECTION_REVIEW.md",
  r15: "docs/R15_MANUAL_APPROVAL_RECORD_AND_SESSION_RUNBOOK.md",
  r16: "docs/R16_MICRO_LIVE_IMPLEMENTATION_GAP_REVIEW.md"
};

const ARTIFACTS = {
  fakeSignerHarness: "signer_simulation_harness.js",
  liveExecutor: "live_executor.js",
  r13Helper: "r13_micro_live_approval_check.js",
  r14Helper: "r14_slippage_mev_review.js",
  r15Helper: "r15_manual_approval_check.js"
};

const EXAMPLE_CONFIG_CANDIDATES = [
  "micro_live_config.example.json",
  "config/micro_live_config.example.json"
];

function docExists(repoRoot, relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function artifactExists(repoRoot, relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function readGateDocs(repoRoot) {
  const docs = {};
  for (const [key, rel] of Object.entries(GATE_DOCS)) {
    docs[key] = docExists(repoRoot, rel);
  }
  return docs;
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

function isSafeObservationPosture(posture) {
  return (
    posture.executionMode === "PIPELINE_DRY_RUN" &&
    posture.dryRunMode === true &&
    posture.liveArmed === false &&
    posture.emergencyStop !== true
  );
}

function buildImplementationGaps(context) {
  const gaps = [];

  const add = (area, requiredCapability, currentStatus, missingWork, riskIfSkipped, blocksLive) => {
    gaps.push({ area, requiredCapability, currentStatus, missingWork, riskIfSkipped, blocksLive });
  };

  add(
    "Signer",
    "Real signer integration",
    context.fakeSignerOnly ? "Fake harness only" : "Unknown",
    "Approved real signer module + security review",
    "No valid signing",
    true
  );
  add(
    "Signer",
    "Signer secret loading",
    "Not implemented",
    "Env/HSM loading per R9 — local only",
    "Credential exposure or missing signer",
    true
  );
  add(
    "Wallet",
    "Research wallet connected through approved bot path",
    context.walletConnected ? "Connected" : "Not connected",
    "Approved wallet registration + monitor binding",
    "Wrong wallet or no wallet",
    true
  );
  add(
    "Config",
    "Micro-live config file",
    context.microLiveConfigExample ? "Example only" : "Not created",
    "micro_live_config.example.json + parser (R17)",
    "Limits not enforced",
    true
  );
  add(
    "Slippage",
    "R14 slippage cap enforcement on live path",
    context.r14HelperPresent ? "Fixture helper only" : "Missing helper",
    "Pre-submit slippage gate in executor",
    "Bad fills",
    true
  );
  add(
    "MEV",
    "MEV/protected route selection",
    "Design only (R14)",
    "Submit path selection + policy enforcement",
    "Sandwich loss",
    true
  );
  add(
    "Execution",
    "Transaction submission",
    "DISARMED / not implemented",
    "Approved submit path after all gates",
    "No live execution",
    true
  );
  add(
    "Approval",
    "Operator approval check in executor",
    context.r15HelperPresent ? "Read-only helper only" : "Missing",
    "Wire R15 record + per-trade approval",
    "Unattended live trades",
    true
  );
  add(
    "Safety",
    "Emergency stop hard-block on live path",
    context.r11DocPresent ? "Simulation only" : "Doc missing",
    "Live sign/submit block when emergencyStop true",
    "Trading during halt",
    true
  );
  add(
    "Positions",
    "Confirmation-before-position-write",
    "Policy documented (R10)",
    "Live position write only after on-chain confirm",
    "Ghost positions",
    true
  );

  if (!context.r7bReady) {
    add(
      "Research",
      "R7b thresholds met (ordinary path)",
      "Not met — research exception only",
      "Continue R7b OR explicit R13/R15 bypass ack",
      "Unproven edge treated as proof",
      true
    );
  }

  return gaps;
}

function collectMissingDocBlockers(gateDocs) {
  const blockers = [];
  for (const [key, present] of Object.entries(gateDocs)) {
    if (!present && key !== "r16") {
      blockers.push(`${key.toUpperCase()} doc missing`);
    }
  }
  if (!gateDocs.r13) blockers.push("R13 doc missing");
  if (!gateDocs.r14) blockers.push("R14 doc missing");
  if (!gateDocs.r15) blockers.push("R15 doc missing");
  return [...new Set(blockers)];
}

function deriveGateStatus(context) {
  if (
    context.posture.liveArmed === true ||
    context.posture.emergencyStop === true ||
    !context.recoveryAbsent ||
    context.safetySuiteGreen === false ||
    context.missingDocBlockers.length > 0
  ) {
    return {
      gateStatus: "BLOCKED",
      verdict: "IMPLEMENTATION GAPS IDENTIFIED — LIVE BLOCKED",
      reason: "Unsafe posture, missing gate docs, or safety signal — implementation review blocked."
    };
  }

  if (
    context.allPrerequisiteDocsPresent &&
    isSafeObservationPosture(context.posture) &&
    context.implementationGaps.length > 0
  ) {
    const allBlocking = context.implementationGaps.some((g) => g.blocksLive);
    if (allBlocking && context.fakeSignerOnly && !context.microLiveConfigExample) {
      return {
        gateStatus: "READY_FOR_SIMULATED_IMPLEMENTATION_PLAN",
        verdict: "IMPLEMENTATION GAPS IDENTIFIED — LIVE BLOCKED",
        reason:
          "Prerequisite docs complete; gaps enumerated — ready to design R17 simulated harness (not live)."
      };
    }
  }

  return {
    gateStatus: "GAPS_IDENTIFIED",
    verdict: "IMPLEMENTATION GAPS IDENTIFIED — LIVE BLOCKED",
    reason: "Implementation gaps remain — micro-live and live trading NOT approved."
  };
}

function collectR16MicroLiveGapStatus(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;

  const posture = readPosture(runtimeRoot);
  const recoveryAbsent = !fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"));
  const gateDocs = options.gateDocs || readGateDocs(repoRoot);

  let r7bSummary = options.r7bSummary || null;
  if (!r7bSummary) {
    const r7bFilePath = path.join(analysisDir, "r7b_daily_summary.json");
    if (fs.existsSync(r7bFilePath)) {
      try {
        r7bSummary = JSON.parse(fs.readFileSync(r7bFilePath, "utf8"));
      } catch {
        r7bSummary = null;
      }
    }
  }
  const r7bReady = r7bSummary?.progress?.readyForR8 === true;

  const safetySuiteGreen = options.safetySuiteGreen !== undefined
    ? options.safetySuiteGreen === true
    : null;

  const fakeSignerOnly = options.fakeSignerOnly !== false &&
    artifactExists(repoRoot, ARTIFACTS.fakeSignerHarness);
  const r13HelperPresent = artifactExists(repoRoot, ARTIFACTS.r13Helper);
  const r14HelperPresent = artifactExists(repoRoot, ARTIFACTS.r14Helper);
  const r15HelperPresent = artifactExists(repoRoot, ARTIFACTS.r15Helper);
  const microLiveConfigExample = EXAMPLE_CONFIG_CANDIDATES.some((p) => docExists(repoRoot, p));
  const walletConnected = options.walletConnected === true;

  const prerequisiteKeys = ["r8", "r9", "r10", "r11", "r12", "r13", "r14", "r15"];
  const allPrerequisiteDocsPresent = prerequisiteKeys.every((k) => gateDocs[k] === true);
  const missingDocBlockers = collectMissingDocBlockers(gateDocs);

  const context = {
    posture,
    recoveryAbsent,
    gateDocs,
    r7bReady,
    safetySuiteGreen: safetySuiteGreen === true,
    fakeSignerOnly,
    r11DocPresent: gateDocs.r11 === true,
    r13HelperPresent,
    r14HelperPresent,
    r15HelperPresent,
    microLiveConfigExample,
    walletConnected,
    allPrerequisiteDocsPresent,
    missingDocBlockers
  };

  context.implementationGaps = buildImplementationGaps(context);
  const gate = deriveGateStatus(context);

  const blockingGaps = context.implementationGaps.filter((g) => g.blocksLive);

  return {
    timestamp: new Date().toISOString(),
    review: "R16-micro-live-implementation-gap",
    liveTradingApproved: false,
    microLiveApproved: false,
    approved: false,
    capitalAtRiskUsd: 0,
    posture,
    recoveryActionsJsonl: { exists: !recoveryAbsent },
    gateDocs,
    priorGates: {
      r6a: "PASS",
      r7: "NOT ENOUGH DATA",
      r7bReady,
      r7bStatus: r7bReady ? "THRESHOLDS MET" : "ACTIVE — THRESHOLDS NOT MET",
      r12: "CHECKLIST DEFINED BUT BLOCKED",
      r13: gateDocs.r13 ? "FINAL APPROVAL GATE DEFINED — BLOCKED" : "MISSING",
      r14: gateDocs.r14 ? "SLIPPAGE / MEV REVIEW DEFINED — NOT IMPLEMENTED" : "MISSING",
      r15: gateDocs.r15 ? "MANUAL APPROVAL RUNBOOK DEFINED — LIVE STILL BLOCKED" : "MISSING"
    },
    researchException: {
      r7bComplete: r7bReady,
      highRiskIfBeforeR7b: !r7bReady,
      requiresR13R15Approval: true,
      notStrategyProof: true,
      firstGoal: "execution validation and slippage/MEV measurement"
    },
    implementationGaps: context.implementationGaps,
    blockingGapCount: blockingGaps.length,
    stagedImplementationPath: [
      "Stage 1: draft example config only — no secrets — no arming",
      "Stage 2: simulated config parser + fake approval + fake signer + fixtures — no network submit",
      "Stage 3: shadow mode — real quotes only if approved — no signing",
      "Stage 4: signer integration review — local secrets only — no submit",
      "Stage 5: one supervised session only after final approval — NOT APPROVED"
    ],
    evaluation: {
      verdict: gate.verdict,
      gateStatus: gate.gateStatus,
      reason: gate.reason,
      approved: false
    },
    missingDocBlockers,
    recommendedNextGate:
      "Build R17 Simulated Micro-Live Config + Approval Harness; continue R7b; do not connect wallet; do not arm live"
  };
}

function printSummary(status) {
  console.log("[r16-gap] Micro-Live Implementation Gap Review (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  gate status: ${status.evaluation.gateStatus}`);
  console.log(`  approved: false`);
  console.log(`  blocking gaps: ${status.blockingGapCount}`);
  console.log(`  R7b ready: ${status.priorGates.r7bReady === true}`);
  console.log(`  fake signer only: true`);
  console.log(`  real wallet connected: false`);
}

function writeStatus(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runR16MicroLiveGapCheck(options = {}) {
  const status = collectR16MicroLiveGapStatus(options);
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
    const result = runR16MicroLiveGapCheck();
    if (result.outputFile) {
      console.log(`  status: ${result.outputFile}`);
    }
  } catch (err) {
    console.error("[r16-gap] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  GATE_DOCS,
  ARTIFACTS,
  OUTPUT_FILE,
  readGateDocs,
  readPosture,
  buildImplementationGaps,
  deriveGateStatus,
  collectR16MicroLiveGapStatus,
  runR16MicroLiveGapCheck,
  writeStatus
};
