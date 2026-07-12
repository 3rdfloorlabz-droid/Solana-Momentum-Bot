"use strict";

const fs = require("fs");
const path = require("path");
const common = require("./live_validation_common");
const timing = require("./armed_continuum_timing");

const SCHEMA_VERSION = "armed-continuum-receipt/1.0.0";
const GATE_NAME = "RB-G9-Armed-Continuum";

function buildContinuumReceipt(input = {}) {
  const receipt = common.sortObject({
    schemaVersion: SCHEMA_VERSION,
    gate: GATE_NAME,
    sessionId: input.sessionId,
    continuumRunId: input.continuumRunId,
    status: input.status || "FAIL_CLOSED_UNEXPECTED",
    failReason: input.failReason || null,
    exitCode: input.exitCode ?? 50,
    armedStartUtc: input.armedStartUtc || null,
    armedDeadlineUtc: input.armedDeadlineUtc || null,
    armedStartMonoRef: input.armedStartMonoRef || null,
    timingConstants: timing.TIMING_CONSTANTS,
    authorizationFingerprints: common.sanitizeEvidence(input.authorizationFingerprints || {}),
    armingBaselineHash: input.armingBaselineHash || null,
    isolatedProcessSetHash: input.isolatedProcessSetHash || null,
    configFingerprint: input.configFingerprint || null,
    envFingerprintGateOnly: common.sanitizeEvidence(input.envFingerprintGateOnly || {}),
    stubFingerprint: input.stubFingerprint || null,
    stubPurpose: input.stubPurpose || null,
    thresholds: common.sanitizeEvidence(input.thresholds || {}),
    apSummary: common.sanitizeEvidence(input.apSummary || {}),
    n6Summary: common.sanitizeEvidence(input.n6Summary || {}),
    rollback: common.sanitizeEvidence(input.rollback || {}),
    domainC: common.sanitizeEvidence(input.domainC || {}),
    safety: common.sanitizeEvidence(input.safety || {}),
    eventLogPath: input.eventLogPath || null,
    eventLogHeadHash: input.eventLogHeadHash || null,
    eventLogTailHash: input.eventLogTailHash || null,
    capitalExposure: "none",
    orStatus: input.orStatus || "not_promoted",
    strategyReadiness: input.strategyReadiness || "NOT READY",
    noSubmitProof: true,
    dryRehearsal: !!input.dryRehearsal,
    g1Validation: common.sanitizeEvidence(input.g1Validation || {}),
    finalState: input.finalState || null,
    startedAtUtc: input.startedAtUtc || common.nowIso(),
    completedAtUtc: input.completedAtUtc || common.nowIso()
  });

  const body = { ...receipt };
  delete body.receiptSha256;
  receipt.receiptSha256 = common.hashBuffer(Buffer.from(JSON.stringify(common.sortObject(body))));
  common.assertNoSecretInReceipt(receipt);
  return receipt;
}

function writeContinuumReceipt(receipt, outPath, options = {}) {
  const writeFile = options.writeFile || ((target, data) => {
    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, target);
  });

  try {
    const serialized = common.serializeReceipt(receipt);
    writeFile(outPath, serialized);
    return { ok: true, path: outPath, receiptSha256: receipt.receiptSha256 };
  } catch (error) {
    return { ok: false, path: outPath, reason: error.message || String(error) };
  }
}

module.exports = {
  SCHEMA_VERSION,
  GATE_NAME,
  buildContinuumReceipt,
  writeContinuumReceipt
};
