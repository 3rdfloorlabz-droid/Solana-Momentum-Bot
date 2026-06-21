"use strict";

const fs = require("fs");
const executor = require("./live_executor");

const rpcTest = executor.__simulationTest;
const feeTest = executor.__priorityFeeTest;
const codes = executor.__executionLoggingTest.EXECUTION_ABORT_CODES;
const originals = {
  HELIUS_RPC_URL: process.env.HELIUS_RPC_URL,
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
  HELIUS_API_KEY: process.env.HELIUS_API_KEY,
  fetch: global.fetch
};
const secret = "fake-rpc-resolution-key";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clearRpcEnv() {
  delete process.env.HELIUS_RPC_URL;
  delete process.env.SOLANA_RPC_URL;
  delete process.env.HELIUS_API_KEY;
}

function expectCode(code, fn) {
  try { fn(); } catch (error) {
    assert(error.code === code, `expected ${code}, received ${error.code || error.name}`);
    return;
  }
  throw new Error(`expected ${code}, but call succeeded`);
}

function expectPublicRejection(endpoint, provider = "SOLANA_RPC_URL") {
  clearRpcEnv();
  process.env[provider] = endpoint;
  try {
    rpcTest.resolveRpcEndpoint({}, { requireDedicated: true, purpose: "simulation" });
  } catch (error) {
    assert(error.code === codes.SIMULATION_FAILED, `public endpoint did not produce SIMULATION_FAILED: ${endpoint}`);
    assert(error.extra.rejectedAsPublic.includes(provider), `public provider not diagnosed: ${endpoint}`);
    return;
  }
  throw new Error(`public endpoint unexpectedly accepted: ${endpoint}`);
}

function builtSwap() {
  return { transaction: { serializedBytes: Uint8Array.from([1, 2, 3]) }, metadata: { quoteHash: "rpc-test" } };
}

(async () => {
  try {
    clearRpcEnv();
    process.env.HELIUS_RPC_URL = "https://helius-rpc.invalid";
    process.env.SOLANA_RPC_URL = "https://solana-rpc.invalid";
    let resolved = rpcTest.resolveRpcEndpoint({}, { requireDedicated: true, purpose: "simulation" });
    assert(resolved.provider === "HELIUS_RPC_URL", "HELIUS_RPC_URL was not selected first");

    delete process.env.HELIUS_RPC_URL;
    resolved = rpcTest.resolveRpcEndpoint({}, { requireDedicated: true, purpose: "simulation" });
    assert(resolved.provider === "SOLANA_RPC_URL", "SOLANA_RPC_URL was not selected second");

    delete process.env.SOLANA_RPC_URL;
    process.env.HELIUS_API_KEY = secret;
    resolved = rpcTest.resolveRpcEndpoint({}, { requireDedicated: true, purpose: "simulation" });
    assert(resolved.provider === "HELIUS_API_KEY_DERIVED" && resolved.endpoint.includes(secret), "Helius API-key URL not derived");

    clearRpcEnv();
    resolved = rpcTest.resolveRpcEndpoint({}, { requireDedicated: false, purpose: "balance_read" });
    assert(resolved.provider === "PUBLIC_FALLBACK" && resolved.publicFallbackUsed === true, "public fallback not allowed for read-only mode");
    expectCode(codes.SIMULATION_FAILED, () =>
      rpcTest.resolveRpcEndpoint({}, { requireDedicated: true, purpose: "simulation" })
    );
    process.env.SOLANA_RPC_URL = rpcTest.PUBLIC_SOLANA_RPC_ENDPOINT;
    expectCode(codes.SIMULATION_FAILED, () =>
      rpcTest.resolveRpcEndpoint({}, { requireDedicated: true, purpose: "simulation" })
    );
    expectCode(codes.PRIORITY_FEE_UNAVAILABLE, () =>
      rpcTest.resolveRpcEndpoint({}, { requireDedicated: true, purpose: "priority_fee" })
    );
    for (const endpoint of [
      "https://api.mainnet-beta.solana.com",
      "https://api.mainnet-beta.solana.com/",
      "http://api.mainnet-beta.solana.com",
      "https://API.MAINNET-BETA.SOLANA.COM",
      "https://api.mainnet-beta.solana.com?commitment=confirmed",
      "https://api.devnet.solana.com",
      "https://api.testnet.solana.com"
    ]) expectPublicRejection(endpoint);

    clearRpcEnv();
    process.env.HELIUS_RPC_URL = "https://mainnet.helius-rpc.com/?api-key=legitimate-test-key";
    resolved = rpcTest.resolveRpcEndpoint({}, { requireDedicated: true, purpose: "simulation" });
    assert(resolved.provider === "HELIUS_RPC_URL", "legitimate Helius endpoint rejected");

    clearRpcEnv();
    await assertRejectCode(codes.SIMULATION_FAILED, () => rpcTest.simulateSwapTx(builtSwap(), { assumedComputeUnitLimit: 300000 }));
    await assertRejectCode(codes.PRIORITY_FEE_UNAVAILABLE, () => feeTest.resolvePriorityFee({
      priorityFeeMode: "dynamic_helius",
      maxPriorityFeeLamports: 1000000,
      fallbackPriorityFeeLamports: 200000,
      assumedComputeUnitLimit: 300000
    }));

    let balanceEndpoint = null;
    global.fetch = async endpoint => {
      balanceEndpoint = endpoint;
      return { json: async () => ({ result: { value: 1000000000 } }) };
    };
    const balance = await executor.getWalletBalanceSol({ walletPublicAddress: "11111111111111111111111111111111", dryRunMode: true });
    assert(balance === 1 && balanceEndpoint === rpcTest.PUBLIC_SOLANA_RPC_ENDPOINT, "dry-run balance read did not use permitted public fallback");

    const audit = fs.readFileSync(executor.FILES.EXECUTION_AUDIT_FILE, "utf8");
    assert(!audit.includes(secret), "RPC endpoint audit leaked API key");
    assert(audit.includes("[REDACTED]"), "RPC endpoint audit did not prove API-key redaction");
    assert(audit.includes('"provider":"PUBLIC_FALLBACK"'), "public fallback provider was not logged");
    assert(audit.includes('"publicFallbackUsed":true'), "public fallback use was not logged");
    assert(audit.includes('"rejectedAsPublic":["SOLANA_RPC_URL"]'), "public endpoint refusal diagnostics missing");
    assert(audit.includes('"configuredProvidersPresent":["SOLANA_RPC_URL"]'), "configured provider refusal diagnostics missing");

    console.log("RPC ENDPOINT RESOLUTION TEST PASSED");
    console.log("Dedicated RPC enforcement and read-only public fallback verified; network calls mocked.");
  } finally {
    for (const name of ["HELIUS_RPC_URL", "SOLANA_RPC_URL", "HELIUS_API_KEY"]) {
      if (originals[name] === undefined) delete process.env[name];
      else process.env[name] = originals[name];
    }
    global.fetch = originals.fetch;
  }
})().catch(error => {
  console.error("RPC ENDPOINT RESOLUTION TEST FAILED:", error.message);
  process.exitCode = 1;
});

async function assertRejectCode(code, fn) {
  try { await fn(); } catch (error) {
    assert(error.code === code, `expected ${code}, received ${error.code || error.name}`);
    return;
  }
  throw new Error(`expected ${code}, but call succeeded`);
}
