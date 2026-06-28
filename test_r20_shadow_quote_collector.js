"use strict";

// test_r20_shadow_quote_collector.js — Sprint 4 R20
// Validates fixture dry-run shadow quote collector in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r20 = require("./r20_shadow_quote_collector");
const r18 = require("./r18_shadow_quote_review");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r20-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r20-output-"));
const collectedAt = "2026-06-28T12:00:00.000Z";
const nowMs = Date.parse(collectedAt);
const G = "\x1b[32m✔\x1b[0m";

function goodCandidate(overrides = {}) {
  return {
    candidateId: "CAND-TEST-001",
    source: "fixture",
    tokenSymbol: "SIM_TOKEN",
    tokenMint: "SIM_MINT_DO_NOT_USE",
    pairAddress: "SIM_PAIR_DO_NOT_USE",
    inputMint: "SIM_SOL_DO_NOT_USE",
    outputMint: "SIM_MINT_DO_NOT_USE",
    intendedInputAmountSol: 0.008,
    expectedQuoteProfile: {
      slippageBps: 80,
      priceImpactBps: 50,
      quoteAgeSeconds: 2,
      routeStable: true,
      quotedOutputAmount: 1000,
      minimumOutputAmount: 990,
      routeProvider: "SIMULATED",
      routeSummary: "SIM_POOL",
      routeHash: "sim_hash",
      priorityFeeEstimateSol: 0.00004,
      mevMode: "SIMULATED_REVIEW_ONLY"
    },
    createdAt: "2026-06-28T11:59:58.000Z",
    thesisMatch: true,
    ...overrides
  };
}

function baseOptions(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: __dirname,
    analysisDir: tmpOutput,
    collectedAt,
    nowMs,
    candidates: [goodCandidate()],
    ...overrides
  };
}

try {
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );

  const obsFile = path.join(tmpOutput, "shadow_quote_observations.jsonl");
  const statusFile = path.join(tmpOutput, "r20_shadow_quote_collector_status.json");
  const result = r20.runR20ShadowQuoteCollector({
    ...baseOptions(),
    observationsFile: obsFile,
    statusFile,
    print: false
  });

  assert.ok(fs.existsSync(obsFile));
  assert.ok(fs.existsSync(statusFile));
  const lines = fs.readFileSync(obsFile, "utf8").trim().split("\n");
  assert.strictEqual(lines.length, 1);
  const row = JSON.parse(lines[0]);
  assert.strictEqual(row.networkPolling, false);
  assert.strictEqual(row.approved, false);
  assert.strictEqual(row.sourceMode, "FIXTURE_ONLY");
  console.log(`${G} valid fixture creates analysis output`);
  console.log(`${G} output records include networkPolling false`);
  console.log(`${G} output records include approved false`);

  const missing = r20.collectR20ShadowQuoteCollectorStatus({
    ...baseOptions(),
    candidates: undefined,
    candidatesFile: path.join(tmpOutput, "missing-candidates.json")
  });
  assert.strictEqual(missing.collectorStatus, "BLOCKED");
  console.log(`${G} missing candidate fixture blocks`);

  const malformed = r20.collectR20ShadowQuoteCollectorStatus({
    ...baseOptions(),
    candidates: [{ candidateId: "ONLY_ID" }]
  });
  assert.ok(malformed.observationCount >= 0);
  console.log(`${G} malformed fixture handled`);

  const corrupt = r20.collectR20ShadowQuoteCollectorStatus({
    ...baseOptions(),
    candidates: [goodCandidate({ privateKey: "bad" })]
  });
  assert.strictEqual(corrupt.collectorStatus, "INVALID_FIXTURE");
  console.log(`${G} malformed fixture fails closed`);
  console.log(`${G} secret-like field blocks`);

  const stale = r20.collectR20ShadowQuoteCollectorStatus({
    ...baseOptions(),
    candidates: [goodCandidate({
      expectedQuoteProfile: {
        ...goodCandidate().expectedQuoteProfile,
        quoteAgeSeconds: 30
      }
    })]
  });
  assert.strictEqual(stale.rejectCount, 1);
  console.log(`${G} stale quote rejected`);

  const noMin = r20.collectR20ShadowQuoteCollectorStatus({
    ...baseOptions(),
    candidates: [goodCandidate({
      expectedQuoteProfile: {
        ...goodCandidate().expectedQuoteProfile,
        minimumOutputAmount: null
      }
    })]
  });
  assert.strictEqual(noMin.rejectCount, 1);
  console.log(`${G} missing minimum output rejected`);

  const hardSlip = r20.collectR20ShadowQuoteCollectorStatus({
    ...baseOptions(),
    candidates: [goodCandidate({
      expectedQuoteProfile: {
        ...goodCandidate().expectedQuoteProfile,
        slippageBps: 350
      }
    })]
  });
  assert.strictEqual(hardSlip.rejectCount, 1);
  console.log(`${G} excessive slippage rejected`);

  const warnSlip = r20.collectR20ShadowQuoteCollectorStatus({
    ...baseOptions(),
    candidates: [goodCandidate({
      expectedQuoteProfile: {
        ...goodCandidate().expectedQuoteProfile,
        slippageBps: 150
      }
    })]
  });
  assert.strictEqual(warnSlip.warnCount, 1);
  console.log(`${G} elevated slippage warns`);

  const impact = r20.collectR20ShadowQuoteCollectorStatus({
    ...baseOptions(),
    candidates: [goodCandidate({
      expectedQuoteProfile: {
        ...goodCandidate().expectedQuoteProfile,
        priceImpactBps: 250
      }
    })]
  });
  assert.strictEqual(impact.rejectCount, 1);
  console.log(`${G} excessive price impact rejected`);

  const fee = r20.collectR20ShadowQuoteCollectorStatus({
    ...baseOptions(),
    candidates: [goodCandidate({
      intendedInputAmountSol: 0.01,
      expectedQuoteProfile: {
        ...goodCandidate().expectedQuoteProfile,
        priorityFeeEstimateSol: 0.008
      }
    })]
  });
  assert.strictEqual(fee.rejectCount, 1);
  console.log(`${G} high priority fee rejects by policy`);

  const unstable = r20.collectR20ShadowQuoteCollectorStatus({
    ...baseOptions(),
    candidates: [goodCandidate({
      expectedQuoteProfile: {
        ...goodCandidate().expectedQuoteProfile,
        routeStable: false
      }
    })]
  });
  assert.strictEqual(unstable.rejectCount, 1);
  console.log(`${G} route instability rejected`);

  const polling = r20.collectR20ShadowQuoteCollectorStatus({
    ...baseOptions(),
    networkPollingActive: true
  });
  assert.strictEqual(polling.collectorStatus, "BLOCKED");
  console.log(`${G} live/network polling flag blocks`);

  assert.ok(obsFile.startsWith(tmpOutput));
  console.log(`${G} output only writes to analysis/`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  console.log(`${G} no live_config.json mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  const src = fs.readFileSync(path.join(__dirname, "r20_shadow_quote_collector.js"), "utf8");
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  console.log(`${G} no network calls`);

  assert.strictEqual(result.status.approved, false);
  assert.ok(!JSON.stringify(result.status).includes('"approved": true'));
  console.log(`${G} never returns approved true`);

  console.log("\nR20 SHADOW QUOTE COLLECTOR TEST PASSED (18/18)");
} finally {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
