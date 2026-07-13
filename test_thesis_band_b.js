"use strict";

/**
 * Thesis Band B — parallel, observation-only market-cap band (250k-600k),
 * added 2026-07-13 alongside the original Band A (100k-250k). See the
 * BAND_B_* constants and calibration comment above
 * computeScannerThesisMatchBandB() in scanner_gmgn_trending.js for the
 * historical near_misses.json reasoning behind these specific thresholds.
 *
 * Scope of this file: prove Band B classifies independently and correctly,
 * prove Band A is completely unaffected (regression), and prove the new
 * record fields are additive only. Not a proof that Band B is profitable —
 * there is no outcome data for it yet, by design (see the comment in
 * scanner_gmgn_trending.js).
 */

const assert = require("assert");
const scanner = require("./scanner_gmgn_trending");
const executor = require("./live_executor");

const { computeScannerThesisMatch, computeScannerThesisMatchBandB, buildPaperTradeRecord } = scanner;
const { matchesPhase1Thesis, matchesPhase1ThesisBandB } = executor;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`✔ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`✘ ${name}`);
    console.error(`  ${error.stack || error.message}`);
  }
}

function scannerCandidate(overrides = {}) {
  return {
    symbol: "BANDB",
    name: "Band B Fixture",
    address: "BandBMintUnique22222222222222222222222222222",
    pairAddress: "BandBPairUnique22222222222222222222222222222",
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
    url: "https://dexscreener.com/solana/BandBPairUnique22222222222222222222222222222",
    ...overrides
  };
}

function executorTrade(overrides = {}) {
  return {
    source: "gmgn_trending",
    score: 82,
    marketCap: 175000,
    botDegenRate: 0.03,
    top10HolderRate: 0.15,
    liquidity: 55000,
    pairAddress: "BandBPairUnique22222222222222222222222222222",
    entryPrice: 0.0002,
    ...overrides
  };
}

(() => {
  test("Band A unchanged: default fixture still matches Band A thesis", () => {
    const result = computeScannerThesisMatch(scannerCandidate());
    assert.strictEqual(result.thesisMatch, true);
    assert.deepStrictEqual(result.thesisFailureReasons, []);
  });

  test("Band A unchanged: 400k marketCap still fails Band A (regression)", () => {
    const result = computeScannerThesisMatch(scannerCandidate({ marketCap: 400000 }));
    assert.strictEqual(result.thesisMatch, false);
    assert.ok(result.thesisFailureReasons.some(r => r.includes("marketCap")));
  });

  test("Band B: candidate in 250k-600k with score>=79, low bot rate, ok top10 matches", () => {
    const result = computeScannerThesisMatchBandB(
      scannerCandidate({ marketCap: 400000, score: 82, botDegenRate: 0.08, top10HolderRate: 0.22 })
    );
    assert.strictEqual(result.thesisMatchBandB, true, JSON.stringify(result.thesisFailureReasonsBandB));
    assert.deepStrictEqual(result.thesisFailureReasonsBandB, []);
  });

  test("Band B: same candidate but marketCap 175000 (Band A range) fails Band B", () => {
    const result = computeScannerThesisMatchBandB(
      scannerCandidate({ marketCap: 175000, score: 82, botDegenRate: 0.08, top10HolderRate: 0.22 })
    );
    assert.strictEqual(result.thesisMatchBandB, false);
    assert.ok(result.thesisFailureReasonsBandB.some(r => r.includes("marketCap")));
  });

  test("Band B: marketCap 700000 (above Band B ceiling) fails Band B", () => {
    const result = computeScannerThesisMatchBandB(scannerCandidate({ marketCap: 700000 }));
    assert.strictEqual(result.thesisMatchBandB, false);
    assert.ok(result.thesisFailureReasonsBandB.some(r => r.includes("marketCap")));
  });

  test("Band B: score 78 fails (below the real MIN_SCORE_TO_LOG-aligned floor of 79)", () => {
    const result = computeScannerThesisMatchBandB(scannerCandidate({ marketCap: 400000, score: 78 }));
    assert.strictEqual(result.thesisMatchBandB, false);
    assert.ok(result.thesisFailureReasonsBandB.some(r => r.includes("score")));
  });

  test("Band B: score 79 exactly passes the floor (all else satisfied)", () => {
    const result = computeScannerThesisMatchBandB(
      scannerCandidate({ marketCap: 400000, score: 79, botDegenRate: 0.03, top10HolderRate: 0.15 })
    );
    assert.strictEqual(result.thesisMatchBandB, true, JSON.stringify(result.thesisFailureReasonsBandB));
  });

  test("Band B: botDegenRate 0.12 (above Band B's 0.10 cap) fails", () => {
    const result = computeScannerThesisMatchBandB(scannerCandidate({ marketCap: 400000, botDegenRate: 0.12 }));
    assert.strictEqual(result.thesisMatchBandB, false);
    assert.ok(result.thesisFailureReasonsBandB.some(r => r.includes("botDegenRate")));
  });

  test("Band B: top10HolderRate 0.30 (above Band B's 0.25 cap) fails", () => {
    const result = computeScannerThesisMatchBandB(scannerCandidate({ marketCap: 400000, top10HolderRate: 0.30 }));
    assert.strictEqual(result.thesisMatchBandB, false);
    assert.ok(result.thesisFailureReasonsBandB.some(r => r.includes("top10")));
  });

  test("buildPaperTradeRecord: both Band A and Band B fields present and independent", () => {
    const record = buildPaperTradeRecord(scannerCandidate({ marketCap: 400000, score: 82, botDegenRate: 0.08, top10HolderRate: 0.22 }));
    assert.ok(Object.prototype.hasOwnProperty.call(record, "thesisMatch"));
    assert.ok(Object.prototype.hasOwnProperty.call(record, "thesisFailureReasons"));
    assert.ok(Object.prototype.hasOwnProperty.call(record, "thesisMatchBandB"));
    assert.ok(Object.prototype.hasOwnProperty.call(record, "thesisFailureReasonsBandB"));
    // marketCap 400k is outside Band A but inside Band B — the two flags must disagree here,
    // proving they're computed independently rather than one derived from the other.
    assert.strictEqual(record.thesisMatch, false);
    assert.strictEqual(record.thesisMatchBandB, true, JSON.stringify(record.thesisFailureReasonsBandB));
  });

  test("buildPaperTradeRecord: Band A candidate (175k) does not spuriously satisfy Band B", () => {
    const record = buildPaperTradeRecord(scannerCandidate());
    assert.strictEqual(record.thesisMatch, true);
    assert.strictEqual(record.thesisMatchBandB, false);
  });

  test("live_executor matchesPhase1Thesis unchanged (Band A regression)", () => {
    const result = matchesPhase1Thesis(executorTrade(), {});
    assert.strictEqual(result.ok, true, JSON.stringify(result.reasons));
    const rejected = matchesPhase1Thesis(executorTrade({ marketCap: 400000 }), {});
    assert.strictEqual(rejected.ok, false);
  });

  test("live_executor matchesPhase1ThesisBandB: mirrors scanner-side Band B logic", () => {
    const ok = matchesPhase1ThesisBandB(
      executorTrade({ marketCap: 400000, score: 82, botDegenRate: 0.08, top10HolderRate: 0.22 }),
      {}
    );
    assert.strictEqual(ok.ok, true, JSON.stringify(ok.reasons));

    const wrongBand = matchesPhase1ThesisBandB(executorTrade({ marketCap: 175000 }), {});
    assert.strictEqual(wrongBand.ok, false);
    assert.ok(wrongBand.reasons.some(r => r.includes("marketCap")));
  });

  test("live_executor matchesPhase1ThesisBandB: cfg.thesisBandB override respected if ever present", () => {
    const result = matchesPhase1ThesisBandB(
      executorTrade({ marketCap: 900000 }),
      { thesisBandB: { marketCapMin: 250000, marketCapMax: 1000000 } }
    );
    assert.strictEqual(result.ok, true, JSON.stringify(result.reasons));
  });

  test("no signer/submit reachability introduced by this change (static source scan)", () => {
    const fs = require("fs");
    const scannerSrc = fs.readFileSync("scanner_gmgn_trending.js", "utf8");
    const executorSrc = fs.readFileSync("live_executor.js", "utf8");
    assert.ok(!/computeScannerThesisMatchBandB[\s\S]{0,400}submitSwap|sendTransaction|sendRawTransaction/.test(scannerSrc));
    assert.ok(!/matchesPhase1ThesisBandB[\s\S]{0,600}submitSwap\(|sendTransaction\(|sendRawTransaction\(/.test(executorSrc));
  });

  if (failed > 0) {
    console.error(`\n${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`\n${passed}/${passed + failed} Band B tests passed`);
})();
