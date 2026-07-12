"use strict";

// Unified Jupiter Swap API v1 client — quote and swap-build on one base host.

const JUPITER_SWAP_BASE_DEFAULT = "https://lite-api.jup.ag/swap/v1";
const JUPITER_SWAP_BASE_PRO = "https://api.jup.ag/swap/v1";
const DEPRECATED_JUPITER_QUOTE_HOST = "quote-api.jup.ag";
const JUPITER_QUOTE_PATH = "/quote";
const JUPITER_SWAP_PATH = "/swap";
const FORBIDDEN_PATH_MARKERS = Object.freeze(["/execute", "/submit", "/swap-instructions"]);
const LAMPORTS_PER_SOL = 1e9;
const LAMPORTS_PER_SIGNATURE = 5000;

class JupiterClientError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "JupiterClientError";
    this.code = code;
    this.extra = extra;
  }
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

function parseBaseUrl(baseUrl) {
  try {
    return new URL(normalizeBaseUrl(baseUrl));
  } catch {
    throw new JupiterClientError("JUPITER_BASE_INVALID", "Jupiter base URL is invalid.", { baseUrl });
  }
}

function assertSupportedSwapV1Base(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  const parsed = parseBaseUrl(normalized);
  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";

  if (host === DEPRECATED_JUPITER_QUOTE_HOST) {
    throw new JupiterClientError(
      "JUPITER_HOST_DEPRECATED",
      "Deprecated Jupiter quote host is blocked.",
      { host }
    );
  }
  if (pathname.includes("/v6") || host.includes("v6")) {
    throw new JupiterClientError(
      "JUPITER_API_GENERATION_MISMATCH",
      "Jupiter v6 execution paths are blocked.",
      { pathname }
    );
  }
  for (const marker of FORBIDDEN_PATH_MARKERS) {
    if (pathname.includes(marker)) {
      throw new JupiterClientError(
        "JUPITER_PATH_FORBIDDEN",
        `Forbidden Jupiter path marker blocked: ${marker}`,
        { pathname }
      );
    }
  }
  if (!pathname.endsWith("/swap/v1")) {
    throw new JupiterClientError(
      "JUPITER_API_GENERATION_MISMATCH",
      "Jupiter base must be Swap API v1 (/swap/v1).",
      { pathname }
    );
  }
  return normalized;
}

function resolveJupiterBaseUrl(options = {}) {
  if (options.jupiterBaseUrl) return assertSupportedSwapV1Base(options.jupiterBaseUrl);
  if (options.useProJupiterBase === true) return assertSupportedSwapV1Base(JUPITER_SWAP_BASE_PRO);
  if (process.env.JUPITER_API_KEY && options.preferProWhenKey !== false) {
    return assertSupportedSwapV1Base(JUPITER_SWAP_BASE_PRO);
  }
  return JUPITER_SWAP_BASE_DEFAULT;
}

function isForbiddenUrlPath(pathname) {
  const normalized = String(pathname || "").toLowerCase();
  return FORBIDDEN_PATH_MARKERS.some(marker => normalized.includes(marker));
}

function validateQuoteUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return { ok: false, reason: "invalid quote URL" };
  }
  if (parsed.hostname.toLowerCase() === DEPRECATED_JUPITER_QUOTE_HOST) {
    return { ok: false, reason: "deprecated Jupiter quote host blocked" };
  }
  if (parsed.pathname.includes("/v6")) {
    return { ok: false, reason: "Jupiter v6 quote path blocked" };
  }
  if (isForbiddenUrlPath(parsed.pathname)) {
    return { ok: false, reason: "forbidden Jupiter quote path" };
  }
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  if (!pathname.endsWith("/quote")) {
    return { ok: false, reason: "quote URL must end with /quote" };
  }
  if (!pathname.includes("/swap/v1/")) {
    return { ok: false, reason: "quote URL must use /swap/v1/ API generation" };
  }
  return { ok: true, pathname, host: parsed.hostname };
}

function validateSwapUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return { ok: false, reason: "invalid swap URL" };
  }
  if (parsed.hostname.toLowerCase() === DEPRECATED_JUPITER_QUOTE_HOST) {
    return { ok: false, reason: "deprecated Jupiter host blocked" };
  }
  if (parsed.pathname.includes("/v6")) {
    return { ok: false, reason: "Jupiter v6 swap path blocked" };
  }
  if (isForbiddenUrlPath(parsed.pathname)) {
    return { ok: false, reason: "forbidden Jupiter swap path" };
  }
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  if (!pathname.endsWith("/swap")) {
    return { ok: false, reason: "swap URL must end with /swap" };
  }
  if (!pathname.includes("/swap/v1/")) {
    return { ok: false, reason: "swap URL must use /swap/v1/ API generation" };
  }
  return { ok: true, pathname, host: parsed.hostname };
}

function buildQuoteRequestUrl(baseUrl, params) {
  const normalized = assertSupportedSwapV1Base(baseUrl);
  const url = `${normalized}${JUPITER_QUOTE_PATH}?${params.toString()}`;
  const check = validateQuoteUrl(url);
  if (!check.ok) {
    throw new JupiterClientError("JUPITER_QUOTE_URL_INVALID", check.reason, { url: normalized });
  }
  return url;
}

function buildSwapRequestUrl(baseUrl) {
  const normalized = assertSupportedSwapV1Base(baseUrl);
  const url = `${normalized}${JUPITER_SWAP_PATH}`;
  const check = validateSwapUrl(url);
  if (!check.ok) {
    throw new JupiterClientError("JUPITER_SWAP_URL_INVALID", check.reason, { url: normalized });
  }
  return url;
}

function assertQuoteBuildHostMatch(quoteBaseUrl, swapBaseUrl) {
  const quoteBase = assertSupportedSwapV1Base(quoteBaseUrl);
  const swapBase = assertSupportedSwapV1Base(swapBaseUrl);
  if (quoteBase !== swapBase) {
    throw new JupiterClientError(
      "JUPITER_HOST_MISMATCH",
      "Quote and swap-build must use the same Jupiter base URL.",
      { quoteBase, swapBase }
    );
  }
  return quoteBase;
}

function quoteRouteFingerprint(quote) {
  if (!quote || !Array.isArray(quote.routePlan)) return null;
  return JSON.stringify(quote.routePlan.map(step => ({
    label: step?.swapInfo?.label ?? null,
    percent: step?.percent ?? null,
    ammKey: step?.swapInfo?.ammKey ?? null
  })));
}

function validateQuoteSchema(quote) {
  const requiredFields = [
    "inputMint", "outputMint", "inAmount", "outAmount",
    "otherAmountThreshold", "priceImpactPct", "slippageBps"
  ];
  if (!quote || requiredFields.some(field => quote[field] === undefined || quote[field] === null) ||
      !Array.isArray(quote.routePlan) || quote.routePlan.length === 0) {
    throw new JupiterClientError("JUPITER_QUOTE_MALFORMED", "Jupiter quote response is empty or malformed.");
  }
  return quote;
}

function attachQuoteMetadata(quote, { baseUrl, fetchedAtMs = Date.now() }) {
  const normalizedBase = assertSupportedSwapV1Base(baseUrl);
  quote._jupiterBaseUrl = normalizedBase;
  quote._fetchedAtMs = fetchedAtMs;
  quote._routeFingerprint = quoteRouteFingerprint(quote);
  return quote;
}

function buildJupiterHeaders(extraHeaders = {}) {
  const headers = { Accept: "application/json", ...extraHeaders };
  if (process.env.JUPITER_API_KEY) headers["x-api-key"] = process.env.JUPITER_API_KEY;
  return headers;
}

function assertQuoteBuildConsistency(quote, context = {}) {
  if (!quote?._jupiterBaseUrl) {
    throw new JupiterClientError(
      "JUPITER_QUOTE_METADATA_MISSING",
      "Quote is missing Jupiter base URL metadata."
    );
  }
  const swapBase = context.swapBaseUrl || quote._jupiterBaseUrl;
  assertQuoteBuildHostMatch(quote._jupiterBaseUrl, swapBase);

  if (context.inputMint && quote.inputMint !== context.inputMint) {
    throw new JupiterClientError("JUPITER_QUOTE_BUILD_MISMATCH", "Quote input mint mismatch.");
  }
  if (context.outputMint && quote.outputMint !== context.outputMint) {
    throw new JupiterClientError("JUPITER_QUOTE_BUILD_MISMATCH", "Quote output mint mismatch.");
  }
  if (context.inAmount && String(quote.inAmount) !== String(context.inAmount)) {
    throw new JupiterClientError("JUPITER_QUOTE_BUILD_MISMATCH", "Quote input amount mismatch.");
  }
  if (context.walletPublicAddress && quote._buildWalletPublicAddress &&
      context.walletPublicAddress !== quote._buildWalletPublicAddress) {
    throw new JupiterClientError("JUPITER_QUOTE_BUILD_MISMATCH", "Quote/build wallet mismatch.");
  }
  if (Number.isFinite(Number(context.slippageBps)) &&
      Number(quote.slippageBps) !== Number(context.slippageBps)) {
    throw new JupiterClientError("JUPITER_QUOTE_BUILD_MISMATCH", "Quote slippage mismatch.");
  }
  return true;
}

async function fetchJupiterQuote({
  fetchFn,
  baseUrl,
  inputMint,
  outputMint,
  amount,
  slippageBps,
  swapMode = "ExactIn",
  signal
}) {
  if (typeof fetchFn !== "function") {
    throw new JupiterClientError("JUPITER_FETCH_UNAVAILABLE", "Quote fetch function is unavailable.");
  }
  const resolvedBase = resolveJupiterBaseUrl(
    baseUrl ? { jupiterBaseUrl: baseUrl } : {}
  );
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amount),
    slippageBps: String(slippageBps),
    swapMode
  });
  const url = buildQuoteRequestUrl(resolvedBase, params);
  const fetchedAtMs = Date.now();
  let response;
  try {
    response = await fetchFn(url, {
      method: "GET",
      headers: buildJupiterHeaders(),
      signal
    });
  } catch (error) {
    throw new JupiterClientError(
      "JUPITER_QUOTE_HTTP_FAILED",
      "Jupiter quote HTTP request failed.",
      { reason: error?.message || String(error) }
    );
  }
  if (!response || response.ok !== true) {
    throw new JupiterClientError("JUPITER_QUOTE_HTTP_FAILED", "Jupiter quote HTTP request failed.");
  }
  let quote;
  try {
    quote = await response.json();
  } catch (error) {
    throw new JupiterClientError(
      "JUPITER_QUOTE_JSON_FAILED",
      "Jupiter quote JSON parse failed.",
      { reason: error?.message || String(error) }
    );
  }
  validateQuoteSchema(quote);
  return attachQuoteMetadata(quote, { baseUrl: resolvedBase, fetchedAtMs });
}

function buildSwapRequestBody(quote, {
  walletPublicAddress,
  priorityFeeLamports,
  computeUnitLimit
}) {
  assertQuoteBuildConsistency(quote, {
    swapBaseUrl: quote._jupiterBaseUrl,
    walletPublicAddress
  });
  return {
    quoteResponse: quote,
    userPublicKey: walletPublicAddress,
    wrapAndUnwrapSol: true,
    asLegacyTransaction: false,
    slippageBps: Number(quote.slippageBps),
    prioritizationFeeLamports: Number(priorityFeeLamports),
    dynamicComputeUnitLimit: false,
    skipUserAccountsRpcCalls: false,
    ...(Number.isInteger(computeUnitLimit) && computeUnitLimit > 0
      ? { computeUnitLimit }
      : {})
  };
}

function estimateSingleEntryNonRentCostSol({
  positionSizeSol = 0.005,
  priorityFeeLamports,
  cfg = {}
}) {
  const tradeNotionalSol = Number(positionSizeSol);
  const maxPriorityCap = Number(cfg.maxPriorityFeeLamports ?? 1_000_000);
  const appliedPriorityLamports = Math.min(
    Number.isFinite(Number(priorityFeeLamports)) ? Number(priorityFeeLamports) : maxPriorityCap,
    maxPriorityCap
  );
  const priorityFeeSol = appliedPriorityLamports / LAMPORTS_PER_SOL;
  const baseFeeSol = LAMPORTS_PER_SIGNATURE / LAMPORTS_PER_SOL;
  const nonRefundableFeeSol = baseFeeSol + priorityFeeSol;
  const walletDebitUpperBoundSol = tradeNotionalSol + nonRefundableFeeSol;
  return Object.freeze({
    tradeNotionalSol,
    baseFeeSol,
    priorityFeeSol,
    platformOrRouteFeeSol: null,
    ataRentSol: null,
    ataRentRefundable: true,
    slippageReserveSol: null,
    nonRefundableFeeSol,
    nonRentSingleEntryFeeSol: nonRefundableFeeSol,
    walletDebitUpperBoundSol,
    excludesExitFees: true,
    doubleCountPriorityFee: false
  });
}

function estimateSingleEntryFeeBudget({ positionSizeSol, cfg, priorityFee }) {
  return estimateSingleEntryNonRentCostSol({
    positionSizeSol,
    priorityFeeLamports: priorityFee?.appliedPriorityFeeLamports ?? cfg?.maxPriorityFeeLamports,
    cfg
  });
}

module.exports = {
  JupiterClientError,
  JUPITER_SWAP_BASE_DEFAULT,
  JUPITER_SWAP_BASE_PRO,
  DEPRECATED_JUPITER_QUOTE_HOST,
  JUPITER_QUOTE_PATH,
  JUPITER_SWAP_PATH,
  LAMPORTS_PER_SOL,
  normalizeBaseUrl,
  resolveJupiterBaseUrl,
  assertSupportedSwapV1Base,
  validateQuoteUrl,
  validateSwapUrl,
  buildQuoteRequestUrl,
  buildSwapRequestUrl,
  assertQuoteBuildHostMatch,
  quoteRouteFingerprint,
  validateQuoteSchema,
  attachQuoteMetadata,
  buildJupiterHeaders,
  assertQuoteBuildConsistency,
  fetchJupiterQuote,
  buildSwapRequestBody,
  estimateSingleEntryNonRentCostSol,
  estimateSingleEntryFeeBudget
};
