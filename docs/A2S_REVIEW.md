# A2s Review — Low-risk Human-confirmed Recovery Implementation (Complete)

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Structure and Recovery)  
**Status:** **COMPLETE** — limited low-risk human-confirmed recovery routes (simulated execution only)  
**Review date:** 2026-06-23  
**Reviewer:** Taylor / Ori  

**Design:** [A2O_HUMAN_CONFIRMED_RECOVERY_DESIGN_PLAN.md](./A2O_HUMAN_CONFIRMED_RECOVERY_DESIGN_PLAN.md) · [A2N_HUMAN_CONFIRMED_RECOVERY_EXECUTION_REVIEW.md](./A2N_HUMAN_CONFIRMED_RECOVERY_EXECUTION_REVIEW.md) · [A2F_AUTH_RECOVERY_AUDIT_PLAN.md](./A2F_AUTH_RECOVERY_AUDIT_PLAN.md) · **Prior milestones:** [A2R_REVIEW.md](./A2R_REVIEW.md) · [A2M_REVIEW.md](./A2M_REVIEW.md) · [A2C_REVIEW.md](./A2C_REVIEW.md)  
**Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · [OPERATIONS.md](./OPERATIONS.md) · `recovery_allowlist.js` · `recovery_service.js` · `recovery_routes.js` · `dashboard_server.js` · `recovery_audit.js` · `test_low_risk_recovery_routes.js` · `run_safety_tests.js`

---

## 1. Executive Summary

A2s implemented **limited low-risk human-confirmed recovery routes** using the **conservative alternative** approved after A2r: authenticated plan/confirm routes, full precheck/audit/confirmation flow, and **simulated execution only** — no real process spawn, kill, or shell.

Routes now exist for:

- `POST /recovery/plan/:actionId`
- `POST /recovery/confirm/:actionId`

Both require **dashboard control auth** (`DASHBOARD_CONTROL_TOKEN` + `X-Trackta-Control-Token` header).

A2s added:

- Fixed server-side action allowlist (`recovery_allowlist.js`)
- Plan/confirm route registration (`recovery_routes.js`, wired from `dashboard_server.js`)
- Posture checks (`PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false`)
- Typed confirmation checks (exact server-defined phrase on confirm)
- Client command-field rejection
- Recovery audit integration via `recovery_audit.js` (`recovery_service.js`)
- **Simulated execution result only** (no real process start)
- Isolated HTTP behavioral tests (`test_low_risk_recovery_routes.js`)

Plainly:

- **A2s does not perform real process restart.**
- **A2s does not spawn processes.**
- **A2s does not kill processes.**
- **A2s does not restart executor.**
- **A2s does not clear `emergencyStop`.**
- **A2s does not enable live trading.**
- **A2s does not add dashboard execution buttons.**
- **A2s does not approve real recovery execution.**

Posture is unchanged: **`PIPELINE_DRY_RUN` / `dryRunMode: true` / `liveArmed: false` / `PIPELINE_OBSERVING`**.

> **Routes + audit exist. Real process restart does not.**

---

## 2. Scope

### Covered

| Area | Detail |
|------|--------|
| **`recovery_allowlist.js`** | Fixed server-side allowlist for four low-risk actions |
| **`recovery_service.js`** | Plan/confirm flow, posture/confirmation prechecks, audit append, simulated execution |
| **`recovery_routes.js`** | Route registration with auth wrapper |
| **`dashboard_server.js`** | Route registration, JSON body parser, posture/target-state helpers, `DATA_ROOT` for test heartbeats |
| **`test_low_risk_recovery_routes.js`** | Isolated HTTP behavioral tests (temp fixtures only) |
| **Updated safety guard tests** | `test_recovery_route_guards.js`, `test_recovery_preview_guards.js`, `test_dashboard_auth_guards.js`, and related inventory updates |
| **`run_safety_tests.js`** | Suite **14/15 → 15/15** |
| **Docs** | `ACTIVE_MANIFEST.md`, `KNOWN_ISSUES.md`, `OPERATIONS.md` updated for A2s |

### Not covered (intentionally out of scope)

- Real process start
- Process killing
- PID management
- Shell command execution
- Executor recovery
- Reset after panic
- `emergencyStop` clearing
- Live promotion
- Autonomous recovery
- Browser dashboard recovery buttons
- Real operator recovery commands (beyond authenticated API contract)

---

## 3. Implementation Summary

### Fixed allowlisted actions only

| Allowed `actionId` | Label | Confirmation phrase (exact) |
|--------------------|-------|-------------------------------|
| `restart-scanner` | Restart Scanner | `RESTART SCANNER IN DRY RUN` |
| `restart-paper-monitor` | Restart Paper Monitor | `RESTART PAPER MONITOR IN DRY RUN` |
| `restart-wallet-monitor` | Restart Wallet Monitor | `RESTART WALLET MONITOR IN DRY RUN` |
| `restart-dashboard` | Restart Dashboard | `RESTART DASHBOARD IN DRY RUN` |

Each entry includes fixed `commandPreview`, `actionClass: low-risk-recovery`, `riskLevel: low`, eligible states (STALE, MISSING, NO DATA, FAILED), and 5-minute cooldown.

### Forbidden / high-risk actions remain blocked

- `restart-executor`
- `reset-after-panic`
- `clear-emergency-stop`
- `enable-live-trading`
- `arbitrary-command`
- `run-arbitrary-command`
- Unknown action IDs

No command string may come from the client.

### Safety gates

| Gate | Enforcement |
|------|-------------|
| **Auth** | `requireDashboardControlAuth` on both routes; query-string token rejected |
| **Request fields** | Allowed: plan — `reason`, `actor`; confirm — `confirmation`, `reason`, `actor`. Rejected: `command`, `cmd`, `shell`, `args`, `actionCommand`, `privateKey`, `signer`, `secret`, `token` |
| **Posture** | `executionMode: PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false` |
| **Confirmation** | Exact typed phrase required on confirm |
| **Target eligibility** | Target process must not be HEALTHY; must be in allowlisted eligible states |
| **Cooldown** | 5 minutes per target (ledger scan) |
| **Audit** | Append-only rows via `recovery_audit.js` before/at/after simulated action |
| **Execution** | **Simulated only** — `performSimulatedRecoveryAction()` records result; no spawn/kill/shell |

---

## 4. Route Behavior

### `POST /recovery/plan/:actionId`

1. Authenticate (`requireDashboardControlAuth`)
2. Reject forbidden body/query fields
3. Validate `actionId` against server allowlist
4. Validate posture and target eligibility
5. Write **planned** or **blocked** audit row
6. **Does not execute** any recovery action
7. Return safe JSON: action summary, `commandPreview`, confirmation requirements, precheck status, blocked reason if applicable

### `POST /recovery/confirm/:actionId`

1. Authenticate
2. Reject forbidden body/query fields
3. Validate `actionId`
4. Validate exact typed confirmation phrase
5. Validate posture and target eligibility
6. Write **planned/pre-action** audit row
7. Record **simulated** action result (no process spawn/kill)
8. Write **executed** and **postcheck** audit rows
9. Return safe JSON with `executionMode: "simulated"` and note that no real process restart occurred
10. On any failed check: write **blocked/denied** row when safe; return 400 with generic message; no execution row

---

## 5. Audit Behavior

Append-only rows via `recovery_audit.js`. Repo-root `recovery_actions.jsonl` is not auto-created; ledger appears when an approved caller appends (tests use `TRACKTA_RUNTIME_ROOT` temp dirs only).

### Plan route rows

- **`planned`** — prechecks pass; `commandExecuted: null`
- **`blocked`** / **`denied`** — precheck/auth failure; `commandExecuted: null`

### Confirm route rows (success path)

1. **`planned`** — prechecks pass before simulated action
2. **`executed`** — simulated action recorded; `commandExecuted` = fixed allowlist preview string (server-owned)
3. **`executed` (postcheck row)** — `postcheckStatus: pass`; simulated execution verified

### Confirm route rows (failure path)

- Single **`blocked`** or **`denied`** row; no execution row

### Safe metadata included

`actionId`, `actor`, `authMethod`, `actionClass`, `actionName`, `targetProcess`, `requestedState`, `reason`, `commandPreview`, `commandExecuted` (when executed), `precheckStatus`, `postcheckStatus`, `result`, `riskLevel`, posture fields (`executionModeAtRequest`, `dryRunModeAtRequest`, `liveArmedAtRequest`, `emergencyStopAtRequest`), `requiresReview`, confirmation metadata (`matched:<actionId>` / `not-recorded` only).

### Must not include

- Raw dashboard token
- Raw Authorization header
- Raw confirmation phrase
- Private key
- Signer secret

> **Audit is evidence, not permission.**

---

## 6. Test Coverage

`test_low_risk_recovery_routes.js` (isolated HTTP on random localhost port; `TRACKTA_RUNTIME_ROOT` temp fixtures):

| ID | Coverage |
|----|----------|
| A | GET dashboard remains read-only/public |
| B | Existing control routes still require auth |
| C | `/recovery/plan/:actionId` requires auth |
| D | `/recovery/confirm/:actionId` requires auth |
| E | Query token rejected |
| F | Unknown actionId blocked |
| G | Forbidden actions blocked (`restart-executor`, `reset-after-panic`, `clear-emergency-stop`, `enable-live-trading`) |
| H | Client command fields rejected |
| I | Unsafe posture blocked (`liveArmed`, `dryRunMode: false`, `executionMode: LIVE`) |
| J | Missing confirmation blocks confirm |
| K | Wrong confirmation blocks confirm |
| L | Valid confirmation returns simulated safe result |
| M | Audit rows under temp runtime root only |
| N | Repo-root `recovery_actions.jsonl` absent |
| O | Real `live_config.json` unchanged |
| P | No token or raw confirmation phrase in audit |
| Q | No arbitrary client command in response/audit |
| R | A2p route static guards still pass |

Updated static guards (`test_recovery_route_guards.js`, `test_recovery_preview_guards.js`, `test_dashboard_auth_guards.js`) enforce allowlisted recovery routes only.

---

## 7. Verification Results

Recorded 2026-06-23:

| Check | Result |
|-------|--------|
| `node --check dashboard_server.js` | **PASS** |
| `node --check recovery_allowlist.js` | **PASS** |
| `node --check recovery_service.js` | **PASS** |
| `node --check recovery_routes.js` | **PASS** |
| `node --check test_low_risk_recovery_routes.js` | **PASS** |
| `node test_low_risk_recovery_routes.js` | **PASS** |
| `node test_low_risk_recovery_behavior.js` | **PASS** |
| `node test_recovery_route_guards.js` | **PASS** |
| `node test_fake_recovery_harness.js` | **PASS** |
| `node test_recovery_audit.js` | **PASS** |
| `node test_dashboard_auth_behavior.js` | **PASS** |
| `node test_dashboard_auth_guards.js` | **PASS** |
| `node test_recovery_preview_guards.js` | **PASS** |
| `node run_safety_tests.js` | **15/15 PASS** |
| `node live_executor.js --status` | `PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false`, `operationalPosture: PIPELINE_OBSERVING` |
| `Test-Path recovery_actions.jsonl` (repo root) | **False** (absent) |

---

## 8. Negative Verification

Confirmed absent after A2s:

| Category | Status |
|----------|--------|
| Generic execute route | Absent |
| Arbitrary command route | Absent |
| Client command input acceptance | Rejected |
| Live promotion route | Absent |
| Executor recovery route | Absent |
| Reset-after-panic route | Absent |
| Clear `emergencyStop` route | Absent |
| Process killing / PID killing | Absent |
| Autonomous recovery loop | Absent |
| Signer / private key logic | Absent |
| Token leakage in audit/responses | Absent (redaction + tests) |
| Raw confirmation phrase leakage | Absent (metadata-only storage) |
| Real `live_config.json` mutation in tests | Absent |
| Repo-root `recovery_actions.jsonl` | Absent (unless operator runtime confirm appends later) |
| Dashboard recovery buttons | Absent (A2c preview remains non-executing) |

---

## 9. Dashboard Restart Note

**`dashboard_server.js` changed in A2s** — a **dashboard restart is required** to load recovery routes on any running dashboard process.

Operator-safe reminders:

- Use the normal dashboard restart procedure (see [OPERATIONS.md](./OPERATIONS.md)).
- **Do not use recovery routes from browser forms** — HTML forms cannot set `X-Trackta-Control-Token`.
- Recovery routes require header auth via an API-capable client.
- Allowed actions only; live trading remains prohibited.

---

## 10. Safety Boundary

A2s is **simulated low-risk recovery route implementation**.

A2s **does not authorize**:

- Real process restart
- Executor restart
- Process killing
- Reset-after-panic
- `emergencyStop` clearing
- Live trading
- Arbitrary command execution
- Autonomous recovery
- Replacement of simulation with real process start (without separate approval, tests, and review)

Existing guards remain: A2c preview (non-executing), A2j/A2k auth, A2m audit writer, A2p route guards, A2q fake harness, A2r behavioral tests.

---

## 11. Remaining Risks / Blockers

| Item | Status |
|------|--------|
| **Real process start deferred** | By design — simulated execution only |
| **A2d accelerated** — not full 72-hour soak | Risk accepted |
| **Duplicate-process ambiguity** | Operator-managed; no PID cleanup |
| **No PID cleanup support** | Open |
| **Executor excluded** | By design |
| **R3/R4 state atomicity** | Open |
| **No browser recovery execution UI** | By design |
| **Manual `recovery_actions.jsonl` edits** | Discouraged — audit integrity risk |
| **Real recovery start** | Requires separate approval, new tests, and review |

---

## 12. Verdict

**A2s Low-risk Human-confirmed Recovery Implementation: COMPLETE**

| Gate | Status |
|------|--------|
| **Implementation mode** | **SIMULATED EXECUTION ONLY** |
| **Safety suite** | **15/15 PASS** |
| **Live status** | **DISARMED** (`liveArmed: false`) |
| **Posture** | **`PIPELINE_DRY_RUN` / `PIPELINE_OBSERVING`** |
| **Real process restart** | **NOT IMPLEMENTED / NOT APPROVED** |
| **Recovery execution (real)** | **NOT APPROVED** |
| **Repo-root `recovery_actions.jsonl`** | **Absent** at review time (expected) |

---

## 13. Recommendation

Recommend next step:

**A2t — Post-action Recovery Review**

Purpose: Review A2s evidence and decide whether to **stop at A2s** (routes + audit + simulation), or plan a **future separate phase** for fixed-allowlist real process start.

Do **not** proceed directly to:

- Real process start
- Executor recovery
- Live trading
- Autonomous recovery

Any future real start requires explicit human approval, expanded tests, and a dedicated review — not an automatic follow-on from A2s.

---

## 14. Footer

> **Limited approval does not mean live approval.**  
> **Simulated recovery does not mean real process restart.**  
> **Low-risk recovery does not include executor recovery.**  
> **Human-confirmed does not mean autonomous.**  
> **Audit before recovery.**  
> **Authentication before execution.**  
> **Preview before action.**  
> **Gates enforce.**

A2s delivers **authenticated recovery routes with simulated execution** — not production process control.

---

*A2s Low-risk Human-confirmed Recovery Implementation review · TracktaOS Module 1 · Sprint 4 · simulated execution only · 15/15 safety suite · repo-root `recovery_actions.jsonl` absent at review · dashboard restart required · posture verified 2026-06-23.*
