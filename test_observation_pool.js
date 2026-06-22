"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const executor = require("./live_executor");

const observation = executor.__observationPoolTest;
const pipeline = executor.__pipelineDryRunTest;
const auditFile = executor.FILES.EXECUTION_AUDIT_FILE;
const protectedFiles = [
  executor.FILES.LIVE_POSITIONS_FILE,
  executor.FILES.LIVE_TRADES_FILE,
  executor.FILES.ERRORS_FILE,
  "paper_trades.json"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function cfg(executionMode) {
  return {
    executionMode,
    dryRunMode: executionMode !== "LIVE",
    positionSizeSol: 0.1,
    thesis: {
      source: "gmgn_trending",
      scoreMin: 80,
      scoreMax: 89,
      marketCapMin: 100000,
      marketCapMax: 250000,
      botDegenRateMax: 0.05,
      top10HolderRateMin: 0.1,
      top10HolderRateMax: 0.2
    }
  };
}

function candidate(overrides = {}) {
  return {
    timestamp: "2099-01-01T00:00:00.000Z",
    status: "OPEN",
    source: "gmgn_trending",
    symbol: "THESIS_OBSERVATION",
    address: "ThesisObservationMintUnique111111111111111111",
    pairAddress: "ThesisObservationPairUnique11111111111111111",
    score: 85,
    marketCap: 150000,
    botDegenRate: 0.03,
    top10HolderRate: 0.15,
    liquidity: 50000,
    entryPrice: 0.00015,
    ...overrides
  };
}

function auditRowsSince(lineCount) {
  return fs.readFileSync(auditFile, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(lineCount)
    .map(JSON.parse);
}

function mockPipelineSubmitResult() {
  return {
    txSig: null,
    filledPrice: null,
    slippagePct: null,
    feeSol: 0.000255,
    latencyMs: 12,
    isDryRun: true,
    isPipelineDryRun: true,
    pipelineMetadata: {
      unitsConsumed: 180000,
      cuHeadroomVsAssumed: 0.4,
      appliedPriorityFeeLamports: 250000,
      lastValidBlockHeight: 321,
      rawOutputPerInput: 0.5,
      quotedSlippageBps: 300,
      feeBreakdown: {
        baseFeeLamports: 5000,
        priorityFeeLamports: 250000,
        ataRentLamports: 0,
        ataRentAccounted: true,
        ataDetectionMethod: "simulation_logs_scan",
        totalLamports: 255000
      }
    }
  };
}

(async () => {
  const beforeHashes = Object.fromEntries(protectedFiles.map(file => [file, hash(file)]));
  const auditStart = fs.readFileSync(auditFile, "utf8").split(/\r?\n/).filter(Boolean).length;
  const tempDedupFile = path.join(os.tmpdir(), `fomo-obs-dedup-${Date.now()}.json`);
  let submitCalls = 0;
  try {
    observation.setObservationDedupFileForTest(tempDedupFile);
    const thesis = candidate();
    const nonThesis = candidate({
      symbol: "NON_THESIS_OBSERVATION",
      address: "NonThesisObservationMintUnique111111111111111",
      pairAddress: "NonThesisObservationPairUnique11111111111111",
      score: 95,
      thesisMatch: true,
      allowNonThesis: true
    });
    observation.setCandidatePoolForTest([thesis, nonThesis]);
    observation.setPipelineCandidateQueueForTest([]);
    observation.setObservationAuditRowsForTest([]);

    const liveCfg = { ...cfg("LIVE"), allowNonThesis: true, observeBroadPool: true };
    const liveCandidates = observation.findCandidates(liveCfg);
    assert(liveCandidates.length === 1, "LIVE returned a non-thesis candidate");
    assert(liveCandidates[0].address === thesis.address, "LIVE strict selector returned the wrong candidate");
    assert(liveCandidates[0].thesisMatch === true, "LIVE candidate was not recomputed as thesis-matching");

    const singleFailures = [
      { score: 79 },
      { score: 90 },
      { marketCap: 99999 },
      { marketCap: 250001 },
      { botDegenRate: 0.0501 },
      { top10HolderRate: 0.0999 },
      { top10HolderRate: 0.2001 }
    ];
    for (const failure of singleFailures) {
      observation.setCandidatePoolForTest([candidate({ ...failure, address: `Fail${Object.keys(failure)[0]}`, pairAddress: `FailPair${Object.keys(failure)[0]}` })]);
      assert(observation.findStrictThesisCandidates(liveCfg).length === 0,
        `LIVE strict selector accepted single-dimension failure: ${Object.keys(failure)[0]}`);
    }

    observation.setCandidatePoolForTest([]);
    observation.setPipelineCandidateQueueForTest([candidate({
      symbol: "LIVE_IGNORES_PIPELINE_QUEUE",
      address: "LiveIgnoresPipelineQueueMint111111111111111",
      pairAddress: "LiveIgnoresPipelineQueuePair11111111111111",
      candidateIntentId: "live-ignores-pipeline-queue-fixture",
      candidateHandoffSource: "pipeline_candidates"
    })]);
    const liveWithQueuedCandidates = observation.findCandidates(liveCfg);
    assert(liveWithQueuedCandidates.length === 0,
      "LIVE mode ignores non-empty pipeline candidate queue: queued candidate leaked into LIVE output");
    assert(!liveWithQueuedCandidates.some(item => item.candidateHandoffSource === "pipeline_candidates"),
      "LIVE mode selected a pipeline_candidates-sourced candidate");

    observation.setCandidatePoolForTest([thesis, nonThesis]);
    observation.setPipelineCandidateQueueForTest([]);
    const broad = observation.findCandidates(cfg("PIPELINE_DRY_RUN"));
    assert(broad.length === 2, "PIPELINE_DRY_RUN did not expose the broad accepted-paper pool");
    assert(broad.some(item => item.thesisMatch === true), "thesis observation candidate missing");
    assert(broad.some(item => item.thesisMatch === false), "non-thesis observation candidate missing");

    observation.setObservationSubmitSwapForTest(async () => {
      submitCalls += 1;
      return mockPipelineSubmitResult();
    });

    observation.resetObservationDedupForTest();
    await observation.observePipelineCandidate(cfg("PIPELINE_DRY_RUN"), broad.find(item => !item.thesisMatch));
    const duplicate = await observation.observePipelineCandidate(cfg("PIPELINE_DRY_RUN"), broad.find(item => !item.thesisMatch));
    assert(duplicate.action === "OBSERVATION_SKIPPED_DUPLICATE", "duplicate observation was not skipped");
    assert(submitCalls === 1, "duplicate observation re-ran the pipeline");

    const liveAfterObservation = observation.findCandidates(liveCfg);
    assert(liveAfterObservation.some(item => item.address === thesis.address),
      "observation dedup blocked a future strict LIVE candidate");

    await observation.observePipelineCandidate(cfg("PIPELINE_DRY_RUN"), broad.find(item => item.thesisMatch));
    assert(submitCalls === 2, "thesis observation did not run through audit-only observer");

    for (const file of protectedFiles) {
      assert(hash(file) === beforeHashes[file], `observation modified protected operational file: ${file}`);
    }

    const rows = auditRowsSince(auditStart).filter(row => row.stage === "PIPELINE_DRY_RUN");
    const nonThesisAudit = rows.find(row => row.payload?.sourcePool === "non_thesis_observation");
    const thesisAudit = rows.find(row => row.payload?.sourcePool === "thesis_observation");
    for (const [label, row, expectedMatch] of [
      ["non-thesis", nonThesisAudit, false],
      ["thesis", thesisAudit, true]
    ]) {
      assert(row, `${label} observation audit missing`);
      assert(row.payload.executionMode === "PIPELINE_DRY_RUN", `${label} executionMode missing`);
      assert(row.payload.thesisMatch === expectedMatch, `${label} thesisMatch incorrect`);
      assert(row.payload.observationOnly === true, `${label} observationOnly missing`);
      assert(row.payload.realMoneyMoved === false && row.payload.signed === false &&
        row.payload.submitted === false && row.payload.livePositionCreated === false,
      `${label} audit safety fields incorrect`);
    }

    const beforeDryAudit = fs.statSync(auditFile).size;
    const dry = await pipeline.submitSwapForTest("BUY", {
      cfg: cfg("DRY_RUN"),
      tokenAddress: thesis.address,
      pairAddress: thesis.pairAddress,
      expectedPrice: thesis.entryPrice,
      positionSizeSol: 0.1
    });
    assert(dry.isDryRun === true && !dry.isPipelineDryRun, "DRY_RUN legacy result changed");
    assert(fs.statSync(auditFile).size === beforeDryAudit, "DRY_RUN unexpectedly ran the pipeline");

    // ─── M3: dedup snapshot restart / crash-window / cooldown persistence ───────
    observation.resetObservationDedupForTest();
    observation.setObservationAuditRowsForTest([]);
    const restartCandidate = candidate({
      symbol: "RESTART_PERSIST",
      address: "RestartPersistMint111111111111111111111111",
      pairAddress: "RestartPersistPair111111111111111111111111",
      candidateIntentId: "restart-persist-fixture-intent"
    });
    observation.setCandidatePoolForTest([restartCandidate]);
    observation.setPipelineCandidateQueueForTest([]);
    let restartSubmitCalls = 0;
    observation.setObservationSubmitSwapForTest(async () => {
      restartSubmitCalls += 1;
      return mockPipelineSubmitResult();
    });
    const restartObserve = await observation.observePipelineCandidate(cfg("PIPELINE_DRY_RUN"), restartCandidate);
    assert(restartObserve.action === "OBSERVED", "restart fixture was not observed");
    assert(fs.existsSync(tempDedupFile), "observation_dedup snapshot was not written");
    const snapshotAfterObserve = JSON.parse(fs.readFileSync(tempDedupFile, "utf8"));
    assert(snapshotAfterObserve.schemaVersion === 1, "snapshot schemaVersion missing");
    assert(snapshotAfterObserve.observedKeys.includes(`intent|${restartCandidate.candidateIntentId}`),
      "snapshot missing observed intent key");

    observation.resetObservationDedupForTest();
    observation.setObservationAuditRowsForTest([]);
    observation.seedObservedPipelineCandidatesFromAudit({ force: true });
    const restartDuplicate = await observation.observePipelineCandidate(cfg("PIPELINE_DRY_RUN"), restartCandidate);
    assert(restartDuplicate.action === "OBSERVATION_SKIPPED_DUPLICATE",
      "restart re-seed from snapshot did not skip duplicate observation");
    assert(restartSubmitCalls === 1, "restart duplicate observation re-ran the pipeline");

    observation.resetObservationDedupForTest();
    observation.setObservationAuditRowsForTest([]);
    fs.writeFileSync(tempDedupFile, `${JSON.stringify({
      schemaVersion: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      observedKeys: ["intent|crash-window-fixture-intent"],
      pairLastObservedMs: {}
    }, null, 2)}\n`);
    observation.seedObservedPipelineCandidatesFromAudit({ force: true });
    const crashCandidate = candidate({
      symbol: "CRASH_WINDOW",
      address: "CrashWindowMint1111111111111111111111111",
      pairAddress: "CrashWindowPair1111111111111111111111111",
      candidateIntentId: "crash-window-fixture-intent"
    });
    let crashSubmitCalls = 0;
    observation.setObservationSubmitSwapForTest(async () => {
      crashSubmitCalls += 1;
      return mockPipelineSubmitResult();
    });
    const crashDuplicate = await observation.observePipelineCandidate(cfg("PIPELINE_DRY_RUN"), crashCandidate);
    assert(crashDuplicate.action === "OBSERVATION_SKIPPED_DUPLICATE",
      "snapshot-only crash window did not block duplicate observation");
    assert(crashSubmitCalls === 0, "crash-window duplicate observation ran submit");

    const cooldownAddress = "CooldownPersistMint111111111111111111111111";
    const cooldownPair = "CooldownPersistPair111111111111111111111111";
    const cooldownBaseMs = new Date("2026-01-01T00:00:00.000Z").getTime();
    const cooldownWithinMs = new Date("2026-01-01T00:30:00.000Z").getTime();
    fs.writeFileSync(tempDedupFile, `${JSON.stringify({
      schemaVersion: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      observedKeys: ["intent|cooldown-base-intent"],
      pairLastObservedMs: {
        [`address_pair|${cooldownAddress}|${cooldownPair}`]: cooldownBaseMs
      }
    }, null, 2)}\n`);
    observation.resetObservationDedupForTest();
    observation.setObservationAuditRowsForTest([]);
    observation.seedObservedPipelineCandidatesFromAudit({ force: true });
    observation.setPipelineCandidateQueueForTest([candidate({
      symbol: "COOLDOWN_WITHIN",
      address: cooldownAddress,
      pairAddress: cooldownPair,
      candidateIntentId: "cooldown-within-intent",
      timestamp: "2026-01-01T00:30:00.000Z",
      candidateHandoffSource: "pipeline_candidates"
    })]);
    observation.setCandidatePoolForTest([]);
    const withinCooldown = observation.findCandidates(cfg("PIPELINE_DRY_RUN"));
    assert(withinCooldown.length === 0, "pair cooldown was not preserved across restart re-seed");
    const withinStats = observation.getLastPipelineObservationSelectionStatsForTest();
    assert(withinStats.skippedByPairCooldown === 1,
      "within-cooldown candidate was not counted as pair cooldown skip");

    observation.resetObservationDedupForTest();
    observation.setPipelineCandidateQueueForTest([candidate({
      symbol: "COOLDOWN_EXPIRED",
      address: cooldownAddress,
      pairAddress: cooldownPair,
      candidateIntentId: "cooldown-expired-intent",
      timestamp: "2026-01-01T01:01:00.000Z",
      candidateHandoffSource: "pipeline_candidates"
    })]);
    observation.seedObservedPipelineCandidatesFromAudit({ force: true });
    const expiredCooldown = observation.findCandidates(cfg("PIPELINE_DRY_RUN"));
    assert(expiredCooldown.length === 1,
      "expired pair cooldown was not allowed after restart re-seed");
    assert(expiredCooldown[0].candidateIntentId === "cooldown-expired-intent",
      "expired cooldown candidate intent id not preserved");

    observation.resetObservationDedupForTest();
    observation.setObservationAuditRowsForTest([{
      timestamp: "2026-01-01T00:00:00.000Z",
      eventType: "EXECUTION_STAGE",
      stage: "PIPELINE_DRY_RUN",
      payload: {
        candidateIntentId: "merge-audit-intent",
        address: "MergeAuditMint11111111111111111111111111",
        pairAddress: "MergeAuditPair11111111111111111111111111"
      }
    }]);
    fs.writeFileSync(tempDedupFile, `${JSON.stringify({
      schemaVersion: 1,
      updatedAt: "2026-01-01T01:00:00.000Z",
      observedKeys: [],
      pairLastObservedMs: {
        "address_pair|MergeAuditMint11111111111111111111111111|MergeAuditPair11111111111111111111111111": cooldownWithinMs
      }
    }, null, 2)}\n`);
    observation.seedObservedPipelineCandidatesFromAudit({ force: true });
    const mergedPairTs = observation.getObservedPairTimestampsForTest();
    const mergePairKey = "address_pair|MergeAuditMint11111111111111111111111111|MergeAuditPair11111111111111111111111111";
    assert(mergedPairTs[mergePairKey] === cooldownWithinMs,
      "audit/snapshot merge did not use max pair timestamp");

    console.log("NON-THESIS OBSERVATION AUDIT:");
    console.log(JSON.stringify(nonThesisAudit));
    console.log("THESIS OBSERVATION AUDIT:");
    console.log(JSON.stringify(thesisAudit));
    console.log("OBSERVATION POOL TEST PASSED");
    console.log("LIVE strict selection structural; observation writes operational state: 0");
  } finally {
    observation.resetCandidatePoolForTest();
    observation.resetPipelineCandidateQueueForTest();
    observation.resetObservationSubmitSwapForTest();
    observation.resetObservationAuditRowsForTest();
    observation.resetObservationDedupForTest();
    observation.resetObservationDedupFileForTest();
    if (fs.existsSync(tempDedupFile)) fs.unlinkSync(tempDedupFile);
  }
})().catch(error => {
  console.error("OBSERVATION POOL TEST FAILED:", error.message);
  process.exitCode = 1;
});
