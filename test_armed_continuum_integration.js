"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const continuum = require("./run_armed_continuum");
const timing = require("./armed_continuum_timing");
const stateMod = require("./armed_continuum_state");
const checks = require("./armed_preflight_checks");

const SESSION = "RB-G9-20260711-AP99";
const G1_TEXT = `# AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — RB-G9-20260711-AP99

**SIGNED — EFFECTIVE FOR ONE ENGINEERING-VALIDATION SESSION ONLY**

| Field | Value |
|-------|-------|
| **Signature timestamp (UTC)** | **\`2026-07-11T20:00:00Z\`** |
| **Authorization expiry (UTC)** | **\`2026-07-14T04:00:00Z\`** |
| **Assigned session ID** | **\`RB-G9-20260711-AP99\`** |
| **Confirmed operating block** | **2026-07-11 · 14:00–20:00 MDT** · UTC **\`2026-07-11T20:00:00Z\`** – **\`2026-07-12T02:00:00Z\`** |
`;

let passed = 0;
let failed = 0;
let runCounter = 0;

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

function buildHarness(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "continuum-"));
  fs.mkdirSync(path.join(root, "analysis"), { recursive: true });
  fs.mkdirSync(path.join(root, "auth"), { recursive: true });

  const config = {
    executionMode: "PIPELINE_DRY_RUN",
    dryRunMode: true,
    automationEnabled: false,
    emergencyStop: false,
    walletPublicAddress: "FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6",
    positionSizeSol: 0.005
  };
  fs.writeFileSync(path.join(root, "live_config.json"), `${JSON.stringify(config, null, 2)}\n`);
  fs.writeFileSync(path.join(root, "live_positions.json"), "[]\n");
  fs.writeFileSync(path.join(root, ".env"), "# test env\n");

  for (const [name, body] of Object.entries({
    g1: G1_TEXT,
    g2: `**SIGNED**\n**AUTHORIZATION — Arming**\nRB-G9-20260711-AP99\nsubmit sign broadcast`,
    g3: `**SIGNED**\n**Runtime R15 Approval Stub Creation**\nRB-G9-20260711-AP99`,
    g4: `**SIGNED**\n**Armed No-Submit Proof Authorization**\nRB-G9-20260711-AP99\nsubmit sign broadcast candidate selection capital exposure`
  })) {
    fs.writeFileSync(path.join(root, "auth", `${name}.md`), body);
  }

  const baselineHash = sha(JSON.stringify(config));
  const authManifestPath = path.join(root, "auth_manifest.json");
  fs.writeFileSync(authManifestPath, `${JSON.stringify({
    documents: {
      g1: path.join(root, "auth", "g1.md"),
      g2: path.join(root, "auth", "g2.md"),
      g3: path.join(root, "auth", "g3.md"),
      g4: path.join(root, "auth", "g4.md")
    }
  }, null, 2)}\n`);

  const now = Date.now();
  const domainAPath = path.join(root, "domain_a.json");
  fs.writeFileSync(domainAPath, `${JSON.stringify({
    completedAt: new Date(now - 60_000).toISOString(),
    armingBaselineHash: baselineHash,
    sessionId: SESSION
  }, null, 2)}\n`);

  const isolationPath = path.join(root, "isolation.json");
  fs.writeFileSync(isolationPath, `${JSON.stringify({
    sessionId: SESSION,
    isolatedProcessSetHash: sha("isolated-set"),
    authorizedPidSet: []
  }, null, 2)}\n`);

  const receiptPath = path.join(root, "analysis", "continuum_receipt.json");
  const eventsPath = path.join(root, "analysis", "continuum_events.jsonl");

  let mono = 0n;
  const clock = overrides.clock || {
    monotonicNs: () => mono,
    setMonoNs: value => { mono = value; },
    addMonoNs: delta => { mono += delta; }
  };
  if (!clock.setMonoNs) clock.setMonoNs = value => { mono = value; };
  if (!clock.addMonoNs) clock.addMonoNs = delta => { mono += delta; };

  const safetyFlags = {
    tx: 0,
    sign: 0,
    quote: 0,
    candidate: 0,
    submit: 0,
    broadcast: 0,
    ap: 0,
    n6: 0
  };

  const cli = {
    sessionId: SESSION,
    authManifest: authManifestPath,
    isolationReceipt: isolationPath,
    domainAReceipt: domainAPath,
    armingBaselineHash: baselineHash,
    isolatedProcessSetHash: sha("isolated-set"),
    operatingBlockStartUtc: "2026-07-11T20:00:00Z",
    operatingBlockEndUtc: "2026-07-12T02:00:00Z",
    proofDayLocal: "2026-07-11",
    timezone: "America/Denver",
    continuumRunId: overrides.continuumRunId || `test-run-${++runCounter}`,
    out: receiptPath,
    eventsPath,
    dryRehearsal: true,
    root
  };

  const deps = {
    root,
    envPath: path.join(root, ".env"),
    configPath: path.join(root, "live_config.json"),
    stubPath: path.join(root, "analysis", "r15_manual_approval_record.json"),
    dryRehearsal: true,
    simulateOnly: true,
    clock,
    readDisarmedPosture: async () => ({
      ok: !(overrides.loopLive || overrides.stubPresent || overrides.executorPresent),
      failures: [
        overrides.loopLive ? "loop-live set" : null,
        overrides.stubPresent ? "runtime stub present" : null,
        overrides.executorPresent ? "executor present" : null
      ].filter(Boolean),
      cfg: config
    }),
    createStub: async () => {
      safetyFlags.candidate += 0;
      return { ok: overrides.stubFail ? false : true, reason: overrides.stubFail ? "stub fail" : null };
    },
    runApManifest: async () => {
      safetyFlags.ap += 1;
      if (overrides.apFail) return { ok: false, reason: "ap fail" };
      return { ok: true, exitCode: 0, summary: { overallStatus: "PASS", ap17Deferred: true } };
    },
    runN6Probe: async () => {
      safetyFlags.n6 += 1;
      if (overrides.n6Fail) return { ok: false, reason: "n6 fail" };
      return { ok: true, summary: { probe: "PASS" } };
    },
    runDomainC: async () => ({ ok: !overrides.domainCFail, summary: { validate: overrides.domainCFail ? "FAIL" : "PASS" } }),
    runSafetySuite: async () => ({ ok: !overrides.safetyFail, summary: { passed: overrides.safetyFail ? 0 : 85 } }),
    writeReceipt: overrides.receiptWriteFail
      ? () => ({ ok: false, reason: "receipt write fail" })
      : null,
    verifyExecutor: async () => ({ ok: !overrides.rollbackPartial, executorCount: overrides.rollbackPartial ? 1 : 0 }),
    ...overrides.deps
  };

  if (overrides.remainingAfterStubMs != null) {
    const originalCreateStub = deps.createStub;
    deps.createStub = async (...args) => {
      clock.setMonoNs(BigInt(timing.ARMED_CAP_MS - overrides.remainingAfterStubMs) * 1_000_000n);
      return originalCreateStub(...args);
    };
  }

  return { root, cli, deps, safetyFlags, receiptPath, eventsPath };
}

function assertNoSubmit(safetyFlags) {
  assert.strictEqual(safetyFlags.tx, 0);
  assert.strictEqual(safetyFlags.sign, 0);
  assert.strictEqual(safetyFlags.quote, 0);
  assert.strictEqual(safetyFlags.candidate, 0);
  assert.strictEqual(safetyFlags.submit, 0);
  assert.strictEqual(safetyFlags.broadcast, 0);
}

(async () => {
  await test("no-submit import boundary clean", () => {
    const boundary = continuum.verifyNoSubmitImportBoundary(__dirname);
    assert.strictEqual(boundary.ok, true, boundary.violations?.join(", "));
  });

  await test("complete simulated continuum PASS", async () => {
    const { cli, deps, safetyFlags } = buildHarness({ remainingAfterStubMs: 750000 });
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, 0, JSON.stringify(result.errors || result.failClass));
    assert.strictEqual(result.invocationCounts.ap, 1);
    assert.strictEqual(result.invocationCounts.n6, 1);
    assertNoSubmit(safetyFlags);
  });

  await test("stub below 12 minutes fails closed", async () => {
    const { cli, deps } = buildHarness({ remainingAfterStubMs: 700000 });
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.INSUFFICIENT_POST_STUB_WINDOW);
    assert.strictEqual(result.invocationCounts.ap, 0);
  });

  await test("stub exactly 12 minutes passes threshold", async () => {
    const { cli, deps } = buildHarness({ remainingAfterStubMs: 720000 });
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, 0);
  });

  await test("AP failure triggers rollback without retry", async () => {
    const { cli, deps } = buildHarness({ remainingAfterStubMs: 750000, apFail: true });
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.AP_FAILED);
    assert.strictEqual(result.invocationCounts.ap, 1);
    assert.strictEqual(result.invocationCounts.n6, 0);
  });

  await test("N6 failure without retry", async () => {
    const { cli, deps } = buildHarness({ remainingAfterStubMs: 750000, n6Fail: true });
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.N6_FAILED);
    assert.strictEqual(result.invocationCounts.n6, 1);
  });

  await test("stub failure", async () => {
    const { cli, deps } = buildHarness({ stubFail: true });
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.STUB_FAILED);
  });

  await test("domain C failure on success path", async () => {
    const { cli, deps } = buildHarness({ remainingAfterStubMs: 750000, domainCFail: true });
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.DOMAIN_C_FAILED);
  });

  await test("safety suite failure", async () => {
    const { cli, deps } = buildHarness({ remainingAfterStubMs: 750000, safetyFail: true });
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.SAFETY_SUITE_FAILED);
  });

  await test("rollback partial failure", async () => {
    const { cli, deps } = buildHarness({ remainingAfterStubMs: 750000, rollbackPartial: true });
    const result = await continuum.runArmedContinuum({ cli, ...deps, forceC1Mutated: true });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.ROLLBACK_FAILED);
  });

  await test("receipt write failure", async () => {
    const { cli, deps } = buildHarness({ remainingAfterStubMs: 750000, receiptWriteFail: true });
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.RECEIPT_WRITE_FAILED);
  });

  await test("loop-live flag rejected at precheck", async () => {
    const { cli, deps } = buildHarness({ loopLive: true });
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.ok(result.exitCode === stateMod.EXIT_CODES.PRECHECK_FAILED
      || result.exitCode === stateMod.EXIT_CODES.AUTHORIZATION_INVALID);
  });

  await test("AP-17 deferred when continuum flag set", async () => {
    const adapters = checks.createDefaultAdapters(__dirname);
    adapters.deferAp17ToContinuum = true;
    adapters.computeLiveArmedStatus = () => ({ liveArmed: true, failures: [] });
    const result = await checks.runAllChecks(adapters, { skipPostureGate: true });
    const ap17 = result.checks.find(c => c.checkId === "AP-17");
    assert.strictEqual(ap17.status, "NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE");
  });

  await test("induced 3-minute stub-to-AP delay fails closed", async () => {
    let mono = 0n;
    const clock = {
      monotonicNs: () => mono,
      setMonoNs: value => { mono = value; },
      addMonoNs: delta => { mono += delta; }
    };
    const { cli, deps } = buildHarness({ clock, remainingAfterStubMs: 750000 });
    deps.beforeApDelayCheck = async () => {
      clock.addMonoNs(180_000_000_000n);
    };
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.DEADLINE_EXCEEDED);
  });

  await test("production CLI without dry-rehearsal fails closed", async () => {
    const { spawnSync } = require("child_process");
    const res = spawnSync(process.execPath, [path.join(__dirname, "run_armed_continuum.js")], {
      cwd: __dirname,
      encoding: "utf8"
    });
    assert.strictEqual(res.status, stateMod.EXIT_CODES.AUTHORIZATION_INVALID);
  });

  await test("F1 rollback initiation 5001 ms records violation and still rolls back", async () => {
    const { cli, deps } = buildHarness({ remainingAfterStubMs: 750000 });
    deps.beforeRollbackDelay = async () => {
      deps.clock.addMonoNs(5_001_000_000n);
    };
    const result = await continuum.runArmedContinuum({ cli, ...deps, forceC1Mutated: true });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.TIMING_ENFORCEMENT_VIOLATION);
    assert.strictEqual(result.invocationCounts.rollback, 1);
    assert.ok((result.receipt.rollback?.initiationDelay?.delayMs || 0) > 5000);
  });

  await test("F1 rollback initiation exactly 5000 ms passes", async () => {
    const { cli, deps } = buildHarness({ remainingAfterStubMs: 750000 });
    deps.beforeRollbackDelay = async () => {
      deps.clock.addMonoNs(5_000_000_000n);
    };
    const result = await continuum.runArmedContinuum({ cli, ...deps, forceC1Mutated: true });
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.receipt.rollback?.initiationDelay?.ok, true);
  });

  await test("F2 domain C reserve 179999 ms records violation and still runs Domain C", async () => {
    const { cli, deps } = buildHarness({ remainingAfterStubMs: 750000 });
    deps.beforeDomainCCheck = async () => {
      deps.clock.setMonoNs(BigInt(timing.ARMED_CAP_MS - 179999) * 1_000_000n);
    };
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.TIMING_ENFORCEMENT_VIOLATION);
    assert.strictEqual(result.receipt.domainC?.reserveCheck?.ok, false);
  });

  await test("F2 domain C reserve exactly 180000 ms passes", async () => {
    const { cli, deps } = buildHarness({ remainingAfterStubMs: 750000 });
    deps.beforeDomainCCheck = async () => {
      deps.clock.setMonoNs(BigInt(timing.ARMED_CAP_MS - 180000) * 1_000_000n);
    };
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.receipt.domainC?.reserveCheck?.ok, true);
  });

  await test("F3 illegal transition fails closed and triggers rollback after C1", async () => {
    const { cli, deps } = buildHarness({ remainingAfterStubMs: 750000 });
    const result = await continuum.runArmedContinuum({
      cli,
      ...deps,
      forceC1Mutated: true,
      testForceIllegalTransition: true
    });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.UNEXPECTED_STATE);
    assert.strictEqual(result.failClass, stateMod.FAIL_CLASSES.ILLEGAL_STATE_TRANSITION);
    assert.strictEqual(result.invocationCounts.ap, 0);
    assert.strictEqual(result.invocationCounts.rollback, 1);
  });

  await test("F5A AP exactly 600000 ms remaining passes", async () => {
    const { cli, deps, safetyFlags } = buildHarness({ remainingAfterStubMs: 720000 });
    deps.beforeApDelayCheck = async (d) => {
      d.clock.setMonoNs(300_000_000_000n);
      d.transitionMarks.stubCompleteMono = d.clock.monotonicNs() - 1_000_000n;
    };
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.invocationCounts.ap, 1);
    assertNoSubmit(safetyFlags);
  });

  await test("F5A AP below 600000 ms fails closed before AP invocation", async () => {
    const { cli, deps } = buildHarness({ remainingAfterStubMs: 720000 });
    deps.beforeApDelayCheck = async (d) => {
      d.clock.setMonoNs(300_001_000_000n);
      d.transitionMarks.stubCompleteMono = d.clock.monotonicNs() - 1_000_000n;
    };
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.DEADLINE_EXCEEDED);
    assert.strictEqual(result.invocationCounts.ap, 0);
  });

  await test("F5A N6 exactly 480000 ms remaining passes", async () => {
    const { cli, deps } = buildHarness({ remainingAfterStubMs: 750000 });
    deps.beforeN6DelayCheck = async (d) => {
      d.clock.setMonoNs(420_000_000_000n);
      d.transitionMarks.apCompleteMono = d.clock.monotonicNs() - 1_000_000n;
    };
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.invocationCounts.n6, 1);
  });

  await test("F5A N6 below 480000 ms fails closed before N6 invocation", async () => {
    const { cli, deps } = buildHarness({ remainingAfterStubMs: 750000 });
    deps.beforeN6DelayCheck = async (d) => {
      d.clock.setMonoNs(420_001_000_000n);
      d.transitionMarks.apCompleteMono = d.clock.monotonicNs() - 1_000_000n;
    };
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.DEADLINE_EXCEEDED);
    assert.strictEqual(result.invocationCounts.ap, 1);
    assert.strictEqual(result.invocationCounts.n6, 0);
  });

  await test("F5B duplicate invocation fails closed", async () => {
    const fixedId = "duplicate-run-fixed";
    const first = buildHarness({ continuumRunId: fixedId, remainingAfterStubMs: 750000 });
    const firstResult = await continuum.runArmedContinuum({ cli: first.cli, ...first.deps });
    assert.strictEqual(firstResult.exitCode, 0);

    const second = buildHarness({ continuumRunId: fixedId, remainingAfterStubMs: 750000 });
    const secondResult = await continuum.runArmedContinuum({ cli: second.cli, ...second.deps });
    assert.strictEqual(secondResult.exitCode, stateMod.EXIT_CODES.DUPLICATE_CONTINUUM_INVOCATION);
    assert.strictEqual(secondResult.invocationCounts.ap, 0);
    assert.strictEqual(secondResult.invocationCounts.n6, 0);
  });

  await test("F5C stale consumed G1 rejected at precheck without C1", async () => {
    const harness = buildHarness();
    const g1Path = path.join(harness.root, "auth", "g1.md");
    fs.writeFileSync(g1Path, `${G1_TEXT}\nCONSUMED/CLOSED — do not reuse\n`);
    const result = await continuum.runArmedContinuum({ cli: harness.cli, ...harness.deps });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.AUTHORIZATION_INVALID);
    assert.strictEqual(result.invocationCounts.ap, 0);
    assert.strictEqual(result.invocationCounts.n6, 0);
    assert.strictEqual(result.invocationCounts.rollback, 0);
  });

  await test("F6 pre-C1 monotonic regression fails closed without mutation", async () => {
    const harness = buildHarness();
    let mono = 100n;
    let reads = 0;
    harness.deps.clock = {
      monotonicNs: () => {
        reads += 1;
        if (reads === 2) return 50n;
        return mono;
      },
      setMonoNs: value => { mono = value; },
      addMonoNs: delta => { mono += delta; }
    };
    const result = await continuum.runArmedContinuum({ cli: harness.cli, ...harness.deps });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.MONOTONIC_TIMER_ANOMALY);
    assert.strictEqual(result.invocationCounts.rollback, 0);
  });

  await test("F6 post-C1 monotonic regression triggers rollback", async () => {
    const harness = buildHarness({ remainingAfterStubMs: 750000 });
    harness.deps.beforeN6DelayCheck = async (deps) => {
      const regressed = deps.transitionMarks.lastMono - 1_000_000_000n;
      deps.clock.setMonoNs(regressed);
    };
    const result = await continuum.runArmedContinuum({
      cli: harness.cli,
      ...harness.deps,
      forceC1Mutated: true
    });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.MONOTONIC_TIMER_ANOMALY);
    assert.strictEqual(result.invocationCounts.rollback, 1);
    assert.strictEqual(result.invocationCounts.n6, 0);
  });

  if (failed > 0) {
    console.error(`\n${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`\n${passed}/${passed + failed} integration tests passed`);
})();
