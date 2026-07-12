# RB-G9 AP02 R15 Authorization Planning — 2026-07-11

Status:
**PLANNING COMPLETE — PRODUCTION DISARMED UNCHANGED — NO AP02 G1 SIGNED — NO SESSION FOLDER**

Gate type:
schemaVersion 2 proof-only AP02 G1 authorization design — planning and documentation only

Prerequisites:
`RB-G9-20260709-AP01 UNUSED AUTHORIZATION CHAIN CLOSURE — 2026-07-11.md` · `RB-G9 ARMED NO-SUBMIT PROOF REAUTHORIZATION PLANNING — 2026-07-10.md` · R15 schema v2 decisions · armed no-submit proof policy

Planning capture UTC:
**`2026-07-11T02:03:33Z`**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**AP02 G1 signed:** **No** · **AP02 G2–G4:** **Not created** · **Session folder:** **Not created** · **Runtime stub:** **Not created** · **Processes changed:** **No**

---

## 1. Prominent post-gate state

> **DISARMED · DRY · NO TRADE**
>
> **AP02 G1 DESIGN DOCUMENTED**
>
> **AP01 PERMANENTLY CLOSED — NO AP02 AUTHORIZATION SIGNED**

---

## 2. Files inspected (read-only)

| File | Purpose |
|------|---------|
| `RB-G9-20260709-AP01 UNUSED AUTHORIZATION CHAIN CLOSURE — 2026-07-11.md` | AP01 closure |
| `analysis/rb_g9_20260709_ap01_unused_chain_closure_receipt.json` | Machine closure receipt |
| `RB-G9 ARMED NO-SUBMIT PROOF REAUTHORIZATION PLANNING — 2026-07-10.md` | Replacement chain design |
| `FRESH ARMED NO-SUBMIT PROOF SESSION R15 PLANNING — 2026-07-09.md` | AP01 G1 planning precedent |
| `Authorizations/AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260709-AP01 — 2026-07-09.md` | AP01 G1 structure (closed) |
| AP01 G2–G4 authorizations | Reference only — closed |
| AP01 Process Isolation Scope Amendment planning + authorization | Design carry-forward |
| `Decisions/DECISION — R15 Dual-Purpose Approval Schema — 2026-07-09.md` | schemaVersion 2 |
| `Decisions/DECISION — Armed No-Submit Production Proof — 2026-07-09.md` | Proof policy |
| `Decisions/DECISION — Armed-Context Preflight Architecture — 2026-07-08.md` | AP/N6 architecture |
| `Authorizations/README.md` · `Sessions/README.md` | Index state |
| `live_config.json` | Disarmed posture verification |

Signed AP01 authorization bodies **not edited**.

---

## 3. AP01 separation validation

| Check | Result |
|-------|--------|
| AP01 closed | **PASS** — `SUPERSEDED_BEFORE_EXECUTION — EXPIRED_UNUSED` |
| AP01 cannot be reopened | **PASS** |
| AP01 session ID reusable | **FAIL (intended)** — **must not reuse** |
| AP01 G1–G4 satisfy AP02 guards | **FAIL (intended)** — **cannot** |
| AP01 amendment authorizes AP02 isolation | **FAIL (intended)** — design only |
| AP01 baseline hashes reusable | **FAIL (intended)** — **void** |
| AP01 fingerprints as historical evidence only | **PASS** |
| “Latest authorization” fallback | **Forbidden** |

**AP01 separation validation result:** **PASS**

Historical AP01 fingerprints (reference only — **not** AP02 bindings):

| Record | Fingerprint |
|--------|-------------|
| G1 | `d24fdbe6dbb4febbeb17d1b190776fec653462b61064d00c1c322fb8d15e2a84` |
| G2 | `00b8aa79d9fec2d0f1b24370cd3c7453105ab16e5db30806d48e1e9d19cf78a3` |
| G3 | `c6fc68c41543b0b82f4080585dfe6613314c153143c34b236803edeb6bc9ddf4` |
| G4 | `ecb59808f9f45625a6d2db2a51d98472f81cf8741f088a865d16126445c2397c` |
| Amendment | `ec01c651bd8995ede671a95711377874050b12fa09707801032d25ee7f60b9fd` |

---

## 4. Proposed AP02 session identity

| Field | Value |
|-------|-------|
| **Proposed session ID** | **`RB-G9-20260713-AP02`** |
| **Intended proof date** | **`2026-07-13`** *(provisional — Taylor must confirm)* |
| **Suffix** | **`AP02`** exact |
| **Session folder** | **Not created** — future at Domain C closure only if proof executes |
| **Status** | **Proposed until G1 signing** |

### Session collision check

| Session ID | Status | Collision |
|------------|--------|-----------|
| `RB-G9-20260706-EV01` | CONSUMED/CLOSED | **No** |
| `RB-G9-20260707-EV02` | CONSUMED/CLOSED | **No** |
| `RB-G9-20260709-AP01` | CLOSED — never executed | **No** |
| `RB-G9-20260713-AP02` | Proposed | **No collision** |

**Date policy:** If proof execution moves to a different calendar date, session ID becomes **`RB-G9-{executionYYYYMMDD}-AP02`** — do not reuse a date-bound ID from a prior day.

---

## 5. Intended operating window (provisional)

| Field | Value |
|-------|-------|
| **Recommended proof date** | **2026-07-13** |
| **Recommended local window** | **14:00–20:00 MDT** *(6 hours)* |
| **Recommended UTC window** | **2026-07-13T20:00:00Z` – `2026-07-14T02:00:00Z`** |
| **Minimum uninterrupted block** | **4 hours** *(180 min chain + 30 min contingency)* |
| **G1 sign target (if proof 14:00 MDT)** | **No later than 2026-07-13 10:00 MDT** *(≥ 4h before Domain A)* |

Alternative: if Taylor selects a different date, update session ID to match execution date before G1 signing.

**Minimum safe-time budget (full chain):**

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

Window must **not** begin near authorization expiry.

---

## 6. AP02 G1 canonical path (future — not created)

```
Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260713-AP02 — {SIGN_DATE}.md
```

`{SIGN_DATE}` = calendar date of Taylor G1 signature (may differ from proof date if G1 signed day-before with 48h validity).

---

## 7. AP02 G1 schema (design)

| Field | Value |
|-------|-------|
| **schemaVersion** | **`2`** |
| **approvalPurpose** | **`armed_no_submit_proof_only`** |
| **finalApprovalStatus** | **`APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY`** *(exact)* |
| **purpose** | **`armed_no_submit_proof_only`** |
| **oneSessionOnly** | **`true`** |
| **strategyReady** | **`false`** |
| **orStatus** | **`not_promoted`** |
| **maximumArmedDurationMinutes** | **`15`** |

---

## 8. Signer and wallet binding (design)

| Field | Value |
|-------|-------|
| **Signer** | **Taylor Cheaney** |
| **Burner public address** | **`FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6`** |
| **Assigned session ID** | **`RB-G9-20260713-AP02`** *(or date-matched ID at sign-off)* |
| **Signature timestamp UTC** | *(at G1 authorization gate — not set in planning)* |
| **Signature timestamp local** | *(at G1 authorization gate — Mountain Daylight Time)* |
| **Proposed authorization expiry** | **48 hours** after G1 signature UTC |
| **Secrets in record** | **Forbidden** — no private key · signer secret · API key · RPC credential · secret URL |

**Previous sessions (must not reuse):** EV01 · EV02 · AP01

**AP01 closure linkage (historical separation only):**

`RB-G9-20260709-AP01 UNUSED AUTHORIZATION CHAIN CLOSURE — 2026-07-11.md`

---

## 9. AP02 G1 scope

Engineering validation only — one future production-host armed no-submit proof under human supervision.

| Authorized (future, separate gates) | Forbidden |
|-------------------------------------|-----------|
| Bounded session scope for G2–G4 chain | Candidate selection |
| Maximum 15 min LIVE_ARMED | Market scanning for execution |
| Future AP-01–AP-20 + one N6 *(G4)* | Execution quote |
| Immediate disarm on any outcome | Final trade confirmation |
| | Transaction construction for execution |
| | Submit · sign · broadcast · txSig |
| | Position · reconciliation · recovery |
| | Capital exposure · executor loop |

G1 alone **does not** authorize arming, stub creation, proof execution, or any execution path.

---

## 10. Required commonAcknowledgments

All **`true`** at G1 sign-off and in future G3 stub mirror:

| Field | Required |
|-------|----------|
| `strategyNotReadyAcknowledged` | **`true`** |
| `noProfitabilityClaimAcknowledged` | **`true`** |
| `oneSessionOnlyAcknowledged` | **`true`** |
| `signerAndSessionBindingAcknowledged` | **`true`** |

---

## 11. Required armedProofAcknowledgments

All **`true`** at G1 sign-off and in future G3 stub mirror:

| Field | Required |
|-------|----------|
| `noCandidateSelectionAcknowledged` | **`true`** |
| `noExecutionQuoteAcknowledged` | **`true`** |
| `noSubmitAcknowledged` | **`true`** |
| `noSigningAcknowledged` | **`true`** |
| `noBroadcastAcknowledged` | **`true`** |
| `noPositionAcknowledged` | **`true`** |
| `noCapitalExposureAcknowledged` | **`true`** |
| `immediateDisarmAcknowledged` | **`true`** |
| `abortWithoutCompletionAcknowledged` | **`true`** |

---

## 12. Prohibited G1 content

Must **not** appear in signed G1 or stub mirror:

- Candidate mint · token mint · pair · pool
- Quote · quote ID
- Trade size · position size · entry · target · stop
- Transaction · submit · broadcast · capital authorization
- Private keys · signer secrets · API keys · RPC credentials · secret-bearing URLs

---

## 13. AP02 validity model

| Rule | Detail |
|------|--------|
| **Minimum validity** | **24 hours** from G1 signature |
| **Recommended validity** | **48 hours** — supports coordinated chain without rushing |
| **oneSessionOnly** | **true** — non-reusable after consumption |
| **Invalid after** | Proof completion · abort · first disarm after use · ambiguity · any execution-path call · any txSig · session/signer/wallet mismatch · OR status change · expiry |

Do **not** sign G1 until intended proof date and operating window are confirmed.

---

## 14. No-rush thresholds (fail closed — no discretionary override)

| Threshold | Minimum remaining | Fail-closed action |
|-----------|-------------------|-------------------|
| **G1 lifetime before Final Fresh Domain A starts** | **≥ 4 hours** | Do not begin Domain A · reschedule |
| **Domain A freshness before Process Isolation starts** | **≥ 20 minutes** | Do not begin isolation · recapture or abort |
| **Domain A freshness before C1** | **≥ 12 minutes** | Do not begin C1 · recapture or abort |
| **15-minute armed window before AP invocation** | **≥ 10 minutes** | Do not invoke AP · disarm |

Any threshold failure → **fail closed and reschedule** — no override within same session.

---

## 15. Coordinated operating-block rule

| Rule | Detail |
|------|--------|
| G1–G4 signing | **One coordinated governance block** (same session day as proof) |
| Final Fresh Domain A | Starts **immediately** after G1–G4 validation |
| Process Isolation | Starts **immediately** after Domain A completion |
| C1 | Only after isolation **PASS** |
| Environment | **No** unrelated shells · editors · process · config changes between gates |
| Operator | **One clock · one timer source** |
| Pre-staging | Rollback commands ready · proof commands ready · **not executed early** |

---

## 16. Process-isolation governance carry-forward

AP02 requires **fresh** isolation authority — AP01 amendment **not** reusable.

| Mechanism | Detail |
|-----------|--------|
| **Preferred** | Fresh **AP02 Process Isolation Scope Amendment** linked to AP02 G2, or scope incorporated into AP02 G2 sign-off text |
| **Monitor restart wrapper** | Exact approved command identity only |
| **Dashboard wrapper** | Only if `while ($true)` restart behavior **positively proven** at isolation gate |
| **Scanner wrapper** | Only if **positively identified** |
| **Stop order** | Wrappers before Node children · observe **≥ 10 s** |
| **FOMO Wallet Monitor** | **Explicitly excluded** — separate project scheduled task |
| **Broad termination** | **Forbidden** |
| **Output** | New **`isolatedProcessSetHash`** for AP02 |

**Approved monitor restart wrapper signature (carry-forward design):**

```
powershell.exe -NoExit -Command cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot; while ($true) { Get-Date; node monitor.js; Start-Sleep -Seconds 60 }
```

---

## 17. G1 linkage requirements (AP02 G2–G4)

Later AP02 G2–G4 must bind:

- Exact AP02 session ID
- Exact AP02 G1 path and **new** G1 fingerprint
- Exact signer and wallet
- Exact schemaVersion · purpose · status
- Exact expiry and maximum armed duration
- AP01 closure record as **historical separation evidence only** — not as authority

---

## 18. Runtime-stub mirror requirements (AP02 G3 gate — design)

| Field | Requirement |
|-------|-------------|
| **schemaVersion** | **`2`** |
| **Session ID** | AP02 exact |
| **Signer / wallet** | Same as G1 |
| **Purpose / status** | Same proof-only values as G1 |
| **Timestamps / expiry** | Mirror G1 signature and expiry |
| **Acknowledgments** | Same common + armedProof sets |
| **Prohibited fields** | No candidate · quote · trade · transaction · capital |
| **Storage** | `analysis/r15_manual_approval_record.json` — gitignored · secret-free |
| **Creation timing** | Only after `LIVE_ARMED` confirmed |
| **Removal** | Immediate after proof · abort · ambiguity · timeout |

---

## 19. AP02 authorization sequence

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

Steps 1–5 may occur in one coordinated governance session. Steps 6–11 must occur in one coordinated operating block.

---

## 20. Pre-sign checklist (Taylor — before G1)

| # | Item |
|---|------|
| 1 | Intended proof date confirmed |
| 2 | Uninterrupted operator block confirmed (≥ 4 h) |
| 3 | Wrapper command identities verified against current process tree |
| 4 | FOMO Wallet Monitor exclusion confirmed |
| 5 | Rollback commands pre-staged (not executed) |
| 6 | Startup restoration procedure documented |
| 7 | No pending code/config changes planned |
| 8 | No open position · reconciliation · recovery state |
| 9 | Signer and RPC readiness verified (boolean only — no secrets) |
| 10 | AP01 closure reviewed — no reuse |

---

## 21. Readiness assessment

| Field | Value |
|-------|-------|
| **Ready for AP02 G1 authorization** | **CONDITIONAL** |
| **Rationale** | Session format · schema · scope · thresholds · isolation design **ready**; **provisional** proof date `2026-07-13` and window documented — **Taylor must confirm** date and uninterrupted block before G1 signing |
| **System remains disarmed** | **Yes** |
| **AP02 authorization created** | **No** |

---

## 22. Post-gate verification

| Check | Result |
|-------|--------|
| Production code / tests changed | **No** |
| Config / environment changed | **No** |
| Processes stopped or started | **No** |
| Runtime stub / session folder created | **No** |
| C1/C2/C3 performed | **No** |
| Submit/sign/broadcast | **No** |
| Capital state | **None** |
| AP01 records altered | **No** |

---

## 23. Planning gate status

**PASS — PLANNING COMPLETE**

Readiness/profitability claims: **none**

---

## 24. Recommended next gate

**RB-G9 AP02 Operating Window Selection**

*(After Taylor confirms proof date and ≥ 4-hour uninterrupted block → **RB-G9 AP02 R15 Authorization**)*

---

**Receipt path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9 AP02 R15 AUTHORIZATION PLANNING — 2026-07-11.md`
