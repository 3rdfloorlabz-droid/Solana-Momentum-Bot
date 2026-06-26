# R6 — 72-Hour Dry-run Soak Plan

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Operational Readiness / Observation)  
**Status:** **PLAN COMPLETE** — soak **NOT STARTED**  
**Plan date:** 2026-06-23  
**Author:** Taylor / Ori  

**Prior hardening:** [A2T_POST_ACTION_RECOVERY_REVIEW.md](./A2T_POST_ACTION_RECOVERY_REVIEW.md) (A2 simulated recovery) · [R4_LIVE_POSITIONS_ATOMICITY_REVIEW.md](./R4_LIVE_POSITIONS_ATOMICITY_REVIEW.md) · [R5_SINGLETON_EXECUTOR_GUARD_REVIEW.md](./R5_SINGLETON_EXECUTOR_GUARD_REVIEW.md) · [STATE_DURABILITY_AND_LIVE_READINESS_GAP_REVIEW.md](./STATE_DURABILITY_AND_LIVE_READINESS_GAP_REVIEW.md)  
**Related (prior abbreviated soak):** [A2D_SOAK_VALIDATION_PLAN.md](./A2D_SOAK_VALIDATION_PLAN.md) · [A2D_SOAK_REVIEW.md](./A2D_SOAK_REVIEW.md) · [A2D_SOAK_CHECKPOINT_LOG.md](./A2D_SOAK_CHECKPOINT_LOG.md)  
**Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · [OPERATIONS.md](./OPERATIONS.md) · `live_executor.js` · `executor_singleton_guard.js` · `run_safety_tests.js`

---

## 1. Executive Summary

R6 defines a **72-hour dry-run soak plan** for TracktaOS after:

| Milestone | What it hardened |
|-----------|------------------|
| **A2** | Recovery safety stack (simulated routes only) |
| **R3** | `observation_dedup.json` atomic writes |
| **R4** | `live_positions.json` ownership + atomic writes |
| **R5** | Singleton executor guard for `--loop` |

R6 is **observation only**. It validates that the system remains stable, disarmed, and internally consistent under continuous `PIPELINE_DRY_RUN` operation after state-safety hardening.

Plainly:

- **The soak is observation only.**
- **Live trading remains disarmed.**
- **Real recovery remains deferred.**
- **Passing the soak does not automatically approve live trading.**

> **Soak before live readiness. Observation before approval.**

---

## 2. Current Starting Posture

Before beginning R6, confirm the expected starting posture:

| Field | Expected value |
|-------|----------------|
| `executionMode` | `PIPELINE_DRY_RUN` |
| `dryRunMode` | `true` |
| `liveArmed` | `false` |
| `operationalPosture` | `PIPELINE_OBSERVING` |
| Safety suite | **18/18 PASS** (`node run_safety_tests.js`) |
| Executor singleton lock | **Healthy when loop running** — `executorSingletonLock: active` with recent `lockUpdatedAt`; `none` when loop not running |
| `recovery_actions.jsonl` | **Absent** at repo root unless an approved simulated recovery route was intentionally exercised in a test fixture |
| Dashboard | Available at **http://localhost:3000** when `dashboard_server.js` is running |

If any field differs at T-0, **STOP** — do not start the soak until posture is corrected and documented.

---

## 3. Pre-soak Checklist

Run from repository root: `C:\TracktaOS\Projects\Active\Solana-Momentum-Bot` (or equivalent canonical path).

### 3.1 Git and safety baseline

```powershell
git status --short
git log --oneline -5
node run_safety_tests.js
node live_executor.js --status
Test-Path recovery_actions.jsonl
```

| Check | Pass |
|-------|------|
| `git status --short` | Clean or only documented intentional local runtime files (gitignored) |
| `node run_safety_tests.js` | **18/18 PASS** |
| `node live_executor.js --status` | `PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false`, `operationalPosture: PIPELINE_OBSERVING` |
| `Test-Path recovery_actions.jsonl` | **False** |

### 3.2 Process checks (all TracktaOS processes)

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match "scanner_gmgn_trending|monitor.js|wallet_monitor|dashboard_server|live_executor" } |
  Select-Object ProcessId, CommandLine
```

**Pass:** At most **one** instance of each canonical process, or zero if starting fresh via `start_fomo.ps1`.

**Fail:** Duplicate scanner, monitor, executor, wallet monitor, or dashboard processes without documented cleanup.

### 3.3 Executor-specific check

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match "live_executor.js" } |
  Select-Object ProcessId, CommandLine
```

**Pass:** Zero or **one** `live_executor.js --loop` process.

**Fail:** Two or more executor processes, or executor running without singleton lock when loop is claimed active.

### 3.4 Singleton lock check

```powershell
Test-Path executor_singleton.lock.json
Get-Content executor_singleton.lock.json -ErrorAction SilentlyContinue
node live_executor.js --status
```

| Lock state | Interpretation |
|------------|----------------|
| Lock **absent**, no executor loop | Normal before start |
| Lock **active**, executor loop running | Normal — verify `lockUpdatedAt` is recent (< 3 min) |
| Lock **stale**, no executor loop | May replace on next `--loop` start; document |
| Lock **malformed** | **STOP** — manual operator review; do not delete without confirming no loop |
| Lock **active**, **no** executor process | Investigate — possible crash; document before restart |

### 3.5 Operator confirmation

- [ ] I confirm soak is **observation only**
- [ ] I will **not** enable live trading during the soak
- [ ] I will **not** execute real process recovery during the soak
- [ ] I will record checkpoints per §6
- [ ] I accept **72 hours** preferred duration (or document explicit risk acceptance for 24h minimum)

---

## 4. Soak Duration

| Duration | Status |
|----------|--------|
| **Preferred** | **72 continuous hours** |
| **Minimum acceptable** | **24 hours** — only with **explicit written risk acceptance** |

**Context:** A2d was **accelerated** (~1 hour, CP0–CP4, PASS WITH RISK ACCEPTED). R6 should prefer the **full 72 hours** to observe overnight behavior, quiet periods, and long-duration state durability.

A soak interrupted by unplanned reboot, duplicate process cleanup, or posture violation should be **restarted from zero** unless the operator documents a controlled pause and risk acceptance.

---

## 5. Systems Under Observation

| System | Role during soak |
|--------|------------------|
| `scanner_gmgn_trending.js` | Candidate discovery; appends `paper_trades.json`, `pipeline_candidates.jsonl` |
| `monitor.js` | Paper lifecycle; writes `paper_positions.json` |
| `wallet_monitor.js` | Wallet/RPC telemetry; writes `wallet_status.json`, `rpc_health.json` |
| `dashboard_server.js` | Read-only panels + auth-gated control routes (do not use recovery routes for real restart) |
| `live_executor.js --loop` | Pipeline observation; writes audit, dedup, positions (when applicable) |
| `executor_singleton.lock.json` | R5 singleton ownership; must stay healthy while loop runs |
| `live_positions.json` | R4 atomic snapshot; should remain valid JSON array |
| `observation_dedup.json` | R3 atomic dedup cache |
| `paper_trades.json` | Scanner append-only ledger |
| `paper_positions.json` | Monitor lifecycle store |
| `scanner_health.json` | Scanner heartbeat / funnel telemetry |
| `wallet_status.json` | Wallet monitor heartbeat |
| **Dashboard panels** | Process Heartbeats, Supervisor Recommendations, Recovery Advisor (read-only), Promotion Checklist |

**Not in scope for soak approval:** live submission, signer integration, real recovery execution.

---

## 6. Observation Schedule

Record checkpoints in a dedicated log (recommend: `docs/R6_SOAK_CHECKPOINT_LOG.md` — create at soak start; **documentation only**, not committed with runtime data).

### Checkpoint times

| Checkpoint | Target elapsed |
|------------|----------------|
| **Start** | T+0 |
| **CP1** | T+1h |
| **CP2** | T+4h |
| **CP3** | T+12h |
| **CP4** | T+24h |
| **CP5** | T+48h |
| **CP6** | T+72h (end) |

### Fields to record at each checkpoint

| Field | Source |
|-------|--------|
| Timestamp (UTC + local) | Operator |
| Git status | `git status --short` |
| Safety suite | `node run_safety_tests.js` (at start/end required; at checkpoints if practical) |
| Executor status | `node live_executor.js --status` |
| Singleton lock status | `--status` output + optional `Get-Content executor_singleton.lock.json` |
| Process list | CimInstance query (§3.2) |
| Dashboard health | Browser: http://localhost:3000 — heartbeats render |
| Scanner health | Dashboard panel + `scanner_health.json` |
| Wallet monitor health | Dashboard panel + `wallet_status.json` |
| Open live positions count | `--status` / dashboard / `live_positions.json` length |
| Paper positions count | Dashboard / `paper_positions.json` |
| Errors | `live_errors.jsonl` tail; terminal errors |
| Manual intervention | Any restart, cleanup, or operator action (see §9) |

---

## 7. Pass Criteria

The soak **passes** only if **all** of the following hold from T+0 through T+end:

| # | Criterion |
|---|-----------|
| P1 | Live remains **disarmed** — `liveArmed: false` at every checkpoint |
| P2 | `dryRunMode` remains **`true`** |
| P3 | `executionMode` remains **`PIPELINE_DRY_RUN`** |
| P4 | Safety suite **18/18 PASS** at start and end; preferably at checkpoints |
| P5 | **Only one** executor loop active at any time |
| P6 | Singleton lock **healthy** while executor loop is running (`active`, recent `lockUpdatedAt`) |
| P7 | No unexpected `live_positions.json` corruption (valid JSON array when present) |
| P8 | No unexpected `observation_dedup.json` corruption (valid JSON when present) |
| P9 | No repeated scanner or wallet monitor failures without documented external cause |
| P10 | No unplanned recovery actions |
| P11 | No repo-root `recovery_actions.jsonl` unless approved simulated recovery route was **intentionally** tested in isolation |
| P12 | No unexplained process duplication |
| P13 | No strategy or config mutation (`live_config.json` unchanged except documented operator edits — **none expected**) |
| P14 | No unreviewed critical errors in `live_errors.jsonl` |
| P15 | Dashboard remains reachable (or documented single manual restart with checkpoint note) |

Passing R6 supports progression toward **R7 Strategy Performance / Edge Review** — not live trading.

---

## 8. Fail Criteria

The soak **fails** immediately if **any** of the following occur:

| # | Fail condition |
|---|----------------|
| F1 | `liveArmed` becomes **`true`** |
| F2 | `dryRunMode` becomes **`false`** |
| F3 | `executionMode` becomes **`LIVE`** |
| F4 | **Two executor loops** run concurrently |
| F5 | Singleton lock is **malformed** while executor claims to be active |
| F6 | Executor **loses lock ownership** mid-soak (refresh failure / ownership changed) |
| F7 | `live_positions.json` **corrupts** (parse error when file exists and should be valid) |
| F8 | `observation_dedup.json` **corrupts** (parse error when file exists and should be valid) |
| F9 | **Process duplication** (multiple scanners/monitors/executors/wallets) without controlled cleanup |
| F10 | Dashboard stops and **cannot** be manually restarted |
| F11 | **Repeated** scanner or wallet monitor failures (operator-defined: e.g. 3+ consecutive checkpoint failures) |
| F12 | Safety suite **fails** at end (or at start of a resumed segment) |
| F13 | **Config changes unexpectedly** (`live_config.json` mode/arming/threshold mutation) |
| F14 | `recovery_actions.jsonl` **appears unexpectedly** at repo root |
| F15 | **Real process recovery** occurs (spawn/kill/shell restart via recovery routes or automation) |
| F16 | Any **live submission** is attempted |

On fail: follow §10 Incident Handling. Do not continue the soak clock without explicit risk acceptance.

---

## 9. Evidence Collection

Use separate scratch files or `docs/R6_SOAK_CHECKPOINT_LOG.md` (operator-maintained). **Do not commit runtime JSON/JSONL to git.**

### 9.1 Start Evidence (T+0)

| Field | Value |
|-------|-------|
| Soak ID | R6-YYYYMMDD-001 |
| Operator | |
| Start time (UTC) | |
| Target end (UTC) | T+72h or T+24h (document which) |
| Git commit | `git log -1 --oneline` |
| Safety suite | 18/18 PASS output snippet |
| Status output | Full `node live_executor.js --status` |
| `recovery_actions.jsonl` | False |
| Process list | CimInstance output |
| Singleton lock | absent / stale / active (document) |
| Dashboard screenshot note | Heartbeats visible Y/N |
| Risk acceptance | 72h preferred / 24h minimum (document) |

**Commands:**

```powershell
git status --short
git log --oneline -1
node run_safety_tests.js
node live_executor.js --status
Test-Path recovery_actions.jsonl
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "scanner_gmgn_trending|monitor.js|wallet_monitor|dashboard_server|live_executor" } | Select-Object ProcessId, CommandLine
```

### 9.2 Checkpoint Evidence (CP1–CP6)

Copy Start Evidence fields plus:

| Field | Value |
|-------|-------|
| Checkpoint | CP1 / CP2 / … / CP6 |
| Elapsed | |
| Pass/Fail/Investigate | |
| Singleton lock status | |
| Executor count | |
| Scanner panel | HEALTHY / STALE / … |
| Wallet panel | |
| Paper monitor panel | |
| Error summary | |
| Notes | |

### 9.3 Incident Log

| Timestamp | Incident | Fail criterion (F#) | Action taken | Soak restarted? |
|-----------|----------|---------------------|--------------|-----------------|

### 9.4 Manual Intervention Log

| Timestamp | Intervention | Reason | Processes affected | Lock file action |
|-----------|--------------|--------|--------------------|------------------|

Record **every** manual restart, duplicate cleanup, lock inspection, or dashboard restart.

### 9.5 End Evidence (T+end)

| Field | Value |
|-------|-------|
| End time (UTC) | |
| Total elapsed | |
| Safety suite (end) | 18/18 PASS |
| Final status | |
| Final process list | |
| Final singleton lock | |
| `recovery_actions.jsonl` | False |
| Overall result | **PASS / FAIL / PASS WITH RISK ACCEPTED** |
| Reviewer sign-off | |

### 9.6 Pass/Fail Decision

| Decision | Condition |
|----------|-----------|
| **PASS** | All §7 pass criteria met for full planned duration |
| **PASS WITH RISK ACCEPTED** | 24h minimum only, or minor documented interventions — requires written operator acceptance |
| **FAIL** | Any §8 fail criterion, or insufficient duration without acceptance |

---

## 10. Incident Handling

If something fails during the soak:

1. **Do not** enable live trading
2. **Do not** clear `emergencyStop` automatically
3. **Do not** use real recovery (no recovery route confirm for process restart)
4. **Do not** kill processes unless **manually reviewed** and documented in Manual Intervention Log
5. **Stop** the soak timer
6. **Document** the incident (§9.3)
7. Run `node run_safety_tests.js`
8. Run `node live_executor.js --status`
9. Inspect `executor_singleton.lock.json` (do not delete unless confirmed no loop)
10. Inspect relevant runtime files (`live_positions.json`, `observation_dedup.json`, `live_errors.jsonl`)
11. **Decide:** restart soak from **zero** or abort with FAIL

R5 performs **no automatic process killing**. Duplicate executor refusal is expected behavior — resolve by confirming single loop, not by force-killing.

---

## 11. Operator Restart / Update Note

### Before Windows update or reboot

```powershell
git status --short          # commit/push all work first
node run_safety_tests.js    # confirm 18/18 green
powershell -ExecutionPolicy Bypass -File .\stop_fomo.ps1
```

Record pause time in Manual Intervention Log. Soak clock **pauses**; prefer restart from zero after unplanned reboot unless risk accepted.

### After reboot

```powershell
cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot
git status --short
node run_safety_tests.js
node live_executor.js --status
Test-Path recovery_actions.jsonl
powershell -ExecutionPolicy Bypass -File .\start_fomo.ps1
```

Then verify:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match "scanner_gmgn_trending|monitor.js|wallet_monitor|dashboard_server|live_executor" } |
  Select-Object ProcessId, CommandLine

node live_executor.js --status
Test-Path executor_singleton.lock.json
Get-Content executor_singleton.lock.json -ErrorAction SilentlyContinue
```

**Singleton note:** After reboot, lock may be **absent** or **stale**. Starting `--loop` should acquire cleanly. If lock is **malformed**, stop and review manually per [OPERATIONS.md](./OPERATIONS.md).

---

## 12. What This Soak Does Not Approve

Passing R6 does **not** approve:

| Not approved |
|--------------|
| Live trading |
| Signer / private key integration |
| `dryRunMode: false` |
| `liveArmed: true` |
| `executionMode: LIVE` |
| Real process recovery |
| Executor recovery |
| Reset-after-panic automation |
| `emergencyStop` clearing automation |
| Autonomous recovery |
| Auto-compounding real funds |

R6 is one gate in a longer path (R7 → R8 → R9 → R10 → micro-live human gate).

---

## 13. Recommended Next Step After Successful Soak

**R7 — Strategy Performance / Edge Review**

**Purpose:** Analyze paper/dry-run results, thesis match quality, false positives, exits, timeouts, drawdown, liquidity assumptions, and whether the system demonstrates an edge worth risking capital.

R7 is analytical — not live enablement.

---

## 14. Deliverable

| Item | Status |
|------|--------|
| `docs/R6_72_HOUR_DRY_RUN_SOAK_PLAN.md` | **This document — COMPLETE** |
| `docs/R6_SOAK_CHECKPOINT_LOG.md` | **Create at soak start** (operator-maintained; optional) |
| `docs/R6_SOAK_REVIEW.md` | **Create at soak end** (future; after evidence collected) |

---

## 15. Verdict

| Field | Value |
|-------|-------|
| **R6 72-hour Dry-run Soak Plan** | **COMPLETE** |
| **Soak status** | **NOT STARTED** |
| **Live trading** | **NOT APPROVED** |
| **Recommended next step** | Begin R6 soak only after clean git state, **18/18** safety suite, dry-run posture, and operator confirmation |

---

## 16. Footer

Soak before live readiness.  
Observation before approval.  
Strategy proof before live capital.  
Singleton executor before live execution.  
State durability before live readiness.  
Live trading remains disarmed.  
Humans authorize.  
Ori advises.  
Gates enforce.
