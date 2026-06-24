# A2l — Recovery Audit Test Design (Planning & Test-Design Only)

**Module:** TracktaOS Module 1 — Solana Momentum Bot
**Sprint:** 4 (Phase 1 — Structure and Recovery)
**Status:** **COMPLETE (test design)** — defines the test strategy that must precede recovery audit implementation. No code, config, route, script, dependency, test file, or audit file created.
**Operating constraint:** `PIPELINE_DRY_RUN` unchanged; execution-capable recovery remains **blocked**.

**Builds on:** [A2F_AUTH_RECOVERY_AUDIT_PLAN.md](./A2F_AUTH_RECOVERY_AUDIT_PLAN.md) (recovery-audit schema + fail-closed rules) · [A2G_DASHBOARD_AUTH_READINESS_REVIEW.md](./A2G_DASHBOARD_AUTH_READINESS_REVIEW.md) (control-surface inventory) · [A2H_AUTH_GUARD_TEST_DESIGN.md](./A2H_AUTH_GUARD_TEST_DESIGN.md) (auth tests-first pattern) · [A2C_REVIEW.md](./A2C_REVIEW.md) (preview-only, guarded) · [A2D_SOAK_REVIEW.md](./A2D_SOAK_REVIEW.md) (accelerated soak, risk-accepted) · [A3_CONFIG_CHANGE_AUDIT_PLAN.md](./A3_CONFIG_CHANGE_AUDIT_PLAN.md)
**Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · [OPERATIONS.md](./OPERATIONS.md) · `dashboard_server.js` · `test_dashboard_auth_guards.js` · `test_dashboard_auth_behavior.js` · `test_recovery_preview_guards.js` · `run_safety_tests.js`

---

## Executive Summary

A2l designs the **tests-first** strategy for the future `recovery_actions.jsonl` recovery audit ledger and its writer module (`recovery_audit.js`, name provisional). It specifies what tests must exist and pass **before** any recovery audit code is written or any execution-capable recovery surface is considered.

A2j shipped dashboard config-control auth (`DASHBOARD_CONTROL_TOKEN` + `X-Trackta-Control-Token`). A2k shipped isolated HTTP behavioral auth tests (`test_dashboard_auth_behavior.js`, temp fixtures via `TRACKTA_RUNTIME_ROOT`). A2f defined the recovery audit schema. **A2l does not implement the ledger, writer, routes, or tests.** It only freezes the test contract for **A2m (recovery audit implementation)**.

Principle: **audit tests before audit implementation; authentication before execution; audit before recovery.** The recovery audit writer and any future recovery execution path must not land until these tests are written, reviewed, and verified green against an implementation in temp fixtures only.

> **Recovery audit is not implemented. `recovery_actions.jsonl` was not created. Recovery execution remains blocked.**

---

## Scope

### Covered

- Recovery audit objective (what the ledger must prove)
- Ledger file expectations (`recovery_actions.jsonl`, not created)
- Schema validation test plan (fields from A2f, refined enums for A2m)
- Required fields by event type (denied, blocked, successful low/high-risk, failed execution, postcheck failure)
- Test categories: static, writer unit, fail-closed, integration (temp fixtures)
- Relationship to A3 `config_change_audit.jsonl`
- Secret-handling test design
- Allowed enums for A2m
- Future test file plan (`test_recovery_audit_design.js` / A2m activation)
- A2m acceptance criteria
- Blockers and verdict

### Not covered (unchanged)

- Implementing `recovery_audit.js` or `recovery_actions.jsonl`
- Creating any test file (planned only)
- Dashboard, route, script, config, dependency, or database changes
- Recovery execution, process spawn/kill, PID checks
- Live enablement or posture changes
- Weakening A2c preview guardrails or A2j/A2k auth tests

> A2l is **documentation-only test design.** The test file is **planned, not created.**

---

## Recovery Audit Objective

The future recovery audit system must **prove** (via tests enforced before implementation ships):

| # | Property | Test implication |
|---|----------|------------------|
| 1 | **Every future recovery attempt is append-only audited** | Writer tests assert one JSON line appended per attempt; no rewrite/truncate |
| 2 | **Denied actions may be audited separately if chosen** | Integration tests cover optional denial rows (`result: denied`) without config mutation |
| 3 | **Successful action requires an audit row** | Fail-closed: action path cannot complete without durable audit write |
| 4 | **Audit failure blocks action** | Writer throw / fs error / malformed row ⇒ action does not proceed |
| 5 | **Malformed audit row blocks action** | Schema validation rejects incomplete/invalid entries before append |
| 6 | **Audit never stores secrets** | Secret-handling tests scan rows for token/signer/key/header dumps |
| 7 | **Audit never authorizes actions** | Tests assert audit write alone does not mutate config or spawn processes |
| 8 | **Audit is evidence, not permission** | No test may treat an audit row as sufficient to allow execution |
| 9 | **No recovery execution without auth + prechecks + audit** | Integration tests: missing any gate ⇒ no execution primitive invoked |

**Relationship to shipped auth (A2j/A2k):** Config-control POST routes already require auth. Auth-denied config-control requests **do not** write A3 rows today (verified in A2k). Whether auth-denied recovery attempts write a `recovery_actions.jsonl` row is an **A2m implementation choice** — if enabled, tests must prove the row is distinct from A3 and contains no secrets.

---

## Ledger File Expectations

**Future file (NOT CREATED):** `<repo-root>/recovery_actions.jsonl`

| Expectation | Future test |
|-------------|-------------|
| **Path** | Default repo root; tests may override via env (e.g. `TRACKTA_RECOVERY_AUDIT_FILE` or `TRACKTA_RUNTIME_ROOT`) to temp dir only |
| **Append-only** | Read file before/after append; prior bytes unchanged; line count +1 |
| **Newline-delimited JSON** | Each line is exactly one JSON object; file ends with `\n` |
| **One event per line** | No multi-line JSON; no JSON array wrapper |
| **No truncation** | Append failure must not shorten file |
| **No overwrite** | Writer never opens with `"w"` on the ledger; only append |
| **Valid JSON per line** | `JSON.parse` each line in tests |
| **Stable required fields** | Schema tests enforce per event type (§ Required Fields by Event Type) |
| **Redaction** | Token/secret-like substrings absent (§ Secret Handling Tests) |
| **No command output secrets** | `commandExecuted` must not store raw env dumps or stderr containing secrets |
| **Durable write (if chosen in A2m)** | Optional: fsync-before-return test mirroring A1b discipline; not required until A2m chooses durability policy |

**Repo root rule:** During all automated tests, `recovery_actions.jsonl` must **not** exist at repo root unless a test explicitly creates a temp copy elsewhere. Static A2l-mode tests will assert `!fs.existsSync(<repo-root>/recovery_actions.jsonl)`.

---

## Schema Validation Plan

Fields align with [A2F_AUTH_RECOVERY_AUDIT_PLAN.md](./A2F_AUTH_RECOVERY_AUDIT_PLAN.md) §6. A2l refines enums (§ Allowed Enums) for test stability. A2m implementation must match this document or update it in a reviewed change.

### Core field validation rules (writer unit tests)

| Field | Validation |
|-------|------------|
| `timestamp` | ISO-8601 UTC string; parseable; not in the future beyond clock skew tolerance |
| `actionId` | Non-empty string; UUID v4 recommended; unique within file |
| `actor` | Non-empty string; `"unauthenticated"` allowed only for denied/blocked paths |
| `authMethod` | Enum (§ Allowed Enums) |
| `actionClass` | Enum (§ Allowed Enums) |
| `actionName` | Non-empty string for recovery attempts; may be null for pure auth-denial stubs if designed |
| `targetProcess` | String or null per action class |
| `requestedState` | String or null |
| `reason` | String or null; required for high-risk-recovery |
| `commandPreview` | String; required when action is recovery-class; must match A2c preview text policy (no secrets) |
| `commandExecuted` | String or null; null when not executed |
| `precheckStatus` | Enum (§ Allowed Enums) |
| `precheckDetails` | Array (may be empty); each entry `{ label, ok, detail? }` |
| `postcheckStatus` | Enum (§ Allowed Enums) |
| `postcheckDetails` | Array (may be empty) |
| `result` | Enum (§ Allowed Enums) |
| `error` | String or null; required when `result` is `failed` or `postcheck_failed` |
| `liveArmedAtRequest` | Boolean |
| `executionModeAtRequest` | String |
| `dryRunModeAtRequest` | Boolean |
| `emergencyStopAtRequest` | Boolean |
| `confirmationPhrase` | See § Secret Handling Tests — never store raw secrets |
| `sourceIpOrHost` | String; expected `127.0.0.1` / `localhost` in dashboard context |
| `dashboardSessionId` | String or null |
| `relatedConfigAuditId` | String or null; UUID matching A3 `changeId` when linked |
| `requiresReview` | Boolean; must be `true` for high-risk-recovery and recommended for denied/blocked |
| `riskLevel` | Enum (§ Allowed Enums) |

### Validation test mechanics

1. **Happy-path fixture row** — minimal valid object per event type passes `validateRecoveryAuditEntry(row)`.
2. **Missing required field** — reject with typed error; no file write.
3. **Wrong enum value** — reject; no file write.
4. **Extra fields** — policy for A2m: either strip unknown keys or reject; tests must lock the choice (recommend **reject** for audit integrity).
5. **Duplicate `actionId`** — reject second append in same test run (or same file) if uniqueness enforced.

---

## Required Fields by Event Type

Legend: **R** = required, **O** = optional, **—** = must be null/absent, **C** = conditional.

| Field | Denied (auth) | Blocked (precheck/forbidden) | Successful low-risk | High-risk (executed) | Failed execution | Postcheck failure |
|-------|:-------------:|:------------------------------:|:-------------------:|:--------------------:|:----------------:|:-----------------:|
| `timestamp` | R | R | R | R | R | R |
| `actionId` | R | R | R | R | R | R |
| `actor` | R | R | R | R | R | R |
| `authMethod` | R | R | R | R | R | R |
| `actionClass` | R | R | R | R | R | R |
| `actionName` | C | R | R | R | R | R |
| `targetProcess` | O | R | R | R | R | R |
| `requestedState` | O | O | O | R | R | R |
| `reason` | O | O | O | R | R | R |
| `commandPreview` | O | R | R | R | R | R |
| `commandExecuted` | — | — | R | R | R | R |
| `precheckStatus` | O | R (`fail`) | R (`pass`) | R (`pass`) | R | R (`pass`) |
| `precheckDetails` | O | R | R | R | R | R |
| `postcheckStatus` | O | O | R | R | O | R (`fail`) |
| `postcheckDetails` | O | O | R | R | O | R |
| `result` | `denied` | `blocked` | `executed` | `executed` | `failed` | `postcheck_failed` |
| `error` | O | O | — | — | R | R |
| Posture snapshot fields | R | R | R | R | R | R |
| `confirmationPhrase` | — | O | O | R (match metadata only) | C | C |
| `sourceIpOrHost` | R | R | R | R | R | R |
| `dashboardSessionId` | O | O | O | O | O | O |
| `relatedConfigAuditId` | — | O | O | C | C | C |
| `requiresReview` | R (`true`) | R (`true`) | O (`false`) | R (`true`) | R (`true`) | R (`true`) |
| `riskLevel` | R | R | `low` | `high`/`critical` | R | R |

**Notes:**

- **Denied (auth):** `authMethod` may be `none`; `actionClass` may be `config-control` or recovery class attempted; no `commandExecuted`.
- **Blocked:** Precheck or forbidden class; `precheckStatus: fail`; `result: blocked`; no execution.
- **Successful low-risk:** Full pre/post checks; `riskLevel: low`; `requiresReview: false` unless policy says otherwise.
- **High-risk:** Strict confirmation metadata; `requiresReview: true`; `riskLevel: high` or `critical`.
- **Failed execution:** Command attempted but error; `result: failed`; `error` required.
- **Postcheck failure:** Execution may have run but postcheck failed; `result: postcheck_failed`; no auto-remediation.

**Preview-only / planned rows (optional future):** If A2m records A2c "planning" events without execution, use `result: planned`, `commandExecuted: null`, `actionClass: preview-only` — **not required for initial A2m** unless explicitly approved.

---

## Test Categories

### A. Static tests (no server; mirror `test_recovery_preview_guards.js` / `test_dashboard_auth_guards.js`)

Run against source text and repo filesystem **before** recovery audit implementation lands:

| Check | Expected today (A2l) | Expected after A2m (only if approved) |
|-------|----------------------|---------------------------------------|
| `recovery_actions.jsonl` absent at repo root | **Pass** | Tests use temp path only |
| `dashboard_server.js` does not reference `recovery_actions.jsonl` | **Pass** | Allowed only with writer import + explicit review |
| No recovery POST routes | **Pass** | Still pass until separate approval |
| No recovery execution primitives in dashboard | **Pass** | Still pass |
| `test_recovery_preview_guards.js` green | **Pass** | Must stay green |
| `test_dashboard_auth_guards.js` green | **Pass** | Must stay green |
| `test_dashboard_auth_behavior.js` green | **Pass** | Must stay green |
| A2f/A2l design docs present | **Pass** | Pass |

Static tests must **not** falsely claim the writer exists before A2m.

### B. Audit writer unit tests (future `recovery_audit.js`)

Future module (name provisional) exposes at minimum:

- `validateRecoveryAuditEntry(row)` → `{ ok, errors[] }`
- `appendRecoveryAuditEntry(row, { filePath })` → `{ actionId }` (append-only)
- `redactRecoveryAuditFields(row)` → sanitized row

Tests (temp file only):

| # | Test |
|---|------|
| W1 | Appends exactly one JSON line + trailing newline |
| W2 | Rejects missing required fields |
| W3 | Rejects invalid enums |
| W4 | Redacts token-like fields (§ Secret Handling) |
| W5 | Prior file content unchanged on append |
| W6 | Rejects truncate/overwrite attempts |
| W7 | `actionId` uniqueness policy enforced |
| W8 | `timestamp` ISO format enforced |
| W9 | `riskLevel`, `actionClass`, `result`, pre/post status enums enforced |

### C. Fail-closed tests

| # | Condition | Expected |
|---|-----------|----------|
| F1 | Audit file cannot be written (read-only dir) | Action blocked; no execution side effect |
| F2 | Audit entry malformed (validation fail) | Action blocked; no append |
| F3 | Audit path unavailable | Action blocked |
| F4 | Audit writer throws | Action blocked; temp config unchanged |
| F5 | Action class `forbidden` | Blocked; optional audit row with `result: blocked` |
| F6 | Auth missing | Blocked; no recovery execution; no A3 row unless separate config path |
| F7 | Prechecks fail | Blocked; audit row allowed with `precheckStatus: fail` |
| F8 | Successful path without audit write | **Must not occur** — test fails if action completes without row |

### D. Integration tests (temp fixtures only)

Harness pattern (extend A2k):

- `os.tmpdir()` workdir via `TRACKTA_RUNTIME_ROOT` + dedicated `TRACKTA_RECOVERY_AUDIT_FILE`
- Temp `live_config.json`, `config_change_audit.jsonl`, `live_control_events.jsonl`, `recovery_actions.jsonl`
- Random localhost port; never port 3000
- No `spawn` / `exec` / `child_process` / `process.kill` in tests or new production code
- Snapshot real repo files before/after; assert unchanged

| # | Scenario |
|---|----------|
| I1 | Forbidden action ⇒ blocked + optional audit row; no process execution |
| I2 | Auth + prechecks pass (mocked/stubbed execution boundary) ⇒ audit row + fixture update only in temp |
| I3 | Config-changing recovery (future) ⇒ A3 row + recovery row; `relatedConfigAuditId` links when available |
| I4 | Missing `relatedConfigAuditId` when config did not change ⇒ field null; test documents explicit handling |
| I5 | Audit write ordering: if both ledgers written, config audit first then recovery audit (deterministic) |

**Correct-token mutation of real `live_config.json` is never allowed in tests.**

---

## A3 Config Audit Relationship

| Rule | Test coverage |
|------|---------------|
| **Separate files** | `config_change_audit.jsonl` ≠ `recovery_actions.jsonl`; paths never aliased |
| **Separate subjects** | A3 = config field changes; recovery audit = recovery attempts |
| **Dual-write actions** | Only when explicitly designed (e.g. Reset After Panic); integration test asserts both rows |
| **`relatedConfigAuditId`** | Must equal A3 `changeId` when linked; null when no config change |
| **Missing link** | Test explicit null + no fabricated id |
| **Ordering** | If both written in one action: config audit append first, recovery audit second (same `timestamp` within skew OK) |
| **Neither grants permission** | Tests assert rows alone do not enable live or bypass auth |

Config-control routes today write **A3 + `live_control_events.jsonl` only** (not recovery audit). Retrofit policy for whether config-control also writes recovery-class rows is **deferred to A2m+ review** — tests must be updated before any dual-write ships.

---

## Secret Handling Tests

| Secret / sensitive input | Must never appear in `recovery_actions.jsonl` |
|--------------------------|--------------------------------------------------|
| `DASHBOARD_CONTROL_TOKEN` | Yes — scan row JSON |
| `X-Trackta-Control-Token` header value | Yes |
| `SOLANA_SIGNER_SECRET` / private keys | Yes |
| Raw `.env` dumps | Yes |
| Full request headers object | Yes — no wholesale header serialization |
| Raw command stderr/stdout | Yes — unless redacted/truncated policy approved |

### `confirmationPhrase` policy (A2l decision)

| Approach | Verdict |
|----------|---------|
| Store raw operator-typed text | **Reject** — could contain secrets |
| Store expected phrase id / label only (e.g. `"RESTART_EXECUTOR_DRY_RUN"`) | **Allow** |
| Store `{ matched: true, expectedPhraseId: "..." }` | **Preferred** |
| Store SHA-256 hash of typed phrase | **Optional** for forensic match without cleartext |

Tests must assert rows contain **no** literal token values and **no** `process.env` serialization.

---

## Allowed Enums

A2m tests enforce these values (superset of A2f where noted):

### `actionClass`

| Value | Meaning |
|-------|---------|
| `view-only` | Read-only dashboard surfaces |
| `preview-only` | A2c preview (no execution) |
| `config-control` | `/control/start`, `/control/stop`, `/control/emergency` |
| `low-risk-recovery` | Scanner / paper monitor / wallet monitor / dashboard restart |
| `high-risk-recovery` | Executor restart, reset after panic |
| `forbidden` | Live enablement, autonomous loop, etc. |

### `riskLevel`

`none` · `low` · `medium` · `high` · `critical`

(Config-control automation toggles map to `medium` or `high` in A2m — lock in implementation review.)

### `result`

| Value | Meaning |
|-------|---------|
| `denied` | Auth failure |
| `blocked` | Precheck/forbidden/policy block |
| `planned` | Recorded intent only (optional) |
| `executed` | Action completed (subject to postcheck) |
| `failed` | Execution error |
| `postcheck_failed` | Executed but postcheck failed |
| `cancelled` | Operator cancelled before execution |

### `precheckStatus` / `postcheckStatus`

`pass` · `fail` · `skipped` · `unknown`

(A2f used `pending` / `n/a` for postcheck — map to `unknown` / `skipped` in A2m or extend enums with reviewed doc update.)

### `authMethod`

`operator_token` · `dashboard_control_token` · `hmac` · `none`

Note: shipped auth uses `DASHBOARD_CONTROL_TOKEN`; tests should use `dashboard_control_token` for config-control rows to match reality.

---

## Future Test File Plan

### Planned file: `test_recovery_audit_design.js` (NOT CREATED in A2l)

Two modes (mirroring A2i/A2j pattern):

| Mode | When | Contents |
|------|------|----------|
| **A2l static (default)** | Before A2m | Assert `recovery_actions.jsonl` absent; no `recovery_audit.js`; no dashboard references to ledger; A2f/A2l docs exist; recovery routes/primitives absent; pointer that writer tests pending |
| **A2m active** | After `recovery_audit.js` lands | Enable writer + fail-closed + temp integration tests; register in `run_safety_tests.js` |

**A2l choice:** Do **not** create the test file yet. Existing guards (`test_recovery_preview_guards.js`, `test_dashboard_auth_guards.js`) already assert no `recovery_actions.jsonl` references in dashboard. Adding a redundant test file risks doc drift without new coverage. A2m creates the file when the writer exists.

### Safety suite integration (future)

| Milestone | Suite size |
|-----------|------------|
| Today (A2l) | **10/10** unchanged |
| A2m writer unit tests only | **11/11** (estimated) |
| A2m + integration harness | **12/12** (estimated) — only if fully isolated |

---

## A2m Acceptance Criteria

Before recovery audit implementation is considered complete:

- [ ] `recovery_audit.js` (or approved name) exists with validated append-only writer
- [ ] Audit writer unit tests pass (temp files only)
- [ ] Append-only behavior proven (no truncate/overwrite)
- [ ] Schema validation enforced per § Required Fields by Event Type
- [ ] Secret redaction proven (§ Secret Handling Tests)
- [ ] Audit failure blocks action (§ Fail-closed tests)
- [ ] `test_dashboard_auth_guards.js` remains green
- [ ] `test_dashboard_auth_behavior.js` remains green
- [ ] `test_recovery_preview_guards.js` remains green
- [ ] No recovery execution routes or primitives added
- [ ] `recovery_actions.jsonl` created **only** in temp fixtures during tests — **not** at repo root in CI/dev unless operator explicitly enables production logging
- [ ] Safety suite remains green
- [ ] Posture unchanged: `PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false`
- [ ] No live enablement
- [ ] Human approval recorded before any execution-capable recovery UI

---

## Current Blockers

| Blocker | Status |
|---------|--------|
| **Recovery audit not implemented** | `recovery_actions.jsonl` schema designed (A2f); tests designed (A2l); **no writer** |
| **Recovery audit tests not implemented** | A2m must be tests-first |
| **Execution-capable recovery UI blocked** | A2c preview-only; guarded |
| **A2d accelerated** | Full 72h soak not done; risk-accepted |
| **Duplicate-process ambiguity** | Operator-managed; affects postchecks |
| **R3/R4 non-atomic stores** | `observation_dedup.json` / `live_positions.json` |
| **No human approval** for execution-capable recovery | Required |
| **Live trading prohibited** | Unchanged |

Auth for config-control is **resolved (A2j/A2k)**. Recovery auth + audit + execution remain **separate, future gates**.

---

## Verdict

**A2l Recovery Audit Test Design: COMPLETE**

This document defines the test strategy, schema validation expectations, fail-closed rules, secret handling, enum contracts, and A2m acceptance criteria for the future recovery audit ledger.

**Recovery audit is not implemented. `recovery_actions.jsonl` was not created. Recovery execution remains blocked.**

---

## Recommendation

1. **Next milestone: A2m (tests-first)** — implement `test_recovery_audit_design.js` static mode + failing writer tests, then `recovery_audit.js` until green (temp fixtures only).
2. **Do not create `recovery_actions.jsonl` at repo root** until A2m explicitly defines production enablement and operator runbook updates.
3. **Do not add recovery POST routes** until auth + audit writer + integration tests + explicit human approval all pass.
4. **Preserve A2c/A2j/A2k guards** — any recovery audit work must extend the 10/10 suite, never weaken existing boundaries.
5. **Resolve `confirmationPhrase` storage** in A2m using the metadata-only policy above unless a reviewed security decision adopts hashing.

---

## Footer

> **Audit tests before audit implementation.**
> **Authentication before execution.**
> **Audit before recovery.**
> **Preview before action.**
> **Recovery must never outrun ownership.**
> **Humans authorize. Ori advises. Gates enforce.**

A2l is the test-design gate between A2f (schema) and A2m (writer implementation) — it raises the bar; it does not open the door.

---

*A2l Recovery Audit Test Design (planning only) · TracktaOS Module 1 · Sprint 4 · Designs tests for `recovery_actions.jsonl` before implementation. No code, no routes, no audit file, no execution, no live enablement. `recovery_actions.jsonl` NOT created. Builds on A2f/A2j/A2k. Posture verified 2026-06-23.*
