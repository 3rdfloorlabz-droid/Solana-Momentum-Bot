"use strict";

// test_ownership_guards.js — Sprint 4 A1c
//
// Regression guards that LOCK IN the Sprint 4 A1a (paper-trade ownership split)
// and A1b (atomic live_config.json writes) changes. These are STATIC source
// assertions: they read the canonical ROOT source files as text and fail if a
// future edit reintroduces a forbidden writer or an unsafe (non-atomic) config
// write. They do not execute the bot, touch runtime files, or hit the network.
//
// Single-writer / many-readers contracts enforced here:
//   paper_trades.json     → scanner-owned, APPEND-ONLY        (monitor must never write it)
//   paper_positions.json  → monitor-owned (paperStore.writePositions); scanner/dashboard read-only
//   live_config.json      → ONLY live_executor.saveConfig, emergency_stop.js, reset_live_safety.js,
//                            and ONLY via config_store.writeConfigAtomic (no raw fs.writeFileSync)
//
// Scope note: only ROOT-level .js files are canonical. Archive copies under
// automation/ hardreset/ harness/ files/ phase1_files/ are intentionally ignored.

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = __dirname;
const G = "\x1b[32m✔\x1b[0m";

// ── helpers ───────────────────────────────────────────────────────────────────

function readRoot(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

// Legacy / backup root scripts that ACTIVE_MANIFEST.md lists under
// "Legacy root scripts (do not run)". They are not part of the canonical runtime
// and must not be evaluated as active writers.
const NON_CANONICAL = new Set([
  "scanner.js",
  "scanner_v3.js",
  "scanner_trending.js",
  "scanner_gmgn_trending_backup.js",
  "scanner_gmgn_trending_pre_bot10.js",
  "monitor_backup.js"
]);

// Canonical ROOT-level .js files only (no recursion into archive subdirectories,
// no legacy/backup scripts).
function rootJsFiles() {
  return fs.readdirSync(ROOT)
    .filter(f => f.endsWith(".js"))
    .filter(f => !NON_CANONICAL.has(f))
    .filter(f => fs.statSync(path.join(ROOT, f)).isFile());
}

// `\s` matches newlines, so these tolerate multi-line call formatting like
//   fs.writeFileSync(
//     PAPER_FILE, ...
const RE = {
  // any write (full rewrite) to the PAPER_FILE token
  paperFullWrite: /(?:fs\.)?writeFileSync\s*\(\s*PAPER_FILE/,
  // append-only writers to the PAPER_FILE token
  paperAppend: /(?:appendJsonLine|(?:fs\.)?appendFileSync)\s*\(\s*PAPER_FILE/,
  // monitor-owned lifecycle store write
  positionsStoreWrite: /paperStore\.writePositions\s*\(/,
  // direct write to the literal positions filename or a POSITIONS_FILE const tied to it
  positionsDirectWrite: /(?:fs\.)?writeFileSync\s*\(\s*[^)]*paper_positions/,
  // atomic config write (the approved path)
  configAtomicWrite: /writeConfigAtomic\s*\(/,
  // legacy non-atomic config write (forbidden going forward)
  configLegacyWrite: /(?:fs\.)?writeFileSync\s*\(\s*CONFIG_FILE/,
  // atomic observation dedup write (the approved path)
  observationDedupAtomicWrite: /writeObservationDedupStateAtomic\s*\(/,
  // legacy non-atomic observation dedup write (forbidden going forward)
  observationDedupLegacyWrite: /(?:fs\.)?writeFileSync\s*\(\s*observationDedupFilePath\(\)/,
  // atomic live positions write (the approved path)
  livePositionsAtomicWrite: /writeLivePositionsStateAtomic\s*\(/,
  // legacy non-atomic live positions write (forbidden going forward)
  livePositionsLegacyWrite: /(?:fs\.)?writeFileSync\s*\(\s*LIVE_POSITIONS_FILE/
};

const failures = [];
function check(label, cond) {
  if (cond) {
    console.log(`${G} ${label}`);
  } else {
    failures.push(label);
    console.log(`\x1b[31mX\x1b[0m FAIL: ${label}`);
  }
}

// ── 1. paper_trades.json — scanner append-only, monitor never rewrites ─────────

const scanner = readRoot("scanner_gmgn_trending.js");
const monitor = readRoot("monitor.js");

check("paper_trades.json: scanner appends (append-only writer present)",
  RE.paperAppend.test(scanner));
check("paper_trades.json: scanner never full-rewrites the ledger",
  !RE.paperFullWrite.test(scanner));
check("paper_trades.json: monitor never appends to the ledger",
  !RE.paperAppend.test(monitor));
check("paper_trades.json: monitor never full-rewrites the ledger",
  !RE.paperFullWrite.test(monitor));

// Global: no ROOT file other than the scanner may write paper_trades.json.
const paperWriters = rootJsFiles().filter(f => {
  if (f === "paper_positions_store.js") return false; // store reads ledger only
  const src = readRoot(f);
  return RE.paperFullWrite.test(src) || RE.paperAppend.test(src);
});
check(`paper_trades.json: exactly one writer = scanner (found: ${paperWriters.join(", ") || "none"})`,
  paperWriters.length === 1 && paperWriters[0] === "scanner_gmgn_trending.js");

// ── 2. paper_positions.json — monitor only, scanner/dashboard read-only ────────

const dashboard = readRoot("dashboard_server.js");

check("paper_positions.json: monitor writes via paperStore.writePositions",
  RE.positionsStoreWrite.test(monitor));
check("paper_positions.json: scanner does NOT write the positions store",
  !RE.positionsStoreWrite.test(scanner) && !RE.positionsDirectWrite.test(scanner));
check("paper_positions.json: dashboard does NOT write the positions store",
  !RE.positionsStoreWrite.test(dashboard) && !RE.positionsDirectWrite.test(dashboard));

// Global: among ROOT files, only the monitor calls paperStore.writePositions,
// and only paper_positions_store.js writes the literal positions filename.
const positionsStoreCallers = rootJsFiles().filter(f => RE.positionsStoreWrite.test(readRoot(f)));
check(`paper_positions.json: exactly one writer via store = monitor (found: ${positionsStoreCallers.join(", ") || "none"})`,
  positionsStoreCallers.length === 1 && positionsStoreCallers[0] === "monitor.js");

const positionsDirectWriters = rootJsFiles().filter(f => {
  if (f === "paper_positions_store.js") return false; // the store module is the owner
  return RE.positionsDirectWrite.test(readRoot(f));
});
check(`paper_positions.json: no direct writers outside the store module (found: ${positionsDirectWriters.join(", ") || "none"})`,
  positionsDirectWriters.length === 0);

// ── 3. live_config.json — atomic writers only, approved paths only ─────────────

const APPROVED_CONFIG_WRITERS = ["emergency_stop.js", "live_executor.js", "reset_live_safety.js"];

// A file is a "config writer" if it calls writeConfigAtomic or uses the legacy raw
// write. Exclude config_store.js (it DEFINES writeConfigAtomic) and test files.
const configWriters = rootJsFiles().filter(f => {
  if (f === "config_store.js") return false;
  if (f.startsWith("test_")) return false;
  const src = readRoot(f);
  return RE.configAtomicWrite.test(src) || RE.configLegacyWrite.test(src);
}).sort();

check(`live_config.json: writer set is exactly the approved paths (found: ${configWriters.join(", ") || "none"})`,
  JSON.stringify(configWriters) === JSON.stringify(APPROVED_CONFIG_WRITERS));

for (const f of APPROVED_CONFIG_WRITERS) {
  const src = readRoot(f);
  check(`live_config.json: ${f} routes through config_store.writeConfigAtomic`,
    RE.configAtomicWrite.test(src));
  check(`live_config.json: ${f} contains no legacy non-atomic write`,
    !RE.configLegacyWrite.test(src));
}

// ── 5. observation_dedup.json — atomic writer only (R3) ──────────────────────

const executor = readRoot("live_executor.js");

check("observation_dedup.json: live_executor routes through observationDedupStore.writeObservationDedupStateAtomic",
  RE.observationDedupAtomicWrite.test(executor));
check("observation_dedup.json: live_executor contains no legacy non-atomic write",
  !RE.observationDedupLegacyWrite.test(executor));

const observationDedupDirectWriters = rootJsFiles().filter(f => {
  if (f === "observation_dedup_store.js") return false;
  if (f.startsWith("test_")) return false;
  const src = readRoot(f);
  return RE.observationDedupLegacyWrite.test(src) ||
    (/(?:fs\.)?writeFileSync\s*\(\s*[^)]*OBSERVATION_DEDUP_FILE/.test(src));
});
check(`observation_dedup.json: no direct non-atomic writers outside the store (found: ${observationDedupDirectWriters.join(", ") || "none"})`,
  observationDedupDirectWriters.length === 0);

// ── 6. live_positions.json — atomic writer only (R4) ─────────────────────────

check("live_positions.json: live_executor routes through livePositionsStore.writeLivePositionsStateAtomic",
  RE.livePositionsAtomicWrite.test(executor));
check("live_positions.json: live_executor contains no legacy non-atomic write",
  !RE.livePositionsLegacyWrite.test(executor));

check("live_positions.json: dashboard does NOT write live_positions.json",
  !/(?:fs\.)?writeFileSync\s*\(\s*[^)]*live_positions/.test(dashboard));
check("live_positions.json: scanner does NOT write live_positions.json",
  !/(?:fs\.)?writeFileSync\s*\(\s*[^)]*live_positions/.test(scanner));
check("live_positions.json: monitor does NOT write live_positions.json",
  !/(?:fs\.)?writeFileSync\s*\(\s*[^)]*live_positions/.test(monitor));

const livePositionsDirectWriters = rootJsFiles().filter(f => {
  if (f === "live_positions_store.js") return false;
  if (f.startsWith("test_")) return false;
  if (f === "run_safety_tests.js") return false;
  const src = readRoot(f);
  return RE.livePositionsLegacyWrite.test(src) ||
    /(?:fs\.)?writeFileSync\s*\(\s*[^)]*live_positions\.json/.test(src);
});
check(`live_positions.json: no direct non-atomic writers outside the store (found: ${livePositionsDirectWriters.join(", ") || "none"})`,
  livePositionsDirectWriters.length === 0);

// ── 4. PowerShell config writers remain atomic (temp + rename) ─────────────────

for (const ps of ["panic.ps1", "reset_after_panic.ps1"]) {
  if (!fs.existsSync(path.join(ROOT, ps))) {
    check(`${ps}: present`, false);
    continue;
  }
  const src = fs.readFileSync(path.join(ROOT, ps), "utf8");
  // Atomic PowerShell helper writes to a temp file then Move-Item -Force.
  const atomic = /Write-ConfigAtomically/.test(src) ||
    (/\.tmp/.test(src) && /Move-Item/i.test(src));
  check(`${ps}: config write remains atomic (temp + move/rename)`, atomic);
}

// ── result ─────────────────────────────────────────────────────────────────────

if (failures.length) {
  console.error(`\nOWNERSHIP GUARD TEST FAILED (${failures.length} violation${failures.length === 1 ? "" : "s"})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOWNERSHIP GUARD TEST PASSED");
