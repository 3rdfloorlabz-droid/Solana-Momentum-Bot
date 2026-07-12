# Micro-Live Runbook Consolidation — 2026-07-05

Status:
**Consolidated operator runbook — updated 2026-07-06 (Runbook Documentation Update Gate); tabletop rehearsed; still NOT executable for live micro-live today**

Gate type:
Doc-only consolidation of RB-G14 (fragmented runbook → single Ori doc), with R14-decided values and current blocker/gate-separation status

**Last documentation update:** `RUNBOOK DOCUMENTATION UPDATE — 2026-07-06.md` · prior tabletop: `MICRO-LIVE RUNBOOK DRY REHEARSAL — 2026-07-06.md`

Prerequisites:
`docs/R15_MANUAL_APPROVAL_RECORD_AND_SESSION_RUNBOOK.md` (2026-06-28 template) · `MICRO-LIVE RUNBOOK GAP REVIEW — 2026-07-05.md` · `R14 PRE-ARMING FIX IMPLEMENTATION — 2026-07-05.md` · `R13 WAIVER STRATEGY DECISION SESSION — 2026-07-06.md`

Decision authority:
**Taylor Cheaney** signs the record this runbook produces (§4) in a **separate R13 Sign-Off Session** — not in runbook maintenance gates

Live readiness achieved:
**No**

Human soak readiness:
**Not authorized**

OR-20260630-008:
**not_promoted** (unchanged)

**Code changed:** **No** · **Config changed:** **No** · **Runtime processes started:** **No**

---

## 1. What Changed From the June R15 Template

The original `R15_MANUAL_APPROVAL_RECORD_AND_SESSION_RUNBOOK.md` (2026-06-28) used **draft/proposed** values because R14 had not been decided. R14 now has Taylor-signed decisions and a shipped enforcement layer (E1–E9). This doc is the **canonical Ori operator runbook**; it replaces stale R14 placeholders and tracks current pre-arming evidence.

| Field | June draft value | **Current value (2026-07-06)** | Source |
|---|---|---|---|
| Slippage cap (default) | Undecided | **100 bps (1.0%)** — manual override **disabled** until ack surface exists (G3/RB-G5) | R14 + R13 Waiver Session |
| Price impact hard reject | Not in R15 | **2.0%** | `maxRoutePriceImpactPct: 2` |
| Quote max age | Not in R15 | **10,000 ms (10 s)** | `maxQuoteAgeMs` |
| Liquidity floor | Not in R15 | **$25,000 USD**, submit-time fresh check | Taylor sign-off + E9 |
| Session loss cap | Proposed | **0.03 SOL** (`maxSessionLossSol`), distinct from daily stop (G1) | R14 Pre-Arming Fix |
| Daily loss cap | Proposed | **0.03 SOL** (`maxDailyLossSol`) | R14 harmonized |
| Max daily loss count | Not specified | **2** consecutive losses (G2) | R14 Pre-Arming Fix |
| Max retries | Not specified | **2**, mandatory re-quote, no blind rebroadcast | R14 + `maxSubmitRetries: 2` |
| Default trade size | Proposed | **0.005 SOL** | `positionSizeSol` |
| Absolute micro-live cap | Proposed | **0.01 SOL**, explicit per-session ack in signed record | `maxMicroLiveTradeSizeSol` |
| SELL-side liquidity | Not addressed | **Enforced** — SELL passes `poolLiquidityUsd` same as BUY (G5) | R14 Pre-Arming Fix |
| MEV posture | Not specified | **`public_micro_live_only`** | `mevRouteMode` |
| Enforcement status | Policy only | **E1–E9 implemented**; safety suite **79/79 PASS** | R14 + N6 drill manifest |
| Session purpose (if ever authorized) | Strategy implied | **Engineering validation only** — no strategy-profit claim (LR-02 NOT MET) | R13 Waiver Session Option C |

---

## 2. Runbook Component Coverage (RB-G1–G14 — Current)

| Gap ID | Component | **Status (2026-07-06)** |
|---|---|---|
| RB-G1 | Signed manual approval record | **Open** — §4 template; unsigned; secure storage path in §4.1 |
| RB-G2 | R7b / strategy gate | **Open** — LR-02 NOT MET (1/30); engineering-validation waiver **framed** not signed |
| RB-G3 | R14 caps in runbook steps | **Closed** — §3/§5 |
| RB-G4 | Micro-live config section | **Partial** — values documented here; no dedicated config sub-block |
| RB-G5 | Per-trade approval wired to executor | **Open** — G3 override path must stay **disabled** until ack surface exists |
| RB-G6 | Signer path connected | **Partial** — fixture S1–S8 **14/14 PASS**; real signer/RPC **open** |
| RB-G7 | R14 runtime enforcement in runbook | **Closed** — E1–E9 in `live_executor.js` |
| RB-G8 | Confirm-before-position-write | **Partial** — R16 T1 + mocked scope; production-root drill deferred |
| RB-G9 | Post-trade review artifact | **Open** — §5.3 / §5.5 template placeholder; no structured storage yet |
| RB-G10 | Runbook dry rehearsal | **Partial — tabletop complete** — `MICRO-LIVE RUNBOOK DRY REHEARSAL — 2026-07-06.md` |
| RB-G11 | A1 durability drills | **Partial** — D01/D02/D07 PASS; D03/D04/D05 **open** |
| RB-G12 | E-stop live drill | **Partial — fixture proven** — N6 E0–E10 PASS; production-root deferred |
| RB-G13 | Reconciliation runbook step | **Partial** — fixture R1–R6 PASS; `RECONCILIATION_RUNBOOK.md` referenced |
| RB-G14 | Consolidated single operator doc | **Closed** — this document |

---

## 3. Micro-Live Session Terms (Consolidated, Current)

| Term | Value | Status |
|---|---|---|
| **Session purpose (if authorized)** | **Engineering validation only** — not strategy-profit test | R13 Waiver Session framing |
| Wallet liquidity | 1 SOL operational context; **not** authorized risk | Unchanged |
| Authorized session allocation | **0.05 SOL max** default in signed record (engineering validation) | **Signed-record field** — not config-enforced |
| Default trade size | **0.005 SOL** | **Config-active** (`positionSizeSol`) |
| Absolute max trade size | **0.01 SOL**, requires explicit per-session ack in signed record | **Config-active** (`maxMicroLiveTradeSizeSol`) |
| Max open positions | **1** | **Config-active** (`maxOpenTrades`) |
| Max trades (engineering validation frame) | **1** first session; **max 2 total** before new signed record | **Signed-record / R13 boundary** — not config-enforced |
| Session loss stop | **0.03 SOL** | **Config-active** (`maxSessionLossSol`) |
| Daily loss stop | **0.03 SOL** | **Config-active** (`maxDailyLossSol`) |
| Consecutive-loss stop | **2** | **Config-active** (`maxDailyLossCount`) |
| Default slippage cap | **1.0% (100 bps)** | **Config-active** |
| Manual slippage override (200 bps) | **DISABLED** for live path until R15/dashboard ack surface exists (G3/RB-G5) | Config field present; **do not use** |
| Hard reject slippage | **3.0% (300 bps)** | **Config-active** |
| Price impact hard reject | **2.0%** | **Config-active** |
| Quote max age | **10 seconds** | **Config-active** |
| Liquidity floor | **$25,000 USD**, submit-time fresh check | **Config-active** |
| MEV route mode | **`public_micro_live_only`** | **Config-active** |
| Max retries | **2**, mandatory re-quote | **Config-active** |
| Priority fee cap | **`maxPriorityFeeLamports`** (+ fallback) — see §5.2 note | **Config-active**; notional % is operator cross-check only |
| Scaling / compounding / averaging | **Forbidden** | Config `false` |
| Unattended session | **Forbidden** | Operator must be present |
| OR-20260630-008 | **not_promoted** | Independent of micro-live |

**Policy note:** There is **no weekly loss cap** in current config — only **session + daily** 0.03 SOL stops. Do not use weekly loss language in operator records.

---

## 4. Manual Approval Record Template (R15 §3 — Extended)

Default status: **NOT APPROVED.** Copy to a **secure operator-controlled location** (§4.1). **Never commit** real values to the repo.

### 4.1 Signed record secure storage (placeholder)

| Item | Requirement |
|---|---|
| Location | **Operator secure path** — e.g. encrypted local vault / password manager / offline store (**TBD by Taylor at sign-off**) |
| Repo | **Never** store signed record in git |
| Filename convention | `r15_manual_approval_<ApprovalID>.json` (or equivalent) outside repo |
| Access | Operator + Taylor only |

### 4.2 Record fields

| Field | Value |
|---|---|
| Approval ID | |
| Operator name | |
| Date/time | |
| Session start/end time | |
| **Session purpose** | **Engineering validation only** (required if R7b waiver path) |
| Research wallet public address | |
| Total wallet balance (context) | |
| Authorized session allocation | **0.05 SOL max** (or lower) |
| Max first trade size | **0.005 SOL default**; **0.01 SOL absolute max** with ack |
| Max session loss / max daily loss | **0.03 SOL each** (no weekly cap in policy) |
| Max trades this authorization | **1** first session; **max 2 total** (engineering validation frame) |
| Max open positions | **1** |
| Per-trade approval required | **Yes** (first phase) |
| R7b bypass / research-exception ack | **yes / no** — if yes, must state *no strategy edge claim* |
| R14 caps acknowledged | **yes / no** |
| Fixture vs production-root evidence ack | **yes / no** — operator confirms which evidence tier applies |
| Emergency stop + reset policy acknowledged | **yes / no** |
| No scaling / no profitability claim acknowledged | **yes / no** |
| Operator signature | |
| **Final approval status** | **NOT APPROVED** (default) |

**Signing this record is the R13 Sign-Off Session — not the arming gate and not the execution gate.**

---

## 5. Session Runbook (Pre-Session / Per-Trade / Post-Trade)

### 5.0 Gate separation (mandatory — do not collapse)

| Gate | What it authorizes | What it does **not** authorize |
|---|---|---|
| **R13 Sign-Off Session** | Signed §4 record; optional engineering-validation waiver language | Arming, LIVE mode, execution, live readiness |
| **Arming gate** (separate, future) | Preconditions for `liveArmed true` / live submission gates | Micro-live execution, strategy claims |
| **Micro-live execution gate** (separate, future) | LIVE posture / real submit authorization | Live readiness, OR promotion, scaling |
| **OR promotion** | OR status only | Live trading, R13, arming |
| **Live readiness claim** | Human attestation only | Any prior gate |

**This runbook walkthrough or maintenance does not satisfy any gate above.**

### 5.1 Pre-session (all must pass before any live-path discussion)

| # | Step | Verification |
|---|---|---|
| 1 | Repo clean | `git status` |
| 2 | Safety suite green | `node run_safety_tests.js` — **79/79** as of 2026-07-06 |
| 3 | `recovery_actions.jsonl` absent | file check |
| 4 | CLI posture confirmed | `node live_executor.js --status` → `PIPELINE_DRY_RUN`, `dryRunMode: true` |
| 5 | Dashboard posture matches CLI | `/api/runtime-health` |
| 6 | Singleton lock healthy, one executor loop | `executor_singleton.lock.json` |
| 7 | `emergencyStop` false, `liveArmed` false | config read |
| 8 | **Blocker board review** | Confirm Post-N6 board: N8 open; N4/N5/N6 partial; N9 mocked closed; no arming authorized |
| 9 | R12/R13/R14 + Ori receipts reviewed | manual — include R13 Waiver Session framing |
| 10 | Wallet balance vs **authorized allocation** (not full wallet) | manual |
| 11 | Signer secret handling policy confirmed (no exposure) | manual |
| 12 | R14 caps match `live_config.json` (§3 table) | manual diff |
| 13 | **Fixture vs production-root evidence ack** | Operator confirms evidence tier before any arming discussion |
| 14 | **G3 manual slippage override** | Confirm override path **disabled** / not used unless ack surface exists |
| 15 | Operator present; manual stop + **e-stop reset plan** known (§5.4) | manual |
| 16 | **R13 Sign-Off gate** | §4 record **signed** in secure storage (§4.1) — **separate session** |
| 17 | **Arming gate** | Explicit authorization receipt exists — **`liveArmed` still false until this gate passes** |
| 18 | **Micro-live execution gate** | Explicit authorization receipt exists — **not implied by R13 or arming** |
| 19 | **OR promotion / live readiness** | Confirm **not_promoted** / no readiness claim unless separate Taylor decision |
| 20 | Approval record (§4) completed for **this session** | manual |

### 5.2 Per-trade (first phase: required every trade)

| Field | Record |
|---|---|
| Token / pair | |
| Quote timestamp / age | must be **≤ 10 s** at submit |
| Expected output / minimum output | |
| Slippage (quoted) | must be **≤ 100 bps** — **200 bps override disabled** until G3 ack surface exists |
| Price impact | must be **≤ 2.0%** |
| Liquidity check | must be **≥ $25,000**, freshly checked |
| Priority fee | Record lamports paid; must respect **`maxPriorityFeeLamports`** (see note below) |
| MEV route mode | must be **`public_micro_live_only`** |
| Operator approval timestamp | |
| **Proceed / reject** | |

**Priority fee note:** Config enforces **`maxPriorityFeeLamports`** (total lamport budget per tx) and **`fallbackPriorityFeeLamports`**, not a fixed % of notional. The historical R15 **“≤ 50% of trade notional”** rule is an **operator cross-check** for micro-live sizing (e.g. 0.005 SOL trade ≈ 5M lamports notional context) — if conflict, **config lamport caps and R14 enforcement win**. Dedicated notional-percent enforcement in code: **TBD / not implemented**.

**Reject if:** quote stale, slippage/impact/liquidity fails cap, route unstable, G3 override attempted, or operator not present — mirrors E1–E9 enforcement.

### 5.3 Post-trade

| Field | Record |
|---|---|
| Transaction ID | |
| Confirmation status | |
| Realized slippage | halt threshold **200 bps** |
| Fee paid / priority fee paid | |
| Position write confirmed | **yes only if** confirmed on-chain |
| Reconciliation row present? | if yes, **stop** — follow `RECONCILIATION_RUNBOOK.md` |
| Continue / stop decision | |
| **RB-G9 post-trade artifact** completed | §5.5 template |
| Ori Posture Log updated | ☐ |
| **No profitability / edge conclusion** | required for engineering-validation sessions |

### 5.4 E-stop activation and reset

| Step | Action |
|---|---|
| 1 | On halt trigger: confirm `emergencyStop: true` in config / dashboard |
| 2 | **Stop all new entries and exits** — do not attempt live submit |
| 3 | Preserve audit + `pending_reconciliation.jsonl` — do not delete ambiguity rows |
| 4 | Document incident in post-trade / posture log |
| 5 | Before any restart discussion: run **`node reset_live_safety.js`** (or documented equivalent) **only after** operator review |
| 6 | Re-run §5.1 pre-session from step 2 after reset |

**Fixture evidence:** N6 E0–E10 verified e-stop interlocks in temp harness; **production-root behavior requires separate authorization.**

### 5.5 RB-G9 post-trade artifact (template placeholder)

Store outside repo with approval record (§4.1) or in Ori posture log cross-reference.

| Field | Value |
|---|---|
| Session Approval ID | |
| Trade sequence # | |
| Token / pair / tx sig | |
| Entry or exit | |
| Realized slippage / fees | |
| Position write confirmed | |
| Reconciliation triggered | yes / no |
| Engineering validation notes | **no edge claim** |
| Continue / halt | |
| Operator initials / timestamp | |

Structured storage path: **TBD at R15 artifact gate** — manual completion acceptable until then.

---

## 6. Session Stop Conditions

Stop immediately if any: `emergencyStop` true; realized slippage **> 200 bps**; quote stale **> 10 s**; price impact **> 2%**; liquidity check fails; transaction fails repeatedly; abnormal confirmation; position write mismatch; wallet monitor stale; singleton mismatch; duplicate executor loop; safety suite fails; `recovery_actions.jsonl` appears unexpectedly; **session or daily loss cap (0.03 SOL)** reached; **2 consecutive losses**; operator absent; dashboard/CLI posture mismatch; reconciliation ambiguity; emotional override pressure; attempted G3 manual slippage override without ack surface.

After e-stop: follow **§5.4** before any restart.

---

## 7. Why This Runbook Is Still Not Executable

Documentation update and tabletop rehearsal **do not** authorize live micro-live. Per current blocker board (Post-N6 + R13 Waiver Session):

| Still required | Blocker / status |
|---|---|
| **R13 signed authorization** | N8 / RB-G1 — **unsigned** |
| **R7b thresholds or signed engineering-validation waiver** | N8 / RB-G2 — LR-02 **NOT MET**; waiver **framed not signed** |
| **Real signer + RPC path** | N5 — fixture **14/14**; real path **open** |
| **Production-root reconciliation / crash drills** | N4 — D03/D04/D05 **open** (or signed residual-risk acceptance) |
| **Production-root e-stop proof** | N6 — fixture E0–E10 **PASS**; production-root **deferred** |
| **R16 production LIVE path** | N9 — **mocked scope closed**; production-root **open** |
| **G3 / RB-G5 ack surface** | Override path must stay **disabled** |
| **RB-G9 structured storage** | Template §5.5 only |
| **Arming gate authorization** | **`liveArmed` false** — separate gate |
| **Micro-live execution gate authorization** | **Not authorized** |
| **OR-20260630-008** | **not_promoted** |
| **Live / human soak readiness claims** | **Not authorized** |

This document is the **reference copy** operators follow once gates close — it is **not** a green light.

---

## 8. Explicit Non-Actions

| Non-action | Confirmed |
|---|---|
| Sign the approval record (in doc maintenance gates) | **No** |
| Authorize arming / execution | **No** |
| Modify `live_config.json` / `.env` | **No** |
| Start runtime / loops | **No** |
| Capital exposure | **No** |
| Claim live / soak readiness | **No** |
| OR promotion | **No** |

---

## 9. Recommended Next Gate

**A1-D04 Reconciliation Drill Authorization**

(Technical precondition per R13 Waiver Session Option C — before R13 Sign-Off Session.)

---

## 10. Safety Confirmation (consolidation baseline)

| Item | Value |
|---|---|
| `.env` opened | **No** |
| Secrets inspected | **No** |
| Code changed | **No** |
| Config changed | **No** |
| Runtime processes started | **No** |
| OR-20260630-008 status | **not_promoted** |
| Live readiness claimed | **No** |
| Capital exposure enabled | **No** |

---

*Prepared for Taylor review — 2026-07-05 (consolidation) · updated 2026-07-06 (Runbook Documentation Update Gate)*
