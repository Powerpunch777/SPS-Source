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

  [string]$WorkspacePath = "C:\Users\young\Documents\paperclip-game-workplane",

  [string]$BaseUrl = $(if ($env:PAPERCLIP_API_URL) { $env:PAPERCLIP_API_URL } else { "http://127.0.0.1:3100" }),

  [switch]$MarkDone,

  [switch]$ProposeCandidates,

  [string]$MemorySidecarUrl = $(if ($env:MEMORY_SIDECAR_URL) { $env:MEMORY_SIDECAR_URL } else { "http://127.0.0.1:3188" }),

  [string]$MemoryCandidateScope = "project",

  [string]$MemoryCandidateType = "learning",

  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$scriptsRoot = $PSScriptRoot
. "$scriptsRoot\PaperclipApiUtf8.ps1"

if ($Description -and $DescriptionPath) {
  throw "Use either -Description or -DescriptionPath, not both."
}

if (-not $Description -and -not $DescriptionPath) {
  throw "Provide -Description or -DescriptionPath."
}

$parentContext = & "$scriptsRoot\Resolve-DirectTaskAgentDeskParent.ps1" `
  -ParentId $ParentId `
  -CompanyId $CompanyId `
  -ProjectId $ProjectId `
  -GoalId $GoalId `
  -BaseUrl $BaseUrl
$resolvedGoalId = $parentContext.resolvedGoalId

$issueArgs = @{
  CompanyId = $CompanyId
  Title = $Title
  Priority = "low"
  WorkMode = "standard"
  BaseUrl = $BaseUrl
}

if ($DescriptionPath) { $issueArgs.DescriptionPath = $DescriptionPath }
if ($Description) { $issueArgs.Description = $Description }
if ($ProjectId) { $issueArgs.ProjectId = $ProjectId }
if ($resolvedGoalId) { $issueArgs.GoalId = $resolvedGoalId }
if ($ParentId) { $issueArgs.ParentId = $ParentId }

if ($DryRun) {
  $issueDryRun = & "$scriptsRoot\New-PaperclipIssueUtf8.ps1" @issueArgs -DryRun
  [pscustomobject]@{
    mode = "dry-run"
    wouldCreate = $issueDryRun
    wouldAssignAgent = $false
    wouldRunDirectAgy = $true
    wouldMarkDone = [bool]$MarkDone
    wouldProposeCandidates = [bool]$ProposeCandidates
  }
  exit 0
}

$created = & "$scriptsRoot\New-PaperclipIssueUtf8.ps1" @issueArgs

if ($created.assigneeAgentId) {
  throw "Refusing to run direct agy workflow on an assigned issue. Created issue unexpectedly has assigneeAgentId=$($created.assigneeAgentId)"
}

$runnerResult = & "$scriptsRoot\Invoke-AgyDirectTask.ps1" -IssueId $created.id -WorkspacePath $WorkspacePath -BaseUrl $BaseUrl -MarkDone:$MarkDone -ProposeCandidates:$ProposeCandidates -MemorySidecarUrl $MemorySidecarUrl -MemoryCandidateScope $MemoryCandidateScope -MemoryCandidateType $MemoryCandidateType
$live = & "$scriptsRoot\Get-PaperclipLiveRunsUtf8.ps1" -IssueId $created.id -BaseUrl $BaseUrl
$finalIssue = Invoke-PaperclipApiUtf8 -Method "GET" -Path "/api/issues/$($created.id)" -BaseUrl $BaseUrl

[pscustomobject]@{
  issueId = $created.id
  identifier = $created.identifier
  title = $finalIssue.title
  status = $finalIssue.status
  assigneeAgentId = $finalIssue.assigneeAgentId
  runnerExitCode = $runnerResult.exitCode
  commentPosted = $runnerResult.posted
  markedDone = $runnerResult.markedDone
  liveRunCount = $live.count
  outputPath = $runnerResult.outputPath
  memoryCandidateRequested = $runnerResult.memoryCandidateRequested
  memoryCandidateFound = $runnerResult.memoryCandidateFound
  memoryCandidatePosted = $runnerResult.memoryCandidatePosted
  memoryCandidateId = $runnerResult.memoryCandidateId
  memoryCandidateError = $runnerResult.memoryCandidateError
}
