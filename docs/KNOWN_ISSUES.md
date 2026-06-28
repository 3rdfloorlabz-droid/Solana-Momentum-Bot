# Known Issues

Tracked engineering issues for the Solana Momentum Bot (TracktaOS Module 1). Sourced primarily from [ENGINEERING_REVIEW.md](./ENGINEERING_REVIEW.md). Severity reflects impact on **capital safety**, **operational reliability**, and **TracktaOS migration** — not fix difficulty alone.

For each issue: description, impact, possible solution, and dependencies.

---

## Critical

Issues that can cause capital loss, untracked on-chain state, or silent safety failure if live trading is armed without mitigation.

---

### File races on shared JSON/JSONL state

| Field | Detail |
|-------|--------|
| **Description** | Scanner appends to `paper_trades.json` while monitor rewrites the full file on close. Executor, dashboard, and wallet monitor read/write `live_config.json` and position files with synchronous FS and no locks or atomic rename. |
| **Impact** | Corrupted JSONL, lost trades, inconsistent config gates, wrong automation state — potentially leading to duplicate entries or untracked positions in live mode. |
| **Status** | **`paper_trades.json` dual-writer race RESOLVED; `live_config.json` atomicity RESOLVED for all JS writers; both regression-guarded** (Sprint 4 A1a + A1b + A1c). **A1a:** ownership split via `paper_positions_store.js` — `paper_trades.json` is now **scanner-owned, append-only** (monitor no longer rewrites it); the monitor owns a separate mutable lifecycle store **`paper_positions.json`** (single writer, atomic temp-rename), keyed by `entryId = timestamp_address_pairAddress`, idempotently seeded with no history loss; scanner `alreadyOpen`/`recentlyLost` and dashboard read a merged view with ledger fallback. **A1b:** all JS `live_config.json` writers (`live_executor.saveConfig`, `emergency_stop.js`, `reset_live_safety.js`) route through `config_store.writeConfigAtomic()` (temp → fsync → re-parse validate → atomic rename → cleanup-on-error), matching the already-atomic PowerShell writers; format is byte-identical and A3 audit timing/schema unchanged. **A1c (2026-06-22):** `test_ownership_guards.js` statically enforces single-writer ownership and atomic config writes (fails if the monitor writes `paper_trades.json`, the scanner writes `paper_positions.json`, or any unapproved/non-atomic `live_config.json` writer appears); added to `run_safety_tests.js` (CI-enforced). Ownership contract documented in `ACTIVE_MANIFEST.md`. **R3 (2026-06-23):** `observation_dedup.json` writes route through `observation_dedup_store.js` (temp → fsync → validate → atomic rename); regression-guarded by `test_observation_dedup_atomic.js` + `test_ownership_guards.js`. **R4 (2026-06-23):** `live_positions.json` writes route through `live_positions_store.js` (temp → fsync → validate → atomic rename); executor-only writer; dashboard/scanner/monitor read-only; regression-guarded by `test_live_positions_atomic.js` + `test_ownership_guards.js`. **R5 (2026-06-23):** `live_executor.js --loop` acquires/refreshes/releases `executor_singleton.lock.json` via `executor_singleton_guard.js`; refuses duplicate loop startup when lock is fresh; regression-guarded by `test_executor_singleton_guard.js`. **Remaining:** JSON lock is not an OS advisory lock; race window remains if two loops start simultaneously on a stale/missing lock; no automatic PID enforcement. |
| **Possible solution** | Unified state module: append via temp-file rename, advisory file locks, single writer process, or small embedded state service. |
| **Dependencies** | TracktaOS process model decision; migration of all readers/writers to one API. |

---

### Ambiguous on-chain outcomes require manual reconciliation (partially resolved — Sprint 2 M6a)

| Field | Detail |
|-------|--------|
| **Description** | Submission unknown, confirmation unknown, and fill parse failure append to `pending_reconciliation.jsonl`. |
| **Impact** | Double-submit if operator retries blindly; position ledger diverges from wallet; funds moved but bot state wrong. |
| **Status** | **Partially resolved** (2026-06-22, Sprint 2 M6a). Dashboard read-only reconciliation panel lists queue rows and truth snapshot cards; links `RECONCILIATION_RUNBOOK.md`. No retry or auto-triage. |
| **Possible solution** | M6 panel polish; automated txSig status polling; block automation when unresolved rows exist (A6). |
| **Dependencies** | Dedicated RPC; `RECONCILIATION_RUNBOOK.md` procedures; operator training. |

---

### DexScreener-only pricing for entries and exits

| Field | Detail |
|-------|--------|
| **Description** | Monitor and executor trigger target/stop/timeout on DexScreener USD pair price without cross-check against Jupiter sell quote or pool reserves. |
| **Impact** | Late or wrong exits; false `NEEDS_REVIEW` or missed stops; live slippage exceeds nominal −5% stop while signal appears correct. |
| **Possible solution** | Multi-source price sanity before exit; widen anomaly guard when sources diverge; optional Jupiter quote confirmation step. |
| **Dependencies** | Jupiter API availability; latency budget in 60s monitor loop. |

---

### Emergency stop halts automated exits

| Field | Detail |
|-------|--------|
| **Description** | `emergencyStop: true` stops `manageOpenPositions` and monitor-mirrored exits until `reset_live_safety.js`. By design, but operationally hazardous. |
| **Impact** | Open live bag during crash with no bot-driven exit path; manual sell required under stress. |
| **Possible solution** | Graduated halt levels (entries-only vs full halt); documented manual exit checklist; optional "exit-only" break-glass mode with extra confirmation. |
| **Dependencies** | Product decision on kill-switch semantics; live authorization review. |

---

## High Priority

Serious reliability, false-confidence, or migration blockers — urgent before live trading or multi-operator production.

---

### ~~`live_trades.json` vs `live_trades.jsonl` split~~ (resolved — Sprint 1 Q5)

| Field | Detail |
|-------|--------|
| **Description** | Root `dashboard_server.js` now resolves `LIVE_TRADES_FILE` to `liveExecutor.FILES.LIVE_TRADES_FILE` with fallback to `live_trades.jsonl`, matching `live_executor.js` v2. Archive copies may still reference `.json`; do not run those. |
| **Impact** | Was: operators saw stale/empty live history in some checks. |
| **Status** | **Resolved** (2026-06-21, Sprint 1 Q5). |
| **Note** | If a local orphan `live_trades.json` exists with history not in `.jsonl`, merge manually — executor does not read `.json`. |

---

### Thesis/scanner filter drift without handoff visibility

| Field | Detail |
|-------|--------|
| **Description** | Scanner logs score ≥ 79, MC ≤ $2.5M, bot ≤ 10%, top-10 ≤ 30%. Executor thesis: score 80–89, MC ≤ $250k, bot < 5%, top-10 10–20%. Not tagged on every scanner row. |
| **Impact** | Paper stats overstate live-eligible edge; pipeline observes `non_thesis_observation` candidates without obvious dashboard distinction. |
| **Status** | **Partially resolved** (2026-06-22, Sprint 2 M1+M2). Scanner now persists `thesisMatch: bool` and `thesisFailureReasons: string[]` on all new `paper_trades.json` and `pipeline_candidates.jsonl` rows using executor-matching bounds. Dashboard `thesisPanel()` reads the persisted field (falls back to recomputation for historical rows, labeled as estimated). Pipeline observations in audit tail segmented by `thesisMatch`. Historical rows (pre-M1) remain estimated. |
| **Possible solution** | Full resolution: allow historical bound divergence to age out; or unified thesis bounds module (Sprint 3+). |
| **Dependencies** | Scanner + executor + dashboard alignment; no live blockers (live already enforces thesis). |

---

### Duplicate code trees (`automation/`, `hardreset/`, `harness/`, `files/`, `phase1_files/`)

| Field | Detail |
|-------|--------|
| **Description** | Full or partial copies of executor, monitor, dashboard, config live in archive folders beside canonical root scripts. |
| **Impact** | Fixes applied to wrong tree; tests pass against wrong copy; migration packages wrong code. |
| **Possible solution** | Quarantine archives outside active package; add `ACTIVE_MANIFEST.md`; read-only markers on duplicates. |
| **Dependencies** | TracktaOS packaging scope; provenance review of each folder. |

---

### ~~No CI test harness for safety gates~~ (resolved — Sprint 1 Q7)

| Field | Detail |
|-------|--------|
| **Description** | `.github/workflows/safety-tests.yml` runs `npm ci` and `npm test` on push and pull_request to `main` (Node 20). Same four-script suite as local `run_safety_tests.js`. |
| **Impact** | Was: safety regressions could merge without automated checks. |
| **Status** | **Resolved** (2026-06-22, Sprint 1 Q7). |
| **Note** | Branch protection requiring the workflow check is optional repo admin configuration. |

---

### ~~`start_fomo.ps1` hardcoded wrong project path~~ (resolved — Sprint 1 Q1/Q2)

| Field | Detail |
|-------|--------|
| **Description** | Ops scripts used a hardcoded `C:\Users\nalle\sol-momentum-bot` path instead of the current workspace. |
| **Impact** | Was: processes launched in wrong directory or failed; operator believed bot was running when it was not. |
| **Status** | **Resolved** (Sprint 1 Q1/Q2). `start_fomo.ps1` defaults `$ProjectPath` to `$PSScriptRoot` and validates `live_config.json` before launch (`3b98588`). `fomo_status.ps1` uses the same path resolution (`b4e5949`). |
| **Note** | Ops scripts accept optional `-ProjectPath`; default is repo root where the script lives. |

---

### Unauthenticated dashboard mutates live config

| Field | Detail |
|-------|--------|
| **Description** | `dashboard_server.js` on port 3000 toggles `automationEnabled` and related config via three config-control POST routes (`/control/start`, `/control/stop`, `/control/emergency`). **A2j (2026-06-23):** those routes are wrapped by a fail-closed auth guard — `DASHBOARD_CONTROL_TOKEN` env var plus `X-Trackta-Control-Token` request header. Missing/empty env, missing header, wrong token, or query-string token all deny with a generic message; denied requests do not mutate config or write audit/control events. **A2k (2026-06-23):** `test_dashboard_auth_behavior.js` adds isolated HTTP behavioral tests on a random localhost port with temp fixtures (`TRACKTA_RUNTIME_ROOT`); proves read-only GET access, auth denials, and authorized fixture-only mutations without touching real `live_config.json`. **A2j does not add recovery execution.** Plain HTML START/STOP/EMERGENCY forms do not send the header — use a header-capable client (see [OPERATIONS.md](./OPERATIONS.md) → Dashboard Control Auth). Control-surface inventory: [A2G_DASHBOARD_AUTH_READINESS_REVIEW.md](./A2G_DASHBOARD_AUTH_READINESS_REVIEW.md). **`test_dashboard_auth_guards.js`** + **`test_dashboard_auth_behavior.js`** are active in `run_safety_tests.js` (10/10). Recovery execution remains blocked pending recovery audit, stronger validation, and explicit approval. |
| **Impact** | Anyone on host can arm entries or confuse automation state; shared-machine risk. **Reduced by A2j** when `DASHBOARD_CONTROL_TOKEN` is set to a strong secret and kept out of URLs/logs/repo; without the env var, mutation routes fail closed. |
| **Status** | **Auth wrapper resolved for config-control POST routes** (2026-06-23, Sprint 4 A2j/A2k). **Recovery audit writer implemented** (2026-06-23, Sprint 4 A2m). **A2n:** recovery execution **NOT READY** for high-risk actions. **A2o–A2r:** design, route guards, fake harness, behavioral tests complete — see [A2R_REVIEW.md](./A2R_REVIEW.md). **A2s (2026-06-23):** limited low-risk recovery plan/confirm routes (`POST /recovery/plan/:actionId`, `POST /recovery/confirm/:actionId`) with auth + audit + typed confirmation; **simulated execution only** (no real process spawn/kill). Milestone complete — see [A2S_REVIEW.md](./A2S_REVIEW.md). **A2t (2026-06-23):** post-action review — **stop at simulated routes**; real process start **DEFERRED** — see [A2T_POST_ACTION_RECOVERY_REVIEW.md](./A2T_POST_ACTION_RECOVERY_REVIEW.md). Allowed: `restart-scanner`, `restart-paper-monitor`, `restart-wallet-monitor`, `restart-dashboard`. **Excluded:** executor, panic reset, emergencyStop clear, live promotion, arbitrary commands. **No dashboard recovery buttons.** **`recovery_actions.jsonl` at repo root remains absent** unless an approved caller appends during authenticated recovery confirm under normal runtime. See [A2O_HUMAN_CONFIRMED_RECOVERY_DESIGN_PLAN.md](./A2O_HUMAN_CONFIRMED_RECOVERY_DESIGN_PLAN.md). |
| **Possible solution** | Localhost bind + auth token; confirm dialog for START; full file-watch / pre-save diff capture for manual edits. |
| **Dependencies** | TracktaOS UI security model; operator workflow preferences. |

---

### Paper win rate mistaken for live edge

| Field | Detail |
|-------|--------|
| **Description** | Paper ignores fees, slippage, failed txs, MEV, and partial fills. Pipeline dry-run does not submit transactions. |
| **Impact** | Premature live approval; strategy tuning on non-executable metrics. |
| **Status** | **Partially resolved** (2026-06-22, Sprint 2 M8). Dashboard read-only **Promotion Checklist** panel (`promotionChecklistPanel()`) groups gates by Sprint 2 / Sprint 3 / Pre-Live with PASS / OPEN / DEFERRED / FAIL states and runtime probes (`computeLiveArmedStatus()`, `scanner_health.json`, reconciliation queue, persisted thesis rows, CI workflow presence). Overall status is **NOT READY FOR LIVE PROMOTION** by default; never displays "READY FOR LIVE". Banner and footer state the panel is informational only and that humans authorize. Promotion narrative now visible without reading executor source. Full paper/pipeline/live cost modelling (A5) and human authorization workflow remain open. |
| **Possible solution** | Separate reporting for paper / pipeline / live; simulation replay via `simulate_live_executor.js`; explicit promotion checklist. |
| **Dependencies** | `LIVE_AUTHORIZATION_RECORD.md`; engineering review sign-off culture. |

---

### Daily stop blocks entries only

| Field | Detail |
|-------|--------|
| **Description** | `maxDailyLossCount` and `maxDailyLossSol` gate new entries after thresholds; single trade can exceed daily loss budget. |
| **Impact** | Risk limit appears tighter than it is; one rug exceeds −0.10 SOL without preventing the loss itself. |
| **Possible solution** | Document clearly; optional per-trade max loss via position size cap (already small); intraday exposure monitor. |
| **Dependencies** | Risk policy decision; wallet monitor enhancements. |

---

## Medium Priority

Material tech debt affecting operability, data quality, or migration speed — lower immediate capital risk in `PIPELINE_DRY_RUN`.

---

### `.json` extension on JSONL ledgers

| Field | Detail |
|-------|--------|
| **Description** | `paper_trades.json`, `near_misses.json` are JSONL despite `.json` extension. |
| **Impact** | Validators and tooling fail; onboarding confusion; incorrect editor formatting. |
| **Possible solution** | Rename to `.jsonl` with migration script; update all readers. |
| **Dependencies** | Scanner, monitor, analysis scripts, dashboard paths. |

---

### In-memory observation dedup partially lost on restart (partially resolved — Sprint 2 M3)

| Field | Detail |
|-------|--------|
| **Description** | Intent dedup seeds from `execution_audit.jsonl`; pair cooldown timestamps lived in memory (`observedPipelinePairTimestamps`) only. |
| **Impact** | Restart could repeat pipeline observations in the crash window between memory mark and audit write. |
| **Status** | **Partially resolved** (2026-06-22, Sprint 2 M3; **R3 atomic writes 2026-06-23**). Executor persists `observation_dedup.json` (`observedKeys`, `pairLastObservedMs`) on dedup mutation via `observation_dedup_store.js` (temp → validate → atomic rename); startup seed merges audit replay ∪ snapshot (union keys, max pair timestamps). Corrupt snapshots are not auto-deleted on load (default empty in-memory view + error log). Dual concurrent executor loops partially mitigated at startup by R5 singleton lock; simultaneous start race remains possible. |
| **Possible solution** | Advisory locks for concurrent writers; dedup metrics in dashboard (M4+). |
| **Dependencies** | Single executor loop recommended; audit completeness. |

---

### live_positions.json ownership/atomicity (partially resolved — Sprint 4 R4)

| Field | Detail |
|-------|--------|
| **Description** | `live_positions.json` holds open live position snapshots. Prior to R4, executor used synchronous `writeFileSync` full replace (non-atomic). |
| **Impact** | Crash mid-write or torn read could yield parse errors, empty position view, or inconsistent open-position state — higher real-money risk than dedup cache. |
| **Status** | **Partially resolved** (2026-06-23, Sprint 4 R4). Executor is sole production writer via `live_positions_store.js` (temp → fsync → validate → atomic rename); dashboard, `reset_live_safety.js`, and `validate_live_system.js` read only; regression-guarded by `test_live_positions_atomic.js` + `test_ownership_guards.js`. On-disk shape remains legacy JSON **array** of position objects. Corrupt files are not auto-deleted on load (default empty in-memory view + error log). Dual concurrent executor loops partially mitigated at startup by R5 singleton lock; simultaneous start race and non-loop modes remain documented limitations. See [R4_LIVE_POSITIONS_ATOMICITY_REVIEW.md](./R4_LIVE_POSITIONS_ATOMICITY_REVIEW.md). |
| **Possible solution** | Advisory locks for concurrent writers; reconciliation panel cross-checks with wallet (M6+). |
| **Dependencies** | Single executor loop recommended. |

---

### GMGN CLI subprocess fragility (partially resolved — Sprint 2 M4)

| Field | Detail |
|-------|--------|
| **Description** | Blocking `execSync` with 30s timeout, `shell: true`, no circuit breaker or structured retry. |
| **Impact** | Silent scanner degradation; missed candidates; operator sees empty scans. |
| **Status** | **Partially resolved** (2026-06-22, Sprint 2 M4). Scanner writes `scanner_health.json` each cycle (`lastScanAt`, interval results, funnel stats, error counters). Dashboard read-only scanner health panel distinguishes HEALTHY / DEGRADED / STALLED / NO DATA and quiet market vs GMGN failure. CLI fragility and retries remain. |
| **Possible solution** | Structured API client with retries, backoff, circuit breaker; M5 process heartbeats. |
| **Dependencies** | GMGN availability in TracktaOS runtime; API terms. |

---

### No process supervisor or health checks (partially resolved — Sprint 3 M5 + Sprint 4 A2a/A2b)

| Field | Detail |
|-------|--------|
| **Description** | Multi-process bot relies on manual PowerShell windows; no liveness probes or auto-restart. The dashboard `systemStatusPanel()` previously hardcoded `MONITOR=RUNNING`, `FOLLOWUP=RUNNING`, `DASHBOARD=ACTIVE` regardless of real state — a false-confidence surface. |
| **Impact** | Silent process death overnight; stale open paper trades; missed pipeline cycles. Operators could not distinguish alive from dead components. |
| **Status** | **Partially resolved** (2026-06-22, Sprint 3 M5 + Sprint 4 A2a/A2b/A2c preview). **M5:** read-only **Process Heartbeats** panel (`processHeartbeatPanel()`) classifies Scanner, Executor, Wallet Monitor, Paper Monitor, and Dashboard as **HEALTHY / STALE / MISSING / NO DATA** from existing artifacts (scanner_health.json `lastScanAt`, execution_audit.jsonl `CYCLE_END` derived, wallet_status.json `updatedAt`, paper_positions.json mtime proxy, dashboard self); stale thresholds ≈ 2× cadence (120/150/90/150/90s); hardcoded RUNNING/ACTIVE rows replaced. **A2a (advisory, A2 Level 1):** read-only **Supervisor Recommendations** panel (`supervisorRecommendationsPanel()`) maps each process's health to symptoms, likely causes, a recommended operator action, and an escalation level, supporting **HEALTHY / STALE / MISSING / NO DATA / DEGRADED / FAILED** (DEGRADED derived from existing M4/A4 signals; FAILED policy-defined, not auto-derived — no PID checks). **A2b (recovery advisor):** a nested read-only **Recovery Advisor** (`recoveryAdvisorSection()`) adds, per unhealthy process+state, a severity, operator-readable diagnosis, numbered manual recovery steps (plain command **text**), verification steps, escalation, a runbook reference (`docs/OPERATIONS.md` → Restart After Crashes; `docs/MODE_TRANSITION.md`), and a "Do not automate" reminder. **A2c (preview-only UI, Sprint 4):** read-only **Recovery Action Preview** (`recoveryActionPreviewSection()`) shows future human-confirmed command previews, eligibility, pre/post checks, and forbidden actions — **no execution, no buttons, no POST routes, no recovery_actions.jsonl writes**. **Still no process recovery execution** — restart/stop/spawn/kill remain human/manual in a terminal. Pre-existing config POST routes (`/control/start`, `/control/stop`, `/control/emergency`) unchanged and separate. Autonomous recovery (A2e) not built. |
| **Possible solution** | TracktaOS supervisor with heartbeat files, restart policy, alert on stale audit timestamps (A2 Levels 2–3, per [A2_SUPERVISOR_PLAN.md](./A2_SUPERVISOR_PLAN.md)). |
| **Dependencies** | TracktaOS Phase 1 stabilization; `fomo_status.ps1` enhancement; A2 supervisor (Sprint 4) for human-confirmed/autonomous recovery. |
| **A2d soak (Sprint 4)** | **Accelerated validation complete — PASS WITH RISK ACCEPTED** (2026-06-23). Full **72-hour soak was not completed**; operator accepted abbreviated evidence (~1h, CP0–CP4). Review: [A2D_SOAK_REVIEW.md](./A2D_SOAK_REVIEW.md). Plan: [A2D_SOAK_VALIDATION_PLAN.md](./A2D_SOAK_VALIDATION_PLAN.md). **R6 follow-on:** [R6_72_HOUR_DRY_RUN_SOAK_PLAN.md](./R6_72_HOUR_DRY_RUN_SOAK_PLAN.md) defines the preferred **72-hour** post-A2/R3/R4/R5 dry-run soak (observation only; not started). Consolidated gap review: [STATE_DURABILITY_AND_LIVE_READINESS_GAP_REVIEW.md](./STATE_DURABILITY_AND_LIVE_READINESS_GAP_REVIEW.md). Runbook: [OPERATIONS.md](./OPERATIONS.md) → **A2d Soak Operation**. Checkpoints: [A2D_SOAK_CHECKPOINT_LOG.md](./A2D_SOAK_CHECKPOINT_LOG.md). **A2d/R6 do not authorize recovery execution, buttons, or live trading.** |

---

### A2d soak observation hazards (Sprint 4 — operational, not blockers)

| Hazard | Detail |
|--------|--------|
| **Dashboard does not hot-reload** | `node dashboard_server.js` loads HTML into memory at startup. After `dashboard_server.js` changes, an old process on port 3000 may still serve pre-A2a/A2b HTML (Process Heartbeats visible, Supervisor Recommendations missing). **Fix:** restart dashboard only; hard-refresh browser. See [OPERATIONS.md](./OPERATIONS.md) → A2d Soak Operation. |
| **Duplicate process sets** | Two concurrent scanner/monitor/executor/wallet windows (e.g. old + new `start_fomo.ps1`) muddy soak evidence and can reintroduce race risk. **R5 (2026-06-23):** `live_executor.js --loop` now refuses a second loop when `executor_singleton.lock.json` is fresh; no process killing is performed. See [R5_SINGLETON_EXECUTOR_GUARD_REVIEW.md](./R5_SINGLETON_EXECUTOR_GUARD_REVIEW.md). Confirm a single canonical set before continuing checkpoints; record cleanup in the log. Do not delete the lock unless no executor loop is running. |
| **Paper Monitor STALE ≠ panic** | M5 uses `paper_positions.json` **mtime as a proxy**. With no open paper trades, the monitor may be alive but quiet — STALE is expected. A2b labels this **Low** severity with "may be quiet, not dead." Do not treat as FAILED or auto-restart during A2d unless the monitor terminal is actually stopped. |
| **Abbreviated A2d evidence** | Full 72-hour soak was **shortened by operator risk acceptance** (~1h checkpoints). See [A2D_SOAK_REVIEW.md](./A2D_SOAK_REVIEW.md). Long-duration false positives and overnight behavior remain unproven. |
| **R6a 24-hour minimum soak (Sprint 4)** | Operator selected **24 hours** as minimum accepted soak duration (explicit risk acceptance) instead of preferred **72 hours**. **Reduced confidence** vs 72h — overnight and quiet-period behavior remain less proven. Checkpoint tooling (`soak_checkpoint.js`, `run_24h_soak_checkpoints.js`) collects read-only evidence under `soak_runs/` only; **does not approve live trading**, execute recovery, or mutate runtime trading state. Plan: [R6_72_HOUR_DRY_RUN_SOAK_PLAN.md](./R6_72_HOUR_DRY_RUN_SOAK_PLAN.md) §16. Runbook: [OPERATIONS.md](./OPERATIONS.md) → **R6a 24-hour Dry-run Soak Checkpoints**. **Status (2026-06-28): 24h soak COMPLETE — overall PASS** (`soak_runs/r6a_24h_soak_summary.json`). |
| **R7 strategy / edge review (Sprint 4)** | **COMPLETE — NOT ENOUGH DATA** (2026-06-28). R6a soak window produced **1 closed paper trade** during quiet market; insufficient post-soak edge proof. Historical paper (178 closes, PF ~1.47, 41% win rate) is **promising but paper-only** and **not live-ready**. Review: [R7_STRATEGY_PERFORMANCE_EDGE_REVIEW.md](./R7_STRATEGY_PERFORMANCE_EDGE_REVIEW.md). **Does not approve live trading.** |
| **R8A micro-live engineering proof plan (Sprint 4)** | **DEFINED — ENGINEERING PROOF ONLY** (2026-06-28). Operator fast-track for operational demo capability **despite R7 NOT ENOUGH DATA** — **does not bypass R7 edge findings** or approve live trading. `micro_live_preflight.js` read-only preflight. Review: [R8A_MICRO_LIVE_ENGINEERING_PROOF_PLAN.md](./R8A_MICRO_LIVE_ENGINEERING_PROOF_PLAN.md). |
| **Track A micro-live hard guardrails** | **BUILT — GUARDRAIL INFRASTRUCTURE ONLY** (2026-06-23). `micro_live_caps.js` + `micro_live_guardrails.js` load/validate operator caps and enforce read-only prebuild checks — writes `analysis/micro_live_guardrails_check.json` only; **does not arm, sign, submit, or approve live trading**; R7 edge **NOT ENOUGH DATA** not bypassed. Review: [TRACK_A_MICRO_LIVE_GUARDRAILS.md](./TRACK_A_MICRO_LIVE_GUARDRAILS.md). |
| **R7b strategy data collection (Sprint 4)** | **PLAN COMPLETE — collection IN PROGRESS.** Defines fresh-sample thresholds before R8/R9 progression. Plan: [R7B_STRATEGY_DATA_COLLECTION_PLAN.md](./R7B_STRATEGY_DATA_COLLECTION_PLAN.md). **Does not approve live trading.** |
| **R8 risk controls review (Sprint 4)** | **COMPLETE — RISK CONTROLS DEFINED BUT NOT ARMED** (2026-06-28). Proposed micro-live research budget and loss caps documented only — **not active in live_config.json**. Operator willingness to use research funds **does not approve live or micro-live trading**. Review: [R8_RISK_CONTROLS_REVIEW.md](./R8_RISK_CONTROLS_REVIEW.md). Status: `node r8_risk_controls_check.js`. **Recommended next gate:** continue R7b → R10. |
| **R9 wallet/signer security review (Sprint 4)** | **COMPLETE — WALLET SECURITY DESIGN DEFINED BUT NOT CONNECTED** (2026-06-28). Documents wallet model, signer handling policy, and logging boundaries only — **no wallet connected**, **no signing material handled**, **does not approve live or micro-live trading**. Review: [R9_WALLET_SIGNER_SECURITY_REVIEW.md](./R9_WALLET_SIGNER_SECURITY_REVIEW.md). Status: `node r9_wallet_security_check.js`. |
| **R10 live execution path review (Sprint 4)** | **COMPLETE — READY FOR SIGNER SIMULATION HARNESS** (2026-06-28). Documents future live execution lifecycle and agreement gates; `signer_simulation_harness.js` provides **fake-only** signer lifecycle — **no real wallet, no real submission, does not approve live or micro-live trading**. Review: [R10_LIVE_EXECUTION_PATH_REVIEW.md](./R10_LIVE_EXECUTION_PATH_REVIEW.md). |
| **R11 emergency stop validation (Sprint 4)** | **COMPLETE — EMERGENCY STOP VALIDATED IN SIMULATION ONLY** (2026-06-28). Proves emergency-stop blocking via fake harness — **no live drill, does not approve live or micro-live trading**. Review: [R11_EMERGENCY_STOP_VALIDATION.md](./R11_EMERGENCY_STOP_VALIDATION.md). |
| **R12 micro-live readiness checklist (Sprint 4)** | **CLOSED — CHECKLIST DEFINED BUT BLOCKED** (2026-06-28). Gate sequence aligned with R13/R14; **1 SOL wallet is operational liquidity, not authorized active risk**; proposed session cap **0.05 SOL**. Review: [R12_MICRO_LIVE_READINESS_CHECKLIST.md](./R12_MICRO_LIVE_READINESS_CHECKLIST.md). Status: `node r12_micro_live_readiness_check.js`. |
| **R13 final micro-live approval gate (Sprint 4)** | **DEFINED — FINAL APPROVAL GATE DEFINED BUT BLOCKED** (2026-06-28). Research-exception framework; **1 SOL wallet is operational liquidity, not fully authorized risk**; proposed session cap **0.05 SOL**. Review: [R13_FINAL_MICRO_LIVE_APPROVAL_GATE.md](./R13_FINAL_MICRO_LIVE_APPROVAL_GATE.md). |
| **R14 slippage / MEV protection review (Sprint 4)** | **COMPLETE — SLIPPAGE / MEV REVIEW DEFINED — NOT IMPLEMENTED** (2026-06-28). Draft slippage, price impact, quote freshness, priority fee, and MEV policies; `r14_slippage_mev_review.js` evaluates fixtures only — **does not approve live trading**. Review: [R14_SLIPPAGE_MEV_PROTECTION_REVIEW.md](./R14_SLIPPAGE_MEV_PROTECTION_REVIEW.md). |
| **R15 manual approval record / session runbook (Sprint 4)** | **DEFINED — MANUAL APPROVAL RUNBOOK DEFINED — LIVE STILL BLOCKED** (2026-06-28). Written approval template and session runbook; default status **NOT APPROVED**; `r15_manual_approval_check.js` never auto-approves. Review: [R15_MANUAL_APPROVAL_RECORD_AND_SESSION_RUNBOOK.md](./R15_MANUAL_APPROVAL_RECORD_AND_SESSION_RUNBOOK.md). |
| **R16 micro-live implementation gap review (Sprint 4)** | **COMPLETE — IMPLEMENTATION GAPS IDENTIFIED — LIVE BLOCKED** (2026-06-28). Code/config/signer/wallet/slippage/MEV gaps enumerated; `r16_micro_live_gap_check.js` read-only — **does not implement or approve live trading**. Review: [R16_MICRO_LIVE_IMPLEMENTATION_GAP_REVIEW.md](./R16_MICRO_LIVE_IMPLEMENTATION_GAP_REVIEW.md). |
| **R17 simulated micro-live config + approval harness (Sprint 4)** | **BUILT — SIMULATED HARNESS BUILT — LIVE STILL BLOCKED** (2026-06-28). Fake example config/approval; `r17_simulated_micro_live_harness.js` validates simulation only — **never auto-approves live**. Review: [R17_SIMULATED_MICRO_LIVE_CONFIG_AND_APPROVAL_HARNESS.md](./R17_SIMULATED_MICRO_LIVE_CONFIG_AND_APPROVAL_HARNESS.md). |
| **R18 shadow-quote design review (Sprint 4)** | **COMPLETE — SHADOW-QUOTE DESIGN DEFINED — NOT ACTIVE** (2026-06-28). Fixture-based quote/slippage/route observation design; `r18_shadow_quote_review.js` — **no network polling, no signing, no submission**. Review: [R18_SHADOW_QUOTE_DESIGN_REVIEW.md](./R18_SHADOW_QUOTE_DESIGN_REVIEW.md). |
| **R19 shadow quote collection plan (Sprint 4)** | **DEFINED — SHADOW QUOTE COLLECTION PLAN DEFINED — NOT ACTIVE** (2026-06-28). Future real quote observation plan; `r19_shadow_quote_collection_check.js` — **polling NOT activated**. Review: [R19_SHADOW_QUOTE_COLLECTION_PLAN.md](./R19_SHADOW_QUOTE_COLLECTION_PLAN.md). |
| **R20 fixture dry-run shadow quote collector (Sprint 4)** | **BUILT — FIXTURE COLLECTOR BUILT — NETWORK POLLING STILL BLOCKED** (2026-06-28). Fixture-based collector reads `examples/shadow_quote_candidates.example.json`, writes `analysis/shadow_quote_observations.jsonl`; `r20_shadow_quote_collector.js` — **no network calls, no signing, no submission, never approves live**. Review: [R20_FIXTURE_DRY_RUN_SHADOW_QUOTE_COLLECTOR.md](./R20_FIXTURE_DRY_RUN_SHADOW_QUOTE_COLLECTOR.md). |
| **R21 real quote observation approval gate (Sprint 4)** | **DEFINED — REAL QUOTE OBSERVATION APPROVAL GATE DEFINED — POLLING NOT ACTIVE** (2026-06-28). Explicit approval requirements before future network quote polling; `r21_real_quote_observation_approval_check.js` — **does not activate polling, sign, submit, or connect wallet**. Review: [R21_REAL_QUOTE_OBSERVATION_APPROVAL_GATE.md](./R21_REAL_QUOTE_OBSERVATION_APPROVAL_GATE.md). |
| **R22 real quote observation collector (Sprint 4)** | **BUILT — REAL QUOTE COLLECTOR SKELETON BUILT — DISABLED BY DEFAULT** (2026-06-28). Disabled-by-default collector skeleton; `r22_real_quote_observation_collector.js` — **no network calls, no polling activation, never approves live**. Review: [R22_REAL_QUOTE_OBSERVATION_COLLECTOR_DISABLED.md](./R22_REAL_QUOTE_OBSERVATION_COLLECTOR_DISABLED.md). |
| **R23 real provider implementation review (Sprint 4)** | **DEFINED — REAL PROVIDER IMPLEMENTATION DESIGN DEFINED — NOT ACTIVE** (2026-06-28). Safe provider integration design; combined check via `r23_r25_provider_gate_check.js`. Review: [R23_REAL_PROVIDER_IMPLEMENTATION_REVIEW.md](./R23_REAL_PROVIDER_IMPLEMENTATION_REVIEW.md). |
| **R24 disabled provider adapter skeleton (Sprint 4)** | **BUILT — DISABLED PROVIDER ADAPTER SKELETON BUILT — NETWORK OFF** (2026-06-28). Fixture/replay only; Jupiter/GMGN stubs disabled; `r24_provider_adapter_skeleton.js`. Review: [R24_DISABLED_PROVIDER_ADAPTER_SKELETON.md](./R24_DISABLED_PROVIDER_ADAPTER_SKELETON.md). |
| **R25 activation approval record (Sprint 4)** | **DEFINED — ACTIVATION APPROVAL RECORD DEFINED — NOT APPROVED** (2026-06-28). Default NOT_APPROVED; `networkPollingAllowed: false`. Review: [R25_REAL_QUOTE_OBSERVATION_ACTIVATION_APPROVAL_RECORD.md](./R25_REAL_QUOTE_OBSERVATION_ACTIVATION_APPROVAL_RECORD.md). |
| **R26 activation review (Sprint 4)** | **DEFINED — ACTIVATION REVIEW DEFINED — NOT ACTIVATED** (2026-06-28). Pre-activation checklist; `r26_r27_activation_shadow_design_check.js`. Review: [R26_REAL_QUOTE_OBSERVATION_ACTIVATION_REVIEW.md](./R26_REAL_QUOTE_OBSERVATION_ACTIVATION_REVIEW.md). |
| **R27 shadow execution design (Sprint 4)** | **DEFINED — SHADOW EXECUTION DESIGN DEFINED — NO EXECUTION ACTIVE** (2026-06-28). Simulated trade decisions from quotes — design only, no wallet/sign/submit. Review: [R27_SHADOW_EXECUTION_DESIGN.md](./R27_SHADOW_EXECUTION_DESIGN.md). |
| **R28 manual quote observation decision session (Sprint 4)** | **DEFINED — MANUAL QUOTE OBSERVATION DECISION SESSION DEFINED — NOT APPROVED** (2026-06-23). Operator checklist and decision record; default HOLD / NOT_DECIDED; `r28_manual_quote_observation_decision_check.js` — **does not activate polling, sign, submit, or connect wallet**. Review: [R28_MANUAL_QUOTE_OBSERVATION_DECISION_SESSION.md](./R28_MANUAL_QUOTE_OBSERVATION_DECISION_SESSION.md). |
| **R29 real quote observation activation (Sprint 4)** | **IMPLEMENTED — REAL QUOTE OBSERVATION IMPLEMENTED — TRADING STILL BLOCKED** (2026-06-23). Gated observer `r29_real_quote_observer.js` — default DISABLED; `--observe-once` with approval only; **does not trade, sign, submit, or connect wallet**. Review: [R29_REAL_QUOTE_OBSERVATION_ACTIVATION_IMPLEMENTATION.md](./R29_REAL_QUOTE_OBSERVATION_ACTIVATION_IMPLEMENTATION.md). |
| **R29a Jupiter quote endpoint migration (Sprint 4)** | **PATCHED** (2026-06-23). Observer migrated from deprecated `quote-api.jup.ag` to quote-only base `https://lite-api.jup.ag/swap/v1/quote`. Endpoint policy `QUOTE_ONLY`; trading/signing/submission/wallet remain blocked. |
| **R30 real quote observation results review (Sprint 4)** | **COMPLETE — FIRST REAL QUOTE OBSERVATION REVIEWED — ROUTE REJECTED BY POLICY** (2026-06-23). First R29 observation reviewed; 300 bps slippage rejected by R18 policy; `r30_quote_observation_results_review.js` — **analysis-only; does not approve trading**. Review: [R30_REAL_QUOTE_OBSERVATION_RESULTS_REVIEW.md](./R30_REAL_QUOTE_OBSERVATION_RESULTS_REVIEW.md). |
| **R31-R32 quote observation hardening + batch plan (Sprint 4)** | **COMPLETE / DEFINED** (2026-06-23). Requested vs realized slippage separated; default 100 bps; manual batch plan max 3 candidates; `r31_r32_quote_observation_hardening_check.js` — **does not approve trading or continuous polling**. Review: [R31_QUOTE_OBSERVATION_HARDENING.md](./R31_QUOTE_OBSERVATION_HARDENING.md) · [R32_ADDITIONAL_OBSERVATION_BATCH_PLAN.md](./R32_ADDITIONAL_OBSERVATION_BATCH_PLAN.md). |
| **R33 clean quote observation review (Sprint 4)** | **COMPLETE — CLEAN QUOTE OBSERVATION REVIEWED — TRADING STILL BLOCKED** (2026-06-23). Schema v2 validation; distinguishes legacy v1 records; `r33_clean_quote_observation_review.js` — **review-only; does not approve trading**. Review: [R33_CLEAN_QUOTE_OBSERVATION_REVIEW.md](./R33_CLEAN_QUOTE_OBSERVATION_REVIEW.md). |
| **R34 small manual quote batch review (Sprint 4)** | **DEFINED — SMALL MANUAL QUOTE BATCH REVIEW DEFINED — OBSERVATION ONLY** (2026-06-23). Manual batch plan max 3 candidates; `--observe-once` only; `r34_manual_quote_batch_review.js` — **review/planning only; does not approve trading or activate polling**. Review: [R34_SMALL_MANUAL_QUOTE_OBSERVATION_BATCH_REVIEW.md](./R34_SMALL_MANUAL_QUOTE_OBSERVATION_BATCH_REVIEW.md). |
| **R35 quote batch results + shadow readiness (Sprint 4)** | **COMPLETE — QUOTE BATCH REVIEWED — READY FOR SHADOW EXECUTION HARNESS DESIGN** (2026-06-23). Reviews 3 schema v2 PASS observations; `r35_quote_batch_shadow_readiness.js` — **readiness review only; does not activate shadow execution**. Review: [R35_QUOTE_BATCH_RESULTS_AND_SHADOW_READINESS.md](./R35_QUOTE_BATCH_RESULTS_AND_SHADOW_READINESS.md). |
| **R36 shadow execution harness (Sprint 4)** | **BUILT — SHADOW EXECUTION HARNESS BUILT — SIMULATION ONLY** (2026-06-23). Simulated WOULD_ENTER/SKIP from schema v2 observations; `r36_shadow_execution_harness.js` — **simulation only; no wallet/signing/submission/position mutation**. Review: [R36_SHADOW_EXECUTION_HARNESS.md](./R36_SHADOW_EXECUTION_HARNESS.md). |
| **R37 shadow results + wallet setup readiness (Sprint 4)** | **COMPLETE — SHADOW RESULTS REVIEWED — READY FOR WALLET SETUP DESIGN ONLY** (2026-06-23). Reviews shadow decisions; filename-only repo secret scan; `r37_shadow_results_wallet_readiness.js` — **design readiness only; no private key handling**. Review: [R37_SHADOW_RESULTS_AND_WALLET_SETUP_READINESS.md](./R37_SHADOW_RESULTS_AND_WALLET_SETUP_READINESS.md). |
| **R38 research wallet + secret storage design (Sprint 4)** | **DEFINED — RESEARCH WALLET SECRET STORAGE DESIGN DEFINED — NO KEY HANDLED** (2026-06-23). Secret storage design + repo rules; `r38_research_wallet_secret_design_check.js` — **design only; no private key handling**. Review: [R38_RESEARCH_WALLET_SECRET_STORAGE_DESIGN.md](./R38_RESEARCH_WALLET_SECRET_STORAGE_DESIGN.md). |
| **Soak-period strategy sample gap** | R6a stability PASS does **not** imply strategy edge. Quiet-market soak intervals may yield **zero or one** paper closes — operators must not treat low activity as strategy failure or success without larger samples across active market periods. |
| **Paper ledger vs positions divergence** | `paper_trades.json` append-only ledger may retain stale `OPEN` rows while `paper_positions.json` shows closed lifecycle truth (22 OPEN ledger rows vs 0 open positions at R7 review). Use **positions store** for performance truth. |
| **`live_errors.jsonl` synthetic history** | **54 rows** (2026-06-12 → 2026-06-14) are **`test_execution_logging.js` synthetic failures** (`runId: execution-logging-test-*`, `Fake quote failed`). **Not soak incidents.** Operator tagged line 55 with `SYNTHETIC_HISTORY_BOUNDARY`. Ignore pre-boundary rows when reviewing soak error criteria or promotion gates. |
| **Orphan `live_trades.json`** | Local empty **`live_trades.json`** may coexist with canonical **`live_trades.jsonl`** (5 events). Executor/dashboard read `.jsonl` only. Divergence risk if orphan ever gains non-empty history — merge or remove manually. |
| **Dedicated RPC gap** | **Missing dedicated RPC** — pipeline observation allowed; live submission and promotion checklist **Dedicated RPC (A4)** remain **OPEN**. Not a soak blocker; required before live capital. |
| **A2c preview-only UI** | Dashboard **Recovery Action Preview** exists (`recoveryActionPreviewSection()`) — command text and eligibility only; **does not execute recovery**. Intentionally non-executing and now **regression-guarded** by `test_recovery_preview_guards.js` (part of `node run_safety_tests.js`, **15/15**): fails if the preview gains buttons/forms/POST routes/`spawn`/`exec`/`child_process`/`process.kill`/`recovery_actions.jsonl` writes, or if `app.post` routes drift from the three known config-control routes. Milestone complete — see [A2C_REVIEW.md](./A2C_REVIEW.md). Config-control auth is **resolved (A2j/A2k)**. **A2m (2026-06-23):** `recovery_audit.js` append-only writer + `test_recovery_audit.js` (temp fixtures only); **`recovery_actions.jsonl` at repo root remains absent** unless an approved caller explicitly appends. **A2n (2026-06-23):** [A2N_HUMAN_CONFIRMED_RECOVERY_EXECUTION_REVIEW.md](./A2N_HUMAN_CONFIRMED_RECOVERY_EXECUTION_REVIEW.md) — **recovery execution readiness: NOT READY**. **A2o (2026-06-23):** [A2O_HUMAN_CONFIRMED_RECOVERY_DESIGN_PLAN.md](./A2O_HUMAN_CONFIRMED_RECOVERY_DESIGN_PLAN.md) — low-risk allowlist/route/audit/harness design only. **A2p (2026-06-23):** `test_recovery_route_guards.js` — static recovery route boundary guards; **no recovery POST routes exist yet**. **A2q (2026-06-23):** `fake_recovery_harness.js` + `test_fake_recovery_harness.js` — test-only fake process model. **A2r (2026-06-23):** `fake_recovery_flow.js` + `test_low_risk_recovery_behavior.js` — behavioral tests prove future low-risk recovery lifecycle with fake harness and temp audit only. Milestone complete — see [A2R_REVIEW.md](./A2R_REVIEW.md). **A2s implementation still requires explicit human approval.** **Recovery execution remains blocked** — writer/harness/flow are not wired to dashboard buttons/routes. Milestone complete — see [A2M_REVIEW.md](./A2M_REVIEW.md). Schema/test design: [A2F_AUTH_RECOVERY_AUDIT_PLAN.md](./A2F_AUTH_RECOVERY_AUDIT_PLAN.md) · [A2L_RECOVERY_AUDIT_TEST_DESIGN.md](./A2L_RECOVERY_AUDIT_TEST_DESIGN.md). Do not treat preview eligibility as permission to act. |

---

### ~~`PIPELINE_DRY_RUN` skips open live position management~~ (documented — Sprint 1 Q8)

| Field | Detail |
|-------|--------|
| **Description** | Executor in `PIPELINE_DRY_RUN` intentionally does not call `manageOpenPositions`. Open live positions are not exited while in pipeline mode. |
| **Impact** | Flipping to `DRY_RUN` or `LIVE` without a runbook starts live position management on the next cycle — easy to misunderstand during transition. |
| **Status** | **Documented** — see **[MODE_TRANSITION.md](./MODE_TRANSITION.md)** (mode matrix, wind-down, pre-flip checklist). |
| **Note** | A future config guard remains optional (medium-term); Q8 is documentation only. |

---

### Post-fill slippage diagnostic only

| Field | Detail |
|-------|--------|
| **Description** | Pre-route validation protects entry; post-fill slippage exceeding caps logs anomaly but does not block. |
| **Impact** | Live fills worse than expected still close as normal trades; post-hoc discovery only. |
| **Possible solution** | Trusted USD fill source; optional halt-on-anomaly for live; richer `live_trades.jsonl` flags in dashboard. |
| **Dependencies** | Fill parse reliability; on-chain USD pricing strategy. |

---

### Env flag proliferation for live arming (partially resolved — Sprint 2 M7)

| Field | Detail |
|-------|--------|
| **Description** | Overlapping gates: `executionMode`, `dryRunMode`, `automationEnabled`, `FOMO_ENABLE_LIVE_SUBMISSION`, `FOMO_ALLOW_LOOP_LIVE`, `SOLANA_SIGNER_SECRET`, RPC env vars. |
| **Impact** | Operator error arming live partially; hard to audit "fully disarmed" state. |
| **Status** | **Partially resolved** (2026-06-22, Sprint 2 M7). `computeLiveArmedStatus()` mirrors `assertLiveSubmissionArmed` gates; exposed in `node live_executor.js --status` and dashboard automation panels. |
| **Possible solution** | M8 promotion checklist UI; optional env consolidation in a later sprint. |
| **Dependencies** | Backward compatibility with existing env contracts. |

---

### Runtime data mixed with source repository (partially resolved — Sprint 1 Q10)

| Field | Detail |
|-------|--------|
| **Description** | Large JSONL histories, backups, zip archives coexist with source in tree. |
| **Impact** | Bloated clones; accidental commit of operational history; unclear migration scope. |
| **Status** | **Partially resolved** (2026-06-22, Sprint 1 Q10). Root `.gitignore` now covers legacy runtime JSON and operator backups; `MIGRATION_NOTES.md` documents local-only data policy and optional future `data/` convention. |
| **Possible solution** | Physical `data/` directory outside git (TracktaOS packaging — future sprint). |
| **Dependencies** | TracktaOS data migration playbook (`MIGRATION_NOTES.md`). |

---

### Public RPC rate limits false negatives (partially resolved — Sprint 1 Q9, Sprint 3 A4)

| Field | Detail |
|-------|--------|
| **Description** | Wallet monitor and simulation fall back to public Solana RPC when Helius unset. |
| **Impact** | False wallet disconnect; aborted preflight; flaky pipeline observation — masks real issues. |
| **Status** | **Partially resolved** (2026-06-22, Sprint 1 Q9 + Sprint 3 A4). Q9: dashboard wallet/RPC health panels show RPC source labels and a public-fallback warning. A4: dashboard read-only **Dedicated RPC Readiness** block (`dedicatedRpcReadinessBlock()` / `classifyDedicatedRpcPosture()`) classifies posture as **DEDICATED_READY / PUBLIC_FALLBACK_OBSERVATION_ONLY / MISSING_DEDICATED_RPC / UNKNOWN**, separates observation (public tolerated) from simulation/execution/promotion (dedicated required), and the **Promotion Checklist** "Dedicated RPC (A4)" gate now moves DEFERRED → **PASS** (dedicated configured) / **OPEN** (missing). Execution-critical paths already refuse public fallback in `live_executor.js` (`requireDedicated`). Visibility only — no live enablement, no provider lock-in, no failover/retries. Missing dedicated RPC ≠ bot broken; it means infrastructure is not promotion-ready. |
| **Possible solution** | Provision a dedicated (non-public) endpoint; full pipeline-observation readiness enforcement remains future work. |
| **Dependencies** | Dedicated RPC (any non-public provider) provisioning in TracktaOS. |

---

## Low Priority

Hygiene, developer experience, and incremental improvements — address after higher tiers.

---

### ~~No npm test script integration~~ (resolved — Sprint 1 Q6)

| Field | Detail |
|-------|--------|
| **Description** | `npm test` runs `node run_safety_tests.js` (four core safety scripts). |
| **Status** | **Resolved** (2026-06-22, Sprint 1 Q6). |
| **Note** | `test_pipeline_candidate_handoff.js` calls `runCycle()` and expects committed `live_config.json` with `automationEnabled: true`; local changes from `reset_live_safety.js` can cause handoff failure until config is restored. |

---

### Legacy scanner scripts in root

| Field | Detail |
|-------|--------|
| **Description** | `scanner.js`, `scanner_v3.js`, `scanner_trending.js`, backups remain alongside active scanner. |
| **Impact** | Accidental execution pollutes ledgers. |
| **Possible solution** | Move to `archive/`; README pointer to `scanner_gmgn_trending.js` only. |
| **Dependencies** | Archive folder decision. |

---

### `live_trade_logger.js` overlap with executor logging

| Field | Detail |
|-------|--------|
| **Description** | Separate logging helper exists alongside executor-native `writeLiveEvent`. |
| **Impact** | Confusion about which logger is authoritative. |
| **Possible solution** | Deprecate or merge into executor; document single path. |
| **Dependencies** | Audit of callers. |

---

### Empty test directories required `.gitkeep`

| Field | Detail |
|-------|--------|
| **Description** | `tests/scanner/`, `tests/monitor/`, `tests/handoff/` needed placeholders for Git visibility. |
| **Impact** | Layout expectations vs empty repo — minor onboarding friction. |
| **Possible solution** | Add real tests per folder over time. |
| **Dependencies** | CI harness. |

---

### Wallet address in committed `live_config.json`

| Field | Detail |
|-------|--------|
| **Description** | Public wallet address checked into config template/instance. |
| **Impact** | Couples repo clone to specific operator wallet; not a secret but identity leakage. |
| **Possible solution** | `.env` or local override file for wallet address; example config with placeholder. |
| **Dependencies** | Dashboard + validator updates for env-first wallet. |

---

### No structured metrics export

| Field | Detail |
|-------|--------|
| **Description** | Cycle stats, abort codes, and PnL live in logs only — no `metrics.jsonl` or Prometheus sink. |
| **Impact** | Harder for Ori/TracktaOS intelligence layer to trend behavior. |
| **Possible solution** | Periodic metrics snapshot file or exporter sidecar. |
| **Dependencies** | TracktaOS Phase 2 wallet intelligence; Ori integration roadmap. |

---

## Future Architecture

Strategic gaps for cross-chain TracktaOS evolution — not blockers for Module 1 dry-run operation.

---

### No chain abstraction layer

| Field | Detail |
|-------|--------|
| **Description** | Solana mints, Jupiter endpoints, and GMGN CLI calls are inline strings throughout scanner and executor. |
| **Impact** | Every new chain duplicates safety logic; high migration cost to "opportunity engine" vision. |
| **Possible solution** | `ChainAdapter` interface; Solana as first implementation; config-driven chain ID. |
| **Dependencies** | Cross-chain schema; TracktaOS Phase 3 roadmap. |

---

### No unified versioned candidate schema

| Field | Detail |
|-------|--------|
| **Description** | Handoff fields are implicit conventions duplicated across scanner, tests, executor, and simulation. |
| **Impact** | Schema drift breaks handoff silently; cross-chain normalization impossible without rewrite. |
| **Possible solution** | Versioned `CandidateIntent` JSON Schema; validation on write and read. |
| **Dependencies** | State layer refactor; CI schema tests. |

---

### File-based IPC not suitable for multi-machine deployment

| Field | Detail |
|-------|--------|
| **Description** | Local filesystem coordination assumes single host — no network partition tolerance. |
| **Impact** | Cannot scale scanner and executor horizontally; blocks cloud-native TracktaOS without redesign. |
| **Possible solution** | Event bus or database-backed state; retain append-only audit semantics. |
| **Dependencies** | TracktaOS infrastructure choice; unified state layer (Critical file races fix). |

---

### GMGN + DexScreener + Jupiter coupling in one module

| Field | Detail |
|-------|--------|
| **Description** | Discovery, pricing, and execution providers are woven into monolithic scripts. |
| **Impact** | Swapping providers for other chains requires copy-paste, not plug-in replacement. |
| **Possible solution** | Provider interfaces: `DiscoveryProvider`, `PriceOracle`, `ExecutionRouter`. |
| **Dependencies** | Candidate schema; chain adapter extraction. |

---

### Near-miss and paper research not unified with TracktaOS memory

| Field | Detail |
|-------|--------|
| **Description** | Research ledgers are local JSONL without API for Ori or cross-session reasoning. |
| **Impact** | Institutional knowledge stays in files operators must grep. |
| **Possible solution** | Ingestion pipeline to TracktaOS memory; structured queries over near-miss outcomes. |
| **Dependencies** | Ori integration Phase 5; metrics export. |

---

## Issue status conventions

When fixing an issue, update this file:

1. Move entry to a **Resolved** section (append at bottom) with date and PR/reference — do not delete history.
2. Link the fixing decision in [DECISIONS.md](./DECISIONS.md).
3. Capture any lesson in [LESSONS_LEARNED.md](./LESSONS_LEARNED.md).

---

## Resolved

*(none yet)*

---

*Primary reference: [ENGINEERING_REVIEW.md](./ENGINEERING_REVIEW.md) · Last triaged: 2026-06*
