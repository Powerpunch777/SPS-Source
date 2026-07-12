param(
  [Parameter(Mandatory = $true)]
  [string]$IssueId,

  [Parameter(Mandatory = $true)]
  [ValidateSet("todo", "in_progress", "blocked", "in_review", "done", "cancelled")]
  [string]$Status,

  [switch]$AllowBoardWriteToAssignedIssue,

  [string]$BaseUrl = $(if ($env:PAPERCLIP_API_URL) { $env:PAPERCLIP_API_URL } else { "http://127.0.0.1:3100" }),

  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\PaperclipApiUtf8.ps1"

$payload = @{
  status = $Status
}

Assert-PaperclipBoardWriteAllowed `
  -IssueId $IssueId `
  -Operation "status update" `
  -BaseUrl $BaseUrl `
  -AllowBoardWriteToAssignedIssue:$AllowBoardWriteToAssignedIssue `
  -DryRun:$DryRun

Invoke-PaperclipApiUtf8 -Method "PATCH" -Path "/api/issues/$IssueId" -Body $payload -BaseUrl $BaseUrl -DryRun:$DryRun
