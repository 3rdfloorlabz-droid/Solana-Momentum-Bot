"use strict";

const fs = require("fs");
const path = require("path");
const common = require("./live_validation_common");

function unsetEnvKeyInFile(envPath, key) {
  if (!fs.existsSync(envPath)) {
    return { ok: true, changed: false, note: "env file absent" };
  }
  const original = fs.readFileSync(envPath, "utf8");
  const lines = original.split(/\r?\n/);
  let changed = false;
  const out = [];
  for (const line of lines) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(line)) {
      changed = true;
      continue;
    }
    out.push(line);
  }
  if (changed) {
    const next = out.join("\n");
    fs.writeFileSync(envPath, next.endsWith("\n") ? next : `${next}\n`);
  }
  return { ok: true, changed, key };
}

function applyD1(envPath, writeEnv = null) {
  if (typeof writeEnv === "function") return writeEnv("D1", { envPath });
  return unsetEnvKeyInFile(envPath, "FOMO_ENABLE_LIVE_SUBMISSION");
}

function applyD2(configPath, writeConfig = null) {
  if (typeof writeConfig === "function") {
    return writeConfig("D2", { configPath, patch: { executionMode: "PIPELINE_DRY_RUN" } });
  }
  const cfg = common.safeLoadJson(configPath, {});
  cfg.executionMode = "PIPELINE_DRY_RUN";
  fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`);
  return { ok: true, step: "D2", executionMode: cfg.executionMode };
}

function applyD3(configPath, writeConfig = null) {
  if (typeof writeConfig === "function") {
    return writeConfig("D3", { configPath, patch: { dryRunMode: true } });
  }
  const cfg = common.safeLoadJson(configPath, {});
  cfg.dryRunMode = true;
  fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`);
  return { ok: true, step: "D3", dryRunMode: cfg.dryRunMode };
}

function removeRuntimeStub(stubPath, removeStub = null) {
  if (typeof removeStub === "function") return removeStub(stubPath);
  const results = [];
  for (const target of [stubPath, `${stubPath}.tmp`]) {
    if (target && fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
      results.push(path.basename(target));
    }
  }
  return { ok: true, removed: results };
}

async function rollbackDomainC(options = {}) {
  const {
    envPath,
    configPath,
    stubPath,
    writeEnv = null,
    writeConfig = null,
    removeStub = null,
    verifyExecutor = null
  } = options;

  const steps = [];
  const failures = [];

  try {
    steps.push({ step: "D1", ...(applyD1(envPath, writeEnv)) });
  } catch (error) {
    failures.push({ step: "D1", reason: error.message || String(error) });
  }

  try {
    steps.push({ step: "D2", ...(applyD2(configPath, writeConfig)) });
  } catch (error) {
    failures.push({ step: "D2", reason: error.message || String(error) });
  }

  try {
    steps.push({ step: "D3", ...(applyD3(configPath, writeConfig)) });
  } catch (error) {
    failures.push({ step: "D3", reason: error.message || String(error) });
  }

  try {
    steps.push({ step: "STUB_REMOVE", ...removeRuntimeStub(stubPath, removeStub) });
  } catch (error) {
    failures.push({ step: "STUB_REMOVE", reason: error.message || String(error) });
  }

  let executorZero = null;
  try {
    executorZero = typeof verifyExecutor === "function"
      ? await verifyExecutor()
      : verifyDisarmed({ configPath, stubPath, envPath });
  } catch (error) {
    failures.push({ step: "VERIFY", reason: error.message || String(error) });
    executorZero = { ok: false, reason: error.message || String(error) };
  }

  return {
    ok: failures.length === 0 && executorZero?.ok === true,
    steps,
    failures,
    executorZero
  };
}

function verifyDisarmed(options = {}) {
  const { configPath, stubPath, envPath, readExecutorLock = null } = options;
  const cfg = common.safeLoadJson(configPath, {});
  const failures = [];

  if (cfg.executionMode !== "PIPELINE_DRY_RUN") failures.push("executionMode not PIPELINE_DRY_RUN");
  if (cfg.dryRunMode !== true) failures.push("dryRunMode not true");

  if (stubPath && fs.existsSync(stubPath)) failures.push("runtime stub still present");

  if (envPath && fs.existsSync(envPath)) {
    const envText = fs.readFileSync(envPath, "utf8");
    if (/^\s*FOMO_ENABLE_LIVE_SUBMISSION\s*=\s*YES/im.test(envText)) {
      failures.push("FOMO_ENABLE_LIVE_SUBMISSION still YES");
    }
  }

  let executorCount = 0;
  if (typeof readExecutorLock === "function") {
    const lock = readExecutorLock();
    if (lock?.present && lock?.pid) executorCount = 1;
  }

  return {
    ok: failures.length === 0 && executorCount === 0,
    failures,
    executorCount,
    liveArmed: cfg.liveArmed === true,
    disarmed: failures.length === 0
  };
}

module.exports = {
  unsetEnvKeyInFile,
  applyD1,
  applyD2,
  applyD3,
  removeRuntimeStub,
  rollbackDomainC,
  verifyDisarmed
};
