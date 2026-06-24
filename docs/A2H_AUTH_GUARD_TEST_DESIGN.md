# A2h — Auth Guard Planning / Test Design (Planning & Test-Design Only)

**Module:** TracktaOS Module 1 — Solana Momentum Bot
**Sprint:** 4 (Phase 1 — Structure and Recovery)
**Status:** **COMPLETE (test design)** — defines the test strategy that must precede auth implementation. No code, config, route, script, dependency, test file, or audit file created.
**Operating constraint:** `PIPELINE_DRY_RUN` unchanged; mutation routes remain unauthenticated until a future, separately-approved implementation.

**Builds on:** [A2G_DASHBOARD_AUTH_READINESS_REVIEW.md](./A2G_DASHBOARD_AUTH_READINESS_REVIEW.md) (control-surface inventory) · [A2F_AUTH_RECOVERY_AUDIT_PLAN.md](./A2F_AUTH_RECOVERY_AUDIT_PLAN.md) (auth + recovery-audit design) · [A2C_REVIEW.md](./A2C_REVIEW.md) (preview-only, guarded) · [A3_CONFIG_CHANGE_AUDIT_PLAN.md](./A3_CONFIG_CHANGE_AUDIT_PLAN.md)
**Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · [OPERATIONS.md](./OPERATIONS.md) · `dashboard_server.js` · `test_recovery_preview_guards.js` · `run_safety_tests.js`

---

## 1. Executive Summary

A2h designs the **tests-first** strategy for authenticating the three existing dashboard mutation routes. It specifies *what tests must exist and pass* before any auth code is written — static guards, behavioral route tests, fail-closed tests, and audit-safety tests — plus a safe test harness, the expected auth interface, the future test file, suite integration, and acceptance criteria.

It implements nothing. **Authentication is not implemented. Mutation routes remain unauthenticated until future implementation. No recovery execution is authorized.**

Principle: **tests before auth, auth before execution.** The guard tests must be written and red/green-verified against an auth implementation before that implementation is accepted.

---

## 2. Scope

**Covered:** auth guard objective; future test categories (static / behavioral / fail-closed / audit-safety); behavioral, fail-closed, and audit-safety matrices; safe test harness design; proposed auth interface for tests; future test file plan (`test_dashboard_auth_guards.js`); safety-suite integration (8/8 → 9/9 when built); acceptance criteria; blockers.

**Not covered (out of scope, unchanged):** implementing authentication; creating the test file; modifying/removing routes; adding recovery routes/execution; creating `recovery_actions.jsonl`; any code/config/script/dependency change.

> A2h is **documentation-only test design.** The test file is **planned, not created.**

---

## 3. Current Route Risk (from A2g, verified)

`dashboard_server.js` exposes **6 routes**, bound to `127.0.0.1`:

| Route | Method | Class | Auth today | Mutates |
|-------|--------|-------|:----------:|---------|
| `/`, `/winners`, `/3rd-floor-labz-banner.png` | GET | Read-only | n/a | No |
| `/control/start` | POST | Config-control | **None** | `live_config.json` (`automationEnabled`) |
| `/control/stop` | POST | Config-control | **None** | `live_config.json` (`automationEnabled`) |
| `/control/emergency` | POST | Config-control | **None** | `live_config.json` (`automationEnabled` + `emergencyStop`) |

All three POST routes are **A3-audited but unauthenticated**; loopback binding is the only barrier. No recovery routes exist. A2c is preview-only and guarded.

---

## 4. Auth Guard Objective

The future auth guard must **prove**:

- **No unauthenticated mutation routes** exist.
- Missing token **blocks** `POST /control/start`.
- Missing token **blocks** `POST /control/stop`.
- Missing token **blocks** `POST /control/emergency`.
- Incorrect token **blocks** those routes.
- Correct token is **required before route logic runs** (auth precedes `handleControl`/executor call).
- Auth failure **does not mutate `live_config.json`**.
- Auth failure **does not append** a config audit entry (`config_change_audit.jsonl`) — or records only a distinct auth-denial entry, per design (§7).
- Auth failure **does not append** `live_control_events.jsonl`.
- Auth **fails closed** when the token env var is missing (mutation disabled entirely).
- **Read-only GET routes remain accessible** without auth.

---

## 5. Future Test Categories

### A. Static source tests (style of `test_recovery_preview_guards.js`)
Verify by reading `dashboard_server.js` as text:
- Every `app.post` route is wrapped by the auth guard helper/middleware.
- No new POST route exists without auth.
- Known POST routes are **exactly** `/control/start`, `/control/stop`, `/control/emergency`.
- No recovery POST routes exist.
- No route named `recover` / `restart` / `kill` / `spawn` / `reset` is introduced (any verb).
- A2c preview guard still passes (`test_recovery_preview_guards.js` unaffected).

### B. Behavioral route tests
Spin up an **isolated** dashboard instance (temp config, random port) and issue real HTTP requests (see §8 matrix).

### C. Fail-closed tests
Exercise missing/empty/weak/malformed token and query-string token (see §9 matrix).

### D. Audit-safety tests
Confirm denied requests leave no successful config-control audit row, and `recovery_actions.jsonl` is never created (see §10 matrix).

---

## 6. (reserved — see matrices in §8–§10)

---

## 7. Proposed Auth Interface for Future Tests (design, not implemented)

| Element | Proposal |
|---------|----------|
| **Env variable** | `DASHBOARD_CONTROL_TOKEN` (loaded at process start) |
| **Header** | `X-Trackta-Control-Token: <token>` |
| **Failure code** | `403 Forbidden` (preferred) or `401 Unauthorized` |
| **Query-string token** | **Rejected** — never accept token in URL params |
| **Logging** | Token **never** logged (no cleartext in console/audit/events) |
| **Commit** | Token **never** committed (env/`.env` only, gitignored) |
| **HTML** | Token **never** rendered in dashboard HTML |
| **Missing env var** | Fail closed — all mutating routes disabled; GET unaffected |

Auth-denial recording decision (to fix at implementation): denials should be recorded as a **distinct auth-denial event** (not a config-change row), or not at all — but a **denied request must never produce a successful config-control audit entry**.

---

## 8. Behavioral Test Matrix

| # | Request | Token | Expected status | Config mutated? | Audit/events appended? |
|---|---------|-------|-----------------|-----------------|------------------------|
| B1 | `GET /` | none | **200** | No | No |
| B2 | `GET /winners` | none | **200** | No | No |
| B3 | `POST /control/start` | none | **401/403** | **No** | No (or auth-denial only) |
| B4 | `POST /control/stop` | none | **401/403** | **No** | No (or auth-denial only) |
| B5 | `POST /control/emergency` | none | **401/403** | **No** | No (or auth-denial only) |
| B6 | `POST /control/start` | wrong | **401/403** | **No** | No (or auth-denial only) |
| B7 | `POST /control/stop` | wrong | **401/403** | **No** | No (or auth-denial only) |
| B8 | `POST /control/emergency` | wrong | **401/403** | **No** | No (or auth-denial only) |
| B9 | `POST /control/*` | correct | route reachable **only after** explicit future auth implementation | (per route, posture-gated) | per existing A3 |

B9 is a **readiness** assertion: until auth is implemented, there is no "correct token" path; once implemented, a correct token may *reach* the route logic (which still applies posture/readiness gates). A2h does not implement B9's passing path.

---

## 9. Fail-Closed Test Matrix

| # | Condition | Expected |
|---|-----------|----------|
| F1 | `DASHBOARD_CONTROL_TOKEN` **missing** | All mutation routes blocked (disabled); GET works |
| F2 | Empty token in header | Rejected (401/403) |
| F3 | Short/weak token (if a strength policy is chosen) | Rejected |
| F4 | Malformed auth header | Rejected |
| F5 | Token supplied in **query string** | Rejected (query tokens not accepted) |
| F6 | Browser accidental POST (no token / form re-submit) | Rejected; no mutation |

Default is **deny**: anything not explicitly authenticated does not mutate.

---

## 10. Audit-Safety Test Matrix

| # | Scenario | Expected |
|---|----------|----------|
| S1 | Denied mutation attempt | **No successful config-control audit row** in `config_change_audit.jsonl` |
| S2 | Denied mutation attempt | Optional distinct **auth-denial** record only (per §7 design) — never a config-change row |
| S3 | Auth-only test run | **`recovery_actions.jsonl` is never created** |
| S4 | Denied mutation attempt | **No append** to `live_control_events.jsonl` |
| S5 | Any test | Real `live_config.json` untouched (temp fixture only) |

---

## 11. Safe Test Harness Design

Future tests must run **without** mutating real runtime files or adding dependencies:

- **Temp directory fixtures** — copy a sample `live_config.json` into an `os.tmpdir()` workdir; assert against the temp copy, never the repo file.
- **Config-path injection** — if the dashboard/executor can accept a config path via env (e.g. a test-only `CONFIG_FILE` override) or `cwd`, use it; otherwise run the isolated server with `cwd` set to the temp dir so relative paths resolve there.
- **Isolated test server on a random port** — start `dashboard_server.js` as a child for behavioral tests on an ephemeral port (e.g. `0`/random), or factor the Express `app` for in-process `supertest`-style calls **without** adding a dependency (use Node built-in `http`).
- **Node built-in HTTP client** — use `http.request`/global `fetch` (Node 18+) for behavioral calls; **no new dependency**.
- **Avoid real `live_config.json`** — never point tests at the repo's live config.
- **Preserve A1b atomic writes** — tests observe behavior; they do not bypass `config_store.writeConfigAtomic`.
- **Preserve A3 audit behavior** — tests assert audit outcomes; they do not stub away the audit.
- **No runtime artifact writes** outside the temp fixture; clean up the temp dir on exit.

Static tests (category A) need **no** server — pure file-read + regex, mirroring `test_recovery_preview_guards.js`.

---

## 12. Future Test File Plan — `test_dashboard_auth_guards.js` (NOT created)

Planned sections:

1. **Route inventory** — assert the exact GET/POST route set.
2. **Static guard coverage** — every `app.post` wrapped by the auth helper; no unwrapped mutation; no forbidden route names.
3. **Missing-token denial** — B3–B5, F1.
4. **Wrong-token denial** — B6–B8, F2–F4.
5. **Correct-token passthrough readiness** — B9 (readiness only until auth exists).
6. **No mutation on denial** — temp-config unchanged; S1/S4/S5.
7. **Existing A2c preview remains non-executing** — re-assert preview guard invariants (or confirm `test_recovery_preview_guards.js` still green).
8. **Auth token secrecy** — token never in HTML, logs, audit, or query params.

The file is **designed here, created later** (only when auth implementation is approved).

---

## 13. Safety Suite Integration Plan

- Today: **8/8** (`run_safety_tests.js`).
- When `test_dashboard_auth_guards.js` is implemented **and** passing against an auth implementation, register it in the `TESTS` array → **9/9**.
- The count moves to 9/9 **only after the actual test file exists and passes** — not on the basis of this design doc.

---

## 14. Acceptance Criteria (for future A2h implementation)

Before any auth code is considered complete:

- All auth guard tests pass.
- A2c preview guard (`test_recovery_preview_guards.js`) still passes.
- Existing **8** tests still pass.
- Unauthenticated POST routes are **denied**.
- **No mutation** occurs on denied requests.
- **No token leakage** (HTML/logs/audit/query).
- **No recovery execution** added.
- Posture unchanged (`PIPELINE_DRY_RUN` / `liveArmed: false`).
- **No live enablement.**

---

## 15. Blockers

- **Authentication not implemented** — design + test plan only.
- **Test file not created** — `test_dashboard_auth_guards.js` is planned, not written.
- **Recovery audit not implemented** — `recovery_actions.jsonl` design-only, uncreated.
- **A2d accelerated** — long-duration evidence missing.
- **No approval** for auth/route changes or recovery execution.
- **Live trading prohibited.**

---

## 16. Verdict

### A2h Auth Guard Test Design: **COMPLETE**

Stated plainly:

> **Authentication is not implemented. Mutation routes remain unauthenticated until future implementation. No recovery execution is authorized.**

- **Safety status:** 8/8 (unchanged)
- **Live status:** DISARMED
- **Posture:** PIPELINE_DRY_RUN / PIPELINE_OBSERVING

---

## 17. Recommendation

**Proceed only to (next, separately approved) tests-first implementation:**

- Write `test_dashboard_auth_guards.js` per §12 (red against current unauthenticated routes).
- Then design/implement the auth helper so the tests go green (auth retrofit of the three existing routes).
- Register the test → 9/9.

**Do not proceed to:**

- Implementing authentication in this task.
- Creating the test file in this task.
- Modifying/removing existing routes.
- Adding recovery routes or execution.
- Creating `recovery_actions.jsonl`.
- Live promotion.

---

## 18. Footer

> **Tests before auth.**
> **Authentication before execution.**
> **Audit before recovery.**
> **Preview before action.**
> **Recovery must never outrun ownership.**
> **Humans authorize. Ori advises. Gates enforce.**

A2h writes the exam the auth code must pass — before the code exists.

---

*A2h Auth Guard Test Design (planning & test-design only) · TracktaOS Module 1 · Sprint 4 · Defines static/behavioral/fail-closed/audit-safety tests, safe harness, `DASHBOARD_CONTROL_TOKEN` interface, `test_dashboard_auth_guards.js` plan (NOT created), 8/8 → 9/9 integration. No code/config/route/script/test/audit file created. `recovery_actions.jsonl` NOT created. Posture verified 2026-06-23.*
