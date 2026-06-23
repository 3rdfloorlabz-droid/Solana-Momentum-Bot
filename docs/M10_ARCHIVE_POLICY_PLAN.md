# M10 — Archive & Retention Policy Plan (Policy Only)

**Module:** TracktaOS Module 1 — Solana Momentum Bot
**Sprint:** 3 of 4 (Phase 1 — Reliability and Hardening)
**Status:** Planning only — **no code, no moves, no `archive/`, no deletions, no path changes**
**Operating constraint:** `PIPELINE_DRY_RUN` unchanged; this milestone touches no runtime behavior

**Builds on:** [M9_ARCHIVE_QUARANTINE_PLAN.md](./M9_ARCHIVE_QUARANTINE_PLAN.md) (the classification this policy governs)
**Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [../MIGRATION_NOTES.md](../MIGRATION_NOTES.md) · [DECISIONS.md](./DECISIONS.md) · [LESSONS_LEARNED.md](./LESSONS_LEARNED.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · [../.gitignore](../.gitignore)

---

## 0. What this milestone is — and is not

M9 named the categories. **M10 writes the rulebook** for each category: how long artifacts are kept, when they are safe to delete, how they sit in git, how they should be named, whether they need backups, and what event triggers a future migration. It is a **policy document** — a set of rules a human or future implementation step can apply later.

M10 **defines** policy. It does **not execute** it. No file is moved, renamed, deleted, or consolidated by this milestone. No `archive/` directory is created. The rulebook exists so that *when* cleanup or packaging happens (a later, separate, explicitly-authorized step — or A1), it follows agreed rules instead of ad-hoc judgment.

> **M9 defines boundaries. M10 defines policies. A1 later defines architecture. Those three responsibilities must remain separate.**

| Milestone | Question | This sprint? | What it may do |
|-----------|----------|--------------|----------------|
| **M9** | *"What category is each artifact?"* | Sprint 3 | Classify only. ✅ done |
| **M10** (this doc) | *"What are the rules for each category?"* | Sprint 3 | Write retention/deletion/git/naming/backup/trigger **rules**. **Execute nothing.** |
| **A1** | *"How is state/packaging structured to enforce the rules?"* | Sprint 4 | Unified state, atomic writes, `data/` packaging, single-writer model. |

### Scope refinement (important)

[STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) originally sketched M10 as *"Move legacy scanners to `archive/`; README single entry point."* **This M10 milestone is deliberately narrowed to policy authorship only.** The *act* of moving legacy scanners or creating `archive/` is **deferred to a separate future implementation step (or A1 packaging)** and is **explicitly out of scope here**. Defining the policy that would govern such a move is in scope; performing the move is not. TracktaOS stability has priority over cleanliness — so the rulebook lands first, with zero filesystem risk.

---

## 1. Policy principles

The five mandated principles, plus operational corollaries that make them enforceable:

1. **Preserve operational truth.** ACTIVE source, config, docs, and the canonical ledgers that constitute audit truth are never sacrificed for tidiness. When in doubt, keep.
2. **Runtime artifacts are disposable unless needed for replay.** RUNTIME LOCAL files are reconstructable by running the system — except where they hold irreplaceable audit/reconciliation history (those are retained).
3. **Archives are historical memory.** ARCHIVE exists for provenance and forensic reference. It is read-only by intent and never a second deployment.
4. **Research outputs are not execution truth.** RESEARCH datasets inform strategy study; they must never be read by the executor or cited as live readiness.
5. **Temporary files should not become permanent architecture.** TEMPORARY backups/snapshots are scaffolding; promoting a `*_backup` or `*_before_*` file to a canonical name is forbidden.

Corollaries (apply across all categories):

- **C1 — Repo wins.** The repository root + `ACTIVE_MANIFEST.md` is the single source of truth; no archive, backup, or research file overrides it.
- **C2 — Conservatism over cleanliness.** A retained junk file is cheap; a deleted truth file is catastrophic. Default to retain.
- **C3 — Gitignore hides, it does not delete.** Ignoring a file is not retirement; physical deletion is a separate, deliberate, logged act.
- **C4 — Every structural change earns a DECISIONS entry.** Consistent with the existing canonical-path decision and its review trigger.
- **C5 — Move readers and writers together, never alone.** Any path change is an A1 concern, executed atomically — never a piecemeal M10 cleanup.

---

## 2. Per-category policies

For each category: **retention · deletion safety · git posture · naming conventions · backup expectations · migration triggers.**

### 2.1 ACTIVE — operational truth

| Dimension | Policy |
|-----------|--------|
| **Retention** | Permanent for the life of the module. Retire a file only when its role is genuinely gone. |
| **Deletion safety** | **Never delete casually.** Retirement requires: (a) `ACTIVE_MANIFEST.md` update, (b) `DECISIONS.md` entry, (c) safety tests green. Removal is a tracked git change, reviewable and revertible. |
| **Git posture** | Tracked/committed. (`node_modules/` is the one gitignored ACTIVE input — reconstructable via `package-lock.json`.) |
| **Naming** | One canonical name per role, descriptive, **no version or state suffixes** (`_v3`, `_backup`, `_pre_*`, `_before_*` are forbidden for ACTIVE files). `ACTIVE_MANIFEST.md` is the authoritative name list. |
| **Backup** | Covered by git history + remote. No manual side-copies; a `*_backup.js` is never the safety net for ACTIVE code. |
| **Migration trigger** | Role added/renamed/retired → update manifest + DECISIONS. Path packaging (e.g., `data/`) → A1 only. |

### 2.2 RUNTIME LOCAL — operational history

| Dimension | Policy |
|-----------|--------|
| **Retention** | Keep while operationally relevant. **Tiered:** audit/reconciliation files (`execution_audit.jsonl`, `live_trades.jsonl`, `pending_reconciliation.jsonl`, `live_control_events.jsonl`, `panic_events.jsonl`) are **high-value, retain**; rolling telemetry/snapshots (`wallet_status.json`, `rpc_health.json`, `scanner_health.json`, `observation_dedup.json`) are **low-value, regenerated by running**. |
| **Deletion safety** | Disposable **only with operator intent and only when not needed for replay/audit/reconciliation**. Never auto-delete; never delete an open `pending_reconciliation.jsonl` row's source. Truncation is a deliberate, logged operator action. |
| **Git posture** | **Gitignored — never commit.** Do not `git add` to "clean up." (Already enforced by `.gitignore`.) |
| **Naming** | Canonical writer-defined names per `ACTIVE_MANIFEST.md` / `MIGRATION_NOTES.md`. **No renaming** without moving every reader/writer together (A1). `paper_trades.json` keeps its `.json`-holding-JSONL quirk until A1 (rename is a batched A1 change, not M10). |
| **Backup** | Optional operator snapshot **before risky operations** (saved as TEMPORARY, gitignored, clearly named). Not committed. Long-term durability is an A1 concern. |
| **Migration trigger** | (a) File-size/rotation pressure (e.g., `execution_audit.jsonl` is already multi-MB) → rotation policy, **designed in A1**, not improvised in M10. (b) A1 unified-state / `data/` packaging. |

### 2.3 ARCHIVE — historical memory

| Dimension | Policy |
|-----------|--------|
| **Retention** | Retain indefinitely during Phase 1. Archives are forensic memory; do not thin them on a schedule. |
| **Deletion safety** | **Do not delete during Phase 1.** Eventual removal requires provenance review **plus** a `DECISIONS.md` entry. Duplicate code trees stay until a future implementation step quarantines them — not M10. |
| **Git posture** | Mixed today: duplicate folders (`automation/`, etc.) are tracked; `*.zip` exports are gitignored. **Policy: stop accruing new tracked archives** (do not commit new archive folders/zips); leave existing tracked state **as-is in M10** (changing it is a move/commit M10 forbids). |
| **Naming** | Archives **should eventually** live under a single archive root and carry provenance metadata — this is a *target the policy sets*, **executed later**, never in M10. Legacy code keeps current names but is documented as non-active in `ACTIVE_MANIFEST.md`. |
| **Backup** | The `*.zip` exports effectively *are* historical backups; for tracked code, git history is the backup, so zips are redundant-but-harmless. |
| **Migration trigger** | Provenance review complete **and** a separately-authorized cleanup/packaging step exists → consolidation. Until then: **no consolidation** (explicitly forbidden here). |

### 2.4 RESEARCH — analytical datasets

| Dimension | Policy |
|-----------|--------|
| **Retention** | Keep while analytically useful. `near_misses.json` / `near_miss_followups.json` are valuable strategy-study inputs; retain by default. |
| **Deletion safety** | Deletable with low capital risk (not execution truth), but deletion loses research signal — prefer retain. Never read by the executor. |
| **Git posture** | Gitignored. (Datasets can be large and environment-specific.) |
| **Naming** | Descriptive dataset names; keep `simulation_*`, `near_miss*`, `trending.json`, `boosts.json`, `signals.json` as-is. No promotion to ACTIVE names. |
| **Backup** | Optional. A future structured `metrics.jsonl` export / Ori ingestion (ROADMAP, Phase 6) is the durable home — **not built in M10**. |
| **Migration trigger** | Structured metrics export or Ori ingestion pipeline matures (future phase). |

### 2.5 TEMPORARY — backups & point-in-time snapshots

| Dimension | Policy |
|-----------|--------|
| **Retention** | Shortest. No expectation of permanence; these should not accumulate as architecture. |
| **Deletion safety** | **Highest deletion-safety once confirmed superseded** — but during Phase 1 the conservative stance is **leave in place** (deletion is a future, separate cleanup task, and this milestone deletes nothing). Confirm a `*_backup`/`*_before_*` is truly redundant before any future removal. |
| **Git posture** | Gitignored (`*_backup.json`, `*_before_*.json`, `*.zip` already ignored). Never commit. |
| **Naming** | Impermanence must be visible in the name (`*_backup.*`, `*_before_<marker>.*`, dated snapshot zips). **A temporary file may never be renamed into a canonical ACTIVE name** (principle 5). |
| **Backup** | They *are* backups — not themselves backed up. |
| **Migration trigger** | Confirmed redundant → eligible for a future dedicated cleanup task (with operator confirmation). Not M10. |

---

## 3. Specific artifact policies

Concrete rulings for the artifacts the mission calls out. **All are policy statements; none are executed in M10.**

| Artifact / group | Category | M10 policy ruling | Execution timing |
|------------------|----------|-------------------|------------------|
| **Legacy scanners** (`scanner.js`, `scanner_v3.js`, `scanner_trending.js`) | ARCHIVE-by-role | **Do not delete.** Document as non-active in `ACTIVE_MANIFEST.md` (already listed). Eligible for *future* quarantine to an archive location under a DECISIONS entry — **not moved in M10**. | Future impl step / A1 packaging |
| **`live_trades.json`** (0 bytes, dead) | RUNTIME LOCAL (dead) | Recognized as **superseded by `live_trades.jsonl`** (Q5). Policy: treat as dead; **do not delete or "tidy" in M10**. Retirement is a logged operator action later. | Deferred; never silent |
| **Zip exports** (`automation.zip`, `files.zip`, `hardreset.zip`, `harness.zip`, `phase1_files.zip`, `sol-momentum-bot.zip`, `bot_snapshot.zip`, `step9b_review_packet.zip`) | ARCHIVE (snapshot zips overlap TEMPORARY) | Keep as historical backups; **stop creating new tracked zips**; already gitignored. No deletion in M10. | Cleanup deferred |
| **`*_backup.*`** (`paper_trades_backup.json`, `near_misses_backup.json`, `monitor_backup.js`, `analyze_results_backup.js`, `scanner_gmgn_trending_backup.js`) | TEMPORARY (code backups overlap ARCHIVE) | Never promote to canonical. Leave in place; gitignored. Future cleanup only after confirming the canonical file supersedes them. | Cleanup deferred |
| **`*_before_*.json`** (`paper_trades_before_bot10.json`, `scanner_gmgn_trending_pre_bot10.js`) | TEMPORARY | Pre-change snapshots; retain as forensic reference; no renaming, no deletion in M10. | Cleanup deferred |
| **Duplicate code trees** (`automation/`, `hardreset/`, `harness/`, `files/`, `phase1_files/`) | ARCHIVE | **Do not edit, move, consolidate, or delete in M10.** Policy: they are archival duplicates (per DECISIONS); a future quarantine step may relocate them — gated by provenance review + DECISIONS. | Future impl step |
| **Simulation artifacts** (`simulation_intents.jsonl`, `simulation_rejections.jsonl`, `simulation_results.json`) | RESEARCH | Retain while replay study is useful; gitignored; never execution truth. | — |
| **Near misses** (`near_misses.json`, `near_miss_followups.json`) | RESEARCH | Retain (valuable strategy signal); gitignored; deletion loses research value — prefer keep. | — |
| **Paper trades** (`paper_trades.json`) | RUNTIME LOCAL (high-value) | Operational history + thesis study input. Retain; gitignored; rename to `.jsonl` is a **batched A1 change**, not M10. Pre-op operator snapshots allowed (as TEMPORARY). | Rename = A1 |
| **Runtime ledgers** (`execution_audit.jsonl`, `live_trades.jsonl`, `pipeline_candidates.jsonl`, `live_positions.json`, `live_errors.jsonl`, `live_control_events.jsonl`, `wallet_history.jsonl`, `panic_events.jsonl`, `pending_reconciliation.jsonl`, `observation_dedup.json`, `scanner_health.json`, `wallet_status.json`, `rpc_health.json`) | RUNTIME LOCAL | **Append-only audit philosophy preserved** (never rewrite). High-value audit/recon files retained; low-value snapshots regenerable. Rotation/size policy is **designed in A1**. Gitignored; never commit. | Rotation = A1 |

---

## 4. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| M10 treated as license to start moving/deleting files | Medium | High | §0 scope refinement + §8 prohibitions; "policy authored, nothing executed" stated repeatedly |
| Audit/reconciliation ledger deleted as "disposable runtime" | Low | High | RUNTIME LOCAL tiered: audit/recon explicitly high-value, retain |
| `live_trades.json` deleted prematurely, masking a regression | Low | Medium | Policy: recognized dead but **not deleted in M10**; retirement logged later |
| Legacy scanner moved/deleted, breaking an operator's muscle-memory command or a stale reference | Low | Medium | Explicit "do not delete legacy scanners" + "no archive consolidation" |
| Provenance lost by zipping/deleting an archive before review | Low | Medium | Principle: provenance review precedes any retirement; none in M10 |
| Policy drifts from reality as files accrue | Medium | Low | Policy references M9 snapshot (2026-06-22); re-validate at execution time |
| Scope creep into A1 (rotation, `data/`, single-writer) | Medium | Medium | All path/rotation/packaging items explicitly tagged "A1, not M10" |
| Cleanliness prioritized over stability | Low | High | Corollary C2 (conservatism over cleanliness) + mission tie-break rule |

---

## 5. Acceptance criteria

M10 is complete when **all** hold:

1. **AC1 — Principles stated.** The five policy principles (+ corollaries) are documented. ✅ (§1)
2. **AC2 — Per-category policy complete.** Each of ACTIVE / RUNTIME LOCAL / ARCHIVE / RESEARCH / TEMPORARY has retention, deletion safety, git posture, naming, backup, and migration-trigger rules. ✅ (§2)
3. **AC3 — Named artifacts ruled.** Legacy scanners, `live_trades.json`, zips, `*_backup.*`, `*_before_*.json`, duplicate trees, simulation artifacts, near misses, paper trades, and runtime ledgers each have an explicit policy ruling. ✅ (§3)
4. **AC4 — No filesystem change.** `git status` shows **only this new doc**; no moves, renames, deletes, `archive/`, or path changes. **Verify (§7).**
5. **AC5 — Posture unchanged.** `node live_executor.js --status` → `PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false`; `node run_safety_tests.js` → 4/4.
6. **AC6 — Responsibilities separated.** Doc states M9 = boundaries, M10 = policy, A1 = architecture, and executes no boundary or architecture action. ✅ (§0, §9)
7. **AC7 — Execution deferred, not implied.** Every actionable item is tagged with a future timing and explicitly **not** performed here. ✅ (§3)

---

## 6. Examples (how the policy reads in practice)

- **"Should I delete `paper_trades_before_bot10.json`?"** → TEMPORARY, deletion-safe *in principle*, but **not in M10**; leave in place; a future cleanup task may remove it after confirming `paper_trades.json` supersedes it.
- **"Can I commit `scanner_health.json` so the dashboard has data in CI?"** → No. RUNTIME LOCAL is gitignored; committing it violates the git-posture policy (C3).
- **"`automation/live_executor.js` looks outdated — patch it?"** → No. ARCHIVE duplicate; never edit. One change, one tree (C-corollary); edit root `live_executor.js` only.
- **"Let's move legacy scanners into `archive/` now."** → Out of scope for M10. Policy *permits a future quarantine* under provenance review + DECISIONS; the move itself is a later step.
- **"Rename `paper_trades.json` → `.jsonl` while we're here."** → No. Path change moving readers+writers = A1 batched change (C5).
- **"Delete the duplicate `*.zip` exports to clean the tree."** → Not in M10. They are gitignored historical backups; cleanup is deferred and operator-confirmed.

---

## 7. Negative verification (planning milestone)

M10 changes no code; verification proves nothing was executed:

```powershell
# 1. Only the new policy doc should appear
git status --short
git diff --stat

# 2. No archive folder / runtime ledger / legacy scanner touched; no archive/ created
git status --short -- automation/ hardreset/ harness/ files/ phase1_files/ scanner.js scanner_v3.js scanner_trending.js
Test-Path .\archive    # expect False — M10 must NOT create it

# 3. Posture unchanged
node live_executor.js --status   # expect PIPELINE_DRY_RUN, dryRunMode true, liveArmed false
node run_safety_tests.js         # expect 4/4 passed
```

Pass = the only working-tree change is `docs/M10_ARCHIVE_POLICY_PLAN.md`; no `archive/` exists; posture/safety identical to pre-M10.

---

## 8. "Do NOT implement during M10" warnings

Hard prohibitions for this milestone:

- ❌ **Do not move or rename any file** (legacy scanners, duplicate trees, ledgers, backups — nothing).
- ❌ **Do not create `archive/`** (or any new directory). Policy may *describe* a future archive root; M10 does not make one.
- ❌ **Do not introduce `data/`** — that is A1 packaging.
- ❌ **Do not introduce a database, index, or new dependency.**
- ❌ **Do not redesign repository layout** or consolidate archives.
- ❌ **Do not delete legacy scanners** (`scanner.js`, `scanner_v3.js`, `scanner_trending.js`) or any other artifact.
- ❌ **Do not delete or "tidy" `live_trades.json`**, `*_backup.*`, `*_before_*.json`, or `*.zip`.
- ❌ **Do not edit `.gitignore`, `live_config.json`, `PIPELINE_DRY_RUN`, or any executor/strategy/scanner/monitor/dashboard code.**
- ❌ **Do not add read-only attributes or markers** to any file.
- ✅ **Allowed:** authoring/maintaining this policy doc only.

If applying M10 ever requires a shell command that creates `archive/`, or moves/renames/deletes a file, **stop — that is execution, not policy, and it is out of scope.**

---

## 9. Relationship to M9 and A1

- **M9 (done) → boundaries.** Produced the five-category classification this policy governs. M10 adds rules; it does not reclassify.
- **M10 (this doc) → policy.** The rulebook. Authored now; **executed later** by a separately-authorized cleanup step and/or A1.
- **A1 (Sprint 4) → architecture.** Where policy becomes structurally enforced: unified state layer (atomic appends, locked config writes, single-writer model), optional `data/` packaging (readers+writers moved together), and ledger rotation. RUNTIME LOCAL retention/rotation rules from §2.2 are **inputs to A1**, not implemented here.

**Order of operations: M9 names → M10 governs → A1 enforces.** Collapsing these (e.g., moving files under the banner of "policy") reintroduces the wrong-tree and file-race risks Phase 1 exists to remove.

---

## 10. One-line M10 mandate

**Write the retention and archive rulebook for every category — preserve operational truth, treat runtime as disposable-unless-needed, keep archives as memory, fence research from execution, and never let temporary become permanent — while moving, creating, and deleting absolutely nothing.**

---

*Sprint 3 · M10 Archive & Retention Policy (policy only) · TracktaOS Module 1 · Phase 1 Stabilization · Safe default: `PIPELINE_DRY_RUN`, no live submission. Stability over cleanliness. Governs the M9 classification snapshot dated 2026-06-22.*
