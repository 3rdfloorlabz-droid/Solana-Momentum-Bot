# R14 — Slippage / MEV Protection Review

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **COMPLETE** — policy **defined**; **not implemented for live**  
**Review date:** 2026-06-28  

**Helper:** `node r14_slippage_mev_review.js` → `analysis/r14_slippage_mev_status.json` (read-only)

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED**

---

## 1. Executive verdict

### **SLIPPAGE / MEV REVIEW DEFINED — NOT IMPLEMENTED**

Slippage, price impact, quote freshness, priority fee, and MEV protection policies are **documented**. Fixture-based evaluation is available via `r14_slippage_mev_review.js`. **No live quotes, swaps, or submission** are performed by R14.

This verdict is **not** “ready for live trading.”

When quote fixtures pass policy: secondary status **READY FOR SIMULATED ROUTING REVIEW** (still not live approval).

---

## 2. Slippage policy (draft — NOT active config)

| Rule | Policy |
|------|--------|
| Max allowed quoted slippage (default) | **100 bps / 1.0%** or lower |
| High-volatility exception | Up to **200 bps** only with **manual approval** |
| Hard reject | Above **300 bps** |
| Realized slippage warning | Above **100 bps** |
| Realized slippage halt | Above **200 bps** |
| Reject if quote impact too high | Yes — see price impact §3 |
| Reject if route changes too much | Yes |
| Reject if minimum output missing | Yes |
| Reject if price data stale | Yes |
| Reject if pool liquidity too low | Yes |
| Reject if spread too wide | Yes |
| Reject if expected output unverifiable | Yes |

Existing pipeline dry-run records `quotedSlippageBps` in audit — observation only today.

---

## 3. Price impact policy (draft)

| Threshold | Action |
|-----------|--------|
| Warning | Above **1%** |
| Hard reject | Above **2%** |
| Very tiny trades | Still reject if route unstable or liquidity suspicious |

Requirements:

- Require quote response price impact when available  
- Compare expected output vs minimum output  
- Log quote time, route, expected output, threshold, price impact  
- **No trade if quote is stale**

---

## 4. MEV protection policy (design level)

| Option | Notes |
|--------|-------|
| Public RPC submission | Simplest — **higher sandwich/MEV exposure** |
| Private / MEV-protected routing | Future candidate if available |
| Jito / bundle-style send | Future candidate — design only |
| Priority fee / compute budget | Capped — see §5 |
| Retry discipline | **No multiple retries exposing intent** |
| Failed attempts | **No repeated broadcast** of same intent |
| Stale transactions | Reject / do not resubmit blindly |
| Sandwichable conditions | Avoid via tiny size, strict caps, fresh quotes |
| Unsafe credential handling | **Forbidden** for any MEV protection path |

---

## 5. Priority fee / landing policy (draft)

| Rule | Policy |
|------|--------|
| Cap priority fees | Yes — relative to tiny trade size |
| Log priority fee estimate | Required |
| Overpay vs trade size | **No trade** if fee too high vs allocation |
| Infinite retry loop | **Forbidden** |
| Max retries | **2** |
| Transaction expiry | Handle explicitly; no blind resubmit |

Draft: reject if priority fee exceeds **50%** of trade size (lamports basis) — policy helper default.

---

## 6. Quote freshness policy (draft)

| Rule | Policy |
|------|--------|
| Max quote age before submit | **5–10 seconds** (volatile memecoins — default **10s** in helper) |
| Re-quote before sign/submit | Required if stale |
| Output changed beyond tolerance | Reject |
| Route changed unexpectedly | Reject |
| Token/pool data changed materially | Reject |

---

## 7. Logging requirements (future live)

**Log safely per attempt:**

- Timestamp · token · route summary · input amount  
- Quoted output · minimum output · slippage cap · price impact  
- Priority fee · route provider · MEV protection used · submit path  
- Transaction ID **after submission only**  
- Confirmation result · realized output · realized slippage  

**Never log:** signing material · seed phrase · signer object · raw environment · credentials

---

## 8. Stop conditions

Stop session if:

- Realized slippage exceeds halt threshold  
- Route fails repeatedly  
- Transaction fails repeatedly  
- Quote changes too fast  
- Suspected sandwich/MEV loss  
- Priority fees spike  
- Token liquidity collapses  
- Emergency stop triggered  
- Wallet monitor stale  
- Singleton lock mismatch  
- Duplicate executor loop  
- Any safety suite failure  

---

## 9. Simulated routing review

**Module:** `r14_slippage_mev_review.js`

- Evaluates quote **fixtures** only (temp or `analysis/r14_quote_fixtures.json`)  
- Computes pass / warn / reject under draft policy  
- **No network** · **no wallet** · **no live submission**

Run: `node r14_slippage_mev_review.js`

---

## 10. Verdict table

| Field | Value |
|-------|-------|
| **R14 verdict** | **SLIPPAGE / MEV REVIEW DEFINED — NOT IMPLEMENTED** |
| **Live trading approved** | **NO** |
| **Recommended next gate** | Simulated routing fixtures; continue R7b; do not arm live |

---

## 11. Footer

Tiny trades still need strict routes.  
Slippage and MEV are execution risk.  
Policy defined ≠ policy armed.  
Live trading remains blocked.
