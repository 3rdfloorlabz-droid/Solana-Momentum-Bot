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
| **Status** | **`paper_trades.json` dual-writer race RESOLVED; `live_config.json` atomicity RESOLVED for all JS writers; both regression-guarded** (Sprint 4 A1a + A1b + A1c). **A1a:** ownership split via `paper_positions_store.js` — `paper_trades.json` is now **scanner-owned, append-only** (monitor no longer rewrites it); the monitor owns a separate mutable lifecycle store **`paper_positions.json`** (single writer, atomic temp-rename), keyed by `entryId = timestamp_address_pairAddress`, idempotently seeded with no history loss; scanner `alreadyOpen`/`recentlyLost` and dashboard read a merged view with ledger fallback. **A1b:** all JS `live_config.json` writers (`live_executor.saveConfig`, `emergency_stop.js`, `reset_live_safety.js`) route through `config_store.writeConfigAtomic()` (temp → fsync → re-parse validate → atomic rename → cleanup-on-error), matching the already-atomic PowerShell writers; format is byte-identical and A3 audit timing/schema unchanged. **A1c (2026-06-22):** `test_ownership_guards.js` statically enforces single-writer ownership and atomic config writes (fails if the monitor writes `paper_trades.json`, the scanner writes `paper_positions.json`, or any unapproved/non-atomic `live_config.json` writer appears); added to `run_safety_tests.js` (CI-enforced). Ownership contract documented in `ACTIVE_MANIFEST.md`. **Remaining (planned):** `live_positions.json`/`observation_dedup.json` are already single-writer (executor) but use full-replace, not atomic temp-rename; cross-process advisory locks for truly concurrent writers remain open (future state module). |
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
| **Description** | `dashboard_server.js` on port 3000 toggles `automationEnabled` and related config without auth. |
| **Impact** | Anyone on host can arm entries or confuse automation state; shared-machine risk. |
| **Status** | **Config audit gap partially resolved** (2026-06-22, Sprint 3 A3). Safety-relevant `live_config.json` changes now write an append-only audit row to `config_change_audit.jsonl` (`oldValue`, `newValue`, `actor`, `source`, `reason`, `riskLevel` CRITICAL/IMPORTANT/INFORMATIONAL, `requiresReview`, `modeAtChange`, `liveArmedAtChange`, `changeId`). Covered write surfaces: executor `startAutomation` / `stopAutomation` / `emergencyStopControl`, `reset_live_safety.js`, `panic.ps1`, `reset_after_panic.ps1`. `walletPublicAddress` redacted; no secrets/`.env`/private keys logged. Dashboard shows a read-only **Config Change Audit (A3)** summary card (latest change, field, risk, source, 24h/total counts; no buttons). **Auth and the dashboard mutation risk itself are NOT resolved** — auditing records changes, it does not authenticate or gate them. Direct manual edits to `live_config.json` outside these surfaces remain uncaptured. |
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
| **Status** | **Partially resolved** (2026-06-22, Sprint 2 M3). Executor persists `observation_dedup.json` (`observedKeys`, `pairLastObservedMs`) on dedup mutation; startup seed merges audit replay ∪ snapshot (union keys, max pair timestamps). Dual-process races remain until A1. |
| **Possible solution** | A1 unified state with atomic writes; dedup metrics in dashboard (M4+). |
| **Dependencies** | Single executor loop recommended; audit completeness. |

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
| **Status** | **Partially resolved** (2026-06-22, Sprint 3 M5 + Sprint 4 A2a). **M5:** read-only **Process Heartbeats** panel (`processHeartbeatPanel()`) classifies Scanner, Executor, Wallet Monitor, Paper Monitor, and Dashboard as **HEALTHY / STALE / MISSING / NO DATA** from existing artifacts (scanner_health.json `lastScanAt`, execution_audit.jsonl `CYCLE_END` derived, wallet_status.json `updatedAt`, paper_positions.json mtime proxy, dashboard self); stale thresholds ≈ 2× cadence (120/150/90/150/90s); hardcoded RUNNING/ACTIVE rows replaced. **A2a (advisory, A2 Level 1):** read-only **Supervisor Recommendations** panel (`supervisorRecommendationsPanel()`) maps each process's health to symptoms, likely causes, a recommended operator action, and an escalation level, supporting **HEALTHY / STALE / MISSING / NO DATA / DEGRADED / FAILED** (DEGRADED derived from existing M4/A4 signals; FAILED policy-defined, not auto-derived — no PID checks). **A2b (recovery advisor):** a nested read-only **Recovery Advisor** (`recoveryAdvisorSection()`) adds, per unhealthy process+state, a severity, operator-readable diagnosis, numbered manual recovery steps (plain command **text**), verification steps, escalation, a runbook reference (`docs/OPERATIONS.md` → Restart After Crashes; `docs/MODE_TRANSITION.md`), and a "Do not automate" reminder. **Still visibility/advice only** — no restart, stop, spawn, kill, PID check, automatic repair, buttons, forms, POST routes, or shell execution from the dashboard (action remains human/manual, A2 Level 2; autonomous recovery A2 Level 3 not built). No executor/config/strategy changes. |
| **Possible solution** | TracktaOS supervisor with heartbeat files, restart policy, alert on stale audit timestamps (A2 Levels 2–3, per [A2_SUPERVISOR_PLAN.md](./A2_SUPERVISOR_PLAN.md)). |
| **Dependencies** | TracktaOS Phase 1 stabilization; `fomo_status.ps1` enhancement; A2 supervisor (Sprint 4) for human-confirmed/autonomous recovery. |
| **A2d soak (Sprint 4)** | Long-duration advisory validation in progress per [A2D_SOAK_VALIDATION_PLAN.md](./A2D_SOAK_VALIDATION_PLAN.md). Operator evidence: [A2D_SOAK_CHECKPOINT_LOG.md](./A2D_SOAK_CHECKPOINT_LOG.md) · post-soak review: [A2D_SOAK_REVIEW_TEMPLATE.md](./A2D_SOAK_REVIEW_TEMPLATE.md). **Commit soak evidence as documentation only** (no runtime JSON/JSONL). **A2d does not authorize recovery execution, buttons, or live trading** — it validates that read-only advice is accurate before A2c design proceeds. |

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
