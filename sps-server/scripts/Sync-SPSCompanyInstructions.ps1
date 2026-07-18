[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$SourceRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) "agent-instructions"),
  [string]$SPSBaseUrl = "http://127.0.0.1:3100",
  [string]$SPSInstanceRoot = (Join-Path $env:USERPROFILE ".sps\instances\default"),
  [switch]$ResetRoleSections,
  [switch]$RequireApi,
  [string]$BackupRoot = (Join-Path $env:LOCALAPPDATA "SPS\instruction-backups")
)

$ErrorActionPreference = "Stop"
$beginMarker = "<!-- BEGIN PAPERCLIP COMPANY CONTRACT -->"
$endMarker = "<!-- END PAPERCLIP COMPANY CONTRACT -->"
$utf8Bom = [System.Text.UTF8Encoding]::new($true)

function Test-HasUtf8Bom {
  param([string]$Path)

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  return $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
}

function Test-IsCompanyStaffAgent {
  param([object]$Agent)

  if ($null -eq $Agent -or [string]::IsNullOrWhiteSpace([string]$Agent.id)) { return $false }
  if ($Agent.status -in @("terminated", "deleted")) { return $false }
  if ($null -eq $Agent.metadata) { return $true }
  return $null -eq $Agent.metadata.spsBuiltInAgent
}

$mapPath = Join-Path $SourceRoot "agent-role-map.json"
$contractPath = Join-Path $SourceRoot "COMPANY_CONTRACT.md"
if (-not (Test-Path -LiteralPath $mapPath -PathType Leaf)) {
  throw "Agent role map was not found: $mapPath"
}
if (-not (Test-Path -LiteralPath $contractPath -PathType Leaf)) {
  throw "Company contract was not found: $contractPath"
}

$roleMap = Get-Content -Raw -Encoding UTF8 -LiteralPath $mapPath | ConvertFrom-Json
$companyId = [string]$roleMap.companyId
if ([string]::IsNullOrWhiteSpace($companyId)) {
  throw "companyId is missing from $mapPath"
}

$entriesById = @{}
foreach ($entry in @($roleMap.agents)) {
  if ($entriesById.ContainsKey([string]$entry.id)) {
    throw "Duplicate Agent ID in role map: $($entry.id)"
  }
  $entriesById[[string]$entry.id] = $entry
}

$agentRoot = Join-Path $SPSInstanceRoot "companies\$companyId\agents"
$apiUri = "$($SPSBaseUrl.TrimEnd('/'))/api/companies/$companyId/agents"
$apiAvailable = $true
try {
  $agentResponse = Invoke-RestMethod -Uri $apiUri -Method Get -TimeoutSec 5
  $allAgents = @($agentResponse)
  $activeAgents = @($allAgents | Where-Object { Test-IsCompanyStaffAgent $_ })
}
catch {
  $apiAvailable = $false
  if ($RequireApi) {
    throw "SPS Agent API is unavailable at $apiUri. $($_.Exception.Message)"
  }
  Write-Warning "SPS Agent API is unavailable. Falling back to mapped Agent folders."
  $activeAgents = @($roleMap.agents | ForEach-Object {
    [pscustomobject]@{ id = $_.id; name = $_.name; status = "unknown" }
  })
}

$activeIds = @($activeAgents | ForEach-Object { [string]$_.id })
$unmapped = @($activeAgents | Where-Object { -not $entriesById.ContainsKey([string]$_.id) })
if ($unmapped.Count -gt 0) {
  $details = $unmapped | ForEach-Object { "$($_.name) [$($_.id)]" }
  throw "Active Agents are missing from agent-role-map.json: $($details -join ', ')"
}

$contract = (Get-Content -Raw -Encoding UTF8 -LiteralPath $contractPath).Trim()
$newline = [Environment]::NewLine
$backupRunRoot = Join-Path $BackupRoot (Get-Date -Format "yyyyMMdd-HHmmss")
$backupCreated = $false
$results = @()

foreach ($agent in $activeAgents) {
  $agentId = [string]$agent.id
  $entry = $entriesById[$agentId]
  $profileId = [string]$entry.profile
  $roleId = [string]$entry.role
  if ($profileId -notin @("task-owner", "worker")) {
    throw "Invalid or missing profile for $($entry.name): '$profileId'"
  }
  $profilePath = Join-Path $SourceRoot "profiles\$profileId.md"
  $rolePath = Join-Path $SourceRoot "roles\$roleId.md"
  if (-not (Test-Path -LiteralPath $profilePath -PathType Leaf)) {
    throw "Profile template was not found for $($entry.name): $profilePath"
  }
  if (-not (Test-Path -LiteralPath $rolePath -PathType Leaf)) {
    throw "Role template was not found for $($entry.name): $rolePath"
  }

  $profileContent = (Get-Content -Raw -Encoding UTF8 -LiteralPath $profilePath).Trim()
  $managedBlock = @($beginMarker, $contract, "", $profileContent, $endMarker) -join $newline

  $instructionPath = Join-Path $agentRoot "$agentId\instructions\AGENTS.md"
  if (-not (Test-Path -LiteralPath $instructionPath -PathType Leaf)) {
    throw "Instructions file was not found for $($entry.name): $instructionPath"
  }

  $current = Get-Content -Raw -Encoding UTF8 -LiteralPath $instructionPath
  if ($ResetRoleSections) {
    $roleContent = (Get-Content -Raw -Encoding UTF8 -LiteralPath $rolePath).Trim()
    $updated = $managedBlock + $newline + $newline + $roleContent + $newline
  }
  else {
    $pattern = [regex]::Escape($beginMarker) + ".*?" + [regex]::Escape($endMarker)
    $regex = [regex]::new($pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
    $matches = $regex.Matches($current)
    if ($matches.Count -ne 1) {
      throw "Expected exactly one managed company contract in $instructionPath, found $($matches.Count). Run once with -ResetRoleSections."
    }
    $updated = $regex.Replace($current, [System.Text.RegularExpressions.MatchEvaluator]{
      param($match)
      return $managedBlock
    }, 1)
  }

  # Windows PowerShell otherwise treats UTF-8 without a BOM as ANSI, which
  # garbles Korean instructions when a local CLI reads AGENTS.md by default.
  $changed = $current -cne $updated -or -not (Test-HasUtf8Bom -Path $instructionPath)
  if ($changed -and $PSCmdlet.ShouldProcess($instructionPath, "Update SPS Agent instructions")) {
    if (-not $backupCreated) {
      New-Item -ItemType Directory -Path $backupRunRoot -Force | Out-Null
      $backupCreated = $true
    }
    Copy-Item -LiteralPath $instructionPath -Destination (Join-Path $backupRunRoot "$agentId-AGENTS.md") -Force
    [System.IO.File]::WriteAllText($instructionPath, $updated, $utf8Bom)
  }

  $actualName = if ($agent.name) { [string]$agent.name } else { [string]$entry.name }
  if ($apiAvailable -and $actualName -cne [string]$entry.name) {
    Write-Warning "Agent name changed for ${agentId}: map='$($entry.name)', live='$actualName'. The ID-based role mapping remains valid."
  }
  $results += [pscustomobject]@{
    id = $agentId
    name = $actualName
    profile = $profileId
    role = $roleId
    changed = $changed
    path = $instructionPath
  }
}

$inactiveMapped = @($roleMap.agents | Where-Object { $activeIds -notcontains [string]$_.id })
foreach ($entry in $inactiveMapped) {
  Write-Warning "Mapped Agent is not active: $($entry.name) [$($entry.id)]"
}

[pscustomobject]@{
  companyId = $companyId
  apiAvailable = $apiAvailable
  resetRoleSections = [bool]$ResetRoleSections
  updatedCount = @($results | Where-Object changed).Count
  checkedCount = $results.Count
  backupPath = if ($backupCreated) { $backupRunRoot } else { $null }
  agents = $results
}
