# R18 — Shadow-Quote Design Review

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **COMPLETE** — design **defined**; **not active**  
**Review date:** 2026-06-28  

**Helper:** `node r18_shadow_quote_review.js` → `analysis/r18_shadow_quote_status.json` (fixture-only)  
**Fixtures:** `examples/shadow_quotes.example.json`

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED**  
**Capital at risk:** **$0**

---

## 1. Executive verdict

### **SHADOW-QUOTE DESIGN DEFINED — NOT ACTIVE**

R18 designs how the system may **observe** quote behavior, slippage, price impact, route instability, and priority-fee assumptions **without** signing or submitting transactions. Fixture-based evaluation is available; **live quote polling is not activated**.

When fixtures pass shadow policy: secondary status **READY FOR FIXTURE-BASED QUOTE HARNESS** (still not live approval).

This verdict is **not** “ready for live trading.”

---

## 2. Purpose

| Goal | Description |
|------|-------------|
| Observation design | Quote/slippage/route analysis without trading |
| Policy rehearsal | Apply R14 slippage/MEV limits to quote-like data |
| Evidence | Write structured analysis output only |

R18 **does not**:

- Trade · sign · submit · connect a wallet · approve micro-live  

---

## 3. Shadow quote definition

**Shadow quote mode** = observe quote-like data only:

- Calculate expected output and minimum output threshold  
- Calculate price impact (if provided)  
- Calculate quote age  
- Evaluate slippage caps, route stability, priority fees, MEV assumptions  
- Write **analysis output only**  
- **No** signing · **No** submission · **No** position creation · **No** network calls  

---

## 4. Quote input model

| Field | Description |
|-------|-------------|
| `timestamp` | Quote time (ISO) |
| `inputMint` / `outputMint` | Token mints (simulated in fixtures) |
| `inputAmount` | Input size (SOL) |
| `outputAmount` | Quoted output |
| `minimumOutputAmount` | Slippage floor |
| `slippageBps` | Quoted slippage |
| `priceImpactBps` | Price impact |
| `routeProvider` | Route source label |
| `routeSummary` | Human-readable route |
| `quoteId` / `routeHash` | Optional identifiers |
| `priorityFeeEstimateSol` | Fee estimate |
| `computeBudgetEstimate` | CU estimate |
| `quoteSource` | e.g. `FIXTURE_ONLY` |
| `quoteAgeSeconds` | Age if precomputed |
| `token` / `pairAddress` | Identity labels |
| `liquidityUsd` / `volume24hUsd` | Optional context |
| `mevProtectionMode` | Design-level mode label |
| `routeStable` | Stability flag |

---

## 5. Slippage evaluation (R14 aligned)

| Threshold | Action |
|-----------|--------|
| Default cap | **100 bps** — PASS under cap |
| Manual exception | **200 bps** — WARN above default, within exception |
| Hard reject | **>300 bps** — REJECT |
| Realized warn / halt | **100 / 200 bps** |

Shadow mode also **REJECT** if: minimum output missing · output unverifiable · quote stale · route unstable.

---

## 6. Price impact evaluation

| Threshold | Action |
|-----------|--------|
| Warn | **>100 bps (1%)** |
| Reject | **>200 bps (2%)** |
| Missing impact | Reject if required or liquidity data insufficient |
| Tiny trade + suspicious impact | Reject |

---

## 7. Quote freshness policy

| Rule | Policy |
|------|--------|
| Max age | **5–10 s** (default **10 s** for volatile memecoins) |
| Re-quote before future submit | Required |
| Stale quote | **REJECT** |
| Route change / output beyond tolerance | **REJECT** |

---

## 8. Priority fee policy

- Cap priority fee **relative to tiny trade size** (default: reject if **>50%** of trade)  
- **WARN** if elevated but under reject cap  
- **No** infinite retry · **No** repeated broadcast · **No** stale transaction reuse  

---

## 9. MEV protection design

| Option | Notes |
|--------|-------|
| Public RPC | Higher exposure — design level |
| Protected/private route | Future candidate |
| Jito / bundle route | Future candidate |
| Low-latency send | Future candidate |

**Constraints:** No path may weaken secret handling, bypass emergency stop, bypass operator approval, or bypass slippage caps.

---

## 10. Shadow quote evidence output

**File:** `analysis/r18_shadow_quote_status.json`

Includes: `evaluatedAt`, `gateStatus`, `quoteCount`, `passCount`, `warnCount`, `rejectCount`, `rejectionReasons`, `worstSlippageBps`, `worstPriceImpactBps`, `staleQuoteCount`, `routeInstabilityCount`, `priorityFeeWarnings`, `mevMode`, **`approved: false`**

---

## 11. Fixture harness

**Module:** `r18_shadow_quote_review.js`

```bash
node r18_shadow_quote_review.js
node r18_shadow_quote_review.js --input path/to/fixtures.json
```

**Gate statuses:** `BLOCKED` · `SHADOW_REVIEWABLE_ONLY` · `INVALID_FIXTURE` · `READY_FOR_SHADOW_QUOTE_COLLECTION_DESIGN`  
**Never `approved: true`.**

**Future work (not activated):** Live quote polling requires a separate explicit gate and operator approval.

---

## 12. Recommended next gate

1. **Continue R7b** data collection  
2. Design **shadow quote collection** separately if operator approves future gate  
3. **Do not arm live** · **Do not poll live quotes** without explicit future approval  

---

## 13. Verdict table

| Field | Value |
|-------|-------|
| **R18 verdict** | **SHADOW-QUOTE DESIGN DEFINED — NOT ACTIVE** |
| **Live trading approved** | **NO** |
| **Status check** | `node r18_shadow_quote_review.js` |

---

## 14. Footer

Observe only.  
Fixtures simulate.  
Live remains blocked.
