<#
.SYNOPSIS
  Read-only detector for Paperclip plugin secret-reference support.
.DESCRIPTION
  Locates the active local Paperclip server package when possible and reports
  whether its fail-closed plugin secret-ref gate is still present. This script
  never writes files, starts processes, reads secret values, or enables Direct
  Task execution. A missing gate is only a review signal, never authorization.
#>
param(
  [string]$ServerRoot,
  [switch]$AsMarkdown
)

$ErrorActionPreference = "Stop"

function Resolve-PaperclipServerRoot {
  param([string]$ExplicitServerRoot)

  if ($ExplicitServerRoot) {
    if (-not (Test-Path -LiteralPath $ExplicitServerRoot -PathType Container)) {
      throw "ServerRoot does not exist: $ExplicitServerRoot"
    }
    return (Resolve-Path -LiteralPath $ExplicitServerRoot).Path
  }

  $nodeProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue)
  foreach ($process in $nodeProcesses) {
    $commandLine = [string]$process.CommandLine
    $match = [regex]::Match($commandLine, '"(?<entry>[A-Za-z]:\\[^\"]+?\\node_modules\\(?:\.bin\\\.\.\\)?paperclipai\\dist\\index\.js)"', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $match.Success) {
      continue
    }

    $entryPath = $match.Groups['entry'].Value
    if (-not (Test-Path -LiteralPath $entryPath -PathType Leaf)) {
      continue
    }

    $resolvedEntry = (Resolve-Path -LiteralPath $entryPath).Path
    $cliRoot = Split-Path -Parent (Split-Path -Parent $resolvedEntry)
    $nodeModulesRoot = Split-Path -Parent $cliRoot
    $candidate = Join-Path $nodeModulesRoot '@paperclipai\server'
    if (Test-Path -LiteralPath $candidate -PathType Container) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  $cacheRoot = Join-Path $env:LOCALAPPDATA 'npm-cache\_npx'
  if (Test-Path -LiteralPath $cacheRoot -PathType Container) {
    $fallbacks = @(
      Get-ChildItem -LiteralPath $cacheRoot -Directory -ErrorAction SilentlyContinue |
        ForEach-Object {
          $candidate = Join-Path $_.FullName 'node_modules\@paperclipai\server'
          if (Test-Path -LiteralPath $candidate -PathType Container) {
            Get-Item -LiteralPath $candidate
          }
        } |
        Sort-Object LastWriteTime -Descending
    )
    if ($fallbacks.Count -gt 0) {
      return $fallbacks[0].FullName
    }
  }

  throw 'Could not locate an active or cached Paperclip server package.'
}

$resolvedServerRoot = Resolve-PaperclipServerRoot -ExplicitServerRoot $ServerRoot
$packagePath = Join-Path $resolvedServerRoot 'package.json'
$handlerPath = Join-Path $resolvedServerRoot 'dist\services\plugin-secrets-handler.js'
$pluginConfigSchemaPath = Join-Path (Split-Path -Parent (Split-Path -Parent $resolvedServerRoot)) '@paperclipai\db\dist\schema\plugin_config.js'

foreach ($requiredPath in @($packagePath, $handlerPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Required Paperclip runtime file is missing: $requiredPath"
  }
}

$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
$handlerSource = Get-Content -LiteralPath $handlerPath -Raw
$configSchemaSource = if (Test-Path -LiteralPath $pluginConfigSchemaPath -PathType Leaf) {
  Get-Content -LiteralPath $pluginConfigSchemaPath -Raw
} else {
  ''
}

$disabledMarker = 'Plugin secret references are disabled until company-scoped plugin config lands'
$disabledMarkerPresent = $handlerSource.Contains($disabledMarker)
$companyScopedConfigSchemaDetected = $configSchemaSource -match 'companyId|company_id'

$gateStatus = if ($disabledMarkerPresent) { 'blocked' } else { 'review_required' }
$requiredAction = if ($disabledMarkerPresent) {
  'Keep Direct Task disabled and continue using direct external agy.exe Task Room runners.'
} else {
  'Do not enable Direct Task automatically. Review Paperclip release notes, runtime behavior, bindings, and cross-company regression coverage first.'
}

$result = [pscustomobject]@{
  serverRoot = $resolvedServerRoot
  serverVersion = [string]$package.version
  gateStatus = $gateStatus
  disabledMarkerPresent = $disabledMarkerPresent
  companyScopedConfigSchemaDetected = $companyScopedConfigSchemaDetected
  automaticActivationAllowed = $false
  requiredAction = $requiredAction
}

if ($AsMarkdown) {
  $lines = @(
    '# Paperclip Plugin Secret-Ref Capability Report',
    '',
    "- **Server Version:** $($result.serverVersion)",
    "- **Gate Status:** $($result.gateStatus)",
    "- **Fail-Closed Marker Present:** $($result.disabledMarkerPresent)",
    "- **Company-Scoped Config Schema Detected:** $($result.companyScopedConfigSchemaDetected)",
    '- **Automatic Activation Allowed:** False',
    "- **Required Action:** $($result.requiredAction)"
  )
  $lines -join "`n"
} else {
  $result
}
