# R32 — Additional Observation Batch Plan

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **DEFINED** — manual batch only  
**Review date:** 2026-06-23  

**Prerequisites:** [R31](./R31_QUOTE_OBSERVATION_HARDENING.md)

**Live trading:** **NOT APPROVED**  
**Continuous polling:** **NOT ACTIVATED**

---

## 1. Executive verdict

### **ADDITIONAL OBSERVATION BATCH PLAN DEFINED — MANUAL ONLY**

R32 defines how a **small manually triggered observation batch** may run later. **No continuous loop.**

---

## 2. Purpose

Plan a conservative follow-up observation batch after R31 hardening, without opening trading or continuous polling.

---

## 3. Batch rules

| Rule | Value |
|------|-------|
| Trigger | Manual `--observe-once` only |
| Continuous loop | **Forbidden** |
| Max batch size | **3 candidates** |
| Default requested slippage | **100 bps** |
| Max request tolerance | **200 bps** |
| Output | Analysis-only |

---

## 4. Allowed pairs

| Pair | Notes |
|------|-------|
| SOL-USDC | Real public mints in `examples/r31_real_quote_candidates.example.json` |
| SOL-USDT | Allowed if mint known and valid |
| One manual token | Only after validation — no random memecoin mints in examples |

---

## 5. Stop conditions

Stop batch after:

- Provider error cluster  
- Route rejection cluster  
- Rate limit response  

**No wallet · no signing · no submission**

---

## 6. Background work

Continue **R7b** data collection in parallel.

---

## 7. No live trading approval

This plan **does not** approve live trading, micro-live, or shadow execution with wallet.

**Recommended invocation (when operator ready):**

```powershell
node r29_real_quote_observer.js --observe-once --candidates examples/r31_real_quote_candidates.example.json
```

**Do not run automatically.**
