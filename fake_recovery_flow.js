"use strict";

// fake_recovery_flow.js — Sprint 4 A2r (test-only)
// Simulates the future human-confirmed low-risk recovery lifecycle using
// fake_recovery_harness.js and recovery_audit.js under a temp runtime root.
//
// Does NOT import dashboard_server.js, spawn/kill processes, execute shell
// commands, mutate live_config.json, or authorize real recovery execution.

const crypto = require("crypto");
const path = require("path");

const {
  ALLOWED_ACTION_IDS,
  BLOCKED_UNSUPPORTED_ACTION_IDS,
  FORBIDDEN_ACTION_IDS,
  ACTION_TO_PROCESS,
  getFakeProcessState,
  simulateRecoveryAction
} = require("./fake_recovery_harness");

const LOW_RISK_ACTION_CATALOG = Object.freeze({
  "restart-scanner": {
    actionId: "restart-scanner",
    actionName: "Restart Scanner",
    actionClass: "low-risk-recovery",
    processId: "scanner",
    targetProcess: "scanner_gmgn_trending.js",
    commandPreview: "node scanner_gmgn_trending.js --watch",
    riskLevel: "low",
    confirmationPhraseId: "RESTART_SCANNER_DRY_RUN"
  },
  "restart-paper-monitor": {
    actionId: "restart-paper-monitor",
    actionName: "Restart Paper Monitor",
    actionClass: "low-risk-recovery",
    processId: "paper-monitor",
    targetProcess: "monitor.js",
    commandPreview: "node monitor.js",
    riskLevel: "low",
    confirmationPhraseId: "RESTART_PAPER_MONITOR_DRY_RUN"
  },
  "restart-wallet-monitor": {
    actionId: "restart-wallet-monitor",
    actionName: "Restart Wallet Monitor",
    actionClass: "low-risk-recovery",
    processId: "wallet-monitor",
    targetProcess: "wallet_monitor.js",
    commandPreview: "node wallet_monitor.js",
    riskLevel: "low",
    confirmationPhraseId: "RESTART_WALLET_MONITOR_DRY_RUN"
  },
  "restart-dashboard": {
    actionId: "restart-dashboard",
    actionName: "Restart Dashboard",
    actionClass: "low-risk-recovery",
    processId: "dashboard",
    targetProcess: "dashboard_server.js",
    commandPreview: "node dashboard_server.js",
    riskLevel: "low",
    confirmationPhraseId: "RESTART_DASHBOARD_DRY_RUN"
  }
});

const HIGH_RISK_BLOCKED_ACTIONS = Object.freeze({
  "restart-executor": {
    actionName: "Restart Executor",
    actionClass: "high-risk-recovery",
    riskLevel: "high"
  },
  "reset-after-panic": {
    actionName: "Reset After Panic",
    actionClass: "forbidden",
    riskLevel: "critical"
  },
  "clear-emergency-stop": {
    actionName: "Clear Emergency Stop",
    actionClass: "forbidden",
    riskLevel: "critical"
  }
});

const FORBIDDEN_ACTION_META = Object.freeze({
  "enable-live-trading": {
    actionName: "Enable Live Trading",
    actionClass: "forbidden",
    riskLevel: "critical"
  }
});

const CLIENT_COMMAND_FIELDS = ["command", "cmd", "shell", "args"];

function loadRecoveryAuditModule(runtimeRoot) {
  if (runtimeRoot) process.env.TRACKTA_RUNTIME_ROOT = runtimeRoot;
  delete require.cache[require.resolve("./recovery_audit.js")];
  return require("./recovery_audit.js");
}

function normalizePosture(posture = {}) {
  return {
    executionMode: posture.executionMode ?? "PIPELINE_DRY_RUN",
    dryRunMode: posture.dryRunMode !== false,
    liveArmed: posture.liveArmed === true,
    emergencyStop: posture.emergencyStop === true
  };
}

function classifyActionId(actionId) {
  if (LOW_RISK_ACTION_CATALOG[actionId]) return "allowed";
  if (FORBIDDEN_ACTION_META[actionId] || FORBIDDEN_ACTION_IDS.includes(actionId)) return "forbidden";
  if (HIGH_RISK_BLOCKED_ACTIONS[actionId] || BLOCKED_UNSUPPORTED_ACTION_IDS.includes(actionId)) {
    return "blocked";
  }
  if (/arbitrary|shell|command|execute|live-trading|panic|emergency-stop/i.test(actionId)) {
    return "forbidden";
  }
  return "blocked";
}

function buildBaseAuditFields(options, meta = {}) {
  const posture = normalizePosture(options.posture);
  return {
    actor: options.actor,
    authMethod: options.authMethod,
    actionClass: meta.actionClass || "low-risk-recovery",
    actionName: meta.actionName || null,
    targetProcess: meta.targetProcess || null,
    requestedState: "HEALTHY",
    reason: options.reason || null,
    commandPreview: meta.commandPreview || null,
    commandExecuted: null,
    precheckStatus: "unknown",
    precheckDetails: [],
    postcheckStatus: "unknown",
    postcheckDetails: [],
    error: null,
    liveArmedAtRequest: posture.liveArmed,
    executionModeAtRequest: posture.executionMode,
    dryRunModeAtRequest: posture.dryRunMode,
    emergencyStopAtRequest: posture.emergencyStop,
    confirmationPhraseId: options.confirmationPhraseId,
    confirmationPhraseMatched: options.confirmationPhraseMatched,
    confirmationPhrase: options.confirmationPhrase,
    sourceIpOrHost: options.sourceIpOrHost || "127.0.0.1",
    dashboardSessionId: options.dashboardSessionId || null,
    relatedConfigAuditId: options.relatedConfigAuditId || null,
    requiresReview: true,
    riskLevel: meta.riskLevel || "low"
  };
}

function appendAuditRow(audit, auditAppend, baseFields, overrides, auditRows) {
  const entry = audit.buildRecoveryAuditEntry({
    actionId: crypto.randomUUID(),
    ...baseFields,
    ...overrides
  });
  const write = auditAppend(entry);
  auditRows.push(write.entry);
  return write;
}

function runPrechecks(options) {
  const failures = [];
  const posture = normalizePosture(options.posture);

  for (const field of CLIENT_COMMAND_FIELDS) {
    if (options[field] !== undefined && options[field] !== null) {
      failures.push({ label: "client command field rejected", detail: field, ok: false });
    }
  }

  if (!options.actor || typeof options.actor !== "string" || options.actor.trim() === "") {
    failures.push({ label: "auth actor missing", ok: false });
  }
  if (!options.authMethod || options.authMethod === "none") {
    failures.push({ label: "auth method missing or none", ok: false });
  }

  if (options.safetySuiteStatus && options.safetySuiteStatus !== "green") {
    failures.push({ label: "safety suite not green", ok: false });
  }

  if (posture.executionMode !== "PIPELINE_DRY_RUN") {
    failures.push({ label: "executionMode must be PIPELINE_DRY_RUN", ok: false });
  }
  if (!posture.dryRunMode) {
    failures.push({ label: "dryRunMode must be true", ok: false });
  }
  if (posture.liveArmed) {
    failures.push({ label: "liveArmed must be false", ok: false });
  }

  const classification = classifyActionId(options.actionId);
  if (classification === "forbidden") {
    failures.push({ label: "forbidden actionId", ok: false });
  } else if (classification === "blocked") {
    failures.push({ label: "unsupported or high-risk actionId", ok: false });
  }

  if (options.requireTypedConfirmation !== false) {
    if (!options.confirmationPhraseId) {
      failures.push({ label: "confirmationPhraseId missing", ok: false });
    } else if (options.confirmationPhraseMatched !== true) {
      failures.push({ label: "confirmation phrase not matched", ok: false });
    } else {
      const meta = LOW_RISK_ACTION_CATALOG[options.actionId];
      if (meta && options.confirmationPhraseId !== meta.confirmationPhraseId) {
        failures.push({ label: "confirmationPhraseId mismatch", ok: false });
      }
    }
  }

  const meta = LOW_RISK_ACTION_CATALOG[options.actionId];
  if (meta && options.fakeHarness) {
    const proc = getFakeProcessState(options.fakeHarness, meta.processId);
    if (proc.state === "HEALTHY") {
      failures.push({ label: "target already HEALTHY", ok: false });
    }
  }

  if (options.cooldownState && options.cooldownState.inCooldown === true) {
    failures.push({ label: "cooldown active", ok: false });
  }

  return {
    ok: failures.length === 0,
    failures,
    classification,
    meta,
    posture
  };
}

function simulateHumanConfirmedRecoveryFlow(options = {}) {
  if (!options.fakeHarness) {
    throw new Error("fakeHarness is required");
  }
  if (!options.runtimeRoot) {
    throw new Error("runtimeRoot is required");
  }

  const audit = loadRecoveryAuditModule(options.runtimeRoot);
  const auditAppend = (entry) => {
    if (options.auditAppendShouldFail) {
      throw new Error(options.auditAppendFailureMessage || "recovery audit append failed");
    }
    if (typeof options.auditAppendFn === "function") {
      return options.auditAppendFn(entry);
    }
    return audit.appendRecoveryAuditEntry(entry);
  };

  const auditRows = [];
  const actionMeta =
    LOW_RISK_ACTION_CATALOG[options.actionId] ||
    HIGH_RISK_BLOCKED_ACTIONS[options.actionId] ||
    FORBIDDEN_ACTION_META[options.actionId] ||
    {};

  const precheck = runPrechecks(options);
  const baseFields = buildBaseAuditFields(options, actionMeta);

  if (!precheck.ok) {
    const result = precheck.classification === "forbidden" ? "blocked" : "blocked";
    const authResult = (!options.actor || options.authMethod === "none") ? "denied" : result;
    appendAuditRow(audit, auditAppend, baseFields, {
      actionId: crypto.randomUUID(),
      result: authResult,
      precheckStatus: "fail",
      precheckDetails: precheck.failures,
      postcheckStatus: "skipped",
      postcheckDetails: [{ label: "not executed", ok: true }],
      actionClass: actionMeta.actionClass || (precheck.classification === "forbidden" ? "forbidden" : "low-risk-recovery"),
      actionName: actionMeta.actionName || options.actionId,
      riskLevel: actionMeta.riskLevel || (precheck.classification === "forbidden" ? "critical" : "medium")
    }, auditRows);

    return {
      ok: false,
      phase: "precheck",
      actionId: options.actionId,
      result: authResult,
      auditRows,
      harnessOutcome: null,
      blockReason: precheck.failures.map((f) => f.label || f.detail).join("; ")
    };
  }

  const meta = precheck.meta;
  const correlationId = crypto.randomUUID();

  try {
    appendAuditRow(audit, auditAppend, baseFields, {
      actionId: correlationId,
      result: "planned",
      precheckStatus: "pass",
      precheckDetails: [{ label: "global and action prechecks", ok: true }],
      postcheckStatus: "skipped",
      postcheckDetails: [{ label: "awaiting fake execution", ok: true }],
      actionClass: meta.actionClass,
      actionName: meta.actionName,
      targetProcess: meta.targetProcess,
      commandPreview: meta.commandPreview,
      riskLevel: meta.riskLevel
    }, auditRows);
  } catch (err) {
    return {
      ok: false,
      phase: "audit",
      actionId: options.actionId,
      result: "blocked",
      auditRows,
      harnessOutcome: null,
      auditFailure: true,
      blockReason: err.message
    };
  }

  const beforeCounts = Object.fromEntries(
    Object.keys(options.fakeHarness.processes).map((id) => [
      id,
      options.fakeHarness.processes[id].restartCount
    ])
  );

  const harnessOutcome = simulateRecoveryAction(options.fakeHarness, options.actionId);
  if (harnessOutcome.result !== "executed") {
    appendAuditRow(audit, auditAppend, baseFields, {
      result: "blocked",
      relatedConfigAuditId: correlationId,
      precheckStatus: "pass",
      precheckDetails: [{ label: "planned prechecks", ok: true }],
      postcheckStatus: "skipped",
      postcheckDetails: [{ label: "fake harness blocked execution", ok: false, detail: harnessOutcome.message }],
      actionClass: meta.actionClass,
      actionName: meta.actionName,
      targetProcess: meta.targetProcess,
      commandPreview: meta.commandPreview,
      error: harnessOutcome.message,
      riskLevel: meta.riskLevel
    }, auditRows);

    return {
      ok: false,
      phase: "execution",
      actionId: options.actionId,
      result: "blocked",
      auditRows,
      harnessOutcome,
      blockReason: harnessOutcome.message,
      restartCounts: beforeCounts
    };
  }

  appendAuditRow(audit, auditAppend, baseFields, {
    result: "executed",
    relatedConfigAuditId: correlationId,
    precheckStatus: "pass",
    precheckDetails: [{ label: "planned prechecks", ok: true }],
    postcheckStatus: "unknown",
    postcheckDetails: [{ label: "awaiting postcheck", ok: true }],
    actionClass: meta.actionClass,
    actionName: meta.actionName,
    targetProcess: meta.targetProcess,
    commandPreview: meta.commandPreview,
    commandExecuted: meta.commandPreview,
    riskLevel: meta.riskLevel
  }, auditRows);

  const afterProc = getFakeProcessState(options.fakeHarness, meta.processId);
  const postcheckPass = afterProc.state === "HEALTHY" && !!afterProc.heartbeatAt;
  if (!postcheckPass) {
    appendAuditRow(audit, auditAppend, baseFields, {
      result: "postcheck_failed",
      relatedConfigAuditId: correlationId,
      precheckStatus: "pass",
      precheckDetails: [{ label: "planned prechecks", ok: true }],
      postcheckStatus: "fail",
      postcheckDetails: [{ label: "fake heartbeat/state postcheck", ok: false }],
      actionClass: meta.actionClass,
      actionName: `${meta.actionName} (postcheck)`,
      targetProcess: meta.targetProcess,
      commandPreview: meta.commandPreview,
      error: "Fake postcheck failed",
      riskLevel: meta.riskLevel
    }, auditRows);

    return {
      ok: false,
      phase: "postcheck",
      actionId: options.actionId,
      result: "postcheck_failed",
      auditRows,
      harnessOutcome,
      blockReason: "Fake postcheck failed"
    };
  }

  appendAuditRow(audit, auditAppend, baseFields, {
    result: "executed",
    relatedConfigAuditId: correlationId,
    precheckStatus: "pass",
    precheckDetails: [{ label: "planned prechecks", ok: true }],
    postcheckStatus: "pass",
    postcheckDetails: [
      { label: "fake process HEALTHY", ok: true },
      { label: "fake heartbeat refreshed", ok: true }
    ],
    actionClass: meta.actionClass,
    actionName: `${meta.actionName} (postcheck)`,
    targetProcess: meta.targetProcess,
    commandPreview: meta.commandPreview,
    riskLevel: meta.riskLevel
  }, auditRows);

  return {
    ok: true,
    phase: "complete",
    actionId: options.actionId,
    result: "executed",
    correlationId,
    auditRows,
    harnessOutcome,
    targetProcess: meta.processId,
    restartCounts: Object.fromEntries(
      Object.keys(options.fakeHarness.processes).map((id) => [
        id,
        options.fakeHarness.processes[id].restartCount
      ])
    )
  };
}

module.exports = {
  LOW_RISK_ACTION_CATALOG,
  HIGH_RISK_BLOCKED_ACTIONS,
  FORBIDDEN_ACTION_META,
  simulateHumanConfirmedRecoveryFlow,
  classifyActionId,
  normalizePosture
};
