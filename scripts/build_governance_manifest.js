"use strict";

/**
 * RB-G9 Governance Record Integrity — checkpoint manifest builder.
 *
 * Implements "Option C" (hash checkpointing) from:
 *   Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9 Governance Record Integrity Planning — 2026-07-11.md §7/§17
 *
 * Produces an append-only, hash-chained snapshot of the governance tree
 * (repo-local Ori/ + canonical analysis/rb_g9*.json machine receipts) so a
 * silent edit is detectable even though these files are not yet Git-tracked.
 *
 * This tool does not touch Git, does not read secrets, and does not modify
 * any file it scans — it only reads and hashes.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO_ROOT = path.resolve(__dirname, "..");
const MANIFEST_DIR = path.join(REPO_ROOT, "Ori", "governance", "manifests");

const SCOPE_ROOTS = [
  { label: "Ori", absDir: path.join(REPO_ROOT, "Ori"), include: () => true },
  {
    label: "analysis/rb_g9",
    absDir: path.join(REPO_ROOT, "analysis"),
    include: (relFromDir) => /^rb_g9.*\.json$/i.test(path.basename(relFromDir))
  }
];

// Never hash inside the manifest directory itself (avoids self-reference),
// and never descend into anything that looks like a secret/env file even
// though none are expected under Ori/ or analysis/rb_g9*.json.
const EXCLUDE_DIR_NAMES = new Set(["manifests"]);
const EXCLUDE_FILE_PATTERN = /(^|[\\/])\.env(\.|$)|\.pem$|\.key$/i;

const ISO_TIMESTAMP_RE = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/;

function hashFile(absPath) {
  return crypto.createHash("sha256").update(fs.readFileSync(absPath)).digest("hex");
}

function hashString(str) {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

function extractInternalTimestamp(absPath) {
  try {
    const text = fs.readFileSync(absPath, "utf8");
    const match = ISO_TIMESTAMP_RE.exec(text);
    return match ? match[0] : null;
  } catch {
    // Binary or unreadable-as-text file — no internal timestamp extraction.
    return null;
  }
}

function walk(absDir, relFromDir, onFile) {
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;
    const absPath = path.join(absDir, entry.name);
    const relPath = relFromDir ? `${relFromDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDE_DIR_NAMES.has(entry.name)) continue;
      walk(absPath, relPath, onFile);
    } else if (entry.isFile()) {
      if (EXCLUDE_FILE_PATTERN.test(relPath)) continue;
      onFile(absPath, relPath);
    }
  }
}

function collectEntries() {
  const entries = [];
  for (const scope of SCOPE_ROOTS) {
    if (!fs.existsSync(scope.absDir)) continue;
    walk(scope.absDir, "", (absPath, relFromDir) => {
      if (!scope.include(relFromDir)) return;
      const repoRelPath = path
        .relative(REPO_ROOT, absPath)
        .split(path.sep)
        .join("/");
      const stat = fs.statSync(absPath);
      entries.push({
        path: repoRelPath,
        size: stat.size,
        sha256: hashFile(absPath),
        internalTimestamp: extractInternalTimestamp(absPath)
      });
    });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

function findPreviousManifest() {
  if (!fs.existsSync(MANIFEST_DIR)) return null;
  const files = fs
    .readdirSync(MANIFEST_DIR)
    .filter((f) => /^checkpoint-\d{8}-\d{6}\.jsonl$/.test(f))
    .sort();
  if (files.length === 0) return null;
  return path.join(MANIFEST_DIR, files[files.length - 1]);
}

function readManifestHash(manifestPath) {
  const lines = fs.readFileSync(manifestPath, "utf8").trim().split("\n");
  const footer = JSON.parse(lines[lines.length - 1]);
  if (footer.record !== "footer") {
    throw new Error(`malformed manifest, expected footer as last line: ${manifestPath}`);
  }
  return footer.manifestHash;
}

// Matches the RB-G9 governance-integrity plan's literal naming convention:
// Ori/governance/manifests/checkpoint-YYYYMMDD-HHMMSS.jsonl (UTC clock time).
function timestampForFilename(date) {
  const iso = date.toISOString(); // e.g. 2026-07-12T03:26:20.123Z
  const datePart = iso.slice(0, 10).replace(/-/g, "");
  const timePart = iso.slice(11, 19).replace(/:/g, "");
  return `${datePart}-${timePart}`;
}

function buildManifest({ reason } = {}) {
  const generatedAtUtc = new Date();
  const entries = collectEntries();

  const previousManifestPath = findPreviousManifest();
  const previousManifestHash = previousManifestPath ? readManifestHash(previousManifestPath) : null;

  // manifestHash covers the entry set + chain pointer, so re-running the
  // builder against an unchanged tree with the same previous pointer is
  // reproducible, and any single-byte change anywhere is detectable.
  const entriesForHash = entries.map(({ path: p, size, sha256 }) => ({ path: p, size, sha256 }));
  const manifestHash = hashString(
    JSON.stringify({ previousManifestHash, entries: entriesForHash })
  );

  const filename = `checkpoint-${timestampForFilename(generatedAtUtc)}.jsonl`;
  const outPath = path.join(MANIFEST_DIR, filename);

  fs.mkdirSync(MANIFEST_DIR, { recursive: true });

  const header = {
    record: "header",
    schemaVersion: "governance-checkpoint-manifest/1.0.0",
    generatedAtUtc: generatedAtUtc.toISOString(),
    reason: reason || null,
    previousManifestHash,
    previousManifestPath: previousManifestPath
      ? path.relative(REPO_ROOT, previousManifestPath).split(path.sep).join("/")
      : null,
    scope: SCOPE_ROOTS.map((s) => s.label),
    entryCount: entries.length
  };
  const footer = { record: "footer", manifestHash, entryCount: entries.length };

  const lines = [JSON.stringify(header), ...entries.map((e) => JSON.stringify(e)), JSON.stringify(footer)];
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");

  return { outPath, header, footer, entries };
}

function main() {
  const args = process.argv.slice(2);
  const reasonArg = args.find((a) => a.startsWith("--reason="));
  const reason = reasonArg ? reasonArg.slice("--reason=".length) : null;
  const jsonOut = args.includes("--json");

  const { outPath, header, footer, entries } = buildManifest({ reason });

  if (jsonOut) {
    console.log(JSON.stringify({ outPath, header, footer }, null, 2));
  } else {
    console.log(`Governance checkpoint manifest written: ${path.relative(REPO_ROOT, outPath)}`);
    console.log(`  entries: ${entries.length}`);
    console.log(`  manifestHash: ${footer.manifestHash}`);
    console.log(`  previousManifestHash: ${header.previousManifestHash || "(none — genesis manifest)"}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { buildManifest, collectEntries, hashFile, hashString };
