# R14 Policy Decision Session — 2026-07-05

Status:
**Decision session complete — policy recorded; no implementation, no config change**

Gate type:
Human policy decision record (Taylor) — slippage, MEV, route safety for future micro-live planning

Prerequisites:
`R14 SLIPPAGE MEV POLICY REVIEW — 2026-07-05.md` · `MICRO-LIVE RUNBOOK GAP REVIEW — 2026-07-05.md`

Decision authority:
**Taylor Cheaney**

Live readiness achieved:
**No**

Human soak readiness:
**Not authorized**

OR-20260630-008:
**not_promoted** (unchanged)

**Code changed:** **No** · **Runtime processes started:** **No** · **`live_config.json` modified:** **No**

---

## 1. Files Inspected (read-only)

| File | Purpose |
|------|---------|
| `R14 SLIPPAGE MEV POLICY REVIEW — 2026-07-05.md` | Prior gap analysis; misalignment with `live_config.json` |
| `MICRO-LIVE RUNBOOK GAP REVIEW — 2026-07-05.md` | RB-G3; dependency order before arming |
| `docs/R14_SLIPPAGE_MEV_PROTECTION_REVIEW.md` | Canonical R14 draft reference |

---

## 2. Session Purpose

Record **explicit Taylor R14 policy decisions** for future micro-live planning, config harmonization, and implementation review.

This gate:
- **Does** close the **policy decision** portion of authorization sequence step 3 (LR-06 decisions)
- **Does not** implement enforcement, change config, arm live, or authorize capital

---

## 3. R14 Policy Decisions (Taylor — Recorded)

### 3.1 Slippage cap

| Rule | Decision |
|------|----------|
| Default quoted slippage cap | **100 bps (1.0%)** |
| Manual approval allowed up to | **200 bps (2.0%)** — per-trade operator ack required |
| Hard reject | **≥ 300 bps (3.0%)** |
| Realized slippage warn (reference) | **> 100 bps** — halt per §3.11 |
| Realized slippage halt (reference) | **> 200 bps** — immediate abort |

### 3.2 Price impact

| Rule | Decision |
|------|----------|
| Warn | **> 1.0%** |
| Hard reject | **> 2.0%** |
| Config harmonization | Current `live_config.json` **`maxRoutePriceImpactPct: 10`** is **not acceptable** for micro-live; **must be overridden to ≤ 2% hard reject before any arming gate** |

### 3.3 Quote freshness

| Rule | Decision |
|------|----------|
| Max quote age before submit | **10 seconds** |
| Re-quote required | If quote age exceeded or route/output changes before submit |

### 3.4 Liquidity / depth minimum

| Rule | Decision |
|------|----------|
| Numeric pool liquidity/depth floor | **`TBD_BLOCKING`** |
| Rationale | Repo lacks a safe exact on-chain metric and validated threshold; conservative placeholder only |
| Requirement before arming | **Explicit numeric threshold must be decided** in a future gate; micro-live arming **blocked** until resolved |
| Interim runbook rule | Reject if liquidity suspicious, spread too wide, or quote impact/route unstable per R14 fixture semantics |

### 3.5 Route rejection rules

Reject (no submit) if any:

| Condition | Decision |
|-----------|----------|
| Mint mismatch | **Reject** |
| Missing min-output guarantee | **Reject** |
| Route change between quote and submit | **Reject unless re-quoted** and re-approved |
| Stale quote (> 10 s) | **Reject** |
| Price impact over hard cap (> 2%) | **Reject** |
| Route unstable / spread too wide (qualitative) | **Reject** until numeric liquidity rule set |

### 3.6 MEV posture

| Scope | Decision |
|-------|----------|
| **Micro-live only** | **Public RPC allowed** for tiny test size **only if** all slippage/impact/quote caps pass |
| Preference | **Protected route preferred** when available without unsafe credential handling |
| Beyond micro-live | **Protected route required** before any scaling beyond first micro-live phase |
| Retry discipline | **No blind intent re-broadcast** (see §3.7) |

### 3.7 Retry policy

| Rule | Decision |
|------|----------|
| Max retries | **2** |
| Blind intent re-broadcast | **Forbidden** |
| Before retry | **Re-quote required** if quote expired or route changed |
| Failed attempt | **No repeated broadcast** of same intent |

### 3.8 Partial fills

| Rule | Decision |
|------|----------|
| If partial fill not supported/observable | Treat as **reject/abort condition** |
| Before next trade | **Post-trade reconciliation required**; do not proceed until reconciled |

### 3.9 Max per test trade

| Rule | Decision |
|------|----------|
| Default max per test trade | **0.005 SOL** |
| Absolute max | **0.01 SOL** — **only** with explicit per-session Taylor approval in R13/R15 record |

### 3.10 Session loss cap

| Rule | Decision |
|------|----------|
| Hard session stop | **0.03 SOL** total session loss |
| Config harmonization | Current `live_config.json` **`maxDailyLossSol: 0.1`** is **not acceptable** for micro-live session; **must be harmonized to session cap (0.03 SOL) before any arming gate** |
| Note | Session cap is **authorized risk**, not wallet balance |

### 3.11 Immediate abort conditions

Stop session / reject trade immediately if any:

| # | Condition |
|---|-----------|
| A1 | Realized slippage above cap (halt **200 bps**; default quoted cap **100 bps** unless manual **200 bps** ack) |
| A2 | Stale quote (> **10 s**) |
| A3 | Route mismatch or route change without re-quote |
| A4 | Unexpected token / mint |
| A5 | Missing on-chain confirmation |
| A6 | Failed position write |
| A7 | Reconciliation mismatch |
| A8 | `liveArmed` / config drift vs approved session record |
| A9 | `capitalExposure` mismatch vs approved bounds |
| A10 | `secretRisk` flagged on any path |
| A11 | Operator uncertainty — **manual reject** |

Plus standard safety aborts: `emergencyStop`, singleton violation, duplicate loop, safety suite fail, wallet monitor stale (R12/R15).

---

## 4. Liquidity / Depth Threshold Status

| Item | Status |
|------|--------|
| Numeric threshold decided | **No** |
| Status code | **`TBD_BLOCKING`** |
| Blocks micro-live arming | **Yes** — until explicit numeric threshold gate |
| Blocks this decision session | **No** — all other R14 decisions recorded |

---

## 5. Config Harmonization Requirements (Future Gate — Not This Gate)

Current `live_config.json` dry-run values **must not be armed** for micro-live until harmonized:

| Field | Current (dry-run) | Required before arming (Taylor R14) | Action |
|-------|-------------------|-------------------------------------|--------|
| `maxEntrySlippagePct` | **3%** (300 bps) | **≤ 1%** default; manual ack to **2%** | Harmonize in future config gate |
| `maxExitSlippagePct` | **5%** (500 bps) | **≤ 1%** default; manual ack to **2%** | Harmonize |
| `maxRoutePriceImpactPct` | **10%** | **≤ 2%** hard reject | Harmonize |
| `maxDailyLossSol` | **0.1 SOL** | **0.03 SOL** session cap | Harmonize |
| Quote max age | **Not in config** | **10 s** enforcement | Add in implementation/harmonization gate |
| MEV route mode | **Not in config** | Per §3.6 | Add in harmonization gate |
| Micro-live trade size | `positionSizeSol: 0.005` | Align with §3.9 | Verify at harmonization; do not arm at **0.01** without session ack |

**This gate does not modify `live_config.json` or `.env`.**

Future gate: **R14 Config Harmonization Planning** — document exact field mapping and arming-gate checklist only (still no apply unless separate authorization).

---

## 6. Enforcement Requirements (Future Gate — Not This Gate)

Before any submit path or arming, implementation must enforce:

| # | Requirement |
|---|-------------|
| E1 | **Quote age** — reject submit if age **> 10 s**; re-quote before retry |
| E2 | **Realized slippage halt** — abort session if realized **> 200 bps**; warn **> 100 bps** |
| E3 | **Route validation** — mint match, min output, route stability, impact ≤ 2% |
| E4 | **Retry behavior** — max **2** retries; no blind re-broadcast; re-quote on expiry/route change |
| E5 | **Partial-fill handling** — reject/abort if unobservable; reconciliation before next trade |
| E6 | **MEV posture** — public RPC only under micro-live caps; log route mode safely |
| E7 | **Audit evidence** — timestamp, route summary, slippage bps, impact, quote age, decision, tx id post-submit only; **no secrets** |
| E8 | **Priority fee cap** — retain R14 draft **50% of trade size** rule at implementation review |
| E9 | **Liquidity floor** — enforce numeric threshold once **TBD_BLOCKING** resolved |

Future gate: **R14 Slippage/MEV Implementation Planning** (after harmonization planning).

---

## 7. LR-06 Status Update

| Blocker | Prior | After this gate |
|---------|-------|-----------------|
| **LR-06** R14 slippage/MEV | PARTIAL — decisions + implementation open | **PARTIAL — DECISIONS RECORDED; IMPLEMENTATION + LIQUIDITY TBD + CONFIG HARMONIZATION OPEN** |

Authorization sequence step 3: **policy decisions recorded**; **implementation and liquidity numeric threshold remain open**.

---

## 8. Explicit Non-Actions

| Non-action | Confirmed |
|------------|-----------|
| Modify `live_config.json` | **No** |
| Modify `.env` | **No** |
| Implement submit-path enforcement | **No** |
| Start runtime / loops | **No** |
| Enable live mode / `liveArmed` | **No** |
| Capital exposure | **No** |
| OR promotion | **No** |
| Live readiness claim | **No** |
| Human soak readiness claim | **No** |
| Inspect secrets / dump `process.env` | **No** |

---

## 9. Recommended Next Gate

**R14 Config Harmonization Planning**

---

## 10. Safety Confirmation

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

**Signed / confirmed by Taylor:** Taylor Cheaney (R14 policy decisions, 2026-07-05)
