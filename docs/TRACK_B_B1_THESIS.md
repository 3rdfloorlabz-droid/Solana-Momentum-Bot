# Track B B1 — Thesis: Close Track A, Open Research

**Module:** TracktaOS — Solana Momentum Bot + FOMO Project  
**Document type:** Strategic thesis — research and planning only  
**Date:** 2026-06-29  
**Verdict:** **B1 THESIS DEFINED — TRACK A ENGINEERING PROOF CLOSED — LIVE TRADING NOT APPROVED**

**Prior gates:**  
- [R43E Real Proof](./R43E3_OPERATOR_BROADCAST_DEPS.md) — `R43E_REAL_PROOF_ATTEMPTED`  
- [R43F Post-Transaction Audit](./R43F_POST_TRANSACTION_AUDIT.md) — `R43F_POST_TRANSACTION_AUDIT_PASSED`  
- [R7 Strategy Performance Edge Review](./R7_STRATEGY_PERFORMANCE_EDGE_REVIEW.md) — **NOT ENOUGH DATA**  
- [FOMO Strategic Pivot and Engine Roadmap](./FOMO_STRATEGIC_PIVOT_AND_ENGINE_ROADMAP.md)

**Evidence artifacts (read-only):**  
- `analysis/r43e_real_proof_review.json`  
- `analysis/r43f_post_transaction_audit.json`  
- `analysis/r7_strategy_metrics.json`  
- `soak_runs/r6a_24h_soak_summary.json`

**Live trading:** **NOT APPROVED**  
**Strategy approval:** **NOT APPROVED**  
**This document does not submit transactions, arm live trading, or change posture.**

---

## Executive summary

Track A answered the engineering question: **can this team build, harden, govern, and execute one controlled real transaction without breaking safety posture?** The answer is **yes**, as confirmed by R43E and R43F.

Track A did **not** answer the strategy question: **does this momentum thesis produce repeatable, fee- and slippage-adjusted edge at deployable size?** R7 remains **NOT ENOUGH DATA**.

Track B begins here. The product direction is **decision intelligence first, execution second** — measuring signal quality, liquidity capacity, and execution realism before any future capital or live-trading discussion.

**Recommended next milestone:** **B2 — Data collection plan** — see [Track B B2 Data Collection Plan](./TRACK_B_B2_DATA_COLLECTION_PLAN.md). Next after B2 execution: **B3 smart-wallet scoring model**.

---

## Current safety posture (unchanged)

| Field | Value |
|-------|-------|
| `executionMode` | `PIPELINE_DRY_RUN` |
| `dryRunMode` | `true` |
| `liveArmed` | `false` |
| `liveSubmission` | `DISARMED` |
| `recovery_actions.jsonl` | absent |
| `live_positions.json` | empty |
| Safety suite | **66/66** |
| R7 verdict | **NOT ENOUGH DATA** |

---

## 1. What did Track A prove?

Track A proved **operational and engineering capability**, not strategy profitability.

| Proof area | Evidence | Outcome |
|------------|----------|---------|
| System stability under dry-run | R6a 24h soak **PASS** | Posture stable; checkpoints green |
| Safety infrastructure | 66/66 safety tests; guardrails R39–R43 | Gates, caps, preflight, audit path built |
| Human-in-the-loop control | R43E required `--human-present`, `--confirm-one-transaction-proof`, `--final-broadcast-confirmation` | No silent broadcast |
| Isolated one-transaction proof | R43E `R43E_REAL_PROOF_ATTEMPTED`; signature recorded; `proofStoppedAfterFirstAttempt: true` | Exactly one broadcast; no retry loop |
| Post-transaction audit | R43F `R43F_POST_TRANSACTION_AUDIT_PASSED`; 0 blockers | Engineering proof behaved correctly |
| Signer hygiene | Public key only in audit; keyfile outside repo; no secret fields in analysis | No secret leakage in proof artifacts |
| No live_executor integration | Proof path used isolated operator broadcast deps | Normal trading loop not armed |
| No trading state mutation | `live_positions.json` empty; `recovery_actions.jsonl` absent; posture dry-run/disarmed after proof | Proof did not promote to live trading |
| Dedicated RPC candidate for proof | R43E used operator local RPC config (redacted in audit) | Proof broadcast path can use dedicated RPC when configured |
| Observation / simulation stack | Pipeline dry-run, shadow quote/execution harnesses, quote observation gates | Research instrumentation exists |

**Track A engineering proof chapter is closed.** The operator may use this as investor/demo evidence that the bot framework can run safely under governance — not that the strategy has edge.

---

## 2. What did Track A not prove?

| Not proven | Why it matters |
|------------|--------------|
| Strategy edge | R7 **NOT ENOUGH DATA**; one soak trade (−5.29%) insufficient |
| Repeatable profitability | Historical paper PF 1.47 is **paper-only**, fee/slippage-free |
| Live fill quality | R43E proof was one fixed SOL→USDC swap at 0.01 SOL — not thesis-matched meme entry/exit |
| Slippage / MEV survivability | R14 policy defined; not implemented; paper uses chart prices |
| Liquidity at thesis band | Scanner/MC filters reject many candidates; live depth at fill unvalidated |
| Scale readiness | Caps allow one 0.01 SOL proof only; auto-compounding blocked |
| Autonomous live trading | `liveArmed: false`; `liveSubmission: DISARMED`; forbidden verdicts absent by design |
| Cross-chain or smart-wallet intelligence | Solana momentum bot scope only |
| R8+ risk controls armed | Defined but not armed for live capital deployment |

The R43E transaction confirms **sign → broadcast → stop** mechanics. It does **not** validate the +10% / −5% / 20m timeout momentum thesis on live fills.

---

## 3. Why live trading is still not approved

Live trading requires **both** engineering readiness **and** strategy evidence. Track A satisfied the first; R7 blocks the second.

| Blocker | Detail |
|---------|--------|
| R7 verdict | **NOT ENOUGH DATA** — canonical gate for strategy approval |
| Fresh soak sample | **1** closed paper trade in R6a window (WENDU STOP −5.29%) |
| Paper ≠ live | No fee model; no live-equivalent slippage in paper PnL |
| Strategy not approved | R43E/R43F explicitly record `strategyApproved: false` |
| Live trading not approved | R43E/R43F explicitly record `liveTradingApproved: false` |
| Forbidden verdicts | No `LIVE_APPROVED`, `READY_FOR_LIVE_TRADING`, `STRATEGY_APPROVED`, `AUTONOMOUS_TRADING_ENABLED` |
| Posture | Must remain `PIPELINE_DRY_RUN` / `dryRunMode: true` / `liveArmed: false` until a **future explicit gate** |
| R7b collection incomplete | Minimum fresh sample thresholds (see §7) not met |
| Product direction | Track B prioritizes intelligence before execution at scale |

**One engineering proof transaction does not override R7.** Operator caps approval scope was **one-transaction engineering proof only**, not full live authorization.

---

## 4. What data is missing before strategy approval?

### Already available (insufficient alone)

| Source | Snapshot | Limitation |
|--------|----------|------------|
| `paper_positions.json` | 178 closed; PF **1.47**; win rate **41%** | Percent PnL; no fees/slippage |
| R6a soak | **1** close; quiet/active mix | Too thin for post-soak edge |
| `paper_trades.json` thesis fields | 22 rows tagged; 5 `thesisMatch: true` | Too small for conditional edge |
| Pipeline dry-run (`execution_audit.jsonl`) | 28 soak-window events | Observation, not realized PnL |
| Shadow / quote observation | Harnesses built; batches reviewed | Not linked to live fill outcomes |
| R43E proof | 1 broadcast; SOL→USDC | Route proof, not strategy proof |

### Missing for strategy approval

| Gap | Required before approval discussion |
|-----|-------------------------------------|
| Fresh closed paper sample | ≥ **30** closes since R7b collection start |
| Active-market coverage | ≥ **7** distinct days with closes and/or pipeline activity |
| Thesis-matched outcomes | ≥ **10** `thesisMatch: true` candidates with tracked results |
| Exit mix | ≥ **5** stops, ≥ **5** wins/profitable exits, ≥ **5** timeouts |
| Fee-adjusted PnL | Model or measure net after fees |
| Slippage-adjusted entries/exits | Quote vs fill delta on representative routes |
| Failed route / tx rate | Jupiter/RPC failure and retry behavior under load |
| Token quality conditional PnL | PnL segmented by thesis pass/fail and liquidity tier |
| Live-equivalent shadow forward test | Shadow execution decisions vs realized path (R36+ path) |
| Dedicated RPC production readiness | Sustained submission-path RPC health (beyond one proof) |

Until these gaps close, any strategy approval discussion is **premature**.

---

## 5. What Track B must measure next

Track B shifts from **“can we broadcast safely?”** to **“where should capital go, and how much can it absorb?”**

| Measurement domain | Track B question |
|--------------------|------------------|
| Signal quality | Do thesis-matched candidates outperform rejects on forward paper/shadow PnL? |
| Liquidity capacity | At what size does impact destroy edge for a given pool? |
| Route reliability | Quote-to-fill success rate; stale quote rate; fallback behavior |
| Execution latency | Time from signal → quote → simulated fill; RPC round-trip under load |
| Smart-wallet / flow intelligence | Which wallet behaviors precede durable moves vs noise? |
| Cross-market context | Solana-only vs multi-chain opportunity density |
| Risk-adjusted returns | Drawdown, tail losses, concentration — not gross win rate alone |
| Operator workload | Human review burden per signal at target cadence |

**B2** will map **data sources, APIs, chains, costs, and collection cadence** for these measurements. No execution arming in B2 unless explicitly scoped as observation-only.

---

## 6. What metrics determine whether this strategy has edge?

Edge is **net, repeatable, and size-aware** — not a single winning paper trade or one successful broadcast.

### Primary edge metrics (Solana momentum thesis)

| Metric | Definition | Pass direction |
|--------|------------|----------------|
| Net profit factor | Gross wins ÷ \|gross losses\| after fees/slippage assumptions | **> 1.2** sustained in fresh window |
| Win rate × payoff | Win rate × avg win vs loss rate × \|avg loss\| | Expectancy **> 0** after costs |
| Thesis-conditional PF | PF on `thesisMatch: true` subset only | Must beat all-trades PF |
| Timeout rate | Timeouts ÷ closes | Stable or falling without rising tail losses |
| Tail loss rate | Losses beyond stop design (e.g. < −8%) | **Near zero** with data QA |
| Slippage tax | Mean (fill price − quote) / quote on entry and exit | Bounded vs target edge |
| Route success rate | Successful swaps ÷ attempted (shadow or observation) | **> 95%** on liquid routes |
| Candidate funnel yield | Thesis matches ÷ scanner candidates | Sufficient flow without over-filtering |
| Max drawdown (wallet-realistic) | Peak-to-trough on sized positions | Within operator risk budget |

### Secondary / disqualifying metrics

| Metric | Disqualifies edge if… |
|--------|------------------------|
| Failed routes | High Jupiter/RPC failure without recovery |
| Bad fills | Systematic adverse selection vs quote |
| Token quality failures | Rug/honeypot/near-zero liquidity in thesis-matched set |
| Idle-period illusion | Edge exists only in cherry-picked active days |
| Overfitting | Params tuned on same window used for approval |

Historical all-time paper (PF **1.47**, win rate **41%**) is a **hypothesis**, not approval evidence, until reproduced in a **fresh, fee-aware, thesis-segmented** window.

---

## 7. Minimum sample size before any future approval discussion

Use **R7b thresholds** as the floor for **Solana momentum strategy** reconsideration. **All** must be satisfied (time and counts — whichever completes last):

| Requirement | Threshold |
|-------------|-----------|
| Fresh closed paper trades (since R7b collection start) | **≥ 30** |
| Active-market dry-run calendar days | **≥ 7** distinct days with close and/or pipeline activity |
| Thesis-matched candidates | **≥ 10** with `thesisMatch: true` |
| Stop exits (LOSS / STOP) | **≥ 5** |
| Target or profitable exits (WIN or `pnlPercent > 0`) | **≥ 5** |
| Timeout exits | **≥ 5** |

**Continuous safety gates (non-negotiable):**

- `PIPELINE_DRY_RUN` · `dryRunMode: true` · `liveArmed: false`
- `recovery_actions.jsonl` absent
- Safety suite green (**66/66**)
- No state corruption in core JSON stores

**Track B / FOMO engine** may require **additional** sample sizes (wallet cohorts, liquidity tiers, cross-chain signals) defined in **B2** — the table above is the **Track A Solana strategy floor only**.

No future approval discussion should proceed with fewer samples unless the operator documents explicit risk acceptance in writing.

---

## 8. Risks that remain

Even with Track A engineering proof complete, the following risks block capital deployment:

| Risk | Status | Impact |
|------|--------|--------|
| **Slippage** | Paper ignores; R14 not implemented | Eats edge at entry/exit; worsens at size |
| **Liquidity** | Thesis targets lower MC band | Thin pools; partial fills; exit difficulty |
| **Failed routes** | Observed in quote batches; policy rejects some | Missed entries; stale quote exposure |
| **Bad fills** | Not measured at scale | Adverse selection vs Jupiter quote |
| **Token quality** | Filters reject many; not foolproof | Tail losses (historical −99% outlier) |
| **RPC issues** | Dedicated RPC used for proof; production path uneven | Submission delay, dropped txs, false health |
| **Execution latency** | Scanner interval ~60s; pipeline handoff | Momentum decay before fill |
| **MEV / sandwich** | R14 policy only | Worse fills on volatile launches |
| **Paper ≠ live** | Documented in KNOWN_ISSUES | Overstated edge in research metrics |
| **Thesis drift** | Scanner vs executor filter gap | Low live-eligible funnel; quiet-market idle |
| **Human process** | Manual gates required | Operator error if rushed toward live |
| **Scale illusion** | One 0.01 SOL proof | Does not predict 10× size behavior |

R43F confirmed the proof path did **not** introduce recovery ledger pollution or live position mutation. It did **not** eliminate market or execution risks above.

---

## 9. Recommended next milestone: B2 data collection plan

**B2 — Data source map and collection plan**

Deliverables:

1. **Data source inventory** — chains, APIs (GMGN, Jupiter, RPC, wallet feeds), rate limits, costs  
2. **Metric ownership** — which script/file owns each Track B measurement  
3. **Collection cadence** — daily (`r7b_daily_summary.js`) vs weekly (`r7_strategy_review.js`) vs new forward trackers  
4. **Shadow / observation activation criteria** — when to run quote batches vs shadow execution without arming live  
5. **Segmentation schema** — thesis match, liquidity tier, time-of-day, market quiet flag  
6. **Exit criteria for B3+** — when signal scoring model design may begin  

**Explicit non-goals for B2:**

- Enable live trading  
- Change `executionMode`, `dryRunMode`, or `liveArmed`  
- Submit transactions  
- Claim strategy approval  

---

## Track A closure statement

| Criterion (from strategic roadmap) | Status |
|-----------------------------------|--------|
| Hard micro-live caps enforced | **Done** |
| Operator caps file approved (engineering proof scope) | **Done** |
| Signer safety path R39–R43 | **Done** |
| One-trade max proof | **Done** — R43E + R43F |
| No auto-compounding | **Verified blocked** |
| Post-trade audit | **Done** — R43F |
| Scale gate separate | **Enforced** — live trading NOT APPROVED |

**Track A is closed for engineering proof purposes.** Further Solana live activity requires a **new explicit gate** with strategy evidence — not an extension of the R43E proof scope.

---

## Boundaries

This document:

- Does **not** approve live trading or strategy  
- Does **not** change code, config, or posture  
- Does **not** submit transactions  
- Does **not** bypass R7 **NOT ENOUGH DATA**  
- Does **not** commit capital scale or investor allocations  

**Planning and thesis only.**

---

## Related documents

- [FOMO Strategic Pivot and Engine Roadmap](./FOMO_STRATEGIC_PIVOT_AND_ENGINE_ROADMAP.md)  
- [R7 Strategy Performance Edge Review](./R7_STRATEGY_PERFORMANCE_EDGE_REVIEW.md)  
- [R7b Strategy Data Collection Plan](./R7B_STRATEGY_DATA_COLLECTION_PLAN.md)  
- [R43F Post-Transaction Audit](./R43F_POST_TRANSACTION_AUDIT.md)  
- [R43E3 Operator Broadcast Deps](./R43E3_OPERATOR_BROADCAST_DEPS.md)  
- [Track A Micro-Live Guardrails](./TRACK_A_MICRO_LIVE_GUARDRAILS.md)
