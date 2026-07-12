# RB-G9 Armed No-Submit Proof Reauthorization Planning — 2026-07-10

Status:
**PLANNING COMPLETE — PRODUCTION DISARMED UNCHANGED — AP01 CHAIN UNTOUCHED — NO AP02 AUTHORIZATIONS SIGNED**

Gate type:
Replacement-session authorization strategy — planning and documentation only

Prerequisites:
Signed AP01 G1–G4 · signed Process Isolation Scope Amendment · failed Process Isolation receipts · Domain A recapture receipts · armed no-submit proof policy decisions

Planning capture UTC:
**`2026-07-11T01:44:29Z`**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**AP02 authorizations signed:** **No** · **AP01 chain modified:** **No** · **Processes stopped:** **No** · **Domain A recaptured:** **No** · **C1/C2/C3:** **No** · **Runtime stub / session folder:** **Not created**

---

## 1. Prominent post-gate state

> **DISARMED · DRY · NO TRADE**
>
> **AP02 REAUTHORIZATION STRATEGY DOCUMENTED**
>
> **AP01 CHAIN REMAINS SIGNED/UNUSED — NOT EXTENDED — NOT REUSED**

---

## 2. Files inspected (read-only)

| File | Purpose |
|------|---------|
| `Authorizations/AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260709-AP01 — 2026-07-09.md` | Signed G1 |
| `Authorizations/AUTHORIZATION — Arming — RB-G9-20260709-AP01 — 2026-07-09.md` | Signed G2 |
| `Authorizations/AUTHORIZATION — Runtime Stub Creation — RB-G9-20260709-AP01 — 2026-07-09.md` | Signed G3 |
| `Authorizations/AUTHORIZATION — Armed No-Submit Proof — RB-G9-20260709-AP01 — 2026-07-09.md` | Signed G4 |
| `Authorizations/AUTHORIZATION — Process Isolation Scope Amendment — RB-G9-20260709-AP01 — 2026-07-10.md` | Signed additive amendment |
| `FRESH ARMED NO-SUBMIT PROOF SESSION R15 AUTHORIZATION — 2026-07-09.md` | G1 gate receipt |
| `FRESH ARMED NO-SUBMIT PROOF ARMING AUTHORIZATION — 2026-07-09.md` | G2 gate receipt |
| `FRESH ARMED NO-SUBMIT RUNTIME STUB CREATION AUTHORIZATION — 2026-07-09.md` | G3 gate receipt |
| `FRESH ARMED NO-SUBMIT PROOF AUTHORIZATION — 2026-07-09.md` | G4 gate receipt |
| `RB-G9-20260709-AP01 PROCESS ISOLATION SCOPE AMENDMENT PLANNING — 2026-07-10.md` | Amendment design |
| `RB-G9-20260709-AP01 PROCESS ISOLATION SCOPE AMENDMENT AUTHORIZATION — 2026-07-10.md` | Amendment gate receipt |
| `RB-G9-20260709-AP01 PROCESS ISOLATION GATE — 2026-07-10.md` | Isolation attempt 1 |
| `RB-G9-20260709-AP01 PROCESS ISOLATION GATE — 2026-07-10 — RETRY.md` | Isolation retry |
| `FINAL FRESH DOMAIN A PROOF — RB-G9-20260709-AP01 — 2026-07-10 — RECAPTURE.md` | Latest Domain A recapture |
| `Decisions/DECISION — Armed No-Submit Production Proof — 2026-07-09.md` | Proof policy |
| `Decisions/DECISION — R15 Dual-Purpose Approval Schema — 2026-07-09.md` | schemaVersion 2 |
| `Authorizations/README.md` | Authorization index |
| `Sessions/README.md` | Session evidence index |
| `EV02 NO-TRADE DISARM AND RB-G9 CLOSURE — 2026-07-08.md` | Prior closure pattern |
| `ARMED-STATE NO-TRADE DISARM AND RB-G9 GATE — 2026-07-07.md` | EV01 closure pattern |
| `ARMED-CONTEXT ARMED NO-SUBMIT PROOF PLANNING — 2026-07-09.md` | G1–G4 chain design |

---

## 3. Current AP01 chain disposition recommendation

| Rule | Policy |
|------|--------|
| **Current G1–G4** | Remain **SIGNED/UNUSED** until expiry or formal closure — **no extension** |
| **Amendment** | Remain **SIGNED/UNUSED** until expiry or formal closure — **no extension** |
| **Reuse after expiry** | **Forbidden** |
| **Represent as executed** | **Forbidden** — AP01 never armed · never proof-executed |
| **Terminal classification** | **`EXPIRED_UNUSED`** for each auth record after G1 expiry if no execution occurs |
| **Closure classification** | **`SUPERSEDED_BEFORE_EXECUTION`** — AP02 replacement chain supersedes the unused attempt |

**Rationale:** AP01 progressed through governance signing, Domain A recapture, and failed-closed isolation attempts due to baseline timing — but **never** reached C1–C3, stub creation, arming, or proof execution. The chain should close with explicit evidence that it was **superseded by reauthorization planning** while preserving **`EXPIRED_UNUSED`** as the terminal status for each signed record after natural G1 expiry.

**Evidence preserved:**
- Never armed · never executed · never created runtime stub · never exposed capital
- Failed isolation receipts retained
- Expired baseline receipts retained (`299b09d5…` · `3b19a92f…` — never reuse)
- Amendment signed but isolation not consumed

| Field | Value |
|-------|-------|
| **Current G1–G4 modification required** | **No** |
| **Current amendment modification required** | **No** |

---

## 4. Proposed new session ID

| Field | Value |
|-------|-------|
| **Proposed session ID** | **`RB-G9-20260712-AP02`** |
| **Intended proof date** | **2026-07-12** *(operator may adjust at authorization time — ID date must match chosen execution date)* |
| **AP02 suffix** | Distinguishes from AP01 armed-no-submit attempt |
| **Session folder** | **Not created in this gate** |

### Session collision check

| Session ID | Status | Collision |
|------------|--------|-----------|
| `RB-G9-20260706-EV01` | CONSUMED/CLOSED | **No** |
| `RB-G9-20260707-EV02` | CONSUMED/CLOSED | **No** |
| `RB-G9-20260709-AP01` | SIGNED/UNUSED (closing) | **No** |
| `RB-G9-20260712-AP02` | Proposed | **No collision** |

**Do not reuse** EV01 · EV02 · AP01 session IDs or authorization records.

---

## 5. Replacement G1 design (AP02)

| Field | Value |
|-------|-------|
| **Record type** | R15 `ONE_SESSION_ONLY` · Armed No-Submit Proof · G1 |
| **schemaVersion** | **`2`** |
| **approvalPurpose** | **`armed_no_submit_proof_only`** |
| **finalApprovalStatus** | **`APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY`** *(exact)* |
| **oneSessionOnly** | **`true`** |
| **maximumArmedDurationMinutes** | **`15`** |
| **Assigned session ID** | **`RB-G9-20260712-AP02`** |
| **Proposed validity** | **48 hours** from signature *(minimum 24h; 48h recommended for comfortable governed chain)* |
| **Previous sessions (must not reuse)** | EV01 · EV02 · AP01 |

**Forbidden in G1 and all downstream gates:** candidate · quote · trade · submit · signing · broadcast · position · reconciliation · recovery · capital · executor loop · micro-live execution.

**Canonical path (future gate — not created here):**

```
Authorizations/AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260712-AP02 — {DATE}.md
```

---

## 6. Replacement G2 design (AP02)

| Field | Value |
|-------|-------|
| **Purpose** | One future C1–C3 posture transition only |
| **Session binding** | **`RB-G9-20260712-AP02`** · linked G1 fingerprint |
| **C1** | `.env` `FOMO_ENABLE_LIVE_SUBMISSION` unset → **`YES`** |
| **C2** | `live_config.json` `executionMode` **`PIPELINE_DRY_RUN`** → **`LIVE`** |
| **C3** | `live_config.json` `dryRunMode` **`true`** → **`false`** |
| **Maximum armed duration** | **15 minutes** |
| **Rollback** | D1–D11 unchanged from AP01 G2 |
| **Process-isolation amendment** | **Incorporated by reference** — AP02 isolation gate must bind signed AP02 Process Isolation Scope Amendment (carried forward from AP01 design) |
| **C1–C3 broadening** | **None** |

**G2 does not authorize:** stub creation · proof execution · AP/N6 · submit · broadcast · capital.

---

## 7. Replacement G3 design (AP02)

| Field | Value |
|-------|-------|
| **Purpose** | One future atomic runtime-stub creation only |
| **Path** | `analysis/r15_manual_approval_record.json` *(gitignored · non-canonical)* |
| **schemaVersion** | **`2`** proof-only mirror |
| **Session binding** | **`RB-G9-20260712-AP02`** · linked G1+G2 |
| **Creation timing** | Only after C1–C3 · `LIVE_ARMED` confirmed · armed timer active |
| **While disarmed** | **No stub** |
| **Early creation** | **Forbidden** |
| **Removal** | Immediate after proof · abort · ambiguity · or timeout |

---

## 8. Replacement G4 design (AP02)

| Field | Value |
|-------|-------|
| **Purpose** | One armed no-submit proof attempt only |
| **Session binding** | **`RB-G9-20260712-AP02`** · linked G1–G3 |
| **AP scope** | AP-01 through AP-20 |
| **AP-15** | **`NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE`** · rationale **`armed-no-submit-proof-scope`** |
| **N6** | One armed-safe invocation only |
| **Maximum LIVE_ARMED** | **15 minutes** total |
| **Closure** | Immediate disarm + Domain C regardless of outcome |
| **G4 scope expansion** | **None** |

---

## 9. Isolation amendment carry-forward (AP02)

AP02 must include a **new signed Process Isolation Scope Amendment** for session `RB-G9-20260712-AP02`, carrying forward AP01-approved rules:

| Rule | Carry-forward |
|------|---------------|
| **Authorized Node targets** | monitor.js · dashboard_server.js · scanner_gmgn_trending.js |
| **Monitor restart wrapper** | Pre-authorized by exact command identity only |
| **Dashboard restart wrapper** | Evidence-triggered only |
| **Scanner restart wrapper** | Positive identification required |
| **FOMO Wallet Monitor** | **Explicitly excluded** — `FOMO-Wallet-Intel\run-monitor.bat` |
| **Broad termination** | **Forbidden** — no all-PowerShell · all-Node · PID-tree · terminal · task · service kills |
| **Stop order** | Wrappers first → verify absent → Node targets → observe **≥ 10s** → prove no respawn |
| **Output** | Derive **`isolatedProcessSetHash`** |

AP01 amendment remains on AP01 session only — **not reused** after expiry. AP02 amendment is a **new signed record** with identical scope rules bound to AP02.

---

## 10. Clean authorization timing model

### 10.1 Do not sign too early

| Rule | Detail |
|------|--------|
| **Avoid** | Signing G1–G4 days before intended execution |
| **Avoid** | Multi-hour gap between Domain A completion and isolation |
| **Avoid** | Proof attempt near authorization expiry |

### 10.2 Recommended sequence

| Step | Action |
|------|--------|
| **a** | Choose intended proof date and operating window (**≥ 3 hours uninterrupted**) |
| **b** | Sign G1–G4 + isolation scope amendment in **one coordinated governance block** |
| **c** | **Immediately** run Final Fresh Domain A Proof |
| **d** | **Immediately** run Process Isolation Gate (within baseline freshness window) |
| **e** | Proceed to arming only if freshness and G1 thresholds pass |
| **f** | Complete full chain same session or **abort and disarm** — do not pause mid-chain |

### 10.3 Operator discipline

- Single operator clock/timer assigned before Domain A starts
- Pre-stage commands (read-only) without executing
- Pre-stage rollback commands without executing
- **No unrelated shells** opened between baseline and isolation
- **No Domain A recapture** until wrapper scope and scheduled-task exclusions verified

---

## 11. Minimum safe-time budget

Explicit planned allowances for AP02 full chain:

| Phase | Allowance |
|-------|-----------|
| G1–G4 + amendment validation | **15 min** |
| Final Fresh Domain A proof | **20 min** |
| Process isolation + 10s observation | **20 min** |
| Arming transition (C1–C3 + verify) | **15 min** |
| Runtime stub atomic creation + validation | **10 min** |
| Armed validator | **5 min** |
| AP manifest (AP-01–AP-20) | **10 min** |
| Armed-safe N6 (one invocation) | **5 min** |
| Immediate disarm + verify | **10 min** |
| Stub removal + verify absent | **5 min** |
| Domain C validator | **10 min** |
| Safety suite (85/85) | **10 min** |
| RB-G9 filing + README updates | **15 min** |
| **Contingency margin** | **30 min** |
| **Total minimum safe budget** | **~180 minutes (3 hours)** |

---

## 12. No-rush thresholds (fail closed below any)

| Threshold | Minimum required | Fail-closed action |
|-----------|------------------|-------------------|
| **G1 remaining before Domain A starts** | **≥ 3 hours** (180 min) | Do not begin Domain A · defer to new session date |
| **Baseline freshness remaining before C1** | **≥ 25 min** (of 30 min window) | Do not begin C1 · recapture Domain A or abort |
| **Armed timer remaining before AP invocation** | **≥ 12 min** (of 15 min window) | Do not invoke AP · disarm immediately |
| **Armed timer remaining before N6** | **≥ 3 min** after AP complete | Skip N6 · disarm · classify abort |
| **G1 remaining at isolation start** | **≥ 2 hours** (120 min) | Do not begin isolation |

Amendment signing **does not** waive any threshold.

---

## 13. Current-chain closure package (AP01)

### 13.1 Formal closure gate required

**Yes** — formal closure gate required before AP02 authorization signing.

**Rationale:** AP01 has four signed G1–G4 records plus a signed isolation amendment, multiple gate receipts, failed isolation evidence, and expired baselines. EV01/EV02 precedent used explicit closure gates. README status updates require a canonical closure receipt to prevent ambiguity about whether AP01 was executed.

### 13.2 Closure package contents

| Artifact | Requirement |
|----------|-------------|
| **Canonical closure note** | `RB-G9-20260709-AP01 UNUSED AUTHORIZATION CHAIN CLOSURE — {DATE}.md` |
| **G1–G4 status** | Update `Authorizations/README.md` to **EXPIRED_UNUSED** or **SUPERSEDED_BEFORE_EXECUTION** after G1 expiry |
| **Amendment status** | **EXPIRED_UNUSED** — never consumed |
| **Session folder** | **Not required** — AP01 never armed · no proof execution · no broadcast |
| **Explicit attestations** | Never armed · never executed · never created runtime stub · never exposed capital |
| **Evidence preservation** | All failed isolation receipts · expired baseline receipts · Domain A receipts · amendment docs — **no deletion** |

### 13.3 May G1–G4 remain simply expired in place?

**No** — not sufficient alone. Records may **expire in place** without editing signed markdown bodies, but a **formal closure gate** is still required to:
- Update `Authorizations/README.md` terminal statuses
- File canonical closure receipt with disposition **`SUPERSEDED_BEFORE_EXECUTION`**
- Document AP02 as replacement
- Prevent later misrepresentation of AP01 as executable

---

## 14. AP02 governance sequence (ordered)

1. **RB-G9-20260709-AP01 Unused Authorization Chain Closure**
2. **RB-G9-20260712-AP02 R15 Authorization Planning** *(optional brief planning gate)*
3. **AP02 G1 Authorization**
4. **AP02 G2 Authorization**
5. **AP02 G3 Authorization**
6. **AP02 G4 Authorization**
7. **AP02 Process Isolation Scope Amendment Authorization**
8. **Final Fresh Domain A Proof for RB-G9-20260712-AP02** *(same session day as G1–G4 signing)*
9. **Process Isolation Gate**
10. **Arming Transition Gate**
11. **Runtime Stub Creation Gate**
12. **Armed No-Submit Proof Execution Gate**
13. **Immediate Domain C Closure**

Steps 3–7 may be combined into one coordinated governance session. Steps 8–13 must execute **same operating window** without multi-hour gaps.

---

## 15. Operational improvements from AP01 lessons

| Lesson | AP02 preflight improvement |
|--------|---------------------------|
| Baseline expired before isolation | Start isolation **immediately** after Domain A · single timer |
| Wrapper scope blocked isolation | Verify wrapper scope amendment **signed before** Domain A |
| FOMO Wallet Monitor confusion risk | Verify scheduled-task exclusions **before** baseline capture |
| Process fingerprint drift | Capture stable fingerprints at baseline · document ancillary loops |
| Diagnostic loop (37868) affects fingerprint | Eliminate unnecessary diagnostic loops **before** fresh proof under separate governed procedure if needed · or bind explicitly in baseline |
| Multi-hour gap wasted freshness | **No gap** between Domain A and isolation |
| G1 window too tight at amendment sign | Require **≥ 3 hours** G1 remaining before Domain A |
| Env fingerprint shell-context drift | Use consistent operator shell for baseline and isolation gates |
| Pre-staging | Pre-stage isolation/arm/disarm commands without executing |
| Operator focus | Single operator clock · no unrelated shells mid-chain |

---

## 16. Readiness assessments

| Field | Value |
|-------|-------|
| **Ready for current-chain closure** | **Yes** — after G1 expiry at `2026-07-11T03:25:11Z` or via early formal closure gate |
| **Ready for AP02 authorization after closure** | **Conditional** — only after AP01 closure gate completes and intended proof date/window confirmed |
| **System remains disarmed** | **Yes** |
| **Processes stopped** | **No** |
| **Code/tests/config/environment changed** | **No** |
| **Runtime stub / session folder created** | **No** |
| **C1/C2/C3 performed** | **No** |
| **Submit/sign/broadcast** | **No** |
| **Capital state** | **None** |
| **OR-20260630-008** | **not_promoted** |
| **Readiness/profitability claims** | **No** |

---

## 17. Proposed authorization validity (AP02 G1)

| Option | Window | Recommendation |
|--------|--------|----------------|
| Minimum | 24 hours | Acceptable if same-day execution guaranteed |
| **Recommended** | **48 hours** | Comfortable buffer for coordinated signing + execution planning |
| Maximum practical | 72 hours | Only if operator confirms execution window within first 48h |

G1 expiry must still exceed the **3-hour minimum safe budget** at Domain A start.

---

## 18. Planning gate status

**PASS — PLANNING COMPLETE**

---

## 19. Recommended next gate

**RB-G9-20260709-AP01 Unused Authorization Chain Closure**

*(G1 expires `2026-07-11T03:25:11Z`. Closure may run after natural expiry or immediately — closure does not require waiting for expiry, but must not extend or reuse AP01 authorizations.)*

---

**Receipt path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9 ARMED NO-SUBMIT PROOF REAUTHORIZATION PLANNING — 2026-07-10.md`
