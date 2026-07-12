"use strict";

const fs = require("fs");
const path = require("path");
const common = require("./live_validation_common");
const checks = require("./armed_preflight_checks");
const manifest = require("./armed_preflight_manifest");
const session = require("./armed_preflight_session");

function applyRunOptions(adapters, options = {}) {
  if (options.sessionLinkage) session.applySessionLinkage(adapters, options.sessionLinkage);
  if (options.sessionId) adapters.sessionId = options.sessionId;
  if (options.armingBaselineHash) adapters.armingBaselineHash = options.armingBaselineHash;
  if (options.cliInputsEcho) adapters.cliInputsEcho = options.cliInputsEcho;
  if (options.proofContext) adapters.proofContext = options.proofContext;
  return adapters;
}

async function runArmedPreflight(options = {}) {
  const root = options.root || __dirname;
  const adapters = options.adapters || checks.createDefaultAdapters(root);
  applyRunOptions(adapters, options);

  const startedAt = common.nowIso();
  const cfg = adapters.loadConfig();
  const postureEval = checks.evaluatePosture(cfg, adapters);

  if (!postureEval.ok && !options.forceChecks) {
    const receipt = common.buildReceipt({
      toolName: "validate_armed_preflight",
      context: options.proofContext || "armed-preflight",
      startedAt,
      completedAt: common.nowIso(),
      overallStatus: "WRONG_POSTURE",
      posture: postureEval,
      fingerprints: checks.buildFingerprints(adapters, cfg),
      checks: [],
      failures: ["wrong posture — requires LIVE_ARMED"]
    });
    common.assertNoSecretInReceipt(receipt);
    return { exitCode: 2, receipt, wrongPosture: true };
  }

  const result = await checks.runAllChecks(adapters, { skipPostureGate: options.forceChecks === true });
  if (result.wrongPosture) {
    const receipt = common.buildReceipt({
      toolName: "validate_armed_preflight",
      context: options.proofContext || "armed-preflight",
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      overallStatus: "WRONG_POSTURE",
      posture: result.posture,
      fingerprints: checks.buildFingerprints(adapters, cfg),
      checks: [],
      failures: result.failures
    });
    common.assertNoSecretInReceipt(receipt);
    return { exitCode: 2, receipt, wrongPosture: true };
  }

  const aggregate = manifest.aggregateOverallStatus(result.checks);
  const receipt = common.buildReceipt({
    toolName: "validate_armed_preflight",
    context: options.proofContext || "armed-preflight",
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    overallStatus: aggregate.overallStatus,
    posture: result.posture,
    fingerprints: checks.buildFingerprints(adapters, cfg),
    checks: result.checks,
    failures: result.failures
  });
  common.assertNoSecretInReceipt(receipt);

  const exitCode = aggregate.overallStatus === "PASS" ? 0 : 1;
  return { exitCode, receipt, wrongPosture: false };
}

function buildOptionsFromCli(parsed, root) {
  if (!parsed.ok) {
    return { cliErrors: parsed.errors };
  }
  if (!parsed.wantsProofInputs) return {};

  const documents = session.resolveAuthorizationDocuments({
    sessionManifest: parsed.sessionManifest,
    authPaths: parsed.authPaths,
    sessionId: parsed.sessionId,
    proofContext: parsed.proofContext
  }, root);

  const chainValidation = session.validateProofAuthorizationChain(documents, parsed.sessionId);
  if (!chainValidation.ok) {
    return { cliErrors: chainValidation.errors };
  }

  return {
    sessionId: parsed.sessionId,
    armingBaselineHash: parsed.armingBaselineHash,
    proofContext: parsed.proofContext,
    cliInputsEcho: parsed.cliInputsEcho,
    sessionLinkage: {
      sessionId: parsed.sessionId,
      armingBaselineHash: parsed.armingBaselineHash,
      proofContext: parsed.proofContext,
      authorizationChainMode: "armed-no-submit-proof",
      documents,
      authorizationMetadata: chainValidation.metadata
    }
  };
}

async function main(argv = process.argv.slice(2)) {
  const jsonOut = argv.includes("--json");
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;

  try {
    const parsed = session.parseArmedPreflightCli(argv);
    const runOptions = buildOptionsFromCli(parsed, __dirname);
    if (runOptions.cliErrors?.length) {
      process.stderr.write(`validate_armed_preflight: ${runOptions.cliErrors.join("; ")}\n`);
      process.exit(1);
    }

    const result = await runArmedPreflight(runOptions);
    const serialized = common.serializeReceipt(result.receipt);
    if (outPath) fs.writeFileSync(outPath, serialized);
    if (jsonOut || !outPath) process.stdout.write(serialized);

    if (result.wrongPosture) {
      process.stderr.write("validate_armed_preflight: wrong posture (exit 2)\n");
      process.exit(2);
    }
    if (result.exitCode !== 0) {
      process.stderr.write(`validate_armed_preflight: validation failed (exit ${result.exitCode})\n`);
      process.exit(result.exitCode);
    }
    process.exit(0);
  } catch (error) {
    process.stderr.write(`validate_armed_preflight: internal error — ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runArmedPreflight, buildOptionsFromCli, applyRunOptions };
