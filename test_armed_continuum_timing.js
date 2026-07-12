"use strict";

const assert = require("assert");
const timing = require("./armed_continuum_timing");

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

test("constants match planning values", () => {
  assert.strictEqual(timing.ARMED_CAP_MS, 900000);
  assert.strictEqual(timing.MIN_POST_STUB_REMAINING_MS, 720000);
  assert.strictEqual(timing.MIN_AP_REMAINING_MS, 600000);
  assert.strictEqual(timing.MIN_N6_REMAINING_MS, 480000);
});

test("remaining time decreases with mock clock", () => {
  let now = 0n;
  const clock = { monotonicNs: () => { now += 60_000_000_000n; return now; } };
  const timer = timing.createArmedTimer({ clock, capMs: 900000 });
  const first = timing.remainingMs(timer, clock);
  const second = timing.remainingMs(timer, clock);
  assert.ok(second < first);
});

test("assertMinRemaining passes at exact threshold", () => {
  const clock = { monotonicNs: () => 0n };
  const timer = timing.createArmedTimer({ clock, capMs: 900000 });
  const check = timing.assertMinRemaining(timer, 720000, clock);
  assert.strictEqual(check.ok, true);
  assert.strictEqual(check.remainingMs, 900000);
});

test("assertMinRemaining fails below threshold", () => {
  let now = 0n;
  const clock = { monotonicNs: () => now };
  const timer = timing.createArmedTimer({ clock, capMs: 900000 });
  now = 240_000_000_000n;
  const check = timing.assertMinRemaining(timer, 720000, clock);
  assert.strictEqual(check.ok, false);
});

test("monotonic regression detected", () => {
  const anomaly = timing.detectMonotonicAnomaly(100n, { monotonicNs: () => 50n });
  assert.strictEqual(anomaly.ok, false);
  assert.strictEqual(anomaly.reason, "MONOTONIC_TIMER_ANOMALY");
});

test("missing timer reading fails closed", () => {
  const anomaly = timing.detectMonotonicAnomaly(100n, {
    monotonicNs: () => { throw new Error("missing"); }
  });
  assert.strictEqual(anomaly.ok, false);
  assert.strictEqual(anomaly.detail, "missing_timer_reading");
});

test("impossible forward jump detected", () => {
  const anomaly = timing.detectMonotonicAnomaly(0n, { monotonicNs: () => 10_000_000_000n }, { maxForwardJumpMs: 1000 });
  assert.strictEqual(anomaly.ok, false);
  assert.strictEqual(anomaly.detail, "IMPOSSIBLE_FORWARD_JUMP");
});

test("rollback initiation exactly 5000 ms passes", () => {
  const check = timing.assertRollbackInitiationDelay(0n, 5_000_000_000n, 5000);
  assert.strictEqual(check.ok, true);
  assert.strictEqual(check.delayMs, 5000);
});

test("rollback initiation 4999 ms passes", () => {
  const check = timing.assertRollbackInitiationDelay(0n, 4_999_000_000n, 5000);
  assert.strictEqual(check.ok, true);
});

test("rollback initiation 5001 ms records violation", () => {
  const check = timing.assertRollbackInitiationDelay(0n, 5_001_000_000n, 5000);
  assert.strictEqual(check.ok, false);
  assert.strictEqual(check.reason, "ROLLBACK_INITIATION_DELAY_EXCEEDED");
});

test("domain C reserve exactly 180000 ms passes", () => {
  const check = timing.assertDomainCReserve(180000, 180000);
  assert.strictEqual(check.ok, true);
});

test("domain C reserve 180001 ms passes", () => {
  const check = timing.assertDomainCReserve(180001, 180000);
  assert.strictEqual(check.ok, true);
});

test("domain C reserve 179999 ms records violation", () => {
  const check = timing.assertDomainCReserve(179999, 180000);
  assert.strictEqual(check.ok, false);
  assert.strictEqual(check.reason, "DOMAIN_C_RESERVE_VIOLATION");
});

test("legal transition chain passes", () => {
  const stateMod = require("./armed_continuum_state");
  assert.strictEqual(stateMod.assertLegalTransition("PRECHECK", "ARMING").ok, true);
  assert.strictEqual(stateMod.assertLegalTransition("ARMING", "STUB").ok, true);
  assert.strictEqual(stateMod.assertLegalTransition("STUB", "AP").ok, true);
  assert.strictEqual(stateMod.assertLegalTransition("AP", "N6").ok, true);
  assert.strictEqual(stateMod.assertLegalTransition("N6", "ROLLBACK").ok, true);
  assert.strictEqual(stateMod.assertLegalTransition("ROLLBACK", "DOMAIN_C").ok, true);
});

test("illegal transition rejected", () => {
  const stateMod = require("./armed_continuum_state");
  assert.strictEqual(stateMod.assertLegalTransition("STUB", "N6").ok, false);
  assert.strictEqual(stateMod.assertLegalTransition("STUB", "FINALIZE").ok, false);
});

test("missing timer data fails closed", () => {
  assert.throws(() => timing.remainingMs(null));
});

if (failed > 0) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed}/${passed + failed} timing tests passed`);
