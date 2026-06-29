"use strict";

// r43e_proof_config.js — shared proof target/caps validation (no harness/deps imports).

const fs = require("fs");
const path = require("path");
const r43b = require("./r43b_operator_caps_approval_check");

const TARGET_CONFIG_REL = "operator_records/r43e_real_proof_target.json";
const EXAMPLE_TARGET_REL = "examples/r43e_real_proof_target.example.json";
const PLACEHOLDER_OUTPUT_MINT = "PLACEHOLDER_TARGET_TOKEN_MINT";
const PROOF_SCOPE = "one-transaction engineering proof only";
const MAX_TRADE_SIZE_SOL = 0.01;
const SIMULATION_VERDICT_COMPLETED = "R43E_SIMULATION_COMPLETED";

function validateProofScopeCaps(caps) {
  const errors = [];
  if (!caps || typeof caps !== "object") {
    return { ok: false, errors: ["caps missing"] };
  }
  if (caps.approved !== true) errors.push("caps not approved");
  if (caps.approvalScope !== r43b.REQUIRED_APPROVAL_SCOPE) {
    errors.push("approvalScope must be one-transaction micro-live engineering proof only");
  }
  if (!Number.isFinite(Number(caps.maxTradeSizeSol)) || Number(caps.maxTradeSizeSol) > MAX_TRADE_SIZE_SOL) {
    errors.push(`maxTradeSizeSol must be <= ${MAX_TRADE_SIZE_SOL}`);
  }
  if (!Number.isFinite(Number(caps.maxDailyLossSol)) || Number(caps.maxDailyLossSol) > 0.05) {
    errors.push("maxDailyLossSol must be <= 0.05");
  }
  if (Number(caps.maxTradesPerSession) !== 1) errors.push("maxTradesPerSession must be 1");
  if (Number(caps.maxOpenLivePositions) !== 1) errors.push("maxOpenLivePositions must be 1");
  if (caps.autoCompoundingAllowed !== false) errors.push("autoCompoundingAllowed must be false");
  if (caps.stopAfterFirstTransaction !== true) errors.push("stopAfterFirstTransaction must be true");
  return { ok: errors.length === 0, errors };
}

function loadProofTargetConfig(repoRoot, options = {}) {
  if (options.proofTargetLoad !== undefined) {
    return options.proofTargetLoad;
  }
  const file = path.join(repoRoot, TARGET_CONFIG_REL);
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

function validateProofTarget(target) {
  const errors = [];
  if (!target || typeof target !== "object") {
    return { ok: false, errors: ["proof target missing"] };
  }
  if (target.configType !== "R43E_REAL_PROOF_TARGET") {
    errors.push("configType must be R43E_REAL_PROOF_TARGET");
  }
  if (target.purpose !== PROOF_SCOPE) {
    errors.push(`purpose must be "${PROOF_SCOPE}"`);
  }
  if (!Number.isFinite(Number(target.amountSol)) || Number(target.amountSol) > MAX_TRADE_SIZE_SOL) {
    errors.push(`amountSol must be <= ${MAX_TRADE_SIZE_SOL}`);
  }
  if (!Number.isFinite(Number(target.maxTradeSizeSol)) || Number(target.maxTradeSizeSol) > MAX_TRADE_SIZE_SOL) {
    errors.push(`maxTradeSizeSol must be <= ${MAX_TRADE_SIZE_SOL}`);
  }
  if (target.stopAfterFirstTransaction !== true) {
    errors.push("stopAfterFirstTransaction must be true");
  }
  if (target.autoCompoundingAllowed === true) {
    errors.push("autoCompoundingAllowed must be false");
  }
  if (!target.inputMint || typeof target.inputMint !== "string") {
    errors.push("inputMint required");
  }
  if (!target.outputMint || typeof target.outputMint !== "string") {
    errors.push("outputMint required");
  }
  if (target.outputMint === PLACEHOLDER_OUTPUT_MINT || /PLACEHOLDER/i.test(target.outputMint)) {
    errors.push("outputMint must not be a placeholder");
  }
  if (target.routeProvider !== "jupiter") {
    errors.push("routeProvider must be jupiter for isolated proof path");
  }
  return { ok: errors.length === 0, errors };
}

function summarizeProofTarget(target) {
  if (!target) return null;
  return {
    configType: target.configType || null,
    purpose: target.purpose || null,
    inputMint: target.inputMint || null,
    outputMint: target.outputMint || null,
    amountSol: target.amountSol,
    slippageBps: target.slippageBps,
    routeProvider: target.routeProvider || null,
    maxTradeSizeSol: target.maxTradeSizeSol,
    stopAfterFirstTransaction: target.stopAfterFirstTransaction === true
  };
}

module.exports = {
  TARGET_CONFIG_REL,
  EXAMPLE_TARGET_REL,
  PLACEHOLDER_OUTPUT_MINT,
  PROOF_SCOPE,
  MAX_TRADE_SIZE_SOL,
  SIMULATION_VERDICT_COMPLETED,
  validateProofScopeCaps,
  loadProofTargetConfig,
  validateProofTarget,
  summarizeProofTarget
};
