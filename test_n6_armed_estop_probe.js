"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const common = require("./live_validation_common");
const checks = require("./armed_preflight_checks");

const PROD_CONFIG = path.join(__dirname, "live_config.json");

function sha256File(filePath) {
  return common.hashFile(filePath);
}

async function runProbe(options = {}) {
  const productionRoot = options.productionRoot || __dirname;
  const prodConfigPath = path.join(productionRoot, "live_config.json");
  const prodHashBefore = sha256File(prodConfigPath);
  const adapters = options.adapters || checks.createDefaultAdapters(productionRoot);
  const cfg = adapters.loadConfig();
  const posture = checks.evaluatePosture(cfg, adapters);

  if (!posture.ok) {
    return {
      ok: false,
      reason: "production posture not LIVE_ARMED",
      evidence: { productionConfigHashSha256: prodHashBefore, posture }
    };
  }

  if (cfg.emergencyStop === true) {
    return {
      ok: false,
      reason: "production emergencyStop active",
      evidence: { productionConfigHashSha256: prodHashBefore }
    };
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "n6a-estop-probe-"));
  const previousRuntimeRoot = process.env.TRACKTA_RUNTIME_ROOT;
  process.env.TRACKTA_RUNTIME_ROOT = tempRoot;

  const evidence = {
    tempRoot,
    productionConfigHashBefore: prodHashBefore,
    steps: []
  };

  let r16 = null;
  try {
    fs.writeFileSync(path.join(tempRoot, "live_config.json"), JSON.stringify({
      ...cfg,
      emergencyStop: false,
      executionMode: "LIVE",
      dryRunMode: false
    }, null, 2));

    const executor = require("./live_executor");
    r16 = executor.__r16LivePathTest;
    const codes = executor.__executionLoggingTest.EXECUTION_ABORT_CODES;

    r16.resetSignerLoaderForTest();
    r16.setSignerLoaderForTest(() => ({ publicKey: cfg.walletPublicAddress || "11111111111111111111111111111111" }));
    r16.setApprovalRecordProviderForTest(() => ({
      approvalId: "N6A-probe",
      operatorName: "probe",
      dateTime: new Date().toISOString(),
      operatorSignaturePresent: true,
      acknowledgments: Object.fromEntries([
        "totalLossRiskAcknowledged",
        "slippageCapAcknowledged",
        "mevProtectionPlanAcknowledged",
        "emergencyStopPolicyAcknowledged",
        "noAutoCompoundingAcknowledged",
        "noAveragingDownAcknowledged",
        "noUnattendedExecutionAcknowledged",
        "liveTradingNotForIncomeAcknowledged"
      ].map(k => [k, true])),
      finalApprovalStatus: require("./r15_manual_approval_check").APPROVAL_STATUSES.ONE_SESSION_ONLY
    }));

    const harnessCfg = JSON.parse(fs.readFileSync(path.join(tempRoot, "live_config.json"), "utf8"));

    try {
      r16.assertLivePathPreSubmit(harnessCfg, {
        kind: "BUY",
        tokenAddress: "11111111111111111111111111111111",
        pairAddress: "n6a-probe"
      });
      evidence.steps.push({ step: "N6A-3", pass: true, detail: "pre-submit guards reachable in harness" });
    } catch (error) {
      evidence.steps.push({ step: "N6A-3", pass: false, detail: error.message });
      return { ok: false, reason: "pre-submit guard probe failed in harness", evidence };
    } finally {
      r16.clearAllLiveSubmitInFlightForTest();
    }

    harnessCfg.emergencyStop = true;
    fs.writeFileSync(path.join(tempRoot, "live_config.json"), JSON.stringify(harnessCfg, null, 2));

    let blocked = false;
    try {
      r16.assertLivePathPreSubmit(harnessCfg, {
        kind: "BUY",
        tokenAddress: "11111111111111111111111111111111",
        pairAddress: "n6a-probe"
      });
    } catch (error) {
      blocked = error.code === codes.EMERGENCY_STOP_ACTIVE || /Emergency stop/i.test(error.message || "");
      evidence.steps.push({ step: "N6A-5", pass: blocked, detail: error.message || String(error) });
    }

    if (!blocked) {
      return { ok: false, reason: "halt did not block new entry in harness", evidence };
    }

    const prodHashAfter = sha256File(prodConfigPath);
    evidence.productionConfigHashAfter = prodHashAfter;
    evidence.productionConfigUnchanged = prodHashBefore === prodHashAfter;

    if (!evidence.productionConfigUnchanged) {
      return { ok: false, reason: "production config hash changed", evidence };
    }

    evidence.note = "Does not replace full dry N6 drill for Domains A or C";
    return { ok: true, evidence };
  } finally {
    r16?.resetSignerLoaderForTest?.();
    r16?.resetApprovalRecordProviderForTest?.();
    if (previousRuntimeRoot === undefined) delete process.env.TRACKTA_RUNTIME_ROOT;
    else process.env.TRACKTA_RUNTIME_ROOT = previousRuntimeRoot;
    try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

async function main() {
  const result = await runProbe();
  if (!result.ok) {
    console.error("N6 ARMED E-STOP PROBE FAILED:", result.reason);
    process.exit(1);
  }
  console.log("N6 ARMED E-STOP PROBE PASSED");
  console.log(JSON.stringify(result.evidence, null, 2));
  process.exit(0);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runProbe };
