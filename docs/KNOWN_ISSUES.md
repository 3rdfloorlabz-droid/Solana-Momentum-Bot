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
| **Possible solution** | Unified state module: append via temp-file rename, advisory file locks, single writer process, or small embedded state service. |
| **Dependencies** | TracktaOS process model decision; migration of all readers/writers to one API. |

---

### Ambiguous on-chain outcomes require manual reconciliation

| Field | Detail |
|-------|--------|
| **Description** | Submission unknown, confirmation unknown, and fill parse failure append to `pending_reconciliation.jsonl`. No dashboard workflow automates triage. |
| **Impact** | Double-submit if operator retries blindly; position ledger diverges from wallet; funds moved but bot state wrong. |
| **Possible solution** | Reconciliation panel in dashboard; automated txSig status polling; block automation when unresolved rows exist. |
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

### `live_trades.json` vs `live_trades.jsonl` split

| Field | Detail |
|-------|--------|
| **Description** | `live_executor.js` (v2) writes `live_trades.jsonl`. `dashboard_server.js` and legacy copies reference `live_trades.json`. Readiness panel partially falls back to `.jsonl`. |
| **Impact** | Operators see stale/empty live history; readiness checks disagree; migration imports wrong file. |
| **Possible solution** | Canonicalize on `live_trades.jsonl`; update all readers; migrate or symlink legacy file once. |
| **Dependencies** | Dashboard refactor; validation in `reset_live_safety.js` / `validate_live_system.js`. |

---

### Thesis/scanner filter drift without handoff visibility

| Field | Detail |
|-------|--------|
| **Description** | Scanner logs score ≥ 79, MC ≤ $2.5M, bot ≤ 10%, top-10 ≤ 30%. Executor thesis: score 80–89, MC ≤ $250k, bot < 5%, top-10 10–20%. Not tagged on every scanner row. |
| **Impact** | Paper stats overstate live-eligible edge; pipeline observes `non_thesis_observation` candidates without obvious dashboard distinction. |
| **Possible solution** | Persist `thesisMatch` on handoff rows; segment dashboard metrics; document in scanner output. |
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

### No CI test harness for safety gates

| Field | Detail |
|-------|--------|
| **Description** | `package.json` test script exits with error. Safety tests (`test_signer_guard.js`, `test_pipeline_candidate_handoff.js`, etc.) are manual. |
| **Impact** | Regressions in signer guards, handoff schema, or pipeline dry-run ship unnoticed during refactors. |
| **Possible solution** | npm test runner invoking all `test_*.js`; GitHub Actions on PR. |
| **Dependencies** | CI environment without secrets; deterministic test fixtures. |

---

### `start_fomo.ps1` hardcoded wrong project path

| Field | Detail |
|-------|--------|
| **Description** | Script uses `C:\Users\nalle\sol-momentum-bot` instead of current workspace path. |
| **Impact** | Processes launch in wrong directory or fail; operator believes bot is running when it is not. |
| **Possible solution** | Parameterize `$ProjectPath`; default to `$PSScriptRoot`; validate `live_config.json` exists before launch. |
| **Dependencies** | Ops script ownership; `fomo_status.ps1` alignment. |

---

### Unauthenticated dashboard mutates live config

| Field | Detail |
|-------|--------|
| **Description** | `dashboard_server.js` on port 3000 toggles `automationEnabled` and related config without auth. |
| **Impact** | Anyone on host can arm entries or confuse automation state; shared-machine risk. |
| **Possible solution** | Localhost bind + auth token; confirm dialog for START; audit config diffs to `live_control_events.jsonl`. |
| **Dependencies** | TracktaOS UI security model; operator workflow preferences. |

---

### Paper win rate mistaken for live edge

| Field | Detail |
|-------|--------|
| **Description** | Paper ignores fees, slippage, failed txs, MEV, and partial fills. Pipeline dry-run does not submit transactions. |
| **Impact** | Premature live approval; strategy tuning on non-executable metrics. |
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

### In-memory observation dedup partially lost on restart

| Field | Detail |
|-------|--------|
| **Description** | Intent dedup seeds from `execution_audit.jsonl`; pair cooldown timestamps live in memory (`observedPipelinePairTimestamps`). |
| **Impact** | Restart may repeat pipeline observations or miss cooldown until audit replay completes. |
| **Possible solution** | Persist pair cooldown map to small state file or audit-derived cache. |
| **Dependencies** | Executor refactor; dedup metrics. |

---

### GMGN CLI subprocess fragility

| Field | Detail |
|-------|--------|
| **Description** | Blocking `execSync` with 30s timeout, `shell: true`, no circuit breaker or structured retry. |
| **Impact** | Silent scanner degradation; missed candidates; operator sees empty scans. |
| **Possible solution** | Structured API client with retries, backoff, health metric, alert on zero trending rows N cycles. |
| **Dependencies** | GMGN availability in TracktaOS runtime; API terms. |

---

### No process supervisor or health checks

| Field | Detail |
|-------|--------|
| **Description** | Multi-process bot relies on manual PowerShell windows; no liveness probes or auto-restart. |
| **Impact** | Silent process death overnight; stale open paper trades; missed pipeline cycles. |
| **Possible solution** | TracktaOS supervisor with heartbeat files, restart policy, alert on stale audit timestamps. |
| **Dependencies** | TracktaOS Phase 1 stabilization; `fomo_status.ps1` enhancement. |

---

### `PIPELINE_DRY_RUN` skips open live position management

| Field | Detail |
|-------|--------|
| **Description** | Executor in pipeline mode does not call `manageOpenPositions`. |
| **Impact** | Mode flip to live without runbook may leave position management ambiguous during transition. |
| **Possible solution** | Document mode transition; explicit "wind down pipeline → enable live management" procedure; config guard. |
| **Dependencies** | Live go-live runbook; operator training. |

---

### Post-fill slippage diagnostic only

| Field | Detail |
|-------|--------|
| **Description** | Pre-route validation protects entry; post-fill slippage exceeding caps logs anomaly but does not block. |
| **Impact** | Live fills worse than expected still close as normal trades; post-hoc discovery only. |
| **Possible solution** | Trusted USD fill source; optional halt-on-anomaly for live; richer `live_trades.jsonl` flags in dashboard. |
| **Dependencies** | Fill parse reliability; on-chain USD pricing strategy. |

---

### Env flag proliferation for live arming

| Field | Detail |
|-------|--------|
| **Description** | Overlapping gates: `executionMode`, `dryRunMode`, `automationEnabled`, `FOMO_ENABLE_LIVE_SUBMISSION`, `FOMO_ALLOW_LOOP_LIVE`, `SOLANA_SIGNER_SECRET`, RPC env vars. |
| **Impact** | Operator error arming live partially; hard to audit "fully disarmed" state. |
| **Possible solution** | Single `liveArmed` computed status in `--status` and dashboard; checklist UI. |
| **Dependencies** | Backward compatibility with existing env contracts. |

---

### Runtime data mixed with source repository

| Field | Detail |
|-------|--------|
| **Description** | Large JSONL histories, backups, zip archives coexist with source in tree. |
| **Impact** | Bloated clones; accidental commit of operational history; unclear migration scope. |
| **Possible solution** | Data directory outside git; `.gitignore` enforcement; migration artifact manifest. |
| **Dependencies** | TracktaOS data migration playbook (`MIGRATION_NOTES.md`). |

---

### Public RPC rate limits false negatives

| Field | Detail |
|-------|--------|
| **Description** | Wallet monitor and simulation fall back to public Solana RPC when Helius unset. |
| **Impact** | False wallet disconnect; aborted preflight; flaky pipeline observation — masks real issues. |
| **Possible solution** | Require dedicated RPC for non-dry-run readiness; surface RPC source in dashboard. |
| **Dependencies** | Helius or equivalent provisioning in TracktaOS. |

---

## Low Priority

Hygiene, developer experience, and incremental improvements — address after higher tiers.

---

### No npm test script integration

| Field | Detail |
|-------|--------|
| **Description** | Related to CI gap but also affects local DX — `npm test` unusable. |
| **Impact** | Friction for new contributors; inconsistent pre-commit behavior. |
| **Possible solution** | Wire test runner; document in README. |
| **Dependencies** | High-priority CI item can subsume this. |

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
