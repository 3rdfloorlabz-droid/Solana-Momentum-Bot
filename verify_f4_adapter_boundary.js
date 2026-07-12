"use strict";

/**
 * Independent no-submit import-boundary review for the F4 adapter files.
 *
 * run_armed_continuum.js's own verifyNoSubmitImportBoundary() only scans
 * its OWN source file. It does not — and by design cannot, since it has no
 * static reference to them — cover f4_ap_adapter.js / f4_n6_adapter.js,
 * which are wired in at runtime via dependency injection (deps.runApManifest
 * / deps.runN6Probe), not via a direct require() in run_armed_continuum.js.
 * This is the independent check for those two files, required by
 * DECISION — RB-G9 Armed Continuum Remediation Acceptance — 2026-07-11 §9
 * ("independent no-submit import review of adapter wiring").
 *
 * Scope matches the original check exactly: direct require()s and
 * submit/broadcast symbol references in the adapter file's own source only
 * — not a transitive resolution of everything armed_preflight_checks.js or
 * live_executor.js pull in. Requiring live_executor.js itself is expected
 * and already relied on by test_n6_armed_estop_probe.js for its read-only
 * helper exports (computeLiveArmedStatus, __r16LivePathTest); the property
 * being enforced here is that these two adapter files never wire themselves
 * directly to a signer or submit path, not that the process never loads
 * code capable of it elsewhere for legitimate read-only reasons.
 */

const fs = require("fs");
const path = require("path");
const { FORBIDDEN_REQUIRE_PATHS } = require("./run_armed_continuum");

const DEFAULT_ADAPTER_FILES = Object.freeze([
  "f4_ap_adapter.js",
  "f4_n6_adapter.js"
]);

function verifyFileNoSubmitImportBoundary(absPath) {
  const src = fs.readFileSync(absPath, "utf8");
  const requireLines = src.split(/\r?\n/).filter(line => /require\s*\(/.test(line));
  const requireText = requireLines.join("\n");
  const violations = [];
  for (const forbidden of FORBIDDEN_REQUIRE_PATHS) {
    const pattern = new RegExp(`require\\(["']${forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']\\)`);
    if (pattern.test(requireText)) violations.push(forbidden);
  }
  if (/submitSwap|sendRawTransaction|sendTransaction/.test(src)) {
    violations.push("submit_or_broadcast_symbol");
  }
  return { ok: violations.length === 0, violations, checkedFile: absPath };
}

function verifyAdapterNoSubmitImportBoundary(adapterFiles = DEFAULT_ADAPTER_FILES, rootDir = __dirname) {
  const results = adapterFiles.map(relPath =>
    verifyFileNoSubmitImportBoundary(path.isAbsolute(relPath) ? relPath : path.join(rootDir, relPath))
  );
  return {
    ok: results.every(r => r.ok),
    results
  };
}

async function main() {
  const result = verifyAdapterNoSubmitImportBoundary();
  for (const r of result.results) {
    console.log(`${r.ok ? "OK" : "VIOLATION"}: ${path.relative(__dirname, r.checkedFile)}`);
    if (!r.ok) console.log(`  ${r.violations.join(", ")}`);
  }
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { verifyAdapterNoSubmitImportBoundary, verifyFileNoSubmitImportBoundary, DEFAULT_ADAPTER_FILES };
