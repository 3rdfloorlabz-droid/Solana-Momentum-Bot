# Q8 — Mode Transition Runbook (Plan)

**Sprint:** 1  
**Task:** Q8 (plan only — no code changes in this document)  
**Goal:** Publish an operator runbook so mode behavior and transition requirements are documented — especially that `PIPELINE_DRY_RUN` skips live position management.  
**Reference:** [SPRINT_1_PLAN.md](./SPRINT_1_PLAN.md) § Q8 · Success criterion **SC7**  
**Acceptance (from sprint):** An operator can answer what the executor does and does not do in each mode **without reading source code**.

---

## What Q8 is supposed to accomplish

Sprint 1 problem: **mode ambiguity**. The executor supports three explicit modes (`DRY_RUN`, `PIPELINE_DRY_RUN`, `LIVE`), but behavior differences — especially **`PIPELINE_DRY_RUN` never calling `manageOpenPositions`** — are scattered across comments, KNOWN_ISSUES, and operator memory.

**Q8 is documentation only.** It does not change runtime behavior, config defaults, strategy, or `PIPELINE_DRY_RUN` logic.

| Deliverable | Purpose |
|-------------|---------|
| **`docs/MODE_TRANSITION.md`** (primary) | Canonical runbook: per-mode behavior, what changes on flip, pre-flip checklist, Sprint 1 prohibition banner |
| **Links from `docs/OPERATIONS.md`** | Operators find the runbook during daily ops |
| **Links from `docs/STABILIZATION_PLAN.md`** | Stabilization track references the same doc |

**Alternative rejected for Q8 minimum:** A long new section only inside OPERATIONS — harder to link from STABILIZATION_PLAN and mixes daily ops with mode-transition ceremony. Sprint allows either; **dedicated file + short OPERATIONS pointer** is the minimal safe structure.

---

## Current state (inspected)

### Existing documentation (partial, fragmented)

| Document | What it already says |
|----------|----------------------|
| [OPERATIONS.md](./OPERATIONS.md) | Preflight expects `PIPELINE_DRY_RUN`; lists env flags to avoid; warns against `LIVE` during migration |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | One-paragraph mode definitions |
| [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) | Q8 backlog item; pre-live gates; prohibition on `LIVE` experiments in Phase 1 |
| [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) | **`PIPELINE_DRY_RUN` skips open live position management** — solution: document mode transition |
| [LESSONS_LEARNED.md](./LESSONS_LEARNED.md) | Same skip called out; mode flip needs explicit runbook |
| [LIVE_AUTHORIZATION_RECORD.md](../LIVE_AUTHORIZATION_RECORD.md) | Formal LIVE authorization checklist (separate from day-to-day mode explanation) |
| [RECONCILIATION_RUNBOOK.md](../RECONCILIATION_RUNBOOK.md) | Required before ambiguous-tx retry / live promotion conversations |

**Gap:** No single doc explains **per-cycle executor behavior** by mode or a **ordered transition procedure** from observation → live management.

### Source of truth (read-only for Q8 — cite in runbook, do not edit)

Behavior is implemented in root **`live_executor.js`**:

| Mechanism | Mode behavior (factual summary for runbook) |
|-----------|-----------------------------------------------|
| `resolveExecutionMode(cfg)` | Uses explicit `cfg.executionMode` when set to `DRY_RUN`, `PIPELINE_DRY_RUN`, or `LIVE`; otherwise legacy fallback from `dryRunMode` |
| `runCycle()` | **`PIPELINE_DRY_RUN`:** skips `manageOpenPositions`; runs `observePipelineCandidate` for entries. **`DRY_RUN` / `LIVE`:** calls `manageOpenPositions` every cycle (unless emergency stop); entries via `enterPosition` when automation on |
| `submitSwap()` | **`DRY_RUN`:** synthetic intent, no Jupiter pipeline. **`PIPELINE_DRY_RUN`:** quote → route → build → simulate; **no signing/submission**. **`LIVE`:** same pipeline + sign/submit when `assertLiveSubmissionArmed` passes |
| `findCandidates()` | **`LIVE`:** strict thesis from open paper pool. **`PIPELINE_DRY_RUN`:** pipeline queue + broad observation pool. **`DRY_RUN`:** strict thesis (legacy entry path) |
| `readinessChecks()` | LIVE requires full gate stack; non-LIVE expects dry-run posture and `PIPELINE_DRY_RUN` milestone check |

Key code anchor (for runbook citation, not Q8 edit):

```2543:2572:live_executor.js
  // PIPELINE_DRY_RUN is observation-only and never manages operational state.
  if (mode !== "PIPELINE_DRY_RUN") {
    try { await manageOpenPositions(cfg); }
    ...
  }
  ...
  if (mode === "PIPELINE_DRY_RUN") {
    ...
    return finishCycle(await observePipelineCandidate(cfg, candidate));
```

### Config today (tracked `live_config.json`)

Expected Phase 1 / Sprint 1 posture:

- `executionMode: "PIPELINE_DRY_RUN"`
- `dryRunMode: true`
- `automationEnabled` — operational toggle (tests/CI may differ temporarily; runbook should describe intent, not test harness overrides)

### What Q8 does **not** need to duplicate

- Full LIVE sign-off ceremony → link **[LIVE_AUTHORIZATION_RECORD.md](../LIVE_AUTHORIZATION_RECORD.md)**
- Reconciliation procedures → link **[RECONCILIATION_RUNBOOK.md](../RECONCILIATION_RUNBOOK.md)**
- Architecture deep dive → link **[ARCHITECTURE.md](./ARCHITECTURE.md)**
- Strategy / thesis bounds → **do not touch** (reference `live_config.json` thesis section as read-only context only)

---

## Proposed content outline for `docs/MODE_TRANSITION.md`

Minimal sections (Sprint-sized, ~2–3 hours):

### 1. Banner — Sprint 1 / Phase 1 constraint

> **Do not change `executionMode` away from `PIPELINE_DRY_RUN` during Sprint 1 stabilization** unless following the full LIVE authorization path with explicit written approval. Sprint 1 success criteria (SC10) expect `--status` to still show `PIPELINE_DRY_RUN`.

### 2. Mode summary table

| | `PIPELINE_DRY_RUN` (default) | `DRY_RUN` (legacy) | `LIVE` |
|---|------------------------------|---------------------|--------|
| **Purpose** | Observe real swap pipeline without moving funds | Legacy synthetic entry intent | Real execution |
| **`manageOpenPositions`** | **Not called** | Called each cycle | Called each cycle |
| **Entry path** | `observePipelineCandidate` (audit-only) | `enterPosition` + synthetic `submitSwap` | `enterPosition` + full submit path |
| **Signing / submission** | Never | Never | Only when gate stack armed |
| **Candidate pool** | Pipeline queue + observation pool | Strict thesis open paper | Strict thesis open paper |
| **Typical `dryRunMode`** | `true` | `true` | must be `false` |
| **Creates `live_positions.json` entries** | No (observation only) | Can (dry entries) | Yes (real) |

### 3. What each mode does **not** do

Especially for **`PIPELINE_DRY_RUN`**:

- Does not exit or manage open live positions (no target/stop/timeout on `live_positions.json`)
- Does not sign or submit transactions
- Does not replace paper monitor (`monitor.js` still manages **paper** trades separately)

### 4. Config fields that control mode

- Primary: `live_config.json` → `executionMode`
- Legacy interaction: `dryRunMode` when `executionMode` omitted (runbook warns: always set `executionMode` explicitly)
- Verification command:

```powershell
node live_executor.js --status
```

Expected safe output includes `executionMode: PIPELINE_DRY_RUN`, `dryRunMode: true`.

### 5. Transition paths (documentation only — no automation in Q8)

Document **three conceptual transitions** (not encouraging Sprint 1 execution):

| Transition | Risk | Runbook must state |
|------------|------|-------------------|
| Stay on **`PIPELINE_DRY_RUN`** | Lowest | Default; accumulate `execution_audit.jsonl` observations |
| **`PIPELINE_DRY_RUN` → `DRY_RUN`** | Medium | **`manageOpenPositions` begins running**; entry semantics change; rarely needed in Phase 1 |
| **`PIPELINE_DRY_RUN` → `LIVE`** | Highest | Requires [LIVE_AUTHORIZATION_RECORD.md](../LIVE_AUTHORIZATION_RECORD.md), env gates, dedicated RPC, reconciliation clear, CI green |

**Wind-down before leaving `PIPELINE_DRY_RUN`:**

1. Stop automation (`automationEnabled: false` or dashboard STOP).
2. Review `execution_audit.jsonl` and `live_errors.jsonl`.
3. Confirm `live_positions.json` state (expect empty or explicitly understood).
4. Confirm `pending_reconciliation.jsonl` empty ([RECONCILIATION_RUNBOOK.md](../RECONCILIATION_RUNBOOK.md)).
5. Run `npm test` / confirm CI green.
6. Only then consider config/env changes — with authorization record for LIVE.

### 6. Pre-flip checklist (condensed)

Consolidate from OPERATIONS, LIVE_AUTHORIZATION_RECORD, and `assertLiveSubmissionArmed` / `readinessChecks` (documentary list, not code):

- [ ] Written authorization (LIVE only)
- [ ] `npm test` passes
- [ ] `node validate_live_system.js` reviewed (optional but recommended)
- [ ] Dedicated RPC configured (required before LIVE)
- [ ] Signer env **not** loaded until LIVE ceremony
- [ ] `FOMO_ENABLE_LIVE_SUBMISSION=YES` only at LIVE flip
- [ ] First-live size ≤ 0.01 SOL (stricter than config ceiling 0.10)
- [ ] Operator understands **`manageOpenPositions` will run** after leaving `PIPELINE_DRY_RUN`
- [ ] Emergency stop clear (`reset_live_safety.js` if needed)

### 7. Related commands and logs

| Action | Command / file |
|--------|----------------|
| Status | `node live_executor.js --status` |
| Single cycle (avoid in migration) | `node live_executor.js --cycle` |
| Safety reset | `node reset_live_safety.js` |
| Audit trail | `execution_audit.jsonl`, `live_control_events.jsonl` |

### 8. Cross-links

- [OPERATIONS.md](./OPERATIONS.md)
- [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md)
- [ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md)
- [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) — pipeline skip issue

---

## Minimal safe change (implementation scope)

**Files to add/ edit (docs only):**

| File | Action |
|------|--------|
| **`docs/MODE_TRANSITION.md`** | **Create** — content per outline above |
| **`docs/OPERATIONS.md`** | Add short **“Mode transitions”** subsection (~5–10 lines) linking to `MODE_TRANSITION.md`; avoid duplicating the full table |
| **`docs/STABILIZATION_PLAN.md`** | Link Q8 row / Phase 1 docs list to `MODE_TRANSITION.md` |
| **`docs/KNOWN_ISSUES.md`** | Update **`PIPELINE_DRY_RUN` skips open live position management** — point to runbook; status “documented” or partial → resolved for doc gap |
| **`docs/ARCHITECTURE.md`** | Optional one-line link to `MODE_TRANSITION.md` under Execution section |

**Files explicitly not changed in Q8:**

- `live_executor.js`, `monitor.js`, scanner, dashboard
- Archive folders
- `.github/workflows/`
- `live_config.json`

**No executor logic changes** — Q8 does not require them; the known issue’s “config guard” is a future enhancement (out of scope).

---

## Preserve behavior

| Area | Q8 impact |
|------|-----------|
| Runtime / strategy | None — docs only |
| `PIPELINE_DRY_RUN` default | Documented, not altered |
| CI / tests | No change |
| Config on disk | No change |

Post-Q8 smoke (SC10, manual): `node live_executor.js --status` still shows `PIPELINE_DRY_RUN` on unchanged config.

---

## Risks

| Risk | Level | Mitigation |
|------|-------|------------|
| **Doc drift** from future executor edits | Medium | Cite function names + link to `live_executor.js`; add “last verified” note in MODE_TRANSITION |
| **Operators treat doc as LIVE approval** | Medium | Prominent link to LIVE_AUTHORIZATION_RECORD; Sprint 1 “do not flip” banner |
| **Contradicting OPERATIONS** | Low | OPERATIONS stays procedural; MODE_TRANSITION owns mode matrix; cross-review during implementation |
| **Scope creep into live arming implementation** | Medium | Q8 lists checks; does not add new env validation code |
| **Accidental code change** | Low | Plan restricts to markdown + links |

---

## Acceptance criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| AC1 | **`docs/MODE_TRANSITION.md` exists** | File present in repo |
| AC2 | Documents **`PIPELINE_DRY_RUN` skips `manageOpenPositions`** | Explicit section + table |
| AC3 | Describes **`DRY_RUN` vs `LIVE`** behavior differences at executor cycle level | Table + “does not do” bullets |
| AC4 | **Pre-flip checklist** before any mode change | Checklist section |
| AC5 | **Sprint 1 “do not flip during Sprint 1” banner** | Top of doc |
| AC6 | **Linked from OPERATIONS and STABILIZATION_PLAN** | Markdown links present |
| AC7 | **SC7:** Operator can answer mode behavior without source | Reviewer quiz: e.g. “Does pipeline mode exit open live positions?” → **No** |
| AC8 | **No runtime code changes** | `git diff` shows docs (+ links) only |
| AC9 | **SC10 unchanged** | `--status` still `PIPELINE_DRY_RUN` after doc-only commit |

---

## Verification plan (coding pass)

1. Read `MODE_TRANSITION.md` as a new operator — confirm mode questions answerable without opening `live_executor.js`.
2. Follow links from OPERATIONS and STABILIZATION_PLAN.
3. `git diff` — no `.js` changes except if accidental; revert any.
4. `node live_executor.js --status` — confirm still safe posture.
5. Optional: add one line to Sprint 1 checklist in STABILIZATION_PLAN marking Q8 complete after merge.

---

## Implementation checklist

- [ ] Write `docs/MODE_TRANSITION.md` per outline
- [ ] Link from `docs/OPERATIONS.md`
- [ ] Link from `docs/STABILIZATION_PLAN.md`
- [ ] Update `docs/KNOWN_ISSUES.md` pipeline-skip entry
- [ ] Optional: link from `docs/ARCHITECTURE.md`
- [ ] Self-review against acceptance table
- [ ] Single commit: e.g. “Add mode transition runbook (Sprint 1 Q8)”

---

## Rollback

Revert the doc commit. No runtime impact.

---

## Summary

| Question | Answer |
|----------|--------|
| What does Q8 accomplish? | **Single runbook for execution modes and safe transitions** |
| Code changes? | **None** (docs + links only) |
| Critical fact to document? | **`PIPELINE_DRY_RUN` skips `manageOpenPositions`** |
| Minimal deliverable? | **`docs/MODE_TRANSITION.md`** + OPERATIONS/STABILIZATION links |
| Sprint 1 constraint? | **Do not flip modes during stabilization** (banner) |

**Do not modify application code until this plan is reviewed.**
