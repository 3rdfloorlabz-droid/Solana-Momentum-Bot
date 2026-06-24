# A2f — Authentication & Recovery Audit Design (Planning Only)

**Module:** TracktaOS Module 1 — Solana Momentum Bot
**Sprint:** 4 (Phase 1 — Structure and Recovery)
**Status:** **Planning only** — designs an architecture; builds nothing. No code, config, dashboard, script, dependency, database, route, or audit file is created.
**Operating constraint:** `PIPELINE_DRY_RUN` unchanged; execution-capable recovery remains **blocked**.

**Parent:** [A2_SUPERVISOR_PLAN.md](./A2_SUPERVISOR_PLAN.md) (L0 observe → L1 recommend → L2 human-confirmed → L3 autonomous)
**Builds on:** [A2C_HUMAN_CONFIRMED_RECOVERY_PLAN.md](./A2C_HUMAN_CONFIRMED_RECOVERY_PLAN.md) · [A2C_REVIEW.md](./A2C_REVIEW.md) (preview-only, COMPLETE, guarded) · [A2D_SOAK_REVIEW.md](./A2D_SOAK_REVIEW.md) (accelerated, risk-accepted) · [A3_CONFIG_CHANGE_AUDIT_PLAN.md](./A3_CONFIG_CHANGE_AUDIT_PLAN.md) (config audit)
**Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · [OPERATIONS.md](./OPERATIONS.md) · `dashboard_server.js` · `test_recovery_preview_guards.js` · `run_safety_tests.js`

---

## 0. Scope separation (read first)

> **A2f designs the authentication and audit that must exist *before* any execution-capable recovery UI can even be considered. It authorizes nothing and implements nothing.**

| ID | Owns | This document? | May act? |
|----|------|----------------|----------|
| **A2a** | Supervisor Recommendations (read-only) | Shipped | No |
| **A2b** | Recovery Advisor (read-only) | Shipped | No |
| **A2c** | Preview-Only Recovery Action UI | Shipped, guarded | No |
| **A2d** | Soak validation (accelerated, risk-accepted) | Done | No |
| **A2f** (this doc) | **Auth + recovery-audit *design*** — prerequisites for future execution | **Yes — design only** | **No — implements nothing** |
| **A2g+** | Execution-capable recovery (future, separately approved) | No | Only after A2f built + auth + audit + approval |
| **A2e** | Autonomous recovery (far future) | No | Prohibited |

A2f answers: **what authentication, authorization, audit, prechecks, postchecks, fail-closed rules, UI, and guardrails must exist** before a human could ever trigger a recovery action from a controlled interface — **without building any of them.**

> **Authentication before execution. Audit before recovery. Recovery must never outrun ownership.**

---

## 1. Mission

Design the authentication and recovery-audit architecture required before any future execution-capable recovery UI can be considered — eligibility, guardrails, schema, prechecks, postchecks, fail-closed rules, UI requirements, and the regression tests that would gate implementation — **with no code, no config, no routes, no audit file, no live enablement.**

---

## 2. Constraints (planning-only footprint)

This document produces **only** `docs/A2F_AUTH_RECOVERY_AUDIT_PLAN.md`. A2f must **not**: change code/strategy/executor/process files; change `PIPELINE_DRY_RUN`/`dryRunMode`/arming/`liveArmed`; edit `live_config.json`/`.env`; add/modify any script, dependency, or database; add a dashboard button/POST route/action endpoint/state mutator; spawn/kill/PID-check; perform recovery or autonomous recovery; **create `recovery_actions.jsonl`** (schema is **defined**, file is **not created**). All verification is read-only (§ Verification).

---

## 3. Inspection findings (current truth)

### 3.1 Existing dashboard control surface (pre-existing, unauthenticated)

`dashboard_server.js` exposes **three** config-control POST routes, all calling the executor in-process with no auth:

| Route | Calls | Mutates | Auth today |
|-------|-------|---------|------------|
| `/control/start` | `liveExecutor.startAutomation(...)` | `automationEnabled` | **none** |
| `/control/stop` | `liveExecutor.stopAutomation(...)` | `automationEnabled` | **none** |
| `/control/emergency` | `liveExecutor.emergencyStopControl(...)` | `emergencyStop` | **none** |

These are **config-control**, not process recovery. They are a **known gap** ([KNOWN_ISSUES.md](./KNOWN_ISSUES.md): "Unauthenticated dashboard mutates live config"). A2f does **not** modify them, but its auth model **must cover them** — any future recovery UI shares the same unauthenticated-localhost risk, and the auth design should be retrofittable to these three.

### 3.2 A3 config audit (existing pattern to mirror)

A3 records config changes to `config_change_audit.jsonl` with `timestamp, actor, source, field, oldValue, newValue, reason, riskLevel (CRITICAL/IMPORTANT/INFORMATIONAL), requiresReview, modeAtChange, liveArmedAtChange, changeId`. A2f's recovery audit is a **separate, parallel** ledger for *recovery actions* — same append-only discipline, different subject.

### 3.3 Posture model (existing, reused for prechecks)

`live_executor.js --status` exposes the canonical safety truth: `executionMode`, `dryRunMode`, `liveArmed` (computed), `emergencyStop`, `operationalPosture`. A2f prechecks consume this read-only — they never set it.

### 3.4 A2c preview model + guard (the thing A2f would extend)

A2c renders Restart Scanner/Paper Monitor/Wallet Monitor/Dashboard (low-risk), Restart Executor + Reset After Panic (high-risk, blocked), and forbidden actions — **command text only**. `test_recovery_preview_guards.js` (8/8 suite) fails closed on any execution primitive, mutating control, or route drift. A2f's UI/guardrail design must **preserve** this guard and add to it, never weaken it.

---

## 4. Design 1 — Authentication model

A **minimal, local-operator** authentication requirement that must precede **any** execution-capable dashboard control (recovery *and*, retrofitted, the three existing config-control routes).

| Element | Design |
|---------|--------|
| **Local-only operator token** | A per-machine secret the operator supplies per mutating request. Never rendered, never logged in cleartext, never embedded in HTML. |
| **Environment variable requirement** | Token sourced from an env var (e.g. `TRACKTAOS_OPERATOR_TOKEN`) loaded at process start. If unset, **all** mutating routes refuse (fail closed); read-only/preview UI still works. |
| **Session-less signed request** | Prefer a stateless model: each mutating request carries proof (token or HMAC over method+path+body+timestamp) verified server-side. No long-lived session cookie; short timestamp window to limit replay. |
| **Typed confirmation phrase** | Auth proves *who*; the typed phrase proves *intent* for that specific action (e.g. `RESTART EXECUTOR IN DRY RUN ONLY`). Both required for high-risk actions. |
| **Browser-local limitations** | Dashboard binds `127.0.0.1` only; assume the browser is untrusted for secrets. No secret persisted in localStorage; token entry is per-action, not cached. CSRF-style protections required since the surface is same-origin localhost. |
| **No hardcoded secrets** | The token must never be a literal in source — it would leak via the repo and the guard. |
| **No committed secrets** | Token lives only in the environment/`.env` (gitignored), never committed; docs reference the variable name, never a value. |
| **Fail closed** | Missing/invalid/expired token ⇒ deny + audit the denial. Absence of auth config ⇒ mutating routes disabled entirely. Auth errors never "open" the action. |

**Not implemented.** This is the contract a future, separately-approved milestone would build.

---

## 5. Design 2 — Authorization model (action classes)

| Action class | Examples | Auth required | Typed confirmation | Posture prechecks | Audit logging | Allowed in current phase |
|--------------|----------|:-------------:|:------------------:|:-----------------:|:-------------:|--------------------------|
| **View-only** | Heartbeats, supervisor, scanner health | No | No | No | No | **Yes** (shipped) |
| **Preview-only** | A2c Recovery Action Preview (command text) | No | No | No (display reflects posture) | No | **Yes** (shipped, guarded) |
| **Config-control** | `/control/start`, `/control/stop`, `/control/emergency` | **Yes (future)** | Recommended | Yes | **Yes (A3 + A2f)** | **Currently unauthenticated — known gap; no expansion** |
| **Low-risk recovery** | Restart Scanner/Paper Monitor/Wallet Monitor/Dashboard | **Yes** | Simple confirm | Yes | **Yes** | **No — blocked (design only)** |
| **High-risk recovery** | Restart Executor, Reset After Panic, clear emergencyStop | **Yes** | Strict phrase | Yes (strict) | **Yes + requiresReview** | **No — blocked (design only)** |
| **Forbidden** | Enable live, set `dryRunMode=false`, add signer, auto-kill, auto-repair, autonomous loop, promote LIVE | n/a | n/a | n/a | n/a (offer denied + audited) | **Never, any phase** |

Principle: **authority increases down the table; so do auth, confirmation, prechecks, and audit.** Nothing below "Preview-only" is permitted in the current phase.

---

## 6. Design 3 — Recovery audit schema (`recovery_actions.jsonl`) — NOT CREATED

A future **append-only** ledger of recovery *attempts* (allowed and denied). **Defined here; not created by A2f.**

| Field | Type | Notes |
|-------|------|-------|
| `timestamp` | ISO-8601 UTC | When the attempt occurred |
| `actionId` | string (uuid) | Unique per attempt |
| `actor` | string | Authenticated operator id / `"unauthenticated"` (denied) |
| `authMethod` | enum | `operator_token` / `hmac` / `none` |
| `actionClass` | enum | view / preview / config-control / low-risk / high-risk / forbidden |
| `actionName` | string | e.g. `Restart Scanner` |
| `targetProcess` | string | e.g. `scanner_gmgn_trending.js` |
| `requestedState` | string | Desired outcome (e.g. `HEALTHY`/`running`) |
| `reason` | string\|null | Operator justification (required for high-risk) |
| `commandPreview` | string | The text shown in A2c |
| `commandExecuted` | string\|null | Actual command if/when executed (null when denied/preview) |
| `precheckStatus` | enum | `pass` / `fail` / `skipped` |
| `precheckDetails` | array | Per-precheck results |
| `postcheckStatus` | enum | `pass` / `fail` / `pending` / `n/a` |
| `postcheckDetails` | array | Per-postcheck results |
| `result` | enum | `denied` / `executed_ok` / `executed_error` / `preview` |
| `error` | string\|null | Error text on failure |
| `liveArmedAtRequest` | bool | Posture snapshot |
| `executionModeAtRequest` | string | Posture snapshot |
| `dryRunModeAtRequest` | bool | Posture snapshot |
| `emergencyStopAtRequest` | bool | Posture snapshot |
| `confirmationPhrase` | string\|null | Phrase typed (matched/expected; never a secret) |
| `sourceIpOrHost` | string | Expected `127.0.0.1`/localhost |
| `dashboardSessionId` | string\|null | Correlate UI interactions |
| `relatedConfigAuditId` | string\|null | Link to A3 `changeId` when the action also changed config |
| `requiresReview` | bool | True for high-risk and all denials |
| `riskLevel` | enum | `LOW` / `HIGH` / `FORBIDDEN` |

**Append-only, one event per attempt.** Denials are recorded too (evidence of attempted misuse).

---

## 7. Design 4 — Relationship to A3 config audit

- **A3 (`config_change_audit.jsonl`)** records **config changes** (field old→new).
- **A2f (`recovery_actions.jsonl`)** records **recovery attempts** (process actions).
- **Some future actions create both** — e.g. "Reset After Panic" changes config (A3 event) *and* is a recovery action (A2f event), linked by `relatedConfigAuditId` ↔ `changeId`.
- **Neither audit grants permission.** Audit is **evidence, not authorization** — writing a row never makes an action allowed; auth + authorization + prechecks decide that, and the row merely records what happened.

---

## 8. Design 5 — Precheck model

Required **before** any future execution-capable recovery action (all must pass, else deny):

1. `executionMode` is `PIPELINE_DRY_RUN`
2. `dryRunMode` is `true`
3. `liveArmed` is `false`
4. `emergencyStop` state appropriate for the action (e.g. Reset After Panic expects it set; restarts expect it clear)
5. Safety tests recently passed **or** operator explicitly accepted stale-test risk (recorded)
6. Target process state supports the action (e.g. restart only when unhealthy)
7. Cooldown not active (rate-limit repeat attempts on the same target)
8. No duplicate-process warning for the target (avoid acting on ambiguous ownership)
9. No unsafe posture (any of 1–3 failing is unsafe)
10. No unresolved state corruption (e.g. unreadable owned artifacts)
11. Action class is **not** forbidden

Prechecks are **read-only** evaluations of existing signals; they set nothing.

---

## 9. Design 6 — Postcheck model

Required **after** a future recovery action (recorded in the audit row):

1. Target heartbeat returns **HEALTHY** (or the expected state)
2. `live_executor --status` still safe (`PIPELINE_DRY_RUN`)
3. `liveArmed` remains **false**
4. No unexpected config changes (cross-check A3)
5. No new reconciliation queue growth
6. No temp-file buildup (`*.json.*.tmp`)
7. Audit entry written (the row itself)
8. **Operator review required** for any high-risk action (`requiresReview: true`)

A failed postcheck escalates to human review; it never auto-remediates.

---

## 10. Design 7 — Fail-closed rules

Every condition below **blocks** the action (deny + audit):

- Missing auth token ⇒ block
- Invalid/expired confirmation phrase ⇒ block
- Unsafe posture (any core precheck fails) ⇒ block
- Unknown / unrecognized action ⇒ block
- Malformed audit entry (cannot serialize a valid row) ⇒ block
- Inability to write the audit (fs error, locked file) ⇒ block (**no action without a durable record**)
- Any precheck failure ⇒ block
- Forbidden action ⇒ **always** block

Default posture is **deny**: anything not explicitly allowed, authenticated, confirmed, pre-checked, and auditable does not run.

---

## 11. Design 8 — UI requirements (future execution-capable UI, if ever approved)

Must display, per action:

- Action class
- Risk level
- Eligibility (eligible / blocked / forbidden)
- Blocked reason (when blocked)
- Command preview (plain text)
- Prechecks (and live pass/fail)
- Typed confirmation field (phrase for high-risk)
- Audit notice ("this action will be recorded to `recovery_actions.jsonl`")
- Postcheck expectation
- **"This does not authorize live trading."**
- **No "go live" wording** anywhere

The UI must keep the A2c separation: preview content stays preview; execution affordances (if approved) are a distinct, authenticated, audited surface — never blended into view/preview panels.

---

## 12. Design 9 — Guardrail requirements (regression tests before implementation)

Before any execution-capable code lands, these guards must exist and pass:

- **Auth required for every mutating route** (recovery *and* the three config-control routes once retrofitted)
- **No unauthenticated mutation** — a mutating route without auth is a test failure
- **Recovery audit append-only** — no truncation/rewrite of `recovery_actions.jsonl`
- **Forbidden actions cannot be offered** — never rendered as actionable
- **Live-promotion routes cannot exist** — no route enables LIVE / sets `dryRunMode=false`
- **Preview-only tests remain passing** — `test_recovery_preview_guards.js` stays green
- **A2c guard updated only with explicit review** — loosening the preview guard requires a documented, reviewed change (not an incidental edit)

These extend, never replace, the existing 8/8 suite.

---

## 13. Current blockers (why execution-capable recovery is still blocked)

- **A2d was accelerated**, not a full 72-hour soak (risk-accepted) — long-duration evidence missing.
- **Dashboard auth not implemented** — surface is unauthenticated localhost.
- **Recovery audit not implemented** — `recovery_actions.jsonl` is design-only, uncreated.
- **Duplicate-process risk still operator-managed** — ambiguous ownership can misdirect recovery.
- **Executor remains high-risk** — R3/R4 non-atomic `observation_dedup.json` / `live_positions.json`.
- **No approval for execution-capable recovery** — no human authorization exists.
- **Live trading remains prohibited** — unrelated and forbidden; no A2 work touches it.

All must be resolved (each separately approved) before execution-capable recovery is even reconsidered.

---

## 14. Key decisions

1. **Auth is a prerequisite, not part of A2c** — and must retrofit the three existing config-control routes, not just future recovery.
2. **Fail closed everywhere** — missing auth/config/audit/precheck all deny; default is deny.
3. **Audit is evidence, not authorization** — and denials are audited, not just successes.
4. **Two parallel ledgers** — A3 for config, A2f for recovery, linked by id when an action does both.
5. **No secrets in source or repo** — env-var token only; docs name the variable, never a value.
6. **Guards-before-code** — the regression suite must grow before any mutating route ships.
7. **`recovery_actions.jsonl` defined, not created** — schema frozen here; file creation is a later, approved step.

---

## 15. Verification (planning-only footprint)

```powershell
git status --short                 # expect only docs/A2F_AUTH_RECOVERY_AUDIT_PLAN.md (+ optional KNOWN_ISSUES)
git diff --stat                    # no code/config/script changes
Test-Path recovery_actions.jsonl   # expect False — file NOT created
node run_safety_tests.js           # expect 8/8 (unchanged)
node live_executor.js --status     # PIPELINE_DRY_RUN / dryRunMode true / liveArmed false
```

Pass = only docs added/changed; `recovery_actions.jsonl` absent; suite 8/8; posture `PIPELINE_DRY_RUN` / `liveArmed: false`.

---

## 16. Do-not-do (this milestone)

- ❌ no code/config/script/dependency/database; ❌ no dashboard change or new route; ❌ no auth implementation;
- ❌ no `recovery_actions.jsonl` creation; ❌ no recovery execution; ❌ no spawn/kill/PID; ❌ no live enablement;
- ✅ allowed: this design doc and an optional KNOWN_ISSUES note.

---

## 17. Footer

> **Authentication before execution.**
> **Audit before recovery.**
> **Recovery must never outrun ownership.**
> **Humans authorize. Ori advises. Gates enforce.**

A2f is the gate-design between preview (A2c) and any future execution — it raises the bar, it does not open the door.

---

*A2f Authentication & Recovery Audit (planning only) · TracktaOS Module 1 · Sprint 4 · Designs auth + `recovery_actions.jsonl` schema + prechecks/postchecks/fail-closed/UI/guardrails. No code, no routes, no audit file, no execution, no live enablement. `recovery_actions.jsonl` NOT created. Posture verified 2026-06-23.*
