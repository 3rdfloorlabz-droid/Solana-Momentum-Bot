"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { loadLocalEnv } = require("./local_env");

const FAKE_HELIUS_URL = "https://secret.example/?api-key=FAKE_SECRET";
const FAKE_HELIUS_KEY = "FAKE_HELIUS_KEY_123";
const FAKE_BEARER = "Bearer FAKE_TOKEN";
const FAKE_SECRETS = [FAKE_HELIUS_URL, FAKE_HELIUS_KEY, FAKE_BEARER];

const RPC_KEYS = ["HELIUS_RPC_URL", "SOLANA_RPC_URL", "HELIUS_API_KEY"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeTempEnv(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-env-test-"));
  const envPath = path.join(dir, ".env");
  fs.writeFileSync(envPath, contents, "utf8");
  return { dir, envPath };
}

function rmTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function snapshotRpcEnv() {
  return {
    HELIUS_RPC_URL: process.env.HELIUS_RPC_URL,
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
    HELIUS_API_KEY: process.env.HELIUS_API_KEY
  };
}

function restoreRpcEnv(snapshot) {
  for (const key of RPC_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

function assertNoSecretsInText(text) {
  for (const secret of FAKE_SECRETS) {
    assert(!text.includes(secret), `metadata or output leaked fake secret: ${secret.slice(0, 12)}…`);
  }
}

function assertKeysPresentBooleansOnly(keysPresent) {
  assert(keysPresent && typeof keysPresent === "object", "keysPresent must be an object");
  for (const key of RPC_KEYS) {
    assert(typeof keysPresent[key] === "boolean", `${key} must be boolean, got ${typeof keysPresent[key]}`);
  }
}

function readSourceOrderGuard() {
  const dashboardSrc = fs.readFileSync(path.join(__dirname, "dashboard_server.js"), "utf8");
  const executorSrc = fs.readFileSync(path.join(__dirname, "live_executor.js"), "utf8");

  const dashLoaderIdx = dashboardSrc.indexOf('require("./local_env")');
  const dashExecutorIdx = dashboardSrc.indexOf('require("./live_executor")');
  assert(dashLoaderIdx !== -1, "dashboard_server.js must require local_env");
  assert(dashExecutorIdx !== -1, "dashboard_server.js must require live_executor");
  assert(
    dashLoaderIdx < dashExecutorIdx,
    "dashboard_server.js must load local_env before live_executor"
  );

  const strictEnd = executorSrc.indexOf('"use strict";') + '"use strict";'.length;
  const execLoaderIdx = executorSrc.indexOf('require("./local_env")');
  const execFsIdx = executorSrc.indexOf('require("fs")');
  assert(execLoaderIdx !== -1, "live_executor.js must require local_env");
  assert(execLoaderIdx > strictEnd, "live_executor.js loader must follow use strict");
  assert(
    execLoaderIdx < execFsIdx,
    "live_executor.js must load local_env before other requires"
  );

  const rpcResolveIdx = executorSrc.indexOf("function resolveRpcEndpoint");
  assert(rpcResolveIdx !== -1, "live_executor.js must define resolveRpcEndpoint");
  assert(
    execLoaderIdx < rpcResolveIdx,
    "live_executor.js must load local_env before RPC resolution code"
  );
}

(async () => {
  const envSnapshot = snapshotRpcEnv();
  let passed = 0;

  try {
    // 1. loader_missing_env_is_nonfatal
    {
      const missingPath = path.join(os.tmpdir(), `no-env-${Date.now()}-${Math.random()}.env`);
      const meta = loadLocalEnv({ path: missingPath });
      assert(meta.loaded === false, "missing env must not set loaded true");
      assert(meta.errorCode === "ENOENT", `expected ENOENT, got ${meta.errorCode}`);
      assert(meta.pathUsed === null, "pathUsed must be null when missing");
      passed++;
    }

    // 2. loader_loads_temp_env_without_printing_values
    {
      const { dir, envPath } = makeTempEnv(`HELIUS_RPC_URL=${FAKE_HELIUS_URL}\n`);
      const before = snapshotRpcEnv();
      delete process.env.HELIUS_RPC_URL;
      try {
        const meta = loadLocalEnv({ path: envPath });
        assert(meta.loaded === true, "temp env should load");
        assert(process.env.HELIUS_RPC_URL === FAKE_HELIUS_URL, "value available in process.env for runtime");
        assertNoSecretsInText(JSON.stringify(meta));
        assertKeysPresentBooleansOnly(meta.keysPresent);
        assert(meta.keysPresent.HELIUS_RPC_URL === true, "HELIUS_RPC_URL presence should be true");
      } finally {
        restoreRpcEnv(before);
        rmTempDir(dir);
      }
      passed++;
    }

    // 3. loader_does_not_override_existing_env_by_default
    {
      const existing = "https://existing.example/rpc";
      const { dir, envPath } = makeTempEnv(`HELIUS_RPC_URL=${FAKE_HELIUS_URL}\n`);
      const before = snapshotRpcEnv();
      process.env.HELIUS_RPC_URL = existing;
      try {
        const meta = loadLocalEnv({ path: envPath, override: false });
        assert(meta.loaded === true, "temp env file should still parse");
        assert(
          process.env.HELIUS_RPC_URL === existing,
          "existing process.env must win over temp .env"
        );
        assertNoSecretsInText(JSON.stringify(meta));
      } finally {
        restoreRpcEnv(before);
        rmTempDir(dir);
      }
      passed++;
    }

    // 4. loader_reports_key_presence_as_booleans_only
    {
      const { dir, envPath } = makeTempEnv(
        `HELIUS_RPC_URL=${FAKE_HELIUS_URL}\nHELIUS_API_KEY=${FAKE_HELIUS_KEY}\n`
      );
      const before = snapshotRpcEnv();
      delete process.env.HELIUS_RPC_URL;
      delete process.env.SOLANA_RPC_URL;
      delete process.env.HELIUS_API_KEY;
      try {
        const meta = loadLocalEnv({ path: envPath });
        assertKeysPresentBooleansOnly(meta.keysPresent);
        assert(meta.keysPresent.HELIUS_RPC_URL === true, "HELIUS_RPC_URL should be present");
        assert(meta.keysPresent.SOLANA_RPC_URL === false, "SOLANA_RPC_URL should be absent");
        assert(meta.keysPresent.HELIUS_API_KEY === true, "HELIUS_API_KEY should be present");
        for (const val of Object.values(meta.keysPresent)) {
          assert(val === true || val === false, "keysPresent values must be boolean only");
        }
      } finally {
        restoreRpcEnv(before);
        rmTempDir(dir);
      }
      passed++;
    }

    // 5. loader_does_not_return_raw_secret_values
    {
      const { dir, envPath } = makeTempEnv(
        `HELIUS_RPC_URL=${FAKE_HELIUS_URL}\nHELIUS_API_KEY=${FAKE_HELIUS_KEY}\nSOLANA_RPC_URL=${FAKE_BEARER}\n`
      );
      const before = snapshotRpcEnv();
      for (const key of RPC_KEYS) delete process.env[key];
      try {
        const meta = loadLocalEnv({ path: envPath });
        const serialized = JSON.stringify(meta);
        assertNoSecretsInText(serialized);
        assert(!serialized.includes("secret.example"), "URL host must not appear in metadata");
        assert(!serialized.includes("FAKE_"), "FAKE_ prefix must not appear in metadata");
        assert(!serialized.includes("Bearer"), "Bearer token must not appear in metadata");
      } finally {
        restoreRpcEnv(before);
        rmTempDir(dir);
      }
      passed++;
    }

    // 6. dashboard_server_loads_local_env_before_live_executor_import
    {
      readSourceOrderGuard();
      passed++;
    }

    // 7. live_executor_loads_local_env_before_rpc_resolution (covered in readSourceOrderGuard)
    {
      passed++;
    }

    console.log(`test_local_env_loader.js: ${passed} passed`);
  } catch (err) {
    console.error("test_local_env_loader.js FAILED:", err.message);
    process.exitCode = 1;
  } finally {
    restoreRpcEnv(envSnapshot);
  }
})();
