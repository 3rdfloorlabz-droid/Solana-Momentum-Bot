# R20 — Fixture + Dry-Run Shadow Quote Collector

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **COMPLETE** — fixture collector **built**; **network polling blocked**  
**Review date:** 2026-06-28  

**Helper:** `node r20_shadow_quote_collector.js` → `analysis/shadow_quote_observations.jsonl` + `analysis/r20_shadow_quote_collector_status.json`

**Fixtures:** `examples/shadow_quote_candidates.example.json`

**Prerequisites:** [R18](./R18_SHADOW_QUOTE_DESIGN_REVIEW.md) · [R19](./R19_SHADOW_QUOTE_COLLECTION_PLAN.md)

**Live trading:** **NOT APPROVED**  
**Network quote polling:** **NOT ACTIVATED**  
**Capital at risk:** **$0**

---

## 1. Executive verdict

### **FIXTURE COLLECTOR BUILT — NETWORK POLLING STILL BLOCKED**

R20 implements a **fixture-based** shadow quote collector that normalizes candidate/quote fixtures into observation records, evaluates them with R18/R19 policy, and writes **analysis-only** output. **No network calls.** **No signing.** **No submission.**

This verdict is **not** “ready for live trading.”

When fixtures pass with no rejects: secondary status **READY_FOR_REAL_QUOTE_OBSERVATION_APPROVAL_REVIEW** (R21 — still not live).

---

## 2. Purpose

| Goal | Description |
|------|-------------|
| Collector shape | Validate observation record format before real quote collection |
| Policy rehearsal | Apply R18 slippage/MEV/freshness rules to fixture data |
| Analysis output | Write gitignored observation log |

R20 **does not**: poll live quotes · connect wallet · sign · submit · approve micro-live

---

## 3. Collector input model

**File:** `examples/shadow_quote_candidates.example.json`

| Field | Description |
|-------|-------------|
| `candidateId` | Unique fixture id |
| `source` | e.g. paper_trade_candidate, scanner_observation |
| `tokenSymbol` / `tokenMint` / `pairAddress` | Fake identifiers |
| `inputMint` / `outputMint` | Fake mints |
| `intendedInputAmountSol` | Tiny SOL amount |
| `expectedQuoteProfile` | Deterministic fake quote fields |
| `createdAt` | ISO timestamp |
| `thesisMatch` | Boolean |
| `riskNotes` | Operator notes (fixture only) |

**Fake values only.** `networkPolling: false` required.

---

## 4. Collector output model

**Observations:** `analysis/shadow_quote_observations.jsonl` (one JSON object per line)

Each record includes: `schemaVersion`, `collectedAt`, `sourceMode: FIXTURE_ONLY`, `networkPolling: false`, `approved: false`, candidate/token fields, quote metrics, `gateVerdict`, `rejectionReasons`, `warnings`.

**Summary:** `analysis/r20_shadow_quote_collector_status.json`

---

## 5. Collector script

```bash
node r20_shadow_quote_collector.js
node r20_shadow_quote_collector.js --input path/to/candidates.json
```

**Statuses:** `BLOCKED` · `FIXTURE_COLLECTION_COMPLETE` · `INVALID_FIXTURE` · `READY_FOR_REAL_QUOTE_OBSERVATION_APPROVAL_REVIEW`

**Never `approved: true`.**

---

## 6. Evaluation policy

Uses **R18/R19** rules:

| Rule | Threshold |
|------|-----------|
| Slippage PASS | ≤ **100 bps** |
| Slippage WARN | **100–200 bps** |
| Slippage REJECT | **>200–300 bps** hard cap |
| Price impact WARN | **>100 bps** |
| Price impact REJECT | **>200 bps** |
| Quote stale | **>10 s** |
| Also reject | Missing min output · route unstable · secret fields · polling flags |

---

## 7. Recommended next gate

1. **R21 Real Quote Observation Approval Gate**  
2. **Continue R7b**  
3. **Do not activate network polling** · **Do not connect wallet** · **Do not arm live**

---

## 8. Verdict table

| Field | Value |
|-------|-------|
| **R20 verdict** | **FIXTURE COLLECTOR BUILT — NETWORK POLLING STILL BLOCKED** |
| **Quote polling active** | **NO** |
| **Status check** | `node r20_shadow_quote_collector.js` |

---

## 9. Footer

Fixtures in.  
Analysis out.  
Network stays off.  
Live remains blocked.
