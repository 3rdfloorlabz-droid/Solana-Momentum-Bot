param(
  [string]$ProjectPath = $PSScriptRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = $ProjectPath
$ConfigPath = Join-Path $ProjectRoot "live_config.json"
$TempConfigPath = Join-Path $ProjectRoot "live_config.json.panic-tmp"
$EventLogPath = Join-Path $ProjectRoot "panic_events.jsonl"
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
  Write-Error "Project path not found: $ProjectRoot"
  exit 1
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  Write-Error "live_config.json not found at $ConfigPath. Run reset_after_panic.ps1 from the repo root or pass -ProjectPath."
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

function Append-JsonLine {
  param([Parameter(Mandatory = $true)] [hashtable] $Record)

  $line = $Record | ConvertTo-Json -Depth 20 -Compress
  [System.IO.File]::AppendAllText($EventLogPath, $line + [Environment]::NewLine, $Utf8NoBom)
}

try {
  Set-Location -LiteralPath $ProjectRoot
  Write-Host "Project path: $ProjectRoot" -ForegroundColor DarkGray

  $config = Read-Config
  if ($config.executionMode -eq "LIVE") {
    Write-Host "REFUSED: executionMode is LIVE. Reset will not bring the system out of panic into live mode. Step 9b human authorization is required."
    exit 1
  }
  if ($config.dryRunMode -eq $false) {
    Write-Host "REFUSED: dryRunMode is false. Reset will not enable automation without dry-run mode confirmed."
    exit 1
  }
  if ($config.emergencyStop -eq $false) {
    Write-Host "No reset needed. emergencyStop is already false."
    exit 0
  }

  Write-Host "Reset will set emergencyStop=false and automationEnabled=true."
  Write-Host ""
  Write-Host "Current state:"
  Write-Host "  executionMode: $($config.executionMode)"
  Write-Host "  dryRunMode: $($config.dryRunMode)"
  Write-Host "  emergencyStop: $($config.emergencyStop)"
  Write-Host "  automationEnabled: $($config.automationEnabled)"
  Write-Host ""
  Write-Host "Confirm dryRunMode is true and executionMode is PIPELINE_DRY_RUN before proceeding."
  Write-Host "Type YES to continue:"

  $confirmation = [Console]::ReadLine()
  if ($confirmation -cne "YES") {
    Write-Host "Reset aborted. No changes made."
    exit 1
  }

  $config.emergencyStop = $false
  $config.automationEnabled = $true
  Write-ConfigAtomically -Config $config

  Append-JsonLine -Record @{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    action = "RESET"
    emergencyStop = $false
    automationEnabled = $true
    executionModeAtReset = $config.executionMode
    dryRunModeAtReset = $config.dryRunMode
    reason = "manual reset_after_panic.ps1"
  }

  Write-Host "RESET COMPLETE"
  Write-Host "  live_config.json: emergencyStop=false, automationEnabled=true"
  Write-Host "  executionMode unchanged: $($config.executionMode)"
  Write-Host "  dryRunMode unchanged: $($config.dryRunMode)"
  Write-Host "  panic_events.jsonl: reset recorded"
  Write-Host ""
  Write-Host "To resume the autonomous loop, manually start the executor:"
  Write-Host "  node live_executor.js --loop"
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
