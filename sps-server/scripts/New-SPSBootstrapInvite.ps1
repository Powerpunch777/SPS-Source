[CmdletBinding()]
param(
  [string]$InstanceId = "default",
  [string]$SPSConfigPath = (Join-Path $env:USERPROFILE ".sps\instances\default\config.json")
)

$ErrorActionPreference = "Stop"
$env:PAPERCLIP_HOME = Join-Path $env:USERPROFILE ".sps"

$corePath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "external\sps-core"
if (-not (Test-Path -LiteralPath (Join-Path $corePath "package.json") -PathType Leaf)) {
  throw "SPS core was not found: $corePath"
}
if (-not (Test-Path -LiteralPath $SPSConfigPath -PathType Leaf)) {
  throw "SPS instance config was not found: $SPSConfigPath"
}

Push-Location $corePath
try {
  & npx.cmd --yes pnpm@9.15.4 run paperclipai -- auth bootstrap-ceo --instance $InstanceId --config $SPSConfigPath
  if ($LASTEXITCODE -ne 0) {
    throw "SPS bootstrap invite command failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}
