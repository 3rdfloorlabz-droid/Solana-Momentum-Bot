# A1 — Unified State Architecture Plan (Ownership & Structure Only)

**Module:** TracktaOS Module 1 — Solana Momentum Bot
**Sprint:** 4 of 4 (Phase 1 — Structure and Recovery)
**Status:** **Planning only** — no code, no migration, no file moves, no `data/` folder, no supervisor logic
**Operating constraint:** `PIPELINE_DRY_RUN` unchanged; this milestone touches no runtime behavior

**Parent:** [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) (rank 1 — file races on shared JSON/JSONL; A1)
**Entry context:** [SPRINT_3_REVIEW.md](./SPRINT_3_REVIEW.md) § 11–12 (Sprint 4 justified; A1 before A2)
**Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [M9_ARCHIVE_QUARANTINE_PLAN.md](./M9_ARCHIVE_QUARANTINE_PLAN.md) · [M10_ARCHIVE_POLICY_PLAN.md](./M10_ARCHIVE_POLICY_PLAN.md) · [A3_CONFIG_CHANGE_AUDIT_PLAN.md](./A3_CONFIG_CHANGE_AUDIT_PLAN.md) · [A4_DEDICATED_RPC_PLAN.md](./A4_DEDICATED_RPC_PLAN.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · [LESSONS_LEARNED.md](./LESSONS_LEARNED.md)

---

## 0. What this milestone is — and is not

A1 is an **ownership and structure** exercise. It answers one question: *for every piece of runtime state, who owns it, who may read it, what kind of thing is it, and what guarantees does it need?* It produces a **state ownership model** and a **state-type taxonomy** so that file races can later be eliminated **by design** rather than by accident.

A1 deliberately stops at the architecture boundary. It does **not** write code, move files, create a `data/` folder, change any reader/writer path, introduce a database, or add a supervisor.

> **M9 defines boundaries. M10 defines policies. A1 defines ownership and structure. A2 defines recovery and supervision. These four responsibilities must remain separate.**

| Milestone | Question it answers | This document? | What it may do |
|-----------|---------------------|----------------|----------------|
| **M9** | *"What category is each artifact (active vs archive vs runtime)?"* | No (done) | Classify and label only |
| **M10** | *"What do we do with each category — retire, archive, keep?"* | No (done) | Define retention/retirement **policy** |
| **A1** (this doc) | *"Who owns each state file, what type is it, and what guarantees does it need?"* | **Yes** | Define ownership, taxonomy, atomicity/durability **expectations** — **no implementation** |
| **A2** | *"How are processes restarted and recovered when state is healthy/unhealthy?"* | No (Sprint 4, after A1) | Supervisor, restart policy, safe-mode |

If a proposed action writes code, moves a file, creates a directory, adds a lock, or changes what a process reads/writes, **it is not A1 planning** — it belongs to A1 *implementation* (a later, separately approved step) or to A2.

---

## 1. Mission

Define a unified state architecture for TracktaOS that **eliminates fragmented ownership** and **reduces file-race risk** while **preserving behavior**.

Sprint 3 made state *observable* (M5 heartbeats), *accountable* (A3 config audit), and *governed* (M9/M10). It did not make state *structurally safe*. The top capital-safety blocker in [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) remains **rank 1 — file races on shared JSON/JSONL**. A1 is the design that, once implemented, retires that risk. This document is the design; it changes nothing.

---

## 2. Constraints (planning-only footprint)

This document must produce **only** `docs/A1_UNIFIED_STATE_PLAN.md`. It explicitly does **not**:

- change code, strategy, exits, filters, or the executor;
- change `PIPELINE_DRY_RUN`, arming, or any safety gate;
- edit `live_config.json` or any runtime file;
- move, rename, delete, or compress any file; create no `archive/` or `data/` folder;
- add dependencies, a database, or a state service;
- add supervisor behavior, process spawning, restarts, or retries.

See § 13 for the explicit do-not-implement list.

---

## 3. Inspection findings (current write surface)

Enumerated from the repository root on 2026-06-22 by reading the canonical process source (`scanner_gmgn_trending.js`, `monitor.js`, `live_executor.js`, `wallet_monitor.js`, `dashboard_server.js`, `near_miss_followup.js`) and the ops/safety writers (`emergency_stop.js`, `reset_live_safety.js`, `panic.ps1`, `reset_after_panic.ps1`). Archive copies under `automation/`, `hardreset/`, `harness/`, `files/`, `phase1_files/` are **not** active (per [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md)) and are excluded.

### 3.1 Writer / reader map (canonical root only)

| File | Writer(s) | Write mechanism | Readers |
|------|-----------|-----------------|---------|
| `live_config.json` | `live_executor.js` (`saveConfig`), `emergency_stop.js`, `reset_live_safety.js`, `panic.ps1`, `reset_after_panic.ps1` | **executor/JS: `writeFileSync` (full, non-atomic); PS: temp + `Move-Item` (atomic)** | executor, dashboard, scanner, wallet monitor, ops scripts |
| `paper_trades.json` | **`scanner_gmgn_trending.js` (append) AND `monitor.js` (`saveTrades` = full rewrite)** | **append + full rewrite (non-atomic)** | monitor, dashboard, analysis |
| `pipeline_candidates.jsonl` | `scanner_gmgn_trending.js` | append | executor, dashboard |
| `near_misses.json` | `scanner_gmgn_trending.js` | append (JSONL) | dashboard, `near_miss_followup.js` |
| `near_miss_followups.json` | `near_miss_followup.js` | full rewrite (non-atomic) | dashboard |
| `live_trades.jsonl` | `live_executor.js` (`appendJsonl`); `live_trade_logger.js` helper | append | dashboard, executor, reconciliation |
| `live_positions.json` | `live_executor.js` | full rewrite (non-atomic) | executor, dashboard |
| `execution_audit.jsonl` | `live_executor.js` (`appendJsonl`) | append | dashboard, executor (dedup replay), scanner |
| `live_errors.jsonl` | `live_executor.js` (`appendJsonl`) | append | dashboard, operators |
| `live_control_events.jsonl` | `live_executor.js`, `emergency_stop.js`, `reset_live_safety.js` | append (multi-appender) | dashboard, operators |
| `config_change_audit.jsonl` | `live_executor.js`, `panic.ps1`, `reset_after_panic.ps1`, `reset_live_safety.js` (via executor) | append (multi-appender) | dashboard (read-only card) |
| `panic_events.jsonl` | `panic.ps1`, `reset_after_panic.ps1` | append | operators |
| `wallet_status.json` | `wallet_monitor.js` | full rewrite (non-atomic) | dashboard, executor preflight |
| `wallet_history.jsonl` | `wallet_monitor.js` | append | dashboard |
| `rpc_health.json` | `wallet_monitor.js` | full rewrite (non-atomic) | dashboard, A4 readiness |
| `scanner_health.json` | `scanner_gmgn_trending.js` | full rewrite (non-atomic) | dashboard, M5 heartbeats |
| `observation_dedup.json` | `live_executor.js` | full rewrite (non-atomic) | executor (seeded from `execution_audit.jsonl` ∪ snapshot) |
| `simulation_results.json` | `simulate_live_executor.js` (offline) | full rewrite | analysis, dashboard |
| Dashboard HTML | `dashboard_server.js` | **none — read-only, in-memory render** | browser |

**Key structural observation:** the **dashboard writes no runtime state** — it is a pure reader/derived-view layer. That boundary is already correct and must be preserved.

### 3.2 Files with multiple writers (today)

1. **`paper_trades.json`** — scanner (append) + monitor (full rewrite). **Highest risk.** Two processes, two write models, one file.
2. **`live_config.json`** — executor + `emergency_stop.js` + `reset_live_safety.js` (non-atomic JS) and `panic.ps1` + `reset_after_panic.ps1` (atomic PS). Mixed atomicity, multiple owners.
3. **`live_control_events.jsonl`** — executor + emergency_stop + reset_live_safety (append-only; lower risk).
4. **`config_change_audit.jsonl`** — executor + PS scripts + reset_live_safety (append-only; lower risk; introduced by A3).

### 3.3 Non-atomic write paths (today)

Every full-file `writeFileSync` is non-atomic (no temp-file + rename): `live_config.json` (executor/emergency/reset_live_safety), `paper_trades.json` (monitor), `live_positions.json`, `near_miss_followups.json`, `wallet_status.json`, `rpc_health.json`, `scanner_health.json`, `observation_dedup.json`. A reader can observe a half-written file (parse error) and a crash mid-write can truncate it. The **only** atomic config writers today are `panic.ps1` / `reset_after_panic.ps1` (temp + `Move-Item`).

Append paths (`appendFileSync` / `appendJsonl` / `AppendAllText`) are lower-risk but **not guaranteed atomic** across processes — interleaving is possible with no advisory lock.

### 3.4 Races remaining after Sprint 3

| # | Race | Severity | Why Sprint 3 did not fix it |
|---|------|----------|------------------------------|
| R1 | `paper_trades.json`: scanner append vs monitor full rewrite → **lost trades / corrupted JSONL** | Critical | M5/A3 are visibility; neither serializes writers |
| R2 | `live_config.json`: non-atomic executor `saveConfig` concurrent with reader or another writer → **torn config / lost update** | High | A3 *records* changes; it does not serialize or make writes atomic (atomicity is A1) |
| R3 | `observation_dedup.json`: two executor loops → **lost dedup updates / repeated observations** | Critical | M3 fixed restart, not concurrent writers |
| R4 | `live_positions.json`: concurrent executor writers → **lost position state** | Critical | No single-writer guarantee yet |
| R5 | Snapshot read-during-write (`wallet_status`, `rpc_health`, `scanner_health`) → reader parse error | Medium | Dashboard tolerates via try/catch (shows NO DATA), but truth files should not flicker |
| R6 | Multi-appender JSONL interleave (`live_control_events`, `config_change_audit`) → rare malformed line | Low | Append-only limits blast radius; still unlocked |

These are exactly the conditions [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) names as rank-1 file races, and that its A1 exit criterion ("file races eliminated in a scanner + monitor + executor concurrent 24h stress test") is meant to retire.

---

## 4. State-type taxonomy (the A1 model)

Every runtime file is assigned **exactly one primary type**. Overlaps are noted honestly (some files serve two roles today — that ambiguity is itself a finding A1 must resolve). These are **conceptual types**, not directories. A1 creates no folders.

### 4.1 AUTHORITATIVE STATE — *the current truth; losing it is harmful*

| Artifact | Owner process | Readers | Write frequency | Durability | Atomicity expectation | Race risk today |
|----------|---------------|---------|-----------------|------------|-----------------------|-----------------|
| `live_config.json` | **Executor** (sole logical owner) | all processes, ops scripts | Rare (operator/control action) | Must survive restart; never torn | **Must be atomic** (temp + rename) and single-writer | **R2** — non-atomic + multiple writers |
| `live_positions.json` | **Executor** | executor, dashboard | Per position open/close | Must survive restart | **Atomic replace**, single-writer | **R4** |
| `observation_dedup.json` | **Executor** | executor | Per dedup mutation (~per cycle) | Should survive restart; **rebuildable** from `execution_audit.jsonl` (cache-backed) | Atomic replace, single-writer | **R3** |

> Note: `observation_dedup.json` is authoritative *in practice* but *reconstructible* from the audit ledger (M3 seeds from audit ∪ snapshot). A1 should formalize it as **authoritative-but-rebuildable**, which makes it recoverable if corrupted.

### 4.2 LEDGERS — *append-only history; the spine of truth*

| Artifact | Owner | Readers | Frequency | Durability | Atomicity | Race risk |
|----------|-------|---------|-----------|------------|-----------|-----------|
| `live_trades.jsonl` | Executor | dashboard, reconciliation | Per live event | Permanent; never rewritten | Atomic append (one line per write) | Low (single writer) |
| `execution_audit.jsonl` | Executor | dashboard, executor (dedup), scanner | Per cycle/stage | Permanent | Atomic append | Low |
| `pipeline_candidates.jsonl` | Scanner | executor, dashboard | Per candidate handoff | Permanent | Atomic append | Low |
| `pending_reconciliation.jsonl` | Executor | dashboard | Rare (ambiguous outcome) | Permanent until resolved | Atomic append | Low |
| `near_misses.json` (JSONL) | Scanner | dashboard, followup | Per rejected candidate | Permanent | Atomic append | Low |
| `live_control_events.jsonl` | **Executor (primary)** + emergency_stop + reset_live_safety | dashboard | Per control action | Permanent | Atomic append | R6 (multi-appender) |
| `config_change_audit.jsonl` | **Executor (primary)** + panic/reset PS + reset_live_safety | dashboard | Per safety-relevant config change | Permanent | Atomic append | R6 (multi-appender) |
| `panic_events.jsonl` | Panic/reset PS | operators | Per panic/reset | Permanent | Atomic append | Low |
| `paper_trades.json` | **CONTESTED** — scanner (append) + monitor (rewrite) | monitor, dashboard | Per scan + per close | Permanent (ledger) | **Should be append-only**; is rewritten | **R1 — must be resolved** |

> **`paper_trades.json` is the central design smell.** It is logically a **ledger** (immutable trade events) but is being used as **mutable state** (monitor rewrites the whole file to update statuses on close). A1's ownership decision: treat the trade log as an append-only ledger with a **separate owner for status mutation**, so two processes never write the same file. (Implementation — e.g. status as appended close-events, or a monitor-owned positions snapshot — is deferred to A1 implementation, not decided here.)

### 4.3 SNAPSHOTS — *latest-wins; replaceable; loss is tolerable*

| Artifact | Owner | Readers | Frequency | Durability | Atomicity | Race risk |
|----------|-------|---------|-----------|------------|-----------|-----------|
| `scanner_health.json` | Scanner | dashboard, M5 | End of each scan | Disposable (regenerated next scan) | Atomic replace preferred | R5 (read-during-write) |
| `wallet_status.json` | Wallet monitor | dashboard, preflight | ~30s | Disposable | Atomic replace preferred | R5 |
| `near_miss_followups.json` | `near_miss_followup.js` | dashboard | Per follow-up measurement | Disposable | Atomic replace preferred | Low (single writer) |

### 4.4 CACHE — *disposable; rebuildable from authoritative sources*

| Artifact | Owner | Readers | Frequency | Durability | Atomicity | Race risk |
|----------|-------|---------|-----------|------------|-----------|-----------|
| `rpc_health.json` | Wallet monitor | dashboard, A4 | ~30s | Disposable; rebuildable by pinging | Best-effort | Low |

> `observation_dedup.json` also has cache-like properties (rebuildable from `execution_audit.jsonl`) but is classified as authoritative-but-rebuildable (§ 4.1) because its loss causes repeated observations until rebuilt.

### 4.5 TELEMETRY — *informational; must never become truth*

| Artifact | Owner | Readers | Frequency | Durability | Atomicity | Race risk |
|----------|-------|---------|-----------|------------|-----------|-----------|
| `live_errors.jsonl` | Executor | dashboard, operators | Per error/guard failure | Useful history | Atomic append | Low |
| `wallet_history.jsonl` | Wallet monitor | dashboard | ~30s | Useful history | Atomic append | Low |

> Telemetry may be *derived from* truth and *inform* decisions, but no gate, balance, or position may be **computed authoritatively from telemetry**. Scanner/RPC health are telemetry snapshots that drive *display*, not *enforcement*.

### 4.6 DERIVED VIEWS — *never authoritative; reproducible from sources*

| Artifact | Owner | Source | Persisted? | Authority |
|----------|-------|--------|------------|-----------|
| Dashboard HTML panels (heartbeats, promotion, thesis, reconciliation, RPC readiness, config audit) | `dashboard_server.js` | reads ledgers/snapshots | **No (in-memory)** | **Never authoritative** |
| `simulation_results.json` | `simulate_live_executor.js` (offline) | replay of inputs | Yes (offline artifact) | Never authoritative |
| Recomputed `thesisMatch` (historical rows) | dashboard | recomputed bounds | No | Estimated, labeled |

The dashboard is the model citizen: **many reads, zero authoritative writes.** A1 should make every process resemble this separation — exactly one writer per authoritative artifact, everyone else reads.

---

## 5. Principles

A1 is governed by seven principles. They are design law, not implementation steps.

1. **Single writer.** Every authoritative artifact has exactly **one** owning process that may write it. No file has two writers. (`paper_trades.json` and `live_config.json` violate this today and are the primary targets.)
2. **Many readers.** Any number of processes may read any artifact. Reading is always safe and never requires coordination.
3. **Ledgers are append-only.** Ledger files are only ever appended to, one record per write, never rewritten in place. History is immutable.
4. **Snapshots are replaceable.** Snapshot files represent "latest known value." They may be overwritten atomically; losing one is tolerable because the owner regenerates it.
5. **Cache is disposable.** Cache files may be deleted at any time and rebuilt from authoritative sources. Nothing may depend on a cache surviving.
6. **Telemetry must not become truth.** Telemetry informs humans and dashboards; it is never the authoritative basis for a gate, balance, position, or arming decision.
7. **Derived views are never authoritative.** Anything computed/rendered from other files (dashboard, simulations, recomputed fields) must be reproducible and must never be written back as truth.

**Corollary (atomicity):** authoritative state and snapshots are written via **temp-file + atomic rename**; ledgers via **atomic append**. (This is the A1 *target*; A1 planning only specifies the expectation.)

---

## 6. Relationship to M9 / M10 / A2 (separation of responsibilities)

| Layer | Owns the question | Must NOT do |
|-------|-------------------|-------------|
| **M9 — boundaries** | "Which category (ACTIVE / RUNTIME LOCAL / ARCHIVE / RESEARCH / TEMPORARY) is each artifact?" | Decide ownership or write guarantees |
| **M10 — policies** | "Retain / retire / archive — what is the rule per category?" | Move files (planning), define state types |
| **A1 — ownership & structure** | "Who owns each RUNTIME LOCAL file, what type is it, what guarantees does it need?" | Implement, migrate, move files, build a `data/` folder, add locks, or supervise |
| **A2 — recovery & supervision** | "How are processes restarted/recovered based on state health and heartbeats?" | Define ownership or change strategy/arming |

A1 operates **only** on the M9 **RUNTIME LOCAL** category. It does not touch ACTIVE source, ARCHIVE trees, RESEARCH outputs, or TEMPORARY snapshots. A1 produces the contract; A2 later consumes the heartbeats (M5) and the healthy-state guarantees (A1) to decide restarts — **never** to arm trading.

---

## 7. Risks

| Risk | Severity | Mitigation in the A1 design |
|------|----------|------------------------------|
| **Scope creep into implementation** | High | This doc defines ownership only; any lock/temp-rename/`data/` work is a separate, later approval |
| **Resolving `paper_trades.json` changes monitor behavior** | High | A1 *names* the single-writer requirement; the behavior-preserving mechanism is decided at implementation with the safety suite as guardrail |
| **Over-engineering toward a database** | High | Explicitly forbidden (§ 13). Single-writer + atomic file ops is sufficient for Phase 1 |
| **Breaking the dashboard's clean read-only boundary** | Medium | A1 preserves it as the reference model; no writes added to dashboard |
| **Treating telemetry as truth during redesign** | Medium | Principle 6 is explicit; balances/positions stay sourced from authoritative state/ledgers |
| **Mixed atomicity (`live_config.json`)** | High | A1 names a single owner and a uniform atomic-write expectation across JS and PS writers |
| **Losing rebuildable state confidence** | Low | `observation_dedup.json` documented as rebuildable from audit (recovery path exists) |

---

## 8. Acceptance criteria

A1 **planning** is complete when this document:

1. Lists every canonical runtime JSON/JSONL file with its **owner process** and **reader processes**. ✅ (§ 3.1, § 4)
2. Classifies each file into exactly one of **AUTHORITATIVE STATE / LEDGERS / SNAPSHOTS / CACHE / TELEMETRY / DERIVED VIEWS**, with honest overlap notes. ✅ (§ 4)
3. Specifies, per artifact, **write frequency, durability, atomicity expectation, and race risk**. ✅ (§ 4)
4. Identifies every file with **multiple writers** and every **non-atomic write path**. ✅ (§ 3.2, § 3.3)
5. Enumerates the **races remaining after Sprint 3** (R1–R6). ✅ (§ 3.4)
6. States the **seven principles** and the M9/M10/A1/A2 **separation**. ✅ (§ 5, § 6)
7. Adds **no code, no file moves, no `data/` folder, no dependency, no database, no supervisor logic**, and leaves posture `PIPELINE_DRY_RUN` / `liveArmed: false` unchanged. ✅ (§ 2, § 13, verified § 11)

A1 **implementation** (a future, separately approved step) will be complete when — per STABILIZATION_PLAN — `live_config.json`, `paper_trades.json`, and `live_positions.json` have single-writer + atomic semantics and a scanner + monitor + executor concurrent 24h stress test shows **zero** file races. That work is **out of scope here.**

---

## 9. Examples (ownership applied)

- **`paper_trades.json` (R1).** Today: scanner appends a new paper trade; monitor reads all, mutates closed ones, rewrites the whole file. Under A1: the trade log is an **append-only ledger** with a **single writer**, and status changes are expressed without a second process rewriting the ledger (mechanism deferred). Result: scanner and monitor never write the same file.
- **`live_config.json` (R2).** Today: executor writes non-atomically; PS scripts write atomically; several scripts can write. Under A1: **executor is the single logical owner**, all writers use the **same atomic temp-rename contract**, and A3 continues to record every change. Result: no torn config, no lost update, full audit.
- **`observation_dedup.json` (R3).** Under A1: **executor-only** authoritative-but-rebuildable state; if corrupted, rebuilt from `execution_audit.jsonl`. Result: a second executor can never silently clobber dedup truth.
- **`wallet_status.json` / `rpc_health.json` (R5).** Under A1: **wallet-monitor-only** snapshot/cache written via atomic replace; readers (dashboard, A4) never see a half-written file. Result: no reader parse flicker.
- **Dashboard.** Already correct: many reads, zero authoritative writes — the template every other process should match.

---

## 10. Negative verification (what must remain true)

After A1 planning (and as invariants A1 implementation must preserve):

- `executionMode = PIPELINE_DRY_RUN`, `dryRunMode = true`, `liveArmed = false`, `operationalPosture = PIPELINE_OBSERVING` — **unchanged**.
- No strategy filter, exit rule, or arming gate changed.
- No runtime file edited, moved, renamed, or deleted; no `data/` or `archive/` folder created.
- No dependency, database, or state service added.
- No supervisor, restart, process spawn, or retry introduced.
- Safety suite still 4/4; `node --check` clean for any file touched (none in planning).
- Dashboard remains a pure reader (no authoritative writes added).

**Confirmed at authoring time (read-only):** posture verified `PIPELINE_DRY_RUN` / `liveArmed: false`; safety suite 4/4; the only filesystem change from this task is the creation of this document (§ 11).

---

## 11. Planning-only footprint (verification)

The sole artifact produced is `docs/A1_UNIFIED_STATE_PLAN.md`. No source file, config, or runtime file was modified. Inspection was read-only (`Read`/`Grep` over source) plus the standing read-only posture check (`live_executor.js --status`, `run_safety_tests.js`) used elsewhere this session.

---

## 12. Future phases (out of scope here — do not start without approval)

| Phase | Work | Gated by |
|-------|------|----------|
| **A1-impl Phase 1** | Atomic temp-rename for authoritative state + snapshots (`live_config.json`, `live_positions.json`, `wallet_status.json`, `rpc_health.json`, `scanner_health.json`, `observation_dedup.json`) | A1 plan approval |
| **A1-impl Phase 2** | Resolve `paper_trades.json` to single-writer + append-only ledger semantics (behavior-preserving) | Phase 1 stable; safety suite |
| **A1-impl Phase 3** | Advisory locking / single-writer enforcement for `live_config.json` across JS + PS writers | Phase 1–2 |
| **A1-impl Phase 4** | 24h concurrent stress test (scanner + monitor + executor) — STABILIZATION A1 exit | Phases 1–3 |
| **A2** | Supervisor consuming M5 heartbeats + A1 healthy-state guarantees (restart/safe-mode) | A1 implementation complete |
| **Deferred hygiene** | Rename `paper_trades.json` → `.jsonl`; optional `data/` packaging | Batched with A1 migration (breaking change) |

Each phase is a **separate, explicitly approved** step. None is authorized by this plan.

---

## 13. Do-not-implement warnings (explicit prohibitions)

A1 planning, and any future A1 implementation, must **never**:

- introduce a **database** (SQLite, embedded KV, server DB) — single-writer + atomic file ops only;
- add **supervisor logic**, **process spawning**, **restarts**, or **retries** — that is A2;
- **move, rename, delete, or compress** files, or create an **`archive/`** or **`data/`** folder during planning;
- change **strategy**, filters, exits, or thesis bounds;
- **enable live trading**, change `PIPELINE_DRY_RUN`, or weaken any safety gate;
- add **dependencies**;
- make the **dashboard** (or any reader) write authoritative state;
- treat **telemetry** or **derived views** as authoritative truth.

If any proposed change does one of the above, it is outside A1. Stop and re-scope.

---

*A1 Unified State Plan (ownership & structure only) · TracktaOS Module 1 · Phase 1 Stabilization (Sprint 4) · Safe default: `PIPELINE_DRY_RUN`, no live submission. M9 = boundaries · M10 = policies · A1 = ownership & structure · A2 = recovery & supervision. No implementation, no migration, no file moves, no database, no supervisor. Posture verified 2026-06-22. TracktaOS stability has priority over cleanliness.*
