# A1a — Paper Trade Ownership Split Plan (Planning Only)

**Module:** TracktaOS Module 1 — Solana Momentum Bot
**Sprint:** 4 of 4 (Phase 1 — Structure and Recovery)
**Status:** **Planning only** — no code, no migration, no file moves, no renames executed
**Operating constraint:** `PIPELINE_DRY_RUN` unchanged; this milestone touches no runtime behavior

**Parent:** [A1_UNIFIED_STATE_PLAN.md](./A1_UNIFIED_STATE_PLAN.md) (race R1 — `paper_trades.json` dual writer) · [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) (rank 1 — file races)
**Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)

---

## 0. Scope separation (read first)

| ID | Owns | This document? |
|----|------|----------------|
| **A1a** (this doc) | **Paper trade ownership split** — resolve `paper_trades.json` dual-writer (scanner append vs monitor rewrite) | **Yes** |
| **A1b** | **Atomic config writes** — `live_config.json` single-owner + temp-rename across JS/PS writers | No |
| **A2** | **Supervisor behavior** — restart policy, safe-mode, consuming M5 heartbeats | No |

A1a deals **only** with the paper-trade files. It does **not** make `live_config.json` atomic (A1b), add any supervisor/restart/retry (A2), touch strategy/exits, change `PIPELINE_DRY_RUN`, enable live, move archives, add dependencies, or add a database. This document writes **only** `docs/A1A_PAPER_TRADES_OWNERSHIP_PLAN.md`.

---

## 1. Mission

Resolve the highest-risk state-ownership issue in [A1_UNIFIED_STATE_PLAN.md](./A1_UNIFIED_STATE_PLAN.md) (race **R1**, Critical): `paper_trades.json` has **two writer modes** — the **scanner appends** new entries while the **monitor full-rewrites** the entire file to update lifecycle status. Two processes writing one file with two write models risks **lost trades** and **corrupted JSONL**.

The fix is an **ownership split**: separate the *immutable entry/research record* (scanner-owned, append-only) from the *mutable lifecycle state* (monitor-owned), so **no file ever has two writers** — while preserving current behavior and losing no history.

---

## 2. Current behavior (inspection findings)

### 2.1 File facts

- `paper_trades.json` is **JSONL content** (one JSON object per line) despite the `.json` extension. Confirmed in `scanner_gmgn_trending.js`, `monitor.js`, `dashboard_server.js` (all split on `\n` and parse per line).
- Single physical file, **two writers**, **two write models**.

### 2.2 Writer behavior

| Process | Function | Write model | What it writes |
|---------|----------|-------------|----------------|
| **Scanner** (`scanner_gmgn_trending.js`) | `logPaperTrade` → `appendJsonLine(PAPER_FILE, buildPaperTradeRecord(...))` | **Append** (one line) | Immutable entry snapshot: research metrics + `entryPrice` / `targetPrice` (×1.10) / `stopPrice` (×0.95) + `status: "OPEN"` + `thesisMatch` / `thesisFailureReasons` |
| **Monitor** (`monitor.js`) | `monitorTrades` → `saveTrades(trades)` = `fs.writeFileSync(PAPER_FILE, ...)` | **Full rewrite (non-atomic)** | Reads all rows, mutates OPEN rows in place (`closeTrade` / `markNeedsReview`), rewrites the whole file |

The monitor's mutation adds: `status` (`WIN`/`LOSS`/`TIMEOUT`/`NEEDS_REVIEW`), `triggerType`, `triggerPrice`, `exitPrice`, `pnlPercent`, `closedAt`, `monitorVersion`, and anomaly fields (`anomalyReason`, `observedPrice`, `observedPairAddress`, `anomalyTimestamp`).

### 2.3 Current schema (one row)

```jsonc
{
  "timestamp": "2026-06-22T...Z",       // entry time (scanner)
  "source": "gmgn_trending",
  "strategyVersion": "gmgn_v4",
  "monitorVersion": "monitor_v4",
  "symbol": "...", "name": "...", "address": "...", "pairAddress": "...",
  "score": 0, "liquidity": 0, "marketCap": 0, "poolLiquidity": 0,
  "holderCount": 0, "top10HolderRate": 0, "botDegenRate": 0, "bundlerRate": 0,
  "volume5m": 0, "volume1h": 0, "buys5m": 0, "sells5m": 0,
  "entryPrice": 0, "targetPrice": 0, "stopPrice": 0,
  "status": "OPEN",                      // entry default (scanner) → mutated by monitor
  "chart": "...",
  "thesisMatch": true, "thesisFailureReasons": [],
  // ── added by monitor on close ──
  "triggerType": "TARGET|STOP|TIMEOUT", "triggerPrice": 0, "exitPrice": 0,
  "pnlPercent": 0, "closedAt": "...Z",
  // ── added by monitor on anomaly ──
  "status": "NEEDS_REVIEW", "anomalyReason": "...", "observedPrice": 0,
  "observedPairAddress": "...", "anomalyTimestamp": "...Z"
}
```

### 2.4 The hidden cross-dependency (critical)

The scanner is **also a reader** of monitor-owned lifecycle status:

| Scanner function | Reads | Depends on monitor mutation? |
|------------------|-------|------------------------------|
| `recentlyTraded(address)` | row `timestamp` only | **No** — depends only on its own appends |
| `alreadyOpen(address)` | `status === "OPEN"` | **Yes** — needs to see the monitor close a trade (OPEN→closed) to ever re-enter |
| `recentlyLost(address)` | `status === "LOSS"` + `closedAt` | **Yes** — needs the monitor's close outcome + timestamp |

The dashboard (`renderDashboard`, `renderWinnersAnalysis`, reconciliation/promotion contexts) reads the **same file** and depends on `trade.status` and `trade.pnlPercent` reflecting **current lifecycle outcomes**.

**Implication:** any split must keep current lifecycle status readable by both the scanner (for cooldown/dedup) and the dashboard (for stats). The entry ledger alone is insufficient for these readers — they need the lifecycle store.

### 2.5 Related file (unaffected, confirmed)

`pipeline_candidates.jsonl` is **scanner-only, append-only** (`buildPipelineCandidateIntent` strips `status` and adds `candidateIntentId`). It is the scanner→executor handoff and is **not** part of the R1 dual-writer problem. A1a leaves it unchanged.

---

## 3. Ownership model (single-writer)

Apply A1 Principle 1 (single writer) and Principle 3 (ledgers are append-only) by splitting one file into two, each with exactly one writer:

| Artifact | Type (A1 taxonomy) | **Sole writer** | Readers | Mutation |
|----------|--------------------|-----------------|---------|----------|
| `paper_trades.json` (kept) | **LEDGER** (append-only) | **Scanner** | monitor (discovery), dashboard, scanner (`recentlyTraded`), analysis | **Never mutated** — immutable entry/research rows |
| `paper_positions.json` (**new**) | **AUTHORITATIVE STATE** (mutable snapshot) | **Monitor** | dashboard, scanner (`alreadyOpen`/`recentlyLost`), analysis | Monitor owns full lifecycle (OPEN → WIN/LOSS/TIMEOUT/NEEDS_REVIEW) |

**Who owns what:**

- **Scanner owns append-only research rows.** It keeps doing exactly what it does today (`appendJsonLine(PAPER_FILE, ...)`), and **stops being mutated by anyone**. Its rows are the permanent research/entry ledger.
- **Monitor owns mutable paper-trade lifecycle state.** It **stops writing `paper_trades.json`** and instead maintains its own store `paper_positions.json` (single writer). It discovers new entries by reading the entry ledger, then owns their lifecycle.

This removes the dual writer on `paper_trades.json` (R1) with the **minimum possible change to the scanner** (its write path is untouched).

### 3.1 Join key (`entryId`)

Both files are joined by a deterministic key derived from immutable fields:

```
entryId = `${timestamp}_${address}_${pairAddress}`
```

This is the same formula already used for `candidateIntentId` in the scanner, so it is proven and collision-safe in practice. The monitor computes `entryId` for each entry ledger row; the position store is keyed by `entryId`.

### 3.2 `paper_positions.json` shape (monitor-owned)

A snapshot (latest-wins) of lifecycle state per entry — only the fields the monitor mutates, plus the key:

```jsonc
{
  "entryId": "2026-06-22T...Z_<address>_<pair>",
  "address": "...", "pairAddress": "...", "symbol": "...",
  "status": "OPEN|WIN|LOSS|TIMEOUT|NEEDS_REVIEW",
  "triggerType": "TARGET|STOP|TIMEOUT|null",
  "triggerPrice": 0, "exitPrice": 0, "pnlPercent": 0, "closedAt": "...Z|null",
  "anomalyReason": null, "observedPrice": null, "observedPairAddress": null, "anomalyTimestamp": null,
  "monitorVersion": "monitor_v4",
  "updatedAt": "...Z"
}
```

The entry/research fields (score, liquidity, thesisMatch, entry/target/stop, etc.) stay **only** in the entry ledger — never duplicated into the store (avoids two sources of truth).

---

## 4. File naming

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Entry ledger filename | **Keep `paper_trades.json`** | Avoids breaking every existing reader and committed history; the `.json`→`.jsonl` rename is a separate hygiene step deferred per STABILIZATION_PLAN ("batch with A1 migration") and is **not** required for the ownership split |
| Lifecycle store filename | **`paper_positions.json`** (new) | Parallels existing `live_positions.json` (live lifecycle snapshot); clearly signals "mutable position state," distinct from the ledger |

Both remain **RUNTIME LOCAL** (gitignored). No file is moved or renamed in A1a; one new file is introduced by the monitor at runtime.

---

## 5. Backward compatibility

The design is **fallback-first**, so partial rollout and rollback are safe:

1. **Scanner reads.**
   - `recentlyTraded` → reads entry ledger (`paper_trades.json`). **Unchanged.**
   - `alreadyOpen` / `recentlyLost` → read `paper_positions.json` (current status); **if the store is absent**, fall back to reading `status`/`closedAt` from `paper_trades.json` exactly as today (legacy behavior).
2. **Dashboard reads.** A single merge helper produces the `forwardTrades` array the rest of the dashboard already consumes:
   - Start from entry ledger rows (research + entry fields).
   - Overlay lifecycle fields (`status`, `pnlPercent`, `closedAt`, …) from `paper_positions.json` matched by `entryId`.
   - **If the store is absent**, use the entry ledger rows as-is (legacy behavior). No panel signature changes.
3. **Legacy rows.** Existing `paper_trades.json` rows already carry baked-in closed statuses. After migration seeds the store from them, the merged view returns **identical** numbers (see § 6) — behavior preserved.

No reader is forced to change its output. The merge/fallback is additive.

---

## 6. Minimal migration path (no history loss)

A **one-time, behavior-preserving** seed — performed by the monitor on first run under the new model (or a tiny one-shot helper), never destructive:

1. **Seed the store from the existing ledger.** Read current `paper_trades.json`; for each row compute `entryId`; write a `paper_positions.json` row capturing that row's **current** lifecycle fields (`status`, `pnlPercent`, `closedAt`, anomaly fields). Closed/needs-review/open states are preserved verbatim → **no outcome history lost**.
2. **Leave `paper_trades.json` untouched.** It remains the historical entry ledger. Old rows keep their (now-frozen) `status` field; the merged view prefers the store value, which was seeded from those same rows → identical results.
3. **Going forward:**
   - Scanner appends new entries to `paper_trades.json` (unchanged).
   - Monitor, each cycle, reads the entry ledger, finds entries with no `paper_positions.json` row, creates an `OPEN` store row for each, then runs its existing lifecycle logic against the **store** (not the ledger) and rewrites only the store.
4. **Idempotent.** Re-running the seed must not duplicate or regress rows (keyed by `entryId`, latest-wins).

This is the smallest change that eliminates R1: the scanner's write path is unchanged; only the monitor's *target file* and *read source for lifecycle* move.

---

## 7. Test plan

All run from repo root; must pass before and after (behavior preservation):

1. **Safety suite unchanged:** `node run_safety_tests.js` → 4/4 (paper split must not affect signer/pipeline/observation tests).
2. **Syntax:** `node --check scanner_gmgn_trending.js monitor.js dashboard_server.js`.
3. **Migration parity (golden test):** snapshot dashboard stats (open/wins/losses/timeouts/needs-review/pnl/win-rate) from current `paper_trades.json`; run seed; assert **identical** stats from the merged view.
4. **Scanner cooldown reads:**
   - `alreadyOpen` returns true while a store row is `OPEN`, false after monitor closes it.
   - `recentlyLost` returns true within 24h of a store `LOSS` `closedAt`.
   - `recentlyTraded` returns true within 24h of an entry-ledger `timestamp` (store-independent).
5. **Monitor lifecycle transitions:** OPEN→WIN (target), OPEN→LOSS (stop), OPEN→TIMEOUT (age≥20m), OPEN→NEEDS_REVIEW (<−50%) each update only `paper_positions.json`; `paper_trades.json` byte-unchanged after a monitor cycle.
6. **Dashboard fallback:** with `paper_positions.json` absent, dashboard renders identically to today (legacy path).
7. **No-dual-writer assertion:** during a concurrent scanner-append + monitor-cycle window, confirm the two processes write **different** files (R1 structurally gone).
8. **Live mirror intact:** `mirrorLiveExit` / `flagLiveReview` still fire on monitor close transitions (live-side behavior unchanged; still `PIPELINE_DRY_RUN`).

---

## 8. Rollback plan

A1a is designed to be reversible without data loss:

1. **Revert code** for `scanner_gmgn_trending.js`, `monitor.js`, `dashboard_server.js`.
2. **Fold-back step (lossless):** because the monitor stopped mutating `paper_trades.json` during A1a, any closes recorded only in `paper_positions.json` must be merged back into `paper_trades.json` before resuming the legacy monitor (a documented one-shot: for each store row, apply its lifecycle fields onto the matching ledger row by `entryId`, then rewrite the ledger once). This restores the pre-A1a single-file representation with **all** outcomes.
3. **Delete `paper_positions.json`** (it is CACHE-rebuildable from the ledger after fold-back).
4. **Verify:** dashboard stats and scanner cooldowns match pre-rollback values; safety suite 4/4.

Because `paper_trades.json` is append-only under A1a (never rewritten by the monitor), it cannot be corrupted by the new code — making rollback low-risk.

---

## 9. Acceptance criteria

A1a **implementation** (future, separately approved) is complete when:

1. `paper_trades.json` has **exactly one writer** (scanner, append-only) — the monitor no longer writes it (verified by code + byte-unchanged-after-cycle test).
2. `paper_positions.json` has **exactly one writer** (monitor) and holds all lifecycle mutations.
3. Scanner `alreadyOpen` / `recentlyLost` read current lifecycle status correctly (store with legacy fallback); `recentlyTraded` unchanged.
4. Dashboard renders **identical** stats pre/post migration; fallback path works with the store absent.
5. Migration seed is **idempotent** and **loses no history** (golden parity test passes).
6. Rollback (with fold-back) restores pre-A1a state losslessly.
7. Safety suite 4/4; `node --check` clean; posture remains `PIPELINE_DRY_RUN`, `liveArmed: false`.
8. No strategy/exit/thesis change; no config atomicity work (A1b); no supervisor (A2); no dependency/database; no archive move.

A1a **planning** (this document) is complete now: current schema/writers documented (§2), ownership assigned (§3), naming chosen (§4), compatibility (§5), migration (§6), tests (§7), rollback (§8), acceptance (§9).

---

## 10. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Scanner loses ability to see closes (breaks re-entry cooldown) | High | `alreadyOpen`/`recentlyLost` read the monitor store; fallback to ledger when store absent |
| Dashboard stats change after split | High | Merge by `entryId`; golden parity test enforces identical numbers |
| `entryId` collision (same address+pair+timestamp) | Low | Timestamp is ISO ms; identical to proven `candidateIntentId`; latest-wins on store |
| Monitor store rewrite is itself non-atomic | Medium | Recommend temp-file + rename for the store write (within A1a-impl); not config atomicity (that is A1b) |
| Partial rollout (store exists, code reverted) | Medium | Fold-back step in rollback (§8) reconstructs the single-file view losslessly |
| Scope creep into A1b/A2 | High | A1a touches only paper files; no config atomicity, no supervisor |

---

## 11. Examples

- **New entry.** Scanner appends one immutable row to `paper_trades.json`. Monitor's next cycle sees an entry with no store row, creates `{entryId, status:"OPEN", ...}` in `paper_positions.json`. Two processes, two files, zero contention.
- **Target hit.** Monitor updates only the store row: `status:"WIN"`, `pnlPercent`, `closedAt`. `paper_trades.json` is untouched. Dashboard merge shows the WIN; scanner `alreadyOpen` now returns false (re-entry allowed after cooldown).
- **Store missing (fresh clone / rollback).** Dashboard and scanner fall back to `paper_trades.json` `status` exactly as today.

---

## 12. Future phases (out of scope — do not start without approval)

| Phase | Work | Gated by |
|-------|------|----------|
| A1a-impl | Implement the split + idempotent seed + dashboard merge + fallbacks | This plan's approval |
| Hygiene | Rename `paper_trades.json` → `paper_trades.jsonl` (breaking; update all readers) | A1a-impl stable |
| A1b | Atomic `live_config.json` writes (single owner, temp-rename) | Separate plan |
| A2 | Supervisor consuming M5 heartbeats + A1 healthy-state guarantees | A1 implementation complete |

---

## 13. Do-not-implement warnings

A1a must **never**: change strategy/exits/thesis bounds; enable live or change `PIPELINE_DRY_RUN`; make config writes atomic (A1b); add a supervisor/restart/retry/spawn (A2); add a dependency or database; move/rename/delete archive files; or make the dashboard (or any reader) a writer of authoritative state. If a proposed change does any of these, it is outside A1a — stop and re-scope.

---

*A1a Paper Trade Ownership Split (planning only) · TracktaOS Module 1 · Phase 1 Stabilization (Sprint 4) · Resolves A1 race R1. Safe default: `PIPELINE_DRY_RUN`, no live submission. A1a = paper ownership split · A1b = atomic config writes · A2 = supervisor. No implementation, no migration, no file moves, no database, no supervisor. Act conservatively; TracktaOS stability has priority over cleanliness.*
