# R14 Slippage/MEV Implementation Planning — 2026-07-05

Status:
**Planning complete — no code changes, no config changes, no runtime processes started**

Gate type:
Doc-only implementation design for R14 enforcement code paths (closes the "spec" portion of authorization sequence Step 3 / LR-06; implementation itself still requires a separate authorized apply gate)

Prerequisites:
`R14 CONFIG HARMONIZATION PLANNING — 2026-07-05.md` · `R14 POLICY DECISION SESSION — 2026-07-05.md` · `R14 SLIPPAGE MEV POLICY REVIEW — 2026-07-05.md`

Decision authority:
**Taylor Cheaney** must authorize before any of this spec is implemented in `live_executor.js`

Session tool:
Claude/Cowork (this planning note is not a Cursor-run entry; logged separately in Cursor Run Log for provenance)

Live readiness achieved:
**No**

Human soak readiness:
**Not authorized**

OR-20260630-008:
**not_promoted** (unchanged)

**Code changed:** **No** · **Config changed:** **No** · **Runtime processes started:** **No**

---

## 1. Files Inspected (read-only)

| File | Purpose |
|------|---------|
| `live_executor.js` (lines 74–99, 581–730, 1150–1170, 2041–2230, 2560–2630, 2740–2750, 3300–3320) | Existing quote/route/fee/retry/slippage code — grounds this spec in real function names and line numbers, not invented ones |
| `live_config.json` | Confirms which R14 fields exist today vs. missing |
| `R14 CONFIG HARMONIZATION PLANNING — 2026-07-05.md` | §6 Implementation-required list (E1–E9 source) |
| `test_jupiter_quote_validation.js`, `test_priority_fee.js`, `test_tx_build.js` | Existing test coverage to extend, not replace |
| `docs/R14_SLIPPAGE_MEV_PROTECTION_REVIEW.md` | Canonical draft policy reference |

---

## 2. Purpose

Turn the nine implementation-required R14 items (E1–E9, from the Config Harmonization gate) into a **function-level spec**: exact location, inputs/outputs, new abort codes, and config keys each requirement needs. This is the missing piece the harmonization gate explicitly flagged — *"config harmonization alone does not close LR-06."*

This gate still **does not write code**. It exists so that when Taylor authorizes an implementation gate, there is a precise diff to review rather than an open-ended coding task against a live-trading execution path.

---

## 3. Current Code Reality (Grounding)

Reading `live_executor.js` directly, rather than assuming from the policy docs:

| Requirement | Exists today? | Evidence |
|---|---|---|
| Mint match check | **Yes** | `validateJupiterRoute()` L640–647 — throws `MINT_MISMATCH` |
| Price-impact hard reject | **Yes, but wrong threshold** | L659 checks `priceImpactPct > cfg.maxRoutePriceImpactPct`; config value is **10%**, R14 policy says **2%** — this is a config-harmonization fix, not new code |
| Slippage cap check | **Yes, but wrong threshold** | L651/L666 checks vs `maxEntrySlippagePct`/`maxExitSlippagePct`; config is **3%/5%**, R14 policy says **1% default / 2% manual** — same, config fix not new code |
| Quote age / freshness | **No** | `getJupiterQuote()` (L581–638) does not timestamp the quote or check age anywhere before submit |
| Route-change-since-quote detection | **No** | No code compares the quote used for tx-build against a re-fetched quote at submit time |
| Retry with re-quote | **Partially — wrong layer** | L2150 has a 3-attempt loop, but it retries **fill/confirmation status checks** on an already-submitted tx, not **quote/submit retries**. `maxSubmitRetries` (config field) is listed only as an "IMPORTANT" field name at L1164 and is **never read/consumed** anywhere else in the file — the config key exists but does nothing today |
| Realized-slippage post-fill check | **No** | No comparison of quoted vs. actual fill price found |
| Partial-fill detection/abort | **No** | No explicit partial-fill branch found in the fill-parsing path |
| Priority-fee-vs-trade-size cap (50% rule) | **No** | `resolvePriorityFee()` (L685+) enforces `maxPriorityFeeLamports` as an absolute cap only; no comparison to trade notional |
| Liquidity floor at submit time | **No** | Liquidity is checked at **candidate-selection** time in `scanner_gmgn_trending.js` (`MIN_LIQUIDITY`/`MIN_POOL_LIQUIDITY = 25000`), not re-checked at execution time in `live_executor.js` |

**Key finding:** two of the nine R14 requirements (price impact, slippage cap) are pure config-value fixes already wired into working code paths. The other seven require new logic. `maxSubmitRetries` in particular is a dead config field today — it is read as metadata but never consumed by control flow. This should be corrected as part of the same implementation gate, not left silently unused.

---

## 4. Implementation Spec (E1–E9)

Each item below names a proposed function, its insertion point, and the abort code(s) it needs. None of this is written yet.

| # | Requirement | Proposed function / change | Insertion point | New abort code(s) |
|---|---|---|---|---|
| E1 | Quote age ≤ 10s at submit | `isQuoteFresh(quote, maxAgeMs)` — stamp `quote._fetchedAtMs = Date.now()` in `getJupiterQuote()`; check immediately before tx build | New check in submit path before `validateJupiterRoute()` re-entry at submit | `QUOTE_STALE` |
| E2 | Realized slippage warn >100bps / halt >200bps | `checkRealizedSlippage(quotedOutAmount, actualOutAmount)` — compare post-fill parsed amount vs. quoted `otherAmountThreshold`/`outAmount` | After fill parse (near L2153–2224, alongside existing anomaly flags at L2628/L2743) | `REALIZED_SLIPPAGE_HALT` (session-level abort, not just log) |
| E3 | Route re-validation (mint/min-output/impact ≤2%) | Extends existing `validateJupiterRoute()` — add a **re-validate-at-submit** call using a fresh quote, not just the original quote used for tx build | Immediately before signed tx broadcast | Reuses `ROUTE_REJECTED`; add `ROUTE_CHANGED_SINCE_QUOTE` |
| E4 | Retry ≤2, no blind rebroadcast, re-quote on retry | `submitWithReQuote(cfg, mints, kind, maxRetries)` — new orchestration wrapper; on failure, discard the old quote object entirely and re-fetch via `getJupiterQuote()` before any second attempt; wire `cfg.maxSubmitRetries` into this loop for the first time | Wraps existing quote → validate → build → submit sequence (~L2300–2520) | `RETRY_LIMIT_EXCEEDED`; reuse `SUBMIT_FAILED` per attempt |
| E5 | Partial-fill → reject/abort + reconcile before next trade | `detectPartialFill(meta, expectedOutAmount)` in the fill-parse block (~L2153–2224) | Fill-parse path | `PARTIAL_FILL_UNRECONCILED` — must block next entry until manually cleared (ties into `pending_reconciliation.jsonl`, not a new file) |
| E6 | MEV route posture (public micro-live OK if caps pass; protected preferred) | `resolveMevRouteMode(cfg)` — reads new `mevRouteMode` config key; logs route mode used per trade in audit | Near `resolvePriorityFee()` call site (L2334–2335) | None (posture logging, not a hard abort) |
| E7 | Audit fields (route summary, slippage bps, impact, quote age, decision, txid) | Extend existing `logExecutionStage()` calls already present at L617–627 and L674–681 — add `quoteAgeMs`, `realizedSlippageBps`, `mevRouteMode` fields | Existing audit call sites (no new writer — `execution_audit.jsonl` single-writer contract unchanged) | N/A |
| E8 | Priority fee ≤50% of trade notional | `capPriorityFeeToTradeSize(feeLamports, tradeSizeSol)` | Inside `resolvePriorityFee()` near existing `maxPriorityFeeLamports` check (L878) | `PRIORITY_FEE_EXCEEDS_TRADE_SIZE` |
| E9 | Liquidity floor at submit time (once numeric value decided) | `checkExecutionTimeLiquidity(candidate, minPoolLiquidityUsd)` — re-reads liquidity at execution time, not just at scan time | Early in entry pipeline, before quote request | `LIQUIDITY_BELOW_FLOOR` — **blocked until `minPoolLiquidityUsd` numeric value is decided** (see companion doc, `LIQUIDITY DEPTH THRESHOLD DECISION — 2026-07-05.md`) |

---

## 5. New `EXECUTION_ABORT_CODES` Entries (Proposed — Not Added)

To be added to the existing frozen enum at L74–93, preserving all current codes:

```
QUOTE_STALE
ROUTE_CHANGED_SINCE_QUOTE
REALIZED_SLIPPAGE_HALT
RETRY_LIMIT_EXCEEDED
PARTIAL_FILL_UNRECONCILED
PRIORITY_FEE_EXCEEDS_TRADE_SIZE
LIQUIDITY_BELOW_FLOOR
```

`EXPECTED_OBSERVATION_ABORT_CODES` (L94–99) should **not** include these — they are live-submit-path codes, not dry-run observation codes, and must not be misclassified as expected/benign in observation-mode telemetry.

---

## 6. Sequencing Recommendation

Not all nine items carry equal risk if skipped. Suggested implementation order for a future authorized gate, most safety-critical first:

1. **E4 (retry/re-quote)** — currently a dead config field; highest risk of silent wrong-behavior if left as-is once live
2. **E1 (quote age)** + **E3 (route re-validation)** — same failure mode (stale/changed route), best implemented together
3. **E9 (liquidity floor)** — blocked on the numeric-value decision; spec is ready the moment that decision lands
4. **E2 (realized slippage) + E5 (partial fill)** — post-fill safety net
5. **E8 (priority fee cap)** — narrower blast radius (fee overpay, not fund loss)
6. **E6 (MEV posture) + E7 (audit fields)** — lowest risk; mostly logging/config plumbing

---

## 7. Test Plan Additions (Future Gate)

| New/extended test file | Covers |
|---|---|
| `test_jupiter_quote_validation.js` | Extend for quote-age stamping, route-change detection |
| New: `test_submit_retry_requote.js` | E4 retry/re-quote orchestration, no-blind-rebroadcast guarantee |
| New: `test_realized_slippage_check.js` | E2 warn/halt thresholds |
| New: `test_partial_fill_detection.js` | E5 reject/reconcile gate |
| `test_priority_fee.js` | Extend for E8 50%-of-trade-size cap |
| New: `test_execution_time_liquidity_floor.js` | E9, once numeric value is set |

Existing `run_safety_tests.js` full-suite pattern (green before/after) applies to every one of these at implementation time, per this project's established convention.

---

## 8. Explicit Non-Actions

| Non-action | Confirmed |
|---|---|
| Modify `live_executor.js` | **No** |
| Modify `live_config.json` | **No** |
| Add abort codes to the live enum | **No — proposed only** |
| Start runtime / loops | **No** |
| Capital exposure / arming | **No** |
| Decide the liquidity numeric floor | **No — separate companion doc** |
| Claim live readiness | **No** |

---

## 9. Recommended Next Gate

**R14 Implementation Authorization** (Taylor reviews this spec + the companion liquidity-threshold decision, then explicitly authorizes implementation of E1–E9 in a single reviewed diff, with `run_safety_tests.js` green before and after).

---

## 10. Safety Confirmation

| Item | Value |
|---|---|
| `.env` opened | **No** |
| Secrets inspected | **No** |
| Code changed | **No** |
| Config changed | **No** |
| Runtime processes started | **No** |
| OR-20260630-008 status | **not_promoted** |
| Live readiness claimed | **No** |
| Capital exposure enabled | **No** |

---

*Prepared for Taylor review — 2026-07-05 (Claude/Cowork planning session).*
