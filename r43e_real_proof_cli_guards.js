"use strict";

// r43e_real_proof_cli_guards.js — shared R43E CLI flag validation (no harness/deps imports).

function parseCliArgs(argv = process.argv.slice(2)) {
  return {
    simulate: argv.includes("--simulate"),
    executeRealProof: argv.includes("--execute-real-proof"),
    humanPresent: argv.includes("--human-present"),
    confirmOneTransactionProof: argv.includes("--confirm-one-transaction-proof"),
    finalBroadcastConfirmation: argv.includes("--final-broadcast-confirmation")
  };
}

function validateCliFlags(cli = {}) {
  const blockers = [];
  if (cli.executeRealProof === true) {
    blockers.push("real proof path requires --execute-real-proof handler; do not combine with simulation-only flags");
    return { ok: false, blockers };
  }
  if (cli.simulate !== true) {
    blockers.push("--simulate required for R43E proof harness (SIMULATION_ONLY)");
  }
  if (cli.humanPresent !== true) {
    blockers.push("--human-present required");
  }
  if (cli.confirmOneTransactionProof !== true) {
    blockers.push("--confirm-one-transaction-proof required");
  }
  return { ok: blockers.length === 0, blockers };
}

function validateRealProofCli(cli = {}) {
  const blockers = [];
  if (cli.executeRealProof !== true) {
    blockers.push("--execute-real-proof required for real proof path");
  }
  if (cli.simulate === true) {
    blockers.push("--simulate cannot be combined with --execute-real-proof");
  }
  if (cli.humanPresent !== true) {
    blockers.push("--human-present required");
  }
  if (cli.confirmOneTransactionProof !== true) {
    blockers.push("--confirm-one-transaction-proof required");
  }
  return { ok: blockers.length === 0, blockers };
}

function validateRealProofBroadcastCli(cli = {}) {
  const base = validateRealProofCli(cli);
  if (!base.ok) return base;
  if (cli.finalBroadcastConfirmation !== true) {
    return { ok: false, blockers: ["--final-broadcast-confirmation required for broadcast attempt"] };
  }
  return { ok: true, blockers: [] };
}

module.exports = {
  parseCliArgs,
  validateCliFlags,
  validateRealProofCli,
  validateRealProofBroadcastCli
};
