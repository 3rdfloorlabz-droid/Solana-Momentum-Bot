# AUTHORIZATION — Runtime R15 Approval Stub Creation — RB-G9-20260707-EV02 — 2026-07-07

> **STUB CREATION AUTHORIZATION ONLY**
>
> **RUNTIME STUB NOT CREATED**
>
> **BUY GUARD NOT CLEARED**
>
> **MICRO-LIVE EXECUTION NOT AUTHORIZED**
>
> **NO SUBMIT · NO BROADCAST · NO CAPITAL EXPOSURE**
>
> This record authorizes a **future Fresh Runtime R15 Approval Stub Creation Gate** only. It **does not** create `analysis/r15_manual_approval_record.json`, clear the R15 BUY guard, authorize micro-live execution, or enable submit/broadcast.

---

## Record metadata

| Field | Value |
|-------|-------|
| **Gate name** | Fresh Runtime R15 Approval Stub Creation Authorization |
| **Record type** | Runtime Stub Creation Authorization · Engineering Validation · Governance-only |
| **Status** | **SIGNED — STUB NOT CREATED — BUY BLOCKED — ARMED ONLY** |
| **Signer** | **Taylor Cheaney** |
| **Signature date** | **2026-07-07** |
| **Linked session ID** | **`RB-G9-20260707-EV02`** |
| **Linked R15 expiry** | **2026-07-14** *(unused window)* |
| **Canonical R15 record** | [`AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — RB-G9-20260707-EV02 — 2026-07-07.md`](AUTHORIZATION%20%E2%80%94%20R15%20ENGINEERING-VALIDATION%20ONE_SESSION_ONLY%20%E2%80%94%20RB-G9-20260707-EV02%20%E2%80%94%202026-07-07.md) |
| **Linked arming record** | [`AUTHORIZATION — Arming — RB-G9-20260707-EV02 — 2026-07-07.md`](AUTHORIZATION%20%E2%80%94%20Arming%20%E2%80%94%20RB-G9-20260707-EV02%20%E2%80%94%202026-07-07.md) |
| **Runtime stub path (future)** | `analysis/r15_manual_approval_record.json` *(gitignored · non-canonical)* |
| **Research wallet public address** | `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |
| **OR-20260630-008** | **not_promoted** |
| **Strategy readiness** | **NOT READY** |
| **Gate receipt** | [`../FRESH RUNTIME R15 APPROVAL STUB CREATION AUTHORIZATION — 2026-07-07.md`](../FRESH%20RUNTIME%20R15%20APPROVAL%20STUB%20CREATION%20AUTHORIZATION%20%E2%80%94%202026-07-07.md) |
| **Planning receipt** | [`../FRESH RUNTIME R15 APPROVAL STUB PLANNING — 2026-07-07.md`](../FRESH%20RUNTIME%20R15%20APPROVAL%20STUB%20PLANNING%20%E2%80%94%202026-07-07.md) |

---

## 1. What this signed record authorizes

Taylor authorizes **only** a future **Fresh Runtime R15 Approval Stub Creation Gate** to:

1. Create `analysis/r15_manual_approval_record.json` from the signed canonical EV02 R15 record metadata only.
2. Keep the stub **gitignored**, **secret-free**, and **non-canonical**.
3. Run **no-submit** loader validation only (`assertMicroLiveApprovalRecord` probe).
4. **Stop immediately** — no micro-live authorization · no candidate selection · no final per-trade confirmation · no submit · no broadcast · no loops.

**This gate does not create the stub.**

---

## 2. Authorized future stub creation constraints

The future creation gate must populate the stub with at least these **loader-enforced** fields:

| Field | Required value |
|-------|----------------|
| **`approvalId`** | Non-empty — **`RB-G9-20260707-EV02`** |
| **`operatorName`** | Non-empty — **`Taylor Cheaney`** |
| **`dateTime`** | Non-empty — aligned to signed EV02 R15 (**2026-07-07**) |
| **`operatorSignaturePresent`** | **`true`** |
| **`finalApprovalStatus`** | **`APPROVED FOR ONE MICRO-LIVE SESSION ONLY`** *(exact string)* |
| **`researchWalletPublicAddress`** | **`FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6`** — must match `live_config.json` |
| **`acknowledgments.*`** | All **8** fields **`true`**: totalLossRisk · slippageCap · mevProtectionPlan · emergencyStopPolicy · noAutoCompounding · noAveragingDown · noUnattendedExecution · liveTradingNotForIncome |

**Signed session bounds (creation gate must enforce):**

| Constraint | Value |
|------------|-------|
| Default / max first trade size | **0.005 SOL** |
| **0.01 SOL** | **Not authorized** |
| Max trades this session | **1** |
| G3 manual override | **Disabled** |
| Scaling | **Forbidden** |
| MEV route mode | **`public_micro_live_only`** |
| Purpose | **Engineering validation only** |
| **`validUntil`** | **No later than 2026-07-14** |

**Required informational `oriLinkage` block (audit — not loader-enforced):**

- `signedRecordPath` → canonical EV02 R15 authorization path
- `armingRecordPath` → EV02 arming authorization path
- `sessionId` → **`RB-G9-20260707-EV02`**
- `validUntil` → **`2026-07-14`**
- `purpose` → `engineering_validation_only`
- `g3OverrideDisabled: true` · `noScaling: true` · `maxSlippageBps: 100` · `schemaVersion: 1`

**Forbidden in stub JSON:** private keys · secrets · RPC credentials · raw environment values

---

## 3. Host-process safety condition (mandatory at future creation gate)

| Precondition | Requirement |
|--------------|-------------|
| **`live_executor.js --loop` processes** | **Zero** immediately before stub creation |
| **Replacement/child executor process** | **None** |
| **Monitor/scanner** | May remain only if still demonstrably isolated |
| **Abort if loop detected** | **Yes** — do not write stub |

---

## 4. Explicit boundaries after future stub creation

| Effect | Status |
|--------|--------|
| **May clear R15 submit-time guard** (`assertMicroLiveApprovalRecord`) | **Yes** — if stub valid |
| **Authorizes micro-live execution** | **No** — separate Micro-Live Execution Authorization required |
| **Authorizes candidate selection** | **No** |
| **Authorizes final per-trade confirmation** | **No** |
| **Authorizes submit or broadcast** | **No** — separate execution gate required |
| **Authorizes scanner/executor loops** | **No** |
| **Authorizes capital exposure** | **No** |
| **Claims live/soak/strategy readiness** | **No** |

**Separate gates still required after stub creation:**

- **Micro-Live Execution Authorization Preparation Review**
- **Micro-Live Execution Authorization Sign-Off**
- **Micro-Live Single-Trade Execution Gate** *(or equivalent)*

---

## 5. Required future stub-creation gate verification

The future **Fresh Runtime R15 Approval Stub Creation Gate** must verify:

| # | Check |
|---|-------|
| **V1** | Stub path under gitignored `analysis/` |
| **V2** | JSON parse-valid |
| **V3** | Canonical signed EV02 R15 record exists |
| **V4** | Session ID · signer · date · wallet · expiry cross-checks pass |
| **V5** | **Zero** `live_executor.js --loop` processes |
| **V6** | `assertMicroLiveApprovalRecord(cfg)` **PASS** in no-submit probe only |
| **V7** | **No** `enterPosition` · `submitSwap` · or broadcast path invoked |
| **V8** | **No** position · reconciliation · recovery · or capital exposure |
| **V9** | `FOMO_ALLOW_LOOP_LIVE` not `YES` · G3 disabled · OR not promoted |
| **V10** | Gate receipt written · stub not committed to git |

---

## 6. Expiration and removal rules

The runtime stub must be **removed or disabled** when any of the following occur:

| Trigger | Action |
|---------|--------|
| R15 expires (**2026-07-14** unused) or is consumed | Remove/disable stub |
| One entry executed | Remove/disable stub · RB-G9 required |
| Armed session ends / disarm | Remove/disable stub · RB-G9 at `Sessions/SESSION — RB-G9-20260707-EV02 — {date}/` |
| Ambiguity · halt · e-stop · posture drift | Halt · remove/disable stub · RB-G9 |
| Safety or validator failure | Remove/disable stub |
| Jupiter U1/U2 regression | Remove/disable stub |
| Signer or public address mismatch | Stub invalid · reauthorization required |
| Process-isolation failure (executor loop present) | Remove/disable stub · re-verify isolation |

**RB-G9 filing required** after session closure per R15 ONE_SESSION_ONLY policy.

**Canonical signed Ori record preserved** — never delete `Authorizations/AUTHORIZATION — R15 … RB-G9-20260707-EV02 …`.

---

## 7. Explicit non-authorizations (this signed record)

| Item | Status |
|------|--------|
| Runtime stub created in this gate | **No** |
| R15 BUY guard cleared | **No** |
| Micro-live execution authorized | **No** |
| Candidate selection / final confirm | **No** |
| Submit / broadcast | **No** |
| Loops started | **No** |
| Position / reconciliation / recovery / capital | **No** |
| `live_config.json` / `.env` modified | **No** |
| `FOMO_ALLOW_LOOP_LIVE=YES` | **No** |
| G3 enabled | **No** |
| 0.01 SOL authorized | **No** |
| OR promotion | **No** |
| Live / soak / strategy / profitability claims | **No** |
| EV01 session/auth reuse | **Forbidden** |

---

## 8. Linked evidence

| Prerequisite | Path |
|--------------|------|
| **Stub planning** | [`../FRESH RUNTIME R15 APPROVAL STUB PLANNING — 2026-07-07.md`](../FRESH%20RUNTIME%20R15%20APPROVAL%20STUB%20PLANNING%20%E2%80%94%202026-07-07.md) |
| **Canonical EV02 R15** | [`AUTHORIZATION — R15 … RB-G9-20260707-EV02 — 2026-07-07.md`](AUTHORIZATION%20%E2%80%94%20R15%20ENGINEERING-VALIDATION%20ONE_SESSION_ONLY%20%E2%80%94%20RB-G9-20260707-EV02%20%E2%80%94%202026-07-07.md) |
| **EV02 arming authorization** | [`AUTHORIZATION — Arming — RB-G9-20260707-EV02 — 2026-07-07.md`](AUTHORIZATION%20%E2%80%94%20Arming%20%E2%80%94%20RB-G9-20260707-EV02%20%E2%80%94%202026-07-07.md) |
| **Arming transition** | [`../FRESH ARMING TRANSITION EXECUTION GATE — 2026-07-07.md`](../FRESH%20ARMING%20TRANSITION%20EXECUTION%20GATE%20%E2%80%94%202026-07-07.md) |
| **Executor loop stop** | [`../ARMED-STATE EXECUTOR LOOP STOP GATE — 2026-07-07.md`](../ARMED-STATE%20EXECUTOR%20LOOP%20STOP%20GATE%20%E2%80%94%202026-07-07.md) |
| **R15 secure storage** | [`../R15 SECURE STORAGE DECISION — 2026-07-06.md`](../R15%20SECURE%20STORAGE%20DECISION%20%E2%80%94%202026-07-06.md) |
| **RB-G9 storage** | [`../RB-G9 STRUCTURED STORAGE DECISION — 2026-07-06.md`](../RB-G9%20STRUCTURED%20STORAGE%20DECISION%20%E2%80%94%202026-07-06.md) |

---

## 9. Taylor Cheaney — signed attestation

I, Taylor Cheaney, acknowledge and attest:

1. I authorize a **future Fresh Runtime R15 Approval Stub Creation Gate** only — not stub creation in this gate.
2. The future gate may create `analysis/r15_manual_approval_record.json` from the signed canonical EV02 R15 record, secret-free and gitignored.
3. Stub creation **may** clear the R15 submit-time guard but **does not** authorize micro-live execution, candidate selection, final per-trade confirmation, submit, broadcast, loops, or capital exposure.
4. Separate Micro-Live Execution Authorization and Execution gates remain required.
5. Session **`RB-G9-20260707-EV02`** bounds apply: **0.005 SOL** · max **1 trade** · **0.01 SOL not authorized** · G3 disabled · engineering validation only · unused expiry **2026-07-14**.
6. No `live_executor.js --loop` process may exist immediately before stub creation.
7. OR-20260630-008 remains **not_promoted**; strategy remains **NOT READY**; I make no profitability or readiness claim.
8. Prior session **`RB-G9-20260706-EV01`** and its authorization chain are **closed** — I will **not** reuse them.

**Taylor's explicit statement (recorded):**

> I sign the Fresh Runtime R15 Approval Stub Creation Authorization dated 2026-07-07 for session `RB-G9-20260707-EV02`. This gate does not create the stub. A future stub creation gate may mirror the signed EV02 R15 record only. Stub creation does not authorize micro-live execution, candidate selection, final per-trade confirmation, submit, or broadcast. No executor loop may be running at stub creation. OR-20260630-008 remains not_promoted.

**Signed:** Taylor Cheaney · **Date:** 2026-07-07

---

**Canonical path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — Runtime R15 Approval Stub Creation — RB-G9-20260707-EV02 — 2026-07-07.md`
