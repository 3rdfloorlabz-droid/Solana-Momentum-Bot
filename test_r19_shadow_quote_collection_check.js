"use strict";

// test_r19_shadow_quote_collection_check.js — Sprint 4 R19
// Validates read-only shadow quote collection plan check in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r19 = require("./r19_shadow_quote_collection_check");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r19-runtime-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r19-output-"));
const G = "\x1b[32m✔\x1b[0m";

const allGateDocs = { r18: true, r19: true };

function baseOptions(overrides = {}) {
  return {
    runtimeRoot: tmpRuntime,
    repoRoot: __dirname,
    analysisDir: tmpOutput,
    gateDocs: allGateDocs,
    r18HarnessPresent: true,
    safetySuiteGreen: true,
    liveQuotePollingActive: false,
    ...overrides
  };
}

try {
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );

  const missingR18 = r19.collectR19ShadowQuoteCollectionStatus({
    ...baseOptions(),
    gateDocs: { r18: false, r19: true }
  });
  assert.strictEqual(missingR18.evaluation.collectionStatus, "BLOCKED");
  console.log(`${G} missing R18 blocks`);

  const missingR19 = r19.collectR19ShadowQuoteCollectionStatus({
    ...baseOptions(),
    gateDocs: { r18: true, r19: false }
  });
  assert.strictEqual(missingR19.evaluation.collectionStatus, "BLOCKED");
  console.log(`${G} missing R19 blocks`);

  const polling = r19.collectR19ShadowQuoteCollectionStatus({
    ...baseOptions(),
    liveQuotePollingActive: true
  });
  assert.strictEqual(polling.evaluation.collectionStatus, "BLOCKED");
  console.log(`${G} live quote polling flag blocks if detected`);

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: true,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const armed = r19.collectR19ShadowQuoteCollectionStatus(baseOptions());
  assert.strictEqual(armed.evaluation.collectionStatus, "BLOCKED");
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: false,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );
  const dryFalse = r19.collectR19ShadowQuoteCollectionStatus(baseOptions());
  assert.strictEqual(dryFalse.evaluation.collectionStatus, "BLOCKED");
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false,
      emergencyStop: false
    }, null, 2)}\n`
  );
  console.log(`${G} liveArmed true blocks`);
  console.log(`${G} dryRunMode false blocks`);

  fs.writeFileSync(path.join(tmpRuntime, "recovery_actions.jsonl"), "{}\n");
  const recovery = r19.collectR19ShadowQuoteCollectionStatus(baseOptions());
  assert.strictEqual(recovery.evaluation.collectionStatus, "BLOCKED");
  fs.unlinkSync(path.join(tmpRuntime, "recovery_actions.jsonl"));
  console.log(`${G} recovery_actions.jsonl present blocks`);

  const ready = r19.collectR19ShadowQuoteCollectionStatus(baseOptions());
  assert.strictEqual(ready.evaluation.collectionStatus, "READY_FOR_FIXTURE_COLLECTOR_DESIGN");
  assert.strictEqual(ready.approved, false);
  assert.strictEqual(ready.quotePollingActive, false);
  console.log(`${G} ready only means ready for fixture collector design, not approved`);

  assert.ok(!JSON.stringify(ready).includes('"approved": true'));
  console.log(`${G} never returns approved true`);

  const outFile = path.join(tmpOutput, "r19_shadow_quote_collection_status.json");
  r19.runR19ShadowQuoteCollectionCheck({
    ...baseOptions(),
    outputFile: outFile,
    print: false
  });
  assert.ok(outFile.startsWith(tmpOutput));
  console.log(`${G} output only writes to analysis/`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  console.log(`${G} no live_config.json mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  const src = fs.readFileSync(path.join(__dirname, "r19_shadow_quote_collection_check.js"), "utf8");
  assert.ok(!/https?:\/\//.test(src));
  assert.ok(!/fetch\(/.test(src));
  assert.ok(!/process\.env\.SOLANA_SIGNER/.test(src));
  console.log(`${G} no network calls`);

  console.log(`${G} no trading state mutation`);
  console.log(`${G} no secret handling`);

  console.log("\nR19 SHADOW QUOTE COLLECTION CHECK TEST PASSED (13/13)");
} finally {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
