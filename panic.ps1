param(
  [string]$ProjectPath = $PSScriptRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = $ProjectPath
$ConfigPath = Join-Path $ProjectRoot "live_config.json"
$TempConfigPath = Join-Path $ProjectRoot "live_config.json.panic-tmp"
$EventLogPath = Join-Path $ProjectRoot "panic_events.jsonl"
$ConfigAuditPath = Join-Path $ProjectRoot "config_change_audit.jsonl"
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
  Write-Error "Project path not found: $ProjectRoot"
  exit 1
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  Write-Error "live_config.json not found at $ConfigPath. Run panic.ps1 from the repo root or pass -ProjectPath."
  exit 1
}

function Read-Config {
  if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "live_config.json not found at $ConfigPath"
  }
  try {
    return Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
  } catch {
    throw "live_config.json is not valid JSON: $($_.Exception.Message)"
  }
}

function ConvertTo-JsonTwoSpaces {
  param(
    [Parameter(Mandatory = $true)] [pscustomobject] $Value
  )

  $json = $Value | ConvertTo-Json -Depth 50
  $lines = $json -split "\r?\n"
  $indentLine = $lines | Where-Object { $_ -match "^( +)\S" } | Select-Object -First 1
  if (-not $indentLine) {
    return ($lines -join [Environment]::NewLine)
  }

  $indentStep = ([regex]::Match($indentLine, "^( +)")).Groups[1].Value.Length
  if ($indentStep -le 0) {
    return ($lines -join [Environment]::NewLine)
  }

  $normalized = foreach ($line in $lines) {
    $match = [regex]::Match($line, "^( +)(.*)$")
    if ($match.Success) {
      $level = [Math]::Floor($match.Groups[1].Value.Length / $indentStep)
      (" " * ([int]($level * 2))) + $match.Groups[2].Value
    } else {
      $line
    }
  }
  return ($normalized -join [Environment]::NewLine)
}

function Write-ConfigAtomically {
  param(
    [Parameter(Mandatory = $true)] [pscustomobject] $Config
  )

  if (Test-Path -LiteralPath $TempConfigPath) {
    Remove-Item -LiteralPath $TempConfigPath -Force
  }

  try {
    $json = ConvertTo-JsonTwoSpaces -Value $Config
    [System.IO.File]::WriteAllText($TempConfigPath, $json + [Environment]::NewLine, $Utf8NoBom)
    $null = Get-Content -LiteralPath $TempConfigPath -Raw | ConvertFrom-Json
    Move-Item -LiteralPath $TempConfigPath -Destination $ConfigPath -Force
  } catch {
    if (Test-Path -LiteralPath $TempConfigPath) {
      Remove-Item -LiteralPath $TempConfigPath -Force -ErrorAction SilentlyContinue
    }
    throw "Atomic config update failed; original live_config.json left untouched. $($_.Exception.Message)"
  }
}

function Get-FomoNodeProcesses {
  $patterns = @(
    @{ Name = "live_executor.js"; Pattern = "\\live_executor\.js\b" },
    @{ Name = "scanner_gmgn_trending.js"; Pattern = "\\scanner_gmgn_trending\.js\b" },
    @{ Name = "monitor.js"; Pattern = "\\monitor\.js\b" },
    @{ Name = "wallet_monitor.js"; Pattern = "\\wallet_monitor\.js\b" },
    @{ Name = "run_pipeline_*.js"; Pattern = "\\run_pipeline_[a-z_]+\.js\b" }
  )

  $nodeProcesses = Get-CimInstance Win32_Process |
    Where-Object { $_.Name -ieq "node.exe" -and $_.CommandLine }

  $matches = @()
  foreach ($process in $nodeProcesses) {
    foreach ($entry in $patterns) {
      if ($process.CommandLine -match $entry.Pattern) {
        $matches += [pscustomobject]@{
          Name = $entry.Name
          ProcessId = [int]$process.ProcessId
          CommandLine = $process.CommandLine
        }
        break
      }
    }
  }
  return $matches
}

function Get-DashboardProcess {
  param([Parameter(Mandatory = $true)] [string] $ScriptName)

  $pattern = "\\$([regex]::Escape($ScriptName))\b"
  return Get-CimInstance Win32_Process |
    Where-Object { $_.Name -ieq "node.exe" -and $_.CommandLine -and $_.CommandLine -match $pattern } |
    Select-Object -First 1
}

function Append-JsonLine {
  param([Parameter(Mandatory = $true)] [hashtable] $Record)

  $line = $Record | ConvertTo-Json -Depth 20 -Compress
  [System.IO.File]::AppendAllText($EventLogPath, $line + [Environment]::NewLine, $Utf8NoBom)
}

# A3 config change audit — config-only liveArmed approximation (env flags not visible here).
function Get-ConfigLiveArmed {
  param($Cfg)
  return (($Cfg.executionMode -eq "LIVE") -and ($Cfg.dryRunMode -eq $false) -and ($Cfg.emergencyStop -eq $false) -and ($Cfg.automationEnabled -eq $true))
}

# A3 config change audit — append-only; never mutates config. Best-effort, skips no-op changes.
function Append-ConfigAudit {
  param(
    [Parameter(Mandatory = $true)] [string] $Field,
    $OldValue,
    $NewValue,
    [Parameter(Mandatory = $true)] [string] $RiskLevel,
    [Parameter(Mandatory = $true)] [string] $Reason,
    [Parameter(Mandatory = $true)] [string] $Source,
    [Parameter(Mandatory = $true)] [string] $ChangeId,
    [string] $ModeAtChange = $null,
    [bool] $LiveArmedAtChange = $false
  )
  if ([string]$OldValue -eq [string]$NewValue) { return }
  $requiresReview = ($RiskLevel -eq "CRITICAL" -or $RiskLevel -eq "IMPORTANT")
  $record = [ordered]@{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    actor = "operator"
    source = $Source
    field = $Field
    oldValue = $OldValue
    newValue = $NewValue
    reason = $Reason
    riskLevel = $RiskLevel
    requiresReview = $requiresReview
    modeAtChange = $ModeAtChange
    liveArmedAtChange = $LiveArmedAtChange
    changeId = $ChangeId
  }
  $line = $record | ConvertTo-Json -Depth 20 -Compress
  [System.IO.File]::AppendAllText($ConfigAuditPath, $line + [Environment]::NewLine, $Utf8NoBom)
}

try {
  Set-Location -LiteralPath $ProjectRoot
  Write-Host "Project path: $ProjectRoot" -ForegroundColor DarkGray

  $config = Read-Config
  $oldEmergencyStop = $config.emergencyStop
  $oldAutomationEnabled = $config.automationEnabled
  $config.emergencyStop = $true
  $config.automationEnabled = $false
  Write-ConfigAtomically -Config $config

  # A3 config change audit (append-only; best-effort; never blocks panic).
  try {
    $auditChangeId = [guid]::NewGuid().ToString()
    $auditMode = [string]$config.executionMode
    $auditLiveArmed = Get-ConfigLiveArmed -Cfg $config
    Append-ConfigAudit -Field "emergencyStop" -OldValue $oldEmergencyStop -NewValue $true -RiskLevel "CRITICAL" -Reason "manual panic.ps1 emergency stop" -Source "panic.ps1" -ChangeId $auditChangeId -ModeAtChange $auditMode -LiveArmedAtChange $auditLiveArmed
    Append-ConfigAudit -Field "automationEnabled" -OldValue $oldAutomationEnabled -NewValue $false -RiskLevel "CRITICAL" -Reason "manual panic.ps1 emergency stop" -Source "panic.ps1" -ChangeId $auditChangeId -ModeAtChange $auditMode -LiveArmedAtChange $auditLiveArmed
  } catch { Write-Warning "Config audit append failed (non-fatal): $($_.Exception.Message)" }

  $matchedProcesses = @(Get-FomoNodeProcesses)
  $stopped = @()
  foreach ($process in $matchedProcesses) {
    try {
      Stop-Process -Id $process.ProcessId -Force
      $stopped += [pscustomobject]@{ name = $process.Name; pid = $process.ProcessId }
    } catch {
      Write-Warning "Failed to stop $($process.Name) (PID $($process.ProcessId)): $($_.Exception.Message)"
    }
  }

  $knownNames = @("live_executor.js", "scanner_gmgn_trending.js", "monitor.js", "wallet_monitor.js", "run_pipeline_*.js")
  $stoppedNames = @($stopped | ForEach-Object { $_.name } | Sort-Object -Unique)
  $notFound = @($knownNames | Where-Object { $stoppedNames -notcontains $_ })

  $dashboard = Get-DashboardProcess -ScriptName "dashboard_server.js"
  $analysisDashboard = Get-DashboardProcess -ScriptName "analysis_dashboard_server.js"

  Append-JsonLine -Record @{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    action = "PANIC"
    emergencyStop = $true
    automationEnabled = $false
    processesStopped = @($stopped)
    processesNotFound = @($notFound)
    dashboardLeftRunning = [bool]$dashboard
    dashboardServerPid = if ($dashboard) { [int]$dashboard.ProcessId } else { $null }
    analysisDashboardServerPid = if ($analysisDashboard) { [int]$analysisDashboard.ProcessId } else { $null }
    reason = "manual panic.ps1 emergency stop"
  }

  $stoppedText = if ($stopped.Count -gt 0) {
    ($stopped | ForEach-Object { "$($_.name) (PID $($_.pid))" }) -join ", "
  } else {
    "none"
  }
  $notFoundText = if ($notFound.Count -gt 0) { $notFound -join ", " } else { "none" }

  Write-Host "PANIC ACTIVATED"
  Write-Host "  live_config.json: emergencyStop=true, automationEnabled=false"
  Write-Host "  Stopped: $stoppedText"
  Write-Host "  Not found: $notFoundText"
  if ($dashboard) {
    Write-Host "  dashboard_server.js: still running (PID $($dashboard.ProcessId)) - preserved"
  } else {
    Write-Host "  dashboard_server.js: not running"
  }
  if ($analysisDashboard) {
    Write-Host "  analysis_dashboard_server.js: still running (PID $($analysisDashboard.ProcessId)) - preserved"
  } else {
    Write-Host "  analysis_dashboard_server.js: not running"
  }
  Write-Host "  panic_events.jsonl: incident recorded"
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
