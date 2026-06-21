"use strict";

const fs = require("fs");
const executor = require("./live_executor");

const simulation = executor.__simulationTest;
const codes = executor.__executionLoggingTest.EXECUTION_ABORT_CODES;
const auditFile = executor.FILES.EXECUTION_AUDIT_FILE;
const fakeApiKey = "fake-step8-api-key";
const originalSolanaRpc = process.env.SOLANA_RPC_URL;
let requests = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectFailure(rawErr) {
  simulation.setSimulationFetchForTest(async (endpoint, options) => {
    requests.push({ endpoint, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ result: { context: { slot: 99 }, value: { err: rawErr, logs: ["Program failed"], unitsConsumed: 120000 } } }) };
  });
  try {
    process.env.SOLANA_RPC_URL = `https://rpc.invalid/?api-key=${fakeApiKey}`;
    await simulation.simulateSwapTx(makeBuiltSwap(), cfg);
  } catch (error) {
    assert(error.code === codes.SIMULATION_FAILED, "expected SIMULATION_FAILED");
    assert(JSON.stringify(error.extra.rawErr) === JSON.stringify(rawErr), "raw simulation error not preserved");
    return;
  }
  throw new Error("failed simulation unexpectedly passed");
}

function makeBuiltSwap() {
  return Object.freeze({
    transaction: Object.freeze({ serializedBytes: Uint8Array.from([1, 2, 3, 4]) }),
    metadata: Object.freeze({ quoteHash: "quote-hash-step8" })
  });
}

const cfg = Object.freeze({ assumedComputeUnitLimit: 300000 });

(async () => {
  try {
    process.env.SOLANA_RPC_URL = `https://rpc.invalid/?api-key=${fakeApiKey}`;
    assert(simulation, "simulation test interface missing");
    const poisonSigner = Object.defineProperties({}, {
      sign: { get() { throw new Error("sign accessed"); } },
      secretKey: { get() { throw new Error("secretKey accessed"); } },
      privateKey: { get() { throw new Error("privateKey accessed"); } }
    });
    const built = { ...makeBuiltSwap(), signer: poisonSigner };
    simulation.setSimulationFetchForTest(async (endpoint, options) => {
      requests.push({ endpoint, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ result: { context: { slot: 42 }, value: { err: null, logs: ["Program success"], unitsConsumed: 180000, returnData: null } } }) };
    });

    const first = await simulation.simulateSwapTx(built, cfg);
    const second = await simulation.simulateSwapTx(built, cfg);
    assert(first.success && second.success, "successful simulation did not return success");
    assert(first.unitsConsumed === 180000 && first.cuHeadroomVsAssumed === 0.4, "compute-unit result incorrect");
    assert(requests.length === 2, "simulation was cached");
    for (const request of requests) {
      assert(request.body.method === "simulateTransaction", "wrong RPC method");
      const options = request.body.params[1];
      assert(options.sigVerify === false, "sigVerify=false missing");
      assert(options.replaceRecentBlockhash === false, "replaceRecentBlockhash=false missing");
      assert(options.commitment === "confirmed", "confirmed commitment missing");
      assert(options.encoding === "base64", "base64 encoding missing");
      assert(options.innerInstructions === false, "innerInstructions=false missing");
      assert(!Object.hasOwn(options, "accounts") && !Object.hasOwn(options, "minContextSlot"), "unexpected simulation option");
    }

    requests = [];
    await expectFailure("BlockhashNotFound");
    await expectFailure({ InstructionError: [0, { Custom: 6001 }] });
    await expectFailure("InsufficientFundsForRent");

    simulation.setSimulationFetchForTest(async (endpoint, options) => {
      requests.push({ endpoint, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ result: { unexpected: true }, apiKey: fakeApiKey }) };
    });
    await expectFailureFromMalformedResponse();

    const auditText = fs.readFileSync(auditFile, "utf8");
    const rows = auditText.split(/\r?\n/).filter(Boolean).map(JSON.parse)
      .filter(row => row.stage === "SIMULATION" && row.payload?.quoteHash === "quote-hash-step8");
    assert(rows.length >= 5, "fresh simulation audit entries missing");
    assert(rows.some(row => row.payload.success && row.payload.unitsConsumed === 180000 && row.payload.cuHeadroomVsAssumed === 0.4), "success audit incomplete");
    assert(rows.some(row => row.payload.malformedResponse === true && row.payload.rawResponseShape), "malformed response audit missing");
    assert(!auditText.includes(fakeApiKey), "simulation audit leaked API key");
    assert(auditText.includes("[REDACTED]"), "simulation audit did not positively prove endpoint redaction");

    const source = fs.readFileSync(require.resolve("./live_executor"), "utf8");
    assert(!source.includes("sigVerify: true"), "sigVerify=true exists");
    for (const forbidden of ["sendTransaction(", "sendRawTransaction(", "signTransaction(", "partialSign(", "addSignature(", "nacl.sign("]) {
      assert(!source.includes(forbidden), `forbidden method exists: ${forbidden}`);
    }
    const cryptoSignMatches = source.match(/crypto\.sign\(/g) || [];
    assert(cryptoSignMatches.length === 1, `expected exactly one crypto.sign( call site, found ${cryptoSignMatches.length}`);
    const signerHelperMatch = source.match(/function loadSignerFromEnvForRealExecution[\s\S]*?\n}\n\n\/\/ ─── Jupiter/);
    assert(signerHelperMatch && signerHelperMatch[0].includes("crypto.sign(null, Buffer.from(messageBytes), privateKeyObj)"),
      "crypto.sign( is not confined to loadSignerFromEnvForRealExecution returned signer");

    console.log("SIMULATION TEST PASSED");
    console.log("Unsigned fresh RPC simulations verified; signer material untouched; signing/submission calls: 0");
  } finally {
    simulation.resetSimulationFetchForTest();
    if (originalSolanaRpc === undefined) delete process.env.SOLANA_RPC_URL;
    else process.env.SOLANA_RPC_URL = originalSolanaRpc;
  }
})().catch(error => {
  console.error("SIMULATION TEST FAILED:", error.message);
  process.exitCode = 1;
});

async function expectFailureFromMalformedResponse() {
  try {
    await simulation.simulateSwapTx(makeBuiltSwap(), cfg);
  } catch (error) {
    assert(error.code === codes.SIMULATION_FAILED, "malformed response did not produce SIMULATION_FAILED");
    assert(error.extra.malformedResponse === true, "malformed response typing not preserved");
    return;
  }
  throw new Error("malformed simulation response unexpectedly passed");
}
