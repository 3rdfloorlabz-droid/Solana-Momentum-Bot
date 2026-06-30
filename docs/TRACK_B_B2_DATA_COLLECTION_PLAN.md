# Track B B2 — Data Collection Plan

**Module:** TracktaOS — Solana Momentum Bot + FOMO Project  
**Document type:** Operational data collection plan — observation only  
**Date:** 2026-06-29  
**Verdict:** **B2 DATA COLLECTION PLAN DEFINED — OBSERVATION ONLY — LIVE TRADING NOT APPROVED**

**Prior gates:**  
- [Track B B1 Thesis](./TRACK_B_B1_THESIS.md) — Track A closed; research opens  
- [R7 Strategy Performance Edge Review](./R7_STRATEGY_PERFORMANCE_EDGE_REVIEW.md) — **NOT ENOUGH DATA**  
- [R7b Strategy Data Collection Plan](./R7B_STRATEGY_DATA_COLLECTION_PLAN.md) — sample thresholds and daily cadence  

**Live trading:** **NOT APPROVED**  
**Strategy approval:** **NOT APPROVED**  
**This plan does not submit transactions, arm live trading, integrate signers with `live_executor.js`, or change posture.**

---

## Executive summary

B1 defined **what** must be measured before any strategy or live approval discussion. B2 defines **how** to collect it using existing scanner → monitor → executor architecture and read-only analysis scripts.

Collection runs in three layers:

1. **Continuous runtime** — scanner, monitor, executor in `PIPELINE_DRY_RUN` produce paper outcomes and pipeline audit events.  
2. **Daily aggregation** — `r7b_daily_summary.js` tracks progress vs R7b/B2 sample thresholds.  
3. **Weekly + shadow forward observation** — `r7_strategy_review.js`, gated quote observation (R29 `--observe-once`), and shadow execution harness (R36) add route/slippage realism without signing.

**Recommended next milestone after B2 execution:** **B3 — Smart-wallet scoring model** (features, labels, backtest plan).

---

## Safety posture (continuous — non-negotiable)

| Gate | Required state |
|------|----------------|
| `executionMode` | `PIPELINE_DRY_RUN` |
| `dryRunMode` | `true` |
| `liveArmed` | `false` |
| `liveSubmission` | `DISARMED` |
| `recovery_actions.jsonl` | absent |
| Safety suite | **66/66** green |
| Signer in executor | **not integrated** |
| R7 verdict | **NOT ENOUGH DATA** until fresh sample + review says otherwise |

**Stop collection immediately** if any R7b §7 stop condition fires (posture change, recovery file, safety failure, state corruption).

---

## Architecture context

```text
GMGN CLI + DexScreener
        │
        ▼
scanner_gmgn_trending.js ──► paper_trades.json (append)
        │                    pipeline_candidates.jsonl
        │                    near_misses.json
        ▼
monitor.js ────────────────► paper_positions.json (canonical closes)
        │
        ▼
live_executor.js (PIPELINE_DRY_RUN) ──► execution_audit.jsonl
        │                                live_trades.jsonl (dry-run events)
        ▼
Analysis scripts (read-only) ──► analysis/*.json, analysis/*.jsonl
```

Wallet monitor (`wallet_monitor.js`) is **balance/RPC health only** — not smart-wallet flow. Smart-money feeds are **planned / missing** (see §1).

---

## 1. Data source inventory

### 1.1 Token / pair market data

| Source | Producer | Runtime file(s) | Status | Notes |
|--------|----------|-----------------|--------|-------|
| GMGN trending + token info | `scanner_gmgn_trending.js` via `gmgn-cli` | `paper_trades.json`, `scanner_health.json` | **Collected** | Primary discovery; `strategyVersion: gmgn_v4` |
| DexScreener pair enrichment | Scanner | Fields on trade rows (price, liquidity, MC) | **Collected** | Used for entry/target/stop |
| Scanner health / quiet market | Scanner | `scanner_health.json` | **Collected** | Segmentation: active vs quiet |
| Near-miss rejections | Scanner | `near_misses.json` | **Collected** | Filter funnel analysis |
| Near-miss follow-up | `near_miss_followup.js` | `near_miss_followups.json` | **Partial** | Optional process; not always running |

### 1.2 Liquidity data

| Source | Producer | Runtime file(s) | Status | Notes |
|--------|----------|-----------------|--------|-------|
| Scanner liquidity filter (≥ $25k) | Scanner | `paper_trades.json` fields | **Collected** | Pre-entry gate |
| Thesis MC band ($100k–$250k) | Executor thesis check | `paper_trades.json` `thesisMatch` | **Collected** | Post-M1 rows only |
| Live pool depth at quote time | Jupiter quote (R29) | `analysis/real_quote_observations.jsonl` | **On demand** | Requires gated `--observe-once` |
| Liquidity tier segmentation | B2 schema (§4) | `analysis/r7b_daily_summary.json` (future segment fields) | **Missing** | Derive from trade row MC/liquidity at collection |

### 1.3 Route quote data

| Source | Producer | Output | Status | Notes |
|--------|----------|--------|--------|-------|
| Jupiter lite quote API | `r29_real_quote_observer.js` | `analysis/real_quote_observations.jsonl` | **Gated** | Default DISABLED; `--observe-once` only; QUOTE_ONLY |
| Fixture shadow quotes | `r20_shadow_quote_collector.js` | `analysis/shadow_quote_observations.jsonl` | **Fixture** | No network; design/testing |
| Quote batch reviews | R30–R35 scripts | `analysis/r30_*` … `analysis/r35_*` | **Manual batch** | Operator-triggered reviews |
| Pipeline dry-run quotes | `live_executor.js` PIPELINE_DRY_RUN | `execution_audit.jsonl` | **Collected** | When candidates flow |

### 1.4 Wallet / smart-money flow data

| Source | Producer | Runtime file(s) | Status | Notes |
|--------|----------|-----------------|--------|-------|
| Phase 1 wallet balance | `wallet_monitor.js` | `wallet_status.json`, `wallet_history.jsonl` | **Collected** | Read-only; no tx building |
| RPC latency / health | `wallet_monitor.js` | `rpc_health.json` | **Collected** | Submission-path proxy only |
| GMGN wallet tags (bundler, bot rate) | Scanner token info | `paper_trades.json` / thesis fields | **Collected** | Token-level, not wallet cohort |
| Smart-wallet cohort tracking | — | — | **Missing** | B3 design target; no collector yet |
| Cross-chain wallet feeds | — | — | **Missing** | Track B future scope |

### 1.5 Paper trade outcomes

| Source | Producer | Runtime file(s) | Status | Notes |
|--------|----------|-----------------|--------|-------|
| Paper entry ledger | Scanner | `paper_trades.json` | **Collected** | Append-only; thesis tags on recent rows |
| **Canonical closes** | Monitor | `paper_positions.json` | **Collected** | **Source of truth** for win/loss/timeout |
| Forward test analysis | `analyze_forward_test.js` | stdout / operator notes | **Ad hoc** | Not scheduled in B2 cadence |

**Baseline (pre-B2 window, all-time):** 178 closes, PF **1.47**, win rate **41%** (`analysis/r7_strategy_metrics.json`) — historical only, not approval evidence.

**Fresh window (R7b start):** collection start `2026-06-27T01:45:46.258Z` — **1** soak close (WENDU −5.29%); thresholds not met.

### 1.6 Simulation / dry-run execution outcomes

| Source | Producer | Runtime / analysis file(s) | Status | Notes |
|--------|----------|----------------------------|--------|-------|
| Pipeline dry-run audit | `live_executor.js` | `execution_audit.jsonl` | **Collected** | 28 soak-window events in R7 |
| Pipeline candidates | Scanner | `pipeline_candidates.jsonl` | **Collected** | Handoff intents |
| Dry-run live ledger | Executor | `live_trades.jsonl` | **Collected** | 0 events in soak window |
| Shadow execution decisions | `r36_shadow_execution_harness.js` | `analysis/shadow_execution_decisions.jsonl` | **On demand** | Simulation only |
| Signer simulation | `signer_simulation_harness.js` | `analysis/signer_simulation_output.json` | **On demand** | Fake lifecycle; not market data |
| R43E engineering proof | `r43e_one_transaction_proof_harness.js` | `analysis/r43e_real_proof_review.json` | **Complete** | One isolated broadcast; not strategy sample |

---

## 2. Metric ownership map

### Legend

| Status | Meaning |
|--------|---------|
| **Active** | Produced today by running processes or documented scripts |
| **Scheduled** | Operator runs script on cadence below |
| **Missing** | Not yet collected; B2/B3 gap |

### Core performance metrics (R7b thresholds)

| Metric | Owner script | Input file(s) | Output | Status |
|--------|--------------|---------------|--------|--------|
| Fresh closed trade count | `r7b_daily_summary.js` | `paper_positions.json` | `analysis/r7b_daily_summary.json` | **Scheduled — daily** |
| Active-market day count | `r7b_daily_summary.js` | `paper_positions.json`, `execution_audit.jsonl`, `pipeline_candidates.jsonl` | `analysis/r7b_daily_summary.json` | **Scheduled — daily** |
| Thesis-matched count | `r7b_daily_summary.js` | `paper_trades.json` | `analysis/r7b_daily_summary.json` | **Scheduled — daily** |
| Stop / win / timeout counts | `r7b_daily_summary.js` | `paper_positions.json` | `analysis/r7b_daily_summary.json` | **Scheduled — daily** |
| Fresh profit factor | `r7b_daily_summary.js` | `paper_positions.json` | `analysis/r7b_daily_summary.json` | **Scheduled — daily** |
| Full strategy metrics | `r7_strategy_review.js` | All R7 evidence files | `analysis/r7_strategy_metrics.json` | **Scheduled — weekly** |
| R7 verdict refresh | `r7_strategy_review.js` | same | `analysis/r7_strategy_metrics.json` | **Scheduled — weekly** |

### Segmentation metrics (B2)

| Metric | Owner script | Input | Output | Status |
|--------|--------------|-------|--------|--------|
| Thesis matched vs not | `r7_strategy_review.js` / `r7b_daily_summary.js` | `paper_trades.json` | `r7_strategy_metrics.json`, `r7b_daily_summary.json` | **Active** (partial) |
| Liquidity / MC tier | **Missing aggregator** | `paper_trades.json`, positions | `analysis/b2_segment_summary.json` (proposed) | **Missing** |
| Time-of-day bucket | **Missing aggregator** | position `closedAt`, trade `timestamp` | proposed B2 artifact | **Missing** |
| Source signal type | Scanner fields | `paper_trades.json` `source` | R7 thesis section | **Active** |
| Chain / ecosystem | Scanner (Solana only today) | trade rows | constant `solana` until multi-chain | **Partial** |

### Route / execution realism metrics

| Metric | Owner script | Input | Output | Status |
|--------|--------------|-------|--------|--------|
| Quote observation (real) | `r29_real_quote_observer.js --observe-once` | Jupiter API | `analysis/real_quote_observations.jsonl` | **Scheduled — shadow cadence** |
| Quote review | `r33_clean_quote_observation_review.js` | observations jsonl | `analysis/r33_clean_quote_observation_review.json` | **On demand** |
| Shadow WOULD_ENTER/SKIP | `r36_shadow_execution_harness.js` | v2 observations | `analysis/shadow_execution_decisions.jsonl` | **Scheduled — shadow cadence** |
| Pipeline dry-run events | `live_executor.js` (runtime) | candidates | `execution_audit.jsonl` | **Active** |
| Slippage vs quote | R29 + R36 | observations + shadow | shadow decisions | **Partial** |
| Failed routes | R29, executor audit | observations, audit | review scripts | **Partial** |

### Infrastructure / quality metrics

| Metric | Owner script | Input | Output | Status |
|--------|--------------|-------|--------|--------|
| Posture snapshot | `live_executor.js --status` | `live_config.json` | stdout | **Scheduled — daily** |
| Soak-style checkpoint | `soak_checkpoint.js` | runtime state | `soak_runs/*` | **Optional daily** |
| RPC health | `wallet_monitor.js` | RPC | `rpc_health.json` | **Active** (30s loop) |
| Scanner health | `scanner_gmgn_trending.js` | GMGN | `scanner_health.json` | **Active** |
| Secret scan | `secret_safety_scan.js` | repo patterns | `analysis/secret_safety_scan.json` | **Weekly** |

### Proposed B2 artifact (not yet implemented)

| File | Purpose |
|------|---------|
| `analysis/b2_segment_summary.json` | Daily segmented counts by thesis, MC tier, liquidity tier, hour UTC |
| `analysis/b2_data_quality_report.json` | Daily duplicate/stale/failure/outlier summary |

Implementation of proposed artifacts is **optional B2 follow-on code** — this plan defines requirements; B2 verdict does not require new code to be **DEFINED**.

---

## 3. Collection cadence

### 3.1 Continuous (runtime)

| Process | Command | Produces |
|---------|---------|----------|
| Full stack | `powershell -File .\start_fomo.ps1` | Scanner, monitor, executor loop, dashboard, wallet monitor |
| Executor status only | `node live_executor.js --status` | Posture verification |

Do **not** change `live_config.json` posture during B2.

### 3.2 Daily — R7b refresh (required)

| Step | Command | Purpose |
|------|---------|---------|
| 1 | `node run_safety_tests.js` | Must stay **66/66** |
| 2 | `node live_executor.js --status` | Confirm dry-run / disarmed |
| 3 | `Test-Path recovery_actions.jsonl` | Must be **False** |
| 4 | `node r7b_daily_summary.js` | Refresh progress vs thresholds |
| 5 | Review `analysis/r7b_daily_summary.json` | Record `progress.recommendation` |

Optional:

```powershell
node soak_checkpoint.js --label=b2_daily_YYYYMMDD
$env:R7B_COLLECTION_START = "2026-06-27T01:45:46.258Z"  # if overriding
node r7b_daily_summary.js
```

**Daily note template:**

```text
B2 daily YYYY-MM-DD: closed=N/30, days=N/7, thesis=N/10, stops=N/5, wins=N/5,
timeouts=N/5, PF=fresh, posture=OK, shadow_obs=N, continue=Y/N
```

### 3.3 Weekly — R7 review (required)

| Step | Command | Output |
|------|---------|--------|
| 1 | `node r7_strategy_review.js` | `analysis/r7_strategy_metrics.json` |
| 2 | Compare fresh window PF, exit mix, thesis funnel | Operator review note |
| 3 | `node secret_safety_scan.js` | `analysis/secret_safety_scan.json` |

Weekly review does **not** approve live trading. It updates evidence for R7 verdict trajectory.

### 3.4 Shadow forward observation cadence

**Frequency:** 2× per week minimum when pipeline has thesis-matched or high-priority candidates; **0× acceptable** during extended quiet market (document idle days).

| Step | Command | Constraints |
|------|---------|-------------|
| 1 | Confirm R28/R29 gates — default HOLD / DISABLED | No standing polling |
| 2 | `node r29_real_quote_observer.js --observe-once` | QUOTE_ONLY; no signing; no submission |
| 3 | `node r33_clean_quote_observation_review.js` | Schema v2 validation |
| 4 | `node r36_shadow_execution_harness.js` | Reads v2 observations; simulation only |

**Hard rules:**

- Quote-only where possible (R29 default mode)  
- Dry-run / simulation only  
- **No signing**  
- **No transaction submission**  
- **No `live_executor.js` signer integration**  
- Observations must keep `approved: false`, `tradingAllowed: false`, `signingAllowed: false`, `submissionAllowed: false`

Fixture path for tests only:

```powershell
node r20_shadow_quote_collector.js   # fixture — no network
```

---

## 4. Segmentation schema

All B2 aggregates should tag records with these dimensions where data exists:

| Dimension | Values | Source fields | Use |
|-----------|--------|---------------|-----|
| **Thesis matched** | `true` / `false` / `unknown` | `paper_trades.json` `thesisMatch` | Conditional edge |
| **Liquidity tier** | `T1: ≥100k`, `T2: 25k–100k`, `T3: <25k` (scanner reject) | liquidity USD at entry | Capacity / slippage risk |
| **Market-cap tier** | `MC_IN_BAND: 100k–250k`, `MC_BELOW`, `MC_ABOVE`, `MC_UNKNOWN` | marketCap at scan | Thesis alignment |
| **Time-of-day** | `UTC_00-06`, `UTC_06-12`, `UTC_12-18`, `UTC_18-24` | `timestamp` / `closedAt` | Session effects |
| **Source signal type** | `gmgn_trending`, `pipeline_handoff`, `near_miss_followup` | `source`, pipeline origin | Funnel attribution |
| **Chain / ecosystem** | `solana` (only today) | scanner chain flag | Future multi-chain |
| **Market activity** | `quiet` / `active` | `scanner_health.json` `quietMarket` | Idle vs sample-rich days |

**Join key:** prefer `entryId` (`timestamp_address_pairAddress`) between `paper_trades.json` and `paper_positions.json`.

**Canonical outcome:** always from `paper_positions.json` close row, not ledger `OPEN` stubs.

---

## 5. Required sample thresholds

B2 adopts R7b / B1 thresholds as the **floor** before any strategy reconsideration or B3 scoring model calibration on Solana momentum data.

| Requirement | Threshold | Current (fresh window) |
|-------------|-----------|------------------------|
| Closed paper trades | **≥ 30** | **1** (WENDU) |
| Active-market calendar days | **≥ 7** | **Incomplete** |
| Thesis-matched (`thesisMatch: true`) | **≥ 10** | **Below threshold** |
| Wins / profitable exits | **≥ 5** | **Below threshold** |
| Stop exits (LOSS/STOP) | **≥ 5** | **Below threshold** |
| Timeout exits | **≥ 5** | **Below threshold** |

**Additional B2 quality bar (before B3):**

| Requirement | Threshold |
|-------------|-----------|
| Quote observations (schema v2, clean review PASS) | **≥ 20** rows |
| Shadow decisions (WOULD_ENTER + SKIP mix) | **≥ 20** rows |
| Segmented thesis-conditional PF computed | Fresh window, fee-assumption documented |
| Data quality report | **0** unresolved critical flags (§7) |

Passing sample thresholds enables **B3 design work only** — not live trading, not strategy approval.

---

## 6. Shadow observation design

### Purpose

Measure **route feasibility and slippage tax** without capital risk or signer exposure.

### Allowed stack

```text
Candidate mint (manual or pipeline) 
    → r29 --observe-once (Jupiter quote, QUOTE_ONLY)
    → real_quote_observations.jsonl (v2, safety flags false)
    → r33 clean review
    → r36 shadow harness (WOULD_ENTER / SKIP)
    → shadow_execution_decisions.jsonl
```

### Forbidden during B2 shadow work

| Forbidden | Reason |
|-----------|--------|
| `executionMode: LIVE` | Live trading not approved |
| `dryRunMode: false` | Same |
| `liveArmed: true` | Same |
| Signer load in executor | Track A isolation preserved |
| `r43e` final broadcast | Engineering proof closed |
| Standing R29 polling loop | R21/R28 gates require explicit activation |
| Swap build + sign + send | Observation plan is quote-first |

### Shadow decision fields to retain

- Requested vs implied slippage bps  
- Route provider (Jupiter)  
- Quote age at observation time  
- `gateVerdict` (PASS/WARN/REJECT)  
- Simulated decision + reason codes  
- Segmentation tags (§4)

---

## 7. Data quality checks

Run mentally on daily review; automate in proposed `analysis/b2_data_quality_report.json` when implemented.

| Check | Detection | Action |
|-------|-----------|--------|
| **Duplicate rows** | Same `entryId` or duplicate `candidateIntentId` in pipeline | Flag; dedupe in analysis; do not double-count trades |
| **Stale quotes** | Quote timestamp > 30s before observation record | Mark `stale_quote`; exclude from slippage stats |
| **Missing liquidity** | Null/zero liquidity on thesis-matched row | Segment as `MC_UNKNOWN`; review scanner enrichment |
| **Failed routes** | Jupiter error, empty routes, REJECT gate | Log in observation review; count failure rate |
| **API errors** | GMGN/DexScreener/RPC failures in scanner health | Document idle day; do not loosen filters |
| **Outlier slippage** | Implied slippage > 2× requested bps without WARN | Manual review; possible thin pool |
| **Paper ledger drift** | `OPEN` rows in `paper_trades.json` but closed in `paper_positions.json` | Use positions store only (known A1a pattern) |
| **Anomaly PnL** | Single close < −20% on stop strategy | Flag `NEEDS_REVIEW`; exclude from PF until explained |
| **Posture violation** | Any live arm / dry-run off | **Stop B2** per R7b §7 |

**Weekly quality gate:** no more than **5%** of fresh observations excluded for quality flags without documented cause.

---

## 8. Exit criteria for B3

B3 (**Smart-wallet scoring model — features, labels, backtest plan**) may begin when **all** of the following are true:

| Criterion | Requirement |
|-----------|-------------|
| Sample thresholds | §5 R7b counts satisfied |
| Segmentation | Thesis, MC, liquidity, time-of-day buckets populated for fresh window |
| Shadow corpus | ≥ 20 clean v2 quote observations + ≥ 20 shadow decisions |
| Data quality | §7 checks passed or exceptions documented |
| Weekly R7 | Fresh-window PF ≥ **1.20** (paper, pre-fee) **or** operator documents neutral/negative edge and pivots B3 to filter research |
| Safety | 66/66 suite; posture unchanged; no recovery file |
| Human review | Operator sign-off note: "B2 collection complete — proceed B3 design" |

**Explicit non-implications:**

- B3 exit **does not** approve live trading  
- B3 exit **does not** approve strategy  
- B3 exit **does not** authorize signer integration with executor  
- B3 exit **does not** bypass R7 if verdict remains NOT ENOUGH DATA on edge grounds  

---

## 9. Operator runbook (B2 start)

### Prerequisites

- `start_fomo.ps1` stack running or scheduled  
- `R7B_COLLECTION_START` set (default: R6a soak start)  
- R29 operator approval record present if using real quotes (`operator_records/r29_quote_observation_approval.json`)

### Minimum daily (5 minutes)

```powershell
cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot
node run_safety_tests.js
node live_executor.js --status
Test-Path recovery_actions.jsonl
node r7b_daily_summary.js
Get-Content analysis\r7b_daily_summary.json | Select-Object -First 40
```

### Minimum weekly (30 minutes)

```powershell
node r7_strategy_review.js
node r33_clean_quote_observation_review.js   # if new observations exist
node r36_shadow_execution_harness.js         # if clean observations exist
```

---

## 10. Boundaries

This plan:

- Does **not** enable live trading or change posture  
- Does **not** submit transactions or require signing  
- Does **not** integrate local signer with `live_executor.js`  
- Does **not** approve strategy or replace R7 human review  
- Does **not** commit capital scale  

**Observation and planning only.**

---

## Related documents

- [Track B B1 Thesis](./TRACK_B_B1_THESIS.md)  
- [R7b Strategy Data Collection Plan](./R7B_STRATEGY_DATA_COLLECTION_PLAN.md)  
- [FOMO Strategic Pivot and Engine Roadmap](./FOMO_STRATEGIC_PIVOT_AND_ENGINE_ROADMAP.md)  
- [Architecture](./ARCHITECTURE.md)  
- [R29 Real Quote Observer](./R29_REAL_QUOTE_OBSERVATION_ACTIVATION_IMPLEMENTATION.md)  
- [R36 Shadow Execution Harness](./R36_SHADOW_EXECUTION_HARNESS.md)  
- [R43F Post-Transaction Audit](./R43F_POST_TRANSACTION_AUDIT.md)
