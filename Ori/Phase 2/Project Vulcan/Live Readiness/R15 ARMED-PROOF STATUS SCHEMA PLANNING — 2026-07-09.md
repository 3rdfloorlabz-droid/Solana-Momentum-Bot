# R15 Armed-Proof Status Schema Planning — 2026-07-09

Status:
**PLANNING COMPLETE — PRODUCTION DISARMED UNCHANGED — NO CODE OR SCHEMA CHANGES**

Gate type:
Architecture planning — dual-purpose R15 approval-status schema (micro-live vs armed no-submit proof)

Prerequisites:
`FRESH ARMED NO-SUBMIT SESSION R15 PLANNING — 2026-07-09.md` · `Decisions/DECISION — Armed No-Submit Production Proof — 2026-07-09.md` · `R15 SECURE STORAGE DECISION — 2026-07-06.md`

Planning date:
**2026-07-09**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**Production code changed:** **No** · **Tests changed:** **No** · **Runtime stub created:** **No** · **Authorization created:** **No**

---

## 1. Prominent post-gate state

> **DISARMED · DRY · NO TRADE**
>
> **DUAL-PURPOSE R15 SCHEMA DESIGNED**
>
> **NO IMPLEMENTATION · NO AUTHORIZATION · NO ARMING**

---

## 2. Files inspected (read-only)

| File | Purpose |
|------|---------|
| `FRESH ARMED NO-SUBMIT SESSION R15 PLANNING — 2026-07-09.md` | Prior proof-only R15 plan · schema conflict |
| `live_executor.js` | `loadMicroLiveApprovalRecord` · `assertMicroLiveApprovalRecord` · submit-time guard |
| `r15_manual_approval_check.js` | `APPROVAL_STATUSES` · `normalizeRecord` · `validateApprovalRecord` |
| `examples/r15_manual_approval_record.example.json` | Example stub shape |
| `FRESH RUNTIME R15 APPROVAL STUB PLANNING — 2026-07-07.md` | EV02 stub field requirements |
| `Authorizations/AUTHORIZATION — Runtime R15 Approval Stub Creation — RB-G9-20260707-EV02 — 2026-07-07.md` | EV02 stub auth · exact status string |
| `Authorizations/AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — RB-G9-20260707-EV02 — 2026-07-07.md` | EV02 canonical R15 |
| `Authorizations/AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — 2026-07-06.md` | EV01 canonical R15 |
| `R15 SECURE STORAGE DECISION — 2026-07-06.md` | Ori canonical vs runtime stub rules |
| `Decisions/DECISION — Armed No-Submit Production Proof — 2026-07-09.md` | AP-02 · AP-15 proof policy |
| `armed_preflight_checks.js` | AP-02 proof/micro-live · AP-13 · AP-15 |
| `armed_preflight_session.js` | Proof AP-15 replacement evidence · stub purpose |
| `test_r15_manual_approval_check.js` | Exact `ONE_SESSION_ONLY` status assertions |
| `test_n6_armed_estop_probe.js` | Mock stub uses micro-live exact string |

---

## 3. Current exact-string behavior

| Aspect | Current behavior |
|--------|------------------|
| **Accepted `finalApprovalStatus` for LIVE submit** | **`APPROVED FOR ONE MICRO-LIVE SESSION ONLY`** *(exact)* |
| **Constant** | `r15_manual_approval_check.js` → `APPROVAL_STATUSES.ONE_SESSION_ONLY` |
| **Submit guard** | `live_executor.js` `assertMicroLiveApprovalRecord` — strict equality check at line 2317 |
| **Other recognized statuses (status helper only)** | `NOT APPROVED` · `APPROVED FOR FINAL REVIEW ONLY` |
| **All other values** | **Rejected** — `unknown or invalid finalApprovalStatus` |
| **Purpose field** | **Not read** by loader today |
| **`schemaVersion`** | **Not read** by loader today |

**Assessment:**
- Current behavior is **correct and must be preserved** for micro-live execution.
- Current behavior is **incompatible** with armed no-submit proof authorization without schema extension.
- Using the micro-live string for proof-only stubs would be **misleading** and could imply execution authorization.

**Tests asserting exact micro-live string:**
- `test_r15_manual_approval_check.js` — `ONE_SESSION_ONLY` status does not auto-approve via status helper
- `test_n6_armed_estop_probe.js` — mocked stub uses `APPROVAL_STATUSES.ONE_SESSION_ONLY`
- EV02 stub planning/auth docs require exact string for submit-valid stub

---

## 4. Distinct approval purposes

| ID | Purpose | Human scope |
|----|---------|-------------|
| **A** | `micro_live_execution` | One bounded micro-live execution session — candidate/trade path may apply in future execution gates |
| **B** | `armed_no_submit_proof_only` | One temporary armed no-submit proof session — **no** candidate · quote · trade · submit · sign · broadcast · capital |

---

## 5. Proposed `finalApprovalStatus` values (paired)

| Purpose | Exact `finalApprovalStatus` |
|---------|----------------------------|
| **micro_live_execution** | `APPROVED FOR ONE MICRO-LIVE SESSION ONLY` *(unchanged)* |
| **armed_no_submit_proof_only** | `APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY` *(new)* |

Loader must validate **both** `approvalPurpose` and `finalApprovalStatus` as an approved pair. Neither field alone is sufficient for new records.

---

## 6. Recommended schema model

**Model:** Versioned dual-purpose record with machine-readable purpose + human-readable exact status.

| Field | Role |
|-------|------|
| **`schemaVersion`** | `2` for all new records |
| **`approvalPurpose`** | Machine-readable purpose enum *(required in v2)* |
| **`finalApprovalStatus`** | Human-readable exact status *(required)* |
| **`purpose`** | Runtime/stub operational purpose mirror — must equal `approvalPurpose` for v2 |
| **`oriLinkage.sessionId`** | Same session ID across G1–G4 · stub · receipts |
| **`researchWalletPublicAddress`** | Public address only — must match config when armed |

**Pair validation rule:**
```
validateApprovedPair(approvalPurpose, finalApprovalStatus) === true
  OR fail closed
```

**Approved pairs only:**

| `approvalPurpose` | `finalApprovalStatus` |
|-------------------|----------------------|
| `micro_live_execution` | `APPROVED FOR ONE MICRO-LIVE SESSION ONLY` |
| `armed_no_submit_proof_only` | `APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY` |

---

## 7. Purpose/status compatibility matrix

| `approvalPurpose` | `finalApprovalStatus` | Micro-live loader context | Armed-proof loader context |
|-------------------|----------------------|---------------------------|----------------------------|
| `micro_live_execution` | micro-live exact status | **PASS** | **FAIL** |
| `micro_live_execution` | armed-proof exact status | **FAIL** | **FAIL** |
| `armed_no_submit_proof_only` | armed-proof exact status | **FAIL** | **PASS** |
| `armed_no_submit_proof_only` | micro-live exact status | **FAIL** | **FAIL** |
| *(missing)* | micro-live exact status | **Legacy path only** *(see §8)* | **FAIL** |
| *(missing)* | armed-proof exact status | **FAIL** | **FAIL** |
| unknown purpose | any | **FAIL** | **FAIL** |
| any | unknown status | **FAIL** | **FAIL** |

---

## 8. Legacy handling recommendation

| Rule | Detail |
|------|--------|
| **Legacy definition** | `schemaVersion` absent or `1` |
| **Legacy micro-live read** | Permitted **only** when `expectedPurpose = micro_live_execution` **and** `allowLegacyMicroLive = true` explicitly passed |
| **Legacy inference** | Legacy records may infer `approvalPurpose = micro_live_execution` **only** inside bounded legacy path when `finalApprovalStatus` is micro-live exact string |
| **Armed-proof context** | **Never** accepts legacy records — **FAIL closed** |
| **New records** | **Must** be `schemaVersion: 2` with explicit `approvalPurpose` |
| **No generic fallback** | Callers without `expectedPurpose` **FAIL** for v2 code paths |
| **Historical EV01/EV02** | Canonical signed Ori records **not rewritten**; runtime stubs if recreated use v2 going forward |

---

## 9. Loader context-separation design

### Conceptual APIs *(future implementation — not in this gate)*

```javascript
loadR15ApprovalRecord({ expectedPurpose, expectedSessionId, expectedWallet, allowLegacyMicroLive })
validateR15ApprovalRecord(record, context)
```

**Context object:**
- `expectedPurpose` — **required** for v2 paths
- `expectedSessionId` — required when session-bound
- `expectedWallet` — public address match when configured
- `now` — expiry evaluation
- `allowLegacyMicroLive` — default `false`; only `true` in explicitly authorized micro-live legacy compatibility paths

### Call-site separation

| Call site | `expectedPurpose` | Notes |
|-----------|-------------------|-------|
| `live_executor.js` LIVE submit guard | `micro_live_execution` | Existing behavior preserved; legacy allowed only here |
| `armed_preflight_checks.js` AP-13 proof path | `armed_no_submit_proof_only` | Must **not** call micro-live assert without purpose |
| `armed_preflight_checks.js` AP-13 micro-live path | `micro_live_execution` | Unchanged semantics |
| `r15_manual_approval_check.js` status helper | *(read-only · no submit)* | May report purpose mismatch without arming |

**Invariant:** One purpose must **never** satisfy the other's guard.

---

## 10. Proof-only schema requirements (v2)

| Requirement | Value / rule |
|-------------|--------------|
| **`schemaVersion`** | `2` |
| **`approvalPurpose`** | `armed_no_submit_proof_only` |
| **`finalApprovalStatus`** | `APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY` |
| **`purpose`** | `armed_no_submit_proof_only` |
| **`oriLinkage.sessionId`** | `RB-G9-{proofExecutionDate}-AP01` |
| **`oriLinkage.purpose`** | `armed_no_submit_proof_only` |
| **Candidate fields** | **Forbidden** — no `mint` · `tokenMint` · `candidatePacket` refs |
| **Quote fields** | **Forbidden** — no execution quote metadata |
| **Trade fields** | **Forbidden** — no `tradeId` · `side` · `intent` |
| **Transaction authorization** | **Forbidden** |
| **Capital exposure authorization** | **Forbidden** |
| **Scope** | `ONE_SESSION_ONLY` |
| **Expiry** | Bounded — recommend signature +24h · armed window +15 min |
| **Wallet** | `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` public only |
| **Secrets** | **Forbidden** in Ori and runtime records |

---

## 11. Micro-live schema preservation (v2)

| Requirement | Detail |
|-------------|--------|
| **`finalApprovalStatus`** | **`APPROVED FOR ONE MICRO-LIVE SESSION ONLY`** — unchanged exact string |
| **`approvalPurpose`** | `micro_live_execution` |
| **Candidate/trade semantics** | Unchanged for future micro-live execution gates |
| **Eight execution acknowledgments** | Still required at submit time |
| **Cross-purpose block** | Proof-only record **cannot** clear `assertMicroLiveApprovalRecord` / LIVE submit |
| **AP-02/G4** | Micro-live authorization **cannot** satisfy armed-proof G4 |

---

## 12. Acknowledgment model

### Shared base (`commonAcknowledgments`) — required for all v2 records

| Field | Meaning |
|-------|---------|
| `strategyNotReadyAcknowledged` | Strategy remains NOT READY |
| `noProfitabilityClaimAcknowledged` | No edge/profitability claim |
| `oneSessionOnlyAcknowledged` | One session only — non-reusable |
| `signerAndSessionBindingAcknowledged` | Signer/public address and session ID binding accepted |

### Micro-live (`microLiveAcknowledgments`) — preserve existing eight

Maps to current `R15_REQUIRED_ACK_FIELDS` / `REQUIRED_ACK_FIELDS`:

1. `totalLossRiskAcknowledged`
2. `slippageCapAcknowledged`
3. `mevProtectionPlanAcknowledged`
4. `emergencyStopPolicyAcknowledged`
5. `noAutoCompoundingAcknowledged`
6. `noAveragingDownAcknowledged`
7. `noUnattendedExecutionAcknowledged`
8. `liveTradingNotForIncomeAcknowledged`

Optional: `r7bBypassRiskAcknowledged` when R7b unmet *(status helper — unchanged)*

### Armed-proof (`armedProofAcknowledgments`) — distinct set

1. `noCandidateSelectionAcknowledged`
2. `noExecutionQuoteAcknowledged`
3. `noSubmitAcknowledged`
4. `noSigningAcknowledged`
5. `noBroadcastAcknowledged`
6. `noPositionAcknowledged`
7. `noCapitalExposureAcknowledged`
8. `immediateDisarmAcknowledged`
9. `abortWithoutCompletionAcknowledged`

### Recommended JSON structure (v2)

```json
{
  "schemaVersion": 2,
  "approvalPurpose": "armed_no_submit_proof_only",
  "finalApprovalStatus": "APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY",
  "purpose": "armed_no_submit_proof_only",
  "acknowledgments": {
    "common": { "...": true },
    "armedProof": { "...": true }
  }
}
```

Micro-live v2 uses `"common"` + `"microLive"` nested groups. Flat legacy eight-field shape remains valid **only** under legacy micro-live compatibility path.

### Loader acknowledgment rules

- Validate **only** the set required for `expectedPurpose`
- Missing required acknowledgment → **FAIL**
- Unknown extra top-level fields → reject unless explicitly allowlisted in decision
- Cross-purpose substitution → **prohibited**

---

## 13. Proposed `schemaVersion` behavior

| Version | Rules |
|---------|-------|
| **Legacy** *(absent or `1`)* | Micro-live exact status only; no `approvalPurpose`; armed-proof context **rejects** |
| **`2`** | Requires `approvalPurpose` + paired `finalApprovalStatus` + purpose-specific acknowledgment set |
| **Unknown version** | **FAIL closed** |

---

## 14. Migration strategy

| Rule | Detail |
|------|--------|
| **EV01/EV02 canonical Ori records** | **No destructive migration** — historical markdown preserved |
| **EV01/EV02 runtime stubs** | Already absent/consumed — no rewrite |
| **Future stubs** | All use `schemaVersion: 2` |
| **Legacy read compatibility** | Narrow micro-live-only path with explicit `allowLegacyMicroLive` |
| **Implementation gate** | Additive constants + validator — no removal of micro-live exact string |
| **Documentation** | Update stub planning examples with v2 proof shape after decision |

---

## 15. Fail-closed cases (complete list)

| # | Condition | Result |
|---|-----------|--------|
| 1 | Purpose/status pair mismatch | **FAIL** |
| 2 | Wrong `expectedPurpose` for call site | **FAIL** |
| 3 | Missing `approvalPurpose` on v2 record | **FAIL** |
| 4 | Unknown `approvalPurpose` | **FAIL** |
| 5 | Unknown `finalApprovalStatus` | **FAIL** |
| 6 | Unknown `schemaVersion` | **FAIL** |
| 7 | Cross-session `sessionId` mismatch | **FAIL** |
| 8 | Wallet/public address mismatch | **FAIL** |
| 9 | Expired record (`oriLinkage.validUntil` / armed window) | **FAIL** |
| 10 | Consumed/closed record | **FAIL** |
| 11 | Wrong acknowledgment set for purpose | **FAIL** |
| 12 | Proof record contains candidate/trade/quote fields | **FAIL** |
| 13 | Micro-live record missing execution acknowledgments | **FAIL** |
| 14 | Legacy record used in armed-proof context | **FAIL** |
| 15 | Caller omits `expectedPurpose` on v2 path | **FAIL** |
| 16 | Proof record used to clear LIVE submit guard | **FAIL** |
| 17 | Micro-live record used for armed-proof AP-13/G4 | **FAIL** |

---

## 16. Regression requirements (future implementation gates)

| Area | Requirement |
|------|-------------|
| **EV01/EV02 fixtures** | Legacy micro-live behavior unchanged when `allowLegacyMicroLive: true` |
| **v2 micro-live** | PASS in micro-live context with paired purpose/status |
| **v2 armed-proof** | PASS in armed-proof context only |
| **Cross-purpose** | All cross-matrix cells FAIL |
| **Legacy armed-proof** | Legacy record rejected in proof context |
| **Exact pairing** | Mismatched pairs FAIL with deterministic error codes |
| **Acknowledgments** | Purpose-specific sets enforced |
| **Execution guards** | Proof record never clears LIVE submit |
| **AP-02/G4** | Micro-live auth cannot satisfy proof G4 |
| **AP-13** | Purpose-specific assert paths |
| **Secrets** | No leakage in errors/receipts |
| **Domain A / N6 / 85/85** | Unchanged unless explicitly in scope of implementation gate |

---

## 17. Implementation options compared

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A** | Extend current loader with `expectedPurpose` + shared v2 validator | Minimal duplication · single record file · strict context separation | Requires careful call-site audit |
| **B** | Separate loaders (`micro_live_r15.js` · `armed_proof_r15.js`) | Hard separation | Duplication · drift risk |
| **C** | Duplicate schema files and validators | Isolation | Highest maintenance · inconsistent errors |

### Recommended option: **A**

Extend `r15_manual_approval_check.js` with a shared versioned validator and explicit `expectedPurpose`. Refactor `live_executor.js` submit guard to call validator with `expectedPurpose: micro_live_execution`. Add armed-proof assert wrapper for AP-13. Preserves one runtime stub path (`analysis/r15_manual_approval_record.json`) with purpose disambiguation.

---

## 18. Governance sequence

| # | Gate |
|---|------|
| 1 | **R15 Armed-Proof Status Schema Planning** *(this gate)* |
| 2 | **R15 Armed-Proof Status Schema Decision** |
| 3 | **R15 Armed-Proof Status Schema Implementation Authorization** |
| 4 | **R15 Armed-Proof Status Schema Implementation Gate** |
| 5 | **R15 Armed-Proof Status Schema Regression Gate** |
| 6 | **Fresh Domain A Dry Proof for Armed No-Submit Session** |
| 7 | **Fresh Armed No-Submit Session R15 Planning** *(update with v2 fields)* |
| 8 | **Fresh Armed No-Submit Session R15 Authorization** |
| 9 | G2–G4 authorization chain + stub + armed no-submit proof execution gates |

---

## 19. Required output summary

| Item | Value |
|------|-------|
| **Planning note path** | `R15 ARMED-PROOF STATUS SCHEMA PLANNING — 2026-07-09.md` |
| **Current exact-string behavior** | Micro-live exact status only at submit; all else rejected; correct for micro-live; incompatible with proof |
| **Distinct approval purposes** | `micro_live_execution` · `armed_no_submit_proof_only` |
| **Proposed finalApprovalStatus values** | See §5 |
| **Recommended schema model** | v2 · `approvalPurpose` + paired `finalApprovalStatus` + nested acknowledgments |
| **Compatibility matrix** | §7 |
| **Legacy handling** | §8 — legacy micro-live read only with explicit flag; armed-proof never legacy |
| **Loader context separation** | §9 — `expectedPurpose` required |
| **Proof-only schema requirements** | §10 |
| **Micro-live preservation** | §11 |
| **Acknowledgment model** | §12 |
| **Proposed schemaVersion** | Legacy absent/`1` · new `2` |
| **Migration strategy** | §14 — no historical rewrite |
| **Fail-closed cases** | §15 — 17 cases |
| **Regression requirements** | §16 |
| **Options compared** | A · B · C — **A recommended** |
| **Recommended option** | **Option A** |
| **Governance sequence** | §18 |
| **System remains disarmed** | **yes** |
| **Production code changed** | **no** |
| **Tests changed** | **no** |
| **Config/environment changed** | **no** |
| **Runtime stub created** | **no** |
| **Proof session created** | **no** |
| **New authorization created** | **no** |
| **Submit/broadcast invoked** | **no** |
| **Position/reconciliation/recovery/capital** | **none** |
| **OR-20260630-008** | **not_promoted** |
| **Readiness/profitability claims** | **no** |

---

## 20. Explicit non-executions (this gate)

| Item | Status |
|------|--------|
| Code changes | **None** |
| Loader/validator changes | **None** |
| Test changes | **None** |
| Runtime stub | **Not created** |
| Authorization | **Not created or signed** |
| Production arming | **No** |

---

## 21. Recommended next gate

**R15 Armed-Proof Status Schema Decision**

---

**Receipt path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/R15 ARMED-PROOF STATUS SCHEMA PLANNING — 2026-07-09.md`
