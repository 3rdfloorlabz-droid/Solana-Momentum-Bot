@echo off
title Momentum Bot - safety / status check
cd /d "C:\TracktaOS\Projects\Active\Solana-Momentum-Bot"

echo recovery_actions.jsonl present?
if exist recovery_actions.jsonl (
  echo   True   - review before running
) else (
  echo   False  - OK
)
echo.

echo === 24h observation status ===
node b2a_24h_observation_status.js
echo.

echo === executor posture (read-only) ===
node live_executor.js --status
echo.

echo Expected: PIPELINE_DRY_RUN / dryRunMode: true / liveArmed: false / liveSubmission: DISARMED
echo.
pause
