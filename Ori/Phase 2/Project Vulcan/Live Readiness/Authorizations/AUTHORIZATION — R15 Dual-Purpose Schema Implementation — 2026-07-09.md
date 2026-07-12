# AUTHORIZATION — R15 Dual-Purpose Schema Implementation — 2026-07-09

> **IMPLEMENTATION AUTHORIZATION ONLY**
>
> **NO CODE CREATED IN THIS GATE**
>
> **NO EXISTING R15 LOADER OR GUARD MODIFIED**
>
> **SYSTEM NOT RE-ARMED**
>
> **NO RUNTIME STUB · NO PROOF SESSION · NO R15/ARMING/PROOF AUTHORIZATION CHAIN · NO CAPITAL EXPOSURE**
>
> This record authorizes **one future governed implementation gate** to implement the approved schemaVersion 2 dual-purpose R15 model per the signed schema decision. It **does not** implement code, alter production posture, create runtime stubs, create proof-session authorizations, re-arm the system, or authorize armed no-submit proof.

---

## Record metadata

| Field | Value |
|-------|-------|
| **Gate name** | R15 Dual-Purpose Schema Implementation Authorization |
| **Record type** | Implementation Authorization · Governance-only |
| **Status** | **SIGNED — APPROVED — NOT IMPLEMENTED — NO CAPITAL EXPOSURE** |
| **Signer** | **Taylor Cheaney** |
| **Signature date** | **2026-07-09** |
| **Linked schema decision** | [`../Decisions/DECISION — R15 Dual-Purpose Approval Schema — 2026-07-09.md`](../Decisions/DECISION%20%E2%80%94%20R15%20Dual-Purpose%20Approval%20Schema%20%E2%80%94%202026-07-09.md) |
| **Schema decision gate receipt** | [`../R15 ARMED-PROOF STATUS SCHEMA DECISION — 2026-07-09.md`](../R15%20ARMED-PROOF%20STATUS%20SCHEMA%20DECISION%20%E2%80%94%202026-07-09.md) |
| **Planning reference** | [`../R15 ARMED-PROOF STATUS SCHEMA PLANNING — 2026-07-09.md`](../R15%20ARMED-PROOF%20STATUS%20SCHEMA%20PLANNING%20%E2%80%94%202026-07-09.md) |
| **Linked proof decision** | [`../Decisions/DECISION — Armed No-Submit Production Proof — 2026-07-09.md`](../Decisions/DECISION%20%E2%80%94%20Armed%20No-Submit%20Production%20Proof%20%E2%80%94%202026-07-09.md) |
| **Implementation option** | **Option A** — shared versioned validator with explicit `expectedPurpose` |
| **Capital exposure** | **none** |
| **EV01/EV02 reuse** | **Forbidden** |
| **OR-20260630-008** | **not_promoted** |
| **Strategy readiness** | **NOT READY** |
| **Gate receipt** | [`../R15 DUAL-PURPOSE SCHEMA IMPLEMENTATION AUTHORIZATION — 2026-07-09.md`](../R15%20DUAL-PURPOSE%20SCHEMA%20IMPLEMENTATION%20AUTHORIZATION%20%E2%80%94%202026-07-09.md) |

---

## 1. What this signed record authorizes

Taylor authorizes **exactly one future gate**:

**R15 Dual-Purpose Schema Implementation Gate**

That gate may implement **only** the approved schemaVersion 2 dual-purpose R15 model (Sections A–H below) plus narrowly scoped supporting tests, fixtures, examples, and documentation.

**Invariant:** This sign-off ≠ schema implementation complete ≠ armed proof ≠ proof session created ≠ runtime stub created.

---

## 2. Authorized implementation scope (Implementation Gate only)

### A. Shared schemaVersion 2 validator

| Requirement | Detail |
|-------------|--------|
| **Legacy** | `schemaVersion` absent or `1` — bounded legacy handling only |
| **Dual-purpose** | `schemaVersion: 2` |
| **Unknown version** | **FAIL closed** |
| **New runtime records** | Must use `schemaVersion: 2` |
| **`approvalPurpose` required** | For schemaVersion 2 |
| **Permitted values only** | `micro_live_execution` · `armed_no_submit_proof_only` |
| **Pair validation** | Exact `approvalPurpose` + `finalApprovalStatus` pairing |
| **Rejected** | Inference from status alone · cross-purpose use |

**Approved pairs:**

| `approvalPurpose` | `finalApprovalStatus` |
|-------------------|----------------------|
| `micro_live_execution` | `APPROVED FOR ONE MICRO-LIVE SESSION ONLY` |
| `armed_no_submit_proof_only` | `APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY` |

### B. Explicit expectedPurpose loader context

Extend loader behavior to require contextual validation via:

```javascript
loadR15ApprovalRecord({
  expectedPurpose,
  expectedSessionId,
  expectedWallet,
  now,
  allowLegacyMicroLive
})
```

| Rule | Detail |
|------|--------|
| **`expectedPurpose`** | **Mandatory** for all new code paths |
| **`allowLegacyMicroLive`** | Defaults **`false`** |
| **Armed-proof context** | Always rejects legacy records |
| **Micro-live context** | May accept legacy **only** when `allowLegacyMicroLive: true` explicitly |
| **Wrong/missing expected purpose** | **FAIL closed** |
| **Cross-context clearance** | One purpose **never** satisfies the other guard |

### C. Purpose-specific acknowledgments

**commonAcknowledgments** *(both purposes):*
- `strategyNotReadyAcknowledged`
- `noProfitabilityClaimAcknowledged`
- `oneSessionOnlyAcknowledged`
- `signerAndSessionBindingAcknowledged`

**microLiveAcknowledgments** — preserve all eight existing execution-specific acknowledgments and semantics:
1. `totalLossRiskAcknowledged`
2. `slippageCapAcknowledged`
3. `mevProtectionPlanAcknowledged`
4. `emergencyStopPolicyAcknowledged`
5. `noAutoCompoundingAcknowledged`
6. `noAveragingDownAcknowledged`
7. `noUnattendedExecutionAcknowledged`
8. `liveTradingNotForIncomeAcknowledged`

**armedProofAcknowledgments:**
1. `noCandidateSelectionAcknowledged`
2. `noExecutionQuoteAcknowledged`
3. `noSubmitAcknowledged`
4. `noSigningAcknowledged`
5. `noBroadcastAcknowledged`
6. `noPositionAcknowledged`
7. `noCapitalExposureAcknowledged`
8. `immediateDisarmAcknowledged`
9. `abortWithoutCompletionAcknowledged`

| Validation rule | Detail |
|-----------------|--------|
| **Common** | Required for both purposes |
| **Purpose-specific** | Validate **only** the set for `expectedPurpose` |
| **Missing/false required field** | **FAIL** |
| **Cross-purpose substitution** | **Prohibited** |
| **Unknown fields** | **FAIL closed** unless explicitly allowlisted by schema version |

### D. Armed-proof record constraints

| Requirement | Detail |
|-------------|--------|
| **`approvalPurpose`** | `armed_no_submit_proof_only` |
| **`finalApprovalStatus`** | `APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY` |
| **`purpose`** | `armed_no_submit_proof_only` |
| **Scope** | ONE_SESSION_ONLY · bounded expiry · same session ID linkage |
| **Prohibited fields** | Candidate · quote · trade · transaction authorization · capital-exposure authorization |
| **Guard rule** | Proof record **must never** clear micro-live submit/BUY guards |

### E. Micro-live preservation

| Requirement | Detail |
|-------------|--------|
| **Exact micro-live status** | **Unchanged** — `APPROVED FOR ONE MICRO-LIVE SESSION ONLY` |
| **Eight acknowledgments** | **Unchanged** semantics |
| **Legacy EV01/EV02** | Bounded · explicit legacy path only |
| **v2 micro-live** | Valid in micro-live context only |
| **Cross-context** | Micro-live records cannot satisfy armed-proof context; armed-proof records cannot satisfy micro-live context |

### F. Versioned examples and fixtures

| Item | Scope |
|------|-------|
| schemaVersion 2 micro-live example | Add |
| schemaVersion 2 armed-proof example | Add |
| Historical examples | Preserved as legacy where appropriate |
| Labeling | Non-canonical examples clearly labeled |
| Secrets | **Forbidden** |

### G. Loader/guard integration

| Call site | `expectedPurpose` |
|-----------|-------------------|
| Micro-live submit guard (`live_executor.js`) | `micro_live_execution` |
| Armed-preflight proof path (AP-13) | `armed_no_submit_proof_only` |

| Prohibited |
|------------|
| Generic “accept either” context |
| Fallback based only on `finalApprovalStatus` |

### H. Deterministic errors and receipts

Add stable error codes/messages for:
- Unsupported schema version
- Missing purpose
- Purpose/status mismatch
- Expected-purpose mismatch
- Legacy disallowed
- Wrong acknowledgments
- Prohibited proof fields
- Session/wallet/expiry/consumption failures

**No secret-bearing data** in errors or receipts.

---

## 3. Explicit prohibitions (Implementation Gate must not)

| Prohibition |
|-------------|
| Broad compatibility fallback |
| Automatic migration of historical records |
| Canonical historical record rewrites |
| Generic “approved” status |
| Purpose inference from status alone |
| One context accepts both purposes |
| Weakening of existing submit guards |
| Runtime stub creation |
| Proof session creation |
| Production arming (C1–C3) |
| Any submit · sign · broadcast · position · reconciliation · recovery · capital exposure |
| OR promotion or readiness/profitability claims |

---

## 4. Preservation requirements

| Requirement | Detail |
|-------------|--------|
| Domain A validator | **Unchanged** |
| Safety suite | **85/85** unchanged |
| N6 behavior | **Unchanged** |
| Armed-preflight | Unchanged except approved purpose-aware R15 validation |
| Wrong-posture exit | Production dry posture still exit **2** |
| No-submit guarantees | Preserved |
| EV01/EV02 historical records | **Closed** · **non-reusable** |

---

## 5. Required regression coverage (Implementation + Regression Gates)

| # | Requirement |
|---|-------------|
| 1 | Unknown schemaVersion rejected |
| 2 | schemaVersion 2 missing approvalPurpose rejected |
| 3 | Unknown approvalPurpose rejected |
| 4 | v2 micro-live correct pair accepted in micro-live context |
| 5 | v2 armed-proof correct pair accepted in proof context |
| 6 | Micro-live purpose + proof status rejected |
| 7 | Proof purpose + micro-live status rejected |
| 8 | Micro-live record rejected in proof context |
| 9 | Proof record rejected in micro-live context |
| 10 | Missing expectedPurpose rejected |
| 11 | Wrong expectedPurpose rejected |
| 12 | Legacy record rejected by default |
| 13 | Legacy record accepted only in explicit micro-live legacy mode |
| 14 | Legacy record always rejected in proof context |
| 15 | Common acknowledgment missing/false rejected |
| 16 | Micro-live acknowledgment missing/false rejected |
| 17 | Armed-proof acknowledgment missing/false rejected |
| 18 | Cross-purpose acknowledgment substitution rejected |
| 19 | Proof record with candidate fields rejected |
| 20 | Proof record with quote fields rejected |
| 21 | Proof record with trade fields rejected |
| 22 | Proof record with transaction authorization rejected |
| 23 | Proof record with capital authorization rejected |
| 24 | Session mismatch rejected |
| 25 | Wallet mismatch rejected |
| 26 | Expired record rejected |
| 27 | Consumed record rejected |
| 28 | Proof record cannot clear micro-live guard |
| 29 | Micro-live record cannot clear proof guard |
| 30 | EV01/EV02 legacy fixtures remain behaviorally correct |
| 31 | Deterministic errors/receipts |
| 32 | No secret leakage |
| 33 | Domain A validator PASS |
| 34 | Safety suite 85/85 PASS |
| 35 | N6 behavior unchanged |
| 36 | No execution functions invoked |

---

## 6. Implementation Gate operating constraints

The Implementation Gate must:

- Remain **fully disarmed**
- **Stop before** Fresh Domain A Dry Proof
- **Stop before** proof-session R15 planning
- **Stop before** runtime-stub creation
- **Stop before** any production armed no-submit proof

---

## 7. Later required gates (not authorized by this record)

| # | Gate |
|---|------|
| 1 | R15 Dual-Purpose Schema Implementation Gate |
| 2 | R15 Dual-Purpose Schema Regression Gate |
| 3 | Fresh Domain A Dry Proof for Armed No-Submit Session |
| 4 | Fresh Armed No-Submit Session R15 Planning |
| 5 | G1–G4 authorization chain |
| 6 | Armed no-submit proof |
| 7 | Immediate disarm and closure |

---

## 8. Human sign-off

| Field | Value |
|-------|-------|
| **Signer** | **Taylor Cheaney** |
| **Status** | **SIGNED — APPROVED** |
| **Signature date** | **2026-07-09** |
| **Capital exposure** | **none** |
| **Strategy readiness** | **NOT READY** |
| **OR-20260630-008** | **not_promoted** |

Taylor authorizes exactly one **R15 Dual-Purpose Schema Implementation Gate** under the scope and prohibitions above. This authorization does not implement code, create stubs, create proof sessions, arm production, or authorize proof execution.

---

**Canonical authorization path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — R15 Dual-Purpose Schema Implementation — 2026-07-09.md`
