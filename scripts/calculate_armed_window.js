"use strict";

/**
 * Armed-window timing calculator — step 6 prep tool, non-arming.
 *
 * Pure calculation only: given a planned C1 (arming) start time, computes
 * every downstream checkpoint deadline from the continuum's own timing
 * constants (armed_continuum_timing.js) so an operator can sanity-check a
 * real proof-day window BEFORE ever signing G1 or running the continuum.
 *
 * This exists because AP03's own closure record shows it failed on
 * INSUFFICIENT_ARMED_WINDOW — not a defect in the timing constants, but
 * insufficient real-world margin around them. This tool cannot arm
 * anything, invoke AP/N6, write any file, or touch live_config.json/.env —
 * it only reads armed_continuum_timing.js's constants and does arithmetic.
 *
 * Usage:
 *   node scripts/calculate_armed_window.js --c1-start-utc 2026-07-15T20:00:00Z
 *   node scripts/calculate_armed_window.js --c1-start-utc 2026-07-15T20:00:00Z --stub-duration-ms 30000 --json
 */

const timing = require("../armed_continuum_timing");

function parseArgs(argv) {
  const get = (flag) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : null;
  };
  return {
    c1StartUtc: get("--c1-start-utc"),
    // Optional: how long the operator expects stub creation to actually take
    // in real wall-clock time, for a more realistic (not just theoretical)
    // margin estimate. Defaults to 0 (best case).
    stubDurationMs: Number(get("--stub-duration-ms") || 0),
    apDurationMs: Number(get("--ap-duration-ms") || 0),
    n6DurationMs: Number(get("--n6-duration-ms") || 0),
    json: argv.includes("--json")
  };
}

function calculate({ c1StartUtc, stubDurationMs = 0, apDurationMs = 0, n6DurationMs = 0 }) {
  const c1Start = Date.parse(c1StartUtc);
  if (!Number.isFinite(c1Start)) {
    throw new Error(`--c1-start-utc must be a valid ISO-8601 UTC timestamp, got ${JSON.stringify(c1StartUtc)}`);
  }

  const deadline = c1Start + timing.ARMED_CAP_MS;
  const stubComplete = c1Start + stubDurationMs;
  const apComplete = stubComplete + apDurationMs;
  const n6Complete = apComplete + n6DurationMs;

  const iso = (ms) => new Date(ms).toISOString();

  const checkpoints = [
    {
      label: "C1 (arming start)",
      atUtc: iso(c1Start),
      remainingMs: deadline - c1Start,
      requiredRemainingMs: timing.ARMED_CAP_MS,
      ok: true
    },
    {
      label: "post-stub (must clear MIN_POST_STUB_REMAINING_MS)",
      atUtc: iso(stubComplete),
      remainingMs: deadline - stubComplete,
      requiredRemainingMs: timing.MIN_POST_STUB_REMAINING_MS,
      ok: deadline - stubComplete >= timing.MIN_POST_STUB_REMAINING_MS
    },
    {
      label: "AP invocation (must clear MIN_AP_REMAINING_MS)",
      atUtc: iso(apComplete),
      remainingMs: deadline - apComplete,
      requiredRemainingMs: timing.MIN_AP_REMAINING_MS,
      ok: deadline - apComplete >= timing.MIN_AP_REMAINING_MS
    },
    {
      label: "N6 invocation (must clear MIN_N6_REMAINING_MS)",
      atUtc: iso(n6Complete),
      remainingMs: deadline - n6Complete,
      requiredRemainingMs: timing.MIN_N6_REMAINING_MS,
      ok: deadline - n6Complete >= timing.MIN_N6_REMAINING_MS
    },
    {
      label: "Domain C reserve floor (deadline - DOMAIN_C_RESERVE_MS)",
      atUtc: iso(deadline - timing.DOMAIN_C_RESERVE_MS),
      remainingMs: timing.DOMAIN_C_RESERVE_MS,
      requiredRemainingMs: timing.DOMAIN_C_RESERVE_MS,
      ok: true
    },
    {
      label: "armed deadline (15-minute cap)",
      atUtc: iso(deadline),
      remainingMs: 0,
      requiredRemainingMs: 0,
      ok: true
    }
  ];

  const ok = checkpoints.every((c) => c.ok);

  return {
    ok,
    c1StartUtc: iso(c1Start),
    armedDeadlineUtc: iso(deadline),
    assumedStubDurationMs: stubDurationMs,
    assumedApDurationMs: apDurationMs,
    assumedN6DurationMs: n6DurationMs,
    checkpoints,
    constants: timing.TIMING_CONSTANTS,
    note: "Best-case arithmetic only. Real invocations always take longer than the assumed durations above — this does not simulate transition delays, rollback initiation, or receipt writes. Build in real margin, not just the code's minimums; see RB-G9 AP04 Pre-Planning §6."
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.c1StartUtc) {
    process.stderr.write("usage: node scripts/calculate_armed_window.js --c1-start-utc <ISO-8601 UTC> [--stub-duration-ms N] [--ap-duration-ms N] [--n6-duration-ms N] [--json]\n");
    process.exit(2);
  }

  let result;
  try {
    result = calculate(args);
  } catch (error) {
    process.stderr.write(`calculate_armed_window: ${error.message}\n`);
    process.exit(2);
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`C1 start:        ${result.c1StartUtc}`);
    console.log(`Armed deadline:  ${result.armedDeadlineUtc} (+${timing.ARMED_CAP_MS / 60000} min)\n`);
    for (const c of result.checkpoints) {
      const mins = (c.remainingMs / 60000).toFixed(2);
      const reqMins = (c.requiredRemainingMs / 60000).toFixed(2);
      console.log(`${c.ok ? "OK  " : "FAIL"}  ${c.label}`);
      console.log(`      at ${c.atUtc} — remaining ${mins}m (need >= ${reqMins}m)`);
    }
    console.log(`\nOverall: ${result.ok ? "feasible with the assumed durations" : "INFEASIBLE — insufficient margin somewhere above"}`);
    console.log(result.note);
  }

  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { calculate };
