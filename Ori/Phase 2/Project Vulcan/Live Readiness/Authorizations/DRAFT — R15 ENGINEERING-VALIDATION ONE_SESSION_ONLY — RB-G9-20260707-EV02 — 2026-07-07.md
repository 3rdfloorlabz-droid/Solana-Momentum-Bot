# DRAFT — R15 Engineering-Validation ONE_SESSION_ONLY Session Authorization — RB-G9-20260707-EV02 — 2026-07-07

> **⚠️ SUPERSEDED — RETAINED FOR AUDIT HISTORY ONLY**
>
> **Superseded by:** [`AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — RB-G9-20260707-EV02 — 2026-07-07.md`](AUTHORIZATION%20%E2%80%94%20R15%20ENGINEERING-VALIDATION%20ONE_SESSION_ONLY%20%E2%80%94%20RB-G9-20260707-EV02%20%E2%80%94%202026-07-07.md) *(signed 2026-07-07 by Taylor Cheaney)* · **Sign-off receipt:** [`../FRESH R15 SESSION AUTHORIZATION SIGN-OFF — 2026-07-07.md`](../FRESH%20R15%20SESSION%20AUTHORIZATION%20SIGN-OFF%20%E2%80%94%202026-07-07.md)
>
> This draft has **no operational effect**. Do not use for arming or execution decisions.

> **Original draft banner (historical):**
>
> **DRAFT ONLY — NOT SIGNED — NOT AUTHORIZED — NOT ARMED**

---

## Record metadata

| Field | Value |
|-------|-------|
| **Gate name** | Fresh R15 Session Authorization Draft — Engineering Validation · ONE_SESSION_ONLY |
| **Record type** | `ONE_SESSION_ONLY` · Engineering Validation · Pre-Arming Session Scope |
| **Status** | **DRAFT ONLY — NOT SIGNED — NOT AUTHORIZED — NOT ARMED** |
| **Intended signer** | **Taylor Cheaney** |
| **Draft date** | **2026-07-07** |
| **Proposed signature date** | **2026-07-07** |
| **Signature date** | _________________ *(blank — not signed)* |
| **Assigned session ID** | **`RB-G9-20260707-EV02`** |
| **Previous session (closed)** | **`RB-G9-20260706-EV01`** — **NO_TRADE_EXECUTED** · **must not be reused** |
| **Planned RB-G9 session folder** | `../Sessions/SESSION — RB-G9-20260707-EV02 — {SESSION_DATE}/` *(create at session close — not created in draft gate)* |
| **Proposed unused expiry date** | **2026-07-14** *(7 calendar days from proposed signature date)* |
| **Research wallet public address** | `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |
| **OR-20260630-008** | **not_promoted** |
| **Live readiness claim status** | **No** |
| **Human soak readiness claim status** | **Not authorized** |
| **Strategy readiness status** | **NOT READY** |
| **Capital exposure status** | **none** *(unchanged until separate execution gates)* |
| **Planning receipt** | [`../FRESH R15 SESSION PLANNING — 2026-07-07.md`](../FRESH%20R15%20SESSION%20PLANNING%20%E2%80%94%202026-07-07.md) |
| **Draft gate receipt** | [`../FRESH R15 SESSION AUTHORIZATION DRAFT — 2026-07-07.md`](../FRESH%20R15%20SESSION%20AUTHORIZATION%20DRAFT%20%E2%80%94%202026-07-07.md) |

---

## 1. Authorized scope (if signed in future sign-off gate)

This authorization record, **if signed**, would authorize **one bounded engineering-validation session only** — not strategy deployment, not profitability proof, not scaling, and **not** automatic permission to arm, create a runtime stub, select a candidate, or execute.

| Authorized scope (future, if signed) | Detail |
|--------------------------------------|--------|
| **Purpose** | Engineering validation of real-path readiness prerequisites under human supervision — **not** strategy deployment |
| **Session ID** | **`RB-G9-20260707-EV02`** |
| **Max entries** | **1 BUY** |
| **Mandatory exit** | **1 SELL** — entry and exit authorized together; **no second entry** |
| **Default position size** | **0.005 SOL** |
| **Absolute trade cap** | **0.01 SOL not authorized** |
| **Session loss stop** | **0.03 SOL** |
| **Daily loss stop** | **0.03 SOL** |
| **Consecutive-loss stop (`maxDailyLossCount`)** | **2** — halt |
| **Default slippage** | **100 bps only** |
| **G3 manual override (200 bps)** | **Disabled — must remain disabled** |
| **Scaling** | **Forbidden** |
| **Averaging down** | **Forbidden** |
| **Compounding / martingale** | **Forbidden** |
| **Unattended execution** | **Forbidden** |
| **Loop authorization** | **`FOMO_ALLOW_LOOP_LIVE=YES` forbidden** · scanner/executor `--loop` forbidden |
| **MEV route mode** | **`public_micro_live_only`** |

**This draft does not authorize arming, LIVE posture, live submission, runtime-stub creation, micro-live execution, candidate selection, final per-trade confirmation, broadcast, or capital exposure by itself.**

---

## 2. Execution bounds (if signed — enforced at future execution gates)

| Parameter | Bound |
|-----------|-------|
| **Default slippage cap** | **100 bps (1.0%)** |
| **G3 manual override** | **Disabled** |
| **Max route price impact** | **≤ 2.0%** |
| **Quote freshness maximum** | **≤ 10 seconds** |
| **Min pool liquidity floor** | **≥ $25,000 USD** |
| **Target (monitoring)** | **+10%** |
| **Stop (monitoring)** | **−5%** |
| **Position timeout** | **20 minutes** |
| **Confirmation timeout** | **30 seconds** |
| **Realized slippage halt** | **200 bps** post-fill |
| **Session loss stop** | **0.03 SOL** |
| **Daily loss stop** | **0.03 SOL** |
| **`maxDailyLossCount`** | **2** |
| **Max open positions** | **1** |
| **Max trades this session** | **1** |

---

## 3. Explicit non-authorizations (this draft record)

The following are **not authorized** by this draft and remain **not authorized** unless separately gated after a future sign-off:

| Item | Status |
|------|--------|
| R15 signed / active | **No** |
| Arming / `liveArmed true` | **No** |
| `FOMO_ENABLE_LIVE_SUBMISSION=YES` | **No** |
| `executionMode LIVE` / `dryRunMode false` (production) | **No** |
| `FOMO_ALLOW_LOOP_LIVE=YES` | **No** |
| Runtime R15 approval stub creation / activation | **No** — `analysis/r15_manual_approval_record.json` **not created** |
| Micro-live execution authorization | **No** — separate gate |
| Candidate selection or approval | **No** — separate gate |
| Final per-trade confirmation | **No** — separate step immediately before any BUY |
| Actual transaction broadcast / trade execution | **No** — separate execution gate(s) |
| Scanner/executor loops | **No** |
| G3 manual slippage override | **No — disabled** |
| Scaling / second session / additional trades | **No** |
| Session ID reuse (`RB-G9-20260706-EV01`) | **Forbidden** |
| OR-20260630-008 promotion | **No** |
| Live readiness claim | **No** |
| Human soak readiness claim | **No** |
| Strategy readiness claim | **No** |
| Profitability / edge claim | **No** |
| Production-root proof closure | **No** — deferred |
| Capital exposure | **No** |

---

## 4. Risk acknowledgements (required at sign-off — not attested in this draft)

Taylor must acknowledge **all** of the following in a future **Fresh R15 Session Authorization Sign-Off** gate. In this draft they are listed but **not signed**:

| # | Acknowledgement | Draft status |
|---|-----------------|--------------|
| **A1** | **Strategy readiness is NOT READY** | Listed — not signed |
| **A2** | **LR-02 / R7b thresholds NOT MET** — not deployment-ready | Listed — not signed |
| **A3** | **LR-03 NOT ENOUGH DATA** — no fresh-window edge proven | Listed — not signed |
| **A4** | **No profitability claim** and **no strategy-edge claim** | Listed — not signed |
| **A5** | **Real transaction broadcast remains unproven** until future execution gate | Listed — not signed |
| **A6** | **Production-root reconciliation and e-stop evidence remains deferred** — fixture/drill evidence only | Listed — not signed |
| **A7** | **R13 signed 2026-07-06** waives LR-02/LR-03 **only** for bounded engineering-validation framing — not deployment | Listed — not signed |
| **A8** | **Total loss is possible** — session may lose up to signed caps (0.03 SOL loss stops) | Listed — not signed |
| **A9** | **Slippage, MEV, RPC, confirmation, and failed-exit risks exist** — caps enforced but not eliminated | Listed — not signed |
| **A10** | **Five validator warnings are accepted informational residuals** — do not imply readiness | Listed — not signed |
| **A11** | **Prior EV01 authorization chain is consumed/closed** — fresh downstream governance required | Listed — not signed |
| **A12** | **Arming remains a separate future gate** | Listed — not signed |
| **A13** | **Runtime approval stub remains separate** — not created in draft or sign-off gate | Listed — not signed |
| **A14** | **Micro-Live Execution Authorization remains a separate future gate** | Listed — not signed |
| **A15** | **Candidate selection and final per-trade confirmation remain separate** | Listed — not signed |
| **A16** | **Actual execution remains a separate future gate** | Listed — not signed |
| **A17** | **OR-20260630-008 remains not_promoted** | Listed — not signed |
| **A18** | **Safety suite 85/85 PASS** verified 2026-07-07 — does not imply live/strategy readiness | Listed — not signed |
| **A19** | **validate_live_system PASS** (0 failures, 5 warnings) — does not imply live/strategy readiness | Listed — not signed |
| **A20** | **Jupiter U1/U2 remediated** — no-broadcast verified; does not prove broadcast path | Listed — not signed |
| **A21** | **Dedicated RPC read-only verified historically** — does not prove broadcast path | Listed — not signed |
| **A22** | **Signer placed; public address verified** — secret not exposed in Ori records | Listed — not signed |
| **A23** | **Slippage cap acknowledged** — 100 bps default; G3 disabled | Listed — not signed |
| **A24** | **MEV protection plan acknowledged** — `public_micro_live_only`; no scaling | Listed — not signed |
| **A25** | **Emergency stop policy acknowledged** — halt immediately; reset only after review | Listed — not signed |
| **A26** | **No auto-compounding / averaging / unattended execution acknowledged** | Listed — not signed |
| **A27** | **Live trading not for income acknowledged** | Listed — not signed |

---

## 5. ONE_SESSION_ONLY expiration and invalidation rules

If this record is signed, it expires or is invalidated under **any** of the following (first trigger wins):

| # | Trigger |
|---|---------|
| **E1** | **First armed session completed** — including no-trade or aborted armed session |
| **E2** | **One entry executed** — session authorization consumed; exit authority survives only to close authorized position |
| **E3** | **Any ambiguity** — reconciliation uncertainty · submission unknown · operator uncertainty |
| **E4** | **Any halt** — policy halt · loss cap · slippage halt · operator abort |
| **E5** | **E-stop activated** — `emergencyStop: true` |
| **E6** | **Posture drift** — unexpected LIVE/disarmed/capital mismatch vs signed plan |
| **E7** | **Signer or public-address mismatch** vs config / stub |
| **E8** | **Safety-suite or validator failure** — suite not green · `validate_live_system` failure |
| **E9** | **Jupiter adapter regression** — v6 path reintroduced · host mismatch · fee double-count |
| **E10** | **Validity window lapse** — planned session does not begin within **7 calendar days** of signature date (**expires 2026-07-14** if signed 2026-07-07) |
| **E11** | **RB-G9 not filed** — authorization treated as incomplete until session RB-G9 record exists |
| **E12** | **Session ID reuse attempted** — forbidden |

**After expiration or invalidation:**

| Rule | Requirement |
|------|-------------|
| **RB-G9 session record** | **Required** for any armed session — including `NO_TRADE_EXECUTED` · `ABORTED_BEFORE_BROADCAST` · `ESTOP_TRIGGERED` |
| **Second session** | **Forbidden** without filed RB-G9 **and** new signed R15 authorization |
| **Reauthorization** | New `AUTHORIZATION — R15 … — YYYY-MM-DD.md` referencing prior RB-G9 path |
| **Disarm** | Reverse arming transition · consume/remove runtime stub · 0 capital exposure |

---

## 6. Halt conditions (session scope)

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
- Safety or validator failure
- Jupiter adapter regression detected
- Emotional override pressure

---

## 7. Linked evidence receipts

| Prerequisite | Path |
|--------------|------|
| **Fresh session planning** | [`../FRESH R15 SESSION PLANNING — 2026-07-07.md`](../FRESH%20R15%20SESSION%20PLANNING%20%E2%80%94%202026-07-07.md) |
| **Post-validator verification** | [`../POST-VALIDATOR REMEDIATION VERIFICATION REVIEW — 2026-07-07.md`](../POST-VALIDATOR%20REMEDIATION%20VERIFICATION%20REVIEW%20%E2%80%94%202026-07-07.md) |
| **Validator drift remediation** | [`../VALIDATE LIVE SYSTEM STATIC VALIDATOR DRIFT REMEDIATION IMPLEMENTATION — 2026-07-07.md`](../VALIDATE%20LIVE%20SYSTEM%20STATIC%20VALIDATOR%20DRIFT%20REMEDIATION%20IMPLEMENTATION%20%E2%80%94%202026-07-07.md) |
| **Jupiter remediation (U1/U2 closed)** | [`../JUPITER EXECUTION PATH REMEDIATION IMPLEMENTATION — 2026-07-07.md`](../JUPITER%20EXECUTION%20PATH%20REMEDIATION%20IMPLEMENTATION%20%E2%80%94%202026-07-07.md) |
| **Jupiter no-broadcast verification** | [`../JUPITER EXECUTION PATH NO-BROADCAST VERIFICATION REVIEW — 2026-07-07.md`](../JUPITER%20EXECUTION%20PATH%20NO-BROADCAST%20VERIFICATION%20REVIEW%20%E2%80%94%202026-07-07.md) |
| **Prior EV01 RB-G9 (lessons — do not reuse)** | [`../Sessions/SESSION — RB-G9-20260706-EV01 — 2026-07-07/RB-G9 — REVIEW.md`](../Sessions/SESSION%20%E2%80%94%20RB-G9-20260706-EV01%20%E2%80%94%202026-07-07/RB-G9%20%E2%80%94%20REVIEW.md) |
| **Prior EV01 R15 (consumed)** | [`AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — 2026-07-06.md`](AUTHORIZATION%20%E2%80%94%20R15%20ENGINEERING-VALIDATION%20ONE_SESSION_ONLY%20%E2%80%94%202026-07-06.md) |
| **R13 signed waiver** | [`../R13 SIGN-OFF GATE — 2026-07-06.md`](../R13%20SIGN-OFF%20GATE%20%E2%80%94%202026-07-06.md) §4 |
| **Safety suite 85/85** | [`../../../ACTIVE_MANIFEST.md`](../../../ACTIVE_MANIFEST.md) · post-validator review |
| **Signer placement** | [`../SIGNER SECRET PLACEMENT EXECUTION — 2026-07-06.md`](../SIGNER%20SECRET%20PLACEMENT%20EXECUTION%20%E2%80%94%202026-07-06.md) |
| **RPC no-broadcast (historical)** | [`../REAL RPC NO-BROADCAST READINESS CHECK — 2026-07-06.md`](../REAL%20RPC%20NO-BROADCAST%20READINESS%20CHECK%20%E2%80%94%202026-07-06.md) |
| **R15 secure storage** | [`../R15 SECURE STORAGE DECISION — 2026-07-06.md`](../R15%20SECURE%20STORAGE%20DECISION%20%E2%80%94%202026-07-06.md) |
| **RB-G9 storage** | [`../RB-G9 STRUCTURED STORAGE DECISION — 2026-07-06.md`](../RB-G9%20STRUCTURED%20STORAGE%20DECISION%20%E2%80%94%202026-07-06.md) · [`../Sessions/README.md`](../Sessions/README.md) |

---

## 8. Future gate separation (unchanged by this draft)

| Gate | Relationship |
|------|--------------|
| **Fresh R15 Session Authorization Sign-Off** | Signs this record — **not performed in draft gate** |
| **Pre-Arming Blocker Refresh** | Re-run 85/85 · validator · posture · RPC · signer check |
| **Arming Authorization** | Separate — fresh or refreshed record linked to EV02 |
| **Arming transition** | Separate — C1–C3 under human supervision |
| **Runtime R15 Approval Stub Creation** | Separate — signed stub creation gate |
| **Micro-Live Execution Authorization** | Separate — 4-hour window; not created here |
| **Candidate preparation** | Separate — manual CS1–CS11 constraints |
| **Final per-trade confirmation** | Separate — immediately before any BUY |
| **Micro-Live Execution** | Separate — actual capped trade |
| **RB-G9 Post-Session Review** | Required after any armed session at `Sessions/SESSION — RB-G9-20260707-EV02 — {SESSION_DATE}/` |

---

## 9. Draft attestation block (for future sign-off gate only)

> **Do not sign below in this draft gate.**

I, Taylor Cheaney, acknowledge and attest:

1. I have read this R15 ONE_SESSION_ONLY engineering-validation session authorization record for session **`RB-G9-20260707-EV02`**.
2. Strategy readiness is **NOT READY**; LR-02/R7b and LR-03 are **not met**; I make **no** profitability or strategy-edge claim.
3. This authorization is **engineering validation only** — max **1 BUY + 1 mandatory SELL** · **0.005 SOL** · **0.01 SOL not authorized** · caps and halts as listed.
4. This R15 sign-off **does not** authorize arming, runtime-stub creation, micro-live execution authorization, candidate selection, final per-trade confirmation, broadcast, or capital exposure.
5. **Real broadcast remains unproven**; production-root reconciliation/e-stop proofs remain **deferred**.
6. **OR-20260630-008 remains not_promoted**.
7. Prior session **`RB-G9-20260706-EV01`** is **closed** — I will **not** reuse it.
8. I will file RB-G9 session evidence after any armed session and will not start a second session without new authorization.
9. This authorization expires per §5, including **2026-07-14** if unused within 7 days of signature.

**Signed:** _________________________ · **Date:** _________________

---

## 10. Explicit non-actions (draft gate)

| Item | Status |
|------|--------|
| R15 signed | **No** |
| Runtime stub created | **No** |
| EV02 session folder created | **No** |
| Arming / LIVE / capital | **No** |
| Code / tests / validator / config / `.env` changed | **No** |
| OR promotion | **No** |
| Live / soak / strategy / profitability claims | **No** |

---

**Canonical path (draft):**
`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/DRAFT — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — RB-G9-20260707-EV02 — 2026-07-07.md`
