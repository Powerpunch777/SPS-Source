param(
  [string]$CorePath = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "external\sps-core"),
  [string]$BuildLogPath = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Get-LatestWriteTimeUtc {
  param([string[]]$Paths)

  $latest = [datetime]::MinValue
  foreach ($path in $Paths) {
    if (-not (Test-Path -LiteralPath $path)) { continue }
    $items = if ((Get-Item -LiteralPath $path).PSIsContainer) {
      Get-ChildItem -LiteralPath $path -Recurse -File -Force
    } else {
      Get-Item -LiteralPath $path
    }
    foreach ($item in $items) {
      if ($item.LastWriteTimeUtc -gt $latest) { $latest = $item.LastWriteTimeUtc }
    }
  }
  return $latest
}

$resolvedCorePath = (Resolve-Path -LiteralPath $CorePath).Path
$uiRoot = Join-Path $resolvedCorePath "ui"
$uiDist = Join-Path $uiRoot "dist"
$uiDistIndex = Join-Path $uiDist "index.html"
$serverUiDist = Join-Path $resolvedCorePath "server\ui-dist"
$serverUiDistIndex = Join-Path $serverUiDist "index.html"
$viteCommand = Join-Path $uiRoot "node_modules\.bin\vite.cmd"

foreach ($requiredPath in @($uiRoot, (Join-Path $uiRoot "src"), $viteCommand)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "SPS UI bundle prerequisite was not found: $requiredPath"
  }
}

$sourceLatest = Get-LatestWriteTimeUtc -Paths @(
  (Join-Path $uiRoot "src"),
  (Join-Path $uiRoot "index.html"),
  (Join-Path $uiRoot "package.json"),
  (Join-Path $uiRoot "vite.config.ts"),
  (Join-Path $uiRoot "tsconfig.json")
)
$uiDistLatest = if (Test-Path -LiteralPath $uiDistIndex -PathType Leaf) {
  (Get-Item -LiteralPath $uiDistIndex).LastWriteTimeUtc
} else {
  [datetime]::MinValue
}
$serverUiDistLatest = if (Test-Path -LiteralPath $serverUiDistIndex -PathType Leaf) {
  (Get-Item -LiteralPath $serverUiDistIndex).LastWriteTimeUtc
} else {
  [datetime]::MinValue
}

$built = $Force -or $sourceLatest -gt $uiDistLatest
if ($built) {
  Push-Location $uiRoot
  try {
    if ([string]::IsNullOrWhiteSpace($BuildLogPath)) {
      & $viteCommand build
    } else {
      New-Item -ItemType Directory -Path (Split-Path -Parent $BuildLogPath) -Force | Out-Null
      & $viteCommand build *>> $BuildLogPath
    }
    if ($LASTEXITCODE -ne 0) {
      throw "SPS UI production build failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path -LiteralPath $uiDistIndex -PathType Leaf)) {
  throw "SPS UI production output was not found: $uiDistIndex"
}

$uiDistLatest = (Get-Item -LiteralPath $uiDistIndex).LastWriteTimeUtc
$copied = $Force -or $built -or $uiDistLatest -gt $serverUiDistLatest
if ($copied) {
  $serverParent = (Resolve-Path -LiteralPath (Split-Path -Parent $serverUiDist)).Path
  if (-not $serverParent.StartsWith($resolvedCorePath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to synchronize the SPS UI outside the local core: $serverParent"
  }

  New-Item -ItemType Directory -Path $serverUiDist -Force | Out-Null
  # Vite hashes every generated asset. Copying the current output atomically at
  # file level keeps the currently running server intact until its verified restart.
  Copy-Item -Path (Join-Path $uiDist "*") -Destination $serverUiDist -Recurse -Force
}

return [pscustomobject]@{
  ready = $true
  built = [bool]$built
  copied = [bool]$copied
  sourceLatestUtc = $sourceLatest.ToString("o")
  uiDistLatestUtc = $uiDistLatest.ToString("o")
  serverUiDist = $serverUiDist
  buildLogPath = if ([string]::IsNullOrWhiteSpace($BuildLogPath)) { $null } else { $BuildLogPath }
}
