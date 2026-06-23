"use strict";

// test_paper_positions_ownership.js — Sprint 4 A1a
// Validates the paper-trade ownership split (paper_positions_store.js) using an
// isolated OS temp directory. It NEVER touches the real runtime files
// (paper_trades.json / paper_positions.json) and performs no network or live calls.

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const store = require("./paper_positions_store");

const G = "\x1b[32m✔\x1b[0m";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "a1a-paper-"));
const LEDGER = path.join(tmp, "paper_trades.json");
const POS = path.join(tmp, "paper_positions.json");

function writeLedger(rows) {
  fs.writeFileSync(LEDGER, rows.map(r => JSON.stringify(r)).join("\n") + "\n");
}

// Mirror of store.mergedRows() but against explicit temp file paths.
function mergedAgainst(ledgerFile, posFile) {
  const ledger = store.readLedger(ledgerFile);
  const positions = store.readPositions(posFile);
  return ledger.map(row => {
    const overlay = positions ? positions[store.entryIdOf(row)] : null;
    if (!overlay) return row;
    const merged = { ...row };
    for (const f of store.LIFECYCLE_FIELDS) {
      if (overlay[f] !== undefined) merged[f] = overlay[f];
    }
    return merged;
  });
}

const sampleLedger = [
  { timestamp: "2026-06-22T10:00:00.000Z", address: "AAA", pairAddress: "PA", symbol: "AAA", entryPrice: 1, targetPrice: 1.1, stopPrice: 0.95, status: "OPEN", thesisMatch: true },
  { timestamp: "2026-06-22T10:05:00.000Z", address: "BBB", pairAddress: "PB", symbol: "BBB", entryPrice: 2, targetPrice: 2.2, stopPrice: 1.9, status: "WIN", pnlPercent: 10, closedAt: "2026-06-22T10:20:00.000Z" },
  { timestamp: "2026-06-22T10:06:00.000Z", address: "CCC", pairAddress: "PC", symbol: "CCC", entryPrice: 3, targetPrice: 3.3, stopPrice: 2.85, status: "LOSS", pnlPercent: -5, closedAt: "2026-06-22T10:25:00.000Z" }
];

try {
  // ── T1: idempotent seed from existing ledger preserves outcomes ────────────
  writeLedger(sampleLedger);
  const seeded = store.seedPositionsFromLedger(store.readLedger(LEDGER));
  assert.strictEqual(Object.keys(seeded).length, 3, "seed should contain all ledger entries");
  const idWin = store.entryIdOf(sampleLedger[1]);
  assert.strictEqual(seeded[idWin].status, "WIN", "closed WIN preserved in seed");
  assert.strictEqual(seeded[idWin].pnlPercent, 10, "WIN pnl preserved");
  assert.strictEqual(seeded[store.entryIdOf(sampleLedger[2])].status, "LOSS", "closed LOSS preserved");
  console.log(`${G} T1 seed from existing ledger preserves closed outcomes`);

  // ── T2: store round-trips atomically and ledger bytes are UNCHANGED ─────────
  const ledgerBytesBefore = fs.readFileSync(LEDGER);
  store.writePositions(seeded, POS);
  const ledgerBytesAfter = fs.readFileSync(LEDGER);
  assert.ok(ledgerBytesBefore.equals(ledgerBytesAfter), "writing the positions store must not modify the ledger");
  assert.ok(!fs.existsSync(`${POS}.tmp`), "temp file should be renamed away (atomic write)");
  const reread = store.readPositions(POS);
  assert.strictEqual(reread[idWin].status, "WIN", "store round-trip preserves lifecycle");
  console.log(`${G} T2 store write is atomic and leaves paper_trades.json byte-identical`);

  // ── T3: lifecycle update writes ONLY the store; ledger still append-only ────
  const positions = store.readPositions(POS);
  const idOpen = store.entryIdOf(sampleLedger[0]);
  positions[idOpen] = { ...positions[idOpen], status: "TIMEOUT", pnlPercent: -1.2, closedAt: "2026-06-22T10:30:00.000Z", updatedAt: new Date().toISOString() };
  const ledgerBytesPre = fs.readFileSync(LEDGER);
  store.writePositions(positions, POS);
  assert.ok(ledgerBytesPre.equals(fs.readFileSync(LEDGER)), "lifecycle update must not rewrite the ledger");
  const mergedAfter = mergedAgainst(LEDGER, POS);
  const openRowMerged = mergedAfter.find(r => r.address === "AAA");
  assert.strictEqual(openRowMerged.status, "TIMEOUT", "merged view reflects store lifecycle update");
  assert.strictEqual(openRowMerged.entryPrice, 1, "merged view retains ledger entry fields");
  console.log(`${G} T3 lifecycle update writes only the store; ledger remains append-only`);

  // ── T4: merged parity — closed outcomes surface through the merged view ─────
  const merged = mergedAgainst(LEDGER, POS);
  assert.strictEqual(merged.find(r => r.address === "BBB").status, "WIN");
  assert.strictEqual(merged.find(r => r.address === "CCC").status, "LOSS");
  assert.strictEqual(merged.length, sampleLedger.length, "merge preserves one row per ledger entry");
  console.log(`${G} T4 dashboard merged view parity (outcomes surface, no row loss)`);

  // ── T5: fallback when store is missing → merged == raw ledger ───────────────
  const missingPos = path.join(tmp, "does_not_exist.json");
  assert.strictEqual(store.readPositions(missingPos), null, "missing store reads as null");
  const fallback = mergedAgainst(LEDGER, missingPos);
  assert.strictEqual(fallback.find(r => r.address === "AAA").status, "OPEN", "fallback uses ledger status when store missing");
  assert.deepStrictEqual(fallback, store.readLedger(LEDGER), "fallback merged view equals raw ledger");
  console.log(`${G} T5 scanner/dashboard fallback when positions store is missing`);

  // ── T6: entryId is deterministic ───────────────────────────────────────────
  assert.strictEqual(store.entryIdOf(sampleLedger[0]), "2026-06-22T10:00:00.000Z_AAA_PA");
  assert.strictEqual(store.entryIdOf(sampleLedger[0]), store.entryIdOf({ ...sampleLedger[0] }), "entryId is stable");
  console.log(`${G} T6 entryId = timestamp_address_pairAddress is deterministic`);

  console.log("\nPAPER POSITIONS OWNERSHIP TEST PASSED (6/6)");
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
}
