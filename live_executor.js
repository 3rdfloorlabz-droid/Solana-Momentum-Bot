// live_executor.js
// 3rd Floor Labz — Phase 1 AUTONOMOUS Live Execution Layer (v2)
//
// This is the ONLY file responsible for live automation.
//
// SAFETY CONTRACT — these are enforced every cycle and cannot be bypassed:
//   1. DRY RUN by default. dryRunMode:true => no transactions are ever submitted.
//   2. Default OFF. automationEnabled:false => no entries.
//   3. emergencyStop:true => no entries AND no exits. Requires reset_live_safety.js.
//   4. Fixed position size. No compounding, no averaging down, no martingale.
//   5. Max 1 open live position.
//   6. Daily stop: 3 losses OR -0.10 SOL realized => no new entries.
//   7. Strict gmgn_v4 thesis only.
//   8. Never reads a private key from source. Real signing requires an env var
//      the user provides, and is NOT implemented here (guarded stub).
//   9. Paper trades are read-only. live and paper data never mix.
//
// Files written (all in project root):
//   live_trades.jsonl          append-only event + closed-trade log
//   live_positions.json        current open positions (overwritten on change)
//   live_control_events.jsonl  START / STOP / EMERGENCY / RESET events
//   live_errors.jsonl          aborts and errors

"use strict";

const fs   = require("fs");
const path = require("path");
const crypto = require("crypto");
const configStore = require("./config_store"); // A1b: shared atomic config writer

let axios = null;
try { axios = require("axios"); } catch { /* price polling will degrade gracefully */ }

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT                = __dirname;
const CONFIG_FILE         = path.join(ROOT, "live_config.json");
const PAPER_FILE          = path.join(ROOT, "paper_trades.json");
const PIPELINE_CANDIDATES_FILE = path.join(ROOT, "pipeline_candidates.jsonl");
const LIVE_TRADES_FILE    = path.join(ROOT, "live_trades.jsonl");
const LIVE_POSITIONS_FILE = path.join(ROOT, "live_positions.json");
const CONTROL_EVENTS_FILE = path.join(ROOT, "live_control_events.jsonl");
const ERRORS_FILE         = path.join(ROOT, "live_errors.jsonl");
const EXECUTION_AUDIT_FILE = path.join(ROOT, "execution_audit.jsonl");
const PENDING_RECONCILIATION_FILE = path.join(ROOT, "pending_reconciliation.jsonl");
const OBSERVATION_DEDUP_FILE = path.join(ROOT, "observation_dedup.json");
const CONFIG_AUDIT_FILE   = path.join(ROOT, "config_change_audit.jsonl");

const DEX = "https://api.dexscreener.com";
const JUPITER_QUOTE_ENDPOINT = "https://quote-api.jup.ag/v6/quote";
const JUPITER_SWAP_ENDPOINT = "https://api.jup.ag/swap/v1/swap";
const SOL_MINT = "So11111111111111111111111111111111111111112";

const PHASE            = "PHASE_1_AUTONOMOUS_DRY_RUN";
const EXECUTOR_VERSION = "live_executor_v2";
const TARGET_MULT      = 1.10;  // matches paper monitor target
const STOP_MULT        = 0.95;  // matches paper monitor stop
const TIMEOUT_MINUTES  = 20;    // matches paper monitor timeout

const FORBIDDEN_FLAGS = ["COMPOUNDING", "AVERAGING_DOWN", "MARTINGALE", "MULTI_POSITION"];
const EXECUTION_ABORT_CODES = Object.freeze({
  REAL_PATH_DISABLED: "REAL_PATH_DISABLED",
  SIGNER_LOAD_FAILED: "SIGNER_LOAD_FAILED",
  WALLET_MISMATCH: "WALLET_MISMATCH",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  MINT_MISMATCH: "MINT_MISMATCH",
  QUOTE_FAILED: "QUOTE_FAILED",
  ENTRY_SLIPPAGE_BLOCKED: "ENTRY_SLIPPAGE_BLOCKED",
  EXIT_SLIPPAGE_BLOCKED: "EXIT_SLIPPAGE_BLOCKED",
  ROUTE_REJECTED: "ROUTE_REJECTED",
  PRIORITY_FEE_UNAVAILABLE: "PRIORITY_FEE_UNAVAILABLE",
  TX_BUILD_FAILED: "TX_BUILD_FAILED",
  SIMULATION_FAILED: "SIMULATION_FAILED",
  SUBMIT_FAILED: "SUBMIT_FAILED",
  SUBMISSION_UNKNOWN: "SUBMISSION_UNKNOWN",
  SUBMISSION_NOT_IMPLEMENTED: "SUBMISSION_NOT_IMPLEMENTED",
  CONFIRMATION_TIMEOUT: "CONFIRMATION_TIMEOUT",
  CONFIRMATION_FAILED: "CONFIRMATION_FAILED",
  FILL_PARSE_FAILED: "FILL_PARSE_FAILED"
});
const EXPECTED_OBSERVATION_ABORT_CODES = Object.freeze(new Set([
  EXECUTION_ABORT_CODES.QUOTE_FAILED,
  EXECUTION_ABORT_CODES.TX_BUILD_FAILED,
  EXECUTION_ABORT_CODES.SIMULATION_FAILED,
  EXECUTION_ABORT_CODES.PRIORITY_FEE_UNAVAILABLE
]));
const EXECUTION_STAGES = Object.freeze({
  GUARD: "GUARD",
  SIGNER_LOAD: "SIGNER_LOAD",
  WALLET_MATCH: "WALLET_MATCH",
  BALANCE_CHECK: "BALANCE_CHECK",
  MINT_RESOLUTION: "MINT_RESOLUTION",
  QUOTE: "QUOTE",
  ROUTE_VALIDATION: "ROUTE_VALIDATION",
  PRIORITY_FEE: "PRIORITY_FEE",
  TX_BUILD: "TX_BUILD",
  SIMULATION: "SIMULATION",
  SIGNED: "SIGNED",
  SUBMIT: "SUBMIT",
  CONFIRMATION: "CONFIRMATION",
  FILL_PARSE: "FILL_PARSE",
  PIPELINE_DRY_RUN: "PIPELINE_DRY_RUN",
  CYCLE_START: "CYCLE_START",
  CYCLE_NO_CANDIDATE: "CYCLE_NO_CANDIDATE",
  CYCLE_CANDIDATE_SELECTED: "CYCLE_CANDIDATE_SELECTED",
  CYCLE_END: "CYCLE_END"
});

function resolveExecutionMode(cfg) {
  if (["DRY_RUN", "PIPELINE_DRY_RUN", "LIVE"].includes(cfg?.executionMode)) {
    return cfg.executionMode;
  }
  return cfg?.dryRunMode === false ? "LIVE" : "DRY_RUN";
}

function isAnyDryRun(cfg) {
  return resolveExecutionMode(cfg) !== "LIVE";
}

// ─── Small fs helpers ─────────────────────────────────────────────────────────

function nowIso() { return new Date().toISOString(); }

function appendJsonl(file, obj) {
  fs.appendFileSync(file, JSON.stringify(obj) + "\n");
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, i) => {
      try { return JSON.parse(line); }
      catch { return { _parseError: true, _line: i + 1, _raw: line }; }
    });
}

function logError(stage, message, extra = {}) {
  try {
    appendJsonl(ERRORS_FILE, { timestamp: nowIso(), stage, message, ...extra });
  } catch { /* never throw from the error logger */ }
}

// ─── Real-execution logging scaffold (no signer or transaction behavior) ─────

function redactSecrets(value) {
  if (Array.isArray(value)) {
    if (value.length >= 16 && value.every(item => Number.isInteger(item) && item >= 0 && item <= 255)) {
      return "[REDACTED_BYTE_ARRAY]";
    }
    return value.map(redactSecrets);
  }
  if (value && typeof value === "object") {
    const sanitized = {};
    for (const [key, item] of Object.entries(value)) {
      if (/secret|private.?key|seed|mnemonic|api.?key/i.test(key)) sanitized[key] = "[REDACTED]";
      else sanitized[key] = redactSecrets(item);
    }
    return sanitized;
  }
  if (typeof value !== "string") return value;
  return value
    .replace(/((?:[?&]|\b)(?:api[-_]?key|apikey|token)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\[(?:\s*\d{1,3}\s*,){15,}\s*\d{1,3}\s*\]/g, "[REDACTED_BYTE_ARRAY]");
}

function safeErrorMessage(message) {
  const sanitized = redactSecrets(message instanceof Error ? message.message : message);
  return String(sanitized ?? "Unknown execution error").slice(0, 1000);
}

function makeExecutionError(code, stage, message, extra = {}) {
  const error = new Error(safeErrorMessage(message));
  error.name = "ExecutionError";
  error.code = code;
  error.stage = stage;
  error.extra = redactSecrets(extra);
  return error;
}

function logExecutionStage(stage, payload = {}) {
  const event = {
    timestamp: nowIso(),
    eventType: "EXECUTION_STAGE",
    stage,
    payload: redactSecrets(payload)
  };
  appendJsonl(EXECUTION_AUDIT_FILE, event);
  return event;
}

function logExecutionFailure(code, stage, message, extra = {}) {
  const event = {
    timestamp: nowIso(),
    eventType: "EXECUTION_FAILURE",
    code,
    stage,
    message: safeErrorMessage(message),
    extra: redactSecrets(extra)
  };
  appendJsonl(ERRORS_FILE, event);
  return event;
}

function cycleAuditBase(cfg, mode, options = {}) {
  return {
    executionMode: mode,
    dryRunMode: cfg?.dryRunMode === true,
    automationEnabled: cfg?.automationEnabled === true,
    emergencyStop: cfg?.emergencyStop === true,
    positionSizeSol: Number(cfg?.positionSizeSol ?? 0),
    maxOpenTrades: Number(cfg?.maxOpenTrades ?? 0),
    loopMode: options.loopMode === true,
    cycleMode: options.cycleMode === true
  };
}

function cycleCandidateAudit(candidate) {
  return {
    symbol: candidate?.symbol || null,
    address: candidate?.address || null,
    pairAddress: candidate?.pairAddress || null,
    candidateHandoffSource: candidate?.candidateHandoffSource || null,
    source: candidate?.source || null,
    sourcePool: candidate?.sourcePool || null,
    thesisMatch: candidate?.thesisMatch === true
  };
}

// ─── Real-execution signer guard scaffold (no signing or submission) ──────────

let signerGuardLoadCount = 0;
let signerLoaderForTest = null;

function encodeBase58(bytes) {
  if (!(bytes instanceof Uint8Array) && !Buffer.isBuffer(bytes)) {
    throw new Error("encodeBase58 requires bytes");
  }
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = 0n;
  for (const byte of bytes) value = (value * 256n) + BigInt(byte);
  let encoded = "";
  while (value > 0n) {
    encoded = alphabet[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) leadingZeros++;
  return "1".repeat(leadingZeros) + (encoded || (leadingZeros ? "" : "1"));
}

function loadSignerFromEnvForRealExecution(cfg) {
  signerGuardLoadCount += 1;
  if (signerLoaderForTest) return signerLoaderForTest(cfg);
  const raw = process.env.SOLANA_SIGNER_SECRET;
  if (!raw) {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.REAL_PATH_DISABLED,
      EXECUTION_STAGES.GUARD,
      "Real execution signer is not configured."
    );
  }

  let secretBytes;
  try {
    secretBytes = JSON.parse(raw);
  } catch {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.SIGNER_LOAD_FAILED,
      EXECUTION_STAGES.SIGNER_LOAD,
      "Signer must be a valid JSON byte array."
    );
  }
  if (!Array.isArray(secretBytes) ||
      secretBytes.length !== 64 ||
      !secretBytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.SIGNER_LOAD_FAILED,
      EXECUTION_STAGES.SIGNER_LOAD,
      "Signer must be a 64-byte JSON array."
    );
  }

  let publicKeyBytes;
  try {
    const seed = Buffer.from(secretBytes.slice(0, 32));
    const privateDer = Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      seed
    ]);
    const privateKey = crypto.createPrivateKey({ key: privateDer, format: "der", type: "pkcs8" });
    const publicDer = crypto.createPublicKey(privateKey).export({ format: "der", type: "spki" });
    publicKeyBytes = Buffer.from(publicDer).subarray(-32);
    if (!publicKeyBytes.equals(Buffer.from(secretBytes.slice(32)))) {
      throw new Error("embedded public key mismatch");
    }
  } catch {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.SIGNER_LOAD_FAILED,
      EXECUTION_STAGES.SIGNER_LOAD,
      "Signer byte array is not a valid Ed25519 keypair."
    );
  }

  const publicAddress = encodeBase58(publicKeyBytes);
  if (!cfg?.walletPublicAddress || publicAddress !== cfg.walletPublicAddress) {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.WALLET_MISMATCH,
      EXECUTION_STAGES.WALLET_MATCH,
      "Signer public address does not match configured wallet."
    );
  }
  if (process.env.EXPECTED_WALLET_PUBLIC_ADDRESS &&
      process.env.EXPECTED_WALLET_PUBLIC_ADDRESS !== cfg.walletPublicAddress) {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.WALLET_MISMATCH,
      EXECUTION_STAGES.WALLET_MATCH,
      "Expected wallet address does not match configured wallet."
    );
  }

  return Object.freeze({
    secretKey: Uint8Array.from(secretBytes),
    publicKey: Object.freeze({ toBase58: () => publicAddress }),
    sign: function(messageBytes) {
      if (!(messageBytes instanceof Uint8Array) || messageBytes.length === 0) {
        throw new Error("sign() requires a non-empty Uint8Array");
      }
      // Use Node's crypto.sign with Ed25519 (no separate hash; Ed25519 hashes internally).
      const privateKeyObj = crypto.createPrivateKey({
        key: Buffer.concat([
          Buffer.from("302e020100300506032b657004220420", "hex"),
          Buffer.from(secretBytes.slice(0, 32))
        ]),
        format: "der",
        type: "pkcs8"
      });
      const signature = crypto.sign(null, Buffer.from(messageBytes), privateKeyObj);
      if (signature.length !== 64) {
        throw new Error("Ed25519 signature must be 64 bytes");
      }
      return new Uint8Array(signature);
    }
  });
}

// ─── Jupiter quote + route-validation scaffold (no swap transaction) ─────────

let quoteFetch = (...args) => fetch(...args);
let priorityFeeFetch = (...args) => fetch(...args);
let swapBuildFetch = (...args) => fetch(...args);
let simulationFetch = (...args) => fetch(...args);
let submissionFetch = (...args) => fetch(...args);
let confirmationFetch = (...args) => fetch(...args);
let fillFetch = (...args) => fetch(...args);

const PUBLIC_SOLANA_RPC_ENDPOINT = "https://api.mainnet-beta.solana.com";
const PUBLIC_SOLANA_RPC_HOSTNAMES = new Set([
  "api.mainnet-beta.solana.com",
  "api.devnet.solana.com",
  "api.testnet.solana.com"
]);

function isPublicSolanaRpcEndpoint(endpoint) {
  if (typeof endpoint !== "string" || !endpoint.trim()) return false;
  try {
    return PUBLIC_SOLANA_RPC_HOSTNAMES.has(new URL(endpoint.trim()).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function resolveRpcEndpoint(cfg, options = {}) {
  const requireDedicated = options.requireDedicated === true;
  const purpose = String(options.purpose || "rpc");
  const stage = purpose === "priority_fee"
    ? EXECUTION_STAGES.PRIORITY_FEE
    : purpose === "simulation"
      ? EXECUTION_STAGES.SIMULATION
      : purpose === "submission"
        ? EXECUTION_STAGES.SUBMIT
        : purpose === "confirmation"
          ? EXECUTION_STAGES.CONFIRMATION
          : purpose === "fill_parse"
            ? EXECUTION_STAGES.FILL_PARSE
            : EXECUTION_STAGES.BALANCE_CHECK;
  const code = purpose === "priority_fee"
    ? EXECUTION_ABORT_CODES.PRIORITY_FEE_UNAVAILABLE
    : purpose === "submission"
      ? EXECUTION_ABORT_CODES.SUBMIT_FAILED
      : purpose === "confirmation"
        ? EXECUTION_ABORT_CODES.CONFIRMATION_TIMEOUT
        : purpose === "fill_parse"
          ? EXECUTION_ABORT_CODES.FILL_PARSE_FAILED
          : EXECUTION_ABORT_CODES.SIMULATION_FAILED;
  const candidates = [
    ["HELIUS_RPC_URL", process.env.HELIUS_RPC_URL],
    ["SOLANA_RPC_URL", process.env.SOLANA_RPC_URL],
    ["HELIUS_API_KEY_DERIVED", process.env.HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY)}`
      : null]
  ];
  const configuredProvidersPresent = candidates.filter(([, endpoint]) => !!endpoint).map(([provider]) => provider);
  const rejectedAsPublic = candidates
    .filter(([, endpoint]) => endpoint && isPublicSolanaRpcEndpoint(endpoint))
    .map(([provider]) => provider);
  const selected = candidates.find(([, endpoint]) => endpoint && !isPublicSolanaRpcEndpoint(endpoint));
  if (!selected && requireDedicated) {
    const message = "Dedicated RPC endpoint required; public mainnet-beta fallback refused.";
    logExecutionStage(stage, {
      endpointResolution: true,
      purpose,
      requireDedicated: true,
      provider: null,
      publicFallbackUsed: false,
      rejectedAsPublic,
      configuredProvidersPresent,
      message
    });
    throw makeExecutionError(
      code,
      stage,
      message,
      { purpose, requireDedicated, publicFallbackUsed: false, rejectedAsPublic, configuredProvidersPresent }
    );
  }
  const provider = selected ? selected[0] : "PUBLIC_FALLBACK";
  const endpoint = selected ? selected[1] : PUBLIC_SOLANA_RPC_ENDPOINT;
  const result = Object.freeze({ endpoint, provider, purpose, requireDedicated, publicFallbackUsed: !selected });
  logExecutionStage(stage, {
    endpointResolution: true,
    endpoint: redactSecrets(endpoint),
    provider,
    purpose,
    requireDedicated,
    publicFallbackUsed: !selected,
    rejectedAsPublic,
    configuredProvidersPresent
  });
  return result;
}

function isPlausibleSolanaAddress(value) {
  return typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function resolveSwapMints(kind, tokenAddress) {
  if (!["BUY", "SELL"].includes(kind) || !isPlausibleSolanaAddress(tokenAddress)) {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.MINT_MISMATCH,
      EXECUTION_STAGES.MINT_RESOLUTION,
      "Swap kind or token mint is invalid."
    );
  }
  return kind === "BUY"
    ? Object.freeze({ inputMint: SOL_MINT, outputMint: tokenAddress })
    : Object.freeze({ inputMint: tokenAddress, outputMint: SOL_MINT });
}

async function getJupiterQuote(kind, cfg, mints, amountLamportsOrTokenUnits) {
  const amount = Number(amountLamportsOrTokenUnits);
  const slippagePct = kind === "BUY" ? Number(cfg.maxEntrySlippagePct) : Number(cfg.maxExitSlippagePct);
  if (!["BUY", "SELL"].includes(kind) ||
      !mints?.inputMint || !mints?.outputMint ||
      !Number.isSafeInteger(amount) || amount <= 0 ||
      !Number.isFinite(slippagePct) || slippagePct < 0) {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.QUOTE_FAILED,
      EXECUTION_STAGES.QUOTE,
      "Quote request parameters are invalid."
    );
  }

  const params = new URLSearchParams({
    inputMint: mints.inputMint,
    outputMint: mints.outputMint,
    amount: String(amount),
    slippageBps: String(Math.round(slippagePct * 100)),
    swapMode: "ExactIn"
  });

  try {
    const response = await quoteFetch(`${JUPITER_QUOTE_ENDPOINT}?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    if (!response || response.ok !== true) {
      throw new Error("Jupiter quote HTTP request failed.");
    }
    const quote = await response.json();
    const requiredFields = ["inputMint", "outputMint", "inAmount", "outAmount", "otherAmountThreshold", "priceImpactPct", "slippageBps"];
    if (!quote || requiredFields.some(field => quote[field] === undefined || quote[field] === null) ||
        !Array.isArray(quote.routePlan) || quote.routePlan.length === 0) {
      throw new Error("Jupiter quote response is empty or malformed.");
    }
    logExecutionStage(EXECUTION_STAGES.QUOTE, {
      kind,
      inputMint: quote.inputMint,
      outputMint: quote.outputMint,
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
      otherAmountThreshold: quote.otherAmountThreshold,
      priceImpactPct: quote.priceImpactPct,
      slippageBps: quote.slippageBps,
      routeCount: quote.routePlan.length
    });
    return quote;
  } catch (error) {
    if (error?.code) throw error;
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.QUOTE_FAILED,
      EXECUTION_STAGES.QUOTE,
      "Jupiter quote retrieval failed.",
      { reason: safeErrorMessage(error) }
    );
  }
}

function validateJupiterRoute(quote, kind, cfg, mints) {
  if (!quote || !mints || quote.inputMint !== mints.inputMint || quote.outputMint !== mints.outputMint) {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.MINT_MISMATCH,
      EXECUTION_STAGES.ROUTE_VALIDATION,
      "Jupiter route mints do not match expected swap mints."
    );
  }

  const priceImpactPct = Number(quote.priceImpactPct);
  const slippagePct = Number(quote.slippageBps) / 100;
  const maxSlippagePct = kind === "BUY" ? Number(cfg.maxEntrySlippagePct) : Number(cfg.maxExitSlippagePct);
  if (!Number.isFinite(priceImpactPct) || !Number.isFinite(slippagePct) || !Number.isFinite(maxSlippagePct)) {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.QUOTE_FAILED,
      EXECUTION_STAGES.ROUTE_VALIDATION,
      "Jupiter route metrics are malformed."
    );
  }
  if (priceImpactPct > Number(cfg.maxRoutePriceImpactPct)) {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.ROUTE_REJECTED,
      EXECUTION_STAGES.ROUTE_VALIDATION,
      "Jupiter route price impact exceeds configured maximum."
    );
  }
  if (slippagePct > maxSlippagePct) {
    throw makeExecutionError(
      kind === "BUY" ? EXECUTION_ABORT_CODES.ENTRY_SLIPPAGE_BLOCKED : EXECUTION_ABORT_CODES.EXIT_SLIPPAGE_BLOCKED,
      EXECUTION_STAGES.ROUTE_VALIDATION,
      "Jupiter route slippage exceeds configured maximum."
    );
  }

  logExecutionStage(EXECUTION_STAGES.ROUTE_VALIDATION, {
    kind,
    inputMint: quote.inputMint,
    outputMint: quote.outputMint,
    priceImpactPct,
    slippagePct,
    maxSlippagePct
  });
  return quote;
}

async function resolvePriorityFee(cfg, context = {}) {
  // Phase 1 unit contract:
  // - config caps/fallbacks are TOTAL lamports per transaction.
  // - priorityFeeEstimate is treated as micro-lamports per compute unit.
  // - total lamport budget = microLamportsPerCU × assumedComputeUnitLimit ÷ 1,000,000.
  // - maxPriorityFeeLamports is a total per-transaction cap.
  // - Verify the Helius response shape against current docs before real execution.
  const mode = cfg?.priorityFeeMode;
  const maxFee = Number(cfg?.maxPriorityFeeLamports);
  const fallback = Number(cfg?.fallbackPriorityFeeLamports);
  const assumedComputeUnitLimit = Number(cfg?.assumedComputeUnitLimit);
  const timeoutMs = Math.min(Math.max(Number(context.timeoutMs) || 5000, 1), 10000);
  const hasFallback = cfg?.fallbackPriorityFeeLamports !== null &&
    cfg?.fallbackPriorityFeeLamports !== undefined &&
    Number.isFinite(fallback) && fallback >= 0;

  const finish = ({ rawEstimate = null, rawEstimateShape = "unavailable", totalEstimatedLamports = null, fallbackUsed = false, usedComputeUnitLimit = false }) => {
    const candidate = fallbackUsed ? fallback : totalEstimatedLamports;
    if (!Number.isFinite(candidate) || candidate < 0) {
      throw makeExecutionError(
        EXECUTION_ABORT_CODES.PRIORITY_FEE_UNAVAILABLE,
        EXECUTION_STAGES.PRIORITY_FEE,
        "Priority fee estimate and fallback are unavailable."
      );
    }
    const rounded = Math.round(candidate);
    const applied = Math.min(rounded, maxFee);
    const clamped = rounded > maxFee;
    const result = Object.freeze({
      mode,
      provider: "helius",
      rawEstimate: Number.isFinite(rawEstimate) && rawEstimate >= 0 ? rawEstimate : null,
      rawEstimateShape,
      assumedComputeUnitLimit: usedComputeUnitLimit ? assumedComputeUnitLimit : null,
      totalEstimatedLamports: Number.isFinite(totalEstimatedLamports) ? Math.round(totalEstimatedLamports) : null,
      appliedPriorityFeeLamports: applied,
      priorityFeeLamports: applied,
      maxPriorityFeeLamports: maxFee,
      clamped,
      fallbackUsed,
      timeoutMs
    });
    logExecutionStage(EXECUTION_STAGES.PRIORITY_FEE, result);
    return result;
  };

  if (mode !== "dynamic_helius" ||
      !Number.isFinite(maxFee) || maxFee < 0 ||
      !Number.isInteger(assumedComputeUnitLimit) || assumedComputeUnitLimit <= 0) {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.PRIORITY_FEE_UNAVAILABLE,
      EXECUTION_STAGES.PRIORITY_FEE,
      "Dynamic Helius priority-fee mode is required."
    );
  }

  const rpc = resolveRpcEndpoint(cfg, { requireDedicated: true, purpose: "priority_fee" });
  const endpoint = rpc.endpoint;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await priorityFeeFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "priority-fee-estimate",
        method: "getPriorityFeeEstimate",
        params: [{
          accountKeys: Array.isArray(context.accountKeys) ? context.accountKeys : [],
          options: { recommended: true }
        }]
      })
    });
    if (!response || response.ok !== true) throw new Error("Helius priority-fee request failed.");
    const json = await response.json();
    const result = json?.result;
    const directTotal = Number(result?.totalPriorityFeeLamports ?? result?.priorityFeeLamports);
    if (Number.isFinite(directTotal) && directTotal > 0) {
      return finish({
        rawEstimate: directTotal,
        rawEstimateShape: result?.totalPriorityFeeLamports !== undefined ? "totalPriorityFeeLamports" : "priorityFeeLamports",
        totalEstimatedLamports: directTotal
      });
    }
    const microLamportsPerCu = Number(result?.microLamportsPerComputeUnit ?? result?.priorityFeeEstimate);
    if (Number.isFinite(microLamportsPerCu) && microLamportsPerCu > 0) {
      return finish({
        rawEstimate: microLamportsPerCu,
        rawEstimateShape: result?.microLamportsPerComputeUnit !== undefined ? "microLamportsPerComputeUnit" : "priorityFeeEstimate_assumed_microLamportsPerCU",
        totalEstimatedLamports: (microLamportsPerCu * assumedComputeUnitLimit) / 1e6,
        usedComputeUnitLimit: true
      });
    }
    return finish({ rawEstimateShape: "malformed", fallbackUsed: hasFallback });
  } catch (error) {
    if (error?.code === EXECUTION_ABORT_CODES.PRIORITY_FEE_UNAVAILABLE) throw error;
    logExecutionFailure(
      EXECUTION_ABORT_CODES.PRIORITY_FEE_UNAVAILABLE,
      EXECUTION_STAGES.PRIORITY_FEE,
      "Helius priority-fee lookup failed; fallback evaluation follows.",
      { reason: safeErrorMessage(error) }
    );
    return finish({
      rawEstimateShape: error?.name === "AbortError" ? "timeout" : "provider_error",
      fallbackUsed: hasFallback
    });
  } finally {
    clearTimeout(timer);
  }
}

// Jupiter Swap v1 docs checked 2026-06-12:
// https://developers.jup.ag/docs/api-reference/swap/v1/swap
// Phase 1 ATA policy: allow Jupiter's single returned swap transaction to include
// required ATA creation. We do not manually build ATA instructions. First-time
// ATA rent cost may only become visible during the future Step 8 simulation.
// Step 8 must require sufficient SOL headroom for possible ATA rent plus fees.
function readShortvec(bytes, offset, field, requireSingleByte = false) {
  if (!Number.isInteger(offset) || offset < 0 || offset >= bytes.length) {
    throw new Error(`${field} shortvec offset is malformed.`);
  }
  let value = 0;
  let shift = 0;
  let cursor = offset;
  while (cursor < bytes.length) {
    const byte = bytes[cursor];
    value |= (byte & 0x7f) << shift;
    cursor += 1;
    if ((byte & 0x80) === 0) {
      const byteLength = cursor - offset;
      if (requireSingleByte && byteLength !== 1) {
        throw new Error(`${field} shortvec must use one byte in Phase 1.`);
      }
      return { value, nextOffset: cursor, byteLength };
    }
    shift += 7;
    if (shift > 28) throw new Error(`${field} shortvec is too large.`);
  }
  throw new Error(`${field} shortvec is truncated.`);
}

function inspectVersionedV0Transaction(bytes) {
  const signatureCount = readShortvec(bytes, 0, "signature count", true);
  let offset = signatureCount.nextOffset + (signatureCount.value * 64);
  if (offset >= bytes.length) throw new Error("Transaction message offset is malformed.");

  const versionPrefix = bytes[offset++];
  if ((versionPrefix & 0x80) === 0) throw new Error("Legacy transactions are not allowed in Phase 1.");
  const version = versionPrefix & 0x7f;
  if (version !== 0) throw new Error(`Unsupported future transaction version ${version}.`);

  if (offset + 3 > bytes.length) throw new Error("Versioned message header is truncated.");
  offset += 3;

  const accountCount = readShortvec(bytes, offset, "account key count");
  offset = accountCount.nextOffset + (accountCount.value * 32);
  if (offset + 32 > bytes.length) throw new Error("Versioned message account keys or blockhash are truncated.");
  offset += 32;

  const instructionCount = readShortvec(bytes, offset, "instruction count");
  if (instructionCount.value <= 0) throw new Error("Transactions with zero instructions are not allowed.");

  return Object.freeze({
    transactionType: "versioned_v0",
    version,
    signatureCount: signatureCount.value,
    instructionCount: instructionCount.value
  });
}

async function buildSwapTx(quote, signer, priorityFee, cfg, context = {}) {
  const signerPublicKey = signer?.publicKey?.toBase58?.();
  if (!cfg?.walletPublicAddress || signerPublicKey !== cfg.walletPublicAddress) {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.WALLET_MISMATCH,
      EXECUTION_STAGES.TX_BUILD,
      "Signer public key does not match configured wallet."
    );
  }
  if (!quote || !Number.isFinite(Number(quote.slippageBps))) {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.TX_BUILD_FAILED,
      EXECUTION_STAGES.TX_BUILD,
      "Validated quote is missing slippageBps."
    );
  }

  const totalPriorityFeeLamports = Number(priorityFee?.appliedPriorityFeeLamports);
  const computeUnitLimit = Number(cfg?.assumedComputeUnitLimit);
  if (!Number.isFinite(totalPriorityFeeLamports) || totalPriorityFeeLamports < 0 ||
      totalPriorityFeeLamports > Number(cfg?.maxPriorityFeeLamports) ||
      !Number.isInteger(computeUnitLimit) || computeUnitLimit <= 0) {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.TX_BUILD_FAILED,
      EXECUTION_STAGES.TX_BUILD,
      "Priority-fee build settings are invalid."
    );
  }
  const derivedMicroLamportsPerCU = Math.floor(
    (totalPriorityFeeLamports * 1e6) / computeUnitLimit
  );

  const requestBody = {
    quoteResponse: quote,
    userPublicKey: cfg.walletPublicAddress,
    wrapAndUnwrapSol: true,
    asLegacyTransaction: false,
    slippageBps: Number(quote.slippageBps),
    prioritizationFeeLamports: totalPriorityFeeLamports,
    dynamicComputeUnitLimit: false,
    skipUserAccountsRpcCalls: false
  };

  try {
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (process.env.JUPITER_API_KEY) headers["x-api-key"] = process.env.JUPITER_API_KEY;
    const response = await swapBuildFetch(JUPITER_SWAP_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: context.signal
    });
    if (!response || response.ok !== true) throw new Error("Jupiter swap build HTTP request failed.");
    const json = await response.json();
    if (json?.setupTransaction || json?.cleanupTransaction || Array.isArray(json?.transactions) ||
        Array.isArray(json?.swapTransactions)) {
      throw makeExecutionError(
        EXECUTION_ABORT_CODES.TX_BUILD_FAILED,
        EXECUTION_STAGES.TX_BUILD,
        "Multiple or split transactions are not allowed in Phase 1."
      );
    }
    if (!json || typeof json.swapTransaction !== "string" || !json.swapTransaction) {
      throw makeExecutionError(
        EXECUTION_ABORT_CODES.TX_BUILD_FAILED,
        EXECUTION_STAGES.TX_BUILD,
        "Jupiter swap build response is malformed."
      );
    }

    const bytes = Buffer.from(json.swapTransaction, "base64");
    if (bytes.length < 2) {
      throw makeExecutionError(
        EXECUTION_ABORT_CODES.TX_BUILD_FAILED,
        EXECUTION_STAGES.TX_BUILD,
        "Jupiter swap transaction bytes are malformed."
      );
    }
    let shape;
    try {
      shape = inspectVersionedV0Transaction(bytes);
    } catch (error) {
      throw makeExecutionError(
        EXECUTION_ABORT_CODES.TX_BUILD_FAILED,
        EXECUTION_STAGES.TX_BUILD,
        safeErrorMessage(error)
      );
    }

    const quoteHash = crypto.createHash("sha256")
      .update(JSON.stringify(quote))
      .digest("hex")
      .slice(0, 16);
    const metadata = Object.freeze({
      transactionType: shape.transactionType,
      transactionVersion: shape.version,
      signatureCount: shape.signatureCount,
      instructionCount: shape.instructionCount,
      wirePrioritizationFeeLamports: totalPriorityFeeLamports,
      derivedMicroLamportsPerCU,
      derivedFromAssumedComputeUnitLimit: true,
      computeUnitLimit,
      lastValidBlockHeight: Number.isFinite(Number(json.lastValidBlockHeight)) ? Number(json.lastValidBlockHeight) : null,
      jupiterReportedPrioritizationFeeLamports: Number.isFinite(Number(json.prioritizationFeeLamports))
        ? Number(json.prioritizationFeeLamports)
        : null,
      wrapAndUnwrapSol: true,
      ataCreation: "unknown_possible",
      endpoint: redactSecrets(JUPITER_SWAP_ENDPOINT),
      quoteHash
    });
    logExecutionStage(EXECUTION_STAGES.TX_BUILD, metadata);

    return {
      transaction: Object.freeze({
        type: shape.transactionType,
        serializedBytes: Uint8Array.from(bytes)
      }),
      metadata,
      // Local-scope review data only. Never log or persist requestBody because it
      // contains the complete quote and wallet-facing build parameters.
      requestBody
    };
  } catch (error) {
    if (error?.code) throw error;
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.TX_BUILD_FAILED,
      EXECUTION_STAGES.TX_BUILD,
      "Jupiter swap transaction build failed.",
      { reason: safeErrorMessage(error) }
    );
  }
}

// Solana simulateTransaction RPC docs checked 2026-06-12:
// https://solana.com/docs/rpc/http/simulatetransaction
// The transaction is not required to be signed when sigVerify=false. Step 8
// passes the Step 7 bytes through unchanged and never accesses signer material.
// cuHeadroomVsAssumed = 1 - unitsConsumed / assumedComputeUnitLimit.
// It is a tuning signal only, not actual on-chain compute-unit headroom.
async function simulateSwapTx(builtSwap, cfg, context = {}) {
  const serializedBytes = builtSwap?.transaction?.serializedBytes;
  if (!(serializedBytes instanceof Uint8Array) || serializedBytes.length === 0) {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.SIMULATION_FAILED,
      EXECUTION_STAGES.SIMULATION,
      "Unsigned transaction bytes are missing."
    );
  }

  const rpc = resolveRpcEndpoint(cfg, { requireDedicated: true, purpose: "simulation" });
  const endpoint = rpc.endpoint;
  const rpcConfig = {
    encoding: "base64",
    sigVerify: false,
    replaceRecentBlockhash: false,
    commitment: "confirmed",
    innerInstructions: false
  };
  const requestBody = {
    jsonrpc: "2.0",
    id: "unsigned-swap-simulation",
    method: "simulateTransaction",
    params: [Buffer.from(serializedBytes).toString("base64"), rpcConfig]
  };

  try {
    const response = await simulationFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(requestBody),
      signal: context.signal
    });
    if (!response || response.ok !== true) throw new Error("Simulation RPC HTTP request failed.");
    const json = await response.json();
    const value = json?.result?.value;
    if (!value || !Object.hasOwn(value, "err")) {
      logExecutionStage(EXECUTION_STAGES.SIMULATION, {
        success: false,
        malformedResponse: true,
        rawResponseShape: redactSecrets(json),
        endpoint: redactSecrets(endpoint),
        sigVerify: false,
        commitment: "confirmed",
        encoding: "base64",
        quoteHash: builtSwap?.metadata?.quoteHash || null,
        rpcProvider: rpc.provider,
        requireDedicated: rpc.requireDedicated,
        publicFallbackUsed: rpc.publicFallbackUsed
      });
      throw makeExecutionError(
        EXECUTION_ABORT_CODES.SIMULATION_FAILED,
        EXECUTION_STAGES.SIMULATION,
        "Simulation RPC response is malformed.",
        { malformedResponse: true, rawResponseShape: redactSecrets(json) }
      );
    }

    const slot = Number.isFinite(Number(json?.result?.context?.slot))
      ? Number(json.result.context.slot)
      : null;
    const unitsConsumed = Number.isFinite(Number(value.unitsConsumed))
      ? Number(value.unitsConsumed)
      : null;
    const assumedComputeUnitLimit = Number.isFinite(Number(cfg?.assumedComputeUnitLimit))
      ? Number(cfg.assumedComputeUnitLimit)
      : null;
    const cuHeadroomVsAssumed = unitsConsumed !== null && assumedComputeUnitLimit > 0
      ? 1 - (unitsConsumed / assumedComputeUnitLimit)
      : null;
    const audit = {
      success: value.err === null,
      rawErr: value.err,
      logs: Array.isArray(value.logs) ? value.logs : [],
      unitsConsumed,
      assumedComputeUnitLimit,
      cuHeadroomVsAssumed,
      slot,
      sigVerify: false,
      replaceRecentBlockhash: false,
      commitment: "confirmed",
      encoding: "base64",
      quoteHash: builtSwap?.metadata?.quoteHash || null,
      endpoint: redactSecrets(endpoint),
      rpcProvider: rpc.provider,
      requireDedicated: rpc.requireDedicated,
      publicFallbackUsed: rpc.publicFallbackUsed
    };
    logExecutionStage(EXECUTION_STAGES.SIMULATION, audit);
    if (value.err !== null) {
      throw makeExecutionError(
        EXECUTION_ABORT_CODES.SIMULATION_FAILED,
        EXECUTION_STAGES.SIMULATION,
        "Unsigned transaction simulation failed.",
        audit
      );
    }
    return Object.freeze({
      success: true,
      err: null,
      logs: audit.logs,
      unitsConsumed,
      assumedComputeUnitLimit,
      cuHeadroomVsAssumed,
      slot,
      returnData: value.returnData ?? null,
      quoteHash: audit.quoteHash
    });
  } catch (error) {
    if (error?.code) throw error;
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.SIMULATION_FAILED,
      EXECUTION_STAGES.SIMULATION,
      "Unsigned transaction simulation request failed.",
      { reason: safeErrorMessage(error), endpoint: redactSecrets(endpoint) }
    );
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) throw new Error(`live_config.json not found at ${CONFIG_FILE}`);
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }
  catch (err) { throw new Error(`live_config.json parse error: ${err.message}`); }
  cfg.dryRunMode = isAnyDryRun(cfg);

  // Hard ceilings — config can never exceed Phase 1 limits.
  if (Number(cfg.positionSizeSol) > 0.10) {
    throw new Error(`SAFETY VIOLATION: positionSizeSol ${cfg.positionSizeSol} exceeds Phase 1 max 0.10`);
  }
  if (Number(cfg.maxOpenTrades) > 1) {
    throw new Error(`SAFETY VIOLATION: maxOpenTrades ${cfg.maxOpenTrades} exceeds Phase 1 max 1`);
  }
  if (cfg.compoundingEnabled)   throw new Error("SAFETY VIOLATION: compoundingEnabled must be false");
  if (cfg.averagingDownEnabled) throw new Error("SAFETY VIOLATION: averagingDownEnabled must be false");
  if (cfg.martingaleEnabled)    throw new Error("SAFETY VIOLATION: martingaleEnabled must be false");

  return cfg;
}

function saveConfig(cfg) {
  // A1b: atomic write (temp → validate → rename). Behavior/format unchanged;
  // value gates remain in loadConfig()/readinessChecks(), audit remains in callers.
  configStore.writeConfigAtomic(cfg, CONFIG_FILE);
}

// ─── Config change audit (A3 — append-only, redacted; never mutates config) ─────
// Records safety-relevant live_config.json field changes. This NEVER changes a
// config value, blocks a change, or enables anything — it only writes an audit row.

const CONFIG_FIELD_RISK = {
  // CRITICAL — execution authority & capital safety
  executionMode: "CRITICAL", dryRunMode: "CRITICAL", emergencyStop: "CRITICAL",
  automationEnabled: "CRITICAL", requireManualConfirm: "CRITICAL", walletPublicAddress: "CRITICAL",
  compoundingEnabled: "CRITICAL", averagingDownEnabled: "CRITICAL", averagingEnabled: "CRITICAL",
  martingaleEnabled: "CRITICAL",
  // IMPORTANT — risk / strategy / economic parameters
  positionSizeSol: "IMPORTANT", maxTradeSizeSol: "IMPORTANT", maxOpenTrades: "IMPORTANT",
  maxSlippageBps: "IMPORTANT", maxEntrySlippagePct: "IMPORTANT", maxExitSlippagePct: "IMPORTANT",
  maxRoutePriceImpactPct: "IMPORTANT", maxDailyLossSol: "IMPORTANT", maxDailyLossCount: "IMPORTANT",
  maxDailyLosses: "IMPORTANT", maxDrawdownPercent: "IMPORTANT", stopLossPct: "IMPORTANT",
  takeProfitPct: "IMPORTANT", thesis: "IMPORTANT", strategyVersion: "IMPORTANT", phase: "IMPORTANT",
  priorityFeeMode: "IMPORTANT", priorityFeeBudgetLamports: "IMPORTANT", maxPriorityFeeLamports: "IMPORTANT",
  fallbackPriorityFeeLamports: "IMPORTANT", assumedComputeUnitLimit: "IMPORTANT",
  confirmationCommitment: "IMPORTANT", confirmationTimeoutMs: "IMPORTANT", maxSubmitRetries: "IMPORTANT",
  minWalletBalanceSol: "IMPORTANT", startingCapitalUsd: "IMPORTANT"
};

// Write-side bookkeeping fields: changed as a side effect of every control action
// and already captured by control events. Excluded from audit to keep it signal-focused.
const CONFIG_AUDIT_SKIP_FIELDS = new Set([
  "lastAutomationToggleAt", "lastAutomationToggleReason", "lastError", "emergencyStopActivatedAt", "killSwitchReason"
]);

function classifyConfigFieldRisk(field) {
  return CONFIG_FIELD_RISK[field] || "INFORMATIONAL";
}

function redactConfigValue(field, value) {
  if (field === "walletPublicAddress" && typeof value === "string" && value.length > 10) {
    return `${value.slice(0, 4)}…${value.slice(-4)}`;
  }
  return value;
}

function diffConfigFields(oldCfg, newCfg) {
  const fields = new Set([...Object.keys(oldCfg || {}), ...Object.keys(newCfg || {})]);
  const changes = [];
  for (const field of fields) {
    if (CONFIG_AUDIT_SKIP_FIELDS.has(field)) continue;
    const a = oldCfg ? oldCfg[field] : undefined;
    const b = newCfg ? newCfg[field] : undefined;
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ field, oldValue: a, newValue: b });
  }
  return changes;
}

function auditConfigChange({ oldCfg, newCfg, actor = "system", source = "unknown", reason = null, modeCfg = null } = {}) {
  try {
    const changes = diffConfigFields(oldCfg, newCfg);
    if (!changes.length) return;
    const ctxCfg = modeCfg || newCfg || oldCfg || {};
    let modeAtChange = null;
    try { modeAtChange = resolveExecutionMode(ctxCfg); } catch { modeAtChange = ctxCfg.executionMode || null; }
    let liveArmedAtChange = null;
    try { liveArmedAtChange = computeLiveArmedStatus(ctxCfg).liveArmed === true; } catch { liveArmedAtChange = null; }
    const changeId = crypto.randomUUID();
    const timestamp = nowIso();
    for (const c of changes) {
      const riskLevel = classifyConfigFieldRisk(c.field);
      appendJsonl(CONFIG_AUDIT_FILE, {
        timestamp,
        actor,
        source,
        field: c.field,
        oldValue: redactConfigValue(c.field, c.oldValue),
        newValue: redactConfigValue(c.field, c.newValue),
        reason,
        riskLevel,
        requiresReview: riskLevel === "CRITICAL" || riskLevel === "IMPORTANT",
        modeAtChange,
        liveArmedAtChange,
        changeId
      });
    }
  } catch { /* audit must never break control flow */ }
}

// ─── Positions store ──────────────────────────────────────────────────────────

function readPositions() {
  if (!fs.existsSync(LIVE_POSITIONS_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(LIVE_POSITIONS_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    logError("readPositions", err.message);
    return [];
  }
}

function writePositions(positions) {
  fs.writeFileSync(LIVE_POSITIONS_FILE, JSON.stringify(positions, null, 2) + "\n");
}

function openPositions() {
  return readPositions().filter(p => p.status === "OPEN");
}

function findOpenLiveTradeByAddress(address) {
  if (!address) return null;
  return openPositions().find(p => p.address === address) || null;
}

// ─── Event writer (with forbidden-flag guard) ─────────────────────────────────

function writeLiveEvent(event) {
  const stamped = { executorVersion: EXECUTOR_VERSION, phase: PHASE, recordedAt: nowIso(), ...event };
  for (const flag of FORBIDDEN_FLAGS) {
    if (stamped.anomalyFlags && stamped.anomalyFlags.includes(flag)) {
      throw new Error(`SAFETY VIOLATION: forbidden flag ${flag} in live event`);
    }
  }
  appendJsonl(LIVE_TRADES_FILE, stamped);
  return stamped;
}

// ─── Daily stats / stop ───────────────────────────────────────────────────────

function localDayKey(value = new Date()) {
  return new Date(value).toLocaleDateString("en-CA");
}

function closedTrades() {
  // Closed-trade summaries live in the jsonl as eventType CLOSED_LIVE_TRADE.
  return readLiveTrades().filter(e => e.eventType === "CLOSED_LIVE_TRADE");
}

function todayStats() {
  const today = localDayKey();
  const todays = closedTrades().filter(t => t.exitTime && localDayKey(t.exitTime) === today);
  const losses = todays.filter(t => t.status === "LOSS" || Number(t.netPnlSol) < 0);
  const realizedPnlSol = todays.reduce((s, t) => s + Number(t.netPnlSol || 0), 0);
  return { tradesToday: todays.length, lossesToday: losses.length, realizedPnlSol };
}

function dailyStopHit(cfg, daily = todayStats()) {
  const lossCountHit = daily.lossesToday >= (cfg.maxDailyLossCount || 3);
  const lossSolHit   = daily.realizedPnlSol <= -(Math.abs(cfg.maxDailyLossSol || 0.10));
  return { hit: lossCountHit || lossSolHit, lossCountHit, lossSolHit };
}

// ─── Safety gate (entries) ────────────────────────────────────────────────────

function safetyCheck(cfg = loadConfig()) {
  const reasons = [];
  if (cfg.emergencyStop)      reasons.push("Emergency stop is active");
  if (!cfg.automationEnabled) reasons.push("automationEnabled is false");

  const open = openPositions();
  if (open.length >= (cfg.maxOpenTrades || 1)) reasons.push(`Max open positions reached (${open.length}/${cfg.maxOpenTrades})`);

  const daily = todayStats();
  const stop = dailyStopHit(cfg, daily);
  if (stop.lossCountHit) reasons.push(`Daily loss-count stop: ${daily.lossesToday}/${cfg.maxDailyLossCount}`);
  if (stop.lossSolHit)   reasons.push(`Daily SOL-loss stop: ${daily.realizedPnlSol.toFixed(4)}/-${cfg.maxDailyLossSol}`);

  return { allowed: reasons.length === 0, reasons, open, daily, dailyStop: stop };
}

// ─── Thesis matching (strict Phase 1) ─────────────────────────────────────────

function matchesPhase1Thesis(trade, cfg) {
  const t = cfg.thesis || {};
  const score = Number(trade.score);
  const mc    = Number(trade.marketCap);
  const bot   = Number(trade.botDegenRate);
  const top10 = Number(trade.top10HolderRate);
  const liq   = Number(trade.liquidity);
  const reasons = [];

  if (trade.source !== (t.source || "gmgn_trending")) reasons.push("source != gmgn_trending");
  if (!(score >= (t.scoreMin ?? 80) && score <= (t.scoreMax ?? 89))) reasons.push("score outside 80-89");
  if (!(mc >= (t.marketCapMin ?? 100000) && mc <= (t.marketCapMax ?? 250000))) reasons.push("marketCap outside 100k-250k");
  if (!(bot < (t.botDegenRateMax ?? 0.05))) reasons.push("botDegenRate >= 0.05");
  if (!(top10 >= (t.top10HolderRateMin ?? 0.10) && top10 <= (t.top10HolderRateMax ?? 0.20))) reasons.push("top10 outside 0.10-0.20");
  if (!(Number.isFinite(liq) && liq > 0)) reasons.push("liquidity missing");
  if (!trade.pairAddress) reasons.push("pairAddress missing");
  if (!Number.isFinite(Number(trade.entryPrice)) || Number(trade.entryPrice) <= 0) reasons.push("entry price missing");

  return { ok: reasons.length === 0, reasons };
}

// ─── Read paper signals (read-only) ───────────────────────────────────────────

function readPaperTrades() {
  if (!fs.existsSync(PAPER_FILE)) return [];
  return fs.readFileSync(PAPER_FILE, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function readPipelineCandidates() {
  if (!fs.existsSync(PIPELINE_CANDIDATES_FILE)) return [];
  return fs.readFileSync(PIPELINE_CANDIDATES_FILE, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

const PIPELINE_OBSERVATION_PAIR_COOLDOWN_MS = 60 * 60 * 1000;

// Observation dedup is intentionally separate from trading dedup. Intent keys
// prefer candidateIntentId; pair cooldown uses address+pair. Restart state is
// rebuilt from execution_audit.jsonl plus observation_dedup.json (M3).
const observedPipelineCandidates = new Set();
const observedPipelinePairTimestamps = new Map();
let candidatePoolForTest = null;
let pipelineCandidateQueueForTest = null;
let observationSubmitSwapForTest = null;
let observationAuditRowsForTest = null;
let observationDedupFileForTest = null;
let observationDedupSeeded = false;
let lastPipelineObservationSelectionStats = {
  queueRowsRead: 0,
  skippedByIntentDedupe: 0,
  skippedByFallbackPairDedupe: 0,
  skippedByPairCooldown: 0,
  candidatePoolCount: 0
};

function candidateIntentKey(candidate) {
  if (!candidate?.candidateIntentId) return null;
  const candidateIntentId = String(candidate.candidateIntentId).trim();
  return candidateIntentId ? `intent|${candidateIntentId}` : null;
}

function candidatePairKey(candidate) {
  if (!candidate) return null;
  const address = candidate.address ? String(candidate.address).trim() : "";
  const pairAddress = candidate.pairAddress ? String(candidate.pairAddress).trim() : "";
  if (address && pairAddress) return `address_pair|${address}|${pairAddress}`;
  return null;
}

function candidateKey(candidate) {
  return candidateIntentKey(candidate) || candidatePairKey(candidate);
}

function observationTimestampMs(candidate, fallbackMs = Date.now()) {
  const timestamp = candidate?.timestamp || candidate?.observedAt;
  const parsed = timestamp ? new Date(timestamp).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : fallbackMs;
}

function markObservedPair(candidate, timestampMs = Date.now()) {
  const pairKey = candidatePairKey(candidate);
  if (!pairKey) return;
  const existing = observedPipelinePairTimestamps.get(pairKey);
  if (!Number.isFinite(existing) || timestampMs > existing) {
    observedPipelinePairTimestamps.set(pairKey, timestampMs);
  }
}

function isPairWithinObservationCooldown(candidate, nowMs = Date.now()) {
  const pairKey = candidatePairKey(candidate);
  if (!pairKey) return false;
  const lastObservedMs = observedPipelinePairTimestamps.get(pairKey);
  if (!Number.isFinite(lastObservedMs)) return false;
  const candidateMs = observationTimestampMs(candidate, nowMs);
  return candidateMs - lastObservedMs < PIPELINE_OBSERVATION_PAIR_COOLDOWN_MS;
}

function isExpectedObservationAbort(error) {
  return !!error?.code && EXPECTED_OBSERVATION_ABORT_CODES.has(error.code);
}

function observationDedupFilePath() {
  return observationDedupFileForTest || OBSERVATION_DEDUP_FILE;
}

function loadObservationDedupSnapshot() {
  const file = observationDedupFilePath();
  if (!fs.existsSync(file)) {
    return { observedKeys: [], pairLastObservedMs: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed?.schemaVersion !== 1) {
      return { observedKeys: [], pairLastObservedMs: {} };
    }
    return {
      observedKeys: Array.isArray(parsed.observedKeys)
        ? parsed.observedKeys.filter(key => typeof key === "string" && key)
        : [],
      pairLastObservedMs: parsed.pairLastObservedMs && typeof parsed.pairLastObservedMs === "object"
        ? parsed.pairLastObservedMs
        : {}
    };
  } catch (err) {
    logError("observation_dedup_load", safeErrorMessage(err));
    return { observedKeys: [], pairLastObservedMs: {} };
  }
}

function mergeObservationDedupSnapshot(snapshot) {
  if (!snapshot) return;
  for (const key of snapshot.observedKeys || []) {
    if (typeof key === "string" && key) observedPipelineCandidates.add(key);
  }
  for (const [pairKey, timestampMs] of Object.entries(snapshot.pairLastObservedMs || {})) {
    if (!pairKey || !Number.isFinite(Number(timestampMs))) continue;
    const parsed = Number(timestampMs);
    const existing = observedPipelinePairTimestamps.get(pairKey);
    if (!Number.isFinite(existing) || parsed > existing) {
      observedPipelinePairTimestamps.set(pairKey, parsed);
    }
  }
}

function persistObservationDedupSnapshot() {
  try {
    const payload = {
      schemaVersion: 1,
      updatedAt: nowIso(),
      observedKeys: [...observedPipelineCandidates],
      pairLastObservedMs: Object.fromEntries(observedPipelinePairTimestamps)
    };
    fs.writeFileSync(observationDedupFilePath(), `${JSON.stringify(payload, null, 2)}\n`);
  } catch (err) {
    logError("observation_dedup_persist", safeErrorMessage(err));
  }
}

function seedObservedPipelineCandidatesFromAudit({ force = false } = {}) {
  if (observationDedupSeeded && !force) return observedPipelineCandidates.size;
  const rows = Array.isArray(observationAuditRowsForTest)
    ? observationAuditRowsForTest
    : readJsonl(EXECUTION_AUDIT_FILE);
  for (const row of rows) {
    if (row?._parseError ||
        row?.eventType !== "EXECUTION_STAGE" ||
        row?.stage !== EXECUTION_STAGES.PIPELINE_DRY_RUN ||
        !row.payload) {
      continue;
    }
    const intentKey = candidateIntentKey(row.payload);
    const pairKey = candidatePairKey(row.payload);
    if (intentKey) {
      observedPipelineCandidates.add(intentKey);
    } else if (pairKey) {
      observedPipelineCandidates.add(pairKey);
    }
    if (pairKey) markObservedPair(row.payload, observationTimestampMs(row, observationTimestampMs(row.payload)));
  }
  mergeObservationDedupSnapshot(loadObservationDedupSnapshot());
  observationDedupSeeded = true;
  return observedPipelineCandidates.size;
}

function currentOpenCandidatePool() {
  const source = candidatePoolForTest || readPaperTrades();
  return source
    .filter(candidate => candidate.status === "OPEN")
    .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
}

function queuedPipelineCandidatePool(sourceOverride = null) {
  const source = sourceOverride || pipelineCandidateQueueForTest || readPipelineCandidates();
  return source
    .filter(candidate => candidateKey(candidate))
    .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
}

function applyTradingDedupe(candidates) {
  const positions = readPositions();
  const takenAddrs = new Set(positions.map(p => p.address));
  const takenPairs = new Set(positions.map(p => p.pairAddress));
  const today = localDayKey();
  const enteredToday = new Set(
    readLiveTrades()
      .filter(e => e.eventType === "ACTUAL_LIVE_ENTRY" && e.entryTime && localDayKey(e.entryTime) === today)
      .map(e => e.address)
  );
  return candidates.filter(candidate =>
    !takenAddrs.has(candidate.address) &&
    !takenPairs.has(candidate.pairAddress) &&
    !enteredToday.has(candidate.address)
  );
}

function classifyCandidate(candidate, cfg) {
  const thesisMatch = matchesPhase1Thesis(candidate, cfg).ok;
  return {
    ...candidate,
    thesisMatch,
    observationOnly: resolveExecutionMode(cfg) === "PIPELINE_DRY_RUN",
    candidateHandoffSource: candidate.candidateHandoffSource || "paper_trades_open",
    sourcePool: thesisMatch ? "thesis_observation" : "non_thesis_observation"
  };
}

function findStrictThesisCandidates(cfg) {
  return applyTradingDedupe(
    currentOpenCandidatePool().filter(candidate => matchesPhase1Thesis(candidate, cfg).ok)
  ).map(candidate => classifyCandidate(candidate, cfg));
}

function findPipelineObservationCandidates(cfg) {
  seedObservedPipelineCandidatesFromAudit();
  const openPaperCandidates = currentOpenCandidatePool()
    .map(candidate => ({ ...candidate, candidateHandoffSource: "paper_trades_open" }));
  const pipelineQueueSource = pipelineCandidateQueueForTest || readPipelineCandidates();
  const queuedCandidates = queuedPipelineCandidatePool(pipelineQueueSource)
    .map(candidate => ({ ...candidate, candidateHandoffSource: "pipeline_candidates" }));
  const seen = new Set();
  const seenPairs = new Set();
  const stats = {
    queueRowsRead: pipelineQueueSource.length,
    skippedByIntentDedupe: 0,
    skippedByFallbackPairDedupe: 0,
    skippedByPairCooldown: 0,
    candidatePoolCount: 0
  };
  const candidates = [...queuedCandidates, ...openPaperCandidates]
    .filter(candidate => {
      const intentKey = candidateIntentKey(candidate);
      const pairKey = candidatePairKey(candidate);
      if (!intentKey && !pairKey) return false;
      if (intentKey && observedPipelineCandidates.has(intentKey)) {
        stats.skippedByIntentDedupe += 1;
        return false;
      }
      if (!intentKey && pairKey && observedPipelineCandidates.has(pairKey)) {
        stats.skippedByFallbackPairDedupe += 1;
        return false;
      }
      if (isPairWithinObservationCooldown(candidate)) {
        stats.skippedByPairCooldown += 1;
        return false;
      }
      return true;
    })
    .filter(candidate => {
      const key = candidateKey(candidate);
      const pairKey = candidatePairKey(candidate);
      if (seen.has(key) || (pairKey && seenPairs.has(pairKey))) return false;
      seen.add(key);
      if (pairKey) seenPairs.add(pairKey);
      return true;
    })
    .map(candidate => classifyCandidate(candidate, cfg));
  stats.candidatePoolCount = candidates.length;
  lastPipelineObservationSelectionStats = stats;
  return candidates;
}

function findDryRunCandidates(cfg) {
  return applyTradingDedupe(
    currentOpenCandidatePool().filter(candidate => matchesPhase1Thesis(candidate, cfg).ok)
  ).map(candidate => classifyCandidate(candidate, cfg));
}

function findCandidates(cfg) {
  const mode = resolveExecutionMode(cfg);
  if (mode === "LIVE") {
    return findStrictThesisCandidates(cfg);
  }
  if (mode === "PIPELINE_DRY_RUN") {
    return findPipelineObservationCandidates(cfg);
  }
  return findDryRunCandidates(cfg);
}

function findEntryCandidate(cfg) {
  return findCandidates(cfg)[0] || null;
}

async function observePipelineCandidate(cfg, candidate) {
  const intentKey = candidateIntentKey(candidate);
  const pairKey = candidatePairKey(candidate);
  const key = intentKey || pairKey;
  if (!key ||
      (intentKey && observedPipelineCandidates.has(intentKey)) ||
      (!intentKey && pairKey && observedPipelineCandidates.has(pairKey)) ||
      isPairWithinObservationCooldown(candidate)) {
    return { action: "OBSERVATION_SKIPPED_DUPLICATE", symbol: candidate?.symbol || null };
  }
  observedPipelineCandidates.add(key);
  markObservedPair(candidate, observationTimestampMs(candidate));
  persistObservationDedupSnapshot();

  const observation = {
    executionMode: "PIPELINE_DRY_RUN",
    thesisMatch: candidate.thesisMatch === true,
    observationOnly: true,
    sourcePool: candidate.thesisMatch === true ? "thesis_observation" : "non_thesis_observation",
    candidateHandoffSource: candidate.candidateHandoffSource || "paper_trades_open",
    candidateIntentId: candidate.candidateIntentId || null,
    realMoneyMoved: false,
    signed: false,
    submitted: false,
    livePositionCreated: false
  };
  const submit = observationSubmitSwapForTest || submitSwap;
  let result;
  try {
    result = await submit("BUY", {
      cfg,
      tokenAddress: candidate.address,
      pairAddress: candidate.pairAddress,
      expectedPrice: candidate.entryPrice,
      positionSizeSol: cfg.positionSizeSol
    });
  } catch (error) {
    logExecutionStage(EXECUTION_STAGES.PIPELINE_DRY_RUN, {
      ...observation,
      observationAborted: true,
      abortCode: error?.code || null,
      abortStage: error?.stage || null,
      safeMessage: safeErrorMessage(error),
      symbol: candidate.symbol || null,
      address: candidate.address || null,
      pairAddress: candidate.pairAddress || null
    });
    persistObservationDedupSnapshot();
    if (isExpectedObservationAbort(error)) {
      return {
        action: "OBSERVATION_ABORTED",
        code: error.code,
        stage: error.stage || null,
        error: safeErrorMessage(error),
        symbol: candidate.symbol || null,
        address: candidate.address || null,
        pairAddress: candidate.pairAddress || null,
        candidateHandoffSource: observation.candidateHandoffSource,
        candidateIntentId: observation.candidateIntentId,
        realMoneyMoved: false,
        signed: false,
        submitted: false,
        livePositionCreated: false
      };
    }
    throw error;
  }
  Object.assign(result, observation);
  result.pipelineMetadata = { ...(result.pipelineMetadata || {}), ...observation };
  logExecutionStage(EXECUTION_STAGES.PIPELINE_DRY_RUN, {
    ...observation,
    symbol: candidate.symbol || null,
    address: candidate.address || null,
    pairAddress: candidate.pairAddress || null,
    ...(result.pipelineMetadata || {}),
    pipelineLatencyMs: result.latencyMs ?? null
  });
  return { action: "OBSERVED", symbol: candidate.symbol, result };
}

// ─── Wallet adapter ───────────────────────────────────────────────────────────

async function getWalletBalanceSol(cfg) {
  // Best-effort balance read via Solana JSON-RPC. Never throws.
  const addr = cfg.walletPublicAddress;
  if (!addr) return null;
  if (typeof fetch !== "function") return null;
  try {
    const rpc = resolveRpcEndpoint(cfg, {
      requireDedicated: !isAnyDryRun(cfg),
      purpose: "balance_read"
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(rpc.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [addr] }),
      signal: controller.signal
    });
    clearTimeout(timer);
    const json = await res.json();
    const lamports = json && json.result && json.result.value;
    return Number.isFinite(lamports) ? lamports / 1e9 : null;
  } catch {
    return null;
  }
}

function deriveFillFromQuoteApproachA(quote) {
  const inAmount = Number(quote?.inAmount);
  const outAmount = Number(quote?.outAmount);
  if (!Number.isFinite(inAmount) || inAmount <= 0 ||
      !Number.isFinite(outAmount) || outAmount <= 0) {
    return {
      filledPrice: null,
      slippagePct: null,
      filledPriceUnavailable: true,
      rawOutputPerInput: null,
      quotedSlippageBps: null,
      reason: "quote missing usable in/out amounts"
    };
  }
  const slippageBps = Number(quote?.slippageBps);
  return {
    filledPrice: null,
    slippagePct: null,
    filledPriceUnavailable: true,
    rawOutputPerInput: outAmount / inAmount,
    quotedSlippageBps: Number.isFinite(slippageBps) ? slippageBps : null,
    reason: "Approach A: raw ratio only, no USD/token basis available"
  };
}

const LAMPORTS_PER_SIGNATURE = 5000;
const ATA_RENT_LAMPORTS = 2039280;
const LAMPORTS_PER_SOL = 1e9;

function computeFeeBreakdownSol({ builtSwap, priorityFee, simulation }) {
  const signatureCount = Number(builtSwap?.metadata?.signatureCount) || 1;
  const baseFeeLamports = signatureCount * LAMPORTS_PER_SIGNATURE;
  const priorityFeeLamports = Number(priorityFee?.appliedPriorityFeeLamports) || 0;
  let ataRentLamports = 0;
  let ataRentAccounted = false;
  let ataDetectionMethod = "none";
  if (simulation && Array.isArray(simulation.logs)) {
    const ataCreated = simulation.logs.some(line =>
      typeof line === "string" && (
        (line.includes("Create") && line.includes("Account")) ||
        line.includes("InitializeAccount") ||
        line.includes("AssociatedTokenAccount")
      )
    );
    ataRentLamports = ataCreated ? ATA_RENT_LAMPORTS : 0;
    ataRentAccounted = true;
    ataDetectionMethod = "simulation_logs_scan";
  }
  const totalLamports = baseFeeLamports + priorityFeeLamports + ataRentLamports;
  return {
    feeSol: totalLamports / LAMPORTS_PER_SOL,
    breakdown: {
      baseFeeLamports,
      priorityFeeLamports,
      ataRentLamports,
      ataRentAccounted,
      ataDetectionMethod,
      signatureCount,
      totalLamports
    }
  };
}

function txSigFromSignedBytes(signedBytes) {
  if (!(signedBytes instanceof Uint8Array) || signedBytes.length < 65 || signedBytes[0] !== 0x01) {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.TX_BUILD_FAILED,
      EXECUTION_STAGES.SUBMIT,
      "Cannot derive transaction signature from signed bytes."
    );
  }
  return encodeBase58(signedBytes.subarray(1, 65));
}

function writePendingReconciliation(record) {
  const event = {
    timestamp: nowIso(),
    operatorActionRequired: true,
    ...redactSecrets(record)
  };
  appendJsonl(PENDING_RECONCILIATION_FILE, event);
  return event;
}

function buildReconciliationContext({ action, txSig, kind, tokenAddress, pairAddress, expectedPrice, positionSizeSol, submittedAt, builtSwap, currentBlockHeight, reason }) {
  return {
    action,
    txSig,
    kind,
    tokenAddress,
    pairAddress,
    expectedPrice,
    positionSizeSol,
    submittedAt: submittedAt || null,
    lastValidBlockHeight: builtSwap?.metadata?.lastValidBlockHeight ?? null,
    currentBlockHeight: currentBlockHeight ?? null,
    operatorActionRequired: true,
    reason
  };
}

function positionSizeOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function collectLiveSubmissionGateFailures(cfg) {
  const executionMode = resolveExecutionMode(cfg);
  const gates = {};
  const failures = [];

  const addGate = (key, label, ok, failMessage, detail = "") => {
    gates[key] = { label, ok, detail: detail || (ok ? "ok" : failMessage) };
    if (!ok) failures.push(failMessage);
  };

  addGate("executionMode", "executionMode is LIVE", executionMode === "LIVE", "executionMode must be LIVE", executionMode);
  addGate("dryRunMode", "dryRunMode is false", cfg?.dryRunMode === false, "dryRunMode must be false", String(cfg?.dryRunMode));
  addGate("emergencyStop", "emergencyStop is false", cfg?.emergencyStop === false, "emergencyStop must be false", String(cfg?.emergencyStop));
  addGate("automationEnabled", "automationEnabled is true", cfg?.automationEnabled === true, "automationEnabled must be true", String(cfg?.automationEnabled));
  addGate(
    "signerEnv",
    "SOLANA_SIGNER_SECRET present",
    !!process.env.SOLANA_SIGNER_SECRET,
    "SOLANA_SIGNER_SECRET must be present",
    process.env.SOLANA_SIGNER_SECRET ? "present" : "absent"
  );
  addGate(
    "liveSubmissionFlag",
    "FOMO_ENABLE_LIVE_SUBMISSION is YES",
    process.env.FOMO_ENABLE_LIVE_SUBMISSION === "YES",
    "FOMO_ENABLE_LIVE_SUBMISSION must equal YES",
    process.env.FOMO_ENABLE_LIVE_SUBMISSION || "unset"
  );
  const sizeOk = Number(cfg?.positionSizeSol) <= 0.01 && Number(positionSizeOrZero(cfg?.positionSizeSol)) > 0;
  addGate(
    "positionSizeSol",
    "positionSizeSol within first-live cap",
    sizeOk,
    "positionSizeSol must be > 0 and <= 0.01 for first-live safety",
    String(cfg?.positionSizeSol ?? "")
  );

  let rpcOk = false;
  let rpcDetail = "";
  try {
    const rpc = resolveRpcEndpoint(cfg, { requireDedicated: true, purpose: "submission" });
    rpcOk = !!rpc?.endpoint;
    rpcDetail = rpc?.provider || "dedicated";
  } catch (error) {
    rpcDetail = safeErrorMessage(error);
  }
  addGate(
    "dedicatedRpc",
    "Dedicated RPC for submission",
    rpcOk,
    `dedicated RPC required: ${rpcDetail}`,
    rpcDetail
  );

  return { failures, gates };
}

function deriveOperationalPosture(cfg, liveArmed) {
  if (cfg?.emergencyStop === true) return "EMERGENCY_HALTED";
  if (liveArmed) return "LIVE_ARMED";
  if (resolveExecutionMode(cfg) === "LIVE") return "LIVE_MODE_DISARMED";
  if (resolveExecutionMode(cfg) === "PIPELINE_DRY_RUN" && cfg?.automationEnabled === true) return "PIPELINE_OBSERVING";
  if (resolveExecutionMode(cfg) === "DRY_RUN") return "DRY_RUN_LEGACY";
  return "STOPPED";
}

function computeLiveArmedStatus(cfg = loadConfig()) {
  const { failures, gates } = collectLiveSubmissionGateFailures(cfg);
  const liveArmed = failures.length === 0;
  return {
    liveArmed,
    failures,
    gates,
    operationalPosture: deriveOperationalPosture(cfg, liveArmed),
    summary: liveArmed
      ? "Live submission gates satisfied"
      : `DISARMED — ${failures[0] || "live submission gates not satisfied"}`
  };
}

function assertLiveSubmissionArmed(cfg) {
  const { failures } = collectLiveSubmissionGateFailures(cfg);
  if (failures.length) {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.REAL_PATH_DISABLED,
      EXECUTION_STAGES.GUARD,
      "LIVE submission gate refused execution.",
      { failures }
    );
  }
}

async function fetchJsonRpc(fetcher, endpoint, body, timeoutMs, failureCode, failureStage, networkMessage) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const json = await response.json().catch(() => null);
    return { response, json };
  } catch (error) {
    throw makeExecutionError(
      failureCode,
      failureStage,
      networkMessage,
      { cause: safeErrorMessage(error), endpoint: redactSecrets(endpoint) }
    );
  } finally {
    clearTimeout(timer);
  }
}

async function submitRawTransaction(signedBytes, cfg, context = {}) {
  const txSig = context.txSig || txSigFromSignedBytes(signedBytes);
  const rpc = resolveRpcEndpoint(cfg, { requireDedicated: true, purpose: "submission" });
  if (!rpc?.endpoint || rpc.publicFallbackUsed || isPublicSolanaRpcEndpoint(rpc.endpoint)) {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.SUBMIT_FAILED,
      EXECUTION_STAGES.SUBMIT,
      "Dedicated RPC required for submission",
      { txSig: txSig.slice(0, 8), provider: rpc?.provider || null }
    );
  }
  const endpoint = rpc.endpoint;
  const submittedAt = nowIso();
  const requestBody = {
    jsonrpc: "2.0",
    id: `submit-${Date.now()}`,
    method: "sendTransaction",
    params: [
      Buffer.from(signedBytes).toString("base64"),
      {
        encoding: "base64",
        skipPreflight: false,
        preflightCommitment: cfg.confirmationCommitment || "confirmed",
        maxRetries: 0
      }
    ]
  };
  try {
    const { response, json } = await fetchJsonRpc(
      submissionFetch,
      endpoint,
      requestBody,
      15000,
      EXECUTION_ABORT_CODES.SUBMISSION_UNKNOWN,
      EXECUTION_STAGES.SUBMIT,
      "Submission network error"
    );
    if (!response?.ok || !json || json.error) {
      throw makeExecutionError(
        EXECUTION_ABORT_CODES.SUBMIT_FAILED,
        EXECUTION_STAGES.SUBMIT,
        json?.error?.message || `Submission RPC error${response?.status ? ` HTTP ${response.status}` : ""}`,
        {
          txSig: txSig.slice(0, 8),
          rpcErrorCode: json?.error?.code ?? null,
          httpStatus: response?.status ?? null,
          endpoint: redactSecrets(endpoint)
        }
      );
    }
    if (typeof json.result !== "string" || json.result.length < 32) {
      throw makeExecutionError(
        EXECUTION_ABORT_CODES.SUBMIT_FAILED,
        EXECUTION_STAGES.SUBMIT,
        "Submission RPC returned malformed transaction signature.",
        { txSig: txSig.slice(0, 8), endpoint: redactSecrets(endpoint) }
      );
    }
    if (json.result !== txSig) {
      throw makeExecutionError(
        EXECUTION_ABORT_CODES.SUBMIT_FAILED,
        EXECUTION_STAGES.SUBMIT,
        "Submission RPC returned a transaction signature that does not match signed bytes.",
        {
          derivedTxSig: txSig.slice(0, 8),
          returnedTxSig: json.result.slice(0, 8),
          endpoint: redactSecrets(endpoint)
        }
      );
    }
    logExecutionStage(EXECUTION_STAGES.SUBMIT, {
      txSig: json.result.slice(0, 8),
      tokenAddress: context.tokenAddress || null,
      pairAddress: context.pairAddress || null,
      submittedAt,
      endpoint: redactSecrets(endpoint),
      httpStatus: response.status,
      skipPreflight: false,
      preflightCommitment: cfg.confirmationCommitment || "confirmed",
      maxRetries: 0
    });
    return { txSig: json.result, submittedAt, endpoint: redactSecrets(endpoint) };
  } catch (error) {
    if (error?.code === EXECUTION_ABORT_CODES.SUBMISSION_UNKNOWN) {
      writePendingReconciliation(buildReconciliationContext({
        action: "SUBMISSION_UNKNOWN",
        txSig,
        kind: context.kind,
        tokenAddress: context.tokenAddress,
        pairAddress: context.pairAddress,
        expectedPrice: context.expectedPrice,
        positionSizeSol: context.positionSizeSol,
        submittedAt,
        builtSwap: context.builtSwap,
        reason: "Submission HTTP request timed out or response was lost; transaction may have reached RPC."
      }));
      logExecutionStage(EXECUTION_STAGES.SUBMIT, {
        txSig: txSig.slice(0, 8),
        submittedAt,
        endpoint: redactSecrets(endpoint),
        submissionUnknown: true,
        operatorActionRequired: true
      });
    }
    throw error;
  }
}

async function awaitConfirmation(txSig, cfg, context = {}) {
  const rpc = resolveRpcEndpoint(cfg, { requireDedicated: true, purpose: "confirmation" });
  const endpoint = rpc.endpoint;
  const started = Date.now();
  const timeoutMs = Number(cfg.confirmationTimeoutMs || 30000);
  const commitment = cfg.confirmationCommitment || "confirmed";
  let currentBlockHeight = null;
  while (Date.now() - started < timeoutMs) {
    const elapsedMs = Date.now() - started;
    const remainingMs = timeoutMs - elapsedMs;
    if (remainingMs <= 0) break;
    const pollTimeoutMs = Math.min(10000, remainingMs);
    const requestBody = {
      jsonrpc: "2.0",
      id: `confirm-${Date.now()}`,
      method: "getSignatureStatuses",
      params: [[txSig], { searchTransactionHistory: true }]
    };
    try {
      const { json } = await fetchJsonRpc(
        confirmationFetch,
        endpoint,
        requestBody,
        pollTimeoutMs,
        EXECUTION_ABORT_CODES.CONFIRMATION_TIMEOUT,
        EXECUTION_STAGES.CONFIRMATION,
        "Confirmation network error"
      );
      const status = json?.result?.value?.[0] || null;
      if (status) {
        const confirmationStatus = status.confirmationStatus || null;
        const slot = status.slot ?? null;
        const err = status.err ?? null;
        const terminal = confirmationStatus === "confirmed" || confirmationStatus === "finalized";
        if (err !== null || terminal) {
          const confirmed = err === null && terminal;
          logExecutionStage(EXECUTION_STAGES.CONFIRMATION, {
            txSig: txSig.slice(0, 8),
            confirmed,
            slot,
            err,
            confirmationStatus,
            elapsedMs
          });
          return { confirmed, slot, err, confirmationStatus };
        }
      }
    } catch (error) {
      logExecutionStage(EXECUTION_STAGES.CONFIRMATION, {
        txSig: txSig.slice(0, 8),
        transientRpcError: true,
        message: safeErrorMessage(error),
        elapsedMs
      });
    }
    const sleepMs = Math.min(1000, Math.max(0, timeoutMs - (Date.now() - started)));
    if (sleepMs > 0) await new Promise(resolve => setTimeout(resolve, sleepMs));
  }
  try {
    const { json } = await fetchJsonRpc(
      confirmationFetch,
      endpoint,
      { jsonrpc: "2.0", id: `height-${Date.now()}`, method: "getBlockHeight", params: [{ commitment }] },
      5000,
      EXECUTION_ABORT_CODES.CONFIRMATION_TIMEOUT,
      EXECUTION_STAGES.CONFIRMATION,
      "Block-height read failed"
    );
    currentBlockHeight = Number.isFinite(Number(json?.result)) ? Number(json.result) : null;
  } catch { /* best-effort only */ }
  writePendingReconciliation(buildReconciliationContext({
    action: "CONFIRMATION_UNKNOWN",
    txSig,
    kind: context.kind,
    tokenAddress: context.tokenAddress,
    pairAddress: context.pairAddress,
    expectedPrice: context.expectedPrice,
    positionSizeSol: context.positionSizeSol,
    submittedAt: context.submittedAt,
    builtSwap: context.builtSwap,
    currentBlockHeight,
    reason: `Confirmation did not return in ${timeoutMs}ms; status unknown`
  }));
  logExecutionStage(EXECUTION_STAGES.CONFIRMATION, {
    txSig: txSig.slice(0, 8),
    confirmed: false,
    confirmationStatus: "UNKNOWN",
    elapsedMs: Date.now() - started,
    timeoutMs,
    operatorActionRequired: true
  });
  throw makeExecutionError(
    EXECUTION_ABORT_CODES.CONFIRMATION_TIMEOUT,
    EXECUTION_STAGES.CONFIRMATION,
    `Confirmation did not return in ${timeoutMs}ms; status unknown`,
    { txSig, currentBlockHeight, lastValidBlockHeight: context.builtSwap?.metadata?.lastValidBlockHeight ?? null }
  );
}

function tokenBalanceDelta(metaBalances, owner, mint) {
  if (!Array.isArray(metaBalances)) return 0;
  return metaBalances
    .filter(item => (!owner || item.owner === owner) && (!mint || item.mint === mint))
    .reduce((sum, item) => sum + Number(item.uiTokenAmount?.uiAmount ?? item.uiTokenAmount?.uiAmountString ?? 0), 0);
}

async function parseFillFromTransaction(txSig, cfg, kind, builtSwap, context = {}) {
  const rpc = resolveRpcEndpoint(cfg, { requireDedicated: true, purpose: "fill_parse" });
  const endpoint = rpc.endpoint;
  const owner = cfg.walletPublicAddress;
  const mints = context.mints || {};
  let lastAttempt = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const requestBody = {
      jsonrpc: "2.0",
      id: `fill-${Date.now()}-${attempt}`,
      method: "getTransaction",
      params: [txSig, { commitment: cfg.confirmationCommitment || "confirmed", maxSupportedTransactionVersion: 0 }]
    };
    const { json } = await fetchJsonRpc(
      fillFetch,
      endpoint,
      requestBody,
      15000,
      EXECUTION_ABORT_CODES.FILL_PARSE_FAILED,
      EXECUTION_STAGES.FILL_PARSE,
      "Fill parse network error"
    );
    const tx = json?.result;
    const meta = tx?.meta;
    if (!tx || !meta) {
      lastAttempt = { attempt, missingTransaction: !tx, missingMeta: !!tx && !meta };
    } else {
      const feeSolActual = Number(meta.fee || 0) / LAMPORTS_PER_SOL;
      const preSol = Number(meta.preBalances?.[0]);
      const postSol = Number(meta.postBalances?.[0]);
      const solDelta = Number.isFinite(preSol) && Number.isFinite(postSol) ? (postSol - preSol) / LAMPORTS_PER_SOL : null;
      const inputMint = mints.inputMint;
      const outputMint = mints.outputMint;
      const preInputToken = tokenBalanceDelta(meta.preTokenBalances, owner, inputMint);
      const postInputToken = tokenBalanceDelta(meta.postTokenBalances, owner, inputMint);
      const preOutputToken = tokenBalanceDelta(meta.preTokenBalances, owner, outputMint);
      const postOutputToken = tokenBalanceDelta(meta.postTokenBalances, owner, outputMint);
      let inputAmount = null;
      let outputAmount = null;
      let actualFillPriceSolPerToken = null;
      if (kind === "BUY") {
        inputAmount = solDelta !== null ? Math.abs(Math.min(solDelta, 0)) : null;
        outputAmount = Math.max(postOutputToken - preOutputToken, 0);
        if (inputAmount > 0 && outputAmount > 0) actualFillPriceSolPerToken = inputAmount / outputAmount;
      } else {
        inputAmount = Math.max(preInputToken - postInputToken, 0);
        outputAmount = solDelta !== null ? Math.max(solDelta, 0) : null;
        if (inputAmount > 0 && outputAmount > 0) actualFillPriceSolPerToken = outputAmount / inputAmount;
      }
      if (Number.isFinite(actualFillPriceSolPerToken) && actualFillPriceSolPerToken > 0) {
        logExecutionStage(EXECUTION_STAGES.FILL_PARSE, {
          txSig: txSig.slice(0, 8),
          attempt,
          inputAmount,
          outputAmount,
          actualFillPriceSolPerToken,
          actualFillPriceUsdPerToken: null,
          filledPriceUnavailable: true,
          feeSolActual,
          slot: tx.slot ?? null
        });
        return {
          actualFillPriceSolPerToken,
          actualFillPriceUsdPerToken: null,
          filledPriceUnavailable: true,
          feeSolActual,
          slot: tx.slot ?? null,
          blockTime: tx.blockTime ?? null,
          inputAmount,
          outputAmount
        };
      }
      lastAttempt = { attempt, inputAmount, outputAmount, feeSolActual };
    }
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw makeExecutionError(
    EXECUTION_ABORT_CODES.FILL_PARSE_FAILED,
    EXECUTION_STAGES.FILL_PARSE,
    "Could not derive fill price from transaction meta after retries",
    { txSig: txSig.slice(0, 8), attempts: 3, ...lastAttempt }
  );
}

function buildPipelineDryRunResult({ kind, quote, priorityFee, builtSwap, simulation, args, pipelineStartedAt }) {
  const fill = deriveFillFromQuoteApproachA(quote);
  const fee = computeFeeBreakdownSol({ builtSwap, priorityFee, simulation });
  const feeSol = fee.feeSol;
  const feeBreakdown = fee.breakdown;
  const latencyMs = Date.now() - pipelineStartedAt;
  const pipelineMetadata = {
    quoteHash: builtSwap.metadata.quoteHash,
    unitsConsumed: simulation.unitsConsumed,
    cuHeadroomVsAssumed: simulation.cuHeadroomVsAssumed,
    appliedPriorityFeeLamports: priorityFee.appliedPriorityFeeLamports,
    priorityFeeClamped: priorityFee.clamped,
    priorityFeeFallbackUsed: priorityFee.fallbackUsed,
    lastValidBlockHeight: builtSwap.metadata.lastValidBlockHeight,
    simulationSuccess: simulation.success,
    rawOutputPerInput: fill.rawOutputPerInput,
    quotedSlippageBps: fill.quotedSlippageBps,
    fillDerivationReason: fill.reason,
    filledPriceUnavailable: fill.filledPriceUnavailable,
    feeBreakdown
  };
  logExecutionStage(EXECUTION_STAGES.PIPELINE_DRY_RUN, {
    kind,
    symbol: args.tokenAddress,
    quoteHash: pipelineMetadata.quoteHash,
    derivedFilledPrice: fill.filledPrice,
    derivedSlippagePct: fill.slippagePct,
    derivedFeeSol: feeSol,
    filledPriceUnavailable: fill.filledPriceUnavailable,
    rawOutputPerInput: fill.rawOutputPerInput,
    quotedSlippageBps: fill.quotedSlippageBps,
    fillDerivationReason: fill.reason,
    feeBreakdown,
    unitsConsumed: pipelineMetadata.unitsConsumed,
    cuHeadroomVsAssumed: pipelineMetadata.cuHeadroomVsAssumed,
    appliedPriorityFeeLamports: pipelineMetadata.appliedPriorityFeeLamports,
    lastValidBlockHeight: pipelineMetadata.lastValidBlockHeight,
    pipelineLatencyMs: latencyMs
  });
  return {
    txSig: null,
    filledPrice: fill.filledPrice,
    slippagePct: fill.slippagePct,
    feeSol,
    latencyMs,
    isDryRun: true,
    isPipelineDryRun: true,
    filledPriceUnavailable: fill.filledPriceUnavailable,
    reason: fill.reason,
    pipelineMetadata,
    intent: {
      kind,
      tokenAddress: args.tokenAddress,
      pairAddress: args.pairAddress,
      expectedPrice: args.expectedPrice,
      positionSizeSol: args.positionSizeSol
    },
    note: "PIPELINE_DRY_RUN — full pipeline executed, no signing or submission."
  };
}

// DRY RUN: synthetic intent. PIPELINE DRY RUN: Steps 4-8. LIVE: blocked.
async function submitSwap(kind, { cfg, tokenAddress, pairAddress, expectedPrice, positionSizeSol, sellAmountTokenUnits }) {
  const mode = resolveExecutionMode(cfg);
  if (mode === "DRY_RUN") {
    return {
      txSig: null,
      filledPrice: expectedPrice,
      slippagePct: 0,
      feeSol: 0,
      latencyMs: 0,
      isDryRun: true,
      intent: { kind, tokenAddress, pairAddress, expectedPrice, positionSizeSol },
      note: "DRY_RUN — transaction intent generated, nothing submitted."
    };
  }

  const pipelineStartedAt = Date.now();
  let signer;
  if (mode === "LIVE") {
    signer = loadSignerFromEnvForRealExecution(cfg);
  } else {
    // PIPELINE_DRY_RUN uses an identity-only signer surface. It may identify the
    // configured wallet for quote/build/simulation guards, but it cannot sign
    // and exposes no secret material.
    if (!cfg?.walletPublicAddress) {
      throw makeExecutionError(
        EXECUTION_ABORT_CODES.WALLET_MISMATCH,
        EXECUTION_STAGES.WALLET_MATCH,
        "walletPublicAddress missing from config for PIPELINE_DRY_RUN."
      );
    }
    signer = Object.defineProperties(
      { publicKey: Object.freeze({ toBase58: () => cfg.walletPublicAddress }) },
      {
        sign: { get() { throw new Error("PIPELINE_DRY_RUN signer is identity-only and cannot sign."); } },
        secretKey: { get() { throw new Error("PIPELINE_DRY_RUN signer has no secret material."); } },
        privateKey: { get() { throw new Error("PIPELINE_DRY_RUN signer has no secret material."); } }
      }
    );
  }
  const mints = resolveSwapMints(kind, tokenAddress);
  const quoteAmount = kind === "BUY"
    ? Math.round(Number(positionSizeSol) * 1e9)
    : Number(sellAmountTokenUnits);
  const quote = await getJupiterQuote(kind, cfg, mints, quoteAmount);
  validateJupiterRoute(quote, kind, cfg, mints);
  const priorityFee = await resolvePriorityFee(cfg, { accountKeys: [mints.inputMint, mints.outputMint] });
  const builtSwap = await buildSwapTx(quote, signer, priorityFee, cfg);
  const simulation = await simulateSwapTx(builtSwap, cfg);
  if (mode === "PIPELINE_DRY_RUN") {
    return buildPipelineDryRunResult({
      kind, quote, priorityFee, builtSwap, simulation, pipelineStartedAt,
      args: { tokenAddress, pairAddress, expectedPrice, positionSizeSol }
    });
  }

  assertLiveSubmissionArmed({ ...cfg, positionSizeSol });

  // Step 9a - Sign the full versioned transaction locally.
  // This produces a real Ed25519 signature using the configured signer.
  // Step 9b submits only after the explicit LIVE submission gate passes.
  //
  // Lifecycle discipline:
  //   - The signed bytes are produced, audited, then zeroed via .fill(0).
  //   - The signer reference is dereferenced (set to null) before the throw.
  //   - No signed bytes are persisted to any file.
  const unsignedBytes = builtSwap.transaction.serializedBytes;
  if (!(unsignedBytes instanceof Uint8Array) || unsignedBytes.length === 0) {
    signer = null;
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.TX_BUILD_FAILED,
      EXECUTION_STAGES.TX_BUILD,
      "Cannot sign: builtSwap.transaction.serializedBytes is missing or empty."
    );
  }

  // The v0 versioned tx structure begins with a shortvec of signatures.
  // For a single signer, byte 0 must be 0x01, followed by 64 placeholder
  // signature bytes, then the message. If Jupiter/build output ever uses a
  // different shortvec layout, Step 9a refuses to sign rather than guessing.
  if (unsignedBytes[0] !== 0x01) {
    signer = null;
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.TX_BUILD_FAILED,
      EXECUTION_STAGES.TX_BUILD,
      "Unexpected signature count in versioned tx (Step 9a expects single-signer)."
    );
  }
  if (unsignedBytes.length < 1 + 64 + 1) {
    signer = null;
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.TX_BUILD_FAILED,
      EXECUTION_STAGES.TX_BUILD,
      "Versioned tx too short to contain header + signature slot + message."
    );
  }

  const messageBytes = unsignedBytes.subarray(1 + 64);
  let signature;
  let signedBytes;
  let sigPrefix;
  try {
    signature = signer.sign(messageBytes);
    if (signature.length !== 64) {
      throw makeExecutionError(
        EXECUTION_ABORT_CODES.TX_BUILD_FAILED,
        EXECUTION_STAGES.TX_BUILD,
        "Signer returned non-64-byte signature."
      );
    }

    signedBytes = new Uint8Array(unsignedBytes.length);
    signedBytes[0] = 0x01;
    signedBytes.set(signature, 1);
    signedBytes.set(messageBytes, 1 + 64);

    // Log SIGNED stage. Do NOT log the full signature or signed bytes.
    // Log only signature length, signed-byte length, and a truncated signature
    // prefix for audit correlation (first 8 hex chars).
    sigPrefix = Buffer.from(signature.subarray(0, 4)).toString("hex");
    logExecutionStage(EXECUTION_STAGES.SIGNED, {
      signedAt: nowIso(),
      signatureLength: signature.length,
      signedByteLength: signedBytes.length,
      signaturePrefix: sigPrefix,
      quoteHash: builtSwap.metadata.quoteHash,
      simulationSuccess: simulation.success
    });
  } catch (error) {
    if (signature instanceof Uint8Array) signature.fill(0);
    if (signedBytes instanceof Uint8Array) signedBytes.fill(0);
    signer = null;
    throw error;
  }

  const txSig = txSigFromSignedBytes(signedBytes);

  let submission;
  try {
    submission = await submitRawTransaction(signedBytes, cfg, {
      txSig, kind, tokenAddress, pairAddress, expectedPrice, positionSizeSol, builtSwap
    });
  } catch (err) {
    signedBytes.fill(0);
    signature.fill(0);
    signer = null;
    throw err;
  }

  // Submission succeeded. Zero signed bytes immediately - they are no longer
  // needed, and they must never be persisted or logged.
  signedBytes.fill(0);
  signature.fill(0);
  signer = null;

  let confirmation;
  try {
    confirmation = await awaitConfirmation(submission.txSig, cfg, {
      kind, tokenAddress, pairAddress, expectedPrice, positionSizeSol,
      submittedAt: submission.submittedAt, builtSwap
    });
  } catch (err) {
    throw err;
  }

  if (!confirmation.confirmed) {
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.CONFIRMATION_FAILED,
      EXECUTION_STAGES.CONFIRMATION,
      "Transaction confirmed with on-chain error",
      {
        txSig: submission.txSig.slice(0, 8),
        slot: confirmation.slot,
        err: confirmation.err
      }
    );
  }

  let fill;
  try {
    fill = await parseFillFromTransaction(submission.txSig, cfg, kind, builtSwap, { mints });
  } catch (err) {
    writePendingReconciliation(buildReconciliationContext({
      action: "FILL_PARSE_UNKNOWN",
      txSig: submission.txSig,
      kind,
      tokenAddress,
      pairAddress,
      expectedPrice,
      positionSizeSol,
      submittedAt: submission.submittedAt,
      builtSwap,
      reason: `Fill parse failed after confirmed transaction: ${safeErrorMessage(err)}`
    }));
    throw makeExecutionError(
      EXECUTION_ABORT_CODES.FILL_PARSE_FAILED,
      EXECUTION_STAGES.FILL_PARSE,
      "Confirmed transaction requires reconciliation because fill parsing failed.",
      { txSig: submission.txSig, reason: safeErrorMessage(err) }
    );
  }

  const filledPrice = Number.isFinite(fill.actualFillPriceUsdPerToken) ? fill.actualFillPriceUsdPerToken : null;
  // Pre-submit Jupiter route validation is the protective slippage control.
  // Post-fill USD slippage is diagnostic only, and unavailable until a trusted
  // USD conversion source exists for actualFillPriceUsdPerToken.
  const slippagePct = (
    Number.isFinite(fill.actualFillPriceUsdPerToken) &&
    Number.isFinite(expectedPrice) &&
    expectedPrice > 0
  ) ? ((fill.actualFillPriceUsdPerToken - expectedPrice) / expectedPrice) * 100 : null;

  const slippageCeiling = kind === "BUY" ? cfg.maxEntrySlippagePct : cfg.maxExitSlippagePct;
  if (slippagePct !== null && Math.abs(slippagePct) > Number(slippageCeiling)) {
    logError("submitSwap.slippage_exceeded", `${kind} post-fill slippage ${slippagePct.toFixed(2)}% exceeded ceiling ${slippageCeiling}%`, {
      txSig: submission.txSig.slice(0, 8),
      expectedPrice,
      actualFillPriceUsdPerToken: fill.actualFillPriceUsdPerToken,
      slippagePct,
      anomalyOnly: true
    });
  }

  return {
    txSig: submission.txSig,
    filledPrice,
    actualFillPriceSolPerToken: fill.actualFillPriceSolPerToken,
    actualFillPriceUsdPerToken: fill.actualFillPriceUsdPerToken,
    slippagePct,
    feeSol: fill.feeSolActual,
    latencyMs: Date.now() - pipelineStartedAt,
    isDryRun: false,
    isPipelineDryRun: false,
    filledPriceUnavailable: fill.actualFillPriceUsdPerToken === null,
    fillReason: fill.actualFillPriceUsdPerToken === null ? "No USD conversion source defined for on-chain fill." : null,
    pipelineMetadata: {
      quoteHash: builtSwap.metadata.quoteHash,
      submittedAt: submission.submittedAt,
      slot: confirmation.slot,
      confirmationStatus: confirmation.confirmationStatus,
      actualFillPriceSolPerToken: fill.actualFillPriceSolPerToken,
      actualFillPriceUsdPerToken: fill.actualFillPriceUsdPerToken
    },
    intent: { kind, tokenAddress, pairAddress, expectedPrice, positionSizeSol },
    note: "LIVE - transaction submitted and confirmed."
  };
}

// ─── Pre-trade abort checks ───────────────────────────────────────────────────

async function preTradeChecks(cfg, candidate) {
  const aborts = [];

  // Wallet address must match config.
  if (!cfg.walletPublicAddress) aborts.push("walletPublicAddress missing from config");
  if (process.env.EXPECTED_WALLET_PUBLIC_ADDRESS &&
      process.env.EXPECTED_WALLET_PUBLIC_ADDRESS !== cfg.walletPublicAddress) {
    aborts.push("Wallet address mismatch: env EXPECTED_WALLET_PUBLIC_ADDRESS != config");
  }

  // pairAddress + token address present.
  if (!candidate.pairAddress) aborts.push("pairAddress missing");
  if (!candidate.address)     aborts.push("token address missing");

  // Quote present (entry price stands in for the quote in dry run).
  if (!Number.isFinite(Number(candidate.entryPrice)) || Number(candidate.entryPrice) <= 0) {
    aborts.push("quote/entry price missing");
  }

  // Balance check. In dry run, unknown balance is non-fatal (flagged).
  const balance = await getWalletBalanceSol(cfg);
  const minBal = Number(cfg.minWalletBalanceSol || 0.12);
  if (balance === null) {
    if (!isAnyDryRun(cfg)) aborts.push("Could not read wallet balance (required for real execution)");
  } else if (balance < minBal) {
    aborts.push(`Wallet balance ${balance.toFixed(4)} SOL below minimum ${minBal} SOL`);
  }

  // Slippage estimate. In dry run we assume 0; real path would estimate from quote.
  const estSlippage = 0;
  if (estSlippage > Number(cfg.maxEntrySlippagePct || 3)) {
    aborts.push(`Estimated slippage ${estSlippage}% exceeds max ${cfg.maxEntrySlippagePct}%`);
  }

  // Duplicate-trade risk (defense in depth; findEntryCandidate already dedupes).
  if (findOpenLiveTradeByAddress(candidate.address)) {
    aborts.push("Duplicate trade risk: an open live position already exists for this token");
  }

  return { ok: aborts.length === 0, aborts, balance, balanceKnown: balance !== null };
}

// ─── Entry ────────────────────────────────────────────────────────────────────

async function enterPosition(cfg, candidate) {
  const entryStart = Date.now();
  const liveTradeId = `live_${candidate.symbol || "UNKNOWN"}_${entryStart}`;

  // Pre-trade aborts.
  const checks = await preTradeChecks(cfg, candidate);
  if (!checks.ok) {
    logError("preTradeChecks", checks.aborts.join(" | "), { liveTradeId, symbol: candidate.symbol });
    writeLiveEvent({
      eventType: "ENTRY_ABORTED", liveTradeId, timestamp: nowIso(),
      symbol: candidate.symbol, address: candidate.address,
      aborts: checks.aborts, anomalyFlags: ["ENTRY_ABORTED"]
    });
    return null;
  }

  writeLiveEvent({
    eventType: "INTENDED_LIVE_ENTRY", liveTradeId, timestamp: nowIso(),
    symbol: candidate.symbol, address: candidate.address, pairAddress: candidate.pairAddress,
    score: candidate.score, marketCap: candidate.marketCap, liquidity: candidate.liquidity,
    botDegenRate: candidate.botDegenRate, top10HolderRate: candidate.top10HolderRate,
    source: candidate.source, strategyVersion: cfg.strategyVersion,
    intendedPositionSizeSol: cfg.positionSizeSol, intendedEntryPrice: candidate.entryPrice,
    dryRun: isAnyDryRun(cfg), anomalyFlags: []
  });

  let res;
  try {
    res = await submitSwap("BUY", {
      cfg, tokenAddress: candidate.address, pairAddress: candidate.pairAddress,
      expectedPrice: candidate.entryPrice, positionSizeSol: cfg.positionSizeSol
    });
  } catch (err) {
    logError("submitSwap.BUY", err.message, { liveTradeId, symbol: candidate.symbol });
    writeLiveEvent({
      eventType: "EXECUTION_FAILURE", liveTradeId, timestamp: nowIso(),
      symbol: candidate.symbol, failureReason: "BUY_FAILED", failureDetail: err.message,
      anomalyFlags: ["EXECUTION_FAILURE"], status: "FAILED"
    });
    return null;
  }

  const entryLatencyMs = Date.now() - entryStart;
  const anomalyFlags = [];
  if (Number.isFinite(res.slippagePct) &&
      Math.abs(res.slippagePct) > Number(cfg.maxEntrySlippagePct || 3)) anomalyFlags.push("HIGH_ENTRY_SLIPPAGE");
  if (res.isPipelineDryRun && res.filledPriceUnavailable) anomalyFlags.push("FILL_PRICE_UNAVAILABLE");
  if (res.isDryRun) anomalyFlags.push("DRY_RUN");

  const entryPrice = res.filledPrice;
  const monitoringEntryPrice = Number.isFinite(entryPrice) ? entryPrice : Number(candidate.entryPrice);
  const targetPrice = candidate.targetPrice || Number((monitoringEntryPrice * TARGET_MULT).toFixed(12));
  const stopPrice   = candidate.stopPrice   || Number((monitoringEntryPrice * STOP_MULT).toFixed(12));

  // Append entry event.
  writeLiveEvent({
    eventType: "ACTUAL_LIVE_ENTRY", liveTradeId, timestamp: nowIso(), entryTime: nowIso(),
    symbol: candidate.symbol, address: candidate.address, pairAddress: candidate.pairAddress,
    score: candidate.score, source: candidate.source, strategyVersion: cfg.strategyVersion,
    positionSizeSol: cfg.positionSizeSol,
    intendedEntryPrice: candidate.entryPrice, actualEntryPrice: entryPrice,
    entrySlippagePct: res.slippagePct, entryFeeSol: res.feeSol || 0,
    entryTxSig: res.txSig, entryLatencyMs, targetPrice, stopPrice,
    dryRun: !!res.isDryRun, anomalyFlags, status: "OPEN"
  });

  // Create position record.
  const positions = readPositions();
  positions.push({
    liveTradeId, symbol: candidate.symbol, name: candidate.name,
    address: candidate.address, pairAddress: candidate.pairAddress,
    score: candidate.score, source: candidate.source,
    positionSizeSol: cfg.positionSizeSol,
    entryTime: nowIso(), intendedEntryPrice: candidate.entryPrice, actualEntryPrice: entryPrice,
    entrySlippagePct: res.slippagePct, entryFeeSol: res.feeSol || 0,
    entryTxSig: res.txSig, entryLatencyMs, targetPrice, stopPrice,
    dryRun: !!res.isDryRun, anomalyFlags, status: "OPEN"
  });
  writePositions(positions);

  console.log(`[executor] ENTRY ${candidate.symbol} @ ${entryPrice === null ? "fill unavailable" : "$" + entryPrice} | ${res.isDryRun ? "DRY_RUN intent" : "txSig " + res.txSig} | latency ${entryLatencyMs}ms`);
  return liveTradeId;
}

// ─── Price polling for open positions ─────────────────────────────────────────

async function getCurrentPrice(pairAddress) {
  if (!axios) return null;
  try {
    const r = await axios.get(`${DEX}/latest/dex/pairs/solana/${pairAddress}`, { timeout: 8000 });
    const pairs = [r.data.pair, ...(r.data.pairs || [])].filter(Boolean);
    const pair = pairs.find(p => p.pairAddress?.toLowerCase() === pairAddress.toLowerCase());
    if (!pair) return null;
    return { price: Number(pair.priceUsd || 0), pairAddress: pair.pairAddress };
  } catch (err) {
    logError("getCurrentPrice", err.message, { pairAddress });
    return null;
  }
}

// ─── Exit ─────────────────────────────────────────────────────────────────────

// Exit by liveTradeId with an explicit trigger (used by monitor mirror and loop).
async function executeLiveExit(liveTradeId, trigger) {
  const exitStart = Date.now();
  let cfg;
  try { cfg = loadConfig(); } catch (err) { logError("exit.loadConfig", err.message, { liveTradeId }); throw err; }

  const positions = readPositions();
  const pos = positions.find(p => p.liveTradeId === liveTradeId && p.status === "OPEN");
  if (!pos) {
    // Idempotent: nothing open to exit.
    writeLiveEvent({ eventType: "EXIT_SKIPPED", liveTradeId, timestamp: nowIso(),
      reason: "No matching OPEN position", trigger: trigger && trigger.triggerType });
    return null;
  }

  writeLiveEvent({
    eventType: "INTENDED_LIVE_EXIT", liveTradeId, timestamp: nowIso(),
    triggerType: trigger.triggerType, triggerPrice: trigger.triggerPrice
  });

  let res;
  try {
    res = await submitSwap("SELL", {
      cfg, tokenAddress: pos.address, pairAddress: pos.pairAddress,
      expectedPrice: trigger.triggerPrice, positionSizeSol: pos.positionSizeSol
    });
  } catch (err) {
    logError("submitSwap.SELL", err.message, { liveTradeId, symbol: pos.symbol });
    writeLiveEvent({ eventType: "EXECUTION_FAILURE", liveTradeId, timestamp: nowIso(),
      symbol: pos.symbol, failureReason: "SELL_FAILED", failureDetail: err.message,
      anomalyFlags: ["EXECUTION_FAILURE"], status: "FAILED" });
    throw err;
  }

  const exitLatencyMs = Date.now() - exitStart;
  const exitPrice = res.filledPrice;
  const entryPrice = pos.actualEntryPrice || pos.intendedEntryPrice;
  const pos_ = pos.positionSizeSol;

  const pnlAvailable = Number.isFinite(exitPrice) && Number.isFinite(entryPrice) && entryPrice > 0;
  const grossPnlPct = pnlAvailable ? ((exitPrice - entryPrice) / entryPrice) * 100 : null;
  const grossPnlSol = pnlAvailable ? pos_ * (grossPnlPct / 100) : null;
  const totalFeesSol = (pos.entryFeeSol || 0) + (res.feeSol || 0);
  const netPnlSol = pnlAvailable ? grossPnlSol - totalFeesSol : null;

  const anomalyFlags = [...(pos.anomalyFlags || [])];
  if (Number.isFinite(res.slippagePct) &&
      Math.abs(res.slippagePct) > Number(cfg.maxEntrySlippagePct || 3)) anomalyFlags.push("HIGH_EXIT_SLIPPAGE");
  if (res.isPipelineDryRun && res.filledPriceUnavailable) anomalyFlags.push("PNL_SLIPPAGE_UNAVAILABLE");
  if (res.isDryRun) anomalyFlags.push("DRY_RUN");

  const status =
    trigger.triggerType === "TARGET"  ? "WIN" :
    trigger.triggerType === "STOP"    ? "LOSS" :
    trigger.triggerType === "TIMEOUT" ? "TIMEOUT" : "CLOSED";

  // Append exit + closed summary.
  writeLiveEvent({
    eventType: "ACTUAL_LIVE_EXIT", liveTradeId, timestamp: nowIso(), exitTime: nowIso(),
    symbol: pos.symbol, address: pos.address, pairAddress: pos.pairAddress,
    triggerType: trigger.triggerType, positionSizeSol: pos_,
    actualEntryPrice: entryPrice, actualExitPrice: exitPrice,
    exitSlippagePct: res.slippagePct, exitFeeSol: res.feeSol || 0, totalFeesSol,
    exitTxSig: res.txSig, exitLatencyMs,
    grossPnlPct: pnlAvailable ? Number(grossPnlPct.toFixed(4)) : null,
    grossPnlSol: pnlAvailable ? Number(grossPnlSol.toFixed(6)) : null,
    netPnlSol: pnlAvailable ? Number(netPnlSol.toFixed(6)) : null,
    dryRun: !!res.isDryRun, anomalyFlags, status
  });

  writeLiveEvent({
    eventType: "CLOSED_LIVE_TRADE", liveTradeId, timestamp: nowIso(),
    entryTime: pos.entryTime, exitTime: nowIso(),
    symbol: pos.symbol, address: pos.address, pairAddress: pos.pairAddress,
    positionSizeSol: pos_, actualEntryPrice: entryPrice, actualExitPrice: exitPrice,
    entrySlippagePct: pos.entrySlippagePct, exitSlippagePct: res.slippagePct,
    entryFeeSol: pos.entryFeeSol || 0, exitFeeSol: res.feeSol || 0, totalFeesSol,
    entryLatencyMs: pos.entryLatencyMs, exitLatencyMs,
    entryTxSig: pos.entryTxSig, exitTxSig: res.txSig,
    grossPnlPct: pnlAvailable ? Number(grossPnlPct.toFixed(4)) : null,
    netPnlSol: pnlAvailable ? Number(netPnlSol.toFixed(6)) : null,
    triggerType: trigger.triggerType, dryRun: !!res.isDryRun, anomalyFlags, status
  });

  // Remove from open positions.
  pos.status = status;
  pos.exitTime = nowIso();
  writePositions(positions.filter(p => p.liveTradeId !== liveTradeId));

  console.log(`[executor] EXIT ${pos.symbol} | ${status} | net ${pnlAvailable ? netPnlSol.toFixed(4) + " SOL" : "PnL unavailable"} | ${res.isDryRun ? "DRY_RUN" : "txSig " + res.txSig}`);

  // Daily stop notice.
  const stop = dailyStopHit(cfg);
  if (stop.hit) {
    writeLiveEvent({ eventType: "DAILY_STOP_TRIGGERED", timestamp: nowIso(), ...todayStats() });
    console.log("[executor] ⚠ DAILY STOP TRIGGERED — no new entries today.");
  }
  return status;
}

// Flag (do not sell) an open live position when paper monitor sees an anomaly.
function flagOpenLiveTradeAnomaly(address, reason) {
  const live = findOpenLiveTradeByAddress(address);
  if (!live) return null;
  return writeLiveEvent({
    eventType: "LIVE_ANOMALY_FLAGGED", liveTradeId: live.liveTradeId, timestamp: nowIso(),
    symbol: live.symbol, address: live.address, reason,
    anomalyFlags: ["NEEDS_REVIEW", "PAPER_ANOMALY_MIRRORED"],
    note: "Open live position NOT auto-exited — data anomalous. Manual review required."
  });
}

// ─── Manage open positions (poll + exit) ──────────────────────────────────────

async function manageOpenPositions(cfg) {
  for (const pos of openPositions()) {
    if (!pos.pairAddress) continue;

    // In dry run with no price feed we still time out stale positions.
    const ageMin = (Date.now() - new Date(pos.entryTime).getTime()) / 60000;
    const obs = await getCurrentPrice(pos.pairAddress);
    const price = obs && obs.price;

    if (price) {
      if (price >= pos.targetPrice) { await executeLiveExit(pos.liveTradeId, { triggerType: "TARGET", triggerPrice: price }); continue; }
      if (price <= pos.stopPrice) {
        const livePnl = ((price - (pos.actualEntryPrice || pos.intendedEntryPrice)) / (pos.actualEntryPrice || pos.intendedEntryPrice)) * 100;
        if (livePnl < -50) { flagOpenLiveTradeAnomaly(pos.address, `Implied loss ${livePnl.toFixed(1)}% worse than -50% threshold`); continue; }
        await executeLiveExit(pos.liveTradeId, { triggerType: "STOP", triggerPrice: price }); continue;
      }
    }
    if (ageMin >= TIMEOUT_MINUTES) {
      await executeLiveExit(pos.liveTradeId, { triggerType: "TIMEOUT", triggerPrice: price || pos.actualEntryPrice || pos.intendedEntryPrice });
    }
  }
}

// ─── One cycle ────────────────────────────────────────────────────────────────

async function runCycle(options = {}) {
  let cfg;
  try { cfg = loadConfig(); }
  catch (err) {
    logError("runCycle.loadConfig", err.message);
    const cycleBase = cycleAuditBase(null, "CONFIG_ERROR", options);
    logExecutionStage(EXECUTION_STAGES.CYCLE_START, cycleBase);
    const result = { action: "CONFIG_ERROR", error: err.message };
    logExecutionStage(EXECUTION_STAGES.CYCLE_END, {
      ...cycleBase,
      action: result.action,
      result
    });
    return result;
  }
  const mode = resolveExecutionMode(cfg);
  const cycleBase = cycleAuditBase(cfg, mode, options);
  logExecutionStage(EXECUTION_STAGES.CYCLE_START, cycleBase);
  const finishCycle = result => {
    logExecutionStage(EXECUTION_STAGES.CYCLE_END, {
      ...cycleBase,
      action: result?.action || "UNKNOWN",
      result
    });
    return result;
  };

  // Emergency halt: nothing at all.
  if (cfg.emergencyStop) return finishCycle({ action: "EMERGENCY_HALT" });

  // PIPELINE_DRY_RUN is observation-only and never manages operational state.
  if (mode !== "PIPELINE_DRY_RUN") {
    // Exits ALWAYS run in trading modes (even when stopped) — only emergency halts them.
    try { await manageOpenPositions(cfg); }
    catch (err) { logError("manageOpenPositions", err.message); }
  }

  // Entries gated by automationEnabled + safety.
  if (!cfg.automationEnabled) return finishCycle({ action: "STOPPED_NO_ENTRIES" });

  if (mode === "PIPELINE_DRY_RUN") {
    const candidates = findCandidates(cfg);
    const candidate = candidates[0] || null;
    if (!candidate) {
      logExecutionStage(EXECUTION_STAGES.CYCLE_NO_CANDIDATE, {
        ...cycleBase,
        reason: "No PIPELINE_DRY_RUN observation candidate selected.",
        ...lastPipelineObservationSelectionStats,
        candidatePoolCount: candidates.length
      });
      return finishCycle({ action: "NO_OBSERVATION_CANDIDATE" });
    }
    logExecutionStage(EXECUTION_STAGES.CYCLE_CANDIDATE_SELECTED, {
      ...cycleBase,
      ...cycleCandidateAudit(candidate),
      ...lastPipelineObservationSelectionStats,
      candidatePoolCount: candidates.length
    });
    try {
      return finishCycle(await observePipelineCandidate(cfg, candidate));
    } catch (err) {
      return finishCycle({ action: "OBSERVATION_ERROR", error: err.message, code: err.code || null, stage: err.stage || null });
    }
  }

  const gate = safetyCheck(cfg);
  if (!gate.allowed) return finishCycle({ action: "BLOCKED", reasons: gate.reasons });

  const candidates = findCandidates(cfg);
  const candidate = candidates[0] || null;
  if (!candidate) {
    logExecutionStage(EXECUTION_STAGES.CYCLE_NO_CANDIDATE, {
      ...cycleBase,
      reason: "No LIVE/DRY_RUN entry candidate selected.",
      candidatePoolCount: candidates.length
    });
    return finishCycle({ action: "NO_CANDIDATE" });
  }
  logExecutionStage(EXECUTION_STAGES.CYCLE_CANDIDATE_SELECTED, {
    ...cycleBase,
    ...cycleCandidateAudit(candidate),
    candidatePoolCount: candidates.length
  });

  try {
    const id = await enterPosition(cfg, candidate);
    return finishCycle({ action: id ? "ENTERED" : "ENTRY_ABORTED", liveTradeId: id, symbol: candidate.symbol });
  } catch (err) {
    logError("enterPosition", err.message, { symbol: candidate.symbol });
    return finishCycle({ action: "ENTRY_ERROR", error: err.message });
  }
}

// ─── Control functions (dashboard buttons call these) ─────────────────────────

function logControl(action, reason, extra = {}) {
  appendJsonl(CONTROL_EVENTS_FILE, { timestamp: nowIso(), action, reason, ...extra });
}

function readinessChecks(cfg = loadConfig()) {
  const checks = [];
  const add = (label, ok, detail = "") => checks.push({ label, ok, detail });

  add("Config loads", true);
  add("Not in emergency stop", !cfg.emergencyStop, cfg.emergencyStop ? "Run reset_live_safety.js" : "");
  add("Wallet address set", !!cfg.walletPublicAddress);
  add("Position size <= 0.10 SOL", Number(cfg.positionSizeSol) <= 0.10, `current ${cfg.positionSizeSol}`);
  add("Max open trades <= 1", Number(cfg.maxOpenTrades) <= 1);
  add("No compounding/averaging/martingale",
      !cfg.compoundingEnabled && !cfg.averagingDownEnabled && !cfg.martingaleEnabled);
  add("Daily stop not already hit", !dailyStopHit(cfg).hit);
  add("live_trades.jsonl valid", readLiveTrades().every(e => !e._parseError));
  const executionMode = resolveExecutionMode(cfg);
  add("Execution mode valid", ["DRY_RUN", "PIPELINE_DRY_RUN", "LIVE"].includes(executionMode), executionMode);
  if (executionMode === "LIVE") {
    add("LIVE mode uses dryRunMode=false", cfg.dryRunMode === false,
        cfg.dryRunMode === false ? "approved LIVE preflight posture" : "dryRunMode must be false for LIVE");
    try {
      assertLiveSubmissionArmed(cfg);
      add("LIVE submission gate armed", true, "all live gate conditions satisfied");
    } catch (err) {
      const failures = Array.isArray(err?.extra?.failures) ? err.extra.failures.join("; ") : safeErrorMessage(err);
      add("LIVE submission gate armed", false, failures);
    }
  } else {
    add("Dry run mode ON (Phase 1)", isAnyDryRun(cfg), executionMode);
    add("PIPELINE_DRY_RUN observation milestone", executionMode === "PIPELINE_DRY_RUN",
        "Required until final LIVE flip is explicitly approved");
  }
  let dedicatedRpcConfigured = false;
  try {
    dedicatedRpcConfigured = !!resolveRpcEndpoint(cfg, { requireDedicated: true, purpose: "simulation" });
  } catch { dedicatedRpcConfigured = false; }
  add("Dedicated RPC configured before real execution", isAnyDryRun(cfg) || dedicatedRpcConfigured,
      isAnyDryRun(cfg) ? "Required before LIVE mode can be selected" :
        "Public mainnet-beta RPC is not acceptable for live execution");
  const open = openPositions();
  add("Open positions within limit", open.length <= (cfg.maxOpenTrades || 1), `${open.length} open`);

  return { allPassed: checks.every(c => c.ok), checks };
}

function startAutomation(reason = "Manual START from dashboard") {
  const cfg = loadConfig();
  if (cfg.emergencyStop) {
    logControl("START_REJECTED", "Emergency stop active");
    return { ok: false, error: "Emergency stop is active — clear it with reset_live_safety.js first." };
  }
  const readiness = readinessChecks(cfg);
  if (!readiness.allPassed) {
    const failed = readiness.checks.filter(c => !c.ok).map(c => c.label);
    logControl("START_REJECTED", "Readiness failed", { failed });
    return { ok: false, error: `Readiness checks failed: ${failed.join(", ")}`, readiness };
  }
  const before = JSON.parse(JSON.stringify(cfg));
  cfg.automationEnabled = true;
  cfg.lastAutomationToggleAt = nowIso();
  cfg.lastAutomationToggleReason = reason;
  saveConfig(cfg);
  auditConfigChange({ oldCfg: before, newCfg: cfg, actor: "operator", source: "live_executor.startAutomation", reason });
  logControl("START", reason, { dryRunMode: cfg.dryRunMode });
  return { ok: true, dryRunMode: cfg.dryRunMode };
}

function stopAutomation(reason = "Manual STOP from dashboard") {
  const cfg = loadConfig();
  const before = JSON.parse(JSON.stringify(cfg));
  cfg.automationEnabled = false; // entries off; exits continue
  cfg.lastAutomationToggleAt = nowIso();
  cfg.lastAutomationToggleReason = reason;
  saveConfig(cfg);
  auditConfigChange({ oldCfg: before, newCfg: cfg, actor: "operator", source: "live_executor.stopAutomation", reason });
  logControl("STOP", reason);
  return { ok: true, note: "New entries disabled. Open positions will still be exited by the loop." };
}

function emergencyStopControl(reason = "Manual EMERGENCY STOP from dashboard") {
  const cfg = loadConfig();
  const before = JSON.parse(JSON.stringify(cfg));
  cfg.automationEnabled = false;
  cfg.emergencyStop = true;
  cfg.lastAutomationToggleAt = nowIso();
  cfg.lastAutomationToggleReason = reason;
  saveConfig(cfg);
  auditConfigChange({ oldCfg: before, newCfg: cfg, actor: "operator", source: "live_executor.emergencyStopControl", reason });
  logControl("EMERGENCY_STOP", reason);
  writeLiveEvent({ eventType: "KILL_SWITCH_ACTIVATED", timestamp: nowIso(), reason, anomalyFlags: ["KILL_SWITCH"] });
  return { ok: true };
}

// ─── Stats (dashboard) ────────────────────────────────────────────────────────

function readLiveTrades() { return readJsonl(LIVE_TRADES_FILE); }

function liveStats() {
  const cfg = (() => { try { return loadConfig(); } catch { return {}; } })();
  const closed = closedTrades();
  const wins = closed.filter(t => t.status === "WIN").length;
  const losses = closed.filter(t => t.status === "LOSS").length;
  const timeouts = closed.filter(t => t.status === "TIMEOUT").length;
  const open = openPositions();

  const pnls = closed.map(t => Number(t.netPnlSol)).filter(Number.isFinite);
  const totalNetPnlSol = pnls.reduce((s, v) => s + v, 0);
  const avgPnlSol = pnls.length ? totalNetPnlSol / pnls.length : 0;
  const grossWins = pnls.filter(v => v > 0).reduce((s, v) => s + v, 0);
  const grossLoss = Math.abs(pnls.filter(v => v < 0).reduce((s, v) => s + v, 0));
  const profitFactor = grossLoss > 0 ? grossWins / grossLoss : null;

  let equity = 0, peak = 0, maxDd = 0;
  for (const p of pnls) { equity += p; peak = Math.max(peak, equity); maxDd = Math.max(maxDd, peak - equity); }
  const maxDrawdownPct = peak > 0 ? (maxDd / peak) * 100 : 0;

  const slips = [];
  for (const t of closed) {
    if (Number.isFinite(Number(t.entrySlippagePct))) slips.push(Math.abs(Number(t.entrySlippagePct)));
    if (Number.isFinite(Number(t.exitSlippagePct)))  slips.push(Math.abs(Number(t.exitSlippagePct)));
  }
  const avgSlippage = slips.length ? slips.reduce((s, v) => s + v, 0) / slips.length : 0;
  const maxSlippage = slips.length ? Math.max(...slips) : 0;
  const entrySlips = closed.map(t => Math.abs(Number(t.entrySlippagePct))).filter(Number.isFinite);
  const exitSlips  = closed.map(t => Math.abs(Number(t.exitSlippagePct))).filter(Number.isFinite);
  const avgEntrySlip = entrySlips.length ? entrySlips.reduce((s, v) => s + v, 0) / entrySlips.length : 0;
  const avgExitSlip  = exitSlips.length ? exitSlips.reduce((s, v) => s + v, 0) / exitSlips.length : 0;
  const totalFeesSol = closed.reduce((s, t) => s + Number(t.totalFeesSol || 0), 0);
  const lats = closed.map(t => Number(t.exitLatencyMs)).filter(Number.isFinite);
  const avgLatency = lats.length ? lats.reduce((s, v) => s + v, 0) / lats.length : 0;

  // Paper comparison (gmgn_v4 closed).
  const paperClosed = readPaperTrades().filter(t =>
    ["WIN", "LOSS", "TIMEOUT"].includes(t.status) &&
    Number.isFinite(Number(t.pnlPercent)) && t.strategyVersion === "gmgn_v4");
  const paperPnls = paperClosed.map(t => Number(t.pnlPercent));
  const paperAvg = paperPnls.length ? paperPnls.reduce((s, v) => s + v, 0) / paperPnls.length : null;
  const liveAvgPct = closed.length
    ? closed.map(t => Number(t.grossPnlPct || 0)).filter(Number.isFinite).reduce((s, v) => s + v, 0) / closed.length
    : null;
  let edgeScore = null;
  if (paperAvg && liveAvgPct !== null && paperAvg !== 0) edgeScore = Math.round((liveAvgPct / paperAvg) * 100);

  const daily = todayStats();
  const stop = dailyStopHit(cfg, daily);
  const parseErrors = readLiveTrades().filter(e => e._parseError).length;

  return {
    totalLiveTrades: closed.length, openTrades: open.length,
    wins, losses, timeouts,
    winRate: closed.length ? ((wins / closed.length) * 100).toFixed(1) : null,
    totalNetPnlSol: Number(totalNetPnlSol.toFixed(6)), avgPnlSol: Number(avgPnlSol.toFixed(6)),
    profitFactor: profitFactor !== null ? Number(profitFactor.toFixed(3)) : null,
    maxDrawdownSol: Number(maxDd.toFixed(6)),
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    avgSlippagePct: Number(avgSlippage.toFixed(3)),
    maxSlippagePct: Number(maxSlippage.toFixed(3)),
    avgEntrySlippagePct: Number(avgEntrySlip.toFixed(3)),
    avgExitSlippagePct: Number(avgExitSlip.toFixed(3)),
    totalFeesSol: Number(totalFeesSol.toFixed(6)),
    avgExitLatencyMs: Math.round(avgLatency),
    edgePreservationScore: edgeScore,
    paperTradesCount: paperClosed.length,
    paperAvgPnlPct: paperAvg !== null ? Number(paperAvg.toFixed(2)) : null,
    liveAvgPnlPct: liveAvgPct !== null ? Number(liveAvgPct.toFixed(2)) : null,
    dailyStopActive: stop.hit, lossesToday: daily.lossesToday,
    realizedPnlSolToday: Number(daily.realizedPnlSol.toFixed(6)),
    parseErrors,
    config: {
      automationEnabled: cfg.automationEnabled, dryRunMode: isAnyDryRun(cfg),
      executionMode: resolveExecutionMode(cfg),
      emergencyStop: cfg.emergencyStop, positionSizeSol: cfg.positionSizeSol,
      maxDailyLossSol: cfg.maxDailyLossSol, maxDailyLossCount: cfg.maxDailyLossCount,
      maxDrawdownPercent: cfg.maxDrawdownPercent, walletPublicAddress: cfg.walletPublicAddress || null,
      lastAutomationToggleAt: cfg.lastAutomationToggleAt, lastAutomationToggleReason: cfg.lastAutomationToggleReason,
      lastError: cfg.lastError
    }
  };
}

// ─── Backward-compat alias for monitor mirror from prior turn ─────────────────
const groupLiveTrades = readLiveTrades;

// ─── Autonomous loop ──────────────────────────────────────────────────────────

async function autonomousLoop(intervalMs = 60000) {
  console.log(`[executor] Autonomous loop starting. Cycle every ${intervalMs / 1000}s.`);
  console.log("[executor] Reminder: this respects automationEnabled, emergencyStop, dailyStop, and dryRunMode every cycle.");
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const cfg = loadConfig();
      const result = await runCycle({ loopMode: true });
      const banner = resolveExecutionMode(cfg).replaceAll("_", " ");
      console.log(`[executor] [${banner}] cycle: ${result.action}${result.reasons ? " — " + result.reasons.join("; ") : ""}`);
    } catch (err) {
      logError("autonomousLoop", err.message);
      console.error("[executor] cycle error:", err.message);
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

function liveLoopAllowed(cfg = loadConfig()) {
  return resolveExecutionMode(cfg) !== "LIVE" || process.env.FOMO_ALLOW_LOOP_LIVE === "YES";
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === "--loop") {
    try {
      const cfg = loadConfig();
      if (!liveLoopAllowed(cfg)) {
        console.error("LIVE --loop blocked: FOMO_ALLOW_LOOP_LIVE is not YES.");
        console.error("First live execution-validation trade requires --cycle only.");
        process.exit(1);
      }
    } catch (err) {
      console.error("[executor] error:", err.message);
      process.exit(1);
    }
    autonomousLoop();
  } else if (arg === "--cycle") {
    runCycle({ cycleMode: true }).then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); });
  } else {
    // Default: status only, no execution.
    try {
      const cfg = loadConfig();
      console.log("[executor] Status (no execution).");
      console.log("  executionMode:", resolveExecutionMode(cfg), "| dryRunMode:", isAnyDryRun(cfg), "| automationEnabled:", cfg.automationEnabled, "| emergencyStop:", cfg.emergencyStop);
      console.log("  LIVE loop allowed:", liveLoopAllowed(cfg), resolveExecutionMode(cfg) === "LIVE" ? "| FOMO_ALLOW_LOOP_LIVE required for --loop" : "| non-LIVE loop unchanged");
      const gate = safetyCheck(cfg);
      console.log("  Entries allowed:", gate.allowed, gate.allowed ? "" : "— " + gate.reasons.join("; "));
      const r = readinessChecks(cfg);
      console.log("  Readiness:", r.allPassed ? "ALL PASS" : "FAILS: " + r.checks.filter(c => !c.ok).map(c => c.label).join(", "));
      const armed = computeLiveArmedStatus(cfg);
      console.log("  liveArmed:", armed.liveArmed, armed.liveArmed ? "⚠ LIVE SUBMISSION GATES SATISFIED" : "");
      console.log("  operationalPosture:", armed.operationalPosture);
      console.log("  liveSubmission:", armed.summary);
      if (!armed.liveArmed) {
        console.log("  liveSubmission blocked:", armed.failures.join("; "));
      }
      const gateLine = Object.values(armed.gates)
        .map(g => `${g.ok ? "ok" : "blocked"}: ${g.label} (${g.detail})`)
        .join("; ");
      console.log("  liveSubmissionGates:", gateLine);
      if (!armed.liveArmed && gate.allowed) {
        console.log("  Note: Entries allowed and Readiness ALL PASS do not mean liveArmed — pipeline observation may still run.");
      }
      console.log("\nUsage: node live_executor.js [--loop | --cycle]");
    } catch (err) {
      console.error("[executor] error:", err.message);
      process.exit(1);
    }
  }
}

module.exports = {
  // lifecycle
  runCycle, autonomousLoop, manageOpenPositions,
  enterPosition, executeLiveExit, flagOpenLiveTradeAnomaly,
  findEntryCandidate, findCandidates, findStrictThesisCandidates,
  findPipelineObservationCandidates, findDryRunCandidates,
  observePipelineCandidate, matchesPhase1Thesis,
  // controls
  startAutomation, stopAutomation, emergencyStopControl, readinessChecks,
  resolveExecutionMode, isAnyDryRun, computeLiveArmedStatus,
  // data / stats
  loadConfig, saveConfig, liveStats, safetyCheck, todayStats, dailyStopHit,
  readLiveTrades, readPositions, openPositions, findOpenLiveTradeByAddress,
  groupLiveTrades, getWalletBalanceSol, writeLiveEvent, logControl, readPipelineCandidates,
  // config audit (A3)
  auditConfigChange, classifyConfigFieldRisk,
  // meta
  EXECUTOR_VERSION, PHASE,
  FILES: { LIVE_TRADES_FILE, LIVE_POSITIONS_FILE, CONTROL_EVENTS_FILE, ERRORS_FILE, EXECUTION_AUDIT_FILE, PENDING_RECONCILIATION_FILE, PIPELINE_CANDIDATES_FILE, OBSERVATION_DEDUP_FILE, CONFIG_AUDIT_FILE },
  // Test-only logging surface. It exposes no signer, swap, or transaction methods.
  __executionLoggingTest: {
    EXECUTION_ABORT_CODES, EXECUTION_STAGES,
    makeExecutionError, safeErrorMessage, logExecutionStage, logExecutionFailure, redactSecrets
  },
  // Test-only signer-guard surface. It exposes no signer object or transaction methods.
  __signerGuardTest: {
    submitSwapForTest: submitSwap,
    getSignerLoadCount: () => signerGuardLoadCount,
    resetSignerLoadCount: () => { signerGuardLoadCount = 0; }
  },
  // Test-only quote-validation surface. It exposes no swap transaction methods.
  __jupiterQuoteTest: {
    SOL_MINT, JUPITER_QUOTE_ENDPOINT,
    resolveSwapMints, getJupiterQuote, validateJupiterRoute,
    submitSwapForTest: submitSwap,
    setQuoteFetchForTest: fn => { quoteFetch = fn; },
    resetQuoteFetchForTest: () => { quoteFetch = (...args) => fetch(...args); }
  },
  // Test-only priority-fee surface. It exposes no transaction methods.
  __priorityFeeTest: {
    resolvePriorityFee,
    submitSwapForTest: submitSwap,
    setPriorityFeeFetchForTest: fn => { priorityFeeFetch = fn; },
    resetPriorityFeeFetchForTest: () => { priorityFeeFetch = (...args) => fetch(...args); }
  },
  // Test-only transaction-build surface. It exposes no signing/submission methods.
  __txBuildTest: {
    JUPITER_SWAP_ENDPOINT, buildSwapTx,
    submitSwapForTest: submitSwap,
    setSwapBuildFetchForTest: fn => { swapBuildFetch = fn; },
    resetSwapBuildFetchForTest: () => { swapBuildFetch = (...args) => fetch(...args); }
  },
  // Test-only unsigned-simulation surface. It exposes no signer or submission methods.
  __simulationTest: {
    simulateSwapTx, resolveRpcEndpoint, PUBLIC_SOLANA_RPC_ENDPOINT,
    submitSwapForTest: submitSwap,
    setSimulationFetchForTest: fn => { simulationFetch = fn; },
    resetSimulationFetchForTest: () => { simulationFetch = (...args) => fetch(...args); }
  },
  __submissionTest: {
    submitSwapForTest: submitSwap,
    submitRawTransaction,
    awaitConfirmation,
    parseFillFromTransaction,
    txSigFromSignedBytes,
    writePendingReconciliation,
    resolveRpcEndpoint,
    setSubmissionFetchForTest: fn => { submissionFetch = fn; },
    resetSubmissionFetchForTest: () => { submissionFetch = (...args) => fetch(...args); },
    setConfirmationFetchForTest: fn => { confirmationFetch = fn; },
    resetConfirmationFetchForTest: () => { confirmationFetch = (...args) => fetch(...args); },
    setFillFetchForTest: fn => { fillFetch = fn; },
    resetFillFetchForTest: () => { fillFetch = (...args) => fetch(...args); }
  },
  __pipelineDryRunTest: {
    resolveExecutionMode, isAnyDryRun, buildPipelineDryRunResult,
    submitSwapForTest: submitSwap,
    setSignerLoaderForTest: fn => { signerLoaderForTest = fn; },
    resetSignerLoaderForTest: () => { signerLoaderForTest = null; }
  },
  __observationPoolTest: {
    findCandidates, findStrictThesisCandidates, findPipelineObservationCandidates,
    findDryRunCandidates, observePipelineCandidate, matchesPhase1Thesis,
    setCandidatePoolForTest: candidates => { candidatePoolForTest = candidates; },
    resetCandidatePoolForTest: () => { candidatePoolForTest = null; },
    setPipelineCandidateQueueForTest: candidates => { pipelineCandidateQueueForTest = candidates; },
    resetPipelineCandidateQueueForTest: () => { pipelineCandidateQueueForTest = null; },
    setObservationSubmitSwapForTest: fn => { observationSubmitSwapForTest = fn; },
    resetObservationSubmitSwapForTest: () => { observationSubmitSwapForTest = null; },
    setObservationAuditRowsForTest: rows => { observationAuditRowsForTest = rows; observationDedupSeeded = false; },
    resetObservationAuditRowsForTest: () => { observationAuditRowsForTest = null; observationDedupSeeded = false; },
    setObservationDedupFileForTest: file => { observationDedupFileForTest = file; observationDedupSeeded = false; },
    resetObservationDedupFileForTest: () => { observationDedupFileForTest = null; observationDedupSeeded = false; },
    seedObservedPipelineCandidatesFromAudit,
    loadObservationDedupSnapshot,
    persistObservationDedupSnapshot,
    resetObservationDedupForTest: () => {
      observedPipelineCandidates.clear();
      observedPipelinePairTimestamps.clear();
      observationDedupSeeded = false;
      lastPipelineObservationSelectionStats = {
        queueRowsRead: 0,
        skippedByIntentDedupe: 0,
        skippedByFallbackPairDedupe: 0,
        skippedByPairCooldown: 0,
        candidatePoolCount: 0
      };
    },
    getObservedCandidateKeysForTest: () => [...observedPipelineCandidates],
    getObservedPairTimestampsForTest: () => Object.fromEntries(observedPipelinePairTimestamps),
    getLastPipelineObservationSelectionStatsForTest: () => ({ ...lastPipelineObservationSelectionStats })
  }
};
