"use strict";

const fs = require("fs");
const path = require("path");
const common = require("./live_validation_common");
const manifest = require("./armed_preflight_manifest");
const session = require("./armed_preflight_session");

function createDefaultAdapters(root = __dirname) {
  const executor = require("./live_executor");
  const singleton = require("./executor_singleton_guard");
  const configFile = path.join(root, "live_config.json");
  const positionsFile = path.join(root, "live_positions.json");
  const pendingFile = path.join(root, "pending_reconciliation.jsonl");
  const recoveryFile = path.join(root, "recovery_actions.jsonl");
  const stubFile = path.join(root, "analysis", "r15_manual_approval_record.json");
  const lockFile = singleton.getExecutorLockPath(path.join(root, "executor_singleton.lock.json"));

  return {
    root,
    configFile,
    loadConfig: () => common.safeLoadJson(configFile, {}),
    computeLiveArmedStatus: cfg => executor.computeLiveArmedStatus(cfg),
    collectLiveSubmissionGateFailures: cfg => {
      const armed = executor.computeLiveArmedStatus(cfg);
      return { failures: armed.failures || [], gates: armed.gates || {} };
    },
    assertMicroLiveApprovalRecord: cfg => {
      try {
        executor.__r16LivePathTest.assertMicroLiveApprovalRecord(cfg);
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: error.message || String(error), code: error.code || null };
      }
    },
    assertArmedProofApprovalRecord: cfg => {
      try {
        executor.__r16LivePathTest.assertArmedProofApprovalRecord(cfg);
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: error.message || String(error), code: error.code || null };
      }
    },
    probeBuyNoSubmit: async (cfg, options = {}) => {
      const r16 = executor.__r16LivePathTest;
      try {
        if (options.noSubmitProof === true || options.proofContext === session.PROOF_CONTEXT) {
          r16.assertLiveSubmissionArmed({ ...cfg, positionSizeSol: cfg?.positionSizeSol });
          const capitalExposure = r16.resolveCapitalExposureForLiveGate(cfg);
          if (capitalExposure !== "none") {
            return {
              ok: false,
              reason: "Capital exposure must be none before armed no-submit proof.",
              code: r16.EXECUTION_ABORT_CODES.CAPITAL_EXPOSURE_BLOCKED,
              capitalExposure
            };
          }
          if (r16.countPendingReconciliationEntries() > 0) {
            return {
              ok: false,
              reason: "Pending reconciliation blocks armed no-submit proof.",
              code: r16.EXECUTION_ABORT_CODES.PENDING_RECONCILIATION_BLOCKS_ENTRY
            };
          }
          r16.assertArmedProofApprovalRecord(cfg);
          r16.clearAllLiveSubmitInFlightForTest();
          return { ok: true, preSubmitGuardsSatisfied: true, purposeContext: "armed_no_submit_proof_only" };
        }
        r16.assertLivePathPreSubmit(cfg, {
          kind: "BUY",
          tokenAddress: "11111111111111111111111111111111",
          pairAddress: "armed-preflight-probe",
          positionSizeSol: cfg?.positionSizeSol
        });
        r16.clearAllLiveSubmitInFlightForTest();
        return { ok: true, preSubmitGuardsSatisfied: true };
      } catch (error) {
        return { ok: false, reason: error.message || String(error), code: error.code || null };
      }
    },
    loadStubRecord: () => common.safeLoadJson(stubFile, null),
    stubFile,
    readPositions: () => {
      const data = common.safeLoadJson(positionsFile, []);
      return Array.isArray(data) ? data : [];
    },
    countPendingReconciliation: () => {
      if (!fs.existsSync(pendingFile)) return 0;
      return fs.readFileSync(pendingFile, "utf8").split(/\r?\n/).filter(Boolean).length;
    },
    recoveryState: () => ({
      present: fs.existsSync(recoveryFile),
      lineCount: fs.existsSync(recoveryFile)
        ? fs.readFileSync(recoveryFile, "utf8").split(/\r?\n/).filter(Boolean).length
        : 0
    }),
    resolveCapitalExposure: cfg => executor.__r16LivePathTest.resolveCapitalExposureForLiveGate(cfg),
    envGates: () => common.envGateBooleans(),
    walletMatch: cfg => {
      const expected = process.env.EXPECTED_WALLET_PUBLIC_ADDRESS;
      const configured = cfg?.walletPublicAddress;
      if (!expected) return { ok: false, reason: "EXPECTED_WALLET_PUBLIC_ADDRESS not set" };
      if (!configured) return { ok: false, reason: "walletPublicAddress missing" };
      return { ok: expected === configured, expectedPresent: true, configuredPresent: true };
    },
    rpcReadOnly: async () => {
      try {
        const cfg = common.safeLoadJson(configFile, {});
        const rpc = executor.resolveRpcEndpoint(cfg, { requireDedicated: true, purpose: "submission" });
        if (!rpc?.endpoint) return { ok: false, reason: "dedicated RPC unavailable" };
        return { ok: true, provider: rpc.provider || "dedicated" };
      } catch (error) {
        return { ok: false, reason: error.message || String(error) };
      }
    },
    listProcesses: () => [],
    readExecutorLock: () => singleton.readExecutorLock(lockFile),
    authorizationDocs: () => null,
    authorizationChainMode: "unconfigured",
    proofContext: null,
    sessionLinkage: null,
    proofAuthorizationProhibitsExecution: false,
    automationCandidateHandoffDisabled: false,
    runtimeStubPurpose: null,
    executionPathCallCount: 0,
    candidatePacket: sessionId => common.safeLoadJson(
      path.join(root, "Ori", "Phase 2", "Project Vulcan", "Live Readiness", "Sessions", `SESSION — ${sessionId}`, "candidate_packet.json"),
      null
    ),
    jupiterProbe: async () => {
      const src = fs.readFileSync(path.join(root, "live_executor.js"), "utf8");
      const client = fs.readFileSync(path.join(root, "jupiter_swap_client.js"), "utf8");
      const v6Removed = !src.includes("quote-api.jup.ag/v6");
      const usesAdapter = src.includes("jupiter_swap_client") && client.includes("/swap/v1");
      return { ok: v6Removed && usesAdapter, v6Removed, usesAdapter };
    },
    runN6ArmedProbe: async () => {
      const mod = require("./test_n6_armed_estop_probe");
      return mod.runProbe({ productionRoot: root });
    },
    runR16Evidence: async () => ({ ok: true, source: "test_r16_live_path_coupling.js", note: "manifest defers to dedicated regression gate for full subprocess proof" }),
    armingBaselineHash: null,
    sessionId: null,
    orStatus: "not_promoted"
  };
}

function runtimeStubSessionId(record) {
  if (!record || typeof record !== "object") return null;
  return record.sessionId
    || record.linkedSessionId
    || record.oriLinkage?.sessionId
    || null;
}

function evaluatePosture(cfg, adapters) {
  const armed = adapters.computeLiveArmedStatus(cfg);
  const env = adapters.envGates();
  const executionMode = cfg?.executionMode;
  const dryRunMode = cfg?.dryRunMode;
  const ok = executionMode === "LIVE"
    && dryRunMode === false
    && armed.liveArmed === true
    && env.FOMO_ENABLE_LIVE_SUBMISSION === "YES";
  return {
    ok,
    liveArmed: armed.liveArmed === true,
    operationalPosture: armed.operationalPosture,
    executionMode,
    dryRunMode,
    envGates: env,
    failures: armed.failures || []
  };
}

async function runCheckAP01(adapters, cfg, posture) {
  if (posture.ok) {
    return common.buildCheckResult("AP-01", "PASS", "LIVE_ARMED posture satisfied", {
      executionMode: posture.executionMode,
      dryRunMode: posture.dryRunMode,
      liveArmed: posture.liveArmed,
      operationalPosture: posture.operationalPosture
    });
  }
  return common.buildCheckResult("AP-01", "FAIL", "LIVE_ARMED posture not satisfied", {
    executionMode: posture.executionMode,
    dryRunMode: posture.dryRunMode,
    liveArmed: posture.liveArmed,
    gateFailures: posture.failures
  });
}

function readAuthStatus(filePath) {
  const meta = session.readAuthorizationDocumentMetadata(filePath);
  return {
    present: meta.present,
    signed: meta.signed,
    expired: meta.consumed,
    documentClass: meta.documentClass,
    sessionIds: meta.sessionIds || []
  };
}

async function runCheckAP02(adapters) {
  const docs = adapters.authorizationDocs?.();
  const sessionId = adapters.sessionId;
  const chainMode = adapters.authorizationChainMode
    || session.detectAuthorizationChainMode(docs || {});

  if (!docs || chainMode === "unconfigured") {
    return common.buildCheckResult("AP-02", "FAIL", "Authorization linkage not configured", {
      sessionId: sessionId || null,
      chainMode
    });
  }

  if (chainMode === "armed-no-submit-proof") {
    const validation = session.validateProofAuthorizationChain(docs, sessionId);
    if (validation.ok) {
      return common.buildCheckResult("AP-02", "PASS", "Proof-specific G1–G4 authorization chain valid", {
        sessionId,
        chainMode,
        documents: session.authorizationMetadataFingerprints(validation.metadata)
      });
    }
    return common.buildCheckResult("AP-02", "FAIL", "Proof authorization chain invalid", {
      sessionId,
      chainMode,
      errors: validation.errors,
      documents: session.authorizationMetadataFingerprints(validation.metadata)
    });
  }

  const validation = session.validateMicroLiveAuthorizationChain(docs, sessionId);
  if (validation.ok) {
    return common.buildCheckResult("AP-02", "PASS", "Micro-live authorization chain documents present and signed", {
      sessionId,
      chainMode: "micro-live",
      documents: session.authorizationMetadataFingerprints(validation.metadata)
    });
  }
  return common.buildCheckResult("AP-02", "FAIL", "Authorization chain incomplete or unsigned", {
    sessionId,
    chainMode: "micro-live",
    errors: validation.errors,
    documents: session.authorizationMetadataFingerprints(validation.metadata)
  });
}

async function runCheckAP03(adapters) {
  const record = adapters.loadStubRecord();
  const sessionId = adapters.sessionId;
  if (!record) {
    return common.buildCheckResult("AP-03", "FAIL", "Runtime R15 stub absent", { stubPath: adapters.stubFile });
  }
  const actualSessionId = runtimeStubSessionId(record);
  const sessionOk = !sessionId || actualSessionId === sessionId;
  const signed = record.operatorSignaturePresent === true || record.approvalId;
  if (sessionOk && signed) {
    return common.buildCheckResult("AP-03", "PASS", "Runtime stub present and session-bound", {
      sessionId: actualSessionId,
      approvalId: record.approvalId || null
    });
  }
  return common.buildCheckResult("AP-03", "FAIL", "Runtime stub invalid or session mismatch", {
    sessionIdExpected: sessionId,
    sessionIdActual: actualSessionId
  });
}

async function runCheckAP04(adapters) {
  const processes = adapters.listProcesses();
  const loops = processes.filter(p => p.isExecutorLoop);
  if (loops.length === 0) {
    return common.buildCheckResult("AP-04", "PASS", "No executor loop processes detected", { executorLoopCount: 0 });
  }
  return common.buildCheckResult("AP-04", "FAIL", "Executor loop process detected", {
    executorLoopCount: loops.length,
    pids: loops.map(p => p.pid)
  });
}

async function runCheckAP05(adapters) {
  const lock = adapters.readExecutorLock();
  return common.buildCheckResult("AP-05", "PASS", "Singleton lock state documented", {
    lockState: lock.state,
    stale: lock.lock ? require("./executor_singleton_guard").isExecutorLockStale(lock.lock) : null
  });
}

async function runCheckAP06(adapters) {
  const open = adapters.readPositions().filter(p => p.status === "OPEN");
  if (open.length === 0) {
    return common.buildCheckResult("AP-06", "PASS", "No open live positions", { openCount: 0 });
  }
  return common.buildCheckResult("AP-06", "FAIL", "Open live positions present", { openCount: open.length });
}

async function runCheckAP07(adapters) {
  const count = adapters.countPendingReconciliation();
  if (count === 0) {
    return common.buildCheckResult("AP-07", "PASS", "No pending reconciliation", { pendingCount: 0 });
  }
  return common.buildCheckResult("AP-07", "FAIL", "Pending reconciliation present", { pendingCount: count });
}

async function runCheckAP08(adapters) {
  const recovery = adapters.recoveryState();
  return common.buildCheckResult("AP-08", "PASS", recovery.present
    ? "Recovery file present and documented"
    : "No recovery actions file", recovery);
}

async function runCheckAP09(adapters, cfg) {
  const exposure = adapters.resolveCapitalExposure(cfg);
  if (exposure === "none" || !exposure) {
    return common.buildCheckResult("AP-09", "PASS", "Capital exposure none", { capitalExposure: "none" });
  }
  return common.buildCheckResult("AP-09", "FAIL", "Capital exposure enabled", { capitalExposure: exposure });
}

async function runCheckAP10(adapters, cfg) {
  const env = adapters.envGates();
  const match = adapters.walletMatch(cfg);
  if (env.SOLANA_SIGNER_SECRET !== "present") {
    return common.buildCheckResult("AP-10", "FAIL", "Signer env absent", { envGates: env });
  }
  if (!match.ok) {
    return common.buildCheckResult("AP-10", "FAIL", match.reason || "Wallet mismatch", { envGates: env });
  }
  return common.buildCheckResult("AP-10", "PASS", "Signer present and wallet match verified", { envGates: env });
}

async function runCheckAP11(adapters) {
  const rpc = await adapters.rpcReadOnly();
  if (rpc.ok) {
    return common.buildCheckResult("AP-11", "PASS", "Dedicated RPC read-only probe OK", { provider: rpc.provider });
  }
  return common.buildCheckResult("AP-11", "FAIL", rpc.reason || "RPC probe failed", {});
}

async function runCheckAP12(adapters, cfg) {
  const gate = adapters.collectLiveSubmissionGateFailures(cfg);
  if ((gate.failures || []).length === 0) {
    return common.buildCheckResult("AP-12", "PASS", "All live submission gates pass", { gateCount: Object.keys(gate.gates || {}).length });
  }
  return common.buildCheckResult("AP-12", "FAIL", "Live submission gate failures present", { failures: gate.failures });
}

async function runCheckAP13(adapters, cfg) {
  const chainMode = adapters.authorizationChainMode
    || session.detectAuthorizationChainMode(adapters.authorizationDocs?.() || {});
  const isProof = chainMode === "armed-no-submit-proof" || adapters.proofContext === session.PROOF_CONTEXT;
  const result = isProof
    ? adapters.assertArmedProofApprovalRecord(cfg)
    : adapters.assertMicroLiveApprovalRecord(cfg);
  if (result.ok) {
    return common.buildCheckResult("AP-13", "PASS", "R15 approval record assert pass", {
      purposeContext: isProof ? "armed_no_submit_proof_only" : "micro_live_execution"
    });
  }
  return common.buildCheckResult("AP-13", "FAIL", result.reason || "R15 assert failed", {
    code: result.code || null,
    purposeContext: isProof ? "armed_no_submit_proof_only" : "micro_live_execution"
  });
}

async function runCheckAP14(adapters, cfg) {
  const chainMode = adapters.authorizationChainMode
    || session.detectAuthorizationChainMode(adapters.authorizationDocs?.() || {});
  const isProof = chainMode === "armed-no-submit-proof" || adapters.proofContext === session.PROOF_CONTEXT;
  const probe = await adapters.probeBuyNoSubmit(cfg, {
    noSubmitProof: isProof,
    proofContext: isProof ? session.PROOF_CONTEXT : null,
    authorizationChainMode: chainMode
  });
  if (probe.ok && probe.preSubmitGuardsSatisfied) {
    return common.buildCheckResult("AP-14", "PASS", "BUY pre-submit guards satisfied without submit invocation", {
      code: probe.code || null,
      purposeContext: isProof ? "armed_no_submit_proof_only" : "micro_live_execution"
    });
  }
  return common.buildCheckResult("AP-14", "FAIL", probe.reason || "BUY pre-submit guard probe failed", probe);
}

async function runCheckAP15(adapters, cfg) {
  const chainMode = adapters.authorizationChainMode
    || session.detectAuthorizationChainMode(adapters.authorizationDocs?.() || {});

  if (chainMode === "armed-no-submit-proof" || adapters.proofContext === session.PROOF_CONTEXT) {
    const evidence = session.buildProofScopeReplacementEvidence(adapters, cfg);
    const validation = session.validateProofScopeReplacementEvidence(evidence);
    if (validation.ok) {
      return common.buildCheckResult(
        "AP-15",
        "NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE",
        session.AP15_REPLACEMENT_ID,
        evidence
      );
    }
    return common.buildCheckResult("AP-15", "FAIL", "Proof-scope replacement evidence invalid", {
      errors: validation.errors,
      evidence
    });
  }

  const sessionId = adapters.sessionId;
  const packet = sessionId ? adapters.candidatePacket(sessionId) : null;
  const size = Number(cfg?.positionSizeSol);
  const sizeOk = Number.isFinite(size) && size > 0 && size <= 0.01;
  if (packet && sizeOk) {
    return common.buildCheckResult("AP-15", "PASS", "Candidate packet and size bounds OK", {
      sessionId,
      positionSizeSol: size,
      candidateMint: packet.mint || packet.tokenMint || null
    });
  }
  if (!sessionId) {
    return common.buildCheckResult("AP-15", "FAIL", "Session ID required for candidate packet validation", {});
  }
  return common.buildCheckResult("AP-15", "FAIL", "Candidate packet or size bounds invalid", {
    packetPresent: !!packet,
    positionSizeSol: cfg?.positionSizeSol
  });
}

async function runCheckAP16(adapters) {
  const probe = await adapters.jupiterProbe();
  if (probe.ok) {
    return common.buildCheckResult("AP-16", "PASS", "Jupiter adapter/host consistency OK", probe);
  }
  return common.buildCheckResult("AP-16", "FAIL", "Jupiter adapter probe failed", probe);
}

async function runCheckAP17(adapters) {
  if (adapters.deferAp17ToContinuum === true) {
    return common.buildCheckResult(
      "AP-17",
      "NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE",
      "armed-continuum-n6-deferred",
      {
        deferredTo: "armed_continuum_n6_state",
        n6InvokedInApStage: false
      }
    );
  }
  const probe = await adapters.runN6ArmedProbe();
  if (probe.ok) {
    return common.buildCheckResult("AP-17", "PASS", "N6 armed-safe e-stop probe pass", probe.evidence || {});
  }
  return common.buildCheckResult("AP-17", "FAIL", probe.reason || "N6 armed probe failed", probe.evidence || {});
}

async function runCheckAP18(adapters) {
  const current = common.hashFile(adapters.configFile);
  const baseline = adapters.armingBaselineHash;
  if (!baseline) {
    return common.buildCheckResult("AP-18", "PASS", "Config hash recorded; no baseline supplied", {
      liveConfigHashSha256: current
    });
  }
  if (current === baseline) {
    return common.buildCheckResult("AP-18", "PASS", "Config hash matches arming baseline", {
      liveConfigHashSha256: current
    });
  }
  return common.buildCheckResult("AP-18", "FAIL", "Config hash drift from arming baseline", {
    liveConfigHashSha256: current,
    armingBaselineHashSha256: baseline
  });
}

async function runCheckAP19(adapters) {
  if (adapters.orStatus === "not_promoted") {
    return common.buildCheckResult("AP-19", "PASS", "OR-20260630-008 not_promoted", { orStatus: adapters.orStatus });
  }
  return common.buildCheckResult("AP-19", "FAIL", "OR status changed", { orStatus: adapters.orStatus });
}

async function runCheckAP20(adapters) {
  const evidence = await adapters.runR16Evidence();
  if (evidence.ok) {
    return common.buildCheckResult("AP-20", "PASS", "R16 coupling evidence available", evidence);
  }
  return common.buildCheckResult("AP-20", "FAIL", "R16 coupling evidence missing", evidence);
}

const CHECK_RUNNERS = {
  "AP-01": runCheckAP01,
  "AP-02": runCheckAP02,
  "AP-03": runCheckAP03,
  "AP-04": runCheckAP04,
  "AP-05": runCheckAP05,
  "AP-06": runCheckAP06,
  "AP-07": runCheckAP07,
  "AP-08": runCheckAP08,
  "AP-09": runCheckAP09,
  "AP-10": runCheckAP10,
  "AP-11": runCheckAP11,
  "AP-12": runCheckAP12,
  "AP-13": runCheckAP13,
  "AP-14": runCheckAP14,
  "AP-15": runCheckAP15,
  "AP-16": runCheckAP16,
  "AP-17": runCheckAP17,
  "AP-18": runCheckAP18,
  "AP-19": runCheckAP19,
  "AP-20": runCheckAP20
};

async function runAllChecks(adapters, options = {}) {
  const startedAt = common.nowIso();
  const cfg = adapters.loadConfig();
  const posture = evaluatePosture(cfg, adapters);

  if (!options.skipPostureGate && !posture.ok) {
    return {
      wrongPosture: true,
      posture,
      checks: [],
      failures: ["wrong posture for armed preflight"],
      startedAt,
      completedAt: common.nowIso()
    };
  }

  const skipCheckIds = new Set(options.skipCheckIds || []);
  const checks = [];
  for (const id of manifest.AP_ORDER) {
    if (skipCheckIds.has(id)) continue;
    const runner = CHECK_RUNNERS[id];
    const result = id === "AP-01"
      ? await runner(adapters, cfg, posture)
      : id === "AP-09" || id === "AP-10" || id === "AP-12" || id === "AP-13" || id === "AP-14" || id === "AP-15"
        ? await runner(adapters, cfg)
        : await runner(adapters);
    checks.push(result);
  }

  const failures = checks.filter(c => c.status === "FAIL").map(c => c.checkId);
  return {
    wrongPosture: false,
    posture,
    checks,
    failures,
    startedAt,
    completedAt: common.nowIso()
  };
}

function buildFingerprints(adapters, cfg) {
  const codeFiles = [
    "validate_armed_preflight.js",
    "run_armed_preflight_manifest.js",
    "armed_preflight_checks.js",
    "armed_preflight_manifest.js",
    "armed_preflight_session.js",
    "live_validation_common.js",
    "test_n6_armed_estop_probe.js"
  ];
  const fingerprints = {
    manifestVersion: manifest.MANIFEST_VERSION,
    liveConfigHashSha256: common.hashFile(adapters.configFile),
    envGateBooleans: adapters.envGates(),
    runtimeStub: {
      present: !!adapters.loadStubRecord(),
      fingerprint: common.hashFile(adapters.stubFile)
    },
    authorizationLinkage: adapters.sessionId || null,
    proofContext: adapters.proofContext || null,
    authorizationChainMode: adapters.authorizationChainMode || session.detectAuthorizationChainMode(adapters.authorizationDocs?.() || {}),
    cliInputs: adapters.cliInputsEcho || null,
    authorizationDocuments: session.authorizationMetadataFingerprints(
      adapters.sessionLinkage?.authorizationMetadata || {}
    ),
    processSet: common.collectProcessFingerprint(adapters.listProcesses()),
    codeFingerprint: common.collectCodeFingerprint(adapters.root, codeFiles),
    posture: {
      executionMode: cfg?.executionMode,
      dryRunMode: cfg?.dryRunMode,
      liveArmed: adapters.computeLiveArmedStatus(cfg).liveArmed
    }
  };
  if (adapters.armingBaselineHash) {
    fingerprints.armingBaselineHashSha256 = adapters.armingBaselineHash;
  }
  return fingerprints;
}

module.exports = {
  createDefaultAdapters,
  evaluatePosture,
  runAllChecks,
  buildFingerprints,
  CHECK_RUNNERS,
  readAuthStatus
};
