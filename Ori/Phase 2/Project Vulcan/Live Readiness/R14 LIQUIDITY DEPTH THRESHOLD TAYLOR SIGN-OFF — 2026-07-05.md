# R14 Liquidity/Depth Threshold Taylor Sign-Off — 2026-07-05

Status:
**Taylor sign-off complete — decision recorded; no config, no code, no runtime**

Gate type:
Human decision record — R14 liquidity/depth floor for micro-live planning

Prerequisite:
`LIQUIDITY DEPTH THRESHOLD DECISION — 2026-07-05.md` (options analysis)

Related:
`R14 SLIPPAGE MEV IMPLEMENTATION PLANNING — 2026-07-05.md` (E9 unblocked for micro-live spec only)

Decision authority:
**Taylor Cheaney**

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
| `LIQUIDITY DEPTH THRESHOLD DECISION — 2026-07-05.md` | Options A–D analysis; scanner $25k floor; near-miss/paper liquidity ranges |
| `R14 SLIPPAGE MEV IMPLEMENTATION PLANNING — 2026-07-05.md` | E9 implementation spec; blocked pending this decision |

---

## 2. Taylor Decision (Recorded)

Taylor approves **Option A + Option D** from the decision-support doc, with the following binding parameters for **micro-live planning only**:

| Parameter | Decision |
|-----------|----------|
| **Minimum pool liquidity (micro-live)** | **$25,000 USD** |
| **Source alignment** | Reuses existing scanner floor (`MIN_LIQUIDITY` / `MIN_POOL_LIQUIDITY` = $25,000 in `scanner_gmgn_trending.js`) |
| **Execution-time requirement** | **Fresh quote / route / liquidity check required at submit time** — do not rely on scan-time liquidity alone |
| **Freshness coupling** | Align liquidity re-read with R14 quote-age policy (**10 seconds** max) per E1/E9 implementation planning |
| **Trade-size context** | At 0.005–0.01 SOL (~$0.75–$1.50 notional), floor is primarily **rug / staleness / dead-pool guard**, not slippage-from-size |
| **Scope** | **Micro-live only** |
| **Scaling** | **Not valid beyond micro-live** — any scaling beyond first micro-live phase requires **new liquidity/depth review** |

---

## 3. TBD_BLOCKING Resolution

| Item | Status |
|------|--------|
| `TBD_BLOCKING` for micro-live liquidity floor | **Resolved** — **$25,000 minimum** |
| Blocks arming today | **Yes** — config harmonization + enforcement implementation still open |
| Blocks R14 E9 spec work | **No** — E9 may proceed in implementation authorization (micro-live scope only) |

**LR-06 note:** R14 remains **PARTIAL** until config harmonized **and** enforcement implemented (E1–E9 including E9 at submit time).

---

## 4. Config / Implementation Surfaces (Future — Not This Gate)

When authorized in a future gate, expected surfaces (planning reference only):

| Surface | Planned value / behavior |
|---------|--------------------------|
| `minPoolLiquidityUsd` (proposed config key) | **25000** |
| `checkExecutionTimeLiquidity()` (E9) | Re-read liquidity at submit; reject if **< $25,000** or stale |
| Scanner constant | **Unchanged** — remains $25,000 at candidate selection |

**This gate does not write config or code.**

---

## 5. Explicit Non-Actions

| Non-action | Confirmed |
|------------|-----------|
| Modify `live_config.json` | **No** |
| Modify `.env` | **No** |
| Implement E9 in `live_executor.js` | **No** |
| Start scanner/executor loops | **No** |
| Enable live mode / `liveArmed` | **No** |
| Capital exposure | **No** |
| OR promotion | **No** |
| Claim live readiness | **No** |
| Inspect secrets | **No** |

---

## 6. Recommended Next Gate

**R14 Implementation Authorization**

(Fold config harmonization apply + R14 enforcement implementation per planning docs; still no arming or capital in that gate unless separately authorized.)

---

## 7. Safety Confirmation

| Item | Value |
|------|-------|
| `.env` opened | **No** |
| Secrets inspected | **No** |
| `process.env` dumped | **No** |
| Code changed | **No** |
| Runtime processes started | **No** |
| OR-20260630-008 status | **not_promoted** |
| Promotion authorized | **No** |
| Live readiness claimed | **No** |
| Human soak readiness claimed | **No** |
| Capital exposure enabled | **No** |

---

**Signed / confirmed by Taylor:** Taylor Cheaney (R14 liquidity/depth threshold, 2026-07-05)
