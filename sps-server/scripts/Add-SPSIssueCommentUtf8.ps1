param(
  [Parameter(Mandatory = $true)]
  [string]$IssueId,

  [string]$Body,

  [string]$BodyPath,

  [switch]$Resume,

  [switch]$AllowBoardWriteToAssignedIssue,

  [string]$BaseUrl = $(if ($env:PAPERCLIP_API_URL) { $env:PAPERCLIP_API_URL } else { "http://127.0.0.1:3100" }),

  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\SPSApiUtf8.ps1"

if ($Body -and $BodyPath) {
  throw "Use either -Body or -BodyPath, not both."
}

if ($BodyPath) {
  $text = Read-SPSUtf8Text -Path $BodyPath
} elseif ($Body) {
  $text = $Body
} else {
  throw "Provide -Body or -BodyPath. Use -BodyPath for Korean text, Markdown, or literal backticks."
}

if ([string]::IsNullOrWhiteSpace($text)) {
  throw "Comment body is empty."
}

$payload = @{
  body = $text
}

if ($Resume) {
  $payload.resume = $true
}

Assert-SPSBoardWriteAllowed `
  -IssueId $IssueId `
  -Operation "comment write" `
  -BaseUrl $BaseUrl `
  -AllowBoardWriteToAssignedIssue:$AllowBoardWriteToAssignedIssue `
  -DryRun:$DryRun

Invoke-SPSApiUtf8 -Method "POST" -Path "/api/issues/$IssueId/comments" -Body $payload -BaseUrl $BaseUrl -DryRun:$DryRun
