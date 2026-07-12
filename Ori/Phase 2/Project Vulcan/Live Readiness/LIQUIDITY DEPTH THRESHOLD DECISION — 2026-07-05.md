# Liquidity / Depth Threshold Decision — 2026-07-05

Status:
**Decision-support research complete — Taylor sign-off recorded 2026-07-05 (micro-live only); no config change, no code change**

Gate type:
Doc-only options analysis for the `TBD_BLOCKING` liquidity floor identified in `R14 CONFIG HARMONIZATION PLANNING — 2026-07-05.md` §4/§7

Prerequisites:
`R14 CONFIG HARMONIZATION PLANNING — 2026-07-05.md` · `R14 SLIPPAGE MEV IMPLEMENTATION PLANNING — 2026-07-05.md` (E9)

Decision authority:
**Taylor Cheaney** — **signed off 2026-07-05** — see `R14 LIQUIDITY DEPTH THRESHOLD TAYLOR SIGN-OFF — 2026-07-05.md`

Session tool:
Claude/Cowork (logged separately in Cursor Run Log for provenance)

Live readiness achieved:
**No**

**Code changed:** **No** · **Config changed:** **No** · **Runtime processes started:** **No**

---

## 1. Files / Data Inspected (read-only)

| Source | What it shows |
|---|---|
| `scanner_gmgn_trending.js` (L30–31, 285, 337) | Existing candidate-selection floor: `MIN_LIQUIDITY = 25000`, `MIN_POOL_LIQUIDITY = 25000` — already rejects candidates below $25k pool liquidity **before they ever reach the pipeline** |
| `near_misses.json` (last 500 rows with a `liquidity` field) | Rejected-but-close candidates: min **$25,022**, p25 **$28,067**, median **$35,670**, p75 **$61,462**, max **$244,653** |
| `paper_trades.json` (180 rows) | Candidates that actually entered the pipeline: min **$25,314**, p10 **$27,474**, median **$57,598**, max **$3.97M** |
| `live_config.json` | `positionSizeSol: 0.005`, absolute cap `0.01` (R14 policy) |

**Trade notional context:** at ~$150/SOL, a 0.005–0.01 SOL trade is **~$0.75–$1.50 USD notional**. Every observed candidate pool, including the smallest near-misses, is 15,000–160,000× larger than the trade itself.

---

## 2. Reframing the Question

The original R14 discussion treated "liquidity floor" as if it were primarily a **slippage-from-trade-size** control (the trade is big enough to move the pool). At these trade sizes, that framing doesn't hold — the position is economically negligible relative to every pool the scanner has ever passed. Price impact at this size is a function of **route/quote mechanics** (already covered by the 1–2% impact caps), not of the trader's own footprint.

What a liquidity floor actually protects against here is different:

1. **Rug / manipulated pool risk** — a pool can look adequately deep in aggregate stats while being one or two wallets away from being drained
2. **Staleness risk** — liquidity is measured at **scan time** by `scanner_gmgn_trending.js`; by the time the executor reaches submit, seconds to minutes may have passed in a fast-moving meme market, and the pool the scanner saw may no longer exist in the same state
3. **Data-quality risk** — a bad liquidity read on the source API could pass a nominally-fine number through unchecked

None of these are solved by simply picking a bigger dollar number. That distinction matters for the decision below.

---

## 3. Options for Taylor

| Option | Definition | Pros | Cons |
|---|---|---|---|
| **A — Reuse scanner floor** | Set execution-time `minPoolLiquidityUsd` = **$25,000**, identical to the existing scanner constant | Simple; no new judgment call; consistent single source of truth; avoids unnecessary complexity | Purely redundant with the scanner check unless liquidity is **re-read** at execution time (see §4) — on its own, re-checking the same static number against possibly-stale data adds little |
| **B — Higher execution-time floor** | Set a stricter number than the scanner (e.g. **$35,000**, the observed near-miss median) to build in margin for drift between scan and submit | Some cushion against a pool that's drained partway | Number is arbitrary without a study of *how fast* these pools actually drain between scan and submit — no such data exists in this repo yet |
| **C — Ratio-based floor (liquidity ≥ N× position size)** | e.g. require pool liquidity ≥ 10,000× trade notional | Common pattern in trading-bot literature | **Not meaningful at this trade size** — every historical candidate already clears a 15,000×+ ratio, so this constraint would never bind. Recommend **against** this option for micro-live; revisit if/when position size scales up materially |
| **D — Freshness check instead of/alongside a static number** | Reject if the liquidity figure used for the trade decision is older than a defined age (e.g. same 10s quote-freshness window as E1), forcing a fresh liquidity read at execution time rather than trusting the scan-time value | Directly addresses the actual failure mode (drift/staleness) identified in §2; reuses the quote-freshness pattern already decided for E1 | Requires a live liquidity re-read call at execution time (new dependency), not just a config comparison |

---

## 4. Recommendation (Analysis, Not a Decision)

As a reviewer: **Option A + Option D combined**, not B or C.

- Reuse the existing, already-proven **$25,000** figure (Option A) rather than inventing a new number — it's already the bar every historical candidate had to clear, and introducing a second, different threshold for the same underlying risk adds complexity without a data-backed reason (per your own stated preference to avoid unnecessary complexity).
- Add the **freshness requirement** (Option D) as the actual fix for the risk that matters here — a pool draining between scan and submit is a timing problem, not a magnitude problem. Reusing the same 10-second quote-age pattern already decided for E1 keeps the implementation surface small and consistent.
- Treat Option B (raising the number) as unnecessary unless a future observation period specifically shows pools crossing from "adequate" to "thin" within the scan-to-submit window at the current $25k line — that would be evidence-driven, not a guess.
- Recommend **against** Option C at current trade sizes; flag it explicitly for reconsideration if position size is ever increased beyond the micro-live phase, where the ratio could start to bind.

**Recommendation accepted (Taylor sign-off 2026-07-05):** Option A + Option D — **$25,000** micro-live floor with fresh submit-time check. See §4a and `R14 LIQUIDITY DEPTH THRESHOLD TAYLOR SIGN-OFF — 2026-07-05.md`.

---

## 4a. Taylor Sign-Off (2026-07-05)

**Decision recorded** in `R14 LIQUIDITY DEPTH THRESHOLD TAYLOR SIGN-OFF — 2026-07-05.md`.

| Item | Value |
|------|-------|
| Micro-live minimum pool liquidity | **$25,000 USD** (reuse scanner floor) |
| Submit-time check | **Required** — fresh quote/route/liquidity at execution |
| Scope | **Micro-live only** |
| Scaling beyond micro-live | **New liquidity/depth review required** |
| `TBD_BLOCKING` (micro-live) | **Resolved** |
| Arming still blocked | **Yes** — R14 config harmonization + enforcement implementation remain open |

---

## 5. What This Gate Does Not Do

| Non-action | Confirmed |
|---|---|
| Set `minPoolLiquidityUsd` in `live_config.json` | **No** |
| Implement `checkExecutionTimeLiquidity()` (E9, per implementation-planning doc) | **No** |
| Modify `scanner_gmgn_trending.js` constants | **No** |
| Modify `.env` | **No** |
| Start runtime / loops | **No** |
| Capital exposure / arming | **No** |
| Claim live readiness | **No** |

---

## 6. Recommended Next Gate

~~Bring this doc to **Taylor for an explicit numeric/option decision**~~ **Complete** — see sign-off note.

Next: **R14 Implementation Authorization** (config harmonization + enforcement; no arming/capital unless separately authorized).

---

## 7. Safety Confirmation

| Item | Value |
|---|---|
| `.env` opened | **No** |
| Secrets inspected | **No** |
| Config changed | **No** |
| Code changed | **No** |
| Runtime processes started | **No** |
| Numeric threshold decided | **Yes — $25,000 micro-live (Taylor sign-off 2026-07-05)** |
| Live readiness claimed | **No** |
| Capital exposure enabled | **No** |

---

*Prepared for Taylor review — 2026-07-05 (Claude/Cowork planning session).*
