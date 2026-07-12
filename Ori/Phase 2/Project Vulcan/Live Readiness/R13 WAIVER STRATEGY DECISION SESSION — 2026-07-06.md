# R13 Waiver / Strategy Decision Session — 2026-07-06

Status:
**Decision session complete — governance framing recorded; no R13 sign-off, no waiver signed, no arming, no execution**

Gate type:
Architecture/governance review — strategy vs engineering validation tracks; waiver path framing only

Prerequisites:
`MICRO-LIVE RUNBOOK DRY REHEARSAL — 2026-07-06.md` · `PRE-ARMING BLOCKER STATUS REVIEW — POST-N6 — 2026-07-06.md` · `R7B STRATEGY EVIDENCE ASSESSMENT — 2026-07-05.md` · `R16 IMPLEMENTATION VERIFICATION REVIEW — 2026-07-06.md` · `N6 E-STOP DRILL EXECUTION — 2026-07-06.md` · `SIGNER RECONCILIATION FIXTURE DRILL EXECUTION — 2026-07-06.md` · `A1 CRITICAL DRILL BATCH EXECUTION — 2026-07-05.md`

Decision authority:
**Taylor Cheaney** (governance judgment recorded; **no signature applied in this gate**)

Live readiness achieved:
**No**

Human soak readiness:
**Not authorized**

OR-20260630-008:
**not_promoted** (unchanged)

**Code changed:** **No** · **Config changed:** **No** · **Runtime processes started:** **No** · **Real RPC used:** **No** · **Real signer secrets used:** **No** · **R13 sign-off performed:** **No** · **Arming authorized:** **No** · **Micro-live execution authorized:** **No**

---

## 1. Files Inspected (read-only)

| File | Purpose |
|------|---------|
| `MICRO-LIVE RUNBOOK DRY REHEARSAL — 2026-07-06.md` | RB-G10 tabletop PASS; R8/R9 BLOCKED; gate separation verified |
| `PRE-ARMING BLOCKER STATUS REVIEW — POST-N6 — 2026-07-06.md` | N8 governance ceiling; N4/N5/N6/N7 partial |
| `R7B STRATEGY EVIDENCE ASSESSMENT — 2026-07-05.md` | LR-02 NOT MET; LR-03 NOT ENOUGH DATA; machine flags |
| `R16 IMPLEMENTATION VERIFICATION REVIEW — 2026-07-06.md` | N9 mocked closure; not arming-ready |
| `N6 E-STOP DRILL EXECUTION — 2026-07-06.md` | E0–E10 fixture PASS |
| `SIGNER RECONCILIATION FIXTURE DRILL EXECUTION — 2026-07-06.md` | S1–S8/R1–R6 14/14 PASS |
| `A1 CRITICAL DRILL BATCH EXECUTION — 2026-07-05.md` | D01/D02/D07 PASS; D03/D04/D05 open |
| `MICRO-LIVE RUNBOOK CONSOLIDATION — 2026-07-05.md` | R14 decided values; §4 approval template |
| `ACTIVE_MANIFEST.md` | Posture boundaries; OR not_promoted |

---

## 2. Decision Questions — Answers

| # | Question | Answer (this session) |
|---|----------|----------------------|
| **1** | Should Taylor continue collecting R7b evidence before any live path? | **Yes — for strategy readiness and any strategy-profit claim.** Passive collection during authorized dry-run may continue; no dedicated observation window required now (per R7b assessment). |
| **2** | Is a tiny micro-live **engineering validation** waiver defensible? | **Conditionally yes — not authorized today.** Defensible only as a bounded **engineering path test** with explicit no-edge/no-profit framing, after prerequisite technical gates close. |
| **3** | If defensible, what boundaries before R13 can be signed? | See §8 — **Option C preconditions must complete first**; then a future **R13 Sign-Off Session** may apply Option B boundaries. |
| **4** | If not defensible, what evidence must be collected first? | For **strategy live path:** full R7b thresholds (30 closes, 7 days, exit mix, thesis matches, PF ≥ 1.20). For **engineering validation path:** not R7b completion — see §8 preconditions instead. |

---

## 3. Two-Track Separation

### 3.1 Strategy readiness track

| Dimension | Assessment |
|-----------|------------|
| **LR-02 R7b thresholds** | **NOT MET** — 1/30 closes; 5/7 days; 0/10 thesis matches; exit mix incomplete |
| **LR-03 R7 edge** | **NOT PROVEN** — fresh window NOT ENOUGH DATA |
| **12h B2A contribution** | **Process/control only** — zero strategy samples (quiet market) |
| **Historical all-time paper** | Directionally useful (PF 1.47) — **not R7b-admissible** |
| **Strategy readiness verdict** | **NOT READY** — any live session would **not** be a strategy-profit test |

**What weak R7b blocks:**

- Strategy edge claims
- Live readiness claims
- Human soak authorization framed as strategy validation
- Scaling trade size or session allocation
- Treating micro-live results as R7b completion
- OR-20260630-008 promotion linkage to live readiness

**What weak R7b does NOT block:**

- Continued pre-arming **technical** gates (fixture drills, runbook work, doc updates)
- Future **engineering validation** waiver **discussion** (not execution) if bounded
- Passive R7b sample accumulation during normal dry-run

### 3.2 Engineering validation readiness track

| Dimension | Assessment |
|-----------|------------|
| **R14 policy/config/enforcement** | **Closed** for micro-live pre-arming planning |
| **R16 submit→confirm→position-write** | **IMPLEMENTED (mocked/fixture scope)** — T1–T13 PASS |
| **N5 signer/reconciliation** | **Fixture proven** — 14/14; real path deferred |
| **N6 e-stop interlock** | **Fixture proven** — E0–E10; production-root deferred |
| **N7 runbook** | **Tabletop rehearsed** — followable; stale text documented |
| **A1 durability** | **Partial** — D03/D04/D05 open |
| **Safety suite** | **79/79 PASS** |
| **Production posture** | `PIPELINE_DRY_RUN` · `dryRunMode: true` · `liveArmed: false` · no capital |
| **Engineering validation readiness verdict** | **NOT READY for R13 sign-off today** — **approaching** conditional waiver defensibility after §8 preconditions |

**Engineering validation framing (if ever authorized):**

Any authorized micro-live would be an **engineering validation test** — verifying submit/confirm/position-write, signer path, e-stop, reconciliation, and operator runbook under real RPC with **negligible capital at risk**, **not** proving strategy edge or profitability.

---

## 4. R7b Weak Evidence — Scope of Block

| Claim / action | Blocked by weak R7b? |
|----------------|---------------------|
| Strategy-profit / edge proven | **Yes — fully blocked** |
| Live readiness achieved | **Yes — fully blocked** |
| R8 risk review on strategy merits | **Yes — blocked** |
| Pre-arming technical drills & doc gates | **No — not blocked** |
| Bounded engineering validation waiver **discussion** | **No — not blocked** (sign-off still separate) |
| Passive paper collection during dry-run | **No — encouraged in parallel** |

---

## 5. Engineering Validation Waiver Defensibility (Architecture Judgment)

At the stated caps and controls, a **conditional engineering-validation waiver** is **architecturally defensible in principle** but **not authorized in this gate**:

| Control | Present? |
|---------|----------|
| 0.005 SOL default trade size | **Yes** (`positionSizeSol`) |
| 0.01 SOL absolute cap | **Yes** (`maxMicroLiveTradeSizeSol`) |
| 0.03 SOL session/daily stop | **Yes** |
| R14 E1–E9 enforced | **Yes** |
| R16 mocked path verified | **Yes** |
| N5/N6 fixture proven | **Yes** |
| Runbook tabletop rehearsed | **Yes** |
| Real signer/RPC proof | **No** — still required before arming |
| A1-D03/D04 production drills | **No** — open |
| Signed R13/R15 record | **No** |
| G3 manual slippage override disabled or ack surface | **No** — override path must stay closed |

**Judgment:** Caps and enforcement make **maximum plausible loss per session ~0.03 SOL** with **single-position discipline** — acceptable for a **one-to-two trade engineering smoke test** *if* prerequisites close and Taylor explicitly signs a research-exception record. This does **not** justify strategy live deployment or scaling.

---

## 6. Waiver Options Considered

### Option A — No waiver

Continue R7b evidence collection until all thresholds met before **any** R13 sign-off discussion.

| Pros | Cons |
|------|------|
| Cleanest strategy governance | Delays engineering validation indefinitely despite strong fixture progress |
| No research-exception record needed | R7b quiet-market conditions may prolong wait without invalidating filters |

### Option B — Conditional engineering-validation waiver (immediate)

Permit R13 sign-off discussion now for 1–2 engineering validation trades with no strategy-profit claim.

| Pros | Cons |
|------|------|
| Fastest path to real-path proof | Premature — A1-D03/D04 open, runbook stale, real signer path unreviewed |
| Uses existing caps | Risks conflating waiver sign-off with arming readiness |

### Option C — Hybrid (recommended)

**Finish remaining technical preconditions first**, then hold a dedicated **R13 Sign-Off Session** where Taylor may sign an engineering-validation waiver record (Option B boundaries) — **still separate from arming and execution gates**.

| Pros | Cons |
|------|------|
| Preserves governance separation | Defers real-path work until more drills close |
| Allows parallel passive R7b collection | Requires discipline not to skip preconditions |
| Matches current blocker board sequencing | Two human gates still required (sign-off, then arming) |

---

## 7. Recommended Option

**Option C — Hybrid**

**Why:**

1. **R7b weak evidence correctly blocks strategy claims** — Option A's full threshold requirement should remain the path for **strategy live readiness**, not for all technical progress.
2. **Engineering validation at 0.005 SOL is defensible in principle** — fixture evidence (R16, N5, N6) and R14 enforcement provide fail-closed controls; caps bound worst-case loss.
3. **Prerequisites are not yet closed** — A1-D03/D04, real signer path review, runbook stale cleanup, and G3 override closure must complete **before** R13 sign-off — signing now (Option B) would blur governance.
4. **This session records framing only** — no waiver signed; next work is technical precondition gates, then **R13 Sign-Off Session**.

---

## 8. Boundaries — If Option B Applied at Future R13 Sign-Off Session

*These boundaries apply only after §9 preconditions close and only in a future **R13 Sign-Off Session** — not authorized today.*

### 8.1 Session scope

| Boundary | Value |
|----------|-------|
| **Purpose** | Engineering validation only — **no strategy edge or profitability claim** |
| **Max trades (first authorized record)** | **1** trade; **max 2 total** engineering validation trades before new signed R13/R15 record required |
| **Max open positions** | **1** |
| **Default trade size** | **0.005 SOL** |
| **Absolute trade cap** | **0.01 SOL** — requires explicit per-session ack in signed record |
| **Max session allocation** | **0.05 SOL** (or lower if Taylor sets in record) |
| **Session loss stop** | **0.03 SOL** — halt immediately |
| **Daily loss stop** | **0.03 SOL** |
| **Consecutive-loss stop** | **2** — then halt |
| **Scaling** | **Forbidden** — no size increase, no compounding, no second session without new sign-off |
| **MEV posture** | **`public_micro_live_only`** — G4 protected route deferred |
| **Manual slippage override (G3)** | **Disabled** — default 100 bps only until ack surface exists |
| **Operator** | Present for entire session; unattended execution forbidden |
| **Tokens/conditions** | Phase 1 thesis filters only (`gmgn_trending`, score 80–89, MC 100k–250k, liquidity floor $25k); **no discretionary override** |

### 8.2 Mandatory stop conditions

All §6 runbook stop conditions apply, plus:

- Any reconciliation ambiguity → halt, follow `RECONCILIATION_RUNBOOK.md`
- `emergencyStop` → halt, `reset_live_safety.js` before any restart discussion
- Safety suite failure → halt
- Dashboard/CLI posture mismatch → halt
- Realized slippage > 200 bps → halt
- Any `recovery_actions.jsonl` appearance → halt

### 8.3 Required evidence **before arming** (separate gate after R13 sign-off)

| Evidence | Required |
|----------|----------|
| Signed R15 `ONE_SESSION_ONLY` record on secure operator path | **Yes** |
| `liveArmed` still **false** until arming gate | **Yes** |
| Live Submission Path Readiness Review complete | **Yes** |
| Production-root CLI/dashboard posture parity | **Yes** |
| A1-D04 production-root reconciliation drill **or** signed residual-risk acceptance for D03/D04 | **Yes** |
| Runbook stale-value cleanup + gate-separation labels | **Yes** |
| Fixture vs production-root evidence ack in operator record | **Yes** |
| G3 override path closed | **Yes** |
| Safety suite **79/79** green immediately before arming | **Yes** |

### 8.4 Required evidence **after execution** (each trade)

| Artifact | Required |
|----------|----------|
| Post-trade review (RB-G9 template minimum — manual acceptable initially) | **Yes** |
| Audit/reconciliation rows secret-free | **Yes** |
| Ori Posture Log entry | **Yes** |
| Session halt if any ambiguity | **Yes** |
| **No profitability or edge conclusion** in session record | **Yes** |

### 8.5 Prohibitions (non-waivable in engineering validation frame)

- No live readiness claim
- No human soak readiness claim
- No strategy edge proven claim
- No OR-20260630-008 promotion
- No trade size or session scaling
- No `liveArmed true` without separate arming gate
- No `executionMode LIVE` / `dryRunMode false` without separate execution gate
- No capital exposure beyond signed session allocation

---

## 9. Preconditions Before Even **Considering** R13 Sign-Off

| Precondition | Status | Blocks R13 sign-off discussion? |
|--------------|--------|--------------------------------|
| A1-D03 crash drill **or** signed residual-risk acceptance | **Open** | **Yes** |
| A1-D04 production-root reconciliation drill **or** signed residual-risk acceptance | **Open** | **Yes** |
| A1-D05 audit durability | **Open** | Recommended; waivable with explicit ack |
| Production-root vs fixture evidence acknowledgement (operator record field) | **Not documented** | **Yes** |
| Runbook stale-value cleanup (79/79, N6/N5/R16 status, §7 table) | **Open** | **Yes** |
| RB-G9 post-trade artifact (template minimum) | **Open** | **Yes** (manual template acceptable at sign-off) |
| Signed R15 record secure storage location documented | **Open** | **Yes** |
| G3 manual slippage override disabled unless ack surface exists | **Open** | **Yes** |
| `liveArmed` false invariant held | **Held** | **Yes** (invariant) |
| Live Submission Path Readiness Review | **Not done** | **Yes** (before arming; recommended before sign-off) |
| R7b thresholds met | **NOT MET** | **Waivable for engineering validation only** — not for strategy path |

---

## 10. Absolute vs Waivable Blockers Before R13

### 10.1 Absolute (cannot be waived at R13 sign-off)

| Blocker | Reason |
|---------|--------|
| Taylor **physical/signatory** R13/R15 record in dedicated sign-off gate | Governance non-delegable |
| Explicit **engineering validation** purpose statement — no profit claim | Prevents scope creep |
| **`liveArmed false`** until separate arming gate | N10 invariant |
| **Separate arming gate authorization** before `liveArmed true` | Gate separation |
| **Separate micro-live execution gate** before LIVE posture | Gate separation |
| **Real signer path review** before any real submit | N5 — wrong signer risk |
| **G3 override closed** or ack surface live | Unauthorized slippage |
| **No live readiness / human soak claim** | Posture boundary |
| **OR-20260630-008 not_promoted** unless separate Taylor decision | OR independence |

### 10.2 Waivable **only for engineering-validation frame** (explicit waiver language in signed record)

| Blocker | Waiver condition |
|---------|------------------|
| **LR-02 R7b sample thresholds** | Waiver text: *"Research exception — engineering validation only; R7b NOT MET; no strategy edge claim"* |
| **LR-03 R7 edge NOT ENOUGH DATA** | Same research-exception framing |
| **A1-D05** audit durability drill | Waivable with explicit residual-risk acceptance if D03/D04 addressed |
| **Production-root N6** e-stop drill | Waivable only if Live Submission Path Readiness + arming preflight include e-stop CLI check; fixture evidence cited |
| **RB-G9 structured storage** | Waivable initially if manual post-trade template used and recorded |

### 10.3 Not waivable for strategy live path (ever without R7b completion)

All R7b thresholds, exit mix, thesis matches, fresh PF ≥ 1.20 — required before any session framed as strategy deployment or scaling.

---

## 11. Gates That Must Remain Separate

| Gate | Relationship |
|------|--------------|
| **This session (R13 Waiver / Strategy Decision)** | Framing only — **no sign-off** |
| **R13 Sign-Off Session** (future) | Taylor signs R15/R13 record with waiver language if Option B applied |
| **Arming gate** (future) | Sets `liveArmed true` preconditions only — after sign-off + readiness review |
| **Micro-live execution gate** (future) | LIVE posture / real submit authorization — after arming |
| **OR promotion** | Independent — never collapsed with R13 or execution |
| **Live readiness claim** | Independent human attestation — not implied by any prior gate |

**No gate may collapse:** waiver decision → sign-off → arming → execution → readiness claim.

---

## 12. Blocker Status After This Session

| Blocker | Status |
|---------|--------|
| **N8 R13 / R7b** | **Open** — waiver **path framed** (Option C); **not signed** |
| **LR-02** | **NOT MET** — blocks strategy path; **waivable** for engineering validation at future sign-off |
| **LR-03** | **NOT ENOUGH DATA** — same |
| **N4 A1** | **Partial** — precondition before sign-off |
| **N5 / N6 / N9** | **Partial** — fixture proven; real/production path before arming |
| **N7 / RB-G10** | **Partial** — tabletop complete; doc cleanup open |
| **G3** | **Open** — precondition |
| **OR-20260630-008** | **not_promoted** |
| **Arming / execution / live readiness** | **Not authorized** |

---

## 13. Explicit Non-Actions (Confirmed)

| Non-action | Confirmed |
|------------|-----------|
| R13 sign-off / signed approval record | **No** |
| Research-exception waiver signed | **No** |
| Arming / `liveArmed true` | **No** |
| Micro-live execution / LIVE mode | **No** |
| Capital exposure | **No** |
| Code/config/.env changes | **No** |
| Runtime / real RPC / real signer | **No** |
| OR promotion | **No** |
| Live/soak readiness claim | **No** |

---

## 14. Safety Confirmation

| Item | Value |
|------|-------|
| `.env` opened | **No** |
| Secrets inspected | **No** |
| `process.env` dumped | **No** |
| `executionMode` LIVE set | **No** |
| `dryRunMode` false set | **No** |
| `liveArmed` true set | **No** |
| `FOMO_ALLOW_LOOP_LIVE=YES` set | **No** |
| Runtime processes started | **No** |
| Real RPC used | **No** |
| Real signer secrets used | **No** |
| OR-20260630-008 status | **not_promoted** |
| Promotion authorized | **No** |
| Live readiness claimed | **No** |
| Human soak readiness claimed | **No** |
| Capital exposure enabled | **No** |

---

## 15. Recommended Next Gate

**Runbook Documentation Update Gate**

(Close stale runbook text and add explicit arming/execution/blocker-board pre-session steps identified in dry rehearsal — doc-only; no runtime, no sign-off.)

---

**Decision session authority:** R13 Waiver / Strategy Decision Session (2026-07-06) · Taylor Cheaney governance framing recorded; **no signature applied**
