"use strict";

// r18_shadow_quote_review.js — Sprint 4 R18
// Fixture-based shadow quote design review. Writes analysis/ only.
// Does NOT poll live quotes, sign, submit, or enable live trading.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname);
const OUTPUT_DIR = process.env.R18_OUTPUT_DIR
  ? path.resolve(process.env.R18_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "r18_shadow_quote_status.json");
const DEFAULT_FIXTURE_FILE = path.join(ROOT, "examples", "shadow_quotes.example.json");

const SHADOW_QUOTE_POLICY = {
  note: "Shadow-quote design policy only — NOT active in live_config.json",
  defaultSlippageCapBps: 100,
  manualExceptionSlippageCapBps: 200,
  hardRejectSlippageBps: 300,
  realizedSlippageWarnBps: 100,
  realizedSlippageHaltBps: 200,
  priceImpactWarnBps: 100,
  priceImpactRejectBps: 200,
  maxQuoteAgeSeconds: 10,
  outputChangeToleranceBps: 50,
  maxPriorityFeePctOfTrade: 50,
  maxRetries: 2
};

const DECISION = Object.freeze({
  PASS: "PASS",
  WARN: "WARN",
  REJECT: "REJECT"
});

const SECRET_FIELD_PATTERN = /private[_-]?key|secret|seed|mnemonic|signer[_-]?secret|passphrase|api[_-]?key/i;

function quoteAgeSeconds(quote, nowMs) {
  if (quote.quoteAgeSeconds != null && Number.isFinite(Number(quote.quoteAgeSeconds))) {
    return Number(quote.quoteAgeSeconds);
  }
  const ts = quote.timestamp || quote.quotedAt || quote.quoteTime;
  if (!ts) return null;
  const ms = Date.parse(ts);
  if (Number.isNaN(ms)) return null;
  return (nowMs - ms) / 1000;
}

function hasMinimumOutput(quote) {
  return (
    quote.minimumOutputAmount != null ||
    quote.minimumOutput != null ||
    quote.minOutAmount != null
  );
}

function hasVerifiableOutput(quote) {
  if (quote.outputVerifiable === false) return false;
  return quote.outputAmount != null || quote.outAmount != null;
}

function findSecretLikeFields(obj, prefix = "") {
  const hits = [];
  if (!obj || typeof obj !== "object") return hits;
  for (const [key, value] of Object.entries(obj)) {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    if (SECRET_FIELD_PATTERN.test(key)) hits.push(pathKey);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      hits.push(...findSecretLikeFields(value, pathKey));
    }
  }
  return hits;
}

function evaluateShadowQuote(quote = {}, options = {}) {
  const policy = { ...SHADOW_QUOTE_POLICY, ...(options.policy || {}) };
  const nowMs = options.nowMs ?? Date.now();
  const findings = [];
  let decision = DECISION.PASS;

  function bump(next) {
    if (next === DECISION.REJECT) decision = DECISION.REJECT;
    else if (next === DECISION.WARN && decision === DECISION.PASS) decision = DECISION.WARN;
  }

  if (!quote || typeof quote !== "object") {
    return {
      decision: DECISION.REJECT,
      findings: [{ code: "MALFORMED_QUOTE", severity: DECISION.REJECT }],
      quoteSummary: null
    };
  }

  const secretFields = findSecretLikeFields(quote);
  if (secretFields.length > 0) {
    findings.push({ code: "SECRET_LIKE_FIELD", severity: DECISION.REJECT, fields: secretFields });
    return {
      decision: DECISION.REJECT,
      findings,
      quoteSummary: { quoteId: quote.quoteId || null }
    };
  }

  const slippageBps = quote.slippageBps ?? quote.quotedSlippageBps ?? null;
  const priceImpactBps = quote.priceImpactBps ?? (quote.priceImpactPct != null ? Number(quote.priceImpactPct) * 100 : null);

  if (!hasMinimumOutput(quote)) {
    findings.push({ code: "MISSING_MINIMUM_OUTPUT", severity: DECISION.REJECT });
    bump(DECISION.REJECT);
  }

  if (!hasVerifiableOutput(quote)) {
    findings.push({ code: "OUTPUT_NOT_VERIFIABLE", severity: DECISION.REJECT });
    bump(DECISION.REJECT);
  }

  if (slippageBps == null) {
    findings.push({ code: "MISSING_SLIPPAGE_DATA", severity: DECISION.REJECT });
    bump(DECISION.REJECT);
  } else if (slippageBps > policy.hardRejectSlippageBps) {
    findings.push({ code: "SLIPPAGE_ABOVE_HARD_CAP", severity: DECISION.REJECT, slippageBps });
    bump(DECISION.REJECT);
  } else if (slippageBps > policy.manualExceptionSlippageCapBps) {
    findings.push({ code: "SLIPPAGE_ABOVE_MANUAL_EXCEPTION", severity: DECISION.REJECT, slippageBps });
    bump(DECISION.REJECT);
  } else if (slippageBps > policy.defaultSlippageCapBps) {
    findings.push({ code: "SLIPPAGE_ABOVE_DEFAULT_CAP", severity: DECISION.WARN, slippageBps });
    bump(DECISION.WARN);
  }

  if (priceImpactBps == null) {
    if (quote.requirePriceImpact === true || quote.liquidityUsd == null) {
      findings.push({ code: "MISSING_PRICE_IMPACT", severity: DECISION.REJECT });
      bump(DECISION.REJECT);
    }
  } else if (priceImpactBps > policy.priceImpactRejectBps) {
    findings.push({ code: "PRICE_IMPACT_ABOVE_REJECT", severity: DECISION.REJECT, priceImpactBps });
    bump(DECISION.REJECT);
  } else if (priceImpactBps > policy.priceImpactWarnBps) {
    findings.push({ code: "PRICE_IMPACT_ABOVE_WARN", severity: DECISION.WARN, priceImpactBps });
    bump(DECISION.WARN);
  }

  const ageSec = quoteAgeSeconds(quote, nowMs);
  if (ageSec == null) {
    findings.push({ code: "MISSING_QUOTE_AGE", severity: DECISION.REJECT });
    bump(DECISION.REJECT);
  } else if (ageSec > policy.maxQuoteAgeSeconds) {
    findings.push({ code: "QUOTE_STALE", severity: DECISION.REJECT, quoteAgeSeconds: ageSec });
    bump(DECISION.REJECT);
  }

  if (quote.routeChanged === true || quote.routeStable === false) {
    findings.push({ code: "ROUTE_UNSTABLE", severity: DECISION.REJECT });
    bump(DECISION.REJECT);
  }

  if (quote.outputChangedBeyondTolerance === true) {
    findings.push({ code: "OUTPUT_CHANGED_BEYOND_TOLERANCE", severity: DECISION.REJECT });
    bump(DECISION.REJECT);
  }

  if (quote.liquidityTooLow === true || quote.spreadTooWide === true) {
    findings.push({ code: "LIQUIDITY_OR_SPREAD_FAIL", severity: DECISION.REJECT });
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
    quoteSummary: {
      quoteId: quote.quoteId || null,
      token: quote.token || null,
      slippageBps,
      priceImpactBps,
      quoteAgeSeconds: ageSec,
      routeProvider: quote.routeProvider || null,
      routeSummary: quote.routeSummary || null,
      mevProtectionMode: quote.mevProtectionMode || "SIMULATED_REVIEW_ONLY"
    }
  };
}

function evaluatePriorityFee(quote, policy) {
  const tradeSizeSol = Number(quote.inputAmount ?? quote.tradeSizeSol ?? 0);
  const priorityFeeSol = Number(quote.priorityFeeEstimateSol ?? quote.priorityFeeSol ?? 0);
  if (!Number.isFinite(tradeSizeSol) || tradeSizeSol <= 0 || !Number.isFinite(priorityFeeSol)) {
    return { decision: DECISION.PASS, finding: null };
  }
  const pct = (priorityFeeSol / tradeSizeSol) * 100;
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
  if (pct > policy.maxPriorityFeePctOfTrade * 0.5) {
    return {
      decision: DECISION.WARN,
      finding: {
        code: "PRIORITY_FEE_ELEVATED",
        severity: DECISION.WARN,
        priorityFeePctOfTrade: Number(pct.toFixed(4))
      }
    };
  }
  return { decision: DECISION.PASS, finding: null };
}

function loadQuotesFromFixture(fixturePath) {
  if (!fs.existsSync(fixturePath)) {
    return { status: "missing", quotes: [], error: "fixture missing" };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    if (Array.isArray(raw)) return { status: "present", quotes: raw };
    if (raw && Array.isArray(raw.quotes)) return { status: "present", quotes: raw.quotes };
    return { status: "corrupt", quotes: [], error: "fixture must be array or { quotes: [] }" };
  } catch (err) {
    return {
      status: "corrupt",
      quotes: [],
      error: err && err.message ? err.message : String(err)
    };
  }
}

function deriveGateStatus(summary, options = {}) {
  if (summary.invalidFixture) {
    return {
      gateStatus: "INVALID_FIXTURE",
      verdict: "SHADOW-QUOTE DESIGN DEFINED — NOT ACTIVE",
      reason: "Quote fixture malformed or contains forbidden fields."
    };
  }
  if (summary.rejectCount > 0) {
    return {
      gateStatus: "BLOCKED",
      verdict: "BLOCKED — QUOTE RISK TOO HIGH",
      reason: "At least one shadow quote exceeds hard policy limits."
    };
  }
  if (summary.quoteCount === 0) {
    return {
      gateStatus: "BLOCKED",
      verdict: "SHADOW-QUOTE DESIGN DEFINED — NOT ACTIVE",
      reason: "No quote fixtures evaluated."
    };
  }
  if (options.enableCollectionDesign === true && summary.warnCount === 0) {
    return {
      gateStatus: "READY_FOR_SHADOW_QUOTE_COLLECTION_DESIGN",
      verdict: "READY FOR FIXTURE-BASED QUOTE HARNESS",
      reason: "All fixtures pass shadow policy — collection design may proceed (not live)."
    };
  }
  return {
    gateStatus: "SHADOW_REVIEWABLE_ONLY",
    verdict: "READY FOR FIXTURE-BASED QUOTE HARNESS",
    reason: "Shadow quotes evaluated under design policy — no trading, signing, or submission."
  };
}

function collectR18ShadowQuoteStatus(options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const fixturePath = options.fixturePath || options.inputPath || DEFAULT_FIXTURE_FILE;
  let quotes = [];
  let fixtureStatus = "inline";

  if (Array.isArray(options.quotes)) {
    quotes = options.quotes;
    fixtureStatus = "inline";
  } else {
    const loaded = loadQuotesFromFixture(fixturePath);
    fixtureStatus = loaded.status;
    quotes = loaded.quotes;
  }

  const invalidFixture = fixtureStatus === "corrupt" ||
    quotes.some((q) => findSecretLikeFields(q).length > 0);

  const evaluations = invalidFixture
    ? []
    : quotes.map((quote) => evaluateShadowQuote(quote, { nowMs, policy: options.policy }));

  const passCount = evaluations.filter((e) => e.decision === DECISION.PASS).length;
  const warnCount = evaluations.filter((e) => e.decision === DECISION.WARN).length;
  const rejectCount = evaluations.filter((e) => e.decision === DECISION.REJECT).length;

  const rejectionReasons = [];
  for (const ev of evaluations) {
    for (const f of ev.findings) {
      if (f.severity === DECISION.REJECT) rejectionReasons.push(f.code);
    }
  }

  const slippageValues = evaluations.map((e) => e.quoteSummary?.slippageBps).filter((v) => v != null);
  const impactValues = evaluations.map((e) => e.quoteSummary?.priceImpactBps).filter((v) => v != null);

  const summary = {
    quoteCount: evaluations.length,
    passCount,
    warnCount,
    rejectCount,
    invalidFixture,
    staleQuoteCount: evaluations.filter((e) => e.findings.some((f) => f.code === "QUOTE_STALE")).length,
    routeInstabilityCount: evaluations.filter((e) => e.findings.some((f) => f.code === "ROUTE_UNSTABLE")).length,
    priorityFeeWarnings: evaluations.filter((e) => e.findings.some((f) => f.code === "PRIORITY_FEE_ELEVATED")).length,
    worstSlippageBps: slippageValues.length ? Math.max(...slippageValues) : null,
    worstPriceImpactBps: impactValues.length ? Math.max(...impactValues) : null
  };

  const gate = deriveGateStatus(summary, options);

  return {
    evaluatedAt: new Date().toISOString(),
    review: "R18-shadow-quote-design",
    liveTradingApproved: false,
    microLiveApproved: false,
    approved: false,
    fixturePath: Array.isArray(options.quotes) ? "(inline fixture)" : fixturePath,
    fixtureStatus,
    policy: SHADOW_QUOTE_POLICY,
    shadowQuoteMode: {
      observeOnly: true,
      signing: false,
      submission: false,
      positionCreation: false,
      networkCalls: false
    },
    mevProtectionDesign: {
      publicRpc: "design-level — higher MEV exposure",
      protectedRoute: "future candidate if available",
      jitoBundle: "future candidate — design only",
      constraints: [
        "no weakened secret handling",
        "no emergency stop bypass",
        "no operator approval bypass",
        "no slippage cap bypass"
      ]
    },
    evaluations,
    gateStatus: gate.gateStatus,
    quoteCount: summary.quoteCount,
    passCount: summary.passCount,
    warnCount: summary.warnCount,
    rejectCount: summary.rejectCount,
    rejectionReasons: [...new Set(rejectionReasons)],
    worstSlippageBps: summary.worstSlippageBps,
    worstPriceImpactBps: summary.worstPriceImpactBps,
    staleQuoteCount: summary.staleQuoteCount,
    routeInstabilityCount: summary.routeInstabilityCount,
    priorityFeeWarnings: summary.priorityFeeWarnings,
    mevMode: "SIMULATED_REVIEW_ONLY",
    evaluation: {
      verdict: gate.verdict,
      gateStatus: gate.gateStatus,
      reason: gate.reason,
      approved: false
    },
    recommendedNextGate:
      "Continue R7b; design shadow quote collection separately if approved; do not arm live; do not poll live quotes without explicit future gate"
  };
}

function printSummary(status) {
  console.log("[r18-shadow] Shadow-Quote Design Review (fixture-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  gate status: ${status.gateStatus}`);
  console.log(`  approved: false`);
  console.log(`  quotes: ${status.quoteCount} pass=${status.passCount} warn=${status.warnCount} reject=${status.rejectCount}`);
  console.log(`  network calls: 0`);
}

function writeStatus(status, outputFile = OUTPUT_FILE) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(status, null, 2)}\n`);
  return outputFile;
}

function runR18ShadowQuoteReview(options = {}) {
  const status = collectR18ShadowQuoteStatus(options);
  const outputFile = options.outputFile || OUTPUT_FILE;
  if (options.writeOutput !== false) {
    writeStatus(status, outputFile);
  }
  if (options.print !== false) {
    printSummary(status);
  }
  return { status, outputFile: options.writeOutput !== false ? outputFile : null };
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--input" && argv[i + 1]) {
      options.fixturePath = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return options;
}

if (require.main === module) {
  try {
    const result = runR18ShadowQuoteReview(parseCliArgs());
    if (result.outputFile) {
      console.log(`  status: ${result.outputFile}`);
    }
  } catch (err) {
    console.error("[r18-shadow] fatal:", err.message);
    process.exit(1);
  }
}

module.exports = {
  SHADOW_QUOTE_POLICY,
  DECISION,
  DEFAULT_FIXTURE_FILE,
  OUTPUT_FILE,
  evaluateShadowQuote,
  evaluatePriorityFee,
  loadQuotesFromFixture,
  deriveGateStatus,
  collectR18ShadowQuoteStatus,
  runR18ShadowQuoteReview,
  writeStatus
};
