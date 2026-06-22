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
