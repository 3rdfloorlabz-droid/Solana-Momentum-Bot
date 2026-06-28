# R13 — Final Micro-Live Approval Gate

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **DEFINED ONLY** — **BLOCKED**  
**Review date:** 2026-06-28  

**Helper:** `node r13_micro_live_approval_check.js` → `analysis/r13_micro_live_approval_status.json` (read-only)

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED**  
**Capital at risk:** **$0** (until explicit final approval and arming)

---

## 1. Executive verdict

### **FINAL APPROVAL GATE DEFINED — BLOCKED**

R13 defines what **explicit final human approval** would require before any future micro-live arming. It **does not approve micro-live**. It **does not approve live trading**. It **does not arm** the bot. It **does not connect** a wallet.

This verdict is **not** “ready for live trading.”

---

## 2. R7b bypass / research exception statement

| Fact | Status |
|------|--------|
| R7b thresholds | **NOT MET** — collection remains **active** |
| R7 fresh edge | **NOT ENOUGH DATA** — edge **not proven** |
| Operator interest in live samples | **Research exception only** — higher risk |

Using live trading to collect samples is a **higher-risk operator exception**. It may only be **considered** under **strict micro-live limits**. It is **not profit mode**. Purpose is **execution validation and data collection only**. **Total loss is possible.**

**Live trading remains blocked** until explicit final approval is given, recorded, and all implementation blockers are cleared.

R13 **does not mark R7b complete**. R13 **does not say edge is proven**.

---

## 3. Wallet funds boundary

**Operator note (context only — NOT authorization):**

| Field | Value |
|-------|-------|
| Total SOL available (operator report) | **2 SOL** |
| SOL already in wallet (operator report) | **1 SOL** |

**The full 1 SOL is NOT authorized for bot risk.**

**Wallet balance ≠ authorized risk.** The wallet may hold **1 SOL** (or **2 SOL** total available) as **operational liquidity** for many tiny trades. Only a **smaller defined session allocation** may be authorized. Authorized session allocation must be **smaller than wallet balance**.

### Proposed approval terms only (NOT active config)

| Term | Proposed value |
|------|----------------|
| Initial **authorized session** allocation | **0.05 SOL maximum** |
| First trade size | **0.005–0.01 SOL** |
| Max open positions | **1** |
| Max trades first session | **1**, then review |
| Max trades per day (after review) | **3** |
| Stop after consecutive losses | **2** |
| Session drawdown stop | **0.03 SOL** total or lower if operator chooses |
| Auto-compounding | **Forbidden** |
| Scaling / averaging down | **Forbidden** |
| Unattended session | **Forbidden** |
| Adding funds during session | **Forbidden** |

These terms are **draft approval bounds** only. They are **not** written to `live_config.json`.

---

## 4. Required approval fields

Before any future micro-live arming, a **manual signed approval record** must include:

| Field | Required |
|-------|----------|
| Operator name | Yes |
| Date/time | Yes |
| Wallet public address | Yes |
| Total wallet balance | Yes |
| **Authorized session allocation** | Yes — must be ≤ **0.05 SOL**; must be **less than wallet balance** |
| Max trade size | Yes — must be ≤ **0.01 SOL** proposed cap |
| Max session loss | Yes |
| Max daily loss | Yes |
| Max weekly loss | Yes |
| Max open positions | Yes |
| Max trades per session | Yes |
| Max trades per day | Yes |
| Session start/end time | Yes |
| Per-trade approval required | Yes — **yes** for first phase |
| **Slippage cap acknowledged** | Yes — see R14 |
| **MEV protection plan acknowledged** | Yes — see R14 |
| Emergency stop reset policy acknowledged | Yes |
| **R7b bypass risk acknowledged** | Yes — explicit |
| Total loss risk acknowledged | Yes |
| No auto-compounding acknowledged | Yes |
| Live trading not for income acknowledged | Yes |

Template location: this document §4 — future file `MICRO_LIVE_APPROVAL_RECORD.md` may be created at approval time. **Not created in R13.**

---

## 5. Required pre-arm checklist

Before any **future intentional** arming (not performed in R13):

- [ ] Git status clean  
- [ ] Safety suite green  
- [ ] `recovery_actions.jsonl` absent  
- [ ] `executionMode` still `PIPELINE_DRY_RUN` before intentional change  
- [ ] `dryRunMode` true before intentional change  
- [ ] `liveArmed` false before intentional change  
- [ ] Singleton lock healthy  
- [ ] Exactly one executor loop  
- [ ] `emergencyStop` false  
- [ ] Dashboard posture matches CLI posture  
- [ ] Wallet monitor fresh  
- [ ] Research wallet contains **only authorized funds** (not full 1 SOL exposed)  
- [ ] No signing material in repo  
- [ ] No credentials in logs/dashboard/analysis  
- [ ] R8 limits reviewed  
- [ ] R9 signer policy reviewed  
- [ ] R10 lifecycle reviewed  
- [ ] R11 emergency stop reviewed  
- [ ] **R14 slippage/MEV review completed**  
- [ ] Operator present  
- [ ] Manual stop plan known  

---

## 6. Required implementation blockers

All remain **blocking** today:

| # | Blocker |
|---|---------|
| B1 | R12 checklist defined but micro-live **not approved** |
| B2 | **R7b not complete** |
| B3 | **R14 slippage/MEV review not complete for live path** |
| B4 | R7 edge **not proven** |
| B5 | Signer simulation **fake only** |
| B6 | Real signer **not implemented** |
| B7 | Real wallet **not connected through approved path** |
| B8 | Live execution **not approved for implementation** |
| B9 | Micro-live config **not created** |
| B10 | **No final signed approval record** |
| B11 | Per-trade approval workflow **not implemented** (unless separately built) |
| B12 | `liveArmed` **false** |
| B13 | `dryRunMode` **true** |
| B14 | `executionMode` **not MICRO_LIVE** |

---

## 7. First micro-live session shape (draft)

| Field | Value |
|-------|-------|
| Session type | Supervised **research validation** |
| Goal | Validate lifecycle, **slippage**, **MEV protection**, logging |
| Max session allocation | **0.05 SOL** |
| First trade | **0.005–0.01 SOL** |
| Max open positions | **1** |
| Max trades first session | **1** |
| Stop | After abnormal behavior |
| Post-trade | Immediate review vs quoted/paper expectation |
| Continuation | Manual approval only |

---

## 8. Go / no-go matrix

### NO-GO if any:

- R7b bypass **not explicitly acknowledged**  
- Operator **not present**  
- Any safety test **fails**  
- Unexpected `recovery_actions.jsonl`  
- Duplicate executor loop  
- Singleton mismatch  
- `emergencyStop: true`  
- Dashboard/CLI posture mismatch  
- Wallet exposes **more than authorized funds**  
- Signer credential handling **unclear**  
- First trade size **exceeds approved cap**  
- Slippage/liquidity data **missing**  
- Quote route **unstable**  
- Bot attempts **unattended execution**  

### CONSIDER FINAL APPROVAL REVIEW ONLY if:

- All safety checks pass  
- Operator **explicitly accepts R7b bypass risk**  
- Micro allocation is **tiny** (≤ 0.05 SOL proposed)  
- First trade size is **tiny** (≤ 0.01 SOL proposed)  
- Per-trade approval **required**  
- Emergency stop **tested** (simulation minimum; live drill preferred later)  
- Real signer path **separately reviewed**  
- All R8–R14 docs agree  

**Review only ≠ approved.** Human signed record still required.

---

## 9. Recommended next gate

1. **Complete R12** if any items pending  
2. **Complete R14 Slippage / MEV Protection Review**  
3. **Continue R7b** if possible — bypass remains higher risk  
4. **Do not arm live yet**  
5. **Do not connect real wallet through unapproved path**  
6. **Do not treat 1 SOL wallet balance as the risk amount**

---

## 10. Verdict table

| Field | Value |
|-------|-------|
| **R13 verdict** | **FINAL APPROVAL GATE DEFINED — BLOCKED** |
| **Gate status** | **BLOCKED** (may become **REVIEWABLE ONLY** with explicit bypass ack — still not approved) |
| **Micro-live approved** | **NO** |
| **Live trading approved** | **NO** |
| **R7b complete** | **NO** |
| **Edge proven** | **NO** |
| **Status check** | `node r13_micro_live_approval_check.js` |

---

## 11. Footer

Operator interest in research samples is noted.  
R7b is not waived.  
Edge is not proven.  
1 SOL in wallet is not fully authorized.  
Proposed risk cap is tiny.  
Gates remain closed until humans sign.  
Ori advises.  
Humans authorize.
