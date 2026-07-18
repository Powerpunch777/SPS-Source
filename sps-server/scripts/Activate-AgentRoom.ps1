param(
  [Parameter(Mandatory = $true)]
  [string]$CompanyId,

  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [Parameter(Mandatory = $true)]
  [string]$AssigneeAgentId,

  [Parameter(Mandatory = $true)]
  [string]$IssueId,

  [switch]$Apply,

  [switch]$AcknowledgePotentialAgentRun,

  [string]$BaseUrl = $(if ($env:PAPERCLIP_API_URL) { $env:PAPERCLIP_API_URL } else { "http://127.0.0.1:3100" })
)

$ErrorActionPreference = "Stop"

# Load the core SPS API utilities
$scriptsRoot = $PSScriptRoot
. "$scriptsRoot\SPSApiUtf8.ps1"
Set-SPSUtf8 | Out-Null

# 1. Enforce safety checks / read-only constraint
if ($Apply) {
  Write-Error "Safety Violation: Write activation is unsupported and disabled. The current SPS scheduler automatically schedules assigned issues as in_progress regardless of their initial blocked state. Non-waking rooms cannot be safely activated. This tool is now a read-only diagnostic."
  exit 1
}

# 2. Retrieve the existing room from SPS
try {
  $issue = Invoke-SPSApiUtf8 -Method "GET" -Path "/api/issues/$IssueId" -BaseUrl $BaseUrl
} catch {
  throw "Validation Error: Failed to fetch issue with ID '$IssueId'. Ensure SPS is running on $BaseUrl. Error: $($_.Exception.Message)"
}

if ($null -eq $issue) {
  throw "Validation Error: Issue with ID '$IssueId' was not found."
}

# 3. Perform strict validations (Fail Closed)
if ($issue.projectId -ne $ProjectId) {
  throw "Validation Error: Issue Project ID '$($issue.projectId)' does not match expected Project ID '$ProjectId'."
}

if ($issue.assigneeAgentId -ne $AssigneeAgentId) {
  throw "Validation Error: Issue assignee agent ID '$($issue.assigneeAgentId)' does not match expected Assignee Agent ID '$AssigneeAgentId'."
}

if (-not $issue.title.StartsWith("[Agent Room]")) {
  throw "Validation Error: Issue title '$($issue.title)' does not match the Agent Room title convention '[Agent Room]*'."
}

if ($issue.status -ne "blocked") {
  throw "Validation Error: Issue status is '$($issue.status)', expected 'blocked' to proceed with activation."
}

# 4. Output plans and warn of consequences
Write-Host "============================================="
Write-Host "   Agent Room Activation Diagnostic (Read-Only)   "
Write-Host "============================================="
Write-Host "Company ID:       $CompanyId"
Write-Host "Project ID:       $ProjectId"
Write-Host "Issue ID:         $IssueId"
Write-Host "Issue Title:      $($issue.title)"
Write-Host "Agent Assignee:   $AssigneeAgentId"
Write-Host "Current Status:   $($issue.status)"
Write-Host "Target Status:    backlog (UNSUPPORTED)"
Write-Host "Consequences:     CRITICAL WARNING: The current SPS scheduler automatically schedules" -ForegroundColor Red
Write-Host "                  blocked assigned issues as in_progress. Live evidence (CMP-39/CMP-41)" -ForegroundColor Red
Write-Host "                  proves that a non-waking Agent Room is NOT supported. Activation is disabled." -ForegroundColor Red
Write-Host "---------------------------------------------"

# 5. Execution phase (Read-Only Diagnostic)
Write-Host "[DIAGNOSTIC] Read-only verification completed." -ForegroundColor Cyan
Write-Host "WARNING: Creating or activating a non-waking/blocked assigned Agent Room is unsupported by the SPS scheduler." -ForegroundColor Red
Write-Host "Any write action (-Apply) has been disabled to prevent accidental agent execution." -ForegroundColor Red

$planResult = [pscustomobject]@{
  CompanyId = $CompanyId
  ProjectId = $ProjectId
  IssueId = $IssueId
  IssueTitle = $issue.title
  AgentId = $AssigneeAgentId
  CurrentStatus = $issue.status
  TargetStatus = "backlog"
  Action = "DryRun"
}
return $planResult
