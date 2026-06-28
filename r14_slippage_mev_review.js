"use strict";

// r14_slippage_mev_review.js — Sprint 4 R14
// Read-only slippage / MEV protection policy review. Writes analysis/ only.
// Does NOT fetch live quotes, submit transactions, or enable live trading.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname);
const OUTPUT_DIR = process.env.R14_OUTPUT_DIR
  ? path.resolve(process.env.R14_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r14_slippage_mev_status.json");

const SLIPPAGE_MEV_POLICY = {
  note: "Draft policy limits only — NOT active in live_config.json",
  defaultSlippageCapBps: 100,
  highVolatilitySlippageCapBps: 200,
  hardRejectSlippageBps: 300,
  realizedSlippageWarnBps: 100,
  realizedSlippageHaltBps: 200,
  priceImpactWarnPct: 1,
  priceImpactRejectPct: 2,
  maxQuoteAgeMs: 10_000,
  maxPriorityFeePctOfTrade: 50,
  maxRetries: 2
};

const DECISION = Object.freeze({
  PASS: "PASS",
  WARN: "WARN",
  REJECT: "REJECT"
});

function parsePriceImpactPct(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function quoteAgeMs(quote, nowMs) {
  const ts = quote.quotedAt || quote.timestamp || quote.quoteTime;
  if (!ts) return null;
  const ms = Date.parse(ts);
  if (Number.isNaN(ms)) return null;
  return nowMs - ms;
}

function evaluateQuote(quote = {}, options = {}) {
  const policy = { ...SLIPPAGE_MEV_POLICY, ...(options.policy || {}) };
  const nowMs = options.nowMs ?? Date.now();
  const findings = [];
  let decision = DECISION.PASS;

  function bump(next) {
    if (next === DECISION.REJECT) decision = DECISION.REJECT;
    else if (next === DECISION.WARN && decision === DECISION.PASS) decision = DECISION.WARN;
  }

  const slippageBps = quote.slippageBps ?? quote.quotedSlippageBps ?? null;
  const priceImpactPct = parsePriceImpactPct(quote.priceImpactPct ?? quote.priceImpact);
  const hasMinOutput = quote.minimumOutput != null || quote.minOutAmount != null || quote.outAmount != null;

  if (!hasMinOutput) {
    findings.push({ code: "MISSING_OUTPUT_THRESHOLD", severity: DECISION.REJECT });
    bump(DECISION.REJECT);
  }

  if (slippageBps == null) {
    findings.push({ code: "MISSING_SLIPPAGE_DATA", severity: DECISION.REJECT });
    bump(DECISION.REJECT);
  } else if (slippageBps > policy.hardRejectSlippageBps) {
    findings.push({ code: "SLIPPAGE_ABOVE_HARD_CAP", severity: DECISION.REJECT, slippageBps });
    bump(DECISION.REJECT);
  } else if (slippageBps > policy.defaultSlippageCapBps) {
    const severity = slippageBps > policy.highVolatilitySlippageCapBps
      ? DECISION.REJECT
      : DECISION.WARN;
    findings.push({ code: "SLIPPAGE_ABOVE_DEFAULT_CAP", severity, slippageBps });
    bump(severity);
  }

  if (priceImpactPct == null && quote.requirePriceImpact === true) {
    findings.push({ code: "MISSING_PRICE_IMPACT", severity: DECISION.REJECT });
    bump(DECISION.REJECT);
  } else if (priceImpactPct != null) {
    if (priceImpactPct > policy.priceImpactRejectPct) {
      findings.push({ code: "PRICE_IMPACT_ABOVE_REJECT", severity: DECISION.REJECT, priceImpactPct });
      bump(DECISION.REJECT);
    } else if (priceImpactPct > policy.priceImpactWarnPct) {
      findings.push({ code: "PRICE_IMPACT_ABOVE_WARN", severity: DECISION.WARN, priceImpactPct });
      bump(DECISION.WARN);
    }
  }

  const ageMs = quoteAgeMs(quote, nowMs);
  if (ageMs == null) {
    findings.push({ code: "MISSING_QUOTE_TIMESTAMP", severity: DECISION.REJECT });
    bump(DECISION.REJECT);
  } else if (ageMs > policy.maxQuoteAgeMs) {
    findings.push({ code: "QUOTE_STALE", severity: DECISION.REJECT, ageMs });
    bump(DECISION.REJECT);
  }

  if (quote.routeChanged === true) {
    findings.push({ code: "ROUTE_CHANGED_UNEXPECTEDLY", severity: DECISION.REJECT });
    bump(DECISION.REJECT);
  }

  if (quote.liquidityTooLow === true || quote.spreadTooWide === true) {
    findings.push({ code: "LIQUIDITY_OR_SPREAD_FAIL", severity: DECISION.REJECT });
    bump(DECISION.REJECT);
  }

  if (quote.priceDataStale === true) {
    findings.push({ code: "PRICE_DATA_STALE", severity: DECISION.REJECT });
    bump(DECISION.REJECT);
  }

  const priorityEval = evaluatePriorityFee(quote, policy);
  if (priorityEval.decision !== DECISION.PASS) {
    findings.push(priorityEval.finding);
    bump(priorityEval.decision);
  }

  if (quote.realizedSlippageBps != null) {
    if (quote.realizedSlippageBps > policy.realizedSlippageHaltBps) {
      findings.push({ code: "REALIZED_SLIPPAGE_HALT", severity: DECISION.REJECT, realizedSlippageBps: quote.realizedSlippageBps });
      bump(DECISION.REJECT);
    } else if (quote.realizedSlippageBps > policy.realizedSlippageWarnBps) {
      findings.push({ code: "REALIZED_SLIPPAGE_WARN", severity: DECISION.WARN, realizedSlippageBps: quote.realizedSlippageBps });
      bump(DECISION.WARN);
    }
  }

  return {
    decision,
    findings,
    policy,
    quoteSummary: {
      slippageBps,
      priceImpactPct,
      quoteAgeMs: ageMs,
      routeProvider: quote.routeProvider || quote.provider || null,
      mevProtection: quote.mevProtection || "none_simulated"
    }
  };
}

function evaluatePriorityFee(quote, policy) {
  const priorityFeeLamports = quote.priorityFeeLamports ?? quote.appliedPriorityFeeLamports ?? null;
  const tradeSizeLamports = quote.tradeSizeLamports ?? quote.inAmountLamports ?? null;
  if (priorityFeeLamports == null || tradeSizeLamports == null || tradeSizeLamports <= 0) {
    return { decision: DECISION.PASS, finding: null };
  }
  const pct = (priorityFeeLamports / tradeSizeLamports) * 100;
  if (pct > policy.maxPriorityFeePctOfTrade) {
    return {
      decision: DECISION.REJECT,
      finding: {
        code: "PRIORITY_FEE_TOO_HIGH",
        severity: DECISION.REJECT,
        priorityFeePctOfTrade: Number(pct.toFixed(4))
      }
    };
  }
  return { decision: DECISION.PASS, finding: null };
}

function deriveVerdict(evaluations) {
  if (!evaluations.length) {
    return {
      verdict: "SLIPPAGE / MEV REVIEW DEFINED — NOT IMPLEMENTED",
      reason: "Policy documented; no quote fixtures evaluated yet."
    };
  }
  if (evaluations.some(item => item.decision === DECISION.REJECT)) {
    return {
      verdict: "BLOCKED — EXECUTION RISK TOO HIGH",
      reason: "At least one evaluated route exceeds hard slippage/MEV policy limits."
    };
  }
  if (evaluations.every(item => item.decision === DECISION.PASS || item.decision === DECISION.WARN)) {
    return {
      verdict: "READY FOR SIMULATED ROUTING REVIEW",
      reason: "Fixture routes evaluated under draft policy — live trading still NOT approved."
    };
  }
  return {
    verdict: "SLIPPAGE / MEV REVIEW DEFINED — NOT IMPLEMENTED",
    reason: "Policy defined; additional simulated routing review required."
  };
}

function collectR14SlippageMevStatus(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const nowMs = options.nowMs ?? Date.now();
  const evaluations = [];

  if (Array.isArray(options.quotes)) {
    for (const quote of options.quotes) {
      evaluations.push(evaluateQuote(quote, { nowMs, policy: options.policy }));
    }
  } else {
    const fixturePath = options.fixturePath || path.join(analysisDir, "r14_quote_fixtures.json");
    if (fs.existsSync(fixturePath)) {
      try {
        const fixtures = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
        const quotes = Array.isArray(fixtures) ? fixtures : fixtures.quotes || [];
        for (const quote of quotes) {
          evaluations.push(evaluateQuote(quote, { nowMs, policy: options.policy }));
        }
      } catch {
        // ignore corrupt fixtures
      }
    }
  }

  const evaluation = deriveVerdict(evaluations);

  return {
    timestamp: new Date().toISOString(),
    review: "R14-slippage-mev-protection",
    liveTradingApproved: false,
    microLiveApproved: false,
    policy: SLIPPAGE_MEV_POLICY,
    mevProtectionDesign: {
      publicRpc: "higher exposure — avoid for micro-live unless no alternative",
      privateRouting: "future candidate if available without unsafe credential handling",
      jitoBundles: "future candidate — design review only",
      retryPolicy: "max 2 retries; no infinite loops; no repeated broadcast of same intent",
      sandwichRisk: "reject unstable routes; tiny size; strict slippage caps"
    },
    evaluations,
    evaluation,
    loggingRequirements: {
      required: [
        "timestamp", "token", "route summary", "input amount", "quoted output",
        "minimum output", "slippage cap", "price impact", "priority fee",
        "route provider", "mev protection used", "submit path", "tx id after submit",
        "confirmation result", "realized output", "realized slippage"
      ],
      forbidden: ["signing material", "seed phrase", "raw env", "signer object"]
    },
    recommendedNextGate: "Continue R7b if possible; complete simulated routing fixtures; do not arm live trading"
  };
}

function printSummary(status) {
  console.log("[r14-slippage-mev] Slippage / MEV Protection Review (read-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  live trading approved: false`);
  console.log(`  evaluations: ${status.evaluations.length}`);
  console.log(`  default slippage cap: ${status.policy.defaultSlippageCapBps} bps`);
  console.log(`  hard reject slippage: ${status.policy.hardRejectSlippageBps} bps`);
}

function writeStatus(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runR14SlippageMevReview(options = {}) {
  const status = collectR14SlippageMevStatus(options);
  const outputFile = options.outputFile || OUTPUT_FILE;
  if (options.writeOutput !== false) {
    writeStatus(status, outputFile);
  }
  if (options.print !== false) {
    printSummary(status);
  }
  return { status, outputFile: options.writeOutput !== false ? outputFile : null };
}

if (require.main === module) {
  try {
    const result = runR14SlippageMevReview();
    if (result.outputFile) {
      console.log(`  status: ${result.outputFile}`);
    }
  } catch (err) {
    console.error("[r14-slippage-mev] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  SLIPPAGE_MEV_POLICY,
  DECISION,
  evaluateQuote,
  evaluatePriorityFee,
  deriveVerdict,
  collectR14SlippageMevStatus,
  runR14SlippageMevReview,
  writeStatus,
  OUTPUT_FILE
};
