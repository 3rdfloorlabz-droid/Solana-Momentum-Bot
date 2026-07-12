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
r14.checkExecutionTimeLiquidity(undefined, cfg, { kind: "BUY" });

expectCode(codes.LIQUIDITY_BELOW_FLOOR, () =>
  r14.checkExecutionTimeLiquidity(undefined, cfg, { kind: "SELL" })
);

expectCode(codes.LIQUIDITY_BELOW_FLOOR, () =>
  r14.checkExecutionTimeLiquidity(24999, cfg, { kind: "SELL" })
);

r14.checkExecutionTimeLiquidity(25000, cfg, { kind: "SELL" });
r14.checkExecutionTimeLiquidity(30000, cfg, { kind: "SELL" });

console.log("SELL LIQUIDITY PARITY TEST PASSED");
