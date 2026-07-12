"use strict";

const executor = require("./live_executor");
const r14 = executor.__r14EnforcementTest;
const codes = r14.EXECUTION_ABORT_CODES;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectCode(code, fn) {
  try {
    fn();
  } catch (error) {
    assert(error.code === code, `expected ${code}, got ${error.code || error.name}`);
    return;
  }
  throw new Error(`expected ${code}, but call succeeded`);
}

assert(r14.detectPartialFill({
  actualOutAmount: 1000,
  expectedMinOut: 1000,
  partialFillSupported: false
}).partial === false, "full fill passes");

expectCode(codes.PARTIAL_FILL_UNRECONCILED, () =>
  r14.detectPartialFill({
    actualOutAmount: 900,
    expectedMinOut: 1000,
    partialFillSupported: false
  })
);

expectCode(codes.PARTIAL_FILL_UNRECONCILED, () =>
  r14.detectPartialFill({
    actualOutAmount: null,
    expectedMinOut: 1000,
    partialFillSupported: false
  })
);

console.log("PARTIAL FILL DETECTION TEST PASSED");
