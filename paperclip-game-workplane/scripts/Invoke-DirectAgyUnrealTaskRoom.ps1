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

  [string]$WorkspacePath = $null,

  [string]$ProjectFile = $null,

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

# --- 1. Dynamic Discovery and Path Resolution ---
$validation = & "$scriptsRoot\Resolve-UnrealWorkspace.ps1" -WorkspacePath $WorkspacePath -ProjectFile $ProjectFile
$resolvedWorkspace = $validation.WorkspacePath
$uprojectPath = $validation.ProjectFile

# Ensure the description is loaded
$descriptionText = $null
if ($DescriptionPath) {
  $descriptionText = Read-PaperclipUtf8Text -Path $DescriptionPath
} else {
  $descriptionText = $Description
}

# Prepare issue creation parameters
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

# --- 3. Dry-Run Execution Path ---
if ($DryRun) {
  $issueDryRun = & "$scriptsRoot\New-PaperclipIssueUtf8.ps1" @issueArgs -DryRun
  
  $mockIssue = @{
    id = "dry-run-issue-id"
    identifier = "CMP-DRYRUN"
    title = $Title
    description = $descriptionText
    companyId = $CompanyId
    projectId = $ProjectId
    parentId = $ParentId
    goalId = $resolvedGoalId
    status = "backlog"
  }

  $taskArgs = @{
    IssueId = "dry-run-issue-id"
    MockIssue = $mockIssue
    MockParentIssue = $parentContext.parent
    WorkspacePath = $resolvedWorkspace
    Unreal = $true
    ProjectFile = $uprojectPath
    DryRun = $true
    BaseUrl = $BaseUrl
    MarkDone = [bool]$MarkDone
    ProposeCandidates = [bool]$ProposeCandidates
    MemorySidecarUrl = $MemorySidecarUrl
    MemoryCandidateScope = $MemoryCandidateScope
    MemoryCandidateType = $MemoryCandidateType
  }

  $runnerResult = & "$scriptsRoot\Invoke-AgyDirectTask.ps1" @taskArgs

  [pscustomobject]@{
    mode = "dry-run"
    wouldCreate = $issueDryRun
    wouldAssignAgent = $false
    wouldRunDirectAgy = $true
    wouldMarkDone = [bool]$MarkDone
    wouldProposeCandidates = [bool]$ProposeCandidates
    runnerResult = $runnerResult
    liveRunCount = 0
  }
  exit 0
}

# --- 4. Live Execution Path ---
$created = & "$scriptsRoot\New-PaperclipIssueUtf8.ps1" @issueArgs

if ($created.assigneeAgentId) {
  throw "Refusing to run direct agy workflow on an assigned issue. Created issue unexpectedly has assigneeAgentId=$($created.assigneeAgentId)"
}

$taskArgs = @{
  IssueId = $created.id
  WorkspacePath = $resolvedWorkspace
  Unreal = $true
  ProjectFile = $uprojectPath
  BaseUrl = $BaseUrl
  MarkDone = [bool]$MarkDone
  ProposeCandidates = [bool]$ProposeCandidates
  MemorySidecarUrl = $MemorySidecarUrl
  MemoryCandidateScope = $MemoryCandidateScope
  MemoryCandidateType = $MemoryCandidateType
}

$runnerResult = & "$scriptsRoot\Invoke-AgyDirectTask.ps1" @taskArgs

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
