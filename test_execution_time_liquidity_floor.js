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

const cfg = { minPoolLiquidityUsd: 25000 };

r14.checkExecutionTimeLiquidity(30000, cfg);
r14.checkExecutionTimeLiquidity(undefined, cfg);

expectCode(codes.LIQUIDITY_BELOW_FLOOR, () =>
  r14.checkExecutionTimeLiquidity(24999, cfg)
);

expectCode(codes.LIQUIDITY_BELOW_FLOOR, () =>
  r14.checkExecutionTimeLiquidity(Number.NaN, cfg)
);

console.log("EXECUTION TIME LIQUIDITY FLOOR TEST PASSED");
