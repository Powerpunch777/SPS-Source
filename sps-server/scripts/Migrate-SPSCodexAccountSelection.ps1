param(
  [string]$SPSApiUrl = "http://127.0.0.1:3100",
  [string]$CompanyId = "181e1bf7-3390-4b8d-8507-b736a03e444b"
)

$ErrorActionPreference = "Stop"

function Read-PlainValue($value) {
  if ($value -is [string]) { return $value }
  if ($null -ne $value -and $null -ne $value.value) { return [string]$value.value }
  return ""
}

$homeRoot = [Environment]::GetFolderPath("UserProfile")
$agentsResponse = Invoke-RestMethod -Method Get -Uri "$SPSApiUrl/api/companies/$CompanyId/agents"
$agents = @($agentsResponse)
$changed = 0

foreach ($agent in $agents | Where-Object { $_.adapterType -eq "codex_local" }) {
  $config = @{}
  foreach ($property in $agent.adapterConfig.PSObject.Properties) {
    $config[$property.Name] = $property.Value
  }
  if ($config.codexAccount) { continue }

  $profile = ".codex"
  $configuredHome = Read-PlainValue $config.env.CODEX_HOME
  if ($configuredHome) {
    $resolvedHome = [IO.Path]::GetFullPath($configuredHome)
    $prefix = [IO.Path]::GetFullPath($homeRoot).TrimEnd([char[]]@('\', '/')) + '\'
    if ($resolvedHome.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      $candidate = Split-Path -Leaf $resolvedHome
      if ($candidate -match '^\.codex(?:-[A-Za-z0-9._-]+)?$') { $profile = $candidate }
    }
  }

  $config.codexAccount = $profile
  $body = @{ adapterConfig = $config; replaceAdapterConfig = $true } | ConvertTo-Json -Depth 20
  $agentUrl = "${SPSApiUrl}/api/agents/$($agent.id)?companyId=${CompanyId}"
  Invoke-RestMethod -Method Patch -Uri $agentUrl -ContentType "application/json" -Body $body | Out-Null
  $changed += 1
  Write-Output "Assigned $($agent.name) to $profile"
}

Write-Output "Codex account selection migration complete: $changed agent(s) updated."
