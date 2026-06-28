"use strict";

// signer_provider.js — R41B stub + R43C guarded real local signer provider registry.
// Does NOT enable live trading or submit transactions.

const mockSigner = require("./mock_signer");
const localSigner = require("./local_signer");

const PROVIDERS = Object.freeze({
  MOCK: "mock",
  LOCAL_STUB: "local_stub",
  LOCAL_REAL: "local_real"
});

const BLOCKED_PROVIDERS = Object.freeze([
  "real",
  "hardware",
  "unknown"
]);

function normalizeProviderType(providerType) {
  return String(providerType || "").trim().toLowerCase();
}

function buildGuardContext(options = {}) {
  return {
    caps: options.caps,
    posture: options.posture,
    recoveryPresent: options.recoveryPresent === true,
    rpcStatus: options.rpcStatus,
    humanPresent: options.humanPresent === true,
    repeatedTrading: options.repeatedTrading === true,
    autonomousTrading: options.autonomousTrading === true,
    autoCompounding: options.autoCompounding === true,
    executorSignerIntegrated: options.executorSignerIntegrated === true,
    liveExecutorIntegration: options.liveExecutorIntegration === true,
    sessionTradeCount: options.sessionTradeCount
  };
}

function validateProviderRequest(options = {}) {
  const providerType = normalizeProviderType(options.providerType || options.provider);
  const blockers = [];

  if (!providerType) {
    blockers.push("providerType required");
  }

  if (BLOCKED_PROVIDERS.includes(providerType) || providerType === "local") {
    blockers.push(`provider ${providerType || "unknown"} blocked`);
  }

  if (providerType === PROVIDERS.MOCK && options.mockMode !== true) {
    blockers.push("mock provider requires mockMode true");
  }

  if (providerType === PROVIDERS.LOCAL_STUB && options.allowLocalStub !== true) {
    blockers.push("local_stub provider requires allowLocalStub true");
  }

  if (providerType === PROVIDERS.LOCAL_REAL) {
    if (options.allowRealLocalSigner !== true) {
      blockers.push("local_real provider requires allowRealLocalSigner true");
    } else {
      try {
        localSigner.validateSignerGuardContext(buildGuardContext(options), {
          allowRealLocalSigner: true,
          checkAllowReal: true
        });
      } catch (err) {
        blockers.push(err && err.message ? err.message : "R43C guard context not satisfied");
      }
    }
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

  if (validation.providerType === PROVIDERS.LOCAL_REAL) {
    return {
      providerType: PROVIDERS.LOCAL_REAL,
      signer: localSigner.createLocalSigner({
        providerMode: localSigner.LOCAL_PROVIDER_MODES.REAL,
        allowRealLocalSigner: true,
        caps: options.caps,
        posture: options.posture,
        recoveryPresent: options.recoveryPresent === true,
        rpcStatus: options.rpcStatus,
        humanPresent: options.humanPresent === true,
        repeatedTrading: options.repeatedTrading === true,
        autonomousTrading: options.autonomousTrading === true,
        autoCompounding: options.autoCompounding === true,
        executorSignerIntegrated: options.executorSignerIntegrated === true,
        liveExecutorIntegration: options.liveExecutorIntegration === true,
        sessionTradeCount: options.sessionTradeCount,
        env: options.env,
        repoRoot: options.repoRoot,
        testFixtureSecret: options.testFixtureSecret === true,
        testSecretBytes: options.testSecretBytes,
        testKeypair: options.testKeypair
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
    local_real: {
      available: true,
      requiresAllowRealLocalSigner: true,
      requiresR43cGuardContext: true,
      realSigning: true,
      networkSubmit: false,
      liveExecutorIntegration: false
    },
    liveTradingApproved: false,
    microLiveApproved: false
  };
}

if (require.main === module) {
  const availability = describeProviderAvailability();
  console.log("[signer-provider] Provider availability (R43C guarded real local signer)");
  console.log(JSON.stringify(availability, null, 2));
}

module.exports = {
  PROVIDERS,
  BLOCKED_PROVIDERS,
  normalizeProviderType,
  buildGuardContext,
  validateProviderRequest,
  createSignerFromProvider,
  describeProviderAvailability
};
