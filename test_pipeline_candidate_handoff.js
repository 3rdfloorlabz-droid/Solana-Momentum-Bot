"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const scanner = require("./scanner_gmgn_trending");
const executor = require("./live_executor");
const { computeScannerThesisMatch } = scanner;

const observation = executor.__observationPoolTest;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
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

function scannerCandidate(overrides = {}) {
  return {
    symbol: "HANDOFF",
    name: "Pipeline Handoff",
    address: "HandoffMintUnique22222222222222222222222222",
    pairAddress: "HandoffPairUnique22222222222222222222222222",
    score: 82,
    liquidity: 55000,
    marketCap: 175000,
    poolLiquidity: 56000,
    holderCount: 900,
    top10HolderRate: 0.15,
    botDegenRate: 0.03,
    bundlerRate: 0.02,
    volume5m: 100000,
    volume1h: 500000,
    buys5m: 200,
    sells5m: 100,
    priceUsd: 0.0002,
    url: "https://dexscreener.com/solana/HandoffPairUnique22222222222222222222222222",
    ...overrides
  };
}

function emptyDedupSnapshot() {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    observedKeys: [],
    pairLastObservedMs: {}
  };
}

(async () => {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fomo-handoff-"));
  const protectedFiles = [
    executor.FILES.LIVE_POSITIONS_FILE,
    executor.FILES.LIVE_TRADES_FILE,
    executor.FILES.ERRORS_FILE,
    executor.FILES.PIPELINE_CANDIDATES_FILE,
    "paper_trades.json"
  ].filter(file => fs.existsSync(file));
  const beforeHashes = Object.fromEntries(protectedFiles.map(file => [file, hash(file)]));
  const tempDedupFile = path.join(os.tmpdir(), `fomo-handoff-dedup-${Date.now()}.json`);

  let submitCalls = 0;
  try {
    observation.setObservationDedupFileForTest(tempDedupFile);
    const resetObservationDedupState = () => {
      fs.writeFileSync(tempDedupFile, `${JSON.stringify(emptyDedupSnapshot(), null, 2)}\n`);
      observation.resetObservationDedupForTest();
    };
    process.chdir(tempDir);
    scanner.logPaperTrade(scannerCandidate());
    const paperRows = readJsonLines(scanner.PAPER_FILE);
    const queueRows = readJsonLines(scanner.PIPELINE_CANDIDATES_FILE);
    assert(paperRows.length === 1, "scanner did not append one paper trade");
    assert(queueRows.length === 1, "scanner did not append one pipeline candidate intent");

    const intent = queueRows[0];
    assert(intent.candidateIntentId, "candidateIntentId missing");
    assert(intent.timestamp === paperRows[0].timestamp, "pipeline intent timestamp must match paper trade timestamp");
    for (const field of [
      "source", "strategyVersion", "monitorVersion", "symbol", "name", "address", "pairAddress",
      "score", "liquidity", "marketCap", "poolLiquidity", "holderCount", "top10HolderRate",
      "botDegenRate", "bundlerRate", "volume5m", "volume1h", "buys5m", "sells5m",
      "entryPrice", "targetPrice", "stopPrice", "chart",
      "thesisMatch", "thesisFailureReasons"
    ]) {
      assert(Object.prototype.hasOwnProperty.call(intent, field), `pipeline intent missing ${field}`);
    }

    // M1: default eligible fixture must be thesis-matching
    assert(intent.thesisMatch === true,
      `default eligible fixture should have thesisMatch:true (got ${intent.thesisMatch})`);
    assert(Array.isArray(intent.thesisFailureReasons) && intent.thesisFailureReasons.length === 0,
      `default eligible fixture should have empty thesisFailureReasons (got ${JSON.stringify(intent.thesisFailureReasons)})`);
    assert(paperRows[0].thesisMatch === true,
      `paper trade row should have thesisMatch:true for default eligible fixture`);
    assert(Array.isArray(paperRows[0].thesisFailureReasons),
      `paper trade row should have thesisFailureReasons array`);

    // M1: high-botRate fixture must fail thesis
    const highBotCandidate = scannerCandidate({ botDegenRate: 0.08 });
    const highBotResult = computeScannerThesisMatch(highBotCandidate);
    assert(highBotResult.thesisMatch === false,
      `botDegenRate 0.08 fixture should have thesisMatch:false`);
    assert(highBotResult.thesisFailureReasons.some(r => r.includes("botDegenRate")),
      `botDegenRate 0.08 fixture should report botDegenRate failure reason`);

    // M1: out-of-range marketCap must fail thesis
    const highMcCandidate = scannerCandidate({ marketCap: 900000 });
    const highMcResult = computeScannerThesisMatch(highMcCandidate);
    assert(highMcResult.thesisMatch === false,
      `marketCap 900k fixture should have thesisMatch:false`);
    assert(highMcResult.thesisFailureReasons.some(r => r.includes("marketCap")),
      `marketCap 900k fixture should report marketCap failure reason`);

    process.chdir(originalCwd);

    const openPaperTrade = { ...paperRows[0], status: "OPEN" };
    const closedPaperTrade = { ...paperRows[0], status: "WIN", closedAt: new Date().toISOString(), pnlPercent: 12.34 };
    const sameSymbolDifferentPair = {
      ...paperRows[0],
      status: "OPEN",
      address: "HandoffMintDifferent3333333333333333333333333",
      pairAddress: "HandoffPairDifferent3333333333333333333333333"
    };
    observation.setCandidatePoolForTest([openPaperTrade]);
    observation.setPipelineCandidateQueueForTest([intent]);
    observation.setObservationAuditRowsForTest([]);
    observation.setObservationSubmitSwapForTest(async () => {
      submitCalls += 1;
      return {
        txSig: null,
        filledPrice: null,
        slippagePct: null,
        feeSol: 0.000255,
        latencyMs: 7,
        isDryRun: true,
        isPipelineDryRun: true,
        pipelineMetadata: {
          unitsConsumed: 180000,
          cuHeadroomVsAssumed: 0.4,
          appliedPriorityFeeLamports: 250000,
          lastValidBlockHeight: 123,
          rawOutputPerInput: 0.5,
          quotedSlippageBps: 300
        }
      };
    });

    resetObservationDedupState();
    observation.setObservationAuditRowsForTest([]);

    const pipelineCandidates = observation.findCandidates(cfg("PIPELINE_DRY_RUN"));
    assert(pipelineCandidates.length === 1, "PIPELINE_DRY_RUN did not expose queued candidate");
    assert(pipelineCandidates[0].candidateHandoffSource === "pipeline_candidates",
      "queued candidate did not preserve pipeline_candidates source");
    assert(pipelineCandidates[0].candidateIntentId === intent.candidateIntentId,
      "queued candidate intent id not preserved");
    assert(!pipelineCandidates.some(item => item.candidateHandoffSource === "paper_trades_open"),
      "same address/pair appeared from both queue and open paper trades");

    observation.setCandidatePoolForTest([sameSymbolDifferentPair]);
    const distinctPairCandidates = observation.findCandidates(cfg("PIPELINE_DRY_RUN"));
    assert(distinctPairCandidates.length === 2,
      "same symbol with different address/pair was incorrectly deduped");
    assert(new Set(distinctPairCandidates.map(item => item.pairAddress)).size === 2,
      "distinct address/pair candidates collapsed into one observation candidate");
    observation.setCandidatePoolForTest([closedPaperTrade]);

    const liveCandidates = observation.findCandidates(cfg("LIVE"));
    assert(liveCandidates.length === 0, "LIVE mode traded or selected from closed queued candidate");

    const first = await observation.observePipelineCandidate(cfg("PIPELINE_DRY_RUN"), pipelineCandidates[0]);
    assert(first.action === "OBSERVED", "queued candidate was not observed");
    const duplicate = await observation.observePipelineCandidate(cfg("PIPELINE_DRY_RUN"), pipelineCandidates[0]);
    assert(duplicate.action === "OBSERVATION_SKIPPED_DUPLICATE", "queued duplicate was not skipped");
    assert(submitCalls === 1, "dedupe allowed repeated queued observation");

    const observedKeys = observation.getObservedCandidateKeysForTest();
    assert(observedKeys.includes(`intent|${intent.candidateIntentId}`),
      "dedupe key did not prefer candidate intent identity");

    const quoteFailCandidate = {
      ...intent,
      symbol: "QUOTE_ABORT",
      address: "QuoteAbortMint444444444444444444444444444",
      pairAddress: "QuoteAbortPair444444444444444444444444444",
      candidateIntentId: "quote-abort-fixture"
    };
    resetObservationDedupState();
    observation.setObservationAuditRowsForTest([]);
    observation.setPipelineCandidateQueueForTest([quoteFailCandidate]);
    observation.setCandidatePoolForTest([]);
    observation.setObservationSubmitSwapForTest(async () => {
      submitCalls += 1;
      const error = new Error("Jupiter quote retrieval failed.");
      error.code = "QUOTE_FAILED";
      error.stage = "QUOTE";
      throw error;
    });
    const abortCandidate = observation.findCandidates(cfg("PIPELINE_DRY_RUN"))[0];
    const aborted = await observation.observePipelineCandidate(cfg("PIPELINE_DRY_RUN"), abortCandidate);
    assert(aborted.action === "OBSERVATION_ABORTED",
      "typed quote failure should return OBSERVATION_ABORTED");
    assert(aborted.code === "QUOTE_FAILED" && aborted.stage === "QUOTE",
      "typed observation abort did not preserve code/stage");
    assert(aborted.candidateHandoffSource === "pipeline_candidates",
      "typed observation abort did not preserve handoff source");
    assert(aborted.realMoneyMoved === false &&
      aborted.signed === false &&
      aborted.submitted === false &&
      aborted.livePositionCreated === false,
    "typed observation abort did not preserve safety invariant fields");

    resetObservationDedupState();
    observation.setObservationAuditRowsForTest([]);
    observation.setPipelineCandidateQueueForTest([quoteFailCandidate]);
    observation.setCandidatePoolForTest([]);
    observation.setObservationSubmitSwapForTest(async () => {
      throw new Error("unexpected observation failure");
    });
    const unexpected = await executor.runCycle();
    assert(unexpected.action === "OBSERVATION_ERROR",
      "unexpected observation exception should still return OBSERVATION_ERROR");

    resetObservationDedupState();
    observation.setObservationAuditRowsForTest([{
      eventType: "EXECUTION_STAGE",
      stage: "PIPELINE_DRY_RUN",
      payload: {
        candidateIntentId: quoteFailCandidate.candidateIntentId,
        address: quoteFailCandidate.address,
        pairAddress: quoteFailCandidate.pairAddress
      }
    }]);
    observation.setPipelineCandidateQueueForTest([quoteFailCandidate]);
    observation.setCandidatePoolForTest([]);
    const replayCandidates = observation.findCandidates(cfg("PIPELINE_DRY_RUN"));
    assert(replayCandidates.length === 0,
      "prior PIPELINE_DRY_RUN audit row did not suppress stale queued candidate replay");
    const replayStats = observation.getLastPipelineObservationSelectionStatsForTest();
    assert(replayStats.skippedByIntentDedupe === 1,
      "prior PIPELINE_DRY_RUN audit row was not counted as intent dedupe");

    const legacyCandidate = {
      ...quoteFailCandidate,
      candidateIntentId: undefined,
      timestamp: "2026-01-01T00:30:00.000Z"
    };
    resetObservationDedupState();
    observation.setObservationAuditRowsForTest([{
      timestamp: "2026-01-01T00:00:00.000Z",
      eventType: "EXECUTION_STAGE",
      stage: "PIPELINE_DRY_RUN",
      payload: {
        address: legacyCandidate.address,
        pairAddress: legacyCandidate.pairAddress
      }
    }]);
    observation.setPipelineCandidateQueueForTest([legacyCandidate]);
    observation.setCandidatePoolForTest([]);
    const legacyReplayCandidates = observation.findCandidates(cfg("PIPELINE_DRY_RUN"));
    assert(legacyReplayCandidates.length === 0,
      "legacy audit row without candidateIntentId did not suppress fallback address/pair replay");
    const legacyReplayStats = observation.getLastPipelineObservationSelectionStatsForTest();
    assert(legacyReplayStats.skippedByFallbackPairDedupe === 1,
      "legacy audit row without candidateIntentId was not counted as fallback pair dedupe");

    const cooldownCandidate = {
      ...quoteFailCandidate,
      candidateIntentId: "quote-abort-new-intent-within-cooldown",
      timestamp: "2026-01-01T00:30:00.000Z"
    };
    resetObservationDedupState();
    observation.setObservationAuditRowsForTest([{
      timestamp: "2026-01-01T00:00:00.000Z",
      eventType: "EXECUTION_STAGE",
      stage: "PIPELINE_DRY_RUN",
      payload: {
        candidateIntentId: quoteFailCandidate.candidateIntentId,
        address: cooldownCandidate.address,
        pairAddress: cooldownCandidate.pairAddress
      }
    }]);
    observation.setPipelineCandidateQueueForTest([cooldownCandidate]);
    const cooldownCandidates = observation.findCandidates(cfg("PIPELINE_DRY_RUN"));
    assert(cooldownCandidates.length === 0,
      "same address/pair with new candidateIntentId was allowed inside 60-minute cooldown");
    const cooldownStats = observation.getLastPipelineObservationSelectionStatsForTest();
    assert(cooldownStats.skippedByPairCooldown === 1,
      "same address/pair within cooldown was not counted as pair cooldown");

    const expiredCooldownCandidate = {
      ...cooldownCandidate,
      candidateIntentId: "quote-abort-new-intent-after-cooldown",
      timestamp: "2026-01-01T01:01:00.000Z"
    };
    resetObservationDedupState();
    observation.setObservationAuditRowsForTest([{
      timestamp: "2026-01-01T00:00:00.000Z",
      eventType: "EXECUTION_STAGE",
      stage: "PIPELINE_DRY_RUN",
      payload: {
        candidateIntentId: quoteFailCandidate.candidateIntentId,
        address: expiredCooldownCandidate.address,
        pairAddress: expiredCooldownCandidate.pairAddress
      }
    }]);
    observation.setPipelineCandidateQueueForTest([expiredCooldownCandidate]);
    const expiredCooldownCandidates = observation.findCandidates(cfg("PIPELINE_DRY_RUN"));
    assert(expiredCooldownCandidates.length === 1,
      "same address/pair with new candidateIntentId was not allowed after 60-minute cooldown");
    assert(expiredCooldownCandidates[0].candidateIntentId === expiredCooldownCandidate.candidateIntentId,
      "expired cooldown candidate did not preserve new candidateIntentId");

    observation.setCandidatePoolForTest([openPaperTrade]);
    const liveAfterSeededObservation = observation.findCandidates(cfg("LIVE"));
    assert(liveAfterSeededObservation.length === 1,
      "observation audit seeding affected LIVE strict-thesis selection");

    for (const file of protectedFiles) {
      assert(hash(file) === beforeHashes[file], `test modified protected runtime file: ${file}`);
    }

    console.log("PIPELINE CANDIDATE HANDOFF TEST PASSED");
    console.log(`scannerIntentId=${intent.candidateIntentId}`);
    console.log("queued closed paper candidate observed in PIPELINE_DRY_RUN only; LIVE selected 0 candidates");
  } finally {
    process.chdir(originalCwd);
    observation.resetCandidatePoolForTest();
    observation.resetPipelineCandidateQueueForTest();
    observation.resetObservationSubmitSwapForTest();
    observation.resetObservationAuditRowsForTest();
    observation.resetObservationDedupForTest();
    observation.resetObservationDedupFileForTest();
    if (fs.existsSync(tempDedupFile)) fs.unlinkSync(tempDedupFile);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
})().catch(error => {
  console.error("PIPELINE CANDIDATE HANDOFF TEST FAILED:", error.message);
  process.exitCode = 1;
});
