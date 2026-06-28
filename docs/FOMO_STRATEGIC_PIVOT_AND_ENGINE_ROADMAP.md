# FOMO Strategic Pivot and Engine Roadmap

**Module:** TracktaOS — Solana Momentum Bot + FOMO Project  
**Document type:** Strategic planning only  
**Created:** 2026-06-28  

**Live trading:** **NOT APPROVED**  
**Strategy changes:** **NONE from this document**  
**Execution code changes:** **NONE from this document**

---

## 1. Executive summary

The **Solana Momentum Bot** is valuable as **proof of completion** — it demonstrates that the team can design, harden, observe, simulate, and govern an automated trading system end-to-end. It is **not** the final engine for deploying larger capital.

| Dimension | Solana bot (Track A) | FOMO engine (Track B) |
|-----------|----------------------|------------------------|
| Primary purpose | Engineering proof + investor/demo milestone | Larger-capital opportunity intelligence |
| Capital scale | Tiny, controlled micro-live proof only | Scaled only after signal proof |
| Strategy validation | **Not** strategy-profit validation | Signal quality + liquidity capacity first |
| Product shape | Working bot framework | Decision intelligence first, execution second |

**Current bot status (baseline):**

- R6a 24h dry-run soak: **PASS**
- R7 Strategy Performance Review: **NOT ENOUGH DATA**
- R8A Micro-live Engineering Proof Plan: **complete**
- Safety suite: **50/50 PASS**
- Live trading: **NOT APPROVED**

The operator is moving toward **completion and investor/demo readiness** on Track A while **beginning Track B** — the larger-capital FOMO opportunity engine.

---

## 2. Track A — Solana Bot Engineering Proof

Track A finishes what the Solana bot was built to prove: **we can complete a working automated trading system** under strict human control and audit.

### Remaining purpose

| Goal | Description |
|------|-------------|
| Micro-live guardrails | Hard caps on size, loss, positions, trades per session |
| One tiny controlled real execution | Single proof trade — not scale |
| Logging / audit trail | `live_trades.jsonl`, `live_errors.jsonl`, position lifecycle verified |
| Safety gates | Posture, singleton, recovery, emergency stop, preflight |
| Dashboard / operator control | Human present; no one-click live enable |
| Investor/demo proof | Operational capability without claiming edge |
| **Not** strategy-profit validation | R7 NOT ENOUGH DATA stands; R8A does not bypass it |

Track A is **engineering completion**, not a mandate to scale live trading.

---

## 3. Track A completion criteria

Track A is **complete** when all of the following are satisfied (still **not** scaled live approval):

| Criterion | Requirement |
|-----------|-------------|
| Hard micro-live caps | Enforced in code/config guards — not design-only |
| Operator caps file | Documented, approved `operator_records/micro_live_demo_caps.json` |
| Signer safety review | R39–R43 path complete; no key leakage |
| One-trade max proof | Exactly one controlled real execution; stop after |
| No auto-compounding | Verified blocked |
| One open position max | Verified enforced |
| Emergency stop verified | Tested in simulation + honored post-proof |
| Logs reviewed | Entry, exit, errors, audit trail complete |
| Post-trade report created | Human-readable proof artifact for investors |
| Scale gate separate | Live trading at size requires **separate explicit approval** |

**Live trading remains NOT APPROVED for scale** until a future capital and strategy gate says otherwise.

---

## 4. Track B — Larger-Capital FOMO Engine

Larger capital requires a different product — not faster meme sniping on thin pools.

| Requirement | Why |
|-------------|-----|
| Deeper liquidity | Size must enter and exit without destroying edge |
| Lower slippage tolerance | Impact eats returns at scale |
| Slower, higher-confidence signals | Fewer trades; higher conviction |
| Cross-chain visibility | Opportunity is not Solana-only |
| Smart-wallet intelligence | Follow proven behavior, not noise |
| Execution capacity scoring | Know *how much* can safely trade |
| Risk controls | Loss caps, concentration, catalyst risk |
| Portfolio sizing | Capital allocation across opportunities |

Track B is **intelligence and recommendation first**. Execution connects only after signals prove themselves.

---

## 5. Candidate larger-capital engines

### A. Smart-wallet / copy-trading intelligence engine

- Track profitable wallets over time
- Identify who they follow and who follows them
- Cluster wallets by behavior (accumulator, flipper, insider-adjacent)
- Detect early accumulation before price discovery
- Rank signal sources by historical quality
- **Avoid** blindly copying low-liquidity or bot-dominated flows

**Strength:** Proprietary edge from behavior graph, not public indicators.  
**Risk:** Survivorship bias; wallet rotation; wash trading.

### B. Cross-chain opportunity engine

- Monitor Solana, Ethereum, Base, Arbitrum, BSC, Hyperliquid ecosystems
- Compare flow, liquidity, volume, momentum, wallet behavior across chains
- Detect capital rotation (e.g. ETH narrative → SOL memes → Base AI)

**Strength:** Broader opportunity set; narrative timing.  
**Risk:** Data complexity; latency; fragmented liquidity.

### C. Liquidity-aware execution engine

- Score every opportunity by safe entry/exit capacity
- Reject trades where intended size causes unacceptable impact
- Estimate slippage and depth **before** recommendation

**Strength:** Directly addresses scale problem.  
**Risk:** Requires reliable pool/DEX depth data.

### D. Narrative rotation engine

- Detect capital rotating into themes: AI, gaming, memes, DePIN, RWA, L1/L2
- Combine social, volume, wallet, and price signals
- Time narrative cycles rather than single-token momentum

**Strength:** Investor-friendly story; macro rotation alpha.  
**Risk:** Narrative lag; crowded trades.

### E. Perp / funding / basis engine

- Monitor funding rates and open interest
- Detect crowded longs/shorts
- Identify spread, basis, or hedge opportunities with defined risk

**Strength:** More structured risk/reward; less pure speculation.  
**Risk:** Exchange counterparty; regime shifts.

### F. Catalyst / risk engine

- Token unlocks, listings, migrations, major announcements
- Exploit/rug/security risk scoring
- Insider sell pressure and holder concentration alerts

**Strength:** Avoids catastrophic loss; event-driven edge.  
**Risk:** False positives; incomplete off-chain data.

---

## 6. Recommended direction

### Primary Track B engine (initial)

**Smart-wallet + liquidity-aware cross-chain opportunity engine**

| Reason | Explanation |
|--------|-------------|
| Scales beyond meme sniping | Behavior + depth, not speed on thin pools |
| Investor narrative | “We map where smart money moves and how much size fits” |
| Proprietary intelligence | Wallet graph + capacity scores are defensible |
| Decision before execution | Recommendations without immediate on-chain risk |
| “Jarvis” decision system | Ranked opportunities with reasons and capacity |
| Execution deferred | Connect bots only after paper/signal track record |

Secondary modules fold in over time: **narrative rotation (D)**, **catalyst/risk (F)**, **perp/funding (E)** as filters on top of core signals.

---

## 7. Proposed architecture (Track B)

```
┌─────────────────────────────────────────────────────────────────┐
│                     FOMO Opportunity Engine                      │
├─────────────────────────────────────────────────────────────────┤
│  wallet intelligence collector  │  token/pair liquidity collector │
│  cross-chain market scanner     │  signal scoring engine          │
│  source-of-signal graph         │  risk filter                    │
│  execution capacity estimator   │  dashboard                      │
│  research notebook / Ori memory │  paper simulation engine        │
│  optional future execution engine (gated, post-proof)             │
└─────────────────────────────────────────────────────────────────┘
```

| Module | Role |
|--------|------|
| Wallet intelligence collector | Ingest labeled wallets, trades, follow graphs |
| Token/pair liquidity collector | Depth, volume, pool age, impact curves |
| Cross-chain market scanner | Unified watch across chains/DEXes |
| Signal scoring engine | Rank opportunities; explain score components |
| Source-of-signal graph | Who led, who followed, cluster behavior |
| Risk filter | Catalyst, security, concentration, unlock risk |
| Execution capacity estimator | Max safe size per opportunity |
| Dashboard | Investor/demo UI — intelligence first |
| Research notebook / Ori | Decisions, posture, thesis memory |
| Paper simulation engine | Track signal P&amp;L without capital |
| Future execution engine | **Optional** — only after B6+ proof |

**No execution module is in scope until signal proof exists.**

---

## 8. Near-term roadmap

### Track A (Solana bot — finish engineering proof)

| Step | Milestone |
|------|-----------|
| A1 | Build micro-live guardrails (R8A guard design → code) |
| A2 | R39–R43 signer safety path |
| A3 | Operator caps + human approval record |
| A4 | One-trade micro-live proof (if operator approves) |
| A5 | Post-trade report + investor demo package |

### Track B (FOMO engine — intelligence first)

| Step | Milestone |
|------|-----------|
| **B1** | **FOMO Engine thesis** — problem, users, non-goals |
| B2 | Data source map — chains, APIs, wallet feeds, costs |
| B3 | Smart-wallet scoring model — features, labels, backtest plan |
| B4 | Liquidity capacity model — impact curves, reject rules |
| B5 | Signal dashboard mockup — ranked opportunities + reasons |
| B6 | Paper signal tracker — forward test without execution |
| B7 | Investor demo dashboard — Track A proof + Track B preview |
| B8 | Execution integration — **only after signal proof** |

**Next milestone recommendation:** **B1 — FOMO Engine thesis** (parallel with Track A guardrail build).

---

## 9. Investor framing

Use this narrative:

1. **We completed the first research bot framework** — soak, safety suite, observation, shadow simulation, wallet design, micro-live plan.
2. **We learned meme momentum is useful for testing** but not ideal for larger capital — R7 showed insufficient edge data; engineering proof ≠ strategy validation.
3. **We are evolving into a cross-chain intelligence engine** — smart money + liquidity capacity + risk filters.
4. **The product is decision intelligence first, execution second** — reduces risk and increases scalability.
5. **Track A delivers the demo** (“we can run a bot safely”); **Track B delivers the product** (“we know where size should go”).

---

## 10. Boundaries

This document **does not**:

- Approve live trading
- Change strategy, scanner, monitor, or executor code
- Add wallets, signers, or private keys
- Modify `live_config.json`, `executionMode`, `dryRunMode`, or `liveArmed`
- Bypass R7 NOT ENOUGH DATA
- Commit capital scale or investor allocations

**Strategic planning only.** Implementation gates remain R8A, R39+, and future B-milestones.

---

## Related documents

- [R7 Strategy Performance Edge Review](./R7_STRATEGY_PERFORMANCE_EDGE_REVIEW.md)
- [R8A Micro-live Engineering Proof Plan](./R8A_MICRO_LIVE_ENGINEERING_PROOF_PLAN.md)
- [R38 Research Wallet Secret Storage Design](./R38_RESEARCH_WALLET_SECRET_STORAGE_DESIGN.md)
