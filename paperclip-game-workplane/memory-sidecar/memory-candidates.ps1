param(
  [int]$Limit = 20,

  [int]$Offset = 0,

  [string]$Scope = "",

  [string]$IssueId = "",

  [string]$ProjectId = "",

  [string]$AgentId = "",

  [string]$ConfigPath = "",

  [string]$BaseUrl = "http://127.0.0.1:3188"
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\MemoryCandidateReview.ps1"

$safeLimit = [Math]::Max(1, [Math]::Min(100, $Limit))
$safeOffset = [Math]::Max(0, $Offset)
$uri = "$BaseUrl/memory/candidates?limit=$safeLimit&offset=$safeOffset"
if ($IssueId) { $uri += "&issueId=$([Uri]::EscapeDataString($IssueId))" }
if ($ProjectId) { $uri += "&projectId=$([Uri]::EscapeDataString($ProjectId))" }
if ($AgentId) { $uri += "&agentId=$([Uri]::EscapeDataString($AgentId))" }
$usedFallback = $false

try {
  $response = Invoke-RestMethod -Uri $uri -Method Get
} catch {
  $usedFallback = $true
  $config = Read-MemoryReviewConfig -ConfigPath $ConfigPath
  $fileCandidates = @(Get-MemoryCandidatesFromFile -Config $config)
  if ($IssueId) { $fileCandidates = @($fileCandidates | Where-Object { $_.issueId -eq $IssueId }) }
  if ($ProjectId) { $fileCandidates = @($fileCandidates | Where-Object { $_.projectId -eq $ProjectId }) }
  if ($AgentId) { $fileCandidates = @($fileCandidates | Where-Object { $_.agentId -eq $AgentId }) }
  $response = [pscustomobject]@{
    candidates = @($fileCandidates | Select-Object -Skip $safeOffset -First $safeLimit)
    total = $fileCandidates.Count
    limit = $safeLimit
    offset = $safeOffset
    warnings = @("Sidecar unavailable; read candidates from local JSONL fallback: $($_.Exception.Message)")
  }
}

$candidates = @($response.candidates | Where-Object { $null -ne $_ })
if ($Scope) {
  $candidates = @($candidates | Where-Object { $_.scope -eq $Scope })
}

$eventMap = @{}
try {
  $configForEvents = if ($config) { $config } else { Read-MemoryReviewConfig -ConfigPath $ConfigPath }
  $eventMap = Get-LatestMemoryCandidateEventMap -Config $configForEvents
} catch {
  $eventMap = @{}
}

"# Memory Candidate Inbox"
""
"Total: $($response.total)"
"Returned: $($candidates.Count)"
"Limit: $safeLimit"
"Offset: $safeOffset"
if ($usedFallback) {
  "Source: local JSONL fallback"
}
if ($Scope) {
  "Scope Filter: $Scope"
}
if ($IssueId) {
  "Issue ID Filter: $IssueId"
}
if ($ProjectId) {
  "Project ID Filter: $ProjectId"
}
if ($AgentId) {
  "Agent ID Filter: $AgentId"
}
if ($response.warnings -and @($response.warnings).Count -gt 0) {
  "Warnings: $(@($response.warnings) -join '; ')"
}
""

if ($candidates.Count -eq 0) {
  "No memory candidates found."
  exit 0
}

$index = 1
foreach ($candidate in $candidates) {
  $source = $candidate.source
  $latestEvent = $eventMap[[string]$candidate.id]
  $sourceSummary = if ($source) {
    $sourceParts = @()
    if ($source.kind) { $sourceParts += "kind=$($source.kind)" }
    if ($source.identifier) { $sourceParts += "identifier=$($source.identifier)" }
    if ($source.id) { $sourceParts += "id=$($source.id)" }
    $sourceParts -join ", "
  } else {
    "unknown"
  }

  "## $index. $($candidate.id)"
  ""
  "- Status: $($candidate.status)"
  "- Scope: $($candidate.scope)"
  "- Type: $($candidate.type)"
  "- Created At: $($candidate.createdAt)"
  if ($latestEvent) {
    "- Review Status: $($latestEvent.action)"
    "- Review Event: $($latestEvent.id)"
  } else {
    "- Review Status: unreviewed"
  }
  "- Issue ID: $($candidate.issueId)"
  "- Source: $sourceSummary"
  "- Tags: $(@($candidate.tags) -join ', ')"
  ""
  "$($candidate.content)"
  ""
  $index += 1
}
