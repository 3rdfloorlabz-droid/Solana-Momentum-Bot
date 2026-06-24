# A2n — Human-confirmed Recovery Execution Review

**Module:** TracktaOS Module 1 — Solana Momentum Bot
**Sprint:** 4 (Phase 1 — Structure and Recovery)
**Status:** **COMPLETE (review)** — assesses readiness for human-confirmed recovery **execution**; implements nothing
**Review date:** 2026-06-23
**Reviewer:** Taylor / Ori

**Builds on:** [A2M_REVIEW.md](./A2M_REVIEW.md) · [A2C_REVIEW.md](./A2C_REVIEW.md) · [A2D_SOAK_REVIEW.md](./A2D_SOAK_REVIEW.md) · [A2F_AUTH_RECOVERY_AUDIT_PLAN.md](./A2F_AUTH_RECOVERY_AUDIT_PLAN.md) · [A2G_DASHBOARD_AUTH_READINESS_REVIEW.md](./A2G_DASHBOARD_AUTH_READINESS_REVIEW.md) · [A2L_RECOVERY_AUDIT_TEST_DESIGN.md](./A2L_RECOVERY_AUDIT_TEST_DESIGN.md) · [A2_SUPERVISOR_PLAN.md](./A2_SUPERVISOR_PLAN.md)
**Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · [OPERATIONS.md](./OPERATIONS.md) · `dashboard_server.js` · `live_executor.js` · `recovery_audit.js` · `run_safety_tests.js`

---

## Executive Summary

A2n reviews whether TracktaOS is ready to **begin implementing** human-confirmed recovery execution from the dashboard or any new POST route. It defines the strict conditions that must be met before any execution-capable recovery surface may ship.

**Conservative verdict:**

| Question | Answer |
|----------|--------|
| Ready for recovery **execution** today? | **No** |
| Ready for a **limited execution design plan** (next planning milestone)? | **Yes — with explicit risk acceptance** |

TracktaOS has completed a strong **prerequisite stack**: preview-only UI (A2c), config-control auth (A2j/A2k), and a tested recovery audit writer (A2m). None of that authorizes process recovery. **`recovery_audit.js` is evidence infrastructure, not permission.** Repo-root `recovery_actions.jsonl` remains absent. No dashboard route calls `appendRecoveryAuditEntry`. Safety suite is **11/11**. Live remains **disarmed**.

> **Recovery execution readiness: NOT READY.** Proceed to **A2o — Human-confirmed Recovery Design Plan** only. Do **not** proceed directly to recovery execution implementation.

---

## Scope

### Covered (this review)

- Readiness assessment against completed A2 milestones
- Classification of eligible / high-risk / forbidden future recovery actions
- Required gates before any future execution route
- Future route design principles (if ever approved)
- Recovery audit requirements (before/after)
- Precheck and postcheck models by action class
- Minimal phased implementation path (A2o–A2t)
- Current blockers and conservative recommendation

### Not covered (unchanged)

- Recovery execution implementation
- Dashboard execution buttons or POST recovery routes
- Process spawning, killing, or PID checks
- Wiring `recovery_audit.js` to dashboard routes
- Creating repo-root `recovery_actions.jsonl`
- Live enablement, strategy changes, or autonomous recovery (A2e)
- Any code, config, script, test, or runtime artifact change

---

## Current Safety Stack

Evidence reviewed (read-only inspection, 2026-06-23):

| Layer | Milestone | State |
|-------|-----------|-------|
| **Observe** | A2a Supervisor Recommendations | Shipped, read-only |
| **Advise** | A2b Recovery Advisor | Shipped, read-only |
| **Preview** | A2c Recovery Action Preview | Shipped, non-executing; guarded by `test_recovery_preview_guards.js` |
| **Soak evidence** | A2d Accelerated validation | **PASS WITH RISK ACCEPTED** — not full 72h soak ([A2D_SOAK_REVIEW.md](./A2D_SOAK_REVIEW.md)) |
| **Auth + audit design** | A2f | Planning complete |
| **Control surface review** | A2g | 6 routes: 3 GET read-only, 3 POST config-control (auth-wrapped) |
| **Auth test design** | A2h | Complete |
| **Auth static guards** | A2i | Active in suite |
| **Auth wrapper** | A2j | `DASHBOARD_CONTROL_TOKEN` + `X-Trackta-Control-Token`; fail-closed |
| **Auth behavioral tests** | A2k | Isolated HTTP harness; temp fixtures only |
| **Audit test design** | A2l | Complete |
| **Audit writer + tests** | A2m | `recovery_audit.js` + `test_recovery_audit.js`; **not wired to execution** |
| **Config audit** | A3 | `config_change_audit.jsonl` for config changes (separate ledger) |
| **Safety suite** | — | **11/11 PASS** |
| **Posture** | — | `PIPELINE_DRY_RUN` · `dryRunMode: true` · `liveArmed: false` · `PIPELINE_OBSERVING` |

### Dashboard control surface (verified)

`dashboard_server.js` exposes **exactly three** POST routes, all config-control (not recovery):

- `POST /control/start` · `POST /control/stop` · `POST /control/emergency`

Each is wrapped by `requireDashboardControlAuth` before `handleControl()` → `live_executor` config mutations. **No** `recovery_audit` import. **No** recovery POST routes.

### What prerequisites are satisfied

| Prerequisite (from A2f/A2g) | Status |
|------------------------------|--------|
| Preview-only UI with guardrails | ✅ A2c |
| Config-control auth | ✅ A2j/A2k |
| Auth tests (static + behavioral) | ✅ A2i/A2k |
| Recovery audit writer + unit tests | ✅ A2m |
| Recovery audit wired to route flow | ❌ Not done (by design) |
| Execution route static guards | ❌ Not done |
| Fake/harness process-recovery tests | ❌ Not done |
| Human approval for execution | ❌ Not recorded |
| Full soak evidence | ❌ A2d accelerated only |

---

## Readiness Assessment

### Question

Is TracktaOS ready for **actual human-confirmed recovery execution** (dashboard or route that spawns/restarts/kills processes)?

### Answer: **NOT READY**

### Rationale (conservative)

1. **No execution path exists** — A2c shows command text only; no allowlisted server-side action map, no harness tests, no route guards for recovery POSTs.
2. **Audit writer is unwired** — `recovery_audit.js` is tested in isolation; no fail-closed “audit before action” integration on any route.
3. **No execution-specific tests** — No static guards for recovery routes, no fake executor/process harness, no integration tests proving “auth + audit + precheck → fixed action only.”
4. **A2d evidence is abbreviated** — ~1 hour accelerated validation; not overnight, not 72h; long-duration false positives unproven.
5. **Duplicate-process ambiguity** — Still operator-managed; recovery against the wrong process instance remains a real risk.
6. **Executor high-risk (R3/R4)** — `observation_dedup.json` and `live_positions.json` remain non-atomic full rewrites ([A2C_HUMAN_CONFIRMED_RECOVERY_PLAN.md](./A2C_HUMAN_CONFIRMED_RECOVERY_PLAN.md)); executor restart is **blocked** in A2c preview.
7. **No human authorization** — No recorded approval to implement execution-capable recovery UI or routes.
8. **Live trading prohibited** — Unrelated and forbidden; recovery must not become a live-promotion path.

### Secondary verdict

TracktaOS **is ready** for the **next planning milestone only**:

**A2o — Human-confirmed Recovery Design Plan**

That plan may specify allowlisted actions, harness design, route guard tests, and audit wiring — still **without** shipping execution.

---

## Eligible / High-Risk / Forbidden Action Classification

Aligned with A2c preview model and [A2F_AUTH_RECOVERY_AUDIT_PLAN.md](./A2F_AUTH_RECOVERY_AUDIT_PLAN.md) §5.

### Low-risk candidates (future human-confirmed only)

| Action | Target | Rationale |
|--------|--------|-----------|
| **Restart Scanner** | `scanner_gmgn_trending.js` | Single-writer append-only `paper_trades.json`; idempotent restart |
| **Restart Paper Monitor** | `monitor.js` | Single-writer `paper_positions.json` via store; idempotent restart |
| **Restart Wallet Monitor** | wallet monitor process | Read-mostly telemetry; lower blast radius |
| **Restart Dashboard** | `dashboard_server.js` | Read-mostly; no trading authority |

**Not approved for implementation today.** Classification is for **future** design only.

### High-risk candidates (future — stricter gates)

| Action | Target | Rationale |
|--------|--------|-----------|
| **Restart Executor** | `live_executor.js` | Owns R3/R4 non-atomic state; cycle timing risk |
| **Reset After Panic** | ops scripts + config | Mutates safety latches; config + recovery dual audit |
| **Clear emergencyStop** | `live_config.json` | Safety latch; config-control class |

A2c preview marks executor/panic actions **Blocked / High Risk Preview**. A2n **does not** approve them for execution.

### Forbidden (never via dashboard recovery route)

| Action | Reason |
|--------|--------|
| Enable live trading | Capital safety |
| Change `executionMode` to `LIVE` | Live promotion |
| Set `dryRunMode` false | Live promotion |
| Add / expose signer secret | Secret handling |
| Kill processes automatically | No PID automation without separate review |
| Repair state files automatically | Ownership / corruption risk |
| Autonomous restart loop (A2e) | Prohibited in current phase |
| Live promotion / arming | Humans authorize separately |
| Generic `/execute` or arbitrary commands | Injection / scope explosion |

---

## Required Gates Before Execution

**Every** future execution-capable recovery action must pass **all** applicable gates. Default is **deny**.

### Authentication and authorization

| Gate | Requirement |
|------|-------------|
| Dashboard auth present | `DASHBOARD_CONTROL_TOKEN` set; header on POST |
| Correct operator token | Fail-closed validation (A2j) |
| Typed confirmation | Required for high-risk actions (phrase id + match metadata in audit) |
| Action class not forbidden | Server-side allowlist only |

### Audit (fail-closed)

| Gate | Requirement |
|------|-------------|
| Recovery audit write succeeds **before** action | No action if `appendRecoveryAuditEntry` throws |
| Malformed audit row blocks action | Validate + sanitize first |
| Audit path writable | FS error ⇒ deny |
| Denied attempts may be audited | Optional policy; must not leak secrets |
| **Audit is evidence, not permission** | Row alone never authorizes execution |

### Prechecks and posture

| Gate | Requirement |
|------|-------------|
| Prechecks pass | Per action class (§ Precheck Model) |
| Postchecks defined | Recorded in audit row before action |
| Cooldown not active | Rate-limit repeat on same target |
| Duplicate-process warning clear | No ambiguous ownership |
| Safe posture | `PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false` (unless explicitly waived in approved design — not waived today) |
| No unresolved state corruption | Unreadable owned artifacts ⇒ deny |

### Regression and process gates

| Gate | Requirement |
|------|-------------|
| A2c preview guard passes | `test_recovery_preview_guards.js` green |
| Auth guards pass | `test_dashboard_auth_guards.js` + `test_dashboard_auth_behavior.js` green |
| Recovery audit tests pass | `test_recovery_audit.js` green |
| Safety suite green | **11/11** (or higher if new guards added) |
| Explicit human approval recorded | Written authorization before any execution route ships |

---

## Future Route Design Principles

If recovery POST routes are ever approved (separate milestone), they must follow:

| Principle | Rule |
|-----------|------|
| **No generic execute** | No `/execute`, `/run`, `/shell` |
| **No arbitrary command input** | Client sends **action id only** |
| **Fixed allowlist** | Server maps `actionId` → fixed operator runbook command |
| **No client command strings** | `commandPreview` is display-only; server owns `commandExecuted` |
| **No live mode change** | Recovery routes cannot set `executionMode`, `dryRunMode`, or arm live |
| **No live promotion route** | Ever forbidden |
| **No secret in URL** | Header auth only; query tokens rejected (A2j) |
| **POST + auth only** | Fail closed otherwise |
| **Audit before action** | Append pre-action row; fail closed on audit failure |
| **No autonomous loops** | One human-confirmed action per request |
| **No PID killing** | Unless separately reviewed and gated |
| **Executor restart** | Stricter review; blocked until R3/R4 resolved or explicitly waived with recorded risk acceptance |
| **Loopback bind** | `127.0.0.1` only (existing dashboard contract) |

---

## Recovery Audit Requirements

Separate from A3 `config_change_audit.jsonl`. Writer: `recovery_audit.js` → `recovery_actions.jsonl`.

### Before action (pre-action or planned row)

Must capture (minimum):

- `timestamp`, `actionId`, `actor`, `authMethod`
- `actionClass`, `actionName`, `targetProcess`
- `reason` (required for high-risk)
- `commandPreview` (display text; no secrets)
- `precheckStatus`, `precheckDetails`
- Posture snapshots: `liveArmedAtRequest`, `executionModeAtRequest`, `dryRunModeAtRequest`, `emergencyStopAtRequest`
- Confirmation metadata: safe `confirmationPhrase` (`matched:<id>` / `not-recorded`) — **never raw operator input**
- `sourceIpOrHost`, optional `dashboardSessionId`
- `riskLevel`, `requiresReview`
- `result`: `planned` or pre-execution state per A2m policy

### After action (completion row or update policy)

Must capture:

- `result`: `executed`, `failed`, `postcheck_failed`, `blocked`, `cancelled`
- `postcheckStatus`, `postcheckDetails`
- `commandExecuted` (fixed allowlist command actually run — redacted if needed)
- `error` when `failed` or `postcheck_failed`
- `relatedConfigAuditId` when action also changed config (A3 link)

### Policy reminders

- **Audit failure blocks action** — no durable row ⇒ no execution.
- **Audit is evidence, not permission** — auth + prechecks + human approval still required.
- **Repo-root ledger** — only after explicit production enablement policy; tests use `TRACKTA_RUNTIME_ROOT` only today.

---

## Precheck Model

### Low-risk recovery prechecks (all must pass)

| # | Precheck |
|---|----------|
| 1 | Target process unhealthy (STALE / MISSING / DEGRADED — not HEALTHY) |
| 2 | Posture safe: `executionMode === PIPELINE_DRY_RUN`, `dryRunMode === true`, `liveArmed === false` |
| 3 | `emergencyStop` appropriate for action (clear for restarts) |
| 4 | No duplicate-process ambiguity for target |
| 5 | Owned artifacts readable (no corruption signals) |
| 6 | Safety suite recently green **or** operator explicitly accepts stale-suite risk (recorded in audit) |
| 7 | Action not on cooldown |
| 8 | Action class = `low-risk-recovery`, not forbidden |

### High-risk recovery prechecks (all low-risk **plus**)

| # | Precheck |
|---|----------|
| 9 | Typed confirmation phrase matched (metadata in audit) |
| 10 | Operator `reason` non-empty |
| 11 | `requiresReview: true` in audit row |
| 12 | No open state corruption (config, positions, dedup unreadable) |
| 13 | Manual review acknowledgment (future UI/policy) |
| 14 | **Executor restart:** R3/R4 resolved **or** explicit recorded waiver — **not waived today** |

### Forbidden actions

| Precheck | Result |
|----------|--------|
| Any forbidden class | **Always blocked** — may audit as `blocked` / `forbidden` |

---

## Postcheck Model

After any future executed recovery action, record and evaluate:

| # | Postcheck |
|---|-----------|
| 1 | Target heartbeat → expected state (HEALTHY or documented alternate) |
| 2 | Supervisor / Recovery Advisor recommendations update sensibly (read-only verification) |
| 3 | `node live_executor.js --status` still safe (`PIPELINE_DRY_RUN`, `liveArmed: false`) |
| 4 | `liveArmed` remains **false** |
| 5 | No unexpected A3 config changes (cross-check `config_change_audit.jsonl`) |
| 6 | No reconciliation queue growth spike |
| 7 | No temp-file buildup (`*.tmp`, `live_config.json.*.tmp`) |
| 8 | Recovery audit row complete (result + postcheck fields) |
| 9 | **High-risk:** operator review required; escalation if postcheck fails — **no auto-remediation** |

Failed postcheck ⇒ `postcheck_failed` in audit; human review; never autonomous repair loop.

---

## Minimal Future Implementation Path

Execution remains **far behind** tests and review. Recommended phases:

| Phase | Title | Delivers | Does **not** deliver |
|-------|-------|----------|----------------------|
| **A2o** | Human-confirmed Recovery Design Plan | Allowlist map, harness spec, audit wiring design, denial matrix | Execution routes |
| **A2p** | Recovery Route Static Guards | Tests that fail if recovery POST routes appear without guards | Execution |
| **A2q** | Low-risk Preview Hardening | Preview/UX separation; no new buttons | Execution |
| **A2r** | Low-risk Recovery Execution Tests (fake harness) | Temp-dir tests: auth + audit + precheck → stub action only | Real spawn/kill |
| **A2s** | Low-risk Human-confirmed Recovery Implementation | **First** allowlisted low-risk action, if human-approved | High-risk, executor, live |
| **A2t** | Post-action Audit and Review | Postcheck automation + review template | Autonomous recovery |
| **A2 Review** | Phase 1 recovery execution gate | Human sign-off before any A2s code merges | Live promotion |

**A2n stops at review.** Next step is **A2o only**.

---

## Current Blockers

| Blocker | Impact |
|---------|--------|
| **A2d accelerated** — not full 72h soak | Long-duration / overnight behavior unproven |
| **No execution-specific route tests** | No guard for recovery POST drift |
| **`recovery_audit.js` not wired to route flow** | Audit-before-action not enforced in production path |
| **No fake executor / process recovery harness** | Cannot safely test execution boundary |
| **Duplicate-process ambiguity** | Operator-managed; wrong-target recovery risk |
| **R3/R4 non-atomic stores** | Executor restart high-risk |
| **High-risk actions not approved** | Executor / panic / emergencyStop clear blocked |
| **No live-trading authorization** | Live remains forbidden |
| **No approval for recovery execution** | No human authorization record |
| **A2m audit writer ≠ authorization** | Module existence must not be mistaken for permission |
| **Repo-root `recovery_actions.jsonl` absent** | By design until explicit production policy |

---

## Verdict

**A2n Human-confirmed Recovery Execution Review: COMPLETE**

| Assessment | Result |
|------------|--------|
| **Recovery execution readiness** | **NOT READY** |
| **Ready for limited execution design plan (A2o)** | **Yes — planning only** |
| **Safety suite** | **11/11 PASS** (unchanged by this review) |
| **Live status** | **DISARMED** (`liveArmed: false`) |
| **Posture** | **`PIPELINE_DRY_RUN` / `PIPELINE_OBSERVING`** |
| **Repo-root `recovery_actions.jsonl`** | **Absent** (expected) |

---

## Recommendation

1. **Proceed to A2o — Human-confirmed Recovery Design Plan** (documentation + test design only).
2. **Do not** implement recovery POST routes, dashboard execution buttons, process spawn/kill, or audit wiring to execution in the same milestone as A2o.
3. **Do not** create repo-root `recovery_actions.jsonl` manually or wire `appendRecoveryAuditEntry` to dashboard until A2o–A2r gates and human approval exist.
4. **Preserve** 11/11 safety suite and A2c/A2j/A2k/A2m boundaries — any future work extends guards first.
5. **Treat A2m as necessary but insufficient** — audit writer is a prerequisite, not approval to execute.

---

## Footer

> **Audit before recovery.**
> **Authentication before execution.**
> **Preview before action.**
> **Recovery must never outrun ownership.**
> **Humans authorize. Ori advises. Gates enforce.**

A2n closes the **readiness review** gate. It does not open the **execution** gate.

---

*A2n Human-confirmed Recovery Execution Review (planning only) · TracktaOS Module 1 · Sprint 4 · Recovery execution NOT READY · Next: A2o design plan only · No code/routes/execution · `recovery_actions.jsonl` NOT created · posture verified 2026-06-23.*
