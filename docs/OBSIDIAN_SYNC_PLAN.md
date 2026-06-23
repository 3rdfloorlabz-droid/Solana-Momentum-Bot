# Sprint 2 M8b — Obsidian Memory Maintenance Framework

**Task ID:** M8b  
**Sprint:** 2 of 4 (Phase 1 — Understanding and Stabilization)  
**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Type:** Documentation and process design only  
**Parent:** [SPRINT_2_PLAN.md](./SPRINT_2_PLAN.md) · [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md)

---

## Mission

Create a **manual, conservative memory maintenance framework** so the TracktaOS Obsidian second brain stays aligned with **engineering truth in the repo** — without automation, MCP, plugins, file moves, or changes to strategy, execution gates, or `PIPELINE_DRY_RUN`.

**One-line mission:** Define where Obsidian notes live, which repo documents they mirror, how Ori’s living memory note is updated, and when humans refresh the vault — leaving all sync mechanics to a future sprint.

---

## Scope boundaries (read first)

| Item | M8b (this plan) | M8 (separate) | Sprint 3+ (deferred) |
|------|-----------------|---------------|----------------------|
| **Purpose** | Obsidian vault structure + manual sync cadence | Dashboard promotion checklist UI | Heartbeats, archive quarantine, config audit |
| **Deliverable** | This plan + human Obsidian folder layout | Read-only checklist panel in dashboard | M5, M9–M10, A3–A4 |
| **Code changes** | None | Dashboard / optional docs | Process supervisor, RPC enforcement |
| **Automation** | None | None | GitHub → Obsidian sync, MCP, webhooks |
| **Strategy / arming** | Do not touch | Display gates only; no arming | Operational reliability |

**M8b is documentation-only.** It does not replace repo `docs/` as source of truth. Obsidian is a **read-optimized mirror and briefing layer** for Ori, operators, and stakeholders.

**Operating constraint (unchanged):** `PIPELINE_DRY_RUN` remains default. M8b must never imply live authorization or strategy changes.

---

## Problem statement

TracktaOS already maintains strong engineering memory in the repo:

- Phase and sprint plans (`STABILIZATION_PLAN.md`, `SPRINT_*_PLAN.md`)
- Decision and lesson registries (`DECISIONS.md`, `LESSONS_LEARNED.md`)
- Risk registry (`KNOWN_ISSUES.md`)
- Ori briefing (`ORI_MEMORY.md`, `TRACKTAOS_SUMMARY.md`)
- Canonical runtime map (`ACTIVE_MANIFEST.md`)

[STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) § Document maintenance already says: *“Log phase transition in Obsidian [[Projects/Active/Solana Momentum Bot]] status table”* — but **no vault structure, mirror list, or cadence** exists yet. Without M8b, Obsidian drifts from repo truth after every sprint merge.

---

## Design principles

1. **Repo wins.** Git-tracked `docs/` and root `ACTIVE_MANIFEST.md` are authoritative. Obsidian copies are refreshed manually until automation is explicitly approved.
2. **Mirror, don’t fork.** Obsidian notes should link back to repo paths; avoid editing Obsidian-only “truth” that contradicts the codebase.
3. **Separate living status from deep briefing.** Repo `docs/ORI_MEMORY.md` stays the long-form orientation doc. Obsidian `Ori/ORI_MEMORY.md` is a **short living status note** updated on cadence.
4. **No moves, no archive edits.** Do not relocate repo files or edit `automation/`, `hardreset/`, etc. Obsidian receives copies or wikilinks only.
5. **Conservative cadence.** Update on events that change engineering truth — not on every commit.
6. **Investor vs engineering separation.** Investor Updates and White Papers folders hold outward-facing narrative; engineering registries stay in their own folders.

---

## Canonical Obsidian vault structure

Recommended vault root (adjust top-level name to match your existing TracktaOS vault; module path shown as nested project):

```text
TracktaOS/                          # vault root (existing)
└── Projects/
    └── Active/
        └── Solana Momentum Bot/    # module hub — links to all folders below
            ├── Current/            # 1. Current folder
            ├── Sprint/             # 2. Sprint folder
            ├── Architecture/       # 3. Architecture folder
            ├── Decisions/          # 4. Decisions folder
            ├── Lessons/            # 5. Lessons folder
            ├── Known Issues/       # 6. Known Issues folder
            ├── Investor Updates/   # 7. Investor Updates folder
            ├── White Papers/       # 8. White Papers folder
            └── Ori/                # 9. Ori folder
```

### Module hub note

Create **`Projects/Active/Solana Momentum Bot.md`** (or reuse existing) as the index:

- Links to all nine folders
- One-table **phase / sprint status** (manual)
- Link to repo: `C:\TracktaOS\Projects\Active\Solana-Momentum-Bot`
- Last synced date (manual field)

---

## Folder definitions and mirror map

### 1. Current folder

**Purpose:** “What is true right now” — executive snapshot, manifest, stabilization phase, operator posture.

| Obsidian note | Repo source | Mirror policy |
|---------------|-------------|---------------|
| `Current/TRACKTAOS Summary` | [docs/TRACKTAOS_SUMMARY.md](./TRACKTAOS_SUMMARY.md) | Full mirror on phase change + sprint completion |
| `Current/Active Manifest` | [ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) | Mirror when manifest changes (Q3-style updates) |
| `Current/Stabilization Plan` | [docs/STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) | Mirror on phase transition or ranked-problem reorder |
| `Current/Operations Quick Ref` | [docs/OPERATIONS.md](./OPERATIONS.md) | Mirror when ops procedures change |
| `Current/Module Status Table` | *(Obsidian-native)* | **Living table only** — sprint, milestone, last `--status` check, link to Ori note |

**Do not mirror here:** task-level sprint plans (→ Sprint folder), raw issue registry (→ Known Issues).

---

### 2. Sprint folder

**Purpose:** Sprint execution history — plans, reviews, task plans, exit criteria checklists.

| Obsidian note | Repo source | Mirror policy |
|---------------|-------------|---------------|
| `Sprint/Sprint 1 Plan` | [docs/SPRINT_1_PLAN.md](./SPRINT_1_PLAN.md) | Once at sprint close (frozen) |
| `Sprint/Sprint 1 Review` | [docs/SPRINT_1_REVIEW.md](./SPRINT_1_REVIEW.md) | At sprint close |
| `Sprint/Sprint 2 Plan` | [docs/SPRINT_2_PLAN.md](./SPRINT_2_PLAN.md) | At sprint start; refresh if plan amended |
| `Sprint/Sprint 2 Exit Checklist` | Derived from SPRINT_2_PLAN exit criteria | Obsidian checklist mirroring repo checkboxes |
| `Sprint/Task Plans/` | `docs/M*_PLAN.md`, `docs/Q*_PLAN.md` | Mirror when task ships or plan superseded |
| `Sprint/Sprint 3 Plan` | *(future)* | Create when Sprint 3 plan lands in repo |

**Sprint 2 task plans already in repo (mirror as shipped):**

- [M1_M2_THESIS_VISIBILITY_PLAN.md](./M1_M2_THESIS_VISIBILITY_PLAN.md)
- [M3_DEDUP_PERSISTENCE_PLAN.md](./M3_DEDUP_PERSISTENCE_PLAN.md)
- [M4_SCANNER_HEALTH_PLAN.md](./M4_SCANNER_HEALTH_PLAN.md)
- [M6A_RECONCILIATION_PANEL_PLAN.md](./M6A_RECONCILIATION_PANEL_PLAN.md)
- [M7_LIVE_ARMED_PLAN.md](./M7_LIVE_ARMED_PLAN.md)
- [OBSIDIAN_SYNC_PLAN.md](./OBSIDIAN_SYNC_PLAN.md) *(this document — M8b)*

**Defer to Sprint folder, not Current:** granular Q1–Q10 plans unless referenced in a review.

---

### 3. Architecture folder

**Purpose:** System structure, modes, and deep onboarding — stable reference, slower refresh.

| Obsidian note | Repo source | Mirror policy |
|---------------|-------------|---------------|
| `Architecture/System Architecture` | [docs/ARCHITECTURE.md](./ARCHITECTURE.md) | On architectural change |
| `Architecture/Engineering Review` | [docs/ENGINEERING_REVIEW.md](./ENGINEERING_REVIEW.md) | After major module changes or quarterly |
| `Architecture/Mode Transition Runbook` | [docs/MODE_TRANSITION.md](./MODE_TRANSITION.md) | When mode behavior or gates change |
| `Architecture/Strategy Reference` | [docs/STRATEGY.md](./STRATEGY.md) | **Read-only mirror** — strategy protected; no Obsidian-only edits |
| `Architecture/Data Flow Diagram` | *(Obsidian-native)* | Optional mermaid; must match ARCHITECTURE.md |

**Protected:** Do not use Architecture folder to propose filter, exit, or arming changes without a repo `DECISIONS.md` entry.

---

### 4. Decisions folder

**Purpose:** Institutional “why we chose X” — append-only culture mirrored from repo.

| Obsidian note | Repo source | Mirror policy |
|---------------|-------------|---------------|
| `Decisions/DECISIONS Log` | [docs/DECISIONS.md](./DECISIONS.md) | After every major decision entry in repo |
| `Decisions/CHANGELOG` | [docs/CHANGELOG.md](./CHANGELOG.md) | On release-worthy doc or ops changes |

**Rule:** New decisions are **written in repo first**, then mirrored to Obsidian. Never decide in Obsidian only.

---

### 5. Lessons folder

**Purpose:** Wins, mistakes, principles — team memory for Ori and onboarding.

| Obsidian note | Repo source | Mirror policy |
|---------------|-------------|---------------|
| `Lessons/LESSONS LEARNED` | [docs/LESSONS_LEARNED.md](./LESSONS_LEARNED.md) | After sprint review or incident postmortem |
| `Lessons/Incident Notes/` | *(Obsidian-native)* | Optional; must link to repo KNOWN_ISSUES / DECISIONS if actionable |

---

### 6. Known Issues folder

**Purpose:** Risk registry and resolution status — must stay aligned with engineering tracker.

| Obsidian note | Repo source | Mirror policy |
|---------------|-------------|---------------|
| `Known Issues/KNOWN ISSUES Registry` | [docs/KNOWN_ISSUES.md](./KNOWN_ISSUES.md) | After any issue status change (resolved / partially resolved) |
| `Known Issues/Open Reconciliation Watch` | *(Obsidian-native)* | Weekly while `pending_reconciliation.jsonl` non-empty; links runbook |

**Critical:** Partially resolved Sprint 2 items (M1+M2 thesis, M3 dedup, M4 scanner health, M6a reconciliation, M7 liveArmed) must reflect repo status strings — do not mark “resolved” in Obsidian ahead of repo.

---

### 7. Investor Updates folder

**Purpose:** Outward-facing narrative — safe summaries without operator secrets or live arming instructions.

| Obsidian note | Repo source | Mirror policy |
|---------------|-------------|---------------|
| `Investor Updates/Executive Summary` | Derived from [TRACKTAOS_SUMMARY.md](./TRACKTAOS_SUMMARY.md) | Trimmed copy; refresh on investor report cadence |
| `Investor Updates/YYYY-MM-DD Update` | *(Obsidian-native)* | New note per report; cite repo sprint review + metrics |
| `Investor Updates/Risk Framing` | KNOWN_ISSUES investor framing section | Mirror when risk posture messaging changes |

**Exclude:** `.env` contents, signer material, RPC keys, raw JSONL, authorization records with secrets.

---

### 8. White Papers folder

**Purpose:** Long-horizon thesis documents — product, cross-chain, FOMO, Ori ecosystem.

| Obsidian note | Repo source | Mirror policy |
|---------------|-------------|---------------|
| `White Papers/Roadmap` | [docs/ROADMAP.md](./ROADMAP.md) | On phase roadmap revision |
| `White Papers/TracktaOS Module 1 Thesis` | [docs/TRACKTAOS_SUMMARY.md](./TRACKTAOS_SUMMARY.md) § TracktaOS Role + vision | Quarterly or phase change |
| `White Papers/FOMO Product Vision` | ORI_MEMORY § FOMO + ROADMAP Phase 5 | When product narrative shifts |
| `White Papers/Ideas Backlog` | [docs/IDEAS.md](./IDEAS.md) | Optional mirror; not engineering truth |

**Note:** No dedicated white-paper PDFs exist in repo yet. This folder holds narrative drafts; engineering truth remains in repo docs.

---

### 9. Ori folder

**Purpose:** Ori’s operational memory — living status, check-ins, weekly summaries, links to registries.

| Obsidian note | Repo source | Mirror policy |
|---------------|-------------|---------------|
| `Ori/ORI_MEMORY` | **Living note — see § below** | Per cadence table |
| `Ori/ORI Deep Briefing` | [docs/ORI_MEMORY.md](./ORI_MEMORY.md) | Mirror when repo briefing materially updated |
| `Ori/Sprint N Check-in` | *(Obsidian-native)* | End of each sprint + mid-sprint if scope shifts |
| `Ori/Weekly Summary YYYY-Www` | *(Obsidian-native)* | Weekly during active development |

---

## Documents that should be mirrored (summary)

### Always mirror (high drift risk)

| Document | Primary Obsidian folder |
|----------|-------------------------|
| [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) | Known Issues |
| [DECISIONS.md](./DECISIONS.md) | Decisions |
| [ORI_MEMORY.md](./ORI_MEMORY.md) | Ori (deep briefing) |
| [SPRINT_2_PLAN.md](./SPRINT_2_PLAN.md) | Sprint |
| [TRACKTAOS_SUMMARY.md](./TRACKTAOS_SUMMARY.md) | Current + Investor Updates (trimmed) |

### Mirror on sprint boundary

| Document | Folder |
|----------|--------|
| [SPRINT_1_PLAN.md](./SPRINT_1_PLAN.md), [SPRINT_1_REVIEW.md](./SPRINT_1_REVIEW.md) | Sprint |
| [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) | Current |
| [LESSONS_LEARNED.md](./LESSONS_LEARNED.md) | Lessons |
| [ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) | Current |

### Mirror on architectural / ops change

| Document | Folder |
|----------|--------|
| [ARCHITECTURE.md](./ARCHITECTURE.md), [ENGINEERING_REVIEW.md](./ENGINEERING_REVIEW.md) | Architecture |
| [OPERATIONS.md](./OPERATIONS.md), [MODE_TRANSITION.md](./MODE_TRANSITION.md) | Architecture / Current |
| [ROADMAP.md](./ROADMAP.md) | White Papers |

### Link only (do not duplicate unless needed)

| Document | Reason |
|----------|--------|
| `live_config.json`, runtime JSONL | Operational data — local only, gitignored |
| `.env`, `.env.example` | Secrets / env template |
| Archive folders | Non-canonical per ACTIVE_MANIFEST |
| Task plans for completed sprints | Mirror once when shipped; then frozen |

---

## Ori living note design — `Ori/ORI_MEMORY.md`

Repo [ORI_MEMORY.md](./ORI_MEMORY.md) is the **deep briefing** (identity, risks, decisions, long-term vision). Obsidian **`Ori/ORI_MEMORY.md`** is a **short living status note** updated on cadence. Keep it scannable in under two minutes.

### Required fields (template)

```markdown
# Ori Memory — Living Status

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Last updated:** YYYY-MM-DD (human)  
**Repo sync ref:** `github-clean` @ `<short-sha>` · [ACTIVE_MANIFEST](../Current/Active%20Manifest)

---

## Current sprint

| Field | Value |
|-------|-------|
| Phase | Phase 1 — Understanding and Stabilization |
| Sprint | 2 — Honest measurement (M1–M4, M6–M8) |
| Sprint status | In progress / Complete / Blocked |
| Parent plan | [[Sprint/Sprint 2 Plan]] |

---

## Current milestone

| Field | Value |
|-------|-------|
| Active milestone | M8b — Obsidian memory framework (docs) |
| Next code milestone | M8 — Promotion checklist panel |
| Blocked by | — |

---

## Recent accomplishments

*(Bullet list; max 5 — newest first. Cite sprint task IDs.)*

- M4 — Scanner health snapshot + dashboard panel (2026-06-22)
- M3 — Observation dedup persistence (`observation_dedup.json`)
- M1+M2 — `thesisMatch` on handoff rows + dashboard segmentation
- M6a — Read-only reconciliation panel
- M7 — `liveArmed` computed status in `--status` + dashboard

---

## Deferred work

*(Explicit deferrals — do not imply completion.)*

| Item | Deferred to | Notes |
|------|-------------|-------|
| M8 Promotion checklist UI | Sprint 2 (remaining) | Separate from M8b |
| M6 full reconciliation polish | Sprint 2 soft / Sprint 3 | M6a shipped read-only |
| A1 Unified state layer | Sprint 4 | File races remain |
| Obsidian automation / MCP / GitHub sync | Post–Sprint 3 | M8b manual only |
| Live arming | Pre-live gate checklist | Not authorized in Phase 1 |

---

## Operational posture

| Signal | Expected | Actual (last verified) |
|--------|----------|-------------------------|
| Posture label | `PIPELINE_OBSERVING` | *(from `--status`)* |
| Processes running | Scanner / monitor / executor / dashboard optional | *(operator note)* |
| Open reconciliation rows | Zero or runbook-owned | *(count or “unknown”)* |
| Scanner health | HEALTHY or explained DEGRADED | *(from dashboard or file)* |
| CI on main | Green | *(link to last Actions run)* |

**Last operator check:** `node live_executor.js --status` on YYYY-MM-DD

---

## Execution mode

| Field | Value |
|-------|-------|
| `executionMode` | `PIPELINE_DRY_RUN` |
| `dryRunMode` | `true` |
| Live submission | DISARMED |
| Automation enabled | *(from config — note if toggled)* |
| Emergency stop | *(true/false)* |

---

## liveArmed status

| Field | Value |
|-------|-------|
| `liveArmed` | **false** *(must match `--status`)* |
| Gate summary | *(paste disarmed reasons count only — no secrets)* |
| Promotion narrative allowed? | **No** — observation only until pre-live checklist |

> Ori advises; humans authorize. This note does not arm live trading.

---

## Links

- [[Known Issues/KNOWN ISSUES Registry]]
- [[Decisions/DECISIONS Log]]
- [[Lessons/LESSONS LEARNED]]
- [[Current/TRACKTAOS Summary]]
- Repo: `docs/ORI_MEMORY.md` (deep briefing)
```

### Field update rules

| Field | Update when |
|-------|-------------|
| Current sprint | Sprint start, sprint close, or scope amendment in repo plan |
| Current milestone | Task start/ship/defer documented in sprint plan or review |
| Recent accomplishments | Sprint task merge, sprint review, or investor report prep |
| Deferred work | Any explicit deferral in sprint/architecture plans |
| Operational posture | Weekly summary, operator check-in, or incident |
| Execution mode | Any config change, mode transition doc update, or `--status` drift |
| liveArmed | After every `--status` during active ops; mandatory before investor updates |

---

## Update cadence

Manual refresh only. Suggested minimum:

| Event | Obsidian actions | Primary notes to update |
|-------|------------------|-------------------------|
| **Sprint completion** | Full module sync | Sprint review, KNOWN_ISSUES, DECISIONS, LESSONS, TRACKTAOS_SUMMARY, Ori/ORI_MEMORY living + deep briefing, Module Status Table |
| **Major decision** | Same day | DECISIONS mirror + Ori living note if posture affected |
| **Investor reports** | Before send | Investor Updates note, TRACKTAOS summary trim, Ori liveArmed + execution mode, risk framing from KNOWN_ISSUES |
| **Weekly summaries** | Once per week (active dev) | Ori/ORI_MEMORY living, Module Status Table, optional Weekly Summary note |
| **Live authorization events** | Immediately (if ever) | DECISIONS, KNOWN_ISSUES, Ori living (all execution fields), Investor Updates only after human approval |

### Weekly summary note template (Ori folder)

`Ori/Weekly Summary YYYY-Www.md`:

1. Sprint task progress (IDs only)
2. `--status` snapshot table (mode, liveArmed, readiness)
3. Open KNOWN_ISSUES count by severity
4. Reconciliation queue status
5. Thesis-segmented observation (not aggregate paper wins)
6. Next week focus + explicit deferrals

---

## Manual sync procedure (M8b — no automation)

Until deferred automation exists, use this checklist:

```text
1. Pull latest repo main / working branch
2. Run: node live_executor.js --status  (record mode + liveArmed)
3. For each changed repo doc in mirror map → copy into Obsidian note
4. Update Ori/ORI_MEMORY living fields + Last updated date
5. Update Module Status Table last synced date
6. Do NOT commit Obsidian vault to bot repo unless separate TracktaOS policy exists
```

**Conflict rule:** If Obsidian and repo disagree, **repo wins**. Fix Obsidian.

---

## M8b vs M8 vs Sprint 3 (explicit separation)

### M8b — Obsidian memory maintenance *(this plan)*

- Vault folder structure
- Mirror map and cadence
- Living `Ori/ORI_MEMORY.md` design
- Manual sync procedure
- **No code, no dashboard, no plugins, no MCP**

**Sprint 2 placement:** Soft gate companion to M8 ([SPRINT_2_PLAN.md](./SPRINT_2_PLAN.md) SC7 references promotion checklist docs; M8b ensures Ori/investor memory stays honest while M8 UI ships).

### M8 — Promotion checklist *(separate engineering task)*

- Read-only dashboard panel
- Paper → pipeline → live gates tied to `LIVE_AUTHORIZATION_RECORD.md` + [MODE_TRANSITION.md](./MODE_TRANSITION.md)
- Surfaces gate pass/fail; **does not authorize live**
- Code touch: `dashboard_server.js` (+ optional ops docs)

**M8b does not implement M8.** M8b may link to M8 screenshots or checklist text once published.

### Sprint 3 — Operational reliability *(not M8b)*

From [SPRINT_2_PLAN.md](./SPRINT_2_PLAN.md) preview:

| ID | Focus |
|----|-------|
| M5 | Heartbeat files + stale process alerts |
| M9–M10 | Archive quarantine; legacy scanner retirement |
| A3 | Config change audit trail |
| A4 | Dedicated RPC required for pipeline readiness |

Sprint 3 may **consume** Obsidian-maintained runbooks but does not replace M8b manual sync.

---

## Deferred opportunities (do not implement in M8b)

Listed for future planning only:

| Opportunity | Why deferred | Possible owner sprint |
|-------------|--------------|------------------------|
| GitHub Actions → Obsidian sync on `docs/` change | Requires vault API or git submodule policy | Sprint 4+ |
| MCP server for repo read / status injection | Explicitly out of M8b scope | Phase 5 / Ori integration |
| Scheduled weekly Obsidian template generation | Automation not approved | Sprint 3 discussion |
| `node live_executor.js --status` → markdown export | Nice-to-have; manual copy sufficient for M8b | Optional small script sprint |
| Obsidian Dataview / Templater plugins | User constraint: no plugins | — |
| Bi-directional sync (Obsidian → repo) | Risk of forked truth | Not recommended |

---

## Acceptance criteria (M8b complete)

M8b is done when all are true **without code changes**:

| # | Criterion | Verification |
|---|-----------|--------------|
| AC1 | This plan published at `docs/OBSIDIAN_SYNC_PLAN.md` | Doc review |
| AC2 | Nine-folder vault structure created in Obsidian (empty notes OK) | Visual vault review |
| AC3 | Module hub note links all folders + repo path | Click-through |
| AC4 | Mirror map executed for Current, Sprint, Known Issues, Decisions, Ori | Spot-check 5 notes vs repo |
| AC5 | `Ori/ORI_MEMORY.md` living template populated with current Sprint 2 state | Ori review |
| AC6 | Manual sync procedure tested once after a doc change | Operator sign-off |
| AC7 | M8, M8b, Sprint 3 boundaries documented (this file § separation) | Sprint lead review |
| AC8 | No strategy, PIPELINE_DRY_RUN, or archive changes | Git diff clean on code |

---

## Recommended execution order (M8b only)

```text
1. Create vault folders + module hub note
2. Initial mirror: KNOWN_ISSUES, DECISIONS, SPRINT_2_PLAN, TRACKTAOS_SUMMARY, ACTIVE_MANIFEST
3. Create Ori/ORI_MEMORY living note from template § above
4. Mirror repo ORI_MEMORY.md → Ori/ORI Deep Briefing
5. Run first weekly summary after next operator `--status` check
6. Mark M8b complete in Sprint 2 exit checklist (soft gate)
```

Parallel safe: M8b docs work while M8 dashboard engineering proceeds — no dependency either direction.

---

## Related documents

| Document | Relationship |
|----------|--------------|
| [SPRINT_2_PLAN.md](./SPRINT_2_PLAN.md) | M8 promotion checklist; M8b companion |
| [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) | Phase 1 doc maintenance § Obsidian status table |
| [ORI_MEMORY.md](./ORI_MEMORY.md) | Repo deep briefing — source for Ori/Deep Briefing mirror |
| [TRACKTAOS_SUMMARY.md](./TRACKTAOS_SUMMARY.md) | Executive mirror source |
| [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) | Risk registry mirror source |
| [ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) | Canonical path mirror |

---

*Sprint 2 M8b · Obsidian memory maintenance framework · Documentation only · No automation · Repo is source of truth*
