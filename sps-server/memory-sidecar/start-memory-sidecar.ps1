$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $scriptDir "config.local.json"
$serverPath = Join-Path $scriptDir "memory-sidecar.mjs"

if (-not (Test-Path $configPath)) {
  throw "Missing config.local.json. Copy config.example.json to config.local.json and adjust paths."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required to run the memory sidecar."
}

$env:MEMORY_SIDECAR_CONFIG = $configPath
node $serverPath
