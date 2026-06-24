# A2g — Dashboard Auth Readiness / Control Surface Review (Planning & Review Only)

**Module:** TracktaOS Module 1 — Solana Momentum Bot
**Sprint:** 4 (Phase 1 — Structure and Recovery)
**Status:** **COMPLETE (review)** — control surface inventoried and remediation path documented. No code, config, route, script, dependency, or audit file created.
**Operating constraint:** `PIPELINE_DRY_RUN` unchanged; dashboard mutation **not** expanded.

**Builds on:** [A2F_AUTH_RECOVERY_AUDIT_PLAN.md](./A2F_AUTH_RECOVERY_AUDIT_PLAN.md) (auth + recovery-audit design) · [A2C_REVIEW.md](./A2C_REVIEW.md) (preview-only, guarded) · [A2D_SOAK_REVIEW.md](./A2D_SOAK_REVIEW.md) (accelerated) · [A3_CONFIG_CHANGE_AUDIT_PLAN.md](./A3_CONFIG_CHANGE_AUDIT_PLAN.md) (config audit) · [A2_SUPERVISOR_PLAN.md](./A2_SUPERVISOR_PLAN.md)
**Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · [OPERATIONS.md](./OPERATIONS.md) · `dashboard_server.js` · `live_executor.js` · `test_recovery_preview_guards.js` · `run_safety_tests.js`

---

## 1. Executive Summary

A2g is a **review** of the dashboard's actual mutation/control surface and a phased plan for what must be true before any mutation route is expanded or recovery execution is added.

Findings (verified against `dashboard_server.js`):

- The dashboard exposes **6 routes**: **3 GET** (read-only) and **3 POST** (config-control).
- The 3 POST routes (`/control/start`, `/control/stop`, `/control/emergency`) mutate `live_config.json` via the executor and are **A3-audited**, but are **completely unauthenticated** (localhost-only binding is the only barrier).
- **No recovery routes exist.** A2c is preview-only and regression-guarded; it adds no POST route and no execution.
- The server binds `127.0.0.1` only — a real but **insufficient** mitigation (any local process or open browser can POST).

**Dashboard mutation remains unsafe for expansion** until authentication, audit hardening, and tests (designed in A2f) are implemented. A2g changes nothing; it documents the gate.

---

## 2. Scope

**Covered:** complete route inventory; classification; per-route control-surface review; A2c preview-boundary confirmation; local threat/misuse model; auth readiness checklist; phased remediation plan; future test requirements; blockers.

**Not covered (out of scope, unchanged):** implementing authentication; modifying/removing the existing POST routes; adding recovery routes; creating `recovery_actions.jsonl`; recovery execution; live enablement; any code/config/script change.

---

## 3. Route Inventory (`dashboard_server.js`, verified)

| Route | Method | Class | Handler | Mutates? |
|-------|--------|-------|---------|----------|
| `/` | GET | **Read-only** | `renderDashboard()` | No |
| `/winners` | GET | **Read-only** | `renderWinnersAnalysis()` | No |
| `/3rd-floor-labz-banner.png` | GET | **Read-only** (static asset) | image send | No |
| `/control/start` | POST | **Config-control** | `liveExecutor.startAutomation(...)` | **Yes** — `live_config.json` |
| `/control/stop` | POST | **Config-control** | `liveExecutor.stopAutomation(...)` | **Yes** — `live_config.json` |
| `/control/emergency` | POST | **Config-control** | `liveExecutor.emergencyStopControl(...)` | **Yes** — `live_config.json` |

- **Future recovery routes:** **none exist** (and none may be added without auth + audit — A2f).
- **Forbidden/missing:** no live-enable route, no `dryRunMode` toggle route, no spawn/kill/restart route, no `recovery_actions` route. Their **absence is correct** and must be preserved.
- **Binding:** `app.listen(PORT, "127.0.0.1", ...)` — loopback only; not network-exposed, but not authenticated.

---

## 4. Existing Control Surface Review

All three POST routes funnel through `handleControl()` and the executor's control functions (verified in `live_executor.js`):

### 4.1 `/control/start` → `startAutomation()`
| Aspect | Finding |
|--------|---------|
| What it changes | `automationEnabled = true` (after readiness checks; refuses if `emergencyStop`) + toggle metadata |
| File/state touched | `live_config.json` (atomic via A1b), `live_control_events.jsonl` |
| A3 audited? | **Yes** — `auditConfigChange(... source: live_executor.startAutomation, actor: operator)` |
| Auth today? | **No** |
| Auth in future? | **Yes (required)** |
| Overlaps A2f recovery audit? | No (config-control; A3 only) — unless reframed as recovery later |
| Affects posture? | `automationEnabled` is a **liveArmed gate**; affects `operationalPosture`. Cannot set `executionMode`/`dryRunMode`; cannot arm live alone. |

### 4.2 `/control/stop` → `stopAutomation()`
| Aspect | Finding |
|--------|---------|
| What it changes | `automationEnabled = false` (entries off; exits continue) + metadata |
| File/state touched | `live_config.json` (atomic), `live_control_events.jsonl` |
| A3 audited? | **Yes** — `source: live_executor.stopAutomation` |
| Auth today? | **No** |
| Auth in future? | **Yes** |
| Overlaps A2f? | No (config-control) |
| Affects posture? | Toggles `automationEnabled`; safer direction (disables entries). Cannot change mode/arm live. |

### 4.3 `/control/emergency` → `emergencyStopControl()`
| Aspect | Finding |
|--------|---------|
| What it changes | `automationEnabled = false`, **`emergencyStop = true`** + metadata; writes `KILL_SWITCH_ACTIVATED` live event |
| File/state touched | `live_config.json` (atomic), `live_control_events.jsonl`, `live_trades.jsonl` (event) |
| A3 audited? | **Yes** — `source: live_executor.emergencyStopControl` |
| Auth today? | **No** |
| Auth in future? | **Yes** (highest priority — it sets a safety latch) |
| Overlaps A2f? | Partial — clearing emergencyStop later is **high-risk recovery** (A2f); setting it here is a safety action |
| Affects posture? | Sets **`emergencyStop`** (a liveArmed gate) and `operationalPosture`. Fails safe (more restrictive). Cannot arm live. |

**Key point:** all three are **audited but unauthenticated**. A3 records *that* a change happened; it does not gate *who* may make it. None can enable live or change `executionMode`/`dryRunMode` — but `/control/emergency` and `/control/start` flip safety-relevant gates, so an unauthenticated caller can disrupt operation (e.g. force emergency stop, or enable automation).

---

## 5. A2c Preview Boundary Confirmation

Confirmed against `dashboard_server.js` and `test_recovery_preview_guards.js`:

- **No recovery POST routes exist** — `app.post` set is exactly the three config-control routes.
- **No execution actions exist** — A2c renders command **text** only.
- **No `spawn`/`exec`/`execSync`/`execFile`/`child_process`/`process.kill`** anywhere in the dashboard.
- **No mutating controls in A2c** — no `<button>`/`<form>`/`onclick`/`fetch(`/`method="post"`/`data-action`/mutating `href`.
- **`test_recovery_preview_guards.js` covers the boundary** — 34 checks, part of the **8/8** suite; fails closed on any execution primitive, mutating control, or route drift.

A2c is a window, not a lever. A2g preserves that.

---

## 6. Local Threat / Misuse Model

Loopback binding is necessary but **not sufficient**. Local risks:

| # | Risk | Effect | Mitigation (future, A2f) |
|---|------|--------|--------------------------|
| 1 | **Browser left open** | A lingering tab can re-POST a control route | Auth token per action; short-lived confirmation |
| 2 | **Another local process calls a POST route** | Any localhost process can hit `/control/*` (no auth) | Required token/HMAC on every mutating route |
| 3 | **Accidental click** | START/STOP/EMERGENCY toggled unintentionally | Typed confirmation for high-risk; CSRF token |
| 4 | **Stale dashboard** | Old in-memory code serves outdated controls/state | Restart discipline (OPERATIONS.md); version stamp |
| 5 | **Preview/execution confusion** | Operator thinks A2c preview acted (it cannot) | A2c disclaimers + guard keep preview non-executing |
| 6 | **Future route added without auth** | New mutation surface silently unauthenticated | Guard: no mutating route without auth (A2f §12) |
| 7 | **Future action added without audit** | Mutation with no evidence trail | Fail-closed: no mutation without audit write |
| 8 | **Live promotion mixed with recovery** | A recovery surface accidentally arms live | Guard: no live-enable route may exist; recovery UI says "does not authorize live trading" |

---

## 7. Authentication Readiness Checklist

Before **any** mutation route is considered acceptable (recovery *or* the existing config-control routes):

- [ ] Operator token sourced from an **environment variable** (e.g. `TRACKTAOS_OPERATOR_TOKEN`)
- [ ] **No hardcoded secret** in source; **no committed secret** (env/`.env` only, gitignored)
- [ ] **Fail-closed** on missing/invalid token — mutating routes disabled; read-only unaffected
- [ ] **Authentication required for every mutating route** (all `app.post` that change state)
- [ ] **Typed confirmation phrase** for high-risk actions
- [ ] **CSRF / accidental-POST mitigation** for same-origin localhost
- [ ] **Audit entry written before/with** every mutation (A3 for config, A2f for recovery)
- [ ] **Posture prechecks** evaluated (PIPELINE_DRY_RUN / dryRunMode / liveArmed / emergencyStop)
- [ ] **Explicit blocked state** rendered for unsafe posture
- [ ] **Tests prove unauthenticated mutation is blocked**

None of these exist today; until they do, mutation must not be expanded.

---

## 8. Route Remediation Plan (phased)

| Phase | Goal | Code? |
|-------|------|-------|
| **Phase 0 — Current state review** | Document existing unauthenticated routes (this doc). | **No** |
| **Phase 1 — Auth wrapper design** | Design middleware/helper (token verify, fail-closed, audit hook) — design only. | **No** |
| **Phase 2 — Config-control auth retrofit** | Future: require auth on `/control/start`, `/control/stop`, `/control/emergency`. | Future (approved) |
| **Phase 3 — Config-control audit hardening** | Verify A3 coverage; add missing action metadata (actor/source/reason completeness) if needed. | Future (approved) |
| **Phase 4 — Recovery audit readiness** | Prepare `recovery_actions.jsonl` **only after auth exists**. | Future (approved) |
| **Phase 5 — Recovery execution review** | Only after auth + audit + tests + stronger validation (full soak). | Future (separately approved) |

Order is strict: **auth → audit → tests → (only then) any execution.** A2g delivers Phase 0.

---

## 9. Future Test Requirements

Before any mutation expansion ships:

- Unauthenticated `POST /control/start` is **rejected**
- Unauthenticated `POST /control/stop` is **rejected**
- Unauthenticated `POST /control/emergency` is **rejected**
- Authenticated request **requires the correct token**
- High-risk actions **require the typed phrase**
- **Missing audit blocks mutation** (fail-closed)
- **Live enablement remains impossible** from any recovery/control UI
- **A2c preview guard still passes** (`test_recovery_preview_guards.js`)
- **No new recovery routes without auth** (route-set guard)
- **No forbidden route names** (no live-enable / dryRun-toggle / spawn / kill route)

These extend the current **8/8** suite; they are not built in A2g.

---

## 10. Current Blockers

- **Authentication not implemented** — all mutation routes are unauthenticated localhost.
- **Recovery audit not implemented** — `recovery_actions.jsonl` is design-only (A2f), uncreated.
- **A2d was accelerated**, not a full soak — long-duration evidence missing.
- **Duplicate-process risk operator-managed** — ambiguous ownership can misdirect future actions.
- **Executor remains high-risk** — R3/R4 non-atomic state.
- **No approval for execution-capable recovery** — none exists.
- **Live trading prohibited** — unrelated and forbidden.

---

## 11. Verdict

### A2g Control Surface Review: **COMPLETE**

But, stated plainly:

> **Dashboard mutation remains unsafe for expansion until authentication, audit, and tests are implemented.**

The existing three config-control POST routes are **audited but unauthenticated** and are a standing localhost risk. A2c remains correctly preview-only and guarded. No recovery routes exist, and none may be added before A2f's auth + audit + tests land.

- **Safety status:** 8/8 (unchanged; nothing executable changed)
- **Live status:** DISARMED
- **Posture:** PIPELINE_DRY_RUN / PIPELINE_OBSERVING

---

## 12. Recommendation

**Proceed only to planning/design for:**

- Phase 1 auth wrapper **design** (middleware/helper, fail-closed, audit hook)
- Config-control auth **retrofit design** for the three existing routes
- A3 audit **coverage verification**
- Future test design (unauthenticated-mutation-rejected suite)

**Do not proceed to:**

- Implementing authentication in this task
- Modifying/removing the existing POST routes
- Adding any recovery route or execution
- Creating `recovery_actions.jsonl`
- Process spawning/killing
- Live promotion

---

## 13. Footer

> **Authentication before execution.**
> **Audit before recovery.**
> **Preview before action.**
> **Recovery must never outrun ownership.**
> **Humans authorize. Ori advises. Gates enforce.**

A2g maps the control surface and the gate; it does not open it.

---

*A2g Dashboard Auth Readiness / Control Surface Review (planning & review only) · TracktaOS Module 1 · Sprint 4 · 6 routes inventoried (3 GET read-only, 3 POST config-control, 0 recovery) · existing POST routes audited-but-unauthenticated · A2c preview-only confirmed · no code/config/route/script change · `recovery_actions.jsonl` NOT created · posture verified 2026-06-23.*
