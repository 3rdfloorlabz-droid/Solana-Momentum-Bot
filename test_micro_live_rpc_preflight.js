"use strict";

// test_micro_live_rpc_preflight.js — R41C dedicated RPC + signer readiness (temp fixtures only).

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r41c = require("./micro_live_rpc_preflight");
const capsModule = require("./micro_live_caps");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const REPO_LIVE_POSITIONS = path.join(__dirname, "live_positions.json");
const REPO_CAPS = path.join(__dirname, "operator_records", "micro_live_demo_caps.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;
const beforeLivePositionsHash = fs.existsSync(REPO_LIVE_POSITIONS) ? fs.readFileSync(REPO_LIVE_POSITIONS) : null;
const beforeCapsHash = fs.existsSync(REPO_CAPS) ? fs.readFileSync(REPO_CAPS) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r41c-runtime-"));
const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "r41c-repo-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r41c-output-"));
const G = "\x1b[32m✔\x1b[0m";

function writeSafePosture(overrides = {}) {
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false,
      ...overrides
    }, null, 2)}\n`
  );
}

function writeGateDoc(repoRoot) {
  fs.mkdirSync(path.join(repoRoot, "docs"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, "docs", "R41C_DEDICATED_RPC_AND_SIGNER_READINESS.md"), "# R41C fixture\n");
}

function writeRequiredSignerFiles(repoRoot) {
  for (const rel of r41c.REQUIRED_SIGNER_FILES) {
    const full = path.join(repoRoot, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (rel === "local_signer.js") {
      fs.writeFileSync(full, [
        "module.exports = {",
        "  LOCAL_SIGNER_STUB_PUBLIC_KEY: 'LOCAL_SIGNER_STUB_NOT_ARMED',",
        "  R41B_VERDICT: 'LOCAL SIGNER STUB ONLY — REAL SIGNING NOT IMPLEMENTED',",
        "  createLocalSignerStub() { throw Object.assign(new Error('LOCAL_SIGN_NOT_IMPLEMENTED'), { code: 'LOCAL_SIGN_NOT_IMPLEMENTED' }); }",
        "  loadSignerFromApprovedSource() { return this.createLocalSignerStub(); }",
        "};"
      ].join("\n"));
    } else if (rel === "signer_provider.js") {
      fs.writeFileSync(full, [
        "const localSigner = require('./local_signer');",
        "module.exports = {",
        "  createSignerFromProvider() {",
        "    throw Object.assign(new Error('local_real blocked'), { code: 'PROVIDER_BLOCKED' });",
        "  }",
        "};"
      ].join("\n"));
    } else {
      fs.writeFileSync(full, `"${rel}"\n`);
    }
  }
}

function writeWalletStatus() {
  fs.writeFileSync(
    path.join(tmpRuntime, "wallet_status.json"),
    `${JSON.stringify({ updatedAt: new Date().toISOString(), balanceSol: 0.1 }, null, 2)}\n`
  );
}

function draftCaps(overrides = {}) {
  return {
    approved: false,
    approvedBy: "",
    approvedAt: null,
    purpose: capsModule.REQUIRED_PURPOSE,
    maxTradeSizeSol: 0.01,
    maxDailyLossSol: 0.05,
    maxTradesPerSession: 1,
    maxOpenLivePositions: 1,
    autoCompoundingAllowed: false,
    requireHumanPresent: true,
    stopAfterFirstTransaction: true,
    notes: "test fixture only",
    ...overrides
  };
}

function writeDraftCaps(repoRoot, overrides = {}) {
  const dir = path.join(repoRoot, "operator_records");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "micro_live_demo_caps.json"),
    `${JSON.stringify(draftCaps(overrides), null, 2)}\n`
  );
}

function baseOptions(overrides = {}) {
  writeSafePosture();
  writeGateDoc(tmpRepo);
  writeRequiredSignerFiles(tmpRepo);
  writeDraftCaps(tmpRepo);
  writeWalletStatus();
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRepo,
    analysisDir: tmpOutput,
    gateDocPresent: true,
    recoveryPresent: false,
    runSecretScan: false,
    secretScanFindings: [],
    rpcCandidates: [{
      source: "SOLANA_RPC_URL",
      url: "https://dedicated-provider.example/rpc"
    }],
    ...overrides
  };
}

function assertThrowsReadiness(fn, expectedVerdict) {
  const status = fn();
  assert.strictEqual(status.readinessVerdict, expectedVerdict);
}

function assertRedacted(endpoint) {
  assert.ok(
    endpoint.includes("[REDACTED]")
    || endpoint.includes("%5BREDACTED%5D")
    || decodeURIComponent(endpoint).includes("[REDACTED]")
  );
}

async function runTests() {
  const outputFile = path.join(tmpOutput, "r41c_rpc_signer_readiness.json");

  const missingRpc = r41c.collectR41cRpcSignerReadiness(baseOptions({ rpcCandidates: [] }));
  assert.strictEqual(missingRpc.dedicatedRpc.ok, false);
  assert.ok(missingRpc.failedChecks.includes("dedicated_rpc_configured"));
  console.log(`${G} missing RPC config fails`);

  const placeholderRpc = r41c.checkDedicatedRpc({
    rpcCandidates: [{ source: "SOLANA_RPC_URL", url: "https://placeholder.example/rpc" }]
  });
  assert.strictEqual(placeholderRpc.ok, false);
  console.log(`${G} placeholder RPC fails`);

  const publicRpc = r41c.checkDedicatedRpc({
    rpcCandidates: [{ source: "SOLANA_RPC_URL", url: "https://api.mainnet-beta.solana.com" }]
  });
  assert.strictEqual(publicRpc.ok, false);
  assert.strictEqual(publicRpc.publicFallbackDetected, true);
  console.log(`${G} public fallback RPC fails`);

  const secretKey = "super-secret-api-key-value-1234567890";
  const keyedUrl = `https://mainnet.helius-rpc.com/?api-key=${secretKey}`;
  const redacted = r41c.checkDedicatedRpc({
    rpcCandidates: [{ source: "HELIUS_RPC_URL", url: keyedUrl }]
  });
  assert.strictEqual(redacted.ok, true);
  assert.ok(!JSON.stringify(redacted).includes(secretKey));
  assertRedacted(redacted.redactedEndpoint);
  r41c.runR41cRpcSignerReadiness({
    ...baseOptions({
      rpcCandidates: [{ source: "HELIUS_RPC_URL", url: keyedUrl }]
    }),
    outputFile,
    writeOutput: true,
    print: false
  });
  const outputJson = fs.readFileSync(outputFile, "utf8");
  assert.ok(!outputJson.includes(secretKey));
  assertRedacted(outputJson);
  console.log(`${G} full RPC URL with key is redacted in output`);

  const missingSigner = r41c.collectR41cRpcSignerReadiness({
    ...baseOptions(),
    requiredSignerFilesCheck: { ok: false, missing: ["local_signer.js"], present: [] }
  });
  assert.strictEqual(missingSigner.readinessVerdict, r41c.READINESS_VERDICTS.NOT_READY);
  console.log(`${G} missing local_signer.js fails`);

  const integrated = r41c.collectR41cRpcSignerReadiness({
    ...baseOptions(),
    executorIntegrationCheck: { integrated: true, ok: false, note: "integrated" }
  });
  assert.strictEqual(integrated.readinessVerdict, r41c.READINESS_VERDICTS.NOT_READY);
  console.log(`${G} live_executor importing signer before approval fails`);

  const prematureCaps = r41c.collectR41cRpcSignerReadiness({
    ...baseOptions(),
    capsLoad: {
      status: "present",
      data: draftCaps({ approved: true, approvedBy: "too-early", approvedAt: new Date().toISOString() })
    }
  });
  assert.strictEqual(prematureCaps.operatorCaps.prematureApproval, true);
  assert.strictEqual(prematureCaps.readinessVerdict, r41c.READINESS_VERDICTS.NOT_READY);
  console.log(`${G} caps approved true before R43 fails`);

  const draftOk = r41c.checkOperatorCapsDraft(tmpRepo, {
    capsLoad: { status: "present", data: draftCaps() }
  });
  assert.strictEqual(draftOk.ok, true);
  assert.strictEqual(draftOk.approved, false);
  console.log(`${G} caps approved false with conservative limits passes caps-draft check`);

  assertThrowsReadiness(
    () => r41c.collectR41cRpcSignerReadiness({ ...baseOptions(), recoveryPresent: true }),
    r41c.READINESS_VERDICTS.NOT_READY
  );
  console.log(`${G} recovery_actions.jsonl present fails`);

  assertThrowsReadiness(
    () => r41c.collectR41cRpcSignerReadiness({
      ...baseOptions(),
      posture: {
        available: true,
        executionMode: "PIPELINE_DRY_RUN",
        dryRunMode: true,
        liveArmed: true,
        emergencyStop: false
      }
    }),
    r41c.READINESS_VERDICTS.NOT_READY
  );
  console.log(`${G} liveArmed true fails`);

  assertThrowsReadiness(
    () => r41c.collectR41cRpcSignerReadiness({
      ...baseOptions(),
      posture: {
        available: true,
        executionMode: "PIPELINE_DRY_RUN",
        dryRunMode: false,
        liveArmed: false,
        emergencyStop: false
      }
    }),
    r41c.READINESS_VERDICTS.NOT_READY
  );
  console.log(`${G} dryRunMode false fails`);

  assertThrowsReadiness(
    () => r41c.collectR41cRpcSignerReadiness({
      ...baseOptions(),
      posture: {
        available: true,
        executionMode: "LIVE",
        dryRunMode: true,
        liveArmed: false,
        emergencyStop: false
      }
    }),
    r41c.READINESS_VERDICTS.NOT_READY
  );
  console.log(`${G} executionMode LIVE fails`);

  const analysisResult = r41c.runR41cRpcSignerReadiness({
    ...baseOptions(),
    outputFile,
    writeOutput: true,
    print: false
  });
  assert.ok(outputFile.startsWith(tmpOutput));
  assert.strictEqual(analysisResult.status.approved, false);
  const analysisOutputJson = fs.readFileSync(outputFile, "utf8");
  assert.ok(!analysisOutputJson.includes("super-secret-api-key-value-1234567890"));
  console.log(`${G} output only writes to analysis/`);

  console.log(`${G} no secrets printed`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  if (beforeLivePositionsHash) {
    assert.ok(beforeLivePositionsHash.equals(fs.readFileSync(REPO_LIVE_POSITIONS)));
  }
  if (beforeCapsHash) {
    assert.ok(beforeCapsHash.equals(fs.readFileSync(REPO_CAPS)));
    console.log(`${G} operator caps draft unchanged`);
  }
  console.log(`${G} no trading state mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  console.log("\nMICRO-LIVE RPC PREFLIGHT TEST PASSED (16/16)");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
}).finally(() => {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpRepo, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
});
