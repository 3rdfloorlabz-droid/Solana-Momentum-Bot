# A2c — Human-Confirmed Recovery Architecture (Planning Only)

**Module:** TracktaOS Module 1 — Solana Momentum Bot
**Sprint:** 4 of 4 (Phase 1 — Structure and Recovery)
**Status:** **Planning only** — no code, no config, no scripts, no script changes, no UI actions. This document designs an architecture; it builds nothing.
**Operating constraint:** `PIPELINE_DRY_RUN` unchanged; this milestone changes no runtime behavior

**Parent:** [A2_SUPERVISOR_PLAN.md](./A2_SUPERVISOR_PLAN.md) (L0 observe → L1 recommend → L2 human-confirmed → L3 autonomous) · [A1_REVIEW.md](./A1_REVIEW.md) (ownership complete — recovery may now be designed)
**Consumes:** [M5_HEARTBEAT_PLAN.md](./M5_HEARTBEAT_PLAN.md) (liveness) · A2a Supervisor Recommendations + A2b Recovery Advisor (shipped, read-only) · [OPERATIONS.md](./OPERATIONS.md) · [MODE_TRANSITION.md](./MODE_TRANSITION.md)
**Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · `start_fomo.ps1` · `stop_fomo.ps1` · `panic.ps1` · `reset_after_panic.ps1` · `dashboard_server.js`

---

## 0. Scope separation (read first)

> **A2c designs *how a human could safely confirm* a recovery action in the future. It does not build the action, the button, the route, or the executor of recovery.**

| ID | Owns | This document? | May act? |
|----|------|----------------|----------|
| **A2a** | **Policy model** — per-process health → recommendation (read-only panel) | Shipped | No |
| **A2b** | **Recovery advice** — per-state manual runbook steps (read-only) | Shipped | No |
| **A2c** (this doc) | **Human-confirmed recovery *design*** — eligibility, guardrails, confirmation, audit schema, future-UI requirements | **Yes — design only** | **No — implements nothing** |
| **A2d** | **Soak validation** — observe the design's assumptions under real operation before any execution capability | No (later) | No |
| **A2e** | **Autonomous recovery** — narrow, budgeted auto-restart of idempotent single-writer processes (far future) | No (far later) | Only after A1 R3–R6 + A2d + explicit approval |

A2c is the bridge between *advice* (A2b) and *any future execution*. It answers: **which** recovery actions could ever be offered through a controlled interface, under **what** confirmation and pre-checks, with **what** audit and rollback — **without** offering any of them yet. The first implementable step after A2c is intentionally minimal (command-preview only; see §11), and even that is a separate, separately-approved milestone.

> **Recovery must never outrun ownership.** A1 made state single-writer/atomic for `paper_trades.json`/`paper_positions.json` (A1a) and `live_config.json` (A1b). Races **R3–R6** (`observation_dedup.json`, `live_positions.json`, snapshot read-during-write, multi-appender JSONL) remain open. Any executor-touching recovery stays high-risk until those land.

---

## 1. Mission

Define the human-confirmed recovery architecture for TracktaOS: determine **whether and how** operators may, in a *future* controlled interface, safely trigger **existing** recovery procedures (the manual commands A2b already documents) — with eligibility tiers, guardrails, an audit schema, and UI requirements — **without implementing any recovery action, button, route, or executor now.**

---

## 2. Constraints (planning-only footprint)

This document produces **only** `docs/A2C_HUMAN_CONFIRMED_RECOVERY_PLAN.md`. A2c must **not**:

- change code, strategy, the executor, or any process file;
- change `PIPELINE_DRY_RUN`, `dryRunMode`, arming, `liveArmed`, or any gate;
- edit `live_config.json`, `.env`, or any config;
- add or change any script (`*.ps1`, `*.js`); add a dependency or database;
- add a dashboard button, a POST route, an action endpoint, or any state mutator;
- spawn, kill, or PID-check any process; perform automatic repair or autonomous recovery;
- create `recovery_actions.jsonl` (schema is **defined**, file is **not created**).

All verification is read-only (`--status`, `run_safety_tests.js`, dashboard view). See §15.

---

## 3. Inspection findings (current truth)

### 3.1 Existing recovery / control surfaces

| Surface | Mechanism | What it changes | Atomic? | Audited? | Posture refusal? |
|---------|-----------|-----------------|---------|----------|------------------|
| `start_fomo.ps1` | Launches 5 processes in PowerShell windows | nothing in config | n/a | no | exits if `live_config.json` missing |
| `stop_fomo.ps1` | `Stop-Process` of matching FOMO node procs (by command line) | nothing in config | n/a | no | — |
| `panic.ps1` | sets `emergencyStop=true`, `automationEnabled=false` | `live_config.json` | **yes** (temp + `Move-Item`) | **yes** (`panic_events.jsonl` + `config_change_audit.jsonl`) | — |
| `reset_after_panic.ps1` | sets `emergencyStop=false`, `automationEnabled=true` after typed `YES` | `live_config.json` | **yes** | **yes** (A3) | **REFUSES if `executionMode=LIVE` or `dryRunMode=false`** |
| `emergency_stop.js` / `reset_live_safety.js` | kill switch / clear stop | `live_config.json` (atomic via A1b) | **yes** | **yes** (A3) | reset forces `dryRunMode:true`, automation off |
| **Dashboard POST routes (existing!)** `/control/start`, `/control/stop`, `/control/emergency` | call `liveExecutor.startAutomation/stopAutomation/emergencyStopControl` in-process | `live_config.json` (`automationEnabled`/`emergencyStop`) | yes (A1b) | yes (A3) | executor gates apply |

**Critical finding:** the dashboard **already exposes three POST control routes** (`/control/start`, `/control/stop`, `/control/emergency`) that mutate `live_config.json` via the executor. These are **config-control** actions (toggle automation / emergency stop), **not process recovery** (restart). They are **pre-existing** and are a **known security gap** ([KNOWN_ISSUES.md](./KNOWN_ISSUES.md): "Unauthenticated dashboard mutates live config"). A2c does **not** add to, expand, or modify them — but it must place them inside the same guardrail thinking, because any future recovery UI shares the same unauthenticated-localhost risk.

### 3.2 Process recovery has no interface today

There is **no** route, button, or script that "restarts the scanner/monitor/wallet/dashboard." Recovery today = a human reads A2b's advice and runs a command in a terminal. A2c designs whether that could ever become a controlled, confirmed UI action.

### 3.3 Ownership constraints (from A1)

| Process | Owns | Restart idempotent? | Recovery risk |
|---------|------|---------------------|---------------|
| Scanner | `paper_trades.json` (append-only, A1a), `scanner_health.json`, `pipeline_candidates.jsonl` | **Yes** — re-appends, never rewrites | **Low** |
| Wallet Monitor | `wallet_status.json`, `rpc_health.json` (snapshots) | **Yes** — snapshots regenerate | **Low** |
| Paper Monitor | `paper_positions.json` (single-writer, atomic, A1a) | **Yes** — re-seeds idempotently from ledger | **Low** |
| Dashboard | nothing (pure reader) | **Yes** — stateless | **Low** |
| **Executor** | `live_config.json` (atomic A1b), **`live_positions.json` (R4, non-atomic)**, **`observation_dedup.json` (R3, non-atomic)**, ledgers | **Partial** — restart timing interacts with non-atomic position/dedup state | **High** |

This is the spine of A2c's classification: **low-risk = single-writer + idempotent restart; high-risk = executor (R3/R4 open) or anything that clears a safety latch.**

### 3.4 A3 config audit (existing, reused conceptually)

A3 already records config changes to `config_change_audit.jsonl` with: `timestamp, actor, source, field, oldValue, newValue, reason, riskLevel, requiresReview, modeAtChange, liveArmedAtChange, changeId`. A2c's **action** audit (`recovery_actions.jsonl`, §9) is a **separate, parallel** ledger for *process recovery actions* — it does not replace or modify A3 (which stays for *config* changes).

---

## 4. Determinations

### 4.1 Which recovery actions are eligible for future human-confirmed execution

Process restarts of **single-writer, idempotent-restart** processes whose recovery moves no capital and cannot corrupt authoritative trade state:

- Restart **Scanner**, Restart **Wallet Monitor**, Restart **Paper Monitor**, Restart **Dashboard**.

These map 1:1 to A2b's "safe to restart" steps and to `start_fomo.ps1`'s per-process commands.

### 4.2 Which actions must remain manual-only

Anything that changes the **safety contract** or **trust material** — never offered through any UI, ever:

- Editing `live_config.json` (any field, by hand).
- Changing `executionMode`, changing `dryRunMode`.
- Adding/altering `SOLANA_SIGNER_SECRET` or any signer material.
- Setting live-submission env flags (`FOMO_ENABLE_LIVE_SUBMISSION`, etc.).

### 4.3 Which actions are high-risk (human-confirmed, but stricter)

Permitted in a future UI **only** behind the strongest guardrails (and only after A2d soak + dashboard auth):

- Restart **Executor** (owns R3/R4 non-atomic state).
- **Reset after panic** (`reset_after_panic.ps1`) — clears a safety latch.
- **Clear `emergencyStop`** — re-enables automation.

### 4.4 Which actions are forbidden (never, in any phase)

- Autonomous restart loops; automatic LIVE enablement; automatic emergency reset; process killing without explicit per-incident human confirmation; automatic repair of state files; trading-mode promotion.

### 4.5 Confirmation requirements (summary; full in §8)

Two-step confirmation; a **typed confirmation phrase** for high-risk actions (mirroring `reset_after_panic.ps1`'s typed `YES`); explicit command preview; explicit "this will not trade live" wording.

### 4.6 Pre-checks that must pass before an action is offered (summary; full in §8)

Posture safe (`PIPELINE_DRY_RUN`, `liveArmed:false`); target process actually unhealthy (per M5/A2a); `live_config.json` parses; no cooldown active; not blocked by `emergencyStop` semantics; (high-risk) executor not mid-cycle.

### 4.7 Audit trail required

Every offered/confirmed/(future-)executed recovery action appends one record to `recovery_actions.jsonl` (§9), capturing posture at request time, the planned vs executed command, pre/post-check status, and the confirmation phrase. Append-only; secrets never logged.

### 4.8 Rollback / post-check required

Each action has a defined **post-check** (verify the process returns HEALTHY / posture unchanged) and a **rollback/escalation** path (if recovery fails or posture drifts → stop, `panic.ps1`, human investigation). Recovery never "tries harder" automatically.

### 4.9 How A2c differs from A2d and A2e

- **A2c (this doc):** *design* of eligibility, guardrails, audit, UI requirements. No execution.
- **A2d (soak):** *validate* the design's assumptions (e.g., idempotent restart truly idempotent, pre-checks correct, posture stable) under real 24h+ operation, still with **no execution capability** — observation that the model holds.
- **A2e (autonomous, far future):** narrow, budgeted auto-restart of the §4.1 low-risk set **only**, gated on A1 R3–R6 resolved + A2d evidence + explicit approval. Executor and all §4.2/§4.3/§4.4 actions remain out.

---

## 5. Recovery action classification

### 5.1 ALLOWED FOR FUTURE HUMAN-CONFIRMED UI (low-risk, idempotent, single-writer)

| Action | Existing command (preview text) | Why eligible | Confirmation |
|--------|--------------------------------|--------------|--------------|
| Restart Scanner | `node scanner_gmgn_trending.js --watch` | Append-only ledger (A1a); idempotent | Two-step |
| Restart Wallet Monitor | `node wallet_monitor.js` | Snapshot writer; rebuildable | Two-step |
| Restart Paper Monitor | `node monitor.js` | Single-writer store; idempotent re-seed (A1a) | Two-step |
| Restart Dashboard | `node dashboard_server.js` | Pure reader; stateless | Two-step |

### 5.2 HUMAN-CONFIRMED BUT HIGH-RISK (stricter guardrails; later, post-A2d + auth)

| Action | Existing command | Why high-risk | Extra guardrail |
|--------|------------------|---------------|-----------------|
| Restart Executor | `node live_executor.js --loop` (after `--status`) | Owns R3/R4 non-atomic state; cycle timing | Typed phrase + posture re-check + "not mid-cycle"; preceded by `--status` |
| Reset after panic | `.\reset_after_panic.ps1` | Clears `emergencyStop`; re-enables automation | Typed phrase; refuse if `executionMode=LIVE`/`dryRunMode=false` (script already refuses) |
| Clear emergencyStop | `node reset_live_safety.js` (or reset script) | Re-enables automation | Typed phrase; posture re-check; keeps `dryRunMode:true` |

### 5.3 MANUAL-ONLY (never in any UI)

| Action | Why |
|--------|-----|
| Edit `live_config.json` (any field) | Safety contract; A3-audited, human-only |
| Change `executionMode` | Mode transition is a human-gated decision ([MODE_TRANSITION.md](./MODE_TRANSITION.md)) |
| Change `dryRunMode` | Disarms a core gate |
| Add signer secret (`SOLANA_SIGNER_SECRET`) | Trust material; never via UI |
| Enable live-submission env flags (`FOMO_ENABLE_LIVE_SUBMISSION`, …) | Direct path toward live; human-only |

### 5.4 FORBIDDEN (never, in any phase or implementation)

- Autonomous restart loops.
- Automatic LIVE enablement.
- Automatic emergency reset.
- Process killing without explicit human confirmation.
- Automatic repair of state files.
- Trading-mode promotion.

---

## 6. Guardrails (required for any future human-confirmed action)

| Guardrail | Requirement |
|-----------|-------------|
| **Confirmation phrase** | Two-step for all; high-risk requires a **typed exact phrase** (e.g., type the process name, or `RESTART EXECUTOR`) — mirrors `reset_after_panic.ps1`'s typed `YES`. No single-click execution. |
| **Pre-action posture check** | Read `--status`-equivalent before offering: must be `PIPELINE_DRY_RUN`. |
| **`liveArmed` check** | Must be `false`. If `true`, **no recovery action is offered**; show "blocked because unsafe". |
| **`executionMode` check** | Must equal `PIPELINE_DRY_RUN`. Any LIVE → block all actions, surface manual-only guidance. |
| **`emergencyStop` check** | If `true`, only the (high-risk) reset path may be *offered* (typed phrase); restarts of other processes are still allowed but labeled; never auto-clear the stop. |
| **Config-integrity pre-check** | `live_config.json` must parse (A1b atomic guarantees this); if not, block and route to manual repair. |
| **Target-state pre-check** | The target process must be genuinely unhealthy per M5/A2a (no "restart a HEALTHY process" offers). |
| **Config audit requirement** | Any action that changes config (reset / clear stop) continues to emit A3 `config_change_audit.jsonl` (unchanged). |
| **Action audit requirement** | Every offered/confirmed/(future-)executed action appends to `recovery_actions.jsonl` (§9). |
| **Post-action verification** | Defined per action (process returns HEALTHY; posture still `PIPELINE_DRY_RUN`/`liveArmed:false`). |
| **Cooldown** | Minimum interval between recovery actions on the same target (e.g., ≥ 60s) to prevent rapid repeated triggers; enforced before offering. |
| **No action if posture unsafe** | If any posture check fails, **offer nothing** and display the block reason. |
| **Auth precondition** | Execution-capable UI is gated on dashboard authentication (existing localhost-only assumption is insufficient) — until then, **command-preview only** (§11). |

---

## 7. Pre-checks (gate order, evaluated before an action is offered)

```
1. Dashboard auth present?            → if no: command-preview only (no execute)
2. live_config.json parses?          → if no: BLOCK, route to manual repair
3. executionMode == PIPELINE_DRY_RUN? → if no: BLOCK (manual-only territory)
4. dryRunMode == true?               → if no: BLOCK
5. liveArmed == false?               → if no: BLOCK ("unsafe")
6. target process actually unhealthy? → if no: do not offer
7. cooldown elapsed for target?      → if no: do not offer
8. (high-risk) executor not mid-cycle / typed phrase ready? → else hold
```

Any failed gate ⇒ the action is **not offered**; the UI shows the specific block reason ("blocked because unsafe: liveArmed is true"). Pre-checks are **read-only**.

---

## 8. Confirmation requirements (detail)

1. **Step 1 — intent:** operator selects an *eligible* action; UI shows a **command preview** (exact text), the **diagnosis** (from A2b), and a **"this will not trade live"** statement.
2. **Step 2 — confirm:** operator confirms; **low-risk** = explicit second click on a confirm control; **high-risk** = **typed exact phrase**.
3. The UI must restate the posture (`PIPELINE_DRY_RUN`, `liveArmed:false`) at confirm time and re-run pre-checks; if posture changed between step 1 and step 2, **abort** and show the new block reason.
4. No action proceeds without a fresh passing pre-check at confirm time.

---

## 9. Action audit schema — `recovery_actions.jsonl` (defined; **not created**)

Append-only JSONL, one record per offered/confirmed/(future-)executed recovery action. RUNTIME LOCAL (would be gitignored when created). **Do not create this file in A2c.** Secrets, `.env` values, and signer material are **never** logged.

```jsonc
{
  "timestamp": "2026-06-22T...Z",        // ISO UTC, when the action was requested
  "actionId": "uuid-v4",                  // unique id for this action attempt
  "actor": "operator",                    // human identity/source (no secrets)
  "action": "RESTART_PROCESS",            // RESTART_PROCESS | RESET_AFTER_PANIC | CLEAR_EMERGENCY_STOP | ...
  "targetProcess": "scanner",             // scanner | wallet_monitor | paper_monitor | dashboard | executor | n/a
  "requestedState": "HEALTHY",            // intended outcome
  "reason": "Scanner STALE > threshold",  // human-readable justification
  "precheckStatus": "PASS",               // PASS | BLOCKED:<gate> (see §7)
  "commandPlanned": "node scanner_gmgn_trending.js --watch",  // exact preview text
  "commandExecuted": null,                // null in preview-only phase; exact string if a future phase executes
  "result": "PREVIEW_ONLY",               // PREVIEW_ONLY | SUCCESS | FAILED | ABORTED
  "postcheckStatus": null,                // PASS | FAIL | null (n/a)
  "liveArmedAtRequest": false,            // posture snapshot at request
  "executionModeAtRequest": "PIPELINE_DRY_RUN",
  "emergencyStopAtRequest": false,
  "confirmationPhrase": "<redacted-or-omitted>",  // store presence/typed-OK, NOT secrets
  "schemaVersion": 1
}
```

Notes:
- In the **first implementable phase** (command-preview only), `commandExecuted` is always `null` and `result` is `PREVIEW_ONLY` — the ledger records *what was offered and confirmed*, not an execution.
- `confirmationPhrase` should record only that a valid phrase was entered (boolean/`"OK"`), never sensitive text.
- This ledger is **parallel to** A3's `config_change_audit.jsonl`; config-changing actions (reset / clear stop) emit **both**.

---

## 10. Audit trail and rollback / post-check

- **Audit:** `recovery_actions.jsonl` (§9) for the action; A3 `config_change_audit.jsonl` for any config field it changes; existing `panic_events.jsonl` / `live_control_events.jsonl` remain as-is.
- **Post-check (per action):** restart actions → target heartbeat returns HEALTHY within ~2× cadence; reset/clear actions → `--status` shows `PIPELINE_DRY_RUN`, `dryRunMode:true`, `liveArmed:false`, `emergencyStop:false`.
- **Rollback / escalation:** if post-check fails or posture drifts → **stop**, run `panic.ps1`, escalate to human investigation. No automatic retry, no "try harder." Recovery never outruns ownership.

---

## 11. Future dashboard UI requirements

Even when implemented (separate, approved milestone), the recovery UI must:

- Be **read-only by default**; the dashboard remains a reader (A1 §4.6) until an authenticated, audited action path is explicitly approved.
- **Hide actions unless eligible** (pre-checks §7 pass and the target is unhealthy). No greyed-out "go live"-style affordances.
- Use **two-step confirmation**; high-risk requires a typed phrase.
- Show a **clear command preview** (exact text the action would run).
- Show explicit **"this will not trade live"** wording on every offer, and **"blocked because unsafe: <reason>"** when a gate fails.
- **Never** display "go live," "arm," "enable live," or any promotion affordance.
- **First implementable step = command-preview only** (the UI shows the exact command + confirmation, the human runs it in a terminal; the dashboard executes nothing). Actual execution-from-UI is deferred behind dashboard authentication + A2d soak + explicit approval.

---

## 12. Risks

| Risk | Severity | Mitigation in this design |
|------|----------|----------------------------|
| Scope creep into building buttons/routes now | **High** | Planning only (§2, §15); deliverable is one doc |
| Unauthenticated dashboard gains a recovery executor | **High** | Auth precondition (§6); preview-only first (§11); existing `/control/*` routes flagged, not expanded |
| Executor auto/loose recovery corrupts R3/R4 state | **High** | Executor = high-risk tier; excluded from low-risk UI and from A2e until R3–R6 land |
| Clearing `emergencyStop` re-arms unsafely | **High** | Typed phrase + posture gates; `reset_after_panic.ps1` already refuses LIVE/non-dry-run |
| Recovery treated as a path to live | **High** | Manual-only tier (§5.3); forbidden tier (§5.4); "no go-live affordance" (§11) |
| Audit gaps for recovery actions | Medium | `recovery_actions.jsonl` schema (§9) defined; secrets redacted |
| Rapid repeated restarts | Medium | Cooldown guardrail (§6) |
| Confusing A2c with execution | Medium | Explicit A2a/A2b/A2c/A2d/A2e separation (§0, §4.9) |

---

## 13. Acceptance criteria (A2c planning)

A2c planning is complete when this document:

1. Inventories existing recovery/control surfaces, including the **pre-existing** `/control/*` POST routes, and ownership constraints. ✅ (§3)
2. Determines eligibility, manual-only, high-risk, and forbidden sets, plus confirmation/pre-check/audit/rollback and the A2c↔A2d↔A2e distinction. ✅ (§4)
3. Classifies recovery actions into **ALLOWED / HIGH-RISK / MANUAL-ONLY / FORBIDDEN**. ✅ (§5)
4. Defines guardrails (confirmation phrase, posture/liveArmed/executionMode/emergencyStop checks, config + action audit, post-check, cooldown, no-action-if-unsafe). ✅ (§6, §7, §8)
5. Defines the `recovery_actions.jsonl` schema **without creating the file**. ✅ (§9)
6. Defines future dashboard UI requirements (read-only default, hidden-unless-eligible, two-step, command preview, safe wording, never "go live"). ✅ (§11)
7. Adds **no code, no config, no scripts, no routes, no buttons, no file**, and leaves posture `PIPELINE_DRY_RUN` / `liveArmed:false` unchanged. ✅ (§2, §15, verified §14)

---

## 14. Negative verification (planning-only footprint)

```powershell
git status --short                 # expect only docs/A2C_HUMAN_CONFIRMED_RECOVERY_PLAN.md
git diff --stat                    # expect no code/config/script changes
Test-Path .\recovery_actions.jsonl # expect False (schema defined, file NOT created)
node live_executor.js --status     # PIPELINE_DRY_RUN, dryRunMode true, liveArmed false
node run_safety_tests.js           # 7/7 (no regression)
```

Pass = only this doc is new; no code/script/config diff; `recovery_actions.jsonl` absent; `--status` still `PIPELINE_DRY_RUN` / `liveArmed:false`; safety suite 7/7.

---

## 15. Do-not-implement warnings (planning phase)

A2c, and any future A2c work up to the approved phase, must **never**:

- ❌ add a dashboard button, action control, POST route, or any state mutator;
- ❌ expand or modify the existing `/control/start|stop|emergency` routes;
- ❌ spawn, kill, or PID-check any process; perform automatic repair or autonomous recovery;
- ❌ create `recovery_actions.jsonl` (or any new file) during planning;
- ❌ add or change any script (`*.ps1`/`*.js`), dependency, or database;
- ❌ enable `LIVE`, change `PIPELINE_DRY_RUN`/`dryRunMode`/arming, or weaken any gate;
- ❌ edit `live_config.json`, `.env`, strategy, exits, or thesis bounds;
- ❌ present any "go live," "arm," or promotion affordance.

If a proposed change does any of the above, it is **outside A2c** — stop and re-scope.

---

## 16. Relationship to A1 / A2 / live authorization

- **A1 (ownership):** sets which processes are safely restartable (single-writer + idempotent). Executor stays high-risk until R3–R6.
- **A2a/A2b:** the read-only recommendation + advice this design would eventually let a human *confirm* (never auto-run).
- **A2d/A2e:** validate (soak) and, far later, narrowly automate the low-risk subset — gated and separate.
- **Live authorization:** **unrelated and forbidden.** No recovery action — offered, confirmed, or executed — ever arms trading or promotes mode. Manual-only and forbidden tiers (§5.3/§5.4) exist precisely to keep it that way.

> **Structure precedes recovery. Recovery precedes promotion. Promotion precedes authorization. Humans authorize. Ori advises. Gates enforce.**

---

*A2c Human-Confirmed Recovery Architecture (planning only) · TracktaOS Module 1 · Phase 1 Stabilization (Sprint 4) · Designs eligibility/guardrails/audit/UI for future human-confirmed recovery; builds nothing. Safe default: `PIPELINE_DRY_RUN`, no live submission. A2a = policy · A2b = advice · A2c = human-confirmed design · A2d = soak · A2e = autonomous (far future). No code, no scripts, no routes, no buttons, no file, no dependency, no database. Recovery must never outrun ownership. Posture verified 2026-06-22. TracktaOS stability has priority over automation.*
