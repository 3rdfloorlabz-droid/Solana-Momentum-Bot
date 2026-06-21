"use strict";

const fs = require("fs");
const executor = require("./live_executor");

const test = executor.__executionLoggingTest;
const auditFile = executor.FILES.EXECUTION_AUDIT_FILE;
const errorsFile = executor.FILES.ERRORS_FILE;
const runId = `execution-logging-test-${Date.now()}`;
const fakeApiKey = "fake-api-key-STEP3-should-never-appear";
const fakeBase58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const realWalletAddress = "FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6";
const realTokenMint = "So11111111111111111111111111111111111111112";
const realTxSig = "5xYbKQv9tTWgGm6XxVJDW8Yxg6WQo7jB3f5aXQnV2yqF3gTnPv7xKp9qMzQfYg1vB2rDs9HkLq7nZc4xPa8m";
const fakeBytes = Array.from({ length: 64 }, (_, index) => index);
let transactionMethodCalls = 0;
const originalFetch = global.fetch;
global.fetch = async () => {
  transactionMethodCalls += 1;
  throw new Error("Network methods must not be called by execution logging tests");
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJsonl(file) {
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

try {
  assert(test, "test logging interface missing");
  assert(!Object.hasOwn(test, "submitSwap"), "test interface must not expose submitSwap");

  test.logExecutionStage(test.EXECUTION_STAGES.QUOTE, {
    runId,
    url: `https://rpc.invalid/?api-key=${fakeApiKey}`,
    routeAddress: fakeBase58,
    walletAddress: realWalletAddress,
    tokenMint: realTokenMint,
    txSig: realTxSig,
    secretBytes: fakeBytes
  });
  test.logExecutionFailure(
    test.EXECUTION_ABORT_CODES.QUOTE_FAILED,
    test.EXECUTION_STAGES.QUOTE,
    `Fake quote failed api-key=${fakeApiKey} address=${fakeBase58}`,
    { runId, bytes: fakeBytes, HELIUS_API_KEY: fakeApiKey }
  );

  const auditRows = readJsonl(auditFile);
  const errorRows = readJsonl(errorsFile);
  const audit = auditRows.find(row => row.payload?.runId === runId);
  const failure = errorRows.find(row => row.extra?.runId === runId);
  const combined = JSON.stringify({ audit, failure });
  const directRedaction = test.redactSecrets({
    walletAddress: realWalletAddress,
    tokenMint: realTokenMint,
    txSig: realTxSig,
    url: "https://rpc.invalid/?api_key=secret123",
    apiKey: "secret123",
    privateKey: "secret123",
    secretKey: fakeBytes,
    rawBytes: fakeBytes,
    inlineBytes: JSON.stringify(fakeBytes)
  });

  assert(audit && failure, "test records missing");
  assert(!combined.includes(fakeApiKey), "API key was not redacted");
  assert(combined.includes(fakeBase58), "public base58 value should remain visible");
  assert(combined.includes(realWalletAddress), "wallet address should remain visible");
  assert(combined.includes(realTokenMint), "token mint should remain visible");
  assert(combined.includes(realTxSig), "transaction signature should remain visible");
  assert(!combined.includes(JSON.stringify(fakeBytes)), "byte array was not redacted");
  assert(combined.includes("[REDACTED]"), "generic redaction marker missing");
  assert(!combined.includes("[REDACTED_BASE58]"), "base58 redaction marker should not appear");
  assert(combined.includes("[REDACTED_BYTE_ARRAY]"), "byte-array redaction marker missing");
  assert(directRedaction.walletAddress === realWalletAddress, "direct wallet redaction changed public address");
  assert(directRedaction.tokenMint === realTokenMint, "direct token redaction changed public mint");
  assert(directRedaction.txSig === realTxSig, "direct txSig redaction changed public signature");
  assert(directRedaction.apiKey === "[REDACTED]", "apiKey field not redacted");
  assert(directRedaction.privateKey === "[REDACTED]", "privateKey field not redacted");
  assert(directRedaction.secretKey === "[REDACTED]", "secretKey field not redacted");
  assert(directRedaction.rawBytes === "[REDACTED_BYTE_ARRAY]", "raw byte array not redacted");
  assert(directRedaction.inlineBytes === "[REDACTED_BYTE_ARRAY]", "inline byte-array string not redacted");
  assert(directRedaction.url.includes("api_key=[REDACTED]"), "URL API key query not redacted");
  assert(transactionMethodCalls === 0, "logging test invoked a network/transaction method");

  console.log("EXECUTION LOGGING TEST PASSED");
  console.log("JSONL parsed; fake secrets redacted; transaction methods called: 0");
} finally {
  global.fetch = originalFetch;
}
