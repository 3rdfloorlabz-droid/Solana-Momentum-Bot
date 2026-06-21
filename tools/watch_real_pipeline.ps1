<#
Developer utility only.
Read-only watcher for FOMO pipeline logs.

Hard constraints:
- Does not modify live_executor.js
- Does not modify live_config.json
- Does not change executionMode or dryRunMode
- Does not add signer secrets
- Does not submit transactions
- Reads log files only
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$AuditPath = Join-Path $RepoRoot "execution_audit.jsonl"
$ErrorsPath = Join-Path $RepoRoot "live_errors.jsonl"
$PollSeconds = 5

$AuditStages = @(
  '"stage":"QUOTE"',
  '"stage":"TX_BUILD"',
  '"stage":"SIMULATION"',
  '"stage":"PIPELINE_DRY_RUN"'
)

$AuditNoisePatterns = @(
  '11111111111111111111111111111111',
  'THESIS_OBSERVATION',
  'NON_THESIS_OBSERVATION',
  'fee-test',
  'FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6',
  'quote-hash-step8',
  '8189027c52bb0123',
  'rpc.invalid',
  'dedicated-rpc.invalid',
  '"endpointResolution":true'
)

$ErrorPatterns = @(
  'QUOTE_FAILED',
  'TX_BUILD_FAILED',
  'SIMULATION_FAILED',
  'PRIORITY_FEE_UNAVAILABLE',
  'SUBMISSION_UNKNOWN',
  'CONFIRMATION_UNKNOWN',
  'FILL_PARSE_UNKNOWN'
)

$Positions = @{}

function Write-Banner {
  Write-Host "FOMO Real Pipeline Watcher"
  Write-Host ("Started: {0}" -f (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz"))
  Write-Host "Mode: read-only log monitoring. No config, code, signer, position, or transaction changes."
  Write-Host ("Repo: {0}" -f $RepoRoot)
  Write-Host ""
}

function Initialize-Position {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (Test-Path -LiteralPath $Path) {
    $item = Get-Item -LiteralPath $Path
    $Positions[$Path] = [int64]$item.Length
    Write-Host ("Watching {0} from byte {1}" -f (Split-Path -Leaf $Path), $item.Length)
  } else {
    $Positions[$Path] = [int64]0
    Write-Host ("Missing for now: {0} (will watch if it appears)" -f (Split-Path -Leaf $Path))
  }
}

function Read-NewLines {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (!(Test-Path -LiteralPath $Path)) {
    $Positions[$Path] = [int64]0
    return @()
  }

  $item = Get-Item -LiteralPath $Path
  if ($Positions.ContainsKey($Path)) {
    $previous = [int64]$Positions[$Path]
  } else {
    $previous = [int64]0
  }

  if ($item.Length -lt $previous) {
    $previous = 0
  }

  if ($item.Length -eq $previous) {
    return @()
  }

  $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  try {
    [void]$stream.Seek($previous, [System.IO.SeekOrigin]::Begin)
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8, $true)
    try {
      $text = $reader.ReadToEnd()
      $Positions[$Path] = [int64]$stream.Position
    } finally {
      $reader.Dispose()
    }
  } finally {
    $stream.Dispose()
  }

  if ([string]::IsNullOrWhiteSpace($text)) {
    return @()
  }

  return $text -split "\r?\n" | Where-Object { $_ -and $_.Trim().Length -gt 0 }
}

function Matches-Any {
  param(
    [Parameter(Mandatory = $true)][string]$Line,
    [Parameter(Mandatory = $true)][string[]]$Patterns
  )

  foreach ($pattern in $Patterns) {
    if ($Line.Contains($pattern)) { return $true }
  }
  return $false
}

function Should-Print-Audit {
  param([Parameter(Mandatory = $true)][string]$Line)

  if (!$Line.Contains('"eventType":"EXECUTION_STAGE"')) { return $false }
  if (!(Matches-Any -Line $Line -Patterns $AuditStages)) { return $false }
  if (Matches-Any -Line $Line -Patterns $AuditNoisePatterns) { return $false }
  return $true
}

function Should-Print-Error {
  param([Parameter(Mandatory = $true)][string]$Line)

  return (Matches-Any -Line $Line -Patterns $ErrorPatterns)
}

function First-Value {
  param([object[]]$Values)

  foreach ($value in $Values) {
    if ($null -ne $value -and "$value" -ne "") {
      return $value
    }
  }
  return $null
}

function Write-Audit-Line {
  param([Parameter(Mandatory = $true)][string]$Line)

  try {
    $event = $Line | ConvertFrom-Json
    $payload = $event.payload
    $symbol = First-Value @($payload.symbol, $payload.tokenSymbol, $payload.name)
    $address = First-Value @($payload.address, $payload.tokenAddress, $payload.mint, $payload.pairAddress)
    $success = First-Value @($payload.success, $payload.simulationSuccess, $payload.confirmed)
    $unitsConsumed = First-Value @($payload.unitsConsumed)
    $lastValidBlockHeight = First-Value @($payload.lastValidBlockHeight)
    $abortCode = First-Value @($payload.abortCode, $payload.code)

    $parts = @(
      "timestamp=$($event.timestamp)",
      "stage=$($event.stage)"
    )
    if ($null -ne $symbol) { $parts += "symbol=$symbol" }
    if ($null -ne $address) { $parts += "address=$address" }
    if ($null -ne $success) { $parts += "success=$success" }
    if ($null -ne $unitsConsumed) { $parts += "unitsConsumed=$unitsConsumed" }
    if ($null -ne $lastValidBlockHeight) { $parts += "lastValidBlockHeight=$lastValidBlockHeight" }
    if ($null -ne $abortCode) { $parts += "abortCode=$abortCode" }

    Write-Host ("[AUDIT] {0}" -f ($parts -join " | "))
  } catch {
    Write-Host ("[AUDIT] {0}" -f $Line)
  }
}

function Write-Error-Line {
  param([Parameter(Mandatory = $true)][string]$Line)

  try {
    $event = $Line | ConvertFrom-Json
    $timestamp = First-Value @($event.timestamp, $event.time, $event.createdAt)
    $code = First-Value @($event.code, $event.abortCode, $event.errorCode)
    $stage = First-Value @($event.stage)
    $message = First-Value @($event.message, $event.error, $event.reason)
    $parts = @()
    if ($null -ne $timestamp) { $parts += "timestamp=$timestamp" }
    if ($null -ne $code) { $parts += "code=$code" }
    if ($null -ne $stage) { $parts += "stage=$stage" }
    if ($null -ne $message) { $parts += "message=$message" }
    if ($parts.Count -eq 0) { throw "No friendly fields found" }
    Write-Host ("[ERROR] {0}" -f ($parts -join " | "))
  } catch {
    Write-Host ("[ERROR] {0}" -f $Line)
  }
}

Write-Banner
Initialize-Position -Path $AuditPath
Initialize-Position -Path $ErrorsPath
Write-Host ""
Write-Host "Polling every $PollSeconds seconds. Press Ctrl+C to stop."
Write-Host ""

try {
  while ($true) {
    foreach ($line in (Read-NewLines -Path $AuditPath)) {
      if (Should-Print-Audit -Line $line) {
        Write-Audit-Line -Line $line
      }
    }

    foreach ($line in (Read-NewLines -Path $ErrorsPath)) {
      if (Should-Print-Error -Line $line) {
        Write-Error-Line -Line $line
      }
    }

    Start-Sleep -Seconds $PollSeconds
  }
} finally {
  Write-Host ""
  Write-Host "FOMO Real Pipeline Watcher stopped."
}
