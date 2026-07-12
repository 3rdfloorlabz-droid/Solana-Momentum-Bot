# AUTHORIZATION — R15 Armed-No-Submit ONE_SESSION_ONLY Session Authorization — RB-G9-20260713-AP02 — 2026-07-11

> **SIGNED — EFFECTIVE FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY**
>
> This record authorizes **one bounded armed no-submit proof session scope** for future separate gates. It **does not** arm the system, create a runtime approval stub, authorize C1–C3 arming transition, authorize the armed proof itself, authorize micro-live execution, select a candidate, provide final per-trade confirmation, construct transactions for execution, submit, sign, broadcast, or expose capital.

---

## Record metadata

| Field | Value |
|-------|-------|
| **Gate name** | RB-G9 AP02 R15 Authorization |
| **Record type** | `ONE_SESSION_ONLY` · Armed No-Submit Proof · Pre-Arming Session Scope (G1) |
| **Status** | **SIGNED — NOT ARMED — NOT EXECUTING — NO CAPITAL EXPOSURE** |
| **Authorization status** | **SIGNED/UNUSED** |
| **Signer** | **Taylor Cheaney** |
| **Signature timestamp (UTC)** | **`2026-07-11T02:53:21Z`** |
| **Signature timestamp (local)** | **`Fri Jul 10 2026 20:53:21 GMT-0600 (Mountain Daylight Time)`** |
| **Signature date** | **2026-07-11** |
| **Authorization expiry (UTC)** | **`2026-07-13T02:53:21Z`** *(48 hours after signature)* |
| **Minimum validity** | **24 hours** |
| **Assigned session ID** | **`RB-G9-20260713-AP02`** |
| **Confirmed operating block** | **2026-07-13 · 14:00–20:00 MDT** · UTC **`2026-07-13T20:00:00Z`** – **`2026-07-14T02:00:00Z`** |
| **Previous sessions (closed — must not reuse)** | **`RB-G9-20260706-EV01`** · **`RB-G9-20260707-EV02`** · **`RB-G9-20260709-AP01`** |
| **Planned RB-G9 session folder** | `../Sessions/SESSION — RB-G9-20260713-AP02 — {SESSION_DATE}/` *(create at session close — not created in this gate)* |
| **Research wallet public address** | `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |
| **OR-20260630-008** | **not_promoted** |
| **Live readiness claim status** | **No** |
| **Strategy readiness status** | **NOT READY** |
| **Capital exposure status** | **none** *(unchanged until separate proof gates)* |
| **Planning receipt** | [`../RB-G9 AP02 R15 AUTHORIZATION PLANNING — 2026-07-11.md`](../RB-G9%20AP02%20R15%20AUTHORIZATION%20PLANNING%20%E2%80%94%202026-07-11.md) |
| **Operating window selection** | [`../RB-G9 AP02 OPERATING WINDOW SELECTION — 2026-07-11.md`](../RB-G9%20AP02%20OPERATING%20WINDOW%20SELECTION%20%E2%80%94%202026-07-11.md) |
| **Pre-G1 readiness** | [`../RB-G9 AP02 PRE-G1 OPERATIONAL READINESS — 2026-07-11.md`](../RB-G9%20AP02%20PRE-G1%20OPERATIONAL%20READINESS%20%E2%80%94%202026-07-11.md) |
| **Proof-day runbook** | [`../RB-G9 AP02 PROOF-DAY RUNBOOK — 2026-07-11.md`](../RB-G9%20AP02%20PROOF-DAY%20RUNBOOK%20%E2%80%94%202026-07-11.md) |
| **Sign-off gate receipt** | [`../RB-G9 AP02 R15 AUTHORIZATION — 2026-07-11.md`](../RB-G9%20AP02%20R15%20AUTHORIZATION%20%E2%80%94%202026-07-11.md) |
| **AP01 closure (historical separation only)** | [`../RB-G9-20260709-AP01 UNUSED AUTHORIZATION CHAIN CLOSURE — 2026-07-11.md`](../RB-G9-20260709-AP01%20UNUSED%20AUTHORIZATION%20CHAIN%20CLOSURE%20%E2%80%94%202026-07-11.md) |

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

Later G2, G3, G4, process-isolation amendment, and any runtime stub **must** bind the **same session ID**, signer, wallet, purpose, status, and acknowledgment sets.

---

## 1. Authorized scope (ONE_SESSION_ONLY — armed no-submit proof only)

This authorization record authorizes **one bounded armed no-submit proof session only** — engineering validation under human supervision on the production host. **Not** strategy deployment, **not** profitability proof, **not** scaling, and **not** automatic permission to arm, create a runtime stub, stop processes, or execute.

| Authorized scope | Detail |
|------------------|--------|
| **Purpose** | Engineering validation of armed no-submit proof prerequisites under human supervision |
| **Session ID** | **`RB-G9-20260713-AP02`** |
| **Governance chain position** | **G1** — R15 session scope only |
| **Maximum LIVE_ARMED duration** | **15 minutes** from future C3 completion |
| **Future Domain B proof** | AP-01–AP-20 on production host *(separate G4 gate)* |
| **Future armed-safe N6 probe** | AP-17 *(separate G4 gate)* |
| **Immediate disarm** | Required after PASS, FAIL, abort, ambiguity, or timeout |

| Forbidden in this authorization and all downstream proof activity |
|-------------------------------------------------------------------|
| Candidate selection |
| Market scanning for execution |
| Execution quote |
| Final trade confirmation |
| Transaction construction for execution |
| Submit · sign · broadcast |
| Transaction signature (`txSig`) |
| Position · reconciliation · recovery |
| Capital exposure |
| Executor loop |
| Micro-live execution |

**This signed record does not authorize arming, LIVE posture, live submission, process stopping, runtime-stub creation, armed proof execution, micro-live execution authorization, candidate selection, final per-trade confirmation, broadcast, or capital exposure by itself.**

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

## 4. Process-isolation linkage statement (future G2 or AP02 additive amendment)

Later G2 or an AP02-specific additive Process Isolation Scope Amendment **must** carry forward:

| Requirement | Detail |
|-------------|--------|
| **Monitor restart wrapper** | Exact command identity only: `powershell.exe -NoExit -Command cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot; while ($true) { Get-Date; node monitor.js; Start-Sleep -Seconds 60 }` |
| **Dashboard wrapper** | **PASSIVE_LAUNCHER** classification — termination not required unless future inventory positively proves active restart |
| **Scanner wrapper** | Positive-identification rule — **no** external restart wrapper for `scanner_gmgn_trending.js` at pre-G1 capture; internal `--watch` only |
| **FOMO Wallet Monitor** | **Explicitly excluded** — scheduled task `FOMO-Wallet-Intel\run-monitor.bat` · must not stop · not in `isolatedProcessSetHash` |
| **Observation loops** | `b2a_24h` and `scanner.js` observation shells closed before Final Fresh Domain A baseline *(operator cleanup — not governed isolation)* |
| **Stop order** | Authorized restart wrappers before Node children |
| **Observation period** | **≥ 10 seconds** no-respawn after stops |
| **Output** | New **`isolatedProcessSetHash`** for AP02 |
| **Prohibited** | Broad PowerShell or Node termination · parent-tree wildcards · FOMO task stop |

AP01 Process Isolation Scope Amendment is **historical design evidence only** — **not** reusable authorization for AP02.

---

## 5. Timing statements and no-rush thresholds

| Field | Value |
|-------|-------|
| **Selected operating block** | **2026-07-13 · 14:00–20:00 MDT** |
| **Minimum G1 remaining before Final Fresh Domain A** | **≥ 4 hours** |
| **Minimum Domain A freshness before Process Isolation** | **≥ 20 minutes** |
| **Minimum Domain A freshness before C1** | **≥ 12 minutes** |
| **Minimum LIVE_ARMED window remaining before AP invocation** | **≥ 10 minutes** |
| **Threshold override** | **Forbidden** — fail closed and reschedule |

**Coordinated governance rule:** G1–G4 and isolation amendment should be signed in one coordinated block near the selected operating window on proof day. G1 alone does not authorize technical action.

**Validity vs operating block:** This record expires **`2026-07-13T02:53:21Z`**. The confirmed operating block begins **`2026-07-13T20:00:00Z`**. If this G1 is unused at expiry, a **fresh AP02 G1–G4 chain** is required before proof execution on the confirmed operating block.

---

## 6. Explicit non-authorizations

The following remain **not authorized** unless separately gated:

| Item | Status |
|------|--------|
| G2 · G3 · G4 sign-off | **No** |
| Process stop / isolation | **No** |
| Scheduled-task or service change | **No** |
| Final Fresh Domain A | **No** |
| Arming transition (C1–C3) / `liveArmed true` | **No** — separate G2 gate |
| `FOMO_ENABLE_LIVE_SUBMISSION=YES` | **No** |
| `executionMode LIVE` / `dryRunMode false` (production) | **No** |
| `FOMO_ALLOW_LOOP_LIVE=YES` | **No** |
| Runtime approval stub creation / activation | **No** — G3 separate gate |
| Armed no-submit proof execution | **No** — G4 separate gate |
| AP-01 through AP-20 invocation | **No** |
| Armed-safe N6 probe | **No** |
| Micro-live execution authorization | **No** |
| Candidate selection or approval | **No** |
| Session folder creation | **No** |
| Session ID reuse (EV01/EV02/AP01/AP02 retry without new chain) | **Forbidden** |
| OR-20260630-008 promotion | **No** |
| Live readiness claim | **No** |
| Strategy readiness claim | **No** |
| Profitability / edge claim | **No** |
| Capital exposure | **No** |

---

## 7. Validity and invalidation rules

### Validity window

| Rule | Detail |
|------|--------|
| **Minimum validity** | **24 hours** from signature |
| **Signature-to-use expiry** | **48 hours after signature** — expires **`2026-07-13T02:53:21Z`** |
| **Armed window cap** | **15 minutes** maximum after future C3 |
| **Reuse** | **Never** — consumed/closed after proof or abort |

### Invalidation triggers (first trigger wins)

| # | Trigger |
|---|---------|
| **I1** | Authorization expiry |
| **I2** | Armed duration exceeds **15 minutes** |
| **I3** | Proof completion |
| **I4** | Abort or disarm after use |
| **I5** | Session ID mismatch across G1–G4 · stub · receipts |
| **I6** | Signer or wallet mismatch |
| **I7** | `schemaVersion` / purpose / status mismatch |
| **I8** | Acknowledgment failure |
| **I9** | Prohibited field present in authorization or stub |
| **I10** | Code / config / process / auth fingerprint drift |
| **I11** | Executor loop process appears |
| **I12** | Position / reconciliation / recovery / capital exists |
| **I13** | Execution-path call count > 0 |
| **I14** | Any `txSig` appears |
| **I15** | Secret exposure |
| **I16** | OR-20260630-008 status change from **not_promoted** |
| **I17** | Ambiguity at any stage |

**After expiration or invalidation:** authorization is **never reusable**. New G1–G4 chain required for any retry.

---

## 8. Runtime-stub linkage statement (G3 — future, not created)

When authorized by a separate **G3 Runtime Stub Creation Authorization**, the gitignored runtime mirror at `analysis/r15_manual_approval_record.json` **must**:

| Requirement | Value |
|-------------|--------|
| **`schemaVersion`** | **`2`** |
| **`approvalPurpose`** | **`armed_no_submit_proof_only`** |
| **`finalApprovalStatus`** | **`APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY`** |
| **Session ID** | **`RB-G9-20260713-AP02`** — same as G1–G4 |
| **Signer / wallet** | Taylor Cheaney · `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |
| **Acknowledgment sets** | Same `commonAcknowledgments` + `armedProofAcknowledgments` as this record |
| **Forbidden fields** | Candidate · quote · trade · transaction · capital fields · secrets |
| **Gitignored** | **Yes** |
| **Secret-free** | **Yes** |
| **Removal** | Delete immediately after proof or abort — before Domain C validation |

Stub creation is **not authorized** by this G1 sign-off.

---

## 9. Fresh Domain A requirement

A **new** Final Fresh Domain A Proof is **mandatory**:

| Rule | Detail |
|------|--------|
| **When** | **After** AP02 G1–G4 and isolation amendment are signed · **immediately before** Process Isolation and C1 |
| **Freshness window** | Complete within **30 minutes** before isolation/C1 thresholds |
| **Prior proofs** | AP01 Domain A captures and dry proofs are **historical evidence only** · **never reuse** baseline hashes |

---

## 10. Prohibited authorization content

This record **must not** and **does not** contain:

- Candidate mint · token mint · pair · pool
- Quote · quote ID · expected output
- Trade size · position size · entry · target · stop
- Transaction authorization · submit/broadcast authorization · capital authorization
- Private key · signer secret · API key · RPC credential · secret-bearing URL

---

## 11. Linked evidence and decisions

| Prerequisite | Path |
|--------------|------|
| **AP02 R15 planning** | [`../RB-G9 AP02 R15 AUTHORIZATION PLANNING — 2026-07-11.md`](../RB-G9%20AP02%20R15%20AUTHORIZATION%20PLANNING%20%E2%80%94%202026-07-11.md) |
| **Operating window selection** | [`../RB-G9 AP02 OPERATING WINDOW SELECTION — 2026-07-11.md`](../RB-G9%20AP02%20OPERATING%20WINDOW%20SELECTION%20%E2%80%94%202026-07-11.md) |
| **Pre-G1 operational readiness** | [`../RB-G9 AP02 PRE-G1 OPERATIONAL READINESS — 2026-07-11.md`](../RB-G9%20AP02%20PRE-G1%20OPERATIONAL%20READINESS%20%E2%80%94%202026-07-11.md) |
| **R15 dual-purpose schema decision** | [`../Decisions/DECISION — R15 Dual-Purpose Approval Schema — 2026-07-09.md`](../Decisions/DECISION%20%E2%80%94%20R15%20Dual-Purpose%20Approval%20Schema%20%E2%80%94%202026-07-09.md) |
| **Armed no-submit production proof decision** | [`../Decisions/DECISION — Armed No-Submit Production Proof — 2026-07-09.md`](../Decisions/DECISION%20%E2%80%94%20Armed%20No-Submit%20Production%20Proof%20%E2%80%94%202026-07-09.md) |
| **Schema regression gate** | [`../R15 DUAL-PURPOSE SCHEMA REGRESSION GATE — 2026-07-09.md`](../R15%20DUAL-PURPOSE%20SCHEMA%20REGRESSION%20GATE%20%E2%80%94%202026-07-09.md) |
| **AP01 closure (historical separation only)** | [`../RB-G9-20260709-AP01 UNUSED AUTHORIZATION CHAIN CLOSURE — 2026-07-11.md`](../RB-G9-20260709-AP01%20UNUSED%20AUTHORIZATION%20CHAIN%20CLOSURE%20%E2%80%94%202026-07-11.md) |
| **Prior AP01 G1 (closed — do not reuse)** | [`AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260709-AP01 — 2026-07-09.md`](AUTHORIZATION%20%E2%80%94%20R15%20ARMED-NO-SUBMIT%20ONE_SESSION_ONLY%20%E2%80%94%20RB-G9-20260709-AP01%20%E2%80%94%202026-07-09.md) |

---

## 12. Future gate separation (unchanged by this sign-off)

| Gate | Relationship |
|------|--------------|
| **G2 — Arming Authorization** | Separate — C1–C3 transition only · must bind **`RB-G9-20260713-AP02`** · this G1 path and fingerprint |
| **G3 — Runtime Stub Creation Authorization** | Separate — gitignored stub · schemaVersion 2 proof mirror |
| **G4 — Armed No-Submit Proof Authorization** | Separate — Domain B proof + N6 armed probe · **explicitly not execution** |
| **Process Isolation Scope Amendment** | Separate — AP02 fresh additive authority |
| **Final Fresh Domain A Proof** | Mandatory after G1–G4 signed · freshness thresholds before isolation/C1 |
| **RB-G9 session folder** | Created at session close only |

G2–G4 must bind: exact AP02 session ID · exact G1 path · exact G1 fingerprint · signer and wallet · schemaVersion · purpose/status pair · signature and expiry · 15-minute cap · AP01 closure as historical separation evidence only.

---

## 13. Taylor Cheaney — signed attestation

I, Taylor Cheaney, acknowledge and attest:

1. I have read this R15 ONE_SESSION_ONLY armed no-submit proof session authorization record for session **`RB-G9-20260713-AP02`**.
2. **`schemaVersion: 2`** · **`approvalPurpose: armed_no_submit_proof_only`** · **`finalApprovalStatus: APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY`**.
3. Strategy readiness is **NOT READY**; I make **no** profitability or strategy-edge claim.
4. This authorization is **engineering validation only** — one temporary production-host armed no-submit proof session · maximum **15 minutes** LIVE_ARMED · confirmed operating block **2026-07-13 · 14:00–20:00 MDT**.
5. I explicitly accept all **`commonAcknowledgments`** and **`armedProofAcknowledgments`** listed in §2–§3.
6. This G1 sign-off **does not** authorize process stopping, arming transition, runtime-stub creation, armed proof execution, micro-live execution, candidate selection, final per-trade confirmation, submit, sign, broadcast, or capital exposure.
7. **No trade or capital exposure is authorized.**
8. **OR-20260630-008 remains not_promoted**.
9. Prior sessions **EV01 · EV02 · AP01** are **closed** — I will **not** reuse them.
10. This authorization expires **`2026-07-13T02:53:21Z`** if unused, and is **never reusable** after consumption.
11. I accept the process-isolation linkage statement (§4) and no-rush thresholds (§5) for future AP02 gates.

**Taylor's explicit statement (recorded):**

> I sign the R15 ONE_SESSION_ONLY armed no-submit proof session authorization dated 2026-07-11 for session `RB-G9-20260713-AP02`. SchemaVersion 2 · armed_no_submit_proof_only · APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY. Strategy readiness is NOT READY; I make no profitability or strategy-edge claim. No trade or capital exposure is authorized. This sign-off authorizes bounded proof session scope only — not process stop, not arming, not runtime stub creation, not armed proof execution, not micro-live execution, not candidate selection, not submit, not sign, not broadcast, and not OR promotion. OR-20260630-008 remains not_promoted. Confirmed operating block 2026-07-13 14:00–20:00 MDT.

| Field | Value |
|-------|-------|
| **Signed** | **Taylor Cheaney** |
| **Signature timestamp (UTC)** | **`2026-07-11T02:53:21Z`** |
| **Signature timestamp (local)** | **`Fri Jul 10 2026 20:53:21 GMT-0600 (Mountain Daylight Time)`** |
| **Authorization expiry (UTC)** | **`2026-07-13T02:53:21Z`** |

---

**Canonical path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260713-AP02 — 2026-07-11.md`
