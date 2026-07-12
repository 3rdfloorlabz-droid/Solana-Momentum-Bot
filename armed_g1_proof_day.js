"use strict";

const fs = require("fs");
const timing = require("./armed_continuum_timing");

const DEFAULT_TIMEZONE = "America/Denver";

const G1_REASON_CODES = Object.freeze({
  OK: "OK",
  PROOF_DAY_NOT_REACHED: "PROOF_DAY_NOT_REACHED",
  G1_EXPIRY_BEFORE_BLOCK_RESERVE: "G1_EXPIRY_BEFORE_BLOCK_RESERVE",
  TIMEZONE_MISMATCH: "TIMEZONE_MISMATCH",
  G1_STALE: "G1_STALE",
  G1_REUSED: "G1_REUSED",
  BLOCK_BINDING_MISMATCH: "BLOCK_BINDING_MISMATCH",
  G1_UNSIGNED: "G1_UNSIGNED",
  G1_UNREADABLE: "G1_UNREADABLE",
  G1_SESSION_MISMATCH: "G1_SESSION_MISMATCH",
  G1_AMBIGUOUS_INPUT: "G1_AMBIGUOUS_INPUT"
});

function parseIsoUtc(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return { iso: new Date(ms).toISOString(), ms };
}

function localDateInTimezone(utcMs, timezone) {
  if (!timezone || typeof timezone !== "string") return null;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(utcMs));
  } catch {
    return null;
  }
}

function parseG1DocumentFields(text) {
  const body = String(text || "");
  const expiryMatch = body.match(/\*\*Authorization expiry \(UTC\)\*\*\s*\|\s*\*\*`([^`]+)`/i)
    || body.match(/Authorization expiry \(UTC\)[^\n]*`([^`]+)`/i);
  const signedMatch = body.match(/\*\*Signature timestamp \(UTC\)\*\*\s*\|\s*\*\*`([^`]+)`/i)
    || body.match(/Signature timestamp \(UTC\)[^\n]*`([^`]+)`/i);
  const blockMatch = body.match(/\*\*`([^`]+)`\s*–\s*\*\*`([^`]+)`\*\*/);
  const sessionMatch = body.match(/\*\*Assigned session ID\*\*\s*\|\s*\*\*`([^`]+)`/i)
    || body.match(/RB-G9-\d{8}-[A-Z0-9]+/);
  const consumed = /CONSUMED\/CLOSED|do not reuse|ABORTED_BEFORE_BROADCAST|NO_TRADE_EXECUTED/i.test(body);
  const signed = /\*\*SIGNED\b/i.test(body) || /\*\*APPROVED\*\*/i.test(body);

  return {
    g1ExpiresAtUtc: expiryMatch ? expiryMatch[1] : null,
    g1SignedAtUtc: signedMatch ? signedMatch[1] : null,
    blockStartUtc: blockMatch ? blockMatch[1] : null,
    blockEndUtc: blockMatch ? blockMatch[2] : null,
    sessionId: Array.isArray(sessionMatch) ? sessionMatch[1] || sessionMatch[0] : null,
    consumed,
    signed
  };
}

function validateProofDayG1(options = {}) {
  const {
    g1Path,
    g1Text,
    sessionId,
    proofDayLocal,
    timezone = DEFAULT_TIMEZONE,
    operatingBlockStartUtc,
    operatingBlockEndUtc,
    nowUtc = new Date().toISOString(),
    consumedRegistry = []
  } = options;

  const result = {
    ok: false,
    reasonCode: G1_REASON_CODES.G1_AMBIGUOUS_INPUT,
    proofDayLocal,
    timezone,
    blockStartUtc: operatingBlockStartUtc || null,
    blockEndUtc: operatingBlockEndUtc || null,
    g1ExpiresAtUtc: null,
    requiredMinExpiryUtc: null,
    g1ValidationResult: null
  };

  if (!proofDayLocal || !/^\d{4}-\d{2}-\d{2}$/.test(proofDayLocal)) {
    result.reasonCode = G1_REASON_CODES.G1_AMBIGUOUS_INPUT;
    return result;
  }

  const localDateNow = localDateInTimezone(Date.parse(nowUtc), timezone);
  if (!localDateNow) {
    result.reasonCode = G1_REASON_CODES.TIMEZONE_MISMATCH;
    return result;
  }

  let text = g1Text;
  if (!text && g1Path) {
    if (!fs.existsSync(g1Path)) {
      result.reasonCode = G1_REASON_CODES.G1_UNREADABLE;
      return result;
    }
    try {
      text = fs.readFileSync(g1Path, "utf8");
    } catch {
      result.reasonCode = G1_REASON_CODES.G1_UNREADABLE;
      return result;
    }
  }
  if (!text) {
    result.reasonCode = G1_REASON_CODES.G1_UNREADABLE;
    return result;
  }

  const parsed = parseG1DocumentFields(text);
  if (!parsed.signed) {
    result.reasonCode = G1_REASON_CODES.G1_UNSIGNED;
    return result;
  }
  if (parsed.consumed) {
    result.reasonCode = G1_REASON_CODES.G1_REUSED;
    return result;
  }
  if (sessionId && parsed.sessionId && parsed.sessionId !== sessionId) {
    result.reasonCode = G1_REASON_CODES.G1_SESSION_MISMATCH;
    return result;
  }
  if (Array.isArray(consumedRegistry) && g1Path && consumedRegistry.includes(g1Path)) {
    result.reasonCode = G1_REASON_CODES.G1_REUSED;
    return result;
  }

  const blockStart = parseIsoUtc(operatingBlockStartUtc || parsed.blockStartUtc);
  const blockEnd = parseIsoUtc(operatingBlockEndUtc || parsed.blockEndUtc);
  const g1Expires = parseIsoUtc(parsed.g1ExpiresAtUtc);
  const g1Signed = parseIsoUtc(parsed.g1SignedAtUtc);
  const now = parseIsoUtc(nowUtc);

  if (!blockStart || !blockEnd || !g1Expires || !g1Signed || !now) {
    result.reasonCode = G1_REASON_CODES.G1_AMBIGUOUS_INPUT;
    return result;
  }

  if (operatingBlockStartUtc && parsed.blockStartUtc && parseIsoUtc(parsed.blockStartUtc)?.iso !== blockStart.iso) {
    result.reasonCode = G1_REASON_CODES.BLOCK_BINDING_MISMATCH;
    return result;
  }
  if (operatingBlockEndUtc && parsed.blockEndUtc && parseIsoUtc(parsed.blockEndUtc)?.iso !== blockEnd.iso) {
    result.reasonCode = G1_REASON_CODES.BLOCK_BINDING_MISMATCH;
    return result;
  }

  const signedLocalDate = localDateInTimezone(g1Signed.ms, timezone);
  if (signedLocalDate !== proofDayLocal) {
    result.reasonCode = G1_REASON_CODES.PROOF_DAY_NOT_REACHED;
    return result;
  }
  if (localDateNow < proofDayLocal) {
    result.reasonCode = G1_REASON_CODES.PROOF_DAY_NOT_REACHED;
    return result;
  }

  const requiredMinExpiryMs = blockEnd.ms + timing.G1_POST_BLOCK_MARGIN_MS;
  const requiredMinExpiryUtc = new Date(requiredMinExpiryMs).toISOString();
  result.g1ExpiresAtUtc = g1Expires.iso;
  result.requiredMinExpiryUtc = requiredMinExpiryUtc;
  result.blockStartUtc = blockStart.iso;
  result.blockEndUtc = blockEnd.iso;

  if (g1Expires.ms < requiredMinExpiryMs) {
    result.reasonCode = G1_REASON_CODES.G1_EXPIRY_BEFORE_BLOCK_RESERVE;
    return result;
  }
  if (g1Expires.ms < now.ms) {
    result.reasonCode = G1_REASON_CODES.G1_STALE;
    return result;
  }

  result.ok = true;
  result.reasonCode = G1_REASON_CODES.OK;
  result.g1ValidationResult = "PASS";
  return result;
}

module.exports = {
  DEFAULT_TIMEZONE,
  G1_REASON_CODES,
  parseG1DocumentFields,
  localDateInTimezone,
  validateProofDayG1
};
