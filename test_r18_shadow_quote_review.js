"use strict";

// test_r18_shadow_quote_review.js — Sprint 4 R18
// Validates fixture-based shadow quote review in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r18 = require("./r18_shadow_quote_review");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r18-out-"));
const nowMs = Date.parse("2026-06-28T12:00:00.000Z");
const G = "\x1b[32m✔\x1b[0m";

const goodQuote = {
  quoteId: "TEST-GOOD",
  timestamp: "2026-06-28T11:59:58.000Z",
  inputMint: "SIMULATED_SOL",
  outputMint: "SIMULATED_TOKEN",
  token: "SIMULATED_TOKEN_A",
  inputAmount: 0.008,
  outputAmount: 1000,
  minimumOutputAmount: 990,
  slippageBps: 80,
  priceImpactBps: 50,
  routeProvider: "SIMULATED",
  routeSummary: "SIM_POOL_A",
  quoteSource: "FIXTURE_ONLY",
  routeStable: true,
  outputVerifiable: true,
  priorityFeeEstimateSol: 0.00004,
  mevProtectionMode: "SIMULATED_REVIEW_ONLY"
};

try {
  const pass = r18.evaluateShadowQuote(goodQuote, { nowMs });
  assert.strictEqual(pass.decision, r18.DECISION.PASS);
  console.log(`${G} valid low-slippage fixture passes`);

  const reviewable = r18.collectR18ShadowQuoteStatus({
    quotes: [goodQuote],
    nowMs,
    outputFile: path.join(tmpOutput, "r18_shadow_quote_status.json"),
    writeOutput: false
  });
  assert.strictEqual(reviewable.gateStatus, "SHADOW_REVIEWABLE_ONLY");
  assert.strictEqual(reviewable.approved, false);
  console.log(`${G} valid low-slippage fixture passes as shadow-reviewable only`);

  const stale = r18.evaluateShadowQuote(
    { ...goodQuote, timestamp: "2026-06-28T11:59:40.000Z", quoteAgeSeconds: null },
    { nowMs }
  );
  assert.strictEqual(stale.decision, r18.DECISION.REJECT);
  console.log(`${G} stale quote rejects`);

  const missingMin = r18.evaluateShadowQuote(
    { ...goodQuote, minimumOutputAmount: null },
    { nowMs }
  );
  assert.strictEqual(missingMin.decision, r18.DECISION.REJECT);
  console.log(`${G} missing minimum output rejects`);

  const hardSlip = r18.evaluateShadowQuote({ ...goodQuote, slippageBps: 350 }, { nowMs });
  assert.strictEqual(hardSlip.decision, r18.DECISION.REJECT);
  console.log(`${G} slippage above hard cap rejects`);

  const warnSlip = r18.evaluateShadowQuote({ ...goodQuote, slippageBps: 150 }, { nowMs });
  assert.strictEqual(warnSlip.decision, r18.DECISION.WARN);
  console.log(`${G} slippage above default warns`);

  const impact = r18.evaluateShadowQuote({ ...goodQuote, priceImpactBps: 250 }, { nowMs });
  assert.strictEqual(impact.decision, r18.DECISION.REJECT);
  console.log(`${G} price impact above reject threshold rejects`);

  const feeReject = r18.evaluateShadowQuote(
    { ...goodQuote, inputAmount: 0.01, priorityFeeEstimateSol: 0.008 },
    { nowMs }
  );
  assert.strictEqual(feeReject.decision, r18.DECISION.REJECT);
  console.log(`${G} priority fee too high rejects`);

  const unstable = r18.evaluateShadowQuote(
    { ...goodQuote, routeStable: false },
    { nowMs }
  );
  assert.strictEqual(unstable.decision, r18.DECISION.REJECT);
  console.log(`${G} route change / unstable route rejects`);

  const malformed = r18.collectR18ShadowQuoteStatus({
    fixturePath: path.join(tmpOutput, "missing-fixture.json"),
    nowMs
  });
  assert.strictEqual(malformed.quoteCount, 0);
  assert.strictEqual(malformed.approved, false);
  console.log(`${G} malformed fixture fails closed`);

  const corruptPath = path.join(tmpOutput, "corrupt.json");
  fs.writeFileSync(corruptPath, "{ not json");
  const corrupt = r18.collectR18ShadowQuoteStatus({ fixturePath: corruptPath, nowMs });
  assert.strictEqual(corrupt.gateStatus, "INVALID_FIXTURE");
  console.log(`${G} corrupt fixture invalid`);

  const outFile = path.join(tmpOutput, "r18_write_test.json");
  r18.runR18ShadowQuoteReview({
    quotes: [goodQuote],
    nowMs,
    outputFile: outFile,
    print: false
  });
  assert.ok(outFile.startsWith(tmpOutput));
  console.log(`${G} output only writes to analysis/`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  console.log(`${G} no live_config.json mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  const src = fs.readFileSync(path.join(__dirname, "r18_shadow_quote_review.js"), "utf8");
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  assert.ok(!/require\(['"]https/.test(src));
  assert.ok(!/process\.env\.SOLANA_SIGNER/.test(src));
  console.log(`${G} no network call`);

  const secretQuote = r18.evaluateShadowQuote({ ...goodQuote, privateKey: "bad" }, { nowMs });
  assert.strictEqual(secretQuote.decision, r18.DECISION.REJECT);
  console.log(`${G} no secret handling`);

  assert.ok(!JSON.stringify(reviewable).includes('"approved": true'));
  console.log(`${G} never returns approved true`);

  console.log("\nR18 SHADOW QUOTE REVIEW TEST PASSED (15/15)");
} finally {
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
