param(
  [string]$SourceRoot = (Join-Path $PSScriptRoot "..\.agent-runtime-packs"),
  [string]$DistRoot = (Join-Path $PSScriptRoot "..\dist")
)

$ErrorActionPreference = "Stop"

function Assert-SafeSegment([string]$Value, [string]$Label) {
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value -notmatch "^[A-Za-z0-9][A-Za-z0-9._-]*$") {
    throw "Agent Runtime pack $Label is invalid."
  }
}

if (-not (Test-Path -LiteralPath $SourceRoot -PathType Container)) {
  throw "Agent Runtime pack source directory was not found: $SourceRoot"
}

New-Item -ItemType Directory -Force -Path $DistRoot | Out-Null
$catalog = [ordered]@{
  schemaVersion = 1
  packs = @()
}

Get-ChildItem -LiteralPath $SourceRoot -Directory | ForEach-Object {
  $idDirectory = $_
  Get-ChildItem -LiteralPath $idDirectory.FullName -Directory | ForEach-Object {
    $packRoot = $_.FullName
    $manifestPath = Join-Path $packRoot "sps-agent-runtime-pack.json"
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
      return
    }

    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
    Assert-SafeSegment $manifest.id "id"
    Assert-SafeSegment $manifest.version "version"
    if (-not $manifest.commands -or @($manifest.commands.psobject.Properties).Count -eq 0) {
      throw "Agent Runtime pack $($manifest.id) does not declare a command."
    }

    $archiveName = "SPS-Agent-Runtime-Pack-$($manifest.id)-$($manifest.version).zip"
    $archivePath = Join-Path $DistRoot $archiveName
    Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
    Compress-Archive -Path (Join-Path $packRoot "*") -DestinationPath $archivePath -CompressionLevel Optimal

    $catalog.packs += [ordered]@{
      id = $manifest.id
      label = if ($manifest.label) { $manifest.label } else { $manifest.id }
      version = $manifest.version
      commands = @($manifest.commands.psobject.Properties.Name | Sort-Object)
      archive = $archiveName
      sizeBytes = (Get-Item -LiteralPath $archivePath).Length
      sha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }
}

$catalog.packs = @($catalog.packs | Sort-Object id, version)
$catalogPath = Join-Path $DistRoot "sps-agent-runtime-packs.json"
$catalogJson = $catalog | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($catalogPath, $catalogJson + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "Archived $($catalog.packs.Count) SPS Agent Runtime packs: $catalogPath"
