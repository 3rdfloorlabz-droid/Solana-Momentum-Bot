# B2A/R7b Observation Window Planning — 2026-07-04

Status:
Planning only — **observation window NOT authorized to start**

Gate type:
Plan a deliberate dry-run/paper observation window for B2A/R7b data collection without starting scanner/executor loops, claiming readiness, enabling capital exposure, or promoting any OR.

Prerequisite context:
- A4 Dedicated RPC track **steady-state closed** (A4.41 · `A4_DEDICATED_RPC_TRACK_STEADY_STATE_CLOSED`)
- A4 additive status **`A4_VERIFIED_DEDICATED`** current at A4.40 re-check — **not** B2A/R7b authorization
- OR-20260630-008 remains **`not_promoted`**

Live readiness:
Not claimed

Human soak readiness:
Not claimed

Capital exposure:
Not enabled

**Code changed:** **No** · **Runtime processes started:** **No**

---

## Canonical Ori Vault Check

| Path | Result |
|------|--------|
| `C:\Users\nalle\OneDrive\Documents\Obsidian\Trackta OS\Ori` | Not re-checked; not found at prior gates |
| Workspace-local Ori | **Used** — new folder `Ori/Phase 2/Project Vulcan/B2A R7b Observation/` |

---

## 1. Files Inspected (read-only)

| File | Purpose |
|------|---------|
| `A4.38 VERIFIED-DEDICATED STEADY-STATE OPERATOR BRIEF — 2026-07-04.md` | Idle vs active observation; do/don't; stop/rollback |
| `A4.39 VERIFIED-DEDICATED PERIODIC RE-CHECK PLANNING — 2026-07-04.md` | A4 re-check before governance-dependent decisions |
| `A4.41 A4 DEDICATED RPC STEADY-STATE CLOSURE RECEIPT — 2026-07-04.md` | A4 boundaries; B2A/R7b listed as separate future track |
| `ACTIVE_MANIFEST.md` | Runtime health, active observation posture, B2A/R7b manifest entries |
| `docs/B2A_24H_OBSERVATION_RUN_PLAN.md` | Existing 24h runbook, commands, artifacts, stop conditions |
| `docs/R7B_STRATEGY_DATA_COLLECTION_PLAN.md` | R7b sample thresholds, metrics, pass/fail for R8 consideration |

---

## 2. Existing B2A/R7b References Found

| Reference | Location | Relevance |
|-----------|----------|-----------|
| **B2A 24-Hour Observation Run Plan** | `docs/B2A_24H_OBSERVATION_RUN_PLAN.md` | Primary execution runbook (2026-06-29); `start_fomo.ps1`, checkpoints, artifacts |
| **R7b Strategy Data Collection Plan** | `docs/R7B_STRATEGY_DATA_COLLECTION_PLAN.md` | Sample thresholds (≥30 closes, ≥7 days, exit mix, PF ≥1.20 for R8 *consideration*) |
| **B2A status helper** | `b2a_24h_observation_status.js` | Read-only snapshots → `analysis/b2a_24h_observation_status.json` |
| **R7b daily summary** | `r7b_daily_summary.js` | → `analysis/r7b_daily_summary.json` |
| **Soak checkpoints** | `soak_checkpoint.js`, `run_24h_soak_checkpoints.js` | Process/state evidence |
| **A1d 24h observation** | `docs/A1D_STABILITY_OBSERVATION_PLAN.md` | Separate A1 file-race soak — not this gate |
| **ACTIVE_MANIFEST** | B2A/R7b rows, `analysis/b2a_24h_observation_status.json`, runtime postures | Manifest already links repo docs |

**No existing Ori B2A/R7b folder** — this note creates `Ori/Phase 2/Project Vulcan/B2A R7b Observation/` without reorganizing repo docs.

---

## 3. Observation Purpose

| In scope | Out of scope |
|----------|--------------|
| Sustained **dry-run / paper-trading** data collection for Track B / R7b | Live readiness |
| Produce artifacts for **B2B review** and R7b threshold tracking | Capital readiness |
| Validate **HEALTHY_DRY_RUN** posture **during the window only** | Trading authorization |
| Complement idle-safe steady state (A4.41) with **deliberate, bounded** observation | OR-20260630-008 promotion |
| Use existing scanner → monitor → executor **PIPELINE_DRY_RUN** stack | Human soak authorization |
| | Treating `supportsSoakClaim` as soak authorization |

**Plain language:** Run the bot's observation stack on purpose for a fixed window to collect paper/strategy evidence — not to go live, not to promote OR, not because A4 says so.

---

## 4. Proposed Duration

| Window type | Duration | Label |
|-------------|----------|-------|
| **Full observation (default candidate)** | **24 hours** continuous | `B2A_24H_OBSERVATION` — aligns with `docs/B2A_24H_OBSERVATION_RUN_PLAN.md` |
| **Rehearsal only** | **2–4 hours** max | Must be explicitly labeled **`REHEARSAL_NOT_FULL_OBSERVATION`** in gate receipt — validates start/stop/checkpoints only; does **not** satisfy B2A 24h or R7b sample thresholds |

R7b sample thresholds (≥7 active days, ≥30 closes) require **multiple** observation windows or extended calendar collection — a single 24h run is **one** B2A execution, not automatic R7b completion.

---

## 5. Entry Conditions (Future Execution Gate — All Required)

Before any **B2A/R7b Observation Window Execution** gate may start processes:

| # | Condition | Verification (read-only) |
|---|-----------|---------------------------|
| E1 | **Explicit authorization gate** passed | This planning note + separate execution gate receipt (not auto-start) |
| E2 | **A4_VERIFIED_DEDICATED** still current OR A4.39 re-check passed | `collectRuntimeEvidence` + classifier **or** `/api/runtime-health` `a4Health.status` |
| E3 | **`PIPELINE_DRY_RUN`** / `dryRunMode: true` | `node live_executor.js --status` (no `.env` read) |
| E4 | **`liveArmed: false`** | `--status` output |
| E5 | **`capitalExposure: none`** | `/api/runtime-health` or classifier |
| E6 | **`supportsLiveReadiness: false`** | runtime-health / classifier |
| E7 | **`recovery_actions.jsonl` absent** | `Test-Path recovery_actions.jsonl` → False |
| E8 | **Dashboard reachable** OR read-only fallback documented | curl `/api/runtime-health` with timeout; fallback: A4.35 pattern |
| E9 | **Scanner producer identified** | `scanner_gmgn_trending.js --watch` only (not legacy `scanner.js`) |
| E10 | **Executor dry-run command identified** | `live_executor.js --loop` |
| E11 | **Stop/rollback commands ready** | §11 below |
| E12 | **Safety suite green** (recommended) | `node run_safety_tests.js` |
| E13 | **OR not promoted** | OR-20260630-008 `promotion_status: not_promoted` unchanged |

---

## 6. Planned Commands (Future Execution Gate — Do Not Run in This Gate)

### Pre-flight (Phase A)

```powershell
cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot
node run_safety_tests.js
node live_executor.js --status
Test-Path recovery_actions.jsonl
node b2a_24h_observation_status.js --record-start
```

Optional A4 re-check (read-only):

```powershell
node -e "const re=require('./runtime_evidence');const rh=require('./runtime_health');const {evidence}=re.collectRuntimeEvidence({});console.log(JSON.stringify(rh.classifyA4Health(evidence.a4Evidence).status));"
```

### Start observation processes (Phase B — authorized execution gate only)

**Minimal core (A4/Vulcan runtime-health path):**

```powershell
node scanner_gmgn_trending.js --watch
node live_executor.js --loop
```

**Full B2A stack (per existing runbook — includes monitor, wallet, dashboard):**

```powershell
powershell -ExecutionPolicy Bypass -File .\start_fomo.ps1
```

Or manual equivalent: dashboard + wallet_monitor + scanner `--watch` + monitor + executor `--loop`.

### Verification during window

```powershell
curl.exe -s --max-time 25 http://localhost:3000/api/runtime-health
powershell -ExecutionPolicy Bypass -File .\fomo_status.ps1
node b2a_24h_observation_status.js --write
node live_executor.js --status
```

### Checkpoints (Phase C)

```powershell
node soak_checkpoint.js --label=b2a_<checkpoint>
node b2a_24h_observation_status.js --write
node r7b_daily_summary.js
```

### Stop (Phase D — see §11)

Prefer Ctrl+C in process windows; `stop_fomo.ps1` or targeted stop per operator brief.

---

## 7. Evidence Artifacts to Capture

| Artifact | Source / command | Use |
|----------|------------------|-----|
| `scanner_health.json` freshness | Scanner `--watch` | G7 / success: scanner fresh (<5 min `lastScanAt`) |
| `executor_singleton.lock.json` | Executor `--loop` | Heartbeat/currentness (≤3 min `updatedAt`) |
| `/api/runtime-health` snapshots | curl at checkpoints | Classification, A4 additive status, invariants |
| `execution_audit.jsonl` tail | Runtime | PIPELINE_DRY_RUN stages; no live submission |
| `paper_trades.json` | Scanner | Entries, thesis tags |
| `paper_positions.json` | Monitor | Canonical closes, PnL |
| `pipeline_candidates.jsonl` | Scanner | Candidate volume |
| `soak_runs/b2a_24h_observation_start.json` | `--record-start` | Window start timestamp |
| `analysis/b2a_24h_observation_status.json` | `b2a_24h_observation_status.js --write` | B2A status snapshots |
| `soak_runs/r6a_24h_soak_checkpoints.jsonl` | `soak_checkpoint.js` | Checkpoint evidence |
| `analysis/r7b_daily_summary.json` | `r7b_daily_summary.js` | R7b threshold progress |
| `analysis/r7_strategy_metrics.json` | `r7_strategy_review.js` (end) | Deep metrics |
| Start / checkpoint / stop timestamps | Gate receipt (Ori) | Audit trail |

**Timestamps to record in execution receipt:** `startedAt`, each checkpoint ISO time, `stoppedAt`.

---

## 8. Success Criteria (Observation Window — Not Live Readiness)

All must hold **for the planned window** (24h full, or rehearsal scope if labeled):

| # | Criterion |
|---|-----------|
| S1 | Scanner remains **fresh** (`scanner_health.json` within manifest 5 min threshold at checkpoints) |
| S2 | Executor heartbeat **current** (`executor_singleton.lock.json` within 3 min at checkpoints) |
| S3 | **Dry-run posture preserved** — `PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false` |
| S4 | **`capitalExposure: none`** throughout |
| S5 | **No secretRisk** on A4 path (`a4Health` / evidence collector) |
| S6 | **No unexpected A4 blocker posture** during window (optional log; A4 may stay verified) |
| S7 | **No live submission** — `live_positions.json` empty; no LIVE tx in audit |
| S8 | **`recovery_actions.jsonl` not created** |
| S9 | **Observation data captured** — B2A status writes + checkpoints + R7b daily summary for window |
| S10 | **`supportsLiveReadiness: false`** at all checkpoints |
| S11 | **`supportsSoakClaim`** not treated as human soak authorization (machine flag only) |

**Success does NOT mean:** R7b thresholds met, B2B complete, live ready, OR promoted, or A4 re-closed.

---

## 9. Failure / Abort Criteria

**Stop immediately** if any occur:

| # | Condition | Detection |
|---|-----------|-----------|
| F1 | Dry-run posture lost | `--status` shows not `PIPELINE_DRY_RUN` or `dryRunMode: false` |
| F2 | `liveArmed: true` | `--status` or runtime-health |
| F3 | `capitalExposure` not `none` | runtime-health |
| F4 | Scanner stale beyond threshold | `scanner_health.json` age > 30 min sustained at checkpoint |
| F5 | Executor heartbeat missing/stale | Lock absent or `updatedAt` > 3 min sustained while loop expected |
| F6 | Runtime-health unavailable with no safe fallback | HTTP hang + read-only collector also fails |
| F7 | **secretRisk** detected | A4 evidence / runtime-health |
| F8 | Unexpected live submission | Audit LIVE stages; `live_trades.jsonl` submission events |
| F9 | `recovery_actions.jsonl` created | File appears |
| F10 | Process runaway / repeated hangs | Operator judgment; repeated curl/status failures |
| F11 | State corruption | JSON parse failures on core files |
| F12 | Safety suite regression | Pre/post `run_safety_tests.js` failure |

On abort: execute §11 stop/rollback; document failing criterion; **do not** claim partial success as live readiness.

---

## 10. Stop / Rollback

| Step | Action |
|------|--------|
| 1 | **Ctrl+C** in scanner and executor windows (preferred) |
| 2 | If needed: `powershell -ExecutionPolicy Bypass -File .\stop_fomo.ps1` or targeted stop |
| 3 | **`Stop-Process -Force`** only if graceful stop fails (normal on Windows per A4.29) |
| 4 | Wait **~3 minutes** for lock TTL self-heal (`executor_singleton.lock.json`) |
| 5 | Manual lock removal **only after confirming** no `live_executor.js --loop` running (hygiene, not required unblock) |
| 6 | Post-stop: `curl /api/runtime-health` — expect return toward branch-6 idle-safe if processes stopped |
| 7 | Record stop time + post-stop snapshot in gate receipt |
| 8 | **Do not** delete audit/history; preserve artifacts for B2B/R7b review |

---

## 11. Checkpoint Cadence

**Recommended for full 24h window:**

| Checkpoint | Actions |
|------------|---------|
| **Start** | `--record-start`, `--status`, runtime-health, `soak_checkpoint --label=b2a_start` |
| **+15 min** | runtime-health, quick `fomo_status.ps1` (rehearsal validation minimum) |
| **+1 h** | `soak_checkpoint --label=b2a_1h`, `b2a_24h_observation_status.js --write`, runtime-health |
| **+6 h** | `soak_checkpoint --label=b2a_6h`, status write, runtime-health |
| **+12 h** | `soak_checkpoint --label=b2a_12h`, `r7b_daily_summary.js` if calendar day boundary crossed |
| **+24 h** | `soak_checkpoint --label=b2a_24h`, final status write, `r7_strategy_review.js`, runtime-health |
| **Stop** | Stop processes §10, final runtime-health, gate receipt |

**Note:** Legacy B2A doc uses 1h/4h/12h/24h — this plan adds **15m** and **6h** for tighter early detection; 4h checkpoint remains optional (`b2a_4h`).

**Rehearsal window:** Start, +15m, +1h, stop only.

---

## 12. Required Post-Observation Review Gate

**Gate name:** **B2A/R7b Observation Results Review**

| Requirement | Detail |
|-------------|--------|
| Purpose | Interpret collected data against B2A metrics and R7b thresholds |
| Must | Review artifacts §7; compare to R7B plan §2 pass/fail |
| Must not | Claim live/capital readiness unless **separate** authorized gate |
| Must not | Promote OR-20260630-008 without dedicated promotion gate |
| Must not | Treat observation success as A4 re-verification (optional A4 re-check if citing A4 in same decision) |
| Output | Review note in Ori + update `analysis/*` references; recommend continue collection vs B2B vs halt |

---

## 13. Relationship to A4 Steady State

| Topic | Rule |
|-------|------|
| A4 verified-dedicated | May remain true during observation — **does not authorize** the window |
| Idle-safe branch-6 | Expected **before** and **after** window |
| `HEALTHY_DRY_RUN` | Meaningful **only during** authorized window |
| Continuous observation | **Forbidden** after window ends (A4.38) |

---

## 14. Safety Confirmation (This Gate)

| Check | Result |
|-------|--------|
| Scanner/executor started | **No** |
| Live trading | **No** |
| Capital exposure enabled | **No** |
| OR-20260630-008 promoted | **No** — **not_promoted** |
| Promotion authorized | **No** |
| Live readiness claimed | **No** |
| Human soak readiness claimed | **No** |
| Code changed | **No** |
| `.env` opened | **No** |
| Secrets inspected | **No** |
| `process.env` dumped | **No** |

---

## 15. Recommended Next Gate

**B2A/R7b Observation Window Authorization** — operator/Taylor explicit go-ahead to execute the planned window (still dry-run only; no live/capital/OR promotion).

Execution gate after authorization: **B2A/R7b Observation Window Execution**.

---

## 16. Cross-References

| Doc | Path |
|-----|------|
| Repo B2A runbook | `docs/B2A_24H_OBSERVATION_RUN_PLAN.md` |
| Repo R7b plan | `docs/R7B_STRATEGY_DATA_COLLECTION_PLAN.md` |
| A4 operator brief | `A4.38 VERIFIED-DEDICATED STEADY-STATE OPERATOR BRIEF — 2026-07-04.md` |
| A4 closure | `A4.41 A4 DEDICATED RPC STEADY-STATE CLOSURE RECEIPT — 2026-07-04.md` |
| Manifest | `ACTIVE_MANIFEST.md` |
