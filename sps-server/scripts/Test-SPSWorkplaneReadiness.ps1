param(
  [string]$CompanyId = "181e1bf7-3390-4b8d-8507-b736a03e444b",

  [string[]]$RequiredAgentIds = @(
    "dfdde6a7-ae30-43f8-8b65-593c7eecf171",
    "bb309102-69c4-4566-9a4d-07e7882945d8"
  ),

  [string]$BaseUrl = $(if ($env:PAPERCLIP_API_URL) { $env:PAPERCLIP_API_URL } else { "http://127.0.0.1:3100" }),

  [string]$MemorySidecarUrl = $(if ($env:MEMORY_SIDECAR_URL) { $env:MEMORY_SIDECAR_URL } else { "http://127.0.0.1:3188" }),

  [string]$MemorySidecarConfigPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "memory-sidecar\config.local.json"),

  [switch]$AsMarkdown
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\SPSApiUtf8.ps1"

$blockers = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Add-ReadinessLine {
  param(
    [System.Collections.Generic.List[string]]$Target,
    [string]$Message
  )
  if (-not [string]::IsNullOrWhiteSpace($Message)) {
    $Target.Add($Message) | Out-Null
  }
}

function Test-AgentReady {
  param([object]$Agent)

  if ($null -eq $Agent) {
    return $false
  }

  if ($Agent.status -in @("error", "paused", "disabled")) {
    return $false
  }

  return $true
}

function Get-MemorySidecarHealthHeaders {
  param([string]$ConfigPath)

  $token = [string]$env:MEMORY_SIDECAR_TOKEN
  if ([string]::IsNullOrWhiteSpace($token) -and (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
    $config = Get-Content -Raw -Encoding UTF8 -LiteralPath $ConfigPath | ConvertFrom-Json
    $token = [string]$config.security.token
  }
  if ([string]::IsNullOrWhiteSpace($token)) { return @{} }
  return @{ "x-sidecar-token" = $token }
}

$sps = [ordered]@{
  ok = $false
  error = $null
}

$agents = @()
$liveRunCount = $null
$sidecar = [ordered]@{
  ok = $false
  approvedMemoryCount = $null
  candidateCount = $null
  warningCount = $null
  error = $null
}

try {
  $agentsResponse = Invoke-SPSApiUtf8 -Method "GET" -Path "/api/companies/$CompanyId/agents" -BaseUrl $BaseUrl
  $allAgents = if ($agentsResponse.PSObject.Properties.Name -contains "value") {
    @($agentsResponse.value | Where-Object { $null -ne $_ })
  } else {
    @($agentsResponse | Where-Object { $null -ne $_ })
  }
  $sps.ok = $true

  foreach ($agentId in $RequiredAgentIds) {
    $agent = $allAgents | Where-Object { $_.id -eq $agentId } | Select-Object -First 1
    if ($null -eq $agent) {
      Add-ReadinessLine -Target $blockers -Message "Required agent not found: $agentId"
      $agents += [pscustomobject]@{
        id = $agentId
        name = $null
        role = $null
        status = "missing"
        adapterType = $null
        errorReason = "not found"
        ready = $false
      }
      continue
    }

    $ready = Test-AgentReady -Agent $agent
    if (-not $ready) {
      Add-ReadinessLine -Target $blockers -Message "Agent '$($agent.name)' is not ready: status=$($agent.status); error=$($agent.errorReason)"
    }

    $agents += [pscustomobject]@{
      id = $agent.id
      name = $agent.name
      role = $agent.role
      status = $agent.status
      adapterType = $agent.adapterType
      errorReason = $agent.errorReason
      ready = $ready
    }
  }

  $liveRuns = Invoke-SPSApiUtf8 -Method "GET" -Path "/api/companies/$CompanyId/live-runs" -BaseUrl $BaseUrl
  $liveRows = if ($liveRuns.PSObject.Properties.Name -contains "value") {
    @($liveRuns.value | Where-Object { $null -ne $_ })
  } else {
    @($liveRuns | Where-Object { $null -ne $_ })
  }
  $liveRunCount = $liveRows.Count
  if ($liveRunCount -gt 0) {
    Add-ReadinessLine -Target $warnings -Message "Company has $liveRunCount live run(s). Avoid starting another smoke test until they are understood."
  }
} catch {
  $sps.error = $_.Exception.Message
  Add-ReadinessLine -Target $blockers -Message "SPS API unavailable: $($_.Exception.Message)"
}

try {
  $sidecarHealthHeaders = Get-MemorySidecarHealthHeaders -ConfigPath $MemorySidecarConfigPath
  $health = Invoke-RestMethod -Uri "$MemorySidecarUrl/health" -Method Get -Headers $sidecarHealthHeaders -TimeoutSec 5
  $sidecar.ok = [bool]$health.ok
  $sidecar.approvedMemoryCount = $health.approvedMemoryCount
  $sidecar.candidateCount = $health.candidateCount
  $sidecar.warningCount = $health.warningCount
  if (-not $sidecar.ok) {
    Add-ReadinessLine -Target $blockers -Message "Memory Sidecar health did not return ok=true."
  }
  if ([int]$sidecar.warningCount -gt 0) {
    Add-ReadinessLine -Target $warnings -Message "Memory Sidecar reports warningCount=$($sidecar.warningCount)."
  }
} catch {
  $sidecar.error = $_.Exception.Message
  Add-ReadinessLine -Target $blockers -Message "Memory Sidecar unavailable: $($_.Exception.Message)"
}

$result = [pscustomobject]@{
  ready = ($blockers.Count -eq 0)
  checkedAt = (Get-Date).ToUniversalTime().ToString("o")
  companyId = $CompanyId
  sps = [pscustomobject]$sps
  memorySidecar = [pscustomobject]$sidecar
  liveRunCount = $liveRunCount
  agents = $agents
  blockers = @($blockers)
  warnings = @($warnings)
}

if (-not $AsMarkdown) {
  $result
  exit 0
}

"# SPS Workplane Readiness"
""
"Ready: $($result.ready)"
"Checked At: $($result.checkedAt)"
"Company: $CompanyId"
""
"## Services"
""
"- SPS: ok=$($result.sps.ok)"
if ($result.sps.error) {
  "  - Error: $($result.sps.error)"
}
"- Memory Sidecar: ok=$($result.memorySidecar.ok), approved=$($result.memorySidecar.approvedMemoryCount), candidates=$($result.memorySidecar.candidateCount), warnings=$($result.memorySidecar.warningCount)"
if ($result.memorySidecar.error) {
  "  - Error: $($result.memorySidecar.error)"
}
"- Company Live Runs: $($result.liveRunCount)"
""
"## Required Agents"
""
foreach ($agent in $result.agents) {
  "- $($agent.name) [$($agent.role)] status=$($agent.status), adapter=$($agent.adapterType), ready=$($agent.ready)"
  if ($agent.errorReason) {
    "  - Error: $($agent.errorReason)"
  }
}
""
"## Blockers"
""
if ($result.blockers.Count -eq 0) {
  "- None"
} else {
  foreach ($item in $result.blockers) {
    "- $item"
  }
}
""
"## Warnings"
""
if ($result.warnings.Count -eq 0) {
  "- None"
} else {
  foreach ($item in $result.warnings) {
    "- $item"
  }
}
