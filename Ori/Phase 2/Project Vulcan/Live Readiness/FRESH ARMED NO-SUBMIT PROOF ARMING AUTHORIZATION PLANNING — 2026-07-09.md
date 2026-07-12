# Fresh Armed No-Submit Proof Arming Authorization Planning — 2026-07-09

Status:
**PLANNING COMPLETE — PRODUCTION DISARMED UNCHANGED — NO G2 SIGNED — NO ARMING**

Gate type:
Session-bound G2 arming authorization design — planning and documentation only

Prerequisites:
`AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260709-AP01 — 2026-07-09.md` · `FRESH ARMED NO-SUBMIT PROOF SESSION R15 AUTHORIZATION — 2026-07-09.md` · `Decisions/DECISION — Armed No-Submit Production Proof — 2026-07-09.md` · `ARMED-CONTEXT ARMED NO-SUBMIT PROOF PLANNING — 2026-07-09.md` · `Decisions/DECISION — Armed-Context Preflight Architecture — 2026-07-08.md`

Planning date:
**2026-07-09** *(local; UTC planning capture 2026-07-10)*

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**G2 created/signed:** **No** · **G3/G4 created:** **No** · **Runtime stub created:** **No** · **Proof session created:** **No** · **Arming performed:** **No** · **Config changed:** **No** · **`.env` changed:** **No** · **Submit/broadcast:** **No**

---

## 1. Prominent post-gate state

> **DISARMED · DRY · NO TRADE**
>
> **G2 ARMING AUTHORIZATION DESIGN DOCUMENTED**
>
> **NO G2 SIGNATURE · NO C1–C3 · NO LIVE_ARMED · NO STUB · NO PROOF**

---

## 2. Files inspected (read-only)

| File | Purpose |
|------|---------|
| `Authorizations/AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260709-AP01 — 2026-07-09.md` | Signed G1 — session scope · schema v2 |
| `FRESH ARMED NO-SUBMIT PROOF SESSION R15 AUTHORIZATION — 2026-07-09.md` | G1 gate receipt |
| `Decisions/DECISION — Armed No-Submit Production Proof — 2026-07-09.md` | Proof policy · C1–C3 · 15m cap |
| `ARMED-CONTEXT ARMED NO-SUBMIT PROOF PLANNING — 2026-07-09.md` | G1–G4 chain · process stop · preconditions |
| `Decisions/DECISION — Armed-Context Preflight Architecture — 2026-07-08.md` | Three-domain model |
| `Authorizations/AUTHORIZATION — Arming — RB-G9-20260707-EV02 — 2026-07-07.md` | EV02 arming auth structure (consumed) |
| `ARMING TRANSITION EXECUTION GATE — 2026-07-07.md` | EV02 transition receipt (structure only) |
| `live_config.json` | Current disarmed production config |
| `live_executor.js` | `computeLiveArmedStatus` · `deriveOperationalPosture` |
| `analysis/armed_no_submit_final_domain_a_dry_proof_receipt.json` | Historical dry proof fingerprints |
| `Authorizations/README.md` | Authorization index |
| `R15 SECURE STORAGE DECISION — 2026-07-06.md` | Authorizations/ vs stub |

---

## 3. G1 validation result

Planning capture UTC: **`2026-07-10T03:44:28Z`**

| Check | Result |
|-------|--------|
| G1 exists | **PASS** |
| G1 signed | **PASS** — Taylor Cheaney · `2026-07-10T03:25:11Z` |
| G1 unused | **PASS** — status **SIGNED/UNUSED** |
| G1 unexpired | **PASS** — expires **`2026-07-11T03:25:11Z`** |
| Session ID exact | **PASS** — **`RB-G9-20260709-AP01`** |
| **`schemaVersion`** | **PASS** — **`2`** |
| **`approvalPurpose`** | **PASS** — **`armed_no_submit_proof_only`** |
| **`finalApprovalStatus`** | **PASS** — **`APPROVED FOR ONE ARMED NO-SUBMIT PROOF SESSION ONLY`** *(exact)* |
| Signer / public address | **PASS** — Taylor Cheaney · `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` matches `live_config.json` |
| Prohibited fields absent | **PASS** — no candidate · quote · trade · capital · secrets |
| Drift or ambiguity | **None detected** |

**G1 validation result:** **PASS**

---

## 4. G2 canonical path

```
Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — Arming — RB-G9-20260709-AP01 — 2026-07-09.md
```

**Not created or signed in this gate.**

---

## 5. G2 purpose and scope

| Field | Value |
|-------|-------|
| **Purpose** | Authorize **one future temporary posture transition** (C1–C3 only) supporting the armed no-submit proof |
| **Session binding** | **`RB-G9-20260709-AP01`** exclusively — linked to signed G1 |
| **Maximum armed duration** | **15 minutes** from confirmed `LIVE_ARMED` |
| **Transitions authorized** | **One only** — non-reusable |
| **Disarm obligation** | Immediate after PASS · FAIL · abort · ambiguity · or timeout |

G2 authorizes **posture transition only**. It **does not** authorize proof execution · runtime-stub creation · candidate selection · submission · broadcast · or capital exposure.

---

## 6. Authorized C1–C3 changes only

Future **Arming Transition Execution Gate** may apply **only** these changes, in order:

| Step | Target | Field | Authorized change |
|------|--------|-------|-------------------|
| **C1** | gitignored `.env` | `FOMO_ENABLE_LIVE_SUBMISSION` | unset → **`YES`** |
| **C2** | `live_config.json` | `executionMode` | **`PIPELINE_DRY_RUN`** → **`LIVE`** |
| **C3** | `live_config.json` | `dryRunMode` | **`true`** → **`false`** |

**Verification after C3:** `computeLiveArmedStatus()` returns `liveArmed: true` and `operationalPosture: LIVE_ARMED` when all submission gates satisfied (including signer env present at transition time — boolean only in evidence).

Any other `live_config.json` or `.env` mutation during transition → **abort**.

---

## 7. Explicitly unchanged state

| Item | Requirement |
|------|-------------|
| `FOMO_ALLOW_LOOP_LIVE` | Remains **unset / not YES** |
| G3 manual slippage override | Remains **disabled** — no manual slippage approval path |
| `positionSizeSol` | **Unchanged** — current **0.005** |
| Slippage bounds | **Unchanged** |
| Candidate or trade fields | **Not introduced** |
| Other `live_config` fields | **No changes** |
| Production code or tests | **No changes** |
| Runtime stub | **Not created** during G2 planning or G2 sign-off |
| Processes | **Not started** — zero executor loops |

---

## 8. Baseline-binding requirements

Signed G2 **must** bind the following at sign-off and reference them at transition execution:

| Binding | Source / method |
|---------|-----------------|
| **Pre-arming `live_config.json` SHA-256** | Capture immediately before C1 — reference baseline: `0996882e1a5244d05079a2a6f3ff09049758ecbbf3b8e3e0434ee4b13a4d33ef` *(planning-era; re-capture at transition)* |
| **Code fingerprint / revision** | Aggregate SHA-256 of proof-path files at final dry proof |
| **Process-set fingerprint** | Post-stop process snapshot |
| **G1 fingerprint / path** | `AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260709-AP01 — 2026-07-09.md` |
| **Environment-gate booleans** | `FOMO_ENABLE_LIVE_SUBMISSION` unset · `FOMO_ALLOW_LOOP_LIVE` unset *(pre-C1)* |
| **Runtime-stub state** | **Absent** before G3 creation gate |
| **Executor loops** | **0** |
| **Position / reconciliation / recovery / capital** | **0 / none** |

G2 transition is **invalid** if any bound fingerprint drifts after the final pre-C1 dry proof.

---

## 9. Fresh Domain A prerequisite

| Rule | Detail |
|------|--------|
| **G1–G4 signed first** | All four governance records must exist and bind **`RB-G9-20260709-AP01`** before arming |
| **Fresh Domain A proof** | Complete within **30 minutes immediately before C1** |
| **G2 reference** | Must link final dry-proof receipt path and bound fingerprints |
| **Drift invalidation** | Any code/config/process/auth drift after proof → G2 use invalid |
| **Prior 2026-07-09 dry proof** | [`FRESH DOMAIN A DRY PROOF FOR ARMED NO-SUBMIT PROOF SESSION — 2026-07-09.md`](FRESH%20DOMAIN%20A%20DRY%20PROOF%20FOR%20ARMED%20NO-SUBMIT%20PROOF%20SESSION%20%E2%80%94%202026-07-09.md) — **planning evidence only** · **not sufficient for C1** |

---

## 10. Process-stop requirements (before C1)

| Process | Policy |
|---------|--------|
| **`monitor.js`** | **Stopped** |
| **Dashboard server** | **Stopped** if active and capable of mutating config or triggering workflows |
| **`scanner_gmgn_trending.js --watch`** | **Stopped** |
| **`live_executor.js`** | **Zero** processes · **no** `--loop` |
| **Child / replacement processes** | **None** — verify no shadow submit path |
| **Automatic restart** | **Forbidden** during proof window |
| **Evidence** | Capture process-set fingerprint **after** all stops confirmed |

Pre-existing observation processes are **not** acceptable without documented stop verification.

---

## 11. Pre-arming checks (transition gate — abort if any fail)

| # | Check |
|---|-------|
| **P1** | G1–G4 valid · same session **`RB-G9-20260709-AP01`** |
| **P2** | G1 **unused** and **unexpired** |
| **P3** | G2 signed and session-linked |
| **P4** | Runtime stub **absent** *(before separately authorized G3 creation gate)* |
| **P5** | `liveArmed` **false** |
| **P6** | Posture **`PIPELINE_OBSERVING`** |
| **P7** | `executionMode` **`PIPELINE_DRY_RUN`** |
| **P8** | `dryRunMode` **`true`** |
| **P9** | `FOMO_ENABLE_LIVE_SUBMISSION` **not YES** |
| **P10** | `FOMO_ALLOW_LOOP_LIVE` **not YES** |
| **P11** | Open positions **0** |
| **P12** | Pending reconciliation **0** |
| **P13** | Recovery actions **none** |
| **P14** | `capitalExposure` **none** |
| **P15** | Signer / public address match |
| **P16** | Dedicated RPC read-only health |
| **P17** | G3 manual slippage override **disabled** |
| **P18** | OR-20260630-008 **not_promoted** |
| **P19** | Fresh Domain A proof ≤ **30 minutes** old |
| **P20** | Process-stop verification complete |

---

## 12. Post-transition checks (after C1–C3)

| Check | Expected |
|-------|----------|
| **Only C1–C3 changed** | **Yes** — no unauthorized config diff |
| **`liveArmed`** | **`true`** |
| **Posture** | **`LIVE_ARMED`** |
| **Executor loops** | **0** |
| **Submit / sign / broadcast** | **None** |
| **`txSig`** | **None** |
| **Position / reconciliation / recovery / capital** | **None** |
| **Runtime stub** | **Absent** until G3 creation gate executes |
| **Armed timer** | Starts at first confirmed `LIVE_ARMED` timestamp |

---

## 13. 15-minute armed timer design

| Rule | Detail |
|------|--------|
| **Start** | First confirmed `liveArmed: true` / `LIVE_ARMED` timestamp after C3 |
| **Cap** | **15 minutes** — matches G1 `maximumArmedDurationMinutes` |
| **Scope** | Entire armed window including stub creation · Domain B proof · N6 armed probe · disarm |
| **Extension** | **None** — no grace period |
| **Delayed proof start** | If proof cannot start promptly → **disarm** |
| **Timeout action** | **Mandatory rollback** — D1–D3 reverse C1–C3 · Domain C validation · RB-G9 filing |

---

## 14. G2 invalidation triggers

G2 becomes **invalid immediately** if any occur:

| # | Trigger |
|---|---------|
| **I1** | G1 invalid · expired · or consumed |
| **I2** | Session ID mismatch vs G1/G3/G4 |
| **I3** | G3 or G4 missing at transition time |
| **I4** | Stale Domain A proof (>30 min before C1) |
| **I5** | Code / config / process / auth fingerprint drift |
| **I6** | Unexpected environment value |
| **I7** | Executor process present |
| **I8** | Monitor / dashboard / scanner still running |
| **I9** | Runtime stub unexpectedly present before G3 gate |
| **I10** | Position / reconciliation / recovery / capital exists |
| **I11** | Signer / RPC mismatch |
| **I12** | G3 manual slippage override enabled |
| **I13** | OR-20260630-008 status change |
| **I14** | Secret exposure |
| **I15** | Unauthorized `live_config` diff |
| **I16** | Armed timer timeout |
| **I17** | Ambiguity at any stage |

---

## 15. Mandatory rollback procedure

On abort · timeout · ambiguity · or proof completion:

| Step | Action |
|------|--------|
| **D1** | Remove/unset `FOMO_ENABLE_LIVE_SUBMISSION` in `.env` |
| **D2** | `executionMode` → **`PIPELINE_DRY_RUN`** |
| **D3** | `dryRunMode` → **`true`** |
| **D4** | Verify `liveArmed: false` · posture **`PIPELINE_OBSERVING`** |
| **D5** | Stop all executor processes |
| **D6** | Remove/consume runtime stub if G3 gate later created it |
| **D7** | Verify flat state — no position/reconciliation/recovery/capital |
| **D8** | Domain C: `node validate_live_system.js` **PASS** |
| **D9** | Domain C: `node run_safety_tests.js` **85/85 PASS** |
| **D10** | File RB-G9 session evidence under `Sessions/SESSION — RB-G9-20260709-AP01/` |
| **D11** | Mark G1–G4 **CONSUMED/CLOSED** |

---

## 16. Explicit non-authorizations (G2 planning and future G2 sign-off)

| Item | Status |
|------|--------|
| Runtime-stub creation | **No** — G3 separate gate |
| Armed proof execution | **No** — G4 separate gate |
| AP-01 through AP-20 invocation | **No** |
| N6 armed-safe probe | **No** |
| Candidate selection | **No** |
| Quote | **No** |
| Transaction construction | **No** |
| Submit / sign / broadcast | **No** |
| Micro-live execution | **No** |
| Capital exposure | **No** |
| Executor loop | **No** |
| OR promotion | **No** |
| Readiness / profitability claim | **No** |
| C1–C3 flag changes in this planning gate | **No** |
| C1–C3 flag changes in G2 sign-off gate alone | **No** — separate transition execution gate |

---

## 17. G2 signature requirements (future sign-off gate)

The signed G2 authorization must include:

| Field | Requirement |
|-------|-------------|
| **Signer** | Taylor Cheaney |
| **Signature timestamp** | UTC ISO-8601 + local timestamp/timezone |
| **Session ID** | **`RB-G9-20260709-AP01`** |
| **Linked G1** | Path and fingerprint of signed G1 |
| **Maximum armed duration** | **15 minutes** |
| **C1–C3 authorization** | Exact three-step transition only |
| **Rollback acceptance** | Explicit acceptance of mandatory rollback and no-execution boundaries |
| **Capital statement** | No trade or capital exposure authorized by G2 alone |

**Not signed in this gate.**

---

## 18. Next governance sequence

| Order | Gate / action |
|-------|---------------|
| **1** | **G2 — Arming Authorization** *(sign-off only — this planning gate's successor)* |
| **2** | **G3 — Runtime Stub Creation Planning / Authorization** |
| **3** | **G4 — Armed No-Submit Proof Authorization** |
| **4** | **Final Fresh Domain A Dry Proof** — after G1–G4 signed · within 30 min before C1 |
| **5** | **Process-stop gate** — verify monitor/dashboard/scanner/executor stopped |
| **6** | **Arming transition execution gate** — apply C1–C3 only |
| **7** | **Runtime-stub creation gate** — G3 authorized mirror only |
| **8** | **Armed no-submit proof execution gate** — Domain B + N6 armed probe |
| **9** | **Immediate disarm + Domain C closure** |

**Invariant:** G2 sign-off ≠ arming transition ≠ stub creation ≠ proof execution ≠ capital exposure.

---

## 19. `computeLiveArmedStatus` reference (read-only)

Post-C3 verification uses `live_executor.js`:

- `liveArmed: true` when all submission gates pass: `executionMode LIVE` · `dryRunMode false` · `emergencyStop false` · `automationEnabled true` · signer env present · `FOMO_ENABLE_LIVE_SUBMISSION=YES` · dedicated RPC · wallet/size gates
- `operationalPosture: LIVE_ARMED` when `liveArmed true` and not emergency-halted

**Armed posture does not authorize submit** — proof guards and G4 scope remain fail-closed without execution authorization.

---

## 20. Required output summary

| Item | Value |
|------|-------|
| **Planning note path** | `FRESH ARMED NO-SUBMIT PROOF ARMING AUTHORIZATION PLANNING — 2026-07-09.md` |
| **G1 validation result** | **PASS** |
| **G2 canonical path** | `Authorizations/AUTHORIZATION — Arming — RB-G9-20260709-AP01 — 2026-07-09.md` |
| **Ready for G2 authorization** | **Yes** |
| **Current system remains disarmed** | **Yes** |
| **Production code changed** | **No** |
| **Tests changed** | **No** |
| **Config/environment changed** | **No** |
| **Runtime stub created** | **No** |
| **Proof session created** | **No** |
| **G2 / G3 / G4 created** | **No** |
| **Submit/broadcast invoked** | **No** |
| **Position/reconciliation/recovery/capital** | **none** |
| **OR-20260630-008 status** | **not_promoted** |
| **Readiness/profitability claims** | **No** |

---

## 21. Recommended next gate

**Fresh Armed No-Submit Proof Arming Authorization**

---

**Receipt path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/FRESH ARMED NO-SUBMIT PROOF ARMING AUTHORIZATION PLANNING — 2026-07-09.md`
