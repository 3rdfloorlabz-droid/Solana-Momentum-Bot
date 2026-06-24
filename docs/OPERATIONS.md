# Operations

## Preflight Checklist

Before starting, restarting, or editing bot code:

1. Confirm working directory is the **repository root** (`Solana-Momentum-Bot/`), not an archive subfolder.
2. Read [ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) — canonical scripts, config, and state files live at root only.
3. **Do not run or edit production code in archive folders:** `automation/`, `hardreset/`, `harness/`, `files/`, `phase1_files/`. Those trees are historical copies; changes there do not affect the running bot.
4. Run `node live_executor.js --status` — expect `PIPELINE_DRY_RUN` and `dryRunMode: true` during migration.
5. Use **`scanner_gmgn_trending.js`** only (not `scanner.js`, `scanner_v3.js`, or other legacy scanners).
6. Before committing, confirm `git status` shows **source changes only** — runtime JSON/JSONL is gitignored per [MIGRATION_NOTES.md](./MIGRATION_NOTES.md); do not stage ledgers or backups.

## Verify Paper Mode

Before starting or restarting anything, verify the executor is not armed for live trading:

```powershell
node live_executor.js --status
```

Safe state should show:

- `executionMode: PIPELINE_DRY_RUN`
- `dryRunMode: true`
- no live submission approval
- no signer secret required for normal paper/dry-run operation

Also check `live_config.json` manually if needed. Do not change it to `LIVE` during migration.

## Mode transitions

Execution mode controls whether the executor **observes** the swap pipeline, runs **legacy dry-run entries**, or **submits live trades**. The most important operational fact: **`PIPELINE_DRY_RUN` does not call `manageOpenPositions`** — open live positions are not exited while you stay in pipeline mode.

Read the full runbook before changing `executionMode` or live env flags:

- **[docs/MODE_TRANSITION.md](./MODE_TRANSITION.md)** — mode matrix, wind-down procedure, pre-flip checklist
- **[LIVE_AUTHORIZATION_RECORD.md](../LIVE_AUTHORIZATION_RECORD.md)** — required before any LIVE flip

## Start Scanner

Run one scanner pass:

```powershell
node scanner_gmgn_trending.js
```

Run continuously:

```powershell
node scanner_gmgn_trending.js --watch
```

The scanner writes accepted paper trades to `paper_trades.json` and candidate intents to `pipeline_candidates.jsonl`.

## Start Monitor

Run the paper monitor:

```powershell
node monitor.js
```

The monitor checks open paper trades, closes them on target/stop/timeout, and prints paper-trade stats each cycle.

## Run Tests

Syntax checks:

```powershell
node --check live_executor.js
node --check scanner_gmgn_trending.js
node --check monitor.js
node --check dashboard_server.js
```

Focused safety and pipeline tests:

```powershell
node test_observation_pool.js
node test_pipeline_candidate_handoff.js
node test_pipeline_dry_run.js
node test_signer_guard.js
node test_step9a_signing.js
node test_step9b_submission.js
```

System validators:

```powershell
node validate_data.js
node validate_live_system.js
node validate_wallet_connection.js
```

## Restart After Crashes

1. Check safety state:

```powershell
node live_executor.js --status
```

2. Check whether local bot processes are still running:

```powershell
.\fomo_status.ps1
```

`fomo_status.ps1`, `panic.ps1`, and `reset_after_panic.ps1` default to `$PSScriptRoot` and exit if `live_config.json` is missing. Pass `-ProjectPath` only when needed.

3. Restart only the process that crashed:

```powershell
node scanner_gmgn_trending.js --watch
node monitor.js
node near_miss_followup.js --watch
node dashboard_server.js
```

4. If multiple local windows need to be relaunched, `start_fomo.ps1` can start the normal process set. The script defaults to its own directory (`$PSScriptRoot`) and exits if `live_config.json` is missing. Override with `-ProjectPath` only when needed. Use it only after confirming `live_config.json` remains in `PIPELINE_DRY_RUN`.

5. If an emergency stop or panic event occurred, review `panic_events.jsonl`, `live_control_events.jsonl`, and `live_errors.jsonl` before resetting safety state.

## A2d Soak Operation

Long-duration validation of the read-only **Supervisor Recommendations (A2a)** and **Recovery Advisor (A2b)** panels. This is **observation and documentation only** — it does not authorize recovery execution, live trading, config changes, or autonomy.

**Primary docs:**

- [A2D_SOAK_VALIDATION_PLAN.md](./A2D_SOAK_VALIDATION_PLAN.md) — pass/fail criteria (V1–V11)
- [A2D_SOAK_CHECKPOINT_LOG.md](./A2D_SOAK_CHECKPOINT_LOG.md) — living operator log (record checkpoints here)
- [A2D_SOAK_REVIEW_TEMPLATE.md](./A2D_SOAK_REVIEW_TEMPLATE.md) — complete after soak ends

**Posture throughout soak:** `PIPELINE_DRY_RUN` · `dryRunMode: true` · `liveArmed: false`. Verify at every checkpoint:

```powershell
node live_executor.js --status
```

### When the dashboard looks stale (missing panels)

The dashboard **does not hot-reload** after `dashboard_server.js` edits. A process started before A2a/A2b code was deployed will keep serving old HTML until restarted.

1. Confirm panels are missing in the browser (Supervisor Recommendations / Recovery Advisor not between Process Heartbeats and Scanner Health).
2. Find the listener on port 3000:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object OwningProcess
```

3. Stop **only** the stale dashboard process (replace `<PID>`):

```powershell
Stop-Process -Id <PID> -Force
```

4. Start a fresh dashboard from repo root:

```powershell
node dashboard_server.js
```

5. Hard-refresh `http://localhost:3000` and confirm Supervisor Recommendations + Recovery Advisor are visible.

**Record a dashboard restart in the checkpoint log** (operator notes). A restart for stale HTML is acceptable; it is not recovery execution.

### Restart dashboard only after `dashboard_server.js` changes

- **Do restart** the dashboard when `dashboard_server.js` changed and panels/HTML are stale.
- **Do not restart** scanner, executor, monitor, or wallet monitor during an active soak unless a real crash occurred — restarts mid-soak can muddy heartbeat evidence.
- **Never** use the Recovery Advisor text as a trigger to automate restarts during A2d.

### How to record checkpoints

Every **~3–4 hours**, append a checkpoint to [A2D_SOAK_CHECKPOINT_LOG.md](./A2D_SOAK_CHECKPOINT_LOG.md):

1. Open the log and copy the checkpoint template (or follow the Checkpoint 2/3 format).
2. Fill in timestamp, operator, dashboard heartbeats, supervisor states, recovery advisor behavior, scanner health, promotion checklist, safety result, executor status, temp-file check, and `recovery_actions.jsonl` check.
3. Run read-only commands:

```powershell
node live_executor.js --status
node run_safety_tests.js
Get-ChildItem -Filter "*.tmp"
Get-ChildItem -Recurse -Filter "live_config.json.*.tmp"
Test-Path recovery_actions.jsonl   # expect False until A2c exists
```

4. Judge **PASS** / **FAIL** / **INVESTIGATE** against [A2D_SOAK_VALIDATION_PLAN.md §3](./A2D_SOAK_VALIDATION_PLAN.md).
5. Save the log; commit **documentation only** when appropriate (no runtime JSON/JSONL).

### Check frequency

| When | Action |
|------|--------|
| **T0 (start)** | Pre-run checklist + first checkpoint; safety 7/7; confirm read-only panels |
| **Every ~3–4h** | Periodic checkpoint while soak is IN PROGRESS |
| **T+24h minimum** | Minimum soak duration met — continue toward 72h if possible |
| **T+72h preferred** | End-of-soak checks; complete review template |

### Stop conditions (end or pause the soak)

**Stop immediately** (do not treat as passing evidence) if any of:

- `liveArmed` becomes `true`, or `executionMode` / `dryRunMode` drift from T0
- Any **FAILED** badge appears on the supervisor panel (A2a should never auto-derive FAILED)
- Recovery execution, dashboard POST actions, or config edits occur during the soak
- Safety suite drops below **7/7** at end-of-soak

**Pause and document** (investigate before continuing):

- Duplicate process sets running (see below)
- False DEGRADED with no verifiable M4/A4 cause
- Paper Monitor STALE with monitor actually dead (not quiet) — verify terminal before acting

**Normal, non-panic during soak:**

- Paper Monitor **STALE** during quiet markets (no open paper trades) — Recovery Advisor should show **Low** severity and "may be quiet, not dead" (V8)

### Do not use recovery execution

A2d validates that **advice is accurate**, not that **actions work**. During the soak:

- **Do not** execute recovery steps from the dashboard (no buttons exist — keep it that way)
- **Do not** spawn/kill processes to "test" recovery except optional, documented, manual fault-injection of a **low-risk** process (e.g. wallet monitor) with operator notes
- **Do not** treat passing checkpoints as authorization for A2c execution or live promotion

> Recovery must never outrun ownership. Humans authorize. Ori advises. Gates enforce.

### Duplicate process sets invalidate observation

Running **two copies** of scanner, monitor, executor, or wallet monitor (e.g. from an old `start_fomo.ps1` session plus a new one) can:

- Reintroduce file-race risk despite A1 fixes
- Make heartbeat ground truth ambiguous (which process owns the artifact?)
- Muddy A2d evidence

Before continuing the soak, confirm a **single canonical process set** via `.\fomo_status.ps1` or task manager. Stop duplicates; record the cleanup in the checkpoint log. Prefer one clean `start_fomo.ps1` launch over overlapping manual windows.

### A2c Recovery Action Preview (preview-only UI)

The dashboard includes a read-only **A2c Recovery Action Preview** panel (nested under Supervisor Recommendations). It shows:

- Future low-risk / high-risk recovery commands as **plain text only**
- Dynamic eligibility (Blocked / Eligible for future human-confirmed UI / Forbidden)
- Required prechecks, postchecks, and future confirmation phrases

**It does not execute anything.** Operators must run commands **manually in a terminal**.

- **Do not** treat preview eligibility as permission to recover, promote modes, or enable live trading.
- **Do not** confuse A2c preview with the existing config-control POST routes (`/control/start`, `/control/stop`, `/control/emergency`) — those mutate `live_config.json` when authorized; see **Dashboard Control Auth** below.
- Any future **execution-capable** recovery UI requires authentication, audit logging (`recovery_actions.jsonl`), stronger validation, and explicit approval — not this preview alone.

See [A2C_HUMAN_CONFIRMED_RECOVERY_PLAN.md](./A2C_HUMAN_CONFIRMED_RECOVERY_PLAN.md) · [A2D_SOAK_REVIEW.md](./A2D_SOAK_REVIEW.md).

### Dashboard Control Auth (A2j)

The three config-control POST routes (`/control/start`, `/control/stop`, `/control/emergency`) require authentication before any config mutation:

| Requirement | Detail |
|-------------|--------|
| **Env var** | `DASHBOARD_CONTROL_TOKEN` must be set to a non-empty secret before dashboard control POST routes can succeed. If unset or empty, all three routes **fail closed** (403). |
| **Header** | `X-Trackta-Control-Token: <token>` on each POST request. |
| **Read-only viewing** | GET `/`, `/winners`, and static assets do **not** require the token. |
| **A2c preview** | Remains preview-only and non-executing — separate from config-control auth. |

**Operator rules:**

- Do **not** commit the token, put it in URLs/query strings, paste it into screenshots, or log it.
- Plain browser form buttons on the dashboard do **not** send the header; use a header-capable client, for example:

```powershell
$headers = @{ "X-Trackta-Control-Token" = $env:DASHBOARD_CONTROL_TOKEN }
Invoke-WebRequest -Uri "http://127.0.0.1:3000/control/stop" -Method POST -Headers $headers -UseBasicParsing
```

- **A2j does not add recovery execution.** Recovery execution remains blocked pending recovery audit, stronger validation, and explicit approval.
- **A2k behavioral auth tests** (`test_dashboard_auth_behavior.js`) exercise HTTP fail-closed behavior against an isolated temp fixture harness — not the operator's live dashboard on port 3000.
- **A2m recovery audit writer** (`recovery_audit.js`) exists for append-only `recovery_actions.jsonl` rows when explicitly called; it is **not wired** to dashboard recovery execution. Do **not** manually create or edit `recovery_actions.jsonl` at repo root; recovery execution remains unavailable.
- After changing `dashboard_server.js`, restart the dashboard process (no hot reload).

## Commands To Avoid Without Approval

Do not enable live trading during normal migration or paper operations.

Avoid these unless explicitly approved:

```powershell
node live_executor.js --cycle
node live_executor.js --loop
```

Do not set:

```text
executionMode=LIVE
dryRunMode=false
FOMO_ENABLE_LIVE_SUBMISSION=YES
FOMO_ALLOW_LOOP_LIVE=YES
SOLANA_SIGNER_SECRET=<real signer>
```

## Archive Folders — Do Not Execute

These directories contain duplicate or snapshot code. **They are not production paths.**

| Folder | Do not run | Do not edit expecting live bot changes |
|--------|------------|----------------------------------------|
| `automation/` | Yes | Yes |
| `hardreset/` | Yes | Yes |
| `harness/` | Yes | Yes |
| `files/` | Yes | Yes |
| `phase1_files/` | Yes | Yes |

If you need to know which script to run, use the root copies listed in [ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md). Do not move or merge archive code during normal operations (quarantine is a separate Sprint 2 task).
