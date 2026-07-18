$ErrorActionPreference = "Stop"

$scheduledLauncher = Join-Path $PSScriptRoot "Start-SPSScheduled.ps1"
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("paperclip-scheduled-start-" + [guid]::NewGuid().ToString())
$utf8NoBom = [Text.UTF8Encoding]::new($false)
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
  $counterPath = Join-Path $tempRoot "counter.txt"
  $fakeLauncher = Join-Path $tempRoot "fake-launcher.ps1"
  $resultPath = Join-Path $tempRoot "result.json"
  $fakeSource = @'
param([int]$TimeoutSec)
$counterPath = Join-Path $PSScriptRoot "counter.txt"
$count = if (Test-Path -LiteralPath $counterPath) { [int](Get-Content -LiteralPath $counterPath -Raw) } else { 0 }
$count++
[IO.File]::WriteAllText($counterPath, [string]$count, [Text.UTF8Encoding]::new($false))
if ($count -eq 1) { return [pscustomobject]@{ ready = $false; attempt = $count; timeout = $TimeoutSec } }
return [pscustomobject]@{ ready = $true; attempt = $count; timeout = $TimeoutSec }
'@
  [IO.File]::WriteAllText($fakeLauncher, $fakeSource, $utf8NoBom)

  & $scheduledLauncher -LauncherPath $fakeLauncher -ResultPath $resultPath -StartupDelaySec 0 -RetryDelaySec 0 -TimeoutSec 30 -MaxAttempts 2
  if ($LASTEXITCODE -ne 0) { throw "Scheduled launcher should recover on its second startup attempt." }
  $record = Get-Content -LiteralPath $resultPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not $record.ok -or @($record.attempts).Count -ne 2 -or $record.result.attempt -ne 2 -or $record.result.timeout -ne 30) {
    throw "Scheduled launcher retry record was invalid: $($record | ConvertTo-Json -Depth 8 -Compress)"
  }
  Write-Host "Scheduled Workplane startup retry test passed."
} finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
