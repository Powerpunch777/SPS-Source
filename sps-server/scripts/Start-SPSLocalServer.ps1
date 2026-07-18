param(
  [string]$CatalogPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "config\\sps-adapter-models.json"),
  [string]$LogPath = (Join-Path $env:USERPROFILE ".sps\\instances\\default\\logs\\run-task.log"),
  [string]$CorePath = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "external\sps-core"),
  [string]$InstanceId = "default",
  [string]$SPSConfigPath = (Join-Path $env:USERPROFILE ".sps\instances\default\config.json"),
  [switch]$UseRegistryPackage,
  # AGENTS.md is managed from Agent Configuration. The historical file sync is
  # an explicit migration/repair action, never a normal service-start side effect.
  [switch]$EnableAgentInstructionSync,
  [switch]$SkipAgentInstructionSync
)

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
try {
  [Console]::InputEncoding = $utf8NoBom
  [Console]::OutputEncoding = $utf8NoBom
} catch {
  # Scheduled tasks may start without an attached console.
}
$OutputEncoding = $utf8NoBom

$ErrorActionPreference = "Stop"
$env:PAPERCLIP_HOME = Join-Path $env:USERPROFILE ".sps"

if ($EnableAgentInstructionSync -and $SkipAgentInstructionSync) {
  throw "EnableAgentInstructionSync and SkipAgentInstructionSync cannot be used together."
}

# The Workplane uses the built UI bundle. The SPS CLI otherwise enables
# Vite middleware automatically for a source checkout, which can stall the API
# process during long-running browser sessions.
$env:PAPERCLIP_UI_DEV_MIDDLEWARE = "false"
$env:PAPERCLIP_WORKPLANE_MODE = "true"

if ($EnableAgentInstructionSync -and -not $SkipAgentInstructionSync) {
  $instructionSync = Join-Path $PSScriptRoot "Sync-SPSCompanyInstructions.ps1"
  if (-not (Test-Path -LiteralPath $instructionSync -PathType Leaf)) {
    throw "SPS Agent instruction synchronizer was not found: $instructionSync"
  }
  $instructionState = & $instructionSync
  Write-Output "[sps] Synchronized company contract for $($instructionState.checkedCount) Agent instructions; changed $($instructionState.updatedCount)."
}

$catalogSync = Join-Path $PSScriptRoot "Sync-SPSAdapterModelCatalog.ps1"
if (-not (Test-Path -LiteralPath $catalogSync -PathType Leaf)) {
  throw "SPS adapter model catalog synchronizer was not found: $catalogSync"
}

$catalogState = & $catalogSync -CatalogPath $CatalogPath
New-Item -ItemType Directory -Path (Split-Path -Parent $LogPath) -Force | Out-Null

Write-Output "[sps] Loaded Codex model catalog: $($catalogState.modelCount) entries."

if ($UseRegistryPackage) {
  $utf8Compatibility = Join-Path $PSScriptRoot "Apply-SPSUtf8StreamCompatibility.ps1"
  if (-not (Test-Path -LiteralPath $utf8Compatibility -PathType Leaf)) {
    throw "SPS UTF-8 stream compatibility script was not found: $utf8Compatibility"
  }
  $utf8CompatibilityState = & $utf8Compatibility
  if ($utf8CompatibilityState.status -eq "not_applicable") {
    Write-Warning "[sps] UTF-8 stream compatibility was not applied: $($utf8CompatibilityState.reason)"
  } else {
    Write-Output "[sps] UTF-8 stream compatibility: $($utf8CompatibilityState.status)."
  }

  $codexAccountConfig = Join-Path $PSScriptRoot "Enable-SPSCodexAccountConfiguration.ps1"
  if (-not (Test-Path -LiteralPath $codexAccountConfig -PathType Leaf)) {
    throw "SPS Codex account configuration enabler was not found: $codexAccountConfig"
  }
  & $codexAccountConfig

  Write-Warning "[sps] Starting the registry fallback. Workplane core contracts may be unavailable."
  Set-Location $env:USERPROFILE
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    # Windows PowerShell represents any native stderr line as an ErrorRecord.
    # npm warnings are non-fatal, so decide success from the process exit code.
    $ErrorActionPreference = "Continue"
    & npx.cmd --yes --registry https://registry.npmjs.org paperclipai run --instance $InstanceId --config $SPSConfigPath *>> $LogPath
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  exit $exitCode
}

$corePackage = Join-Path $CorePath "package.json"
$coreCli = Join-Path $CorePath "cli\src\index.ts"
foreach ($requiredPath in @($corePackage, $coreCli)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "SPS local core is incomplete: $requiredPath"
  }
}

Write-Output "[sps] Starting Workplane core from: $CorePath"
Write-Output "[sps] UTF-8 streaming and Codex account selection are built into the local core."
Write-Output "[sps] Serving the built UI in Workplane mode."
Push-Location $CorePath
try {
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    # pnpm/npm may emit warnings on stderr while continuing successfully.
    $ErrorActionPreference = "Continue"
    & npx.cmd --yes pnpm@9.15.4 run paperclipai run --instance $InstanceId --config $SPSConfigPath *>> $LogPath
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
} finally {
  Pop-Location
}
exit $exitCode
