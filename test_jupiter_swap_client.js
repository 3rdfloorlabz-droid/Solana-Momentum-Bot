"use strict";

const client = require("./jupiter_swap_client");
const executor = require("./live_executor");

const feeTest = executor.__feeAccountingTest;
const cfg = {
  maxPriorityFeeLamports: 1_000_000,
  fallbackPriorityFeeLamports: 200_000,
  assumedComputeUnitLimit: 300_000
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectJupiterError(code, fn) {
  try {
    fn();
  } catch (error) {
    assert(error.code === code, `expected ${code}, received ${error.code || error.name}`);
    return;
  }
  throw new Error(`expected ${code}, but call succeeded`);
}

function quoteFixture(overrides = {}) {
  return {
    inputMint: "So11111111111111111111111111111111111111112",
    outputMint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    inAmount: "5000000",
    outAmount: "900000",
    otherAmountThreshold: "873000",
    priceImpactPct: "0.5",
    slippageBps: 300,
    routePlan: [{ swapInfo: { label: "MOCK", ammKey: "amm1" }, percent: 100 }],
    _jupiterBaseUrl: client.JUPITER_SWAP_BASE_DEFAULT,
    _fetchedAtMs: Date.now(),
    ...overrides
  };
}

(async () => {
  assert(client.resolveJupiterBaseUrl({}) === client.JUPITER_SWAP_BASE_DEFAULT, "default base must be lite-api");
  assert(
    client.resolveJupiterBaseUrl({ useProJupiterBase: true }) === client.JUPITER_SWAP_BASE_PRO,
    "pro base must be api.jup.ag"
  );

  const quoteUrl = client.buildQuoteRequestUrl(client.JUPITER_SWAP_BASE_DEFAULT, new URLSearchParams({
    inputMint: "a", outputMint: "b", amount: "1", slippageBps: "100"
  }));
  assert(quoteUrl.startsWith(`${client.JUPITER_SWAP_BASE_DEFAULT}/quote`), "quote URL must use /swap/v1/quote");
  const swapUrl = client.buildSwapRequestUrl(client.JUPITER_SWAP_BASE_DEFAULT);
  assert(swapUrl === `${client.JUPITER_SWAP_BASE_DEFAULT}/swap`, "swap URL must use /swap/v1/swap");

  expectJupiterError("JUPITER_HOST_DEPRECATED", () =>
    client.assertSupportedSwapV1Base("https://quote-api.jup.ag/v6/quote")
  );
  expectJupiterError("JUPITER_API_GENERATION_MISMATCH", () =>
    client.assertSupportedSwapV1Base("https://lite-api.jup.ag/v6/quote")
  );
  expectJupiterError("JUPITER_HOST_MISMATCH", () =>
    client.assertQuoteBuildHostMatch(client.JUPITER_SWAP_BASE_DEFAULT, client.JUPITER_SWAP_BASE_PRO)
  );

  const quote = quoteFixture();
  client.assertQuoteBuildConsistency(quote, {
    swapBaseUrl: client.JUPITER_SWAP_BASE_DEFAULT,
    inputMint: quote.inputMint,
    outputMint: quote.outputMint,
    inAmount: quote.inAmount,
    slippageBps: quote.slippageBps
  });

  let capturedUrl = null;
  const fetched = await client.fetchJupiterQuote({
    fetchFn: async url => {
      capturedUrl = url;
      return { ok: true, json: async () => quoteFixture({ _jupiterBaseUrl: undefined }) };
    },
    inputMint: quote.inputMint,
    outputMint: quote.outputMint,
    amount: 5_000_000,
    slippageBps: 300
  });
  assert(capturedUrl.startsWith(`${client.JUPITER_SWAP_BASE_DEFAULT}/quote`), "fetchJupiterQuote must hit unified base");
  assert(fetched._jupiterBaseUrl === client.JUPITER_SWAP_BASE_DEFAULT, "quote metadata must record base");
  assert(typeof fetched._routeFingerprint === "string", "route fingerprint must be attached");

  const estimate = client.estimateSingleEntryNonRentCostSol({
    positionSizeSol: 0.005,
    priorityFeeLamports: 1_000_000,
    cfg
  });
  assert(estimate.tradeNotionalSol === 0.005, "trade notional must be 0.005 SOL");
  assert(estimate.priorityFeeSol === 0.001, "priority fee must cap at 0.001 SOL");
  assert(Math.abs(estimate.baseFeeSol - 0.000005) < 1e-9, "base fee must be ~5000 lamports");
  assert(Math.abs(estimate.walletDebitUpperBoundSol - 0.006005) < 1e-9, "single-entry upper bound must be ~0.006005 SOL");
  assert(estimate.doubleCountPriorityFee === false, "priority fee must not be double-counted");
  assert(estimate.excludesExitFees === true, "single-entry estimate must exclude exit fees");

  const budget = feeTest.estimateSingleEntryFeeBudget({
    positionSizeSol: 0.005,
    cfg,
    priorityFee: { appliedPriorityFeeLamports: 250_000 }
  });
  assert(budget.priorityFeeSol === 0.00025, "budget must use applied priority fee when provided");
  assert(budget.walletDebitUpperBoundSol === 0.005 + 0.00025 + 0.000005, "budget wallet debit must decompose correctly");

  console.log("JUPITER SWAP CLIENT TEST PASSED");
})().catch(error => {
  console.error("JUPITER SWAP CLIENT TEST FAILED:", error.message);
  process.exitCode = 1;
});
