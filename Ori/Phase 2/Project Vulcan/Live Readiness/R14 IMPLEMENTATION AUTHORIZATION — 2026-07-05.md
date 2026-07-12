# R14 Implementation Authorization — 2026-07-05

Status:
**Authorization complete — Taylor authorizes future R14 config + enforcement implementation; no config, no code, no runtime in this gate**

Gate type:
Human authorization record — scope and boundaries for the next implementation gate

Prerequisites (all complete):
`R14 POLICY DECISION SESSION — 2026-07-05.md` · `R14 CONFIG HARMONIZATION PLANNING — 2026-07-05.md` · `R14 SLIPPAGE MEV IMPLEMENTATION PLANNING — 2026-07-05.md` · `R14 LIQUIDITY DEPTH THRESHOLD TAYLOR SIGN-OFF — 2026-07-05.md`

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
| `R14 POLICY DECISION SESSION — 2026-07-05.md` | Approved Taylor R14 policy (slippage, impact, quote age, MEV, retry, partial fill, session cap) |
| `R14 CONFIG HARMONIZATION PLANNING — 2026-07-05.md` | Config matrix; policy/config/implementation split; harmonization targets |
| `R14 SLIPPAGE MEV IMPLEMENTATION PLANNING — 2026-07-05.md` | E1–E9 function-level spec; `maxSubmitRetries` dead-key finding; test plan |
| `R14 LIQUIDITY DEPTH THRESHOLD TAYLOR SIGN-OFF — 2026-07-05.md` | $25k micro-live floor; E9 unblocked |

---

## 2. Authorization Decision (Taylor — Recorded)

Taylor **authorizes a future R14 implementation gate** to harmonize non-secret repo config and implement required slippage/MEV/route-safety enforcement under dry-run-safe constraints.

**This authorization gate does not itself apply config or code.** It grants scope for the next gate only.

---

## 3. Authorized Scope (Next Gate)

The authorized implementation gate may:

| # | Authorization item | Reference |
|---|-------------------|-----------|
| 1 | **Harmonize non-secret repo config** with R14 policy in `live_config.json` | §4 |
| 2 | **Implement quote freshness enforcement** (max **10 s**; stamp + reject stale) | E1 |
| 3 | **Implement retry/re-quote logic** so `maxSubmitRetries` is consumed by quote/submit flow, not confirmation polling alone | E4; dead-key fix |
| 4 | **Implement route validation/rejection** — mint mismatch; missing min output; route change without re-quote; stale quote; price impact over cap; liquidity below **$25,000** micro-live floor | E3, E1, E9 |
| 5 | **Implement realized slippage halt / audit path** (warn **> 100 bps**; halt **> 200 bps**) | E2, E7 |
| 6 | **Implement partial-fill reject/abort policy** if partial fills not supported/observable; reconcile before next trade | E5 |
| 7 | **Implement MEV posture field/handling** — public RPC allowed only for tiny micro-live if all caps pass; protected route preferred; protected route required before scaling | E6 |
| 8 | **Add tests proving fail-closed behavior** | §6 |
| 9 | **Preserve invariants** listed in §7 | §7 |

---

## 4. Config Harmonization Targets (Authorized — Apply in Next Gate Only)

| Field / surface | Current | Authorized target | Notes |
|-----------------|---------|-------------------|-------|
| `maxEntrySlippagePct` | 3% | **1%** | Default quoted cap |
| `maxExitSlippagePct` | 5% | **1%** | Default quoted cap |
| `maxRoutePriceImpactPct` | 10% | **2%** | Hard reject |
| `maxDailyLossSol` | 0.1 SOL | **0.03 SOL** | Micro-live session-aligned |
| `maxSubmitRetries` | 1 | **2** | Must wire into quote/submit retry (E4) |
| `positionSizeSol` | 0.005 SOL | **0.005 SOL** | No change |
| `maxQuoteAgeMs` | *(missing)* | **10000** | New field |
| `maxSessionLossSol` | *(missing)* | **0.03** | New field if distinct from daily |
| `maxManualSlippagePct` | *(missing)* | **2%** (200 bps) | Per-trade operator ack surface |
| Hard reject slippage cap | implicit | **≥ 3%** (300 bps) reject | Enforcement, not normal config |
| `mevRouteMode` | *(missing)* | **`public_micro_live`** or **`protected`** | Posture logging + routing preference |
| `minPoolLiquidityUsd` | *(missing)* | **25000** | Micro-live only; E9 |
| `maxDailyLossCount` | 3 | **Consider 2** | Align with R14/R8 consecutive-loss policy |

**Known gap (must be closed in implementation):** `maxSubmitRetries` is currently a **dead config key** — listed as metadata in `live_executor.js` but never consumed. Existing 3-attempt loop retries **fill/confirmation polling**, not quote/submit. Implementation must not leave this silently unused.

---

## 5. Implementation Boundaries

### 5.1 Allowed in next gate (`R14 Config + Enforcement Implementation`)

| Category | Allowed |
|----------|---------|
| Edit `live_config.json` | Non-secret R14 harmonization values per §4 |
| Edit `live_executor.js` | E1–E9 enforcement per implementation planning spec |
| Add `EXECUTION_ABORT_CODES` | Proposed codes: `QUOTE_STALE`, `ROUTE_CHANGED_SINCE_QUOTE`, `REALIZED_SLIPPAGE_HALT`, `RETRY_LIMIT_EXCEEDED`, `PARTIAL_FILL_UNRECONCILED`, `PRIORITY_FEE_EXCEEDS_TRADE_SIZE`, `LIQUIDITY_BELOW_FLOOR` |
| Extend audit fields | `quoteAgeMs`, `realizedSlippageBps`, `mevRouteMode` via existing `logExecutionStage()` |
| Add/extend tests | Per §6; `run_safety_tests.js` green before and after |
| Implementation note | Receipt doc for the implementation gate |

### 5.2 Forbidden in next gate (even with this authorization)

| Category | Forbidden |
|----------|-----------|
| `.env` edits | **No** |
| Secret inspection / logging | **No** |
| `executionMode` → LIVE | **No** |
| `liveArmed: true` | **No** |
| `FOMO_ALLOW_LOOP_LIVE=YES` | **No** |
| Capital exposure / live trading | **No** |
| Micro-live execution | **No** |
| OR promotion (`OR-20260630-008` or any OR) | **No** |
| Claim live readiness achieved | **No** |
| Claim human soak readiness | **No** |
| Start scanner/executor loops for live/soak | **No** unless separately authorized for dry-run observation only |
| Scaling liquidity floor beyond micro-live | **No** — $25k valid micro-live only; scaling requires new review |

### 5.3 Explicit non-authorizations (this gate and next gate unless separately gated)

| Item | Status |
|------|--------|
| `.env` edits | **Not authorized** |
| Secret inspection | **Not authorized** |
| Live mode / arming | **Not authorized** |
| `liveArmed true` | **Not authorized** |
| `FOMO_ALLOW_LOOP_LIVE=YES` | **Not authorized** |
| Capital exposure | **Not authorized** |
| Live trading / micro-live execution | **Not authorized** |
| OR promotion | **Not authorized** |
| Human soak readiness claim | **Not authorized** |

---

## 6. Required Tests (Next Gate)

Implementation gate must add or extend tests proving **fail-closed** behavior. Minimum set from planning spec:

| Test file | Covers |
|-----------|--------|
| `test_jupiter_quote_validation.js` (extend) | Quote-age stamping; route-change detection |
| `test_submit_retry_requote.js` (new) | E4 retry/re-quote; no blind rebroadcast; `maxSubmitRetries` wired |
| `test_realized_slippage_check.js` (new) | E2 warn **> 100 bps** / halt **> 200 bps** |
| `test_partial_fill_detection.js` (new) | E5 reject/reconcile gate |
| `test_priority_fee.js` (extend) | E8 priority fee **≤ 50%** of trade notional |
| `test_execution_time_liquidity_floor.js` (new) | E9 — reject **< $25,000** at submit |

**Suite requirement:** `run_safety_tests.js` (or project-equivalent full regression) **green before and after** implementation diff.

---

## 7. Required Invariants (Must Hold After Implementation)

| Invariant | Required value / behavior |
|-----------|---------------------------|
| `dryRunMode` | **true** by default (unchanged unless separately authorized) |
| `liveArmed` | **false** |
| `capitalExposure` | **none** |
| `supportsLiveReadiness` | **not claimed true** by R14 implementation work alone |
| Secret logging | **none** on any path |
| `OR-20260630-008` | **not_promoted** |
| LR-06 closure | R14 implementation **partially closes** enforcement gap; **does not** close arming authorization or live readiness |
| Liquidity floor scope | **Micro-live only** — scaling requires new liquidity/depth review |
| MEV scaling rule | Protected route **required** before scaling beyond first micro-live phase |

---

## 8. Implementation Sequencing (Recommended — Next Gate)

Per `R14 SLIPPAGE MEV IMPLEMENTATION PLANNING — 2026-07-05.md` §6:

1. **E4** — retry/re-quote + dead `maxSubmitRetries` fix (highest silent-risk)
2. **E1 + E3** — quote age + route re-validation
3. **E9** — execution-time liquidity floor ($25k)
4. **E2 + E5** — realized slippage + partial fill
5. **E8** — priority fee vs trade size
6. **E6 + E7** — MEV posture + audit fields
7. **Config harmonization** — may apply alongside or immediately before enforcement wiring; values in §4

Config-only harmonization without enforcement **does not close LR-06**.

---

## 9. Recommended Next Gate

**R14 Config + Enforcement Implementation**

Single reviewed diff: harmonize `live_config.json` + implement E1–E9 + required tests. Still no arming, capital, or live execution unless separately authorized.

---

## 10. Safety Confirmation

| Item | Value |
|------|-------|
| `.env` opened | **No** |
| Secrets inspected | **No** |
| `process.env` dumped | **No** |
| Code changed | **No** |
| Config changed | **No** |
| Runtime processes started | **No** |
| OR-20260630-008 status | **not_promoted** |
| Promotion authorized | **No** |
| Live readiness claimed | **No** |
| Human soak readiness claimed | **No** |
| Capital exposure enabled | **No** |

---

**Signed / confirmed by Taylor:** Taylor Cheaney (R14 implementation authorization, 2026-07-05)
