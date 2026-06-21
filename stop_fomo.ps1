$ErrorActionPreference = "Stop"

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

$MatchingProcesses = Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -eq "node.exe" -and
        $_.CommandLine -and
        (Test-FomoCommandLine $_.CommandLine)
    }

if (-not $MatchingProcesses) {
    Write-Host "No matching FOMO Node processes are running." -ForegroundColor Yellow
    exit 0
}

foreach ($Process in $MatchingProcesses) {
    $MatchedScript = $ProjectScripts |
        Where-Object {
            $Pattern = '(?i)(?:^|[\s"''\\/])' + [regex]::Escape($_) + '(?=\s|$)'
            $Process.CommandLine -match $Pattern
        } |
        Select-Object -First 1

    try {
        Stop-Process -Id $Process.ProcessId -ErrorAction Stop
        Write-Host "Stopped $MatchedScript (PID $($Process.ProcessId))." -ForegroundColor Green
    }
    catch {
        Write-Warning "Could not stop $MatchedScript (PID $($Process.ProcessId)): $($_.Exception.Message)"
    }
}
