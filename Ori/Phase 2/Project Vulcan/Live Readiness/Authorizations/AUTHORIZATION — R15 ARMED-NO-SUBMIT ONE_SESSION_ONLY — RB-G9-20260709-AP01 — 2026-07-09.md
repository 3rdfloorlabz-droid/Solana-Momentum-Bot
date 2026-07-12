# AUTHORIZATION — R15 Armed-No-Submit ONE_SESSION_ONLY Session Authorization — RB-G9-20260709-AP01 — 2026-07-09

> **SIGNED — EFFECTIVE FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY**
>
> This record authorizes **one bounded armed no-submit proof session scope** for future separate gates. It **does not** arm the system, create a runtime approval stub, authorize C1–C3 arming transition, authorize the armed proof itself, authorize micro-live execution, select a candidate, provide final per-trade confirmation, construct transactions for execution, submit, sign, broadcast, or expose capital.

---

## Record metadata

| Field | Value |
|-------|-------|
| **Gate name** | Fresh Armed No-Submit Proof Session R15 Authorization |
| **Record type** | `ONE_SESSION_ONLY` · Armed No-Submit Proof · Pre-Arming Session Scope (G1) |
| **Status** | **SIGNED — NOT ARMED — NOT EXECUTING — NO CAPITAL EXPOSURE** |
| **Authorization status** | **SIGNED/UNUSED** |
| **Signer** | **Taylor Cheaney** |
| **Signature timestamp (UTC)** | **`2026-07-10T03:25:11Z`** |
| **Signature timestamp (local)** | **`Thu Jul 09 2026 21:25:11 GMT-0600 (Mountain Daylight Time)`** |
| **Signature date** | **2026-07-09** |
| **Authorization expiry (UTC)** | **`2026-07-11T03:25:11Z`** *(no later than 24 hours after signature)* |
| **Assigned session ID** | **`RB-G9-20260709-AP01`** |
| **Previous sessions (closed — must not reuse)** | **`RB-G9-20260706-EV01`** · **`RB-G9-20260707-EV02`** |
| **Planned RB-G9 session folder** | `../Sessions/SESSION — RB-G9-20260709-AP01 — {SESSION_DATE}/` *(create at session close — not created in this gate)* |
| **Research wallet public address** | `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |
| **OR-20260630-008** | **not_promoted** |
| **Live readiness claim status** | **No** |
| **Strategy readiness status** | **NOT READY** |
| **Capital exposure status** | **none** *(unchanged until separate proof gates)* |
| **Planning receipt** | [`../FRESH ARMED NO-SUBMIT PROOF SESSION R15 PLANNING — 2026-07-09.md`](../FRESH%20ARMED%20NO-SUBMIT%20PROOF%20SESSION%20R15%20PLANNING%20%E2%80%94%202026-07-09.md) |
| **Sign-off gate receipt** | [`../FRESH ARMED NO-SUBMIT PROOF SESSION R15 AUTHORIZATION — 2026-07-09.md`](../FRESH%20ARMED%20NO-SUBMIT%20PROOF%20SESSION%20R15%20AUTHORIZATION%20%E2%80%94%202026-07-09.md) |

---

## Schema metadata (schemaVersion 2 — armed no-submit proof only)

| Field | Value |
|-------|-------|
| **`schemaVersion`** | **`2`** |
| **`approvalPurpose`** | **`armed_no_submit_proof_only`** |
| **`finalApprovalStatus`** | **`APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY`** *(exact)* |
| **`purpose`** | **`armed_no_submit_proof_only`** |
| **`oneSessionOnly`** | **`true`** |
| **`maximumArmedDurationMinutes`** | **`15`** |
| **`strategyReady`** | **`false`** |
| **`orStatus`** | **`not_promoted`** |

Later G2, G3, G4, and any runtime stub **must** bind the **same session ID**, signer, wallet, purpose, status, and acknowledgment sets.

---

## 1. Authorized scope (ONE_SESSION_ONLY — armed no-submit proof only)

This authorization record authorizes **one bounded armed no-submit proof session only** — engineering validation under human supervision. **Not** strategy deployment, **not** profitability proof, **not** scaling, and **not** automatic permission to arm, create a runtime stub, or execute.

| Authorized scope | Detail |
|------------------|--------|
| **Purpose** | Engineering validation of armed no-submit proof prerequisites under human supervision |
| **Session ID** | **`RB-G9-20260709-AP01`** |
| **Governance chain position** | **G1** — R15 session scope only |
| **Maximum LIVE_ARMED duration** | **15 minutes** from future C3 completion |
| **Future Domain B proof** | AP-01–AP-20 on production host *(separate G4 gate)* |
| **Future armed-safe N6 probe** | AP-17 *(separate G4 gate)* |
| **Immediate disarm** | Required after PASS, FAIL, abort, ambiguity, or timeout |

| Forbidden in this authorization and all downstream proof activity |
|-------------------------------------------------------------------|
| Candidate selection |
| Execution quote |
| Final trade confirmation |
| Transaction construction for execution |
| Submit · sign · broadcast |
| Transaction signature (`txSig`) |
| Position · reconciliation · recovery |
| Capital exposure |
| Executor loop |
| Micro-live execution |

**This signed record does not authorize arming, LIVE posture, live submission, runtime-stub creation, armed proof execution, micro-live execution authorization, candidate selection, final per-trade confirmation, broadcast, or capital exposure by itself.**

---

## 2. Required `commonAcknowledgments`

All fields **must** be **`true`** in this signed record and in any future G3 runtime stub mirror:

| Field | Signed value |
|-------|--------------|
| `strategyNotReadyAcknowledged` | **`true`** |
| `noProfitabilityClaimAcknowledged` | **`true`** |
| `oneSessionOnlyAcknowledged` | **`true`** |
| `signerAndSessionBindingAcknowledged` | **`true`** |

---

## 3. Required `armedProofAcknowledgments`

All fields **must** be **`true`** in this signed record and in any future G3 runtime stub mirror:

| Field | Signed value |
|-------|--------------|
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

## 4. Explicit non-authorizations

The following remain **not authorized** unless separately gated:

| Item | Status |
|------|--------|
| Arming transition (C1–C3) / `liveArmed true` | **No** — separate G2 gate |
| `FOMO_ENABLE_LIVE_SUBMISSION=YES` | **No** |
| `executionMode LIVE` / `dryRunMode false` (production) | **No** |
| `FOMO_ALLOW_LOOP_LIVE=YES` | **No** |
| Runtime approval stub creation / activation | **No** — G3 separate gate · `analysis/r15_manual_approval_record.json` **not created** |
| Armed no-submit proof execution | **No** — G4 separate gate |
| Micro-live execution authorization | **No** |
| Candidate selection or approval | **No** |
| Final per-trade confirmation | **No** |
| **0.005 SOL trade authorization** | **No** |
| Actual transaction broadcast / trade execution | **No** |
| Submit-capable process start | **No** |
| Scanner/executor loops | **No** |
| Session ID reuse (EV01/EV02/AP01 retry without new chain) | **Forbidden** |
| OR-20260630-008 promotion | **No** |
| Live readiness claim | **No** |
| Strategy readiness claim | **No** |
| Profitability / edge claim | **No** |
| Capital exposure | **No** |

---

## 5. Validity and invalidation rules

### Validity window

| Rule | Detail |
|------|--------|
| **Signature-to-use expiry** | **No later than 24 hours after signature** — expires **`2026-07-11T03:25:11Z`** |
| **Armed window cap** | **15 minutes** maximum after future C3 |
| **Reuse** | **Never** — consumed/closed after proof or abort |

### Invalidation triggers (first trigger wins)

| # | Trigger |
|---|---------|
| **I1** | Authorization expiry (>24h after signature without consumed proof) |
| **I2** | Armed duration exceeds **15 minutes** |
| **I3** | Proof completion |
| **I4** | Abort or disarm |
| **I5** | Session ID mismatch across G1–G4 · stub · receipts |
| **I6** | Signer or wallet mismatch |
| **I7** | `schemaVersion` / purpose / status mismatch |
| **I8** | Acknowledgment failure |
| **I9** | Prohibited field present in authorization or stub |
| **I10** | Code / config / process / auth fingerprint drift |
| **I11** | Executor process appears |
| **I12** | Position / reconciliation / recovery / capital exists |
| **I13** | Execution-path call count > 0 |
| **I14** | Any `txSig` appears |
| **I15** | Secret exposure |
| **I16** | OR-20260630-008 status change from **not_promoted** |
| **I17** | Ambiguity at any stage |

**After expiration or invalidation:** authorization is **never reusable**. New G1–G4 chain required for any retry.

---

## 6. Runtime-stub linkage statement (G3 — future, not created)

When authorized by a separate **G3 Runtime Stub Creation Authorization**, the gitignored runtime mirror at `analysis/r15_manual_approval_record.json` **must**:

| Requirement | Value |
|-------------|--------|
| **`schemaVersion`** | **`2`** |
| **`approvalPurpose`** | **`armed_no_submit_proof_only`** |
| **`finalApprovalStatus`** | **`APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY`** |
| **Session ID** | **`RB-G9-20260709-AP01`** — same as G1–G4 |
| **Signer / wallet** | Taylor Cheaney · `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |
| **Acknowledgment sets** | Same `commonAcknowledgments` + `armedProofAcknowledgments` as this record |
| **Forbidden fields** | Candidate · quote · trade · transaction · capital fields · secrets |
| **Gitignored** | **Yes** |
| **Secret-free** | **Yes** |
| **Removal** | Delete immediately after proof or abort — before Domain C validation |

Stub creation is **not authorized** by this G1 sign-off.

---

## 7. Fresh Domain A recapture requirement

A **new** Fresh Domain A Dry Proof is **mandatory**:

| Rule | Detail |
|------|--------|
| **When** | **After** all G1–G4 records are signed · **immediately before** C1 arming |
| **Freshness window** | Complete within **30 minutes** before C1 |
| **Prior dry proof** | [`../FRESH DOMAIN A DRY PROOF FOR ARMED NO-SUBMIT PROOF SESSION — 2026-07-09.md`](../FRESH%20DOMAIN%20A%20DRY%20PROOF%20FOR%20ARMED%20NO-SUBMIT%20PROOF%20SESSION%20%E2%80%94%202026-07-09.md) — **historical planning evidence only** · **not sufficient alone for arming** |

---

## 8. Prohibited authorization content

This record **must not** and **does not** contain:

- Candidate mint · pair · pool
- Quote · trade size · entry/exit targets
- Transaction authorization · submit/broadcast authorization · capital authorization
- Private key · secret · credential · raw environment value

---

## 9. Linked evidence and decisions

| Prerequisite | Path |
|--------------|------|
| **R15 planning note** | [`../FRESH ARMED NO-SUBMIT PROOF SESSION R15 PLANNING — 2026-07-09.md`](../FRESH%20ARMED%20NO-SUBMIT%20PROOF%20SESSION%20R15%20PLANNING%20%E2%80%94%202026-07-09.md) |
| **R15 dual-purpose schema decision** | [`../Decisions/DECISION — R15 Dual-Purpose Approval Schema — 2026-07-09.md`](../Decisions/DECISION%20%E2%80%94%20R15%20Dual-Purpose%20Approval%20Schema%20%E2%80%94%202026-07-09.md) |
| **Armed no-submit production proof decision** | [`../Decisions/DECISION — Armed No-Submit Production Proof — 2026-07-09.md`](../Decisions/DECISION%20%E2%80%94%20Armed%20No-Submit%20Production%20Proof%20%E2%80%94%202026-07-09.md) |
| **Schema implementation gate** | [`../R15 DUAL-PURPOSE SCHEMA IMPLEMENTATION GATE — 2026-07-09.md`](../R15%20DUAL-PURPOSE%20SCHEMA%20IMPLEMENTATION%20GATE%20%E2%80%94%202026-07-09.md) |
| **Schema regression gate** | [`../R15 DUAL-PURPOSE SCHEMA REGRESSION GATE — 2026-07-09.md`](../R15%20DUAL-PURPOSE%20SCHEMA%20REGRESSION%20GATE%20%E2%80%94%202026-07-09.md) |
| **Dry proof receipt (historical only)** | [`../FRESH DOMAIN A DRY PROOF FOR ARMED NO-SUBMIT PROOF SESSION — 2026-07-09.md`](../FRESH%20DOMAIN%20A%20DRY%20PROOF%20FOR%20ARMED%20NO-SUBMIT%20PROOF%20SESSION%20%E2%80%94%202026-07-09.md) · [`../../analysis/armed_no_submit_final_domain_a_dry_proof_receipt.json`](../../analysis/armed_no_submit_final_domain_a_dry_proof_receipt.json) |
| **R15 secure storage** | [`../R15 SECURE STORAGE DECISION — 2026-07-06.md`](../R15%20SECURE%20STORAGE%20DECISION%20%E2%80%94%202026-07-06.md) |
| **Armed-context proof planning** | [`../ARMED-CONTEXT ARMED NO-SUBMIT PROOF PLANNING — 2026-07-09.md`](../ARMED-CONTEXT%20ARMED%20NO-SUBMIT%20PROOF%20PLANNING%20%E2%80%94%202026-07-09.md) |
| **Prior EV02 R15 (consumed — do not reuse)** | [`AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — RB-G9-20260707-EV02 — 2026-07-07.md`](AUTHORIZATION%20%E2%80%94%20R15%20ENGINEERING-VALIDATION%20ONE_SESSION_ONLY%20%E2%80%94%20RB-G9-20260707-EV02%20%E2%80%94%202026-07-07.md) |

---

## 10. Future gate separation (unchanged by this sign-off)

| Gate | Relationship |
|------|--------------|
| **G2 — Arming Authorization** | Separate — C1–C3 transition only · must bind **`RB-G9-20260709-AP01`** |
| **G3 — Runtime R15 Stub Creation Authorization** | Separate — gitignored stub · schemaVersion 2 proof mirror |
| **G4 — Armed No-Submit Proof Authorization** | Separate — Domain B proof + N6 armed probe · **explicitly not execution** |
| **Fresh Domain A Dry Proof** | Mandatory after G1–G4 signed · within 30 min before C1 |
| **RB-G9 session folder** | Created at session close only |

**Explicitly excluded:** Micro-Live Execution Authorization · candidate selection · per-trade confirmation · execution gates.

---

## 11. Taylor Cheaney — signed attestation

I, Taylor Cheaney, acknowledge and attest:

1. I have read this R15 ONE_SESSION_ONLY armed no-submit proof session authorization record for session **`RB-G9-20260709-AP01`**.
2. **`schemaVersion: 2`** · **`approvalPurpose: armed_no_submit_proof_only`** · **`finalApprovalStatus: APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY`**.
3. Strategy readiness is **NOT READY**; I make **no** profitability or strategy-edge claim.
4. This authorization is **engineering validation only** — one temporary production-host armed no-submit proof session · maximum **15 minutes** LIVE_ARMED.
5. I explicitly accept all **`commonAcknowledgments`** and **`armedProofAcknowledgments`** listed in §2–§3.
6. This G1 sign-off **does not** authorize arming transition, runtime-stub creation, armed proof execution, micro-live execution, candidate selection, final per-trade confirmation, submit, sign, broadcast, or capital exposure.
7. **No trade or capital exposure is authorized.**
8. **OR-20260630-008 remains not_promoted**.
9. Prior sessions **`RB-G9-20260706-EV01`** and **`RB-G9-20260707-EV02`** are **closed** — I will **not** reuse them.
10. This authorization expires **`2026-07-11T03:25:11Z`** if unused, and is **never reusable** after consumption.

**Taylor's explicit statement (recorded):**

> I sign the R15 ONE_SESSION_ONLY armed no-submit proof session authorization dated 2026-07-09 for session `RB-G9-20260709-AP01`. SchemaVersion 2 · armed_no_submit_proof_only · APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY. Strategy readiness is NOT READY; I make no profitability or strategy-edge claim. No trade or capital exposure is authorized. This sign-off authorizes bounded proof session scope only — not arming, not runtime stub creation, not armed proof execution, not micro-live execution, not candidate selection, not submit, not sign, not broadcast, and not OR promotion. OR-20260630-008 remains not_promoted.

| Field | Value |
|-------|-------|
| **Signed** | **Taylor Cheaney** |
| **Signature timestamp (UTC)** | **`2026-07-10T03:25:11Z`** |
| **Signature timestamp (local)** | **`Thu Jul 09 2026 21:25:11 GMT-0600 (Mountain Daylight Time)`** |
| **Authorization expiry (UTC)** | **`2026-07-11T03:25:11Z`** |

---

**Canonical path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260709-AP01 — 2026-07-09.md`
