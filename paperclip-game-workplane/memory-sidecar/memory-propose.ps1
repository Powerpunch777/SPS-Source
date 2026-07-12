param(
  [Parameter(Mandatory = $true)]
  [string]$Content,

  [string]$Scope = "project",

  [string]$Type = "learning",

  [string]$SourceKind = "task_comment",

  [string]$SourceId = "",

  [string[]]$Tags = @(),

  [string]$CompanyId = "",

  [string]$ProjectId = "",

  [string]$AgentId = "",

  [string]$IssueId = "",

  [string]$BaseUrl = "http://127.0.0.1:3188"
)

$ErrorActionPreference = "Stop"

$bodyObj = [ordered]@{
  scope = $Scope
  type = $Type
  content = $Content
  source = @{
    kind = $SourceKind
    id = $SourceId
  }
  tags = $Tags
}

if ($CompanyId) { $bodyObj.companyId = $CompanyId }
if ($ProjectId) { $bodyObj.projectId = $ProjectId }
if ($AgentId) { $bodyObj.agentId = $AgentId }
if ($IssueId) { $bodyObj.issueId = $IssueId }

$body = $bodyObj | ConvertTo-Json -Depth 8

try {
  $result = Invoke-RestMethod -Uri "$BaseUrl/memory/candidates" -Method Post -ContentType "application/json; charset=utf-8" -Body $body
  "# Memory Candidate Proposed"
  ""
  "- Candidate ID: $($result.candidate.id)"
  "- Scope: $($result.candidate.scope)"
  "- Type: $($result.candidate.type)"
  "- Created At: $($result.candidate.createdAt)"
  ""
  "$($result.candidate.content)"
} catch {
  "# Memory Candidate Fallback"
  ""
  "The memory sidecar did not accept the candidate: $($_.Exception.Message)"
  ""
  "Put this under `Memory candidates` in the task close summary instead:"
  ""
  "- Scope: $Scope"
  "- Type: $Type"
  "- Content: $Content"
}
