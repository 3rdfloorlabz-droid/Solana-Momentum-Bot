# M1 + M2 — Thesis Visibility Plan

**Sprint:** 2 — Honest Measurement  
**Tasks:** M1 (thesisMatch on handoff rows) + M2 (dashboard thesis-segmented stats)  
**Status:** Planning only — no code changes until this document is reviewed  
**Constraint:** `PIPELINE_DRY_RUN` throughout. No filter changes. No strategy changes. No archive edits.

---

## 1. Goal

Operators and Ori can answer "what would live have taken?" by reading the dashboard without opening raw JSONL files. Research-wide paper stats are clearly separated from thesis-eligible observations. The distinction is anchored to the executor's authoritative thesis rules, not dashboard heuristics.

---

## 2. Current State (Inspected)

### 2.1 Scanner handoff rows carry no thesis tag

`scanner_gmgn_trending.js` → `buildPaperTradeRecord()` → `buildPipelineCandidateIntent()`.

Both output records contain all the raw fields needed to evaluate thesis eligibility (`score`, `marketCap`, `botDegenRate`, `top10HolderRate`, `liquidity`, `pairAddress`, `entryPrice`) — but neither function computes or persists a `thesisMatch` boolean.

**Current `pipeline_candidates.jsonl` row keys** (confirmed from live file):  
`timestamp, source, strategyVersion, monitorVersion, symbol, name, address, pairAddress, score, liquidity, marketCap, poolLiquidity, holderCount, top10HolderRate, botDegenRate, bundlerRate, volume5m, volume1h, buys5m, sells5m, entryPrice, targetPrice, stopPrice, chart, candidateIntentId`

No `thesisMatch`, no `sourcePool`. Same structure applies to `paper_trades.json` rows (JSONL format).

### 2.2 Executor has authoritative thesis logic — not exposed in files

`live_executor.js` line 1105 — `matchesPhase1Thesis(trade, cfg)`:

| Criterion | Executor bound | Source |
|---|---|---|
| score | 80–89 | `cfg.thesis.scoreMin/Max` defaults |
| marketCap | 100 000–250 000 | `cfg.thesis.marketCapMin/Max` defaults |
| botDegenRate | < 0.05 | `cfg.thesis.botDegenRateMax` default |
| top10HolderRate | 0.10–0.20 | `cfg.thesis.top10HolderRateMin/Max` defaults |
| source | `gmgn_trending` | `cfg.thesis.source` default |
| pairAddress | must be present | hard check |
| entryPrice | must be > 0 | hard check |
| liquidity | must be > 0 | hard check |

`classifyCandidate()` at line 1268 wraps this and writes `thesisMatch` + `sourcePool` into the _runtime_ classification, which flows into `observePipelineCandidate()` and into the audit log row (`execution_audit.jsonl`). **These are computed at runtime — not persisted back to scanner-written files.**

### 2.3 Dashboard has its own thesis function — bounds are different

`dashboard_server.js` line 442 — `matchesThesis(trade)`:

| Criterion | Dashboard bound | Executor bound | Gap |
|---|---|---|---|
| score | 80–89 | 80–89 | — |
| marketCap | 100 000–250 000 | 100 000–250 000 | — |
| botDegenRate | < 0.10 | < 0.05 | **Dashboard is twice as permissive** |
| top10HolderRate | 0.10–0.30 | 0.10–0.20 | **Dashboard allows wider top10** |
| source check | no | yes | Dashboard does not check source |
| pairAddress check | no | yes | Dashboard does not require pairAddress |
| entryPrice check | no | yes | Dashboard does not require entryPrice |
| liquidity check | no | yes | Dashboard does not require liquidity |

`thesisPanel()` (line 743) and `researchScorecard()` use the dashboard's `matchesThesis()` — meaning thesis-eligible counts shown today are **inflated** relative to what the executor's strict gate would approve.

### 2.4 Existing dashboard thesis panels

`thesisPanel()` — already present; splits paper trades into thesis-matching vs non-matching. Uses dashboard's own `matchesThesis()`. Shows win rate, counts, failure reasons per criterion. **Does not warn about the executor/dashboard bound difference.**

`researchScorecard()` — research overview, uses `forwardTrades` (all current-version paper trades).

`phase1ReadinessPanel()` — M7 liveArmed truth. References executor's `computeLiveArmedStatus()`.

`reconciliationPanel()` — M6a read-only panel. Segmented by `sourcePool` from audit tail where available.

### 2.5 Audit log carries thesisMatch — but only for post-M7 observations

`execution_audit.jsonl` rows with `stage: PIPELINE_DRY_RUN` carry `thesisMatch` and `sourcePool` (written by `observePipelineCandidate()`). `countRecentPipelineObservations()` reads these but counts all DRY_RUN events without segmenting by `thesisMatch`.

### 2.6 Scanner filter thresholds are intentionally wider (two-layer design)

| Threshold | Scanner | Executor |
|---|---|---|
| MIN_SCORE_TO_LOG | 79 | 80 |
| MAX_MARKET_CAP | $2 500 000 | $250 000 |
| MAX_BOT_DEGEN_RATE | 0.10 | 0.05 |
| MAX_TOP10_HOLDER_RATE | 0.30 | 0.20 |

This is by design — DECISIONS.md two-layer filter. **M1 does not change scanner filter thresholds.** M1 adds a tag. The tag answers: "of all the candidates the scanner admitted, how many would the executor's strict gate have approved?"

### 2.7 Test coverage

`test_pipeline_candidate_handoff.js` (line 94–101) asserts required fields on handoff rows. It **does not currently assert `thesisMatch`**. The test uses a candidate with score 82, MC 175k, botDegenRate 0.03, top10 0.15 — which does satisfy executor thesis bounds (would produce `thesisMatch: true`).

---

## 3. Minimum Safe Implementation

### M1 — Persist `thesisMatch` on scanner handoff rows

**What:** Add `thesisMatch: boolean` (and `thesisFailureReasons: string[]` optionally) to `buildPaperTradeRecord()` and `buildPipelineCandidateIntent()` in `scanner_gmgn_trending.js`.

**How:**

1. Add a small inline helper `computeScannerThesisMatch(c)` in `scanner_gmgn_trending.js` using the same bounds as the executor's `matchesPhase1Thesis()`. Add a comment citing the executor function and the need to keep bounds in sync.

   ```js
   // Thesis bounds must match matchesPhase1Thesis() in live_executor.js.
   // If executor thesis config changes, update here and re-test.
   function computeScannerThesisMatch(c) {
     const reasons = [];
     if (!(Number(c.score) >= 80 && Number(c.score) <= 89)) reasons.push("score outside 80-89");
     if (!(Number(c.marketCap) >= 100000 && Number(c.marketCap) <= 250000)) reasons.push("marketCap outside 100k-250k");
     if (!(Number(c.botDegenRate) < 0.05)) reasons.push("botDegenRate >= 0.05");
     if (!(Number(c.top10HolderRate) >= 0.10 && Number(c.top10HolderRate) <= 0.20)) reasons.push("top10 outside 0.10-0.20");
     if (!(Number.isFinite(Number(c.liquidity)) && Number(c.liquidity) > 0)) reasons.push("liquidity missing");
     if (!c.pairAddress) reasons.push("pairAddress missing");
     const entryPrice = Number(c.priceUsd || 0);
     if (!(Number.isFinite(entryPrice) && entryPrice > 0)) reasons.push("entry price missing");
     return { thesisMatch: reasons.length === 0, thesisFailureReasons: reasons };
   }
   ```

   Note: `source` is always `"gmgn_trending"` in the scanner — it is implicitly satisfied and does not need an explicit check.

2. Call `computeScannerThesisMatch(c)` inside `buildPaperTradeRecord()` and spread the two fields onto the returned object.

3. `buildPipelineCandidateIntent()` calls `buildPaperTradeRecord()` and drops `status`. The new fields will propagate automatically — no additional change needed there.

**What does NOT change:**
- Scanner filter thresholds (`MIN_SCORE_TO_LOG`, `MAX_MARKET_CAP`, etc.) — untouched
- `logPaperTrade()` flow — untouched
- `live_executor.js` — untouched
- Executor's `classifyCandidate()` and `matchesPhase1Thesis()` — untouched
- Strategy, exits, PIPELINE_DRY_RUN logic — untouched

**Test update (`test_pipeline_candidate_handoff.js`):**

Extend the field presence assertion (line 94–101) to include `thesisMatch`. Also assert:
- The default `scannerCandidate()` fixture (score 82, MC 175k, botDegenRate 0.03, top10 0.15, liquidity 55000, pairAddress present, priceUsd 0.0002) yields `thesisMatch: true`.
- A candidate with botDegenRate 0.08 yields `thesisMatch: false`.

The test does not affect `npm test` green status — it extends existing coverage without changing behavior.

---

### M2 — Dashboard thesis-segmented stats

**What:** Dashboard displays paper and observation pools segmented by `thesisMatch`. Default view leads with thesis-eligible signal, not aggregate paper totals.

**How — two additive changes to `dashboard_server.js`:**

#### M2-A: Update `matchesThesis()` to prefer persisted field

Change `matchesThesis()` to check `trade.thesisMatch` if the field is present:

```js
function matchesThesis(trade) {
  // Prefer persisted thesisMatch (written by scanner from M1 onwards).
  // Fall back to local recomputation for historical rows without the field.
  if (typeof trade.thesisMatch === "boolean") return trade.thesisMatch;
  return thesisFailureReasons(trade).length === 0;
}
```

This change is backward-compatible:
- Old paper rows (no `thesisMatch` field): dashboard recomputes using existing `thesisFailureReasons()` — same behavior as today.
- New rows (with `thesisMatch: true/false`): uses the persisted executor-bound value — more accurate.
- `thesisPanel()` and `researchScorecard()` automatically benefit with no additional changes.

**No change to `thesisFailureReasons()`** — it stays as the fallback for old rows.

#### M2-B: Add thesis segment summary to `thesisPanel()` or as a separate new function

Add a clearly labeled thesis-segmentation summary at or near the top of `thesisPanel()`:

```
ALL PAPER (current version)     N trades
THESIS-ELIGIBLE (M1 tag or recomputed)  N trades
NON-THESIS (wide scanner, not executor-eligible)  N trades
```

With per-segment stats: open count, closed count, win rate, summed PnL.

Add a note to the panel subtitle explaining:
- "Thesis-eligible uses persisted `thesisMatch` field where available (from M1). For older rows without the field, the dashboard recomputes using its local bounds (botDegenRate < 10%, top10 10–30%), which are wider than executor's strict gate (botDegenRate < 5%, top10 10–20%). Pre-M1 thesis-eligible counts may be slightly inflated."

#### M2-C: Segment pipeline observations in `countRecentPipelineObservations()`

Extend the return value to include `thesisCount` and `nonThesisCount` (counting rows where `payload.thesisMatch === true` vs `false`). Expose this in the reconciliation panel truth card and/or a new pipeline observation segment card.

This is a display-only read — no writes.

**Placement in `renderDashboard()`:**  
No order changes needed. `thesisPanel()` is already called. `countRecentPipelineObservations()` is already called. Changes are additive within existing call sites.

---

## 4. Files Changed

| File | Change | Scope |
|---|---|---|
| `scanner_gmgn_trending.js` | Add `computeScannerThesisMatch()`, call in `buildPaperTradeRecord()` | +~20 lines, additive only |
| `dashboard_server.js` | Update `matchesThesis()` to prefer persisted field; update `thesisPanel()` subtitle + segment summary; extend `countRecentPipelineObservations()` return | +~40 lines, display only |
| `test_pipeline_candidate_handoff.js` | Assert `thesisMatch` in field list; add thesis-match / thesis-fail fixture assertions | +~15 lines |
| `docs/KNOWN_ISSUES.md` | Mark "thesis drift" as partially resolved (M1+M2) | +3–5 lines |

**Not touched:**
- `live_executor.js`
- Strategy, exits, PIPELINE_DRY_RUN logic
- Archive folders (`automation/`, `hardreset/`, etc.)
- Scanner filter thresholds
- Other scanner files (`scanner.js`, `scanner_v3.js`, `scanner_trending.js`)

---

## 5. Thesis Bound Divergence — Documented

After M1, the dashboard will display:
- **Persisted `thesisMatch`** (authoritative, executor-matching bounds) for all new rows
- **Locally recomputed thesis** (wider dashboard bounds) for historical rows without the field

This asymmetry is acceptable and documented. Operators must not cite historical thesis-eligible counts as executor-equivalent until the paper history accumulates enough M1-tagged rows to dominate. Ori should ask about the M1 tag age spread at Sprint 2 check-ins.

A future sprint (Sprint 3 or 4) can unify the dashboard bounds to exactly match executor defaults, or expose executor's `matchesPhase1Thesis()` via a shared module. **This is not in scope for M1+M2.**

---

## 6. Risks

| Risk | Level | Mitigation |
|---|---|---|
| **Thesis bound copy drift** — `computeScannerThesisMatch()` diverges from executor over time | Medium | Prominent comment citing `live_executor.js` + test assertions for both the match and fail cases |
| **`thesisMatch: false` on old paper rows** — some rows parsed without pairAddress or liquidity that executor would also reject | Low | Expected; dashboard notes historical fallback; no retroactive writes |
| **Test regression on handoff** — adding field assertion breaks the test for old API | None | Test uses `scannerCandidate()` fixture which will correctly produce `thesisMatch: true` after M1 |
| **Dashboard bound confusion** — operator reads thesis stats and thinks all historical thesis-eligible rows passed executor gate | Medium | Panel subtitle explicitly warns about pre-M1 bounds; new rows are unambiguous |
| **`thesisFailureReasons` field in files** — optional addition may confuse parsers | Low | Arrays of strings are valid JSON; no existing parser breaks on unknown fields; can omit if desired |
| **Scope creep into filter merge** | High | Explicitly blocked: scanner thresholds unchanged; M1 only adds a tag |
| **Shared module creation** — adding `thesis_helper.js` introduces import coupling | Medium | Plan recommends inline helper in scanner to avoid this; shared module deferred to Sprint 3+ |

---

## 7. Acceptance Criteria

| ID | Criterion | Verification |
|---|---|---|
| AC1 | New `pipeline_candidates.jsonl` rows contain `thesisMatch: true/false` | Run scanner once; inspect last row in file |
| AC2 | New `paper_trades.json` rows contain `thesisMatch: true/false` | Same scan run; inspect paper row |
| AC3 | A candidate with score 82, MC 175k, botDegenRate 0.03, top10 0.15 produces `thesisMatch: true` | `test_pipeline_candidate_handoff.js` asserts this |
| AC4 | A candidate with botDegenRate 0.08 produces `thesisMatch: false` | New fixture in handoff test |
| AC5 | Dashboard `thesisPanel()` shows "Thesis-eligible" and "Non-thesis" segments | Visual dashboard review |
| AC6 | Dashboard uses persisted `thesisMatch` for new rows, falls back for old rows | Inspect with a mix of old + new rows |
| AC7 | Panel subtitle explains the historical bound difference | Visual dashboard review |
| AC8 | Pipeline observation count in audit tail is segmented by `thesisMatch` | Dashboard display check |
| AC9 | `node live_executor.js --status` shows `PIPELINE_DRY_RUN`, liveArmed false | Post-change smoke test |
| AC10 | `node run_safety_tests.js` → 4/4 pass | CI smoke |
| AC11 | `node --check dashboard_server.js` and `node --check scanner_gmgn_trending.js` pass | Syntax check |
| AC12 | Scanner filter thresholds unchanged | `git diff scanner_gmgn_trending.js` — only `buildPaperTradeRecord` and the new helper are different |
| AC13 | `live_executor.js` unchanged | `git diff live_executor.js` → empty |

---

## 8. Verification Steps (Post-Implementation)

1. `node --check scanner_gmgn_trending.js`
2. `node --check dashboard_server.js`
3. `node live_executor.js --status` → `PIPELINE_DRY_RUN`, `liveArmed: false`
4. `node run_safety_tests.js` → 4/4
5. Inspect last row of `pipeline_candidates.jsonl` — confirm `thesisMatch` field present
6. Visual dashboard review on port 3000 — confirm thesis segment breakdown visible
7. `git diff scanner_gmgn_trending.js` — confirm only additive changes to `buildPaperTradeRecord` and a new helper function
8. `git diff live_executor.js` — confirm empty

---

## 9. Implementation Order

```
M1: scanner_gmgn_trending.js
  └─ computeScannerThesisMatch() helper (inline)
  └─ buildPaperTradeRecord() adds thesisMatch
  └─ buildPipelineCandidateIntent() inherits via buildPaperTradeRecord()

M1 test: test_pipeline_candidate_handoff.js
  └─ assert thesisMatch in field list
  └─ add thesis-fail fixture assertion

M2: dashboard_server.js
  └─ matchesThesis() prefers persisted field
  └─ thesisPanel() subtitle + segment summary
  └─ countRecentPipelineObservations() segmented by thesisMatch

docs/KNOWN_ISSUES.md
  └─ thesis drift marked partially resolved
```

Total estimated diff: +80–100 lines across 3 source files + 1 doc file. No deletions.

---

## 10. Things This Plan Does NOT Do

| Prohibited action | Why |
|---|---|
| Change scanner filter thresholds | Two-layer design preserved; DECISIONS.md |
| Create a shared `thesis_helper.js` module | Deferred; adds coupling without blocking M1+M2 |
| Update `live_executor.js` | Already has authoritative thesis logic; leave it alone |
| Align dashboard `thesisFailureReasons()` bounds to executor bounds | Breaking change for historical stats; deferred |
| Add retro-tagging of old paper rows | No writes to existing files; A1 Sprint 4 |
| Arm live trading | Forbidden in Sprint 2 |
| Change exits or strategy scoring | Sprint 4/pre-live |
| Touch archive folders | Sprint 3 M9 |

---

## 11. Questions for Operator Review Before Implementation

1. Should `thesisFailureReasons` (array of strings) be persisted alongside `thesisMatch`, or is the boolean sufficient for M1? *(The array helps explain why a candidate was non-thesis, but adds file size.)*
2. Is the "persisted first, fallback second" approach for `matchesThesis()` acceptable, given that historical panel numbers will be slightly inflated for the non-persisted rows?
3. Should the dashboard thesis segment be a new section above `thesisPanel()`, or should it replace the current panel's summary cards? *(Recommendation: integrate into existing `thesisPanel()` to avoid a new panel.)*

---

*Sprint 2 M1+M2 · Thesis visibility plan · TracktaOS Module 1 · Planning only*
