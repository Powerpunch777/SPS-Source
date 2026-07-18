param(
  [string]$ResultPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "logs\sps-startup.json"),
  [string]$LauncherPath = (Join-Path $PSScriptRoot "Start-SPS.ps1"),
  [ValidateRange(30, 300)]
  [int]$TimeoutSec = 90,
  [ValidateRange(0, 120)]
  [int]$StartupDelaySec = 8,
  [ValidateRange(1, 3)]
  [int]$MaxAttempts = 2,
  [ValidateRange(0, 120)]
  [int]$RetryDelaySec = 15
)

$ErrorActionPreference = "Stop"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
try {
  [Console]::InputEncoding = $utf8NoBom
  [Console]::OutputEncoding = $utf8NoBom
} catch {
  # Task Scheduler may run without an attached console.
}
$OutputEncoding = $utf8NoBom

$resultDirectory = Split-Path -Parent $ResultPath
New-Item -ItemType Directory -Path $resultDirectory -Force | Out-Null
$launcher = (Resolve-Path -LiteralPath $LauncherPath -ErrorAction Stop).Path

try {
  if ($StartupDelaySec -gt 0) {
    Start-Sleep -Seconds $StartupDelaySec
  }
  $attempts = @()
  $result = $null
  $lastError = $null
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      $candidate = & $launcher -TimeoutSec $TimeoutSec
      $attempts += [ordered]@{
        number = $attempt
        completedAt = (Get-Date).ToUniversalTime().ToString("o")
        ready = [bool]$candidate.ready
        error = $null
      }
      if ($candidate.ready) {
        $result = $candidate
        break
      }
      $lastError = "Workplane bootstrap returned not ready."
    } catch {
      $lastError = $_.Exception.Message
      $attempts += [ordered]@{
        number = $attempt
        completedAt = (Get-Date).ToUniversalTime().ToString("o")
        ready = $false
        error = $lastError
      }
    }
    if ($attempt -lt $MaxAttempts -and $RetryDelaySec -gt 0) {
      Start-Sleep -Seconds $RetryDelaySec
    }
  }
  if ($null -eq $result) {
    if ([string]::IsNullOrWhiteSpace($lastError)) {
      $lastError = "Workplane bootstrap did not become ready."
    }
    throw $lastError
  }
  $record = [ordered]@{
    ok = $true
    completedAt = (Get-Date).ToUniversalTime().ToString("o")
    result = $result
    attempts = $attempts
    error = $null
  }
  [IO.File]::WriteAllText($ResultPath, ($record | ConvertTo-Json -Depth 20), $utf8NoBom)
  exit 0
} catch {
  $record = [ordered]@{
    ok = $false
    completedAt = (Get-Date).ToUniversalTime().ToString("o")
    result = $null
    attempts = if ($attempts) { $attempts } else { @() }
    error = $_.Exception.Message
  }
  [IO.File]::WriteAllText($ResultPath, ($record | ConvertTo-Json -Depth 20), $utf8NoBom)
  exit 1
}
