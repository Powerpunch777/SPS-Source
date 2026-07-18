param(
  [string]$CatalogPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "config\\sps-adapter-models.json")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $CatalogPath -PathType Leaf)) {
  throw "SPS adapter model catalog was not found: $CatalogPath"
}

$catalogJson = Get-Content -LiteralPath $CatalogPath -Raw
$catalog = $catalogJson | ConvertFrom-Json
$codexModels = @($catalog.codex_local)

if ($codexModels.Count -eq 0 -or @($codexModels | Where-Object { $_.id -match '^gpt-5\.6-(sol|terra|luna)$' }).Count -eq 0) {
  throw "SPS adapter model catalog must define at least one GPT-5.6 Codex model."
}

if (@($codexModels | Where-Object { [string]::IsNullOrWhiteSpace([string]$_.id) }).Count -gt 0) {
  throw "SPS adapter model catalog contains an entry without an id."
}

$env:PAPERCLIP_ADAPTER_MODELS = $catalogJson
[Environment]::SetEnvironmentVariable("PAPERCLIP_ADAPTER_MODELS", $catalogJson, "User")

return [pscustomobject]@{
  catalogPath = $CatalogPath
  adapterType = "codex_local"
  modelCount = $codexModels.Count
  persistedScope = "User"
}
