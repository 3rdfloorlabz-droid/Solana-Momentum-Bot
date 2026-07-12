"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const g1 = require("./armed_g1_proof_day");

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

const validG1 = `# AUTHORIZATION — G1

**SIGNED — EFFECTIVE**

| Field | Value |
|-------|-------|
| **Signature timestamp (UTC)** | **\`2026-07-13T20:30:00Z\`** |
| **Authorization expiry (UTC)** | **\`2026-07-14T04:00:00Z\`** |
| **Assigned session ID** | **\`RB-G9-20260713-AP02\`** |
| **Confirmed operating block** | **2026-07-13 · 14:00–20:00 MDT** · UTC **\`2026-07-13T20:00:00Z\`** – **\`2026-07-14T02:00:00Z\`** |
`;

test("valid proof-day G1 passes block+60m rule", () => {
  const result = g1.validateProofDayG1({
    g1Text: validG1,
    sessionId: "RB-G9-20260713-AP02",
    proofDayLocal: "2026-07-13",
    timezone: "America/Denver",
    operatingBlockStartUtc: "2026-07-13T20:00:00Z",
    operatingBlockEndUtc: "2026-07-14T02:00:00Z",
    nowUtc: "2026-07-13T21:00:00Z"
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.reasonCode, g1.G1_REASON_CODES.OK);
});

test("AP02-class early expiry rejected", () => {
  const early = validG1.replace("2026-07-14T04:00:00Z", "2026-07-13T02:53:21Z");
  const result = g1.validateProofDayG1({
    g1Text: early,
    sessionId: "RB-G9-20260713-AP02",
    proofDayLocal: "2026-07-13",
    timezone: "America/Denver",
    operatingBlockStartUtc: "2026-07-13T20:00:00Z",
    operatingBlockEndUtc: "2026-07-14T02:00:00Z",
    nowUtc: "2026-07-13T21:00:00Z"
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reasonCode, g1.G1_REASON_CODES.G1_EXPIRY_BEFORE_BLOCK_RESERVE);
});

test("proof day not reached rejected", () => {
  const result = g1.validateProofDayG1({
    g1Text: validG1,
    sessionId: "RB-G9-20260713-AP02",
    proofDayLocal: "2026-07-13",
    timezone: "America/Denver",
    operatingBlockStartUtc: "2026-07-13T20:00:00Z",
    operatingBlockEndUtc: "2026-07-14T02:00:00Z",
    nowUtc: "2026-07-12T12:00:00Z"
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reasonCode, g1.G1_REASON_CODES.PROOF_DAY_NOT_REACHED);
});

test("stale G1 rejected", () => {
  const result = g1.validateProofDayG1({
    g1Text: validG1,
    sessionId: "RB-G9-20260713-AP02",
    proofDayLocal: "2026-07-13",
    timezone: "America/Denver",
    operatingBlockStartUtc: "2026-07-13T20:00:00Z",
    operatingBlockEndUtc: "2026-07-14T02:00:00Z",
    nowUtc: "2026-07-15T00:00:00Z"
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reasonCode, g1.G1_REASON_CODES.G1_STALE);
});

test("reused G1 path rejected", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "g1-test-"));
  const g1Path = path.join(tmp, "g1.md");
  fs.writeFileSync(g1Path, validG1);
  const result = g1.validateProofDayG1({
    g1Path,
    sessionId: "RB-G9-20260713-AP02",
    proofDayLocal: "2026-07-13",
    timezone: "America/Denver",
    operatingBlockStartUtc: "2026-07-13T20:00:00Z",
    operatingBlockEndUtc: "2026-07-14T02:00:00Z",
    nowUtc: "2026-07-13T21:00:00Z",
    consumedRegistry: [g1Path]
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reasonCode, g1.G1_REASON_CODES.G1_REUSED);
});

if (failed > 0) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed}/${passed + failed} G1 tests passed`);
