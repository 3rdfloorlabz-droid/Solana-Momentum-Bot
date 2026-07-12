"use strict";

/**
 * Coverage for the three re-review observations from DECISION — RB-G9 Armed
 * Continuum Remediation Acceptance — 2026-07-11 §5/§9, accepted as
 * non-blocking for remediation acceptance but required before production
 * integration:
 *
 *   1. Forward-jump monotonic anomaly not wired at orchestrator checkpoints
 *   2. Stale G1 not duplicated as second continuum integration test
 *      (the existing F5C test in test_armed_continuum_integration.js covers
 *      REUSED/consumed G1, not a genuinely time-expired one)
 *   3. Illegal pre-C1 transition not integration-tested
 *      (the existing F3 test covers an illegal transition AFTER C1 mutation
 *      and rollback; this covers one caught BEFORE any mutation happens)
 *
 * This is a standalone harness (not a reuse of test_armed_continuum_integration.js's
 * private buildHarness()) so it carries zero risk of perturbing that file's
 * existing 28/28 passing suite. Same fixture conventions, deliberately
 * minimal — only what each of the three scenarios needs.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const continuum = require("./run_armed_continuum");
const timing = require("./armed_continuum_timing");
const stateMod = require("./armed_continuum_state");

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

function g1Text({ sessionId, signedAtUtc, expiresAtUtc, blockStartUtc, blockEndUtc }) {
  return `# AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — ${sessionId}

**SIGNED — EFFECTIVE FOR ONE ENGINEERING-VALIDATION SESSION ONLY**

| Field | Value |
|-------|-------|
| **Signature timestamp (UTC)** | **\`${signedAtUtc}\`** |
| **Authorization expiry (UTC)** | **\`${expiresAtUtc}\`** |
| **Assigned session ID** | **\`${sessionId}\`** |
| **Confirmed operating block** | **UTC \`${blockStartUtc}\`** – **\`${blockEndUtc}\`** |
`;
}

function buildMinimalHarness({ sessionId, g1Overrides = {} }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "continuum-gap-"));
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

  const defaultG1 = {
    sessionId,
    signedAtUtc: "2026-07-11T20:00:00Z",
    expiresAtUtc: "2026-07-14T04:00:00Z",
    blockStartUtc: "2026-07-11T20:00:00Z",
    blockEndUtc: "2026-07-12T02:00:00Z",
    ...g1Overrides
  };

  const docs = {
    g1: g1Text(defaultG1),
    g2: `**SIGNED**\n**AUTHORIZATION — Arming**\n${sessionId}\nsubmit sign broadcast`,
    g3: `**SIGNED**\n**Runtime R15 Approval Stub Creation**\n${sessionId}`,
    g4: `**SIGNED**\n**Armed No-Submit Proof Authorization**\n${sessionId}\nsubmit sign broadcast candidate selection capital exposure`
  };
  for (const [name, body] of Object.entries(docs)) {
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
    sessionId
  }, null, 2)}\n`);

  const isolationPath = path.join(root, "isolation.json");
  fs.writeFileSync(isolationPath, `${JSON.stringify({
    sessionId,
    isolatedProcessSetHash: sha("isolated-set"),
    authorizedPidSet: []
  }, null, 2)}\n`);

  const receiptPath = path.join(root, "analysis", "continuum_receipt.json");
  const eventsPath = path.join(root, "analysis", "continuum_events.jsonl");

  let mono = 0n;
  const clock = {
    monotonicNs: () => mono,
    setMonoNs: value => { mono = value; },
    addMonoNs: delta => { mono += delta; }
  };

  const cli = {
    sessionId,
    authManifest: authManifestPath,
    isolationReceipt: isolationPath,
    domainAReceipt: domainAPath,
    armingBaselineHash: baselineHash,
    isolatedProcessSetHash: sha("isolated-set"),
    operatingBlockStartUtc: defaultG1.blockStartUtc,
    operatingBlockEndUtc: defaultG1.blockEndUtc,
    proofDayLocal: defaultG1.signedAtUtc.slice(0, 10),
    timezone: "UTC",
    continuumRunId: `gap-run-${sessionId}`,
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
    readDisarmedPosture: async () => ({ ok: true, failures: [], cfg: config }),
    createStub: async () => ({ ok: true }),
    runApManifest: async () => ({ ok: true, summary: { overallStatus: "PASS", ap17Deferred: true } }),
    runN6Probe: async () => ({ ok: true, summary: { probe: "PASS" } }),
    runDomainC: async () => ({ ok: true, summary: {} }),
    runSafetySuite: async () => ({ ok: true, summary: { passed: 85 } }),
    verifyExecutor: async () => ({ ok: true, executorCount: 0 })
  };

  return { root, cli, deps, receiptPath, eventsPath };
}

async function runForwardJumpTests() {
  // Baseline: proves the checkpoint wiring is actually active by tripping it
  // with an intentionally absurd jump, well beyond anything a real run could
  // produce between two adjacent checkpoints inside a 15-minute armed window.
  await test("forward-jump: impossible jump between checkpoints fails closed, no mutation", async () => {
    const sessionId = "RB-G9-20260711-AP80";
    const { cli, deps } = buildMinimalHarness({ sessionId });
    deps.clock.setMonoNs(0n);
    const originalEnforce = deps.readDisarmedPosture;
    // Force an impossible forward jump right after PRECHECK, before C1 mutation,
    // by hooking into the first place we control timing: the clock itself, via
    // a wrapped monotonicNs that jumps hugely on its second read.
    let reads = 0;
    const baseMono = deps.clock.monotonicNs;
    deps.clock.monotonicNs = () => {
      reads += 1;
      if (reads === 2) return 50_000_000_000_000n; // ~50,000 seconds forward — far past ARMED_CAP_MS (900s)
      return baseMono();
    };
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.MONOTONIC_TIMER_ANOMALY);
    assert.strictEqual(result.failClass, stateMod.FAIL_CLASSES.MONOTONIC_TIMER_ANOMALY);
    assert.strictEqual(result.invocationCounts.ap, 0);
    assert.strictEqual(result.invocationCounts.n6, 0);
    void originalEnforce;
  });

  await test("forward-jump: normal-sized gaps between checkpoints still pass (no false positives)", async () => {
    const sessionId = "RB-G9-20260711-AP81";
    const { cli, deps } = buildMinimalHarness({ sessionId });
    // Advance by a plausible few-hundred-ms gap at each checkpoint boundary via
    // small addMonoNs bumps layered on the existing hooks — well under the cap.
    deps.beforeApDelayCheck = async d => d.clock.addMonoNs(200_000_000n); // +200ms
    deps.beforeN6DelayCheck = async d => d.clock.addMonoNs(200_000_000n); // +200ms
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, 0, JSON.stringify(result.errors || result.failClass));
  });
}

async function runStaleG1ContinuumTests() {
  await test("stale-G1 (time-expired, not reuse-marked): rejected at precheck without C1, distinct from F5C reuse case", async () => {
    const sessionId = "RB-G9-20260101-AP82";
    // Entirely past-dated fixture (Jan 2026) so this is unambiguously stale
    // relative to real wall-clock time regardless of when the suite runs —
    // avoids any dependency on "now" being close to the fixture's own dates.
    const { cli, deps } = buildMinimalHarness({
      sessionId,
      g1Overrides: {
        signedAtUtc: "2026-01-01T20:00:00Z",
        blockStartUtc: "2026-01-01T20:00:00Z",
        blockEndUtc: "2026-01-02T02:00:00Z",
        // block end + G1_POST_BLOCK_MARGIN_MS (1h) = 2026-01-02T03:00:00Z is the
        // required minimum expiry; this is 1h past that, so it fails on
        // genuine staleness (expiry < now), not on block-reserve margin.
        expiresAtUtc: "2026-01-02T04:00:00Z"
      }
    });
    const result = await continuum.runArmedContinuum({ cli, ...deps });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.AUTHORIZATION_INVALID);
    // finalizeRun's failClass for any precheck failure is the reverse-mapped
    // EXIT_CODES key ("AUTHORIZATION_INVALID" itself, same as the F5C reuse
    // case) — the specific underlying reason lives in `errors`, not failClass.
    assert.ok(
      (result.errors || []).includes(stateMod.FAIL_CLASSES.STALE_OR_CONSUMED_AUTHORIZATION),
      `expected STALE_OR_CONSUMED_AUTHORIZATION in errors, got ${JSON.stringify(result.errors)}`
    );
    assert.strictEqual(result.invocationCounts.ap, 0);
    assert.strictEqual(result.invocationCounts.n6, 0);
    assert.strictEqual(result.invocationCounts.rollback, 0, "precheck rejection must never reach C1, so nothing to roll back");
  });
}

async function runIllegalPreC1Tests() {
  await test("illegal pre-C1 transition: rejected before any arming mutation, rollback skipped (nothing to undo)", async () => {
    const sessionId = "RB-G9-20260711-AP83";
    const { cli, deps } = buildMinimalHarness({ sessionId });
    const result = await continuum.runArmedContinuum({
      cli,
      ...deps,
      testForceIllegalPreC1Transition: true
    });
    assert.strictEqual(result.exitCode, stateMod.EXIT_CODES.UNEXPECTED_STATE);
    assert.strictEqual(result.failClass, stateMod.FAIL_CLASSES.ILLEGAL_STATE_TRANSITION);
    assert.strictEqual(result.invocationCounts.ap, 0);
    assert.strictEqual(result.invocationCounts.n6, 0);
    assert.strictEqual(
      result.invocationCounts.rollback,
      0,
      "illegal transition caught before C1 must skip rollback entirely (c1Mutated stays false), unlike the post-C1 F3 case which requires one"
    );
  });

  await test("illegal pre-C1 transition vs post-C1 (F3-style): rollback count differs, proving these are genuinely distinct paths", async () => {
    const sessionId = "RB-G9-20260711-AP84";
    const { cli, deps } = buildMinimalHarness({ sessionId });
    const preC1 = await continuum.runArmedContinuum({
      cli,
      ...deps,
      testForceIllegalPreC1Transition: true
    });

    const sessionId2 = "RB-G9-20260711-AP85";
    const second = buildMinimalHarness({ sessionId: sessionId2 });
    const postC1 = await continuum.runArmedContinuum({
      cli: second.cli,
      ...second.deps,
      forceC1Mutated: true,
      testForceIllegalTransition: true
    });

    assert.strictEqual(preC1.invocationCounts.rollback, 0);
    assert.strictEqual(postC1.invocationCounts.rollback, 1);
    assert.strictEqual(preC1.failClass, postC1.failClass, "both are ILLEGAL_STATE_TRANSITION; only the rollback obligation differs");
  });
}

(async () => {
  await runForwardJumpTests();
  await runStaleG1ContinuumTests();
  await runIllegalPreC1Tests();

  if (failed > 0) {
    console.error(`\n${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`\n${passed}/${passed + failed} gap-coverage tests passed`);
})();
