"use strict";

const fs = require("fs");
const path = require("path");

const {
  runA4ReadOnlyRpcProof, PROOF_STATUS, ERROR_CODES, DEFAULT_METHOD,
  sanitizeA4RpcProofForAudit, buildA4RpcProofAuditEvent,
  A4_PROOF_PRODUCER, A4_PROOF_EVENT_TYPE, A4_PROOF_AUDIT_ALLOWED_KEYS
} = require("./a4_rpc_proof");

const FAKE_ENDPOINT = "https://secret.example/?api-key=FAKE_SECRET";
const FAKE_SECRET_STRINGS = ["secret.example", "FAKE_SECRET", "api-key", "https://", "Bearer FAKE_TOKEN"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoSecrets(result) {
  const serialized = JSON.stringify(result);
  for (const s of FAKE_SECRET_STRINGS) {
    assert(!serialized.includes(s), `result leaked secret-like string: ${s}`);
  }
}

// Fake resolver that mimics live_executor.resolveRpcEndpoint success shape.
function dedicatedResolver(provider) {
  return () => ({ endpoint: FAKE_ENDPOINT, provider, purpose: "a4_proof", requireDedicated: true, publicFallbackUsed: false });
}

// Fake resolver that throws like the executor refusal (no dedicated provider).
function refusingResolver(extra) {
  return () => {
    const err = new Error("Dedicated RPC endpoint required; public mainnet-beta fallback refused.");
    err.code = "SIMULATION_FAILED";
    err.extra = extra;
    throw err;
  };
}

function fakeResponse({ ok = true, json }) {
  return {
    ok,
    json: async () => json
  };
}

function makeCountingFetch(response) {
  let calls = 0;
  const fn = async () => { calls += 1; return response; };
  fn.getCalls = () => calls;
  return fn;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// 1. success → metadata only
test("proof_success_returns_metadata_only", async () => {
  const fetchImpl = makeCountingFetch(fakeResponse({ ok: true, json: { jsonrpc: "2.0", id: 1, result: 284512345 } }));
  const result = await runA4ReadOnlyRpcProof({
    resolveEndpoint: dedicatedResolver("HELIUS_RPC_URL"),
    fetchImpl
  });
  assert(result.proofStatus === PROOF_STATUS.OK, `expected OK, got ${result.proofStatus}`);
  assert(result.slotObserved === true, "slotObserved should be true");
  assert(result.slotValuePresent === true, "slotValuePresent should be true");
  assert(result.providerLabel === "helius_rpc_url_configured", "provider label mismatch");
  assert(result.endpointClass === "dedicated", "endpointClass should be dedicated");
  assert(result.errorCode === null, "errorCode should be null on success");
  assert(!("slot" in result) && !("slotValue" in result), "raw slot value must not be returned");
  assertNoSecrets(result);
});

// 2. never returns raw url/key
test("proof_does_not_return_raw_url_or_key", async () => {
  const fetchImpl = makeCountingFetch(fakeResponse({ ok: true, json: { result: 12345 } }));
  const result = await runA4ReadOnlyRpcProof({
    resolveEndpoint: dedicatedResolver("HELIUS_RPC_URL"),
    fetchImpl
  });
  assertNoSecrets(result);
});

// 3. fail closed without provider
test("proof_fails_closed_without_provider", async () => {
  const fetchImpl = makeCountingFetch(fakeResponse({ ok: true, json: { result: 1 } }));
  const result = await runA4ReadOnlyRpcProof({
    resolveEndpoint: refusingResolver({ rejectedAsPublic: [], configuredProvidersPresent: [], publicFallbackUsed: false }),
    fetchImpl
  });
  assert(result.proofStatus === PROOF_STATUS.FAILED, "should fail");
  assert(result.errorCode === ERROR_CODES.NOT_CONFIGURED, `expected RPC_NOT_CONFIGURED, got ${result.errorCode}`);
  assert(fetchImpl.getCalls() === 0, "no fetch call should be made without provider");
  assertNoSecrets(result);
});

// 4. block public fallback
test("proof_blocks_public_fallback", async () => {
  const fetchImpl = makeCountingFetch(fakeResponse({ ok: true, json: { result: 1 } }));
  const result = await runA4ReadOnlyRpcProof({
    resolveEndpoint: refusingResolver({ rejectedAsPublic: ["SOLANA_RPC_URL"], configuredProvidersPresent: ["SOLANA_RPC_URL"], publicFallbackUsed: false }),
    fetchImpl
  });
  assert(result.proofStatus === PROOF_STATUS.FAILED, "should fail");
  assert(result.errorCode === ERROR_CODES.PUBLIC_FALLBACK_BLOCKED, `expected RPC_PUBLIC_FALLBACK_BLOCKED, got ${result.errorCode}`);
  assert(result.publicFallbackUsed === true, "publicFallbackUsed should reflect safe evidence");
  assert(fetchImpl.getCalls() === 0, "no fetch call should be made on public fallback");
  assertNoSecrets(result);
});

// 5. sanitize timeout
test("proof_sanitizes_timeout", async () => {
  const fetchImpl = async () => {
    const err = new Error(`connect timeout to ${FAKE_ENDPOINT}`);
    err.name = "AbortError";
    throw err;
  };
  const result = await runA4ReadOnlyRpcProof({
    resolveEndpoint: dedicatedResolver("HELIUS_RPC_URL"),
    fetchImpl
  });
  assert(result.proofStatus === PROOF_STATUS.FAILED, "should fail");
  assert(
    result.errorCode === ERROR_CODES.TIMEOUT || result.errorCode === ERROR_CODES.NETWORK_ERROR,
    `expected timeout/network, got ${result.errorCode}`
  );
  assertNoSecrets(result);
});

// 5b. actual timer-based timeout path
test("proof_sanitizes_real_timeout_timer", async () => {
  const fetchImpl = () => new Promise(() => {}); // never resolves
  const result = await runA4ReadOnlyRpcProof({
    resolveEndpoint: dedicatedResolver("HELIUS_RPC_URL"),
    fetchImpl,
    timeoutMs: 20
  });
  assert(result.proofStatus === PROOF_STATUS.FAILED, "should fail on timeout");
  assert(result.errorCode === ERROR_CODES.TIMEOUT, `expected RPC_TIMEOUT, got ${result.errorCode}`);
  assertNoSecrets(result);
});

// 6. sanitize http error
test("proof_sanitizes_http_error", async () => {
  const fetchImpl = makeCountingFetch(fakeResponse({ ok: false, json: { note: FAKE_ENDPOINT } }));
  const result = await runA4ReadOnlyRpcProof({
    resolveEndpoint: dedicatedResolver("HELIUS_RPC_URL"),
    fetchImpl
  });
  assert(result.errorCode === ERROR_CODES.HTTP_ERROR, `expected RPC_HTTP_ERROR, got ${result.errorCode}`);
  assertNoSecrets(result);
});

// 7. sanitize json-rpc error (message contains fake secret)
test("proof_sanitizes_json_rpc_error", async () => {
  const fetchImpl = makeCountingFetch(fakeResponse({
    ok: true,
    json: { jsonrpc: "2.0", id: 1, error: { code: -32000, message: `boom ${FAKE_ENDPOINT}` } }
  }));
  const result = await runA4ReadOnlyRpcProof({
    resolveEndpoint: dedicatedResolver("HELIUS_RPC_URL"),
    fetchImpl
  });
  assert(result.errorCode === ERROR_CODES.JSON_ERROR, `expected RPC_JSON_ERROR, got ${result.errorCode}`);
  assertNoSecrets(result);
});

// 7b. json parse failure
test("proof_sanitizes_json_parse_failure", async () => {
  const fetchImpl = makeCountingFetch({ ok: true, json: async () => { throw new Error("bad json"); } });
  const result = await runA4ReadOnlyRpcProof({
    resolveEndpoint: dedicatedResolver("HELIUS_RPC_URL"),
    fetchImpl
  });
  assert(result.errorCode === ERROR_CODES.JSON_ERROR, `expected RPC_JSON_ERROR, got ${result.errorCode}`);
});

// 8. malformed response (no numeric result)
test("proof_sanitizes_malformed_response", async () => {
  const fetchImpl = makeCountingFetch(fakeResponse({ ok: true, json: { jsonrpc: "2.0", id: 1, result: "not-a-number" } }));
  const result = await runA4ReadOnlyRpcProof({
    resolveEndpoint: dedicatedResolver("HELIUS_RPC_URL"),
    fetchImpl
  });
  assert(result.errorCode === ERROR_CODES.MALFORMED_RESPONSE, `expected RPC_MALFORMED_RESPONSE, got ${result.errorCode}`);
});

// 9. no signer / no transaction (static source guard)
test("proof_requires_no_signer", async () => {
  const src = fs.readFileSync(path.join(__dirname, "a4_rpc_proof.js"), "utf8");
  assert(!src.includes("SOLANA_SIGNER_SECRET"), "must not reference SOLANA_SIGNER_SECRET");
  assert(!src.includes("sendTransaction"), "must not contain sendTransaction");
  assert(!src.includes("simulateTransaction"), "must not contain simulateTransaction");
  assert(!/require\(["'].*(keypair|signer|nacl|tweetnacl)/i.test(src), "must not import signing modules");
});

// 10. getSlot only first pass (static + behavior)
test("proof_uses_getSlot_only_first_pass", async () => {
  assert(DEFAULT_METHOD === "getSlot", "default method must be getSlot");
  const fetchImpl = makeCountingFetch(fakeResponse({ ok: true, json: { result: 1 } }));
  const result = await runA4ReadOnlyRpcProof({
    resolveEndpoint: dedicatedResolver("HELIUS_RPC_URL"),
    fetchImpl,
    method: "getLatestBlockhash"
  });
  assert(result.errorCode === ERROR_CODES.METHOD_NOT_ALLOWED, `non-getSlot should be blocked, got ${result.errorCode}`);
  assert(fetchImpl.getCalls() === 0, "disallowed method must not call fetch");
});

// 11. live readiness boundary (source + export guard)
test("proof_preserves_live_readiness_boundary", async () => {
  const mod = require("./a4_rpc_proof");
  assert(mod.supportsLiveReadiness === undefined, "module must not export supportsLiveReadiness");
  const src = fs.readFileSync(path.join(__dirname, "a4_rpc_proof.js"), "utf8");
  assert(!/supportsLiveReadiness\s*[:=]\s*true/.test(src), "must not set supportsLiveReadiness true");
  assert(!src.includes("A4 resolved"), "must not claim A4 resolved");
  assert(!src.includes("A4_VERIFIED_DEDICATED"), "must not emit A4_VERIFIED_DEDICATED");
});

// 11b. process.env not dumped (source guard)
test("proof_does_not_dump_process_env", async () => {
  const src = fs.readFileSync(path.join(__dirname, "a4_rpc_proof.js"), "utf8");
  assert(!src.includes("process.env"), "proof module must not read/dump process.env directly");
});

// 12. A4.13 — audit payload allowlists only known proof fields.
test("proof_audit_payload_allowlists_fields_only", async () => {
  const fetchImpl = makeCountingFetch(fakeResponse({ ok: true, json: { jsonrpc: "2.0", id: 1, result: 284512345 } }));
  const result = await runA4ReadOnlyRpcProof({ resolveEndpoint: dedicatedResolver("HELIUS_RPC_URL"), fetchImpl });
  const event = buildA4RpcProofAuditEvent(result, { timestamp: "2026-07-04T16:00:00.000Z" });
  assert(event.producer === A4_PROOF_PRODUCER, "producer must be a4_rpc_proof");
  assert(event.eventType === A4_PROOF_EVENT_TYPE, "eventType must be A4_READ_ONLY_RPC_PROOF");
  assert(event.invocationContext === "a4_read_only_rpc_proof", "invocationContext mismatch");
  const payloadKeys = Object.keys(event.payload).filter((k) => k !== "invocationContext");
  for (const k of payloadKeys) {
    assert(A4_PROOF_AUDIT_ALLOWED_KEYS.includes(k), `payload has non-allowlisted key: ${k}`);
  }
  assert(event.payload.proofStatus === PROOF_STATUS.OK, "proofStatus should carry through");
  assert(event.payload.secretSafe === true, "secretSafe should be true");
  assertNoSecrets(event);
});

// 13. A4.13 — forbidden fields on a proof-like object are dropped by the sanitizer.
test("proof_audit_payload_drops_forbidden_fields", async () => {
  const hostile = {
    proofStatus: PROOF_STATUS.OK,
    providerLabel: "helius_rpc_url_configured",
    endpointClass: "dedicated",
    method: "getSlot",
    slotObserved: true,
    slotValuePresent: true,
    latencyMsBucket: "<250ms",
    publicFallbackUsed: false,
    secretSafe: true,
    errorCode: null,
    // Forbidden fields that must never survive:
    endpoint: FAKE_ENDPOINT,
    url: FAKE_ENDPOINT,
    apiKey: "FAKE_SECRET",
    headers: { Authorization: "Bearer FAKE_TOKEN" },
    rawSlot: 284512345,
    signature: "FAKE_SIG",
    stack: "at secret.example"
  };
  const payload = sanitizeA4RpcProofForAudit(hostile);
  for (const forbidden of ["endpoint", "url", "apiKey", "headers", "rawSlot", "signature", "stack"]) {
    assert(!Object.prototype.hasOwnProperty.call(payload, forbidden), `forbidden key survived: ${forbidden}`);
  }
  for (const k of Object.keys(payload)) {
    assert(A4_PROOF_AUDIT_ALLOWED_KEYS.includes(k), `non-allowlisted key survived: ${k}`);
  }
  assertNoSecrets(payload);
  const event = buildA4RpcProofAuditEvent(hostile);
  assertNoSecrets(event);
});

(async () => {
  let passed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ok ${t.name}`);
      passed++;
    } catch (err) {
      console.error(`  FAIL ${t.name}: ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`\na4 rpc proof tests: ${passed} passed, ${tests.length - passed} failed`);
})();
