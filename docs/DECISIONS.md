# Engineering Decision Log

Chronological record of significant architectural and operational decisions for the Solana Momentum Bot (TracktaOS Module 1). Each entry captures what was decided, why, what we traded away, and when to revisit.

Decisions are ordered oldest-first within each phase. Approximate dates reflect implementation history documented in code comments, config, and migration artifacts unless a precise commit date is known.

---

## Phase 0 — Research Bot Foundations

### 2025 — Multi-process file coordination instead of a monolith

| Field | Detail |
|-------|--------|
| **Decision** | Run scanner, monitor, executor, wallet monitor, and dashboard as separate Node processes coordinated by JSON/JSONL files in the project root. |
| **Reasoning** | Keeps research loops independent: paper monitoring must survive executor failures; scanner can run without signing capability; operators can restart one process without touching others. |
| **Tradeoffs** | Simple to understand and debug locally. No message bus, no locking, no single supervisor — file races and ordering bugs become possible. |
| **Future review trigger** | When TracktaOS introduces a process supervisor or shared state service; or when file corruption incidents occur. |

---

### 2025 — DexScreener as primary price oracle for paper monitoring

| Field | Detail |
|-------|--------|
| **Decision** | Use DexScreener pair API for scanner enrichment, paper entry reference, and monitor exit triggers. |
| **Reasoning** | Free, pair-level USD prices aligned with chart URLs operators already use; GMGN does not replace pair-level monitoring in the monitor loop. |
| **Tradeoffs** | Fast to integrate. Single source of truth for exits — stale quotes, wrong pairs, and liquidity gaps can diverge from executable Jupiter routes. |
| **Future review trigger** | Before live trading at scale; when exit anomalies (`NEEDS_REVIEW`) exceed a defined threshold; when multi-source price sanity is implemented. |

---

### 2025 — GMGN CLI for discovery and safety enrichment

| Field | Detail |
|-------|--------|
| **Decision** | Invoke `gmgn-cli` via subprocess for trending lists, token info, and pool data rather than embedding proprietary API clients in-repo. |
| **Reasoning** | Leverages an existing operator toolchain; keeps scanner logic focused on scoring and filtering. |
| **Tradeoffs** | Blocking `execSync`, shell invocation, and per-token latency cap throughput. Silent per-interval failures can look like "no setups." |
| **Future review trigger** | TracktaOS container deployment; GMGN CLI unavailable in target environment; scanner reliability SLO defined. |

---

## Phase 1 — Safety and Observation Layer

### 2026-03 — Conservative execution posture (Phase 1 autonomous dry run)

| Field | Detail |
|-------|--------|
| **Decision** | Phase 1 operates as `PHASE_1_AUTONOMOUS_DRY_RUN`: fixed position size (0.005 SOL default), max one open trade, no compounding/averaging/martingale, daily entry stop after 3 losses or −0.10 SOL realized. |
| **Reasoning** | Capital preservation dominates early automation. Small fixed size limits blast radius while still producing real execution telemetry later. |
| **Tradeoffs** | Cannot scale exposure within a session; daily stop blocks entries only, not single-trade tail risk. |
| **Future review trigger** | Explicit live approval record signed; sustained profitable pipeline observation period; drawdown policy reviewed by operator. |

---

### 2026-03 — Symmetric exits: +10% target, −5% stop, 20-minute timeout

| Field | Detail |
|-------|--------|
| **Decision** | Paper and live use identical gross exit rules: `targetPrice = entry × 1.10`, `stopPrice = entry × 0.95`, force exit at 20 minutes if neither fires. Mirror constants in `live_executor.js` and `monitor.js`. |
| **Reasoning** | Short-horizon momentum thesis — capture quick moves, cut losers early, avoid stale bags. Symmetry lets paper results inform live behavior without divergent logic. |
| **Tradeoffs** | Gross percentages ignore fees and slippage; no trailing stop or partial take-profit; timeout may exit into chop. |
| **Future review trigger** | Forward-test shows systematic timeout drag; live slippage consistently breaches nominal stop; strategy version bump (`gmgn_v5+`). |

---

### 2026-03 — Anomaly guard at −50% implied loss

| Field | Detail |
|-------|--------|
| **Decision** | If a stop trigger implies worse than −50% PnL vs entry, mark paper trade `NEEDS_REVIEW` and flag open live positions instead of auto-selling. |
| **Reasoning** | Catastrophic implied loss at a 5% stop almost always indicates bad price data or pool collapse, not a normal stop event. |
| **Tradeoffs** | Open live exposure may persist during real crashes if data is wrong but direction is right; requires human triage. |
| **Future review trigger** | Multi-source price validation lands; reconciliation dashboard reduces triage latency. |

---

### 2026-04 — Two-layer filter architecture (scanner wide, executor narrow)

| Field | Detail |
|-------|--------|
| **Decision** | Scanner applies broad momentum + safety filters (e.g. market cap up to $2.5M, score ≥ 79 to log). Executor `thesis` in `live_config.json` narrows live/autonomous observation (score 80–89, MC $100k–$250k, bot rate < 5%, top-10 10–20%). |
| **Reasoning** | Research wants a wide funnel for paper stats and near-miss analysis; execution wants a tight band proven before capital risk. |
| **Tradeoffs** | Dashboard and operators can misread paper win rate as live-ready; handoff rows may be `non_thesis_observation` in pipeline dry-run. |
| **Future review trigger** | Thesis match tagging on every handoff row shipped; quarterly review of thesis bounds vs paper outcomes. |

---

### 2026-04 — Append-only logging philosophy

| Field | Detail |
|-------|--------|
| **Decision** | Treat audit and trade history as append-only JSONL: `execution_audit.jsonl`, `live_trades.jsonl`, `live_errors.jsonl`, `live_control_events.jsonl`, `wallet_history.jsonl`, `pending_reconciliation.jsonl`, `panic_events.jsonl`. Overwrite only small current-state snapshots (`live_config.json`, `live_positions.json`, `wallet_status.json`). |
| **Reasoning** | Post-incident review and TracktaOS ingestion require immutable event history. Dedup seeds from audit log for restart-safe pipeline observation. |
| **Tradeoffs** | Files grow unbounded; parse errors in one line affect downstream tooling; no formal schema versioning. |
| **Future review trigger** | Log rotation/archival policy defined; migration to TracktaOS event store; disk size thresholds exceeded. |

---

### 2026-04 — Secret redaction and no persisted signed bytes

| Field | Detail |
|-------|--------|
| **Decision** | Redact secrets in logs; never write signed transaction bytes or full private keys to disk; zero signed buffers after submission attempt. |
| **Reasoning** | Trading bots are high-value targets; audit trails must not become secret leaks. |
| **Tradeoffs** | Harder to replay exact bytes for debugging; operators rely on txSig lookup on-chain. |
| **Future review trigger** | Security review before live; new logging requirements from compliance. |

---

### 2026-05 — `PIPELINE_DRY_RUN` as default operating mode

| Field | Detail |
|-------|--------|
| **Decision** | Default and migration-safe mode is `executionMode: PIPELINE_DRY_RUN` with `dryRunMode: true`. Run full Jupiter quote → route validation → priority fee → tx build → simulation without signing or submission. |
| **Reasoning** | Validates real execution path complexity before capital moves. Observation data informs slippage, route rejection, and simulation failure rates. |
| **Tradeoffs** | Does not prove live fill quality; adds RPC/Jupiter dependency for "safe" operation; skips `manageOpenPositions` in this mode. |
| **Future review trigger** | Sufficient `execution_audit.jsonl` sample with acceptable abort rates; live authorization record approved; dedicated RPC configured. |

---

### 2026-05 — Stay in `PIPELINE_DRY_RUN` until explicit live approval

| Field | Detail |
|-------|--------|
| **Decision** | Do not flip to `LIVE` during TracktaOS migration or routine ops. Live requires layered gates: config mode, env `FOMO_ENABLE_LIVE_SUBMISSION=YES`, signer present, dedicated RPC, `positionSizeSol ≤ 0.01`, and manual authorization workflow. |
| **Reasoning** | Paper success and pipeline observation do not equal live edge. Migration re-platforming is highest-risk moment for accidental arming. |
| **Tradeoffs** | Delays revenue/experimentation on real fills; team must maintain discipline as tooling improves. |
| **Future review trigger** | `LIVE_AUTHORIZATION_RECORD.md` checklist complete; reconciliation runbook drill passed; operator sign-off. |

---

### 2026-05 — Candidate pipeline handoff via `pipeline_candidates.jsonl`

| Field | Detail |
|-------|--------|
| **Decision** | Scanner writes parallel rows to `paper_trades.json` and `pipeline_candidates.jsonl` with shared fields plus `candidateIntentId` on the queue row. Executor prefers queue over open-paper fallback for observation selection. |
| **Reasoning** | Separates research ledger from execution handoff; durable intent ID enables dedup and audit correlation. |
| **Tradeoffs** | Duplicate data paths; identity rules (intent vs pair vs cooldown) require ongoing tuning. |
| **Future review trigger** | Unified candidate schema in TracktaOS; dedup incident or missed observation post-mortem. |

---

### 2026-06 — Intent-first dedup with pair cooldown (60 minutes)

| Field | Detail |
|-------|--------|
| **Decision** | Pipeline observation dedup prefers `candidateIntentId`; falls back to address+pair for legacy rows; applies 60-minute pair cooldown. Seed observed set from `execution_audit.jsonl` on startup. |
| **Reasoning** | Permanent pair blocking hid legitimate re-entries; intent keys survive restarts when audit is complete. |
| **Tradeoffs** | In-memory pair timestamps partially lost on restart; aggressive dedup under-samples; weak dedup duplicates work. |
| **Future review trigger** | Persistent dedup store; metrics on skipped vs observed candidates. |

---

### 2026-06 — Paper monitor decoupled from live executor

| Field | Detail |
|-------|--------|
| **Decision** | `monitor.js` loads `live_executor` optionally; all live mirror calls wrapped in try/catch. Paper monitoring never throws on live failures. |
| **Reasoning** | Research data collection must not depend on execution layer availability. |
| **Tradeoffs** | Live exits may not mirror paper if executor down; dual exit paths (monitor mirror vs executor loop) must stay aligned. |
| **Future review trigger** | Live trading enabled; mirror lag incidents. |

---

### 2026-06 — Emergency stop halts entries and exits

| Field | Detail |
|-------|--------|
| **Decision** | `emergencyStop: true` blocks all executor activity including exits until `reset_live_safety.js`. `automationEnabled: false` stops entries only; exits continue. |
| **Reasoning** | Kill switch must be absolute during unknown failure; stop-without-emergency allows wind-down. |
| **Tradeoffs** | Cannot auto-exit during emergency — manual intervention required while market moves. |
| **Future review trigger** | Post-incident review after any emergency activation; consider graduated halt levels. |

---

### 2026-06 — Reconciliation over guesswork for ambiguous on-chain state

| Field | Detail |
|-------|--------|
| **Decision** | On submission unknown, confirmation unknown, or fill parse failure after confirm, append to `pending_reconciliation.jsonl` and stop rather than retry blindly. Document in `RECONCILIATION_RUNBOOK.md`. |
| **Reasoning** | Double-submit and phantom position state are worse than a paused bot. |
| **Tradeoffs** | Requires trained operator; automation stays blocked until human resolves. |
| **Future review trigger** | Dashboard reconciliation panel; automated txSig status polling. |

---

### 2026-06 — Exits continue when automation stopped

| Field | Detail |
|-------|--------|
| **Decision** | `stopAutomation()` sets `automationEnabled: false` but executor still runs `manageOpenPositions` for open live trades (unless emergency stop). |
| **Reasoning** | Stopping research entries should not trap capital in open positions. |
| **Tradeoffs** | Operator may think "stopped" means fully idle; status UX must clarify. |
| **Future review trigger** | Unified bot state model in TracktaOS UI. |

---

## Phase 2 — TracktaOS Migration (In Progress)

### 2026-06 — Root-level scripts remain canonical

| Field | Detail |
|-------|--------|
| **Decision** | Active runtime path is project root (`scanner_gmgn_trending.js`, `monitor.js`, `live_executor.js`, `dashboard_server.js`). Folders `automation/`, `hardreset/`, `harness/`, `files/`, `phase1_files/` are archival duplicates, not second deployments. |
| **Reasoning** | Migration inventory documents reality; avoids rewriting history before TracktaOS packaging. |
| **Tradeoffs** | High risk of editing wrong copy; onboarding friction. |
| **Future review trigger** | Archive or quarantine duplicate trees; publish `ACTIVE_MANIFEST.md`. |

---

### 2026-06 — Runtime data classified as artifacts, not source

| Field | Detail |
|-------|--------|
| **Decision** | JSON/JSONL runtime files are operational data — gitignored or reviewed before import — not part of the source package. |
| **Reasoning** | Prevents secret/history leakage in TracktaOS repo; clarifies migration boundaries. |
| **Tradeoffs** | Fresh clone lacks history; tests may need fixtures. |
| **Future review trigger** | TracktaOS data migration playbook finalized. |

---

## How to Add a Decision

1. Add a dated entry at the bottom of the appropriate phase (or start a new phase).
2. Include all five fields: Date, Decision, Reasoning, Tradeoffs, Future review trigger.
3. Link related issues in `KNOWN_ISSUES.md` and lessons in `LESSONS_LEARNED.md`.
4. If a decision is reversed, append a new entry — do not erase the original.

---

*Primary reference: [ENGINEERING_REVIEW.md](./ENGINEERING_REVIEW.md)*
