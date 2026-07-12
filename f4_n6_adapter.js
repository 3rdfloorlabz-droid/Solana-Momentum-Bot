"use strict";

const { runProbe } = require("./test_n6_armed_estop_probe");

/**
 * F4 real N6 adapter.
 *
 * Wires run_armed_continuum.js's `deps.runN6Probe(cli, deps)` dependency-
 * injection point to the real armed-safe e-stop probe
 * (test_n6_armed_estop_probe.js's runProbe). See DECISION — RB-G9 Armed
 * Continuum Remediation Acceptance — 2026-07-11 §6/§9.
 *
 * This must be the ONLY invocation of runProbe() in a correctly-wired
 * continuum run. The AP stage (f4_ap_adapter.js) is required to run with
 * deferAp17ToContinuum: true specifically so this stays true — AP-17 would
 * otherwise call runProbe() a second time from inside the AP stage. The
 * continuum orchestrator's own "N6 retry forbidden" counter only guards
 * against retries of *this* stage; it does not see a call made from inside
 * the AP stage, which is why the deferral on the AP side is load-bearing,
 * not optional.
 *
 * runProbe() itself never touches a signer or broadcasts anything: it
 * requires the real production live_config.json to already read as
 * LIVE_ARMED (i.e. this only makes sense called after the continuum's own
 * C1-C3 arming mutation, at the N6 stage), then does its actual work
 * against a scratch temp-directory copy with a mocked signer, and verifies
 * the real production live_config.json's hash is unchanged before and
 * after as part of its own pass/fail determination.
 */
async function runN6Probe(cli, deps) {
  let result;
  try {
    result = await runProbe({ productionRoot: deps.root });
  } catch (error) {
    return { ok: false, reason: `N6 probe threw: ${error.message || String(error)}` };
  }

  if (!result || typeof result !== "object") {
    return { ok: false, reason: "N6 probe returned no result" };
  }

  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason || "N6 armed e-stop probe failed",
      summary: {
        productionConfigUnchanged: result.evidence?.productionConfigUnchanged ?? null,
        steps: (result.evidence?.steps || []).map(s => ({ step: s.step, pass: s.pass }))
      }
    };
  }

  // Belt-and-suspenders: runProbe() already fails closed on config drift itself,
  // but a continuum-level adapter guarding a live-capital system should not take
  // a single upstream check's word for it without re-verifying the field exists
  // and is exactly true.
  if (result.evidence?.productionConfigUnchanged !== true) {
    return {
      ok: false,
      reason: "N6 probe reported ok but did not confirm production config hash was unchanged",
      summary: { evidence: result.evidence || null }
    };
  }

  return {
    ok: true,
    summary: {
      productionConfigUnchanged: true,
      steps: (result.evidence?.steps || []).map(s => ({ step: s.step, pass: s.pass })),
      note: result.evidence?.note || null
    }
  };
}

module.exports = { runN6Probe };
