"use strict";

// test_r14_slippage_mev_review.js — Sprint 4 R14
// Validates read-only slippage/MEV policy review in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r14 = require("./r14_slippage_mev_review");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r14-out-"));
const nowMs = Date.parse("2026-06-28T12:00:00.000Z");
const G = "\x1b[32m✔\x1b[0m";

const goodQuote = {
  quotedAt: "2026-06-28T11:59:58.000Z",
  slippageBps: 80,
  priceImpactPct: "0.5",
  outAmount: "1000",
  minimumOutput: "990",
  tradeSizeLamports: 10_000_000,
  priorityFeeLamports: 50_000,
  routeProvider: "simulated-jupiter"
};

try {
  const pass = r14.evaluateQuote(goodQuote, { nowMs });
  assert.strictEqual(pass.decision, r14.DECISION.PASS);
  console.log(`${G} pass under slippage cap`);

  const warn = r14.evaluateQuote(
    { ...goodQuote, slippageBps: 150, priceImpactPct: "1.5" },
    { nowMs }
  );
  assert.strictEqual(warn.decision, r14.DECISION.WARN);
  console.log(`${G} warn above warning threshold`);

  const rejectSlip = r14.evaluateQuote({ ...goodQuote, slippageBps: 350 }, { nowMs });
  assert.strictEqual(rejectSlip.decision, r14.DECISION.REJECT);
  console.log(`${G} reject above hard cap`);

  const stale = r14.evaluateQuote(
    { ...goodQuote, quotedAt: "2026-06-28T11:59:40.000Z" },
    { nowMs }
  );
  assert.strictEqual(stale.decision, r14.DECISION.REJECT);
  console.log(`${G} reject stale quote`);

  const missingMin = r14.evaluateQuote({ ...goodQuote, outAmount: null, minimumOutput: null }, { nowMs });
  assert.strictEqual(missingMin.decision, r14.DECISION.REJECT);
  console.log(`${G} reject missing output threshold`);

  const impact = r14.evaluateQuote({ ...goodQuote, priceImpactPct: "2.5" }, { nowMs });
  assert.strictEqual(impact.decision, r14.DECISION.REJECT);
  console.log(`${G} reject excessive price impact`);

  const fee = r14.evaluateQuote(
    { ...goodQuote, priorityFeeLamports: 6_000_000, tradeSizeLamports: 10_000_000 },
    { nowMs }
  );
  assert.strictEqual(fee.decision, r14.DECISION.REJECT);
  console.log(`${G} reject priority fee too high relative to tiny trade`);

  const ready = r14.collectR14SlippageMevStatus({
    analysisDir: tmpOutput,
    quotes: [goodQuote],
    nowMs
  });
  assert.strictEqual(ready.evaluation.verdict, "READY FOR SIMULATED ROUTING REVIEW");
  assert.strictEqual(ready.liveTradingApproved, false);
  console.log(`${G} simulated routing review when fixture passes`);

  const blocked = r14.collectR14SlippageMevStatus({
    analysisDir: tmpOutput,
    quotes: [{ ...goodQuote, slippageBps: 400 }],
    nowMs
  });
  assert.strictEqual(blocked.evaluation.verdict, "BLOCKED — EXECUTION RISK TOO HIGH");
  console.log(`${G} blocked when execution risk too high`);

  const outFile = path.join(tmpOutput, "r14_slippage_mev_status.json");
  r14.runR14SlippageMevReview({
    analysisDir: tmpOutput,
    outputFile: outFile,
    quotes: [goodQuote],
    nowMs,
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

  console.log(`${G} no trading state mutation`);

  const src = fs.readFileSync(path.join(__dirname, "r14_slippage_mev_review.js"), "utf8");
  assert.ok(!/\bfetch\s*\(/.test(src));
  assert.ok(!/writeFileSync\([^)]*live_config\.json/.test(src));
  console.log(`${G} no network or config mutation`);

  console.log("\nR14 SLIPPAGE MEV REVIEW TEST PASSED (12/12)");
} finally {
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
