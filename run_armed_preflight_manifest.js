"use strict";

const fs = require("fs");
const path = require("path");
const common = require("./live_validation_common");
const manifest = require("./armed_preflight_manifest");
const session = require("./armed_preflight_session");
const { runArmedPreflight, buildOptionsFromCli } = require("./validate_armed_preflight");

async function runArmedPreflightManifest(options = {}) {
  const startedAt = common.nowIso();
  const validatorResult = await runArmedPreflight(options);

  const manifestValidation = manifest.validateManifestResults(validatorResult.receipt.checks || []);
  const failures = [...(validatorResult.receipt.failures || [])];
  if (!manifestValidation.ok) failures.push(...manifestValidation.errors);

  let overallStatus = validatorResult.receipt.overallStatus;
  if (validatorResult.wrongPosture) overallStatus = "WRONG_POSTURE";
  else if (!manifestValidation.ok) overallStatus = "FAIL";
  else if (overallStatus !== "PASS") overallStatus = "FAIL";

  const receipt = common.buildReceipt({
    toolName: "run_armed_preflight_manifest",
    context: options.proofContext || "armed-preflight-manifest",
    startedAt,
    completedAt: common.nowIso(),
    overallStatus,
    posture: validatorResult.receipt.posture,
    fingerprints: {
      ...(validatorResult.receipt.fingerprints || {}),
      manifestVersion: manifest.MANIFEST_VERSION,
      manifestOrder: manifest.AP_ORDER
    },
    checks: validatorResult.receipt.checks || [],
    failures
  });
  common.assertNoSecretInReceipt(receipt);

  let exitCode = 0;
  if (validatorResult.wrongPosture) exitCode = 2;
  else if (overallStatus !== "PASS") exitCode = 1;

  return { exitCode, receipt, validatorResult };
}

async function main(argv = process.argv.slice(2)) {
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  try {
    const parsed = session.parseArmedPreflightCli(argv);
    const runOptions = buildOptionsFromCli(parsed, __dirname);
    if (runOptions.cliErrors?.length) {
      process.stderr.write(`run_armed_preflight_manifest: ${runOptions.cliErrors.join("; ")}\n`);
      process.exit(1);
    }

    const result = await runArmedPreflightManifest(runOptions);
    const serialized = common.serializeReceipt(result.receipt);
    if (outPath) fs.writeFileSync(outPath, serialized);
    process.stdout.write(serialized);
    process.exit(result.exitCode);
  } catch (error) {
    process.stderr.write(`run_armed_preflight_manifest: internal error — ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runArmedPreflightManifest };
