param(
    [string]$ProjectPath = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

$LaunchDelaySeconds = 2
$ConfigPath = Join-Path $ProjectPath "live_config.json"

if (-not (Test-Path -LiteralPath $ProjectPath)) {
    Write-Error "Project path not found: $ProjectPath"
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
    Write-Error "live_config.json not found at $ConfigPath. Run start_fomo.ps1 from the repo root or pass -ProjectPath."
}

$Processes = @(
    @{ Title = "FOMO Dashboard";     Command = "node dashboard_server.js" },
    @{ Title = "FOMO Wallet Monitor"; Command = "node wallet_monitor.js" },
    @{ Title = "FOMO Scanner";       Command = "node scanner_gmgn_trending.js --watch" },
    @{ Title = "FOMO Paper Monitor"; Command = "node monitor.js" },
    @{ Title = "FOMO Live Executor"; Command = "node live_executor.js --loop" }
)

Write-Host "Starting FOMO bot processes in PIPELINE_DRY_RUN-safe operational windows..." -ForegroundColor Cyan
Write-Host "Project path: $ProjectPath" -ForegroundColor DarkGray

foreach ($Process in $Processes) {
    $WindowCommand = "& { `$Host.UI.RawUI.WindowTitle = '$($Process.Title)'; Set-Location -LiteralPath '$ProjectPath'; Write-Host '$($Process.Title)' -ForegroundColor Cyan; $($Process.Command) }"

    Write-Host "Starting $($Process.Title): $($Process.Command)"
    Start-Process -FilePath "powershell.exe" -WorkingDirectory $ProjectPath -ArgumentList @(
        "-NoExit",
        "-NoProfile",
        "-Command",
        $WindowCommand
    )

    Start-Sleep -Seconds $LaunchDelaySeconds
}

Write-Host "FOMO startup sequence launched." -ForegroundColor Green
