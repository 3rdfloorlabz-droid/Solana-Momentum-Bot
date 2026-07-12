"use strict";

/**
 * Tests for f4_ap_adapter.js / f4_n6_adapter.js — the F4 real AP/N6 wiring
 * layer between run_armed_continuum.js and the already-implemented
 * run_armed_preflight_manifest.js / test_n6_armed_estop_probe.js.
 *
 * Scope, deliberately: this file tests the ADAPTERS' own mapping and
 * fail-closed logic, not the full AP-01..AP-20 check suite (already covered
 * by test_armed_preflight_unit.js / test_armed_preflight_regression.js) and
 * not a fabricated LIVE_ARMED success path. Group A/B mock the underlying
 * manifest/probe functions via require.cache substitution — no env vars,
 * no signer-shaped values, no filesystem posture faking anywhere in this
 * file. Group C calls the REAL adapters against the REAL repo root and
 * relies on the repo's actual (disarmed) posture to exercise the fail-closed
 * path safely, asserting live_config.json is untouched before/after.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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
    console.error(`  ${error.stack || error.message}`);
  }
}

function sha(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function hashFile(filePath) {
  return sha(fs.readFileSync(filePath));
}

// --- lightweight require.cache-based mocking, no external dependency ---

function withMockedAdapter(adapterRelPath, mockedModuleRelPath, mockExports, fn) {
  const mockedResolved = require.resolve(mockedModuleRelPath);
  const adapterResolved = require.resolve(adapterRelPath);

  const realMocked = require.cache[mockedResolved];
  const realAdapter = require.cache[adapterResolved];

  require.cache[mockedResolved] = {
    id: mockedResolved,
    filename: mockedResolved,
    loaded: true,
    exports: mockExports
  };
  delete require.cache[adapterResolved];

  try {
    const freshAdapter = require(adapterRelPath);
    return fn(freshAdapter);
  } finally {
    if (realMocked) require.cache[mockedResolved] = realMocked;
    else delete require.cache[mockedResolved];
    delete require.cache[adapterResolved];
    if (realAdapter) require.cache[adapterResolved] = realAdapter;
  }
}

function apReceipt({ overallStatus = "PASS", wrongPosture = false, ap17Status = "deferred", failures = [] } = {}) {
  const ap17Check = ap17Status === "deferred"
    ? {
        checkId: "AP-17",
        status: "NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE",
        evidence: { deferredTo: "armed_continuum_n6_state", n6InvokedInApStage: false }
      }
    : ap17Status === "not-deferred-pass"
      ? { checkId: "AP-17", status: "PASS", evidence: {} }
      : null;

  const checks = ap17Check ? [ap17Check] : [];
  return {
    overallStatus,
    receiptSha256: "test-fake-hash",
    fingerprints: { manifestVersion: "ap-manifest/1.0.0" },
    checks,
    failures
  };
}

// ===================== Group A: AP adapter mapping =====================

async function runGroupA() {
  await test("AP adapter: maps clean success (deferred AP-17) to ok:true", async () => {
    await withMockedAdapter(
      "./f4_ap_adapter",
      "./run_armed_preflight_manifest",
      {
        runArmedPreflightManifest: async (options) => {
          assert.strictEqual(options.adapters.deferAp17ToContinuum, true, "adapter must request AP-17 deferral");
          return { exitCode: 0, wrongPosture: false, receipt: apReceipt({ ap17Status: "deferred" }) };
        }
      },
      async (adapter) => {
        const result = await adapter.runApManifest(
          { sessionId: "TEST", armingBaselineHash: "abc" },
          { root: "/fake/root", documents: {}, authorizationMetadata: {} }
        );
        assert.strictEqual(result.ok, true);
        assert.strictEqual(result.summary.ap17Deferred, true);
      }
    );
  });

  await test("AP adapter: fails closed if AP-17 was not actually deferred", async () => {
    await withMockedAdapter(
      "./f4_ap_adapter",
      "./run_armed_preflight_manifest",
      {
        runArmedPreflightManifest: async () => ({
          exitCode: 0,
          wrongPosture: false,
          receipt: apReceipt({ ap17Status: "not-deferred-pass" })
        })
      },
      async (adapter) => {
        const result = await adapter.runApManifest(
          { sessionId: "TEST", armingBaselineHash: "abc" },
          { root: "/fake/root", documents: {}, authorizationMetadata: {} }
        );
        assert.strictEqual(result.ok, false);
        assert.match(result.reason, /not deferred/i);
      }
    );
  });

  await test("AP adapter: wrong posture maps to ok:false without claiming a deferral failure", async () => {
    await withMockedAdapter(
      "./f4_ap_adapter",
      "./run_armed_preflight_manifest",
      {
        runArmedPreflightManifest: async () => ({
          exitCode: 2,
          wrongPosture: true,
          receipt: apReceipt({ overallStatus: "WRONG_POSTURE", wrongPosture: true, ap17Status: "none" })
        })
      },
      async (adapter) => {
        const result = await adapter.runApManifest(
          { sessionId: "TEST", armingBaselineHash: "abc" },
          { root: "/fake/root", documents: {}, authorizationMetadata: {} }
        );
        assert.strictEqual(result.ok, false);
        assert.match(result.reason, /wrong posture/i);
        assert.doesNotMatch(result.reason, /not deferred/i);
      }
    );
  });

  await test("AP adapter: FAIL overallStatus maps to ok:false with failures echoed", async () => {
    await withMockedAdapter(
      "./f4_ap_adapter",
      "./run_armed_preflight_manifest",
      {
        runArmedPreflightManifest: async () => ({
          exitCode: 1,
          wrongPosture: false,
          receipt: apReceipt({ overallStatus: "FAIL", ap17Status: "deferred", failures: ["AP-09"] })
        })
      },
      async (adapter) => {
        const result = await adapter.runApManifest(
          { sessionId: "TEST", armingBaselineHash: "abc" },
          { root: "/fake/root", documents: {}, authorizationMetadata: {} }
        );
        assert.strictEqual(result.ok, false);
        assert.deepStrictEqual(result.summary.failures, ["AP-09"]);
      }
    );
  });

  await test("AP adapter: exception from manifest execution is caught, not thrown", async () => {
    await withMockedAdapter(
      "./f4_ap_adapter",
      "./run_armed_preflight_manifest",
      {
        runArmedPreflightManifest: async () => {
          throw new Error("simulated internal error");
        }
      },
      async (adapter) => {
        const result = await adapter.runApManifest(
          { sessionId: "TEST", armingBaselineHash: "abc" },
          { root: "/fake/root", documents: {}, authorizationMetadata: {} }
        );
        assert.strictEqual(result.ok, false);
        assert.match(result.reason, /threw/i);
      }
    );
  });
}

// ===================== Group B: N6 adapter mapping =====================

async function runGroupB() {
  await test("N6 adapter: maps clean success to ok:true", async () => {
    await withMockedAdapter(
      "./f4_n6_adapter",
      "./test_n6_armed_estop_probe",
      {
        runProbe: async (options) => {
          assert.strictEqual(options.productionRoot, "/fake/root");
          return {
            ok: true,
            evidence: {
              productionConfigUnchanged: true,
              steps: [{ step: "N6A-3", pass: true }, { step: "N6A-5", pass: true }],
              note: "Does not replace full dry N6 drill for Domains A or C"
            }
          };
        }
      },
      async (adapter) => {
        const result = await adapter.runN6Probe({}, { root: "/fake/root" });
        assert.strictEqual(result.ok, true);
        assert.strictEqual(result.summary.productionConfigUnchanged, true);
      }
    );
  });

  await test("N6 adapter: fails closed if productionConfigUnchanged is not exactly true, even when probe says ok", async () => {
    await withMockedAdapter(
      "./f4_n6_adapter",
      "./test_n6_armed_estop_probe",
      {
        runProbe: async () => ({ ok: true, evidence: { productionConfigUnchanged: undefined } })
      },
      async (adapter) => {
        const result = await adapter.runN6Probe({}, { root: "/fake/root" });
        assert.strictEqual(result.ok, false);
        assert.match(result.reason, /did not confirm/i);
      }
    );
  });

  await test("N6 adapter: passes through probe failure reason", async () => {
    await withMockedAdapter(
      "./f4_n6_adapter",
      "./test_n6_armed_estop_probe",
      {
        runProbe: async () => ({ ok: false, reason: "halt did not block new entry in harness", evidence: {} })
      },
      async (adapter) => {
        const result = await adapter.runN6Probe({}, { root: "/fake/root" });
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.reason, "halt did not block new entry in harness");
      }
    );
  });

  await test("N6 adapter: exception from probe is caught, not thrown", async () => {
    await withMockedAdapter(
      "./f4_n6_adapter",
      "./test_n6_armed_estop_probe",
      {
        runProbe: async () => {
          throw new Error("simulated probe crash");
        }
      },
      async (adapter) => {
        const result = await adapter.runN6Probe({}, { root: "/fake/root" });
        assert.strictEqual(result.ok, false);
        assert.match(result.reason, /threw/i);
      }
    );
  });
}

// ============ Group C: real adapters against the real (disarmed) repo ============

async function runGroupC() {
  const root = path.resolve(__dirname);
  const configPath = path.join(root, "live_config.json");

  await test("AP adapter (real, unmocked): fails closed against actual repo posture, no mutation", async () => {
    const before = hashFile(configPath);
    delete require.cache[require.resolve("./f4_ap_adapter")];
    const adapter = require("./f4_ap_adapter");
    const result = await adapter.runApManifest(
      { sessionId: null, armingBaselineHash: null },
      { root, documents: {}, authorizationMetadata: {} }
    );
    const after = hashFile(configPath);
    assert.strictEqual(before, after, "live_config.json must be byte-identical before/after a real AP adapter call");
    assert.strictEqual(result.ok, false, "real repo is disarmed today; AP adapter must refuse, not proceed");
  });

  await test("N6 adapter (real, unmocked): fails closed against actual repo posture, no mutation", async () => {
    const before = hashFile(configPath);
    delete require.cache[require.resolve("./f4_n6_adapter")];
    const adapter = require("./f4_n6_adapter");
    const result = await adapter.runN6Probe({}, { root });
    const after = hashFile(configPath);
    assert.strictEqual(before, after, "live_config.json must be byte-identical before/after a real N6 adapter call");
    assert.strictEqual(result.ok, false, "real repo is disarmed today; N6 adapter must refuse, not proceed");
  });
}

// ============ Group D: independent no-submit import-boundary review ============

async function runGroupD() {
  const boundary = require("./verify_f4_adapter_boundary");

  await test("adapter boundary check: both real F4 adapter files are clean", () => {
    const result = boundary.verifyAdapterNoSubmitImportBoundary();
    assert.strictEqual(result.ok, true, JSON.stringify(result.results.filter(r => !r.ok)));
  });

  await test("adapter boundary check: actually detects a forbidden require (scratch file, not a real adapter)", () => {
    const tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "f4-boundary-"));
    const scratchPath = path.join(tmpDir, "scratch_bad_adapter.js");
    fs.writeFileSync(scratchPath, `"use strict";\nconst signer = require("./local_signer");\nmodule.exports = { signer };\n`);
    try {
      const result = boundary.verifyFileNoSubmitImportBoundary(scratchPath);
      assert.strictEqual(result.ok, false);
      assert.ok(result.violations.includes("./local_signer"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await test("adapter boundary check: detects a submit/broadcast symbol reference (scratch file)", () => {
    const tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "f4-boundary-"));
    const scratchPath = path.join(tmpDir, "scratch_bad_adapter2.js");
    fs.writeFileSync(scratchPath, `"use strict";\nfunction bad() { return sendRawTransaction(); }\nmodule.exports = { bad };\n`);
    try {
      const result = boundary.verifyFileNoSubmitImportBoundary(scratchPath);
      assert.strictEqual(result.ok, false);
      assert.ok(result.violations.includes("submit_or_broadcast_symbol"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
}

(async () => {
  await runGroupA();
  await runGroupB();
  await runGroupC();
  await runGroupD();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
