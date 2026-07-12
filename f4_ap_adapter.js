"use strict";

const checks = require("./armed_preflight_checks");
const session = require("./armed_preflight_session");
const { runArmedPreflightManifest } = require("./run_armed_preflight_manifest");

/**
 * F4 real AP adapter.
 *
 * Wires run_armed_continuum.js's `deps.runApManifest(cli, deps)` dependency-
 * injection point to the real AP-01..AP-20 preflight manifest executor
 * (run_armed_preflight_manifest.js -> armed_preflight_checks.js). Read/probe
 * only: no signer, no submit, no broadcast. See DECISION — RB-G9 Armed
 * Continuum Remediation Acceptance — 2026-07-11 §6/§9.
 *
 * AP-17 ("N6 armed-safe e-stop probe") is forced deferred to the continuum's
 * own N6 stage via `deferAp17ToContinuum: true`. Without this, AP-17 would
 * invoke test_n6_armed_estop_probe.js's runProbe() a second time here, on
 * top of the continuum's own N6 stage invocation — a real functional double
 * invocation that the continuum's "N6 retry forbidden" counter does not
 * catch, because that counter only tracks calls to deps.runN6Probe, not
 * calls made from inside the AP stage. This adapter fails closed if the
 * deferral did not actually take effect, rather than silently allowing it.
 */
async function runApManifest(cli, deps) {
  let adapters;
  try {
    adapters = checks.createDefaultAdapters(deps.root);
  } catch (error) {
    return { ok: false, reason: `AP adapter construction threw: ${error.message || String(error)}` };
  }
  adapters.deferAp17ToContinuum = true;

  const sessionLinkage = {
    sessionId: cli.sessionId,
    armingBaselineHash: cli.armingBaselineHash,
    proofContext: session.PROOF_CONTEXT,
    authorizationChainMode: "armed-no-submit-proof",
    documents: deps.documents || {},
    authorizationMetadata: deps.authorizationMetadata || {}
  };

  let result;
  try {
    result = await runArmedPreflightManifest({
      adapters,
      sessionLinkage,
      sessionId: cli.sessionId,
      armingBaselineHash: cli.armingBaselineHash,
      proofContext: session.PROOF_CONTEXT
    });
  } catch (error) {
    return { ok: false, reason: `AP manifest execution threw: ${error.message || String(error)}` };
  }

  // Re-check deferAp17ToContinuum survived the call, defensively — applyRunOptions
  // (inside runArmedPreflight) does not touch this flag today, but this adapter
  // must not silently trust that stays true forever.
  if (adapters.deferAp17ToContinuum !== true) {
    return {
      ok: false,
      reason: "deferAp17ToContinuum flag was cleared during AP manifest execution — refusing to proceed"
    };
  }

  const { exitCode, receipt, wrongPosture } = result;
  const ap17 = (receipt?.checks || []).find(c => c.checkId === "AP-17");
  const ap17DeferredCorrectly = ap17
    && ap17.status === "NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE"
    && ap17.evidence?.deferredTo === "armed_continuum_n6_state"
    && ap17.evidence?.n6InvokedInApStage === false;

  // Only enforce the deferral check when checks actually ran far enough to reach
  // AP-17 (i.e. posture was right and AP-17 wasn't skipped some other way).
  // If posture was wrong, AP-17 never ran at all — that is its own failure below,
  // not a deferral failure, and must not be misreported as one.
  if (!wrongPosture && !ap17DeferredCorrectly) {
    return {
      ok: false,
      reason: "AP-17 was not deferred to the continuum N6 stage as expected — refusing to proceed to avoid a duplicate N6 probe invocation",
      summary: { overallStatus: receipt?.overallStatus, ap17: ap17 || null }
    };
  }

  if (wrongPosture || exitCode !== 0) {
    return {
      ok: false,
      reason: wrongPosture
        ? "AP manifest reports wrong posture (not LIVE_ARMED) — refusing to proceed"
        : "AP manifest reports FAIL",
      summary: {
        overallStatus: receipt?.overallStatus || null,
        failures: receipt?.failures || [],
        receiptSha256: receipt?.receiptSha256 || null
      }
    };
  }

  return {
    ok: true,
    summary: {
      overallStatus: receipt.overallStatus,
      manifestVersion: receipt.fingerprints?.manifestVersion || null,
      checkCount: (receipt.checks || []).length,
      ap17Deferred: true,
      receiptSha256: receipt.receiptSha256
    }
  };
}

module.exports = { runApManifest };
