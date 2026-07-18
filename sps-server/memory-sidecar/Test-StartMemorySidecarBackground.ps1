$ErrorActionPreference = "Stop"
$scriptPath = Join-Path $PSScriptRoot "Start-MemorySidecarBackground.ps1"
$content = Get-Content -Raw -LiteralPath $scriptPath

if (-not (Get-Command $scriptPath -Syntax)) {
  throw "Sidecar launcher syntax check failed."
}
if ($content -notmatch 'Invoke-CimMethod\s+-ClassName\s+Win32_Process\s+-MethodName\s+Create') {
  throw "Sidecar launcher is missing the detached direct process launch contract."
}
if ($content -notmatch '"--config"') {
  throw "Sidecar launcher is missing the explicit config argument."
}
foreach ($forbidden in @('powershell' + '.exe', 'cmd' + '.exe', 'Invoke' + '-' + 'Expression')) {
  if ($content -match [regex]::Escape($forbidden)) {
    throw "Sidecar launcher contains forbidden shell launch construct: $forbidden"
  }
}
if ($content -match '>[[:space:]]') {
  throw "Sidecar launcher contains shell redirection syntax."
}

Write-Output "SUCCESS: Sidecar launcher uses direct node arguments without shell interpretation."
