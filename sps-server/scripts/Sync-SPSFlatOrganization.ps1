param(
  [string]$SPSBaseUrl = "http://127.0.0.1:3100",
  [string]$RoleMapPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "agent-instructions\agent-role-map.json")
)

$ErrorActionPreference = "Stop"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$baseUrl = $SPSBaseUrl.TrimEnd('/')

function Invoke-SPSGet {
  param([string]$Path)
  return Invoke-RestMethod -Uri "$baseUrl$Path" -Method Get -TimeoutSec 10 -ErrorAction Stop
}

function Clear-AgentManager {
  param(
    [string]$CompanyId,
    [string]$AgentId
  )

  $company = [Uri]::EscapeDataString($CompanyId)
  $agent = [Uri]::EscapeDataString($AgentId)
  $body = $utf8NoBom.GetBytes('{"reportsTo":null}')
  Invoke-RestMethod `
    -Uri "$baseUrl/api/agents/$agent`?companyId=$company" `
    -Method Patch `
    -ContentType "application/json; charset=utf-8" `
    -Body $body `
    -TimeoutSec 10 `
    -ErrorAction Stop | Out-Null
}

function Set-AgentDisplayRole {
  param(
    [string]$CompanyId,
    [string]$AgentId,
    [string]$Role
  )

  $company = [Uri]::EscapeDataString($CompanyId)
  $agent = [Uri]::EscapeDataString($AgentId)
  $body = $utf8NoBom.GetBytes((@{ role = $Role } | ConvertTo-Json -Compress))
  Invoke-RestMethod `
    -Uri "$baseUrl/api/agents/$agent`?companyId=$company" `
    -Method Patch `
    -ContentType "application/json; charset=utf-8" `
    -Body $body `
    -TimeoutSec 10 `
    -ErrorAction Stop | Out-Null
}

function Set-AgentModel {
  param(
    [string]$CompanyId,
    [string]$AgentId,
    [object]$AdapterConfig,
    [string]$Model
  )

  $company = [Uri]::EscapeDataString($CompanyId)
  $agent = [Uri]::EscapeDataString($AgentId)
  $config = $AdapterConfig | ConvertTo-Json -Depth 30 | ConvertFrom-Json
  if ($config.PSObject.Properties.Name -contains 'model') {
    $config.model = $Model
  } else {
    $config | Add-Member -NotePropertyName model -NotePropertyValue $Model
  }
  $body = $utf8NoBom.GetBytes((@{ adapterConfig = $config } | ConvertTo-Json -Depth 30 -Compress))
  Invoke-RestMethod `
    -Uri "$baseUrl/api/agents/$agent`?companyId=$company" `
    -Method Patch `
    -ContentType "application/json; charset=utf-8" `
    -Body $body `
    -TimeoutSec 10 `
    -ErrorAction Stop | Out-Null
}

$allowedSPSRoles = @("ceo", "cto", "cmo", "cfo", "security", "engineer", "designer", "pm", "qa", "devops", "researcher", "general")
$mappedCompanyId = $null
$displayRolesByAgentId = @{}
$modelsByAgentId = @{}
if (Test-Path -LiteralPath $RoleMapPath -PathType Leaf) {
  $roleMap = Get-Content -Raw -Encoding UTF8 -LiteralPath $RoleMapPath | ConvertFrom-Json
  $mappedCompanyId = [string]$roleMap.companyId
  foreach ($entry in @($roleMap.agents)) {
    $displayRole = [string]$entry.spsRole
    if ([string]::IsNullOrWhiteSpace($displayRole)) { continue }
    if ($displayRole -notin $allowedSPSRoles) {
      throw "Invalid paperclipRole '$displayRole' for $($entry.name) in $RoleMapPath"
    }
    $displayRolesByAgentId[[string]$entry.id] = $displayRole
    $model = [string]$entry.model
    if (-not [string]::IsNullOrWhiteSpace($model)) {
      $modelsByAgentId[[string]$entry.id] = $model
    }
  }
}

$companiesResponse = Invoke-SPSGet -Path "/api/companies"
$companies = @($companiesResponse | ForEach-Object { $_ })
$checkedCount = 0
$updatedCount = 0
$displayRoleUpdatedCount = 0
$modelUpdatedCount = 0
$activeCompanyCount = 0

foreach ($company in $companies) {
  if ($company.archivedAt -or $company.status -eq "archived") { continue }
  $activeCompanyCount++
  $companyId = [string]$company.id
  $agentsResponse = Invoke-SPSGet -Path "/api/companies/$([Uri]::EscapeDataString($companyId))/agents"
  # Windows PowerShell can preserve a REST JSON array as one pipeline object.
  # Re-emitting it here guarantees one Agent per loop iteration.
  $agents = @($agentsResponse | ForEach-Object { $_ })

  foreach ($agent in $agents) {
    if ($agent.status -eq "terminated") { continue }
    $checkedCount++
    $agentId = [string]$agent.id
    if (-not [string]::IsNullOrWhiteSpace([string]$agent.reportsTo)) {
      Clear-AgentManager -CompanyId $companyId -AgentId $agentId
      $updatedCount++
    }
    if ($companyId -eq $mappedCompanyId -and $displayRolesByAgentId.ContainsKey($agentId)) {
      $desiredRole = [string]$displayRolesByAgentId[$agentId]
      if ([string]$agent.role -ne $desiredRole) {
        Set-AgentDisplayRole -CompanyId $companyId -AgentId $agentId -Role $desiredRole
        $displayRoleUpdatedCount++
      }
    }
    if ($companyId -eq $mappedCompanyId -and $modelsByAgentId.ContainsKey($agentId)) {
      $desiredModel = [string]$modelsByAgentId[$agentId]
      if ([string]$agent.adapterConfig.model -ne $desiredModel) {
        Set-AgentModel -CompanyId $companyId -AgentId $agentId -AdapterConfig $agent.adapterConfig -Model $desiredModel
        $modelUpdatedCount++
      }
    }
  }
}

return [pscustomobject]@{
  ready = $true
  companyCount = $activeCompanyCount
  checkedCount = $checkedCount
  updatedCount = $updatedCount
  displayRoleUpdatedCount = $displayRoleUpdatedCount
  modelUpdatedCount = $modelUpdatedCount
}
