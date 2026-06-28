"use strict";

// signer_simulation_harness.js — Sprint 4 R10
// Fake signer / simulated transaction lifecycle for design validation only.
//
// Does NOT use real signing material, connect wallets, submit to network,
// mutate live_config.json, or enable live trading.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname);
const DEFAULT_OUTPUT_DIR = process.env.SIGNER_SIM_OUTPUT_DIR
  ? path.resolve(process.env.SIGNER_SIM_OUTPUT_DIR)
  : path.join(ROOT, "analysis");

const SIMULATED_WALLET_ADDRESS = "SIMULATED_RESEARCH_WALLET_DO_NOT_USE";
const SIMULATED_SIGNATURE_PREFIX = "FAKE_SIG_";

const AGREEMENT_GATES = Object.freeze({
  allowedExecutionModes: Object.freeze(["MICRO_LIVE", "LIVE"]),
  dryRunMode: false,
  liveArmed: true,
  emergencyStop: false,
  singletonLockValid: true,
  exactlyOneExecutorLoop: true,
  r8LimitsLoaded: true,
  walletMonitorFresh: true,
  signerPresent: true,
  operatorApprovalPresent: true
});

const FAILURE_MODES = Object.freeze([
  "quote_missing",
  "price_stale",
  "liquidity_low",
  "slippage_high",
  "signer_missing",
  "signer_malformed",
  "simulation_fail",
  "rpc_failure",
  "duplicate_submit",
  "timeout",
  "position_write_fail",
  "exit_fail",
  "emergency_stop",
  "wallet_monitor_stale",
  "singleton_mismatch",
  "process_restart"
]);

function hashDeterministic(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex").slice(0, 32);
}

function createFakeTransaction(intent = {}) {
  const txId = intent.txId || `sim-tx-${hashDeterministic(JSON.stringify(intent))}`;
  return {
    txId,
    kind: intent.kind || "BUY",
    tokenAddress: intent.tokenAddress || "11111111111111111111111111111111",
    pairAddress: intent.pairAddress || "sim-pair",
    amountUsd: intent.amountUsd ?? 10,
    quoteRoute: intent.quoteRoute || "simulated-route",
    simulated: true,
    constructedAt: new Date().toISOString()
  };
}

function createOperatorApproval(approval = {}) {
  const now = Date.now();
  const expiresAt = approval.expiresAt || new Date(now + (approval.ttlMs || 60_000)).toISOString();
  return {
    approvalId: approval.approvalId || `sim-approval-${hashDeterministic(`${approval.tokenAddress}-${now}`)}`,
    tokenAddress: approval.tokenAddress || null,
    tradeSizeUsd: approval.tradeSizeUsd ?? 10,
    maxLossUsd: approval.maxLossUsd ?? 5,
    sessionId: approval.sessionId || "sim-session",
    approvedAt: new Date(now).toISOString(),
    expiresAt,
    simulated: true
  };
}

function isApprovalValid(approval, tokenAddress, nowMs = Date.now()) {
  if (!approval || approval.simulated !== true) return false;
  if (Date.parse(approval.expiresAt) <= nowMs) return false;
  if (approval.tokenAddress && tokenAddress && approval.tokenAddress !== tokenAddress) return false;
  return true;
}

function checkAgreementGates(posture = {}, context = {}) {
  const blockers = [];
  const mode = posture.executionMode;
  if (!AGREEMENT_GATES.allowedExecutionModes.includes(mode)) {
    blockers.push(`executionMode must be MICRO_LIVE or LIVE (${mode || "unknown"})`);
  }
  if (posture.dryRunMode !== AGREEMENT_GATES.dryRunMode) {
    blockers.push(`dryRunMode must be false (${posture.dryRunMode})`);
  }
  if (posture.liveArmed !== AGREEMENT_GATES.liveArmed) {
    blockers.push(`liveArmed must be true (${posture.liveArmed})`);
  }
  if (posture.emergencyStop !== AGREEMENT_GATES.emergencyStop) {
    blockers.push(`emergencyStop must be false (${posture.emergencyStop})`);
  }
  if (context.singletonLockValid !== true) blockers.push("singleton lock invalid");
  if (context.exactlyOneExecutorLoop !== true) blockers.push("duplicate executor loop detected");
  if (context.r8LimitsLoaded !== true) blockers.push("R8 risk limits not loaded");
  if (context.walletMonitorFresh !== true) blockers.push("wallet monitor stale");
  if (context.signerPresent !== true) blockers.push("signer not present");
  if (context.operatorApprovalPresent !== true) blockers.push("operator approval missing");
  return { ok: blockers.length === 0, blockers };
}

function createSignerSimulationHarness(options = {}) {
  return {
    walletAddress: SIMULATED_WALLET_ADDRESS,
    simulated: true,
    emergencyStop: options.emergencyStop === true,
    submittedTxIds: new Set(),
    signedTxIds: new Set(),
    events: [],
    outputDir: options.outputDir || DEFAULT_OUTPUT_DIR
  };
}

function recordEvent(harness, stage, payload = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    stage,
    simulated: true,
    walletAddress: harness.walletAddress,
    ...payload
  };
  harness.events.push(entry);
  return entry;
}

function fakeSign(harness, transaction, posture = {}, context = {}) {
  if (!transaction || transaction.simulated !== true) {
    throw Object.assign(new Error("malformed fake transaction"), { code: "SIM_TX_MALFORMED" });
  }
  const gates = checkAgreementGates(posture, context);
  if (!gates.ok) {
    throw Object.assign(new Error(`agreement gates blocked signing: ${gates.blockers.join("; ")}`), {
      code: "SIM_GATES_BLOCKED",
      blockers: gates.blockers
    });
  }
  if (harness.emergencyStop) {
    throw Object.assign(new Error("emergency stop blocks fake signing"), { code: "SIM_EMERGENCY_STOP" });
  }
  const signature = `${SIMULATED_SIGNATURE_PREFIX}${hashDeterministic(transaction.txId)}`;
  harness.signedTxIds.add(transaction.txId);
  recordEvent(harness, "FAKE_SIGN", { txId: transaction.txId, signaturePrefix: SIMULATED_SIGNATURE_PREFIX });
  return {
    txId: transaction.txId,
    signature,
    signerWallet: harness.walletAddress,
    simulated: true
  };
}

function fakeSubmit(harness, signedTx, posture = {}, context = {}) {
  if (!signedTx || signedTx.simulated !== true || !signedTx.signature) {
    throw Object.assign(new Error("malformed signed fake transaction"), { code: "SIM_SIGNED_TX_MALFORMED" });
  }
  const gates = checkAgreementGates(posture, context);
  if (!gates.ok) {
    throw Object.assign(new Error(`agreement gates blocked submit: ${gates.blockers.join("; ")}`), {
      code: "SIM_GATES_BLOCKED",
      blockers: gates.blockers
    });
  }
  if (harness.emergencyStop) {
    throw Object.assign(new Error("emergency stop blocks fake submit"), { code: "SIM_EMERGENCY_STOP" });
  }
  if (harness.submittedTxIds.has(signedTx.txId)) {
    throw Object.assign(new Error("duplicate fake submit blocked"), { code: "SIM_DUPLICATE_SUBMIT" });
  }
  harness.submittedTxIds.add(signedTx.txId);
  const submissionId = `sim-sub-${hashDeterministic(signedTx.signature)}`;
  recordEvent(harness, "FAKE_SUBMIT", { txId: signedTx.txId, submissionId });
  return {
    txId: signedTx.txId,
    submissionId,
    signature: signedTx.signature,
    networkSubmit: false,
    simulated: true,
    submittedAt: new Date().toISOString()
  };
}

function fakeConfirm(harness, submission, options = {}) {
  if (!submission || submission.simulated !== true) {
    throw Object.assign(new Error("malformed fake submission"), { code: "SIM_SUBMISSION_MALFORMED" });
  }
  if (options.fail === true) {
    recordEvent(harness, "FAKE_CONFIRM_FAIL", { txId: submission.txId });
    throw Object.assign(new Error("fake confirmation failed"), { code: "SIM_CONFIRM_FAIL" });
  }
  if (options.partial === true) {
    recordEvent(harness, "FAKE_PARTIAL_FAIL", { txId: submission.txId });
    return {
      txId: submission.txId,
      confirmed: false,
      partial: true,
      simulated: true,
      reason: "partial_failure_simulated"
    };
  }
  recordEvent(harness, "FAKE_CONFIRM", { txId: submission.txId, submissionId: submission.submissionId });
  return {
    txId: submission.txId,
    submissionId: submission.submissionId,
    confirmed: true,
    slot: options.slot || 123456789,
    simulated: true,
    confirmedAt: new Date().toISOString()
  };
}

function runFakeLifecycle(options = {}) {
  const harness = createSignerSimulationHarness(options);
  const posture = options.posture || {
    executionMode: "MICRO_LIVE",
    dryRunMode: false,
    liveArmed: true,
    emergencyStop: false
  };
  const context = {
    singletonLockValid: true,
    exactlyOneExecutorLoop: true,
    r8LimitsLoaded: true,
    walletMonitorFresh: true,
    signerPresent: true,
    operatorApprovalPresent: true,
    ...(options.context || {})
  };
  const intent = options.intent || {};
  const approval = options.approval || createOperatorApproval({
    tokenAddress: intent.tokenAddress,
    tradeSizeUsd: intent.amountUsd
  });

  if (!isApprovalValid(approval, intent.tokenAddress)) {
    throw Object.assign(new Error("operator approval invalid or expired"), { code: "SIM_APPROVAL_INVALID" });
  }

  const transaction = createFakeTransaction(intent);
  recordEvent(harness, "FAKE_CONSTRUCT", { txId: transaction.txId });
  recordEvent(harness, "OPERATOR_APPROVAL", {
    approvalId: approval.approvalId,
    tradeSizeUsd: approval.tradeSizeUsd,
    maxLossUsd: approval.maxLossUsd
  });

  const signed = fakeSign(harness, transaction, posture, context);
  const submitted = fakeSubmit(harness, signed, posture, context);
  const confirmed = fakeConfirm(harness, submitted, options.confirmOptions || {});

  return { harness, transaction, approval, signed, submitted, confirmed };
}

function writeSimulationOutput(harness, outputFile) {
  const target = outputFile || path.join(harness.outputDir, "signer_simulation_output.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const payload = {
    timestamp: new Date().toISOString(),
    simulated: true,
    walletAddress: harness.walletAddress,
    liveTradingApproved: false,
    networkSubmit: false,
    eventCount: harness.events.length,
    events: harness.events
  };
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
  return target;
}

if (require.main === module) {
  try {
    const result = runFakeLifecycle();
    const out = writeSimulationOutput(result.harness);
    console.log("[signer-sim] Fake signer lifecycle complete (simulation only)");
    console.log(`  wallet: ${SIMULATED_WALLET_ADDRESS}`);
    console.log(`  txId: ${result.transaction.txId}`);
    console.log(`  confirmed: ${result.confirmed.confirmed === true}`);
    console.log(`  output: ${out}`);
    console.log("  live trading approved: false");
  } catch (err) {
    console.error("[signer-sim] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  SIMULATED_WALLET_ADDRESS,
  SIMULATED_SIGNATURE_PREFIX,
  AGREEMENT_GATES,
  FAILURE_MODES,
  hashDeterministic,
  createFakeTransaction,
  createOperatorApproval,
  isApprovalValid,
  checkAgreementGates,
  createSignerSimulationHarness,
  fakeSign,
  fakeSubmit,
  fakeConfirm,
  runFakeLifecycle,
  writeSimulationOutput
};
