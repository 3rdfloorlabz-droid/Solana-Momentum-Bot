"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const rollback = require("./armed_continuum_rollback");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`✔ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`✘ ${name}`);
    console.error(`  ${error.message}`);
  }
}

function fixtureRoot() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rb-"));
  fs.writeFileSync(path.join(tmp, "live_config.json"), `${JSON.stringify({
    executionMode: "LIVE",
    dryRunMode: false
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(tmp, ".env"), "FOMO_ENABLE_LIVE_SUBMISSION=YES\n");
  fs.mkdirSync(path.join(tmp, "analysis"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "analysis", "r15_manual_approval_record.json"), "{}\n");
  return tmp;
}

(async () => {
  await test("rollback is idempotent", async () => {
    const root = fixtureRoot();
    const envPath = path.join(root, ".env");
    const configPath = path.join(root, "live_config.json");
    const stubPath = path.join(root, "analysis", "r15_manual_approval_record.json");
    const first = await rollback.rollbackDomainC({ envPath, configPath, stubPath });
    const second = await rollback.rollbackDomainC({ envPath, configPath, stubPath });
    assert.strictEqual(first.ok, true);
    assert.strictEqual(second.ok, true);
    const verify = rollback.verifyDisarmed({ configPath, stubPath, envPath });
    assert.strictEqual(verify.ok, true);
  });

  await test("partial failure reported when D2 fails", async () => {
    const root = fixtureRoot();
    const envPath = path.join(root, ".env");
    const configPath = path.join(root, "live_config.json");
    const stubPath = path.join(root, "analysis", "r15_manual_approval_record.json");
    const result = await rollback.rollbackDomainC({
      envPath,
      configPath,
      stubPath,
      writeConfig: (step) => {
        if (step === "D2") throw new Error("simulated D2 failure");
        const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (step === "D3") cfg.dryRunMode = true;
        fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`);
        return { ok: true, step };
      }
    });
    assert.strictEqual(result.ok, false);
    assert.ok(result.failures.some(f => f.step === "D2"));
  });

  if (failed > 0) {
    console.error(`\n${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`\n${passed}/${passed + failed} rollback tests passed`);
})();
