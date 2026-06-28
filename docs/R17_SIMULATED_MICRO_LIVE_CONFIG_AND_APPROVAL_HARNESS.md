# R17 — Simulated Micro-Live Config + Approval Harness

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **COMPLETE** — harness **built**; **live still blocked**  
**Review date:** 2026-06-28  

**Helper:** `node r17_simulated_micro_live_harness.js` → `analysis/r17_simulated_micro_live_status.json` (read-only)

**Examples:** `examples/micro_live_config.example.json` · `examples/r15_manual_approval_record.example.json`

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED**  
**Capital at risk:** **$0**

---

## 1. Executive verdict

### **SIMULATED HARNESS BUILT — LIVE STILL BLOCKED**

R17 rehearses micro-live **config** and **approval** validation in simulation only. Example files are **fake** and **inactive**. The harness validates allocation, trade size, slippage/MEV fields, and acknowledgments — **without** wallet connection, secrets, live arming, or transaction submission.

This verdict is **not** “ready for live trading.”

When a reviewable fixture passes all simulation checks: secondary status **READY FOR SHADOW-QUOTE DESIGN REVIEW** (still not live approval).

---

## 2. Purpose

| Goal | Description |
|------|-------------|
| Rehearsal | Exercise micro-live config + approval logic safely |
| Validation | Check proposed allocation, trade size, slippage, MEV, stop rules, acknowledgments |
| Gap closure | Stage 2 of R16 implementation path |

R17 **does not**:

- Create active live config  
- Arm live  
- Connect a real wallet  
- Approve live trading  

---

## 3. Example config only

**File:** `examples/micro_live_config.example.json`

| Rule | Value |
|------|-------|
| `configType` | `EXAMPLE_ONLY` |
| `active` | **false** |
| `executionMode` | `PIPELINE_DRY_RUN` |
| `dryRunMode` | **true** |
| `liveArmed` | **false** |
| Wallet | `SIMULATED_RESEARCH_WALLET_DO_NOT_USE` |
| Wallet liquidity | **1 SOL** (operational — not active risk) |
| Authorized session allocation | **0.05 SOL** |
| First trade | **0.005–0.01 SOL** |

**No private key or secret fields.** Not a runtime config path.

---

## 4. Example approval record only

**File:** `examples/r15_manual_approval_record.example.json`

| Field | Default |
|-------|---------|
| `approvalStatus` | **NOT APPROVED** |
| `simulationExampleOnly` | **true** |
| All acknowledgments | **false** (blocks by default) |
| Operator signature | **false** |

Default example **blocks** harness review.

---

## 5. Harness behavior

**Module:** `r17_simulated_micro_live_harness.js`

| Action | Description |
|--------|-------------|
| Read | Example or fixture config + approval record |
| Validate | Example-only flags, limits, slippage/MEV, acknowledgments |
| Write | `analysis/r17_simulated_micro_live_status.json` |
| Print | Summary to stdout |

**Allowed statuses:**

| Status | Meaning |
|--------|---------|
| `BLOCKED` | Validation failed or default example |
| `SIMULATION_REVIEWABLE_ONLY` | Fake fixture passes simulation checks — **not live approved** |
| `INVALID_EXAMPLE` | Config/record malformed or contains forbidden fields |
| `READY_FOR_SHADOW_QUOTE_DESIGN_REVIEW` | Reviewable + full policy fields — shadow quote design only |

**Never returns `approved: true` or live-ready.**

---

## 6. Validation rules

### Harness blocks if:

- `active: true`
- `executionMode` is `MICRO_LIVE` or `LIVE`
- `dryRunMode: false`
- `liveArmed: true`
- Wallet address appears real (unless test fixture `allowSimulatedWalletAddress`)
- Authorized allocation **> 0.05 SOL** (default cap)
- First trade size **> 0.01 SOL** (default cap)
- Max open positions **> 1**
- `autoCompounding`, `scaling`, or `averagingDown` **true**
- Unattended session allowed
- Slippage hard reject or quote freshness missing
- MEV policy missing
- Approval status **NOT APPROVED** (for reviewable path)
- Required acknowledgments missing
- R7b bypass required but not acknowledged
- `recovery_actions.jsonl` exists
- Secret-like field appears

### May return `SIMULATION_REVIEWABLE_ONLY` if:

- Config is fake/example only
- Approval fixture explicitly reviewable with all acks **true**
- Allocation **≤ 0.05 SOL**, max trade **≤ 0.01 SOL**
- Still **no live approval**

---

## 7. Tests

**Module:** `test_r17_simulated_micro_live_harness.js` — wired in `run_safety_tests.js`

---

## 8. Recommended next gate

1. **R18 Shadow-Quote Design Review** (when operator ready)  
2. **Continue R7b** data collection  
3. **Do not connect real wallet** · **Do not arm live**

---

## 9. Verdict table

| Field | Value |
|-------|-------|
| **R17 verdict** | **SIMULATED HARNESS BUILT — LIVE STILL BLOCKED** |
| **Live trading approved** | **NO** |
| **Status check** | `node r17_simulated_micro_live_harness.js` |

---

## 10. Footer

Examples are fake.  
Harness simulates.  
Live remains blocked.
