# Start Momentum Bot - OBSERVATION MODE (dry-run only)
# Launches: dashboard + scanner loop + monitor loop + status loop, then opens the dashboard.
#
# SAFETY - observation only:
#   This launcher must NEVER contain any live-execution, arming, or one-time proof/broadcast
#   command. Those broadcast real transactions and are run by hand, with a human present.
#   Do not add a "proof harness" / "--execute-real-proof" / "--final-broadcast-confirmation"
#   line here under any circumstances.

cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot

Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot; node dashboard_server.js'

Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot; while ($true) { Get-Date; node scanner.js; Start-Sleep -Seconds 60 }'

Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot; while ($true) { Get-Date; node monitor.js; Start-Sleep -Seconds 60 }'

Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot; while ($true) { Get-Date; node b2a_24h_observation_status.js; Test-Path recovery_actions.jsonl; node live_executor.js --status; Start-Sleep -Seconds 300 }'

Start-Process "http://localhost:3000"
