# B2A — 24-Hour Observation Run Plan

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Document type:** Operational runbook — observation only  
**Date:** 2026-06-29  
**Verdict:** **B2A PLAN DEFINED — OBSERVATION ONLY — LIVE TRADING NOT APPROVED**

**Prior gates:**  
- [Track B B1 Thesis](./TRACK_B_B1_THESIS.md)  
- [Track B B2 Data Collection Plan](./TRACK_B_B2_DATA_COLLECTION_PLAN.md)  
- [R7b Strategy Data Collection Plan](./R7B_STRATEGY_DATA_COLLECTION_PLAN.md)

**Helper script:** `node b2a_24h_observation_status.js` (read-only)

**Live trading:** **NOT APPROVED**  
**Do not connect R43E proof signer to `live_executor.js`.**

---

## Purpose

Run the existing scanner → monitor → pipeline dry-run stack for **24 continuous hours** to collect strategy observation data **without live trades**. This executes the B2 collection cadence at run scale and produces artifacts for **B2B review**.

---

## 1. Exact commands to start the 24-hour observation run

Run from repo root: `C:\TracktaOS\Projects\Active\Solana-Momentum-Bot`

### Phase A — Pre-flight (required)

```powershell
cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot

node run_safety_tests.js
node live_executor.js --status
Test-Path recovery_actions.jsonl
git status --short

node b2a_24h_observation_status.js --record-start
```

Confirm:

- Safety suite **67/67** (or current green count from `node run_safety_tests.js`)
- `executionMode: PIPELINE_DRY_RUN`
- `dryRunMode: true`
- `liveArmed: false`
- `liveSubmission: DISARMED`
- `recovery_actions.jsonl` → **False**
- Start marker written: `soak_runs/b2a_24h_observation_start.json`

Optional collection window override:

```powershell
$env:R7B_COLLECTION_START = (Get-Content soak_runs\b2a_24h_observation_start.json | ConvertFrom-Json).startedAt
```

### Phase B — Start processes

```powershell
powershell -ExecutionPolicy Bypass -File .\start_fomo.ps1
```

This launches (separate windows, 2s stagger):

1. `node dashboard_server.js`
2. `node wallet_monitor.js`
3. `node scanner_gmgn_trending.js --watch`
4. `node monitor.js`
5. `node live_executor.js --loop`

Verify after ~30 seconds:

```powershell
powershell -ExecutionPolicy Bypass -File .\fomo_status.ps1
node b2a_24h_observation_status.js --write
```

### Phase C — Schedule checkpoints (recommended)

In a **separate** PowerShell window (does not stop processes):

```powershell
cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot
node run_24h_soak_checkpoints.js
```

Or manual checkpoints at 1h / 4h / 12h / 24h:

```powershell
node soak_checkpoint.js --label=b2a_1h
node b2a_24h_observation_status.js --write
node soak_checkpoint.js --label=b2a_4h
node soak_checkpoint.js --label=b2a_12h
node soak_checkpoint.js --label=b2a_24h
```

### Phase D — Daily aggregation during run

At a fixed time each calendar day overlapping the run:

```powershell
node r7b_daily_summary.js
node b2a_24h_observation_status.js --write
```

---

## 2. Which scripts should run

| Script | Required | Role |
|--------|----------|------|
| `scanner_gmgn_trending.js --watch` | **Yes** | Token/pair discovery, paper entries, pipeline intents |
| `monitor.js` | **Yes** | Paper position lifecycle (canonical closes) |
| `live_executor.js --loop` | **Yes** | `PIPELINE_DRY_RUN` observation only — no signing/submission |
| `wallet_monitor.js` | **Yes** | RPC/wallet health (read-only balance) |
| `dashboard_server.js` | Recommended | Operator visibility (port 3000) |
| `b2a_24h_observation_status.js` | **Yes** (periodic) | Read-only status snapshots |
| `soak_checkpoint.js` | Recommended | Posture/process/state evidence |
| `r7b_daily_summary.js` | **Yes** (daily) | R7b threshold progress |
| `r7_strategy_review.js` | At end | Weekly-style deep metrics |
| `r29_real_quote_observer.js --observe-once` | Optional | Manual quote-only shadow samples (gated; no signing) |
| `r36_shadow_execution_harness.js` | Optional | Shadow decisions from v2 quotes (simulation only) |

**Must NOT run during B2A:**

- R43E `--final-broadcast-confirmation` / any real submission path  
- Signer integration tests against production executor loop  
- Config edits setting `LIVE`, `dryRunMode: false`, or `liveArmed: true`

---

## 3. Which files / logs collect results

### Runtime state (repo root)

| File | Writer | B2A use |
|------|--------|---------|
| `paper_trades.json` | Scanner | Entries, thesis tags, liquidity/MC/volume at entry |
| `paper_positions.json` | Monitor | **Canonical** closed trades, win/loss/timeout, PnL % |
| `pipeline_candidates.jsonl` | Scanner | Candidate count / handoff intents |
| `execution_audit.jsonl` | Executor | Pipeline dry-run stages, slippage estimates |
| `live_errors.jsonl` | Executor | Quote/route failures |
| `near_misses.json` | Scanner | Rejected candidates |
| `scanner_health.json` | Scanner | Quiet vs active market |
| `wallet_status.json` | Wallet monitor | Balance/RPC read health |
| `rpc_health.json` | Wallet monitor | RPC latency/failures |
| `live_trades.jsonl` | Executor | Dry-run ledger events (expect 0 live submissions) |
| `live_positions.json` | Executor | Must stay **empty** during B2A |
| `observation_dedup.json` | Executor | Dedup state |
| `executor_singleton.lock.json` | Executor | Singleton guard evidence |

### B2A / analysis artifacts

| File | Producer |
|------|----------|
| `soak_runs/b2a_24h_observation_start.json` | `b2a_24h_observation_status.js --record-start` |
| `analysis/b2a_24h_observation_status.json` | `b2a_24h_observation_status.js --write` |
| `soak_runs/r6a_24h_soak_checkpoints.jsonl` | `soak_checkpoint.js` / `run_24h_soak_checkpoints.js` |
| `analysis/r7b_daily_summary.json` | `r7b_daily_summary.js` |
| `analysis/r7_strategy_metrics.json` | `r7_strategy_review.js` |
| `analysis/real_quote_observations.jsonl` | R29 (optional manual batches) |
| `analysis/shadow_execution_decisions.jsonl` | R36 (optional) |

**Gitignored:** all `analysis/*` outputs and most runtime JSON/JSONL — do not commit secrets or runtime dumps.

---

## 4. How often data is sampled

| Interval | Action |
|----------|--------|
| **Continuous** | Scanner ~60s; monitor tick; executor loop cycle; wallet monitor 30s |
| **1h / 4h / 12h / 24h** | `soak_checkpoint.js` + `b2a_24h_observation_status.js --write` |
| **Daily** | `r7b_daily_summary.js` + safety suite + posture check |
| **End of 24h** | Full summary block (§10) |

---

## 5. Metrics required

| Metric | Primary source | Status script field |
|--------|----------------|---------------------|
| Number of candidates | `pipeline_candidates.jsonl` | `candidates.candidatesInWindow` |
| Number of paper entries | `paper_trades.json` | `paperEntries.entriesInWindow` |
| Closed paper trades | `paper_positions.json` | `paperPerformance.closedInWindow` |
| Wins / losses / timeouts | `paper_positions.json` | `paperPerformance.wins/losses/timeouts` |
| Net paper PnL (% sum) | `paper_positions.json` | `paperPerformance.netPaperPnlPercentInWindow` |
| Route quote success/failure | `execution_audit.jsonl`, `live_errors.jsonl` | `routeQuotes.quoteSuccess/quoteFailed` |
| Liquidity at entry | `paper_trades.json` | `entrySegments.averageLiquidityAtEntryUsd`, `liquidityTier` |
| Slippage estimate | `execution_audit.jsonl` PIPELINE_DRY_RUN payload | `routeQuotes.estimatedAverageSlippagePct` |
| Token age | Not persisted on current paper rows | Manual B2B review / future schema |
| Market cap tier | `paper_trades.json` `marketCap` | `entrySegments.marketCapTier` |
| Volume tier | `paper_trades.json` `volume5m` | `entrySegments.volumeTier` |
| Thesis matched vs not | `paper_trades.json` | `paperEntries.thesisMatchTrue/False` |

**Segmentation tiers (B2 schema):**

- MC: `MC_IN_BAND_100K_250K`, `MC_BELOW_100K`, `MC_ABOVE_250K`, `MC_UNKNOWN`
- Liquidity: `T1_GTE_100K`, `T2_25K_100K`, `T3_LT_25K`, `LIQ_UNKNOWN`
- Volume (5m): `V1_GTE_25K`, `V2_10K_25K`, `V3_1K_10K`, `V4_LT_1K`, `VOL_UNKNOWN`

---

## 6. Stop conditions

**Stop the run immediately** if any occur:

| # | Condition | Detection |
|---|-----------|-----------|
| S1 | Script crash / core process exit | `fomo_status.ps1` missing scanner/monitor/executor |
| S2 | Sustained API failure | `scanner_health.json` failed scans; GMGN/Dex errors in scanner window |
| S3 | Runaway file growth | `execution_audit.jsonl` or `paper_trades.json` grows abnormally fast (>2× expected daily rate) |
| S4 | Corrupted logs | JSON parse failures in core state files |
| S5 | Unexpected transaction submission attempt | `live_trades.jsonl` LIVE submission events; audit stages beyond PIPELINE_DRY_RUN with tx sig |
| S6 | `recovery_actions.jsonl` created | `Test-Path recovery_actions.jsonl` → True |
| S7 | `liveArmed` becomes `true` | `live_executor.js --status` or `b2a_24h_observation_status.js` |
| S8 | `dryRunMode` becomes `false` | Same |
| S9 | `executionMode` becomes `LIVE` | Same |
| S10 | Duplicate executor `--loop` | `soak_checkpoint` FAIL: >1 loop process |
| S11 | Singleton lock mismatch | Checkpoint FAIL |
| S12 | Safety suite fails | `node run_safety_tests.js` |

**Stop commands (normal end or abort):**

```powershell
powershell -ExecutionPolicy Bypass -File .\stop_fomo.ps1
```

**Emergency halt (sets `emergencyStop=true` and stops processes):**

```powershell
powershell -ExecutionPolicy Bypass -File .\panic.ps1
```

After stop: run §9 post-completion checks. Do **not** enable live trading to "recover."

---

## 7. Safety checks before starting

| Check | Command | Expected |
|-------|---------|----------|
| Safety suite green | `node run_safety_tests.js` | All pass |
| Posture dry-run | `node live_executor.js --status` | `PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false` |
| Live submission disarmed | same | `liveSubmission: DISARMED` |
| No recovery file | `Test-Path recovery_actions.jsonl` | **False** |
| Live positions empty | `(Get-Content live_positions.json)` | `[]` |
| Git clean (recommended) | `git status --short` | No unintended config edits |
| R43E signer not in executor | Static review / R43F audit | No `local_signer` in executor integration |
| Record B2A start | `node b2a_24h_observation_status.js --record-start` | `soak_runs/b2a_24h_observation_start.json` |
| Dedicated RPC | `--status` | May block live submission — **expected**; observation OK |

---

## 8. Safety checks during the run

| Interval | Checks |
|----------|--------|
| Every **4 hours** | `fomo_status.ps1`, `b2a_24h_observation_status.js --write`, `soak_checkpoint.js --label=b2a_*` |
| **Daily** | `run_safety_tests.js`, `r7b_daily_summary.js`, `Test-Path recovery_actions.jsonl` |
| **Continuous operator** | Dashboard scanner health; no panic/emergency unless stop condition |

Watch for:

- `liveArmed` / `dryRunMode` / `executionMode` drift  
- Unexpected `live_positions.json` entries  
- Non-zero live submission signatures in audit  
- Scanner stalled (`scanner_health` STALLED)

---

## 9. Safety checks after completion

```powershell
powershell -ExecutionPolicy Bypass -File .\stop_fomo.ps1

node run_safety_tests.js
node live_executor.js --status
Test-Path recovery_actions.jsonl
node b2a_24h_observation_status.js --write
node r7b_daily_summary.js
node r7_strategy_review.js
node soak_checkpoint.js --label=b2a_complete
```

Verify:

- Posture unchanged (dry-run / disarmed)  
- `live_positions.json` empty  
- No new live submission signatures  
- `recovery_actions.jsonl` absent  
- B2A window metrics captured in `analysis/b2a_24h_observation_status.json`

---

## 10. How to summarize results for B2B review

**B2B** = post-run review package (not a code milestone yet — operator + docs review).

### Required outputs

1. `analysis/b2a_24h_observation_status.json` — final window metrics  
2. `analysis/r7b_daily_summary.json` — threshold progress vs R7b  
3. `analysis/r7_strategy_metrics.json` — full strategy metrics refresh  
4. `soak_runs/b2a_24h_observation_start.json` — run boundaries  
5. Checkpoint evidence (`soak_runs/r6a_24h_soak_checkpoints.jsonl` or labeled B2A checkpoints)

### B2B summary template

```text
B2B review YYYY-MM-DD
Run: B2A 24h observation
Window: <start> → <end>
Posture end state: PIPELINE_DRY_RUN / dryRunMode true / liveArmed false / recovery absent

Candidates: N
Paper entries: N (thesis true=N, false=N)
Closed trades: N (wins/losses/timeouts)
Net paper PnL %: X
Route quotes: success=N failed=N avgSlippage=X
Liquidity avg at entry: $X
MC tiers: { ... }
Volume tiers: { ... }

R7b progress: closed N/30, days N/7, thesis N/10, stops/wins/timeouts
Verdict: continue collection / ready for B3 design discussion / halt path
Live trading approved: NO
```

### Pass / continue criteria toward B3

Per [Track B B2 Data Collection Plan](./TRACK_B_B2_DATA_COLLECTION_PLAN.md) §8 — B3 smart-wallet scoring may begin only after sample + quality thresholds met. **B2B pass does not approve live trading.**

---

## Future Dashboard Roadmap

**Status:** Requirements only — **not implemented in B2A.**  
The existing `dashboard_server.js` provides basic visibility; this section defines what a **future** Track B dashboard must cover without building full live trading controls yet.

**B2A scope:** continue using CLI + `b2a_24h_observation_status.js` + existing dashboard for the 24h run. No new live-trading UI in B2A.

### 1. Observation dashboard first (B2D / B2E)

Read-only and low-risk process controls only. Must surface data already collected during B2A/B2 runs:

| Area | Required display / control |
|------|----------------------------|
| Process control | Start/stop **scanner**; start/stop **monitor** (via existing authenticated control routes — not raw config mutation) |
| Run status | Which core processes are running; executor loop count; singleton lock state |
| Candidates | Pipeline candidate count (window + latest); scanner `resultsCount` |
| Paper positions | Open paper positions count and summary |
| Paper closes | Closed trade count; wins / losses / timeouts |
| Paper PnL | Net paper PnL % (window + all-time); profit factor where available |
| Route quote health | Quote success vs failure counts; average slippage estimate from pipeline dry-run audit |
| API health | Scanner last scan status; GMGN/Dex errors; `rpc_health.json` snapshot |
| Safety posture | `executionMode`, `dryRunMode`, `liveArmed`, `emergencyStop`, `liveSubmission` summary |
| Recovery | `recovery_actions.jsonl` present/absent (must show **absent** as healthy during observation) |
| Posture banner | Persistent display: **`liveTradingApproved: false`** |

Data sources (read-only): `paper_positions.json`, `paper_trades.json`, `pipeline_candidates.jsonl`, `execution_audit.jsonl`, `scanner_health.json`, `rpc_health.json`, `live_config.json`, `b2a_24h_observation_status.js` output, `live_executor.js --status` equivalent.

### 2. Live trading dashboard later (post-approval only)

**Not in B2A.** Build only after explicit future approval milestones (R7 edge + R8+ gates + operator authorization record). When built, it must remain **supervised** — no one-click autonomous trading.

| Area | Required capability |
|------|---------------------|
| Session control | Start **supervised** live session; stop live session (human-confirmed) |
| Emergency | Emergency kill switch (maps to existing `emergencyStop` / panic path) |
| Caps display | Max loss cap, max trade count, max position size (from operator caps) |
| Wallet | Wallet balance (read-only) |
| Live positions | Open live positions (when armed — future only) |
| PnL | Realized / unrealized PnL (live ledger) |
| Transactions | Transaction signatures (public only — no secret material) |
| Failures | Failed route / failed transaction log |
| Disarm | One-click **disarm** (set safe posture — never arm without separate gate) |
| Signer | Signer **source status** (env/keyfile configured yes/no, public key only) — **never** display or store secrets |

### 3. Dashboard safety rules (all phases)

| Rule | Requirement |
|------|-------------|
| CLI gates | Dashboard **cannot bypass** CLI gates (`r43d`, R43E flags, R29 activation, etc.) |
| `liveArmed` | Dashboard **cannot directly** set `liveArmed: true` |
| `dryRunMode` | Dashboard **cannot** set `dryRunMode: false` without a **separate documented milestone** and human approval record |
| Secrets | Dashboard **cannot store or display** private keys, seed phrases, or signer secret JSON |
| Approval banner | Dashboard **must show** `liveTradingApproved: false` until an explicit future approval milestone |
| Human confirmation | Dashboard **must require** typed/confirmed human action for any **future** live arming or session start |
| Audit | Dashboard **must log** all operator actions (append-only audit — no silent config writes) |
| R43E isolation | Dashboard **must not** wire R43E proof signer into `live_executor.js` |
| No autonomous loop | Dashboard **must not** expose "enable full live trading" or autonomous arming controls in B2A/B2D/B2E |

Existing dashboard auth guards (A2j/A2k/A2s) remain the baseline; future work extends — does not weaken — recovery and live boundaries.

### 4. Recommended implementation path

| Milestone | Deliverable | Live trading |
|-----------|-------------|--------------|
| **B2A** (this plan) | 24h observation run; CLI + `b2a_24h_observation_status.js` | **NOT APPROVED** |
| **B2B** | Post-run review package from observation artifacts | **NOT APPROVED** |
| **B2D** | Observation dashboard **spec** — wireframe + data bindings + safety rules | **NOT APPROVED** |
| **B2E** | Read-only dashboard **prototype** — observation metrics only; optional scanner/monitor start/stop via existing guarded routes | **NOT APPROVED** |
| **B3** | Smart-wallet scoring model — features, labels, backtest plan | **NOT APPROVED** |
| **B4** | Liquidity capacity / edge model | **NOT APPROVED** |
| **Later** | Supervised micro-live controls **only after** strategy + risk + operator approval gates | Separate explicit milestone |

**B2A operator note:** use `dashboard_server.js` on port 3000 for visibility during the 24h run if desired; do not treat current dashboard as the B2E prototype or as live-trading approval UI.

---

## Boundaries

This plan:

- Does **not** enable live trading  
- Does **not** submit transactions  
- Does **not** modify `live_config.json` posture  
- Does **not** connect R43E proof signer to `live_executor.js`  
- Does **not** approve strategy  

**Observation only.**

---

## Related documents

- [Track B B2 Data Collection Plan](./TRACK_B_B2_DATA_COLLECTION_PLAN.md)  
- [R7b Strategy Data Collection Plan](./R7B_STRATEGY_DATA_COLLECTION_PLAN.md)  
- [Architecture](./ARCHITECTURE.md)  
- [R43F Post-Transaction Audit](./R43F_POST_TRANSACTION_AUDIT.md)
