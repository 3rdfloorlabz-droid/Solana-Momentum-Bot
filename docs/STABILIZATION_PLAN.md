# Stabilization Plan — Phase 1

**Phase:** Understanding and Stabilization  
**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Baseline commit:** `16bf00a` — engineering memory docs on GitHub  
**Operating constraint:** Remain in `PIPELINE_DRY_RUN` until this plan's pre-live gates are met

Phase 0 (preservation, migration, documentation, memory) is complete. Phase 1 does **not** add strategy features or live trading. It makes the existing system **understandable, reliable, and honestly measured** before any capital moves.

**Source documents:** [ENGINEERING_REVIEW.md](./ENGINEERING_REVIEW.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · [DECISIONS.md](./DECISIONS.md) · [ORI_MEMORY.md](./ORI_MEMORY.md)

---

## Phase 1 success criteria

Phase 1 is done when all of the following are true:

1. Multi-process operation runs overnight without ledger corruption or silent process death
2. Safety test suite runs in CI on every change to executor, scanner handoff, or monitor paths
3. Operators can answer "is this live-ready?" from dashboard + `--status` without misreading paper stats
4. Canonical code path and runtime data boundaries are unambiguous (manifest + gitignore discipline)
5. Pre-live checklist explicitly blocks arming until file IPC and reconciliation UX are addressed

---

## Ranked top problems

Problems ordered by **capital safety × likelihood × migration blocker** impact. Rank is stable unless a live arming decision forces reprioritization.

| Rank | Problem | Severity | Blocks live? | Primary dependency |
|------|---------|----------|--------------|-------------------|
| **1** | File races on shared JSON/JSONL state | Critical | Yes | TracktaOS state-layer design |
| **2** | No CI safety harness | High | Yes (refactor risk) | None — can start immediately |
| **3** | Thesis/scanner drift without visibility | High | Indirect (false confidence) | Dashboard + scanner tagging |
| **4** | Duplicate archive code trees | High | Indirect (wrong fixes) | Packaging / manifest decision |
| **5** | `live_trades.json` vs `.jsonl` split | High | Indirect (ops blind spots) | Dashboard alignment |
| **6** | `start_fomo.ps1` wrong project path | High | Indirect (bot not running) | None — quick fix |
| **7** | No process supervisor / health checks | Medium | Indirect | Ops script + heartbeat design |
| **8** | Reconciliation gap (manual-only UX) | Critical | Yes | Dashboard panel + RPC |
| **9** | DexScreener-only pricing | Critical | Yes | Jupiter quote integration (Phase 1 late / Phase 3 early) |
| **10** | In-memory observation dedup loss on restart | Medium | No (dry-run quality) | Audit completeness + small state file |
| **11** | Unauthenticated dashboard | High | Before shared hosting | Auth model decision |
| **12** | GMGN CLI silent degradation | Medium | No | Scanner health metrics |
| **13** | Public RPC false negatives | Medium | Before live | Dedicated RPC provisioning |
| **14** | Emergency stop halts exits | Critical | Design tradeoff | Product decision — document, don't "fix" silently |

**Phase 1 focus:** Ranks 1–7 and 8 (documentation/UX portion). Ranks 9 and 14 are **pre-live gates**, not dry-run blockers. Do not defer rank 1 or 2 in favor of strategy tuning.

---

## Dependency graph

```text
                    ┌─────────────────────────┐
                    │ ACTIVE_MANIFEST.md      │
                    │ (canonical paths)       │
                    └───────────┬─────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
  Fix startup scripts    Quarantine archives      CI safety tests
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                ▼
                    ┌─────────────────────────┐
                    │ thesisMatch tagging     │
                    │ + dashboard segments    │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │ live_trades.jsonl       │
                    │ canonicalization        │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │ Unified state layer     │◄── blocks live arming
                    │ (atomic writes / locks) │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
     Process supervisor   Reconciliation UX   Dedup persistence
              │                 │                 │
              └─────────────────┼─────────────────┘
                                ▼
                    ┌─────────────────────────┐
                    │ Pre-live gates          │
                    │ (multi-source pricing,  │
                    │  dedicated RPC, auth)   │
                    └─────────────────────────┘
```

**Rule:** Do not start live arming work until rank **1** and **2** are resolved. Do not merge scanner/executor filters (DECISIONS) until **thesisMatch visibility** (rank 3) ships.

---

## Work streams

### Quick wins

Low risk, high clarity. Complete in days, not weeks. No strategy changes.

| # | Work item | Resolves | Effort | Owner hint |
|---|-----------|----------|--------|------------|
| Q1 | Fix `start_fomo.ps1` — `$PSScriptRoot`, validate `live_config.json` exists | Wrong-path launches | S | Ops |
| Q2 | Align `fomo_status.ps1` with same project path | Process visibility | S | Ops |
| Q3 | Publish `ACTIVE_MANIFEST.md` listing canonical root scripts | Duplicate-tree confusion | S | Docs / eng |
| Q4 | Mark archive folders read-only in README + OPERATIONS | Wrong-file edits | S | Docs |
| Q5 | Canonicalize dashboard on `live_trades.jsonl`; deprecate `.json` reads | Ledger split | M | Eng |
| Q6 | Wire `npm test` → core safety scripts (4 tests from ORI_MEMORY) | CI gap | M | Eng |
| Q7 | Add GitHub Actions workflow running safety tests on PR | CI gap | M | Eng |
| Q8 | Document mode transition runbook — **[MODE_TRANSITION.md](./MODE_TRANSITION.md)** (`PIPELINE_DRY_RUN` → live management) | Mode ambiguity | S | Docs |
| Q9 | Surface RPC source + public-fallback warning in dashboard | False disconnects | S | Eng |
| Q10 | Confirm runtime JSON stays gitignored; add `data/` convention note in MIGRATION_NOTES | Data pollution | S | Docs |

**Exit:** Quick wins complete when an operator can start all processes from the correct path, CI fails on signer guard regression, and dashboard live ledger matches executor output.

---

### Medium-term fixes

Meaningful engineering; 1–4 weeks each. Stabilize measurement and observation quality without architectural rewrite.

| # | Work item | Resolves | Depends on | Effort |
|---|-----------|----------|------------|--------|
| M1 | Persist `thesisMatch` on scanner handoff rows + pipeline queue | Thesis drift visibility | — | M |
| M2 | Dashboard segments: paper / thesis-eligible / pipeline observation | False live readiness | M1 | M |
| M3 | Persist pair cooldown map (or fully audit-derived dedup) | Restart dedup gaps | — | M |
| M4 | Scanner health metric: zero trending rows + GMGN error counts | Silent scanner failure | — | M |
| M5 | Heartbeat files per process (`last_scan_at`, `last_cycle_at`) + stale alerts | No supervisor | Q1 | M |
| M6 | Reconciliation dashboard panel (read `pending_reconciliation.jsonl`, link runbook) | Reconciliation UX | — | M |
| M7 | Single computed `liveArmed` status in `--status` + dashboard | Env flag confusion | — | M |
| M8 | Promotion checklist UI (paper / pipeline / live) tied to `LIVE_AUTHORIZATION_RECORD.md` | Paper ≠ live edge | M2 | M |
| M9 | Quarantine `automation/`, `hardreset/`, `harness/`, `files/`, `phase1_files/` outside active package or into `archive/` | Duplicate trees | Q3 | M |
| M10 | Move legacy scanners to `archive/`; README single entry point | Accidental wrong scanner | M9 | S |

**Exit:** Medium-term complete when thesis-segmented stats are default in dashboard, stale processes are detectable within 5 minutes, and reconciliation state is visible without opening raw JSONL.

---

### Architectural work

Required before live arming and before TracktaOS supervised deployment. Highest impact; plan carefully.

| # | Work item | Resolves | Depends on | Effort |
|---|-----------|----------|------------|--------|
| A1 | **Unified state module** — atomic append, locked config writes, single writer pattern for monitor close | File races (#1) | TracktaOS process model | L |
| A2 | **Process supervisor** — restart policy, safe-mode on config drift from `PIPELINE_DRY_RUN` | Overnight reliability | A1 partial, M5 | L |
| A3 | **Config change audit** — diff log to `live_control_events.jsonl`; optional auth token | Dashboard trust | M7 | M |
| A4 | **Dedicated RPC required** for pipeline observation readiness (not public fallback) | Flaky simulation | Env provisioning | M |
| A5 | **Multi-source exit pricing** — Jupiter sell quote vs DexScreener tolerance before stop/target | DexScreener-only risk | A1 stable monitor path | L |
| A6 | **Block automation when `pending_reconciliation.jsonl` non-empty** | Reconciliation safety | M6 | M |

**Pre-live gate (all required before `LIVE`):**

- A1 complete for `live_config.json`, `paper_trades.json`, `live_positions.json`
- A4 dedicated RPC configured and validated
- A5 exit price sanity (minimum viable: Jupiter quote check on exit path)
- A6 reconciliation block active
- CI green (Q6–Q7) for 30 days of executor changes

**Exit:** Architectural work Phase 1 slice complete when file races are eliminated in stress test (scanner + monitor + executor concurrent 24h) and pre-live checklist is enforceable in code, not honor system.

---

### Future opportunities

Valuable but **explicitly out of Phase 1 scope**. Track in ROADMAP; do not start until stabilization exit criteria met.

| Item | Phase | Notes |
|------|-------|-------|
| Versioned `CandidateIntent` JSON Schema | Cross-chain (Phase 4) | After state layer stable |
| Chain adapter / `SolanaExecutionAdapter` extraction | Cross-chain | Do not refactor executor until A1 done |
| GMGN API client replacing CLI subprocess | Scanner reliability | After M4 metrics prove CLI pain |
| Rename `paper_trades.json` → `.jsonl` | Hygiene | Breaking change — batch with A1 migration |
| Structured `metrics.jsonl` export | Ori / FOMO | After supervisor emits heartbeats |
| Wallet intelligence (exposure, drawdown sim) | Phase 2 ROADMAP | Read-only until approved |
| Graduated emergency halt (exit-only break-glass) | Product | Requires DECISIONS entry + authorization review |
| FOMO product dashboards and strategy profiles | Phase 5 | After stabilization + thesis visibility |
| Ori live ingestion pipeline | Phase 6 | ORI_MEMORY already written; ingest after metrics |
| Cross-chain discovery | Phase 4+ | Module 1 patterns only until Solana stable |

---

### Do-not-touch areas

These are **correct by design** or **dangerous to change casually**. Phase 1 must preserve them. Any change requires a new [DECISIONS.md](./DECISIONS.md) entry and safety test run.

| Area | Why leave alone in Phase 1 |
|------|----------------------------|
| **`PIPELINE_DRY_RUN` default** | Core safety decision; observation data still accumulating |
| **Live arming gate stack** | `FOMO_ENABLE_LIVE_SUBMISSION`, signer env, `positionSizeSol ≤ 0.01`, dedicated RPC — do not simplify |
| **Symmetric exits (+10% / −5% / 20 min)** | Paper/live alignment; strategy change ≠ stabilization |
| **Two-layer filters (wide scanner, narrow thesis)** | Do not merge filters; add visibility only (M1–M2) |
| **Append-only audit philosophy** | Never rewrite `execution_audit.jsonl`, `live_trades.jsonl`, control events |
| **Secret redaction + no signed bytes on disk** | Security contract in executor |
| **Reconciliation-over-retry behavior** | Never auto-retry ambiguous txSig |
| **−50% anomaly guard** | Prevents blind stop sells on bad data |
| **Emergency stop = full halt** | Operational hazard is known; changing semantics needs product decision |
| **Executor safety contract** (`loadConfig` ceilings, forbidden flags) | Refactor around it, not through it, without CI |
| **Runtime artifacts local** (`boosts.json`, `signals.json`, backups) | Correctly untracked — do not commit to "clean up" |
| **Archive folder code** | Do not edit in place — quarantine (M9), don't merge into root piecemeal |

**Explicit prohibition for Phase 1:**

- No `executionMode: LIVE` experiments in shared environments
- No strategy score / timeout / target tuning until M2 thesis-segmented stats exist
- No new scanner versions parallel to `scanner_gmgn_trending.js`
- No compounding, martingale, or multi-position features (hard-rejected in config)

---

## Recommended execution order

### Sprint 0 — Orientation (no code required)

- [ ] Read ENGINEERING_REVIEW onboarding checklist
- [ ] Run `node live_executor.js --status` — confirm `PIPELINE_DRY_RUN`
- [ ] Run all four core safety tests manually; record baseline pass
- [ ] Inventory which processes are actually running and from which directory
- [ ] Confirm runtime JSON is untracked (git clean except source)

### Sprint 1 — Quick wins (Q1–Q10)

Focus: paths, CI, manifest, ledger naming, documentation. Mode behavior and transitions: **[MODE_TRANSITION.md](./MODE_TRANSITION.md)** (Q8).

### Sprint 2 — Honest measurement (M1–M4, M6–M8)

Focus: thesis visibility, dedup persistence, reconciliation panel, promotion checklist.

### Sprint 3 — Operational reliability (M5, M9–M10, A3–A4)

Focus: heartbeats, archive quarantine, RPC requirement, config audit.

### Sprint 4 — Structural stabilization (A1, A2, A6)

Focus: state layer, supervisor, reconciliation block. **Only sprint that unblocks live discussion.**

### Deferred — Pre-live but post-Phase 1 core (A5, auth, multi-source pricing hardening)

Schedule after Sprint 4 exit review.

---

## Pre-live gate checklist

Do not approve live arming until every item is checked by a human operator (Ori may advise; humans authorize):

- [ ] A1 state layer deployed; 24h concurrent stress test passed
- [ ] CI safety suite green on main
- [ ] `thesisMatch` segmentation live in dashboard; promotion uses thesis-eligible stats only
- [ ] `pending_reconciliation.jsonl` workflow tested in drill
- [ ] Dedicated RPC configured; public fallback disabled for submission/simulation
- [ ] Multi-source exit pricing minimum viable (A5)
- [ ] `LIVE_AUTHORIZATION_RECORD.md` signed
- [ ] `RECONCILIATION_RUNBOOK.md` drill completed
- [ ] Emergency stop + manual exit procedure understood by operator
- [ ] `execution_audit.jsonl` sample reviewed for abort rate acceptability

---

## Metrics Ori should track weekly

| Metric | Source | Healthy signal | Warning |
|--------|--------|----------------|---------|
| Pipeline observations / day | `execution_audit.jsonl` | Steady non-zero in active market | Zero for 24h+ while scanner runs |
| Observation abort rate by code | `execution_audit.jsonl` | Known distribution | New failure codes or 100% abort |
| JSONL parse errors | `validate_data.js`, manual | Zero | Any parse error |
| Thesis-eligible vs total paper trades | `paper_trades.json` + thesis | Ratio understood | Paper wins cited without ratio |
| Process heartbeat age | future heartbeat files | < 2× cycle interval | Stale > 5 min |
| Open reconciliation rows | `pending_reconciliation.jsonl` | Zero | Any open row |
| CI safety tests | GitHub Actions | Green | Red on executor PR |
| Config mode drift | `live_config.json` | `PIPELINE_DRY_RUN` | Any LIVE without checklist |

---

## Document maintenance

When stabilization work completes:

1. Move resolved items to **Resolved** in [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
2. Add decision entries to [DECISIONS.md](./DECISIONS.md) for any do-not-touch changes
3. Update [ORI_MEMORY.md](./ORI_MEMORY.md) priorities and [TRACKTAOS_SUMMARY.md](./TRACKTAOS_SUMMARY.md) current state
4. Log phase transition in Obsidian [[Projects/Active/Solana Momentum Bot]] status table

---

## One-line Phase 1 mandate

**Understand the system honestly, stabilize infrastructure before features, and treat live trading as a gated exception—not the default outcome.**

---

*Phase 1 · Stabilization Plan · TracktaOS Module 1 · Baseline `16bf00a`*
