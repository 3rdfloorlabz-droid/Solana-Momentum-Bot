"use strict";

// recovery_allowlist.js — Sprint 4 A2s
// Fixed server-side allowlist for human-confirmed low-risk recovery routes.
// No client-supplied commands. Executor / panic / live actions remain forbidden.

const ALLOWED_RECOVERY_ACTIONS = Object.freeze({
  "restart-scanner": {
    actionId: "restart-scanner",
    label: "Restart Scanner",
    targetProcess: "scanner",
    heartbeatKey: "scanner",
    scriptName: "scanner_gmgn_trending.js",
    commandPreview: "node scanner_gmgn_trending.js --watch",
    actionClass: "low-risk-recovery",
    riskLevel: "low",
    confirmationPhrase: "RESTART SCANNER IN DRY RUN",
    eligibleStates: Object.freeze(["STALE", "MISSING", "NO DATA", "FAILED"]),
    cooldownMs: 5 * 60 * 1000
  },
  "restart-paper-monitor": {
    actionId: "restart-paper-monitor",
    label: "Restart Paper Monitor",
    targetProcess: "paper-monitor",
    heartbeatKey: "paper_monitor",
    scriptName: "monitor.js",
    commandPreview: "node monitor.js",
    actionClass: "low-risk-recovery",
    riskLevel: "low",
    confirmationPhrase: "RESTART PAPER MONITOR IN DRY RUN",
    eligibleStates: Object.freeze(["STALE", "MISSING", "NO DATA", "FAILED"]),
    cooldownMs: 5 * 60 * 1000
  },
  "restart-wallet-monitor": {
    actionId: "restart-wallet-monitor",
    label: "Restart Wallet Monitor",
    targetProcess: "wallet-monitor",
    heartbeatKey: "wallet_monitor",
    scriptName: "wallet_monitor.js",
    commandPreview: "node wallet_monitor.js",
    actionClass: "low-risk-recovery",
    riskLevel: "low",
    confirmationPhrase: "RESTART WALLET MONITOR IN DRY RUN",
    eligibleStates: Object.freeze(["STALE", "MISSING", "NO DATA", "FAILED"]),
    cooldownMs: 5 * 60 * 1000
  },
  "restart-dashboard": {
    actionId: "restart-dashboard",
    label: "Restart Dashboard",
    targetProcess: "dashboard",
    heartbeatKey: "dashboard",
    scriptName: "dashboard_server.js",
    commandPreview: "node dashboard_server.js",
    actionClass: "low-risk-recovery",
    riskLevel: "low",
    confirmationPhrase: "RESTART DASHBOARD IN DRY RUN",
    eligibleStates: Object.freeze(["STALE", "MISSING", "NO DATA", "FAILED"]),
    cooldownMs: 5 * 60 * 1000
  }
});

const FORBIDDEN_ACTION_IDS = Object.freeze([
  "restart-executor",
  "reset-after-panic",
  "clear-emergency-stop",
  "enable-live-trading",
  "arbitrary-command",
  "run-arbitrary-command"
]);

const FORBIDDEN_INPUT_KEYS = Object.freeze([
  "command",
  "cmd",
  "shell",
  "args",
  "actioncommand",
  "privatekey",
  "signer",
  "secret",
  "token"
]);

function getAllowlistedAction(actionId) {
  if (typeof actionId !== "string") return null;
  return ALLOWED_RECOVERY_ACTIONS[actionId.trim()] || null;
}

function isForbiddenActionId(actionId) {
  if (typeof actionId !== "string") return true;
  const id = actionId.trim();
  if (FORBIDDEN_ACTION_IDS.includes(id)) return true;
  return /arbitrary|shell|command|execute|live-trading|panic|emergency-stop|executor/i.test(id);
}

function classifyActionId(actionId) {
  if (getAllowlistedAction(actionId)) return "allowed";
  if (isForbiddenActionId(actionId)) return "forbidden";
  return "unknown";
}

function findForbiddenInputKey(body = {}, query = {}) {
  for (const source of [body, query]) {
    if (!source || typeof source !== "object") continue;
    for (const key of Object.keys(source)) {
      if (FORBIDDEN_INPUT_KEYS.includes(String(key).toLowerCase())) return key;
    }
  }
  return null;
}

module.exports = {
  ALLOWED_RECOVERY_ACTIONS,
  FORBIDDEN_ACTION_IDS,
  FORBIDDEN_INPUT_KEYS,
  getAllowlistedAction,
  isForbiddenActionId,
  classifyActionId,
  findForbiddenInputKey
};
