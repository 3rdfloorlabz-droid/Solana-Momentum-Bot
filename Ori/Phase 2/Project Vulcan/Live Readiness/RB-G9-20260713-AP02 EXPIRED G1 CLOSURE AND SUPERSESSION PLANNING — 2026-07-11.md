# RB-G9-20260713-AP02 Expired G1 Closure and Supersession Planning — 2026-07-11

Status:
**PLANNING COMPLETE — PRODUCTION DISARMED UNCHANGED — NO G1 MODIFIED — NO REPLACEMENT SIGNED**

Gate type:
Governance planning — expired AP02 G1 closure and proof-day supersession design only

Prerequisites:
Signed AP02 G1 (`…AP02 — 2026-07-11.md`) · AP02 operating window selection · AP02 pre-G1 readiness · AP02 arming authorization planning · AP01 closure · stale-handoff AP01 isolation receipt

Planning capture UTC:
**`2026-07-11T19:12:31.442Z`**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**Current G1 modified:** **No** · **Replacement G1 created:** **No** · **G2/G3/G4 created:** **No** · **Closure record filed:** **No** *(pending authorized closure gate)* · **Indexes updated:** **No** *(pending closure gate)*

---

## 1. Prominent post-gate state

> **DISARMED · DRY · NO TRADE**
>
> **AP02 G1 TIMING DEFECT CONFIRMED**
>
> **SAME-SESSION REPLACEMENT PERMITTED — PENDING FORMAL CLOSURE**
>
> **NO AUTHORIZATION · PROCESS · CONFIG · RUNTIME CHANGE IN THIS GATE**

---

## 2. Files inspected (read-only)

| File | Purpose |
|------|---------|
| `Authorizations/AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260713-AP02 — 2026-07-11.md` | Signed AP02 G1 — SIGNED/UNUSED |
| `RB-G9 AP02 R15 AUTHORIZATION — 2026-07-11.md` | G1 gate receipt |
| `RB-G9 AP02 R15 AUTHORIZATION PLANNING — 2026-07-11.md` | AP02 G1 design |
| `RB-G9 AP02 ARMING AUTHORIZATION PLANNING — 2026-07-11.md` | G2 design · timing conflict · session-ID preliminary resolution |
| `RB-G9 AP02 OPERATING WINDOW SELECTION — 2026-07-11.md` | Confirmed proof window |
| `RB-G9 AP02 PRE-G1 OPERATIONAL READINESS — 2026-07-11.md` | Process/wrapper classifications |
| `RB-G9 AP02 PROOF-DAY RUNBOOK — 2026-07-11.md` | Proof-day sequence staging |
| `RB-G9-20260709-AP01 UNUSED AUTHORIZATION CHAIN CLOSURE — 2026-07-11.md` | Closure precedent |
| `RB-G9-20260709-AP01 PROCESS ISOLATION GATE — 2026-07-11 — STALE HANDOFF.md` | AP01 stale-handoff failure |
| `analysis/rb_g9_20260709_ap01_process_isolation_receipt.json` | Machine stale-handoff receipt |
| `Authorizations/README.md` | Authorization index |
| `Sessions/README.md` | Session index |
| `Decisions/DECISION — R15 Dual-Purpose Approval Schema — 2026-07-09.md` | schemaVersion 2 |
| `Decisions/DECISION — Armed No-Submit Production Proof — 2026-07-09.md` | Proof policy |
| `r15_approval_validator.js` | Stub JSON validation · expiry · consumed |
| `armed_preflight_session.js` | Explicit-path chain validation · consumed detection · forbidden session IDs |
| `test_armed_preflight_prerequisites.js` | Regression: no latest-file inference |
| `live_config.json` | Disarmed posture verification |

Signed AP02 G1 body **not modified**. Production code/tests **not modified**.

---

## 3. AP02 G1 timing-defect result

| Field | Value |
|-------|-------|
| **G1 signature UTC** | **`2026-07-11T02:53:21Z`** |
| **G1 expiry UTC** | **`2026-07-13T02:53:21Z`** *(48 hours after signature)* |
| **Proof-window start UTC** | **`2026-07-13T20:00:00Z`** *(14:00 MDT)* |
| **Proof-window end UTC** | **`2026-07-14T02:00:00Z`** *(20:00 MDT)* |
| **Exact expiry-to-window-start gap** | **`17 hours 6 minutes 39 seconds`** *(61,599,000 ms)* |
| **G1 remaining at block start** | **None** — expired ~17h 6m earlier |

**G1 timing-defect result:** **FAIL — CURRENT AP02 G1 CANNOT SUPPORT THE SELECTED OPERATING WINDOW**

Current G1 **cannot** authorize proof-day Final Fresh Domain A · Process Isolation · C1–C3 · stub creation · armed proof · or AP/N6 invocation. **Do not sign G2–G4 against this G1.**

---

## 4. Same-session replacement safety evaluation

### 4.1 Question

May **`RB-G9-20260713-AP02`** retain the same session ID with an explicitly versioned replacement G1 (`…AP02 — 2026-07-13.md`), or is **`RB-G9-20260713-AP03`** required?

### 4.2 Runtime guard and discovery audit

| Area | Finding | Ambiguity |
|------|---------|-----------|
| **Authorization discovery** | `armed_preflight_session.js` requires **exactly four explicit paths** (`--auth-g1` … `--auth-g4`) or one session manifest JSON — **no directory scan** | **None** — confirmed by `test_armed_preflight_prerequisites.js` test 8 |
| **“Latest file” / filename-order inference** | **Absent** — no `readdirSync`, `glob`, or “latest authorization” logic | **None** |
| **Duplicate path in chain** | Rejected — `duplicate authorization document path` error | **None** |
| **Mixed-session G1–G4** | Rejected at AP-02 preflight | **None** |
| **Consumed/closed detection** | Body-text regex: `CONSUMED/CLOSED`, `do not reuse`, etc. — **only on explicitly referenced file** | **Low** — index-only closure does not auto-mark signed body; mitigated by manifest + fingerprint binding |
| **Markdown G1 expiry enforcement** | **Not enforced** in `armed_preflight_session.js` — expiry enforced on runtime stub JSON via `r15_approval_validator.js` | **Operational** — proof-day gates must reject expired paths; not discovery ambiguity |
| **FORBIDDEN_PATH_MARKERS** | EV01/EV02 only — AP02 early G1 **not** hard-denylisted in code | **Low** — mitigated by closure index + explicit fresh-path manifest |
| **FORBIDDEN_SESSION_IDS** | EV01/EV02 only — AP02 session ID **valid** | **None** |
| **Two G1 files same session ID** | Distinct canonical paths by `{SIGN_DATE}` — no collision | **None** |
| **G2–G4 fingerprint binding** | G2 must cite exact fresh G1 path + fingerprint — mismatch fails gate validation | **None** if procedure followed |
| **Audit history** | Two G1 records + closure record — same pattern as AP01 unused chain | **Manageable** |

### 4.3 Explicit proof requirements (task 4)

| Requirement | Satisfied by same-session replacement? | Mechanism |
|-------------|----------------------------------------|-----------|
| Replacement G1 has unique canonical path | **Yes** | `…RB-G9-20260713-AP02 — 2026-07-13.md` vs `…2026-07-11.md` |
| Old G1 formally closed before replacement signing | **Yes** *(planned)* | Separate closure gate + index update — signed body unchanged |
| Old fingerprint explicitly non-authoritative | **Yes** *(planned)* | Closure record + `Authorizations/README.md` status + machine receipt |
| G2–G4 bind only replacement fingerprint and exact path | **Yes** *(planned)* | Proof-day G2 text must cite `…2026-07-13.md` + new fingerprint |
| Runtime guard rejects old G1 | **Conditional** | Guard rejects old path **if** referenced file contains consumed markers **or** operator passes wrong path and G2 fingerprint binding fails at gate; **not** automatic directory rejection — explicit-path architecture by design |
| No “latest file” inference | **Yes** | Code + regression tests |
| No duplicate-session ambiguity in indexes/validators | **Yes** | With closure index discipline |

### 4.4 Residual risks and mitigations

| Risk | Mitigation |
|------|------------|
| Operator passes old G1 path by mistake | Session manifest lists fresh paths only; G2 binds fresh fingerprint; proof-day validation gate verifies fingerprints before Domain A |
| Old G1 still “signed” in filesystem | Closure index marks **CLOSED — EXPIRED_UNUSED / SUPERSEDED_BEFORE_EXECUTION**; never delete signed body |
| Expired old G1 passed after `2026-07-13T02:53:21Z` | Naturally expired; proof-day timing gate rejects; stub mirror uses fresh expiry |
| Interpretation of G1 § “AP02 retry without new chain forbidden” | Clarified: forbids **reusing expired/consumed chain** — **not** forbidding fresh G1–G4 after formal closure and supersession |

### 4.5 Fail-closed decision rule application

**Ambiguity in authorization discovery or latest-file selection:** **None**

**Ambiguity in runtime auto-rejection of old G1 without explicit path discipline:** **Low** — bounded by explicit-path architecture; same limitation existed for AP01 and is accepted when closure + manifest + fingerprint binding are mandatory.

**Same-session replacement permitted:** **Yes**

**Final recommended session ID:** **`RB-G9-20260713-AP02`**

**Use `RB-G9-20260713-AP03` only if:** closure/supersession cannot be documented unambiguously · governance rejects two G1 files under one session ID · or proof-day manifest/fingerprint binding fails review.

---

## 5. Current AP02 G1 proposed closure design

| Field | Value |
|-------|-------|
| **Proposed disposition** | **`CLOSED — EXPIRED_UNUSED / SUPERSEDED_BEFORE_EXECUTION`** |
| **Signed body** | **Unchanged** — no edits to `…AP02 — 2026-07-11.md` |
| **Fingerprint preserved** | **`f2c495ec6784df10d9a211a5d5748a8461f6060b4f646fa369d8fc4ab7ed014a`** |
| **Signature timestamp preserved** | **`2026-07-11T02:53:21Z`** |
| **Expiry preserved** | **`2026-07-13T02:53:21Z`** |
| **Consumed claim** | **No** — never armed · never executed |
| **Arming claim** | **No** |
| **Execution claim** | **No** |
| **Permanently non-reusable** | **Yes** |
| **Closure record required** | **Yes** — separate gate receipt (not this planning gate) |
| **Index updates** | **`Authorizations/README.md`** · **`Sessions/README.md`** — only after authorized closure gate |
| **Closure record required** | **Yes** |

Follows AP01 closure precedent: `RB-G9-20260709-AP01 UNUSED AUTHORIZATION CHAIN CLOSURE — 2026-07-11.md`.

**Note:** Only G1 exists for AP02 today. G2–G4 were never signed. Closure gate scope is **G1-only supersession** — not a full chain closure.

---

## 6. Fresh authorization timing design

| Rule | Value |
|------|-------|
| **Sign fresh G1–G4** | **Proof day** — inside confirmed operating block or immediately before Domain A chain |
| **Fresh G1 must extend beyond operating block end** | Through **`2026-07-14T02:00:00Z`** + contingency |
| **Recommended minimum fresh G1 expiry** | **`2026-07-14T06:00:00Z`** *(4h after block end)* |
| **Typical validity if signed ~14:30 MDT Jul 13** | 48h → approx **`2026-07-15T20:30:00Z`** — exceeds minimum |
| **Fresh G1 minimum remaining lifetime before Domain A** | **≥ 4 hours** |
| **Automatic extension of current G1** | **Forbidden** |
| **Reuse after proof/abort/disarm/expiry** | **Forbidden** |

### Fresh G1 canonical path (future — not created in this gate)

```
Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260713-AP02 — 2026-07-13.md
```

`{SIGN_DATE}` = **`2026-07-13`** expected on proof day.

---

## 7. Fastest valid proof-day chain

| Step | Gate / action |
|------|---------------|
| **1** | Confirm operator · access · power · network · signer/RPC boolean readiness |
| **2** | **Close/supersede expired AP02 G1** — `…2026-07-11.md` → CLOSED |
| **3** | **Sign fresh final-session G1** — `…2026-07-13.md` · expiry ≥ `2026-07-14T06:00:00Z` |
| **4** | **Sign G2** — Arming Authorization · binds fresh G1 path + fingerprint |
| **5** | **Sign G3** — Runtime Stub Creation Authorization |
| **6** | **Sign G4** — Armed No-Submit Proof Authorization |
| **7** | **Sign Process Isolation Scope Amendment** *(or incorporate into G2)* |
| **8** | **Validate fingerprints and session bindings** — explicit-path manifest |
| **9** | **Close unnecessary observation loops** — operator cleanup before Domain A |
| **10** | **Final Fresh Domain A Proof for RB-G9-20260713-AP02** |
| **11** | **Process Isolation Gate** — immediately after Domain A PASS |
| **12** | Continue **only if** freshness thresholds pass |
| **13** | **Arming Transition Gate** (C1–C3) |
| **14** | **Runtime Stub Creation Gate** |
| **15** | **Armed No-Submit Proof Execution Gate** |
| **16** | **Immediate Domain C Closure** |

Steps 2–8: one coordinated governance block (~14:30 MDT recommended). Steps 9–16: one coordinated operating block.

---

## 8. Process-isolation rules preserved

| Rule | Detail |
|------|--------|
| **Monitor restart wrapper** | Stop by **exact command identity** before `monitor.js` |
| **Stop order** | Wrapper before Node child |
| **Dashboard passive launcher** | **Not stopped** unless future inventory positively proves active restart |
| **`dashboard_server.js`** | Authorized Node target |
| **`scanner_gmgn_trending.js --watch`** | Authorized Node target |
| **Scanner external wrapper** | Stop only if **positively identified** — pre-G1 capture showed none for gmgn |
| **Observation loops** (`b2a_24h`, `scanner.js`) | **Absent before Domain A** — operator cleanup |
| **FOMO Wallet Monitor** | **Explicitly excluded** — `FOMO-Wallet-Intel\run-monitor.bat` |
| **Broad PowerShell/Node termination** | **Forbidden** |
| **No-respawn observation** | **≥ 10 seconds** |
| **Output** | New **`isolatedProcessSetHash`** required for AP02 |

**Approved monitor restart-wrapper identity (carry-forward):**

```
powershell.exe -NoExit -Command cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot; while ($true) { Get-Date; node monitor.js; Start-Sleep -Seconds 60 }
```

---

## 9. No-rush thresholds preserved

| Threshold | Minimum | Override |
|-----------|---------|----------|
| Fresh G1 lifetime before Final Fresh Domain A | **≥ 4 hours** | **Forbidden** |
| Domain A freshness before Process Isolation | **≥ 20 minutes** | **Forbidden** |
| Domain A freshness before C1 | **≥ 12 minutes** | **Forbidden** |
| LIVE_ARMED time remaining before AP invocation | **≥ 10 minutes** | **Forbidden** |

Any threshold failure → **fail closed and reschedule** — no override.

---

## 10. Armed no-submit versus live-trading distinction

| Statement | Recorded |
|-----------|----------|
| AP02 remains an **armed no-submit engineering proof** | **Yes** |
| Does **not** authorize a real trade | **Yes** |
| Does **not** authorize capital exposure in this gate or proof chain | **Yes** |
| Successful completion may support **later** live-trading authorization planning only | **Yes** |
| This chain must **not** be described as live trading | **Yes** |

**Armed no-submit versus live-trading distinction recorded:** **Yes**

---

## 11. Post-proof path toward live trading

After a successful armed no-submit proof and Domain C closure, recommend a **separate** gate:

**`RB-G10 Bounded Micro-Live Authorization Planning`**

That later gate may evaluate (design only — **no artifacts created now**):

- One bounded micro-live trade
- Authorized size no greater than prior governed maximum unless separately approved
- Candidate and quote controls
- Explicit submit/sign/broadcast authority
- Reconciliation and recovery
- Capital-loss cap
- Immediate shutdown rules

**Post-proof live-trading gate identified:** **Yes** — **`RB-G10 Bounded Micro-Live Authorization Planning`** *(future · not created)*

---

## 12. Authorization-discovery and runtime-guard summary

| Field | Result |
|-------|--------|
| **Authorization-discovery ambiguity** | **None** — explicit paths / manifest only |
| **Runtime-guard ambiguity** | **Low** — no auto-directory selection; old-path rejection relies on closure index + fingerprint binding + operator discipline |
| **Duplicate-session risk** | **Low** — distinct filenames · manifest binds one chain · closure index marks early G1 non-authoritative |

---

## 13. Post-gate verification

| Check | Result |
|-------|--------|
| Current G1 modified | **No** |
| Replacement G1 created | **No** |
| G2 / G3 / G4 created | **No** |
| Production code / tests changed | **No** |
| Config / environment changed | **No** |
| Processes stopped or started | **No** |
| Runtime stub / session folder created | **No** |
| C1/C2/C3 performed | **No** |
| Submit/sign/broadcast invoked | **No** |
| Position/reconciliation/recovery/capital | **None** |
| System remains disarmed | **Yes** |
| OR-20260630-008 status | **not_promoted** |
| Readiness/profitability claims | **No** |

---

## 14. Planning gate status

**PASS — PLANNING COMPLETE**

---

## 15. Recommended next gate

**RB-G9-20260713-AP02 Expired G1 Closure**

*(Formal closure of `…AP02 — 2026-07-11.md` · index updates · machine receipt · then proof-day fresh G1 authorization on 2026-07-13)*

**Alternate if same-session replacement rejected at closure review:**

**RB-G9-20260713-AP03 R15 Authorization Planning**

---

**Receipt path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9-20260713-AP02 EXPIRED G1 CLOSURE AND SUPERSESSION PLANNING — 2026-07-11.md`
