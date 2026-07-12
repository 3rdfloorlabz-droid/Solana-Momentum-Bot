# R15 Armed-Proof Status Schema Decision — 2026-07-09

Status:
**DECISION APPROVED — IMPLEMENTATION NOT AUTHORIZED — SYSTEM REMAINS DISARMED**

Gate type:
Governance decision sign-off — dual-purpose R15 schema policy only

Prerequisites:
`R15 ARMED-PROOF STATUS SCHEMA PLANNING — 2026-07-09.md` · `FRESH ARMED NO-SUBMIT SESSION R15 PLANNING — 2026-07-09.md` · `Decisions/DECISION — Armed No-Submit Production Proof — 2026-07-09.md`

Decision date:
**2026-07-09**

Decision owner:
**Taylor Cheaney**

Decision status:
**APPROVED**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**Production code changed:** **No** · **Tests changed:** **No** · **Config changed:** **No** · **`.env` changed:** **No** · **Runtime stub created:** **No** · **Proof session created:** **No** · **Implementation authorized:** **No** · **Submit/broadcast:** **No** · **System armed:** **No**

---

## 1. Prominent post-gate state

> **DISARMED · DRY · NO TRADE**
>
> **R15 DUAL-PURPOSE SCHEMA APPROVED**
>
> **IMPLEMENTATION NOT AUTHORIZED**

---

## 2. Files inspected (read-only)

| File | Purpose |
|------|---------|
| `R15 ARMED-PROOF STATUS SCHEMA PLANNING — 2026-07-09.md` | Planning baseline |
| `live_executor.js` | `assertMicroLiveApprovalRecord` · exact micro-live status check |
| `r15_manual_approval_check.js` | `APPROVAL_STATUSES` · normalization · validation |
| `examples/r15_manual_approval_record.example.json` | Example stub shape |
| `FRESH RUNTIME R15 APPROVAL STUB PLANNING — 2026-07-07.md` | EV02 stub field requirements |
| `Authorizations/AUTHORIZATION — R15 … RB-G9-20260706-EV01 — 2026-07-06.md` | EV01 canonical R15 |
| `Authorizations/AUTHORIZATION — R15 … RB-G9-20260707-EV02 — 2026-07-07.md` | EV02 canonical R15 |
| `R15 SECURE STORAGE DECISION — 2026-07-06.md` | Ori vs runtime stub rules |
| `Decisions/DECISION — Armed No-Submit Production Proof — 2026-07-09.md` | Proof policy · AP-02 · AP-15 |
| `armed_preflight_checks.js` | AP-02 proof/micro-live · AP-13 · AP-15 |
| `armed_preflight_session.js` | Proof AP-15 replacement evidence |
| `test_r15_manual_approval_check.js` | Exact micro-live status assertions |
| `test_n6_armed_estop_probe.js` | Mock stub uses micro-live exact string |

---

## 3. Decision recorded

Canonical decision:
[`Decisions/DECISION — R15 Dual-Purpose Approval Schema — 2026-07-09.md`](Decisions/DECISION%20%E2%80%94%20R15%20Dual-Purpose%20Approval%20Schema%20%E2%80%94%202026-07-09.md)

| Metadata | Value |
|----------|-------|
| **Decision owner** | Taylor Cheaney |
| **Decision date** | 2026-07-09 |
| **Status** | APPROVED |
| **Affected domain** | R15 manual approval records and runtime guards |
| **Originating requirement** | Armed no-submit production proof |
| **Capital exposure** | none |

---

## 4. Adoptions summary

| Item | Adopted |
|------|---------|
| **schemaVersion 2** | **Yes** |
| **`approvalPurpose` values** (`micro_live_execution` · `armed_no_submit_proof_only`) | **Yes** |
| **Exact `finalApprovalStatus` pairing** | **Yes** |
| **Strict compatibility matrix** | **Yes** |
| **Explicit `expectedPurpose` at loader invocation** | **Yes** |
| **Legacy policy** (bounded micro-live only · armed-proof rejects legacy) | **Yes** |
| **Acknowledgment model** (common + purpose-specific) | **Yes** |
| **Armed-proof record constraints** | **Yes** |
| **Micro-live preservation** | **Yes** |
| **Fail-closed cases (17)** | **Yes** |
| **Option A** (shared versioned validator) | **Yes** |
| **Migration policy** | **Yes** |
| **Regression requirements** | **Yes** |
| **Governance sequence** | **Yes** |

---

## 5. Explicit rejections (recorded)

| Rejected approach | Status |
|-------------------|--------|
| Reusing micro-live status string for proof-only records | **Rejected** |
| Status without purpose in v2 | **Rejected** |
| Purpose inference from status | **Rejected** |
| Generic “approved” status | **Rejected** |
| One loader context for both purposes | **Rejected** |
| Armed-proof legacy record acceptance | **Rejected** |
| Silent legacy conversion | **Rejected** |
| Duplicated schemas without shared validation | **Rejected** |
| Broad compatibility fallbacks | **Rejected** |
| Weakening submit guards | **Rejected** |

---

## 6. Decision boundaries

| Item | Status |
|------|--------|
| **Implementation authorized** | **No** |
| **New proof session authorized** | **No** |
| **Arming authorized** | **No** |
| **Micro-live execution authorized** | **No** |
| **Runtime stub authorized** | **No** |
| **Strategy readiness** | **NOT READY** |
| **OR-20260630-008** | **not_promoted** |

---

## 7. Required output summary

| Item | Value |
|------|-------|
| **Decision path** | `Decisions/DECISION — R15 Dual-Purpose Approval Schema — 2026-07-09.md` |
| **Gate receipt path** | `R15 ARMED-PROOF STATUS SCHEMA DECISION — 2026-07-09.md` |
| **Decision status** | **APPROVED** |
| **Decision owner** | Taylor Cheaney |
| **Decision date** | 2026-07-09 |
| **schemaVersion 2 adopted** | **yes** |
| **approvalPurpose values adopted** | **yes** |
| **Exact status values adopted** | **yes** |
| **Compatibility matrix adopted** | **yes** |
| **Explicit expectedPurpose adopted** | **yes** |
| **Legacy policy adopted** | **yes** |
| **Acknowledgment model adopted** | **yes** |
| **Armed-proof constraints adopted** | **yes** |
| **Micro-live preservation adopted** | **yes** |
| **Fail-closed cases adopted** | **yes** |
| **Option A adopted** | **yes** |
| **Migration policy adopted** | **yes** |
| **Regression requirements adopted** | **yes** |
| **Governance sequence adopted** | **yes** |
| **Implementation authorized** | **no** |
| **Production code changed** | **no** |
| **Tests changed** | **no** |
| **Config/environment changed** | **no** |
| **Runtime stub created** | **no** |
| **Proof session created** | **no** |
| **New authorization created** | **no** |
| **System remains disarmed** | **yes** |
| **Submit/broadcast invoked** | **no** |
| **Position/reconciliation/recovery/capital** | **none** |
| **OR-20260630-008 status** | **not_promoted** |
| **Readiness/profitability claims** | **no** |

---

## 8. Recommended next gate

**R15 Dual-Purpose Schema Implementation Authorization**

---

**Receipt path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/R15 ARMED-PROOF STATUS SCHEMA DECISION — 2026-07-09.md`
