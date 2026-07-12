# RB-G9 AP03 Operating Window Reselection — 2026-07-11

Status:
**OPERATING WINDOW RESELECTED — PRODUCTION DISARMED UNCHANGED — NO AP03 AUTHORIZATION SIGNED — NO SESSION FOLDER**

Gate type:
Scheduling / governance reselection — move proof from 2026-07-13 to today with date-correct session identity

Prerequisites:
`RB-G9 AP02 OPERATING WINDOW SELECTION — 2026-07-11.md` · `RB-G9-20260713-AP02 EXPIRED G1 CLOSURE — 2026-07-13.md` · AP02 pre-G1 readiness · AP02 proof-day runbook

Reselection capture UTC:
**`2026-07-11T19:19:57.901Z`**

Reselection capture local (MDT):
**`2026-07-11 13:19:57`**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**AP03 G1 signed:** **No** · **AP03 G2–G4:** **Not created** · **Session folder:** **Not created** · **Runtime stub:** **Not created** · **Processes changed:** **No**

---

## 1. Prominent post-gate state

> **DISARMED · DRY · NO TRADE**
>
> **PROOF RESCHEDULED TO TODAY — AP03 SESSION SELECTED**
>
> **NO AP03 AUTHORIZATION SIGNED · NO TECHNICAL ACTION AUTHORIZED**

Window reselection **does not** authorize G1 signing, arming, isolation, Domain A, stub creation, proof execution, or any execution path.

---

## 2. Files inspected (read-only)

| File | Purpose |
|------|---------|
| `RB-G9 AP02 OPERATING WINDOW SELECTION — 2026-07-11.md` | Prior window — 2026-07-13 14:00–20:00 MDT |
| `RB-G9 AP02 R15 AUTHORIZATION PLANNING — 2026-07-11.md` | AP02 G1 design · session-date policy |
| `RB-G9 AP02 PRE-G1 OPERATIONAL READINESS — 2026-07-11.md` | Process/wrapper classifications |
| `RB-G9 AP02 PROOF-DAY RUNBOOK — 2026-07-11.md` | Proof/rollback command staging |
| `RB-G9-20260713-AP02 EXPIRED G1 CLOSURE — 2026-07-13.md` | Early AP02 G1 closure |
| `analysis/rb_g9_20260713_ap02_expired_g1_closure_receipt.json` | Machine closure receipt |
| `RB-G9-20260713-AP02 FRESH R15 AUTHORIZATION — 2026-07-11 — FAIL CLOSED.md` | Proof-day-not-reached attempt |
| `Authorizations/README.md` | Index state — **not modified in this gate** |
| `Sessions/README.md` | Session index — updated |
| `live_config.json` | Disarmed posture verification |

Closed authorization records **not edited**.

---

## 3. Timing capture

| Field | Value |
|-------|-------|
| **Gate-start UTC** | **`2026-07-11T19:19:57.901Z`** |
| **Gate-start local (MDT)** | **`2026-07-11 13:19:57`** |
| **Current local date** | **`2026-07-11`** |
| **Proposed block start (local)** | **`15:00 MDT`** |
| **Preparation time remaining at gate completion** | **~100 minutes** *(6,002,099 ms)* |
| **Minimum preparation required** | **≥ 45 minutes** |
| **Preparation time sufficient** | **PASS** |

---

## 4. Operator decision

| Field | Value |
|-------|-------|
| **Operator** | **Taylor Cheaney** |
| **Decision** | **`APPROVED — 2026-07-11, 15:00–21:00 MDT`** |
| **Operator context** | Off work today and tomorrow; directed proof move from 2026-07-13 to today |
| **Inferred from planning text** | **No** |

---

## 5. Selected operating window (canonical — AP03)

| Field | Value |
|-------|-------|
| **Selected proof date** | **`2026-07-11`** |
| **Selected local window** | **`15:00–21:00 MDT`** |
| **Selected UTC window** | **`2026-07-11T21:00:00Z`** through **`2026-07-12T03:00:00Z`** |
| **Block duration** | **6 hours** |
| **Minimum four-hour block met** | **Yes** |
| **Preferred six-hour block met** | **Yes** |
| **Sufficient preparation time before block** | **Yes** — ~100 minutes remain at gate completion |

### Superseded window (historical only)

| Field | Value |
|-------|-------|
| **Prior selected date** | **`2026-07-13`** |
| **Prior local window** | **`14:00–20:00 MDT`** |
| **Prior session ID** | **`RB-G9-20260713-AP02`** |
| **Status** | **Superseded by this reselection — not executed** |

---

## 6. Session identity selection

### Session-date policy

The prior planned session **`RB-G9-20260713-AP02`** encodes execution date **`20260713`**. A proof executed on **`2026-07-11`** **cannot** use that session ID — encoded date would not match execution date.

### Final session ID

**`RB-G9-20260711-AP03`**

| Criterion | Result |
|-----------|--------|
| **Execution date match** | **Yes** — `20260711` |
| **Collision with EV01/EV02/AP01** | **No** |
| **Collision with AP02** | **No** — distinct suffix and date |
| **Prior AP03 authorization** | **None** |
| **Session collision result** | **PASS — no collision** |

**Rationale:** AP02 already carries signed and closed authorization history tied to 2026-07-13. AP03 avoids mixing two dates and two operating plans. No prior authorization may carry into AP03.

---

## 7. Old AP02 disposition

| Field | Value |
|-------|-------|
| **Session** | **`RB-G9-20260713-AP02`** |
| **Disposition** | **Planned but superseded before execution** |
| **Early G1** | **Remains CLOSED — EXPIRED_UNUSED / SUPERSEDED_BEFORE_EXECUTION** · permanently non-reusable |
| **New AP02 authorization** | **Forbidden** — no fresh AP02 G1–G4 may be created |
| **Armed or executed** | **Never** |
| **Formal AP02 session-plan closure** | **May be filed later if required — not performed in this gate** |

---

## 8. AP03 separation requirements

**AP03 separation requirements recorded:** **Yes**

AP03 requires entirely fresh artifacts. AP02 artifacts are **historical evidence only**:

| Requirement | Detail |
|-------------|--------|
| **New G1** | Required — proof-day sign today |
| **New G2, G3, G4** | Required |
| **New isolation authority** | Required |
| **New fingerprints** | Required — all gates |
| **New Domain A baseline** | Required |
| **New `isolatedProcessSetHash`** | Required |
| **New runtime stub** | Required at G3 gate — not now |
| **AP02 carry-forward** | **Design evidence only** — not authorization reuse |

---

## 9. Operator availability (Taylor confirmation)

| Check | Result |
|-------|--------|
| **Off work today and tomorrow** | **Confirmed** |
| **Uninterrupted availability for selected block** | **Confirmed** |
| **Present for armed portion** | **Confirmed** |
| **Can monitor 15-minute timer** | **Confirmed** |
| **Can execute immediate rollback** | **Confirmed** |
| **No work/travel/appointment/family conflicts with critical sequence** | **Confirmed by operator direction** |

**Operator uninterrupted availability:** **Confirmed**

---

## 10. Operational assumptions (reconfirmed — read-only)

| Check | Result |
|-------|--------|
| **HX370 accessible** | **Expected — yes** |
| **PowerShell/Cursor available** | **Expected — yes** |
| **Remote or local access** | **Expected — yes** |
| **Stable power and internet** | **Expected — yes** |
| **No Windows restart/update planned** | **Expected — yes** |
| **Signer configuration available** | **Expected — boolean only · no secret exposure** |
| **Read-only RPC available** | **Expected — yes** |
| **Production flat** | **Yes** |
| **Executor count zero** | **Yes** |
| **No pending code/config changes** | **Yes** |

**Production-host access:** **Expected ready** · **Remote/local access readiness:** **Expected ready** · **Power/internet readiness:** **Expected ready** · **Signer/RPC readiness:** **Expected ready** *(boolean verification at proof gates)*

---

## 11. Process-readiness facts (from pre-G1 capture — reconfirmed)

| Item | Status |
|------|--------|
| **Monitor restart wrapper identity** | **Resolved** — exact command identity documented |
| **Dashboard launcher** | **PASSIVE_LAUNCHER** — not unnecessarily stopped |
| **Scanner external wrapper** | **Not positively identified** — gmgn `--watch` only |
| **Observation loops** | **Must close before Final Fresh Domain A** — operator cleanup |
| **FOMO Wallet Monitor** | **Excluded** — `FOMO-Wallet-Intel\run-monitor.bat` |
| **Restoration procedure** | **Documented** — runbook §6 |
| **Proof command plan** | **Staged** — not executed |
| **Rollback plan** | **Staged** — not executed |

**Process-readiness status:** **READY pending live re-scan at Domain A gate**

---

## 12. Today's coordinated sequence

1. **RB-G9 AP03 Operating Window Reselection** *(this gate)*
2. **RB-G9-20260711-AP03 Fresh R15 Authorization**
3. **RB-G9-20260711-AP03 Arming Authorization**
4. **RB-G9-20260711-AP03 Runtime Stub Creation Authorization**
5. **RB-G9-20260711-AP03 Armed No-Submit Proof Authorization**
6. **RB-G9-20260711-AP03 Process Isolation Authorization**
7. **Final Fresh Domain A Proof for RB-G9-20260711-AP03**
8. **Process Isolation Gate**
9. **Arming Transition Gate**
10. **Runtime Stub Creation Gate**
11. **Armed No-Submit Proof Execution Gate**
12. **Immediate Domain C Closure**

Steps 2–6: coordinated governance block beginning ~**15:00 MDT**. Steps 7–12: coordinated operating block same day.

---

## 13. Fresh G1 timing (design — not signed in this gate)

| Rule | Value |
|------|-------|
| **Sign timing** | During today's coordinated governance block (~15:00 MDT onward) |
| **Minimum recommended expiry** | **`2026-07-12T07:00:00Z`** *(extends beyond block end + closure contingency)* |
| **Expiry must cover** | Full operating window · Domain C closure · filing contingency |
| **48-hour default** | **Not required** — bounded proof-day expiry sufficient if ≥ minimum |
| **oneSessionOnly** | **true** |
| **Non-reusable** | **true** |

**Fresh G1 canonical path (future — not created):**

```
Authorizations/AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260711-AP03 — 2026-07-11.md
```

---

## 14. No-rush thresholds (preserved — fail closed)

| Threshold | Minimum | Override |
|-----------|---------|----------|
| Fresh G1 lifetime before Final Fresh Domain A | **≥ 4 hours** | **Forbidden** |
| Domain A freshness before Process Isolation | **≥ 20 minutes** | **Forbidden** |
| Domain A freshness before C1 | **≥ 12 minutes** | **Forbidden** |
| LIVE_ARMED time remaining before AP invocation | **≥ 10 minutes** | **Forbidden** |

**Note:** With block start **15:00 MDT**, fresh G1 should be signed **no later than ~15:00 MDT** if Domain A follows immediately after G1–G4 validation; if G1 signed at block start, earliest Domain A under 4h rule is **~19:00 MDT** unless G1 is signed earlier in the preparation window.

---

## 15. Post-gate verification

| Check | Result |
|-------|--------|
| **AP03 G1 created** | **No** |
| **G2/G3/G4 created** | **No** |
| **System remains disarmed** | **Yes** |
| **Processes stopped or started** | **No** |
| **Config/environment changed** | **No** |
| **Runtime stub / session folder** | **Not created** |
| **Domain A / isolation / C1–C3** | **Not performed** |
| **Submit/sign/broadcast** | **No** |
| **Authorizations/README.md changed** | **No** |
| **Sessions/README.md updated** | **Yes** |

Readiness/profitability claims: **none**

---

## 16. Recommended next gate

**RB-G9-20260711-AP03 Fresh R15 Authorization**

---

**Receipt path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9 AP03 OPERATING WINDOW RESELECTION — 2026-07-11.md`
