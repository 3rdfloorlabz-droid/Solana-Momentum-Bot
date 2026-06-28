# R8A — Micro-live Engineering Proof Plan

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Fast-track engineering gate)  
**Status:** **DEFINED** — design and preparation only  
**Created:** 2026-06-28  

**Prerequisites:** R6a 24h soak · [R7](./R7_STRATEGY_PERFORMANCE_EDGE_REVIEW.md)

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED**  
**Strategy edge:** **NOT PROVEN**

---

## 1. Executive summary

### R8A is a controlled micro-live **engineering proof** gate

R8A exists because the operator chose to pursue an **operational capability proof** for investor/demo purposes — **not** because strategy profitability is proven.

R8A may **design and prepare** micro-live execution controls. It must **NOT** enable live trading.

**This is NOT full live trading approval.**

---

## 2. Gate definition

| Aspect | Policy |
|--------|--------|
| Purpose | Prove the system can safely perform a **tiny real execution path** under strict human control |
| Scope | Engineering proof — wallet path, transaction construction review, one tiny position, audit trail |
| Out of scope | Strategy-profit approval, investor-scale capital, autonomous trading |
| Enablement | **Forbidden** in R8A — no arming, no LIVE mode, no submission |

---

## 3. Current status

| Item | Status |
|------|--------|
| R6a 24-hour dry-run soak | **PASS** (system stability) |
| R7 Strategy / Edge Review | **NOT ENOUGH DATA** |
| R7 reason | Soak window produced **1 closed paper trade**; historical paper promising but insufficient for edge approval |
| Safety suite | **49/49** (`node run_safety_tests.js`) |
| Posture | `PIPELINE_DRY_RUN` · `dryRunMode: true` · `liveArmed: false` |
| `recovery_actions.jsonl` | **Absent** |
| Live trading | **NOT APPROVED** |

**Operator decision:** Pursue engineering proof **despite** R7 NOT ENOUGH DATA. R8A does **not** bypass or override R7 edge findings.

---

## 4. Demo objective

Prove operational capability:

- Wallet connection works
- Transaction construction path is reviewed
- Signer path is isolated
- **One tiny** real position can be opened
- Position can be tracked
- Exit can be recorded
- Emergency stop prevents further action
- Audit files capture the event
- System remains controllable after execution

---

## 5. Mandatory limits (proposed — NOT active)

| Limit | Value |
|-------|-------|
| Max open live positions | **1** |
| Max live trades (first proof) | **1** |
| Auto-compounding | **Forbidden** |
| Autonomous repeated trading | **Forbidden** |
| Recovery automation | **Forbidden** |
| Executor recovery | **Forbidden** |
| Reset-after-panic automation | **Forbidden** |
| Auto-clear emergency stop | **Forbidden** |
| Dashboard one-click live enable | **Forbidden** |
| Human approval | **Required immediately before trade** |
| Human presence | **Required during first proof** |
| Wallet | **Dedicated hot wallet only — never main wallet** |
| Balance | **Tiny only** |
| Trade size | **Operator-defined and documented before arming** |
| Daily loss cap | **Operator-defined and documented before arming** |

### Suggested engineering-demo defaults

| Parameter | Default |
|-----------|---------|
| Trade size | **≤ 0.01–0.02 SOL** |
| Daily loss cap | **≤ 0.05 SOL** |
| Trades | **1 only** |
| After first real transaction | **Stop** (win or loss) — review before any second trade |

Example caps file: `examples/micro_live_demo_caps.example.json` (placeholders only).

---

## 6. Required preflight checklist

Before any micro-live proof:

- [ ] Git clean
- [ ] Safety suite green
- [ ] `recovery_actions.jsonl` absent
- [ ] Dashboard running
- [ ] Scanner running
- [ ] Monitor running
- [ ] Wallet monitor running
- [ ] Executor singleton lock healthy
- [ ] No duplicate executor loops
- [ ] Wallet balance confirmed
- [ ] Signer secret storage reviewed (design only until R41+)
- [ ] Live config reviewed
- [ ] Emergency stop tested in dry-run
- [ ] Order construction reviewed
- [ ] Transaction logging reviewed
- [ ] Live position write path reviewed
- [ ] Live position close path reviewed
- [ ] Rollback plan documented
- [ ] Operator explicitly approves exact trade size and max loss

**Read-only preflight helper:** `node micro_live_preflight.js` → `analysis/micro_live_preflight.json`

---

## 7. Required code review areas

Review only — **do not enable**:

| Area | Files / systems |
|------|-----------------|
| Executor | `live_executor.js` |
| Wallet / signer path | Signer guards, R9/R38 design |
| Transaction builder | Step 9a/9b paths (review only) |
| Quote / route | Jupiter quote handling if used |
| Slippage | R14 policy, observation gates |
| Duplicate prevention | Dedup stores, singleton guard |
| Positions | `live_positions_store.js` |
| Trades ledger | `live_trades.jsonl` |
| Errors | `live_errors.jsonl` |
| Emergency stop | R11 validation |
| Arming gates | `liveArmed`, `dryRunMode`, `executionMode` |

---

## 8. Required new guardrails before arming (design)

Design or verify before any future arming:

- Hard max live trade size
- Hard max live daily loss
- Hard max live trades per session
- Hard max open live positions = **1**
- Explicit human approval token or file
- Posture check immediately before transaction
- Singleton lock check immediately before transaction
- Block if `recovery_actions.jsonl` exists unexpectedly
- Block if safety suite has not passed recently
- Block if wallet balance exceeds intended demo amount
- Block if config says auto-compound
- Block if slippage exceeds cap
- Block if quote route unavailable or stale

**R8A designs these — does not activate them.**

---

## 9. Deliverable verdicts

R8A / preflight may return **one of**:

| Verdict | Meaning |
|---------|---------|
| `NOT READY FOR MICRO-LIVE ENGINEERING PROOF` | Critical blockers present |
| `READY TO BUILD MICRO-LIVE GUARDS` | Design phase — build guardrails next |
| `READY FOR FINAL MICRO-LIVE APPROVAL REVIEW` | Preflight clean — proceed to human approval gate (still not live) |

**Never return “ready for live trading.”**

---

## 10. Remaining blockers

- R7 edge **not proven** — operator accepts engineering-only path
- Micro-live guardrails **not yet built/enforced**
- R39–R43 signer path incomplete
- No human approval for first proof
- No operator-documented trade size / loss caps (real file)
- Live trading **NOT APPROVED**

Capital at risk remains **$0** until explicit future approval gates.

---

## 11. No live trading approval

R8A **does not**:

- Enable live trading
- Set `executionMode` to LIVE
- Set `dryRunMode` false
- Set `liveArmed` true
- Add private keys or expose wallet secrets
- Submit transactions
- Loosen strategy filters
- Approve investor-scale capital
- Claim strategy edge is proven
