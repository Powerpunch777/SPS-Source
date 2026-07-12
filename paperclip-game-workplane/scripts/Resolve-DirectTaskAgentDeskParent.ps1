<#
.SYNOPSIS
  Validates and resolves an Agent Room parent for a direct Task Room.
.DESCRIPTION
  A direct external worker may only create a child Task Room under an open,
  unassigned root Agent Room in the same company and project. The parent goal is
  inherited when the caller does not supply one. This script is read-only.
#>
param(
  [string]$ParentId,

  [string]$CompanyId,

  [string]$ProjectId,

  [string]$GoalId,

  [string]$BaseUrl = $(if ($env:PAPERCLIP_API_URL) { $env:PAPERCLIP_API_URL } else { 'http://127.0.0.1:3100' })
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\PaperclipApiUtf8.ps1"

if (-not $ParentId) {
  return [pscustomobject]@{
    parent = $null
    resolvedGoalId = $GoalId
  }
}

if (-not $CompanyId -or -not $ProjectId) {
  throw 'ParentId requires both CompanyId and ProjectId.'
}

$parent = Invoke-PaperclipApiUtf8 -Method 'GET' -Path "/api/issues/$ParentId" -BaseUrl $BaseUrl
if ($parent.companyId -ne $CompanyId) {
  throw 'Parent Agent Room belongs to a different company.'
}
if ($parent.projectId -ne $ProjectId) {
  throw 'Parent Agent Room belongs to a different project.'
}
if ($parent.parentId) {
  throw 'Parent Agent Room must be a root Project Hub issue.'
}
if ($parent.title -notmatch '^\[Agent Room\] ') {
  throw 'Parent issue is not an Agent Room.'
}
if ($parent.status -in @('done', 'cancelled')) {
  throw 'Parent Agent Room is closed.'
}
if ($parent.assigneeAgentId) {
  throw 'Parent Agent Room must remain unassigned for direct external work.'
}
if ($GoalId -and $parent.goalId -and $GoalId -ne $parent.goalId) {
  throw 'GoalId does not match the parent Agent Room goal.'
}

[pscustomobject]@{
  parent = $parent
  resolvedGoalId = if ($GoalId) { $GoalId } else { $parent.goalId }
}
