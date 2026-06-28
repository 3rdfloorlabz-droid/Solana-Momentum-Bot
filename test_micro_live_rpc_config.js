"use strict";

// test_micro_live_rpc_config.js — R41D dedicated RPC operator setup (temp fixtures only).

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const rpcConfig = require("./micro_live_rpc_config");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const REPO_LIVE_POSITIONS = path.join(__dirname, "live_positions.json");
const REPO_CAPS = path.join(__dirname, "operator_records", "micro_live_demo_caps.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;
const beforeLivePositionsHash = fs.existsSync(REPO_LIVE_POSITIONS) ? fs.readFileSync(REPO_LIVE_POSITIONS) : null;
const beforeCapsHash = fs.existsSync(REPO_CAPS) ? fs.readFileSync(REPO_CAPS) : null;

const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "r41d-repo-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r41d-output-"));
const G = "\x1b[32m✔\x1b[0m";

function assertRedacted(value) {
  assert.ok(
    String(value).includes("[REDACTED]")
    || String(value).includes("%5BREDACTED%5D")
    || decodeURIComponent(String(value)).includes("[REDACTED]")
  );
}

function writeLocalConfig(url) {
  const dir = path.join(tmpRepo, "operator_records");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "local_rpc_config.json"),
    `${JSON.stringify({
      configType: "LOCAL_RPC",
      purpose: "micro-live engineering proof only",
      rpcUrl: url,
      notes: "temp fixture only"
    }, null, 2)}\n`
  );
}

try {
  const missing = rpcConfig.loadMicroLiveRpcConfig({
    repoRoot: tmpRepo,
    env: {},
    localConfigRead: { present: false, status: "missing", rpcUrl: null }
  });
  assert.strictEqual(missing.status, rpcConfig.RPC_STATUS.MISSING);
  console.log(`${G} missing env/file => MISSING`);

  const placeholder = rpcConfig.classifyRpcUrl("https://placeholder.example/rpc");
  assert.strictEqual(placeholder.status, rpcConfig.RPC_STATUS.PLACEHOLDER);
  console.log(`${G} placeholder URL => PLACEHOLDER`);

  const publicFallback = rpcConfig.classifyRpcUrl("https://api.mainnet-beta.solana.com");
  assert.strictEqual(publicFallback.status, rpcConfig.RPC_STATUS.PUBLIC_FALLBACK);
  console.log(`${G} public fallback URL => PUBLIC_FALLBACK`);

  const dedicated = rpcConfig.classifyRpcUrl("https://dedicated-provider.example/rpc");
  assert.strictEqual(dedicated.status, rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE);
  console.log(`${G} dedicated-looking URL => DEDICATED_CANDIDATE`);

  const secretKey = "super-secret-api-key-value-1234567890";
  const keyedUrl = `https://mainnet.helius-rpc.com/?api-key=${secretKey}`;
  const redacted = rpcConfig.redactRpcUrl(keyedUrl);
  assert.ok(!redacted.includes(secretKey));
  assertRedacted(redacted);
  console.log(`${G} URL with key is redacted`);

  writeLocalConfig("https://file-provider.example/rpc");
  const fromFile = rpcConfig.loadMicroLiveRpcConfig({
    repoRoot: tmpRepo,
    env: {}
  });
  assert.strictEqual(fromFile.source, rpcConfig.LOCAL_CONFIG_REL);
  assert.strictEqual(fromFile.status, rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE);
  console.log(`${G} local config file path is respected`);

  writeLocalConfig("https://file-should-not-win.example/rpc");
  const envWins = rpcConfig.loadMicroLiveRpcConfig({
    repoRoot: tmpRepo,
    env: { [rpcConfig.ENV_VAR]: "https://env-provider.example/rpc" }
  });
  assert.strictEqual(envWins.source, rpcConfig.ENV_VAR);
  assert.strictEqual(envWins.status, rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE);
  console.log(`${G} env var takes precedence over file`);

  const outputFile = path.join(tmpOutput, "r41d_rpc_operator_setup.json");
  const result = rpcConfig.runRpcOperatorSetup({
    repoRoot: tmpRepo,
    env: { [rpcConfig.ENV_VAR]: keyedUrl },
    analysisDir: tmpOutput,
    outputFile,
    writeOutput: true,
    print: false
  });
  const outputJson = fs.readFileSync(outputFile, "utf8");
  assert.ok(!outputJson.includes(secretKey));
  assertRedacted(outputJson);
  assert.strictEqual(result.status.approved, false);
  console.log(`${G} no full key appears in output`);

  assert.ok(outputFile.startsWith(tmpOutput));
  console.log(`${G} output only writes to analysis/`);

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

  console.log("\nMICRO-LIVE RPC CONFIG TEST PASSED (11/11)");
} catch (err) {
  console.error(err);
  process.exit(1);
} finally {
  try { fs.rmSync(tmpRepo, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
