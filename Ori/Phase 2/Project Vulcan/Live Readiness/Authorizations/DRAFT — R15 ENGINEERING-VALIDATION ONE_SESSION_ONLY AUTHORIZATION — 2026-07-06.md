# DRAFT — R15 Engineering-Validation ONE_SESSION_ONLY Session Authorization — 2026-07-06

> **⚠️ SUPERSEDED — RETAINED FOR AUDIT HISTORY ONLY**
>
> **Superseded by:** [`AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — 2026-07-06.md`](AUTHORIZATION%20%E2%80%94%20R15%20ENGINEERING-VALIDATION%20ONE_SESSION_ONLY%20%E2%80%94%202026-07-06.md) *(signed 2026-07-06 by Taylor Cheaney)* · **Gate receipt:** [`../R15 SESSION AUTHORIZATION SIGN-OFF GATE — 2026-07-06.md`](../R15%20SESSION%20AUTHORIZATION%20SIGN-OFF%20GATE%20%E2%80%94%202026-07-06.md)
>
> This draft has **no operational effect**. Do not use for arming or execution decisions.

> **Original draft banner (historical):**
>
> **DRAFT ONLY — NOT SIGNED — NOT AUTHORIZED — NOT ARMED**

---

## Record metadata

| Field | Value |
|-------|-------|
| **Gate name** | R15 Session Authorization — Engineering Validation · ONE_SESSION_ONLY |
| **Record type** | `ONE_SESSION_ONLY` · Engineering Validation · Pre-Arming Session Scope |
| **Status** | **DRAFT ONLY — NOT SIGNED — NOT AUTHORIZED — NOT ARMED** |
| **Intended signer** | **Taylor Cheaney** |
| **Draft date** | **2026-07-06** |
| **Signature date** | _________________ *(blank — not signed)* |
| **Intended session ID** | `RB-G9-YYYYMMDD-EV01` *(placeholder — assign at sign-off or first session prep)* |
| **Planned RB-G9 session folder** | `../Sessions/SESSION — RB-G9-YYYYMMDD-EV01 — YYYY-MM-DD/` *(create at session prep — not created in this gate)* |
| **Research wallet public address** | `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |
| **OR-20260630-008** | **not_promoted** |
| **Live readiness claim status** | **No** |
| **Human soak readiness claim status** | **Not authorized** |
| **Strategy readiness status** | **NOT READY** |
| **Capital exposure status** | **none** *(unchanged until separate execution gates)* |

---

## 1. Scope (if signed in future gate)

This authorization record, **if signed**, would authorize **one bounded engineering-validation session only** — not strategy deployment, not profitability proof, not scaling, and **not** automatic permission to arm or execute.

| Authorized scope (future, if signed) | Detail |
|--------------------------------------|--------|
| **Purpose** | Engineering validation of real-path readiness prerequisites: operator runbook, guard posture, signer/RPC coupling, e-stop/reconciliation interlocks under human supervision |
| **Session trades** | **Maximum 1 trade** in the first authorized session |
| **Default position size** | **0.005 SOL** |
| **Absolute trade cap** | **0.01 SOL not authorized** in this draft unless separately acknowledged in a later gate |
| **Session loss stop** | **0.03 SOL** |
| **Daily loss stop** | **0.03 SOL** |
| **Consecutive-loss stop** | **2** — halt |
| **Default slippage** | **100 bps only** |
| **G3 manual override (200 bps)** | **Disabled — must remain disabled** |
| **Scaling** | **Forbidden** |
| **Compounding / averaging / martingale** | **Forbidden** |
| **Unattended execution** | **Forbidden** |

**This draft does not authorize arming, LIVE posture, live submission, broadcast, or capital exposure by itself.**

---

## 2. Explicit non-authorizations (draft record)

Even **after** a future sign-off of this record, the following remain **not authorized** unless separately gated:

| Item | Status in this draft |
|------|----------------------|
| Arming / `liveArmed true` | **No** |
| `FOMO_ENABLE_LIVE_SUBMISSION=YES` | **No** |
| `executionMode LIVE` / `dryRunMode false` (production) | **No** |
| Micro-live execution authorization | **No** — separate gate |
| Actual transaction broadcast / trade execution | **No** — separate execution gate(s) |
| `FOMO_ALLOW_LOOP_LIVE=YES` | **No** |
| G3 manual slippage override | **No — disabled** |
| Scaling / second session / additional trades | **No** |
| OR-20260630-008 promotion | **No** |
| Live readiness claim | **No** |
| Human soak readiness claim | **No** |
| Strategy readiness claim | **No** |
| Profitability / edge claim | **No** |
| Runtime approval stub population | **No** — not created in draft gate |
| Production-root proof closure | **No** — deferred |

---

## 3. Risk acknowledgements (required at sign-off)

Taylor must acknowledge **all** of the following in a future sign-off gate. In this draft they are listed but **not attested**:

| # | Acknowledgement | Draft status |
|---|-----------------|--------------|
| **A1** | **Strategy readiness is NOT READY** | Listed — not signed |
| **A2** | **LR-02 / R7b thresholds NOT MET** (1/30 closes · 5/7 days · 0/10 thesis matches) | Listed — not signed |
| **A3** | **LR-03 NOT ENOUGH DATA** — no fresh-window edge proven | Listed — not signed |
| **A4** | **No profitability claim** and **no strategy-edge claim** | Listed — not signed |
| **A5** | **Real transaction broadcast remains unproven** by design until execution gate | Listed — not signed |
| **A6** | **Production-root proofs deferred** (N4/N6 prod tier · real-path residuals) | Listed — not signed |
| **A7** | **R13 signed 2026-07-06** waives LR-02/LR-03 **only** for bounded engineering-validation framing — not deployment | Listed — not signed |
| **A8** | **Arming remains a separate future gate** after this R15 sign-off (if ever) | Listed — not signed |
| **A9** | **Micro-Live Execution Authorization remains a separate future gate** | Listed — not signed |
| **A10** | **Actual execution remains a separate future gate** | Listed — not signed |
| **A11** | **OR-20260630-008 remains not_promoted** | Listed — not signed |
| **A12** | **Safety suite 82/82 PASS** verified 2026-07-06 — does not imply live/strategy readiness | Listed — not signed |
| **A13** | **Dedicated RPC read-only verified** 2026-07-06 — does not prove broadcast path | Listed — not signed |
| **A14** | **Signer placed; public address verified** — secret not exposed in Ori records | Listed — not signed |
| **A15** | **Total loss risk acknowledged** — session may lose up to signed caps | Listed — not signed |
| **A16** | **Slippage cap acknowledged** — 100 bps default; G3 disabled | Listed — not signed |
| **A17** | **MEV protection plan acknowledged** — `public_micro_live_only`; no scaling | Listed — not signed |
| **A18** | **Emergency stop policy acknowledged** — halt immediately; reset only after review | Listed — not signed |
| **A19** | **No auto-compounding acknowledged** | Listed — not signed |
| **A20** | **No averaging down acknowledged** | Listed — not signed |
| **A21** | **No unattended execution acknowledged** | Listed — not signed |
| **A22** | **Live trading not for income acknowledged** | Listed — not signed |

---

## 4. ONE_SESSION_ONLY expiration rules

If this record is signed, it expires under **any** of the following (first trigger wins):

| # | Expiration trigger |
|---|-------------------|
| **E1** | **One armed session completed** — including no-trade or aborted armed session |
| **E2** | **One trade executed** — session authorization consumed |
| **E3** | **Any ambiguity** — reconciliation uncertainty · submission unknown · operator uncertainty |
| **E4** | **Any halt** — policy halt · loss cap · slippage halt · operator abort |
| **E5** | **E-stop activated** — `emergencyStop: true` |
| **E6** | **Posture drift** — unexpected LIVE/disarmed/capital mismatch vs signed plan |
| **E7** | **Validity window lapse** — planned session does not begin within **14 calendar days** of signature date *(draft default — confirm at sign-off)* |
| **E8** | **RB-G9 not filed** — authorization treated as incomplete until session RB-G9 record exists |

**After expiration:**

| Rule | Requirement |
|------|-------------|
| **RB-G9 session record** | **Required** for any armed session — including `NO_TRADE_EXECUTED` · `ABORTED_BEFORE_BROADCAST` · `ESTOP_TRIGGERED` |
| **Second session** | **Forbidden** without filed RB-G9 **and** new signed R15 authorization |
| **Reauthorization** | New `AUTHORIZATION — R15 … — YYYY-MM-DD.md` referencing prior RB-G9 path |

---

## 5. Halt conditions (session scope)

Stop immediately if any:

- `emergencyStop` true
- Realized slippage **> 200 bps**
- Quote stale **> 10 s**
- Price impact **> 2%**
- Liquidity check fails (min pool **$25k**)
- Session or daily loss cap **0.03 SOL** reached
- **2 consecutive losses**
- Pending reconciliation blocks entries
- G3 override attempted
- Operator absent
- Dashboard/CLI posture mismatch
- Emotional override pressure

---

## 6. Linked evidence receipts

| Prerequisite | Path |
|--------------|------|
| **R13 signed waiver** | [`../R13 SIGN-OFF GATE — 2026-07-06.md`](../R13%20SIGN-OFF%20GATE%20%E2%80%94%202026-07-06.md) §4 |
| **Safety suite 82/82** | [`../A1-D03 HARNESS DRIFT REMEDIATION — 2026-07-06.md`](../A1-D03%20HARNESS%20DRIFT%20REMEDIATION%20%E2%80%94%202026-07-06.md) · [`../../ACTIVE_MANIFEST.md`](../../ACTIVE_MANIFEST.md) |
| **Signer placement** | [`../SIGNER SECRET PLACEMENT EXECUTION — 2026-07-06.md`](../SIGNER%20SECRET%20PLACEMENT%20EXECUTION%20%E2%80%94%202026-07-06.md) |
| **RPC no-broadcast** | [`../REAL RPC NO-BROADCAST READINESS CHECK — 2026-07-06.md`](../REAL%20RPC%20NO-BROADCAST%20READINESS%20CHECK%20%E2%80%94%202026-07-06.md) |
| **Live submission path review** | [`../LIVE SUBMISSION PATH READINESS REVIEW — 2026-07-06.md`](../LIVE%20SUBMISSION%20PATH%20READINESS%20REVIEW%20%E2%80%94%202026-07-06.md) |
| **Final pre-arming guard plan** | [`../FINAL PRE-ARMING GUARD TRANSITION PLAN — 2026-07-06.md`](../FINAL%20PRE-ARMING%20GUARD%20TRANSITION%20PLAN%20%E2%80%94%202026-07-06.md) |
| **R15 secure storage** | [`../R15 SECURE STORAGE DECISION — 2026-07-06.md`](../R15%20SECURE%20STORAGE%20DECISION%20%E2%80%94%202026-07-06.md) |
| **RB-G9 storage** | [`../RB-G9 STRUCTURED STORAGE DECISION — 2026-07-06.md`](../RB-G9%20STRUCTURED%20STORAGE%20DECISION%20%E2%80%94%202026-07-06.md) · [`../Sessions/README.md`](../Sessions/README.md) |

---

## 7. Future gate separation (unchanged by this draft)

| Gate | Relationship |
|------|--------------|
| **R15 Session Authorization Sign-Off** | Signs this record — **not performed in draft gate** |
| **Arming Authorization** | Separate — may follow signed R15 + other preconditions |
| **Micro-Live Execution Authorization** | Separate — after arming path if ever authorized |
| **Micro-Live Execution** | Separate — actual capped trade |
| **RB-G9 Post-Session Review** | Required after any armed session |

---

## 8. Draft attestation block (for future sign-off gate only)

> **Do not sign below in this draft gate.**

I, Taylor Cheaney, acknowledge and attest:

1. I have read this R15 ONE_SESSION_ONLY engineering-validation session authorization record.
2. Strategy readiness is **NOT READY**; LR-02/R7b and LR-03 are **not met**; I make **no** profitability or strategy-edge claim.
3. This authorization is **engineering validation only** — max **1 trade** · **0.005 SOL** default · caps and halts as listed.
4. This R15 sign-off **does not** authorize arming, micro-live execution authorization, broadcast, or capital exposure.
5. OR-20260630-008 remains **not_promoted**.
6. I accept residual risk for unproven real broadcast and deferred production-root proofs.
7. I will file RB-G9 session evidence after any armed session and will not start a second session without new authorization.

**Signed:** _________________________ · **Date:** _________________

---

## 9. Explicit non-actions (draft preparation gate)

| Item | Status |
|------|--------|
| R15 signed | **No** |
| Runtime stub created | **No** |
| Arming / LIVE / capital | **No** |
| Code / config / `.env` changed | **No** |
| OR promotion | **No** |
| Live / soak / strategy readiness claimed | **No** |

---

**Canonical path (draft):**
`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/DRAFT — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY AUTHORIZATION — 2026-07-06.md`
