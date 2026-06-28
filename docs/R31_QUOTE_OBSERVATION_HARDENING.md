# R31 — Quote Observation Hardening

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **HARDENING COMPLETE** — trading still blocked  
**Review date:** 2026-06-23  

**Prerequisites:** [R29](./R29_REAL_QUOTE_OBSERVATION_ACTIVATION_IMPLEMENTATION.md) · [R30](./R30_REAL_QUOTE_OBSERVATION_RESULTS_REVIEW.md)

**Live trading:** **NOT APPROVED**  
**Capital at risk:** **$0**

---

## 1. Executive verdict

### **QUOTE OBSERVATION HARDENED — TRADING STILL BLOCKED**

R31 hardens quote observation field naming and policy interpretation after the first real observation review. **No live trading approval.**

---

## 2. Purpose

| Goal | Description |
|------|-------------|
| Field clarity | Separate requested tolerance from realized slippage |
| Policy fix | Stop treating quote-request tolerance as measured slippage |
| Safer defaults | Default requested slippage **100 bps** |

---

## 3. Field interpretation issue (from R30)

The first real observation wrote `slippageBps: 300`, which was the **requested quote tolerance** passed to Jupiter, not **actual measured slippage**. R18 rejected with `SLIPPAGE_ABOVE_MANUAL_EXCEPTION`, conflating request tolerance with route quality.

---

## 4. Field distinctions

| Field | Meaning in observation mode |
|-------|----------------------------|
| `requestedSlippageBps` | Quote request tolerance sent to provider |
| `minimumOutputThreshold` | Minimum acceptable output from quote |
| `outputAmount` / `quotedOutputAmount` | Quoted output amount |
| `priceImpactBps` | Route quality signal from provider |
| `realizedSlippageBps` | **null** — only available after execution |
| `slippageInterpretation` | `REQUESTED_TOLERANCE_NOT_REALIZED` |
| `slippageBps` | **Deprecated** — duplicate of `requestedSlippageBps` for backward compatibility |

Requested slippage tolerance **must not** be labeled as actual slippage.

---

## 5. Revised observation policy

| Check | Rule |
|-------|------|
| Request tolerance | `requestedSlippageBps` above cap → request/config risk (`REQUESTED_SLIPPAGE_ABOVE_*`) |
| Price impact | `priceImpactBps` remains route quality signal |
| Quote freshness | Stale quotes reject |
| Minimum output | Missing minimum output rejects |
| Realized slippage | **Not knowable pre-trade** — always null in observation mode |

### Caps (R18-aligned)

| Cap | bps |
|-----|-----|
| Default requested slippage | **100** |
| Manual exception cap | **200** |
| Hard reject | **300+** |

Rejection at 300 bps requested: **`REQUESTED_SLIPPAGE_ABOVE_MANUAL_EXCEPTION`** (with deprecated alias `SLIPPAGE_ABOVE_MANUAL_EXCEPTION`).

---

## 6. HTTP 400 diagnostics

Provider errors capture:

- `providerHttpStatus`
- `providerErrorBodyPreview` — safe truncated body (max 500 chars)
- Secret-like content **redacted**
- No request headers or API keys logged

---

## 7. No live trading approval

This hardening **does not** approve live trading, micro-live, wallet connection, signing, or submission.

**Example candidates:** `examples/r31_real_quote_candidates.example.json`
