# R14 Slippage/MEV Policy Review — 2026-07-05

Status:
**Review complete — no runtime, no capital, no readiness claim**

Gate type:
Doc/review only — slippage, MEV, quote safety, execution protection, abort policy

Prerequisites:
`LIVE READINESS PREPARATION PLANNING — 2026-07-05.md` · `A1 STATE DURABILITY DRILL PLANNING — 2026-07-05.md`

Live readiness achieved:
**No**

Human soak readiness:
**Not authorized**

OR-20260630-008:
**not_promoted** (unchanged)

**Code changed:** **No** · **Runtime processes started:** **No**

---

## 1. Files Inspected (read-only)

| File | Purpose |
|------|---------|
| `LIVE READINESS PREPARATION PLANNING — 2026-07-05.md` | LR-06 blocker; authorization sequence step 3 |
| `A1 STATE DURABILITY DRILL PLANNING — 2026-07-05.md` | Parallel track; no R14 runtime |
| `docs/R14_SLIPPAGE_MEV_PROTECTION_REVIEW.md` | Canonical R14 draft policy |
| `docs/R12_MICRO_LIVE_READINESS_CHECKLIST.md` | R14 §9 cross-ref; go/no-go slippage/MEV items |
| `docs/R8_RISK_CONTROLS_REVIEW.md` | Session/trade loss caps (proposed, not armed) |
| `ACTIVE_MANIFEST.md` | R14 helper; manifest R14 status line |
| `r14_slippage_mev_review.js` | Fixture evaluator + `SLIPPAGE_MEV_POLICY` defaults |
| `live_executor.js` (grep/read) | `validateJupiterRoute`, priority fee, dry-run audit fields |
| `live_config.json` (structure only — no secrets) | Current slippage/impact/retry/thesis fields |

---

## 2. R14 Policy Requirements Summary

Before any future micro-live or capital-exposure gate, the following must be **defined, decided, and (before submit) enforced**:

| Domain | Requirement |
|--------|-------------|
| **Max slippage** | Default cap, high-vol exception, hard reject, realized warn/halt |
| **Quote freshness** | Max quote age; re-quote before sign/submit; reject stale |
| **Route validation** | Mint match; route change rejection; min output present |
| **Liquidity / depth** | Pool liquidity floor; spread width rejection |
| **Price impact** | Warn and hard-reject thresholds |
| **MEV / sandwich** | Submit path posture (public vs protected); no intent-exposing retries |
| **Priority fee / compute** | Cap vs trade size; max retries; no infinite retry |
| **Retry behavior** | Bounded retries; no repeated broadcast of same intent |
| **Partial fills** | Confirm-before-position-write; no position write without on-chain confirm |
| **Token eligibility** | Thesis bounds + operator ack (R12/R13) |
| **Abort triggers** | Slippage halt, route failures, emergency stop, stale wallet, singleton violation |
| **Logging / audit** | Safe quote/submit fields; never log signer material |

---

## 3. Current Repo / Docs Coverage

### Defined in R14 doc + `r14_slippage_mev_review.js` (draft — not armed)

| Policy | R14 draft value |
|--------|-----------------|
| Default slippage cap | **100 bps (1%)** |
| High-vol exception | **200 bps** (manual approval) |
| Hard reject slippage | **> 300 bps** |
| Realized slippage warn / halt | **100 / 200 bps** |
| Price impact warn / reject | **1% / 2%** |
| Quote max age | **10 s** (5–10 s range in doc) |
| Priority fee vs trade | Reject if **> 50%** of trade size |
| Max retries | **2** (R14 doc); helper `maxRetries: 2` |
| MEV route | Design only — public RPC higher risk; private/Jito **future** |
| Stop conditions | §8 list (slippage, route, MEV suspicion, fees, liquidity, e-stop, etc.) |
| Logging | §7 safe field list |

### Partial runtime (dry-run pipeline — not live submit)

| Component | Coverage |
|-----------|----------|
| `live_executor.js` `validateJupiterRoute` | Enforces `maxEntrySlippagePct`, `maxExitSlippagePct`, `maxRoutePriceImpactPct` from **`live_config.json`** on quoted routes in pipeline path |
| Pipeline dry-run audit | Records `quotedSlippageBps` — observation only |
| Priority fee resolution | `resolvePriorityFee` with caps from config — **not live-validated with real submit** |
| R14 fixture helper | `evaluateQuote` on fixtures — **no network** |

### Current `live_config.json` (dry-run operational — **not** R14 micro-live caps)

| Field | Current value | R14 micro-live draft | Alignment |
|-------|---------------|----------------------|-----------|
| `maxEntrySlippagePct` | **3%** (300 bps) | 1% default | **Misaligned — looser** |
| `maxExitSlippagePct` | **5%** (500 bps) | 1% default | **Misaligned — looser** |
| `maxRoutePriceImpactPct` | **10%** | 2% hard reject | **Misaligned — looser** |
| `maxSubmitRetries` | **1** | 2 max (R14) | Partially aligned |
| `positionSizeSol` | **0.005** | R8/R13 ~0.005–0.01 | Directionally aligned |
| `maxDailyLossSol` | **0.1** | R8/R13 session caps lower for micro-live | **Needs micro-live decision** |
| `thesis` bounds | Defined | Token eligibility | **Defined for scanner/thesis** |
| Quote age enforcement | **Not in config** | 10 s | **Missing in runtime config path** |
| MEV protection mode | **Not in config** | Decision required | **Missing** |
| Realized slippage halt | **Not in runtime** | R14 §2 | **Missing enforcement** |

### R8 / R12 (capital bounds — proposed, not armed)

| Control | Proposed (R8/R12/R13) |
|---------|------------------------|
| First trade size | **0.005–0.01 SOL** |
| Session allocation max | **0.05 SOL** |
| Session drawdown stop | **0.03 SOL** |
| Max open positions | **1** |
| Max trades first session | **1**, then review |

**Not written to micro-live config section; not enforced for live submit today.**

---

## 4. Missing Decisions / Gaps

| Gap ID | Gap | Type |
|--------|-----|------|
| R14-G1 | **R14 draft caps vs `live_config.json` dry-run caps** — which apply at arming? | **Policy decision** |
| R14-G2 | **MEV submit posture** — public RPC vs protected route for first micro-live | **Policy decision** |
| R14-G3 | **Quote freshness** — 5 s vs 10 s; runtime enforcement hook | **Decision + implementation** |
| R14-G4 | **Liquidity/depth minimums** — numeric floors not specified in R14 | **Policy decision** |
| R14-G5 | **Route rejection rules** — partial implementation in executor; R14 helper flags not wired to live submit | **Implementation** |
| R14-G6 | **Realized slippage tracking** — halt after fill not implemented | **Implementation** |
| R14-G7 | **Partial-fill policy** — R12 runbook says confirm-before-position-write; not live-drilled | **Runbook + drill** |
| R14-G8 | **Real quote / routing fixtures** — B2A 12h had **zero** pipeline dry-run events in window | **Evidence** (deferred) |
| R14-G9 | **R14 runtime enforcement gate** — policy defined ≠ armed in submit path | **Implementation gate** |
| R14-G10 | **Taylor R13 ack fields** — slippage cap + MEV plan must be signed | **Authorization** |

---

## 5. Policy Matrix

| Policy area | Current status | Existing evidence / doc | Missing decision | Required future gate | Risk if skipped |
|-------------|----------------|---------------------------|------------------|----------------------|-----------------|
| **Slippage cap (quoted)** | Draft 100 bps; config 3%/5% | R14 doc; `r14_slippage_mev_review.js`; `live_executor.js` uses config | Harmonize micro-live caps vs dry-run config | **R14 Policy Decision Session** | Excessive slippage on live entry/exit |
| **Price impact cap** | Draft 2% reject; config 10% | R14 doc; `validateJupiterRoute` | Taylor picks micro-live `maxRoutePriceImpactPct` | **R14 Policy Decision Session** | Large impact losses on thin pools |
| **Quote freshness** | Draft 10 s | R14 §6; helper `maxQuoteAgeMs` | 5 vs 10 s; enforcement point | **R14 Policy Decision Session** → **R14 Implementation Planning** | Stale quote fills |
| **Route validation** | Partial in executor | Mint/slippage/impact checks | Wire R14 finding codes to submit abort | **R14 Slippage/MEV Implementation Planning** | Bad route / mint mismatch |
| **Liquidity / depth** | Qualitative reject flags in helper | R14 §2; fixture `liquidityTooLow` | Numeric minimums for memecoins | **R14 Policy Decision Session** | Trades in illiquid pools |
| **Spread width** | Fixture flag only | R14 §2 | Numeric spread cap | **R14 Policy Decision Session** | Wide-spread bad fills |
| **MEV / sandwich posture** | Design only | R14 §4 | Public vs protected for session 1 | **R14 Policy Decision Session** | Sandwich losses |
| **Priority fee / compute** | Config caps exist | `live_config.json`; R14 §5; `resolvePriorityFee` | Confirm 50% rule + micro-live lamport caps | **R14 Policy Decision Session** | Fee eats allocation |
| **Retry / timeout** | `maxSubmitRetries: 1`; R14 max 2 | Config + R14 §5 | Unified retry policy; no intent re-broadcast | **R14 Policy Decision Session** | MEV intent leakage |
| **Partial fills** | Runbook draft | R12 §11 | Explicit abort/hold rules | **Micro-Live Runbook Gap Review** | Wrong position state |
| **Token eligibility** | Thesis in config | `live_config.json` thesis; scanner filters | Operator ack in R13 | **R13 Final Micro-Live Approval Review** | Out-of-thesis live trades |
| **Session / trade loss caps** | R8/R12 proposed | R8 doc; partial config daily stop | Micro-live session caps vs config 0.1 SOL daily | **R14 Policy Decision Session** + R13 | Over-loss on first session |
| **Abort triggers (immediate)** | R14 §8 listed | R11 e-stop simulation | Map to runtime halt hooks pre-submit | **R14 Implementation Planning** | Session continues after red flags |
| **Logging / audit** | R14 §7 defined | Pipeline audit partial | Live submit safe logging implementation | **R14 Implementation Planning** | Secret leak or no forensics |
| **Fixture / simulated routing** | Helper exists | `r14_slippage_mev_review.js` | Run fixtures when authorized (no network) | **R14 Simulated Routing Review** (future) | Untested policy edge cases |
| **Live enforcement** | **NOT IMPLEMENTED** | Manifest: DEFINED NOT IMPLEMENTED | Full submit-path gate stack | **R14 Slippage/MEV Implementation Planning** | Policy on paper only |

---

## 6. Minimum Required R14 Decisions Before Any Arming Gate

These must be **explicitly decided** (Taylor / R13 record) before step 7 arming. **This gate does not decide them.**

| # | Decision | R14 draft default (starting point) |
|---|----------|-----------------------------------|
| 1 | **Slippage cap (quoted)** | **100 bps** default; **200 bps** max with per-trade manual ack; hard reject **300 bps** |
| 2 | **Price impact cap** | Warn **1%**; hard reject **2%** (override dry-run **10%** for micro-live) |
| 3 | **Quote age / freshness** | **10 s** max before re-quote; reject if stale |
| 4 | **Liquidity / depth minimum** | Define pool-liquidity floor + spread cap (TBD numeric — **missing today**) |
| 5 | **Route rejection rules** | Reject: mint mismatch, missing min output, route change, unstable route |
| 6 | **MEV / sandwich protection posture** | Session 1: **public RPC + tiny size + strict caps** **or** defer live until protected route — **must choose** |
| 7 | **Retry / timeout policy** | Max **2** attempts; **no** repeated broadcast; explicit tx expiry handling |
| 8 | **Max capital per test trade** | **0.005–0.01 SOL** (align R8/R13; config already 0.005) |
| 9 | **Daily / session loss cap** | **0.03 SOL** session drawdown (R12/R13) vs config **0.1 SOL** — **must harmonize for micro-live** |
| 10 | **Immediate abort conditions** | Realized slippage halt **200 bps**; quote stale; impact reject; e-stop; wallet stale; singleton violation; safety suite fail |

**Implementation of decisions** is a **separate** gate — not in this review.

---

## 7. R14 Status Classification

### **Partial / needs policy decisions**

| Dimension | Assessment |
|-----------|------------|
| Policy documentation | **Sufficient for micro-live planning docs** |
| Fixture helper | **Exists** — not evaluated against live market in B2A 12h (quiet) |
| Runtime enforcement | **Blocked pending implementation** — LR-06 remains open |
| Config alignment | **Needs policy decisions** — dry-run config looser than R14 micro-live draft |
| MEV route | **Blocked pending external tooling decision** (public vs protected) |
| Live readiness | **Not achieved** |

**Not classified as:**
- ~~Sufficient for arming~~ (implementation + decisions missing)
- ~~Blocked pending implementation only~~ (decisions also missing)
- ~~Blocked pending external tooling only~~ (partial — MEV path is one sub-blocker)

---

## 8. LR-06 Update

| Blocker | Prior | After this gate |
|---------|-------|-----------------|
| **LR-06** R14 slippage/MEV | DEFINED — NOT IMPLEMENTED | **PARTIAL — POLICY REVIEWED; DECISIONS + IMPLEMENTATION OPEN** |

Authorization sequence **step 3** (slippage/MEV policy decision) remains **open**.

---

## 9. Explicit Non-Actions

| Non-action | Confirmed |
|------------|-----------|
| Config / `.env` changes | **No** |
| Live execution / arming | **No** |
| Capital exposure | **No** |
| OR promotion | **No** |
| Live readiness claim | **No** |
| Runtime / observation | **No** |

---

## 10. Recommended Next Gate

**Micro-Live Runbook Gap Review**

Doc/review only — maps R12 §11 runbook + R8/R14/R13 fields into LR-08 gaps without runtime; **R14 Policy Decision Session** follows when Taylor is ready to record cap/MEV choices (can be same session or next).

---

## 11. Safety Confirmation

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

**Signed / confirmed by Taylor:** Taylor Cheaney (R14 review gate, 2026-07-05)
