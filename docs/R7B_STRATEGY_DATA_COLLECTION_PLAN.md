# R7b — Strategy Data Collection Plan

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Strategy gate follow-on)  
**Status:** **PLAN COMPLETE** — collection **NOT COMPLETE**  
**Plan date:** 2026-06-28  
**Operator decision:** Continue dry-run / paper collection per R7 verdict  

**Prior gates:**  
- [R6_72_HOUR_DRY_RUN_SOAK_PLAN.md](./R6_72_HOUR_DRY_RUN_SOAK_PLAN.md) §16 — R6a soak **PASS**  
- [R7_STRATEGY_PERFORMANCE_EDGE_REVIEW.md](./R7_STRATEGY_PERFORMANCE_EDGE_REVIEW.md) — verdict **NOT ENOUGH DATA**  

**Helper scripts (read-only):**  
- `node r7_strategy_review.js` → `analysis/r7_strategy_metrics.json`  
- `node r7b_daily_summary.js` → `analysis/r7b_daily_summary.json`  

**Live trading:** **NOT APPROVED**

---

## 1. Purpose

R7b exists because **R7 found insufficient fresh soak-window trade data** to justify advancing toward micro-live readiness or **R8 Risk Controls Review**.

| R7 finding | Implication |
|------------|-------------|
| Historical paper (178 closes, PF **1.47**, 41% win rate) | **Promising but paper-only** — not live-ready |
| R6a soak window (24h) | **1 closed paper trade** (WENDU STOP −5.29%), quiet market |
| Pipeline activity during soak | 28 dry-run audit events — **observation**, not edge proof |

R7b defines **how much fresh dry-run / paper evidence** must be collected **without changing strategy, filters, or posture** before an operator may **consider** R8. R7b is **planning and read-only instrumentation only** unless explicitly approved otherwise.

---

## 2. Target sample requirements

Collection baseline starts at **R6a soak start** (`2026-06-27T01:45:46.258Z` from `soak_runs/r6a_24h_soak_summary.json`) unless overridden:

```powershell
$env:R7B_COLLECTION_START = "2026-06-27T01:45:46.258Z"
```

Override only with documented operator risk acceptance.

### Minimum evidence before R8 consideration

**All** of the following must be satisfied (**whichever threshold completes last** among time vs count still applies — both duration and counts are required):

| Requirement | Threshold |
|-------------|-----------|
| Fresh closed paper trades | **≥ 30** (since collection start) |
| Active-market dry-run calendar days | **≥ 7** distinct days with paper close and/or pipeline dry-run activity |
| Thesis-matched candidates (`thesisMatch: true` in window) | **≥ 10** |
| Stop exits (LOSS / STOP) | **≥ 5** |
| Target or profitable exits (WIN or `pnlPercent > 0`) | **≥ 5** |
| Timeout exits | **≥ 5** |

### Safety / posture gates (continuous)

| Gate | Required state |
|------|----------------|
| State corruption | **None** — core JSON files parse |
| `recovery_actions.jsonl` | **Absent** (repo root) |
| Safety suite | **Green** (`node run_safety_tests.js`) |
| Posture | `PIPELINE_DRY_RUN` · `dryRunMode: true` · `liveArmed: false` |

**Canonical performance source:** `paper_positions.json` (not stale `OPEN` rows in append-only `paper_trades.json` ledger).

---

## 3. Metrics to collect

Track daily via `node r7b_daily_summary.js` and weekly deep-read via `node r7_strategy_review.js`.

### Trade / performance (fresh window)

| Metric | Source |
|--------|--------|
| Total fresh trades | `paper_positions.json` closes in window |
| Wins / losses / timeouts | position `status` |
| Breakevens (|PnL| < 0.5%) | position `pnlPercent` |
| Total PnL (% sum) | sum of `pnlPercent` |
| Average win / average loss | closed subsets |
| Win rate / loss rate / timeout rate | closed counts |
| Profit factor | gross wins ÷ \|gross losses\| |
| Max drawdown (cumulative `pnlPercent`) | chronological closes |
| Largest win / largest loss | min/max `pnlPercent` |
| Average hold time | `closedAt − entryId timestamp` |
| Timeout frequency | timeouts ÷ closed |

### Thesis / observation

| Metric | Source |
|--------|--------|
| `thesisMatch: true` count | `paper_trades.json` rows in window |
| `thesisFailureReasons` counts | `paper_trades.json` false-match rows |
| Rejected observations | `near_misses.json`, pipeline non-thesis audit segments |
| Pipeline candidates in window | `pipeline_candidates.jsonl` |

### Infrastructure / health (read-only)

| Metric | Source |
|--------|--------|
| A4 dedicated-RPC gate | `node live_executor.js --status` — live submission blocked until dedicated RPC |
| Idle executor periods | quiet `scanner_health.json` + zero paper closes (document, not panic) |
| Scanner health | `scanner_health.json` |
| Wallet monitor health | `wallet_status.json`, `rpc_health.json` |
| Singleton lock health | `executor_singleton.lock.json`, soak checkpoint / `--status` |

---

## 4. Pass / fail criteria for R7b

### R7b may recommend **R8 Risk Controls Review** only if

| Criterion | Threshold |
|-----------|-----------|
| Sample size | ≥ 30 fresh closed paper trades **and** ≥ 7 active-market days |
| Exit mix | ≥ 5 stops, ≥ 5 target/profitable, ≥ 5 timeouts |
| Thesis sample | ≥ 10 `thesisMatch: true` rows in window |
| Profit factor (fresh window) | **≥ 1.20** (paper, pre-fee) |
| Loss control | No dominant outlier cluster (review largest loss vs stop design) |
| Drawdown | Acceptable to operator — review cumulative `pnlPercent` drawdown trend |
| Stop behavior | Losses generally near −5% stop band (not −99% data anomalies unchecked) |
| Timeouts | Explainable (quiet continuation vs filter failure) |
| False-positive cluster | None identified in daily notes |
| State integrity | JSON parse OK; ownership guards green |
| Safety posture | Continuous PASS per §2 |

**Passing R7b does not approve live trading.** It only allows **R8 planning/review**.

### R7b recommends **continue dry-run** if

- Sample remains below §2 thresholds  
- Profit factor (fresh) **< 1.20**  
- Profit factor **< 1.00** (halt path review strongly recommended)  
- Large losses dominate fresh window  
- Thesis matches are low quality (high false-match reasons with poor outcomes)  
- Filters appear stale or broken (scanner errors, zero candidates for extended active periods)  
- Market conditions remain too quiet to gather meaningful sample (document days; do not loosen filters)

### R7b recommends **halt live-readiness path** if

- Uncontrolled loss cluster in fresh window  
- Repeated safety / posture violations  
- State corruption or unexpected recovery file  
- Operator documents strategy edge collapse in daily notes  

---

## 5. Operator runbook

### Start system (if not already running)

```powershell
cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot
powershell -ExecutionPolicy Bypass -File .\start_fomo.ps1
```

Do **not** change `live_config.json` posture.

### Verify status

```powershell
node live_executor.js --status
Test-Path recovery_actions.jsonl   # expect False
```

Expect: `PIPELINE_DRY_RUN` · `dryRunMode: true` · `liveArmed: false` · singleton lock **active**.

### Manual soak-style checkpoint (optional daily)

```powershell
node soak_checkpoint.js --label=r7b_daily
```

Or with safety:

```powershell
node soak_checkpoint.js --run-safety --label=r7b_daily
```

### Daily R7b summary (required)

```powershell
node r7b_daily_summary.js
```

Reads/refreshes `analysis/r7_strategy_metrics.json` and writes `analysis/r7b_daily_summary.json`.

Optional collection start override:

```powershell
$env:R7B_COLLECTION_START = "2026-06-27T01:45:46.258Z"
node r7b_daily_summary.js
```

### Inspect metrics

```powershell
Get-Content analysis\r7b_daily_summary.json
Get-Content analysis\r7_strategy_metrics.json
```

### Verify safety suite (daily or before any review note)

```powershell
node run_safety_tests.js
```

Expect **21/21 PASS** (includes R7b test).

### Stop criteria

Stop R7b collection clock and review before continuing if any **§7 Stop condition** fires. Do not treat checkpoint FAIL as passing evidence.

---

## 6. Daily review cadence

Each operator day during R7b (recommended same time daily):

| Step | Action |
|------|--------|
| 1 | `node run_safety_tests.js` — must stay green |
| 2 | `node live_executor.js --status` — posture unchanged |
| 3 | `Test-Path recovery_actions.jsonl` — must be **False** |
| 4 | `node soak_checkpoint.js --label=r7b_daily_YYYYMMDD` — optional PASS/FAIL |
| 5 | `node r7b_daily_summary.js` — record progress vs §2 thresholds |
| 6 | Review `analysis/r7b_daily_summary.json` → `progress.recommendation` |
| 7 | Note fresh closed trade count, thesis matches, quiet vs active market |
| 8 | Append one-line summary to operator log (optional markdown note; do not commit runtime JSON) |

**Summary note template:**

```text
R7b daily YYYY-MM-DD: fresh_closed=N/30, active_days=N/7, thesis_true=N/10,
stops=N/5, wins_or_profit=N/5, timeouts=N/5, PF=fresh, posture=OK, continue=Y/N
```

---

## 7. Stop conditions

**Stop R7b immediately** (do not treat as passing evidence) if any occur:

| # | Condition |
|---|-----------|
| S1 | `liveArmed` becomes `true` |
| S2 | `dryRunMode` becomes `false` |
| S3 | `executionMode` becomes `LIVE` |
| S4 | Duplicate actual `node.exe live_executor.js --loop` processes |
| S5 | Singleton lock PID mismatch with executor loop |
| S6 | Unexpected `recovery_actions.jsonl` at repo root |
| S7 | Safety suite fails |
| S8 | JSON state corruption (`paper_positions.json`, `live_positions.json`, `observation_dedup.json`) |
| S9 | Fresh paper window shows uncontrolled loss cluster (operator judgment + PF collapse) |
| S10 | Wallet/signer env files change unexpectedly (`.env`, signer secrets) |

On stop: document incident, run `node run_safety_tests.js`, `node live_executor.js --status`, do **not** enable live trading.

---

## 8. Live readiness statement

| Statement | True / False |
|-----------|--------------|
| R7b approves live trading | **False** |
| R7b approves micro-live | **False** |
| R7b may allow **R8 Risk Controls Review** if §4 pass criteria met | **True** (review only) |
| Live trading remains blocked until R8 + wallet/signer review + live execution review + emergency stop review + explicit human approval | **True** |

**After R7b (even if PASS toward R8):** still require:

- R8 risk controls (caps, daily loss limit, kill switches)  
- Wallet / signer review  
- Live execution path review  
- Emergency stop validation under live posture drill  
- Explicit human approval (`LIVE_AUTHORIZATION_RECORD`)  
- Micro-size only · no auto-compounding · one position max initially · strict daily loss cap · paper/live comparison  

---

## 9. Deliverable

| Item | Status |
|------|--------|
| `docs/R7B_STRATEGY_DATA_COLLECTION_PLAN.md` | **This document — COMPLETE** |
| `r7b_daily_summary.js` | **COMPLETE** (read-only) |
| `test_r7b_daily_summary.js` | **COMPLETE** |
| R7b collection phase | **NOT COMPLETE** — operator must run daily collection |

---

## 10. Footer

R6a proved stability.  
R7 proved insufficient fresh edge data.  
R7b collects evidence — it does not trade live.  
Filters stay fixed until a separate approved strategy review.  
Humans authorize.  
Ori advises.  
Gates enforce.
