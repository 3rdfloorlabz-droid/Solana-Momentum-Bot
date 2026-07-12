"use strict";

const fs = require("fs");
const path = require("path");
const common = require("./live_validation_common");
const timing = require("./armed_continuum_timing");
const g1Validator = require("./armed_g1_proof_day");
const events = require("./armed_continuum_events");
const rollback = require("./armed_continuum_rollback");
const receiptMod = require("./armed_continuum_receipt");
const stateMod = require("./armed_continuum_state");
const session = require("./armed_preflight_session");

const FORBIDDEN_REQUIRE_PATHS = Object.freeze([
  "./local_signer",
  "./local_signer.js",
  "./signer_provider",
  "./signer_provider.js",
  "./jupiter_swap_client",
  "./jupiter_swap_client.js",
  "./r43e_one_transaction_proof_harness",
  "./r43e_one_transaction_proof_harness.js",
  "./scanner_v3",
  "./scanner_v3.js",
  "./scanner",
  "./scanner.js"
]);

const continuumRunRegistry = new Set();

function buildRunKey(cli) {
  return `${cli.sessionId}:${cli.continuumRunId}`;
}

function recordEnforcementViolation(deps, code, metadata = {}) {
  if (!deps.enforcementViolations) deps.enforcementViolations = [];
  deps.enforcementViolations.push({ code, ...metadata });
}

function enforceMonotonicCheckpoint(cli, deps, label, options = {}) {
  // Forward-jump disposition (DECISION — RB-G9 Armed Continuum Remediation
  // Acceptance — 2026-07-11 §9 item 4): detectMonotonicAnomaly() already
  // supports maxForwardJumpMs, but no orchestrator checkpoint ever supplied
  // one, so an impossible forward jump (VM pause/resume, NTP step, manual
  // clock change) between two adjacent checkpoints went uncaught alongside
  // the already-enforced backward-regression case. Default every checkpoint
  // to the full armed cap: no legitimate gap between two adjacent
  // orchestrator checkpoints should ever consume an entire 15-minute armed
  // window in one jump. Explicit per-call options still take precedence.
  const effectiveOptions = { maxForwardJumpMs: timing.ARMED_CAP_MS, ...options };
  const anomaly = timing.detectMonotonicAnomaly(deps.transitionMarks.lastMono, deps.clock, effectiveOptions);
  if (!anomaly.ok) {
    appendEvent(cli, deps, deps.currentState, stateMod.FAIL_CLASSES.MONOTONIC_TIMER_ANOMALY, "AUTO", {
      label,
      detail: anomaly.detail || anomaly.reason,
      reason: anomaly.reason
    });
    const err = Object.assign(
      new Error(anomaly.detail || anomaly.reason || "monotonic anomaly"),
      { failClass: stateMod.FAIL_CLASSES.MONOTONIC_TIMER_ANOMALY }
    );
    throw err;
  }
  deps.transitionMarks.lastMono = anomaly.nowMono || timing.readMonotonicNs(deps.clock);
  return anomaly;
}

function transitionToState(cli, deps, fromState, toState, reasonCode, transitionMode, metadata = {}) {
  const legal = stateMod.assertLegalTransition(fromState, toState);
  if (!legal.ok) {
    appendEvent(cli, deps, fromState, stateMod.FAIL_CLASSES.ILLEGAL_STATE_TRANSITION, transitionMode, {
      toState,
      reason: legal.reason
    });
    const err = Object.assign(new Error(legal.reason || "illegal transition"), {
      failClass: stateMod.FAIL_CLASSES.ILLEGAL_STATE_TRANSITION
    });
    throw err;
  }
  deps.currentState = toState;
  return appendEvent(cli, deps, toState, reasonCode, transitionMode, metadata);
}

function applyEnforcementViolations(deps, exitCode, failClass) {
  let nextExit = exitCode;
  let nextFail = failClass;
  for (const violation of deps.enforcementViolations || []) {
    if (nextExit === stateMod.EXIT_CODES.PASS) {
      nextExit = stateMod.mapFailureToExit(violation.code);
      nextFail = violation.code;
    }
  }
  return { exitCode: nextExit, failClass: nextFail };
}

function verifyNoSubmitImportBoundary(rootDir = __dirname) {
  const target = path.join(rootDir, "run_armed_continuum.js");
  const src = fs.readFileSync(target, "utf8");
  const requireLines = src.split(/\r?\n/).filter(line => /require\s*\(/.test(line));
  const requireText = requireLines.join("\n");
  const violations = [];
  for (const forbidden of FORBIDDEN_REQUIRE_PATHS) {
    const pattern = new RegExp(`require\\(["']${forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']\\)`);
    if (pattern.test(requireText)) violations.push(forbidden);
  }
  if (/submitSwap|sendRawTransaction|sendTransaction/.test(requireText)) {
    violations.push("submit_or_broadcast_symbol");
  }
  return { ok: violations.length === 0, violations, checkedFile: target };
}

function parseCli(argv = process.argv.slice(2)) {
  const get = flag => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : null;
  };
  return {
    sessionId: get("--session-id"),
    authManifest: get("--auth-manifest"),
    isolationReceipt: get("--isolation-receipt"),
    domainAReceipt: get("--domain-a-receipt"),
    armingBaselineHash: get("--arming-baseline-hash"),
    isolatedProcessSetHash: get("--isolated-process-set-hash"),
    operatingBlockStartUtc: get("--operating-block-start-utc"),
    operatingBlockEndUtc: get("--operating-block-end-utc"),
    proofDayLocal: get("--proof-day-local"),
    timezone: get("--timezone") || g1Validator.DEFAULT_TIMEZONE,
    continuumRunId: get("--continuum-run-id"),
    out: get("--out"),
    eventsPath: get("--events"),
    dryRehearsal: argv.includes("--dry-rehearsal"),
    sessionContinuumAuthorization: get("--session-continuum-authorization"),
    root: get("--root") || __dirname
  };
}

function loadJsonFile(filePath, label) {
  const data = common.safeLoadJson(filePath, null);
  if (!data) throw new Error(`${label} unreadable`);
  return data;
}

function setEnvKeyInFile(envPath, key, value) {
  const lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8").split(/\r?\n/) : [];
  let found = false;
  const out = [];
  for (const line of lines) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(line)) {
      out.push(`${key}=${value}`);
      found = true;
    } else if (line.length > 0 || out.length > 0) {
      out.push(line);
    }
  }
  if (!found) out.push(`${key}=${value}`);
  const joined = out.join("\n");
  fs.writeFileSync(envPath, joined.endsWith("\n") ? joined : `${joined}\n`);
}

function applyArmingMutation(deps, phase) {
  const { envPath, configPath, dryRehearsal, simulateOnly } = deps;
  if (dryRehearsal || simulateOnly) {
    return { ok: true, simulated: true, phase };
  }
  if (phase === "C1") {
    setEnvKeyInFile(envPath, "FOMO_ENABLE_LIVE_SUBMISSION", "YES");
    return { ok: true, phase: "C1" };
  }
  const cfg = common.safeLoadJson(configPath, {});
  if (phase === "C2") {
    cfg.executionMode = "LIVE";
    fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`);
    return { ok: true, phase: "C2" };
  }
  if (phase === "C3") {
    cfg.dryRunMode = false;
    fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`);
    return { ok: true, phase: "C3" };
  }
  throw new Error(`unknown arming phase ${phase}`);
}

function validateSessionContinuumAuthorization(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, reason: "missing_session_continuum_authorization" };
  const data = common.safeLoadJson(filePath, null);
  if (!data || data.continuumExecutionAuthorized !== true) {
    return { ok: false, reason: "continuum_execution_not_authorized" };
  }
  return { ok: true, artifact: data };
}

function appendEvent(cli, deps, stateName, reasonCode, transitionMode, metadata = {}) {
  const remaining = deps.armedTimer ? timing.remainingMs(deps.armedTimer, deps.clock) : null;
  const elapsed = deps.armedTimer ? timing.elapsedMs(deps.armedTimer, deps.clock) : null;
  return deps.eventLog.appendEvent({
    sessionId: cli.sessionId,
    continuumRunId: cli.continuumRunId,
    state: stateName,
    eventType: reasonCode,
    reasonCode,
    transitionMode,
    monotonicElapsedMs: elapsed,
    remainingArmedMs: remaining,
    metadata: common.sanitizeEvidence(metadata)
  });
}

async function defaultReadDisarmedPosture(root) {
  const cfg = common.safeLoadJson(path.join(root, "live_config.json"), {});
  const failures = [];
  if (cfg.executionMode !== "PIPELINE_DRY_RUN") failures.push("executionMode not PIPELINE_DRY_RUN");
  if (cfg.dryRunMode !== true) failures.push("dryRunMode not true");
  const stubPath = path.join(root, "analysis", "r15_manual_approval_record.json");
  if (fs.existsSync(stubPath)) failures.push("runtime stub present");
  if (process.env.FOMO_ALLOW_LOOP_LIVE === "YES") failures.push("loop-live set");
  return { ok: failures.length === 0, failures, cfg };
}

async function runPrecheck(cli, deps) {
  const errors = [];
  const required = [
    "sessionId", "authManifest", "isolationReceipt", "domainAReceipt",
    "armingBaselineHash", "isolatedProcessSetHash", "operatingBlockStartUtc",
    "operatingBlockEndUtc", "proofDayLocal", "timezone", "continuumRunId", "out", "eventsPath"
  ];
  for (const key of required) {
    if (!cli[key]) errors.push(`missing ${key}`);
  }

  const sessionCheck = session.validateSessionId(cli.sessionId);
  if (!sessionCheck.ok) errors.push(sessionCheck.reason);

  if (!cli.dryRehearsal) {
    const authz = validateSessionContinuumAuthorization(cli.sessionContinuumAuthorization);
    if (!authz.ok) errors.push(authz.reason);
  }

  let authManifest = null;
  try {
    authManifest = loadJsonFile(cli.authManifest, "auth manifest");
    const documents = authManifest.documents || authManifest.authorizations || {};
    const resolved = session.resolveAuthorizationDocuments({
      sessionManifest: null,
      authPaths: {
        g1: documents.g1,
        g2: documents.g2,
        g3: documents.g3,
        g4: documents.g4
      },
      sessionId: cli.sessionId
    }, deps.root);
    const chain = session.validateProofAuthorizationChain(resolved, cli.sessionId);
    if (!chain.ok) errors.push(...chain.errors);

    const g1 = g1Validator.validateProofDayG1({
      g1Path: resolved.g1,
      sessionId: cli.sessionId,
      proofDayLocal: cli.proofDayLocal,
      timezone: cli.timezone,
      operatingBlockStartUtc: cli.operatingBlockStartUtc,
      operatingBlockEndUtc: cli.operatingBlockEndUtc,
      consumedRegistry: authManifest.consumedRegistry || []
    });
    if (!g1.ok) {
      const reason = g1.reasonCode === "G1_REUSED" || g1.reasonCode === "G1_STALE"
        ? stateMod.FAIL_CLASSES.STALE_OR_CONSUMED_AUTHORIZATION
        : g1.reasonCode;
      errors.push(reason);
    }
    deps.g1Validation = g1;
    deps.authorizationMetadata = chain.metadata;
    deps.documents = resolved;
  } catch (error) {
    errors.push(error.message || String(error));
  }

  let domainA = null;
  let isolation = null;
  try {
    domainA = loadJsonFile(cli.domainAReceipt, "domain A receipt");
    isolation = loadJsonFile(cli.isolationReceipt, "isolation receipt");
  } catch (error) {
    errors.push(error.message || String(error));
  }

  if (domainA) {
    const capturedAt = Date.parse(domainA.completedAt || domainA.capturedAt || domainA.timestampUtc || "");
    if (!Number.isFinite(capturedAt)) {
      errors.push("domain A receipt timestamp missing");
    } else if (Date.now() - capturedAt > timing.DOMAIN_A_FRESHNESS_BEFORE_C1_MS) {
      errors.push("DOMAIN_A_STALE");
    }
    if (domainA.armingBaselineHash && domainA.armingBaselineHash !== cli.armingBaselineHash) {
      errors.push("arming baseline hash mismatch");
    }
  }

  if (isolation) {
    if (isolation.isolatedProcessSetHash && isolation.isolatedProcessSetHash !== cli.isolatedProcessSetHash) {
      errors.push("isolation process set hash mismatch");
    }
    if (isolation.sessionId && isolation.sessionId !== cli.sessionId) {
      errors.push("isolation session mismatch");
    }
  }

  const posture = await deps.readDisarmedPosture(deps.root);
  if (!posture.ok) errors.push(...posture.failures);

  if (errors.length > 0) {
    const exitCode = errors.includes("DOMAIN_A_STALE")
      ? stateMod.EXIT_CODES.DOMAIN_A_STALE
      : errors.some(e => /isolation/i.test(e))
        ? stateMod.EXIT_CODES.ISOLATION_INVALID
        : errors.some(e => /authorization|G1_|continuum/i.test(e))
          ? stateMod.EXIT_CODES.AUTHORIZATION_INVALID
          : stateMod.EXIT_CODES.PRECHECK_FAILED;
    return { ok: false, exitCode, errors };
  }

  return {
    ok: true,
    authManifest,
    domainA,
    isolation,
    authorizationFingerprints: {
      g1: deps.authorizationMetadata?.g1?.fingerprintSha256 || null,
      g2: deps.authorizationMetadata?.g2?.fingerprintSha256 || null,
      g3: deps.authorizationMetadata?.g3?.fingerprintSha256 || null,
      g4: deps.authorizationMetadata?.g4?.fingerprintSha256 || null
    }
  };
}

async function createStubRecord(cli, deps) {
  if (typeof deps.createStub === "function") return deps.createStub(cli, deps);
  if (deps.dryRehearsal || deps.simulateOnly) {
    deps.stubFingerprint = "simulated-stub";
    return { ok: true, simulated: true };
  }
  return { ok: false, reason: "stub creation not authorized outside test harness" };
}

async function invokeAp(cli, deps) {
  if (deps.invocationCounts.ap > 0) return { ok: false, reason: "AP retry forbidden" };
  if (typeof deps.runApManifest === "function") return deps.runApManifest(cli, deps);
  return { ok: false, reason: "AP invocation not configured" };
}

async function invokeN6(cli, deps) {
  if (deps.invocationCounts.n6 > 0) return { ok: false, reason: "N6 retry forbidden" };
  if (typeof deps.runN6Probe === "function") return deps.runN6Probe(cli, deps);
  return { ok: false, reason: "N6 invocation not configured" };
}

async function performRollback(cli, deps, c1Mutated, fromState) {
  if (!c1Mutated) return { ok: true, skipped: true };

  deps.transitionMarks.terminalMono = deps.transitionMarks.terminalMono || timing.readMonotonicNs(deps.clock);
  if (typeof deps.beforeRollbackDelay === "function") {
    await deps.beforeRollbackDelay(deps);
  }
  const rollbackStartMono = timing.readMonotonicNs(deps.clock);
  const delayCheck = timing.assertRollbackInitiationDelay(
    deps.transitionMarks.terminalMono,
    rollbackStartMono,
    timing.MAX_ROLLBACK_INITIATION_DELAY_MS
  );
  deps.rollbackInitiationCheck = {
    terminalMono: deps.transitionMarks.terminalMono.toString(),
    rollbackStartMono: rollbackStartMono.toString(),
    ...delayCheck
  };
  appendEvent(cli, deps, fromState || deps.currentState, "ROLLBACK_THRESHOLD_CHECK", "AUTO", {
    ...delayCheck
  });
  if (!delayCheck.ok) {
    recordEnforcementViolation(deps, stateMod.FAIL_CLASSES.ROLLBACK_INITIATION_DELAY_EXCEEDED, delayCheck);
    appendEvent(cli, deps, fromState || deps.currentState, stateMod.FAIL_CLASSES.ROLLBACK_INITIATION_DELAY_EXCEEDED, "AUTO", delayCheck);
  }

  const skipMonotonic = deps.monotonicFailure
    || (deps.enforcementViolations || []).some(v => v.code === stateMod.FAIL_CLASSES.MONOTONIC_TIMER_ANOMALY);
  if (!skipMonotonic) {
    enforceMonotonicCheckpoint(cli, deps, "before_rollback");
  }
  transitionToState(cli, deps, fromState || deps.currentState, "ROLLBACK", "ROLLBACK_STARTED", "AUTO", {});

  deps.invocationCounts.rollback += 1;
  deps.rollbackResult = await rollback.rollbackDomainC({
    envPath: deps.envPath,
    configPath: deps.configPath,
    stubPath: deps.stubPath,
    writeEnv: deps.writeEnv,
    writeConfig: deps.writeConfig,
    removeStub: deps.removeStub,
    verifyExecutor: deps.verifyExecutor
  });
  deps.rollbackResult = {
    ...deps.rollbackResult,
    initiationDelay: deps.rollbackInitiationCheck
  };
  appendEvent(cli, deps, "ROLLBACK", deps.rollbackResult.ok ? "ROLLBACK_COMPLETED" : "VALIDATION_ABORT", "AUTO", {
    failures: deps.rollbackResult.failures || []
  });
  return deps.rollbackResult;
}

async function performDomainC(cli, deps) {
  if (typeof deps.beforeDomainCCheck === "function") {
    await deps.beforeDomainCCheck(deps);
  }

  const remaining = deps.armedTimer ? timing.remainingMs(deps.armedTimer, deps.clock) : 0;
  const reserveCheck = timing.assertDomainCReserve(remaining, timing.DOMAIN_C_RESERVE_MS);
  deps.domainCReserveCheck = reserveCheck;
  appendEvent(cli, deps, "ROLLBACK", "DOMAIN_C_RESERVE_CHECK", "AUTO", reserveCheck);
  if (!reserveCheck.ok) {
    recordEnforcementViolation(deps, stateMod.FAIL_CLASSES.DOMAIN_C_RESERVE_VIOLATION, reserveCheck);
    appendEvent(cli, deps, "ROLLBACK", stateMod.FAIL_CLASSES.DOMAIN_C_RESERVE_VIOLATION, "AUTO", reserveCheck);
  }

  const skipMonotonic = deps.monotonicFailure
    || (deps.enforcementViolations || []).some(v => v.code === stateMod.FAIL_CLASSES.MONOTONIC_TIMER_ANOMALY);
  if (!skipMonotonic) {
    enforceMonotonicCheckpoint(cli, deps, "before_domain_c");
  }
  transitionToState(cli, deps, "ROLLBACK", "DOMAIN_C", "DOMAIN_C_STARTED", "AUTO", {
    reserveCheck,
    domainCStillAttempted: true
  });

  if (typeof deps.runDomainC === "function") {
    deps.domainCResult = await deps.runDomainC(cli, deps);
  } else {
    deps.domainCResult = { ok: true, skipped: true };
  }
  deps.domainCResult = {
    ...deps.domainCResult,
    reserveCheck
  };
  appendEvent(cli, deps, "DOMAIN_C", deps.domainCResult.ok ? "DOMAIN_C_COMPLETED" : "VALIDATION_ABORT", "AUTO", {});

  if (typeof deps.runSafetySuite === "function") {
    appendEvent(cli, deps, "DOMAIN_C", "SAFETY_STARTED", "AUTO", {});
    deps.safetyResult = await deps.runSafetySuite(cli, deps);
    appendEvent(cli, deps, "DOMAIN_C", deps.safetyResult.ok ? "SAFETY_COMPLETED" : "VALIDATION_ABORT", "AUTO", {});
  } else {
    deps.safetyResult = { ok: true, skipped: true };
  }

  return {
    domainCFailed: deps.domainCResult?.ok === false,
    safetyFailed: deps.safetyResult?.ok === false
  };
}

function finalizeRun(ctx) {
  const { cli, deps, startedAtUtc, exitCode, failClass, precheck = {}, errors = [] } = ctx;

  const sealed = deps.eventLog.seal();
  const status = stateMod.mapExitToStatus(exitCode);
  const receipt = receiptMod.buildContinuumReceipt({
    sessionId: cli.sessionId,
    continuumRunId: cli.continuumRunId,
    status,
    failReason: failClass || (exitCode === 0 ? null : status),
    exitCode,
    armedStartUtc: deps.armedTimer?.startUtc || null,
    armedDeadlineUtc: deps.armedTimer
      ? new Date(Date.parse(deps.armedTimer.startUtc) + deps.armedTimer.capMs).toISOString()
      : null,
    authorizationFingerprints: precheck.authorizationFingerprints || {},
    armingBaselineHash: cli.armingBaselineHash,
    isolatedProcessSetHash: cli.isolatedProcessSetHash,
    configFingerprint: common.hashFile(deps.configPath),
    envFingerprintGateOnly: common.envGateBooleans(),
    stubFingerprint: deps.stubFingerprint,
    stubPurpose: deps.stubPurpose,
    enforcementViolations: deps.enforcementViolations || [],
    thresholds: timing.TIMING_CONSTANTS,
    apSummary: deps.apSummary,
    n6Summary: deps.n6Summary,
    rollback: {
      ...(deps.rollbackResult || {}),
      enforcementViolations: deps.enforcementViolations || []
    },
    domainC: {
      ...(deps.domainCResult || {}),
      reserveCheck: deps.domainCReserveCheck || null
    },
    safety: deps.safetyResult || {},
    eventLogPath: cli.eventsPath,
    eventLogHeadHash: sealed.headHash,
    eventLogTailHash: sealed.tailHash,
    dryRehearsal: deps.dryRehearsal,
    g1Validation: deps.g1Validation || {},
    finalState: exitCode === 0 ? "DISARMED_PASS" : "DISARMED_FAIL_CLOSED",
    startedAtUtc,
    completedAtUtc: common.nowIso()
  });

  let receiptWrite = { ok: true, skipped: true };
  if (cli.out) {
    if (typeof deps.writeReceipt === "function") {
      receiptWrite = deps.writeReceipt(receipt, cli.out);
    } else {
      receiptWrite = receiptMod.writeContinuumReceipt(receipt, cli.out);
    }
  }
  let finalExit = exitCode;
  if (!receiptWrite.ok && finalExit === stateMod.EXIT_CODES.PASS) {
    finalExit = stateMod.EXIT_CODES.RECEIPT_WRITE_FAILED;
  }

  return {
    exitCode: finalExit,
    failClass: failClass || (finalExit === 0 ? null : "UNEXPECTED_STATE"),
    status: stateMod.mapExitToStatus(finalExit),
    receipt,
    receiptWrite,
    errors,
    invocationCounts: deps.invocationCounts,
    boundary: verifyNoSubmitImportBoundary(__dirname)
  };
}

async function runArmedContinuum(options = {}) {
  const startedAtUtc = common.nowIso();
  const cli = options.cli || parseCli();
  const root = options.root || cli.root || __dirname;

  const runKey = buildRunKey(cli);
  if (continuumRunRegistry.has(runKey)) {
    return {
      exitCode: stateMod.EXIT_CODES.DUPLICATE_CONTINUUM_INVOCATION,
      failClass: stateMod.FAIL_CLASSES.DUPLICATE_CONTINUUM_INVOCATION,
      status: stateMod.mapExitToStatus(stateMod.EXIT_CODES.DUPLICATE_CONTINUUM_INVOCATION),
      errors: ["duplicate continuum invocation"],
      invocationCounts: { ap: 0, n6: 0, rollback: 0 },
      boundary: verifyNoSubmitImportBoundary(__dirname)
    };
  }
  continuumRunRegistry.add(runKey);

  const deps = {
    root,
    envPath: options.envPath || path.join(root, ".env"),
    configPath: options.configPath || path.join(root, "live_config.json"),
    stubPath: options.stubPath || path.join(root, "analysis", "r15_manual_approval_record.json"),
    dryRehearsal: options.dryRehearsal ?? cli.dryRehearsal,
    simulateOnly: options.simulateOnly ?? false,
    clock: options.clock || null,
    readDisarmedPosture: options.readDisarmedPosture || defaultReadDisarmedPosture,
    createStub: options.createStub || null,
    runApManifest: options.runApManifest || null,
    runN6Probe: options.runN6Probe || null,
    runDomainC: options.runDomainC || null,
    runSafetySuite: options.runSafetySuite || null,
    writeReceipt: options.writeReceipt || null,
    writeEnv: options.writeEnv || null,
    writeConfig: options.writeConfig || null,
    removeStub: options.removeStub || null,
    verifyExecutor: options.verifyExecutor || null,
    beforeApDelayCheck: options.beforeApDelayCheck || null,
    beforeN6DelayCheck: options.beforeN6DelayCheck || null,
    beforeRollbackDelay: options.beforeRollbackDelay || null,
    beforeDomainCCheck: options.beforeDomainCCheck || null,
    eventLog: null,
    c1Mutated: false,
    armedTimer: null,
    currentState: "PRECHECK",
    g1Validation: null,
    authorizationMetadata: null,
    apSummary: {},
    n6Summary: {},
    rollbackResult: null,
    domainCResult: null,
    safetyResult: null,
    stubFingerprint: null,
    stubPurpose: "armed_no_submit_proof_only",
    transitionMarks: {},
    enforcementViolations: [],
    rollbackInitiationCheck: null,
    domainCReserveCheck: null,
    invocationCounts: { ap: 0, n6: 0, rollback: 0 }
  };

  if (options.forceC1Mutated === true) {
    deps.c1Mutated = true;
  }

  const boundary = verifyNoSubmitImportBoundary(__dirname);
  if (!boundary.ok) {
    return {
      exitCode: stateMod.EXIT_CODES.UNEXPECTED_STATE,
      failClass: "UNEXPECTED_STATE",
      boundary,
      errors: boundary.violations
    };
  }

  deps.eventLog = options.eventLog || events.createEventLog({ filePath: cli.eventsPath });
  deps.transitionMarks.lastMono = timing.readMonotonicNs(deps.clock);
  appendEvent(cli, deps, "PRECHECK", "PRECHECK_STARTED", "AUTO", {});

  const precheck = await runPrecheck(cli, deps);
  if (!precheck.ok) {
    appendEvent(cli, deps, "PRECHECK", "VALIDATION_ABORT", "AUTO", { errors: precheck.errors });
    return finalizeRun({
      cli, deps, startedAtUtc, precheck,
      exitCode: precheck.exitCode,
      failClass: Object.keys(stateMod.EXIT_CODES).find(k => stateMod.EXIT_CODES[k] === precheck.exitCode) || "PRECHECK_FAILED",
      errors: precheck.errors
    });
  }

  transitionToState(cli, deps, "PRECHECK", "ARMING", "PRECHECK_COMPLETE", "AUTO", {});

  let exitCode = stateMod.EXIT_CODES.UNEXPECTED_STATE;
  let failClass = "UNEXPECTED_STATE";
  let c1Mutated = false;
  let rollbackFromState = "ARMING";

  try {
    // Illegal pre-C1 transition disposition (DECISION — RB-G9 Armed Continuum
    // Remediation Acceptance — 2026-07-11 §9 item 6): test-only injection
    // point, mirroring the existing post-C1 testForceIllegalTransition hook
    // below, but firing before any arming mutation has occurred. Exercises
    // assertLegalTransition() rejecting a jump straight from ARMING to N6
    // while c1Mutated is still false, proving performRollback's "skip if
    // nothing was mutated" path — not the full rollback path — is what
    // fires when illegality is caught before C1, as opposed to after it.
    if (options.testForceIllegalPreC1Transition === true) {
      transitionToState(cli, deps, "ARMING", "N6", "TEST_ILLEGAL_PRE_C1", "AUTO", {});
    }
    enforceMonotonicCheckpoint(cli, deps, "pre_c1");
    appendEvent(cli, deps, "ARMING", "C1_STARTED", "AUTO", {});
    applyArmingMutation(deps, "C1");
    c1Mutated = options.forceC1Mutated === true || (!deps.dryRehearsal && !deps.simulateOnly);
    deps.c1Mutated = c1Mutated;
    appendEvent(cli, deps, "ARMING", "C1_COMPLETE", "AUTO", { simulated: deps.dryRehearsal || deps.simulateOnly });

    applyArmingMutation(deps, "C2");
    appendEvent(cli, deps, "ARMING", "C2_COMPLETE", "AUTO", {});

    applyArmingMutation(deps, "C3");
    appendEvent(cli, deps, "ARMING", "C3_COMPLETE", "AUTO", {});

    deps.armedTimer = timing.createArmedTimer({ clock: deps.clock, startUtc: common.nowIso() });
    enforceMonotonicCheckpoint(cli, deps, "after_arming");

    transitionToState(cli, deps, "ARMING", "STUB", "ARMING_COMPLETE", "AUTO", {});
    appendEvent(cli, deps, "STUB", "STUB_STARTED", "AUTO", {});
    enforceMonotonicCheckpoint(cli, deps, "before_stub");
    const stubResult = await createStubRecord(cli, deps);
    if (!stubResult.ok) throw Object.assign(new Error(stubResult.reason || "stub failed"), { failClass: "STUB_FAILED" });
    appendEvent(cli, deps, "STUB", "STUB_CREATED", "AUTO", {});
    enforceMonotonicCheckpoint(cli, deps, "after_stub");
    appendEvent(cli, deps, "STUB", "STUB_VALIDATED", "AUTO", {});

    const postStubCheck = timing.assertMinRemaining(deps.armedTimer, timing.MIN_POST_STUB_REMAINING_MS, deps.clock);
    appendEvent(cli, deps, "STUB", "THRESHOLD_CHECK", "AUTO", { label: "post_stub", ...postStubCheck });
    if (!postStubCheck.ok) {
      throw Object.assign(new Error("INSUFFICIENT_POST_STUB_WINDOW"), { failClass: "INSUFFICIENT_POST_STUB_WINDOW" });
    }

    if (options.testForceIllegalTransition === true) {
      transitionToState(cli, deps, "STUB", "N6", "TEST_ILLEGAL", "AUTO", {});
    }

    deps.transitionMarks.stubCompleteMono = timing.readMonotonicNs(deps.clock);
    if (typeof deps.beforeApDelayCheck === "function") {
      await deps.beforeApDelayCheck(deps);
    }

    enforceMonotonicCheckpoint(cli, deps, "before_ap");
    transitionToState(cli, deps, "STUB", "AP", "STUB_VALIDATED", "AUTO", {});

    const apRemaining = timing.assertMinRemaining(deps.armedTimer, timing.MIN_AP_REMAINING_MS, deps.clock);
    if (!apRemaining.ok) throw Object.assign(new Error("AP floor"), { failClass: "DEADLINE_EXCEEDED" });

    const stubToApDelay = timing.assertTransitionDelay(
      deps.transitionMarks.stubCompleteMono,
      timing.MAX_STUB_TO_AP_DELAY_MS,
      deps.clock
    );
    if (!stubToApDelay.ok) throw Object.assign(new Error("stub to AP delay"), { failClass: "DEADLINE_EXCEEDED" });

    appendEvent(cli, deps, "AP", "AP_STARTED", "AUTO", { remainingMs: apRemaining.remainingMs });
    const ap = await invokeAp(cli, deps);
    deps.invocationCounts.ap += 1;
    if (!ap.ok) throw Object.assign(new Error(ap.reason || "AP failed"), { failClass: "AP_FAILED" });
    deps.apSummary = ap.summary || {};
    appendEvent(cli, deps, "AP", "AP_COMPLETED", "AUTO", {});

    deps.transitionMarks.apCompleteMono = timing.readMonotonicNs(deps.clock);
    if (typeof deps.beforeN6DelayCheck === "function") {
      await deps.beforeN6DelayCheck(deps);
    }
    enforceMonotonicCheckpoint(cli, deps, "before_n6");
    transitionToState(cli, deps, "AP", "N6", "AP_COMPLETED", "AUTO", {});

    const apToN6Delay = timing.assertTransitionDelay(
      deps.transitionMarks.apCompleteMono,
      timing.MAX_AP_TO_N6_DELAY_MS,
      deps.clock
    );
    if (!apToN6Delay.ok) throw Object.assign(new Error("AP to N6 delay"), { failClass: "DEADLINE_EXCEEDED" });

    const n6Remaining = timing.assertMinRemaining(deps.armedTimer, timing.MIN_N6_REMAINING_MS, deps.clock);
    if (!n6Remaining.ok) throw Object.assign(new Error("N6 floor"), { failClass: "DEADLINE_EXCEEDED" });

    appendEvent(cli, deps, "N6", "N6_STARTED", "AUTO", { remainingMs: n6Remaining.remainingMs });
    const n6 = await invokeN6(cli, deps);
    deps.invocationCounts.n6 += 1;
    if (!n6.ok) throw Object.assign(new Error(n6.reason || "N6 failed"), { failClass: "N6_FAILED" });
    deps.n6Summary = n6.summary || {};
    appendEvent(cli, deps, "N6", "N6_COMPLETED", "AUTO", {});

    rollbackFromState = "N6";
    exitCode = stateMod.EXIT_CODES.PASS;
    failClass = null;
  } catch (error) {
    failClass = error.failClass || "UNEXPECTED_STATE";
    exitCode = stateMod.mapFailureToExit(failClass);
    rollbackFromState = deps.currentState;
    if (failClass === stateMod.FAIL_CLASSES.MONOTONIC_TIMER_ANOMALY) {
      deps.monotonicFailure = true;
      recordEnforcementViolation(deps, failClass, { state: deps.currentState });
    }
    appendEvent(cli, deps, deps.currentState, "VALIDATION_ABORT", "AUTO", {
      reason: error.message || String(error),
      failClass
    });
  } finally {
    deps.transitionMarks.terminalMono = timing.readMonotonicNs(deps.clock);
    try {
      const rb = await performRollback(cli, deps, c1Mutated || deps.c1Mutated, rollbackFromState);
      if (!rb.ok && exitCode === stateMod.EXIT_CODES.PASS) {
        exitCode = stateMod.EXIT_CODES.ROLLBACK_FAILED;
        failClass = "ROLLBACK_FAILED";
      } else if (!rb.ok && exitCode !== stateMod.EXIT_CODES.PASS) {
        exitCode = stateMod.EXIT_CODES.ROLLBACK_FAILED;
        failClass = "ROLLBACK_FAILED";
      }

      const domainExit = await performDomainC(cli, deps);
      if (domainExit.safetyFailed) {
        if (exitCode === stateMod.EXIT_CODES.PASS) {
          exitCode = stateMod.EXIT_CODES.SAFETY_SUITE_FAILED;
          failClass = "SAFETY_SUITE_FAILED";
        }
      } else if (domainExit.domainCFailed && exitCode === stateMod.EXIT_CODES.PASS) {
        exitCode = stateMod.EXIT_CODES.DOMAIN_C_FAILED;
        failClass = "DOMAIN_C_FAILED";
      }
    } catch (finallyError) {
      if (!failClass) {
        failClass = finallyError.failClass || "UNEXPECTED_STATE";
        exitCode = stateMod.mapFailureToExit(failClass);
      }
    }

    const enforced = applyEnforcementViolations(deps, exitCode, failClass);
    exitCode = enforced.exitCode;
    failClass = enforced.failClass;
  }

  return finalizeRun({ cli, deps, startedAtUtc, exitCode, failClass, precheck });
}

async function main(argv = process.argv.slice(2)) {
  const cli = parseCli(argv);
  if (!cli.dryRehearsal) {
    process.stderr.write("run_armed_continuum: production continuum execution requires explicit session authorization; failing closed\n");
    process.exit(stateMod.EXIT_CODES.AUTHORIZATION_INVALID);
  }
  const result = await runArmedContinuum({ cli });
  if (result.exitCode !== 0) {
    process.stderr.write(`run_armed_continuum: exit ${result.exitCode} (${result.failClass || result.status})\n`);
  }
  process.exit(result.exitCode);
}

if (require.main === module) {
  main();
}

module.exports = {
  FORBIDDEN_REQUIRE_PATHS,
  verifyNoSubmitImportBoundary,
  parseCli,
  runArmedContinuum,
  applyArmingMutation,
  validateSessionContinuumAuthorization,
  assertLegalTransition: stateMod.assertLegalTransition,
  continuumRunRegistry
};
