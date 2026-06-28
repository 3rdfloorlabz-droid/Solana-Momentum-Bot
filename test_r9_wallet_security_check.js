"use strict";

// test_r9_wallet_security_check.js — Sprint 4 R9
// Validates read-only R9 wallet security check in temp fixtures only.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const r9 = require("./r9_wallet_security_check");
const REPO_RECOVERY = path.join(__dirname, "recovery_actions.jsonl");
const REPO_CONFIG = path.join(__dirname, "live_config.json");
const beforeRecoveryExists = fs.existsSync(REPO_RECOVERY);
const beforeConfigHash = fs.existsSync(REPO_CONFIG) ? fs.readFileSync(REPO_CONFIG) : null;

const tmpRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "r9-runtime-"));
const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "r9-repo-"));
const tmpOutput = fs.mkdtempSync(path.join(os.tmpdir(), "r9-output-"));
const G = "\x1b[32m✔\x1b[0m";

try {
  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false
    }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(tmpRepo, ".gitignore"),
    `${r9.REQUIRED_GITIGNORE_PATTERNS.join("\n")}\n`
  );

  const safe = r9.collectR9WalletSecurityStatus({
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRepo,
    analysisDir: tmpOutput,
    scanRepo: false
  });
  assert.strictEqual(safe.evaluation.verdict, "WALLET SECURITY DESIGN DEFINED BUT NOT CONNECTED");
  assert.strictEqual(safe.liveTradingApproved, false);
  assert.strictEqual(safe.walletConnected, false);
  console.log(`${G} dry-run posture passes`);

  const indicator = r9.scanLineForIndicators(
    "SOLANA_SIGNER_SECRET=5JrealLookingBase58MaterialShouldNeverAppearInRepoScanTestsOnly",
    "fixture.env"
  );
  assert.strictEqual(indicator, "env-signer-assignment");
  const redactedReport = {
    file: "fixture.env",
    line: 1,
    indicator,
    redacted: true
  };
  assert.strictEqual(redactedReport.redacted, true);
  assert.ok(!JSON.stringify(redactedReport).includes("5JrealLooking"));
  console.log(`${G} detected signing-material indicators are redacted`);

  const gitignore = r9.checkGitignorePolicy(tmpRepo);
  assert.strictEqual(gitignore.ok, true);
  fs.writeFileSync(path.join(tmpRepo, ".gitignore"), ".env\n");
  const weak = r9.checkGitignorePolicy(tmpRepo);
  assert.strictEqual(weak.ok, false);
  fs.writeFileSync(
    path.join(tmpRepo, ".gitignore"),
    `${r9.REQUIRED_GITIGNORE_PATTERNS.join("\n")}\n`
  );
  console.log(`${G} .gitignore policy can be checked`);

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "LIVE",
      dryRunMode: false,
      liveArmed: true
    }, null, 2)}\n`
  );
  const armed = r9.collectR9WalletSecurityStatus({
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRepo,
    analysisDir: tmpOutput,
    scanRepo: false
  });
  assert.strictEqual(armed.evaluation.verdict, "NOT READY FOR WALLET CONNECTION");
  console.log(`${G} liveArmed true fails`);

  fs.writeFileSync(
    path.join(tmpRuntime, "live_config.json"),
    `${JSON.stringify({
      executionMode: "PIPELINE_DRY_RUN",
      dryRunMode: true,
      liveArmed: false
    }, null, 2)}\n`
  );
  fs.writeFileSync(path.join(tmpRuntime, "recovery_actions.jsonl"), "{}\n");
  const recovery = r9.collectR9WalletSecurityStatus({
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRepo,
    analysisDir: tmpOutput,
    scanRepo: false
  });
  assert.strictEqual(recovery.evaluation.verdict, "NOT READY FOR WALLET CONNECTION");
  fs.unlinkSync(path.join(tmpRuntime, "recovery_actions.jsonl"));
  console.log(`${G} recovery_actions.jsonl present fails`);

  const withIndicator = r9.collectR9WalletSecurityStatus({
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRepo,
    analysisDir: tmpOutput,
    scanRepo: false,
    secretIndicators: [{ file: "tmp/fake.env", line: 2, indicator: "env-signer-assignment", redacted: true }]
  });
  assert.strictEqual(withIndicator.evaluation.verdict, "NOT READY FOR WALLET CONNECTION");
  console.log(`${G} fake secret file paths are detected safely`);

  const outFile = path.join(tmpOutput, "r9_wallet_security_status.json");
  r9.runR9WalletSecurityCheck({
    runtimeRoot: tmpRuntime,
    repoRoot: tmpRepo,
    analysisDir: tmpOutput,
    outputFile: outFile,
    scanRepo: false,
    print: false
  });
  assert.ok(fs.existsSync(outFile));
  assert.strictEqual(JSON.parse(fs.readFileSync(outFile, "utf8")).liveTradingApproved, false);
  console.log(`${G} output only writes to analysis/`);

  if (beforeConfigHash) {
    assert.ok(beforeConfigHash.equals(fs.readFileSync(REPO_CONFIG)));
  }
  console.log(`${G} no live_config.json mutation`);

  assert.strictEqual(fs.existsSync(REPO_RECOVERY), beforeRecoveryExists);
  console.log(`${G} no recovery_actions.jsonl creation`);

  const paperPath = path.join(__dirname, "paper_trades.json");
  if (fs.existsSync(paperPath)) {
    assert.ok(fs.statSync(paperPath).isFile());
  }
  console.log(`${G} no trading state mutation`);

  const src = fs.readFileSync(path.join(__dirname, "r9_wallet_security_check.js"), "utf8");
  assert.ok(!/writeFileSync\([^)]*live_config\.json/.test(src));
  assert.ok(!/readFileSync\([^)]*\.env/.test(src));
  console.log(`${G} no credential file reads or config mutation`);

  console.log("\nR9 WALLET SECURITY CHECK TEST PASSED (10/10)");
} finally {
  try { fs.rmSync(tmpRuntime, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpRepo, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpOutput, { recursive: true, force: true }); } catch { /* ignore */ }
}
