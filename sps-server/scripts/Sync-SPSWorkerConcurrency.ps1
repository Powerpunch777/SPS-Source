[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$SPSBaseUrl = "http://127.0.0.1:3100",
  [string]$RoleMapPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "agent-instructions\agent-role-map.json"),
  [int]$CliMaxConcurrentRuns = 3,
  [int]$ApiMaxConcurrentRuns = 4,
  [int]$LocalAiMaxConcurrentRuns = 1
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $RoleMapPath -PathType Leaf)) {
  throw "The Agent role map was not found: $RoleMapPath"
}
foreach ($value in @($CliMaxConcurrentRuns, $ApiMaxConcurrentRuns, $LocalAiMaxConcurrentRuns)) {
  if ($value -lt 1 -or $value -gt 50) {
    throw "Worker concurrency values must be between 1 and 50."
  }
}

$roleMap = Get-Content -Raw -Encoding UTF8 -LiteralPath $RoleMapPath | ConvertFrom-Json
$companyId = [string]$roleMap.companyId
$baseUrl = $SPSBaseUrl.TrimEnd('/')
$rawAgents = Invoke-RestMethod -Uri "$baseUrl/api/companies/$companyId/agents" -Method Get -TimeoutSec 10
$liveAgents = @($rawAgents | ForEach-Object { $_ })
$liveById = @{}
foreach ($agent in $liveAgents) { $liveById[[string]$agent.id] = $agent }

$limits = @{
  cli = $CliMaxConcurrentRuns
  api = $ApiMaxConcurrentRuns
  local_ai = $LocalAiMaxConcurrentRuns
}
$results = @()

foreach ($entry in @($roleMap.agents | Where-Object { [string]$_.role -match "-worker$" })) {
  $agent = $liveById[[string]$entry.id]
  if ($null -eq $agent) { throw "Mapped Worker is not available: $($entry.name) [$($entry.id)]" }
  $executionClass = [string]$entry.executionClass
  if (-not $limits.ContainsKey($executionClass)) {
    throw "Worker $($entry.name) needs executionClass cli, api, or local_ai in agent-role-map.json."
  }

  $runtimeConfig = [ordered]@{}
  if ($agent.runtimeConfig) {
    foreach ($property in $agent.runtimeConfig.PSObject.Properties) {
      $runtimeConfig[$property.Name] = $property.Value
    }
  }
  $heartbeat = [ordered]@{}
  if ($runtimeConfig.heartbeat) {
    foreach ($property in $runtimeConfig.heartbeat.PSObject.Properties) {
      $heartbeat[$property.Name] = $property.Value
    }
  }
  $desired = [int]$limits[$executionClass]
  $current = if ($null -ne $heartbeat.maxConcurrentRuns) { [int]$heartbeat.maxConcurrentRuns } else { 0 }
  $heartbeat.maxConcurrentRuns = $desired
  $runtimeConfig.heartbeat = $heartbeat
  $changed = $current -ne $desired

  if ($changed -and $PSCmdlet.ShouldProcess("$($agent.name) [$($agent.id)]", "Set $executionClass Worker concurrency to $desired")) {
    $payload = @{ runtimeConfig = $runtimeConfig } | ConvertTo-Json -Depth 30
    $body = [System.Text.Encoding]::UTF8.GetBytes($payload)
    Invoke-RestMethod -Uri "$baseUrl/api/agents/$($agent.id)" -Method Patch -ContentType "application/json; charset=utf-8" -Body $body -TimeoutSec 15 | Out-Null
  }

  $results += [pscustomobject]@{
    id = [string]$agent.id
    name = [string]$agent.name
    executionClass = $executionClass
    previousMaxConcurrentRuns = $current
    maxConcurrentRuns = $desired
    changed = $changed
  }
}

[pscustomobject]@{
  companyId = $companyId
  checkedCount = $results.Count
  updatedCount = @($results | Where-Object changed).Count
  agents = $results
}
