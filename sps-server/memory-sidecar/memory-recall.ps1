param(
  [Parameter(Mandatory = $true)]
  [string]$Query,

  [string]$Scope = "",

  [int]$Limit = 10,

  [string]$CompanyId = "",

  [string]$ProjectId = "",

  [string]$AgentId = "",

  [string]$BaseUrl = "http://127.0.0.1:3188"
)

$ErrorActionPreference = "Stop"

try {
  $encodedQuery = [Uri]::EscapeDataString($Query)
  $uri = "$BaseUrl/memory/search?q=$encodedQuery&limit=$Limit"
  if ($Scope.Trim().Length -gt 0) {
    $uri += "&scope=$([Uri]::EscapeDataString($Scope))"
  }
  if ($CompanyId.Trim().Length -gt 0) {
    $uri += "&companyId=$([Uri]::EscapeDataString($CompanyId))"
  }
  if ($ProjectId.Trim().Length -gt 0) {
    $uri += "&projectId=$([Uri]::EscapeDataString($ProjectId))"
  }
  if ($AgentId.Trim().Length -gt 0) {
    $uri += "&agentId=$([Uri]::EscapeDataString($AgentId))"
  }

  $result = Invoke-RestMethod -Uri $uri -Method Get

  "# Memory Recall"
  ""
  "Query: $Query"
  "Scope: $(if ($Scope) { $Scope } else { 'all' })"
  "Results: $($result.items.Count)"
  ""

  $index = 1
  foreach ($item in $result.items) {
    "## $index. $($item.section)"
    ""
    "- Date: $($item.date)"
    "- Scope: $($item.scope)"
    "- Source: $($item.provenance.path):$($item.provenance.lineStart)"
    "- Score: $($item.score)"
    ""
    "$($item.text)"
    ""
    $index += 1
  }

  if ($result.items.Count -eq 0) {
    "No matching approved memory found. Continue from current task context and source files."
  }
} catch {
  "# Memory Recall Unavailable"
  ""
  "The memory sidecar did not respond: $($_.Exception.Message)"
  ""
  "Continue using available `LEARNINGS.md`, task comments, documents, and source files."
}
