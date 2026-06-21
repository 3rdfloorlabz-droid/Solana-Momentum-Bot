"use strict";

const fs = require("fs");
const path = require("path");
const executor = require("./live_executor");

const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, "live_config.json");
const PAPER_FILE = path.join(ROOT, "paper_trades.json");
const pipeline = executor.__pipelineDryRunTest;

function abort(message) {
  console.error(`ABORT: ${message}`);
  process.exitCode = 1;
}

function parseArguments(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--symbol" && argv[index + 1]) args.symbol = argv[++index];
    else if (argv[index] === "--address" && argv[index + 1]) args.address = argv[++index];
    else throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
  }
  if ((args.symbol && args.address) || (!args.symbol && !args.address)) {
    throw new Error("Provide exactly one identifier: --symbol SYMBOL or --address ADDRESS.");
  }
  return args;
}

function readJsonLines(file) {
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${path.basename(file)} line ${index + 1} is invalid JSON: ${error.message}`);
      }
    });
}

function tradeTimestamp(trade) {
  return Date.parse(trade.timestamp || trade.openedAt || trade.createdAt || "");
}

function findMostRecentTrade(trades, identifier) {
  const matches = trades.filter(trade =>
    identifier.symbol
      ? String(trade.symbol || "").toUpperCase() === identifier.symbol.toUpperCase()
      : String(trade.address || "") === identifier.address
  );
  return matches.sort((left, right) => tradeTimestamp(right) - tradeTimestamp(left))[0] || null;
}

function strictThesisFailures(trade, thesis) {
  const failures = [];
  if (thesis.source && trade.source !== thesis.source) {
    failures.push(`source ${trade.source} !== ${thesis.source}`);
  }
  if (!Number.isFinite(Number(trade.score)) ||
      Number(trade.score) < Number(thesis.scoreMin) ||
      Number(trade.score) > Number(thesis.scoreMax)) {
    failures.push(`score ${trade.score} outside ${thesis.scoreMin}-${thesis.scoreMax}`);
  }
  if (!Number.isFinite(Number(trade.marketCap)) ||
      Number(trade.marketCap) < Number(thesis.marketCapMin) ||
      Number(trade.marketCap) > Number(thesis.marketCapMax)) {
    failures.push(`marketCap ${trade.marketCap} outside ${thesis.marketCapMin}-${thesis.marketCapMax}`);
  }
  if (!Number.isFinite(Number(trade.botDegenRate)) ||
      Number(trade.botDegenRate) >= Number(thesis.botDegenRateMax)) {
    failures.push(`botDegenRate ${trade.botDegenRate} must be < ${thesis.botDegenRateMax}`);
  }
  if (!Number.isFinite(Number(trade.top10HolderRate)) ||
      Number(trade.top10HolderRate) < Number(thesis.top10HolderRateMin) ||
      Number(trade.top10HolderRate) > Number(thesis.top10HolderRateMax)) {
    failures.push(`top10HolderRate ${trade.top10HolderRate} outside ${thesis.top10HolderRateMin}-${thesis.top10HolderRateMax}`);
  }
  if (!trade.address) failures.push("token address missing");
  if (!trade.pairAddress) failures.push("pairAddress missing");
  if (!Number.isFinite(Number(trade.entryPrice)) || Number(trade.entryPrice) <= 0) {
    failures.push("entryPrice missing or invalid");
  }
  return failures;
}

function makeIdentityOnlySigner(walletPublicAddress) {
  return Object.defineProperties({
    publicKey: Object.freeze({ toBase58: () => walletPublicAddress })
  }, {
    sign: { get() { throw new Error("HARNESS SAFETY: sign accessed"); } },
    secretKey: { get() { throw new Error("HARNESS SAFETY: secretKey accessed"); } },
    privateKey: { get() { throw new Error("HARNESS SAFETY: privateKey accessed"); } }
  });
}

function printCandidate(trade) {
  const timestamp = trade.timestamp || trade.openedAt || trade.createdAt;
  const ageMs = Number.isFinite(Date.parse(timestamp)) ? Date.now() - Date.parse(timestamp) : null;
  const ageHours = ageMs === null ? null : ageMs / 3600000;
  console.log("Candidate metadata");
  console.log(`  Symbol: ${trade.symbol}`);
  console.log(`  Mint: ${trade.address}`);
  console.log(`  Pair: ${trade.pairAddress}`);
  console.log(`  Score: ${trade.score}`);
  console.log(`  Market cap: ${trade.marketCap}`);
  console.log(`  Bot rate: ${trade.botDegenRate}`);
  console.log(`  Top10 rate: ${trade.top10HolderRate}`);
  console.log(`  Paper timestamp: ${timestamp}`);
  console.log(`  Paper-trade age: ${ageHours === null ? "unknown" : ageHours.toFixed(2) + " hours"}`);
  console.log(`  Historical expectedPrice stand-in: ${trade.entryPrice}`);
  console.log("  WARNING: expectedPrice is historical and is not the current market price.");
}

function printResult(result) {
  const metadata = result.pipelineMetadata || {};
  const fee = metadata.feeBreakdown || {};
  console.log("Result type: success");
  console.log(`  unitsConsumed: ${metadata.unitsConsumed ?? "unavailable"}`);
  console.log(`  cuHeadroomVsAssumed: ${metadata.cuHeadroomVsAssumed ?? "unavailable"}`);
  console.log(`  appliedPriorityFeeLamports: ${metadata.appliedPriorityFeeLamports ?? "unavailable"}`);
  console.log(`  priorityFeeClamped: ${metadata.priorityFeeClamped ?? "unavailable"}`);
  console.log(`  priorityFeeFallbackUsed: ${metadata.priorityFeeFallbackUsed ?? "unavailable"}`);
  console.log(`  lastValidBlockHeight: ${metadata.lastValidBlockHeight ?? "unavailable"}`);
  console.log(`  rawOutputPerInput: ${metadata.rawOutputPerInput ?? "unavailable"}`);
  console.log(`  quotedSlippageBps: ${metadata.quotedSlippageBps ?? "unavailable"}`);
  console.log("  feeBreakdown:");
  console.log(`    baseFeeLamports: ${fee.baseFeeLamports ?? "unavailable"}`);
  console.log(`    priorityFeeLamports: ${fee.priorityFeeLamports ?? "unavailable"}`);
  console.log(`    ataRentLamports: ${fee.ataRentLamports ?? "unavailable"}`);
  console.log(`    ataRentAccounted: ${fee.ataRentAccounted ?? "unavailable"}`);
  console.log(`    ataDetectionMethod: ${fee.ataDetectionMethod ?? "unavailable"}`);
  console.log(`  pipelineLatencyMs: ${result.latencyMs ?? "unavailable"}`);
}

function printTypedAbort(error) {
  console.log(`Result type: typed abort (${error.code})`);
  console.log(`  Code: ${error.code}`);
  console.log(`  Stage: ${error.stage || "unknown"}`);
  console.log(`  Message: ${error.message}`);
  if (error.code === "ROUTE_REJECTED" || error.code === "QUOTE_FAILED") {
    console.log("ROUTE_REJECTED or QUOTE_FAILED: this is expected for old pump.fun tokens with drained liquidity; pipeline aborted correctly");
  } else if (error.code === "ENTRY_SLIPPAGE_BLOCKED" || error.code === "EXIT_SLIPPAGE_BLOCKED") {
    console.log("Slippage exceeded current ceiling: pipeline rejected the route correctly");
  }
}

async function main() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  if (cfg.executionMode !== "PIPELINE_DRY_RUN") {
    abort(`executionMode must be PIPELINE_DRY_RUN. Current: ${cfg.executionMode}`);
    return;
  }
  if (cfg.dryRunMode !== true) {
    abort("dryRunMode must be true.");
    return;
  }

  let identifier;
  try {
    identifier = parseArguments(process.argv.slice(2));
  } catch (error) {
    abort(error.message);
    return;
  }

  let trade;
  try {
    trade = findMostRecentTrade(readJsonLines(PAPER_FILE), identifier);
  } catch (error) {
    abort(error.message);
    return;
  }
  if (!trade) {
    abort(`No paper trade matched ${identifier.symbol ? `symbol ${identifier.symbol}` : `address ${identifier.address}`}.`);
    return;
  }

  const failures = strictThesisFailures(trade, cfg.thesis || {});
  if (failures.length) {
    abort(`Candidate does not match strict Phase 1 thesis:\n- ${failures.join("\n- ")}`);
    return;
  }

  printCandidate(trade);
  console.log("");
  console.log("Starting one-shot PIPELINE_DRY_RUN. No operational position state will be written.");

  pipeline.setSignerLoaderForTest(() => makeIdentityOnlySigner(cfg.walletPublicAddress));
  try {
    const result = await pipeline.submitSwapForTest("BUY", {
      cfg,
      tokenAddress: trade.address,
      pairAddress: trade.pairAddress,
      expectedPrice: trade.entryPrice,
      positionSizeSol: cfg.positionSizeSol
    });
    printResult(result);
  } catch (error) {
    if (error && error.code) {
      printTypedAbort(error);
    } else {
      console.error("Unexpected untyped harness error:", error && error.message ? error.message : error);
      process.exitCode = 1;
    }
  } finally {
    pipeline.resetSignerLoaderForTest();
    console.log("End of harness run. No position state was modified.");
  }
}

main().catch(error => {
  console.error("Unexpected untyped harness error:", error && error.message ? error.message : error);
  process.exitCode = 1;
});
