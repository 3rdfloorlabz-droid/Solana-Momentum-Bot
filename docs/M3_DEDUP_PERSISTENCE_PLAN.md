# M3 — Observation Dedup Persistence Plan

**Sprint:** 2 — Honest Measurement  
**Task:** M3 (persist pair cooldown / observation dedup across executor restart)  
**Status:** Planning only — no code changes until this document is reviewed  
**Constraint:** `PIPELINE_DRY_RUN` throughout. No filter changes. No strategy changes. No archive edits. No databases. A1 unified state deferred.

**Parent plan:** [SPRINT_2_PLAN.md](./SPRINT_2_PLAN.md)  
**Related decisions:** [DECISIONS.md](./DECISIONS.md) (intent-first dedup, 60-minute pair cooldown)  
**Issue registry:** [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) (in-memory observation dedup partially lost on restart)

---

## 1. Goal

Operators and Ori can trust that **pipeline observation dedup survives executor restarts** — no duplicate Jupiter dry-run work for the same `candidateIntentId`, and no pair cooldown bypass for the same address/pair within the existing 60-minute window.

M3 closes the gap between **“audit seeding works in the common case”** and **“restart-safe in all normal failure modes.”** It does not redesign state architecture (A1).

---

## 2. Current State (Inspected)

### 2.1 Two separate dedup layers (do not conflate)

| Layer | Scope | Mechanism | Survives restart? |
|---|---|---|---|
| **Trading dedup** | LIVE / DRY_RUN entry selection | `applyTradingDedupe()` — open positions, same-day live entries | Yes (reads `live_positions.json`, `live_trades.jsonl`) |
| **Observation dedup** | `PIPELINE_DRY_RUN` only | In-memory `Set` + `Map` seeded from audit | **Partially** |

**M3 scope is observation dedup only.** Trading dedup, scanner re-entry cooldowns (24h), and in-cycle `seen`/`seenPairs` filters in `findPipelineObservationCandidates()` are out of scope.

### 2.2 Observation dedup — in-memory structures (`live_executor.js`)

| Structure | Type | Purpose |
|---|---|---|
| `observedPipelineCandidates` | `Set<string>` | Blocks re-observation of same intent or legacy pair key |
| `observedPipelinePairTimestamps` | `Map<string, number>` | Enforces 60-minute pair cooldown for new intents on same address/pair |
| `observationDedupSeeded` | `boolean` | Lazy one-time audit seed guard |
| `lastPipelineObservationSelectionStats` | object | Selection counters (not persisted; display/debug only) |

Constants and helpers (lines ~1146–1235):

- `PIPELINE_OBSERVATION_PAIR_COOLDOWN_MS = 60 * 60 * 1000` (60 minutes — **do not change in M3**)
- `candidateIntentKey(candidate)` → `intent|${candidateIntentId}` or `null`
- `candidatePairKey(candidate)` → `address_pair|${address}|${pairAddress}` or `null`
- `candidateKey(candidate)` → intent key preferred, else pair key
- `markObservedPair(candidate, timestampMs)` → keeps **max** timestamp per pair key
- `isPairWithinObservationCooldown(candidate)` → compares candidate `timestamp` vs last observed ms; blocks if delta < 60 min

### 2.3 Intent identity rules (preserve exactly)

**Scanner** (`scanner_gmgn_trending.js`):

```text
candidateIntentId = `${timestamp}_${address}_${pairAddress}`
```

Written on every `pipeline_candidates.jsonl` row at scan time. Shared timestamp with matching `paper_trades.json` row.

**Executor dedup priority** (DECISIONS.md, CHANGELOG.md):

1. **Intent-first:** if `candidateIntentId` present → key `intent|…` — **permanent** for that intent (no expiry)
2. **Legacy fallback:** if no intent id → key `address_pair|…` — permanent for that pair (pre-intent audit rows)
3. **Pair cooldown:** same address/pair with a **new** intent id blocked for 60 minutes after last observation of that pair

Queue rows (`pipeline_candidates.jsonl`) are preferred over open-paper duplicates for the same address/pair in `findPipelineObservationCandidates()`.

### 2.4 What survives restart today

| Source | Intent dedup (`observedPipelineCandidates`) | Pair cooldown (`observedPipelinePairTimestamps`) |
|---|---|---|
| **`execution_audit.jsonl` seed** | Yes — all `EXECUTION_STAGE` rows with `stage: PIPELINE_DRY_RUN` | Yes — `markObservedPair()` called during seed using audit row timestamp |
| **In-memory only (lost on restart)** | Until first seed runs | Same |
| **`pipeline_candidates.jsonl`** | No — queue is input, not dedup state | No |
| **`paper_trades.json`** | No — open-paper pool only | No |

**Seeding trigger:** `seedObservedPipelineCandidatesFromAudit()` runs lazily on first `findPipelineObservationCandidates()` call (not at module load). It reads the **full** audit file via `readJsonl()`.

**Audit row filter for seed:**

- `eventType === "EXECUTION_STAGE"`
- `stage === "PIPELINE_DRY_RUN"`
- valid `payload`
- skip rows with `_parseError`

**Payload fields used:** `candidateIntentId`, `address`, `pairAddress`, audit `timestamp` (for pair cooldown ms).

Both successful observations and **aborted** observations (`observationAborted: true`) write `PIPELINE_DRY_RUN` audit rows — both are seeded correctly.

### 2.5 What is memory-only and why restart gaps exist

| Gap | Mechanism | Impact |
|---|---|---|
| **Crash window before audit write** | `observePipelineCandidate()` marks memory **before** `submitSwap()` and audit append on success path (lines 1365–1428) | Restart: audit lacks row → seed misses → **duplicate pipeline observation** |
| **Lazy seed timing** | Seed runs on first candidate selection, not at process start | Low risk in single-process loop; confusing if operator inspects mid-startup |
| **Parse-error audit lines** | `readJsonl()` returns `{ _parseError: true }`; seed skips | Partial seed if audit corrupted |
| **No snapshot file** | Pair map rebuilt only from audit replay | Depends on audit completeness; large audit scans on every cold start |
| **Concurrent processes** | No file lock on dedup state | Two executor loops could race (pre-A1; document, do not fix in M3) |

**KNOWN_ISSUES.md** and **DECISIONS.md** both state: intent dedup is restart-safe when audit is complete; pair cooldown timestamps are **partially** in-memory. In practice, audit seeding **does** rebuild pair timestamps — the documented gap is primarily the **success-path crash window** and lack of a durable operational cache.

### 2.6 Existing test coverage

| Test | Dedup coverage |
|---|---|
| `test_pipeline_candidate_handoff.js` | Intent dedupe; audit replay suppresses stale queue; legacy pair fallback; 60-minute pair cooldown with new intent id; expired cooldown allows re-observe |
| `test_observation_pool.js` | In-process duplicate skip; audit rows for thesis/non-thesis observations |
| **Missing** | Simulated restart: clear memory → re-seed from persisted state → verify no duplicate submit |

### 2.7 Runtime files (inspected roles)

| File | Role in dedup |
|---|---|
| `execution_audit.jsonl` | Append-only history; current primary restart seed source |
| `pipeline_candidates.jsonl` | Handoff queue with `candidateIntentId`; not dedup state |
| `paper_trades.json` | Open-paper observation pool; not dedup state |
| `observation_dedup.json` | **Does not exist today** — proposed M3 snapshot |

---

## 3. Minimum Safe Implementation

### 3.1 Recommended approach: audit seed + small snapshot (hybrid)

SPRINT_2 allows either a snapshot **or** full audit derivation. Audit derivation already exists but does not close the crash window. **Minimum safe M3 = hybrid:**

1. Add runtime file **`observation_dedup.json`** at repo root (local-only, gitignored).
2. **On startup seed:** merge audit replay + snapshot (union, never subtract).
3. **On dedup mutation:** persist snapshot synchronously after memory update.

This preserves append-only audit philosophy (no audit rewrites), avoids a database, and closes the crash window without reordering submit/audit semantics.

### 3.2 Snapshot schema (version 1)

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-06-22T12:00:00.000Z",
  "observedKeys": [
    "intent|2026-06-20T15:15:26.610Z_2o3VGR…_5C6TDb…"
  ],
  "pairLastObservedMs": {
    "address_pair|2o3VGR…|5C6TDb…": 1718896526610
  }
}
```

| Field | Content |
|---|---|
| `observedKeys` | Serialized `observedPipelineCandidates` Set (intent + legacy pair keys) |
| `pairLastObservedMs` | Serialized `observedPipelinePairTimestamps` Map |
| `schemaVersion` | Forward compatibility |
| `updatedAt` | Operator/debug visibility |

**Do not store:** candidate payloads, thesis fields, or queue contents — dedup keys only.

### 3.3 Code changes (`live_executor.js` only)

**Add:**

| Function | Behavior |
|---|---|
| `OBSERVATION_DEDUP_FILE` | `path.join(ROOT, "observation_dedup.json")` |
| `loadObservationDedupSnapshot()` | Parse JSON; tolerate missing/corrupt file → empty state |
| `mergeObservationDedupState(snapshot, auditSeeded)` | Union `observedKeys`; per pair key `max()` timestamps |
| `persistObservationDedupSnapshot()` | `writeFileSync` current in-memory Set/Map; never throw into observe path (try/catch + optional `logError`) |

**Modify:**

| Function | Change |
|---|---|
| `seedObservedPipelineCandidatesFromAudit()` | After audit loop: load snapshot → merge into memory structures |
| `observePipelineCandidate()` | After memory mark (line ~1366) **and** after abort audit write: call `persistObservationDedupSnapshot()` |
| `module.exports.FILES` | Export `OBSERVATION_DEDUP_FILE` for tests |
| `__observationPoolTest` | Hooks to set/read snapshot path in temp dir; simulate restart |

**Do not modify:**

- `PIPELINE_OBSERVATION_PAIR_COOLDOWN_MS`
- `candidateIntentKey` / `candidatePairKey` / `candidateIntentId` format
- `findPipelineObservationCandidates()` filter logic (intent → legacy pair → cooldown order)
- `observePipelineCandidate()` guard conditions
- `submitSwap()` / pipeline stages / thesis classification
- Scanner files
- Archive folders

**Optional (low cost, recommended):** call `seedObservedPipelineCandidatesFromAudit()` once at start of `runCycle()` when mode is `PIPELINE_DRY_RUN`, so dedup is warm before selection. Behavior-equivalent to today’s lazy seed; improves operator predictability.

### 3.4 `.gitignore` + docs touch

| File | Change |
|---|---|
| `.gitignore` | Add `observation_dedup.json` (runtime operational data, Q10 policy) |
| `docs/KNOWN_ISSUES.md` | Mark in-memory dedup issue partially/fully resolved per shipped behavior |
| `ACTIVE_MANIFEST.md` or `ENGINEERING_REVIEW.md` | One-line entry for new runtime file (optional, if manifest lists runtime files) |

No dashboard changes required for M3 (M4/M8 may surface dedup stats later).

### 3.5 Test extensions

**Prefer extending `test_observation_pool.js`** (restart simulation fits observation pool tests). Add temp-dir snapshot file via test hooks.

| Case | Steps | Expected |
|---|---|---|
| **Restart after observe** | Observe candidate → persist snapshot → reset in-memory dedup → re-seed → attempt duplicate observe | `OBSERVATION_SKIPPED_DUPLICATE`; submit count unchanged |
| **Crash window simulation** | Mark dedup + persist snapshot **without** audit row → reset memory → re-seed from snapshot only | Duplicate blocked (proves snapshot closes gap) |
| **Audit + snapshot merge** | Snapshot has pair ts T1; audit row has T2 > T1 → merge | Cooldown uses T2 |
| **Cooldown preserved across restart** | Observe pair at T0; new intent at T0+30m → blocked; reset memory; re-seed | Still blocked |
| **Expired cooldown preserved** | Observe at T0; new intent at T0+61m → allowed before restart; after restart re-seed | Still allowed |
| **Protected files unchanged** | Existing hash guards | No mutation of `live_trades.jsonl`, positions, etc. |

Keep existing handoff tests green — they already validate audit replay; no breaking changes to field lists.

### 3.6 What M3 explicitly does NOT do

| Out of scope | Belongs to |
|---|---|
| Atomic rename / file locks | A1 unified state (Sprint 4) |
| Multi-process dedup coordination | A1 / A2 |
| Rewriting or truncating `execution_audit.jsonl` | Never |
| Changing 60-minute cooldown | DECISIONS.md — frozen for M3 |
| Changing intent id format | Scanner + executor contract |
| Persisting in-cycle `seen`/`seenPairs` | Single-cycle only; unnecessary |
| Scanner 24h re-entry cooldown | Scanner scope |
| LIVE trading dedup | Already file-backed |
| Dashboard dedup metrics panel | M4 / future |
| Blocking automation when dedup file corrupt | A6 / ops runbook |

---

## 4. Boundaries: M3 vs A1 Unified State

| Concern | M3 (Sprint 2) | A1 (Sprint 4) |
|---|---|---|
| **Writer** | Executor only | Single state module; all processes |
| **Write pattern** | Best-effort `writeFileSync` snapshot | Temp-file rename, advisory locks |
| **Readers** | Executor only | Scanner, monitor, dashboard, executor |
| **Dedup source of truth** | Audit history + operational snapshot merge | Unified store with audit as event log |
| **Crash safety** | Good enough for observation dedup | Capital-safe config/ledger writes |
| **Corrupt file handling** | Log error; fall back to audit seed | Defined recovery / quarantine |
| **Cross-process races** | Documented limitation | Eliminated |

**M3 rule:** If implementation starts needing locked multi-writer semantics or shared mutation of `paper_trades.json` / `live_config.json`, **stop** — that is A1.

---

## 5. Risks

| Risk | Level | Mitigation |
|---|---|---|
| **Snapshot/audit divergence** | Medium | Merge = union + max timestamps; audit never truncated; snapshot is cache not authority |
| **Snapshot write race (two executors)** | Medium | Document single executor loop; A1 fixes properly; optional `updatedAt` sanity check |
| **Corrupt `observation_dedup.json`** | Low | Try/catch load → empty; audit seed still runs; log to `live_errors.jsonl` |
| **Over-aggressive persist blocks valid re-observe** | Low | Do not persist keys beyond existing memory rules; cooldown math unchanged |
| **Large `observedKeys` array over time** | Low | Keys are bounded by observation count; prune policy deferred (audit is canonical history) |
| **Test flakiness on timestamps** | Low | Use fixed ISO timestamps in fixtures (handoff test pattern) |
| **Scope creep into submit reorder** | Medium | Do not reorder submit vs audit unless snapshot persist is insufficient — snapshot is sufficient |
| **CI regression** | Medium | Extend `test_observation_pool.js`; keep 4/4 safety suite green |

---

## 6. Acceptance Criteria

| ID | Criterion | Verification |
|---|---|---|
| AC1 | `observation_dedup.json` written after observation dedup mutation | Inspect file after test observe |
| AC2 | Executor restart (simulated memory clear + re-seed) skips duplicate observation for same intent | New restart test |
| AC3 | Pair cooldown survives restart within 60-minute window | Restart test with new intent id |
| AC4 | Expired cooldown (>60 min) still allows observation after restart | Restart test |
| AC5 | Audit seed + snapshot merge uses max pair timestamp | Unit test with T1/T2 fixtures |
| AC6 | Crash-window case: snapshot without audit row still blocks duplicate | Dedicated test case |
| AC7 | `PIPELINE_OBSERVATION_PAIR_COOLDOWN_MS` unchanged (3600000) | Code review |
| AC8 | Intent key format unchanged (`intent\|…`, `address_pair\|…`) | Code review |
| AC9 | `candidateIntentId` scanner format unchanged | `git diff scanner_gmgn_trending.js` empty |
| AC10 | `node live_executor.js --status` → `PIPELINE_DRY_RUN`, `liveArmed: false` | Smoke |
| AC11 | `node run_safety_tests.js` → 4/4 pass | CI smoke |
| AC12 | `node --check live_executor.js` pass | Syntax |
| AC13 | `observation_dedup.json` gitignored | `.gitignore` review |
| AC14 | `live_executor.js` execution/submit behavior unchanged aside from persist hooks | Diff review |
| AC15 | KNOWN_ISSUES updated for dedup persistence progress | Doc review |

---

## 7. Verification Steps (Post-Implementation)

1. `node --check live_executor.js`
2. `node run_safety_tests.js` → 4/4
3. `node live_executor.js --status` → `PIPELINE_DRY_RUN`, `liveArmed: false`
4. Run new restart simulation test case in isolation
5. Manual: observe one candidate → confirm `observation_dedup.json` created → kill executor → restart loop → confirm no second audit row for same `candidateIntentId` within same cooldown window
6. `git diff live_executor.js` — only dedup load/merge/persist + test hooks; no changes to `submitSwap`, thesis, or mode resolution
7. `git diff scanner_gmgn_trending.js` — empty
8. Confirm `observation_dedup.json` not staged for commit

---

## 8. Implementation Order

```text
1. Add OBSERVATION_DEDUP_FILE + load/merge/persist helpers (live_executor.js)
2. Wire merge into seedObservedPipelineCandidatesFromAudit()
3. Wire persist into observePipelineCandidate() (after memory mark + after abort audit)
4. Export file path + test hooks on __observationPoolTest
5. Extend test_observation_pool.js (restart + crash-window cases)
6. .gitignore + KNOWN_ISSUES.md
7. Verification + commit
```

Estimated diff: **~80–120 lines** in `live_executor.js`, **~40–60 lines** in `test_observation_pool.js`, **~3 lines** in `.gitignore`, **~5 lines** in `KNOWN_ISSUES.md`.

---

## 9. Operator / Ori Notes (Post-M3)

After M3 ships, Ori check-in question #6 from SPRINT_2_PLAN should expect:

- **No duplicate pipeline observations** for the same `candidateIntentId` after executor restart.
- **`observation_dedup.json`** present locally when executor loop has run; safe to delete only if operator accepts re-seed from audit alone (may duplicate if audit incomplete).
- **Still run one executor loop** — M3 does not fix dual-process races.

---

## 10. Open Question (Optional Before Implementation)

Should `node live_executor.js --status` expose dedup seed counts (`observedKeys` size, pair map size, snapshot `updatedAt`)? **Recommendation:** defer — keeps M3 minimal; M4 scanner health / ops visibility can add later if useful.

---

*Sprint 2 M3 · Observation dedup persistence · TracktaOS Module 1 · Planning only*
