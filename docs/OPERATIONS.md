# Operations

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

3. Restart only the process that crashed:

```powershell
node scanner_gmgn_trending.js --watch
node monitor.js
node near_miss_followup.js --watch
node dashboard_server.js
```

4. If multiple local windows need to be relaunched, `start_fomo.ps1` can start the normal process set. Use it only after confirming `live_config.json` remains in `PIPELINE_DRY_RUN`.

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
