# DECISION — R15 Dual-Purpose Approval Schema — 2026-07-09

Status:
**APPROVED**

Decision owner:
**Taylor Cheaney**

Decision date:
**2026-07-09**

Affected domain:
**R15 manual approval records and runtime guards**

Originating requirement:
**Armed no-submit production proof**

Linked decisions:
[`DECISION — Armed No-Submit Production Proof — 2026-07-09.md`](DECISION%20%E2%80%94%20Armed%20No-Submit%20Production%20Proof%20%E2%80%94%202026-07-09.md)

Planning reference:
[`../R15 ARMED-PROOF STATUS SCHEMA PLANNING — 2026-07-09.md`](../R15%20ARMED-PROOF%20STATUS%20SCHEMA%20PLANNING%20%E2%80%94%202026-07-09.md)

Gate receipt:
[`../R15 ARMED-PROOF STATUS SCHEMA DECISION — 2026-07-09.md`](../R15%20ARMED-PROOF%20STATUS%20SCHEMA%20DECISION%20%E2%80%94%202026-07-09.md)

Capital exposure:
**none**

Decision type:
Governance · R15 schema · dual-purpose approval model

---

## 1. Decision summary

Taylor **approves** a backward-compatible, fail-closed **schemaVersion 2** dual-purpose R15 approval model supporting:

- **micro-live execution** (`micro_live_execution`)
- **armed no-submit proof** (`armed_no_submit_proof_only`)

This decision **does not** authorize implementation, runtime stub creation, arming, proof execution, micro-live execution, or strategy readiness.

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

---

## 2. Current behavior (preserved baseline)

| Aspect | Current behavior |
|--------|------------------|
| **Accepted submit status** | `APPROVED FOR ONE MICRO-LIVE SESSION ONLY` *(exact)* |
| **Source** | `r15_manual_approval_check.js` · `live_executor.js` `assertMicroLiveApprovalRecord` |
| **Other statuses at submit** | **Rejected** |
| **Assessment** | **Correct for micro-live** · **Insufficient for armed no-submit proof** |

Micro-live exact-string semantics **must not weaken** under implementation of this decision.

---

## 3. schemaVersion (approved)

| Version | Meaning |
|---------|---------|
| **absent or `1`** | Legacy schema |
| **`2`** | Dual-purpose schema |
| **unknown** | **FAIL closed** |

**All new runtime records** must use **`schemaVersion: 2`**.

---

## 4. approvalPurpose (approved)

Permitted values — **no others without future governed schema decision:**

| Value | Scope |
|-------|-------|
| **`micro_live_execution`** | One bounded micro-live execution session |
| **`armed_no_submit_proof_only`** | One temporary armed no-submit proof session |

---

## 5. finalApprovalStatus (approved — exact pairing required)

| `approvalPurpose` | Exact `finalApprovalStatus` |
|-------------------|------------------------------|
| **`micro_live_execution`** | **`APPROVED FOR ONE MICRO-LIVE SESSION ONLY`** |
| **`armed_no_submit_proof_only`** | **`APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY`** |

**Purpose/status inference is prohibited** for schemaVersion 2. Both fields required. Mismatched pairs **FAIL**.

---

## 6. Compatibility matrix (approved)

| `approvalPurpose` | `finalApprovalStatus` | Valid context |
|-------------------|----------------------|---------------|
| `micro_live_execution` | micro-live exact status | **Micro-live only** |
| `micro_live_execution` | armed-proof exact status | **FAIL** |
| `armed_no_submit_proof_only` | armed-proof exact status | **Armed-proof only** |
| `armed_no_submit_proof_only` | micro-live exact status | **FAIL** |
| unknown purpose or status | any | **FAIL** |

One record type must **never** clear the other context's guard.

---

## 7. Loader context (approved)

### Conceptual API

```javascript
loadR15ApprovalRecord({
  expectedPurpose,
  expectedSessionId,
  expectedWallet,
  now,
  allowLegacyMicroLive
})
```

### Rules

| Rule | Requirement |
|------|-------------|
| **`expectedPurpose`** | **Mandatory** for all new code paths |
| **Micro-live submit path** | `expectedPurpose = micro_live_execution` |
| **Armed-proof path** | `expectedPurpose = armed_no_submit_proof_only` |
| **Wrong expected purpose** | **FAIL** |
| **Missing expected purpose** | **FAIL** for schemaVersion 2 paths |
| **Single context clearance** | One purpose **never** satisfies the other guard |

### Implementation option (approved)

**Option A** — shared versioned R15 validator with explicit `expectedPurpose`.

**Rationale:** Minimizes duplicated policy · centralizes schema validation · strict context separation · reduces drift · preserves micro-live semantics via explicit compatibility tests.

---

## 8. Legacy behavior (approved)

| Rule | Detail |
|------|--------|
| **Historical absent/`1` records** | Readable **only** for explicitly enabled legacy micro-live compatibility |
| **`allowLegacyMicroLive`** | Defaults **`false`** |
| **Armed-proof context** | **Rejects all legacy records** |
| **EV01/EV02 canonical records** | **No automatic migration** · **no rewrite** |
| **New records** | **No legacy inference** · require schemaVersion 2 + `approvalPurpose` |

---

## 9. Acknowledgment structure (approved)

### commonAcknowledgments *(both purposes)*

- `strategyNotReadyAcknowledged`
- `noProfitabilityClaimAcknowledged`
- `oneSessionOnlyAcknowledged`
- `signerAndSessionBindingAcknowledged`

### microLiveAcknowledgments *(preserve existing eight)*

1. `totalLossRiskAcknowledged`
2. `slippageCapAcknowledged`
3. `mevProtectionPlanAcknowledged`
4. `emergencyStopPolicyAcknowledged`
5. `noAutoCompoundingAcknowledged`
6. `noAveragingDownAcknowledged`
7. `noUnattendedExecutionAcknowledged`
8. `liveTradingNotForIncomeAcknowledged`

### armedProofAcknowledgments *(distinct set)*

1. `noCandidateSelectionAcknowledged`
2. `noExecutionQuoteAcknowledged`
3. `noSubmitAcknowledged`
4. `noSigningAcknowledged`
5. `noBroadcastAcknowledged`
6. `noPositionAcknowledged`
7. `noCapitalExposureAcknowledged`
8. `immediateDisarmAcknowledged`
9. `abortWithoutCompletionAcknowledged`

### Validation rules

- Validate **common** for both purposes
- Validate **only** the purpose-specific set for `expectedPurpose`
- Missing or false required acknowledgment → **FAIL**
- Cross-purpose substitution → **prohibited**
- Unknown acknowledgment fields → **FAIL closed** unless explicitly allowlisted in versioned schema
- Micro-live execution semantics → **unchanged**

---

## 10. Armed-proof record constraints (approved)

| Constraint | Requirement |
|------------|-------------|
| **Candidate fields** | **Forbidden** |
| **Execution quote fields** | **Forbidden** |
| **Trade metadata** | **Forbidden** |
| **Transaction authorization** | **Forbidden** |
| **Capital-exposure authorization** | **Forbidden** |
| **`purpose`** | `armed_no_submit_proof_only` |
| **Scope** | ONE_SESSION_ONLY |
| **Expiry** | Bounded |
| **Session linkage** | Same session ID across canonical Ori and runtime stub |
| **Secrets** | **Forbidden** |
| **Runtime storage** | Gitignored `analysis/r15_manual_approval_record.json` |
| **Post-proof** | Immediate removal or consumption |

---

## 11. Micro-live preservation (approved)

| Rule | Detail |
|------|--------|
| **Exact micro-live status** | **Unchanged** |
| **Execution acknowledgments** | **Preserved** |
| **Proof-only record** | **Cannot** clear BUY/submit guards |
| **Armed-proof approval** | **Cannot** authorize candidate selection or execution |
| **Micro-live record** | **Cannot** satisfy proof G4 or proof AP-02 requirements |

---

## 12. Validator behavior (approved)

Validation order:

1. Schema validation
2. Purpose/status pair validation
3. Expected-purpose validation
4. Session validation
5. Wallet validation
6. Expiry/consumption validation
7. Acknowledgment validation
8. Prohibited-field validation

All failures → **deterministic fail-closed errors**.

---

## 13. Fail-closed cases (approved)

| # | Condition |
|---|-----------|
| 1 | Unknown schema version |
| 2 | Missing `approvalPurpose` in schemaVersion 2 |
| 3 | Unknown `approvalPurpose` |
| 4 | Purpose/status mismatch |
| 5 | Expected-purpose mismatch |
| 6 | Missing expected purpose |
| 7 | Cross-session record |
| 8 | Wallet mismatch |
| 9 | Expired record |
| 10 | Consumed record |
| 11 | Wrong acknowledgment set |
| 12 | False acknowledgment |
| 13 | Proof record containing candidate, quote, trade, transaction, or capital fields |
| 14 | Micro-live record missing execution acknowledgments |
| 15 | Legacy record in armed-proof context |
| 16 | Legacy record without explicit `allowLegacyMicroLive` |
| 17 | Ambiguous or malformed record |

---

## 14. Explicitly rejected (approved)

Taylor **rejects**:

- Reusing the micro-live approval string for proof-only records
- Accepting status without purpose in schemaVersion 2
- Inferring purpose from status alone
- A generic “approved” status
- One loader context accepting both purposes
- Armed-proof use of legacy records
- Silently converting legacy records
- Duplicated independent schemas without shared validation
- Broad compatibility fallbacks
- Weakening existing submit guards

---

## 15. Migration policy (approved)

| Rule | Detail |
|------|--------|
| **Historical records** | Preserved unchanged |
| **Destructive migration** | **Prohibited** |
| **New records** | schemaVersion 2 |
| **Legacy micro-live read** | Narrowly bounded · explicitly enabled only |
| **Canonical historical documents** | Remain authoritative for completed sessions |
| **Future proof sessions** | Must use schemaVersion 2 |

---

## 16. Regression requirements (approved)

Future implementation and regression gates must prove:

- EV01/EV02 fixtures behaviorally correct under legacy rules
- Legacy micro-live rejected unless explicitly allowed
- Legacy always rejected in armed-proof context
- v2 micro-live valid in micro-live context only
- v2 armed-proof valid in armed-proof context only
- Every cross-purpose combination fails
- Exact statuses enforced
- Acknowledgment sets enforced
- Prohibited fields enforced
- Proof-only record never clears micro-live execution guard
- Micro-live record never clears armed-proof guard
- Unknown schema versions fail
- Deterministic errors and receipts
- No secret leakage
- Domain A validator unchanged
- N6 behavior unchanged
- 85/85 safety suite unchanged

---

## 17. Governance sequence (approved)

| # | Gate |
|---|------|
| 1 | **R15 Armed-Proof Status Schema Decision** *(this decision)* |
| 2 | R15 Dual-Purpose Schema Implementation Authorization |
| 3 | R15 Dual-Purpose Schema Implementation Gate |
| 4 | R15 Dual-Purpose Schema Regression Gate |
| 5 | Fresh Domain A Dry Proof for Armed No-Submit Session |
| 6 | Fresh proof-session R15 planning |
| 7 | G1–G4 authorization chain |
| 8 | Armed no-submit proof |
| 9 | Immediate disarm and closure |

---

## 18. Decision boundaries (explicit non-authorizations)

This decision **does not**:

- Authorize schema implementation
- Authorize a new proof session
- Authorize arming or runtime stub creation
- Authorize micro-live execution
- Create authorizations or stubs
- Establish strategy readiness
- Promote OR-20260630-008

Implementation requires a separate **R15 Dual-Purpose Schema Implementation Authorization**.

---

## 19. Human approval

| Field | Value |
|-------|-------|
| **Decision owner** | Taylor Cheaney |
| **Status** | **APPROVED** |
| **Date** | **2026-07-09** |
| **Capital exposure** | **none** |
| **Strategy readiness** | **NOT READY** |
| **OR-20260630-008** | **not_promoted** |

---

**Canonical decision path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Decisions/DECISION — R15 Dual-Purpose Approval Schema — 2026-07-09.md`
