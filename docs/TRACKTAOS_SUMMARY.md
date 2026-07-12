# TracktaOS Summary — Solana Momentum Bot

Executive overview for Ori, incoming engineers, and stakeholders who need the system’s purpose, posture, and trajectory without reading the codebase.

**Module status:** TracktaOS Module 1 — research and execution-safety platform, not yet a production live-trading product.

**Safe default:** `PIPELINE_DRY_RUN` — observe real swap routes without moving funds.

---

# Mission

Solana memecoin momentum is fast, noisy, and dangerous. Most tools either show opportunities with no execution discipline, or execute with no research trail.

This system exists to **discover short-horizon momentum setups on Solana, filter them conservatively, paper-trade them, simulate real execution paths, and only then—under explicit human approval—consider live capital deployment.**

It solves three problems at once:

1. **Research** — repeatable scanning, scoring, and forward testing without risking funds.
2. **Execution safety** — layered gates so automation cannot accidentally submit live trades.
3. **Auditability** — append-only logs and ledgers so every decision can be reviewed after the fact.

For TracktaOS, this module is the first brick in a broader **cross-chain opportunity engine**: prove discovery, filtering, observation, and safety patterns on Solana before generalizing.

---

# Current State

| Dimension | Status |
|-----------|--------|
| **Operating mode** | `PIPELINE_DRY_RUN` — full Jupiter quote/build/simulation; no signing or submission |
| **Live trading** | Disabled by design; requires config, env flags, signer, dedicated RPC, and explicit authorization |
| **Maturity** | Phase 1 research bot with strong safety intent; operational rough edges (file coordination, duplicate code trees) documented |
| **Processes** | Separate Node processes: scanner, paper monitor, executor loop, wallet monitor, local dashboard |
| **Persistence** | Local JSON/JSONL files — no database or message bus |
| **Testing** | Standalone safety test scripts; no unified CI runner yet |
| **Documentation** | Architecture, operations, strategy, engineering review, decisions, lessons, and known issues complete for migration |

The bot is **production-minded in safety philosophy** but **not production-hardened in infrastructure**. It is appropriate for observation, paper research, and pipeline dry-run validation—not for unattended live trading today.

---

# Major Components

## Scanner

**Role:** Market discovery.

Pulls GMGN trending tokens, enriches them with DexScreener pair data, scores momentum and liquidity, applies rug/bot/holder safety checks, and logs accepted candidates.

**Outputs:** paper trades, pipeline candidate queue, near-miss rejections.

Runs once or on a 60-second watch loop. This is the wide funnel—most candidates never reach live-eligible execution.

## Pipeline

**Role:** Bridge from research to execution observation.

When the scanner accepts a candidate, it writes two parallel records: an open paper trade and a **pipeline candidate intent** with a durable `candidateIntentId`. The executor reads the queue in `PIPELINE_DRY_RUN`, runs the unsigned swap pipeline (quote → route check → build → simulate), and logs results to the execution audit trail.

The pipeline deliberately separates **research data** from **execution handoff** so paper and live ledgers never mix casually.

## Monitor

**Role:** Paper-trade lifecycle.

Polls DexScreener prices every 60 seconds and closes open paper trades on target (+10%), stop (−5%), or timeout (20 minutes). Suspicious stop hits (implied loss worse than −50%) are flagged for human review instead of treated as normal losses.

Optionally mirrors paper exits to open live positions, but paper monitoring continues even if the execution layer fails.

## Executor

**Role:** Guarded execution layer — the only component that builds swap transactions.

Three modes: legacy dry-run, **pipeline dry-run** (current default), and live (multi-gate armed). Enforces fixed position size, single open trade, daily entry stop, emergency halt, and strict thesis matching for live entries.

Exits can run when entries are stopped; only emergency stop freezes everything.

## State

**Role:** Shared memory between processes — today, flat files on disk.

Configuration (`live_config.json`), open positions, paper ledgers, pipeline queue, wallet snapshots, and simulation outputs. Append-only for history; overwrite for current snapshots.

**TracktaOS implication:** this layer is the primary migration boundary—either wrap with a state service or replace with an event store while preserving audit semantics.

## Logging

**Role:** Post-incident review and Ori ingestion substrate.

Append-only JSONL: execution audit, live trades, errors, control events, wallet history, reconciliation queue, panic events. Secrets and signed transaction bytes are never persisted.

Logging is treated as **operational data**, not source code.

---

# Strategy

## Entry philosophy

Trade **short-lived momentum**, not long-term conviction. Prefer liquid, recently active Solana tokens with measurable 5m/1h price and volume strength—and reject names that look thin, overextended, concentrated, or bot-dominated.

**Research first:** paper trade → pipeline observe → compare execution quality → only then consider live.

## Filters

Two intentional layers:

| Layer | Purpose |
|-------|---------|
| **Scanner (wide)** | Momentum score, liquidity, volume, buy/sell ratio, GMGN safety (holders, bots, bundlers, rug signals) |
| **Executor thesis (narrow)** | Tighter score, market cap, and concentration band for live-eligible candidates |

A token can become a paper trade but fail the execution thesis. That is by design; dashboards must not treat all paper wins as live-ready.

## Exits

Symmetric rules across paper and live:

- **Target:** +10% from entry (gross, before fees)
- **Stop:** −5% from entry (gross)
- **Timeout:** 20 minutes if neither fires
- **Anomaly guard:** do not auto-exit on stop if implied loss exceeds −50% (likely bad price data)

No trailing stops, partial take-profits, or scale-out logic today.

## Risk posture

Conservative and explicit:

- Fixed small position size (0.005 SOL default; hard ceilings in config)
- Max one open trade
- No compounding, averaging down, or martingale
- Daily entry stop: 3 losses or −0.10 SOL realized
- Emergency stop halts all automation until manual reset
- Live arming requires multiple independent gates (config + env + signer + RPC + authorization)
- Ambiguous on-chain outcomes → pause and reconcile manually, never guess

**Core belief:** safety gates are the product boundary, not friction to remove later.

---

# Key Decisions

Summarized from [DECISIONS.md](./DECISIONS.md). Full reasoning and review triggers live there.

1. **Stay in `PIPELINE_DRY_RUN` until explicit live approval** — validate real execution complexity before capital moves.

2. **Multi-process file coordination** — simple local operation; accepted file-race risk until TracktaOS state layer lands.

3. **Symmetric exits (+10% / −5% / 20 min)** — align paper research with live behavior; short-horizon thesis.

4. **Two-layer filters** — wide scanner funnel, narrow execution thesis; research breadth without execution looseness.

5. **Append-only logging** — immutable audit trail for review, migration, and Ori ingestion.

6. **Pipeline handoff via `pipeline_candidates.jsonl` + `candidateIntentId`** — durable identity for dedup and audit correlation.

7. **Paper monitor decoupled from executor** — research continues when execution fails.

8. **Emergency stop halts everything; stop-automation halts entries only** — graduated control with understood tradeoffs.

9. **Reconciliation over retry** — ambiguous submissions/fills → human review, not blind resubmit.

10. **Root scripts canonical; archive folders non-production** — migration inventory, pending cleanup.

---

# Lessons Learned

Summarized from [LESSONS_LEARNED.md](./LESSONS_LEARNED.md).

## What worked

- Clean separation of scanner, monitor, pipeline observation, and guarded execution survived real migration pressure.
- `PIPELINE_DRY_RUN` exposed route rejection, simulation failure, and fee issues paper trading hides.
- Append-only audits and secret redaction make behavior reviewable without leaking credentials.
- Intent-based handoff and audit-seeded dedup improved restart behavior vs blunt permanent blocking.
- Anomaly guard (−50%) correctly treats many stops as data problems, not strategy outcomes.

## What hurt

- File-based IPC without locking — concurrent processes can corrupt or lose ledger rows.
- Duplicate code trees — fixes in wrong folders do not affect running bots.
- `live_trades.json` vs `.jsonl` naming split confuses operators and dashboards.
- Thesis/scanner drift was implicit — paper stats overstated live-eligible edge until documented.
- No CI for safety tests — regressions rely on manual discipline.
- Unauthenticated local dashboard — risky on shared machines.

## Principles to carry forward

- **Protect capital first.** Gates are features.
- **Observation before optimization.** Measure pipeline quality before tuning strategy.
- **Research wide, execute narrow.** Label handoff rows honestly.
- **Never guess on-chain state.** Reconcile manually.
- **Documentation is part of safety.** Decisions, issues, and runbooks preserve institutional knowledge.

---

# Known Risks

Summarized from [KNOWN_ISSUES.md](./KNOWN_ISSUES.md). Full issue list with solutions and dependencies lives there.

## Critical (capital and safety)

| Risk | Why it matters |
|------|----------------|
| **File races on shared state** | Corrupted ledgers or config under concurrent scanner/monitor/executor/dashboard writes |
| **Manual reconciliation gap** | Ambiguous on-chain outcomes can desync wallet from bot state if mishandled |
| **DexScreener-only pricing** | Exit triggers may not match executable Jupiter prices; slippage can exceed nominal stop |
| **Emergency stop blocks exits** | Open exposure may require manual sell during kill-switch activation |

## High priority (reliability and false confidence)

| Risk | Why it matters |
|------|----------------|
| **Thesis/scanner drift** | Paper performance misread as live readiness |
| **Duplicate archive code trees** | Wrong-file edits; migration packages wrong code |
| **No CI safety harness** | Signer/handoff/pipeline guards can regress silently |
| **Startup script wrong path** | Processes launch in wrong directory |
| **Unauthenticated dashboard** | Automation toggles without access control |
| **Paper ≠ live edge** | Fees, latency, MEV, and failed txs not in paper PnL |
| **Daily stop is entry-only** | Single trade can exceed daily loss budget |

**Investor framing:** the system is designed not to lose money by accident through layered dry-run defaults—but it is not yet hardened against operational failure modes that matter once live trading is armed.

---

# Roadmap

Phases below align TracktaOS migration with the existing [ROADMAP.md](./ROADMAP.md) and [ENGINEERING_REVIEW.md](./ENGINEERING_REVIEW.md) priorities, extended for Ori and cross-chain evolution.

## Phase 1 — Stabilization

**Goal:** Safe, observable Module 1 on TracktaOS.

- Keep live trading disabled by default (`PIPELINE_DRY_RUN`)
- Stabilize scanner, monitor, dashboard, and pipeline dry-run
- Wire safety tests into CI; fix startup paths and process health
- Separate source from runtime data; document canonical file paths
- Quarantine duplicate code trees

**Exit criteria:** Reliable overnight observation; no silent scanner degradation; safety tests pass in CI.

## Phase 2 — Refactoring

**Goal:** Production-grade internal plumbing without changing strategy thesis.

- Unified state layer with atomic writes and single canonical filenames
- Process supervisor with liveness checks and restart policy
- Tag every handoff row with `thesisMatch`; segment dashboard metrics
- Reconciliation and emergency UX in dashboard
- Authenticated config changes with audit trail

**Exit criteria:** No file-race incidents in multi-process operation; operators trust dashboard state.

## Phase 3 — Multi-source pricing

**Goal:** Exit and anomaly decisions based on executable reality, not one API.

- Cross-check DexScreener vs Jupiter sell quote / pool reserves before target/stop/timeout
- Extend `NEEDS_REVIEW` when sources diverge
- Improve fill parsing and reconciliation automation

**Exit criteria:** Measurable reduction in false stop/anomaly events; live preflight includes price sanity checks.

## Phase 4 — Cross-chain schema

**Goal:** Generalize discovery without copying Solana safety logic per chain.

- Versioned `CandidateIntent` schema
- Chain adapter interfaces (discovery, pricing, execution)
- Normalize liquidity, volume, holder, and pair quality signals across ecosystems
- Chain-specific execution guardrails — no mixed research/live boundaries

**Exit criteria:** Second chain runs observation-only path with shared schema and isolated execution adapter.

## Phase 5 — FOMO Project integration

**Goal:** Package momentum research into a user-facing product layer.

- Configurable strategy profiles and review workflows
- Alerts, reports, and opportunity dashboards
- Safer promotion path from paper → pipeline → live authorization
- Live trading remains behind explicit approval workflow

**Exit criteria:** Operator can run full research loop through TracktaOS/FOMO UI without touching raw files.

## Phase 6 — Ori coordination

**Goal:** Ori as intelligence and coordination layer over Module 1.

- Ingest scanner results, paper outcomes, pipeline audit, wallet telemetry, and reconciliation state
- Guided review for strategy changes, anomalies, and daily research summaries
- TracktaOS-native tasking, memory, and operator workflows
- Preserve conservative safety philosophy as capabilities expand — Ori advises; gates enforce

**Exit criteria:** Ori can explain bot state, triage known issues, and recommend actions without bypassing execution gates.

---

# TracktaOS Role

The Solana Momentum Bot is **TracktaOS Module 1** — the first production-pattern module in a larger operating system for quantitative opportunity research and guarded execution.

## What TracktaOS inherits

| Capability | Module 1 contribution |
|------------|-------------------------|
| **Discovery pattern** | Scored candidate funnel with safety rejection and near-miss tracking |
| **Observation pattern** | Pipeline dry-run through real DEX routers without submission |
| **Safety pattern** | Layered arming, emergency stop, reconciliation pause, append-only audit |
| **Research pattern** | Paper ledger + forward test + simulation replay |
| **Operator pattern** | Local dashboard, wallet monitor, panic/reset scripts |

## What TracktaOS must add

Module 1 intentionally uses simple files and separate processes. TracktaOS provides:

- **Orchestration** — supervised process model, health checks, correct deployment paths
- **State** — atomic persistence or event store replacing ad-hoc file IPC
- **Identity & access** — authenticated operator actions and config audit
- **Migration boundaries** — runtime data as artifacts, not source; clear package manifest
- **Cross-module memory** — Ori and TracktaOS ingest logs and ledgers for reasoning across sessions

## Ecosystem placement

> **Structural taxonomy (2026-07-11):** Canonical component authority classes and permission boundaries live in the Obsidian vault: `Ori/TRACKTAOS_ARCHITECTURE.md` § Component Authority Classes & Permission Model. Module 1 / FOMO Engine 01 is classified as a **Controlled Execution Project under Vulcan**, not a peer operational component. This diagram is retained as historical context.

```text
TracktaOS (operating system)
├── Module 1: Solana Momentum Bot     ← you are here
├── Future: cross-chain scanners
├── Future: wallet intelligence
├── FOMO Project (product / UX layer)
└── Ori (coordination & intelligence)
```

Module 1 proves the **research → observe → execute-with-gates** lifecycle on one chain. TracktaOS generalizes the lifecycle; FOMO productizes it; Ori coordinates it. None of those layers should weaken Module 1’s default posture: **observe first, arm live last, reconcile when uncertain.**

For authority and component classification, see vault `Ori/TRACKTAOS_ARCHITECTURE.md` § Component Authority Classes & Permission Model; adoption `Ori/Decisions/DECISION — 2026-07-11 — Pillar Classes & Authority Model.md`; terminology amendment `Ori/Decisions/DECISION — 2026-07-11 — Component Authority Classes Terminology Amendment.md`.

---

## Document map

| Document | Audience | Purpose |
|----------|----------|---------|
| [TRACKTAOS_SUMMARY.md](./TRACKTAOS_SUMMARY.md) | Executives, Ori, new engineers | This overview |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Engineers | Component structure |
| [OPERATIONS.md](./OPERATIONS.md) | Operators | Day-to-day procedures |
| [STRATEGY.md](./STRATEGY.md) | Researchers | Filters, exits, philosophy |
| [ENGINEERING_REVIEW.md](./ENGINEERING_REVIEW.md) | Senior engineers | Deep onboarding review |
| [DECISIONS.md](./DECISIONS.md) | Maintainers | Why we chose X |
| [LESSONS_LEARNED.md](./LESSONS_LEARNED.md) | Team memory | Wins, mistakes, principles |
| [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) | Engineering | Tracked risks and fixes |
| [ROADMAP.md](./ROADMAP.md) | Planning | Original phase goals |

---

*Solana Momentum Bot · TracktaOS Module 1 · Safe default: pipeline observation, not live submission.*
