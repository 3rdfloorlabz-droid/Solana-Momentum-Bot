# A2o — Human-confirmed Recovery Design Plan

**Module:** TracktaOS Module 1 — Solana Momentum Bot
**Sprint:** 4 (Phase 1 — Structure and Recovery)
**Status:** **COMPLETE (design plan)** — defines the lowest-risk future human-confirmed recovery architecture; implements nothing
**Plan date:** 2026-06-23
**Author:** Taylor / Ori

**Builds on:** [A2N_HUMAN_CONFIRMED_RECOVERY_EXECUTION_REVIEW.md](./A2N_HUMAN_CONFIRMED_RECOVERY_EXECUTION_REVIEW.md) · [A2M_REVIEW.md](./A2M_REVIEW.md) · [A2F_AUTH_RECOVERY_AUDIT_PLAN.md](./A2F_AUTH_RECOVERY_AUDIT_PLAN.md) · [A2L_RECOVERY_AUDIT_TEST_DESIGN.md](./A2L_RECOVERY_AUDIT_TEST_DESIGN.md) · [A2C_REVIEW.md](./A2C_REVIEW.md) · [A2_SUPERVISOR_PLAN.md](./A2_SUPERVISOR_PLAN.md)
**Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · [OPERATIONS.md](./OPERATIONS.md) · `dashboard_server.js` · `recovery_audit.js` · `run_safety_tests.js`

---

## Executive Summary

A2o designs a **bounded, lowest-risk** future path for **human-confirmed recovery execution** in TracktaOS. It specifies allowlisted actions, route constraints, auth and audit flow, prechecks/postchecks, cooldown and duplicate-process policy, fake-harness test phases, and future UI requirements — **without implementing any of them**.

**Conservative posture:**

| Statement | Truth |
|-----------|--------|
| TracktaOS ready for recovery **execution** today? | **No** ([A2N](./A2N_HUMAN_CONFIRMED_RECOVERY_EXECUTION_REVIEW.md)) |
| Ready for a **bounded design plan** for low-risk human-confirmed actions? | **Yes — this document** |
| Does this plan authorize execution? | **No** |
| Is `recovery_audit.js` wired to routes? | **No** |
| Is repo-root `recovery_actions.jsonl` created? | **No** |

First implementation phase (future **A2s**) is limited to **four low-risk restarts only** — scanner, paper monitor, wallet monitor, dashboard. **No executor**, **no panic reset**, **no emergencyStop clear**, **no spawn/kill in code until fake harness (A2q/A2r) and explicit review pass**.

> **Recovery execution remains NOT IMPLEMENTED and NOT APPROVED.**

---

## Scope

### In scope

- Future **low-risk** human-confirmed recovery architecture (design only)
- Server-side **action allowlist** (fixed at build time)
- Future **route shape** and constraints (not implemented)
- **Auth** requirements (`DASHBOARD_CONTROL_TOKEN` + header)
- **Recovery audit flow** via `recovery_audit.js` (planned → executed → postcheck rows)
- **Precheck / postcheck** models (global + per-action)
- **Cooldown** policy and persistence design
- **Duplicate-process** guard (block, no auto-kill)
- **Fake harness / test-first** phases (A2p–A2t)
- **Operator confirmation** model (typed phrase metadata, not raw storage)
- **Forbidden-action** enforcement rules
- Future **UI** requirements (separate from A2c preview)

### Out of scope (unchanged)

- Actual recovery POST routes or dashboard execution buttons
- Process spawning, killing, or PID checks in production code
- Executor restart, Reset After Panic, clearing `emergencyStop`
- Live mode / promotion / arming
- Autonomous recovery (A2e)
- Wiring `recovery_audit.js` to `dashboard_server.js`
- Creating repo-root `recovery_actions.jsonl`
- Any code, config, script, test, or runtime artifact change

---

## Candidate Action Classification

### Potential low-risk future candidates (first implementation phase only)

| Action | Target | A2c alignment |
|--------|--------|---------------|
| **Restart Scanner** | `scanner_gmgn_trending.js` | A2c low-risk preview |
| **Restart Paper Monitor** | `monitor.js` | A2c low-risk preview |
| **Restart Wallet Monitor** | `wallet_monitor.js` | A2c low-risk preview |
| **Restart Dashboard** | `dashboard_server.js` | A2c low-risk preview |

**Design-only today.** `allowedInCurrentPhase: false` until A2s + human approval.

### High-risk / not eligible in first implementation

| Action | Why deferred |
|--------|--------------|
| **Restart Executor** | R3/R4 non-atomic state (`observation_dedup.json`, `live_positions.json`); cycle timing |
| **Reset After Panic** | Config mutation + safety latch; dual A3/recovery audit |
| **Clear emergencyStop** | Config-control class; not a process restart |

A2c marks these **Blocked / High Risk Preview**. **Excluded from A2s.**

### Forbidden (never via recovery route)

| Forbidden action | Reason |
|------------------|--------|
| Enable live trading | Capital safety |
| Change `executionMode` to `LIVE` | Live promotion |
| Set `dryRunMode` false | Live promotion |
| Add / expose signer secret | Secret handling |
| Kill arbitrary processes | Scope / safety |
| Repair state files automatically | Ownership risk |
| Autonomous restart loop (A2e) | Prohibited |
| Live promotion / arming | Separate human authorization |
| Generic execute / shell | Injection / scope explosion |

Server allowlist must **reject** unknown `actionId` with `result: blocked` audit row (optional policy).

---

## Future Route Design

### Recommended pattern (not implemented)

**Do not add** `POST /recovery/preview/:actionId`. A2c already provides read-only preview on `GET /`. Adding a mutating “preview POST” blurs the preview/execution boundary.

**Recommended two-phase human confirmation:**

| Route | Purpose | Mutates process? |
|-------|---------|------------------|
| `POST /recovery/plan/:actionId` | Run prechecks only; append audit row `result: planned` or `blocked` | **No** |
| `POST /recovery/confirm/:actionId` | Re-run prechecks; append audit; **then** invoke fixed allowlisted action via harness/executor boundary | **Yes (future A2s+ only)** |

**Alternative (single route):** `POST /recovery/confirm/:actionId` only, with mandatory precheck + audit inside one handler. A2o **prefers two routes** so operators can inspect a **planned** audit row before confirming execution.

### Route constraints (all future recovery POSTs)

| Constraint | Rule |
|------------|------|
| No generic `/execute` | Fixed path prefix `/recovery/plan/` and `/recovery/confirm/` only |
| No arbitrary command input | Request body: `{ confirmationPhraseId, confirmationPhraseMatched, reason? }` — **no command field** |
| `actionId` allowlist | Known at build time; unknown id ⇒ 403 + optional blocked audit |
| POST only | GET remains read-only |
| Auth | `DASHBOARD_CONTROL_TOKEN` + `X-Trackta-Control-Token` (A2j) |
| Typed confirmation | Required on **confirm** route for every action |
| Audit before side effect | `appendRecoveryAuditEntry` must succeed before any harness invocation |
| Fail closed | Audit failure ⇒ no action |
| No live-promotion actions | Not in allowlist |
| No executor in phase 1 | Not in allowlist until separate review |
| No kill/spawn in route handler until A2q/A2r | Harness abstraction required first |
| Loopback | `127.0.0.1` bind unchanged |
| Query token | Rejected (same as A2j) |

### Request body (confirm route — design)

```json
{
  "confirmationPhraseId": "RESTART_SCANNER_DRY_RUN",
  "confirmationPhraseMatched": true,
  "reason": "optional operator note for audit"
}
```

Server validates phrase id against allowlist entry; stores `matched:<phrase-id>` in audit only — **never raw typed text**.

---

## Command Allowlist Design

Server-side map: **`actionId` → fixed metadata**. Commands are **never** accepted from the client.

All entries: **`allowedInCurrentPhase: false`** (design only).

### `restart-scanner`

| Field | Value |
|-------|--------|
| **actionId** | `restart-scanner` |
| **label** | Restart Scanner |
| **targetProcess** | `scanner_gmgn_trending.js` |
| **commandPreview** | `node scanner_gmgn_trending.js --watch` |
| **commandExecuted** (future) | Same fixed string — server-owned |
| **riskLevel** | `low` |
| **actionClass** | `low-risk-recovery` |
| **eligibleStates** | STALE, MISSING, NO DATA, DEGRADED, FAILED (not HEALTHY) |
| **requiredPrechecks** | Global + scanner unhealthy; no duplicate scanner |
| **requiredPostchecks** | `scanner_health.json` `lastScanAt` refreshes; supervisor HEALTHY |
| **confirmationPhraseId** | `RESTART_SCANNER_DRY_RUN` |
| **expectedPhraseTemplate** | Operator types phrase matching id policy (display only in UI) |
| **cooldown** | 5 minutes per target |
| **auditRequired** | true |
| **allowedInCurrentPhase** | **false** |

### `restart-paper-monitor`

| Field | Value |
|-------|--------|
| **actionId** | `restart-paper-monitor` |
| **label** | Restart Paper Monitor |
| **targetProcess** | `monitor.js` |
| **commandPreview** | `node monitor.js` |
| **riskLevel** | `low` |
| **actionClass** | `low-risk-recovery` |
| **eligibleStates** | STALE, MISSING, NO DATA (not HEALTHY; STALE may be quiet-not-dead) |
| **requiredPrechecks** | Global + operator acknowledges quiet-STALE risk in reason or UI checkbox |
| **requiredPostchecks** | `paper_positions.json` mtime/activity proxy; supervisor HEALTHY |
| **confirmationPhraseId** | `RESTART_PAPER_MONITOR_DRY_RUN` |
| **cooldown** | 5 minutes |
| **auditRequired** | true |
| **allowedInCurrentPhase** | **false** |

### `restart-wallet-monitor`

| Field | Value |
|-------|--------|
| **actionId** | `restart-wallet-monitor` |
| **label** | Restart Wallet Monitor |
| **targetProcess** | `wallet_monitor.js` |
| **commandPreview** | `node wallet_monitor.js` |
| **riskLevel** | `low` |
| **actionClass** | `low-risk-recovery` |
| **eligibleStates** | STALE, MISSING, NO DATA — **not DEGRADED** (fix RPC/env first) |
| **requiredPrechecks** | Global + not DEGRADED; RPC/env checked |
| **requiredPostchecks** | `wallet_status.json` `updatedAt` refreshes; supervisor HEALTHY |
| **confirmationPhraseId** | `RESTART_WALLET_MONITOR_DRY_RUN` |
| **cooldown** | 5 minutes |
| **auditRequired** | true |
| **allowedInCurrentPhase** | **false** |

### `restart-dashboard`

| Field | Value |
|-------|--------|
| **actionId** | `restart-dashboard` |
| **label** | Restart Dashboard |
| **targetProcess** | `dashboard_server.js` |
| **commandPreview** | `node dashboard_server.js` |
| **riskLevel** | `low` |
| **actionClass** | `low-risk-recovery` |
| **eligibleStates** | STALE, MISSING, FAILED (after code change or port conflict) |
| **requiredPrechecks** | Global + stale HTML/code change documented in reason |
| **requiredPostchecks** | `http://127.0.0.1:3000` loads current panels |
| **confirmationPhraseId** | `RESTART_DASHBOARD_DRY_RUN` |
| **cooldown** | 5 minutes |
| **auditRequired** | true |
| **allowedInCurrentPhase** | **false** |

### Allowlist module (future)

- Single source file e.g. `recovery_allowlist.js` ( **not created in A2o** )
- Exported frozen map; tests assert no extra keys
- Dashboard A2c preview reads **same labels/commands** for display consistency (future refactor — not A2o)

---

## Precheck Model

### Global prechecks (every plan/confirm)

| # | Precheck | Fail result |
|---|----------|-------------|
| G1 | Authenticated request (A2j) | `denied` |
| G2 | Valid known `actionId` | `blocked` |
| G3 | Action not forbidden class | `blocked` |
| G4 | `executionMode === PIPELINE_DRY_RUN` | `blocked` |
| G5 | `dryRunMode === true` | `blocked` |
| G6 | `liveArmed === false` | `blocked` |
| G7 | `emergencyStop` acceptable (false for restarts) | `blocked` |
| G8 | Safety suite green within policy window **or** operator accepts stale-suite risk (recorded in audit) | `blocked` |
| G9 | Target process state eligible (not HEALTHY unless policy exception — none in phase 1) | `blocked` |
| G10 | No duplicate-process ambiguity for target | `blocked` |
| G11 | Cooldown not active for `actionId`/target | `blocked` |
| G12 | No unresolved config/state corruption (unreadable artifacts) | `blocked` |
| G13 | Audit pre-row can be built and **written** | `blocked` (fail closed) |
| G14 | `test_recovery_preview_guards.js` would pass (static posture) | design gate |
| G15 | Auth + audit tests green at implementation time | design gate |

### Per-action prechecks (in addition to global)

| Action | Extra prechecks |
|--------|-----------------|
| **Scanner** | Scanner heartbeat ∈ eligibleStates; **no second scanner** process set |
| **Paper monitor** | Heartbeat ∈ eligibleStates; UI/audit note if STALE may be quiet |
| **Wallet monitor** | Heartbeat ∈ eligibleStates; **block if DEGRADED** (RPC/env) |
| **Dashboard** | Heartbeat STALE/MISSING/FAILED; reason cites stale HTML or deploy |

Precheck results stored in audit `precheckDetails[]` as `{ label, ok, detail? }`.

---

## Recovery Audit Flow

Uses `recovery_audit.js` → `recovery_actions.jsonl` (temp path in tests; repo root only after explicit production policy).

**Append-only event model — no in-place updates.** Related events share `actionId` or a new `correlationId` field (future schema extension — requires reviewed change to A2l/A2m).

### Event sequence (confirm path — design)

| Step | Row `result` | When |
|------|--------------|------|
| 1 | `planned` | After prechecks pass on **plan** or start of **confirm** |
| 2 | `executed` or `failed` | After harness invocation attempt |
| 3 | `postcheck_failed` or final `executed` | After postchecks (may be separate row with same correlation) |

Blocked/denied paths: single row `denied` or `blocked` with prechecks; **no** `commandExecuted`.

### Before action (minimum row fields)

`timestamp`, `actionId`, `actor`, `authMethod: dashboard_control_token`, `actionClass`, `actionName`, `targetProcess`, `commandPreview`, `precheckStatus`, `precheckDetails`, posture snapshots, `confirmationPhrase` (`matched:<id>`), `sourceIpOrHost`, `riskLevel`, `requiresReview`, `result: planned`

### After action

- **`executed`:** `commandExecuted` (fixed allowlist string), `postcheckStatus`, `postcheckDetails`
- **`failed`:** `error` required, `commandExecuted` if attempt started
- **`postcheck_failed`:** `error` with postcheck summary
- **`relatedConfigAuditId`:** null for phase-1 restarts (no config change)

### Fail-closed rules

- If `appendRecoveryAuditEntry` throws ⇒ **abort**; no harness call
- Audit is **evidence, not permission** — still requires auth, allowlist, prechecks, human approval milestone

### Secret policy (A2m aligned)

- Never store raw token, headers, signer material, or raw confirmation phrase
- Use `confirmationPhraseId` + `confirmationPhraseMatched` input → `matched:<id>` in ledger

---

## Postcheck Model

Run after harness reports completion (fake or real — future).

| # | Postcheck | Pass criterion |
|---|-----------|----------------|
| P1 | Target heartbeat | HEALTHY or documented expected state within timeout |
| P2 | Dashboard advisor | Supervisor / Recovery Advisor reflect improvement (read-only) |
| P3 | `live_executor.js --status` | `PIPELINE_DRY_RUN`, `liveArmed: false` |
| P4 | Config unchanged | No unexpected A3 rows |
| P5 | Reconciliation queue | No spike in `pending_reconciliation.jsonl` |
| P6 | Temp files | No new `*.tmp` / `live_config.json.*.tmp` |
| P7 | Audit complete | Planned + executed + postcheck rows present |
| P8 | Operator visibility | UI shows outcome; high-risk N/A in phase 1 |

Failed postcheck ⇒ `postcheck_failed` audit row; **no auto-remediation**; operator review.

---

## Fake Harness / Test-first Plan

Execution code is **forbidden** until these phases pass in order.

### A2p — Recovery Route Static Guards

**Deliverable:** `test_recovery_route_guards.js` (name provisional)

| Static check |
|--------------|
| No generic `/execute`, `/shell`, `/run` routes |
| Recovery routes (if any) match `/recovery/plan/` and `/recovery/confirm/` only |
| Every recovery POST wrapped by auth helper |
| No client command field in handler |
| Allowlist module exists; no forbidden action ids |
| No live promotion route |
| No executor action in phase-1 allowlist |
| `dashboard_server.js` does not call spawn/exec for recovery |
| A2c + auth + audit tests still pass |

### A2q — Fake Process Harness

**Deliverable:** `recovery_harness_fake.js` + tests (temp only)

| Property |
|----------|
| Simulates scanner/paper/wallet/dashboard restart |
| **No real TracktaOS processes** |
| `TRACKTA_RUNTIME_ROOT` temp dir |
| Fake heartbeat files (`scanner_health.json`, etc.) |
| Fake audit ledger via `TRACKTA_RUNTIME_ROOT` |
| Fake cooldown state file or ledger scan |
| No `child_process` in tests touching real bot |

### A2r — Low-risk Recovery Behavioral Tests

**Deliverable:** extend harness tests or `test_recovery_behavior.js`

| Scenario |
|----------|
| Unauthenticated ⇒ denied; no harness call |
| Wrong token ⇒ denied |
| Forbidden `actionId` ⇒ blocked |
| Ineligible state (HEALTHY) ⇒ blocked |
| Audit write failure ⇒ blocks harness |
| Successful fake restart ⇒ planned + executed + postcheck rows |
| No real processes; no repo-root `recovery_actions.jsonl` |
| Real `live_config.json` unchanged |

### A2s — Low-risk Human-confirmed Recovery Implementation

**Only after A2p + A2q + A2r green + human approval**

- Wire **confirm** route to fake-then-real harness boundary
- **Four low-risk actions only**
- Still **no executor**, **no live**, **no kill**

### A2t — Post-action Review

- Review template for first live operator trials
- Evidence before expanding allowlist

---

## Duplicate-process Guard

Future implementation **must**:

| Rule | Behavior |
|------|----------|
| Detect duplicate target | Before plan/confirm — e.g. two scanner windows, overlapping `start_fomo.ps1` sets |
| Block if ambiguous | `result: blocked`; audit reason "duplicate process — manual cleanup required" |
| **No automatic killing** | Never pick a PID to kill in phase 1 |
| **No PID checks in phase 1** | Detection via operator-facing checklist + optional process inventory script read-only — **not** auto PID scan unless separately reviewed |
| Advise manual cleanup | Point to [OPERATIONS.md](./OPERATIONS.md) duplicate-process guidance |

If detection is uncertain ⇒ **block** (fail closed).

---

## Cooldown Policy

| Policy | Value |
|--------|--------|
| Default cooldown | **5 minutes** per `actionId` (per target) |
| Repeated failures | Escalate to **15 minutes** after 2 failed attempts in 1 hour (design) |
| Block behavior | Cooldown active ⇒ `blocked` + audit row |
| Persistence | **Must not rely on in-memory-only** — scan `recovery_actions.jsonl` for last `executed`/`failed` timestamp per actionId **or** dedicated `recovery_cooldown.json` with atomic write (future decision in A2p) |
| Dashboard restart | Cooldown survives dashboard restart if ledger/file backed |
| Security note | Cooldown is abuse-throttle, not auth — auth still required |

---

## Future UI Requirements

Separate **execution UI** from A2c preview (future milestone — not A2o).

### Must show

- Action label and `actionId`
- Target process
- Current eligibility and **blocked reason**
- Exact **server-side** command preview (from allowlist)
- Precheck list with pass/fail
- Audit notice: "Recorded to recovery_actions.jsonl"
- Typed confirmation field (phrase id policy)
- Cooldown remaining
- Postcheck expectation
- **"This does not authorize live trading."**

### Must not show

- Go live / promotion CTAs
- Arbitrary command input
- Kill buttons
- Repair-state buttons
- Executor restart in phase 1
- Autonomous / "fix automatically" wording

A2c preview **remains** read-only until explicit reviewed change.

---

## Current Blockers

| Blocker | Notes |
|---------|--------|
| A2d accelerated only | Not full 72h soak |
| No fake recovery harness | A2q not started |
| No recovery route static guards | A2p not started |
| No low-risk behavioral route tests | A2r not started |
| Duplicate-process ambiguity | Operator-managed |
| Cooldown persistence | Designed here; not implemented |
| Executor R3/R4 | Blocks executor/panic in all near-term phases |
| No human approval for execution-capable recovery | Required before A2s |
| Live trading prohibited | Unchanged |
| `recovery_audit.js` unwired | By design until A2r+ |
| A2o is design only | **No execution** |

---

## Verdict

**A2o Human-confirmed Recovery Design Plan: COMPLETE**

| Assessment | Result |
|------------|--------|
| Recovery execution implemented? | **No** |
| Recovery execution approved? | **No** |
| Design plan for low-risk human-confirmed path? | **Complete** |
| Safety suite (unchanged) | **11/11 PASS** |
| Posture | **`PIPELINE_DRY_RUN` / `liveArmed: false`** |

---

## Recommendation

1. **Proceed to A2p — Recovery Route Static Guards** (tests only; no routes yet, or red tests against stubs).
2. **Do not** implement recovery POST routes, spawn/kill, or dashboard execution buttons in A2p.
3. **Do not** wire `appendRecoveryAuditEntry` to `dashboard_server.js` until A2r harness proves fail-closed flow.
4. **Do not** create repo-root `recovery_actions.jsonl` manually.
5. **Preserve** A2c preview guard — execution UI is a **separate surface** from preview.
6. **Require** recorded human approval before any A2s implementation merge.

---

## Footer

> **Audit before recovery.**
> **Authentication before execution.**
> **Preview before action.**
> **Recovery must never outrun ownership.**
> **Humans authorize. Ori advises. Gates enforce.**

A2o defines the **blueprint** for the smallest safe recovery execution path. It does not build the path.

---

*A2o Human-confirmed Recovery Design Plan (planning only) · TracktaOS Module 1 · Sprint 4 · Low-risk allowlist + route/audit/harness design · No code/routes/execution · `recovery_actions.jsonl` NOT created · Next: A2p static guards · posture verified 2026-06-23.*
