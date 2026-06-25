"use strict";

// recovery_service.js — Sprint 4 A2s
// Human-confirmed low-risk recovery plan/confirm flow with audit ledger.
// A2s uses simulated execution only — no process spawn/kill/shell/PID checks.

const crypto = require("crypto");
const fs = require("fs");

const recoveryAudit = require("./recovery_audit");
const {
  getAllowlistedAction,
  classifyActionId,
  findForbiddenInputKey,
  FORBIDDEN_ACTION_IDS
} = require("./recovery_allowlist");

const GENERIC_DENIED = "Recovery request denied.";
const GENERIC_BLOCKED = "Recovery request blocked.";

const FORBIDDEN_ACTION_META = Object.freeze({
  "restart-executor": { actionName: "Restart Executor", actionClass: "high-risk-recovery", riskLevel: "high" },
  "reset-after-panic": { actionName: "Reset After Panic", actionClass: "forbidden", riskLevel: "critical" },
  "clear-emergency-stop": { actionName: "Clear Emergency Stop", actionClass: "forbidden", riskLevel: "critical" },
  "enable-live-trading": { actionName: "Enable Live Trading", actionClass: "forbidden", riskLevel: "critical" }
});

function safeActor(body, fallback = "dashboard-operator") {
  if (body && typeof body.actor === "string" && body.actor.trim() !== "") {
    return body.actor.trim().slice(0, 120);
  }
  return fallback;
}

function safeReason(body) {
  if (body && typeof body.reason === "string" && body.reason.trim() !== "") {
    return body.reason.trim().slice(0, 500);
  }
  return null;
}

function validatePosture(posture) {
  const failures = [];
  if (!posture || typeof posture !== "object") {
    return { ok: false, failures: [{ label: "posture unavailable", ok: false }] };
  }
  if (posture.executionMode !== "PIPELINE_DRY_RUN") {
    failures.push({ label: "executionMode must be PIPELINE_DRY_RUN", ok: false });
  }
  if (posture.dryRunMode !== true) {
    failures.push({ label: "dryRunMode must be true", ok: false });
  }
  if (posture.liveArmed === true) {
    failures.push({ label: "liveArmed must be false", ok: false });
  }
  return { ok: failures.length === 0, failures };
}

function buildAuditBase(ctx) {
  return {
    actor: ctx.actor,
    authMethod: "dashboard_control_token",
    reason: ctx.reason || null,
    commandExecuted: null,
    precheckStatus: "unknown",
    precheckDetails: [],
    postcheckStatus: "unknown",
    postcheckDetails: [],
    error: null,
    liveArmedAtRequest: ctx.posture.liveArmed === true,
    executionModeAtRequest: ctx.posture.executionMode || "PIPELINE_DRY_RUN",
    dryRunModeAtRequest: ctx.posture.dryRunMode === true,
    emergencyStopAtRequest: ctx.posture.emergencyStop === true,
    sourceIpOrHost: ctx.sourceIpOrHost || "127.0.0.1",
    dashboardSessionId: null,
    relatedConfigAuditId: null,
    requiresReview: true
  };
}

function appendAuditRow(base, overrides = {}, auditAppend = recoveryAudit.appendRecoveryAuditEntry) {
  const entry = recoveryAudit.buildRecoveryAuditEntry({
    actionId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...base,
    ...overrides
  });
  const write = auditAppend(entry);
  return write.entry;
}

function readAuditRows() {
  const filePath = recoveryAudit.getRecoveryAuditFilePath();
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function isCooldownActive(actionMeta, nowMs = Date.now()) {
  const rows = readAuditRows();
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.targetProcess !== actionMeta.targetProcess) continue;
    if (row.result !== "executed") continue;
    if (!row.actionName || !String(row.actionName).includes(actionMeta.label)) continue;
    const ts = Date.parse(row.timestamp);
    if (!Number.isFinite(ts)) continue;
    if (nowMs - ts < actionMeta.cooldownMs) return true;
  }
  return false;
}

function runSharedPrechecks(ctx) {
  const failures = [];
  const forbiddenKey = findForbiddenInputKey(ctx.body, ctx.query);
  if (forbiddenKey) {
    failures.push({ label: "forbidden request field", detail: forbiddenKey, ok: false });
  }

  const classification = classifyActionId(ctx.actionId);
  if (classification === "forbidden" || classification === "unknown") {
    failures.push({ label: "actionId not allowlisted", ok: false });
  }

  const postureCheck = validatePosture(ctx.posture);
  if (!postureCheck.ok) failures.push(...postureCheck.failures);

  const action = getAllowlistedAction(ctx.actionId);
  if (action) {
    const targetState = ctx.getTargetState(action.heartbeatKey);
    if (targetState === "HEALTHY") {
      failures.push({ label: "target already HEALTHY", ok: false });
    } else if (!action.eligibleStates.includes(targetState)) {
      failures.push({ label: "target state not eligible", detail: targetState, ok: false });
    }
    if (isCooldownActive(action)) {
      failures.push({ label: "cooldown active", ok: false });
    }
  }

  return { failures, action, classification };
}

function metaForBlockedAction(actionId) {
  return FORBIDDEN_ACTION_META[actionId] || {
    actionName: actionId,
    actionClass: FORBIDDEN_ACTION_IDS.includes(actionId) ? "forbidden" : "low-risk-recovery",
    riskLevel: "medium"
  };
}

function blockedResponse(ctx, failures, classification, httpStatus = 400) {
  const meta = getAllowlistedAction(ctx.actionId) || metaForBlockedAction(ctx.actionId);
  const authResult = failures.some((f) => /auth/i.test(f.label || "")) ? "denied" : "blocked";
  let auditRow = null;
  try {
    auditRow = appendAuditRow(buildAuditBase(ctx), {
      actionClass: meta.actionClass,
      actionName: meta.actionName || meta.label || ctx.actionId,
      targetProcess: meta.targetProcess || meta.scriptName || null,
      requestedState: "HEALTHY",
      commandPreview: meta.commandPreview || null,
      result: authResult,
      reason: ctx.reason || "recovery request blocked by policy",
      precheckStatus: "fail",
      precheckDetails: failures,
      postcheckStatus: "skipped",
      postcheckDetails: [{ label: "not executed", ok: true }],
      riskLevel: meta.riskLevel || (classification === "forbidden" ? "critical" : "medium"),
      confirmationPhraseId: ctx.confirmationPhraseId,
      confirmationPhraseMatched: ctx.confirmationPhraseMatched
    }, ctx.auditAppend);
  } catch {
    /* audit failure on blocked path — still return safe generic response */
  }

  return {
    httpStatus,
    payload: {
      ok: false,
      result: authResult,
      actionId: ctx.actionId,
      message: GENERIC_BLOCKED,
      precheckStatus: "fail",
      precheckDetails: failures.map((f) => f.label || f.detail).filter(Boolean),
      auditWritten: !!auditRow
    }
  };
}

function performSimulatedRecoveryAction(actionMeta) {
  return {
    ok: true,
    mode: "simulated",
    message: `Simulated ${actionMeta.actionId} — no real process start (A2s execution-gated)`,
    commandPreview: actionMeta.commandPreview
  };
}

function planRecoveryAction(ctx) {
  ctx.body = ctx.body || {};
  ctx.query = ctx.query || {};
  ctx.actor = safeActor(ctx.body);
  ctx.reason = safeReason(ctx.body);

  const { failures, action, classification } = runSharedPrechecks(ctx);
  if (failures.length > 0) {
    return blockedResponse(ctx, failures, classification);
  }

  let plannedRow;
  try {
    plannedRow = appendAuditRow(buildAuditBase(ctx), {
      actionClass: action.actionClass,
      actionName: action.label,
      targetProcess: action.targetProcess,
      requestedState: "HEALTHY",
      commandPreview: action.commandPreview,
      result: "planned",
      precheckStatus: "pass",
      precheckDetails: [{ label: "plan prechecks", ok: true }],
      postcheckStatus: "skipped",
      postcheckDetails: [{ label: "plan only — no execution", ok: true }],
      riskLevel: action.riskLevel
    }, ctx.auditAppend);
  } catch {
    return {
      httpStatus: 500,
      payload: { ok: false, result: "blocked", actionId: ctx.actionId, message: GENERIC_BLOCKED }
    };
  }

  return {
    httpStatus: 200,
    payload: {
      ok: true,
      result: "planned",
      actionId: action.actionId,
      label: action.label,
      targetProcess: action.targetProcess,
      commandPreview: action.commandPreview,
      confirmationRequired: action.confirmationPhrase,
      confirmationInstructions: "POST /recovery/confirm/:actionId with exact confirmation phrase in JSON body.confirmation",
      executionMode: "simulated",
      precheckStatus: "pass",
      precheckDetails: ["plan prechecks"],
      auditActionId: plannedRow.actionId,
      message: "Recovery plan recorded. No action performed."
    }
  };
}

function confirmRecoveryAction(ctx) {
  ctx.body = ctx.body || {};
  ctx.query = ctx.query || {};
  ctx.actor = safeActor(ctx.body);
  ctx.reason = safeReason(ctx.body);

  const confirmation = typeof ctx.body.confirmation === "string" ? ctx.body.confirmation.trim() : "";
  ctx.confirmationPhraseMatched = undefined;
  ctx.confirmationPhraseId = undefined;

  const { failures, action, classification } = runSharedPrechecks(ctx);
  const confirmFailures = [...failures];

  if (!action) {
    return blockedResponse(ctx, confirmFailures, classification);
  }

  if (!confirmation) {
    confirmFailures.push({ label: "confirmation missing", ok: false });
  } else if (confirmation !== action.confirmationPhrase) {
    confirmFailures.push({ label: "confirmation mismatch", ok: false });
  }

  if (confirmFailures.length > 0) {
    ctx.confirmationPhraseId = action.actionId;
    ctx.confirmationPhraseMatched = confirmation === action.confirmationPhrase;
    return blockedResponse(ctx, confirmFailures, classification);
  }

  ctx.confirmationPhraseId = action.actionId;
  ctx.confirmationPhraseMatched = true;

  const correlationId = crypto.randomUUID();
  let plannedRow;
  try {
    plannedRow = appendAuditRow(buildAuditBase(ctx), {
      actionId: correlationId,
      actionClass: action.actionClass,
      actionName: action.label,
      targetProcess: action.targetProcess,
      requestedState: "HEALTHY",
      commandPreview: action.commandPreview,
      result: "planned",
      precheckStatus: "pass",
      precheckDetails: [{ label: "confirm prechecks", ok: true }],
      postcheckStatus: "skipped",
      postcheckDetails: [{ label: "awaiting simulated execution", ok: true }],
      riskLevel: action.riskLevel,
      confirmationPhraseId: action.actionId,
      confirmationPhraseMatched: true
    }, ctx.auditAppend);
  } catch {
    return {
      httpStatus: 500,
      payload: { ok: false, result: "blocked", actionId: ctx.actionId, message: GENERIC_BLOCKED }
    };
  }

  const execution = performSimulatedRecoveryAction(action);

  const executedRow = appendAuditRow(buildAuditBase(ctx), {
    actionClass: action.actionClass,
    actionName: action.label,
    targetProcess: action.targetProcess,
    requestedState: "HEALTHY",
    commandPreview: action.commandPreview,
    commandExecuted: action.commandPreview,
    result: "executed",
    relatedConfigAuditId: correlationId,
    precheckStatus: "pass",
    precheckDetails: [{ label: "confirm prechecks", ok: true }],
    postcheckStatus: "unknown",
    postcheckDetails: [{ label: "awaiting postcheck", ok: true }],
    riskLevel: action.riskLevel,
    confirmationPhraseId: action.actionId,
    confirmationPhraseMatched: true
  }, ctx.auditAppend);

  const postcheckRow = appendAuditRow(buildAuditBase(ctx), {
    actionClass: action.actionClass,
    actionName: `${action.label} (postcheck)`,
    targetProcess: action.targetProcess,
    requestedState: "HEALTHY",
    commandPreview: action.commandPreview,
    result: "executed",
    relatedConfigAuditId: correlationId,
    precheckStatus: "pass",
    precheckDetails: [{ label: "confirm prechecks", ok: true }],
    postcheckStatus: "pass",
    postcheckDetails: [
      { label: "simulated execution recorded", ok: true },
      { label: "no real process start", ok: true }
    ],
    riskLevel: action.riskLevel,
    confirmationPhraseId: action.actionId,
    confirmationPhraseMatched: true
  }, ctx.auditAppend);

  return {
    httpStatus: 200,
    payload: {
      ok: true,
      result: "executed",
      actionId: action.actionId,
      label: action.label,
      targetProcess: action.targetProcess,
      commandPreview: action.commandPreview,
      executionMode: execution.mode,
      message: execution.message,
      precheckStatus: "pass",
      postcheckStatus: "pass",
      auditActionIds: [plannedRow.actionId, executedRow.actionId, postcheckRow.actionId],
      note: "A2s simulated execution — no real process restart performed"
    }
  };
}

module.exports = {
  GENERIC_DENIED,
  GENERIC_BLOCKED,
  planRecoveryAction,
  confirmRecoveryAction,
  performSimulatedRecoveryAction,
  validatePosture,
  findForbiddenInputKey
};
