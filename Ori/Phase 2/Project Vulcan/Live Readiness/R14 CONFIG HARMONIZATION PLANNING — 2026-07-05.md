# R14 Config Harmonization Planning — 2026-07-05

Status:
**Planning complete — no config change, no implementation**

Gate type:
Doc-only config harmonization map — approved R14 policy → `live_config.json` and enforcement surfaces

Prerequisites:
`R14 POLICY DECISION SESSION — 2026-07-05.md` · `R14 SLIPPAGE MEV POLICY REVIEW — 2026-07-05.md` · `MICRO-LIVE RUNBOOK GAP REVIEW — 2026-07-05.md`

Decision authority (R14 policy):
**Taylor Cheaney** — recorded 2026-07-05

Live readiness achieved:
**No**

Human soak readiness:
**Not authorized**

OR-20260630-008:
**not_promoted** (unchanged)

**`live_config.json` modified:** **No** · **Code changed:** **No** · **Runtime processes started:** **No**

---

## 1. Files Inspected (read-only)

| File | Purpose |
|------|---------|
| `R14 POLICY DECISION SESSION — 2026-07-05.md` | Approved Taylor R14 values |
| `R14 SLIPPAGE MEV POLICY REVIEW — 2026-07-05.md` | Misalignment analysis |
| `MICRO-LIVE RUNBOOK GAP REVIEW — 2026-07-05.md` | RB-G4; arming dependency order |
| `live_config.json` | Current field values (structure only) |
| `live_executor.js` (grep) | Fields consumed: slippage, impact, retries, loss, position size |
| `docs/R14_SLIPPAGE_MEV_PROTECTION_REVIEW.md` | Draft policy reference |
| `docs/R8_RISK_CONTROLS_REVIEW.md` | Proposed micro-live caps |
| `docs/R12_MICRO_LIVE_READINESS_CHECKLIST.md` | Go/no-go; runbook refs |
| `docs/R13_FINAL_MICRO_LIVE_APPROVAL_GATE.md` | Approval record fields |

---

## 2. Purpose

Produce a **precise config-change map** for a future authorized implementation gate. This gate **does not apply** any changes.

Current posture remains: `PIPELINE_DRY_RUN` · `dryRunMode: true` · `liveArmed: false` · `capitalExposure: none`.

---

## 3. Config Harmonization Matrix

**Units note:** `live_executor.js` compares Jupiter `slippageBps / 100` to `maxEntrySlippagePct` / `maxExitSlippagePct` (percent). R14 bps → config percent: **100 bps = 1.0%**.

| Config field / policy surface | Current value | Approved R14 target | Change required | Apply gate required | Risk if not harmonized |
|------------------------------|---------------|---------------------|-----------------|---------------------|------------------------|
| **Quoted slippage cap (entry)** — `maxEntrySlippagePct` | **3%** (300 bps) | **1.0%** (100 bps default) | **Yes** — reduce to **1** | **R14 Config Harmonization Implementation Authorization** | Live entries at 3% quoted tolerance |
| **Quoted slippage cap (exit)** — `maxExitSlippagePct` | **5%** (500 bps) | **1.0%** (100 bps default) | **Yes** — reduce to **1** | Same | Loose exit fills |
| **Manual slippage override cap** | *(no field)* | **2.0%** (200 bps) — per-trade R15 ack | **New surface** — session/per-trade override flag or `maxManualSlippagePct` | **Pre-Arming Implementation Planning** → implementation gate | Cannot authorize 200 bps trades safely |
| **Hard reject slippage cap** | *(implicit via entry 3%)* | **≥ 3.0%** (300 bps) hard reject | **Enforcement** — reject before config ceiling; do not set config to 3% as “normal” | **R14 Slippage/MEV Implementation Planning** | Trades at 200–300 bps slip through |
| **Price impact warn** | *(no field)* | **> 1.0%** warn | **Implementation** — log/warn in submit path | Implementation gate | Silent high impact |
| **Price impact reject** — `maxRoutePriceImpactPct` | **10%** | **2.0%** hard reject | **Yes** — reduce to **2** | **R14 Config Harmonization Implementation Authorization** | 10% impact trades allowed at arming |
| **Quote freshness max age** | *(no field)* | **10 seconds** | **New field recommended:** `maxQuoteAgeMs: 10000` + executor enforcement | Implementation gate | Stale quote submits |
| **Retry count** — `maxSubmitRetries` | **1** | **2** max retries | **Yes** — increase to **2** (with re-quote rule in code) | Config auth gate + implementation | Under/over retry vs policy |
| **No blind rebroadcast** | *(no field)* | **Forbidden** | **Implementation** — intent id / dedup; not config-only | Implementation gate | MEV intent leakage |
| **Max per test trade** — `positionSizeSol` | **0.005 SOL** | **0.005 SOL** default | **No change** (already aligned) | Verify at apply gate | — |
| **Absolute per test trade cap** | Phase 1 guard ≤ **0.10** in code | **0.01 SOL** max with session ack | **Policy + R15 record**; optional `maxTradeSizeSol: 0.01` | Config auth + R13/R15 | Oversized live trades |
| **Session loss cap** | *(no dedicated field)* | **0.03 SOL** hard session stop | **New field recommended:** `maxSessionLossSol: 0.03` | Config auth gate | Session loss unbounded vs R14 |
| **Daily loss cap** — `maxDailyLossSol` | **0.1 SOL** | **0.03 SOL** for micro-live (session-aligned) | **Yes** — reduce to **0.03** at micro-live harmonization | **R14 Config Harmonization Implementation Authorization** | 0.1 SOL stop too loose for micro-live |
| **Daily loss count** — `maxDailyLossCount` | **3** | **2** consecutive losses (R14/R8) | **Consider** — align to **2** at harmonization | Config auth gate | Extra loss before stop |
| **Route rejection: mint mismatch** | Partial in `validateJupiterRoute` | **Reject** | **Implementation** (exists) — extend to live submit | Implementation gate | Wrong mint execution |
| **Route rejection: missing min output** | Partial in R14 helper | **Reject** | **Implementation** | Implementation gate | Unbounded min out |
| **Route rejection: route change w/o re-quote** | *(no field)* | **Reject unless re-quoted** | **Implementation** | Implementation gate | Stale route submit |
| **Route rejection: stale quote** | *(no field)* | **> 10 s reject** | **Implementation** + `maxQuoteAgeMs` | Implementation gate | Stale fills |
| **Partial-fill policy** | *(no field)* | **Abort if unobservable; reconcile before next trade** | **Implementation** + runbook | Implementation gate | Double position / drift |
| **Realized slippage warn** | *(no field)* | **> 100 bps** | **Implementation** — post-fill compare | Implementation gate | Late detection |
| **Realized slippage halt** | *(no field)* | **> 200 bps** session abort | **Implementation** | Implementation gate | Continued trading after bad fill |
| **Liquidity / depth floor** | *(no field)* | **`TBD_BLOCKING`** | **Decision gate first**; then config + enforcement | **Liquidity Threshold Decision Gate** | Illiquid pool trades |
| **MEV route posture** | *(no field)* | Micro-live: public OK if caps pass; protected preferred | **New field recommended:** `mevRouteMode: "public_micro_live"` or `"protected"` | Config auth + implementation | Sandwich exposure |
| **Priority fee vs trade size** | `maxPriorityFeeLamports` etc. | R14: reject if fee **> 50%** of trade | **Implementation** in `resolvePriorityFee` path | Implementation gate | Fee burn |
| **Token eligibility** — `thesis.*` | Defined | Unchanged for harmonization | **No R14 change** — R13/R15 ack | — | Out-of-thesis trades |
| **Immediate abort conditions (A1–A11)** | Partial (e-stop, daily stop) | Full R14 list | **Implementation** + runtime-health coupling | Pre-Arming Implementation Planning | Session continues after red flags |

---

## 4. Existing `live_config.json` Fields Mapped

| Field | Used by | R14 harmonization |
|-------|---------|-------------------|
| `maxEntrySlippagePct` | `validateJupiterRoute`, dry-run aborts | **Change 3 → 1** at apply gate |
| `maxExitSlippagePct` | Same | **Change 5 → 1** at apply gate |
| `maxRoutePriceImpactPct` | `validateJupiterRoute` | **Change 10 → 2** at apply gate |
| `maxDailyLossSol` | Daily stop logic | **Change 0.1 → 0.03** at apply gate |
| `maxDailyLossCount` | Daily stop logic | **Consider 3 → 2** at apply gate |
| `maxSubmitRetries` | Submit path | **Change 1 → 2** at apply gate + re-quote code |
| `positionSizeSol` | Size guards, submit | **Keep 0.005**; cap 0.01 via R15 |
| `maxOpenTrades` | Risk | **Keep 1** (aligned with R8/R13) |
| `maxPriorityFeeLamports` | Priority fee | Review at implementation (50% rule) |
| `thesis` | Scanner/eligibility | No R14 numeric change |
| `executionMode` / `dryRunMode` / `liveArmed` | Posture | **Do not change** until separate arming gate |

---

## 5. Missing Config / Enforcement Surfaces

### Recommended new config keys (future apply gate — not created now)

| Proposed key | Target value | Type |
|--------------|--------------|------|
| `maxQuoteAgeMs` | `10000` | Config |
| `maxSessionLossSol` | `0.03` | Config |
| `maxManualEntrySlippagePct` / `maxManualExitSlippagePct` | `2.0` | Config (override only with R15 ack) |
| `maxHardRejectSlippagePct` | `3.0` | Config or enforcement constant |
| `maxTradeSizeSol` | `0.01` | Config ceiling |
| `mevRouteMode` | `public_micro_live` (default micro-live) | Config |
| `priceImpactWarnPct` | `1.0` | Config (optional) |
| `realizedSlippageWarnBps` | `100` | Config or enforcement constant |
| `realizedSlippageHaltBps` | `200` | Config or enforcement constant |
| `minPoolLiquidityUsd` | **`TBD_BLOCKING`** | Config — blocked until decision |

### Implementation-only (no config sufficient alone)

- Re-quote before retry; no blind rebroadcast  
- Route-change detection between quote and submit  
- Partial-fill observability and abort  
- Post-trade reconciliation gate before next trade  
- R14 audit field capture on submit path  
- `capitalExposure` / `liveArmed` drift abort  
- Liquidity/spread qualitative rejects until numeric floor set  

---

## 6. Policy-Only vs Config-Only vs Implementation-Required

| Category | R14 items |
|----------|-----------|
| **Policy-only** (R13/R15/runbook; no config key) | Manual 200 bps per-trade ack; operator uncertainty abort; no blind rebroadcast rule; partial-fill reconcile-before-next-trade; MEV “protected required before scaling” beyond micro-live |
| **Config-only** (harmonize `live_config.json` at authorized apply gate) | `maxEntrySlippagePct` 1%; `maxExitSlippagePct` 1%; `maxRoutePriceImpactPct` 2%; `maxDailyLossSol` 0.03; `maxSubmitRetries` 2; `positionSizeSol` 0.005 verify; optional new keys in §5 |
| **Implementation-required** (code path before/at submit) | Quote age 10s; hard reject ≥300 bps; realized slippage warn/halt; route rejection suite; retry+re-quote; partial-fill abort; MEV route mode behavior; priority fee 50% cap; liquidity floor once **TBD_BLOCKING** resolved; live audit fields |

**Config harmonization alone does not close LR-06.** Enforcement gate still required.

---

## 7. Liquidity / Depth Floor

| Item | Status |
|------|--------|
| Numeric threshold | **Not decided** |
| Code | **`TBD_BLOCKING`** |
| Blocks arming | **Yes** — even after config harmonization |
| This gate | Records requirement only; **no placeholder value invented** |

---

## 8. Apply Gate Checklist (Future — Not This Gate)

Before any **R14 Config Harmonization Implementation Authorization**:

| # | Check |
|---|-------|
| 1 | Taylor authorization for explicit field diff (this planning note as reference) |
| 2 | `git status` clean or documented |
| 3 | `node run_safety_tests.js` green **before** and **after** apply |
| 4 | `node live_executor.js --status` — still `PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false` |
| 5 | `config_change_audit.jsonl` row expected for each write |
| 6 | No `executionMode` / `liveArmed` / `.env` changes in same gate |
| 7 | Liquidity **TBD_BLOCKING** still blocks arming even after apply |

---

## 9. LR-06 Status Update

| Blocker | After this gate |
|---------|-----------------|
| **LR-06** | **PARTIAL — HARMONIZATION PLANNED; APPLY + ENFORCEMENT + LIQUIDITY TBD OPEN** |

Config harmonization **mapped**; **not applied**.

---

## 10. Explicit Non-Actions

| Non-action | Confirmed |
|------------|-----------|
| Modify `live_config.json` | **No** |
| Modify `.env` | **No** |
| Modify runtime code | **No** |
| Start processes / live trading | **No** |
| Capital exposure / arming | **No** |
| OR promotion | **No** |
| Live readiness claim | **No** |

---

## 11. Recommended Next Gate

**Pre-Arming Implementation Planning**

---

## 12. Safety Confirmation

| Item | Value |
|------|-------|
| `.env` opened | **No** |
| Secrets inspected | **No** |
| `process.env` dumped | **No** |
| `live_config.json` changed | **No** |
| Code changed | **No** |
| Runtime processes started | **No** |
| OR-20260630-008 status | **not_promoted** |
| Promotion authorized | **No** |
| Live readiness claimed | **No** |
| Human soak readiness claimed | **No** |
| Capital exposure enabled | **No** |

---

**Signed / confirmed by Taylor:** Taylor Cheaney (config harmonization planning, 2026-07-05)
