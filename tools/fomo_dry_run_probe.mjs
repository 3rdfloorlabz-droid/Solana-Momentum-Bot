/**
 * Developer utility only.
 * This script is not part of the live executor path.
 * It must never sign, never submit, never load signer secrets, never change live_config.json, and never create live positions.
 * It is only for real mainnet quote/build/simulation checks in PIPELINE_DRY_RUN-style review.
 *
 * FOMO Engine 01 � PIPELINE_DRY_RUN probe
 *
 * Fetches a real mainnet Jupiter SOL -> USDC quote, builds a swap transaction,
 * and simulates it through the configured RPC.
 *
 * HARD CONSTRAINTS:
 * - Never signs
 * - Never submits
 * - Never uses signer secrets
 * - Never changes live_config.json
 * - Never creates a live position
 */

import {
  Connection,
  PublicKey,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

// --- Endpoints --------------------------------------------------------------

const QUOTE_URL = "https://api.jup.ag/swap/v1/quote";
const SWAP_URL = "https://api.jup.ag/swap/v1/swap";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// --- Env --------------------------------------------------------------------

const RPC_URL = process.env.RPC_URL;
const DRY_RUN_PUBKEY = process.env.DRY_RUN_PUBKEY;

const INPUT_LAMPORTS = Number(process.env.INPUT_LAMPORTS ?? 100_000_000); // 0.1 SOL
const SLIPPAGE_BPS = Number(process.env.SLIPPAGE_BPS ?? 50);
const ASSUMED_CU = Number(process.env.ASSUMED_CU ?? 200_000);
const PRIORITY_FEE = process.env.PRIORITY_FEE ?? "auto";

if (!RPC_URL) {
  throw new Error("Missing required env var: RPC_URL");
}

if (!DRY_RUN_PUBKEY) {
  throw new Error("Missing required env var: DRY_RUN_PUBKEY");
}

if (process.env.SOLANA_SIGNER_SECRET) {
  throw new Error("Refusing to run: SOLANA_SIGNER_SECRET is present. This probe must not use signer secrets.");
}

new PublicKey(DRY_RUN_PUBKEY);

// --- Helpers ----------------------------------------------------------------

function redactUrl(url) {
  return String(url).replace(/api-key=([^&]+)/gi, "api-key=[REDACTED]");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function readBodySafely(response) {
  try {
    return await response.text();
  } catch {
    return "<unable to read response body>";
  }
}

async function requireOk(response, label, urlForLog) {
  if (response.ok) return;

  const body = await readBodySafely(response);

  console.error(`[${label}] HTTP ${response.status} ${response.statusText}`);
  console.error(`[${label}] URL: ${redactUrl(urlForLog)}`);
  console.error(`[${label}] BODY:`);
  console.error(body);

  throw new Error(`${label} failed`);
}

function shortHash(input) {
  let h = 0;
  const s = JSON.stringify(input);
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h).toString(16);
}

// --- Stage 1: Quote ---------------------------------------------------------

async function fetchQuote() {
  const url = new URL(QUOTE_URL);
  url.searchParams.set("inputMint", SOL_MINT);
  url.searchParams.set("outputMint", USDC_MINT);
  url.searchParams.set("amount", String(INPUT_LAMPORTS));
  url.searchParams.set("slippageBps", String(SLIPPAGE_BPS));

  const response = await fetchWithTimeout(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await readBodySafely(response);
    console.error(`[QUOTE] HTTP ${response.status} ${response.statusText}`);
    console.error(`[QUOTE] URL: ${redactUrl(url.toString())}`);
    console.error("[QUOTE] BODY:");
    console.error(body);
    process.exit(1);
  }

  const quote = await response.json();

  if (quote?.error) {
    console.error("[QUOTE] API error:");
    console.error(JSON.stringify(quote, null, 2));
    throw new Error("QUOTE API error");
  }

  if (!quote?.routePlan?.length) {
    console.error("[QUOTE] Empty routePlan:");
    console.error(JSON.stringify(quote, null, 2));
    throw new Error("QUOTE returned no route");
  }

  return quote;
}

// --- Stage 2: Build Transaction ---------------------------------------------

async function buildTransaction(quote) {
  const body = {
    quoteResponse: quote,
    userPublicKey: DRY_RUN_PUBKEY,
    wrapAndUnwrapSol: true,
    asLegacyTransaction: false,
    dynamicComputeUnitLimit: true,
    skipUserAccountsRpcCalls: false,
    prioritizationFeeLamports: PRIORITY_FEE === "auto" ? "auto" : Number(PRIORITY_FEE),
  };

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (process.env.JUPITER_API_KEY) {
    headers["x-api-key"] = process.env.JUPITER_API_KEY;
  }

  const response = await fetchWithTimeout(SWAP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  await requireOk(response, "TX_BUILD", SWAP_URL);

  const swap = await response.json();

  if (!swap?.swapTransaction) {
    console.error("[TX_BUILD] Malformed swap response:");
    console.error(JSON.stringify(swap, null, 2));
    throw new Error("TX_BUILD returned no swapTransaction");
  }

  return swap;
}

// --- Stage 3: Simulate ------------------------------------------------------

async function simulateSwap(swap) {
  const connection = new Connection(RPC_URL, "confirmed");

  const txBytes = Buffer.from(swap.swapTransaction, "base64");
  const tx = VersionedTransaction.deserialize(txBytes);

  // HARD SAFETY RULE:
  // Do not sign. Do not submit. Simulation only.
  const result = await connection.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: false,
    commitment: "confirmed",
  });

  return result.value;
}

// --- Main -------------------------------------------------------------------

async function main() {
  console.log("[FOMO DRY RUN PROBE] started", new Date().toISOString());
  console.log("  pubkey:        ", DRY_RUN_PUBKEY);
  console.log("  inputLamports: ", INPUT_LAMPORTS, `(${INPUT_LAMPORTS / LAMPORTS_PER_SOL} SOL)`);
  console.log("  slippageBps:   ", SLIPPAGE_BPS);
  console.log("  assumedCU:     ", ASSUMED_CU);
  console.log("  priorityFee:   ", PRIORITY_FEE);
  console.log("  rpc:           ", redactUrl(RPC_URL));

  const audit = {
    timestamp: new Date().toISOString(),
    mode: "PIPELINE_DRY_RUN_PROBE",
    realMoneyMoved: false,
    signed: false,
    submitted: false,
    livePositionCreated: false,
    quoteEndpoint: QUOTE_URL,
    swapEndpoint: SWAP_URL,
    rpcEndpoint: redactUrl(RPC_URL),
    QUOTE: null,
    TX_BUILD: null,
    SIMULATION: null,
  };

  console.log("");
  process.stdout.write("[1/3] Fetching quote ... ");
  const quote = await fetchQuote();

  audit.QUOTE = {
    inputMint: quote.inputMint,
    outputMint: quote.outputMint,
    inAmount: quote.inAmount,
    outAmount: quote.outAmount,
    otherAmountThreshold: quote.otherAmountThreshold,
    priceImpactPct: quote.priceImpactPct,
    slippageBps: quote.slippageBps,
    routeCount: quote.routePlan?.length ?? 0,
    routeLabels: (quote.routePlan ?? []).map((r) => r.swapInfo?.label ?? "unknown"),
  };

  console.log("OK");

  console.log("");
  process.stdout.write("[2/3] Building transaction ... ");
  const swap = await buildTransaction(quote);

  audit.TX_BUILD = {
    transactionPresent: true,
    lastValidBlockHeight: swap.lastValidBlockHeight ?? null,
    prioritizationFeeLamports: swap.prioritizationFeeLamports ?? null,
    computeUnitLimit: swap.computeUnitLimit ?? null,
    quoteHash: shortHash(quote),
  };

  console.log("OK");

  console.log("");
  process.stdout.write("[3/3] Simulating transaction ... ");
  const sim = await simulateSwap(swap);

  const unitsConsumed = sim.unitsConsumed ?? null;
  const cuHeadroomVsAssumed =
    Number.isFinite(unitsConsumed) && ASSUMED_CU > 0
      ? (ASSUMED_CU - unitsConsumed) / ASSUMED_CU
      : null;

  audit.SIMULATION = {
    success: sim.err === null,
    rawErr: sim.err,
    logs: sim.logs ?? [],
    unitsConsumed,
    assumedComputeUnitLimit: ASSUMED_CU,
    cuHeadroomVsAssumed,
  };

  console.log("OK");

  console.log("");
  console.log("[FOMO DRY RUN PROBE RESULT]");
  console.log(JSON.stringify(audit, null, 2));

  if (sim.err !== null) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error("[FATAL]", err?.message ?? err);
  process.exitCode = 1;
});
