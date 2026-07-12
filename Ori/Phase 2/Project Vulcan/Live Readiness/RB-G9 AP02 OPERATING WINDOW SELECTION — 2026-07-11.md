# RB-G9 AP02 Operating Window Selection — 2026-07-11

Status:
**OPERATING WINDOW CONFIRMED — PRODUCTION DISARMED UNCHANGED — NO AP02 AUTHORIZATION SIGNED — NO SESSION FOLDER**

Gate type:
Scheduling / governance selection only — explicit operator date and uninterrupted operating-window confirmation

Prerequisites:
`RB-G9 AP02 R15 AUTHORIZATION PLANNING — 2026-07-11.md` · `RB-G9-20260709-AP01 UNUSED AUTHORIZATION CHAIN CLOSURE — 2026-07-11.md`

Selection capture UTC:
**`2026-07-11T02:17:12Z`**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**AP02 G1 signed:** **No** · **AP02 G2–G4:** **Not created** · **Session folder:** **Not created** · **Runtime stub:** **Not created** · **Processes changed:** **No**

---

## 1. Prominent post-gate state

> **DISARMED · DRY · NO TRADE**
>
> **AP02 OPERATING WINDOW CONFIRMED**
>
> **NO AP02 AUTHORIZATION SIGNED · NO TECHNICAL ACTION AUTHORIZED**

Date/window confirmation **does not** authorize arming, isolation, Domain A, stub creation, proof execution, or any execution path.

---

## 2. Files inspected (read-only)

| File | Purpose |
|------|---------|
| `RB-G9 AP02 R15 AUTHORIZATION PLANNING — 2026-07-11.md` | AP02 G1 design · provisional timing · no-rush thresholds · authorization sequence |
| `RB-G9-20260709-AP01 UNUSED AUTHORIZATION CHAIN CLOSURE — 2026-07-11.md` | AP01 closure · separation validation |
| `RB-G9 ARMED NO-SUBMIT PROOF REAUTHORIZATION PLANNING — 2026-07-10.md` | AP02 replacement chain design |
| `Authorizations/README.md` · `Sessions/README.md` | Index state · session collision check |
| `live_config.json` | Disarmed posture verification (no `.env` read) |

Signed AP01 authorization bodies **not edited**.

---

## 3. Proposed operating block (presented for confirmation)

| Field | Value |
|-------|-------|
| **Proposed date** | **Monday, 2026-07-13** |
| **Proposed local window** | **14:00–20:00 MDT** *(2:00 PM–8:00 PM Mountain Daylight Time)* |
| **Proposed UTC window** | **`2026-07-13T20:00:00Z`** through **`2026-07-14T02:00:00Z`** |
| **Proposed block length** | **6 hours** |
| **Proposed session ID** | **`RB-G9-20260713-AP02`** |

---

## 4. Operator decision (explicit — not inferred)

| Field | Value |
|-------|-------|
| **Operator** | **Taylor Cheaney** |
| **Decision** | **`APPROVED — 2026-07-13, 14:00–20:00 MDT`** |
| **Decision form** | Explicit structured acceptance *(acceptable acceptance string per gate spec)* |
| **Inferred from planning text** | **No** |
| **Inferred from silence or provisional language** | **No** |

---

## 5. Selected operating window (canonical)

| Field | Value |
|-------|-------|
| **Selected proof date** | **`2026-07-13`** |
| **Selected local window** | **`14:00–20:00 MDT`** |
| **Selected UTC window** | **`2026-07-13T20:00:00Z`** – **`2026-07-14T02:00:00Z`** |
| **Block length** | **6 hours** |
| **Final AP02 session ID** | **`RB-G9-20260713-AP02`** |
| **Session folder** | **Not created** *(future at Domain C closure only if proof executes)* |

### Session collision check

| Session ID | Status | Collision |
|------------|--------|-----------|
| `RB-G9-20260706-EV01` | CONSUMED/CLOSED | **No** |
| `RB-G9-20260707-EV02` | CONSUMED/CLOSED | **No** |
| `RB-G9-20260709-AP01` | CLOSED — never executed | **No** |
| `RB-G9-20260713-AP02` | **Confirmed — not yet signed** | **No collision** |

**Session collision result:** **PASS — no collision · AP01 not reused**

---

## 6. Window validation

| Check | Result |
|-------|--------|
| Minimum uninterrupted block (≥ 4 h) | **PASS** — 6 h |
| Preferred six-hour block | **PASS** |
| Session ID date matches proof date | **PASS** — `20260713` |
| Not close to planned authorization expiry | **PASS** — no AP02 auth signed yet; G1 recommended near operating window with 48 h validity |
| Sufficient time for full chain + contingency | **PASS** — ~180 min safe budget within 6 h block |

**Minimum safe-time budget (reference — planning note §5):**

| Phase | Allowance |
|-------|-----------|
| G1–G4 + isolation amendment validation | 20 min |
| Final Fresh Domain A | 20 min |
| Process Isolation + observation | 20 min |
| Arming transition | 15 min |
| Runtime stub creation + validation | 10 min |
| Armed validator + AP manifest + N6 | 20 min |
| Disarm + stub removal | 15 min |
| Domain C + safety suite + RB-G9 filing | 30 min |
| Contingency margin | 30 min |
| **Total** | **~180 min (3 h)** |

**Remaining margin in 6 h block:** **~3 h** — supports no-rush thresholds and operator contingency.

### No-rush thresholds (carry-forward — enforced at execution gates)

| Threshold | Minimum remaining | Fail-closed action |
|-----------|-------------------|-------------------|
| G1 lifetime before Final Fresh Domain A starts | **≥ 4 hours** | Do not begin Domain A · reschedule |
| Domain A freshness before Process Isolation starts | **≥ 20 minutes** | Do not begin isolation · recapture or abort |
| Domain A freshness before C1 | **≥ 12 minutes** | Do not begin C1 · recapture or abort |
| 15-minute armed window before AP invocation | **≥ 10 minutes** | Do not invoke AP · disarm |

**G1 sign target (if proof starts 14:00 MDT):** no later than **2026-07-13 10:00 MDT** *(≥ 4 h before Domain A per threshold)*.

---

## 7. Operator conditions (proof-day commitments)

By accepting the uninterrupted 6-hour block, Taylor attests intent to satisfy these conditions on **2026-07-13** during the selected window. Detailed re-confirmation occurs at G1 signing.

| Condition | Status |
|-----------|--------|
| Uninterrupted access to production host (HX370) | **conditional** — committed for selected block; re-confirm at G1 |
| Present for full armed portion | **conditional** |
| Can monitor 15-minute armed timer | **conditional** |
| Can immediately perform rollback if instructed | **conditional** |
| Remote connection expected available | **conditional** |
| No unrelated code/config work during operating block | **conditional** |
| No travel/work/family commitment interrupting critical sequence | **conditional** |

---

## 8. Equipment and access assumptions (proof day)

| Assumption | Status |
|------------|--------|
| Production HX370 accessible | **conditional** |
| Surface/remote access available if used | **conditional** |
| Reliable power | **conditional** |
| Reliable internet | **conditional** |
| Signer configuration available *(boolean only — no secrets)* | **conditional** |
| Helius read-only RPC access expected | **conditional** |
| PowerShell/Cursor access expected | **conditional** |
| No device restart or Windows update planned during block | **conditional** |

---

## 9. Operational prerequisites (before G1 signing on proof day)

| Prerequisite | Status |
|--------------|--------|
| Monitor wrapper identity verified | **not-yet** — carry-forward design from planning; verify before G1 |
| Dashboard wrapper behavior verified or classified non-restarting | **not-yet** |
| Scanner wrapper positively identified or confirmed absent | **not-yet** |
| FOMO Wallet Monitor exclusion preserved | **design preserved** — verify before isolation gate |
| Process-start restoration procedure documented | **not-yet** |
| Proof commands pre-staged *(not executed early)* | **not-yet** |
| Rollback commands pre-staged *(not executed early)* | **not-yet** |
| No pending code or config changes | **conditional** — none planned for operating block; re-confirm at G1 |
| Flat capital state | **yes** — disarmed · dry-run · no open position |

**Wrapper prerequisites status:** **not-yet verified** *(design carry-forward from AP01 amendment planning)*

**Restoration procedure status:** **not-yet documented**

---

## 10. Scheduling decision validity

| Rule | Detail |
|------|--------|
| Date/window confirmation authorizes technical action | **No** |
| Material date change | Requires new **RB-G9 AP02 Operating Window Selection** |
| Minor start-time adjustment within block | Must be documented before G1 signing |
| AP02 authorizations signed substantially early | **Discouraged** — sign near selected operating window |
| G1–G4 signing | **One coordinated governance block** near selected operating window on proof day |

---

## 11. Coordinated operating-block rule (carry-forward)

| Rule | Detail |
|------|--------|
| G1–G4 signing | One coordinated governance block (same session day as proof) |
| Final Fresh Domain A | Starts immediately after G1–G4 validation |
| Process Isolation | Starts immediately after Domain A completion |
| C1 | Only after isolation **PASS** |
| Environment | No unrelated shells · editors · process · config changes between gates |
| Operator | One clock · one timer source |
| Pre-staging | Rollback and proof commands ready · not executed early |

---

## 12. AP02 authorization sequence (unchanged — not started)

1. **RB-G9 AP02 R15 Authorization** *(G1)*
2. **AP02 G2 Arming Authorization**
3. **AP02 G3 Runtime Stub Creation Authorization**
4. **AP02 G4 Armed No-Submit Proof Authorization**
5. **AP02 Process Isolation Scope Amendment Authorization**
6. **Final Fresh Domain A Proof for AP02**
7. **Process Isolation Gate**
8. **Arming Transition Gate**
9. **Runtime Stub Creation Gate**
10. **Armed No-Submit Proof Execution Gate**
11. **Immediate Domain C Closure**

Steps 1–5 may occur in one coordinated governance session. Steps 6–11 must occur in one coordinated operating block within the confirmed window.

---

## 13. Readiness assessment

| Field | Value |
|-------|-------|
| **Operating-window status** | **CONFIRMED** |
| **Ready for AP02 G1 authorization** | **CONDITIONAL** |
| **Rationale** | Date and uninterrupted 6-hour window explicitly confirmed; pre-G1 prerequisites *(wrapper verification, restoration procedure, proof/rollback pre-staging)* remain **not-yet** |
| **System remains disarmed** | **Yes** |
| **AP02 authorization created** | **No** |

---

## 14. Post-gate verification

| Check | Result |
|-------|--------|
| Production code / tests changed | **No** |
| Config / environment changed | **No** |
| Processes stopped or started | **No** |
| Runtime stub / session folder created | **No** |
| C1/C2/C3 performed | **No** |
| Submit/sign/broadcast invoked | **No** |
| Capital state | **None** |
| AP01 records altered | **No** |

Readiness/profitability claims: **none**

---

## 15. Gate status

**PASS — OPERATING WINDOW CONFIRMED**

---

## 16. Recommended next gate

**RB-G9 AP02 R15 Authorization**

*(G1 signing only after pre-G1 prerequisites satisfied and within coordinated governance block near 2026-07-13 operating window)*

---

**Receipt path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9 AP02 OPERATING WINDOW SELECTION — 2026-07-11.md`
