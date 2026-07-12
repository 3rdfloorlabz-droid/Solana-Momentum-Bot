"use strict";

// r15_approval_validator.js — schemaVersion 2 dual-purpose R15 validation (Option A).
// Shared versioned validator with explicit expectedPurpose context separation.

const r15Check = require("./r15_manual_approval_check");

const APPROVAL_PURPOSES = Object.freeze({
  MICRO_LIVE: "micro_live_execution",
  ARMED_PROOF: "armed_no_submit_proof_only"
});

const FINAL_APPROVAL_STATUSES = Object.freeze({
  MICRO_LIVE: r15Check.APPROVAL_STATUSES.ONE_SESSION_ONLY,
  ARMED_PROOF: "APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY"
});

const PURPOSE_STATUS_PAIRS = Object.freeze({
  [APPROVAL_PURPOSES.MICRO_LIVE]: FINAL_APPROVAL_STATUSES.MICRO_LIVE,
  [APPROVAL_PURPOSES.ARMED_PROOF]: FINAL_APPROVAL_STATUSES.ARMED_PROOF
});

const R15_ERROR_CODES = Object.freeze({
  R15_UNSUPPORTED_SCHEMA_VERSION: "R15_UNSUPPORTED_SCHEMA_VERSION",
  R15_MISSING_APPROVAL_PURPOSE: "R15_MISSING_APPROVAL_PURPOSE",
  R15_UNKNOWN_APPROVAL_PURPOSE: "R15_UNKNOWN_APPROVAL_PURPOSE",
  R15_PURPOSE_STATUS_MISMATCH: "R15_PURPOSE_STATUS_MISMATCH",
  R15_EXPECTED_PURPOSE_REQUIRED: "R15_EXPECTED_PURPOSE_REQUIRED",
  R15_EXPECTED_PURPOSE_MISMATCH: "R15_EXPECTED_PURPOSE_MISMATCH",
  R15_LEGACY_NOT_ALLOWED: "R15_LEGACY_NOT_ALLOWED",
  R15_LEGACY_PROOF_FORBIDDEN: "R15_LEGACY_PROOF_FORBIDDEN",
  R15_COMMON_ACK_INVALID: "R15_COMMON_ACK_INVALID",
  R15_MICRO_LIVE_ACK_INVALID: "R15_MICRO_LIVE_ACK_INVALID",
  R15_ARMED_PROOF_ACK_INVALID: "R15_ARMED_PROOF_ACK_INVALID",
  R15_PROHIBITED_PROOF_FIELD: "R15_PROHIBITED_PROOF_FIELD",
  R15_SESSION_MISMATCH: "R15_SESSION_MISMATCH",
  R15_WALLET_MISMATCH: "R15_WALLET_MISMATCH",
  R15_EXPIRED: "R15_EXPIRED",
  R15_CONSUMED: "R15_CONSUMED",
  R15_MALFORMED_RECORD: "R15_MALFORMED_RECORD"
});

const COMMON_ACK_FIELDS = Object.freeze([
  "strategyNotReadyAcknowledged",
  "noProfitabilityClaimAcknowledged",
  "oneSessionOnlyAcknowledged",
  "signerAndSessionBindingAcknowledged"
]);

const MICRO_LIVE_ACK_FIELDS = Object.freeze([
  "totalLossRiskAcknowledged",
  "slippageCapAcknowledged",
  "mevProtectionPlanAcknowledged",
  "emergencyStopPolicyAcknowledged",
  "noAutoCompoundingAcknowledged",
  "noAveragingDownAcknowledged",
  "noUnattendedExecutionAcknowledged",
  "liveTradingNotForIncomeAcknowledged"
]);

const ARMED_PROOF_ACK_FIELDS = Object.freeze([
  "noCandidateSelectionAcknowledged",
  "noExecutionQuoteAcknowledged",
  "noSubmitAcknowledged",
  "noSigningAcknowledged",
  "noBroadcastAcknowledged",
  "noPositionAcknowledged",
  "noCapitalExposureAcknowledged",
  "immediateDisarmAcknowledged",
  "abortWithoutCompletionAcknowledged"
]);

const LEGACY_MICRO_LIVE_ACK_FIELDS = MICRO_LIVE_ACK_FIELDS;

const V2_ALLOWED_TOP_LEVEL_FIELDS = new Set([
  "schemaVersion",
  "approvalPurpose",
  "finalApprovalStatus",
  "purpose",
  "approvalId",
  "operatorName",
  "dateTime",
  "sessionStartTime",
  "sessionEndTime",
  "expiresAt",
  "consumed",
  "researchWalletPublicAddress",
  "walletPublicAddress",
  "operatorSignaturePresent",
  "commonAcknowledgments",
  "microLiveAcknowledgments",
  "armedProofAcknowledgments",
  "acknowledgments",
  "limits",
  "oriLinkage",
  "perTradeApprovalRequired",
  "totalWalletBalance",
  "authorizedSessionAllocationSol",
  "maxFirstTradeSizeSol",
  "scope",
  "_note",
  "_fixtureLabel",
  "simulationExampleOnly"
]);

const PROHIBITED_PROOF_FIELD_KEYS = new Set([
  "candidateMint",
  "tokenMint",
  "pairAddress",
  "pairPoolAddress",
  "quote",
  "quoteId",
  "quoteTimestamp",
  "expectedOutput",
  "tradeSize",
  "positionSize",
  "entryPrice",
  "target",
  "stopLoss",
  "transactionAuthorization",
  "submitAuthorized",
  "broadcastAuthorized",
  "capitalExposureAuthorized",
  "candidatePacket",
  "candidate",
  "trade",
  "tradeId",
  "side",
  "intent",
  "mint"
]);

const PROHIBITED_PROOF_CONTAINER_KEYS = new Set([
  "candidate",
  "quote",
  "trade",
  "candidatePacket",
  "transactionAuthorization"
]);

function fail(code, message, details = {}) {
  return { ok: false, code, message, details };
}

function pass(record, meta = {}) {
  return { ok: true, record, ...meta };
}

function resolveSchemaVersion(raw) {
  if (!raw || typeof raw !== "object") return "invalid";
  const version = raw.schemaVersion;
  if (version === undefined || version === null) return 1;
  if (version === 1 || version === "1") return 1;
  if (version === 2 || version === "2") return 2;
  return "unknown";
}

function parseTime(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function resolveRecordSessionId(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.oriLinkage && raw.oriLinkage.sessionId) return raw.oriLinkage.sessionId;
  return raw.approvalId || null;
}

function resolveRecordWallet(raw) {
  if (!raw || typeof raw !== "object") return null;
  return raw.researchWalletPublicAddress || raw.walletPublicAddress || null;
}

function getAckBucket(raw, bucketName, legacyFlat) {
  if (raw[bucketName] && typeof raw[bucketName] === "object") return raw[bucketName];
  if (legacyFlat && raw.acknowledgments && typeof raw.acknowledgments === "object") {
    return raw.acknowledgments;
  }
  return {};
}

function validateAckSet(ackObj, fields, code, label) {
  const allowed = new Set(fields);
  const unknown = Object.keys(ackObj || {}).filter(key => !allowed.has(key));
  if (unknown.length) {
    return fail(code, `${label} acknowledgments contain unknown fields.`, { unknown });
  }
  const missing = fields.filter(field => ackObj[field] !== true);
  if (missing.length) {
    return fail(code, `${label} acknowledgments incomplete.`, { missing });
  }
  return null;
}

function findUnknownV2Fields(raw) {
  const unknown = Object.keys(raw).filter(key => !V2_ALLOWED_TOP_LEVEL_FIELDS.has(key));
  return unknown;
}

function findProhibitedProofFields(raw) {
  const hits = [];
  for (const [key, value] of Object.entries(raw || {})) {
    if (PROHIBITED_PROOF_CONTAINER_KEYS.has(key)) {
      hits.push(key);
      continue;
    }
    if (PROHIBITED_PROOF_FIELD_KEYS.has(key)) {
      hits.push(key);
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (key === "commonAcknowledgments" || key === "microLiveAcknowledgments" ||
          key === "armedProofAcknowledgments" || key === "limits" || key === "oriLinkage" ||
          key === "acknowledgments") {
        continue;
      }
      for (const nestedKey of Object.keys(value)) {
        if (PROHIBITED_PROOF_FIELD_KEYS.has(nestedKey)) hits.push(`${key}.${nestedKey}`);
      }
    }
  }
  return hits;
}

function validateExpiryAndConsumption(raw, nowMs) {
  if (raw.consumed === true) {
    return fail(R15_ERROR_CODES.R15_CONSUMED, "R15 approval record already consumed.");
  }
  for (const field of ["expiresAt", "sessionEndTime"]) {
    if (raw[field] != null && raw[field] !== "") {
      const parsed = parseTime(raw[field]);
      if (parsed == null) {
        return fail(
          R15_ERROR_CODES.R15_MALFORMED_RECORD,
          "R15 approval record has malformed expiry timestamp.",
          { field }
        );
      }
    }
  }
  const expiryMs = parseTime(raw.expiresAt) || parseTime(raw.sessionEndTime);
  if (expiryMs != null && nowMs > expiryMs) {
    return fail(R15_ERROR_CODES.R15_EXPIRED, "R15 approval record expired.");
  }
  return null;
}

function validateSessionBinding(raw, expectedSessionId) {
  if (!expectedSessionId) return null;
  const recordSessionId = resolveRecordSessionId(raw);
  if (!recordSessionId || recordSessionId !== expectedSessionId) {
    return fail(
      R15_ERROR_CODES.R15_SESSION_MISMATCH,
      "R15 approval record session binding mismatch.",
      { expectedSessionId, recordSessionId: recordSessionId || null }
    );
  }
  return null;
}

function validateWalletBinding(raw, expectedWallet, options = {}) {
  if (!expectedWallet) return null;
  const recordWallet = resolveRecordWallet(raw);
  if (options.legacyMode === true) {
    if (recordWallet && recordWallet !== expectedWallet) {
      return fail(
        R15_ERROR_CODES.R15_WALLET_MISMATCH,
        "R15 approval record wallet binding mismatch.",
        { expectedWalletPresent: true, recordWalletPresent: true }
      );
    }
    return null;
  }
  if (!recordWallet || recordWallet !== expectedWallet) {
    return fail(
      R15_ERROR_CODES.R15_WALLET_MISMATCH,
      "R15 approval record wallet binding mismatch.",
      { expectedWalletPresent: true, recordWalletPresent: Boolean(recordWallet) }
    );
  }
  return null;
}

function validateLegacyMicroLiveRecord(raw, context) {
  const {
    expectedPurpose,
    expectedSessionId,
    expectedWallet,
    now = Date.now(),
    allowLegacyMicroLive = false
  } = context || {};

  if (!raw || typeof raw !== "object") {
    return fail(R15_ERROR_CODES.R15_MALFORMED_RECORD, "R15 approval record missing or malformed.");
  }

  if (expectedPurpose === APPROVAL_PURPOSES.ARMED_PROOF) {
    return fail(
      R15_ERROR_CODES.R15_LEGACY_PROOF_FORBIDDEN,
      "Legacy R15 records cannot satisfy armed-proof context."
    );
  }

  if (!allowLegacyMicroLive) {
    return fail(
      R15_ERROR_CODES.R15_LEGACY_NOT_ALLOWED,
      "Legacy R15 record rejected — explicit legacy compatibility not enabled."
    );
  }

  if (expectedPurpose && expectedPurpose !== APPROVAL_PURPOSES.MICRO_LIVE) {
    return fail(
      R15_ERROR_CODES.R15_EXPECTED_PURPOSE_MISMATCH,
      "Legacy R15 record valid only for micro-live execution context.",
      { expectedPurpose }
    );
  }

  if (!raw.approvalId || !raw.operatorName || !raw.dateTime) {
    return fail(
      R15_ERROR_CODES.R15_MALFORMED_RECORD,
      "R15 approval record malformed — missing approvalId, operatorName, or dateTime."
    );
  }

  if (!raw.operatorSignaturePresent) {
    return fail(
      R15_ERROR_CODES.R15_MALFORMED_RECORD,
      "R15 operator signature not recorded."
    );
  }

  const acks = getAckBucket(raw, "microLiveAcknowledgments", true);
  const ackFailure = validateAckSet(
    acks,
    LEGACY_MICRO_LIVE_ACK_FIELDS,
    R15_ERROR_CODES.R15_MICRO_LIVE_ACK_INVALID,
    "Micro-live"
  );
  if (ackFailure) return ackFailure;

  if (raw.finalApprovalStatus !== FINAL_APPROVAL_STATUSES.MICRO_LIVE) {
    return fail(
      R15_ERROR_CODES.R15_PURPOSE_STATUS_MISMATCH,
      "Legacy micro-live record requires exact micro-live finalApprovalStatus.",
      { finalApprovalStatus: raw.finalApprovalStatus || null }
    );
  }

  const walletFailure = validateWalletBinding(raw, expectedWallet, { legacyMode: true });
  if (walletFailure) return walletFailure;

  if (expectedSessionId) {
    const sessionFailure = validateSessionBinding(raw, expectedSessionId);
    if (sessionFailure) return sessionFailure;
  }

  const expiryFailure = validateExpiryAndConsumption(raw, now);
  if (expiryFailure) return expiryFailure;

  const normalized = r15Check.normalizeRecord(raw);
  return pass(normalized, {
    schemaVersion: 1,
    approvalPurpose: APPROVAL_PURPOSES.MICRO_LIVE,
    legacy: true
  });
}

function validateV2Record(raw, context) {
  const {
    expectedPurpose,
    expectedSessionId,
    expectedWallet,
    now = Date.now()
  } = context || {};

  if (!raw || typeof raw !== "object") {
    return fail(R15_ERROR_CODES.R15_MALFORMED_RECORD, "R15 approval record missing or malformed.");
  }

  if (!expectedPurpose) {
    return fail(
      R15_ERROR_CODES.R15_EXPECTED_PURPOSE_REQUIRED,
      "expectedPurpose is required for schemaVersion 2 validation."
    );
  }

  if (expectedPurpose !== APPROVAL_PURPOSES.MICRO_LIVE &&
      expectedPurpose !== APPROVAL_PURPOSES.ARMED_PROOF) {
    return fail(
      R15_ERROR_CODES.R15_EXPECTED_PURPOSE_MISMATCH,
      "expectedPurpose must be an approved R15 purpose.",
      { expectedPurpose }
    );
  }

  if (!raw.approvalPurpose) {
    return fail(
      R15_ERROR_CODES.R15_MISSING_APPROVAL_PURPOSE,
      "schemaVersion 2 requires approvalPurpose."
    );
  }

  if (!Object.prototype.hasOwnProperty.call(PURPOSE_STATUS_PAIRS, raw.approvalPurpose)) {
    return fail(
      R15_ERROR_CODES.R15_UNKNOWN_APPROVAL_PURPOSE,
      "Unknown approvalPurpose.",
      { approvalPurpose: raw.approvalPurpose }
    );
  }

  const expectedStatus = PURPOSE_STATUS_PAIRS[raw.approvalPurpose];
  if (raw.finalApprovalStatus !== expectedStatus) {
    return fail(
      R15_ERROR_CODES.R15_PURPOSE_STATUS_MISMATCH,
      "approvalPurpose and finalApprovalStatus pair mismatch.",
      {
        approvalPurpose: raw.approvalPurpose,
        finalApprovalStatus: raw.finalApprovalStatus || null,
        expectedStatus
      }
    );
  }

  if (raw.approvalPurpose !== expectedPurpose) {
    return fail(
      R15_ERROR_CODES.R15_EXPECTED_PURPOSE_MISMATCH,
      "Record approvalPurpose does not match expectedPurpose context.",
      { approvalPurpose: raw.approvalPurpose, expectedPurpose }
    );
  }

  if (raw.purpose && raw.purpose !== raw.approvalPurpose) {
    return fail(
      R15_ERROR_CODES.R15_PURPOSE_STATUS_MISMATCH,
      "purpose field must match approvalPurpose.",
      { purpose: raw.purpose, approvalPurpose: raw.approvalPurpose }
    );
  }

  if (raw.approvalPurpose === APPROVAL_PURPOSES.ARMED_PROOF &&
      raw.purpose && raw.purpose !== APPROVAL_PURPOSES.ARMED_PROOF) {
    return fail(
      R15_ERROR_CODES.R15_PURPOSE_STATUS_MISMATCH,
      "Armed-proof record purpose invalid.",
      { purpose: raw.purpose }
    );
  }

  if (expectedPurpose === APPROVAL_PURPOSES.ARMED_PROOF) {
    const prohibitedEarly = findProhibitedProofFields(raw);
    if (prohibitedEarly.length) {
      return fail(
        R15_ERROR_CODES.R15_PROHIBITED_PROOF_FIELD,
        "Armed-proof record contains prohibited execution or capital fields.",
        { prohibitedFields: prohibitedEarly }
      );
    }
  }

  const unknownFields = findUnknownV2Fields(raw);
  if (unknownFields.length) {
    return fail(
      R15_ERROR_CODES.R15_MALFORMED_RECORD,
      "Unknown fields present in schemaVersion 2 record.",
      { unknownFields }
    );
  }

  if (!raw.approvalId || !raw.operatorName || !raw.dateTime) {
    return fail(
      R15_ERROR_CODES.R15_MALFORMED_RECORD,
      "R15 approval record malformed — missing approvalId, operatorName, or dateTime."
    );
  }

  if (!raw.operatorSignaturePresent) {
    return fail(
      R15_ERROR_CODES.R15_MALFORMED_RECORD,
      "R15 operator signature not recorded."
    );
  }

  const commonAcks = getAckBucket(raw, "commonAcknowledgments", false);
  const commonFailure = validateAckSet(
    commonAcks,
    COMMON_ACK_FIELDS,
    R15_ERROR_CODES.R15_COMMON_ACK_INVALID,
    "Common"
  );
  if (commonFailure) return commonFailure;

  if (expectedPurpose === APPROVAL_PURPOSES.MICRO_LIVE) {
    const microAcks = getAckBucket(raw, "microLiveAcknowledgments", false);
    const microFailure = validateAckSet(
      microAcks,
      MICRO_LIVE_ACK_FIELDS,
      R15_ERROR_CODES.R15_MICRO_LIVE_ACK_INVALID,
      "Micro-live"
    );
    if (microFailure) return microFailure;

    if (raw.armedProofAcknowledgments && Object.keys(raw.armedProofAcknowledgments).length) {
      return fail(
        R15_ERROR_CODES.R15_ARMED_PROOF_ACK_INVALID,
        "Cross-purpose armed-proof acknowledgments present in micro-live record."
      );
    }
  }

  if (expectedPurpose === APPROVAL_PURPOSES.ARMED_PROOF) {
    const proofAcks = getAckBucket(raw, "armedProofAcknowledgments", false);
    const proofFailure = validateAckSet(
      proofAcks,
      ARMED_PROOF_ACK_FIELDS,
      R15_ERROR_CODES.R15_ARMED_PROOF_ACK_INVALID,
      "Armed-proof"
    );
    if (proofFailure) return proofFailure;

    if (raw.microLiveAcknowledgments && Object.keys(raw.microLiveAcknowledgments).length) {
      return fail(
        R15_ERROR_CODES.R15_MICRO_LIVE_ACK_INVALID,
        "Cross-purpose micro-live acknowledgments present in armed-proof record."
      );
    }

    const prohibited = findProhibitedProofFields(raw);
    if (prohibited.length) {
      return fail(
        R15_ERROR_CODES.R15_PROHIBITED_PROOF_FIELD,
        "Armed-proof record contains prohibited execution or capital fields.",
        { prohibitedFields: prohibited }
      );
    }
  }

  const sessionFailure = validateSessionBinding(raw, expectedSessionId);
  if (sessionFailure) return sessionFailure;

  const walletFailure = validateWalletBinding(raw, expectedWallet);
  if (walletFailure) return walletFailure;

  const expiryFailure = validateExpiryAndConsumption(raw, now);
  if (expiryFailure) return expiryFailure;

  return pass(raw, {
    schemaVersion: 2,
    approvalPurpose: raw.approvalPurpose,
    legacy: false
  });
}

function loadR15ApprovalRecord(raw, context = {}) {
  const schemaVersion = resolveSchemaVersion(raw);

  if (schemaVersion === "invalid") {
    return fail(R15_ERROR_CODES.R15_MALFORMED_RECORD, "R15 approval record missing or malformed.");
  }

  if (schemaVersion === "unknown") {
    return fail(
      R15_ERROR_CODES.R15_UNSUPPORTED_SCHEMA_VERSION,
      "Unsupported R15 schemaVersion.",
      { schemaVersion: raw.schemaVersion }
    );
  }

  if (schemaVersion === 1) {
    return validateLegacyMicroLiveRecord(raw, context);
  }

  return validateV2Record(raw, context);
}

function assertR15ApprovalRecord(raw, context = {}) {
  const result = loadR15ApprovalRecord(raw, context);
  if (result.ok) return result;
  const err = new Error(result.message);
  err.code = result.code;
  err.details = result.details;
  throw err;
}

module.exports = {
  APPROVAL_PURPOSES,
  FINAL_APPROVAL_STATUSES,
  R15_ERROR_CODES,
  COMMON_ACK_FIELDS,
  MICRO_LIVE_ACK_FIELDS,
  ARMED_PROOF_ACK_FIELDS,
  PROHIBITED_PROOF_FIELD_KEYS,
  resolveSchemaVersion,
  loadR15ApprovalRecord,
  assertR15ApprovalRecord,
  findProhibitedProofFields
};
