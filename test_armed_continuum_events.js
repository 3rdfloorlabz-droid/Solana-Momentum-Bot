"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const events = require("./armed_continuum_events");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`✔ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`✘ ${name}`);
    console.error(`  ${error.message}`);
  }
}

test("hash chain links events", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "evt-"));
  const file = path.join(tmp, "events.jsonl");
  const log = events.createEventLog({ filePath: file });
  const e1 = log.appendEvent({
    sessionId: "RB-G9-20260711-AP99",
    continuumRunId: "run-1",
    state: "PRECHECK",
    eventType: "PRECHECK_COMPLETE",
    reasonCode: "PRECHECK_COMPLETE",
    result: "PASS"
  });
  const e2 = log.appendEvent({
    sessionId: "RB-G9-20260711-AP99",
    continuumRunId: "run-1",
    state: "ARMING",
    eventType: "C1_COMPLETE",
    reasonCode: "C1_COMPLETE",
    result: "PASS"
  });
  assert.strictEqual(e2.previousEventHash, e1.eventHash);
  assert.notStrictEqual(e1.eventHash, e2.eventHash);
});

test("sequence mismatch rejected", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "evt-"));
  const file = path.join(tmp, "events.jsonl");
  const log = events.createEventLog({ filePath: file });
  log.appendEvent({
    sessionId: "RB-G9-20260711-AP99",
    continuumRunId: "run-1",
    state: "PRECHECK",
    eventType: "PRECHECK_COMPLETE",
    reasonCode: "PRECHECK_COMPLETE"
  });
  assert.throws(() => log.appendEvent({
    sessionId: "RB-G9-20260711-AP99",
    continuumRunId: "run-1",
    sequence: 5,
    state: "ARMING",
    eventType: "C1_COMPLETE",
    reasonCode: "C1_COMPLETE"
  }), /sequence mismatch/);
});

test("previous hash mismatch rejected", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "evt-"));
  const file = path.join(tmp, "events.jsonl");
  const log = events.createEventLog({ filePath: file });
  log.appendEvent({
    sessionId: "RB-G9-20260711-AP99",
    continuumRunId: "run-1",
    state: "PRECHECK",
    eventType: "PRECHECK_COMPLETE",
    reasonCode: "PRECHECK_COMPLETE"
  });
  assert.throws(() => log.appendEvent({
    sessionId: "RB-G9-20260711-AP99",
    continuumRunId: "run-1",
    previousEventHash: "deadbeef",
    state: "ARMING",
    eventType: "C1_COMPLETE",
    reasonCode: "C1_COMPLETE"
  }), /previous event hash mismatch/);
});

if (failed > 0) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed}/${passed + failed} event tests passed`);
