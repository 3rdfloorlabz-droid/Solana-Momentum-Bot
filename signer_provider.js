"use strict";

// signer_provider.js — R41B signer provider selection (stub phase).
// Does NOT enable real signing or load secrets.

const mockSigner = require("./mock_signer");
const localSigner = require("./local_signer");

const PROVIDERS = Object.freeze({
  MOCK: "mock",
  LOCAL_STUB: "local_stub",
  LOCAL_REAL: "local_real"
});

const BLOCKED_PROVIDERS = Object.freeze([
  PROVIDERS.LOCAL_REAL,
  "real",
  "hardware",
  "unknown"
]);

function normalizeProviderType(providerType) {
  return String(providerType || "").trim().toLowerCase();
}

function validateProviderRequest(options = {}) {
  const providerType = normalizeProviderType(options.providerType || options.provider);
  const blockers = [];

  if (!providerType) {
    blockers.push("providerType required");
  }

  if (BLOCKED_PROVIDERS.includes(providerType) || providerType === "local") {
    blockers.push(`provider ${providerType || "unknown"} blocked in stub phase`);
  }

  if (providerType === PROVIDERS.MOCK && options.mockMode !== true) {
    blockers.push("mock provider requires mockMode true");
  }

  if (providerType === PROVIDERS.LOCAL_STUB && options.allowLocalStub !== true) {
    blockers.push("local_stub provider requires allowLocalStub true");
  }

  return {
    ok: blockers.length === 0,
    blockers,
    providerType
  };
}

function createSignerFromProvider(options = {}) {
  const validation = validateProviderRequest(options);
  if (!validation.ok) {
    throw Object.assign(new Error(validation.blockers.join("; ")), {
      code: "PROVIDER_BLOCKED",
      blockers: validation.blockers
    });
  }

  if (validation.providerType === PROVIDERS.MOCK) {
    return {
      providerType: PROVIDERS.MOCK,
      signer: mockSigner.createMockSigner({
        mockMode: true,
        caps: options.caps,
        posture: options.posture,
        recoveryPresent: options.recoveryPresent === true
      })
    };
  }

  if (validation.providerType === PROVIDERS.LOCAL_STUB) {
    return {
      providerType: PROVIDERS.LOCAL_STUB,
      signer: localSigner.loadSignerFromApprovedSource({
        caps: options.caps,
        posture: options.posture,
        recoveryPresent: options.recoveryPresent === true
      })
    };
  }

  throw Object.assign(new Error(`unsupported provider ${validation.providerType}`), {
    code: "PROVIDER_UNKNOWN"
  });
}

function describeProviderAvailability() {
  return {
    mock: { available: true, requiresMockMode: true, realSigning: false },
    local_stub: { available: true, requiresAllowLocalStub: true, realSigning: false },
    local_real: { available: false, reason: "blocked until R43+ explicit approval" },
    liveTradingApproved: false,
    microLiveApproved: false
  };
}

if (require.main === module) {
  const availability = describeProviderAvailability();
  console.log("[r41b-signer-provider] Provider availability (stub phase)");
  console.log(JSON.stringify(availability, null, 2));
}

module.exports = {
  PROVIDERS,
  BLOCKED_PROVIDERS,
  normalizeProviderType,
  validateProviderRequest,
  createSignerFromProvider,
  describeProviderAvailability
};
