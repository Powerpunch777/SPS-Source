[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$TemplatePath = (Join-Path (Split-Path -Parent $PSScriptRoot) "config\agy-agent-prompt-template.txt"),
  [string]$SPSBaseUrl = "http://127.0.0.1:3100",
  [string]$RoleMapPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "agent-instructions\agent-role-map.json"),
  [string]$CompanyId,
  [string]$PrintTimeout = "2h"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $TemplatePath -PathType Leaf)) {
  throw "Agy prompt template was not found: $TemplatePath"
}

if (-not (Test-Path -LiteralPath $RoleMapPath -PathType Leaf)) {
  throw "The Agent role map was not found: $RoleMapPath"
}
$roleMap = Get-Content -Raw -Encoding UTF8 -LiteralPath $RoleMapPath | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace($CompanyId)) {
  $CompanyId = [string]$roleMap.companyId
}

if ([string]::IsNullOrWhiteSpace($CompanyId)) {
  throw "A SPS CompanyId is required."
}

if ([string]::IsNullOrWhiteSpace($PrintTimeout)) {
  throw "Agy print timeout must not be empty."
}

$template = (Get-Content -Raw -Encoding UTF8 -LiteralPath $TemplatePath).Trim()
$requiredMarkers = @(
  "{{agent.adapterConfig.instructionsFilePath}}",
  "{{context.spsTaskMarkdown}}",
  "{{context.spsWake.comments}}"
)
foreach ($marker in $requiredMarkers) {
  if (-not $template.Contains($marker)) {
    throw "Agy prompt template is missing required marker: $marker"
  }
}

$baseUrl = $SPSBaseUrl.TrimEnd('/')
$agentsUri = "$baseUrl/api/companies/$CompanyId/agents"
$rawAgents = Invoke-RestMethod -Uri $agentsUri -Method Get -TimeoutSec 10
$workerAgentIds = @(
  $roleMap.agents |
    Where-Object { [string]$_.role -match "-worker$" } |
    ForEach-Object { [string]$_.id }
)
$agents = @(
  $rawAgents |
    ForEach-Object { $_ } |
    Where-Object { $workerAgentIds -contains [string]$_.id -and $_.status -notin @("terminated", "deleted") }
)

$results = @()
foreach ($agent in $agents) {
  $adapterConfig = [ordered]@{}
  if ($agent.adapterConfig) {
    foreach ($property in $agent.adapterConfig.PSObject.Properties) {
      $adapterConfig[$property.Name] = $property.Value
    }
  }
  $current = [string]$adapterConfig.promptTemplate
  $promptChanged = $current -cne $template
  $adapterConfig.promptTemplate = $template

  $existingExtraArgs = @($adapterConfig.extraArgs | ForEach-Object { [string]$_ })
  $preservedExtraArgs = @()
  for ($index = 0; $index -lt $existingExtraArgs.Count; $index++) {
    $argument = [string]$existingExtraArgs[$index]
    if ($argument -eq "--print-timeout") {
      if ($index + 1 -lt $existingExtraArgs.Count) {
        $index += 1
      }
      continue
    }
    if ($argument.StartsWith("--print-timeout=", [System.StringComparison]::Ordinal)) {
      continue
    }
    $preservedExtraArgs += $argument
  }
  $desiredExtraArgs = @($preservedExtraArgs) + @("--print-timeout", $PrintTimeout)
  $existingExtraArgsJson = ConvertTo-Json -InputObject @($existingExtraArgs) -Compress
  $desiredExtraArgsJson = ConvertTo-Json -InputObject @($desiredExtraArgs) -Compress
  $extraArgsChanged = $existingExtraArgsJson -cne $desiredExtraArgsJson
  $adapterConfig.extraArgs = $desiredExtraArgs
  $changed = $promptChanged -or $extraArgsChanged

  if ($changed -and $PSCmdlet.ShouldProcess("$($agent.name) [$($agent.id)]", "Set update-safe Worker prompt and Agy print timeout")) {
    $payload = @{
      adapterConfig = $adapterConfig
      replaceAdapterConfig = $true
    } | ConvertTo-Json -Depth 30
    $body = [System.Text.Encoding]::UTF8.GetBytes($payload)
    Invoke-RestMethod -Uri "$baseUrl/api/agents/$($agent.id)" -Method Patch -ContentType "application/json; charset=utf-8" -Body $body -TimeoutSec 15 | Out-Null
  }

  $results += [pscustomobject]@{
    id = [string]$agent.id
    name = [string]$agent.name
    changed = $changed
    promptChanged = $promptChanged
    printTimeoutChanged = $extraArgsChanged
    printTimeout = $PrintTimeout
  }
}

[pscustomobject]@{
  companyId = $CompanyId
  templatePath = $TemplatePath
  printTimeout = $PrintTimeout
  checkedCount = $results.Count
  updatedCount = @($results | Where-Object changed).Count
  agents = $results
}
