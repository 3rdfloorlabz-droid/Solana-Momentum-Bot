# A1 Drill Batch Authorization — 2026-07-05

Status:
**Authorization complete — Taylor authorizes future A1 Critical Drill Batch (D01+D02+D07 only); no drills executed in this gate**

Gate type:
Human authorization record — scope and boundaries for A1 Critical Drill Batch execution only

Prerequisites:
`POST-R14 PRE-ARMING ARCHITECTURE REVIEW — 2026-07-05.md` · `A1 STATE DURABILITY DRILL PLANNING — 2026-07-05.md` · `PRE-ARMING BLOCKER STATUS REVIEW — 2026-07-05.md`

Decision authority:
**Taylor Cheaney**

Live readiness achieved:
**No**

Human soak readiness:
**Not authorized**

OR-20260630-008:
**not_promoted** (unchanged)

**Code changed:** **No** · **Config changed:** **No** · **Runtime processes started:** **No** · **Drills executed:** **No**

---

## 1. Files Inspected (read-only)

| File | Purpose |
|------|---------|
| `POST-R14 PRE-ARMING ARCHITECTURE REVIEW — 2026-07-05.md` | Recommended A1 Critical Batch before R16 implementation; combine D01+D02+D07 |
| `A1 STATE DURABILITY DRILL PLANNING — 2026-07-05.md` | Drill matrix, preconditions, pass/fail criteria for D01/D02/D07 |
| `PRE-ARMING BLOCKER STATUS REVIEW — 2026-07-05.md` | N4 A1 drills open; Tier B arming requirements |
| `ACTIVE_MANIFEST.md` | Posture invariants; singleton lock TTL (~3 min); idle-safe vs active observation |

---

## 2. Authorization Decision (Taylor — Recorded)

Taylor **authorizes a future A1 Critical Drill Batch Execution gate** to run **three DRY drills only**:

| # | Drill ID | Drill name |
|---|----------|------------|
| 1 | **A1-D01** | Clean stop/restart recovery |
| 2 | **A1-D02** | Stale singleton lock recovery |
| 3 | **A1-D07** | Duplicate / observation idempotency prevention |

**This authorization gate does not execute drills.** It grants scope for the next runtime drill gate only.

**Batch rule:** All three drills may execute in **one session** (`A1 Critical Drill Batch Execution`) provided scope stays limited to D01+D02+D07, abort criteria are enforced, and a single implementation receipt captures evidence for all three.

---

## 3. Authorized Scope (Next Gate — D01/D02/D07 Only)

### 3.1 Execution class and posture

| Requirement | Value |
|-------------|-------|
| Execution class | **DRY** only — `PIPELINE_DRY_RUN`, no capital |
| `executionMode` | Must remain **`PIPELINE_DRY_RUN`** throughout |
| `dryRunMode` | Must remain **`true`** throughout |
| `liveArmed` | Must remain **`false`** throughout |
| `capitalExposure` | Must remain **`none`** throughout |
| Signer / secrets | **No** real signer load; **no** `.env` inspection or logging |
| Processes | Short authorized window: scanner `--watch` + monitor (if used) + executor `--loop` only as required per drill plan |

### 3.2 Drill-specific authorized actions

| Drill | Authorized in next gate |
|-------|-------------------------|
| **A1-D01** | Start brief active observation (scanner + executor `--loop`); capture baselines; **graceful stop**; verify no `--loop` remains; wait ≤3 min lock TTL; optional clean restart; `--status` + JSON parse sweep |
| **A1-D02** | Use or induce **orphan lock with dead PID**; verify `isExecutorLockStale`; confirm no active loop before any lock hygiene; TTL wait or manual delete **only after pid check**; verify new loop acquires fresh lock |
| **A1-D07** | Short `--loop` run; stop; restart; verify `observation_dedup.json` stable; no duplicate observation storm for same pair window |

### 3.3 Preconditions (must pass before drill execution starts)

| ID | Precondition |
|----|--------------|
| E1 | `dryRunMode: true`, `liveArmed: false` |
| E2 | `run_safety_tests.js` green (baseline **76/76** or current manifest count) |
| E3 | `recovery_actions.jsonl` **absent** in production runtime root |
| E4 | Taylor drill window authorized (this document satisfies authorization) |
| E5 | For D07: `test_observation_dedup_atomic.js` green in safety suite |

---

## 4. Expected Evidence (Future Execution Gate)

Each drill must produce secret-safe artifacts in an Ori drill receipt (`A1 CRITICAL DRILL BATCH EXECUTION — 2026-07-05.md` or dated receipt).

### 4.1 A1-D01 — Clean stop/restart recovery

| Evidence | Pass indicator |
|----------|----------------|
| `--status` output before stop | `PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false` |
| Process list after stop | No executor `--loop` process remains |
| Lock file after stop | Absent, or stale-only (dead PID / TTL expired) |
| JSON parse sweep | All authoritative JSON/JSONL parse (`live_config.json`, `live_positions.json`, `observation_dedup.json`, `live_trades.jsonl`, etc.) — **0 parse errors** |
| Posture after optional restart | Unchanged dry-run posture; restart acquires lock cleanly if attempted |
| Temp hygiene | No persistent `*.tmp` in runtime root |
| Runtime health (if captured) | Classification consistent with idle-safe or active observation; **not** live/armed |

**Pass summary:** Clean stop, restart (if run), lock/heartbeat/posture valid, no torn state.

### 4.2 A1-D02 — Stale singleton lock recovery

| Evidence | Pass indicator |
|----------|----------------|
| Lock JSON before hygiene | Shows orphan PID or stale `updatedAt` |
| `isExecutorLockStale` / guard output | Lock classified **stale** |
| Process verification | **No** active executor `--loop` before any delete |
| Hygiene method | TTL wait **or** manual delete **after** confirmed dead PID — documented |
| Lock after new start | Fresh lock with current PID and fresh `updatedAt` |
| State integrity | No corruption in config, positions, dedup after lock cycle |

**Pass summary:** Stale lock detected or self-healed safely; no duplicate executor ownership; no state corruption.

### 4.3 A1-D07 — Duplicate / observation idempotency

| Evidence | Pass indicator |
|----------|----------------|
| `observation_dedup.json` before/after | Valid JSON; keys stable across stop/restart |
| Loop restart behavior | No unbounded duplicate observation events for same pair/window |
| Execution audit spot-check | No duplicate pipeline intent storm attributable to dedup failure |
| Positions / trades | No duplicate OPEN positions or corrupted event sequences from idempotency failure |

**Pass summary:** Duplicate/observation idempotency prevention verified; no duplicate position or event corruption.

---

## 5. Abort Criteria (Future Execution Gate — Immediate Stop)

Drill execution **must abort immediately** if any condition occurs:

| # | Abort condition |
|---|-----------------|
| A1 | `executionMode` becomes **`LIVE`** or `dryRunMode` becomes **`false`** |
| A2 | `capitalExposure` becomes anything other than **`none`** |
| A3 | `liveArmed` becomes **`true`** |
| A4 | **`FOMO_ALLOW_LOOP_LIVE=YES`** set or live submission attempted |
| A5 | **Duplicate executor ownership** — two active `--loop` processes or lock held by live PID while second loop starts |
| A6 | **Torn or corrupt state** — any authoritative JSON/JSONL fails parse; persistent `*.tmp`; truncated arrays in atomic stores |
| A7 | **Unexpected `recovery_actions.jsonl`** appears in production runtime root during drill |
| A8 | **Secret exposure** — signer material, RPC keys, or `.env` values logged or returned in evidence |
| A9 | Config posture drift not attributable to documented drill steps |
| A10 | Operator cannot confirm all processes stopped within drill window |

**On abort:** Stop all drill processes; capture abort receipt; do **not** claim N4 partial closure; do **not** proceed to R16 or arming until root cause reviewed.

---

## 6. Implementation Boundaries

### 6.1 Allowed in next gate (execution only)

| Category | Allowed |
|----------|---------|
| Start/stop scanner `--watch` | **Yes** — short drill window only |
| Start/stop monitor (observational) | **Yes** — if already part of operator stack |
| Start/stop executor `--loop` | **Yes** — DRY only; graceful stop preferred |
| Read `--status`, `/api/runtime-health` | **Yes** — secret-safe captures only |
| Lock hygiene (TTL wait or delete after pid check) | **Yes** — D02 only |
| JSON parse sweep / line counts | **Yes** |
| Ori drill execution receipt | **Yes** |

### 6.2 Forbidden in next gate (even with this authorization)

| Category | Forbidden |
|----------|-----------|
| **A1-D03** crash/interruption drill | **No** — separate CRASH authorization |
| **A1-D04** reconciliation interrupt | **No** — separate gate |
| **A1-D05** audit durability long window | **No** |
| **N6** e-stop live-path drill | **No** |
| **A1-EV1** A1d 24h observation | **No** |
| **R16** implementation or planning execution | **No** |
| **R13** sign-off / waiver | **No** |
| **Arming gate** / `liveArmed true` | **No** |
| **`.env` edits or inspection** | **No** |
| **Real signer load / micro-live submit** | **No** |
| **OR promotion** | **No** |
| Live readiness / human soak claims | **No** |
| `Stop-Process -Force` mid-cycle (crash class) | **No** — reserved for A1-D03 |

---

## 7. Explicit Non-Authorizations (This Gate and Next Gate Unless Separately Gated)

| Item | Status |
|------|--------|
| Execute A1 drills (this gate) | **Not executed** |
| A1-D03 / A1-D04 / A1-D05 | **Not authorized** |
| N6 e-stop drill | **Not authorized** |
| A1-EV1 24h | **Not authorized** |
| R16 live path work | **Not authorized** |
| R13 / Taylor live authorization | **Not authorized** |
| Arming / `liveArmed true` | **Not authorized** |
| Capital exposure / live trading | **Not authorized** |
| OR promotion | **Not authorized** |
| Live readiness claim | **Not authorized** |
| Human soak readiness claim | **Not authorized** |
| `.env` / secrets | **Not authorized** |

---

## 8. Expected Outcome After Next Gate (Not This Gate)

| Item | Expected |
|------|----------|
| N4 partial closure | **D01, D02, D07 evidenced** — N4 remains **open** until D03, D04, D05 (or equivalents) and other Tier B items |
| LR-05 | **Partial improvement** — critical batch evidence; not full closure |
| R16 sequencing | Eligible for **R16 Live Path Implementation Planning** after successful batch receipt |
| Arming | **Still not authorized** |
| Live readiness | **Still not claimed** |

---

## 9. Required Invariants (Must Hold During and After Drill Execution)

| Invariant | Required value / behavior |
|-----------|---------------------------|
| `executionMode` | **`PIPELINE_DRY_RUN`** |
| `dryRunMode` | **`true`** |
| `liveArmed` | **`false`** |
| `capitalExposure` | **`none`** |
| OR-20260630-008 | **`not_promoted`** |
| Secret logging | **None** |
| N10 | **`liveArmed` held false** — no arming gate in this batch |

---

## 10. Recommended Next Gate

**A1 Critical Drill Batch Execution**

---

## 11. Safety Confirmation

| Item | Value |
|------|-------|
| `.env` opened | **No** |
| Secrets inspected | **No** |
| `process.env` dumped | **No** |
| `live_config.json` modified | **No** |
| `live_executor.js` modified | **No** |
| `executionMode` LIVE set | **No** |
| `liveArmed` true set | **No** |
| `FOMO_ALLOW_LOOP_LIVE=YES` set | **No** |
| Runtime processes started | **No** |
| Drills executed | **No** |
| OR-20260630-008 status | **not_promoted** |
| Promotion authorized | **No** |
| Live readiness claimed | **No** |
| Human soak readiness claimed | **No** |
| Capital exposure enabled | **No** |

---

**Signed / confirmed by Taylor:** Taylor Cheaney (A1 Critical Drill Batch authorization, 2026-07-05)
