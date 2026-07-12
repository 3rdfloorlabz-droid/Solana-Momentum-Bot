"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const common = require("./live_validation_common");

const SCHEMA_VERSION = "armed-continuum-events/1.0.0";

function canonicalEventBody(event) {
  const clone = { ...event };
  delete clone.eventHash;
  return common.sortObject(clone);
}

function hashEvent(event) {
  const body = canonicalEventBody(event);
  return common.hashBuffer(Buffer.from(JSON.stringify(body)));
}

function createEventLog(options = {}) {
  const filePath = options.filePath;
  if (!filePath) throw new Error("event log path required");

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let sequence = 0;
  let previousEventHash = options.initialPreviousHash || "GENESIS";
  let headHash = previousEventHash;
  let tailHash = previousEventHash;
  let sealed = false;

  if (options.resume && fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      if (parsed.sequence !== sequence + 1) {
        throw new Error("event log sequence mismatch");
      }
      if (parsed.previousEventHash !== previousEventHash) {
        throw new Error("event log hash chain mismatch");
      }
      sequence = parsed.sequence;
      previousEventHash = parsed.eventHash;
      tailHash = parsed.eventHash;
    }
    if (lines.length > 0) headHash = JSON.parse(lines[0]).eventHash;
  }

  function appendEvent(input = {}) {
    if (sealed) throw new Error("event log sealed");
    const nextSequence = sequence + 1;
    if (input.sequence != null && input.sequence !== nextSequence) {
      throw new Error("sequence mismatch");
    }
    if (input.previousEventHash != null && input.previousEventHash !== previousEventHash) {
      throw new Error("previous event hash mismatch");
    }

    const event = common.sortObject({
      schemaVersion: SCHEMA_VERSION,
      sessionId: input.sessionId,
      continuumRunId: input.continuumRunId,
      sequence: nextSequence,
      state: input.state,
      eventType: input.eventType,
      timestampUtc: input.timestampUtc || common.nowIso(),
      monotonicElapsedMs: input.monotonicElapsedMs,
      remainingArmedMs: input.remainingArmedMs,
      actor: input.actor || "armed_continuum",
      transitionMode: input.transitionMode || "AUTO",
      reasonCode: input.reasonCode,
      previousEventHash,
      result: input.result || null,
      metadata: common.sanitizeEvidence(input.metadata || {})
    });
    event.eventHash = hashEvent(event);

    fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`);
    sequence = nextSequence;
    previousEventHash = event.eventHash;
    tailHash = event.eventHash;
    if (sequence === 1) headHash = event.eventHash;
    return event;
  }

  function seal() {
    sealed = true;
    return { headHash, tailHash, count: sequence };
  }

  return {
    filePath,
    appendEvent,
    seal,
    getHeadHash: () => headHash,
    getTailHash: () => tailHash,
    getCount: () => sequence
  };
}

module.exports = {
  SCHEMA_VERSION,
  canonicalEventBody,
  hashEvent,
  createEventLog
};
