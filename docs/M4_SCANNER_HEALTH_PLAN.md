# M4 — Scanner Health Visibility Plan

**Sprint:** 2 — Honest Measurement  
**Tasks:** M4a (scanner writes `scanner_health.json`) + M4 (dashboard read-only health panel)  
**Status:** Planning only — no code changes until this document is reviewed  
**Constraint:** `PIPELINE_DRY_RUN` throughout. No filter/scoring changes. No archive edits. No databases. A2 supervisor deferred.

**Parent plan:** [SPRINT_2_PLAN.md](./SPRINT_2_PLAN.md)  
**Issue registry:** [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) (GMGN CLI fragility; no process supervisor)  
**Ori briefing:** [ORI_MEMORY.md](./ORI_MEMORY.md) (zero trending may mean scanner failure, not empty market)

---

## 1. Goal

Operators and Ori can distinguish **scanner process health** from **trading/pipeline health** without reading console logs or guessing from absent paper trades.

Target states (explicit, non-overlapping labels):

| State | Meaning |
|---|---|
| **Healthy scanning** | Scanner completed a recent cycle; GMGN trending fetch succeeded; discovery layer is operating |
| **Degraded scanning** | Scanner is running cycles but GMGN/Dex failures or partial interval success — data may be incomplete |
| **Stalled scanner** | `--watch` expected but `lastScanAt` is too old — process likely dead, hung, or not started |
| **Missing scanner activity** | No health snapshot yet, or one-shot scan with no recent activity when watch mode is expected |

**Not in scope:** diagnosing executor aborts, liveArmed posture, or paper win rate — those remain separate dashboard panels (M7, M6a, M2).

---

## 2. Current State (Inspected)

### 2.1 Scanner — no structured heartbeat (`scanner_gmgn_trending.js`)

**Operational modes:**

- Single pass: `node scanner_gmgn_trending.js`
- Watch loop: `node scanner_gmgn_trending.js --watch` — **60s** fixed interval (`sleep(60000)`)

**Existing telemetry:** console logs only. No `scanner_health.json`, no append-only metrics file, no heartbeat timestamp file.

**Per-scan flow (`scan()`):**

1. `getGmgnTrending()` — GMGN CLI for intervals `1m`, `5m`, `1h` (limit 100 each)
2. DexScreener pair enrichment per token (`getBestPair`, 120ms sleep)
3. `scoreCandidate()` + top-20 momentum pass
4. GMGN info/pool checks per candidate (`getGmgnInfo`, `getGmgnPool`, 200ms sleeps)
5. Optional paper/pipeline writes (`logPaperTrade`)

**Error handling today:**

| Step | On failure | Structured count? |
|---|---|---|
| GMGN trending per interval | `catch` → console log, continue other intervals | No |
| Dex pair fetch | `catch` → `null`, skip token | No |
| GMGN info/pool | `catch` → `null`, likely reject | No |
| Fatal `main()` | `console.error`, exit | No |

**Implication:** A scan can “complete successfully” with **zero trending tokens** when all three GMGN interval calls failed — console shows errors, but **no durable signal** for dashboard or Ori.

**Confirmed outputs (unchanged by M4):** `paper_trades.json`, `pipeline_candidates.jsonl`, `near_misses.json`.

### 2.2 Dashboard — misleading static scanner status (`dashboard_server.js`)

| Surface | Current behavior | Problem |
|---|---|---|
| `systemStatusPanel()` | Hardcoded `SCANNER … RUNNING` | Always green even if scanner process dead |
| `brandHeader()` | `SYSTEM ONLINE` | Global, not scanner-specific |
| `walletConnectionPanel()` | Reads `wallet_status.json`, **stale age warning** | Good pattern to copy for scanner |
| `rpcHealthPanel()` | Reads `rpc_health.json` | Good pattern to copy for scanner |
| Scanner-specific panel | **None** | Operators lack last scan time, GMGN errors, trending counts |

**Dashboard does not read** scanner logs, `pipeline_candidates.jsonl` append rate, or process list — cannot infer scanner health today.

### 2.3 Executor — no scanner coupling (`live_executor.js`)

Executor has **no** scanner heartbeat imports, no `last_scan_at` file, no cross-process health checks. **M4 should not add executor→scanner coupling** — keeps discovery and observation decoupled.

### 2.4 Operator scripts

`fomo_status.ps1` lists matching `node.exe` processes by script name (including `scanner_gmgn_trending.js`) but does **not** report last scan age, GMGN error counts, or trending row counts. Process presence ≠ successful scanning.

### 2.5 What operators lack today

1. **When** the scanner last finished a cycle (`lastScanAt`)
2. **Whether** GMGN trending calls succeeded vs failed (per interval)
3. **How many** raw trending tokens vs filtered candidates vs results
4. **Stall detection** when `--watch` is expected but scans stop updating
5. **Quiet market vs broken GMGN** — zero rows with errors vs zero rows with clean fetches
6. **Separation from trading failures** — empty pipeline audit tail may mean scanner quiet, not executor broken

Ori explicitly warns: *“Zero trending tokens may mean scanner failure, not empty market.”* ([ORI_MEMORY.md](./ORI_MEMORY.md))

---

## 3. Minimum Safe Implementation

SPRINT_2 splits work into **M4a** (file writer) + **M4** (dashboard reader). Ship both together for operator value.

### 3.1 M4a — Scanner writes `scanner_health.json` (`scanner_gmgn_trending.js` only)

**When to write:** At end of every `scan()` invocation — success, partial failure, or zero results. Also write on fatal catch in `main()` with `lastScanStatus: "failed"` if scan aborts early (wrap `scan()` in try/finally).

**How to write:** Synchronous `writeFileSync` JSON snapshot (same pattern as M3 `observation_dedup.json`, `wallet_status.json`). Best-effort; never throw from health writer into scan path.

**Instrumentation (additive counters during existing scan — no filter/scoring changes):**

- Wrap/refactor **only** error paths to increment counters (trending interval failures, dex null pair, gmgn info/pool null)
- Record scan start/end timestamps and duration
- Capture watch mode flag and interval from existing constants

**Do not change:** `MIN_SCORE_TO_LOG`, filter thresholds, `scoreCandidate`, `rejectReason`, `logPaperTrade`, thesis tagging (M1), sleep timings, GMGN CLI commands.

**Export for tests:** `buildScannerHealthSnapshot(stats)`, `writeScannerHealthSnapshot(snapshot)`, `SCANNER_HEALTH_FILE` via `module.exports`.

### 3.2 M4 — Dashboard read-only panel (`dashboard_server.js` only)

**Add:**

- `SCANNER_HEALTH_FILE` constant
- `loadScannerHealth()` — parse JSON; tolerate missing/corrupt → `null`
- `classifyScannerHealth(health)` → `{ status, label, cls, reasons[] }` using definitions in §4
- `scannerHealthPanel()` — read-only panel modeled after `walletConnectionPanel()` / `rpcHealthPanel()`

**Integrate:**

- Insert `scannerHealthPanel()` in `renderDashboard()` near `systemStatusPanel()` or wallet/RPC panels (ops visibility strip)
- **Update `systemStatusPanel()` SCANNER row** to reflect classified status from health file (not hardcoded RUNNING) — minimal change, high leverage

**Banner (required copy):**

> Scanner health reflects **discovery layer** activity only. Stalled scanner ≠ executor failure. Pipeline observations and liveArmed are reported separately.

**Do not:** add restart buttons, auto-start scanner, or tie scanner status to automation toggles.

### 3.3 `.gitignore`

Add `scanner_health.json` (runtime operational data, Q10 policy — same as `wallet_status.json`, `observation_dedup.json`).

### 3.4 Tests

Add focused `test_scanner_health.js` (Ori-approved safety suite extension — single file, no GMGN network):

- `buildScannerHealthSnapshot()` produces schema v1 fields from fixture stats
- `classifyScannerHealth()` (dashboard helper exported for test or duplicated test fixture) — healthy / degraded / stalled / missing cases
- Optional: scanner write in temp dir via exported test hook

Keep existing four core safety tests green; add fifth only if operator approves CI expansion — plan recommends **optional** fifth test, not blocking M4 merge if deferred.

### 3.5 Docs touch

- `docs/KNOWN_ISSUES.md` — GMGN CLI fragility **partially resolved** (M4 visibility); no supervisor change
- Optional one-line in `ACTIVE_MANIFEST.md` runtime files list

---

## 4. Proposed `scanner_health.json` Schema (v1)

```json
{
  "schemaVersion": 1,
  "scannerFile": "scanner_gmgn_trending.js",
  "strategyVersion": "gmgn_v4",
  "watchMode": true,
  "watchIntervalSec": 60,
  "lastScanAt": "2026-06-22T12:00:00.000Z",
  "lastScanStartedAt": "2026-06-22T11:59:10.000Z",
  "lastScanDurationMs": 50234,
  "lastScanStatus": "ok",
  "trending": {
    "uniqueTokenCount": 142,
    "intervals": {
      "1m": { "ok": true, "rowCount": 100, "error": null },
      "5m": { "ok": true, "rowCount": 98, "error": null },
      "1h": { "ok": false, "rowCount": 0, "error": "timeout" }
    }
  },
  "scanStats": {
    "pairsEvaluated": 142,
    "passedMomentumFilters": 20,
    "gmgnSafetyChecksRun": 20,
    "resultsCount": 3,
    "paperTradesLoggedThisScan": 1,
    "nearMissesLoggedThisScan": 2
  },
  "errors": {
    "gmgnTrendingFailures": 1,
    "gmgnInfoFailures": 0,
    "gmgnPoolFailures": 0,
    "dexPairFailures": 4,
    "lastError": "GMGN trending fetch failed for interval 5m: timeout"
  }
}
```

| Field | Purpose |
|---|---|
| `watchMode` / `watchIntervalSec` | Dashboard stall threshold: stale if age > `2 × watchIntervalSec` when `watchMode: true` |
| `lastScanAt` | Heartbeat — last successful scan completion |
| `lastScanStatus` | Scanner self-report: `ok` \| `degraded` \| `failed` (see below) |
| `trending.intervals` | Per-interval GMGN success — distinguishes partial failure |
| `scanStats.*` | Funnel counts — context for “quiet” vs “broken early” |
| `errors.*` | Aggregate failure counts + last error string (truncated, no secrets) |

**Scanner-side `lastScanStatus` assignment (writer logic):**

| Value | Condition |
|---|---|
| `failed` | Scan threw before normal completion **or** all trending intervals failed **or** zero tokens and all intervals errored |
| `degraded` | Scan completed but `gmgnTrendingFailures > 0` **or** `gmgnInfoFailures + gmgnPoolFailures > 0` **or** any interval `ok: false` with others ok |
| `ok` | Scan completed; all trending intervals `ok: true`; no GMGN safety-check failures beyond normal rejects |

Normal `rejectReason` rejections are **not** errors — they are healthy filtering.

---

## 5. Dashboard Health Classification (reader logic)

Computed in dashboard from snapshot + clock (not stored in file — avoids stale status if dashboard reads old file).

### 5.1 Definitions

| Status | Label | Conditions (all are read-only derivations) |
|---|---|---|
| **Missing scanner activity** | `NO DATA` | File missing/unparseable **or** `lastScanAt` absent |
| **Stalled scanner** | `STALLED` | `watchMode === true` **and** `now - lastScanAt > 2 × watchIntervalSec` (default **> 120s**) **or** process clearly expected but file never updated after startup window |
| **Degraded scanning** | `DEGRADED` | Not stalled/missing **and** (`lastScanStatus === "degraded"` **or** `lastScanStatus === "failed"` **or** `errors.gmgnTrendingFailures > 0` **or** any interval `ok: false`) |
| **Healthy scanning** | `HEALTHY` | Not stalled/missing/degraded; recent `lastScanAt`; `lastScanStatus === "ok"` |

### 5.2 Quiet market vs GMGN failure (operator copy)

| Snapshot pattern | Dashboard interpretation |
|---|---|
| `lastScanStatus: ok`, all intervals ok, `uniqueTokenCount > 0`, `resultsCount: 0` | **Healthy — quiet filters** (no setups passed GMGN safety) |
| `lastScanStatus: ok`, all intervals ok, `uniqueTokenCount: 0` | **Healthy — empty trending** (rare; GMGN returned empty ranks) |
| `gmgnTrendingFailures > 0` or any interval `ok: false` | **Degraded — GMGN/discovery issue** (not “empty market”) |
| Stale `lastScanAt` in watch mode | **Stalled — check scanner process** (not executor) |

### 5.3 Dashboard presentation ideas

**Panel: “Scanner Health & Discovery”** (read-only)

```
┌─────────────────────────────────────────────────────────┐
│ ⟐ SCANNER HEALTH & DISCOVERY          [HEALTHY badge]   │
│ Discovery layer only — not pipeline or live execution.    │
├─────────────────────────────────────────────────────────┤
│ Last scan: 42s ago · Duration: 50s · Mode: watch (60s)  │
│ Trending tokens: 142 · Results: 3 · Paper logged: 1     │
│ GMGN intervals: 1m ✓100  5m ✓98  1h ✗ timeout           │
│ Errors this scan: trending 1 · info 0 · pool 0 · dex 4  │
└─────────────────────────────────────────────────────────┘
```

**CSS:** Reuse `.wc-stale`, `.wc-health-badge`, `.wc-green`/`.wc-yellow`/`.wc-red` from wallet/RPC panels.

**`systemStatusPanel()` SCANNER row:** Map to `HEALTHY` / `DEGRADED` / `STALLED` / `NO DATA` instead of static RUNNING.

**Placement:** After `systemStatusPanel()` or before wallet panel — ops strip priority.

---

## 6. Files Changed (Implementation)

| File | M4a / M4 | Scope |
|---|---|---|
| `scanner_gmgn_trending.js` | M4a | Counters + `writeScannerHealthSnapshot()` at end of `scan()` |
| `dashboard_server.js` | M4 | `scannerHealthPanel()`, classify helper, update `systemStatusPanel()` SCANNER row |
| `.gitignore` | Both | `scanner_health.json` |
| `test_scanner_health.js` | Both | Classification + snapshot schema tests (optional CI) |
| `docs/KNOWN_ISSUES.md` | Doc | Partial resolution note |

**Not touched:** `live_executor.js`, strategy/scoring, archive folders, `PIPELINE_DRY_RUN`, scanner filters.

---

## 7. Risks

| Risk | Level | Mitigation |
|---|---|---|
| **False STALLED alert** (single-pass mode) | Medium | `watchMode: false` → use relaxed stale threshold or label “last single scan” without stall alarm |
| **False HEALTHY when process dead after last good scan** | Medium | Stale `lastScanAt` in watch mode; document that health file is last-known, not live process probe |
| **`fomo_status.ps1` vs health file disagree** | Low | Document: process list + health file together; M5 may unify |
| **File write race** (dashboard read mid-write) | Low | Small JSON write; corrupt parse → NO DATA; A1 deferred |
| **Scope creep into GMGN rewrite** | High | Counters only; no retry/backoff/API client |
| **Conflating scanner with executor** | High | Required banner + separate panel; no changes to liveArmed/reconciliation |
| **Hardcoded SYSTEM ONLINE header** | Low | Optional follow-up; M4 fixes SCANNER row at minimum |
| **Test suite expansion** | Low | Optional fifth test; core four must stay green |

---

## 8. Acceptance Criteria

| ID | Criterion | Verification |
|---|---|---|
| AC1 | `scanner_health.json` written after each `scan()` completion | Run scanner once; inspect file |
| AC2 | Schema v1 includes `lastScanAt`, trending counts, per-interval ok/error, error counters | JSON inspection |
| AC3 | GMGN trending interval failure increments `errors.gmgnTrendingFailures` | Unit test with mocked failure stats |
| AC4 | Normal `rejectReason` rejections do not increment GMGN error counters | Code review + test |
| AC5 | Dashboard shows HEALTHY / DEGRADED / STALLED / NO DATA | Visual review |
| AC6 | Watch-mode stale detection uses `2 × watchIntervalSec` | Test fixture with old `lastScanAt` |
| AC7 | Panel banner states scanner ≠ trading health | Visual review |
| AC8 | `systemStatusPanel()` SCANNER row reflects classified status | Visual review |
| AC9 | Quiet market (ok scan, zero results, no errors) shows HEALTHY | Fixture test |
| AC10 | GMGN failure pattern shows DEGRADED, not “quiet market” | Fixture test |
| AC11 | `node --check scanner_gmgn_trending.js` + `dashboard_server.js` pass | Syntax |
| AC12 | `node run_safety_tests.js` → 4/4 pass | CI smoke |
| AC13 | `node live_executor.js --status` unchanged posture | Smoke |
| AC14 | Scanner filters/scoring unchanged | `git diff` review |
| AC15 | `scanner_health.json` gitignored | `.gitignore` review |
| AC16 | KNOWN_ISSUES updated | Doc review |

---

## 9. Verification Steps (Post-Implementation)

1. `node --check scanner_gmgn_trending.js`
2. `node --check dashboard_server.js`
3. `node run_safety_tests.js` → 4/4 (5/5 if optional test added)
4. `node live_executor.js --status` → `PIPELINE_DRY_RUN`, `liveArmed: false`
5. Run `node scanner_gmgn_trending.js` (single pass) → confirm `scanner_health.json` created
6. Start dashboard → confirm scanner panel shows last scan age and trending counts
7. Simulate stale file (edit `lastScanAt` to 10 minutes ago, `watchMode: true`) → STALLED badge
8. Simulate degraded fixture (`gmgnTrendingFailures: 1`) → DEGRADED badge + interval detail
9. `git diff scanner_gmgn_trending.js` — no changes to filter constants or `scoreCandidate`
10. `git diff live_executor.js` — empty

---

## 10. Boundaries: M4 vs M5 vs A2

| Concern | M4 (Sprint 2) | M5 (Sprint 3) | A2 (Sprint 4) |
|---|---|---|---|
| **Scanner last scan time** | `scanner_health.json` | May add cross-process heartbeat files | Supervisor consumes heartbeats |
| **Executor last cycle** | Not in M4 | `last_cycle_at` heartbeat | Auto-restart policy |
| **Process liveness** | Infer from file age | Explicit heartbeat per process | Restart dead processes |
| **Dashboard** | Read-only scanner panel | Stale alerts for all processes | Ops runbook integration |
| **Auto-remediation** | None | None | Supervisor restarts |
| **GMGN client rewrite** | No | No | Optional future |

**M4 rule:** If work requires process supervisor, executor changes, or scanner filter adjustments → **stop** and re-scope.

---

## 11. Implementation Order

```text
M4a: scanner_gmgn_trending.js
  └─ scanStats collector (additive counters in existing functions)
  └─ buildScannerHealthSnapshot() + writeScannerHealthSnapshot()
  └─ call at end of scan() (+ finally on failure)
  └─ module.exports for tests

M4: dashboard_server.js
  └─ loadScannerHealth() + classifyScannerHealth()
  └─ scannerHealthPanel()
  └─ systemStatusPanel() SCANNER row from classification

.gitignore + KNOWN_ISSUES.md
test_scanner_health.js (recommended)
Verify + commit
```

Estimated diff: **~100–140 lines** scanner, **~80–110 lines** dashboard, **~60 lines** test, **~3 lines** gitignore.

---

## 12. Open Question (Before Implementation)

Should **single-pass** scans (`watchMode: false`) show **STALLED** never, or use a longer optional threshold (e.g. 24h) for “missing activity” warnings?

**Recommendation:** Never STALLED when `watchMode: false`; show **last scan age** only with HEALTHY/DEGRADED/NO DATA — avoids false alarms for manual scans.

---

*Sprint 2 M4 · Scanner health visibility · TracktaOS Module 1 · Planning only*
