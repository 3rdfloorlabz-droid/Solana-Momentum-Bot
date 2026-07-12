# AUTHORIZATION — Runtime R15 Approval Stub Creation — 2026-07-07

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
> This record authorizes a **future Runtime R15 Approval Stub Creation Gate** only. It **does not** create `analysis/r15_manual_approval_record.json`, clear the R15 BUY guard, authorize micro-live execution, or enable submit/broadcast.

---

## Record metadata

| Field | Value |
|-------|-------|
| **Gate name** | Runtime R15 Approval Stub Creation Authorization |
| **Record type** | Runtime Stub Creation Authorization · Engineering Validation · Governance-only |
| **Status** | **SIGNED — STUB NOT CREATED — BUY BLOCKED — ARMED ONLY** |
| **Signer** | **Taylor Cheaney** |
| **Signature date** | **2026-07-07** |
| **Linked R15 session** | **`RB-G9-20260706-EV01`** |
| **Linked R15 expiry** | **2026-07-20** *(unused window)* |
| **Canonical R15 record** | [`AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — 2026-07-06.md`](AUTHORIZATION%20%E2%80%94%20R15%20ENGINEERING-VALIDATION%20ONE_SESSION_ONLY%20%E2%80%94%202026-07-06.md) |
| **Runtime stub path (future)** | `analysis/r15_manual_approval_record.json` *(gitignored · non-canonical)* |
| **Research wallet public address** | `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |
| **OR-20260630-008** | **not_promoted** |
| **Strategy readiness** | **NOT READY** |
| **Gate receipt** | [`../RUNTIME R15 APPROVAL STUB CREATION AUTHORIZATION — 2026-07-07.md`](../RUNTIME%20R15%20APPROVAL%20STUB%20CREATION%20AUTHORIZATION%20%E2%80%94%202026-07-07.md) |

---

## 1. What this signed record authorizes

Taylor authorizes **only** a future **Runtime R15 Approval Stub Creation Gate** to:

1. Create `analysis/r15_manual_approval_record.json` from the signed canonical R15 record metadata only.
2. Keep the stub **gitignored**, **secret-free**, and **non-canonical**.
3. Run **no-submit** loader validation only (`assertMicroLiveApprovalRecord` probe).
4. **Stop immediately** — no micro-live authorization · no submit · no broadcast · no loops.

**This gate does not create the stub.**

---

## 2. Authorized future stub creation constraints

The future creation gate must populate the stub with at least these **loader-enforced** fields:

| Field | Required value |
|-------|----------------|
| **`approvalId`** | Non-empty — **`RB-G9-20260706-EV01`** |
| **`operatorName`** | Non-empty — **`Taylor Cheaney`** |
| **`dateTime`** | Non-empty — aligned to signed R15 (**2026-07-06**) |
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
| Purpose | **Engineering validation only** |
| **`validUntil`** | **No later than 2026-07-20** |

**Recommended informational `oriLinkage` block (audit only — not loader-enforced):**

- `schemaVersion`, `signedRecordPath`, `sessionId`, `validUntil`, `purpose`, `g3OverrideDisabled`, `noScaling`, `maxSlippageBps: 100`

**Forbidden in stub JSON:** secrets · RPC credentials · raw env values

---

## 3. Explicit boundaries after future stub creation

| Effect | Status |
|--------|--------|
| **May clear R15 submit-time guard** (`assertMicroLiveApprovalRecord`) | **Yes** — if stub valid |
| **Authorizes micro-live execution** | **No** — separate Micro-Live Execution Authorization required |
| **Authorizes submit or broadcast** | **No** — separate execution gate required |
| **Authorizes scanner/executor loops** | **No** |
| **Authorizes capital exposure** | **No** |
| **Claims live/soak/strategy readiness** | **No** |

**Separate gates still required:**

- **Micro-Live Execution Authorization Preparation Review**
- **Micro-Live Execution Authorization Sign-Off** *(or equivalent)*
- **Micro-Live Execution Gate** *(actual capped trade)*

---

## 4. Required future stub-creation gate verification

The future **Runtime R15 Approval Stub Creation Gate** must verify:

| # | Check |
|---|-------|
| **V1** | Stub path under gitignored `analysis/` |
| **V2** | JSON parse-valid |
| **V3** | Canonical signed R15 record exists |
| **V4** | Session ID · signer · date · wallet · expiry cross-checks pass |
| **V5** | `assertMicroLiveApprovalRecord(cfg)` **PASS** in no-submit probe only |
| **V6** | **No** scanner/executor loop started |
| **V7** | **No** `enterPosition` · `submitSwap` · or broadcast path invoked |
| **V8** | **No** position · reconciliation · or capital exposure |
| **V9** | `FOMO_ALLOW_LOOP_LIVE` not `YES` · G3 disabled · OR not promoted |
| **V10** | Gate receipt written · stub not committed to git |

---

## 5. Expiration and removal rules

The runtime stub must be **removed or disabled** when any of the following occur:

| Trigger | Action |
|---------|--------|
| R15 expires (**2026-07-20** unused) or is consumed | Remove/disable stub |
| One trade executed | Remove/disable stub · RB-G9 required |
| Armed session ends / disarm | Remove/disable stub · RB-G9 required |
| Ambiguity · halt · e-stop · posture drift | Halt · remove/disable stub · RB-G9 |
| Signer or public address change | Stub invalid · reauthorization required |

**RB-G9 filing required** after session closure per R15 ONE_SESSION_ONLY policy.

**Canonical signed Ori record preserved** — never delete `Authorizations/AUTHORIZATION — R15 … — 2026-07-06.md`.

---

## 6. Explicit non-authorizations (this signed record)

| Item | Status |
|------|--------|
| Runtime stub created in this gate | **No** |
| R15 BUY guard cleared | **No** |
| Micro-live execution authorized | **No** |
| Submit / broadcast | **No** |
| Loops started | **No** |
| Position / reconciliation / capital | **No** |
| `live_config.json` / `.env` modified | **No** |
| `FOMO_ALLOW_LOOP_LIVE=YES` | **No** |
| G3 enabled | **No** |
| 0.01 SOL authorized | **No** |
| OR promotion | **No** |
| Live / soak / strategy / profitability claims | **No** |

---

## 7. Linked evidence

| Prerequisite | Path |
|--------------|------|
| **Stub planning** | [`../RUNTIME R15 APPROVAL STUB PLANNING — 2026-07-07.md`](../RUNTIME%20R15%20APPROVAL%20STUB%20PLANNING%20%E2%80%94%202026-07-07.md) |
| **Canonical R15** | [`AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — 2026-07-06.md`](AUTHORIZATION%20%E2%80%94%20R15%20ENGINEERING-VALIDATION%20ONE_SESSION_ONLY%20%E2%80%94%202026-07-06.md) |
| **Arming authorization** | [`AUTHORIZATION — Arming — 2026-07-07.md`](AUTHORIZATION%20%E2%80%94%20Arming%20%E2%80%94%202026-07-07.md) |
| **Arming transition** | [`../ARMING TRANSITION EXECUTION GATE — 2026-07-07.md`](../ARMING%20TRANSITION%20EXECUTION%20GATE%20%E2%80%94%202026-07-07.md) |
| **R15 secure storage** | [`../R15 SECURE STORAGE DECISION — 2026-07-06.md`](../R15%20SECURE%20STORAGE%20DECISION%20%E2%80%94%202026-07-06.md) |
| **RB-G9 storage** | [`../RB-G9 STRUCTURED STORAGE DECISION — 2026-07-06.md`](../RB-G9%20STRUCTURED%20STORAGE%20DECISION%20%E2%80%94%202026-07-06.md) |

---

## 8. Taylor Cheaney — signed attestation

I, Taylor Cheaney, acknowledge and attest:

1. I authorize a **future Runtime R15 Approval Stub Creation Gate** only — not stub creation in this gate.
2. The future gate may create `analysis/r15_manual_approval_record.json` from the signed canonical R15 record, secret-free and gitignored.
3. Stub creation **may** clear the R15 submit-time guard but **does not** authorize micro-live execution, submit, broadcast, loops, or capital exposure.
4. Separate Micro-Live Execution Authorization and Execution gates remain required.
5. Session `RB-G9-20260706-EV01` bounds apply: **0.005 SOL** · max **1 trade** · **0.01 SOL not authorized** · G3 disabled · engineering validation only.
6. OR-20260630-008 remains **not_promoted**; strategy remains **NOT READY**; I make no profitability or readiness claim.

**Taylor's explicit statement (recorded):**

> I sign the Runtime R15 Approval Stub Creation Authorization dated 2026-07-07. This gate does not create the stub. A future stub creation gate may mirror the signed R15 record only. Stub creation does not authorize micro-live execution, submit, or broadcast. OR-20260630-008 remains not_promoted.

**Signed:** Taylor Cheaney · **Date:** 2026-07-07

---

**Canonical path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — Runtime R15 Approval Stub Creation — 2026-07-07.md`
