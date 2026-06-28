"use strict";

// r29_real_quote_observer.js — Sprint 4 R29
// Gated observation-only real quote observer. Writes analysis/ only.
// Default DISABLED. Network polling only with --observe-once and valid approval.
// Does NOT trade, sign, submit, connect wallet, or enable live trading.

const fs = require("fs");
const path = require("path");
const https = require("https");
const review = require("./r7_strategy_review");
const r18 = require("./r18_shadow_quote_review");
const r20 = require("./r20_shadow_quote_collector");

const ROOT = review.ROOT;
const RUNTIME_ROOT = review.RUNTIME_ROOT;
const OUTPUT_DIR = process.env.R29_OUTPUT_DIR
  ? path.resolve(process.env.R29_OUTPUT_DIR)
  : path.join(ROOT, "analysis");
const OBSERVATIONS_FILE = path.join(OUTPUT_DIR, "real_quote_observations.jsonl");
const STATUS_FILE = path.join(OUTPUT_DIR, "r29_real_quote_observation_status.json");
const RATE_STATE_FILE = path.join(OUTPUT_DIR, "r29_rate_limit_state.json");
const DEFAULT_APPROVAL_FILE = path.join(ROOT, "operator_records", "r29_quote_observation_approval.json");
const DEFAULT_CONFIG_FILE = path.join(ROOT, "examples", "r29_real_quote_observation_config.example.json");
const DEFAULT_CANDIDATES_FILE = r20.DEFAULT_CANDIDATES_FILE;

const SCHEMA_VERSION = 1;
const JUPITER_QUOTE_ENDPOINT = "https://quote-api.jup.ag/v6/quote";
const PROVIDER_ERROR_CLUSTER = 2;

const SECRET_FIELD_PATTERN = /private[_-]?key|secret|seed|mnemonic|signer[_-]?secret|passphrase|api[_-]?key|wallet[_-]?private/i;
const FORBIDDEN_EXECUTION_MODES = new Set(["LIVE", "MICRO_LIVE"]);
const APPROVAL_ACK_FIELDS = [
  "stopConditionsAcknowledged",
  "noWalletAcknowledged",
  "noSigningAcknowledged",
  "noSubmissionAcknowledged",
  "rateLimitAcknowledged",
  "costAcknowledged"
];

function findSecretLikeFields(obj, prefix = "") {
  const hits = [];
  if (!obj || typeof obj !== "object") return hits;
  for (const [key, value] of Object.entries(obj)) {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    const isAckField = APPROVAL_ACK_FIELDS.includes(key);
    if (!isAckField && SECRET_FIELD_PATTERN.test(key)) hits.push(pathKey);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      hits.push(...findSecretLikeFields(value, pathKey));
    }
  }
  return hits;
}

function readPosture(runtimeRoot) {
  const cfg = review.readJsonFile(path.join(runtimeRoot, "live_config.json"));
  if (cfg.status !== "usable") {
    return { available: false, status: cfg.status };
  }
  const data = cfg.data || {};
  return {
    available: true,
    executionMode: data.executionMode || "unknown",
    dryRunMode: data.dryRunMode !== false,
    liveArmed: data.liveArmed === true,
    emergencyStop: data.emergencyStop === true
  };
}

function isSafeObservationPosture(posture) {
  return (
    posture.available === true &&
    posture.executionMode === "PIPELINE_DRY_RUN" &&
    posture.dryRunMode === true &&
    posture.liveArmed === false &&
    posture.emergencyStop !== true
  );
}

function loadJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { status: "missing", data: null, error: "file missing" };
  }
  try {
    return { status: "present", data: JSON.parse(fs.readFileSync(filePath, "utf8")) };
  } catch (err) {
    return {
      status: "corrupt",
      data: null,
      error: err && err.message ? err.message : String(err)
    };
  }
}

function normalizeCandidateSource(source) {
  const s = String(source || "").toLowerCase();
  if (s.includes("paper") || s === "paper_candidate" || s === "paper_trade_candidate") {
    return "paper_candidate";
  }
  if (s.includes("fixture") || s === "fixture") return "fixture";
  return "manual";
}

function validateApprovalRecord(approval) {
  const invalidReasons = [];
  if (!approval || typeof approval !== "object") {
    return { valid: false, invalidReasons: ["approval record missing or invalid"] };
  }

  const secretHits = findSecretLikeFields(approval);
  if (secretHits.length > 0) {
    invalidReasons.push(`secret-like fields: ${secretHits.join(", ")}`);
  }

  if (approval.approvalStatus !== "APPROVE_OBSERVATION_ONLY") {
    invalidReasons.push("approvalStatus must be APPROVE_OBSERVATION_ONLY");
  }
  if (approval.operatorDecision !== "APPROVE_OBSERVATION_ONLY") {
    invalidReasons.push("operatorDecision must be APPROVE_OBSERVATION_ONLY");
  }
  if (approval.quoteObservationApproved !== true) {
    invalidReasons.push("quoteObservationApproved must be true");
  }
  if (approval.networkPollingAllowed !== true) {
    invalidReasons.push("networkPollingAllowed must be true for R29 observation");
  }

  for (const field of [
    "tradingAllowed",
    "signingAllowed",
    "submissionAllowed",
    "walletRequired",
    "liveTradingApproved",
    "microLiveApproved"
  ]) {
    if (approval[field] === true) {
      invalidReasons.push(`${field} must remain false`);
    }
  }

  for (const field of APPROVAL_ACK_FIELDS) {
    if (approval[field] !== true) {
      invalidReasons.push(`${field} must be acknowledged`);
    }
  }

  if (approval.approved === true) {
    invalidReasons.push("approved true forbidden");
  }

  const allowedProviders = Array.isArray(approval.allowedProviders)
    ? approval.allowedProviders.map(String)
    : [];
  if (allowedProviders.length === 0) {
    invalidReasons.push("allowedProviders must be non-empty");
  }

  return {
    valid: invalidReasons.length === 0,
    invalidReasons,
    allowedProviders,
    allowedCandidateSources: Array.isArray(approval.allowedCandidateSources)
      ? approval.allowedCandidateSources.map(String)
      : [],
    limits: {
      maxQuotesPerTokenPerMinute: Number(approval.maxQuotesPerTokenPerMinute) || 3,
      maxTokensPerCycle: Number(approval.maxTokensPerCycle) || 5,
      maxQuotesPerDay: Number(approval.maxQuotesPerDay) || 100,
      cooldownSeconds: Number(approval.cooldownSeconds) || 5
    }
  };
}

function validateObserverConfig(config) {
  const invalidReasons = [];
  if (!config || typeof config !== "object") {
    return { valid: false, invalidReasons: ["config missing or invalid"] };
  }

  const secretHits = findSecretLikeFields(config);
  if (secretHits.length > 0) {
    invalidReasons.push(`secret-like fields: ${secretHits.join(", ")}`);
  }

  if (config.active === true) invalidReasons.push("active true forbidden in example config");
  if (config.networkPollingAllowed === true) {
    invalidReasons.push("networkPollingAllowed true forbidden in example config");
  }
  for (const field of [
    "tradingAllowed",
    "signingAllowed",
    "submissionAllowed",
    "walletRequired"
  ]) {
    if (config[field] === true) invalidReasons.push(`${field} must remain false`);
  }

  if (config.executionMode && FORBIDDEN_EXECUTION_MODES.has(String(config.executionMode).toUpperCase())) {
    invalidReasons.push(`executionMode ${config.executionMode} forbidden`);
  }

  return { valid: invalidReasons.length === 0, invalidReasons };
}

function loadRateState(rateStateFile) {
  const loaded = loadJsonFile(rateStateFile);
  if (loaded.status !== "present") {
    return {
      dayKey: new Date().toISOString().slice(0, 10),
      dailyQuoteCount: 0,
      tokenMinuteCounts: {},
      lastQuoteAtMs: 0
    };
  }
  const data = loaded.data || {};
  return {
    dayKey: data.dayKey || new Date().toISOString().slice(0, 10),
    dailyQuoteCount: Number(data.dailyQuoteCount) || 0,
    tokenMinuteCounts: data.tokenMinuteCounts || {},
    lastQuoteAtMs: Number(data.lastQuoteAtMs) || 0
  };
}

function saveRateState(rateStateFile, state) {
  fs.mkdirSync(path.dirname(rateStateFile), { recursive: true });
  fs.writeFileSync(rateStateFile, `${JSON.stringify(state, null, 2)}\n`);
}

function checkRateLimits(state, limits, tokenMint, nowMs, options = {}) {
  const dayKey = new Date(nowMs).toISOString().slice(0, 10);
  if (state.dayKey !== dayKey) {
    state.dayKey = dayKey;
    state.dailyQuoteCount = 0;
    state.tokenMinuteCounts = {};
  }

  if (state.dailyQuoteCount >= limits.maxQuotesPerDay) {
    return { allowed: false, reason: "daily quote limit reached" };
  }

  if (options.checkCooldown !== false) {
    const cooldownMs = limits.cooldownSeconds * 1000;
    if (state.lastQuoteAtMs > 0 && nowMs - state.lastQuoteAtMs < cooldownMs) {
      return { allowed: false, reason: "cooldown active" };
    }
  }

  if (options.checkTokenMinute !== false && tokenMint) {
    const minuteKey = String(Math.floor(nowMs / 60000));
    const tokenKey = tokenMint || "unknown";
    if (!state.tokenMinuteCounts[tokenKey]) state.tokenMinuteCounts[tokenKey] = {};
    const tokenMinuteCount = state.tokenMinuteCounts[tokenKey][minuteKey] || 0;
    if (tokenMinuteCount >= limits.maxQuotesPerTokenPerMinute) {
      return { allowed: false, reason: "per-token per-minute limit reached" };
    }
  }

  return { allowed: true };
}

function recordQuote(state, tokenMint, nowMs) {
  const minuteKey = String(Math.floor(nowMs / 60000));
  const tokenKey = tokenMint || "unknown";
  if (!state.tokenMinuteCounts[tokenKey]) state.tokenMinuteCounts[tokenKey] = {};
  state.tokenMinuteCounts[tokenKey][minuteKey] =
    (state.tokenMinuteCounts[tokenKey][minuteKey] || 0) + 1;
  state.dailyQuoteCount += 1;
  state.lastQuoteAtMs = nowMs;
}

function buildRouteSummaryFromJupiter(quote) {
  if (!quote || !Array.isArray(quote.routePlan) || quote.routePlan.length === 0) {
    return "unknown_route";
  }
  return quote.routePlan
    .map((step) => step?.swapInfo?.label || step?.swapInfo?.ammKey || "step")
    .join(" -> ");
}

function normalizeJupiterQuoteResponse(rawQuote, candidate) {
  const slippageBps = Number(rawQuote.slippageBps) || 0;
  const priceImpactPct = Number(rawQuote.priceImpactPct) || 0;
  return {
    inputMint: rawQuote.inputMint || candidate.inputMint,
    outputMint: rawQuote.outputMint || candidate.outputMint,
    inputAmount: Number(rawQuote.inAmount) || candidate.intendedInputAmountSol,
    quotedOutputAmount: Number(rawQuote.outAmount),
    minimumOutputAmount: Number(rawQuote.otherAmountThreshold),
    slippageBps,
    priceImpactBps: Math.round(priceImpactPct * 100),
    routeSummary: buildRouteSummaryFromJupiter(rawQuote),
    quoteAgeSeconds: 0,
    routeProvider: "jupiter_quote_readonly"
  };
}

function fetchJupiterQuoteReadonly(candidate) {
  return new Promise((resolve, reject) => {
    const inputMint = candidate.inputMint;
    const outputMint = candidate.outputMint;
    const amountLamports = Math.round(Number(candidate.intendedInputAmountSol) * 1e9);
    if (!inputMint || !outputMint || !Number.isFinite(amountLamports) || amountLamports <= 0) {
      reject(new Error("invalid candidate mints or amount"));
      return;
    }

    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: String(amountLamports),
      slippageBps: "300",
      swapMode: "ExactIn"
    });
    const url = `${JUPITER_QUOTE_ENDPOINT}?${params.toString()}`;

    const req = https.get(url, { headers: { Accept: "application/json" } }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode === 429) {
          reject(Object.assign(new Error("rate limited"), { code: "RATE_LIMITED" }));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`quote HTTP ${res.statusCode}`));
          return;
        }
        try {
          const quote = JSON.parse(body);
          if (!quote || !quote.outAmount) {
            reject(new Error("malformed quote response"));
            return;
          }
          resolve(normalizeJupiterQuoteResponse(quote, candidate));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error("quote request timeout"));
    });
  });
}

function buildEvaluationQuote(normalized) {
  return {
    inputMint: normalized.inputMint,
    outputMint: normalized.outputMint,
    inputAmount: normalized.inputAmount,
    outputAmount: normalized.quotedOutputAmount,
    minimumOutputAmount: normalized.minimumOutputAmount,
    slippageBps: normalized.slippageBps,
    priceImpactBps: normalized.priceImpactBps,
    quoteAgeSeconds: normalized.quoteAgeSeconds,
    routeProvider: normalized.routeProvider,
    routeSummary: normalized.routeSummary
  };
}

function buildObservationRecord(candidate, normalized, evaluation, collectedAt, provider) {
  const warnings = evaluation.findings
    .filter((f) => f.severity === r18.DECISION.WARN)
    .map((f) => f.code);
  const rejectionReasons = evaluation.findings
    .filter((f) => f.severity === r18.DECISION.REJECT)
    .map((f) => f.code);

  return {
    schemaVersion: SCHEMA_VERSION,
    collectedAt,
    sourceMode: "R29_OBSERVATION_ONLY",
    networkPolling: true,
    approved: false,
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false,
    provider,
    candidateId: candidate.candidateId,
    inputMint: normalized.inputMint,
    outputMint: normalized.outputMint,
    inputAmount: normalized.inputAmount,
    quotedOutputAmount: normalized.quotedOutputAmount,
    minimumOutputAmount: normalized.minimumOutputAmount,
    slippageBps: normalized.slippageBps,
    priceImpactBps: normalized.priceImpactBps,
    routeSummary: normalized.routeSummary,
    quoteAgeSeconds: normalized.quoteAgeSeconds,
    warnings,
    rejectionReasons,
    gateVerdict: evaluation.decision,
    tokenSymbol: candidate.tokenSymbol || null,
    tokenMint: candidate.tokenMint || null,
    pairAddress: candidate.pairAddress || null,
    candidateSource: candidate.source || null
  };
}

function filterCandidates(candidates, allowedSources) {
  if (!Array.isArray(candidates)) return [];
  return candidates.filter((candidate) => {
    const normalized = normalizeCandidateSource(candidate.source);
    return allowedSources.length === 0 || allowedSources.includes(normalized);
  });
}

function deriveObserverStatus(context) {
  if (!context.observeOnce) {
    return {
      observerStatus: "DISABLED",
      reason: "Observer disabled by default — pass --observe-once to run one gated observation cycle."
    };
  }

  if (!context.recoveryAbsent) {
    return { observerStatus: "STOPPED_BY_SAFETY_GATE", reason: "recovery_actions.jsonl present" };
  }

  if (
    context.posture.emergencyStop === true ||
    context.posture.liveArmed === true ||
    context.posture.dryRunMode === false ||
    FORBIDDEN_EXECUTION_MODES.has(String(context.posture.executionMode || "").toUpperCase()) ||
    !isSafeObservationPosture(context.posture)
  ) {
    return { observerStatus: "BLOCKED", reason: "Unsafe runtime posture." };
  }

  if (context.approvalLoad.status !== "present") {
    return {
      observerStatus: "INVALID_APPROVAL",
      reason: context.approvalLoad.error || "approval record missing"
    };
  }

  if (context.approvalValidation && !context.approvalValidation.valid) {
    return {
      observerStatus: "INVALID_APPROVAL",
      reason: context.approvalValidation.invalidReasons.join("; ")
    };
  }

  if (context.configLoad.status === "present" && context.configValidation && !context.configValidation.valid) {
    return {
      observerStatus: "INVALID_CONFIG",
      reason: context.configValidation.invalidReasons.join("; ")
    };
  }

  if (context.rateLimited) {
    return { observerStatus: "RATE_LIMITED", reason: context.rateLimitReason || "rate limit reached" };
  }

  if (context.providerError) {
    return {
      observerStatus: "PROVIDER_ERROR",
      reason: context.providerErrorReason || "provider error"
    };
  }

  if (context.observationCount > 0 || context.cycleAttempted) {
    return {
      observerStatus: "OBSERVATION_COMPLETE",
      reason: "One observation cycle complete — analysis output only; trading still blocked."
    };
  }

  return { observerStatus: "BLOCKED", reason: "Observation cycle blocked." };
}

async function runObservationCycle(options = {}) {
  const runtimeRoot = options.runtimeRoot || RUNTIME_ROOT;
  const repoRoot = options.repoRoot || ROOT;
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const collectedAt = options.collectedAt || new Date().toISOString();
  const nowMs = options.nowMs ?? Date.parse(collectedAt);
  const observeOnce = options.observeOnce === true;

  const posture = readPosture(runtimeRoot);
  const recoveryAbsent = !fs.existsSync(path.join(runtimeRoot, "recovery_actions.jsonl"));

  let approvalLoad;
  if (options.approval && typeof options.approval === "object") {
    approvalLoad = { status: "present", data: options.approval };
  } else {
    const approvalPath = options.approvalFile || DEFAULT_APPROVAL_FILE;
    approvalLoad = loadJsonFile(approvalPath);
    if (approvalLoad.status === "present") approvalLoad.approvalPath = approvalPath;
  }

  let configLoad;
  if (options.config && typeof options.config === "object") {
    configLoad = { status: "present", data: options.config };
  } else {
    const configPath = options.configFile || DEFAULT_CONFIG_FILE;
    configLoad = loadJsonFile(configPath);
    if (configLoad.status === "present") configLoad.configPath = configPath;
  }

  const approvalValidation = approvalLoad.status === "present"
    ? validateApprovalRecord(approvalLoad.data)
    : null;
  const configValidation = configLoad.status === "present"
    ? validateObserverConfig(configLoad.data)
    : { valid: true, invalidReasons: [] };

  const candidatesFile = options.candidatesFile || DEFAULT_CANDIDATES_FILE;
  const candidateLoad = r20.loadCandidates(candidatesFile);
  const allowedSources = approvalValidation?.allowedCandidateSources || [];
  const filteredCandidates = filterCandidates(candidateLoad.candidates, allowedSources);
  const limits = approvalValidation?.limits || {
    maxQuotesPerTokenPerMinute: 3,
    maxTokensPerCycle: 5,
    maxQuotesPerDay: 100,
    cooldownSeconds: 5
  };

  const rateStateFile = options.rateStateFile || path.join(analysisDir, "r29_rate_limit_state.json");
  const rateState = loadRateState(rateStateFile);
  const observations = [];
  let rateLimited = false;
  let rateLimitReason = null;
  let providerError = false;
  let providerErrorReason = null;
  let consecutiveErrors = 0;
  let cycleAttempted = false;

  const providerName = options.providerName
    || configLoad.data?.defaultProvider
    || approvalValidation?.allowedProviders?.[0]
    || "jupiter_quote_readonly";

  const quoteProvider = options.quoteProvider || null;

  if (
    observeOnce &&
    recoveryAbsent &&
    isSafeObservationPosture(posture) &&
    approvalValidation?.valid &&
    configValidation.valid &&
    !FORBIDDEN_EXECUTION_MODES.has(String(posture.executionMode || "").toUpperCase())
  ) {
    if (!approvalValidation.allowedProviders.includes(providerName)) {
      providerError = true;
      providerErrorReason = `provider not on allowlist: ${providerName}`;
    } else {
      const cycleCandidates = filteredCandidates.slice(0, limits.maxTokensPerCycle);
      cycleAttempted = true;

      const cycleCooldown = checkRateLimits(rateState, limits, null, nowMs, {
        checkTokenMinute: false
      });
      if (!cycleCooldown.allowed) {
        rateLimited = true;
        rateLimitReason = cycleCooldown.reason;
      }

      for (const candidate of cycleCandidates) {
        if (rateLimited) break;

        const tokenMint = candidate.tokenMint || candidate.outputMint;
        const rateCheck = checkRateLimits(rateState, limits, tokenMint, nowMs, {
          checkCooldown: false
        });
        if (!rateCheck.allowed) {
          rateLimited = true;
          rateLimitReason = rateCheck.reason;
          break;
        }

        try {
          let normalized;
          if (quoteProvider) {
            normalized = await quoteProvider(candidate, { providerName, nowMs });
          } else if (providerName === "jupiter_quote_readonly") {
            normalized = await fetchJupiterQuoteReadonly(candidate);
          } else {
            throw new Error(`unsupported provider: ${providerName}`);
          }

          const evaluation = r18.evaluateShadowQuote(buildEvaluationQuote(normalized), { nowMs });
          observations.push(
            buildObservationRecord(candidate, normalized, evaluation, collectedAt, providerName)
          );
          recordQuote(rateState, tokenMint, nowMs);
          consecutiveErrors = 0;

          if (options.persistRateState !== false) {
            saveRateState(rateStateFile, rateState);
          }
        } catch (err) {
          consecutiveErrors += 1;
          if (err && err.code === "RATE_LIMITED") {
            rateLimited = true;
            rateLimitReason = "provider rate limit response";
            break;
          }
          if (consecutiveErrors >= PROVIDER_ERROR_CLUSTER) {
            providerError = true;
            providerErrorReason = err && err.message ? err.message : String(err);
            break;
          }
        }
      }
    }
  }

  const context = {
    observeOnce,
    posture,
    recoveryAbsent,
    approvalLoad,
    approvalValidation,
    configLoad,
    configValidation,
    rateLimited,
    rateLimitReason,
    providerError,
    providerErrorReason,
    observationCount: observations.length,
    cycleAttempted
  };

  const gate = deriveObserverStatus(context);

  const passCount = observations.filter((o) => o.gateVerdict === r18.DECISION.PASS).length;
  const warnCount = observations.filter((o) => o.gateVerdict === r18.DECISION.WARN).length;
  const rejectCount = observations.filter((o) => o.gateVerdict === r18.DECISION.REJECT).length;

  return {
    timestamp: collectedAt,
    review: "R29-real-quote-observation-activation",
    schemaVersion: SCHEMA_VERSION,
    observerStatus: gate.observerStatus,
    reason: gate.reason,
    approved: false,
    liveTradingApproved: false,
    microLiveApproved: false,
    quotePollingActive: observeOnce && gate.observerStatus === "OBSERVATION_COMPLETE",
    tradingAllowed: false,
    signingAllowed: false,
    submissionAllowed: false,
    walletRequired: false,
    observeOnce,
    capitalAtRiskUsd: 0,
    posture,
    recoveryActionsJsonl: { exists: !recoveryAbsent },
    approvalRecord: {
      source: options.approval ? "(inline fixture)" : DEFAULT_APPROVAL_FILE,
      status: approvalLoad.status,
      validation: approvalValidation
    },
    config: {
      source: options.config ? "(inline fixture)" : DEFAULT_CONFIG_FILE,
      status: configLoad.status,
      validation: configValidation
    },
    provider: providerName,
    rateLimits: limits,
    observationCount: observations.length,
    passCount,
    warnCount,
    rejectCount,
    observations,
    evaluation: {
      verdict: "REAL QUOTE OBSERVATION IMPLEMENTED — TRADING STILL BLOCKED",
      observerStatus: gate.observerStatus,
      reason: gate.reason,
      approved: false
    },
    blockers: [
      "live trading not approved",
      "micro-live not approved",
      "no wallet connection",
      "no signing",
      "no submission"
    ],
    recommendedNextGate: "R30 Real Quote Observation Results Review; continue R7b"
  };
}

function appendObservations(observations, outputFile) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const body = observations.map((row) => `${JSON.stringify(row)}\n`).join("");
  fs.appendFileSync(outputFile, body);
  return outputFile;
}

function writeStatus(status, outputFile) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const { observations, ...summary } = status;
  fs.writeFileSync(outputFile, `${JSON.stringify(summary, null, 2)}\n`);
  return outputFile;
}

function printSummary(status) {
  console.log("[r29-observer] Real Quote Observation (observation-only)");
  console.log(`  verdict: ${status.evaluation.verdict}`);
  console.log(`  observer status: ${status.observerStatus}`);
  console.log(`  approved: false`);
  console.log(`  observe-once: ${status.observeOnce}`);
  console.log(`  observations: ${status.observationCount}`);
}

async function runR29RealQuoteObserver(options = {}) {
  const analysisDir = options.analysisDir || OUTPUT_DIR;
  const observationsFile = options.observationsFile || path.join(analysisDir, "real_quote_observations.jsonl");
  const statusFile = options.statusFile || path.join(analysisDir, "r29_real_quote_observation_status.json");

  const status = await runObservationCycle({
    ...options,
    analysisDir
  });

  if (options.writeOutput !== false) {
    if (status.observationCount > 0) {
      appendObservations(status.observations, observationsFile);
    }
    writeStatus(status, statusFile);
  }

  if (options.print !== false) {
    printSummary(status);
  }

  return {
    status,
    observationsFile: options.writeOutput !== false ? observationsFile : null,
    statusFile: options.writeOutput !== false ? statusFile : null
  };
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const options = { observeOnce: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--observe-once") {
      options.observeOnce = true;
    } else if (argv[i] === "--candidates" && argv[i + 1]) {
      options.candidatesFile = path.resolve(argv[i + 1]);
      i += 1;
    } else if (argv[i] === "--approval" && argv[i + 1]) {
      options.approvalFile = path.resolve(argv[i + 1]);
      i += 1;
    } else if (argv[i] === "--config" && argv[i + 1]) {
      options.configFile = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return options;
}

if (require.main === module) {
  runR29RealQuoteObserver(parseCliArgs())
    .then((result) => {
      if (result.statusFile) console.log(`  status: ${result.statusFile}`);
      if (result.observationsFile && result.status.observationCount > 0) {
        console.log(`  observations: ${result.observationsFile}`);
      }
    })
    .catch((err) => {
      console.error("[r29-observer] fatal:", err.message);
      process.exit(1);
    });
}

module.exports = {
  SCHEMA_VERSION,
  DEFAULT_APPROVAL_FILE,
  DEFAULT_CONFIG_FILE,
  DEFAULT_CANDIDATES_FILE,
  OBSERVATIONS_FILE,
  STATUS_FILE,
  readPosture,
  isSafeObservationPosture,
  validateApprovalRecord,
  validateObserverConfig,
  normalizeCandidateSource,
  filterCandidates,
  checkRateLimits,
  buildObservationRecord,
  deriveObserverStatus,
  runObservationCycle,
  appendObservations,
  writeStatus,
  runR29RealQuoteObserver,
  parseCliArgs,
  fetchJupiterQuoteReadonly
};
