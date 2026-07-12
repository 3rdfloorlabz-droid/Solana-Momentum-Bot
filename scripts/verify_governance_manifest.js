"use strict";

/**
 * RB-G9 Governance Record Integrity — checkpoint manifest verifier.
 *
 * Companion to build_governance_manifest.js. Re-hashes the current tree and
 * compares it against a stored manifest (latest by default), reports any
 * MISMATCH / MISSING / EXTRA files, and verifies the manifest's own
 * self-hash and its chain link to the prior manifest.
 *
 * Exit codes: 0 = clean match, 1 = drift or chain-integrity failure,
 * 2 = usage/lookup error (e.g. no manifest exists yet).
 *
 * Read-only: never writes, never touches Git, never prints secret values.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const MANIFEST_DIR = path.join(REPO_ROOT, "Ori", "governance", "manifests");

const { collectEntries, hashString } = require("./build_governance_manifest.js");

function listManifests() {
  if (!fs.existsSync(MANIFEST_DIR)) return [];
  return fs
    .readdirSync(MANIFEST_DIR)
    .filter((f) => /^checkpoint-\d{8}-\d{6}\.jsonl$/.test(f))
    .sort()
    .map((f) => path.join(MANIFEST_DIR, f));
}

function parseManifest(manifestPath) {
  const lines = fs
    .readFileSync(manifestPath, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const header = lines[0];
  const footer = lines[lines.length - 1];
  const entries = lines.slice(1, -1);
  if (header.record !== "header" || footer.record !== "footer") {
    throw new Error(`malformed manifest: ${manifestPath}`);
  }
  return { header, footer, entries };
}

function verifySelfHash(manifest) {
  const entriesForHash = manifest.entries.map(({ path: p, size, sha256 }) => ({ path: p, size, sha256 }));
  const recomputed = hashString(
    JSON.stringify({ previousManifestHash: manifest.header.previousManifestHash, entries: entriesForHash })
  );
  return recomputed === manifest.footer.manifestHash;
}

function verifyChain(manifestPath, manifest) {
  if (!manifest.header.previousManifestPath) {
    return { ok: true, note: "genesis manifest — no predecessor to verify" };
  }
  const prevAbsPath = path.join(REPO_ROOT, manifest.header.previousManifestPath);
  if (!fs.existsSync(prevAbsPath)) {
    return { ok: false, note: `previous manifest missing on disk: ${manifest.header.previousManifestPath}` };
  }
  const prev = parseManifest(prevAbsPath);
  if (prev.footer.manifestHash !== manifest.header.previousManifestHash) {
    return { ok: false, note: "previousManifestHash does not match predecessor's stored manifestHash" };
  }
  return { ok: true, note: `chained to ${path.basename(prevAbsPath)}` };
}

function diffAgainstCurrentTree(manifest) {
  const current = collectEntries();
  const currentByPath = new Map(current.map((e) => [e.path, e]));
  const manifestByPath = new Map(manifest.entries.map((e) => [e.path, e]));

  const mismatched = [];
  const missing = []; // in manifest, not on disk
  const extra = []; // on disk, not in manifest

  for (const [p, recorded] of manifestByPath) {
    const live = currentByPath.get(p);
    if (!live) {
      missing.push(p);
    } else if (live.sha256 !== recorded.sha256 || live.size !== recorded.size) {
      mismatched.push({ path: p, recordedSha256: recorded.sha256, currentSha256: live.sha256 });
    }
  }
  for (const p of currentByPath.keys()) {
    if (!manifestByPath.has(p)) extra.push(p);
  }

  return { mismatched, missing, extra };
}

function main() {
  const args = process.argv.slice(2);
  const jsonOut = args.includes("--json");
  const explicitPath = args.find((a) => !a.startsWith("--"));

  const manifests = listManifests();
  if (manifests.length === 0) {
    const msg = "No governance checkpoint manifest found. Run: node scripts/build_governance_manifest.js";
    if (jsonOut) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(msg);
    process.exit(2);
  }

  const targetPath = explicitPath
    ? (path.isAbsolute(explicitPath) ? explicitPath : path.join(REPO_ROOT, explicitPath))
    : manifests[manifests.length - 1];

  if (!fs.existsSync(targetPath)) {
    const msg = `Manifest not found: ${targetPath}`;
    if (jsonOut) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(msg);
    process.exit(2);
  }

  const manifest = parseManifest(targetPath);
  const selfHashOk = verifySelfHash(manifest);
  const chain = verifyChain(targetPath, manifest);
  const { mismatched, missing, extra } = diffAgainstCurrentTree(manifest);

  const ok = selfHashOk && chain.ok && mismatched.length === 0 && missing.length === 0;
  // `extra` (new, un-checkpointed files) is reported but does not fail verification —
  // it is expected between checkpoints and simply means "run a new checkpoint."

  const result = {
    ok,
    manifestPath: path.relative(REPO_ROOT, targetPath).split(path.sep).join("/"),
    generatedAtUtc: manifest.header.generatedAtUtc,
    entryCount: manifest.header.entryCount,
    selfHashOk,
    chain,
    mismatched,
    missing,
    extraUncheckpointed: extra
  };

  if (jsonOut) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Manifest: ${result.manifestPath} (${result.entryCount} entries, ${result.generatedAtUtc})`);
    console.log(`  self-hash: ${selfHashOk ? "OK" : "MISMATCH"}`);
    console.log(`  chain: ${chain.ok ? "OK" : "BROKEN"} — ${chain.note}`);
    console.log(`  content mismatches: ${mismatched.length}`);
    for (const m of mismatched) console.log(`    - ${m.path}`);
    console.log(`  missing (recorded, now absent): ${missing.length}`);
    for (const m of missing) console.log(`    - ${m}`);
    console.log(`  extra (present, not yet checkpointed): ${extra.length}`);
    console.log(`\nOverall: ${ok ? "CLEAN — matches last checkpoint" : "DRIFT DETECTED"}`);
  }

  process.exit(ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { parseManifest, verifySelfHash, verifyChain, diffAgainstCurrentTree };
