param(
  [Parameter(Mandatory = $true)]
  [string]$CompanyId,

  [Parameter(Mandatory = $true)]
  [string]$Title,

  [string]$Description,

  [string]$DescriptionPath,

  [string]$ProjectId,

  [string]$GoalId,

  [string]$ParentId,

  [string]$AssigneeAgentId,

  [ValidateSet("low", "medium", "high", "urgent")]
  [string]$Priority = "low",

  [ValidateSet("standard", "ask", "planning")]
  [string]$WorkMode = "standard",

  [string]$BaseUrl = $(if ($env:PAPERCLIP_API_URL) { $env:PAPERCLIP_API_URL } else { "http://127.0.0.1:3100" }),

  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\PaperclipApiUtf8.ps1"

if ($Description -and $DescriptionPath) {
  throw "Use either -Description or -DescriptionPath, not both."
}

if ($DescriptionPath) {
  $descriptionText = Read-PaperclipUtf8Text -Path $DescriptionPath
} else {
  $descriptionText = $Description
}

$payload = @{
  title = $Title
  priority = $Priority
  workMode = $WorkMode
}

if ($descriptionText) { $payload.description = $descriptionText }
if ($ProjectId) { $payload.projectId = $ProjectId }
if ($GoalId) { $payload.goalId = $GoalId }
if ($ParentId) { $payload.parentId = $ParentId }
if ($AssigneeAgentId) { $payload.assigneeAgentId = $AssigneeAgentId }

Invoke-PaperclipApiUtf8 -Method "POST" -Path "/api/companies/$CompanyId/issues" -Body $payload -BaseUrl $BaseUrl -DryRun:$DryRun
