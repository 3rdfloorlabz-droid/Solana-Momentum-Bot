$ErrorActionPreference = "Continue"

$ProjectPath = "C:\Users\nalle\sol-momentum-bot"
$ConfigPath = Join-Path $ProjectPath "live_config.json"
$ProjectScripts = @(
    "dashboard_server.js",
    "wallet_monitor.js",
    "scanner_gmgn_trending.js",
    "monitor.js",
    "live_executor.js"
)

function Test-FomoCommandLine {
    param([string]$CommandLine)

    foreach ($Script in $ProjectScripts) {
        $Pattern = '(?i)(?:^|[\s"''\\/])' + [regex]::Escape($Script) + '(?=\s|$)'
        if ($CommandLine -match $Pattern) {
            return $true
        }
    }
    return $false
}

Write-Host "FOMO System Status" -ForegroundColor Cyan
Write-Host ""

$Port = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($Port) {
    Write-Host "Port 3000: RUNNING (PID $($Port[0].OwningProcess))" -ForegroundColor Green
}
else {
    Write-Host "Port 3000: OFFLINE" -ForegroundColor Red
}

Write-Host ""
Write-Host "Matching Node Processes" -ForegroundColor Cyan
$Matches = Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -eq "node.exe" -and
        $_.CommandLine -and
        (Test-FomoCommandLine $_.CommandLine)
    } |
    Select-Object ProcessId, CommandLine

if ($Matches) {
    $Matches | Format-Table -AutoSize
}
else {
    Write-Host "No matching FOMO Node processes are running." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Live Config Safety State" -ForegroundColor Cyan
if (Test-Path -LiteralPath $ConfigPath) {
    try {
        $Config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
        [pscustomobject]@{
            executionMode     = $Config.executionMode
            dryRunMode        = $Config.dryRunMode
            automationEnabled = $Config.automationEnabled
            emergencyStop     = $Config.emergencyStop
        } | Format-List
    }
    catch {
        Write-Warning "Could not read live_config.json: $($_.Exception.Message)"
    }
}
else {
    Write-Warning "live_config.json was not found at $ConfigPath."
}
