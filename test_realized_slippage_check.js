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

const cfg = { realizedSlippageHaltBps: 200 };

assert(r14.evaluateRealizedSlippage("1000", 1000, cfg).realizedSlippageBps === 0, "equal fill ok");
assert(r14.evaluateRealizedSlippage("1000", 1005, cfg).realizedSlippageBps === 0, "better fill ok");

const warn = r14.evaluateRealizedSlippage("10000", 9850, cfg);
assert(warn.warn === true && warn.realizedSlippageBps === 150, "150 bps shortfall warns");

expectCode(codes.REALIZED_SLIPPAGE_HALT, () =>
  r14.evaluateRealizedSlippage("10000", 9700, cfg)
);

console.log("REALIZED SLIPPAGE CHECK TEST PASSED");
