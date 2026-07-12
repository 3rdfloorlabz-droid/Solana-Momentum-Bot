# Jupiter Execution Path Remediation Planning — 2026-07-07

Status:
**Planning complete — remediation design and no-broadcast test plan documented; system remains dry/unarmed; no code/config changes in this gate**

Gate type:
Read-only investigation and planning — no implementation, arming, or execution

Prerequisites:
`ARMED-STATE NO-TRADE DISARM AND RB-G9 GATE — 2026-07-07.md` · `Sessions/SESSION — RB-G9-20260706-EV01 — 2026-07-07/RB-G9 — REVIEW.md` · candidate packet · `live_executor.js` · `r29_real_quote_observer.js` · `r43e_operator_broadcast_deps.js`

Planning date:
**2026-07-07**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**Code changed:** **No** · **Config changed:** **No** · **`.env` changed:** **No** · **System armed:** **No** · **Runtime stub created:** **No** · **Submit/broadcast invoked:** **No** · **Position/reconciliation/capital:** **none**

---

## 1. Prominent post-gate state

> **DISARMED · DRY · NO TRADE**
>
> **JUPITER REMEDIATION PLANNED — NOT IMPLEMENTED**
>
> **NO SUBMIT · NO BROADCAST · NO NEW R15 SESSION**

---

## 2. Files inspected (read-only)

| File | Purpose |
|------|---------|
| `ARMED-STATE NO-TRADE DISARM AND RB-G9 GATE — 2026-07-07.md` | U1/U2 blockers · disarm context |
| `Sessions/…/RB-G9 — REVIEW.md` | NO_TRADE_EXECUTED closure |
| `Sessions/…/CANDIDATE PACKET — …md` · `candidate_packet.json` | Prep quotes · fee estimate source |
| `live_executor.js` | Quote · build · sign · send · confirm · reconcile |
| `r29_real_quote_observer.js` | Migrated quote-only path (lite-api) |
| `r43e_operator_broadcast_deps.js` | Quote/swap URL validation · unified base pattern |
| `test_jupiter_quote_validation.js` | Quote validation tests (still assert v6 URL) |
| `test_tx_build.js` | Swap build fixtures |
| `test_r29_real_quote_observer.js` | lite-api migration tests for observer |
| `test_r43e_operator_broadcast_deps.js` | URL policy tests |
| `validate_live_system.js` | Static checks still expect v6 quote host |
| `MIGRATION_NOTES.md` · `ACTIVE_MANIFEST.md` | R29a migration note · manifest |
| `package.json` | No Jupiter SDK dependency — HTTP only |
| `live_config.json` | Priority fee caps · 0.005 SOL size |

**Endpoint reachability probe (read-only GET, 2026-07-07):**

| Endpoint | Result |
|----------|--------|
| `https://quote-api.jup.ag/v6/quote` | **Unreachable** (fetch failed) |
| `https://lite-api.jup.ag/swap/v1/quote` | **200 OK** |
| `https://api.jup.ag/swap/v1/swap` | **200 OK** (OPTIONS/POST host reachable) |

---

## 3. Current Jupiter endpoints discovered

| Location | Host / path | Role | Status |
|----------|-------------|------|--------|
| **`live_executor.js:64`** | `https://quote-api.jup.ag/v6/quote` | **Quote GET** | **Deprecated / unreachable** |
| **`live_executor.js:65`** | `https://api.jup.ag/swap/v1/swap` | **Swap build POST** | **Reachable** · different host than quote |
| **`r29_real_quote_observer.js`** | `https://lite-api.jup.ag/swap/v1` + `/quote` | Quote-only observer | **Migrated · working** |
| **`r29_real_quote_observer.js`** | `https://api.jup.ag/swap/v1` + `/quote` | Pro quote base (optional) | Documented |
| **`r43e_operator_broadcast_deps.js`** | `https://lite-api.jup.ag/swap/v1` + `/quote` · `/swap` | Isolated proof deps | **Aligned pair** |
| **`test_jupiter_quote_validation.js:113`** | Asserts URL starts with v6 constant | Test coupling | **Stale** |
| **`validate_live_system.js:363`** | Requires v6 quote string in source | Static gate | **Stale** |
| Candidate prep script (gate) | `lite-api.jup.ag/swap/v1/quote` | Research only | **Working** |

**Not used in `live_executor.js`:** `/swap-instructions` · `/execute` · `/submit` · Ultra `/order` (correct — Phase 1 single-tx policy)

**npm dependencies:** None Jupiter-specific — all HTTP via `fetch` injectors.

---

## 4. API-generation / host mismatch

**Found: Yes**

| Mismatch | Detail |
|----------|--------|
| **Quote vs build host split** | Quote: `quote-api.jup.ag/v6` · Build: `api.jup.ag/swap/v1` |
| **Generation split** | Quote path is **v6 legacy** · Build path is **Swap v1** |
| **Cross-module drift** | `r29` / `r43e` use **lite-api Swap v1** · `live_executor` quote still **v6** |
| **Schema coupling risk** | `buildSwapTx` posts `quoteResponse: quote` from v6 fetch — may not match v1 swap builder expectations even if v6 were reachable |
| **Test/manifest drift** | Tests and `validate_live_system.js` still **require** v6 string presence |

**Root cause (U1):** `live_executor.js` was never updated when R29a migrated the **observer** to lite-api; production submit path retained stale `JUPITER_QUOTE_ENDPOINT` while swap build moved to Swap v1 on a **different host**.

---

## 5. Current quote-to-swap flow map (`live_executor.js`)

```
submitSwap(kind, ctx)
  ├─ resolveExecutionMode → PIPELINE_DRY_RUN | LIVE | DRY_RUN
  ├─ LIVE: assertLivePathPreSubmit → guards + R15 stub (when armed)
  └─ executeQuotedSwapAttempt (per retry)
       ├─ checkExecutionTimeLiquidity(poolLiquidityUsd)
       ├─ resolveMevRouteMode
       ├─ resolveSwapMints(kind, tokenAddress)
       ├─ getJupiterQuote → GET quote-api.jup.ag/v6/quote  ⚠ STALE
       │    └─ sets quote._fetchedAtMs
       ├─ validateJupiterRoute (impact, slippage, mint match, hard reject)
       ├─ assertQuoteFresh (maxQuoteAgeMs default 10s)
       ├─ resolvePriorityFee (Helius getPriorityFeeEstimate via dedicated RPC)
       ├─ buildSwapTx → POST api.jup.ag/swap/v1/swap  ⚠ DIFFERENT HOST
       │    └─ body: { quoteResponse, userPublicKey, slippageBps, prioritizationFeeLamports, ... }
       │    └─ returns versioned_v0 serialized bytes + metadata
       ├─ simulateSwapTx (dedicated RPC simulateTransaction)
       └─ LIVE only: re-quote + assertRouteUnchangedSinceQuote

PIPELINE_DRY_RUN → buildPipelineDryRunResult (no sign/send)
LIVE → completeLiveSwapFromPipeline
  ├─ signer.sign(messageBytes)        ← signing boundary
  ├─ submitRawTransaction(signedBytes) ← send boundary (dedicated RPC sendTransaction)
  ├─ awaitConfirmation
  ├─ parseFillFromTransaction
  ├─ detectPartialFill / evaluateRealizedSlippage
  └─ return txSig, fill metrics

enterPosition / executeLiveExit → submitSwap(BUY|SELL)
Reconciliation: writePendingReconciliation on ambiguity paths
```

**Normalization:** Quote object used as-is from Jupiter JSON; `_fetchedAtMs` added locally; route fingerprint from `routePlan` array.

---

## 6. Recommended target Jupiter flow

**One consistent Swap API v1 pair on a single base host:**

| Component | Target |
|-----------|--------|
| **Default base** | `https://lite-api.jup.ag/swap/v1` |
| **Pro base (optional)** | `https://api.jup.ag/swap/v1` when `JUPITER_API_KEY` present |
| **Quote** | `GET {base}/quote?inputMint&outputMint&amount&slippageBps&swapMode=ExactIn` |
| **Swap build** | `POST {base}/swap` with existing `quoteResponse` body shape |
| **Blocked** | `quote-api.jup.ag` · `/execute` · `/submit` · split-transaction responses |
| **API key** | Optional `x-api-key` header on **both** quote and swap when key present; document requirement if lite-api rate-limits |
| **Timeout** | Quote/swap fetch: inherit existing injectors; priority fee: 5–10s (unchanged) |
| **Retry** | `maxSubmitRetries` re-quote before retry — no blind rebroadcast (unchanged) |
| **Freshness** | `assertQuoteFresh` ≤ `maxQuoteAgeMs` (10s) — unchanged |
| **Route consistency** | `assertRouteUnchangedSinceQuote` before LIVE submit — unchanged |

---

## 7. Remediation options compared

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A — Full inline migration** | Change `JUPITER_QUOTE_ENDPOINT` to lite-api `/quote` only | Minimal diff | Duplicates r29/r43e logic; drift risk returns |
| **B — Legacy Metis-only path** | Keep deprecated v6 if “still supported” | None viable | **v6 unreachable** · officially sunset |
| **C — Shared Jupiter adapter (recommended)** | Extract `jupiter_swap_client.js` from r29/r43e patterns; `live_executor` consumes it | Single host pair · URL validation · matches prep gate · testable | Small new module + test updates |

### Recommendation: **Option C — shared Jupiter adapter abstraction**

**Rationale:** R29a and R43E already implemented the correct policy (lite-api base, `/quote` only for observer, forbidden paths blocked). `live_executor` is the **only** stale consumer. A thin shared module prevents a third divergence and gives one place for host selection, headers, and schema guards.

---

## 8. U1 root cause (quote-path blocker)

| Item | Finding |
|------|---------|
| **Symptom** | Armed session BUY path would fail at first `getJupiterQuote` |
| **Cause** | `JUPITER_QUOTE_ENDPOINT = "https://quote-api.jup.ag/v6/quote"` — host sunset/unreachable |
| **Contributing** | R29a migrated **observer only**; `live_executor` not updated |
| **Contributing** | Swap build already on Swap v1 (`api.jup.ag`) — **cross-generation quote→build pipeline** |
| **Evidence** | RB-G9 NO_TRADE · prep gate lite-api success · v6 fetch failed in-environment |

---

## 9. U2 fee calculation root cause (fee blocker)

### 9.1 How ~0.007 SOL was calculated

Candidate packet and prep gate used:

```
estimatedWorstCaseEntryCostSol = positionSizeSol + (maxPriorityFeeLamports × 2) / LAMPORTS_PER_SOL
                               = 0.005 + (1_000_000 × 2) / 1e9
                               = 0.005 + 0.002
                               = 0.007 SOL
```

**This is a planning-script artifact, not an executor-enforced cost.**

### 9.2 Correct fee decomposition (per `live_executor.js`)

| Component | Source | Typical @ 0.005 SOL trade |
|-----------|--------|---------------------------|
| **Trade input (notional)** | `positionSizeSol` | **0.005 SOL** *(returns as token; not a fee)* |
| **Solana base fee** | `computeFeeBreakdownSol` · 5000 lamports/sig | **~0.000005 SOL** |
| **Priority fee (per tx)** | `resolvePriorityFee` capped by `maxPriorityFeeLamports` (1M) and `capPriorityFeeToTradeSize` (50% notional = 2.5M lamports effective ceiling) | **≤ 0.001 SOL** per tx |
| **ATA rent (conditional)** | `ATA_RENT_LAMPORTS` 2,039,280 if simulation logs show ATA create | **~0.002039 SOL** · **refundable** on account close |
| **Jupiter platform/route fees** | Embedded in quote `outAmount` / route — not separate SOL line item in executor | Absorbed in slippage/impact bounds |
| **Slippage reserve** | `otherAmountThreshold` vs `outAmount` — not an extra SOL charge | Policy-bound · not additive to 0.007 |

### 9.3 Classification of 0.007 figure

| Question | Answer |
|----------|--------|
| Real irreversible cost? | **No** — overstates single-entry fees |
| Unit error? | **No** — lamports math correct |
| Double-counting? | **Yes** — **2× max priority fee** applied to a **single entry** label |
| Temporary balance requirement? | Partially — if ATA created, wallet needs **trade + fees + rent** temporarily; rent is **recoverable** |

### 9.4 Correct engineering-validation fee thresholds

| Threshold | Value | Policy |
|-----------|-------|--------|
| **Authorized trade notional** | **0.005 SOL** | Immutable for engineering-validation |
| **Max priority fee per tx** | **≤ 0.001 SOL** (1M lamports config cap) | Also `capPriorityFeeToTradeSize` ≤ 50% notional |
| **Max non-refundable single-entry tx cost (excl. ATA rent)** | **≤ ~0.006005 SOL** (0.005 + 0.001 + base) | Trade notional is separate |
| **Max single-entry wallet debit (incl. ATA create)** | **≤ ~0.008 SOL** worst case | Requires `minWalletBalanceSol` 0.12 — **sufficient** |
| **Round-trip fee budget (entry + exit, excl. notional)** | **≤ ~0.002 SOL** priority + base | Well within session loss cap 0.03 SOL |
| **Planning comparison rule** | Never compare **2× priority cap + trade** to **trade authorization** | Use `computeFeeBreakdownSol` output |

**Conclusion:** U2 blocker was **fee accounting presentation error** in candidate prep, not proof that 0.005 SOL trades are economically impossible under current config. Remediation still required: **document fee decomposition in candidate/execution gates** and **assert in tests**.

---

## 10. Required code changes (implementation gate — not applied here)

| # | Change |
|---|--------|
| **R1** | Add `jupiter_swap_client.js` (or equivalent) with: `resolveJupiterBaseUrl()` · `buildQuoteUrl()` · `buildSwapUrl()` · `fetchQuote()` · `fetchSwapTransaction()` · deprecated-host block · optional API key headers |
| **R2** | `live_executor.js`: replace `JUPITER_QUOTE_ENDPOINT` usage with adapter; align swap build base to **same host** as quote |
| **R3** | `live_executor.js`: export/test hooks updated to expose unified base URL |
| **R4** | `validate_live_system.js`: require lite-api (or adapter) · **remove** v6 requirement |
| **R5** | Candidate-prep / Ori docs: use `computeFeeBreakdownSol` formula · ban `2× maxPriority` shortcut |

**Explicitly out of scope for implementation gate unless separately authorized:** Ultra `/order` · `/execute` · multi-tx splits · Jupiter SDK npm add.

---

## 11. Required test changes (implementation gate)

| # | Test |
|---|------|
| **T1** | `test_jupiter_quote_validation.js` — assert unified base URL · mock lite-api |
| **T2** | New `test_jupiter_swap_v1_integration.js` — quote fixture → build → deserialize → **no send** |
| **T3** | `test_tx_build.js` — swap build URL matches quote base |
| **T4** | `test_r29_real_quote_observer.js` — unchanged or import shared adapter constants |
| **T5** | Fee decomposition test: 0.005 SOL trade → priority ≤ 0.001 · total non-rent ≤ 0.0061 · no 0.007 false alarm |
| **T6** | Route consistency + freshness + impact/slippage — existing coverage retained |
| **T7** | BUY and SELL mint resolution paths both through adapter |
| **T8** | `validate_live_system.js` static checks updated |
| **T9** | Full `run_safety_tests.js` **82/82 green** after changes |

---

## 12. No-broadcast verification plan

All tests run with **send boundary hard-disabled** (existing pattern: mock `submitRawTransaction` / `REAL_PATH_DISABLED` / no LIVE mode).

| Step | Verification |
|------|--------------|
| **V1** | Deterministic quote fixture (recorded lite-api JSON) parses required fields |
| **V2** | Quote schema validation: `inputMint` · `outputMint` · `inAmount` · `outAmount` · `otherAmountThreshold` · `priceImpactPct` · `slippageBps` · `routePlan[]` |
| **V3** | Swap-build schema: single `swapTransaction` base64 · no split txs |
| **V4** | Transaction deserialization: `inspectVersionedV0Transaction` passes |
| **V5** | Signer boundary: mock signer only · no env secret in tests |
| **V6** | Send boundary: **zero** calls to `submitRawTransaction` / `sendTransaction` |
| **V7** | Quote freshness: stale quote aborts |
| **V8** | Price impact / slippage / liquidity guards |
| **V9** | Route fingerprint consistency (LIVE re-quote path) |
| **V10** | BUY + SELL quote paths |
| **V11** | Fee decomposition assertions per §9 |
| **V12** | PIPELINE_DRY_RUN full pipeline without sign/send |

**Optional manual check (operator, post-implementation):** Single live-network quote+build in PIPELINE_DRY_RUN with dedicated RPC simulate — **not in this planning gate**.

---

## 13. Acceptance criteria before any new R15 authorization

| # | Criterion |
|---|-----------|
| **A1** | Official Jupiter Swap v1 lite-api quote endpoint verified reachable in target environment |
| **A2** | Quote and swap-build use **same base host/version** in `live_executor` |
| **A3** | Deprecated `quote-api.jup.ag` **blocked or absent** from production path |
| **A4** | No-broadcast integration test green (§12) |
| **A5** | BUY and SELL routes proven through adapter in PIPELINE_DRY_RUN |
| **A6** | Fee estimate decomposed; single-entry non-rent cost **≤ ~0.0061 SOL** at 0.005 SOL / 1M priority cap |
| **A7** | Full safety suite **82/82 PASS** |
| **A8** | System remains disarmed until **separate** full arming/R15 gate sequence |
| **A9** | RB-G9 `RB-G9-20260706-EV01` **not reused** — new session ID required |
| **A10** | OR-20260630-008 remains **not_promoted** · strategy **NOT READY** |

---

## 14. Post-planning posture verification

| Check | Result |
|-------|--------|
| `liveArmed` | **`false`** |
| `operationalPosture` | **`PIPELINE_OBSERVING`** |
| `executionMode` | **`PIPELINE_DRY_RUN`** |
| `dryRunMode` | **`true`** |
| `FOMO_ENABLE_LIVE_SUBMISSION` | **unset** |
| Runtime stub | **absent** |
| Submit/broadcast | **not invoked** |

---

## 15. Explicit non-actions (this gate)

| Item | Status |
|------|--------|
| Code/test/config/.env changes | **No** |
| Jupiter remediation while armed | **N/A — disarmed** |
| New R15 / arming / stub | **No** |
| OR promotion / readiness claims | **No** |

---

## 16. Required output summary

| Item | Value |
|------|-------|
| **Planning note path** | `JUPITER EXECUTION PATH REMEDIATION PLANNING — 2026-07-07.md` |
| **API-generation/host mismatch** | **Yes** |
| **Recommended target flow** | Unified **Swap v1** on `lite-api.jup.ag/swap/v1` (pro: `api.jup.ag/swap/v1` + key) |
| **Recommended design** | **Option C — shared Jupiter adapter** |
| **U1 root cause** | Stale v6 quote host + cross-host v6→v1 mismatch; executor not migrated with R29a |
| **U2 root cause** | Prep formula `0.005 + 2×maxPriority` double-counted priority for single entry |
| **Correct fee threshold** | Trade **0.005 SOL**; per-tx non-rent cost **≤ ~0.006 SOL**; not 0.007 |
| **Recommended next gate** | **Jupiter Execution Path Remediation Implementation** |

---

## 17. Recommended next gate

**Jupiter Execution Path Remediation Implementation**

*(Implement adapter + live_executor alignment + tests; remain disarmed; no broadcast.)*
