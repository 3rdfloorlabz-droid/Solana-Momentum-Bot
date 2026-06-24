# A2c Review — Preview-Only Recovery UI (Complete)

**Module:** TracktaOS Module 1 — Solana Momentum Bot
**Sprint:** 4 (Phase 1 — Structure and Recovery)
**Status:** **COMPLETE** — preview-only recovery UI shipped and regression-guarded
**Review date:** 2026-06-23
**Reviewer:** Taylor / Ori

**Plan:** [A2C_HUMAN_CONFIRMED_RECOVERY_PLAN.md](./A2C_HUMAN_CONFIRMED_RECOVERY_PLAN.md) · **Soak context:** [A2D_SOAK_REVIEW.md](./A2D_SOAK_REVIEW.md) · **Architecture:** [A2_SUPERVISOR_PLAN.md](./A2_SUPERVISOR_PLAN.md)
**Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · [OPERATIONS.md](./OPERATIONS.md) · `dashboard_server.js` · `test_recovery_preview_guards.js` · `run_safety_tests.js`

---

## 1. Executive Summary

A2c added a **preview-only** dashboard section — **Recovery Action Preview** — that shows operators the recovery actions a *future* human-confirmed interface could offer, as **command text only**. It is the bridge between A2b advice and any future execution, and it builds none of that execution.

Plainly:

- **A2c does not execute recovery.**
- **A2c does not restart, stop, spawn, kill, repair, or mutate any state.**
- **A2c does not authorize live trading.**
- **A2c is guarded by `test_recovery_preview_guards.js`** — the preview cannot silently become execution.
- **Safety suite is now 8/8.**

Posture is unchanged: **`PIPELINE_DRY_RUN` / `liveArmed: false` / `PIPELINE_OBSERVING`**.

---

## 2. Scope

### Covered

- A2c **Recovery Action Preview** panel (nested under Supervisor Recommendations, after Recovery Advisor, before Scanner Health)
- **Low-risk preview actions** — Restart Scanner / Paper Monitor / Wallet Monitor / Dashboard
- **High-risk blocked previews** — Restart Executor, Reset After Panic (always Blocked / High Risk Preview)
- **Forbidden actions** — enumerated for planning visibility (e.g. enable live trading, autonomous restart loop)
- **Command previews as text only** (`<pre>` plain text — not executable)
- **Eligibility display** — Eligible for future human-confirmed UI / Blocked / Forbidden / Preview only
- **Required prechecks / post-checks** per action
- **Confirmation phrase visibility** — future phrases shown as text (e.g. `RESTART EXECUTOR IN DRY RUN ONLY`)
- **Regression guard** — `test_recovery_preview_guards.js` in `run_safety_tests.js`

### Not covered (intentionally out of scope)

- Actual recovery execution
- Authentication
- Audit logging to `recovery_actions.jsonl`
- POST recovery routes
- Process spawning / killing
- Live promotion
- Autonomous recovery (A2e)

---

## 3. Implementation Summary

### Dashboard additions (`dashboard_server.js`)

- **`recoveryActionPreviewSection()`** — renders the A2c **Recovery Action Preview** panel, nested inside `supervisorRecommendationsPanel()`.
- **Static/read-only preview action model** — low-risk restarts, high-risk (blocked) executor/panic actions, and a forbidden-action list. No model entry carries an executable handler.
- **Dynamic eligibility** derived from existing **read-only** context only (`buildSupervisorContext()` heartbeat states, `readLiveConfig()`, `computeLiveArmedStatus()`): low-risk actions show "Eligible for future human-confirmed UI" only when the process is unhealthy *and* posture is safe; otherwise Blocked. High-risk actions are always Blocked in this milestone. Forbidden actions are always Forbidden.
- **Required disclaimers** — "This panel is preview-only…", "Preview only. Operator must run commands manually in a terminal.", "Blocked actions are shown for planning visibility only.", "Nothing in this panel authorizes live trading."
- **Forbidden action visibility** — listed with reasons; never offered as actions.
- Each card shows: target process, status, eligibility, why, command preview (plain text), future confirmation phrase, required prechecks, required post-checks, risk level.

### Guard additions

- **`test_recovery_preview_guards.js`** (new) — 34 static checks asserting the preview stays non-mutating.
- **`run_safety_tests.js`** — guard added to the suite; total **7/7 → 8/8**.
- **`ACTIVE_MANIFEST.md`** — records that A2c preview is guarded by `test_recovery_preview_guards.js`.
- **`docs/KNOWN_ISSUES.md`** — A2c preview marked intentionally non-executing and regression-guarded; execution-capable UI remains blocked.

---

## 4. Safety Boundary

**Preview-only means it:**

- Shows what a human **could** do manually
- Shows **why** an action is eligible, blocked, or forbidden
- Shows **command preview text**
- Shows **confirmation wording** for future use

**Preview-only does NOT:**

- Execute commands
- Submit POST recovery routes
- Spawn processes
- Kill processes
- Edit config
- Write `recovery_actions.jsonl`
- Clear emergency state
- Promote live mode

> The panel is a **window**, not a **lever**. Everything it shows must still be typed by a human into a terminal.

---

## 5. Verification Results

| Check | Result |
|-------|--------|
| `node --check dashboard_server.js` | **PASS** |
| `node --check run_safety_tests.js` | **PASS** |
| `node --check test_recovery_preview_guards.js` | **PASS** |
| `node test_recovery_preview_guards.js` | **PASS — 34/34 checks** |
| `node run_safety_tests.js` | **8/8 PASS** |
| `node live_executor.js --status` | `PIPELINE_DRY_RUN` · `dryRunMode: true` · `liveArmed: false` · `emergencyStop: false` · `PIPELINE_OBSERVING` |

---

## 6. Regression Guard Summary

`test_recovery_preview_guards.js` is a **static source guard** (pure file-read + regex; spawns nothing, writes nothing). It **fails closed** if a future edit to `dashboard_server.js` introduces any of:

- `spawn`
- `exec` / `exec(`
- `execSync`
- `execFile`
- `child_process`
- `process.kill`
- `taskkill`
- `Stop-Process`
- `recovery_actions` writes
- new recovery POST routes (or any recover/restart/kill/spawn/reset route on any verb)
- mutating controls in the A2c section
- `<button` / `<form` / `onclick` / `fetch(` / `method="post"` / `data-action` / mutating `href` in the A2c section

It also asserts required content/disclaimers and the full preview model (Restart Scanner/Paper Monitor/Wallet Monitor/Dashboard/Executor, Reset After Panic; "Enable live trading" and "Autonomous restart loop" forbidden; high-risk confirmation phrases present).

**Pre-existing config-control routes remain allowed** and the guard pins the `app.post` set to **exactly** these three:

- `/control/start`
- `/control/stop`
- `/control/emergency`

These are **config-control** routes (toggle automation / emergency stop), **not** A2c recovery routes. A2c added **zero** routes. The guard fails if this set drifts in either direction.

---

## 7. Remaining Risks / Deferred Work

- **A2d was accelerated**, not a full 72-hour soak — long-duration advisory accuracy is risk-accepted, not fully proven (see [A2D_SOAK_REVIEW.md](./A2D_SOAK_REVIEW.md)).
- **Future execution-capable UI requires stronger validation** — a completed soak (or equivalent) plus explicit approval.
- **Authentication remains required** before any execution-capable dashboard recovery; the dashboard is unauthenticated localhost (existing known gap).
- **`recovery_actions.jsonl` schema is planned but not implemented** — no action audit ledger exists or is created.
- **Executor remains high-risk** due to ownership/state concerns (R3/R4 non-atomic `observation_dedup.json` / `live_positions.json`); executor restart stays Blocked.
- **A2e autonomous recovery remains prohibited.**

---

## 8. Verdict

### A2c Preview-Only UI: **COMPLETE**

- **Safety status:** **8/8 PASS**
- **Live status:** **DISARMED**
- **Posture:** **PIPELINE_DRY_RUN / PIPELINE_OBSERVING** (`liveArmed: false`, `emergencyStop: false`)

A2c delivered a guarded, read-only preview of future recovery — and nothing more. It advances visibility, not authority.

---

## 9. Recommendation

**Proceed only to planning for:**

- Authentication design (dashboard auth before any execution surface)
- Recovery action audit design (`recovery_actions.jsonl` schema)
- Longer validation (full soak or equivalent)
- A2c execution-capable design review (no implementation)

**Do not proceed to:**

- Recovery execution
- POST recovery routes
- Shell execution
- Process killing
- Automatic restarts
- Autonomous recovery
- Live promotion

Each of the above remains a separate, explicitly-approved decision — none is authorized by A2c.

---

## 10. Footer

> **Recovery must never outrun ownership.**
> **Humans authorize.**
> **Ori advises.**
> **Gates enforce.**

Structure precedes recovery. Recovery precedes promotion. Promotion precedes authorization. A2c is a preview — it shows the path without walking it.

---

*A2c review · documentation only · TracktaOS Module 1 · Sprint 4 · 2026-06-23 · Preview-only recovery UI COMPLETE · 8/8 safety · DISARMED · PIPELINE_DRY_RUN.*
